/**
 * Telnyx Webhook Handlers
 * Handles incoming call events via Telnyx Call Control and TeXML
 */

import { Router, Request, Response } from "express";
import * as db from "./db";
import * as telnyx from "./telnyx";
import * as retell from "./retell";
import * as callSummary from "./call-summary";
import { nanoid } from "nanoid";

export const telnyxWebhookRouter = Router();

// Helper to parse JSON fields
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

// Get SIP domain for Telnyx credential connections
function getTelnyxSipDomain(customerId?: number): string {
  // Telnyx credential connections use: {subdomain}.sip.telnyx.com
  // Default subdomain is configured per connection
  return process.env.TELNYX_SIP_DOMAIN || "sip.telnyx.com";
}

/**
 * Main TeXML voice webhook - handles incoming calls via TeXML
 * POST /api/webhooks/telnyx/voice
 *
 * This is the TeXML equivalent of the SignalWire LaML voice webhook.
 * Telnyx sends the same TwiML-style parameters.
 */
telnyxWebhookRouter.post("/voice", async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      From,
      To,
      Direction,
      CallStatus,
    } = req.body;

    console.log(`[Telnyx Webhook] Incoming call: ${CallSid} from ${From} to ${To}`);

    // Find the phone number in our database
    const phoneNumber = await db.getPhoneNumberByNumber(To);

    if (!phoneNumber) {
      console.log(`[Telnyx Webhook] Phone number ${To} not found in database`);
      res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This number is not configured. Goodbye.</Say>
  <Hangup/>
</Response>`);
      return;
    }

    // Check if this number is configured for Retell AI
    if (phoneNumber.callHandler === 'retell_agent' && phoneNumber.retellAgentId) {
      // Retell AI handles the call - register with Retell and redirect via SIP
      try {
        const callResponse = await retell.registerPhoneCall({
          agent_id: phoneNumber.retellAgentId,
          from_number: From,
          to_number: To,
          direction: "inbound",
          metadata: {
            customerId: phoneNumber.customerId,
            phoneNumberId: phoneNumber.id,
          },
        });

        // Build Retell SIP URI: {call_id}@5t4n6j0wnrl.sip.livekit.cloud
        const retellSipUri = `sip:${callResponse.call_id}@5t4n6j0wnrl.sip.livekit.cloud`;

        console.log(`[Telnyx Webhook] Forwarding to Retell AI: ${retellSipUri}`);

        res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${retellSipUri}</Sip>
  </Dial>
</Response>`);
        return;
      } catch (error) {
        console.error("[Telnyx Webhook] Failed to register with Retell:", error);
        // Fall through to normal routing
      }
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
      if (route.matchType === 'all') {
        matchedRoute = route;
        break;
      }

      if (route.matchType === 'caller_id' && route.matchPattern) {
        const pattern = route.matchPattern.replace(/\*/g, '.*');
        if (new RegExp(`^${pattern}$`).test(From)) {
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

      if (route.matchType === 'did' && route.matchPattern === To) {
        matchedRoute = route;
        break;
      }
    }

    // Generate TeXML based on route destination
    let texml: string;
    const sipDomain = getTelnyxSipDomain(phoneNumber.customerId);

    if (!matchedRoute) {
      // Default: try to route to assigned endpoint or ring group
      if (phoneNumber.assignedToEndpointId) {
        const endpoint = await db.getSipEndpointById(phoneNumber.assignedToEndpointId);
        if (endpoint) {
          const sipAddress = `sip:${endpoint.telnyxSipUsername || endpoint.username}@${sipDomain}`;
          texml = telnyx.generateTexmlDial(sipAddress, { timeout: 30 });
        } else {
          texml = telnyx.generateTexmlVoicemail();
        }
      } else if (phoneNumber.assignedToRingGroupId) {
        const ringGroup = await db.getRingGroupById(phoneNumber.assignedToRingGroupId);
        if (ringGroup) {
          const memberIds = parseJsonArray(ringGroup.memberEndpointIds);
          const endpoints = await Promise.all(memberIds.map(id => db.getSipEndpointById(id)));
          const sipAddresses = endpoints
            .filter(e => e && e.status === 'active')
            .map(e => `sip:${e!.telnyxSipUsername || e!.username}@${sipDomain}`);

          if (sipAddresses.length > 0) {
            texml = telnyx.generateTexmlRingGroup(sipAddresses, {
              strategy: ringGroup.strategy as 'simultaneous' | 'sequential',
              timeout: ringGroup.ringTimeout || 30,
            });
          } else {
            texml = telnyx.generateTexmlVoicemail();
          }
        } else {
          texml = telnyx.generateTexmlVoicemail();
        }
      } else {
        texml = telnyx.generateTexmlVoicemail();
      }
    } else {
      // Route based on destination type
      switch (matchedRoute.destinationType) {
        case 'endpoint':
          if (matchedRoute.destinationId) {
            const endpoint = await db.getSipEndpointById(matchedRoute.destinationId);
            if (endpoint) {
              const sipAddress = `sip:${endpoint.telnyxSipUsername || endpoint.username}@${sipDomain}`;
              texml = telnyx.generateTexmlDial(sipAddress, { timeout: 30 });
            } else {
              texml = telnyx.generateTexmlVoicemail();
            }
          } else {
            texml = telnyx.generateTexmlVoicemail();
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
                .map(e => `sip:${e!.telnyxSipUsername || e!.username}@${sipDomain}`);

              if (sipAddresses.length > 0) {
                texml = telnyx.generateTexmlRingGroup(sipAddresses, {
                  strategy: ringGroup.strategy as 'simultaneous' | 'sequential',
                  timeout: ringGroup.ringTimeout || 30,
                });
              } else {
                texml = telnyx.generateTexmlVoicemail();
              }
            } else {
              texml = telnyx.generateTexmlVoicemail();
            }
          } else {
            texml = telnyx.generateTexmlVoicemail();
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
            texml = telnyx.generateTexmlVoicemail();
          }
          break;

        case 'voicemail':
          texml = telnyx.generateTexmlVoicemail();
          break;

        case 'ai_agent': {
          // For Retell AI agent routing via call routes
          const customer = await db.getCustomerById(phoneNumber.customerId);
          if (customer?.retellAgentId && customer.retellEnabled) {
            try {
              const callResponse = await retell.registerPhoneCall({
                agent_id: customer.retellAgentId,
                from_number: From,
                to_number: To,
                direction: "inbound",
                metadata: { customerId: phoneNumber.customerId },
              });

              const retellSipUri = `sip:${callResponse.call_id}@5t4n6j0wnrl.sip.livekit.cloud`;
              texml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Sip>${retellSipUri}</Sip>
  </Dial>
</Response>`;
            } catch (error) {
              console.error("[Telnyx Webhook] Retell AI registration failed:", error);
              texml = telnyx.generateTexmlVoicemail();
            }
          } else {
            texml = telnyx.generateTexmlVoicemail();
          }
          break;
        }

        default:
          texml = telnyx.generateTexmlVoicemail();
      }
    }

    console.log(`[Telnyx Webhook] Responding with TeXML for call ${CallSid}`);
    res.type("application/xml").send(texml);
  } catch (error) {
    console.error("[Telnyx Webhook] Error handling voice webhook:", error);
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Please try again later.</Say>
  <Hangup/>
</Response>`);
  }
});

/**
 * Call status callback - tracks call completion
 * POST /api/webhooks/telnyx/status
 */
telnyxWebhookRouter.post("/status", async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      CallStatus,
      CallDuration,
      From,
      To,
      Direction,
    } = req.body;

    console.log(`[Telnyx Webhook] Call status update: ${CallSid} - ${CallStatus}`);

    const phoneNumber = await db.getPhoneNumberByNumber(Direction === 'inbound' ? To : From);

    if (phoneNumber && CallStatus === 'completed') {
      await db.incrementUsageStats(phoneNumber.customerId, {
        totalCalls: 1,
        inboundCalls: Direction === 'inbound' ? 1 : 0,
        outboundCalls: Direction === 'outbound' ? 1 : 0,
        totalMinutes: Math.ceil(parseInt(CallDuration || '0') / 60),
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Telnyx Webhook] Error handling status webhook:", error);
    res.status(500).send('Error');
  }
});

/**
 * Recording callback - handles completed recordings
 * POST /api/webhooks/telnyx/recording
 */
telnyxWebhookRouter.post("/recording", async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      RecordingSid,
      RecordingUrl,
      RecordingDuration,
      From,
      To,
      Direction,
      TranscriptionText,
    } = req.body;

    console.log(`[Telnyx Webhook] Recording ready: ${RecordingSid} for call ${CallSid}`);

    const phoneNumber = await db.getPhoneNumberByNumber(Direction === 'inbound' ? To : From);

    if (phoneNumber) {
      const recordingKey = `recordings/${phoneNumber.customerId}/${CallSid}-${nanoid(8)}.wav`;

      await db.createCallRecording({
        customerId: phoneNumber.customerId,
        callSid: CallSid,
        direction: Direction === 'inbound' ? 'inbound' : 'outbound',
        fromNumber: From,
        toNumber: To,
        duration: parseInt(RecordingDuration || '0'),
        recordingUrl: RecordingUrl,
        recordingKey,
        transcription: TranscriptionText || null,
        status: 'ready',
        retentionDays: 90,
      });

      await db.createNotification({
        customerId: phoneNumber.customerId,
        type: 'recording_ready',
        title: 'New Call Recording',
        message: `A new ${Direction} call recording is available (${Math.ceil(parseInt(RecordingDuration || '0') / 60)} minutes)`,
        metadata: { callSid: CallSid, recordingSid: RecordingSid },
      });

      // Send SMS summary for longer calls
      const duration = parseInt(RecordingDuration || '0');
      if (duration >= 30) {
        callSummary.sendCallSummarySms({
          callSid: CallSid,
          fromNumber: From,
          toNumber: To,
          direction: Direction === 'inbound' ? 'inbound' : 'outbound',
          duration,
          transcription: TranscriptionText || null,
          customerId: phoneNumber.customerId,
        }).catch(err => {
          console.error(`[Telnyx Webhook] Error sending SMS summary for call ${CallSid}:`, err);
        });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Telnyx Webhook] Error handling recording webhook:", error);
    res.status(500).send('Error');
  }
});

/**
 * Voicemail callback
 * POST /api/webhooks/telnyx/voicemail
 */
telnyxWebhookRouter.post("/voicemail", async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      RecordingSid,
      RecordingUrl,
      RecordingDuration,
      From,
      To,
      TranscriptionText,
    } = req.body;

    console.log(`[Telnyx Webhook] Voicemail received: ${RecordingSid} for call ${CallSid}`);

    const phoneNumber = await db.getPhoneNumberByNumber(To);

    if (phoneNumber) {
      await db.createNotification({
        customerId: phoneNumber.customerId,
        type: 'voicemail',
        title: 'New Voicemail',
        message: `You have a new voicemail from ${From} (${Math.ceil(parseInt(RecordingDuration || '0') / 60)} minutes)`,
        metadata: {
          callSid: CallSid,
          recordingSid: RecordingSid,
          from: From,
          transcription: TranscriptionText,
        },
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Telnyx Webhook] Error handling voicemail webhook:", error);
    res.status(500).send('Error');
  }
});

/**
 * Missed call callback
 * POST /api/webhooks/telnyx/missed
 */
telnyxWebhookRouter.post("/missed", async (req: Request, res: Response) => {
  try {
    const { CallSid, From, To } = req.body;

    console.log(`[Telnyx Webhook] Missed call: ${CallSid} from ${From}`);

    const phoneNumber = await db.getPhoneNumberByNumber(To);

    if (phoneNumber) {
      await db.createNotification({
        customerId: phoneNumber.customerId,
        type: 'missed_call',
        title: 'Missed Call',
        message: `You missed a call from ${From}`,
        metadata: { callSid: CallSid, from: From },
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Telnyx Webhook] Error handling missed call webhook:", error);
    res.status(500).send('Error');
  }
});

/**
 * Telnyx Call Control events (JSON webhook)
 * POST /api/webhooks/telnyx/call-control
 *
 * Handles raw Telnyx Call Control events for more complex call flows
 */
telnyxWebhookRouter.post("/call-control", async (req: Request, res: Response) => {
  try {
    const { data } = req.body;

    if (!data) {
      res.status(200).send('OK');
      return;
    }

    const eventType = data.event_type;
    const payload = data.payload;

    console.log(`[Telnyx CC] Event: ${eventType}`);

    switch (eventType) {
      case "call.initiated":
        console.log(`[Telnyx CC] Call initiated: ${payload.call_control_id} from ${payload.from} to ${payload.to}`);
        break;

      case "call.answered":
        console.log(`[Telnyx CC] Call answered: ${payload.call_control_id}`);
        break;

      case "call.hangup":
        console.log(`[Telnyx CC] Call ended: ${payload.call_control_id}, cause: ${payload.hangup_cause}`);
        break;

      case "call.recording.saved":
        console.log(`[Telnyx CC] Recording saved: ${payload.recording_urls?.mp3}`);
        break;

      case "call.dtmf.received":
        console.log(`[Telnyx CC] DTMF received: ${payload.digit}`);
        break;

      case "call.speak.ended":
        console.log(`[Telnyx CC] Speak ended`);
        break;

      case "call.gather.ended":
        console.log(`[Telnyx CC] Gather ended: digits=${payload.digits}, speech=${payload.speech?.result}`);
        break;

      default:
        console.log(`[Telnyx CC] Unhandled event type: ${eventType}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error("[Telnyx CC] Error handling event:", error);
    res.status(500).send('Error');
  }
});

export default telnyxWebhookRouter;
