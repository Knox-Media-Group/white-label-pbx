import { describe, expect, it } from "vitest";
import { getAccountInfo, isConfigured, getCredentialsSummary } from "./signalwire";

describe("SignalWire API Integration", () => {
  it("should have SignalWire credentials configured", () => {
    const configured = isConfigured();
    expect(configured).toBe(true);
    
    const summary = getCredentialsSummary();
    expect(summary.configured).toBe(true);
    expect(summary.projectId).not.toBe("Not set");
    expect(summary.spaceUrl).not.toBe("Not set");
  });

  it("should successfully authenticate with SignalWire API", async () => {
    // This test validates the credentials by making a real API call
    // to get account info - a lightweight endpoint that confirms auth works
    const accountInfo = await getAccountInfo();
    
    // If we get here without throwing, credentials are valid
    expect(accountInfo).toBeDefined();
    expect(accountInfo.sid).toBeDefined();
    
    console.log("SignalWire Account Info:", {
      sid: accountInfo.sid,
      friendly_name: accountInfo.friendly_name,
      status: accountInfo.status,
    });
  });
});
