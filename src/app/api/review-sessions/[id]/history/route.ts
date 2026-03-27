import { NextResponse } from "next/server";
import { getReviewHistory } from "@/lib/pm-review-history";
import type { ApiErrorResponse, ReviewHistoryEntry } from "@/lib/types";

function jsonError(message: string, status: number, details?: string[]) {
  return NextResponse.json<ApiErrorResponse>(
    details?.length
      ? { success: false, error: message, details }
      : { success: false, error: message },
    { status },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return jsonError("缺少会话 ID", 400);
  }

  try {
    const history = await getReviewHistory(id);
    return NextResponse.json<{ history: ReviewHistoryEntry[] }>({ history });
  } catch (error) {
    console.error("[api/review-sessions/history] GET 失败", {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError("获取批阅历史失败", 500);
  }
}
