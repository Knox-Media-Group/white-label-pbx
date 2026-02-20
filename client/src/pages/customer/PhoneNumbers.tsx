import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Search, MoreHorizontal, PhoneCall, Trash2, Edit } from "lucide-react";
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

export default function CustomerPhoneNumbers() {
  const { user } = useAuth();
  const customerId = user?.customerId || DEMO_CUSTOMER_ID;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newNumber, setNewNumber] = useState({
    phoneNumber: "",
    friendlyName: "",
  });

  const [editingNumber, setEditingNumber] = useState<{
    id: number;
    phoneNumber: string;
    friendlyName: string;
    assignedToEndpointId: number | null;
    callHandler: string;
    retellAgentId: string | null;
  } | null>(null);
  const [editForm, setEditForm] = useState({
    friendlyName: "",
    assignedToEndpointId: "",
    callHandler: "",
    retellAgentId: "",
  });

  const { data: phoneNumbers, isLoading, refetch } = trpc.phoneNumbers.list.useQuery({ customerId });
  
  const createMutation = trpc.phoneNumbers.create.useMutation({
    onSuccess: () => {
      toast.success("Phone number added successfully");
      setIsCreateOpen(false);
      setNewNumber({ phoneNumber: "", friendlyName: "" });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add phone number");
    },
  });
  
  const deleteMutation = trpc.phoneNumbers.delete.useMutation({
    onSuccess: () => {
      toast.success("Phone number removed");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove phone number");
    },
  });

  const updateMutation = trpc.phoneNumbers.update.useMutation({
    onSuccess: () => {
      toast.success("Phone number updated successfully");
      setEditingNumber(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update phone number");
    },
  });

  const filteredNumbers = phoneNumbers?.filter(
    (n) =>
      n.phoneNumber.includes(searchQuery) ||
      n.friendlyName?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleCreate = () => {
    if (!newNumber.phoneNumber) {
      toast.error("Phone number is required");
      return;
    }
    createMutation.mutate({ customerId, ...newNumber });
  };

  const handleEditOpen = (number: (typeof filteredNumbers)[number]) => {
    setEditingNumber({
      id: number.id,
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName || "",
      assignedToEndpointId: number.assignedToEndpointId ?? null,
      callHandler: number.callHandler || "texml_webhooks",
      retellAgentId: (number as any).retellAgentId || null,
    });
    setEditForm({
      friendlyName: number.friendlyName || "",
      assignedToEndpointId: number.assignedToEndpointId?.toString() ?? "",
      callHandler: number.callHandler || "texml_webhooks",
      retellAgentId: (number as any).retellAgentId || "",
    });
  };

  const handleEditSave = () => {
    if (!editingNumber) return;
    updateMutation.mutate({
      id: editingNumber.id,
      friendlyName: editForm.friendlyName || undefined,
      assignedToEndpointId: editForm.assignedToEndpointId
        ? Number(editForm.assignedToEndpointId)
        : null,
      callHandler: editForm.callHandler as
        | "texml_webhooks"
        | "call_control"
        | "ai_agent"
        | "sip_endpoint"
        | "ring_group",
      retellAgentId: editForm.retellAgentId || null,
    });
  };

  return (
    <CustomerLayout title="Phone Numbers">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search phone numbers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Number
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Phone Number</DialogTitle>
                <DialogDescription>
                  Add a phone number to your PBX system
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="phoneNumber">Phone Number *</Label>
                  <Input
                    id="phoneNumber"
                    value={newNumber.phoneNumber}
                    onChange={(e) => setNewNumber({ ...newNumber, phoneNumber: e.target.value })}
                    placeholder="+15551234567"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter in E.164 format (e.g., +15551234567)
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="friendlyName">Friendly Name</Label>
                  <Input
                    id="friendlyName"
                    value={newNumber.friendlyName}
                    onChange={(e) => setNewNumber({ ...newNumber, friendlyName: e.target.value })}
                    placeholder="Main Office Line"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Adding..." : "Add Number"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Phone Numbers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Phone Numbers</CardTitle>
            <CardDescription>
              Manage your phone numbers and their assignments
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredNumbers.length === 0 ? (
              <div className="text-center py-12">
                <PhoneCall className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No phone numbers match your search" : "No phone numbers yet. Add your first number."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Friendly Name</TableHead>
                    <TableHead>Assignment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNumbers.map((number) => (
                    <TableRow key={number.id}>
                      <TableCell className="font-medium font-mono">{number.phoneNumber}</TableCell>
                      <TableCell>{number.friendlyName || "-"}</TableCell>
                      <TableCell>
                        {number.assignedToEndpointId || number.assignedToRingGroupId ? (
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                            {number.assignedToEndpointId ? 'Endpoint' : 'Ring Group'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          number.status === 'active' ? 'bg-green-100 text-green-700' :
                          number.status === 'porting' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {number.status}
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
                            <DropdownMenuItem onClick={() => handleEditOpen(number)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => {
                                if (confirm("Are you sure you want to remove this phone number?")) {
                                  deleteMutation.mutate({ id: number.id });
                                }
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
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

      {/* Edit Phone Number Dialog */}
      <Dialog open={!!editingNumber} onOpenChange={(open) => { if (!open) setEditingNumber(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Phone Number</DialogTitle>
            <DialogDescription>
              Update settings for{" "}
              <span className="font-mono">{editingNumber?.phoneNumber}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-friendlyName">Friendly Name</Label>
              <Input
                id="edit-friendlyName"
                value={editForm.friendlyName}
                onChange={(e) => setEditForm({ ...editForm, friendlyName: e.target.value })}
                placeholder="Main Office Line"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-assignedToEndpointId">Assigned Endpoint ID</Label>
              <Input
                id="edit-assignedToEndpointId"
                type="number"
                value={editForm.assignedToEndpointId}
                onChange={(e) => setEditForm({ ...editForm, assignedToEndpointId: e.target.value })}
                placeholder="Leave blank to unassign"
              />
              <p className="text-xs text-muted-foreground">
                Enter a SIP endpoint ID, or leave blank to unassign
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-callHandler">Call Handler</Label>
              <Select
                value={editForm.callHandler}
                onValueChange={(value) => setEditForm({ ...editForm, callHandler: value })}
              >
                <SelectTrigger id="edit-callHandler">
                  <SelectValue placeholder="Select call handler" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="texml_webhooks">TeXML Webhooks</SelectItem>
                  <SelectItem value="call_control">Call Control</SelectItem>
                  <SelectItem value="ai_agent">AI Agent</SelectItem>
                  <SelectItem value="sip_endpoint">SIP Endpoint</SelectItem>
                  <SelectItem value="ring_group">Ring Group</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-retellAgentId">Retell AI Agent ID</Label>
              <Input
                id="edit-retellAgentId"
                placeholder="e.g., agent_xxxx (leave blank for none)"
                value={editForm.retellAgentId}
                onChange={(e) => setEditForm({ ...editForm, retellAgentId: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Assign a Retell AI agent to handle calls on this number. Get the ID from AI Agents page.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNumber(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}
