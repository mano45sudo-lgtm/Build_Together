-- Surgical re-baseline of the Phase 6 Decision Vault objects ONLY (this migration is uncommitted and
-- the tables are empty; Phase 2-5 data is untouched). Drops are IF EXISTS so the script is idempotent,
-- then the migration record is removed so `prisma migrate deploy` re-applies the corrected DDL.
DROP TABLE IF EXISTS "DecisionHistory" CASCADE;
DROP TABLE IF EXISTS "DecisionComment" CASCADE;
DROP TABLE IF EXISTS "DecisionParticipant" CASCADE;
DROP TABLE IF EXISTS "DecisionReference" CASCADE;
DROP TABLE IF EXISTS "DecisionAlternative" CASCADE;
DROP TABLE IF EXISTS "Decision" CASCADE;

DROP TYPE IF EXISTS "DecisionHistoryType";
DROP TYPE IF EXISTS "DecisionReferenceType";
DROP TYPE IF EXISTS "DecisionSource";
DROP TYPE IF EXISTS "DecisionCategory";
DROP TYPE IF EXISTS "DecisionStatus";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261104093318_add_decision_vault';
