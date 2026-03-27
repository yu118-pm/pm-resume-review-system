# T2 - M2：分模块 Prompt 体系

> 对应模块：M2  
> 改动文件：`src/lib/pm-review-prompts.ts`（重写）  
> 依赖：M1  
> 被依赖：M5（Agent 引擎调用各模块 Prompt）

---

## 一、改动概览

将现有的单一 System Prompt **重写**为分模块 Prompt 体系。

| 旧 | 新 |
|----|-----|
| `PM_REVIEW_SYSTEM_PROMPT`（单一大 Prompt） | `PM_REVIEW_BASE_SYSTEM_PROMPT` + 10 个模块专属 Prompt |
| `PM_REVIEW_MAX_COMMENTS = 8` | **移除**，不限批注数量 |
| `buildPmReviewUserPrompt()` | 拆为多个构建函数 |
| `buildPmReviewParseRetryPrompt()` | 保留，更新内容 |

---

## 二、导出清单

```typescript
// ─── 常量 ───
export const PM_REVIEW_BASE_SYSTEM_PROMPT: string;          // 通用角色/边界/原则
export const STRUCTURE_ANALYSIS_SYSTEM_PROMPT: string;       // 结构识别
export const BASIC_INFO_REVIEW_SYSTEM_PROMPT: string;        // 基础信息批阅
export const SELF_EVALUATION_REVIEW_SYSTEM_PROMPT: string;   // 自我评价批阅
export const EDUCATION_REVIEW_SYSTEM_PROMPT: string;         // 教育经历批阅
export const WORK_EXPERIENCE_REVIEW_SYSTEM_PROMPT: string;   // 工作经历批阅
export const PROJECT_EXPERIENCE_REVIEW_SYSTEM_PROMPT: string;// 项目经历批阅（★）
export const FORMAT_REVIEW_SYSTEM_PROMPT: string;            // 格式规范批阅
export const DATA_VALIDATION_SYSTEM_PROMPT: string;          // 数据验证（结合搜索）
export const CONSISTENCY_CHECK_SYSTEM_PROMPT: string;        // 多轮一致性检查

// ─── 构建函数 ───
export function buildStructureAnalysisUserPrompt(resumeText: string): string;
export function buildModuleReviewUserPrompt(moduleText: string, fullResumeText: string): string;
export function buildDataValidationUserPrompt(commentsJson: string, searchResultsJson: string): string;
export function buildConsistencyCheckUserPrompt(previousJson: string, currentJson: string): string;

// ─── 重试 Prompt ───
export function buildParseRetryPrompt(errorMessage: string): string;
export function buildGuardRetryPrompt(violations: string[]): string;

// ─── 辅助 ───
export function getModuleSystemPrompt(normalizedModule: string): string;
```

---

## 三、Prompt 内容来源

**所有 Prompt 文本从 `AI处理与Prompt设计.md` 第六节逐字搬运，不自由发挥。**

| Prompt 常量 | 来源章节 |
|------------|---------|
| `PM_REVIEW_BASE_SYSTEM_PROMPT` | 6.0 通用 System Prompt |
| `STRUCTURE_ANALYSIS_SYSTEM_PROMPT` | 6.1 结构识别 Prompt |
| `BASIC_INFO_REVIEW_SYSTEM_PROMPT` | 6.2 基础信息批阅 Prompt |
| `SELF_EVALUATION_REVIEW_SYSTEM_PROMPT` | 6.3 自我评价批阅 Prompt |
| `EDUCATION_REVIEW_SYSTEM_PROMPT` | 6.4 教育经历批阅 Prompt |
| `WORK_EXPERIENCE_REVIEW_SYSTEM_PROMPT` | 6.5 工作经历批阅 Prompt |
| `PROJECT_EXPERIENCE_REVIEW_SYSTEM_PROMPT` | 6.6 项目经历批阅 Prompt |
| `FORMAT_REVIEW_SYSTEM_PROMPT` | 6.7 格式规范批阅 Prompt |
| `DATA_VALIDATION_SYSTEM_PROMPT` | 6.8 数据验证 Prompt |
| `CONSISTENCY_CHECK_SYSTEM_PROMPT` | 6.9 多轮一致性检查 Prompt |

---

## 四、关键设计

### 4.1 通用 System Prompt 组合方式

各模块 System Prompt = 通用基座 + 模块专属指令：

```typescript
export const BASIC_INFO_REVIEW_SYSTEM_PROMPT = `${PM_REVIEW_BASE_SYSTEM_PROMPT}

你现在批阅的是简历的「基础信息」模块。
...（模块专属标准和检查方向）
请输出该模块的批注，JSON 数组格式。`;
```

### 4.2 getModuleSystemPrompt 路由函数

Agent 引擎通过此函数根据 `normalizedModule` 获取对应 Prompt：

```typescript
export function getModuleSystemPrompt(normalizedModule: string): string {
  const map: Record<string, string> = {
    "基础信息": BASIC_INFO_REVIEW_SYSTEM_PROMPT,
    "自我评价": SELF_EVALUATION_REVIEW_SYSTEM_PROMPT,
    "教育经历": EDUCATION_REVIEW_SYSTEM_PROMPT,
    "工作经历": WORK_EXPERIENCE_REVIEW_SYSTEM_PROMPT,
    "项目经历": PROJECT_EXPERIENCE_REVIEW_SYSTEM_PROMPT,
    "格式": FORMAT_REVIEW_SYSTEM_PROMPT,
  };
  return map[normalizedModule] ?? PM_REVIEW_BASE_SYSTEM_PROMPT;
}
```

### 4.3 User Prompt 模板

```typescript
export function buildModuleReviewUserPrompt(
  moduleText: string,
  fullResumeText: string,
): string {
  return `## 简历内容（当前模块）

${moduleText}

## 简历全文（供参考上下文）

${fullResumeText}

## 批阅任务

请按照你的模块批阅标准，批阅以上内容。
1. 只标注真正需要修改或确认的内容
2. 不限批注数量，覆盖所有值得指出的问题
3. 如果某条内容更适合"删除、合并、压缩、确认真实性、格式调整、添加"，请直接按对应动作输出
4. 如果没有足够依据，不要强行给 example
5. 若简历中没有明确 AI 相关证据，不要硬套 AI PM 视角

请直接输出 JSON 数组，不要输出任何额外说明。`;
}
```

---

## 五、与旧代码的兼容处理

| 旧导出 | 处理方式 |
|--------|---------|
| `PM_REVIEW_MAX_COMMENTS` | 移除（不再使用） |
| `PM_REVIEW_SYSTEM_PROMPT` | 替换为 `PM_REVIEW_BASE_SYSTEM_PROMPT` |
| `buildPmReviewUserPrompt()` | 移除（由多个构建函数替代） |
| `buildPmReviewParseRetryPrompt()` | 重命名为 `buildParseRetryPrompt()`，移除条数限制 |

**注意**：旧 API route `review-pm-resume/route.ts` 引用了旧导出名，将在 M7 中一并重写。

---

## 六、注意事项

1. **不自由发挥 Prompt 内容**：严格从设计文档搬运
2. **移除所有 `PM_REVIEW_MAX_COMMENTS` 引用**：包括 Prompt 文本中的"最多 X 条"限制
3. **结构识别 Prompt 输出是 JSON 对象（不是数组）**：与批阅模块输出格式不同
4. **项目经历 Prompt 最长**：包含数据审计规则，注意 token 预算
5. **模板变量用 `${}`**：数据验证和一致性检查 Prompt 需要动态拼接 JSON 内容
