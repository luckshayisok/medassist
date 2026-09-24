-- Caregiver linking codes and missed-dose alerts.
-- CreateTable
CREATE TABLE "CaregiverInvite" (
    "code" VARCHAR(16) NOT NULL,
    "patientId" UUID NOT NULL,
    "permissions" TEXT[],
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaregiverInvite_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CaregiverAlert" (
    "id" UUID NOT NULL,
    "caregiverId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "medication" VARCHAR(200) NOT NULL,
    "seenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaregiverAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaregiverInvite_patientId_idx" ON "CaregiverInvite"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "CaregiverAlert_caregiverId_scheduleId_scheduledFor_key" ON "CaregiverAlert"("caregiverId", "scheduleId", "scheduledFor");

-- CreateIndex
CREATE INDEX "CaregiverAlert_caregiverId_createdAt_idx" ON "CaregiverAlert"("caregiverId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaregiverInvite" ADD CONSTRAINT "CaregiverInvite_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAlert" ADD CONSTRAINT "CaregiverAlert_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverAlert" ADD CONSTRAINT "CaregiverAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
