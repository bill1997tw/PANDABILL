ALTER TYPE "MenuContextType" ADD VALUE IF NOT EXISTS 'personal_accounting';

CREATE TYPE "PersonalLedgerStatus" AS ENUM ('active', 'ended');
CREATE TYPE "PersonalLedgerPendingActionType" AS ENUM ('awaiting_name', 'awaiting_end_confirmation');

CREATE TABLE "PersonalLedger" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PersonalLedgerStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PersonalLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonalExpense" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT,
    "note" TEXT,
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalExpense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonalLedgerPendingAction" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "actionType" "PersonalLedgerPendingActionType" NOT NULL,
    "targetLedgerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalLedgerPendingAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalLedger_one_active_per_user_key"
ON "PersonalLedger"("lineUserId")
WHERE "status" = 'active';

CREATE INDEX "PersonalLedger_lineUserId_status_createdAt_idx" ON "PersonalLedger"("lineUserId", "status", "createdAt");
CREATE INDEX "PersonalLedger_lineUserId_createdAt_idx" ON "PersonalLedger"("lineUserId", "createdAt");
CREATE INDEX "PersonalExpense_ledgerId_createdAt_idx" ON "PersonalExpense"("ledgerId", "createdAt");
CREATE INDEX "PersonalExpense_lineUserId_createdAt_idx" ON "PersonalExpense"("lineUserId", "createdAt");
CREATE UNIQUE INDEX "PersonalLedgerPendingAction_chatId_lineUserId_key" ON "PersonalLedgerPendingAction"("chatId", "lineUserId");
CREATE INDEX "PersonalLedgerPendingAction_lineUserId_expiresAt_idx" ON "PersonalLedgerPendingAction"("lineUserId", "expiresAt");

ALTER TABLE "PersonalExpense"
ADD CONSTRAINT "PersonalExpense_ledgerId_fkey"
FOREIGN KEY ("ledgerId") REFERENCES "PersonalLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonalLedgerPendingAction"
ADD CONSTRAINT "PersonalLedgerPendingAction_targetLedgerId_fkey"
FOREIGN KEY ("targetLedgerId") REFERENCES "PersonalLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
