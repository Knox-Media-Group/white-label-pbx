/**
 * Telnyx API Client
 * Handles all interactions with the Telnyx REST API v2
 */

import axios, { AxiosInstance } from "axios";

// Get credentials from environment
const TELNYX_API_KEY = process.env.TELNYX_API_KEY || "";
const TELNYX_SIP_CONNECTION_ID = process.env.TELNYX_SIP_CONNECTION_ID || "";

// Base URL for Telnyx API v2
const BASE_URL = "https://api.telnyx.com/v2";

// Create axios instance with auth
const createClient = (): AxiosInstance => {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "Authorization": `Bearer ${TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
};

// ============ Account ============

export async function getAccountInfo() {
  const client = createClient();
  const response = await client.get("/balance");
  return response.data.data;
}

// ============ SIP Credentials (Telephony Credentials) ============

export interface CreateSipCredentialParams {
  connection_id: string;
  name: string;
  sip_username: string;
  sip_password: string;
}

export async function listSipCredentials() {
  const client = createClient();
  const response = await client.get("/telephony_credentials", {
    params: { "filter[connection_id]": TELNYX_SIP_CONNECTION_ID },
  });
  return response.data;
}

export async function getSipCredential(id: string) {
  const client = createClient();
  const response = await client.get(`/telephony_credentials/${id}`);
  return response.data.data;
}

export async function createSipCredential(params: {
  username: string;
  password: string;
  name?: string;
}) {
  const client = createClient();
  const response = await client.post("/telephony_credentials", {
    connection_id: TELNYX_SIP_CONNECTION_ID,
    name: params.name || params.username,
    sip_username: params.username,
    sip_password: params.password,
  });
  return response.data.data;
}

export async function updateSipCredential(id: string, params: {
  name?: string;
  sip_password?: string;
}) {
  const client = createClient();
  const response = await client.patch(`/telephony_credentials/${id}`, params);
  return response.data.data;
}

export async function deleteSipCredential(id: string) {
  const client = createClient();
  const response = await client.delete(`/telephony_credentials/${id}`);
  return response.data;
}

// ============ Phone Numbers ============

export interface SearchPhoneNumbersParams {
  areaCode?: string;
  contains?: string;
  state?: string;
  city?: string;
  type?: "local" | "toll_free";
  limit?: number;
}

export async function searchAvailablePhoneNumbers(params: SearchPhoneNumbersParams = {}) {
  const client = createClient();
  const queryParams: Record<string, string> = {
    "filter[country_code]": "US",
    "filter[limit]": String(params.limit || 20),
  };

  if (params.areaCode) queryParams["filter[national_destination_code]"] = params.areaCode;
  if (params.contains) queryParams["filter[phone_number][contains]"] = params.contains;
  if (params.state) queryParams["filter[administrative_area]"] = params.state;
  if (params.type === "toll_free") queryParams["filter[number_type]"] = "toll-free";
  else queryParams["filter[number_type]"] = "local";

  if (params.type === "toll_free") {
    queryParams["filter[features][]"] = "voice";
  } else {
    queryParams["filter[features][]"] = "voice";
  }

  const response = await client.get("/available_phone_numbers", { params: queryParams });
  return response.data;
}

export async function listPhoneNumbers() {
  const client = createClient();
  const response = await client.get("/phone_numbers", {
    params: { "filter[connection_id]": TELNYX_SIP_CONNECTION_ID },
  });
  return response.data;
}

export async function getPhoneNumber(id: string) {
  const client = createClient();
  const response = await client.get(`/phone_numbers/${id}`);
  return response.data.data;
}

export async function purchasePhoneNumber(phoneNumber: string, friendlyName?: string) {
  const client = createClient();
  // Create a number order
  const response = await client.post("/number_orders", {
    phone_numbers: [{ phone_number: phoneNumber }],
    connection_id: TELNYX_SIP_CONNECTION_ID,
  });
  return response.data.data;
}

export async function updatePhoneNumber(id: string, params: {
  friendlyName?: string;
  connectionId?: string;
  tags?: string[];
}) {
  const client = createClient();
  const body: Record<string, unknown> = {};
  if (params.connectionId) body.connection_id = params.connectionId;
  if (params.tags) body.tags = params.tags;

  const response = await client.patch(`/phone_numbers/${id}`, body);
  return response.data.data;
}

export async function releasePhoneNumber(id: string) {
  const client = createClient();
  const response = await client.delete(`/phone_numbers/${id}`);
  return response.data;
}

// ============ Calls ============

export async function listCalls(params?: { from?: string; to?: string; status?: string }) {
  const client = createClient();
  const queryParams: Record<string, string> = {};

  if (params?.from) queryParams["filter[from]"] = params.from;
  if (params?.to) queryParams["filter[to]"] = params.to;

  const response = await client.get("/calls", { params: queryParams });
  return response.data;
}

export async function getCall(id: string) {
  const client = createClient();
  const response = await client.get(`/calls/${id}`);
  return response.data.data;
}

export async function makeCall(params: {
  from: string;
  to: string;
  webhookUrl: string;
  connectionId?: string;
}) {
  const client = createClient();
  const response = await client.post("/calls", {
    connection_id: params.connectionId || TELNYX_SIP_CONNECTION_ID,
    from: params.from,
    to: params.to,
    webhook_url: params.webhookUrl,
  });
  return response.data.data;
}

// ============ SMS / Messages ============

export interface SendSmsParams {
  from: string;
  to: string;
  body: string;
}

export async function sendSms(params: SendSmsParams) {
  const client = createClient();
  const response = await client.post("/messages", {
    from: params.from,
    to: params.to,
    text: params.body,
    type: "SMS",
  });
  return response.data.data;
}

export async function listMessages(params?: { from?: string; to?: string }) {
  const client = createClient();
  const queryParams: Record<string, string> = {};

  if (params?.from) queryParams["filter[from]"] = params.from;
  if (params?.to) queryParams["filter[to]"] = params.to;

  const response = await client.get("/messages", { params: queryParams });
  return response.data;
}

export async function getMessage(id: string) {
  const client = createClient();
  const response = await client.get(`/messages/${id}`);
  return response.data.data;
}

// ============ Recordings ============

export async function listRecordings(callControlId?: string) {
  const client = createClient();
  const queryParams: Record<string, string> = {};
  if (callControlId) queryParams["filter[call_control_id]"] = callControlId;

  const response = await client.get("/recordings", { params: queryParams });
  return response.data;
}

export async function getRecording(id: string) {
  const client = createClient();
  const response = await client.get(`/recordings/${id}`);
  return response.data.data;
}

export async function deleteRecording(id: string) {
  const client = createClient();
  const response = await client.delete(`/recordings/${id}`);
  return response.data;
}

// ============ Utility Functions ============

export function isConfigured(): boolean {
  return !!(TELNYX_API_KEY && TELNYX_SIP_CONNECTION_ID);
}

export function getCredentialsSummary() {
  return {
    configured: isConfigured(),
    apiKey: TELNYX_API_KEY ? `${TELNYX_API_KEY.substring(0, 12)}...` : "Not set",
    sipConnectionId: TELNYX_SIP_CONNECTION_ID || "Not set",
  };
}

/**
 * Get the SIP domain for Telnyx
 * Telnyx SIP credentials register against sip.telnyx.com
 */
export function getSipDomain(): string {
  return "sip.telnyx.com";
}

// ============ TeXML Generation (TwiML-compatible) ============
// Telnyx supports TeXML which is compatible with TwiML/LaML

export function generateTeXmlDial(destination: string, options?: {
  callerId?: string;
  timeout?: number;
  action?: string;
}) {
  const timeout = options?.timeout || 30;
  const callerIdAttr = options?.callerId ? ` callerId="${options.callerId}"` : "";
  const actionAttr = options?.action ? ` action="${options.action}"` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${timeout}"${callerIdAttr}${actionAttr}>
    <Sip>${destination}</Sip>
  </Dial>
</Response>`;
}

export function generateTeXmlRingGroup(endpoints: string[], options?: {
  strategy?: "simultaneous" | "sequential";
  timeout?: number;
  callerId?: string;
}) {
  const timeout = options?.timeout || 30;
  const callerIdAttr = options?.callerId ? ` callerId="${options.callerId}"` : "";

  if (options?.strategy === "sequential") {
    // Sequential: dial one at a time
    const dials = endpoints.map((ep, i) => {
      const nextAction = i < endpoints.length - 1 ? ` action="/api/webhooks/next-in-sequence?index=${i + 1}"` : "";
      return `<Dial timeout="${timeout}"${callerIdAttr}${nextAction}><Sip>${ep}</Sip></Dial>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${dials[0]}
</Response>`;
  }

  // Simultaneous: dial all at once
  const sipTags = endpoints.map(ep => `<Sip>${ep}</Sip>`).join("\n    ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${timeout}"${callerIdAttr}>
    ${sipTags}
  </Dial>
</Response>`;
}

export function generateTeXmlVoicemail(greeting?: string) {
  const greetingText = greeting || "Please leave a message after the beep.";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${greetingText}</Say>
  <Record maxLength="120" transcribe="true" />
</Response>`;
}
