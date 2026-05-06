/**
 * Helper functions for document upload with presigned URLs
 */

import { ENV } from "./_core/env";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = (ENV.s3AccessKeyId && ENV.s3SecretAccessKey && ENV.s3Bucket)
  ? new S3Client({
      region: ENV.s3Region,
      credentials: {
        accessKeyId: ENV.s3AccessKeyId,
        secretAccessKey: ENV.s3SecretAccessKey,
      },
      endpoint: ENV.s3Endpoint || undefined,
      forcePathStyle: !!ENV.s3Endpoint,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })
  : null;

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
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const fileKey = `documents/v${versionId}/${hash}_${sanitizedFilename}`;

  if (s3Client) {
    const command = new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: fileKey,
      ContentType: fileType,
    });
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return {
      uploadUrl,
      fileKey,
      expiresIn: 3600,
    };
  }

  const geminiUrl = ENV.geminiApiUrl;
  const geminiKey = ENV.geminiApiKey;

  if (!geminiUrl || !geminiKey) {
    // Local storage fallback
    return {
      uploadUrl: `/manus-storage/${fileKey}`,
      fileKey,
      expiresIn: 3600,
    };
  }

  // Request presigned PUT URL from Gemini
  const presignUrl = new URL("v1/storage/presign/put", geminiUrl.replace(/\/+$/, "") + "/");
  presignUrl.searchParams.set("path", fileKey);
  presignUrl.searchParams.set("expiresIn", "3600"); // 1 hour expiry

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${geminiKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Failed to get presigned URL (${presignResp.status}): ${msg}`);
  }

  const { url: uploadUrl } = (await presignResp.json()) as { url: string };
  if (!uploadUrl) {
    throw new Error("Gemini returned empty presigned URL");
  }

  return {
    uploadUrl,
    fileKey,
    expiresIn: 3600,
  };
}
