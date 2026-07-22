import type { ParsedLineCommand } from "@/lib/line/types";

function normalize(text: string) {
  return text.replace(/\s+/gu, " ").trim();
}

function splitNames(payload: string) {
  return payload
    .split(/\s+/u)
    .map((name) => name.trim())
    .filter(Boolean);
}

function parseShortcut(text: string): ParsedLineCommand | null {
  const match = text.match(/^([1-7])(?:\s+(.*))?$/u);

  if (!match) {
    return null;
  }

  return {
    kind: "shortcut",
    number: Number(match[1]),
    payload: match[2]?.trim() || undefined
  };
}

export function parseLineCommand(text: string): ParsedLineCommand {
  const normalized = normalize(text);

  if (!normalized) {
    return { kind: "ignored" };
  }

  if (normalized === "還款") {
    return { kind: "repayment-help" };
  }

  if (normalized.startsWith("還款")) {
    return { kind: "repayment", text: normalized };
  }

  if (normalized === "小二") {
    return { kind: "xiaoer-help" };
  }

  if (normalized === "算帳") {
    return { kind: "settlement-help" };
  }

  if (
    normalized === "查看目前結算" ||
    normalized === "目前結算" ||
    normalized === "結算"
  ) {
    return { kind: "current-settlement" };
  }

  if (normalized === "帳本結算") {
    return { kind: "ledger-settlement" };
  }

  if (normalized === "代墊 MVP" || normalized === "代墊MVP") {
    return { kind: "mvp" };
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

  if (normalized === "切換活動" || normalized === "切換帳本") {
    return { kind: "switch-ledger-help" };
  }

  if (normalized.startsWith("切換活動 ") || normalized.startsWith("切換帳本 ")) {
    const name = normalized.replace(/^(切換活動|切換帳本)\s*/u, "").trim();
    return name ? { kind: "switch-ledger", name } : { kind: "switch-ledger-help" };
  }

  if (
    normalized === "結束活動並封存帳本" ||
    normalized === "結束活動同時封存帳本"
  ) {
    return { kind: "archive-ledger" };
  }

  if (normalized === "結束活動" || normalized === "結束帳本") {
    return { kind: "close-ledger" };
  }

  if (
    normalized === "封存帳本" ||
    normalized === "帳本封存" ||
    normalized === "封存活動"
  ) {
    return { kind: "archive-ledger" };
  }

  if (
    normalized.startsWith("封存帳本 ") ||
    normalized.startsWith("帳本封存 ") ||
    normalized.startsWith("封存活動 ")
  ) {
    const name = normalized.replace(/^(封存帳本|帳本封存|封存活動)\s*/u, "").trim();
    return name ? { kind: "archive-ledger", name } : { kind: "archive-ledger" };
  }

  if (normalized === "新增支出" || normalized.startsWith("新增支出 ")) {
    return { kind: "expense-help" };
  }

  if (normalized === "查看目前支出" || normalized === "查看支出") {
    return { kind: "recent-expenses" };
  }

  if (normalized === "刪除支出") {
    return { kind: "delete-last-expense" };
  }

  if (normalized === "確認成員") {
    return { kind: "confirm-members" };
  }

  if (
    normalized === "設定" ||
    normalized === "10" ||
    normalized === "設定收款" ||
    normalized === "設定收款方式" ||
    normalized === "更改付款方式"
  ) {
    return { kind: "start-payment-setup" };
  }

  if (normalized === "11" || normalized === "查看我的付款方式") {
    return { kind: "view-payment-settings" };
  }

  if (normalized === "+" || normalized === "+1" || normalized === "加入") {
    return { kind: "join-activity" };
  }

  if (normalized === "-" || normalized === "-1" || normalized === "退出") {
    return { kind: "leave-activity" };
  }

  if (normalized === "取消") {
    return { kind: "cancel" };
  }

  if (normalized === "建立活動") {
    return { kind: "create-ledger-help" };
  }

  if (normalized.startsWith("建立活動 ")) {
    return {
      kind: "create-ledger",
      name: normalized.replace(/^建立活動\s*/u, "").trim()
    };
  }

  if (normalized.startsWith("新增成員 ") || normalized.startsWith("加成員 ")) {
    const payload = normalized.replace(/^(新增成員|加成員)\s*/u, "").trim();
    const names = splitNames(payload);
    return names.length > 0 ? { kind: "add-members", names } : { kind: "ignored" };
  }

  if (normalized.startsWith("刪除成員 ") || normalized.startsWith("移除成員 ")) {
    const name = normalized.replace(/^(刪除成員|移除成員)\s*/u, "").trim();
    return name ? { kind: "remove-member", name } : { kind: "ignored" };
  }

  const shortcut = parseShortcut(normalized);

  if (shortcut) {
    return shortcut;
  }

  return { kind: "ignored" };
}
