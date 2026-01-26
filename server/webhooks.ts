/**
 * SignalWire Webhook Handlers
 * Handles incoming call events and generates LaML responses
 */

import { Router, Request, Response } from "express";
import * as db from "./db";
import { generateLamlDial, generateLamlRingGroup, generateLamlVoicemail } from "./signalwire";
import * as aiIvr from "./ai-ivr";
import * as callSummary from "./call-summary";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

export const webhookRouter = Router();

// Middleware to parse URL-encoded bodies (SignalWire sends form data)
webhookRouter.use((req, res, next) => {
  if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      req.body = Object.fromEntries(new URLSearchParams(body));
      next();
    });
  } else {
    next();
  }
});

/**
 * Main voice webhook - handles incoming calls
 * POST /api/webhooks/voice
 */
webhookRouter.post("/voice", async (req: Request, res: Response) => {
  try {
    const {
      CallSid,
      From,
      To,
      Direction,
      CallStatus,
    } = req.body;

    console.log(`[Webhook] Incoming call: ${CallSid} from ${From} to ${To}`);

    // Find the phone number in our database
    const phoneNumber = await db.getPhoneNumberByNumber(To);
    
    if (!phoneNumber) {
      console.log(`[Webhook] Phone number ${To} not found in database`);
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

    // Generate LaML based on route destination
    let laml: string;
    
    if (!matchedRoute) {
      // Default: try to route to assigned endpoint or ring group
      if (phoneNumber.assignedToEndpointId) {
        const endpoint = await db.getSipEndpointById(phoneNumber.assignedToEndpointId);
        if (endpoint) {
          const sipAddress = `sip:${endpoint.username}@${process.env.SIGNALWIRE_SPACE_URL}`;
          laml = generateLamlDial(sipAddress, { timeout: 30 });
        } else {
          laml = generateLamlVoicemail();
        }
      } else if (phoneNumber.assignedToRingGroupId) {
        const ringGroup = await db.getRingGroupById(phoneNumber.assignedToRingGroupId);
        if (ringGroup) {
          const memberIds = ringGroup.memberEndpointIds as number[] || [];
          const endpoints = await Promise.all(memberIds.map(id => db.getSipEndpointById(id)));
          const sipAddresses = endpoints
            .filter(e => e && e.status === 'active')
            .map(e => `sip:${e!.username}@${process.env.SIGNALWIRE_SPACE_URL}`);
          
          if (sipAddresses.length > 0) {
            laml = generateLamlRingGroup(sipAddresses, {
              strategy: ringGroup.strategy as 'simultaneous' | 'sequential',
              timeout: ringGroup.ringTimeout || 30,
            });
          } else {
            laml = generateLamlVoicemail();
          }
        } else {
          laml = generateLamlVoicemail();
        }
      } else {
        laml = generateLamlVoicemail();
      }
    } else {
      // Route based on destination type
      switch (matchedRoute.destinationType) {
        case 'endpoint':
          if (matchedRoute.destinationId) {
            const endpoint = await db.getSipEndpointById(matchedRoute.destinationId);
            if (endpoint) {
              const sipAddress = `sip:${endpoint.username}@${process.env.SIGNALWIRE_SPACE_URL}`;
              laml = generateLamlDial(sipAddress, { timeout: 30 });
            } else {
              laml = generateLamlVoicemail();
            }
          } else {
            laml = generateLamlVoicemail();
          }
          break;
          
        case 'ring_group':
          if (matchedRoute.destinationId) {
            const ringGroup = await db.getRingGroupById(matchedRoute.destinationId);
            if (ringGroup) {
              const memberIds = ringGroup.memberEndpointIds as number[] || [];
              const endpoints = await Promise.all(memberIds.map(id => db.getSipEndpointById(id)));
              const sipAddresses = endpoints
                .filter(e => e && e.status === 'active')
                .map(e => `sip:${e!.username}@${process.env.SIGNALWIRE_SPACE_URL}`);
              
              if (sipAddresses.length > 0) {
                laml = generateLamlRingGroup(sipAddresses, {
                  strategy: ringGroup.strategy as 'simultaneous' | 'sequential',
                  timeout: ringGroup.ringTimeout || 30,
                });
              } else {
                laml = generateLamlVoicemail();
              }
            } else {
              laml = generateLamlVoicemail();
            }
          } else {
            laml = generateLamlVoicemail();
          }
          break;
          
        case 'external':
          if (matchedRoute.destinationExternal) {
            laml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30">
    <Number>${matchedRoute.destinationExternal}</Number>
  </Dial>
</Response>`;
          } else {
            laml = generateLamlVoicemail();
          }
          break;
          
        case 'voicemail':
          laml = generateLamlVoicemail();
          break;
          
        case 'ai_agent':
          // AI-powered IVR with speech recognition
          const webhookBaseUrl = `${req.protocol}://${req.get('host')}`;
          laml = aiIvr.generateAiIvrLaml({
            customerId: phoneNumber.customerId,
            greeting: "Hello, thank you for calling. How may I direct your call? You can say things like 'sales', 'support', or the name of the person you're trying to reach.",
            gatherTimeout: 5,
            webhookUrl: webhookBaseUrl,
          });
          break;
          
        default:
          laml = generateLamlVoicemail();
      }
    }

    // Log the call
    console.log(`[Webhook] Responding with LaML for call ${CallSid}`);
    
    res.type("application/xml").send(laml);
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
    const {
      CallSid,
      CallStatus,
      CallDuration,
      From,
      To,
      Direction,
    } = req.body;

    console.log(`[Webhook] Call status update: ${CallSid} - ${CallStatus}`);

    // Find the customer by phone number
    const phoneNumber = await db.getPhoneNumberByNumber(Direction === 'inbound' ? To : From);
    
    if (phoneNumber && CallStatus === 'completed') {
      // Update usage stats
      await db.incrementUsageStats(phoneNumber.customerId, {
        totalCalls: 1,
        inboundCalls: Direction === 'inbound' ? 1 : 0,
        outboundCalls: Direction === 'outbound' ? 1 : 0,
        totalMinutes: Math.ceil(parseInt(CallDuration || '0') / 60),
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

    console.log(`[Webhook] Recording ready: ${RecordingSid} for call ${CallSid}`);

    // Find the customer by phone number
    const phoneNumber = await db.getPhoneNumberByNumber(Direction === 'inbound' ? To : From);
    
    if (phoneNumber) {
      // Download recording and upload to S3
      const recordingKey = `recordings/${phoneNumber.customerId}/${CallSid}-${nanoid(8)}.wav`;
      
      // Store recording metadata
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

      // Create notification
      await db.createNotification({
        customerId: phoneNumber.customerId,
        type: 'recording_ready',
        title: 'New Call Recording',
        message: `A new ${Direction} call recording is available (${Math.ceil(parseInt(RecordingDuration || '0') / 60)} minutes)`,
        metadata: { callSid: CallSid, recordingSid: RecordingSid },
      });

      // Send SMS summary if transcription is available and call is long enough
      const duration = parseInt(RecordingDuration || '0');
      if (duration >= 30) {
        // Process asynchronously to not block the webhook response
        callSummary.sendCallSummarySms({
          callSid: CallSid,
          fromNumber: From,
          toNumber: To,
          direction: Direction === 'inbound' ? 'inbound' : 'outbound',
          duration,
          transcription: TranscriptionText || null,
          customerId: phoneNumber.customerId,
        }).then(result => {
          if (result.success) {
            console.log(`[Webhook] SMS summary sent for call ${CallSid}: ${result.messageSid}`);
          } else {
            console.log(`[Webhook] SMS summary not sent for call ${CallSid}: ${result.error}`);
          }
        }).catch(err => {
          console.error(`[Webhook] Error sending SMS summary for call ${CallSid}:`, err);
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
    const {
      CallSid,
      RecordingSid,
      RecordingUrl,
      RecordingDuration,
      From,
      To,
      TranscriptionText,
    } = req.body;

    console.log(`[Webhook] Voicemail received: ${RecordingSid} for call ${CallSid}`);

    // Find the customer by phone number
    const phoneNumber = await db.getPhoneNumberByNumber(To);
    
    if (phoneNumber) {
      // Create notification for voicemail
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
    const {
      CallSid,
      From,
      To,
    } = req.body;

    console.log(`[Webhook] Missed call: ${CallSid} from ${From}`);

    // Find the customer by phone number
    const phoneNumber = await db.getPhoneNumberByNumber(To);
    
    if (phoneNumber) {
      // Create notification for missed call
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
      const laml = aiIvr.generateRetryLaml(
        "I didn't catch that. Could you please tell me which department you'd like to reach?",
        webhookBaseUrl,
        customerId,
        attempt
      );
      res.type("application/xml").send(laml);
      return;
    }

    // Get available departments for this customer
    const availableDepartments = await aiIvr.getAvailableDepartments(customerId);
    
    // Analyze the speech with LLM
    const intent = await aiIvr.analyzeTransferIntent(SpeechResult, availableDepartments);
    
    console.log(`[AI IVR] Intent analysis:`, intent);

    const webhookBaseUrl = `${req.protocol}://${req.get('host')}`;

    if (intent.shouldTransfer && intent.department) {
      // Try to find matching ring group first
      const ringGroup = await aiIvr.findDepartmentRingGroup(customerId, intent.department);
      
      if (ringGroup) {
        // Get ring group members
        const group = await db.getRingGroupById(ringGroup.ringGroupId);
        if (group) {
          const memberIds = group.memberEndpointIds as number[] || [];
          const endpoints = await Promise.all(memberIds.map(id => db.getSipEndpointById(id)));
          const sipAddresses = endpoints
            .filter(e => e && e.status === 'active')
            .map(e => `sip:${e!.username}@${process.env.SIGNALWIRE_SPACE_URL}`);
          
          if (sipAddresses.length > 0) {
            const laml = aiIvr.generateTransferToRingGroupLaml(sipAddresses, {
              strategy: group.strategy as 'simultaneous' | 'sequential',
              timeout: group.ringTimeout || 30,
              announcement: `Transferring you to ${ringGroup.name} now.`,
              fallbackUrl: `${webhookBaseUrl}/api/webhooks/ai-fallback?customerId=${customerId}`,
              callerId: From,
            });
            res.type("application/xml").send(laml);
            return;
          }
        }
      }
      
      // Try to find matching endpoint
      const endpoint = await aiIvr.findDepartmentEndpoint(customerId, intent.department);
      
      if (endpoint) {
        const sipAddress = `sip:${endpoint.username}@${process.env.SIGNALWIRE_SPACE_URL}`;
        const laml = aiIvr.generateTransferToEndpointLaml(sipAddress, {
          timeout: 30,
          announcement: `Transferring you to ${endpoint.displayName || endpoint.username} now.`,
          fallbackUrl: `${webhookBaseUrl}/api/webhooks/ai-fallback?customerId=${customerId}`,
          callerId: From,
        });
        res.type("application/xml").send(laml);
        return;
      }
      
      // Department mentioned but no match found
      const laml = aiIvr.generateRetryLaml(
        `I couldn't find ${intent.department}. Our available departments are: ${availableDepartments.join(', ')}. Which would you like?`,
        webhookBaseUrl,
        customerId,
        attempt
      );
      res.type("application/xml").send(laml);
      return;
    }

    // No clear transfer intent, ask for clarification
    const laml = aiIvr.generateRetryLaml(
      intent.response,
      webhookBaseUrl,
      customerId,
      attempt
    );
    res.type("application/xml").send(laml);
    
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
    const { From } = req.body;

    console.log(`[AI IVR] Fallback triggered for customer ${customerId}`);

    // Try to find a default ring group (reception, main, etc.)
    const ringGroups = await db.getRingGroupsByCustomer(customerId);
    const defaultGroup = ringGroups.find(g => 
      g.status === 'active' && 
      (g.name.toLowerCase().includes('reception') || 
       g.name.toLowerCase().includes('main') ||
       g.name.toLowerCase().includes('default'))
    ) || ringGroups.find(g => g.status === 'active');

    if (defaultGroup) {
      const memberIds = defaultGroup.memberEndpointIds as number[] || [];
      const endpoints = await Promise.all(memberIds.map(id => db.getSipEndpointById(id)));
      const sipAddresses = endpoints
        .filter(e => e && e.status === 'active')
        .map(e => `sip:${e!.username}@${process.env.SIGNALWIRE_SPACE_URL}`);
      
      if (sipAddresses.length > 0) {
        const laml = aiIvr.generateTransferToRingGroupLaml(sipAddresses, {
          strategy: defaultGroup.strategy as 'simultaneous' | 'sequential',
          timeout: defaultGroup.ringTimeout || 30,
          announcement: "Please hold while I connect you.",
          callerId: From,
        });
        res.type("application/xml").send(laml);
        return;
      }
    }

    // No ring groups, try first active endpoint
    const endpoints = await db.getSipEndpointsByCustomer(customerId);
    const activeEndpoint = endpoints.find(e => e.status === 'active');
    
    if (activeEndpoint) {
      const sipAddress = `sip:${activeEndpoint.username}@${process.env.SIGNALWIRE_SPACE_URL}`;
      const laml = aiIvr.generateTransferToEndpointLaml(sipAddress, {
        timeout: 30,
        announcement: "Please hold while I connect you.",
        callerId: From,
      });
      res.type("application/xml").send(laml);
      return;
    }

    // Nothing available, go to voicemail
    res.type("application/xml").send(generateLamlVoicemail());
    
  } catch (error) {
    console.error("[AI IVR] Error in fallback:", error);
    res.type("application/xml").send(generateLamlVoicemail());
  }
});

/**
 * SWAIG Transfer Function Webhook - handles AI Agent transfer requests
 * This endpoint is called by SignalWire AI Agent when it needs to transfer a call
 * POST /api/webhooks/swaig-transfer
 */
webhookRouter.post("/swaig-transfer", async (req: Request, res: Response) => {
  try {
    // SignalWire SWAIG sends JSON with the function arguments
    const {
      argument,
      meta_data,
      call_id,
      ai_session_id,
    } = req.body;

    // Parse the argument - SignalWire sends it in different formats
    // Format 1: { parsed: [{ destination: "Sales" }], raw: "..." }
    // Format 2: { destination: "sales" }
    // Format 3: string "{ destination: 'sales' }"
    let destination = '';
    if (typeof argument === 'string') {
      try {
        const parsed = JSON.parse(argument);
        destination = parsed?.destination?.toLowerCase() || '';
      } catch {
        destination = argument.toLowerCase();
      }
    } else if (argument?.parsed && Array.isArray(argument.parsed)) {
      // SignalWire's actual format: { parsed: [{ destination: "Sales" }] }
      destination = argument.parsed[0]?.destination?.toLowerCase() || '';
    } else if (argument?.destination) {
      destination = argument.destination.toLowerCase();
    }
    
    console.log(`[SWAIG Transfer] Request for destination: "${destination}"`);
    console.log(`[SWAIG Transfer] Call ID: ${call_id}, Session: ${ai_session_id}`);
    console.log(`[SWAIG Transfer] Full request body:`, JSON.stringify(req.body, null, 2));

    // Get customer ID from meta_data or query param
    const customerId = meta_data?.customer_id || parseInt(req.query.customerId as string) || 1;
    
    // Define department mappings to DTMF digits
    // These match the Gather Input in Call Flow Builder:
    // Press 1 for Sales, 2 for Accounting, 3 for Support
    const departmentMappings: Record<string, { dtmf: string; name: string }> = {
      'sales': { dtmf: '1', name: 'Sales' },
      'accounting': { dtmf: '2', name: 'Accounting' },
      'support': { dtmf: '3', name: 'Support' },
      'billing': { dtmf: '2', name: 'Billing' },
      'technical': { dtmf: '3', name: 'Technical Support' },
      'customer service': { dtmf: '3', name: 'Customer Service' },
    };

    // Try to match the destination to a department
    let matchedDepartment: { dtmf: string; name: string } | null = null;
    
    // First try exact match
    if (departmentMappings[destination]) {
      matchedDepartment = departmentMappings[destination];
    } else {
      // Try partial match
      for (const [key, value] of Object.entries(departmentMappings)) {
        if (destination.includes(key) || key.includes(destination)) {
          matchedDepartment = value;
          break;
        }
      }
    }

    if (matchedDepartment) {
      // CORRECT SIP domain from SignalWire dashboard
      const sipDomain = 'knoxlandin-526db06c4f67.sip.signalwire.com';
      const sipEndpoints: Record<string, string> = {
        '1': `sip:knox_101@${sipDomain}`,
        '2': `sip:knox_102@${sipDomain}`, 
        '3': `sip:knox_103@${sipDomain}`,
      };
      const sipAddress = sipEndpoints[matchedDepartment.dtmf] || sipEndpoints['1'];
      
      console.log(`[SWAIG Transfer] Matched department: ${matchedDepartment.name} -> ${sipAddress}`);
      
      // Use back_to_back_functions: false and stop to let the Call Flow Builder continue
      const response = {
        response: `Transferring you to ${matchedDepartment.name} now. Please hold while I connect you.`,
        action: [
          { back_to_back_functions: false },
          { stop: true }
        ]
      };
      
      console.log(`[SWAIG Transfer] Sending response:`, JSON.stringify(response, null, 2));
      res.json(response);
      return;
    }

    // No match found - ask for clarification
    console.log(`[SWAIG Transfer] No match found for: ${destination}`);
    const availableDepts = Object.keys(departmentMappings).join(', ');
    res.json({
      response: `I couldn't find that department. Our available departments are: ${availableDepts}. Which would you like to speak with?`
    });
    
  } catch (error) {
    console.error("[SWAIG Transfer] Error:", error);
    res.json({
      response: "I'm sorry, I encountered an error. Let me connect you to sales.",
      action: [
        {
          SWML: {
            sections: {
              main: [
                { send_digits: "1" }
              ]
            }
          }
        }
      ]
    });
  }
});

/**
 * SWAIG Functions List - returns available functions for AI Agent
 * GET /api/webhooks/swaig-functions
 */
webhookRouter.get("/swaig-functions", async (req: Request, res: Response) => {
  // Return the list of available SWAIG functions
  res.json({
    functions: [
      {
        function: "transfer",
        description: "Transfer the call to a specific department like sales, support, accounting, or billing",
        parameters: {
          type: "object",
          properties: {
            destination: {
              type: "string",
              description: "The department to transfer to (e.g., sales, support, accounting, billing)"
            }
          },
          required: ["destination"]
        }
      }
    ]
  });
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
    res.type("application/xml").send(generateLamlVoicemail());
  }
});

export default webhookRouter;
