-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('patient', 'caregiver', 'doctor', 'admin');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'disabled', 'frozen', 'pending');

-- CreateEnum
CREATE TYPE "BindingStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('privacy_policy', 'ai_processing', 'camera_capture', 'microphone_capture', 'caregiver_sharing');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('granted', 'revoked');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'moderate', 'high');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('draft', 'pending_confirm', 'active', 'paused', 'ended');

-- CreateEnum
CREATE TYPE "TrainingSessionStatus" AS ENUM ('started', 'in_progress', 'completed', 'interrupted', 'upload_failed');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('pending', 'synced', 'failed');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('success', 'failed', 'denied');

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "mobilePhone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_definition" (
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_definition_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "user_role_binding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "roleCode" "RoleCode" NOT NULL,
    "relatedObjectType" TEXT NOT NULL,
    "relatedObjectId" TEXT NOT NULL,
    "bindingStatus" "BindingStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "responsibleDoctorId" TEXT,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "mobilePhone" TEXT,
    "caregiverName" TEXT,
    "caregiverPhone" TEXT,
    "healthMetrics" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregiver_relation" (
    "id" TEXT NOT NULL,
    "caregiverUserId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "authorizationStatus" "BindingStatus" NOT NULL DEFAULT 'active',
    "authorizedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "scope" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caregiver_relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'granted',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "evidenceSnapshot" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_record" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assessmentType" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mock_ai',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "scoreSummary" JSONB NOT NULL DEFAULT '{}',
    "rawInputSummary" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_grade_record" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "systemRiskLevel" "RiskLevel" NOT NULL,
    "manualRiskLevel" "RiskLevel",
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "reasonSummary" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_grade_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analysis_record" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "trainingSessionId" TEXT,
    "analysisScene" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "inputSummary" JSONB NOT NULL DEFAULT '{}',
    "outputSummary" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analysis_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_content" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trainingTargets" TEXT[],
    "tags" TEXT[],
    "defaultDuration" INTEGER NOT NULL,
    "defaultDifficulty" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rehab_plan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'system_recommendation',
    "planName" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'draft',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "weekFrequency" INTEGER NOT NULL,
    "dailyDuration" INTEGER NOT NULL,
    "difficultyLadder" JSONB NOT NULL DEFAULT '{}',
    "recommendationReason" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rehab_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rehab_plan_item" (
    "id" TEXT NOT NULL,
    "rehabPlanId" TEXT NOT NULL,
    "gameContentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "frequencyPerWeek" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL,
    "adaptiveRules" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rehab_plan_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_adjustment_record" (
    "id" TEXT NOT NULL,
    "rehabPlanId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "originalSnapshot" JSONB NOT NULL,
    "adjustedSnapshot" JSONB NOT NULL,
    "adjustmentReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_adjustment_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_registry" (
    "id" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_session" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "patientId" TEXT NOT NULL,
    "rehabPlanId" TEXT NOT NULL,
    "planItemId" TEXT NOT NULL,
    "gameContentId" TEXT NOT NULL,
    "deviceId" TEXT,
    "sessionStatus" "TrainingSessionStatus" NOT NULL DEFAULT 'started',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "interruptReason" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_result" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "completionRate" DOUBLE PRECISION NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "reactionTimeMs" INTEGER NOT NULL,
    "motionAccuracy" DOUBLE PRECISION NOT NULL,
    "exerciseIntensity" TEXT NOT NULL,
    "abnormalFlag" BOOLEAN NOT NULL DEFAULT false,
    "qualityFlag" TEXT NOT NULL DEFAULT 'valid',
    "metricsSummary" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motion_metric" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawSummary" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "motion_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "RoleCode",
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "result" "AuditResult" NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_event_log" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_code_key" ON "organization"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_key" ON "user"("account");

-- CreateIndex
CREATE UNIQUE INDEX "user_mobilePhone_key" ON "user"("mobilePhone");

-- CreateIndex
CREATE INDEX "user_role_binding_roleCode_relatedObjectId_idx" ON "user_role_binding"("roleCode", "relatedObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_binding_userId_roleCode_relatedObjectId_key" ON "user_role_binding"("userId", "roleCode", "relatedObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profile_userId_key" ON "doctor_profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_profile_userId_key" ON "patient_profile"("userId");

-- CreateIndex
CREATE INDEX "patient_profile_responsibleDoctorId_idx" ON "patient_profile"("responsibleDoctorId");

-- CreateIndex
CREATE UNIQUE INDEX "caregiver_relation_caregiverUserId_patientId_key" ON "caregiver_relation"("caregiverUserId", "patientId");

-- CreateIndex
CREATE INDEX "consent_record_patientId_consentType_status_idx" ON "consent_record"("patientId", "consentType", "status");

-- CreateIndex
CREATE INDEX "assessment_record_patientId_createdAt_idx" ON "assessment_record"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "risk_grade_record_patientId_isCurrent_idx" ON "risk_grade_record"("patientId", "isCurrent");

-- CreateIndex
CREATE INDEX "ai_analysis_record_patientId_analysisScene_createdAt_idx" ON "ai_analysis_record"("patientId", "analysisScene", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "game_content_code_key" ON "game_content"("code");

-- CreateIndex
CREATE INDEX "rehab_plan_patientId_status_isCurrent_idx" ON "rehab_plan"("patientId", "status", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "rehab_plan_item_rehabPlanId_gameContentId_key" ON "rehab_plan_item"("rehabPlanId", "gameContentId");

-- CreateIndex
CREATE UNIQUE INDEX "device_registry_deviceCode_key" ON "device_registry"("deviceCode");

-- CreateIndex
CREATE UNIQUE INDEX "training_session_idempotencyKey_key" ON "training_session"("idempotencyKey");

-- CreateIndex
CREATE INDEX "training_session_patientId_startedAt_idx" ON "training_session"("patientId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "training_result_sessionId_key" ON "training_result"("sessionId");

-- CreateIndex
CREATE INDEX "motion_metric_trainingSessionId_metricType_idx" ON "motion_metric"("trainingSessionId", "metricType");

-- CreateIndex
CREATE INDEX "audit_log_actorUserId_createdAt_idx" ON "audit_log"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_targetType_targetId_idx" ON "audit_log"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "system_event_log_eventType_createdAt_idx" ON "system_event_log"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "user_role_binding" ADD CONSTRAINT "user_role_binding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_binding" ADD CONSTRAINT "user_role_binding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_binding" ADD CONSTRAINT "user_role_binding_roleCode_fkey" FOREIGN KEY ("roleCode") REFERENCES "role_definition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profile" ADD CONSTRAINT "doctor_profile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profile" ADD CONSTRAINT "patient_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profile" ADD CONSTRAINT "patient_profile_responsibleDoctorId_fkey" FOREIGN KEY ("responsibleDoctorId") REFERENCES "doctor_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_relation" ADD CONSTRAINT "caregiver_relation_caregiverUserId_fkey" FOREIGN KEY ("caregiverUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregiver_relation" ADD CONSTRAINT "caregiver_relation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_record" ADD CONSTRAINT "assessment_record_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_grade_record" ADD CONSTRAINT "risk_grade_record_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_grade_record" ADD CONSTRAINT "risk_grade_record_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessment_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_record" ADD CONSTRAINT "ai_analysis_record_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_record" ADD CONSTRAINT "ai_analysis_record_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessment_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_record" ADD CONSTRAINT "ai_analysis_record_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "training_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rehab_plan" ADD CONSTRAINT "rehab_plan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rehab_plan" ADD CONSTRAINT "rehab_plan_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctor_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rehab_plan_item" ADD CONSTRAINT "rehab_plan_item_rehabPlanId_fkey" FOREIGN KEY ("rehabPlanId") REFERENCES "rehab_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rehab_plan_item" ADD CONSTRAINT "rehab_plan_item_gameContentId_fkey" FOREIGN KEY ("gameContentId") REFERENCES "game_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_adjustment_record" ADD CONSTRAINT "plan_adjustment_record_rehabPlanId_fkey" FOREIGN KEY ("rehabPlanId") REFERENCES "rehab_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_adjustment_record" ADD CONSTRAINT "plan_adjustment_record_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctor_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patient_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_rehabPlanId_fkey" FOREIGN KEY ("rehabPlanId") REFERENCES "rehab_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "rehab_plan_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_gameContentId_fkey" FOREIGN KEY ("gameContentId") REFERENCES "game_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "device_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_result" ADD CONSTRAINT "training_result_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motion_metric" ADD CONSTRAINT "motion_metric_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "training_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_event_log" ADD CONSTRAINT "system_event_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
