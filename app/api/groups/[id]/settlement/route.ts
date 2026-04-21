import { getSettlementSnapshot } from "@/lib/group-service";
import { fail, ok } from "@/lib/http";

type Props = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Props) {
  const snapshot = await getSettlementSnapshot(params.id);

  if (!snapshot) {
    return fail("找不到這個群組。", 404);
  }

  return ok({
    activeLedger: snapshot.activeLedger,
    memberStats: snapshot.summary.memberBalances,
    memberBalances: snapshot.summary.memberBalances,
    balances: snapshot.summary.memberBalances.map((member) => ({
      memberId: member.memberId,
      name: member.name,
      balanceCents: member.balanceCents,
      balanceDisplay: member.balanceDisplay
    })),
    transfers: snapshot.summary.settlement,
    settlement: snapshot.summary.settlement,
    totalExpenseCents: snapshot.summary.totalExpenseCents,
    totalExpenseDisplay: snapshot.summary.totalExpenseDisplay
  });
}
