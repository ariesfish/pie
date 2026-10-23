# Domain Docs

How the developer workflow skills consume this repo's domain documentation before exploring the codebase.

## Before exploring, read these

- **`docs/GLOSSARY.md`** — single-context repo; the only sanctioned vocabulary for domain terms.
- **`docs/adr/`** — read ADRs that touch the area you are about to change.
- **`docs/architecture.md`** — package boundaries, wire protocol, daemon/desktop topology.
- **`DESIGN.md`** (repo root) — read before any UI-bearing change; it is the visual contract.

`DESIGN.md` v1 (2026-10, quiet-saas) is the visual contract; the audit baseline it replaces lives at `docs/design/audit-2026-10.md`.

## File structure

```
/
├── AGENTS.md
├── DESIGN.md
├── docs/
│   ├── GLOSSARY.md
│   ├── adr/
│   ├── architecture.md
│   ├── agents/            # this directory
│   └── design/            # references + scheme previews
└── .dev/                  # process memory
    ├── feature-<slug>/    #   spec.md + plan.md + todo.md + tickets/ (the tracker)
    ├── lifecycle/         #   gate ledger (tracked)
    ├── audit/             #   decision tsv (tracked) + evidence (ignored)
    └── feature-archive/   #   frozen pre-migration records (ignored)
```

## Use the glossary's vocabulary

When your output names a domain concept (issue title, refactor proposal, hypothesis, test name), use the term as defined in `docs/GLOSSARY.md`. Do not drift to the synonyms it explicitly avoids.

If the concept is not in the glossary yet, that is a signal: either you are inventing language the project does not use (reconsider) or there is a real gap (note it for the glossary-owning skill).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0005 (wholesale UI port) — but worth reopening because…_

ADR conflicts are decisions, not drift. A visual change that contradicts `DESIGN.md` or an ADR is a finding, never a silent restyle.

## Historical names

2026-10 migration: the glossary moved from the repo root to `docs/GLOSSARY.md`,
and the tracker moved from root `SPEC.md` + `spec/` + `tasks/` to
`.dev/feature-<slug>/`. Old files live in `.dev/feature-archive/` and are read-only
history. Mentions of the old paths in archived files are historical records, not
live instructions.
