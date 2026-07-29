CREATE TABLE "ai_conversation_session" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "assessmentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "provider" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "callId" TEXT,
    "endpointRef" TEXT NOT NULL,
    "promptVersion" TEXT,
    "summary" TEXT,
    "reviewNote" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_conversation_message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentSnapshot" JSONB NOT NULL DEFAULT '{}',
    "evidenceMetadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_conversation_session_patientId_startedAt_idx"
ON "ai_conversation_session"("patientId", "startedAt");

CREATE INDEX "ai_conversation_session_status_startedAt_idx"
ON "ai_conversation_session"("status", "startedAt");

CREATE INDEX "ai_conversation_message_sessionId_createdAt_idx"
ON "ai_conversation_message"("sessionId", "createdAt");

CREATE INDEX "ai_conversation_message_role_createdAt_idx"
ON "ai_conversation_message"("role", "createdAt");

ALTER TABLE "ai_conversation_session"
ADD CONSTRAINT "ai_conversation_session_patientId_fkey"
FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_conversation_session"
ADD CONSTRAINT "ai_conversation_session_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "user"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_conversation_message"
ADD CONSTRAINT "ai_conversation_message_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "ai_conversation_session"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
