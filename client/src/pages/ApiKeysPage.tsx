import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Copy, Check, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface ApiKeysPageProps {
  projectId: number;
}

export default function ApiKeysPage({ projectId }: ApiKeysPageProps) {
  const [newKeyName, setNewKeyName] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);

  const apiKeysQuery = trpc.apiKeys.list.useQuery({ projectId });
  const createKeyMutation = trpc.apiKeys.create.useMutation();
  const revokeKeyMutation = trpc.apiKeys.revoke.useMutation();

  const handleCreateKey = async () => {
    try {
      const newKey = await createKeyMutation.mutateAsync({ projectId, name: newKeyName });
      setNewKeyName("");
      apiKeysQuery.refetch();
      
      // Auto-copy the full key immediately
      navigator.clipboard.writeText(newKey.key);
      setCopiedKeyId(newKey.id);
      setTimeout(() => setCopiedKeyId(null), 2000);

      toast.success("API key created and copied to clipboard!");
      
      // Show the key in a persistent way until they close the dialog or acknowledge
      alert(`Your new API Key is:\n\n${newKey.key}\n\nPLEASE COPY THIS NOW. You will not be able to see it again.`);
    } catch (error) {
      toast.error("Failed to create API key");
    }
  };

  const handleRevokeKey = async (keyId: number) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    try {
      await revokeKeyMutation.mutateAsync({ projectId, apiKeyId: keyId });
      apiKeysQuery.refetch();
      toast.success("API key revoked");
    } catch (error) {
      toast.error("Failed to revoke API key");
    }
  };

  const toggleKeyVisibility = (keyId: number) => {
    const newVisible = new Set(visibleKeys);
    if (newVisible.has(keyId)) {
      newVisible.delete(keyId);
    } else {
      newVisible.add(keyId);
    }
    setVisibleKeys(newVisible);
  };

  const copyKeyToClipboard = (keyPrefix: string, keyId: number) => {
    // We don't have the full key here, so we shouldn't allow copying it as if it were the key.
    toast.error("For security, the full key is only shown once at creation. This is just the identifier prefix.");
    navigator.clipboard.writeText(keyPrefix);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">API Keys</h2>
          <p className="text-muted-foreground mt-1">Manage API keys for programmatic access</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Generate Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate New API Key</DialogTitle>
              <DialogDescription>Create a new API key for this project</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Key name (optional)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
              <Button
                onClick={handleCreateKey}
                disabled={createKeyMutation.isPending}
                className="w-full"
              >
                {createKeyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Generate Key
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {apiKeysQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : apiKeysQuery.data?.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No API keys yet. Generate your first key to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {apiKeysQuery.data?.map((key) => (
            <Card key={key.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{key.name || "Unnamed Key"}</CardTitle>
                    <CardDescription>
                      Created {new Date(key.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleRevokeKey(key.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-3 rounded-lg">
                  <code className="flex-1 font-mono text-sm text-muted-foreground">
                    {visibleKeys.has(key.id) ? key.keyPrefix : key.keyPrefix + "..."}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleKeyVisibility(key.id)}
                  >
                    {visibleKeys.has(key.id) ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyKeyToClipboard(key.keyPrefix, key.id)}
                    title="Copy prefix (Note: This is not the full API key)"
                  >
                    {copiedKeyId === key.id ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
