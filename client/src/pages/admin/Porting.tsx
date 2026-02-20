import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  Ship, Plus, RefreshCw, Loader2, CheckCircle2, XCircle,
  AlertTriangle, Clock, Send, Trash2, ArrowRight,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type PortOrder = {
  id: number;
  customerId: number;
  telnyxPortOrderId: string | null;
  status: string;
  phoneNumbers: unknown;
  phoneNumberIds: unknown;
  authorizedName: string | null;
  businessName: string | null;
  losingCarrier: string | null;
  accountNumber: string | null;
  accountPin: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  focDate: Date | string | null;
  activationDate: Date | string | null;
  notes: string | null;
  lastError: string | null;
  createdAt: Date | string;
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: Clock },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-700", icon: Send },
  in_process: { label: "In Process", color: "bg-indigo-100 text-indigo-700", icon: RefreshCw },
  exception: { label: "Exception", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  foc_date_confirmed: { label: "FOC Confirmed", color: "bg-amber-100 text-amber-700", icon: CheckCircle2 },
  ported: { label: "Ported", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-slate-100 text-slate-500", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.draft;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

export default function Porting() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [formData, setFormData] = useState({
    authorizedName: "",
    businessName: "",
    losingCarrier: "",
    accountNumber: "",
    accountPin: "",
    streetAddress: "",
    city: "",
    state: "",
    zip: "",
    notes: "",
  });
  const [selectedPhoneNumberIds, setSelectedPhoneNumberIds] = useState<number[]>([]);

  const portOrdersQuery = trpc.portOrders.list.useQuery();
  const customersQuery = trpc.customers.list.useQuery();

  const customerPhoneNumbersQuery = trpc.phoneNumbers.list.useQuery(
    { customerId: Number(selectedCustomerId) },
    { enabled: !!selectedCustomerId }
  );

  const createMutation = trpc.portOrders.create.useMutation({
    onSuccess: () => {
      toast.success("Port order created as draft");
      setShowCreateDialog(false);
      resetForm();
      portOrdersQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const submitMutation = trpc.portOrders.submit.useMutation({
    onSuccess: (data) => {
      toast.success(`Port order submitted to Telnyx (${data.telnyxPortOrderId})`);
      portOrdersQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const syncMutation = trpc.portOrders.syncStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`Status synced: ${data.status}`);
      portOrdersQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const cancelMutation = trpc.portOrders.cancel.useMutation({
    onSuccess: () => {
      toast.success("Port order cancelled");
      portOrdersQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.portOrders.delete.useMutation({
    onSuccess: () => {
      toast.success("Port order deleted");
      portOrdersQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const resetForm = () => {
    setSelectedCustomerId("");
    setSelectedPhoneNumberIds([]);
    setFormData({
      authorizedName: "", businessName: "", losingCarrier: "",
      accountNumber: "", accountPin: "", streetAddress: "",
      city: "", state: "", zip: "", notes: "",
    });
  };

  const handleCreate = () => {
    if (!selectedCustomerId || selectedPhoneNumberIds.length === 0 || !formData.authorizedName) {
      toast.error("Customer, phone numbers, and authorized name are required");
      return;
    }
    createMutation.mutate({
      customerId: Number(selectedCustomerId),
      phoneNumberIds: selectedPhoneNumberIds,
      ...formData,
    });
  };

  const togglePhoneNumber = (id: number) => {
    setSelectedPhoneNumberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const orders = (portOrdersQuery.data || []) as unknown as PortOrder[];
  const customers = customersQuery.data || [];
  const portableNumbers = (customerPhoneNumbersQuery.data || []).filter(
    (pn: { status: string }) => pn.status === "porting" || pn.status === "inactive"
  );

  const getCustomerName = (customerId: number) => {
    const c = customers.find((c: { id: number }) => c.id === customerId);
    return c ? (c as { name: string }).name : `Customer #${customerId}`;
  };

  return (
    <AdminLayout title="Number Porting">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Manage phone number port requests to transfer numbers from Viirtue/other carriers to Telnyx.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => portOrdersQuery.refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Port Order
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Draft", status: "draft", count: orders.filter(o => o.status === "draft").length },
            { label: "In Progress", status: "submitted", count: orders.filter(o => ["submitted", "in_process", "foc_date_confirmed"].includes(o.status)).length },
            { label: "Completed", status: "ported", count: orders.filter(o => o.status === "ported").length },
            { label: "Exceptions", status: "exception", count: orders.filter(o => o.status === "exception").length },
          ].map(({ label, count }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="text-2xl font-bold">{count}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Port Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ship className="h-5 w-5" />
              Port Orders
            </CardTitle>
            <CardDescription>
              {orders.length} port order{orders.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Ship className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No port orders yet.</p>
                <p className="text-sm">Create a port order to start transferring numbers from your current carrier.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Numbers</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>FOC Date</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">#{order.id}</TableCell>
                      <TableCell>{getCustomerName(order.customerId)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {((order.phoneNumbers as string[]) || []).slice(0, 3).map((pn) => (
                            <span key={pn} className="text-xs font-mono">{pn}</span>
                          ))}
                          {((order.phoneNumbers as string[]) || []).length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{((order.phoneNumbers as string[]) || []).length - 3} more
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{order.losingCarrier || "-"}</TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                        {order.lastError && (
                          <div className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={order.lastError}>
                            {order.lastError}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {order.focDate ? new Date(order.focDate).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {order.status === "draft" && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => submitMutation.mutate({ id: order.id })}
                              disabled={submitMutation.isPending}
                            >
                              {submitMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Send className="h-3 w-3 mr-1" />
                                  Submit
                                </>
                              )}
                            </Button>
                          )}
                          {["submitted", "in_process", "foc_date_confirmed", "exception"].includes(order.status) && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => syncMutation.mutate({ id: order.id })}
                                disabled={syncMutation.isPending}
                              >
                                {syncMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => {
                                  if (confirm("Cancel this port order?")) {
                                    cancelMutation.mutate({ id: order.id });
                                  }
                                }}
                                disabled={cancelMutation.isPending}
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {(order.status === "draft" || order.status === "cancelled") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => {
                                if (confirm("Delete this port order?")) {
                                  deleteMutation.mutate({ id: order.id });
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Port Order Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Port Order</DialogTitle>
              <DialogDescription>
                Create a port request to transfer phone numbers from your current carrier to Telnyx.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Step 1: Select Customer */}
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select value={selectedCustomerId} onValueChange={(v) => {
                  setSelectedCustomerId(v);
                  setSelectedPhoneNumberIds([]);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c: { id: number; name: string }) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 2: Select Phone Numbers */}
              {selectedCustomerId && (
                <div className="space-y-2">
                  <Label>Phone Numbers to Port *</Label>
                  {portableNumbers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No portable numbers found for this customer. Numbers must be in "porting" or "inactive" status.
                    </p>
                  ) : (
                    <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                      {portableNumbers.map((pn: { id: number; phoneNumber: string; friendlyName: string | null; status: string }) => (
                        <label key={pn.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedPhoneNumberIds.includes(pn.id)}
                            onChange={() => togglePhoneNumber(pn.id)}
                            className="rounded"
                          />
                          <span className="font-mono text-sm">{pn.phoneNumber}</span>
                          <span className="text-xs text-muted-foreground">{pn.friendlyName}</span>
                          <StatusBadge status={pn.status} />
                        </label>
                      ))}
                    </div>
                  )}
                  {selectedPhoneNumberIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedPhoneNumberIds.length} number{selectedPhoneNumberIds.length !== 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>
              )}

              {/* Step 3: Carrier & Account Info */}
              <div className="border-t pt-4 space-y-4">
                <h3 className="font-medium text-sm">Current Carrier Information</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="authorizedName">Authorized Name *</Label>
                    <Input
                      id="authorizedName"
                      value={formData.authorizedName}
                      onChange={(e) => setFormData({ ...formData, authorizedName: e.target.value })}
                      placeholder="Name on the account"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="businessName">Business Name</Label>
                    <Input
                      id="businessName"
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="losingCarrier">Current Carrier</Label>
                    <Input
                      id="losingCarrier"
                      value={formData.losingCarrier}
                      onChange={(e) => setFormData({ ...formData, losingCarrier: e.target.value })}
                      placeholder="e.g., Viirtue, AT&T, etc."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                      id="accountNumber"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      placeholder="Account # with current carrier"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="accountPin">Account PIN / Password</Label>
                    <Input
                      id="accountPin"
                      type="password"
                      value={formData.accountPin}
                      onChange={(e) => setFormData({ ...formData, accountPin: e.target.value })}
                      placeholder="PIN if required"
                    />
                  </div>
                </div>
              </div>

              {/* Step 4: Service Address */}
              <div className="border-t pt-4 space-y-4">
                <h3 className="font-medium text-sm">Service Address</h3>
                <p className="text-xs text-muted-foreground">
                  The address on file with your current carrier. Required for most port requests.
                </p>
                <div className="grid gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="streetAddress">Street Address</Label>
                    <Input
                      id="streetAddress"
                      value={formData.streetAddress}
                      onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
                      placeholder="123 Main St"
                    />
                  </div>
                  <div className="grid gap-4 grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        placeholder="CA"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="zip">ZIP Code</Label>
                      <Input
                        id="zip"
                        value={formData.zip}
                        onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                        placeholder="90210"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="border-t pt-4 space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any additional notes..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Create Draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
