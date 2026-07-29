CREATE TABLE "reward_rule" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "achievementCode" TEXT,
  "achievementName" TEXT,
  "achievementTarget" INTEGER,
  "eligibility" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reward_rule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reward_ledger" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "trainingResultId" TEXT,
  "ruleId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'issued',
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reward_ledger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "achievement" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "target" INTEGER NOT NULL,
  "unlockedAt" TIMESTAMP(3),
  "sourceLedgerId" TEXT,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "achievement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reward_rule_code_key" ON "reward_rule"("code");
CREATE INDEX "reward_rule_eventType_status_idx" ON "reward_rule"("eventType", "status");

CREATE UNIQUE INDEX "reward_ledger_patientId_eventType_eventId_ruleId_key"
  ON "reward_ledger"("patientId", "eventType", "eventId", "ruleId");

CREATE INDEX "reward_ledger_patientId_issuedAt_idx"
  ON "reward_ledger"("patientId", "issuedAt");

CREATE INDEX "reward_ledger_trainingResultId_idx"
  ON "reward_ledger"("trainingResultId");

CREATE UNIQUE INDEX "achievement_patientId_code_key"
  ON "achievement"("patientId", "code");

CREATE INDEX "achievement_patientId_unlockedAt_idx"
  ON "achievement"("patientId", "unlockedAt");

ALTER TABLE "reward_ledger"
  ADD CONSTRAINT "reward_ledger_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reward_ledger"
  ADD CONSTRAINT "reward_ledger_trainingResultId_fkey"
  FOREIGN KEY ("trainingResultId") REFERENCES "training_result"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reward_ledger"
  ADD CONSTRAINT "reward_ledger_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "reward_rule"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "achievement"
  ADD CONSTRAINT "achievement_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
