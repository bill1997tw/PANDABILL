ALTER TYPE "PendingActionType" ADD VALUE IF NOT EXISTS 'awaiting_expense_details';

ALTER TABLE "PendingAction"
ADD COLUMN "payload" JSONB;
