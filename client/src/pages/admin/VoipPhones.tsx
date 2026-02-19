import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Search, MoreHorizontal, Trash2, Wifi, WifiOff, Monitor } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { toast } from "sonner";
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

export default function AdminVoipPhones() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [newPhone, setNewPhone] = useState({
    brand: "",
    model: "",
    macAddress: "",
    label: "",
    location: "",
    transport: "UDP" as "UDP" | "TCP" | "TLS",
  });

  const { data: customers } = trpc.customers.list.useQuery();
  const { data: phones, isLoading, refetch } = trpc.voipPhones.list.useQuery(
    { customerId: selectedCustomerId || 0 },
    { enabled: !!selectedCustomerId }
  );
  const createMutation = trpc.voipPhones.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Phone provisioned! SIP Username: ${data.sipUsername}`);
      setIsCreateOpen(false);
      setNewPhone({ brand: "", model: "", macAddress: "", label: "", location: "", transport: "UDP" });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create phone");
    },
  });
  const deleteMutation = trpc.voipPhones.delete.useMutation({
    onSuccess: () => {
      toast.success("Phone deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete phone");
    },
  });

  const filteredPhones = phones?.filter(
    (p) =>
      (p.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.model?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.macAddress?.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  const handleCreate = () => {
    if (!selectedCustomerId) {
      toast.error("Select a customer first");
      return;
    }
    createMutation.mutate({ customerId: selectedCustomerId, ...newPhone });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "online": return <Wifi className="h-4 w-4 text-green-500" />;
      case "offline": return <WifiOff className="h-4 w-4 text-red-500" />;
      case "provisioning": return <Monitor className="h-4 w-4 text-yellow-500" />;
      default: return <WifiOff className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <AdminLayout title="VoIP Phones">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex gap-4 flex-1">
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
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search phones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!selectedCustomerId}>
                <Plus className="mr-2 h-4 w-4" />
                Add Phone
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add VoIP Phone</DialogTitle>
                <DialogDescription>
                  Register a desk phone. SIP credentials will be auto-generated.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Brand</Label>
                  <Input
                    value={newPhone.brand}
                    onChange={(e) => setNewPhone({ ...newPhone, brand: e.target.value })}
                    placeholder="Yealink, Polycom, Grandstream..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Model</Label>
                  <Input
                    value={newPhone.model}
                    onChange={(e) => setNewPhone({ ...newPhone, model: e.target.value })}
                    placeholder="T54W, VVX 450..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label>MAC Address</Label>
                  <Input
                    value={newPhone.macAddress}
                    onChange={(e) => setNewPhone({ ...newPhone, macAddress: e.target.value })}
                    placeholder="AA:BB:CC:DD:EE:FF"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Label</Label>
                  <Input
                    value={newPhone.label}
                    onChange={(e) => setNewPhone({ ...newPhone, label: e.target.value })}
                    placeholder="Front Desk, Conference Room..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Location</Label>
                  <Input
                    value={newPhone.location}
                    onChange={(e) => setNewPhone({ ...newPhone, location: e.target.value })}
                    placeholder="Main Office, Floor 2..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Transport</Label>
                  <Select
                    value={newPhone.transport}
                    onValueChange={(v: "UDP" | "TCP" | "TLS") => setNewPhone({ ...newPhone, transport: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UDP">UDP</SelectItem>
                      <SelectItem value="TCP">TCP</SelectItem>
                      <SelectItem value="TLS">TLS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Provisioning..." : "Add Phone"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>VoIP Phones</CardTitle>
            <CardDescription>Physical desk phones and their SIP registration status</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedCustomerId ? (
              <p className="text-center py-12 text-muted-foreground">Select a customer to view their phones</p>
            ) : isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : filteredPhones.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground">No phones registered yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Brand / Model</TableHead>
                    <TableHead>MAC Address</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>SIP User</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPhones.map((phone) => (
                    <TableRow key={phone.id}>
                      <TableCell>{statusIcon(phone.status)}</TableCell>
                      <TableCell className="font-medium">{phone.label || "-"}</TableCell>
                      <TableCell>{[phone.brand, phone.model].filter(Boolean).join(" ") || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{phone.macAddress || "-"}</TableCell>
                      <TableCell>{phone.location || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{phone.sipUsername || "-"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                if (confirm("Delete this phone and its SIP credentials?")) {
                                  deleteMutation.mutate({ id: phone.id });
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
    </AdminLayout>
  );
}
