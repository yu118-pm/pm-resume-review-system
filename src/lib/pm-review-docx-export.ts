import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPythonScript } from "@/lib/python-runtime";
import type { PmReviewComment } from "@/lib/types";

const SCRIPT_PATH = join(process.cwd(), "scripts", "annotate_pm_review_docx.py");

export async function exportPmReviewDocx(
  sourceBuffer: Buffer,
  comments: PmReviewComment[],
) {
  const workdir = await mkdtemp(join(tmpdir(), "pm-review-docx-"));
  const inputPath = join(workdir, "source.docx");
  const commentsPath = join(workdir, "comments.json");
  const outputPath = join(workdir, "reviewed.docx");

  try {
    await writeFile(inputPath, sourceBuffer);
    await writeFile(commentsPath, JSON.stringify(comments, null, 2), "utf-8");

    await runPythonScript(SCRIPT_PATH, [
      "--input",
      inputPath,
      "--comments",
      commentsPath,
      "--output",
      outputPath,
    ]);

    return await readFile(outputPath);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`PM 批阅 Word 导出失败: ${error.message}`);
    }

    throw new Error("PM 批阅 Word 导出失败");
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
