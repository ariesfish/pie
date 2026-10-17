# Issue Tracker: Tasks Files (tasks/)

This repo tracks issues as plain files beside the code. `tasks/plan.md` holds the ordered slice list; `tasks/todo.md` holds per-task checklists and status. No tracker service, no CLI — every skill reads and writes these files through plain file edits.

## Creating an issue

Append a section to `tasks/plan.md`:

```markdown
## [T-004] Search filters reset on page change

- **Type**: HITL / AFK
- **Blocked by**: T-002 (if any)
- **What to build**: one-paragraph end-to-end behavior
- **Acceptance criteria**: three-label list ([check: …] / [evidence: …] / [judgment: …])
```

Keep ids stable (`T-001`, `T-002`, …); never renumber. The next id is the highest existing + 1. Append only — an issue's historical position never changes.

Add its checkbox block to `tasks/todo.md`:

```markdown
## T-004
- [ ] criterion 1
- [ ] criterion 2
```

## Reading an issue

Read the matching `## [T-…]` section in `tasks/plan.md` in full before working. For "everything open": the `## …` sections in `tasks/plan.md` whose task is not checked off in `tasks/todo.md`.

## Labeling (triage roles)

Roles map to status markers in `tasks/todo.md`, applied as a parenthesized tag on the heading line:

| Role | Marker |
|---|---|
| needs-triage | `(needs-triage)` |
| needs-info | `(needs-info)` |
| ready-for-agent | `(ready-for-agent)` |
| ready-for-human | `(ready-for-human)` |
| wontfix | `(wontfix)` + checked off |

So a ready issue reads `## T-004 (ready-for-agent)`.

## Closing an issue

Check off its `tasks/todo.md` block and add one line under the plan section: `Closed <date>: <one-line resolution>`. Do not delete the section — the plan file is the history.

## Blocking

"Blocked by" names other task ids in the same file. The frontier is: open tasks whose blocked-by list is all checked off.

## Conventions

- Never edit another task's section while resolving yours; append your resolution line only.
- Merge conflicts in these files are resolved like any conflict: both sides' task sections stay.
- If the repo later migrates to GitHub issues, `setup` rewrites this file into the new tracker doc; the tasks files stay as history.
