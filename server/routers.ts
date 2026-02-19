import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { storagePut, storageGet } from "./storage";
import * as signalwire from "./signalwire";
import * as telnyxApi from "./telnyx";
import * as retellApi from "./retell";

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
          status: 'pending',
        });

        // Auto-provision Telnyx resources and activate customer
        try {
          let telnyxConnectionId: string | undefined;
          let telnyxTexmlAppId: string | undefined;

          if (telnyxApi.isConfigured()) {
            // Create a credential connection for this customer's SIP endpoints
            const connResult = await telnyxApi.createCredentialConnection({
              connection_name: `Customer ${id} - ${input.companyName || input.name}`,
              user_name: `customer_${id}`,
              password: generateSipPassword(),
            });
            telnyxConnectionId = connResult.data?.id;

            // Create a TeXML application for inbound call routing
            const webhookUrl = process.env.WEBHOOK_URL || '';
            if (webhookUrl) {
              const texmlResult = await telnyxApi.createTexmlApplication({
                friendly_name: `${input.companyName || input.name} - Inbound`,
                voice_url: `${webhookUrl}/api/webhooks/telnyx/voice`,
                status_callback: `${webhookUrl}/api/webhooks/telnyx/status`,
              });
              telnyxTexmlAppId = texmlResult.data?.id;
            }
          }

          // Activate the customer with provisioned resources
          await db.updateCustomer(id, {
            status: 'active',
            telnyxCredentialConnectionId: telnyxConnectionId,
            telnyxTexmlAppId: telnyxTexmlAppId,
          });
        } catch (provisionError) {
          console.error(`[Customer Create] Telnyx provisioning failed for customer ${id}:`, provisionError);
          // Still activate even if Telnyx provisioning fails - can be retried later
          await db.updateCustomer(id, { status: 'active' });
        }

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
        signalwireSubprojectSid: z.string().optional(),
        signalwireApiToken: z.string().optional(),
        signalwireSpaceUrl: z.string().optional(),
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
        callHandler: z.enum(['laml_webhooks', 'relay_context', 'relay_topic', 'ai_agent', 'video_room']).optional(),
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
          callHandler: input.callHandler || 'laml_webhooks',
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
        callHandler: z.enum(['laml_webhooks', 'relay_context', 'relay_topic', 'ai_agent', 'video_room']).optional(),
        callRequestUrl: z.string().optional(),
        signalwireEndpointId: z.string().optional(),
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
        callHandler: z.enum(['laml_webhooks', 'relay_context', 'relay_topic', 'ai_agent', 'sip_endpoint', 'ring_group']).optional(),
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
          callHandler: input.callHandler || 'laml_webhooks',
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
        callHandler: z.enum(['laml_webhooks', 'relay_context', 'relay_topic', 'ai_agent', 'sip_endpoint', 'ring_group']).optional(),
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

  // ============ SIGNALWIRE API ============
  signalwireApi: router({
    // Check if SignalWire is configured
    status: adminProcedure.query(async () => {
      return signalwire.getCredentialsSummary();
    }),
    
    // Get account info
    accountInfo: adminProcedure.query(async () => {
      return signalwire.getAccountInfo();
    }),
    
    // List SIP endpoints from SignalWire
    listSipEndpoints: adminProcedure.query(async () => {
      return signalwire.listSipEndpoints();
    }),
    
    // Create SIP endpoint in SignalWire
    createSipEndpoint: adminProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(8),
        callerId: z.string().optional(),
        callerIdName: z.string().optional(),
        callHandler: z.enum(['laml_webhooks', 'relay_context', 'relay_topic', 'ai_agent']).optional(),
        callRequestUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return signalwire.createSipEndpoint(input);
      }),
    
    // Update SIP endpoint in SignalWire
    updateSipEndpoint: adminProcedure
      .input(z.object({
        id: z.string(),
        callerId: z.string().optional(),
        callerIdName: z.string().optional(),
        callHandler: z.enum(['laml_webhooks', 'relay_context', 'relay_topic', 'ai_agent']).optional(),
        callRequestUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...params } = input;
        return signalwire.updateSipEndpoint(id, params);
      }),
    
    // Delete SIP endpoint from SignalWire
    deleteSipEndpoint: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        return signalwire.deleteSipEndpoint(input.id);
      }),
    
    // Search available phone numbers
    searchPhoneNumbers: adminProcedure
      .input(z.object({
        areaCode: z.string().optional(),
        contains: z.string().optional(),
        inRegion: z.string().optional(),
        type: z.enum(['local', 'toll_free']).optional(),
      }))
      .query(async ({ input }) => {
        return signalwire.searchAvailablePhoneNumbers(input);
      }),
    
    // List owned phone numbers
    listPhoneNumbers: adminProcedure.query(async () => {
      return signalwire.listPhoneNumbers();
    }),
    
    // Purchase a phone number
    purchasePhoneNumber: adminProcedure
      .input(z.object({
        phoneNumber: z.string(),
        friendlyName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return signalwire.purchasePhoneNumber(input.phoneNumber, input.friendlyName);
      }),
    
    // Update phone number configuration
    updatePhoneNumber: adminProcedure
      .input(z.object({
        sid: z.string(),
        friendlyName: z.string().optional(),
        voiceUrl: z.string().optional(),
        voiceMethod: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { sid, ...params } = input;
        return signalwire.updatePhoneNumber(sid, params);
      }),
    
    // Release a phone number
    releasePhoneNumber: adminProcedure
      .input(z.object({ sid: z.string() }))
      .mutation(async ({ input }) => {
        return signalwire.releasePhoneNumber(input.sid);
      }),
    
    // List calls
    listCalls: adminProcedure
      .input(z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return signalwire.listCalls(input);
      }),
    
    // List recordings from SignalWire
    listRecordings: adminProcedure
      .input(z.object({ callSid: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return signalwire.listRecordings(input?.callSid);
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
        
        // Generate LaML from natural language using LLM
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are an expert at creating SignalWire LaML (XML) call flows. Convert the user's natural language description into valid LaML XML. Only output the XML, no explanations.
              
Available LaML verbs:
- <Say>: Text-to-speech
- <Play>: Play audio file
- <Dial>: Connect to phone number or SIP endpoint
- <Gather>: Collect DTMF input
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
        const generatedLaml = typeof createContent === 'string' ? createContent : '';
        
        const id = await db.createLlmCallFlow({
          customerId: input.customerId,
          name: input.name,
          naturalLanguageConfig: input.naturalLanguageConfig,
          generatedLaml,
          isActive: false,
          lastGeneratedAt: new Date(),
        });
        
        return { id, generatedLaml };
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
              content: `You are an expert at creating SignalWire LaML (XML) call flows. Convert the user's natural language description into valid LaML XML. Only output the XML, no explanations.`
            },
            {
              role: 'user',
              content: input.naturalLanguageConfig
            }
          ]
        });
        
        const regenContent = llmResponse.choices[0]?.message?.content;
        const generatedLaml = typeof regenContent === 'string' ? regenContent : '';
        
        await db.updateLlmCallFlow(input.id, {
          naturalLanguageConfig: input.naturalLanguageConfig,
          generatedLaml,
          lastGeneratedAt: new Date(),
        });
        
        return { generatedLaml };
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

  // ============ TELNYX API ============
  telnyxApi: router({
    status: adminProcedure.query(async () => {
      return telnyxApi.getCredentialsSummary();
    }),

    // SIP Connections
    listSipConnections: adminProcedure.query(async () => {
      return telnyxApi.listSipConnections();
    }),

    createSipConnection: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        transport_protocol: z.enum(["UDP", "TCP", "TLS"]).optional(),
      }))
      .mutation(async ({ input }) => {
        return telnyxApi.createSipConnection(input);
      }),

    // Credential Connections (for VoIP phones)
    listCredentialConnections: adminProcedure.query(async () => {
      return telnyxApi.listCredentialConnections();
    }),

    createCredentialConnection: adminProcedure
      .input(z.object({
        connection_name: z.string().min(1),
        user_name: z.string().min(1),
        password: z.string().min(8),
      }))
      .mutation(async ({ input }) => {
        return telnyxApi.createCredentialConnection(input);
      }),

    // Phone Numbers
    searchPhoneNumbers: adminProcedure
      .input(z.object({
        country_code: z.string().optional(),
        administrative_area: z.string().optional(),
        locality: z.string().optional(),
        national_destination_code: z.string().optional(),
        number_type: z.enum(["local", "toll_free", "national"]).optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return telnyxApi.searchAvailablePhoneNumbers(input);
      }),

    listPhoneNumbers: adminProcedure.query(async () => {
      return telnyxApi.listPhoneNumbers();
    }),

    purchasePhoneNumber: adminProcedure
      .input(z.object({
        phoneNumber: z.string(),
        connectionId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return telnyxApi.purchasePhoneNumber(input.phoneNumber, input.connectionId);
      }),

    // TeXML Applications
    listTexmlApplications: adminProcedure.query(async () => {
      return telnyxApi.listTexmlApplications();
    }),

    createTexmlApplication: adminProcedure
      .input(z.object({
        friendly_name: z.string().min(1),
        voice_url: z.string().url(),
        status_callback: z.string().url().optional(),
      }))
      .mutation(async ({ input }) => {
        return telnyxApi.createTexmlApplication(input);
      }),

    // Recordings
    listRecordings: adminProcedure.query(async () => {
      return telnyxApi.listRecordings();
    }),

    // Outbound Voice Profiles
    listOutboundVoiceProfiles: adminProcedure.query(async () => {
      return telnyxApi.listOutboundVoiceProfiles();
    }),
  }),

  // ============ RETELL AI ============
  retellApi: router({
    status: adminProcedure.query(async () => {
      return retellApi.getCredentialsSummary();
    }),

    // Agents
    listAgents: adminProcedure.query(async () => {
      return retellApi.listAgents();
    }),

    getAgent: adminProcedure
      .input(z.object({ agentId: z.string() }))
      .query(async ({ input }) => {
        return retellApi.getAgent(input.agentId);
      }),

    createReceptionistAgent: adminProcedure
      .input(z.object({
        customerId: z.number(),
        companyName: z.string().min(1),
        greeting: z.string().optional(),
        departments: z.array(z.object({
          name: z.string(),
          description: z.string(),
          transferNumber: z.string(),
        })),
        voicemailMessage: z.string().optional(),
        webhookUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        const result = await retellApi.createReceptionistAgent({
          companyName: input.companyName,
          greeting: input.greeting,
          departments: input.departments,
          voicemailMessage: input.voicemailMessage,
          webhookUrl: input.webhookUrl,
          customerId: input.customerId,
        });

        // Store in database
        const agentDbId = await db.createRetellAgent({
          customerId: input.customerId,
          retellAgentId: result.agentId,
          retellLlmId: result.llmId,
          name: `${input.companyName} Receptionist`,
          greeting: input.greeting,
          departments: input.departments,
          status: 'active',
        });

        // Update customer record
        await db.updateCustomer(input.customerId, {
          retellAgentId: result.agentId,
          retellLlmId: result.llmId,
          retellEnabled: true,
        });

        return { ...result, dbId: agentDbId };
      }),

    deleteAgent: adminProcedure
      .input(z.object({ agentId: z.string() }))
      .mutation(async ({ input }) => {
        return retellApi.deleteAgent(input.agentId);
      }),

    // Phone Numbers
    listPhoneNumbers: adminProcedure.query(async () => {
      return retellApi.listPhoneNumbers();
    }),

    importPhoneNumber: adminProcedure
      .input(z.object({
        phoneNumber: z.string(),
        terminationUri: z.string(),
        agentId: z.string(),
        nickname: z.string().optional(),
        webhookUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return retellApi.setupNumberWithRetell({
          phoneNumber: input.phoneNumber,
          telnyxTerminationUri: input.terminationUri,
          agentId: input.agentId,
          nickname: input.nickname,
          webhookUrl: input.webhookUrl,
        });
      }),

    // Calls
    listCalls: adminProcedure
      .input(z.object({
        limit: z.number().optional(),
        agentId: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return retellApi.listCalls({
          limit: input?.limit,
          filter_criteria: input?.agentId ? { agent_id: [input.agentId] } : undefined,
        });
      }),

    getCall: adminProcedure
      .input(z.object({ callId: z.string() }))
      .query(async ({ input }) => {
        return retellApi.getCall(input.callId);
      }),

    // Make outbound call via Retell AI
    createPhoneCall: adminProcedure
      .input(z.object({
        fromNumber: z.string(),
        toNumber: z.string(),
        agentId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return retellApi.createPhoneCall({
          from_number: input.fromNumber,
          to_number: input.toNumber,
          override_agent_id: input.agentId,
        });
      }),

    // LLMs
    listLlms: adminProcedure.query(async () => {
      return retellApi.listRetellLlms();
    }),

    // Concurrency
    getConcurrency: adminProcedure.query(async () => {
      return retellApi.getConcurrency();
    }),
  }),

  // ============ RETELL AGENTS (DB) ============
  retellAgents: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getRetellAgentsByCustomer(input.customerId);
      }),

    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRetellAgentById(input.id);
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        greeting: z.string().optional(),
        departments: z.array(z.object({
          name: z.string(),
          description: z.string(),
          transferNumber: z.string(),
        })).optional(),
        status: z.enum(['active', 'inactive', 'configuring']).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateRetellAgent(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const agent = await db.getRetellAgentById(input.id);
        if (agent?.retellAgentId) {
          try {
            await retellApi.deleteAgent(agent.retellAgentId);
          } catch (err) {
            console.error("Failed to delete Retell agent:", err);
          }
        }
        await db.deleteRetellAgent(input.id);
        return { success: true };
      }),
  }),

  // ============ VOIP PHONES ============
  voipPhones: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getVoipPhonesByCustomer(input.customerId);
      }),

    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getVoipPhoneById(input.id);
      }),

    create: adminProcedure
      .input(z.object({
        customerId: z.number(),
        brand: z.string().optional(),
        model: z.string().optional(),
        macAddress: z.string().optional(),
        label: z.string().optional(),
        location: z.string().optional(),
        transport: z.enum(["UDP", "TCP", "TLS"]).optional(),
      }))
      .mutation(async ({ input }) => {
        // Create a credential connection on Telnyx for this phone
        const sipUsername = `phone_${input.customerId}_${Date.now()}`;
        const sipPassword = generateSipPassword();

        let telnyxConnectionId: string | undefined;
        if (telnyxApi.isConfigured()) {
          try {
            const connection = await telnyxApi.createCredentialConnection({
              connection_name: `${input.label || input.brand || 'Phone'} - ${sipUsername}`,
              user_name: sipUsername,
              password: sipPassword,
            });
            telnyxConnectionId = connection.data?.id;
          } catch (err) {
            console.error("Failed to create Telnyx credential connection:", err);
          }
        }

        // Create SIP endpoint in our database
        const endpointId = await db.createSipEndpoint({
          customerId: input.customerId,
          username: sipUsername,
          password: sipPassword,
          displayName: input.label || `${input.brand || ''} ${input.model || 'Phone'}`.trim(),
          phoneModel: input.model,
          macAddress: input.macAddress,
          telnyxCredentialConnectionId: telnyxConnectionId,
          telnyxSipUsername: sipUsername,
          provider: 'telnyx',
          status: 'provisioning',
        });

        // Create the VoIP phone record
        const phoneId = await db.createVoipPhone({
          customerId: input.customerId,
          sipEndpointId: endpointId,
          brand: input.brand,
          model: input.model,
          macAddress: input.macAddress,
          sipServer: process.env.TELNYX_SIP_DOMAIN || "sip.telnyx.com",
          sipUsername: sipUsername,
          sipPort: 5060,
          transport: input.transport || "UDP",
          label: input.label,
          location: input.location,
          status: 'provisioning',
        });

        return {
          id: phoneId,
          endpointId,
          sipUsername,
          sipPassword,
          sipServer: process.env.TELNYX_SIP_DOMAIN || "sip.telnyx.com",
          sipPort: 5060,
        };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        label: z.string().optional(),
        location: z.string().optional(),
        brand: z.string().optional(),
        model: z.string().optional(),
        macAddress: z.string().optional(),
        status: z.enum(["online", "offline", "provisioning", "error"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateVoipPhone(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const phone = await db.getVoipPhoneById(input.id);
        if (phone?.sipEndpointId) {
          const endpoint = await db.getSipEndpointById(phone.sipEndpointId);
          if (endpoint?.telnyxCredentialConnectionId && telnyxApi.isConfigured()) {
            try {
              await telnyxApi.deleteCredentialConnection(endpoint.telnyxCredentialConnectionId);
            } catch (err) {
              console.error("Failed to delete Telnyx credential connection:", err);
            }
          }
          await db.deleteSipEndpoint(phone.sipEndpointId);
        }
        await db.deleteVoipPhone(input.id);
        return { success: true };
      }),

    // Get provisioning config for a phone
    getProvisioningConfig: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const phone = await db.getVoipPhoneById(input.id);
        if (!phone) throw new TRPCError({ code: 'NOT_FOUND' });

        const endpoint = phone.sipEndpointId
          ? await db.getSipEndpointById(phone.sipEndpointId)
          : null;

        return {
          sipServer: phone.sipServer,
          sipPort: phone.sipPort,
          transport: phone.transport,
          username: phone.sipUsername || endpoint?.username,
          password: endpoint?.password,
          // Codec preferences for VoIP phones
          codecs: ["G.711u", "G.711a", "G.729", "Opus"],
          // STUN server for NAT traversal
          stunServer: "stun.telnyx.com:3478",
        };
      }),
  }),

  // ============ PORT ORDERS (Number Porting) ============
  portOrders: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin' && ctx.user.customerId !== input.customerId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return db.getPortOrdersByCustomer(input.customerId);
      }),

    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getPortOrderById(input.id);
      }),

    // Create a number port order (Viirtue -> Telnyx)
    create: adminProcedure
      .input(z.object({
        customerId: z.number(),
        phoneNumbers: z.array(z.string().min(1)),
        currentCarrier: z.string().default("Viirtue"),
        accountNumber: z.string().optional(),
        authorizedName: z.string().min(1),
        streetAddress: z.string().min(1),
        city: z.string().min(1),
        state: z.string().min(1),
        postalCode: z.string().min(1),
        country: z.string().default("US"),
        pin: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Create port order in our database first
        const orderId = await db.createPortOrder({
          customerId: input.customerId,
          phoneNumbers: input.phoneNumbers,
          currentCarrier: input.currentCarrier,
          accountNumber: input.accountNumber,
          authorizedName: input.authorizedName,
          streetAddress: input.streetAddress,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
          country: input.country,
          status: 'draft',
        });

        // Submit to Telnyx if configured
        let telnyxPortOrderId: string | undefined;
        if (telnyxApi.isConfigured()) {
          try {
            const telnyxResult = await telnyxApi.createPortOrder({
              phone_numbers: input.phoneNumbers,
              authorized_name: input.authorizedName,
              service_address: {
                street_address: input.streetAddress,
                locality: input.city,
                administrative_area: input.state,
                postal_code: input.postalCode,
                country_code: input.country,
              },
              current_carrier: input.currentCarrier,
              account_number: input.accountNumber,
              pin: input.pin,
            });
            telnyxPortOrderId = telnyxResult.data?.id;

            await db.updatePortOrder(orderId, {
              telnyxPortOrderId,
              status: 'submitted',
            });
          } catch (err) {
            console.error("Failed to submit port order to Telnyx:", err);
            await db.updatePortOrder(orderId, {
              status: 'failed',
              errorMessage: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        }

        // Create phone number records for each number being ported
        for (const num of input.phoneNumbers) {
          await db.createPhoneNumber({
            customerId: input.customerId,
            phoneNumber: num,
            friendlyName: `Porting from ${input.currentCarrier}`,
            status: 'porting',
            portOrderId: telnyxPortOrderId || orderId.toString(),
            portedFrom: input.currentCarrier,
            provider: 'telnyx',
          });
        }

        return { id: orderId, telnyxPortOrderId };
      }),

    // Check port order status
    checkStatus: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const order = await db.getPortOrderById(input.id);
        if (!order) throw new TRPCError({ code: 'NOT_FOUND' });

        if (order.telnyxPortOrderId && telnyxApi.isConfigured()) {
          const telnyxOrder = await telnyxApi.getPortOrder(order.telnyxPortOrderId);
          const status = telnyxOrder.data?.status;

          // Map Telnyx status to our status
          let mappedStatus: 'draft' | 'submitted' | 'in_progress' | 'completed' | 'failed' | 'cancelled' = 'in_progress';
          if (status === 'porting') mappedStatus = 'in_progress';
          else if (status === 'port-complete' || status === 'completed') mappedStatus = 'completed';
          else if (status === 'failed' || status === 'rejected') mappedStatus = 'failed';
          else if (status === 'cancelled') mappedStatus = 'cancelled';
          else if (status === 'pending' || status === 'submitted') mappedStatus = 'submitted';

          await db.updatePortOrder(order.id, { status: mappedStatus });

          // If completed, update phone number records
          if (mappedStatus === 'completed') {
            const numbers = Array.isArray(order.phoneNumbers) ? order.phoneNumbers as string[] : [];
            for (const num of numbers) {
              const phoneNum = await db.getPhoneNumberByNumber(num);
              if (phoneNum) {
                await db.updatePhoneNumber(phoneNum.id, {
                  status: 'active',
                  portCompletedAt: new Date(),
                });
              }
            }
            await db.updatePortOrder(order.id, { completedAt: new Date() });
          }

          return { status: mappedStatus, telnyxStatus: status };
        }

        return { status: order.status };
      }),
  }),
});

// Helper to generate a secure SIP password
function generateSipPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export type AppRouter = typeof appRouter;
