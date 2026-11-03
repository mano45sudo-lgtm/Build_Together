# AGENTS.md — BuildTogether

This file exists for coding agents that look for `AGENTS.md`. It is **not a second set of
instructions.** The canonical project guidance lives in **[`CLAUDE.md`](./CLAUDE.md)** —
read that first. Do not maintain parallel copies of rules here; if anything below seems to
conflict with `CLAUDE.md`, **`CLAUDE.md` wins** and this file should be corrected.

## Start here

1. Read [`CLAUDE.md`](./CLAUDE.md) in full (product, stack, architecture, standards, phase
   policy, git + dependency rules, common commands).
2. Load the governing skill **`.claude/skills/phase-execution/SKILL.md`**, then the
   task-specific skills under `.claude/skills/`:
   - `backend-engineering`, `database-engineering`, `nexconn-integration`,
     `frontend-engineering`, `testing-qa`, `security-review`.
3. For any frontend/visual design work, use the **Impeccable** skill
   (`.claude/skills/impeccable/`) and follow `DESIGN.md`.
4. Consult `PRODUCT.md` (product truth), `DESIGN.md` (visual language), and `docs/*`
   (architecture, engineering, product, decisions, development).

## Non-negotiables (mirrors CLAUDE.md — see it for the authoritative wording)

- Execute **only the currently authorized phase**; never auto-start the next phase; end
  with the 10-item completion protocol.
- Inspect existing code before modifying; adapt, never blindly overwrite.
- **Never invent Nexconn SDK methods** — official docs are the source of truth; keep App
  Secrets server-side.
- Workspace isolation is a security boundary; no IDOR, no secrets/`.env` committed, no
  build artifacts committed.
- No premature future-phase features; no fake screens for completeness; never claim an
  unrun test passed.
- Conventional Commits; pnpm workspaces; stable dependencies only.

Everything else — detailed standards, commands, and domain rules — is defined once, in
`CLAUDE.md` and the `.claude/skills/*` files.
