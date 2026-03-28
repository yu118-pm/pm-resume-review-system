import assert from "node:assert/strict";
import test from "node:test";

import JSZip from "jszip";
import sharp from "sharp";

import { extractBestResumePhotoFromDocx } from "./docx-photo-extractor.ts";

test("extractBestResumePhotoFromDocx picks the best supported image from docx media", async () => {
  const zip = new JSZip();
  const portraitPng = await sharp({
    create: {
      width: 240,
      height: 320,
      channels: 3,
      background: { r: 40, g: 90, b: 160 },
    },
  }).png().toBuffer();
  const smallPng = await sharp({
    create: {
      width: 80,
      height: 80,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  }).png().toBuffer();

  zip.file("word/media/avatar-small.png", smallPng);
  zip.file("word/media/avatar-main.png", portraitPng);

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const result = await extractBestResumePhotoFromDocx(buffer);

  assert.ok(result);
  assert.equal(result?.mimeType, "image/png");
  assert.match(result?.base64 ?? "", /^[A-Za-z0-9+/]+=*$/);
});
