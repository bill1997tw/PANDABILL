export type ParsedPersonalExpense = {
  item: string;
  amountCents: number;
};

export type PersonalExpenseParseResult =
  | { ok: true; expenses: ParsedPersonalExpense[] }
  | { ok: false; error: string };

const MAX_PERSONAL_EXPENSE_AMOUNT = 21_474_836;

function parseWholeAmount(rawAmount: string) {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/u.test(rawAmount)) {
    return null;
  }

  const normalized = rawAmount.replace(/,/gu, "");
  if (!/^\d+$/u.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > MAX_PERSONAL_EXPENSE_AMOUNT
  ) {
    return null;
  }

  return amount * 100;
}

export function parsePersonalExpenseLine(
  input: string
): PersonalExpenseParseResult {
  const line = input.trim();
  if (!line) {
    return { ok: false, error: "支出內容不可為空白。" };
  }

  if (/[+-]\s*\$?\s*\d[\d,]*$/u.test(line)) {
    return { ok: false, error: `無法辨識支出「${line}」，金額必須大於 0。` };
  }

  const match =
    line.match(/^(.+?)\s*\$\s*(\d[\d,]*)$/u) ??
    line.match(/^(.+?)\s+(\d[\d,]*)$/u) ??
    line.match(/^(.+?\D)(\d[\d,]*)$/u);

  if (!match) {
    return {
      ok: false,
      error: `無法辨識支出「${line}」，請輸入品項與結尾金額，例如「午餐 250」。`
    };
  }

  const item = match[1]!.trim();
  const amountCents = parseWholeAmount(match[2]!);

  if (!item || /^\d+$/u.test(item) || amountCents === null) {
    return {
      ok: false,
      error: `無法辨識支出「${line}」，請確認品項與金額皆正確。`
    };
  }

  return {
    ok: true,
    expenses: [{ item, amountCents }]
  };
}

function splitPersonalExpenseLines(message: string) {
  const physicalLines = message.replace(/\r\n?/gu, "\n").split("\n");
  const lines: string[] = [];

  for (const physicalLine of physicalLines) {
    if (!physicalLine.trim()) {
      continue;
    }

    const delimited = physicalLine.split("、");
    if (delimited.some((line) => !line.trim())) {
      return null;
    }
    lines.push(...delimited.map((line) => line.trim()));
  }

  return lines;
}

export function parsePersonalExpenseMessage(
  input: string
): PersonalExpenseParseResult {
  const lines = splitPersonalExpenseLines(input);
  if (!lines || lines.length === 0) {
    return { ok: false, error: "請輸入要記錄的支出。" };
  }

  const expenses: ParsedPersonalExpense[] = [];
  for (const line of lines) {
    const parsed = parsePersonalExpenseLine(line);
    if (!parsed.ok) {
      return parsed;
    }
    expenses.push(parsed.expenses[0]!);
  }

  return { ok: true, expenses };
}
