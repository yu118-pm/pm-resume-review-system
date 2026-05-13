import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  InterviewReviewRecord,
  InterviewReviewRecordSummary,
  InterviewReviewResume,
  InterviewReviewStudent,
} from "@/lib/interview-review-types";

function resolveDefaultDataDir(): string {
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    return "/tmp/interview-review";
  }

  return "./data/interview-review";
}

function getDataDir() {
  return process.env.INTERVIEW_REVIEW_DATA_DIR || resolveDefaultDataDir();
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
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

async function readStudentsIndex(): Promise<InterviewReviewStudent[]> {
  const indexPath = getIndexPath();

  if (!existsSync(indexPath)) {
    return [];
  }

  try {
    const raw = await readFile(indexPath, "utf-8");
    return JSON.parse(raw) as InterviewReviewStudent[];
  } catch (error) {
    console.warn("[interview-review-store] students.json 解析失败", error);
    return [];
  }
}

async function writeStudentsIndex(students: InterviewReviewStudent[]) {
  await ensureDir(getDataDir());
  await writeFile(getIndexPath(), JSON.stringify(students, null, 2), "utf-8");
}

async function writeStudentMeta(student: InterviewReviewStudent) {
  await ensureDir(getStudentDir(student.id));
  await ensureDir(getReviewDir(student.id));
  await writeFile(getStudentMetaPath(student.id), JSON.stringify(student, null, 2), "utf-8");
}

export async function listInterviewStudents() {
  return readStudentsIndex();
}

export async function getInterviewStudent(studentId: string) {
  const metaPath = getStudentMetaPath(studentId);

  if (!existsSync(metaPath)) {
    return null;
  }

  try {
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw) as InterviewReviewStudent;
  } catch (error) {
    console.warn("[interview-review-store] meta.json 解析失败", { studentId, error });
    return null;
  }
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

  const students = await readStudentsIndex();
  students.push(student);
  await writeStudentsIndex(students);
  await writeStudentMeta(student);

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

  const students = await readStudentsIndex();
  const index = students.findIndex((item) => item.id === updated.id);

  if (index >= 0) {
    students[index] = updated;
  } else {
    students.push(updated);
  }

  await writeStudentsIndex(students);
  await writeStudentMeta(updated);

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

  await ensureDir(getReviewDir(record.studentId));
  await writeFile(
    join(getReviewDir(record.studentId), `${record.id}.json`),
    JSON.stringify(record, null, 2),
    "utf-8",
  );

  const updatedStudent: InterviewReviewStudent = {
    ...student,
    updatedAt: record.createdAt,
    reviews: [...student.reviews, summary],
  };

  const students = await readStudentsIndex();
  const index = students.findIndex((item) => item.id === updatedStudent.id);

  if (index >= 0) {
    students[index] = updatedStudent;
  } else {
    students.push(updatedStudent);
  }

  await writeStudentsIndex(students);
  await writeStudentMeta(updatedStudent);

  return record;
}
