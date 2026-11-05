-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('RECOMMENDATION', 'BLOCKER', 'RISK');

-- CreateEnum
CREATE TYPE "DismissalState" AS ENUM ('DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('TASK_BLOCKED', 'RISK_IDENTIFIED', 'DECISION_AFFECTS_TASK', 'DEADLINE_APPROACHING', 'INSIGHT');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('PROJECT', 'TASK', 'DECISION', 'CONVERSATION');

-- CreateTable
CREATE TABLE "IntelligenceDismissal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "InsightKind" NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "state" "DismissalState" NOT NULL DEFAULT 'DISMISSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntelligenceDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" "NotificationEntityType",
    "entityId" TEXT,
    "actorId" TEXT,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntelligenceDismissal_workspaceId_userId_idx" ON "IntelligenceDismissal"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "IntelligenceDismissal_workspaceId_userId_kind_dedupKey_key" ON "IntelligenceDismissal"("workspaceId", "userId", "kind", "dedupKey");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_userId_createdAt_idx" ON "Notification"("workspaceId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_kind_idx" ON "Notification"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_workspaceId_userId_dedupKey_key" ON "Notification"("workspaceId", "userId", "dedupKey");

-- AddForeignKey
ALTER TABLE "IntelligenceDismissal" ADD CONSTRAINT "IntelligenceDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
