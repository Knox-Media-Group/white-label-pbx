import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  BookOpen, CheckCircle2, Circle, ArrowRight, Phone, Bot,
  Settings, Ship, Headphones, MessageSquare, Globe, Users,
} from "lucide-react";

function Step({ number, title, done, children }: { number: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-green-100 text-green-700" : "bg-primary text-primary-foreground"}`}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : number}
        </div>
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="pb-8 flex-1">
        <h3 className="font-semibold text-base mb-2">{title}</h3>
        <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

export default function Guide() {
  const telnyxStatus = trpc.telnyxApi.status.useQuery();
  const retellStatus = trpc.retellApi.status.useQuery();

  const telnyxOk = telnyxStatus.data?.configured ?? false;
  const retellOk = retellStatus.data?.configured ?? false;

  return (
    <AdminLayout title="Setup Guide">
      <div className="space-y-6 max-w-4xl">
        <div>
          <p className="text-sm text-muted-foreground">
            Complete walkthrough for setting up your PBX system with Telnyx and Retell AI.
          </p>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4 flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span className="text-sm">Telnyx</span>
              <Badge variant={telnyxOk ? "default" : "secondary"} className="ml-auto text-xs">
                {telnyxOk ? "Connected" : "Setup"}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4 flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="text-sm">Retell AI</span>
              <Badge variant={retellOk ? "default" : "secondary"} className="ml-auto text-xs">
                {retellOk ? "Connected" : "Setup"}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Activation Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Activation Guide
            </CardTitle>
            <CardDescription>
              Follow these steps to fully activate your PBX system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Step number={1} title="Configure Telnyx API Credentials" done={telnyxOk}>
              <p>Go to <a href="/admin/settings" className="text-primary underline">Settings</a> and enter your Telnyx credentials:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>API Key</strong> - From Telnyx Portal &gt; Auth &gt; API Keys (starts with KEY...)</li>
                <li><strong>SIP Connection ID</strong> - From Telnyx Portal &gt; SIP Trunking &gt; Connections</li>
                <li><strong>Messaging Profile ID</strong> - From Telnyx Portal &gt; Messaging &gt; Profiles (UUID format)</li>
                <li><strong>Webhook Secret</strong> - From your TeXML Application settings</li>
              </ul>
            </Step>

            <Step number={2} title="Configure Retell AI" done={retellOk}>
              <p>Go to <a href="/admin/settings" className="text-primary underline">Settings</a> and enter your Retell AI credentials:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>API Key</strong> - From Retell dashboard &gt; Settings (starts with key_...)</li>
                <li><strong>SIP URI</strong> - Your Retell SIP endpoint (e.g., sip:xxxxx.sip.livekit.cloud)</li>
              </ul>
            </Step>

            <Step number={3} title="Set Up Telnyx Webhooks">
              <p>In your Telnyx Portal, create or configure a TeXML Application with these webhook URLs:</p>
              <div className="bg-muted rounded p-3 font-mono text-xs space-y-1 mt-2">
                <p><strong>Voice URL:</strong> {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/voice</p>
                <p><strong>Status Callback:</strong> {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/status</p>
                <p><strong>Recording Callback:</strong> {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/recording</p>
              </div>
              <p className="mt-2">Then assign this TeXML Application to your SIP Connection in the Telnyx Portal.</p>
            </Step>

            <Step number={4} title="Set Up Retell AI Webhook">
              <p>In your Retell AI dashboard, set the webhook URL for each agent:</p>
              <div className="bg-muted rounded p-3 font-mono text-xs mt-2">
                <p><strong>Webhook URL:</strong> {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/retell</p>
              </div>
            </Step>

            <Step number={5} title="Create Your First Customer">
              <p>Go to <a href="/admin/customers" className="text-primary underline">Customers</a> and create a customer account:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Enter company name, email, and contact details</li>
                <li>The customer gets their own isolated PBX environment</li>
                <li>You can set portal login credentials for customer self-service</li>
              </ul>
            </Step>

            <Step number={6} title="Purchase Phone Numbers">
              <p>Go to <a href="/admin/phone-numbers" className="text-primary underline">Phone Numbers</a> to search and purchase numbers:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Search by area code, number pattern, or type (local/toll-free)</li>
                <li>Click a number to purchase it from Telnyx</li>
                <li>Numbers are automatically connected to your SIP trunk</li>
                <li>You can also send test SMS from owned numbers</li>
              </ul>
            </Step>

            <Step number={7} title="Create SIP Endpoints">
              <p>Go to <a href="/admin/sip-endpoints" className="text-primary underline">SIP Endpoints</a> to create extensions:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Each endpoint gets a SIP username/password for phone registration</li>
                <li>Assign an extension number for internal dialing</li>
                <li>Configure call handler (TeXML, Call Control, or AI Agent)</li>
                <li>SIP phones register to <strong>sip.telnyx.com</strong></li>
              </ul>
            </Step>

            <Step number={8} title="Set Up Ring Groups (Optional)">
              <p>In the customer portal, configure ring groups to distribute calls:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Add multiple endpoints as members</li>
                <li>Choose strategy: simultaneous, sequential, round-robin, or random</li>
                <li>Set ring timeout and failover action (voicemail, forward, hangup)</li>
              </ul>
            </Step>

            <Step number={9} title="Configure Call Routes">
              <p>In the customer portal, set up call routing rules:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Route calls to endpoints, ring groups, external numbers, voicemail, or AI agents</li>
                <li>Use caller ID matching, time-based routing, or DID-specific routing</li>
                <li>Set priority to control rule evaluation order</li>
              </ul>
            </Step>

            <Step number={10} title="Set Up AI Agents (Optional)">
              <p>Go to <a href="/admin/ai-agents" className="text-primary underline">AI Agents</a> to create Retell AI voice agents:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Create agents with custom voice and personality</li>
                <li>Assign agents to handle calls on specific phone numbers</li>
                <li>Agents can handle IVR, call routing, and customer service</li>
                <li>Call transcripts and summaries are stored automatically</li>
              </ul>
            </Step>

            <Step number={11} title="Port Existing Numbers (Optional)">
              <p>Go to <a href="/admin/porting" className="text-primary underline">Number Porting</a> to transfer numbers from another carrier:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Create a port order with the numbers you want to transfer</li>
                <li>Provide current carrier account details and service address</li>
                <li>Upload signed LOA (Letter of Authorization) and recent invoice</li>
                <li>Submit to Telnyx and track status until ported</li>
                <li>Typical porting takes 1-4 weeks depending on carrier</li>
              </ul>
            </Step>

            <Step number={12} title="Import from Viirtue (Optional)">
              <p>Go to <a href="/admin/import" className="text-primary underline">Import</a> to migrate from a Viirtue PBX:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Enter your Viirtue API credentials</li>
                <li>Preview extensions, phone numbers, and call queues</li>
                <li>Import creates matching SIP endpoints, phone numbers, and ring groups</li>
                <li>Then use Number Porting to transfer the numbers to Telnyx</li>
              </ul>
            </Step>
          </CardContent>
        </Card>

        {/* Testing Checklist */}
        <Card>
          <CardHeader>
            <CardTitle>Testing Checklist</CardTitle>
            <CardDescription>Verify everything works end-to-end</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                "Telnyx API status shows Connected in Settings",
                "Phone number search returns results",
                "Purchased phone number appears in Telnyx account",
                "SIP endpoint credentials work with a SIP phone/softphone",
                "Inbound call to purchased number rings the assigned endpoint",
                "Ring group distributes calls to all members",
                "Call route rules match correctly (time-based, caller ID, etc.)",
                "Call recordings appear after completed calls",
                "SMS can be sent from owned phone numbers",
                "Retell AI agent answers calls when assigned to a number",
                "Customer portal login works and shows correct data",
                "Branding changes reflect in customer portal",
              ].map((item, i) => (
                <label key={i} className="flex items-center gap-3 text-sm">
                  <input type="checkbox" className="rounded" />
                  {item}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* SIP Phone Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>SIP Phone Configuration</CardTitle>
            <CardDescription>Settings for connecting SIP phones and softphones</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded p-4 font-mono text-xs space-y-2">
              <p><strong>SIP Server / Registrar:</strong> sip.telnyx.com</p>
              <p><strong>Port:</strong> 5060 (UDP/TCP) or 5061 (TLS)</p>
              <p><strong>Transport:</strong> UDP, TCP, or TLS</p>
              <p><strong>Username:</strong> (from SIP Endpoint credentials)</p>
              <p><strong>Password:</strong> (from SIP Endpoint credentials)</p>
              <p><strong>Auth Username:</strong> (same as username)</p>
              <p><strong>Outbound Proxy:</strong> sip.telnyx.com</p>
              <p><strong>STUN Server:</strong> stun.telnyx.com:3478</p>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Compatible with any standard SIP phone, softphone app (Zoiper, Linphone, MicroSIP), or WebRTC client.
            </p>
          </CardContent>
        </Card>

        {/* Architecture Overview */}
        <Card>
          <CardHeader>
            <CardTitle>System Architecture</CardTitle>
            <CardDescription>How the components work together</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded p-4 font-mono text-xs leading-relaxed whitespace-pre">{`
  Inbound Call Flow:
  ==================
  Caller --> Telnyx SIP Trunk --> TeXML Webhook (/api/webhooks/voice)
                                      |
                              Check phone number DB
                              Check call route rules
                                      |
                          +-----------+-----------+
                          |           |           |
                      Endpoint   Ring Group   AI Agent
                     (SIP dial)  (multi-dial) (Retell AI)
                          |           |           |
                      SIP Phone   All phones   AI handles
                       rings       ring         the call
                          |           |           |
                      Call ends --> Status webhook --> Usage stats
                                --> Recording webhook --> S3 + SMS summary

  SMS Flow:
  =========
  Admin UI --> tRPC --> Telnyx Messages API --> Recipient
  Telnyx --> Messaging webhook --> (future: inbound SMS handling)

  Number Porting Flow:
  ====================
  Create Draft --> POST /porting_orders (phone numbers only)
  Add Details  --> PATCH /porting_orders/{id} (end-user info + documents)
  Upload Docs  --> POST /documents (LOA + invoice PDFs)
  Submit       --> POST /porting_orders/{id}/actions/confirm
  Monitor      --> GET /porting_orders/{id} (poll status)
  Complete     --> Status: ported (calls now route via Telnyx)
`}</div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
