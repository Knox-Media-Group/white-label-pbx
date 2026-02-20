/**
 * Viirtue / NetSapiens API Client
 * Viirtue runs on the NetSapiens (NDP) platform.
 * This client connects to the ns-api to export customer data for migration.
 *
 * Auth: OAuth2 client_credentials grant → Bearer token
 * Base: https://{server}/ns-api/v2/
 */

import axios, { AxiosInstance } from "axios";

export interface ViirtueConfig {
  serverUrl: string;    // e.g. "https://portal.viirtue.com" or your branded URL
  clientId: string;     // OAuth2 client ID (your reseller API key)
  clientSecret: string; // OAuth2 client secret
}

interface OAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  obtainedAt: number;
}

let cachedToken: OAuthToken | null = null;

/**
 * Get an OAuth2 access token using client_credentials grant
 */
async function getAccessToken(config: ViirtueConfig): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.obtainedAt + (cachedToken.expires_in - 60) * 1000) {
    return cachedToken.access_token;
  }

  const tokenUrl = `${config.serverUrl}/ns-api/oauth2/token/`;
  const response = await axios.post(tokenUrl, new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  cachedToken = {
    ...response.data,
    obtainedAt: Date.now(),
  };

  return cachedToken!.access_token;
}

/**
 * Create an authenticated axios client for the ns-api
 */
async function createClient(config: ViirtueConfig): Promise<AxiosInstance> {
  const token = await getAccessToken(config);
  return axios.create({
    baseURL: `${config.serverUrl}/ns-api/v2/`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}

// ============ Domain / Reseller Info ============

export interface ViirtueDomain {
  domain: string;
  description: string;
  territory: string;
  max_user?: number;
}

/**
 * List all domains (customers/tenants) under the reseller account
 */
export async function listDomains(config: ViirtueConfig): Promise<ViirtueDomain[]> {
  const client = await createClient(config);
  const response = await client.get("domains/");
  // ns-api v2 returns array directly or in a wrapper
  const data = Array.isArray(response.data) ? response.data : (response.data?.items || response.data?.data || []);
  return data;
}

// ============ Subscribers (Extensions / Users) ============

export interface ViirtueSubscriber {
  user: string;            // extension number or username
  domain: string;          // which domain/customer they belong to
  first_name?: string;
  last_name?: string;
  name_caller_id?: string;
  number_caller_id?: string;
  email?: string;
  scope?: string;          // "Branch Office User", "Call Center Agent", etc.
  subscriber_login?: string;
  dial?: string;           // DID or extension
  device_count?: number;
}

/**
 * List all subscribers (extensions/users) for a domain
 */
export async function listSubscribers(config: ViirtueConfig, domain: string): Promise<ViirtueSubscriber[]> {
  const client = await createClient(config);
  const response = await client.get(`domains/${encodeURIComponent(domain)}/subscribers/`);
  const data = Array.isArray(response.data) ? response.data : (response.data?.items || response.data?.data || []);
  return data;
}

/**
 * Get a single subscriber
 */
export async function getSubscriber(config: ViirtueConfig, domain: string, user: string): Promise<ViirtueSubscriber | null> {
  const client = await createClient(config);
  try {
    const response = await client.get(`domains/${encodeURIComponent(domain)}/subscribers/${encodeURIComponent(user)}/`);
    return response.data;
  } catch {
    return null;
  }
}

// ============ Phone Numbers (DIDs) ============

export interface ViirtuePhoneNumber {
  dialplan: string;        // The actual phone number (DID)
  domain: string;          // Which domain it belongs to
  description?: string;
  from_user?: string;      // Where calls route to
  from_host?: string;
  matchrule?: string;
}

/**
 * List all phone numbers (DIDs) for a domain
 */
export async function listPhoneNumbers(config: ViirtueConfig, domain: string): Promise<ViirtuePhoneNumber[]> {
  const client = await createClient(config);
  const response = await client.get(`domains/${encodeURIComponent(domain)}/phonenumbers/`);
  const data = Array.isArray(response.data) ? response.data : (response.data?.items || response.data?.data || []);
  return data;
}

// ============ Call Queues / Ring Groups ============

export interface ViirtueCallQueue {
  queue: string;           // Queue name
  domain: string;
  description?: string;
  queue_login?: string;
  agents?: string[];       // List of agent users
  strategy?: string;       // "ring-all", "round-robin", etc.
  timeout?: number;
  max_wait?: number;
}

/**
 * List call queues (ring groups) for a domain
 */
export async function listCallQueues(config: ViirtueConfig, domain: string): Promise<ViirtueCallQueue[]> {
  const client = await createClient(config);
  try {
    const response = await client.get(`domains/${encodeURIComponent(domain)}/callqueues/`);
    const data = Array.isArray(response.data) ? response.data : (response.data?.items || response.data?.data || []);
    return data;
  } catch {
    return [];
  }
}

// ============ Auto Attendants (IVRs) ============

export interface ViirtueAutoAttendant {
  auto_attendant: string;
  domain: string;
  description?: string;
  greeting?: string;
  timeout_destination?: string;
  options?: Record<string, string>;  // DTMF key → destination
}

/**
 * List auto attendants (IVRs) for a domain
 */
export async function listAutoAttendants(config: ViirtueConfig, domain: string): Promise<ViirtueAutoAttendant[]> {
  const client = await createClient(config);
  try {
    const response = await client.get(`domains/${encodeURIComponent(domain)}/autoattendants/`);
    const data = Array.isArray(response.data) ? response.data : (response.data?.items || response.data?.data || []);
    return data;
  } catch {
    return [];
  }
}

// ============ Time Frames ============

export interface ViirtueTimeFrame {
  name: string;
  domain: string;
  time_frame?: string;  // Cron-like schedule definition
}

/**
 * List time frames for a domain
 */
export async function listTimeFrames(config: ViirtueConfig, domain: string): Promise<ViirtueTimeFrame[]> {
  const client = await createClient(config);
  try {
    const response = await client.get(`domains/${encodeURIComponent(domain)}/timeframes/`);
    const data = Array.isArray(response.data) ? response.data : (response.data?.items || response.data?.data || []);
    return data;
  } catch {
    return [];
  }
}

// ============ CDR (Call Detail Records) ============

export interface ViirtueCdr {
  orig_callid?: string;
  term_callid?: string;
  orig_from_user?: string;
  orig_to_user?: string;
  time_start?: string;
  time_answer?: string;
  time_release?: string;
  duration?: number;
  direction?: string;
  release_text?: string;
}

/**
 * List recent CDRs for a domain
 */
export async function listCdrs(config: ViirtueConfig, domain: string, limit = 100): Promise<ViirtueCdr[]> {
  const client = await createClient(config);
  try {
    const response = await client.get(`domains/${encodeURIComponent(domain)}/cdrs/`, {
      params: { limit },
    });
    const data = Array.isArray(response.data) ? response.data : (response.data?.items || response.data?.data || []);
    return data;
  } catch {
    return [];
  }
}

// ============ Full Domain Export (convenience) ============

export interface ViirtueDomainExport {
  domain: ViirtueDomain;
  subscribers: ViirtueSubscriber[];
  phoneNumbers: ViirtuePhoneNumber[];
  callQueues: ViirtueCallQueue[];
  autoAttendants: ViirtueAutoAttendant[];
  timeFrames: ViirtueTimeFrame[];
}

/**
 * Export all data for a single domain (customer)
 */
export async function exportDomain(config: ViirtueConfig, domainName: string): Promise<ViirtueDomainExport> {
  // Fetch all resources in parallel
  const [subscribers, phoneNumbers, callQueues, autoAttendants, timeFrames] = await Promise.all([
    listSubscribers(config, domainName),
    listPhoneNumbers(config, domainName),
    listCallQueues(config, domainName),
    listAutoAttendants(config, domainName),
    listTimeFrames(config, domainName),
  ]);

  return {
    domain: { domain: domainName, description: domainName, territory: "" },
    subscribers,
    phoneNumbers,
    callQueues,
    autoAttendants,
    timeFrames,
  };
}

/**
 * Test connection to the Viirtue/NetSapiens API
 */
export async function testConnection(config: ViirtueConfig): Promise<{ success: boolean; error?: string; domains?: number }> {
  try {
    const domains = await listDomains(config);
    return { success: true, domains: domains.length };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        return { success: false, error: "Invalid credentials. Check your client ID and secret." };
      }
      if (error.response?.status === 403) {
        return { success: false, error: "Access denied. Your API credentials may not have reseller-level access." };
      }
      return { success: false, error: `API error (${error.response?.status}): ${error.response?.data?.message || message}` };
    }
    return { success: false, error: `Connection failed: ${message}` };
  }
}
