import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Wifi, WifiOff, Monitor, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function CustomerVoipPhones() {
  const { user } = useAuth();
  const customerId = user?.customerId || 0;

  const { data: phones, isLoading } = trpc.voipPhones.list.useQuery(
    { customerId },
    { enabled: !!customerId }
  );

  const statusIcon = (status: string) => {
    switch (status) {
      case "online": return <Wifi className="h-4 w-4 text-green-500" />;
      case "offline": return <WifiOff className="h-4 w-4 text-red-500" />;
      case "provisioning": return <Monitor className="h-4 w-4 text-yellow-500" />;
      default: return <WifiOff className="h-4 w-4 text-slate-400" />;
    }
  };

  const statusLabel = (status: string) => {
    const styles: Record<string, string> = {
      online: "bg-green-100 text-green-700",
      offline: "bg-red-100 text-red-700",
      provisioning: "bg-yellow-100 text-yellow-700",
      error: "bg-red-100 text-red-700",
    };
    return (
      <span className={`text-xs px-2 py-1 rounded-full ${styles[status] || "bg-slate-100 text-slate-700"}`}>
        {status}
      </span>
    );
  };

  return (
    <CustomerLayout title="VoIP Phones">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Your Desk Phones
            </CardTitle>
            <CardDescription>
              Physical VoIP phones registered to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!customerId ? (
              <p className="text-center py-12 text-muted-foreground">No customer account linked</p>
            ) : isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (phones?.length || 0) === 0 ? (
              <p className="text-center py-12 text-muted-foreground">
                No phones registered. Contact your administrator to add phones.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>SIP Server</TableHead>
                    <TableHead>Transport</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {phones?.map((phone) => (
                    <TableRow key={phone.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {statusIcon(phone.status)}
                          {statusLabel(phone.status)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{phone.label || "-"}</TableCell>
                      <TableCell>{[phone.brand, phone.model].filter(Boolean).join(" ") || "-"}</TableCell>
                      <TableCell>{phone.location || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{phone.sipServer || "-"}</TableCell>
                      <TableCell>{phone.transport || "UDP"}</TableCell>
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
