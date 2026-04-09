"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  HomeworkQuestionDraft,
  HomeworkQuestionSummary,
} from "@/lib/homework-review-types";

function getFileKey(file: File) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function TaskSubmitForm({
  loadingQuestions,
  onSubmit,
  questions,
  questionsError,
  submitting,
}: {
  loadingQuestions: boolean;
  onSubmit: (params: {
    customQuestion?: HomeworkQuestionDraft;
    files: File[];
    questionId?: string;
    studentName: string;
  }) => Promise<{ savedQuestionId?: string; submittedFileKeys: string[] }>;
  questions: HomeworkQuestionSummary[];
  questionsError: string | null;
  submitting: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [customQuestionCategory, setCustomQuestionCategory] = useState("自定义题目");
  const [customQuestionContent, setCustomQuestionContent] = useState("");
  const [customQuestionRequiresStar, setCustomQuestionRequiresStar] = useState(false);
  const [customQuestionTitle, setCustomQuestionTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isCustomQuestionOpen, setIsCustomQuestionOpen] = useState(false);
  const [questionId, setQuestionId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!questionId && questions.length > 0) {
      setQuestionId(questions[0].id);
    }
  }, [questionId, questions]);

  function mergeFiles(nextFiles: FileList | File[]) {
    const incoming = Array.from(nextFiles);

    if (incoming.length === 0) {
      return;
    }

    setFiles((current) => {
      const seen = new Set(current.map((file) => getFileKey(file)));
      const merged = [...current];

      for (const file of incoming) {
        const key = getFileKey(file);

        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      }

      return merged;
    });
    setFormError(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      mergeFiles(event.target.files);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    if (!submitting) {
      fileInputRef.current?.click();
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!dragging) {
      setDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    if (submitting) {
      return;
    }

    if (event.dataTransfer.files?.length) {
      mergeFiles(event.dataTransfer.files);
    }
  }

  function removeFile(fileKey: string) {
    setFiles((current) => current.filter((file) => getFileKey(file) !== fileKey));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const hasCustomQuestionInput =
      customQuestionTitle.trim().length > 0 || customQuestionContent.trim().length > 0;

    if (files.length === 0) {
      setFormError("请先上传至少一个音视频文件");
      return;
    }

    if (!hasCustomQuestionInput && !questionId) {
      setFormError("请先选择批阅题目");
      return;
    }

    if (hasCustomQuestionInput && (!customQuestionTitle.trim() || !customQuestionContent.trim())) {
      setFormError("请填写自定义题目标题和题目内容");
      return;
    }

    const result = await onSubmit({
      customQuestion: hasCustomQuestionInput
          ? {
              title: customQuestionTitle,
              content: customQuestionContent,
              category: customQuestionCategory,
              requiresStar: customQuestionRequiresStar,
            }
          : undefined,
      files,
      questionId: hasCustomQuestionInput ? undefined : questionId,
      studentName,
    });

    if (result.submittedFileKeys.length === 0) {
      return;
    }

    const remainingFiles = files.filter(
      (file) => !result.submittedFileKeys.includes(getFileKey(file)),
    );

    setFiles((current) =>
      current.filter((file) => !result.submittedFileKeys.includes(getFileKey(file))),
    );

    if (remainingFiles.length === 0) {
      setStudentName("");
    }

    if (result.savedQuestionId) {
      setQuestionId(result.savedQuestionId);
    }

    if (hasCustomQuestionInput) {
      setCustomQuestionTitle("");
      setCustomQuestionContent("");
      setCustomQuestionCategory("自定义题目");
      setCustomQuestionRequiresStar(false);
      setIsCustomQuestionOpen(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <form className="workspace-form" onSubmit={handleSubmit}>
      <section className="card unified-card">
        <div className="card-header unified-header">
          <div>
            <span className="section-kicker">Audio / Video Review</span>
            <h3>新建批阅任务</h3>
            <p>支持拖拽多个音视频文件，异步提交多个批阅任务并行执行。</p>
          </div>
        </div>

        <div
          className={dragging ? "upload-dropzone is-dragging" : "upload-dropzone"}
          role="button"
          tabIndex={submitting ? -1 : 0}
          aria-disabled={submitting}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => {
            if (!submitting) {
              fileInputRef.current?.click();
            }
          }}
          onKeyDown={handleKeyDown}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*,.mp3,.mp4,.wav,.m4a,.flac,.aac,.mov"
            multiple
            onChange={handleFileChange}
            disabled={submitting}
          />
          <div className="upload-strip">
            <div className="upload-strip-main">
              <strong>
                {files.length > 0
                  ? `已选择 ${files.length} 个文件`
                  : "点击或拖拽音视频文件到这里"}
              </strong>
              <span>支持 mp3/mp4/wav/m4a/flac/aac/mov，单文件最大 500MB，可一次提交多个任务</span>
            </div>
            <div className="upload-strip-side">
              <span className="upload-cta">{files.length > 0 ? "继续添加文件" : "上传文件"}</span>
            </div>
          </div>
        </div>

        {files.length > 0 ? (
          <div className="selected-files">
            {files.map((file) => {
              const fileKey = getFileKey(file);

              return (
                <div className="file-chip" key={fileKey}>
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="file-chip-remove"
                    onClick={() => removeFile(fileKey)}
                  >
                    移除
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="unified-fields">
          <div className="field-block">
            <div className="field-header-row">
              <label className="field-label" htmlFor="homework-question">
                批阅题目
              </label>
              <button
                type="button"
                className="ghost-button inline-action"
                disabled={submitting}
                onClick={() => setIsCustomQuestionOpen((open) => !open)}
              >
                {isCustomQuestionOpen ? "收起新增题目" : "新增题目"}
              </button>
            </div>
            <select
              id="homework-question"
              className="text-input"
              value={questionId}
              onChange={(event) => setQuestionId(event.target.value)}
              disabled={loadingQuestions || submitting || questions.length === 0}
            >
              {questions.length === 0 ? (
                <option value="">
                  {loadingQuestions ? "题目加载中..." : "暂无可选题目"}
                </option>
              ) : null}
              {questions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.title}
                </option>
              ))}
            </select>
          </div>

          {isCustomQuestionOpen ? (
            <div className="custom-question-panel">
              <div className="field-block">
                <label className="field-label" htmlFor="custom-question-title">
                  题目标题
                </label>
                <input
                  id="custom-question-title"
                  className="text-input"
                  placeholder="例如：请分享一次你推动跨部门协作的经历"
                  value={customQuestionTitle}
                  onChange={(event) => setCustomQuestionTitle(event.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="field-block">
                <label className="field-label" htmlFor="custom-question-category">
                  题目分类
                </label>
                <input
                  id="custom-question-category"
                  className="text-input"
                  placeholder="例如：项目复盘 / STAR 法则 / 自我介绍"
                  value={customQuestionCategory}
                  onChange={(event) => setCustomQuestionCategory(event.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="field-block">
                <label className="field-label" htmlFor="custom-question-content">
                  题目内容
                </label>
                <textarea
                  id="custom-question-content"
                  className="support-input"
                  placeholder="输入完整题目要求，模型会按这个要求生成评语和参考话术"
                  value={customQuestionContent}
                  onChange={(event) => setCustomQuestionContent(event.target.value)}
                  disabled={submitting}
                />
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={customQuestionRequiresStar}
                  onChange={(event) => setCustomQuestionRequiresStar(event.target.checked)}
                  disabled={submitting}
                />
                <span>这个题目要求按 STAR 结构批阅</span>
              </label>
            </div>
          ) : null}

          <div className="field-block">
            <label className="field-label" htmlFor="homework-student-name">
              学员姓名
            </label>
            <input
              id="homework-student-name"
              className="text-input"
              placeholder="可选，用于任务卡片展示"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="form-footer">
          <button type="submit" className="submit-button" disabled={submitting}>
            {submitting
              ? "提交中..."
              : files.length > 1
                ? `提交 ${files.length} 个任务`
                : "提交批阅"}
          </button>
          <p className="form-note">
            如果本次填写了新增题目，提交成功后会自动保存，后续会直接出现在题目下拉中。
          </p>
        </div>

        {questionsError ? <div className="error-banner">{questionsError}</div> : null}
        {formError ? <div className="error-banner">{formError}</div> : null}
      </section>
    </form>
  );
}
