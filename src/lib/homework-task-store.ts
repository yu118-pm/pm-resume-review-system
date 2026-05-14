import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { get, put } from "@vercel/blob";
import type { HomeworkReviewTaskState } from "@/lib/homework-review-types";

const FILE_BACKEND = "file";
const BLOB_BACKEND = "blob";

type HomeworkTaskStorageBackend = typeof FILE_BACKEND | typeof BLOB_BACKEND;

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function resolveDefaultTaskFilePath(taskId: string) {
  if (isVercelRuntime()) {
    return `/tmp/homework-review/tasks/${taskId}.json`;
  }

  return `./data/homework-review/tasks/${taskId}.json`;
}

function resolveTaskFilePath(taskId: string) {
  const basePath = readEnv("HOMEWORK_REVIEW_TASK_FILE_PATH");
  return basePath
    ? `${basePath.replace(/\/$/, "")}/${taskId}.json`
    : resolveDefaultTaskFilePath(taskId);
}

function resolveBlobPath(taskId: string) {
  const basePath = readEnv("HOMEWORK_REVIEW_TASK_BLOB_PATH") || "homework-review/tasks";
  return `${basePath.replace(/\/$/, "")}/${taskId}.json`;
}

function resolveStorageBackend(): HomeworkTaskStorageBackend {
  const configured = readEnv("HOMEWORK_REVIEW_TASK_STORAGE").toLowerCase();

  if (configured === BLOB_BACKEND || configured === FILE_BACKEND) {
    return configured;
  }

  if (isVercelRuntime()) {
    return BLOB_BACKEND;
  }

  return readEnv("BLOB_READ_WRITE_TOKEN") ? BLOB_BACKEND : FILE_BACKEND;
}

async function ensureParentDir(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function readTaskFromFileStore(taskId: string) {
  const filePath = resolveTaskFilePath(taskId);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as HomeworkReviewTaskState;
  } catch (error) {
    console.warn("[homework-task-store] 读取文件任务失败", {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function writeTaskToFileStore(task: HomeworkReviewTaskState) {
  const filePath = resolveTaskFilePath(task.taskId);
  await ensureParentDir(filePath);
  await writeFile(filePath, JSON.stringify(task, null, 2), "utf-8");
}

async function readTaskFromBlobStore(taskId: string) {
  const token = readEnv("BLOB_READ_WRITE_TOKEN");

  if (!token) {
    return null;
  }

  const blob = await get(resolveBlobPath(taskId), {
    access: "private",
    token,
    useCache: false,
  });

  if (!blob || blob.statusCode !== 200) {
    return null;
  }

  try {
    const raw = await new Response(blob.stream).text();
    return JSON.parse(raw) as HomeworkReviewTaskState;
  } catch (error) {
    console.warn("[homework-task-store] 读取 Blob 任务失败", {
      taskId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function writeTaskToBlobStore(task: HomeworkReviewTaskState) {
  const token = readEnv("BLOB_READ_WRITE_TOKEN");

  if (!token) {
    throw new Error("当前环境未配置 BLOB_READ_WRITE_TOKEN，无法持久化作业批阅任务");
  }

  await put(resolveBlobPath(task.taskId), JSON.stringify(task, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    token,
  });
}

export async function getHomeworkReviewTask(taskId: string) {
  const backend = resolveStorageBackend();

  return backend === BLOB_BACKEND
    ? readTaskFromBlobStore(taskId)
    : readTaskFromFileStore(taskId);
}

export async function setHomeworkReviewTask(task: HomeworkReviewTaskState) {
  const backend = resolveStorageBackend();

  if (backend === BLOB_BACKEND) {
    await writeTaskToBlobStore(task);
    return task;
  }

  await writeTaskToFileStore(task);
  return task;
}
