import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRightLeft, CheckCircle, XCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function CustomerPortOrders() {
  const { user } = useAuth();
  const customerId = user?.customerId || 0;

  const { data: orders, isLoading } = trpc.portOrders.list.useQuery(
    { customerId },
    { enabled: !!customerId }
  );

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
    <CustomerLayout title="Port Orders">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Number Port Orders
            </CardTitle>
            <CardDescription>
              Track the status of phone numbers being transferred to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!customerId ? (
              <p className="text-center py-12 text-muted-foreground">No customer account linked</p>
            ) : isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (orders?.length || 0) === 0 ? (
              <p className="text-center py-12 text-muted-foreground">
                No port orders. Contact your administrator to port numbers from another carrier.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Numbers</TableHead>
                    <TableHead>From Carrier</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Completed</TableHead>
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
                        <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {order.completedAt ? new Date(order.completedAt).toLocaleDateString() : "-"}
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
    </CustomerLayout>
  );
}
