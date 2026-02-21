import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Palette, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const DEMO_CUSTOMER_ID = 1;

export default function CustomerBranding() {
  const { user } = useAuth();
  const customerId = user?.customerId || DEMO_CUSTOMER_ID;
  
  const { data: customer, isLoading, refetch } = trpc.customers.getById.useQuery({ id: customerId });
  
  const [formData, setFormData] = useState({
    brandingLogo: "",
    brandingPrimaryColor: "#6366f1",
    brandingCompanyName: "",
  });

  useEffect(() => {
    if (customer) {
      setFormData({
        brandingLogo: customer.brandingLogo || "",
        brandingPrimaryColor: customer.brandingPrimaryColor || "#6366f1",
        brandingCompanyName: customer.brandingCompanyName || "",
      });
    }
  }, [customer]);

  const updateMutation = trpc.customers.update.useMutation({
    onSuccess: () => {
      toast.success("Branding updated successfully");
      refetch();
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to update branding");
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
      <CustomerLayout title="Branding">
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout title="Branding">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Custom Branding
            </CardTitle>
            <CardDescription>
              Customize the appearance of your customer portal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="companyName">Display Company Name</Label>
                <Input
                  id="companyName"
                  value={formData.brandingCompanyName}
                  onChange={(e) => setFormData({ ...formData, brandingCompanyName: e.target.value })}
                  placeholder="Your Company Name"
                />
                <p className="text-xs text-muted-foreground">
                  This name will be displayed in the portal header
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="primaryColor">Primary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="primaryColor"
                    type="color"
                    value={formData.brandingPrimaryColor}
                    onChange={(e) => setFormData({ ...formData, brandingPrimaryColor: e.target.value })}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={formData.brandingPrimaryColor}
                    onChange={(e) => setFormData({ ...formData, brandingPrimaryColor: e.target.value })}
                    placeholder="#6366f1"
                    className="flex-1 font-mono"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Used for buttons, links, and accents
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="logo">Logo URL</Label>
              <Input
                id="logo"
                value={formData.brandingLogo}
                onChange={(e) => setFormData({ ...formData, brandingLogo: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
              <p className="text-xs text-muted-foreground">
                Recommended size: 200x50 pixels, PNG or SVG format
              </p>
            </div>

            {/* Preview Section */}
            <div className="border rounded-lg p-6 bg-slate-50">
              <h3 className="text-sm font-medium mb-4">Preview</h3>
              <div 
                className="border rounded-lg p-4 bg-white"
                style={{ borderColor: formData.brandingPrimaryColor }}
              >
                <div className="flex items-center gap-3 mb-4">
                  {formData.brandingLogo ? (
                    <img 
                      src={formData.brandingLogo} 
                      alt="Logo preview" 
                      className="max-h-10 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div 
                      className="h-10 w-10 rounded flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: formData.brandingPrimaryColor }}
                    >
                      {formData.brandingCompanyName?.charAt(0) || 'P'}
                    </div>
                  )}
                  <span className="font-semibold">
                    {formData.brandingCompanyName || 'Your Company'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 rounded text-white text-sm font-medium"
                    style={{ backgroundColor: formData.brandingPrimaryColor }}
                  >
                    Primary Button
                  </button>
                  <button
                    className="px-4 py-2 rounded border text-sm font-medium"
                    style={{ 
                      borderColor: formData.brandingPrimaryColor,
                      color: formData.brandingPrimaryColor
                    }}
                  >
                    Secondary Button
                  </button>
                </div>
              </div>
            </div>

            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {updateMutation.isPending ? "Saving..." : "Save Branding"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
