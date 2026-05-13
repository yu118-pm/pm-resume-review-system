import { NextResponse } from "next/server";
import { getInterviewAudioTaskPayload } from "@/lib/interview-review-audio-service";
import type { InterviewAudioStatusResponse } from "@/lib/interview-review-audio-types";
import type { ApiErrorResponse } from "@/lib/types";

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
    const task = await getInterviewAudioTaskPayload(taskId);
    return NextResponse.json<InterviewAudioStatusResponse>({
      success: true,
      task,
    });
  } catch (error) {
    console.error("[api/interview-review/audio/status] 查询失败", error);
    return jsonError(
      error instanceof Error ? error.message : "转写任务查询失败",
      404,
    );
  }
}
