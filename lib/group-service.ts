import { Prisma } from "@prisma/client";

import { splitAmountEvenly } from "@/lib/calcSplit";
import { formatCents, parseAmountToCents } from "@/lib/currency";
import { db } from "@/lib/db";
import { buildGroupSummary } from "@/lib/groupSummary";
import { generateJoinCode } from "@/lib/join-code";
import {
  getActiveLedger,
  getActiveLedgerParticipants,
  listLedgers,
  serializeLedger
} from "@/lib/ledger-service";
import type { LineEventSource } from "@/lib/line/types";
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

function getDefaultGroupName(lineGroupId: string) {
  if (lineGroupId.startsWith("room:")) {
    return `LINE 聊天室 ${lineGroupId.slice(-4)}`;
  }

  return `LINE 群組 ${lineGroupId.slice(-4)}`;
}

function normalizeLineGroupId(chatType: "group" | "room", rawId: string) {
  return chatType === "room" ? `room:${rawId}` : rawId;
}

async function getGroupMemberPaymentMap(memberNames: string[]) {
  const profiles = await db.lineUserProfile.findMany({
    where: {
      memberName: {
        in: memberNames
      }
    }
  });

  const paymentMap = new Map<string, SharedPaymentProfile | null>();

  for (const profile of profiles) {
    if (!profile.memberName || paymentMap.has(profile.memberName)) {
      continue;
    }

    paymentMap.set(profile.memberName, serializeLineUserProfile(profile));
  }

  return paymentMap;
}

function hasCompletedPaymentMethod(
  profile:
    | {
        acceptBankTransfer: boolean;
        bankAccount: string | null;
        acceptLinePay: boolean;
        acceptCash: boolean;
      }
    | null
    | undefined
) {
  if (!profile) {
    return false;
  }

  return (
    (profile.acceptBankTransfer && Boolean(profile.bankAccount)) ||
    profile.acceptLinePay ||
    profile.acceptCash
  );
}

async function getGroupWithMembers(groupId: string) {
  return db.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });
}

async function createGroupRecord(input: {
  name: string;
  lineGroupId?: string | null;
}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await db.group.create({
        data: {
          name: input.name,
          lineGroupId: input.lineGroupId ?? null,
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

  throw new Error("建立群組失敗，請稍後再試。");
}

export function getLineContainerId(source: LineEventSource) {
  if (source.type === "group" && source.groupId) {
    return {
      chatId: source.groupId,
      chatType: "group" as const,
      lineGroupId: normalizeLineGroupId("group", source.groupId)
    };
  }

  if (source.type === "room" && source.roomId) {
    return {
      chatId: source.roomId,
      chatType: "room" as const,
      lineGroupId: normalizeLineGroupId("room", source.roomId)
    };
  }

  return null;
}

export async function getOrCreateGroupContext(source: LineEventSource) {
  const container = getLineContainerId(source);

  if (!container) {
    return null;
  }

  try {
    const existingBinding = await db.lineChatBinding.findUnique({
      where: {
        chatId: container.chatId
      },
      include: {
        group: {
          include: {
            members: {
              orderBy: {
                createdAt: "asc"
              }
            }
          }
        }
      }
    });

    if (existingBinding) {
      const bindingUpdates: Prisma.LineChatBindingUpdateInput = {};

      if (existingBinding.chatType !== container.chatType) {
        bindingUpdates.chatType = container.chatType;
      }

      if (source.userId && existingBinding.lineUserId !== source.userId) {
        bindingUpdates.lineUserId = source.userId;
      }

      if (Object.keys(bindingUpdates).length > 0) {
        await db.lineChatBinding.update({
          where: { id: existingBinding.id },
          data: bindingUpdates
        });
      }

      if (existingBinding.group.lineGroupId !== container.lineGroupId) {
        await db.group.update({
          where: { id: existingBinding.group.id },
          data: {
            lineGroupId: container.lineGroupId,
            status: "active"
          }
        });
      }

      return {
        ...existingBinding,
        group: {
          ...existingBinding.group,
          lineGroupId: container.lineGroupId
        }
      };
    }

    const existingGroup = await db.group.findUnique({
      where: {
        lineGroupId: container.lineGroupId
      },
      include: {
        members: {
          orderBy: {
            createdAt: "asc"
          }
        }
      }
    });

    const group =
      existingGroup ??
      (await createGroupRecord({
        name: getDefaultGroupName(container.lineGroupId),
        lineGroupId: container.lineGroupId
      }));

    return db.lineChatBinding.upsert({
      where: {
        chatId: container.chatId
      },
      update: {
        groupId: group.id,
        chatType: container.chatType,
        lineUserId: source.userId ?? null
      },
      create: {
        chatId: container.chatId,
        chatType: container.chatType,
        lineUserId: source.userId ?? null,
        groupId: group.id
      },
      include: {
        group: {
          include: {
            members: {
              orderBy: {
                createdAt: "asc"
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error("Failed to get or create group context", { source, error });
    return null;
  }
}

export async function createGroup(
  nameInput: unknown,
  options?: {
    lineGroupId?: string | null;
  }
) {
  const name = assertNonEmptyString(nameInput, "群組名稱");
  return createGroupRecord({
    name,
    lineGroupId: options?.lineGroupId ?? null
  });
}

export async function getGroupDetail(groupId: string) {
  const group = await getGroupWithMembers(groupId);

  if (!group) {
    return null;
  }

  const [activeLedger, ledgers, activeParticipants] = await Promise.all([
    getActiveLedger(groupId),
    listLedgers(groupId),
    getActiveLedgerParticipants(groupId)
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

  const activeMembers = activeParticipants.participants.map((participant) => participant.member);
  const summary =
    activeLedger && activeMembers.length > 0
      ? buildGroupSummary({
          id: group.id,
          name: group.name ?? getDefaultGroupName(group.lineGroupId ?? group.id),
          createdAt: group.createdAt,
          members: activeMembers,
          expenses: activeLedgerExpenses
        })
      : emptySummary();

  const paymentProfileMap = await getGroupMemberPaymentMap(
    group.members.map((member) => member.name)
  );

  return {
    group: {
      id: group.id,
      lineGroupId: group.lineGroupId,
      name: group.name,
      status: group.status,
      lineJoinCode: group.lineJoinCode,
      currentSessionId: group.currentSessionId,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString()
    },
    activeLedger: activeLedger ? serializeLedger(activeLedger) : null,
    ledgers: ledgers.map(serializeLedger),
    members: group.members.map((member) => ({
      id: member.id,
      name: member.name,
      lineUserId: member.lineUserId,
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

export async function getGroupInfoSummary(groupId: string) {
  const group = await db.group.findUnique({
    where: {
      id: groupId
    }
  });

  if (!group) {
    return null;
  }

  const activeLedger = await getActiveLedger(groupId);

  return {
    id: group.id,
    lineGroupId: group.lineGroupId,
    name: group.name ?? getDefaultGroupName(group.lineGroupId ?? group.id),
    status: group.status,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    activeLedgerName: activeLedger?.name ?? null
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
  const title = assertNonEmptyString(input.title, "支出項目");
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

  const activeLedger = await getActiveLedger(input.groupId);

  if (!activeLedger) {
    throw new Error("目前沒有進行中的活動，請先建立活動。");
  }

  if (activeLedger.isCollectingMembers) {
    throw new Error("成員還沒確認完成，請先確認成員再記帳。");
  }

  const activeParticipants = await db.ledgerParticipant.findMany({
    where: {
      ledgerId: activeLedger.id,
      isActive: true
    }
  });

  const validMemberIds = new Set(activeParticipants.map((participant) => participant.memberId));

  if (!validMemberIds.has(payerId)) {
    throw new Error("付款人不在本次活動名單中。");
  }

  if (participantIds.some((participantId) => !validMemberIds.has(participantId))) {
    throw new Error("分攤成員中有人不在本次活動名單中。");
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
      expenses: [],
      totalExpenseCents: 0
    };
  }

  const [expenses, aggregate] = await Promise.all([
    db.expense.findMany({
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
    }),
    db.expense.aggregate({
      where: {
        ledgerId: activeLedger.id
      },
      _sum: {
        amountCents: true
      }
    })
  ]);

  return {
    activeLedger,
    expenses,
    totalExpenseCents: aggregate._sum.amountCents ?? 0
  };
}

export async function calculateSettlement(sessionId: string) {
  const ledger = await db.ledger.findUnique({
    where: {
      id: sessionId
    }
  });

  if (!ledger) {
    return null;
  }

  const group = await getGroupWithMembers(ledger.groupId);

  if (!group) {
    return null;
  }

  const activeMembers = await db.ledgerParticipant.findMany({
    where: {
      ledgerId: sessionId,
      isActive: true
    },
    include: {
      member: true
    },
    orderBy: {
      joinedAt: "asc"
    }
  });

  const expenses = await db.expense.findMany({
    where: {
      ledgerId: sessionId
    },
    include: {
      payer: true,
      participants: {
        include: {
          member: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const summary = buildGroupSummary({
    id: group.id,
    name: group.name ?? getDefaultGroupName(group.lineGroupId ?? group.id),
    createdAt: group.createdAt,
    members: activeMembers.map((participant) => participant.member),
    expenses
  });

  return {
    ledger,
    summary,
    lines:
      summary.settlement.length > 0
        ? summary.settlement.map(
            (item) => `${item.fromName} → ${item.toName} ${formatCents(item.amountCents)}`
          )
        : ["目前已經結清，不用再轉帳。"]
  };
}

export async function getSettlementSnapshot(groupId: string) {
  const group = await getGroupWithMembers(groupId);

  if (!group) {
    return null;
  }

  const { ledger: activeLedger, participants } = await getActiveLedgerParticipants(groupId);

  if (!activeLedger) {
    return {
      activeLedger: null,
      summary: emptySummary()
    };
  }

  const expenses = await db.expense.findMany({
    where: {
      ledgerId: activeLedger.id
    },
    include: {
      payer: true,
      participants: {
        include: {
          member: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const activeMembers = participants.map((participant) => participant.member);
  const summary =
    activeMembers.length > 0
      ? buildGroupSummary({
          id: group.id,
          name: group.name ?? getDefaultGroupName(group.lineGroupId ?? group.id),
          createdAt: group.createdAt,
          members: activeMembers,
          expenses
        })
      : emptySummary();

  const paymentProfileMap = await getGroupMemberPaymentMap(
    activeMembers.map((member) => member.name)
  );

  return {
    activeLedger,
    summary: {
      ...summary,
      settlement: summary.settlement.map((item) => ({
        ...item,
        toMemberPaymentProfile: paymentProfileMap.get(item.toName) ?? null
      }))
    }
  };
}

export async function getActiveLedgerExpenseMvp(groupId: string) {
  const activeLedger = await getActiveLedger(groupId);

  if (!activeLedger) {
    return null;
  }

  const grouped = await db.expense.groupBy({
    by: ["payerId"],
    where: {
      ledgerId: activeLedger.id
    },
    _count: {
      _all: true
    },
    _sum: {
      amountCents: true
    }
  });

  if (grouped.length === 0) {
    return {
      activeLedger,
      winner: null
    };
  }

  const winner = [...grouped].sort((left, right) => {
    if ((right._count._all ?? 0) !== (left._count._all ?? 0)) {
      return (right._count._all ?? 0) - (left._count._all ?? 0);
    }

    return (right._sum.amountCents ?? 0) - (left._sum.amountCents ?? 0);
  })[0];

  const payer = await db.member.findUnique({
    where: {
      id: winner.payerId
    }
  });

  return {
    activeLedger,
    winner: payer
      ? {
          memberName: payer.name,
          advanceCount: winner._count._all ?? 0,
          totalPaidCents: winner._sum.amountCents ?? 0
        }
      : null
  };
}

export async function getArchivedLedgerSnapshots(groupId: string, take = 5) {
  const ledgers = await db.ledger.findMany({
    where: {
      groupId,
      status: {
        in: ["closed", "archived"]
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take,
    include: {
      expenses: {
        include: {
          payer: true,
          participants: {
            include: {
              member: true
            }
          }
        }
      },
      participants: {
        where: {
          isActive: true
        },
        orderBy: {
          joinedAt: "asc"
        }
      }
    }
  });

  return ledgers.map((ledger) => {
    const totalExpenseCents = ledger.expenses.reduce(
      (sum, expense) => sum + expense.amountCents,
      0
    );

    const payerStats = new Map<
      string,
      { memberName: string; advanceCount: number; totalPaidCents: number }
    >();

    for (const expense of ledger.expenses) {
      const current = payerStats.get(expense.payerId) ?? {
        memberName: expense.payer.name,
        advanceCount: 0,
        totalPaidCents: 0
      };

      current.advanceCount += 1;
      current.totalPaidCents += expense.amountCents;
      payerStats.set(expense.payerId, current);
    }

    const mvp =
      [...payerStats.values()].sort((left, right) => {
        if (right.advanceCount !== left.advanceCount) {
          return right.advanceCount - left.advanceCount;
        }

        return right.totalPaidCents - left.totalPaidCents;
      })[0] ?? null;

    return {
      id: ledger.id,
      name: ledger.name,
      status: ledger.status,
      totalExpenseCents,
      totalExpenseDisplay: formatCents(totalExpenseCents),
      members: ledger.participants.map((participant) => participant.displayName),
      mvp
    };
  });
}

export function formatExpenseLine(
  expense: Awaited<ReturnType<typeof getRecentExpenses>>["expenses"][number]
) {
  return `${expense.title} / NT$ ${formatCents(expense.amountCents)} / ${expense.payer.name}`;
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
      currentSession: {
        select: {
          name: true
        }
      }
    }
  });

  return groups.map((group) => ({
    id: group.id,
    lineGroupId: group.lineGroupId,
    name: group.name,
    status: group.status,
    lineJoinCode: group.lineJoinCode,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    memberCount: group._count.members,
    expenseCount: group._count.expenses,
    ledgerCount: group._count.ledgers,
    activeLedgerName: group.currentSession?.name ?? null
  }));
}

export async function getConfirmedMemberIdsForActiveLedger(groupId: string) {
  const { ledger, participants } = await getActiveLedgerParticipants(groupId);

  if (!ledger) {
    return {
      ledger: null,
      memberIds: [],
      memberNames: []
    };
  }

  return {
    ledger,
    memberIds: participants.map((participant) => participant.memberId),
    memberNames: participants.map((participant) => participant.displayName)
  };
}

export async function getMembersMissingPaymentMethod(ledgerId: string) {
  const participants = await db.ledgerParticipant.findMany({
    where: {
      ledgerId,
      isActive: true
    },
    include: {
      member: true
    },
    orderBy: {
      joinedAt: "asc"
    }
  });

  if (participants.length === 0) {
    return [];
  }

  const lineUserIds = participants
    .map((participant) => participant.lineUserId ?? participant.member.lineUserId)
    .filter((value): value is string => Boolean(value));

  const memberNames = participants.map((participant) => participant.member.name);

  const [profilesByLineUserId, profilesByMemberName] = await Promise.all([
    lineUserIds.length > 0
      ? db.lineUserProfile.findMany({
          where: {
            lineUserId: {
              in: lineUserIds
            }
          }
        })
      : Promise.resolve([]),
    db.lineUserProfile.findMany({
      where: {
        memberName: {
          in: memberNames
        }
      }
    })
  ]);

  const profileByLineUserId = new Map(
    profilesByLineUserId.map((profile) => [profile.lineUserId, profile])
  );
  const profileByMemberName = new Map(
    profilesByMemberName
      .filter((profile) => profile.memberName)
      .map((profile) => [profile.memberName as string, profile])
  );

  return participants
    .filter((participant) => {
      const profile =
        profileByLineUserId.get(participant.lineUserId ?? participant.member.lineUserId ?? "") ??
        profileByMemberName.get(participant.member.name) ??
        null;

      return !hasCompletedPaymentMethod(profile);
    })
    .map((participant) => participant.displayName);
}
