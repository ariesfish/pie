---
name: verify-pie
description: >-
  Drive pie's real surfaces the way a user does and prove behavior:
  the daemon's built-in demo page (http://127.0.0.1:<port>, primary surface)
  and the @pie/app expo web export (served statically). Launch → doctor →
  drive with the frozen control-web CDP harness → evidence lands in
  .audit/evidence/verify-pie-<runId>/ → cleanup kills only what the run
  started and never touches the evidence. Use before merges, after
  daemon/protocol/demo-page/app changes, or whenever "does the app actually
  work" needs proof. Chinese triggers: 验证 pie, 驱动演示页, 跑一遍 UI,
  自证, verify pie.
---

# verify-pie

Verification driver for **pie** (daemon + demo page + app web). It launches a
fully isolated instance (own port, scratch agent dir, own chrome profile),
drives one mapped feature journey end to end, and leaves proof artifacts that
survive teardown.

Two surfaces, both web, both driven with the frozen CDP harness:

| Surface | What it is | Launch cost | LLM needed? |
|---|---|---|---|
| **Demo page (primary)** | daemon serves `packages/daemon/public/index.html` on its own port; README quickstart | seconds | no (chat/permission journeys: yes) |
| **App web export (secondary)** | `@pie/app` expo export served statically, connects to the daemon over WS | `app:build:web` ~1 min (reusable) | no (files/diff journeys) |

Isolation rules (hard):
- The daemon always runs with a **scratch agent dir** (`/tmp/pie-verify-<runId>/agent`),
  never `~/.pi/agent` — sessions created during a drive must never land in the
  user's real session store.
- Chrome is always a fresh control-web instance (`--user-data-dir=/tmp/verify-pie-<runId>`),
  never an attached browser.
- Two verify runs can run side by side: distinct `--listen` ports + distinct
  agent dirs. Doctor proves the port actually serves *our* daemon
  (helloAck agentDir check), so driving someone else's instance is impossible
  by construction.
- Never kill by process name (`pkill`/`killall`). Kill only the recorded pid
  (daemon) and the control-web port (chrome). `pkill -f` has killed our own
  shell during this skill's development — do not use it.

Harness (frozen interface, do not edit):
`/home/ariesfish/Projects/harness/pi-dev-mode/adapters/control-web/harness/control.mjs`
— subcommands `launch | doctor | drive | cleanup`; locator order
aria/accessible-name → CSS selector → text; real Input events via CDP.

## Launch

```bash
# 1. isolated daemon (scratch agent dir + copied creds + fixture workspace)
.pi/skills/verify-pie/helpers/launch-daemon.sh <runId> [port]   # port defaults to 8790
# prints JSON: {"runId","port","token","agentDir","workspace","pid","daemonLog","staticPort"}
```

`<runId>` convention: `YYYYMMDD-HHMMSS` or anything unique; it names the run
dir `/tmp/pie-verify-<runId>` and the evidence dir (below).

What the helper does (all observable): creates `/tmp/pie-verify-<runId>/{agent,workspace}`,
copies `~/.pi/agent/{auth.json,models.json}` into the scratch agent dir chmod 600
(needed for `models.list` and chat; removed at cleanup — if you must not copy
credentials, pass `VERIFY_PIE_NO_CREDS=1` and accept an error toast on the page's
model refresh), builds a git fixture workspace (README.md + src/app.ts, clean
commit, then dirtied — mirrors `scripts/ui-walkthrough.mjs`), and starts the
daemon in-process:

```
node --import tsx packages/daemon/src/index.ts --listen 127.0.0.1:<port> --token <token> --pi <agentDir>
```

(`node --import tsx` = the repo's own `npm run daemon` runtime with one clean
pid and exact kill semantics; the recorded `pid` is the kernel's listener pid
for our port via `ss -tlnp` — it can only be our daemon, since a foreign
listener would make ours exit with EADDRINUSE and the helper fails loudly.)

**Ready means**: helper returns (HTTP 200 on `/`, `<title>Pie</title>`); the
log (`/tmp/pie-verify-<runId>/daemon.log`) shows `pie-daemon v0.1.0 (pi 1.1.0)`
and `Open http://127.0.0.1:<port>/?token=<token>`. Usable (not just answering)
means the WS hello→helloAck handshake succeeds — Doctor proves that.

```bash
# 2. chrome (the driver surface), only for Drive — per run, isolated profile
node /home/ariesfish/Projects/harness/pi-dev-mode/adapters/control-web/harness/control.mjs launch --run-id pie-<runId>
# prints {"ok":true,"pid","devtoolsPort","userDataDir","runId"}
```

App-web surface (secondary), only when driving an `app-web-*` feature:

```bash
npm run app:build:web        # expo export → packages/app/dist (reusable across runs)
.pi/skills/verify-pie/helpers/serve-app-web.mjs <runId>   # static server on :8899, records pid in run.json
```

**Teardown** (same command always, after every failed attempt too):
`kill -TERM $(jq -r .pid /tmp/pie-verify-<runId>/run.json)` — the daemon's
SIGTERM handler stops the server cleanly. The chrome and scratch teardown is
the Cleanup section below.

## Doctor

Read-only, answers "is this instance worth driving?" Run before any drive and
whenever anything looks off:

```bash
node .pi/skills/verify-pie/helpers/doctor.mjs <runId> [evidenceDir]
# → {"ok":bool,"checks":[{name,ok,...}]}; with evidenceDir also writes doctor.json there
node /home/ariesfish/Projects/harness/pi-dev-mode/adapters/control-web/harness/control.mjs doctor --port <chromePort>
```

Checks (each with evidence):
1. `pid-alive` — recorded daemon pid responds to `kill -0`.
2. `http-page` — `GET /` is 200 and contains `<title>Pie</title>`.
3. `ws-hello-auth` — WS hello with our token → helloAck; records
   `daemon.version`, `pi.version`.
4. `port-owned-by-us` — `helloAck.pi.agentDir` equals our scratch agent dir.
   A foreign daemon on our port cannot pass (its agentDir differs).
5. `version-match` — helloAck `daemon.version` equals
   `packages/daemon/src/version.ts` (`DAEMON_VERSION = "0.1.0"`).
6. `scratch-isolated` — agent dir is under `/tmp/pie-verify-<runId>` and is
   not `~/.pi/agent`.

Any failed check ⇒ cleanup and relaunch, don't drive.

## Drive

The harness recipe — real selectors from this repo, not examples:

```bash
node /home/ariesfish/Projects/harness/pi-dev-mode/adapters/control-web/harness/control.mjs launch --run-id pie-<runId>
node .pi/skills/verify-pie/helpers/gen-steps.mjs <runId> <evidenceDir>
#   writes steps-demo-session.json (daemon port journey) and
#   steps-app-web-files.json (static :8899 journey) from run.json
node /home/ariesfish/Projects/harness/pi-dev-mode/adapters/control-web/harness/control.mjs drive \
  --port <chromePort> --steps <evidenceDir>/steps-demo-session.json --out <evidenceDir>/demo-session
# → report.json + NN-*.png shots into --out; report.steps[].read holds grabbed text.
# Each journey gets its own --out subdir (e.g. demo-session/, app-web-files/) so
# drives never overwrite each other's report.json.
```

**Primary journey (`steps-demo-session.json`)**: navigate
`http://127.0.0.1:<port>/?token=<token>` →
read `#connState` (expect `connected ✓`) → type workspace path into `#wsPath` →
click `#openWs` (添加) → shot → expect `.chip` in `#wsChips` → click
`#newSession` (+ 新会话) → shot → read `#sessionBadge` (session id, non-empty)
→ expect + read `.session-item` in `#sessionList` → final shot.

Selector provenance (all from `packages/daemon/public/index.html`, stable ids):
`#wsPath`, `#openWs`, `#wsChips .chip`, `#newSession`, `#sessionBadge`,
`.session-item`, `#connState`, `#composer`, `#sendBtn`. Prefer these ids;
coordinate fallback is never needed here and is a smell if it appears.

Journey semantics, so a failing step is readable: helloAck flips `#connState`
to `connected ✓`; `workspace.open` validates the dir exists (statSync) before
adding a chip; `session.create` + `session.attach` replace `#sessionBadge`
text with the 12-char session id and `refreshSessions()` renders
`.session-item` (new sessions show `（新会话，未落盘）` — no file on disk yet,
Pi flushes lazily). No LLM is involved anywhere in this journey.

**Other journeys** live in `features/` (chat/steer/follow, permission cards,
app-web files/markdown, app-web diff). Each file lists its steps and gotchas.

## Evidence

Everything for a proof lands in **`.audit/evidence/verify-pie-<runId>/`**:

- `report.json` + `NN-*.png` — drive report and screenshots (control-web `--out`);
  one subdir per journey (`demo-session/`, `app-web-files/`, …)
- `doctor.json` — doctor check results
- `daemon.log` — copy of the daemon log from the run dir
- `ws-side-effects.json` — server-side truth after the drive:
  `node .pi/skills/verify-pie/helpers/ws-probe.mjs <runId> session.list '{"workspaceId":"<workspace>"}'`
  must list the session created by the UI — proves the DOM wasn't lying.
  (For chat journeys, `session.entries` shows the assistant message; the
  session JSONL lands under `<agentDir>/sessions/` only after real entries.)
- `cleanup.log` — output of the cleanup steps

Side effects to verify alongside what's visible: session listed server-side
(above), scratch agent dir created, **`~/.pi/agent/sessions` untouched**
(compare mtime before/after if you want belt-and-braces).

## Cleanup

In this order, always after every run — including failed iterations:

```bash
# 1. chrome: Browser.close + sweep of stale /tmp/verify-* profiles
node /home/ariesfish/Projects/harness/pi-dev-mode/adapters/control-web/harness/control.mjs cleanup --port <chromePort>
# 1b. caller-side finish for the chrome profile (adapter README's documented
#     known behavior: a fresh-mtime dir may survive its own sweep; the caller
#     removes /tmp/verify-<runId> after chrome is confirmed down)
rm -rf /tmp/verify-pie-<runId>
# 2. static server (app-web runs only): its own recorded pid
kill $(jq -r .staticPid /tmp/pie-verify-<runId>/run.json) 2>/dev/null || true
# 3. daemon: recorded pid only, never pkill; SIGTERM triggers its graceful stop
kill -TERM $(jq -r .pid /tmp/pie-verify-<runId>/run.json) && sleep 1
# 4. scratch: agent dir (contains the credentials copy!), fixture workspace, logs
rm -rf /tmp/pie-verify-<runId>
# 5. verify: ports free, and the evidence dir is still fully populated
ss -ltn | grep -E ":(<daemonPort>|8899)" ; ls .audit/evidence/verify-pie-<runId>/
```

Notes: the daemon scratch dir uses the `pie-verify-` prefix (NOT `verify-`)
because control-web's cleanup sweeps `/tmp/verify-*` — keep them disjoint.
Evidence is never under `/tmp` and never deleted by any cleanup step; if a
cleanup ever eats the proof, the run failed and the skill is wrong — fix it.

## Helpers

All under `.pi/skills/verify-pie/helpers/`, all executable, all shown in the
sections above:

| Helper | Invocation | Does |
|---|---|---|
| `launch-daemon.sh` | `.pi/skills/verify-pie/helpers/launch-daemon.sh <runId> [port]` | isolated daemon + scratch agent dir + fixture workspace; writes `/tmp/pie-verify-<runId>/run.json` |
| `doctor.mjs` | `node …/doctor.mjs <runId> [evidenceDir]` | the 6 read-only checks above; JSON to stdout and optionally `doctor.json` |
| `gen-steps.mjs` | `node …/gen-steps.mjs <runId> <evidenceDir>` | materializes the two concrete steps files from run.json |
| `serve-app-web.mjs` | `node …/serve-app-web.mjs <runId>` | static server for `packages/app/dist` on :8899 (SPA fallback) |
| `ws-probe.mjs` | `node …/ws-probe.mjs <runId> <cmd> '[jsonArgs]'` | hello→cmd over WS; read-only commands only (`session.list`, `session.entries`, `daemon.status`) |

The CDP harness itself is the frozen adapter
(`…/pi-dev-mode/adapters/control-web/harness/control.mjs`); its README is the
interface contract. Do not edit either side without the user's approval.

## Feature map

`.pi/skills/verify-pie/features/` — README index + one file per feature
(Sub-features / How to get to it (user POV) / Driving it with control-web /
Gotchas). Proof status: `demo-session-journey` and `app-web-files-markdown`
were proven end to end at generation time; chat/steer, permission cards, and
app-web diff are mapped but unproven until a real-target run drives them
(chat and permission journeys additionally need a real model and spend real
tokens — see their files). Keep the map honest as the app changes:
`maintain-verification-skill`.
