import { PrismaClient, RoleCode } from "@prisma/client";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const prisma = new PrismaClient();

const hashPassword = (password: string) =>
  createHash("sha256").update(password).digest("hex");

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
  loadRootEnv();
  const password = process.env.DEFAULT_PATIENT_PASSWORD?.trim();
  if (!password) {
    throw new Error("Missing required environment variable: DEFAULT_PATIENT_PASSWORD");
  }
  return password;
}

async function main() {
  const passwordHash = hashPassword(requireSeedPassword());

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

  const adminUser = await prisma.user.upsert({
    where: { account: "admin" },
    update: {
      displayName: "平台超级管理员",
    },
    create: {
      account: "admin",
      mobilePhone: "13900000000",
      passwordHash,
      displayName: "平台超级管理员",
    },
  });

  const operatorUser = await prisma.user.upsert({
    where: { account: "operator001" },
    update: {},
    create: {
      account: "operator001",
      mobilePhone: "13900000002",
      passwordHash,
      displayName: "运营管理员",
    },
  });

  const auditorUser = await prisma.user.upsert({
    where: { account: "auditor001" },
    update: {},
    create: {
      account: "auditor001",
      mobilePhone: "13900000003",
      passwordHash,
      displayName: "审计管理员",
    },
  });

  const doctorUser = await prisma.user.upsert({
    where: { account: "doctor001" },
    update: {},
    create: {
      account: "doctor001",
      mobilePhone: "13900000001",
      passwordHash,
      displayName: "王医生",
    },
  });

  const patientUser = await prisma.user.upsert({
    where: { account: "patient001" },
    update: {},
    create: {
      account: "patient001",
      mobilePhone: "13800006721",
      passwordHash,
      displayName: "李秀兰",
    },
  });

  const caregiverUser = await prisma.user.upsert({
    where: { account: "caregiver001" },
    update: {},
    create: {
      account: "caregiver001",
      mobilePhone: "13900008206",
      passwordHash,
      displayName: "李明",
    },
  });

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

  const patient = await prisma.patientProfile.upsert({
    where: { userId: patientUser.id },
    update: {
      responsibleDoctorId: doctor.id,
    },
    create: {
      userId: patientUser.id,
      responsibleDoctorId: doctor.id,
      name: "李秀兰",
      gender: "female",
      age: 72,
      mobilePhone: "13800006721",
      caregiverName: "李明",
      caregiverPhone: "13900008206",
      healthMetrics: {
        bloodPressure: "132/82",
        heartRate: 76,
        gaitRisk: "low",
      },
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
    await prisma.consentRecord.create({
      data: {
        patientId: patient.id,
        subjectUserId: patientUser.id,
        consentType,
        consentVersion: "v1.2",
        evidenceSnapshot: {
          source: "seed",
          userAgent: "rehab-platform-seed",
        },
      },
    });
  }

  const games = await Promise.all([
    prisma.gameContent.upsert({
      where: { code: "rhythm_saber" },
      update: {
        runtimeType: "unity_webgl",
        buildBaseUrl: "/unity/rhythm_saber/1.0.0",
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "pending_assets",
        releaseChannel: "development",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: [
          { metricType: "arm_raise_accuracy", unit: "ratio", min: 0, max: 1 },
          { metricType: "reaction_stability", unit: "ratio", min: 0, max: 1 },
        ],
      },
      create: {
        code: "rhythm_saber",
        name: "节奏光剑",
        trainingTargets: ["reaction", "attention", "upper_limb"],
        tags: ["中低强度", "反应", "动作准确率"],
        defaultDuration: 8,
        defaultDifficulty: "0.8x",
        runtimeType: "unity_webgl",
        buildBaseUrl: "/unity/rhythm_saber/1.0.0",
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "pending_assets",
        releaseChannel: "development",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: [
          { metricType: "arm_raise_accuracy", unit: "ratio", min: 0, max: 1 },
          { metricType: "reaction_stability", unit: "ratio", min: 0, max: 1 },
        ],
      },
    }),
    prisma.gameContent.upsert({
      where: { code: "pose_reaction_hit" },
      update: {
        runtimeType: "browser_pose_game",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: [
          { metricType: "reaction_time_ms", unit: "ms", min: 0 },
          { metricType: "target_hit_rate", unit: "ratio", min: 0, max: 1 },
          { metricType: "pose_visibility_avg", unit: "ratio", min: 0, max: 1 },
          { metricType: "arm_raise_accuracy", unit: "ratio", min: 0, max: 1 },
        ],
        status: "active",
      },
      create: {
        code: "pose_reaction_hit",
        name: "上肢反应触达",
        trainingTargets: ["reaction", "attention", "upper_limb"],
        tags: ["中低强度", "反应", "动作准确率"],
        defaultDuration: 8,
        defaultDifficulty: "基础",
        runtimeType: "browser_pose_game",
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
        buildStatus: "released",
        releaseChannel: "production",
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ["camera_pose"],
        requiredMetrics: [
          { metricType: "reaction_time_ms", unit: "ms", min: 0 },
          { metricType: "target_hit_rate", unit: "ratio", min: 0, max: 1 },
          { metricType: "pose_visibility_avg", unit: "ratio", min: 0, max: 1 },
          { metricType: "arm_raise_accuracy", unit: "ratio", min: 0, max: 1 },
        ],
        status: "active",
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
        requiredMetrics: [
          { metricType: "selection_accuracy", unit: "ratio", min: 0, max: 1 },
          { metricType: "memory_recall_rate", unit: "ratio", min: 0, max: 1 },
        ],
      },
      create: {
        code: "memory_basket",
        name: "记忆果篮",
        trainingTargets: ["memory", "recognition"],
        tags: ["近记忆", "认知", "低强度"],
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
        requiredMetrics: [
          { metricType: "path_completion_rate", unit: "ratio", min: 0, max: 1 },
          { metricType: "planning_latency_ms", unit: "ms", min: 0 },
        ],
      },
      create: {
        code: "path_treasure",
        name: "路径寻宝",
        trainingTargets: ["executive", "planning"],
        tags: ["执行力", "路径规划", "低强度"],
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

  const assessment = await prisma.assessmentRecord.create({
    data: {
      patientId: patient.id,
      assessmentType: "MMSE/CDR",
      scoreSummary: {
        mmse: 20,
        cdr: 1,
        memory: 48,
        orientation: 58,
        executive: 52,
        language: 73,
      },
      rawInputSummary: {
        transcript: "今天是星期一。苹果、桌子、硬币。",
        reactionDelaySeconds: 2.4,
      },
      completedAt: new Date(),
    },
  });

  await prisma.riskGradeRecord.create({
    data: {
      patientId: patient.id,
      assessmentId: assessment.id,
      riskLevel: "moderate",
      systemRiskLevel: "moderate",
      isCurrent: true,
      reasonSummary: "MMSE 20/30，CDR 1.0，近记忆和执行力分项存在波动。",
      confirmedById: doctorUser.id,
      confirmedAt: new Date(),
    },
  });

  await prisma.aiAnalysisRecord.create({
    data: {
      patientId: patient.id,
      assessmentId: assessment.id,
      analysisScene: "assessment_summary",
      modelVersion: "Cog-MMSE-2026.04",
      confidence: 0.84,
      inputSummary: {
        transcript: "今天是星期一。苹果、桌子、硬币。",
        reactionDelaySeconds: 2.4,
      },
      outputSummary: {
        riskLevel: "moderate",
        recommendation: "建议以近记忆、反应和执行力训练为主。",
      },
    },
  });

  const rehabPlan = await prisma.rehabPlan.create({
    data: {
      patientId: patient.id,
      doctorId: doctor.id,
      planName: "第1周个性化康复训练计划",
      status: "active",
      isCurrent: true,
      weekFrequency: 4,
      dailyDuration: 20,
      difficultyLadder: {
        rhythmSaber: "0.75x -> 1.0x",
        memoryBasket: "4组 -> 6组",
      },
      recommendationReason:
        "依据 MMSE 近记忆与执行力分项较弱，训练优先覆盖反应、记忆与路径规划。",
    },
  });

  const planItems = await Promise.all(
    games.map((game, index) =>
      prisma.rehabPlanItem.create({
        data: {
          rehabPlanId: rehabPlan.id,
          gameContentId: game.id,
          sequence: index + 1,
          durationMinutes: game.code === "rhythm_saber" ? 6 : game.defaultDuration,
          frequencyPerWeek: game.code === "path_treasure" ? 3 : 4,
          difficulty: game.code === "rhythm_saber" ? "0.75x -> 1.0x" : game.defaultDifficulty,
          adaptiveRules: {
            increaseWhenAccuracyAbove: 0.9,
            reduceWhenMissesAbove: 5,
          },
        },
      }),
    ),
  );

  await prisma.planAdjustmentRecord.create({
    data: {
      rehabPlanId: rehabPlan.id,
      doctorId: doctor.id,
      originalSnapshot: {
        dailyDuration: 24,
        rhythmSaberSpeed: "0.8x -> 1.1x",
        weekFrequency: 5,
      },
      adjustedSnapshot: {
        dailyDuration: 20,
        rhythmSaberSpeed: "0.75x -> 1.0x",
        weekFrequency: 4,
      },
      adjustmentReason: "患者近期肩部不适，先降低上肢反应训练速度。",
    },
  });

  const rhythmItem = planItems.find((item) =>
    games.find((game) => game.id === item.gameContentId && game.code === "rhythm_saber"),
  );
  const rhythmGame = games.find((game) => game.code === "rhythm_saber");

  if (rhythmItem && rhythmGame) {
    const session = await prisma.trainingSession.upsert({
      where: { idempotencyKey: "seed-rhythm-session-001" },
      update: {},
      create: {
        idempotencyKey: "seed-rhythm-session-001",
        patientId: patient.id,
        rehabPlanId: rehabPlan.id,
        planItemId: rhythmItem.id,
        gameContentId: rhythmGame.id,
        sessionStatus: "completed",
        startedAt: new Date("2026-04-27T02:00:00.000Z"),
        endedAt: new Date("2026-04-27T02:08:00.000Z"),
        syncStatus: "synced",
        gameRunId: "seed-run-rhythm-001",
        clientStartedAt: new Date("2026-04-27T02:00:00.000Z"),
        clientEndedAt: new Date("2026-04-27T02:08:00.000Z"),
        deviceCode: "seed-camera-001",
        calibrationStatus: "completed",
        runtimeConfigSnapshot: {
          source: "seed_import",
          gameCode: "rhythm_saber",
          gameVersion: "1.0.0",
          bridgeProtocolVersion: "1.0.0",
        },
        unityBuildVersion: "1.0.0",
        bridgeProtocolVersion: "1.0.0",
      },
    });

    await prisma.trainingResult.upsert({
      where: { sessionId: session.id },
      update: {},
      create: {
        sessionId: session.id,
        source: "seed_import",
        gameRunId: "seed-run-rhythm-001",
        gameVersion: "1.0.0",
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
        qualityReasons: [],
        metricsSummary: {
          source: "seed_import",
          gameRunId: "seed-run-rhythm-001",
          gameVersion: "1.0.0",
          validActions: 86,
          difficultyChangedTo: "0.92x",
        },
      },
    });

    await prisma.motionMetric.createMany({
      data: [
        {
          trainingSessionId: session.id,
          gameRunId: "seed-run-rhythm-001",
          source: "seed_import",
          metricType: "reaction_time_ms",
          metricValue: 820,
          unit: "ms",
          confidence: 0.96,
          sampleCount: 86,
        },
        {
          trainingSessionId: session.id,
          gameRunId: "seed-run-rhythm-001",
          source: "seed_import",
          metricType: "motion_accuracy",
          metricValue: 0.91,
          unit: "ratio",
          confidence: 0.94,
          sampleCount: 86,
        },
        {
          trainingSessionId: session.id,
          gameRunId: "seed-run-rhythm-001",
          source: "seed_import",
          metricType: "exercise_intensity",
          metricValue: 0.62,
          unit: "ratio",
          confidence: 0.88,
          sampleCount: 86,
        },
      ],
      skipDuplicates: true,
    });
  }

  await prisma.auditLog.createMany({
    data: [
      {
        actorUserId: doctorUser.id,
        actorRole: "doctor",
        action: "plan.adjust",
        targetType: "rehab_plan",
        targetId: rehabPlan.id,
        result: "success",
        metadata: { patientNameMasked: "李*" },
      },
      {
        actorUserId: adminUser.id,
        actorRole: "admin",
        action: "audit.export_desensitized",
        targetType: "training_result",
        result: "success",
      },
      {
        actorUserId: caregiverUser.id,
        actorRole: "caregiver",
        action: "caregiver.summary.view",
        targetType: "patient_profile",
        targetId: patient.id,
        result: "success",
        metadata: { scope: ["summary", "progress"] },
      },
    ],
  });

  console.log("Seed completed. Local initialization accounts are ready.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
