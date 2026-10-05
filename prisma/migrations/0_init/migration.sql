-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectorRun" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "result" JSONB,
    "raw" JSONB,
    "costUsd" DOUBLE PRECISION,
    "error" TEXT,

    CONSTRAINT "CollectorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "value" JSONB NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "postsTarget" DOUBLE PRECISION NOT NULL,
    "engagementTarget" DOUBLE PRECISION NOT NULL,
    "followerLow" DOUBLE PRECISION NOT NULL,
    "followerHigh" DOUBLE PRECISION NOT NULL,
    "reviewLow" DOUBLE PRECISION NOT NULL,
    "reviewHigh" DOUBLE PRECISION NOT NULL,
    "placeholder" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceMapping" (
    "key" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "ServiceMapping_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AccuracyRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'live',
    "results" JSONB NOT NULL,
    "costUsd" DOUBLE PRECISION,

    CONSTRAINT "AccuracyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccuracyItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "followers" INTEGER,
    "totalPosts" INTEGER,
    "lastPostAt" TEXT,
    "costUsd" DOUBLE PRECISION,
    "error" TEXT,
    "trueFollowers" INTEGER,
    "trueTotalPosts" INTEGER,
    "trueLastPostAt" TEXT,

    CONSTRAINT "AccuracyItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Audit_cacheKey_createdAt_idx" ON "Audit"("cacheKey", "createdAt");

-- CreateIndex
CREATE INDEX "CollectorRun_state_leaseUntil_idx" ON "CollectorRun"("state", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CollectorRun_auditId_platform_key" ON "CollectorRun"("auditId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Benchmark_industry_platform_key" ON "Benchmark"("industry", "platform");

-- CreateIndex
CREATE INDEX "AccuracyItem_state_leaseUntil_idx" ON "AccuracyItem"("state", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "AccuracyItem_runId_platform_handle_key" ON "AccuracyItem"("runId", "platform", "handle");

-- AddForeignKey
ALTER TABLE "CollectorRun" ADD CONSTRAINT "CollectorRun_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccuracyItem" ADD CONSTRAINT "AccuracyItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AccuracyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

