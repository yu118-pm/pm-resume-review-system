import type { HomeworkReviewTaskState } from "@/lib/homework-review-types";

declare global {
  var __homeworkReviewTaskStore: Map<string, HomeworkReviewTaskState> | undefined;
}

const taskStore =
  globalThis.__homeworkReviewTaskStore ??
  new Map<string, HomeworkReviewTaskState>();

if (!globalThis.__homeworkReviewTaskStore) {
  globalThis.__homeworkReviewTaskStore = taskStore;
}

export function getHomeworkReviewTask(taskId: string) {
  return taskStore.get(taskId) ?? null;
}

export function setHomeworkReviewTask(task: HomeworkReviewTaskState) {
  taskStore.set(task.taskId, task);
  return task;
}
