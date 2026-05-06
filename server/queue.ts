import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { ENV } from "./_core/env";
import { processDocument } from "./documentProcessor";
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
    const { documentId, versionId, fileUrl, filename, fileType, chunkSize, chunkOverlap } = job.data;
    
    console.log(`[Queue] Processing document ${documentId}: ${filename}`);
    
    try {
      // Update status to pending
      await db.updateDocumentStatus(documentId, "pending");
      
      // 1. Fetch file content
      const { storageGetBuffer } = await import("./storage");
      const storageKey = fileUrl.startsWith("/manus-storage/") 
        ? fileUrl.replace("/manus-storage/", "") 
        : fileUrl;
        
      const buffer = await storageGetBuffer(storageKey);
      
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
      
      console.log(`[Queue] Completed document ${documentId}: ${chunks.length} chunks`);
    } catch (error: any) {
      console.error(`[Queue] Failed to process document ${documentId}:`, error);
      await db.updateDocumentStatus(documentId, "failed", error.message);
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
