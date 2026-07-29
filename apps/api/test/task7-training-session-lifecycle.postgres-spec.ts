import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppService } from '../src/app.service';
import type { RequestUser } from '../src/current-user';
import { PrismaService } from '../src/prisma.service';
import { encryptSensitiveJson } from '../src/sensitive-encryption';

const testSensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-sensitive-key',
  key: Buffer.alloc(32, 11),
};

jest.setTimeout(60_000);

type Fixtures = {
  organizationId: string;
  doctorId: string;
  doctorUserId: string;
  patientId: string;
  patientUserId: string;
  assessmentId: string;
  riskGradeId: string;
  gameContentId: string;
  conditionId: string;
  protocolId: string;
  collectionBatchId: string;
  rehabPlanId: string;
  planItemId: string;
  consentId: string;
  rewardRuleId: string;
};

type TransactionHooks = {
  beforeTrainingSessionUpsert?: () => Promise<void>;
  beforeTrainingSessionUpdateMany?: () => Promise<void>;
  beforeTrainingResultCreate?: () => Promise<void>;
  beforeAuditLogCreate?: (tx: Prisma.TransactionClient) => Promise<void>;
};

type DelegateMethod = (...args: unknown[]) => unknown;

function createBarrier(expectedArrivals: number) {
  let arrivals = 0;
  let resolveArrived!: () => void;
  let resolveReleased!: () => void;
  const arrived = new Promise<void>((resolve) => {
    resolveArrived = resolve;
  });
  const released = new Promise<void>((resolve) => {
    resolveReleased = resolve;
  });

  return {
    arriveAndWait: async () => {
      arrivals += 1;
      if (arrivals === expectedArrivals) resolveArrived();
      await released;
    },
    waitForArrivals: () => arrived,
    release: () => resolveReleased(),
  };
}

function isDelegateMethod(value: unknown): value is DelegateMethod {
  return typeof value === 'function';
}

function bindDelegateValue(target: object, property: PropertyKey): unknown {
  const value: unknown = Reflect.get(target, property);
  return isDelegateMethod(value) ? value.bind(target) : value;
}

function wrapDelegate<T extends object>(
  delegate: T,
  hooks: Record<string, (() => Promise<void>) | undefined>,
): T {
  return new Proxy(delegate, {
    get(target, property) {
      const original: unknown = Reflect.get(target, property);
      const hook = typeof property === 'string' ? hooks[property] : undefined;
      if (isDelegateMethod(original) && hook) {
        return async (...args: unknown[]) => {
          await hook();
          return original.apply(target, args);
        };
      }
      return bindDelegateValue(target, property);
    },
  });
}

function wrapTransaction(
  tx: Prisma.TransactionClient,
  hooks: TransactionHooks,
): Prisma.TransactionClient {
  const trainingSession = wrapDelegate(tx.trainingSession, {
    upsert: hooks.beforeTrainingSessionUpsert,
    updateMany: hooks.beforeTrainingSessionUpdateMany,
  });
  const trainingResult = wrapDelegate(tx.trainingResult, {
    create: hooks.beforeTrainingResultCreate,
  });
  const auditLog = wrapDelegate(tx.auditLog, {
    create: hooks.beforeAuditLogCreate
      ? () => hooks.beforeAuditLogCreate!(tx)
      : undefined,
  });

  return new Proxy(tx, {
    get(target, property) {
      if (property === 'trainingSession') return trainingSession;
      if (property === 'trainingResult') return trainingResult;
      if (property === 'auditLog') return auditLog;
      return bindDelegateValue(target, property);
    },
  });
}

function serviceWithTransactionHooks(
  client: PrismaService,
  hooks: TransactionHooks,
) {
  const wrapped = new Proxy(client, {
    get(target, property) {
      if (property === '$transaction') {
        return <T>(
          callback: (tx: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> =>
          target.$transaction((tx) => callback(wrapTransaction(tx, hooks)));
      }
      return bindDelegateValue(target, property);
    },
  });
  return new AppService(wrapped, testSensitiveEncryptionKey);
}

describe('Task 7 training session lifecycle on disposable PostgreSQL', () => {
  const runPrefix = `task7_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const prisma = new PrismaService();
  const contenderA = new PrismaService();
  const contenderB = new PrismaService();
  const service = new AppService(prisma, testSensitiveEncryptionKey);
  let fixtures: Fixtures | undefined;

  const patientActor: RequestUser = {
    id: '',
    account: `${runPrefix}_patient`,
    displayName: 'Task 7 Patient',
    roles: [],
  };
  const doctorActor: RequestUser = {
    id: '',
    account: `${runPrefix}_doctor`,
    displayName: 'Task 7 Doctor',
    roles: [],
  };

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (
      process.env.TASK7_API_E2E_CONFIRM_DISPOSABLE !== 'YES' ||
      !databaseUrl ||
      databaseUrl !== process.env.TASK7_API_E2E_DATABASE_URL ||
      new URL(databaseUrl).pathname !== '/rehab_task7_api_test'
    ) {
      throw new Error(
        'Task 7 PostgreSQL lifecycle tests require the explicit rehab_task7_api_test disposable runner.',
      );
    }

    await Promise.all([
      prisma.$connect(),
      contenderA.$connect(),
      contenderB.$connect(),
    ]);
    fixtures = await createFixtures();
    patientActor.id = fixtures.patientUserId;
    patientActor.roles = [
      {
        roleCode: 'patient',
        relatedObjectType: 'patient',
        relatedObjectId: fixtures.patientId,
      },
    ];
    doctorActor.id = fixtures.doctorUserId;
    doctorActor.roles = [
      {
        roleCode: 'doctor',
        relatedObjectType: 'doctor',
        relatedObjectId: fixtures.doctorId,
      },
    ];
  });

  afterEach(async () => {
    await cleanupLifecycleRecords();
  });

  afterAll(async () => {
    try {
      await cleanupLifecycleRecords();
      await cleanupFixtures();
    } finally {
      await Promise.all([
        prisma.$disconnect(),
        contenderA.$disconnect(),
        contenderB.$disconnect(),
      ]);
    }
  });

  it('observes the Prisma 6 identity for the active-session partial unique index', async () => {
    await createSession('p2002-observation-first', 'started');

    let rejection: unknown;
    try {
      await createSession('p2002-observation-second', 'in_progress');
    } catch (error: unknown) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const observed = rejection as Prisma.PrismaClientKnownRequestError;
    expect(observed.code).toBe('P2002');
    expect(observed.clientVersion).toBe('6.19.3');
    expect(observed.meta).toEqual({
      modelName: 'TrainingSession',
      target: ['planItemId'],
    });
    expect(Object.keys(observed.meta ?? {}).sort()).toEqual([
      'modelName',
      'target',
    ]);
  });

  it('lets exactly one different-key concurrent start win via the partial unique index', async () => {
    const current = requiredFixtures();
    const barrier = createBarrier(2);
    const serviceA = serviceWithTransactionHooks(contenderA, {
      beforeTrainingSessionUpsert: barrier.arriveAndWait,
    });
    const serviceB = serviceWithTransactionHooks(contenderB, {
      beforeTrainingSessionUpsert: barrier.arriveAndWait,
    });
    const first = serviceA.startTrainingSession(
      patientActor,
      startDto('different-key-a', 'game-run-a'),
    );
    const second = serviceB.startTrainingSession(
      patientActor,
      startDto('different-key-b', 'game-run-b'),
    );

    await barrier.waitForArrivals();
    barrier.release();
    const attempts = await Promise.allSettled([first, second]);
    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<Awaited<typeof first>> =>
        attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rejection: unknown = rejected[0].reason;
    expect(rejection).toBeInstanceOf(ConflictException);
    expect((rejection as ConflictException).message).not.toContain(
      fulfilled[0].value.id,
    );
    await expect(
      prisma.trainingSession.count({
        where: {
          planItemId: current.planItemId,
          sessionStatus: { in: ['started', 'in_progress'] },
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.trainingSession.findUniqueOrThrow({
        where: { id: fulfilled[0].value.id },
      }),
    ).resolves.toMatchObject({ createdByUserId: patientActor.id });
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'training_session.start',
          targetId: fulfilled[0].value.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('returns one original session for a same-key same-context retry', async () => {
    const dto = startDto('same-key', 'same-game-run');

    const first = await service.startTrainingSession(patientActor, dto);
    const retry = await service.startTrainingSession(patientActor, dto);

    expect(retry.id).toBe(first.id);
    expect(retry.createdByUserId).toBe(patientActor.id);
    await expect(
      prisma.trainingSession.count({
        where: {
          patientId: requiredFixtures().patientId,
          idempotencyKey: `${runPrefix}_same-key`,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'training_session.start',
          targetId: first.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('resumes the same started session and never creates a replacement', async () => {
    const session = await createSession('resume', 'started');

    const resumed = await service.resumeTrainingSession(
      patientActor,
      session.id,
    );

    expect(resumed).toMatchObject({
      id: session.id,
      sessionStatus: 'in_progress',
      runtimeConfigSnapshot: session.runtimeConfigSnapshot,
    });
    await expect(
      prisma.trainingSession.count({
        where: { planItemId: requiredFixtures().planItemId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'training_session.resume',
          targetId: session.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('aborts once and rejects a repeated abort without a second success audit', async () => {
    const session = await createSession('abort-once', 'in_progress');

    const aborted = await service.abortTrainingSession(
      doctorActor,
      session.id,
      { reason: '  patient requested stop  ' },
    );

    expect(aborted).toMatchObject({
      id: session.id,
      sessionStatus: 'aborted',
      abortedByUserId: doctorActor.id,
      abortReason: 'patient requested stop',
    });
    expect(aborted.abortedAt).toEqual(aborted.endedAt);
    await expect(
      service.abortTrainingSession(doctorActor, session.id, {
        reason: 'repeat abort',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'training_session.abort',
          targetId: session.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('rolls back result and reward with 409 when abort commits first', async () => {
    const session = await createSession('abort-wins', 'in_progress');
    const barrier = createBarrier(1);
    const resultService = serviceWithTransactionHooks(contenderA, {
      beforeTrainingResultCreate: barrier.arriveAndWait,
    });
    const resultAttempt = resultService.submitTrainingResult(
      patientActor,
      session.id,
      validTrainingResultDto('abort-wins'),
    );

    await barrier.waitForArrivals();
    await service.abortTrainingSession(doctorActor, session.id, {
      reason: 'abort wins the lifecycle CAS',
    });
    barrier.release();

    await expect(resultAttempt).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.trainingSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({ sessionStatus: 'aborted' });
    await expect(
      prisma.trainingResult.count({ where: { sessionId: session.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.rewardLedger.count({
        where: { patientId: requiredFixtures().patientId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'training_result.submit',
          targetId: session.id,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { action: 'training_session.abort', targetId: session.id },
      }),
    ).resolves.toBe(1);
  });

  it('commits result, reward, and audit while a losing abort returns 409', async () => {
    const session = await createSession('result-wins', 'in_progress');
    const barrier = createBarrier(1);
    const abortService = serviceWithTransactionHooks(contenderB, {
      beforeTrainingSessionUpdateMany: barrier.arriveAndWait,
    });
    const abortAttempt = abortService.abortTrainingSession(
      doctorActor,
      session.id,
      { reason: 'losing abort' },
    );

    await barrier.waitForArrivals();
    const result = await service.submitTrainingResult(
      patientActor,
      session.id,
      validTrainingResultDto('result-wins'),
    );
    barrier.release();

    await expect(abortAttempt).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.trainingSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({
      sessionStatus: 'completed',
      abortedAt: null,
      abortedByUserId: null,
      abortReason: null,
    });
    await expect(
      prisma.trainingResult.count({ where: { sessionId: session.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.rewardLedger.count({
        where: {
          patientId: requiredFixtures().patientId,
          trainingResultId: result.id,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'training_result.submit',
          targetId: session.id,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { action: 'training_session.abort', targetId: session.id },
      }),
    ).resolves.toBe(0);
  });

  it('rolls back result and reward when the post-reward audit write fails', async () => {
    const session = await createSession(
      'post-reward-audit-fails',
      'in_progress',
    );
    const auditFailure = new Error('Task 7 injected post-reward audit failure');
    const resultService = serviceWithTransactionHooks(contenderA, {
      beforeAuditLogCreate: async (tx) => {
        await expect(
          tx.trainingResult.count({ where: { sessionId: session.id } }),
        ).resolves.toBe(1);
        await expect(
          tx.rewardLedger.count({
            where: {
              patientId: requiredFixtures().patientId,
              trainingResult: { sessionId: session.id },
            },
          }),
        ).resolves.toBe(1);
        throw auditFailure;
      },
    });

    await expect(
      resultService.submitTrainingResult(
        patientActor,
        session.id,
        validTrainingResultDto('post-reward-audit-fails'),
      ),
    ).rejects.toBe(auditFailure);

    await expect(
      prisma.trainingSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({ sessionStatus: 'in_progress' });
    await expect(
      prisma.trainingResult.count({ where: { sessionId: session.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.rewardLedger.count({
        where: {
          patientId: requiredFixtures().patientId,
          trainingResult: { sessionId: session.id },
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'training_result.submit',
          targetId: session.id,
          result: 'success',
        },
      }),
    ).resolves.toBe(0);
  });

  function requiredFixtures() {
    if (!fixtures) throw new Error('Task 7 fixtures are not initialized.');
    return fixtures;
  }

  function runtimeConfigSnapshot() {
    const current = requiredFixtures();
    return {
      runtimeType: 'cognitive_web',
      gameVersion: 'task7-v1',
      bridgeProtocolVersion: '1.0.0',
      approvedPlanItemId: current.planItemId,
      assessmentSourceId: current.assessmentId,
      startingLevelSource: 'clinician_approved_plan',
      startingDifficultyLevel: 2,
    };
  }

  function startDto(idempotencySuffix: string, gameRunSuffix: string) {
    const current = requiredFixtures();
    return {
      patientId: current.patientId,
      rehabPlanId: current.rehabPlanId,
      planItemId: current.planItemId,
      gameContentId: current.gameContentId,
      collectionBatchId: current.collectionBatchId,
      idempotencyKey: `${runPrefix}_${idempotencySuffix}`,
      gameRunId: `${runPrefix}_${gameRunSuffix}`,
      calibrationStatus: 'completed',
      clientStartedAt: '2026-07-13T08:00:00.000Z',
    };
  }

  function validTrainingResultDto(gameRunSuffix: string) {
    const current = requiredFixtures();
    const gameRunId = `${runPrefix}_${gameRunSuffix}`;
    const commonSummary = {
      source: 'cognitive_web',
      gameRunId,
      sequenceRecallRate: 0.75,
      pathCompletionRate: 1,
      completedRoundCount: 1,
      attemptCount: 4,
      correctStepCount: 3,
      totalStepCount: 4,
      mistakeCount: 1,
    };
    return {
      score: 80,
      completionRate: 1,
      durationSeconds: 180,
      reactionTimeMs: 1000,
      motionAccuracy: 0.75,
      exerciseIntensity: 'low',
      metricsSummary: {
        ...commonSummary,
        gameVersion: 'task7-v1',
        protocolVersion: '1.0.0',
        clientGeneratedAt: '2026-07-13T08:03:00.000Z',
        prescribedDurationSeconds: 180,
        rawPayloadHash: `sha256:${'a'.repeat(64)}`,
        rawInputStored: false,
        collectionBatchId: current.collectionBatchId,
        rounds: [
          {
            id: 'round-1',
            sequence: ['blue', 'green', 'yellow', 'red'],
            answers: ['blue', 'green', 'yellow', 'purple'],
            difficulty: {
              level: 2,
              sequenceLength: 4,
              optionCount: 5,
              presentationMs: 2600,
            },
            difficultyLevel: 2,
            presentedAtMs: Date.parse('2026-07-13T08:00:00.000Z'),
            answerStartedAtMs: Date.parse('2026-07-13T08:00:02.000Z'),
            completedAtMs: Date.parse('2026-07-13T08:00:06.000Z'),
          },
        ],
        difficultyAdjustmentCount: 0,
        dynamicDifficultyEvidence: {
          schemaVersion: '1.0.0',
          events: [],
        },
      },
      motionMetrics: [
        {
          metricType: 'sequence_recall_rate',
          metricValue: 0.75,
          confidence: 1,
          unit: 'ratio',
          sampleCount: 1,
          windowStartedAt: '2026-07-13T08:00:00.000Z',
          windowEndedAt: '2026-07-13T08:03:00.000Z',
          qualityFlag: 'valid',
          rawSummary: { ...commonSummary },
        },
        {
          metricType: 'path_completion_rate',
          metricValue: 1,
          confidence: 1,
          unit: 'ratio',
          sampleCount: 1,
          windowStartedAt: '2026-07-13T08:00:00.000Z',
          windowEndedAt: '2026-07-13T08:03:00.000Z',
          qualityFlag: 'valid',
          rawSummary: { ...commonSummary },
        },
      ],
    };
  }

  async function createSession(
    suffix: string,
    sessionStatus: 'started' | 'in_progress',
  ) {
    const current = requiredFixtures();
    return prisma.trainingSession.create({
      data: {
        patientId: current.patientId,
        createdByUserId: patientActor.id,
        rehabPlanId: current.rehabPlanId,
        planItemId: current.planItemId,
        gameContentId: current.gameContentId,
        collectionBatchId: current.collectionBatchId,
        idempotencyKey: `${runPrefix}_${suffix}`,
        gameRunId: `${runPrefix}_${suffix}`,
        clientStartedAt: new Date('2026-07-13T08:00:00.000Z'),
        calibrationStatus: 'completed',
        runtimeConfigSnapshot: runtimeConfigSnapshot(),
        bridgeProtocolVersion: '1.0.0',
        sessionStatus,
      },
    });
  }

  async function createFixtures(): Promise<Fixtures> {
    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: 'Task 7 Lifecycle Organization',
          code: `${runPrefix}_organization`,
          type: 'hospital',
        },
      });
      const doctorUserId = randomUUID();
      const doctorUser = await tx.user.create({
        data: {
          id: doctorUserId,
          account: doctorActor.account,
          identityEnvelope: encryptSensitiveJson(
            { displayName: doctorActor.displayName, mobilePhone: null },
            {
              tableName: 'user',
              recordId: doctorUserId,
              fieldName: 'identityEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
          passwordHash: `${runPrefix}_doctor_hash`,
        },
      });
      const doctor = await tx.doctorProfile.create({
        data: {
          userId: doctorUser.id,
          organizationId: organization.id,
          title: 'Task 7 Doctor',
          department: 'Rehabilitation',
        },
      });
      const patientUserId = randomUUID();
      const patientUser = await tx.user.create({
        data: {
          id: patientUserId,
          account: patientActor.account,
          identityEnvelope: encryptSensitiveJson(
            { displayName: patientActor.displayName, mobilePhone: null },
            {
              tableName: 'user',
              recordId: patientUserId,
              fieldName: 'identityEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
          passwordHash: `${runPrefix}_patient_hash`,
        },
      });
      const patientId = randomUUID();
      const patient = await tx.patientProfile.create({
        data: {
          id: patientId,
          userId: patientUser.id,
          responsibleDoctorId: doctor.id,
          identityEnvelope: encryptSensitiveJson(
            { name: 'Task 7 Patient', gender: 'unspecified', age: 68 },
            {
              tableName: 'patient_profile',
              recordId: patientId,
              fieldName: 'identityEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
          contactEnvelope: Prisma.DbNull,
          careDetailsEnvelope: encryptSensitiveJson(
            { healthMetrics: {} },
            {
              tableName: 'patient_profile',
              recordId: patientId,
              fieldName: 'careDetailsEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
        },
      });
      const assessmentId = randomUUID();
      const assessment = await tx.assessmentRecord.create({
        data: {
          id: assessmentId,
          patientId: patient.id,
          assessmentType: 'task7_lifecycle',
          source: 'clinician_input',
          status: 'completed',
          resultEnvelope: encryptSensitiveJson(
            { scoreSummary: {}, rawInputSummary: {} },
            {
              tableName: 'assessment_record',
              recordId: assessmentId,
              fieldName: 'resultEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
          completedAt: new Date('2026-07-13T07:00:00.000Z'),
        },
      });
      const riskGradeId = randomUUID();
      const riskGrade = await tx.riskGradeRecord.create({
        data: {
          id: riskGradeId,
          patientId: patient.id,
          assessmentId: assessment.id,
          riskLevel: 'moderate',
          systemRiskLevel: 'moderate',
          isCurrent: true,
          reasonEnvelope: encryptSensitiveJson(
            { reasonSummary: 'Task 7 confirmed baseline' },
            {
              tableName: 'risk_grade_record',
              recordId: riskGradeId,
              fieldName: 'reasonEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
          confirmedById: doctorUser.id,
          confirmedAt: new Date('2026-07-13T07:10:00.000Z'),
        },
      });
      const gameContent = await tx.gameContent.create({
        data: {
          code: `${runPrefix}_game`,
          name: 'Task 7 Cognitive Training',
          trainingTargets: ['memory'],
          tags: ['task7'],
          defaultDuration: 3,
          defaultDifficulty: 'standard',
          runtimeType: 'cognitive_web',
          gameVersion: 'task7-v1',
          bridgeProtocolVersion: '1.0.0',
          buildStatus: 'released',
          releaseChannel: 'production',
          supportsCamera: false,
          supportsMicrophone: false,
          supportedInputModes: ['touch'],
          requiredMetrics: [
            { metricType: 'sequence_recall_rate', unit: 'ratio' },
            { metricType: 'path_completion_rate', unit: 'ratio' },
          ],
          difficultyPolicy: {
            source: 'clinician_approved_plan',
            safetyLimits: { minLevel: 1, maxLevel: 3 },
          },
          dynamicDifficultyTriggers: ['prior_assessment'],
          requiredPermissions: [],
          resultSchema: {
            schemaVersion: '1.0.0',
            dynamicDifficultyEvidence: 'required',
          },
          publishedStatus: 'published',
          status: 'active',
        },
      });
      const condition = await tx.collectionCondition.create({
        data: {
          code: `${runPrefix}_condition`,
          name: 'Task 7 Standard Clinic',
          environment: { lighting: 'standard_clinic' },
          deviceRequirements: { input: 'touchscreen' },
          taskParameters: { posture: 'seated' },
          qualityRules: { requireCompletion: true },
        },
      });
      const protocol = await tx.collectionProtocol.create({
        data: {
          conditionId: condition.id,
          gameContentId: gameContent.id,
          code: `${runPrefix}_protocol`,
          name: 'Task 7 Cognitive Protocol',
          version: '1.0.0',
          runtimeType: 'cognitive_web',
          requiredConsentTypes: ['privacy_policy'],
          requiredInputModes: ['touch'],
          requiredMetrics: [
            { metricType: 'sequence_recall_rate', unit: 'ratio' },
            { metricType: 'path_completion_rate', unit: 'ratio' },
          ],
          conditionRules: { posture: 'seated' },
          samplingConfig: { source: 'cognitive_events' },
          qualityGate: { requireCompletion: true },
          status: 'active',
        },
      });
      const rehabPlan = await tx.rehabPlan.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          source: 'clinician_input',
          planName: 'Task 7 Active Plan',
          status: 'active',
          isCurrent: true,
          weekFrequency: 3,
          dailyDuration: 20,
          difficultyLadder: { approved: true },
          recommendationReason: 'Task 7 lifecycle verification',
          confirmedAt: new Date('2026-07-13T07:20:00.000Z'),
        },
      });
      const planItem = await tx.rehabPlanItem.create({
        data: {
          rehabPlanId: rehabPlan.id,
          gameContentId: gameContent.id,
          sequence: 1,
          durationMinutes: 3,
          frequencyPerWeek: 3,
          difficulty: 'standard',
          adaptiveRules: { source: 'clinician_approved_plan' },
        },
      });
      const consent = await tx.consentRecord.create({
        data: {
          patientId: patient.id,
          subjectUserId: patientUser.id,
          consentType: 'privacy_policy',
          consentVersion: 'v1.2',
          status: 'granted',
          grantedAt: new Date('2026-07-13T07:30:00.000Z'),
          evidenceSnapshot: { source: 'signed_clinic_consent' },
        },
      });
      const consentSnapshot = {
        version: 'v1.2',
        requiredTypes: ['privacy_policy'],
        grantedConsentIds: [consent.id],
        grants: [
          {
            id: consent.id,
            consentType: 'privacy_policy',
            consentVersion: 'v1.2',
            status: 'granted',
            grantedAt: consent.grantedAt.toISOString(),
          },
        ],
        status: 'granted',
      };
      const collectionBatch = await tx.collectionBatch.create({
        data: {
          patientId: patient.id,
          rehabPlanId: rehabPlan.id,
          planItemId: planItem.id,
          gameContentId: gameContent.id,
          protocolId: protocol.id,
          conditionId: condition.id,
          protocolVersion: protocol.version,
          status: 'ready',
          idempotencyKey: `${runPrefix}_collection_batch`,
          conditionSnapshot: {
            code: condition.code,
            environment: condition.environment,
          },
          protocolSnapshot: {
            code: protocol.code,
            version: protocol.version,
            requiredMetrics: protocol.requiredMetrics,
          },
          consentSnapshot,
          createdByUserId: doctorUser.id,
        },
      });
      const rewardRule = await tx.rewardRule.create({
        data: {
          code: `${runPrefix}_valid_completion`,
          name: 'Task 7 Valid Completion',
          eventType: 'training_result.valid_completed',
          points: 5,
          eligibility: {},
          status: 'active',
        },
      });

      return {
        organizationId: organization.id,
        doctorId: doctor.id,
        doctorUserId: doctorUser.id,
        patientId: patient.id,
        patientUserId: patientUser.id,
        assessmentId: assessment.id,
        riskGradeId: riskGrade.id,
        gameContentId: gameContent.id,
        conditionId: condition.id,
        protocolId: protocol.id,
        collectionBatchId: collectionBatch.id,
        rehabPlanId: rehabPlan.id,
        planItemId: planItem.id,
        consentId: consent.id,
        rewardRuleId: rewardRule.id,
      };
    });
  }

  async function cleanupLifecycleRecords() {
    const current = fixtures;
    if (!current) return;
    const sessions = await prisma.trainingSession.findMany({
      where: { patientId: current.patientId },
      select: { id: true },
    });
    const sessionIds = sessions.map(({ id }) => id);

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          {
            actorUserId: { in: [current.patientUserId, current.doctorUserId] },
          },
          { targetId: { in: sessionIds } },
        ],
      },
    });
    await prisma.rewardLedger.deleteMany({
      where: { patientId: current.patientId },
    });
    await prisma.motionMetric.deleteMany({
      where: { trainingSessionId: { in: sessionIds } },
    });
    await prisma.trainingResult.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await prisma.trainingSession.deleteMany({
      where: { id: { in: sessionIds } },
    });
  }

  async function cleanupFixtures() {
    const current = fixtures;
    if (!current) return;

    await prisma.rewardRule.delete({ where: { id: current.rewardRuleId } });
    await prisma.collectionBatch.delete({
      where: { id: current.collectionBatchId },
    });
    await prisma.consentRecord.delete({ where: { id: current.consentId } });
    await prisma.riskGradeRecord.delete({
      where: { id: current.riskGradeId },
    });
    await prisma.rehabPlanItem.delete({ where: { id: current.planItemId } });
    await prisma.rehabPlan.delete({ where: { id: current.rehabPlanId } });
    await prisma.assessmentRecord.delete({
      where: { id: current.assessmentId },
    });
    await prisma.patientProfile.delete({ where: { id: current.patientId } });
    await prisma.doctorProfile.delete({ where: { id: current.doctorId } });
    await prisma.user.deleteMany({
      where: { id: { in: [current.patientUserId, current.doctorUserId] } },
    });
    await prisma.collectionProtocol.delete({
      where: { id: current.protocolId },
    });
    await prisma.collectionCondition.delete({
      where: { id: current.conditionId },
    });
    await prisma.gameContent.delete({ where: { id: current.gameContentId } });
    await prisma.organization.delete({
      where: { id: current.organizationId },
    });
  }
});
