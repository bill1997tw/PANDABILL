export type ParsedExpenseIntent = {
  title: string;
  amount: string;
  payerName?: string;
  payerIsSender?: boolean;
  participantCount?: number;
};

const CHINESE_NUMBER_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10
};

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function parseCount(raw?: string) {
  if (!raw) {
    return undefined;
  }

  const normalized = raw.trim();

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  if (normalized === "十") {
    return 10;
  }

  if (normalized.includes("十")) {
    const [tens, ones] = normalized.split("十");
    const tensValue = tens ? CHINESE_NUMBER_MAP[tens] ?? 1 : 1;
    const onesValue = ones ? CHINESE_NUMBER_MAP[ones] ?? 0 : 0;
    return tensValue * 10 + onesValue;
  }

  return CHINESE_NUMBER_MAP[normalized];
}

function cleanTitle(value: string) {
  return value
    .replace(/^(我付了|我先付|支出)/u, "")
    .replace(/(元|塊)$/u, "")
    .trim();
}

function buildParsedExpense(
  title: string,
  amount: string,
  options?: {
    payerName?: string;
    payerIsSender?: boolean;
    participantCount?: number;
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
    payerIsSender: options?.payerIsSender,
    participantCount: options?.participantCount
  };
}

export function parseNaturalExpense(text: string): ParsedExpenseIntent | null {
  const normalized = normalizeWhitespace(text);

  if (!normalized) {
    return null;
  }

  const patterns: Array<() => ParsedExpenseIntent | null> = [
    () => {
      const match = normalized.match(
        /^我付了(?:(?<count>\d+|[一二兩三四五六七八九十]+)個人(?:的)?)?(?<title>.+?)(?<amount>\d+(?:\.\d{1,2})?)元?$/u
      );

      if (!match?.groups) {
        return null;
      }

      return buildParsedExpense(match.groups.title, match.groups.amount, {
        payerIsSender: true,
        participantCount: parseCount(match.groups.count)
      });
    },
    () => {
      const match = normalized.match(
        /^(?<payer>我|[\p{Script=Han}A-Za-z0-9_]{1,20})付(?<title>.+?)(?<amount>\d+(?:\.\d{1,2})?)元?$/u
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
      const match = normalized.match(
        /^(?<title>.+?)\s*(?<amount>\d+(?:\.\d{1,2})?)\s*(?<count>\d+|[一二兩三四五六七八九十]+)人分\s*(?<payer>我|[\p{Script=Han}A-Za-z0-9_]{1,20})(?:先)?付$/u
      );

      if (!match?.groups) {
        return null;
      }

      return buildParsedExpense(match.groups.title, match.groups.amount, {
        payerIsSender: match.groups.payer === "我",
        payerName: match.groups.payer === "我" ? undefined : match.groups.payer,
        participantCount: parseCount(match.groups.count)
      });
    },
    () => {
      const match = normalized.match(
        /^(?<title>.+?)\s*(?<amount>\d+(?:\.\d{1,2})?)\s*(?<payer>我|[\p{Script=Han}A-Za-z0-9_]{1,20})(?:先)?付\s*(?<count>\d+|[一二兩三四五六七八九十]+)人分$/u
      );

      if (!match?.groups) {
        return null;
      }

      return buildParsedExpense(match.groups.title, match.groups.amount, {
        payerIsSender: match.groups.payer === "我",
        payerName: match.groups.payer === "我" ? undefined : match.groups.payer,
        participantCount: parseCount(match.groups.count)
      });
    },
    () => {
      const match = normalized.match(
        /^(?<title>.+?)\s*(?<amount>\d+(?:\.\d{1,2})?)\s*(?<count>\d+|[一二兩三四五六七八九十]+)人分$/u
      );

      if (!match?.groups) {
        return null;
      }

      return buildParsedExpense(match.groups.title, match.groups.amount, {
        payerIsSender: true,
        participantCount: parseCount(match.groups.count)
      });
    },
    () => {
      const match = normalized.match(
        /^(?<title>.+?)\s*(?<amount>\d+(?:\.\d{1,2})?)\s*(?<payer>我|[\p{Script=Han}A-Za-z0-9_]{1,20})(?:先)?付$/u
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
      const match = normalized.match(/^(?<title>.+?)\s+(?<amount>\d+(?:\.\d{1,2})?)$/u);

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
