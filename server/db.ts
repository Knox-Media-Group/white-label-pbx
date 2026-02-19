import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  customers, InsertCustomer, Customer,
  sipEndpoints, InsertSipEndpoint, SipEndpoint,
  phoneNumbers, InsertPhoneNumber, PhoneNumber,
  ringGroups, InsertRingGroup, RingGroup,
  callRoutes, InsertCallRoute, CallRoute,
  usageStats, InsertUsageStats, UsageStats,
  callRecordings, InsertCallRecording, CallRecording,
  notifications, InsertNotification, Notification,
  notificationSettings, InsertNotificationSettings, NotificationSettings,
  llmCallFlows, InsertLlmCallFlow, LlmCallFlow,
  retentionPolicies, InsertRetentionPolicy, RetentionPolicy,
  retellAgents, InsertRetellAgent, RetellAgent,
  voipPhones, InsertVoipPhone, VoipPhone,
  portOrders, InsertPortOrder, PortOrder,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USER OPERATIONS ============
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (user.customerId !== undefined) {
      values.customerId = user.customerId;
      updateSet.customerId = user.customerId;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAdminUser() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserPassword(id: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
}

// ============ CUSTOMER OPERATIONS ============
export async function createCustomer(customer: InsertCustomer): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(customers).values(customer);
  return result[0].insertId;
}

export async function getCustomerById(id: number): Promise<Customer | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return result[0];
}

export async function getAllCustomers(): Promise<Customer[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customers).orderBy(desc(customers.createdAt));
}

export async function updateCustomer(id: number, data: Partial<InsertCustomer>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(customers).set(data).where(eq(customers.id, id));
}

export async function deleteCustomer(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(customers).where(eq(customers.id, id));
}

export async function getCustomerStats(): Promise<{ total: number; active: number; pending: number; suspended: number }> {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, pending: 0, suspended: 0 };
  const all = await db.select().from(customers);
  return {
    total: all.length,
    active: all.filter(c => c.status === 'active').length,
    pending: all.filter(c => c.status === 'pending').length,
    suspended: all.filter(c => c.status === 'suspended').length,
  };
}

// ============ SIP ENDPOINT OPERATIONS ============
export async function createSipEndpoint(endpoint: InsertSipEndpoint): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(sipEndpoints).values(endpoint);
  return result[0].insertId;
}

export async function getSipEndpointById(id: number): Promise<SipEndpoint | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(sipEndpoints).where(eq(sipEndpoints.id, id)).limit(1);
  return result[0];
}

export async function getSipEndpointsByCustomer(customerId: number): Promise<SipEndpoint[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sipEndpoints).where(eq(sipEndpoints.customerId, customerId)).orderBy(desc(sipEndpoints.createdAt));
}

export async function updateSipEndpoint(id: number, data: Partial<InsertSipEndpoint>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(sipEndpoints).set(data).where(eq(sipEndpoints.id, id));
}

export async function deleteSipEndpoint(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(sipEndpoints).where(eq(sipEndpoints.id, id));
}

// ============ PHONE NUMBER OPERATIONS ============
export async function createPhoneNumber(phone: InsertPhoneNumber): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(phoneNumbers).values(phone);
  return result[0].insertId;
}

export async function getPhoneNumberById(id: number): Promise<PhoneNumber | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(phoneNumbers).where(eq(phoneNumbers.id, id)).limit(1);
  return result[0];
}

export async function getPhoneNumbersByCustomer(customerId: number): Promise<PhoneNumber[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(phoneNumbers).where(eq(phoneNumbers.customerId, customerId)).orderBy(desc(phoneNumbers.createdAt));
}

export async function updatePhoneNumber(id: number, data: Partial<InsertPhoneNumber>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(phoneNumbers).set(data).where(eq(phoneNumbers.id, id));
}

export async function deletePhoneNumber(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(phoneNumbers).where(eq(phoneNumbers.id, id));
}

// ============ RING GROUP OPERATIONS ============
export async function createRingGroup(group: InsertRingGroup): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(ringGroups).values(group);
  return result[0].insertId;
}

export async function getRingGroupById(id: number): Promise<RingGroup | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ringGroups).where(eq(ringGroups.id, id)).limit(1);
  return result[0];
}

export async function getRingGroupsByCustomer(customerId: number): Promise<RingGroup[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ringGroups).where(eq(ringGroups.customerId, customerId)).orderBy(desc(ringGroups.createdAt));
}

export async function updateRingGroup(id: number, data: Partial<InsertRingGroup>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(ringGroups).set(data).where(eq(ringGroups.id, id));
}

export async function deleteRingGroup(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ringGroups).where(eq(ringGroups.id, id));
}

// ============ CALL ROUTE OPERATIONS ============
export async function createCallRoute(route: InsertCallRoute): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(callRoutes).values(route);
  return result[0].insertId;
}

export async function getCallRouteById(id: number): Promise<CallRoute | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(callRoutes).where(eq(callRoutes.id, id)).limit(1);
  return result[0];
}

export async function getCallRoutesByCustomer(customerId: number): Promise<CallRoute[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callRoutes).where(eq(callRoutes.customerId, customerId)).orderBy(desc(callRoutes.priority));
}

export async function updateCallRoute(id: number, data: Partial<InsertCallRoute>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(callRoutes).set(data).where(eq(callRoutes.id, id));
}

export async function deleteCallRoute(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(callRoutes).where(eq(callRoutes.id, id));
}

// ============ USAGE STATS OPERATIONS ============
export async function createUsageStats(stats: InsertUsageStats): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(usageStats).values(stats);
  return result[0].insertId;
}

export async function getUsageStatsByCustomer(customerId: number, limit = 30): Promise<UsageStats[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(usageStats).where(eq(usageStats.customerId, customerId)).orderBy(desc(usageStats.periodStart)).limit(limit);
}

export async function getGlobalUsageStats(): Promise<{ totalCalls: number; totalMinutes: number; totalEndpoints: number; totalPhoneNumbers: number }> {
  const db = await getDb();
  if (!db) return { totalCalls: 0, totalMinutes: 0, totalEndpoints: 0, totalPhoneNumbers: 0 };
  
  const endpoints = await db.select().from(sipEndpoints).where(eq(sipEndpoints.status, 'active'));
  const phones = await db.select().from(phoneNumbers).where(eq(phoneNumbers.status, 'active'));
  const stats = await db.select().from(usageStats);
  
  return {
    totalCalls: stats.reduce((sum, s) => sum + (s.totalCalls || 0), 0),
    totalMinutes: stats.reduce((sum, s) => sum + (s.totalMinutes || 0), 0),
    totalEndpoints: endpoints.length,
    totalPhoneNumbers: phones.length,
  };
}

// ============ CALL RECORDING OPERATIONS ============
export async function createCallRecording(recording: InsertCallRecording): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(callRecordings).values(recording);
  return result[0].insertId;
}

export async function getCallRecordingById(id: number): Promise<CallRecording | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(callRecordings).where(eq(callRecordings.id, id)).limit(1);
  return result[0];
}

export async function getCallRecordingsByCustomer(customerId: number, limit = 50): Promise<CallRecording[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callRecordings).where(eq(callRecordings.customerId, customerId)).orderBy(desc(callRecordings.createdAt)).limit(limit);
}

export async function updateCallRecording(id: number, data: Partial<InsertCallRecording>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(callRecordings).set(data).where(eq(callRecordings.id, id));
}

export async function deleteCallRecording(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(callRecordings).where(eq(callRecordings.id, id));
}

// ============ NOTIFICATION OPERATIONS ============
export async function createNotification(notification: InsertNotification): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(notifications).values(notification);
  return result[0].insertId;
}

export async function getNotificationsByCustomer(customerId: number, limit = 50): Promise<Notification[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.customerId, customerId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function getUnreadNotifications(customerId: number): Promise<Notification[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(and(eq(notifications.customerId, customerId), eq(notifications.isRead, false))).orderBy(desc(notifications.createdAt));
}

export async function markNotificationAsRead(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

// ============ NOTIFICATION SETTINGS OPERATIONS ============
export async function getNotificationSettings(customerId: number): Promise<NotificationSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(notificationSettings).where(eq(notificationSettings.customerId, customerId)).limit(1);
  return result[0];
}

export async function upsertNotificationSettings(customerId: number, settings: Partial<InsertNotificationSettings>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getNotificationSettings(customerId);
  if (existing) {
    await db.update(notificationSettings).set(settings).where(eq(notificationSettings.customerId, customerId));
  } else {
    await db.insert(notificationSettings).values({ customerId, ...settings });
  }
}

// ============ LLM CALL FLOW OPERATIONS ============
export async function createLlmCallFlow(flow: InsertLlmCallFlow): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(llmCallFlows).values(flow);
  return result[0].insertId;
}

export async function getLlmCallFlowsByCustomer(customerId: number): Promise<LlmCallFlow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(llmCallFlows).where(eq(llmCallFlows.customerId, customerId)).orderBy(desc(llmCallFlows.createdAt));
}

export async function updateLlmCallFlow(id: number, data: Partial<InsertLlmCallFlow>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(llmCallFlows).set(data).where(eq(llmCallFlows.id, id));
}

export async function deleteLlmCallFlow(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(llmCallFlows).where(eq(llmCallFlows.id, id));
}

// ============ RETENTION POLICY OPERATIONS ============
export async function getRetentionPolicy(customerId: number): Promise<RetentionPolicy | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(retentionPolicies).where(eq(retentionPolicies.customerId, customerId)).limit(1);
  return result[0];
}

export async function upsertRetentionPolicy(customerId: number, policy: Partial<InsertRetentionPolicy>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getRetentionPolicy(customerId);
  if (existing) {
    await db.update(retentionPolicies).set(policy).where(eq(retentionPolicies.customerId, customerId));
  } else {
    await db.insert(retentionPolicies).values({ customerId, ...policy });
  }
}

// ============ ADDITIONAL WEBHOOK HELPER FUNCTIONS ============

export async function getPhoneNumberByNumber(phoneNumber: string): Promise<PhoneNumber | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(phoneNumbers).where(eq(phoneNumbers.phoneNumber, phoneNumber)).limit(1);
  return result[0];
}

export async function incrementUsageStats(customerId: number, increments: {
  totalCalls?: number;
  inboundCalls?: number;
  outboundCalls?: number;
  totalMinutes?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get current period (today)
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
  
  // Check if we have stats for today
  const existing = await db.select().from(usageStats)
    .where(and(
      eq(usageStats.customerId, customerId),
      eq(usageStats.periodStart, periodStart)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    // Update existing
    await db.update(usageStats)
      .set({
        totalCalls: (existing[0].totalCalls || 0) + (increments.totalCalls || 0),
        inboundCalls: (existing[0].inboundCalls || 0) + (increments.inboundCalls || 0),
        outboundCalls: (existing[0].outboundCalls || 0) + (increments.outboundCalls || 0),
        totalMinutes: (existing[0].totalMinutes || 0) + (increments.totalMinutes || 0),
      })
      .where(eq(usageStats.id, existing[0].id));
  } else {
    // Create new stats record
    await db.insert(usageStats).values({
      customerId,
      periodStart,
      periodEnd,
      totalCalls: increments.totalCalls || 0,
      inboundCalls: increments.inboundCalls || 0,
      outboundCalls: increments.outboundCalls || 0,
      totalMinutes: increments.totalMinutes || 0,
    });
  }
}

// ============ RETELL AGENT OPERATIONS ============
export async function createRetellAgent(agent: InsertRetellAgent): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(retellAgents).values(agent);
  return result[0].insertId;
}

export async function getRetellAgentById(id: number): Promise<RetellAgent | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(retellAgents).where(eq(retellAgents.id, id)).limit(1);
  return result[0];
}

export async function getRetellAgentsByCustomer(customerId: number): Promise<RetellAgent[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(retellAgents).where(eq(retellAgents.customerId, customerId)).orderBy(desc(retellAgents.createdAt));
}

export async function updateRetellAgent(id: number, data: Partial<InsertRetellAgent>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(retellAgents).set(data).where(eq(retellAgents.id, id));
}

export async function deleteRetellAgent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(retellAgents).where(eq(retellAgents.id, id));
}

// ============ VOIP PHONE OPERATIONS ============
export async function createVoipPhone(phone: InsertVoipPhone): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(voipPhones).values(phone);
  return result[0].insertId;
}

export async function getVoipPhoneById(id: number): Promise<VoipPhone | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(voipPhones).where(eq(voipPhones.id, id)).limit(1);
  return result[0];
}

export async function getVoipPhonesByCustomer(customerId: number): Promise<VoipPhone[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(voipPhones).where(eq(voipPhones.customerId, customerId)).orderBy(desc(voipPhones.createdAt));
}

export async function updateVoipPhone(id: number, data: Partial<InsertVoipPhone>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(voipPhones).set(data).where(eq(voipPhones.id, id));
}

export async function deleteVoipPhone(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(voipPhones).where(eq(voipPhones.id, id));
}

// ============ PORT ORDER OPERATIONS ============
export async function createPortOrder(order: InsertPortOrder): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(portOrders).values(order);
  return result[0].insertId;
}

export async function getPortOrderById(id: number): Promise<PortOrder | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(portOrders).where(eq(portOrders.id, id)).limit(1);
  return result[0];
}

export async function getPortOrdersByCustomer(customerId: number): Promise<PortOrder[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(portOrders).where(eq(portOrders.customerId, customerId)).orderBy(desc(portOrders.createdAt));
}

export async function updatePortOrder(id: number, data: Partial<InsertPortOrder>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(portOrders).set(data).where(eq(portOrders.id, id));
}
