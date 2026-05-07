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
    
    // 0. Check if document still exists
    const docExists = await db.checkDocumentExists(documentId);
    if (!docExists) {
      console.warn(`[SyncProcessor] Document ${documentId} no longer exists. Skipping.`);
      return { success: true, chunkCount: 0 };
    }

    // Update status to pending
    await db.updateDocumentStatus(documentId, "pending");
    
    // 1. Fetch file content
    let buffer: Buffer;
    try {
      const { storageGetBuffer } = await import("./storage");
      const storageKey = fileUrl.startsWith("/manus-storage/") 
        ? fileUrl.replace("/manus-storage/", "") 
        : fileUrl;
        
      buffer = await storageGetBuffer(storageKey);
    } catch (error: any) {
      // Check if document was deleted while fetching
      const stillExists = await db.checkDocumentExists(documentId);
      if (!stillExists) {
        console.warn(`[SyncProcessor] Document ${documentId} was deleted during fetch. Skipping.`);
        return { success: true, chunkCount: 0 };
      }
      throw error;
    }
    
    // 2. Process document (extract, chunk, embed)
    const { chunks, embeddings } = await processDocument(
      buffer,
      fileType,
      filename,
      chunkSize,
      chunkOverlap,
      async (status, progress) => {
        if (await db.checkDocumentExists(documentId)) {
          await db.updateDocumentStatus(documentId, status);
          await db.updateDocumentProgress(documentId, progress);
        }
      }
    );
    
    // 3. Store chunks and embeddings
    if (!(await db.checkDocumentExists(documentId))) {
      console.warn(`[SyncProcessor] Document ${documentId} was deleted during processing. Skipping.`);
      return { success: true, chunkCount: 0 };
    }

    const chunkData = chunks.map((text, i) => ({
      documentId,
      sequenceIndex: i,
      text,
      embeddingJson: JSON.stringify(embeddings[i]),
    }));
    
    await db.createChunks(chunkData);
    
    // 4. Update document status and chunk count
    await db.updateDocumentChunkCount(documentId, chunks.length);
    await db.updateDocumentStatus(documentId, "ready");
    
    console.log(`[SyncProcessor] Completed document ${documentId}: ${chunks.length} chunks`);
    
    return {
      success: true,
      chunkCount: chunks.length,
    };
  } catch (error: any) {
    console.error(`[SyncProcessor] Error processing document ${documentId}:`, error.message);
    
    // Update status to failed only if document still exists
    try {
      if (await db.checkDocumentExists(documentId)) {
        await db.updateDocumentStatus(documentId, "failed", error.message);
      }
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
