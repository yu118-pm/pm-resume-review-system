import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
  convertMillimetersToTwip,
} from "docx";
import type {
  TemplateCampusExperienceEntry,
  TemplateEducationEntry,
  TemplateExperienceEntry,
  TemplateProjectEntry,
  TemplateResumeData,
} from "./types.ts";

type SupportedImageType = "png" | "jpg";

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+\n/g, "\n").replace(/\u00a0/g, " ").trim();
}

function cleanList(values: string[] | null | undefined) {
  return (values ?? []).map((item) => cleanText(item)).filter(Boolean);
}

function buildMetaLine(label: string, value: string) {
  const text = cleanText(value);
  return text ? `${label}：${text}` : null;
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

function sectionTitle(title: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    border: {
      bottom: {
        color: "2F6B8A",
        size: 6,
        style: "single",
      },
    },
    children: [
      new TextRun({
        text: title,
        bold: true,
        size: 28,
        font: "Microsoft YaHei",
      }),
    ],
  });
}

function bodyParagraph(text: string, options?: { boldPrefix?: string; indent?: number }) {
  const prefix = cleanText(options?.boldPrefix);
  const content = cleanText(text);

  if (!content && !prefix) {
    return null;
  }

  const children = prefix
    ? [
      new TextRun({
        text: prefix,
        bold: true,
        font: "Microsoft YaHei",
      }),
      new TextRun({
        text: content ? ` ${content}` : "",
        font: "Microsoft YaHei",
      }),
    ]
    : [
      new TextRun({
        text: content,
        font: "Microsoft YaHei",
      }),
    ];

  return new Paragraph({
    spacing: { after: 100, line: 320 },
    indent: options?.indent ? { left: options.indent } : undefined,
    children,
  });
}

function numberedParagraph(index: number, text: string, indent = 360) {
  const content = cleanText(text);
  if (!content) {
    return null;
  }

  return new Paragraph({
    spacing: { after: 80, line: 320 },
    indent: { left: indent },
    children: [
      new TextRun({
        text: `${index}. ${content}`,
        font: "Microsoft YaHei",
      }),
    ],
  });
}

function buildEducationSection(entries: TemplateEducationEntry[]) {
  const children: Paragraph[] = [];

  for (const entry of entries) {
    const header = [cleanText(entry.period), cleanText(entry.school)]
      .filter(Boolean)
      .join("  ");
    const degreeLine = [cleanText(entry.major), cleanText(entry.degree)]
      .filter(Boolean)
      .join(" | ");

    if (header) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: header,
              bold: true,
              size: 24,
              font: "Microsoft YaHei",
            }),
          ],
        }),
      );
    }

    const degreeParagraph = bodyParagraph(degreeLine);
    if (degreeParagraph) {
      children.push(degreeParagraph);
    }

    const coreCourses = bodyParagraph(cleanText(entry.coreCourses), {
      boldPrefix: "核心课程：",
      indent: 240,
    });
    if (coreCourses) {
      children.push(coreCourses);
    }

    const honors = bodyParagraph(cleanText(entry.honors), {
      boldPrefix: "在校成绩及荣誉：",
      indent: 240,
    });
    if (honors) {
      children.push(honors);
    }

    const certificates = bodyParagraph(cleanText(entry.certificates), {
      boldPrefix: "技能证书：",
      indent: 240,
    });
    if (certificates) {
      children.push(certificates);
    }
  }

  return children;
}

function buildProfessionalStrengthsSection(resume: TemplateResumeData) {
  const children: Paragraph[] = [];

  const summary = bodyParagraph(cleanText(resume.professionalStrengths.summary), {
    boldPrefix: "专业经验：",
  });
  if (summary) {
    children.push(summary);
  }

  const skillLines = cleanList(resume.professionalStrengths.skillLines);
  if (skillLines.length) {
    const skillTitle = bodyParagraph("", { boldPrefix: "专业技能：" });
    if (skillTitle) {
      children.push(skillTitle);
    }

    skillLines.forEach((item, index) => {
      const paragraph = numberedParagraph(index + 1, item, 360);
      if (paragraph) {
        children.push(paragraph);
      }
    });
  }

  const quality = bodyParagraph(cleanText(resume.professionalStrengths.coreQuality), {
    boldPrefix: "核心素质：",
  });
  if (quality) {
    children.push(quality);
  }

  return children;
}

function buildExperienceSection(entries: TemplateExperienceEntry[]) {
  const children: Paragraph[] = [];

  for (const [index, entry] of entries.entries()) {
    const header = [cleanText(entry.period), cleanText(entry.company), cleanText(entry.role)]
      .filter(Boolean)
      .join("  ");

    if (header) {
      children.push(
        new Paragraph({
          spacing: { before: index === 0 ? 0 : 180, after: 80 },
          children: [
            new TextRun({
              text: `${index + 1}. ${header}`,
              bold: true,
              size: 24,
              font: "Microsoft YaHei",
            }),
          ],
        }),
      );
    }

    const companySummary = bodyParagraph(cleanText(entry.companySummary), {
      boldPrefix: "公司/业务背景：",
      indent: 240,
    });
    if (companySummary) {
      children.push(companySummary);
    }

    const responsibilities = cleanList(entry.responsibilities);
    if (responsibilities.length) {
      const title = bodyParagraph("", { boldPrefix: "岗位职责：" });
      if (title) {
        children.push(title);
      }

      responsibilities.forEach((item, itemIndex) => {
        const paragraph = numberedParagraph(itemIndex + 1, item, 360);
        if (paragraph) {
          children.push(paragraph);
        }
      });
    }

    const achievements = cleanList(entry.achievements);
    if (achievements.length) {
      const title = bodyParagraph("", { boldPrefix: "工作成果：" });
      if (title) {
        children.push(title);
      }

      achievements.forEach((item, itemIndex) => {
        const paragraph = numberedParagraph(itemIndex + 1, item, 360);
        if (paragraph) {
          children.push(paragraph);
        }
      });
    }
  }

  return children;
}

function buildProjectSection(entries: TemplateProjectEntry[]) {
  const children: Paragraph[] = [];

  for (const [index, entry] of entries.entries()) {
    const header = [cleanText(entry.period), cleanText(entry.name), cleanText(entry.role)]
      .filter(Boolean)
      .join("  ");

    if (header) {
      children.push(
        new Paragraph({
          spacing: { before: index === 0 ? 0 : 180, after: 80 },
          children: [
            new TextRun({
              text: `${index + 1}. ${header}`,
              bold: true,
              size: 24,
              font: "Microsoft YaHei",
            }),
          ],
        }),
      );
    }

    const summary = bodyParagraph(cleanText(entry.summary), {
      boldPrefix: "项目介绍：",
      indent: 240,
    });
    if (summary) {
      children.push(summary);
    }

    const highlights = cleanList(entry.highlights);
    if (highlights.length) {
      const title = bodyParagraph("", { boldPrefix: "亮点与成果：" });
      if (title) {
        children.push(title);
      }

      highlights.forEach((item, itemIndex) => {
        const paragraph = numberedParagraph(itemIndex + 1, item, 360);
        if (paragraph) {
          children.push(paragraph);
        }
      });
    }
  }

  return children;
}

function buildCampusSection(entries: TemplateCampusExperienceEntry[]) {
  const children: Paragraph[] = [];

  for (const [index, entry] of entries.entries()) {
    const header = [cleanText(entry.period), cleanText(entry.title), cleanText(entry.role)]
      .filter(Boolean)
      .join("  ");

    if (header) {
      children.push(
        new Paragraph({
          spacing: { before: index === 0 ? 0 : 180, after: 80 },
          children: [
            new TextRun({
              text: `${index + 1}. ${header}`,
              bold: true,
              size: 24,
              font: "Microsoft YaHei",
            }),
          ],
        }),
      );
    }

    if (entry.mode === "detailed") {
      const background = bodyParagraph(cleanText(entry.background), {
        boldPrefix: "背景介绍：",
        indent: 240,
      });
      if (background) {
        children.push(background);
      }

      const responsibilities = bodyParagraph(cleanText(entry.responsibilities), {
        boldPrefix: "核心职责：",
        indent: 240,
      });
      if (responsibilities) {
        children.push(responsibilities);
      }

      const result = bodyParagraph(cleanText(entry.result), {
        boldPrefix: "项目成绩：",
        indent: 240,
      });
      if (result) {
        children.push(result);
      }
    } else {
      cleanList(entry.bullets).forEach((item, itemIndex) => {
        const paragraph = numberedParagraph(itemIndex + 1, item, 360);
        if (paragraph) {
          children.push(paragraph);
        }
      });
    }
  }

  return children;
}

export async function buildResumeDocx(
  resume: TemplateResumeData,
  profilePhotoDataUrl?: string | null,
) {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: cleanText(resume.personal.name) || "未命名候选人",
          bold: true,
          size: 36,
          font: "Microsoft YaHei",
        }),
      ],
    }),
  );

  const metaLine = [
    buildMetaLine("电话", resume.personal.phone),
    buildMetaLine("邮箱", resume.personal.email),
    buildMetaLine("年龄", resume.personal.age),
    buildMetaLine("最高学历", resume.personal.highestEducation),
  ]
    .filter(Boolean)
    .join("  |  ");

  if (metaLine) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: metaLine,
            size: 21,
            font: "Microsoft YaHei",
          }),
        ],
      }),
    );
  }

  const photo = profilePhotoDataUrl
    ? decodeProfilePhotoDataUrl(profilePhotoDataUrl)
    : null;
  if (photo) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 },
        children: [
          new ImageRun({
            type: photo.type,
            data: photo.data,
            transformation: { width: 108, height: 144 },
          }),
        ],
      }),
    );
  }

  const sections: Array<{ title: string; paragraphs: Paragraph[] }> = [
    {
      title: "教育经历",
      paragraphs: buildEducationSection(resume.educations),
    },
    {
      title: "专业能力",
      paragraphs: buildProfessionalStrengthsSection(resume),
    },
    {
      title: cleanText(resume.experienceSectionTitle) || "经历",
      paragraphs: buildExperienceSection(resume.experiences),
    },
    {
      title: "项目经历",
      paragraphs: buildProjectSection(resume.projects),
    },
    {
      title: "在校经历",
      paragraphs: buildCampusSection(resume.campusExperiences),
    },
  ];

  for (const section of sections) {
    if (!section.paragraphs.length) {
      continue;
    }

    children.push(sectionTitle(section.title));
    children.push(...section.paragraphs);
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Microsoft YaHei",
            size: 21,
          },
          paragraph: {
            spacing: {
              line: 320,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(18),
              right: convertMillimetersToTwip(16),
              bottom: convertMillimetersToTwip(18),
              left: convertMillimetersToTwip(16),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
