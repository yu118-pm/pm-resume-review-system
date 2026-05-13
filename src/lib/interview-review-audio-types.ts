export const INTERVIEW_AUDIO_TASK_STATUSES = [
  "uploading",
  "transcribing",
  "completed",
  "failed",
] as const;

export type InterviewAudioTaskStatus =
  (typeof INTERVIEW_AUDIO_TASK_STATUSES)[number];

export interface InterviewAudioTaskPayload {
  taskId: string;
  fileName: string;
  status: InterviewAudioTaskStatus;
  message: string;
  createdAt: string;
  nextPollDelayMs?: number;
  transcribedText?: string;
  error?: string;
}

export interface InterviewAudioTaskState extends InterviewAudioTaskPayload {
  fileSize: number;
  updatedAt: string;
  processing: boolean;
  tingwuTaskId?: string;
  tingwuTaskStatus?: string;
  transcriptionResultUrl?: string;
  ossObjectKey?: string;
}

export interface InterviewAudioSubmitResponse {
  success: true;
  task: InterviewAudioTaskPayload;
}

export interface InterviewAudioStatusResponse {
  success: true;
  task: InterviewAudioTaskPayload;
}
