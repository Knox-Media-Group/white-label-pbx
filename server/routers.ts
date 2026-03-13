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
import * as retell from "./retell";
import * as viirtue from "./viirtue";
import type { ViirtueConfig } from "./viirtue";
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
    adminLogin: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { ENV } = await import('./_core/env');
        if (!ENV.adminUsername || !ENV.adminPassword) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Admin login not configured' });
        }
        if (input.username !== ENV.adminUsername || input.password !== ENV.adminPassword) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
        }
        const adminOpenId = `admin_local`;
        await db.upsertUser({
          openId: adminOpenId,
          name: 'Admin',
          email: null,
          role: 'admin',
          lastSignedIn: new Date(),
        });
        const { sdk } = await import('./_core/sdk');
        const sessionToken = await sdk.createSessionToken(adminOpenId, {
          name: 'Admin',
          expiresInMs: 1000 * 60 * 60 * 24, // 24 hours
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 1000 * 60 * 60 * 24 });
        return { success: true };
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
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        // Admins can access any customer; customers can only access their own
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        return db.getCustomerById(input.id);
      }),
    
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        companyName: z.string().optional(),
        email: z.string().email(),
        phone: z.string().optional(),
        notes: z.string().optional(),
        planId: z.number().optional(),
        assignPhoneNumber: z.string().optional(), // E.164 phone number to assign
      }))
      .mutation(async ({ input }) => {
        const id = await db.createCustomer({
          name: input.name,
          companyName: input.companyName || null,
          email: input.email,
          phone: input.phone || null,
          notes: input.notes || null,
          planId: input.planId || null,
          status: 'active',
        });
        // If a phone number was specified, create a phone number record for this customer
        if (input.assignPhoneNumber) {
          await db.createPhoneNumber({
            customerId: id,
            phoneNumber: input.assignPhoneNumber,
            friendlyName: `${input.name} - Main`,
            voiceEnabled: true,
            smsEnabled: true,
            callHandler: 'texml_webhooks',
            status: 'active',
          });
        }
        return { id };
      }),
    
    update: protectedProcedure
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
        planId: z.number().nullable().optional(),
        // SMS Summary settings
        smsSummaryEnabled: z.boolean().optional(),
        notificationPhone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Admins can update any customer; customers can only update their own (limited fields)
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        const { id, ...data } = input;
        // Non-admins cannot change status, plan, or Telnyx credentials
        if (ctx.user.role !== 'admin') {
          delete (data as any).status;
          delete (data as any).planId;
          delete (data as any).telnyxConnectionId;
          delete (data as any).telnyxApiKey;
          delete (data as any).telnyxMessagingProfileId;
        }
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
    
    updateBranding: protectedProcedure
      .input(z.object({
        id: z.number(),
        brandingLogo: z.string().optional(),
        brandingPrimaryColor: z.string().optional(),
        brandingCompanyName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
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
        retellAgentId: z.string().nullable().optional(),
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

    // Send SMS
    sendSms: adminProcedure
      .input(z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        body: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        return telnyx.sendSms(input);
      }),

    // List SMS messages
    listMessages: adminProcedure
      .input(z.object({
        from: z.string().optional(),
        to: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return telnyx.listMessages(input);
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

  // ============ VIIRTUE IMPORT ============
  viirtueImport: router({
    // Test connection to Viirtue/NetSapiens API
    testConnection: adminProcedure
      .input(z.object({
        serverUrl: z.string().url(),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        return viirtue.testConnection(input);
      }),

    // List all domains (customers) from Viirtue
    listDomains: adminProcedure
      .input(z.object({
        serverUrl: z.string().url(),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        return viirtue.listDomains(input);
      }),

    // Preview a single domain's data before importing
    previewDomain: adminProcedure
      .input(z.object({
        serverUrl: z.string().url(),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        domain: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const { domain, ...config } = input;
        return viirtue.exportDomain(config, domain);
      }),

    // Import a domain from Viirtue into the local database + provision Telnyx
    importDomain: adminProcedure
      .input(z.object({
        serverUrl: z.string().url(),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        domain: z.string().min(1),
        // Override fields for the new customer
        customerName: z.string().min(1),
        customerEmail: z.string().email(),
        companyName: z.string().optional(),
        // Whether to provision SIP credentials on Telnyx
        provisionTelnyx: z.boolean().default(true),
        // Whether to import phone numbers (numbers need to be ported separately)
        importPhoneNumbers: z.boolean().default(true),
        // Whether to import call queues as ring groups
        importCallQueues: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const { domain, customerName, customerEmail, companyName, provisionTelnyx, importPhoneNumbers, importCallQueues, ...config } = input;

        const results = {
          customerId: 0,
          endpoints: { imported: 0, failed: 0, errors: [] as string[] },
          phoneNumbers: { imported: 0, failed: 0, errors: [] as string[] },
          ringGroups: { imported: 0, failed: 0, errors: [] as string[] },
        };

        // 1. Export all data from Viirtue
        const exported = await viirtue.exportDomain(config, domain);

        // 2. Create the customer
        const customerId = await db.createCustomer({
          name: customerName,
          companyName: companyName || exported.domain.description || domain,
          email: customerEmail,
          status: 'active',
          notes: `Imported from Viirtue domain: ${domain}`,
        });
        results.customerId = customerId;

        // 3. Import subscribers as SIP endpoints
        const endpointMap = new Map<string, number>(); // viirtue user → local endpoint ID
        for (const sub of exported.subscribers) {
          try {
            const displayName = [sub.first_name, sub.last_name].filter(Boolean).join(' ') || sub.name_caller_id || sub.user;
            const username = `${sub.user}_${domain.replace(/\./g, '_')}`;
            const password = generateRandomPassword();

            // Create local DB record
            const endpointId = await db.createSipEndpoint({
              customerId,
              username,
              password,
              callerId: sub.number_caller_id || null,
              displayName: displayName || null,
              extensionNumber: sub.dial || sub.user || null,
              status: provisionTelnyx ? 'provisioning' : 'active',
              callHandler: 'texml_webhooks',
            });
            endpointMap.set(sub.user, endpointId);

            // Provision on Telnyx if requested
            if (provisionTelnyx && telnyx.isConfigured()) {
              try {
                const telnyxCred = await telnyx.createSipCredential({
                  username,
                  password,
                  name: displayName,
                });
                await db.updateSipEndpoint(endpointId, {
                  telnyxCredentialId: telnyxCred.id,
                  status: 'active',
                });
              } catch (telnyxErr) {
                const msg = telnyxErr instanceof Error ? telnyxErr.message : 'Telnyx provisioning failed';
                results.endpoints.errors.push(`${sub.user}: Telnyx error - ${msg}`);
                // Keep the local record, just mark it as needs attention
              }
            }

            results.endpoints.imported++;
          } catch (err) {
            results.endpoints.failed++;
            const msg = err instanceof Error ? err.message : 'Unknown error';
            results.endpoints.errors.push(`${sub.user}: ${msg}`);
          }
        }

        // 4. Import phone numbers (as records — actual porting is a separate process)
        if (importPhoneNumbers) {
          for (const pn of exported.phoneNumbers) {
            try {
              // Normalize phone number format
              let phoneNumber = pn.dialplan;
              if (!phoneNumber.startsWith('+')) {
                phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
              }

              // Try to find which endpoint this number routes to
              let assignedEndpointId: number | null = null;
              if (pn.from_user && endpointMap.has(pn.from_user)) {
                assignedEndpointId = endpointMap.get(pn.from_user)!;
              }

              await db.createPhoneNumber({
                customerId,
                phoneNumber,
                friendlyName: pn.description || phoneNumber,
                voiceEnabled: true,
                smsEnabled: false,
                assignedToEndpointId: assignedEndpointId,
                callHandler: assignedEndpointId ? 'sip_endpoint' : 'texml_webhooks',
                status: 'porting', // Mark as porting since they need to be ported from Viirtue to Telnyx
              });
              results.phoneNumbers.imported++;
            } catch (err) {
              results.phoneNumbers.failed++;
              const msg = err instanceof Error ? err.message : 'Unknown error';
              results.phoneNumbers.errors.push(`${pn.dialplan}: ${msg}`);
            }
          }
        }

        // 5. Import call queues as ring groups
        if (importCallQueues) {
          for (const queue of exported.callQueues) {
            try {
              // Map queue agents to local endpoint IDs
              const memberIds: number[] = [];
              if (queue.agents) {
                for (const agent of queue.agents) {
                  const localId = endpointMap.get(agent);
                  if (localId) memberIds.push(localId);
                }
              }

              // Map strategy
              let strategy: 'simultaneous' | 'sequential' | 'round_robin' | 'random' = 'simultaneous';
              if (queue.strategy) {
                const s = queue.strategy.toLowerCase();
                if (s.includes('round') || s.includes('robin')) strategy = 'round_robin';
                else if (s.includes('seq') || s.includes('linear') || s.includes('hunt')) strategy = 'sequential';
                else if (s.includes('random')) strategy = 'random';
              }

              await db.createRingGroup({
                customerId,
                name: queue.description || queue.queue,
                description: `Imported from Viirtue call queue: ${queue.queue}`,
                strategy,
                ringTimeout: queue.timeout || 30,
                memberEndpointIds: memberIds,
                failoverAction: 'voicemail',
                status: 'active',
              });
              results.ringGroups.imported++;
            } catch (err) {
              results.ringGroups.failed++;
              const msg = err instanceof Error ? err.message : 'Unknown error';
              results.ringGroups.errors.push(`${queue.queue}: ${msg}`);
            }
          }
        }

        return results;
      }),
  }),

  // ============ PORT ORDERS ============
  portOrders: router({
    // List all port orders (admin sees all, customer sees theirs)
    list: adminProcedure
      .input(z.object({ customerId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        if (input?.customerId) {
          return db.getPortOrdersByCustomer(input.customerId);
        }
        return db.getAllPortOrders();
      }),

    // Customer-accessible: list port orders for their own account
    listByCustomer: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getPortOrdersByCustomer(input.customerId);
      }),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getPortOrderById(input.id);
      }),

    // Check if numbers are portable
    checkPortability: adminProcedure
      .input(z.object({ phoneNumbers: z.array(z.string()).min(1) }))
      .mutation(async ({ input }) => {
        return telnyx.checkPortability(input.phoneNumbers);
      }),

    // Create a new port order (draft)
    create: adminProcedure
      .input(z.object({
        customerId: z.number(),
        phoneNumberIds: z.array(z.number()).min(1),
        authorizedName: z.string().min(1),
        businessName: z.string().optional(),
        losingCarrier: z.string().optional(),
        accountNumber: z.string().optional(),
        accountPin: z.string().optional(),
        streetAddress: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Look up the actual phone number strings from our DB
        const phoneNumberStrings: string[] = [];
        for (const pnId of input.phoneNumberIds) {
          const pn = await db.getPhoneNumberById(pnId);
          if (pn) phoneNumberStrings.push(pn.phoneNumber);
        }

        if (phoneNumberStrings.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No valid phone numbers found' });
        }

        const id = await db.createPortOrder({
          customerId: input.customerId,
          status: 'draft',
          phoneNumberIds: input.phoneNumberIds,
          phoneNumbers: phoneNumberStrings,
          authorizedName: input.authorizedName,
          businessName: input.businessName || null,
          losingCarrier: input.losingCarrier || null,
          accountNumber: input.accountNumber || null,
          accountPin: input.accountPin || null,
          streetAddress: input.streetAddress || null,
          city: input.city || null,
          state: input.state || null,
          zip: input.zip || null,
          notes: input.notes || null,
        });

        return { id, phoneNumbers: phoneNumberStrings };
      }),

    // Submit a draft port order to Telnyx (3-step: create → update → confirm)
    submit: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const order = await db.getPortOrderById(input.id);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Port order not found' });
        }
        if (order.status !== 'draft') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot submit order in "${order.status}" status` });
        }

        const phoneNums = (order.phoneNumbers as string[]) || [];
        if (phoneNums.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No phone numbers in port order' });
        }

        try {
          // Step 1: Create draft on Telnyx (phone numbers only)
          const telnyxOrder = await telnyx.createPortOrder(
            phoneNums,
            `port-order-${order.id}`,
          );
          const telnyxId = telnyxOrder.id;

          // Step 2: Update with end-user details and phone number config
          await telnyx.updatePortOrder(telnyxId, {
            authorizedName: order.authorizedName || undefined,
            businessName: order.businessName || undefined,
            billingPhoneNumber: phoneNums[0], // Use first number as BTN
            accountNumber: order.accountNumber || undefined,
            accountPin: order.accountPin || undefined,
            streetAddress: order.streetAddress || undefined,
            city: order.city || undefined,
            state: order.state || undefined,
            zip: order.zip || undefined,
          });

          // Step 3: Confirm/submit the port order
          await telnyx.confirmPortOrder(telnyxId);

          await db.updatePortOrder(input.id, {
            telnyxPortOrderId: telnyxId,
            status: 'submitted',
          });

          // Update local phone numbers to 'porting' status
          const phoneNumberIds = (order.phoneNumberIds as number[]) || [];
          for (const pnId of phoneNumberIds) {
            await db.updatePhoneNumber(pnId, { status: 'porting' });
          }

          return { success: true, telnyxPortOrderId: telnyxId };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Telnyx API error';
          await db.updatePortOrder(input.id, { lastError: msg });
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Port submission failed: ${msg}` });
        }
      }),

    // Sync status from Telnyx
    syncStatus: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const order = await db.getPortOrderById(input.id);
        if (!order || !order.telnyxPortOrderId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Port order not found or not submitted to Telnyx' });
        }

        try {
          const telnyxOrder = await telnyx.getPortOrder(order.telnyxPortOrderId);

          // Map Telnyx status to our status
          let localStatus = order.status;
          const telnyxStatus = (telnyxOrder.status || '').toLowerCase().replace(/-/g, '_');
          const validStatuses = ['draft', 'submitted', 'in_process', 'exception', 'foc_date_confirmed', 'ported', 'cancelled'];
          if (validStatuses.includes(telnyxStatus)) {
            localStatus = telnyxStatus as typeof localStatus;
          }

          const updateData: Record<string, unknown> = { status: localStatus };
          if (telnyxOrder.foc_date) updateData.focDate = new Date(telnyxOrder.foc_date);
          if (telnyxOrder.activation_date) updateData.activationDate = new Date(telnyxOrder.activation_date);

          await db.updatePortOrder(input.id, updateData);

          // If ported, update local phone numbers to active
          if (localStatus === 'ported') {
            const phoneNumberIds = (order.phoneNumberIds as number[]) || [];
            for (const pnId of phoneNumberIds) {
              await db.updatePhoneNumber(pnId, { status: 'active' });
            }
          }

          return { status: localStatus, focDate: updateData.focDate, activationDate: updateData.activationDate };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Telnyx API error';
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Status sync failed: ${msg}` });
        }
      }),

    // Cancel a port order
    cancel: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const order = await db.getPortOrderById(input.id);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Port order not found' });
        }

        // Cancel on Telnyx if submitted
        if (order.telnyxPortOrderId) {
          try {
            await telnyx.cancelPortOrder(order.telnyxPortOrderId);
          } catch (err) {
            console.error("[Porting] Failed to cancel on Telnyx:", err);
          }
        }

        await db.updatePortOrder(input.id, { status: 'cancelled' });

        // Revert phone number statuses
        const phoneNumberIds = (order.phoneNumberIds as number[]) || [];
        for (const pnId of phoneNumberIds) {
          const pn = await db.getPhoneNumberById(pnId);
          if (pn && pn.status === 'porting') {
            await db.updatePhoneNumber(pnId, { status: 'inactive' });
          }
        }

        return { success: true };
      }),

    // Upload a document (LOA or invoice) for porting
    uploadDocument: adminProcedure
      .input(z.object({
        fileBase64: z.string().min(1),
        filename: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileBase64, 'base64');
        const result = await telnyx.uploadPortingDocument(buffer, input.filename);
        return { documentId: result.id };
      }),

    // Attach uploaded documents to a port order on Telnyx
    attachDocuments: adminProcedure
      .input(z.object({
        id: z.number(),
        loaDocumentId: z.string().optional(),
        invoiceDocumentId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const order = await db.getPortOrderById(input.id);
        if (!order || !order.telnyxPortOrderId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Port order not found or not submitted to Telnyx' });
        }
        await telnyx.updatePortOrder(order.telnyxPortOrderId, {
          loaDocumentId: input.loaDocumentId,
          invoiceDocumentId: input.invoiceDocumentId,
        });
        return { success: true };
      }),

    // Delete a draft port order
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const order = await db.getPortOrderById(input.id);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        if (order.status !== 'draft' && order.status !== 'cancelled') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only delete draft or cancelled orders' });
        }
        await db.deletePortOrder(input.id);
        return { success: true };
      }),
  }),

  // ============ SYSTEM SETTINGS ============
  settings: router({
    get: adminProcedure
      .input(z.object({ keys: z.array(z.string()) }))
      .query(async ({ input }) => {
        return db.getSystemSettings(input.keys);
      }),

    save: adminProcedure
      .input(z.object({
        settings: z.record(z.string(), z.string().nullable()),
      }))
      .mutation(async ({ input }) => {
        await db.setSystemSettings(input.settings);
        return { success: true };
      }),
  }),

  // ============ RETELL AI ============
  retellApi: router({
    status: adminProcedure.query(async () => {
      return retell.getConfigSummary();
    }),

    // List agents from Retell API
    listRemoteAgents: adminProcedure.query(async () => {
      const configured = await retell.isConfigured();
      if (!configured) return [];
      return retell.listAgents();
    }),

    // Get single agent from Retell API
    getRemoteAgent: adminProcedure
      .input(z.object({ agentId: z.string() }))
      .query(async ({ input }) => {
        return retell.getAgent(input.agentId);
      }),

    // Create agent on Retell API + store locally
    createAgent: adminProcedure
      .input(z.object({
        customerId: z.number(),
        agentName: z.string().min(1),
        voiceId: z.string().optional(),
        llmId: z.string().optional(),
        webhookUrl: z.string().optional(),
        language: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const responseEngine = input.llmId
          ? { type: "retell-llm" as const, llmId: input.llmId }
          : undefined;

        const retellAgent = await retell.createAgent({
          agentName: input.agentName,
          voiceId: input.voiceId,
          responseEngine,
          webhookUrl: input.webhookUrl,
          language: input.language,
        });

        // Store locally
        const localId = await db.createRetellAgent({
          customerId: input.customerId,
          retellAgentId: retellAgent.agent_id,
          agentName: input.agentName,
          voiceId: input.voiceId || null,
          llmId: input.llmId || null,
          webhookUrl: input.webhookUrl || null,
          status: "active",
          lastSyncedAt: new Date(),
        });

        return { id: localId, retellAgentId: retellAgent.agent_id };
      }),

    // Update agent on Retell API + locally
    updateAgent: adminProcedure
      .input(z.object({
        id: z.number(),
        agentName: z.string().optional(),
        voiceId: z.string().optional(),
        webhookUrl: z.string().optional(),
        language: z.string().optional(),
        status: z.enum(["active", "inactive"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const localAgent = await db.getRetellAgentById(input.id);
        if (!localAgent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
        }

        // Update on Retell
        await retell.updateAgent(localAgent.retellAgentId, {
          agentName: input.agentName,
          voiceId: input.voiceId,
          webhookUrl: input.webhookUrl,
          language: input.language,
        });

        // Update locally
        const { id, ...data } = input;
        await db.updateRetellAgent(id, data);
        return { success: true };
      }),

    // Delete agent from Retell API + locally
    deleteAgent: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const localAgent = await db.getRetellAgentById(input.id);
        if (localAgent) {
          try {
            await retell.deleteAgent(localAgent.retellAgentId);
          } catch (err) {
            console.error("[Retell] Failed to delete remote agent:", err);
          }
        }
        await db.deleteRetellAgent(input.id);
        return { success: true };
      }),

    // List local agents (stored in our DB)
    listAgents: adminProcedure
      .input(z.object({ customerId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        if (input?.customerId) {
          return db.getRetellAgentsByCustomer(input.customerId);
        }
        return db.getAllRetellAgents();
      }),

    // List phone numbers from Retell
    listPhoneNumbers: adminProcedure.query(async () => {
      const configured = await retell.isConfigured();
      if (!configured) return [];
      return retell.listPhoneNumbers();
    }),

    // Import a Telnyx number into Retell
    importPhoneNumber: adminProcedure
      .input(z.object({
        phoneNumber: z.string(),
        terminationUri: z.string(),
        inboundAgentId: z.string().optional(),
        outboundAgentId: z.string().optional(),
        sipTrunkAuthUsername: z.string().optional(),
        sipTrunkAuthPassword: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return retell.importPhoneNumber(input);
      }),

    // Update phone number agent binding in Retell
    updatePhoneNumber: adminProcedure
      .input(z.object({
        phoneNumber: z.string(),
        inboundAgentId: z.string().nullable().optional(),
        outboundAgentId: z.string().nullable().optional(),
        nickname: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { phoneNumber, ...params } = input;
        return retell.updatePhoneNumber(phoneNumber, params);
      }),

    // Create an outbound call via Retell
    createCall: adminProcedure
      .input(z.object({
        fromNumber: z.string(),
        toNumber: z.string(),
        agentId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return retell.createPhoneCall(input);
      }),

    // List calls from Retell
    listCalls: adminProcedure
      .input(z.object({
        agentId: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return retell.listCalls(input);
      }),
  }),

  // ============ SERVICE PLANS ============
  servicePlans: router({
    list: adminProcedure.query(async () => {
      return db.getAllServicePlans();
    }),

    listActive: protectedProcedure.query(async () => {
      return db.getActiveServicePlans();
    }),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getServicePlanById(input.id);
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        monthlyPrice: z.number().min(0).default(0),
        includedMinutes: z.number().min(0).default(0),
        includedNumbers: z.number().min(0).default(1),
        includedEndpoints: z.number().min(0).default(5),
        includedSms: z.number().min(0).default(0),
        features: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await db.createServicePlan({
          name: input.name,
          description: input.description || null,
          monthlyPrice: input.monthlyPrice,
          includedMinutes: input.includedMinutes,
          includedNumbers: input.includedNumbers,
          includedEndpoints: input.includedEndpoints,
          includedSms: input.includedSms,
          features: input.features || null,
          isActive: true,
        });
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        monthlyPrice: z.number().min(0).optional(),
        includedMinutes: z.number().min(0).optional(),
        includedNumbers: z.number().min(0).optional(),
        includedEndpoints: z.number().min(0).optional(),
        includedSms: z.number().min(0).optional(),
        features: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateServicePlan(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteServicePlan(input.id);
        return { success: true };
      }),
  }),

  // ============ SMS MESSAGING ============
  sms: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number(), limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getSmsMessagesByCustomer(input.customerId, input.limit || 100);
      }),

    conversation: customerProcedure
      .input(z.object({ customerId: z.number(), contactNumber: z.string() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getSmsConversation(input.customerId, input.contactNumber);
      }),

    send: customerProcedure
      .input(z.object({
        customerId: z.number(),
        fromNumber: z.string(),
        toNumber: z.string(),
        body: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        try {
          // Send via Telnyx
          const result = await telnyx.sendSms({
            from: input.fromNumber,
            to: input.toNumber,
            body: input.body,
          });
          // Store in DB
          const id = await db.createSmsMessage({
            customerId: input.customerId,
            telnyxMessageId: result?.data?.id || null,
            fromNumber: input.fromNumber,
            toNumber: input.toNumber,
            body: input.body,
            direction: 'outbound',
            status: 'sent',
          });
          return { id, telnyxMessageId: result?.data?.id };
        } catch (error: any) {
          // Still store the failed message
          await db.createSmsMessage({
            customerId: input.customerId,
            fromNumber: input.fromNumber,
            toNumber: input.toNumber,
            body: input.body,
            direction: 'outbound',
            status: 'failed',
            errorMessage: error.message,
          });
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to send SMS: ${error.message}`,
          });
        }
      }),
  }),
});

function generateRandomPassword(): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
  let password = '';
  const bytes = require('crypto').randomBytes(16);
  for (let i = 0; i < 16; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

export type AppRouter = typeof appRouter;
