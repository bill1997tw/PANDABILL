import { formatCents } from "../currency.ts";
import type {
  PersonalExpenseBatchResult,
  PersonalExpenseDeleteResult,
  PersonalExpenseDetailResult,
  PersonalLedgerCategorySummary,
  PersonalLedgerSummary
} from "./types.ts";
import {
  normalizePersonalExpenseCategory,
  PERSONAL_EXPENSE_CATEGORIES
} from "./category.ts";

const PERSONAL_DETAIL_MAX_ITEMS = 40;
const PERSONAL_DETAIL_MAX_LENGTH = 4_000;
const PERSONAL_DETAIL_ITEM_MAX_LENGTH = 80;
const PERSONAL_HISTORY_MAX_LENGTH = 4_000;
const PERSONAL_EXPENSE_RECORDED_MAX_LENGTH = 4_000;

function formatPersonalAmount(cents: number) {
  return formatCents(cents).replace(/\.00$/u, "");
}

function compactPersonalText(text: string) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length <= PERSONAL_DETAIL_ITEM_MAX_LENGTH
    ? normalized
    : `${normalized.slice(0, PERSONAL_DETAIL_ITEM_MAX_LENGTH - 1)}…`;
}

export function getPersonalAccountingMenuText() {
  return [
    "大人要記點花費嗎？小二替您記著～",
    "",
    "1. 開始記帳",
    "2. 查看本次花費",
    "3. 查看明細",
    "4. 刪除上一筆",
    "5. 結束記帳",
    "6. 查看歷史記帳"
  ].join("\n");
}

export function getPersonalLedgerNamePrompt() {
  return [
    "請輸入這次的記帳名稱～",
    "",
    "例如：",
    "0813吉隆坡",
    "週末花蓮",
    "今天逛街"
  ].join("\n");
}

export function formatPersonalLedgerStarted(ledger: PersonalLedgerSummary) {
  return [
    "已開始記帳 ✓",
    "",
    `帳本：${compactPersonalText(ledger.name)}`,
    `目前支出：$${formatPersonalAmount(ledger.totalExpenseCents)}`,
    "",
    "接下來的花費，小二都可以替您記著。"
  ].join("\n");
}

export function formatPersonalLedgerAlreadyActive(ledger: PersonalLedgerSummary) {
  return [
    "大人目前已有一本記帳中的帳本～",
    "",
    `帳本：${compactPersonalText(ledger.name)}`,
    "",
    "請先結束目前記帳，再建立新的帳本。"
  ].join("\n");
}

function formatPersonalCategoryBreakdown(
  ledger: PersonalLedgerCategorySummary
) {
  const lines = PERSONAL_EXPENSE_CATEGORIES
    .filter((category) => ledger.categoryTotals[category] > 0)
    .map(
      (category) =>
        `${category}｜$${formatPersonalAmount(ledger.categoryTotals[category])}`
    );

  return lines.length > 0 ? ["", "分類統計：", ...lines] : [];
}

export function formatCurrentPersonalLedger(
  ledger: PersonalLedgerCategorySummary
) {
  return [
    compactPersonalText(ledger.name),
    "",
    `目前共 ${ledger.expenseCount} 筆`,
    `目前支出：$${formatPersonalAmount(ledger.totalExpenseCents)}`,
    ...(ledger.expenseCount === 0 ? ["", "目前還沒有支出紀錄～"] : []),
    ...formatPersonalCategoryBreakdown(ledger)
  ].join("\n");
}

export function getNoActivePersonalLedgerText() {
  return [
    "目前沒有進行中的個人記帳～",
    "",
    "輸入「開始記帳」即可建立新的帳本。"
  ].join("\n");
}

export function formatPersonalLedgerEndPrompt(ledger: PersonalLedgerSummary) {
  return [
    `確定要結束「${compactPersonalText(ledger.name)}」嗎？`,
    "",
    "1. 確定結束",
    "2. 取消"
  ].join("\n");
}

export function formatPersonalLedgerEnded(
  ledger: PersonalLedgerCategorySummary
) {
  return [
    `「${compactPersonalText(ledger.name)}」已結束 ✓`,
    "",
    `本次共記錄 ${ledger.expenseCount} 筆`,
    `總支出：$${formatPersonalAmount(ledger.totalExpenseCents)}`,
    ...formatPersonalCategoryBreakdown(ledger)
  ].join("\n");
}

export function formatPersonalLedgerHistory(ledgers: PersonalLedgerSummary[]) {
  if (ledgers.length === 0) {
    return "目前還沒有個人記帳紀錄～";
  }

  const header = ["歷史記帳：", ""];
  const displayed: string[] = [];

  for (const ledger of ledgers) {
    const status = ledger.status === "active" ? "記帳中" : "已結束";
    const line = `${displayed.length + 1}. ${compactPersonalText(ledger.name)}｜${status}｜${ledger.expenseCount} 筆｜總支出 $${formatPersonalAmount(ledger.totalExpenseCents)}`;
    const remaining = ledgers.length - displayed.length - 1;
    const preview = [
      ...header,
      ...displayed,
      line,
      ...(remaining > 0 ? [`尚有 ${remaining} 本帳本未顯示。`] : [])
    ].join("\n");

    if (preview.length > PERSONAL_HISTORY_MAX_LENGTH) {
      break;
    }
    displayed.push(line);
  }

  const remaining = ledgers.length - displayed.length;
  return [
    ...header,
    ...displayed,
    ...(remaining > 0 ? [`尚有 ${remaining} 本帳本未顯示。`] : [])
  ].join("\n");
}

function compactPersonalExpenseItem(item: string) {
  return compactPersonalText(item);
}

function formatPersonalExpenseDetailLine(
  index: number,
  expense: PersonalExpenseDetailResult["expenses"][number]
) {
  return `${index}. ${compactPersonalExpenseItem(expense.item)}｜$${formatPersonalAmount(expense.amountCents)}｜${normalizePersonalExpenseCategory(expense.category)}`;
}

export function formatPersonalExpenseDetails(
  details: PersonalExpenseDetailResult
) {
  if (details.totalExpenseCount === 0) {
    return [
      compactPersonalText(details.ledger.name),
      "",
      "目前還沒有支出紀錄～",
      "",
      "可以直接輸入：",
      "早餐180"
    ].join("\n");
  }

  const header = [`${compactPersonalText(details.ledger.name)}｜支出明細`, ""];
  const displayed: string[] = [];

  for (const expense of details.expenses.slice(0, PERSONAL_DETAIL_MAX_ITEMS)) {
    const line = formatPersonalExpenseDetailLine(displayed.length + 1, expense);
    const remaining = details.totalExpenseCount - displayed.length - 1;
    const preview = [
      ...header,
      ...displayed,
      line,
      "",
      `共 ${details.totalExpenseCount} 筆`,
      `總支出：$${formatPersonalAmount(details.ledger.totalExpenseCents)}`,
      ...(remaining > 0 ? [`尚有 ${remaining} 筆未顯示。`] : [])
    ].join("\n");

    if (preview.length > PERSONAL_DETAIL_MAX_LENGTH) {
      break;
    }
    displayed.push(line);
  }

  const remaining = details.totalExpenseCount - displayed.length;
  return [
    ...header,
    ...displayed,
    "",
    `共 ${details.totalExpenseCount} 筆`,
    `總支出：$${formatPersonalAmount(details.ledger.totalExpenseCents)}`,
    ...(remaining > 0 ? [`尚有 ${remaining} 筆未顯示。`] : [])
  ].join("\n");
}

export function formatPersonalExpenseDeleted(
  result: PersonalExpenseDeleteResult
) {
  const expense = result.deletedExpense;
  return [
    "已刪除上一筆 ✓",
    "",
    `${compactPersonalExpenseItem(expense.item)}｜$${formatPersonalAmount(expense.amountCents)}｜${normalizePersonalExpenseCategory(expense.category)}`,
    "",
    `目前共 ${result.ledger.expenseCount} 筆`,
    `目前支出：$${formatPersonalAmount(result.ledger.totalExpenseCents)}`
  ].join("\n");
}

export function getNoPersonalExpenseToDeleteText() {
  return "目前沒有可以刪除的支出～";
}

export function formatPersonalExpenseRecorded(
  result: PersonalExpenseBatchResult
) {
  const addedCents = result.expenses.reduce(
    (total, expense) => total + expense.amountCents,
    0
  );
  const expenseLines = result.expenses.map(
    (expense) => `${compactPersonalExpenseItem(expense.item)}｜$${formatPersonalAmount(expense.amountCents)}`
  );

  if (result.expenses.length === 1) {
    return [
      "已記錄 ✓",
      "",
      expenseLines[0]!,
      "",
      `本次累計：$${formatPersonalAmount(result.ledger.totalExpenseCents)}`
    ].join("\n");
  }

  const header = [`已記錄 ${result.expenses.length} 筆 ✓`, ""];
  const summary = [
    "",
    `本次新增：$${formatPersonalAmount(addedCents)}`,
    `本次累計：$${formatPersonalAmount(result.ledger.totalExpenseCents)}`
  ];
  const displayed: string[] = [];

  for (const line of expenseLines) {
    const remaining = expenseLines.length - displayed.length - 1;
    const preview = [
      ...header,
      ...displayed,
      line,
      ...(remaining > 0 ? [`尚有 ${remaining} 筆已記錄但未逐筆顯示。`] : []),
      ...summary
    ].join("\n");

    if (preview.length > PERSONAL_EXPENSE_RECORDED_MAX_LENGTH) {
      break;
    }
    displayed.push(line);
  }

  const remaining = expenseLines.length - displayed.length;
  return [
    ...header,
    ...displayed,
    ...(remaining > 0 ? [`尚有 ${remaining} 筆已記錄但未逐筆顯示。`] : []),
    ...summary
  ].join("\n");
}

export function formatPersonalExpenseValidationError(error: string) {
  const prefix = ["這筆支出沒有記錄。", ""].join("\n");
  const available = PERSONAL_EXPENSE_RECORDED_MAX_LENGTH - prefix.length - 1;
  const safeError = error.length <= available
    ? error
    : `${error.slice(0, Math.max(0, available - 1))}…`;
  return [prefix, safeError].join("\n");
}

export function getPersonalExpenseSaveError() {
  return "個人支出暫時無法儲存，這次沒有寫入任何資料，請稍後再試。";
}
