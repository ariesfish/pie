# Pie verification feature map

One file per user-facing feature: what it is, how to reach it as a user, how
to drive it with the control-web CDP harness, and what observable end state
proves it works. This is the maintained verification source for pie — every
bug fixed or quirk found during verification gets written back here (复利机制).

## Surfaces

| Surface | Launch | Feature files |
|---|---|---|
| **Demo page** (primary) — daemon serves `packages/daemon/public/index.html` on its own port | `helpers/launch-daemon.sh <runId>` | `demo-session-journey.md`, `demo-chat-steer-follow.md`, `demo-permission-card.md` |
| **App web export** (secondary) — expo web build served statically, connects to the same daemon | `npm run app:build:web` + `helpers/serve-app-web.mjs <runId>` | `app-web-files-markdown.md`, `app-web-changes-diff.md` |

Both surfaces talk the same wire protocol (`hello` → commands/events) to the
same daemon; the demo page hardcodes a single-connection page, the app web
build is the full product UI (rail/tabs/panes).

## Proof status

- ✅ proven end to end at generation time (2026-10): `demo-session-journey`,
  `app-web-files-markdown` — evidence in `.audit/evidence/verify-pie-*/`.
- ✅ proven 2026-10-18: `app-web-changes-diff` (11/11 steps) — evidence
  `.audit/evidence/overnight-20261018/T-008/app-web-diff/`.
- ⬜ mapped but not yet proven by a real-target run: `demo-chat-steer-follow`,
  `demo-permission-card` (both additionally need a real model and spend real
  tokens).

A journey whose prerequisites are missing must report failure honestly with
the reason in its Gotchas — never soften it to green.

## Getting a session for any journey

```bash
helpers/launch-daemon.sh <runId>        # demo page: daemon only
# app-web journeys additionally:
npm run app:build:web
helpers/serve-app-web.mjs <runId> &
```

Doctor before driving: `node helpers/doctor.mjs <runId>` (and chrome-side
`control.mjs doctor` once launched). Teardown is the SKILL.md Cleanup section.
