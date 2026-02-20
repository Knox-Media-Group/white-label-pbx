import { serial, integer, pgEnum, pgTable, text, timestamp, varchar, boolean, jsonb } from "drizzle-orm/pg-core";

// ============ ENUMS ============
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const customerStatusEnum = pgEnum("customer_status", ["active", "suspended", "pending", "cancelled"]);
export const telephonyProviderEnum = pgEnum("telephony_provider", ["signalwire", "telnyx"]);
export const endpointStatusEnum = pgEnum("endpoint_status", ["active", "inactive", "provisioning"]);
export const callHandlerEnum = pgEnum("call_handler", ["laml_webhooks", "relay_context", "relay_topic", "ai_agent", "video_room"]);
export const httpMethodEnum = pgEnum("http_method", ["GET", "POST"]);
export const phoneCallHandlerEnum = pgEnum("phone_call_handler", ["laml_webhooks", "relay_context", "relay_topic", "ai_agent", "sip_endpoint", "ring_group", "retell_agent"]);
export const phoneStatusEnum = pgEnum("phone_status", ["active", "inactive", "porting"]);
export const ringStrategyEnum = pgEnum("ring_strategy", ["simultaneous", "sequential", "round_robin", "random"]);
export const failoverActionEnum = pgEnum("failover_action", ["voicemail", "forward", "hangup"]);
export const activeInactiveEnum = pgEnum("active_inactive", ["active", "inactive"]);
export const matchTypeEnum = pgEnum("match_type", ["all", "caller_id", "time_based", "did"]);
export const destinationTypeEnum = pgEnum("destination_type", ["endpoint", "ring_group", "external", "voicemail", "ai_agent"]);
export const callDirectionEnum = pgEnum("call_direction", ["inbound", "outbound"]);
export const recordingStatusEnum = pgEnum("recording_status", ["processing", "ready", "failed", "deleted"]);
export const notificationTypeEnum = pgEnum("notification_type", ["missed_call", "voicemail", "high_volume", "system", "recording_ready"]);
export const retellAgentStatusEnum = pgEnum("retell_agent_status", ["active", "inactive", "configuring"]);
export const transportEnum = pgEnum("transport", ["UDP", "TCP", "TLS"]);
export const voipPhoneStatusEnum = pgEnum("voip_phone_status", ["online", "offline", "provisioning", "error"]);
export const portOrderStatusEnum = pgEnum("port_order_status", ["draft", "submitted", "in_progress", "completed", "failed", "cancelled"]);

/**
 * Core user table backing auth flow.
 * Extended with role for admin/customer separation.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: text("passwordHash"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  customerId: integer("customerId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Customers table - each customer has their own isolated PBX environment
 */
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  companyName: varchar("companyName", { length: 255 }),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  status: customerStatusEnum("status").default("pending").notNull(),
  // SignalWire subproject integration (legacy)
  signalwireSubprojectSid: varchar("signalwireSubprojectSid", { length: 64 }),
  signalwireApiToken: text("signalwireApiToken"),
  signalwireSpaceUrl: varchar("signalwireSpaceUrl", { length: 255 }),
  // Telnyx integration
  telnyxConnectionId: varchar("telnyxConnectionId", { length: 64 }),
  telnyxCredentialConnectionId: varchar("telnyxCredentialConnectionId", { length: 64 }),
  telnyxTexmlAppId: varchar("telnyxTexmlAppId", { length: 64 }),
  telnyxOutboundProfileId: varchar("telnyxOutboundProfileId", { length: 64 }),
  telnyxSipDomain: varchar("telnyxSipDomain", { length: 255 }),
  // Retell AI integration
  retellAgentId: varchar("retellAgentId", { length: 64 }),
  retellLlmId: varchar("retellLlmId", { length: 64 }),
  retellGreeting: text("retellGreeting"),
  retellEnabled: boolean("retellEnabled").default(false),
  // Telephony provider preference
  telephonyProvider: telephonyProviderEnum("telephonyProvider").default("telnyx"),
  // Branding settings
  brandingLogo: text("brandingLogo"),
  brandingPrimaryColor: varchar("brandingPrimaryColor", { length: 7 }).default("#6366f1"),
  brandingCompanyName: varchar("brandingCompanyName", { length: 255 }),
  // Portal access
  portalUsername: varchar("portalUsername", { length: 64 }).unique(),
  portalPasswordHash: text("portalPasswordHash"),
  notes: text("notes"),
  // SMS Summary settings
  smsSummaryEnabled: boolean("smsSummaryEnabled").default(true),
  notificationPhone: varchar("notificationPhone", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

/**
 * SIP Endpoints - managed per customer
 * Supports both SignalWire and Telnyx credential connections
 */
export const sipEndpoints = pgTable("sipEndpoints", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  signalwireEndpointId: varchar("signalwireEndpointId", { length: 64 }),
  telnyxCredentialConnectionId: varchar("telnyxCredentialConnectionId", { length: 64 }),
  telnyxSipUsername: varchar("telnyxSipUsername", { length: 128 }),
  username: varchar("username", { length: 64 }).notNull(),
  password: text("password"),
  callerId: varchar("callerId", { length: 64 }),
  sendAs: varchar("sendAs", { length: 32 }),
  displayName: varchar("displayName", { length: 128 }),
  extensionNumber: varchar("extensionNumber", { length: 16 }),
  // VoIP phone details
  phoneModel: varchar("phoneModel", { length: 128 }),
  macAddress: varchar("macAddress", { length: 17 }),
  status: endpointStatusEnum("status").default("provisioning").notNull(),
  // Call handler configuration
  callHandler: callHandlerEnum("callHandler").default("laml_webhooks"),
  callRequestUrl: text("callRequestUrl"),
  callRequestMethod: httpMethodEnum("callRequestMethod").default("POST"),
  callRelayContext: varchar("callRelayContext", { length: 64 }),
  callAiAgentId: varchar("callAiAgentId", { length: 64 }),
  // Provider tracking
  provider: telephonyProviderEnum("provider").default("telnyx"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SipEndpoint = typeof sipEndpoints.$inferSelect;
export type InsertSipEndpoint = typeof sipEndpoints.$inferInsert;

/**
 * Phone Numbers - provisioned and assigned per customer
 * Supports SignalWire, Telnyx, and Retell AI managed numbers
 */
export const phoneNumbers = pgTable("phoneNumbers", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  signalwirePhoneNumberSid: varchar("signalwirePhoneNumberSid", { length: 64 }),
  telnyxPhoneNumberId: varchar("telnyxPhoneNumberId", { length: 64 }),
  telnyxConnectionId: varchar("telnyxConnectionId", { length: 64 }),
  retellPhoneNumberId: varchar("retellPhoneNumberId", { length: 64 }),
  retellAgentId: varchar("retellAgentId", { length: 64 }),
  phoneNumber: varchar("phoneNumber", { length: 32 }).notNull(),
  friendlyName: varchar("friendlyName", { length: 128 }),
  voiceEnabled: boolean("voiceEnabled").default(true),
  smsEnabled: boolean("smsEnabled").default(false),
  faxEnabled: boolean("faxEnabled").default(false),
  // Assignment
  assignedToEndpointId: integer("assignedToEndpointId"),
  assignedToRingGroupId: integer("assignedToRingGroupId"),
  // Call handler
  callHandler: phoneCallHandlerEnum("callHandler").default("laml_webhooks"),
  callRequestUrl: text("callRequestUrl"),
  callRelayContext: varchar("callRelayContext", { length: 64 }),
  status: phoneStatusEnum("status").default("active").notNull(),
  // Number porting tracking
  portOrderId: varchar("portOrderId", { length: 64 }),
  portedFrom: varchar("portedFrom", { length: 64 }),
  portCompletedAt: timestamp("portCompletedAt"),
  // Provider tracking
  provider: telephonyProviderEnum("provider").default("telnyx"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type InsertPhoneNumber = typeof phoneNumbers.$inferInsert;

/**
 * Ring Groups - group multiple endpoints for call distribution
 */
export const ringGroups = pgTable("ringGroups", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  extensionNumber: varchar("extensionNumber", { length: 16 }),
  strategy: ringStrategyEnum("strategy").default("simultaneous").notNull(),
  ringTimeout: integer("ringTimeout").default(30),
  memberEndpointIds: jsonb("memberEndpointIds"),
  // Failover configuration
  failoverAction: failoverActionEnum("failoverAction").default("voicemail"),
  failoverDestination: varchar("failoverDestination", { length: 128 }),
  status: activeInactiveEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type RingGroup = typeof ringGroups.$inferSelect;
export type InsertRingGroup = typeof ringGroups.$inferInsert;

/**
 * Call Routes - routing rules for incoming calls
 */
export const callRoutes = pgTable("callRoutes", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  priority: integer("priority").default(0),
  // Match conditions
  matchType: matchTypeEnum("matchType").default("all").notNull(),
  matchPattern: varchar("matchPattern", { length: 128 }),
  // Time-based routing
  timeStart: varchar("timeStart", { length: 8 }),
  timeEnd: varchar("timeEnd", { length: 8 }),
  daysOfWeek: jsonb("daysOfWeek"),
  // Destination
  destinationType: destinationTypeEnum("destinationType").default("endpoint").notNull(),
  destinationId: integer("destinationId"),
  destinationExternal: varchar("destinationExternal", { length: 128 }),
  status: activeInactiveEnum("callRouteStatus").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type CallRoute = typeof callRoutes.$inferSelect;
export type InsertCallRoute = typeof callRoutes.$inferInsert;

/**
 * Usage Statistics - track usage per customer per period
 */
export const usageStats = pgTable("usageStats", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  totalCalls: integer("totalCalls").default(0),
  inboundCalls: integer("inboundCalls").default(0),
  outboundCalls: integer("outboundCalls").default(0),
  totalMinutes: integer("totalMinutes").default(0),
  missedCalls: integer("missedCalls").default(0),
  activeEndpoints: integer("activeEndpoints").default(0),
  activePhoneNumbers: integer("activePhoneNumbers").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UsageStats = typeof usageStats.$inferSelect;
export type InsertUsageStats = typeof usageStats.$inferInsert;

/**
 * Call Recordings - metadata for recordings stored in S3
 */
export const callRecordings = pgTable("callRecordings", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  callSid: varchar("callSid", { length: 64 }),
  direction: callDirectionEnum("direction").notNull(),
  fromNumber: varchar("fromNumber", { length: 32 }),
  toNumber: varchar("toNumber", { length: 32 }),
  duration: integer("duration"),
  recordingUrl: text("recordingUrl"),
  recordingKey: varchar("recordingKey", { length: 255 }),
  transcription: text("transcription"),
  summary: text("summary"),
  status: recordingStatusEnum("recordingStatus").default("processing").notNull(),
  retentionDays: integer("retentionDays").default(90),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallRecording = typeof callRecordings.$inferSelect;
export type InsertCallRecording = typeof callRecordings.$inferInsert;

/**
 * Notifications - in-app and email notifications
 */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  userId: integer("userId"),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  metadata: jsonb("metadata"),
  isRead: boolean("isRead").default(false),
  emailSent: boolean("emailSent").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Notification Settings - per customer notification preferences
 */
export const notificationSettings = pgTable("notificationSettings", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull().unique(),
  missedCallEmail: boolean("missedCallEmail").default(true),
  missedCallInApp: boolean("missedCallInApp").default(true),
  voicemailEmail: boolean("voicemailEmail").default(true),
  voicemailInApp: boolean("voicemailInApp").default(true),
  highVolumeEmail: boolean("highVolumeEmail").default(false),
  highVolumeInApp: boolean("highVolumeInApp").default(true),
  highVolumeThreshold: integer("highVolumeThreshold").default(100),
  recordingReadyEmail: boolean("recordingReadyEmail").default(false),
  recordingReadyInApp: boolean("recordingReadyInApp").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;

/**
 * LLM Call Flow Configurations - natural language call flow definitions
 */
export const llmCallFlows = pgTable("llmCallFlows", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  naturalLanguageConfig: text("naturalLanguageConfig"),
  generatedLaml: text("generatedLaml"),
  isActive: boolean("isActive").default(false),
  lastGeneratedAt: timestamp("lastGeneratedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type LlmCallFlow = typeof llmCallFlows.$inferSelect;
export type InsertLlmCallFlow = typeof llmCallFlows.$inferInsert;

/**
 * Retention Policies - per customer recording retention settings
 */
export const retentionPolicies = pgTable("retentionPolicies", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull().unique(),
  defaultRetentionDays: integer("defaultRetentionDays").default(90),
  autoDeleteEnabled: boolean("autoDeleteEnabled").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type RetentionPolicy = typeof retentionPolicies.$inferSelect;
export type InsertRetentionPolicy = typeof retentionPolicies.$inferInsert;

/**
 * Retell AI Agents - AI receptionist configurations per customer
 */
export const retellAgents = pgTable("retellAgents", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  retellAgentId: varchar("retellAgentId", { length: 64 }).notNull(),
  retellLlmId: varchar("retellLlmId", { length: 64 }),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  greeting: text("greeting"),
  voiceId: varchar("voiceId", { length: 64 }),
  language: varchar("language", { length: 16 }).default("en-US"),
  departments: jsonb("departments"),
  enablePostCallAnalysis: boolean("enablePostCallAnalysis").default(true),
  enableVoicemailDetection: boolean("enableVoicemailDetection").default(true),
  voicemailMessage: text("voicemailMessage"),
  maxCallDurationMs: integer("maxCallDurationMs").default(600000),
  status: retellAgentStatusEnum("retellAgentStatus").default("configuring").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type RetellAgent = typeof retellAgents.$inferSelect;
export type InsertRetellAgent = typeof retellAgents.$inferInsert;

/**
 * VoIP Phones - physical desk phone inventory and configuration
 */
export const voipPhones = pgTable("voipPhones", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  sipEndpointId: integer("sipEndpointId"),
  brand: varchar("brand", { length: 64 }),
  model: varchar("model", { length: 64 }),
  macAddress: varchar("macAddress", { length: 17 }),
  ipAddress: varchar("ipAddress", { length: 45 }),
  firmwareVersion: varchar("firmwareVersion", { length: 32 }),
  sipServer: varchar("sipServer", { length: 255 }),
  sipUsername: varchar("sipUsername", { length: 64 }),
  sipPort: integer("sipPort").default(5060),
  transport: transportEnum("transport").default("UDP"),
  label: varchar("label", { length: 128 }),
  location: varchar("location", { length: 128 }),
  provisioningUrl: text("provisioningUrl"),
  lastRegisteredAt: timestamp("lastRegisteredAt"),
  status: voipPhoneStatusEnum("voipPhoneStatus").default("provisioning").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type VoipPhone = typeof voipPhones.$inferSelect;
export type InsertVoipPhone = typeof voipPhones.$inferInsert;

/**
 * Number Port Orders - tracking number transfers from Viirtue/other carriers
 */
export const portOrders = pgTable("portOrders", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  telnyxPortOrderId: varchar("telnyxPortOrderId", { length: 64 }),
  phoneNumbers: jsonb("phoneNumbers"),
  currentCarrier: varchar("currentCarrier", { length: 128 }),
  accountNumber: varchar("accountNumber", { length: 64 }),
  authorizedName: varchar("authorizedName", { length: 128 }),
  streetAddress: varchar("streetAddress", { length: 255 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  postalCode: varchar("postalCode", { length: 16 }),
  country: varchar("country", { length: 2 }).default("US"),
  status: portOrderStatusEnum("portOrderStatus").default("draft").notNull(),
  focDate: timestamp("focDate"),
  completedAt: timestamp("completedAt"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PortOrder = typeof portOrders.$inferSelect;
export type InsertPortOrder = typeof portOrders.$inferInsert;
