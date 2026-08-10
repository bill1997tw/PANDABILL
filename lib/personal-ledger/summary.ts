import {
  normalizePersonalExpenseCategory,
  PERSONAL_EXPENSE_CATEGORIES,
  type PersonalExpenseCategory
} from "./category.ts";

export type PersonalCategoryTotals = Record<
  PersonalExpenseCategory,
  number
>;

export function createEmptyPersonalCategoryTotals(): PersonalCategoryTotals {
  return Object.fromEntries(
    PERSONAL_EXPENSE_CATEGORIES.map((category) => [category, 0])
  ) as PersonalCategoryTotals;
}

export function summarizePersonalExpenses(
  expenses: Array<{ amountCents: number; category: string | null }>
) {
  const categoryTotals = createEmptyPersonalCategoryTotals();
  let totalExpenseCents = 0;

  for (const expense of expenses) {
    const category = normalizePersonalExpenseCategory(expense.category);
    totalExpenseCents += expense.amountCents;
    categoryTotals[category] += expense.amountCents;
  }

  return {
    expenseCount: expenses.length,
    totalExpenseCents,
    categoryTotals
  };
}

export function indexPersonalExpenseSummaries(
  expenses: Array<{ ledgerId: string; amountCents: number }>
) {
  const summaries = new Map<string, { count: number; totalCents: number }>();

  for (const expense of expenses) {
    const current = summaries.get(expense.ledgerId) ?? {
      count: 0,
      totalCents: 0
    };
    summaries.set(expense.ledgerId, {
      count: current.count + 1,
      totalCents: current.totalCents + expense.amountCents
    });
  }

  return summaries;
}
