import { randomUUID } from "node:crypto";
import {
  deleteHomeworkReviewSourceFile,
  uploadHomeworkReviewSourceFile,
} from "@/lib/aliyun-oss";
import {
  getInterviewAudioTask,
  setInterviewAudioTask,
} from "@/lib/interview-review-audio-task-store";
import type {
  InterviewAudioTaskPayload,
  InterviewAudioTaskState,
} from "@/lib/interview-review-audio-types";
import {
  createTingwuOfflineTask,
  fetchTingwuTranscriptionText,
  getTingwuTaskInfo,
} from "@/lib/tingwu";

function nowIso() {
  return new Date().toISOString();
}

function buildTaskId() {
  return `ia_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function getNextPollDelayMs(task: InterviewAudioTaskState) {
  if (task.status === "transcribing") {
    return 15_000;
  }

  return undefined;
}

function toPayload(task: InterviewAudioTaskState): InterviewAudioTaskPayload {
  return {
    taskId: task.taskId,
    fileName: task.fileName,
    status: task.status,
    message: task.message,
    createdAt: task.createdAt,
    nextPollDelayMs: getNextPollDelayMs(task),
    transcribedText: task.transcribedText,
    error: task.error,
  };
}

async function cleanupSourceFile(task: InterviewAudioTaskState) {
  if (!task.ossObjectKey) {
    return;
  }

  try {
    await deleteHomeworkReviewSourceFile(task.ossObjectKey);
    task.ossObjectKey = undefined;
  } catch (error) {
    console.error("[interview-audio] 清理 OSS 文件失败", {
      taskId: task.taskId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function submitInterviewAudioTask(file: File) {
  const taskId = buildTaskId();
  const baseTask: InterviewAudioTaskState = {
    taskId,
    fileName: file.name,
    fileSize: file.size,
    status: "uploading",
    message: "正在上传录音文件",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    processing: false,
  };
  await setInterviewAudioTask(baseTask);

  const upload = await uploadHomeworkReviewSourceFile({
    file,
    taskId,
  });

  const tingwuTask = await createTingwuOfflineTask({
    fileUrl: upload.signedUrl,
    taskKey: taskId,
    diarizationEnabled: false,
    outputLevel: 1,
  });

  const task: InterviewAudioTaskState = {
    ...baseTask,
    status: "transcribing",
    message: "录音已上传，正在转写",
    updatedAt: nowIso(),
    tingwuTaskId: tingwuTask.taskId,
    tingwuTaskStatus: tingwuTask.taskStatus,
    ossObjectKey: upload.objectKey,
  };
  await setInterviewAudioTask(task);

  return toPayload(task);
}

async function syncInterviewAudioTask(task: InterviewAudioTaskState) {
  if (task.processing) {
    return task;
  }

  if (!task.tingwuTaskId) {
    throw new Error("任务缺少通义听悟 TaskId，无法继续查询");
  }

  task.processing = true;
  task.updatedAt = nowIso();
  await setInterviewAudioTask(task);

  try {
    const tingwuTask = await getTingwuTaskInfo(task.tingwuTaskId);
    task.tingwuTaskStatus = tingwuTask.taskStatus;
    task.transcriptionResultUrl =
      tingwuTask.transcriptionUrl || task.transcriptionResultUrl;

    if (tingwuTask.taskStatus === "FAILED") {
      task.status = "failed";
      task.message = "录音转写失败";
      task.error = tingwuTask.errorMessage || "录音转写失败";
      await cleanupSourceFile(task);
      await setInterviewAudioTask(task);
      return task;
    }

    if (tingwuTask.taskStatus !== "COMPLETED") {
      task.status = "transcribing";
      task.message = "录音转写中，请稍后";
      await setInterviewAudioTask(task);
      return task;
    }

    if (!task.transcriptionResultUrl) {
      task.status = "failed";
      task.message = "录音转写失败";
      task.error = "通义听悟已完成，但未返回转写结果";
      await cleanupSourceFile(task);
      await setInterviewAudioTask(task);
      return task;
    }

    task.transcribedText = await fetchTingwuTranscriptionText(task.transcriptionResultUrl, {
      includeSpeakerLabels: true,
    });
    task.status = "completed";
    task.message = "录音转写完成，请检查文本后再分析";
    task.error = undefined;
    await cleanupSourceFile(task);
    await setInterviewAudioTask(task);
    return task;
  } finally {
    task.processing = false;
    task.updatedAt = nowIso();
    await setInterviewAudioTask(task);
  }
}

export async function getInterviewAudioTaskPayload(taskId: string) {
  const task = await getInterviewAudioTask(taskId);

  if (!task) {
    throw new Error("转写任务不存在");
  }

  if (task.status === "uploading" || task.status === "transcribing") {
    const synced = await syncInterviewAudioTask(task);
    return toPayload(synced);
  }

  return toPayload(task);
}
