# 作业批阅 — 音视频讲解稿批阅 产品与技术方案

## 一、产品概述

**产品定位**：求职顾问工作台的新增工具模块，帮助老师将学员录制的音视频讲解稿自动转写为文字，并由大模型进行标准化批阅，降低重复性人工批阅成本。

**核心价值**：上传音视频 + 选择题目 → 自动转写 → AI 标准化批阅 → 输出【评价】+【参考话术】

**使用者**：老师（单用户，无需登录）

**入口**：在现有 Workbench 侧边栏新增「作业批阅」工具 tab

---

## 二、核心约束（基于需求确认）

| 项目 | 决策 |
|------|------|
| 音视频上传方 | 老师手动上传，不提供学员入口 |
| 文件存储 | 临时存储，批阅完成后可丢弃 |
| 文件中转 | 需新增阿里云 OSS 用于中转（通义听悟要求 HTTP URL） |
| 题目管理 | 老师提供题目列表，前端下拉选择 |
| 题目分配 | 同一批学员回答同一题目 |
| 结果输出 | 页面展示 + 复制按钮，无需导出 Word/PDF |
| 历史记录 | 不持久化，浏览器关闭即丢弃（前端 state 管理） |
| 二次编辑 | 不需要 |
| 批量处理 | 不需要批量，但支持多开任务（并行处理多个学员） |
| 大模型 | 复用通义千问 DashScope API，可选经济模型（qwen-turbo） |
| 等待时间 | 用户可接受异步等待 |

---

## 三、用户流程

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  上传音视频    │ ──▶ │  选择批阅题目  │ ──▶ │  提交批阅     │
│  文件         │     │  (下拉选择)   │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  Step 1:     │
                                          │  上传 OSS    │
                                          │  (几秒)      │
                                          └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  Step 2:     │
                                          │  通义听悟转写  │
                                          │  (1-10分钟)   │
                                          └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  Step 3:     │
                                          │  大模型批阅   │
                                          │  (10-30秒)   │
                                          └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  展示结果     │
                                          │  【评价】     │
                                          │  【参考话术】  │
                                          │  + 复制按钮   │
                                          └──────────────┘
```

**支持多开**：老师可以在一个页面内同时提交多个学员的音视频，每个作为独立任务卡片并行处理，互不阻塞。

---

## 四、页面设计

### 4.1 整体布局

在 Workbench 侧边栏新增工具入口：

```
工具导航:
├── 简历优化          (已有)
├── PM 简历批阅       (已有)
└── 作业批阅          (新增) ← 本次
```

### 4.2 作业批阅页面结构

```
┌──────────────────────────────────────────────────────┐
│  📝 作业批阅                                          │
│  Audio/Video Review                                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ 新建批阅任务 ─────────────────────────────────┐  │
│  │                                                │  │
│  │  [上传音视频文件]                               │  │
│  │  支持 mp3/mp4/wav/m4a/flac/aac，最大 500MB     │  │
│  │                                                │  │
│  │  批阅题目:  [ 下拉选择题目 ▼ ]                   │  │
│  │                                                │  │
│  │  学员姓名:  [ 输入学员姓名（可选） ]              │  │
│  │                                                │  │
│  │           [ 🚀 提交批阅 ]                       │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
├──────────────────────────────────────────────────────┤
│  任务列表                                             │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ 任务 #1 ─ 张三 ─ 自我介绍 ──────── ✅ 已完成 ─┐  │
│  │  【评价】                                       │  │
│  │  整体评价：... 优点：... 问题：... 总结：...     │  │
│  │                                                │  │
│  │  【参考话术】                                    │  │
│  │  ...完整可口述的参考稿...                        │  │
│  │                                                │  │
│  │  [📋 复制评价] [📋 复制参考话术] [📋 复制全部]    │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ 任务 #2 ─ 李四 ─ 自我介绍 ──── ⏳ 转写中... ──┐  │
│  │  Step 2/3: 通义听悟转写中，预计还需 3 分钟       │  │
│  │  ████████████░░░░░░░░                           │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ 任务 #3 ─ 王五 ─ STAR法则 ──── ⏳ 批阅中... ──┐  │
│  │  Step 3/3: 大模型批阅中...                       │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 4.3 任务状态流转

```
uploading → transcribing → reviewing → completed
  上传中       转写中         批阅中      已完成
                                          ↘
                                        failed (任意步骤失败)
```

每个任务卡片实时显示当前状态和进度提示。

---

## 五、题目管理

### 5.1 题目数据结构

题目以 JSON 配置文件形式管理（后续可扩展为数据库），存放在 `src/lib/homework-questions.ts`：

```typescript
export interface HomeworkQuestion {
  id: string;
  title: string;           // 题目简称，用于下拉显示
  content: string;         // 完整题目内容，传给大模型
  category: string;        // 分类，如 "自我介绍"、"STAR法则"、"项目复盘"
  requiresStar: boolean;   // 是否要求 STAR 结构
  reviewFocus?: string[];  // 老师额外关注点（可选），用于补充 prompt
}

export const HOMEWORK_QUESTIONS: HomeworkQuestion[] = [
  {
    id: "q1",
    title: "请用 1 分钟做自我介绍",
    content: "请用 1 分钟做自我介绍，要求涵盖个人背景、核心优势、与目标岗位的匹配点。",
    category: "自我介绍",
    requiresStar: false,
    reviewFocus: ["是否突出岗位匹配点", "内容是否具体而不是空泛自夸"],
  },
  // ... 老师后续提供更多题目
];
```

### 5.2 题目维护方式

- **当前阶段**：老师提供题目列表，开发者写入配置文件
- **后续扩展**：可做一个简单的题目管理页面（CRUD），或改为读取 JSON/Markdown 文件

---

## 六、技术架构

### 6.1 整体架构图

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   前端       │      │   后端 API        │      │  外部服务        │
│  Workbench  │ ───▶ │  Next.js Routes  │ ───▶ │                 │
│  新增 Tab    │ ◀─── │                  │ ◀─── │  ① 阿里云 OSS   │
└─────────────┘      │                  │      │  ② 通义听悟 API  │
                     │                  │      │  ③ DashScope LLM │
                     └──────────────────┘      └─────────────────┘
```

### 6.2 处理链路

```
前端上传文件
    │
    ▼
POST /api/homework-review/submit
    │
    ├── 1. 接收文件，上传到阿里云 OSS（临时 bucket）
    │      → 获取可访问的 URL
    │
    ├── 2. 调用通义听悟 CreateTask API（离线转写）
    │      → 获取 TaskId
    │      → 返回前端 taskId，前端开始轮询
    │
    ▼
GET /api/homework-review/status?taskId=xxx
    │
    ├── 3. 调用通义听悟 GetTaskInfo API 查询状态
    │      → 如果未完成：返回 { status: "transcribing" }
    │      → 如果已完成：获取转写结果 JSON
    │      → 从 Paragraphs / Words 中提取纯文本讲解稿
    │      → 去除时间戳、speaker label、异常空白，不做语义改写
    │
    ├── 4. 转写完成后，调用 DashScope LLM 进行批阅
    │      → System Prompt (作业批阅 Prompt)
    │      → User Prompt (题目内容 + 是否要求 STAR + 学员讲解稿 + 老师关注点)
    │      → 获取批阅结果
    │
    ├── 5. 清理 OSS 临时文件
    │
    └── 6. 返回 { status: "completed", evaluation, referenceSpeech }
```

### 6.3 API 设计

#### API 1: 提交批阅任务

```
POST /api/homework-review/submit
Content-Type: multipart/form-data

Request:
  - file: 音视频文件 (mp3/mp4/wav/m4a/flac/aac)
  - questionId: 题目 ID
  - studentName: 学员姓名（可选）

Response:
{
  "success": true,
  "taskId": "hw_1234567890",
  "message": "任务已提交，正在转写中"
}
```

#### API 2: 查询任务状态

```
GET /api/homework-review/status?taskId=hw_1234567890

Response (进行中):
{
  "success": true,
  "taskId": "hw_1234567890",
  "status": "transcribing",        // uploading | transcribing | reviewing | completed | failed
  "step": 2,
  "totalSteps": 3,
  "message": "通义听悟转写中，请耐心等待..."
}

Response (已完成):
{
  "success": true,
  "taskId": "hw_1234567890",
  "status": "completed",
  "result": {
    "evaluation": "【评价】\n整体评价：...\n优点：...\n问题：...\n总结：...",
    "referenceSpeech": "【参考话术】\n...",
    "transcribedText": "（转写原文，供老师参考）",
    "question": { "title": "...", "content": "..." },
    "studentName": "张三",
    "completedAt": "2026-03-30T00:10:00Z"
  }
}

Response (失败):
{
  "success": true,
  "taskId": "hw_1234567890",
  "status": "failed",
  "error": "音视频文件转写失败，请检查文件格式"
}
```

#### API 3: 获取题目列表

```
GET /api/homework-review/questions

Response:
{
  "success": true,
  "questions": [
    { "id": "q1", "title": "请用 1 分钟做自我介绍", "category": "自我介绍" },
    ...
  ]
}
```

---

## 七、通义听悟接入方案

### 7.1 开通步骤

1. 登录 [阿里云控制台](https://console.aliyun.com)
2. 搜索并开通「通义听悟」服务
3. 在 [听悟管控台](https://nls-portal.console.aliyun.com/tingwu/projects) 创建项目，获取 **AppKey**
4. 在阿里云 RAM 控制台创建 AccessKey（AccessKeyId + AccessKeySecret）
5. 将以上信息配置到项目环境变量

### 7.2 环境变量

```bash
# 通义听悟
TINGWU_APP_KEY=your_tingwu_app_key
ALIBABA_CLOUD_ACCESS_KEY_ID=your_access_key_id
ALIBABA_CLOUD_ACCESS_KEY_SECRET=your_access_key_secret
TINGWU_SOURCE_LANGUAGE=cn
TINGWU_TRANSCRIPTION_MODEL=domain-education

# 阿里云 OSS（用于音视频文件中转）
OSS_REGION=oss-cn-beijing
OSS_BUCKET=your-homework-review-bucket
OSS_ACCESS_KEY_ID=your_access_key_id        # 可复用上面的
OSS_ACCESS_KEY_SECRET=your_access_key_secret  # 可复用上面的
OSS_SIGNED_URL_EXPIRES=10800                # 3 小时，官方建议不要低于 3 小时

# 批阅大模型（可选独立配置，不配置则复用 DASHSCOPE）
HOMEWORK_REVIEW_MODEL=qwen-turbo
```

### 7.3 通义听悟调用流程

#### 创建离线转写任务

```
PUT https://tingwu.cn-beijing.aliyuncs.com/openapi/tingwu/v2/tasks?type=offline

Body:
{
  "AppKey": "${TINGWU_APP_KEY}",
  "Input": {
    "FileUrl": "https://your-bucket.oss-cn-beijing.aliyuncs.com/temp/xxx.mp3",
    "SourceLanguage": "${TINGWU_SOURCE_LANGUAGE}",
    "TaskKey": "hw_1234567890"
  },
  "Parameters": {
    "Transcription": {
      "DiarizationEnabled": false,
      "Model": "${TINGWU_TRANSCRIPTION_MODEL}"
    },
    "TextPolishEnabled": false
  }
}

Response:
{
  "Code": "0",
  "Data": { "TaskId": "t_abc123", "TaskKey": "hw_1234567890" }
}
```

#### 查询任务结果

```
GET https://tingwu.cn-beijing.aliyuncs.com/openapi/tingwu/v2/tasks/{TaskId}

Response (完成时):
{
  "Code": "0",
  "Data": {
    "TaskId": "t_abc123",
    "TaskStatus": "COMPLETED",
    "Result": {
      "Transcription": "https://xxx/transcription_result.json"
    }
  }
}
```

转写结果 JSON 中的 `Transcription.Paragraphs[].Words[].Text` 可按 `SentenceId` 或顺序拼接为讲解稿纯文本，再传给大模型。

#### 推荐参数决策

- `SourceLanguage=cn`：求职讲解场景以中文为主，优先用已知语种，只有老师明确上传混合语种内容时再切换为 `auto` 或 `multilingual`。
- `Transcription.Model=domain-education`：通义听悟官方提供的教育领域离线模型，更贴近课程/作业讲解场景，优先用于本工具。
- `TextPolishEnabled=false`：V1 不开启口语书面化，避免在批阅前就改写学员原始表达，影响“基于原讲解内容批阅”的一致性。
- `DiarizationEnabled=false`：当前默认上传的是单个学员讲解文件，不需要说话人分离；若后续出现“题目播报 + 学员回答”混录，再评估开启。

### 7.4 轮询策略

```
前端轮询间隔（V1）:
  - 提交成功后先展示“转写中”状态，不立即高频查询
  - 前 10 分钟: 每 60 秒查询一次
  - 10 分钟后: 每 5 分钟查询一次
  - 30 分钟超时: 标记失败
```

> 官方文档明确提示查询频率不宜过高，建议按每 1 分钟或每 5 分钟持续查询；因此不建议使用 10 秒级轮询。

### 7.5 回调模式建议

当前版本可先采用前端轮询推进任务，降低实现复杂度。

当以下任一情况出现时，建议切换为 HTTP 回调：

- 老师同一时间并行提交的任务数明显增加
- 轮询导致频繁触发听悟 QPS 限流
- 需要在服务端统一处理任务完成、清理 OSS、发送通知

切换方式：

- 在控制台配置回调地址
- 创建任务时设置 `Input.ProgressiveCallbacksEnabled=true`
- 回调到达后由服务端推进任务状态，而不是依赖前端轮询触发

---

## 八、阿里云 OSS 接入方案

### 8.1 为什么需要 OSS

通义听悟不支持直接上传文件，要求提供音视频的 **HTTP/HTTPS 可下载 URL**。因此需要 OSS 作为文件中转站。

### 8.2 OSS 使用方式

```
1. 前端上传文件到后端 API
2. 后端将文件上传到 OSS 临时目录（temp/homework/）
3. 生成带有效期（不少于 3 小时）的签名 URL
4. 将签名 URL 传给通义听悟
5. 批阅完成后删除 OSS 文件
```

### 8.3 OSS Bucket 配置建议

- **Bucket 名称**：`homework-review-temp`（或复用已有 Bucket 加前缀路径）
- **区域**：`cn-beijing`（与通义听悟同 region，加速处理）
- **存储类型**：标准存储
- **访问权限**：私有（通过签名 URL 授权访问）
- **生命周期规则**：设置 `temp/homework/` 前缀的文件 1 天后自动删除（兜底清理）
- **文件命名**：尽量避免中文、空格和特殊字符，降低 URL 兼容问题
- **部署建议**：如果服务端部署在阿里云同 region，可优先使用内网签名 URL；否则使用公网签名 URL

### 8.4 依赖包

```bash
npm install ali-oss @alicloud/openapi-client @alicloud/tea-util
```

---

## 九、大模型批阅设计

### 9.1 Prompt 设计

建议直接将 prompt 固化在 `src/lib/homework-review-prompts.ts` 中，而不是继续依赖外部 markdown 占位，避免实现阶段出现“文档一套、代码一套”的偏差。

#### System Prompt（建议稿）

```typescript
export const HOMEWORK_REVIEW_SYSTEM_PROMPT = `你是一名专业的求职表达训练批阅老师，擅长根据题目要求，对学员的讲解稿进行结构化点评，并提供可直接借鉴的参考话术。

你的输入包含：
1. 题目内容
2. 题目要求补充（例如是否要求 STAR、老师额外关注点）
3. 学员讲解稿（由音视频自动转写得到，可能存在少量口语词、同音字或错别字）

你的任务是：
根据用户提供的【题目内容】和【学员讲解稿】，输出两部分内容：
1. 【评价】
2. 【参考话术】

请严格遵循以下规则：

1. 评价必须紧扣题目要求。
2. 只评价内容本身，不评价语气、表情、停顿、镜头表现、音质或录制环境。
3. 要判断学员是否切题、结构是否完整、逻辑是否清晰、内容是否具体、是否体现题目要求中的关键能力。
4. 如果题目要求 STAR 结构，必须逐项检查 S（情境）、T（任务）、A（行动）、R（结果）是否完整，并明确指出缺失环节。
5. 若学员内容更像答题思路、原则总结或假设做法，而不是完整真实案例，要明确指出这一点。
6. 评价既要指出优点，也要指出问题；所有评价都要具体、专业、可执行，不能泛泛而谈。
7. 如果讲解稿中疑似存在少量转写错误，你可以结合上下文做最小化理解，但不得据此脑补学员未表达过的事实。
8. 参考话术必须保留学员原本题材、核心经历和事实边界，在不脱离原意的前提下优化重写。
9. 参考话术要自然、真实、适合口头表达，不要假大空，不要夸张编造成果，不要新增未经学员表达过的数字、职责或项目背景。
10. 如果学员内容明显不完整，也要基于现有题材尽量生成一版可借鉴的话术，但只能做结构优化和表达优化，不能虚构事实。
11. 输出必须只包含以下两个部分，不要输出表格、代码块、评分、标签或思维过程：
【评价】
【参考话术】
12. 【评价】必须写成结构化文字，并包含以下四个小项：
整体评价：
优点：
问题：
总结：
13. 【参考话术】直接输出一版完整、连续、可口述的参考稿。
14. 你的输出要达到老师可以直接发给学员看的程度。`;
```

### 9.2 User Prompt 与转写文本预处理

#### 转写文本预处理原则

- 从听悟返回的 `Transcription.Paragraphs[].Words[].Text` 提取文本，按顺序拼接。
- 删除时间戳、speaker id、异常空白和明显的结构噪声。
- 不使用 `TextPolishEnabled=true` 生成的润色文本作为批阅输入，避免改写学员原话。
- 不对口语词做语义改写，只做轻量规范化，确保大模型看到的仍是“学员原始表达”。

#### User Prompt 模板

```typescript
export function buildHomeworkReviewUserPrompt(params: {
  questionTitle: string;
  questionContent: string;
  category: string;
  requiresStar: boolean;
  reviewFocus?: string[];
  transcribedText: string;
}) {
  const extraFocus =
    params.reviewFocus && params.reviewFocus.length > 0
      ? params.reviewFocus.map((item) => `- ${item}`).join("\\n")
      : "无";

  return `请根据以下题目内容和学员讲解稿，输出【评价】和【参考话术】。

【题目标题】
${params.questionTitle}

【题目内容】
${params.questionContent}

【题目要求补充】
- 题目分类：${params.category}
- 是否要求 STAR：${params.requiresStar ? "是" : "否"}
- 老师额外关注点：
${extraFocus}

【转写说明】
以下讲解稿来自音视频自动转写，可能存在少量口语词、同音字或错别字，请结合上下文理解，但不要脑补学员未表达的事实。

【学员讲解稿】
${params.transcribedText}`.trim();
}
```

### 9.3 模型参数

| 参数 | 值 | 说明 |
|------|-----|------|
| model | `qwen-turbo` | 经济实惠，批阅场景足够 |
| temperature | `0.3` | 低温度保证批阅一致性 |
| max_tokens | `2048` | 评价 + 参考话术通常在 1500 token 以内 |

> 注：如批阅质量不理想可切换为 `qwen-plus`，通过环境变量 `HOMEWORK_REVIEW_MODEL` 控制。

### 9.4 输出解析

批阅助手 prompt 要求输出 `【评价】` 和 `【参考话术】` 两个部分。后端解析规则：

```typescript
function parseReviewResult(text: string): { evaluation: string; referenceSpeech: string } {
  const evalMatch = text.match(/【评价】([\s\S]*?)(?=【参考话术】|$)/);
  const speechMatch = text.match(/【参考话术】([\s\S]*?)$/);
  return {
    evaluation: evalMatch?.[1]?.trim() ?? text,
    referenceSpeech: speechMatch?.[1]?.trim() ?? "",
  };
}
```

---

## 十、前端组件设计

### 10.1 新增文件清单

```
src/
├── components/
│   └── homework-review/
│       ├── HomeworkReviewPage.tsx    # 主容器页面
│       ├── TaskSubmitForm.tsx        # 上传 + 选题 + 提交表单
│       ├── TaskCard.tsx              # 单个任务卡片（状态 + 结果）
│       └── TaskStatusBadge.tsx       # 状态标签组件
├── lib/
│   ├── homework-questions.ts         # 题目配置
│   ├── homework-review-types.ts      # 类型定义
│   └── homework-review-prompts.ts    # 批阅 Prompt
└── app/
    └── api/
        └── homework-review/
            ├── submit/route.ts       # 提交任务 API
            ├── status/route.ts       # 查询状态 API
            └── questions/route.ts    # 获取题目列表 API
```

### 10.2 状态管理

任务列表在前端用 React state 管理（不持久化），支持多任务并行：

```typescript
interface HomeworkTask {
  taskId: string;
  studentName: string;
  question: { id: string; title: string };
  fileName: string;
  status: "uploading" | "transcribing" | "reviewing" | "completed" | "failed";
  step: number;
  totalSteps: number;
  message: string;
  result?: {
    evaluation: string;
    referenceSpeech: string;
    transcribedText: string;
    completedAt: string;
  };
  error?: string;
  createdAt: Date;
}

// 页面 state
const [tasks, setTasks] = useState<HomeworkTask[]>([]);
```

### 10.3 多任务轮询

每个任务独立启动轮询，采用 `setTimeout` 动态退避，避免 10 秒级高频轮询：

```typescript
function startPolling(taskId: string) {
  const startedAt = Date.now();
  let stopped = false;

  const poll = async () => {
    if (stopped) return;

    const res = await fetch(`/api/homework-review/status?taskId=${taskId}`);
    const data = await res.json();
    updateTask(taskId, data);

    if (data.status === "completed" || data.status === "failed") {
      stopped = true;
      return;
    }

    const elapsed = Date.now() - startedAt;
    const nextDelay = elapsed < 10 * 60_000 ? 60_000 : 5 * 60_000;
    setTimeout(poll, nextDelay);
  };

  setTimeout(poll, 60_000); // 提交后 60s 再查第一次
}
```

---

## 十一、后端任务管理

### 11.1 内存任务池

由于不需要持久化，后端使用内存 Map 管理任务状态：

```typescript
// src/lib/homework-task-store.ts
const taskStore = new Map<string, HomeworkTaskState>();

interface HomeworkTaskState {
  taskId: string;
  tingwuTaskId: string;          // 通义听悟返回的 TaskId
  ossKey: string;                // OSS 文件路径（用于清理）
  questionId: string;
  studentName: string;
  status: "transcribing" | "reviewing" | "completed" | "failed";
  transcribedText?: string;
  result?: { evaluation: string; referenceSpeech: string };
  error?: string;
  createdAt: Date;
}
```

### 11.2 状态查询时的懒处理

`GET /api/homework-review/status` 不仅返回状态，还承担**推进任务**的职责：

```
查询状态时：
1. 如果 status === "transcribing"
   → 调用听悟 GetTaskInfo 检查
   → 如果转写完成 → 提取文本 → 调用大模型批阅 → 更新为 reviewing/completed
   → 如果转写未完成 → 保持 transcribing

2. 如果 status === "reviewing"
   → 等待大模型返回（通常很快，10-30s）

3. 如果 status === "completed" 或 "failed"
   → 直接返回结果
```

这种"懒处理"模式避免了后台定时任务的复杂性，由前端轮询触发状态推进。

---

## 十二、Workbench 集成

### 12.1 侧边栏新增入口

在 `src/components/workbench.tsx` 的 `TOOLS` 数组中新增：

```typescript
{ key: "homeworkReview", name: "作业批阅", description: "音视频讲解稿", active: true },
```

### 12.2 路由映射

```typescript
// page.tsx
const initialTool = toolValue === "pm-review" 
  ? "pmReview" 
  : toolValue === "homework-review"
    ? "homeworkReview"
    : "optimize";

// workbench.tsx 中渲染
{activeTool === "homeworkReview" ? <HomeworkReviewPage /> : null}
```

---

## 十三、成本估算

### 13.1 通义听悟

| 项目 | 费率 | 说明 |
|------|------|------|
| 语音转写 | ¥0.8/小时（后付费） | 按音频时长计费 |
| 免费额度 | 新开通用户有一定免费额度 | 具体以控制台为准 |

> 假设每个学员音频 3 分钟，100 人/月 = 5 小时 ≈ ¥4/月

### 13.2 大模型批阅（qwen-turbo）

| 项目 | 费率 | 说明 |
|------|------|------|
| 输入 | ¥0.3/百万 token | System prompt + 题目 + 讲解稿 ≈ 2000 token |
| 输出 | ¥0.6/百万 token | 评价 + 参考话术 ≈ 1000 token |

> 100 人/月 ≈ ¥0.1/月，几乎可忽略

### 13.3 阿里云 OSS

| 项目 | 费率 | 说明 |
|------|------|------|
| 存储 | ¥0.12/GB/月 | 临时文件当天清理 |
| 流量 | ¥0.25/GB（内网免费） | 与听悟同 region 走内网 |

> 100 个 50MB 文件/月 ≈ 5GB，因当天删除，成本可忽略

**月总成本估算：~¥5/月**（100 学员/月场景）

---

## 十四、开发排期建议

| 阶段 | 任务 | 预估工时 |
|------|------|---------|
| P0 | 阿里云 OSS 开通配置 + 听悟 API 开通 | 0.5 天 |
| P1 | OSS 文件上传/删除工具函数 | 0.5 天 |
| P2 | 通义听悟 API 封装（创建任务 + 查询 + 结果解析） | 1 天 |
| P3 | 后端 API 三个接口开发 | 1 天 |
| P4 | 前端 HomeworkReviewPage + 组件开发 | 1 天 |
| P5 | Workbench 集成 + 联调测试 | 0.5 天 |
| P6 | 题目数据录入 + 端到端验证 | 0.5 天 |
| **合计** | | **5 天** |

---

## 十五、后续扩展方向

1. **批量上传**：支持一次上传多个文件批量批阅
2. **题目管理页面**：在线增删改题目，无需改代码
3. **批阅结果导出**：汇总多个学员结果导出 Excel
4. **更多批阅场景**：不限于音视频，可扩展文字作业批阅
5. **学员自助入口**：学员自行上传，老师查看批阅结果
6. **批阅质量调优**：根据实际效果迭代 prompt，或换用更强模型

---

## 十六、待办事项

1. **【老师】** 开通阿里云通义听悟 API + OSS 服务
2. **【老师】** 提供第一批批阅题目列表（题目标题 + 完整题目内容 + 是否要求 STAR 结构）
3. **【开发】** 基于本方案开始开发
