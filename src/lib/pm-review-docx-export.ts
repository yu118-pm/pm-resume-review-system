import { annotatePmReviewDocx } from "@/lib/pm-review-docx-annotator";
import type { PmReviewComment } from "@/lib/types";

export async function exportPmReviewDocx(
  sourceBuffer: Buffer,
  comments: PmReviewComment[],
) {
  try {
    return await annotatePmReviewDocx(sourceBuffer, comments);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`PM 批阅 Word 导出失败: ${error.message}`);
    }

    throw new Error("PM 批阅 Word 导出失败");
  }
}
