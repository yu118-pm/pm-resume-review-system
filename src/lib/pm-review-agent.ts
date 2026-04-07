import { callLLMWithMeta } from "@/lib/openai";
import { parsePmReviewResponse, parseStructureAnalysis } from "@/lib/pm-review-parser";
import { sanitizePmReviewComments, validatePmReviewComments } from "@/lib/pm-review-guard";
import {
  STRUCTURE_ANALYSIS_SYSTEM_PROMPT,
  DATA_VALIDATION_SYSTEM_PROMPT,
  getModuleSystemPrompt,
  buildStructureAnalysisUserPrompt,
  buildModuleReviewUserPrompt,
  buildDataValidationUserPrompt,
  buildParseRetryPrompt,
} from "@/lib/pm-review-prompts";
import { getLatestReview, saveReviewResult } from "@/lib/pm-review-history";
import { createSearchCache } from "@/lib/pm-review-tools";
import type { PmReviewComment, CompanySearchResult, IndustrySearchResult } from "@/lib/types";

export interface ReviewProgress {
  step: number;
  stepName: string;
  detail: string;
}

interface StructureModule {
  normalizedModule: string;
  textContent?: string;
}

// ─── 常量 ─────────────────────────────────────────────────────────────────────

const DATA_KEYWORDS =
  /数据|百分比|转化率|增长率|提升|降低|留存|GMV|点击率|注册成功率|转化|样本|口径|归因|DAU|MAU|活跃用户|完播率/iu;

const COMPANY_NAME_PATTERN =
  /([^\s，。、（(【\n]{2,20}(?:公司|集团|科技|技术|网络|信息|数据|互联网|有限责任|软件|金融|银行|证券|保险|传媒|游戏|教育|出行|健康))/gu;

const KNOWN_COMPANIES = [
  "阿里巴巴", "腾讯", "字节跳动", "美团", "京东", "百度",
  "网易", "滴滴", "小红书", "拼多多", "华为", "小米",
  "蚂蚁集团", "快手", "微博", "携程", "贝壳", "理想", "蔚来",
];

const METRIC_KEYWORDS = [
  "转化率", "留存率", "DAU", "MAU", "注册成功率",
  "GMV", "点击率", "完播率", "活跃用户", "增长率",
];

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

/** 字符级 Jaccard 相似度（去空格） */
function charJaccard(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const sa = new Set([...a.replace(/\s+/g, "")]);
  const sb = new Set([...b.replace(/\s+/g, "")]);
  let common = 0;
  for (const ch of sa) if (sb.has(ch)) common++;
  return common / (sa.size + sb.size - common);
}

/**
 * 将当前批注与上一轮批注对比，确定性地标注 previousRoundStatus。
 * - new: 当前批注在上一轮中找不到相似批注
 * - unchanged: 找到相似批注且上轮的 anchorText 仍在简历原文中（未修改）
 * - modified: 找到相似批注但上轮 anchorText 不再出现于原文（已改写但问题未消除）
 */
function markPreviousRoundStatus(
  currentComments: PmReviewComment[],
  previousComments: PmReviewComment[],
  currentResumeText: string,
): PmReviewComment[] {
  return currentComments.map((comment) => {
    let bestScore = 0;
    let bestPrev: PmReviewComment | null = null;

    for (const prev of previousComments) {
      if (prev.normalizedModule !== comment.normalizedModule) continue;

      const anchorSim = charJaccard(comment.anchorText, prev.anchorText);
      const issueSim = comment.issueType === prev.issueType ? 1.0
        : charJaccard(comment.issueType, prev.issueType);
      const score = anchorSim * 0.65 + issueSim * 0.35;

      if (score > bestScore) {
        bestScore = score;
        bestPrev = prev;
      }
    }

    const MATCH_THRESHOLD = 0.25;
    if (!bestPrev || bestScore < MATCH_THRESHOLD) {
      return { ...comment, previousRoundStatus: "new" as const };
    }

    const prevAnchorStillInResume = currentResumeText.includes(
      bestPrev.anchorText.replace(/\s+/g, "").slice(0, 8),
    );
    const status: PmReviewComment["previousRoundStatus"] = prevAnchorStillInResume
      ? "unchanged"
      : "modified";
    return { ...comment, previousRoundStatus: status };
  });
}

function isDataIssue(comment: PmReviewComment): boolean {
  return DATA_KEYWORDS.test(
    [comment.issueType, comment.comment, comment.suggestion].join(" "),
  );
}

function extractCompanyNames(text: string): string[] {
  const names = new Set<string>();

  for (const name of KNOWN_COMPANIES) {
    if (text.includes(name)) names.add(name);
  }

  const matches = text.matchAll(COMPANY_NAME_PATTERN);
  for (const match of matches) {
    if (match[1] && match[1].length >= 2) names.add(match[1]);
  }

  return [...names].slice(0, 5);
}

function extractMetricsFromComments(
  comments: PmReviewComment[],
): Array<{ keyword: string; metric: string }> {
  const results: Array<{ keyword: string; metric: string }> = [];
  const seen = new Set<string>();

  for (const comment of comments) {
    const text = [comment.issueType, comment.comment, comment.suggestion].join(" ");
    for (const metric of METRIC_KEYWORDS) {
      if (text.includes(metric) && !seen.has(metric)) {
        seen.add(metric);
        results.push({ keyword: "互联网", metric });
      }
    }
  }

  return results;
}

function mergeUpdatedComments(
  all: PmReviewComment[],
  updated: PmReviewComment[],
): void {
  for (const updatedComment of updated) {
    const idx = all.findIndex(
      (c) =>
        c.anchorText === updatedComment.anchorText &&
        c.location === updatedComment.location,
    );
    if (idx !== -1) {
      all[idx] = updatedComment;
    }
  }
}

function buildMissingModuleComment(moduleName: string): PmReviewComment {
  return {
    sectionTitleOriginal: "（整体结构）",
    normalizedModule: "整体结构",
    location: "简历整体",
    anchorText: `（简历缺少${moduleName}模块）`,
    issueType: "缺少核心模块",
    actionType: "add",
    comment: `简历缺少${moduleName}模块，建议添加。`,
    suggestion: `建议在合适位置添加${moduleName}相关内容。`,
    confidence: "high",
    needsConfirmation: false,
  };
}

async function reviewSingleModule(
  module: StructureModule,
  resumeText: string,
  onProgress?: (progress: ReviewProgress) => void,
): Promise<PmReviewComment[]> {
  onProgress?.({ step: 3, stepName: "分模块批阅", detail: module.normalizedModule });
  console.log("[pm-review-agent] Step 3: 模块批阅中", {
    module: module.normalizedModule,
  });

  const moduleText = module.textContent || resumeText;
  const systemPrompt = getModuleSystemPrompt(module.normalizedModule);
  const baseUserPrompt = buildModuleReviewUserPrompt(moduleText, resumeText);
  const maxTokens = module.normalizedModule === "项目经历" ? 4096 : 3072;

  let lastParseError: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const userPrompt =
        attempt === 2 && lastParseError
          ? `${baseUserPrompt}\n\n${buildParseRetryPrompt(lastParseError)}`
          : baseUserPrompt;

      const result = await callLLMWithMeta(systemPrompt, userPrompt, {
        maxTokens,
        responseFormat: "json_object",
        temperature: 0.3,
      });
      return parsePmReviewResponse(result.content);
    } catch (e) {
      lastParseError = e instanceof Error ? e.message : String(e);
      if (attempt === 2) {
        console.error(
          `[pm-review-agent] Step 3: 模块 ${module.normalizedModule} 批阅失败，跳过`,
          { error: lastParseError },
        );
      } else {
        console.warn(
          `[pm-review-agent] Step 3: 模块 ${module.normalizedModule} 批阅失败，重试`,
          { error: lastParseError },
        );
      }
    }
  }

  return [];
}

// ─── 主函数 ───────────────────────────────────────────────────────────────────

export async function reviewResume(
  resumeText: string,
  sessionId?: string,
  onProgress?: (progress: ReviewProgress) => void,
): Promise<PmReviewComment[]> {

  // ── Step 1: 读取会话历史 ────────────────────────────────────────────────────
  onProgress?.({ step: 1, stepName: "读取会话历史", detail: sessionId ?? "无" });

  let previousReview = null;
  if (sessionId) {
    try {
      previousReview = await getLatestReview(sessionId);
    } catch (e) {
      console.warn("[pm-review-agent] Step 1: 读取会话历史失败，视为首次批阅", {
        sessionId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  console.log("[pm-review-agent] Step 1: 读取会话历史", {
    sessionId,
    hasPrevious: !!previousReview,
  });

  // ── Step 2: 结构识别 ────────────────────────────────────────────────────────
  onProgress?.({ step: 2, stepName: "结构识别", detail: "分析简历结构" });

  let structure;
  let structureError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const llmResult = await callLLMWithMeta(
        STRUCTURE_ANALYSIS_SYSTEM_PROMPT,
        buildStructureAnalysisUserPrompt(resumeText),
        { maxTokens: 2048, responseFormat: "json_object", temperature: 0.3 },
      );
      structure = parseStructureAnalysis(llmResult.content);
      structureError = null;
      break;
    } catch (e) {
      structureError = e instanceof Error ? e : new Error(String(e));
      if (attempt === 1) {
        console.warn("[pm-review-agent] Step 2: 结构识别失败，重试", {
          error: structureError.message,
        });
      }
    }
  }

  if (!structure || structureError) {
    console.error("[pm-review-agent] Step 2: 结构识别失败，无法继续", {
      error: structureError?.message,
    });
    throw structureError ?? new Error("结构识别失败");
  }

  console.log("[pm-review-agent] Step 2: 结构识别完成", {
    moduleCount: structure.modules.length,
    missing: structure.missingModules,
  });

  // ── Step 3: 分模块批阅 ──────────────────────────────────────────────────────
  const allComments = (
    await Promise.all(
      structure.modules.map((module) => reviewSingleModule(module, resumeText, onProgress)),
    )
  ).flat();

  for (const missing of structure.missingModules) {
    allComments.push(buildMissingModuleComment(missing));
  }

  console.log("[pm-review-agent] Step 3: 模块批阅完成", {
    totalComments: allComments.length,
  });

  // ── Step 4: 数据验证 ────────────────────────────────────────────────────────
  const dataComments = allComments.filter((c) => c.needsConfirmation && isDataIssue(c));

  console.log("[pm-review-agent] Step 4: 数据验证", {
    dataCommentsCount: dataComments.length,
    searched: dataComments.length > 0,
  });

  if (dataComments.length > 0) {
    try {
      onProgress?.({
        step: 4,
        stepName: "数据验证",
        detail: `验证 ${dataComments.length} 条数据批注`,
      });

      const cache = createSearchCache();

      const companyNames = extractCompanyNames(resumeText);
      const companyResults: Record<string, CompanySearchResult | null> = {};
      for (const name of companyNames) {
        companyResults[name] = await cache.searchCompany(name);
      }

      const metrics = extractMetricsFromComments(dataComments);
      const industryResults: Record<string, IndustrySearchResult | null> = {};
      for (const { keyword, metric } of metrics) {
        industryResults[`${keyword}:${metric}`] = await cache.searchIndustry(keyword, metric);
      }

      const hasResults =
        Object.values(companyResults).some((r) => r !== null) ||
        Object.values(industryResults).some((r) => r !== null);

      if (hasResults) {
        const validationResult = await callLLMWithMeta(
          DATA_VALIDATION_SYSTEM_PROMPT,
          buildDataValidationUserPrompt(
            JSON.stringify(dataComments),
            JSON.stringify({ companies: companyResults, industries: industryResults }),
          ),
          { maxTokens: 3072, responseFormat: "json_object", temperature: 0.3 },
        );
        const updatedComments = parsePmReviewResponse(validationResult.content);
        mergeUpdatedComments(allComments, updatedComments);
      }
    } catch (e) {
      console.warn("[pm-review-agent] Step 4: 数据验证失败，保留原始批注", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── Step 5: 历史对比（确定性算法）──────────────────────────────────────────
  console.log("[pm-review-agent] Step 5: 历史对比", { hasPrevious: !!previousReview });

  if (previousReview) {
    onProgress?.({
      step: 5,
      stepName: "历史对比",
      detail: `对比第 ${previousReview.round} 轮批阅结果`,
    });

    const marked = markPreviousRoundStatus(allComments, previousReview.comments, resumeText);
    allComments.splice(0, allComments.length, ...marked);

    const statusCounts = allComments.reduce<Record<string, number>>((acc, c) => {
      const status = c.previousRoundStatus ?? "new";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});

    console.log("[pm-review-agent] Step 5: 历史对比完成", { statusCounts });
  }

  // ── Step 6: Guard 校验 ──────────────────────────────────────────────────────
  onProgress?.({ step: 6, stepName: "Guard 校验", detail: "校验批注合规性" });

  const { comments: finalComments, dropped } = sanitizePmReviewComments(
    resumeText,
    allComments,
  );

  console.log("[pm-review-agent] Step 6: Guard 校验", {
    before: allComments.length,
    after: finalComments.length,
    dropped: dropped.length,
  });

  if (dropped.length > 0) {
    console.warn("[pm-review-agent] Step 6: 移除了不合规批注", { dropped });
  }

  try {
    validatePmReviewComments(resumeText, finalComments);
  } catch (e) {
    console.warn("[pm-review-agent] Step 6: validatePmReviewComments 警告", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ── Step 7: 保存结果 ────────────────────────────────────────────────────────
  if (sessionId) {
    try {
      onProgress?.({
        step: 7,
        stepName: "保存结果",
        detail: `保存 ${finalComments.length} 条批注`,
      });
      await saveReviewResult(sessionId, resumeText, finalComments);
      console.log("[pm-review-agent] Step 7: 保存完成", {
        sessionId,
        commentCount: finalComments.length,
      });
    } catch (e) {
      console.error("[pm-review-agent] Step 7: 保存失败", {
        sessionId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return finalComments;
}
