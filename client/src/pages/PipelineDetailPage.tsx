import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import DocumentsPage from "./DocumentsPage";
import ChatPage from "./ChatPage";

export default function PipelineDetailPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const pipelineId = parseInt(params?.pipelineId as string);
  const [copiedVersionId, setCopiedVersionId] = useState<number | null>(null);
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(100);
  const [enableGraphRAG, setEnableGraphRAG] = useState(false);

  const pipelineQuery = trpc.pipelines.get.useQuery({ pipelineId });
  const versionsQuery = trpc.versions.list.useQuery({ pipelineId });
  const createVersionMutation = trpc.versions.create.useMutation();
  const updateConfigMutation = trpc.versions.updateConfig.useMutation();
  const setCurrentMutation = trpc.versions.setCurrent.useMutation();

  const pipeline = pipelineQuery.data;
  const versions = versionsQuery.data || [];
  const currentVersion = versions.find(v => v.id === pipeline?.currentVersionId);

  const handleCreateVersion = async () => {
    if (!currentVersion) return;
    try {
      await createVersionMutation.mutateAsync({
        pipelineId,
        sourceVersionId: currentVersion.id,
      });
      versionsQuery.refetch();
      toast.success("New version created");
    } catch (error) {
      toast.error("Failed to create version");
    }
  };

  const handleUpdateConfig = async (versionId: number) => {
    try {
      await updateConfigMutation.mutateAsync({
        versionId,
        chunkSize,
        chunkOverlap,
        enableGraphRAG,
      });
      versionsQuery.refetch();
      toast.success("Configuration updated");
    } catch (error) {
      toast.error("Failed to update configuration");
    }
  };

  const handleSetCurrent = async (versionId: number) => {
    try {
      await setCurrentMutation.mutateAsync({ pipelineId, versionId });
      pipelineQuery.refetch();
      toast.success("Version activated");
    } catch (error) {
      toast.error("Failed to activate version");
    }
  };

  const copyToClipboard = (text: string, versionId: number) => {
    navigator.clipboard.writeText(text);
    setCopiedVersionId(versionId);
    setTimeout(() => setCopiedVersionId(null), 2000);
  };

  if (pipelineQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!pipeline) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Pipeline not found
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => setLocation("/dashboard")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{pipeline.name}</h1>
          <p className="text-muted-foreground mt-1">Manage pipeline versions and configuration</p>
        </div>
      </div>

      <Tabs defaultValue="versions" className="w-full">
        <TabsList>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Pipeline Versions</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Version
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Version</DialogTitle>
                  <DialogDescription>
                    Create a new version based on the current version
                  </DialogDescription>
                </DialogHeader>
                <Button
                  onClick={handleCreateVersion}
                  disabled={createVersionMutation.isPending}
                  className="w-full"
                >
                  {createVersionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Version
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          {versionsQuery.isLoading ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : versions.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No versions yet
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {versions.map((version) => (
                <Card key={version.id} className={pipeline.currentVersionId === version.id ? "border-blue-500 border-2" : ""}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>v{version.versionNumber}</CardTitle>
                        <CardDescription>
                          Created {new Date(version.createdAt).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {pipeline.currentVersionId === version.id && (
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                            Active
                          </span>
                        )}
                        {pipeline.currentVersionId !== version.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetCurrent(version.id)}
                          >
                            Activate
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Chunk Size:</span>
                        <span className="font-medium">{version.config?.chunkSize || 1000}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Chunk Overlap:</span>
                        <span className="font-medium">{version.config?.chunkOverlap || 100}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Graph RAG:</span>
                        <span className="font-medium">{version.config?.enableGraphRAG ? "Enabled" : "Disabled"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          {currentVersion ? (
            <Card>
              <CardHeader>
                <CardTitle>Pipeline Configuration</CardTitle>
                <CardDescription>Configure settings for v{currentVersion.versionNumber}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Chunk Size: {chunkSize}</Label>
                  <Slider
                    value={[chunkSize]}
                    onValueChange={(val) => setChunkSize(val[0])}
                    min={100}
                    max={10000}
                    step={100}
                  />
                  <p className="text-sm text-muted-foreground">Size of text chunks for embedding</p>
                </div>

                <div className="space-y-2">
                  <Label>Chunk Overlap: {chunkOverlap}</Label>
                  <Slider
                    value={[chunkOverlap]}
                    onValueChange={(val) => setChunkOverlap(val[0])}
                    min={0}
                    max={1000}
                    step={50}
                  />
                  <p className="text-sm text-muted-foreground">Overlap between consecutive chunks</p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Graph RAG</Label>
                    <p className="text-sm text-muted-foreground">Extract entities and relationships</p>
                  </div>
                  <Switch
                    checked={enableGraphRAG}
                    onCheckedChange={setEnableGraphRAG}
                  />
                </div>

                <Button
                  onClick={() => handleUpdateConfig(currentVersion.id)}
                  disabled={updateConfigMutation.isPending}
                  className="w-full"
                >
                  {updateConfigMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Configuration
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No active version
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents">
          {currentVersion ? (
            <DocumentsPage versionId={currentVersion.id} />
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No active version. Please activate a version first.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="chat">
          {currentVersion ? (
            <ChatPage versionId={currentVersion.id} />
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No active version. Please activate a version first.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
