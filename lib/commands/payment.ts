type PaymentSummaryInput = {
  memberName: string | null;
  acceptBankTransfer: boolean;
  bankName: string | null;
  bankAccount: string | null;
  acceptLinePay: boolean;
  acceptCash: boolean;
  paymentNote: string | null;
};

function getPaymentMethodLines(input: PaymentSummaryInput) {
  const lines: string[] = [];

  if (input.acceptBankTransfer && input.bankAccount) {
    if (input.bankName === "其他" || input.bankName === "Other") {
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

  return lines.length > 0 ? lines : ["尚未設定收款方式"];
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
    "請輸入數字，可複選：",
    "例如：13 或 1235"
  ].join("\n");
}

export function getBankAccountPrompt() {
  return [
    "請直接輸入銀行資訊：",
    "",
    "例如：",
    "台新812 / 123456789"
  ].join("\n");
}

export function getBankAccountInvalidPrompt() {
  return [
    "請依照以下格式輸入：",
    "",
    "銀行名稱＋代碼 / 帳號",
    "",
    "例如：",
    "台新812 / 123456789"
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

  if (!normalized || !/^[1-5]+$/u.test(normalized)) {
    return {
      ok: false as const
    };
  }

  return {
    ok: true as const,
    selections: [...new Set(normalized.split("").map((value) => Number(value)))]
  };
}

export function getOtherPaymentPrompt() {
  return "請輸入你的收款方式：";
}

export function getPaymentNotePrompt() {
  return [
    "請輸入備註內容：",
    "例如：",
    "不收現金 / 匯款後請告知後五碼"
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
