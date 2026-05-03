/**
 * Synchronous document processor for environments without Redis
 * Processes documents inline during upload instead of queuing
 */

import { processDocument } from "./documentProcessor";
import * as db from "./db";

export async function procesDocumentSync(
  documentId: number,
  versionId: number,
  fileUrl: string,
  filename: string,
  fileType: string,
  chunkSize: number,
  chunkOverlap: number
): Promise<{ success: boolean; chunkCount: number; error?: string }> {
  try {
    console.log(`[SyncProcessor] Processing document ${documentId}: ${filename}`);
    
    // Update status to processing
    await db.updateDocumentStatus(documentId, "processing");
    
    // 1. Fetch file content from URL
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 2. Process document (extract, chunk, embed)
    const { chunks, embeddings } = await processDocument(
      buffer,
      fileType,
      filename,
      chunkSize,
      chunkOverlap
    );
    
    // 3. Store chunks and embeddings
    for (let i = 0; i < chunks.length; i++) {
      await db.createChunk(
        documentId,
        i,
        chunks[i],
        undefined, // pageNo not implemented in processor yet
        JSON.stringify(embeddings[i])
      );
    }
    
    // 4. Update document status and chunk count
    await db.updateDocumentChunkCount(documentId, chunks.length);
    await db.updateDocumentStatus(documentId, "completed");
    
    console.log(`[SyncProcessor] Completed document ${documentId}: ${chunks.length} chunks`);
    
    return {
      success: true,
      chunkCount: chunks.length,
    };
  } catch (error: any) {
    console.error(`[SyncProcessor] Error processing document ${documentId}:`, error.message);
    
    // Update status to failed
    try {
      await db.updateDocumentStatus(documentId, "failed");
    } catch (statusError) {
      console.error("Failed to update document status:", statusError);
    }
    
    return {
      success: false,
      chunkCount: 0,
      error: error.message,
    };
  }
}
