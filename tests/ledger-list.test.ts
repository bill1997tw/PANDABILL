import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLedgerListItem,
  indexLedgerExpenseTotals
} from "../lib/ledger-list.ts";

test("archived ledger displays its expense count and total", () => {
  assert.equal(
    formatLedgerListItem({
      name: "0808看電影",
      status: "已封存",
      expenseCount: 6,
      totalExpenseCents: 128000
    }),
    "0808看電影｜已封存｜6 筆支出 / 總支出金額 $1,280"
  );
});

test("ledger with no expenses displays a zero total", () => {
  assert.equal(
    formatLedgerListItem({
      name: "空白帳本",
      status: "進行中",
      expenseCount: 0,
      totalExpenseCents: 0
    }),
    "空白帳本｜進行中｜0 筆支出 / 總支出金額 $0"
  );
});

test("total is the sum of all expenses belonging to the ledger", () => {
  const totals = indexLedgerExpenseTotals([
    { ledgerId: "ledger-a", amountCents: 10000 },
    { ledgerId: "ledger-a", amountCents: 18000 },
    { ledgerId: "ledger-a", amountCents: 20000 },
    { ledgerId: "ledger-a", amountCents: 25000 },
    { ledgerId: "ledger-a", amountCents: 30000 },
    { ledgerId: "ledger-a", amountCents: 25000 }
  ]);

  assert.equal(totals.get("ledger-a"), 128000);
});

test("expenses from another ledger are not included", () => {
  const totals = indexLedgerExpenseTotals([
    { ledgerId: "ledger-a", amountCents: 128000 },
    { ledgerId: "ledger-b", amountCents: 9900 }
  ]);

  assert.equal(totals.get("ledger-a"), 128000);
  assert.equal(totals.get("ledger-b"), 9900);
  assert.equal(totals.get("ledger-with-no-expenses") ?? 0, 0);
});
