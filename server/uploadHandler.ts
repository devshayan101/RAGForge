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

// Configure multer for in-memory file uploads
const upload = multer({
  storage: multer.memoryStorage(),
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
      const fileKey = `documents/v${versionId}/${Date.now()}_${file.originalname}`;
      const { key, url } = await storagePut(
        fileKey,
        file.buffer,
        file.mimetype || "application/octet-stream"
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
    }
  });
}
