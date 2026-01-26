import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// Mock the database module
vi.mock("./db", () => ({
  getAllCustomers: vi.fn().mockResolvedValue([
    { id: 1, name: "Test Customer", email: "test@example.com", status: "active" },
  ]),
  getCustomerById: vi.fn().mockResolvedValue({
    id: 1, name: "Test Customer", email: "test@example.com", status: "active"
  }),
  createCustomer: vi.fn().mockResolvedValue(1),
  updateCustomer: vi.fn().mockResolvedValue(undefined),
  deleteCustomer: vi.fn().mockResolvedValue(undefined),
  getCustomerStats: vi.fn().mockResolvedValue({
    totalCustomers: 10,
    activeCustomers: 8,
    pendingCustomers: 2,
  }),
  getSipEndpointsByCustomer: vi.fn().mockResolvedValue([
    { id: 1, username: "ext101", status: "active" },
  ]),
  getSipEndpointById: vi.fn().mockResolvedValue({
    id: 1, username: "ext101", status: "active"
  }),
  createSipEndpoint: vi.fn().mockResolvedValue(1),
  updateSipEndpoint: vi.fn().mockResolvedValue(undefined),
  deleteSipEndpoint: vi.fn().mockResolvedValue(undefined),
  getPhoneNumbersByCustomer: vi.fn().mockResolvedValue([
    { id: 1, phoneNumber: "+15551234567", status: "active" },
  ]),
  getPhoneNumberById: vi.fn().mockResolvedValue({
    id: 1, phoneNumber: "+15551234567", status: "active"
  }),
  createPhoneNumber: vi.fn().mockResolvedValue(1),
  updatePhoneNumber: vi.fn().mockResolvedValue(undefined),
  deletePhoneNumber: vi.fn().mockResolvedValue(undefined),
  getRingGroupsByCustomer: vi.fn().mockResolvedValue([
    { id: 1, name: "Sales Team", strategy: "simultaneous" },
  ]),
  getRingGroupById: vi.fn().mockResolvedValue({
    id: 1, name: "Sales Team", strategy: "simultaneous"
  }),
  createRingGroup: vi.fn().mockResolvedValue(1),
  updateRingGroup: vi.fn().mockResolvedValue(undefined),
  deleteRingGroup: vi.fn().mockResolvedValue(undefined),
  getCallRoutesByCustomer: vi.fn().mockResolvedValue([
    { id: 1, name: "Default Route", matchType: "all", destinationType: "ring_group" },
  ]),
  getCallRouteById: vi.fn().mockResolvedValue({
    id: 1, name: "Default Route", matchType: "all", destinationType: "ring_group"
  }),
  createCallRoute: vi.fn().mockResolvedValue(1),
  updateCallRoute: vi.fn().mockResolvedValue(undefined),
  deleteCallRoute: vi.fn().mockResolvedValue(undefined),
  getGlobalUsageStats: vi.fn().mockResolvedValue({
    totalCalls: 1000,
    totalMinutes: 5000,
    totalEndpoints: 50,
    totalPhoneNumbers: 25,
  }),
  getUsageStatsByCustomer: vi.fn().mockResolvedValue([
    { id: 1, totalCalls: 100, totalMinutes: 500 },
  ]),
  getCallRecordingsByCustomer: vi.fn().mockResolvedValue([
    { id: 1, callSid: "CA123", duration: 120 },
  ]),
  getCallRecordingById: vi.fn().mockResolvedValue({
    id: 1, callSid: "CA123", duration: 120, recordingKey: "recordings/test.wav"
  }),
  deleteCallRecording: vi.fn().mockResolvedValue(undefined),
  getRetentionPolicy: vi.fn().mockResolvedValue({
    customerId: 1, defaultRetentionDays: 90, autoDeleteEnabled: true
  }),
  upsertRetentionPolicy: vi.fn().mockResolvedValue(undefined),
  getNotificationsByCustomer: vi.fn().mockResolvedValue([]),
  getUnreadNotifications: vi.fn().mockResolvedValue([]),
  markNotificationAsRead: vi.fn().mockResolvedValue(undefined),
  getNotificationSettings: vi.fn().mockResolvedValue({
    customerId: 1, missedCallEmail: true, missedCallInApp: true
  }),
  upsertNotificationSettings: vi.fn().mockResolvedValue(undefined),
  getLlmCallFlowsByCustomer: vi.fn().mockResolvedValue([]),
  createLlmCallFlow: vi.fn().mockResolvedValue(1),
  updateLlmCallFlow: vi.fn().mockResolvedValue(undefined),
  deleteLlmCallFlow: vi.fn().mockResolvedValue(undefined),
  updateCallRecording: vi.fn().mockResolvedValue(undefined),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "https://example.com/test" }),
  storageGet: vi.fn().mockResolvedValue({ key: "test-key", url: "https://example.com/test" }),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "<?xml version=\"1.0\"?><Response><Say>Hello</Say></Response>" } }]
  }),
}));

// Mock SignalWire
vi.mock("./signalwire", () => ({
  getCredentialsSummary: vi.fn().mockReturnValue({
    configured: true,
    projectId: "test-proj...",
    spaceUrl: "test.signalwire.com",
  }),
  getAccountInfo: vi.fn().mockResolvedValue({
    sid: "test-sid",
    friendly_name: "Test Account",
    status: "active",
  }),
  listSipEndpoints: vi.fn().mockResolvedValue({ data: [] }),
  createSipEndpoint: vi.fn().mockResolvedValue({ id: "sw-endpoint-1" }),
  updateSipEndpoint: vi.fn().mockResolvedValue({ id: "sw-endpoint-1" }),
  deleteSipEndpoint: vi.fn().mockResolvedValue({}),
  searchAvailablePhoneNumbers: vi.fn().mockResolvedValue({ available_phone_numbers: [] }),
  listPhoneNumbers: vi.fn().mockResolvedValue({ incoming_phone_numbers: [] }),
  purchasePhoneNumber: vi.fn().mockResolvedValue({ sid: "PN123" }),
  updatePhoneNumber: vi.fn().mockResolvedValue({}),
  releasePhoneNumber: vi.fn().mockResolvedValue({}),
  listCalls: vi.fn().mockResolvedValue({ calls: [] }),
  listRecordings: vi.fn().mockResolvedValue({ recordings: [] }),
}));

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    customerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createCustomerContext(customerId: number): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 2,
    openId: "customer-user",
    email: "customer@example.com",
    name: "Customer User",
    loginMethod: "manus",
    role: "user",
    customerId,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("Auth Router", () => {
  it("should return user info for authenticated user", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.email).toBe("admin@example.com");
    expect(result?.role).toBe("admin");
  });

  it("should clear cookie on logout", async () => {
    const { ctx, clearedCookies } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
  });
});

describe("Customers Router (Admin)", () => {
  it("should list all customers", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.customers.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should get customer by id", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.customers.getById({ id: 1 });
    expect(result).toBeDefined();
    expect(result?.name).toBe("Test Customer");
  });

  it("should create a new customer", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.customers.create({
      name: "New Customer",
      email: "new@example.com",
    });
    expect(result.id).toBe(1);
  });

  it("should get customer stats", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.customers.stats();
    expect(result.totalCustomers).toBe(10);
    expect(result.activeCustomers).toBe(8);
  });
});

describe("SIP Endpoints Router", () => {
  it("should list endpoints for a customer", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sipEndpoints.list({ customerId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should create a new endpoint", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.sipEndpoints.create({
      customerId: 1,
      username: "ext102",
    });
    expect(result.id).toBe(1);
  });
});

describe("Phone Numbers Router", () => {
  it("should list phone numbers for a customer", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.phoneNumbers.list({ customerId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should create a new phone number", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.phoneNumbers.create({
      customerId: 1,
      phoneNumber: "+15559876543",
    });
    expect(result.id).toBe(1);
  });
});

describe("Ring Groups Router", () => {
  it("should list ring groups for a customer", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ringGroups.list({ customerId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should create a new ring group", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ringGroups.create({
      customerId: 1,
      name: "Support Team",
      strategy: "sequential",
    });
    expect(result.id).toBe(1);
  });
});

describe("Call Routes Router", () => {
  it("should list call routes for a customer", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.callRoutes.list({ customerId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should create a new call route", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.callRoutes.create({
      customerId: 1,
      name: "After Hours",
      destinationType: "voicemail",
      matchType: "time_based",
    });
    expect(result.id).toBe(1);
  });
});

describe("Usage Router", () => {
  it("should get global usage stats (admin)", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.usage.global();
    expect(result.totalCalls).toBe(1000);
    expect(result.totalMinutes).toBe(5000);
  });

  it("should get usage stats by customer", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.usage.byCustomer({ customerId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("Recordings Router", () => {
  it("should list recordings for a customer", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.recordings.list({ customerId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should get playback URL for a recording", async () => {
    const { ctx } = createCustomerContext(1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.recordings.getPlaybackUrl({ id: 1 });
    expect(result.url).toBeDefined();
  });
});

describe("SignalWire API Router (Admin)", () => {
  it("should return SignalWire status", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.signalwireApi.status();
    expect(result.configured).toBe(true);
  });

  it("should get SignalWire account info", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.signalwireApi.accountInfo();
    expect(result.sid).toBe("test-sid");
    expect(result.status).toBe("active");
  });

  it("should list SignalWire SIP endpoints", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.signalwireApi.listSipEndpoints();
    expect(result.data).toBeDefined();
  });

  it("should list SignalWire phone numbers", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.signalwireApi.listPhoneNumbers();
    expect(result.incoming_phone_numbers).toBeDefined();
  });
});
