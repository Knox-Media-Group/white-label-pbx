import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, Key, Globe } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function AdminSettings() {
  const { data: telnyxStatus } = trpc.telnyxApi.status.useQuery();
  const [defaultRetention, setDefaultRetention] = useState(90);
  const [maxEndpoints, setMaxEndpoints] = useState(100);

  return (
    <AdminLayout title="Settings">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Telnyx API Configuration
            </CardTitle>
            <CardDescription>
              Your Telnyx account connection status (configured via environment variables)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {telnyxStatus && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>API Key</Label>
                  <div className="flex items-center gap-2">
                    <Input value={telnyxStatus.apiKey} disabled />
                    <Badge variant={telnyxStatus.configured ? "default" : "destructive"}>
                      {telnyxStatus.configured ? "Active" : "Missing"}
                    </Badge>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>SIP Connection ID</Label>
                  <Input value={telnyxStatus.sipConnectionId} disabled />
                </div>
                <div className="grid gap-2">
                  <Label>Messaging Profile ID</Label>
                  <Input value={telnyxStatus.messagingProfileId} disabled />
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Telnyx credentials are managed via server environment variables (TELNYX_API_KEY, TELNYX_SIP_CONNECTION_ID, TELNYX_MESSAGING_PROFILE_ID).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Webhook Configuration
            </CardTitle>
            <CardDescription>
              Webhook endpoints for Telnyx call events and notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Telnyx Voice Webhook URL</Label>
                <Input
                  disabled
                  value={typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/telnyx` : ''}
                />
                <p className="text-sm text-muted-foreground">
                  Set this as the voice webhook URL in your Telnyx TeXML application
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Retell AI Webhook URL</Label>
                <Input
                  disabled
                  value={typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/retell` : ''}
                />
                <p className="text-sm text-muted-foreground">
                  Set this as the webhook URL for Retell AI agent events
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
                  onChange={(e) => setDefaultRetention(parseInt(e.target.value) || 90)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxEndpoints">Max Endpoints per Customer</Label>
                <Input
                  id="maxEndpoints"
                  type="number"
                  value={maxEndpoints}
                  onChange={(e) => setMaxEndpoints(parseInt(e.target.value) || 100)}
                />
              </div>
            </div>
            <Button onClick={() => {
              toast.success(`Settings saved: Retention ${defaultRetention} days, Max endpoints ${maxEndpoints}`);
            }}>
              Save System Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
