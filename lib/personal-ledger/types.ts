import type { PersonalExpenseCategory } from "./category.ts";
import type { PersonalCategoryTotals } from "./summary.ts";

export type PersonalLedgerStatusValue = "active" | "ended";

export type PersonalLedgerSummary = {
  id: string;
  lineUserId: string;
  name: string;
  status: PersonalLedgerStatusValue;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
  expenseCount: number;
  totalExpenseCents: number;
};

export type PersonalLedgerCategorySummary = PersonalLedgerSummary & {
  categoryTotals: PersonalCategoryTotals;
};

export type PersonalExpenseInput = {
  item: string;
  amountCents: number;
  category: PersonalExpenseCategory;
};

export type PersonalExpenseRecord = {
  id: string;
  ledgerId: string;
  lineUserId: string;
  item: string;
  amountCents: number;
  category: string | null;
  spentAt: Date;
  createdAt: Date;
};

export type PersonalExpenseBatchResult = {
  expenses: PersonalExpenseInput[];
  ledger: PersonalLedgerSummary;
};

export type PersonalExpenseDetailResult = {
  ledger: PersonalLedgerSummary;
  expenses: PersonalExpenseRecord[];
  totalExpenseCount: number;
};

export type PersonalExpenseDeleteResult = {
  deletedExpense: PersonalExpenseRecord;
  ledger: PersonalLedgerSummary;
};

export type PersonalLedgerRepository = {
  findActive(lineUserId: string): Promise<PersonalLedgerSummary | null>;
  create(lineUserId: string, name: string): Promise<PersonalLedgerSummary>;
  end(
    lineUserId: string,
    ledgerId: string,
    endedAt: Date
  ): Promise<PersonalLedgerCategorySummary | null>;
  listByUser(lineUserId: string): Promise<PersonalLedgerSummary[]>;
  createExpensesForActiveLedger(
    lineUserId: string,
    ledgerId: string,
    expenses: PersonalExpenseInput[]
  ): Promise<PersonalExpenseBatchResult | null>;
  listExpensesForActiveLedger(
    lineUserId: string,
    ledgerId: string,
    limit: number
  ): Promise<PersonalExpenseDetailResult | null>;
  deleteLatestExpenseFromActiveLedger(
    lineUserId: string,
    ledgerId: string
  ): Promise<PersonalExpenseDeleteResult | null>;
  getLedgerCategorySummary(
    lineUserId: string,
    ledgerId: string
  ): Promise<PersonalLedgerCategorySummary | null>;
};
