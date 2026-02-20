/**
 * AI-Powered IVR Handler
 * Uses Telnyx TeXML speech recognition and LLM for intelligent call routing
 */

import { invokeLLM } from "./_core/llm";
import * as db from "./db";

interface TransferIntent {
  shouldTransfer: boolean;
  department: string | null;
  confidence: number;
  response: string;
}

interface RingGroupMapping {
  [key: string]: string[];
}

// Common department name mappings
const DEPARTMENT_ALIASES: RingGroupMapping = {
  sales: ["sales", "sell", "buy", "purchase", "pricing", "quote", "order", "orders"],
  support: ["support", "help", "technical", "tech support", "assistance", "problem", "issue", "trouble"],
  billing: ["billing", "payment", "invoice", "account", "charge", "refund", "money"],
  hr: ["hr", "human resources", "jobs", "careers", "employment", "hiring", "recruit"],
  reception: ["reception", "front desk", "operator", "main", "general"],
  management: ["management", "manager", "supervisor", "director", "executive"],
  shipping: ["shipping", "delivery", "tracking", "package", "order status"],
  returns: ["returns", "return", "exchange", "warranty", "rma"],
};

/**
 * Analyze caller speech to determine transfer intent using LLM
 */
export async function analyzeTransferIntent(
  speechText: string,
  availableDepartments: string[]
): Promise<TransferIntent> {
  const departmentList = availableDepartments.join(", ");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an AI assistant analyzing caller requests for a phone system.
Your job is to determine if the caller wants to be transferred to a specific department.

Available departments: ${departmentList}

Respond in JSON format with these fields:
- shouldTransfer: boolean (true if caller wants to speak to a department/person)
- department: string or null (the department name from the available list, or null if unclear)
- confidence: number 0-1 (how confident you are in the match)
- response: string (what to say to the caller)

If the caller's request doesn't match any department, set shouldTransfer to false and provide a helpful response asking them to clarify.
If they want to speak to a person by name, try to match to the most relevant department.
Always be polite and professional in your responses.`
      },
      {
        role: "user",
        content: `Caller said: "${speechText}"`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "transfer_intent",
        strict: true,
        schema: {
          type: "object",
          properties: {
            shouldTransfer: { type: "boolean" },
            department: { type: ["string", "null"] },
            confidence: { type: "number" },
            response: { type: "string" }
          },
          required: ["shouldTransfer", "department", "confidence", "response"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices?.[0]?.message?.content;
  if (content && typeof content === 'string') {
    try {
      return JSON.parse(content) as TransferIntent;
    } catch {
      // Fallback if parsing fails
    }
  }

  return {
    shouldTransfer: false,
    department: null,
    confidence: 0,
    response: "I'm sorry, I didn't quite understand that. Could you please tell me which department you'd like to reach?"
  };
}

/**
 * Find matching ring group for a department name
 */
export async function findDepartmentRingGroup(
  customerId: number,
  departmentName: string
): Promise<{ ringGroupId: number; name: string } | null> {
  const ringGroups = await db.getRingGroupsByCustomer(customerId);

  // Normalize the department name
  const normalizedDept = departmentName.toLowerCase().trim();

  // First, try exact match
  for (const group of ringGroups) {
    if (group.name.toLowerCase() === normalizedDept) {
      return { ringGroupId: group.id, name: group.name };
    }
  }

  // Then try alias matching
  for (const group of ringGroups) {
    const groupNameLower = group.name.toLowerCase();

    // Check if any alias matches
    for (const [dept, aliases] of Object.entries(DEPARTMENT_ALIASES)) {
      if (aliases.some(alias => groupNameLower.includes(alias) || alias.includes(groupNameLower))) {
        if (aliases.some(alias => normalizedDept.includes(alias) || alias.includes(normalizedDept))) {
          return { ringGroupId: group.id, name: group.name };
        }
      }
    }
  }

  // Try partial match
  for (const group of ringGroups) {
    if (group.name.toLowerCase().includes(normalizedDept) ||
        normalizedDept.includes(group.name.toLowerCase())) {
      return { ringGroupId: group.id, name: group.name };
    }
  }

  return null;
}

/**
 * Find matching SIP endpoint for a department/extension
 */
export async function findDepartmentEndpoint(
  customerId: number,
  departmentName: string
): Promise<{ endpointId: number; username: string; displayName: string | null } | null> {
  const endpoints = await db.getSipEndpointsByCustomer(customerId);

  const normalizedDept = departmentName.toLowerCase().trim();

  // Try to match by display name or username
  for (const endpoint of endpoints) {
    const displayName = (endpoint.displayName || "").toLowerCase();
    const username = endpoint.username.toLowerCase();

    if (displayName.includes(normalizedDept) ||
        normalizedDept.includes(displayName) ||
        username.includes(normalizedDept)) {
      return {
        endpointId: endpoint.id,
        username: endpoint.username,
        displayName: endpoint.displayName
      };
    }
  }

  return null;
}

/**
 * Generate TeXML for AI-powered IVR with speech recognition
 */
export function generateAiIvrTeXml(options: {
  customerId: number;
  greeting?: string;
  gatherTimeout?: number;
  maxAttempts?: number;
  webhookUrl: string;
}): string {
  const {
    customerId,
    greeting = "Hello, thank you for calling. How may I direct your call?",
    gatherTimeout = 5,
    webhookUrl,
  } = options;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="${gatherTimeout}" speechTimeout="auto" action="${webhookUrl}/api/webhooks/ai-gather?customerId=${customerId}" method="POST">
    <Say>${greeting}</Say>
  </Gather>
  <Say>I didn't hear anything. Let me transfer you to our main line.</Say>
  <Redirect>${webhookUrl}/api/webhooks/ai-fallback?customerId=${customerId}</Redirect>
</Response>`;
}

/**
 * Generate TeXML for transfer to ring group
 */
export function generateTransferToRingGroupTeXml(
  sipAddresses: string[],
  options: {
    strategy: 'simultaneous' | 'sequential';
    timeout: number;
    announcement?: string;
    fallbackUrl?: string;
    callerId?: string;
  }
): string {
  const { strategy, timeout, announcement, fallbackUrl, callerId } = options;

  let texml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;

  if (announcement) {
    texml += `
  <Say>${announcement}</Say>`;
  }

  if (strategy === 'simultaneous') {
    texml += `
  <Dial timeout="${timeout}"${callerId ? ` callerId="${callerId}"` : ''}${fallbackUrl ? ` action="${fallbackUrl}"` : ''}>`;
    for (const sip of sipAddresses) {
      texml += `
    <Sip>${sip}</Sip>`;
    }
    texml += `
  </Dial>`;
  } else {
    // Sequential - dial one at a time
    for (let i = 0; i < sipAddresses.length; i++) {
      const isLast = i === sipAddresses.length - 1;
      texml += `
  <Dial timeout="${Math.floor(timeout / sipAddresses.length)}"${callerId ? ` callerId="${callerId}"` : ''}${!isLast || fallbackUrl ? ` action="${fallbackUrl || ''}"` : ''}>
    <Sip>${sipAddresses[i]}</Sip>
  </Dial>`;
    }
  }

  texml += `
</Response>`;

  return texml;
}

/**
 * Generate TeXML for transfer to single endpoint
 */
export function generateTransferToEndpointTeXml(
  sipAddress: string,
  options: {
    timeout?: number;
    announcement?: string;
    fallbackUrl?: string;
    callerId?: string;
  }
): string {
  const { timeout = 30, announcement, fallbackUrl, callerId } = options;

  let texml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;

  if (announcement) {
    texml += `
  <Say>${announcement}</Say>`;
  }

  texml += `
  <Dial timeout="${timeout}"${callerId ? ` callerId="${callerId}"` : ''}${fallbackUrl ? ` action="${fallbackUrl}"` : ''}>
    <Sip>${sipAddress}</Sip>
  </Dial>
</Response>`;

  return texml;
}

/**
 * Generate TeXML for retry prompt
 */
export function generateRetryTeXml(
  message: string,
  webhookUrl: string,
  customerId: number,
  attempt: number
): string {
  if (attempt >= 3) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I'm having trouble understanding your request. Let me transfer you to our main line.</Say>
  <Redirect>${webhookUrl}/api/webhooks/ai-fallback?customerId=${customerId}</Redirect>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${webhookUrl}/api/webhooks/ai-gather?customerId=${customerId}&amp;attempt=${attempt + 1}" method="POST">
    <Say>${message}</Say>
  </Gather>
  <Say>I didn't hear a response. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Get available departments for a customer
 */
export async function getAvailableDepartments(customerId: number): Promise<string[]> {
  const ringGroups = await db.getRingGroupsByCustomer(customerId);
  const endpoints = await db.getSipEndpointsByCustomer(customerId);

  const departments = new Set<string>();

  // Add ring group names
  for (const group of ringGroups) {
    if (group.status === 'active') {
      departments.add(group.name);
    }
  }

  // Add endpoint display names if they look like departments
  for (const endpoint of endpoints) {
    if (endpoint.status === 'active' && endpoint.displayName) {
      departments.add(endpoint.displayName);
    }
  }

  return Array.from(departments);
}
