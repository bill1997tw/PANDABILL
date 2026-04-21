import { LedgerStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { assertNonEmptyString } from "@/lib/validators";

export type LedgerWithCounts = {
  id: string;
  groupId: string;
  name: string;
  status: LedgerStatus;
  startedAt: Date;
  endedAt: Date | null;
  archivedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  expenseCount: number;
};

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
    startedAt: true,
    endedAt: true,
    archivedAt: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    _count: {
      select: {
        expenses: true
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
    startedAt: ledger.startedAt,
    endedAt: ledger.endedAt,
    archivedAt: ledger.archivedAt,
    isActive: ledger.isActive,
    createdAt: ledger.createdAt,
    updatedAt: ledger.updatedAt,
    expenseCount: ledger._count.expenses
  };
}

export async function getActiveLedger(groupId: string) {
  const ledger = await db.ledger.findFirst({
    where: {
      groupId,
      isActive: true
    },
    select: ledgerSelect()
  });

  return ledger ? mapLedger(ledger) : null;
}

export async function listLedgers(groupId: string) {
  const ledgers = await db.ledger.findMany({
    where: {
      groupId
    },
    orderBy: [
      {
        isActive: "desc"
      },
      {
        updatedAt: "desc"
      }
    ],
    select: ledgerSelect()
  });

  return ledgers.map(mapLedger);
}

export async function createLedgerForGroup(groupId: string, nameInput: unknown) {
  const name = assertNonEmptyString(nameInput, "帳本名稱");

  try {
    return await db.$transaction(async (tx): Promise<LedgerMutationResult> => {
      const group = await tx.group.findUnique({
        where: {
          id: groupId
        }
      });

      if (!group) {
        throw new Error("找不到這個群組。");
      }

      const existingActive = await tx.ledger.findFirst({
        where: {
          groupId,
          isActive: true
        }
      });

      if (existingActive) {
        await tx.ledger.update({
          where: {
            id: existingActive.id
          },
          data: {
            isActive: false,
            status: LedgerStatus.closed,
            endedAt: existingActive.endedAt ?? new Date()
          }
        });
      }

      const ledger = await tx.ledger.create({
        data: {
          groupId,
          name,
          status: LedgerStatus.active,
          isActive: true,
          startedAt: new Date()
        },
        select: ledgerSelect()
      });

      return {
        ledger: mapLedger(ledger),
        previousActiveName: existingActive?.name ?? null
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("這個群組裡已經有同名帳本了。");
    }

    throw error;
  }
}

export async function switchActiveLedger(groupId: string, nameInput: unknown) {
  const name = assertNonEmptyString(nameInput, "帳本名稱");

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
      throw new Error("找不到這個帳本。");
    }

    if (target.status === LedgerStatus.archived) {
      throw new Error("這個帳本已封存，不能直接切換成目前帳本。");
    }

    const existingActive = await tx.ledger.findFirst({
      where: {
        groupId,
        isActive: true
      }
    });

    if (existingActive && existingActive.id !== target.id) {
      await tx.ledger.update({
        where: {
          id: existingActive.id
        },
        data: {
          isActive: false,
          status: LedgerStatus.closed,
          endedAt: existingActive.endedAt ?? new Date()
        }
      });
    }

    const updatedTarget = await tx.ledger.update({
      where: {
        id: target.id
      },
      data: {
        isActive: true,
        status: LedgerStatus.active,
        endedAt: null,
        archivedAt: null
      },
      select: ledgerSelect()
    });

    return {
      ledger: mapLedger(updatedTarget),
      previousActiveName:
        existingActive && existingActive.id !== target.id ? existingActive.name : null
    };
  });
}

export async function closeActiveLedger(groupId: string) {
  return db.$transaction(async (tx) => {
    const activeLedger = await tx.ledger.findFirst({
      where: {
        groupId,
        isActive: true
      },
      select: ledgerSelect()
    });

    if (!activeLedger) {
      return null;
    }

    const closedLedger = await tx.ledger.update({
      where: {
        id: activeLedger.id
      },
      data: {
        isActive: false,
        status: LedgerStatus.closed,
        endedAt: activeLedger.endedAt ?? new Date()
      },
      select: ledgerSelect()
    });

    return mapLedger(closedLedger);
  });
}

export async function archiveLedger(groupId: string, nameInput: unknown) {
  const name = assertNonEmptyString(nameInput, "帳本名稱");

  const ledger = await db.ledger.findFirst({
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
    throw new Error("找不到這個帳本。");
  }

  const archived = await db.ledger.update({
    where: {
      id: ledger.id
    },
    data: {
      isActive: false,
      status: LedgerStatus.archived,
      endedAt: ledger.endedAt ?? new Date(),
      archivedAt: ledger.archivedAt ?? new Date()
    },
    select: ledgerSelect()
  });

  return mapLedger(archived);
}

export async function getLedgerByName(groupId: string, nameInput: unknown) {
  const name = assertNonEmptyString(nameInput, "帳本名稱");

  const ledger = await db.ledger.findFirst({
    where: {
      groupId,
      name: {
        equals: name,
        mode: "insensitive"
      }
    },
    select: ledgerSelect()
  });

  return ledger ? mapLedger(ledger) : null;
}

export function serializeLedger(ledger: LedgerWithCounts) {
  return {
    id: ledger.id,
    groupId: ledger.groupId,
    name: ledger.name,
    status: ledger.status,
    startedAt: ledger.startedAt.toISOString(),
    endedAt: ledger.endedAt?.toISOString() ?? null,
    archivedAt: ledger.archivedAt?.toISOString() ?? null,
    isActive: ledger.isActive,
    createdAt: ledger.createdAt.toISOString(),
    updatedAt: ledger.updatedAt.toISOString(),
    expenseCount: ledger.expenseCount
  };
}
