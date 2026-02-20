import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extended with role for admin/customer separation.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  customerId: int("customerId"), // Links to customer for customer portal users
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Customers table - each customer has their own isolated PBX environment
 */
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  companyName: varchar("companyName", { length: 255 }),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  status: mysqlEnum("status", ["active", "suspended", "pending", "cancelled"]).default("pending").notNull(),
  // SignalWire subproject integration
  signalwireSubprojectSid: varchar("signalwireSubprojectSid", { length: 64 }),
  signalwireApiToken: text("signalwireApiToken"),
  signalwireSpaceUrl: varchar("signalwireSpaceUrl", { length: 255 }),
  // Branding settings
  brandingLogo: text("brandingLogo"), // S3 URL
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

/**
 * SIP Endpoints - managed per customer
 */
export const sipEndpoints = mysqlTable("sipEndpoints", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  signalwireEndpointId: varchar("signalwireEndpointId", { length: 64 }),
  username: varchar("username", { length: 64 }).notNull(),
  password: text("password"),
  callerId: varchar("callerId", { length: 64 }),
  sendAs: varchar("sendAs", { length: 32 }),
  displayName: varchar("displayName", { length: 128 }),
  extensionNumber: varchar("extensionNumber", { length: 16 }),
  status: mysqlEnum("status", ["active", "inactive", "provisioning"]).default("provisioning").notNull(),
  // Call handler configuration
  callHandler: mysqlEnum("callHandler", ["laml_webhooks", "relay_context", "relay_topic", "ai_agent", "video_room"]).default("laml_webhooks"),
  callRequestUrl: text("callRequestUrl"),
  callRequestMethod: mysqlEnum("callRequestMethod", ["GET", "POST"]).default("POST"),
  callRelayContext: varchar("callRelayContext", { length: 64 }),
  callAiAgentId: varchar("callAiAgentId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SipEndpoint = typeof sipEndpoints.$inferSelect;
export type InsertSipEndpoint = typeof sipEndpoints.$inferInsert;

/**
 * Phone Numbers - provisioned and assigned per customer
 */
export const phoneNumbers = mysqlTable("phoneNumbers", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  signalwirePhoneNumberSid: varchar("signalwirePhoneNumberSid", { length: 64 }),
  phoneNumber: varchar("phoneNumber", { length: 32 }).notNull(),
  friendlyName: varchar("friendlyName", { length: 128 }),
  voiceEnabled: boolean("voiceEnabled").default(true),
  smsEnabled: boolean("smsEnabled").default(false),
  faxEnabled: boolean("faxEnabled").default(false),
  // Assignment
  assignedToEndpointId: int("assignedToEndpointId"),
  assignedToRingGroupId: int("assignedToRingGroupId"),
  // Call handler
  callHandler: mysqlEnum("callHandler", ["laml_webhooks", "relay_context", "relay_topic", "ai_agent", "sip_endpoint", "ring_group"]).default("laml_webhooks"),
  callRequestUrl: text("callRequestUrl"),
  callRelayContext: varchar("callRelayContext", { length: 64 }),
  status: mysqlEnum("status", ["active", "inactive", "porting"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type InsertPhoneNumber = typeof phoneNumbers.$inferInsert;

/**
 * Ring Groups - group multiple endpoints for call distribution
 */
export const ringGroups = mysqlTable("ringGroups", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  extensionNumber: varchar("extensionNumber", { length: 16 }),
  strategy: mysqlEnum("strategy", ["simultaneous", "sequential", "round_robin", "random"]).default("simultaneous").notNull(),
  ringTimeout: int("ringTimeout").default(30),
  memberEndpointIds: json("memberEndpointIds"), // Array of endpoint IDs
  // Failover configuration
  failoverAction: mysqlEnum("failoverAction", ["voicemail", "forward", "hangup"]).default("voicemail"),
  failoverDestination: varchar("failoverDestination", { length: 128 }),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RingGroup = typeof ringGroups.$inferSelect;
export type InsertRingGroup = typeof ringGroups.$inferInsert;

/**
 * Call Routes - routing rules for incoming calls
 */
export const callRoutes = mysqlTable("callRoutes", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  priority: int("priority").default(0),
  // Match conditions
  matchType: mysqlEnum("matchType", ["all", "caller_id", "time_based", "did"]).default("all").notNull(),
  matchPattern: varchar("matchPattern", { length: 128 }),
  // Time-based routing
  timeStart: varchar("timeStart", { length: 8 }), // HH:MM format
  timeEnd: varchar("timeEnd", { length: 8 }),
  daysOfWeek: json("daysOfWeek"), // Array of day numbers 0-6
  // Destination
  destinationType: mysqlEnum("destinationType", ["endpoint", "ring_group", "external", "voicemail", "ai_agent"]).default("endpoint").notNull(),
  destinationId: int("destinationId"),
  destinationExternal: varchar("destinationExternal", { length: 128 }),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CallRoute = typeof callRoutes.$inferSelect;
export type InsertCallRoute = typeof callRoutes.$inferInsert;

/**
 * Usage Statistics - track usage per customer per period
 */
export const usageStats = mysqlTable("usageStats", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  totalCalls: int("totalCalls").default(0),
  inboundCalls: int("inboundCalls").default(0),
  outboundCalls: int("outboundCalls").default(0),
  totalMinutes: int("totalMinutes").default(0),
  missedCalls: int("missedCalls").default(0),
  activeEndpoints: int("activeEndpoints").default(0),
  activePhoneNumbers: int("activePhoneNumbers").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UsageStats = typeof usageStats.$inferSelect;
export type InsertUsageStats = typeof usageStats.$inferInsert;

/**
 * Call Recordings - metadata for recordings stored in S3
 */
export const callRecordings = mysqlTable("callRecordings", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  callSid: varchar("callSid", { length: 64 }),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  fromNumber: varchar("fromNumber", { length: 32 }),
  toNumber: varchar("toNumber", { length: 32 }),
  duration: int("duration"), // seconds
  recordingUrl: text("recordingUrl"), // S3 URL
  recordingKey: varchar("recordingKey", { length: 255 }), // S3 key
  transcription: text("transcription"),
  summary: text("summary"), // LLM-generated summary
  status: mysqlEnum("status", ["processing", "ready", "failed", "deleted"]).default("processing").notNull(),
  retentionDays: int("retentionDays").default(90),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CallRecording = typeof callRecordings.$inferSelect;
export type InsertCallRecording = typeof callRecordings.$inferInsert;

/**
 * Notifications - in-app and email notifications
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  userId: int("userId"),
  type: mysqlEnum("type", ["missed_call", "voicemail", "high_volume", "system", "recording_ready"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  metadata: json("metadata"), // Additional data like call details
  isRead: boolean("isRead").default(false),
  emailSent: boolean("emailSent").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Notification Settings - per customer notification preferences
 */
export const notificationSettings = mysqlTable("notificationSettings", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull().unique(),
  missedCallEmail: boolean("missedCallEmail").default(true),
  missedCallInApp: boolean("missedCallInApp").default(true),
  voicemailEmail: boolean("voicemailEmail").default(true),
  voicemailInApp: boolean("voicemailInApp").default(true),
  highVolumeEmail: boolean("highVolumeEmail").default(false),
  highVolumeInApp: boolean("highVolumeInApp").default(true),
  highVolumeThreshold: int("highVolumeThreshold").default(100), // calls per hour
  recordingReadyEmail: boolean("recordingReadyEmail").default(false),
  recordingReadyInApp: boolean("recordingReadyInApp").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;

/**
 * LLM Call Flow Configurations - natural language call flow definitions
 */
export const llmCallFlows = mysqlTable("llmCallFlows", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  naturalLanguageConfig: text("naturalLanguageConfig"), // User's natural language description
  generatedLaml: text("generatedLaml"), // LLM-generated LaML
  isActive: boolean("isActive").default(false),
  lastGeneratedAt: timestamp("lastGeneratedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LlmCallFlow = typeof llmCallFlows.$inferSelect;
export type InsertLlmCallFlow = typeof llmCallFlows.$inferInsert;

/**
 * Retention Policies - per customer recording retention settings
 */
export const retentionPolicies = mysqlTable("retentionPolicies", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull().unique(),
  defaultRetentionDays: int("defaultRetentionDays").default(90),
  autoDeleteEnabled: boolean("autoDeleteEnabled").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RetentionPolicy = typeof retentionPolicies.$inferSelect;
export type InsertRetentionPolicy = typeof retentionPolicies.$inferInsert;

/**
 * Local Credentials - username/password authentication for customer portal access
 */
export const localCredentials = mysqlTable("local_credentials", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LocalCredential = typeof localCredentials.$inferSelect;
export type InsertLocalCredential = typeof localCredentials.$inferInsert;
