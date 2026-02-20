import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Search, MoreHorizontal, Users, Trash2, Edit } from "lucide-react";
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

const DEMO_CUSTOMER_ID = 1;

type RingStrategy = "simultaneous" | "sequential" | "round_robin" | "random";
type FailoverAction = "voicemail" | "forward" | "hangup";

type EditForm = {
  name: string;
  extensionNumber: string;
  strategy: RingStrategy;
  ringTimeout: number;
  failoverAction: FailoverAction;
};

export default function CustomerRingGroups() {
  const { user } = useAuth();
  const customerId = user?.customerId || DEMO_CUSTOMER_ID;

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: "",
    extensionNumber: "",
    ringStrategy: "simultaneous" as RingStrategy,
    ringTimeout: 30,
    callerId: "",
  });
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    extensionNumber: "",
    strategy: "simultaneous",
    ringTimeout: 30,
    failoverAction: "voicemail",
  });

  const { data: ringGroups, isLoading, refetch } = trpc.ringGroups.list.useQuery({ customerId });
  
  const createMutation = trpc.ringGroups.create.useMutation({
    onSuccess: () => {
      toast.success("Ring group created successfully");
      setIsCreateOpen(false);
      setNewGroup({ name: "", extensionNumber: "", ringStrategy: "simultaneous", ringTimeout: 30, callerId: "" });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create ring group");
    },
  });
  
  const updateMutation = trpc.ringGroups.update.useMutation({
    onSuccess: () => {
      toast.success("Ring group updated successfully");
      setEditingGroupId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update ring group");
    },
  });

  const deleteMutation = trpc.ringGroups.delete.useMutation({
    onSuccess: () => {
      toast.success("Ring group deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete ring group");
    },
  });

  const filteredGroups = ringGroups?.filter(
    (g) =>
      g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.extensionNumber?.includes(searchQuery)
  ) || [];

  const handleCreate = () => {
    if (!newGroup.name) {
      toast.error("Name is required");
      return;
    }
    createMutation.mutate({ customerId, ...newGroup });
  };

  const handleEditOpen = (group: { id: number; name: string; extensionNumber?: string | null; strategy: string; ringTimeout?: number | null; failoverAction?: string | null }) => {
    setEditForm({
      name: group.name,
      extensionNumber: group.extensionNumber || "",
      strategy: (group.strategy as RingStrategy) || "simultaneous",
      ringTimeout: group.ringTimeout || 30,
      failoverAction: (group.failoverAction as FailoverAction) || "voicemail",
    });
    setEditingGroupId(group.id);
  };

  const handleEditSave = () => {
    if (!editForm.name) {
      toast.error("Name is required");
      return;
    }
    if (editingGroupId === null) return;
    updateMutation.mutate({
      id: editingGroupId,
      name: editForm.name,
      extensionNumber: editForm.extensionNumber || undefined,
      strategy: editForm.strategy,
      ringTimeout: editForm.ringTimeout,
      failoverAction: editForm.failoverAction,
    });
  };

  const strategyLabels: Record<RingStrategy, string> = {
    simultaneous: "Ring All",
    sequential: "Sequential",
    round_robin: "Round Robin",
    random: "Random",
  };

  return (
    <CustomerLayout title="Ring Groups">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ring groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Ring Group
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Ring Group</DialogTitle>
                <DialogDescription>
                  Set up a ring group to distribute calls among multiple endpoints
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Group Name *</Label>
                  <Input
                    id="name"
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                    placeholder="Sales Team"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="extension">Extension Number</Label>
                  <Input
                    id="extension"
                    value={newGroup.extensionNumber}
                    onChange={(e) => setNewGroup({ ...newGroup, extensionNumber: e.target.value })}
                    placeholder="2001"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="strategy">Ring Strategy</Label>
                  <Select
                    value={newGroup.ringStrategy}
                    onValueChange={(value) => setNewGroup({ ...newGroup, ringStrategy: value as RingStrategy })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simultaneous">Ring All (Simultaneous)</SelectItem>
                      <SelectItem value="sequential">Sequential</SelectItem>
                      <SelectItem value="round_robin">Round Robin</SelectItem>
                      <SelectItem value="random">Random</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="timeout">Ring Timeout (seconds)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    value={newGroup.ringTimeout}
                    onChange={(e) => setNewGroup({ ...newGroup, ringTimeout: parseInt(e.target.value) || 30 })}
                    min={5}
                    max={120}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="callerId">Caller ID</Label>
                  <Input
                    id="callerId"
                    value={newGroup.callerId}
                    onChange={(e) => setNewGroup({ ...newGroup, callerId: e.target.value })}
                    placeholder="+15551234567"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Group"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Ring Groups Table */}
        <Card>
          <CardHeader>
            <CardTitle>Ring Groups</CardTitle>
            <CardDescription>
              Manage your ring groups and call distribution settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No ring groups match your search" : "No ring groups yet. Create your first ring group."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Extension</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Timeout</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell className="font-medium">{group.name}</TableCell>
                      <TableCell>{group.extensionNumber || "-"}</TableCell>
                      <TableCell>
                        <span className="text-xs bg-slate-100 px-2 py-1 rounded">
                          {strategyLabels[group.strategy as RingStrategy] || group.strategy}
                        </span>
                      </TableCell>
                      <TableCell>{group.ringTimeout || 30}s</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          group.status === 'active' ? 'bg-green-100 text-green-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {group.status}
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
                            <DropdownMenuItem onClick={() => handleEditOpen(group)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this ring group?")) {
                                  deleteMutation.mutate({ id: group.id });
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

      {/* Edit Ring Group Dialog */}
      <Dialog open={editingGroupId !== null} onOpenChange={(open) => { if (!open) setEditingGroupId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Ring Group</DialogTitle>
            <DialogDescription>
              Update the ring group settings
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Group Name *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Sales Team"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-extension">Extension Number</Label>
              <Input
                id="edit-extension"
                value={editForm.extensionNumber}
                onChange={(e) => setEditForm({ ...editForm, extensionNumber: e.target.value })}
                placeholder="2001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-strategy">Ring Strategy</Label>
              <Select
                value={editForm.strategy}
                onValueChange={(value) => setEditForm({ ...editForm, strategy: value as RingStrategy })}
              >
                <SelectTrigger id="edit-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simultaneous">Ring All (Simultaneous)</SelectItem>
                  <SelectItem value="sequential">Sequential</SelectItem>
                  <SelectItem value="round_robin">Round Robin</SelectItem>
                  <SelectItem value="random">Random</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-timeout">Ring Timeout (seconds)</Label>
              <Input
                id="edit-timeout"
                type="number"
                value={editForm.ringTimeout}
                onChange={(e) => setEditForm({ ...editForm, ringTimeout: parseInt(e.target.value) || 30 })}
                min={5}
                max={120}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-failover">Failover Action</Label>
              <Select
                value={editForm.failoverAction}
                onValueChange={(value) => setEditForm({ ...editForm, failoverAction: value as FailoverAction })}
              >
                <SelectTrigger id="edit-failover">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                  <SelectItem value="forward">Forward</SelectItem>
                  <SelectItem value="hangup">Hang Up</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGroupId(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}
