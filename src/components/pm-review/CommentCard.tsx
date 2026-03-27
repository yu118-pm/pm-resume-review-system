"use client";

import { useState } from "react";
import type { PmReviewComment } from "@/lib/types";

const STATUS_STYLES: Record<string, { card: string; badge: string; label: string }> = {
  new: {
    card: "bg-blue-50 border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    label: "🆕 新发现",
  },
  modified: {
    card: "bg-orange-50 border-orange-200",
    badge: "bg-orange-100 text-orange-700",
    label: "✏️ 已修改仍需改进",
  },
  unchanged: {
    card: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-700",
    label: "⚠️ 上次已指出未修改",
  },
};

const CONFIDENCE_STYLES: Record<string, { dot: string; label: string; cls: string }> = {
  high: { dot: "●", label: "high", cls: "text-green-600" },
  medium: { dot: "◐", label: "medium", cls: "text-yellow-600" },
  low: { dot: "○", label: "low", cls: "text-gray-400" },
};

const ACTION_LABELS: Record<string, string> = {
  rewrite: "改写",
  delete: "删除",
  merge: "合并",
  reorder: "重排",
  format: "格式",
  verify: "核实",
  condense: "精简",
  add: "添加",
};

function CollapseBlock({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
      >
        <span className="transition-transform duration-150" style={{ transform: open ? "rotate(90deg)" : "none" }}>
          ▸
        </span>
        {label}
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-white/70 border border-slate-100 px-3 py-2.5 text-sm text-slate-600 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

export function CommentCard({ comment }: { comment: PmReviewComment }) {
  const status = comment.previousRoundStatus;
  const statusStyle = status ? STATUS_STYLES[status] : null;
  const conf = CONFIDENCE_STYLES[comment.confidence] ?? CONFIDENCE_STYLES.medium;

  return (
    <article
      className={`rounded-2xl border p-4 text-sm leading-relaxed transition-colors ${
        statusStyle ? statusStyle.card : "bg-white border-slate-100"
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {statusStyle && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle.badge}`}>
              {statusStyle.label}
            </span>
          )}
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600"
          >
            {ACTION_LABELS[comment.actionType] ?? comment.actionType}
          </span>
          {comment.needsConfirmation && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
              ⚠️ 需确认真实性
            </span>
          )}
        </div>
        <span className={`flex-shrink-0 text-sm font-semibold ${conf.cls}`} title={`confidence: ${conf.label}`}>
          {conf.dot}
        </span>
      </div>

      {/* Location */}
      <p className="text-xs font-bold text-amber-800 mb-2">📍 {comment.location}</p>

      {/* Anchor */}
      <div className="mb-3 px-3 py-2 rounded-xl bg-white/60 border border-slate-100">
        <span className="block text-xs font-semibold text-slate-400 mb-1">原文锚点</span>
        <code className="text-xs text-slate-600 font-mono leading-relaxed break-all">
          &ldquo;{comment.anchorText}&rdquo;
        </code>
      </div>

      {/* Issue */}
      <div className="mb-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">问题类型</span>
        <p className="mt-0.5 font-semibold text-slate-800">{comment.issueType}</p>
      </div>
      <p className="text-slate-700 mb-3">{comment.comment}</p>

      {/* Suggestion */}
      <div className="rounded-xl bg-white/80 border border-slate-100 px-3 py-2.5 mb-1">
        <span className="block text-xs font-bold text-slate-500 mb-1">建议</span>
        <p className="text-slate-700">{comment.suggestion}</p>
      </div>

      {/* Collapsible: example */}
      {comment.example && (
        <CollapseBlock label="改写示例">
          {comment.example}
        </CollapseBlock>
      )}

      {/* Collapsible: searchEvidence */}
      {comment.searchEvidence && (
        <CollapseBlock label="搜索参考">
          {comment.searchEvidence}
        </CollapseBlock>
      )}
    </article>
  );
}
