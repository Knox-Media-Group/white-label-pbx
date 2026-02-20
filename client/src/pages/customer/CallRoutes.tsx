import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Search, MoreHorizontal, Route, Trash2, Edit, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const DEMO_CUSTOMER_ID = 1;

type DestinationType = "endpoint" | "ring_group" | "external" | "voicemail" | "ai_agent";
type MatchType = "all" | "caller_id" | "time_based" | "did";

type EditRouteState = {
  id: number;
  name: string;
  matchType: MatchType;
  matchPattern: string;
  destinationType: DestinationType;
  destinationExternal: string;
  priority: number;
  status: "active" | "inactive";
};

export default function CustomerCallRoutes() {
  const { user } = useAuth();
  const customerId = user?.customerId || DEMO_CUSTOMER_ID;

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [newRoute, setNewRoute] = useState({
    name: "",
    pattern: "",
    destinationType: "endpoint" as DestinationType,
    destinationValue: "",
    priority: 10,
  });
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editRoute, setEditRoute] = useState<EditRouteState>({
    id: 0,
    name: "",
    matchType: "all",
    matchPattern: "",
    destinationType: "endpoint",
    destinationExternal: "",
    priority: 10,
    status: "active",
  });

  const { data: callRoutes, isLoading, refetch } = trpc.callRoutes.list.useQuery({ customerId });
  
  const createMutation = trpc.callRoutes.create.useMutation({
    onSuccess: () => {
      toast.success("Call route created successfully");
      setIsCreateOpen(false);
      setNewRoute({ name: "", pattern: "", destinationType: "endpoint", destinationValue: "", priority: 10 });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create call route");
    },
  });
  
  const deleteMutation = trpc.callRoutes.delete.useMutation({
    onSuccess: () => {
      toast.success("Call route deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete call route");
    },
  });

  const updateMutation = trpc.callRoutes.update.useMutation({
    onSuccess: () => {
      toast.success("Call route updated successfully");
      setIsEditOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update call route");
    },
  });

  const handleOpenEdit = (route: { id: number; name: string; matchType?: string | null; matchPattern?: string | null; destinationType: string; destinationExternal?: string | null; priority?: number | null; status?: string | null }) => {
    setEditRoute({
      id: route.id,
      name: route.name,
      matchType: (route.matchType as MatchType) || "all",
      matchPattern: route.matchPattern || "",
      destinationType: (route.destinationType as DestinationType) || "endpoint",
      destinationExternal: route.destinationExternal || "",
      priority: route.priority ?? 10,
      status: (route.status as "active" | "inactive") || "active",
    });
    setIsEditOpen(true);
  };

  const handleSave = () => {
    if (!editRoute.name) {
      toast.error("Name is required");
      return;
    }
    updateMutation.mutate({
      id: editRoute.id,
      name: editRoute.name,
      matchType: editRoute.matchType,
      matchPattern: editRoute.matchPattern || undefined,
      destinationType: editRoute.destinationType,
      destinationExternal: editRoute.destinationExternal || undefined,
      priority: editRoute.priority,
      status: editRoute.status,
    });
  };

  const aiSuggestionMutation = trpc.llmCallFlows.getRoutingSuggestions.useMutation({
    onSuccess: (data) => {
      toast.success("AI suggestions generated");
      setIsAiOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to get AI suggestions");
    },
  });

  const filteredRoutes = callRoutes?.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.matchPattern?.includes(searchQuery)
  ) || [];

  const handleCreate = () => {
    if (!newRoute.name || !newRoute.pattern) {
      toast.error("Name and pattern are required");
      return;
    }
    createMutation.mutate({ customerId, ...newRoute });
  };

  const destTypeLabels: Record<DestinationType, string> = {
    endpoint: "SIP Endpoint",
    ring_group: "Ring Group",
    external: "External Number",
    voicemail: "Voicemail",
    ai_agent: "AI Agent",
  };

  return (
    <CustomerLayout title="Call Routes">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search call routes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Dialog open={isAiOpen} onOpenChange={setIsAiOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI Suggestions
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Get AI Routing Suggestions</DialogTitle>
                  <DialogDescription>
                    Describe your call patterns and requirements to get intelligent routing suggestions
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="aiPrompt">Describe your needs</Label>
                    <Textarea
                      id="aiPrompt"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="e.g., We receive most calls during business hours 9am-5pm. Sales calls should go to the sales team, support calls to support. After hours, route to voicemail."
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAiOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => aiSuggestionMutation.mutate({ customerId, context: aiPrompt })}
                    disabled={aiSuggestionMutation.isPending || !aiPrompt}
                  >
                    {aiSuggestionMutation.isPending ? "Generating..." : "Get Suggestions"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Route
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Call Route</DialogTitle>
                  <DialogDescription>
                    Set up routing rules for incoming calls
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Route Name *</Label>
                    <Input
                      id="name"
                      value={newRoute.name}
                      onChange={(e) => setNewRoute({ ...newRoute, name: e.target.value })}
                      placeholder="Business Hours Route"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pattern">Match Pattern *</Label>
                    <Input
                      id="pattern"
                      value={newRoute.pattern}
                      onChange={(e) => setNewRoute({ ...newRoute, pattern: e.target.value })}
                      placeholder="+1555*"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use * as wildcard. E.g., +1555* matches all numbers starting with +1555
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="destType">Destination Type</Label>
                    <Select
                      value={newRoute.destinationType}
                      onValueChange={(value) => setNewRoute({ ...newRoute, destinationType: value as DestinationType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="endpoint">SIP Endpoint</SelectItem>
                        <SelectItem value="ring_group">Ring Group</SelectItem>
                        <SelectItem value="external">External Number</SelectItem>
                        <SelectItem value="voicemail">Voicemail</SelectItem>
                        <SelectItem value="ai_agent">AI Agent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="destValue">Destination Value</Label>
                    <Input
                      id="destValue"
                      value={newRoute.destinationValue}
                      onChange={(e) => setNewRoute({ ...newRoute, destinationValue: e.target.value })}
                      placeholder="Extension or phone number"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Input
                      id="priority"
                      type="number"
                      value={newRoute.priority}
                      onChange={(e) => setNewRoute({ ...newRoute, priority: parseInt(e.target.value) || 10 })}
                      min={1}
                      max={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower numbers = higher priority
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create Route"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Call Routes Table */}
        <Card>
          <CardHeader>
            <CardTitle>Call Routes</CardTitle>
            <CardDescription>
              Configure how incoming calls are routed based on patterns and rules
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredRoutes.length === 0 ? (
              <div className="text-center py-12">
                <Route className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No routes match your search" : "No call routes yet. Create your first route."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priority</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Pattern</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRoutes.map((route) => (
                    <TableRow key={route.id}>
                      <TableCell className="font-mono">{route.priority}</TableCell>
                      <TableCell className="font-medium">{route.name}</TableCell>
                      <TableCell className="font-mono">{route.matchPattern || "-"}</TableCell>
                      <TableCell>
                        <span className="text-xs bg-slate-100 px-2 py-1 rounded">
                          {destTypeLabels[route.destinationType as DestinationType] || route.destinationType}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          route.status === 'active' ? 'bg-green-100 text-green-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {route.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenEdit(route)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this route?")) {
                                  deleteMutation.mutate({ id: route.id });
                                }
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Call Route Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Call Route</DialogTitle>
            <DialogDescription>
              Update the routing rule configuration
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Route Name *</Label>
              <Input
                id="edit-name"
                value={editRoute.name}
                onChange={(e) => setEditRoute({ ...editRoute, name: e.target.value })}
                placeholder="Business Hours Route"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-matchType">Match Type</Label>
              <Select
                value={editRoute.matchType}
                onValueChange={(value) => setEditRoute({ ...editRoute, matchType: value as MatchType })}
              >
                <SelectTrigger id="edit-matchType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Calls</SelectItem>
                  <SelectItem value="caller_id">Caller ID</SelectItem>
                  <SelectItem value="time_based">Time Based</SelectItem>
                  <SelectItem value="did">DID</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-matchPattern">Match Pattern</Label>
              <Input
                id="edit-matchPattern"
                value={editRoute.matchPattern}
                onChange={(e) => setEditRoute({ ...editRoute, matchPattern: e.target.value })}
                placeholder="+1555*"
              />
              <p className="text-xs text-muted-foreground">
                Use * as wildcard. E.g., +1555* matches all numbers starting with +1555
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-destType">Destination Type</Label>
              <Select
                value={editRoute.destinationType}
                onValueChange={(value) => setEditRoute({ ...editRoute, destinationType: value as DestinationType })}
              >
                <SelectTrigger id="edit-destType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="endpoint">SIP Endpoint</SelectItem>
                  <SelectItem value="ring_group">Ring Group</SelectItem>
                  <SelectItem value="external">External Number</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="ai_agent">AI Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-destExternal">Destination External</Label>
              <Input
                id="edit-destExternal"
                value={editRoute.destinationExternal}
                onChange={(e) => setEditRoute({ ...editRoute, destinationExternal: e.target.value })}
                placeholder="Extension or phone number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-priority">Priority</Label>
              <Input
                id="edit-priority"
                type="number"
                value={editRoute.priority}
                onChange={(e) => setEditRoute({ ...editRoute, priority: parseInt(e.target.value) || 10 })}
                min={1}
                max={100}
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers = higher priority
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editRoute.status}
                onValueChange={(value) => setEditRoute({ ...editRoute, status: value as "active" | "inactive" })}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}
