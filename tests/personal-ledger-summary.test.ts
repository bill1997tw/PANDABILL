import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCurrentPersonalLedger,
  formatPersonalLedgerEnded
} from "../lib/personal-ledger/formatter.ts";
import {
  createEmptyPersonalCategoryTotals,
  summarizePersonalExpenses
} from "../lib/personal-ledger/summary.ts";
import type { PersonalLedgerCategorySummary } from "../lib/personal-ledger/types.ts";

test("zero expenses produce zero totals and no category values", () => {
  assert.deepEqual(summarizePersonalExpenses([]), {
    expenseCount: 0,
    totalExpenseCents: 0,
    categoryTotals: createEmptyPersonalCategoryTotals()
  });
});

test("category aggregation sums repeated categories and normalizes legacy values", () => {
  const summary = summarizePersonalExpenses([
    { amountCents: 18000, category: "餐飲" },
    { amountCents: 9500, category: "餐飲" },
    { amountCents: 3500, category: "交通" },
    { amountCents: 128000, category: "購物" },
    { amountCents: 2000, category: null },
    { amountCents: 3000, category: "舊分類" }
  ]);

  assert.equal(summary.expenseCount, 6);
  assert.equal(summary.totalExpenseCents, 164000);
  assert.equal(summary.categoryTotals.餐飲, 27500);
  assert.equal(summary.categoryTotals.交通, 3500);
  assert.equal(summary.categoryTotals.購物, 128000);
  assert.equal(summary.categoryTotals.其他, 5000);
  assert.equal(
    Object.values(summary.categoryTotals).reduce((total, value) => total + value, 0),
    summary.totalExpenseCents
  );
});

test("current summary omits zero categories and uses fixed category order", () => {
  const createdAt = new Date("2026-08-09T00:00:00Z");
  const ledger: PersonalLedgerCategorySummary = {
    id: "ledger-a",
    lineUserId: "user-a",
    name: "0813吉隆坡",
    status: "active",
    createdAt,
    updatedAt: createdAt,
    endedAt: null,
    expenseCount: 5,
    totalExpenseCents: 138000,
    categoryTotals: {
      餐飲: 53000,
      交通: 35000,
      住宿: 0,
      購物: 50000,
      娛樂: 0,
      其他: 0
    }
  };

  assert.equal(
    formatCurrentPersonalLedger(ledger),
    "0813吉隆坡\n\n目前共 5 筆\n目前支出：$1,380\n\n分類統計：\n餐飲｜$530\n交通｜$350\n購物｜$500"
  );
});

test("empty current ledger stays compact without an empty category section", () => {
  const createdAt = new Date("2026-08-09T00:00:00Z");
  const output = formatCurrentPersonalLedger({
    id: "ledger-empty",
    lineUserId: "user-a",
    name: "空白帳本",
    status: "active",
    createdAt,
    updatedAt: createdAt,
    endedAt: null,
    expenseCount: 0,
    totalExpenseCents: 0,
    categoryTotals: createEmptyPersonalCategoryTotals()
  });

  assert.equal(
    output,
    "空白帳本\n\n目前共 0 筆\n目前支出：$0\n\n目前還沒有支出紀錄～"
  );
  assert.doesNotMatch(output, /分類統計/u);
});

test("ended summary uses the same persisted category ordering and formatting", () => {
  const createdAt = new Date("2026-08-09T00:00:00Z");
  assert.equal(
    formatPersonalLedgerEnded({
      id: "ledger-ended",
      lineUserId: "user-a",
      name: "日本四天",
      status: "ended",
      createdAt,
      updatedAt: createdAt,
      endedAt: createdAt,
      expenseCount: 32,
      totalExpenseCents: 1258000,
      categoryTotals: {
        餐飲: 342000,
        交通: 215000,
        住宿: 300000,
        購物: 286000,
        娛樂: 85000,
        其他: 30000
      }
    }),
    "「日本四天」已結束 ✓\n\n本次共記錄 32 筆\n總支出：$12,580\n\n分類統計：\n餐飲｜$3,420\n交通｜$2,150\n住宿｜$3,000\n購物｜$2,860\n娛樂｜$850\n其他｜$300"
  );
});
