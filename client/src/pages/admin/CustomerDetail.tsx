import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Phone, Users, PhoneCall, Save, Palette } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export default function AdminCustomerDetail() {
  const params = useParams<{ id: string }>();
  const customerId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();

  const { data: customer, isLoading, refetch } = trpc.customers.getById.useQuery({ id: customerId });
  const { data: endpoints } = trpc.sipEndpoints.list.useQuery({ customerId });
  const { data: phoneNumbers } = trpc.phoneNumbers.list.useQuery({ customerId });
  const { data: ringGroups } = trpc.ringGroups.list.useQuery({ customerId });
  const { data: plans } = trpc.servicePlans.listActive.useQuery();

  const [formData, setFormData] = useState({
    name: "",
    companyName: "",
    email: "",
    phone: "",
    status: "pending" as "active" | "suspended" | "pending" | "cancelled",
    telnyxConnectionId: "",
    telnyxApiKey: "",
    telnyxMessagingProfileId: "",
    brandingLogo: "",
    brandingPrimaryColor: "#6366f1",
    brandingCompanyName: "",
    planId: null as number | null,
  });

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || "",
        companyName: customer.companyName || "",
        email: customer.email || "",
        phone: customer.phone || "",
        status: customer.status,
        telnyxConnectionId: customer.telnyxConnectionId || "",
        telnyxApiKey: customer.telnyxApiKey || "",
        telnyxMessagingProfileId: customer.telnyxMessagingProfileId || "",
        brandingLogo: customer.brandingLogo || "",
        brandingPrimaryColor: customer.brandingPrimaryColor || "#6366f1",
        brandingCompanyName: customer.brandingCompanyName || "",
        planId: (customer as any).planId ?? null,
      });
    }
  }, [customer]);

  const updateMutation = trpc.customers.update.useMutation({
    onSuccess: () => {
      toast.success("Customer updated successfully");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update customer");
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      id: customerId,
      ...formData,
    });
  };

  if (isLoading) {
    return (
      <AdminLayout title="Customer Details">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!customer) {
    return (
      <AdminLayout title="Customer Not Found">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Customer not found</p>
          <Button onClick={() => setLocation('/admin/customers')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={customer.name}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/admin/customers')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{customer.name}</h2>
            <p className="text-muted-foreground">{customer.companyName || customer.email}</p>
          </div>
          <span className={`text-sm px-3 py-1 rounded-full ${
            customer.status === 'active' ? 'bg-green-100 text-green-700' :
            customer.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
            customer.status === 'suspended' ? 'bg-red-100 text-red-700' :
            'bg-slate-100 text-slate-700'
          }`}>
            {customer.status}
          </span>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SIP Endpoints</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{endpoints?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Phone Numbers</CardTitle>
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{phoneNumbers?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ring Groups</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ringGroups?.length || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="telnyx">Telnyx</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>General Information</CardTitle>
                <CardDescription>Basic customer details and contact information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Contact Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: "active" | "suspended" | "pending" | "cancelled") => 
                        setFormData({ ...formData, status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="planId">Service Plan</Label>
                    <Select
                      value={formData.planId?.toString() || "none"}
                      onValueChange={(value) =>
                        setFormData({ ...formData, planId: value === "none" ? null : parseInt(value) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No plan assigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No plan assigned</SelectItem>
                        {plans?.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id.toString()}>
                            {plan.name} — ${((plan.monthlyPrice || 0) / 100).toFixed(2)}/mo
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="telnyx">
            <Card>
              <CardHeader>
                <CardTitle>Telnyx Integration</CardTitle>
                <CardDescription>Configure the Telnyx connection for this customer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="connectionId">Connection ID</Label>
                    <Input
                      id="connectionId"
                      value={formData.telnyxConnectionId}
                      onChange={(e) => setFormData({ ...formData, telnyxConnectionId: e.target.value })}
                      placeholder="xxxxxxxxxxxxxxxx"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={formData.telnyxApiKey}
                      onChange={(e) => setFormData({ ...formData, telnyxApiKey: e.target.value })}
                      placeholder="KEY..."
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="messagingProfileId">Messaging Profile ID</Label>
                    <Input
                      id="messagingProfileId"
                      value={formData.telnyxMessagingProfileId}
                      onChange={(e) => setFormData({ ...formData, telnyxMessagingProfileId: e.target.value })}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    />
                  </div>
                </div>
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <CardTitle>White-Label Branding</CardTitle>
                <CardDescription>Customize the customer portal appearance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="brandingCompanyName">Display Company Name</Label>
                    <Input
                      id="brandingCompanyName"
                      value={formData.brandingCompanyName}
                      onChange={(e) => setFormData({ ...formData, brandingCompanyName: e.target.value })}
                      placeholder="Customer's brand name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="brandingPrimaryColor">Primary Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="brandingPrimaryColor"
                        type="color"
                        value={formData.brandingPrimaryColor}
                        onChange={(e) => setFormData({ ...formData, brandingPrimaryColor: e.target.value })}
                        className="w-16 h-10 p-1"
                      />
                      <Input
                        value={formData.brandingPrimaryColor}
                        onChange={(e) => setFormData({ ...formData, brandingPrimaryColor: e.target.value })}
                        placeholder="#6366f1"
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="brandingLogo">Logo URL</Label>
                    <Input
                      id="brandingLogo"
                      value={formData.brandingLogo}
                      onChange={(e) => setFormData({ ...formData, brandingLogo: e.target.value })}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>
                </div>
                {formData.brandingLogo && (
                  <div className="p-4 border rounded-lg bg-slate-50">
                    <p className="text-sm text-muted-foreground mb-2">Logo Preview:</p>
                    <img 
                      src={formData.brandingLogo} 
                      alt="Logo preview" 
                      className="max-h-16 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  <Palette className="mr-2 h-4 w-4" />
                  {updateMutation.isPending ? "Saving..." : "Save Branding"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
