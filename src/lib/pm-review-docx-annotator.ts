import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { PmReviewComment } from "@/lib/types";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const COMMENTS_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
const COMMENTS_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml";
const COMMENT_AUTHOR = "PM Review AI";
const COMMENT_INITIALS = "AI";
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const PUNCTUATION_PATTERN = /[，,。；;：:\s｜|、（）()【】[\]·\-_/]+/gu;
const PUNCTUATION_CHAR_PATTERN = /[，,。；;：:\s｜|、（）()【】[\]·\-_/]/u;

type MatchRange = {
  runs: Element[];
  startRun: number;
  endRun: number;
};

type TextSegment = {
  runIndex: number;
  start: number;
  end: number;
};

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function serializeXml(document: Document) {
  const xml = new XMLSerializer()
    .serializeToString(document)
    .replace(/^<\?xml[^>]*\?>\s*/u, "");

  return `${XML_DECLARATION}${xml}`;
}

function elementChildren(parent: Node): Element[] {
  const result: Element[] = [];

  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const child = parent.childNodes.item(i);
    if (child?.nodeType === child.ELEMENT_NODE) {
      result.push(child as Element);
    }
  }

  return result;
}

function descendantsByTagNameNS(parent: Document | Element, ns: string, localName: string) {
  const nodes = parent.getElementsByTagNameNS(ns, localName);
  const result: Element[] = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes.item(i);
    if (node) {
      result.push(node);
    }
  }

  return result;
}

function directChildrenByTagNameNS(parent: Node, ns: string, localName: string) {
  return elementChildren(parent).filter(
    (child) => child.namespaceURI === ns && child.localName === localName,
  );
}

function normalizeSpace(text: string) {
  return text.replace(/\s+/gu, " ").trim();
}

function normalizeForMatch(text: string) {
  const chars: string[] = [];
  const indexes: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!char || PUNCTUATION_CHAR_PATTERN.test(char)) {
      continue;
    }

    chars.push(char.toLowerCase());
    indexes.push(index);
  }

  return { text: chars.join(""), indexes };
}

function extractTokens(text: string) {
  return text.split(PUNCTUATION_PATTERN).filter((token) => token.length >= 2);
}

function getAttribute(node: Element, name: string, namespace?: string) {
  return (
    (namespace ? node.getAttributeNS(namespace, name) : null) ??
    node.getAttribute(`w:${name}`) ??
    node.getAttribute(name)
  );
}

function findCommentDocument(existing: string | null) {
  if (existing) {
    return parseXml(existing);
  }

  return parseXml(`<w:comments xmlns:w="${WORD_NS}"/>`);
}

function ensureCommentRelationship(documentRelsDoc: Document) {
  const root = documentRelsDoc.documentElement;
  const relationships = directChildrenByTagNameNS(root, REL_NS, "Relationship");

  for (const relationship of relationships) {
    if (relationship.getAttribute("Type") === COMMENTS_REL_TYPE) {
      return;
    }
  }

  const existingIds = new Set(
    relationships
      .map((relationship) => relationship.getAttribute("Id"))
      .filter((value): value is string => Boolean(value)),
  );

  let nextId = 1;
  while (existingIds.has(`rId${nextId}`)) {
    nextId += 1;
  }

  const relationship = documentRelsDoc.createElementNS(REL_NS, "Relationship");
  relationship.setAttribute("Id", `rId${nextId}`);
  relationship.setAttribute("Type", COMMENTS_REL_TYPE);
  relationship.setAttribute("Target", "comments.xml");
  root.appendChild(relationship);
}

function ensureCommentsContentType(contentTypesDoc: Document) {
  const root = contentTypesDoc.documentElement;
  const overrides = directChildrenByTagNameNS(root, CONTENT_TYPES_NS, "Override");

  for (const override of overrides) {
    if (override.getAttribute("PartName") === "/word/comments.xml") {
      return;
    }
  }

  const override = contentTypesDoc.createElementNS(CONTENT_TYPES_NS, "Override");
  override.setAttribute("PartName", "/word/comments.xml");
  override.setAttribute("ContentType", COMMENTS_CONTENT_TYPE);
  root.appendChild(override);
}

function nextCommentId(commentsRoot: Element) {
  const ids = directChildrenByTagNameNS(commentsRoot, WORD_NS, "comment")
    .map((comment) => Number.parseInt(getAttribute(comment, "id", WORD_NS) ?? "", 10))
    .filter((value) => Number.isFinite(value));

  return ids.length > 0 ? Math.max(...ids) + 1 : 0;
}

const PREVIOUS_ROUND_STATUS_TEXT: Record<string, string> = {
  new: "本轮新发现",
  modified: "上次已指出，学员已修改但仍需改进",
  unchanged: "上次已指出，学员未修改",
  resolved: "已解决",
};

function buildCommentBody(comment: PmReviewComment) {
  const lines = [`【问题】${comment.comment}`, `【建议】${comment.suggestion}`];

  if (comment.example) {
    lines.push(`【示例】${comment.example}`);
  }

  if (comment.searchEvidence) {
    lines.push(`【搜索参考】${comment.searchEvidence}`);
  }

  if (comment.previousRoundStatus) {
    const statusText = PREVIOUS_ROUND_STATUS_TEXT[comment.previousRoundStatus];
    if (statusText) {
      lines.push(`【多轮状态】${statusText}`);
    }
  }

  return lines;
}

function appendComment(commentsDoc: Document, commentsRoot: Element, commentId: number, comment: PmReviewComment) {
  const commentNode = commentsDoc.createElementNS(WORD_NS, "w:comment");
  commentNode.setAttributeNS(WORD_NS, "w:id", String(commentId));
  commentNode.setAttributeNS(WORD_NS, "w:author", COMMENT_AUTHOR);
  commentNode.setAttributeNS(WORD_NS, "w:initials", COMMENT_INITIALS);
  commentNode.setAttributeNS(WORD_NS, "w:date", new Date().toISOString());

  for (const line of buildCommentBody(comment)) {
    const paragraph = commentsDoc.createElementNS(WORD_NS, "w:p");
    const run = commentsDoc.createElementNS(WORD_NS, "w:r");
    const text = commentsDoc.createElementNS(WORD_NS, "w:t");
    text.appendChild(commentsDoc.createTextNode(line));
    run.appendChild(text);
    paragraph.appendChild(run);
    commentNode.appendChild(paragraph);
  }

  commentsRoot.appendChild(commentNode);
}

function paragraphRuns(paragraph: Element) {
  return directChildrenByTagNameNS(paragraph, WORD_NS, "r");
}

function paragraphTextAndSegments(paragraph: Element) {
  const runs = paragraphRuns(paragraph);
  const segments: TextSegment[] = [];
  const textParts: string[] = [];
  let offset = 0;

  runs.forEach((run, runIndex) => {
    const runText = descendantsByTagNameNS(run, WORD_NS, "t")
      .map((node) => node.textContent ?? "")
      .join("");

    if (!runText) {
      return;
    }

    textParts.push(runText);
    segments.push({
      runIndex,
      start: offset,
      end: offset + runText.length,
    });
    offset += runText.length;
  });

  return {
    text: textParts.join(""),
    runs,
    segments,
  };
}

function locateRunIndexes(segments: TextSegment[], startChar: number, endChar: number) {
  let startRun: number | null = null;
  let endRun: number | null = null;

  for (const segment of segments) {
    if (startRun === null && segment.start <= startChar && startChar < segment.end) {
      startRun = segment.runIndex;
    }

    if (segment.start < endChar && endChar <= segment.end) {
      endRun = segment.runIndex;
      break;
    }
  }

  if (startRun === null && segments.length > 0) {
    startRun = segments[0].runIndex;
  }
  if (endRun === null && segments.length > 0) {
    endRun = segments[segments.length - 1].runIndex;
  }

  return { startRun, endRun };
}

function exactMatchRange(paragraph: Element, anchorText: string): MatchRange | null {
  const { text, runs, segments } = paragraphTextAndSegments(paragraph);

  if (!text || runs.length === 0 || segments.length === 0) {
    return null;
  }

  const startChar = text.indexOf(anchorText);
  if (startChar === -1) {
    return null;
  }

  const { startRun, endRun } = locateRunIndexes(
    segments,
    startChar,
    startChar + anchorText.length,
  );

  if (startRun === null || endRun === null) {
    return null;
  }

  return { runs, startRun, endRun };
}

function fuzzyMatchRange(paragraph: Element, anchorText: string): MatchRange | null {
  const { text, runs, segments } = paragraphTextAndSegments(paragraph);

  if (!text || runs.length === 0 || segments.length === 0) {
    return null;
  }

  const normalizedParagraph = normalizeForMatch(text);
  const normalizedAnchor = normalizeForMatch(anchorText);

  if (!normalizedAnchor.text || normalizedAnchor.indexes.length === 0) {
    return null;
  }

  const matchStart = normalizedParagraph.text.indexOf(normalizedAnchor.text);
  if (matchStart === -1) {
    return null;
  }

  const originalStart = normalizedParagraph.indexes[matchStart];
  const originalEnd =
    normalizedParagraph.indexes[matchStart + normalizedAnchor.text.length - 1] + 1;
  const { startRun, endRun } = locateRunIndexes(segments, originalStart, originalEnd);

  if (startRun === null || endRun === null) {
    return null;
  }

  return { runs, startRun, endRun };
}

function paragraphScore(paragraph: Element, anchorText: string) {
  const text = normalizeSpace(
    descendantsByTagNameNS(paragraph, WORD_NS, "t")
      .map((node) => node.textContent ?? "")
      .join(""),
  );

  if (!text) {
    return 0;
  }

  const tokens = extractTokens(anchorText);
  if (tokens.length === 0) {
    return 0;
  }

  const compact = normalizeForMatch(text).text;

  return tokens.reduce((score, token) => {
    return compact.includes(normalizeForMatch(token).text) ? score + 1 : score;
  }, 0);
}

function findTarget(documentRoot: Element, anchorText: string) {
  const paragraphs = descendantsByTagNameNS(documentRoot, WORD_NS, "p");

  for (const paragraph of paragraphs) {
    const matched = exactMatchRange(paragraph, anchorText);
    if (matched) {
      return { paragraph, matched };
    }
  }

  for (const paragraph of paragraphs) {
    const matched = fuzzyMatchRange(paragraph, anchorText);
    if (matched) {
      return { paragraph, matched };
    }
  }

  let best: Element | null = null;
  let bestScore = 0;

  for (const paragraph of paragraphs) {
    const score = paragraphScore(paragraph, anchorText);
    if (score > bestScore) {
      best = paragraph;
      bestScore = score;
    }
  }

  if (best && bestScore > 0) {
    return { paragraph: best, matched: null };
  }

  for (const paragraph of paragraphs) {
    const text = normalizeSpace(
      descendantsByTagNameNS(paragraph, WORD_NS, "t")
        .map((node) => node.textContent ?? "")
        .join(""),
    );
    if (text) {
      return { paragraph, matched: null };
    }
  }

  return { paragraph: null, matched: null };
}

function insertAfter(parent: Node, target: Node, node: Node) {
  if (target.nextSibling) {
    parent.insertBefore(node, target.nextSibling);
  } else {
    parent.appendChild(node);
  }
}

function attachComment(
  document: Document,
  paragraph: Element,
  matched: MatchRange | null,
  commentId: number,
) {
  const runs = paragraphRuns(paragraph);
  if (runs.length === 0) {
    return false;
  }

  const startNode = document.createElementNS(WORD_NS, "w:commentRangeStart");
  startNode.setAttributeNS(WORD_NS, "w:id", String(commentId));

  const endNode = document.createElementNS(WORD_NS, "w:commentRangeEnd");
  endNode.setAttributeNS(WORD_NS, "w:id", String(commentId));

  const referenceRun = document.createElementNS(WORD_NS, "w:r");
  const reference = document.createElementNS(WORD_NS, "w:commentReference");
  reference.setAttributeNS(WORD_NS, "w:id", String(commentId));
  referenceRun.appendChild(reference);

  if (!matched) {
    const firstRun = runs[0];
    const lastRun = runs[runs.length - 1];
    paragraph.insertBefore(startNode, firstRun);
    insertAfter(paragraph, lastRun, endNode);
    insertAfter(paragraph, endNode, referenceRun);
    return true;
  }

  const startRun = matched.runs[matched.startRun];
  const endRun = matched.runs[matched.endRun];
  paragraph.insertBefore(startNode, startRun);
  insertAfter(paragraph, endRun, endNode);
  insertAfter(paragraph, endNode, referenceRun);
  return true;
}

export async function annotatePmReviewDocx(
  sourceBuffer: Buffer,
  comments: PmReviewComment[],
) {
  const zip = await JSZip.loadAsync(sourceBuffer);

  const [
    documentXml,
    documentRelsXml,
    contentTypesXml,
    commentsXml,
  ] = await Promise.all([
    zip.file("word/document.xml")?.async("string"),
    zip.file("word/_rels/document.xml.rels")?.async("string"),
    zip.file("[Content_Types].xml")?.async("string"),
    zip.file("word/comments.xml")?.async("string") ?? Promise.resolve(null),
  ]);

  if (!documentXml || !documentRelsXml || !contentTypesXml) {
    throw new Error("DOCX 文件结构不完整，无法写入批注");
  }

  const documentDoc = parseXml(documentXml);
  const documentRelsDoc = parseXml(documentRelsXml);
  const contentTypesDoc = parseXml(contentTypesXml);
  const commentsDoc = findCommentDocument(commentsXml);

  ensureCommentRelationship(documentRelsDoc);
  ensureCommentsContentType(contentTypesDoc);

  const documentRoot = documentDoc.documentElement;
  const commentsRoot = commentsDoc.documentElement;
  let commentId = nextCommentId(commentsRoot);

  for (const comment of comments) {
    const { paragraph, matched } = findTarget(documentRoot, comment.anchorText ?? "");

    if (!paragraph) {
      continue;
    }

    if (!attachComment(documentDoc, paragraph, matched, commentId)) {
      continue;
    }

    appendComment(commentsDoc, commentsRoot, commentId, comment);
    commentId += 1;
  }

  zip.file("word/document.xml", serializeXml(documentDoc));
  zip.file("word/_rels/document.xml.rels", serializeXml(documentRelsDoc));
  zip.file("[Content_Types].xml", serializeXml(contentTypesDoc));
  zip.file("word/comments.xml", serializeXml(commentsDoc));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}
