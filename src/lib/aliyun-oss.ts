import path from "node:path";

const OSS = require("ali-oss");

const DEFAULT_SIGNED_URL_EXPIRES = 10_800;

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function getRequiredEnv(name: string) {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }

  return value;
}

function getSignedUrlExpires() {
  const raw = Number.parseInt(readEnv("OSS_SIGNED_URL_EXPIRES"), 10);

  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_SIGNED_URL_EXPIRES;
  }

  return raw;
}

function sanitizeFileName(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  const basename = path
    .basename(fileName, ext)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${basename || "media"}${ext}`;
}

function buildObjectKey(taskId: string, fileName: string) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  return `temp/homework-review/${year}/${month}/${day}/${taskId}/${sanitizeFileName(fileName)}`;
}

function getOssClient() {
  const accessKeyId =
    readEnv("OSS_ACCESS_KEY_ID") || getRequiredEnv("ALIBABA_CLOUD_ACCESS_KEY_ID");
  const accessKeySecret =
    readEnv("OSS_ACCESS_KEY_SECRET") ||
    getRequiredEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  const region = getRequiredEnv("OSS_REGION");
  const bucket = getRequiredEnv("OSS_BUCKET");
  const endpoint = readEnv("OSS_ENDPOINT") || undefined;

  return new OSS({
    accessKeyId,
    accessKeySecret,
    bucket,
    endpoint,
    region,
    secure: true,
  });
}

export async function uploadHomeworkReviewSourceFile(input: {
  file: File;
  taskId: string;
}) {
  const client = getOssClient();
  const objectKey = buildObjectKey(input.taskId, input.file.name);
  const fileBuffer = Buffer.from(await input.file.arrayBuffer());

  try {
    await client.put(objectKey, fileBuffer, {
      headers: input.file.type
        ? {
            "Content-Type": input.file.type,
          }
        : undefined,
      mime: input.file.type || undefined,
    });
  } catch (error) {
    throw new Error(
      `上传 OSS 失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const expires = getSignedUrlExpires();
  const signedUrl = client.signatureUrl(objectKey, { expires });

  return {
    objectKey,
    signedUrl,
    signedUrlExpiresAt: new Date(Date.now() + expires * 1000).toISOString(),
  };
}

export function createHomeworkReviewSourceUploadPlan(input: {
  fileName: string;
  fileType?: string;
  uploadId: string;
}) {
  const client = getOssClient();
  const objectKey = buildObjectKey(input.uploadId, input.fileName);
  const expires = getSignedUrlExpires();
  const uploadHeaders: Record<string, string> = input.fileType?.trim()
    ? {
        "Content-Type": input.fileType.trim(),
      }
    : {};
  const uploadUrl = client.signatureUrl(objectKey, {
    expires,
    method: "PUT",
    ...(input.fileType?.trim()
      ? {
          "Content-Type": input.fileType.trim(),
        }
      : {}),
  });

  return {
    objectKey,
    uploadHeaders,
    uploadUrl,
    uploadUrlExpiresAt: new Date(Date.now() + expires * 1000).toISOString(),
  };
}

export function getHomeworkReviewSourceFileSignedUrl(objectKey: string) {
  const client = getOssClient();
  const expires = getSignedUrlExpires();
  const signedUrl = client.signatureUrl(objectKey, { expires });

  return {
    objectKey,
    signedUrl,
    signedUrlExpiresAt: new Date(Date.now() + expires * 1000).toISOString(),
  };
}

export async function deleteHomeworkReviewSourceFile(objectKey: string) {
  const client = getOssClient();
  await client.delete(objectKey);
}
