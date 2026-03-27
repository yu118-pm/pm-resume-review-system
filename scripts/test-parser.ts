/**
 * Parser 单元测试脚本
 * 运行方式：npx tsx scripts/test-parser.ts
 */

import {
  parsePmReviewResponse,
  parsePmReviewCommentsInput,
  parseStructureAnalysis,
  PmReviewParseError,
} from "../src/lib/pm-review-parser";

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

const MINIMAL_COMMENT = {
  sectionTitleOriginal: "项目经历",
  location: "项目经历第1条",
  anchorText: "负责用户增长方案的设计",
  issueType: "描述笼统",
  actionType: "rewrite",
  comment: "缺少具体方法和数据",
  suggestion: "请补充具体措施和结果",
  confidence: "medium",
  needsConfirmation: false,
};

// ─── 测试组 1：parsePmReviewResponse 基础解析 ─────────────────────────────────

console.log("\n📦 Parser - 基础解析");

test("解析裸数组格式 [...]", () => {
  const raw = JSON.stringify([MINIMAL_COMMENT]);
  const result = parsePmReviewResponse(raw);
  assert(result.length === 1, "应解析到 1 条批注");
  assertEqual(result[0].actionType, "rewrite");
});

test("解析对象包装格式 {comments:[...]}", () => {
  const raw = JSON.stringify({ comments: [MINIMAL_COMMENT] });
  const result = parsePmReviewResponse(raw);
  assert(result.length === 1, "应解析到 1 条批注");
});

test("解析带 markdown code fence 的输出", () => {
  const raw = "```json\n" + JSON.stringify([MINIMAL_COMMENT]) + "\n```";
  const result = parsePmReviewResponse(raw);
  assert(result.length === 1, "应去除 code fence 后正常解析");
});

test("空数组不报错", () => {
  const result = parsePmReviewResponse("[]");
  assert(result.length === 0, "空数组应返回空结果");
});

test("非法 JSON 抛出 PmReviewParseError", () => {
  let threw = false;
  try {
    parsePmReviewResponse("not json");
  } catch (e) {
    threw = true;
    assert(e instanceof PmReviewParseError, "应抛出 PmReviewParseError");
  }
  assert(threw, "应抛出错误");
});

// ─── 测试组 2：向后兼容（旧格式无新字段）──────────────────────────────────────

console.log("\n📦 Parser - 向后兼容（无新字段）");

test("旧格式批注（无 searchEvidence/previousRoundStatus）正常解析", () => {
  const result = parsePmReviewCommentsInput([MINIMAL_COMMENT]);
  assert(result.length === 1, "应解析成功");
  assertEqual(result[0].searchEvidence, undefined, "searchEvidence 应为 undefined");
  assertEqual(result[0].previousRoundStatus, undefined, "previousRoundStatus 应为 undefined");
});

test("旧格式 normalizedModule（技能 → 自我评价 别名映射）", () => {
  const comment = { ...MINIMAL_COMMENT, normalizedModule: "技能" };
  const result = parsePmReviewCommentsInput([comment]);
  assert(result.length === 1, "应解析成功");
  assertEqual(result[0].normalizedModule, "自我评价", "技能 应别名映射为 自我评价");
});

test("旧格式 normalizedModule（教育背景 → 教育经历）", () => {
  const comment = { ...MINIMAL_COMMENT, normalizedModule: "教育背景" };
  const result = parsePmReviewCommentsInput([comment]);
  assertEqual(result[0].normalizedModule, "教育经历", "教育背景 应映射为 教育经历");
});

test("旧格式 normalizedModule（个人信息 → 基础信息）", () => {
  const comment = { ...MINIMAL_COMMENT, normalizedModule: "个人信息" };
  const result = parsePmReviewCommentsInput([comment]);
  assertEqual(result[0].normalizedModule, "基础信息", "个人信息 应映射为 基础信息");
});

// ─── 测试组 3：新字段透传 ─────────────────────────────────────────────────────

console.log("\n📦 Parser - 新字段透传");

test("searchEvidence 字段正常透传", () => {
  const comment = { ...MINIMAL_COMMENT, searchEvidence: "根据搜索，DAU 通常在 10 万以下" };
  const result = parsePmReviewCommentsInput([comment]);
  assertEqual(result[0].searchEvidence, "根据搜索，DAU 通常在 10 万以下");
});

test("previousRoundStatus 合法值透传", () => {
  for (const status of ["new", "modified", "unchanged", "resolved"] as const) {
    const comment = { ...MINIMAL_COMMENT, previousRoundStatus: status };
    const result = parsePmReviewCommentsInput([comment]);
    assertEqual(result[0].previousRoundStatus, status, `${status} 应透传`);
  }
});

test("previousRoundStatus 非法值被丢弃（不报错）", () => {
  const comment = { ...MINIMAL_COMMENT, previousRoundStatus: "invalid_status" };
  const result = parsePmReviewCommentsInput([comment]);
  assertEqual(result[0].previousRoundStatus, undefined, "非法 previousRoundStatus 应被忽略");
});

// ─── 测试组 4：actionType 推断（inferActionType） ────────────────────────────

console.log("\n📦 Parser - actionType 推断");

test("suggestion 含「缺少模块」→ 推断为 add", () => {
  const comment = {
    ...MINIMAL_COMMENT,
    actionType: undefined,
    suggestion: "缺少模块，建议补充技能部分",
  };
  const result = parsePmReviewCommentsInput([comment]);
  assertEqual(result[0].actionType, "add", "含「缺少模块」应推断为 add");
});

test("suggestion 含「缺失」→ 推断为 add", () => {
  const comment = {
    ...MINIMAL_COMMENT,
    actionType: undefined,
    suggestion: "该区块缺失，建议新增",
  };
  const result = parsePmReviewCommentsInput([comment]);
  assertEqual(result[0].actionType, "add", "含「缺失」应推断为 add");
});

test("合法 actionType 直接使用（不被覆盖）", () => {
  const comment = { ...MINIMAL_COMMENT, actionType: "delete" };
  const result = parsePmReviewCommentsInput([comment]);
  assertEqual(result[0].actionType, "delete");
});

test("新增 actionType=add 直接透传", () => {
  const comment = { ...MINIMAL_COMMENT, actionType: "add" };
  const result = parsePmReviewCommentsInput([comment]);
  assertEqual(result[0].actionType, "add");
});

// ─── 测试组 5：parseStructureAnalysis ────────────────────────────────────────

console.log("\n📦 Parser - parseStructureAnalysis");

const VALID_STRUCTURE = {
  modules: [
    {
      sectionTitle: "项目经历",
      normalizedModule: "项目经历",
      textContent: "负责用户增长...",
      needsDeepReview: true,
      mayNeedSearch: true,
    },
    {
      sectionTitle: "工作经历",
      normalizedModule: "工作经历",
      needsDeepReview: false,
      mayNeedSearch: false,
    },
  ],
  missingModules: ["基础信息"],
  redundantModules: [],
};

test("合法结构识别 JSON 正常解析", () => {
  const result = parseStructureAnalysis(JSON.stringify(VALID_STRUCTURE));
  assert(result.modules.length === 2, "应有 2 个模块");
  assertEqual(result.modules[0].sectionTitle, "项目经历");
  assert(result.missingModules.includes("基础信息"), "应包含缺失模块");
});

test("modules 字段缺失时抛出 PmReviewParseError", () => {
  let threw = false;
  try {
    parseStructureAnalysis(JSON.stringify({ missingModules: [] }));
  } catch (e) {
    threw = true;
    assert(e instanceof PmReviewParseError, "应抛出 PmReviewParseError");
  }
  assert(threw, "应抛出错误");
});

test("modules 为空数组时抛出 PmReviewParseError（min(1) 校验）", () => {
  let threw = false;
  try {
    parseStructureAnalysis(JSON.stringify({ modules: [] }));
  } catch (e) {
    threw = true;
    assert(e instanceof PmReviewParseError, "应抛出 PmReviewParseError");
  }
  assert(threw, "空 modules 应报错");
});

test("missingModules/redundantModules 缺失时使用默认值 []", () => {
  const input = { modules: [{ sectionTitle: "项目经历", normalizedModule: "项目经历" }] };
  const result = parseStructureAnalysis(JSON.stringify(input));
  assert(Array.isArray(result.missingModules), "missingModules 应有默认值");
  assertEqual(result.missingModules.length, 0);
});

test("输入为裸数组时自动包装为 {modules:[...]}", () => {
  const raw = JSON.stringify([{ sectionTitle: "项目经历", normalizedModule: "项目经历" }]);
  const result = parseStructureAnalysis(raw);
  assert(result.modules.length === 1, "应自动包装为 modules");
});

// ─── 总结 ──────────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Parser 测试完成：${passed} 通过 / ${failed} 失败`);
if (failed > 0) {
  console.error("❌ 存在失败用例，请检查上方错误信息");
  process.exit(1);
} else {
  console.log("✅ 全部通过");
}
