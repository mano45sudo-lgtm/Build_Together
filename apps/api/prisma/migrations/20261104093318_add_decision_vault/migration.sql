-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('DRAFT', 'IN_DISCUSSION', 'FINALIZED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DecisionSource" AS ENUM ('PROJECT', 'CONVERSATION', 'TASK', 'MEETING', 'MANUAL');

-- CreateEnum
CREATE TYPE "DecisionReferenceType" AS ENUM ('DOCUMENT', 'LINK', 'TASK', 'CONVERSATION', 'FILE');

-- CreateEnum
CREATE TYPE "DecisionHistoryType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'FINALIZED', 'SUPERSEDED', 'ALTERNATIVES_CHANGED', 'REFERENCES_CHANGED', 'PARTICIPANT_CHANGED', 'ARCHIVED', 'RESTORED');

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "conversationId" TEXT,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "background" TEXT,
    "decision" TEXT,
    "rationale" TEXT,
    "consequences" TEXT,
    "status" "DecisionStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "DecisionSource" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "preArchiveStatus" "DecisionStatus",
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionAlternative" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "chosen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionAlternative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionReference" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "type" "DecisionReferenceType" NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionParticipant" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionHistory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "type" "DecisionHistoryType" NOT NULL,
    "message" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Decision_workspaceId_idx" ON "Decision"("workspaceId");

-- CreateIndex
CREATE INDEX "Decision_workspaceId_status_idx" ON "Decision"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Decision_workspaceId_projectId_idx" ON "Decision"("workspaceId", "projectId");

-- CreateIndex
CREATE INDEX "Decision_workspaceId_createdAt_idx" ON "Decision"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Decision_conversationId_idx" ON "Decision"("conversationId");

-- CreateIndex
CREATE INDEX "Decision_taskId_idx" ON "Decision"("taskId");

-- CreateIndex
CREATE INDEX "Decision_supersededById_idx" ON "Decision"("supersededById");

-- CreateIndex
CREATE INDEX "DecisionAlternative_decisionId_idx" ON "DecisionAlternative"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionReference_decisionId_idx" ON "DecisionReference"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionReference_decisionId_type_idx" ON "DecisionReference"("decisionId", "type");

-- CreateIndex
CREATE INDEX "DecisionParticipant_userId_idx" ON "DecisionParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionParticipant_decisionId_userId_key" ON "DecisionParticipant"("decisionId", "userId");

-- CreateIndex
CREATE INDEX "DecisionComment_decisionId_createdAt_idx" ON "DecisionComment"("decisionId", "createdAt");

-- CreateIndex
CREATE INDEX "DecisionComment_workspaceId_idx" ON "DecisionComment"("workspaceId");

-- CreateIndex
CREATE INDEX "DecisionHistory_decisionId_createdAt_idx" ON "DecisionHistory"("decisionId", "createdAt");

-- CreateIndex
CREATE INDEX "DecisionHistory_workspaceId_idx" ON "DecisionHistory"("workspaceId");

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WorkspaceConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionAlternative" ADD CONSTRAINT "DecisionAlternative_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionReference" ADD CONSTRAINT "DecisionReference_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionParticipant" ADD CONSTRAINT "DecisionParticipant_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionParticipant" ADD CONSTRAINT "DecisionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionComment" ADD CONSTRAINT "DecisionComment_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionComment" ADD CONSTRAINT "DecisionComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionHistory" ADD CONSTRAINT "DecisionHistory_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionHistory" ADD CONSTRAINT "DecisionHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
