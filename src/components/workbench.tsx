"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ExperienceType,
  OptimizationNote,
  TemplateResumeData,
} from "@/lib/types";
import { HomeworkReviewPage } from "@/components/homework-review/HomeworkReviewPage";
import { PmReviewPage } from "@/components/pm-review/PmReviewPage";

type ActiveTab = "resume" | "notes";
type ToolMode = "optimize" | "pmReview" | "homeworkReview";

const TOOLS: Array<{
  key: ToolMode | "jd" | "coverLetter" | "interview" | "crm";
  name: string;
  description: string;
  active: boolean;
}> = [
    { key: "optimize", name: "简历优化", description: "目标岗位重写", active: true },
    { key: "pmReview", name: "PM 简历批阅", description: "DOCX 批注输出", active: true },
    { key: "homeworkReview", name: "作业批阅", description: "音视频讲解稿", active: true },
    { key: "jd", name: "JD 拆解", description: "即将上线", active: false },
    { key: "coverLetter", name: "求职信生成", description: "即将上线", active: false },
    { key: "interview", name: "面试准备", description: "即将上线", active: false },
    { key: "crm", name: "候选人记录", description: "即将上线", active: false },
  ];

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

async function parseResumeFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/parse-file", {
    method: "POST",
    body: formData,
  });
  const data = (await response.json()) as
    | { success: true; text: string; profilePhotoDataUrl?: string | null }
    | { success: false; error: string };

  if (!response.ok || !data.success) {
    throw new Error(data.success ? "文件解析失败" : data.error);
  }

  return data;
}

export function Workbench({
  initialTool = "optimize",
}: {
  initialTool?: ToolMode;
}) {
  const optimizeFileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTool, setActiveTool] = useState<ToolMode>(initialTool);
  const [previewPayload, setPreviewPayload] = useState<{
    fileName: string;
    text: string;
  } | null>(null);

  useEffect(() => {
    setActiveTool(initialTool);
  }, [initialTool]);

  const [resumeText, setResumeText] = useState("");
  const [targetPosition, setTargetPosition] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [experienceType, setExperienceType] = useState<ExperienceType>("internship");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [profilePhotoDataUrl, setProfilePhotoDataUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{
    resume: string;
    templateResume: TemplateResumeData;
    notes: OptimizationNote[];
    generatedAt: Date;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("resume");

  async function handleOptimizeFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploading(true);
    setUploadMessage(null);
    setError(null);
    setUploadedFileName(file.name);
    setResult(null);

    try {
      const data = await parseResumeFile(file);
      setResumeText(data.text);
      setProfilePhotoDataUrl(data.profilePhotoDataUrl ?? null);
      setUploadMessage(`已解析 ${file.name}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "文件解析失败");
      setProfilePhotoDataUrl(null);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
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

  function stopUploadZoneClick(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCopyMessage(null);

    if (!resumeText.trim()) {
      setError("请先上传原始简历文件");
      return;
    }

    if (!targetPosition.trim()) {
      setError("请填写目标岗位");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/optimize-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          targetPosition,
          additionalInfo,
          experienceType,
        }),
      });

      const data = (await response.json()) as
        | {
          success: true;
          resume: string;
          templateResume: TemplateResumeData;
          notes: OptimizationNote[];
        }
        | { success: false; error: string; details?: string[] };

      if (!response.ok || !data.success) {
        if (!data.success && data.details?.length) {
          throw new Error(`${data.error}：${data.details.join("；")}`);
        }

        throw new Error(data.success ? "生成失败" : data.error);
      }

      setResult({
        resume: data.resume,
        templateResume: data.templateResume,
        notes: data.notes,
        generatedAt: new Date(),
      });
      setActiveTab("resume");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result?.resume) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.resume);
      setCopyMessage("简历内容已复制");
      window.setTimeout(() => setCopyMessage(null), 1800);
    } catch {
      setCopyMessage("复制失败，请手动复制");
    }
  }

  function handleDownload() {
    if (!result?.templateResume) {
      return;
    }

    setDownloading(true);
    setError(null);

    void (async () => {
      try {
        const response = await fetch("/api/export-resume-docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateResume: result.templateResume,
            uploadedFileName,
            targetPosition,
            profilePhotoDataUrl,
          }),
        });

        if (!response.ok) {
          const data = (await response.json()) as { success: false; error: string };
          throw new Error(data.error || "Word 导出失败");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        const fileName = readFileNameFromDisposition(
          response.headers.get("Content-Disposition"),
        );

        link.href = url;
        link.download = fileName || "优化简历.docx";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        setCopyMessage("Word 简历已开始下载");
        window.setTimeout(() => setCopyMessage(null), 1800);
      } catch (downloadError) {
        setError(
          downloadError instanceof Error ? downloadError.message : "Word 导出失败",
        );
      } finally {
        setDownloading(false);
      }
    })();
  }

  return (
    <main className="workbench-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-block">
            <span className="brand-kicker">Consultant Workbench</span>
            <h1>求职顾问工作台</h1>
            <p>把日常服务流程拆成一组稳定可复用的 AI 工具。</p>
          </div>

          <nav className="tool-nav" aria-label="工具导航">
            {TOOLS.map((tool) => {
              const isCurrent = activeTool === tool.key;
              const href =
                tool.key === "pmReview"
                  ? "/?tool=pm-review"
                  : tool.key === "homeworkReview"
                    ? "/?tool=homework-review"
                  : tool.key === "optimize"
                    ? "/"
                    : null;
              const targetTool =
                tool.key === "pmReview" ||
                tool.key === "optimize" ||
                tool.key === "homeworkReview"
                  ? tool.key
                  : null;

              if (href && targetTool) {
                return (
                  <Link
                    key={tool.key}
                    href={href}
                    className={isCurrent ? "tool-item is-active" : "tool-item"}
                    aria-current={isCurrent ? "page" : undefined}
                    onClick={() => setActiveTool(targetTool)}
                  >
                    <span>{tool.name}</span>
                    <small>{tool.description}</small>
                  </Link>
                );
              }

              return (
                <button
                  key={tool.key}
                  type="button"
                  className={isCurrent ? "tool-item is-active" : "tool-item"}
                  disabled
                >
                  <span>{tool.name}</span>
                  <small>{tool.description}</small>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <section className="workspace">
        {activeTool === "optimize" ? (
          <>
            <header className="workspace-header">
              <div>
                <span className="section-kicker">Resume Optimization</span>
                <h2>简历优化 Agent</h2>
                <p>上传简历文件，填写目标岗位与补充信息，然后直接生成优化结果。</p>
              </div>
            </header>

            <form className="workspace-form" onSubmit={handleSubmit}>
              <section className="card unified-card">
                <div className="card-header unified-header">
                  <div>
                    <h3>简历优化输入</h3>
                    <p>上传简历后，补充目标岗位与说明信息，然后直接生成。</p>
                  </div>
                </div>

                <div
                  className="upload-dropzone"
                  role="button"
                  tabIndex={uploading || loading ? -1 : 0}
                  aria-disabled={uploading || loading}
                  onClick={() => {
                    if (!uploading && !loading) {
                      openFilePicker(optimizeFileInputRef);
                    }
                  }}
                  onKeyDown={(event) =>
                    handleUploadZoneKeyDown(event, optimizeFileInputRef)
                  }
                >
                  <input
                    ref={optimizeFileInputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleOptimizeFileChange}
                    disabled={uploading || loading}
                  />
                  <div className="upload-strip">
                    <div className="upload-strip-main">
                      <strong>
                        {uploading
                          ? "正在解析简历文件..."
                          : uploadedFileName || "点击这里上传简历文件"}
                      </strong>
                      <span>
                        {resumeText
                          ? "已完成解析，可继续填写岗位并预览简历内容"
                          : "支持 PDF / DOCX，最大 10MB"}
                      </span>
                    </div>
                    <div className="upload-strip-side">
                      {resumeText ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={(event) => {
                            stopUploadZoneClick(event);
                            setPreviewPayload({
                              fileName: uploadedFileName || "简历预览",
                              text: resumeText,
                            });
                          }}
                        >
                          预览简历
                        </button>
                      ) : (
                        <span className="upload-cta">
                          {uploading ? "解析中..." : "上传文件"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="unified-fields">
                  <div className="field-block">
                    <label className="field-label" htmlFor="target-position">
                      目标岗位
                    </label>
                    <input
                      id="target-position"
                      className="text-input"
                      placeholder="例如：高级产品经理"
                      value={targetPosition}
                      onChange={(event) => setTargetPosition(event.target.value)}
                    />
                  </div>

                  <div className="field-block">
                    <label className="field-label" htmlFor="experience-type">
                      经历标题
                    </label>
                    <select
                      id="experience-type"
                      className="text-input"
                      value={experienceType}
                      onChange={(event) =>
                        setExperienceType(event.target.value as ExperienceType)
                      }
                    >
                      <option value="internship">实习经历</option>
                      <option value="work">工作经历</option>
                    </select>
                  </div>

                  <div className="field-block">
                    <label className="field-label" htmlFor="additional-info">
                      补充信息
                    </label>
                    <textarea
                      id="additional-info"
                      className="support-input"
                      placeholder="例如：近期负责过跨部门项目、拿过证书、参与过数据化增长项目"
                      value={additionalInfo}
                      onChange={(event) => setAdditionalInfo(event.target.value)}
                    />
                  </div>
                </div>

                <div className="form-footer">
                  <button
                    type="submit"
                    className="submit-button"
                    disabled={loading || uploading}
                  >
                    {loading ? "生成中..." : "生成优化简历"}
                  </button>
                </div>

                {uploadMessage ? <div className="inline-message">{uploadMessage}</div> : null}
                {error ? <div className="error-banner">{error}</div> : null}
                {copyMessage ? <div className="inline-message">{copyMessage}</div> : null}
              </section>
            </form>

            {result ? (
              <section className="result-panel">
                <div className="result-header">
                  <div>
                    <span className="section-kicker">Result Workspace</span>
                    <h3>优化结果</h3>
                  </div>

                  <div className="result-meta">
                    <span>{`生成于 ${formatTime(result.generatedAt)}`}</span>
                    <button type="button" className="ghost-button" onClick={handleCopy}>
                      复制全文
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={handleDownload}
                      disabled={downloading}
                    >
                      {downloading ? "导出中..." : "导出 Word"}
                    </button>
                  </div>
                </div>

                <div className="tab-row" role="tablist" aria-label="结果类型">
                  <button
                    type="button"
                    className={activeTab === "resume" ? "tab is-active" : "tab"}
                    onClick={() => setActiveTab("resume")}
                  >
                    优化后简历
                  </button>
                  <button
                    type="button"
                    className={activeTab === "notes" ? "tab is-active" : "tab"}
                    onClick={() => setActiveTab("notes")}
                  >
                    修改说明
                  </button>
                </div>

                {activeTab === "resume" ? (
                  <article className="resume-paper markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {result.resume}
                    </ReactMarkdown>
                  </article>
                ) : null}

                {activeTab === "notes" ? (
                  <div className="notes-grid">
                    {result.notes.length ? (
                      result.notes.map((note, index) => (
                        <article className="note-card" key={`${note.point}-${index}`}>
                          <div className="note-top">
                            <span className="note-category">{note.category}</span>
                            <span className={`confidence confidence-${note.confidence}`}>
                              {note.confidence}
                            </span>
                          </div>
                          <h4>{note.point}</h4>
                          {note.needs_confirmation ? (
                            <div className="warning-chip">需人工确认</div>
                          ) : null}
                          {note.before ? (
                            <div className="compare-block">
                              <div>
                                <strong>原内容</strong>
                                <p>{note.before}</p>
                              </div>
                              <div>
                                <strong>优化后</strong>
                                <p>{note.after}</p>
                              </div>
                            </div>
                          ) : note.after ? (
                            <div className="single-block">
                              <strong>优化后</strong>
                              <p>{note.after}</p>
                            </div>
                          ) : null}
                          <div className="single-block">
                            <strong>调整原因</strong>
                            <p>{note.reason}</p>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state subtle">
                        <h4>本次没有可解析的修改说明</h4>
                        <p>优化后简历仍可使用，若你需要说明卡片，可以重新生成一次。</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {activeTool === "pmReview" ? <PmReviewPage /> : null}
        {activeTool === "homeworkReview" ? <HomeworkReviewPage /> : null}
      </section>

      {previewPayload ? (
        <div className="modal-shell" role="dialog" aria-modal="true" aria-label="简历预览">
          <div className="modal-backdrop" onClick={() => setPreviewPayload(null)} />
          <div className="modal-panel">
            <div className="modal-header">
              <div>
                <span className="section-kicker">Resume Preview</span>
                <h3>{previewPayload.fileName}</h3>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setPreviewPayload(null)}
              >
                关闭
              </button>
            </div>
            <div className="modal-content">
              <pre className="preview-text">{previewPayload.text}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
