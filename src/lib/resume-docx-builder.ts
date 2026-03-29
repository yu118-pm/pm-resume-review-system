import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";
import type {
  TemplateCampusExperienceEntry,
  TemplateEducationEntry,
  TemplateExperienceEntry,
  TemplateProjectEntry,
  TemplateResumeData,
} from "./types.ts";

type SupportedImageType = "png" | "jpg";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const WP_NS =
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const OFFICE_REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const TEMPLATE_PATH = join(process.cwd(), "templates", "resume-template.docx");
const PHOTO_PLACEHOLDER_DESCR = "icon.jpg";
const COMMENT_PARTS = new Set([
  "word/comments.xml",
  "word/commentsExtended.xml",
  "word/people.xml",
]);
const COMMENT_RELATIONSHIP_TYPES = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
  "http://schemas.microsoft.com/office/2011/relationships/commentsExtended",
  "http://schemas.microsoft.com/office/2011/relationships/people",
]);
const COMMENT_OVERRIDE_PARTS = new Set([
  "/word/comments.xml",
  "/word/commentsExtended.xml",
  "/word/people.xml",
]);
const COMMENT_TAG_NAMES = new Set([
  "w:commentRangeStart",
  "w:commentRangeEnd",
  "w:commentReference",
]);

type ParagraphKey =
  | "name"
  | "contact"
  | "age"
  | "experienceTitle"
  | "educationAnchor"
  | "strengthAnchor"
  | "experienceAnchor"
  | "projectAnchor"
  | "campusAnchor";

type PrototypeKey =
  | "eduHeader"
  | "eduGap"
  | "eduCourses"
  | "eduHonors"
  | "eduCerts"
  | "strengthSummary"
  | "strengthSkillTitle"
  | "strengthSkillLine"
  | "strengthQuality"
  | "expHeader"
  | "expCompany"
  | "expWorkTitle"
  | "expWorkLine"
  | "expGainTitle"
  | "expGainLine"
  | "expGap"
  | "projHeader"
  | "projSummary"
  | "projHighlightTitle"
  | "projHighlightLine"
  | "projGap"
  | "campusBulletHeader"
  | "campusBulletLine"
  | "campusDetailedHeader"
  | "campusBackground"
  | "campusResponsibilities"
  | "campusResult"
  | "campusGap";

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+\n/g, "\n").replace(/\u00a0/g, " ").trim();
}

function normalize(value: string | null | undefined) {
  return cleanText(value);
}

function cleanList(values: string[] | null | undefined) {
  return (values ?? []).map((item) => normalize(item)).filter(Boolean);
}

function decodeProfilePhotoDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/i);
  if (!match) {
    return null;
  }

  return {
    data: Buffer.from(match[2], "base64"),
    type: (match[1].toLowerCase() === "image/png" ? "png" : "jpg") as SupportedImageType,
  };
}

function chineseIndex(value: number) {
  const digits = "零一二三四五六七八九";
  if (value <= 10) {
    return value === 10 ? "十" : digits[value];
  }

  if (value < 20) {
    return `十${digits[value % 10]}`;
  }

  const tens = Math.floor(value / 10);
  const ones = value % 10;
  const prefix = `${digits[tens]}十`;
  return ones === 0 ? prefix : `${prefix}${digits[ones]}`;
}

function joinHeader(period: string, title: string, role: string) {
  return [normalize(period), normalize(title), normalize(role)]
    .filter(Boolean)
    .join("                        ");
}

function formatNumberedLine(index: number, value: string) {
  const text = normalize(value);
  return text ? `${index}.${text}` : `${index}.`;
}

function blankEducation(): TemplateEducationEntry {
  return {
    period: "",
    school: "",
    major: "",
    degree: "",
    coreCourses: "",
    honors: "",
    certificates: "",
  };
}

function blankExperience(): TemplateExperienceEntry {
  return {
    period: "",
    company: "",
    role: "",
    companySummary: "",
    responsibilities: [],
    achievements: [],
  };
}

function blankProject(): TemplateProjectEntry {
  return {
    period: "",
    name: "",
    role: "",
    summary: "",
    highlights: [],
  };
}

function blankCampus(): TemplateCampusExperienceEntry {
  return {
    mode: "bullets",
    period: "",
    title: "",
    role: "",
    bullets: [],
    background: "",
    responsibilities: "",
    result: "",
  };
}

function keepOrBlank<T>(items: T[], factory: () => T) {
  return items.length ? items : [factory()];
}

function randomHex(bytes: number) {
  const alphabet = "0123456789ABCDEF";
  let output = "";

  for (let index = 0; index < bytes * 2; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return output;
}

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function serializeXml(document: Document) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${new XMLSerializer().serializeToString(document)}`;
}

function getElementsByTagNameNS(parent: Document | Element, namespace: string, tag: string) {
  return Array.from(parent.getElementsByTagNameNS(namespace, tag));
}

function getParagraphs(document: Document) {
  return getElementsByTagNameNS(document, WORD_NS, "p");
}

function requireParagraph(
  paragraphs: Element[],
  index: number,
  label: string,
) {
  const paragraph = paragraphs[index];

  if (!paragraph) {
    throw new Error(`模板缺少段落锚点: ${label} @ ${index}`);
  }

  return paragraph;
}

function updateParagraphIds(paragraph: Element) {
  if (paragraph.hasAttribute("w14:paraId")) {
    paragraph.setAttribute("w14:paraId", randomHex(4));
  }

  if (paragraph.hasAttribute("w14:textId")) {
    paragraph.setAttribute("w14:textId", randomHex(4));
  }
}

function cloneParagraphAfter(anchor: Element, templateParagraph: Element) {
  const clone = templateParagraph.cloneNode(true) as Element;
  const parent = anchor.parentNode;

  if (!parent) {
    throw new Error("模板段落缺少父节点");
  }

  updateParagraphIds(clone);

  if (anchor.nextSibling) {
    parent.insertBefore(clone, anchor.nextSibling);
  } else {
    parent.appendChild(clone);
  }

  return clone;
}

function removeParagraph(paragraph: Element) {
  paragraph.parentNode?.removeChild(paragraph);
}

function getRuns(paragraph: Element) {
  return getElementsByTagNameNS(paragraph, WORD_NS, "r");
}

function getTextNodes(run: Element) {
  return getElementsByTagNameNS(run, WORD_NS, "t");
}

function setTextContent(node: Element, value: string) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }

  if (/^\s|\s$/u.test(value)) {
    node.setAttributeNS(XML_NS, "xml:space", "preserve");
  } else {
    node.removeAttributeNS(XML_NS, "space");
    node.removeAttribute("xml:space");
  }

  node.appendChild(node.ownerDocument.createTextNode(value));
}

function clearRunText(run: Element) {
  for (const textNode of getTextNodes(run)) {
    setTextContent(textNode, "");
  }
}

function setFullText(paragraph: Element, value: string) {
  const runs = getRuns(paragraph).filter((run) => getTextNodes(run).length > 0);
  const text = normalize(value);

  if (!runs.length) {
    return;
  }

  const [firstRun, ...restRuns] = runs;
  const firstTextNodes = getTextNodes(firstRun);

  if (firstTextNodes.length) {
    setTextContent(firstTextNodes[0], text);
    firstTextNodes.slice(1).forEach((node) => setTextContent(node, ""));
  }

  restRuns.forEach(clearRunText);
}

function setRunText(paragraph: Element, index: number, value: string) {
  const run = getRuns(paragraph)[index];

  if (!run) {
    return;
  }

  const textNodes = getTextNodes(run);
  if (!textNodes.length) {
    return;
  }

  setTextContent(textNodes[0], value);
  textNodes.slice(1).forEach((node) => setTextContent(node, ""));
}

function buildRefs(paragraphs: Element[]) {
  return {
    name: requireParagraph(paragraphs, 1, "name"),
    contact: requireParagraph(paragraphs, 3, "contact"),
    age: requireParagraph(paragraphs, 4, "age"),
    experienceTitle: requireParagraph(paragraphs, 26, "experienceTitle"),
    educationAnchor: requireParagraph(paragraphs, 9, "educationAnchor"),
    strengthAnchor: requireParagraph(paragraphs, 18, "strengthAnchor"),
    experienceAnchor: requireParagraph(paragraphs, 28, "experienceAnchor"),
    projectAnchor: requireParagraph(paragraphs, 49, "projectAnchor"),
    campusAnchor: requireParagraph(paragraphs, 65, "campusAnchor"),
  } satisfies Record<ParagraphKey, Element>;
}

function buildPrototypes(paragraphs: Element[]) {
  const cloneParagraph = (index: number, label: string) =>
    requireParagraph(paragraphs, index, label).cloneNode(true) as Element;

  return {
    eduHeader: cloneParagraph(10, "eduHeader"),
    eduGap: cloneParagraph(11, "eduGap"),
    eduCourses: cloneParagraph(12, "eduCourses"),
    eduHonors: cloneParagraph(13, "eduHonors"),
    eduCerts: cloneParagraph(14, "eduCerts"),
    strengthSummary: cloneParagraph(19, "strengthSummary"),
    strengthSkillTitle: cloneParagraph(20, "strengthSkillTitle"),
    strengthSkillLine: cloneParagraph(21, "strengthSkillLine"),
    strengthQuality: cloneParagraph(24, "strengthQuality"),
    expHeader: cloneParagraph(29, "expHeader"),
    expCompany: cloneParagraph(30, "expCompany"),
    expWorkTitle: cloneParagraph(31, "expWorkTitle"),
    expWorkLine: cloneParagraph(32, "expWorkLine"),
    expGainTitle: cloneParagraph(34, "expGainTitle"),
    expGainLine: cloneParagraph(35, "expGainLine"),
    expGap: cloneParagraph(45, "expGap"),
    projHeader: cloneParagraph(50, "projHeader"),
    projSummary: cloneParagraph(51, "projSummary"),
    projHighlightTitle: cloneParagraph(53, "projHighlightTitle"),
    projHighlightLine: cloneParagraph(54, "projHighlightLine"),
    projGap: cloneParagraph(62, "projGap"),
    campusBulletHeader: cloneParagraph(66, "campusBulletHeader"),
    campusBulletLine: cloneParagraph(67, "campusBulletLine"),
    campusDetailedHeader: cloneParagraph(70, "campusDetailedHeader"),
    campusBackground: cloneParagraph(71, "campusBackground"),
    campusResponsibilities: cloneParagraph(72, "campusResponsibilities"),
    campusResult: cloneParagraph(73, "campusResult"),
    campusGap: cloneParagraph(74, "campusGap"),
  } satisfies Record<PrototypeKey, Element>;
}

function removePrototypeRanges(paragraphs: Element[]) {
  const ranges = [
    [66, 73],
    [50, 61],
    [29, 44],
    [19, 24],
    [10, 14],
  ];

  for (const [start, end] of ranges) {
    for (let index = start; index <= end; index += 1) {
      const paragraph = paragraphs[index];
      if (paragraph) {
        removeParagraph(paragraph);
      }
    }
  }
}

function stripCommentNodes(node: Node) {
  const childNodes = Array.from(node.childNodes);

  for (const child of childNodes) {
    if (child.nodeType !== child.ELEMENT_NODE) {
      continue;
    }

    const element = child as Element;
    const tagName = element.tagName;

    if (COMMENT_TAG_NAMES.has(tagName)) {
      node.removeChild(child);
      continue;
    }

    stripCommentNodes(child);
  }
}

async function scrubComments(zip: JSZip) {
  zip.remove("word/comments.xml");
  zip.remove("word/commentsExtended.xml");
  zip.remove("word/people.xml");

  const contentTypesFile = zip.file("[Content_Types].xml");
  if (contentTypesFile) {
    const xml = await contentTypesFile.async("string");
    const document = parseXml(xml);
    const root = document.documentElement;

    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType !== child.ELEMENT_NODE) {
        continue;
      }

      const element = child as Element;
      if (COMMENT_OVERRIDE_PARTS.has(element.getAttribute("PartName") ?? "")) {
        root.removeChild(child);
      }
    }

    zip.file("[Content_Types].xml", serializeXml(document));
  }

  const documentRelsFile = zip.file("word/_rels/document.xml.rels");
  if (documentRelsFile) {
    const xml = await documentRelsFile.async("string");
    const document = parseXml(xml);
    const root = document.documentElement;

    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType !== child.ELEMENT_NODE) {
        continue;
      }

      const element = child as Element;
      if (COMMENT_RELATIONSHIP_TYPES.has(element.getAttribute("Type") ?? "")) {
        root.removeChild(child);
      }
    }

    zip.file("word/_rels/document.xml.rels", serializeXml(document));
  }

  const wordFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith("word/") && name.endsWith(".xml") && !COMMENT_PARTS.has(name),
  );

  for (const fileName of wordFiles) {
    const file = zip.file(fileName);
    if (!file) {
      continue;
    }

    const xml = await file.async("string");
    const document = parseXml(xml);
    stripCommentNodes(document.documentElement);
    zip.file(fileName, serializeXml(document));
  }
}

function findPhotoRelationshipId(document: Document) {
  const anchors = getElementsByTagNameNS(document, WP_NS, "anchor");

  for (const anchor of anchors) {
    const docPr = getElementsByTagNameNS(anchor, WP_NS, "docPr")[0];
    if (!docPr || docPr.getAttribute("descr") !== PHOTO_PLACEHOLDER_DESCR) {
      continue;
    }

    const blip = getElementsByTagNameNS(anchor, DRAWING_NS, "blip")[0];
    if (!blip) {
      continue;
    }

    return (
      blip.getAttributeNS(OFFICE_REL_NS, "embed") ??
      blip.getAttribute("r:embed") ??
      null
    );
  }

  return null;
}

async function ensureContentTypeForImage(zip: JSZip, type: SupportedImageType) {
  const contentTypesFile = zip.file("[Content_Types].xml");
  if (!contentTypesFile) {
    return;
  }

  const extension = type === "png" ? "png" : "jpeg";
  const mimeType = type === "png" ? "image/png" : "image/jpeg";
  const xml = await contentTypesFile.async("string");
  const document = parseXml(xml);
  const root = document.documentElement;
  const defaultNodes = getElementsByTagNameNS(document, CONTENT_TYPES_NS, "Default");
  const hasDefault = defaultNodes.some(
    (node) => (node.getAttribute("Extension") ?? "").toLowerCase() === extension,
  );

  if (!hasDefault) {
    const element = document.createElementNS(CONTENT_TYPES_NS, "Default");
    element.setAttribute("Extension", extension);
    element.setAttribute("ContentType", mimeType);
    root.appendChild(element);
  }

  zip.file("[Content_Types].xml", serializeXml(document));
}

async function applyProfilePhoto(zip: JSZip, photo: { data: Buffer; type: SupportedImageType }) {
  const documentFile = zip.file("word/document.xml");
  const relsFile = zip.file("word/_rels/document.xml.rels");

  if (!documentFile || !relsFile) {
    return;
  }

  const documentXml = await documentFile.async("string");
  const document = parseXml(documentXml);
  const relationshipId = findPhotoRelationshipId(document);

  if (!relationshipId) {
    return;
  }

  const relsXml = await relsFile.async("string");
  const relsDocument = parseXml(relsXml);
  const relationships = getElementsByTagNameNS(relsDocument, REL_NS, "Relationship");
  const targetName =
    photo.type === "png" ? "word/media/profile-photo.png" : "word/media/profile-photo.jpg";
  const targetValue = targetName.replace(/^word\//u, "");

  for (const relationship of relationships) {
    if ((relationship.getAttribute("Id") ?? "") === relationshipId) {
      relationship.setAttribute("Target", targetValue);
    }
  }

  await ensureContentTypeForImage(zip, photo.type);
  zip.file("word/_rels/document.xml.rels", serializeXml(relsDocument));
  zip.file(targetName, photo.data);
}

function fillEducationSection(
  refs: Record<ParagraphKey, Element>,
  prototypes: Record<PrototypeKey, Element>,
  resume: TemplateResumeData,
) {
  let anchor = refs.educationAnchor;

  for (const education of keepOrBlank(resume.educations, blankEducation)) {
    const header = cloneParagraphAfter(anchor, prototypes.eduHeader);
    const period = normalize(education.period);
    const school = normalize(education.school);
    const major = normalize(education.major);
    const degree = normalize(education.degree);
    const tail = [major, degree].filter(Boolean).join(" | ");

    setFullText(
      header,
      [period, school, tail].filter(Boolean).join("                      "),
    );

    const gap = cloneParagraphAfter(header, prototypes.eduGap);
    const courses = cloneParagraphAfter(gap, prototypes.eduCourses);
    setRunText(courses, 1, `：${normalize(education.coreCourses)}`);

    const honors = cloneParagraphAfter(courses, prototypes.eduHonors);
    setRunText(honors, 1, `：${normalize(education.honors)}`);

    const certs = cloneParagraphAfter(honors, prototypes.eduCerts);
    setRunText(certs, 1, `：${normalize(education.certificates)}`);

    anchor = certs;
  }
}

function fillProfessionalStrengthsSection(
  refs: Record<ParagraphKey, Element>,
  prototypes: Record<PrototypeKey, Element>,
  resume: TemplateResumeData,
) {
  const summary = cloneParagraphAfter(refs.strengthAnchor, prototypes.strengthSummary);
  setRunText(summary, 2, ` ${normalize(resume.professionalStrengths.summary)}`);

  const skillTitle = cloneParagraphAfter(summary, prototypes.strengthSkillTitle);
  let anchor = skillTitle;
  const skillLines = resume.professionalStrengths.skillLines.length
    ? resume.professionalStrengths.skillLines
    : [""];

  skillLines.forEach((item, index) => {
    const skillLine = cloneParagraphAfter(anchor, prototypes.strengthSkillLine);
    setFullText(skillLine, item ? `（${index + 1}）${normalize(item)}` : "");
    anchor = skillLine;
  });

  const quality = cloneParagraphAfter(anchor, prototypes.strengthQuality);
  setRunText(quality, 1, `：${normalize(resume.professionalStrengths.coreQuality)}`);
}

function fillExperienceSection(
  refs: Record<ParagraphKey, Element>,
  prototypes: Record<PrototypeKey, Element>,
  resume: TemplateResumeData,
) {
  let anchor = refs.experienceAnchor;
  const entries = keepOrBlank(resume.experiences, blankExperience);

  entries.forEach((experience, index) => {
    const header = cloneParagraphAfter(anchor, prototypes.expHeader);
    setFullText(
      header,
      `${chineseIndex(index + 1)}、${joinHeader(
        experience.period,
        experience.company,
        experience.role,
      )}`,
    );

    anchor = header;

    const companySummary = normalize(experience.companySummary);
    if (companySummary) {
      const company = cloneParagraphAfter(anchor, prototypes.expCompany);
      setRunText(company, 1, `：${companySummary}`);
      anchor = company;
    }

    const responsibilities = cleanList(experience.responsibilities);
    if (responsibilities.length) {
      const workTitle = cloneParagraphAfter(anchor, prototypes.expWorkTitle);
      setRunText(workTitle, 1, "：");
      anchor = workTitle;
    }

    responsibilities.forEach((item, itemIndex) => {
      const line = cloneParagraphAfter(anchor, prototypes.expWorkLine);
      setFullText(line, formatNumberedLine(itemIndex + 1, item));
      anchor = line;
    });

    const achievements = cleanList(experience.achievements);
    if (achievements.length) {
      const gainTitle = cloneParagraphAfter(anchor, prototypes.expGainTitle);
      setRunText(gainTitle, 1, "：");
      anchor = gainTitle;
    }

    achievements.forEach((item, itemIndex) => {
      const line = cloneParagraphAfter(anchor, prototypes.expGainLine);
      setFullText(line, formatNumberedLine(itemIndex + 1, item));
      anchor = line;
    });

    if (index < entries.length - 1) {
      anchor = cloneParagraphAfter(anchor, prototypes.expGap);
    }
  });
}

function fillProjectSection(
  refs: Record<ParagraphKey, Element>,
  prototypes: Record<PrototypeKey, Element>,
  resume: TemplateResumeData,
) {
  let anchor = refs.projectAnchor;
  const entries = keepOrBlank(resume.projects, blankProject);

  entries.forEach((project, index) => {
    const header = cloneParagraphAfter(anchor, prototypes.projHeader);
    setFullText(
      header,
      `${chineseIndex(index + 1)}、${joinHeader(project.period, project.name, project.role)}`,
    );
    anchor = header;

    const summary = normalize(project.summary);
    if (summary) {
      const projectSummary = cloneParagraphAfter(anchor, prototypes.projSummary);
      setRunText(projectSummary, 1, `：${summary}`);
      anchor = projectSummary;
    }

    const highlights = cleanList(project.highlights);
    if (highlights.length) {
      const highlightTitle = cloneParagraphAfter(anchor, prototypes.projHighlightTitle);
      setRunText(highlightTitle, 2, "：");
      anchor = highlightTitle;
    }

    highlights.forEach((item, itemIndex) => {
      const line = cloneParagraphAfter(anchor, prototypes.projHighlightLine);
      setFullText(line, formatNumberedLine(itemIndex + 1, item));
      anchor = line;
    });

    if (index < entries.length - 1) {
      anchor = cloneParagraphAfter(anchor, prototypes.projGap);
    }
  });
}

function fillCampusSection(
  refs: Record<ParagraphKey, Element>,
  prototypes: Record<PrototypeKey, Element>,
  resume: TemplateResumeData,
) {
  let anchor = refs.campusAnchor;
  const entries = keepOrBlank(resume.campusExperiences, blankCampus);

  entries.forEach((entry, index) => {
    if (entry.mode === "detailed") {
      const header = cloneParagraphAfter(anchor, prototypes.campusDetailedHeader);
      setFullText(
        header,
        `${chineseIndex(index + 1)}、${joinHeader(entry.period, entry.title, entry.role)}`,
      );

      const background = cloneParagraphAfter(header, prototypes.campusBackground);
      setRunText(background, 1, `: ${normalize(entry.background)}`);

      const responsibilities = cloneParagraphAfter(
        background,
        prototypes.campusResponsibilities,
      );
      setRunText(responsibilities, 1, `: ${normalize(entry.responsibilities)}`);

      const result = cloneParagraphAfter(responsibilities, prototypes.campusResult);
      setRunText(result, 1, `: ${normalize(entry.result)}`);
      anchor = result;
    } else {
      const header = cloneParagraphAfter(anchor, prototypes.campusBulletHeader);
      setFullText(
        header,
        `${chineseIndex(index + 1)}、${joinHeader(entry.period, entry.title, entry.role)}`,
      );
      anchor = header;

      const bullets = entry.bullets.length ? entry.bullets : [""];
      bullets.forEach((item, itemIndex) => {
        const bullet = cloneParagraphAfter(anchor, prototypes.campusBulletLine);
        setFullText(bullet, formatNumberedLine(itemIndex + 1, item));
        anchor = bullet;
      });
    }

    if (index < entries.length - 1) {
      anchor = cloneParagraphAfter(anchor, prototypes.campusGap);
    }
  });
}

async function renderResumeTemplate(
  resume: TemplateResumeData,
  profilePhotoDataUrl?: string | null,
) {
  const templateBuffer = await readFile(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuffer);
  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    throw new Error("模板文档缺少 word/document.xml");
  }

  const documentXml = await documentFile.async("string");
  const document = parseXml(documentXml);
  const paragraphs = getParagraphs(document);
  const refs = buildRefs(paragraphs);
  const prototypes = buildPrototypes(paragraphs);

  removePrototypeRanges(paragraphs);

  setFullText(refs.name, normalize(resume.personal.name));
  setRunText(refs.contact, 3, normalize(resume.personal.phone));
  setRunText(refs.contact, 9, normalize(resume.personal.email));
  setRunText(refs.age, 3, normalize(resume.personal.age));
  setRunText(refs.age, 9, normalize(resume.personal.highestEducation));
  setFullText(refs.experienceTitle, normalize(resume.experienceSectionTitle));

  fillEducationSection(refs, prototypes, resume);
  fillProfessionalStrengthsSection(refs, prototypes, resume);
  fillExperienceSection(refs, prototypes, resume);
  fillProjectSection(refs, prototypes, resume);
  fillCampusSection(refs, prototypes, resume);

  zip.file("word/document.xml", serializeXml(document));

  const photo = profilePhotoDataUrl
    ? decodeProfilePhotoDataUrl(profilePhotoDataUrl)
    : null;
  if (photo) {
    await applyProfilePhoto(zip, photo);
  }

  await scrubComments(zip);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

export async function buildResumeDocx(
  resume: TemplateResumeData,
  profilePhotoDataUrl?: string | null,
) {
  return renderResumeTemplate(resume, profilePhotoDataUrl);
}
