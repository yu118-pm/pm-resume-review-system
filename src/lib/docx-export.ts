import { buildResumeDocx } from "./resume-docx-builder";
import type { TemplateResumeData } from "@/lib/types";

export async function exportResumeDocx(
  templateResume: TemplateResumeData,
  profilePhotoDataUrl?: string | null,
) {
  try {
    return await buildResumeDocx(templateResume, profilePhotoDataUrl);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Word 导出失败: ${error.message}`);
    }

    throw new Error("Word 导出失败");
  }
}
