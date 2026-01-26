import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Phone, Plus, Trash2, Settings, Loader2, Copy, Eye, EyeOff } from "lucide-react";

export default function AdminSipEndpoints() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [newEndpoint, setNewEndpoint] = useState({
    username: "",
    password: "",
    callerId: "",
    callerIdName: "",
    callHandler: "laml_webhooks" as const,
    callRequestUrl: "",
  });

  const { data: endpoints, isLoading, refetch } = trpc.signalwireApi.listSipEndpoints.useQuery();
  const { data: signalwireStatus } = trpc.signalwireApi.status.useQuery();

  const createEndpoint = trpc.signalwireApi.createSipEndpoint.useMutation({
    onSuccess: () => {
      toast.success("SIP endpoint created successfully!");
      setIsCreateDialogOpen(false);
      setNewEndpoint({
        username: "",
        password: "",
        callerId: "",
        callerIdName: "",
        callHandler: "laml_webhooks",
        callRequestUrl: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to create endpoint: ${error.message}`);
    },
  });

  const deleteEndpoint = trpc.signalwireApi.deleteSipEndpoint.useMutation({
    onSuccess: () => {
      toast.success("SIP endpoint deleted successfully!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to delete endpoint: ${error.message}`);
    },
  });

  const handleCreate = () => {
    if (!newEndpoint.username || !newEndpoint.password) {
      toast.error("Username and password are required");
      return;
    }
    if (newEndpoint.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    createEndpoint.mutate(newEndpoint);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this SIP endpoint? This action cannot be undone.")) {
      deleteEndpoint.mutate({ id });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    let password = "";
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewEndpoint({ ...newEndpoint, password });
  };

  const togglePasswordVisibility = (id: string) => {
    setShowPasswords({ ...showPasswords, [id]: !showPasswords[id] });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">SIP Endpoints</h1>
            <p className="text-muted-foreground">Manage SignalWire SIP endpoints for your customers</p>
          </div>
          <div className="flex items-center gap-4">
            {signalwireStatus && (
              <Badge variant={signalwireStatus.configured ? "default" : "destructive"}>
                SignalWire: {signalwireStatus.configured ? "Connected" : "Not Configured"}
              </Badge>
            )}
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Endpoint
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              SignalWire SIP Endpoints
            </CardTitle>
            <CardDescription>
              SIP endpoints registered in your SignalWire account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : endpoints?.data?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Caller ID</TableHead>
                    <TableHead>Call Handler</TableHead>
                    <TableHead>SIP URI</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endpoints.data.map((endpoint: any) => (
                    <TableRow key={endpoint.id}>
                      <TableCell className="font-mono font-medium">
                        {endpoint.username}
                      </TableCell>
                      <TableCell>
                        {endpoint.caller_id_name || endpoint.caller_id || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{endpoint.call_handler || "laml_webhooks"}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[200px]">
                            {endpoint.username}@{signalwireStatus?.spaceUrl}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(`${endpoint.username}@${signalwireStatus?.spaceUrl}`)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon">
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(endpoint.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No SIP endpoints found</p>
                <p className="text-sm">Create an endpoint to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create SIP Endpoint</DialogTitle>
              <DialogDescription>
                Create a new SIP endpoint in your SignalWire account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Username *</Label>
                <Input
                  placeholder="e.g., extension101"
                  value={newEndpoint.username}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPasswords["new"] ? "text" : "password"}
                      placeholder="Min 8 characters"
                      value={newEndpoint.password}
                      onChange={(e) => setNewEndpoint({ ...newEndpoint, password: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => togglePasswordVisibility("new")}
                    >
                      {showPasswords["new"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" onClick={generatePassword}>
                    Generate
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Caller ID Number</Label>
                <Input
                  placeholder="e.g., +15551234567"
                  value={newEndpoint.callerId}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, callerId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Caller ID Name</Label>
                <Input
                  placeholder="e.g., John Smith"
                  value={newEndpoint.callerIdName}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, callerIdName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Call Handler</Label>
                <Select
                  value={newEndpoint.callHandler}
                  onValueChange={(v) => setNewEndpoint({ ...newEndpoint, callHandler: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="laml_webhooks">LaML Webhooks</SelectItem>
                    <SelectItem value="relay_context">Relay Context</SelectItem>
                    <SelectItem value="relay_topic">Relay Topic</SelectItem>
                    <SelectItem value="ai_agent">AI Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newEndpoint.callHandler === "laml_webhooks" && (
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <Input
                    placeholder="https://your-server.com/api/webhooks/voice"
                    value={newEndpoint.callRequestUrl}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, callRequestUrl: e.target.value })}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createEndpoint.isPending}>
                {createEndpoint.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Create Endpoint
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
