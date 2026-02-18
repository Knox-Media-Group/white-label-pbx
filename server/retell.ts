/**
 * Retell AI API Client
 * Handles AI voice agent creation, phone call management, and webhook integration
 * Used as the AI receptionist layer on top of Telnyx carrier
 */

import axios, { AxiosInstance } from "axios";

// Retell AI credentials
const RETELL_API_KEY = process.env.RETELL_API_KEY || "";

const BASE_URL = "https://api.retellai.com";

// Create axios instance with Retell auth
function createClient(): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "Authorization": `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
}

// ============ Configuration Check ============

export function isConfigured(): boolean {
  return !!RETELL_API_KEY;
}

export function getCredentialsSummary() {
  return {
    configured: isConfigured(),
    apiKey: RETELL_API_KEY ? `${RETELL_API_KEY.substring(0, 12)}...` : "Not set",
  };
}

// ============ Agents ============

export interface CreateAgentParams {
  agent_name?: string;
  voice_id?: string;
  response_engine: {
    type: "retell-llm";
    llm_id: string;
  } | {
    type: "custom-llm";
    url: string;
    api_key?: string;
  };
  language?: string;
  voice_model?: "eleven_turbo_v2" | "eleven_turbo_v2_5" | "eleven_flash_v2" | "eleven_flash_v2_5";
  voice_temperature?: number;
  voice_speed?: number;
  responsiveness?: number;
  interruption_sensitivity?: number;
  enable_backchannel?: boolean;
  backchannel_frequency?: number;
  backchannel_words?: string[];
  reminder_trigger_ms?: number;
  reminder_max_count?: number;
  ambient_sound?: "coffee-shop" | "convention-hall" | "summer-outdoor" | "mountain-outdoor" | "static-noise" | "call-center" | null;
  ambient_sound_volume?: number;
  pronunciation_dictionary?: Array<{ word: string; pronunciation: string; use_cases?: string[] }>;
  normalize_for_speech?: boolean;
  end_call_after_silence_ms?: number;
  max_call_duration_ms?: number;
  enable_voicemail_detection?: boolean;
  voicemail_message?: string;
  post_call_analysis_data?: Array<{
    name: string;
    type: "string" | "enum" | "boolean" | "number";
    description: string;
    examples?: string[];
    enum_values?: string[];
  }>;
  webhook_url?: string;
}

export async function createAgent(params: CreateAgentParams) {
  const client = createClient();
  const response = await client.post("/create-agent", params);
  return response.data;
}

export async function getAgent(agentId: string) {
  const client = createClient();
  const response = await client.get(`/get-agent/${agentId}`);
  return response.data;
}

export async function listAgents() {
  const client = createClient();
  const response = await client.get("/list-agents");
  return response.data;
}

export async function updateAgent(agentId: string, params: Partial<CreateAgentParams>) {
  const client = createClient();
  const response = await client.patch(`/update-agent/${agentId}`, params);
  return response.data;
}

export async function deleteAgent(agentId: string) {
  const client = createClient();
  const response = await client.delete(`/delete-agent/${agentId}`);
  return response.data;
}

// ============ Retell LLM ============

export interface CreateRetellLlmParams {
  model?: "gpt-4o" | "gpt-4o-mini" | "claude-3.5-sonnet" | "claude-3-haiku";
  general_prompt?: string;
  general_tools?: Array<{
    type: "end_call" | "transfer_call" | "check_availability_cal" | "book_appointment_cal" | "press_digit" | "custom";
    name?: string;
    description?: string;
    url?: string;
    speak_during_execution?: boolean;
    speak_after_execution?: boolean;
    execution_message_description?: string;
    properties?: Record<string, unknown>;
  }>;
  states?: Array<{
    name: string;
    state_prompt: string;
    tools?: Array<Record<string, unknown>>;
    edges?: Array<{
      description: string;
      destination_state_name: string;
      parameters?: Record<string, unknown>;
    }>;
  }>;
  begin_message?: string;
  inbound_dynamic_variables_webhook_url?: string;
}

export async function createRetellLlm(params: CreateRetellLlmParams) {
  const client = createClient();
  const response = await client.post("/create-retell-llm", params);
  return response.data;
}

export async function getRetellLlm(llmId: string) {
  const client = createClient();
  const response = await client.get(`/get-retell-llm/${llmId}`);
  return response.data;
}

export async function listRetellLlms() {
  const client = createClient();
  const response = await client.get("/list-retell-llms");
  return response.data;
}

export async function updateRetellLlm(llmId: string, params: Partial<CreateRetellLlmParams>) {
  const client = createClient();
  const response = await client.patch(`/update-retell-llm/${llmId}`, params);
  return response.data;
}

export async function deleteRetellLlm(llmId: string) {
  const client = createClient();
  const response = await client.delete(`/delete-retell-llm/${llmId}`);
  return response.data;
}

// ============ Phone Numbers ============

export async function listPhoneNumbers() {
  const client = createClient();
  const response = await client.get("/list-phone-numbers");
  return response.data;
}

export async function getPhoneNumber(phoneNumber: string) {
  const client = createClient();
  const response = await client.get(`/get-phone-number/${phoneNumber}`);
  return response.data;
}

export async function createPhoneNumber(params: {
  area_code?: number;
  inbound_agent_id?: string;
  outbound_agent_id?: string;
  nickname?: string;
}) {
  const client = createClient();
  const response = await client.post("/create-phone-number", params);
  return response.data;
}

export async function importPhoneNumber(params: {
  phone_number: string;
  termination_uri: string;
  inbound_agent_id?: string;
  outbound_agent_id?: string;
  nickname?: string;
  inbound_webhook_url?: string;
}) {
  const client = createClient();
  const response = await client.post("/import-phone-number", params);
  return response.data;
}

export async function updatePhoneNumber(phoneNumber: string, params: {
  inbound_agent_id?: string | null;
  outbound_agent_id?: string | null;
  nickname?: string;
  inbound_webhook_url?: string;
}) {
  const client = createClient();
  const response = await client.patch(`/update-phone-number/${phoneNumber}`, params);
  return response.data;
}

export async function deletePhoneNumber(phoneNumber: string) {
  const client = createClient();
  const response = await client.delete(`/delete-phone-number/${phoneNumber}`);
  return response.data;
}

// ============ Phone Calls ============

export async function createPhoneCall(params: {
  from_number: string;
  to_number: string;
  override_agent_id?: string;
  metadata?: Record<string, unknown>;
  retell_llm_dynamic_variables?: Record<string, string>;
}) {
  const client = createClient();
  const response = await client.post("/create-phone-call", params);
  return response.data;
}

export async function registerPhoneCall(params: {
  agent_id: string;
  from_number?: string;
  to_number?: string;
  direction?: "inbound" | "outbound";
  metadata?: Record<string, unknown>;
  retell_llm_dynamic_variables?: Record<string, string>;
}) {
  const client = createClient();
  const response = await client.post("/register-phone-call", params);
  return response.data;
}

export async function getCall(callId: string) {
  const client = createClient();
  const response = await client.get(`/get-call/${callId}`);
  return response.data;
}

export async function listCalls(params?: {
  sort_order?: "ascending" | "descending";
  limit?: number;
  filter_criteria?: {
    agent_id?: string[];
    before_start_timestamp?: number;
    after_start_timestamp?: number;
    before_end_timestamp?: number;
    after_end_timestamp?: number;
  };
}) {
  const client = createClient();
  const response = await client.post("/list-calls", params || {});
  return response.data;
}

// ============ Concurrency ============

export async function getConcurrency() {
  const client = createClient();
  const response = await client.get("/get-concurrency");
  return response.data;
}

// ============ Helper: Build Receptionist Agent ============

/**
 * Creates a complete AI receptionist agent configuration for Retell AI.
 * This sets up an LLM + Agent that can:
 * - Greet callers professionally
 * - Understand what department/person they need
 * - Transfer calls to the right SIP endpoint
 * - Handle voicemail if no one is available
 */
export async function createReceptionistAgent(config: {
  companyName: string;
  greeting?: string;
  departments: Array<{
    name: string;
    description: string;
    transferNumber: string;
  }>;
  voicemailMessage?: string;
  webhookUrl: string;
  customerId: number;
}): Promise<{ agentId: string; llmId: string }> {
  const departmentList = config.departments
    .map(d => `- ${d.name}: ${d.description} (transfer to ${d.transferNumber})`)
    .join("\n");

  const greeting = config.greeting ||
    `Hello, thank you for calling ${config.companyName}. How may I help you today?`;

  const transferTools = config.departments.map(dept => ({
    type: "transfer_call" as const,
    name: `transfer_to_${dept.name.toLowerCase().replace(/\s+/g, "_")}`,
    description: `Transfer the call to ${dept.name}. Use when the caller wants to speak with ${dept.description}.`,
    number: dept.transferNumber,
  }));

  // Create the LLM configuration
  const llmResponse = await createRetellLlm({
    model: "gpt-4o-mini",
    general_prompt: `You are a professional AI receptionist for ${config.companyName}.
Your job is to:
1. Greet callers warmly and professionally
2. Understand what they need
3. Transfer them to the appropriate department or person
4. If no department matches, take a message or offer to have someone call back

Available departments:
${departmentList}

Guidelines:
- Be concise and professional
- Ask clarifying questions if the caller's request is unclear
- Always confirm before transferring
- If the caller asks for a specific person, try to match them to the right department
- If no one is available, offer to take a message
- Never make up information about the company`,
    general_tools: [
      ...transferTools,
      {
        type: "end_call",
        name: "end_call",
        description: "End the call when the caller wants to hang up or the conversation is complete.",
      },
      {
        type: "custom",
        name: "log_message",
        description: "Log a message or callback request from the caller. Use when no one is available or the caller wants to leave a message.",
        url: `${config.webhookUrl}/api/webhooks/retell/message`,
        speak_during_execution: true,
        execution_message_description: "Taking down your message now.",
        properties: {
          caller_name: { type: "string", description: "The caller's name" },
          callback_number: { type: "string", description: "The number to call back" },
          message: { type: "string", description: "The message to relay" },
          department: { type: "string", description: "Which department the message is for" },
        },
      },
    ],
    begin_message: greeting,
    inbound_dynamic_variables_webhook_url: `${config.webhookUrl}/api/webhooks/retell/inbound-config?customerId=${config.customerId}`,
  });

  // Create the agent linked to this LLM
  const agentResponse = await createAgent({
    agent_name: `${config.companyName} Receptionist`,
    response_engine: {
      type: "retell-llm",
      llm_id: llmResponse.llm_id,
    },
    language: "en-US",
    voice_id: "11labs-Adrian",
    voice_speed: 1.0,
    responsiveness: 0.8,
    interruption_sensitivity: 0.7,
    enable_backchannel: true,
    backchannel_frequency: 0.8,
    backchannel_words: ["yeah", "uh-huh", "I see", "got it", "okay"],
    ambient_sound: "call-center",
    ambient_sound_volume: 0.3,
    end_call_after_silence_ms: 30000,
    max_call_duration_ms: 600000,
    enable_voicemail_detection: true,
    voicemail_message: config.voicemailMessage ||
      `Hello, this is ${config.companyName}'s automated assistant. We're returning a call from this number. Please call us back at your convenience. Thank you.`,
    post_call_analysis_data: [
      {
        name: "call_category",
        type: "enum",
        description: "The category of the call",
        enum_values: ["sales", "support", "billing", "general_inquiry", "complaint", "appointment", "other"],
      },
      {
        name: "call_summary",
        type: "string",
        description: "A brief summary of what the call was about",
      },
      {
        name: "caller_sentiment",
        type: "enum",
        description: "The caller's overall sentiment",
        enum_values: ["positive", "neutral", "negative"],
      },
      {
        name: "transfer_department",
        type: "string",
        description: "Which department the call was transferred to, if any",
      },
      {
        name: "action_required",
        type: "boolean",
        description: "Whether any follow-up action is required",
      },
    ],
    webhook_url: `${config.webhookUrl}/api/webhooks/retell/call-status`,
  });

  return {
    agentId: agentResponse.agent_id,
    llmId: llmResponse.llm_id,
  };
}

/**
 * Set up a phone number with Retell AI by importing it from Telnyx
 * The number must already be on Telnyx with a SIP trunk pointing to Retell's SIP server
 */
export async function setupNumberWithRetell(params: {
  phoneNumber: string;
  telnyxTerminationUri: string;
  agentId: string;
  nickname?: string;
  webhookUrl?: string;
}) {
  return importPhoneNumber({
    phone_number: params.phoneNumber,
    termination_uri: params.telnyxTerminationUri,
    inbound_agent_id: params.agentId,
    nickname: params.nickname,
    inbound_webhook_url: params.webhookUrl,
  });
}
