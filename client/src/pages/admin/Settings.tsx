import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings as SettingsIcon, Key, Globe, Bot, MessageSquare, Phone, Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";

const SETTING_KEYS = [
  "telnyx_api_key",
  "telnyx_sip_connection_id",
  "telnyx_messaging_profile_id",
  "telnyx_webhook_secret",
  "retell_api_key",
  "retell_sip_uri",
  "default_retention_days",
  "max_endpoints_per_customer",
];

export default function AdminSettings() {
  const [telnyxApiKey, setTelnyxApiKey] = useState("");
  const [telnyxSipConnectionId, setTelnyxSipConnectionId] = useState("");
  const [telnyxMsgProfileId, setTelnyxMsgProfileId] = useState("");
  const [telnyxWebhookSecret, setTelnyxWebhookSecret] = useState("");
  const [retellApiKey, setRetellApiKey] = useState("");
  const [retellSipUri, setRetellSipUri] = useState("");
  const [defaultRetention, setDefaultRetention] = useState("90");
  const [maxEndpoints, setMaxEndpoints] = useState("100");

  const settingsQuery = trpc.settings.get.useQuery({ keys: SETTING_KEYS });
  const saveMutation = trpc.settings.save.useMutation({
    onSuccess: () => {
      toast.success("Settings saved successfully");
      settingsQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const telnyxStatus = trpc.telnyxApi.status.useQuery();
  const retellStatus = trpc.retellApi.status.useQuery();

  // Load saved settings
  useEffect(() => {
    if (settingsQuery.data) {
      const d = settingsQuery.data;
      if (d.telnyx_api_key) setTelnyxApiKey(d.telnyx_api_key);
      if (d.telnyx_sip_connection_id) setTelnyxSipConnectionId(d.telnyx_sip_connection_id);
      if (d.telnyx_messaging_profile_id) setTelnyxMsgProfileId(d.telnyx_messaging_profile_id);
      if (d.telnyx_webhook_secret) setTelnyxWebhookSecret(d.telnyx_webhook_secret);
      if (d.retell_api_key) setRetellApiKey(d.retell_api_key);
      if (d.retell_sip_uri) setRetellSipUri(d.retell_sip_uri);
      if (d.default_retention_days) setDefaultRetention(d.default_retention_days);
      if (d.max_endpoints_per_customer) setMaxEndpoints(d.max_endpoints_per_customer);
    }
  }, [settingsQuery.data]);

  function saveTelnyxConfig() {
    saveMutation.mutate({
      settings: {
        telnyx_api_key: telnyxApiKey || null,
        telnyx_sip_connection_id: telnyxSipConnectionId || null,
        telnyx_messaging_profile_id: telnyxMsgProfileId || null,
        telnyx_webhook_secret: telnyxWebhookSecret || null,
      },
    });
  }

  function saveRetellConfig() {
    saveMutation.mutate({
      settings: {
        retell_api_key: retellApiKey || null,
        retell_sip_uri: retellSipUri || null,
      },
    });
  }

  function saveSystemSettings() {
    saveMutation.mutate({
      settings: {
        default_retention_days: defaultRetention || null,
        max_endpoints_per_customer: maxEndpoints || null,
      },
    });
  }

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <AdminLayout title="Settings">
      <div className="space-y-6">
        {/* Telnyx Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Telnyx API Configuration
              <Badge variant={telnyxStatus.data?.configured ? "default" : "secondary"} className="ml-2">
                {telnyxStatus.data?.configured ? "Connected" : "Not Configured"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Configure your Telnyx account credentials for voice, SMS, and number management
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="KEY..."
                  value={telnyxApiKey}
                  onChange={(e) => setTelnyxApiKey(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sipConnectionId">SIP Connection ID</Label>
                <Input
                  id="sipConnectionId"
                  placeholder="28977960258..."
                  value={telnyxSipConnectionId}
                  onChange={(e) => setTelnyxSipConnectionId(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="msgProfileId">Messaging Profile ID</Label>
                <Input
                  id="msgProfileId"
                  placeholder="40019c6f-131e-..."
                  value={telnyxMsgProfileId}
                  onChange={(e) => setTelnyxMsgProfileId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Required for SMS. Found in Telnyx Portal under Messaging &gt; Profiles.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="webhookSecret">Webhook Secret</Label>
                <Input
                  id="webhookSecret"
                  type="password"
                  placeholder="fRT5A1py..."
                  value={telnyxWebhookSecret}
                  onChange={(e) => setTelnyxWebhookSecret(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Used to verify incoming Telnyx webhooks.
                </p>
              </div>
            </div>
            {telnyxStatus.data?.configured && (
              <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 rounded p-3">
                <p><span className="font-medium">API Key:</span> {telnyxStatus.data.apiKey}</p>
                <p><span className="font-medium">SIP Connection:</span> {telnyxStatus.data.sipConnectionId}</p>
                <p><span className="font-medium">Messaging Profile:</span> {(telnyxStatus.data as any).messagingProfileId || "Not set"}</p>
                <p><span className="font-medium">SIP Domain:</span> {(telnyxStatus.data as any).sipDomain || "sip.telnyx.com"}</p>
              </div>
            )}
            <Button onClick={saveTelnyxConfig} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Telnyx Configuration"}
            </Button>
          </CardContent>
        </Card>

        {/* Retell AI Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Retell AI Configuration
              <Badge variant={retellStatus.data?.configured ? "default" : "secondary"} className="ml-2">
                {retellStatus.data?.configured ? "Connected" : "Not Configured"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Configure your Retell AI account for AI-powered voice agents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="retellApiKey">Retell API Key</Label>
                <Input
                  id="retellApiKey"
                  type="password"
                  placeholder="key_..."
                  value={retellApiKey}
                  onChange={(e) => setRetellApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Find your API key in the Retell AI dashboard under Settings.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="retellSipUri">Retell SIP URI</Label>
                <Input
                  id="retellSipUri"
                  placeholder="sip:xxxxx.sip.livekit.cloud"
                  value={retellSipUri}
                  onChange={(e) => setRetellSipUri(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The SIP endpoint Retell uses for call routing. Found in Retell dashboard.
                </p>
              </div>
            </div>
            {retellStatus.data?.configured && (
              <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 rounded p-3">
                <p><span className="font-medium">API Key:</span> {retellStatus.data.apiKey}</p>
                <p><span className="font-medium">SIP URI:</span> {(retellStatus.data as any).sipUri || "Not set"}</p>
              </div>
            )}
            <Button onClick={saveRetellConfig} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Retell Configuration"}
            </Button>
          </CardContent>
        </Card>

        {/* Webhook Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Webhook Endpoints
            </CardTitle>
            <CardDescription>
              Configure these URLs in your Telnyx and Retell dashboards to receive events
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Voice Webhook (Telnyx TeXML)</Label>
                <Input disabled value={`${baseUrl}/api/webhooks/voice`} />
                <p className="text-xs text-muted-foreground">
                  Set as the Voice URL in your Telnyx TeXML Application. Handles inbound call routing.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Call Status Webhook</Label>
                <Input disabled value={`${baseUrl}/api/webhooks/status`} />
                <p className="text-xs text-muted-foreground">
                  Set as the Status Callback URL. Tracks call completion and updates usage stats.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Recording Webhook</Label>
                <Input disabled value={`${baseUrl}/api/webhooks/recording`} />
                <p className="text-xs text-muted-foreground">
                  Set as the Recording Status Callback. Processes completed recordings and triggers SMS summaries.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Retell AI Webhook</Label>
                <Input disabled value={`${baseUrl}/api/webhooks/retell`} />
                <p className="text-xs text-muted-foreground">
                  Set in the Retell dashboard under Agent settings or account-level webhook.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              System Settings
            </CardTitle>
            <CardDescription>
              General system configuration options
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="defaultRetention">Default Recording Retention (days)</Label>
                <Input
                  id="defaultRetention"
                  type="number"
                  value={defaultRetention}
                  onChange={(e) => setDefaultRetention(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxEndpoints">Max Endpoints per Customer</Label>
                <Input
                  id="maxEndpoints"
                  type="number"
                  value={maxEndpoints}
                  onChange={(e) => setMaxEndpoints(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={saveSystemSettings} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save System Settings"}
            </Button>
          </CardContent>
        </Card>
        {/* Service Plans Management */}
        <ServicePlansManager />
      </div>
    </AdminLayout>
  );
}

function ServicePlansManager() {
  const { data: plans, refetch } = trpc.servicePlans.list.useQuery();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPlan, setNewPlan] = useState({
    name: "", description: "", monthlyPrice: "0",
    includedMinutes: "0", includedNumbers: "1", includedEndpoints: "5", includedSms: "0",
  });

  const createMutation = trpc.servicePlans.create.useMutation({
    onSuccess: () => { toast.success("Plan created"); setIsCreateOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.servicePlans.delete.useMutation({
    onSuccess: () => { toast.success("Plan deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Service Plans
            </CardTitle>
            <CardDescription>Manage pricing tiers for customer accounts</CardDescription>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Plan
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Price/mo</TableHead>
              <TableHead>Minutes</TableHead>
              <TableHead>Numbers</TableHead>
              <TableHead>Endpoints</TableHead>
              <TableHead>SMS</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans?.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell className="font-medium">{plan.name}</TableCell>
                <TableCell>${((plan.monthlyPrice || 0) / 100).toFixed(2)}</TableCell>
                <TableCell>{plan.includedMinutes || 0}</TableCell>
                <TableCell>{plan.includedNumbers || 0}</TableCell>
                <TableCell>{plan.includedEndpoints || 0}</TableCell>
                <TableCell>{plan.includedSms || 0}</TableCell>
                <TableCell>
                  <Badge variant={plan.isActive ? "default" : "secondary"}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm("Delete this plan?")) deleteMutation.mutate({ id: plan.id });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(!plans || plans.length === 0) && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No plans configured. Create your first service plan.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Service Plan</DialogTitle>
            <DialogDescription>Define a new pricing tier for customers</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Plan Name</Label>
              <Input value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} placeholder="e.g. Basic, Pro, Enterprise" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input value={newPlan.description} onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })} placeholder="Short description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Monthly Price (cents)</Label>
                <Input type="number" value={newPlan.monthlyPrice} onChange={(e) => setNewPlan({ ...newPlan, monthlyPrice: e.target.value })} />
                <p className="text-xs text-muted-foreground">${(parseInt(newPlan.monthlyPrice || "0") / 100).toFixed(2)}/mo</p>
              </div>
              <div className="grid gap-2">
                <Label>Included Minutes</Label>
                <Input type="number" value={newPlan.includedMinutes} onChange={(e) => setNewPlan({ ...newPlan, includedMinutes: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Included Numbers</Label>
                <Input type="number" value={newPlan.includedNumbers} onChange={(e) => setNewPlan({ ...newPlan, includedNumbers: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Included Endpoints</Label>
                <Input type="number" value={newPlan.includedEndpoints} onChange={(e) => setNewPlan({ ...newPlan, includedEndpoints: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Included SMS</Label>
                <Input type="number" value={newPlan.includedSms} onChange={(e) => setNewPlan({ ...newPlan, includedSms: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!newPlan.name || createMutation.isPending}
              onClick={() => createMutation.mutate({
                name: newPlan.name,
                description: newPlan.description || undefined,
                monthlyPrice: parseInt(newPlan.monthlyPrice) || 0,
                includedMinutes: parseInt(newPlan.includedMinutes) || 0,
                includedNumbers: parseInt(newPlan.includedNumbers) || 1,
                includedEndpoints: parseInt(newPlan.includedEndpoints) || 5,
                includedSms: parseInt(newPlan.includedSms) || 0,
              })}
            >
              {createMutation.isPending ? "Creating..." : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
