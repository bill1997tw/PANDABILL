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
      lines.push("其他：");
      lines.push(input.bankAccount);
    } else {
      lines.push("銀行帳戶：");
      lines.push(input.bankAccount);
    }
  }

  if (input.acceptLinePay) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("LINE Pay：可收款");
  }

  if (input.acceptCash) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("現金：可收款");
  }

  if (lines.length === 0) {
    return ["尚未設定"];
  }

  return lines;
}

export function getPaymentSetupMenuText() {
  return [
    "請選擇收款方式（可複選）：",
    "",
    "1. 銀行帳戶",
    "2. LINE Pay",
    "3. 現金",
    "4. 其他",
    "5. 備註",
    "",
    "請輸入數字，可一次選多個：",
    "例如：13 或 1235"
  ].join("\n");
}

export function getBankAccountPrompt() {
  return [
    "請輸入銀行資訊：",
    "",
    "例如：台新812 / 123456789"
  ].join("\n");
}

export function getBankAccountInvalidPrompt() {
  return [
    "請依照以下格式輸入：",
    "",
    "銀行名稱＋代碼 / 帳號",
    "例如：台新812 / 123456789"
  ].join("\n");
}

export function getPaymentSelectionInvalidText() {
  return [
    "請輸入 1～5 的數字。",
    "例如：13 或 1235"
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
  return "請輸入你的收款方式：";
}

export function getPaymentNotePrompt() {
  return [
    "請輸入備註：",
    "例如：",
    "不收現金 / 匯款後請提供後五碼"
  ].join("\n");
}

export function formatPaymentSummary(input: PaymentSummaryInput) {
  const lines = [
    "你目前設定的收款方式：",
    "",
    ...getPaymentMethodLines(input)
  ];

  if (input.paymentNote) {
    lines.push("", "備註：", input.paymentNote);
  }

  return lines.join("\n");
}
