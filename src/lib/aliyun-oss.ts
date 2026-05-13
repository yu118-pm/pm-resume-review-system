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

function getOssErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/Access Key Id you provided does not exist/i.test(message)) {
    return "当前配置的 OSS AccessKey 无效或已失效，请检查 OSS_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_ID";
  }

  if (/InvalidAccessKeyId/i.test(message)) {
    return "当前配置的 OSS AccessKey 无效，请检查 OSS_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_ID";
  }

  if (/SignatureDoesNotMatch/i.test(message)) {
    return "OSS 鉴权签名失败，请检查 AccessKey Secret 是否正确";
  }

  return message;
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

export function getOssConfigSummary() {
  const accessKeyId = readEnv("OSS_ACCESS_KEY_ID") || readEnv("ALIBABA_CLOUD_ACCESS_KEY_ID");
  const accessKeySecret =
    readEnv("OSS_ACCESS_KEY_SECRET") || readEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  const region = readEnv("OSS_REGION");
  const bucket = readEnv("OSS_BUCKET");
  const endpoint = readEnv("OSS_ENDPOINT");

  return {
    hasAccessKeyId: Boolean(accessKeyId),
    hasAccessKeySecret: Boolean(accessKeySecret),
    region,
    bucket,
    endpoint,
  };
}

export async function checkOssAccess() {
  const client = getOssClient();

  try {
    await client.listV2({
      prefix: "temp/",
      "max-keys": 1,
    });

    return {
      ok: true as const,
      message: "OSS 连接正常",
    };
  } catch (error) {
    return {
      ok: false as const,
      message: getOssErrorMessage(error),
      rawMessage: error instanceof Error ? error.message : String(error),
    };
  }
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
    throw new Error(`上传 OSS 失败：${getOssErrorMessage(error)}`);
  }

  const expires = getSignedUrlExpires();
  const signedUrl = client.signatureUrl(objectKey, { expires });

  return {
    objectKey,
    signedUrl,
    signedUrlExpiresAt: new Date(Date.now() + expires * 1000).toISOString(),
  };
}

export async function createHomeworkReviewSourceUploadPlan(input: {
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
  const uploadUrl = await client.signatureUrlV4(
    "PUT",
    expires,
    Object.keys(uploadHeaders).length > 0
      ? {
          headers: uploadHeaders,
        }
      : undefined,
    objectKey,
    Object.keys(uploadHeaders),
  );

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
