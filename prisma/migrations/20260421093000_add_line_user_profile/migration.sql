-- CreateTable
CREATE TABLE "LineUserProfile" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "memberName" TEXT,
    "acceptBankTransfer" BOOLEAN NOT NULL DEFAULT false,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "acceptLinePay" BOOLEAN NOT NULL DEFAULT false,
    "acceptCash" BOOLEAN NOT NULL DEFAULT true,
    "paymentNote" TEXT,
    "setupState" TEXT,
    "setupDraft" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineUserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineUserProfile_lineUserId_key" ON "LineUserProfile"("lineUserId");

-- CreateIndex
CREATE INDEX "LineUserProfile_memberName_idx" ON "LineUserProfile"("memberName");
