type PaymentSummaryInput = {
  memberName: string;
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  acceptCash: boolean;
  paymentNote: string | null;
};

function getPaymentMethodLines(input: PaymentSummaryInput) {
  if (input.acceptBankTransfer && input.bankAccount) {
    if (input.bankName === "\u5176\u4ed6") {
      return [input.bankAccount];
    }

    return ["\u9280\u884c\u5e33\u6236", input.bankAccount];
  }

  if (input.acceptLinePay) {
    return ["LINE Pay \u53ef\u6536\u6b3e"];
  }

  if (input.acceptCash && input.bankName === "\u73fe\u91d1") {
    return ["\u73fe\u91d1"];
  }

  return ["\u5c1a\u672a\u8a2d\u5b9a"];
}

export function getPaymentSetupMenuText() {
  return [
    "\u8acb\u9078\u64c7\u6536\u6b3e\u65b9\u5f0f\uff1a",
    "",
    "1. \u9280\u884c\u5e33\u6236",
    "2. LINE Pay",
    "3. \u73fe\u91d1",
    "4. \u5176\u4ed6",
    "5. \u5099\u8a3b",
    "",
    "\u8acb\u8f38\u5165\u6578\u5b57 1\uff5e5"
  ].join("\n");
}

export function getBankAccountPrompt() {
  return [
    "\u8acb\u8f38\u5165\u9280\u884c\u6536\u6b3e\u8cc7\u8a0a\uff1a",
    "",
    "\u7bc4\u4f8b\uff1a",
    "\u570b\u6cf0 013",
    "\u5e33\u865f\uff1a123456789012",
    "\u6236\u540d\uff1a\u738b\u5c0f\u660e"
  ].join("\n");
}

export function getLinePayPrompt() {
  return [
    "\u662f\u5426\u53ef\u4f7f\u7528 LINE Pay \u6536\u6b3e\uff1f",
    "",
    "\u8acb\u56de\u8986\uff1a",
    "\u662f",
    "\u6216",
    "\u5426"
  ].join("\n");
}

export function getLinePayInvalidChoiceText() {
  return ["\u8acb\u8f38\u5165\uff1a", "\u662f", "\u6216", "\u5426"].join("\n");
}

export function getOtherPaymentPrompt() {
  return [
    "\u8acb\u8f38\u5165\u4f60\u7684\u6536\u6b3e\u65b9\u5f0f\uff1a",
    "",
    "\u4f8b\u5982\uff1a",
    "\u53f0\u7063 Pay",
    "\u7389\u5c71\u5e33\u6236",
    "\u9762\u4ea4\u73fe\u91d1"
  ].join("\n");
}

export function getPaymentNotePrompt() {
  return "\u8acb\u8f38\u5165\u5099\u8a3b\u5167\u5bb9\uff1a";
}

export function formatPaymentSummary(input: PaymentSummaryInput) {
  const lines = [
    "\u4f60\u76ee\u524d\u8a2d\u5b9a\u7684\u6536\u6b3e\u65b9\u5f0f\uff1a",
    "",
    ...getPaymentMethodLines(input)
  ];

  if (input.paymentNote) {
    lines.push("", "\u5099\u8a3b\uff1a", input.paymentNote);
  }

  return lines.join("\n");
}
