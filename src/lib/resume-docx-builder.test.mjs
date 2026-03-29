import assert from "node:assert/strict";
import test from "node:test";

import JSZip from "jszip";

import { buildResumeDocx } from "./resume-docx-builder.ts";

const SAMPLE_RESUME = {
  personal: {
    name: "张三",
    phone: "13800000000",
    email: "zhangsan@example.com",
    age: "26",
    highestEducation: "本科",
  },
  educations: [
    {
      period: "2018.09-2022.06",
      school: "华东理工大学",
      major: "信息管理与信息系统",
      degree: "本科",
      coreCourses: "数据结构、数据库系统",
      honors: "一等奖学金",
      certificates: "英语六级",
    },
  ],
  professionalStrengths: {
    summary: "3 段产品实习，熟悉需求分析与跨团队协作。",
    skillLines: ["熟练 Axure、Figma、SQL", "能独立完成竞品分析和 PRD 输出"],
    coreQuality: "执行推进强，能快速落地。",
  },
  experiences: [
    {
      period: "2023.03-2023.09",
      company: "某科技公司",
      role: "产品经理实习生",
      companySummary: "负责 B 端增长工具产品迭代。",
      responsibilities: ["调研 30+ 客户反馈并整理需求池", "输出 12 份原型和 PRD"],
      achievements: ["推动线索转化率提升 18%", "协同研发按期上线 3 个版本"],
    },
  ],
  projects: [
    {
      period: "2022.10-2023.01",
      name: "智能客服工作台",
      role: "项目负责人",
      summary: "面向客服团队的效率工具。",
      highlights: ["设计知识库检索流程", "落地会话质检面板"],
    },
  ],
  campusExperiences: [
    {
      mode: "bullets",
      period: "2021.03-2021.10",
      title: "互联网+ 创新项目",
      role: "队长",
      bullets: ["组织 5 人团队完成调研和答辩", "获得校级二等奖"],
      background: "",
      responsibilities: "",
      result: "",
    },
  ],
  experienceSectionTitle: "实习经历",
};

test("buildResumeDocx generates a docx buffer with resume content", async () => {
  const buffer = await buildResumeDocx(SAMPLE_RESUME);

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);

  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml").async("string");

  assert.match(documentXml, /张三/);
  assert.match(documentXml, /zhangsan@example\.com/);
  assert.match(documentXml, /教育经历/);
  assert.match(documentXml, /实习经历/);
  assert.match(documentXml, /智能客服工作台/);
});

test("buildResumeDocx keeps the shipped Word template structure", async () => {
  const buffer = await buildResumeDocx(SAMPLE_RESUME);

  const zip = await JSZip.loadAsync(buffer);
  const mediaEntries = Object.keys(zip.files).filter((name) =>
    name.startsWith("word/media/"),
  );
  const documentXml = await zip.file("word/document.xml").async("string");

  assert.ok(zip.file("word/header1.xml"), "should preserve template header");
  assert.ok(
    zip.file("word/media/image10.png"),
    "should preserve template section assets",
  );
  assert.equal(zip.file("word/comments.xml"), null, "comments should be scrubbed");
  assert.ok(mediaEntries.length >= 10, "should preserve template media assets");
  assert.match(documentXml, /（1）熟练 Axure、Figma、SQL/);
});
