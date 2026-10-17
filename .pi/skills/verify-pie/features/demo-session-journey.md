# Demo page — connect → workspace → new session

The demo page's entry journey: open the daemon URL, prove the wire handshake
succeeded, add a workspace, create a session, see it in the session list and
badge. Exercises the full protocol stack (hello/auth → workspace.open →
session.create → session.attach → session.snapshot) with zero LLM involvement.

## Sub-features

- token auth via `?token=` query param; `#connState` flips to `connected ✓`
- workspace chips (`#wsChips .chip`), persisted in localStorage, removable (×)
- session list (`#sessionList .session-item`) — merged view of daemon-held
  sessions and Pi JSONL files on disk; fresh sessions show `（新会话，未落盘）`
- session badge (`#sessionBadge`) shows 12-char session id after attach
- model select populates from `models.list` (needs the copied creds)

## How to get to it (user POV)

1. `npm run daemon` (or the verify launch) prints `Open http://…/?token=…`.
2. Browser opens the demo page → header shows `connected ✓`.
3. Paste a repo path into the sidebar input, click 添加 → chip appears.
4. Click `+ 新会话` → badge shows the new session id, list gains a row,
   composer enables.

## Driving it with control-web

```bash
node <control.mjs> launch --run-id pie-<runId>
node helpers/gen-steps.mjs <runId> <evidenceDir>
node <control.mjs> drive --port <chromePort> --steps <evidenceDir>/steps-demo-session.json --out <evidenceDir>/demo-session
```

Steps (all stable ids from `packages/daemon/public/index.html`): read
`#connState` → type `#wsPath` → click `#openWs` → shot → read `#wsChips .chip`
→ click `#newSession` → shot → read `#sessionBadge` (non-empty session id) →
read `.session-item` → final shot.

Assertions: report `steps[].ok` all true; `#connState` read starts with
`connected`; `#sessionBadge` read is a 12-char id (not empty); `.session-item`
exists. Server-side truth (not just DOM):

```bash
node helpers/ws-probe.mjs <runId> session.list '{"workspaceId":"<workspace>"}' > <evidenceDir>/ws-side-effects.json
```

must list the new session (possibly `（新会话，未落盘）`). A session with no
entries yet has **no file on disk** (Pi flushes lazily) — session.list is the
right side-effect check, not the filesystem.

## Gotchas

- Workspace path must exist (`workspace.open` statSyncs it; typo → error
  toast, no chip).
- `models.list` runs after workspace switch; without the copied
  auth/models.json it fails and the page toasts an error (journey still
  completes — sessions refresh before models do).
- Fixed settle delays in the frozen harness are tight: shot steps double as
  settles. If `#sessionBadge` reads empty, rerun with an extra shot step
  between `#newSession` and the badge read — don't weaken the assertion.
- The demo page persists chips in localStorage — that's per chrome profile,
  and the profile is per-run, so no cross-run leakage.
