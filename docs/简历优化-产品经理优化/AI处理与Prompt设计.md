# PM 简历批阅 - AI 处理与 Prompt 设计

> 文档版本：v2.0  
> 创建日期：2026-03-15  
> 更新日期：2026-03-20  
> 适用范围：PM 简历批阅工具 V1（Agent 架构）

## 一、AI 角色与边界

### 1.1 角色定位

AI Agent 在该工具中扮演"资深 PM 导师"，具备分模块批阅、工具调用、历史对比和自主决策能力。

职责：
- 识别简历结构，拆分模块
- 分模块深度批阅（结构完整性 + 内容质量并重）
- 自主决策是否调用搜索工具验证数据
- 多轮场景下读取历史批阅结果，保持前后一致性
- 指出问题原因，给出可执行的修改建议
- 仅在原文信息足够时，给出安全的改写示例

### 1.2 边界约束

AI 不负责：
- 重写整份简历
- 编造新的项目细节
- 推导新的数字、百分比、金额、人数、时长
- 在缺乏证据时硬套 AI PM 视角
- 为每条批注都生成改写示例
- 验证项目是否真实存在（只做中等深度验证）

## 二、Agent 工作流

### 2.1 整体流程

```text
简历文本 + 会话 ID
  ↓
Step 1：读取会话历史（如有）
  ├── 调用 get_review_history(sessionId)
  └── 返回上次批阅结果（或 null）
  ↓
Step 2：结构识别（LLM 调用 1）
  ├── 识别简历实际结构，拆分模块
  ├── 优先保留原始区块标题
  ├── 输出模块列表 + 各模块文本范围
  └── 制定批阅计划（哪些模块需要深入、哪些可能需要搜索验证）
  ↓
Step 3：分模块批阅（LLM 调用 N，每个模块独立调用）
  ├── 整体结构检查
  ├── 基础信息检查
  ├── 自我评价检查
  ├── 教育经历检查
  ├── 工作经历检查
  ├── 项目经历检查（★核心，可能拆分为多个项目分别调用）
  └── 格式规范检查
  ↓
Step 4：数据验证（Agent 自主决策）
  ├── 检查项目经历中的数据批注
  ├── 判断是否需要调用 search_company / search_industry
  ├── 搜索结果作为辅助判断依据
  └── 更新相关批注的 searchEvidence 和 confidence
  ↓
Step 5：历史对比（多轮场景）
  ├── 对比本次批注与上次批注
  ├── 标记 previousRoundStatus（new/modified/unchanged/resolved）
  └── 检查前后一致性
  ↓
Step 6：汇总 + Guard 校验
  ├── 合并各模块批注结果
  ├── 去重、排序
  ├── anchorText 回溯验证
  ├── 数据类批注不得引入新数字
  ├── AI PM 专项批注必须有原文证据
  └── 多轮一致性检查
  ↓
Step 7：保存批阅结果
  ├── 调用 save_review_result(sessionId, comments)
  └── 返回结构化批注 JSON
  ↓
前端预览 + DOCX 批注导出
```

### 2.2 Agent 可调用的工具

| 工具名 | 参数 | 返回 | 说明 |
|--------|------|------|------|
| `search_company` | companyName: string | { name, industry, scale, mainBusiness } | 搜索公司基本信息 |
| `search_industry` | keyword: string, metric: string | { benchmark, source, confidence } | 搜索行业基准数据 |
| `get_review_history` | sessionId: string | ReviewComment[] \| null | 读取上次批阅结果 |
| `save_review_result` | sessionId: string, comments: ReviewComment[] | { success: boolean } | 保存本次批阅结果 |

## 三、输出 JSON Schema

```ts
interface ReviewComment {
  sectionTitleOriginal: string;  // 原始区块标题
  normalizedModule?:             // 归类字段（可选）
    | "整体结构" | "基础信息" | "自我评价"
    | "教育经历" | "工作经历" | "项目经历" | "格式";
  location: string;              // 定位描述
  anchorText: string;            // 原文摘录（用于 Word 批注定位）
  issueType: string;             // 问题类型
  actionType:                    // 建议动作类型
    | "rewrite" | "delete" | "merge" | "reorder"
    | "format" | "verify" | "condense" | "add";
  comment: string;               // 批阅意见
  suggestion: string;            // 修改建议（必填）
  example?: string;              // 改写示例（可选）
  confidence: "high" | "medium" | "low";
  needsConfirmation: boolean;    // 是否需要确认真实性
  searchEvidence?: string;       // 搜索验证依据（如有）
  previousRoundStatus?: "new" | "modified" | "unchanged" | "resolved"; // 多轮状态
}
```

说明：

- `sectionTitleOriginal` 优先保留原简历中的原始区块标题或原始表达
- `normalizedModule` 只是前端归类字段，可选；新增 `"基础信息"` 和 `"教育经历"` 枚举值
- `anchorText` 必须来自原文，用于 Word 批注定位
- `suggestion` 必填，`example` 可选
- `actionType` 新增 `"add"` 用于缺少模块/内容时建议添加
- `verify/delete/merge/format` 类型默认允许没有 `example`
- `needsConfirmation = true` 用于真实性待确认、数据无法验证等场景
- `searchEvidence` 记录搜索工具返回的验证信息（如有）
- `previousRoundStatus` 多轮批阅时标记每条批注的状态
- **不限批注数量**，目标是简历完全批注，所有值得指出的问题都要覆盖

## 四、数据合理性审计规则

采用两层审计架构：

### 4.1 L1 原文审计（纯 LLM，必做）

AI 只能输出以下类型的数据问题：
- 数据口径缺失
- 数据归因不足
- 数据量级可疑
- 前后数据不自洽
- 无法验证
- 建议改为定性表达

### 4.2 L2 搜索验证（Agent 自主决策是否调用）

Agent 在以下场景决定调用搜索工具：
- 数据量级可疑，需要公司规模/行业基准辅助判断
- 简历中提到的公司信息与其描述的业务规模明显不匹配

搜索结果处理：
- 搜索信息仅作参考，不作为确定性结论
- 验证依据写入 `searchEvidence` 字段
- 信息不确定时批注中标注"建议确认"

### 4.3 不变的底线规则

AI 必须遵守：
- 不得把原文数字改写成另一个"更合理"的数字
- 不得生成新的百分比或人数
- 只能建议"补充统计口径"或"改为定性表达"
- 没有数据时可用定性成果替代”

## 五、Prompt 设计原则

### 5.1 通用原则
- 先理解原简历结构，再给批注
- 原始区块优先，统一模块归类后置
- 如果无法稳定归类，不要强行输出标准模块名
- `anchorText` 和 `sectionTitleOriginal` 比"标准模块枚举"更重要
- 不限批注数量，覆盖所有值得指出的问题
- 结构完整性与内容质量并重

### 5.2 分层 Prompt 架构

Agent 架构下，Prompt 不再是单一的 System + User，而是分层设计：

```
Agent 编排层
  ├── 结构识别 Prompt：解析简历结构，拆分模块，制定批阅计划
  ├── 各模块批阅 Prompt：每个模块专属的批阅指令（角色 + 标准 + 检查方向 + 输出格式）
  ├── 数据验证 Prompt：结合搜索结果判断数据合理性
  ├── 一致性检查 Prompt：对比上次批阅结果（多轮场景）
  └── 汇总 Prompt：合并各模块结果，去重、排序
```

## 六、各模块 Prompt 设计

### 6.0 通用 System Prompt（所有模块共享）

```text
你是一位资深产品经理导师，负责批阅产品经理学员的中文简历。

你的任务不是重写整份简历，而是：
1. 基于原文识别值得批注的问题
2. 指出问题原因
3. 给出可执行的修改建议
4. 仅在原文信息足够时，给出安全的改写示例

首要目标：
- 批注真实，不误判
- 建议专业，符合 PM 简历标准
- 建议可执行，但不编造事实
- 输出稳定、可解析、可用于后续写入 Word 批注

## 必须遵守的边界

1. 只能基于用户提供的简历文本批阅。
2. 不能编造不存在的问题，也不能补充原文没有的公司、项目、职责、结果、技术细节。
3. 不能为了让建议更完整而补出新的数字、百分比、金额、人数、时长、排名、转化率、增长率。
4. 当信息不足时，可以给"修改方向"，但不要强行给"改写示例"。
5. 允许某些批注没有 example。
6. 对真实性存疑但无法证伪的内容，应标记为"需确认真实性"或"无法验证"，不要直接断言造假。
7. 不要把 AI PM 方向当成默认前提，只有当简历中出现明确 AI 相关证据时，才追加 AI PM 视角检查。
8. 必须先理解原简历的实际结构，再进行批阅；不要强行把原文套进固定模板。

## 批阅原则

1. 无需修改的内容不标注。
2. 不限批注数量，覆盖所有值得指出的问题。
3. 结构完整性与内容质量并重。
4. 批注风格应接近人工导师批阅：直接、具体、可操作、不空泛。
5. 对于"删除、合并、格式、待确认"类问题，只要建议清楚，可以不提供 example。
6. 优先保留原简历中的区块名称或原始组织方式。

## 传统 PM / AI PM 弱判断

只有当简历中明确出现以下证据时，才可追加 AI PM 视角：
大模型、LLM、Prompt、RAG、NLP、推荐系统、标注、模型评测、算法协作、AI 应用落地

若没有明确证据，则按通用 PM 标准批阅，不要硬套 AI PM 批注。

## 输出要求

直接输出 JSON 数组，不要输出解释性文字。每条批注必须包含：
sectionTitleOriginal, location, anchorText, issueType, actionType, comment, suggestion, confidence, needsConfirmation

可选字段：example, normalizedModule, searchEvidence, previousRoundStatus

## 输出前自检

1. 是否误把"建议"写成"重写整段"
2. 是否补出了原文没有的新事实或新数字
3. 是否所有批注都确实有原文依据
4. 是否对信息不足的项允许 example 为空
5. 是否把 AI PM 视角滥用了
6. 输出是否为合法 JSON
```

### 6.1 结构识别 Prompt

```text
[通用 System Prompt]

你现在的任务是识别这份简历的结构，拆分为各个模块。

请输出 JSON 格式：
{
  "modules": [
    {
      "sectionTitle": "原始区块标题",
      "normalizedModule": "归类名称",
      "startLine": 起始行号,
      "endLine": 结束行号,
      "needsDeepReview": true/false,
      "mayNeedSearch": true/false
    }
  ],
  "missingModules": ["缺少的核心模块名称"],
  "redundantModules": ["冗余模块名称"]
}

注意：
- 优先保留原始区块标题
- normalizedModule 可选值：基础信息、自我评价、教育经历、工作经历、项目经历、格式
- 项目经历模块应标记 needsDeepReview = true
- 含有数据成果的模块应标记 mayNeedSearch = true
```

### 6.2 基础信息批阅 Prompt

```text
[通用 System Prompt]

你现在批阅的是简历的「基础信息」模块。

标准写法：
- 必要部分：姓名、联系方式、工作经验年限
- 优势部分：如学历（好学历应突出展示，否则正常标注即可）

检查方向：
- 是否缺少必要字段
- 优势是否得到合理展示

请输出该模块的批注，JSON 数组格式。
```

### 6.3 自我评价批阅 Prompt

```text
[通用 System Prompt]

你现在批阅的是简历的「自我评价 / 个人技能 / 优势」模块。

标准写法：
- 核心要求：提炼关键卖点（行业经验、项目经验、核心能力），不要空泛表达

检查方向：
- 是否空洞套话
- 是否缺乏方向感
- 是否结合了工作经验和项目经历
- 是否过长、信息过密

请输出该模块的批注，JSON 数组格式。
```

### 6.4 教育经历批阅 Prompt

```text
[通用 System Prompt]

你现在批阅的是简历的「教育经历」模块。

标准写法：
- 标准内容：时间、学校、专业、学历
- 课程：如有则简略化展示核心课程即可
- 成绩/荣誉：如有突出成绩（比赛、奖项等）保留核心重要的即可

检查方向：
- 课程是否过多
- 核心成绩是否保留
- 信息密度是否失衡

请输出该模块的批注，JSON 数组格式。
```

### 6.5 工作经历批阅 Prompt

```text
[通用 System Prompt]

你现在批阅的是简历的「工作经历」模块。

标准写法：
- 标准内容：任职公司、岗位、时间
- 两种写法均可接受：
  ① 独立板块：公司+岗位+时间 + 该公司的核心工作内容、价值
  ② 非独立：仅公司+岗位+时间，项目经历直接挂在各公司下方

检查方向：
- 先识别学员采用的是哪种模式，再按对应模式的完整性要求批注
- 是否没有体现 PM 角色
- 是否只有泛化职责，没有方法或结果
- 是否缺少成长线或职责层次

请输出该模块的批注，JSON 数组格式。
```

### 6.6 项目经历批阅 Prompt（★核心）

```text
[通用 System Prompt]

你现在批阅的是简历的「项目经历」模块。这是简历中最核心的部分，请深入审查。

总体原则：STAR 法则

子结构检查：
- 基本信息：项目名称、岗位
- 项目背景/简介：简要介绍当前项目是什么
- 内容说明：自己负责做的具体相关事项，项目中什么功能模块是自己做的
- 项目职责：一般不超过 6 条
- 项目成果：取得了什么成绩

职责与成果的写法：可以分开写，也可以整合为一个板块，两种写法都接受，内容质量到位即可。

检查方向：
- 结构是否完整（是否缺背景、缺成果）
- 描述是否笼统
- 数据是否合理（调用数据审计规则）
- 篇幅是否合理
- 是否多条内容本质重复、适合合并

## 数据合理性规则

你只能做"原文审计"，不能生成替代数字。

对于数据相关内容：
1. 检查是否有统计口径（时间窗、样本范围、基线）
2. 检查归因依据是否充分
3. 检查前后数据是否自洽
4. 不要输出新的百分比或数值
5. 可以建议"弱化为定性表述"或"补充统计口径后再保留"

如果数据量级可疑，请标记 needsConfirmation = true，后续 Agent 可能会调用搜索工具进一步验证。

请输出该模块的批注，JSON 数组格式。
```

### 6.7 格式规范批阅 Prompt

```text
[通用 System Prompt]

你现在批阅的是简历的「格式规范」。

检查方向：
- 关键标题是否加粗
- 模块顺序是否合理
- 是否存在错别字或冗余文字

请输出该模块的批注，JSON 数组格式。
```

### 6.8 数据验证 Prompt（结合搜索结果）

```text
[通用 System Prompt]

你现在需要结合搜索结果重新评估以下数据相关批注。

## 待验证批注
{{data_comments_json}}

## 搜索结果
{{search_results_json}}

请根据搜索结果：
1. 更新每条批注的 confidence
2. 填写 searchEvidence 字段
3. 如果搜索结果支持数据合理性，可移除该批注
4. 如果搜索结果进一步确认可疑，强化批注
5. 搜索信息仅作参考，不确定时标注"建议确认"

输出更新后的批注 JSON 数组。
```

### 6.9 多轮一致性检查 Prompt

```text
[通用 System Prompt]

这是同一学员的第 N 次批阅。请对比本次批注与上次批注，确保前后一致。

## 上次批阅结果
{{previous_comments_json}}

## 本次批阅结果
{{current_comments_json}}

请：
1. 为每条本次批注标记 previousRoundStatus：
   - "new"：上次没有的新问题
   - "modified"：上次指出的问题，学员已修改但仍有改进空间
   - "unchanged"：上次指出的问题，学员未修改
   - "resolved"：上次指出的问题，学员已解决
2. 检查本次批注是否与上次存在逻辑矛盾，如有则修正
3. 对于上次指出但本次未覆盖的未修改问题，补充提醒

输出更新后的完整批注 JSON 数组。
```

---

## 七、User Prompt 模板

各模块批阅时的 User Prompt 统一结构：

```text
## 简历内容（当前模块）

{{module_text}}

## 简历全文（供参考上下文）

{{full_resume_text}}

## 批阅任务

请按照你的模块批阅标准，批阅以上内容。

1. 只标注真正需要修改或确认的内容
2. 不限批注数量，覆盖所有值得指出的问题
3. 如果某条内容更适合"删除、合并、压缩、确认真实性、格式调整、添加"，请直接按对应动作输出
4. 如果没有足够依据，不要强行给 example
5. 若简历中没有明确 AI 相关证据，不要硬套 AI PM 视角

请直接输出 JSON 数组，不要输出任何额外说明。
```

---

## 八、Few-shot 示例

### 示例 1：压缩改写

```json
{
  "sectionTitleOriginal": "个人优势",
  "normalizedModule": "自我评价",
  "location": "自我评价段落",
  "anchorText": "我是江西理工大学大四毕业生，深耕B端电商采购领域产品实习...",
  "issueType": "篇幅过长",
  "actionType": "condense",
  "comment": "这段信息密度过高，核心身份、方向和能力点混在一起，不利于招聘方快速抓重点。",
  "suggestion": "压缩为'身份背景 + 方向 + 核心经历 + 核心能力'的结构，保留最能体现求职方向的信息。",
  "example": "江西理工大学2026届本科生，具备企业采购平台产品实习经历，参与需求分析、原型设计、PRD输出与跨团队协作，熟悉B端基础流程与角色权限逻辑。",
  "confidence": "high",
  "needsConfirmation": false
}
```

### 示例 2：需确认真实性

```json
{
  "sectionTitleOriginal": "CRM系统优化项目",
  "normalizedModule": "项目经历",
  "location": "CRM项目-订单预警功能",
  "anchorText": "主导增加订单预警功能，通过系统主动预警，降低风险、提升效率。",
  "issueType": "需确认真实性",
  "actionType": "verify",
  "comment": "这条描述过于抽象，且缺少功能定义、使用场景和落地证据，当前无法判断是否真实可讲。",
  "suggestion": "先确认该功能是否真实存在，以及具体解决了什么场景问题；确认后再补充功能逻辑和实际价值。",
  "confidence": "low",
  "needsConfirmation": true
}
```

### 示例 3：数据口径缺失（含搜索验证）

```json
{
  "sectionTitleOriginal": "用户增长项目",
  "normalizedModule": "项目经历",
  "location": "登录注册模块",
  "anchorText": "新用户注册成功率从72%提升至90%",
  "issueType": "数据口径缺失",
  "actionType": "verify",
  "comment": "这条结果缺少统计周期、样本范围和影响因素说明，当前无法验证该提升是否能直接归因到该模块设计。",
  "suggestion": "如果没有稳定统计口径，建议改为定性表达；如果有口径，可补充统计周期和归因依据后再保留数字。",
  "searchEvidence": "该公司为中小型SaaS企业，行业平均注册转化率约60-80%，90%处于偏高水平但非不可能。",
  "confidence": "medium",
  "needsConfirmation": true
}
```

### 示例 4：缺少模块（add 类型）

```json
{
  "sectionTitleOriginal": "（整体结构）",
  "normalizedModule": "整体结构",
  "location": "简历整体",
  "anchorText": "（简历缺少自我评价/个人优势模块）",
  "issueType": "缺少核心模块",
  "actionType": "add",
  "comment": "简历缺少自我评价或个人优势模块，招聘方无法快速了解候选人的核心卖点和求职方向。",
  "suggestion": "建议在基础信息下方添加一段简短的自我评价，提炼行业经验、核心能力和求职方向。",
  "confidence": "high",
  "needsConfirmation": false
}
```

---

## 九、Guard 与 Retry 规则

### 9.1 Guard 校验规则

- `anchorText` 必须能在原始简历文本中找到（模糊匹配容差 ≤ 3 个字符）
- `verify/delete/merge/format` 类型允许没有 `example`
- 数据类批注中不得出现原文没有的新数字
- 若输出 AI PM 专项问题，但原文没有 AI 证据词，则判为违规
- 多轮场景下，检查 `previousRoundStatus` 是否合理（如标记 resolved 但问题仍存在）
- `searchEvidence` 只能包含搜索工具实际返回的信息，不得编造

### 9.2 Retry 策略

- 单模块 Prompt 输出 Parse 失败后允许重试一次；二次仍失败则跳过该模块并记录错误
- Guard 校验失败后允许重试一次；二次仍失败则移除违规批注
- 搜索工具调用失败时降级为纯原文审计，不阻塞主流程

### 9.3 日志与监控

- 服务端日志需记录 parse / guard 被拒绝时的 finish reason、输出长度、预览片段
- 便于定位"非 JSON""半截 JSON""字段漂移"等问题
- 记录每个模块的 LLM 调用耗时和 token 消耗
- 记录搜索工具调用次数和结果

---

## 十、Agent 编排伪代码

```python
async def review_resume(resume_text: str, session_id: str):
    # Step 1: 读取会话历史
    previous_comments = await get_review_history(session_id)
    
    # Step 2: 结构识别
    structure = await llm_call(STRUCTURE_PROMPT, resume_text)
    
    # Step 3: 分模块批阅
    all_comments = []
    for module in structure.modules:
        prompt = get_module_prompt(module.normalizedModule)
        module_comments = await llm_call(prompt, module.text, resume_text)
        all_comments.extend(module_comments)
    
    # Step 4: 数据验证（Agent 自主决策）
    data_comments = [c for c in all_comments if c.needsConfirmation and is_data_issue(c)]
    if data_comments:
        search_results = await search_for_validation(data_comments, resume_text)
        if search_results:
            data_comments = await llm_call(DATA_VALIDATION_PROMPT, data_comments, search_results)
            update_comments(all_comments, data_comments)
    
    # Step 5: 多轮一致性检查
    if previous_comments:
        all_comments = await llm_call(CONSISTENCY_PROMPT, previous_comments, all_comments)
    
    # Step 6: Guard 校验
    all_comments = guard_check(all_comments, resume_text)
    
    # Step 7: 保存结果
    await save_review_result(session_id, all_comments)
    
    return all_comments
```

---

## 十一、下一步行动

1. **用户确认本文档**：确认 Agent 工作流、各模块 Prompt、工具定义是否符合预期
2. **Prompt 调优测试**：用真实简历逐个模块测试 Prompt 效果
3. **实现 Agent 编排引擎**：按伪代码实现核心逻辑
4. **集成搜索工具**：实现 search_company / search_industry 接口
5. **开始开发**：按开发计划逐步实现
