# T5 - M5：Agent 编排引擎

> 对应模块：M5（★核心）  
> 新建文件：`src/lib/pm-review-agent.ts`  
> 依赖：M1, M2, M3, M4, M6  
> 被依赖：M7（API 层调用）

---

## 一、职责

作为整个批阅流程的调度中心，按 7 步顺序编排 LLM 调用、工具调用和数据处理。

---

## 二、主函数签名

```typescript
import type { PmReviewComment } from "@/lib/types";

export interface ReviewProgress {
  step: number;       // 1-7
  stepName: string;   // 步骤名称
  detail: string;     // 详细信息（如当前模块名）
}

export async function reviewResume(
  resumeText: string,
  sessionId?: string,
  onProgress?: (progress: ReviewProgress) => void,
): Promise<PmReviewComment[]>;
```

---

## 三、7 步流程详细设计

### Step 1：读取会话历史

```typescript
// 输入：sessionId（可选）
// 输出：previousReview: ReviewHistoryEntry | null

if (sessionId) {
  previousReview = await getLatestReview(sessionId);
} else {
  previousReview = null;
}
```

- 无 sessionId → 跳过，视为首次批阅
- getLatestReview 失败 → 打日志，视为首次批阅（不阻塞）

### Step 2：结构识别

```typescript
// 输入：resumeText
// 输出：StructureAnalysis { modules[], missingModules[], redundantModules[] }
// LLM 调用：STRUCTURE_ANALYSIS_SYSTEM_PROMPT + buildStructureAnalysisUserPrompt(resumeText)
// 解析：parseStructureAnalysis(response)

const llmResult = await callLLMWithMeta(
  STRUCTURE_ANALYSIS_SYSTEM_PROMPT,
  buildStructureAnalysisUserPrompt(resumeText),
  { maxTokens: 2048, responseFormat: "json_object", temperature: 0.3 },
);
const structure = parseStructureAnalysis(llmResult.content);
```

**失败处理**：结构识别是基础步骤，**失败则整体报错**。允许重试 1 次。

**输出验证**：
- `modules` 不能为空
- 每个 module 必须有 `sectionTitle` 和 `textContent`

### Step 3：分模块批阅

```typescript
// 输入：structure.modules, resumeText
// 输出：allComments: PmReviewComment[]
// LLM 调用：N 次，每个模块独立调用

const allComments: PmReviewComment[] = [];

for (const module of structure.modules) {
  onProgress?.({ step: 3, stepName: "分模块批阅", detail: module.normalizedModule });
  
  try {
    const systemPrompt = getModuleSystemPrompt(module.normalizedModule);
    const userPrompt = buildModuleReviewUserPrompt(module.textContent, resumeText);
    
    const result = await callLLMWithMeta(systemPrompt, userPrompt, {
      maxTokens: module.normalizedModule === "项目经历" ? 4096 : 3072,
      responseFormat: "json_object",
      temperature: 0.3,
    });
    
    const comments = parsePmReviewResponse(result.content);
    allComments.push(...comments);
  } catch (error) {
    console.error(`[pm-review-agent] 模块 ${module.normalizedModule} 批阅失败`, error);
    // 重试 1 次
    // 仍失败 → 跳过该模块，继续
  }
}

// 补充缺少模块的批注
for (const missing of structure.missingModules) {
  allComments.push(buildMissingModuleComment(missing));
}
```

**关键决策**：
- **串行调用**，不并行（避免 API 速率限制 + 便于调试）
- 项目经历 maxTokens 给 4096（最重要最长），其他 3072
- 单模块失败不阻塞整体

**buildMissingModuleComment 辅助函数**：
```typescript
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
```

### Step 4：数据验证

```typescript
// 输入：allComments 中 needsConfirmation=true 且为数据类问题的批注
// 输出：更新这些批注的 searchEvidence 和 confidence
// Agent 自主决策是否搜索

const dataComments = allComments.filter(
  c => c.needsConfirmation && isDataIssue(c)
);

if (dataComments.length > 0) {
  const cache = createSearchCache();
  
  // 从简历中提取公司名，搜索公司信息
  const companyNames = extractCompanyNames(resumeText);
  const companyResults: Record<string, CompanySearchResult | null> = {};
  for (const name of companyNames) {
    companyResults[name] = await cache.searchCompany(name);
  }
  
  // 搜索行业基准（从批注中提取关键指标）
  const metrics = extractMetricsFromComments(dataComments);
  const industryResults: Record<string, IndustrySearchResult | null> = {};
  for (const { keyword, metric } of metrics) {
    industryResults[`${keyword}:${metric}`] = await cache.searchIndustry(keyword, metric);
  }
  
  // 有搜索结果时，调用数据验证 Prompt 更新批注
  if (Object.values(companyResults).some(r => r) || Object.values(industryResults).some(r => r)) {
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
}
```

**辅助函数**：
- `isDataIssue(comment)` — 检查 issueType/comment 中是否包含数据相关关键词
- `extractCompanyNames(text)` — 从简历文本中提取公司名（简单正则/启发式）
- `extractMetricsFromComments(comments)` — 从批注中提取行业指标关键词
- `mergeUpdatedComments(all, updated)` — 按 anchorText 匹配，更新 searchEvidence 和 confidence

**失败处理**：搜索或 LLM 失败 → 保留原始批注不变，不阻塞

### Step 5：历史对比

```typescript
// 输入：allComments + previousReview（Step 1 获取）
// 输出：每条批注标记 previousRoundStatus

if (previousReview) {
  try {
    const result = await callLLMWithMeta(
      CONSISTENCY_CHECK_SYSTEM_PROMPT,
      buildConsistencyCheckUserPrompt(
        JSON.stringify(previousReview.comments),
        JSON.stringify(allComments),
      ),
      { maxTokens: 4096, responseFormat: "json_object", temperature: 0.3 },
    );
    
    const updatedComments = parsePmReviewResponse(result.content);
    allComments.splice(0, allComments.length, ...updatedComments);
  } catch (error) {
    console.warn("[pm-review-agent] 历史对比失败，跳过", error);
    // 不阻塞，previousRoundStatus 保持为空
  }
}
```

### Step 6：Guard 校验

```typescript
// 输入：allComments, resumeText
// 输出：finalComments（去除违规批注）

const { comments: finalComments, dropped } = sanitizePmReviewComments(
  resumeText,
  allComments,
);
logSanitization(dropped);
validatePmReviewComments(resumeText, finalComments);
```

- 复用现有 guard 函数（M6 升级后）
- Guard 失败的批注直接移除（不重试整体，因为已经是汇总阶段）

### Step 7：保存结果

```typescript
if (sessionId) {
  await saveReviewResult(sessionId, resumeText, finalComments);
}

return finalComments;
```

---

## 四、日志规范

每个 Step 开始和结束时记录日志：

```typescript
console.log("[pm-review-agent] Step 1: 读取会话历史", { sessionId, hasPrevious: !!previousReview });
console.log("[pm-review-agent] Step 2: 结构识别完成", { moduleCount: structure.modules.length, missing: structure.missingModules });
console.log("[pm-review-agent] Step 3: 模块批阅中", { module: module.normalizedModule });
console.log("[pm-review-agent] Step 3: 模块批阅完成", { totalComments: allComments.length });
console.log("[pm-review-agent] Step 4: 数据验证", { dataCommentsCount: dataComments.length, searched: true/false });
console.log("[pm-review-agent] Step 5: 历史对比", { hasPrevious: true, statusCounts: {...} });
console.log("[pm-review-agent] Step 6: Guard 校验", { before: allComments.length, after: finalComments.length, dropped: dropped.length });
console.log("[pm-review-agent] Step 7: 保存完成", { sessionId, commentCount: finalComments.length });
```

---

## 五、错误处理汇总

| Step | 失败场景 | 处理 |
|------|---------|------|
| 1 | getLatestReview 失败 | 视为首次批阅 |
| 2 | 结构识别 LLM 失败 | 重试 1 次，仍失败整体报错 |
| 2 | 结构识别解析失败 | 重试 1 次，仍失败整体报错 |
| 3 | 单模块 LLM 失败 | 重试 1 次，仍失败跳过该模块 |
| 3 | 单模块解析失败 | 重试 1 次，仍失败跳过该模块 |
| 4 | 搜索工具失败 | 返回 null，跳过搜索 |
| 4 | 数据验证 LLM 失败 | 保留原始批注 |
| 5 | 历史对比 LLM 失败 | 跳过，不标记状态 |
| 6 | Guard 移除批注 | 正常，记录日志 |
| 7 | 保存失败 | 打日志，不影响返回结果 |

---

## 六、性能预估

| Step | LLM 调用次数 | 预计耗时 |
|------|-------------|---------|
| Step 2 结构识别 | 1 | 3-5s |
| Step 3 分模块批阅 | 5-7（视模块数） | 15-35s |
| Step 4 数据验证 | 0-1 | 0-5s |
| Step 5 历史对比 | 0-1 | 0-5s |
| **合计** | **6-10** | **约 20-50s** |

前端应展示 loading 状态，提示"正在批阅，请稍候"。

---

## 七、注意事项

1. **串行执行**：所有 LLM 调用串行，避免并发问题和速率限制
2. **每步独立 try-catch**：单步失败有明确降级策略
3. **不在 Agent 层做 Prompt 拼接**：Prompt 构建全部委托给 M2 的函数
4. **不在 Agent 层做 JSON 解析**：解析全部委托给 M6 的 parser
5. **onProgress 为可选**：首版可不实现前端进度，仅打日志
6. **extractCompanyNames / extractMetricsFromComments 是启发式函数**：不需要100%准确，宁可多搜不漏搜
