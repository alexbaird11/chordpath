---
name: chordpath-issue-pr
description: >-
  Turn ChordPath issue-tracker entries into coherent implementation batches and
  open a draft pull request against alexbaird11/chordpath. Reads the "ChordPath
  Issues" Google Doc tracker read-only, groups related issues into a single
  coherent batch, implements the changes on a feature branch, and opens a DRAFT
  PR. Use when asked to triage the ChordPath tracker, implement the next issue
  batch, or open a ChordPath PR.
---

# ChordPath Issue-to-PR

Convert entries from the ChordPath issue tracker into a working, reviewable
change set and open a **draft** pull request. The skill is deliberately
conservative: it reads the tracker read-only, never edits or comments on the
source document, and always opens PRs as drafts for human review.

## When to use

Invoke this skill when the user asks to:

- "Implement the next coherent issue batch and open a draft PR."
- Triage or work through the ChordPath issue tracker.
- Turn one or more tracked ChordPath issues into a branch + draft PR.

## Inputs

- **Tracker**: the Google Doc titled **"ChordPath Issues"** (see
  `references/source-and-permissions.md` for the canonical id/URL and the
  read-only access policy). The tracker is a flat text document; issue blocks
  are separated by a line containing only `//`.
- **Repository**: `alexbaird11/chordpath`.

## Workflow

1. **Read the tracker (read-only).** Fetch the "ChordPath Issues" doc via the
   Google Drive/Docs integration. If that is unavailable, fall back to the
   public document export / browser view. Never request edit, comment, delete,
   or sharing permissions. See `references/source-and-permissions.md`.

2. **Parse issues.** Pipe the tracker text through
   `scripts/parse_issue_tracker.py`. It emits a JSON array of structured issues
   with `issue_name`, `workflow`, `description`, `evidence`, `video_link`, and
   `third_party_references`, and can group issues by workflow into candidate
   batches (`--group`).

3. **Select a coherent batch.** Prefer issues that share a `workflow` (e.g.
   `Editor`, `Practice`, `Piece`) or that touch the same subsystem, so the batch
   reviews as one logical change. Keep batches small enough to review.

4. **Implement.** Make the changes on a dedicated feature branch. Match the
   surrounding code style in `index.html` / `tests/`. Add or update tests where
   the repo already has coverage (Playwright).

5. **Open a DRAFT PR.** Follow `references/pr-workflow.md`: branch naming, draft
   status, PR body that lists every tracked issue the batch addresses, and the
   attribution footer. Do not mark ready-for-review automatically.

## Guardrails

- **Read-only Google access.** Never edit, comment on, delete, or change sharing
  of the tracker.
- **Draft PRs only.** A human opts the PR out of draft.
- **Scope.** Only implement what the selected batch covers; do not opportunis-
  tically refactor unrelated code.

## Companion agent

`agents/openai.yaml` describes the equivalent agent for OpenAI/Codex runtimes so
the same workflow can run outside Claude Code. It is documentation of the agent
contract, not something this skill executes.
