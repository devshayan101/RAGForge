import { useUser } from "@clerk/react";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Trash2, Loader2, FileText, AlertCircle, FileUp, RefreshCw } from "lucide-react";
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
    const syncDocumentsMutation = trpc.documents.sync.useMutation();
  const confirmOCRMutation = trpc.documents.confirmOCR.useMutation();

  const handleSyncDocuments = async (silent = false) => {
    try {
      const result = await syncDocumentsMutation.mutateAsync({ versionId });
      documentsQuery.refetch();
      if (!silent) {
        toast.success(`Sync complete: Added ${result.added}, Removed ${result.removed}`);
      }
    } catch (error) {
      if (!silent) {
        toast.error("Failed to sync documents");
      }
    }
  };

  const handleConfirmOCR = async (documentId: number, filename: string) => {
    if (!confirm(`This document seems to be scanned and requires OCR. Proceed with LLM-based OCR extraction? This may take some time.`)) {
      return;
    }
    
    try {
      await confirmOCRMutation.mutateAsync({ documentId });
      toast.success(`OCR extraction started for ${filename}`);
      documentsQuery.refetch();
    } catch (error) {
      toast.error("Failed to start OCR extraction");
    }
  };

  useEffect(() => {
    handleSyncDocuments(true);
  }, [versionId]);

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

        // 1. Get presigned URL (this also creates the DB record in 'uploading' status)
        const { uploadUrl, fileKey } = await getPresignedUrlMutation.mutateAsync({
          versionId,
          filename: file.name,
          fileType: file.type || 'application/octet-stream',
        });

        // 2. Upload directly to S3/Storage
        if (uploadUrl.startsWith('/manus-storage/')) {
          // Local storage fallback via our proxy
          const formData = new FormData();
          formData.append('file', file);
          formData.append('versionId', versionId.toString());
          formData.append('fileKey', fileKey); // Pass the key we want

          await axios.post('/api/upload', formData, {
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(progress);
              }
            },
          });
        } else {
          // Direct S3 upload
          try {
            await axios.put(uploadUrl, file, {
              headers: {
                'Content-Type': file.type || 'application/octet-stream',
              },
              onUploadProgress: (progressEvent) => {
                if (progressEvent.total) {
                  const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                  setUploadProgress(progress);
                }
              },
            });
          } catch (err: any) {
            // If direct upload fails (likely CORS or network error), fallback to server upload
            console.warn('Direct upload failed, falling back to server upload:', err.message);
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('versionId', versionId.toString());
            formData.append('fileKey', fileKey);

            await axios.post('/api/upload', formData, {
              onUploadProgress: (progressEvent) => {
                if (progressEvent.total) {
                  const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                  setUploadProgress(progress);
                }
              },
            });
          }
        }

        // 3. Notify server that upload is complete and start ingestion
        await uploadDocumentMutation.mutateAsync({
          versionId,
          filename: file.name,
          fileUrl: uploadUrl.startsWith('/manus-storage/') ? uploadUrl : fileKey,
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Documents</h2>
          <p className="text-muted-foreground mt-1">Upload and manage documents for this pipeline version</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => handleSyncDocuments(false)}
          disabled={syncDocumentsMutation.isPending}
        >
          {syncDocumentsMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Sync with Storage
        </Button>
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
                          {doc.tokenCount > 0 && (
                            <> • {doc.tokenCount >= 1000 ? `${(doc.tokenCount / 1000).toFixed(1)}K` : doc.tokenCount} tokens (est.)</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.ingestionStatus === 'uploading' && (
                          <span className="text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> 
                            Uploading {doc.filename === currentUploadingFile ? `(${uploadProgress}%)` : ''}
                          </span>
                        )}
                        {doc.ingestionStatus === 'pending' && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Queued</span>
                        )}
                        {(doc.ingestionStatus === 'extracting' || doc.ingestionStatus === 'embedding') && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> 
                            {doc.ingestionStatus === 'extracting' ? 'Extracting' : 'Embedding'} ({doc.progress}%)
                          </span>
                        )}
                        {doc.ingestionStatus === 'ready' && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Ready</span>
                        )}
                        {doc.ingestionStatus === 'ocr_required' && (
                          <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> OCR Required
                          </span>
                        )}
                        {doc.ingestionStatus === 'failed' && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Failed</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.ingestionStatus === 'ocr_required' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8"
                          onClick={() => handleConfirmOCR(doc.id, doc.filename)}
                          disabled={confirmOCRMutation.isPending}
                        >
                          {confirmOCRMutation.isPending ? (
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3 mr-2" />
                          )}
                          Process with OCR
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDocument(doc.id, doc.filename)}
                        disabled={deleteDocumentMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Processing Progress Bar */}
                  {['uploading', 'extracting', 'embedding'].includes(doc.ingestionStatus) && (
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-blue-600 animate-pulse">
                          {doc.ingestionStatus === 'uploading' ? 'Uploading to storage...' : 
                           doc.ingestionStatus === 'extracting' ? 'Extracting text...' : 'Generating embeddings...'}
                        </span>
                        <span className="font-mono">
                          {doc.ingestionStatus === 'uploading' 
                            ? (doc.filename === currentUploadingFile ? uploadProgress : 0) 
                            : doc.progress}%
                        </span>
                      </div>
                      <Progress 
                        value={doc.ingestionStatus === 'uploading' 
                          ? (doc.filename === currentUploadingFile ? uploadProgress : 0) 
                          : doc.progress} 
                        className="h-1.5 bg-blue-100" 
                      />
                    </div>
                  )}

                  {doc.ingestionStatus === 'failed' && doc.ingestionError && (
                    <Alert className="mt-3" variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{doc.ingestionError}</AlertDescription>
                    </Alert>
                  )}
                  {doc.ingestionStatus === 'ocr_required' && (
                    <Alert className="mt-3 bg-orange-50 border-orange-200 text-orange-900">
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                      <AlertDescription>
                        This PDF appears to be a scanned document without a text layer. 
                        Click <strong>Process with OCR</strong> above to extract text using AI.
                      </AlertDescription>
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
