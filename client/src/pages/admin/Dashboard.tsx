import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Users, Phone, PhoneCall, Clock, Plus, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";



export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { data: customerStats, isLoading: statsLoading } = trpc.customers.stats.useQuery();
  const { data: usageStats, isLoading: usageLoading } = trpc.usage.global.useQuery();
  const { data: customers, isLoading: customersLoading } = trpc.customers.list.useQuery();

  const recentCustomers = customers?.slice(0, 5) || [];

  return (
    <AdminLayout title="Admin Dashboard">
      <div className="space-y-8">
        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{customerStats?.total || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {customerStats?.active || 0} active, {customerStats?.pending || 0} pending
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Endpoints</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{usageStats?.totalEndpoints || 0}</div>
                  <p className="text-xs text-muted-foreground">SIP endpoints provisioned</p>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{usageStats?.totalCalls?.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground">Across all customers</p>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Minutes</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{usageStats?.totalMinutes?.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground">Call minutes used</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common administrative tasks</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button 
                variant="outline" 
                className="justify-start" 
                onClick={() => setLocation('/admin/customers')}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add New Customer
              </Button>
              <Button 
                variant="outline" 
                className="justify-start"
                onClick={() => setLocation('/admin/customers')}
              >
                <Users className="mr-2 h-4 w-4" />
                Manage Customers
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Customers</CardTitle>
                <CardDescription>Latest customer accounts</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLocation('/admin/customers')}>
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {customersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No customers yet. Add your first customer to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => setLocation(`/admin/customers/${customer.id}`)}
                    >
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-muted-foreground">{customer.email}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        customer.status === 'active' ? 'bg-green-100 text-green-700' :
                        customer.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        customer.status === 'suspended' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {customer.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
