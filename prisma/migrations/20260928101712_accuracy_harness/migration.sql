-- CreateTable
CREATE TABLE "AccuracyItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" DATETIME,
    "followers" INTEGER,
    "totalPosts" INTEGER,
    "lastPostAt" TEXT,
    "costUsd" REAL,
    "error" TEXT,
    "trueFollowers" INTEGER,
    "trueTotalPosts" INTEGER,
    "trueLastPostAt" TEXT,
    CONSTRAINT "AccuracyItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AccuracyRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccuracyRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'live',
    "results" JSONB NOT NULL,
    "costUsd" REAL
);
INSERT INTO "new_AccuracyRun" ("costUsd", "createdAt", "id", "results") SELECT "costUsd", "createdAt", "id", "results" FROM "AccuracyRun";
DROP TABLE "AccuracyRun";
ALTER TABLE "new_AccuracyRun" RENAME TO "AccuracyRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AccuracyItem_state_leaseUntil_idx" ON "AccuracyItem"("state", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "AccuracyItem_runId_platform_handle_key" ON "AccuracyItem"("runId", "platform", "handle");
