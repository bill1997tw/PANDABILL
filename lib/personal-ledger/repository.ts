import { PersonalLedgerStatus, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { PersonalLedgerAlreadyActiveError } from "@/lib/personal-ledger/errors";
import {
  indexPersonalExpenseSummaries,
  summarizePersonalExpenses
} from "@/lib/personal-ledger/summary";
import type {
  PersonalLedgerRepository,
  PersonalLedgerSummary,
  PersonalExpenseInput
} from "@/lib/personal-ledger/types";

type PersonalLedgerRecord = Prisma.PersonalLedgerGetPayload<object>;

async function runSerializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const canRetry =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 3;
      if (!canRetry) {
        throw error;
      }
    }
  }

  throw new Error("Serializable personal ledger transaction failed.");
}

async function attachExpenseSummaries(
  ledgers: PersonalLedgerRecord[]
): Promise<PersonalLedgerSummary[]> {
  if (ledgers.length === 0) {
    return [];
  }

  const expenses = await db.personalExpense.findMany({
    where: {
      ledgerId: {
        in: ledgers.map((ledger) => ledger.id)
      }
    },
    select: {
      ledgerId: true,
      amountCents: true
    }
  });
  const summaries = indexPersonalExpenseSummaries(expenses);

  return ledgers.map((ledger) => {
    const summary = summaries.get(ledger.id);

    return {
      ...ledger,
      expenseCount: summary?.count ?? 0,
      totalExpenseCents: summary?.totalCents ?? 0
    };
  });
}

async function attachExpenseSummary(ledger: PersonalLedgerRecord | null) {
  if (!ledger) {
    return null;
  }

  const [summary] = await attachExpenseSummaries([ledger]);
  return summary ?? null;
}

export const personalLedgerRepository: PersonalLedgerRepository = {
  async findActive(lineUserId) {
    const ledger = await db.personalLedger.findFirst({
      where: {
        lineUserId,
        status: PersonalLedgerStatus.active
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return attachExpenseSummary(ledger);
  },

  async create(lineUserId, name) {
    try {
      const ledger = await db.personalLedger.create({
        data: {
          lineUserId,
          name,
          status: PersonalLedgerStatus.active
        }
      });

      return {
        ...ledger,
        expenseCount: 0,
        totalExpenseCents: 0
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new PersonalLedgerAlreadyActiveError();
      }

      throw error;
    }
  },

  async end(lineUserId, ledgerId, endedAt) {
    return runSerializableTransaction(async (transaction) => {
      const result = await transaction.personalLedger.updateMany({
        where: {
          id: ledgerId,
          lineUserId,
          status: PersonalLedgerStatus.active
        },
        data: {
          status: PersonalLedgerStatus.ended,
          endedAt
        }
      });

      if (result.count === 0) {
        return null;
      }

      const [ledger, expenses] = await Promise.all([
        transaction.personalLedger.findFirst({
          where: { id: ledgerId, lineUserId }
        }),
        transaction.personalExpense.findMany({
          where: { ledgerId, lineUserId },
          select: { amountCents: true, category: true }
        })
      ]);
      if (!ledger) {
        return null;
      }

      return {
        ...ledger,
        ...summarizePersonalExpenses(expenses)
      };
    });
  },

  async listByUser(lineUserId) {
    const ledgers = await db.personalLedger.findMany({
      where: {
        lineUserId
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return attachExpenseSummaries(ledgers);
  },

  async createExpensesForActiveLedger(lineUserId, ledgerId, expenses) {
    return runSerializableTransaction(async (transaction) => {
      const ledger = await transaction.personalLedger.findFirst({
        where: {
          id: ledgerId,
          lineUserId,
          status: PersonalLedgerStatus.active
        }
      });

      if (!ledger) {
        return null;
      }

      await transaction.personalExpense.createMany({
        data: expenses.map((expense: PersonalExpenseInput) => ({
          ledgerId: ledger.id,
          lineUserId,
          item: expense.item,
          amountCents: expense.amountCents,
          category: expense.category
        }))
      });

      const [expenseCount, aggregate] = await Promise.all([
        transaction.personalExpense.count({
          where: { ledgerId: ledger.id }
        }),
        transaction.personalExpense.aggregate({
          where: { ledgerId: ledger.id },
          _sum: { amountCents: true }
        })
      ]);

      return {
        expenses,
        ledger: {
          ...ledger,
          expenseCount,
          totalExpenseCents: aggregate._sum.amountCents ?? 0
        }
      };
    });
  },

  async listExpensesForActiveLedger(lineUserId, ledgerId, limit) {
    return db.$transaction(async (transaction) => {
      const ledger = await transaction.personalLedger.findFirst({
        where: {
          id: ledgerId,
          lineUserId,
          status: PersonalLedgerStatus.active
        }
      });
      if (!ledger) {
        return null;
      }

      const [expenses, totalExpenseCount, aggregate] = await Promise.all([
        transaction.personalExpense.findMany({
          where: {
            ledgerId: ledger.id,
            lineUserId
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: limit
        }),
        transaction.personalExpense.count({
          where: { ledgerId: ledger.id, lineUserId }
        }),
        transaction.personalExpense.aggregate({
          where: { ledgerId: ledger.id, lineUserId },
          _sum: { amountCents: true }
        })
      ]);

      return {
        expenses,
        totalExpenseCount,
        ledger: {
          ...ledger,
          expenseCount: totalExpenseCount,
          totalExpenseCents: aggregate._sum.amountCents ?? 0
        }
      };
    });
  },

  async deleteLatestExpenseFromActiveLedger(lineUserId, ledgerId) {
    return db.$transaction(async (transaction) => {
      const ledger = await transaction.personalLedger.findFirst({
        where: {
          id: ledgerId,
          lineUserId,
          status: PersonalLedgerStatus.active
        }
      });
      if (!ledger) {
        return null;
      }

      const latest = await transaction.personalExpense.findFirst({
        where: {
          ledgerId: ledger.id,
          lineUserId
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      });
      if (!latest) {
        return null;
      }

      await transaction.personalExpense.delete({
        where: { id: latest.id }
      });

      const [expenseCount, aggregate] = await Promise.all([
        transaction.personalExpense.count({
          where: { ledgerId: ledger.id, lineUserId }
        }),
        transaction.personalExpense.aggregate({
          where: { ledgerId: ledger.id, lineUserId },
          _sum: { amountCents: true }
        })
      ]);

      return {
        deletedExpense: latest,
        ledger: {
          ...ledger,
          expenseCount,
          totalExpenseCents: aggregate._sum.amountCents ?? 0
        }
      };
    });
  },

  async getLedgerCategorySummary(lineUserId, ledgerId) {
    return db.$transaction(async (transaction) => {
      const ledger = await transaction.personalLedger.findFirst({
        where: { id: ledgerId, lineUserId }
      });
      if (!ledger) {
        return null;
      }

      const expenses = await transaction.personalExpense.findMany({
        where: { ledgerId: ledger.id, lineUserId },
        select: { amountCents: true, category: true }
      });

      return {
        ...ledger,
        ...summarizePersonalExpenses(expenses)
      };
    });
  }
};
