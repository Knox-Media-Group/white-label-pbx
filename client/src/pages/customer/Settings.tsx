import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Settings as SettingsIcon, Bell, Shield, Key, MessageSquare, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Separator } from "@/components/ui/separator";

const DEMO_CUSTOMER_ID = 1;

export default function CustomerSettings() {
  const { user } = useAuth();
  const customerId = user?.customerId || DEMO_CUSTOMER_ID;
  
  const { data: customer, isLoading: customerLoading, refetch: refetchCustomer } = trpc.customers.getById.useQuery(
    { id: customerId },
    { enabled: !!customerId }
  );
  
  const { data: notifications, isLoading, refetch } = trpc.notifications.unread.useQuery({ customerId });
  
  const markReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const updateCustomerMutation = trpc.customers.update.useMutation({
    onSuccess: () => {
      toast.success("Settings saved successfully");
      refetchCustomer();
    },
    onError: (error) => {
      toast.error("Failed to save settings: " + error.message);
    },
  });

  const [notificationSettings, setNotificationSettings] = useState({
    missedCalls: true,
    voicemail: true,
    highVolume: true,
    recordingReady: true,
  });

  // SMS Summary settings
  const [smsSummaryEnabled, setSmsSummaryEnabled] = useState(true);
  const [notificationPhone, setNotificationPhone] = useState("");

  // Load customer settings when data is available
  useEffect(() => {
    if (customer) {
      setSmsSummaryEnabled(customer.smsSummaryEnabled !== false);
      setNotificationPhone(customer.notificationPhone || "");
    }
  }, [customer]);

  const handleSaveSmsSummarySettings = () => {
    updateCustomerMutation.mutate({
      id: customerId,
      smsSummaryEnabled,
      notificationPhone: notificationPhone || undefined,
    });
  };

  return (
    <CustomerLayout title="Settings">
      <div className="space-y-6">
        {/* SMS Call Summary Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              SMS Call Summaries
            </CardTitle>
            <CardDescription>
              Receive AI-generated summaries of your calls via SMS after each call ends
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {customerLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="smsSummary">Enable SMS Summaries</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically send a summary of each call via SMS when it ends
                    </p>
                  </div>
                  <Switch
                    id="smsSummary"
                    checked={smsSummaryEnabled}
                    onCheckedChange={setSmsSummaryEnabled}
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="notificationPhone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Notification Phone Number
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Phone number to receive SMS summaries (leave blank to use caller's number)
                  </p>
                  <Input
                    id="notificationPhone"
                    type="tel"
                    placeholder="+1234567890"
                    value={notificationPhone}
                    onChange={(e) => setNotificationPhone(e.target.value)}
                    disabled={!smsSummaryEnabled}
                  />
                </div>
                <Button 
                  onClick={handleSaveSmsSummarySettings}
                  disabled={updateCustomerMutation.isPending}
                >
                  {updateCustomerMutation.isPending ? "Saving..." : "Save SMS Settings"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              In-App Notifications
            </CardTitle>
            <CardDescription>
              Configure how you receive notifications about call events
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="missedCalls">Missed Call Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when a call goes unanswered
                  </p>
                </div>
                <Switch
                  id="missedCalls"
                  checked={notificationSettings.missedCalls}
                  onCheckedChange={(checked) => 
                    setNotificationSettings({ ...notificationSettings, missedCalls: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="voicemail">Voicemail Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when a new voicemail is received
                  </p>
                </div>
                <Switch
                  id="voicemail"
                  checked={notificationSettings.voicemail}
                  onCheckedChange={(checked) => 
                    setNotificationSettings({ ...notificationSettings, voicemail: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="highVolume">High Call Volume Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when call volume exceeds normal levels
                  </p>
                </div>
                <Switch
                  id="highVolume"
                  checked={notificationSettings.highVolume}
                  onCheckedChange={(checked) => 
                    setNotificationSettings({ ...notificationSettings, highVolume: checked })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="recordingReady">Recording Ready</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when a call recording is ready for playback
                  </p>
                </div>
                <Switch
                  id="recordingReady"
                  checked={notificationSettings.recordingReady}
                  onCheckedChange={(checked) => 
                    setNotificationSettings({ ...notificationSettings, recordingReady: checked })
                  }
                />
              </div>
            </div>
            <Button onClick={() => toast.info("Notification settings saved")}>
              Save Notification Settings
            </Button>
          </CardContent>
        </Card>

        {/* Recent Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Notifications</CardTitle>
            <CardDescription>
              Your unread notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="space-y-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="flex items-start justify-between p-4 border rounded-lg hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium">{notification.title}</p>
                      <p className="text-sm text-muted-foreground">{notification.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(notification.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markReadMutation.mutate({ id: notification.id })}
                    >
                      Mark Read
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No unread notifications
              </p>
            )}
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>
              Manage your account security settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security to your account
                </p>
              </div>
              <Button variant="outline" onClick={() => toast.info("Feature coming soon")}>
                Enable 2FA
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">API Access</p>
                <p className="text-sm text-muted-foreground">
                  Manage API keys for programmatic access
                </p>
              </div>
              <Button variant="outline" onClick={() => toast.info("Feature coming soon")}>
                <Key className="mr-2 h-4 w-4" />
                Manage Keys
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
