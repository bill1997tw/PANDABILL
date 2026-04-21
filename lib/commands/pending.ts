import { PendingActionType } from "@prisma/client";

import { db } from "@/lib/db";

const PENDING_TTL_MINUTES = 5;

function getExpiresAt() {
  return new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000);
}

export async function clearExpiredPendingActions(chatId: string) {
  await db.pendingAction.deleteMany({
    where: {
      chatId,
      expiresAt: {
        lt: new Date()
      }
    }
  });
}

export async function createPendingAction(input: {
  groupId: string;
  chatId: string;
  requesterLineUserId: string;
  actionType: PendingActionType;
  targetExpenseId?: string | null;
  targetLedgerId?: string | null;
}) {
  await db.pendingAction.deleteMany({
    where: {
      chatId: input.chatId
    }
  });

  return db.pendingAction.create({
    data: {
      groupId: input.groupId,
      chatId: input.chatId,
      requesterLineUserId: input.requesterLineUserId,
      actionType: input.actionType,
      targetExpenseId: input.targetExpenseId ?? null,
      targetLedgerId: input.targetLedgerId ?? null,
      expiresAt: getExpiresAt()
    }
  });
}

export async function getPendingAction(chatId: string) {
  await clearExpiredPendingActions(chatId);

  return db.pendingAction.findFirst({
    where: {
      chatId
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function clearPendingAction(chatId: string) {
  await db.pendingAction.deleteMany({
    where: {
      chatId
    }
  });
}
