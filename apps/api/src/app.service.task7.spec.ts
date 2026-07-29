import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, type RoleCode } from '@prisma/client';
import { AppService } from './app.service';
import type { RequestUser } from './current-user';
import { PrismaService } from './prisma.service';

const testSensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-sensitive-key',
  key: Buffer.alloc(32, 11),
};

type TrainingSessionFixture = {
  id: string;
  patientId: string;
  rehabPlanId: string;
  planItemId: string;
  gameContentId: string;
  sessionStatus: string;
  result: { id: string } | null;
  runtimeConfigSnapshot: Record<string, unknown>;
  abortedAt?: Date | null;
  endedAt?: Date | null;
  abortedByUserId?: string | null;
  abortReason?: string | null;
};

type PatientProfileFixture = {
  id: string;
  responsibleDoctorId: string | null;
};

type StartPlanItemFixture = {
  gameContent: Record<string, never>;
  rehabPlan: Record<string, never>;
};

type StartCollectionBatchFixture = {
  protocol: {
    requiredConsentTypes: string[];
    requiredInputModes: string[];
  };
  condition: Record<string, never>;
};

type AsyncPrismaMock<TResult, TArgs extends unknown[]> = jest.Mock<
  Promise<TResult>,
  TArgs
>;

type LifecyclePrismaMock = {
  patientProfile: {
    findUnique: AsyncPrismaMock<
      PatientProfileFixture | null,
      [Prisma.PatientProfileFindUniqueArgs]
    >;
  };
  trainingSession: {
    findUnique: AsyncPrismaMock<
      TrainingSessionFixture | null,
      [Prisma.TrainingSessionFindUniqueArgs]
    >;
    updateMany: AsyncPrismaMock<
      Prisma.BatchPayload,
      [Prisma.TrainingSessionUpdateManyArgs]
    >;
  };
  auditLog: {
    create: AsyncPrismaMock<{ id: string }, [Prisma.AuditLogCreateArgs]>;
  };
  $transaction: AsyncPrismaMock<
    unknown,
    [(tx: LifecyclePrismaMock) => Promise<unknown>]
  >;
};

const patientUser: RequestUser = {
  id: 'patient-user-id',
  account: 'patient001',
  displayName: '患者',
  roles: [
    {
      roleCode: 'patient',
      relatedObjectType: 'patient',
      relatedObjectId: 'patient-profile-id',
    },
  ],
};

const doctorUser: RequestUser = {
  id: 'doctor-user-id',
  account: 'doctor001',
  displayName: '责任医生',
  roles: [
    {
      roleCode: 'doctor',
      relatedObjectType: 'doctor',
      relatedObjectId: 'doctor-profile-id',
    },
  ],
};

function actorWithRole(
  roleCode: RoleCode,
  relatedObjectType: string,
  relatedObjectId: string,
): RequestUser {
  return {
    id: `${roleCode}-user-id`,
    account: roleCode,
    displayName: roleCode,
    roles: [{ roleCode, relatedObjectType, relatedObjectId }],
  };
}

const forbiddenTrainingActors: Array<[string, RequestUser]> = [
  ['caregiver', actorWithRole('caregiver', 'patient', 'patient-profile-id')],
  [
    'other patient',
    actorWithRole('patient', 'patient', 'other-patient-profile-id'),
  ],
  [
    'non-responsible doctor',
    actorWithRole('doctor', 'doctor', 'other-doctor-profile-id'),
  ],
  ['admin', actorWithRole('admin', 'admin', 'admin-user-id')],
  ['super admin', actorWithRole('admin_super', 'admin', 'admin-super-user-id')],
  [
    'operator admin',
    actorWithRole('admin_operator', 'admin', 'admin-operator-user-id'),
  ],
  [
    'auditor admin',
    actorWithRole('admin_auditor', 'admin', 'admin-auditor-user-id'),
  ],
];

const activeSession: TrainingSessionFixture = {
  id: 'session-id',
  patientId: 'patient-profile-id',
  rehabPlanId: 'plan-id',
  planItemId: 'plan-item-id',
  gameContentId: 'game-id',
  sessionStatus: 'started',
  result: null,
  runtimeConfigSnapshot: {
    runtimeType: 'cognitive_web',
    approvedPlanItemId: 'plan-item-id',
  },
};

function createLifecycleService(
  firstRead: TrainingSessionFixture = activeSession,
  transactionRead: TrainingSessionFixture = firstRead,
) {
  const prisma: LifecyclePrismaMock = {
    patientProfile: {
      findUnique: jest
        .fn<
          Promise<PatientProfileFixture | null>,
          [Prisma.PatientProfileFindUniqueArgs]
        >()
        .mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        }),
    },
    trainingSession: {
      findUnique: jest
        .fn<
          Promise<TrainingSessionFixture | null>,
          [Prisma.TrainingSessionFindUniqueArgs]
        >()
        .mockResolvedValueOnce(firstRead)
        .mockResolvedValue(transactionRead),
      updateMany: jest
        .fn<
          Promise<Prisma.BatchPayload>,
          [Prisma.TrainingSessionUpdateManyArgs]
        >()
        .mockResolvedValue({ count: 1 }),
    },
    auditLog: {
      create: jest
        .fn<Promise<{ id: string }>, [Prisma.AuditLogCreateArgs]>()
        .mockResolvedValue({ id: 'audit-id' }),
    },
    $transaction: jest.fn<
      Promise<unknown>,
      [(tx: LifecyclePrismaMock) => Promise<unknown>]
    >(),
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  return {
    prisma,
    service: new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    ),
  };
}

function p2002(meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Task 7 P2002', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta,
  });
}

function createStartConflictService(error: Error) {
  const prisma = {
    rehabPlanItem: {
      findFirst: jest
        .fn<
          Promise<StartPlanItemFixture>,
          [Prisma.RehabPlanItemFindFirstArgs]
        >()
        .mockResolvedValue({
          gameContent: {},
          rehabPlan: {},
        }),
    },
    collectionBatch: {
      findUnique: jest
        .fn<
          Promise<StartCollectionBatchFixture>,
          [Prisma.CollectionBatchFindUniqueArgs]
        >()
        .mockResolvedValue({
          protocol: { requiredConsentTypes: [], requiredInputModes: [] },
          condition: {},
        }),
    },
    riskGradeRecord: {
      findFirst: jest
        .fn<
          Promise<{ assessmentId: string }>,
          [Prisma.RiskGradeRecordFindFirstArgs]
        >()
        .mockResolvedValue({ assessmentId: 'assessment-id' }),
    },
    $transaction: jest
      .fn<
        Promise<unknown>,
        [(tx: Prisma.TransactionClient) => Promise<unknown>]
      >()
      .mockRejectedValue(error),
  };
  const service = new AppService(
    prisma as unknown as PrismaService,
    testSensitiveEncryptionKey,
  );
  const validation = service as unknown as {
    assertTrainingWriteAccess: jest.Mock<Promise<void>, [RequestUser, string]>;
    assertGameReadyForFormalTraining: jest.Mock<void, [unknown]>;
    assertCollectionBatchMatchesTrainingContext: jest.Mock<
      void,
      [unknown, unknown, unknown]
    >;
    assertTrainingRuntimeConsents: jest.Mock<
      Promise<void>,
      [string, unknown, string[], string[]]
    >;
    buildTrainingRuntimeContext: jest.Mock<
      Record<string, never>,
      [unknown, unknown, unknown, unknown, string]
    >;
  };
  validation.assertTrainingWriteAccess = jest
    .fn<Promise<void>, [RequestUser, string]>()
    .mockResolvedValue(undefined);
  validation.assertGameReadyForFormalTraining = jest.fn<void, [unknown]>();
  validation.assertCollectionBatchMatchesTrainingContext = jest.fn<
    void,
    [unknown, unknown, unknown]
  >();
  validation.assertTrainingRuntimeConsents = jest
    .fn<Promise<void>, [string, unknown, string[], string[]]>()
    .mockResolvedValue(undefined);
  validation.buildTrainingRuntimeContext = jest
    .fn<Record<string, never>, [unknown, unknown, unknown, unknown, string]>()
    .mockReturnValue({});
  return service;
}

function startWithConflict(service: AppService) {
  return service.startTrainingSession(patientUser, {
    patientId: 'patient-profile-id',
    rehabPlanId: 'plan-id',
    planItemId: 'plan-item-id',
    gameContentId: 'game-id',
    collectionBatchId: 'collection-batch-id',
    idempotencyKey: 'task7-conflict-key',
  });
}

async function expectForbiddenWithoutPatientId(
  action: Promise<unknown>,
  patientId: string,
) {
  let rejection: unknown;
  try {
    await action;
  } catch (error: unknown) {
    rejection = error;
  }

  expect(rejection).toBeInstanceOf(ForbiddenException);
  if (!(rejection instanceof ForbiddenException)) {
    throw new Error('Expected the action to reject with ForbiddenException.');
  }
  expect(String(rejection)).not.toContain(patientId);
  expect(JSON.stringify(rejection.getResponse())).not.toContain(patientId);
}

function auditDataForAction(
  prisma: LifecyclePrismaMock,
  action: string,
): Prisma.AuditLogCreateArgs['data'][] {
  return prisma.auditLog.create.mock.calls
    .map(([args]) => args.data)
    .filter((data) => data.action === action);
}

function requireSingleAuditData(
  prisma: LifecyclePrismaMock,
  action: string,
): Prisma.AuditLogCreateArgs['data'] {
  const matchingAuditData = auditDataForAction(prisma, action);
  expect(matchingAuditData).toHaveLength(1);
  const [auditData] = matchingAuditData;
  if (!auditData) {
    throw new Error(`Expected one ${action} audit call.`);
  }
  return auditData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('Task 7 training session lifecycle', () => {
  describe('active-session P2002 mapping', () => {
    it('maps the observed Prisma 6 model-and-fields identity to 409', async () => {
      const conflict = p2002({
        modelName: 'TrainingSession',
        target: ['planItemId'],
      });

      await expect(
        startWithConflict(createStartConflictService(conflict)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it.each([
      [
        'the real index name as a target string',
        { target: 'training_session_one_active_per_plan_item' },
      ],
      [
        'another constraint name',
        { target: 'training_session_patientId_idempotencyKey_key' },
      ],
      [
        'another model',
        { modelName: 'CollectionBatch', target: ['planItemId'] },
      ],
      [
        'another target',
        { modelName: 'TrainingSession', target: ['idempotencyKey'] },
      ],
      [
        'an additional target field',
        {
          modelName: 'TrainingSession',
          target: ['planItemId', 'patientId'],
        },
      ],
      [
        'an additional constraint identity',
        {
          modelName: 'TrainingSession',
          target: ['planItemId'],
          constraint: 'training_session_other_unique',
        },
      ],
      ['a missing model', { target: ['planItemId'] }],
    ])('rethrows %s P2002 unchanged', async (_label, meta) => {
      const conflict = p2002(meta);

      await expect(
        startWithConflict(createStartConflictService(conflict)),
      ).rejects.toBe(conflict);
    });
  });

  describe('resumeTrainingSession', () => {
    it('CAS-resumes a started session and returns the same runtime context', async () => {
      const resumedSession = {
        ...activeSession,
        sessionStatus: 'in_progress',
      };
      const { prisma, service } = createLifecycleService(
        activeSession,
        resumedSession,
      );

      await expect(
        service.resumeTrainingSession(patientUser, 'session-id'),
      ).resolves.toEqual(resumedSession);

      expect(prisma.trainingSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'session-id',
          sessionStatus: { in: ['started', 'in_progress'] },
          result: { is: null },
        },
        data: { sessionStatus: 'in_progress' },
      });
      expect(resumedSession.id).toBe(activeSession.id);
      expect(resumedSession.runtimeConfigSnapshot).toEqual(
        activeSession.runtimeConfigSnapshot,
      );
      const resumeAudit = requireSingleAuditData(
        prisma,
        'training_session.resume',
      );
      expect(resumeAudit).toMatchObject({
        actorUserId: 'patient-user-id',
        action: 'training_session.resume',
        targetType: 'training_session',
        targetId: 'session-id',
        result: 'success',
      });
      expect(isRecord(resumeAudit.metadata)).toBe(true);
      if (!isRecord(resumeAudit.metadata)) {
        throw new Error('Expected resume audit metadata to be an object.');
      }
      expect(resumeAudit.metadata).toEqual({
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'game-id',
      });
    });

    it('keeps an in-progress session in progress without creating a replacement', async () => {
      const inProgress = {
        ...activeSession,
        sessionStatus: 'in_progress',
      };
      const { prisma, service } = createLifecycleService(
        inProgress,
        inProgress,
      );

      await expect(
        service.resumeTrainingSession(doctorUser, 'session-id'),
      ).resolves.toEqual(inProgress);

      expect(prisma.trainingSession.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.trainingSession.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma).not.toHaveProperty('trainingSession.create');
    });

    it.each(['aborted', 'completed', 'upload_failed'])(
      'rejects authorized resume from %s',
      async (sessionStatus) => {
        const { prisma, service } = createLifecycleService({
          ...activeSession,
          sessionStatus,
        });

        await expect(
          service.resumeTrainingSession(patientUser, 'session-id'),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(prisma.patientProfile.findUnique).toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('authorizes before rejecting terminal state', async () => {
      const { prisma, service } = createLifecycleService({
        ...activeSession,
        sessionStatus: 'completed',
      });
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'other-doctor-profile-id',
      });

      await expect(
        service.resumeTrainingSession(doctorUser, 'session-id'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(
        auditDataForAction(prisma, 'training_session.resume'),
      ).toHaveLength(0);
    });

    it('returns 409 without success audit when the resume CAS loses', async () => {
      const { prisma, service } = createLifecycleService();
      prisma.trainingSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.resumeTrainingSession(patientUser, 'session-id'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(
        auditDataForAction(prisma, 'training_session.resume'),
      ).toHaveLength(0);
    });

    it('keeps the resume success audit in the lifecycle transaction', async () => {
      const { prisma, service } = createLifecycleService();
      const auditFailure = new Error('resume audit failed');
      const tx: LifecyclePrismaMock = {
        ...prisma,
        trainingSession: {
          findUnique: jest
            .fn<
              Promise<TrainingSessionFixture | null>,
              [Prisma.TrainingSessionFindUniqueArgs]
            >()
            .mockResolvedValue({
              ...activeSession,
              sessionStatus: 'in_progress',
            }),
          updateMany: jest
            .fn<
              Promise<Prisma.BatchPayload>,
              [Prisma.TrainingSessionUpdateManyArgs]
            >()
            .mockResolvedValue({ count: 1 }),
        },
        auditLog: {
          create: jest
            .fn<Promise<{ id: string }>, [Prisma.AuditLogCreateArgs]>()
            .mockRejectedValue(auditFailure),
        },
      };
      prisma.$transaction.mockImplementation((callback) => callback(tx));

      await expect(
        service.resumeTrainingSession(patientUser, 'session-id'),
      ).rejects.toBe(auditFailure);

      expect(tx.trainingSession.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('abortTrainingSession', () => {
    it('CAS-aborts an active session with bounded reason and same-transaction audit', async () => {
      const abortedSession = {
        ...activeSession,
        sessionStatus: 'aborted',
        abortedAt: new Date('2026-07-13T08:00:00.000Z'),
        endedAt: new Date('2026-07-13T08:00:00.000Z'),
        abortedByUserId: 'doctor-user-id',
        abortReason: '患者主动要求停止',
      };
      const { prisma, service } = createLifecycleService(
        activeSession,
        abortedSession,
      );

      await expect(
        service.abortTrainingSession(doctorUser, 'session-id', {
          reason: '  患者主动要求停止  ',
        }),
      ).resolves.toEqual(abortedSession);

      const updateCall = prisma.trainingSession.updateMany.mock.calls[0];
      expect(updateCall).toBeDefined();
      if (!updateCall) {
        throw new Error('Expected one trainingSession.updateMany call.');
      }
      const [update] = updateCall;
      expect(update).toEqual({
        where: {
          id: 'session-id',
          sessionStatus: { in: ['started', 'in_progress'] },
          result: { is: null },
        },
        data: {
          sessionStatus: 'aborted',
          abortedAt: update.data.abortedAt,
          endedAt: update.data.endedAt,
          abortedByUserId: 'doctor-user-id',
          abortReason: '患者主动要求停止',
        },
      });
      const { abortedAt, endedAt } = update.data;
      expect(abortedAt).toBeInstanceOf(Date);
      expect(endedAt).toBeInstanceOf(Date);
      if (!(abortedAt instanceof Date) || !(endedAt instanceof Date)) {
        throw new Error('Expected abort lifecycle timestamps to be dates.');
      }
      expect(abortedAt).toBe(endedAt);

      const abortAudit = requireSingleAuditData(
        prisma,
        'training_session.abort',
      );
      expect(abortAudit).toMatchObject({
        actorUserId: 'doctor-user-id',
        action: 'training_session.abort',
        targetType: 'training_session',
        targetId: 'session-id',
        result: 'success',
      });
      expect(isRecord(abortAudit.metadata)).toBe(true);
      if (!isRecord(abortAudit.metadata)) {
        throw new Error('Expected abort audit metadata to be an object.');
      }
      expect(abortAudit.metadata).toEqual({
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'game-id',
        reasonLength: '患者主动要求停止'.length,
      });
    });

    it.each([
      ['missing body', undefined],
      ['missing reason', {}],
      ['blank reason', { reason: '   ' }],
      ['non-text reason', { reason: 7 }],
      ['reason over 500 characters', { reason: 'a'.repeat(501) }],
    ])('rejects %s after patient authorization', async (_label, body) => {
      const { prisma, service } = createLifecycleService();

      await expect(
        service.abortTrainingSession(patientUser, 'session-id', body as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.patientProfile.findUnique).toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts an abort reason exactly 500 characters long', async () => {
      const abortedSession = {
        ...activeSession,
        sessionStatus: 'aborted',
        abortReason: 'a'.repeat(500),
      };
      const { service } = createLifecycleService(activeSession, abortedSession);

      await expect(
        service.abortTrainingSession(patientUser, 'session-id', {
          reason: 'a'.repeat(500),
        }),
      ).resolves.toEqual(abortedSession);
    });

    it('does not report repeated abort as success', async () => {
      const { prisma, service } = createLifecycleService({
        ...activeSession,
        sessionStatus: 'aborted',
        abortedAt: new Date(),
        abortedByUserId: 'patient-user-id',
        abortReason: 'already aborted',
      });

      await expect(
        service.abortTrainingSession(patientUser, 'session-id', {
          reason: 'repeat',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(auditDataForAction(prisma, 'training_session.abort')).toHaveLength(
        0,
      );
    });

    it('returns 409 without success audit when abort CAS loses', async () => {
      const { prisma, service } = createLifecycleService();
      prisma.trainingSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.abortTrainingSession(patientUser, 'session-id', {
          reason: 'concurrent lifecycle change',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(auditDataForAction(prisma, 'training_session.abort')).toHaveLength(
        0,
      );
    });

    it('rejects an active session that already has a result', async () => {
      const { prisma, service } = createLifecycleService({
        ...activeSession,
        result: { id: 'result-id' },
      });

      await expect(
        service.abortTrainingSession(patientUser, 'session-id', {
          reason: 'too late',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('keeps the abort success audit in the lifecycle transaction', async () => {
      const { prisma, service } = createLifecycleService();
      const auditFailure = new Error('abort audit failed');
      const tx: LifecyclePrismaMock = {
        ...prisma,
        trainingSession: {
          findUnique: jest
            .fn<
              Promise<TrainingSessionFixture | null>,
              [Prisma.TrainingSessionFindUniqueArgs]
            >()
            .mockResolvedValue({
              ...activeSession,
              sessionStatus: 'aborted',
            }),
          updateMany: jest
            .fn<
              Promise<Prisma.BatchPayload>,
              [Prisma.TrainingSessionUpdateManyArgs]
            >()
            .mockResolvedValue({ count: 1 }),
        },
        auditLog: {
          create: jest
            .fn<Promise<{ id: string }>, [Prisma.AuditLogCreateArgs]>()
            .mockRejectedValue(auditFailure),
        },
      };
      prisma.$transaction.mockImplementation((callback) => callback(tx));

      await expect(
        service.abortTrainingSession(patientUser, 'session-id', {
          reason: 'audit rollback check',
        }),
      ).rejects.toBe(auditFailure);

      expect(tx.trainingSession.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('training write authorization matrix', () => {
    it.each(forbiddenTrainingActors)(
      'rejects %s from resume, abort, start, and result without patient ID leakage',
      async (_label, actor) => {
        const resume = createLifecycleService();
        const abort = createLifecycleService();
        const start = createLifecycleService();
        const result = createLifecycleService();

        await expectForbiddenWithoutPatientId(
          resume.service.resumeTrainingSession(actor, 'session-id'),
          activeSession.patientId,
        );
        await expectForbiddenWithoutPatientId(
          abort.service.abortTrainingSession(actor, 'session-id', {
            reason: 'not allowed',
          }),
          activeSession.patientId,
        );
        await expectForbiddenWithoutPatientId(
          start.service.startTrainingSession(actor, {
            patientId: activeSession.patientId,
            rehabPlanId: activeSession.rehabPlanId,
            planItemId: activeSession.planItemId,
            gameContentId: activeSession.gameContentId,
            collectionBatchId: 'collection-batch-id',
          }),
          activeSession.patientId,
        );
        await expectForbiddenWithoutPatientId(
          result.service.submitTrainingResult(actor, 'session-id', {
            score: 80,
            completionRate: 0.8,
            durationSeconds: 120,
            reactionTimeMs: 900,
            motionAccuracy: 0.8,
            exerciseIntensity: 'moderate',
          }),
          activeSession.patientId,
        );

        expect(resume.prisma.$transaction).not.toHaveBeenCalled();
        expect(abort.prisma.$transaction).not.toHaveBeenCalled();
        expect(start.prisma.$transaction).not.toHaveBeenCalled();
        expect(result.prisma.$transaction).not.toHaveBeenCalled();
      },
    );
  });
});
