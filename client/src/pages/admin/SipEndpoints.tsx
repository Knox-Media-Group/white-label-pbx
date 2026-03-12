import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Phone, Plus, Trash2, Loader2, Copy, Eye, EyeOff } from "lucide-react";

export default function AdminSipEndpoints() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [newEndpoint, setNewEndpoint] = useState({
    connection_name: "",
    user_name: "",
    password: "",
  });

  const { data: telnyxStatus } = trpc.telnyxApi.status.useQuery();
  const { data: connections, isLoading, refetch } = trpc.telnyxApi.listCredentialConnections.useQuery();

  const createConnection = trpc.telnyxApi.createCredentialConnection.useMutation({
    onSuccess: () => {
      toast.success("SIP credential connection created successfully!");
      setIsCreateDialogOpen(false);
      setNewEndpoint({ connection_name: "", user_name: "", password: "" });
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to create connection: ${error.message}`);
    },
  });

  const deleteConnection = trpc.telnyxApi.deleteCredentialConnection.useMutation({
    onSuccess: () => {
      toast.success("Credential connection deleted successfully!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to delete connection: ${error.message}`);
    },
  });

  const handleCreate = () => {
    if (!newEndpoint.user_name || !newEndpoint.password) {
      toast.error("Username and password are required");
      return;
    }
    if (newEndpoint.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    createConnection.mutate({
      connection_name: newEndpoint.connection_name || newEndpoint.user_name,
      user_name: newEndpoint.user_name,
      password: newEndpoint.password,
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this credential connection? This action cannot be undone.")) {
      deleteConnection.mutate({ id });
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
            <p className="text-muted-foreground">Manage Telnyx credential connections for your customers</p>
          </div>
          <div className="flex items-center gap-4">
            {telnyxStatus && (
              <Badge variant={telnyxStatus.configured ? "default" : "destructive"}>
                Telnyx: {telnyxStatus.configured ? "Connected" : "Not Configured"}
              </Badge>
            )}
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Connection
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Telnyx Credential Connections
            </CardTitle>
            <CardDescription>
              SIP credential connections registered in your Telnyx account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : connections?.data?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Connection Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>SIP URI</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connections.data.map((conn: any) => (
                    <TableRow key={conn.id}>
                      <TableCell className="font-medium">
                        {conn.connection_name || conn.user_name}
                      </TableCell>
                      <TableCell className="font-mono">
                        {conn.user_name}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[250px]">
                            {conn.sip_uri || `sip:${conn.user_name}@sip.telnyx.com`}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(conn.sip_uri || `sip:${conn.user_name}@sip.telnyx.com`)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={conn.active !== false ? "default" : "outline"}>
                          {conn.active !== false ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(conn.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No credential connections found</p>
                <p className="text-sm">Create a connection to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Credential Connection</DialogTitle>
              <DialogDescription>
                Create a new SIP credential connection in your Telnyx account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Connection Name</Label>
                <Input
                  placeholder="e.g., Office Main Line"
                  value={newEndpoint.connection_name}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, connection_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Username *</Label>
                <Input
                  placeholder="e.g., extension101"
                  value={newEndpoint.user_name}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, user_name: e.target.value })}
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createConnection.isPending}>
                {createConnection.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Create Connection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
