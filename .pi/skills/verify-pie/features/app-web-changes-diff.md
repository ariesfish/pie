# App web — changes panel and diff view

The git surface of the workspace: the Changes tab lists dirty files from
`git.status` (porcelain -z), clicking one opens the diff document — canvas
painted by the W3c diff engine with sticky header paths. Driven by `fs.changed`
events; no polling.

## Sub-features

- Changes tab (role tab, name `Changes`), file list (`src/app.ts`, untracked
  `notes.txt`)
- diff document: `[data-diff-sticky-header-path]` header + `canvas` line
  painting (DOM text assertions are gone by design)
- refresh driven by `workspace.fs.changed` (150 ms debounce)

## How to get to it (user POV)

1. Same launch as `app-web-files-markdown.md`; the fixture workspace is dirty
   by construction (`src/app.ts` modified after commit, `notes.txt` untracked).
2. Click the Changes tab → the list shows the dirty files.
3. Click `src/app.ts` → the diff renders with a sticky header and painted
   canvas.

## Driving it with control-web

```bash
node helpers/gen-steps.mjs <runId> <evidenceDir>
# steps-app-web-diff.json (hand-written per run, same shape):
#   navigate appUrl (settleMs 4000) → click tab text "Changes" → shot
#   → click text "src/app.ts" → expect selector "[data-diff-sticky-header-path]"
#   → shot (vision reviews the canvas) → expect selector "canvas"
node <control.mjs> drive --port <chromePort> --steps <evidenceDir>/steps-app-web-diff.json --out <evidenceDir>/app-web-diff
```

Assertions: sticky header path present + at least one canvas; the actual diff
content is visual (canvas) — the shot is the proof, reviewed by a vision pass,
not by DOM text.

## Gotchas

- Needs the fixture's git repo; a workspace without `.git` reports
  `not_a_repo` honestly — don't fake it green.
- Canvas painting is async after mount; put a shot step between the click and
  the canvas expect (shot = settle in the frozen harness).
- Text finder clicks the first leaf containing `src/app.ts` — with both a
  files tree and a changes list present, ensure the Changes tab is active
  before clicking, or the click may reopen the file viewer instead.
- Untracked files appear via `git.diff --includeUntracked` synthetic patch —
  `notes.txt` is present in the list; clicking it is a second sub-journey.
