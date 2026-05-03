import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function ProjectsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [editingProject, setEditingProject] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [selectedProject, setSelectedProject] = useState<number | null>(null);

  const projectsQuery = trpc.projects.list.useQuery();
  const createProjectMutation = trpc.projects.create.useMutation();
  const updateProjectMutation = trpc.projects.update.useMutation();
  const deleteProjectMutation = trpc.projects.delete.useMutation();
  const pipelinesQuery = trpc.pipelines.list.useQuery(
    { projectId: selectedProject! },
    { enabled: !!selectedProject }
  );
  const createPipelineMutation = trpc.pipelines.create.useMutation();
  const deletePipelineMutation = trpc.pipelines.delete.useMutation();

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      await createProjectMutation.mutateAsync({ name: newProjectName, description: newProjectDesc });
      setNewProjectName("");
      setNewProjectDesc("");
      projectsQuery.refetch();
      toast.success("Project created");
    } catch (error) {
      toast.error("Failed to create project");
    }
  };

  const handleUpdateProject = async () => {
    if (!editingProject || !editName.trim()) return;
    try {
      await updateProjectMutation.mutateAsync({ projectId: editingProject, name: editName, description: editDesc });
      setEditingProject(null);
      projectsQuery.refetch();
      toast.success("Project updated");
    } catch (error) {
      toast.error("Failed to update project");
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    if (!confirm("Delete this project and all its pipelines?")) return;
    try {
      await deleteProjectMutation.mutateAsync({ projectId });
      if (selectedProject === projectId) setSelectedProject(null);
      projectsQuery.refetch();
      toast.success("Project deleted");
    } catch (error) {
      toast.error("Failed to delete project");
    }
  };

  const handleCreatePipeline = async (projectId: number, name: string) => {
    if (!name.trim()) return;
    try {
      await createPipelineMutation.mutateAsync({ projectId, name });
      pipelinesQuery.refetch();
      toast.success("Pipeline created");
    } catch (error) {
      toast.error("Failed to create pipeline");
    }
  };

  const handleDeletePipeline = async (pipelineId: number) => {
    if (!confirm("Delete this pipeline and all its versions?")) return;
    try {
      await deletePipelineMutation.mutateAsync({ pipelineId });
      pipelinesQuery.refetch();
      toast.success("Pipeline deleted");
    } catch (error) {
      toast.error("Failed to delete pipeline");
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage your RAG projects and pipelines</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>Create a new RAG project to organize your pipelines</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
              <Input
                placeholder="Description (optional)"
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
              />
              <Button
                onClick={handleCreateProject}
                disabled={createProjectMutation.isPending}
                className="w-full"
              >
                {createProjectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Project
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {projectsQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : projectsQuery.data?.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No projects yet. Create your first project to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projectsQuery.data?.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedProject(project.id)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{project.name}</CardTitle>
                    {project.description && <CardDescription>{project.description}</CardDescription>}
                  </div>
                  <div className="flex gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingProject(project.id);
                            setEditName(project.name);
                            setEditDesc(project.description || "");
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Project</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                          <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                          <Button onClick={handleUpdateProject} className="w-full">
                            Save Changes
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {selectedProject && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Pipelines</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Pipeline
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Pipeline</DialogTitle>
                  <DialogDescription>Create a new pipeline for this project</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Pipeline name"
                    id="pipelineName"
                    onChange={(e) => {
                      const input = e.target as HTMLInputElement;
                      input.dataset.value = input.value;
                    }}
                  />
                  <Button
                    onClick={() => {
                      const input = document.getElementById('pipelineName') as HTMLInputElement;
                      const name = input?.dataset.value || input?.value || '';
                      if (name.trim()) {
                        handleCreatePipeline(selectedProject, name);
                        input.value = '';
                        input.dataset.value = '';
                      }
                    }}
                    disabled={createPipelineMutation.isPending}
                    className="w-full"
                  >
                    {createPipelineMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create Pipeline
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {pipelinesQuery.isLoading ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : (
            <div className="grid gap-4">
              {pipelinesQuery.data?.map((pipeline) => (
                <Card
                  key={pipeline.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setLocation(`/dashboard/pipeline/${pipeline.id}`)}
                >
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>{pipeline.name}</CardTitle>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePipeline(pipeline.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
