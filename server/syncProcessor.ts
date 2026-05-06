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
    
    // Update status to pending
    await db.updateDocumentStatus(documentId, "pending");
    
    // 1. Fetch file content
    let buffer: Buffer;
    if (fileUrl.startsWith("/manus-storage/")) {
      const key = fileUrl.replace("/manus-storage/", "");
      const path = await import("path");
      const fs = await import("fs/promises");
      const filePath = path.join(process.cwd(), "uploads", key);
      buffer = await fs.readFile(filePath);
    } else {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }
    
    // 2. Process document (extract, chunk, embed)
    const { chunks, embeddings } = await processDocument(
      buffer,
      fileType,
      filename,
      chunkSize,
      chunkOverlap,
      async (status) => {
        await db.updateDocumentStatus(documentId, status);
      }
    );
    
    // 3. Store chunks and embeddings
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
