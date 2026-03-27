import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { TemplateResumeData } from "@/lib/types";

const execFileAsync = promisify(execFile);

const TEMPLATE_PATH = join(process.cwd(), "templates", "resume-template.docx");
const SCRIPT_PATH = join(process.cwd(), "scripts", "render_resume_docx.py");

function decodeProfilePhotoDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/i);
  if (!match) {
    return null;
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const extension = mimeType === "image/png" ? ".png" : ".jpg";

  return {
    extension,
    buffer: Buffer.from(base64, "base64"),
  };
}

export async function exportResumeDocx(
  templateResume: TemplateResumeData,
  profilePhotoDataUrl?: string | null,
) {
  const workdir = await mkdtemp(join(tmpdir(), "resume-docx-"));
  const inputPath = join(workdir, "resume.json");
  const outputPath = join(workdir, "resume.docx");
  const photo = profilePhotoDataUrl
    ? decodeProfilePhotoDataUrl(profilePhotoDataUrl)
    : null;
  const photoPath = photo ? join(workdir, `profile-photo${photo.extension}`) : null;

  try {
    await writeFile(
      inputPath,
      JSON.stringify(templateResume, null, 2),
      "utf-8",
    );

    if (photo && photoPath) {
      await writeFile(photoPath, photo.buffer);
    }

    const args = [
      SCRIPT_PATH,
      "--template",
      TEMPLATE_PATH,
      "--input",
      inputPath,
      "--output",
      outputPath,
    ];

    if (photoPath) {
      args.push("--photo", photoPath);
    }

    await execFileAsync("python3", args);

    return await readFile(outputPath);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Word 导出失败: ${error.message}`);
    }

    throw new Error("Word 导出失败");
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
