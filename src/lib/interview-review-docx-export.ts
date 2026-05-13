import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { InterviewReviewRecord } from "@/lib/interview-review-types";

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+\n/g, "\n").replace(/\u00a0/g, " ").trim();
}

function linesFromText(value: string) {
  const text = cleanText(value);
  return text ? text.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

function buildLabelValueParagraph(label: string, value: string) {
  return new Paragraph({
    spacing: {
      after: 120,
    },
    children: [
      new TextRun({
        text: `${label}：`,
        bold: true,
      }),
      new TextRun({
        text: cleanText(value) || "材料不足，无法判断",
      }),
    ],
  });
}

function buildListSection(title: string, items: string[]) {
  const lines = items.length ? items : ["材料不足，无法判断"];

  return [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_3,
      spacing: {
        before: 180,
        after: 80,
      },
    }),
    ...lines.map(
      (item) =>
        new Paragraph({
          text: item,
          bullet: {
            level: 0,
          },
          spacing: {
            after: 80,
          },
        }),
    ),
  ];
}

function buildMultilineSection(title: string, value: string) {
  const lines = linesFromText(value);

  return [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_3,
      spacing: {
        before: 180,
        after: 80,
      },
    }),
    ...(lines.length
      ? lines.map(
          (line) =>
            new Paragraph({
              text: line,
              spacing: {
                after: 80,
              },
            }),
        )
      : [
          new Paragraph({
            text: "材料不足，无法判断",
            spacing: {
              after: 80,
            },
          }),
        ]),
  ];
}

function buildItemSection(review: InterviewReviewRecord, index: number) {
  const item = review.result.items[index];

  return [
    new Paragraph({
      text: `问题 ${index + 1}：${cleanText(item.question) || "材料不足，无法判断"}`,
      heading: HeadingLevel.HEADING_2,
      spacing: {
        before: 260,
        after: 120,
      },
    }),
    buildLabelValueParagraph("题型", item.questionType),
    buildLabelValueParagraph("回答状态", item.answerStatus),
    buildLabelValueParagraph("面试官考察意图", item.interviewerIntent),
    buildLabelValueParagraph("学员回答摘要", item.candidateAnswerSummary),
    buildLabelValueParagraph(
      "回答证据",
      item.answerEvidenceQuotes.join("；") || "无可引用原话",
    ),
    buildLabelValueParagraph("核心问题", item.analysis.coreIssue),
    buildLabelValueParagraph("回答较好的部分", item.analysis.whatWasAnsweredWell),
    buildLabelValueParagraph("缺失信息", item.analysis.whatWasMissing),
    buildLabelValueParagraph("知识或逻辑问题", item.analysis.knowledgeOrLogicIssues),
    buildLabelValueParagraph("简历一致性", item.analysis.resumeConsistency),
    buildLabelValueParagraph("JD 匹配", item.analysis.jdMatch),
    buildLabelValueParagraph("优化方向", item.advice.improvementDirection),
    ...buildListSection("具体改进动作", item.advice.specificActions),
    ...buildMultilineSection("参考话术", item.referenceAnswer),
    ...buildMultilineSection("知识补充", item.knowledgeSupplement),
    ...buildListSection(
      "风险提示",
      item.riskNotes.length ? item.riskNotes : ["未发现明显风险"],
    ),
    buildLabelValueParagraph("下一道训练追问", item.nextPracticeQuestion),
  ];
}

export async function exportInterviewReviewDocx(review: InterviewReviewRecord) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "面试复盘报告",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: {
              after: 240,
            },
          }),
          buildLabelValueParagraph("学员", review.studentName),
          buildLabelValueParagraph("目标岗位", review.targetRole || "材料不足，无法判断"),
          buildLabelValueParagraph(
            "面试 JD",
            review.jdText || review.jdImageName ? "已提供" : "未提供",
          ),
          buildLabelValueParagraph("问答数量", `${review.qaPairs.length} 道题`),
          buildLabelValueParagraph("生成时间", review.createdAt),
          new Paragraph({
            text: "整体概览",
            heading: HeadingLevel.HEADING_1,
            spacing: {
              before: 280,
              after: 120,
            },
          }),
          buildLabelValueParagraph(
            "整体结论",
            review.result.summary.overallConclusion,
          ),
          ...buildListSection("主要问题", review.result.summary.mainProblems),
          ...buildListSection("主要优势", review.result.summary.mainStrengths),
          ...buildListSection(
            "优先训练方向",
            review.result.summary.priorityTrainingFocus,
          ),
          new Paragraph({
            text: "逐题复盘",
            heading: HeadingLevel.HEADING_1,
            spacing: {
              before: 280,
              after: 120,
            },
          }),
          ...review.result.items.flatMap((_, index) => buildItemSection(review, index)),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
