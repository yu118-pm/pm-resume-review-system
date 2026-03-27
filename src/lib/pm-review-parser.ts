import { z } from "zod";
import {
  NOTE_CONFIDENCE,
  PM_REVIEW_ACTION_TYPES,
  PM_REVIEW_MODULES,
  PM_REVIEW_PREVIOUS_ROUND_STATUS,
  type PmReviewComment,
  type StructureAnalysis,
} from "@/lib/types";

const MODULE_ALIASES: Record<string, (typeof PM_REVIEW_MODULES)[number]> = {
  "整体结构": "整体结构",
  "结构": "整体结构",
  "基础信息": "基础信息",
  "个人信息": "基础信息",
  "联系方式": "基础信息",
  "自我评价": "自我评价",
  "个人评价": "自我评价",
  "个人优势": "自我评价",
  "个人总结": "自我评价",
  "技能": "自我评价",
  "技能模块": "自我评价",
  "专业能力": "自我评价",
  "工具技能": "自我评价",
  "教育经历": "教育经历",
  "教育背景": "教育经历",
  "教育": "教育经历",
  "工作经历": "工作经历",
  "实习经历": "工作经历",
  "工作成果": "工作经历",
  "职业经历": "工作经历",
  "项目经历": "项目经历",
  "项目经验": "项目经历",
  "项目成果": "项目经历",
  "校内项目经历": "项目经历",
  "项目实践": "项目经历",
  "格式": "格式",
};

function toTrimmedString(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  return "";
}

function normalizeModule(value: unknown) {
  const text = toTrimmedString(value);
  return MODULE_ALIASES[text] ?? undefined;
}

function normalizeOptionalExample(value: unknown) {
  const text = toTrimmedString(value);
  return text || undefined;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  const text = toTrimmedString(value).toLowerCase();

  if (["true", "1", "yes", "y", "是"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "n", "否"].includes(text)) {
    return false;
  }

  return false;
}

function inferActionType(source: {
  actionType?: unknown;
  issueType?: unknown;
  comment?: unknown;
  suggestion?: unknown;
}) {
  const direct = toTrimmedString(source.actionType);
  if (PM_REVIEW_ACTION_TYPES.includes(direct as (typeof PM_REVIEW_ACTION_TYPES)[number])) {
    return direct as (typeof PM_REVIEW_ACTION_TYPES)[number];
  }

  const combined = [
    toTrimmedString(source.issueType),
    toTrimmedString(source.comment),
    toTrimmedString(source.suggestion),
  ].join(" ");

  if (/删除|去掉|移除/u.test(combined)) {
    return "delete";
  }

  if (/合并|整合/u.test(combined)) {
    return "merge";
  }

  if (/加粗|格式|字号|排版/u.test(combined)) {
    return "format";
  }

  if (/确认|真实性|是否存在|无法验证/u.test(combined)) {
    return "verify";
  }

  if (/压缩|精简|简化|收一下/u.test(combined)) {
    return "condense";
  }

  if (/顺序|倒序|前置|后置/u.test(combined)) {
    return "reorder";
  }

  if (/缺少|缺失|没有.*模块|补充.*模块|新增.*模块/u.test(combined)) {
    return "add";
  }

  return "rewrite";
}

function inferConfidence(value: unknown, needsConfirmation: boolean) {
  const text = toTrimmedString(value);

  if (NOTE_CONFIDENCE.includes(text as (typeof NOTE_CONFIDENCE)[number])) {
    return text as (typeof NOTE_CONFIDENCE)[number];
  }

  return needsConfirmation ? "low" : "medium";
}

function normalizeComment(input: unknown) {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const needsConfirmation = normalizeBoolean(
    source.needsConfirmation ?? source.needs_confirmation,
  );
  const example = normalizeOptionalExample(source.example);
  const suggestion =
    toTrimmedString(source.suggestion) ||
    example ||
    toTrimmedString(source.comment);
  const issueType =
    toTrimmedString(source.issueType) ||
    toTrimmedString(source.type) ||
    "待优化";

  const searchEvidence = normalizeOptionalExample(source.searchEvidence);
  const previousRoundStatus = normalizeOptionalExample(source.previousRoundStatus);

  return {
    sectionTitleOriginal:
      toTrimmedString(
        source.sectionTitleOriginal ??
        source.sectionTitle ??
        source.section ??
        source.module,
      ) || "未标明区块",
    normalizedModule:
      normalizeModule(source.normalizedModule) ??
      normalizeModule(source.module) ??
      normalizeModule(source.sectionTitleOriginal) ??
      normalizeModule(source.sectionTitle) ??
      normalizeModule(source.section),
    location: toTrimmedString(source.location) || "未定位",
    anchorText:
      toTrimmedString(source.anchorText) ||
      toTrimmedString(source.originalText),
    issueType,
    actionType: inferActionType({
      actionType: source.actionType,
      issueType,
      comment: source.comment,
      suggestion,
    }),
    comment: toTrimmedString(source.comment),
    suggestion,
    example,
    confidence: inferConfidence(source.confidence, needsConfirmation),
    needsConfirmation,
    ...(searchEvidence ? { searchEvidence } : {}),
    ...(previousRoundStatus ? { previousRoundStatus } : {}),
  };
}

const pmReviewCommentSchema = z.preprocess(
  normalizeComment,
  z.object({
    sectionTitleOriginal: z.string(),
    normalizedModule: z.enum(PM_REVIEW_MODULES).optional(),
    location: z.string(),
    anchorText: z.string(),
    issueType: z.string(),
    actionType: z.enum(PM_REVIEW_ACTION_TYPES),
    comment: z.string(),
    suggestion: z.string(),
    example: z.string().optional(),
    confidence: z.enum(NOTE_CONFIDENCE),
    needsConfirmation: z.boolean(),
    searchEvidence: z.string().optional(),
    previousRoundStatus: z.enum(PM_REVIEW_PREVIOUS_ROUND_STATUS).optional().catch(undefined),
  }),
);

const pmReviewCommentsSchema = z.array(pmReviewCommentSchema);

export class PmReviewParseError extends Error {
  constructor(
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = "PmReviewParseError";
  }
}

export function normalizePmReviewComments(
  comments: PmReviewComment[],
): PmReviewComment[] {
  return comments.map((comment) => {
    const normalizedExample = comment.example?.trim();

    if (!normalizedExample) {
      const { example: _example, ...rest } = comment;
      return {
        ...rest,
        sectionTitleOriginal: comment.sectionTitleOriginal.trim(),
        location: comment.location.trim(),
        anchorText: comment.anchorText.trim(),
        issueType: comment.issueType.trim(),
        comment: comment.comment.trim(),
        suggestion: comment.suggestion.trim(),
      };
    }

    return {
      ...comment,
      sectionTitleOriginal: comment.sectionTitleOriginal.trim(),
      location: comment.location.trim(),
      anchorText: comment.anchorText.trim(),
      issueType: comment.issueType.trim(),
      comment: comment.comment.trim(),
      suggestion: comment.suggestion.trim(),
      example: normalizedExample,
    };
  });
}

function extractJsonCandidates(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new PmReviewParseError("模型输出为空");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const primaryCandidate = fenced?.[1]?.trim() || trimmed;
  const candidates = [primaryCandidate];

  const objectStart = primaryCandidate.indexOf("{");
  const objectEnd = primaryCandidate.lastIndexOf("}");

  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    candidates.push(primaryCandidate.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = primaryCandidate.indexOf("[");
  const arrayEnd = primaryCandidate.lastIndexOf("]");

  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    candidates.push(primaryCandidate.slice(arrayStart, arrayEnd + 1));
  }

  return [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))];
}

function tryParseJson(raw: string): unknown {
  const candidates = extractJsonCandidates(raw);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      continue;
    }
  }

  throw new PmReviewParseError("模型输出 JSON 解析失败");
}

function extractArrayFromObjectCandidate(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }

  const record = parsed as Record<string, unknown>;

  if (
    (typeof record.sectionTitleOriginal === "string" ||
      typeof record.sectionTitle === "string" ||
      typeof record.module === "string") &&
    typeof record.location === "string" &&
    typeof record.anchorText === "string"
  ) {
    return [record];
  }

  for (const key of ["comments", "items", "data", "result", "output"]) {
    if (Array.isArray(record[key])) {
      return record[key];
    }

    if (record[key] && typeof record[key] === "object") {
      const nested: unknown = extractArrayFromObjectCandidate(record[key]);

      if (Array.isArray(nested)) {
        return nested;
      }
    }
  }

  return parsed;
}

export function parsePmReviewResponse(raw: string): PmReviewComment[] {
  return parsePmReviewCommentsInput(extractArrayFromObjectCandidate(tryParseJson(raw)));
}

const moduleInfoSchema = z.object({
  sectionTitle: z.string(),
  normalizedModule: z.string(),
  textContent: z.string().optional().default(""),
  needsDeepReview: z.boolean().default(false),
  mayNeedSearch: z.boolean().default(false),
});

const structureAnalysisSchema = z.object({
  modules: z.array(moduleInfoSchema).min(1),
  missingModules: z.array(z.string()).default([]),
  redundantModules: z.array(z.string()).default([]),
});

export function parseStructureAnalysis(raw: string): StructureAnalysis {
  const parsed = tryParseJson(raw);
  const candidate =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : { modules: parsed };

  const validated = structureAnalysisSchema.safeParse(candidate);

  if (!validated.success) {
    const details = validated.error.issues.slice(0, 5).map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    });
    throw new PmReviewParseError("结构识别输出解析失败", details);
  }

  return validated.data as StructureAnalysis;
}

export function parsePmReviewCommentsInput(input: unknown): PmReviewComment[] {
  const validated = pmReviewCommentsSchema.safeParse(input);

  if (!validated.success) {
    const details = validated.error.issues.slice(0, 5).map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    });
    throw new PmReviewParseError("模型输出批注结构不合法", details);
  }

  return normalizePmReviewComments(validated.data);
}
