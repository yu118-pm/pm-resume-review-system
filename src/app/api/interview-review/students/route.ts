import { NextResponse } from "next/server";
import {
  createInterviewStudent,
  listInterviewStudents,
} from "@/lib/interview-review-store";
import type {
  InterviewStudentResponse,
  InterviewStudentsResponse,
} from "@/lib/interview-review-types";
import type { ApiErrorResponse } from "@/lib/types";

function jsonError(message: string, status: number) {
  return NextResponse.json<ApiErrorResponse>(
    { success: false, error: message },
    { status },
  );
}

export async function GET() {
  try {
    const students = await listInterviewStudents();
    return NextResponse.json<InterviewStudentsResponse>({ success: true, students });
  } catch (error) {
    console.error("[api/interview-review/students] GET 失败", error);
    return jsonError("获取学员列表失败", 500);
  }
}

export async function POST(request: Request) {
  let body: { name?: string };

  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const name = body.name?.trim();

  if (!name) {
    return jsonError("缺少学员姓名", 400);
  }

  try {
    const student = await createInterviewStudent(name);
    return NextResponse.json<InterviewStudentResponse>(
      { success: true, student },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/interview-review/students] POST 失败", error);
    return jsonError("创建学员失败", 500);
  }
}
