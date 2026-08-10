import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260809160000_add_personal_ledgers/migration.sql",
    import.meta.url
  ),
  "utf8"
);

test("personal ledger migration is additive and enforces one active ledger per user", () => {
  assert.match(migration, /CREATE TABLE "PersonalLedger"/u);
  assert.match(migration, /CREATE TABLE "PersonalExpense"/u);
  assert.match(migration, /CREATE TABLE "PersonalLedgerPendingAction"/u);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "PersonalLedger_one_active_per_user_key"[\s\S]*ON "PersonalLedger"\("lineUserId"\)[\s\S]*WHERE "status" = 'active';/u
  );
  assert.match(
    migration,
    /FOREIGN KEY \("ledgerId"\) REFERENCES "PersonalLedger"\("id"\) ON DELETE CASCADE/u
  );
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Group|Ledger|Expense)"/u);
});
