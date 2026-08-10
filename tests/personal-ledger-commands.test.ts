import assert from "node:assert/strict";
import test from "node:test";

import { getPersonalAccountingMenuText } from "../lib/personal-ledger/formatter.ts";
import { parseLineCommand } from "../lib/line/parser.ts";
import {
  resolvePersonalAccountingNumericCommand,
  resolvePersonalAccountingShortcut
} from "../lib/commands/menu-shortcuts.ts";
import { shouldTreatAsPersonalLedgerNameInput } from "../lib/personal-ledger/routing.ts";

const expectedMenu = [
  "大人要記點花費嗎？小二替您記著～",
  "",
  "1. 開始記帳",
  "2. 查看本次花費",
  "3. 查看明細",
  "4. 刪除上一筆",
  "5. 結束記帳",
  "6. 查看歷史記帳"
].join("\n");

test("all personal accounting entry aliases open the same menu", () => {
  for (const command of ["記帳", "個人記帳", "隨身記帳"]) {
    assert.deepEqual(parseLineCommand(command), {
      kind: "personal-ledger-menu"
    });
  }
  assert.equal(getPersonalAccountingMenuText(), expectedMenu);
});

test("personal accounting shortcuts stay in their own menu context", () => {
  assert.deepEqual(resolvePersonalAccountingShortcut(1), {
    kind: "personal-ledger-start"
  });
  assert.deepEqual(resolvePersonalAccountingShortcut(2), {
    kind: "personal-ledger-current"
  });
  assert.deepEqual(resolvePersonalAccountingShortcut(3), {
    kind: "personal-ledger-details"
  });
  assert.deepEqual(resolvePersonalAccountingShortcut(4), {
    kind: "personal-ledger-delete-last"
  });
  assert.deepEqual(resolvePersonalAccountingShortcut(5), {
    kind: "personal-ledger-end"
  });
  assert.deepEqual(resolvePersonalAccountingShortcut(6), {
    kind: "personal-ledger-history"
  });
});

test("personal accounting context claims numeric options before legacy routing", () => {
  const expectedKinds = [
    "personal-ledger-start",
    "personal-ledger-current",
    "personal-ledger-details",
    "personal-ledger-delete-last",
    "personal-ledger-end",
    "personal-ledger-history"
  ];

  for (const [index, expectedKind] of expectedKinds.entries()) {
    const number = index + 1;
    const command = { kind: "shortcut", number } as const;
    const resolved = resolvePersonalAccountingNumericCommand({
      chatType: "user",
      menuMode: "personal-accounting",
      command,
      hasPersonalPendingAction: false
    });

    assert.equal(resolved?.kind, expectedKind, `personal option ${number}`);
    assert.notEqual(resolved?.kind, "start-payment-setup");
  }
});

test("personal pending actions retain priority over personal numeric shortcuts", () => {
  const command = { kind: "shortcut", number: 1 } as const;

  assert.equal(
    resolvePersonalAccountingNumericCommand({
      chatType: "user",
      menuMode: "personal-accounting",
      command,
      hasPersonalPendingAction: true
    }),
    null
  );
  assert.equal(shouldTreatAsPersonalLedgerNameInput(command), true);
});

test("legacy numeric routing remains available outside personal context", () => {
  const command = { kind: "shortcut", number: 1 } as const;

  for (const menuMode of [null, "xiaoer", "settlement"] as const) {
    assert.equal(
      resolvePersonalAccountingNumericCommand({
        chatType: "user",
        menuMode,
        command,
        hasPersonalPendingAction: false
      }),
      null
    );
  }
});

test("explicit lifecycle commands route to personal accounting", () => {
  assert.deepEqual(parseLineCommand("開始記帳"), {
    kind: "personal-ledger-start"
  });
  assert.deepEqual(parseLineCommand("查看本次花費"), {
    kind: "personal-ledger-current"
  });
  assert.deepEqual(parseLineCommand("結束記帳"), {
    kind: "personal-ledger-end"
  });
  assert.deepEqual(parseLineCommand("查看歷史記帳"), {
    kind: "personal-ledger-history"
  });
});

test("existing split-bill commands are not routed into personal accounting", () => {
  const commands = new Map([
    ["建立活動", "create-ledger-help"],
    ["+", "join-activity"],
    ["-", "leave-activity"],
    ["確認成員", "confirm-members"],
    ["設定收款", "start-payment-setup"],
    ["新增支出", "expense-help"],
    ["查看支出", "recent-expenses"],
    ["刪除支出", "delete-last-expense"],
    ["查看目前結算", "current-settlement"],
    ["帳本結算", "ledger-settlement"],
    ["代墊 MVP", "mvp"],
    ["結束活動並封存帳本", "archive-ledger"],
    ["查看帳本", "list-ledgers"]
  ]);

  for (const [input, kind] of commands) {
    assert.equal(parseLineCommand(input).kind, kind, input);
  }
  assert.deepEqual(parseLineCommand("刪除上一筆"), {
    kind: "delete-last-expense"
  });
  assert.deepEqual(parseLineCommand("查看明細"), { kind: "ignored" });
});

test("plain expense-like text is not interpreted as a personal command", () => {
  assert.deepEqual(parseLineCommand("午餐200"), { kind: "ignored" });
});
