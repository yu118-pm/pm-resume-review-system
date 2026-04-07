import assert from "node:assert/strict";
import test from "node:test";

import JSZip from "jszip";
import { Document, Packer, Paragraph, TextRun } from "docx";

import { exportPmReviewDocx } from "./pm-review-docx-export.ts";

async function buildSampleDocx() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun("张三"), new TextRun(" 产品经理简历")],
          }),
          new Paragraph("项目经历"),
          new Paragraph("2024 用户增长项目"),
          new Paragraph("负责增长方案设计，并通过A/B测试提升注册转化率"),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

test("exportPmReviewDocx writes native Word comments without Python", async () => {
  const source = await buildSampleDocx();
  const comments = [
    {
      sectionTitleOriginal: "项目经历",
      normalizedModule: "项目经历",
      location: "项目经历第1行",
      anchorText: "用户增长项目",
      issueType: "表述模糊",
      actionType: "rewrite",
      comment: "项目名称过泛，缺少业务对象和目标。",
      suggestion: "建议改成带业务场景和结果导向的项目标题。",
      confidence: "high",
      needsConfirmation: false,
      previousRoundStatus: "new",
    },
  ];

  const output = await exportPmReviewDocx(source, comments);
  const zip = await JSZip.loadAsync(output);

  const commentsXml = await zip.file("word/comments.xml")?.async("string");
  const documentXml = await zip.file("word/document.xml")?.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  const contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");

  assert.ok(commentsXml, "should generate comments.xml");
  assert.ok(documentXml, "should keep document.xml");
  assert.ok(relsXml, "should keep document relationships");
  assert.ok(contentTypesXml, "should keep content types");

  assert.match(commentsXml, /PM Review AI/);
  assert.match(commentsXml, /项目名称过泛/);
  assert.match(commentsXml, /建议改成带业务场景和结果导向的项目标题/);
  assert.match(documentXml, /commentRangeStart/);
  assert.match(documentXml, /commentReference/);
  assert.match(relsXml, /comments\.xml/);
  assert.match(contentTypesXml, /wordprocessingml\.comments\+xml/);
});
