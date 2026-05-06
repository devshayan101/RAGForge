import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import crypto from "crypto";
import { ingestionQueue } from "./queue";
import { procesDocumentSync } from "./syncProcessor";
import { getPresignedUploadUrl } from "./uploadHelper";

// Helper to hash API keys
function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// Helper to generate API key
function generateApiKey(): string {
  return "rg_" + crypto.randomBytes(32).toString("hex");
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Projects router
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserProjects(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return project;
      }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(255), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        // Check 3-project limit
        const projects = await db.getUserProjects(ctx.user.id);
        if (projects.length >= 3) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Maximum 3 projects allowed per user",
          });
        }

        const result = await db.createProject(ctx.user.id, input.name, input.description);
        const projectId = result[0].insertId as number;
        return db.getProjectById(projectId);
      }),

    update: protectedProcedure
      .input(z.object({ projectId: z.number(), name: z.string().min(1).max(255), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.updateProject(input.projectId, input.name, input.description);
        return db.getProjectById(input.projectId);
      }),

    delete: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        // Cascade delete: pipelines, versions, documents, chunks, api_keys, usage_logs
        await db.deleteProjectCascade(input.projectId);
        return { success: true };
      }),
  }),

  // Pipelines router
  pipelines: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return db.getPipelinesByProject(input.projectId);
      }),

    get: protectedProcedure
      .input(z.object({ pipelineId: z.number() }))
      .query(async ({ ctx, input }) => {
        const pipeline = await db.getPipelineById(input.pipelineId);
        if (!pipeline) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const project = await db.getProjectById(pipeline.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return pipeline;
      }),

    create: protectedProcedure
      .input(z.object({ projectId: z.number(), name: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const result = await db.createPipeline(input.projectId, input.name);
        return db.getPipelineById(result.pipelineId);
      }),

    update: protectedProcedure
      .input(z.object({ pipelineId: z.number(), name: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        const pipeline = await db.getPipelineById(input.pipelineId);
        if (!pipeline) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const project = await db.getProjectById(pipeline.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.updatePipeline(input.pipelineId, input.name);
        return db.getPipelineById(input.pipelineId);
      }),

    delete: protectedProcedure
      .input(z.object({ pipelineId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const pipeline = await db.getPipelineById(input.pipelineId);
        if (!pipeline) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const project = await db.getProjectById(pipeline.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.deletePipelineCascade(input.pipelineId);
        return { success: true };
      }),

    status: protectedProcedure
      .input(z.object({ pipelineId: z.number() }))
      .query(async ({ ctx, input }) => {
        const pipeline = await db.getPipelineById(input.pipelineId);
        if (!pipeline) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const project = await db.getProjectById(pipeline.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        
        // Get pipeline statistics
        const versions = await db.getPipelineVersions(input.pipelineId);
        const currentVersion = versions.find(v => v.id === pipeline.currentVersionId);
        
        let documentCount = 0;
        let chunkCount = 0;
        
        if (currentVersion) {
          const documents = await db.getDocumentsByVersion(currentVersion.id);
          documentCount = documents.length;
          
          // Count chunks
          for (const doc of documents) {
            const chunks = await db.getChunksByDocument(doc.id);
            chunkCount += chunks.length;
          }
        }
        
        // Get recent usage logs
        const usageLogs = await db.getPipelineUsageLogs(input.pipelineId, 10);
        
        return {
          pipelineId: input.pipelineId,
          name: pipeline.name,
          currentVersion: currentVersion?.versionNumber || 1,
          documentCount,
          chunkCount,
          versionCount: versions.length,
          recentQueries: usageLogs.filter(log => log.eventType === "query").length,
          lastQueryAt: usageLogs.find(log => log.eventType === "query")?.timestamp || null,
        };
      }),

    stats: protectedProcedure
      .input(z.object({ pipelineId: z.number() }))
      .query(async ({ ctx, input }) => {
        const pipeline = await db.getPipelineById(input.pipelineId);
        if (!pipeline) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const project = await db.getProjectById(pipeline.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const tokenUsage = await db.getPipelineTokenUsage(input.pipelineId);
        const avgResponseTime = await db.getPipelineAverageResponseTime(input.pipelineId);
        const usageLogs = await db.getPipelineUsageLogs(input.pipelineId, 20);

        return {
          tokenUsage,
          avgResponseTime,
          recentLogs: usageLogs.map(log => ({
            id: log.id,
            eventType: log.eventType,
            tokensUsed: log.tokensUsed,
            responseTimeMs: log.responseTimeMs,
            status: log.status,
            timestamp: log.timestamp,
          })),
        };
      }),
  }),

  // Pipeline Versions router
  versions: router({
    list: protectedProcedure
      .input(z.object({ pipelineId: z.number() }))
      .query(async ({ ctx, input }) => {
        const pipeline = await db.getPipelineById(input.pipelineId);
        if (!pipeline) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const project = await db.getProjectById(pipeline.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return db.getPipelineVersions(input.pipelineId);
      }),

    get: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ ctx, input }) => {
        const version = await db.getPipelineVersionById(input.versionId);
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const pipeline = await db.getPipelineById(version.pipelineId);
        const project = await db.getProjectById(pipeline!.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return version;
      }),

    create: protectedProcedure
      .input(z.object({ pipelineId: z.number(), sourceVersionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const pipeline = await db.getPipelineById(input.pipelineId);
        if (!pipeline) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const project = await db.getProjectById(pipeline.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const versionId = await db.createPipelineVersion(input.pipelineId, input.sourceVersionId);
        return db.getPipelineVersionById(versionId);
      }),

    updateConfig: protectedProcedure
      .input(z.object({
        versionId: z.number(),
        chunkSize: z.number().min(100).max(10000),
        chunkOverlap: z.number().min(0).max(1000),
        enableGraphRAG: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const version = await db.getPipelineVersionById(input.versionId);
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const pipeline = await db.getPipelineById(version.pipelineId);
        const project = await db.getProjectById(pipeline!.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const config = {
          chunkSize: input.chunkSize,
          chunkOverlap: input.chunkOverlap,
          enableGraphRAG: input.enableGraphRAG,
        };
        await db.updatePipelineVersionConfig(input.versionId, config);
        return db.getPipelineVersionById(input.versionId);
      }),

    setCurrent: protectedProcedure
      .input(z.object({ pipelineId: z.number(), versionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const pipeline = await db.getPipelineById(input.pipelineId);
        if (!pipeline) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const project = await db.getProjectById(pipeline.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.setCurrentPipelineVersion(input.pipelineId, input.versionId);
        return db.getPipelineById(input.pipelineId);
      }),
  }),

  // API Keys router
  apiKeys: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return db.getProjectApiKeys(input.projectId);
      }),

    create: protectedProcedure
      .input(z.object({ projectId: z.number(), name: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const key = generateApiKey();
        const hashedKey = hashApiKey(key);
        const keyPrefix = key.substring(0, 8);
        const apiKeyId = await db.createApiKey(input.projectId, hashedKey, keyPrefix, input.name);
        return {
          id: apiKeyId,
          key, // Return the unhashed key only on creation
          keyPrefix,
          name: input.name,
          createdAt: new Date(),
        };
      }),

    revoke: protectedProcedure
      .input(z.object({ projectId: z.number(), apiKeyId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.revokeApiKey(input.apiKeyId);
        return { success: true };
      }),
  }),

  // Documents router
  documents: router({
    getPresignedUrl: protectedProcedure
      .input(z.object({
        versionId: z.number(),
        filename: z.string(),
        fileType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const version = await db.getPipelineVersionById(input.versionId);
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const pipeline = await db.getPipelineById(version.pipelineId);
        const project = await db.getProjectById(pipeline!.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        try {
          const presignedUrl = await getPresignedUploadUrl(
            input.filename,
            input.fileType,
            input.versionId
          );

          // Create document record in "uploading" status
          await db.createDocument(
            input.versionId,
            input.filename,
            presignedUrl.fileKey,
            0,
            input.fileType
          );

          return presignedUrl;
        } catch (error: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to get presigned URL: ${error.message}`,
          });
        }
      }),

    list: protectedProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ ctx, input }) => {
        const version = await db.getPipelineVersionById(input.versionId);
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const pipeline = await db.getPipelineById(version.pipelineId);
        const project = await db.getProjectById(pipeline!.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return db.getDocumentsByVersion(input.versionId);
      }),

    upload: protectedProcedure
      .input(z.object({
        versionId: z.number(),
        filename: z.string(),
        fileUrl: z.string(),
        fileSize: z.number(),
        fileType: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const version = await db.getPipelineVersionById(input.versionId);
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const pipeline = await db.getPipelineById(version.pipelineId);
        const project = await db.getProjectById(pipeline!.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const fileType = input.fileType || "application/octet-stream";
        
        // Extract key from URL
        const fileKey = input.fileUrl.startsWith("/manus-storage/") 
          ? input.fileUrl.replace("/manus-storage/", "") 
          : input.fileUrl;

        // Try to find existing record created during getPresignedUrl
        const existing = await db.getDocumentByFileKey(fileKey);
        let docId: number;

        if (existing) {
          docId = existing.id;
          await db.updateDocument(docId, {
            fileSize: input.fileSize,
            ingestionStatus: "pending",
          });
        } else {
          docId = await db.createDocument(
            input.versionId,
            input.filename,
            fileKey,
            input.fileSize,
            fileType
          );
          await db.updateDocumentStatus(docId, "pending");
        }

        // Log usage
        await db.logUsage(pipeline!.id, project.id, "document_upload", 1, 0, "success");

        // Add to ingestion queue or process synchronously
        if (ingestionQueue) {
          await ingestionQueue.add("ingest", {
            documentId: docId,
            versionId: input.versionId,
            fileUrl: input.fileUrl,
            filename: input.filename,
            fileType: fileType,
            chunkSize: version.config.chunkSize,
            chunkOverlap: version.config.chunkOverlap,
          });
        } else {
          console.warn("[Documents] Redis unavailable. Processing document synchronously.");
          await procesDocumentSync(
            docId,
            input.versionId,
            input.fileUrl,
            input.filename,
            fileType,
            version.config.chunkSize,
            version.config.chunkOverlap
          );
        }

        return db.getDocumentById(docId);
      }),

    delete: protectedProcedure
      .input(z.object({ versionId: z.number(), documentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const version = await db.getPipelineVersionById(input.versionId);
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const pipeline = await db.getPipelineById(version.pipelineId);
        const project = await db.getProjectById(pipeline!.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Delete all chunks for this document
        await db.deleteChunksByDocument(input.documentId);
        // Delete the document
        await db.deleteDocument(input.documentId);

        return { success: true };
      }),
  }),

  // Search router
  search: router({
    query: protectedProcedure
      .input(z.object({
        versionId: z.number(),
        query: z.string(),
        limit: z.number().default(5),
      }))
      .query(async ({ ctx, input }) => {
        const version = await db.getPipelineVersionById(input.versionId);
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const pipeline = await db.getPipelineById(version.pipelineId);
        const project = await db.getProjectById(pipeline!.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // 1. Generate embedding for the query
        const { generateEmbeddings } = await import("./documentProcessor");
        const [queryEmbedding] = await generateEmbeddings([input.query]);

        // 2. Get all chunks for this version
        const chunks = await db.getChunksByVersion(input.versionId);
        
        // 3. Calculate cosine similarity
        function cosineSimilarity(vecA: number[], vecB: number[]) {
          let dotProduct = 0;
          let normA = 0;
          let normB = 0;
          for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
          }
          return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        }

        const results = chunks
          .map(chunk => {
            const chunkEmbedding = JSON.parse(chunk.embeddingJson || "[]");
            const similarity = chunkEmbedding.length > 0 
              ? cosineSimilarity(queryEmbedding, chunkEmbedding)
              : 0;
            return {
              id: chunk.id,
              documentId: chunk.documentId,
              text: chunk.text,
              pageNumber: chunk.pageNo || 0,
              similarity,
            };
          })
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, input.limit);

        return results;
      }),
  }),

  // Chat router
  chat: router({
    query: protectedProcedure
      .input(z.object({
        versionId: z.number(),
        message: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const version = await db.getPipelineVersionById(input.versionId);
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const pipeline = await db.getPipelineById(version.pipelineId);
        const project = await db.getProjectById(pipeline!.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // 1. Generate embedding for the message
        const { generateEmbeddings } = await import("./documentProcessor");
        const [queryEmbedding] = await generateEmbeddings([input.message]);

        // 2. Get relevant chunks for context using similarity
        const chunks = await db.getChunksByVersion(input.versionId);
        
        function cosineSimilarity(vecA: number[], vecB: number[]) {
          let dotProduct = 0;
          let normA = 0;
          let normB = 0;
          for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
          }
          return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        }

        const relevantChunks = chunks
          .map(chunk => {
            const chunkEmbedding = JSON.parse(chunk.embeddingJson || "[]");
            const similarity = chunkEmbedding.length > 0 
              ? cosineSimilarity(queryEmbedding, chunkEmbedding)
              : 0;
            return { ...chunk, similarity };
          })
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 3);

        // Build context from relevant chunks
        const context = relevantChunks
          .map(chunk => `Document: ${chunk.documentId}\nPage: ${chunk.pageNo || 0}\nContent: ${chunk.text}`)
          .join("\n\n");

        // Call LLM with context
        const { invokeLLM } = await import("./_core/llm");
        const startTime = Date.now();
        
        // Since we are in tRPC, we'll simulate streaming for now by returning the full response
        // but structured to allow the frontend to handle it easily.
        // True SSE would require a separate Express route.
        const llmResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant. Answer the user's question based on the provided context. If the answer is not in the context, say so. Use markdown for formatting. IMPORTANT: Respond in the same language as the user's question.",
            },
            {
              role: "user",
              content: `Context:\n${context}\n\nQuestion: ${input.message}`,
            },
          ],
        });

        const response = llmResponse.choices[0]?.message.content || "Unable to generate response";
        const tokensUsed = (llmResponse.usage as any)?.total_tokens || 0;
        const responseTimeMs = Date.now() - startTime;

        // Log usage
        await db.logUsage(pipeline!.id, project.id, "query", tokensUsed, responseTimeMs, "success");

        // Fetch document names for sources
        const sources = await Promise.all(relevantChunks.map(async chunk => {
          const doc = await db.getDocumentById(chunk.documentId);
          return {
            documentId: chunk.documentId,
            documentName: doc?.filename || "Unknown Document",
            pageNumber: chunk.pageNo || 0,
            text: chunk.text.substring(0, 200),
          };
        }));

        return {
          response: typeof response === "string" ? response : JSON.stringify(response),
          sources,
          tokensUsed,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
