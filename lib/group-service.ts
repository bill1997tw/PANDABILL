import { Prisma } from "@prisma/client";

import { splitAmountEvenly } from "@/lib/calcSplit";
import { formatCents, parseAmountToCents } from "@/lib/currency";
import { db } from "@/lib/db";
import {
  getActiveLedger,
  listLedgers,
  serializeLedger,
  type LedgerWithCounts
} from "@/lib/ledger-service";
import { buildGroupSummary } from "@/lib/groupSummary";
import { generateJoinCode } from "@/lib/join-code";
import { serializeExpense } from "@/lib/serialize";
import { assertNonEmptyString, assertStringArray } from "@/lib/validators";

type SharedPaymentProfile = {
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  linePayId: string | null;
  acceptCash: boolean;
  paymentNote: string | null;
  hasAnyMethod: boolean;
};

function serializeLineUserProfile(profile: {
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  acceptCash: boolean;
  paymentNote: string | null;
} | null): SharedPaymentProfile | null {
  if (!profile) {
    return null;
  }

  return {
    acceptBankTransfer: profile.acceptBankTransfer,
    bankName: profile.bankName,
    bankAccount: profile.bankAccount,
    acceptLinePay: profile.acceptLinePay,
    linePayId: null,
    acceptCash: profile.acceptCash,
    paymentNote: profile.paymentNote,
    hasAnyMethod:
      (profile.acceptBankTransfer && Boolean(profile.bankAccount)) ||
      profile.acceptLinePay ||
      profile.acceptCash
  };
}

function emptySummary() {
  return {
    totalExpenseCents: 0,
    totalExpenseDisplay: formatCents(0),
    memberBalances: [] as ReturnType<typeof buildGroupSummary>["memberBalances"],
    settlement: [] as ReturnType<typeof buildGroupSummary>["settlement"]
  };
}

async function getGroupMemberPaymentMap(memberNames: string[]) {
  const lineUserProfiles = await db.lineUserProfile.findMany({
    where: {
      memberName: {
        in: memberNames
      }
    }
  });

  const paymentProfileMap = new Map<string, SharedPaymentProfile | null>();

  for (const profile of lineUserProfiles) {
    if (!profile.memberName || paymentProfileMap.has(profile.memberName)) {
      continue;
    }

    paymentProfileMap.set(profile.memberName, serializeLineUserProfile(profile));
  }

  return paymentProfileMap;
}

async function getGroupWithMembers(groupId: string) {
  return db.group.findUnique({
    where: {
      id: groupId
    },
    include: {
      members: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });
}

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

  throw new Error("建立群組失敗，請再試一次。");
}

export async function getGroupDetail(groupId: string) {
  const group = await db.group.findUnique({
    where: {
      id: groupId
    },
    include: {
      members: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!group) {
    return null;
  }

  const [activeLedger, ledgers] = await Promise.all([
    getActiveLedger(groupId),
    listLedgers(groupId)
  ]);

  const activeLedgerExpenses = activeLedger
    ? await db.expense.findMany({
        where: {
          ledgerId: activeLedger.id
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
        },
        orderBy: {
          createdAt: "desc"
        }
      })
    : [];

  const summary = activeLedger
    ? buildGroupSummary({
        id: group.id,
        name: group.name,
        createdAt: group.createdAt,
        members: group.members,
        expenses: activeLedgerExpenses
      })
    : emptySummary();

  const paymentProfileMap = await getGroupMemberPaymentMap(
    group.members.map((member) => member.name)
  );

  return {
    group: {
      id: group.id,
      name: group.name,
      lineJoinCode: group.lineJoinCode,
      createdAt: group.createdAt.toISOString()
    },
    activeLedger: activeLedger ? serializeLedger(activeLedger) : null,
    ledgers: ledgers.map(serializeLedger),
    members: group.members.map((member) => ({
      id: member.id,
      name: member.name,
      paymentSettingsToken: null,
      createdAt: member.createdAt.toISOString(),
      paymentProfile: paymentProfileMap.get(member.name) ?? null
    })),
    expenses: activeLedgerExpenses.map(serializeExpense),
    summary: {
      ...summary,
      settlement: summary.settlement.map((item) => ({
        ...item,
        toMemberPaymentProfile: paymentProfileMap.get(item.toName) ?? null
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
  const title = assertNonEmptyString(input.title, "支出用途");
  const payerId = assertNonEmptyString(input.payerId, "付款人");
  const participantIds = assertStringArray(input.participantIds, "分攤成員");
  const notes =
    typeof input.notes === "string" && input.notes.trim().length > 0
      ? input.notes.trim()
      : null;
  const amountCents = parseAmountToCents(String(input.amount));

  const group = await getGroupWithMembers(input.groupId);

  if (!group) {
    throw new Error("找不到這個群組。");
  }

  if (group.members.length === 0) {
    throw new Error("請先新增至少一位成員，才能開始記帳。");
  }

  const activeLedger = await getActiveLedger(input.groupId);

  if (!activeLedger) {
    throw new Error("目前沒有進行中的帳本，請先輸入：建立活動 活動名稱");
  }

  const validMemberIds = new Set(group.members.map((member) => member.id));

  if (!validMemberIds.has(payerId)) {
    throw new Error("付款人不在這個群組裡。");
  }

  if (participantIds.length === 0) {
    throw new Error("至少要有 1 位分攤成員。");
  }

  if (participantIds.some((participantId) => !validMemberIds.has(participantId))) {
    throw new Error("分攤成員包含不屬於這個群組的人。");
  }

  const shares = splitAmountEvenly(amountCents, participantIds);

  const expense = await db.expense.create({
    data: {
      title,
      notes,
      amountCents,
      groupId: input.groupId,
      ledgerId: activeLedger.id,
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

  return {
    ledger: serializeLedger(activeLedger),
    expense: serializeExpense(expense)
  };
}

export async function getRecentExpenses(groupId: string, take = 5) {
  const activeLedger = await getActiveLedger(groupId);

  if (!activeLedger) {
    return {
      activeLedger: null,
      expenses: []
    };
  }

  const expenses = await db.expense.findMany({
    where: {
      ledgerId: activeLedger.id
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

  return {
    activeLedger,
    expenses
  };
}

export async function getSettlementSnapshot(groupId: string) {
  const detail = await getGroupDetail(groupId);

  if (!detail) {
    return null;
  }

  return {
    activeLedger: detail.activeLedger,
    summary: detail.summary
  };
}

export function formatExpenseLine(
  expense: Awaited<ReturnType<typeof getRecentExpenses>>["expenses"][number]
) {
  return [
    `${expense.title} NT$ ${formatCents(expense.amountCents)}`,
    `${expense.payer.name} 付款`,
    `${expense.participants.length} 人分攤`,
    new Date(expense.createdAt).toLocaleDateString("zh-TW")
  ].join(" / ");
}

export async function getGroupListData() {
  const groups = await db.group.findMany({
    orderBy: {
      createdAt: "desc"
    },
    include: {
      _count: {
        select: {
          members: true,
          expenses: true,
          ledgers: true
        }
      },
      ledgers: {
        where: {
          isActive: true
        },
        take: 1,
        orderBy: {
          updatedAt: "desc"
        }
      }
    }
  });

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    lineJoinCode: group.lineJoinCode,
    createdAt: group.createdAt.toISOString(),
    memberCount: group._count.members,
    expenseCount: group._count.expenses,
    ledgerCount: group._count.ledgers,
    activeLedgerName: group.ledgers[0]?.name ?? null
  }));
}
