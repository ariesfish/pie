# .dev/lifecycle/ ledger (opt-in)

Opened by `gates/gate.sh open` (pi-dev-mode P5). Removing/renaming this dir
closes the ledger — all skills then behave exactly as P1-P4 (no ledger).

- `items/<id>/state.json` — gates + append-only history (replayable)
- `observe/` — L4 tail stub (post-deploy baseline loop; intentionally unimplemented)

The ledger is tracked in this repo (unlike the pi-dev-mode default) so the
audit trail survives a clone; see `.dev/README.md` for the tracked/ignored
split. Evidence files referenced from history live under `.dev/audit/evidence/`.
