import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Key, Globe, Bot } from "lucide-react";
import { toast } from "sonner";

export default function AdminSettings() {
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
              Configure your Telnyx account credentials for managing voice and messaging services
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="telnyxApiKey">Telnyx API Key</Label>
                <Input
                  id="telnyxApiKey"
                  type="password"
                  placeholder="KEY..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="telnyxApiSecret">Telnyx API Secret</Label>
                <Input
                  id="telnyxApiSecret"
                  type="password"
                  placeholder="your-api-secret"
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="telnyxConnectionId">Telnyx SIP Connection ID</Label>
                <Input
                  id="telnyxConnectionId"
                  placeholder="your-sip-connection-id"
                />
              </div>
            </div>
            <Button onClick={() => toast.info("Feature coming soon")}>
              Save Telnyx Configuration
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Retell.ai Configuration
            </CardTitle>
            <CardDescription>
              Configure your Retell.ai credentials for AI-powered voice agents and call handling
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="retellApiKey">Retell API Key</Label>
                <Input
                  id="retellApiKey"
                  type="password"
                  placeholder="your-retell-api-key"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="retellAgentId">Default Agent ID</Label>
                <Input
                  id="retellAgentId"
                  placeholder="agent_xxxxxxxxxxxxxxxx"
                />
              </div>
            </div>
            <Button onClick={() => toast.info("Feature coming soon")}>
              Save Retell.ai Configuration
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Webhook Configuration
            </CardTitle>
            <CardDescription>
              Configure webhook endpoints for call events and notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="webhookUrl">Webhook Base URL</Label>
                <Input
                  id="webhookUrl"
                  placeholder="https://your-domain.com/api/webhooks"
                  disabled
                  value={typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks` : ''}
                />
                <p className="text-sm text-muted-foreground">
                  This is your webhook endpoint for Telnyx and Retell.ai call events
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
                  defaultValue={90}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="maxEndpoints">Max Endpoints per Customer</Label>
                <Input
                  id="maxEndpoints"
                  type="number"
                  defaultValue={100}
                />
              </div>
            </div>
            <Button onClick={() => toast.info("Feature coming soon")}>
              Save System Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
