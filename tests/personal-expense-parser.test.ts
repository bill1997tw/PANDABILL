import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePersonalExpenseLine,
  parsePersonalExpenseMessage
} from "../lib/personal-ledger/expense-parser.ts";
import { shouldRoutePersonalExpense } from "../lib/personal-ledger/routing.ts";

for (const [input, item, amountCents] of [
  ["早餐 180", "早餐", 18000],
  ["早餐180", "早餐", 18000],
  ["午餐 $250", "午餐", 25000],
  ["午餐$250", "午餐", 25000],
  ["Grab 220", "Grab", 22000],
  ["捷運35", "捷運", 3500],
  ["電影票 320", "電影票", 32000],
  ["便利商店 127", "便利商店", 12700]
] as const) {
  test(`parses a clear personal expense: ${input}`, () => {
    assert.deepEqual(parsePersonalExpenseLine(input), {
      ok: true,
      expenses: [{ item, amountCents }]
    });
  });
}

test("accepts properly grouped thousands in the amount", () => {
  assert.deepEqual(parsePersonalExpenseLine("飯店 12,580"), {
    ok: true,
    expenses: [{ item: "飯店", amountCents: 1258000 }]
  });
});

test("parses newline and Chinese-delimited expense batches", () => {
  const expected = {
    ok: true,
    expenses: [
      { item: "早餐", amountCents: 18000 },
      { item: "捷運", amountCents: 3500 },
      { item: "Grab", amountCents: 22000 },
      { item: "咖啡", amountCents: 9500 }
    ]
  };

  assert.deepEqual(
    parsePersonalExpenseMessage("早餐180\n捷運35\nGrab220\n咖啡95"),
    expected
  );
  assert.deepEqual(
    parsePersonalExpenseMessage("早餐180、捷運35、Grab220、咖啡95"),
    expected
  );
});

for (const input of [
  "早餐",
  "200",
  "午餐 abc",
  "測試 -200",
  "咖啡 0",
  "咖啡 1,,000",
  "今天大概花了200左右"
]) {
  test(`rejects unsafe or invalid input: ${input}`, () => {
    assert.equal(parsePersonalExpenseMessage(input).ok, false);
  });
}

test("an invalid line rejects the entire multi-expense message", () => {
  const result = parsePersonalExpenseMessage("早餐180\n不知道\n咖啡95");
  assert.equal(result.ok, false);
});

test("personal routing requires private chat, active ledger, and personal context", () => {
  assert.equal(
    shouldRoutePersonalExpense({
      chatType: "user",
      menuMode: "personal-accounting",
      hasActiveLedger: true
    }),
    true
  );
  assert.equal(
    shouldRoutePersonalExpense({
      chatType: "user",
      menuMode: "personal-accounting",
      hasActiveLedger: false
    }),
    false
  );
  assert.equal(
    shouldRoutePersonalExpense({
      chatType: "user",
      menuMode: "xiaoer",
      hasActiveLedger: true
    }),
    false
  );
  assert.equal(
    shouldRoutePersonalExpense({
      chatType: "group",
      menuMode: "personal-accounting",
      hasActiveLedger: true
    }),
    false
  );
});
