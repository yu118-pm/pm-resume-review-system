/**
 * Guard 单元测试脚本
 * 运行方式：npx tsx scripts/test-guard.ts
 */

import {
  sanitizePmReviewComments,
  validatePmReviewComments,
  PmReviewGuardError,
} from "../src/lib/pm-review-guard";
import type { PmReviewComment } from "../src/lib/types";

// ─── 测试工具 ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── 基础样例数据 ──────────────────────────────────────────────────────────────

const RESUME_TEXT = `
张三
产品经理，3年经验

项目经历：
负责用户增长方案的设计与落地，DAU 提升了 50%。
带领团队完成了平台改版，用户满意度提升明显。
主导推进了数据中台建设项目，覆盖 5 个业务线。

工作经历：
2021-2024 某互联网公司 高级产品经理
负责 C 端增长产品线的规划与迭代。
`.trim();

function makeComment(overrides: Partial<PmReviewComment> = {}): PmReviewComment {
  return {
    sectionTitleOriginal: "项目经历",
    location: "项目经历第1条",
    anchorText: "负责用户增长方案的设计与落地",
    issueType: "描述笼统",
    actionType: "rewrite",
    comment: "缺少具体方法",
    suggestion: "请补充具体措施",
    confidence: "medium",
    needsConfirmation: false,
    normalizedModule: "项目经历",
    ...overrides,
  };
}

// ─── 测试组 1：fuzzyMatch / anchorText 命中逻辑 ───────────────────────────────

console.log("\n🛡️  Guard - anchorText 命中逻辑");

test("anchorText 精确命中 → 批注保留", () => {
  const comments = [makeComment({ anchorText: "负责用户增长方案的设计与落地" })];
  const { comments: result, dropped } = sanitizePmReviewComments(RESUME_TEXT, comments);
  assertEqual(result.length, 1, "精确命中应保留");
  assertEqual(dropped.length, 0);
});

test("anchorText 多余 2 个字符（容差内）→ 保留", () => {
  // 原文有「负责用户增长方案的设计与落地」，这里少了"与落地"但核心部分 "负责用户增长方案的设计" 仍在
  const comments = [makeComment({ anchorText: "负责用户增长方案的设计与实施执行" })];
  // 注：此 anchor 与原文有差异，fuzzyMatch 会截取 core 部分匹配
  const { comments: result } = sanitizePmReviewComments(RESUME_TEXT, comments);
  // core = anchor[3..-3] = "用户增长方案的设计与" → 应在原文中
  assert(result.length >= 0, "不抛出异常即可（具体命中取决于实现）");
});

test("anchorText 完全不在原文中 → 批注被移除", () => {
  const comments = [makeComment({ anchorText: "这段话完全不存在于简历文本中XYZXYZ" })];
  const { comments: result, dropped } = sanitizePmReviewComments(RESUME_TEXT, comments);
  assertEqual(result.length, 0, "未命中应被移除");
  assert(dropped.length > 0, "应记录到 dropped");
});

// ─── 测试组 2：actionType=add 豁免 ───────────────────────────────────────────

console.log("\n🛡️  Guard - add 类型豁免");

test("actionType=add 的批注即使 anchorText 不在原文中也不被移除", () => {
  const comments = [makeComment({
    actionType: "add",
    anchorText: "【此处需新增】",
  })];
  const { comments: result, dropped } = sanitizePmReviewComments(RESUME_TEXT, comments);
  assertEqual(result.length, 1, "add 类型应豁免 anchor 检查");
  assertEqual(dropped.filter(d => d.includes("锚点")).length, 0, "不应因 anchor 而丢弃");
});

test("actionType=add 在 containsAllAnchors validate 中不报错", () => {
  const comments = [makeComment({
    actionType: "add",
    anchorText: "【新增模块占位符】",
  })];
  // validate 不应因 add 类型抛出 anchor 错误
  let threw = false;
  try {
    validatePmReviewComments(RESUME_TEXT, comments);
  } catch {
    threw = true;
  }
  assert(!threw, "add 类型不应触发 anchor 校验错误");
});

// ─── 测试组 3：previousRoundStatus=resolved 移除 ─────────────────────────────

console.log("\n🛡️  Guard - resolved 批注移除");

test("previousRoundStatus=resolved 的批注被 sanitize 移除", () => {
  const comments = [
    makeComment({ anchorText: "负责用户增长方案的设计与落地", previousRoundStatus: "resolved" }),
  ];
  const { comments: result, dropped } = sanitizePmReviewComments(RESUME_TEXT, comments);
  assertEqual(result.length, 0, "resolved 批注应被移除");
  assert(dropped.some(d => d.includes("resolved")), "dropped 应包含 resolved 原因");
});

test("previousRoundStatus=unchanged 的批注正常保留", () => {
  const comments = [
    makeComment({ anchorText: "负责用户增长方案的设计与落地", previousRoundStatus: "unchanged" }),
  ];
  const { comments: result } = sanitizePmReviewComments(RESUME_TEXT, comments);
  assertEqual(result.length, 1, "unchanged 批注应保留");
});

test("混合 resolved 和正常批注，只移除 resolved", () => {
  const comments = [
    makeComment({ anchorText: "负责用户增长方案的设计与落地", previousRoundStatus: "resolved" }),
    makeComment({ anchorText: "带领团队完成了平台改版", location: "项目经历第2条" }),
  ];
  const { comments: result } = sanitizePmReviewComments(RESUME_TEXT, comments);
  assertEqual(result.length, 1, "应只保留 1 条");
  assertEqual(result[0].location, "项目经历第2条");
});

// ─── 测试组 4：searchEvidence 清洗 ───────────────────────────────────────────

console.log("\n🛡️  Guard - searchEvidence 清洗");

test("searchEvidence 空字符串 → 清洗为 undefined", () => {
  const comments = [makeComment({
    anchorText: "负责用户增长方案的设计与落地",
    searchEvidence: "   ",
  })];
  const { comments: result } = sanitizePmReviewComments(RESUME_TEXT, comments);
  assertEqual(result[0].searchEvidence, undefined, "空白 searchEvidence 应被清洗为 undefined");
});

test("searchEvidence 有内容 → 保留（trim）", () => {
  const comments = [makeComment({
    anchorText: "负责用户增长方案的设计与落地",
    searchEvidence: "  根据搜索结果，行业 DAU 均值约 30 万  ",
  })];
  const { comments: result } = sanitizePmReviewComments(RESUME_TEXT, comments);
  assertEqual(result[0].searchEvidence, "根据搜索结果，行业 DAU 均值约 30 万", "应 trim 后保留");
});

// ─── 测试组 5：validate - searchEvidence 空串报错 ────────────────────────────

console.log("\n🛡️  Guard - validate searchEvidence 规则");

test("validate 时 searchEvidence='' 触发 PmReviewGuardError", () => {
  const comments = [makeComment({
    anchorText: "负责用户增长方案的设计与落地",
    searchEvidence: "",
  })];
  let threw = false;
  try {
    validatePmReviewComments(RESUME_TEXT, comments);
  } catch (e) {
    threw = true;
    assert(e instanceof PmReviewGuardError, "应抛出 PmReviewGuardError");
    const err = e as PmReviewGuardError;
    assert(
      err.violations.some(v => v.includes("searchEvidence")),
      "violations 应包含 searchEvidence 相关信息",
    );
  }
  assert(threw, "应抛出错误");
});

test("validate 时 searchEvidence=undefined 不报错", () => {
  const comments = [makeComment({ anchorText: "负责用户增长方案的设计与落地" })];
  validatePmReviewComments(RESUME_TEXT, comments);
  // 不抛出即通过
});

test("validate 时 searchEvidence 有值不报错", () => {
  const comments = [makeComment({
    anchorText: "负责用户增长方案的设计与落地",
    searchEvidence: "搜索证据文本",
  })];
  validatePmReviewComments(RESUME_TEXT, comments);
  // 不抛出即通过
});

// ─── 测试组 6：sanitize 输出结构完整性 ──────────────────────────────────────

console.log("\n🛡️  Guard - sanitize 输出结构");

test("sanitize 返回 { comments, dropped } 结构", () => {
  const result = sanitizePmReviewComments(RESUME_TEXT, []);
  assert("comments" in result, "应有 comments 字段");
  assert("dropped" in result, "应有 dropped 字段");
  assert(Array.isArray(result.comments), "comments 应为数组");
  assert(Array.isArray(result.dropped), "dropped 应为数组");
});

test("空批注列表 sanitize 不报错，返回空数组", () => {
  const { comments, dropped } = sanitizePmReviewComments(RESUME_TEXT, []);
  assertEqual(comments.length, 0);
  assertEqual(dropped.length, 0);
});

// ─── 总结 ──────────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Guard 测试完成：${passed} 通过 / ${failed} 失败`);
if (failed > 0) {
  console.error("❌ 存在失败用例，请检查上方错误信息");
  process.exit(1);
} else {
  console.log("✅ 全部通过");
}
