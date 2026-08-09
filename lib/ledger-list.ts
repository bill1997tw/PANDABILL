export type LedgerExpenseAmount = {
  ledgerId: string;
  amountCents: number;
};

export function indexLedgerExpenseTotals(rows: LedgerExpenseAmount[]) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    totals.set(
      row.ledgerId,
      (totals.get(row.ledgerId) ?? 0) + row.amountCents
    );
  }

  return totals;
}

function formatLedgerTotal(cents: number) {
  return (cents / 100).toLocaleString("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

export function formatLedgerListItem(input: {
  name: string;
  status: string;
  expenseCount: number;
  totalExpenseCents: number;
}) {
  return `${input.name}｜${input.status}｜${input.expenseCount} 筆支出 / 總支出金額 $${formatLedgerTotal(input.totalExpenseCents)}`;
}
