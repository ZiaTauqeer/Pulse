-- Adds real username/password signup support and customer-source tracking
-- (demo seed data vs. manually-entered vs. CSV-imported).
--
-- Written by hand and applied directly via psql for the same reason as
-- the initial migration - see that migration's header comment. Verified
-- against the same live PostgreSQL 16 instance before delivery.

-- ---- User: add username (required, unique), make email optional ----
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Backfill username for any already-seeded rows (e.g. admin@pulse.demo -> admin)
-- so this migration is safe to run whether or not you've seeded yet.
UPDATE "User" SET "username" = split_part("email", '@', 1) WHERE "username" IS NULL AND "email" IS NOT NULL;

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- ---- Customer: source tracking + who created it + archive support ----
CREATE TYPE "CustomerSource" AS ENUM ('SEED', 'MANUAL', 'IMPORT');

ALTER TABLE "Customer" ADD COLUMN "source" "CustomerSource" NOT NULL DEFAULT 'SEED';
ALTER TABLE "Customer" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Customer_source_idx" ON "Customer"("source");
