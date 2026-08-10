import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPersonalExpense,
  normalizePersonalExpenseCategory
} from "../lib/personal-ledger/category.ts";

for (const [item, category] of [
  ["早餐", "餐飲"],
  ["午餐", "餐飲"],
  ["咖啡", "餐飲"],
  ["Grab", "交通"],
  ["捷運", "交通"],
  ["機票", "交通"],
  ["飯店", "住宿"],
  ["Airbnb", "住宿"],
  ["電影票", "娛樂"],
  ["門票", "娛樂"],
  ["伴手禮", "購物"],
  ["完全未知品項", "其他"],
  ["gRaB airport", "交通"],
  ["便利商店早餐", "餐飲"]
] as const) {
  test(`${item} is classified as ${category}`, () => {
    assert.equal(classifyPersonalExpense(item), category);
  });
}

test("legacy null or unknown category displays as 其他", () => {
  assert.equal(normalizePersonalExpenseCategory(null), "其他");
  assert.equal(normalizePersonalExpenseCategory(""), "其他");
  assert.equal(normalizePersonalExpenseCategory("舊分類"), "其他");
});
