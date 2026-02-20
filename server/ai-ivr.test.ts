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

describe("AI IVR - TeXML Generation", () => {
  it("should generate valid AI IVR TeXML with speech gather", () => {
    const texml = aiIvr.generateAiIvrTeXml({
      customerId: 1,
      greeting: "Hello, how can I help?",
      gatherTimeout: 5,
      webhookUrl: "https://example.com",
    });

    expect(texml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(texml).toContain("<Response>");
    expect(texml).toContain("<Gather");
    expect(texml).toContain('input="speech"');
    expect(texml).toContain("Hello, how can I help?");
    expect(texml).toContain("/api/webhooks/ai-gather");
  });

  it("should generate valid transfer to ring group TeXML", () => {
    const texml = aiIvr.generateTransferToRingGroupTeXml(
      ["sip:ext101@sip.telnyx.com", "sip:ext102@sip.telnyx.com"],
      {
        strategy: "simultaneous",
        timeout: 30,
        announcement: "Transferring to Sales",
      }
    );

    expect(texml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(texml).toContain("<Response>");
    expect(texml).toContain("<Dial");
    expect(texml).toContain("<Sip>sip:ext101@sip.telnyx.com</Sip>");
    expect(texml).toContain("<Sip>sip:ext102@sip.telnyx.com</Sip>");
    expect(texml).toContain("Transferring to Sales");
  });

  it("should generate valid transfer to endpoint TeXML", () => {
    const texml = aiIvr.generateTransferToEndpointTeXml(
      "sip:ext101@sip.telnyx.com",
      {
        timeout: 30,
        announcement: "Connecting you now",
      }
    );

    expect(texml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(texml).toContain("<Response>");
    expect(texml).toContain("<Dial");
    expect(texml).toContain("<Sip>sip:ext101@sip.telnyx.com</Sip>");
    expect(texml).toContain("Connecting you now");
  });

  it("should generate retry TeXML with attempt counter", () => {
    const texml = aiIvr.generateRetryTeXml(
      "I didn't understand. Please try again.",
      "https://example.com",
      1,
      2
    );

    expect(texml).toContain("<Gather");
    expect(texml).toContain("attempt=3");
    expect(texml).toContain("I didn't understand. Please try again.");
  });

  it("should generate fallback TeXML after max attempts", () => {
    const texml = aiIvr.generateRetryTeXml(
      "I didn't understand.",
      "https://example.com",
      1,
      3
    );

    expect(texml).toContain("<Redirect>");
    expect(texml).toContain("ai-fallback");
    expect(texml).not.toContain("<Gather");
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
