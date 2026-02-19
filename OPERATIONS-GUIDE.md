# White-Label PBX — Operations Guide

Complete guide for operating the KLT Connect PBX platform at **kltconnect.com**.

---

## Table of Contents

1. [Accessing the Admin Dashboard](#1-accessing-the-admin-dashboard)
2. [Setting Up a New Customer](#2-setting-up-a-new-customer)
3. [Buying Phone Numbers](#3-buying-phone-numbers)
4. [Porting Numbers from Another Carrier](#4-porting-numbers-from-another-carrier)
5. [Creating SIP Endpoints](#5-creating-sip-endpoints)
6. [Setting Up VoIP Desk Phones](#6-setting-up-voip-desk-phones)
7. [Configuring Ring Groups](#7-configuring-ring-groups)
8. [Setting Up Call Routes](#8-setting-up-call-routes)
9. [AI Receptionist (Retell AI)](#9-ai-receptionist-retell-ai)
10. [Customer Portal & Branding](#10-customer-portal--branding)
11. [Call Recordings & Retention](#11-call-recordings--retention)
12. [SMS / Messaging](#12-sms--messaging)
13. [Notifications](#13-notifications)
14. [AI Call Flows (LLM)](#14-ai-call-flows-llm)
15. [Day-to-Day Operations](#15-day-to-day-operations)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Accessing the Admin Dashboard

1. Navigate to **https://kltconnect.com/admin**
2. Log in with your admin credentials (the user whose OpenID matches `OWNER_OPEN_ID` in `.env` is auto-assigned admin role)
3. The dashboard shows system-wide stats: total customers, active endpoints, call volume

### Admin Navigation

| Section | Path | Purpose |
|---------|------|---------|
| Dashboard | `/admin` | System overview and stats |
| Customers | `/admin/customers` | Manage customer accounts |
| Phone Numbers | `/admin/phone-numbers` | Manage all provisioned numbers |
| SIP Endpoints | `/admin/sip-endpoints` | Manage SIP devices/softphones |
| Ring Groups | `/admin/ring-groups` | Configure call distribution |
| Call Routes | `/admin/call-routes` | Set up inbound call routing |
| Call Recordings | `/admin/recordings` | View and manage recordings |
| VoIP Phones | `/admin/voip-phones` | Desk phone inventory |
| Port Orders | `/admin/port-orders` | Number porting status |
| AI Agents | `/admin/ai-agents` | Retell AI receptionists |

---

## 2. Setting Up a New Customer

### Step-by-Step

1. Go to **Admin → Customers**
2. Click **"Add Customer"**
3. Fill in the form:
   - **Name** — Contact person's name (required)
   - **Company Name** — Business name
   - **Email** — Primary email (required)
   - **Phone** — Contact phone
   - **Notes** — Internal notes
4. Click **Create**

### What Happens Automatically

When you create a customer, the system automatically:

1. Creates the customer record with status `pending`
2. Provisions a **Telnyx Credential Connection** (SIP registration credentials for their phones)
3. Creates a **Telnyx TeXML Application** (call control webhooks pointed at your server)
4. Sets customer status to **`active`**

If Telnyx provisioning fails for any reason, the customer is still activated — you can manually configure Telnyx resources later.

### After Creation

Once the customer is active, you need to:

1. **Buy or port phone numbers** for them (Section 3 & 4)
2. **Create SIP endpoints** for their phones/softphones (Section 5)
3. **Set up call routing** to direct inbound calls (Section 8)
4. **Optionally set up AI receptionist** (Section 9)

---

## 3. Buying Phone Numbers

### Search for Available Numbers

1. Go to **Admin → Phone Numbers**
2. Click **"Search Available Numbers"**
3. Filter by:
   - **Country** — US, CA, etc.
   - **Area Code** — e.g., 214 for Dallas
   - **Number Type** — local, toll-free
4. Browse results and click **"Purchase"** on the desired number

### After Purchase

The number is provisioned on Telnyx and added to your system. Next:

1. **Assign to a customer** — Edit the number and select the customer
2. **Set the call handler** — Choose what happens when someone calls this number:
   - **SIP Endpoint** — Ring a specific phone/softphone
   - **Ring Group** — Ring multiple phones
   - **AI Agent** — Send to Retell AI receptionist
   - **LaML Webhooks** — Custom call flow
   - **Relay Context** — SignalWire relay

### Assigning a Number to a Customer

1. Click the number in the list
2. Select the **Customer** from the dropdown
3. Select the **Call Handler** type
4. If handler is `sip_endpoint` or `ring_group`, select the specific endpoint/group
5. Save

---

## 4. Porting Numbers from Another Carrier

Number porting transfers existing phone numbers from another carrier (AT&T, Vonage, RingCentral, etc.) to Telnyx.

### Before You Start

Gather this information from the customer:

- **Phone numbers** to port (can be multiple)
- **Current carrier** name
- **Account number** with current carrier
- **Authorized name** on the account (must match exactly)
- **Service address** — street address, city, state, ZIP, country

> **Important:** The authorized name and address must match the current carrier's records exactly, or the port will be rejected.

### Create a Port Order

1. Go to **Admin → Port Orders**
2. Click **"New Port Order"**
3. Fill in:
   - **Customer** — Select from dropdown
   - **Phone Numbers** — Enter each number to port
   - **Current Carrier** — e.g., "AT&T", "Vonage"
   - **Account Number** — Customer's account with old carrier
   - **Authorized Name** — Name on the old account
   - **Service Address** — Full address on file with old carrier
4. Click **"Submit Port Order"**

### Port Order Lifecycle

| Status | Meaning |
|--------|---------|
| `draft` | Created locally, not yet submitted to Telnyx |
| `submitted` | Sent to Telnyx for processing |
| `in_progress` | Telnyx accepted the port, working with old carrier |
| `completed` | Numbers ported successfully, now on Telnyx |
| `failed` | Port rejected — check error message |
| `cancelled` | Port cancelled by admin |

### Checking Status

- Click the **refresh icon** next to a port order to check its latest status from Telnyx
- The **FOC Date** (Firm Order Commitment) is the scheduled date for the port to complete
- Typical port timelines: 7-10 business days for local numbers, 2-4 weeks for toll-free

### After Port Completes

Once status is `completed`:
1. The numbers are now active on Telnyx
2. Assign them to the customer in **Phone Numbers**
3. Configure call handlers as needed

---

## 5. Creating SIP Endpoints

SIP endpoints represent individual phone lines — each desk phone, softphone, or device gets one.

### Create an Endpoint

1. Go to **Admin → SIP Endpoints**
2. Click **"Add Endpoint"**
3. Fill in:
   - **Customer** — Select customer
   - **Username** — SIP username (used for phone registration)
   - **Password** — SIP password (auto-generated or custom)
   - **Display Name** — Name shown on caller ID
   - **Extension Number** — Internal extension (e.g., 101, 102)
   - **Caller ID** — Outbound caller ID number
   - **Call Handler** — How calls to this endpoint are handled
4. Click **Create**

### SIP Registration Details

When configuring a phone or softphone, use these settings:

| Setting | Value |
|---------|-------|
| SIP Server | `sip.telnyx.com` |
| SIP Port | `5060` (UDP) or `5061` (TLS) |
| Transport | UDP or TLS (TLS recommended) |
| Username | The username you set above |
| Password | The password you set above |

---

## 6. Setting Up VoIP Desk Phones

For physical desk phones (Yealink, Polycom, Grandstream, Cisco, etc.).

### Add a Phone

1. Go to **Admin → VoIP Phones**
2. Click **"Add Phone"**
3. Fill in:
   - **Customer** — Select customer
   - **Brand** — Yealink, Polycom, Grandstream, etc.
   - **Model** — e.g., T46U, VVX450
   - **MAC Address** — Found on bottom of phone (e.g., `00:15:65:AB:CD:EF`)
   - **Label** — Friendly name ("Front Desk", "John's Office")
   - **Location** — Physical location
4. Click **Create**

### What Happens Automatically

The system:
1. Creates a SIP endpoint with auto-generated credentials
2. Links the phone to the endpoint
3. Generates a provisioning URL

### Phone Configuration

After creating the phone, click **"Get Provisioning Config"** to see the SIP credentials:

- **SIP Server**: `sip.telnyx.com`
- **Username**: Auto-generated
- **Password**: Auto-generated
- **Port**: 5060 (UDP) or 5061 (TLS)

Enter these into the phone's web interface:

1. Find the phone's IP address (usually shown on the phone's screen or via DHCP)
2. Open `http://<phone-ip>` in a browser
3. Navigate to **SIP Account** or **Line Settings**
4. Enter the SIP server, username, and password
5. Save and reboot the phone

### Supported Brands

| Brand | Common Models | Notes |
|-------|--------------|-------|
| Yealink | T46U, T54W, T58W | Best auto-provisioning support |
| Polycom | VVX 250/350/450 | Reliable, feature-rich |
| Grandstream | GRP2612/2614/2616 | Budget-friendly |
| Cisco | SPA 303/504, 7800 | Enterprise-grade |

---

## 7. Configuring Ring Groups

Ring groups allow multiple phones to ring when a call comes in — great for sales teams, support desks, etc.

### Create a Ring Group

1. Go to **Admin → Ring Groups**
2. Click **"Add Ring Group"**
3. Fill in:
   - **Customer** — Select customer
   - **Name** — e.g., "Sales Team", "Support Desk"
   - **Extension** — Internal extension for the group (e.g., 200)
   - **Ring Strategy**:
     - **Simultaneous** — All phones ring at once
     - **Sequential** — Ring phones one at a time in order
     - **Round Robin** — Rotate through members evenly
     - **Random** — Ring a random member
   - **Ring Timeout** — How long to ring before failover (seconds)
   - **Members** — Select SIP endpoints to include
4. Set **Failover Action** (what happens if nobody answers):
   - **Voicemail** — Send to voicemail
   - **Forward** — Forward to another number
   - **Hangup** — Disconnect
5. Click **Create**

### Example Setup: Small Office

```
Ring Group: "Main Office"
  Strategy: Simultaneous
  Timeout: 30 seconds
  Members: Front Desk (101), Manager (102), Sales (103)
  Failover: Forward to mobile (555-123-4567)
```

---

## 8. Setting Up Call Routes

Call routes determine what happens when a call arrives at a phone number — they're the rules engine for inbound calls.

### Create a Route

1. Go to **Admin → Call Routes**
2. Click **"Add Route"**
3. Fill in:
   - **Customer** — Select customer
   - **Name** — Descriptive name (e.g., "Business Hours", "After Hours")
   - **Priority** — Lower number = higher priority (routes are evaluated in order)
   - **Match Type**:
     - **All** — Match all incoming calls
     - **Caller ID** — Match specific caller numbers
     - **Time-Based** — Match by time of day / day of week
     - **DID** — Match specific dialed number
   - **Match Pattern** — Pattern for matching (regex for caller ID, phone number for DID)
   - **Time Start / End** — For time-based routes (24h format, e.g., 09:00, 17:00)
   - **Days of Week** — For time-based routes
4. Set **Destination**:
   - **Endpoint** — Send to a specific SIP endpoint
   - **Ring Group** — Send to a ring group
   - **External** — Forward to an external number
   - **Voicemail** — Send to voicemail
   - **AI Agent** — Send to Retell AI receptionist
5. Click **Create**

### Example: Business Hours + After Hours

**Route 1: Business Hours**
```
Priority: 1
Match Type: Time-Based
Time: 09:00 - 17:00
Days: Monday-Friday
Destination: Ring Group → "Main Office"
```

**Route 2: After Hours (Catch-All)**
```
Priority: 10
Match Type: All
Destination: AI Agent → "After Hours Receptionist"
```

Since Route 1 has higher priority (lower number), it matches first during business hours. All other calls fall through to Route 2.

---

## 9. AI Receptionist (Retell AI)

The AI Receptionist answers calls, greets callers, handles department transfers, takes messages, and provides information — all powered by AI.

### Prerequisites

1. **Retell AI account** — Sign up at [retellai.com](https://www.retellai.com)
2. **API key** — Get from Retell dashboard, add to `.env` as `RETELL_API_KEY`
3. **SIP URI** — From Retell dashboard, add to `.env` as `RETELL_SIP_URI`

### Step 1: Create an AI Agent

1. Go to **Admin → AI Agents** (or use the Retell section)
2. Click **"Create Receptionist Agent"**
3. Configure:
   - **Customer** — Select which customer this agent serves
   - **Name** — e.g., "Main Receptionist"
   - **Greeting** — What the AI says when it answers:
     > "Thank you for calling Acme Corp. How can I help you today?"
   - **Voice ID** — Choose the AI voice (see Retell dashboard for options)
   - **Language** — English, Spanish, etc.
   - **Departments** — Define transferable departments:
     ```json
     [
       { "name": "Sales", "number": "+12145551234", "description": "Product inquiries" },
       { "name": "Support", "number": "+12145555678", "description": "Technical help" },
       { "name": "Billing", "number": "+12145559012", "description": "Account questions" }
     ]
     ```
   - **Max Call Duration** — Limit in milliseconds (default: 300000 = 5 minutes)
   - **Enable Post-Call Analysis** — AI summarizes each call
   - **Enable Voicemail Detection** — Detect and handle voicemail boxes

### Step 2: Assign a Phone Number

1. Go to **Phone Numbers**
2. Edit the number you want the AI to answer
3. Set **Call Handler** to **`retell_agent`**
4. The system will route calls on that number to the Retell AI via SIP

### Step 3: Configure Call Forwarding

When callers ask for a transfer, the AI uses the department list to route them:
- "I'd like to speak to sales" → Transfers to Sales number
- "I need technical support" → Transfers to Support number
- "Can I leave a message?" → AI takes a message and sends notification

### How It Works (Technical Flow)

```
Caller → Telnyx → Your Server (webhook) → Retell AI (SIP)
                                         → AI answers, converses
                                         → Transfer/Message/Hangup
```

1. Call arrives at Telnyx number
2. Telnyx sends webhook to your server
3. Server forwards call to Retell via SIP URI
4. Retell AI handles the conversation
5. If transfer requested, call is forwarded to the department number

### Monitoring AI Calls

- **Admin → AI Agents** — View agent status and call counts
- **Retell Dashboard** — Detailed call transcripts, analytics, costs
- Call summaries are stored in recordings if post-call analysis is enabled

---

## 10. Customer Portal & Branding

Each customer can access a self-service portal to view their phone system.

### Portal Access

- URL: **https://kltconnect.com/portal**
- Customers see only their own data (phone numbers, endpoints, recordings, etc.)

### Customer Portal Features

| Section | What They Can Do |
|---------|-----------------|
| Dashboard | View call stats and recent activity |
| Phone Numbers | See assigned numbers |
| SIP Endpoints | View their phone lines |
| Ring Groups | View group configurations |
| Call Recordings | Listen to and download recordings |
| VoIP Phones | See registered desk phones |
| Port Orders | Track number porting status |
| Notifications | View alerts and manage preferences |

### Branding (White Label)

Customize the portal appearance per customer:

1. Go to **Admin → Customers**
2. Click on the customer
3. Go to **Branding** section
4. Set:
   - **Company Name** — Shown in portal header
   - **Logo URL** — Customer's logo image
   - **Primary Color** — Hex color for theme (e.g., `#2563EB`)
5. Save

The customer portal will show their branding instead of the default.

---

## 11. Call Recordings & Retention

### Viewing Recordings

1. Go to **Admin → Recordings** (or **Portal → Recordings** for customers)
2. Browse recordings by date, direction, number
3. Click **Play** to listen or **Download** for a copy

### Recording Features

- **Transcription** — AI-generated text of the call
- **Summary** — AI-generated summary (if LLM is configured)
- **Duration** — Call length
- **Direction** — Inbound or outbound

### Retention Policies

Control how long recordings are kept:

1. Go to **Admin → Customers → [Customer] → Retention**
2. Set:
   - **Retention Days** — How long to keep recordings (default: 90 days)
   - **Auto-Delete** — Automatically delete expired recordings
3. Save

### Storage

Recordings are stored in **AWS S3**. Make sure these environment variables are configured:

```
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-pbx-recordings-bucket
```

---

## 12. SMS / Messaging

Send and receive SMS messages through Telnyx.

### Prerequisites

- A phone number with **SMS capability enabled**
- **Telnyx Messaging Profile ID** configured in `.env` (`TELNYX_MESSAGING_PROFILE_ID`)

### Sending SMS

SMS can be sent through the Telnyx API integration. The `telnyxApi.sendSms()` method supports:

- **From** — Your Telnyx number
- **To** — Recipient number
- **Text** — Message content

### SMS Notifications

When `smsSummaryEnabled` is turned on for a customer, the system sends SMS notifications for:
- Missed calls
- Voicemail received
- Call summaries (if LLM is configured)

Configure per customer:
1. **Admin → Customers → [Customer]**
2. Enable **SMS Summary**
3. Set **Notification Phone** — The mobile number to receive SMS alerts

---

## 13. Notifications

### Types

| Type | Description |
|------|------------|
| `missed_call` | A call was missed (no answer) |
| `voicemail` | New voicemail received |
| `high_volume` | Call volume exceeds threshold |
| `system` | System alerts (downtime, errors) |
| `recording_ready` | Call recording processed and available |

### Managing Notification Preferences

Per-customer settings (Admin → Customers → [Customer] → Notifications):

| Setting | Description | Default |
|---------|------------|---------|
| Missed Call Email | Email on missed calls | On |
| Missed Call In-App | Dashboard alert for missed calls | On |
| Voicemail Email | Email on new voicemail | On |
| Voicemail In-App | Dashboard alert for voicemail | On |
| High Volume Email | Email when call volume spikes | Off |
| High Volume In-App | Dashboard alert for high volume | On |
| Recording Ready Email | Email when recording is ready | Off |
| Recording Ready In-App | Dashboard alert for recordings | On |
| High Volume Threshold | Calls per hour to trigger alert | 100 |

---

## 14. AI Call Flows (LLM)

Create custom call flows using natural language descriptions — the AI generates the call routing logic automatically.

### Prerequisites

Configure the LLM API in `.env`:
```
BUILT_IN_FORGE_API_URL=https://your-llm-api.com
BUILT_IN_FORGE_API_KEY=your-api-key
```

### Creating a Call Flow

1. Go to **Admin → Call Flows**
2. Click **"Create Flow"**
3. Describe the flow in plain English:
   > "When a call comes in during business hours (9am-5pm Mon-Fri), play a greeting, then offer options: press 1 for sales, press 2 for support, press 3 to leave a message. After hours, play a closed message and offer voicemail."
4. The AI generates the routing logic (LaML/TeXML)
5. Review the generated flow
6. Click **Activate**

### Regenerating Flows

If you update the description, click **"Regenerate"** to create a new version of the call flow.

### AI Routing Suggestions

The system can analyze call patterns and suggest optimized routing:
1. Go to **Call Flows**
2. Click **"Get Routing Suggestions"**
3. Review AI recommendations for improving call handling

---

## 15. Day-to-Day Operations

### Daily Checks

1. **Health endpoint** — Visit `https://kltconnect.com/api/health` to verify the server is running
2. **Check call volume** — Admin dashboard shows real-time stats
3. **Review missed calls** — Check notifications for any missed calls
4. **Monitor port orders** — Refresh port order status for any in-progress ports

### Common Admin Tasks

| Task | How To |
|------|--------|
| Suspend a customer | Admin → Customers → Edit → Status: Suspended |
| Add a phone number | Admin → Phone Numbers → Search → Purchase → Assign to customer |
| Change call routing | Admin → Call Routes → Edit route → Update destination |
| Check AI agent calls | Admin → AI Agents → View call log |
| Export recordings | Admin → Recordings → Download individual or bulk |

### Server Management (PM2)

```bash
# Check process status
pm2 status

# View logs
pm2 logs white-label-pbx

# Restart the app
pm2 restart white-label-pbx

# Monitor CPU/memory
pm2 monit
```

### Updating the Application

```bash
cd /opt/white-label-pbx
git pull origin claude/explore-pbx-system-oorwR
pnpm install
pnpm run build
pm2 restart white-label-pbx
```

### Database Backups

Automated backups run via the backup script:

```bash
# Manual backup
bash /opt/white-label-pbx/deploy/backup.sh

# Backups stored in: /opt/white-label-pbx/backups/
# Retention: 30 days (auto-deleted)
```

### SSL Certificate Renewal

Certificates auto-renew via certbot. To manually renew:

```bash
# AlmaLinux/RHEL
certbot renew

# Check certificate expiry
certbot certificates
```

---

## 16. Troubleshooting

### Phone Not Registering

1. Verify SIP credentials match (username, password)
2. Check SIP server is `sip.telnyx.com`
3. Try port 5060 (UDP) or 5061 (TLS)
4. Check the phone can reach the internet
5. Look for registration errors in the phone's web interface

### Calls Not Routing

1. Check the phone number has a **call handler** assigned
2. Verify the **call route** priority and matching rules
3. Check the **TeXML application** is configured (Admin → Customers → Telnyx settings)
4. Verify webhook URL is correct: `https://kltconnect.com/api/webhooks/telnyx/voice`
5. Check server logs: `pm2 logs white-label-pbx`

### AI Receptionist Not Answering

1. Verify `RETELL_API_KEY` and `RETELL_SIP_URI` in `.env`
2. Check the phone number's call handler is set to `retell_agent`
3. Verify the Retell agent is active (not paused/deleted)
4. Check Retell dashboard for errors or quota limits
5. Verify SIP connectivity between Telnyx and Retell

### Port Order Rejected

Common reasons:
- **Name mismatch** — Authorized name must exactly match current carrier records
- **Address mismatch** — Service address must match current carrier records
- **Account number wrong** — Verify with the customer
- **Numbers still under contract** — Customer may need to pay early termination fee

### Server Issues

```bash
# Check if app is running
pm2 status

# Check for errors
pm2 logs white-label-pbx --err --lines 50

# Check memory usage
pm2 monit

# Check nginx status
systemctl status nginx

# Check nginx error logs
tail -50 /var/log/nginx/error.log

# Restart everything
pm2 restart white-label-pbx
systemctl restart nginx
```

### Environment Variables Missing

If features aren't working, check that all required environment variables are set in `/opt/white-label-pbx/.env`:

```bash
# Check which vars are set
grep -v '^#' /opt/white-label-pbx/.env | grep -v '^$'
```

Key variables to verify:
- `DATABASE_URL` — Database connection
- `JWT_SECRET` — Authentication
- `TELNYX_API_KEY` — Carrier integration
- `TELNYX_SIP_CONNECTION_ID` — SIP trunking
- `WEBHOOK_URL` — Must be `https://kltconnect.com`
- `RETELL_API_KEY` — AI receptionist (if using)
- `RETELL_SIP_URI` — AI receptionist SIP (if using)

---

## Quick Reference: Complete Customer Setup Checklist

Use this checklist when onboarding a new customer:

- [ ] **Create customer** in Admin → Customers
- [ ] **Buy or port phone numbers** for the customer
- [ ] **Create SIP endpoints** for each phone/user
- [ ] **Register desk phones** with SIP credentials
- [ ] **Create ring groups** if multiple phones should ring
- [ ] **Set up call routes** for business hours / after hours
- [ ] **Configure AI receptionist** (optional)
- [ ] **Set notification preferences**
- [ ] **Configure recording retention** policy
- [ ] **Set up customer portal** branding
- [ ] **Test inbound calls** — verify routing works
- [ ] **Test outbound calls** — verify caller ID is correct
- [ ] **Share portal access** with the customer
