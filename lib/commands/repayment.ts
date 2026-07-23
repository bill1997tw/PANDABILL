export type ParsedRepayment = {
  amount: string;
  payerName: string;
  receiverName: string;
};

export type RepaymentParseError = {
  reason: string;
};

function compact(text: string) {
  return text.replace(/\s+/gu, " ").trim();
}

export function parseRepaymentInput(text: string): ParsedRepayment | RepaymentParseError {
  const normalized = compact(text);
  const match =
    normalized.match(
      /^(?<payer>我|[^\d\s]+?)\s*還款\s*(?<amount>\d+(?:\.\d{1,2})?)\s*(?:付給|給|付)\s*(?<receiver>[^\d\s]+)\s*$/u
    ) ??
    normalized.match(
      /^還款\s*(?<amount>\d+(?:\.\d{1,2})?)\s*(?<payer>我|[^\d\s]+?)\s*(?:付給|給|付)\s*(?<receiver>[^\d\s]+)\s*$/u
    );

  if (!match?.groups) {
    return {
      reason: "格式不正確"
    };
  }

  return {
    amount: match.groups.amount ?? "",
    payerName: match.groups.payer ?? "",
    receiverName: match.groups.receiver ?? ""
  };
}

export function getRepaymentGuideText() {
  return [
    "中途還款請輸入：",
    "小明還款14000給小華",
    "",
    "也可使用「我」：",
    "我還款14000給小華"
  ].join("\n");
}
