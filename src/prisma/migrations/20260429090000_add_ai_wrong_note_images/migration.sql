-- AlterTable
ALTER TABLE "UserAISettings" ADD COLUMN "imageProvider" TEXT;
ALTER TABLE "UserAISettings" ADD COLUMN "imageModel" TEXT;
ALTER TABLE "UserAISettings" ADD COLUMN "imageApiKey" TEXT;
ALTER TABLE "UserAISettings" ADD COLUMN "imageBaseUrl" TEXT;
ALTER TABLE "UserAISettings" ADD COLUMN "imageSize" TEXT;
ALTER TABLE "UserAISettings" ADD COLUMN "imageQuality" TEXT;
ALTER TABLE "UserAISettings" ADD COLUMN "imageOutputFormat" TEXT;
ALTER TABLE "UserAISettings" ADD COLUMN "imageStyle" TEXT;

-- CreateTable
CREATE TABLE "AIImageGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "wrongNoteId" TEXT,
    "wrongOptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptProvider" TEXT NOT NULL,
    "promptModel" TEXT NOT NULL,
    "imageSize" TEXT NOT NULL,
    "imageQuality" TEXT NOT NULL,
    "imageOutputFormat" TEXT NOT NULL,
    "imageStyle" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "promptPayload" JSONB,
    "imagePrompt" TEXT,
    "imagePath" TEXT,
    "sourceImagePath" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "AIImageGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AIImageGeneration_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AIImageGeneration_wrongNoteId_fkey" FOREIGN KEY ("wrongNoteId") REFERENCES "WrongNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AIImageGeneration_userId_createdAt_idx" ON "AIImageGeneration"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIImageGeneration_questionId_idx" ON "AIImageGeneration"("questionId");

-- CreateIndex
CREATE INDEX "AIImageGeneration_wrongNoteId_status_createdAt_idx" ON "AIImageGeneration"("wrongNoteId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AIImageGeneration_fingerprint_idx" ON "AIImageGeneration"("fingerprint");
