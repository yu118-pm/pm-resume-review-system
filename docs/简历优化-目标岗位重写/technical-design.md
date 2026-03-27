# 简历优化 Agent — 技术方案设计

> 基于 [产品设计文档](./product-design.md) 编写

---

## 一、技术栈选型

| 层 | 技术 | 版本 | 选型理由 |
|----|------|------|---------|
| **前端框架** | Next.js (App Router) | 15.x | React 生态，SSR/API Routes 一体化，无需单独部署后端 |
| **UI 组件** | shadcn/ui + Tailwind CSS | v4 | 高质量组件库，样式灵活，开发效率高 |
| **图标** | Lucide React | latest | 轻量、风格统一 |
| **Markdown 渲染** | react-markdown + remark-gfm | latest | 渲染优化后简历的 Markdown 内容 |
| **文件解析** | pdf-parse (PDF) + mammoth (DOCX) | latest | 成熟的 Node.js 文件解析方案，先只支持稳定格式 |
| **LLM 调用** | OpenAI SDK (openai) | 4.x | 官方 SDK，支持 GPT-4o，后续可切换模型 |
| **包管理** | pnpm | latest | 快速、磁盘占用小 |

### 为什么选 Next.js 而非 React + Express 分离架构？

- 自用工具，不需要前后端独立扩展
- Next.js API Routes 可直接承载后端逻辑（文件解析、LLM 调用），**一个项目、一次部署**
- App Router 提供 Server Actions、流式响应等能力，未来扩展方便

---

## 二、项目结构

```
resume-optimizer/
├── .env.local                    # 环境变量（OPENAI_API_KEY 等）
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
│
├── src/
│   ├── app/
│   │   ├── layout.tsx            # 根布局
│   │   ├── page.tsx              # 主页面（输入 + 结果）
│   │   ├── globals.css           # 全局样式
│   │   └── api/
│   │       ├── parse-file/
│   │       │   └── route.ts      # POST /api/parse-file      文件解析接口
│   │       └── optimize-resume/
│   │           └── route.ts      # POST /api/optimize-resume 简历优化接口
│   │
│   ├── components/
│   │   ├── ResumeForm.tsx        # 输入表单（上传/粘贴、目标岗位、补充信息）
│   │   ├── FileUploader.tsx      # 文件上传组件（拖拽 + 点击）
│   │   ├── ResultPanel.tsx       # 结果面板（Tab 切换：简历/说明）
│   │   ├── ResumePreview.tsx     # Markdown 简历渲染
│   │   ├── OptimizationNotes.tsx # 优化说明卡片列表
│   │   └── ui/                   # shadcn/ui 组件（按需引入）
│   │
│   ├── lib/
│   │   ├── openai.ts             # OpenAI 客户端封装
│   │   ├── prompts.ts            # System Prompt + User Prompt 模板
│   │   ├── parser.ts             # AI 响应解析（分隔标记提取）
│   │   ├── file-parser.ts        # PDF/DOCX 文件解析逻辑
│   │   └── types.ts              # TypeScript 类型定义
│   │
│   └── hooks/
│       └── useOptimize.ts        # 前端调用优化接口的 hook
│
└── docs/
    ├── product-design.md
    └── technical-design.md
```

---

## 三、API 接口设计

### 3.1 文件解析接口

**`POST /api/parse-file`**

将上传的 PDF/DOCX 文件解析为纯文本。

| 项 | 说明 |
|----|------|
| Content-Type | `multipart/form-data` |
| 请求体 | `file`: 上传的文件 (`.pdf` / `.docx`) |
| 文件大小限制 | 10MB |

**响应**：

```typescript
// 成功 200
{
  "success": true,
  "text": "解析后的纯文本内容..."
}

// 失败 400/500
{
  "success": false,
  "error": "不支持的文件格式，请上传 PDF 或 DOCX 文件"
}
```

**解析策略**：

| 文件类型 | 库 | 处理方式 |
|---------|-----|---------|
| PDF (`.pdf`) | `pdf-parse` | 提取全部文本内容，保留段落换行 |
| DOCX (`.docx`) | `mammoth` | 转为纯文本，剥离格式 |
| 其他 | — | 返回 400 错误 |

### 3.2 简历优化接口

**`POST /api/optimize-resume`**

调用 LLM 生成优化简历和优化说明。

| 项 | 说明 |
|----|------|
| Content-Type | `application/json` |

**请求体**：

```typescript
{
  "resumeText": string,       // 必填，原始简历文本
  "targetPosition": string,   // 必填，目标岗位名称
  "additionalInfo": string    // 可选，补充信息
}
```

**响应**：

```typescript
// 成功 200
{
  "success": true,
  "resume": "# 张三\n\n## 基本信息\n...",   // 优化后的简历 Markdown
  "notes": [                                   // 优化说明数组
    {
      "category": "模块重组",
      "point": "将产品经验相关经历前置",
      "before": "原简历按时间倒序排列",
      "after": "将最匹配产品经理的工作经历调整到第一位",
      "reason": "目标岗位为产品经理，产品相关经历应最先被看到",
      "confidence": "high",
      "needs_confirmation": false
    }
  ]
}

// 失败 400/500
{
  "success": false,
  "error": "简历优化失败，请稍后重试"
}
```

---

## 四、核心模块设计

### 4.1 Prompt 管理 (`lib/prompts.ts`)

```typescript
// System Prompt 直接存储为常量字符串
export const SYSTEM_PROMPT = `...` // 产品设计文档中的完整 System Prompt

// User Prompt 通过函数动态拼装
export function buildUserPrompt(params: {
  resumeText: string
  targetPosition: string
  additionalInfo?: string
}): string {
  return `## 原始简历\n\n${params.resumeText}\n\n## 目标岗位\n\n${params.targetPosition}\n\n## 补充信息\n\n${params.additionalInfo || '无'}\n如果未提供，请按"无"理解。\n\n## 额外要求\n请优先保留真实信息，避免任何编造。\n如果某些内容信息不足，请保守表达，并在优化说明中标记需要确认的点。\n请直接按系统要求输出，不要添加额外说明。`
}
```

### 4.2 AI 响应解析 (`lib/parser.ts`)

从 LLM 原始输出中提取简历和优化说明两部分，并做基础结构校验。

```typescript
interface OptimizationNote {
  category: '模块重组' | '内容改写' | '关键词对齐' | '信息删减' | '新增整合' | '风险提示'
  point: string
  before: string
  after: string
  reason: string
  confidence: 'high' | 'medium' | 'low'
  needs_confirmation: boolean
}

interface ParsedResult {
  resume: string
  notes: OptimizationNote[]
}

function parseAIResponse(raw: string): ParsedResult {
  // 1. 提取 ===RESUME_START=== 和 ===RESUME_END=== 之间的内容；若缺失则直接抛错
  // 2. 提取 ===NOTES_START=== 和 ===NOTES_END=== 之间的内容
  // 3. JSON.parse notes，并逐项校验字段类型与枚举值
  // 4. notes 校验失败时降级为空数组，但 resume 仍可返回
  // 5. 返回 { resume, notes }
}
```

**校验与容错设计**：
- 若 `===RESUME_START===` 或 `===RESUME_END===` 缺失：视为本次生成失败，返回错误，提示用户重试
- 若 `===NOTES_START===` 或 `===NOTES_END===` 缺失：resume 可返回，notes 降级为空数组
- 若 JSON 解析失败：notes 返回空数组，并记录服务端日志
- 若 JSON 合法但字段不合法：过滤掉不合规项；全部不合规时 notes 返回空数组
- 前端优先展示可用的 resume，不因 notes 异常阻断主流程

**建议增加 Schema 校验**：
- 使用 `zod` 或等价方案校验 `notes` 数组结构
- 校验字段：
  - `category` 必须属于预设枚举
  - `point`、`before`、`after`、`reason` 必须为字符串
  - `confidence` 必须是 `high | medium | low`
  - `needs_confirmation` 必须是布尔值

### 4.3 OpenAI 客户端 (`lib/openai.ts`)

```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL, // 可选，支持代理/国内中转
})

export async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  })
  return response.choices[0]?.message?.content || ''
}
```

**环境变量设计**：

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPENAI_API_KEY` | ✅ | OpenAI API 密钥 |
| `OPENAI_BASE_URL` | ❌ | 自定义 API 地址（代理/中转），默认官方地址 |
| `OPENAI_MODEL` | ❌ | 模型名称，默认 `gpt-4o` |

> 通过 `OPENAI_BASE_URL` + `OPENAI_MODEL`，后续可无缝切换到 DeepSeek、通义千问等兼容 OpenAI 协议的模型。

### 4.4 文件解析 (`lib/file-parser.ts`)

```typescript
export async function parseFile(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase()

  if (ext === 'pdf') {
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return data.text
  }

  if (ext === 'docx') {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  throw new Error('不支持的文件格式，请上传 PDF 或 DOCX 文件')
}
```

**说明**：
- 本期只承诺支持 `.pdf` 和 `.docx`
- 不支持老式 `.doc`，避免用户上传后出现“文档写着支持、实际却失败”的情况

---

## 五、前端组件设计

### 5.1 组件树

```
page.tsx
└── <main>
    ├── <ResumeForm>                    // 输入区域
    │   ├── <FileUploader>              // 文件上传（拖拽区域）
    │   ├── <Textarea>                  // 简历文本框（可编辑）
    │   ├── <Input>                     // 目标岗位
    │   ├── <Textarea>                  // 补充信息
    │   └── <Button>                    // 生成按钮
    │
    └── <ResultPanel>                   // 结果区域（有结果时显示）
        ├── <Tabs>
        │   ├── Tab: 优化简历
        │   │   └── <ResumePreview>     // Markdown 渲染
        │   │       └── 复制按钮
        │   └── Tab: 优化说明
        │       └── <OptimizationNotes> // 卡片列表
        └── (loading 状态)
```

### 5.2 状态管理

单页面应用，状态简单，使用 React `useState` 即可，无需全局状态管理。

```typescript
// page.tsx 或 useOptimize hook 中的核心状态
const [resumeText, setResumeText] = useState('')     // 简历文本
const [targetPosition, setTargetPosition] = useState('') // 目标岗位
const [additionalInfo, setAdditionalInfo] = useState('')  // 补充信息
const [loading, setLoading] = useState(false)            // 生成中
const [result, setResult] = useState<{                   // 生成结果
  resume: string
  notes: OptimizationNote[]
} | null>(null)
const [error, setError] = useState<string | null>(null)  // 错误信息
```

### 5.3 关键交互逻辑

**文件上传流程**：

```
用户拖拽/选择文件
  → 前端发送 POST /api/parse-file (FormData)
  → 后端解析返回纯文本
  → 填入简历文本框（用户可编辑）
  → 如果解析失败，显示错误提示
```

**生成优化简历流程**：

```
用户点击"生成优化简历"
  → 前端校验必填字段（简历文本 + 目标岗位）
  → 发送 POST /api/optimize-resume
  → 显示 loading 状态（骨架屏 + 提示文字"AI 正在优化简历，预计 10-20 秒..."）
  → 收到响应后渲染结果区
  → 如果失败，显示错误提示，用户可重试
```

### 5.4 优化说明卡片渲染

每条优化说明渲染为一个卡片，包含：

| 字段 | 展示方式 |
|------|---------|
| `category` | 标签 Badge，不同类别不同颜色 |
| `point` | 卡片标题 |
| `before` → `after` | 对比展示（如果 before 非空） |
| `reason` | 正文说明 |
| `confidence` | 颜色标识：high=绿 / medium=黄 / low=红 |
| `needs_confirmation` | 为 true 时显示 ⚠️ 需确认 标记 |

---

## 六、错误处理策略

| 场景 | 处理方式 |
|------|---------|
| 文件上传格式不支持 | 前端文件选择器限制 + 后端二次校验，返回明确错误信息 |
| 文件解析失败（如加密 PDF） | 返回错误，提示用户直接粘贴文本 |
| OpenAI API 调用失败 | 捕获异常，区分网络错误/限流/Key无效，返回用户可理解的提示 |
| AI 输出缺少简历分隔标记 | 视为生成失败，提示用户重试，并记录服务端日志 |
| AI 输出缺少说明分隔标记 | 简历照常返回，notes 降级为空数组 |
| AI 输出 JSON 不合法 | notes 返回空数组，前端提示"优化说明解析异常" |
| AI 输出字段不符合约定 | 服务端过滤不合规项，避免前端渲染异常 |
| 请求超时 | 设置 60s 超时，超时后提示用户重试 |

---

## 七、性能与体验优化

| 优化项 | 方案 |
|-------|------|
| **LLM 响应等待体验** | Loading 骨架屏 + 预估时间提示（"AI 正在优化，通常需要 10-20 秒"） |
| **文件上传体验** | 拖拽区域高亮反馈，上传中显示进度，解析完成后自动填充 |
| **复制功能** | 使用 `navigator.clipboard.writeText()`，复制成功后 Toast 提示 |
| **表单保留** | 生成结果后输入区内容保留，方便用户修改后重新生成 |

---

## 八、后续扩展点（本期不做）

| 扩展 | 说明 |
|------|------|
| 流式输出 (SSE) | 打字机效果逐步显示生成过程 |
| 导出 Word | 将优化后的 Markdown 转为 .docx 下载 |
| 多模型切换 | 前端 UI 切换不同 LLM |
| 历史记录 | 本地 localStorage 存储最近 N 次生成记录 |
| 多轮修改 | 对生成结果进行二次调整 |

---

## 九、开发计划

| 阶段 | 内容 | 预估 |
|------|------|------|
| 1 | 统一接口约定、初始化项目、搭建基础页面骨架 | 0.5 天 |
| 2 | 实现 `/api/optimize-resume` 最小闭环：Prompt、模型调用、分隔符解析、notes 校验 | 1 天 |
| 3 | 实现 `/api/parse-file`，支持 PDF / DOCX 上传并回填文本框 | 0.5 天 |
| 4 | 完成输入表单、结果展示、Markdown 渲染、优化说明卡片 | 1 天 |
| 5 | 补齐 loading、错误提示、复制功能、重试与表单保留 | 0.5 天 |
| 6 | 用真实简历做联调测试，修复边界问题并优化提示文案 | 0.5 天 |
