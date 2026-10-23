# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker (parenthesized markers on `todo.md` heading lines inside `.dev/feature-<slug>/`).

| Label in pi-dev-mode base skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

Marker form: `## T-018 (ready-for-agent)` in the feature's `todo.md`. A full ticket
file under `tickets/T-018.md` carries the same value on a `Status:` line.

Edit the right-hand column to match whatever vocabulary you actually use.
