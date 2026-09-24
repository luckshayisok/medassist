-- Prescription reading: prescriber/date/warnings and richer per-medicine drafts.
ALTER TABLE "Prescription" ADD COLUMN "prescriberName" VARCHAR(120);
ALTER TABLE "Prescription" ADD COLUMN "prescribedOn" VARCHAR(40);
ALTER TABLE "Prescription" ADD COLUMN "warnings" TEXT[];
ALTER TABLE "PrescriptionMedication" ADD COLUMN "dose" VARCHAR(60);
ALTER TABLE "PrescriptionMedication" ADD COLUMN "form" VARCHAR(40);
ALTER TABLE "PrescriptionMedication" ADD COLUMN "timesOfDay" TEXT[];
ALTER TABLE "PrescriptionMedication" ADD COLUMN "foodTiming" "FoodTiming";ALTER TABLE "PrescriptionMedication" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
