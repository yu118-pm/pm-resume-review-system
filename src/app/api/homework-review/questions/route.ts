import { NextResponse } from "next/server";
import { listHomeworkQuestions } from "@/lib/homework-questions";
import type { HomeworkReviewQuestionsResponse } from "@/lib/homework-review-types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json<HomeworkReviewQuestionsResponse>({
    success: true,
    questions: listHomeworkQuestions(),
  });
}
