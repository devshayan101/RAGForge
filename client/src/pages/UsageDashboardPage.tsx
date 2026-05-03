import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, Zap, BarChart3, Clock, Database } from "lucide-react";

export default function UsageDashboardPage() {
  const { pipelineId, versionId } = useParams<{ pipelineId: string; versionId: string }>();
  const pipelineIdNum = parseInt(pipelineId || "0");
  const versionIdNum = parseInt(versionId || "0");

  // Fetch documents for this version
  const { data: documents, isLoading: docsLoading } = trpc.documents.list.useQuery(
    { versionId: versionIdNum },
    { enabled: versionIdNum > 0 }
  );

  // Fetch pipeline status
  const { data: status, isLoading: statusLoading } = trpc.pipelines.status.useQuery(
    { pipelineId: pipelineIdNum },
    { enabled: pipelineIdNum > 0 }
  );

  // Fetch pipeline usage stats
  const { data: stats, isLoading: statsLoading } = trpc.pipelines.stats.useQuery(
    { pipelineId: pipelineIdNum },
    { enabled: pipelineIdNum > 0 }
  );

  const isLoading = docsLoading || statusLoading || statsLoading;

  // Calculate stats
  const totalDocuments = documents?.length || 0;
  const totalChunks = documents?.reduce((sum, doc) => sum + (doc.chunkCount || 0), 0) || 0;
  const processingDocs = documents?.filter(d => d.ingestionStatus === "processing").length || 0;
  const failedDocs = documents?.filter(d => d.ingestionStatus === "failed").length || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Usage Dashboard</h1>
        <p className="text-muted-foreground mt-2">Monitor your pipeline performance and resource usage</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Database className="w-4 h-4" />
              Token Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.tokenUsage.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Total LLM tokens consumed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Avg Response Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.avgResponseTime || 0} ms</div>
            <p className="text-xs text-muted-foreground mt-1">Average query latency</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Total Chunks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalChunks}</div>
            <p className="text-xs text-muted-foreground mt-1">Indexed for search</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDocuments}</div>
            <p className="text-xs text-muted-foreground mt-1">{processingDocs} processing, {failedDocs} failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="queries" className="w-full">
        <TabsList>
          <TabsTrigger value="queries">Recent Queries</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="ingestion">Ingestion Status</TabsTrigger>
        </TabsList>

        <TabsContent value="queries" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Queries</CardTitle>
              <CardDescription>Latest search and chat queries on this pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              {stats?.recentLogs && stats.recentLogs.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4 font-semibold text-sm border-b pb-2">
                    <div>Event Type</div>
                    <div>Status</div>
                    <div>Response Time</div>
                    <div>Timestamp</div>
                  </div>
                  {stats.recentLogs.map(log => (
                    <div key={log.id} className="grid grid-cols-4 gap-4 text-sm border-b border-muted pb-2 last:border-0">
                      <div className="capitalize">{log.eventType.replace('_', ' ')}</div>
                      <div>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          log.status === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}>
                          {log.status}
                        </span>
                      </div>
                      <div>{log.responseTimeMs ? `${log.responseTimeMs}ms` : '-'}</div>
                      <div className="text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No queries logged yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>All documents in this pipeline version</CardDescription>
            </CardHeader>
            <CardContent>
              {documents && documents.length > 0 ? (
                <div className="space-y-3">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{doc.filename}</p>
                        <p className="text-sm text-muted-foreground">
                          {(doc.fileSize / 1024 / 1024).toFixed(2)} MB • {doc.chunkCount || 0} chunks
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          doc.ingestionStatus === "completed" ? "bg-green-100 text-green-800" :
                          doc.ingestionStatus === "processing" ? "bg-blue-100 text-blue-800" :
                          doc.ingestionStatus === "failed" ? "bg-red-100 text-red-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          {doc.ingestionStatus}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No documents uploaded yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ingestion" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ingestion Status</CardTitle>
              <CardDescription>Document processing pipeline status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Completed</span>
                  <span className="font-medium">{documents?.filter(d => d.ingestionStatus === "completed").length || 0} / {totalDocuments}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{
                      width: totalDocuments > 0 ? `${((documents?.filter(d => d.ingestionStatus === "completed").length || 0) / totalDocuments) * 100}%` : "0%"
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{documents?.filter(d => d.ingestionStatus === "completed").length || 0}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{processingDocs}</p>
                  <p className="text-xs text-muted-foreground">Processing</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{failedDocs}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
