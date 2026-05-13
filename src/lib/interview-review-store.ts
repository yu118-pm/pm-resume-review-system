import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { get, put } from "@vercel/blob";
import type {
  InterviewReviewRecord,
  InterviewReviewRecordSummary,
  InterviewReviewResume,
  InterviewReviewStudent,
} from "@/lib/interview-review-types";

const STORE_VERSION = 1;
const FILE_BACKEND = "file";
const BLOB_BACKEND = "blob";
const DEFAULT_BLOB_BASE_PATH = "interview-review";

type InterviewReviewStorageBackend = typeof FILE_BACKEND | typeof BLOB_BACKEND;

interface InterviewStudentIndexPayload {
  version: number;
  updatedAt: string;
  students: InterviewReviewStudent[];
}

let writeQueue = Promise.resolve();

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function resolveDefaultDataDir(): string {
  if (isVercelRuntime()) {
    return "/tmp/interview-review";
  }

  return "./data/interview-review";
}

function getDataDir() {
  return process.env.INTERVIEW_REVIEW_DATA_DIR || resolveDefaultDataDir();
}

function resolveBlobBasePath() {
  return readEnv("INTERVIEW_REVIEW_BLOB_PATH") || DEFAULT_BLOB_BASE_PATH;
}

function resolveStorageBackend(): InterviewReviewStorageBackend {
  const configured = readEnv("INTERVIEW_REVIEW_STORAGE").toLowerCase();

  if (configured === FILE_BACKEND || configured === BLOB_BACKEND) {
    return configured;
  }

  if (isVercelRuntime()) {
    return BLOB_BACKEND;
  }

  return readEnv("BLOB_READ_WRITE_TOKEN") ? BLOB_BACKEND : FILE_BACKEND;
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

async function ensureParentDir(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${date}_${rand}`;
}

function getIndexPath() {
  return join(getDataDir(), "students.json");
}

function getStudentDir(studentId: string) {
  return join(getDataDir(), studentId);
}

function getStudentMetaPath(studentId: string) {
  return join(getStudentDir(studentId), "meta.json");
}

function getReviewDir(studentId: string) {
  return join(getStudentDir(studentId), "reviews");
}

function resolveStudentMetaBlobPath(studentId: string) {
  return `${resolveBlobBasePath().replace(/\/$/, "")}/students/${studentId}/meta.json`;
}

function resolveStudentIndexBlobPath() {
  return `${resolveBlobBasePath().replace(/\/$/, "")}/students/index.json`;
}

function resolveReviewBlobPath(studentId: string, reviewId: string) {
  return `${resolveBlobBasePath().replace(/\/$/, "")}/students/${studentId}/reviews/${reviewId}.json`;
}

function buildStudentIndexPayload(students: InterviewReviewStudent[]) {
  return {
    version: STORE_VERSION,
    updatedAt: nowIso(),
    students,
  } satisfies InterviewStudentIndexPayload;
}

function parseStudentIndexPayload(raw: string) {
  try {
    const parsed = JSON.parse(raw) as InterviewStudentIndexPayload | InterviewReviewStudent[];
    const students = Array.isArray(parsed) ? parsed : parsed.students;
    return Array.isArray(students) ? students : [];
  } catch (error) {
    console.warn("[interview-review-store] students.json 解析失败", error);
    return [];
  }
}

async function readStudentsIndexFromFileStore(): Promise<InterviewReviewStudent[]> {
  const indexPath = getIndexPath();

  if (!existsSync(indexPath)) {
    return [];
  }

  try {
    const raw = await readFile(indexPath, "utf-8");
    return parseStudentIndexPayload(raw);
  } catch (error) {
    console.warn("[interview-review-store] 读取文件学员列表失败", error);
    return [];
  }
}

async function writeStudentsIndexToFileStore(students: InterviewReviewStudent[]) {
  await ensureDir(getDataDir());
  await writeFile(getIndexPath(), JSON.stringify(buildStudentIndexPayload(students), null, 2), "utf-8");
}

async function writeStudentMetaToFileStore(student: InterviewReviewStudent) {
  await ensureDir(getStudentDir(student.id));
  await ensureDir(getReviewDir(student.id));
  await writeFile(getStudentMetaPath(student.id), JSON.stringify(student, null, 2), "utf-8");
}

async function readStudentMetaFromFileStore(studentId: string) {
  const metaPath = getStudentMetaPath(studentId);

  if (!existsSync(metaPath)) {
    return null;
  }

  try {
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw) as InterviewReviewStudent;
  } catch (error) {
    console.warn("[interview-review-store] 读取文件学员详情失败", { studentId, error });
    return null;
  }
}

async function writeReviewToFileStore(record: InterviewReviewRecord) {
  const reviewPath = join(getReviewDir(record.studentId), `${record.id}.json`);
  await ensureParentDir(reviewPath);
  await writeFile(reviewPath, JSON.stringify(record, null, 2), "utf-8");
}

async function readStudentsIndexFromBlobStore() {
  const token = readEnv("BLOB_READ_WRITE_TOKEN");

  if (!token) {
    if (isVercelRuntime()) {
      console.warn("[interview-review-store] 当前环境未配置 BLOB_READ_WRITE_TOKEN，无法读取学员库");
    }
    return [];
  }

  const blob = await get(resolveStudentIndexBlobPath(), {
    access: "private",
    token,
    useCache: false,
  });

  if (!blob || blob.statusCode !== 200) {
    return [];
  }

  try {
    const raw = await new Response(blob.stream).text();
    return parseStudentIndexPayload(raw);
  } catch (error) {
    console.warn("[interview-review-store] 读取 Blob 学员列表失败", error);
    return [];
  }
}

async function writeStudentsIndexToBlobStore(students: InterviewReviewStudent[]) {
  const token = readEnv("BLOB_READ_WRITE_TOKEN");

  if (!token) {
    throw new Error("当前环境未配置 BLOB_READ_WRITE_TOKEN，无法持久化学员库");
  }

  await put(resolveStudentIndexBlobPath(), JSON.stringify(buildStudentIndexPayload(students), null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    token,
  });
}

async function readStudentMetaFromBlobStore(studentId: string) {
  const token = readEnv("BLOB_READ_WRITE_TOKEN");

  if (!token) {
    return null;
  }

  const blob = await get(resolveStudentMetaBlobPath(studentId), {
    access: "private",
    token,
    useCache: false,
  });

  if (!blob || blob.statusCode !== 200) {
    return null;
  }

  try {
    const raw = await new Response(blob.stream).text();
    return JSON.parse(raw) as InterviewReviewStudent;
  } catch (error) {
    console.warn("[interview-review-store] 读取 Blob 学员详情失败", { studentId, error });
    return null;
  }
}

async function writeStudentMetaToBlobStore(student: InterviewReviewStudent) {
  const token = readEnv("BLOB_READ_WRITE_TOKEN");

  if (!token) {
    throw new Error("当前环境未配置 BLOB_READ_WRITE_TOKEN，无法持久化学员详情");
  }

  await put(resolveStudentMetaBlobPath(student.id), JSON.stringify(student, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    token,
  });
}

async function writeReviewToBlobStore(record: InterviewReviewRecord) {
  const token = readEnv("BLOB_READ_WRITE_TOKEN");

  if (!token) {
    throw new Error("当前环境未配置 BLOB_READ_WRITE_TOKEN，无法持久化复盘记录");
  }

  await put(resolveReviewBlobPath(record.studentId, record.id), JSON.stringify(record, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    token,
  });
}

async function readStudentsIndex() {
  const backend = resolveStorageBackend();
  return backend === BLOB_BACKEND
    ? readStudentsIndexFromBlobStore()
    : readStudentsIndexFromFileStore();
}

async function writeStudentsIndex(students: InterviewReviewStudent[]) {
  const backend = resolveStorageBackend();

  if (backend === BLOB_BACKEND) {
    await writeStudentsIndexToBlobStore(students);
    return;
  }

  await writeStudentsIndexToFileStore(students);
}

async function readStudentMeta(studentId: string) {
  const backend = resolveStorageBackend();

  if (backend === BLOB_BACKEND) {
    return readStudentMetaFromBlobStore(studentId);
  }

  return readStudentMetaFromFileStore(studentId);
}

async function writeStudentMeta(student: InterviewReviewStudent) {
  const backend = resolveStorageBackend();

  if (backend === BLOB_BACKEND) {
    await writeStudentMetaToBlobStore(student);
    return;
  }

  await writeStudentMetaToFileStore(student);
}

async function writeReview(record: InterviewReviewRecord) {
  const backend = resolveStorageBackend();

  if (backend === BLOB_BACKEND) {
    await writeReviewToBlobStore(record);
    return;
  }

  await writeReviewToFileStore(record);
}

async function updateStudents(
  updater: (students: InterviewReviewStudent[]) => Promise<InterviewReviewStudent[]> | InterviewReviewStudent[],
) {
  writeQueue = writeQueue.then(async () => {
    const current = await readStudentsIndex();
    const next = await updater(current);
    await writeStudentsIndex(next);
  });

  await writeQueue;
}

export async function listInterviewStudents() {
  return readStudentsIndex();
}

export async function getInterviewStudent(studentId: string) {
  const meta = await readStudentMeta(studentId);

  if (meta) {
    return meta;
  }

  const students = await readStudentsIndex();
  return students.find((item) => item.id === studentId) ?? null;
}

export async function createInterviewStudent(name: string) {
  const now = nowIso();
  const student: InterviewReviewStudent = {
    id: randomId("stu"),
    name,
    createdAt: now,
    updatedAt: now,
    resumes: [],
    reviews: [],
  };

  await updateStudents(async (students) => {
    const next = [...students, student];
    await writeStudentMeta(student);
    return next;
  });

  return student;
}

export async function saveInterviewResume(input: {
  studentId: string;
  filename: string;
  text: string;
}) {
  const student = await getInterviewStudent(input.studentId);

  if (!student) {
    throw new Error("学员不存在");
  }

  const now = nowIso();
  const resume: InterviewReviewResume = {
    id: randomId("resume"),
    filename: input.filename,
    text: input.text,
    createdAt: now,
    updatedAt: now,
    isDefault: student.resumes.length === 0,
  };

  const nextResumes = student.resumes.map((item) => ({
    ...item,
    isDefault: false,
  }));

  const updated: InterviewReviewStudent = {
    ...student,
    updatedAt: now,
    resumes: [...nextResumes, resume],
  };

  await updateStudents(async (students) => {
    const index = students.findIndex((item) => item.id === updated.id);
    const next = [...students];

    if (index >= 0) {
      next[index] = updated;
    } else {
      next.push(updated);
    }

    await writeStudentMeta(updated);
    return next;
  });

  return { student: updated, resume };
}

export async function saveInterviewReview(
  input: Omit<InterviewReviewRecord, "id" | "createdAt">,
) {
  const student = await getInterviewStudent(input.studentId);

  if (!student) {
    throw new Error("学员不存在");
  }

  const record: InterviewReviewRecord = {
    ...input,
    id: randomId("review"),
    createdAt: nowIso(),
  };

  const summary: InterviewReviewRecordSummary = {
    id: record.id,
    createdAt: record.createdAt,
    targetRole: record.targetRole,
    questionCount: record.qaPairs.length,
  };

  const updatedStudent: InterviewReviewStudent = {
    ...student,
    updatedAt: record.createdAt,
    reviews: [...student.reviews, summary],
  };

  await updateStudents(async (students) => {
    const index = students.findIndex((item) => item.id === updatedStudent.id);
    const next = [...students];

    if (index >= 0) {
      next[index] = updatedStudent;
    } else {
      next.push(updatedStudent);
    }

    await Promise.all([writeReview(record), writeStudentMeta(updatedStudent)]);
    return next;
  });

  return record;
}
