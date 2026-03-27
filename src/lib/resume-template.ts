import type {
  ExperienceType,
  ResumeTemplateDraft,
  TemplateCampusExperienceEntry,
  TemplateEducationEntry,
  TemplateExperienceEntry,
  TemplateProjectEntry,
  TemplateResumeData,
} from "@/lib/types";

const EDUCATION_SECTION_END_PATTERN =
  /(专业能力|工作经历|实习经历|项目经历|在校经历|校园经历|个人优势|自我评价)/u;

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+\n/g, "\n").replace(/\u00a0/g, " ").trim();
}

function cleanList(values: string[] | null | undefined) {
  return (values ?? []).map(cleanText).filter(Boolean);
}

function cleanEducation(entry: TemplateEducationEntry): TemplateEducationEntry {
  return {
    period: cleanText(entry.period),
    school: cleanText(entry.school),
    major: cleanText(entry.major),
    degree: cleanText(entry.degree),
    coreCourses: cleanText(entry.coreCourses),
    honors: cleanText(entry.honors),
    certificates: cleanText(entry.certificates),
  };
}

function compactText(value: string) {
  return cleanText(value).replace(/[，,。；;：:\s｜|、（）()【】\[\]·]/gu, "");
}

function tokenizeEvidence(value: string) {
  return cleanText(value)
    .split(/[，,。；;：:\s｜|、（）()【】\[\]·]/u)
    .map((part) => cleanText(part))
    .filter((part) => part.length >= 2);
}

function hasFieldSupport(fieldValue: string, blockText: string) {
  const compactField = compactText(fieldValue);
  const compactBlock = compactText(blockText);

  if (!compactField) {
    return true;
  }

  if (compactBlock.includes(compactField)) {
    return true;
  }

  const tokens = tokenizeEvidence(fieldValue);
  if (!tokens.length) {
    return false;
  }

  let matched = 0;
  for (const token of tokens) {
    if (compactBlock.includes(compactText(token))) {
      matched += 1;
    }
  }

  return matched / tokens.length >= 0.6;
}

function extractEducationSection(sourceResumeText: string) {
  const text = cleanText(sourceResumeText);

  if (!text) {
    return "";
  }

  const headingMatch = /教育经历/u.exec(text);
  const sectionText = headingMatch
    ? text.slice(headingMatch.index + headingMatch[0].length)
    : text;
  const endMatch = EDUCATION_SECTION_END_PATTERN.exec(sectionText);

  return endMatch ? sectionText.slice(0, endMatch.index) : sectionText;
}

function extractEducationBlocks(
  sourceResumeText: string,
  schools: string[],
): Map<string, string> {
  const searchScopes = [
    extractEducationSection(sourceResumeText),
    cleanText(sourceResumeText),
  ].filter(Boolean);
  const blocks = new Map<string, string>();

  for (const scope of searchScopes) {
    const schoolIndexes = schools
      .map((school) => ({
        school,
        index: scope.indexOf(school),
      }))
      .filter((item) => item.index >= 0)
      .sort((left, right) => left.index - right.index);

    if (!schoolIndexes.length) {
      continue;
    }

    for (let idx = 0; idx < schoolIndexes.length; idx += 1) {
      const current = schoolIndexes[idx];
      const end = schoolIndexes[idx + 1]?.index ?? scope.length;
      const blockText = cleanText(scope.slice(current.index, end));

      if (blockText) {
        blocks.set(current.school, blockText);
      }
    }

    if (blocks.size === schoolIndexes.length) {
      break;
    }
  }

  return blocks;
}

function hasEducationFieldSupport(
  fieldValue: string,
  blockText: string,
  educationSectionText: string,
  totalEducationEntries: number,
) {
  if (!cleanText(fieldValue)) {
    return true;
  }

  if (blockText && hasFieldSupport(fieldValue, blockText)) {
    return true;
  }

  // PDF 纯文本抽取常把“主修课程/荣誉证书”放到学校名称前面。
  // 只有单学历条目时，允许回退到整个教育板块做依据判断，避免误杀。
  if (totalEducationEntries <= 1 && hasFieldSupport(fieldValue, educationSectionText)) {
    return true;
  }

  return false;
}

function sanitizeEducationFields(
  entries: TemplateEducationEntry[],
  sourceResumeText: string,
) {
  const schools = dedupeList(entries.map((entry) => entry.school));
  const blocks = extractEducationBlocks(sourceResumeText, schools);
  const educationSectionText = extractEducationSection(sourceResumeText);
  const totalEducationEntries = entries.filter((entry) => cleanText(entry.school)).length;

  return entries.map((entry) => {
    const blockText = blocks.get(entry.school) ?? "";

    if (!blockText) {
      return {
        ...entry,
        coreCourses: hasEducationFieldSupport(
          entry.coreCourses,
          "",
          educationSectionText,
          totalEducationEntries,
        )
          ? entry.coreCourses
          : "",
        honors: hasEducationFieldSupport(
          entry.honors,
          "",
          educationSectionText,
          totalEducationEntries,
        )
          ? entry.honors
          : "",
        certificates: hasEducationFieldSupport(
          entry.certificates,
          "",
          educationSectionText,
          totalEducationEntries,
        )
          ? entry.certificates
          : "",
      };
    }

    return {
      ...entry,
      coreCourses: hasEducationFieldSupport(
        entry.coreCourses,
        blockText,
        educationSectionText,
        totalEducationEntries,
      )
        ? entry.coreCourses
        : "",
      honors: hasEducationFieldSupport(
        entry.honors,
        blockText,
        educationSectionText,
        totalEducationEntries,
      )
        ? entry.honors
        : "",
      certificates: hasEducationFieldSupport(
        entry.certificates,
        blockText,
        educationSectionText,
        totalEducationEntries,
      )
        ? entry.certificates
        : "",
    };
  });
}

export function findUnsupportedEducationFields(
  entries: TemplateEducationEntry[],
  sourceResumeText: string,
) {
  const schools = dedupeList(entries.map((entry) => entry.school));
  const blocks = extractEducationBlocks(sourceResumeText, schools);
  const educationSectionText = extractEducationSection(sourceResumeText);
  const totalEducationEntries = entries.filter((entry) => cleanText(entry.school)).length;
  const violations: string[] = [];

  for (const entry of entries) {
    const blockText = blocks.get(entry.school) ?? "";

    if (
      entry.coreCourses &&
      !hasEducationFieldSupport(
        entry.coreCourses,
        blockText,
        educationSectionText,
        totalEducationEntries,
      )
    ) {
      violations.push(`${entry.school} 的核心课程缺少原文依据`);
    }

    if (
      entry.honors &&
      !hasEducationFieldSupport(
        entry.honors,
        blockText,
        educationSectionText,
        totalEducationEntries,
      )
    ) {
      violations.push(`${entry.school} 的荣誉信息缺少原文依据`);
    }

    if (
      entry.certificates &&
      !hasEducationFieldSupport(
        entry.certificates,
        blockText,
        educationSectionText,
        totalEducationEntries,
      )
    ) {
      violations.push(`${entry.school} 的证书信息缺少原文依据`);
    }
  }

  return dedupeList(violations);
}

function cleanExperience(entry: TemplateExperienceEntry): TemplateExperienceEntry {
  return {
    period: cleanText(entry.period),
    company: cleanText(entry.company),
    role: cleanText(entry.role),
    companySummary: cleanText(entry.companySummary),
    responsibilities: cleanList(entry.responsibilities),
    achievements: cleanList(entry.achievements),
  };
}

function cleanProject(entry: TemplateProjectEntry): TemplateProjectEntry {
  return {
    period: cleanText(entry.period),
    name: cleanText(entry.name),
    role: cleanText(entry.role),
    summary: cleanText(entry.summary),
    highlights: cleanList(entry.highlights),
  };
}

function dedupeList(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) {
      continue;
    }

    const key = cleaned.replace(/\s+/g, " ");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function mergeText(existing: string, incoming: string) {
  const current = cleanText(existing);
  const next = cleanText(incoming);

  if (!current) {
    return next;
  }

  if (!next || current === next) {
    return current;
  }

  if (current.includes(next)) {
    return current;
  }

  if (next.includes(current)) {
    return next;
  }

  return `${current}；${next}`;
}

function parseYearMonth(text: string) {
  const match = text.match(/(\d{4})\s*[.\-/年]\s*(\d{1,2})/u);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  return year * 100 + month;
}

function formatYearMonth(value: number) {
  const year = Math.floor(value / 100);
  const month = value % 100;
  return `${year}.${String(month).padStart(2, "0")}`;
}

function mergePeriods(periods: string[]) {
  const cleaned = dedupeList(periods);

  if (cleaned.length <= 1) {
    return cleaned[0] ?? "";
  }

  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  let hasPresent = false;

  for (const period of cleaned) {
    const parts = period
      .split(/[-~—至]/u)
      .map((part) => cleanText(part))
      .filter(Boolean);
    const lastPart = parts[parts.length - 1] ?? "";

    if (!parts.length) {
      return cleaned.join("；");
    }

    const start = parseYearMonth(parts[0]);
    const end =
      /至今|现在|当前/u.test(period) || lastPart === "至今"
        ? null
        : parseYearMonth(lastPart);

    if (!start) {
      return cleaned.join("；");
    }

    earliest = Math.min(earliest, start);

    if (end) {
      latest = Math.max(latest, end);
    } else {
      hasPresent = true;
    }
  }

  if (!Number.isFinite(earliest)) {
    return cleaned.join("；");
  }

  return hasPresent
    ? `${formatYearMonth(earliest)}-至今`
    : `${formatYearMonth(earliest)}-${formatYearMonth(latest)}`;
}

function mergeSameRoleExperiences(entries: TemplateExperienceEntry[]) {
  const merged: Array<TemplateExperienceEntry & { periods: string[] }> = [];
  const indexByKey = new Map<string, number>();

  for (const entry of entries) {
    const company = cleanText(entry.company);
    const role = cleanText(entry.role);
    const canMerge = Boolean(company && role);
    const key = canMerge ? `${company}__${role}` : `__unique_${merged.length}`;

    if (!canMerge || !indexByKey.has(key)) {
      indexByKey.set(key, merged.length);
      merged.push({
        ...entry,
        company,
        role,
        periods: entry.period ? [cleanText(entry.period)] : [],
        responsibilities: dedupeList(entry.responsibilities),
        achievements: dedupeList(entry.achievements),
      });
      continue;
    }

    const target = merged[indexByKey.get(key)!];
    target.periods = dedupeList([...target.periods, cleanText(entry.period)]);
    target.period = mergePeriods(target.periods);
    target.companySummary = mergeText(target.companySummary, entry.companySummary);
    target.responsibilities = dedupeList([
      ...target.responsibilities,
      ...entry.responsibilities,
    ]);
    target.achievements = dedupeList([...target.achievements, ...entry.achievements]);
  }

  return merged.map(({ periods: _periods, ...entry }) => ({
    ...entry,
    period: mergePeriods(_periods),
  }));
}

function cleanCampusExperience(
  entry: TemplateCampusExperienceEntry,
): TemplateCampusExperienceEntry {
  return {
    mode: entry.mode === "detailed" ? "detailed" : "bullets",
    period: cleanText(entry.period),
    title: cleanText(entry.title),
    role: cleanText(entry.role),
    bullets: cleanList(entry.bullets),
    background: cleanText(entry.background),
    responsibilities: cleanText(entry.responsibilities),
    result: cleanText(entry.result),
  };
}

export function finalizeTemplateResume(
  draft: ResumeTemplateDraft,
  experienceType: ExperienceType,
  sourceResumeText = "",
): TemplateResumeData {
  const experiences = draft.experiences.map(cleanExperience);
  const educations = sanitizeEducationFields(
    draft.educations.map(cleanEducation),
    sourceResumeText,
  );

  return {
    experienceSectionTitle: experienceType === "work" ? "工作经历" : "实习经历",
    personal: {
      name: cleanText(draft.personal.name),
      phone: cleanText(draft.personal.phone),
      email: cleanText(draft.personal.email),
      age: cleanText(draft.personal.age),
      highestEducation: cleanText(draft.personal.highestEducation),
    },
    educations,
    professionalStrengths: {
      summary: cleanText(draft.professionalStrengths.summary),
      skillLines: cleanList(draft.professionalStrengths.skillLines),
      coreQuality: cleanText(draft.professionalStrengths.coreQuality),
    },
    experiences: mergeSameRoleExperiences(experiences),
    projects: draft.projects.map(cleanProject),
    campusExperiences: draft.campusExperiences.map(cleanCampusExperience),
  };
}

function lineOrDash(label: string, value: string) {
  return `${label}${value}`;
}

function bulletLines(items: string[]) {
  return items.map((item) => `- ${item}`);
}

function nestedBulletBlock(label: string, items: string[]) {
  const cleaned = items.map(cleanText).filter(Boolean);

  if (!cleaned.length) {
    return [];
  }

  return [`- ${label}`, ...cleaned.map((item) => `  - ${item}`)];
}

function renderEducation(entry: TemplateEducationEntry) {
  const headerParts = [entry.period, entry.school, entry.major]
    .filter(Boolean)
    .join(" ｜ ");
  const degreeSuffix = entry.degree ? ` ｜ ${entry.degree}` : "";

  return [
    headerParts ? `- ${headerParts}${degreeSuffix}` : null,
    entry.coreCourses ? `- 核心课程：${entry.coreCourses}` : null,
    entry.honors ? `- 在校成绩及荣誉：${entry.honors}` : null,
    entry.certificates ? `- 技能证书：${entry.certificates}` : null,
  ].filter(Boolean) as string[];
}

function renderExperience(
  entry: TemplateExperienceEntry,
) {
  const heading = [entry.period, entry.company, entry.role]
    .filter(Boolean)
    .join(" ｜ ");

  return [
    heading ? `**${heading}**` : null,
    entry.companySummary ? `- 公司简介：${entry.companySummary}` : null,
    ...nestedBulletBlock("工作内容", entry.responsibilities),
    ...nestedBulletBlock("工作成果/个人收获", entry.achievements),
  ].filter(Boolean);
}

function renderProject(entry: TemplateProjectEntry) {
  const heading = [entry.period, entry.name, entry.role]
    .filter(Boolean)
    .join(" ｜ ");

  return [
    heading ? `**${heading}**` : null,
    entry.summary ? `- 项目介绍：${entry.summary}` : null,
    ...nestedBulletBlock("项目职责和成果", entry.highlights),
  ].filter(Boolean);
}

function renderCampusExperience(
  entry: TemplateCampusExperienceEntry,
) {
  const header = [entry.period, entry.title, entry.role]
    .filter(Boolean)
    .join(" ｜ ");

  if (entry.mode === "detailed") {
    return [
      header ? `**${header}**` : null,
      entry.background ? `- 背景介绍：${entry.background}` : null,
      entry.responsibilities ? `- 核心职责：${entry.responsibilities}` : null,
      entry.result ? `- 项目成绩：${entry.result}` : null,
    ].filter(Boolean);
  }

  return [
    header ? `**${header}**` : null,
    ...bulletLines(entry.bullets),
  ].filter(Boolean);
}

export function renderResumePreviewMarkdown(resume: TemplateResumeData) {
  const sections: string[] = [];
  const name = resume.personal.name || "未命名候选人";

  sections.push(`# ${name}`);
  sections.push(
    [
      lineOrDash("电话：", resume.personal.phone),
      lineOrDash("邮箱：", resume.personal.email),
      lineOrDash("年龄：", resume.personal.age),
      lineOrDash("最高学历：", resume.personal.highestEducation),
    ]
      .filter(Boolean)
      .join(" ｜ "),
  );

  if (resume.educations.length) {
    sections.push(
      ["## 教育经历", ...resume.educations.flatMap(renderEducation)].join("\n"),
    );
  }

  const professionalLines = [
    resume.professionalStrengths.summary
      ? `1. **专业经验：** ${resume.professionalStrengths.summary}`
      : null,
    resume.professionalStrengths.skillLines.length ? "2. **专业技能：**" : null,
    ...resume.professionalStrengths.skillLines.map((item) => `   - ${item}`),
    resume.professionalStrengths.coreQuality
      ? `**核心素质：** ${resume.professionalStrengths.coreQuality}`
      : null,
  ].filter(Boolean) as string[];

  if (professionalLines.length) {
    sections.push(["## 专业能力", ...professionalLines].join("\n"));
  }

  if (resume.experiences.length) {
    sections.push(
      [
        `## ${resume.experienceSectionTitle}`,
        ...resume.experiences.flatMap((entry) => renderExperience(entry)),
      ].join("\n\n"),
    );
  }

  if (resume.projects.length) {
    sections.push(
      [
        "## 项目经历",
        ...resume.projects.flatMap((entry) => renderProject(entry)),
      ].join("\n\n"),
    );
  }

  if (resume.campusExperiences.length) {
    sections.push(
      [
        "## 在校经历",
        ...resume.campusExperiences.flatMap((entry) => renderCampusExperience(entry)),
      ].join("\n\n"),
    );
  }

  return sections.filter(Boolean).join("\n\n").trim();
}

export function collectResumeStrings(resume: TemplateResumeData | ResumeTemplateDraft) {
  const values: string[] = [];

  const push = (value: string) => {
    const text = cleanText(value);
    if (text) {
      values.push(text);
    }
  };

  const pushMany = (items: string[]) => {
    for (const item of items) {
      push(item);
    }
  };

  push((resume as TemplateResumeData).experienceSectionTitle ?? "");
  push(resume.personal.name);
  push(resume.personal.phone);
  push(resume.personal.email);
  push(resume.personal.age);
  push(resume.personal.highestEducation);

  for (const education of resume.educations) {
    push(education.period);
    push(education.school);
    push(education.major);
    push(education.degree);
    push(education.coreCourses);
    push(education.honors);
    push(education.certificates);
  }

  push(resume.professionalStrengths.summary);
  pushMany(resume.professionalStrengths.skillLines);
  push(resume.professionalStrengths.coreQuality);

  for (const experience of resume.experiences) {
    push(experience.period);
    push(experience.company);
    push(experience.role);
    push(experience.companySummary);
    pushMany(experience.responsibilities);
    pushMany(experience.achievements);
  }

  for (const project of resume.projects) {
    push(project.period);
    push(project.name);
    push(project.role);
    push(project.summary);
    pushMany(project.highlights);
  }

  for (const campus of resume.campusExperiences) {
    push(campus.period);
    push(campus.title);
    push(campus.role);
    pushMany(campus.bullets);
    push(campus.background);
    push(campus.responsibilities);
    push(campus.result);
  }

  return values;
}

export function createResumeFileName(
  uploadedFileName: string | null | undefined,
  targetPosition: string,
  extension = "docx",
) {
  const sourceName =
    uploadedFileName?.replace(/\.(pdf|docx)$/i, "") ||
    cleanText(targetPosition) ||
    "resume";

  const safeName = sourceName
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return `${safeName || "resume"}-优化简历.${extension}`;
}

export function createPmReviewFileName(
  uploadedFileName: string | null | undefined,
  extension = "docx",
) {
  const sourceName =
    uploadedFileName?.replace(/\.docx$/i, "") ||
    "pm-resume-review";
  const safeName = sourceName
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return `${safeName || "pm-resume-review"}-批阅结果.${extension}`;
}
