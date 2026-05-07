/**
 * File upload handler for document ingestion
 * Handles multipart form uploads and stores files to S3
 */

import { Express } from "express";
import { Request, Response } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";

import path from "path";
import fs from "fs/promises";
import os from "os";

// Configure multer for disk-based temporary storage
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = path.join(os.tmpdir(), "ragforge-uploads");
      // Synchronous check/create is fine during initialization or we can use a helper
      // but multer calls this for every file. We'll use a pre-created dir.
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: {
    fileSize: ENV.maxFileSize,
  },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "txt"].includes(ext || "")) {
      cb(new Error("Invalid file type. Only PDF, DOCX, and TXT are supported."));
    } else {
      cb(null, true);
    }
  },
});

// Ensure temp directory exists
import { mkdirSync } from "fs";
try {
  mkdirSync(path.join(os.tmpdir(), "ragforge-uploads"), { recursive: true });
} catch (err) {
  console.error("Failed to create temp directory:", err);
}

export function registerUploadHandler(app: Express) {
  app.post("/api/upload", upload.single("file"), async (req: any, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const versionId = parseInt(req.body.versionId as string);
      if (!versionId || isNaN(versionId)) {
        return res.status(400).json({ error: "Invalid versionId" });
      }

      // Verify version exists
      const version = await db.getPipelineVersionById(versionId);
      if (!version) {
        return res.status(404).json({ error: "Pipeline version not found" });
      }

      // Upload file to S3 using storage helper
      const file = req.file as Express.Multer.File;
      const fileKey = (req.body.fileKey as string) || `documents/v${versionId}/${Date.now()}_${file.originalname}`;
      
      // Read the file into a buffer for storagePut
      const buffer = await fs.readFile(file.path);
      
      const { key, url } = await storagePut(
        fileKey,
        buffer,
        file.mimetype || "application/octet-stream",
        file.path,
        { appendHash: !req.body.fileKey } // Skip hashing if key was already provided (presigned flow)
      );

      res.json({
        fileUrl: url,
        fileKey: key,
        filename: file.originalname,
        fileSize: file.size,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({
        error: error.message || "Failed to upload file",
      });
    } finally {
      // Ensure the temporary file is deleted if storagePut didn't handle it
      if (req.file?.path) {
        try {
          // Check if file still exists before trying to delete
          const { access } = await import("fs/promises");
          await access(req.file.path);
          await fs.unlink(req.file.path);
          console.log(`[UploadHandler] Cleaned up temporary file: ${req.file.path}`);
        } catch (e) {
          // File already deleted or inaccessible, which is expected if storagePut succeeded
        }
      }
    }
  });
}
