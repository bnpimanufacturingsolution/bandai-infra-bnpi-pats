# GitHub Ticket Image Evidence Workflow

Status: ACTIVE
Last reviewed: 2026-06-29

Use this workflow when a ticket, project item update, issue comment, or PR comment needs screenshot evidence.

## Goal

Turn a local screenshot into a GitHub-rendered image embed that will still work in future sessions without committing image files into the repository.

## What This Is Not

- This is not a git commit of image files.
- This is not adding screenshots into repo history.
- This does not bloat the repository when done through GitHub `user-attachments`.
- Never add ticket screenshots to git just to make them render on GitHub, unless the user explicitly asks for repo-tracked image assets.

## Canonical Workflow

1. Capture the screenshot locally and keep it under `output/visual-audit/<topic>-YYYY-MM-DD/`.
2. Open the target GitHub surface in the browser:
   - GitHub Project item update
   - linked issue comment
   - issue body/comment
   - PR comment
3. Prefer uploading directly in the actual ticket or project-update editor where the screenshot should live.
4. In that GitHub markdown editor, drag the image in, paste it from the clipboard, or use the file picker.
5. Wait for GitHub to finish uploading and insert markdown in this shape:

```md
![Descriptive label](https://github.com/user-attachments/assets/<generated-id>)
```

6. Keep that generated markdown. This is the actual embeddable artifact.
7. Submit the ticket/update normally.

## Important Rules

- Do not expect a local Windows path like `C:\...png` to render on GitHub. It will not.
- The image becomes reusable only after GitHub uploads it and gives back a `github.com/user-attachments/...` URL.
- A `github.com/user-attachments/...` image lives in GitHub attachment storage, not in this repo's git history.
- Do not move ticket evidence screenshots into `docs/`, `app/assets/`, or any tracked folder just to embed them in GitHub.
- `output/visual-audit/` is local scratch evidence and is already treated as non-canonical tracked output in this repo.
- If the environment cannot write directly to GitHub, keep the screenshot locally, record its path in the handoff, and do the upload in the browser manually.

## Project Ticket Notes

- Preferred path: upload directly inside the real ticket/project update field.
- Fallback only: if a Project field is awkward about uploads, use any GitHub markdown composer once to generate the `user-attachments` markdown, then paste that markdown into the final ticket/update field.
- That fallback still does not add the image to the repository.

## Recommended Ticket Or Update Shape

```md
Visual audit evidence for the HR attendance trend update.

![HR attendance page showing the chart header with embedded Filters trigger](https://github.com/user-attachments/assets/<generated-id>)
```

Use the same shape for project updates, issue bodies, issue comments, and PR comments. The preferred target is still the actual ticket or project-update field where the evidence should live.

## Good Practice

- Name screenshots clearly before upload so the default alt text starts from something readable.
- Add one short line explaining what the screenshot proves.
- Prefer one screenshot per claim unless a comparison is necessary.
- If the screenshot came from a chat-only artifact or external source, also register the original through WWG source intake when accessible.
