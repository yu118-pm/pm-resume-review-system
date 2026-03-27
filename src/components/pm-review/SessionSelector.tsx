"use client";

import { useEffect, useState } from "react";
import type { ReviewSession } from "@/lib/types";

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

export function SessionSelector({ onSelect }: { onSelect: (session: ReviewSession) => void }) {
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);
    try {
      const res = await fetch("/api/review-sessions");
      const data = (await res.json()) as { sessions: ReviewSession[] } | { success: false; error: string };
      if (!res.ok || !("sessions" in data)) {
        throw new Error("sessions" in data ? "加载失败" : (data as { success: false; error: string }).error);
      }
      setSessions(data.sessions.slice().reverse());
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载会话列表失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/review-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName: name }),
      });
      const data = (await res.json()) as { session: ReviewSession } | { success: false; error: string };
      if (!res.ok || !("session" in data)) {
        throw new Error("session" in data ? "创建失败" : (data as { success: false; error: string }).error);
      }
      setNewName("");
      onSelect(data.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建会话失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-bold tracking-widest uppercase text-amber-800 mb-1">PM Resume Review</p>
        <h3 className="text-2xl font-bold text-slate-800 m-0 tracking-tight">选择学员会话</h3>
        <p className="text-sm text-slate-500 mt-1">每位学员独立会话，自动记录多轮批阅历史</p>
      </div>

      {/* Create new */}
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 mb-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">新建会话</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            placeholder="输入学员姓名..."
            className="flex-1 h-10 px-4 rounded-full border border-slate-200 bg-white text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
            disabled={creating}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="h-10 px-5 rounded-full bg-blue-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-blue-700 transition-colors"
          >
            {creating ? "创建中..." : "创建"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Session list */}
      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-white/60 border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="min-h-32 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 p-6">
          <p className="text-sm font-semibold text-slate-500">暂无会话</p>
          <p className="text-xs text-slate-400">新建一个会话开始批阅</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelect(session)}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-slate-100 bg-white/70 hover:bg-blue-50 hover:border-blue-200 text-left transition-colors group"
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold text-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                {session.studentName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 m-0 truncate">{session.studentName}</p>
                <p className="text-xs text-slate-400 m-0 mt-0.5">
                  {session.lastReviewAt
                    ? `最近批阅：${formatDate(session.lastReviewAt)}`
                    : "尚未批阅"}
                </p>
              </div>
              {session.reviewCount > 0 && (
                <span className="flex-shrink-0 min-w-[28px] h-6 px-2 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                  {session.reviewCount}
                </span>
              )}
              <span className="text-slate-300 text-sm flex-shrink-0">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
