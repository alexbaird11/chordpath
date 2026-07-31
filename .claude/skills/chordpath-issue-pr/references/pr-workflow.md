# PR workflow

## 1. Branch

Create a dedicated feature branch off the latest default branch (`main`). Use a
descriptive slug tied to the batch, e.g.:

```
git fetch origin main
git checkout -B chordpath/<batch-slug> origin/main
```

Never commit the batch to `main` directly.

## 2. Implement

- Keep the change scoped to the selected batch of tracked issues.
- Match the existing code style (the app is largely a single `index.html`, with
  Playwright tests under `tests/`).
- Update or add tests where the repo already exercises the affected behavior.
- Run the test suite locally where feasible before opening the PR.

## 3. Commit

Small, coherent commits with clear messages. Reference the issue names from the
tracker in the commit body when helpful (the tracker has no numeric ids, so use
the `Issue Name:` text).

## 4. Open a DRAFT pull request

- **Draft is mandatory.** Open the PR as a draft; a human decides when it is
  ready for review.
- **Base:** `main`. **Head:** your feature branch.
- **Title:** concise summary of the batch.
- **Body:** must include:
  - a short summary of the change,
  - a **checklist of every tracked issue** the batch addresses (by
    `Issue Name`), with its `Workflow`,
  - test/verification notes,
  - links to any evidence (video/screenshot) referenced by the issues.

### Body template

```markdown
## Summary
<what this batch changes and why it is coherent>

## Tracked issues addressed
- [ ] <Issue Name> (Workflow: <workflow>)
- [ ] <Issue Name> (Workflow: <workflow>)

## Testing
<what was run / what to verify>

## Evidence
<links from the tracker, if any>
```

## 5. Hand off

Stop after opening the draft PR. Do not mark it ready-for-review, request
reviewers, or merge. Report the PR URL back to the user.
