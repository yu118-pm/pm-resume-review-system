import { NextResponse } from "next/server";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/prompts";
import { callLLM } from "@/lib/openai";
import { parseAIResponse, ResumeParseError } from "@/lib/parser";
import {
  buildRetryPrompt,
  ResumeGuardError,
  validateResumeOutput,
} from "@/lib/resume-guard";
import {
  finalizeTemplateResume,
  renderResumePreviewMarkdown,
} from "@/lib/resume-template";
import type {
  ApiErrorResponse,
  OptimizeResumeRequest,
  OptimizeResumeResponse,
} from "@/lib/types";

function jsonError(message: string, status: number, details?: string[]) {
  return NextResponse.json<ApiErrorResponse>(
    details?.length
      ? { success: false, error: message, details }
      : { success: false, error: message },
    { status },
  );
}

export async function POST(request: Request) {
  let body: OptimizeResumeRequest;

  try {
    body = (await request.json()) as OptimizeResumeRequest;
  } catch {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const resumeText = body.resumeText?.trim();
  const targetPosition = body.targetPosition?.trim();
  const additionalInfo = body.additionalInfo?.trim();
  const experienceType = body.experienceType === "work" ? "work" : "internship";

  if (!resumeText) {
    return jsonError("缺少原始简历文本", 400);
  }

  if (!targetPosition) {
    return jsonError("缺少目标岗位名称", 400);
  }

  try {
    const basePrompt = buildUserPrompt({
      resumeText,
      targetPosition,
      additionalInfo,
      experienceType,
    });
    let raw = await callLLM(SYSTEM_PROMPT, basePrompt);
    let parsed = parseAIResponse(raw);

    try {
      validateResumeOutput(resumeText, parsed, additionalInfo);
    } catch (error) {
      if (!(error instanceof ResumeGuardError)) {
        throw error;
      }

      raw = await callLLM(
        SYSTEM_PROMPT,
        `${basePrompt}\n\n## 重新生成要求\n${buildRetryPrompt(error.violations)}`,
      );
      parsed = parseAIResponse(raw);
      validateResumeOutput(resumeText, parsed, additionalInfo);
    }

    const templateResume = finalizeTemplateResume(
      parsed.resume,
      experienceType,
      resumeText,
    );
    const previewMarkdown = renderResumePreviewMarkdown(templateResume);

    return NextResponse.json<OptimizeResumeResponse>({
      success: true,
      resume: previewMarkdown,
      templateResume,
      notes: parsed.notes,
    });
  } catch (error) {
    if (error instanceof ResumeParseError) {
      return jsonError("模型输出格式异常，请重试", 502);
    }

    if (error instanceof ResumeGuardError) {
      return jsonError("模型输出包含不可信内容，请重试", 502, error.violations);
    }

    return jsonError("简历优化失败，请稍后重试", 500);
  }
}
