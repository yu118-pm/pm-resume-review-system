"use client";

import type { HomeworkReviewTaskStatus } from "@/lib/homework-review-types";

const STATUS_LABELS: Record<HomeworkReviewTaskStatus, string> = {
  uploading: "上传中",
  transcribing: "转写中",
  reviewing: "批阅中",
  completed: "已完成",
  failed: "失败",
};

export function TaskStatusBadge({
  isMock,
  status,
}: {
  isMock: boolean;
  status: HomeworkReviewTaskStatus;
}) {
  return (
    <div className="task-status-group">
      <span className={`task-status-badge status-${status}`}>
        {STATUS_LABELS[status]}
      </span>
      {isMock ? <span className="task-mode-badge">演示模式</span> : null}
    </div>
  );
}
