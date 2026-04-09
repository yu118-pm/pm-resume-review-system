"use client";

import { useEffect, useRef, useState } from "react";
import { TaskCard } from "./TaskCard";
import { TaskSubmitForm } from "./TaskSubmitForm";
import type {
  HomeworkQuestion,
  HomeworkQuestionDraft,
  HomeworkQuestionSummary,
  HomeworkReviewQuestionsResponse,
  HomeworkReviewStatusResponse,
  HomeworkReviewSubmitResponse,
  HomeworkReviewTaskPayload,
} from "@/lib/homework-review-types";

const CUSTOM_QUESTIONS_STORAGE_KEY = "homework-review-custom-questions-v1";

function getFileKey(file: File) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function toQuestionSummary(question: HomeworkQuestion, isCustom: boolean): HomeworkQuestionSummary {
  return {
    id: question.id,
    title: question.title,
    category: question.category,
    requiresStar: question.requiresStar,
    isCustom,
  };
}

function loadStoredCustomQuestions(): HomeworkQuestion[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(CUSTOM_QUESTIONS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as HomeworkQuestion[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            Boolean(item?.id) &&
            Boolean(item?.title) &&
            Boolean(item?.content) &&
            Boolean(item?.category),
        )
      : [];
  } catch {
    return [];
  }
}

export function HomeworkReviewPage() {
  const customQuestionsRef = useRef<HomeworkQuestion[]>([]);
  const pollingTimersRef = useRef<Record<string, number>>({});
  const [customQuestions, setCustomQuestions] = useState<HomeworkQuestion[]>([]);
  const [presetQuestions, setPresetQuestions] = useState<HomeworkQuestionSummary[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [submittingCount, setSubmittingCount] = useState(0);
  const [tasks, setTasks] = useState<HomeworkReviewTaskPayload[]>([]);
  const questions = [
    ...customQuestions.map((question) => toQuestionSummary(question, true)),
    ...presetQuestions,
  ];

  useEffect(() => {
    setCustomQuestions(loadStoredCustomQuestions());
  }, []);

  useEffect(() => {
    customQuestionsRef.current = customQuestions;

    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      CUSTOM_QUESTIONS_STORAGE_KEY,
      JSON.stringify(customQuestions),
    );
  }, [customQuestions]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/homework-review/questions");
        const data = (await response.json()) as
          | HomeworkReviewQuestionsResponse
          | { success: false; error: string };

        if (!response.ok || !data.success) {
          throw new Error(data.success ? "题目加载失败" : data.error);
        }

        setPresetQuestions(data.questions);
      } catch (error) {
        setQuestionsError(
          error instanceof Error ? error.message : "题目加载失败，请稍后重试",
        );
      } finally {
        setQuestionsLoading(false);
      }
    })();

    return () => {
      Object.values(pollingTimersRef.current).forEach((timer) =>
        window.clearTimeout(timer),
      );
      pollingTimersRef.current = {};
    };
  }, []);

  function saveCustomQuestion(draft: HomeworkQuestionDraft) {
    const title = draft.title.trim();
    const content = draft.content.trim();
    const category = draft.category?.trim() || "自定义题目";
    const reviewFocus = draft.reviewFocus?.filter(Boolean);
    const currentQuestions = customQuestionsRef.current;
    const existing = currentQuestions.find(
      (question) =>
        question.title.trim() === title && question.content.trim() === content,
    );

    if (existing) {
      const nextQuestions = currentQuestions.map((question) =>
        question.id === existing.id
          ? {
              ...question,
              category,
              requiresStar: Boolean(draft.requiresStar),
              reviewFocus,
            }
          : question,
      );

      customQuestionsRef.current = nextQuestions;
      setCustomQuestions(nextQuestions);
      return existing.id;
    }

    const nextQuestion: HomeworkQuestion = {
      id: `custom_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      content,
      category,
      requiresStar: Boolean(draft.requiresStar),
      reviewFocus,
    };
    const nextQuestions = [nextQuestion, ...currentQuestions];

    customQuestionsRef.current = nextQuestions;
    setCustomQuestions(nextQuestions);
    return nextQuestion.id;
  }

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
      const data = (await response.json()) as
        | HomeworkReviewStatusResponse
        | { success: false; error: string };

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
      const selectedCustomQuestion = params.questionId
        ? customQuestions.find((question) => question.id === params.questionId)
        : null;
      const effectiveCustomQuestion =
        params.customQuestion?.title?.trim() && params.customQuestion.content?.trim()
          ? params.customQuestion
          : selectedCustomQuestion
            ? {
                title: selectedCustomQuestion.title,
                content: selectedCustomQuestion.content,
                category: selectedCustomQuestion.category,
                requiresStar: selectedCustomQuestion.requiresStar,
                reviewFocus: selectedCustomQuestion.reviewFocus,
              }
            : undefined;

      const settledResults = await Promise.allSettled(
        params.files.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("studentName", params.studentName);

          if (effectiveCustomQuestion?.title?.trim() && effectiveCustomQuestion.content?.trim()) {
            formData.append("questionMode", "custom");
            formData.append("customQuestionTitle", effectiveCustomQuestion.title);
            formData.append("customQuestionContent", effectiveCustomQuestion.content);
            formData.append(
              "customQuestionCategory",
              effectiveCustomQuestion.category?.trim() || "自定义题目",
            );
            formData.append(
              "customQuestionRequiresStar",
              effectiveCustomQuestion.requiresStar ? "true" : "false",
            );
          } else if (params.questionId) {
            formData.append("questionMode", "preset");
            formData.append("questionId", params.questionId);
          }

          const response = await fetch("/api/homework-review/submit", {
            method: "POST",
            body: formData,
          });
          const data = (await response.json()) as
            | HomeworkReviewSubmitResponse
            | { success: false; error: string };

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

      const savedQuestionId =
        effectiveCustomQuestion && succeededResults.length > 0
          ? saveCustomQuestion(effectiveCustomQuestion)
          : undefined;

      if (failedMessages.length > 0) {
        setSubmitError(failedMessages.join("；"));
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
