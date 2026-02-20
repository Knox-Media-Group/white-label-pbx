import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { storagePut, storageGet } from "./storage";
import * as telnyx from "./telnyx";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(buf, Buffer.from(key, "hex"));
}

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

// Customer procedure - for customer portal access
const customerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.customerId && ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    portalLogin: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const credential = await db.getLocalCredentialByUsername(input.username);
        if (!credential || !credential.isActive) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid username or password' });
        }
        const valid = await verifyPassword(input.password, credential.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid username or password' });
        }
        const customer = await db.getCustomerById(credential.customerId);
        if (!customer || customer.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer account is not active' });
        }
        await db.updateLocalCredentialLoginTime(credential.id);
        // Create a portal session by upserting a user record linked to the customer
        const portalOpenId = `portal_${credential.customerId}_${credential.id}`;
        await db.upsertUser({
          openId: portalOpenId,
          name: customer.name,
          email: customer.email,
          role: 'user',
          customerId: credential.customerId,
          lastSignedIn: new Date(),
        });
        const { sdk } = await import('./_core/sdk');
        const sessionToken = await sdk.createSessionToken(portalOpenId, {
          name: customer.name,
          expiresInMs: 1000 * 60 * 60 * 24, // 24 hours
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 1000 * 60 * 60 * 24 });
        return { success: true, customerId: credential.customerId };
      }),
  }),

  // ============ LOCAL CREDENTIALS MANAGEMENT ============
  localCredentials: router({
    list: adminProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input }) => {
        const creds = await db.getLocalCredentialsByCustomer(input.customerId);
        // Strip passwordHash from response
        return creds.map(({ passwordHash, ...rest }) => rest);
      }),

    create: adminProcedure
      .input(z.object({
        customerId: z.number(),
        username: z.string().min(1),
        password: z.string().min(8),
      }))
      .mutation(async ({ input }) => {
        const existing = await db.getLocalCredentialByUsername(input.username);
        if (existing) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Username already exists' });
        }
        const passwordHash = await hashPassword(input.password);
        const id = await db.createLocalCredential({
          customerId: input.customerId,
          username: input.username,
          passwordHash,
        });
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        password: z.string().min(8).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, password, ...data } = input;
        const updateData: Record<string, unknown> = { ...data };
        if (password) {
          updateData.passwordHash = await hashPassword(password);
        }
        await db.updateLocalCredential(id, updateData);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteLocalCredential(input.id);
        return { success: true };
      }),
  }),

  // ============ ADMIN: CUSTOMER MANAGEMENT ============
  customers: router({
    list: adminProcedure.query(async () => {
      return db.getAllCustomers();
    }),
    
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getCustomerById(input.id);
      }),
    
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        companyName: z.string().optional(),
        email: z.string().email(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await db.createCustomer({
          name: input.name,
          companyName: input.companyName || null,
          email: input.email,
          phone: input.phone || null,
          notes: input.notes || null,
          status: 'active',
        });
        return { id };
      }),
    
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        companyName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        status: z.enum(['active', 'suspended', 'pending', 'cancelled']).optional(),
        notes: z.string().optional(),
        telnyxConnectionId: z.string().optional(),
        telnyxApiKey: z.string().optional(),
        telnyxMessagingProfileId: z.string().optional(),
        // SMS Summary settings
        smsSummaryEnabled: z.boolean().optional(),
        notificationPhone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateCustomer(id, data);
        return { success: true };
      }),
    
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteCustomer(input.id);
        return { success: true };
      }),
    
    stats: adminProcedure.query(async () => {
      return db.getCustomerStats();
    }),
    
    updateBranding: adminProcedure
      .input(z.object({
        id: z.number(),
        brandingLogo: z.string().optional(),
        brandingPrimaryColor: z.string().optional(),
        brandingCompanyName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateCustomer(id, data);
        return { success: true };
      }),
  }),

  // ============ SIP ENDPOINTS ============
  sipEndpoints: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify access
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getSipEndpointsByCustomer(input.customerId);
      }),
    
    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getSipEndpointById(input.id);
      }),
    
    create: customerProcedure
      .input(z.object({
        customerId: z.number(),
        username: z.string().min(1),
        password: z.string().optional(),
        callerId: z.string().optional(),
        displayName: z.string().optional(),
        extensionNumber: z.string().optional(),
        callHandler: z.enum(['texml_webhooks', 'call_control', 'ai_agent', 'video_room']).optional(),
        callRequestUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const id = await db.createSipEndpoint({
          customerId: input.customerId,
          username: input.username,
          password: input.password || null,
          callerId: input.callerId || null,
          displayName: input.displayName || null,
          extensionNumber: input.extensionNumber || null,
          callHandler: input.callHandler || 'texml_webhooks',
          callRequestUrl: input.callRequestUrl || null,
          status: 'provisioning',
        });
        return { id };
      }),
    
    update: customerProcedure
      .input(z.object({
        id: z.number(),
        username: z.string().optional(),
        password: z.string().optional(),
        callerId: z.string().optional(),
        displayName: z.string().optional(),
        extensionNumber: z.string().optional(),
        status: z.enum(['active', 'inactive', 'provisioning']).optional(),
        callHandler: z.enum(['texml_webhooks', 'call_control', 'ai_agent', 'video_room']).optional(),
        callRequestUrl: z.string().optional(),
        telnyxCredentialId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateSipEndpoint(id, data);
        return { success: true };
      }),
    
    delete: customerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteSipEndpoint(input.id);
        return { success: true };
      }),
  }),

  // ============ PHONE NUMBERS ============
  phoneNumbers: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getPhoneNumbersByCustomer(input.customerId);
      }),
    
    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getPhoneNumberById(input.id);
      }),
    
    create: customerProcedure
      .input(z.object({
        customerId: z.number(),
        phoneNumber: z.string().min(1),
        friendlyName: z.string().optional(),
        voiceEnabled: z.boolean().optional(),
        smsEnabled: z.boolean().optional(),
        assignedToEndpointId: z.number().optional(),
        assignedToRingGroupId: z.number().optional(),
        callHandler: z.enum(['texml_webhooks', 'call_control', 'ai_agent', 'sip_endpoint', 'ring_group']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const id = await db.createPhoneNumber({
          customerId: input.customerId,
          phoneNumber: input.phoneNumber,
          friendlyName: input.friendlyName || null,
          voiceEnabled: input.voiceEnabled ?? true,
          smsEnabled: input.smsEnabled ?? false,
          assignedToEndpointId: input.assignedToEndpointId || null,
          assignedToRingGroupId: input.assignedToRingGroupId || null,
          callHandler: input.callHandler || 'texml_webhooks',
          status: 'active',
        });
        return { id };
      }),
    
    update: customerProcedure
      .input(z.object({
        id: z.number(),
        friendlyName: z.string().optional(),
        voiceEnabled: z.boolean().optional(),
        smsEnabled: z.boolean().optional(),
        assignedToEndpointId: z.number().nullable().optional(),
        assignedToRingGroupId: z.number().nullable().optional(),
        callHandler: z.enum(['texml_webhooks', 'call_control', 'ai_agent', 'sip_endpoint', 'ring_group']).optional(),
        status: z.enum(['active', 'inactive', 'porting']).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updatePhoneNumber(id, data);
        return { success: true };
      }),
    
    delete: customerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deletePhoneNumber(input.id);
        return { success: true };
      }),
  }),

  // ============ RING GROUPS ============
  ringGroups: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getRingGroupsByCustomer(input.customerId);
      }),
    
    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRingGroupById(input.id);
      }),
    
    create: customerProcedure
      .input(z.object({
        customerId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        extensionNumber: z.string().optional(),
        strategy: z.enum(['simultaneous', 'sequential', 'round_robin', 'random']).optional(),
        ringTimeout: z.number().optional(),
        memberEndpointIds: z.array(z.number()).optional(),
        failoverAction: z.enum(['voicemail', 'forward', 'hangup']).optional(),
        failoverDestination: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const id = await db.createRingGroup({
          customerId: input.customerId,
          name: input.name,
          description: input.description || null,
          extensionNumber: input.extensionNumber || null,
          strategy: input.strategy || 'simultaneous',
          ringTimeout: input.ringTimeout || 30,
          memberEndpointIds: input.memberEndpointIds || [],
          failoverAction: input.failoverAction || 'voicemail',
          failoverDestination: input.failoverDestination || null,
          status: 'active',
        });
        return { id };
      }),
    
    update: customerProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        extensionNumber: z.string().optional(),
        strategy: z.enum(['simultaneous', 'sequential', 'round_robin', 'random']).optional(),
        ringTimeout: z.number().optional(),
        memberEndpointIds: z.array(z.number()).optional(),
        failoverAction: z.enum(['voicemail', 'forward', 'hangup']).optional(),
        failoverDestination: z.string().optional(),
        status: z.enum(['active', 'inactive']).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateRingGroup(id, data);
        return { success: true };
      }),
    
    delete: customerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteRingGroup(input.id);
        return { success: true };
      }),
  }),

  // ============ CALL ROUTES ============
  callRoutes: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getCallRoutesByCustomer(input.customerId);
      }),
    
    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getCallRouteById(input.id);
      }),
    
    create: customerProcedure
      .input(z.object({
        customerId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        priority: z.number().optional(),
        matchType: z.enum(['all', 'caller_id', 'time_based', 'did']).optional(),
        matchPattern: z.string().optional(),
        timeStart: z.string().optional(),
        timeEnd: z.string().optional(),
        daysOfWeek: z.array(z.number()).optional(),
        destinationType: z.enum(['endpoint', 'ring_group', 'external', 'voicemail', 'ai_agent']),
        destinationId: z.number().optional(),
        destinationExternal: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const id = await db.createCallRoute({
          customerId: input.customerId,
          name: input.name,
          description: input.description || null,
          priority: input.priority || 0,
          matchType: input.matchType || 'all',
          matchPattern: input.matchPattern || null,
          timeStart: input.timeStart || null,
          timeEnd: input.timeEnd || null,
          daysOfWeek: input.daysOfWeek || null,
          destinationType: input.destinationType,
          destinationId: input.destinationId || null,
          destinationExternal: input.destinationExternal || null,
          status: 'active',
        });
        return { id };
      }),
    
    update: customerProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        priority: z.number().optional(),
        matchType: z.enum(['all', 'caller_id', 'time_based', 'did']).optional(),
        matchPattern: z.string().optional(),
        timeStart: z.string().optional(),
        timeEnd: z.string().optional(),
        daysOfWeek: z.array(z.number()).optional(),
        destinationType: z.enum(['endpoint', 'ring_group', 'external', 'voicemail', 'ai_agent']).optional(),
        destinationId: z.number().optional(),
        destinationExternal: z.string().optional(),
        status: z.enum(['active', 'inactive']).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateCallRoute(id, data);
        return { success: true };
      }),
    
    delete: customerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteCallRoute(input.id);
        return { success: true };
      }),
  }),

  // ============ USAGE STATS ============
  usage: router({
    global: adminProcedure.query(async () => {
      return db.getGlobalUsageStats();
    }),
    
    byCustomer: customerProcedure
      .input(z.object({ customerId: z.number(), limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getUsageStatsByCustomer(input.customerId, input.limit);
      }),
  }),

  // ============ CALL RECORDINGS ============
  recordings: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number(), limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getCallRecordingsByCustomer(input.customerId, input.limit);
      }),
    
    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getCallRecordingById(input.id);
      }),
    
    getPlaybackUrl: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const recording = await db.getCallRecordingById(input.id);
        if (!recording || !recording.recordingKey) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        const { url } = await storageGet(recording.recordingKey);
        return { url };
      }),
    
    delete: customerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteCallRecording(input.id);
        return { success: true };
      }),
    
    retentionPolicy: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getRetentionPolicy(input.customerId);
      }),
    
    updateRetentionPolicy: customerProcedure
      .input(z.object({
        customerId: z.number(),
        defaultRetentionDays: z.number().optional(),
        autoDeleteEnabled: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { customerId, ...policy } = input;
        await db.upsertRetentionPolicy(customerId, policy);
        return { success: true };
      }),
  }),

  // ============ NOTIFICATIONS ============
  notifications: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number(), limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getNotificationsByCustomer(input.customerId, input.limit);
      }),
    
    unread: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getUnreadNotifications(input.customerId);
      }),
    
    markAsRead: customerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.markNotificationAsRead(input.id);
        return { success: true };
      }),
    
    settings: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getNotificationSettings(input.customerId);
      }),
    
    updateSettings: customerProcedure
      .input(z.object({
        customerId: z.number(),
        missedCallEmail: z.boolean().optional(),
        missedCallInApp: z.boolean().optional(),
        voicemailEmail: z.boolean().optional(),
        voicemailInApp: z.boolean().optional(),
        highVolumeEmail: z.boolean().optional(),
        highVolumeInApp: z.boolean().optional(),
        highVolumeThreshold: z.number().optional(),
        recordingReadyEmail: z.boolean().optional(),
        recordingReadyInApp: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        const { customerId, ...settings } = input;
        await db.upsertNotificationSettings(customerId, settings);
        return { success: true };
      }),
  }),

  // ============ TELNYX API ============
  telnyxApi: router({
    // Check if Telnyx is configured
    status: adminProcedure.query(async () => {
      return telnyx.getCredentialsSummary();
    }),

    // Get account info
    accountInfo: adminProcedure.query(async () => {
      return telnyx.getAccountInfo();
    }),

    // List SIP credentials from Telnyx
    listSipEndpoints: adminProcedure.query(async () => {
      return telnyx.listSipCredentials();
    }),

    // Create SIP credential in Telnyx
    createSipEndpoint: adminProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(8),
        name: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return telnyx.createSipCredential(input);
      }),

    // Update SIP credential in Telnyx
    updateSipEndpoint: adminProcedure
      .input(z.object({
        id: z.string(),
        name: z.string().optional(),
        sip_password: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...params } = input;
        return telnyx.updateSipCredential(id, params);
      }),

    // Delete SIP credential from Telnyx
    deleteSipEndpoint: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return telnyx.deleteSipCredential(input.id);
      }),

    // Search available phone numbers
    searchPhoneNumbers: adminProcedure
      .input(z.object({
        areaCode: z.string().optional(),
        contains: z.string().optional(),
        state: z.string().optional(),
        type: z.enum(['local', 'toll_free']).optional(),
      }))
      .query(async ({ input }) => {
        return telnyx.searchAvailablePhoneNumbers(input);
      }),

    // List owned phone numbers
    listPhoneNumbers: adminProcedure.query(async () => {
      return telnyx.listPhoneNumbers();
    }),

    // Purchase a phone number
    purchasePhoneNumber: adminProcedure
      .input(z.object({
        phoneNumber: z.string(),
        friendlyName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return telnyx.purchasePhoneNumber(input.phoneNumber, input.friendlyName);
      }),

    // Update phone number configuration
    updatePhoneNumber: adminProcedure
      .input(z.object({
        id: z.string(),
        connectionId: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...params } = input;
        return telnyx.updatePhoneNumber(id, params);
      }),

    // Release a phone number
    releasePhoneNumber: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return telnyx.releasePhoneNumber(input.id);
      }),

    // List calls
    listCalls: adminProcedure
      .input(z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return telnyx.listCalls(input);
      }),

    // List recordings from Telnyx
    listRecordings: adminProcedure
      .input(z.object({ callControlId: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return telnyx.listRecordings(input?.callControlId);
      }),
  }),

  // ============ LLM CALL FLOWS ============
  llmCallFlows: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getLlmCallFlowsByCustomer(input.customerId);
      }),
    
    create: customerProcedure
      .input(z.object({
        customerId: z.number(),
        name: z.string().min(1),
        naturalLanguageConfig: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        
        // Generate TeXML from natural language using LLM
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are an expert at creating Telnyx TeXML (TwiML-compatible XML) call flows. Convert the user's natural language description into valid TeXML. Only output the XML, no explanations.

Available TeXML verbs:
- <Say>: Text-to-speech
- <Play>: Play audio file
- <Dial>: Connect to phone number or SIP endpoint
- <Gather>: Collect DTMF or speech input
- <Record>: Record audio
- <Hangup>: End the call
- <Redirect>: Redirect to another URL
- <Pause>: Add silence

Example output:
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Welcome to our company.</Say>
  <Dial>+15551234567</Dial>
</Response>`
            },
            {
              role: 'user',
              content: input.naturalLanguageConfig
            }
          ]
        });

        const createContent = llmResponse.choices[0]?.message?.content;
        const generatedTeXml = typeof createContent === 'string' ? createContent : '';

        const id = await db.createLlmCallFlow({
          customerId: input.customerId,
          name: input.name,
          naturalLanguageConfig: input.naturalLanguageConfig,
          generatedLaml: generatedTeXml,
          isActive: false,
          lastGeneratedAt: new Date(),
        });

        return { id, generatedTeXml };
      }),
    
    regenerate: customerProcedure
      .input(z.object({
        id: z.number(),
        naturalLanguageConfig: z.string(),
      }))
      .mutation(async ({ input }) => {
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are an expert at creating Telnyx TeXML (TwiML-compatible XML) call flows. Convert the user's natural language description into valid TeXML. Only output the XML, no explanations.`
            },
            {
              role: 'user',
              content: input.naturalLanguageConfig
            }
          ]
        });

        const regenContent = llmResponse.choices[0]?.message?.content;
        const generatedTeXml = typeof regenContent === 'string' ? regenContent : '';

        await db.updateLlmCallFlow(input.id, {
          naturalLanguageConfig: input.naturalLanguageConfig,
          generatedLaml: generatedTeXml,
          lastGeneratedAt: new Date(),
        });

        return { generatedTeXml };
      }),
    
    activate: customerProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input }) => {
        await db.updateLlmCallFlow(input.id, { isActive: input.isActive });
        return { success: true };
      }),
    
    delete: customerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteLlmCallFlow(input.id);
        return { success: true };
      }),
    
    // Get intelligent routing suggestions
    getRoutingSuggestions: customerProcedure
      .input(z.object({
        customerId: z.number(),
        context: z.string(), // Description of current call patterns
      }))
      .mutation(async ({ input }) => {
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a PBX routing expert. Analyze the user's call patterns and suggest optimal routing configurations. Provide specific, actionable recommendations.`
            },
            {
              role: 'user',
              content: input.context
            }
          ]
        });
        
        const suggestContent = llmResponse.choices[0]?.message?.content;
        return { suggestions: typeof suggestContent === 'string' ? suggestContent : '' };
      }),
    
    // Generate call summary
    summarizeCall: customerProcedure
      .input(z.object({
        recordingId: z.number(),
        transcription: z.string(),
      }))
      .mutation(async ({ input }) => {
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a call analyst. Summarize the following call transcription in 2-3 sentences, highlighting key topics discussed and any action items.`
            },
            {
              role: 'user',
              content: input.transcription
            }
          ]
        });
        
        const summaryContent = llmResponse.choices[0]?.message?.content;
        const summary = typeof summaryContent === 'string' ? summaryContent : '';
        await db.updateCallRecording(input.recordingId, { summary });
        
        return { summary };
      }),
  }),
});

export type AppRouter = typeof appRouter;
