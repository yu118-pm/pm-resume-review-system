"use client";

import { useEffect, useRef, useState } from "react";
import { TaskCard } from "./TaskCard";
import { TaskSubmitForm } from "./TaskSubmitForm";
import { buildHttpErrorMessage, readJsonResponse } from "@/lib/http-response";
import type {
  HomeworkQuestion,
  HomeworkQuestionDraft,
  HomeworkQuestionSummary,
  HomeworkReviewQuestionsResponse,
  HomeworkReviewStatusResponse,
  HomeworkReviewSubmitResponse,
  HomeworkReviewTaskPayload,
  HomeworkReviewUploadPlanResponse,
  HomeworkReviewUpsertQuestionResponse,
} from "@/lib/homework-review-types";

const LEGACY_CUSTOM_QUESTIONS_STORAGE_KEY = "homework-review-custom-questions-v1";

function getFileKey(file: File) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function loadLegacyCustomQuestions(): HomeworkQuestionDraft[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_CUSTOM_QUESTIONS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as HomeworkQuestion[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item) =>
          Boolean(item?.title?.trim()) &&
          Boolean(item?.content?.trim()),
      )
      .map((item) => ({
        title: item.title.trim(),
        content: item.content.trim(),
        category: item.category?.trim() || "自定义题目",
        requiresStar: Boolean(item.requiresStar),
        reviewFocus: item.reviewFocus?.filter(Boolean),
      }));
  } catch {
    return [];
  }
}

function shouldUseDirectOssUpload() {
  if (typeof window === "undefined") {
    return false;
  }

  return !["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export function HomeworkReviewPage() {
  const didMigrateLegacyQuestionsRef = useRef(false);
  const pollingTimersRef = useRef<Record<string, number>>({});
  const [questions, setQuestions] = useState<HomeworkQuestionSummary[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [submittingCount, setSubmittingCount] = useState(0);
  const [tasks, setTasks] = useState<HomeworkReviewTaskPayload[]>([]);

  async function fetchQuestions(options?: { showLoading?: boolean }) {
    if (options?.showLoading) {
      setQuestionsLoading(true);
    }

    try {
      const response = await fetch("/api/homework-review/questions", {
        cache: "no-store",
      });
      const data = await readJsonResponse<HomeworkReviewQuestionsResponse | {
        success: false;
        error: string;
      }>(response, "题目加载失败");

      if (!response.ok || !data.success) {
        throw new Error(data.success ? "题目加载失败" : data.error);
      }

      setQuestions(data.questions);
      setQuestionsError(null);
    } catch (error) {
      setQuestionsError(
        error instanceof Error ? error.message : "题目加载失败，请稍后重试",
      );
    } finally {
      if (options?.showLoading) {
        setQuestionsLoading(false);
      }
    }
  }

  async function migrateLegacyQuestions() {
    if (didMigrateLegacyQuestionsRef.current || typeof window === "undefined") {
      return;
    }

    didMigrateLegacyQuestionsRef.current = true;
    const legacyQuestions = loadLegacyCustomQuestions();

    if (legacyQuestions.length === 0) {
      return;
    }

    const settled = await Promise.allSettled(
      legacyQuestions.map((question) =>
        fetch("/api/homework-review/questions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(question),
        }),
      ),
    );
    const hasFailed = settled.some(
      (result) =>
        result.status === "rejected" ||
        (result.status === "fulfilled" && !result.value.ok),
    );

    if (!hasFailed) {
      window.localStorage.removeItem(LEGACY_CUSTOM_QUESTIONS_STORAGE_KEY);
      await fetchQuestions();
    }
  }

  useEffect(() => {
    void (async () => {
      await fetchQuestions({ showLoading: true });
      await migrateLegacyQuestions();
    })();

    return () => {
      Object.values(pollingTimersRef.current).forEach((timer) =>
        window.clearTimeout(timer),
      );
      pollingTimersRef.current = {};
    };
  }, []);

  function upsertTask(nextTask: HomeworkReviewTaskPayload) {
    setTasks((current) => {
      const taskIndex = current.findIndex((task) => task.taskId === nextTask.taskId);

      if (taskIndex === -1) {
        return [nextTask, ...current];
      }

      return current.map((task) =>
        task.taskId === nextTask.taskId ? nextTask : task,
      );
    });
  }

  function clearPoll(taskId: string) {
    const timer = pollingTimersRef.current[taskId];

    if (timer) {
      window.clearTimeout(timer);
      delete pollingTimersRef.current[taskId];
    }
  }

  function schedulePoll(taskId: string, delayMs?: number) {
    clearPoll(taskId);

    if (!delayMs || delayMs <= 0) {
      return;
    }

    pollingTimersRef.current[taskId] = window.setTimeout(() => {
      void pollTask(taskId);
    }, delayMs);
  }

  async function pollTask(taskId: string) {
    try {
      const response = await fetch(
        `/api/homework-review/status?taskId=${encodeURIComponent(taskId)}`,
      );
      const data = await readJsonResponse<HomeworkReviewStatusResponse | {
        success: false;
        error: string;
      }>(response, "任务查询失败");

      if (!response.ok || !data.success) {
        throw new Error(data.success ? "任务查询失败" : data.error);
      }

      upsertTask(data.task);

      if (data.task.status === "completed" || data.task.status === "failed") {
        clearPoll(taskId);
        return;
      }

      schedulePoll(taskId, data.task.nextPollDelayMs);
    } catch (error) {
      clearPoll(taskId);
      setTasks((current) =>
        current.map((task) =>
          task.taskId === taskId
            ? {
                ...task,
                status: "failed",
                error:
                  error instanceof Error
                    ? error.message
                    : "任务查询失败，请稍后重试",
                message: "任务查询失败",
              }
            : task,
        ),
      );
    }
  }

  async function handleSubmit(params: {
    customQuestion?: HomeworkQuestionDraft;
    files: File[];
    questionId?: string;
    studentName: string;
  }) {
    setSubmittingCount((count) => count + 1);
    setSubmitError(null);

    try {
      let savedQuestionId: string | undefined;
      const useDirectOssUpload = shouldUseDirectOssUpload();

      if (params.customQuestion?.title?.trim() && params.customQuestion.content?.trim()) {
        const response = await fetch("/api/homework-review/questions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(params.customQuestion),
        });
        const data = await readJsonResponse<HomeworkReviewUpsertQuestionResponse | {
          success: false;
          error: string;
        }>(response, "题目保存失败");

        if (!response.ok || !data.success) {
          throw new Error(data.success ? "题目保存失败" : data.error);
        }

        savedQuestionId = data.question.id;
      }

      const resolvedQuestionId = savedQuestionId || params.questionId;

      const settledResults = await Promise.allSettled(
        params.files.map(async (file) => {
          const formData = new FormData();
          let response: Response;

          if (useDirectOssUpload) {
            const uploadPlanResponse = await fetch("/api/homework-review/upload-url", {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
              }),
            });
            const uploadPlanData = await readJsonResponse<
              | HomeworkReviewUploadPlanResponse
              | { success: false; error: string }
            >(uploadPlanResponse, "创建 OSS 上传地址失败");

            if (!uploadPlanResponse.ok || !uploadPlanData.success) {
              throw new Error(
                uploadPlanData.success ? "创建 OSS 上传地址失败" : uploadPlanData.error,
              );
            }

            try {
              const uploadResponse = await fetch(uploadPlanData.upload.uploadUrl, {
                method: "PUT",
                headers: uploadPlanData.upload.uploadHeaders,
                body: file,
              });

              if (!uploadResponse.ok) {
                const raw = await uploadResponse.text();
                throw new Error(buildHttpErrorMessage(uploadResponse, raw, "上传 OSS 失败"));
              }
            } catch (error) {
              if (error instanceof TypeError) {
                throw new Error(
                  "上传 OSS 失败，请检查 OSS Bucket CORS 是否允许当前域名发起 PUT 请求",
                );
              }

              throw error;
            }

            response = await fetch("/api/homework-review/submit", {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                questionId: resolvedQuestionId,
                sourceObjectKey: uploadPlanData.upload.objectKey,
                studentName: params.studentName,
              }),
            });
          } else {
            formData.append("file", file);
            formData.append("studentName", params.studentName);

            if (resolvedQuestionId) {
              formData.append("questionMode", "preset");
              formData.append("questionId", resolvedQuestionId);
            }

            response = await fetch("/api/homework-review/submit", {
              method: "POST",
              body: formData,
            });
          }

          const data = await readJsonResponse<HomeworkReviewSubmitResponse | {
            success: false;
            error: string;
          }>(response, "任务提交失败");

          if (!response.ok || !data.success) {
            throw new Error(data.success ? "任务提交失败" : data.error);
          }

          return {
            fileKey: getFileKey(file),
            task: data.task,
          };
        }),
      );

      const succeededResults = settledResults
        .filter((result): result is PromiseFulfilledResult<{
          fileKey: string;
          task: HomeworkReviewTaskPayload;
        }> => result.status === "fulfilled")
        .map((result) => result.value);
      const failedMessages = settledResults
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) =>
          result.reason instanceof Error ? result.reason.message : "任务提交失败",
        );

      succeededResults.forEach(({ task }) => {
        upsertTask(task);
        schedulePoll(task.taskId, task.nextPollDelayMs);
      });

      if (failedMessages.length > 0) {
        setSubmitError(failedMessages.join("；"));
      }

      if (savedQuestionId) {
        await fetchQuestions();
      }

      return {
        savedQuestionId,
        submittedFileKeys: succeededResults.map((result) => result.fileKey),
      };
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "任务提交失败，请稍后重试",
      );
      return {
        submittedFileKeys: [],
      };
    } finally {
      setSubmittingCount((count) => Math.max(0, count - 1));
    }
  }

  async function handleCopy(
    task: HomeworkReviewTaskPayload,
    field: "evaluation" | "referenceSpeech" | "all" | "transcript",
  ) {
    if (!task.result) {
      return;
    }

    const content =
      field === "evaluation"
        ? task.result.evaluation
        : field === "referenceSpeech"
          ? task.result.referenceSpeech
          : field === "transcript"
            ? task.result.transcribedText
            : `【评语】\n${task.result.evaluation}\n\n【参考话术】\n${task.result.referenceSpeech}`;

    try {
      await navigator.clipboard.writeText(content);
      setCopyMessage("内容已复制到剪贴板");
      window.setTimeout(() => setCopyMessage(null), 1800);
    } catch {
      setCopyMessage("复制失败，请手动复制");
      window.setTimeout(() => setCopyMessage(null), 1800);
    }
  }

  return (
    <div className="homework-page">
      <header className="workspace-header">
        <div>
          <span className="section-kicker">Homework Review</span>
          <h2>作业批阅</h2>
          <p>支持批量上传、多任务异步执行，也支持临时新增自定义题目后直接发起批阅。</p>
        </div>
      </header>

      <TaskSubmitForm
        loadingQuestions={questionsLoading}
        onSubmit={handleSubmit}
        questions={questions}
        questionsError={questionsError}
        submitting={submittingCount > 0}
      />

      {submitError ? <div className="error-banner">{submitError}</div> : null}
      {copyMessage ? <div className="inline-message">{copyMessage}</div> : null}

      <section className="task-stack">
        <div className="task-stack-head">
          <div>
            <span className="section-kicker">Task Queue</span>
            <h3>任务列表</h3>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state subtle">
            <h4>还没有批阅任务</h4>
            <p>提交第一个音视频任务后，这里会显示转写进度和批阅结果。</p>
          </div>
        ) : (
          <div className="task-card-list">
            {tasks.map((task) => (
              <TaskCard key={task.taskId} onCopy={handleCopy} task={task} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
