import { NextResponse } from "next/server";
import { submitInterviewAudioTask } from "@/lib/interview-review-audio-service";
import type { InterviewAudioSubmitResponse } from "@/lib/interview-review-audio-types";
import type { ApiErrorResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

function resolveAudioSubmitErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("通义听悟当日音视频文件转写试用额度已用完") ||
    message.includes("通义听悟单个音视频文件时长超限") ||
    message.includes("通义听悟单个音视频文件大小超限")
  ) {
    return 429;
  }

  return 400;
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return jsonError("请求体不是合法表单", 400);
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("缺少面试录音文件", 400);
  }

  try {
    const task = await submitInterviewAudioTask(file);
    return NextResponse.json<InterviewAudioSubmitResponse>({
      success: true,
      task,
    });
  } catch (error) {
    console.error("[api/interview-review/audio/submit] 提交失败", error);
    return jsonError(
      error instanceof Error ? error.message : "录音转写任务提交失败",
      resolveAudioSubmitErrorStatus(error),
    );
  }
}
