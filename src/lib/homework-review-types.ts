export const HOMEWORK_REVIEW_TASK_STATUSES = [
  "uploading",
  "transcribing",
  "reviewing",
  "completed",
  "failed",
] as const;

export const HOMEWORK_REVIEW_GENERATION_MODES = [
  "llm",
  "fallback",
] as const;

export const HOMEWORK_REVIEW_TRANSCRIPTION_MODES = [
  "mock",
  "tingwu",
] as const;

export type HomeworkReviewTaskStatus =
  (typeof HOMEWORK_REVIEW_TASK_STATUSES)[number];
export type HomeworkReviewGenerationMode =
  (typeof HOMEWORK_REVIEW_GENERATION_MODES)[number];
export type HomeworkReviewTranscriptionMode =
  (typeof HOMEWORK_REVIEW_TRANSCRIPTION_MODES)[number];

export interface HomeworkQuestion {
  id: string;
  title: string;
  content: string;
  category: string;
  requiresStar: boolean;
  reviewFocus?: string[];
}

export interface HomeworkQuestionDraft {
  title: string;
  content: string;
  category?: string;
  requiresStar?: boolean;
  reviewFocus?: string[];
}

export interface HomeworkQuestionSummary {
  id: string;
  title: string;
  category: string;
  requiresStar: boolean;
  isCustom?: boolean;
}

export interface HomeworkReviewResult {
  evaluation: string;
  referenceSpeech: string;
  transcribedText: string;
  question: HomeworkQuestion;
  studentName: string;
  completedAt: string;
  reviewMode: HomeworkReviewGenerationMode;
  transcriptionMode: HomeworkReviewTranscriptionMode;
}

export interface HomeworkReviewTaskPayload {
  taskId: string;
  studentName: string;
  question: HomeworkQuestionSummary;
  fileName: string;
  status: HomeworkReviewTaskStatus;
  step: number;
  totalSteps: number;
  message: string;
  nextPollDelayMs?: number;
  isMock: boolean;
  createdAt: string;
  result?: HomeworkReviewResult;
  error?: string;
}

export interface HomeworkReviewTaskState {
  taskId: string;
  studentName: string;
  question: HomeworkQuestion;
  fileName: string;
  fileSize: number;
  status: HomeworkReviewTaskStatus;
  step: number;
  totalSteps: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  isMock: boolean;
  transcriptionMode: HomeworkReviewTranscriptionMode;
  reviewMode?: HomeworkReviewGenerationMode;
  transcribedText?: string;
  result?: HomeworkReviewResult;
  error?: string;
  transcriptionReadyAt?: number;
  reviewReadyAt?: number;
  processing: boolean;
  tingwuTaskId?: string;
  tingwuTaskStatus?: string;
  transcriptionResultUrl?: string;
  ossObjectKey?: string;
  sourceFileSignedUrlExpiresAt?: string;
  cleanedUpAt?: string;
}

export interface HomeworkReviewQuestionsResponse {
  success: true;
  questions: HomeworkQuestionSummary[];
}

export interface HomeworkReviewUpsertQuestionResponse {
  success: true;
  question: HomeworkQuestionSummary;
}

export interface HomeworkReviewSubmitResponse {
  success: true;
  task: HomeworkReviewTaskPayload;
}

export interface HomeworkReviewStatusResponse {
  success: true;
  task: HomeworkReviewTaskPayload;
}

export interface HomeworkReviewUploadPlanResponse {
  success: true;
  upload: {
    objectKey: string;
    uploadHeaders: Record<string, string>;
    uploadUrl: string;
    uploadUrlExpiresAt: string;
  };
}
