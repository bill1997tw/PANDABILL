import { Prisma } from "@prisma/client";

import { splitAmountEvenly } from "@/lib/calcSplit";
import { formatCents, parseAmountToCents } from "@/lib/currency";
import { db } from "@/lib/db";
import { buildGroupSummary } from "@/lib/groupSummary";
import { generateJoinCode } from "@/lib/join-code";
import { serializeExpense, serializePaymentProfile } from "@/lib/serialize";
import { assertNonEmptyString, assertStringArray } from "@/lib/validators";

export async function createGroup(nameInput: unknown) {
  const name = assertNonEmptyString(nameInput, "群組名稱");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await db.group.create({
        data: {
          name,
          lineJoinCode: generateJoinCode()
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("建立群組時發生重複綁定碼錯誤，請稍後再試。");
}

export async function getGroupDetail(groupId: string) {
  const group = await db.group.findUnique({
    where: {
      id: groupId
    },
    include: {
      members: {
        include: {
          paymentProfile: true
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      expenses: {
        include: {
          payer: true,
          participants: {
            include: {
              member: true
            },
            orderBy: {
              createdAt: "asc"
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!group) {
    return null;
  }

  const summary = buildGroupSummary(group);
  const paymentProfileMap = new Map(
    group.members.map((member) => [member.id, serializePaymentProfile(member.paymentProfile)])
  );

  return {
    group: {
      id: group.id,
      name: group.name,
      lineJoinCode: group.lineJoinCode,
      createdAt: group.createdAt.toISOString()
    },
    members: group.members.map((member) => ({
      id: member.id,
      name: member.name,
      paymentSettingsToken: member.paymentSettingsToken,
      createdAt: member.createdAt.toISOString(),
      paymentProfile: serializePaymentProfile(member.paymentProfile)
    })),
    expenses: group.expenses.map(serializeExpense),
    summary: {
      ...summary,
      settlement: summary.settlement.map((item) => ({
        ...item,
        toMemberPaymentProfile: paymentProfileMap.get(item.toMemberId) ?? null
      }))
    }
  };
}

export async function createExpenseInGroup(input: {
  groupId: string;
  title: unknown;
  amount: unknown;
  payerId: unknown;
  participantIds: unknown;
  notes?: unknown;
}) {
  const title = assertNonEmptyString(input.title, "支出標題");
  const payerId = assertNonEmptyString(input.payerId, "付款人");
  const participantIds = assertStringArray(input.participantIds, "分攤成員");
  const notes =
    typeof input.notes === "string" && input.notes.trim().length > 0
      ? input.notes.trim()
      : null;
  const amountCents = parseAmountToCents(String(input.amount));

  const group = await db.group.findUnique({
    where: {
      id: input.groupId
    },
    include: {
      members: true
    }
  });

  if (!group) {
    throw new Error("找不到這個群組。");
  }

  if (group.members.length === 0) {
    throw new Error("請先新增成員，才能建立支出。");
  }

  const validMemberIds = new Set(group.members.map((member) => member.id));

  if (!validMemberIds.has(payerId)) {
    throw new Error("付款人不屬於這個群組。");
  }

  if (participantIds.some((participantId) => !validMemberIds.has(participantId))) {
    throw new Error("分攤成員中有不屬於群組的人。");
  }

  const shares = splitAmountEvenly(amountCents, participantIds);

  const expense = await db.expense.create({
    data: {
      title,
      notes,
      amountCents,
      groupId: input.groupId,
      payerId,
      participants: {
        create: shares.map((share) => ({
          memberId: share.memberId,
          shareCents: share.shareCents
        }))
      }
    },
    include: {
      payer: true,
      participants: {
        include: {
          member: true
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  return serializeExpense(expense);
}

export async function getRecentExpenses(groupId: string, take = 5) {
  return db.expense.findMany({
    where: {
      groupId
    },
    take,
    orderBy: {
      createdAt: "desc"
    },
    include: {
      payer: true,
      participants: {
        include: {
          member: true
        }
      }
    }
  });
}

export async function getSettlementSnapshot(groupId: string) {
  const detail = await getGroupDetail(groupId);

  if (!detail) {
    return null;
  }

  return detail.summary;
}

export function formatExpenseLine(
  expense: Awaited<ReturnType<typeof getRecentExpenses>>[number]
) {
  return [
    `${expense.title} NT$ ${formatCents(expense.amountCents)}`,
    `${expense.payer.name} 付款`,
    `${expense.participants.length} 人分攤`,
    new Date(expense.createdAt).toLocaleDateString("zh-TW")
  ].join("｜");
}
