import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const execFileAsync = promisify(execFile);
const PHOTO_SCRIPT_PATH = join(
  process.cwd(),
  "scripts",
  "extract_resume_photo.py",
);

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

  const workdir = await mkdtemp(join(tmpdir(), "resume-photo-"));
  const inputPath = join(workdir, `source.${ext}`);

  try {
    await writeFile(inputPath, buffer);
    const { stdout } = await execFileAsync("python3", [
      PHOTO_SCRIPT_PATH,
      "--input",
      inputPath,
    ]);
    return parsePhotoPayload(stdout);
  } catch {
    return null;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
