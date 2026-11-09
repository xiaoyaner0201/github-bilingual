#!/usr/bin/env python3
"""Validate and edit bilingual GitHub bodies (main text + one marker fold).

Standard library only; works on Python 3.8+.

  bilingual_body.py check FILE            exit 0 when the body follows the format
  bilingual_body.py normalize FILE [-o OUT]  canonical fold label, merge image folds
  bilingual_body.py swap FILE [-o OUT]       folded language becomes the main text

The marker is the <summary> text of a top-level <details>: exactly
"中文说明" (fold is Chinese) or "English" (fold is English).
"""
import argparse
import re
import sys

MARKERS = {"中文说明": "zh", "English": "en"}
LABEL = {"zh": "中文说明", "en": "English"}
LEGACY_TEXT = {
    "zh": ["中文说明", "中文完整版", "中文版", "中文", "中文版本", "中文说明（完整对应正文）", "Chinese", "简体中文"],
    "en": ["English", "English summary", "English version", "英文", "英文版", "English translation"],
}
LEGACY_IMAGE = {"中文说明图", "中文版说明图", "中文配图", "English image", "English infographic"}
CLOSING = re.compile(r"^\s*(?:[-*]\s*)?(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?|related:?)\s+#\d+", re.I)

TAG = re.compile(r"<(/?)details\b[^>]*>", re.I)
SUMMARY = re.compile(r"\A[ \t]*\n?[ \t]*<summary>([^<]*)</summary>", re.I)
FENCE_LINE = re.compile(r"^[ \t]{0,3}(```|~~~)")


class Fold(object):
    """A balanced top-level <details> block."""

    def __init__(self, body, start, end, open_end, close_start):
        self.body = body
        self._start, self._end = start, end
        inner = body[open_end:close_start]
        m = SUMMARY.match(inner)
        self.label = m.group(1) if m else ""
        self.content = inner[m.end():] if m else inner

    def start(self):
        return self._start

    def end(self):
        return self._end

    def group(self, n):
        return {0: self.body[self._start:self._end], 1: self.label, 2: self.content}[n]


def _fence_mask(body):
    """Character ranges that sit inside fenced code blocks."""
    ranges, pos, open_at = [], 0, None
    for line in body.splitlines(True):
        if FENCE_LINE.match(line):
            if open_at is None:
                open_at = pos
            else:
                ranges.append((open_at, pos + len(line)))
                open_at = None
        pos += len(line)
    if open_at is not None:
        ranges.append((open_at, len(body)))
    return ranges


def _in(ranges, i):
    return any(a <= i < b for a, b in ranges)


def _top_level_folds(body):
    """Balanced <details> blocks at depth 0, outside code fences, starting a line."""
    fences = _fence_mask(body)
    out, depth, cur = [], 0, None
    for m in TAG.finditer(body):
        if _in(fences, m.start()):
            continue
        if m.group(1) == "":
            if depth == 0:
                line_start = body.rfind("\n", 0, m.start()) + 1
                cur = (m.start(), m.end()) if not body[line_start:m.start()].strip() else None
            depth += 1
        elif depth > 0:
            depth -= 1
            if depth == 0 and cur:
                out.append(Fold(body, cur[0], m.end(), cur[1], m.start()))
                cur = None
    return out


def _lang_of(label, table):
    s = label.strip()
    for lang, names in table.items():
        if s in names:
            return lang
    return None


def check(body):
    problems = []
    folds = _top_level_folds(body)
    markers = [m for m in folds if m.group(1).strip() in MARKERS]
    if not markers:
        legacy = [m.group(1).strip() for m in folds if _lang_of(m.group(1), LEGACY_TEXT)]
        if legacy:
            problems.append("fold label %r is not a marker; use 中文说明 or English (run normalize)" % legacy[0])
        else:
            problems.append("no marker fold: add <details><summary>中文说明</summary> or <summary>English</summary>")
        return problems
    if len(markers) > 1:
        problems.append("%d marker folds; keep exactly one" % len(markers))
    m = markers[-1]
    if folds[-1] is not m:
        problems.append("marker fold must be the last top-level <details> (move other folds above it)")
    inner = m.group(2)
    if not inner.startswith("\n\n") and not inner.startswith("\r\n\r\n"):
        problems.append("add a blank line after </summary> so GitHub renders the Markdown inside")
    if not re.search(r"\n\s*\n\s*$", inner):
        problems.append("add a blank line before </details>")
    main = body[:m.start()]
    if not main.strip():
        problems.append("main text is empty")
    in_fence = False
    for line in inner.splitlines():
        if FENCE_LINE.match(line):
            in_fence = not in_fence
            continue
        if not in_fence and CLOSING.match(line) and not line.lower().lstrip("-* ").startswith(("refs", "related")):
            problems.append("closing keyword inside the fold (%s); keep it in the main text only" % line.strip())
            break
    for leftover in folds:
        if leftover.group(1).strip() in LEGACY_IMAGE:
            problems.append("separate image fold %r; move the image into the marker fold" % leftover.group(1).strip())
    return problems


def normalize(body):
    folds = _top_level_folds(body)
    text = [m for m in folds if _lang_of(m.group(1), LEGACY_TEXT)]
    if len(text) != 1:
        raise SystemExit("normalize: expected one translation fold, found %d" % len(text))
    t = text[0]
    lang = _lang_of(t.group(1), LEGACY_TEXT) or "zh"
    images = [m for m in folds if m.group(1).strip() in LEGACY_IMAGE]
    out = body
    for m in sorted(images, key=lambda x: -x.start()):
        out = out[:m.start()] + out[m.end():]
    if images:
        out = re.sub(r"\n{3,}$", "\n", out)
        extra = "\n\n".join(m.group(2).strip() for m in images)
        start = out.find(t.group(0))
        close = out.rfind("</details>", 0, start + len(t.group(0)))
        out = out[:close] + extra + "\n\n" + out[close:]
    old = "<summary>" + t.group(1) + "</summary>"
    i = out.find(old)
    return out[:i] + "<summary>" + LABEL[lang] + "</summary>" + out[i + len(old):]


def swap(body):
    folds = _top_level_folds(body)
    markers = [m for m in folds if m.group(1).strip() in MARKERS]
    if len(markers) != 1:
        raise SystemExit("swap: expected exactly one marker fold (run check)")
    m = markers[0]
    fold_lang = MARKERS[m.group(1).strip()]
    main = body[:m.start()].rstrip()
    after = body[m.end():].strip()
    folded = m.group(2).strip()
    keep, rest, in_fence = [], [], False
    for line in main.splitlines():
        if FENCE_LINE.match(line):
            in_fence = not in_fence
        (keep if (not in_fence and CLOSING.match(line)) else rest).append(line)
    new_main = folded
    if keep:
        new_main += "\n\n" + "\n".join(k.strip() for k in keep)
    if after:
        new_main += "\n\n" + after
    other = "en" if fold_lang == "zh" else "zh"
    old_main = "\n".join(rest).strip()
    return "%s\n\n<details>\n<summary>%s</summary>\n\n%s\n\n</details>\n" % (new_main, LABEL[other], old_main)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["check", "normalize", "swap"])
    p.add_argument("file")
    p.add_argument("-o", "--output", help="write here instead of stdout")
    a = p.parse_args(argv)
    with open(a.file, encoding="utf-8") as f:
        body = f.read().replace("\r\n", "\n")
    if a.command == "check":
        problems = check(body)
        for x in problems:
            print("FAIL: " + x)
        if not problems:
            print("OK")
        return 1 if problems else 0
    out = normalize(body) if a.command == "normalize" else swap(body)
    if a.output:
        with open(a.output, "w", encoding="utf-8") as f:
            f.write(out)
    else:
        sys.stdout.write(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
