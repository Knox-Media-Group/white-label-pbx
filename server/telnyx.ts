/**
 * Telnyx API Client
 * Handles SIP trunking, phone numbers, call control, and messaging
 * Replaces SignalWire as the carrier backbone
 */

import axios, { AxiosInstance } from "axios";

// Telnyx API credentials
const TELNYX_API_KEY = process.env.TELNYX_API_KEY || "";
const TELNYX_SIP_CONNECTION_ID = process.env.TELNYX_SIP_CONNECTION_ID || "";
const TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID || "";

const BASE_URL = "https://api.telnyx.com/v2";

// Create axios instance with Telnyx auth
function createClient(): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "Authorization": `Bearer ${TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
}

// ============ Configuration Check ============

export function isConfigured(): boolean {
  return !!TELNYX_API_KEY;
}

export function getCredentialsSummary() {
  return {
    configured: isConfigured(),
    apiKey: TELNYX_API_KEY ? `${TELNYX_API_KEY.substring(0, 12)}...` : "Not set",
    sipConnectionId: TELNYX_SIP_CONNECTION_ID || "Not set",
    messagingProfileId: TELNYX_MESSAGING_PROFILE_ID || "Not set",
  };
}

// ============ SIP Connections (Trunks) ============

export async function listSipConnections() {
  const client = createClient();
  const response = await client.get("/sip_connections");
  return response.data;
}

export async function getSipConnection(id: string) {
  const client = createClient();
  const response = await client.get(`/sip_connections/${id}`);
  return response.data;
}

export async function createSipConnection(params: {
  name: string;
  active?: boolean;
  anchorsite_override?: string;
  transport_protocol?: "UDP" | "TCP" | "TLS";
  default_on_hold_comfort_noise_enabled?: boolean;
}) {
  const client = createClient();
  const response = await client.post("/sip_connections", params);
  return response.data;
}

export async function updateSipConnection(id: string, params: Partial<{
  name: string;
  active: boolean;
  transport_protocol: "UDP" | "TCP" | "TLS";
}>) {
  const client = createClient();
  const response = await client.patch(`/sip_connections/${id}`, params);
  return response.data;
}

export async function deleteSipConnection(id: string) {
  const client = createClient();
  const response = await client.delete(`/sip_connections/${id}`);
  return response.data;
}

// ============ Credential Connections (for VoIP Phone Registration) ============

export interface CreateCredentialConnectionParams {
  connection_name: string;
  user_name: string;
  password: string;
  sip_uri_calling_preference?: "disabled" | "unrestricted";
  default_on_hold_comfort_noise_enabled?: boolean;
  outbound?: {
    outbound_voice_profile_id?: string;
    ani_override?: string;
    ani_override_type?: "always" | "normal";
    channel_limit?: number;
  };
  inbound?: {
    ani_number_format?: "E.164" | "E.164-national" | "national";
    dnis_number_format?: "E.164" | "e164" | "national";
    sip_subdomain?: string;
    sip_subdomain_receive_settings?: "only_my_connections" | "from_anyone";
    channel_limit?: number;
  };
}

export async function listCredentialConnections() {
  const client = createClient();
  const response = await client.get("/credential_connections");
  return response.data;
}

export async function getCredentialConnection(id: string) {
  const client = createClient();
  const response = await client.get(`/credential_connections/${id}`);
  return response.data;
}

export async function createCredentialConnection(params: CreateCredentialConnectionParams) {
  const client = createClient();
  const response = await client.post("/credential_connections", params);
  return response.data;
}

export async function updateCredentialConnection(id: string, params: Partial<CreateCredentialConnectionParams>) {
  const client = createClient();
  const response = await client.patch(`/credential_connections/${id}`, params);
  return response.data;
}

export async function deleteCredentialConnection(id: string) {
  const client = createClient();
  const response = await client.delete(`/credential_connections/${id}`);
  return response.data;
}

// ============ Phone Numbers ============

export interface SearchPhoneNumbersParams {
  country_code?: string;
  administrative_area?: string;
  locality?: string;
  national_destination_code?: string;
  number_type?: "local" | "toll_free" | "national";
  features?: string[];
  limit?: number;
}

export async function searchAvailablePhoneNumbers(params: SearchPhoneNumbersParams = {}) {
  const client = createClient();
  const queryParams: Record<string, string> = {};

  if (params.country_code) queryParams["filter[country_code]"] = params.country_code;
  if (params.administrative_area) queryParams["filter[administrative_area]"] = params.administrative_area;
  if (params.locality) queryParams["filter[locality]"] = params.locality;
  if (params.national_destination_code) queryParams["filter[national_destination_code]"] = params.national_destination_code;
  if (params.number_type) queryParams["filter[phone_number_type]"] = params.number_type;
  if (params.limit) queryParams["page[size]"] = params.limit.toString();

  const response = await client.get("/available_phone_numbers", { params: queryParams });
  return response.data;
}

export async function listPhoneNumbers() {
  const client = createClient();
  const response = await client.get("/phone_numbers");
  return response.data;
}

export async function getPhoneNumber(id: string) {
  const client = createClient();
  const response = await client.get(`/phone_numbers/${id}`);
  return response.data;
}

export async function purchasePhoneNumber(phoneNumber: string, connectionId?: string) {
  const client = createClient();
  const response = await client.post("/number_orders", {
    phone_numbers: [{ phone_number: phoneNumber }],
    connection_id: connectionId || TELNYX_SIP_CONNECTION_ID,
  });
  return response.data;
}

export async function updatePhoneNumber(id: string, params: {
  connection_id?: string;
  tags?: string[];
  external_pin?: string;
}) {
  const client = createClient();
  const response = await client.patch(`/phone_numbers/${id}`, params);
  return response.data;
}

export async function deletePhoneNumber(id: string) {
  const client = createClient();
  const response = await client.delete(`/phone_numbers/${id}`);
  return response.data;
}

// ============ Number Port Orders (Viirtue -> Telnyx) ============

export interface CreatePortOrderParams {
  phone_numbers: string[];
  authorized_name: string;
  service_address: {
    street_address: string;
    locality: string;
    administrative_area: string;
    postal_code: string;
    country_code: string;
  };
  current_carrier?: string;
  account_number?: string;
  pin?: string;
  desired_foc_date?: string;
}

export async function createPortOrder(params: CreatePortOrderParams) {
  const client = createClient();
  const response = await client.post("/porting/port_ins", {
    phone_numbers: params.phone_numbers.map(n => ({ phone_number: n })),
    authorized_person_name: params.authorized_name,
    documents: [],
    end_user: {
      admin_name: params.authorized_name,
      location: {
        street_address: params.service_address.street_address,
        city: params.service_address.locality,
        state: params.service_address.administrative_area,
        zip: params.service_address.postal_code,
        country: params.service_address.country_code,
      },
    },
    old_service_provider_ocn: params.current_carrier || "",
    foc_datetime_requested: params.desired_foc_date || undefined,
  });
  return response.data;
}

export async function listPortOrders() {
  const client = createClient();
  const response = await client.get("/porting/port_ins");
  return response.data;
}

export async function getPortOrder(id: string) {
  const client = createClient();
  const response = await client.get(`/porting/port_ins/${id}`);
  return response.data;
}

// ============ Call Control ============

export async function createCall(params: {
  to: string;
  from: string;
  connection_id?: string;
  webhook_url?: string;
  webhook_url_method?: "GET" | "POST";
  answering_machine_detection?: "detect" | "detect_beep" | "detect_words" | "greeting_end" | "disabled";
  client_state?: string;
}) {
  const client = createClient();
  const response = await client.post("/calls", {
    ...params,
    connection_id: params.connection_id || TELNYX_SIP_CONNECTION_ID,
  });
  return response.data;
}

export async function hangupCall(callControlId: string) {
  const client = createClient();
  const response = await client.post(`/calls/${callControlId}/actions/hangup`);
  return response.data;
}

export async function answerCall(callControlId: string, webhookUrl?: string) {
  const client = createClient();
  const response = await client.post(`/calls/${callControlId}/actions/answer`, {
    webhook_url: webhookUrl,
  });
  return response.data;
}

export async function transferCall(callControlId: string, params: {
  to: string;
  from?: string;
  webhook_url?: string;
  timeout_secs?: number;
  sip_headers?: Array<{ name: string; value: string }>;
}) {
  const client = createClient();
  const response = await client.post(`/calls/${callControlId}/actions/transfer`, params);
  return response.data;
}

export async function bridgeCalls(callControlId: string, targetCallControlId: string) {
  const client = createClient();
  const response = await client.post(`/calls/${callControlId}/actions/bridge`, {
    call_control_id: targetCallControlId,
  });
  return response.data;
}

export async function speakText(callControlId: string, params: {
  payload: string;
  voice: string;
  language?: string;
  payload_type?: "text" | "ssml";
}) {
  const client = createClient();
  const response = await client.post(`/calls/${callControlId}/actions/speak`, {
    ...params,
    language: params.language || "en-US",
    payload_type: params.payload_type || "text",
  });
  return response.data;
}

export async function startRecording(callControlId: string, params?: {
  format?: "wav" | "mp3";
  channels?: "single" | "dual";
}) {
  const client = createClient();
  const response = await client.post(`/calls/${callControlId}/actions/record_start`, {
    format: params?.format || "wav",
    channels: params?.channels || "single",
  });
  return response.data;
}

export async function stopRecording(callControlId: string) {
  const client = createClient();
  const response = await client.post(`/calls/${callControlId}/actions/record_stop`);
  return response.data;
}

export async function gatherDtmf(callControlId: string, params: {
  minimum_digits?: number;
  maximum_digits?: number;
  timeout_millis?: number;
  inter_digit_timeout_millis?: number;
  valid_digits?: string;
}) {
  const client = createClient();
  const response = await client.post(`/calls/${callControlId}/actions/gather`, params);
  return response.data;
}

export async function gatherSpeech(callControlId: string, params: {
  language?: string;
  timeout_millis?: number;
}) {
  const client = createClient();
  const response = await client.post(`/calls/${callControlId}/actions/gather_using_speak`, {
    language: params.language || "en-US",
    ...params,
  });
  return response.data;
}

export async function sendDtmf(callControlId: string, digits: string) {
  const client = createClient();
  const response = await client.post(`/calls/${callControlId}/actions/send_dtmf`, {
    digits,
  });
  return response.data;
}

// ============ TeXML (Telnyx XML for call control) ============

export function generateTexmlDial(destination: string, options?: {
  callerId?: string;
  timeout?: number;
  action?: string;
  record?: "record-from-answer" | "do-not-record";
}) {
  const timeout = options?.timeout || 30;
  const callerIdAttr = options?.callerId ? ` callerId="${options.callerId}"` : "";
  const actionAttr = options?.action ? ` action="${options.action}"` : "";
  const recordAttr = options?.record ? ` record="${options.record}"` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${timeout}"${callerIdAttr}${actionAttr}${recordAttr}>
    <Sip>${destination}</Sip>
  </Dial>
</Response>`;
}

export function generateTexmlRingGroup(endpoints: string[], options?: {
  strategy?: "simultaneous" | "sequential";
  timeout?: number;
  callerId?: string;
}) {
  const timeout = options?.timeout || 30;
  const callerIdAttr = options?.callerId ? ` callerId="${options.callerId}"` : "";

  if (options?.strategy === "sequential") {
    const dials = endpoints.map((ep, i) => {
      const nextAction = i < endpoints.length - 1 ? ` action="/api/webhooks/telnyx/next-in-sequence?index=${i + 1}"` : "";
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

export function generateTexmlVoicemail(greeting?: string) {
  const greetingText = greeting || "Please leave a message after the beep.";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${greetingText}</Say>
  <Record maxLength="120" transcribe="true" />
</Response>`;
}

// ============ Messaging (SMS/MMS) ============

export async function sendSms(params: {
  from: string;
  to: string;
  body: string;
  webhookUrl?: string;
}) {
  const client = createClient();
  const response = await client.post("/messages", {
    from: params.from,
    to: params.to,
    text: params.body,
    messaging_profile_id: TELNYX_MESSAGING_PROFILE_ID || undefined,
    webhook_url: params.webhookUrl,
  });
  return response.data;
}

export async function listMessages(params?: { from?: string; to?: string }) {
  const client = createClient();
  const queryParams: Record<string, string> = {};
  if (params?.from) queryParams["filter[from]"] = params.from;
  if (params?.to) queryParams["filter[to]"] = params.to;
  const response = await client.get("/messages", { params: queryParams });
  return response.data;
}

// ============ Recordings ============

export async function listRecordings() {
  const client = createClient();
  const response = await client.get("/recordings");
  return response.data;
}

export async function getRecording(id: string) {
  const client = createClient();
  const response = await client.get(`/recordings/${id}`);
  return response.data;
}

export async function deleteRecording(id: string) {
  const client = createClient();
  const response = await client.delete(`/recordings/${id}`);
  return response.data;
}

// ============ Outbound Voice Profiles ============

export async function listOutboundVoiceProfiles() {
  const client = createClient();
  const response = await client.get("/outbound_voice_profiles");
  return response.data;
}

export async function createOutboundVoiceProfile(params: {
  name: string;
  billing_group_id?: string;
  traffic_type?: "conversational" | "short_duration";
}) {
  const client = createClient();
  const response = await client.post("/outbound_voice_profiles", params);
  return response.data;
}

// ============ TeXML Applications ============

export async function listTexmlApplications() {
  const client = createClient();
  const response = await client.get("/texml_applications");
  return response.data;
}

export async function createTexmlApplication(params: {
  friendly_name: string;
  voice_url: string;
  voice_fallback_url?: string;
  voice_method?: "GET" | "POST";
  status_callback?: string;
  status_callback_method?: "GET" | "POST";
  inbound?: boolean;
  outbound?: boolean;
}) {
  const client = createClient();
  const response = await client.post("/texml_applications", params);
  return response.data;
}

export async function updateTexmlApplication(id: string, params: Partial<{
  friendly_name: string;
  voice_url: string;
  voice_fallback_url: string;
  voice_method: "GET" | "POST";
  status_callback: string;
  status_callback_method: "GET" | "POST";
}>) {
  const client = createClient();
  const response = await client.patch(`/texml_applications/${id}`, params);
  return response.data;
}

export async function deleteTexmlApplication(id: string) {
  const client = createClient();
  const response = await client.delete(`/texml_applications/${id}`);
  return response.data;
}
