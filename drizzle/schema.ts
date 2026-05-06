import { mysqlTable, mysqlSchema, AnyMySqlColumn, index, int, varchar, timestamp, text, mysqlEnum, json } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const apiKeys = mysqlTable("apiKeys", {
	id: int().autoincrement().notNull(),
	projectId: int().notNull(),
	hashedKey: varchar({ length: 255 }).notNull(),
	keyPrefix: varchar({ length: 20 }).notNull(),
	name: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	expiresAt: timestamp({ mode: 'string' }),
	revokedAt: timestamp({ mode: 'string' }),
},
(table) => [
	index("apiKeys_hashedKey_unique").on(table.hashedKey),
	index("apiKeys_projectId_idx").on(table.projectId),
]);

export const chunks = mysqlTable("chunks", {
	id: int().autoincrement().notNull(),
	documentId: int().notNull(),
	sequenceIndex: int().notNull(),
	text: text().notNull(),
	pageNo: int(),
	embeddingJson: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("chunks_documentId_idx").on(table.documentId),
]);

export const documents = mysqlTable("documents", {
	id: int().autoincrement().notNull(),
	versionId: int().notNull(),
	filename: varchar({ length: 255 }).notNull(),
	fileKey: varchar({ length: 512 }).notNull(),
	fileSize: int().notNull(),
	fileType: varchar({ length: 50 }).notNull(),
	contentSummary: text(),
	chunkCount: int().default(0).notNull(),
	ingestionStatus: mysqlEnum(['uploading','pending','extracting','embedding','ready','failed','ocr_required']).default('uploading').notNull(),
	ingestionError: text(),
	uploadedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	completedAt: timestamp({ mode: 'string' }),
},
(table) => [
	index("documents_versionId_idx").on(table.versionId),
]);

export const pipelineVersions = mysqlTable("pipelineVersions", {
	id: int().autoincrement().notNull(),
	pipelineId: int().notNull(),
	versionNumber: int().notNull(),
	config: json().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("pipelineVersions_pipelineId_idx").on(table.pipelineId),
]);

export const pipelines = mysqlTable("pipelines", {
	id: int().autoincrement().notNull(),
	projectId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	currentVersionId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("pipelines_projectId_idx").on(table.projectId),
]);

export const projects = mysqlTable("projects", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("projects_userId_idx").on(table.userId),
]);

export const usageLogs = mysqlTable("usageLogs", {
	id: int().autoincrement().notNull(),
	pipelineId: int().notNull(),
	projectId: int().notNull(),
	eventType: mysqlEnum(['query','document_upload','embedding_generated']).notNull(),
	tokensUsed: int().default(0),
	responseTimeMs: int(),
	status: mysqlEnum(['success','error']).default('success').notNull(),
	errorMessage: text(),
	timestamp: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("usageLogs_pipelineId_idx").on(table.pipelineId),
	index("usageLogs_projectId_idx").on(table.projectId),
	index("usageLogs_timestamp_idx").on(table.timestamp),
]);

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("users_openId_unique").on(table.openId),
]);
