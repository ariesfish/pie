# Demo page — permission approval cards

With the daemon in `--permission ask` mode, a chat whose tool call needs
approval pauses the run and renders an approval card in `#widgets`; the user
picks 拒绝 (deny) / 本次允许 (allow once) / 本会话始终允许 (allow session),
and the run continues or errors accordingly.

## Sub-features

- card = `.widget` in `#widgets` with `button.danger` 拒绝, `button.ghost`
  本次允许, `button.primary` 本会话始终允许
- `permission.respond {requestId, decision: deny|allow|allowSession}`
- timeout = deny (default 600000 ms, `--permission-timeout-ms`)
- annotation metadata on the card: read-only hint, destructive hint

## How to get to it (user POV)

1. Start the daemon with permission asking: `VERIFY_PIE_PERMISSION=ask
   helpers/launch-daemon.sh <runId>` — run.json records `permissionMode:"ask"`
   and the daemon log prints `Permission ask`; optionally
   `VERIFY_PIE_PERMISSION_TIMEOUT_MS=30000` for a fast-fail timeout.
2. Create a session and send a prompt that triggers a tool, e.g.
   “run `ls` in the workspace and tell me what you see”.
3. The card appears mid-stream; click 本次允许 → the run continues and the
   toolcard completes; or 拒绝 → the tool errors.

## Driving it with control-web

Same pattern as chat (shots as settles), plus card steps with stable text
anchors: expect text `本次允许` → click it → expect `.toolcard.done` → shot.
Assert server-side with ws-probe `session.entries`: the tool result entry
exists after allow, or an error entry after deny. Card buttons have no ids —
match by the unique Chinese label text (`本次允许` is unique on the page).

## Gotchas

- Requires a real model that actually calls a tool — choose a prompt that
  makes tool use near-certain (`ls`), but the model may still answer without
  tools → no card ever appears; report that run as `no-card-triggered`, not
  as a pass or fail.
- `launch-daemon.sh` honors `VERIFY_PIE_PERMISSION` (off|annotations|ask,
  default off) and `VERIFY_PIE_PERMISSION_TIMEOUT_MS`, passing them through
  as `--permission` / `--permission-timeout-ms` (invalid values exit 2);
  the daemon log's `Permission <mode>` line is the launch proof.
- The default 10-minute timeout means a stalled card won't fail fast — pass
  `--permission-timeout-ms 30000` for verification.
- The card lives in `#widgets` and disappears on respond; a shot before
  clicking is the only visual evidence of the card itself.
