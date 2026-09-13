-- PULSE initial schema migration.
--
-- This file was authored by hand and applied directly via psql because the
-- sandbox this project was built in cannot reach binaries.prisma.sh (only
-- npm/pip/github registries are allowlisted there), so `prisma migrate dev`
-- could not run. It was verified against a real, running PostgreSQL 16
-- instance - see ml/README.md sibling note in the top-level README for the
-- verification steps and output.
--
-- IMPORTANT: once you have normal network access (your own machine, CI, or
-- a Vercel build), delete this hand-written file and generate the real one:
--   rm -rf prisma/migrations
--   npx prisma migrate dev --name init
-- Prisma will read schema.prisma and generate an equivalent (likely
-- identical) migration - this file is a verified stand-in, not a
-- replacement for Prisma's own migration history.

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "Role" AS ENUM ('ADMIN', 'ANALYST', 'CS_MANAGER', 'VIEWER');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'CHURNED');

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "signupDate" TIMESTAMP(3) NOT NULL,
    "contractType" TEXT NOT NULL,
    "subscriptionType" TEXT NOT NULL,
    "monthlyRevenue" DECIMAL(10,2) NOT NULL,
    "region" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "churnDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");
CREATE INDEX "Customer_status_idx" ON "Customer"("status");
CREATE INDEX "Customer_subscriptionType_idx" ON "Customer"("subscriptionType");

CREATE TABLE "CustomerEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    CONSTRAINT "CustomerEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerEvent_customerId_occurredAt_idx" ON "CustomerEvent"("customerId", "occurredAt");
CREATE INDEX "CustomerEvent_eventType_idx" ON "CustomerEvent"("eventType");

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Transaction_customerId_occurredAt_idx" ON "Transaction"("customerId", "occurredAt");

CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "responseTimeHours" DOUBLE PRECISION,
    "resolutionTimeHours" DOUBLE PRECISION,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "repeatTicket" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportTicket_customerId_openedAt_idx" ON "SupportTicket"("customerId", "openedAt");
CREATE INDEX "SupportTicket_resolved_idx" ON "SupportTicket"("resolved");

CREATE TYPE "MessageSender" AS ENUM ('CUSTOMER', 'AGENT');

CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportMessage_ticketId_sentAt_idx" ON "SupportMessage"("ticketId", "sentAt");

CREATE TYPE "SentimentLabel" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

CREATE TABLE "SentimentResult" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ticketId" TEXT,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentimentLabel" "SentimentLabel" NOT NULL,
    "sentimentScore" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SentimentResult_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SentimentResult_customerId_occurredAt_idx" ON "SentimentResult"("customerId", "occurredAt");
CREATE INDEX "SentimentResult_sentimentLabel_idx" ON "SentimentResult"("sentimentLabel");

CREATE TABLE "CustomerFeatureSnapshot" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "featureVersion" TEXT NOT NULL,
    "loginCount30d" INTEGER NOT NULL,
    "featureUseCount30d" INTEGER NOT NULL,
    "daysSinceLastActivity" INTEGER NOT NULL,
    "usageTrend30vsPrior30" DOUBLE PRECISION NOT NULL,
    "avgSentiment90d" DOUBLE PRECISION,
    "negativeSentimentRatio90d" DOUBLE PRECISION,
    "sentimentChange30d" DOUBLE PRECISION,
    "unresolvedTicketCount" INTEGER NOT NULL,
    "avgResolutionTimeHours90d" DOUBLE PRECISION,
    "revenue90d" DECIMAL(10,2) NOT NULL,
    "refundCount90d" INTEGER NOT NULL,
    "refundRate90d" DOUBLE PRECISION NOT NULL,
    "tenureDaysAtSnapshot" INTEGER NOT NULL,
    "rawFeatures" JSONB NOT NULL,
    CONSTRAINT "CustomerFeatureSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerFeatureSnapshot_customerId_snapshotDate_featureVer_key" ON "CustomerFeatureSnapshot"("customerId", "snapshotDate", "featureVersion");
CREATE INDEX "CustomerFeatureSnapshot_customerId_snapshotDate_idx" ON "CustomerFeatureSnapshot"("customerId", "snapshotDate");

CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "churnProbability" DOUBLE PRECISION NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "recommendedThreshold" DOUBLE PRECISION NOT NULL,
    "predictedAt" TIMESTAMP(3) NOT NULL,
    "topContributors" JSONB NOT NULL,
    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Prediction_customerId_key" ON "Prediction"("customerId");
CREATE INDEX "Prediction_riskLevel_idx" ON "Prediction"("riskLevel");
CREATE INDEX "Prediction_churnProbability_idx" ON "Prediction"("churnProbability");

CREATE TABLE "PredictionHistory" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "churnProbability" DOUBLE PRECISION NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "predictedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PredictionHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PredictionHistory_customerId_predictedAt_idx" ON "PredictionHistory"("customerId", "predictedAt");

CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "characteristics" JSONB,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SegmentMembership" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SegmentMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SegmentMembership_customerId_key" ON "SegmentMembership"("customerId");
CREATE INDEX "SegmentMembership_segmentId_idx" ON "SegmentMembership"("segmentId");

CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'DISMISSED', 'COMPLETED');

CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Recommendation_customerId_status_idx" ON "Recommendation"("customerId", "status");

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

CREATE TYPE "ModelStatus" AS ENUM ('CANDIDATE', 'PRODUCTION', 'RETIRED');

CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "featureVersion" TEXT NOT NULL,
    "trainedAt" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "recommendedThreshold" DOUBLE PRECISION NOT NULL,
    "riskBands" JSONB NOT NULL,
    "status" "ModelStatus" NOT NULL,
    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModelVersion_modelId_version_key" ON "ModelVersion"("modelId", "version");
CREATE INDEX "ModelVersion_status_idx" ON "ModelVersion"("status");

-- Foreign keys
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SentimentResult" ADD CONSTRAINT "SentimentResult_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SentimentResult" ADD CONSTRAINT "SentimentResult_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerFeatureSnapshot" ADD CONSTRAINT "CustomerFeatureSnapshot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PredictionHistory" ADD CONSTRAINT "PredictionHistory_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SegmentMembership" ADD CONSTRAINT "SegmentMembership_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SegmentMembership" ADD CONSTRAINT "SegmentMembership_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
