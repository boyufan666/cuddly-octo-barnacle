import { Prisma, PrismaClient, RoleCode } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  hashCredential,
  validateCredentialPassword,
} from "../src/credential-security";
import { requireSensitiveBackfillKey } from "../src/backfill-sensitive-encryption";
import {
  createPhoneLookupHmac,
  decryptSensitiveJson,
  encryptSensitiveJson,
  type SensitiveEncryptionKey,
} from "../src/sensitive-encryption";

const prisma = new PrismaClient();

const seedMedicalRecordNo = "SEED-ALZ-0001";
const seedAssessmentId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b201";
const seedRiskGradeId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b202";
const seedAiAnalysisId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b203";
const seedTrainingResultId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b204";
const seedPatientProfileId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b205";
const seedUserIds = {
  admin: "6d8dfde7-6b95-4ca2-8d1a-2af98927b101",
  operator001: "6d8dfde7-6b95-4ca2-8d1a-2af98927b102",
  auditor001: "6d8dfde7-6b95-4ca2-8d1a-2af98927b103",
  doctor001: "6d8dfde7-6b95-4ca2-8d1a-2af98927b104",
  patient001: "6d8dfde7-6b95-4ca2-8d1a-2af98927b105",
  caregiver001: "6d8dfde7-6b95-4ca2-8d1a-2af98927b106",
} as const;
const seedRehabPlanId = "seed-rehab-plan-week-001";
const seedPlanAdjustmentId = "seed-plan-adjustment-week-001";
const seedCompletedAt = new Date("2026-04-27T01:40:00.000Z");
const seedConfirmedAt = new Date("2026-04-27T01:45:00.000Z");
const seedConsentGrantedAt = new Date("2026-04-27T01:00:00.000Z");
const seedAuditCreatedAt = new Date("2026-04-27T02:10:00.000Z");

const browserPoseRequiredMetrics = [
  { metricType: "reaction_time_ms", unit: "ms", min: 0, max: 60000 },
  { metricType: "target_hit_rate", unit: "ratio", min: 0, max: 1 },
  { metricType: "pose_visibility_avg", unit: "ratio", min: 0, max: 1 },
  { metricType: "arm_raise_accuracy", unit: "ratio", min: 0, max: 1 },
];

const dynamicDifficultyTriggers = [
  "prior_assessment",
  "reaction_slow",
  "accuracy_high",
  "accuracy_low",
  "fatigue_risk",
  "clinician_limit",
];

const formalDynamicDifficultyPolicy = {
  source: "clinician_approved_plan",
  startingLevel: "from_latest_approved_assessment_and_plan_item",
  performanceWindow: "runtime_verified_window",
  safetyLimits: {
    minLevel: 1,
    maxLevel: 3,
    unchangedRequiresSafetyClampReason: true,
  },
  requiredEvidence: [
    "triggerReason",
    "beforeSpeedOrComplexity",
    "afterSpeedOrComplexity",
    "adjustedAt",
    "runtimeFrameId",
    "runtimeWindowId",
    "safetyClampReasonWhenUnchanged",
  ],
};

const browserPoseResultSchema = {
  schemaVersion: "1.0.0",
  requiredMetrics: browserPoseRequiredMetrics.map(
    (metric) => metric.metricType,
  ),
  dynamicDifficultyEvidence: "required",
};

const unityResultSchema = {
  schemaVersion: "1.0.0",
  requiredMetrics: [
    "reaction_time_ms",
    "target_hit_rate",
    "arm_raise_accuracy",
    "duration_seconds",
    "difficulty_level",
  ],
  dynamicDifficultyEvidence: "required",
};

const cognitiveRequiredMetrics = [
  { metricType: "sequence_recall_rate", unit: "ratio", min: 0, max: 1 },
  { metricType: "path_completion_rate", unit: "ratio", min: 0, max: 1 },
];

const cognitiveResultSchema = {
  schemaVersion: "1.0.0",
  requiredMetrics: cognitiveRequiredMetrics.map((metric) => metric.metricType),
  dynamicDifficultyEvidence: "required",
};

const formalPublishedGameMetadata = {
  difficultyPolicy: formalDynamicDifficultyPolicy,
  dynamicDifficultyTriggers,
  publishedStatus: "published",
  status: "active",
};

const formalBrowserPoseGameMetadata = {
  ...formalPublishedGameMetadata,
  requiredPermissions: ["camera_capture"],
  resultSchema: browserPoseResultSchema,
};

const formalCognitiveGameMetadata = {
  ...formalPublishedGameMetadata,
  requiredPermissions: [],
  resultSchema: cognitiveResultSchema,
};

function loadRootEnv() {
  const envPath = resolve(__dirname, "../../..", ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function requireSeedPassword() {
  const password = process.env.DEFAULT_PATIENT_PASSWORD;
  if (password === undefined) {
    throw new Error(
      "Missing required environment variable: DEFAULT_PATIENT_PASSWORD",
    );
  }
  return validateCredentialPassword(password);
}

export function seedEnvelope(
  value: Prisma.JsonObject,
  tableName: string,
  recordId: string,
  fieldName: string,
  encryptionKey: SensitiveEncryptionKey,
): Prisma.InputJsonValue {
  const envelope = encryptSensitiveJson(
    value,
    { tableName, recordId, fieldName },
    encryptionKey,
  );
  return {
    ...envelope,
    aad: { ...envelope.aad },
  };
}

function verifySeedEnvelope(
  envelope: Prisma.JsonValue,
  tableName: string,
  recordId: string,
  fieldName: string,
  encryptionKey: SensitiveEncryptionKey,
) {
  decryptSensitiveJson(
    envelope,
    { tableName, recordId, fieldName },
    encryptionKey,
  );
}

async function preflightExistingSeedEnvelopes(
  encryptionKey: SensitiveEncryptionKey,
) {
  const users = await prisma.user.findMany({
    where: { account: { in: Object.keys(seedUserIds) } },
    select: { id: true, account: true, identityEnvelope: true },
  });
  for (const user of users) {
    verifySeedEnvelope(
      user.identityEnvelope,
      "user",
      user.id,
      "identityEnvelope",
      encryptionKey,
    );
  }

  const patientUser = users.find((user) => user.account === "patient001");
  if (patientUser) {
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: patientUser.id },
      select: {
        id: true,
        identityEnvelope: true,
        contactEnvelope: true,
        careDetailsEnvelope: true,
      },
    });
    if (patient) {
      for (const [fieldName, envelope] of [
        ["identityEnvelope", patient.identityEnvelope],
        ["contactEnvelope", patient.contactEnvelope],
        ["careDetailsEnvelope", patient.careDetailsEnvelope],
      ] as const) {
        verifySeedEnvelope(
          envelope,
          "patient_profile",
          patient.id,
          fieldName,
          encryptionKey,
        );
      }

      const trainingResult = await prisma.trainingResult.findFirst({
        where: {
          session: {
            patientId: patient.id,
            idempotencyKey: "seed-rhythm-session-001",
          },
        },
        select: { id: true, reviewEnvelope: true },
      });
      if (trainingResult) {
        verifySeedEnvelope(
          trainingResult.reviewEnvelope,
          "training_result",
          trainingResult.id,
          "reviewEnvelope",
          encryptionKey,
        );
      }
    }
  }

  const assessment = await prisma.assessmentRecord.findUnique({
    where: { id: seedAssessmentId },
    select: { id: true, resultEnvelope: true },
  });
  if (assessment) {
    verifySeedEnvelope(
      assessment.resultEnvelope,
      "assessment_record",
      assessment.id,
      "resultEnvelope",
      encryptionKey,
    );
  }

  const riskGrade = await prisma.riskGradeRecord.findUnique({
    where: { id: seedRiskGradeId },
    select: { id: true, reasonEnvelope: true },
  });
  if (riskGrade) {
    verifySeedEnvelope(
      riskGrade.reasonEnvelope,
      "risk_grade_record",
      riskGrade.id,
      "reasonEnvelope",
      encryptionKey,
    );
  }

  const aiAnalysis = await prisma.aiAnalysisRecord.findUnique({
    where: { id: seedAiAnalysisId },
    select: { id: true, inputEnvelope: true, outputEnvelope: true },
  });
  if (aiAnalysis) {
    verifySeedEnvelope(
      aiAnalysis.inputEnvelope,
      "ai_analysis_record",
      aiAnalysis.id,
      "inputEnvelope",
      encryptionKey,
    );
    verifySeedEnvelope(
      aiAnalysis.outputEnvelope,
      "ai_analysis_record",
      aiAnalysis.id,
      "outputEnvelope",
      encryptionKey,
    );
  }
}

async function upsertEncryptedSeedUser(
  input: {
    id: string;
    account: string;
    displayName: string;
    mobilePhone: string;
    passwordHash: string;
  },
  encryptionKey: SensitiveEncryptionKey,
) {
  const existing = await prisma.user.findUnique({
    where: { account: input.account },
    select: { id: true },
  });
  const id = existing?.id ?? input.id;
  const identityEnvelope = seedEnvelope(
    { displayName: input.displayName, mobilePhone: input.mobilePhone },
    "user",
    id,
    "identityEnvelope",
    encryptionKey,
  );
  const data = {
    identityEnvelope,
    mobilePhoneLookup: createPhoneLookupHmac(
      input.mobilePhone,
      encryptionKey.key,
    ),
    passwordHash: input.passwordHash,
    passwordUpdatedAt: new Date(),
    passwordResetRequired: true,
  };
  return prisma.user.upsert({
    where: { account: input.account },
    update: data,
    create: { id, account: input.account, ...data },
  });
}

async function main() {
  loadRootEnv();
  const encryptionKey = requireSensitiveBackfillKey(process.env);
  const passwordHash = await hashCredential(requireSeedPassword());
  await preflightExistingSeedEnvelopes(encryptionKey);

  await prisma.roleDefinition.createMany({
    data: [
      { code: "patient", name: "患者", level: 10 },
      { code: "caregiver", name: "家属", level: 20 },
      { code: "doctor", name: "医师", level: 30 },
      { code: "admin", name: "管理员", level: 40 },
      { code: "admin_super", name: "超级管理员", level: 43 },
      { code: "admin_operator", name: "普通运营", level: 41 },
      { code: "admin_auditor", name: "只读审计", level: 40 },
    ],
    skipDuplicates: true,
  });

  const organization = await prisma.organization.upsert({
    where: { code: "dlut-rehab" },
    update: {},
    create: {
      name: "大连理工康复示范中心",
      code: "dlut-rehab",
      type: "rehab_center",
    },
  });

  const adminUser = await upsertEncryptedSeedUser(
    {
      id: seedUserIds.admin,
      account: "admin",
      displayName: "平台超级管理员",
      mobilePhone: "13900000000",
      passwordHash,
    },
    encryptionKey,
  );
  const operatorUser = await upsertEncryptedSeedUser(
    {
      id: seedUserIds.operator001,
      account: "operator001",
      displayName: "运营管理员",
      mobilePhone: "13900000002",
      passwordHash,
    },
    encryptionKey,
  );
  const auditorUser = await upsertEncryptedSeedUser(
    {
      id: seedUserIds.auditor001,
      account: "auditor001",
      displayName: "审计管理员",
      mobilePhone: "13900000003",
      passwordHash,
    },
    encryptionKey,
  );
  const doctorUser = await upsertEncryptedSeedUser(
    {
      id: seedUserIds.doctor001,
      account: "doctor001",
      displayName: "王医生",
      mobilePhone: "13900000001",
      passwordHash,
    },
    encryptionKey,
  );
  const patientUser = await upsertEncryptedSeedUser(
    {
      id: seedUserIds.patient001,
      account: "patient001",
      displayName: "李秀兰",
      mobilePhone: "13800006721",
      passwordHash,
    },
    encryptionKey,
  );
  const caregiverUser = await upsertEncryptedSeedUser(
    {
      id: seedUserIds.caregiver001,
      account: "caregiver001",
      displayName: "李明",
      mobilePhone: "13900008206",
      passwordHash,
    },
    encryptionKey,
  );

  const doctor = await prisma.doctorProfile.upsert({
    where: { userId: doctorUser.id },
    update: {},
    create: {
      userId: doctorUser.id,
      organizationId: organization.id,
      title: "主任康复治疗师",
      department: "认知康复科",
    },
  });

  const existingPatient = await prisma.patientProfile.findUnique({
    where: { userId: patientUser.id },
    select: { id: true },
  });
  const patientId = existingPatient?.id ?? seedPatientProfileId;
  const patientIdentityEnvelope = seedEnvelope(
    { name: "李秀兰", gender: "female", age: 72 },
    "patient_profile",
    patientId,
    "identityEnvelope",
    encryptionKey,
  );
  const patientContactEnvelope = seedEnvelope(
    {
      mobilePhone: "13800006721",
      caregiverName: "李明",
      caregiverPhone: "13900008206",
    },
    "patient_profile",
    patientId,
    "contactEnvelope",
    encryptionKey,
  );
  const patientCareDetailsEnvelope = seedEnvelope(
    {
      healthMetrics: {
        medicalRecordNo: seedMedicalRecordNo,
        bloodPressure: "132/82",
        heartRate: 76,
        gaitRisk: "low",
      },
    },
    "patient_profile",
    patientId,
    "careDetailsEnvelope",
    encryptionKey,
  );
  const patient = await prisma.patientProfile.upsert({
    where: { userId: patientUser.id },
    update: {
      responsibleDoctorId: doctor.id,
      identityEnvelope: patientIdentityEnvelope,
      contactEnvelope: patientContactEnvelope,
      careDetailsEnvelope: patientCareDetailsEnvelope,
    },
    create: {
      id: patientId,
      userId: patientUser.id,
      responsibleDoctorId: doctor.id,
      identityEnvelope: patientIdentityEnvelope,
      contactEnvelope: patientContactEnvelope,
      careDetailsEnvelope: patientCareDetailsEnvelope,
    },
  });

  const roleBindings = [
    {
      userId: adminUser.id,
      roleCode: "admin_super" as RoleCode,
      relatedObjectType: "admin",
      relatedObjectId: adminUser.id,
    },
    {
      userId: operatorUser.id,
      roleCode: "admin_operator" as RoleCode,
      relatedObjectType: "admin",
      relatedObjectId: operatorUser.id,
    },
    {
      userId: auditorUser.id,
      roleCode: "admin_auditor" as RoleCode,
      relatedObjectType: "admin",
      relatedObjectId: auditorUser.id,
    },
    {
      userId: doctorUser.id,
      organizationId: organization.id,
      roleCode: "doctor" as RoleCode,
      relatedObjectType: "doctor",
      relatedObjectId: doctor.id,
    },
    {
      userId: patientUser.id,
      roleCode: "patient" as RoleCode,
      relatedObjectType: "patient",
      relatedObjectId: patient.id,
    },
    {
      userId: caregiverUser.id,
      roleCode: "caregiver" as RoleCode,
      relatedObjectType: "patient",
      relatedObjectId: patient.id,
    },
  ];

  for (const binding of roleBindings) {
    await prisma.userRoleBinding.upsert({
      where: {
        userId_roleCode_relatedObjectId: {
          userId: binding.userId,
          roleCode: binding.roleCode,
          relatedObjectId: binding.relatedObjectId,
        },
      },
      update: {},
      create: {
        ...binding,
        bindingStatus: "active",
      },
    });
  }

  await prisma.caregiverRelation.upsert({
    where: {
      caregiverUserId_patientId: {
        caregiverUserId: caregiverUser.id,
        patientId: patient.id,
      },
    },
    update: {},
    create: {
      caregiverUserId: caregiverUser.id,
      patientId: patient.id,
      relation: "儿子",
      authorizedAt: new Date("2026-04-27T02:00:00.000Z"),
      scope: {
        summary: true,
        reminders: true,
        progress: true,
        rawAssessment: false,
        planEdit: false,
      },
    },
  });

  for (const consentType of [
    "privacy_policy",
    "ai_processing",
    "camera_capture",
    "microphone_capture",
    "caregiver_sharing",
  ] as const) {
    const consentData = {
      patientId: patient.id,
      subjectUserId: patientUser.id,
      consentType,
      consentVersion: "v1.2",
      status: "granted" as const,
      grantedAt: seedConsentGrantedAt,
      revokedAt: null,
      evidenceSnapshot: {
        source: "seed",
        userAgent: "rehab-platform-seed",
      },
    };
    await prisma.consentRecord.upsert({
      where: { id: `seed-consent-${consentType}` },
      update: consentData,
      create: {
        id: `seed-consent-${consentType}`,
        ...consentData,
      },
    });
  }

  const games = await Promise.all([
    prisma.gameContent.upsert({
      where: { code: "rhythm_reach_3d" },
      update: {
        runtimeType: "unity_webgl",
        manifestUrl: "/unity/rhythm_reach_3d/0.1.2/manifest.json",
        buildBaseUrl: "/unity/rhythm_reach_3d/0.1.2",
        gameVersion: "0.1.2",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        trainingTargets: ["运动训练", "reaction", "attention", "upper_limb"],
        tags: [
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "中低强度",
          "反应",
          "动作准确率",
        ],
        requiredMetrics: [
          { metricType: "reaction_time_ms", unit: "ms", min: 0, max: 60000 },
          { metricType: "target_hit_rate", unit: "ratio", min: 0, max: 1 },
          { metricType: "arm_raise_accuracy", unit: "ratio", min: 0, max: 1 },
          {
            metricType: "duration_seconds",
            unit: "seconds",
            min: 1,
            max: 3600,
          },
          { metricType: "difficulty_level", unit: "level", min: 1, max: 3 },
        ],
        difficultyPolicy: formalDynamicDifficultyPolicy,
        dynamicDifficultyTriggers,
        requiredPermissions: ["camera_capture"],
        resultSchema: unityResultSchema,
        publishedStatus: "published",
        status: "active",
      },
      create: {
        code: "rhythm_reach_3d",
        name: "节奏触达 3D",
        trainingTargets: ["运动训练", "reaction", "attention", "upper_limb"],
        tags: [
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "中低强度",
          "反应",
          "动作准确率",
        ],
        defaultDuration: 6,
        defaultDifficulty: "standard",
        runtimeType: "unity_webgl",
        manifestUrl: "/unity/rhythm_reach_3d/0.1.2/manifest.json",
        buildBaseUrl: "/unity/rhythm_reach_3d/0.1.2",
        gameVersion: "0.1.2",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: [
          { metricType: "reaction_time_ms", unit: "ms", min: 0, max: 60000 },
          { metricType: "target_hit_rate", unit: "ratio", min: 0, max: 1 },
          { metricType: "arm_raise_accuracy", unit: "ratio", min: 0, max: 1 },
          {
            metricType: "duration_seconds",
            unit: "seconds",
            min: 1,
            max: 3600,
          },
          { metricType: "difficulty_level", unit: "level", min: 1, max: 3 },
        ],
        difficultyPolicy: formalDynamicDifficultyPolicy,
        dynamicDifficultyTriggers,
        requiredPermissions: ["camera_capture"],
        resultSchema: unityResultSchema,
        publishedStatus: "published",
        status: "active",
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "garden_reach" },
      update: {
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        trainingTargets: ["运动训练", "reaction", "attention", "upper_limb"],
        tags: [
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "中低强度",
          "反应",
          "动作准确率",
        ],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
      create: {
        code: "garden_reach",
        name: "花园触达",
        trainingTargets: ["运动训练", "reaction", "attention", "upper_limb"],
        tags: [
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "中低强度",
          "反应",
          "动作准确率",
        ],
        defaultDuration: 8,
        defaultDifficulty: "基础",
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "mirror_sequence" },
      update: {
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        trainingTargets: [
          "思维训练",
          "运动训练",
          "memory",
          "executive",
          "upper_limb",
        ],
        tags: [
          "思维训练",
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "近记忆",
          "执行力",
          "低强度",
          "memory",
          "executive",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
      create: {
        code: "mirror_sequence",
        name: "镜像序列",
        trainingTargets: [
          "思维训练",
          "运动训练",
          "memory",
          "executive",
          "upper_limb",
        ],
        tags: [
          "思维训练",
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "近记忆",
          "执行力",
          "低强度",
          "memory",
          "executive",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        defaultDuration: 8,
        defaultDifficulty: "三步序列",
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "nebula_sort" },
      update: {
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        trainingTargets: [
          "思维训练",
          "运动训练",
          "attention",
          "executive",
          "reaction",
          "upper_limb",
        ],
        tags: [
          "思维训练",
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "注意力",
          "执行力",
          "反应",
          "moderate_intensity",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
      create: {
        code: "nebula_sort",
        name: "星云分拣",
        trainingTargets: [
          "思维训练",
          "运动训练",
          "attention",
          "executive",
          "reaction",
          "upper_limb",
        ],
        tags: [
          "思维训练",
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "注意力",
          "执行力",
          "反应",
          "moderate_intensity",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        defaultDuration: 8,
        defaultDifficulty: "双色分拣",
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "balance_breath" },
      update: {
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        trainingTargets: [
          "思维训练",
          "运动训练",
          "attention",
          "balance",
          "upper_limb",
        ],
        tags: [
          "思维训练",
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "低强度",
          "节律",
          "稳定性",
          "low_intensity",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
      create: {
        code: "balance_breath",
        name: "平衡呼吸舱",
        trainingTargets: [
          "思维训练",
          "运动训练",
          "attention",
          "balance",
          "upper_limb",
        ],
        tags: [
          "思维训练",
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "低强度",
          "节律",
          "稳定性",
          "low_intensity",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        defaultDuration: 8,
        defaultDifficulty: "慢节律",
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "bilateral_rhythm_sync" },
      update: {
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        trainingTargets: [
          "运动训练",
          "coordination",
          "attention",
          "upper_limb",
        ],
        tags: [
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "双手协同",
          "节拍",
          "左右切换",
          "moderate_intensity",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
      create: {
        code: "bilateral_rhythm_sync",
        name: "双手节拍协同",
        trainingTargets: [
          "运动训练",
          "coordination",
          "attention",
          "upper_limb",
        ],
        tags: [
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "双手协同",
          "节拍",
          "左右切换",
          "moderate_intensity",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        defaultDuration: 8,
        defaultDifficulty: "左右节拍",
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "center_shift_bridge" },
      update: {
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        trainingTargets: [
          "思维训练",
          "运动训练",
          "balance",
          "posture_control",
          "attention",
        ],
        tags: [
          "思维训练",
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "平衡",
          "姿势控制",
          "注意力",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
      create: {
        code: "center_shift_bridge",
        name: "重心转移星桥",
        trainingTargets: [
          "思维训练",
          "运动训练",
          "balance",
          "posture_control",
          "attention",
        ],
        tags: [
          "思维训练",
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "平衡",
          "姿势控制",
          "注意力",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        defaultDuration: 8,
        defaultDifficulty: "重心转移",
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "orbital_trace_follow" },
      update: {
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        trainingTargets: [
          "思维训练",
          "运动训练",
          "attention",
          "visual_tracking",
          "upper_limb",
        ],
        tags: [
          "思维训练",
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "视觉追踪",
          "轨迹控制",
          "平滑度",
          "moderate_intensity",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
      create: {
        code: "orbital_trace_follow",
        name: "轨迹追踪巡航",
        trainingTargets: [
          "思维训练",
          "运动训练",
          "attention",
          "visual_tracking",
          "upper_limb",
        ],
        tags: [
          "思维训练",
          "运动训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "视觉追踪",
          "轨迹控制",
          "平滑度",
          "moderate_intensity",
          "engine:phaser_canvas",
          "license:MIT",
          "sensing:mediapipe_pose",
        ],
        defaultDuration: 8,
        defaultDifficulty: "四点光轨",
        runtimeType: "browser_pose_canvas",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: browserPoseRequiredMetrics,
        ...formalBrowserPoseGameMetadata,
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "memory_path" },
      update: {
        runtimeType: "cognitive_web",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: false,
        supportsMicrophone: false,
        supportedInputModes: ["touch", "keyboard"],
        trainingTargets: ["思维训练", "memory", "sequence", "executive"],
        tags: [
          "思维训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "近记忆",
          "序列回忆",
          "路径完成",
          "低强度",
          "memory_sequence",
        ],
        requiredMetrics: cognitiveRequiredMetrics,
        ...formalCognitiveGameMetadata,
      },
      create: {
        code: "memory_path",
        name: "记忆路径",
        trainingTargets: ["思维训练", "memory", "sequence", "executive"],
        tags: [
          "思维训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "近记忆",
          "序列回忆",
          "路径完成",
          "低强度",
          "memory_sequence",
        ],
        defaultDuration: 8,
        defaultDifficulty: "三步路径",
        runtimeType: "cognitive_web",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: false,
        supportsMicrophone: false,
        supportedInputModes: ["touch", "keyboard"],
        requiredMetrics: cognitiveRequiredMetrics,
        ...formalCognitiveGameMetadata,
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "memory_basket" },
      update: {
        runtimeType: "unity_webgl",
        buildStatus: "pending_assets",
        releaseChannel: "development",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        trainingTargets: ["思维训练", "memory", "recognition"],
        tags: [
          "思维训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "近记忆",
          "认知",
          "低强度",
        ],
        requiredMetrics: [
          { metricType: "selection_accuracy", unit: "ratio", min: 0, max: 1 },
          { metricType: "memory_recall_rate", unit: "ratio", min: 0, max: 1 },
        ],
      },
      create: {
        code: "memory_basket",
        name: "记忆果篮",
        trainingTargets: ["思维训练", "memory", "recognition"],
        tags: [
          "思维训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "近记忆",
          "认知",
          "低强度",
        ],
        defaultDuration: 10,
        defaultDifficulty: "4组",
        runtimeType: "unity_webgl",
        buildStatus: "pending_assets",
        releaseChannel: "development",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: [
          { metricType: "selection_accuracy", unit: "ratio", min: 0, max: 1 },
          { metricType: "memory_recall_rate", unit: "ratio", min: 0, max: 1 },
        ],
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "path_treasure" },
      update: {
        runtimeType: "unity_webgl",
        buildStatus: "pending_assets",
        releaseChannel: "development",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        trainingTargets: ["思维训练", "executive", "planning"],
        tags: [
          "思维训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "执行力",
          "路径规划",
          "低强度",
        ],
        requiredMetrics: [
          { metricType: "path_completion_rate", unit: "ratio", min: 0, max: 1 },
          { metricType: "planning_latency_ms", unit: "ms", min: 0 },
        ],
      },
      create: {
        code: "path_treasure",
        name: "路径寻宝",
        trainingTargets: ["思维训练", "executive", "planning"],
        tags: [
          "思维训练",
          "purpose:risk_assessment",
          "purpose:intervention",
          "purpose:data_capture",
          "风险评估辅助",
          "干预训练",
          "数据采集",
          "执行力",
          "路径规划",
          "低强度",
        ],
        defaultDuration: 6,
        defaultDifficulty: "2级",
        runtimeType: "unity_webgl",
        buildStatus: "pending_assets",
        releaseChannel: "development",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: [
          { metricType: "path_completion_rate", unit: "ratio", min: 0, max: 1 },
          { metricType: "planning_latency_ms", unit: "ms", min: 0 },
        ],
      },
    }),
  ]);

  const assessmentResultPayload = {
    scoreSummary: {
      mmse: 20,
      cdr: 1,
      memory: 48,
      orientation: 58,
      executive: 52,
      language: 73,
    },
    rawInputSummary: {
      medicalRecordNo: seedMedicalRecordNo,
      transcript: "今天是星期一。苹果、桌子、硬币。",
      reactionDelaySeconds: 2.4,
    },
  };
  const assessmentResultEnvelope = seedEnvelope(
    assessmentResultPayload,
    "assessment_record",
    seedAssessmentId,
    "resultEnvelope",
    encryptionKey,
  );
  const assessmentData = {
    patientId: patient.id,
    assessmentType: "MMSE/CDR",
    source: "seed_clinician_input",
    status: "completed",
    resultEnvelope: assessmentResultEnvelope,
    startedAt: new Date("2026-04-27T01:30:00.000Z"),
    completedAt: seedCompletedAt,
  };
  const assessment = await prisma.assessmentRecord.upsert({
    where: { id: seedAssessmentId },
    update: assessmentData,
    create: {
      id: seedAssessmentId,
      ...assessmentData,
    },
  });

  await prisma.riskGradeRecord.updateMany({
    where: {
      patientId: patient.id,
      isCurrent: true,
      NOT: { id: seedRiskGradeId },
    },
    data: { isCurrent: false },
  });
  const riskReasonEnvelope = seedEnvelope(
    { reasonSummary: "MMSE 20/30，CDR 1.0，近记忆和执行力分项存在波动。" },
    "risk_grade_record",
    seedRiskGradeId,
    "reasonEnvelope",
    encryptionKey,
  );
  const riskGradeData = {
    patientId: patient.id,
    assessmentId: assessment.id,
    riskLevel: "moderate" as const,
    systemRiskLevel: "moderate" as const,
    manualRiskLevel: null,
    isCurrent: true,
    reasonEnvelope: riskReasonEnvelope,
    confirmedById: doctorUser.id,
    confirmedAt: seedConfirmedAt,
  };
  await prisma.riskGradeRecord.upsert({
    where: { id: seedRiskGradeId },
    update: riskGradeData,
    create: {
      id: seedRiskGradeId,
      ...riskGradeData,
    },
  });

  const aiInputSummary = {
    medicalRecordNo: seedMedicalRecordNo,
    transcript: "今天是星期一。苹果、桌子、硬币。",
    reactionDelaySeconds: 2.4,
  };
  const aiOutputSummary = {
    riskLevel: "moderate",
    recommendation: "建议以近记忆、反应和执行力训练为主。",
  };
  const aiInputEnvelope = seedEnvelope(
    { inputSummary: aiInputSummary },
    "ai_analysis_record",
    seedAiAnalysisId,
    "inputEnvelope",
    encryptionKey,
  );
  const aiOutputEnvelope = seedEnvelope(
    { outputSummary: aiOutputSummary },
    "ai_analysis_record",
    seedAiAnalysisId,
    "outputEnvelope",
    encryptionKey,
  );
  const aiAnalysisData = {
    patientId: patient.id,
    assessmentId: assessment.id,
    trainingSessionId: null,
    analysisScene: "assessment_summary",
    modelVersion: "Cog-MMSE-2026.04",
    confidence: 0.84,
    inputEnvelope: aiInputEnvelope,
    outputEnvelope: aiOutputEnvelope,
  };
  await prisma.aiAnalysisRecord.upsert({
    where: { id: seedAiAnalysisId },
    update: aiAnalysisData,
    create: {
      id: seedAiAnalysisId,
      ...aiAnalysisData,
    },
  });

  await prisma.rehabPlan.updateMany({
    where: {
      patientId: patient.id,
      isCurrent: true,
      NOT: { id: seedRehabPlanId },
    },
    data: { isCurrent: false, status: "ended" },
  });

  const rehabPlanData = {
    patientId: patient.id,
    doctorId: doctor.id,
    source: "seed_clinician_approved_plan",
    planName: "第1周个性化康复训练计划",
    status: "active" as const,
    isCurrent: true,
    weekFrequency: 4,
    dailyDuration: 20,
    difficultyLadder: {
      rhythmReach: "standard -> advanced",
      poseReaction: "基础 -> 标准",
    },
    recommendationReason:
      "依据 MMSE 反应和注意分项波动，训练优先覆盖上肢触达、反应速度与动作准确率。",
    confirmedAt: new Date("2026-04-27T01:50:00.000Z"),
  };
  const rehabPlan = await prisma.rehabPlan.upsert({
    where: { id: seedRehabPlanId },
    update: rehabPlanData,
    create: {
      id: seedRehabPlanId,
      ...rehabPlanData,
    },
  });

  const releasedPlanGames = games.filter(
    (game) =>
      game.status === "active" &&
      game.buildStatus === "released" &&
      game.releaseChannel === "production",
  );

  const planItems = await Promise.all(
    releasedPlanGames.map((game, index) =>
      prisma.rehabPlanItem.upsert({
        where: {
          rehabPlanId_gameContentId: {
            rehabPlanId: rehabPlan.id,
            gameContentId: game.id,
          },
        },
        update: {
          sequence: index + 1,
          durationMinutes:
            game.code === "rhythm_reach_3d" ? 6 : game.defaultDuration,
          frequencyPerWeek: game.code === "path_treasure" ? 3 : 4,
          difficulty:
            game.code === "rhythm_reach_3d"
              ? "standard"
              : game.defaultDifficulty,
          adaptiveRules: {
            increaseWhenAccuracyAbove: 0.9,
            reduceWhenMissesAbove: 5,
          },
        },
        create: {
          rehabPlanId: rehabPlan.id,
          gameContentId: game.id,
          sequence: index + 1,
          durationMinutes:
            game.code === "rhythm_reach_3d" ? 6 : game.defaultDuration,
          frequencyPerWeek: game.code === "path_treasure" ? 3 : 4,
          difficulty:
            game.code === "rhythm_reach_3d"
              ? "standard"
              : game.defaultDifficulty,
          adaptiveRules: {
            increaseWhenAccuracyAbove: 0.9,
            reduceWhenMissesAbove: 5,
          },
        },
      }),
    ),
  );

  const planAdjustmentData = {
    rehabPlanId: rehabPlan.id,
    doctorId: doctor.id,
    originalSnapshot: {
      dailyDuration: 24,
      rhythmReachSpeed: "standard -> advanced",
      weekFrequency: 5,
    },
    adjustedSnapshot: {
      dailyDuration: 20,
      rhythmReachSpeed: "standard",
      weekFrequency: 4,
    },
    adjustmentReason: "患者近期肩部不适，先降低上肢反应训练速度。",
    createdAt: new Date("2026-04-27T01:55:00.000Z"),
  };
  await prisma.planAdjustmentRecord.upsert({
    where: { id: seedPlanAdjustmentId },
    update: planAdjustmentData,
    create: {
      id: seedPlanAdjustmentId,
      ...planAdjustmentData,
    },
  });

  const rhythmItem = planItems.find((item) =>
    games.find(
      (game) =>
        game.id === item.gameContentId && game.code === "rhythm_reach_3d",
    ),
  );
  const rhythmGame = games.find((game) => game.code === "rhythm_reach_3d");

  if (!rhythmItem || !rhythmGame) {
    throw new Error(
      "Seed training sample requires rhythm_reach_3d plan item and game.",
    );
  }

  const trainingSessionData = {
    patientId: patient.id,
    rehabPlanId: rehabPlan.id,
    planItemId: rhythmItem.id,
    gameContentId: rhythmGame.id,
    collectionBatchId: null,
    sessionStatus: "completed" as const,
    startedAt: new Date("2026-04-27T02:00:00.000Z"),
    endedAt: new Date("2026-04-27T02:08:00.000Z"),
    syncStatus: "synced" as const,
    gameRunId: "seed-run-rhythm-001",
    clientStartedAt: new Date("2026-04-27T02:00:00.000Z"),
    clientEndedAt: new Date("2026-04-27T02:08:00.000Z"),
    deviceCode: "seed-camera-001",
    calibrationStatus: "completed",
    runtimeConfigSnapshot: {
      source: "seed_import",
      gameCode: "rhythm_reach_3d",
      gameVersion: "0.1.0",
      manifestUrl: "/unity/rhythm_reach_3d/0.1.0/manifest.json",
      buildBaseUrl: "/unity/rhythm_reach_3d/0.1.0",
      bridgeProtocolVersion: "1.0.0",
    },
    unityBuildVersion: "0.1.0",
    bridgeProtocolVersion: "1.0.0",
  };
  const session = await prisma.trainingSession.upsert({
    where: {
      patientId_idempotencyKey: {
        patientId: patient.id,
        idempotencyKey: "seed-rhythm-session-001",
      },
    },
    update: trainingSessionData,
    create: {
      idempotencyKey: "seed-rhythm-session-001",
      ...trainingSessionData,
    },
  });

  const existingTrainingResult = await prisma.trainingResult.findUnique({
    where: { sessionId: session.id },
    select: { id: true },
  });
  const trainingResultId = existingTrainingResult?.id ?? seedTrainingResultId;
  const trainingReviewEnvelope = seedEnvelope(
    {
      reviewNote:
        "Seeded reviewed training result for deterministic manual smoke.",
    },
    "training_result",
    trainingResultId,
    "reviewEnvelope",
    encryptionKey,
  );
  const trainingResultData = {
    sessionId: session.id,
    collectionBatchId: null,
    source: "unity_webgl",
    gameRunId: "seed-run-rhythm-001",
    gameVersion: "0.1.0",
    bridgeProtocolVersion: "1.0.0",
    submittedByUserId: patientUser.id,
    submittedAt: new Date("2026-04-27T02:08:05.000Z"),
    clientGeneratedAt: new Date("2026-04-27T02:08:00.000Z"),
    rawPayloadHash: "seed-rhythm-result-001",
    score: 92,
    completionRate: 0.96,
    durationSeconds: 480,
    reactionTimeMs: 820,
    motionAccuracy: 0.91,
    exerciseIntensity: "moderate",
    abnormalFlag: false,
    qualityFlag: "valid",
    qualityReasons: [],
    reviewStatus: "reviewed",
    reviewConclusion: "accepted_valid",
    reviewEnvelope: trainingReviewEnvelope,
    reviewedByUserId: doctorUser.id,
    reviewedAt: new Date("2026-04-27T02:09:00.000Z"),
    metricsSummary: {
      source: "unity_webgl",
      gameRunId: "seed-run-rhythm-001",
      gameVersion: "0.1.0",
      protocolVersion: "1.0.0",
      rawPayloadHash: "seed-rhythm-result-001",
      validActions: 86,
      difficultyLevel: 2,
    },
  };
  await prisma.trainingResult.upsert({
    where: { sessionId: session.id },
    update: trainingResultData,
    create: { id: trainingResultId, ...trainingResultData },
  });

  const motionMetrics = [
    ["seed-motion-reaction-time", "reaction_time_ms", 820, "ms", 0.96],
    ["seed-motion-target-hit-rate", "target_hit_rate", 0.96, "ratio", 0.94],
    [
      "seed-motion-arm-raise-accuracy",
      "arm_raise_accuracy",
      0.91,
      "ratio",
      0.94,
    ],
    ["seed-motion-duration-seconds", "duration_seconds", 480, "seconds", 1],
    ["seed-motion-difficulty-level", "difficulty_level", 2, "level", 0.88],
  ] as const;
  for (const [id, metricType, metricValue, unit, confidence] of motionMetrics) {
    const metricData = {
      trainingSessionId: session.id,
      collectionBatchId: null,
      gameRunId: "seed-run-rhythm-001",
      source: "unity_webgl",
      metricType,
      metricValue,
      unit,
      confidence,
      sampleCount: 86,
      rawSummary: { source: "seed_import" },
    };
    await prisma.motionMetric.upsert({
      where: { id },
      update: metricData,
      create: {
        id,
        ...metricData,
      },
    });
  }

  const auditLogs = [
    {
      id: "seed-audit-plan-adjust",
      actorUserId: doctorUser.id,
      actorRole: "doctor" as const,
      action: "plan.adjust",
      targetType: "rehab_plan",
      targetId: rehabPlan.id,
      result: "success" as const,
      metadata: {
        patientNameMasked: "李*",
      },
      createdAt: seedAuditCreatedAt,
    },
    {
      id: "seed-audit-export-desensitized",
      actorUserId: adminUser.id,
      actorRole: "admin" as const,
      action: "audit.export_desensitized",
      targetType: "training_result",
      targetId: session.id,
      result: "success" as const,
      metadata: { dataset: "training-results" },
      createdAt: seedAuditCreatedAt,
    },
    {
      id: "seed-audit-caregiver-summary-view",
      actorUserId: caregiverUser.id,
      actorRole: "caregiver" as const,
      action: "caregiver.summary.view",
      targetType: "patient_profile",
      targetId: patient.id,
      result: "success" as const,
      metadata: { scope: ["summary", "progress"] },
      createdAt: seedAuditCreatedAt,
    },
  ];
  for (const auditLog of auditLogs) {
    await prisma.auditLog.upsert({
      where: { id: auditLog.id },
      update: auditLog,
      create: auditLog,
    });
  }

  console.log("Seed completed. Local initialization accounts are ready.");
}

if (require.main === module) {
  void main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
