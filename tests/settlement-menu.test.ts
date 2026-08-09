import assert from "node:assert/strict";
import test from "node:test";

import { getSettlementMenuText } from "../lib/commands/help.ts";
import { resolveSettlementShortcut } from "../lib/commands/menu-shortcuts.ts";

test("settlement menu exposes 查看帳本 as option 5", () => {
  assert.match(getSettlementMenuText(), /^5\. 查看帳本$/mu);
});

test("settlement shortcut 5 routes to the existing ledger list command", () => {
  assert.deepEqual(resolveSettlementShortcut(5), { kind: "list-ledgers" });
});

test("existing settlement shortcuts 1 through 4 remain unchanged", () => {
  assert.deepEqual(resolveSettlementShortcut(1), { kind: "current-settlement" });
  assert.deepEqual(resolveSettlementShortcut(2), { kind: "ledger-settlement" });
  assert.deepEqual(resolveSettlementShortcut(3), { kind: "mvp" });
  assert.deepEqual(resolveSettlementShortcut(4), { kind: "archive-ledger" });
});
