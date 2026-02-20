/**
 * Retell AI API Client
 * Handles all interactions with the Retell AI platform for AI voice agents
 */

import Retell from "retell-sdk";
import * as db from "./db";

const RETELL_API_KEY = process.env.RETELL_API_KEY || "";

// Lazy-initialized client (created on first use)
let _client: Retell | null = null;

async function getApiKey(): Promise<string> {
  // Check DB settings first, then fall back to env var
  const dbKey = await db.getSystemSetting("retell_api_key");
  return dbKey || RETELL_API_KEY;
}

async function getClient(): Promise<Retell> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Retell API key is not configured");
  }
  // Recreate client if key may have changed
  _client = new Retell({ apiKey });
  return _client;
}

// ============ Configuration ============

export async function isConfigured(): Promise<boolean> {
  const key = await getApiKey();
  return !!key;
}

export async function getConfigSummary() {
  const key = await getApiKey();
  return {
    configured: !!key,
    apiKey: key ? `${key.substring(0, 12)}...` : "Not set",
  };
}

// ============ Agents ============

export async function createAgent(params: {
  agentName: string;
  voiceId?: string;
  responseEngine?: { type: "retell-llm"; llmId: string };
  webhookUrl?: string;
  language?: string;
}) {
  const client = await getClient();
  const createParams: Record<string, unknown> = {
    agent_name: params.agentName,
  };
  if (params.voiceId) createParams.voice_id = params.voiceId;
  if (params.responseEngine) {
    createParams.response_engine = {
      type: params.responseEngine.type,
      llm_id: params.responseEngine.llmId,
    };
  }
  if (params.webhookUrl) createParams.webhook_url = params.webhookUrl;
  if (params.language) createParams.language = params.language;

  return client.agent.create(createParams as any);
}

export async function getAgent(agentId: string) {
  const client = await getClient();
  return client.agent.retrieve(agentId);
}

export async function listAgents() {
  const client = await getClient();
  return client.agent.list();
}

export async function updateAgent(
  agentId: string,
  params: {
    agentName?: string;
    voiceId?: string;
    webhookUrl?: string;
    language?: string;
  }
) {
  const client = await getClient();
  const updateParams: Record<string, unknown> = {};
  if (params.agentName) updateParams.agent_name = params.agentName;
  if (params.voiceId) updateParams.voice_id = params.voiceId;
  if (params.webhookUrl) updateParams.webhook_url = params.webhookUrl;
  if (params.language) updateParams.language = params.language;

  return client.agent.update(agentId, updateParams as any);
}

export async function deleteAgent(agentId: string) {
  const client = await getClient();
  return client.agent.delete(agentId);
}

// ============ Phone Numbers ============

export async function createPhoneNumber(params: {
  areaCode?: number;
  inboundAgentId?: string;
  outboundAgentId?: string;
  nickname?: string;
}) {
  const client = await getClient();
  return client.phoneNumber.create({
    area_code: params.areaCode,
    inbound_agent_id: params.inboundAgentId,
    outbound_agent_id: params.outboundAgentId,
    nickname: params.nickname,
  } as any);
}

export async function importPhoneNumber(params: {
  phoneNumber: string;
  terminationUri: string;
  inboundAgentId?: string;
  outboundAgentId?: string;
  sipTrunkAuthUsername?: string;
  sipTrunkAuthPassword?: string;
}) {
  const client = await getClient();
  return client.phoneNumber.import({
    phone_number: params.phoneNumber,
    termination_uri: params.terminationUri,
    inbound_agent_id: params.inboundAgentId,
    outbound_agent_id: params.outboundAgentId,
    sip_trunk_auth_username: params.sipTrunkAuthUsername,
    sip_trunk_auth_password: params.sipTrunkAuthPassword,
  } as any);
}

export async function listPhoneNumbers() {
  const client = await getClient();
  return client.phoneNumber.list();
}

export async function getPhoneNumber(phoneNumber: string) {
  const client = await getClient();
  return client.phoneNumber.retrieve(phoneNumber);
}

export async function updatePhoneNumber(
  phoneNumber: string,
  params: {
    inboundAgentId?: string | null;
    outboundAgentId?: string | null;
    nickname?: string;
  }
) {
  const client = await getClient();
  const updateParams: Record<string, unknown> = {};
  if (params.inboundAgentId !== undefined) updateParams.inbound_agent_id = params.inboundAgentId;
  if (params.outboundAgentId !== undefined) updateParams.outbound_agent_id = params.outboundAgentId;
  if (params.nickname) updateParams.nickname = params.nickname;

  return client.phoneNumber.update(phoneNumber, updateParams as any);
}

export async function deletePhoneNumber(phoneNumber: string) {
  const client = await getClient();
  return client.phoneNumber.delete(phoneNumber);
}

// ============ Calls ============

export async function createPhoneCall(params: {
  fromNumber: string;
  toNumber: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}) {
  const client = await getClient();
  return client.call.createPhoneCall({
    from_number: params.fromNumber,
    to_number: params.toNumber,
    override_agent_id: params.agentId,
    metadata: params.metadata,
  } as any);
}

export async function getCall(callId: string) {
  const client = await getClient();
  return client.call.retrieve(callId);
}

export async function listCalls(params?: {
  agentId?: string;
  limit?: number;
}) {
  const client = await getClient();
  const listParams: Record<string, unknown> = {};
  if (params?.agentId) listParams.filter_criteria = { agent_id: [params.agentId] };
  if (params?.limit) listParams.limit = params.limit;
  return client.call.list(listParams as any);
}

// ============ Webhook Verification ============

export async function verifyWebhook(
  body: string,
  apiKey: string,
  signature: string
): Promise<boolean> {
  return Retell.verify(body, apiKey, signature);
}
