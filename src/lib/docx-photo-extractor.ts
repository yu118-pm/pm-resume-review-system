import JSZip from "jszip";

const SUPPORTED_IMAGE_TYPES = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

function pngDimensions(data: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 24 || !signature.every((value, index) => data[index] === value)) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

function jpegDimensions(data: Uint8Array) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let index = 2;

  while (index + 9 < data.length) {
    if (data[index] !== 0xff) {
      index += 1;
      continue;
    }

    const marker = data[index + 1];
    index += 2;

    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }

    if (index + 2 > data.length) {
      return null;
    }

    const segmentLength = view.getUint16(index);
    if (segmentLength < 2 || index + segmentLength > data.length) {
      return null;
    }

    if (
      [
        0xc0,
        0xc1,
        0xc2,
        0xc3,
        0xc5,
        0xc6,
        0xc7,
        0xc9,
        0xca,
        0xcb,
        0xcd,
        0xce,
        0xcf,
      ].includes(marker)
    ) {
      return {
        height: view.getUint16(index + 3),
        width: view.getUint16(index + 5),
      };
    }

    index += segmentLength;
  }

  return null;
}

function imageDimensions(data: Uint8Array, suffix: string) {
  if (suffix === ".png") {
    return pngDimensions(data);
  }

  if (suffix === ".jpg" || suffix === ".jpeg") {
    return jpegDimensions(data);
  }

  return null;
}

function scoreImage(width: number, height: number, byteLength: number) {
  if (width < 120 || height < 120) {
    return -1;
  }

  const ratio = height ? width / height : 0;
  const portraitBonus = ratio >= 0.55 && ratio <= 0.95 ? 1.25 : 1;
  return Math.floor(width * height * portraitBonus + byteLength);
}

export async function extractBestResumePhotoFromDocx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  let best: { score: number; mimeType: string; base64: string } | null = null;

  for (const [name, file] of Object.entries(zip.files)) {
    if (!name.startsWith("word/media/") || file.dir) {
      continue;
    }

    const suffix = name.slice(name.lastIndexOf(".")).toLowerCase();
    const mimeType = SUPPORTED_IMAGE_TYPES.get(suffix);
    if (!mimeType) {
      continue;
    }

    const data = await file.async("uint8array");
    const dimensions = imageDimensions(data, suffix);
    if (!dimensions) {
      continue;
    }

    const score = scoreImage(dimensions.width, dimensions.height, data.byteLength);
    if (score < 0) {
      continue;
    }

    const candidate = {
      score,
      mimeType,
      base64: Buffer.from(data).toString("base64"),
    };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  if (!best) {
    return null;
  }

  return {
    mimeType: best.mimeType,
    base64: best.base64,
  };
}
