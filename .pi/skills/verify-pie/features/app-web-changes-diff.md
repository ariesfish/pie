# App web — changes panel and diff view

The git surface of the workspace: the Changes tab lists dirty files from
`git.status` (porcelain -z), clicking one opens the diff document — canvas
painted by the W3c diff engine with sticky header paths. Driven by `fs.changed`
events; no polling.

## Sub-features

- Changes tab (role tab, name `Changes`), file list (`src/app.ts`, untracked
  `notes.txt`)
- diff document: sticky header canvas (`data-testid="git-diff-sticky-header-<n>"`,
  paints dirname + basename as separate segments) + `canvas` line painting
  (DOM text assertions are gone by design)
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
#   navigate appUrl (settleMs 4000) → click aria "Changes" (rail mode tab,
#   icon-only — visible text does not exist) → shot → click text "src/app.ts"
#   → settle+shot (canvas paints async) → expect selector
#   "[data-testid=\"git-diff-sticky-header-0\"]" → shot (vision reviews the
#   canvas) → expect selector "canvas" → final shot
node <control.mjs> drive --port <chromePort> --steps <evidenceDir>/steps-app-web-diff.json --out <evidenceDir>/app-web-diff
```

Assertions: sticky header canvas present (`git-diff-sticky-header-<slotIndex>`,
surface.web.tsx) + at least one body canvas; the actual diff content is
visual (canvas) — the shot is the proof, reviewed by a vision pass,
not by DOM text.

Proven 2026-10-18 (overnight compression drill): 11/11 steps green,
evidence `.dev/audit/evidence/overnight-20261018/T-008/app-web-diff/` (drive
report + shots), side effects `ws-side-effects.json` (session.list empty —
files-only journey, no session created).

## Gotchas

- Rail mode tabs are **icon-only** (`accessibilityLabel` = Files/Changes/
  Packages; app-container.tsx RailMode) — locate with aria "Changes", never
  text; a text finder reports no match by construction.
- The sticky header is a canvas with `data-testid="git-diff-sticky-header-<n>"`
  (slot index, `surface.web.tsx`), not a DOM header element.
- The initial layout opens a New-session tab; clicking a changes entry opens
  the changes panel as its own tab (openChanges + loadDiff) — don't expect
  the diff behind the new-session form.
- Needs the fixture's git repo; a workspace without `.git` reports
  `not_a_repo` honestly — don't fake it green.
- Canvas painting is async after mount; put a shot step between the click and
  the canvas expect (shot = settle in the frozen harness).
- Text finder clicks the first leaf containing `src/app.ts` — with both a
  files tree and a changes list present, ensure the rail is in Changes mode
  before clicking, or the click may reopen the file viewer instead.
- Untracked files appear via `git.diff --includeUntracked` synthetic patch —
  `notes.txt` is present in the list; clicking it is a second sub-journey.
