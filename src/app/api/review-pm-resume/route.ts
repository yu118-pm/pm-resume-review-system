import { NextResponse } from "next/server";
import { reviewResume } from "@/lib/pm-review-agent";
import type {
  ApiErrorResponse,
  ReviewPmResumeRequest,
  ReviewPmResumeResponse,
} from "@/lib/types";

function jsonError(message: string, status: number, details?: string[]) {
  return NextResponse.json<ApiErrorResponse>(
    details?.length
      ? { success: false, error: message, details }
      : { success: false, error: message },
    { status },
  );
}

export async function POST(request: Request) {
  let body: ReviewPmResumeRequest;

  try {
    body = (await request.json()) as ReviewPmResumeRequest;
  } catch {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const resumeText = body.resumeText?.trim();

  if (!resumeText) {
    return jsonError("缺少原始简历文本", 400);
  }

  try {
    const comments = await reviewResume(resumeText, body.sessionId);
    return NextResponse.json<ReviewPmResumeResponse>({ success: true, comments });
  } catch (error) {
    console.error("[api/review-pm-resume] 批阅失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError("PM 简历批阅失败，请稍后重试", 500);
  }
}
