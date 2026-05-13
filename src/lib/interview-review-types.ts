import { z } from "zod";

export const INTERVIEW_QUESTION_TYPES = [
  "自我介绍类",
  "项目经历类",
  "项目细节追问类",
  "产品方法类",
  "行为面试类",
  "业务理解类",
  "数据分析类",
  "AI 产品类",
  "HR 综合类",
  "压力追问类",
  "其他",
] as const;

export const INTERVIEW_ANSWER_STATUSES = [
  "有效",
  "部分有效",
  "无效",
  "未回答/回答缺失",
  "材料不足，无法判断",
] as const;

export type InterviewQuestionType = (typeof INTERVIEW_QUESTION_TYPES)[number];
export type InterviewAnswerStatus = (typeof INTERVIEW_ANSWER_STATUSES)[number];

export interface InterviewReviewResume {
  id: string;
  filename: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  isDefault?: boolean;
}

export interface InterviewReviewRecordSummary {
  id: string;
  createdAt: string;
  targetRole: string;
  questionCount: number;
}

export interface InterviewReviewStudent {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  resumes: InterviewReviewResume[];
  reviews: InterviewReviewRecordSummary[];
}

export interface InterviewQaPair {
  id: string;
  question: string;
  answer: string;
  sourceSegmentIds: string[];
}

export interface InterviewReviewSummary {
  overallConclusion: string;
  mainProblems: string[];
  mainStrengths: string[];
  priorityTrainingFocus: string[];
}

export interface InterviewReviewItemAnalysis {
  coreIssue: string;
  whatWasAnsweredWell: string;
  whatWasMissing: string;
  knowledgeOrLogicIssues: string;
  resumeConsistency: string;
  jdMatch: string;
}

export interface InterviewReviewAdvice {
  improvementDirection: string;
  specificActions: string[];
}

export interface InterviewReviewItem {
  id: string;
  question: string;
  questionType: InterviewQuestionType;
  interviewerIntent: string;
  answerStatus: InterviewAnswerStatus;
  candidateAnswerSummary: string;
  answerEvidenceQuotes: string[];
  analysis: InterviewReviewItemAnalysis;
  advice: InterviewReviewAdvice;
  referenceAnswer: string;
  knowledgeSupplement: string;
  riskNotes: string[];
  nextPracticeQuestion: string;
}

export interface InterviewReviewResult {
  summary: InterviewReviewSummary;
  items: InterviewReviewItem[];
}

export interface InterviewReviewRecord {
  id: string;
  studentId: string;
  studentName: string;
  targetRole: string;
  resumeId?: string;
  resumeText: string;
  jdText: string;
  jdImageName?: string;
  qaPairs: InterviewQaPair[];
  rawQaText: string;
  result: InterviewReviewResult;
  createdAt: string;
}

export interface AnalyzeInterviewTextRequest {
  studentId: string;
  targetRole?: string;
  resumeId?: string;
  resumeText?: string;
  jdText?: string;
  jdImageDataUrl?: string;
  jdImageName?: string;
  rawQaText: string;
}

export interface AnalyzeInterviewTextResponse {
  success: true;
  review: InterviewReviewRecord;
}

export interface ExportInterviewReviewDocxRequest {
  review: InterviewReviewRecord;
}

export interface InterviewStudentsResponse {
  success: true;
  students: InterviewReviewStudent[];
}

export interface InterviewStudentResponse {
  success: true;
  student: InterviewReviewStudent;
}

export const interviewQaPairSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string(),
  sourceSegmentIds: z.array(z.string()).default([]),
});

export const interviewReviewResultSchema = z.object({
  summary: z.object({
    overallConclusion: z.string().min(1),
    mainProblems: z.array(z.string()),
    mainStrengths: z.array(z.string()),
    priorityTrainingFocus: z.array(z.string()),
  }),
  items: z.array(
    z.object({
      id: z.string().min(1),
      question: z.string().min(1),
      questionType: z.enum(INTERVIEW_QUESTION_TYPES),
      interviewerIntent: z.string().min(1),
      answerStatus: z.enum(INTERVIEW_ANSWER_STATUSES),
      candidateAnswerSummary: z.string().min(1),
      answerEvidenceQuotes: z.array(z.string()),
      analysis: z.object({
        coreIssue: z.string().min(1),
        whatWasAnsweredWell: z.string().min(1),
        whatWasMissing: z.string().min(1),
        knowledgeOrLogicIssues: z.string().min(1),
        resumeConsistency: z.string().min(1),
        jdMatch: z.string().min(1),
      }),
      advice: z.object({
        improvementDirection: z.string().min(1),
        specificActions: z.array(z.string()),
      }),
      referenceAnswer: z.string().min(1),
      knowledgeSupplement: z.string().min(1),
      riskNotes: z.array(z.string()),
      nextPracticeQuestion: z.string().min(1),
    }),
  ),
});
