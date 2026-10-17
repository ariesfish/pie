# Domain Docs

How the developer workflow skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root — single-context repo.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`align`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-wire-protocol.md
│   └── …
└── packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `align`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## Legacy naming

`CONTEXT.md`/`CONTEXT-MAP.md` are the pre-rename names of `GLOSSARY.md`/`GLOSSARY-MAP.md`. A repo carrying the old names uses the same convention: record its layout as found, and let the owner decide on renaming.
