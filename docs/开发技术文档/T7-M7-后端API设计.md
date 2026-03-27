# T7 - M7：后端 API 设计

> 对应模块：M7  
> 改动文件：`src/app/api/review-pm-resume/route.ts`（重写）、`src/app/api/export-pm-review-docx/`（升级）  
> 新建文件：`src/app/api/review-sessions/route.ts`、`src/app/api/review-sessions/[id]/history/route.ts`  
> 依赖：M3, M5  
> 被依赖：M9（前端调用）

---

## 一、API 总览

| 方法 | 路径 | 说明 | 状态 |
|------|------|------|------|
| POST | `/api/review-pm-resume` | 批阅简历 | 🔄 重写 |
| POST | `/api/export-pm-review-docx` | 导出 Word | ⚠️ 升级 |
| GET | `/api/review-sessions` | 会话列表 | 🆕 |
| POST | `/api/review-sessions` | 创建会话 | 🆕 |
| GET | `/api/review-sessions/[id]/history` | 批阅历史 | 🆕 |
| POST | `/api/parse-file` | 文件解析 | ✅ 不动 |

---

## 二、POST /api/review-pm-resume（重写）

### 请求

```typescript
interface ReviewPmResumeRequest {
  resumeText: string;
  sessionId?: string;
}
```

### 响应

```typescript
// 成功
interface ReviewPmResumeResponse {
  success: true;
  comments: PmReviewComment[];
}

// 失败
interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string[];
}
```

### 实现要点

重写后大幅简化：错误处理、重试、Guard 全部下沉到 Agent 层。

```typescript
import { reviewResume } from "@/lib/pm-review-agent";

export async function POST(request: Request) {
  const body = await request.json() as ReviewPmResumeRequest;
  const resumeText = body.resumeText?.trim();
  
  if (!resumeText) {
    return jsonError("缺少原始简历文本", 400);
  }
  
  try {
    const comments = await reviewResume(resumeText, body.sessionId);
    return NextResponse.json<ReviewPmResumeResponse>({ success: true, comments });
  } catch (error) {
    console.error("[api/review-pm-resume]", error);
    return jsonError("PM 简历批阅失败，请稍后重试", 500);
  }
}
```

旧代码中的 LLM 直接调用、parse retry、guard retry 循环全部移除，由 `reviewResume()` 内部处理。

---

## 三、GET /api/review-sessions（列表）

### 请求

无参数。

### 响应

```json
{
  "sessions": [
    {
      "id": "s_20260326_a3f2",
      "studentName": "张三",
      "createdAt": "2026-03-26T00:00:00.000Z",
      "lastReviewAt": "2026-03-26T01:30:00.000Z",
      "reviewCount": 2
    }
  ]
}
```

### 实现

```typescript
import { listSessions } from "@/lib/pm-review-history";

export async function GET() {
  const sessions = await listSessions();
  return NextResponse.json({ sessions });
}
```

---

## 四、POST /api/review-sessions（创建）

### 请求

```json
{ "studentName": "张三" }
```

### 响应

```json
{
  "session": {
    "id": "s_20260326_a3f2",
    "studentName": "张三",
    "createdAt": "2026-03-26T00:00:00.000Z",
    "reviewCount": 0
  }
}
```

### 实现

```typescript
import { createSession } from "@/lib/pm-review-history";

export async function POST(request: Request) {
  const body = await request.json();
  const studentName = body.studentName?.trim();
  
  if (!studentName) {
    return jsonError("缺少学员姓名", 400);
  }
  
  const session = await createSession(studentName);
  return NextResponse.json({ session });
}
```

---

## 五、GET /api/review-sessions/[id]/history

### 文件路径

`src/app/api/review-sessions/[id]/history/route.ts`

### 请求

URL 参数 `id` 为 sessionId。

### 响应

```json
{
  "history": [
    {
      "round": 1,
      "timestamp": "2026-03-26T00:10:00.000Z",
      "resumeText": "...",
      "comments": [...]
    }
  ]
}
```

### 实现

```typescript
import { getReviewHistory } from "@/lib/pm-review-history";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const history = await getReviewHistory(params.id);
  return NextResponse.json({ history });
}
```

---

## 六、POST /api/export-pm-review-docx（升级）

### 改动

请求体不变，但 `comments` 中可能包含 `searchEvidence` 和 `previousRoundStatus` 新字段。

TypeScript 侧无需改动（直接透传给 Python 脚本）。Python 脚本在 M8 中升级。

---

## 七、通用工具函数

所有 API route 共用的错误响应函数：

```typescript
function jsonError(message: string, status: number, details?: string[]) {
  return NextResponse.json<ApiErrorResponse>(
    details?.length
      ? { success: false, error: message, details }
      : { success: false, error: message },
    { status },
  );
}
```

可考虑提取到 `src/lib/api-utils.ts` 中统一复用。

---

## 八、注意事项

1. **API 层只做参数校验和路由**：业务逻辑全部在 lib 层
2. **不需要认证**：个人工具，无需鉴权
3. **重写 review-pm-resume 时保留 jsonError 函数**：其他 API 也用
4. **Next.js App Router 的 params 获取方式**：注意 Next.js 15 中 params 的类型可能是 Promise，需确认
5. **超时问题**：Agent 多步调用可能需要 30-60 秒，注意 Next.js API timeout 配置
