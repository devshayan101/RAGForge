import { useUser } from "@clerk/react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Trash2, Loader2, FileText, AlertCircle, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import axios from "axios";

interface DocumentsPageProps {
  versionId: number;
}

export default function DocumentsPage({ versionId }: DocumentsPageProps) {
  const { user } = useUser();

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUploadingFile, setCurrentUploadingFile] = useState<string | null>(null);

  const documentsQuery = trpc.documents.list.useQuery(
    { versionId },
    {
      refetchInterval: (query) => {
        const hasProcessing = query.state.data?.some((doc: any) => 
          ['uploading', 'pending', 'extracting', 'embedding'].includes(doc.ingestionStatus)
        );
        return hasProcessing ? 2000 : false;
      },
      // Ensure we refetch on window focus to catch updates
      refetchOnWindowFocus: true,
    }
  );
  const uploadDocumentMutation = trpc.documents.upload.useMutation();
  const deleteDocumentMutation = trpc.documents.delete.useMutation();
  const getPresignedUrlMutation = trpc.documents.getPresignedUrl.useMutation();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  };

  const handleFiles = async (files: File[]) => {
    const validFiles = files.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['pdf', 'docx', 'txt'].includes(ext || '')) {
        toast.error(`${file.name} - Invalid file type. Only PDF, DOCX, and TXT are supported.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setIsUploading(true);
    for (const file of validFiles) {
      try {
        setCurrentUploadingFile(file.name);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('versionId', versionId.toString());

        const uploadResponse = await axios.post('/api/upload', formData, {
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(progress);
            }
          },
        });

        const { fileUrl, fileKey } = uploadResponse.data;

        // Create document record with the S3 file URL
        await uploadDocumentMutation.mutateAsync({
          versionId,
          filename: file.name,
          fileUrl,
          fileSize: file.size,
          fileType: file.type || 'application/octet-stream',
        });

        toast.success(`${file.name} uploaded successfully`);
        documentsQuery.refetch();
      } catch (error: any) {
        console.error('Upload error:', error);
        const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
        toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
      }
    }
    setIsUploading(false);
    setUploadProgress(0);
    setCurrentUploadingFile(null);
  };

  const handleDeleteDocument = async (documentId: number, filename: string) => {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      await deleteDocumentMutation.mutateAsync({ versionId, documentId });
      documentsQuery.refetch();
      toast.success("Document deleted");
    } catch (error) {
      toast.error("Failed to delete document");
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Documents</h2>
        <p className="text-muted-foreground mt-1">Upload and manage documents for this pipeline version</p>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="font-semibold mb-2">Drag and drop files here</h3>
        <p className="text-sm text-muted-foreground mb-4">or</p>
        <label>
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            onChange={handleFileInput}
            disabled={isUploading}
            className="hidden"
          />
          <Button variant="outline" disabled={isUploading} asChild>
            <span>
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Select Files'
              )}
            </span>
          </Button>
        </label>
        <p className="text-xs text-muted-foreground mt-4">Supported formats: PDF, DOCX, TXT</p>
      </div>

      {/* Progress Bar for Active Upload */}
      {isUploading && currentUploadingFile && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6 pb-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <FileUp className="w-4 h-4 text-primary animate-bounce" />
                  <span className="font-medium">Uploading {currentUploadingFile}...</span>
                </div>
                <span className="text-muted-foreground font-mono">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents List */}
      <div>
        <h3 className="font-semibold mb-4">Uploaded Documents</h3>
        {documentsQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : documentsQuery.data?.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No documents yet. Upload your first document to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {documentsQuery.data?.map((doc) => (
              <Card key={doc.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{doc.filename}</p>
                        <p className="text-sm text-muted-foreground">
                          {(doc.fileSize / 1024 / 1024).toFixed(2)} MB • {doc.chunkCount} chunks
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.ingestionStatus === 'uploading' && (
                          <span className="text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Uploading
                          </span>
                        )}
                        {doc.ingestionStatus === 'pending' && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Queued</span>
                        )}
                        {(doc.ingestionStatus === 'extracting' || doc.ingestionStatus === 'embedding') && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> 
                            {doc.ingestionStatus === 'extracting' ? 'Extracting' : 'Embedding'}
                          </span>
                        )}
                        {doc.ingestionStatus === 'ready' && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Ready</span>
                        )}
                        {doc.ingestionStatus === 'failed' && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Failed</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteDocument(doc.id, doc.filename)}
                      disabled={deleteDocumentMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  {doc.ingestionStatus === 'failed' && doc.ingestionError && (
                    <Alert className="mt-3" variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{doc.ingestionError}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
