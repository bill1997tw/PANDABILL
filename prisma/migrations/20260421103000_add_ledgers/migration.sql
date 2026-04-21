-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('active', 'closed', 'archived');

-- CreateTable
CREATE TABLE "Ledger" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "LedgerStatus" NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ledger_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "ledgerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Ledger_groupId_name_key" ON "Ledger"("groupId", "name");
CREATE INDEX "Ledger_groupId_isActive_idx" ON "Ledger"("groupId", "isActive");
CREATE INDEX "Ledger_groupId_status_updatedAt_idx" ON "Ledger"("groupId", "status", "updatedAt");
CREATE INDEX "Ledger_groupId_createdAt_idx" ON "Ledger"("groupId", "createdAt");
CREATE INDEX "Expense_ledgerId_createdAt_idx" ON "Expense"("ledgerId", "createdAt");

-- One active ledger per group
CREATE UNIQUE INDEX "Ledger_groupId_active_unique"
ON "Ledger"("groupId")
WHERE "isActive" = true;

-- Legacy ledgers for existing expense data
INSERT INTO "Ledger" (
    "id",
    "groupId",
    "name",
    "status",
    "startedAt",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy_' || g."id",
    g."id",
    '既有帳本',
    'active'::"LedgerStatus",
    COALESCE(MIN(e."createdAt"), g."createdAt"),
    true,
    COALESCE(MIN(e."createdAt"), g."createdAt"),
    CURRENT_TIMESTAMP
FROM "Group" g
JOIN "Expense" e ON e."groupId" = g."id"
GROUP BY g."id", g."createdAt";

-- Backfill ledgerId to preserve all old data
UPDATE "Expense" e
SET "ledgerId" = 'legacy_' || e."groupId"
WHERE e."ledgerId" IS NULL;

-- Make ledgerId required
ALTER TABLE "Expense" ALTER COLUMN "ledgerId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Ledger" ADD CONSTRAINT "Ledger_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
