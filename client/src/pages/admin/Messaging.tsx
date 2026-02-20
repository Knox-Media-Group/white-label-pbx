import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { MessageSquare, Send, ArrowDownLeft, ArrowUpRight, Loader2, ChevronDown, ChevronUp } from "lucide-react";

export default function AdminMessaging() {
  // Compose SMS state
  const [composeCustomerId, setComposeCustomerId] = useState<string>("");
  const [fromNumber, setFromNumber] = useState("");
  const [toNumber, setToNumber] = useState("");
  const [messageBody, setMessageBody] = useState("");

  // History state
  const [historyCustomerId, setHistoryCustomerId] = useState<string>("");
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  // Data queries
  const { data: customers, isLoading: customersLoading } = trpc.customers.list.useQuery();

  const { data: phoneNumbers, isLoading: phoneNumbersLoading } = trpc.phoneNumbers.list.useQuery(
    { customerId: parseInt(composeCustomerId) },
    { enabled: !!composeCustomerId }
  );

  const smsEnabledNumbers = phoneNumbers?.filter((pn: any) => pn.smsEnabled) || [];

  const { data: messages, isLoading: messagesLoading, refetch: refetchMessages } = trpc.sms.list.useQuery(
    { customerId: parseInt(historyCustomerId || "0"), limit: 50 },
    { enabled: !!historyCustomerId }
  );

  // Send SMS mutation
  const sendSms = trpc.sms.send.useMutation({
    onSuccess: () => {
      toast.success("SMS sent successfully!");
      setToNumber("");
      setMessageBody("");
      refetchMessages();
    },
    onError: (error) => {
      toast.error(`Failed to send SMS: ${error.message}`);
    },
  });

  const handleSend = () => {
    if (!composeCustomerId) {
      toast.error("Please select a customer");
      return;
    }
    if (!fromNumber) {
      toast.error("Please select a From number");
      return;
    }
    if (!toNumber) {
      toast.error("Please enter a To number");
      return;
    }
    if (!messageBody.trim()) {
      toast.error("Please enter a message");
      return;
    }

    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(toNumber)) {
      toast.error("To number must be in E.164 format (e.g., +14155551234)");
      return;
    }

    sendSms.mutate({
      customerId: parseInt(composeCustomerId),
      fromNumber,
      toNumber,
      body: messageBody.trim(),
    });
  };

  // Reset from number when customer changes
  const handleComposeCustomerChange = (value: string) => {
    setComposeCustomerId(value);
    setFromNumber("");
  };

  const formatPhoneNumber = (number: string) => {
    if (number.startsWith("+1") && number.length === 12) {
      return `(${number.slice(2, 5)}) ${number.slice(5, 8)}-${number.slice(8)}`;
    }
    return number;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const truncateBody = (body: string, maxLength = 60) => {
    if (body.length <= maxLength) return body;
    return body.slice(0, maxLength) + "...";
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "delivered":
        return "default";
      case "sent":
        return "secondary";
      case "failed":
      case "undelivered":
        return "destructive";
      case "queued":
      case "sending":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getCustomerName = (customerId: string) => {
    const customer = customers?.find((c: any) => c.id === customerId);
    return customer?.name || "Unknown";
  };

  return (
    <AdminLayout title="SMS Messaging">
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold">SMS Messaging</h1>
          <p className="text-muted-foreground">
            Send and manage SMS messages for your customers via Telnyx
          </p>
        </div>

        {/* Compose SMS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Compose SMS
            </CardTitle>
            <CardDescription>
              Send a new text message on behalf of a customer
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Customer Selector */}
              <div className="space-y-2">
                <Label htmlFor="compose-customer">Customer</Label>
                <Select value={composeCustomerId} onValueChange={handleComposeCustomerChange}>
                  <SelectTrigger id="compose-customer">
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customersLoading ? (
                      <SelectItem value="_loading" disabled>
                        Loading customers...
                      </SelectItem>
                    ) : customers && customers.length > 0 ? (
                      customers.map((customer: any) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="_empty" disabled>
                        No customers found
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* From Number Selector */}
              <div className="space-y-2">
                <Label htmlFor="from-number">From Number</Label>
                <Select
                  value={fromNumber}
                  onValueChange={setFromNumber}
                  disabled={!composeCustomerId}
                >
                  <SelectTrigger id="from-number">
                    <SelectValue
                      placeholder={
                        !composeCustomerId
                          ? "Select a customer first"
                          : phoneNumbersLoading
                            ? "Loading numbers..."
                            : "Select a number"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {phoneNumbersLoading ? (
                      <SelectItem value="_loading" disabled>
                        Loading numbers...
                      </SelectItem>
                    ) : smsEnabledNumbers.length > 0 ? (
                      smsEnabledNumbers.map((pn: any) => (
                        <SelectItem key={pn.id} value={pn.phoneNumber}>
                          {formatPhoneNumber(pn.phoneNumber)}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="_empty" disabled>
                        No SMS-enabled numbers
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {composeCustomerId && !phoneNumbersLoading && smsEnabledNumbers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    This customer has no SMS-enabled phone numbers.
                  </p>
                )}
              </div>

              {/* To Number */}
              <div className="space-y-2">
                <Label htmlFor="to-number">To Number</Label>
                <Input
                  id="to-number"
                  placeholder="+14155551234"
                  value={toNumber}
                  onChange={(e) => setToNumber(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  E.164 format required (e.g., +14155551234)
                </p>
              </div>

              {/* Message Body */}
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="message-body">Message</Label>
                <Textarea
                  id="message-body"
                  placeholder="Type your message here..."
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  rows={4}
                  maxLength={1600}
                />
                <div className="flex justify-between">
                  <p className="text-xs text-muted-foreground">
                    {messageBody.length > 160
                      ? `${Math.ceil(messageBody.length / 160)} segments`
                      : "1 segment"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {messageBody.length}/1600 characters
                  </p>
                </div>
              </div>

              {/* Send Button */}
              <div className="md:col-span-2 flex justify-end">
                <Button
                  onClick={handleSend}
                  disabled={
                    sendSms.isPending ||
                    !composeCustomerId ||
                    !fromNumber ||
                    !toNumber ||
                    !messageBody.trim()
                  }
                >
                  {sendSms.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send Message
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Message History */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Message History
                </CardTitle>
                <CardDescription>
                  View sent and received SMS messages
                </CardDescription>
              </div>
              <div className="w-full sm:w-64">
                <Select
                  value={historyCustomerId}
                  onValueChange={setHistoryCustomerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers?.map((customer: any) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {messagesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !messages || messages.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                <p className="text-muted-foreground">No messages found</p>
                <p className="text-sm text-muted-foreground">
                  {historyCustomerId && historyCustomerId !== "all"
                    ? "Try selecting a different customer or viewing all customers"
                    : "Send your first message using the compose form above"}
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Direction</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead className="hidden md:table-cell">Message</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.map((message: any) => (
                      <>
                        <TableRow
                          key={message.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() =>
                            setExpandedMessageId(
                              expandedMessageId === message.id ? null : message.id
                            )
                          }
                        >
                          <TableCell>
                            {message.direction === "inbound" ? (
                              <Badge variant="outline" className="gap-1">
                                <ArrowDownLeft className="h-3 w-3" />
                                In
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <ArrowUpRight className="h-3 w-3" />
                                Out
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {formatPhoneNumber(message.fromNumber)}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {formatPhoneNumber(message.toNumber)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell max-w-[200px]">
                            <span className="text-sm text-muted-foreground">
                              {truncateBody(message.body)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(message.status)}>
                              {message.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm">
                            {getCustomerName(message.customerId)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(message.createdAt)}
                          </TableCell>
                          <TableCell>
                            {expandedMessageId === message.id ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedMessageId === message.id && (
                          <TableRow key={`${message.id}-expanded`}>
                            <TableCell colSpan={8} className="bg-slate-50">
                              <div className="p-4 space-y-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <p className="font-medium text-muted-foreground">Direction</p>
                                    <p className="capitalize">{message.direction}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">From</p>
                                    <p className="font-mono">{formatPhoneNumber(message.fromNumber)}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">To</p>
                                    <p className="font-mono">{formatPhoneNumber(message.toNumber)}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">Status</p>
                                    <Badge variant={getStatusVariant(message.status)}>
                                      {message.status}
                                    </Badge>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">Customer</p>
                                    <p>{getCustomerName(message.customerId)}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">Date</p>
                                    <p>{formatDate(message.createdAt)}</p>
                                  </div>
                                  <div>
                                    <p className="font-medium text-muted-foreground">Message ID</p>
                                    <p className="font-mono text-xs">{message.id}</p>
                                  </div>
                                </div>
                                <div>
                                  <p className="font-medium text-muted-foreground text-sm mb-1">Full Message</p>
                                  <div className="bg-white border rounded-md p-3 text-sm whitespace-pre-wrap">
                                    {message.body}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
