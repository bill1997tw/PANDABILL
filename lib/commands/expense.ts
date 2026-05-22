export type ParsedExpenseIntent = {
  title: string;
  amount: string;
  payerName?: string;
  payerIsSender?: boolean;
};

export type ParsedExpenseDraftHeader = {
  title: string;
  amount: string;
};

export type ParsedExpensePayerLine = {
  payerName: string;
  payerIsSender: boolean;
};

export type ParsedExpenseShareLine = {
  participantName: string;
  amount: string;
};

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function cleanTitle(value: string) {
  return value.replace(/^(新增支出|支出)/u, "").replace(/^[:：]/u, "").trim();
}

function buildParsedExpense(
  title: string,
  amount: string,
  options?: {
    payerName?: string;
    payerIsSender?: boolean;
  }
): ParsedExpenseIntent | null {
  const clean = cleanTitle(title);

  if (!clean || !amount) {
    return null;
  }

  return {
    title: clean,
    amount,
    payerName: options?.payerName,
    payerIsSender: options?.payerIsSender
  };
}

export function parseNaturalExpense(text: string): ParsedExpenseIntent | null {
  const normalized = normalizeWhitespace(text);

  if (!normalized || normalized.includes("\n")) {
    return null;
  }

  const senderPaid = normalized.match(/^(?<title>.+?)(?<amount>\d+)\s*(我付|我出|我墊)$/u);
  if (senderPaid?.groups) {
    return buildParsedExpense(senderPaid.groups.title, senderPaid.groups.amount, {
      payerIsSender: true
    });
  }

  const namedPaid = normalized.match(
    /^(?<title>.+?)(?<amount>\d+)\s*(?<payer>[\p{Script=Han}A-Za-z0-9_]{1,20})付$/u
  );
  if (namedPaid?.groups) {
    return buildParsedExpense(namedPaid.groups.title, namedPaid.groups.amount, {
      payerName: namedPaid.groups.payer
    });
  }

  const senderFront = normalized.match(/^(我付|我出|我墊)(?<title>.+?)(?<amount>\d+)$/u);
  if (senderFront?.groups) {
    return buildParsedExpense(senderFront.groups.title, senderFront.groups.amount, {
      payerIsSender: true
    });
  }

  const namedFront = normalized.match(
    /^(?<payer>[\p{Script=Han}A-Za-z0-9_]{1,20})付(?<title>.+?)(?<amount>\d+)$/u
  );
  if (namedFront?.groups) {
    return buildParsedExpense(namedFront.groups.title, namedFront.groups.amount, {
      payerName: namedFront.groups.payer
    });
  }

  return null;
}

export function parseExpenseDraftHeader(text: string): ParsedExpenseDraftHeader | null {
  const normalized = normalizeWhitespace(text);
  const match = normalized.match(/^(?<title>.+?)(?<amount>\d+)$/u);

  if (!match?.groups) {
    return null;
  }

  const title = cleanTitle(match.groups.title);
  if (!title) {
    return null;
  }

  return {
    title,
    amount: match.groups.amount
  };
}

export function parseExpensePayerLine(text: string): ParsedExpensePayerLine | null {
  const normalized = normalizeWhitespace(text);

  if (!normalized) {
    return null;
  }

  if (normalized === "我付" || normalized === "我出" || normalized === "我墊") {
    return {
      payerName: "我",
      payerIsSender: true
    };
  }

  const match = normalized.match(/^(?<payer>.+?)付$/u);
  if (!match?.groups?.payer) {
    return null;
  }

  const payerName = match.groups.payer.trim();
  return {
    payerName,
    payerIsSender: payerName === "我"
  };
}

export function parseExpenseShareLine(text: string): ParsedExpenseShareLine | null {
  const normalized = normalizeWhitespace(text);
  const match = normalized.match(/^(?<amount>\d+)\s*(?<name>.+)$/u);

  if (!match?.groups?.name) {
    return null;
  }

  return {
    amount: match.groups.amount,
    participantName: match.groups.name.trim()
  };
}

export function splitMultilineSegments(text: string) {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}
