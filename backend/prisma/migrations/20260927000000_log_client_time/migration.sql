-- Device time of each dose action; used to resolve conflicts between devices (newest wins).
ALTER TABLE "MedicationLog" ADD COLUMN "clientLoggedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
