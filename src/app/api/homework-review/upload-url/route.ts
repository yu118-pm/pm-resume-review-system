import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createHomeworkReviewSourceUploadPlan } from "@/lib/aliyun-oss";
import { validateHomeworkReviewSourceMeta } from "@/lib/homework-review-source";
import type { HomeworkReviewUploadPlanResponse } from "@/lib/homework-review-types";
import type { ApiErrorResponse } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const fileName = String(body.fileName ?? "").trim();
  const fileType = String(body.fileType ?? "").trim();
  const fileSize = Number(body.fileSize ?? 0);

  try {
    validateHomeworkReviewSourceMeta({
      fileName,
      fileSize,
      fileType,
    });

    return NextResponse.json<HomeworkReviewUploadPlanResponse>({
      success: true,
      upload: createHomeworkReviewSourceUploadPlan({
        fileName,
        fileType,
        uploadId: `upload_${Date.now()}_${randomUUID().slice(0, 8)}`,
      }),
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "创建上传地址失败，请稍后重试",
      400,
    );
  }
}
