-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT NOT NULL,
    "handles" JSONB NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'average',
    "mode" TEXT NOT NULL DEFAULT 'mock',
    "state" TEXT NOT NULL DEFAULT 'queued',
    "config" JSONB NOT NULL,
    "report" JSONB,
    "cacheKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CollectorRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" DATETIME,
    "result" JSONB,
    "raw" JSONB,
    "costUsd" REAL,
    "error" TEXT,
    CONSTRAINT "CollectorRun_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "value" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "industry" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "postsTarget" REAL NOT NULL,
    "engagementTarget" REAL NOT NULL,
    "followerLow" REAL NOT NULL,
    "followerHigh" REAL NOT NULL,
    "reviewLow" REAL NOT NULL,
    "reviewHigh" REAL NOT NULL,
    "placeholder" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ServiceMapping" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "service" TEXT NOT NULL,
    "explanation" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resetAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AccuracyRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "results" JSONB NOT NULL,
    "costUsd" REAL
);

-- CreateIndex
CREATE INDEX "Audit_cacheKey_createdAt_idx" ON "Audit"("cacheKey", "createdAt");

-- CreateIndex
CREATE INDEX "CollectorRun_state_leaseUntil_idx" ON "CollectorRun"("state", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CollectorRun_auditId_platform_key" ON "CollectorRun"("auditId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Benchmark_industry_platform_key" ON "Benchmark"("industry", "platform");
