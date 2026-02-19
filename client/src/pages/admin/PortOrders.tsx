import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, RefreshCw, ArrowRightLeft, CheckCircle, XCircle, Clock, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AdminPortOrders() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newOrder, setNewOrder] = useState({
    phoneNumbers: "",
    currentCarrier: "Viirtue",
    accountNumber: "",
    authorizedName: "",
    streetAddress: "",
    city: "",
    state: "",
    postalCode: "",
    pin: "",
  });

  const { data: customers } = trpc.customers.list.useQuery();
  const { data: orders, isLoading, refetch } = trpc.portOrders.list.useQuery(
    { customerId: selectedCustomerId || 0 },
    { enabled: !!selectedCustomerId }
  );
  const createMutation = trpc.portOrders.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Port order created (ID: ${data.id})`);
      setIsCreateOpen(false);
      setNewOrder({
        phoneNumbers: "", currentCarrier: "Viirtue", accountNumber: "",
        authorizedName: "", streetAddress: "", city: "", state: "", postalCode: "", pin: "",
      });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create port order");
    },
  });
  const checkStatusMutation = trpc.portOrders.checkStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`Status: ${data.status}${data.telnyxStatus ? ` (Telnyx: ${data.telnyxStatus})` : ''}`);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to check status");
    },
  });

  const handleCreate = () => {
    if (!selectedCustomerId || !newOrder.authorizedName || !newOrder.phoneNumbers) {
      toast.error("Customer, phone numbers, and authorized name are required");
      return;
    }
    const numbers = newOrder.phoneNumbers.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
    if (numbers.length === 0) {
      toast.error("Enter at least one phone number");
      return;
    }
    createMutation.mutate({
      customerId: selectedCustomerId,
      phoneNumbers: numbers,
      currentCarrier: newOrder.currentCarrier,
      accountNumber: newOrder.accountNumber || undefined,
      authorizedName: newOrder.authorizedName,
      streetAddress: newOrder.streetAddress,
      city: newOrder.city,
      state: newOrder.state,
      postalCode: newOrder.postalCode,
      pin: newOrder.pin || undefined,
    });
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-slate-100 text-slate-700",
      submitted: "bg-blue-100 text-blue-700",
      in_progress: "bg-yellow-100 text-yellow-700",
      completed: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
      cancelled: "bg-slate-100 text-slate-500",
    };
    return (
      <span className={`text-xs px-2 py-1 rounded-full ${styles[status] || styles.draft}`}>
        {status.replace(/_/g, " ")}
      </span>
    );
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      case "in_progress": return <ArrowRightLeft className="h-4 w-4 text-yellow-500" />;
      default: return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <AdminLayout title="Port Orders">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <Select
            value={selectedCustomerId?.toString() || ""}
            onValueChange={(v) => setSelectedCustomerId(parseInt(v))}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select Customer" />
            </SelectTrigger>
            <SelectContent>
              {customers?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.companyName || c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!selectedCustomerId}>
                <Plus className="mr-2 h-4 w-4" />
                New Port Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Number Port Order</DialogTitle>
                <DialogDescription>
                  Transfer phone numbers from another carrier to Telnyx
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="grid gap-2">
                  <Label>Phone Numbers (one per line) *</Label>
                  <Textarea
                    value={newOrder.phoneNumbers}
                    onChange={(e) => setNewOrder({ ...newOrder, phoneNumbers: e.target.value })}
                    placeholder={"+15551234567\n+15559876543"}
                    rows={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Current Carrier</Label>
                  <Input
                    value={newOrder.currentCarrier}
                    onChange={(e) => setNewOrder({ ...newOrder, currentCarrier: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Account Number</Label>
                    <Input
                      value={newOrder.accountNumber}
                      onChange={(e) => setNewOrder({ ...newOrder, accountNumber: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>PIN</Label>
                    <Input
                      value={newOrder.pin}
                      onChange={(e) => setNewOrder({ ...newOrder, pin: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Authorized Name *</Label>
                  <Input
                    value={newOrder.authorizedName}
                    onChange={(e) => setNewOrder({ ...newOrder, authorizedName: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Street Address *</Label>
                  <Input
                    value={newOrder.streetAddress}
                    onChange={(e) => setNewOrder({ ...newOrder, streetAddress: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 grid-cols-3">
                  <div className="grid gap-2">
                    <Label>City *</Label>
                    <Input
                      value={newOrder.city}
                      onChange={(e) => setNewOrder({ ...newOrder, city: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>State *</Label>
                    <Input
                      value={newOrder.state}
                      onChange={(e) => setNewOrder({ ...newOrder, state: e.target.value })}
                      placeholder="TX"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>ZIP *</Label>
                    <Input
                      value={newOrder.postalCode}
                      onChange={(e) => setNewOrder({ ...newOrder, postalCode: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Submitting..." : "Submit Port Order"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Number Port Orders</CardTitle>
            <CardDescription>Track phone number transfers from other carriers</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedCustomerId ? (
              <p className="text-center py-12 text-muted-foreground">Select a customer to view port orders</p>
            ) : isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (orders?.length || 0) === 0 ? (
              <p className="text-center py-12 text-muted-foreground">No port orders yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Numbers</TableHead>
                    <TableHead>From Carrier</TableHead>
                    <TableHead>Authorized</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders?.map((order) => {
                    const nums = Array.isArray(order.phoneNumbers) ? order.phoneNumbers as string[] : [];
                    return (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {statusIcon(order.status)}
                            {statusBadge(order.status)}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {nums.length > 0 ? nums.join(", ") : "-"}
                        </TableCell>
                        <TableCell>{order.currentCarrier || "-"}</TableCell>
                        <TableCell>{order.authorizedName || "-"}</TableCell>
                        <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => checkStatusMutation.mutate({ id: order.id })}
                            disabled={checkStatusMutation.isPending}
                            title="Check status"
                          >
                            <RefreshCw className={`h-4 w-4 ${checkStatusMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
