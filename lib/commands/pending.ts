import { PendingActionType, Prisma } from "@prisma/client";

import { db } from "@/lib/db";

const PENDING_TTL_MINUTES = 5;

type PendingLookupInput = {
  chatId: string;
  requesterLineUserId?: string;
  actionType?: PendingActionType;
};

function getExpiresAt(minutes = PENDING_TTL_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function buildPendingWhere(input: PendingLookupInput) {
  return {
    chatId: input.chatId,
    ...(input.requesterLineUserId
      ? {
          requesterLineUserId: input.requesterLineUserId
        }
      : {}),
    ...(input.actionType
      ? {
          actionType: input.actionType
        }
      : {})
  };
}

export async function clearExpiredPendingActions(input: PendingLookupInput) {
  await db.pendingAction.deleteMany({
    where: {
      ...buildPendingWhere(input),
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
  payload?: Prisma.InputJsonValue | null;
  ttlMinutes?: number;
}) {
  await db.pendingAction.deleteMany({
    where: {
      chatId: input.chatId,
      requesterLineUserId: input.requesterLineUserId
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
      payload: input.payload ?? Prisma.JsonNull,
      expiresAt: getExpiresAt(input.ttlMinutes)
    }
  });
}

export async function getPendingAction(input: PendingLookupInput) {
  await clearExpiredPendingActions(input);

  return db.pendingAction.findFirst({
    where: buildPendingWhere(input),
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function getPendingActionState(input: PendingLookupInput) {
  const pending = await db.pendingAction.findFirst({
    where: buildPendingWhere(input),
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!pending) {
    return {
      pending: null,
      expired: false
    };
  }

  if (pending.expiresAt < new Date()) {
    await db.pendingAction.delete({
      where: {
        id: pending.id
      }
    });

    return {
      pending: null,
      expired: true,
      expiredActionType: pending.actionType
    };
  }

  return {
    pending,
    expired: false
  };
}

export async function clearPendingAction(input: PendingLookupInput) {
  await db.pendingAction.deleteMany({
    where: buildPendingWhere(input)
  });
}
