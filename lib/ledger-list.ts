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

export function getConfirmedParticipantCount(input: {
  isCollectingMembers: boolean;
  participantCount: number;
}) {
  if (input.isCollectingMembers || input.participantCount < 1) {
    return null;
  }

  return input.participantCount;
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
  confirmedParticipantCount: number | null;
}) {
  const participantText =
    input.confirmedParticipantCount === null
      ? "本次活動參與人數未知"
      : `本次活動共 ${input.confirmedParticipantCount} 人分攤`;

  return `${input.name}｜${input.status}｜${input.expenseCount} 筆支出 ｜ 總支出金額 $${formatLedgerTotal(input.totalExpenseCents)} ｜ ${participantText}`;
}
