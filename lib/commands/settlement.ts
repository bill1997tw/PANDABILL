import { formatCents } from "@/lib/currency";

type SettlementPaymentProfile = {
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  acceptCash: boolean;
  paymentNote: string | null;
  hasAnyMethod: boolean;
} | null | undefined;

export function formatSettlementPayment(profile: SettlementPaymentProfile) {
  if (!profile || !profile.hasAnyMethod) {
    return "收款方式：尚未設定";
  }

  const lines: string[] = [];

  if (profile.acceptBankTransfer && profile.bankAccount) {
    lines.push(
      `銀行匯款：${[profile.bankName, profile.bankAccount].filter(Boolean).join(" / ")}`
    );
  } else {
    lines.push("銀行匯款：不收");
  }

  lines.push(`LINE Pay：${profile.acceptLinePay ? "可以" : "不可以"}`);
  lines.push(`現金：${profile.acceptCash ? "可以" : "不可以"}`);

  if (profile.paymentNote) {
    lines.push(`備註：${profile.paymentNote}`);
  }

  return lines.join("\n");
}

export function getSettlementSummaryText(input: {
  activityName: string;
  totalExpenseDisplay: string;
  transfers: Array<{
    fromName: string;
    toName: string;
    amountDisplay: string;
    toMemberPaymentProfile?: SettlementPaymentProfile;
  }>;
}) {
  if (input.transfers.length === 0) {
    return `目前活動：${input.activityName}\n總金額：NT$ ${input.totalExpenseDisplay}\n目前已經結清，不用再轉帳了。`;
  }

  return [
    `目前活動：${input.activityName}`,
    `總金額：NT$ ${input.totalExpenseDisplay}`,
    ...input.transfers.map((item) =>
      [
        `${item.fromName} → ${item.toName}`,
        `金額：NT$ ${item.amountDisplay}`,
        formatSettlementPayment(item.toMemberPaymentProfile)
      ].join("\n")
    )
  ].join("\n\n");
}

export function getMvpText(input: {
  activityName: string;
  memberName: string;
  advanceCount: number;
  totalPaidCents: number;
}) {
  return [
    `目前活動：${input.activityName}`,
    `👑 本次代墊MVP：${input.memberName}`,
    `共代墊 ${input.advanceCount} 次，總金額 ${formatCents(input.totalPaidCents)} 元`,
    "太罩了大人，小二佩服的五~體~投~地~"
  ].join("\n");
}
