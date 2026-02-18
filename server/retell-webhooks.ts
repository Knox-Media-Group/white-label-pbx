/**
 * Retell AI Webhook Handlers
 * Handles call status events, transfer requests, and message logging from Retell AI agents
 */

import { Router, Request, Response } from "express";
import * as db from "./db";
import * as telnyx from "./telnyx";

export const retellWebhookRouter = Router();

/**
 * Call status webhook - receives post-call data from Retell AI
 * POST /api/webhooks/retell/call-status
 *
 * Retell sends this after every call with analysis data
 */
retellWebhookRouter.post("/call-status", async (req: Request, res: Response) => {
  try {
    const {
      event,
      call,
    } = req.body;

    console.log(`[Retell Webhook] Event: ${event}`);

    if (!call) {
      res.status(200).send('OK');
      return;
    }

    const {
      call_id,
      call_type,
      agent_id,
      call_status,
      start_timestamp,
      end_timestamp,
      from_number,
      to_number,
      direction,
      duration_ms,
      recording_url,
      transcript,
      transcript_object,
      call_analysis,
      metadata,
    } = call;

    console.log(`[Retell Webhook] Call ${call_id}: status=${call_status}, duration=${duration_ms}ms`);

    const customerId = metadata?.customerId;

    if (event === "call_ended" || event === "call_analyzed") {
      // Find the customer
      let customerIdNum = typeof customerId === 'number' ? customerId : parseInt(customerId || '0');

      if (!customerIdNum && to_number) {
        const phoneNumber = await db.getPhoneNumberByNumber(to_number);
        if (phoneNumber) {
          customerIdNum = phoneNumber.customerId;
        }
      }

      if (customerIdNum) {
        // Update usage stats
        const durationSec = Math.ceil((duration_ms || 0) / 1000);
        await db.incrementUsageStats(customerIdNum, {
          totalCalls: 1,
          inboundCalls: direction === 'inbound' ? 1 : 0,
          outboundCalls: direction === 'outbound' ? 1 : 0,
          totalMinutes: Math.ceil(durationSec / 60),
        });

        // Store recording if available
        if (recording_url && durationSec > 5) {
          await db.createCallRecording({
            customerId: customerIdNum,
            callSid: call_id,
            direction: direction === 'inbound' ? 'inbound' : 'outbound',
            fromNumber: from_number,
            toNumber: to_number,
            duration: durationSec,
            recordingUrl: recording_url,
            recordingKey: `retell-recordings/${customerIdNum}/${call_id}`,
            transcription: transcript || null,
            summary: call_analysis ? formatCallAnalysis(call_analysis) : null,
            status: 'ready',
            retentionDays: 90,
          });

          await db.createNotification({
            customerId: customerIdNum,
            type: 'recording_ready',
            title: 'AI Call Recording',
            message: `Retell AI handled a ${direction} call (${Math.ceil(durationSec / 60)} min). ${call_analysis?.call_summary || ''}`.trim(),
            metadata: {
              callId: call_id,
              agentId: agent_id,
              category: call_analysis?.call_category,
              sentiment: call_analysis?.caller_sentiment,
              actionRequired: call_analysis?.action_required,
            },
          });
        }

        // Create missed call notification if call was too short (likely no answer)
        if (durationSec < 5 && direction === 'inbound') {
          await db.createNotification({
            customerId: customerIdNum,
            type: 'missed_call',
            title: 'Brief Call',
            message: `Very short ${direction} call from ${from_number} (${durationSec}s) - caller may have hung up quickly`,
            metadata: { callId: call_id, from: from_number },
          });
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Retell Webhook] Error handling call status:", error);
    res.status(200).send('OK'); // Always return 200 to prevent retries
  }
});

/**
 * Inbound config webhook - provides dynamic variables for inbound calls
 * POST /api/webhooks/retell/inbound-config
 *
 * Called by Retell before the AI agent starts speaking.
 * Returns dynamic variables and optional agent override.
 */
retellWebhookRouter.post("/inbound-config", async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.query.customerId as string);
    const { from_number, to_number } = req.body;

    console.log(`[Retell Webhook] Inbound config request for customer ${customerId}: ${from_number} -> ${to_number}`);

    if (!customerId) {
      res.json({});
      return;
    }

    const customer = await db.getCustomerById(customerId);
    if (!customer) {
      res.json({});
      return;
    }

    // Get available departments/endpoints for this customer
    const ringGroups = await db.getRingGroupsByCustomer(customerId);
    const endpoints = await db.getSipEndpointsByCustomer(customerId);

    const departments = ringGroups
      .filter(g => g.status === 'active')
      .map(g => g.name)
      .concat(
        endpoints
          .filter(e => e.status === 'active' && e.displayName)
          .map(e => e.displayName!)
      );

    // Return dynamic variables that get injected into the agent's prompt
    res.json({
      retell_llm_dynamic_variables: {
        company_name: customer.companyName || customer.name,
        caller_number: from_number,
        called_number: to_number,
        available_departments: departments.join(", ") || "general support",
        business_hours: "Monday to Friday, 9 AM to 5 PM",
      },
    });
  } catch (error) {
    console.error("[Retell Webhook] Error handling inbound config:", error);
    res.json({});
  }
});

/**
 * Message logging webhook - called by Retell custom tool when taking a message
 * POST /api/webhooks/retell/message
 */
retellWebhookRouter.post("/message", async (req: Request, res: Response) => {
  try {
    const { args, call } = req.body;

    const callerName = args?.caller_name || "Unknown";
    const callbackNumber = args?.callback_number || call?.from_number || "Unknown";
    const message = args?.message || "No message provided";
    const department = args?.department || "General";

    console.log(`[Retell Webhook] Message from ${callerName}: ${message} (for ${department})`);

    // Find the customer
    const customerId = call?.metadata?.customerId;
    let customerIdNum = typeof customerId === 'number' ? customerId : parseInt(customerId || '0');

    if (!customerIdNum && call?.to_number) {
      const phoneNumber = await db.getPhoneNumberByNumber(call.to_number);
      if (phoneNumber) {
        customerIdNum = phoneNumber.customerId;
      }
    }

    if (customerIdNum) {
      await db.createNotification({
        customerId: customerIdNum,
        type: 'voicemail',
        title: `Message from ${callerName}`,
        message: `${callerName} (${callbackNumber}) left a message for ${department}: ${message}`,
        metadata: {
          callerName,
          callbackNumber,
          message,
          department,
          callId: call?.call_id,
        },
      });

      // Send SMS notification if configured
      const customer = await db.getCustomerById(customerIdNum);
      if (customer?.notificationPhone && customer.smsSummaryEnabled) {
        try {
          await telnyx.sendSms({
            from: call?.to_number || "",
            to: customer.notificationPhone,
            body: `New message from ${callerName} (${callbackNumber}) for ${department}: ${message}`,
          });
        } catch (smsError) {
          console.error("[Retell Webhook] Failed to send SMS notification:", smsError);
        }
      }
    }

    // Return success to Retell
    res.json({
      result: "Message has been logged successfully. The team will review it shortly.",
    });
  } catch (error) {
    console.error("[Retell Webhook] Error logging message:", error);
    res.json({
      result: "I've noted your message. Someone will get back to you.",
    });
  }
});

/**
 * Transfer status webhook - called after Retell completes a call transfer
 * POST /api/webhooks/retell/transfer-status
 */
retellWebhookRouter.post("/transfer-status", async (req: Request, res: Response) => {
  try {
    const { call_id, transfer_to, transfer_status } = req.body;

    console.log(`[Retell Webhook] Transfer status: ${call_id} -> ${transfer_to}: ${transfer_status}`);

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Retell Webhook] Error handling transfer status:", error);
    res.status(200).send('OK');
  }
});

// Helper to format call analysis into a readable summary
function formatCallAnalysis(analysis: Record<string, unknown>): string {
  const parts: string[] = [];

  if (analysis.call_summary) {
    parts.push(analysis.call_summary as string);
  }

  if (analysis.call_category) {
    parts.push(`Category: ${analysis.call_category}`);
  }

  if (analysis.caller_sentiment) {
    parts.push(`Sentiment: ${analysis.caller_sentiment}`);
  }

  if (analysis.transfer_department) {
    parts.push(`Transferred to: ${analysis.transfer_department}`);
  }

  if (analysis.action_required) {
    parts.push("Action required: Yes");
  }

  return parts.join("\n");
}

export default retellWebhookRouter;
