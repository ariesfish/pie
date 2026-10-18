# .sdlc/ ledger (opt-in)

Opened by gate.sh (pi-dev-mode P5). Removing/renaming this dir closes the
ledger — all skills then behave exactly as P1-P4 (no .sdlc, no ledger).

- items/<id>/state.json — gates + append-only history (replayable)
- observe/ — L4 tail stub (post-deploy baseline loop; intentionally unimplemented)
