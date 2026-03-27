import type { PmReviewComment } from "@/lib/types";

export class PmReviewGuardError extends Error {
  constructor(
    message: string,
    public readonly violations: string[],
  ) {
    super(message);
    this.name = "PmReviewGuardError";
  }
}

const AI_EVIDENCE_PATTERN =
  /(大模型|LLM|Prompt|RAG|NLP|推荐系统|标注|模型评测|算法协作|AI应用|人工智能|机器学习|AIGC)/iu;
const AI_SPECIAL_PATTERN =
  /(大模型|LLM|Prompt|RAG|NLP|推荐系统|模型评测|向量召回|意图识别|Agent|AIGC|人工智能|机器学习)/iu;
const DATA_ISSUE_PATTERN =
  /(数据|百分比|转化率|增长率|提升|降低|留存|GMV|点击率|注册成功率|转化|样本|口径|归因)/iu;
const SAFE_DATA_SUGGESTION =
  "补充统计周期、样本范围和归因说明；若无法补充，建议改为定性表达。";

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function fuzzyMatch(text: string, anchor: string, tolerance: number = 3): boolean {
  const normalizedText = normalizeText(text);
  const normalizedAnchor = normalizeText(anchor);

  if (normalizedText.includes(normalizedAnchor)) return true;

  if (normalizedAnchor.length > tolerance * 2) {
    const core = normalizedAnchor.slice(tolerance, -tolerance);
    if (normalizedText.includes(core)) return true;
  }

  return false;
}

function collectNumberTokens(text: string) {
  const matches =
    text.match(/\d+(?:\.\d+)?%?|\d+(?:\.\d+)?\s*(?:个|家|人|次|天|周|月|年|w|万|亿)/giu) ?? [];

  return matches.map((token) => normalizeText(token).toLowerCase());
}

function isDataComment(comment: PmReviewComment) {
  return DATA_ISSUE_PATTERN.test(
    [comment.issueType, comment.comment, comment.suggestion].join(" "),
  );
}

function buildCommentText(comment: PmReviewComment) {
  return [comment.issueType, comment.comment, comment.suggestion, comment.example ?? ""]
    .join(" ")
    .trim();
}

function getUnexpectedNumberTokens(
  sourceTokens: Set<string>,
  comment: PmReviewComment,
) {
  const generatedTokens = collectNumberTokens(buildCommentText(comment));
  return generatedTokens.filter((token) => !sourceTokens.has(token));
}

function containsAllAnchors(
  sourceResumeText: string,
  comments: PmReviewComment[],
  violations: string[],
) {
  for (const comment of comments) {
    if (comment.actionType === "add") continue;

    if (!fuzzyMatch(sourceResumeText, comment.anchorText)) {
      violations.push(`批注锚点未在原文中找到：${comment.location}`);
    }
  }
}

function checkUnexpectedNumbers(
  sourceResumeText: string,
  comments: PmReviewComment[],
  violations: string[],
) {
  const sourceTokens = new Set(collectNumberTokens(sourceResumeText));

  for (const comment of comments) {
    if (!isDataComment(comment)) {
      continue;
    }

    const unexpected = getUnexpectedNumberTokens(sourceTokens, comment);

    if (unexpected.length) {
      violations.push(`数据类批注引入了原文没有的新数字：${comment.location}`);
    }
  }
}

function checkAiSpecificComments(
  sourceResumeText: string,
  comments: PmReviewComment[],
  violations: string[],
) {
  if (AI_EVIDENCE_PATTERN.test(sourceResumeText)) {
    return;
  }

  for (const comment of comments) {
    const commentText = [
      comment.issueType,
      comment.comment,
      comment.suggestion,
      comment.example ?? "",
    ].join(" ");

    if (AI_SPECIAL_PATTERN.test(commentText)) {
      violations.push(`缺少 AI 证据却输出了 AI PM 专项批注：${comment.location}`);
    }
  }
}

export function sanitizePmReviewComments(
  sourceResumeText: string,
  comments: PmReviewComment[],
) {
  const sourceTokens = new Set(collectNumberTokens(sourceResumeText));
  const hasAiEvidence = AI_EVIDENCE_PATTERN.test(sourceResumeText);
  const sanitized: PmReviewComment[] = [];
  const dropped: string[] = [];

  for (const comment of comments) {
    if (comment.previousRoundStatus === "resolved") {
      dropped.push(`已解决的批注（resolved）已移除：${comment.location}`);
      continue;
    }

    if (comment.actionType !== "add" && !fuzzyMatch(sourceResumeText, comment.anchorText)) {
      dropped.push(`锚点未命中原文：${comment.location}`);
      continue;
    }

    if (!hasAiEvidence && AI_SPECIAL_PATTERN.test(buildCommentText(comment))) {
      dropped.push(`缺少 AI 证据的专项批注：${comment.location}`);
      continue;
    }

    const cleanedComment: PmReviewComment = {
      ...comment,
      searchEvidence: comment.searchEvidence?.trim() || undefined,
    };

    if (!isDataComment(cleanedComment)) {
      sanitized.push(cleanedComment);
      continue;
    }

    if (!getUnexpectedNumberTokens(sourceTokens, cleanedComment).length) {
      sanitized.push(cleanedComment);
      continue;
    }

    const normalizedComment: PmReviewComment = {
      ...cleanedComment,
      suggestion: SAFE_DATA_SUGGESTION,
    };
    const { example: _example, ...withoutExample } = normalizedComment;

    if (getUnexpectedNumberTokens(sourceTokens, withoutExample).length) {
      dropped.push(`数据类批注仍含新增数字：${comment.location}`);
      continue;
    }

    sanitized.push(withoutExample);
  }

  return { comments: sanitized, dropped };
}

export function validatePmReviewComments(
  sourceResumeText: string,
  comments: PmReviewComment[],
): void {
  const violations: string[] = [];

  if (!comments.length) {
    violations.push("模型未输出任何批注");
  }

  containsAllAnchors(sourceResumeText, comments, violations);
  checkUnexpectedNumbers(sourceResumeText, comments, violations);
  checkAiSpecificComments(sourceResumeText, comments, violations);

  for (const comment of comments) {
    if (comment.searchEvidence !== undefined && comment.searchEvidence.trim() === "") {
      violations.push(`searchEvidence 不能为空字符串：${comment.location}`);
    }
  }

  if (violations.length) {
    throw new PmReviewGuardError("PM 批阅结果未通过真实性校验", violations);
  }
}

export function buildPmReviewRetryPrompt(violations: string[]) {
  return `上一次输出不合格，原因如下：
- ${violations.join("\n- ")}

请重新生成，并严格遵守以下规则：
1. 只能输出合法 JSON，优先输出 {"comments":[...]}
2. anchorText 必须直接摘自原文
3. 数据类批注不能生成原文没有的新数字
4. 如果原文没有 AI 相关证据，不要输出 AI PM 专项批注
5. 可以不给 example，只要 suggestion 清楚即可
6. 不要输出与原文无关的批注`;
}
