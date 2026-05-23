import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import type { RequestUser } from './current-user';

function objectContaining<T extends object>(value: T): unknown {
  return expect.objectContaining(value);
}

function arrayContaining<T>(value: T[]): unknown {
  return expect.arrayContaining(value);
}

const adminUser: RequestUser = {
  id: 'admin-user-id',
  account: 'admin',
  displayName: '平台管理员',
  roles: [
    {
      roleCode: 'admin',
      relatedObjectType: 'admin',
      relatedObjectId: 'admin-user-id',
    },
  ],
};

const doctorUser: RequestUser = {
  id: 'doctor-user-id',
  account: 'doctor001',
  displayName: '王医生',
  roles: [
    {
      roleCode: 'doctor',
      relatedObjectType: 'doctor',
      relatedObjectId: 'doctor-profile-id',
    },
  ],
};

const patientUser: RequestUser = {
  id: 'patient-user-id',
  account: 'patient001',
  displayName: '李秀兰',
  roles: [
    {
      roleCode: 'patient',
      relatedObjectType: 'patient',
      relatedObjectId: 'patient-profile-id',
    },
  ],
};

const caregiverUser: RequestUser = {
  id: 'caregiver-user-id',
  account: 'caregiver001',
  displayName: '李明',
  roles: [
    {
      roleCode: 'caregiver',
      relatedObjectType: 'patient',
      relatedObjectId: 'patient-profile-id',
    },
  ],
};

const superAdminUser: RequestUser = {
  id: 'super-admin-user-id',
  account: 'admin',
  displayName: '平台超级管理员',
  roles: [
    {
      roleCode: 'admin_super',
      relatedObjectType: 'admin',
      relatedObjectId: 'super-admin-user-id',
    },
  ],
};

const operatorAdminUser: RequestUser = {
  id: 'operator-user-id',
  account: 'operator001',
  displayName: '运营管理员',
  roles: [
    {
      roleCode: 'admin_operator',
      relatedObjectType: 'admin',
      relatedObjectId: 'operator-user-id',
    },
  ],
};

const auditorAdminUser: RequestUser = {
  id: 'auditor-user-id',
  account: 'auditor001',
  displayName: '审计管理员',
  roles: [
    {
      roleCode: 'admin_auditor',
      relatedObjectType: 'admin',
      relatedObjectId: 'auditor-user-id',
    },
  ],
};

describe('AppService patient onboarding', () => {
  function createService() {
    const prisma = {
      doctorProfile: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      patientProfile: {
        create: jest.fn(),
      },
      userRoleBinding: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      (
        callback: (tx: {
          user: {
            create: jest.Mock;
          };
          patientProfile: typeof prisma.patientProfile;
          userRoleBinding: typeof prisma.userRoleBinding;
        }) => Promise<unknown>,
      ) =>
        callback({
          user: {
            create: jest.fn().mockResolvedValue({
              id: 'new-patient-user-id',
            }),
          },
          patientProfile: prisma.patientProfile,
          userRoleBinding: prisma.userRoleBinding,
        }),
    );

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  it('allows admins to create patient profiles by responsible doctor account', async () => {
    const { prisma, service } = createService();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.doctorProfile.findUnique.mockResolvedValue(null);
    prisma.doctorProfile.findFirst.mockResolvedValue({
      id: 'doctor-profile-id',
    });
    prisma.patientProfile.create.mockResolvedValue({
      id: 'new-patient-profile-id',
      userId: 'new-patient-user-id',
      responsibleDoctorId: 'doctor-profile-id',
      name: '赵阿姨',
    });

    await expect(
      service.createPatient(adminUser, {
        account: 'patient_new',
        initialPassword: '253913',
        name: '赵阿姨',
        gender: 'female',
        age: 70,
        responsibleDoctorId: 'doctor001',
        healthMetrics: { bloodPressure: '128/78' },
      }),
    ).resolves.toMatchObject({
      id: 'new-patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });

    expect(prisma.doctorProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'doctor001' },
      select: { id: true },
    });
    expect(prisma.doctorProfile.findFirst).toHaveBeenCalledWith({
      where: {
        user: {
          account: 'doctor001',
        },
      },
      select: { id: true },
    });
    expect(prisma.patientProfile.create).toHaveBeenCalledWith({
      data: objectContaining({
        responsibleDoctorId: 'doctor-profile-id',
        name: '赵阿姨',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'admin-user-id',
        actorRole: 'admin',
        action: 'patient.create',
        targetType: 'patient_profile',
        targetId: 'new-patient-profile-id',
        result: 'success',
      }),
    });
  });
});

describe('AppService caregiver account management', () => {
  function createService() {
    const prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  it('allows admin to create a caregiver login account without patient binding', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:00:00.000Z');
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'caregiver-user-id',
      account: 'caregiver_new',
      displayName: '张家属',
      mobilePhone: '13900001234',
      accountStatus: 'active',
      createdAt,
    });

    await expect(
      service.createCaregiverAccount(adminUser, {
        account: ' caregiver_new ',
        initialPassword: '253913',
        displayName: ' 张家属 ',
        mobilePhone: '13900001234',
      }),
    ).resolves.toEqual({
      id: 'caregiver-user-id',
      account: 'caregiver_new',
      displayName: '张家属',
      mobilePhone: '13900001234',
      accountStatus: 'active',
      createdAt,
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ account: 'caregiver_new' }, { mobilePhone: '13900001234' }],
      },
      select: { id: true },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        account: 'caregiver_new',
        passwordHash: createHash('sha256').update('253913').digest('hex'),
        displayName: '张家属',
        mobilePhone: '13900001234',
      },
      select: {
        id: true,
        account: true,
        displayName: true,
        mobilePhone: true,
        accountStatus: true,
        createdAt: true,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-user-id',
        actorRole: 'admin',
        action: 'user.create.caregiver',
        targetType: 'user',
        targetId: 'caregiver-user-id',
        result: 'success',
        metadata: {},
      },
    });
  });

  it('rejects non-admin caregiver account creation', async () => {
    const { prisma, service } = createService();

    await expect(
      service.createCaregiverAccount(doctorUser, {
        account: 'caregiver_new',
        initialPassword: '253913',
        displayName: '张家属',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('allows operator admins but rejects read-only auditors for caregiver account creation', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:30:00.000Z');
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'caregiver-operator-id',
      account: 'caregiver_operator',
      displayName: '运营创建家属',
      mobilePhone: null,
      accountStatus: 'active',
      createdAt,
    });

    await expect(
      service.createCaregiverAccount(operatorAdminUser, {
        account: 'caregiver_operator',
        initialPassword: '253913',
        displayName: '运营创建家属',
      }),
    ).resolves.toMatchObject({
      id: 'caregiver-operator-id',
      account: 'caregiver_operator',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'operator-user-id',
        actorRole: 'admin_operator',
        action: 'user.create.caregiver',
        result: 'success',
      }),
    });

    jest.clearAllMocks();

    await expect(
      service.createCaregiverAccount(auditorAdminUser, {
        account: 'caregiver_auditor',
        initialPassword: '253913',
        displayName: '审计创建家属',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate caregiver account or phone before writing user', async () => {
    const { prisma, service } = createService();
    prisma.user.findFirst.mockResolvedValue({ id: 'existing-user-id' });

    await expect(
      service.createCaregiverAccount(adminUser, {
        account: 'caregiver001',
        initialPassword: '253913',
        displayName: '李明',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('AppService caregiver training privacy', () => {
  function createService() {
    const prisma = {
      patientProfile: {
        findUnique: jest.fn(),
      },
      caregiverRelation: {
        findFirst: jest.fn(),
      },
      consentRecord: {
        findFirst: jest.fn(),
      },
      trainingSession: {
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  function mockActiveCaregiverAccess(
    prisma: ReturnType<typeof createService>['prisma'],
  ) {
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      userId: 'patient-user-id',
      name: '李秀兰',
      age: 72,
      responsibleDoctorId: 'doctor-profile-id',
      riskGrades: [{ riskLevel: 'moderate' }],
      rehabPlans: [],
      trainingSessions: [],
    });
    prisma.caregiverRelation.findFirst.mockResolvedValue({
      id: 'relation-id',
      caregiverUserId: 'caregiver-user-id',
      patientId: 'patient-profile-id',
      authorizationStatus: 'active',
      revokedAt: null,
      scope: {
        summary: true,
        reminders: true,
        progress: true,
        rawAssessment: false,
        planEdit: false,
      },
    });
    prisma.consentRecord.findFirst.mockResolvedValue({
      id: 'consent-id',
      patientId: 'patient-profile-id',
      consentType: 'caregiver_sharing',
      consentVersion: 'v1.2',
      status: 'granted',
      revokedAt: null,
    });
  }

  it('rejects caregiver access to full training records', async () => {
    const { prisma, service } = createService();
    mockActiveCaregiverAccess(prisma);

    await expect(
      service.listTrainingRecords(caregiverUser, 'patient-profile-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.trainingSession.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'caregiver-user-id',
        actorRole: 'caregiver',
        action: 'access.denied',
        targetType: 'patient_profile',
        targetId: 'patient-profile-id',
        result: 'denied',
        metadata: {},
      },
    });
  });

  it('returns caregiver summary without raw training metrics', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:00:00.000Z');
    mockActiveCaregiverAccess(prisma);
    prisma.patientProfile.findUnique
      .mockResolvedValueOnce({
        id: 'patient-profile-id',
        userId: 'patient-user-id',
        responsibleDoctorId: 'doctor-profile-id',
      })
      .mockResolvedValueOnce({
        id: 'patient-profile-id',
        name: '李秀兰',
        age: 72,
        riskGrades: [{ riskLevel: 'moderate' }],
        rehabPlans: [],
        trainingSessions: [
          {
            id: 'session-id',
            patientId: 'patient-profile-id',
            rehabPlanId: 'plan-id',
            planItemId: 'plan-item-id',
            gameContentId: 'game-id',
            sessionStatus: 'completed',
            startedAt: createdAt,
            endedAt: createdAt,
            syncStatus: 'synced',
            interruptReason: null,
            motionMetrics: [{ rawSummary: { joints: [1, 2, 3] } }],
            gameContent: {
              id: 'game-id',
              code: 'memory_card',
              name: '记忆卡片',
              trainingTargets: ['memory'],
              tags: ['低强度'],
              defaultDuration: 15,
              defaultDifficulty: 'normal',
            },
            result: {
              id: 'result-id',
              score: 86,
              completionRate: 0.9,
              durationSeconds: 900,
              reactionTimeMs: 720,
              motionAccuracy: 0.82,
              exerciseIntensity: 'moderate',
              abnormalFlag: false,
              qualityFlag: 'valid',
              metricsSummary: { rawDevicePayload: 'sensitive' },
              createdAt,
            },
          },
        ],
      });

    const result = await service.caregiverSummary(
      caregiverUser,
      'patient-profile-id',
    );

    expect(result.recentTraining).toHaveLength(1);
    expect(result.recentTraining[0]).not.toHaveProperty('motionMetrics');
    expect(result.recentTraining[0].result).not.toHaveProperty(
      'metricsSummary',
    );
    expect(result.recentTraining[0].result).toMatchObject({
      id: 'result-id',
      score: 86,
      completionRate: 0.9,
      abnormalFlag: false,
    });
  });
});

describe('AppService training write permissions', () => {
  type TrainingWritePrismaMock = {
    patientProfile: {
      findUnique: jest.Mock;
    };
    consentRecord: {
      findFirst: jest.Mock;
    };
    rehabPlanItem: {
      findFirst: jest.Mock;
    };
    trainingSession: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    trainingResult: {
      create: jest.Mock;
    };
    motionMetric: {
      createMany: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  function createService() {
    const prisma: TrainingWritePrismaMock = {
      patientProfile: {
        findUnique: jest.fn(),
      },
      consentRecord: {
        findFirst: jest.fn(),
      },
      rehabPlanItem: {
        findFirst: jest.fn(),
      },
      trainingSession: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      trainingResult: {
        create: jest.fn(),
      },
      motionMetric: {
        createMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      <T>(callback: (tx: TrainingWritePrismaMock) => Promise<T>) =>
        callback(prisma),
    );

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  const unityGameContent = {
    id: 'game-id',
    code: 'rhythm_saber',
    name: '节奏光剑',
    runtimeType: 'unity_webgl',
    manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
    buildBaseUrl: '/unity/rhythm_saber/1.0.0',
    gameVersion: '1.0.0',
    bridgeProtocolVersion: '1.0.0',
    buildStatus: 'released',
    releaseChannel: 'production',
    status: 'active',
    supportedInputModes: ['camera_pose'],
    requiredMetrics: [],
  };

  const browserPoseGameContent = {
    id: 'browser-game-id',
    code: 'pose_reaction_hit',
    name: '上肢反应触达',
    runtimeType: 'browser_pose_game',
    manifestUrl: null,
    buildBaseUrl: null,
    gameVersion: '1.0.0',
    bridgeProtocolVersion: '1.0.0',
    buildStatus: 'released',
    releaseChannel: 'production',
    status: 'active',
    supportedInputModes: ['camera_pose'],
    requiredMetrics: [
      { metricType: 'reaction_time_ms', unit: 'ms', min: 0 },
      { metricType: 'target_hit_rate', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'pose_visibility_avg', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'arm_raise_accuracy', unit: 'ratio', min: 0, max: 1 },
    ],
  };

  function mockTrainingAccess(
    prisma: ReturnType<typeof createService>['prisma'],
    grantedConsents: Array<'privacy_policy' | 'camera_capture'> = [
      'privacy_policy',
      'camera_capture',
    ],
  ) {
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.consentRecord.findFirst.mockImplementation(
      ({
        where,
      }: {
        where: {
          consentType: 'privacy_policy' | 'camera_capture';
        };
      }) => {
        const consentType = where.consentType;
        if (!grantedConsents.includes(consentType)) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          id: `${consentType}-consent-id`,
          patientId: 'patient-profile-id',
          consentType,
          consentVersion: 'v1.2',
          status: 'granted',
          revokedAt: null,
        });
      },
    );
    prisma.rehabPlanItem.findFirst.mockResolvedValue({
      id: 'plan-item-id',
      gameContent: unityGameContent,
    });
    prisma.trainingSession.upsert.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      result: null,
    });
    prisma.trainingSession.create.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      result: null,
    });
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      result: null,
      gameContent: {
        id: 'game-id',
        code: 'rhythm_saber',
        runtimeType: 'unity_webgl',
      },
    });
    prisma.trainingResult.create.mockResolvedValue({
      id: 'result-id',
    });
  }

  it.each([
    ['caregiver', caregiverUser],
    ['admin_auditor', auditorAdminUser],
  ])(
    'rejects %s from starting or submitting training',
    async (_label, user) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);

      await expect(
        service.startTrainingSession(user, {
          patientId: 'patient-profile-id',
          rehabPlanId: 'plan-id',
          planItemId: 'plan-item-id',
          gameContentId: 'game-id',
          gameRunId: 'run-001',
          deviceCode: 'camera-001',
          calibrationStatus: 'checked',
          clientStartedAt: '2026-05-20T06:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.submitTrainingResult(user, 'session-id', {
          score: 92,
          completionRate: 0.96,
          durationSeconds: 480,
          reactionTimeMs: 820,
          motionAccuracy: 0.91,
          exerciseIntensity: 'moderate',
          metricsSummary: {
            source: 'unity_webgl',
            gameRunId: 'run-001',
            gameVersion: '1.0.0',
            protocolVersion: '1.0.0',
            clientGeneratedAt: '2026-05-20T06:30:00.000Z',
            rawPayloadHash: 'hash-001',
          },
          motionMetrics: [{ metricType: 'reach', metricValue: 1 }],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.consentRecord.findFirst).not.toHaveBeenCalled();
      expect(prisma.rehabPlanItem.findFirst).not.toHaveBeenCalled();
      expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
      expect(prisma.trainingSession.create).not.toHaveBeenCalled();
      expect(prisma.trainingSession.update).not.toHaveBeenCalled();
      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    },
  );

  it('creates a training session only when Unity build assets are released', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);

    await expect(
      service.startTrainingSession(doctorUser, {
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'game-id',
        gameRunId: 'run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        clientStartedAt: '2026-05-20T06:00:00.000Z',
        idempotencyKey: 'training-run-001',
      }),
    ).resolves.toMatchObject({
      id: 'session-id',
      patientId: 'patient-profile-id',
    });

    expect(prisma.trainingSession.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: 'training-run-001' },
      update: {},
      create: objectContaining({
        patientId: 'patient-profile-id',
        idempotencyKey: 'training-run-001',
        gameRunId: 'run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        unityBuildVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        sessionStatus: 'in_progress',
      }),
    });
  });

  it('rejects starting training when privacy consent is missing even if camera consent exists', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma, ['camera_capture']);

    await expect(
      service.startTrainingSession(doctorUser, {
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'game-id',
        gameRunId: 'run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        clientStartedAt: '2026-05-20T06:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith({
      where: {
        patientId: 'patient-profile-id',
        consentType: 'privacy_policy',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      },
      orderBy: { grantedAt: 'desc' },
    });
    expect(prisma.rehabPlanItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.create).not.toHaveBeenCalled();
  });

  it('rejects starting training when camera consent is missing even if privacy consent exists', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma, ['privacy_policy']);

    await expect(
      service.startTrainingSession(doctorUser, {
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'game-id',
        gameRunId: 'run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        clientStartedAt: '2026-05-20T06:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith({
      where: {
        patientId: 'patient-profile-id',
        consentType: 'camera_capture',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      },
      orderBy: { grantedAt: 'desc' },
    });
    expect(prisma.rehabPlanItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.create).not.toHaveBeenCalled();
  });

  it('rejects starting training before Unity build assets are released', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.rehabPlanItem.findFirst.mockResolvedValue({
      id: 'plan-item-id',
      gameContent: {
        id: 'game-id',
        code: 'rhythm_saber',
        name: '节奏光剑',
        runtimeType: 'unity_webgl',
        manifestUrl: null,
        gameVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        buildStatus: 'pending_assets',
        status: 'active',
      },
    });

    await expect(
      service.startTrainingSession(doctorUser, {
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'game-id',
        gameRunId: 'run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        clientStartedAt: '2026-05-20T06:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.create).not.toHaveBeenCalled();
  });

  it('rejects starting training when released game content has been disabled', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.rehabPlanItem.findFirst.mockResolvedValue({
      id: 'plan-item-id',
      gameContent: {
        id: 'game-id',
        code: 'rhythm_saber',
        name: '节奏光剑',
        runtimeType: 'unity_webgl',
        manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
        buildBaseUrl: '/unity/rhythm_saber/1.0.0',
        gameVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        buildStatus: 'released',
        releaseChannel: 'production',
        status: 'inactive',
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [],
      },
    });

    await expect(
      service.startTrainingSession(doctorUser, {
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'game-id',
        gameRunId: 'run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        clientStartedAt: '2026-05-20T06:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.create).not.toHaveBeenCalled();
  });

  it('creates a training session for released browser pose games without Unity manifest', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.rehabPlanItem.findFirst.mockResolvedValue({
      id: 'plan-item-id',
      gameContent: browserPoseGameContent,
    });

    await expect(
      service.startTrainingSession(doctorUser, {
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'browser-game-id',
        gameRunId: 'pose-run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        clientStartedAt: '2026-05-20T06:00:00.000Z',
        idempotencyKey: 'pose-training-run-001',
      }),
    ).resolves.toMatchObject({
      id: 'session-id',
      patientId: 'patient-profile-id',
    });

    expect(prisma.trainingSession.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: 'pose-training-run-001' },
      update: {},
      create: objectContaining({
        patientId: 'patient-profile-id',
        gameContentId: 'browser-game-id',
        gameRunId: 'pose-run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        unityBuildVersion: undefined,
        bridgeProtocolVersion: '1.0.0',
        sessionStatus: 'in_progress',
      }),
    });
  });

  it.each([
    [
      'missing camera_pose input mode',
      {
        supportedInputModes: ['keyboard'],
        requiredMetrics: browserPoseGameContent.requiredMetrics,
      },
    ],
    [
      'empty required metrics',
      { supportedInputModes: ['camera_pose'], requiredMetrics: [] },
    ],
    [
      'missing required metric type',
      {
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [
          { metricType: 'reaction_time_ms', unit: 'ms', min: 0 },
          { metricType: 'target_hit_rate', unit: 'ratio', min: 0, max: 1 },
          { metricType: 'pose_visibility_avg', unit: 'ratio', min: 0, max: 1 },
        ],
      },
    ],
    [
      'missing game version',
      {
        gameVersion: null,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: browserPoseGameContent.requiredMetrics,
      },
    ],
  ])('rejects browser pose game start with %s', async (_label, override) => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.rehabPlanItem.findFirst.mockResolvedValue({
      id: 'plan-item-id',
      gameContent: {
        ...browserPoseGameContent,
        ...override,
      },
    });

    await expect(
      service.startTrainingSession(doctorUser, {
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'browser-game-id',
        gameRunId: 'pose-run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        clientStartedAt: '2026-05-20T06:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.create).not.toHaveBeenCalled();
  });

  it('rejects submitTrainingResult without current camera_capture consent', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma, ['privacy_policy']);
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      result: null,
      gameContent: {
        id: 'game-id',
        code: 'rhythm_saber',
        runtimeType: 'unity_webgl',
      },
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        score: 92,
        completionRate: 0.96,
        durationSeconds: 480,
        reactionTimeMs: 820,
        motionAccuracy: 0.91,
        exerciseIntensity: 'moderate',
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
        },
        motionMetrics: [{ metricType: 'reach', metricValue: 1 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it('rejects submitTrainingResult when privacy consent is missing before writing metrics', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma, ['camera_capture']);
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      result: null,
      gameContent: {
        id: 'game-id',
        code: 'rhythm_saber',
        runtimeType: 'unity_webgl',
      },
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        score: 92,
        completionRate: 0.96,
        durationSeconds: 480,
        reactionTimeMs: 820,
        motionAccuracy: 0.91,
        exerciseIntensity: 'moderate',
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
        },
        motionMetrics: [{ metricType: 'reach', metricValue: 1 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it('creates a training result for valid payloads', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      result: null,
      gameContent: {
        id: 'game-id',
        code: 'rhythm_saber',
        runtimeType: 'unity_webgl',
      },
    });
    prisma.trainingResult.create.mockResolvedValue({
      id: 'result-id',
      score: 92,
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        score: 92,
        completionRate: 0.96,
        durationSeconds: 480,
        reactionTimeMs: 820,
        motionAccuracy: 0.91,
        exerciseIntensity: 'moderate',
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
        },
        motionMetrics: [
          {
            metricType: 'reach',
            metricValue: 1,
            confidence: 0.8,
            rawSummary: { direction: 'forward' },
          },
        ],
      }),
    ).resolves.toMatchObject({
      id: 'result-id',
      score: 92,
    });

    expect(prisma.trainingSession.update).toHaveBeenCalledWith({
      where: { id: 'session-id' },
      data: objectContaining({
        sessionStatus: 'completed',
        syncStatus: 'synced',
      }),
    });
    expect(prisma.trainingResult.create).toHaveBeenCalledWith({
      data: objectContaining({
        sessionId: 'session-id',
        source: 'unity_webgl',
        gameRunId: 'run-001',
        gameVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        rawPayloadHash: 'hash-001',
        score: 92,
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
        },
      }),
    });
    expect(prisma.motionMetric.createMany).toHaveBeenCalledWith({
      data: [
        {
          trainingSessionId: 'session-id',
          gameRunId: 'run-001',
          source: 'unity_webgl',
          metricType: 'reach',
          metricValue: 1,
          unit: undefined,
          confidence: 0.8,
          sampleCount: undefined,
          windowStartedAt: undefined,
          windowEndedAt: undefined,
          qualityFlag: 'valid',
          bodyPart: undefined,
          jointName: undefined,
          rawSummary: { direction: 'forward' },
        },
      ],
    });
  });

  it('creates a training result when browser pose game source matches runtime', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      gameRunId: 'pose-run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      result: null,
      gameContent: {
        id: 'browser-game-id',
        code: 'pose_reaction_hit',
        runtimeType: 'browser_pose_game',
        gameVersion: '1.0.0',
      },
    });
    prisma.trainingResult.create.mockResolvedValue({
      id: 'result-id',
      score: 88,
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        score: 88,
        completionRate: 0.9,
        durationSeconds: 480,
        reactionTimeMs: 760,
        motionAccuracy: 0.86,
        exerciseIntensity: 'moderate',
        metricsSummary: {
          source: 'browser_pose_game',
          gameRunId: 'pose-run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'pose-hash-001',
        },
        motionMetrics: [
          {
            metricType: 'reaction_time_ms',
            metricValue: 760,
            unit: 'ms',
            confidence: 0.9,
            sampleCount: 120,
            qualityFlag: 'valid',
          },
          {
            metricType: 'target_hit_rate',
            metricValue: 0.82,
            unit: 'ratio',
            confidence: 0.9,
            sampleCount: 20,
            qualityFlag: 'valid',
          },
          {
            metricType: 'pose_visibility_avg',
            metricValue: 0.88,
            unit: 'ratio',
            confidence: 0.92,
            sampleCount: 120,
            qualityFlag: 'valid',
          },
          {
            metricType: 'arm_raise_accuracy',
            metricValue: 0.84,
            unit: 'ratio',
            confidence: 0.9,
            sampleCount: 20,
            qualityFlag: 'valid',
          },
        ],
      }),
    ).resolves.toMatchObject({
      id: 'result-id',
      score: 88,
    });

    expect(prisma.trainingResult.create).toHaveBeenCalledWith({
      data: objectContaining({
        sessionId: 'session-id',
        source: 'browser_pose_game',
        gameRunId: 'pose-run-001',
        gameVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        rawPayloadHash: 'pose-hash-001',
        score: 88,
      }),
    });
    expect(prisma.motionMetric.createMany).toHaveBeenCalledWith({
      data: [
        objectContaining({
          trainingSessionId: 'session-id',
          gameRunId: 'pose-run-001',
          source: 'browser_pose_game',
          metricType: 'reaction_time_ms',
          metricValue: 760,
          unit: 'ms',
          confidence: 0.9,
          sampleCount: 120,
        }),
        objectContaining({
          metricType: 'target_hit_rate',
        }),
        objectContaining({
          metricType: 'pose_visibility_avg',
        }),
        objectContaining({
          metricType: 'arm_raise_accuracy',
        }),
      ],
    });
  });

  it('rejects browser pose training result when required motion metrics are incomplete', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      gameRunId: 'pose-run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      result: null,
      gameContent: {
        id: 'browser-game-id',
        code: 'pose_reaction_hit',
        runtimeType: 'browser_pose_game',
        gameVersion: '1.0.0',
      },
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        score: 88,
        completionRate: 0.9,
        durationSeconds: 480,
        reactionTimeMs: 760,
        motionAccuracy: 0.86,
        exerciseIntensity: 'moderate',
        metricsSummary: {
          source: 'browser_pose_game',
          gameRunId: 'pose-run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'pose-hash-001',
        },
        motionMetrics: [
          {
            metricType: 'reaction_time_ms',
            metricValue: 760,
            unit: 'ms',
            confidence: 0.9,
            sampleCount: 120,
          },
        ],
      }),
    ).rejects.toThrow(/target_hit_rate|pose_visibility_avg|arm_raise_accuracy/);

    expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it('rejects browser pose training result when required motion metrics omit explicit quality flag', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      gameRunId: 'pose-run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      result: null,
      gameContent: {
        id: 'browser-game-id',
        code: 'pose_reaction_hit',
        runtimeType: 'browser_pose_game',
        gameVersion: '1.0.0',
      },
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        score: 88,
        completionRate: 0.9,
        durationSeconds: 480,
        reactionTimeMs: 760,
        motionAccuracy: 0.86,
        exerciseIntensity: 'moderate',
        metricsSummary: {
          source: 'browser_pose_game',
          gameRunId: 'pose-run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'pose-hash-001',
        },
        motionMetrics: [
          {
            metricType: 'reaction_time_ms',
            metricValue: 760,
            unit: 'ms',
            confidence: 0.9,
            sampleCount: 120,
          },
          {
            metricType: 'target_hit_rate',
            metricValue: 0.82,
            unit: 'ratio',
            confidence: 0.9,
            sampleCount: 20,
            qualityFlag: 'valid',
          },
          {
            metricType: 'pose_visibility_avg',
            metricValue: 0.88,
            unit: 'ratio',
            confidence: 0.92,
            sampleCount: 120,
            qualityFlag: 'valid',
          },
          {
            metricType: 'arm_raise_accuracy',
            metricValue: 0.84,
            unit: 'ratio',
            confidence: 0.9,
            sampleCount: 20,
            qualityFlag: 'valid',
          },
        ],
      }),
    ).rejects.toThrow(/qualityFlag|质量标记/);

    expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it.each([
    [
      'unity session receiving browser pose result',
      'unity_webgl',
      'browser_pose_game',
    ],
    [
      'browser pose session receiving Unity result',
      'browser_pose_game',
      'unity_webgl',
    ],
  ])(
    'rejects source/runtime mismatch for %s',
    async (_label, runtimeType, source) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      prisma.trainingSession.findUnique.mockResolvedValue({
        id: 'session-id',
        patientId: 'patient-profile-id',
        gameRunId: 'run-001',
        unityBuildVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        result: null,
        gameContent: {
          id: 'game-id',
          code:
            runtimeType === 'unity_webgl'
              ? 'rhythm_saber'
              : 'pose_reaction_hit',
          runtimeType,
          gameVersion: '1.0.0',
        },
      });

      await expect(
        service.submitTrainingResult(doctorUser, 'session-id', {
          score: 92,
          completionRate: 0.96,
          durationSeconds: 480,
          reactionTimeMs: 820,
          motionAccuracy: 0.91,
          exerciseIntensity: 'moderate',
          metricsSummary: {
            source,
            gameRunId: 'run-001',
            gameVersion: '1.0.0',
            protocolVersion: '1.0.0',
            clientGeneratedAt: '2026-05-20T06:30:00.000Z',
            rawPayloadHash: 'hash-001',
          },
          motionMetrics: [{ metricType: 'reaction_time_ms', metricValue: 820 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.trainingSession.update).not.toHaveBeenCalled();
      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    },
  );

  it('rejects duplicate training result submissions', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      result: {
        id: 'result-id',
      },
      gameContent: {
        id: 'game-id',
        code: 'rhythm_saber',
        runtimeType: 'unity_webgl',
      },
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        score: 92,
        completionRate: 0.96,
        durationSeconds: 480,
        reactionTimeMs: 820,
        motionAccuracy: 0.91,
        exerciseIntensity: 'moderate',
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
        },
        motionMetrics: [{ metricType: 'reach', metricValue: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it.each(['demo', 'mock-device'])(
    'rejects %s source in training result submission',
    async (source) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      prisma.trainingSession.findUnique.mockResolvedValue({
        id: 'session-id',
        patientId: 'patient-profile-id',
        gameRunId: 'run-001',
        unityBuildVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        result: null,
        gameContent: {
          id: 'game-id',
          code: 'rhythm_saber',
          runtimeType: 'unity_webgl',
        },
      });

      await expect(
        service.submitTrainingResult(doctorUser, 'session-id', {
          score: 92,
          completionRate: 0.96,
          durationSeconds: 480,
          reactionTimeMs: 820,
          motionAccuracy: 0.91,
          exerciseIntensity: 'moderate',
          metricsSummary: { source },
          motionMetrics: [{ metricType: 'reach', metricValue: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.trainingSession.update).not.toHaveBeenCalled();
      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    },
  );
});

describe('AppService training result review', () => {
  function createService() {
    const prisma = {
      trainingResult: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      patientProfile: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  const suspiciousResult = {
    id: 'result-id',
    sessionId: 'session-id',
    qualityFlag: 'suspicious',
    abnormalFlag: true,
    qualityReasons: ['训练时长过短', '完成率过低'],
    reviewStatus: null,
    reviewConclusion: null,
    reviewNote: null,
    reviewedByUserId: null,
    reviewedAt: null,
    session: {
      id: 'session-id',
      patientId: 'patient-profile-id',
      patient: {
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      },
    },
  };

  it('allows responsible doctors to review suspicious training results and audits the conclusion', async () => {
    const { prisma, service } = createService();
    const reviewedAt = new Date('2026-05-20T07:00:00.000Z');
    prisma.trainingResult.findUnique.mockResolvedValue(suspiciousResult);
    prisma.trainingResult.update.mockResolvedValue({
      ...suspiciousResult,
      reviewStatus: 'reviewed',
      reviewConclusion: 'needs_retrain',
      reviewNote: '姿态置信度不足，本次结果不纳入训练趋势，请患者重新训练。',
      reviewedByUserId: 'doctor-user-id',
      reviewedAt,
    });

    await expect(
      service.reviewTrainingResult(doctorUser, 'result-id', {
        reviewConclusion: 'needs_retrain',
        reviewNote: '姿态置信度不足，本次结果不纳入训练趋势，请患者重新训练。',
      }),
    ).resolves.toMatchObject({
      id: 'result-id',
      reviewStatus: 'reviewed',
      reviewConclusion: 'needs_retrain',
      reviewNote: '姿态置信度不足，本次结果不纳入训练趋势，请患者重新训练。',
      reviewedByUserId: 'doctor-user-id',
    });

    expect(prisma.trainingResult.update).toHaveBeenCalledWith({
      where: { id: 'result-id' },
      data: {
        reviewStatus: 'reviewed',
        reviewConclusion: 'needs_retrain',
        reviewNote: '姿态置信度不足，本次结果不纳入训练趋势，请患者重新训练。',
        reviewedByUserId: 'doctor-user-id',
        reviewedAt: expect.any(Date) as Date,
      },
      include: {
        session: {
          include: {
            patient: true,
            gameContent: true,
            motionMetrics: true,
          },
        },
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'training_result.review',
        targetType: 'training_result',
        targetId: 'result-id',
        result: 'success',
        metadata: {
          patientId: 'patient-profile-id',
          sessionId: 'session-id',
          reviewConclusion: 'needs_retrain',
        },
      },
    });
  });

  it('rejects blank review conclusion and note before updating or auditing', async () => {
    const { prisma, service } = createService();

    await expect(
      service.reviewTrainingResult(doctorUser, 'result-id', {
        reviewConclusion: '',
        reviewNote: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingResult.findUnique).not.toHaveBeenCalled();
    expect(prisma.trainingResult.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects review for normal training results that do not require manual review', async () => {
    const { prisma, service } = createService();
    prisma.trainingResult.findUnique.mockResolvedValue({
      ...suspiciousResult,
      qualityFlag: 'valid',
      abnormalFlag: false,
      qualityReasons: [],
    });

    await expect(
      service.reviewTrainingResult(doctorUser, 'result-id', {
        reviewConclusion: 'accepted_valid',
        reviewNote: '正常训练结果不应进入人工复核流程。',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingResult.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate training result review before updating or auditing', async () => {
    const { prisma, service } = createService();
    prisma.trainingResult.findUnique.mockResolvedValue({
      ...suspiciousResult,
      reviewStatus: 'reviewed',
      reviewConclusion: 'needs_retrain',
      reviewNote: '已要求重新训练。',
      reviewedByUserId: 'doctor-user-id',
      reviewedAt: new Date('2026-05-20T07:00:00.000Z'),
    });

    await expect(
      service.reviewTrainingResult(doctorUser, 'result-id', {
        reviewConclusion: 'excluded_from_analysis',
        reviewNote: '重复复核应被阻断。',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingResult.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects read-only auditors from reviewing training results', async () => {
    const { prisma, service } = createService();
    prisma.trainingResult.findUnique.mockResolvedValue(suspiciousResult);

    await expect(
      service.reviewTrainingResult(auditorAdminUser, 'result-id', {
        reviewConclusion: 'confirmed_abnormal',
        reviewNote: '审计账号仅可查看，不允许写入业务复核结论。',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.trainingResult.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'auditor-user-id',
        actorRole: 'admin_auditor',
        action: 'access.denied',
        targetType: 'training_result',
        targetId: 'patient-profile-id',
        result: 'denied',
        metadata: { reason: 'training_review_required' },
      },
    });
  });
});

describe('AppService rehab plan recommendation game readiness', () => {
  type RecommendationPrismaMock = {
    patientProfile: {
      findUnique: jest.Mock;
    };
    riskGradeRecord: {
      findFirst: jest.Mock;
    };
    gameContent: {
      findMany: jest.Mock;
    };
    rehabPlan: {
      updateMany: jest.Mock;
      create: jest.Mock<
        Promise<RecommendationPlanCreateResult>,
        [RecommendationPlanCreateArgs]
      >;
    };
    auditLog: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  type RecommendationPlanItemCreateInput = {
    gameContentId: string;
    [key: string]: unknown;
  };

  type RecommendationPlanCreateData = {
    items: {
      create: RecommendationPlanItemCreateInput[];
    };
    [key: string]: unknown;
  };

  type RecommendationPlanCreateArgs = {
    data: RecommendationPlanCreateData;
    include: {
      items: {
        include: {
          gameContent: boolean;
        };
      };
    };
  };

  type RecommendationPlanCreateResult = Omit<
    RecommendationPlanCreateData,
    'items'
  > & {
    id: string;
    items: (RecommendationPlanItemCreateInput & {
      gameContent: object;
    })[];
  };

  function createService() {
    const prisma: RecommendationPrismaMock = {
      patientProfile: {
        findUnique: jest.fn(),
      },
      riskGradeRecord: {
        findFirst: jest.fn(),
      },
      gameContent: {
        findMany: jest.fn(),
      },
      rehabPlan: {
        updateMany: jest.fn(),
        create: jest.fn<
          Promise<RecommendationPlanCreateResult>,
          [RecommendationPlanCreateArgs]
        >(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      <T>(callback: (tx: RecommendationPrismaMock) => Promise<T>) =>
        callback(prisma),
    );

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  const releasedUnityGame = {
    id: 'unity-game-id',
    code: 'rhythm_saber',
    name: '节奏光剑',
    trainingTargets: ['reaction'],
    tags: ['反应', '中低强度'],
    defaultDuration: 8,
    defaultDifficulty: '0.8x',
    runtimeType: 'unity_webgl',
    manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
    buildBaseUrl: '/unity/rhythm_saber/1.0.0',
    gameVersion: '1.0.0',
    bridgeProtocolVersion: '1.0.0',
    buildStatus: 'released',
    releaseChannel: 'production',
    status: 'active',
    supportedInputModes: ['camera_pose'],
    requiredMetrics: [{ metricType: 'arm_raise_accuracy', unit: 'ratio' }],
  };

  const releasedBrowserPoseGame = {
    id: 'browser-game-id',
    code: 'pose_reaction_hit',
    name: '上肢反应触达',
    trainingTargets: ['reaction', 'upper_limb'],
    tags: ['反应', '中低强度', '动作准确率'],
    defaultDuration: 8,
    defaultDifficulty: '基础',
    runtimeType: 'browser_pose_game',
    manifestUrl: null,
    buildBaseUrl: null,
    gameVersion: '1.0.0',
    bridgeProtocolVersion: '1.0.0',
    buildStatus: 'released',
    releaseChannel: 'production',
    status: 'active',
    supportedInputModes: ['camera_pose'],
    requiredMetrics: [
      { metricType: 'reaction_time_ms', unit: 'ms', min: 0 },
      { metricType: 'target_hit_rate', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'pose_visibility_avg', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'arm_raise_accuracy', unit: 'ratio', min: 0, max: 1 },
    ],
  };

  it('recommends formally ready browser pose games together with released Unity games', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      userId: 'patient-user-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.riskGradeRecord.findFirst.mockResolvedValue({
      id: 'risk-id',
      patientId: 'patient-profile-id',
      riskLevel: 'moderate',
      isCurrent: true,
      createdAt: new Date('2026-05-20T06:00:00.000Z'),
    });
    prisma.gameContent.findMany.mockResolvedValue([
      releasedUnityGame,
      releasedBrowserPoseGame,
      {
        ...releasedBrowserPoseGame,
        id: 'invalid-browser-game-id',
        code: 'invalid_pose_game',
        requiredMetrics: [],
      },
    ]);
    prisma.rehabPlan.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'plan-id',
        ...data,
        items: data.items.create.map((item) => ({
          ...item,
          gameContent:
            item.gameContentId === 'browser-game-id'
              ? releasedBrowserPoseGame
              : releasedUnityGame,
        })),
      }),
    );

    const result = await service.recommendPlan(doctorUser, {
      patientId: 'patient-profile-id',
    });

    expect(prisma.gameContent.findMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        runtimeType: { in: ['unity_webgl', 'browser_pose_game'] },
        buildStatus: 'released',
        gameVersion: { not: null },
        bridgeProtocolVersion: '1.0.0',
      },
      orderBy: { name: 'asc' },
    });
    expect(prisma.rehabPlan.create).toHaveBeenCalledWith({
      data: objectContaining({
        items: {
          create: arrayContaining([
            objectContaining({ gameContentId: 'browser-game-id' }),
            objectContaining({ gameContentId: 'unity-game-id' }),
          ]),
        },
      }),
      include: { items: { include: { gameContent: true } } },
    });
    expect(
      prisma.rehabPlan.create.mock.calls[0][0].data.items.create,
    ).not.toEqual(
      expect.arrayContaining([
        objectContaining({ gameContentId: 'invalid-browser-game-id' }),
      ]),
    );
    expect(result.items).toEqual(
      expect.arrayContaining([
        objectContaining({ gameContentId: 'browser-game-id' }),
      ]),
    );
  });

  it('rejects recommendation when the patient has no current risk grade', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      userId: 'patient-user-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.riskGradeRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.recommendPlan(doctorUser, {
        patientId: 'patient-profile-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.gameContent.findMany).not.toHaveBeenCalled();
    expect(prisma.rehabPlan.create).not.toHaveBeenCalled();
  });
});

describe('AppService assessment consent requirements', () => {
  function createService() {
    const prisma = {
      patientProfile: {
        findUnique: jest.fn(),
      },
      consentRecord: {
        findFirst: jest.fn(),
      },
      assessmentRecord: {
        create: jest.fn(),
      },
      riskGradeRecord: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      aiAnalysisRecord: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  const assessmentDto = {
    patientId: 'patient-profile-id',
    assessmentType: 'MMSE/CDR',
    scoreSummary: {
      mmse: 22,
      cdr: 1,
      memory: 48,
      orientation: 58,
      executive: 52,
      language: 73,
    },
    rawInputSummary: {
      source: 'clinician_input',
      transcript: '完成 MMSE/CDR 评估并录入临床摘要。',
      analysisSummary: '存在轻中度认知风险，建议进行反应与记忆训练。',
      modelVersion: 'spark-manual-v1',
      confidence: 0.84,
    },
  };

  it('rejects assessment when privacy consent is missing even if AI consent exists', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.consentRecord.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'ai-consent-id',
        patientId: 'patient-profile-id',
        consentType: 'ai_processing',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      });

    await expect(
      service.createAssessment(doctorUser, assessmentDto),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith({
      where: {
        patientId: 'patient-profile-id',
        consentType: 'privacy_policy',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      },
      orderBy: { grantedAt: 'desc' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
  });

  it('rejects assessment when AI consent is missing even if privacy consent exists', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.consentRecord.findFirst
      .mockResolvedValueOnce({
        id: 'privacy-consent-id',
        patientId: 'patient-profile-id',
        consentType: 'privacy_policy',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.createAssessment(doctorUser, assessmentDto),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith({
      where: {
        patientId: 'patient-profile-id',
        consentType: 'ai_processing',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      },
      orderBy: { grantedAt: 'desc' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
  });

  it('creates assessment, current risk grade, AI analysis, and audit after required consents', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.consentRecord.findFirst
      .mockResolvedValueOnce({
        id: 'privacy-consent-id',
        patientId: 'patient-profile-id',
        consentType: 'privacy_policy',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'ai-consent-id',
        patientId: 'patient-profile-id',
        consentType: 'ai_processing',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      });
    prisma.assessmentRecord.create.mockResolvedValue({
      id: 'assessment-id',
      patientId: 'patient-profile-id',
      assessmentType: 'MMSE/CDR',
    });

    await expect(
      service.createAssessment(doctorUser, assessmentDto),
    ).resolves.toMatchObject({
      id: 'assessment-id',
      patientId: 'patient-profile-id',
    });

    expect(prisma.assessmentRecord.create).toHaveBeenCalledWith({
      data: objectContaining({
        patientId: 'patient-profile-id',
        assessmentType: 'MMSE/CDR',
        source: 'clinician_input',
        scoreSummary: assessmentDto.scoreSummary,
        rawInputSummary: assessmentDto.rawInputSummary,
        completedAt: expect.any(Date) as Date,
      }),
    });
    expect(prisma.riskGradeRecord.updateMany).toHaveBeenCalledWith({
      where: { patientId: 'patient-profile-id', isCurrent: true },
      data: { isCurrent: false },
    });
    expect(prisma.riskGradeRecord.create).toHaveBeenCalledWith({
      data: objectContaining({
        patientId: 'patient-profile-id',
        assessmentId: 'assessment-id',
        riskLevel: 'moderate',
        systemRiskLevel: 'moderate',
        isCurrent: true,
      }),
    });
    expect(prisma.aiAnalysisRecord.create).toHaveBeenCalledWith({
      data: objectContaining({
        patientId: 'patient-profile-id',
        assessmentId: 'assessment-id',
        analysisScene: 'assessment_summary',
        modelVersion: 'spark-manual-v1',
        confidence: 0.84,
        inputSummary: assessmentDto.rawInputSummary,
        outputSummary: objectContaining({
          riskLevel: 'moderate',
          transcript: assessmentDto.rawInputSummary.transcript,
          analysisSummary: assessmentDto.rawInputSummary.analysisSummary,
        }),
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'assessment.create',
        targetType: 'assessment_record',
        targetId: 'assessment-id',
        result: 'success',
      }),
    });
  });
});

describe('AppService game content Unity build management', () => {
  function createService() {
    const prisma = {
      gameContent: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  const gameContent = {
    id: 'game-id',
    code: 'rhythm_saber',
    name: '节奏光剑',
    runtimeType: 'unity_webgl',
    manifestUrl: null,
    buildBaseUrl: null,
    gameVersion: null,
    bridgeProtocolVersion: '1.0.0',
    buildStatus: 'pending_assets',
    releaseChannel: 'development',
    supportsCamera: true,
    supportsMicrophone: false,
    supportedInputModes: ['camera_pose'],
    requiredMetrics: [],
    status: 'active',
  };

  it('allows operator admins to create active game content that still waits for Unity assets', async () => {
    const { prisma, service } = createService();
    prisma.gameContent.findUnique.mockResolvedValue(null);
    prisma.gameContent.create.mockResolvedValue({
      ...gameContent,
      id: 'new-game-id',
      code: 'balance_steps',
      name: '平衡步态训练',
      trainingTargets: ['平衡能力', '下肢协调'],
      tags: ['低强度', '反应'],
    });

    await expect(
      service.createGameContent(operatorAdminUser, {
        code: ' balance_steps ',
        name: ' 平衡步态训练 ',
        runtimeType: 'unity_webgl',
        trainingTargets: ['平衡能力', '下肢协调'],
        tags: ['低强度', '反应'],
        defaultDuration: 12,
        defaultDifficulty: 'low',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'step_accuracy', unit: 'ratio' }],
      }),
    ).resolves.toMatchObject({
      id: 'new-game-id',
      code: 'balance_steps',
      buildStatus: 'pending_assets',
      status: 'active',
    });

    expect(prisma.gameContent.create).toHaveBeenCalledWith({
      data: objectContaining({
        code: 'balance_steps',
        name: '平衡步态训练',
        trainingTargets: ['平衡能力', '下肢协调'],
        tags: ['低强度', '反应'],
        defaultDuration: 12,
        defaultDifficulty: 'low',
        runtimeType: 'unity_webgl',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        buildStatus: 'pending_assets',
        releaseChannel: 'development',
        bridgeProtocolVersion: '1.0.0',
        status: 'active',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'operator-user-id',
        actorRole: 'admin_operator',
        action: 'game_content.create',
        targetType: 'game_content',
        targetId: 'new-game-id',
        result: 'success',
      }),
    });
  });

  it('allows publisher admins to create released browser pose game content without Unity assets', async () => {
    const { prisma, service } = createService();
    prisma.gameContent.findUnique.mockResolvedValue(null);
    prisma.gameContent.create.mockResolvedValue({
      ...gameContent,
      id: 'browser-game-id',
      code: 'pose_reaction_hit',
      name: '上肢反应触达',
      trainingTargets: ['反应速度', '上肢协调'],
      tags: ['中低强度', '动作准确率'],
      runtimeType: 'browser_pose_game',
      manifestUrl: null,
      buildBaseUrl: null,
      gameVersion: '1.0.0',
      buildStatus: 'released',
      releaseChannel: 'production',
      requiredMetrics: [
        { metricType: 'reaction_time_ms', unit: 'ms' },
        { metricType: 'target_hit_rate', unit: 'ratio' },
        { metricType: 'pose_visibility_avg', unit: 'ratio' },
        { metricType: 'arm_raise_accuracy', unit: 'ratio' },
      ],
    });

    await expect(
      service.createGameContent(adminUser, {
        code: 'pose_reaction_hit',
        name: '上肢反应触达',
        runtimeType: 'browser_pose_game',
        gameVersion: '1.0.0',
        trainingTargets: ['反应速度', '上肢协调'],
        tags: ['中低强度', '动作准确率'],
        defaultDuration: 8,
        defaultDifficulty: '基础',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [
          { metricType: 'reaction_time_ms', unit: 'ms' },
          { metricType: 'target_hit_rate', unit: 'ratio' },
          { metricType: 'pose_visibility_avg', unit: 'ratio' },
          { metricType: 'arm_raise_accuracy', unit: 'ratio' },
        ],
      }),
    ).resolves.toMatchObject({
      id: 'browser-game-id',
      runtimeType: 'browser_pose_game',
      buildStatus: 'released',
      releaseChannel: 'production',
      gameVersion: '1.0.0',
    });

    expect(prisma.gameContent.create).toHaveBeenCalledWith({
      data: objectContaining({
        code: 'pose_reaction_hit',
        runtimeType: 'browser_pose_game',
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: '1.0.0',
        buildStatus: 'released',
        releaseChannel: 'production',
        supportsCamera: true,
        supportedInputModes: ['camera_pose'],
        bridgeProtocolVersion: '1.0.0',
        status: 'active',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'admin-user-id',
        actorRole: 'admin',
        action: 'game_content.publish_browser_pose',
        targetType: 'game_content',
        targetId: 'browser-game-id',
        result: 'success',
      }),
    });
  });

  it('rejects operator admins from publishing browser pose game content', async () => {
    const { prisma, service } = createService();

    await expect(
      service.createGameContent(operatorAdminUser, {
        code: 'pose_reaction_hit',
        name: '上肢反应触达',
        runtimeType: 'browser_pose_game',
        gameVersion: '1.0.0',
        trainingTargets: ['反应速度'],
        tags: ['中低强度'],
        defaultDuration: 8,
        defaultDifficulty: '基础',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [
          { metricType: 'reaction_time_ms', unit: 'ms' },
          { metricType: 'target_hit_rate', unit: 'ratio' },
          { metricType: 'pose_visibility_avg', unit: 'ratio' },
          { metricType: 'arm_raise_accuracy', unit: 'ratio' },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.gameContent.findUnique).not.toHaveBeenCalled();
    expect(prisma.gameContent.create).not.toHaveBeenCalled();
  });

  it('rejects browser pose game content without required formal metrics', async () => {
    const { prisma, service } = createService();

    await expect(
      service.createGameContent(adminUser, {
        code: 'pose_reaction_hit',
        name: '上肢反应触达',
        runtimeType: 'browser_pose_game',
        gameVersion: '1.0.0',
        trainingTargets: ['反应速度'],
        tags: ['中低强度'],
        defaultDuration: 8,
        defaultDifficulty: '基础',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'reaction_time_ms', unit: 'ms' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.gameContent.findUnique).not.toHaveBeenCalled();
    expect(prisma.gameContent.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate game content codes before creation', async () => {
    const { prisma, service } = createService();
    prisma.gameContent.findUnique.mockResolvedValue({
      id: 'existing-game-id',
    });

    await expect(
      service.createGameContent(operatorAdminUser, {
        code: 'rhythm_saber',
        name: '节奏光剑',
        runtimeType: 'unity_webgl',
        trainingTargets: ['反应速度'],
        tags: ['中低强度'],
        defaultDuration: 12,
        defaultDifficulty: 'moderate',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'hit_accuracy', unit: 'ratio' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.gameContent.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'invalid code',
      {
        code: 'Balance Steps',
        name: '平衡步态训练',
        runtimeType: 'unity_webgl',
        trainingTargets: ['平衡能力'],
        tags: ['低强度'],
        defaultDuration: 12,
        defaultDifficulty: 'low',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'step_accuracy', unit: 'ratio' }],
      },
    ],
    [
      'empty name',
      {
        code: 'balance_steps',
        name: '',
        runtimeType: 'unity_webgl',
        trainingTargets: ['平衡能力'],
        tags: ['低强度'],
        defaultDuration: 12,
        defaultDifficulty: 'low',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'step_accuracy', unit: 'ratio' }],
      },
    ],
    [
      'empty training targets',
      {
        code: 'balance_steps',
        name: '平衡步态训练',
        runtimeType: 'unity_webgl',
        trainingTargets: [],
        tags: ['低强度'],
        defaultDuration: 12,
        defaultDifficulty: 'low',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'step_accuracy', unit: 'ratio' }],
      },
    ],
    [
      'invalid default duration',
      {
        code: 'balance_steps',
        name: '平衡步态训练',
        runtimeType: 'unity_webgl',
        trainingTargets: ['平衡能力'],
        tags: ['低强度'],
        defaultDuration: 0,
        defaultDifficulty: 'low',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'step_accuracy', unit: 'ratio' }],
      },
    ],
    [
      'missing supported input modes',
      {
        code: 'balance_steps',
        name: '平衡步态训练',
        runtimeType: 'unity_webgl',
        trainingTargets: ['平衡能力'],
        tags: ['低强度'],
        defaultDuration: 12,
        defaultDifficulty: 'low',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: [],
        requiredMetrics: [{ metricType: 'step_accuracy', unit: 'ratio' }],
      },
    ],
  ])('rejects game content creation with %s', async (_label, dto) => {
    const { prisma, service } = createService();

    await expect(
      service.createGameContent(operatorAdminUser, dto),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.gameContent.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ['auditor', auditorAdminUser],
    ['doctor', doctorUser],
    ['patient', patientUser],
    ['caregiver', caregiverUser],
  ])('rejects %s from creating game content', async (_label, user) => {
    const { prisma, service } = createService();

    await expect(
      service.createGameContent(user, {
        code: 'balance_steps',
        name: '平衡步态训练',
        runtimeType: 'unity_webgl',
        trainingTargets: ['平衡能力'],
        tags: ['低强度'],
        defaultDuration: 12,
        defaultDifficulty: 'low',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'step_accuracy', unit: 'ratio' }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.gameContent.create).not.toHaveBeenCalled();
  });

  it('allows operator admins to disable and enable game content without changing Unity build config', async () => {
    const { prisma, service } = createService();
    const releasedGame = {
      ...gameContent,
      manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
      buildBaseUrl: '/unity/rhythm_saber/1.0.0',
      gameVersion: '1.0.0',
      buildStatus: 'released',
      releaseChannel: 'production',
    };
    prisma.gameContent.findUnique.mockResolvedValueOnce(releasedGame);
    prisma.gameContent.update.mockResolvedValueOnce({
      ...releasedGame,
      status: 'inactive',
    });

    await expect(
      service.updateGameContentStatus(operatorAdminUser, 'game-id', {
        status: 'inactive',
      }),
    ).resolves.toMatchObject({
      id: 'game-id',
      status: 'inactive',
      buildStatus: 'released',
      gameVersion: '1.0.0',
    });

    expect(prisma.gameContent.update).toHaveBeenCalledWith({
      where: { id: 'game-id' },
      data: { status: 'inactive' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'operator-user-id',
        action: 'game_content.disable',
        targetType: 'game_content',
        targetId: 'game-id',
        result: 'success',
      }),
    });

    prisma.gameContent.findUnique.mockResolvedValueOnce({
      ...releasedGame,
      status: 'inactive',
    });
    prisma.gameContent.update.mockResolvedValueOnce(releasedGame);

    await expect(
      service.updateGameContentStatus(operatorAdminUser, 'game-id', {
        status: 'active',
      }),
    ).resolves.toMatchObject({
      id: 'game-id',
      status: 'active',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        action: 'game_content.enable',
        targetType: 'game_content',
        targetId: 'game-id',
        result: 'success',
      }),
    });
  });

  it('rejects auditors from updating game content status', async () => {
    const { prisma, service } = createService();

    await expect(
      service.updateGameContentStatus(auditorAdminUser, 'game-id', {
        status: 'inactive',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.gameContent.findUnique).not.toHaveBeenCalled();
    expect(prisma.gameContent.update).not.toHaveBeenCalled();
  });

  it('allows operator admins to save non-released Unity build config', async () => {
    const { prisma, service } = createService();
    prisma.gameContent.findUnique.mockResolvedValue(gameContent);
    prisma.gameContent.update.mockResolvedValue({
      ...gameContent,
      buildStatus: 'validating',
      manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
      buildBaseUrl: '/unity/rhythm_saber/1.0.0',
      gameVersion: '1.0.0',
      releaseChannel: 'staging',
      requiredMetrics: [{ metricType: 'arm_raise_accuracy', unit: 'ratio' }],
    });

    await expect(
      service.updateUnityBuildConfig(operatorAdminUser, 'game-id', {
        manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
        buildBaseUrl: '/unity/rhythm_saber/1.0.0',
        gameVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        buildStatus: 'validating',
        releaseChannel: 'staging',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'arm_raise_accuracy', unit: 'ratio' }],
      }),
    ).resolves.toMatchObject({
      id: 'game-id',
      buildStatus: 'validating',
    });

    expect(prisma.gameContent.update).toHaveBeenCalledWith({
      where: { id: 'game-id' },
      data: objectContaining({
        buildStatus: 'validating',
        releaseChannel: 'staging',
        manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'operator-user-id',
        actorRole: 'admin_operator',
        action: 'game_content.update_unity_build',
        targetType: 'game_content',
        targetId: 'game-id',
        result: 'success',
      }),
    });
  });

  it('rejects operator admins from publishing released builds', async () => {
    const { prisma, service } = createService();
    prisma.gameContent.findUnique.mockResolvedValue(gameContent);

    await expect(
      service.updateUnityBuildConfig(operatorAdminUser, 'game-id', {
        manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
        buildBaseUrl: '/unity/rhythm_saber/1.0.0',
        gameVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        buildStatus: 'released',
        releaseChannel: 'production',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'arm_raise_accuracy', unit: 'ratio' }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.gameContent.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('allows super admins to publish valid Unity build config', async () => {
    const { prisma, service } = createService();
    prisma.gameContent.findUnique.mockResolvedValue(gameContent);
    prisma.gameContent.update.mockResolvedValue({
      ...gameContent,
      manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
      buildBaseUrl: '/unity/rhythm_saber/1.0.0',
      gameVersion: '1.0.0',
      buildStatus: 'released',
      releaseChannel: 'production',
      requiredMetrics: [{ metricType: 'arm_raise_accuracy', unit: 'ratio' }],
    });

    await expect(
      service.updateUnityBuildConfig(superAdminUser, 'game-id', {
        manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
        buildBaseUrl: '/unity/rhythm_saber/1.0.0',
        gameVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        buildStatus: 'released',
        releaseChannel: 'production',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [{ metricType: 'arm_raise_accuracy', unit: 'ratio' }],
      }),
    ).resolves.toMatchObject({
      buildStatus: 'released',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'super-admin-user-id',
        actorRole: 'admin_super',
        action: 'game_content.publish_unity_build',
        targetType: 'game_content',
        targetId: 'game-id',
        result: 'success',
      }),
    });
  });

  it('rejects released builds without required metrics', async () => {
    const { prisma, service } = createService();
    prisma.gameContent.findUnique.mockResolvedValue(gameContent);

    await expect(
      service.updateUnityBuildConfig(superAdminUser, 'game-id', {
        manifestUrl: '/unity/rhythm_saber/1.0.0/manifest.json',
        buildBaseUrl: '/unity/rhythm_saber/1.0.0',
        gameVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        buildStatus: 'released',
        releaseChannel: 'production',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.gameContent.update).not.toHaveBeenCalled();
  });

  it('rejects auditors from updating Unity build config', async () => {
    const { prisma, service } = createService();

    await expect(
      service.updateUnityBuildConfig(auditorAdminUser, 'game-id', {
        buildStatus: 'validating',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.gameContent.findUnique).not.toHaveBeenCalled();
    expect(prisma.gameContent.update).not.toHaveBeenCalled();
  });
});

describe('AppService consent revocation', () => {
  type ConsentRecordMock = {
    id: string;
    patientId: string;
    subjectUserId: string;
    consentType: string;
    consentVersion: string;
    status: string;
    revokedAt: Date | null;
  };

  type PatientProfileMock = { id: string; userId: string };
  type ConsentRecordFindUniqueMock = jest.Mock<
    Promise<ConsentRecordMock | null>,
    []
  >;
  type ConsentRecordUpdateManyMock = jest.Mock<Promise<{ count: number }>, []>;
  type PatientProfileFindUniqueMock = jest.Mock<
    Promise<PatientProfileMock | null>,
    []
  >;
  type AuditLogCreateMock = jest.Mock<Promise<unknown>, []>;

  type ConsentRevocationPrismaMock = {
    consentRecord: {
      findUnique: ConsentRecordFindUniqueMock;
      updateMany: ConsentRecordUpdateManyMock;
    };
    patientProfile: {
      findUnique: PatientProfileFindUniqueMock;
    };
    auditLog: {
      create: AuditLogCreateMock;
    };
    $transaction: jest.Mock<
      Promise<unknown>,
      [
        (
          tx: Pick<ConsentRevocationPrismaMock, 'consentRecord'>,
        ) => Promise<unknown>,
      ]
    >;
  };

  function createService() {
    const consentRecord = {
      findUnique: jest.fn<Promise<ConsentRecordMock | null>, []>(() =>
        Promise.resolve(null),
      ),
      updateMany: jest.fn<Promise<{ count: number }>, []>(() =>
        Promise.resolve({ count: 0 }),
      ),
    };
    const prisma: ConsentRevocationPrismaMock = {
      consentRecord: {
        findUnique: consentRecord.findUnique,
        updateMany: consentRecord.updateMany,
      },
      patientProfile: {
        findUnique: jest.fn<Promise<PatientProfileMock | null>, []>(() =>
          Promise.resolve(null),
        ),
      },
      auditLog: {
        create: jest.fn<Promise<unknown>, []>(() => Promise.resolve({})),
      },
      $transaction: jest.fn(
        async (
          callback: (
            tx: Pick<ConsentRevocationPrismaMock, 'consentRecord'>,
          ) => Promise<unknown>,
        ) => callback({ consentRecord }),
      ),
    };

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  it('allows patient self to revoke current granted consent and audits the action', async () => {
    const { prisma, service } = createService();
    const consent = {
      id: 'consent-id',
      patientId: 'patient-profile-id',
      subjectUserId: 'patient-user-id',
      consentType: 'ai_processing',
      consentVersion: 'v1.2',
      status: 'granted',
      revokedAt: null,
    };
    const revoked = {
      ...consent,
      status: 'revoked',
      revokedAt: new Date('2026-05-14T08:30:00.000Z'),
    };
    prisma.consentRecord.findUnique
      .mockResolvedValueOnce(consent)
      .mockResolvedValueOnce(revoked);
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      userId: 'patient-user-id',
    });
    prisma.consentRecord.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.revokeConsent(patientUser, 'consent-id'),
    ).resolves.toEqual(revoked);

    expect(prisma.consentRecord.updateMany).toHaveBeenCalledWith({
      where: {
        patientId: 'patient-profile-id',
        subjectUserId: 'patient-user-id',
        consentType: 'ai_processing',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      },
      data: {
        status: 'revoked',
        revokedAt: expect.any(Date) as Date,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'patient-user-id',
        actorRole: 'patient',
        action: 'consent.revoke',
        targetType: 'consent_record',
        targetId: 'consent-id',
        result: 'success',
        metadata: {
          patientId: 'patient-profile-id',
          consentType: 'ai_processing',
        },
      },
    });
  });

  it('rejects doctor consent revocation', async () => {
    const { prisma, service } = createService();
    prisma.consentRecord.findUnique.mockResolvedValue({
      id: 'consent-id',
      patientId: 'patient-profile-id',
      subjectUserId: 'patient-user-id',
      consentType: 'camera_capture',
      consentVersion: 'v1.2',
      status: 'granted',
      revokedAt: null,
    });
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      userId: 'patient-user-id',
    });

    await expect(
      service.revokeConsent(doctorUser, 'consent-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.consentRecord.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate consent revocation before writing audit', async () => {
    const { prisma, service } = createService();
    prisma.consentRecord.findUnique.mockResolvedValue({
      id: 'consent-id',
      patientId: 'patient-profile-id',
      subjectUserId: 'patient-user-id',
      consentType: 'caregiver_sharing',
      consentVersion: 'v1.2',
      status: 'revoked',
      revokedAt: new Date('2026-05-14T08:30:00.000Z'),
    });

    await expect(
      service.revokeConsent(patientUser, 'consent-id'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.patientProfile.findUnique).not.toHaveBeenCalled();
    expect(prisma.consentRecord.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('AppService audit log query', () => {
  function createService() {
    const prisma = {
      auditLog: {
        findMany: jest.fn(),
      },
    };

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  it('allows admin to query audit logs with service-side filters', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T09:00:00.000Z');
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'audit-log-id',
        actorRole: 'caregiver',
        action: 'access.denied',
        targetType: 'patient_profile',
        targetId: 'patient-profile-id',
        result: 'denied',
        createdAt,
        actor: {
          displayName: '李明',
          account: 'caregiver001',
        },
      },
    ]);

    await expect(
      service.auditLogs(adminUser, {
        result: 'denied',
        actorRole: 'caregiver',
        actorUserId: 'caregiver-user-id',
        action: 'access.denied',
        targetType: 'patient_profile',
        targetId: 'patient-profile-id',
        actorAccount: 'caregiver',
        dateFrom: '2026-05-14T00:00:00.000Z',
        dateTo: '2026-05-15T00:00:00.000Z',
        limit: '25',
      }),
    ).resolves.toHaveLength(1);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        result: 'denied',
        actorRole: 'caregiver',
        actorUserId: 'caregiver-user-id',
        action: 'access.denied',
        targetType: 'patient_profile',
        targetId: 'patient-profile-id',
        actor: {
          account: { contains: 'caregiver', mode: 'insensitive' },
        },
        createdAt: {
          gte: new Date('2026-05-14T00:00:00.000Z'),
          lte: new Date('2026-05-15T00:00:00.000Z'),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { actor: { select: { displayName: true, account: true } } },
    });
  });

  it('enforces audit log access for split admin roles', async () => {
    const { prisma, service } = createService();
    prisma.auditLog.findMany.mockResolvedValue([]);

    await expect(service.auditLogs(superAdminUser)).resolves.toEqual([]);
    await expect(service.auditLogs(auditorAdminUser)).resolves.toEqual([]);
    await expect(service.auditLogs(operatorAdminUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(2);
  });

  it('rejects non-admin audit log queries', async () => {
    const { prisma, service } = createService();

    await expect(service.auditLogs(doctorUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid result', { result: 'blocked' }],
    ['invalid role', { actorRole: 'operator' }],
    ['invalid date', { dateFrom: 'not-a-date' }],
    ['invalid limit', { limit: '201' }],
  ])('rejects %s before querying', async (_label, query) => {
    const { prisma, service } = createService();

    await expect(service.auditLogs(adminUser, query)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });
});

describe('AppService desensitized data export', () => {
  function createService() {
    const prisma = {
      patientProfile: {
        findMany: jest.fn(),
      },
      assessmentRecord: {
        findMany: jest.fn(),
      },
      trainingSession: {
        findMany: jest.fn(),
      },
      consentRecord: {
        findMany: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };

    return {
      prisma,
      service: new AppService(prisma as unknown as PrismaService),
    };
  }

  it('exports patient rows with masked identity fields and writes audit log', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T09:00:00.000Z');
    prisma.patientProfile.findMany.mockResolvedValue([
      {
        id: 'patient-profile-id',
        name: '李秀兰',
        gender: 'female',
        age: 72,
        mobilePhone: '13800006721',
        caregiverName: '李明',
        caregiverPhone: '13900008206',
        status: 'active',
        healthMetrics: { bloodPressure: '132/82' },
        createdAt,
        responsibleDoctor: {
          user: { displayName: '王医生' },
        },
        riskGrades: [{ riskLevel: 'moderate' }],
      },
    ]);

    const exported = await service.exportDataset(adminUser, 'patients', {
      format: 'json',
      reason: '月度运营统计',
      limit: '20',
    });

    expect(exported.payload.rows).toEqual([
      {
        patientExportId: expect.stringMatching(
          /^patient_[a-f0-9]{12}$/,
        ) as string,
        maskedName: '李*',
        gender: 'female',
        age: 72,
        maskedMobilePhone: '138****6721',
        maskedCaregiverName: '李*',
        maskedCaregiverPhone: '139****8206',
        responsibleDoctor: '王医生',
        currentRiskLevel: 'moderate',
        status: 'active',
        createdAt: createdAt.toISOString(),
      },
    ]);
    expect(JSON.stringify(exported.payload)).not.toContain('13800006721');
    expect(JSON.stringify(exported.payload)).not.toContain('13900008206');
    expect(JSON.stringify(exported.payload)).not.toContain('bloodPressure');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-user-id',
        actorRole: 'admin',
        action: 'data.export',
        targetType: 'data_export',
        targetId: 'patients',
        result: 'success',
        metadata: {
          format: 'json',
          filters: {
            dateFrom: null,
            dateTo: null,
            patientFilterApplied: false,
            patientExportId: null,
            riskLevel: null,
            qualityFlag: null,
            limit: 20,
          },
          rowCount: 1,
          columns: [
            'patientExportId',
            'maskedName',
            'gender',
            'age',
            'maskedMobilePhone',
            'maskedCaregiverName',
            'maskedCaregiverPhone',
            'responsibleDoctor',
            'currentRiskLevel',
            'status',
            'createdAt',
          ],
          desensitized: true,
          reasonProvided: true,
          reasonLength: '月度运营统计'.length,
          reasonHash: createHash('sha256')
            .update('月度运营统计')
            .digest('hex')
            .slice(0, 16),
        },
      },
    });
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      '月度运营统计',
    );
  });

  it('exports assessment rows without raw transcripts or AI raw summaries', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T09:00:00.000Z');
    prisma.assessmentRecord.findMany.mockResolvedValue([
      {
        id: 'assessment-id',
        patientId: 'patient-profile-id',
        assessmentType: 'MMSE/CDR',
        scoreSummary: {
          mmse: 20,
          cdr: 1,
          memory: 48,
          orientation: 58,
          executive: 52,
          language: 73,
        },
        rawInputSummary: {
          transcript: '今天是星期一。苹果、桌子、硬币。',
          analysisSummary: '原始分析摘要',
        },
        createdAt,
        patient: { id: 'patient-profile-id', name: '李秀兰' },
        riskGrades: [{ riskLevel: 'moderate' }],
        aiAnalyses: [
          {
            confidence: 0.84,
            inputSummary: { transcript: '敏感转写' },
            outputSummary: { analysisSummary: '敏感摘要' },
          },
        ],
      },
    ]);

    const exported = await service.exportDataset(adminUser, 'assessments', {
      format: 'json',
      reason: '科研统计',
    });

    expect(exported.payload.rows[0]).toMatchObject({
      assessmentExportId: expect.stringMatching(
        /^assessment_[a-f0-9]{12}$/,
      ) as string,
      maskedPatientName: '李*',
      mmse: 20,
      cdr: 1,
      riskLevel: 'moderate',
      aiConfidence: 0.84,
    });
    expect(JSON.stringify(exported.payload)).not.toContain('今天是星期一');
    expect(JSON.stringify(exported.payload)).not.toContain('敏感转写');
    expect(JSON.stringify(exported.payload)).not.toContain('敏感摘要');
  });

  it('escapes CSV formula-like cells before download', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T09:00:00.000Z');
    prisma.patientProfile.findMany.mockResolvedValue([
      {
        id: 'patient-profile-id',
        name: '=HYPERLINK("http://bad.example")',
        gender: '+female',
        age: 72,
        mobilePhone: '13800006721',
        caregiverName: '-caregiver',
        caregiverPhone: '13900008206',
        status: '@active',
        healthMetrics: {},
        createdAt,
        responsibleDoctor: null,
        riskGrades: [],
      },
    ]);

    const exported = await service.exportDataset(adminUser, 'patients', {
      format: 'csv',
      reason: '安全导出测试',
    });

    expect(exported.content).toContain("'=*");
    expect(exported.content).toContain("'+female");
    expect(exported.content).toContain("'-*");
    expect(exported.content).toContain("'@active");
  });

  it('exports training records without raw metric payloads', async () => {
    const { prisma, service } = createService();
    const startedAt = new Date('2026-05-14T09:00:00.000Z');
    prisma.trainingSession.findMany.mockResolvedValue([
      {
        id: 'session-id',
        patientId: 'patient-profile-id',
        sessionStatus: 'completed',
        syncStatus: 'synced',
        startedAt,
        patient: { id: 'patient-profile-id', name: '李秀兰' },
        gameContent: { name: '节奏光剑' },
        motionMetrics: [{ rawSummary: { joints: [1, 2, 3] } }],
        result: {
          score: 92,
          completionRate: 0.96,
          durationSeconds: 480,
          reactionTimeMs: 820,
          motionAccuracy: 0.91,
          exerciseIntensity: 'moderate',
          abnormalFlag: false,
          qualityFlag: 'valid',
          metricsSummary: { rawDevicePayload: 'sensitive' },
        },
      },
    ]);

    const exported = await service.exportDataset(
      adminUser,
      'training-records',
      {
        format: 'csv',
        reason: '训练质量复盘',
        qualityFlag: 'valid',
      },
    );

    expect(exported.content).toContain('节奏光剑');
    expect(exported.content).toContain('92');
    expect(exported.content).not.toContain('session-id');
    expect(exported.content).not.toContain('patient-profile-id');
    expect(exported.content).not.toContain('rawDevicePayload');
    expect(exported.content).not.toContain('joints');
    expect(prisma.trainingSession.findMany).toHaveBeenCalledWith({
      where: { result: { qualityFlag: 'valid' } },
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: {
        patient: { select: { id: true, name: true } },
        gameContent: { select: { name: true } },
        result: true,
      },
    });
  });

  it('audits denied and invalid export requests before querying without raw reason or patient id', async () => {
    const { prisma, service } = createService();
    const reason = '统计';
    const reasonHash = createHash('sha256')
      .update(reason)
      .digest('hex')
      .slice(0, 16);

    await expect(
      service.exportDataset(doctorUser, 'patients', { reason }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.exportDataset(adminUser, 'unknown', { reason }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.exportDataset(adminUser, 'patients', { reason: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.exportDataset(adminUser, 'patients', {
        reason,
        format: 'xlsx',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.exportDataset(adminUser, 'patients', {
        reason,
        patientId: 'patient-profile-id',
        limit: '501',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.patientProfile.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(5);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'data.export',
        targetType: 'data_export',
        targetId: 'patients',
        result: 'denied',
        metadata: objectContaining({
          requestedDatasetKnown: true,
          reasonHash,
          stage: 'authorization',
          desensitized: true,
        }),
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'admin-user-id',
        actorRole: 'admin',
        action: 'data.export',
        targetType: 'data_export',
        targetId: 'invalid_dataset',
        result: 'failed',
        metadata: objectContaining({
          requestedDatasetKnown: false,
          reasonHash,
          stage: 'validation',
          errorType: 'BadRequestException',
          desensitized: true,
        }),
      }),
    });
    const auditCalls = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(auditCalls).not.toContain(reason);
    expect(auditCalls).not.toContain('patient-profile-id');
  });

  it('exports consents without evidence snapshots and audit logs without raw target IDs', async () => {
    const { prisma, service } = createService();
    const grantedAt = new Date('2026-05-14T09:00:00.000Z');
    const createdAt = new Date('2026-05-14T10:00:00.000Z');
    prisma.consentRecord.findMany.mockResolvedValue([
      {
        id: 'consent-id',
        patientId: 'patient-profile-id',
        consentType: 'camera_capture',
        consentVersion: 'v1.2',
        status: 'granted',
        grantedAt,
        revokedAt: null,
        evidenceSnapshot: { ipAddress: '127.0.0.1' },
        patient: { name: '李秀兰' },
      },
    ]);
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'audit-id',
        actorRole: 'admin',
        action: 'patient.view',
        targetType: 'patient_profile',
        targetId: 'patient-profile-id',
        result: 'success',
        createdAt,
        metadata: { patientName: '李秀兰' },
        actor: { account: 'admin_exporter' },
      },
    ]);

    const consentExport = await service.exportDataset(adminUser, 'consents', {
      format: 'json',
      reason: '授权统计',
    });
    const auditExport = await service.exportDataset(adminUser, 'audit-logs', {
      format: 'json',
      reason: '审计复盘',
    });

    expect(consentExport.payload.rows[0]).toMatchObject({
      consentExportId: expect.stringMatching(
        /^consent_[a-f0-9]{12}$/,
      ) as string,
      patientExportId: expect.stringMatching(
        /^patient_[a-f0-9]{12}$/,
      ) as string,
      maskedPatientName: '李*',
      consentType: 'camera_capture',
    });
    expect(auditExport.payload.rows[0]).toMatchObject({
      auditLogExportId: expect.stringMatching(/^audit_[a-f0-9]{12}$/) as string,
      maskedActorAccount: 'adm***er',
      targetExportId: expect.stringMatching(
        /^patient_profile_[a-f0-9]{12}$/,
      ) as string,
    });
    expect(JSON.stringify(consentExport.payload)).not.toContain('127.0.0.1');
    expect(JSON.stringify(auditExport.payload)).not.toContain(
      'patient-profile-id',
    );
    expect(JSON.stringify(auditExport.payload)).not.toContain('李秀兰');
  });

  it('allows operator exports and audits denied auditor exports', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findMany.mockResolvedValue([]);

    await expect(
      service.exportDataset(operatorAdminUser, 'patients', {
        format: 'json',
        reason: '运营统计',
      }),
    ).resolves.toMatchObject({
      payload: {
        dataset: 'patients',
        rowCount: 0,
      },
    });

    await expect(
      service.exportDataset(auditorAdminUser, 'patients', {
        format: 'json',
        reason: '审计尝试导出',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'operator-user-id',
        actorRole: 'admin_operator',
        action: 'data.export',
        targetType: 'data_export',
        targetId: 'patients',
        result: 'success',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'auditor-user-id',
        actorRole: 'admin_auditor',
        action: 'data.export',
        targetType: 'data_export',
        targetId: 'patients',
        result: 'denied',
      }),
    });
    const auditCalls = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(auditCalls).not.toContain('运营统计');
    expect(auditCalls).not.toContain('审计尝试导出');
  });
});
