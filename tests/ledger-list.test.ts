import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLedgerListItem,
  getConfirmedParticipantCount,
  indexLedgerExpenseTotals
} from "../lib/ledger-list.ts";

test("archived ledger displays its expense count and total", () => {
  assert.equal(
    formatLedgerListItem({
      name: "0808看電影",
      status: "已封存",
      expenseCount: 6,
      totalExpenseCents: 697700,
      confirmedParticipantCount: 3
    }),
    "0808看電影｜已封存｜6 筆支出 ｜ 總支出金額 $6,977 ｜ 本次活動共 3 人分攤"
  );
});

test("ledger with no expenses displays a zero total", () => {
  assert.equal(
    formatLedgerListItem({
      name: "空白帳本",
      status: "進行中",
      expenseCount: 0,
      totalExpenseCents: 0,
      confirmedParticipantCount: 1
    }),
    "空白帳本｜進行中｜0 筆支出 ｜ 總支出金額 $0 ｜ 本次活動共 1 人分攤"
  );
});

test("participant count uses the finalized active ledger participants", () => {
  assert.equal(
    getConfirmedParticipantCount({
      isCollectingMembers: false,
      participantCount: 3
    }),
    3
  );
});

test("unconfirmed or missing legacy participant data is not fabricated", () => {
  assert.equal(
    getConfirmedParticipantCount({
      isCollectingMembers: true,
      participantCount: 3
    }),
    null
  );
  assert.equal(
    getConfirmedParticipantCount({
      isCollectingMembers: false,
      participantCount: 0
    }),
    null
  );
});

test("missing legacy participant data displays the safe fallback", () => {
  assert.equal(
    formatLedgerListItem({
      name: "舊帳本",
      status: "已封存",
      expenseCount: 2,
      totalExpenseCents: 95000,
      confirmedParticipantCount: null
    }),
    "舊帳本｜已封存｜2 筆支出 ｜ 總支出金額 $950 ｜ 本次活動參與人數未知"
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
