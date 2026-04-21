type PaymentSummaryInput = {
  memberName: string;
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  acceptCash: boolean;
  paymentNote: string | null;
};

export function formatPaymentSummary(input: PaymentSummaryInput) {
  return [
    `${input.memberName}的付款方式是：`,
    input.acceptBankTransfer && input.bankAccount
      ? `銀行匯款：${[input.bankName, input.bankAccount].filter(Boolean).join(" / ")}`
      : "銀行匯款：不可以",
    `LINE Pay：${input.acceptLinePay ? "可以" : "不可以"}`,
    `現金：${input.acceptCash ? "可以" : "不可以"}`,
    input.paymentNote ? `備註：${input.paymentNote}` : "備註：無",
    "設定完成"
  ].join("\n");
}
