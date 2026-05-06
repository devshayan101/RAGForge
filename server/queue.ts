import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { ENV } from "./_core/env";
import { processDocument, OCRRequiredError } from "./documentProcessor";
import * as db from "./db";
import fs from "fs/promises";
import path from "path";

const REDIS_URL = ENV.redisUrl;

// Create Redis connection with error handling
let connection: Redis | null = null;
let isRedisAvailable = false;

try {
  connection = new Redis(REDIS_URL, { 
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
      if (times > 20) {
        console.warn("[Queue] Redis connection failed after 20 retries. Queue will be unavailable.");
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    lazyConnect: true,
  });

  connection.on("connect", () => {
    isRedisAvailable = true;
    console.log("[Queue] Redis connected successfully");
  });

  connection.on("error", (err) => {
    isRedisAvailable = false;
    console.warn("[Queue] Redis connection error:", err.message);
  });

  // Try to connect
  connection.connect().catch((err) => {
    isRedisAvailable = false;
    console.warn("[Queue] Failed to connect to Redis:", err.message);
  });
} catch (error) {
  console.warn("[Queue] Failed to initialize Redis connection:", error);
  connection = null;
}

export const ingestionQueue = connection ? new Queue("document-ingestion", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
}) : null;

export const ingestionWorker = connection ? new Worker(
  "document-ingestion",
  async (job: Job) => {
    const { documentId, versionId, fileUrl, filename, fileType, chunkSize, chunkOverlap, forceOCR } = job.data;
    
    console.log(`[Queue] Processing document ${documentId}: ${filename} (forceOCR: ${!!forceOCR})`);
    
    try {
      // 0. Check if document still exists
      const docExists = await db.checkDocumentExists(documentId);
      if (!docExists) {
        console.warn(`[Queue] Document ${documentId} no longer exists in DB. Skipping ingestion.`);
        return;
      }

      // Update status to pending
      await db.updateDocumentStatus(documentId, "pending");
      
      // 1. Fetch file content
      const { storageGetBuffer } = await import("./storage");
      const storageKey = fileUrl.startsWith("/manus-storage/") 
        ? fileUrl.replace("/manus-storage/", "") 
        : fileUrl;
        
      let buffer: Buffer;
      try {
        buffer = await storageGetBuffer(storageKey);
      } catch (error: any) {
        // If file is missing from storage, check if document still exists in DB
        if (error.Code === 'NoSuchKey' || error.message?.includes('NoSuchKey') || error.message?.includes('404')) {
          const stillExists = await db.checkDocumentExists(documentId);
          if (!stillExists) {
            console.warn(`[Queue] Document ${documentId} was deleted from storage and DB. Skipping.`);
            return;
          }
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
        async (status) => {
          // Double check existence before updating status
          if (await db.checkDocumentExists(documentId)) {
            await db.updateDocumentStatus(documentId, status as any);
          }
        },
        { forceOCR }
      );
      
      // Double check existence before final updates
      if (!(await db.checkDocumentExists(documentId))) {
        console.warn(`[Queue] Document ${documentId} was deleted during processing. Skipping final updates.`);
        return;
      }

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
      
      console.log(`[Queue] Completed document ${documentId}: ${chunks.length} chunks`);
    } catch (error: any) {
      if (error instanceof OCRRequiredError) {
        console.log(`[Queue] OCR required for document ${documentId}. Pausing.`);
        await db.updateDocumentStatus(documentId, "ocr_required");
        return;
      }

      console.error(`[Queue] Failed to process document ${documentId}:`, error);
      
      // Only update status if document still exists
      try {
        if (await db.checkDocumentExists(documentId)) {
          await db.updateDocumentStatus(documentId, "failed", error.message);
        }
      } catch (statusError) {
        console.error(`[Queue] Failed to update error status for ${documentId}:`, statusError);
      }
      
      throw error;
    }
  },
  { 
    connection: connection!,
    lockDuration: 600000, // 10 minutes
    stalledInterval: 300000, // 5 minutes
    maxStalledCount: 3
  }
) : null;

if (ingestionWorker) {
  ingestionWorker.on("failed", (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed:`, err);
  });
  ingestionWorker.on("error", (err) => {
    console.error(`[Queue] Worker error:`, err);
  });
}

// Log queue status
if (!isRedisAvailable) {
  console.warn("[Queue] Redis is not available. Document ingestion queue will be disabled.");
  console.warn("[Queue] To enable async document processing, set up Redis at REDIS_URL environment variable.");
}
