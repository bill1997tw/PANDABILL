-- CreateTable
CREATE TABLE "Repayment" (
    "id" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,

    CONSTRAINT "Repayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Repayment_groupId_createdAt_idx" ON "Repayment"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "Repayment_ledgerId_createdAt_idx" ON "Repayment"("ledgerId", "createdAt");

-- CreateIndex
CREATE INDEX "Repayment_payerId_idx" ON "Repayment"("payerId");

-- CreateIndex
CREATE INDEX "Repayment_receiverId_idx" ON "Repayment"("receiverId");

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
