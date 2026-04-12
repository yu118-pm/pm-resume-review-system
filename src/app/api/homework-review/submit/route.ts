import { NextResponse } from "next/server";
import type { ApiErrorResponse } from "@/lib/types";
import { submitHomeworkReviewTask } from "@/lib/homework-review-service";
import type { HomeworkReviewSubmitResponse } from "@/lib/homework-review-types";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.includes("application/json") ?? false;
}

export async function POST(request: Request) {
  try {
    if (isJsonRequest(request)) {
      const body = await request.json().catch(() => null);

      if (!body || typeof body !== "object") {
        return jsonError("请求体不是合法 JSON", 400);
      }

      const questionId = String(body.questionId ?? "").trim();
      const studentName = String(body.studentName ?? "").trim();
      const sourceObjectKey = String(body.sourceObjectKey ?? "").trim();
      const fileName = String(body.fileName ?? "").trim();
      const fileType = String(body.fileType ?? "").trim();
      const fileSize = Number(body.fileSize ?? 0);

      if (!questionId) {
        return jsonError("缺少题目 ID", 400);
      }

      if (!sourceObjectKey || !fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
        return jsonError("缺少已上传文件信息", 400);
      }

      const task = await submitHomeworkReviewTask({
        fileName,
        fileSize,
        fileType,
        questionId,
        sourceObjectKey,
        studentName,
      });

      return NextResponse.json<HomeworkReviewSubmitResponse>({
        success: true,
        task,
      });
    }

    const formData = await request.formData().catch(() => null);

    if (!formData) {
      return jsonError("请求体不是合法表单", 400);
    }

    const file = formData.get("file");
    const questionId = String(formData.get("questionId") ?? "").trim();
    const studentName = String(formData.get("studentName") ?? "").trim();
    const questionMode = String(formData.get("questionMode") ?? "preset").trim();
    const customQuestionTitle = String(formData.get("customQuestionTitle") ?? "").trim();
    const customQuestionContent = String(formData.get("customQuestionContent") ?? "").trim();
    const customQuestionCategory = String(formData.get("customQuestionCategory") ?? "").trim();
    const customQuestionRequiresStar = String(
      formData.get("customQuestionRequiresStar") ?? "",
    ).trim() === "true";

    if (!(file instanceof File)) {
      return jsonError("缺少音视频文件", 400);
    }

    if (questionMode !== "custom" && !questionId) {
      return jsonError("缺少题目 ID", 400);
    }

    if (questionMode === "custom" && (!customQuestionTitle || !customQuestionContent)) {
      return jsonError("请填写自定义题目标题和题目内容", 400);
    }

    const task = await submitHomeworkReviewTask({
      customQuestion:
        questionMode === "custom"
          ? {
              title: customQuestionTitle,
              content: customQuestionContent,
              category: customQuestionCategory || "自定义题目",
              requiresStar: customQuestionRequiresStar,
            }
          : undefined,
      file,
      questionId,
      studentName,
    });

    return NextResponse.json<HomeworkReviewSubmitResponse>({
      success: true,
      task,
    });
  } catch (error) {
    console.error("[api/homework-review/submit] 提交失败", {
      error: error instanceof Error ? error.message : String(error),
    });

    return jsonError(
      error instanceof Error ? error.message : "任务提交失败，请稍后重试",
      400,
    );
  }
}
