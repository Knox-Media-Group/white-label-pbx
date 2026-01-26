import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Key, Globe } from "lucide-react";
import { toast } from "sonner";

export default function AdminSettings() {
  return (
    <AdminLayout title="Settings">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              SignalWire API Configuration
            </CardTitle>
            <CardDescription>
              Configure your master SignalWire account credentials for managing subprojects
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="projectId">Project ID</Label>
                <Input
                  id="projectId"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="apiToken">API Token</Label>
                <Input
                  id="apiToken"
                  type="password"
                  placeholder="PT..."
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="spaceUrl">Space URL</Label>
                <Input
                  id="spaceUrl"
                  placeholder="your-space.signalwire.com"
                />
              </div>
            </div>
            <Button onClick={() => toast.info("Feature coming soon")}>
              Save API Configuration
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
                  This is your webhook endpoint for SignalWire call events
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
