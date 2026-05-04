/**
 * Helper functions for document upload with presigned URLs
 */

import { ENV } from "./_core/env";
import crypto from "crypto";

export interface PresignedUploadUrl {
  uploadUrl: string;
  fileKey: string;
  expiresIn: number;
}

/**
 * Get a presigned URL for uploading a document to S3
 * The client can use this URL to upload the file directly to S3
 */
export async function getPresignedUploadUrl(
  filename: string,
  fileType: string,
  versionId: number
): Promise<PresignedUploadUrl> {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  // Generate a unique key for the file
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const fileKey = `documents/v${versionId}/${hash}_${sanitizedFilename}`;

  if (!forgeUrl || !forgeKey) {
    // Local storage fallback
    return {
      uploadUrl: `/manus-storage/${fileKey}`,
      fileKey,
      expiresIn: 3600,
    };
  }

  // Request presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl.replace(/\/+$/, "") + "/");
  presignUrl.searchParams.set("path", fileKey);
  presignUrl.searchParams.set("expiresIn", "3600"); // 1 hour expiry

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Failed to get presigned URL (${presignResp.status}): ${msg}`);
  }

  const { url: uploadUrl } = (await presignResp.json()) as { url: string };
  if (!uploadUrl) {
    throw new Error("Forge returned empty presigned URL");
  }

  return {
    uploadUrl,
    fileKey,
    expiresIn: 3600,
  };
}
