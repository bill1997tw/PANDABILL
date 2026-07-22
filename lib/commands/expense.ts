export type ExpenseParseError = {
  block: string;
  reason: string;
};

export type ParsedExpenseBlock = {
  title: string;
  amount: string;
  payerName: string;
  payerIsSender: boolean;
  participantNames: string[] | null;
  shares: Array<{
    name: string;
    amount: string;
  }>;
};

function compact(text: string) {
  return text.replace(/\s+/gu, " ").trim();
}

function stripExpensePrefix(text: string) {
  return text.replace(/^新增支出\s*/u, "").trim();
}

export function splitExpenseBlocks(text: string) {
  return stripExpensePrefix(text)
    .split(/[\/／]+/u)
    .map((block) => compact(block))
    .filter(Boolean);
}

function parseByAmountBeforePayer(block: string) {
  return block.match(
    /^(?<title>[^\/／]*\D)\s*(?<amount>\d+(?:\.\d{1,2})?)\s*(?<payer>[^\d\s\/／]+?)付(?<tail>.*)$/u
  );
}

function parseSeparatedAmountBeforePayer(block: string) {
  return block.match(
    /^(?<title>[^\/／]+?)\s+(?<amount>\d+(?:\.\d{1,2})?)\s*(?<payer>[^\d\s\/／]+?)付(?<tail>.*)$/u
  );
}

function parseByPayerBeforeAmount(block: string) {
  return block.match(
    /^(?<title>.+?)(?<payer>我|[^\d\s\/／]+?)付\s*(?<amount>\d+(?:\.\d{1,2})?)(?<tail>.*)$/u
  );
}

function parseSeparatedPayerBeforeAmount(block: string) {
  return block.match(
    /^(?<title>[^\/／]+?)\s+(?<payer>我|[^\d\s\/／]+?)付\s*(?<amount>\d+(?:\.\d{1,2})?)(?<tail>.*)$/u
  );
}

function parseShares(tail: string) {
  const shares: ParsedExpenseBlock["shares"] = [];
  const regex = /(\d+(?:\.\d{1,2})?)\s*([^\d\s\/／]+)/gu;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(tail)) !== null) {
    shares.push({
      amount: match[1] ?? "",
      name: match[2]?.trim() ?? ""
    });
  }

  return shares.filter((share) => share.amount && share.name);
}

function parseParticipantNames(tail: string) {
  const normalized = compact(tail).replace(/分$/u, "").trim();

  if (!normalized) {
    return null;
  }

  if (/\d/u.test(normalized)) {
    return null;
  }

  return normalized.split(/\s+/u).map((name) => name.trim()).filter(Boolean);
}

export function parseExpenseBlock(block: string): ParsedExpenseBlock | ExpenseParseError {
  const normalized = compact(block);

  if (!normalized) {
    return {
      block,
      reason: "空白內容"
    };
  }

  if (/https?:\/\//iu.test(normalized)) {
    return {
      block,
      reason: "網址不會被記帳"
    };
  }

  if (!normalized.includes("付")) {
    return {
      block,
      reason: "缺少付款人"
    };
  }

  const match =
    parseSeparatedAmountBeforePayer(normalized) ??
    parseSeparatedPayerBeforeAmount(normalized) ??
    parseByAmountBeforePayer(normalized) ??
    parseByPayerBeforeAmount(normalized);

  if (!match?.groups) {
    return {
      block,
      reason: "格式不正確"
    };
  }

  const title = compact(match.groups.title ?? "");
  const amount = match.groups.amount ?? "";
  const payerName = compact(match.groups.payer ?? "");
  const tail = compact(match.groups.tail ?? "");

  if (!title) {
    return {
      block,
      reason: "缺少項目名稱"
    };
  }

  if (!amount) {
    return {
      block,
      reason: "缺少金額"
    };
  }

  if (!payerName) {
    return {
      block,
      reason: "缺少付款人"
    };
  }

  const shares = parseShares(tail);

  if (shares.length > 0) {
    return {
      title,
      amount,
      payerName,
      payerIsSender: payerName === "我",
      participantNames: null,
      shares
    };
  }

  return {
    title,
    amount,
    payerName,
    payerIsSender: payerName === "我",
    participantNames: parseParticipantNames(tail),
    shares: []
  };
}

export function looksLikeExpenseInput(text: string) {
  const normalized = compact(text);

  if (/https?:\/\//iu.test(normalized)) {
    return false;
  }

  return normalized.includes("付") && /\d/u.test(normalized);
}
