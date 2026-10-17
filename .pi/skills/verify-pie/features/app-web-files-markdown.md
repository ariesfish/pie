# App web — explorer rail, file viewer, markdown preview

The product UI's workspace observation surface: open the explorer rail, walk
the file tree, open a source file into CodeMirror, open a markdown file into
the ported renderer (frontmatter, headings, code fences with copy button).
All served from the expo web export, driven by the same daemon.

## Sub-features

- explorer rail toggle (aria label `Toggle explorer rail`), file tree with
  directories (`src/`) and files (`app.ts`, `README.md`)
- files tab + CodeMirror 6 (`.cm-editor`), themed, read-only view
- markdown preview: `# Verify Fixture` heading, fenced code block with
  `Copy code` button (aria label), frontmatter block
- rail resize handle (aria label `resize explorer rail`) — drag, not covered
  by CDP steps (drag needs mouse-move chains; coordinate fallback territory)

## How to get to it (user POV)

1. Build the web export (`npm run app:build:web`), serve it, open
   `http://127.0.0.1:8899/?url=<ws>&token=<t>&workspace=<path>` — the app
   connects to the daemon automatically (deep-link query form).
2. Click the explorer rail toggle on the left; click `src` → `app.ts` → the
   files pane renders the source with syntax highlighting.
3. Click `README.md` → the markdown preview renders headings, code fences
   with copy buttons.

## Driving it with control-web

```bash
npm run app:build:web                                  # once per checkout change
node helpers/serve-app-web.mjs <runId> &               # :8899, pid in run.json
node <control.mjs> launch --run-id pie-<runId>
node helpers/gen-steps.mjs <runId> <evidenceDir>       # also writes steps-app-web-files.json
node <control.mjs> drive --port <chromePort> --steps <evidenceDir>/steps-app-web-files.json --out <evidenceDir>/app-web-files
```

Steps: expect text `workspace` (connect header) → click aria
`Toggle explorer rail` → shot → click text `src` → click text `app.ts` →
expect selector `.cm-editor` → shot → click text `README.md` → expect text
`Verify Fixture` → expect aria `Copy code` → shot.

Selectors are the repo's own acceptance handles (`scripts/ui-walkthrough.mjs`
drives the same surface with playwright and these labels).

## Gotchas

- The export must be current with the source; `--reuse-export` thinking does
  not apply here — rebuild when the app package changed (`npm run app:build:web`).
- RN-web text nodes: labels like `app.ts` are leaf divs, so control-web's text
  finder matches them; but text may differ in case or be split — prefer the
  aria labels where they exist (`Toggle explorer rail`, `Copy code`).
- First paint of the export can exceed the default settle; steps use
  `settleMs: 4000` after navigate and shot-steps as settles.
- The rail must be toggled open before the tree labels exist — don't skip
  step 2.
- Markdown preview requires the fixture README (frontmatter + `# Verify
  Fixture` + ```ts fence) — launch-daemon.sh writes it.
