type PaymentProfileInput = {
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  linePayId: string | null;
  acceptCash: boolean;
  paymentNote: string | null;
} | null;

export function serializePaymentProfile(profile: PaymentProfileInput) {
  if (!profile) {
    return null;
  }

  const hasAnyMethod =
    (profile.acceptBankTransfer && Boolean(profile.bankAccount)) ||
    (profile.acceptLinePay && Boolean(profile.linePayId)) ||
    profile.acceptCash;

  return {
    acceptBankTransfer: profile.acceptBankTransfer,
    bankName: profile.bankName,
    bankAccount: profile.bankAccount,
    acceptLinePay: profile.acceptLinePay,
    linePayId: profile.linePayId,
    acceptCash: profile.acceptCash,
    paymentNote: profile.paymentNote,
    hasAnyMethod
  };
}

export function serializeExpense(expense: {
  id: string;
  title: string;
  notes: string | null;
  amountCents: number;
  createdAt: Date;
  payer: { id: string; name: string };
  participants: {
    id: string;
    shareCents: number;
    member: { id: string; name: string };
  }[];
}) {
  return {
    id: expense.id,
    title: expense.title,
    notes: expense.notes,
    amountCents: expense.amountCents,
    amountDisplay: (expense.amountCents / 100).toFixed(2),
    createdAt: expense.createdAt.toISOString(),
    payer: expense.payer,
    participants: expense.participants.map((participant) => ({
      id: participant.id,
      shareCents: participant.shareCents,
      shareDisplay: (participant.shareCents / 100).toFixed(2),
      member: participant.member
    }))
  };
}
