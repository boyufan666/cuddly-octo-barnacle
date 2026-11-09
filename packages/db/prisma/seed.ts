import { Prisma, PrismaClient, RoleCode } from "@prisma/client";
import { hkdfSync, randomUUID } from "node:crypto";
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
import {
  createProviderOperationRequestHmac,
  createProviderOperationRequestIntentHmac,
  createProviderOperationResponseHmac,
} from "../src/provider-operation";

const prisma = new PrismaClient();

const seedMedicalRecordNo = "SEED-ALZ-0001";
const seedAssessmentId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b201";
const seedRiskGradeId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b202";
const seedAiAnalysisId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b203";
const seedTrainingResultId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b204";
const seedPatientProfileId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b205";
const seedProviderOperationId = "6d8dfde7-6b95-4ca2-8d1a-2af98927b206";
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
const seedAssessmentSource = "production_ai_assessment" as const;
const seedAssessmentTranscript = "今天是星期一。苹果、桌子、硬币。";
const seedAssessmentAnalysisSummary =
  "患者近记忆、反应和执行力存在波动，建议以近记忆、反应和执行力训练为主。";
const seedAssessmentModelVersion = "mimo-v2.5";
const seedAssessmentProvider = "xiaomi-mimo";
const seedAssessmentEndpoint =
  "https://token-plan-cn.xiaomimimo.com/v1/chat/completions";
const seedAssessmentApiKeyRef = "secret-manager://rehab/mimo-api-key";
const seedAssessmentPromptVersion = "cognitive-assessment-mimo-2026-07";
const seedAssessmentProviderCallId = "ai-call-seed-20260824-001";
const seedAssessmentProviderRequestKey = "seed-assessment-draft-001";
const seedAssessmentProviderStartedAt = new Date(
  "2026-04-27T01:32:00.000Z",
);
const seedAssessmentProviderRespondedAt = new Date(
  "2026-04-27T01:33:00.000Z",
);
const seedAssessmentPhysicalConditions = ["no_known_limitations"];
const seedAssessmentScoreSummary = {
  mmse: 20,
  cdr: 1,
  memory: 48,
  orientation: 58,
  executive: 52,
  language: 73,
};
const seedAssessmentConfidence = 0.84;
const providerOperationHmacSalt = Buffer.from(
  "rehab-provider-operation-hmac-v1",
  "utf8",
);
const providerOperationRequestHmacInfo = Buffer.from(
  "canonical-request-hmac",
  "utf8",
);
const providerOperationIntentHmacInfo = Buffer.from(
  "canonical-request-intent-hmac",
  "utf8",
);
const providerOperationResponseHmacInfo = Buffer.from(
  "canonical-response-hmac",
  "utf8",
);
const seedProviderOperationOutboxEvents = [
  "provider_operation_accepted",
  "provider_operation_dispatching",
  "provider_operation_finalized",
] as const;
const customerEmptyDatabaseConfirmation =
  "I_UNDERSTAND_CUSTOMER_SEED_REQUIRES_A_NEW_EMPTY_DATABASE";
const accountPattern = /^[A-Za-z0-9_.-]{4,32}$/;
const organizationCodePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

type SeedMode = "main" | "customer";

type SeedUserConfig = {
  id: string;
  account: string;
  displayName: string;
  mobilePhone: string;
  passwordHash: string;
};

type SeedInitializationConfig = {
  mode: SeedMode;
  organization: {
    code: string;
    name: string;
    type: string;
  };
  users: {
    admin: SeedUserConfig;
    operator: SeedUserConfig;
    auditor: SeedUserConfig;
    doctor: SeedUserConfig;
    patient: SeedUserConfig;
    caregiver: SeedUserConfig;
  };
  doctor: {
    title: string;
    department: string;
  };
  patient: {
    id: string;
    name: string;
    gender: string;
    age: number;
    careDetails: Prisma.JsonObject;
  };
  caregiver: {
    name: string;
    relation: string;
  };
  authorization?: {
    authorizedAt: Date;
    consentGrantedAt: Date;
    consentIds: Record<
      | "privacy_policy"
      | "ai_processing"
      | "camera_capture"
      | "microphone_capture"
      | "caregiver_sharing",
      string
    >;
    evidenceSnapshot: Prisma.JsonObject;
  };
};

type CustomerInitializationInput = Omit<
  SeedInitializationConfig,
  "mode" | "users"
> & {
  users: {
    [Key in keyof SeedInitializationConfig["users"]]: Omit<
      SeedInitializationConfig["users"][Key],
      "passwordHash"
    > & { password: string };
  };
};

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

export function parseSeedMode(args: string[]): SeedMode {
  if (args.length === 0) return "main";
  if (args.length === 1 && args[0] === "--mode=customer") return "customer";
  throw new Error(
    "Unsupported seed arguments. Use the default main seed with no arguments or the customer entry with --mode=customer.",
  );
}

function requireCustomerText(
  environment: Record<string, string | undefined>,
  name: string,
  maximumLength = 128,
) {
  const value = environment[name];
  if (!value || value.trim() !== value || value.length > maximumLength) {
    throw new Error(
      `${name} must be an exact non-empty value of at most ${maximumLength} characters.`,
    );
  }
  return value;
}

function requireCustomerAccount(
  environment: Record<string, string | undefined>,
  name: string,
) {
  const value = requireCustomerText(environment, name, 32);
  if (!accountPattern.test(value)) {
    throw new Error(
      `${name} must be 4-32 letters, numbers, underscores, dots, or hyphens.`,
    );
  }
  return value;
}

function requireCustomerPassword(
  environment: Record<string, string | undefined>,
  name: string,
) {
  if (environment[name] === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return validateCredentialPassword(environment[name]);
}

export function requireCustomerInitializationInput(
  environment: Record<string, string | undefined>,
): CustomerInitializationInput {
  if (
    environment.CUSTOMER_SEED_CONFIRM_EMPTY_DATABASE !==
    customerEmptyDatabaseConfirmation
  ) {
    throw new Error(
      `Customer initialization requires CUSTOMER_SEED_CONFIRM_EMPTY_DATABASE=${customerEmptyDatabaseConfirmation}. It never merges into a populated database.`,
    );
  }

  const organizationCode = requireCustomerText(
    environment,
    "CUSTOMER_ORG_CODE",
    64,
  );
  if (!organizationCodePattern.test(organizationCode)) {
    throw new Error("CUSTOMER_ORG_CODE has an unsupported format.");
  }

  const patientAgeValue = requireCustomerText(
    environment,
    "CUSTOMER_PATIENT_AGE",
    3,
  );
  if (!/^(?:[1-9]|[1-9][0-9]|1[01][0-9]|120)$/.test(patientAgeValue)) {
    throw new Error("CUSTOMER_PATIENT_AGE must be an integer from 1 to 120.");
  }
  const patientGender = requireCustomerText(
    environment,
    "CUSTOMER_PATIENT_GENDER",
    16,
  );
  if (!new Set(["female", "male", "unspecified"]).has(patientGender)) {
    throw new Error(
      "CUSTOMER_PATIENT_GENDER must be female, male, or unspecified.",
    );
  }

  const patientName = requireCustomerText(environment, "CUSTOMER_PATIENT_NAME");
  const caregiverName = requireCustomerText(
    environment,
    "CUSTOMER_CAREGIVER_NAME",
  );
  const users = {
    admin: {
      id: randomUUID(),
      account: requireCustomerAccount(environment, "CUSTOMER_ADMIN_ACCOUNT"),
      displayName: requireCustomerText(
        environment,
        "CUSTOMER_ADMIN_DISPLAY_NAME",
      ),
      mobilePhone: requireCustomerText(
        environment,
        "CUSTOMER_ADMIN_MOBILE_PHONE",
        32,
      ),
      password: requireCustomerPassword(
        environment,
        "CUSTOMER_ADMIN_INITIAL_PASSWORD",
      ),
    },
    operator: {
      id: randomUUID(),
      account: requireCustomerAccount(environment, "CUSTOMER_OPERATOR_ACCOUNT"),
      displayName: requireCustomerText(
        environment,
        "CUSTOMER_OPERATOR_DISPLAY_NAME",
      ),
      mobilePhone: requireCustomerText(
        environment,
        "CUSTOMER_OPERATOR_MOBILE_PHONE",
        32,
      ),
      password: requireCustomerPassword(
        environment,
        "CUSTOMER_OPERATOR_INITIAL_PASSWORD",
      ),
    },
    auditor: {
      id: randomUUID(),
      account: requireCustomerAccount(environment, "CUSTOMER_AUDITOR_ACCOUNT"),
      displayName: requireCustomerText(
        environment,
        "CUSTOMER_AUDITOR_DISPLAY_NAME",
      ),
      mobilePhone: requireCustomerText(
        environment,
        "CUSTOMER_AUDITOR_MOBILE_PHONE",
        32,
      ),
      password: requireCustomerPassword(
        environment,
        "CUSTOMER_AUDITOR_INITIAL_PASSWORD",
      ),
    },
    doctor: {
      id: randomUUID(),
      account: requireCustomerAccount(environment, "CUSTOMER_DOCTOR_ACCOUNT"),
      displayName: requireCustomerText(
        environment,
        "CUSTOMER_DOCTOR_DISPLAY_NAME",
      ),
      mobilePhone: requireCustomerText(
        environment,
        "CUSTOMER_DOCTOR_MOBILE_PHONE",
        32,
      ),
      password: requireCustomerPassword(
        environment,
        "CUSTOMER_DOCTOR_INITIAL_PASSWORD",
      ),
    },
    patient: {
      id: randomUUID(),
      account: requireCustomerAccount(environment, "CUSTOMER_PATIENT_ACCOUNT"),
      displayName: patientName,
      mobilePhone: requireCustomerText(
        environment,
        "CUSTOMER_PATIENT_MOBILE_PHONE",
        32,
      ),
      password: requireCustomerPassword(
        environment,
        "CUSTOMER_PATIENT_INITIAL_PASSWORD",
      ),
    },
    caregiver: {
      id: randomUUID(),
      account: requireCustomerAccount(
        environment,
        "CUSTOMER_CAREGIVER_ACCOUNT",
      ),
      displayName: caregiverName,
      mobilePhone: requireCustomerText(
        environment,
        "CUSTOMER_CAREGIVER_MOBILE_PHONE",
        32,
      ),
      password: requireCustomerPassword(
        environment,
        "CUSTOMER_CAREGIVER_INITIAL_PASSWORD",
      ),
    },
  };

  const accountValues = Object.values(users).map((user) => user.account);
  if (new Set(accountValues).size !== accountValues.length) {
    throw new Error("All CUSTOMER_*_ACCOUNT values must be different.");
  }
  const mobilePhoneValues = Object.values(users).map(
    (user) => user.mobilePhone,
  );
  if (new Set(mobilePhoneValues).size !== mobilePhoneValues.length) {
    throw new Error("All CUSTOMER_*_MOBILE_PHONE values must be different.");
  }
  const passwordValues = Object.values(users).map((user) => user.password);
  if (new Set(passwordValues).size !== passwordValues.length) {
    throw new Error(
      "All CUSTOMER_*_INITIAL_PASSWORD values must be different.",
    );
  }

  const medicalRecordNo = requireCustomerText(
    environment,
    "CUSTOMER_PATIENT_MEDICAL_RECORD_NO",
    64,
  );
  return {
    organization: {
      code: organizationCode,
      name: requireCustomerText(environment, "CUSTOMER_ORG_NAME"),
      type: requireCustomerText(environment, "CUSTOMER_ORG_TYPE", 64),
    },
    users,
    doctor: {
      title: requireCustomerText(environment, "CUSTOMER_DOCTOR_TITLE"),
      department: requireCustomerText(
        environment,
        "CUSTOMER_DOCTOR_DEPARTMENT",
      ),
    },
    patient: {
      id: randomUUID(),
      name: patientName,
      gender: patientGender,
      age: Number(patientAgeValue),
      careDetails: { healthMetrics: { medicalRecordNo } },
    },
    caregiver: {
      name: caregiverName,
      relation: requireCustomerText(
        environment,
        "CUSTOMER_CAREGIVER_RELATION",
        64,
      ),
    },
  };
}

function mainSeedInitializationConfig(
  passwordHash: string,
): SeedInitializationConfig {
  return {
    mode: "main",
    organization: {
      name: "大连理工康复示范中心",
      code: "dlut-rehab",
      type: "rehab_center",
    },
    users: {
      admin: {
        id: seedUserIds.admin,
        account: "admin",
        displayName: "平台超级管理员",
        mobilePhone: "13900000000",
        passwordHash,
      },
      operator: {
        id: seedUserIds.operator001,
        account: "operator001",
        displayName: "运营管理员",
        mobilePhone: "13900000002",
        passwordHash,
      },
      auditor: {
        id: seedUserIds.auditor001,
        account: "auditor001",
        displayName: "审计管理员",
        mobilePhone: "13900000003",
        passwordHash,
      },
      doctor: {
        id: seedUserIds.doctor001,
        account: "doctor001",
        displayName: "王医生",
        mobilePhone: "13900000001",
        passwordHash,
      },
      patient: {
        id: seedUserIds.patient001,
        account: "patient001",
        displayName: "李秀兰",
        mobilePhone: "13800006721",
        passwordHash,
      },
      caregiver: {
        id: seedUserIds.caregiver001,
        account: "caregiver001",
        displayName: "李明",
        mobilePhone: "13900008206",
        passwordHash,
      },
    },
    doctor: {
      title: "主任康复治疗师",
      department: "认知康复科",
    },
    patient: {
      id: seedPatientProfileId,
      name: "李秀兰",
      gender: "female",
      age: 72,
      careDetails: {
        healthMetrics: {
          medicalRecordNo: seedMedicalRecordNo,
          bloodPressure: "132/82",
          heartRate: 76,
          gaitRisk: "low",
        },
      },
    },
    caregiver: {
      name: "李明",
      relation: "儿子",
    },
    authorization: {
      authorizedAt: new Date("2026-04-27T02:00:00.000Z"),
      consentGrantedAt: seedConsentGrantedAt,
      consentIds: {
        privacy_policy: "seed-consent-privacy_policy",
        ai_processing: "seed-consent-ai_processing",
        camera_capture: "seed-consent-camera_capture",
        microphone_capture: "seed-consent-microphone_capture",
        caregiver_sharing: "seed-consent-caregiver_sharing",
      },
      evidenceSnapshot: {
        source: "seed",
        userAgent: "rehab-platform-seed",
      },
    },
  };
}

async function customerSeedInitializationConfig(
  input: CustomerInitializationInput,
): Promise<SeedInitializationConfig> {
  const [admin, operator, auditor, doctor, patient, caregiver] =
    await Promise.all(
      (
        [
          input.users.admin,
          input.users.operator,
          input.users.auditor,
          input.users.doctor,
          input.users.patient,
          input.users.caregiver,
        ] as const
      ).map(async ({ password, ...user }) => ({
        ...user,
        passwordHash: await hashCredential(password),
      })),
    );
  return {
    ...input,
    mode: "customer",
    users: { admin, operator, auditor, doctor, patient, caregiver },
  };
}

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

type SeedProviderOperationDatabase = Pick<
  Prisma.TransactionClient,
  "providerOperation" | "providerOperationOutbox"
>;

type SeedProviderOperationRow = {
  id: string;
  organizationId: string | null;
  patientId: string | null;
  actorUserId: string | null;
  operation: string;
  clientIdempotencyKey: string;
  canonicalRequestHmac: string;
  requestIntentHmac: string | null;
  requestCiphertext: Prisma.JsonValue;
  expectedBusinessObjectType: string | null;
  expectedBusinessObjectId: string | null;
  expectedBusinessObjectVersion: string | null;
  provider: string;
  modelVersion: string;
  endpointHost: string;
  apiKeyRef: string;
  promptVersion: string | null;
  providerCallId: string | null;
  providerRequestId: string | null;
  status: string;
  responseCiphertext: Prisma.JsonValue | null;
  responseHmac: string | null;
  failureCategory: string | null;
  providerStartedAt: Date | null;
  providerRespondedAt: Date | null;
  completedAt: Date | null;
  finalizedAt: Date | null;
};

function providerOperationAad(
  operationId: string,
  fieldName: "requestCiphertext" | "responseCiphertext",
) {
  return {
    tableName: "provider_operation",
    recordId: operationId,
    fieldName,
  };
}

function deriveProviderOperationHmacKey(
  encryptionKey: SensitiveEncryptionKey,
  info: Buffer,
) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      encryptionKey.key,
      providerOperationHmacSalt,
      info,
      32,
    ),
  );
}

function buildSeedAssessmentResultPayload(
  reviewerUserId: string,
): Prisma.JsonObject {
  return {
    scoreSummary: seedAssessmentScoreSummary,
    physicalConditions: [...seedAssessmentPhysicalConditions],
    rawInputSummary: {
      source: seedAssessmentSource,
      medicalRecordNo: seedMedicalRecordNo,
      transcript: seedAssessmentTranscript,
      analysisSummary: seedAssessmentAnalysisSummary,
      modelVersion: seedAssessmentModelVersion,
      confidence: seedAssessmentConfidence,
      physicalConditions: [...seedAssessmentPhysicalConditions],
      reactionDelaySeconds: 2.4,
      evidence: {
        provider: seedAssessmentProvider,
        model: seedAssessmentModelVersion,
        modelVersion: seedAssessmentModelVersion,
        callId: seedAssessmentProviderCallId,
        endpointRef: seedAssessmentEndpoint,
        apiKeyRef: seedAssessmentApiKeyRef,
        promptVersion: seedAssessmentPromptVersion,
        calledAt: seedAssessmentProviderStartedAt.toISOString(),
        humanReview: {
          required: true,
          reviewerUserId,
          reviewedAt: seedConfirmedAt.toISOString(),
          conclusion: "approved",
        },
      },
    },
  } as Prisma.JsonObject;
}

function buildSeedProviderOperationRequest(): Prisma.JsonObject {
  return {
    assessmentType: "MMSE/CDR",
    transcript: seedAssessmentTranscript,
    physicalConditions: [...seedAssessmentPhysicalConditions],
  };
}

function buildSeedProviderOperationResponse(patientId: string): Prisma.JsonObject {
  return {
    providerContent: JSON.stringify({
      scoreSummary: seedAssessmentScoreSummary,
      analysisSummary: seedAssessmentAnalysisSummary,
      confidence: seedAssessmentConfidence,
      physicalConditions: seedAssessmentPhysicalConditions,
    }),
    result: {
      patientId,
      assessmentType: "MMSE/CDR",
      status: "pending_human_review",
      riskLevel: "moderate",
      scoreSummary: seedAssessmentScoreSummary,
      rawInputSummary: {
        transcript: seedAssessmentTranscript,
        analysisSummary: seedAssessmentAnalysisSummary,
        modelVersion: seedAssessmentModelVersion,
        confidence: seedAssessmentConfidence,
        physicalConditions: [...seedAssessmentPhysicalConditions],
      },
      physicalConditions: [...seedAssessmentPhysicalConditions],
    },
  } as Prisma.JsonObject;
}

function buildSeedProviderOperation(
  organizationId: string,
  patientId: string,
  actorUserId: string,
  encryptionKey: SensitiveEncryptionKey,
) {
  const identity = {
    organizationId,
    patientId,
    actorUserId,
    operation: "assessment_draft" as const,
    clientIdempotencyKey: seedAssessmentProviderRequestKey,
  };
  const request = buildSeedProviderOperationRequest();
  const response = buildSeedProviderOperationResponse(patientId);
  const requestCiphertext = encryptSensitiveJson(
    request,
    providerOperationAad(seedProviderOperationId, "requestCiphertext"),
    encryptionKey,
  );
  const responseCiphertext = encryptSensitiveJson(
    response,
    providerOperationAad(seedProviderOperationId, "responseCiphertext"),
    encryptionKey,
  );

  return {
    id: seedProviderOperationId,
    ...identity,
    canonicalRequestHmac: createProviderOperationRequestHmac(
      identity,
      request,
      deriveProviderOperationHmacKey(
        encryptionKey,
        providerOperationRequestHmacInfo,
      ),
    ),
    requestIntentHmac: createProviderOperationRequestIntentHmac(
      identity,
      request,
      deriveProviderOperationHmacKey(
        encryptionKey,
        providerOperationIntentHmacInfo,
      ),
    ),
    requestCiphertext,
    expectedBusinessObjectType: null,
    expectedBusinessObjectId: null,
    expectedBusinessObjectVersion: null,
    provider: seedAssessmentProvider,
    modelVersion: seedAssessmentModelVersion,
    endpointHost: new URL(seedAssessmentEndpoint).host,
    apiKeyRef: seedAssessmentApiKeyRef,
    promptVersion: seedAssessmentPromptVersion,
    providerCallId: seedAssessmentProviderCallId,
    providerRequestId: null,
    status: "completed",
    responseCiphertext,
    responseHmac: createProviderOperationResponseHmac(
      seedProviderOperationId,
      response,
      deriveProviderOperationHmacKey(
        encryptionKey,
        providerOperationResponseHmacInfo,
      ),
    ),
    failureCategory: null,
    providerStartedAt: seedAssessmentProviderStartedAt,
    providerRespondedAt: seedAssessmentProviderRespondedAt,
    completedAt: seedAssessmentProviderRespondedAt,
    finalizedAt: seedAssessmentProviderRespondedAt,
  };
}

function assertSeedProviderOperationRow(
  actual: SeedProviderOperationRow,
  expected: ReturnType<typeof buildSeedProviderOperation>,
  encryptionKey: SensitiveEncryptionKey,
) {
  for (const field of [
    "id",
    "organizationId",
    "patientId",
    "actorUserId",
    "operation",
    "clientIdempotencyKey",
    "canonicalRequestHmac",
    "requestIntentHmac",
    "expectedBusinessObjectType",
    "expectedBusinessObjectId",
    "expectedBusinessObjectVersion",
    "provider",
    "modelVersion",
    "endpointHost",
    "apiKeyRef",
    "promptVersion",
    "providerCallId",
    "providerRequestId",
    "status",
    "responseHmac",
    "failureCategory",
  ] as const) {
    if (actual[field] !== expected[field]) {
      throw new Error(`固定演示供应商账本字段 ${field} 不匹配，已拒绝覆盖。`);
    }
  }
  for (const field of [
    "providerStartedAt",
    "providerRespondedAt",
    "completedAt",
    "finalizedAt",
  ] as const) {
    if (
      actual[field]?.toISOString() !== expected[field]?.toISOString()
    ) {
      throw new Error(`固定演示供应商账本时间字段 ${field} 不匹配，已拒绝覆盖。`);
    }
  }

  const request = decryptSensitiveJson(
    actual.requestCiphertext,
    providerOperationAad(seedProviderOperationId, "requestCiphertext"),
    encryptionKey,
  );
  if (JSON.stringify(request) !== JSON.stringify(buildSeedProviderOperationRequest())) {
    throw new Error("固定演示供应商账本请求证据不匹配，已拒绝覆盖。");
  }
  if (!actual.responseCiphertext || !actual.responseHmac) {
    throw new Error("固定演示供应商账本响应证据缺失，已拒绝覆盖。");
  }
  const response = decryptSensitiveJson(
    actual.responseCiphertext,
    providerOperationAad(seedProviderOperationId, "responseCiphertext"),
    encryptionKey,
  );
  if (
    JSON.stringify(response) !==
    JSON.stringify(buildSeedProviderOperationResponse(expected.patientId!))
  ) {
    throw new Error("固定演示供应商账本响应证据不匹配，已拒绝覆盖。");
  }
  const expectedResponseHmac = createProviderOperationResponseHmac(
    seedProviderOperationId,
    response,
    deriveProviderOperationHmacKey(
      encryptionKey,
      providerOperationResponseHmacInfo,
    ),
  );
  if (actual.responseHmac !== expectedResponseHmac) {
    throw new Error("固定演示供应商账本响应 HMAC 不匹配，已拒绝覆盖。");
  }
}

async function assertSeedProviderOperationOutbox(
  database: SeedProviderOperationDatabase,
) {
  const events = await database.providerOperationOutbox.findMany({
    where: { providerOperationId: seedProviderOperationId },
    select: { eventType: true },
  });
  const actualEvents = new Set(events.map((event) => event.eventType));
  for (const eventType of seedProviderOperationOutboxEvents) {
    if (!actualEvents.has(eventType)) {
      throw new Error(`固定演示供应商账本缺少 outbox 事件 ${eventType}。`);
    }
  }
}

async function ensureSeedProviderOperation(
  database: SeedProviderOperationDatabase,
  organizationId: string,
  patientId: string,
  actorUserId: string,
  encryptionKey: SensitiveEncryptionKey,
) {
  const expected = buildSeedProviderOperation(
    organizationId,
    patientId,
    actorUserId,
    encryptionKey,
  );
  const existingByIdentity = await database.providerOperation.findFirst({
    where: {
      organizationId,
      patientId,
      actorUserId,
      operation: "assessment_draft",
      clientIdempotencyKey: seedAssessmentProviderRequestKey,
    },
    select: { id: true },
  });
  if (existingByIdentity && existingByIdentity.id !== seedProviderOperationId) {
    throw new Error("固定演示供应商账本幂等键已绑定到其他记录，已拒绝覆盖。");
  }
  const existingByCall = await database.providerOperation.findMany({
    where: {
      patientId,
      operation: "assessment_draft",
      providerCallId: seedAssessmentProviderCallId,
    },
    select: { id: true },
  });
  if (
    existingByCall.some((operation) => operation.id !== seedProviderOperationId)
  ) {
    throw new Error("固定演示供应商调用 ID 已绑定到其他记录，已拒绝覆盖。");
  }

  const existing = await database.providerOperation.findUnique({
    where: { id: seedProviderOperationId },
    select: {
      id: true,
      organizationId: true,
      patientId: true,
      actorUserId: true,
      operation: true,
      clientIdempotencyKey: true,
      canonicalRequestHmac: true,
      requestIntentHmac: true,
      requestCiphertext: true,
      expectedBusinessObjectType: true,
      expectedBusinessObjectId: true,
      expectedBusinessObjectVersion: true,
      provider: true,
      modelVersion: true,
      endpointHost: true,
      apiKeyRef: true,
      promptVersion: true,
      providerCallId: true,
      providerRequestId: true,
      status: true,
      responseCiphertext: true,
      responseHmac: true,
      failureCategory: true,
      providerStartedAt: true,
      providerRespondedAt: true,
      completedAt: true,
      finalizedAt: true,
    },
  });
  if (existing) {
    assertSeedProviderOperationRow(existing, expected, encryptionKey);
  } else {
    await database.providerOperation.create({ data: expected });
  }

  for (const eventType of seedProviderOperationOutboxEvents) {
    await database.providerOperationOutbox.upsert({
      where: {
        providerOperationId_eventType: {
          providerOperationId: seedProviderOperationId,
          eventType,
        },
      },
      update: {},
      create: { providerOperationId: seedProviderOperationId, eventType },
    });
  }
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

async function assertCustomerDatabaseIsEmpty(
  database: Prisma.TransactionClient,
) {
  const tables = await database.$queryRaw<Array<{ tableName: string }>>`
    SELECT tablename AS "tableName"
      FROM pg_tables
     WHERE schemaname = current_schema()
       AND tablename <> '_prisma_migrations'
     ORDER BY tablename
  `;
  for (const requiredTable of [
    "role_definition",
    "user",
    "patient_profile",
    "game_content",
  ]) {
    if (!tables.some((table) => table.tableName === requiredTable)) {
      throw new Error(
        `Customer initialization requires deployed Prisma migrations; missing table ${requiredTable}.`,
      );
    }
  }

  const populatedTables: string[] = [];
  for (const { tableName } of tables) {
    if (!/^[a-z][a-z0-9_]*$/.test(tableName)) {
      throw new Error(
        `Customer initialization cannot inspect unsupported table name: ${tableName}`,
      );
    }
    const [row] = await database.$queryRawUnsafe<Array<{ hasRows: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM "${tableName}" LIMIT 1) AS "hasRows"`,
    );
    if (row?.hasRows) populatedTables.push(tableName);
  }
  if (populatedTables.length > 0) {
    throw new Error(
      `Customer initialization requires a new empty database and will not merge, delete, or overwrite existing business data. Populated tables: ${populatedTables.join(
        ", ",
      )}`,
    );
  }
}

async function upsertEncryptedSeedUser(
  database: Prisma.TransactionClient,
  input: {
    id: string;
    account: string;
    displayName: string;
    mobilePhone: string;
    passwordHash: string;
  },
  encryptionKey: SensitiveEncryptionKey,
) {
  const existing = await database.user.findUnique({
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
  return database.user.upsert({
    where: { account: input.account },
    update: data,
    create: { id, account: input.account, ...data },
  });
}

async function initializeSeed(
  database: Prisma.TransactionClient,
  config: SeedInitializationConfig,
  encryptionKey: SensitiveEncryptionKey,
) {
  await database.roleDefinition.createMany({
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

  const organization = await database.organization.upsert({
    where: { code: config.organization.code },
    update: {},
    create: config.organization,
  });

  const adminUser = await upsertEncryptedSeedUser(
    database,
    config.users.admin,
    encryptionKey,
  );
  const operatorUser = await upsertEncryptedSeedUser(
    database,
    config.users.operator,
    encryptionKey,
  );
  const auditorUser = await upsertEncryptedSeedUser(
    database,
    config.users.auditor,
    encryptionKey,
  );
  const doctorUser = await upsertEncryptedSeedUser(
    database,
    config.users.doctor,
    encryptionKey,
  );
  const patientUser = await upsertEncryptedSeedUser(
    database,
    config.users.patient,
    encryptionKey,
  );
  const caregiverUser = await upsertEncryptedSeedUser(
    database,
    config.users.caregiver,
    encryptionKey,
  );

  const doctor = await database.doctorProfile.upsert({
    where: { userId: doctorUser.id },
    update: {},
    create: {
      userId: doctorUser.id,
      organizationId: organization.id,
      title: config.doctor.title,
      department: config.doctor.department,
    },
  });

  const existingPatient = await database.patientProfile.findUnique({
    where: { userId: patientUser.id },
    select: { id: true },
  });
  const patientId = existingPatient?.id ?? config.patient.id;
  const patientIdentityEnvelope = seedEnvelope(
    {
      name: config.patient.name,
      gender: config.patient.gender,
      age: config.patient.age,
    },
    "patient_profile",
    patientId,
    "identityEnvelope",
    encryptionKey,
  );
  const patientContactEnvelope = seedEnvelope(
    {
      mobilePhone: config.users.patient.mobilePhone,
      caregiverName: config.caregiver.name,
      caregiverPhone: config.users.caregiver.mobilePhone,
    },
    "patient_profile",
    patientId,
    "contactEnvelope",
    encryptionKey,
  );
  const patientCareDetailsEnvelope = seedEnvelope(
    config.patient.careDetails,
    "patient_profile",
    patientId,
    "careDetailsEnvelope",
    encryptionKey,
  );
  const patient = await database.patientProfile.upsert({
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
    await database.userRoleBinding.upsert({
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

  if (config.authorization) {
    // Only the isolated main seed carries demo authorization; customer setup
    // must wait for real patient consent and caregiver authorization capture.
    const authorization = config.authorization;
    await database.caregiverRelation.upsert({
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
        relation: config.caregiver.relation,
        authorizedAt: authorization.authorizedAt,
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
        grantedAt: authorization.consentGrantedAt,
        revokedAt: null,
        evidenceSnapshot: authorization.evidenceSnapshot,
      };
      const consentId = authorization.consentIds[consentType];
      await database.consentRecord.upsert({
        where: { id: consentId },
        update: consentData,
        create: {
          id: consentId,
          ...consentData,
        },
      });
    }
  }

  const games = await Promise.all([
    database.gameContent.upsert({
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
    database.gameContent.upsert({
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
    database.gameContent.upsert({
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
    database.gameContent.upsert({
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
    database.gameContent.upsert({
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
    database.gameContent.upsert({
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
    database.gameContent.upsert({
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
    database.gameContent.upsert({
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
    database.gameContent.upsert({
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
          "safety:wheelchair_compatible",
          "safety:upper_limb_limited_compatible",
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
          "safety:wheelchair_compatible",
          "safety:upper_limb_limited_compatible",
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
    ...(config.mode === "main"
      ? [
          database.gameContent.upsert({
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
                {
                  metricType: "selection_accuracy",
                  unit: "ratio",
                  min: 0,
                  max: 1,
                },
                {
                  metricType: "memory_recall_rate",
                  unit: "ratio",
                  min: 0,
                  max: 1,
                },
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
                {
                  metricType: "selection_accuracy",
                  unit: "ratio",
                  min: 0,
                  max: 1,
                },
                {
                  metricType: "memory_recall_rate",
                  unit: "ratio",
                  min: 0,
                  max: 1,
                },
              ],
            },
          }),
          database.gameContent.upsert({
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
                {
                  metricType: "path_completion_rate",
                  unit: "ratio",
                  min: 0,
                  max: 1,
                },
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
                {
                  metricType: "path_completion_rate",
                  unit: "ratio",
                  min: 0,
                  max: 1,
                },
                { metricType: "planning_latency_ms", unit: "ms", min: 0 },
              ],
            },
          }),
        ]
      : []),
  ]);

  const formalCollectionCondition = await database.collectionCondition.upsert({
    where: { code: "standard_formal_collection" },
    update: {
      name: "标准正式训练采集条件",
      description: "用于正式训练前的统一环境、设备与质量要求。",
      environment: {
        network: "online",
        secureContext: true,
        browserFamily: "chromium",
      },
      deviceRequirements: {
        cameraForCameraGames: true,
        microphone: false,
      },
      taskParameters: {
        source: "clinician_approved_collection",
        samplingWindowSeconds: 30,
      },
      qualityRules: {
        minConfidence: 0.8,
        invalidIfAbnormal: true,
      },
      status: "active",
      createdByUserId: adminUser.id,
    },
    create: {
      code: "standard_formal_collection",
      name: "标准正式训练采集条件",
      description: "用于正式训练前的统一环境、设备与质量要求。",
      environment: {
        network: "online",
        secureContext: true,
        browserFamily: "chromium",
      },
      deviceRequirements: {
        cameraForCameraGames: true,
        microphone: false,
      },
      taskParameters: {
        source: "clinician_approved_collection",
        samplingWindowSeconds: 30,
      },
      qualityRules: {
        minConfidence: 0.8,
        invalidIfAbnormal: true,
      },
      status: "active",
      createdByUserId: adminUser.id,
    },
  });

  for (const game of games.filter(
    (item) =>
      item.status === "active" &&
      item.buildStatus === "released" &&
      item.releaseChannel === "production" &&
      item.gameVersion,
  )) {
    const version = game.gameVersion as string;
    const requiredConsentTypes = [
      "privacy_policy",
      "ai_processing",
      ...(game.supportsCamera ? ["camera_capture"] : []),
      ...(game.supportsMicrophone ? ["microphone_capture"] : []),
    ];
    const protocolData = {
      conditionId: formalCollectionCondition.id,
      gameContentId: game.id,
      code: `formal-${game.code}`,
      name: `${game.name}正式采集协议`,
      version,
      runtimeType: game.runtimeType,
      requiredConsentTypes,
      requiredInputModes: game.supportedInputModes,
      requiredMetrics: (Array.isArray(game.requiredMetrics)
        ? game.requiredMetrics
        : []) as Prisma.InputJsonValue,
      conditionRules: {
        physicalConditions: ["no_known_limitations"],
        riskLevels: ["low", "moderate", "high"],
      },
      samplingConfig: {
        windowSeconds: 30,
        minimumSamples: 1,
      },
      qualityGate: { minConfidence: 0.8 },
      status: "active",
      createdByUserId: adminUser.id,
    };
    await database.collectionProtocol.upsert({
      where: {
        code_version: {
          code: protocolData.code,
          version: protocolData.version,
        },
      },
      update: protocolData,
      create: protocolData,
    });
  }

  if (config.mode === "customer") return;

  await ensureSeedProviderOperation(
    database,
    organization.id,
    patient.id,
    doctorUser.id,
    encryptionKey,
  );

  const assessmentResultPayload = buildSeedAssessmentResultPayload(
    doctorUser.id,
  );
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
    source: seedAssessmentSource,
    status: "doctor_confirmed",
    resultEnvelope: assessmentResultEnvelope,
    startedAt: new Date("2026-04-27T01:30:00.000Z"),
    completedAt: seedCompletedAt,
  };
  const assessment = await database.assessmentRecord.upsert({
    where: { id: seedAssessmentId },
    update: assessmentData,
    create: {
      id: seedAssessmentId,
      ...assessmentData,
    },
  });

  await database.riskGradeRecord.updateMany({
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
    manualRiskLevel: "moderate" as const,
    isCurrent: true,
    reasonEnvelope: riskReasonEnvelope,
    confirmedById: doctorUser.id,
    confirmedAt: seedConfirmedAt,
  };
  await database.riskGradeRecord.upsert({
    where: { id: seedRiskGradeId },
    update: riskGradeData,
    create: {
      id: seedRiskGradeId,
      ...riskGradeData,
    },
  });

  const aiInputSummary = {
    medicalRecordNo: seedMedicalRecordNo,
    transcript: seedAssessmentTranscript,
    reactionDelaySeconds: 2.4,
  };
  const aiOutputSummary = {
    riskLevel: "moderate",
    recommendation: seedAssessmentAnalysisSummary,
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
    modelVersion: seedAssessmentModelVersion,
    confidence: seedAssessmentConfidence,
    inputEnvelope: aiInputEnvelope,
    outputEnvelope: aiOutputEnvelope,
  };
  await database.aiAnalysisRecord.upsert({
    where: { id: seedAiAnalysisId },
    update: aiAnalysisData,
    create: {
      id: seedAiAnalysisId,
      ...aiAnalysisData,
    },
  });

  await database.rehabPlan.updateMany({
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
  const rehabPlan = await database.rehabPlan.upsert({
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
      database.rehabPlanItem.upsert({
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
  await database.planAdjustmentRecord.upsert({
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

  const rhythmGameVersion = rhythmGame.gameVersion;
  const rhythmManifestUrl = rhythmGame.manifestUrl;
  const rhythmBuildBaseUrl = rhythmGame.buildBaseUrl;
  if (!rhythmGameVersion || !rhythmManifestUrl || !rhythmBuildBaseUrl) {
    throw new Error(
      "Seed training sample requires a released rhythm_reach_3d runtime manifest.",
    );
  }

  const rhythmRuntime = {
    gameCode: rhythmGame.code,
    gameVersion: rhythmGameVersion,
    manifestUrl: rhythmManifestUrl,
    buildBaseUrl: rhythmBuildBaseUrl,
    bridgeProtocolVersion: rhythmGame.bridgeProtocolVersion,
  };

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
      ...rhythmRuntime,
    },
    unityBuildVersion: rhythmRuntime.gameVersion,
    bridgeProtocolVersion: rhythmRuntime.bridgeProtocolVersion,
  };
  const session = await database.trainingSession.upsert({
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

  const existingTrainingResult = await database.trainingResult.findUnique({
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
    gameVersion: rhythmRuntime.gameVersion,
    bridgeProtocolVersion: rhythmRuntime.bridgeProtocolVersion,
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
      gameVersion: rhythmRuntime.gameVersion,
      protocolVersion: rhythmRuntime.bridgeProtocolVersion,
      rawPayloadHash: "seed-rhythm-result-001",
      validActions: 86,
      difficultyLevel: 2,
    },
  };
  await database.trainingResult.upsert({
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
    await database.motionMetric.upsert({
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
    await database.auditLog.upsert({
      where: { id: auditLog.id },
      update: auditLog,
      create: auditLog,
    });
  }

  console.log("Seed completed. Local initialization accounts are ready.");
}

async function main() {
  loadRootEnv();
  const mode = parseSeedMode(process.argv.slice(2));
  const encryptionKey = requireSensitiveBackfillKey(process.env);

  if (mode === "main") {
    const passwordHash = await hashCredential(requireSeedPassword());
    await preflightExistingSeedEnvelopes(encryptionKey);
    await initializeSeed(
      prisma,
      mainSeedInitializationConfig(passwordHash),
      encryptionKey,
    );
    return;
  }

  const config = await customerSeedInitializationConfig(
    requireCustomerInitializationInput(process.env),
  );
  await prisma.$transaction(
    async (database) => {
      await assertCustomerDatabaseIsEmpty(database);
      await initializeSeed(database, config, encryptionKey);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
  console.log(
    "Customer initialization completed on a new empty database. Accounts, patient profile, and the formal game library are ready; no patient consent or caregiver authorization was created, and no assessment, current risk, rehabilitation plan, or training record was created.",
  );
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
