import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PmReviewComment, ReviewSession, ReviewHistoryEntry } from "@/lib/types";

function getDataDir(): string {
  return process.env.REVIEW_DATA_DIR || "./data/review-sessions";
}

function generateSessionId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `s_${date}_${rand}`;
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function readSessionsIndex(): Promise<ReviewSession[]> {
  const indexPath = join(getDataDir(), "sessions.json");
  if (!existsSync(indexPath)) return [];
  try {
    const raw = await readFile(indexPath, "utf-8");
    return JSON.parse(raw) as ReviewSession[];
  } catch (e) {
    console.warn("[pm-review-history] sessions.json 解析失败", e);
    return [];
  }
}

async function writeSessionsIndex(sessions: ReviewSession[]): Promise<void> {
  const indexPath = join(getDataDir(), "sessions.json");
  await ensureDir(getDataDir());
  await writeFile(indexPath, JSON.stringify(sessions, null, 2), "utf-8");
}

export async function createSession(studentName: string): Promise<ReviewSession> {
  const id = generateSessionId();
  const now = new Date().toISOString();
  const session: ReviewSession = {
    id,
    studentName,
    createdAt: now,
    reviewCount: 0,
  };

  const sessionDir = join(getDataDir(), id);
  await ensureDir(sessionDir);
  await writeFile(join(sessionDir, "meta.json"), JSON.stringify(session, null, 2), "utf-8");
  await ensureDir(join(sessionDir, "reviews"));

  const sessions = await readSessionsIndex();
  sessions.push(session);
  await writeSessionsIndex(sessions);

  console.log("[pm-review-history] 创建会话", { id, studentName });
  return session;
}

export async function listSessions(): Promise<ReviewSession[]> {
  return readSessionsIndex();
}

export async function getSession(sessionId: string): Promise<ReviewSession | null> {
  const metaPath = join(getDataDir(), sessionId, "meta.json");
  if (!existsSync(metaPath)) return null;
  try {
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw) as ReviewSession;
  } catch (e) {
    console.warn("[pm-review-history] meta.json 解析失败", { sessionId, error: e });
    return null;
  }
}

export async function saveReviewResult(
  sessionId: string,
  resumeText: string,
  comments: PmReviewComment[],
): Promise<void> {
  const sessionDir = join(getDataDir(), sessionId);
  const metaPath = join(sessionDir, "meta.json");

  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`[pm-review-history] 会话不存在: ${sessionId}`);
  }

  const round = session.reviewCount + 1;
  const now = new Date().toISOString();

  const entry: ReviewHistoryEntry = {
    round,
    timestamp: now,
    resumeText,
    comments,
  };

  await ensureDir(join(sessionDir, "reviews"));
  await writeFile(
    join(sessionDir, "reviews", `${round}.json`),
    JSON.stringify(entry, null, 2),
    "utf-8",
  );

  const updatedSession: ReviewSession = {
    ...session,
    reviewCount: round,
    lastReviewAt: now,
  };
  await writeFile(metaPath, JSON.stringify(updatedSession, null, 2), "utf-8");

  const sessions = await readSessionsIndex();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx !== -1) {
    sessions[idx] = updatedSession;
  } else {
    sessions.push(updatedSession);
  }
  await writeSessionsIndex(sessions);

  console.log("[pm-review-history] 保存批阅结果", { sessionId, round, commentCount: comments.length });
}

export async function getReviewHistory(sessionId: string): Promise<ReviewHistoryEntry[]> {
  const session = await getSession(sessionId);
  if (!session || session.reviewCount === 0) return [];

  const entries: ReviewHistoryEntry[] = [];
  for (let round = 1; round <= session.reviewCount; round++) {
    const filePath = join(getDataDir(), sessionId, "reviews", `${round}.json`);
    if (!existsSync(filePath)) continue;
    try {
      const raw = await readFile(filePath, "utf-8");
      entries.push(JSON.parse(raw) as ReviewHistoryEntry);
    } catch (e) {
      console.warn("[pm-review-history] 批阅历史解析失败", { sessionId, round, error: e });
    }
  }
  return entries;
}

export async function getLatestReview(sessionId: string): Promise<ReviewHistoryEntry | null> {
  const session = await getSession(sessionId);
  if (!session || session.reviewCount === 0) return null;

  const filePath = join(getDataDir(), sessionId, "reviews", `${session.reviewCount}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as ReviewHistoryEntry;
  } catch (e) {
    console.warn("[pm-review-history] 最新批阅历史解析失败", { sessionId, error: e });
    return null;
  }
}
