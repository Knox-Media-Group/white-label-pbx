import { describe, expect, it, vi, beforeEach } from "vitest";
import * as callSummary from "./call-summary";

// Mock the database module
vi.mock("./db", () => ({
  getCustomerById: vi.fn().mockResolvedValue({
    id: 1,
    name: "Test Customer",
    smsSummaryEnabled: true,
    notificationPhone: "+15551234567",
  }),
  getPhoneNumberByNumber: vi.fn().mockResolvedValue({
    id: 1,
    customerId: 1,
    phoneNumber: "+15559876543",
  }),
  getCallRecordingsByCustomer: vi.fn().mockResolvedValue([
    { id: 1, callSid: "CA123456", customerId: 1 },
  ]),
  updateCallRecording: vi.fn().mockResolvedValue(undefined),
}));

// Mock the Telnyx module
vi.mock("./telnyx", () => ({
  isConfigured: vi.fn().mockReturnValue(true),
  sendSms: vi.fn().mockResolvedValue({
    data: { id: "MSG123456" },
  }),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: "Customer called about product pricing. Agent provided quote.",
          keyPoints: ["Customer interested in premium plan", "Quote sent via email"],
          sentiment: "positive",
          actionItems: ["Follow up in 3 days"],
          category: "sales"
        })
      }
    }]
  }),
}));

describe("Call Summary - Summary Generation", () => {
  it("should generate a call summary from transcription", async () => {
    const transcription = "Hello, I'm calling about your pricing. Can you tell me about the premium plan?";
    
    const summary = await callSummary.generateCallSummary(transcription, {
      fromNumber: "+15551234567",
      toNumber: "+15559876543",
      duration: 180,
      direction: "inbound",
    });

    expect(summary).toBeDefined();
    expect(summary.summary).toBeDefined();
    expect(summary.sentiment).toBe("positive");
    expect(summary.category).toBe("sales");
    expect(summary.keyPoints).toBeInstanceOf(Array);
    expect(summary.actionItems).toBeInstanceOf(Array);
  });
});

describe("Call Summary - SMS Formatting", () => {
  it("should format summary for SMS with correct structure", () => {
    const summary: callSummary.CallSummary = {
      summary: "Customer inquired about pricing and received a quote.",
      keyPoints: ["Interested in premium plan", "Quote sent"],
      sentiment: "positive",
      actionItems: ["Follow up in 3 days"],
      category: "sales",
    };

    const smsText = callSummary.formatSummaryForSms(summary, {
      fromNumber: "+15551234567",
      toNumber: "+15559876543",
      direction: "inbound",
      duration: 180,
    });

    expect(smsText).toContain("📞 Call Summary");
    expect(smsText).toContain("inbound call");
    expect(smsText).toContain("Customer inquired about pricing");
    expect(smsText).toContain("Action Items");
    expect(smsText).toContain("Follow up in 3 days");
  });

  it("should truncate SMS to max length", () => {
    const longSummary: callSummary.CallSummary = {
      summary: "A".repeat(500), // Very long summary
      keyPoints: ["Point 1", "Point 2"],
      sentiment: "neutral",
      actionItems: ["Action 1", "Action 2", "Action 3"],
      category: "support",
    };

    const smsText = callSummary.formatSummaryForSms(longSummary, {
      fromNumber: "+15551234567",
      toNumber: "+15559876543",
      direction: "outbound",
      duration: 300,
    });

    expect(smsText.length).toBeLessThanOrEqual(480);
    expect(smsText).toContain("...");
  });

  it("should handle empty action items", () => {
    const summary: callSummary.CallSummary = {
      summary: "Brief call with no action items.",
      keyPoints: ["Quick question answered"],
      sentiment: "neutral",
      actionItems: [],
      category: "inquiry",
    };

    const smsText = callSummary.formatSummaryForSms(summary, {
      fromNumber: "+15551234567",
      toNumber: "+15559876543",
      direction: "inbound",
      duration: 60,
    });

    expect(smsText).not.toContain("Action Items");
  });
});

describe("Call Summary - Direction Handling", () => {
  it("should format inbound call correctly", () => {
    const summary: callSummary.CallSummary = {
      summary: "Inbound call summary.",
      keyPoints: [],
      sentiment: "neutral",
      actionItems: [],
      category: "other",
    };

    const smsText = callSummary.formatSummaryForSms(summary, {
      fromNumber: "+15551234567",
      toNumber: "+15559876543",
      direction: "inbound",
      duration: 120,
    });

    expect(smsText).toContain("inbound call from +15551234567");
  });

  it("should format outbound call correctly", () => {
    const summary: callSummary.CallSummary = {
      summary: "Outbound call summary.",
      keyPoints: [],
      sentiment: "neutral",
      actionItems: [],
      category: "other",
    };

    const smsText = callSummary.formatSummaryForSms(summary, {
      fromNumber: "+15551234567",
      toNumber: "+15559876543",
      direction: "outbound",
      duration: 120,
    });

    expect(smsText).toContain("outbound call to +15559876543");
  });
});

describe("Call Summary - Duration Formatting", () => {
  it("should round up duration to minutes", () => {
    const summary: callSummary.CallSummary = {
      summary: "Test call.",
      keyPoints: [],
      sentiment: "neutral",
      actionItems: [],
      category: "other",
    };

    // 90 seconds should show as 2 minutes
    const smsText = callSummary.formatSummaryForSms(summary, {
      fromNumber: "+15551234567",
      toNumber: "+15559876543",
      direction: "inbound",
      duration: 90,
    });

    expect(smsText).toContain("2 min");
  });
});
