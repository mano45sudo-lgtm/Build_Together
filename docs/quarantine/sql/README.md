# Quarantined SQL

`tmp_rebaseline_decision_vault.sql` was moved here from
`apps/api/prisma/tmp_rebaseline_decision_vault.sql` during Phase 3.1. The move preserved the
file byte-for-byte.

- SHA-256: `5574f219461d83b5e00218d841bd0d9f98cea0f162160666b4626b4b3761d5d8`
- Status: quarantined; it is outside Prisma's schema and migrations directories and is not
  referenced by package scripts or deployment commands.
- Safety: **do not execute this file**. It drops Decision Vault tables/enums and edits Prisma
  migration history. Any future disposition or execution requires separate explicit review and
  authorization against a verified disposable database.
