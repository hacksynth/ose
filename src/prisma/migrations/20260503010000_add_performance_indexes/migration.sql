CREATE INDEX "WrongNote_userId_markedMastered_updatedAt_idx" ON "WrongNote"("userId", "markedMastered", "updatedAt");
CREATE INDEX "WrongNote_userId_updatedAt_idx" ON "WrongNote"("userId", "updatedAt");

CREATE INDEX "AIImageGeneration_userId_updatedAt_idx" ON "AIImageGeneration"("userId", "updatedAt");
CREATE INDEX "AIImageGeneration_userId_status_updatedAt_idx" ON "AIImageGeneration"("userId", "status", "updatedAt");
CREATE INDEX "AIImageGeneration_userId_wrongNoteId_updatedAt_idx" ON "AIImageGeneration"("userId", "wrongNoteId", "updatedAt");

CREATE INDEX "AIExplanationGeneration_userId_wrongNoteId_updatedAt_idx" ON "AIExplanationGeneration"("userId", "wrongNoteId", "updatedAt");

CREATE INDEX "StudyPlan_userId_createdAt_idx" ON "StudyPlan"("userId", "createdAt");
