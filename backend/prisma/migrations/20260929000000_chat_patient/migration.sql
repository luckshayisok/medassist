-- Assistant chats are about a specific patient (self, or one a caregiver looks after).
ALTER TABLE "ChatMessage" ADD COLUMN "patientId" UUID;
DROP INDEX IF EXISTS "ChatMessage_userId_idx";
CREATE INDEX "ChatMessage_userId_patientId_createdAt_idx" ON "ChatMessage"("userId", "patientId", "createdAt");
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;