-- Cached official drug label text (openFDA) used for "verified" assistant answers.
-- CreateTable
CREATE TABLE "DrugLabel" (
    "ingredient" VARCHAR(120) NOT NULL,
    "found" BOOLEAN NOT NULL,
    "title" VARCHAR(200),
    "setId" VARCHAR(64),
    "effectiveDate" VARCHAR(8),
    "sections" JSONB NOT NULL DEFAULT '{}',
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrugLabel_pkey" PRIMARY KEY ("ingredient")
);
