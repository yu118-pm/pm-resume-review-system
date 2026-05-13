import type { InterviewAudioTaskState } from "@/lib/interview-review-audio-types";

declare global {
  var __interviewAudioTaskStore: Map<string, InterviewAudioTaskState> | undefined;
}

const taskStore =
  globalThis.__interviewAudioTaskStore ?? new Map<string, InterviewAudioTaskState>();

if (!globalThis.__interviewAudioTaskStore) {
  globalThis.__interviewAudioTaskStore = taskStore;
}

export function getInterviewAudioTask(taskId: string) {
  return taskStore.get(taskId) ?? null;
}

export function setInterviewAudioTask(task: InterviewAudioTaskState) {
  taskStore.set(task.taskId, task);
  return task;
}
