import { COOKIE_NAME } from "@shared/const";
import { hasRole } from "@shared/rbac";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, viewerProcedure, operatorProcedure, adminProcedure, router } from "./_core/trpc";
import { writeAuditLog } from "./_core/audit";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { storagePut, storageGet } from "./storage";
import * as signalwire from "./signalwire";

// Customer procedure - viewer+ with customer binding check
const customerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.customerId && !hasRole(ctx.user.role, 'admin')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
  }
  return next({ ctx });
});

// Customer operator - operator+ with customer binding
const customerOperatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasRole(ctx.user.role, 'operator')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Operator access required' });
  }
  if (!ctx.user.customerId && !hasRole(ctx.user.role, 'admin')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Customer access required' });
  }
  return next({ ctx });
});

/** Helper: verify customer ownership or admin */
function assertCustomerAccess(ctx: { user: { role: string; customerId: number | null } }, customerId: number) {
  if (!hasRole(ctx.user.role, 'admin') && ctx.user.customerId !== customerId) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
}

/** Helper: audit a mutation */
function audit(ctx: { user: { id: number; email: string | null; role: string }; req: any }, action: string, resource: string, resourceId?: string | number, detail?: unknown) {
  writeAuditLog({
    userId: ctx.user.id,
    userEmail: ctx.user.email ?? undefined,
    userRole: ctx.user.role,
    action,
    resource,
    resourceId: resourceId != null ? String(resourceId) : undefined,
    detail: detail ?? undefined,
    outcome: "success",
    ipAddress: ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? undefined,
    userAgent: ctx.req.headers?.["user-agent"] ?? undefined,
  });
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      if (ctx.user) {
        audit(ctx as any, "logout", "session");
      }
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
      .mutation(async ({ input, ctx }) => {
        const id = await db.createCustomer({
          name: input.name,
          companyName: input.companyName || null,
          email: input.email,
          phone: input.phone || null,
          notes: input.notes || null,
          status: 'pending',
        });
        audit(ctx, "create", "customer", id, { name: input.name });
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
        smsSummaryEnabled: z.boolean().optional(),
        notificationPhone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateCustomer(id, data);
        audit(ctx, "update", "customer", id, { fields: Object.keys(data) });
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteCustomer(input.id);
        audit(ctx, "delete", "customer", input.id);
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
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateCustomer(id, data);
        audit(ctx, "update_branding", "customer", id);
        return { success: true };
      }),
  }),

  // ============ SIP ENDPOINTS ============
  sipEndpoints: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        assertCustomerAccess(ctx, input.customerId);
        return db.getSipEndpointsByCustomer(input.customerId);
      }),

    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getSipEndpointById(input.id);
      }),

    create: customerOperatorProcedure
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
        assertCustomerAccess(ctx, input.customerId);
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
        audit(ctx, "create", "sipEndpoint", id, { username: input.username });
        return { id };
      }),

    update: customerOperatorProcedure
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
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateSipEndpoint(id, data);
        audit(ctx, "update", "sipEndpoint", id);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteSipEndpoint(input.id);
        audit(ctx, "delete", "sipEndpoint", input.id);
        return { success: true };
      }),
  }),

  // ============ PHONE NUMBERS ============
  phoneNumbers: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        assertCustomerAccess(ctx, input.customerId);
        return db.getPhoneNumbersByCustomer(input.customerId);
      }),

    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getPhoneNumberById(input.id);
      }),

    create: customerOperatorProcedure
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
        assertCustomerAccess(ctx, input.customerId);
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
        audit(ctx, "create", "phoneNumber", id, { phoneNumber: input.phoneNumber });
        return { id };
      }),

    update: customerOperatorProcedure
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
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updatePhoneNumber(id, data);
        audit(ctx, "update", "phoneNumber", id);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deletePhoneNumber(input.id);
        audit(ctx, "delete", "phoneNumber", input.id);
        return { success: true };
      }),
  }),

  // ============ RING GROUPS ============
  ringGroups: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        assertCustomerAccess(ctx, input.customerId);
        return db.getRingGroupsByCustomer(input.customerId);
      }),

    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getRingGroupById(input.id);
      }),

    create: customerOperatorProcedure
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
        assertCustomerAccess(ctx, input.customerId);
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
        audit(ctx, "create", "ringGroup", id, { name: input.name });
        return { id };
      }),

    update: customerOperatorProcedure
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
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateRingGroup(id, data);
        audit(ctx, "update", "ringGroup", id);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteRingGroup(input.id);
        audit(ctx, "delete", "ringGroup", input.id);
        return { success: true };
      }),
  }),

  // ============ CALL ROUTES ============
  callRoutes: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        assertCustomerAccess(ctx, input.customerId);
        return db.getCallRoutesByCustomer(input.customerId);
      }),

    getById: customerProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getCallRouteById(input.id);
      }),

    create: customerOperatorProcedure
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
        assertCustomerAccess(ctx, input.customerId);
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
        audit(ctx, "create", "callRoute", id, { name: input.name });
        return { id };
      }),

    update: customerOperatorProcedure
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
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateCallRoute(id, data);
        audit(ctx, "update", "callRoute", id);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteCallRoute(input.id);
        audit(ctx, "delete", "callRoute", input.id);
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
        assertCustomerAccess(ctx, input.customerId);
        return db.getUsageStatsByCustomer(input.customerId, input.limit);
      }),
  }),

  // ============ CALL RECORDINGS ============
  recordings: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number(), limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        assertCustomerAccess(ctx, input.customerId);
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

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteCallRecording(input.id);
        audit(ctx, "delete", "callRecording", input.id);
        return { success: true };
      }),

    retentionPolicy: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        assertCustomerAccess(ctx, input.customerId);
        return db.getRetentionPolicy(input.customerId);
      }),

    updateRetentionPolicy: adminProcedure
      .input(z.object({
        customerId: z.number(),
        defaultRetentionDays: z.number().optional(),
        autoDeleteEnabled: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { customerId, ...policy } = input;
        await db.upsertRetentionPolicy(customerId, policy);
        audit(ctx, "update_retention", "customer", customerId, policy);
        return { success: true };
      }),
  }),

  // ============ NOTIFICATIONS ============
  notifications: router({
    list: customerProcedure
      .input(z.object({ customerId: z.number(), limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        assertCustomerAccess(ctx, input.customerId);
        return db.getNotificationsByCustomer(input.customerId, input.limit);
      }),

    unread: customerProcedure
      .input(z.object({ customerId: z.number() }))
      .query(async ({ input, ctx }) => {
        assertCustomerAccess(ctx, input.customerId);
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
        assertCustomerAccess(ctx, input.customerId);
        return db.getNotificationSettings(input.customerId);
      }),

    updateSettings: customerOperatorProcedure
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
        assertCustomerAccess(ctx, input.customerId);
        const { customerId, ...settings } = input;
        await db.upsertNotificationSettings(customerId, settings);
        audit(ctx, "update_notification_settings", "customer", customerId);
        return { success: true };
      }),
  }),

  // ============ SIGNALWIRE API ============
  signalwireApi: router({
    status: adminProcedure.query(async () => {
      return signalwire.getCredentialsSummary();
    }),

    accountInfo: adminProcedure.query(async () => {
      return signalwire.getAccountInfo();
    }),

    listSipEndpoints: adminProcedure.query(async () => {
      return signalwire.listSipEndpoints();
    }),

    createSipEndpoint: adminProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(8),
        callerId: z.string().optional(),
        callerIdName: z.string().optional(),
        callHandler: z.enum(['laml_webhooks', 'relay_context', 'relay_topic', 'ai_agent']).optional(),
        callRequestUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await signalwire.createSipEndpoint(input);
        audit(ctx, "sw_create_endpoint", "signalwire", undefined, { username: input.username });
        return result;
      }),

    updateSipEndpoint: adminProcedure
      .input(z.object({
        id: z.string(),
        callerId: z.string().optional(),
        callerIdName: z.string().optional(),
        callHandler: z.enum(['laml_webhooks', 'relay_context', 'relay_topic', 'ai_agent']).optional(),
        callRequestUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...params } = input;
        const result = await signalwire.updateSipEndpoint(id, params);
        audit(ctx, "sw_update_endpoint", "signalwire", id);
        return result;
      }),

    deleteSipEndpoint: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const result = await signalwire.deleteSipEndpoint(input.id);
        audit(ctx, "sw_delete_endpoint", "signalwire", input.id);
        return result;
      }),

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

    listPhoneNumbers: adminProcedure.query(async () => {
      return signalwire.listPhoneNumbers();
    }),

    purchasePhoneNumber: adminProcedure
      .input(z.object({
        phoneNumber: z.string(),
        friendlyName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await signalwire.purchasePhoneNumber(input.phoneNumber, input.friendlyName);
        audit(ctx, "sw_purchase_number", "signalwire", undefined, { phoneNumber: input.phoneNumber });
        return result;
      }),

    updatePhoneNumber: adminProcedure
      .input(z.object({
        sid: z.string(),
        friendlyName: z.string().optional(),
        voiceUrl: z.string().optional(),
        voiceMethod: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { sid, ...params } = input;
        const result = await signalwire.updatePhoneNumber(sid, params);
        audit(ctx, "sw_update_number", "signalwire", sid);
        return result;
      }),

    releasePhoneNumber: adminProcedure
      .input(z.object({ sid: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const result = await signalwire.releasePhoneNumber(input.sid);
        audit(ctx, "sw_release_number", "signalwire", input.sid);
        return result;
      }),

    listCalls: adminProcedure
      .input(z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        status: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return signalwire.listCalls(input);
      }),

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
        assertCustomerAccess(ctx, input.customerId);
        return db.getLlmCallFlowsByCustomer(input.customerId);
      }),

    create: customerOperatorProcedure
      .input(z.object({
        customerId: z.number(),
        name: z.string().min(1),
        naturalLanguageConfig: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        assertCustomerAccess(ctx, input.customerId);

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

        audit(ctx, "create", "llmCallFlow", id, { name: input.name });
        return { id, generatedLaml };
      }),

    regenerate: customerOperatorProcedure
      .input(z.object({
        id: z.number(),
        naturalLanguageConfig: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
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

        audit(ctx, "regenerate", "llmCallFlow", input.id);
        return { generatedLaml };
      }),

    activate: customerOperatorProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        await db.updateLlmCallFlow(input.id, { isActive: input.isActive });
        audit(ctx, input.isActive ? "activate" : "deactivate", "llmCallFlow", input.id);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteLlmCallFlow(input.id);
        audit(ctx, "delete", "llmCallFlow", input.id);
        return { success: true };
      }),

    getRoutingSuggestions: customerProcedure
      .input(z.object({
        customerId: z.number(),
        context: z.string(),
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

  // ============ AUDIT LOGS (admin-only read access) ============
  auditLogs: router({
    list: adminProcedure
      .input(z.object({
        limit: z.number().min(1).max(500).optional(),
        offset: z.number().min(0).optional(),
        userId: z.number().optional(),
        action: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return db.getAuditLogs(input ?? {});
      }),
  }),

  // ============ METRICS HISTORY ============
  metrics: router({
    history: adminProcedure
      .input(z.object({
        metricName: z.string(),
        customerId: z.number().optional(),
        limit: z.number().min(1).max(500).optional(),
      }))
      .query(async ({ input }) => {
        return db.getMetricsHistory(input.metricName, {
          customerId: input.customerId,
          limit: input.limit,
        });
      }),

    record: adminProcedure
      .input(z.object({
        metricName: z.string(),
        metricValue: z.number(),
        customerId: z.number().optional(),
        tags: z.record(z.string(), z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        await db.recordMetric({
          metricName: input.metricName,
          metricValue: input.metricValue,
          customerId: input.customerId ?? null,
          tags: input.tags ?? null,
        });
        return { success: true };
      }),
  }),

  // ============ ALERT RULES & EVENTS ============
  alerts: router({
    rules: router({
      list: adminProcedure
        .input(z.object({ customerId: z.number().optional() }).optional())
        .query(async ({ input }) => {
          return db.getAlertRules(input?.customerId);
        }),

      create: adminProcedure
        .input(z.object({
          name: z.string().min(1),
          metricName: z.string(),
          operator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq']),
          threshold: z.number(),
          customerId: z.number().optional(),
          enabled: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const id = await db.createAlertRule({
            name: input.name,
            metricName: input.metricName,
            operator: input.operator,
            threshold: input.threshold,
            customerId: input.customerId ?? null,
            enabled: input.enabled ?? true,
          });
          audit(ctx, "create", "alertRule", id, { name: input.name });
          return { id };
        }),

      update: adminProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          metricName: z.string().optional(),
          operator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq']).optional(),
          threshold: z.number().optional(),
          enabled: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateAlertRule(id, data);
          audit(ctx, "update", "alertRule", id);
          return { success: true };
        }),

      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteAlertRule(input.id);
          audit(ctx, "delete", "alertRule", input.id);
          return { success: true };
        }),
    }),

    events: router({
      list: adminProcedure
        .input(z.object({
          alertRuleId: z.number().optional(),
          limit: z.number().min(1).max(200).optional(),
        }).optional())
        .query(async ({ input }) => {
          return db.getAlertEvents(input ?? {});
        }),

      acknowledge: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.acknowledgeAlertEvent(input.id);
          audit(ctx, "acknowledge", "alertEvent", input.id);
          return { success: true };
        }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
