import { describe, expect, it, vi, beforeEach } from "vitest";
import * as aiIvr from "./ai-ivr";

// Mock the database module
vi.mock("./db", () => ({
  getRingGroupsByCustomer: vi.fn().mockResolvedValue([
    { id: 1, name: "Sales", status: "active", strategy: "simultaneous", ringTimeout: 30, memberEndpointIds: [1, 2] },
    { id: 2, name: "Support", status: "active", strategy: "sequential", ringTimeout: 25, memberEndpointIds: [3] },
    { id: 3, name: "Reception", status: "active", strategy: "simultaneous", ringTimeout: 20, memberEndpointIds: [1, 2, 3] },
  ]),
  getRingGroupById: vi.fn().mockImplementation((id: number) => {
    const groups: Record<number, any> = {
      1: { id: 1, name: "Sales", status: "active", strategy: "simultaneous", ringTimeout: 30, memberEndpointIds: [1, 2] },
      2: { id: 2, name: "Support", status: "active", strategy: "sequential", ringTimeout: 25, memberEndpointIds: [3] },
      3: { id: 3, name: "Reception", status: "active", strategy: "simultaneous", ringTimeout: 20, memberEndpointIds: [1, 2, 3] },
    };
    return Promise.resolve(groups[id] || null);
  }),
  getSipEndpointsByCustomer: vi.fn().mockResolvedValue([
    { id: 1, username: "ext101", displayName: "John Smith", status: "active" },
    { id: 2, username: "ext102", displayName: "Jane Doe", status: "active" },
    { id: 3, username: "ext103", displayName: "Bob Wilson", status: "active" },
  ]),
  getSipEndpointById: vi.fn().mockImplementation((id: number) => {
    const endpoints: Record<number, any> = {
      1: { id: 1, username: "ext101", displayName: "John Smith", status: "active" },
      2: { id: 2, username: "ext102", displayName: "Jane Doe", status: "active" },
      3: { id: 3, username: "ext103", displayName: "Bob Wilson", status: "active" },
    };
    return Promise.resolve(endpoints[id] || null);
  }),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          shouldTransfer: true,
          department: "Sales",
          confidence: 0.95,
          response: "Transferring you to Sales now."
        })
      }
    }]
  }),
}));

describe("AI IVR - Department Matching", () => {
  it("should find ring group by exact name match", async () => {
    const result = await aiIvr.findDepartmentRingGroup(1, "Sales");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Sales");
    expect(result?.ringGroupId).toBe(1);
  });

  it("should find ring group by case-insensitive match", async () => {
    const result = await aiIvr.findDepartmentRingGroup(1, "sales");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Sales");
  });

  it("should find ring group by partial match", async () => {
    const result = await aiIvr.findDepartmentRingGroup(1, "support");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Support");
  });

  it("should return null for non-existent department", async () => {
    const result = await aiIvr.findDepartmentRingGroup(1, "Marketing");
    expect(result).toBeNull();
  });
});

describe("AI IVR - Endpoint Matching", () => {
  it("should find endpoint by display name", async () => {
    const result = await aiIvr.findDepartmentEndpoint(1, "John Smith");
    expect(result).not.toBeNull();
    expect(result?.username).toBe("ext101");
  });

  it("should find endpoint by partial name match", async () => {
    const result = await aiIvr.findDepartmentEndpoint(1, "john");
    expect(result).not.toBeNull();
    expect(result?.displayName).toBe("John Smith");
  });

  it("should return null for non-existent person", async () => {
    const result = await aiIvr.findDepartmentEndpoint(1, "Alice");
    expect(result).toBeNull();
  });
});

describe("AI IVR - Available Departments", () => {
  it("should return list of available departments", async () => {
    const departments = await aiIvr.getAvailableDepartments(1);
    expect(departments).toContain("Sales");
    expect(departments).toContain("Support");
    expect(departments).toContain("Reception");
  });
});

describe("AI IVR - LaML Generation", () => {
  it("should generate valid AI IVR LaML with speech gather", () => {
    const laml = aiIvr.generateAiIvrLaml({
      customerId: 1,
      greeting: "Hello, how can I help?",
      gatherTimeout: 5,
      webhookUrl: "https://example.com",
    });

    expect(laml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(laml).toContain("<Response>");
    expect(laml).toContain("<Gather");
    expect(laml).toContain('input="speech"');
    expect(laml).toContain("Hello, how can I help?");
    expect(laml).toContain("/api/webhooks/ai-gather");
  });

  it("should generate valid transfer to ring group LaML", () => {
    const laml = aiIvr.generateTransferToRingGroupLaml(
      ["sip:ext101@test.signalwire.com", "sip:ext102@test.signalwire.com"],
      {
        strategy: "simultaneous",
        timeout: 30,
        announcement: "Transferring to Sales",
      }
    );

    expect(laml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(laml).toContain("<Response>");
    expect(laml).toContain("<Dial");
    expect(laml).toContain("<Sip>sip:ext101@test.signalwire.com</Sip>");
    expect(laml).toContain("<Sip>sip:ext102@test.signalwire.com</Sip>");
    expect(laml).toContain("Transferring to Sales");
  });

  it("should generate valid transfer to endpoint LaML", () => {
    const laml = aiIvr.generateTransferToEndpointLaml(
      "sip:ext101@test.signalwire.com",
      {
        timeout: 30,
        announcement: "Connecting you now",
      }
    );

    expect(laml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(laml).toContain("<Response>");
    expect(laml).toContain("<Dial");
    expect(laml).toContain("<Sip>sip:ext101@test.signalwire.com</Sip>");
    expect(laml).toContain("Connecting you now");
  });

  it("should generate retry LaML with attempt counter", () => {
    const laml = aiIvr.generateRetryLaml(
      "I didn't understand. Please try again.",
      "https://example.com",
      1,
      2
    );

    expect(laml).toContain("<Gather");
    expect(laml).toContain("attempt=3");
    expect(laml).toContain("I didn't understand. Please try again.");
  });

  it("should generate fallback LaML after max attempts", () => {
    const laml = aiIvr.generateRetryLaml(
      "I didn't understand.",
      "https://example.com",
      1,
      3
    );

    expect(laml).toContain("<Redirect>");
    expect(laml).toContain("ai-fallback");
    expect(laml).not.toContain("<Gather");
  });
});

describe("AI IVR - Transfer Intent Analysis", () => {
  it("should analyze transfer intent with LLM", async () => {
    const intent = await aiIvr.analyzeTransferIntent(
      "I'd like to speak with sales please",
      ["Sales", "Support", "Reception"]
    );

    expect(intent.shouldTransfer).toBe(true);
    expect(intent.department).toBe("Sales");
    expect(intent.confidence).toBeGreaterThan(0.5);
  });
});
