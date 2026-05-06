import express, { type Express } from "express";
import { ENV } from "./env";
import path from "path";
import fs from "fs";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    try {
      const { storageGetSignedUrl } = await import("../storage");
      const url = await storageGetSignedUrl(key);

      // If storage helper returns a local path, serve the file
      if (url.startsWith("/manus-storage/")) {
        const uploadDir = path.join(process.cwd(), "uploads");
        const filePath = path.join(uploadDir, key);
        if (fs.existsSync(filePath)) {
          return res.sendFile(filePath);
        }
        return res.status(404).send("File not found");
      }

      // Otherwise redirect to signed URL (S3, R2, or Gemini)
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });

  // Add PUT support for local development
  app.put("/manus-storage/*", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (ENV.geminiApiUrl && ENV.geminiApiKey) {
      // In Manus environment, this should probably not be used directly
      // but we'll allow it or just proxy it if needed.
      // For now, we only care about local fallback.
      res.status(403).send("Direct PUT to storage proxy is only allowed in local mode");
      return;
    }

    try {
      const uploadDir = path.join(process.cwd(), "uploads");
      const filePath = path.join(uploadDir, key);

      // Ensure parent directories exist
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

      // Write file
      await fs.promises.writeFile(filePath, req.body);

      res.status(200).json({ success: true, key });
    } catch (err) {
      console.error("[StorageProxy] PUT failed:", err);
      res.status(500).send("Storage proxy upload error");
    }
  });
}
