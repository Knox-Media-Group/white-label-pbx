/**
 * SignalWire API Client
 * Handles all interactions with the SignalWire REST API
 */

import axios, { AxiosInstance } from "axios";

// Get credentials from environment
const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID || "";
const SIGNALWIRE_API_TOKEN = process.env.SIGNALWIRE_API_TOKEN || "";
const SIGNALWIRE_SPACE_URL = process.env.SIGNALWIRE_SPACE_URL || "";

// Base URL for SignalWire API
const getBaseUrl = () => `https://${SIGNALWIRE_SPACE_URL}/api/relay/rest`;
const getLamlBaseUrl = () => `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}`;

// Create axios instance with auth
const createClient = (): AxiosInstance => {
  return axios.create({
    baseURL: getBaseUrl(),
    auth: {
      username: SIGNALWIRE_PROJECT_ID,
      password: SIGNALWIRE_API_TOKEN,
    },
    headers: {
      "Content-Type": "application/json",
    },
  });
};

// Create LaML-specific client
const createLamlClient = (): AxiosInstance => {
  return axios.create({
    baseURL: getLamlBaseUrl(),
    auth: {
      username: SIGNALWIRE_PROJECT_ID,
      password: SIGNALWIRE_API_TOKEN,
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
};

// ============ Account & Project Management ============

export async function getAccountInfo() {
  const client = createLamlClient();
  // Use the account endpoint directly
  const response = await client.get("");
  return response.data;
}

export async function listSubprojects() {
  const client = createClient();
  const response = await client.get("/projects");
  return response.data;
}

export async function createSubproject(name: string) {
  const client = createClient();
  const response = await client.post("/projects", { name });
  return response.data;
}

// ============ SIP Endpoints ============

export interface CreateSipEndpointParams {
  username: string;
  password: string;
  callerId?: string;
  callerIdName?: string;
  callHandler?: "laml_webhooks" | "relay_context" | "relay_topic" | "ai_agent";
  callRequestUrl?: string;
  callRelayContext?: string;
  ciphers?: string[];
  codecs?: string[];
  encryption?: "required" | "optional" | "disabled";
}

export async function listSipEndpoints() {
  const client = createClient();
  const response = await client.get("/endpoints/sip");
  return response.data;
}

export async function getSipEndpoint(id: string) {
  const client = createClient();
  const response = await client.get(`/endpoints/sip/${id}`);
  return response.data;
}

export async function createSipEndpoint(params: CreateSipEndpointParams) {
  const client = createClient();
  const response = await client.post("/endpoints/sip", params);
  return response.data;
}

export async function updateSipEndpoint(id: string, params: Partial<CreateSipEndpointParams>) {
  const client = createClient();
  const response = await client.put(`/endpoints/sip/${id}`, params);
  return response.data;
}

export async function deleteSipEndpoint(id: string) {
  const client = createClient();
  const response = await client.delete(`/endpoints/sip/${id}`);
  return response.data;
}

// ============ Phone Numbers ============

export interface SearchPhoneNumbersParams {
  areaCode?: string;
  contains?: string;
  inRegion?: string;
  inPostalCode?: string;
  type?: "local" | "toll_free";
  limit?: number;
}

export async function searchAvailablePhoneNumbers(params: SearchPhoneNumbersParams = {}) {
  const client = createLamlClient();
  const queryParams = new URLSearchParams();
  
  if (params.areaCode) queryParams.append("AreaCode", params.areaCode);
  if (params.contains) queryParams.append("Contains", params.contains);
  if (params.inRegion) queryParams.append("InRegion", params.inRegion);
  if (params.inPostalCode) queryParams.append("InPostalCode", params.inPostalCode);
  
  const numberType = params.type === "toll_free" ? "TollFree" : "Local";
  const response = await client.get(`/AvailablePhoneNumbers/US/${numberType}.json?${queryParams.toString()}`);
  return response.data;
}

export async function listPhoneNumbers() {
  const client = createLamlClient();
  const response = await client.get("/IncomingPhoneNumbers.json");
  return response.data;
}

export async function getPhoneNumber(sid: string) {
  const client = createLamlClient();
  const response = await client.get(`/IncomingPhoneNumbers/${sid}.json`);
  return response.data;
}

export async function purchasePhoneNumber(phoneNumber: string, friendlyName?: string) {
  const client = createLamlClient();
  const params = new URLSearchParams();
  params.append("PhoneNumber", phoneNumber);
  if (friendlyName) params.append("FriendlyName", friendlyName);
  
  const response = await client.post("/IncomingPhoneNumbers.json", params.toString());
  return response.data;
}

export async function updatePhoneNumber(sid: string, params: {
  friendlyName?: string;
  voiceUrl?: string;
  voiceMethod?: string;
  smsUrl?: string;
  smsMethod?: string;
}) {
  const client = createLamlClient();
  const urlParams = new URLSearchParams();
  
  if (params.friendlyName) urlParams.append("FriendlyName", params.friendlyName);
  if (params.voiceUrl) urlParams.append("VoiceUrl", params.voiceUrl);
  if (params.voiceMethod) urlParams.append("VoiceMethod", params.voiceMethod);
  if (params.smsUrl) urlParams.append("SmsUrl", params.smsUrl);
  if (params.smsMethod) urlParams.append("SmsMethod", params.smsMethod);
  
  const response = await client.post(`/IncomingPhoneNumbers/${sid}.json`, urlParams.toString());
  return response.data;
}

export async function releasePhoneNumber(sid: string) {
  const client = createLamlClient();
  const response = await client.delete(`/IncomingPhoneNumbers/${sid}.json`);
  return response.data;
}

// ============ Calls ============

export async function listCalls(params?: { from?: string; to?: string; status?: string }) {
  const client = createLamlClient();
  const queryParams = new URLSearchParams();
  
  if (params?.from) queryParams.append("From", params.from);
  if (params?.to) queryParams.append("To", params.to);
  if (params?.status) queryParams.append("Status", params.status);
  
  const response = await client.get(`/Calls.json?${queryParams.toString()}`);
  return response.data;
}

export async function getCall(sid: string) {
  const client = createLamlClient();
  const response = await client.get(`/Calls/${sid}.json`);
  return response.data;
}

export async function makeCall(params: {
  from: string;
  to: string;
  url: string;
  method?: string;
  statusCallback?: string;
}) {
  const client = createLamlClient();
  const urlParams = new URLSearchParams();
  
  urlParams.append("From", params.from);
  urlParams.append("To", params.to);
  urlParams.append("Url", params.url);
  if (params.method) urlParams.append("Method", params.method);
  if (params.statusCallback) urlParams.append("StatusCallback", params.statusCallback);
  
  const response = await client.post("/Calls.json", urlParams.toString());
  return response.data;
}

// ============ SMS / Messages ============

export interface SendSmsParams {
  from: string;
  to: string;
  body: string;
  statusCallback?: string;
}

export async function sendSms(params: SendSmsParams) {
  const client = createLamlClient();
  const urlParams = new URLSearchParams();
  
  urlParams.append("From", params.from);
  urlParams.append("To", params.to);
  urlParams.append("Body", params.body);
  if (params.statusCallback) urlParams.append("StatusCallback", params.statusCallback);
  
  const response = await client.post("/Messages.json", urlParams.toString());
  return response.data;
}

export async function listMessages(params?: { from?: string; to?: string; dateSent?: string }) {
  const client = createLamlClient();
  const queryParams = new URLSearchParams();
  
  if (params?.from) queryParams.append("From", params.from);
  if (params?.to) queryParams.append("To", params.to);
  if (params?.dateSent) queryParams.append("DateSent", params.dateSent);
  
  const response = await client.get(`/Messages.json?${queryParams.toString()}`);
  return response.data;
}

export async function getMessage(sid: string) {
  const client = createLamlClient();
  const response = await client.get(`/Messages/${sid}.json`);
  return response.data;
}

// ============ Recordings ============

export async function listRecordings(callSid?: string) {
  const client = createLamlClient();
  const path = callSid 
    ? `/Calls/${callSid}/Recordings.json`
    : "/Recordings.json";
  const response = await client.get(path);
  return response.data;
}

export async function getRecording(sid: string) {
  const client = createLamlClient();
  const response = await client.get(`/Recordings/${sid}.json`);
  return response.data;
}

export async function deleteRecording(sid: string) {
  const client = createLamlClient();
  const response = await client.delete(`/Recordings/${sid}.json`);
  return response.data;
}

// ============ Utility Functions ============

export function isConfigured(): boolean {
  return !!(SIGNALWIRE_PROJECT_ID && SIGNALWIRE_API_TOKEN && SIGNALWIRE_SPACE_URL);
}

export function getCredentialsSummary() {
  return {
    configured: isConfigured(),
    projectId: SIGNALWIRE_PROJECT_ID ? `${SIGNALWIRE_PROJECT_ID.substring(0, 8)}...` : "Not set",
    spaceUrl: SIGNALWIRE_SPACE_URL || "Not set",
  };
}

// Generate LaML XML for call handling
export function generateLamlDial(destination: string, options?: {
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

export function generateLamlRingGroup(endpoints: string[], options?: {
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

export function generateLamlVoicemail(greeting?: string) {
  const greetingText = greeting || "Please leave a message after the beep.";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${greetingText}</Say>
  <Record maxLength="120" transcribe="true" />
</Response>`;
}
