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

    if (!ENV.geminiApiUrl || !ENV.geminiApiKey) {
      // Local storage fallback
      const uploadDir = path.join(process.cwd(), "uploads");
      const filePath = path.join(uploadDir, key);

      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        res.status(404).send("File not found");
      }
      return;
    }

    try {
      const geminiUrl = new URL(
        "v1/storage/presign/get",
        ENV.geminiApiUrl.replace(/\/+$/, "") + "/",
      );
      geminiUrl.searchParams.set("path", key);

      const geminiResp = await fetch(geminiUrl, {
        headers: { Authorization: `Bearer ${ENV.geminiApiKey}` },
      });

      if (!geminiResp.ok) {
        const body = await geminiResp.text().catch(() => "");
        console.error(`[StorageProxy] gemini error: ${geminiResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await geminiResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

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
