import type { ParsedExpenseCommand, ParsedLineCommand } from "@/lib/line/types";

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function parseParticipantNames(rawText?: string) {
  if (!rawText) {
    return undefined;
  }

  const names = rawText
    .split(/[,\u3001， ]+/)
    .map((name) => name.trim())
    .filter(Boolean);

  return names.length > 0 ? names : undefined;
}

function chineseNumberToArabic(input: string) {
  const normalized = input.trim();
  const map: Record<string, number> = {
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

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  if (normalized === "十") {
    return 10;
  }

  if (normalized.endsWith("十")) {
    return (map[normalized[0]] ?? 0) * 10;
  }

  if (normalized.includes("十")) {
    const [tens, ones] = normalized.split("十");
    return (tens ? map[tens] ?? 1 : 1) * 10 + (ones ? map[ones] ?? 0 : 0);
  }

  return map[normalized] ?? Number.NaN;
}

function parseExpensePayload(payload: string): ParsedExpenseCommand | null {
  const normalized = normalize(payload);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(
    /^(?<title>.+?)\s+(?<amount>\d+(?:\.\d{1,2})?)\s+(?:(?<count>\d+|[一二兩三四五六七八九十]+)人\s+)?(?<payer>\S+)付款(?:\s+(?:參與|分攤)[:：]?(?<participants>.+))?$/u
  );

  if (!match?.groups) {
    return null;
  }

  const participantCount = match.groups.count
    ? chineseNumberToArabic(match.groups.count)
    : undefined;
  const participantNames = parseParticipantNames(match.groups.participants);

  return {
    kind: "expense",
    title: match.groups.title.trim(),
    amount: match.groups.amount,
    payerName: match.groups.payer.trim(),
    participantCount,
    participantNames
  };
}

function parseCompactExpense(text: string): ParsedExpenseCommand | null {
  if (!/^7(?:[.、]|\s|$)/u.test(text) && !/^7\S/u.test(text)) {
    return null;
  }

  const compact = text.replace(/^7(?:[.、\s:]*)/u, "").replace(/\s+/g, "");

  if (!compact) {
    return null;
  }

  const withCount = compact.match(
    /^(?<title>[\p{Script=Han}A-Za-z]{1,4})(?<amount>\d+(?:\.\d{1,2})?)(?:(?<count>[一二兩三四五六七八九十\d]+)人)?(?<rest>[\p{Script=Han}A-Za-z]+)$/u
  );

  if (!withCount?.groups) {
    return null;
  }

  const rest = withCount.groups.rest;
  const payerSplit = rest.split("付");
  const payerName = payerSplit.length === 2 ? payerSplit[0] : undefined;
  const compactMemberBlob = payerSplit.length === 2 ? payerSplit[1] : rest;
  const hasParticipantCount = Boolean(withCount.groups.count);
  const participantCount = hasParticipantCount
    ? chineseNumberToArabic(withCount.groups.count)
    : undefined;

  if (hasParticipantCount && (!participantCount || !Number.isFinite(participantCount) || participantCount <= 0)) {
    return null;
  }

  return {
    kind: "expense",
    title: withCount.groups.title,
    amount: withCount.groups.amount,
    payerName,
    participantCount,
    compactMemberBlob
  };
}

function parseExpense(text: string): ParsedExpenseCommand | null {
  if (/^支出(?:\s|:|：|$)/u.test(text)) {
    return parseExpensePayload(text.replace(/^支出(?:\s*[:：])?\s*/u, ""));
  }

  return parseCompactExpense(text);
}

function parseAddMember(text: string): ParsedLineCommand | null {
  const normalized = normalize(text);

  if (normalized === "8" || normalized === "8." || normalized === "8、") {
    return { kind: "add-member-help" };
  }

  let payload = "";

  if (/^新增成員(?:\s|:|：|$)/u.test(normalized)) {
    payload = normalized.replace(/^新增成員(?:\s*[:：])?\s*/u, "");
  } else if (/^8(?:[.、\s:]*)\S+/u.test(normalized)) {
    payload = normalized.replace(/^8(?:[.、\s:]*)/u, "");
  } else {
    return null;
  }

  if (!payload) {
    return { kind: "add-member", names: [] };
  }

  const names = payload
    .split(/[,\u3001， ]+/)
    .map((name) => name.trim())
    .filter(Boolean);

  return { kind: "add-member", names };
}

function parseDeleteMember(text: string): ParsedLineCommand | null {
  const normalized = normalize(text);

  if (normalized === "9" || normalized === "9." || normalized === "9、") {
    return { kind: "delete-member-help" };
  }

  if (/^刪除成員(?:\s|:|：|$)/u.test(normalized)) {
    return {
      kind: "delete-member",
      name: normalized.replace(/^刪除成員(?:\s*[:：])?\s*/u, "")
    };
  }

  if (/^刪除\S+/u.test(normalized)) {
    return {
      kind: "delete-member",
      name: normalized.replace(/^刪除/u, "")
    };
  }

  if (/^9(?:[.、\s:]*)\S+/u.test(normalized)) {
    return {
      kind: "delete-member",
      name: normalized.replace(/^9(?:[.、\s:]*)/u, "")
    };
  }

  return null;
}

function parsePaymentSettingsLink(text: string): ParsedLineCommand | null {
  const normalized = normalize(text);

  if (normalized === "10" || normalized === "10." || normalized === "10、") {
    return { kind: "payment-settings-help" };
  }

  if (/^付款設定(?:\s|:|：|$)/u.test(normalized)) {
    return {
      kind: "payment-settings-link",
      name: normalized.replace(/^付款設定(?:\s*[:：])?\s*/u, "")
    };
  }

  if (/^收款設定(?:\s|:|：|$)/u.test(normalized)) {
    return {
      kind: "payment-settings-link",
      name: normalized.replace(/^收款設定(?:\s*[:：])?\s*/u, "")
    };
  }

  if (/^10(?:[.、\s:]*)\S+/u.test(normalized)) {
    return {
      kind: "payment-settings-link",
      name: normalized.replace(/^10(?:[.、\s:]*)/u, "")
    };
  }

  return null;
}

function parseCreateGroup(text: string): ParsedLineCommand | null {
  const normalized = normalize(text);

  if (normalized === "1" || normalized === "1." || normalized === "1、") {
    return { kind: "create-group-help" };
  }

  if (/^建立群組(?:\s|:|：|$)/u.test(normalized)) {
    return {
      kind: "create-group",
      name: normalized.replace(/^建立群組(?:\s*[:：])?\s*/u, "")
    };
  }

  if (/^1(?:[.、\s:]|\D)\S*/u.test(normalized) && !/^10(?:[.、\s:]*)\S*/u.test(normalized)) {
    return {
      kind: "create-group",
      name: normalized.replace(/^1(?:[.、\s:]*)/u, "")
    };
  }

  return null;
}

function parseBind(text: string): ParsedLineCommand | null {
  const normalized = normalize(text);

  if (normalized === "2" || normalized === "2." || normalized === "2、") {
    return { kind: "bind-help" };
  }

  if (/^綁定群組(?:\s|:|：|$)/u.test(normalized)) {
    return {
      kind: "bind",
      target: normalized.replace(/^綁定群組(?:\s*[:：])?\s*/u, "")
    };
  }

  if (/^2(?:[.、\s:]*)\S+/u.test(normalized)) {
    return {
      kind: "bind",
      target: normalized.replace(/^2(?:[.、\s:]*)/u, "")
    };
  }

  return null;
}

export function parseLineCommand(text: string): ParsedLineCommand {
  const normalized = normalize(text);

  if (!normalized) {
    return { kind: "ignored" };
  }

  if (
    normalized === "小二" ||
    normalized === "@小二" ||
    normalized === "help" ||
    normalized === "指令" ||
    normalized === "功能" ||
    normalized === "menu" ||
    normalized === "選單"
  ) {
    return { kind: "help" };
  }

  if (
    normalized === "是" ||
    normalized === "y" ||
    normalized === "Y" ||
    normalized === "yes" ||
    normalized === "YES"
  ) {
    return { kind: "confirm-delete" };
  }

  if (
    normalized === "否" ||
    normalized === "n" ||
    normalized === "N" ||
    normalized === "no" ||
    normalized === "NO"
  ) {
    return { kind: "cancel-delete" };
  }

  if (
    normalized === "3" ||
    normalized === "3." ||
    normalized === "查看結算" ||
    normalized === "結算"
  ) {
    return { kind: "settlement" };
  }

  if (
    normalized === "4" ||
    normalized === "4." ||
    normalized === "查看最近支出" ||
    normalized === "最近支出"
  ) {
    return { kind: "recent-expenses" };
  }

  if (
    normalized === "5" ||
    normalized === "5." ||
    normalized === "查看成員" ||
    normalized === "成員" ||
    normalized === "成員列表"
  ) {
    return { kind: "list-members" };
  }

  if (
    normalized === "6" ||
    normalized === "6." ||
    normalized === "刪除最後一筆支出" ||
    normalized === "刪最後一筆支出" ||
    normalized === "刪除最後一筆" ||
    normalized === "刪最後一筆"
  ) {
    return { kind: "delete-last-expense" };
  }

  if (
    normalized === "7" ||
    normalized === "7." ||
    normalized === "7、" ||
    normalized === "支出" ||
    normalized === "支出:" ||
    normalized === "支出："
  ) {
    return { kind: "expense-help" };
  }

  const addMemberCommand = parseAddMember(normalized);
  if (addMemberCommand) {
    return addMemberCommand;
  }

  const deleteMemberCommand = parseDeleteMember(normalized);
  if (deleteMemberCommand) {
    return deleteMemberCommand;
  }

  const paymentSettingsLinkCommand = parsePaymentSettingsLink(normalized);
  if (paymentSettingsLinkCommand) {
    return paymentSettingsLinkCommand;
  }

  const createGroupCommand = parseCreateGroup(normalized);
  if (createGroupCommand) {
    return createGroupCommand;
  }

  const bindCommand = parseBind(normalized);
  if (bindCommand) {
    return bindCommand;
  }

  const parsedExpense = parseExpense(normalized);
  if (parsedExpense) {
    return parsedExpense;
  }

  return { kind: "ignored" };
}
