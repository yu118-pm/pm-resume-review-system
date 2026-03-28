import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { extractBestResumePhotoFromDocx } from "./docx-photo-extractor";

export async function parseFile(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const parsed = await pdfParse(buffer);
    return parsed.text.trim();
  }

  if (ext === "docx") {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value.trim();
  }

  throw new Error("不支持的文件格式，请上传 PDF 或 DOCX 文件");
}

function parsePhotoPayload(stdout: string) {
  const text = stdout.trim();
  if (!text) {
    return null;
  }

  const payload = JSON.parse(text) as {
    mimeType?: string;
    base64?: string;
  };

  if (!payload.mimeType || !payload.base64) {
    return null;
  }

  return `data:${payload.mimeType};base64,${payload.base64}`;
}

export async function extractProfilePhoto(
  buffer: Buffer,
  filename: string,
): Promise<string | null> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext !== "docx") {
    return null;
  }

  try {
    const payload = await extractBestResumePhotoFromDocx(buffer);
    return payload
      ? parsePhotoPayload(JSON.stringify(payload))
      : null;
  } catch {
    return null;
  }
}
