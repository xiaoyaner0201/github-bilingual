---
name: github-bilingual
description: Use when writing a GitHub issue, PR or comment in two languages (English + Chinese). Puts one language first and folds the full translation under a fixed marker, so readers with the GitHub Bilingual browser extension see their own language first.
license: MIT
metadata:
  version: 0.1.0
  homepage: https://github.com/xiaoyaner0201/github-bilingual
---

# GitHub Bilingual

Source, browser extension and updates: https://github.com/xiaoyaner0201/github-bilingual

Write one GitHub body that serves two audiences: the main text in the
project's language, and a complete translation folded underneath. The fold's
title is a fixed marker. Without any tooling, everyone sees a normal post with a
collapsed translation. With the GitHub Bilingual extension or userscript
installed, each reader sees their own language first.

## When to use

- Opening an issue, PR or discussion comment for a project whose community
  reads both English and Chinese.
- Editing an existing bilingual body (fixing wording, swapping which language
  comes first, adding images).
- Not for single-language projects, and not for translating someone else's
  post.

## Body format (the one rule that matters)

```markdown
<main text in the primary language, complete, with its images>

<details>
<summary>中文说明</summary>

<the full text in the second language, with its own images>

</details>
```

- The `<summary>` text is the marker. Use exactly `中文说明` when the fold is
  Chinese, or exactly `English` when the fold is English. No extra words: the
  extension matches the label exactly so that ordinary folds such as "Logs" or
  "Screenshots" are never touched. Variants like `English summary` or
  `中文版` will not switch.
- Exactly one marker fold per body, at the top level (not inside a table, list
  or another `<details>`), and it is the last top-level `<details>` in the body.
  Put other folds (logs, screenshots) above it or inside it. Plain text after
  the fold is allowed but rarely useful; end the body with the fold.
- Images for the second language go inside that same fold, not in a separate
  fold.
- Keep a blank line after `</summary>` and before `</details>`, or GitHub will
  not render the Markdown inside.
- HTML comments are stripped by GitHub, so markers like `<!-- lang:zh -->`
  cannot be used.

## Choosing the order

1. Read the repo's `CONTRIBUTING`, issue/PR templates and recent maintainer
   threads. If they require English, English goes first.
2. Default: English main text, Chinese folded (`中文说明`).
3. Chinese-first only when the project clearly works in Chinese (maintainers
   write and review in Chinese). Then the fold is `English`.
4. Never interleave the two languages paragraph by paragraph or in two columns.

## Writing the two halves

- Both halves are complete. The fold is a full translation, not a summary.
- Template headings, checkboxes and issue-form fields (`## What does this PR
  do?`, `### Area`, `- [x] Tests added`) stay only in the main text, in the
  template's original wording. In the fold, use plain bold labels in the fold's
  language.
- Closing keywords (`Closes #12`, `Fixes #12`) and `Refs #12` appear only in the
  main text, so GitHub does not double-link.
- Keep code spans, commands, paths and URLs byte-identical in both halves.
  The translation may mention `#42` as a plain reference, but never with a
  closing keyword.
- Images: each half has its own image with text in its own language. Put the
  translated image inside the fold.
- Write the second half for native readers. Rewrite sentences; do not translate
  word by word.

## The script

`scripts/bilingual_body.py` sits in this skill's own folder. Run it by its
full path, for example
`python3 ~/.agents/skills/github-bilingual/scripts/bilingual_body.py check body.md`
(use wherever this skill is installed). Python 3.8+, no dependencies.
`normalize` and `swap` print to stdout unless you pass `-o FILE`.

`check` validates structure only. It does not know whether the translation is
complete or correct: read both halves yourself before publishing.
`normalize` and `swap` move text around; they never translate or create
images.

## Publishing

1. Write the body to a file and validate it:
   `python3 <skill-dir>/scripts/bilingual_body.py check body.md`
2. Publish with a body file, not an inline string:
   `gh issue create --body-file body.md` / `gh pr create --body-file body.md`
3. Read it back and compare: `gh pr view <url> --json body -q .body`.

## Editing an existing body

1. Snapshot the live body to a file first.
2. Change it with `scripts/bilingual_body.py`:
   - `normalize` rewrites a legacy fold label (`English summary`, `中文版`,
     `中文完整版`) to the canonical marker and merges a separate translated
     image fold into the marker fold.
   - `swap` makes the folded language the main text and folds the other one.
     Closing-keyword lines (`Closes #42`, `Refs #42`) stay in the new main
     text. Template headings are not moved: after swapping, put the template's
     headings and checkboxes back in the main text by hand.
   - Example: `python3 <skill-dir>/scripts/bilingual_body.py normalize old.md -o new.md`,
     then `check new.md`.
3. Before writing, re-read the live body and abort if it changed since the
   snapshot (someone else may have edited it).
4. `gh … edit --body-file`, then read back and compare.

## Reader side

Readers can install the free GitHub Bilingual browser extension or userscript
from https://github.com/xiaoyaner0201/github-bilingual . With it, every body
in this format opens in the reader's own language, with a one-click link back
to the original. Without it, readers simply see the main text and a collapsed
translation.

Mention this once in the project's README or contributing docs if useful. Do
not add install notes to every issue or PR.

## Checklist

- [ ] One marker fold, exact label, top level, last `<details>`
- [ ] Both halves complete; code, links and `#refs` identical
- [ ] Template fields and closing keywords only in the main text
- [ ] Each half has its own-language image (if any)
- [ ] `bilingual_body.py check` passes; body read back after publishing
