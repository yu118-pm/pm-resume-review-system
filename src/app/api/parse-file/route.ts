import { NextResponse } from "next/server";
import { extractProfilePhoto, parseFile } from "@/lib/file-parser";
import type { ApiErrorResponse } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

export async function POST(request: Request) {
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
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const [text, profilePhotoDataUrl] = await Promise.all([
      parseFile(buffer, file.name),
      extractProfilePhoto(buffer, file.name),
    ]);

    if (!text) {
      return jsonError("文件内容为空或解析失败，请改为手动粘贴文本", 422);
    }

    return NextResponse.json({
      success: true,
      text,
      profilePhotoDataUrl,
    });
  } catch {
    return jsonError("文件解析失败，请改为手动粘贴文本", 422);
  }
}
