// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { ENV } from "./_core/env";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";

let s3Client: S3Client | null = null;
if (ENV.s3AccessKeyId && ENV.s3SecretAccessKey && ENV.s3Bucket) {
  s3Client = new S3Client({
    region: ENV.s3Region,
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
    endpoint: ENV.s3Endpoint || undefined,
    forcePathStyle: !!ENV.s3Endpoint, // Often needed for R2/Minio
  });
}

function getGeminiConfig() {
  const geminiUrl = ENV.geminiApiUrl;
  const geminiKey = ENV.geminiApiKey;

  if (!geminiUrl || !geminiKey) {
    return null;
  }

  return { geminiUrl: geminiUrl.replace(/\/+$/, ""), geminiKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));

  if (s3Client) {
    await s3Client.send(new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: typeof data === "string" ? Buffer.from(data) : data,
      ContentType: contentType,
    }));
    return { key, url: `/manus-storage/${key}` };
  }

  const config = getGeminiConfig();

  if (!config) {
    // Local storage fallback
    const uploadDir = path.join(process.cwd(), "uploads");
    const filePath = path.join(uploadDir, key);
    
    // Ensure parent directories exist
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Write file
    const content = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
    await fs.writeFile(filePath, content);
    
    return { key, url: `/manus-storage/${key}` };
  }

  const { geminiUrl, geminiKey } = config;

  // 1. Get presigned PUT URL from Gemini
  const presignUrl = new URL("v1/storage/presign/put", geminiUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${geminiKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);

  if (s3Client) {
    const command = new GetObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
    });
    return await getS3SignedUrl(s3Client, command, { expiresIn: 3600 });
  }

  const config = getGeminiConfig();
  if (!config) {
    // Local storage fallback: return a relative URL that the storage proxy will handle
    return `/manus-storage/${key}`;
  }

  const { geminiUrl, geminiKey } = config;

  const getUrl = new URL("v1/storage/presign/get", geminiUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${geminiKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
