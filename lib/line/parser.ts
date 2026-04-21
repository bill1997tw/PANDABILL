import type { ParsedExpenseCommand, ParsedLineCommand } from "@/lib/line/types";

const CHINESE_NUMBERS: Record<string, number> = {
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

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function parseParticipantNames(rawText?: string) {
  if (!rawText) {
    return undefined;
  }

  const names = rawText
    .split(/[,\u3001/ ]+/)
    .map((name) => name.trim())
    .filter(Boolean);

  return names.length > 0 ? names : undefined;
}

function chineseNumberToArabic(input: string) {
  const normalized = input.trim();

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  if (normalized === "十") {
    return 10;
  }

  if (normalized.endsWith("十")) {
    return (CHINESE_NUMBERS[normalized[0]] ?? 0) * 10;
  }

  if (normalized.includes("十")) {
    const [tens, ones] = normalized.split("十");
    return (tens ? CHINESE_NUMBERS[tens] ?? 1 : 1) * 10 + (ones ? CHINESE_NUMBERS[ones] ?? 0 : 0);
  }

  return CHINESE_NUMBERS[normalized] ?? Number.NaN;
}

function parseExpensePayload(payload: string): ParsedExpenseCommand | null {
  const normalized = normalize(payload);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(
    /^(?<title>.+?)\s+(?<amount>\d+(?:\.\d{1,2})?)\s+(?:(?<count>\d+|[一二兩三四五六七八九十]+)人\s+)?(?<payer>\S+?)(?:付款|付)(?:\s+(?:參與|分攤)[:：]?\s*(?<participants>.+))?$/u
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
  if (!/^7(?:[:：\s]*)?.+/u.test(text)) {
    return null;
  }

  const compact = text.replace(/^7(?:[:：\s]*)?/u, "").replace(/\s+/g, "");

  if (!compact) {
    return null;
  }

  const withCount = compact.match(
    /^(?<title>[\p{Script=Han}A-Za-z]{1,8})(?<amount>\d+(?:\.\d{1,2})?)(?:(?<count>\d+|[一二兩三四五六七八九十]+)人)?(?<rest>[\p{Script=Han}A-Za-z]+)$/u
  );

  if (!withCount?.groups) {
    return null;
  }

  const rest = withCount.groups.rest;
  const payerMatch = rest.match(
    /^(?<payer>[\p{Script=Han}A-Za-z]+?)(?:付款|付)(?<participants>[\p{Script=Han}A-Za-z]+)$/u
  );
  const hasParticipantCount = Boolean(withCount.groups.count);
  const participantCount = hasParticipantCount
    ? chineseNumberToArabic(withCount.groups.count)
    : undefined;

  if (
    hasParticipantCount &&
    (!participantCount || !Number.isFinite(participantCount) || participantCount <= 0)
  ) {
    return null;
  }

  return {
    kind: "expense",
    title: withCount.groups.title,
    amount: withCount.groups.amount,
    payerName: payerMatch?.groups?.payer,
    participantCount,
    compactMemberBlob: payerMatch?.groups?.participants ?? rest
  };
}

function parseExpense(text: string): ParsedExpenseCommand | null {
  if (/^支出(?:\s|[:：]|$)/u.test(text)) {
    return parseExpensePayload(text.replace(/^支出(?:\s*[:：])?\s*/u, ""));
  }

  return parseCompactExpense(text);
}

function parseAddMember(text: string): ParsedLineCommand | null {
  const normalized = normalize(text);

  if (normalized === "8") {
    return { kind: "add-member-help" };
  }

  let payload = "";

  if (/^新增成員(?:\s|[:：]|$)/u.test(normalized)) {
    payload = normalized.replace(/^新增成員(?:\s*[:：])?\s*/u, "");
  } else if (/^8\S+/u.test(normalized)) {
    payload = normalized.replace(/^8/u, "");
  } else {
    return null;
  }

  if (!payload) {
    return { kind: "add-member", names: [] };
  }

  return {
    kind: "add-member",
    names: payload
      .split(/[,\u3001 ]+/)
      .map((name) => name.trim())
      .filter(Boolean)
  };
}

function parseDeleteMember(text: string): ParsedLineCommand | null {
  const normalized = normalize(text);

  if (normalized === "9") {
    return { kind: "delete-member-help" };
  }

  if (/^刪除成員(?:\s|[:：]|$)/u.test(normalized)) {
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

  if (/^9\S+/u.test(normalized)) {
    return {
      kind: "delete-member",
      name: normalized.replace(/^9/u, "")
    };
  }

  return null;
}

function parseCreateGroup(text: string): ParsedLineCommand | null {
  const normalized = normalize(text);

  if (normalized === "1") {
    return { kind: "create-group-help" };
  }

  if (/^建立群組(?:\s|[:：]|$)/u.test(normalized)) {
    return {
      kind: "create-group",
      name: normalized.replace(/^建立群組(?:\s*[:：])?\s*/u, "")
    };
  }

  if (/^1(?!0)\S+/u.test(normalized)) {
    return {
      kind: "create-group",
      name: normalized.replace(/^1/u, "")
    };
  }

  return null;
}

function parseBind(text: string): ParsedLineCommand | null {
  const normalized = normalize(text);

  if (normalized === "2") {
    return { kind: "bind-help" };
  }

  if (/^綁定群組(?:\s|[:：]|$)/u.test(normalized)) {
    return {
      kind: "bind",
      target: normalized.replace(/^綁定群組(?:\s*[:：])?\s*/u, "")
    };
  }

  if (/^2\S+/u.test(normalized)) {
    return {
      kind: "bind",
      target: normalized.replace(/^2/u, "")
    };
  }

  return null;
}

function parseLedgerCommands(text: string): ParsedLineCommand | null {
  const normalized = normalize(text);

  if (/^(建立活動|建立帳本)(?:\s|[:：]|$)/u.test(normalized)) {
    return {
      kind: "create-ledger",
      name: normalized.replace(/^(建立活動|建立帳本)(?:\s*[:：])?\s*/u, "")
    };
  }

  if (/^(切換活動|切換帳本)(?:\s|[:：]|$)/u.test(normalized)) {
    return {
      kind: "switch-ledger",
      name: normalized.replace(/^(切換活動|切換帳本)(?:\s*[:：])?\s*/u, "")
    };
  }

  if (normalized === "目前活動" || normalized === "目前帳本") {
    return { kind: "current-ledger" };
  }

  if (
    normalized === "查看帳本" ||
    normalized === "帳本列表" ||
    normalized === "查看活動"
  ) {
    return { kind: "list-ledgers" };
  }

  if (normalized === "結束活動" || normalized === "關閉帳本") {
    return { kind: "close-ledger" };
  }

  if (/^(封存帳本|封存活動)(?:\s|[:：]|$)/u.test(normalized)) {
    return {
      kind: "archive-ledger",
      name: normalized.replace(/^(封存帳本|封存活動)(?:\s*[:：])?\s*/u, "")
    };
  }

  if (normalized === "查看歷史帳本" || normalized === "查看封存帳本") {
    return { kind: "list-archived-ledgers" };
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
    normalized === "YES" ||
    normalized === "確認刪除"
  ) {
    return { kind: "confirm-delete" };
  }

  if (
    normalized === "否" ||
    normalized === "n" ||
    normalized === "N" ||
    normalized === "no" ||
    normalized === "NO" ||
    normalized === "取消刪除"
  ) {
    return { kind: "cancel-delete" };
  }

  if (normalized === "取消設定" || normalized === "取消設定收款") {
    return { kind: "cancel-payment-setup" };
  }

  if (/^我是.+/u.test(normalized)) {
    return {
      kind: "identify-self",
      name: normalized.replace(/^我是/u, "").trim()
    };
  }

  if (normalized === "10" || normalized === "設定收款" || normalized === "更改付款方式") {
    return { kind: "start-payment-setup" };
  }

  if (normalized === "11" || normalized === "查看我的付款方式") {
    return { kind: "view-my-payment-settings" };
  }

  if (normalized === "3" || normalized === "查看結算" || normalized === "結算") {
    return { kind: "settlement" };
  }

  if (normalized === "4" || normalized === "查看最近支出" || normalized === "最近支出") {
    return { kind: "recent-expenses" };
  }

  if (normalized === "5" || normalized === "查看成員" || normalized === "成員") {
    return { kind: "list-members" };
  }

  if (
    normalized === "6" ||
    normalized === "刪除最後一筆支出" ||
    normalized === "刪除最後一筆"
  ) {
    return { kind: "delete-last-expense" };
  }

  if (normalized === "7" || normalized === "支出") {
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

  const ledgerCommand = parseLedgerCommands(normalized);
  if (ledgerCommand) {
    return ledgerCommand;
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
