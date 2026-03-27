"use client";

import { useState } from "react";
import { CommentCard } from "./CommentCard";
import type { PmReviewComment } from "@/lib/types";
import { PM_REVIEW_MODULES } from "@/lib/types";

function readFileNameFromDisposition(header: string | null) {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const basicMatch = header.match(/filename="?([^"]+)"?/i);
  return basicMatch?.[1] ?? null;
}

function groupByModule(comments: PmReviewComment[]) {
  const map = new Map<string, PmReviewComment[]>();

  for (const mod of PM_REVIEW_MODULES) {
    map.set(mod, []);
  }
  map.set("其他", []);

  for (const c of comments) {
    const key = c.normalizedModule ?? "其他";
    const bucket = map.get(key) ?? map.get("其他")!;
    bucket.push(c);
  }

  return [...map.entries()].filter(([, cs]) => cs.length > 0);
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function ModuleGroup({ moduleName, comments }: { moduleName: string; comments: PmReviewComment[] }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span
            className="text-slate-400 text-xs transition-transform duration-150"
            style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none" }}
          >
            ▸
          </span>
          <h4 className="font-semibold text-slate-800 text-base m-0">{moduleName}</h4>
        </div>
        <span className="flex-shrink-0 min-w-[32px] h-7 px-3 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
          {comments.length}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 grid gap-3">
          {comments.map((c, i) => (
            <CommentCard key={`${moduleName}-${c.anchorText}-${i}`} comment={c} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ReviewResult({
  comments,
  uploadedFile,
  generatedAt,
  onBack,
}: {
  comments: PmReviewComment[];
  uploadedFile: File | null;
  generatedAt: Date;
  onBack: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const groups = groupByModule(comments);

  async function handleExport() {
    if (!uploadedFile || comments.length === 0) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);
      formData.append("comments", JSON.stringify(comments));
      const response = await fetch("/api/export-pm-review-docx", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const data = (await response.json()) as { success: false; error: string };
        throw new Error(data.error || "导出失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const fileName = readFileNameFromDisposition(response.headers.get("Content-Disposition"));
      a.href = url;
      a.download = fileName || `批阅_${uploadedFile.name}`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg("Word 批注文件已开始下载");
      window.setTimeout(() => setExportMsg(null), 2000);
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <p className="text-xs font-bold tracking-widest uppercase text-amber-800 mb-1">Review Workspace</p>
          <h3 className="text-2xl font-bold text-slate-800 m-0 tracking-tight">批阅预览</h3>
          <p className="text-sm text-slate-500 mt-1">
            生成于 {formatTime(generatedAt)} · 共 {comments.length} 条批阅意见
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="h-10 px-4 rounded-full border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            ← 重新批阅
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !uploadedFile}
            className="h-10 px-5 rounded-full bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? "导出中..." : "导出 Word 批注"}
          </button>
        </div>
      </div>

      {exportMsg && (
        <div className="mb-4 px-4 py-2.5 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-sm">
          {exportMsg}
        </div>
      )}

      {/* Groups */}
      {groups.length > 0 ? (
        <div className="grid gap-4">
          {groups.map(([moduleName, cs]) => (
            <ModuleGroup key={moduleName} moduleName={moduleName} comments={cs} />
          ))}
        </div>
      ) : (
        <div className="min-h-48 rounded-2xl bg-white/60 border border-dashed border-slate-300 flex flex-col items-start justify-center p-8 gap-2">
          <h4 className="font-semibold text-slate-700 m-0">本次没有可展示的批阅结果</h4>
          <p className="text-sm text-slate-500 m-0">可重新批阅一次，或检查简历文本是否成功解析。</p>
        </div>
      )}
    </div>
  );
}
