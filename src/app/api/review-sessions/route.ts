import { NextResponse } from "next/server";
import { createSession, listSessions } from "@/lib/pm-review-history";
import type { ApiErrorResponse, ReviewSession } from "@/lib/types";

function jsonError(message: string, status: number, details?: string[]) {
  return NextResponse.json<ApiErrorResponse>(
    details?.length
      ? { success: false, error: message, details }
      : { success: false, error: message },
    { status },
  );
}

export async function GET() {
  try {
    const sessions = await listSessions();
    return NextResponse.json<{ sessions: ReviewSession[] }>({ sessions });
  } catch (error) {
    console.error("[api/review-sessions] GET 失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError("获取会话列表失败", 500);
  }
}

export async function POST(request: Request) {
  let body: { studentName?: string };

  try {
    body = (await request.json()) as { studentName?: string };
  } catch {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const studentName = body.studentName?.trim();

  if (!studentName) {
    return jsonError("缺少学员姓名 studentName", 400);
  }

  try {
    const session = await createSession(studentName);
    return NextResponse.json<{ session: ReviewSession }>({ session }, { status: 201 });
  } catch (error) {
    console.error("[api/review-sessions] POST 创建会话失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError("创建会话失败", 500);
  }
}
