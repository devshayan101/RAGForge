/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

export interface PipelineConfig {
  chunkSize: number;
  chunkOverlap: number;
  enableGraphRAG: boolean;
}
