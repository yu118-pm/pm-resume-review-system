import { NextResponse } from "next/server";
import type { ApiErrorResponse } from "@/lib/types";
import { getHomeworkReviewTaskPayload } from "@/lib/homework-review-service";
import type { HomeworkReviewStatusResponse } from "@/lib/homework-review-types";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId")?.trim() ?? "";

  if (!taskId) {
    return jsonError("缺少 taskId", 400);
  }

  try {
    const task = await getHomeworkReviewTaskPayload(taskId);

    return NextResponse.json<HomeworkReviewStatusResponse>({
      success: true,
      task,
    });
  } catch (error) {
    console.error("[api/homework-review/status] 查询失败", {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });

    return jsonError(
      error instanceof Error ? error.message : "任务查询失败，请稍后重试",
      404,
    );
  }
}
