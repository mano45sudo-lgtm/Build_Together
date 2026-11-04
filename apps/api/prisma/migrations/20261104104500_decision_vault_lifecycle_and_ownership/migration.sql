-- Phase 6 brief alignment (applied on top of 20261104093318_add_decision_vault, which is already in the
-- development database): the vault lifecycle, categorisation and ownership the product brief specifies.
-- Everything here is NON-DESTRUCTIVE — enum values are renamed in place (rows and column defaults follow
-- automatically), columns are added, and `ownerId` is backfilled from the authorship record before it
-- becomes NOT NULL. No decision data is dropped.

-- AlterEnum: lifecycle vocabulary DRAFT → PROPOSED → APPROVED, plus REJECTED.
ALTER TYPE "DecisionStatus" RENAME VALUE 'IN_DISCUSSION' TO 'PROPOSED';
ALTER TYPE "DecisionStatus" RENAME VALUE 'FINALIZED' TO 'APPROVED';
ALTER TYPE "DecisionStatus" ADD VALUE 'REJECTED' AFTER 'APPROVED';

-- The history timeline mirrors the same labels, and records the two new events the brief asks for.
ALTER TYPE "DecisionHistoryType" RENAME VALUE 'FINALIZED' TO 'APPROVED';
ALTER TYPE "DecisionHistoryType" ADD VALUE 'REJECTED' AFTER 'APPROVED';
ALTER TYPE "DecisionHistoryType" ADD VALUE 'OWNER_CHANGED' AFTER 'PARTICIPANT_CHANGED';

-- A decision may now cite another decision as evidence (brief: references to "other decisions").
ALTER TYPE "DecisionReferenceType" ADD VALUE 'DECISION' AFTER 'CONVERSATION';

-- CreateEnum: subject area used by the vault filters. GENERAL is the default so recording a decision
-- never requires categorising it first.
CREATE TYPE "DecisionCategory" AS ENUM ('PRODUCT', 'DESIGN', 'ENGINEERING', 'BUSINESS', 'OPERATIONS', 'GENERAL');

-- AlterTable: one-line summary (list rows), category (filters), reject timestamp, and the accountable
-- owner kept SEPARATE from `createdById` (authorship never moves; ownership can).
ALTER TABLE "Decision" ADD COLUMN "summary" TEXT, ADD COLUMN "category" "DecisionCategory" NOT NULL DEFAULT 'GENERAL', ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Decision" RENAME COLUMN "finalizedAt" TO "approvedAt";
ALTER TABLE "Decision" ADD COLUMN "ownerId" TEXT;
UPDATE "Decision" SET "ownerId" = "createdById" WHERE "ownerId" IS NULL;
ALTER TABLE "Decision" ALTER COLUMN "ownerId" SET NOT NULL;

-- AlterTable: an alternative records WHY it lost, not just that it lost (brief §3 Decision Alternatives).
ALTER TABLE "DecisionAlternative" ADD COLUMN "advantages" TEXT, ADD COLUMN "disadvantages" TEXT, ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "Decision_workspaceId_category_idx" ON "Decision"("workspaceId", "category");

-- CreateIndex
CREATE INDEX "Decision_workspaceId_ownerId_idx" ON "Decision"("workspaceId", "ownerId");

-- AddForeignKey: the owner must be a real user; Restrict keeps a durable decision record from being
-- silently orphaned or destroyed by account removal (the service guarantees they are workspace members).
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
