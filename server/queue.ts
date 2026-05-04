import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { processDocument } from "./documentProcessor";
import * as db from "./db";
import fs from "fs/promises";
import path from "path";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Create Redis connection with error handling
let connection: Redis | null = null;
let isRedisAvailable = false;

try {
  connection = new Redis(REDIS_URL, { 
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
      if (times > 3) {
        console.warn("[Queue] Redis connection failed after 3 retries. Queue will be unavailable.");
        return null;
      }
      return Math.min(times * 50, 2000);
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
      // Update status to processing
      await db.updateDocumentStatus(documentId, "processing");
      
      // 1. Fetch file content
      let buffer: Buffer;
      if (fileUrl.startsWith("/manus-storage/")) {
        const key = fileUrl.replace("/manus-storage/", "");
        const filePath = path.join(process.cwd(), "uploads", key);
        buffer = await fs.readFile(filePath);
      } else {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }
      
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
      
      console.log(`[Queue] Completed document ${documentId}: ${chunks.length} chunks`);
    } catch (error: any) {
      console.error(`[Queue] Failed to process document ${documentId}:`, error);
      await db.updateDocumentStatus(documentId, "failed", error.message);
      throw error;
    }
  },
  { connection: connection! }
) : null;

if (ingestionWorker) {
  ingestionWorker.on("failed", (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed:`, err);
  });
}

// Log queue status
if (!isRedisAvailable) {
  console.warn("[Queue] Redis is not available. Document ingestion queue will be disabled.");
  console.warn("[Queue] To enable async document processing, set up Redis at REDIS_URL environment variable.");
}
