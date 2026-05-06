import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, index, foreignKey } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Projects table
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("projects_userId_idx").on(table.userId),
}));

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// Pipelines table
export const pipelines = mysqlTable("pipelines", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  currentVersionId: int("currentVersionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  projectIdIdx: index("pipelines_projectId_idx").on(table.projectId),
}));

export type Pipeline = typeof pipelines.$inferSelect;
export type InsertPipeline = typeof pipelines.$inferInsert;

// Pipeline Versions table
export const pipelineVersions = mysqlTable("pipelineVersions", {
  id: int("id").autoincrement().primaryKey(),
  pipelineId: int("pipelineId").notNull(),
  versionNumber: int("versionNumber").notNull(),
  config: json("config").$type<{
    chunkSize: number;
    chunkOverlap: number;
    enableGraphRAG: boolean;
  }>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  pipelineIdIdx: index("pipelineVersions_pipelineId_idx").on(table.pipelineId),
}));

export type PipelineVersion = typeof pipelineVersions.$inferSelect;
export type InsertPipelineVersion = typeof pipelineVersions.$inferInsert;

// Documents table
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  versionId: int("versionId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileSize: int("fileSize").notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(),
  contentSummary: text("contentSummary"),
  chunkCount: int("chunkCount").default(0).notNull(),
  ingestionStatus: mysqlEnum("ingestionStatus", ["uploading", "pending", "extracting", "embedding", "ready", "failed", "ocr_required"]).default("uploading").notNull(),
  ingestionError: text("ingestionError"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => ({
  versionIdIdx: index("documents_versionId_idx").on(table.versionId),
}));

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

// Chunks table (document chunks for embedding)
export const chunks = mysqlTable("chunks", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull(),
  sequenceIndex: int("sequenceIndex").notNull(),
  text: text("text").notNull(),
  pageNo: int("pageNo"),
  embeddingJson: text("embeddingJson"), // JSON string of float array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  documentIdIdx: index("chunks_documentId_idx").on(table.documentId),
}));

export type Chunk = typeof chunks.$inferSelect;
export type InsertChunk = typeof chunks.$inferInsert;

// API Keys table
export const apiKeys = mysqlTable("apiKeys", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  hashedKey: varchar("hashedKey", { length: 255 }).notNull().unique(),
  keyPrefix: varchar("keyPrefix", { length: 20 }).notNull(), // First 8 chars for display
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  revokedAt: timestamp("revokedAt"),
}, (table) => ({
  projectIdIdx: index("apiKeys_projectId_idx").on(table.projectId),
}));

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// Usage Logs table
export const usageLogs = mysqlTable("usageLogs", {
  id: int("id").autoincrement().primaryKey(),
  pipelineId: int("pipelineId").notNull(),
  projectId: int("projectId").notNull(),
  eventType: mysqlEnum("eventType", ["query", "document_upload", "embedding_generated"]).notNull(),
  tokensUsed: int("tokensUsed").default(0),
  responseTimeMs: int("responseTimeMs"),
  status: mysqlEnum("status", ["success", "error"]).default("success").notNull(),
  errorMessage: text("errorMessage"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  pipelineIdIdx: index("usageLogs_pipelineId_idx").on(table.pipelineId),
  projectIdIdx: index("usageLogs_projectId_idx").on(table.projectId),
  timestampIdx: index("usageLogs_timestamp_idx").on(table.timestamp),
}));

export type UsageLog = typeof usageLogs.$inferSelect;
export type InsertUsageLog = typeof usageLogs.$inferInsert;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  pipelines: many(pipelines),
  apiKeys: many(apiKeys),
  usageLogs: many(usageLogs),
}));

export const pipelinesRelations = relations(pipelines, ({ one, many }) => ({
  project: one(projects, { fields: [pipelines.projectId], references: [projects.id] }),
  versions: many(pipelineVersions),
  usageLogs: many(usageLogs),
}));

export const pipelineVersionsRelations = relations(pipelineVersions, ({ one, many }) => ({
  pipeline: one(pipelines, { fields: [pipelineVersions.pipelineId], references: [pipelines.id] }),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  version: one(pipelineVersions, { fields: [documents.versionId], references: [pipelineVersions.id] }),
  chunks: many(chunks),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  document: one(documents, { fields: [chunks.documentId], references: [documents.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  project: one(projects, { fields: [apiKeys.projectId], references: [projects.id] }),
}));

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  pipeline: one(pipelines, { fields: [usageLogs.pipelineId], references: [pipelines.id] }),
  project: one(projects, { fields: [usageLogs.projectId], references: [projects.id] }),
}));
