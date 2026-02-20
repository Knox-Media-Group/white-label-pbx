import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Pencil, Trash2, Phone, Hash } from "lucide-react";

type CallHandler = "texml_webhooks" | "call_control" | "ai_agent" | "video_room";

const CALL_HANDLER_LABELS: Record<CallHandler, string> = {
  texml_webhooks: "TeXML Webhooks",
  call_control: "Call Control",
  ai_agent: "AI Agent",
  video_room: "Video Room",
};

interface CreateFormState {
  customerId: string;
  extensionNumber: string;
  displayName: string;
  username: string;
  callerId: string;
  callHandler: CallHandler;
}

interface EditFormState {
  displayName: string;
  extensionNumber: string;
  callerId: string;
  callHandler: CallHandler;
}

const defaultCreateForm: CreateFormState = {
  customerId: "",
  extensionNumber: "",
  displayName: "",
  username: "",
  callerId: "",
  callHandler: "texml_webhooks",
};

const defaultEditForm: EditFormState = {
  displayName: "",
  extensionNumber: "",
  callerId: "",
  callHandler: "texml_webhooks",
};

export default function AdminExtensions() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Form state
  const [createForm, setCreateForm] = useState<CreateFormState>(defaultCreateForm);
  const [editForm, setEditForm] = useState<EditFormState>(defaultEditForm);
  const [editingEndpointId, setEditingEndpointId] = useState<number | null>(null);
  const [deletingEndpointId, setDeletingEndpointId] = useState<number | null>(null);
  const [deletingEndpointName, setDeletingEndpointName] = useState("");

  // Fetch all customers
  const { data: customers } = trpc.customers.list.useQuery();

  // Determine which customer IDs to query
  const customerIds =
    selectedCustomerId === "all"
      ? (customers ?? []).map((c) => c.id)
      : [parseInt(selectedCustomerId)];

  // Fetch endpoints for each customer ID. Since sipEndpoints.list requires a customerId,
  // we query for each customer separately and merge results.
  // When "all" is selected and there are no customers yet, we pass a fallback so hooks remain stable.
  const endpointQueries = trpc.useQueries((t) =>
    customerIds.length > 0
      ? customerIds.map((id) => t.sipEndpoints.list({ customerId: id }))
      : []
  );

  // Build a map of customer id -> name
  const customerMap = new Map<number, string>();
  (customers ?? []).forEach((c) => {
    customerMap.set(c.id, c.name || c.companyName || `Customer #${c.id}`);
  });

  // Flatten all endpoints with customer info
  const allEndpoints = endpointQueries.flatMap((q, idx) => {
    if (!q.data) return [];
    const custId = customerIds[idx];
    return q.data.map((ep) => ({
      ...ep,
      customerName: customerMap.get(custId) || `Customer #${custId}`,
    }));
  });

  const isLoading = endpointQueries.some((q) => q.isLoading);

  // Refetch all endpoint queries
  const refetchAll = () => {
    endpointQueries.forEach((q) => q.refetch());
  };

  // Filter by search
  const filteredEndpoints = allEndpoints.filter((ep) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (ep.extensionNumber?.toLowerCase().includes(q)) ||
      (ep.displayName?.toLowerCase().includes(q)) ||
      (ep.username?.toLowerCase().includes(q)) ||
      (ep.customerName?.toLowerCase().includes(q)) ||
      (ep.callerId?.toLowerCase().includes(q))
    );
  });

  // Mutations
  const createMutation = trpc.sipEndpoints.create.useMutation({
    onSuccess: () => {
      toast.success("Extension created successfully");
      setIsCreateOpen(false);
      setCreateForm(defaultCreateForm);
      refetchAll();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create extension");
    },
  });

  const updateMutation = trpc.sipEndpoints.update.useMutation({
    onSuccess: () => {
      toast.success("Extension updated successfully");
      setIsEditOpen(false);
      setEditingEndpointId(null);
      refetchAll();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update extension");
    },
  });

  const deleteMutation = trpc.sipEndpoints.delete.useMutation({
    onSuccess: () => {
      toast.success("Extension deleted successfully");
      setIsDeleteOpen(false);
      setDeletingEndpointId(null);
      setDeletingEndpointName("");
      refetchAll();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete extension");
    },
  });

  // Auto-generate username from extension number
  const handleExtensionChange = (value: string) => {
    setCreateForm({
      ...createForm,
      extensionNumber: value,
      username: value ? `ext${value}` : "",
    });
  };

  const handleCreate = () => {
    if (!createForm.customerId) {
      toast.error("Please select a customer");
      return;
    }
    if (!createForm.extensionNumber) {
      toast.error("Extension number is required");
      return;
    }
    if (!createForm.username) {
      toast.error("Username is required");
      return;
    }
    createMutation.mutate({
      customerId: parseInt(createForm.customerId),
      username: createForm.username,
      displayName: createForm.displayName || undefined,
      extensionNumber: createForm.extensionNumber || undefined,
      callerId: createForm.callerId || undefined,
      callHandler: createForm.callHandler,
    });
  };

  const handleOpenEdit = (endpoint: (typeof allEndpoints)[number]) => {
    setEditingEndpointId(endpoint.id);
    setEditForm({
      displayName: endpoint.displayName || "",
      extensionNumber: endpoint.extensionNumber || "",
      callerId: endpoint.callerId || "",
      callHandler: (endpoint.callHandler as CallHandler) || "texml_webhooks",
    });
    setIsEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (editingEndpointId === null) return;
    updateMutation.mutate({
      id: editingEndpointId,
      displayName: editForm.displayName,
      extensionNumber: editForm.extensionNumber,
      callerId: editForm.callerId,
      callHandler: editForm.callHandler,
    });
  };

  const handleOpenDelete = (endpoint: (typeof allEndpoints)[number]) => {
    setDeletingEndpointId(endpoint.id);
    setDeletingEndpointName(
      endpoint.displayName || endpoint.extensionNumber || endpoint.username
    );
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingEndpointId === null) return;
    deleteMutation.mutate({ id: deletingEndpointId });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "provisioning":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Provisioning</Badge>;
      case "disabled":
        return <Badge variant="secondary">Disabled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AdminLayout title="Extensions">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Extensions</h1>
            <p className="text-muted-foreground">
              Manage SIP extensions across all customers
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Extension
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-full sm:w-64">
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {(customers ?? []).map((customer) => (
                  <SelectItem key={customer.id} value={String(customer.id)}>
                    {customer.name || customer.companyName || `Customer #${customer.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1 max-w-sm">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by extension, name, username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="text-sm text-muted-foreground self-center">
            {filteredEndpoints.length} extension{filteredEndpoints.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Extensions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Extension Directory
            </CardTitle>
            <CardDescription>
              All SIP extensions registered across your customer accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : filteredEndpoints.length === 0 ? (
              <div className="text-center py-12">
                <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery
                    ? "No extensions match your search"
                    : "No extensions found. Create your first extension to get started."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Extension</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>SIP URI</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Call Handler</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEndpoints.map((endpoint) => (
                      <TableRow key={`${endpoint.customerId}-${endpoint.id}`}>
                        <TableCell>
                          <span className="font-mono font-semibold text-sm">
                            {endpoint.extensionNumber || "-"}
                          </span>
                        </TableCell>
                        <TableCell>{endpoint.displayName || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {endpoint.username}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{endpoint.customerName}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {endpoint.username}@sip.telnyx.com
                        </TableCell>
                        <TableCell>{getStatusBadge(endpoint.status)}</TableCell>
                        <TableCell>
                          <span className="text-xs bg-slate-100 px-2 py-1 rounded">
                            {CALL_HANDLER_LABELS[(endpoint.callHandler as CallHandler)] ||
                              endpoint.callHandler?.replace(/_/g, " ") ||
                              "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleOpenEdit(endpoint)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleOpenDelete(endpoint)}
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Extension Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Extension</DialogTitle>
              <DialogDescription>
                Add a new SIP extension for a customer
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select
                  value={createForm.customerId}
                  onValueChange={(value) =>
                    setCreateForm({ ...createForm, customerId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customers ?? []).map((customer) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>
                        {customer.name || customer.companyName || `Customer #${customer.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Extension Number *</Label>
                <Input
                  placeholder="e.g., 1001 (4-digit recommended)"
                  value={createForm.extensionNumber}
                  onChange={(e) => handleExtensionChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  placeholder="e.g., John Smith"
                  value={createForm.displayName}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, displayName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  placeholder="Auto-generated from extension"
                  value={createForm.username}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, username: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Auto-generated from extension number. You can override it.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Caller ID</Label>
                <Input
                  placeholder="+15551234567"
                  value={createForm.callerId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, callerId: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Call Handler</Label>
                <Select
                  value={createForm.callHandler}
                  onValueChange={(value) =>
                    setCreateForm({ ...createForm, callHandler: value as CallHandler })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="texml_webhooks">TeXML Webhooks</SelectItem>
                    <SelectItem value="call_control">Call Control</SelectItem>
                    <SelectItem value="ai_agent">AI Agent</SelectItem>
                    <SelectItem value="video_room">Video Room</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Extension"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Extension Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Extension</DialogTitle>
              <DialogDescription>
                Update the details for this extension
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Extension Number</Label>
                <Input
                  placeholder="e.g., 1001"
                  value={editForm.extensionNumber}
                  onChange={(e) =>
                    setEditForm({ ...editForm, extensionNumber: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  placeholder="e.g., John Smith"
                  value={editForm.displayName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, displayName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Caller ID</Label>
                <Input
                  placeholder="+15551234567"
                  value={editForm.callerId}
                  onChange={(e) =>
                    setEditForm({ ...editForm, callerId: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Call Handler</Label>
                <Select
                  value={editForm.callHandler}
                  onValueChange={(value) =>
                    setEditForm({ ...editForm, callHandler: value as CallHandler })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="texml_webhooks">TeXML Webhooks</SelectItem>
                    <SelectItem value="call_control">Call Control</SelectItem>
                    <SelectItem value="ai_agent">AI Agent</SelectItem>
                    <SelectItem value="video_room">Video Room</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Extension</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the extension{" "}
                <strong>{deletingEndpointName}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
