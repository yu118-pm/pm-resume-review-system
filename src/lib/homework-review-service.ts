import { randomUUID } from "node:crypto";
import { deleteHomeworkReviewSourceFile, uploadHomeworkReviewSourceFile } from "@/lib/aliyun-oss";
import {
  getHomeworkQuestionById,
  upsertHomeworkQuestion,
} from "@/lib/homework-questions";
import {
  buildFallbackHomeworkReview,
  buildHomeworkReviewUserPrompt,
  HOMEWORK_REVIEW_SYSTEM_PROMPT,
  parseHomeworkReviewResult,
} from "@/lib/homework-review-prompts";
import { getHomeworkReviewTask, setHomeworkReviewTask } from "@/lib/homework-task-store";
import type {
  HomeworkQuestion,
  HomeworkQuestionDraft,
  HomeworkReviewGenerationMode,
  HomeworkReviewResult,
  HomeworkReviewTaskPayload,
  HomeworkReviewTaskState,
} from "@/lib/homework-review-types";
import { getLLMConfigSummary, callLLMWithMeta } from "@/lib/openai";
import {
  createTingwuOfflineTask,
  fetchTingwuTranscriptionText,
  getTingwuTaskInfo,
} from "@/lib/tingwu";

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
const MOCK_TRANSCRIPTION_DELAY_MS = 3_000;
const MOCK_REVIEW_DELAY_MS = 1_500;

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function getProvider() {
  return readEnv("HOMEWORK_REVIEW_PROVIDER") || "mock";
}

function getReviewModel() {
  return readEnv("HOMEWORK_REVIEW_MODEL") || undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function buildTaskId() {
  return `hw_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function isSupportedMediaFile(file: File) {
  const lowerName = file.name.toLowerCase();

  return (
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/") ||
    [".mp3", ".mp4", ".wav", ".m4a", ".flac", ".aac", ".mov"].some((ext) =>
      lowerName.endsWith(ext),
    )
  );
}

function getNextPollDelayMs(task: HomeworkReviewTaskState) {
  if (task.isMock) {
    return task.status === "reviewing" ? 1_500 : 3_000;
  }

  if (task.status === "reviewing") {
    return 4_000;
  }

  if (task.status === "transcribing") {
    const createdAtMs = new Date(task.createdAt).getTime();
    return Date.now() - createdAtMs < 10 * 60_000 ? 60_000 : 5 * 60_000;
  }

  return undefined;
}

function toTaskPayload(task: HomeworkReviewTaskState): HomeworkReviewTaskPayload {
  return {
    taskId: task.taskId,
    studentName: task.studentName,
    question: {
      id: task.question.id,
      title: task.question.title,
      category: task.question.category,
      requiresStar: task.question.requiresStar,
      isCustom: task.question.id.startsWith("custom_"),
    },
    fileName: task.fileName,
    status: task.status,
    step: task.step,
    totalSteps: task.totalSteps,
    message: task.message,
    nextPollDelayMs: getNextPollDelayMs(task),
    isMock: task.isMock,
    createdAt: task.createdAt,
    result: task.result,
    error: task.error,
  };
}

function buildMockTranscript(task: HomeworkReviewTaskState) {
  return [
    "当前为开发演示模式，尚未接入真实音视频转写。",
    `题目是：${task.question.title}。`,
    task.studentName
      ? `当前任务的学员姓名是：${task.studentName}。`
      : "当前任务没有填写学员姓名。",
    "请将本次结果仅用于联调页面与接口，不作为正式批阅内容。",
  ].join("");
}

async function resolveHomeworkQuestion(input: {
  customQuestion?: HomeworkQuestionDraft;
  questionId?: string;
}) {
  return input.customQuestion?.title?.trim() && input.customQuestion.content?.trim()
    ? upsertHomeworkQuestion(input.customQuestion)
    : input.questionId
      ? await getHomeworkQuestionById(input.questionId)
      : null;
}

function validateHomeworkInput(input: {
  file: File;
  question: HomeworkQuestion | null;
}) {
  if (!input.file || input.file.size <= 0) {
    throw new Error("请先上传音视频文件");
  }

  if (input.file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("文件超过 500MB，请压缩后重试");
  }

  if (!isSupportedMediaFile(input.file)) {
    throw new Error("仅支持 mp3/mp4/wav/m4a/flac/aac/mov 格式");
  }

  if (!input.question) {
    throw new Error("题目不存在，或自定义题目内容不完整");
  }
}

async function generateHomeworkReview(task: HomeworkReviewTaskState) {
  const transcript = task.transcribedText ?? "";
  const llmConfig = getLLMConfigSummary();

  if (llmConfig.hasApiKey) {
    try {
      const llmResult = await callLLMWithMeta(
        HOMEWORK_REVIEW_SYSTEM_PROMPT,
        buildHomeworkReviewUserPrompt({
          question: task.question,
          transcribedText: transcript,
        }),
        {
          maxTokens: 2048,
          model: getReviewModel(),
          temperature: 0.3,
        },
      );
      const parsed = parseHomeworkReviewResult(llmResult.content);

      if (parsed.evaluation && parsed.referenceSpeech) {
        return {
          ...parsed,
          reviewMode: "llm" as HomeworkReviewGenerationMode,
        };
      }
    } catch (error) {
      console.error("[homework-review] LLM 批阅失败，回退到本地兜底", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ...buildFallbackHomeworkReview({
      question: task.question,
      transcribedText: transcript,
    }),
    reviewMode: "fallback" as HomeworkReviewGenerationMode,
  };
}

async function cleanupTaskSourceFile(task: HomeworkReviewTaskState) {
  if (!task.ossObjectKey) {
    return;
  }

  const objectKey = task.ossObjectKey;

  try {
    await deleteHomeworkReviewSourceFile(objectKey);
    task.ossObjectKey = undefined;
    task.cleanedUpAt = nowIso();
  } catch (error) {
    console.error("[homework-review] 清理 OSS 文件失败", {
      error: error instanceof Error ? error.message : String(error),
      objectKey,
      taskId: task.taskId,
    });
  }
}

async function finalizeHomeworkReview(task: HomeworkReviewTaskState) {
  if (task.processing || task.result) {
    return task;
  }

  task.processing = true;
  task.updatedAt = nowIso();
  setHomeworkReviewTask(task);

  try {
    const review = await generateHomeworkReview(task);
    const result: HomeworkReviewResult = {
      evaluation: review.evaluation,
      referenceSpeech: review.referenceSpeech,
      transcribedText: task.transcribedText ?? "",
      question: task.question,
      studentName: task.studentName,
      completedAt: nowIso(),
      reviewMode: review.reviewMode,
      transcriptionMode: task.transcriptionMode,
    };

    task.status = "completed";
    task.step = 3;
    task.message = task.isMock ? "演示结果已生成" : "批阅完成";
    task.result = result;
    task.reviewMode = review.reviewMode;
    task.error = undefined;
  } catch (error) {
    task.status = "failed";
    task.error = error instanceof Error ? error.message : "批阅失败，请稍后重试";
    task.message = "批阅失败";
  } finally {
    task.processing = false;
    task.updatedAt = nowIso();
    await cleanupTaskSourceFile(task);
    setHomeworkReviewTask(task);
  }

  return task;
}

function buildBaseTask(input: {
  file: File;
  question: HomeworkQuestion;
  studentName?: string;
  taskId: string;
}) {
  return {
    createdAt: nowIso(),
    fileName: input.file.name,
    fileSize: input.file.size,
    question: input.question,
    step: 2,
    studentName: input.studentName?.trim() || "未命名学员",
    taskId: input.taskId,
    totalSteps: 3,
    updatedAt: nowIso(),
  };
}

function createMockTask(input: {
  file: File;
  question: HomeworkQuestion;
  studentName?: string;
}) {
  const taskId = buildTaskId();
  const task: HomeworkReviewTaskState = {
    ...buildBaseTask({
      file: input.file,
      question: input.question,
      studentName: input.studentName,
      taskId,
    }),
    isMock: true,
    message: "演示模式转写中，请稍后查看结果",
    processing: false,
    reviewReadyAt: Date.now() + MOCK_TRANSCRIPTION_DELAY_MS + MOCK_REVIEW_DELAY_MS,
    status: "transcribing",
    transcriptionMode: "mock",
    transcriptionReadyAt: Date.now() + MOCK_TRANSCRIPTION_DELAY_MS,
  };

  setHomeworkReviewTask(task);
  return task;
}

async function createTingwuTask(input: {
  file: File;
  question: HomeworkQuestion;
  studentName?: string;
}) {
  const taskId = buildTaskId();
  const baseTask = buildBaseTask({
    file: input.file,
    question: input.question,
    studentName: input.studentName,
    taskId,
  });
  const uploadResult = await uploadHomeworkReviewSourceFile({
    file: input.file,
    taskId,
  });

  try {
    const tingwuTask = await createTingwuOfflineTask({
      fileUrl: uploadResult.signedUrl,
      taskKey: taskId,
    });
    const task: HomeworkReviewTaskState = {
      ...baseTask,
      isMock: false,
      message: "文件已上传，通义听悟转写中",
      ossObjectKey: uploadResult.objectKey,
      processing: false,
      reviewReadyAt: undefined,
      sourceFileSignedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
      status: "transcribing",
      transcriptionMode: "tingwu",
      transcriptionReadyAt: undefined,
      transcriptionResultUrl: undefined,
      tingwuTaskId: tingwuTask.taskId,
      tingwuTaskStatus: tingwuTask.taskStatus,
    };

    setHomeworkReviewTask(task);
    return task;
  } catch (error) {
    await deleteHomeworkReviewSourceFile(uploadResult.objectKey).catch((cleanupError) => {
      console.error("[homework-review] 创建听悟任务失败后清理 OSS 文件失败", {
        cleanupError:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
        objectKey: uploadResult.objectKey,
      });
    });
    throw error;
  }
}

async function syncTingwuTranscriptionTask(task: HomeworkReviewTaskState) {
  if (task.processing) {
    return task;
  }

  if (!task.tingwuTaskId) {
    throw new Error("任务缺少通义听悟 TaskId，无法继续查询");
  }

  task.processing = true;
  task.updatedAt = nowIso();
  setHomeworkReviewTask(task);

  try {
    const tingwuTask = await getTingwuTaskInfo(task.tingwuTaskId);

    task.tingwuTaskStatus = tingwuTask.taskStatus;
    task.transcriptionResultUrl =
      tingwuTask.transcriptionUrl || task.transcriptionResultUrl;
    task.updatedAt = nowIso();

    if (tingwuTask.taskStatus === "FAILED") {
      task.status = "failed";
      task.error = tingwuTask.errorMessage
        ? `通义听悟转写失败：${tingwuTask.errorMessage}`
        : "通义听悟转写失败";
      task.message = "转写失败";
      await cleanupTaskSourceFile(task);
      setHomeworkReviewTask(task);
      return task;
    }

    if (tingwuTask.taskStatus !== "COMPLETED") {
      task.message = "通义听悟转写中，请稍后查看结果";
      setHomeworkReviewTask(task);
      return task;
    }

    const transcriptionUrl = task.transcriptionResultUrl;

    if (!transcriptionUrl) {
      task.status = "failed";
      task.error = "通义听悟任务已完成，但未返回转写结果链接";
      task.message = "转写失败";
      await cleanupTaskSourceFile(task);
      setHomeworkReviewTask(task);
      return task;
    }

    task.transcribedText = await fetchTingwuTranscriptionText(transcriptionUrl);
    task.status = "reviewing";
    task.step = 3;
    task.error = undefined;
    task.message = "正在生成批阅结果";
    setHomeworkReviewTask(task);
    return task;
  } finally {
    task.processing = false;
    task.updatedAt = nowIso();
    setHomeworkReviewTask(task);
  }
}

export async function submitHomeworkReviewTask(input: {
  customQuestion?: HomeworkQuestionDraft;
  file: File;
  questionId?: string;
  studentName?: string;
}) {
  const provider = getProvider();
  const question = await resolveHomeworkQuestion({
    customQuestion: input.customQuestion,
    questionId: input.questionId,
  });

  validateHomeworkInput({
    file: input.file,
    question,
  });

  if (!question) {
    throw new Error("题目不存在，或自定义题目内容不完整");
  }

  const task =
    provider === "mock"
      ? createMockTask({
          file: input.file,
          question,
          studentName: input.studentName,
        })
      : provider === "tingwu"
        ? await createTingwuTask({
            file: input.file,
            question,
            studentName: input.studentName,
          })
        : (() => {
            throw new Error(`不支持的作业批阅 provider：${provider}`);
          })();

  return toTaskPayload(task);
}

export async function getHomeworkReviewTaskPayload(taskId: string) {
  const task = getHomeworkReviewTask(taskId);

  if (!task) {
    throw new Error("任务不存在，可能已过期");
  }

  if (task.status === "completed" || task.status === "failed") {
    return toTaskPayload(task);
  }

  if (task.isMock) {
    if (
      task.status === "transcribing" &&
      task.transcriptionReadyAt &&
      Date.now() >= task.transcriptionReadyAt
    ) {
      task.transcribedText = buildMockTranscript(task);
      task.status = "reviewing";
      task.step = 3;
      task.message = "演示模式正在生成批阅结果";
      task.updatedAt = nowIso();
      setHomeworkReviewTask(task);
      return toTaskPayload(task);
    }

    if (
      task.status === "reviewing" &&
      task.reviewReadyAt &&
      Date.now() >= task.reviewReadyAt
    ) {
      const finalizedTask = await finalizeHomeworkReview(task);
      return toTaskPayload(finalizedTask);
    }

    return toTaskPayload(task);
  }

  if (task.status === "transcribing") {
    try {
      const syncedTask = await syncTingwuTranscriptionTask(task);
      return toTaskPayload(syncedTask);
    } catch (error) {
      console.error("[homework-review] 查询听悟状态失败，将保留任务继续重试", {
        error: error instanceof Error ? error.message : String(error),
        taskId,
        tingwuTaskId: task.tingwuTaskId,
      });

      task.message = "转写状态查询失败，将自动重试";
      task.updatedAt = nowIso();
      setHomeworkReviewTask(task);
      return toTaskPayload(task);
    }
  }

  if (task.status === "reviewing") {
    const finalizedTask = await finalizeHomeworkReview(task);
    return toTaskPayload(finalizedTask);
  }

  return toTaskPayload(task);
}
