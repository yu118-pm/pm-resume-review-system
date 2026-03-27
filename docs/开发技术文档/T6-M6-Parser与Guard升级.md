# T6 - M6：Parser 与 Guard 升级

> 对应模块：M6  
> 改动文件：`src/lib/pm-review-parser.ts`、`src/lib/pm-review-guard.ts`  
> 依赖：M1（新类型定义）  
> 被依赖：M5（Agent 引擎调用解析和校验）

---

## 一、Parser 升级（pm-review-parser.ts）

### 1.1 MODULE_ALIASES 映射表更新

```typescript
// 旧映射（需修改的部分）
"基础信息": "整体结构",   // 旧：映射到整体结构
"技能": "技能",           // 旧模块
"教育背景": "教育背景",   // 旧模块名
"教育经历": "教育背景",   // 旧：映射到教育背景

// 新映射
"基础信息": "基础信息",          // 新：独立模块
"个人信息": "基础信息",          // 别名
"联系方式": "基础信息",          // 别名
"教育经历": "教育经历",          // 新模块名
"教育背景": "教育经历",          // 旧名→新名
"教育": "教育经历",              // 别名
"技能": "自我评价",              // 技能合并到自我评价
"技能模块": "自我评价",          // 同上
"专业能力": "自我评价",          // 同上
"工具技能": "自我评价",          // 同上
```

完整映射表需覆盖所有可能的 LLM 输出变体。

### 1.2 Zod Schema 升级

```typescript
// 新增 actionType 枚举值
const actionTypeSchema = z.enum([
  "rewrite", "delete", "merge", "reorder",
  "format", "verify", "condense", "add",  // 🆕 add
]);

// 新增可选字段
const pmReviewCommentSchema = z.object({
  sectionTitleOriginal: z.string(),
  normalizedModule: z.string().optional(),
  location: z.string(),
  anchorText: z.string(),
  issueType: z.string(),
  actionType: actionTypeSchema,
  comment: z.string(),
  suggestion: z.string(),
  example: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]),
  needsConfirmation: z.boolean(),
  searchEvidence: z.string().optional(),             // 🆕
  previousRoundStatus: z.enum([                      // 🆕
    "new", "modified", "unchanged", "resolved",
  ]).optional(),
});
```

### 1.3 新增：结构识别输出解析

```typescript
export function parseStructureAnalysis(raw: string): StructureAnalysis;
```

Zod schema:
```typescript
const moduleInfoSchema = z.object({
  sectionTitle: z.string(),
  normalizedModule: z.string(),
  textContent: z.string().optional(),      // LLM 可能不返回，需后处理填充
  needsDeepReview: z.boolean().default(false),
  mayNeedSearch: z.boolean().default(false),
});

const structureAnalysisSchema = z.object({
  modules: z.array(moduleInfoSchema).min(1),
  missingModules: z.array(z.string()).default([]),
  redundantModules: z.array(z.string()).default([]),
});
```

**注意**：LLM 结构识别可能返回 `startLine/endLine` 而非 `textContent`。需要在 Agent 层根据行号从原文提取文本，填充到 `textContent`。也可在此 parser 中做后处理。

### 1.4 移除批注数量上限

旧代码中如果有 `length > PM_REVIEW_MAX_COMMENTS` 的截断逻辑，需移除。

### 1.5 parsePmReviewResponse 兼容性

函数签名不变，内部 schema 升级：
- 新增字段为 optional，旧格式数据也能解析
- normalizedModule 归类使用更新后的 MODULE_ALIASES

---

## 二、Guard 升级（pm-review-guard.ts）

### 2.1 移除数量上限检查

删除任何 `comments.length > PM_REVIEW_MAX_COMMENTS` 的校验逻辑。

### 2.2 新增 "add" actionType 处理

`actionType === "add"` 时，anchorText 允许为占位文本（如 `（简历缺少自我评价模块）`）：

```typescript
// anchorText 回溯验证时，对 add 类型放宽
if (comment.actionType === "add") {
  // 不要求 anchorText 在原文中精确匹配
  // 只检查 comment 和 suggestion 不为空
  continue;
}
```

### 2.3 anchorText 模糊匹配

现有精确匹配升级为模糊匹配（容差 ≤ 3 字符）：

```typescript
function fuzzyMatch(text: string, anchor: string, tolerance: number = 3): boolean {
  const normalizedText = normalizeText(text);
  const normalizedAnchor = normalizeText(anchor);
  
  // 精确匹配
  if (normalizedText.includes(normalizedAnchor)) return true;
  
  // 模糊匹配：anchor 去掉首尾各 tolerance 个字符后检查
  if (normalizedAnchor.length > tolerance * 2) {
    const core = normalizedAnchor.slice(tolerance, -tolerance);
    if (normalizedText.includes(core)) return true;
  }
  
  return false;
}
```

### 2.4 新增 searchEvidence 校验

```typescript
// searchEvidence 不为空时，检查不包含原文中没有的新数字
if (comment.searchEvidence) {
  // searchEvidence 中的数字允许存在（来自搜索结果，不是编造的）
  // 但 searchEvidence 不能为空字符串
  if (comment.searchEvidence.trim() === "") {
    violations.push(`searchEvidence 不能为空字符串`);
  }
}
```

### 2.5 新增 previousRoundStatus 逻辑校验

```typescript
if (comment.previousRoundStatus === "resolved") {
  // resolved 的问题不应该还存在于批注列表中
  // 除非是提醒类（如"上次问题已解决，本条可移除"）
  violations.push(`标记为 resolved 的批注不应出现在最终结果中`);
}
```

### 2.6 sanitizePmReviewComments 更新

清洗逻辑新增：
- `searchEvidence` 为空字符串时清除为 `undefined`
- `previousRoundStatus` 为 `"resolved"` 的批注移除
- 保留 `actionType === "add"` 的批注（不因 anchorText 不匹配被误删）

---

## 三、注意事项

1. **不删除现有校验逻辑**：只新增，不破坏已有的 AI PM 证据检查、数据新数字检查等
2. **MODULE_ALIASES 要覆盖全**：LLM 输出的模块名变体很多，映射表要尽量完整
3. **parseStructureAnalysis 是新函数**：与现有 parsePmReviewResponse 并列，不合并
4. **zod schema 更新后需与 types.ts 保持同步**：字段名、类型、可选性必须一致
5. **Guard 的 fuzzyMatch 不能太宽松**：容差 3 字符已经够了，过宽会导致误匹配

---

## 四、验证方式

```bash
# 1. typecheck 通过
npm run typecheck

# 2. 用旧格式批注测试 parser → 应正常解析（向后兼容）
# 3. 用新格式批注（含 searchEvidence, previousRoundStatus）测试 parser → 应正常解析
# 4. 测试 Guard：actionType="add" 的批注不被误删
# 5. 测试 Guard：previousRoundStatus="resolved" 的批注被移除
# 6. 测试 fuzzyMatch：anchor 有少量字符差异时仍能匹配
```
