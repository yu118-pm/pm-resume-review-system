import { NextResponse } from "next/server";
import { exportInterviewReviewDocx } from "@/lib/interview-review-docx-export";
import type { ExportInterviewReviewDocxRequest } from "@/lib/interview-review-types";
import type { ApiErrorResponse } from "@/lib/types";

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

function buildFileName(studentName: string, targetRole: string) {
  const safeStudentName = studentName.trim() || "学员";
  const safeRole = targetRole.trim() || "面试复盘";
  return `${safeStudentName}-${safeRole}-面试复盘报告.docx`;
}

export async function POST(request: Request) {
  let body: ExportInterviewReviewDocxRequest;

  try {
    body = (await request.json()) as ExportInterviewReviewDocxRequest;
  } catch {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const review = body.review;

  if (!review) {
    return jsonError("缺少复盘结果", 400);
  }

  try {
    const buffer = await exportInterviewReviewDocx(review);
    const fileName = buildFileName(review.studentName, review.targetRole);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    console.error("[api/interview-review/export-docx] POST 失败", error);
    return jsonError(
      error instanceof Error ? error.message : "面试复盘 Word 导出失败",
      500,
    );
  }
}
