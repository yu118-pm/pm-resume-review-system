"use client";

import { useState } from "react";
import { SessionSelector } from "./SessionSelector";
import { ResumeUploader } from "./ResumeUploader";
import { ReviewResult } from "./ReviewResult";
import type { PmReviewComment, ReviewSession } from "@/lib/types";

type PageStage = "session-select" | "upload" | "result";

export function PmReviewPage() {
  const [stage, setStage] = useState<PageStage>("session-select");
  const [currentSession, setCurrentSession] = useState<ReviewSession | null>(null);
  const [comments, setComments] = useState<PmReviewComment[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  function handleSessionSelect(session: ReviewSession) {
    setCurrentSession(session);
    setStage("upload");
  }

  function handleReviewComplete(
    newComments: PmReviewComment[],
    file: File,
    completedAt: Date,
  ) {
    setComments(newComments);
    setUploadedFile(file);
    setGeneratedAt(completedAt);
    setStage("result");
  }

  function handleBack() {
    setStage("upload");
    setComments([]);
    setUploadedFile(null);
    setGeneratedAt(null);
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <span className="section-kicker">PM Resume Review</span>
          <h2>PM 简历批阅 Agent</h2>
          <p>
            按会话管理学员，自动记录多轮批阅历史，生成结构化批阅意见并导出带 Word 原生批注的回写文件。
          </p>
        </div>
      </header>

      <div className="card unified-card">
        {stage === "session-select" && (
          <SessionSelector onSelect={handleSessionSelect} />
        )}

        {stage === "upload" && currentSession && (
          <ResumeUploader
            session={currentSession}
            onComplete={handleReviewComplete}
            onBack={() => setStage("session-select")}
          />
        )}

        {stage === "result" && generatedAt && (
          <ReviewResult
            comments={comments}
            uploadedFile={uploadedFile}
            generatedAt={generatedAt}
            onBack={handleBack}
          />
        )}
      </div>
    </>
  );
}
