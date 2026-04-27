DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GroupStatus') THEN
    CREATE TYPE "GroupStatus" AS ENUM ('active', 'inactive');
  END IF;
END $$;

ALTER TABLE "Group"
ADD COLUMN IF NOT EXISTS "lineGroupId" TEXT,
ADD COLUMN IF NOT EXISTS "status" "GroupStatus" NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS "currentSessionId" TEXT,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Group"
SET "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP);

UPDATE "Group" g
SET "lineGroupId" = CASE
  WHEN lb."chatType" = 'room' THEN CONCAT('room:', lb."chatId")
  ELSE lb."chatId"
END
FROM "LineChatBinding" lb
WHERE lb."groupId" = g."id"
  AND g."lineGroupId" IS NULL;

UPDATE "Group" g
SET "currentSessionId" = active_ledger."id"
FROM (
  SELECT DISTINCT ON ("groupId") "id", "groupId"
  FROM "Ledger"
  WHERE "isActive" = true
  ORDER BY "groupId", "updatedAt" DESC
) AS active_ledger
WHERE active_ledger."groupId" = g."id"
  AND g."currentSessionId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Group_lineGroupId_key" ON "Group"("lineGroupId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Group_currentSessionId_fkey'
      AND table_name = 'Group'
  ) THEN
    ALTER TABLE "Group"
    ADD CONSTRAINT "Group_currentSessionId_fkey"
    FOREIGN KEY ("currentSessionId") REFERENCES "Ledger"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
