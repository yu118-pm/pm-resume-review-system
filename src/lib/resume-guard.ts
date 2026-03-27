import type { ParsedAiResponse } from "@/lib/parser";
import {
  collectResumeStrings,
  findUnsupportedEducationFields,
} from "@/lib/resume-template";

export class ResumeGuardError extends Error {
  constructor(
    message: string,
    public readonly violations: string[],
  ) {
    super(message);
    this.name = "ResumeGuardError";
  }
}

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /XX大学|XX公司|某公司|某项目/u, reason: "包含示例占位信息" },
  {
    pattern: /待补充|未知|暂无|通用占位|请补充|如需准确填写|信息未提供/u,
    reason: "包含说明性占位词",
  },
  {
    pattern: /（注：|注：|\(注[:：]?/u,
    reason: "包含不应出现在正式简历正文中的备注",
  },
];

const SUSPICIOUS_METRICS: RegExp[] = [
  /\d+%/u,
  /提升\d+/u,
  /缩短\d+/u,
  /增长\d+/u,
  /降低\d+/u,
  /\d+\+?(?:余|多|近|约)?(?:份|个|次|款|人|家)/u,
];

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function containsSourceMetric(source: string, fragment: RegExp) {
  return fragment.test(source);
}

function collectNotesText(parsed: ParsedAiResponse) {
  return parsed.notes
    .flatMap((note) => [note.point, note.before, note.after, note.reason])
    .filter(Boolean)
    .join(" ");
}

function extractAdditionalInfoChunks(text: string) {
  return text
    .split(/[\n；;。]/u)
    .map((chunk) => normalizeText(chunk))
    .filter((chunk) => chunk.length >= 6)
    .filter((chunk) =>
      /(\d{4}\s*[.\-/年]\s*\d{1,2}|至今|经历|经验|实践|项目|运营|岗位|负责|任职|工作|实习|创业|经营|顾问|负责人)/u.test(
        chunk,
      ),
    )
    .slice(0, 6);
}

function hasChunkOverlap(candidate: string, target: string) {
  if (target.includes(candidate)) {
    return true;
  }

  const compact = candidate.replace(/[，。；：、\s]/gu, "");
  if (compact.length < 4) {
    return false;
  }

  for (let index = 0; index <= compact.length - 4; index += 1) {
    if (target.includes(compact.slice(index, index + 4))) {
      return true;
    }
  }

  return false;
}

function hasDuplicatedEducationFields(parsed: ParsedAiResponse) {
  const seen = new Set<string>();

  for (const education of parsed.resume.educations) {
    for (const value of [
      education.coreCourses,
      education.honors,
      education.certificates,
    ]) {
      const normalized = normalizeText(value);
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return true;
      }

      seen.add(key);
    }
  }

  return false;
}

export function validateResumeOutput(
  sourceResumeText: string,
  parsed: ParsedAiResponse,
  additionalInfo?: string,
): void {
  const violations: string[] = [];
  const normalizedResume = normalizeText(collectResumeStrings(parsed.resume).join(" "));
  const normalizedSource = normalizeText(
    [sourceResumeText, additionalInfo ?? ""].filter(Boolean).join(" "),
  );
  const normalizedNotes = normalizeText(collectNotesText(parsed));
  const normalizedOutput = `${normalizedResume} ${normalizedNotes}`.trim();

  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(normalizedResume)) {
      violations.push(rule.reason);
    }
  }

  for (const metricPattern of SUSPICIOUS_METRICS) {
    if (
      metricPattern.test(normalizedResume) &&
      !containsSourceMetric(normalizedSource, metricPattern)
    ) {
      violations.push("包含原文未提供的量化结果");
      break;
    }
  }

  if (
    !parsed.resume.educations.length &&
    !parsed.resume.experiences.length &&
    !parsed.resume.projects.length
  ) {
    violations.push("缺少可用的核心履历内容");
  }

  if (hasDuplicatedEducationFields(parsed)) {
    violations.push("教育经历附加信息疑似串条目");
  }

  violations.push(
    ...findUnsupportedEducationFields(parsed.resume.educations, sourceResumeText),
  );

  const hasProfessionalSummary =
    Boolean(parsed.resume.professionalStrengths.summary) ||
    parsed.resume.professionalStrengths.skillLines.length > 0;

  if (
    hasProfessionalSummary &&
    !normalizeText(parsed.resume.professionalStrengths.coreQuality)
  ) {
    violations.push("缺少核心素质");
  }

  const supplementChunks = extractAdditionalInfoChunks(additionalInfo ?? "");
  if (
    supplementChunks.length &&
    !supplementChunks.some((chunk) => hasChunkOverlap(chunk, normalizedOutput))
  ) {
    violations.push("补充信息中的经历未体现在简历或优化说明中");
  }

  if (violations.length) {
    throw new ResumeGuardError("简历输出命中真实性防护规则", violations);
  }
}

export function buildRetryPrompt(violations: string[]) {
  return `上一次输出不合格，原因如下：
- ${violations.join("\n- ")}

请重新生成，并严格遵守以下规则：
1. 不能写任何示例值、占位词、说明性备注到简历正文
2. 不能补充原简历或补充信息都没有提供的数字、百分比、年份、学校、公司、项目名称
3. 缺失字段填空字符串或空数组，不要写“无”“未知”“待补充”
4. professionalStrengths.coreQuality 不能留空
5. 补充信息里明确新增的经历，如果被采用，应落到合适板块；如果未采用，必须在优化说明中解释原因
6. 至少保留一个可用的教育、经历或项目条目
7. 只输出符合格式要求的最终结果`;
}
