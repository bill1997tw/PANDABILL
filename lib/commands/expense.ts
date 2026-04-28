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
  return value
    .replace(/^(我付了|我先付|新增支出|支出)/u, "")
    .replace(/元$/u, "")
    .trim();
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

  if (!clean) {
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

  const patterns: Array<() => ParsedExpenseIntent | null> = [
    () => {
      const match = normalized.match(/^我付了(?<title>.+?)(?<amount>\d+)元?$/u);
      if (!match?.groups) {
        return null;
      }

      return buildParsedExpense(match.groups.title, match.groups.amount, {
        payerIsSender: true
      });
    },
    () => {
      const match = normalized.match(/^(?<title>.+?)(?<amount>\d+)我付$/u);
      if (!match?.groups) {
        return null;
      }

      return buildParsedExpense(match.groups.title, match.groups.amount, {
        payerIsSender: true
      });
    },
    () => {
      const match = normalized.match(/^(?<title>.+?)(?<amount>\d+)我先付$/u);
      if (!match?.groups) {
        return null;
      }

      return buildParsedExpense(match.groups.title, match.groups.amount, {
        payerIsSender: true
      });
    },
    () => {
      const match = normalized.match(
        /^(?<payer>[\p{Script=Han}A-Za-z0-9_]{1,20})付(?<title>.+?)(?<amount>\d+)元?$/u
      );

      if (!match?.groups) {
        return null;
      }

      return buildParsedExpense(match.groups.title, match.groups.amount, {
        payerName: match.groups.payer
      });
    },
    () => {
      const match = normalized.match(
        /^(?<title>.+?)\s*(?<amount>\d+)\s*(?<payer>我|[\p{Script=Han}A-Za-z0-9_]{1,20})付$/u
      );

      if (!match?.groups) {
        return null;
      }

      return buildParsedExpense(match.groups.title, match.groups.amount, {
        payerIsSender: match.groups.payer === "我",
        payerName: match.groups.payer === "我" ? undefined : match.groups.payer
      });
    },
    () => {
      const match = normalized.match(/^(?<title>.+?)\s*(?<amount>\d+)$/u);

      if (!match?.groups) {
        return null;
      }

      return buildParsedExpense(match.groups.title, match.groups.amount, {
        payerIsSender: true
      });
    }
  ];

  for (const parse of patterns) {
    const result = parse();
    if (result) {
      return result;
    }
  }

  return null;
}

export function parseExpenseDraftHeader(text: string): ParsedExpenseDraftHeader | null {
  const normalized = normalizeWhitespace(text);
  const match = normalized.match(/^(?<title>.+?)(?<amount>\d+)元?$/u);

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

  if (normalized === "我付" || normalized === "我付了" || normalized === "我先付") {
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
