import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import ApiKeysPage from "./ApiKeysPage";

export default function SettingsPage() {
  const projectsQuery = trpc.projects.list.useQuery();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  if (projectsQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const projects = projectsQuery.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and project settings</p>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No projects yet. Create a project to manage API keys.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="api-keys" className="w-full">
          <TabsList>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys" className="space-y-4">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Select Project</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`p-3 rounded-lg border-2 transition-colors text-left ${
                        selectedProjectId === project.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                          : "border-border hover:border-blue-300"
                      }`}
                    >
                      <div className="font-medium">{project.name}</div>
                      {project.description && (
                        <div className="text-sm text-muted-foreground">{project.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {selectedProjectId && (
                <ApiKeysPage projectId={selectedProjectId} />
              )}
            </div>
          </TabsContent>

          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>Manage your account preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Account settings coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
