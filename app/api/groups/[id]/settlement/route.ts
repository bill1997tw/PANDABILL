import { getGroupDetail } from "@/lib/group-service";
import { fail, ok } from "@/lib/http";

type Props = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Props) {
  const group = await getGroupDetail(params.id);

  if (!group) {
    return fail("找不到這個群組。", 404);
  }

  return ok({
    activeLedger: group.activeLedger,
    memberStats: group.summary.memberBalances,
    memberBalances: group.summary.memberBalances,
    balances: group.summary.memberBalances.map((member) => ({
      memberId: member.memberId,
      name: member.name,
      balanceCents: member.balanceCents,
      balanceDisplay: member.balanceDisplay
    })),
    transfers: group.summary.settlement,
    settlement: group.summary.settlement,
    totalExpenseCents: group.summary.totalExpenseCents,
    totalExpenseDisplay: group.summary.totalExpenseDisplay
  });
}
