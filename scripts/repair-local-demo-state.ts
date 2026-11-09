import { Prisma, PrismaClient } from "@prisma/client";
import { hkdfSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { requireSensitiveBackfillKey } from "../packages/db/src/backfill-sensitive-encryption";
import {
  createProviderOperationRequestHmac,
  createProviderOperationRequestIntentHmac,
  createProviderOperationResponseHmac,
} from "../packages/db/src/provider-operation";
import {
  decryptSensitiveJson,
  encryptSensitiveJson,
  type SensitiveEncryptionKey,
} from "../packages/db/src/sensitive-encryption";

const ids = {
  admin: "6d8dfde7-6b95-4ca2-8d1a-2af98927b101",
  doctor: "6d8dfde7-6b95-4ca2-8d1a-2af98927b104",
  patientUser: "6d8dfde7-6b95-4ca2-8d1a-2af98927b105",
  patient: "6d8dfde7-6b95-4ca2-8d1a-2af98927b205",
  assessment: "6d8dfde7-6b95-4ca2-8d1a-2af98927b201",
  risk: "6d8dfde7-6b95-4ca2-8d1a-2af98927b202",
  providerOperation: "6d8dfde7-6b95-4ca2-8d1a-2af98927b206",
  plan: "seed-rehab-plan-week-001",
} as const;

const confirmedAt = "2026-04-27T01:45:00.000Z";
const medicalRecordNo = "SEED-ALZ-0001";
const assessmentSource = "production_ai_assessment" as const;
const assessmentTranscript = "今天是星期一。苹果、桌子、硬币。";
const assessmentAnalysisSummary =
  "患者近记忆、反应和执行力存在波动，建议以近记忆、反应和执行力训练为主。";
const assessmentModelVersion = "mimo-v2.5";
const assessmentProvider = "xiaomi-mimo";
const assessmentEndpoint =
  "https://token-plan-cn.xiaomimimo.com/v1/chat/completions";
const assessmentApiKeyRef = "secret-manager://rehab/mimo-api-key";
const assessmentPromptVersion = "cognitive-assessment-mimo-2026-07";
const assessmentProviderCallId = "ai-call-seed-20260824-001";
const assessmentProviderRequestKey = "seed-assessment-draft-001";
const assessmentProviderStartedAt = "2026-04-27T01:32:00.000Z";
const assessmentProviderRespondedAt = "2026-04-27T01:33:00.000Z";
const assessmentPhysicalConditions = ["no_known_limitations"];
const assessmentScoreSummary = {
  mmse: 20,
  cdr: 1,
  memory: 48,
  orientation: 58,
  executive: 52,
  language: 73,
};
const assessmentConfidence = 0.84;
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
const providerOperationOutboxEvents = [
  "provider_operation_accepted",
  "provider_operation_dispatching",
  "provider_operation_finalized",
] as const;

function loadRootEnv() {
  const envPath = resolve(__dirname, "../.env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
}

function assertCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  assertCondition(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} 格式异常，已拒绝修改。`,
  );
  return value as Record<string, unknown>;
}

function sameJson(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}

function encryptAssessmentPayload(
  payload: Prisma.JsonObject,
  key: SensitiveEncryptionKey,
): Prisma.InputJsonValue {
  const envelope = encryptSensitiveJson(
    payload,
    {
      tableName: "assessment_record",
      recordId: ids.assessment,
      fieldName: "resultEnvelope",
    },
    key,
  );
  return { ...envelope, aad: { ...envelope.aad } } as Prisma.InputJsonValue;
}

type RepairProviderOperationDatabase = Pick<
  Prisma.TransactionClient,
  "providerOperation" | "providerOperationOutbox"
>;

type RepairProviderOperationRow = {
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
  key: SensitiveEncryptionKey,
  info: Buffer,
) {
  return Buffer.from(
    hkdfSync("sha256", key.key, providerOperationHmacSalt, info, 32),
  );
}

function buildAssessmentPayload(): Prisma.JsonObject {
  return {
    scoreSummary: assessmentScoreSummary,
    physicalConditions: [...assessmentPhysicalConditions],
    rawInputSummary: {
      source: assessmentSource,
      medicalRecordNo,
      transcript: assessmentTranscript,
      analysisSummary: assessmentAnalysisSummary,
      modelVersion: assessmentModelVersion,
      confidence: assessmentConfidence,
      physicalConditions: [...assessmentPhysicalConditions],
      reactionDelaySeconds: 2.4,
      evidence: {
        provider: assessmentProvider,
        model: assessmentModelVersion,
        modelVersion: assessmentModelVersion,
        callId: assessmentProviderCallId,
        endpointRef: assessmentEndpoint,
        apiKeyRef: assessmentApiKeyRef,
        promptVersion: assessmentPromptVersion,
        calledAt: assessmentProviderStartedAt,
        humanReview: {
          required: true,
          reviewerUserId: ids.doctor,
          reviewedAt: confirmedAt,
          conclusion: "approved",
        },
      },
    },
  } as Prisma.JsonObject;
}

function buildProviderOperationRequest(): Prisma.JsonObject {
  return {
    assessmentType: "MMSE/CDR",
    transcript: assessmentTranscript,
    physicalConditions: [...assessmentPhysicalConditions],
  };
}

function buildProviderOperationResponse(patientId: string): Prisma.JsonObject {
  return {
    providerContent: JSON.stringify({
      scoreSummary: assessmentScoreSummary,
      analysisSummary: assessmentAnalysisSummary,
      confidence: assessmentConfidence,
      physicalConditions: assessmentPhysicalConditions,
    }),
    result: {
      patientId,
      assessmentType: "MMSE/CDR",
      status: "pending_human_review",
      riskLevel: "moderate",
      scoreSummary: assessmentScoreSummary,
      rawInputSummary: {
        transcript: assessmentTranscript,
        analysisSummary: assessmentAnalysisSummary,
        modelVersion: assessmentModelVersion,
        confidence: assessmentConfidence,
        physicalConditions: [...assessmentPhysicalConditions],
      },
      physicalConditions: [...assessmentPhysicalConditions],
    },
  } as Prisma.JsonObject;
}

function buildProviderOperation(
  organizationId: string,
  patientId: string,
  actorUserId: string,
  key: SensitiveEncryptionKey,
) {
  const identity = {
    organizationId,
    patientId,
    actorUserId,
    operation: "assessment_draft" as const,
    clientIdempotencyKey: assessmentProviderRequestKey,
  };
  const request = buildProviderOperationRequest();
  const response = buildProviderOperationResponse(patientId);
  return {
    id: ids.providerOperation,
    ...identity,
    canonicalRequestHmac: createProviderOperationRequestHmac(
      identity,
      request,
      deriveProviderOperationHmacKey(key, providerOperationRequestHmacInfo),
    ),
    requestIntentHmac: createProviderOperationRequestIntentHmac(
      identity,
      request,
      deriveProviderOperationHmacKey(key, providerOperationIntentHmacInfo),
    ),
    requestCiphertext: encryptSensitiveJson(
      request,
      providerOperationAad(ids.providerOperation, "requestCiphertext"),
      key,
    ),
    expectedBusinessObjectType: null,
    expectedBusinessObjectId: null,
    expectedBusinessObjectVersion: null,
    provider: assessmentProvider,
    modelVersion: assessmentModelVersion,
    endpointHost: new URL(assessmentEndpoint).host,
    apiKeyRef: assessmentApiKeyRef,
    promptVersion: assessmentPromptVersion,
    providerCallId: assessmentProviderCallId,
    providerRequestId: null,
    status: "completed",
    responseCiphertext: encryptSensitiveJson(
      response,
      providerOperationAad(ids.providerOperation, "responseCiphertext"),
      key,
    ),
    responseHmac: createProviderOperationResponseHmac(
      ids.providerOperation,
      response,
      deriveProviderOperationHmacKey(key, providerOperationResponseHmacInfo),
    ),
    failureCategory: null,
    providerStartedAt: new Date(assessmentProviderStartedAt),
    providerRespondedAt: new Date(assessmentProviderRespondedAt),
    completedAt: new Date(assessmentProviderRespondedAt),
    finalizedAt: new Date(assessmentProviderRespondedAt),
  };
}

function assertProviderOperationRow(
  actual: RepairProviderOperationRow,
  expected: ReturnType<typeof buildProviderOperation>,
  key: SensitiveEncryptionKey,
  patientId: string,
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
      throw new Error(`供应商账本字段 ${field} 不匹配，已拒绝修改。`);
    }
  }
  for (const field of [
    "providerStartedAt",
    "providerRespondedAt",
    "completedAt",
    "finalizedAt",
  ] as const) {
    if (actual[field]?.toISOString() !== expected[field]?.toISOString()) {
      throw new Error(`供应商账本时间字段 ${field} 不匹配，已拒绝修改。`);
    }
  }

  const request = decryptSensitiveJson(
    actual.requestCiphertext,
    providerOperationAad(ids.providerOperation, "requestCiphertext"),
    key,
  );
  assertCondition(
    sameJson(request, buildProviderOperationRequest()),
    "供应商账本请求证据不匹配，已拒绝修改。",
  );
  assertCondition(
    actual.responseCiphertext && actual.responseHmac,
    "供应商账本响应证据缺失，已拒绝修改。",
  );
  const response = decryptSensitiveJson(
    actual.responseCiphertext,
    providerOperationAad(ids.providerOperation, "responseCiphertext"),
    key,
  );
  assertCondition(
    sameJson(response, buildProviderOperationResponse(patientId)),
    "供应商账本响应证据不匹配，已拒绝修改。",
  );
  const expectedResponseHmac = createProviderOperationResponseHmac(
    ids.providerOperation,
    response,
    deriveProviderOperationHmacKey(key, providerOperationResponseHmacInfo),
  );
  assertCondition(
    actual.responseHmac === expectedResponseHmac,
    "供应商账本响应 HMAC 不匹配，已拒绝修改。",
  );
}

async function assertProviderOperationOutbox(
  database: RepairProviderOperationDatabase,
) {
  const events = await database.providerOperationOutbox.findMany({
    where: { providerOperationId: ids.providerOperation },
    select: { eventType: true },
  });
  const actualEvents = new Set(events.map((event) => event.eventType));
  for (const eventType of providerOperationOutboxEvents) {
    assertCondition(
      actualEvents.has(eventType),
      `供应商账本缺少 outbox 事件 ${eventType}，已拒绝修改。`,
    );
  }
}

async function ensureProviderOperation(
  database: RepairProviderOperationDatabase,
  organizationId: string,
  patientId: string,
  actorUserId: string,
  key: SensitiveEncryptionKey,
) {
  const expected = buildProviderOperation(
    organizationId,
    patientId,
    actorUserId,
    key,
  );
  const existingByIdentity = await database.providerOperation.findFirst({
    where: {
      organizationId,
      patientId,
      actorUserId,
      operation: "assessment_draft",
      clientIdempotencyKey: assessmentProviderRequestKey,
    },
    select: { id: true },
  });
  assertCondition(
    !existingByIdentity || existingByIdentity.id === ids.providerOperation,
    "供应商账本幂等键已绑定到其他记录，已拒绝修改。",
  );
  const existingByCall = await database.providerOperation.findMany({
    where: {
      patientId,
      operation: "assessment_draft",
      providerCallId: assessmentProviderCallId,
    },
    select: { id: true },
  });
  assertCondition(
    existingByCall.every((operation) => operation.id === ids.providerOperation),
    "供应商调用 ID 已绑定到其他记录，已拒绝修改。",
  );

  const existing = await database.providerOperation.findUnique({
    where: { id: ids.providerOperation },
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
    assertProviderOperationRow(existing, expected, key, patientId);
  } else {
    await database.providerOperation.create({ data: expected });
  }

  for (const eventType of providerOperationOutboxEvents) {
    await database.providerOperationOutbox.upsert({
      where: {
        providerOperationId_eventType: {
          providerOperationId: ids.providerOperation,
          eventType,
        },
      },
      update: {},
      create: { providerOperationId: ids.providerOperation, eventType },
    });
  }
}

async function main() {
  loadRootEnv();
  if (process.env.APPLY_DEMO_REPAIR !== "YES") {
    throw new Error(
      "这是一次性本机演示数据修复。请使用 APPLY_DEMO_REPAIR=YES 明确授权写入。",
    );
  }

  const key = requireSensitiveBackfillKey(process.env);
  const prisma = new PrismaClient();

  try {
    const result = await prisma.$transaction(
      async (database) => {
        const [lock] = await database.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(20260824, 2401) AS locked
        `;
        assertCondition(lock?.locked, "相同修复任务正在运行，已拒绝并发写入。");

        const users = await database.user.findMany({
          where: { id: { in: [ids.admin, ids.doctor, ids.patientUser] } },
          select: { id: true, account: true },
        });
        const accounts = new Map(users.map((user) => [user.id, user.account]));
        assertCondition(accounts.get(ids.admin) === "admin", "固定 admin 身份不匹配。");
        assertCondition(
          accounts.get(ids.doctor) === "doctor001",
          "固定 doctor001 身份不匹配。",
        );
        assertCondition(
          accounts.get(ids.patientUser) === "patient001",
          "固定 patient001 身份不匹配。",
        );

        const patient = await database.patientProfile.findUnique({
          where: { id: ids.patient },
          select: {
            id: true,
            userId: true,
            status: true,
            responsibleDoctorId: true,
            careDetailsEnvelope: true,
            responsibleDoctor: {
              select: {
                userId: true,
                organization: { select: { id: true, code: true } },
              },
            },
          },
        });
        assertCondition(patient, "固定演示患者不存在。");
        assertCondition(patient.userId === ids.patientUser, "演示患者 userId 不匹配。");
        assertCondition(patient.status === "active", "演示患者不是 active 状态。");
        assertCondition(
          patient.responsibleDoctor.userId === ids.doctor,
          "演示患者责任医生不匹配。",
        );
        assertCondition(
          patient.responsibleDoctor.organization.code === "dlut-rehab",
          "演示患者所属机构不匹配。",
        );

        const care = asObject(
          decryptSensitiveJson(
            patient.careDetailsEnvelope,
            {
              tableName: "patient_profile",
              recordId: patient.id,
              fieldName: "careDetailsEnvelope",
            },
            key,
          ),
          "careDetailsEnvelope",
        );
        const healthMetrics = asObject(care.healthMetrics, "healthMetrics");
        assertCondition(
          healthMetrics.medicalRecordNo === medicalRecordNo,
          "固定演示病历号不匹配。",
        );

        const assessment = await database.assessmentRecord.findUnique({
          where: { id: ids.assessment },
          select: {
            id: true,
            patientId: true,
            assessmentType: true,
            source: true,
            status: true,
            resultEnvelope: true,
          },
        });
        assertCondition(assessment, "固定演示评估不存在。");
        assertCondition(assessment.patientId === patient.id, "评估不属于演示患者。");
        assertCondition(assessment.assessmentType === "MMSE/CDR", "评估类型不匹配。");
        assertCondition(
          assessment.source === "seed_clinician_input" ||
            assessment.source === assessmentSource,
          "评估来源既不是已知旧演示来源，也不是目标正式 AI 来源，已拒绝覆盖。",
        );
        assertCondition(
          assessment.status === "completed" || assessment.status === "doctor_confirmed",
          `当前评估状态为 ${assessment.status}，已拒绝覆盖。`,
        );

        const payload = asObject(
          decryptSensitiveJson(
            assessment.resultEnvelope,
            {
              tableName: "assessment_record",
              recordId: assessment.id,
              fieldName: "resultEnvelope",
            },
            key,
          ),
          "assessment.resultEnvelope",
        );
        const rawInputSummary = asObject(
          payload.rawInputSummary,
          "assessment.rawInputSummary",
        );
        const legacyReview = {
          decision: "approved",
          reviewNote: "已结合量表、访谈摘要和风险证据确认正式评估。",
          reviewerUserId: ids.doctor,
          reviewedAt: confirmedAt,
        };
        if (assessment.source === "seed_clinician_input") {
          assertCondition(
            sameJson(payload.scoreSummary, assessmentScoreSummary),
            "旧演示评分内容不匹配，已拒绝覆盖。",
          );
          assertCondition(
            rawInputSummary.medicalRecordNo === medicalRecordNo,
            "旧演示评估病历号不匹配，已拒绝覆盖。",
          );
          assertCondition(
            rawInputSummary.transcript === assessmentTranscript,
            "旧演示评估转写不匹配，已拒绝覆盖。",
          );
          assertCondition(
            rawInputSummary.reactionDelaySeconds === 2.4,
            "旧演示评估反应时延不匹配，已拒绝覆盖。",
          );
          assertCondition(
            sameJson(rawInputSummary.doctorReview, legacyReview),
            "旧演示人工复核内容不匹配，已拒绝覆盖。",
          );
          assertCondition(
            payload.physicalConditions === undefined ||
              sameJson(payload.physicalConditions, assessmentPhysicalConditions),
            "旧演示 physicalConditions 与目标值冲突。",
          );
        } else {
          assertCondition(
            sameJson(payload, buildAssessmentPayload()),
            "目标正式 AI 评估密文内容不完整或不一致，已拒绝覆盖。",
          );
        }

        const expectedConditions = assessmentPhysicalConditions;
        const expectedPayload = buildAssessmentPayload();
        const existingProviderOperation =
          await database.providerOperation.findUnique({
            where: { id: ids.providerOperation },
            select: { id: true },
          });
        await ensureProviderOperation(
          database,
          patient.responsibleDoctor.organization.id,
          patient.id,
          ids.doctor,
          key,
        );

        const risk = await database.riskGradeRecord.findUnique({
          where: { id: ids.risk },
          select: {
            id: true,
            patientId: true,
            assessmentId: true,
            riskLevel: true,
            systemRiskLevel: true,
            manualRiskLevel: true,
            isCurrent: true,
            confirmedById: true,
            confirmedAt: true,
          },
        });
        assertCondition(risk, "固定演示风险记录不存在。");
        assertCondition(risk.patientId === patient.id, "风险记录不属于演示患者。");
        assertCondition(risk.assessmentId === assessment.id, "风险记录未绑定固定评估。");
        assertCondition(risk.isCurrent, "固定风险记录不是 current。");
        assertCondition(risk.riskLevel === "moderate", "现有风险等级不是 moderate。");
        assertCondition(
          risk.systemRiskLevel === "moderate",
          "现有系统风险等级不是 moderate。",
        );
        assertCondition(
          risk.manualRiskLevel === null || risk.manualRiskLevel === "moderate",
          "已有 manualRiskLevel 与目标值冲突。",
        );
        assertCondition(risk.confirmedById === ids.doctor, "风险确认医生不匹配。");
        assertCondition(
          risk.confirmedAt?.toISOString() === confirmedAt,
          "风险确认时间不匹配。",
        );

        const plan = await database.rehabPlan.findUnique({
          where: { id: ids.plan },
          select: {
            patientId: true,
            doctorId: true,
            status: true,
            isCurrent: true,
            items: {
              orderBy: { sequence: "asc" },
              select: {
                gameContent: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    runtimeType: true,
                    gameVersion: true,
                    status: true,
                    buildStatus: true,
                    releaseChannel: true,
                    supportsCamera: true,
                    supportsMicrophone: true,
                    supportedInputModes: true,
                    requiredMetrics: true,
                  },
                },
              },
            },
          },
        });
        assertCondition(plan, "固定演示康复计划不存在。");
        assertCondition(plan.patientId === patient.id, "康复计划不属于演示患者。");
        assertCondition(plan.doctorId === patient.responsibleDoctorId, "计划医生不匹配。");
        assertCondition(
          plan.status === "active" && plan.isCurrent,
          "演示计划不是当前生效计划。",
        );
        assertCondition(plan.items.length > 0, "演示计划没有训练项目。");

        const conditionData = {
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
          createdByUserId: ids.admin,
        };

        let condition = await database.collectionCondition.findUnique({
          where: { code: conditionData.code },
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            environment: true,
            deviceRequirements: true,
            taskParameters: true,
            qualityRules: true,
            status: true,
            createdByUserId: true,
          },
        });
        if (condition) {
          const { id: _id, ...actual } = condition;
          assertCondition(sameJson(actual, conditionData), "采集条件内容冲突。");
        }

        const games = plan.items.map((item) => item.gameContent);
        const missingGames = [] as typeof games;
        for (const game of games) {
          assertCondition(
            game.status === "active" &&
              game.buildStatus === "released" &&
              game.releaseChannel === "production" &&
              game.gameVersion,
            `计划游戏 ${game.code} 未达到正式发布条件。`,
          );
          assertCondition(
            Array.isArray(game.requiredMetrics) && game.requiredMetrics.length > 0,
            `计划游戏 ${game.code} 缺少 requiredMetrics。`,
          );

          const expectedProtocol = {
            conditionId: condition?.id,
            gameContentId: game.id,
            code: `formal-${game.code}`,
            name: `${game.name}正式采集协议`,
            version: game.gameVersion,
            runtimeType: game.runtimeType,
            requiredConsentTypes: [
              "privacy_policy",
              "ai_processing",
              ...(game.supportsCamera ? ["camera_capture"] : []),
              ...(game.supportsMicrophone ? ["microphone_capture"] : []),
            ],
            requiredInputModes: game.supportedInputModes,
            requiredMetrics: game.requiredMetrics,
            conditionRules: {
              physicalConditions: expectedConditions,
              riskLevels: ["low", "moderate", "high"],
            },
            samplingConfig: { windowSeconds: 30, minimumSamples: 1 },
            qualityGate: { minConfidence: 0.8 },
            status: "active",
            createdByUserId: ids.admin,
          };

          const existing = await database.collectionProtocol.findUnique({
            where: {
              code_version: {
                code: expectedProtocol.code,
                version: game.gameVersion,
              },
            },
            select: {
              id: true,
              conditionId: true,
              gameContentId: true,
              code: true,
              name: true,
              version: true,
              runtimeType: true,
              requiredConsentTypes: true,
              requiredInputModes: true,
              requiredMetrics: true,
              conditionRules: true,
              samplingConfig: true,
              qualityGate: true,
              status: true,
              createdByUserId: true,
            },
          });
          if (!existing) {
            missingGames.push(game);
          } else {
            assertCondition(condition, "协议存在但标准采集条件不存在。");
            const { id: _id, ...actual } = existing;
            assertCondition(
              sameJson(actual, { ...expectedProtocol, conditionId: condition.id }),
              `协议 ${expectedProtocol.code}@${expectedProtocol.version} 内容冲突。`,
            );
          }
        }

        const assessmentNeedsUpdate =
          assessment.source === "seed_clinician_input" ||
          assessment.status === "completed";
        const changes = [
          ...(assessmentNeedsUpdate ? ["assessment"] : []),
          ...(!existingProviderOperation ? ["providerOperation"] : []),
          ...(risk.manualRiskLevel === null ? ["risk"] : []),
          ...(!condition ? ["collectionCondition"] : []),
          ...missingGames.map((game) => `collectionProtocol:${game.code}`),
        ];

        if (assessmentNeedsUpdate) {
          const updated = await database.assessmentRecord.updateMany({
            where: {
              id: assessment.id,
              patientId: patient.id,
              source: assessment.source,
              status: assessment.status,
            },
            data: {
              source: assessmentSource,
              status: "doctor_confirmed",
              resultEnvelope: encryptAssessmentPayload(expectedPayload, key),
            },
          });
          assertCondition(updated.count === 1, "评估记录发生并发变化。");
        }

        if (risk.manualRiskLevel === null) {
          const updated = await database.riskGradeRecord.updateMany({
            where: {
              id: risk.id,
              patientId: patient.id,
              assessmentId: assessment.id,
              manualRiskLevel: null,
            },
            data: { manualRiskLevel: "moderate" },
          });
          assertCondition(updated.count === 1, "风险记录发生并发变化。");
        }

        if (!condition) {
          condition = await database.collectionCondition.create({ data: conditionData });
        }

        for (const game of missingGames) {
          await database.collectionProtocol.create({
            data: {
              conditionId: condition.id,
              gameContentId: game.id,
              code: `formal-${game.code}`,
              name: `${game.name}正式采集协议`,
              version: game.gameVersion!,
              runtimeType: game.runtimeType,
              requiredConsentTypes: [
                "privacy_policy",
                "ai_processing",
                ...(game.supportsCamera ? ["camera_capture"] : []),
                ...(game.supportsMicrophone ? ["microphone_capture"] : []),
              ],
              requiredInputModes: game.supportedInputModes,
              requiredMetrics: game.requiredMetrics as Prisma.InputJsonValue,
              conditionRules: {
                physicalConditions: expectedConditions,
                riskLevels: ["low", "moderate", "high"],
              },
              samplingConfig: { windowSeconds: 30, minimumSamples: 1 },
              qualityGate: { minConfidence: 0.8 },
              status: "active",
              createdByUserId: ids.admin,
            },
          });
        }

        return { changes };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    console.log(JSON.stringify({ applied: true, ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`本机演示数据修复失败：${message}`);
  process.exitCode = 1;
});
