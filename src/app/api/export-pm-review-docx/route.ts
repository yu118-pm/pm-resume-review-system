import { NextResponse } from "next/server";
import { exportPmReviewDocx } from "@/lib/pm-review-docx-export";
import {
  parsePmReviewCommentsInput,
  PmReviewParseError,
} from "@/lib/pm-review-parser";
import { createPmReviewFileName } from "@/lib/resume-template";
import type { ApiErrorResponse } from "@/lib/types";

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const commentsRaw = formData.get("comments");

  if (!(file instanceof File)) {
    return jsonError("缺少原始 DOCX 文件", 400);
  }

  if (!file.name.toLowerCase().endsWith(".docx")) {
    return jsonError("PM 简历批阅仅支持 DOCX 文件", 400);
  }

  if (typeof commentsRaw !== "string") {
    return jsonError("缺少批注数据", 400);
  }

  let comments;

  try {
    comments = parsePmReviewCommentsInput(JSON.parse(commentsRaw));
  } catch (error) {
    if (error instanceof PmReviewParseError || error instanceof SyntaxError) {
      return jsonError("批注数据格式不合法", 400);
    }

    return jsonError("批注数据解析失败", 400);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await exportPmReviewDocx(Buffer.from(arrayBuffer), comments);
    const fileName = createPmReviewFileName(file.name);

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
      error instanceof Error ? error.message : "PM 批阅 Word 导出失败",
      500,
    );
  }
}
