#!/usr/bin/env node
/**
 * Telnyx + Retell AI Setup Script
 *
 * Run this from your local machine to set up:
 * 1. Telnyx SIP credential connection (for VoIP phones)
 * 2. Telnyx TeXML application (for call routing)
 * 3. Telnyx messaging profile (for SMS)
 * 4. Telnyx outbound voice profile
 * 5. Retell AI agent verification
 *
 * Usage:
 *   node scripts/setup-telnyx-retell.mjs
 *
 * Prerequisites:
 *   - TELNYX_API_KEY set in .env
 *   - RETELL_API_KEY set in .env
 *   - Your public webhook URL (where your PBX server is hosted)
 */

import 'dotenv/config';
import https from 'https';

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const RETELL_API_KEY = process.env.RETELL_API_KEY;

if (!TELNYX_API_KEY) {
  console.error('ERROR: TELNYX_API_KEY not found in .env');
  process.exit(1);
}

// Get webhook URL from command line or prompt
const WEBHOOK_URL = process.argv[2] || process.env.WEBHOOK_URL || '';

if (!WEBHOOK_URL) {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Telnyx + Retell AI Setup                                ║
╚══════════════════════════════════════════════════════════╝

Usage: node scripts/setup-telnyx-retell.mjs <WEBHOOK_URL>

Example:
  node scripts/setup-telnyx-retell.mjs https://your-domain.com

The webhook URL is where Telnyx will send call events.
This must be your PBX server's public URL.
`);
  process.exit(1);
}

console.log(`
╔══════════════════════════════════════════════════════════╗
║  Setting up Telnyx + Retell AI                           ║
╚══════════════════════════════════════════════════════════╝

Webhook URL: ${WEBHOOK_URL}
Telnyx API Key: ${TELNYX_API_KEY.substring(0, 12)}...
Retell API Key: ${RETELL_API_KEY ? RETELL_API_KEY.substring(0, 12) + '...' : 'NOT SET'}
`);

// Helper to make API requests
function apiRequest(hostname, path, method, body, apiKey) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname,
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 400) {
            reject({ status: res.statusCode, data: parsed });
          } else {
            resolve(parsed);
          }
        } catch {
          reject({ status: res.statusCode, data: responseData });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function telnyxApi(path, method = 'GET', body = null) {
  return apiRequest('api.telnyx.com', `/v2${path}`, method, body, TELNYX_API_KEY);
}

function retellApi(path, method = 'GET', body = null) {
  return apiRequest('api.retellai.com', path, method, body, RETELL_API_KEY);
}

async function main() {
  const results = {};

  // ============ Step 1: Create Outbound Voice Profile ============
  console.log('1/5  Creating outbound voice profile...');
  try {
    const ovp = await telnyxApi('/outbound_voice_profiles', 'POST', {
      name: 'Knox PBX Outbound',
      traffic_type: 'conversational',
    });
    results.outboundVoiceProfileId = ovp.data?.id;
    console.log(`     ✓ Outbound Voice Profile: ${results.outboundVoiceProfileId}`);
  } catch (err) {
    console.log(`     ✗ Failed: ${JSON.stringify(err.data?.errors || err.data || err)}`);
  }

  // ============ Step 2: Create SIP Credential Connection ============
  console.log('2/5  Creating SIP credential connection...');
  try {
    const conn = await telnyxApi('/credential_connections', 'POST', {
      connection_name: 'Knox PBX SIP Trunk',
      user_name: 'knox_pbx_trunk',
      password: 'KnxPBX' + Date.now().toString(36) + '!Tr',
      sip_uri_calling_preference: 'disabled',
      default_on_hold_comfort_noise_enabled: true,
      outbound: {
        outbound_voice_profile_id: results.outboundVoiceProfileId || undefined,
        channel_limit: 50,
      },
      inbound: {
        ani_number_format: 'E.164',
        dnis_number_format: 'e164',
        sip_subdomain: 'knoxpbx',
        sip_subdomain_receive_settings: 'only_my_connections',
        channel_limit: 50,
      },
    });
    results.sipConnectionId = conn.data?.id;
    results.sipUsername = conn.data?.user_name;
    results.sipDomain = `${conn.data?.inbound?.sip_subdomain || 'knoxpbx'}.sip.telnyx.com`;
    console.log(`     ✓ SIP Connection ID: ${results.sipConnectionId}`);
    console.log(`     ✓ SIP Domain: ${results.sipDomain}`);
    console.log(`     ✓ SIP Username: ${results.sipUsername}`);
  } catch (err) {
    console.log(`     ✗ Failed: ${JSON.stringify(err.data?.errors || err.data || err)}`);
    // Try to get existing
    try {
      const existing = await telnyxApi('/credential_connections');
      if (existing.data?.length > 0) {
        const first = existing.data[0];
        results.sipConnectionId = first.id;
        console.log(`     → Using existing connection: ${first.id} (${first.connection_name})`);
      }
    } catch { /* ignore */ }
  }

  // ============ Step 3: Create TeXML Application ============
  console.log('3/5  Creating TeXML application...');
  try {
    const app = await telnyxApi('/texml_applications', 'POST', {
      friendly_name: 'Knox PBX Voice',
      voice_url: `${WEBHOOK_URL}/api/webhooks/telnyx/voice`,
      voice_fallback_url: `${WEBHOOK_URL}/api/webhooks/telnyx/voice`,
      voice_method: 'POST',
      status_callback: `${WEBHOOK_URL}/api/webhooks/telnyx/status`,
      status_callback_method: 'POST',
    });
    results.texmlAppId = app.data?.id;
    console.log(`     ✓ TeXML App ID: ${results.texmlAppId}`);
  } catch (err) {
    console.log(`     ✗ Failed: ${JSON.stringify(err.data?.errors || err.data || err)}`);
  }

  // ============ Step 4: Create Messaging Profile ============
  console.log('4/5  Creating messaging profile...');
  try {
    const msg = await telnyxApi('/messaging_profiles', 'POST', {
      name: 'Knox PBX SMS',
      webhook_url: `${WEBHOOK_URL}/api/webhooks/telnyx/sms`,
      webhook_api_version: '2',
    });
    results.messagingProfileId = msg.data?.id;
    console.log(`     ✓ Messaging Profile ID: ${results.messagingProfileId}`);
  } catch (err) {
    console.log(`     ✗ Failed: ${JSON.stringify(err.data?.errors || err.data || err)}`);
  }

  // ============ Step 5: Verify Retell AI ============
  console.log('5/5  Verifying Retell AI connection...');
  if (RETELL_API_KEY) {
    try {
      const agents = await retellApi('/list-agents');
      console.log(`     ✓ Retell AI connected. ${agents?.length || 0} existing agents found.`);
      results.retellConnected = true;
    } catch (err) {
      console.log(`     ✗ Retell connection failed: ${JSON.stringify(err.data || err)}`);
      results.retellConnected = false;
    }
  } else {
    console.log('     → Skipped (RETELL_API_KEY not set)');
    results.retellConnected = false;
  }

  // ============ Summary ============
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Setup Complete                                          ║
╚══════════════════════════════════════════════════════════╝

Add these to your .env file:

TELNYX_SIP_CONNECTION_ID=${results.sipConnectionId || '<FAILED - set manually>'}
TELNYX_MESSAGING_PROFILE_ID=${results.messagingProfileId || '<FAILED - set manually>'}
TELNYX_SIP_DOMAIN=${results.sipDomain || 'sip.telnyx.com'}

TeXML App ID: ${results.texmlAppId || '<not created>'}
Outbound Voice Profile: ${results.outboundVoiceProfileId || '<not created>'}
Retell AI: ${results.retellConnected ? 'Connected' : 'Not connected'}

═══════════════════════════════════════════════════════════

Next steps:
1. Update your .env with the values above
2. Point your Telnyx phone numbers to the TeXML app or SIP connection
3. Create a Retell AI receptionist agent via the admin dashboard
4. Submit your Viirtue number port order
5. Configure your VoIP phones with SIP credentials

Telnyx SIP server for VoIP phones: ${results.sipDomain || 'knoxpbx.sip.telnyx.com'}
Retell AI SIP URI: sip:<call_id>@5t4n6j0wnrl.sip.livekit.cloud
`);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
