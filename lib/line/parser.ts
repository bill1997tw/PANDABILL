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

export function parseLineCommand(text: string): ParsedLineCommand {
  const normalized = normalize(text);

  if (!normalized) {
    return { kind: "ignored" };
  }

  if (normalized === "小二") {
    return { kind: "xiaoer-help" };
  }

  if (normalized === "算帳") {
    return { kind: "settlement" };
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

  if (normalized === "設定收款方式" || normalized === "設定") {
    return { kind: "start-payment-setup" };
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

  const shortcutCreate = normalized.match(/^1\s+(.+)$/u);
  if (shortcutCreate?.[1]) {
    return {
      kind: "create-ledger",
      name: shortcutCreate[1].trim()
    };
  }

  if (normalized === "5") {
    return { kind: "expense-help" };
  }

  if (normalized === "6") {
    return { kind: "recent-expenses" };
  }

  if (normalized === "7") {
    return { kind: "delete-last-expense" };
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

  return { kind: "ignored" };
}
