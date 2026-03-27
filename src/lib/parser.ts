import { z } from "zod";
import {
  NOTE_CATEGORIES,
  NOTE_CONFIDENCE,
  type ResumeTemplateDraft,
  type OptimizationNote,
} from "@/lib/types";

const noteSchema = z.object({
  category: z.enum(NOTE_CATEGORIES),
  point: z.string(),
  before: z.string(),
  after: z.string(),
  reason: z.string(),
  confidence: z.enum(NOTE_CONFIDENCE),
  needs_confirmation: z.boolean(),
});

const notesSchema = z.array(noteSchema);
const templateResumeSchema = z.object({
  personal: z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string(),
    age: z.string(),
    highestEducation: z.string(),
  }),
  educations: z.array(
    z.object({
      period: z.string(),
      school: z.string(),
      major: z.string(),
      degree: z.string(),
      coreCourses: z.string(),
      honors: z.string(),
      certificates: z.string(),
    }),
  ),
  professionalStrengths: z.object({
    summary: z.string(),
    skillLines: z.array(z.string()),
    coreQuality: z.string(),
  }),
  experiences: z.array(
    z.object({
      period: z.string(),
      company: z.string(),
      role: z.string(),
      companySummary: z.string(),
      responsibilities: z.array(z.string()),
      achievements: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({
      period: z.string(),
      name: z.string(),
      role: z.string(),
      summary: z.string(),
      highlights: z.array(z.string()),
    }),
  ),
  campusExperiences: z.array(
    z.object({
      mode: z.enum(["bullets", "detailed"]),
      period: z.string(),
      title: z.string(),
      role: z.string(),
      bullets: z.array(z.string()),
      background: z.string(),
      responsibilities: z.string(),
      result: z.string(),
    }),
  ),
});

export class ResumeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeParseError";
  }
}

export interface ParsedAiResponse {
  resume: ResumeTemplateDraft;
  notes: OptimizationNote[];
}

function extractSection(raw: string, start: string, end: string): string | null {
  const startIndex = raw.indexOf(start);
  const endIndex = raw.indexOf(end);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  return raw.slice(startIndex + start.length, endIndex).trim();
}

export function parseAIResponse(raw: string): ParsedAiResponse {
  const resume = extractSection(
    raw,
    "===RESUME_JSON_START===",
    "===RESUME_JSON_END===",
  );

  if (!resume) {
    throw new ResumeParseError("模型输出缺少模板简历分隔标记");
  }

  let parsedResume: ResumeTemplateDraft;

  try {
    const parsed = JSON.parse(resume) as unknown;
    const validated = templateResumeSchema.safeParse(parsed);

    if (!validated.success) {
      throw new ResumeParseError("模板简历 JSON 结构不合法");
    }

    parsedResume = validated.data;
  } catch (error) {
    if (error instanceof ResumeParseError) {
      throw error;
    }

    throw new ResumeParseError("模板简历 JSON 解析失败");
  }

  const notesRaw = extractSection(raw, "===NOTES_START===", "===NOTES_END===");

  if (!notesRaw) {
    return { resume: parsedResume, notes: [] };
  }

  try {
    const parsed = JSON.parse(notesRaw) as unknown;
    const validated = notesSchema.safeParse(parsed);

    if (!validated.success) {
      return { resume: parsedResume, notes: [] };
    }

    return { resume: parsedResume, notes: validated.data };
  } catch {
    return { resume: parsedResume, notes: [] };
  }
}
