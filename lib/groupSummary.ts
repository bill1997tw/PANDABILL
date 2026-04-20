import type { Expense, ExpenseParticipant, Member } from "@prisma/client";

import { formatCents } from "@/lib/currency";
import { simplifyDebts, type BalanceEntry } from "@/lib/calcSettlement";

type ExpenseWithRelations = Expense & {
  payer: Member;
  participants: (ExpenseParticipant & {
    member: Member;
  })[];
};

type GroupWithRelations = {
  id: string;
  name: string;
  createdAt: Date;
  members: Member[];
  expenses: ExpenseWithRelations[];
};

export function buildGroupSummary(group: GroupWithRelations) {
  const memberMap = new Map<
    string,
    {
      memberId: string;
      name: string;
      paidCents: number;
      owedCents: number;
      balanceCents: number;
    }
  >();

  for (const member of group.members) {
    memberMap.set(member.id, {
      memberId: member.id,
      name: member.name,
      paidCents: 0,
      owedCents: 0,
      balanceCents: 0
    });
  }

  for (const expense of group.expenses) {
    const payer = memberMap.get(expense.payerId);

    if (!payer) {
      continue;
    }

    payer.paidCents += expense.amountCents;
    payer.balanceCents += expense.amountCents;

    for (const participant of expense.participants) {
      const member = memberMap.get(participant.memberId);

      if (!member) {
        continue;
      }

      member.owedCents += participant.shareCents;
      member.balanceCents -= participant.shareCents;
    }
  }

  const balances = Array.from(memberMap.values()).map((member) => ({
    ...member,
    paidDisplay: formatCents(member.paidCents),
    owedDisplay: formatCents(member.owedCents),
    balanceDisplay: formatCents(member.balanceCents)
  }));

  const settlement = simplifyDebts(
    balances.map(
      (balance): BalanceEntry => ({
        memberId: balance.memberId,
        name: balance.name,
        balanceCents: balance.balanceCents
      })
    )
  );

  return {
    totalExpenseCents: group.expenses.reduce(
      (sum, expense) => sum + expense.amountCents,
      0
    ),
    totalExpenseDisplay: formatCents(
      group.expenses.reduce((sum, expense) => sum + expense.amountCents, 0)
    ),
    memberBalances: balances,
    settlement
  };
}
