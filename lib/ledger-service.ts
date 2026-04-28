import { LedgerStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { assertNonEmptyString } from "@/lib/validators";

export type LedgerWithCounts = {
  id: string;
  groupId: string;
  name: string;
  status: LedgerStatus;
  creatorLineUserId: string | null;
  isCollectingMembers: boolean;
  startedAt: Date;
  endedAt: Date | null;
  archivedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  expenseCount: number;
  participantCount: number;
};

type ActiveLedgerParticipantWithMember = Prisma.LedgerParticipantGetPayload<{
  include: {
    member: true;
  };
}>;

type LedgerMutationResult = {
  ledger: LedgerWithCounts;
  previousActiveName: string | null;
};

function ledgerSelect() {
  return {
    id: true,
    groupId: true,
    name: true,
    status: true,
    creatorLineUserId: true,
    isCollectingMembers: true,
    startedAt: true,
    endedAt: true,
    archivedAt: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    _count: {
      select: {
        expenses: true,
        participants: {
          where: {
            isActive: true
          }
        }
      }
    }
  } satisfies Prisma.LedgerSelect;
}

function mapLedger(
  ledger: Prisma.LedgerGetPayload<{
    select: ReturnType<typeof ledgerSelect>;
  }>
): LedgerWithCounts {
  return {
    id: ledger.id,
    groupId: ledger.groupId,
    name: ledger.name,
    status: ledger.status,
    creatorLineUserId: ledger.creatorLineUserId,
    isCollectingMembers: ledger.isCollectingMembers,
    startedAt: ledger.startedAt,
    endedAt: ledger.endedAt,
    archivedAt: ledger.archivedAt,
    isActive: ledger.isActive,
    createdAt: ledger.createdAt,
    updatedAt: ledger.updatedAt,
    expenseCount: ledger._count.expenses,
    participantCount: ledger._count.participants
  };
}

function sortActiveParticipants(
  participants: ActiveLedgerParticipantWithMember[],
  creatorLineUserId: string | null
) {
  return [...participants].sort((left, right) => {
    const leftIsCreator =
      Boolean(creatorLineUserId) && left.lineUserId === creatorLineUserId;
    const rightIsCreator =
      Boolean(creatorLineUserId) && right.lineUserId === creatorLineUserId;

    if (leftIsCreator !== rightIsCreator) {
      return leftIsCreator ? -1 : 1;
    }

    return left.joinedAt.getTime() - right.joinedAt.getTime();
  });
}

async function getSortedActiveParticipants(
  tx: Prisma.TransactionClient | typeof db,
  ledgerId: string,
  creatorLineUserId: string | null
) {
  const participants = await tx.ledgerParticipant.findMany({
    where: {
      ledgerId,
      isActive: true
    },
    include: {
      member: true
    }
  });

  return sortActiveParticipants(participants, creatorLineUserId);
}

async function resolveOrCreateMember(input: {
  tx: Prisma.TransactionClient;
  groupId: string;
  lineUserId?: string;
  displayName: string;
}) {
  if (input.lineUserId) {
    const byLineUserId = await input.tx.member.findFirst({
      where: {
        groupId: input.groupId,
        lineUserId: input.lineUserId
      }
    });

    if (byLineUserId) {
      return byLineUserId;
    }
  }

  const byName = await input.tx.member.findFirst({
    where: {
      groupId: input.groupId,
      name: input.displayName
    }
  });

  if (byName) {
    if (!byName.lineUserId && input.lineUserId) {
      return input.tx.member.update({
        where: { id: byName.id },
        data: { lineUserId: input.lineUserId }
      });
    }

    return byName;
  }

  return input.tx.member.create({
    data: {
      groupId: input.groupId,
      name: input.displayName,
      lineUserId: input.lineUserId
    }
  });
}

async function setCurrentSessionId(
  tx: Prisma.TransactionClient,
  groupId: string,
  ledgerId: string | null
) {
  await tx.group.update({
    where: {
      id: groupId
    },
    data: {
      currentSessionId: ledgerId
    }
  });
}

export async function getActiveLedger(groupId: string) {
  const group = await db.group.findUnique({
    where: {
      id: groupId
    },
    select: {
      currentSessionId: true
    }
  });

  if (group?.currentSessionId) {
    const ledger = await db.ledger.findUnique({
      where: {
        id: group.currentSessionId
      },
      select: ledgerSelect()
    });

    if (ledger && ledger.isActive) {
      return mapLedger(ledger);
    }
  }

  const fallbackLedger = await db.ledger.findFirst({
    where: {
      groupId,
      isActive: true
    },
    select: ledgerSelect()
  });

  return fallbackLedger ? mapLedger(fallbackLedger) : null;
}

export async function listLedgers(groupId: string) {
  const ledgers = await db.ledger.findMany({
    where: { groupId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    select: ledgerSelect()
  });

  return ledgers.map(mapLedger);
}

export async function getActiveLedgerParticipants(groupId: string) {
  const ledger = await getActiveLedger(groupId);

  if (!ledger) {
    return {
      ledger: null,
      participants: []
    };
  }

  const participants = await getSortedActiveParticipants(
    db,
    ledger.id,
    ledger.creatorLineUserId
  );

  return {
    ledger,
    participants
  };
}

export async function createLedgerForGroup(
  groupId: string,
  nameInput: unknown,
  creator?: {
    lineUserId?: string;
    displayName: string;
  }
) {
  const name = assertNonEmptyString(nameInput, "活動名稱");

  try {
    return await db.$transaction(async (tx): Promise<LedgerMutationResult> => {
      const group = await tx.group.findUnique({
        where: { id: groupId }
      });

      if (!group) {
        throw new Error("找不到這個群組。");
      }

      const previousActive = await tx.ledger.findFirst({
        where: {
          groupId,
          isActive: true
        }
      });

      if (previousActive) {
        await tx.ledger.update({
          where: { id: previousActive.id },
          data: {
            isActive: false,
            isCollectingMembers: false,
            status: LedgerStatus.closed,
            endedAt: previousActive.endedAt ?? new Date()
          }
        });
      }

      const ledger = await tx.ledger.create({
        data: {
          groupId,
          name,
          status: LedgerStatus.active,
          creatorLineUserId: creator?.lineUserId ?? null,
          isCollectingMembers: true,
          isActive: true,
          startedAt: new Date()
        },
        select: ledgerSelect()
      });

      await setCurrentSessionId(tx, groupId, ledger.id);

      if (creator?.displayName) {
        const member = await resolveOrCreateMember({
          tx,
          groupId,
          lineUserId: creator.lineUserId,
          displayName: creator.displayName
        });

        await tx.ledgerParticipant.create({
          data: {
            ledgerId: ledger.id,
            memberId: member.id,
            lineUserId: creator.lineUserId ?? null,
            displayName: creator.displayName,
            isActive: true
          }
        });
      }

      const refreshed = await tx.ledger.findUniqueOrThrow({
        where: { id: ledger.id },
        select: ledgerSelect()
      });

      return {
        ledger: mapLedger(refreshed),
        previousActiveName: previousActive?.name ?? null
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("這個群組裡已經有同名活動，請換一個名稱。");
    }

    throw error;
  }
}

export async function switchActiveLedger(groupId: string, nameInput: unknown) {
  const name = assertNonEmptyString(nameInput, "活動名稱");

  return db.$transaction(async (tx): Promise<LedgerMutationResult> => {
    const target = await tx.ledger.findFirst({
      where: {
        groupId,
        name: {
          equals: name,
          mode: "insensitive"
        }
      },
      select: ledgerSelect()
    });

    if (!target) {
      throw new Error("找不到這個活動。");
    }

    if (target.status === LedgerStatus.archived) {
      throw new Error("這個活動已經封存，請先恢復或建立新的活動。");
    }

    const previousActive = await tx.ledger.findFirst({
      where: {
        groupId,
        isActive: true
      }
    });

    if (previousActive && previousActive.id !== target.id) {
      await tx.ledger.update({
        where: { id: previousActive.id },
        data: {
          isActive: false,
          isCollectingMembers: false,
          status: LedgerStatus.closed,
          endedAt: previousActive.endedAt ?? new Date()
        }
      });
    }

    const updated = await tx.ledger.update({
      where: { id: target.id },
      data: {
        isActive: true,
        status: LedgerStatus.active,
        endedAt: null,
        archivedAt: null
      },
      select: ledgerSelect()
    });

    await setCurrentSessionId(tx, groupId, updated.id);

    return {
      ledger: mapLedger(updated),
      previousActiveName:
        previousActive && previousActive.id !== target.id ? previousActive.name : null
    };
  });
}

export async function joinCollectingLedger(input: {
  groupId: string;
  lineUserId?: string;
  displayName: string;
}) {
  return db.$transaction(async (tx) => {
    const ledger = await tx.ledger.findFirst({
      where: {
        groupId: input.groupId,
        isActive: true
      }
    });

    if (!ledger) {
      return { status: "no-ledger" as const, ledgerName: null, participants: [] };
    }

    if (!ledger.isCollectingMembers) {
      return {
        status: "not-collecting" as const,
        ledgerName: ledger.name,
        participants: await getSortedActiveParticipants(
          tx,
          ledger.id,
          ledger.creatorLineUserId
        )
      };
    }

    const member = await resolveOrCreateMember({
      tx,
      groupId: input.groupId,
      lineUserId: input.lineUserId,
      displayName: input.displayName
    });

    const existing = await tx.ledgerParticipant.findFirst({
      where: {
        ledgerId: ledger.id,
        memberId: member.id
      }
    });

    if (existing?.isActive) {
      return {
        status: "already-joined" as const,
        ledgerName: ledger.name,
        participants: await getSortedActiveParticipants(
          tx,
          ledger.id,
          ledger.creatorLineUserId
        )
      };
    }

    if (existing) {
      await tx.ledgerParticipant.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          lineUserId: input.lineUserId ?? existing.lineUserId,
          displayName: input.displayName,
          leftAt: null
        }
      });
    } else {
      await tx.ledgerParticipant.create({
        data: {
          ledgerId: ledger.id,
          memberId: member.id,
          lineUserId: input.lineUserId ?? null,
          displayName: input.displayName
        }
      });
    }

    return {
      status: "joined" as const,
      ledgerName: ledger.name,
      participants: await getSortedActiveParticipants(
        tx,
        ledger.id,
        ledger.creatorLineUserId
      )
    };
  });
}

export async function leaveCollectingLedger(input: {
  groupId: string;
  lineUserId?: string;
  displayName: string;
}) {
  return db.$transaction(async (tx) => {
    const ledger = await tx.ledger.findFirst({
      where: {
        groupId: input.groupId,
        isActive: true
      }
    });

    if (!ledger) {
      return { status: "no-ledger" as const, ledgerName: null, participants: [] };
    }

    if (!ledger.isCollectingMembers) {
      return {
        status: "not-collecting" as const,
        ledgerName: ledger.name,
        participants: await getSortedActiveParticipants(
          tx,
          ledger.id,
          ledger.creatorLineUserId
        )
      };
    }

    const participant = await tx.ledgerParticipant.findFirst({
      where: {
        ledgerId: ledger.id,
        isActive: true,
        OR: [
          input.lineUserId
            ? {
                lineUserId: input.lineUserId
              }
            : undefined,
          {
            displayName: input.displayName
          }
        ].filter(Boolean) as Prisma.LedgerParticipantWhereInput[]
      }
    });

    if (!participant) {
      return {
        status: "not-joined" as const,
        ledgerName: ledger.name,
        participants: await getSortedActiveParticipants(
          tx,
          ledger.id,
          ledger.creatorLineUserId
        )
      };
    }

    await tx.ledgerParticipant.update({
      where: { id: participant.id },
      data: {
        isActive: false,
        leftAt: new Date()
      }
    });

    return {
      status: "left" as const,
      ledgerName: ledger.name,
      participants: await getSortedActiveParticipants(
        tx,
        ledger.id,
        ledger.creatorLineUserId
      )
    };
  });
}

export async function confirmCollectingLedger(groupId: string) {
  return db.$transaction(async (tx) => {
    const ledger = await tx.ledger.findFirst({
      where: {
        groupId,
        isActive: true
      }
    });

    if (!ledger) {
      return { status: "no-ledger" as const, ledger: null, participants: [] };
    }

    const participants = await getSortedActiveParticipants(
      tx,
      ledger.id,
      ledger.creatorLineUserId
    );

    if (!ledger.isCollectingMembers) {
      return {
        status: "already-confirmed" as const,
        ledger,
        participants
      };
    }

    if (participants.length === 0) {
      return { status: "no-participants" as const, ledger, participants: [] };
    }

    const updated = await tx.ledger.update({
      where: { id: ledger.id },
      data: {
        isCollectingMembers: false
      }
    });

    await setCurrentSessionId(tx, groupId, updated.id);

    return { status: "confirmed" as const, ledger: updated, participants };
  });
}

export async function closeActiveLedger(groupId: string) {
  return db.$transaction(async (tx) => {
    const ledger = await tx.ledger.findFirst({
      where: {
        groupId,
        isActive: true
      },
      select: ledgerSelect()
    });

    if (!ledger) {
      return null;
    }

    const updated = await tx.ledger.update({
      where: { id: ledger.id },
      data: {
        isActive: false,
        isCollectingMembers: false,
        status: LedgerStatus.closed,
        endedAt: ledger.endedAt ?? new Date()
      },
      select: ledgerSelect()
    });

    await setCurrentSessionId(tx, groupId, null);

    return mapLedger(updated);
  });
}

export async function archiveLedger(groupId: string, nameInput: unknown) {
  const name = assertNonEmptyString(nameInput, "活動名稱");

  return db.$transaction(async (tx) => {
    const ledger = await tx.ledger.findFirst({
      where: {
        groupId,
        name: {
          equals: name,
          mode: "insensitive"
        }
      },
      select: ledgerSelect()
    });

    if (!ledger) {
      throw new Error("找不到這個活動。");
    }

    const updated = await tx.ledger.update({
      where: { id: ledger.id },
      data: {
        isActive: false,
        isCollectingMembers: false,
        status: LedgerStatus.archived,
        endedAt: ledger.endedAt ?? new Date(),
        archivedAt: ledger.archivedAt ?? new Date()
      },
      select: ledgerSelect()
    });

    if (ledger.isActive) {
      await setCurrentSessionId(tx, groupId, null);
    }

    return mapLedger(updated);
  });
}

export async function archiveActiveLedger(groupId: string) {
  const activeLedger = await getActiveLedger(groupId);

  if (!activeLedger) {
    return null;
  }

  return archiveLedger(groupId, activeLedger.name);
}

export function serializeLedger(ledger: LedgerWithCounts) {
  return {
    id: ledger.id,
    groupId: ledger.groupId,
    name: ledger.name,
    status: ledger.status,
    creatorLineUserId: ledger.creatorLineUserId,
    isCollectingMembers: ledger.isCollectingMembers,
    startedAt: ledger.startedAt.toISOString(),
    endedAt: ledger.endedAt?.toISOString() ?? null,
    archivedAt: ledger.archivedAt?.toISOString() ?? null,
    isActive: ledger.isActive,
    createdAt: ledger.createdAt.toISOString(),
    updatedAt: ledger.updatedAt.toISOString(),
    expenseCount: ledger.expenseCount,
    participantCount: ledger.participantCount
  };
}
