#!/usr/bin/env python3
"""Parse the ChordPath issue tracker into structured JSON.

The tracker (the "ChordPath Issues" Google Doc) is flat text. Issue blocks are
separated by a line containing only ``//``. Within a block, fields are labeled:

    Issue Name: ...
    Workflow: ...
    Issue Description: ...
    Evidence: ...
    Video link: ...            (optional)
    Third Party References: ...

Labels may be Markdown-styled (e.g. ``## Issue Name:``). A field's value runs
until the next recognized label or the end of the block, so multi-line values
are preserved.

Usage:
    python3 parse_issue_tracker.py [FILE] [--group] [--indent N]

Reads FILE, or stdin when FILE is omitted or ``-``. Emits a JSON array of
issues, or (with --group) an object keyed by workflow.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Dict, List

# Canonical field label -> output key. Order matters: longer/more specific
# labels are matched before shorter ones that could be prefixes.
FIELD_LABELS = [
    ("Issue Name", "issue_name"),
    ("Workflow", "workflow"),
    ("Issue Description", "description"),
    ("Evidence", "evidence"),
    ("Video link", "video_link"),
    ("Third Party References", "third_party_references"),
]

# Match a label at the start of a line, tolerating leading Markdown heading
# markers ("#", "##", ...) and surrounding whitespace, followed by a colon.
_LABEL_ALTERNATION = "|".join(re.escape(label) for label, _ in FIELD_LABELS)
_LABEL_RE = re.compile(
    r"^\s*#*\s*(?P<label>" + _LABEL_ALTERNATION + r")\s*:\s*(?P<value>.*)$",
    re.IGNORECASE,
)

_LABEL_TO_KEY = {label.lower(): key for label, key in FIELD_LABELS}


def split_blocks(text: str) -> List[str]:
    """Split the document into raw issue blocks on ``//`` separator lines."""
    blocks: List[str] = []
    current: List[str] = []
    for line in text.splitlines():
        if line.strip() == "//":
            blocks.append("\n".join(current))
            current = []
        else:
            current.append(line)
    blocks.append("\n".join(current))
    return blocks


def parse_block(block: str) -> Dict[str, str]:
    """Parse one issue block into a dict of fields.

    Values span multiple lines until the next recognized label.
    """
    fields: Dict[str, List[str]] = {}
    current_key: str | None = None
    for line in block.splitlines():
        m = _LABEL_RE.match(line)
        if m:
            current_key = _LABEL_TO_KEY[m.group("label").lower()]
            fields.setdefault(current_key, [])
            value = m.group("value").strip()
            if value:
                fields[current_key].append(value)
        elif current_key is not None:
            fields[current_key].append(line)

    issue: Dict[str, str] = {}
    for _, key in FIELD_LABELS:
        raw = fields.get(key)
        if raw is None:
            issue[key] = ""
        else:
            issue[key] = "\n".join(raw).strip()
    return issue


def parse_tracker(text: str) -> List[Dict[str, str]]:
    """Parse the full tracker text into a list of issues.

    Blocks with no issue name and no description are treated as empty and
    skipped (handles stray separators / preamble).
    """
    issues: List[Dict[str, str]] = []
    for block in split_blocks(text):
        if not block.strip():
            continue
        issue = parse_block(block)
        if not issue["issue_name"] and not issue["description"]:
            continue
        issues.append(issue)
    return issues


def group_by_workflow(issues: List[Dict[str, str]]) -> Dict[str, List[Dict[str, str]]]:
    """Group issues by their workflow to suggest coherent batches."""
    grouped: Dict[str, List[Dict[str, str]]] = {}
    for issue in issues:
        key = issue["workflow"] or "Unspecified"
        grouped.setdefault(key, []).append(issue)
    return grouped


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "file",
        nargs="?",
        default="-",
        help="Tracker text file (default: stdin, or '-').",
    )
    parser.add_argument(
        "--group",
        action="store_true",
        help="Group issues by workflow into candidate batches.",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON indent (default: 2).",
    )
    args = parser.parse_args(argv)

    if args.file == "-":
        text = sys.stdin.read()
    else:
        with open(args.file, "r", encoding="utf-8") as fh:
            text = fh.read()

    issues = parse_tracker(text)
    payload = group_by_workflow(issues) if args.group else issues
    json.dump(payload, sys.stdout, indent=args.indent, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
