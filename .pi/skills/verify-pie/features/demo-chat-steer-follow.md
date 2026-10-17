# Demo page — chat with steer / follow-up

Real streaming chat through the daemon's embedded pi SDK: send a prompt, watch
assistant deltas stream into `.msg.assistant .bubble` (thinking into
`.deltas`), tool calls render as `.toolcard` (running → done/error), and while
streaming the composer forces the explicit ⚡Steer / ⏱Follow decision.

## Sub-features

- `session.prompt` with delivery `auto | steer | followUp`; while streaming a
  plain send is rejected with `steer_or_follow` (the page then confirm()s
  Steer vs Follow — a `confirm()` dialog, not a DOM element)
- streamed deltas: `session.partial.delta` appends to the current bubble
- thinking deltas land in the bubble's `.deltas` sub-element
- tool cards: `session.tool.started/updated/ended` → `.toolcard.running|done|error`
- queue bar (`#queueBar`): `.q.steer` / `.q.follow` chips; clicking a follow
  chip clears it (`session.queue.clear`)
- context usage badge (`#usageRow`) updates from `session.contextUsage.changed`

## How to get to it (user POV)

1. Launch + doctor, then create a session (see `demo-session-journey.md`).
2. Pick a model in 模型 dropdown (populated from the copied creds).
3. Type a message in the bottom composer, Enter or 发送 ⏎.
4. While it streams, the button reads ⚡ Steer ⏎; type another message and
   Enter → the page asks Steer (interrupt, take over) or Follow (queue it).

## Driving it with control-web

The frozen harness has no wait-until step, so use shots as settles and assert
server-side (never guess from DOM timing alone):

```bash
node helpers/gen-steps.mjs <runId> <evidenceDir>
# steps-chat.json (hand-written per run, same shape):
#   navigate demoUrl → read #connState → type #composer "reply with exactly: VERIFY-OK"
#   → click #sendBtn → shot (settle) ×4-6 → read #stream → final shot
node <control.mjs> drive --port <chromePort> --steps <evidenceDir>/steps-chat.json --out <evidenceDir>/demo-chat
node helpers/ws-probe.mjs <runId> session.entries '{"sessionId":"<id>","limit":10}' > <evidenceDir>/ws-side-effects.json
```

Hard assertion = the ws-probe `session.entries` result contains an assistant
message including `VERIFY-OK` and `session.list` shows `messageCount ≥ 1`.
The shots prove the streamed bubble visually (vision review).

## Gotchas

- Costs a real inference on the user's configured model — don't run in a
  loop; pick the cheapest model in the dropdown first (models.list order).
- A confirm() dialog (Steer vs Follow) is native JS, not DOM — the CDP
  harness cannot click it; for steer/follow drive `session.prompt` directly
  via ws-probe with `{"delivery":"steer"}` or `"followUp"` and assert the
  queue chips/state, or accept the dialog limitation and cover steer/follow
  at the protocol level.
- Sessions flush to `<agentDir>/sessions/<id>.jsonl` only after real entries;
  check that file exists + has assistant content as the disk side effect.
- Chat can take minutes; control-web `drive` has no overall timeout but the
  ws-probe does (15s) — probe after the run settles, not during.
- Permission mode `off` (default) means tool calls run without cards — see
  `demo-permission-card.md` for `ask`.
