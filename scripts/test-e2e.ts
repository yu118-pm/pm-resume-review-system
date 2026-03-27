/**
 * E2E API 链路测试脚本
 * 运行方式：npx tsx scripts/test-e2e.ts
 * 前提：dev server 已在 localhost:3000 运行
 */

const BASE = "http://localhost:3000";

let passed = 0;
let failed = 0;

function ok(name: string, detail = "") {
  console.log(`  ✅ ${name}${detail ? "  →  " + detail : ""}`);
  passed++;
}
function fail(name: string, reason: string) {
  console.error(`  ❌ ${name}  →  ${reason}`);
  failed++;
}
function assert(cond: boolean, name: string, detail = "") {
  cond ? ok(name, detail) : fail(name, "断言失败");
}

// ─── 测试数据 ──────────────────────────────────────────────────────────────────

const RESUME_V1 = `张三

基础信息
邮箱：zhangsan@example.com | 电话：138xxxx8888

项目经历
2023年 用户增长项目
- 负责用户增长方案的设计和推进
- 通过A/B测试将注册转化率提升了很多
- 带领团队做了一些优化

工作经历
2024年至今 某互联网公司 产品经理
- 负责某产品的迭代规划

自我评价
本人积极向上，认真负责，善于沟通。`;

const RESUME_V2 = `张三

基础信息
邮箱：zhangsan@example.com | 电话：138xxxx8888

教育经历
2020-2024 北京大学 计算机科学 本科

项目经历
2023年 北大校园App冷启动注册转化率提升
- 负责增长漏斗设计和A/B测试方案
- 通过分组测试将注册转化率从12%提升至18%（n=1.2万，p<0.05）
- 与前端和运营协作完成3轮迭代

工作经历
2024年7月至今 字节跳动 初级产品经理
- 负责飞书轻应用迭代规划，覆盖B端DAU约8万

自我评价
具备数据驱动的产品思维，擅长需求拆解与跨部门推进，有完整增长项目交付经验。`;

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  return r.json() as Promise<T>;
}

// ─── 主测试流程 ───────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🧪 E2E 链路测试（需要 dev server 在 :3000 运行）\n");

  // ── 1. 清理：确认 API 可访问 ─────────────────────────────────────────────────
  console.log("📦 Step 1: 会话管理 API");

  const { sessions: initSessions } = await get<{ sessions: unknown[] }>("/api/review-sessions");
  assert(Array.isArray(initSessions), "GET /api/review-sessions 返回数组");

  // ── 2. 创建新会话 ─────────────────────────────────────────────────────────────
  const studentName = `E2E测试_${Date.now()}`;
  const { session } = await post<{ session: { id: string; studentName: string; reviewCount: number } }>(
    "/api/review-sessions",
    { studentName },
  );
  assert(!!session?.id, "POST /api/review-sessions 返回 session.id", session?.id);
  assert(session.studentName === studentName, "studentName 正确");
  assert(session.reviewCount === 0, "初始 reviewCount=0");

  const sessionId = session.id;

  // ── 3. 确认会话出现在列表中 ───────────────────────────────────────────────────
  const { sessions: afterCreate } = await get<{ sessions: Array<{ id: string }> }>("/api/review-sessions");
  const found = afterCreate.find((s) => s.id === sessionId);
  assert(!!found, "新会话出现在列表中", sessionId);

  // ── 4. 空历史查询 ─────────────────────────────────────────────────────────────
  const { history: emptyHistory } = await get<{ history: unknown[] }>(`/api/review-sessions/${sessionId}/history`);
  assert(Array.isArray(emptyHistory) && emptyHistory.length === 0, "新建会话历史为空");

  // ── 5. 第1轮批阅 ──────────────────────────────────────────────────────────────
  console.log("\n📦 Step 2: 第1轮批阅（Agent 7步流程）");
  console.log("  ⏳ 调用 LLM，预计 30-60 秒...");

  const startTime = Date.now();
  const round1 = await post<{
    success: boolean; comments: Array<{
      normalizedModule?: string;
      previousRoundStatus?: string;
      searchEvidence?: string;
      needsConfirmation: boolean;
      confidence: string;
    }>
  }>("/api/review-pm-resume", { resumeText: RESUME_V1, sessionId });

  const elapsed1 = ((Date.now() - startTime) / 1000).toFixed(1);
  assert(round1.success === true, `POST /api/review-pm-resume 返回 success=true`, `耗时 ${elapsed1}s`);

  const c1 = round1.comments ?? [];
  assert(c1.length > 0, `第1轮批注数 > 0`, `共 ${c1.length} 条`);

  const modules1 = [...new Set(c1.map((c) => c.normalizedModule).filter(Boolean))];
  assert(modules1.length >= 2, `覆盖至少2个模块`, modules1.join("、"));

  const highConf1 = c1.filter((c) => c.confidence === "high").length;
  assert(highConf1 > 0, `存在 confidence=high 的批注`, `${highConf1} 条`);

  const needsConfirm1 = c1.filter((c) => c.needsConfirmation).length;
  assert(needsConfirm1 > 0, `存在 needsConfirmation=true 的批注`, `${needsConfirm1} 条`);

  const evidence1 = c1.filter((c) => c.searchEvidence).length;
  ok(`searchEvidence 填充条数`, `${evidence1} 条`);

  const status1 = c1.map((c) => c.previousRoundStatus).filter(Boolean);
  assert(status1.length === 0, "第1轮无 previousRoundStatus（首次批阅）");

  // ── 6. 验证第1轮历史已保存 ────────────────────────────────────────────────────
  console.log("\n📦 Step 3: 历史持久化验证");

  const { history: h1 } = await get<{ history: Array<{ round: number; comments: unknown[] }> }>(
    `/api/review-sessions/${sessionId}/history`,
  );
  assert(h1.length === 1, "第1轮结果已保存到历史", `历史条数=${h1.length}`);
  assert(h1[0].round === 1, "round=1");
  assert((h1[0].comments as unknown[]).length === c1.length, `历史批注数与响应一致`, `${c1.length}条`);

  // ── 7. 第2轮批阅（多轮状态验证）─────────────────────────────────────────────
  console.log("\n📦 Step 4: 第2轮批阅（多轮状态标注）");
  console.log("  ⏳ 调用 LLM，预计 30-60 秒...");

  const start2 = Date.now();
  const round2 = await post<{
    success: boolean; comments: Array<{
      previousRoundStatus?: string;
      normalizedModule?: string;
    }>
  }>("/api/review-pm-resume", { resumeText: RESUME_V2, sessionId });

  const elapsed2 = ((Date.now() - start2) / 1000).toFixed(1);
  assert(round2.success === true, `第2轮 success=true`, `耗时 ${elapsed2}s`);

  const c2 = round2.comments ?? [];
  assert(c2.length > 0, `第2轮批注数 > 0`, `共 ${c2.length} 条`);

  const statusMap2: Record<string, number> = {};
  for (const c of c2) {
    const s = c.previousRoundStatus ?? "none";
    statusMap2[s] = (statusMap2[s] ?? 0) + 1;
  }
  ok("第2轮 previousRoundStatus 分布", JSON.stringify(statusMap2));

  const hasMultiRoundStatus = c2.some((c) => c.previousRoundStatus);
  assert(hasMultiRoundStatus, "第2轮存在多轮状态标注（modified/unchanged/resolved）");

  // ── 8. 验证第2轮历史写入 ──────────────────────────────────────────────────────
  const { history: h2 } = await get<{ history: Array<{ round: number }> }>(
    `/api/review-sessions/${sessionId}/history`,
  );
  assert(h2.length === 2, "历史共2轮", `当前=${h2.length}`);
  assert(h2[1].round === 2, "第2轮 round=2");

  // ── 9. Guard：确认 resolved 批注不在结果中 ───────────────────────────────────
  console.log("\n📦 Step 5: Guard 校验");
  const resolved2 = c2.filter((c) => c.previousRoundStatus === "resolved");
  assert(resolved2.length === 0, "Guard 已过滤所有 resolved 批注");

  // ─── 总结 ──────────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(52)}`);
  console.log(`E2E 测试完成：${passed} 通过 / ${failed} 失败`);
  if (failed > 0) {
    console.error("❌ 存在失败用例");
    process.exit(1);
  } else {
    console.log("✅ 全部通过");
  }
} // end main

void main().catch((e) => {
  console.error("❌ 测试脚本崩溃:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
