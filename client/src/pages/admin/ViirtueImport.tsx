import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, AlertCircle, Loader2, Download, Users, Phone, Headphones, ArrowLeftRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Step = "connect" | "select" | "preview" | "configure" | "importing" | "done";

interface ViirtueCredentials {
  serverUrl: string;
  clientId: string;
  clientSecret: string;
}

interface DomainPreview {
  domain: { domain: string; description: string };
  subscribers: Array<{ user: string; first_name?: string; last_name?: string; number_caller_id?: string; dial?: string }>;
  phoneNumbers: Array<{ dialplan: string; description?: string; from_user?: string }>;
  callQueues: Array<{ queue: string; description?: string; agents?: string[]; strategy?: string }>;
  autoAttendants: Array<{ auto_attendant: string; description?: string }>;
  timeFrames: Array<{ name: string }>;
}

interface ImportResults {
  customerId: number;
  endpoints: { imported: number; failed: number; errors: string[] };
  phoneNumbers: { imported: number; failed: number; errors: string[] };
  ringGroups: { imported: number; failed: number; errors: string[] };
}

export default function ViirtueImport() {
  const [step, setStep] = useState<Step>("connect");
  const [credentials, setCredentials] = useState<ViirtueCredentials>({
    serverUrl: "https://portal.viirtue.com",
    clientId: "",
    clientSecret: "",
  });
  const [domains, setDomains] = useState<Array<{ domain: string; description: string }>>([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [preview, setPreview] = useState<DomainPreview | null>(null);
  const [importConfig, setImportConfig] = useState({
    customerName: "",
    customerEmail: "",
    companyName: "",
    provisionTelnyx: true,
    importPhoneNumbers: true,
    importCallQueues: true,
  });
  const [importResults, setImportResults] = useState<ImportResults | null>(null);

  const testConnectionMutation = trpc.viirtueImport.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Connected! Found ${data.domains} domains.`);
      } else {
        toast.error(data.error || "Connection failed");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Connection failed");
    },
  });

  const listDomainsMutation = trpc.viirtueImport.listDomains.useMutation({
    onSuccess: (data) => {
      setDomains(data);
      setStep("select");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to list domains");
    },
  });

  const previewDomainMutation = trpc.viirtueImport.previewDomain.useMutation({
    onSuccess: (data) => {
      setPreview(data as DomainPreview);
      setImportConfig((prev) => ({
        ...prev,
        customerName: data.domain.description || data.domain.domain,
        companyName: data.domain.description || data.domain.domain,
      }));
      setStep("preview");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to load domain data");
    },
  });

  const importMutation = trpc.viirtueImport.importDomain.useMutation({
    onSuccess: (data) => {
      setImportResults(data);
      setStep("done");
      toast.success("Import complete!");
    },
    onError: (error) => {
      toast.error(error.message || "Import failed");
      setStep("configure");
    },
  });

  const handleConnect = () => {
    if (!credentials.serverUrl || !credentials.clientId || !credentials.clientSecret) {
      toast.error("All fields are required");
      return;
    }
    listDomainsMutation.mutate(credentials);
  };

  const handleTestConnection = () => {
    if (!credentials.serverUrl || !credentials.clientId || !credentials.clientSecret) {
      toast.error("All fields are required");
      return;
    }
    testConnectionMutation.mutate(credentials);
  };

  const handleSelectDomain = (domain: string) => {
    setSelectedDomain(domain);
    previewDomainMutation.mutate({ ...credentials, domain });
  };

  const handleStartImport = () => {
    if (!importConfig.customerName || !importConfig.customerEmail) {
      toast.error("Customer name and email are required");
      return;
    }
    setStep("importing");
    importMutation.mutate({
      ...credentials,
      domain: selectedDomain,
      ...importConfig,
    });
  };

  const isLoading =
    testConnectionMutation.isPending ||
    listDomainsMutation.isPending ||
    previewDomainMutation.isPending ||
    importMutation.isPending;

  return (
    <AdminLayout title="Import from Viirtue">
      <div className="max-w-4xl space-y-6">
        {/* Progress Steps */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {(["connect", "select", "preview", "configure", "done"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="h-3 w-3" />}
              <span
                className={`px-2 py-1 rounded ${
                  step === s || (step === "importing" && s === "configure")
                    ? "bg-indigo-100 text-indigo-700 font-medium"
                    : steps.indexOf(step) > steps.indexOf(s)
                    ? "text-green-600"
                    : ""
                }`}
              >
                {s === "connect" && "Connect"}
                {s === "select" && "Select Account"}
                {s === "preview" && "Preview"}
                {s === "configure" && "Configure"}
                {s === "done" && "Done"}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1: Connect */}
        {step === "connect" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" />
                Connect to Viirtue
              </CardTitle>
              <CardDescription>
                Enter your Viirtue/NetSapiens API credentials. You can find these in your Viirtue reseller portal under API settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="serverUrl">Server URL</Label>
                <Input
                  id="serverUrl"
                  value={credentials.serverUrl}
                  onChange={(e) => setCredentials({ ...credentials, serverUrl: e.target.value })}
                  placeholder="https://portal.viirtue.com"
                />
                <p className="text-xs text-muted-foreground">
                  Your Viirtue portal URL, or your white-labeled domain
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="clientId">Client ID (API Key)</Label>
                <Input
                  id="clientId"
                  value={credentials.clientId}
                  onChange={(e) => setCredentials({ ...credentials, clientId: e.target.value })}
                  placeholder="your-api-client-id"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={credentials.clientSecret}
                  onChange={(e) => setCredentials({ ...credentials, clientSecret: e.target.value })}
                  placeholder="your-api-client-secret"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={handleTestConnection} disabled={isLoading}>
                  {testConnectionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Test Connection
                </Button>
                <Button onClick={handleConnect} disabled={isLoading}>
                  {listDomainsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Connect & List Accounts
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Select Domain */}
        {step === "select" && (
          <Card>
            <CardHeader>
              <CardTitle>Select Account to Import</CardTitle>
              <CardDescription>
                Found {domains.length} account{domains.length !== 1 ? "s" : ""} in your Viirtue instance.
                Select one to preview and import.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {domains.length === 0 ? (
                <p className="text-muted-foreground py-4">No domains found. Check your API credentials.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domains.map((d) => (
                      <TableRow key={d.domain}>
                        <TableCell className="font-medium">{d.domain}</TableCell>
                        <TableCell>{d.description || "-"}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => handleSelectDomain(d.domain)}
                            disabled={previewDomainMutation.isPending}
                          >
                            {previewDomainMutation.isPending && selectedDomain === d.domain ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Select"
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="pt-4">
                <Button variant="outline" onClick={() => setStep("connect")}>
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Preview */}
        {step === "preview" && preview && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Preview: {selectedDomain}</CardTitle>
                <CardDescription>
                  Review the data that will be imported from this Viirtue account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Headphones className="h-4 w-4" />
                      Extensions
                    </div>
                    <div className="text-2xl font-bold">{preview.subscribers.length}</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Phone className="h-4 w-4" />
                      Phone Numbers
                    </div>
                    <div className="text-2xl font-bold">{preview.phoneNumbers.length}</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Users className="h-4 w-4" />
                      Call Queues
                    </div>
                    <div className="text-2xl font-bold">{preview.callQueues.length}</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <ArrowLeftRight className="h-4 w-4" />
                      Auto Attendants
                    </div>
                    <div className="text-2xl font-bold">{preview.autoAttendants.length}</div>
                  </div>
                </div>

                {/* Extensions Table */}
                {preview.subscribers.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Extensions / Users</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Extension</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Caller ID</TableHead>
                          <TableHead>DID</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.subscribers.map((sub) => (
                          <TableRow key={sub.user}>
                            <TableCell className="font-mono">{sub.user}</TableCell>
                            <TableCell>
                              {[sub.first_name, sub.last_name].filter(Boolean).join(" ") || "-"}
                            </TableCell>
                            <TableCell>{sub.number_caller_id || "-"}</TableCell>
                            <TableCell>{sub.dial || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Phone Numbers Table */}
                {preview.phoneNumbers.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Phone Numbers (DIDs)</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Number</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Routes To</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.phoneNumbers.map((pn) => (
                          <TableRow key={pn.dialplan}>
                            <TableCell className="font-mono">{pn.dialplan}</TableCell>
                            <TableCell>{pn.description || "-"}</TableCell>
                            <TableCell>{pn.from_user || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Call Queues Table */}
                {preview.callQueues.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Call Queues</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Strategy</TableHead>
                          <TableHead>Agents</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.callQueues.map((q) => (
                          <TableRow key={q.queue}>
                            <TableCell className="font-medium">{q.queue}</TableCell>
                            <TableCell>{q.description || "-"}</TableCell>
                            <TableCell>{q.strategy || "-"}</TableCell>
                            <TableCell>{q.agents?.length || 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button onClick={() => setStep("configure")}>
                Continue to Import
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {/* Step 4: Configure & Import */}
        {(step === "configure" || step === "importing") && (
          <Card>
            <CardHeader>
              <CardTitle>Configure Import</CardTitle>
              <CardDescription>
                Set up the customer account details and import options for {selectedDomain}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="customerName">Customer Name *</Label>
                  <Input
                    id="customerName"
                    value={importConfig.customerName}
                    onChange={(e) => setImportConfig({ ...importConfig, customerName: e.target.value })}
                    disabled={step === "importing"}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="customerEmail">Customer Email *</Label>
                  <Input
                    id="customerEmail"
                    type="email"
                    value={importConfig.customerEmail}
                    onChange={(e) => setImportConfig({ ...importConfig, customerEmail: e.target.value })}
                    placeholder="admin@example.com"
                    disabled={step === "importing"}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={importConfig.companyName}
                    onChange={(e) => setImportConfig({ ...importConfig, companyName: e.target.value })}
                    disabled={step === "importing"}
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <h3 className="font-medium">Import Options</h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={importConfig.provisionTelnyx}
                    onChange={(e) => setImportConfig({ ...importConfig, provisionTelnyx: e.target.checked })}
                    disabled={step === "importing"}
                    className="rounded"
                  />
                  <span>Provision SIP credentials on Telnyx</span>
                  <span className="text-xs text-muted-foreground">(creates live SIP endpoints)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={importConfig.importPhoneNumbers}
                    onChange={(e) => setImportConfig({ ...importConfig, importPhoneNumbers: e.target.checked })}
                    disabled={step === "importing"}
                    className="rounded"
                  />
                  <span>Import phone numbers</span>
                  <span className="text-xs text-muted-foreground">(marked as "porting" — actual port requires separate request)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={importConfig.importCallQueues}
                    onChange={(e) => setImportConfig({ ...importConfig, importCallQueues: e.target.checked })}
                    disabled={step === "importing"}
                    className="rounded"
                  />
                  <span>Import call queues as ring groups</span>
                </label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setStep("preview")} disabled={step === "importing"}>
                  Back
                </Button>
                <Button onClick={handleStartImport} disabled={step === "importing"}>
                  {step === "importing" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Start Import
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Results */}
        {step === "done" && importResults && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                Import Complete
              </CardTitle>
              <CardDescription>
                Customer account created (ID: {importResults.customerId}).
                Here's a summary of what was imported.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground mb-1">SIP Endpoints</div>
                  <div className="text-2xl font-bold text-green-600">{importResults.endpoints.imported}</div>
                  {importResults.endpoints.failed > 0 && (
                    <div className="text-sm text-red-500">{importResults.endpoints.failed} failed</div>
                  )}
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground mb-1">Phone Numbers</div>
                  <div className="text-2xl font-bold text-green-600">{importResults.phoneNumbers.imported}</div>
                  {importResults.phoneNumbers.failed > 0 && (
                    <div className="text-sm text-red-500">{importResults.phoneNumbers.failed} failed</div>
                  )}
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm text-muted-foreground mb-1">Ring Groups</div>
                  <div className="text-2xl font-bold text-green-600">{importResults.ringGroups.imported}</div>
                  {importResults.ringGroups.failed > 0 && (
                    <div className="text-sm text-red-500">{importResults.ringGroups.failed} failed</div>
                  )}
                </div>
              </div>

              {/* Show errors if any */}
              {[...importResults.endpoints.errors, ...importResults.phoneNumbers.errors, ...importResults.ringGroups.errors].length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
                    <AlertCircle className="h-4 w-4" />
                    Issues During Import
                  </div>
                  <ul className="text-sm text-amber-600 space-y-1">
                    {[...importResults.endpoints.errors, ...importResults.phoneNumbers.errors, ...importResults.ringGroups.errors].map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("select");
                    setPreview(null);
                    setImportResults(null);
                  }}
                >
                  Import Another Account
                </Button>
                <Button
                  onClick={() => {
                    window.location.href = `/admin/customers/${importResults.customerId}`;
                  }}
                >
                  View Customer
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

const steps: Step[] = ["connect", "select", "preview", "configure", "done"];
