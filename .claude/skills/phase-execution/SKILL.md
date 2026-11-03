---
name: phase-execution
description: "The governing project-development skill for BuildTogether. Use at the start and end of every phase and before any implementation: execute only the currently authorized phase, read project instructions (CLAUDE.md) and relevant skills first, inspect existing code before changing it, follow established architecture, avoid premature future-phase work, keep documentation current, run relevant tests, and produce the mandatory phase completion report. Never automatically start the next phase."
---

# Phase Execution — BuildTogether (governing skill)

This skill orchestrates every other skill and enforces disciplined, phase-gated delivery.
It is the first thing to load in any working session.

## Prime directives

1. **One phase at a time.** Execute only the currently authorized phase. When the brief
   says "STOP after Phase N", you stop — you do not preview, scaffold features, or
   "just start" Phase N+1.
2. **No unauthorized future-phase features.** If a change belongs to a later phase, do
   not build it now. Note it as planned work instead.
3. **Read before write.** At session start read `CLAUDE.md` (and `AGENTS.md`), then the
   skills matching the task, then the relevant `docs/`. Load Impeccable for visual work.
4. **Inspect existing code before modifying.** Preserve working behavior and valid
   existing config. Adapt rather than overwrite. Never blindly rewrite files.
5. **Keep documentation current.** Update architecture/decision/roadmap docs and the
   implementation log as part of finishing a phase, not after the fact.

## Standard workflow (per phase)

**Start**
- Confirm the phase scope explicitly from the user's brief.
- Read `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, relevant `docs/*`, and the skills that
  apply (backend, database, nexconn, frontend, testing-qa, security-review).
- Restate the in-scope objective and the explicit out-of-scope list.

**During**
- Follow the architecture in this repo's skills/docs; raise a flag before deviating, and
  document any justified deviation in the decisions log.
- Implement in small, verifiable increments; run relevant checks as you go.
- Write tests per `testing-qa` alongside the feature, not later.

**Finish — mandatory completion protocol**
Produce all ten items:

1. Objective and scope completed.
2. Files created (paths).
3. Files modified (paths + what changed and why).
4. Dependencies installed (name@version, and why each was needed).
5. Architecture or design decisions made.
6. Tests executed and their **actual** results (pass/fail counts; unrun tests named).
7. Known issues.
8. Remaining work.
9. Acceptance-criteria checklist (mirroring the phase brief), each marked met/not-met
   with evidence.
10. Explicit confirmation: **no unauthorized future-phase features were implemented.**

Append a summary of the phase to `docs/development/implementation-log.md`.

## Honesty rules

- Never claim a check ran, a test passed, or an install succeeded without doing it.
- On failure, investigate and report the actual error; do not silently skip it.
- Report status strictly: only say "READY FOR PHASE N+1" when every mandatory acceptance
  criterion is verified. Otherwise report "INCOMPLETE" with the specific gaps.
- Do not create fake screens/files to simulate completeness.

## Stop condition

After the completion protocol, **stop and wait for the next explicit instruction.** Do
not begin the next phase automatically, even if it seems obvious. The user authorizes
phase transitions.
