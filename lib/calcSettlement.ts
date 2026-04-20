import { formatCents } from "@/lib/currency";

export type BalanceEntry = {
  memberId: string;
  name: string;
  balanceCents: number;
};

export type SettlementSuggestion = {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountCents: number;
  amountDisplay: string;
};

export function simplifyDebts(
  balances: BalanceEntry[]
): SettlementSuggestion[] {
  const creditors = balances
    .filter((entry) => entry.balanceCents > 0)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => b.balanceCents - a.balanceCents);

  const debtors = balances
    .filter((entry) => entry.balanceCents < 0)
    .map((entry) => ({ ...entry, balanceCents: Math.abs(entry.balanceCents) }))
    .sort((a, b) => b.balanceCents - a.balanceCents);

  const suggestions: SettlementSuggestion[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amountCents = Math.min(creditor.balanceCents, debtor.balanceCents);

    suggestions.push({
      fromMemberId: debtor.memberId,
      fromName: debtor.name,
      toMemberId: creditor.memberId,
      toName: creditor.name,
      amountCents,
      amountDisplay: formatCents(amountCents)
    });

    creditor.balanceCents -= amountCents;
    debtor.balanceCents -= amountCents;

    if (creditor.balanceCents === 0) {
      creditorIndex += 1;
    }

    if (debtor.balanceCents === 0) {
      debtorIndex += 1;
    }
  }

  return suggestions;
}
