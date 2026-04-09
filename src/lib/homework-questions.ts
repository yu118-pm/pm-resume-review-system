import type {
  HomeworkQuestion,
  HomeworkQuestionDraft,
  HomeworkQuestionSummary,
} from "@/lib/homework-review-types";

export const HOMEWORK_QUESTIONS: HomeworkQuestion[] = [];

export function listHomeworkQuestions(): HomeworkQuestionSummary[] {
  return HOMEWORK_QUESTIONS.map((question) => ({
    id: question.id,
    title: question.title,
    category: question.category,
    requiresStar: question.requiresStar,
    isCustom: false,
  }));
}

export function getHomeworkQuestionById(questionId: string) {
  return HOMEWORK_QUESTIONS.find((question) => question.id === questionId) ?? null;
}

export function createCustomHomeworkQuestion(
  draft: HomeworkQuestionDraft,
  questionId: string,
): HomeworkQuestion {
  return {
    id: questionId,
    title: draft.title.trim(),
    content: draft.content.trim(),
    category: draft.category?.trim() || "自定义题目",
    requiresStar: Boolean(draft.requiresStar),
    reviewFocus: draft.reviewFocus?.filter(Boolean),
  };
}
