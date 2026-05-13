import { NextResponse } from "next/server";
import { parseFile } from "@/lib/file-parser";
import { saveInterviewResume } from "@/lib/interview-review-store";
import type { InterviewStudentResponse } from "@/lib/interview-review-types";
import type { ApiErrorResponse } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ studentId: string }> },
) {
  const { studentId } = await context.params;
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("缺少上传文件", 400);
  }

  const filename = file.name.toLowerCase();

  if (!filename.endsWith(".pdf") && !filename.endsWith(".docx")) {
    return jsonError("不支持的文件格式，请上传 PDF 或 DOCX 文件", 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return jsonError("文件大小不能超过 10MB", 400);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await parseFile(buffer, file.name);

    if (!text.trim()) {
      return jsonError("文件内容为空或解析失败，请改为手动粘贴文本", 422);
    }

    const { student } = await saveInterviewResume({
      studentId,
      filename: file.name,
      text,
    });

    return NextResponse.json<InterviewStudentResponse>({ success: true, student });
  } catch (error) {
    if (error instanceof Error && error.message === "学员不存在") {
      return jsonError("学员不存在", 404);
    }

    console.error("[api/interview-review/students/:studentId/resumes] POST 失败", error);
    return jsonError("简历上传失败", 500);
  }
}
