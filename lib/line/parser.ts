import { parseNaturalExpense } from "@/lib/commands/expense";
import type { ParsedLineCommand } from "@/lib/line/types";

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function parseShortcut(text: string): ParsedLineCommand | null {
  const match = text.match(/^([1-6])\s*(.*)$/u);

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

  if (normalized === "小二") {
    return { kind: "xiaoer-help" };
  }

  if (normalized === "算帳") {
    return { kind: "settlement-help" };
  }

  if (["+", "+1", "++", "加入", "我要加入", "我要去", "參加"].includes(normalized)) {
    return { kind: "join-activity" };
  }

  if (["-", "-1", "退出", "我要退出", "不去"].includes(normalized)) {
    return { kind: "leave-activity" };
  }

  if (["是", "y", "Y", "yes", "YES"].includes(normalized)) {
    return { kind: "confirm" };
  }

  if (["否", "取消", "不用了", "n", "N", "no", "NO"].includes(normalized)) {
    return { kind: "cancel" };
  }

  if (/^(建立活動|建立帳本)(?:\s|$)/u.test(normalized)) {
    return {
      kind: "create-ledger",
      name: normalized.replace(/^(建立活動|建立帳本)\s*/u, "").trim()
    };
  }

  if (/^(切換活動|切換帳本)(?:\s|$)/u.test(normalized)) {
    return {
      kind: "switch-ledger",
      name: normalized.replace(/^(切換活動|切換帳本)\s*/u, "").trim()
    };
  }

  if (normalized === "目前活動" || normalized === "目前帳本") {
    return { kind: "current-ledger" };
  }

  if (normalized === "重置活動") {
    return { kind: "reset-ledger" };
  }

  if (normalized === "群組資訊") {
    return { kind: "group-info" };
  }

  if (["查看帳本", "帳本列表", "查看活動"].includes(normalized)) {
    return { kind: "list-ledgers" };
  }

  if (["確認成員", "2確認成員", "2 確認成員"].includes(normalized)) {
    return { kind: "confirm-members" };
  }

  if (["查看成員", "成員名單"].includes(normalized)) {
    return { kind: "list-members" };
  }

  if (["查看支出", "最近支出", "5查看支出", "5 查看支出"].includes(normalized)) {
    return { kind: "recent-expenses" };
  }

  if (["支出", "4支出", "4 支出"].includes(normalized)) {
    return { kind: "expense-help" };
  }

  if (
    ["刪除最近一筆支出", "刪除上一筆", "撤銷", "6刪除最近一筆支出", "6 刪除最近一筆支出"].includes(
      normalized
    )
  ) {
    return { kind: "delete-last-expense" };
  }

  if (
    ["帳本結算", "查看結算", "結算"].includes(normalized) ||
    /^1\s*帳本結算$/u.test(normalized)
  ) {
    return { kind: "settlement" };
  }

  if (normalized === "代墊MVP" || /^2\s*代墊MVP$/u.test(normalized)) {
    return { kind: "mvp" };
  }

  if (
    ["結束活動", "結束活動同時封存帳本"].includes(normalized) ||
    /^3\s*結束活動$/u.test(normalized)
  ) {
    return { kind: "close-ledger" };
  }

  if (
    ["查看封存帳本", "查看歷史帳本", "查看封存活動"].includes(normalized) ||
    /^4\s*查看封存帳本$/u.test(normalized)
  ) {
    return { kind: "list-archived-ledgers" };
  }

  if (/^(封存帳本|封存活動)(?:\s|$)/u.test(normalized)) {
    return {
      kind: "archive-ledger",
      name: normalized.replace(/^(封存帳本|封存活動)\s*/u, "").trim()
    };
  }

  if (
    ["3設定收款", "3 設定收款", "設定收款方式", "設定收款"].includes(normalized)
  ) {
    return { kind: "start-payment-setup" };
  }

  if (/^我是.+/u.test(normalized)) {
    return {
      kind: "identify-self",
      name: normalized.replace(/^我是/u, "").trim()
    };
  }

  if (/^建立群組(?:\s|$)/u.test(normalized)) {
    return {
      kind: "create-group",
      name: normalized.replace(/^建立群組\s*/u, "").trim()
    };
  }

  if (/^綁定群組(?:\s|$)/u.test(normalized)) {
    return {
      kind: "bind",
      target: normalized.replace(/^綁定群組\s*/u, "").trim()
    };
  }

  const shortcut = parseShortcut(normalized);
  if (shortcut) {
    return shortcut;
  }

  const parsedExpense = parseNaturalExpense(normalized);
  if (parsedExpense) {
    return {
      kind: "expense",
      title: parsedExpense.title,
      amount: parsedExpense.amount,
      payerName: parsedExpense.payerName,
      payerIsSender: parsedExpense.payerIsSender,
      participantCount: parsedExpense.participantCount
    };
  }

  return { kind: "ignored" };
}
