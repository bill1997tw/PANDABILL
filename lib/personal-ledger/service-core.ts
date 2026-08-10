import { PersonalLedgerAlreadyActiveError } from "./errors.ts";
import { classifyPersonalExpense } from "./category.ts";
import type { PersonalLedgerRepository } from "./types.ts";

const PERSONAL_EXPENSE_DETAIL_FETCH_LIMIT = 50;

export function createPersonalLedgerService(
  repository: PersonalLedgerRepository
) {
  return {
    async start(lineUserId: string, nameInput: string) {
      const name = nameInput.trim();

      if (!name) {
        throw new Error("請輸入這次的記帳名稱。");
      }

      const active = await repository.findActive(lineUserId);
      if (active) {
        return { status: "already-active" as const, ledger: active };
      }

      try {
        const ledger = await repository.create(lineUserId, name);
        return { status: "created" as const, ledger };
      } catch (error) {
        if (error instanceof PersonalLedgerAlreadyActiveError) {
          const racedActive = await repository.findActive(lineUserId);
          if (racedActive) {
            return { status: "already-active" as const, ledger: racedActive };
          }
        }

        throw error;
      }
    },

    getCurrent(lineUserId: string) {
      return repository.findActive(lineUserId);
    },

    async getCurrentSummary(lineUserId: string) {
      const active = await repository.findActive(lineUserId);
      if (!active) {
        return null;
      }

      return repository.getLedgerCategorySummary(lineUserId, active.id);
    },

    getLedgerSummary(lineUserId: string, ledgerId: string) {
      return repository.getLedgerCategorySummary(lineUserId, ledgerId);
    },

    async end(lineUserId: string, ledgerId: string) {
      return repository.end(lineUserId, ledgerId, new Date());
    },

    listHistory(lineUserId: string) {
      return repository.listByUser(lineUserId);
    },

    async addExpenses(
      lineUserId: string,
      expenses: Array<{ item: string; amountCents: number }>
    ) {
      const active = await repository.findActive(lineUserId);
      if (!active) {
        return null;
      }

      return repository.createExpensesForActiveLedger(
        lineUserId,
        active.id,
        expenses.map((expense) => ({
          ...expense,
          category: classifyPersonalExpense(expense.item)
        }))
      );
    },

    async getDetails(lineUserId: string) {
      const active = await repository.findActive(lineUserId);
      if (!active) {
        return { status: "no-active" as const };
      }

      const details = await repository.listExpensesForActiveLedger(
        lineUserId,
        active.id,
        PERSONAL_EXPENSE_DETAIL_FETCH_LIMIT
      );
      return details
        ? { status: "found" as const, details }
        : { status: "no-active" as const };
    },

    async deleteLatestExpense(lineUserId: string) {
      const active = await repository.findActive(lineUserId);
      if (!active) {
        return { status: "no-active" as const };
      }

      const result = await repository.deleteLatestExpenseFromActiveLedger(
        lineUserId,
        active.id
      );
      return result
        ? { status: "deleted" as const, result }
        : { status: "empty" as const };
    }
  };
}
