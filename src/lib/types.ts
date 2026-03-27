export const NOTE_CATEGORIES = [
  "模块重组",
  "内容改写",
  "关键词对齐",
  "信息删减",
  "新增整合",
  "风险提示",
] as const;

export const NOTE_CONFIDENCE = ["high", "medium", "low"] as const;
export const EXPERIENCE_TYPES = ["internship", "work"] as const;
export const EXPERIENCE_SECTION_TITLES = ["实习经历", "工作经历"] as const;
export const PM_REVIEW_MODULES = [
  "整体结构",
  "基础信息",
  "自我评价",
  "教育经历",
  "工作经历",
  "项目经历",
  "格式",
] as const;
export const PM_REVIEW_ACTION_TYPES = [
  "rewrite",
  "delete",
  "merge",
  "reorder",
  "format",
  "verify",
  "condense",
  "add",
] as const;

export type NoteCategory = (typeof NOTE_CATEGORIES)[number];
export type NoteConfidence = (typeof NOTE_CONFIDENCE)[number];
export type ExperienceType = (typeof EXPERIENCE_TYPES)[number];
export type ExperienceSectionTitle = (typeof EXPERIENCE_SECTION_TITLES)[number];
export type PmReviewModule = (typeof PM_REVIEW_MODULES)[number];
export type PmReviewActionType = (typeof PM_REVIEW_ACTION_TYPES)[number];

export interface OptimizationNote {
  category: NoteCategory;
  point: string;
  before: string;
  after: string;
  reason: string;
  confidence: NoteConfidence;
  needs_confirmation: boolean;
}

export interface TemplatePersonalInfo {
  name: string;
  phone: string;
  email: string;
  age: string;
  highestEducation: string;
}

export interface TemplateEducationEntry {
  period: string;
  school: string;
  major: string;
  degree: string;
  coreCourses: string;
  honors: string;
  certificates: string;
}

export interface TemplateProfessionalStrengths {
  summary: string;
  skillLines: string[];
  coreQuality: string;
}

export interface TemplateExperienceEntry {
  period: string;
  company: string;
  role: string;
  companySummary: string;
  responsibilities: string[];
  achievements: string[];
}

export interface TemplateProjectEntry {
  period: string;
  name: string;
  role: string;
  summary: string;
  highlights: string[];
}

export interface TemplateCampusExperienceEntry {
  mode: "bullets" | "detailed";
  period: string;
  title: string;
  role: string;
  bullets: string[];
  background: string;
  responsibilities: string;
  result: string;
}

export interface ResumeTemplateDraft {
  personal: TemplatePersonalInfo;
  educations: TemplateEducationEntry[];
  professionalStrengths: TemplateProfessionalStrengths;
  experiences: TemplateExperienceEntry[];
  projects: TemplateProjectEntry[];
  campusExperiences: TemplateCampusExperienceEntry[];
}

export interface TemplateResumeData extends ResumeTemplateDraft {
  experienceSectionTitle: ExperienceSectionTitle;
}

export interface OptimizeResumeRequest {
  resumeText: string;
  targetPosition: string;
  additionalInfo?: string;
  experienceType?: ExperienceType;
}

export interface OptimizeResumeResponse {
  success: true;
  resume: string;
  templateResume: TemplateResumeData;
  notes: OptimizationNote[];
}

export interface ExportResumeDocxRequest {
  templateResume: TemplateResumeData;
  uploadedFileName?: string | null;
  targetPosition?: string;
  profilePhotoDataUrl?: string | null;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string[];
}

export interface PmReviewComment {
  sectionTitleOriginal: string;
  normalizedModule?: PmReviewModule;
  location: string;
  anchorText: string;
  issueType: string;
  actionType: PmReviewActionType;
  comment: string;
  suggestion: string;
  example?: string;
  confidence: NoteConfidence;
  needsConfirmation: boolean;
  searchEvidence?: string;
  previousRoundStatus?: PmReviewPreviousRoundStatus;
}

export interface ReviewPmResumeRequest {
  resumeText: string;
  sessionId?: string;
}

export interface ReviewPmResumeResponse {
  success: true;
  comments: PmReviewComment[];
}

export interface ExportPmReviewDocxRequest {
  uploadedFileName?: string | null;
  comments: PmReviewComment[];
}

// ─── PM 批阅 Agent 新增类型（M1 升级） ───────────────────────────────────────

export const PM_REVIEW_PREVIOUS_ROUND_STATUS = [
  "new",
  "modified",
  "unchanged",
  "resolved",
] as const;
export type PmReviewPreviousRoundStatus = (typeof PM_REVIEW_PREVIOUS_ROUND_STATUS)[number];

/** 结构识别输出的单个模块信息 */
export interface ModuleInfo {
  sectionTitle: string;
  normalizedModule: string;
  textContent: string;
  needsDeepReview: boolean;
  mayNeedSearch: boolean;
}

/** 结构识别完整输出 */
export interface StructureAnalysis {
  modules: ModuleInfo[];
  missingModules: string[];
  redundantModules: string[];
}

/** 批阅会话 */
export interface ReviewSession {
  id: string;
  studentName: string;
  createdAt: string;
  lastReviewAt?: string;
  reviewCount: number;
}

/** 单次批阅历史记录 */
export interface ReviewHistoryEntry {
  round: number;
  timestamp: string;
  resumeText: string;
  comments: PmReviewComment[];
}

/** 公司搜索结果 */
export interface CompanySearchResult {
  name: string;
  industry: string;
  scale: string;
  mainBusiness: string;
  source: string;
}

/** 行业搜索结果 */
export interface IndustrySearchResult {
  benchmark: string;
  source: string;
  confidence: NoteConfidence;
}
