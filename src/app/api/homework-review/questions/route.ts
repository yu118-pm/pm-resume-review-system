import { NextResponse } from "next/server";
import {
  listHomeworkQuestions,
  upsertHomeworkQuestion,
} from "@/lib/homework-questions";
import type {
  HomeworkReviewQuestionsResponse,
  HomeworkReviewUpsertQuestionResponse,
} from "@/lib/homework-review-types";
import type { ApiErrorResponse } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

export async function GET() {
  try {
    return NextResponse.json<HomeworkReviewQuestionsResponse>({
      success: true,
      questions: await listHomeworkQuestions(),
    });
  } catch (error) {
    console.error("[api/homework-review/questions] 获取题目列表失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError("题目加载失败，请稍后重试", 500);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  const category = String(body.category ?? "").trim();
  const requiresStar = Boolean(body.requiresStar);

  if (!title || !content) {
    return jsonError("请填写题目标题和题目内容", 400);
  }

  try {
    const question = await upsertHomeworkQuestion({
      title,
      content,
      category: category || "自定义题目",
      requiresStar,
    });

    return NextResponse.json<HomeworkReviewUpsertQuestionResponse>({
      success: true,
      question: {
        id: question.id,
        title: question.title,
        category: question.category,
        requiresStar: question.requiresStar,
        isCustom: true,
      },
    });
  } catch (error) {
    console.error("[api/homework-review/questions] 保存题目失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(
      error instanceof Error ? error.message : "题目保存失败，请稍后重试",
      400,
    );
  }
}
