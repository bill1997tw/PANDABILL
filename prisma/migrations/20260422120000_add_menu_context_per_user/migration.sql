-- CreateEnum
CREATE TYPE "MenuContextType" AS ENUM ('xiaoer', 'settlement');

-- CreateTable
CREATE TABLE "MenuContext" (
    "id" TEXT NOT NULL,
    "groupId" TEXT,
    "chatId" TEXT NOT NULL,
    "requesterLineUserId" TEXT NOT NULL,
    "menuType" "MenuContextType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuContext_chatId_requesterLineUserId_key" ON "MenuContext"("chatId", "requesterLineUserId");

-- CreateIndex
CREATE INDEX "MenuContext_chatId_expiresAt_idx" ON "MenuContext"("chatId", "expiresAt");

-- CreateIndex
CREATE INDEX "MenuContext_groupId_expiresAt_idx" ON "MenuContext"("groupId", "expiresAt");

-- AddForeignKey
ALTER TABLE "MenuContext" ADD CONSTRAINT "MenuContext_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
