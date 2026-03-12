/**
 * Call Summary Generator
 * Uses LLM to generate concise summaries of call transcriptions
 * and sends them via SMS to the appropriate recipient
 */

import { invokeLLM } from "./_core/llm";
import * as telnyxApi from "./telnyx";
import * as db from "./db";

export interface CallSummaryInput {
  callSid: string;
  fromNumber: string;
  toNumber: string;
  direction: "inbound" | "outbound";
  duration: number;
  transcription?: string | null;
  customerId: number;
}

export interface CallSummary {
  summary: string;
  keyPoints: string[];
  sentiment: "positive" | "neutral" | "negative";
  actionItems: string[];
  category: string;
}

/**
 * Generate a call summary using LLM
 */
export async function generateCallSummary(
  transcription: string,
  context?: {
    fromNumber?: string;
    toNumber?: string;
    duration?: number;
    direction?: string;
  }
): Promise<CallSummary> {
  const durationMinutes = context?.duration ? Math.ceil(context.duration / 60) : 0;
  
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an AI assistant that summarizes phone call transcriptions for business purposes.
Generate a concise, professional summary that captures the key information from the call.

Your summary should be:
- Brief (2-3 sentences max for the main summary)
- Professional in tone
- Focused on actionable information
- Suitable for SMS delivery (under 320 characters for the summary)

Respond in JSON format with these fields:
- summary: A brief 1-2 sentence summary (max 320 characters)
- keyPoints: Array of 2-4 key points from the call
- sentiment: Overall sentiment (positive, neutral, or negative)
- actionItems: Array of any action items or follow-ups mentioned
- category: Call category (sales, support, inquiry, complaint, appointment, other)`
      },
      {
        role: "user",
        content: `Please summarize this ${context?.direction || "phone"} call (${durationMinutes} minutes):

${transcription}`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "call_summary",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Brief summary under 320 characters" },
            keyPoints: { 
              type: "array", 
              items: { type: "string" },
              description: "2-4 key points from the call"
            },
            sentiment: { 
              type: "string", 
              enum: ["positive", "neutral", "negative"],
              description: "Overall sentiment of the call"
            },
            actionItems: { 
              type: "array", 
              items: { type: "string" },
              description: "Action items or follow-ups mentioned"
            },
            category: { 
              type: "string",
              description: "Call category"
            }
          },
          required: ["summary", "keyPoints", "sentiment", "actionItems", "category"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices?.[0]?.message?.content;
  if (content && typeof content === 'string') {
    try {
      return JSON.parse(content) as CallSummary;
    } catch {
      // Fallback if parsing fails
    }
  }

  // Default fallback summary
  return {
    summary: "Call completed. No detailed summary available.",
    keyPoints: ["Call duration: " + (context?.duration || 0) + " seconds"],
    sentiment: "neutral",
    actionItems: [],
    category: "other"
  };
}

/**
 * Format call summary for SMS delivery
 */
export function formatSummaryForSms(
  summary: CallSummary,
  context: {
    fromNumber: string;
    toNumber: string;
    direction: "inbound" | "outbound";
    duration: number;
  }
): string {
  const durationMinutes = Math.ceil(context.duration / 60);
  const directionText = context.direction === "inbound" ? "from" : "to";
  const otherNumber = context.direction === "inbound" ? context.fromNumber : context.toNumber;
  
  // Format: Brief header + summary + action items if any
  let smsText = `📞 Call Summary\n`;
  smsText += `${durationMinutes} min ${context.direction} call ${directionText} ${otherNumber}\n\n`;
  smsText += summary.summary;
  
  if (summary.actionItems.length > 0) {
    smsText += `\n\n📋 Action Items:\n`;
    smsText += summary.actionItems.slice(0, 2).map(item => `• ${item}`).join("\n");
  }
  
  // Ensure SMS doesn't exceed typical limits (keep under 480 chars for 3 segments max)
  if (smsText.length > 480) {
    smsText = smsText.substring(0, 477) + "...";
  }
  
  return smsText;
}

/**
 * Send call summary SMS to the appropriate recipient
 */
export async function sendCallSummarySms(input: CallSummaryInput): Promise<{
  success: boolean;
  messageSid?: string;
  error?: string;
}> {
  try {
    // Get customer settings to check if SMS summaries are enabled
    const customer = await db.getCustomerById(input.customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    // Check if SMS summaries are enabled (default to true if not set)
    const smsSummaryEnabled = customer.smsSummaryEnabled !== false;
    
    if (!smsSummaryEnabled) {
      return { success: false, error: "SMS summaries disabled for this customer" };
    }

    // Get the phone number to send from (the customer's number)
    const phoneNumber = await db.getPhoneNumberByNumber(
      input.direction === "inbound" ? input.toNumber : input.fromNumber
    );
    
    if (!phoneNumber) {
      return { success: false, error: "No phone number found for sending SMS" };
    }

    // Determine recipient - for inbound calls, send to the endpoint user
    // For outbound calls, send to the person who made the call
    let recipientNumber: string;
    let senderNumber: string;
    
    if (input.direction === "inbound") {
      // For inbound calls, send summary to the business number owner
      // Use the customer's notification phone if set, otherwise use the from number
      recipientNumber = customer.notificationPhone || input.fromNumber;
      senderNumber = input.toNumber;
    } else {
      // For outbound calls, send summary to the caller
      recipientNumber = input.fromNumber;
      senderNumber = input.toNumber;
    }

    // Generate summary if transcription is available
    let summary: CallSummary;
    if (input.transcription) {
      summary = await generateCallSummary(input.transcription, {
        fromNumber: input.fromNumber,
        toNumber: input.toNumber,
        duration: input.duration,
        direction: input.direction,
      });
    } else {
      // Basic summary without transcription
      summary = {
        summary: `Call ${input.direction === "inbound" ? "received" : "made"} - ${Math.ceil(input.duration / 60)} minutes. No transcription available.`,
        keyPoints: [],
        sentiment: "neutral",
        actionItems: [],
        category: "other"
      };
    }

    // Format the SMS
    const smsText = formatSummaryForSms(summary, {
      fromNumber: input.fromNumber,
      toNumber: input.toNumber,
      direction: input.direction,
      duration: input.duration,
    });

    // Send the SMS via Telnyx
    if (!telnyxApi.isConfigured()) {
      return { success: false, error: "Telnyx not configured for SMS" };
    }

    const telnyxResult = await telnyxApi.sendSms({
      from: senderNumber,
      to: recipientNumber,
      body: smsText,
    });
    const result = { sid: telnyxResult.data?.id };

    // Store the summary in the database
    // Find the recording by callSid and update it
    const recordings = await db.getCallRecordingsByCustomer(input.customerId);
    const recording = recordings.find(r => r.callSid === input.callSid);
    if (recording) {
      await db.updateCallRecording(recording.id, {
        summary: `${summary.summary}\n\nSentiment: ${summary.sentiment}\nCategory: ${summary.category}${summary.actionItems.length > 0 ? '\nAction Items: ' + summary.actionItems.join(', ') : ''}`,
      });
    }

    return {
      success: true,
      messageSid: result.sid,
    };
  } catch (error) {
    console.error("[Call Summary] Error sending SMS:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Process a completed call and send summary if applicable
 */
export async function processCallCompletion(input: {
  callSid: string;
  fromNumber: string;
  toNumber: string;
  direction: "inbound" | "outbound";
  duration: number;
  transcription?: string | null;
}): Promise<void> {
  try {
    // Find the customer by phone number
    const phoneNumber = await db.getPhoneNumberByNumber(
      input.direction === "inbound" ? input.toNumber : input.fromNumber
    );
    
    if (!phoneNumber) {
      console.log("[Call Summary] No customer found for phone number");
      return;
    }

    // Only send summary for calls longer than 30 seconds
    if (input.duration < 30) {
      console.log("[Call Summary] Call too short for summary");
      return;
    }

    // Send the summary SMS
    const result = await sendCallSummarySms({
      ...input,
      customerId: phoneNumber.customerId,
    });

    if (result.success) {
      console.log(`[Call Summary] SMS sent successfully: ${result.messageSid}`);
    } else {
      console.log(`[Call Summary] SMS not sent: ${result.error}`);
    }
  } catch (error) {
    console.error("[Call Summary] Error processing call completion:", error);
  }
}
