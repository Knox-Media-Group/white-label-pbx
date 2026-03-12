import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Search, MoreHorizontal, Mic, Trash2, Play, Download, FileText, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DEMO_CUSTOMER_ID = 1;

export default function CustomerRecordings() {
  const { user } = useAuth();
  const customerId = user?.customerId || DEMO_CUSTOMER_ID;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecording, setSelectedRecording] = useState<{id: number; callSid: string | null} | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);

  const { data: recordings, isLoading, refetch } = trpc.recordings.list.useQuery({ customerId });
  
  const [playbackRecordingId, setPlaybackRecordingId] = useState<number | null>(null);
  const { data: playbackData, isLoading: playbackLoading } = trpc.recordings.getPlaybackUrl.useQuery(
    { id: playbackRecordingId! },
    { enabled: !!playbackRecordingId }
  );

  const summarizeMutation = trpc.llmCallFlows.summarizeCall.useMutation({
    onSuccess: () => {
      toast.success("Call summary generated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate summary");
    },
  });
  
  const deleteMutation = trpc.recordings.delete.useMutation({
    onSuccess: () => {
      toast.success("Recording deleted");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete recording");
    },
  });

  const filteredRecordings = recordings?.filter(
    (r) =>
      r.callSid?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.fromNumber?.includes(searchQuery) ||
      r.toNumber?.includes(searchQuery)
  ) || [];

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlay = (recording: {id: number; callSid: string | null}) => {
    setSelectedRecording(recording);
    setPlaybackRecordingId(recording.id);
  };

  return (
    <CustomerLayout title="Call Recordings">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search recordings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Recordings Table */}
        <Card>
          <CardHeader>
            <CardTitle>Call Recordings</CardTitle>
            <CardDescription>
              Access and manage your call recordings stored in S3
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredRecordings.length === 0 ? (
              <div className="text-center py-12">
                <Mic className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No recordings match your search" : "No recordings yet."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Call SID</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecordings.map((recording) => (
                    <TableRow key={recording.id}>
                      <TableCell>
                        {new Date(recording.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {recording.callSid?.substring(0, 12)}...
                      </TableCell>
                      <TableCell className="font-mono">
                        {recording.fromNumber || "-"}
                      </TableCell>
                      <TableCell className="font-mono">
                        {recording.toNumber || "-"}
                      </TableCell>
                      <TableCell>
                        {formatDuration(recording.duration)}
                      </TableCell>
                      <TableCell>
                        {recording.summary ? (
                          <span className="text-xs text-green-600">Available</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handlePlay(recording)}>
                              <Play className="mr-2 h-4 w-4" />
                              Play
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              // Use the playback URL to trigger a download
                              setPlaybackRecordingId(recording.id);
                              const checkAndDownload = () => {
                                // Open recording URL in new tab to trigger download
                                if (recording.recordingUrl) {
                                  window.open(recording.recordingUrl, '_blank');
                                } else {
                                  toast.error("No recording URL available");
                                }
                              };
                              checkAndDownload();
                            }}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            {!recording.summary && (
                              <DropdownMenuItem 
                                onClick={() => {
                                  if (recording.transcription) {
                                    summarizeMutation.mutate({ 
                                      recordingId: recording.id, 
                                      transcription: recording.transcription 
                                    });
                                  } else {
                                    toast.error("No transcription available for this recording");
                                  }
                                }}
                              >
                                <Sparkles className="mr-2 h-4 w-4" />
                                Generate Summary
                              </DropdownMenuItem>
                            )}
                            {recording.summary && (
                              <DropdownMenuItem onClick={() => toast.info(recording.summary)}>
                                <FileText className="mr-2 h-4 w-4" />
                                View Summary
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this recording?")) {
                                  deleteMutation.mutate({ id: recording.id });
                                }
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Playback Dialog */}
        <Dialog open={!!selectedRecording} onOpenChange={() => {
          setSelectedRecording(null);
          setPlaybackUrl(null);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Play Recording</DialogTitle>
              <DialogDescription>
                Call SID: {selectedRecording?.callSid}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {playbackLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : playbackData?.url ? (
                <audio controls className="w-full" src={playbackData.url}>
                  Your browser does not support the audio element.
                </audio>
              ) : (
                <p className="text-center text-muted-foreground">
                  Unable to load recording
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </CustomerLayout>
  );
}
