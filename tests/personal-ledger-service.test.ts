import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCurrentPersonalLedger,
  formatPersonalExpenseDeleted,
  formatPersonalExpenseDetails,
  formatPersonalExpenseRecorded,
  formatPersonalLedgerEnded,
  formatPersonalLedgerHistory,
  formatPersonalExpenseValidationError,
  getNoActivePersonalLedgerText
} from "../lib/personal-ledger/formatter.ts";
import { parsePersonalExpenseMessage } from "../lib/personal-ledger/expense-parser.ts";
import { createPersonalLedgerService } from "../lib/personal-ledger/service-core.ts";
import {
  createEmptyPersonalCategoryTotals,
  indexPersonalExpenseSummaries,
  summarizePersonalExpenses
} from "../lib/personal-ledger/summary.ts";
import type {
  PersonalLedgerRepository,
  PersonalLedgerCategorySummary,
  PersonalLedgerSummary,
  PersonalExpenseRecord
} from "../lib/personal-ledger/types.ts";

function createMemoryRepository() {
  const records: PersonalLedgerSummary[] = [];
  const storedExpenses: PersonalExpenseRecord[] = [];
  let sequence = 0;
  let expenseSequence = 0;

  function refreshLedgerSummary(ledger: PersonalLedgerSummary) {
    const ledgerExpenses = storedExpenses.filter(
      (expense) => expense.ledgerId === ledger.id
    );
    ledger.expenseCount = ledgerExpenses.length;
    ledger.totalExpenseCents = ledgerExpenses.reduce(
      (total, expense) => total + expense.amountCents,
      0
    );
  }

  const repository: PersonalLedgerRepository = {
    async findActive(lineUserId) {
      return records.find(
        (ledger) => ledger.lineUserId === lineUserId && ledger.status === "active"
      ) ?? null;
    },

    async create(lineUserId, name) {
      sequence += 1;
      const createdAt = new Date(Date.UTC(2026, 7, 9, 0, 0, sequence));
      const ledger: PersonalLedgerSummary = {
        id: `ledger-${sequence}`,
        lineUserId,
        name,
        status: "active",
        createdAt,
        updatedAt: createdAt,
        endedAt: null,
        expenseCount: 0,
        totalExpenseCents: 0
      };
      records.push(ledger);
      return ledger;
    },

    async end(lineUserId, ledgerId, endedAt) {
      const ledger = records.find(
        (candidate) =>
          candidate.id === ledgerId &&
          candidate.lineUserId === lineUserId &&
          candidate.status === "active"
      );
      if (!ledger) {
        return null;
      }
      ledger.status = "ended";
      ledger.endedAt = endedAt;
      ledger.updatedAt = endedAt;
      const expenses = storedExpenses.filter(
        (expense) => expense.ledgerId === ledger.id
      );
      return {
        ...ledger,
        ...summarizePersonalExpenses(expenses)
      };
    },

    async listByUser(lineUserId) {
      return records
        .filter((ledger) => ledger.lineUserId === lineUserId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    },

    async createExpensesForActiveLedger(lineUserId, ledgerId, expenses) {
      const ledger = records.find(
        (candidate) =>
          candidate.id === ledgerId &&
          candidate.lineUserId === lineUserId &&
          candidate.status === "active"
      );
      if (!ledger) {
        return null;
      }

      if (expenses.some((expense) => expense.item === "FAIL")) {
        throw new Error("simulated atomic failure");
      }

      storedExpenses.push(...expenses.map((expense) => {
        expenseSequence += 1;
        const createdAt = new Date(
          Date.UTC(2026, 7, 9, 1, 0, expenseSequence)
        );
        return {
          id: `expense-${expenseSequence}`,
          ledgerId,
          lineUserId,
          ...expense,
          spentAt: createdAt,
          createdAt
        };
      }));
      refreshLedgerSummary(ledger);

      return { expenses, ledger };
    },

    async listExpensesForActiveLedger(lineUserId, ledgerId, limit) {
      const ledger = records.find(
        (candidate) =>
          candidate.id === ledgerId &&
          candidate.lineUserId === lineUserId &&
          candidate.status === "active"
      );
      if (!ledger) {
        return null;
      }
      const expenses = storedExpenses
        .filter(
          (expense) =>
            expense.ledgerId === ledgerId && expense.lineUserId === lineUserId
        )
        .sort((left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id)
        );
      refreshLedgerSummary(ledger);
      return {
        ledger,
        expenses: expenses.slice(0, limit),
        totalExpenseCount: expenses.length
      };
    },

    async deleteLatestExpenseFromActiveLedger(lineUserId, ledgerId) {
      const ledger = records.find(
        (candidate) =>
          candidate.id === ledgerId &&
          candidate.lineUserId === lineUserId &&
          candidate.status === "active"
      );
      if (!ledger) {
        return null;
      }
      const candidates = storedExpenses
        .filter(
          (expense) =>
            expense.ledgerId === ledgerId && expense.lineUserId === lineUserId
        )
        .sort((left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id)
        );
      const latest = candidates[0];
      if (!latest) {
        return null;
      }
      storedExpenses.splice(
        storedExpenses.findIndex((expense) => expense.id === latest.id),
        1
      );
      refreshLedgerSummary(ledger);
      return { deletedExpense: latest, ledger };
    },

    async getLedgerCategorySummary(lineUserId, ledgerId) {
      const ledger = records.find(
        (candidate) =>
          candidate.id === ledgerId && candidate.lineUserId === lineUserId
      );
      if (!ledger) {
        return null;
      }
      const expenses = storedExpenses.filter(
        (expense) =>
          expense.ledgerId === ledgerId && expense.lineUserId === lineUserId
      );
      return {
        ...ledger,
        ...summarizePersonalExpenses(expenses)
      };
    }
  };

  return { repository, records, storedExpenses };
}

test("personal ledger lifecycle persists data and isolates it by LINE user", async () => {
  const { repository, records } = createMemoryRepository();
  const service = createPersonalLedgerService(repository);

  const first = await service.start("user-a", " 0813吉隆坡 ");
  assert.equal(first.status, "created");
  assert.equal(first.ledger.name, "0813吉隆坡");
  assert.equal(records.length, 1);
  assert.equal(records[0]?.lineUserId, "user-a");
  assert.equal(await service.getCurrent("user-b"), null);
  assert.deepEqual(await service.listHistory("user-b"), []);

  const duplicate = await service.start("user-a", "不應建立");
  assert.equal(duplicate.status, "already-active");
  assert.equal(duplicate.ledger.id, first.ledger.id);
  assert.equal(records.length, 1);

  assert.equal((await service.getCurrent("user-a"))?.id, first.ledger.id);
  const ended = await service.end("user-a", first.ledger.id);
  assert.equal(ended?.status, "ended");
  assert.equal(await service.getCurrent("user-a"), null);

  const second = await service.start("user-a", "週末花蓮");
  assert.equal(second.status, "created");
  assert.notEqual(second.ledger.id, first.ledger.id);

  const history = await service.listHistory("user-a");
  assert.deepEqual(history.map((ledger) => ledger.name), [
    "週末花蓮",
    "0813吉隆坡"
  ]);
  assert.ok(history.every((ledger) => ledger.lineUserId === "user-a"));
});

test("current, empty, ended, and history messages use persisted summaries", () => {
  const ledger: PersonalLedgerCategorySummary = {
    id: "ledger-a",
    lineUserId: "user-a",
    name: "日本四天",
    status: "active",
    createdAt: new Date("2026-08-09T00:00:00Z"),
    updatedAt: new Date("2026-08-09T00:00:00Z"),
    endedAt: null,
    expenseCount: 3,
    totalExpenseCents: 53000,
    categoryTotals: {
      ...createEmptyPersonalCategoryTotals(),
      餐飲: 18000,
      交通: 35000
    }
  };

  assert.equal(
    formatCurrentPersonalLedger(ledger),
    "日本四天\n\n目前共 3 筆\n目前支出：$530\n\n分類統計：\n餐飲｜$180\n交通｜$350"
  );
  assert.match(getNoActivePersonalLedgerText(), /目前沒有進行中的個人記帳/u);
  assert.equal(
    formatPersonalLedgerEnded({ ...ledger, status: "ended" }),
    "「日本四天」已結束 ✓\n\n本次共記錄 3 筆\n總支出：$530\n\n分類統計：\n餐飲｜$180\n交通｜$350"
  );
  assert.equal(
    formatPersonalLedgerHistory([
      ledger,
      { ...ledger, id: "ledger-b", name: "逛街", status: "ended" }
    ]),
    "歷史記帳：\n\n1. 日本四天｜記帳中｜3 筆｜總支出 $530\n2. 逛街｜已結束｜3 筆｜總支出 $530"
  );
});

test("expense summaries aggregate only persisted rows from the same ledger", () => {
  const summaries = indexPersonalExpenseSummaries([
    { ledgerId: "ledger-a", amountCents: 12000 },
    { ledgerId: "ledger-a", amountCents: 41000 },
    { ledgerId: "ledger-b", amountCents: 99900 }
  ]);

  assert.deepEqual(summaries.get("ledger-a"), {
    count: 2,
    totalCents: 53000
  });
  assert.deepEqual(summaries.get("ledger-b"), {
    count: 1,
    totalCents: 99900
  });
  assert.equal(summaries.get("ledger-with-no-expenses")?.totalCents ?? 0, 0);
});

test("single and multiple personal expenses persist to the requesting user's active ledger", async () => {
  const { repository, storedExpenses } = createMemoryRepository();
  const service = createPersonalLedgerService(repository);
  const started = await service.start("user-a", "0813吉隆坡");

  const single = await service.addExpenses("user-a", [
    { item: "午餐", amountCents: 25000 }
  ]);
  assert.equal(single?.ledger.id, started.ledger.id);
  assert.equal(single?.ledger.expenseCount, 1);
  assert.equal(single?.ledger.totalExpenseCents, 25000);

  const multiple = await service.addExpenses("user-a", [
    { item: "捷運", amountCents: 3500 },
    { item: "Grab", amountCents: 22000 },
    { item: "咖啡", amountCents: 9500 }
  ]);
  assert.equal(multiple?.ledger.expenseCount, 4);
  assert.equal(multiple?.ledger.totalExpenseCents, 60000);
  assert.deepEqual(
    storedExpenses.map((expense) => expense.category),
    ["餐飲", "交通", "交通", "餐飲"]
  );
  assert.ok(
    storedExpenses.every(
      (expense) =>
        expense.ledgerId === started.ledger.id && expense.lineUserId === "user-a"
    )
  );

  const userBLedger = await service.start("user-b", "B 的帳本");
  assert.equal(
    await repository.createExpensesForActiveLedger(
      "user-a",
      userBLedger.ledger.id,
      [{ item: "不應寫入", amountCents: 10000, category: "其他" }]
    ),
    null
  );
  assert.equal(storedExpenses.length, 4);

  const currentSummary = await service.getCurrentSummary("user-a");
  assert.ok(currentSummary);
  assert.equal(
    formatCurrentPersonalLedger(currentSummary!),
    "0813吉隆坡\n\n目前共 4 筆\n目前支出：$600\n\n分類統計：\n餐飲｜$345\n交通｜$255"
  );
  assert.match(
    formatPersonalLedgerHistory(await service.listHistory("user-a")),
    /0813吉隆坡｜記帳中｜4 筆｜總支出 \$600/u
  );
});

test("failed multi-expense batch persists none of the batch", async () => {
  const { repository, storedExpenses } = createMemoryRepository();
  const service = createPersonalLedgerService(repository);
  await service.start("user-a", "原子測試");

  await assert.rejects(
    service.addExpenses("user-a", [
      { item: "早餐", amountCents: 18000 },
      { item: "FAIL", amountCents: 3500 },
      { item: "咖啡", amountCents: 9500 }
    ]),
    /simulated atomic failure/u
  );
  assert.equal(storedExpenses.length, 0);
});

test("personal expense responses use the persisted cumulative total", () => {
  const ledger: PersonalLedgerSummary = {
    id: "ledger-a",
    lineUserId: "user-a",
    name: "旅行",
    status: "active",
    createdAt: new Date("2026-08-09T00:00:00Z"),
    updatedAt: new Date("2026-08-09T00:00:00Z"),
    endedAt: null,
    expenseCount: 8,
    totalExpenseCents: 243000
  };

  assert.equal(
    formatPersonalExpenseRecorded({
      expenses: [{ item: "午餐", amountCents: 25000, category: "餐飲" }],
      ledger
    }),
    "已記錄 ✓\n\n午餐｜$250\n\n本次累計：$2,430"
  );

  assert.equal(
    formatPersonalExpenseRecorded({
      expenses: [
        { item: "早餐", amountCents: 18000, category: "餐飲" },
        { item: "捷運", amountCents: 3500, category: "交通" },
        { item: "Grab", amountCents: 22000, category: "交通" },
        { item: "咖啡", amountCents: 9500, category: "餐飲" }
      ],
      ledger
    }),
    "已記錄 4 筆 ✓\n\n早餐｜$180\n捷運｜$35\nGrab｜$220\n咖啡｜$95\n\n本次新增：$530\n本次累計：$2,430"
  );
});

test("details are owner-scoped, chronological, categorized, and use persisted totals", async () => {
  const { repository, storedExpenses } = createMemoryRepository();
  const service = createPersonalLedgerService(repository);
  await service.start("user-a", "0813吉隆坡");
  await service.start("user-b", "B 的旅行");
  await service.addExpenses("user-a", [
    { item: "早餐", amountCents: 18000 },
    { item: "Grab", amountCents: 22000 },
    { item: "神祕花費", amountCents: 128000 }
  ]);
  await service.addExpenses("user-b", [
    { item: "飯店", amountCents: 500000 }
  ]);
  storedExpenses.find((expense) => expense.item === "神祕花費")!.category = null;

  const result = await service.getDetails("user-a");
  assert.equal(result.status, "found");
  if (result.status !== "found") {
    return;
  }
  assert.deepEqual(
    result.details.expenses.map((expense) => expense.item),
    ["早餐", "Grab", "神祕花費"]
  );
  assert.ok(
    result.details.expenses.every((expense) => expense.lineUserId === "user-a")
  );
  assert.equal(result.details.totalExpenseCount, 3);
  assert.equal(result.details.ledger.totalExpenseCents, 168000);
  assert.equal(
    formatPersonalExpenseDetails(result.details),
    "0813吉隆坡｜支出明細\n\n1. 早餐｜$180｜餐飲\n2. Grab｜$220｜交通\n3. 神祕花費｜$1,280｜其他\n\n共 3 筆\n總支出：$1,680"
  );
});

test("details return correct empty and no-active states", async () => {
  const { repository } = createMemoryRepository();
  const service = createPersonalLedgerService(repository);

  assert.deepEqual(await service.getDetails("user-a"), {
    status: "no-active"
  });
  await service.start("user-a", "空白帳本");
  const result = await service.getDetails("user-a");
  assert.equal(result.status, "found");
  if (result.status === "found") {
    assert.equal(
      formatPersonalExpenseDetails(result.details),
      "空白帳本\n\n目前還沒有支出紀錄～\n\n可以直接輸入：\n早餐180"
    );
  }
});

test("large detail output is conservatively truncated with a remaining count", () => {
  const createdAt = new Date("2026-08-09T00:00:00Z");
  const ledger: PersonalLedgerSummary = {
    id: "ledger-large",
    lineUserId: "user-a",
    name: "大量支出",
    status: "active",
    createdAt,
    updatedAt: createdAt,
    endedAt: null,
    expenseCount: 60,
    totalExpenseCents: 600000
  };
  const expenses: PersonalExpenseRecord[] = Array.from(
    { length: 50 },
    (_, index) => ({
      id: `expense-${String(index).padStart(3, "0")}`,
      ledgerId: ledger.id,
      lineUserId: "user-a",
      item: `第 ${index + 1} 筆支出`,
      amountCents: 10000,
      category: "其他",
      spentAt: createdAt,
      createdAt
    })
  );
  const output = formatPersonalExpenseDetails({
    ledger,
    expenses,
    totalExpenseCount: 60
  });

  assert.ok(output.length <= 4_000);
  assert.match(output, /尚有 20 筆未顯示。/u);
  assert.doesNotMatch(output, /41\. 第 41 筆支出/u);
});

test("delete latest removes only the newest expense and recalculates persisted totals", async () => {
  const { repository, storedExpenses } = createMemoryRepository();
  const service = createPersonalLedgerService(repository);
  await service.start("user-a", "刪除測試");
  await service.start("user-b", "B 帳本");
  await service.addExpenses("user-a", [
    { item: "早餐", amountCents: 18000 },
    { item: "咖啡", amountCents: 9500 }
  ]);
  await service.addExpenses("user-b", [
    { item: "B 的午餐", amountCents: 30000 }
  ]);

  const deleted = await service.deleteLatestExpense("user-a");
  assert.equal(deleted.status, "deleted");
  if (deleted.status !== "deleted") {
    return;
  }
  assert.equal(deleted.result.deletedExpense.item, "咖啡");
  assert.equal(deleted.result.ledger.expenseCount, 1);
  assert.equal(deleted.result.ledger.totalExpenseCents, 18000);
  assert.deepEqual(
    storedExpenses.map((expense) => expense.item),
    ["早餐", "B 的午餐"]
  );
  assert.equal(
    formatPersonalExpenseDeleted(deleted.result),
    "已刪除上一筆 ✓\n\n咖啡｜$95｜餐飲\n\n目前共 1 筆\n目前支出：$180"
  );
});

test("delete returns safe empty states and never touches archived ledger expenses", async () => {
  const { repository, storedExpenses } = createMemoryRepository();
  const service = createPersonalLedgerService(repository);

  assert.deepEqual(await service.deleteLatestExpense("user-a"), {
    status: "no-active"
  });
  const active = await service.start("user-a", "即將封存");
  assert.deepEqual(await service.deleteLatestExpense("user-a"), {
    status: "empty"
  });
  await service.addExpenses("user-a", [
    { item: "保留支出", amountCents: 50000 }
  ]);
  await service.end("user-a", active.ledger.id);

  assert.deepEqual(await service.deleteLatestExpense("user-a"), {
    status: "no-active"
  });
  assert.equal(storedExpenses.length, 1);
  assert.equal(storedExpenses[0]?.item, "保留支出");
});

test("ending returns an archived persisted category summary and permits a new ledger", async () => {
  const { repository } = createMemoryRepository();
  const service = createPersonalLedgerService(repository);
  const started = await service.start("user-a", "最終摘要");
  await service.addExpenses("user-a", [
    { item: "午餐", amountCents: 25000 },
    { item: "Grab", amountCents: 22000 },
    { item: "未知費用", amountCents: 128000 }
  ]);

  const ended = await service.end("user-a", started.ledger.id);
  assert.equal(ended?.status, "ended");
  assert.equal(ended?.expenseCount, 3);
  assert.equal(ended?.totalExpenseCents, 175000);
  assert.equal(ended?.categoryTotals.餐飲, 25000);
  assert.equal(ended?.categoryTotals.交通, 22000);
  assert.equal(ended?.categoryTotals.其他, 128000);
  assert.equal(await service.getCurrentSummary("user-a"), null);

  const archivedSummary = await service.getLedgerSummary(
    "user-a",
    started.ledger.id
  );
  assert.deepEqual(archivedSummary?.categoryTotals, ended?.categoryTotals);
  assert.equal(
    await service.getLedgerSummary("user-b", started.ledger.id),
    null
  );

  const next = await service.start("user-a", "下一本");
  assert.equal(next.status, "created");
});

test("full parsed personal ledger flow archives persisted data and allows a second ledger", async () => {
  const { repository, storedExpenses } = createMemoryRepository();
  const service = createPersonalLedgerService(repository);
  const started = await service.start("user-a", "0813吉隆坡");

  for (const input of ["早餐180", "捷運35、Grab220、咖啡95"]) {
    const parsed = parsePersonalExpenseMessage(input);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.ok(await service.addExpenses("user-a", parsed.expenses));
  }

  const current = await service.getCurrentSummary("user-a");
  assert.equal(current?.expenseCount, 4);
  assert.equal(current?.totalExpenseCents, 53000);
  assert.equal(current?.categoryTotals.餐飲, 27500);
  assert.equal(current?.categoryTotals.交通, 25500);

  const details = await service.getDetails("user-a");
  assert.equal(details.status, "found");
  const deleted = await service.deleteLatestExpense("user-a");
  assert.equal(deleted.status, "deleted");
  assert.equal(deleted.status === "deleted" && deleted.result.deletedExpense.item, "咖啡");

  const ended = await service.end("user-a", started.ledger.id);
  assert.equal(ended?.status, "ended");
  assert.equal(ended?.expenseCount, 3);
  assert.equal(ended?.totalExpenseCents, 43500);
  assert.equal(await service.addExpenses("user-a", [
    { item: "午餐", amountCents: 20000 }
  ]), null);
  assert.equal(storedExpenses.length, 3);

  const next = await service.start("user-a", "下一本帳本");
  assert.equal(next.status, "created");
  assert.notEqual(next.ledger.id, started.ledger.id);
});

test("history and batch confirmations stay within conservative LINE text limits", () => {
  const createdAt = new Date("2026-08-09T00:00:00Z");
  const ledgers: PersonalLedgerSummary[] = Array.from({ length: 120 }, (_, index) => ({
    id: `ledger-${index}`,
    lineUserId: "user-a",
    name: `第 ${index + 1} 本 ${"很長的帳本名稱".repeat(20)}`,
    status: index === 0 ? "active" : "ended",
    createdAt,
    updatedAt: createdAt,
    endedAt: index === 0 ? null : createdAt,
    expenseCount: index,
    totalExpenseCents: index * 10000
  }));
  const history = formatPersonalLedgerHistory(ledgers);
  assert.ok(history.length <= 4_000);
  assert.match(history, /尚有 \d+ 本帳本未顯示。/u);

  const recorded = formatPersonalExpenseRecorded({
    expenses: Array.from({ length: 100 }, (_, index) => ({
      item: `第 ${index + 1} 筆 ${"很長的支出名稱".repeat(20)}`,
      amountCents: 10000,
      category: "其他" as const
    })),
    ledger: ledgers[0]!
  });
  assert.ok(recorded.length <= 4_000);
  assert.match(recorded, /尚有 \d+ 筆已記錄但未逐筆顯示。/u);
  assert.match(recorded, /本次新增：\$10,000/u);

  const invalid = formatPersonalExpenseValidationError("錯誤".repeat(3_000));
  assert.ok(invalid.length <= 4_000);
});
