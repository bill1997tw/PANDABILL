CREATE TABLE "TravelCloudSyncJob" (
    "id" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "localEntryId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelCloudSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TravelCloudSyncJob_entryType_localEntryId_key"
ON "TravelCloudSyncJob"("entryType", "localEntryId");

CREATE INDEX "TravelCloudSyncJob_status_nextAttemptAt_idx"
ON "TravelCloudSyncJob"("status", "nextAttemptAt");
