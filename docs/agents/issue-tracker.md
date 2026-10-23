# Issue Tracker: Local Files (`.dev/`, feature-first)

This repo tracks work as plain files under `.dev/` — per-developer process memory.
No tracker service, no CLI: every skill reads and writes these files through
plain file edits.

**Deviation from the pi-dev-mode default** (the remote is on GitHub, so the
default would be GitHub Issues): the ticket history, evidence pointers and code
review live in one tree. Do not migrate without an explicit decision. Unlike the
default seed, this repo **tracks** `.dev/lifecycle/` and `.dev/audit/*.tsv` so the
audit trail survives a clone; see `.dev/README.md` for the split.

## Layout: feature-first

**One big piece of work (initiative/feature) = one slugged directory** — resuming
half-done work means opening exactly one directory:

```text
.dev/
├── feature-<name>/            # everything for one initiative (e.g. feature-ui-redesign/)
│   ├── spec.md                # the contract (single module; multi-module: map.md + SPEC-<id>.md)
│   ├── plan.md                # slice graph: index + blocking edges + Closed lines
│   ├── todo.md                # checklists + triage state markers
│   ├── research.md            # research notes (or research/<topic>.md)
│   └── tickets/T-XXX.md       # full ticket body (only when the plan row is too small)
├── feature-archive/           # frozen pre-migration records (ignored, not a tracker)
├── inbox/                     # unattributed intake; adopted into a feature once routed
├── lifecycle/                 # gates ledger (cross-feature, machine)
└── audit/                     # decision tsv + evidence (cross-feature)
```

- **Naming contract**: top-level feature dirs start with `feature-`; the whole
  name (prefix included) is the slug. Reserved names `inbox/`, `lifecycle/`,
  `audit/`, `feature-archive/` never take a feature slug. A top-level dir without
  the prefix is a violation — `ls .dev/` shows the partition at a glance.
- **T-id is globally unique across features**: next id = highest number anywhere
  under `.dev/` + 1; never renumber, never reorder.
- **Spec promotion**: a working `spec.md` stays in the feature dir. It is not
  copied into a root `spec/` — the feature dir is the durable home.

## Creating an issue (in a feature's dir; unattributed intake → `inbox/`)

Append a section to that feature's `plan.md`:

```markdown
## [T-004] Search filters reset on page change

- **Type**: HITL / AFK
- **Blocked by**: T-002 (if any)
- **What to build**: one-paragraph end-to-end behavior
- **Acceptance criteria**: three-label list ([check: …] / [evidence: …] / [judgment: …])
```

Keep ids stable; append only — an issue's historical position never changes.

Add its checkbox block to the same feature's `todo.md`:

```markdown
## T-004
- [ ] criterion 1
- [ ] criterion 2
```

When a ticket needs a fuller body than its plan row (prototype snippets,
interface contracts), write `tickets/T-004.md` with the
`Parent` / `What to build` / `Acceptance criteria` / `Blocked by` shape; the plan
row stays the index entry. A `Status:` line near the top carries its triage state;
comments append at the bottom under `## Comments`.

## Reading an issue

Read the matching `## [T-…]` section in that feature's `plan.md` in full before
working. For "everything open": glob `.dev/feature-*/plan.md`, take sections not
checked off in the sibling `todo.md`.

## Labeling (triage roles)

Roles map to status markers in `todo.md`, applied as a parenthesized tag on the
heading line:

| Role | Marker |
|---|---|
| needs-triage | `(needs-triage)` |
| needs-info | `(needs-info)` |
| ready-for-agent | `(ready-for-agent)` |
| ready-for-human | `(ready-for-human)` |
| wontfix | `(wontfix)` + checked off |

So a ready issue reads `## T-004 (ready-for-agent)`.

## Closing an issue

Check off its `todo.md` block and add one line under the plan section:
`Closed <date>: <one-line resolution>`. Do not delete the section — the plan file
is the history.

## Blocking

"Blocked by" names other task ids in the same feature. The frontier is: open
tasks whose blocked-by list is all checked off. Running `implement-all` across
features globs `.dev/feature-*/plan.md`; the frontier is the union.

## Process memory (`.dev/`) — tracked vs ignored

| Path | Holds | Git |
|---|---|---|
| `.dev/README.md` | the layout + tracked/ignored rules | tracked |
| `.dev/feature-<slug>/` | spec, plan, todo, tickets | ignored |
| `.dev/inbox/` | unattributed intake | ignored |
| `.dev/lifecycle/items/<T-id>/state.json` | gate ledger | tracked |
| `.dev/audit/T-<id>.tsv` | seven-column decision ledger | tracked |
| `.dev/audit/evidence/` | screenshots, reports, verdicts | ignored |
| `.dev/feature-archive/` | frozen pre-migration records | ignored |

## Conventions

- Never edit another task's section while resolving yours; append your resolution line only.
- Merge conflicts in these files are resolved like any conflict: both sides' task sections stay.
- Evidence pointers use repo-relative paths under `.dev/audit/evidence/`.
- New work never starts in `feature-archive/`; it is read-only history.
