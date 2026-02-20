/**
 * Telnyx & Retell AI Webhook Handlers
 * Handles incoming call events and generates TeXML responses
 */

import { Router, Request, Response } from "express";
import * as db from "./db";
import { generateTeXmlDial, generateTeXmlRingGroup, generateTeXmlVoicemail, getSipDomain } from "./telnyx";
import * as retell from "./retell";
import * as aiIvr from "./ai-ivr";
import * as callSummary from "./call-summary";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

export const webhookRouter = Router();

// Note: Body parsing is handled by express.urlencoded() and express.json() in index.ts

// Helper to parse JSON fields that may come as string or already parsed
function parseJsonArray(value: unknown): number[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Extract call data from webhook payload.
 * Telnyx TeXML webhooks use TwiML-compatible field names (CallSid, From, To, etc.)
 * Telnyx Call Control webhooks use a different JSON structure.
 * This handler supports both formats.
 */
function extractCallData(body: Record<string, unknown>): {
  callSid: string;
  from: string;
  to: string;
  direction: string;
  callStatus: string;
} {
  // TeXML format (TwiML-compatible) — comes as form-urlencoded
  if (body.CallSid) {
    return {
      callSid: String(body.CallSid),
      from: String(body.From || ""),
      to: String(body.To || ""),
      direction: String(body.Direction || "inbound"),
      callStatus: String(body.CallStatus || ""),
    };
  }

  // Telnyx Call Control webhook format (JSON)
  const data = (body.data as Record<string, unknown>) || body;
  const payload = (data.payload as Record<string, unknown>) || {};
  return {
    callSid: String(payload.call_control_id || payload.call_session_id || ""),
    from: String(payload.from || ""),
    to: String(payload.to || ""),
    direction: String(payload.direction || "incoming"),
    callStatus: String(data.event_type || payload.state || ""),
  };
}

/**
 * Main voice webhook - handles incoming calls
 * POST /api/webhooks/voice
 */
webhookRouter.post("/voice", async (req: Request, res: Response) => {
  try {
    const { callSid, from, to, direction, callStatus } = extractCallData(req.body);

    console.log(`[Webhook] Incoming call: ${callSid} from ${from} to ${to}`);

    // Find the phone number in our database
    const phoneNumber = await db.getPhoneNumberByNumber(to);

    if (!phoneNumber) {
      console.log(`[Webhook] Phone number ${to} not found in database`);
      res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This number is not configured. Goodbye.</Say>
  <Hangup/>
</Response>`);
      return;
    }

    // Get the customer's call routes
    const routes = await db.getCallRoutesByCustomer(phoneNumber.customerId);
    const activeRoutes = routes.filter(r => r.status === 'active').sort((a, b) => (a.priority || 0) - (b.priority || 0));

    // Find matching route
    let matchedRoute = null;
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const currentDay = now.getDay();

    for (const route of activeRoutes) {
      // Check match type
      if (route.matchType === 'all') {
        matchedRoute = route;
        break;
      }

      if (route.matchType === 'caller_id' && route.matchPattern) {
        const pattern = route.matchPattern.replace(/\*/g, '.*');
        if (new RegExp(`^${pattern}$`).test(from)) {
          matchedRoute = route;
          break;
        }
      }

      if (route.matchType === 'time_based') {
        const daysOfWeek = route.daysOfWeek as number[] | null;
        const inTimeRange = (!route.timeStart || currentTime >= route.timeStart) &&
                          (!route.timeEnd || currentTime <= route.timeEnd);
        const inDayRange = !daysOfWeek || daysOfWeek.includes(currentDay);

        if (inTimeRange && inDayRange) {
          matchedRoute = route;
          break;
        }
      }

      if (route.matchType === 'did' && route.matchPattern === to) {
        matchedRoute = route;
        break;
      }
    }

    // Generate TeXML based on route destination
    let texml: string;
    const sipDomain = getSipDomain();

    if (!matchedRoute) {
      // Default: try to route to assigned endpoint or ring group
      if (phoneNumber.assignedToEndpointId) {
        const endpoint = await db.getSipEndpointById(phoneNumber.assignedToEndpointId);
        if (endpoint) {
          const sipAddress = `sip:${endpoint.username}@${sipDomain}`;
          texml = generateTeXmlDial(sipAddress, { timeout: 30 });
        } else {
          texml = generateTeXmlVoicemail();
        }
      } else if (phoneNumber.assignedToRingGroupId) {
        const ringGroup = await db.getRingGroupById(phoneNumber.assignedToRingGroupId);
        if (ringGroup) {
          const memberIds = parseJsonArray(ringGroup.memberEndpointIds);
          const endpoints = await Promise.all(memberIds.map(id => db.getSipEndpointById(id)));
          const sipAddresses = endpoints
            .filter(e => e && e.status === 'active')
            .map(e => `sip:${e!.username}@${sipDomain}`);

          if (sipAddresses.length > 0) {
            texml = generateTeXmlRingGroup(sipAddresses, {
              strategy: ringGroup.strategy as 'simultaneous' | 'sequential',
              timeout: ringGroup.ringTimeout || 30,
            });
          } else {
            texml = generateTeXmlVoicemail();
          }
        } else {
          texml = generateTeXmlVoicemail();
        }
      } else {
        texml = generateTeXmlVoicemail();
      }
    } else {
      // Route based on destination type
      switch (matchedRoute.destinationType) {
        case 'endpoint':
          if (matchedRoute.destinationId) {
            const endpoint = await db.getSipEndpointById(matchedRoute.destinationId);
            if (endpoint) {
              const sipAddress = `sip:${endpoint.username}@${sipDomain}`;
              texml = generateTeXmlDial(sipAddress, { timeout: 30 });
            } else {
              texml = generateTeXmlVoicemail();
            }
          } else {
            texml = generateTeXmlVoicemail();
          }
          break;

        case 'ring_group':
          if (matchedRoute.destinationId) {
            const ringGroup = await db.getRingGroupById(matchedRoute.destinationId);
            if (ringGroup) {
              const memberIds = parseJsonArray(ringGroup.memberEndpointIds);
              const endpoints = await Promise.all(memberIds.map(id => db.getSipEndpointById(id)));
              const sipAddresses = endpoints
                .filter(e => e && e.status === 'active')
                .map(e => `sip:${e!.username}@${sipDomain}`);

              if (sipAddresses.length > 0) {
                texml = generateTeXmlRingGroup(sipAddresses, {
                  strategy: ringGroup.strategy as 'simultaneous' | 'sequential',
                  timeout: ringGroup.ringTimeout || 30,
                });
              } else {
                texml = generateTeXmlVoicemail();
              }
            } else {
              texml = generateTeXmlVoicemail();
            }
          } else {
            texml = generateTeXmlVoicemail();
          }
          break;

        case 'external':
          if (matchedRoute.destinationExternal) {
            texml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30">
    <Number>${matchedRoute.destinationExternal}</Number>
  </Dial>
</Response>`;
          } else {
            texml = generateTeXmlVoicemail();
          }
          break;

        case 'voicemail':
          texml = generateTeXmlVoicemail();
          break;

        case 'ai_agent':
          // AI-powered IVR with speech recognition
          const webhookBaseUrl = `${req.protocol}://${req.get('host')}`;
          texml = aiIvr.generateAiIvrTeXml({
            customerId: phoneNumber.customerId,
            greeting: "Hello, thank you for calling. How may I direct your call? You can say things like 'sales', 'support', or the name of the person you're trying to reach.",
            gatherTimeout: 5,
            webhookUrl: webhookBaseUrl,
          });
          break;

        default:
          texml = generateTeXmlVoicemail();
      }
    }

    // Log the call
    console.log(`[Webhook] Responding with TeXML for call ${callSid}`);

    res.type("application/xml").send(texml);
  } catch (error) {
    console.error("[Webhook] Error handling voice webhook:", error);
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Please try again later.</Say>
  <Hangup/>
</Response>`);
  }
});

/**
 * Call status callback - tracks call completion
 * POST /api/webhooks/status
 */
webhookRouter.post("/status", async (req: Request, res: Response) => {
  try {
    const { callSid, from, to, direction, callStatus } = extractCallData(req.body);
    const callDuration = req.body.CallDuration || req.body.Duration || "0";

    console.log(`[Webhook] Call status update: ${callSid} - ${callStatus}`);

    // Normalize direction
    const normalizedDirection = direction === 'incoming' ? 'inbound' : direction;
    // Find the customer by phone number
    const phoneNumber = await db.getPhoneNumberByNumber(normalizedDirection === 'inbound' ? to : from);

    if (phoneNumber && (callStatus === 'completed' || callStatus === 'call.hangup')) {
      // Update usage stats
      await db.incrementUsageStats(phoneNumber.customerId, {
        totalCalls: 1,
        inboundCalls: normalizedDirection === 'inbound' ? 1 : 0,
        outboundCalls: normalizedDirection === 'outbound' ? 1 : 0,
        totalMinutes: Math.ceil(parseInt(String(callDuration) || '0') / 60),
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Webhook] Error handling status webhook:", error);
    res.status(500).send('Error');
  }
});

/**
 * Recording callback - handles completed recordings
 * POST /api/webhooks/recording
 */
webhookRouter.post("/recording", async (req: Request, res: Response) => {
  try {
    // Support both TeXML and Call Control formats
    const callSid = req.body.CallSid || req.body.data?.payload?.call_control_id || "";
    const recordingSid = req.body.RecordingSid || req.body.data?.payload?.recording_id || "";
    const recordingUrl = req.body.RecordingUrl || req.body.data?.payload?.recording_urls?.mp3 || "";
    const recordingDuration = req.body.RecordingDuration || req.body.data?.payload?.duration_millis ? String(Math.ceil((req.body.data?.payload?.duration_millis || 0) / 1000)) : "0";
    const from = req.body.From || req.body.data?.payload?.from || "";
    const to = req.body.To || req.body.data?.payload?.to || "";
    const direction = req.body.Direction || req.body.data?.payload?.direction || "inbound";
    const transcriptionText = req.body.TranscriptionText || "";

    console.log(`[Webhook] Recording ready: ${recordingSid} for call ${callSid}`);

    // Normalize direction
    const normalizedDirection = direction === 'incoming' ? 'inbound' : (direction === 'outgoing' ? 'outbound' : direction);

    // Find the customer by phone number
    const phoneNumber = await db.getPhoneNumberByNumber(normalizedDirection === 'inbound' ? to : from);

    if (phoneNumber) {
      // Download recording and upload to S3
      const recordingKey = `recordings/${phoneNumber.customerId}/${callSid}-${nanoid(8)}.wav`;

      // Store recording metadata
      await db.createCallRecording({
        customerId: phoneNumber.customerId,
        callSid: callSid,
        direction: normalizedDirection === 'inbound' ? 'inbound' : 'outbound',
        fromNumber: from,
        toNumber: to,
        duration: parseInt(recordingDuration || '0'),
        recordingUrl: recordingUrl,
        recordingKey,
        transcription: transcriptionText || null,
        status: 'ready',
        retentionDays: 90,
      });

      // Create notification
      await db.createNotification({
        customerId: phoneNumber.customerId,
        type: 'recording_ready',
        title: 'New Call Recording',
        message: `A new ${normalizedDirection} call recording is available (${Math.ceil(parseInt(recordingDuration || '0') / 60)} minutes)`,
        metadata: { callSid, recordingSid },
      });

      // Send SMS summary if call is long enough
      const duration = parseInt(recordingDuration || '0');
      if (duration >= 30) {
        // Process asynchronously to not block the webhook response
        callSummary.sendCallSummarySms({
          callSid,
          fromNumber: from,
          toNumber: to,
          direction: normalizedDirection === 'inbound' ? 'inbound' : 'outbound',
          duration,
          transcription: transcriptionText || null,
          customerId: phoneNumber.customerId,
        }).then(result => {
          if (result.success) {
            console.log(`[Webhook] SMS summary sent for call ${callSid}: ${result.messageId}`);
          } else {
            console.log(`[Webhook] SMS summary not sent for call ${callSid}: ${result.error}`);
          }
        }).catch(err => {
          console.error(`[Webhook] Error sending SMS summary for call ${callSid}:`, err);
        });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Webhook] Error handling recording webhook:", error);
    res.status(500).send('Error');
  }
});

/**
 * Voicemail callback - handles voicemail recordings
 * POST /api/webhooks/voicemail
 */
webhookRouter.post("/voicemail", async (req: Request, res: Response) => {
  try {
    const callSid = req.body.CallSid || "";
    const recordingSid = req.body.RecordingSid || "";
    const recordingUrl = req.body.RecordingUrl || "";
    const recordingDuration = req.body.RecordingDuration || "0";
    const from = req.body.From || "";
    const to = req.body.To || "";
    const transcriptionText = req.body.TranscriptionText || "";

    console.log(`[Webhook] Voicemail received: ${recordingSid} for call ${callSid}`);

    // Find the customer by phone number
    const phoneNumber = await db.getPhoneNumberByNumber(to);

    if (phoneNumber) {
      // Create notification for voicemail
      await db.createNotification({
        customerId: phoneNumber.customerId,
        type: 'voicemail',
        title: 'New Voicemail',
        message: `You have a new voicemail from ${from} (${Math.ceil(parseInt(recordingDuration || '0') / 60)} minutes)`,
        metadata: {
          callSid,
          recordingSid,
          from,
          transcription: transcriptionText,
        },
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Webhook] Error handling voicemail webhook:", error);
    res.status(500).send('Error');
  }
});

/**
 * Missed call callback
 * POST /api/webhooks/missed
 */
webhookRouter.post("/missed", async (req: Request, res: Response) => {
  try {
    const callSid = req.body.CallSid || req.body.data?.payload?.call_control_id || "";
    const from = req.body.From || req.body.data?.payload?.from || "";
    const to = req.body.To || req.body.data?.payload?.to || "";

    console.log(`[Webhook] Missed call: ${callSid} from ${from}`);

    // Find the customer by phone number
    const phoneNumber = await db.getPhoneNumberByNumber(to);

    if (phoneNumber) {
      // Create notification for missed call
      await db.createNotification({
        customerId: phoneNumber.customerId,
        type: 'missed_call',
        title: 'Missed Call',
        message: `You missed a call from ${from}`,
        metadata: { callSid, from },
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Webhook] Error handling missed call webhook:", error);
    res.status(500).send('Error');
  }
});

/**
 * AI IVR Gather callback - processes speech input
 * POST /api/webhooks/ai-gather
 */
webhookRouter.post("/ai-gather", async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.query.customerId as string);
    const attempt = parseInt(req.query.attempt as string) || 1;
    const {
      SpeechResult,
      Confidence,
      CallSid,
      From,
    } = req.body;

    console.log(`[AI IVR] Speech received for customer ${customerId}: "${SpeechResult}" (confidence: ${Confidence})`);

    if (!SpeechResult) {
      // No speech detected, retry
      const webhookBaseUrl = `${req.protocol}://${req.get('host')}`;
      const texml = aiIvr.generateRetryTeXml(
        "I didn't catch that. Could you please tell me which department you'd like to reach?",
        webhookBaseUrl,
        customerId,
        attempt
      );
      res.type("application/xml").send(texml);
      return;
    }

    // Get available departments for this customer
    const availableDepartments = await aiIvr.getAvailableDepartments(customerId);

    // Analyze the speech with LLM
    const intent = await aiIvr.analyzeTransferIntent(SpeechResult, availableDepartments);

    console.log(`[AI IVR] Intent analysis:`, intent);

    const webhookBaseUrl = `${req.protocol}://${req.get('host')}`;
    const sipDomain = getSipDomain();

    if (intent.shouldTransfer && intent.department) {
      // Try to find matching ring group first
      const ringGroup = await aiIvr.findDepartmentRingGroup(customerId, intent.department);

      if (ringGroup) {
        // Get ring group members
        const group = await db.getRingGroupById(ringGroup.ringGroupId);
        if (group) {
          const memberIds = parseJsonArray(group.memberEndpointIds);
          const endpoints = await Promise.all(memberIds.map(id => db.getSipEndpointById(id)));
          const sipAddresses = endpoints
            .filter(e => e && e.status === 'active')
            .map(e => `sip:${e!.username}@${sipDomain}`);

          if (sipAddresses.length > 0) {
            const texml = aiIvr.generateTransferToRingGroupTeXml(sipAddresses, {
              strategy: group.strategy as 'simultaneous' | 'sequential',
              timeout: group.ringTimeout || 30,
              announcement: `Transferring you to ${ringGroup.name} now.`,
              fallbackUrl: `${webhookBaseUrl}/api/webhooks/ai-fallback?customerId=${customerId}`,
              callerId: From,
            });
            res.type("application/xml").send(texml);
            return;
          }
        }
      }

      // Try to find matching endpoint
      const endpoint = await aiIvr.findDepartmentEndpoint(customerId, intent.department);

      if (endpoint) {
        const sipAddress = `sip:${endpoint.username}@${sipDomain}`;
        const texml = aiIvr.generateTransferToEndpointTeXml(sipAddress, {
          timeout: 30,
          announcement: `Transferring you to ${endpoint.displayName || endpoint.username} now.`,
          fallbackUrl: `${webhookBaseUrl}/api/webhooks/ai-fallback?customerId=${customerId}`,
          callerId: From,
        });
        res.type("application/xml").send(texml);
        return;
      }

      // Department mentioned but no match found
      const texml = aiIvr.generateRetryTeXml(
        `I couldn't find ${intent.department}. Our available departments are: ${availableDepartments.join(', ')}. Which would you like?`,
        webhookBaseUrl,
        customerId,
        attempt
      );
      res.type("application/xml").send(texml);
      return;
    }

    // No clear transfer intent, ask for clarification
    const texml = aiIvr.generateRetryTeXml(
      intent.response,
      webhookBaseUrl,
      customerId,
      attempt
    );
    res.type("application/xml").send(texml);

  } catch (error) {
    console.error("[AI IVR] Error processing speech:", error);
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I'm sorry, there was an error processing your request. Please hold while I transfer you.</Say>
  <Redirect>/api/webhooks/ai-fallback?customerId=${req.query.customerId}</Redirect>
</Response>`);
  }
});

/**
 * AI IVR Fallback - transfers to default destination when AI can't help
 * POST /api/webhooks/ai-fallback
 */
webhookRouter.post("/ai-fallback", async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.query.customerId as string);
    const from = req.body.From || "";

    console.log(`[AI IVR] Fallback triggered for customer ${customerId}`);

    const sipDomain = getSipDomain();

    // Try to find a default ring group (reception, main, etc.)
    const ringGroups = await db.getRingGroupsByCustomer(customerId);
    const defaultGroup = ringGroups.find(g =>
      g.status === 'active' &&
      (g.name.toLowerCase().includes('reception') ||
       g.name.toLowerCase().includes('main') ||
       g.name.toLowerCase().includes('default'))
    ) || ringGroups.find(g => g.status === 'active');

    if (defaultGroup) {
      const memberIds = parseJsonArray(defaultGroup.memberEndpointIds);
      const endpoints = await Promise.all(memberIds.map(id => db.getSipEndpointById(id)));
      const sipAddresses = endpoints
        .filter(e => e && e.status === 'active')
        .map(e => `sip:${e!.username}@${sipDomain}`);

      if (sipAddresses.length > 0) {
        const texml = aiIvr.generateTransferToRingGroupTeXml(sipAddresses, {
          strategy: defaultGroup.strategy as 'simultaneous' | 'sequential',
          timeout: defaultGroup.ringTimeout || 30,
          announcement: "Please hold while I connect you.",
          callerId: from,
        });
        res.type("application/xml").send(texml);
        return;
      }
    }

    // No ring groups, try first active endpoint
    const endpoints = await db.getSipEndpointsByCustomer(customerId);
    const activeEndpoint = endpoints.find(e => e.status === 'active');

    if (activeEndpoint) {
      const sipAddress = `sip:${activeEndpoint.username}@${sipDomain}`;
      const texml = aiIvr.generateTransferToEndpointTeXml(sipAddress, {
        timeout: 30,
        announcement: "Please hold while I connect you.",
        callerId: from,
      });
      res.type("application/xml").send(texml);
      return;
    }

    // Nothing available, go to voicemail
    res.type("application/xml").send(generateTeXmlVoicemail());

  } catch (error) {
    console.error("[AI IVR] Error in fallback:", error);
    res.type("application/xml").send(generateTeXmlVoicemail());
  }
});

/**
 * AI IVR Transfer status callback - handles transfer completion/failure
 * POST /api/webhooks/ai-transfer-status
 */
webhookRouter.post("/ai-transfer-status", async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.query.customerId as string);
    const { DialCallStatus, CallSid } = req.body;

    console.log(`[AI IVR] Transfer status for ${CallSid}: ${DialCallStatus}`);

    if (DialCallStatus === 'no-answer' || DialCallStatus === 'busy' || DialCallStatus === 'failed') {
      // Transfer failed, offer voicemail
      res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>I'm sorry, no one is available to take your call right now. Please leave a message after the beep.</Say>
  <Record maxLength="120" action="/api/webhooks/voicemail" transcribe="true" />
  <Say>I didn't receive a recording. Goodbye.</Say>
  <Hangup/>
</Response>`);
      return;
    }

    // Transfer completed successfully
    res.status(200).send('OK');

  } catch (error) {
    console.error("[AI IVR] Error in transfer status:", error);
    res.type("application/xml").send(generateTeXmlVoicemail());
  }
});

// ============================================================
// Retell AI Webhooks
// ============================================================

/**
 * Retell AI webhook - handles call lifecycle events from Retell
 * POST /api/webhooks/retell
 *
 * Events: call_started, call_ended, call_analyzed
 */
webhookRouter.post("/retell", async (req: Request, res: Response) => {
  try {
    // Verify webhook signature if API key is available
    const signature = req.headers["x-retell-signature"] as string;
    if (signature) {
      const apiKey = await db.getSystemSetting("retell_api_key") || process.env.RETELL_API_KEY || "";
      if (apiKey) {
        const isValid = retell.verifyWebhook(
          JSON.stringify(req.body),
          apiKey,
          signature
        );
        if (!isValid) {
          console.error("[Retell Webhook] Invalid signature");
          res.status(401).send("Invalid signature");
          return;
        }
      }
    }

    const { event, call } = req.body;

    console.log(`[Retell Webhook] Event: ${event}, Call ID: ${call?.call_id}`);

    switch (event) {
      case "call_started": {
        console.log(`[Retell Webhook] Call started: ${call.call_id} from ${call.from_number} to ${call.to_number}`);
        break;
      }

      case "call_ended": {
        console.log(`[Retell Webhook] Call ended: ${call.call_id}, duration: ${call.end_timestamp - call.start_timestamp}ms`);

        // Find customer by phone number
        const toNum = call.direction === "inbound" ? call.to_number : call.from_number;
        const phoneNumber = await db.getPhoneNumberByNumber(toNum);

        if (phoneNumber) {
          const durationMs = (call.end_timestamp || 0) - (call.start_timestamp || 0);
          const durationSec = Math.ceil(durationMs / 1000);

          // Update usage stats
          await db.incrementUsageStats(phoneNumber.customerId, {
            totalCalls: 1,
            inboundCalls: call.direction === "inbound" ? 1 : 0,
            outboundCalls: call.direction === "outbound" ? 1 : 0,
            totalMinutes: Math.ceil(durationSec / 60),
          });

          // Create notification for missed/short calls
          if (call.disconnection_reason === "no_answer" || call.disconnection_reason === "busy") {
            await db.createNotification({
              customerId: phoneNumber.customerId,
              type: "missed_call",
              title: "Missed AI Call",
              message: `AI agent couldn't complete call from ${call.from_number}. Reason: ${call.disconnection_reason}`,
              metadata: { callId: call.call_id, agentId: call.agent_id },
            });
          }
        }
        break;
      }

      case "call_analyzed": {
        console.log(`[Retell Webhook] Call analyzed: ${call.call_id}`);

        const toNumAnalyzed = call.direction === "inbound" ? call.to_number : call.from_number;
        const phoneNumAnalyzed = await db.getPhoneNumberByNumber(toNumAnalyzed);

        if (phoneNumAnalyzed) {
          // Extract transcript text
          const transcriptText = call.transcript || "";
          const durationMs = (call.end_timestamp || 0) - (call.start_timestamp || 0);
          const durationSec = Math.ceil(durationMs / 1000);

          // Store as a call recording with transcript
          await db.createCallRecording({
            customerId: phoneNumAnalyzed.customerId,
            callSid: call.call_id,
            direction: call.direction === "inbound" ? "inbound" : "outbound",
            fromNumber: call.from_number || "",
            toNumber: call.to_number || "",
            duration: durationSec,
            recordingUrl: call.recording_url || null,
            transcription: transcriptText || null,
            summary: call.call_analysis?.call_summary || null,
            status: "ready",
            retentionDays: 90,
          });

          // Create notification
          await db.createNotification({
            customerId: phoneNumAnalyzed.customerId,
            type: "recording_ready",
            title: "AI Call Completed",
            message: `AI agent handled ${call.direction} call (${Math.ceil(durationSec / 60)} min). ${call.call_analysis?.call_summary ? "Summary: " + call.call_analysis.call_summary.substring(0, 100) : ""}`,
            metadata: {
              callId: call.call_id,
              agentId: call.agent_id,
              sentiment: call.call_analysis?.user_sentiment,
            },
          });
        }
        break;
      }

      default:
        console.log(`[Retell Webhook] Unhandled event: ${event}`);
    }

    // Acknowledge receipt
    res.status(204).send();
  } catch (error) {
    console.error("[Retell Webhook] Error handling webhook:", error);
    res.status(500).send("Error");
  }
});

export default webhookRouter;
