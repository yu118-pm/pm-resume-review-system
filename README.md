# PM 简历批阅系统

AI 驱动的产品经理简历批阅系统，支持多轮批阅、历史追踪和 Word 批注导出。

## 功能特性

- ✅ **7 步 Agent 编排引擎**：结构识别 → 分模块批阅 → 数据验证 → 历史对比 → Guard 校验 → 保存
- ✅ **多轮批阅追踪**：自动标注 `new`/`modified`/`unchanged` 状态
- ✅ **会话管理**：支持多学员、多轮次批阅历史
- ✅ **搜索工具集成**：公司信息和行业指标验证（Mock Provider）
- ✅ **Word 批注导出**：包含多轮状态和搜索参考
- ✅ **现代化 UI**：Tailwind CSS + React 19 + Next.js 15

## 技术栈

- **前端**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **后端**: Next.js API Routes, Zod 校验
- **AI**: 通义千问 (DashScope API)
- **文档处理**: Python-docx, Mammoth, PDF-parse

## 快速开始

### 1. 安装依赖

```bash
npm install
pip3 install python-docx
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，填入 API Key：

```bash
DASHSCOPE_API_KEY=your_api_key_here
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen-plus
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 部署到 Vercel

### 方式一：通过 Vercel CLI

```bash
npm i -g vercel
vercel login
vercel
```

### 方式二：通过 GitHub 集成

1. 将代码推送到 GitHub
2. 访问 https://vercel.com/new
3. 导入 GitHub 仓库
4. 配置环境变量（见下方）
5. 点击 Deploy

### 环境变量配置

在 Vercel 项目设置中添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DASHSCOPE_API_KEY` | `sk-xxx` | 通义千问 API Key |
| `DASHSCOPE_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | API 基础 URL |
| `DASHSCOPE_MODEL` | `qwen-plus` | 模型名称 |
| `REVIEW_DATA_DIR` | `/tmp/review-sessions` | 会话数据目录 |
| `SEARCH_API_PROVIDER` | `mock` | 搜索工具 Provider |

## 测试

```bash
# 类型检查
npm run typecheck

# Parser 单元测试
npx tsx scripts/test-parser.ts

# E2E 链路测试（需先启动 dev server）
npx tsx scripts/test-e2e.ts
```

## 项目结构

```
src/
├── app/
│   ├── api/                    # API 路由
│   │   ├── review-pm-resume/   # 批阅接口
│   │   ├── review-sessions/    # 会话管理
│   │   └── export-pm-review-docx/ # Word 导出
│   └── page.tsx                # 首页
├── components/
│   ├── pm-review/              # PM 批阅组件
│   │   ├── PmReviewPage.tsx    # 主容器
│   │   ├── SessionSelector.tsx # 会话选择
│   │   ├── ResumeUploader.tsx  # 简历上传
│   │   ├── ReviewResult.tsx    # 结果展示
│   │   └── CommentCard.tsx     # 批注卡片
│   └── workbench.tsx           # 工作台
└── lib/
    ├── pm-review-agent.ts      # Agent 编排引擎
    ├── pm-review-prompts.ts    # Prompt 体系
    ├── pm-review-parser.ts     # 输出解析
    ├── pm-review-guard.ts      # 校验逻辑
    ├── pm-review-history.ts    # 历史存储
    └── pm-review-tools.ts      # 搜索工具
```

## 开发文档

详细技术文档见 `docs/开发技术文档/` 目录：

- T1-M1: 类型系统与数据结构
- T2-M2: 分模块 Prompt 体系
- T3-M3: 会话历史存储
- T4-M4: 搜索工具集成
- T5-M5: Agent 编排引擎
- T6-M6: Parser 与 Guard 升级
- T7-M7: 后端 API 设计
- T8-M8: DOCX 导出升级
- T9-M9: 前端交互设计

## License

MIT
