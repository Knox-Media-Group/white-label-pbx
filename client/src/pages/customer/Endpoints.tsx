import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Search, MoreHorizontal, Phone, Trash2, Edit } from "lucide-react";
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

export default function CustomerEndpoints() {
  const { user } = useAuth();
  const customerId = user?.customerId || DEMO_CUSTOMER_ID;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState({
    username: "",
    displayName: "",
    extensionNumber: "",
    callerId: "",
    callHandler: "texml_webhooks" as "texml_webhooks" | "call_control" | "ai_agent" | "video_room",
  });

  const { data: endpoints, isLoading, refetch } = trpc.sipEndpoints.list.useQuery({ customerId });
  
  const createMutation = trpc.sipEndpoints.create.useMutation({
    onSuccess: () => {
      toast.success("Endpoint created successfully");
      setIsCreateOpen(false);
      setNewEndpoint({ username: "", displayName: "", extensionNumber: "", callerId: "", callHandler: "texml_webhooks" });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create endpoint");
    },
  });
  
  const deleteMutation = trpc.sipEndpoints.delete.useMutation({
    onSuccess: () => {
      toast.success("Endpoint deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete endpoint");
    },
  });

  const filteredEndpoints = endpoints?.filter(
    (e) =>
      e.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.extensionNumber?.includes(searchQuery)
  ) || [];

  const handleCreate = () => {
    if (!newEndpoint.username) {
      toast.error("Username is required");
      return;
    }
    createMutation.mutate({ customerId, ...newEndpoint });
  };

  return (
    <CustomerLayout title="SIP Endpoints">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search endpoints..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Endpoint
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create SIP Endpoint</DialogTitle>
                <DialogDescription>
                  Add a new SIP endpoint for your PBX system
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="username">Username *</Label>
                  <Input
                    id="username"
                    value={newEndpoint.username}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, username: e.target.value })}
                    placeholder="user1001"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={newEndpoint.displayName}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, displayName: e.target.value })}
                    placeholder="John Smith"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="extension">Extension Number</Label>
                  <Input
                    id="extension"
                    value={newEndpoint.extensionNumber}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, extensionNumber: e.target.value })}
                    placeholder="1001"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="callerId">Caller ID</Label>
                  <Input
                    id="callerId"
                    value={newEndpoint.callerId}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, callerId: e.target.value })}
                    placeholder="+15551234567"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="callHandler">Call Handler</Label>
                  <Select
                    value={newEndpoint.callHandler}
                    onValueChange={(value) => 
                      setNewEndpoint({ ...newEndpoint, callHandler: value as typeof newEndpoint.callHandler })
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
                  {createMutation.isPending ? "Creating..." : "Create Endpoint"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Endpoints Table */}
        <Card>
          <CardHeader>
            <CardTitle>SIP Endpoints</CardTitle>
            <CardDescription>
              Manage your SIP endpoints and their configurations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredEndpoints.length === 0 ? (
              <div className="text-center py-12">
                <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No endpoints match your search" : "No endpoints yet. Create your first SIP endpoint."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Extension</TableHead>
                    <TableHead>Call Handler</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEndpoints.map((endpoint) => (
                    <TableRow key={endpoint.id}>
                      <TableCell className="font-medium">{endpoint.username}</TableCell>
                      <TableCell>{endpoint.displayName || "-"}</TableCell>
                      <TableCell>{endpoint.extensionNumber || "-"}</TableCell>
                      <TableCell>
                        <span className="text-xs bg-slate-100 px-2 py-1 rounded">
                          {endpoint.callHandler?.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          endpoint.status === 'active' ? 'bg-green-100 text-green-700' :
                          endpoint.status === 'provisioning' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {endpoint.status}
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
                            <DropdownMenuItem onClick={() => toast.info("Edit feature coming soon")}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this endpoint?")) {
                                  deleteMutation.mutate({ id: endpoint.id });
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
    </CustomerLayout>
  );
}
