import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Phone, Search, Plus, Trash2, Loader2 } from "lucide-react";

export default function AdminPhoneNumbers() {
  const [searchAreaCode, setSearchAreaCode] = useState("");
  const [searchState, setSearchState] = useState("");
  const [searchType, setSearchType] = useState<"local" | "toll_free">("local");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<string>("");

  const { data: telnyxStatus } = trpc.telnyxApi.status.useQuery();
  const { data: ownedNumbers, isLoading: loadingOwned, refetch: refetchOwned } = trpc.telnyxApi.listPhoneNumbers.useQuery();

  const searchNumbers = trpc.telnyxApi.searchPhoneNumbers.useQuery(
    {
      country_code: "US",
      national_destination_code: searchAreaCode || undefined,
      administrative_area: searchState || undefined,
      number_type: searchType,
      limit: 20,
    },
    { enabled: false }
  );

  const purchaseNumber = trpc.telnyxApi.purchasePhoneNumber.useMutation({
    onSuccess: () => {
      toast.success("Phone number purchased successfully!");
      setIsPurchaseDialogOpen(false);
      setSelectedNumber("");
      refetchOwned();
    },
    onError: (error) => {
      toast.error(`Failed to purchase number: ${error.message}`);
    },
  });

  const releaseNumber = trpc.telnyxApi.deletePhoneNumber.useMutation({
    onSuccess: () => {
      toast.success("Phone number released successfully!");
      refetchOwned();
    },
    onError: (error) => {
      toast.error(`Failed to release number: ${error.message}`);
    },
  });

  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const result = await searchNumbers.refetch();
      if (result.data?.data) {
        setSearchResults(result.data.data);
      } else {
        setSearchResults([]);
      }
    } catch {
      toast.error("Failed to search phone numbers");
    } finally {
      setIsSearching(false);
    }
  };

  const handlePurchase = () => {
    if (!selectedNumber) return;
    purchaseNumber.mutate({ phoneNumber: selectedNumber });
  };

  const handleRelease = (id: string) => {
    if (confirm("Are you sure you want to release this phone number? This action cannot be undone.")) {
      releaseNumber.mutate({ id });
    }
  };

  const formatPhoneNumber = (number: string) => {
    if (number.startsWith("+1") && number.length === 12) {
      return `(${number.slice(2, 5)}) ${number.slice(5, 8)}-${number.slice(8)}`;
    }
    return number;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Phone Numbers</h1>
            <p className="text-muted-foreground">Search and purchase phone numbers from Telnyx</p>
          </div>
          {telnyxStatus && (
            <Badge variant={telnyxStatus.configured ? "default" : "destructive"}>
              Telnyx: {telnyxStatus.configured ? "Connected" : "Not Configured"}
            </Badge>
          )}
        </div>

        {/* Search Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Available Numbers
            </CardTitle>
            <CardDescription>
              Find available phone numbers to purchase for your customers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Number Type</Label>
                <Select value={searchType} onValueChange={(v) => setSearchType(v as "local" | "toll_free")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="toll_free">Toll-Free</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Area Code</Label>
                <Input
                  placeholder="e.g., 415"
                  value={searchAreaCode}
                  onChange={(e) => setSearchAreaCode(e.target.value)}
                  maxLength={3}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  placeholder="e.g., CA"
                  value={searchState}
                  onChange={(e) => setSearchState(e.target.value)}
                  maxLength={2}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleSearch} disabled={isSearching} className="w-full">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                  Search
                </Button>
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-3">Available Numbers ({searchResults.length})</h3>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {searchResults.slice(0, 12).map((number: any) => (
                    <div
                      key={number.phone_number}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                      onClick={() => {
                        setSelectedNumber(number.phone_number);
                        setIsPurchaseDialogOpen(true);
                      }}
                    >
                      <div>
                        <p className="font-mono font-medium">{formatPhoneNumber(number.phone_number)}</p>
                        <p className="text-xs text-muted-foreground">{number.locality}, {number.region_information?.[0]?.region_name}</p>
                      </div>
                      <Plus className="h-4 w-4 text-primary" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Owned Numbers Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Your Phone Numbers
            </CardTitle>
            <CardDescription>
              Phone numbers currently owned in your Telnyx account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingOwned ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : ownedNumbers?.data?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Connection</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownedNumbers.data.map((number: any) => (
                    <TableRow key={number.id}>
                      <TableCell className="font-mono font-medium">
                        {formatPhoneNumber(number.phone_number)}
                      </TableCell>
                      <TableCell>{number.connection_name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={number.status === "active" ? "default" : "outline"}>
                          {number.status || "active"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {number.created_at ? new Date(number.created_at).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRelease(number.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No phone numbers found</p>
                <p className="text-sm">Search and purchase numbers above to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Purchase Dialog */}
        <Dialog open={isPurchaseDialogOpen} onOpenChange={setIsPurchaseDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Purchase Phone Number</DialogTitle>
              <DialogDescription>
                You are about to purchase the following phone number from Telnyx.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-accent rounded-lg text-center">
                <p className="text-2xl font-mono font-bold">{formatPhoneNumber(selectedNumber)}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPurchaseDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePurchase} disabled={purchaseNumber.isPending}>
                {purchaseNumber.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Purchase Number
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
