import { NextResponse } from "next/server";
import { checkOssAccess, getOssConfigSummary } from "@/lib/aliyun-oss";
import { getLLMConfigSummary } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = ["sin1"];

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function GET() {
  const ossConfig = getOssConfigSummary();
  const llmConfig = getLLMConfigSummary();
  const ossCheck =
    ossConfig.hasAccessKeyId &&
    ossConfig.hasAccessKeySecret &&
    Boolean(ossConfig.region) &&
    Boolean(ossConfig.bucket)
      ? await withTimeout(
          checkOssAccess(),
          5_000,
          {
            ok: false as const,
            message: "OSS 连通性检查超时，请重点检查 region、bucket 和网络放行",
            rawMessage: "timeout",
          },
        )
      : {
          ok: false as const,
          message: "OSS 相关环境变量不完整",
        };

  return NextResponse.json({
    success: true,
    checks: {
      oss: {
        configured:
          ossConfig.hasAccessKeyId &&
          ossConfig.hasAccessKeySecret &&
          Boolean(ossConfig.region) &&
          Boolean(ossConfig.bucket),
        region: ossConfig.region || "",
        bucket: ossConfig.bucket || "",
        endpoint: ossConfig.endpoint || "",
        result: ossCheck,
      },
      llm: {
        configured: llmConfig.hasApiKey,
        baseURL: llmConfig.baseURL,
        model: llmConfig.model,
      },
    },
  });
}
