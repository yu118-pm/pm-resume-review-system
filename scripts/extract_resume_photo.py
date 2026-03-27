#!/usr/bin/env python3

import argparse
import base64
import json
import struct
from pathlib import Path
from zipfile import ZipFile


SUPPORTED_IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    return parser.parse_args()


def png_dimensions(data):
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width, height = struct.unpack(">II", data[16:24])
    return width, height


def jpeg_dimensions(data):
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return None

    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue

        marker = data[index + 1]
        index += 2

        if marker in {0xD8, 0xD9}:
            continue

        if index + 2 > len(data):
            return None

        segment_length = struct.unpack(">H", data[index : index + 2])[0]
        if segment_length < 2 or index + segment_length > len(data):
            return None

        if marker in {
            0xC0,
            0xC1,
            0xC2,
            0xC3,
            0xC5,
            0xC6,
            0xC7,
            0xC9,
            0xCA,
            0xCB,
            0xCD,
            0xCE,
            0xCF,
        }:
            height, width = struct.unpack(">HH", data[index + 3 : index + 7])
            return width, height

        index += segment_length

    return None


def image_dimensions(data, suffix):
    if suffix == ".png":
        return png_dimensions(data)

    if suffix in {".jpg", ".jpeg"}:
        return jpeg_dimensions(data)

    return None


def score_image(width, height, byte_length):
    if width < 120 or height < 120:
        return -1

    ratio = width / height if height else 0
    portrait_bonus = 1.25 if 0.55 <= ratio <= 0.95 else 1.0
    return int(width * height * portrait_bonus + byte_length)


def extract_from_docx(path):
    best = None

    with ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.startswith("word/media/"):
                continue

            suffix = Path(name).suffix.lower()
            mime_type = SUPPORTED_IMAGE_TYPES.get(suffix)
            if not mime_type:
                continue

            data = archive.read(name)
            dimensions = image_dimensions(data, suffix)
            if not dimensions:
                continue

            width, height = dimensions
            score = score_image(width, height, len(data))
            if score < 0:
                continue

            candidate = {
                "score": score,
                "mimeType": mime_type,
                "base64": base64.b64encode(data).decode("ascii"),
            }

            if not best or candidate["score"] > best["score"]:
                best = candidate

    if not best:
        return None

    return {
        "mimeType": best["mimeType"],
        "base64": best["base64"],
    }


def main():
    args = parse_args()
    path = Path(args.input)
    ext = path.suffix.lower()

    if ext != ".docx":
        print("{}")
        return

    result = extract_from_docx(path)
    print(json.dumps(result or {}, ensure_ascii=False))


if __name__ == "__main__":
    main()
