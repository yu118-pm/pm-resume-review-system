#!/usr/bin/env python3

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile


WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
COMMENTS_REL_TYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments"
)
COMMENTS_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"
)
NS = {"w": WORD_NS}
COMMENT_AUTHOR = "PM Review AI"
COMMENT_INITIALS = "AI"
PUNCTUATION_PATTERN = re.compile(r"[，,。；;：:\s｜|、（）()【】\[\]·\-_/]+", re.U)

ET.register_namespace("w", WORD_NS)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--comments", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def w_tag(name):
    return f"{{{WORD_NS}}}{name}"


def rel_tag(name):
    return f"{{{REL_NS}}}{name}"


def ct_tag(name):
    return f"{{{CONTENT_TYPES_NS}}}{name}"


def normalize_space(text):
    return re.sub(r"\s+", " ", text or "").strip()


def normalize_for_match(text):
    text = text or ""
    chars = []
    indexes = []

    for index, char in enumerate(text):
        if PUNCTUATION_PATTERN.fullmatch(char):
            continue
        chars.append(char.lower())
        indexes.append(index)

    return "".join(chars), indexes


def extract_tokens(text):
    return [token for token in PUNCTUATION_PATTERN.split(text or "") if len(token) >= 2]


def find_comment_root(files):
    if "word/comments.xml" in files:
        return ET.fromstring(files["word/comments.xml"])

    return ET.Element(w_tag("comments"))


def ensure_comment_relationship(document_rels_root):
    relationships = document_rels_root.findall(rel_tag("Relationship"))

    for relationship in relationships:
        if relationship.attrib.get("Type") == COMMENTS_REL_TYPE:
            return

    existing_ids = {
        relationship.attrib.get("Id", "")
        for relationship in relationships
        if relationship.attrib.get("Id")
    }
    next_id = 1

    while f"rId{next_id}" in existing_ids:
        next_id += 1

    ET.SubElement(
        document_rels_root,
        rel_tag("Relationship"),
        {
            "Id": f"rId{next_id}",
            "Type": COMMENTS_REL_TYPE,
            "Target": "comments.xml",
        },
    )


def ensure_comments_content_type(content_types_root):
    for child in content_types_root.findall(ct_tag("Override")):
        if child.attrib.get("PartName") == "/word/comments.xml":
            return

    ET.SubElement(
        content_types_root,
        ct_tag("Override"),
        {
            "PartName": "/word/comments.xml",
            "ContentType": COMMENTS_CONTENT_TYPE,
        },
    )


def next_comment_id(comments_root):
    ids = []
    for comment in comments_root.findall(w_tag("comment")):
        raw = comment.attrib.get(w_tag("id")) or comment.attrib.get("id")
        if raw is not None and str(raw).isdigit():
            ids.append(int(raw))

    return (max(ids) + 1) if ids else 0


PREVIOUS_ROUND_STATUS_TEXT = {
    "new": "本轮新发现",
    "modified": "上次已指出，学员已修改但仍需改进",
    "unchanged": "上次已指出，学员未修改",
    "resolved": "已解决",
}


def build_comment_body(comment):
    lines = [f"【问题】{comment['comment']}", f"【建议】{comment['suggestion']}"]
    example = comment.get("example")

    if example:
        lines.append(f"【示例】{example}")

    search_evidence = comment.get("searchEvidence")
    if search_evidence:
        lines.append(f"【搜索参考】{search_evidence}")

    status = comment.get("previousRoundStatus")
    if status:
        status_text = PREVIOUS_ROUND_STATUS_TEXT.get(status, "")
        if status_text:
            lines.append(f"【多轮状态】{status_text}")

    return lines


def append_comment(comments_root, comment_id, comment):
    node = ET.SubElement(
        comments_root,
        w_tag("comment"),
        {
            w_tag("id"): str(comment_id),
            w_tag("author"): COMMENT_AUTHOR,
            w_tag("initials"): COMMENT_INITIALS,
            w_tag("date"): datetime.now(timezone.utc).isoformat(),
        },
    )

    for line in build_comment_body(comment):
        paragraph = ET.SubElement(node, w_tag("p"))
        run = ET.SubElement(paragraph, w_tag("r"))
        text = ET.SubElement(run, w_tag("t"))
        text.text = line


def paragraph_runs(paragraph):
    return [child for child in list(paragraph) if child.tag == w_tag("r")]


def paragraph_text_and_segments(paragraph):
    runs = paragraph_runs(paragraph)
    segments = []
    text_parts = []
    offset = 0

    for run_index, run in enumerate(runs):
        run_text = "".join(node.text or "" for node in run.findall(".//w:t", NS))

        if not run_text:
            continue

        text_parts.append(run_text)
        segments.append(
            {
                "run_index": run_index,
                "start": offset,
                "end": offset + len(run_text),
                "text": run_text,
            }
        )
        offset += len(run_text)

    return "".join(text_parts), runs, segments


def locate_run_indexes(segments, start_char, end_char):
    start_run = None
    end_run = None

    for segment in segments:
        if start_run is None and segment["start"] <= start_char < segment["end"]:
            start_run = segment["run_index"]
        if segment["start"] < end_char <= segment["end"]:
            end_run = segment["run_index"]
            break

    if start_run is None and segments:
        start_run = segments[0]["run_index"]
    if end_run is None and segments:
        end_run = segments[-1]["run_index"]

    return start_run, end_run


def exact_match_range(paragraph, anchor_text):
    paragraph_text, runs, segments = paragraph_text_and_segments(paragraph)

    if not paragraph_text or not runs or not segments:
        return None

    start_char = paragraph_text.find(anchor_text)

    if start_char == -1:
        return None

    end_char = start_char + len(anchor_text)
    start_run, end_run = locate_run_indexes(segments, start_char, end_char)

    if start_run is None or end_run is None:
        return None

    return {"runs": runs, "start_run": start_run, "end_run": end_run}


def fuzzy_match_range(paragraph, anchor_text):
    paragraph_text, runs, segments = paragraph_text_and_segments(paragraph)

    if not paragraph_text or not runs or not segments:
        return None

    normalized_paragraph, paragraph_indexes = normalize_for_match(paragraph_text)
    normalized_anchor, anchor_indexes = normalize_for_match(anchor_text)

    if not normalized_anchor or not anchor_indexes:
        return None

    match_start = normalized_paragraph.find(normalized_anchor)

    if match_start == -1:
        return None

    original_start = paragraph_indexes[match_start]
    original_end = paragraph_indexes[match_start + len(normalized_anchor) - 1] + 1
    start_run, end_run = locate_run_indexes(segments, original_start, original_end)

    if start_run is None or end_run is None:
        return None

    return {"runs": runs, "start_run": start_run, "end_run": end_run}


def paragraph_score(paragraph, anchor_text):
    paragraph_text = normalize_space(
        "".join(node.text or "" for node in paragraph.findall(".//w:t", NS))
    )
    if not paragraph_text:
        return 0

    tokens = extract_tokens(anchor_text)
    if not tokens:
        return 0

    compact = normalize_for_match(paragraph_text)[0]
    score = 0

    for token in tokens:
        if normalize_for_match(token)[0] in compact:
            score += 1

    return score


def find_target(document_root, anchor_text):
    paragraphs = document_root.findall(".//w:p", NS)

    for paragraph in paragraphs:
        matched = exact_match_range(paragraph, anchor_text)
        if matched:
            return paragraph, matched, "exact"

    for paragraph in paragraphs:
        matched = fuzzy_match_range(paragraph, anchor_text)
        if matched:
            return paragraph, matched, "fuzzy"

    best = None
    best_score = 0

    for paragraph in paragraphs:
        score = paragraph_score(paragraph, anchor_text)
        if score > best_score:
            best = paragraph
            best_score = score

    if best is not None and best_score > 0:
        return best, None, "paragraph"

    for paragraph in paragraphs:
        text = normalize_space("".join(node.text or "" for node in paragraph.findall(".//w:t", NS)))
        if text:
            return paragraph, None, "paragraph"

    return None, None, "missing"


def insert_after(parent, target, node):
    children = list(parent)
    index = children.index(target)
    parent.insert(index + 1, node)


def attach_comment(paragraph, matched, comment_id):
    children = list(paragraph)
    if not children:
        return False

    start_node = ET.Element(w_tag("commentRangeStart"), {w_tag("id"): str(comment_id)})
    end_node = ET.Element(w_tag("commentRangeEnd"), {w_tag("id"): str(comment_id)})
    reference_run = ET.Element(w_tag("r"))
    ET.SubElement(reference_run, w_tag("commentReference"), {w_tag("id"): str(comment_id)})

    if matched is None:
        first_run = next((child for child in children if child.tag == w_tag("r")), None)
        last_run = next((child for child in reversed(children) if child.tag == w_tag("r")), None)

        if first_run is None or last_run is None:
            return False

        paragraph.insert(children.index(first_run), start_node)
        insert_after(paragraph, last_run, end_node)
        insert_after(paragraph, end_node, reference_run)
        return True

    runs = matched["runs"]
    start_run = runs[matched["start_run"]]
    end_run = runs[matched["end_run"]]
    paragraph.insert(children.index(start_run), start_node)
    insert_after(paragraph, end_run, end_node)
    insert_after(paragraph, end_node, reference_run)
    return True


def load_comments(path):
    payload = json.loads(Path(path).read_text("utf-8"))

    if not isinstance(payload, list):
        raise ValueError("comments 必须是 JSON 数组")

    return payload


def build_output(input_path, comments_path, output_path):
    comments = load_comments(comments_path)
    source_path = Path(input_path)
    target_path = Path(output_path)

    with NamedTemporaryFile(delete=False, suffix=".docx") as temp_file:
        temp_path = Path(temp_file.name)

    with ZipFile(source_path, "r") as source_zip:
        files = {item.filename: source_zip.read(item.filename) for item in source_zip.infolist()}

    document_root = ET.fromstring(files["word/document.xml"])
    document_rels_root = ET.fromstring(files["word/_rels/document.xml.rels"])
    content_types_root = ET.fromstring(files["[Content_Types].xml"])
    comments_root = find_comment_root(files)

    ensure_comment_relationship(document_rels_root)
    ensure_comments_content_type(content_types_root)
    comment_id = next_comment_id(comments_root)

    for comment in comments:
        paragraph, matched, _strategy = find_target(document_root, comment.get("anchorText", ""))

        if paragraph is None:
            continue

        appended = attach_comment(paragraph, matched, comment_id)

        if not appended:
            continue

        append_comment(comments_root, comment_id, comment)
        comment_id += 1

    files["word/document.xml"] = ET.tostring(
        document_root,
        encoding="utf-8",
        xml_declaration=True,
    )
    files["word/_rels/document.xml.rels"] = ET.tostring(
        document_rels_root,
        encoding="utf-8",
        xml_declaration=True,
    )
    files["[Content_Types].xml"] = ET.tostring(
        content_types_root,
        encoding="utf-8",
        xml_declaration=True,
    )
    files["word/comments.xml"] = ET.tostring(
        comments_root,
        encoding="utf-8",
        xml_declaration=True,
    )

    with ZipFile(temp_path, "w", compression=ZIP_DEFLATED) as target_zip:
        for filename, content in files.items():
            target_zip.writestr(filename, content)

    temp_path.replace(target_path)


def main():
    args = parse_args()
    build_output(args.input, args.comments, args.output)


if __name__ == "__main__":
    main()
