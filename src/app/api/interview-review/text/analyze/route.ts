import { NextResponse } from "next/server";
import {
  analyzeInterviewText,
  buildInterviewQaPairs,
} from "@/lib/interview-review-service";
import {
  getInterviewStudent,
  saveInterviewReview,
} from "@/lib/interview-review-store";
import type {
  AnalyzeInterviewTextRequest,
  AnalyzeInterviewTextResponse,
} from "@/lib/interview-review-types";
import type { ApiErrorResponse } from "@/lib/types";
import { getLLMErrorInfo } from "@/lib/openai";

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

export async function POST(request: Request) {
  let body: AnalyzeInterviewTextRequest;

  try {
    body = (await request.json()) as AnalyzeInterviewTextRequest;
  } catch {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const studentId = body.studentId?.trim();
  const rawQaText = body.rawQaText?.trim();

  if (!studentId) {
    return jsonError("缺少 studentId", 400);
  }

  if (!rawQaText) {
    return jsonError("缺少面试问答内容", 400);
  }

  const student = await getInterviewStudent(studentId);

  if (!student) {
    return jsonError("学员不存在", 404);
  }

  const selectedResume = body.resumeId
    ? student.resumes.find((item) => item.id === body.resumeId)
    : student.resumes.find((item) => item.isDefault) ?? student.resumes[student.resumes.length - 1];
  const resumeText = body.resumeText?.trim() || selectedResume?.text?.trim() || "";

  if (!resumeText) {
    return jsonError("缺少简历内容，请先为学员上传简历", 400);
  }

  try {
    const qaPairs = buildInterviewQaPairs(rawQaText);
    const result = await analyzeInterviewText({
      studentName: student.name,
      targetRole: body.targetRole?.trim() || "",
      resumeText,
      jdText: body.jdText?.trim() || "",
      jdImageDataUrl: body.jdImageDataUrl?.trim() || undefined,
      qaPairs,
    });
    const review = await saveInterviewReview({
      studentId: student.id,
      studentName: student.name,
      targetRole: body.targetRole?.trim() || "",
      resumeId: selectedResume?.id,
      resumeText,
      jdText: body.jdText?.trim() || "",
      jdImageName: body.jdImageName?.trim() || undefined,
      qaPairs,
      rawQaText,
      result,
    });

    return NextResponse.json<AnalyzeInterviewTextResponse>({
      success: true,
      review,
    });
  } catch (error) {
    const llmError = getLLMErrorInfo(error);

    if (llmError) {
      console.error("[api/interview-review/text/analyze] 模型调用失败", llmError.log);
      return jsonError(llmError.message, llmError.status);
    }

    console.error("[api/interview-review/text/analyze] POST 失败", error);
    return jsonError(
      error instanceof Error ? error.message : "面试复盘分析失败",
      500,
    );
  }
}
