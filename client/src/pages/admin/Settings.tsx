import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, Key, Globe, Bot } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";

const SETTING_KEYS = [
  "telnyx_api_key",
  "telnyx_sip_connection_id",
  "retell_api_key",
  "default_retention_days",
  "max_endpoints_per_customer",
];

export default function AdminSettings() {
  const [telnyxApiKey, setTelnyxApiKey] = useState("");
  const [telnyxSipConnectionId, setTelnyxSipConnectionId] = useState("");
  const [retellApiKey, setRetellApiKey] = useState("");
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
      if (d.retell_api_key) setRetellApiKey(d.retell_api_key);
      if (d.default_retention_days) setDefaultRetention(d.default_retention_days);
      if (d.max_endpoints_per_customer) setMaxEndpoints(d.max_endpoints_per_customer);
    }
  }, [settingsQuery.data]);

  function saveTelnyxConfig() {
    saveMutation.mutate({
      settings: {
        telnyx_api_key: telnyxApiKey || null,
        telnyx_sip_connection_id: telnyxSipConnectionId || null,
      },
    });
  }

  function saveRetellConfig() {
    saveMutation.mutate({
      settings: {
        retell_api_key: retellApiKey || null,
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
              Configure your Telnyx account credentials for managing telephony
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
                  placeholder="xxxxxxxxxxxxxxxx"
                  value={telnyxSipConnectionId}
                  onChange={(e) => setTelnyxSipConnectionId(e.target.value)}
                />
              </div>
            </div>
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
            <div className="grid gap-4">
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
            </div>
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
              Webhook Configuration
            </CardTitle>
            <CardDescription>
              Webhook endpoints for call events and notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Telnyx Webhook URL</Label>
                <Input
                  disabled
                  value={typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/voice` : ""}
                />
                <p className="text-xs text-muted-foreground">
                  Configure this URL as the Voice webhook in your Telnyx TeXML Application settings.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Retell AI Webhook URL</Label>
                <Input
                  disabled
                  value={typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/retell` : ""}
                />
                <p className="text-xs text-muted-foreground">
                  Set this as the webhook URL when creating Retell agents, or as account-level webhook in the Retell dashboard.
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
      </div>
    </AdminLayout>
  );
}
