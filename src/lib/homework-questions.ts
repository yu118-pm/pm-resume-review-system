import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { get, put } from "@vercel/blob";
import type {
  HomeworkQuestion,
  HomeworkQuestionDraft,
  HomeworkQuestionSummary,
} from "@/lib/homework-review-types";

const HOMEWORK_QUESTIONS: HomeworkQuestion[] = [];
const STORE_VERSION = 1;
const DEFAULT_BLOB_PATH = "homework-review/questions.json";
const FILE_BACKEND = "file";
const BLOB_BACKEND = "blob";

type HomeworkQuestionStorageBackend = typeof FILE_BACKEND | typeof BLOB_BACKEND;

interface HomeworkQuestionStorePayload {
  version: number;
  updatedAt: string;
  questions: HomeworkQuestion[];
}

let writeQueue = Promise.resolve();

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: string | undefined) {
  return value?.trim() ?? "";
}

function normalizeReviewFocus(reviewFocus: string[] | undefined) {
  const normalized = reviewFocus
    ?.map((item) => item.trim())
    .filter(Boolean);

  return normalized && normalized.length > 0 ? normalized : undefined;
}

function toQuestionSummary(question: HomeworkQuestion, isCustom: boolean): HomeworkQuestionSummary {
  return {
    id: question.id,
    title: question.title,
    category: question.category,
    requiresStar: question.requiresStar,
    isCustom,
  };
}

function isValidQuestion(input: unknown): input is HomeworkQuestion {
  return Boolean(
    input &&
      typeof input === "object" &&
      typeof (input as HomeworkQuestion).id === "string" &&
      typeof (input as HomeworkQuestion).title === "string" &&
      typeof (input as HomeworkQuestion).content === "string" &&
      typeof (input as HomeworkQuestion).category === "string" &&
      typeof (input as HomeworkQuestion).requiresStar === "boolean",
  );
}

function sanitizeStoredQuestion(question: HomeworkQuestion) {
  const title = normalizeText(question.title);
  const content = normalizeText(question.content);
  const category = normalizeText(question.category);

  if (!question.id || !title || !content || !category) {
    return null;
  }

  return {
    id: question.id,
    title,
    content,
    category,
    requiresStar: Boolean(question.requiresStar),
    reviewFocus: normalizeReviewFocus(question.reviewFocus),
  } satisfies HomeworkQuestion;
}

function normalizeStoreQuestions(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  const deduped = new Map<string, HomeworkQuestion>();

  for (const item of input) {
    if (!isValidQuestion(item)) {
      continue;
    }

    const sanitized = sanitizeStoredQuestion(item);

    if (sanitized) {
      deduped.set(sanitized.id, sanitized);
    }
  }

  return [...deduped.values()];
}

function parseStorePayload(raw: string) {
  try {
    const parsed = JSON.parse(raw) as HomeworkQuestionStorePayload | HomeworkQuestion[];

    if (Array.isArray(parsed)) {
      return normalizeStoreQuestions(parsed);
    }

    return normalizeStoreQuestions(parsed.questions);
  } catch (error) {
    console.warn("[homework-questions] 题库文件解析失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function buildStorePayload(questions: HomeworkQuestion[]) {
  return {
    version: STORE_VERSION,
    updatedAt: nowIso(),
    questions,
  } satisfies HomeworkQuestionStorePayload;
}

function resolveDefaultQuestionsFilePath() {
  if (isVercelRuntime()) {
    return "/tmp/homework-review/questions.json";
  }

  return "./data/homework-review/questions.json";
}

function resolveQuestionsFilePath() {
  return readEnv("HOMEWORK_QUESTION_FILE_PATH") || resolveDefaultQuestionsFilePath();
}

function resolveBlobPath() {
  return readEnv("HOMEWORK_QUESTION_BLOB_PATH") || DEFAULT_BLOB_PATH;
}

function resolveStorageBackend(): HomeworkQuestionStorageBackend {
  const configured = readEnv("HOMEWORK_QUESTION_STORAGE").toLowerCase();

  if (configured === BLOB_BACKEND || configured === FILE_BACKEND) {
    return configured;
  }

  if (isVercelRuntime()) {
    return BLOB_BACKEND;
  }

  return readEnv("BLOB_READ_WRITE_TOKEN") ? BLOB_BACKEND : FILE_BACKEND;
}

function buildCustomQuestionId(draft: HomeworkQuestionDraft) {
  const hash = createHash("sha1");
  hash.update(normalizeText(draft.title));
  hash.update("\n---\n");
  hash.update(normalizeText(draft.content));
  return `custom_${hash.digest("hex").slice(0, 16)}`;
}

function mergeQuestions(questions: HomeworkQuestion[]) {
  const merged = new Map<string, HomeworkQuestion>();

  for (const question of HOMEWORK_QUESTIONS) {
    merged.set(question.id, question);
  }

  for (const question of questions) {
    merged.set(question.id, question);
  }

  return [...merged.values()];
}

async function ensureParentDir(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function readQuestionsFromFileStore() {
  const filePath = resolveQuestionsFilePath();

  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const raw = await readFile(filePath, "utf-8");
    return parseStorePayload(raw);
  } catch (error) {
    console.warn("[homework-questions] 读取文件题库失败", {
      error: error instanceof Error ? error.message : String(error),
      filePath,
    });
    return [];
  }
}

async function writeQuestionsToFileStore(questions: HomeworkQuestion[]) {
  const filePath = resolveQuestionsFilePath();

  await ensureParentDir(filePath);
  await writeFile(filePath, JSON.stringify(buildStorePayload(questions), null, 2), "utf-8");
}

async function readQuestionsFromBlobStore() {
  const token = readEnv("BLOB_READ_WRITE_TOKEN");

  if (!token) {
    if (isVercelRuntime()) {
      console.warn(
        "[homework-questions] 当前 Vercel 环境未配置 BLOB_READ_WRITE_TOKEN，题库无法读取持久化数据",
      );
    }
    return [];
  }

  const blob = await get(resolveBlobPath(), {
    access: "private",
    token,
    useCache: false,
  });

  if (!blob || blob.statusCode !== 200) {
    return [];
  }

  try {
    const raw = await new Response(blob.stream).text();
    return parseStorePayload(raw);
  } catch (error) {
    console.warn("[homework-questions] 读取 Blob 题库失败", {
      error: error instanceof Error ? error.message : String(error),
      pathname: resolveBlobPath(),
    });
    return [];
  }
}

async function writeQuestionsToBlobStore(questions: HomeworkQuestion[]) {
  const token = readEnv("BLOB_READ_WRITE_TOKEN");

  if (!token) {
    throw new Error(
      "当前环境未配置 BLOB_READ_WRITE_TOKEN，无法在服务端持久化自定义题目",
    );
  }

  await put(
    resolveBlobPath(),
    JSON.stringify(buildStorePayload(questions), null, 2),
    {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
      token,
    },
  );
}

async function readPersistedQuestions() {
  const backend = resolveStorageBackend();

  return backend === BLOB_BACKEND
    ? readQuestionsFromBlobStore()
    : readQuestionsFromFileStore();
}

async function writePersistedQuestions(questions: HomeworkQuestion[]) {
  const backend = resolveStorageBackend();

  if (backend === BLOB_BACKEND) {
    await writeQuestionsToBlobStore(questions);
    return;
  }

  await writeQuestionsToFileStore(questions);
}

function withWriteLock<T>(operation: () => Promise<T>) {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function createCustomHomeworkQuestion(
  draft: HomeworkQuestionDraft,
  questionId = buildCustomQuestionId(draft),
): HomeworkQuestion {
  return {
    id: questionId,
    title: normalizeText(draft.title),
    content: normalizeText(draft.content),
    category: normalizeText(draft.category) || "自定义题目",
    requiresStar: Boolean(draft.requiresStar),
    reviewFocus: normalizeReviewFocus(draft.reviewFocus),
  };
}

export async function listHomeworkQuestions(): Promise<HomeworkQuestionSummary[]> {
  const persistedQuestions = await readPersistedQuestions();

  return mergeQuestions(persistedQuestions).map((question) =>
    toQuestionSummary(question, question.id.startsWith("custom_")),
  );
}

export async function getHomeworkQuestionById(questionId: string) {
  const presetQuestion = HOMEWORK_QUESTIONS.find((question) => question.id === questionId);

  if (presetQuestion) {
    return presetQuestion;
  }

  const persistedQuestions = await readPersistedQuestions();
  return persistedQuestions.find((question) => question.id === questionId) ?? null;
}

export async function upsertHomeworkQuestion(draft: HomeworkQuestionDraft) {
  const question = createCustomHomeworkQuestion(draft);

  return withWriteLock(async () => {
    const currentQuestions = await readPersistedQuestions();
    const existingIndex = currentQuestions.findIndex(
      (item) =>
        item.id === question.id ||
        (item.title === question.title && item.content === question.content),
    );
    const nextQuestions =
      existingIndex === -1
        ? [question, ...currentQuestions]
        : currentQuestions.map((item, index) =>
            index === existingIndex ? question : item,
          );

    await writePersistedQuestions(nextQuestions);
    return question;
  });
}
