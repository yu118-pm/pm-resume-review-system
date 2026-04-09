"use client";

import { TaskStatusBadge } from "./TaskStatusBadge";
import type { HomeworkReviewTaskPayload } from "@/lib/homework-review-types";

export function TaskCard({
  onCopy,
  task,
}: {
  onCopy: (
    task: HomeworkReviewTaskPayload,
    field: "evaluation" | "referenceSpeech" | "all" | "transcript",
  ) => void;
  task: HomeworkReviewTaskPayload;
}) {
  return (
    <article className="task-card">
      <div className="task-card-top">
        <div className="task-card-heading">
          <div className="task-card-title-row">
            <h3>{task.studentName}</h3>
            <TaskStatusBadge isMock={task.isMock} status={task.status} />
          </div>
          <p>
            {task.question.title}
            <span className="task-card-dot">·</span>
            {task.fileName}
          </p>
        </div>
      </div>

      <div className="task-progress-row">
        <span>{`Step ${task.step}/${task.totalSteps}`}</span>
        <p>{task.message}</p>
      </div>

      {task.error ? <div className="error-banner">{task.error}</div> : null}

      {task.result ? (
        <div className="task-card-result">
          <section className="task-section">
            <div className="task-section-head">
              <h4>评语</h4>
              <button
                type="button"
                className="ghost-button"
                onClick={() => onCopy(task, "evaluation")}
              >
                复制评语
              </button>
            </div>
            <div className="homework-result-text">{task.result.evaluation}</div>
          </section>

          <section className="task-section">
            <div className="task-section-head">
              <h4>参考话术</h4>
              <button
                type="button"
                className="ghost-button"
                onClick={() => onCopy(task, "referenceSpeech")}
              >
                复制参考话术
              </button>
            </div>
            <div className="homework-result-text">
              {task.result.referenceSpeech}
            </div>
          </section>

          <div className="task-action-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onCopy(task, "all")}
            >
              复制全部
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onCopy(task, "transcript")}
            >
              复制转写稿
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
