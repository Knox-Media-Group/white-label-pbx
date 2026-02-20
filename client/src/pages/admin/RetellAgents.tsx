import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Bot, Plus, Trash2, RefreshCw, Phone, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

export default function AdminRetellAgents() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>();
  const [newAgent, setNewAgent] = useState({
    agentName: "",
    voiceId: "",
    language: "en-US",
  });

  const retellStatus = trpc.retellApi.status.useQuery();
  const customers = trpc.customers.list.useQuery();
  const agents = trpc.retellApi.listAgents.useQuery(
    selectedCustomerId ? { customerId: selectedCustomerId } : undefined
  );
  const remoteAgents = trpc.retellApi.listRemoteAgents.useQuery(undefined, {
    enabled: retellStatus.data?.configured === true,
  });

  const createAgent = trpc.retellApi.createAgent.useMutation({
    onSuccess: () => {
      toast.success("Agent created successfully");
      agents.refetch();
      remoteAgents.refetch();
      setCreateOpen(false);
      setNewAgent({ agentName: "", voiceId: "", language: "en-US" });
    },
    onError: (err) => toast.error(`Failed to create agent: ${err.message}`),
  });

  const deleteAgent = trpc.retellApi.deleteAgent.useMutation({
    onSuccess: () => {
      toast.success("Agent deleted");
      agents.refetch();
      remoteAgents.refetch();
    },
    onError: (err) => toast.error(`Failed to delete: ${err.message}`),
  });

  const isConfigured = retellStatus.data?.configured;

  return (
    <AdminLayout title="AI Agents (Retell)">
      <div className="space-y-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Retell AI Status
            </CardTitle>
            <CardDescription>
              Manage AI voice agents powered by Retell.ai
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Badge variant={isConfigured ? "default" : "secondary"}>
                {isConfigured ? "Connected" : "Not Configured"}
              </Badge>
              {!isConfigured && (
                <p className="text-sm text-muted-foreground">
                  Configure your Retell API key in Settings to get started.
                </p>
              )}
              {isConfigured && (
                <p className="text-sm text-muted-foreground">
                  API Key: {retellStatus.data?.apiKey}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {isConfigured && (
          <>
            {/* Actions Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Filter by Customer:</Label>
                <Select
                  value={selectedCustomerId?.toString() || "all"}
                  onValueChange={(v) => setSelectedCustomerId(v === "all" ? undefined : parseInt(v))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { agents.refetch(); remoteAgents.refetch(); }}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Create Agent
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create AI Agent</DialogTitle>
                      <DialogDescription>
                        Create a new Retell AI voice agent. This will create the agent on Retell's platform.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label>Customer</Label>
                        <Select
                          value={newAgent.agentName ? selectedCustomerId?.toString() : ""}
                          onValueChange={(v) => setSelectedCustomerId(parseInt(v))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.data?.map((c) => (
                              <SelectItem key={c.id} value={c.id.toString()}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="agentName">Agent Name</Label>
                        <Input
                          id="agentName"
                          value={newAgent.agentName}
                          onChange={(e) => setNewAgent(a => ({ ...a, agentName: e.target.value }))}
                          placeholder="e.g. Sales Assistant"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="voiceId">Voice ID</Label>
                        <Input
                          id="voiceId"
                          value={newAgent.voiceId}
                          onChange={(e) => setNewAgent(a => ({ ...a, voiceId: e.target.value }))}
                          placeholder="e.g. 11labs-Adrian"
                        />
                        <p className="text-xs text-muted-foreground">
                          Find voice IDs in the Retell dashboard
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="language">Language</Label>
                        <Select
                          value={newAgent.language}
                          onValueChange={(v) => setNewAgent(a => ({ ...a, language: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en-US">English (US)</SelectItem>
                            <SelectItem value="en-GB">English (UK)</SelectItem>
                            <SelectItem value="es-ES">Spanish</SelectItem>
                            <SelectItem value="fr-FR">French</SelectItem>
                            <SelectItem value="de-DE">German</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          if (!selectedCustomerId || !newAgent.agentName) {
                            toast.error("Customer and agent name are required");
                            return;
                          }
                          createAgent.mutate({
                            customerId: selectedCustomerId,
                            agentName: newAgent.agentName,
                            voiceId: newAgent.voiceId || undefined,
                            language: newAgent.language,
                            webhookUrl: `${window.location.origin}/api/webhooks/retell`,
                          });
                        }}
                        disabled={createAgent.isPending}
                      >
                        {createAgent.isPending ? "Creating..." : "Create Agent"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Local Agents List */}
            <Card>
              <CardHeader>
                <CardTitle>Your AI Agents</CardTitle>
                <CardDescription>
                  Agents created and tracked in this platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agents.isLoading ? (
                  <p className="text-muted-foreground text-sm">Loading...</p>
                ) : !agents.data?.length ? (
                  <p className="text-muted-foreground text-sm">
                    No agents yet. Create one to get started.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {agents.data.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <Bot className="h-8 w-8 text-indigo-500" />
                          <div>
                            <p className="font-medium">{agent.agentName}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>ID: {agent.retellAgentId}</span>
                              {agent.voiceId && <span>Voice: {agent.voiceId}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={agent.status === "active" ? "default" : "secondary"}>
                            {agent.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Delete this agent? This will also remove it from Retell.")) {
                                deleteAgent.mutate({ id: agent.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Retell Platform Agents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Retell Platform Agents
                </CardTitle>
                <CardDescription>
                  All agents on your Retell account (including those created outside this platform)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {remoteAgents.isLoading ? (
                  <p className="text-muted-foreground text-sm">Loading from Retell...</p>
                ) : !Array.isArray(remoteAgents.data) || !remoteAgents.data?.length ? (
                  <p className="text-muted-foreground text-sm">No agents found on Retell.</p>
                ) : (
                  <div className="space-y-2">
                    {remoteAgents.data.map((agent: any) => (
                      <div
                        key={agent.agent_id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-slate-50"
                      >
                        <div>
                          <p className="font-medium text-sm">{agent.agent_name || "Unnamed Agent"}</p>
                          <p className="text-xs text-muted-foreground">
                            {agent.agent_id} | Voice: {agent.voice_id || "default"}
                          </p>
                        </div>
                        <Badge variant="outline">Retell</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Webhook Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Webhook Configuration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <Label>Retell Webhook URL</Label>
                  <Input
                    disabled
                    value={typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/retell` : ""}
                  />
                  <p className="text-sm text-muted-foreground">
                    This URL receives call events from Retell AI (call_started, call_ended, call_analyzed).
                    Set this as the webhook URL when creating agents, or configure it as an account-level webhook in Retell dashboard.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
