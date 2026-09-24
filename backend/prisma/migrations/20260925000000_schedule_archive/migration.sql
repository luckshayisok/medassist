-- Keep removed schedule times (and their dose history) instead of deleting them.
ALTER TABLE "MedicationSchedule" ADD COLUMN "archivedAt" TIMESTAMPTZ(3);
