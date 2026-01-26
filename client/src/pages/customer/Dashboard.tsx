import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Phone, PhoneCall, Users, Clock, ArrowRight, Bell } from "lucide-react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/_core/hooks/useAuth";

// Demo customer ID - in production this would come from user.customerId
const DEMO_CUSTOMER_ID = 1;

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const customerId = user?.customerId || DEMO_CUSTOMER_ID;

  const { data: endpoints, isLoading: endpointsLoading } = trpc.sipEndpoints.list.useQuery({ customerId });
  const { data: phoneNumbers, isLoading: phonesLoading } = trpc.phoneNumbers.list.useQuery({ customerId });
  const { data: ringGroups, isLoading: groupsLoading } = trpc.ringGroups.list.useQuery({ customerId });
  const { data: notifications } = trpc.notifications.unread.useQuery({ customerId });

  const isLoading = endpointsLoading || phonesLoading || groupsLoading;

  return (
    <CustomerLayout title="Dashboard">
      <div className="space-y-8">
        {/* Notifications Banner */}
        {notifications && notifications.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="flex items-center gap-4 py-4">
              <Bell className="h-5 w-5 text-yellow-600" />
              <div className="flex-1">
                <p className="font-medium text-yellow-800">
                  You have {notifications.length} unread notification{notifications.length > 1 ? 's' : ''}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setLocation('/portal/settings')}>
                View All
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SIP Endpoints</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{endpoints?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {endpoints?.filter(e => e.status === 'active').length || 0} active
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Phone Numbers</CardTitle>
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{phoneNumbers?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {phoneNumbers?.filter(p => p.status === 'active').length || 0} active
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ring Groups</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{ringGroups?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {ringGroups?.filter(g => g.status === 'active').length || 0} active
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Total calls</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer" onClick={() => setLocation('/portal/endpoints')}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Manage Endpoints</span>
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                Create and configure SIP endpoints for your team
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer" onClick={() => setLocation('/portal/phone-numbers')}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Phone Numbers</span>
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                Manage your phone numbers and assignments
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer" onClick={() => setLocation('/portal/ring-groups')}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Ring Groups</span>
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                Set up call distribution groups
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer" onClick={() => setLocation('/portal/call-routes')}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Call Routing</span>
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                Configure intelligent call routing rules
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer" onClick={() => setLocation('/portal/recordings')}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Recordings</span>
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                Access and manage call recordings
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer" onClick={() => setLocation('/portal/branding')}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Branding</span>
                <ArrowRight className="h-4 w-4" />
              </CardTitle>
              <CardDescription>
                Customize your portal appearance
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </CustomerLayout>
  );
}
