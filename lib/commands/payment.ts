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
  const lines: string[] = [];
  const bankName = input.bankName?.trim();

  if (input.acceptBankTransfer && input.bankAccount) {
    if (bankName === "\u5176\u4ed6" || bankName === "Other") {
      lines.push("Other:");
      lines.push(input.bankAccount);
    } else {
      lines.push("Bank Account:");
      lines.push(input.bankAccount);
    }
  }

  if (input.acceptLinePay) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("LINE Pay: Available");
  }

  if (input.acceptCash) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("Cash: Available");
  }

  if (lines.length === 0) {
    return ["Not set yet"];
  }

  return lines;
}

export function getPaymentSetupMenuText() {
  return [
    "Please choose payment methods (multiple selection allowed):",
    "",
    "1. Bank Account",
    "2. LINE Pay",
    "3. Cash",
    "4. Other",
    "5. Note",
    "",
    "Reply with numbers (you can select multiple):",
    "Example: 13 or 1235"
  ].join("\n");
}

export function getBankAccountPrompt() {
  return [
    "Please enter your bank info:",
    "",
    "Example: Taishin812 / 123456789"
  ].join("\n");
}

export function getBankAccountInvalidPrompt() {
  return [
    "Please enter bank info in this format:",
    "",
    "Bank name+code / account",
    "Example: Taishin812 / 123456789"
  ].join("\n");
}

export function getPaymentSelectionInvalidText() {
  return [
    "Please enter numbers between 1-5.",
    "Example: 13 or 1235"
  ].join("\n");
}

export function parsePaymentSelectionInput(text: string) {
  const normalized = text.trim();

  if (!normalized) {
    return {
      ok: false as const
    };
  }

  if (!/^[1-5]+$/.test(normalized)) {
    return {
      ok: false as const
    };
  }

  const selections = [...new Set(normalized.split("").map((value) => Number(value)))];

  if (selections.length === 0) {
    return {
      ok: false as const
    };
  }

  return {
    ok: true as const,
    selections
  };
}

export function getOtherPaymentPrompt() {
  return "Please enter your payment method:";
}

export function getPaymentNotePrompt() {
  return [
    "Please enter your note:",
    "Example:",
    "No cash / Please provide last 5 digits after transfer"
  ].join("\n");
}

export function formatPaymentSummary(input: PaymentSummaryInput) {
  const lines = [
    "Your current payment settings:",
    "",
    ...getPaymentMethodLines(input)
  ];

  if (input.paymentNote) {
    lines.push("", "Note:", input.paymentNote);
  }

  return lines.join("\n");
}
