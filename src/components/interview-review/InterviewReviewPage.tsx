"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { readJsonResponse } from "@/lib/http-response";
import type {
  AnalyzeInterviewTextResponse,
  InterviewReviewRecord,
  InterviewReviewStudent,
  InterviewStudentResponse,
  InterviewStudentsResponse,
} from "@/lib/interview-review-types";
import type {
  InterviewAudioStatusResponse,
  InterviewAudioSubmitResponse,
  InterviewAudioTaskPayload,
} from "@/lib/interview-review-audio-types";

type InterviewInputMode = "text" | "audio";
type UploadZoneKind = "resume" | "jdImage" | "audio" | null;

function formatDateTime(value?: string) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readFileNameFromDisposition(header: string | null) {
  if (!header) {
    return null;
  }

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = header.match(/filename="?([^"]+)"?/i);
  return basicMatch?.[1] ?? null;
}

function openFilePicker(inputRef: RefObject<HTMLInputElement | null>) {
  inputRef.current?.click();
}

function handleUploadZoneKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  inputRef: RefObject<HTMLInputElement | null>,
) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  openFilePicker(inputRef);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("图片读取失败"));
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

export function InterviewReviewPage() {
  const resumeFileInputRef = useRef<HTMLInputElement | null>(null);
  const jdImageInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const audioPollTimerRef = useRef<number | null>(null);
  const [draggingZone, setDraggingZone] = useState<UploadZoneKind>(null);
  const [students, setStudents] = useState<InterviewReviewStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [preparingJdImage, setPreparingJdImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newStudentName, setNewStudentName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [jdText, setJdText] = useState("");
  const [jdImageName, setJdImageName] = useState<string | null>(null);
  const [jdImageDataUrl, setJdImageDataUrl] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InterviewInputMode>("text");
  const [rawQaText, setRawQaText] = useState("");
  const [audioTask, setAudioTask] = useState<InterviewAudioTaskPayload | null>(null);
  const [review, setReview] = useState<InterviewReviewRecord | null>(null);

  const selectedStudent =
    students.find((item) => item.id === studentId) ?? null;
  const selectedResume =
    selectedStudent?.resumes.find((item) => item.id === resumeId) ??
    selectedStudent?.resumes.find((item) => item.isDefault) ??
    selectedStudent?.resumes[selectedStudent.resumes.length - 1] ??
    null;

  useEffect(() => {
    void loadStudents();

    return () => {
      if (audioPollTimerRef.current) {
        window.clearTimeout(audioPollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedStudent) {
      setResumeId("");
      return;
    }

    const fallbackResume =
      selectedStudent.resumes.find((item) => item.id === resumeId) ??
      selectedStudent.resumes.find((item) => item.isDefault) ??
      selectedStudent.resumes[selectedStudent.resumes.length - 1] ??
      null;

    setResumeId(fallbackResume?.id ?? "");
  }, [resumeId, selectedStudent]);

  function clearAudioPoll() {
    if (audioPollTimerRef.current) {
      window.clearTimeout(audioPollTimerRef.current);
      audioPollTimerRef.current = null;
    }
  }

  function bindUploadZone(kind: UploadZoneKind) {
    return {
      className:
        draggingZone === kind ? "upload-dropzone is-dragging" : "upload-dropzone",
      onDragEnter: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDraggingZone(kind);
      },
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDraggingZone(kind);
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        setDraggingZone((current) => (current === kind ? null : current));
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDraggingZone(null);
      },
    };
  }

  async function loadStudents() {
    setStudentsLoading(true);

    try {
      const response = await fetch("/api/interview-review/students", {
        cache: "no-store",
      });
      const data = await readJsonResponse<
        InterviewStudentsResponse | { success: false; error: string }
      >(response, "加载学员失败");

      if (!response.ok || !("students" in data)) {
        throw new Error("students" in data ? "加载学员失败" : data.error);
      }

      const nextStudents = data.students.slice().reverse();
      setStudents(nextStudents);

      if (!studentId && nextStudents[0]) {
        setStudentId(nextStudents[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载学员失败");
    } finally {
      setStudentsLoading(false);
    }
  }

  async function handleCreateStudent() {
    const name = newStudentName.trim();

    if (!name) {
      return;
    }

    setCreatingStudent(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/interview-review/students", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      const data = await readJsonResponse<
        InterviewStudentResponse | { success: false; error: string }
      >(response, "创建学员失败");

      if (!response.ok || !("student" in data)) {
        throw new Error("student" in data ? "创建学员失败" : data.error);
      }

      setStudents((current) => [data.student, ...current]);
      setStudentId(data.student.id);
      setResumeId("");
      setNewStudentName("");
      setMessage(`已创建学员 ${data.student.name}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建学员失败");
    } finally {
      setCreatingStudent(false);
    }
  }

  async function uploadResume(file: File) {
    if (!studentId) {
      setError("请先选择或创建学员，再上传简历");
      return;
    }

    setUploadingResume(true);
    setError(null);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/interview-review/students/${encodeURIComponent(studentId)}/resumes`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await readJsonResponse<
        InterviewStudentResponse | { success: false; error: string }
      >(response, "简历上传失败");

      if (!response.ok || !("student" in data)) {
        throw new Error("student" in data ? "简历上传失败" : data.error);
      }

      setStudents((current) => {
        const hasStudent = current.some((item) => item.id === data.student.id);
        if (!hasStudent) {
          return [data.student, ...current];
        }

        return current.map((item) => (item.id === data.student.id ? data.student : item));
      });

      const latestResume = data.student.resumes[data.student.resumes.length - 1] ?? null;
      setResumeId(latestResume?.id ?? "");
      setMessage(`已保存简历 ${file.name}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "简历上传失败");
    } finally {
      setUploadingResume(false);
    }
  }

  async function handleResumeInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      await uploadResume(file);
    }
    event.target.value = "";
  }

  async function prepareJdImage(file: File) {
    setPreparingJdImage(true);
    setError(null);
    setMessage(null);

    try {
      const dataUrl = await fileToDataUrl(file);
      setJdImageDataUrl(dataUrl);
      setJdImageName(file.name);
      setMessage(`已附加 JD 图片 ${file.name}，分析时会直接交给 AI 处理`);
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : "JD 图片读取失败");
    } finally {
      setPreparingJdImage(false);
    }
  }

  async function handleJdImageInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      await prepareJdImage(file);
    }
    event.target.value = "";
  }

  async function pollAudioTask(taskId: string) {
    try {
      const response = await fetch(
        `/api/interview-review/audio/status?taskId=${encodeURIComponent(taskId)}`,
      );
      const data = await readJsonResponse<
        InterviewAudioStatusResponse | { success: false; error: string }
      >(response, "录音转写查询失败");

      if (!response.ok || !data.success) {
        throw new Error(data.success ? "录音转写查询失败" : data.error);
      }

      setAudioTask(data.task);

      if (data.task.status === "completed") {
        clearAudioPoll();
        setRawQaText(data.task.transcribedText ?? "");
        setMessage("录音转写完成，已回填到问答文本框，请检查后再分析");
        return;
      }

      if (data.task.status === "failed") {
        clearAudioPoll();
        setError(data.task.error || "录音转写失败");
        return;
      }

      audioPollTimerRef.current = window.setTimeout(() => {
        void pollAudioTask(taskId);
      }, data.task.nextPollDelayMs ?? 15_000);
    } catch (pollError) {
      clearAudioPoll();
      setError(pollError instanceof Error ? pollError.message : "录音转写查询失败");
    }
  }

  async function uploadAudio(file: File) {
    setError(null);
    setMessage(null);
    setAudioTask(null);
    clearAudioPoll();

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/interview-review/audio/submit", {
        method: "POST",
        body: formData,
      });
      const data = await readJsonResponse<
        InterviewAudioSubmitResponse | { success: false; error: string }
      >(response, "录音转写提交失败");

      if (!response.ok || !data.success) {
        throw new Error(data.success ? "录音转写提交失败" : data.error);
      }

      setAudioTask(data.task);
      setRawQaText("");
      setMessage(`已上传录音 ${file.name}，正在转写`);
      void pollAudioTask(data.task.taskId);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "录音转写提交失败");
    }
  }

  async function handleAudioInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      await uploadAudio(file);
    }
    event.target.value = "";
  }

  async function handleAnalyze() {
    if (!studentId) {
      setError("请先选择或创建学员");
      return;
    }

    if (!selectedResume?.text?.trim()) {
      setError("请先上传并选择简历");
      return;
    }

    if (!rawQaText.trim()) {
      setError(inputMode === "audio" ? "请先完成录音转写并确认文本" : "请填写面试问答内容");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    setReview(null);

    try {
      const response = await fetch("/api/interview-review/text/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          studentId,
          resumeId: selectedResume.id,
          targetRole,
          jdText,
          jdImageDataUrl: jdImageDataUrl || undefined,
          jdImageName: jdImageName || undefined,
          rawQaText,
        }),
      });
      const data = await readJsonResponse<
        AnalyzeInterviewTextResponse | { success: false; error: string }
      >(response, "面试复盘失败");

      if (!response.ok || !("review" in data)) {
        throw new Error("review" in data ? "面试复盘失败" : data.error);
      }

      setReview(data.review);
      setMessage("逐题复盘已生成");
      await loadStudents();
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : "面试复盘失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExport() {
    if (!review) {
      return;
    }

    setExporting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/interview-review/export-docx", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ review }),
      });

      if (!response.ok) {
        const data = await readJsonResponse<{ success: false; error: string }>(
          response,
          "导出失败",
        );
        throw new Error(data.error || "导出失败");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fileName = readFileNameFromDisposition(
        response.headers.get("Content-Disposition"),
      );

      link.href = url;
      link.download = fileName || "面试复盘报告.docx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setMessage("Word 复盘报告已开始下载");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="homework-page">
      <header className="workspace-header">
        <div>
          <span className="section-kicker">Interview Review</span>
          <h2>面试复盘</h2>
          <p>支持文本和录音两种材料入口，简历、JD 图片、录音都可以直接拖进来。</p>
        </div>
      </header>

      <section className="card unified-card">
          <div className="card-header unified-header">
            <div>
              <h3>复盘输入</h3>
            <p>先选学员和简历，再补充 JD，最后选择文本或录音模式执行分析。文本不要求必须手动整理成固定问答格式。</p>
            </div>
          </div>

        <div className="unified-fields">
          <div className="field-block">
            <label className="field-label" htmlFor="interview-student-select">
              学员
            </label>
            <select
              id="interview-student-select"
              className="text-input"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              disabled={studentsLoading}
            >
              <option value="">请选择学员</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="interview-new-student">
              新建学员
            </label>
            <div className="field-header-row">
              <input
                id="interview-new-student"
                className="text-input"
                placeholder="输入学员姓名"
                value={newStudentName}
                onChange={(event) => setNewStudentName(event.target.value)}
                disabled={creatingStudent}
              />
              <button
                type="button"
                className="ghost-button inline-action"
                onClick={() => void handleCreateStudent()}
                disabled={creatingStudent || !newStudentName.trim()}
              >
                {creatingStudent ? "创建中..." : "创建学员"}
              </button>
            </div>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="interview-resume-select">
              已保存简历
            </label>
            <select
              id="interview-resume-select"
              className="text-input"
              value={resumeId}
              onChange={(event) => setResumeId(event.target.value)}
              disabled={!selectedStudent || selectedStudent.resumes.length === 0}
            >
              <option value="">请选择已保存简历</option>
              {selectedStudent?.resumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.filename}
                </option>
              ))}
            </select>
            <p className="form-note">
              {selectedResume
                ? `当前使用：${selectedResume.filename}${selectedResume.updatedAt ? `，更新于 ${formatDateTime(selectedResume.updatedAt)}` : ""}`
                : "当前未选择简历。"}
            </p>
          </div>

          <div className="field-block">
            <label className="field-label">上传简历</label>
            <div
              {...bindUploadZone("resume")}
              role="button"
              tabIndex={uploadingResume ? -1 : 0}
              aria-disabled={uploadingResume}
              onKeyDown={(event) => handleUploadZoneKeyDown(event, resumeFileInputRef)}
              onClick={() => {
                if (!uploadingResume) {
                  openFilePicker(resumeFileInputRef);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDraggingZone(null);
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void uploadResume(file);
                }
              }}
            >
              <input
                ref={resumeFileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleResumeInputChange}
                hidden
              />
              <div className="upload-strip">
                <div className="upload-strip-main">
                  <strong>{uploadingResume ? "正在上传简历..." : "拖拽简历到这里，或点击上传"}</strong>
                  <span>支持 PDF / DOCX，会自动保存到当前学员名下</span>
                </div>
                <div className="upload-strip-side">
                  <span className="upload-cta">{uploadingResume ? "上传中..." : "上传简历"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="interview-target-role">
              目标岗位
            </label>
            <input
              id="interview-target-role"
              className="text-input"
              placeholder="例如：AI 产品经理 / 交互设计师 / 数据产品经理"
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value)}
            />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="interview-jd-text">
              面试 JD 文本
            </label>
            <textarea
              id="interview-jd-text"
              className="support-input"
              placeholder="可选。可以粘贴文字 JD；如果同时上传 JD 图片，分析时会一起提供给 AI。"
              value={jdText}
              onChange={(event) => setJdText(event.target.value)}
            />
          </div>

          <div className="field-block">
            <label className="field-label">上传 JD 图片</label>
            <div
              {...bindUploadZone("jdImage")}
              role="button"
              tabIndex={preparingJdImage ? -1 : 0}
              aria-disabled={preparingJdImage}
              onKeyDown={(event) => handleUploadZoneKeyDown(event, jdImageInputRef)}
              onClick={() => {
                if (!preparingJdImage) {
                  openFilePicker(jdImageInputRef);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDraggingZone(null);
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void prepareJdImage(file);
                }
              }}
            >
              <input
                ref={jdImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleJdImageInputChange}
                hidden
              />
              <div className="upload-strip">
                <div className="upload-strip-main">
                  <strong>{preparingJdImage ? "正在读取 JD 图片..." : "拖拽 JD 图片到这里，或点击上传"}</strong>
                  <span>不会先 OCR，执行分析时会将图片直接交给 AI 处理</span>
                </div>
                <div className="upload-strip-side">
                  <span className="upload-cta">{preparingJdImage ? "读取中..." : "上传图片"}</span>
                </div>
              </div>
            </div>
            {jdImageName ? <p className="form-note">{`当前已附加图片：${jdImageName}`}</p> : null}
          </div>

          <div className="field-block">
            <label className="field-label">面试材料输入方式</label>
            <div className="segmented-row" role="tablist" aria-label="面试材料输入方式">
              <button
                type="button"
                className={inputMode === "text" ? "tab is-active" : "tab"}
                onClick={() => setInputMode("text")}
              >
                直接输入文本
              </button>
              <button
                type="button"
                className={inputMode === "audio" ? "tab is-active" : "tab"}
                onClick={() => setInputMode("audio")}
              >
                上传面试录音
              </button>
            </div>
          </div>

          {inputMode === "audio" ? (
            <div className="field-block">
              <label className="field-label">上传面试录音</label>
              <div
                {...bindUploadZone("audio")}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => handleUploadZoneKeyDown(event, audioFileInputRef)}
                onClick={() => openFilePicker(audioFileInputRef)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDraggingZone(null);
                  const file = event.dataTransfer.files?.[0];
                  if (file) {
                    void uploadAudio(file);
                  }
                }}
              >
                <input
                  ref={audioFileInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.mp4,.mov"
                  onChange={handleAudioInputChange}
                  hidden
                />
                <div className="upload-strip">
                  <div className="upload-strip-main">
                    <strong>拖拽录音到这里，或点击上传</strong>
                    <span>提交后会自动执行转写，完成后把文本回填到下方供你确认</span>
                  </div>
                  <div className="upload-strip-side">
                    <span className="upload-cta">上传录音</span>
                  </div>
                </div>
              </div>
              {audioTask ? <div className="inline-message">{`${audioTask.fileName} · ${audioTask.message}`}</div> : null}
            </div>
          ) : null}

          <div className="field-block">
            <label className="field-label" htmlFor="interview-qa-text">
              {inputMode === "audio" ? "转写文本（可编辑确认）" : "面试问答内容"}
            </label>
            <textarea
              id="interview-qa-text"
              className="support-input"
              placeholder={
                inputMode === "audio"
                  ? "录音转写完成后会自动回填到这里，你可以手动修正后再分析。"
                  : "可以直接粘贴普通转写稿、聊天记录、带发言者的语音文稿，或已经整理好的问答内容。示例：\n问：请介绍一下你最近做过的项目\n答：我最近做的是一个 B 端系统项目..."
              }
              value={rawQaText}
              onChange={(event) => setRawQaText(event.target.value)}
            />
          </div>
        </div>

        <div className="form-footer">
          <button
            type="button"
            className="submit-button"
            disabled={submitting || uploadingResume || studentsLoading || preparingJdImage}
            onClick={() => void handleAnalyze()}
          >
            {submitting ? "分析中..." : "生成逐题复盘"}
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
        {message ? <div className="inline-message">{message}</div> : null}
      </section>

      {review ? (
        <section className="result-panel">
          <div className="result-header">
            <div>
              <span className="section-kicker">Review Result</span>
              <h3>复盘结果</h3>
            </div>
            <div className="result-meta">
              <span>{review.studentName}</span>
              <span>{`${review.qaPairs.length} 道题`}</span>
              {review.createdAt ? <span>{formatDateTime(review.createdAt)}</span> : null}
              <button
                type="button"
                className="ghost-button"
                onClick={() => void handleExport()}
                disabled={exporting}
              >
                {exporting ? "导出中..." : "导出 Word"}
              </button>
            </div>
          </div>

          <div className="review-groups">
            <article className="review-group">
              <div className="review-group-header">
                <h4>整体概览</h4>
                <span>Summary</span>
              </div>
              <div className="review-card">
                <h5>整体结论</h5>
                <p>{review.result.summary.overallConclusion}</p>
                <div className="compare-block">
                  <div>
                    <strong>主要问题</strong>
                    <p>{review.result.summary.mainProblems.join("；") || "材料不足，无法判断"}</p>
                  </div>
                  <div>
                    <strong>主要优势</strong>
                    <p>{review.result.summary.mainStrengths.join("；") || "材料不足，无法判断"}</p>
                  </div>
                </div>
                <div className="single-block">
                  <strong>优先训练方向</strong>
                  <p>{review.result.summary.priorityTrainingFocus.join("；") || "材料不足，无法判断"}</p>
                </div>
              </div>
            </article>

            <article className="review-group">
              <div className="review-group-header">
                <h4>逐题复盘</h4>
                <span>{review.result.items.length}</span>
              </div>
              <div className="review-cards">
                {review.result.items.map((item, index) => (
                  <article key={item.id} className="review-card">
                    <div className="review-card-meta">
                      <div className="review-card-meta-text">
                        <span className="review-module-tag">{`第 ${index + 1} 题 · ${item.questionType}`}</span>
                        <span className="review-location">{item.answerStatus}</span>
                      </div>
                    </div>
                    <h5>{item.question}</h5>
                    <div className="single-block">
                      <strong>面试官考察意图</strong>
                      <p>{item.interviewerIntent}</p>
                    </div>
                    <div className="single-block">
                      <strong>学员回答摘要</strong>
                      <p>{item.candidateAnswerSummary}</p>
                    </div>
                    <div className="single-block">
                      <strong>回答证据</strong>
                      <p>{item.answerEvidenceQuotes.join("；") || "无可引用原话"}</p>
                    </div>
                    <div className="compare-block">
                      <div>
                        <strong>核心问题</strong>
                        <p>{item.analysis.coreIssue}</p>
                      </div>
                      <div>
                        <strong>回答较好的部分</strong>
                        <p>{item.analysis.whatWasAnsweredWell}</p>
                      </div>
                    </div>
                    <div className="compare-block">
                      <div>
                        <strong>缺失信息</strong>
                        <p>{item.analysis.whatWasMissing}</p>
                      </div>
                      <div>
                        <strong>知识或逻辑问题</strong>
                        <p>{item.analysis.knowledgeOrLogicIssues}</p>
                      </div>
                    </div>
                    <div className="compare-block">
                      <div>
                        <strong>简历一致性</strong>
                        <p>{item.analysis.resumeConsistency}</p>
                      </div>
                      <div>
                        <strong>JD 匹配</strong>
                        <p>{item.analysis.jdMatch}</p>
                      </div>
                    </div>
                    <div className="single-block">
                      <strong>优化方向</strong>
                      <p>{item.advice.improvementDirection}</p>
                    </div>
                    <div className="single-block">
                      <strong>具体改进动作</strong>
                      <p>{item.advice.specificActions.join("；") || "材料不足，无法判断"}</p>
                    </div>
                    <div className="single-block">
                      <strong>参考话术</strong>
                      <p>{item.referenceAnswer}</p>
                    </div>
                    <div className="single-block">
                      <strong>知识补充</strong>
                      <p>{item.knowledgeSupplement}</p>
                    </div>
                    <div className="single-block">
                      <strong>风险提示</strong>
                      <p>{item.riskNotes.join("；") || "未发现明显风险"}</p>
                    </div>
                    <div className="single-block">
                      <strong>下一道训练追问</strong>
                      <p>{item.nextPracticeQuestion}</p>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </div>
        </section>
      ) : null}
    </div>
  );
}
