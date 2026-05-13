import { z } from "zod";
import { callLLM, callLLMWithImage } from "@/lib/openai";
import {
  looksLikeStructuredQaText,
  parseInterviewQaText,
} from "@/lib/interview-review-parser";
import {
  buildInterviewQaExtractionUserPrompt,
  buildInterviewReviewUserPrompt,
  INTERVIEW_QA_EXTRACTION_SYSTEM_PROMPT,
  INTERVIEW_REVIEW_SYSTEM_PROMPT,
} from "@/lib/interview-review-prompts";
import {
  interviewReviewResultSchema,
  type InterviewQaPair,
  type InterviewReviewResult,
} from "@/lib/interview-review-types";

const interviewQaExtractionSchema = z.object({
  qaPairs: z.array(
    z.object({
      id: z.string().min(1),
      question: z.string().min(1),
      answer: z.string(),
      sourceSegmentIds: z.array(z.string()).default([]),
    }),
  ),
});

function stripCodeFence(raw: string) {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseReviewResult(raw: string) {
  const normalized = stripCodeFence(raw);
  const parsed = JSON.parse(normalized) as unknown;
  return interviewReviewResultSchema.parse(parsed);
}

function parseQaExtractionResult(raw: string) {
  const normalized = stripCodeFence(raw);
  const parsed = JSON.parse(normalized) as unknown;
  return interviewQaExtractionSchema.parse(parsed);
}

function normalizeReviewResult(
  result: InterviewReviewResult,
  qaPairs: InterviewQaPair[],
  jdProvided: boolean,
) {
  if (result.items.length !== qaPairs.length) {
    throw new Error("模型输出题目数量与输入不一致");
  }

  result.items.forEach((item, index) => {
    const source = qaPairs[index];

    if (item.id !== source.id) {
      throw new Error("模型输出题目 ID 与输入不一致");
    }

    if (!jdProvided && item.analysis.jdMatch !== "未提供 JD，不做岗位匹配判断") {
      item.analysis.jdMatch = "未提供 JD，不做岗位匹配判断";
    }

    if (!source.answer.trim()) {
      item.answerStatus = "未回答/回答缺失";
      item.candidateAnswerSummary = "未回答/回答缺失";
      item.answerEvidenceQuotes = [];
    }
  });

  return result;
}

export async function buildInterviewQaPairs(rawQaText: string) {
  const qaPairs = parseInterviewQaText(rawQaText);

  if (qaPairs.length > 0 && looksLikeStructuredQaText(rawQaText)) {
    return qaPairs;
  }

  const raw = await callLLM(
    INTERVIEW_QA_EXTRACTION_SYSTEM_PROMPT,
    buildInterviewQaExtractionUserPrompt(rawQaText),
    {
      responseFormat: "json_object",
      temperature: 0.1,
      maxTokens: 4096,
    },
  );
  const extracted = parseQaExtractionResult(raw).qaPairs
    .map((item, index) => ({
      id: `qa_${index + 1}`,
      question: item.question.trim(),
      answer: item.answer.trim(),
      sourceSegmentIds: item.sourceSegmentIds ?? [],
    }))
    .filter((item) => item.question);

  if (extracted.length === 0) {
    throw new Error("未能从当前文本中提取出有效的面试问答，请检查转写内容是否完整");
  }

  return extracted;
}

export async function analyzeInterviewText(params: {
  studentName: string;
  targetRole: string;
  resumeText: string;
  jdText: string;
  jdImageDataUrl?: string;
  qaPairs: InterviewQaPair[];
}) {
  const userPrompt = buildInterviewReviewUserPrompt(params);
  const raw = params.jdImageDataUrl
    ? await callLLMWithImage(
        INTERVIEW_REVIEW_SYSTEM_PROMPT,
        {
          imageDataUrl: params.jdImageDataUrl,
          text: userPrompt,
        },
        {
          responseFormat: "json_object",
          temperature: 0.2,
          maxTokens: 8192,
        },
      )
    : await callLLM(INTERVIEW_REVIEW_SYSTEM_PROMPT, userPrompt, {
        responseFormat: "json_object",
        temperature: 0.2,
        maxTokens: 8192,
      });
  const parsed = parseReviewResult(raw);

  return normalizeReviewResult(parsed, params.qaPairs, Boolean(params.jdText.trim()));
}
