import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Ship, Phone, Calendar, AlertCircle, CheckCircle2, Clock, ArrowRight } from "lucide-react";

const DEMO_CUSTOMER_ID = 1;

function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary">Draft</Badge>;
    case "submitted":
      return <Badge variant="outline" className="border-blue-300 text-blue-700">Submitted</Badge>;
    case "in_process":
      return <Badge variant="outline" className="border-yellow-300 text-yellow-700">In Progress</Badge>;
    case "exception":
      return <Badge variant="destructive">Exception</Badge>;
    case "foc_date_confirmed":
      return <Badge variant="outline" className="border-green-300 text-green-700">FOC Confirmed</Badge>;
    case "ported":
      return <Badge className="bg-green-600">Ported</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getStatusDescription(status: string): string {
  switch (status) {
    case "draft":
      return "Port order is being prepared. Your admin will submit it when ready.";
    case "submitted":
      return "Port order has been submitted to the carrier. Awaiting processing.";
    case "in_process":
      return "Your number is being transferred. This typically takes 1-4 weeks.";
    case "exception":
      return "There's an issue with the port order. Your admin has been notified.";
    case "foc_date_confirmed":
      return "Port date confirmed! Your number will transfer on the scheduled date.";
    case "ported":
      return "Transfer complete! Your number is now active on the new system.";
    case "cancelled":
      return "This port order has been cancelled.";
    default:
      return "";
  }
}

export default function PortingStatus() {
  const { user } = useAuth();
  const customerId = user?.customerId || DEMO_CUSTOMER_ID;

  const { data: portOrders, isLoading } = trpc.portOrders.listByCustomer.useQuery({ customerId });

  const activeOrders = portOrders?.filter(o => !["cancelled", "ported"].includes(o.status)) || [];
  const completedOrders = portOrders?.filter(o => ["cancelled", "ported"].includes(o.status)) || [];

  return (
    <CustomerLayout title="Porting Status">
      <div className="space-y-6">
        {/* Status Overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{activeOrders.length}</p>
                <p className="text-xs text-muted-foreground">Active Port Orders</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{completedOrders.filter(o => o.status === "ported").length}</p>
                <p className="text-xs text-muted-foreground">Successfully Ported</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 flex items-center gap-3">
              <Phone className="h-5 w-5 text-indigo-600" />
              <div>
                <p className="text-2xl font-bold">
                  {portOrders?.reduce((sum, o) => sum + ((o.phoneNumbers as string[])?.length || 0), 0) || 0}
                </p>
                <p className="text-xs text-muted-foreground">Total Numbers</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Port Orders */}
        {activeOrders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ship className="h-5 w-5" />
                Active Port Orders
              </CardTitle>
              <CardDescription>Numbers currently being transferred to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeOrders.map((order) => {
                  const phones = (order.phoneNumbers as string[]) || [];
                  return (
                    <div key={order.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusBadge(order.status)}
                          <span className="text-sm font-medium">
                            Port Order #{order.id}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Created {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Status description */}
                      <p className="text-sm text-muted-foreground">
                        {getStatusDescription(order.status)}
                      </p>

                      {/* Phone numbers */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Numbers being ported:</p>
                        <div className="flex flex-wrap gap-2">
                          {phones.map((phone, i) => (
                            <span key={i} className="font-mono text-sm bg-muted px-2 py-1 rounded">
                              {phone}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* FOC Date */}
                      {order.focDate && (
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-green-600" />
                          <span>
                            Scheduled transfer date: <strong>{new Date(order.focDate).toLocaleDateString()}</strong>
                          </span>
                        </div>
                      )}

                      {/* Error message */}
                      {order.lastError && order.status === "exception" && (
                        <div className="flex items-start gap-2 text-sm bg-red-50 text-red-700 rounded p-3">
                          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{order.lastError}</span>
                        </div>
                      )}

                      {/* Progress indicator */}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {["draft", "submitted", "in_process", "foc_date_confirmed", "ported"].map((step, i) => (
                          <div key={step} className="flex items-center gap-1">
                            <div className={`h-2 w-2 rounded-full ${
                              step === order.status
                                ? "bg-blue-600"
                                : ["draft", "submitted", "in_process", "foc_date_confirmed", "ported"]
                                    .indexOf(order.status) >= i
                                  ? "bg-green-500"
                                  : "bg-gray-200"
                            }`} />
                            {i < 4 && <div className="w-6 h-px bg-gray-200" />}
                          </div>
                        ))}
                        <span className="ml-2">
                          {order.status === "draft" && "Step 1/5"}
                          {order.status === "submitted" && "Step 2/5"}
                          {order.status === "in_process" && "Step 3/5"}
                          {order.status === "foc_date_confirmed" && "Step 4/5"}
                          {order.status === "ported" && "Complete"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Completed / History */}
        <Card>
          <CardHeader>
            <CardTitle>Port Order History</CardTitle>
            <CardDescription>
              {completedOrders.length === 0 && activeOrders.length === 0
                ? "No port orders found. Contact your administrator to port numbers."
                : "Previously completed or cancelled port orders"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : completedOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Numbers</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedOrders.map((order) => {
                    const phones = (order.phoneNumbers as string[]) || [];
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">#{order.id}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {phones.slice(0, 3).map((p, i) => (
                              <span key={i} className="font-mono text-xs">{p}</span>
                            ))}
                            {phones.length > 3 && (
                              <span className="text-xs text-muted-foreground">+{phones.length - 3} more</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : activeOrders.length > 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No completed port orders yet.</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Help info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About Number Porting</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>Number porting transfers your existing phone numbers from your current carrier to our platform. Here's what to expect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Timeline:</strong> Porting typically takes 1-4 weeks depending on the carrier and number type.</li>
              <li><strong>During porting:</strong> Your numbers remain active with your current carrier until the transfer completes.</li>
              <li><strong>FOC date:</strong> Once confirmed, this is the date your numbers will transfer. You'll see this in the order details.</li>
              <li><strong>After porting:</strong> Your numbers will immediately start working on the new system. No downtime expected.</li>
              <li><strong>Issues?</strong> If your port order shows an exception, contact your administrator for resolution.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
