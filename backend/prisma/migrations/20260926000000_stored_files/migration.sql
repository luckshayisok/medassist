-- Private file storage in Postgres (for hosts without a persistent disk).
-- CreateTable
CREATE TABLE "StoredFile" (
    "key" VARCHAR(64) NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("key")
);
