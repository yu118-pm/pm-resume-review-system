"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { PmReviewComment, ReviewSession } from "@/lib/types";

async function parseFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/parse-file", { method: "POST", body: formData });
  const data = (await response.json()) as
    | { success: true; text: string }
    | { success: false; error: string };
  if (!response.ok || !data.success) {
    throw new Error(data.success ? "文件解析失败" : data.error);
  }
  return data.text;
}

async function reviewResume(resumeText: string, sessionId: string): Promise<PmReviewComment[]> {
  const response = await fetch("/api/review-pm-resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText, sessionId }),
  });
  const data = (await response.json()) as
    | { success: true; comments: PmReviewComment[] }
    | { success: false; error: string; details?: string[] };
  if (!response.ok || !data.success) {
    if (!data.success && data.details?.length) {
      throw new Error(`${data.error}：${data.details.join("；")}`);
    }
    throw new Error(data.success ? "批阅失败" : data.error);
  }
  return data.comments;
}

export function ResumeUploader({
  session,
  onComplete,
  onBack,
}: {
  session: ReviewSession;
  onComplete: (comments: PmReviewComment[], file: File, generatedAt: Date) => void;
  onBack: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseMsg, setParseMsg] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    if (!picked) return;

    setUploading(true);
    setError(null);
    setParseMsg(null);
    setResumeText("");
    setFile(null);

    try {
      const text = await parseFile(picked);
      setFile(picked);
      setResumeText(text);
      setParseMsg(`已解析 ${picked.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "文件解析失败");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function handleSubmit() {
    if (!resumeText.trim() || !file) {
      setError("请先上传简历文件");
      return;
    }
    setReviewing(true);
    setError(null);
    try {
      const comments = await reviewResume(resumeText, session.id);
      onComplete(comments, file, new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "批阅失败，请稍后重试");
    } finally {
      setReviewing(false);
    }
  }

  if (reviewing) {
    return (
      <div className="min-h-72 flex flex-col items-center justify-center gap-5 rounded-3xl bg-white/60 border border-dashed border-slate-200 p-10">
        <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-500 animate-spin" />
        <div className="text-center">
          <p className="font-semibold text-slate-700">正在批阅，请稍候...</p>
          <p className="text-sm text-slate-400 mt-1">预计 30–60 秒，请勿关闭页面</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Session info */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold text-lg flex items-center justify-center flex-shrink-0">
            {session.studentName.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-slate-800 m-0">{session.studentName}</p>
            <p className="text-xs text-slate-400 m-0">
              第 {session.reviewCount + 1} 轮批阅
              {session.reviewCount > 0 && ` · 已批阅 ${session.reviewCount} 次`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← 切换会话
        </button>
      </div>

      {/* Upload zone */}
      <div
        className={`relative rounded-2xl border-2 border-dashed transition-colors cursor-pointer mb-5 ${
          file
            ? "border-green-300 bg-green-50"
            : "border-slate-200 bg-white/60 hover:border-blue-300 hover:bg-blue-50/30"
        }`}
        onClick={() => !uploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-disabled={uploading}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          disabled={uploading || reviewing}
        />
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="grid gap-1">
            <strong className="text-base text-slate-700">
              {uploading ? "正在解析文件..." : file ? file.name : "点击上传简历文件"}
            </strong>
            <span className="text-sm text-slate-400">
              {file ? "已完成解析，可点击更换文件" : "支持 PDF / DOCX"}
            </span>
          </div>
          <span className="flex-shrink-0 px-4 h-9 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold flex items-center">
            {uploading ? "解析中..." : file ? "重新上传" : "上传文件"}
          </span>
        </div>
      </div>

      {parseMsg && (
        <div className="mb-4 px-4 py-2.5 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-sm">
          {parseMsg}
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!resumeText.trim() || uploading || reviewing}
          className="min-w-52 h-12 rounded-full bg-gradient-to-r from-slate-700 to-blue-700 text-white font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity shadow-lg shadow-blue-900/20"
        >
          开始批阅
        </button>
      </div>
      <p className="text-center text-sm text-slate-400 mt-3">
        批注结果按模块聚合展示，可导出为带 Word 批注的文件
      </p>
    </div>
  );
}
