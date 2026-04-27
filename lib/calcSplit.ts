export type ExpenseShare = {
  memberId: string;
  shareCents: number;
};

export function splitAmountEvenly(
  amountCents: number,
  participantIds: string[]
): ExpenseShare[] {
  if (amountCents <= 0) {
    throw new Error("金額必須大於 0。");
  }

  if (participantIds.length === 0) {
    throw new Error("至少要有 1 位參與成員。");
  }

  const baseShare = Math.floor(amountCents / participantIds.length);
  let remainder = amountCents % participantIds.length;

  return participantIds.map((memberId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;

    return {
      memberId,
      shareCents: baseShare + extra
    };
  });
}
