import { describe, expect, it } from "vitest";
import { getAccountInfo, isConfigured, getCredentialsSummary } from "./telnyx";

describe("Telnyx API Integration", () => {
  it("should have Telnyx credentials configured", () => {
    const configured = isConfigured();
    expect(configured).toBe(true);

    const summary = getCredentialsSummary();
    expect(summary.configured).toBe(true);
    expect(summary.apiKey).not.toBe("Not set");
    expect(summary.sipConnectionId).not.toBe("Not set");
  });

  it("should successfully authenticate with Telnyx API", async () => {
    // This test validates the credentials by making a real API call
    // to get account info - a lightweight endpoint that confirms auth works
    const accountInfo = await getAccountInfo();

    // If we get here without throwing, credentials are valid
    expect(accountInfo).toBeDefined();

    console.log("Telnyx Account Info:", accountInfo);
  });
});
