/**
 * Telnyx API Client
 * Handles all interactions with the Telnyx REST API v2
 */

import axios, { AxiosInstance } from "axios";
import * as db from "./db";

// Get credentials from environment (fallback)
const TELNYX_API_KEY = process.env.TELNYX_API_KEY || "";
const TELNYX_SIP_CONNECTION_ID = process.env.TELNYX_SIP_CONNECTION_ID || "";
const TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID || "";
const TELNYX_WEBHOOK_SECRET = process.env.TELNYX_WEBHOOK_SECRET || "";
const TELNYX_SIP_DOMAIN = process.env.TELNYX_SIP_DOMAIN || "sip.telnyx.com";

// Base URL for Telnyx API v2
const BASE_URL = "https://api.telnyx.com/v2";

// Resolve API key from DB settings first, then env var
async function getApiKey(): Promise<string> {
  const dbKey = await db.getSystemSetting("telnyx_api_key");
  return dbKey || TELNYX_API_KEY;
}

async function getSipConnectionId(): Promise<string> {
  const dbVal = await db.getSystemSetting("telnyx_sip_connection_id");
  return dbVal || TELNYX_SIP_CONNECTION_ID;
}

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

// Create client with dynamically-resolved API key
const createDynamicClient = async (): Promise<AxiosInstance> => {
  const apiKey = await getApiKey();
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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
  const client = await createDynamicClient();
  const msgProfileId = await getMessagingProfileId();
  const body: Record<string, unknown> = {
    from: params.from,
    to: params.to,
    text: params.body,
    type: "SMS",
  };
  if (msgProfileId) body.messaging_profile_id = msgProfileId;
  const response = await client.post("/messages", body);
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

// ============ Number Porting ============
// Telnyx V2 porting flow: POST creates draft (phone numbers only),
// PATCH adds end-user details + documents, then confirm submits it.

export async function checkPortability(phoneNumbers: string[]) {
  const client = await createDynamicClient();
  const response = await client.post("/portability_checks", {
    phone_numbers: phoneNumbers,
  });
  return response.data.data;
}

/**
 * Step 1: Create a draft port order (only phone numbers accepted in POST)
 */
export async function createPortOrder(phoneNumbers: string[], customerReference?: string) {
  const client = await createDynamicClient();
  const body: Record<string, unknown> = {
    phone_numbers: phoneNumbers.map(pn => ({ phone_number: pn })),
  };
  if (customerReference) body.customer_reference = customerReference;
  const response = await client.post("/porting_orders", body);
  return response.data.data;
}

/**
 * Step 2: Update the draft with end-user details, documents, and phone number config
 */
export interface UpdatePortOrderParams {
  // End-user admin info
  authorizedName?: string;
  businessName?: string;
  billingPhoneNumber?: string;
  accountNumber?: string;
  accountPin?: string;
  // End-user service address
  streetAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  // Documents (UUIDs from /documents upload)
  loaDocumentId?: string;
  invoiceDocumentId?: string;
  // Phone number config
  connectionId?: string;
  // FOC date
  focDateRequested?: string;
}

export async function updatePortOrder(portOrderId: string, params: UpdatePortOrderParams) {
  const client = await createDynamicClient();
  const connId = await getSipConnectionId();

  const body: Record<string, unknown> = {};

  // End-user info
  const admin: Record<string, string> = {};
  if (params.authorizedName) admin.auth_person_name = params.authorizedName;
  if (params.businessName) admin.entity_name = params.businessName;
  if (params.billingPhoneNumber) admin.billing_phone_number = params.billingPhoneNumber;
  if (params.accountNumber) admin.account_number = params.accountNumber;
  if (params.accountPin) admin.pin_passcode = params.accountPin;

  const location: Record<string, string> = {};
  if (params.streetAddress) location.street_address = params.streetAddress;
  if (params.city) location.locality = params.city;
  if (params.state) location.administrative_area = params.state;
  if (params.zip) location.postal_code = params.zip;
  location.country_code = params.country || "US";

  if (Object.keys(admin).length > 0 || Object.keys(location).length > 1) {
    body.end_user = {
      ...(Object.keys(admin).length > 0 ? { admin } : {}),
      ...(Object.keys(location).length > 1 ? { location } : {}),
    };
  }

  // Documents
  if (params.loaDocumentId || params.invoiceDocumentId) {
    const docs: Record<string, string> = {};
    if (params.loaDocumentId) docs.loa = params.loaDocumentId;
    if (params.invoiceDocumentId) docs.invoice = params.invoiceDocumentId;
    body.documents = docs;
  }

  // Phone number configuration
  body.phone_number_configuration = {
    connection_id: params.connectionId || connId,
  };

  // Activation settings
  if (params.focDateRequested) {
    body.activation_settings = {
      foc_datetime_requested: params.focDateRequested,
    };
  }

  const response = await client.patch(`/porting_orders/${portOrderId}`, body);
  return response.data.data;
}

/**
 * Upload a document (LOA or invoice) for porting
 */
export async function uploadPortingDocument(fileBuffer: Buffer, filename: string) {
  const client = await createDynamicClient();
  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("file", fileBuffer, { filename });

  const response = await client.post("/documents", form, {
    headers: form.getHeaders(),
  });
  return response.data.data; // { id: "doc-uuid" }
}

export async function getPortOrder(portOrderId: string) {
  const client = await createDynamicClient();
  const response = await client.get(`/porting_orders/${portOrderId}`);
  return response.data.data;
}

export async function listPortOrders(params?: { status?: string; pageSize?: number }) {
  const client = await createDynamicClient();
  const queryParams: Record<string, string> = {};
  if (params?.status) queryParams["filter[status]"] = params.status;
  if (params?.pageSize) queryParams["page[size]"] = String(params.pageSize);
  const response = await client.get("/porting_orders", { params: queryParams });
  return response.data;
}

export async function getAllowedFocWindows(portOrderId: string) {
  const client = await createDynamicClient();
  const response = await client.get(`/porting_orders/${portOrderId}/allowed_foc_windows`);
  return response.data.data;
}

export async function cancelPortOrder(portOrderId: string) {
  const client = await createDynamicClient();
  const response = await client.post(`/porting_orders/${portOrderId}/actions/cancel`);
  return response.data.data;
}

/**
 * Step 3: Confirm/submit the port order (transitions draft -> in-process)
 */
export async function confirmPortOrder(portOrderId: string) {
  const client = await createDynamicClient();
  const response = await client.post(`/porting_orders/${portOrderId}/actions/confirm`);
  return response.data.data;
}

// ============ Utility Functions ============

export function isConfigured(): boolean {
  return !!(TELNYX_API_KEY && TELNYX_SIP_CONNECTION_ID);
}

export async function isConfiguredAsync(): Promise<boolean> {
  const apiKey = await getApiKey();
  const connId = await getSipConnectionId();
  return !!(apiKey && connId);
}

export async function getCredentialsSummary() {
  const apiKey = await getApiKey();
  const connId = await getSipConnectionId();
  const msgProfileId = await getMessagingProfileId();
  const webhookSecret = await getWebhookSecret();
  return {
    configured: !!(apiKey && connId),
    apiKey: apiKey ? `${apiKey.substring(0, 12)}...` : "Not set",
    sipConnectionId: connId || "Not set",
    messagingProfileId: msgProfileId || "Not set",
    webhookSecret: webhookSecret ? `${webhookSecret.substring(0, 8)}...` : "Not set",
    sipDomain: getSipDomain(),
  };
}

/**
 * Get the SIP domain for Telnyx
 * Telnyx SIP credentials register against sip.telnyx.com
 */
export async function getMessagingProfileId(): Promise<string> {
  const dbVal = await db.getSystemSetting("telnyx_messaging_profile_id");
  return dbVal || TELNYX_MESSAGING_PROFILE_ID;
}

export async function getWebhookSecret(): Promise<string> {
  const dbVal = await db.getSystemSetting("telnyx_webhook_secret");
  return dbVal || TELNYX_WEBHOOK_SECRET;
}

export function getSipDomain(): string {
  return TELNYX_SIP_DOMAIN;
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
