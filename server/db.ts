import { eq, desc, asc } from "drizzle-orm";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import { InsertUser, InsertDocument, users, projects, pipelines, pipelineVersions, documents, chunks, apiKeys, usageLogs } from "../drizzle/schema";
import { ENV } from './_core/env';

let _pool: mysql.Pool | null = null;
let _db: MySql2Database<typeof schema> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      if (!_pool) {
        _pool = mysql.createPool({
          uri: process.env.DATABASE_URL,
          enableKeepAlive: true,
          keepAliveInitialDelay: 10000, // 10 seconds
          waitForConnections: true,
          connectionLimit: 10,
          maxIdle: 10,
          idleTimeout: 60000,
        });
      }
      _db = drizzle(_pool, { schema, mode: 'default' });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date().toISOString();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date().toISOString();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Projects queries
export async function getUserProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
}

export async function getProjectById(projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return result[0];
}

export async function createProject(userId: number, name: string, description?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projects).values({ userId, name, description });
  return result;
}

export async function updateProject(projectId: number, name: string, description?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(projects).set({ name, description }).where(eq(projects.id, projectId));
}

export async function deleteProject(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(projects).where(eq(projects.id, projectId));
}

// Pipelines queries
export async function getPipelinesByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pipelines).where(eq(pipelines.projectId, projectId)).orderBy(desc(pipelines.createdAt));
}

export async function getPipelineById(pipelineId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(pipelines).where(eq(pipelines.id, pipelineId)).limit(1);
  return result[0];
}

export async function createPipeline(projectId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Create pipeline
  const pipelineResult = await db.insert(pipelines).values({ projectId, name });
  const pipelineId = pipelineResult[0].insertId as number;
  
  // Create initial version
  const versionResult = await db.insert(pipelineVersions).values({
    pipelineId,
    versionNumber: 1,
    config: {
      chunkSize: 1000,
      chunkOverlap: 100,
      enableGraphRAG: false,
    },
  });
  const versionId = versionResult[0].insertId as number;
  
  // Update pipeline to set current version
  await db.update(pipelines).set({ currentVersionId: versionId }).where(eq(pipelines.id, pipelineId));
  
  return { pipelineId, versionId };
}

export async function updatePipeline(pipelineId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(pipelines).set({ name }).where(eq(pipelines.id, pipelineId));
}

export async function deletePipeline(pipelineId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(pipelines).where(eq(pipelines.id, pipelineId));
}

// Pipeline Versions queries
export async function getPipelineVersions(pipelineId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pipelineVersions).where(eq(pipelineVersions.pipelineId, pipelineId)).orderBy(asc(pipelineVersions.versionNumber));
}

export async function getPipelineVersionById(versionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(pipelineVersions).where(eq(pipelineVersions.id, versionId)).limit(1);
  return result[0];
}

export async function createPipelineVersion(pipelineId: number, sourceVersionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get source version config
  const sourceVersion = await getPipelineVersionById(sourceVersionId);
  if (!sourceVersion) throw new Error("Source version not found");
  
  // Get next version number
  const versions = await getPipelineVersions(pipelineId);
  const nextVersionNumber = Math.max(...versions.map(v => v.versionNumber), 0) + 1;
  
  // Create new version
  const result = await db.insert(pipelineVersions).values({
    pipelineId,
    versionNumber: nextVersionNumber,
    config: sourceVersion.config,
  });
  
  return result[0].insertId as number;
}

export async function updatePipelineVersionConfig(versionId: number, config: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(pipelineVersions).set({ config }).where(eq(pipelineVersions.id, versionId));
}

export async function setCurrentPipelineVersion(pipelineId: number, versionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(pipelines).set({ currentVersionId: versionId }).where(eq(pipelines.id, pipelineId));
}

// Documents queries
export async function getDocumentsByVersion(versionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(eq(documents.versionId, versionId)).orderBy(desc(documents.uploadedAt));
}

export async function getDocumentById(documentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  return result[0];
}

export async function getDocumentByFileKey(fileKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(eq(documents.fileKey, fileKey)).limit(1);
  return result[0];
}

export async function updateDocument(documentId: number, data: Partial<InsertDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(documents).set(data).where(eq(documents.id, documentId));
}

export async function createDocument(versionId: number, filename: string, fileKey: string, fileSize: number, fileType: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documents).values({
    versionId,
    filename,
    fileKey,
    fileSize,
    fileType,
    ingestionStatus: "uploading",
    progress: 0,
  });
  return result[0].insertId as number;
}

export async function updateDocumentStatus(documentId: number, status: "uploading" | "pending" | "extracting" | "embedding" | "ready" | "failed" | "ocr_required", error?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updates: Partial<InsertDocument> = { ingestionStatus: status };
  if (status === "ready") updates.completedAt = new Date().toISOString();
  if (error) updates.ingestionError = error;
  return db.update(documents).set(updates).where(eq(documents.id, documentId));
}

export async function updateDocumentChunkCount(documentId: number, chunkCount: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(documents).set({ chunkCount }).where(eq(documents.id, documentId));
}

export async function updateDocumentProgress(documentId: number, progress: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Clamp progress between 0 and 100
  const clampedProgress = Math.max(0, Math.min(100, progress));
  return db.update(documents).set({ progress: clampedProgress }).where(eq(documents.id, documentId));
}

export async function deleteDocument(documentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(documents).where(eq(documents.id, documentId));
}

export async function checkDocumentExists(documentId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId)).limit(1);
  return result.length > 0;
}

// Chunks queries
export async function createChunk(documentId: number, sequenceIndex: number, text: string, pageNo?: number, embeddingJson?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(chunks).values({
    documentId,
    sequenceIndex,
    text,
    pageNo,
    embeddingJson,
  });
}

export async function createChunks(values: { documentId: number; sequenceIndex: number; text: string; pageNo?: number; embeddingJson?: string }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (values.length === 0) return;
  
  // Split into batches of 100 to avoid packet size limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);
    await db.insert(chunks).values(batch);
  }
}

export async function getChunksByDocument(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chunks).where(eq(chunks.documentId, documentId)).orderBy(asc(chunks.sequenceIndex));
}

export async function deleteChunksByDocument(documentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(chunks).where(eq(chunks.documentId, documentId));
}

// API Keys queries
export async function getProjectApiKeys(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(apiKeys).where(eq(apiKeys.projectId, projectId)).orderBy(desc(apiKeys.createdAt));
}

export async function createApiKey(projectId: number, hashedKey: string, keyPrefix: string, name?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(apiKeys).values({
    projectId,
    hashedKey,
    keyPrefix,
    name,
  });
  return result[0].insertId as number;
}

export async function revokeApiKey(apiKeyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(apiKeys).set({ revokedAt: new Date().toISOString() }).where(eq(apiKeys.id, apiKeyId));
}

export async function getApiKeyByHash(hashedKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(apiKeys).where(eq(apiKeys.hashedKey, hashedKey)).limit(1);
  return result[0];
}

// Usage Logs queries
export async function logUsage(pipelineId: number, projectId: number, eventType: "query" | "document_upload" | "embedding_generated", tokensUsed?: number, responseTimeMs?: number, status: "success" | "error" = "success", errorMessage?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(usageLogs).values({
    pipelineId,
    projectId,
    eventType,
    tokensUsed,
    responseTimeMs,
    status,
    errorMessage,
  });
}

export async function getPipelineUsageLogs(pipelineId: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(usageLogs).where(eq(usageLogs.pipelineId, pipelineId)).orderBy(desc(usageLogs.timestamp)).limit(limit);
}

export async function getPipelineTokenUsage(pipelineId: number) {
  const db = await getDb();
  if (!db) return 0;
  const logs = await db.select().from(usageLogs).where(eq(usageLogs.pipelineId, pipelineId));
  return logs.reduce((acc, log) => acc + (log.tokensUsed || 0), 0);
}

export async function getPipelineAverageResponseTime(pipelineId: number) {
  const db = await getDb();
  if (!db) return 0;
  const logs = await db.select().from(usageLogs).where(eq(usageLogs.pipelineId, pipelineId));
  const queryLogs = logs.filter(log => log.eventType === "query" && log.responseTimeMs);
  if (queryLogs.length === 0) return 0;
  const total = queryLogs.reduce((acc, log) => acc + (log.responseTimeMs || 0), 0);
  return Math.round(total / queryLogs.length);
}


// Cascade deletion helpers
export async function deleteProjectCascade(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all pipelines for this project
  const projectPipelines = await db.select().from(pipelines).where(eq(pipelines.projectId, projectId));

  // Delete all data associated with each pipeline
  for (const pipeline of projectPipelines) {
    await deletePipelineCascade(pipeline.id);
  }

  // Delete API keys for this project
  await db.delete(apiKeys).where(eq(apiKeys.projectId, projectId));

  // Delete usage logs for this project
  await db.delete(usageLogs).where(eq(usageLogs.projectId, projectId));

  // Finally, delete the project itself
  await db.delete(projects).where(eq(projects.id, projectId));
}

export async function deletePipelineCascade(pipelineId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all versions for this pipeline
  const pipelineVersions_ = await db.select().from(pipelineVersions).where(eq(pipelineVersions.pipelineId, pipelineId));

  // Delete all data associated with each version
  for (const version of pipelineVersions_) {
    await deleteVersionCascade(version.id);
  }

  // Delete usage logs for this pipeline
  await db.delete(usageLogs).where(eq(usageLogs.pipelineId, pipelineId));

  // Finally, delete the pipeline itself
  await db.delete(pipelines).where(eq(pipelines.id, pipelineId));
}

export async function deleteVersionCascade(versionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all documents for this version
  const versionDocuments = await db.select().from(documents).where(eq(documents.versionId, versionId));

  // Delete all chunks for each document
  for (const doc of versionDocuments) {
    await db.delete(chunks).where(eq(chunks.documentId, doc.id));
  }

  // Delete all documents for this version
  await db.delete(documents).where(eq(documents.versionId, versionId));

  // Finally, delete the version itself
  await db.delete(pipelineVersions).where(eq(pipelineVersions.id, versionId));
}

export async function getChunksByVersion(versionId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select({
    id: chunks.id,
    documentId: chunks.documentId,
    sequenceIndex: chunks.sequenceIndex,
    text: chunks.text,
    pageNo: chunks.pageNo,
    embeddingJson: chunks.embeddingJson,
    createdAt: chunks.createdAt,
    documentName: documents.filename,
  })
  .from(chunks)
  .innerJoin(documents, eq(chunks.documentId, documents.id))
  .where(eq(documents.versionId, versionId))
  .orderBy(asc(chunks.sequenceIndex));

  return result;
}
