import { NextResponse } from "next/server";
import { exportResumeDocx } from "@/lib/docx-export";
import { createResumeFileName } from "@/lib/resume-template";
import type {
  ApiErrorResponse,
  ExportResumeDocxRequest,
} from "@/lib/types";

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

export async function POST(request: Request) {
  let body: ExportResumeDocxRequest;

  try {
    body = (await request.json()) as ExportResumeDocxRequest;
  } catch {
    return jsonError("请求体不是合法 JSON", 400);
  }

  if (!body?.templateResume) {
    return jsonError("缺少模板简历数据", 400);
  }

  try {
    const buffer = await exportResumeDocx(
      body.templateResume,
      body.profilePhotoDataUrl,
    );
    const fileName = createResumeFileName(
      body.uploadedFileName,
      body.targetPosition ?? "",
      "docx",
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Word 导出失败",
      500,
    );
  }
}
