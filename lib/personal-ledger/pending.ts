import { PersonalLedgerPendingActionType } from "@prisma/client";

import { db } from "@/lib/db";

const PERSONAL_PENDING_TTL_MINUTES = 10;

function getExpiresAt() {
  return new Date(Date.now() + PERSONAL_PENDING_TTL_MINUTES * 60 * 1000);
}

export async function setPersonalLedgerPendingAction(input: {
  chatId: string;
  lineUserId: string;
  actionType: PersonalLedgerPendingActionType;
  targetLedgerId?: string | null;
}) {
  return db.personalLedgerPendingAction.upsert({
    where: {
      chatId_lineUserId: {
        chatId: input.chatId,
        lineUserId: input.lineUserId
      }
    },
    update: {
      actionType: input.actionType,
      targetLedgerId: input.targetLedgerId ?? null,
      expiresAt: getExpiresAt()
    },
    create: {
      chatId: input.chatId,
      lineUserId: input.lineUserId,
      actionType: input.actionType,
      targetLedgerId: input.targetLedgerId ?? null,
      expiresAt: getExpiresAt()
    }
  });
}

export async function getPersonalLedgerPendingAction(
  chatId: string,
  lineUserId: string
) {
  const pending = await db.personalLedgerPendingAction.findUnique({
    where: {
      chatId_lineUserId: {
        chatId,
        lineUserId
      }
    }
  });

  if (!pending) {
    return null;
  }

  if (pending.expiresAt < new Date()) {
    await db.personalLedgerPendingAction.delete({
      where: {
        id: pending.id
      }
    });
    return null;
  }

  return pending;
}

export async function clearPersonalLedgerPendingAction(
  chatId: string,
  lineUserId: string
) {
  await db.personalLedgerPendingAction.deleteMany({
    where: {
      chatId,
      lineUserId
    }
  });
}
