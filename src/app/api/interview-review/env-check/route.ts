import { NextResponse } from "next/server";
import { checkOssAccess, getOssConfigSummary } from "@/lib/aliyun-oss";
import { getLLMConfigSummary } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const ossConfig = getOssConfigSummary();
  const llmConfig = getLLMConfigSummary();
  const ossCheck =
    ossConfig.hasAccessKeyId &&
    ossConfig.hasAccessKeySecret &&
    Boolean(ossConfig.region) &&
    Boolean(ossConfig.bucket)
      ? await checkOssAccess()
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
