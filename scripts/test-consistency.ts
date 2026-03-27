/**
 * 直接测试 Step 5 一致性检查 LLM 调用
 * 运行方式：npx tsx scripts/test-consistency.ts
 */

import { callLLMWithMeta } from "../src/lib/openai";
import {
  CONSISTENCY_CHECK_SYSTEM_PROMPT,
  buildConsistencyCheckUserPrompt,
} from "../src/lib/pm-review-prompts";
import { parsePmReviewResponse } from "../src/lib/pm-review-parser";

const PREV_COMMENTS = [
  {
    sectionTitleOriginal: "项目经历",
    normalizedModule: "项目经历",
    location: "2023年 用户增长项目",
    anchorText: "通过A/B测试将注册转化率提升了很多",
    issueType: "数据不实/不可验证",
    actionType: "delete",
    comment: "'提升了很多'属主观模糊表述",
    suggestion: "删除模糊量词，仅保留可验证数据",
    confidence: "low",
    needsConfirmation: true,
  },
  {
    sectionTitleOriginal: "工作经历",
    normalizedModule: "工作经历",
    location: "2024年至今 某互联网公司",
    anchorText: "某互联网公司",
    issueType: "信息模糊",
    actionType: "rewrite",
    comment: "公司名称使用'某互联网公司'过于模糊",
    suggestion: "应填写真实公司全称",
    confidence: "low",
    needsConfirmation: true,
  },
];

const CURR_COMMENTS = [
  {
    sectionTitleOriginal: "项目经历",
    normalizedModule: "项目经历",
    location: "2023年 北大校园App冷启动注册转化率提升",
    anchorText: "通过分组测试将注册转化率从12%提升至18%",
    issueType: "统计口径不完整",
    actionType: "rewrite",
    comment: "缺少置信区间和样本量说明",
    suggestion: "补充置信度和样本量",
    confidence: "medium",
    needsConfirmation: false,
  },
  {
    sectionTitleOriginal: "工作经历",
    normalizedModule: "工作经历",
    location: "2024年7月至今 字节跳动",
    anchorText: "字节跳动 初级产品经理",
    issueType: "描述空泛",
    actionType: "rewrite",
    comment: "仅有一行描述，缺少成果",
    suggestion: "补充具体产出和指标",
    confidence: "medium",
    needsConfirmation: false,
  },
];

async function main() {
  console.log("🧪 一致性检查 LLM 直接测试\n");
  console.log("System Prompt:\n", CONSISTENCY_CHECK_SYSTEM_PROMPT.slice(-500), "\n");

  const userPrompt = buildConsistencyCheckUserPrompt(
    JSON.stringify(PREV_COMMENTS, null, 2),
    JSON.stringify(CURR_COMMENTS, null, 2),
  );
  console.log("User Prompt:\n", userPrompt, "\n");
  console.log("⏳ 调用 LLM...");

  try {
    const result = await callLLMWithMeta(
      CONSISTENCY_CHECK_SYSTEM_PROMPT,
      userPrompt,
      { maxTokens: 4096, responseFormat: "json_object", temperature: 0.3 },
    );

    console.log("\n📥 LLM 原始输出:\n", result.content);

    const comments = parsePmReviewResponse(result.content);
    console.log("\n📊 解析后批注数:", comments.length);
    for (const c of comments) {
      console.log(`  - [${c.previousRoundStatus ?? "❌无状态"}] ${c.anchorText}`);
    }

    const hasStatus = comments.some((c) => c.previousRoundStatus);
    console.log(hasStatus ? "\n✅ previousRoundStatus 已填充" : "\n❌ previousRoundStatus 全部缺失");
  } catch (e) {
    console.error("❌ 调用失败:", e instanceof Error ? e.message : String(e));
  }
}

void main().catch(console.error);
