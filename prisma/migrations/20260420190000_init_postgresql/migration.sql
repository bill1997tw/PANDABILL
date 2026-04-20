-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lineJoinCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paymentSettingsToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPaymentProfile" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "acceptBankTransfer" BOOLEAN NOT NULL DEFAULT false,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "acceptLinePay" BOOLEAN NOT NULL DEFAULT false,
    "linePayId" TEXT,
    "acceptCash" BOOLEAN NOT NULL DEFAULT true,
    "paymentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberPaymentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseParticipant" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "shareCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineChatBinding" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "chatType" TEXT NOT NULL,
    "lineUserId" TEXT,
    "groupId" TEXT NOT NULL,
    "pendingDeleteExpenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineChatBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_lineJoinCode_key" ON "Group"("lineJoinCode");

-- CreateIndex
CREATE UNIQUE INDEX "Member_paymentSettingsToken_key" ON "Member"("paymentSettingsToken");

-- CreateIndex
CREATE INDEX "Member_groupId_createdAt_idx" ON "Member"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Member_groupId_name_key" ON "Member"("groupId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MemberPaymentProfile_memberId_key" ON "MemberPaymentProfile"("memberId");

-- CreateIndex
CREATE INDEX "Expense_groupId_createdAt_idx" ON "Expense"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_payerId_idx" ON "Expense"("payerId");

-- CreateIndex
CREATE INDEX "ExpenseParticipant_memberId_createdAt_idx" ON "ExpenseParticipant"("memberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseParticipant_expenseId_memberId_key" ON "ExpenseParticipant"("expenseId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "LineChatBinding_chatId_key" ON "LineChatBinding"("chatId");

-- CreateIndex
CREATE INDEX "LineChatBinding_groupId_updatedAt_idx" ON "LineChatBinding"("groupId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPaymentProfile" ADD CONSTRAINT "MemberPaymentProfile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseParticipant" ADD CONSTRAINT "ExpenseParticipant_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseParticipant" ADD CONSTRAINT "ExpenseParticipant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineChatBinding" ADD CONSTRAINT "LineChatBinding_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
