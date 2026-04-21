-- AlterTable
ALTER TABLE "Ledger"
ADD COLUMN "creatorLineUserId" TEXT,
ADD COLUMN "isCollectingMembers" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "PendingActionType" AS ENUM ('delete_recent_expense', 'archive_active_ledger');

-- AlterTable
ALTER TABLE "LineChatBinding"
ADD COLUMN "lastMenuMode" TEXT,
ADD COLUMN "lastMenuShownAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Member"
ADD COLUMN "lineUserId" TEXT;

-- CreateTable
CREATE TABLE "LedgerParticipant" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "lineUserId" TEXT,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingAction" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "requesterLineUserId" TEXT NOT NULL,
    "actionType" "PendingActionType" NOT NULL,
    "targetExpenseId" TEXT,
    "targetLedgerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_groupId_lineUserId_key" ON "Member"("groupId", "lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerParticipant_ledgerId_memberId_key" ON "LedgerParticipant"("ledgerId", "memberId");

-- CreateIndex
CREATE INDEX "LedgerParticipant_ledgerId_isActive_updatedAt_idx" ON "LedgerParticipant"("ledgerId", "isActive", "updatedAt");

-- CreateIndex
CREATE INDEX "LedgerParticipant_lineUserId_idx" ON "LedgerParticipant"("lineUserId");

-- CreateIndex
CREATE INDEX "PendingAction_chatId_actionType_expiresAt_idx" ON "PendingAction"("chatId", "actionType", "expiresAt");

-- CreateIndex
CREATE INDEX "PendingAction_groupId_expiresAt_idx" ON "PendingAction"("groupId", "expiresAt");

-- AddForeignKey
ALTER TABLE "LedgerParticipant" ADD CONSTRAINT "LedgerParticipant_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerParticipant" ADD CONSTRAINT "LedgerParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
