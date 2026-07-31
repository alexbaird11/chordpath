# Source & permissions

## Tracker source

The canonical issue tracker is a Google Doc:

- **Title:** `ChordPath Issues`
- **Document id:** `1EYNToc1EmAoWmn2cttJahIjq4H05vVJdsqxb8Q-mg-o`
- **View URL:** https://docs.google.com/document/d/1EYNToc1EmAoWmn2cttJahIjq4H05vVJdsqxb8Q-mg-o/edit
- **Owner:** the ChordPath maintainer's Google account
- **MIME type:** `application/vnd.google-apps.document`

A near-duplicate titled `Copy of ChordPath Issues` may also exist. Prefer the
canonical `ChordPath Issues` document unless the user points at a specific copy.

### Tracker format

The document is flat text. Each issue is a block of labeled fields, and blocks
are separated by a line containing only `//`. Fields observed in the wild:

```
Issue Name: <short title>
Workflow: <Editor | Practice | Piece | ...>
Issue Description: <free text>
Evidence: <free text, may reference images/screenshots>
Video link: <optional URL>
Third Party References: <free text or N/A>
//
```

Headings are sometimes Markdown-styled (e.g. `## Issue Name:`). The parser in
`scripts/parse_issue_tracker.py` tolerates both forms.

## Access policy (READ-ONLY)

Access to the tracker is **strictly read-only**. This skill and its agents must
**never**:

- edit the document,
- add or resolve comments,
- delete the document,
- change its sharing / permissions.

### How to read it

1. **Preferred:** the Google Drive / Google Docs MCP integration
   (`read_file_content` / `download_file_content` / export), authenticated as the
   maintainer. This is sufficient to read the tracker.
2. **Fallback:** if no Google MCP is available, use the document's public export
   or a browser view of the View URL above.

If neither read path is available, stop and report that the tracker cannot be
read — do not request write scopes to work around it.

## GitHub access

- **Repository:** `alexbaird11/chordpath`
- **Needed:** read, push feature branches, open **draft** pull requests.
- **Tooling:** `git` over the configured remote, and/or the GitHub MCP tools
  (`create_branch`, `create_pull_request`, …). The `gh` CLI may not be present;
  do not depend on it.
- Never push directly to `main`; always work on a feature branch and open a PR.
