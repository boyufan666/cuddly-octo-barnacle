import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { AppService } from './app.service';
import { SENSITIVE_ENCRYPTION_KEY } from './config';
import { hashCredential } from './credential-security';
import { PrismaService } from './prisma.service';
import type { RequestUser } from './current-user';
import {
  createPhoneLookupHmac,
  decryptSensitiveJson,
  encryptSensitiveJson,
  type SensitiveEncryptionKey,
} from './sensitive-encryption';
import { DEFAULT_PROVIDER_TIMEOUT_MS } from './provider-request';
import {
  ProviderResponseRejectedException,
  ProviderUnavailableException,
} from './provider-outcome';

type SubmitTrainingResultLike = {
  score: number;
  completionRate: number;
  durationSeconds: number;
  reactionTimeMs: number;
  motionAccuracy: number;
  exerciseIntensity: string;
  metricsSummary?: Prisma.InputJsonValue;
  motionMetrics: Array<{
    metricType: string;
    metricValue: number;
    confidence?: number;
    unit?: string;
    sampleCount?: number;
    windowStartedAt?: string;
    windowEndedAt?: string;
    qualityFlag?: string;
    bodyPart?: string;
    jointName?: string;
    rawSummary?: Prisma.InputJsonValue;
  }>;
};

function objectContaining<T extends object>(value: T): unknown {
  return expect.objectContaining(value);
}

function arrayContaining<T>(value: T[]): unknown {
  return expect.arrayContaining(value);
}

function anyValue(value: unknown): unknown {
  return expect.any(value);
}

function stringMatching(value: RegExp): unknown {
  return expect.stringMatching(value);
}

type MockWithCalls = {
  mock: { calls: unknown[][] };
};

function mockArg<T>(mock: MockWithCalls, callIndex = 0, argumentIndex = 0): T {
  const call = mock.mock.calls[callIndex];
  if (!call) {
    throw new Error(`Expected mock call at index ${callIndex}.`);
  }
  return call[argumentIndex] as T;
}

function mockCalls(mock: MockWithCalls): unknown[][] {
  return mock.mock.calls;
}

function mockArgs<T>(mock: MockWithCalls, argumentIndex = 0): T[] {
  return mock.mock.calls.map((call) => call[argumentIndex] as T);
}

function mockRequestBody(mock: MockWithCalls): string {
  const body = mockArg<RequestInit>(mock, 0, 1).body;
  if (typeof body !== 'string') {
    throw new Error('Expected the mocked request body to be a string.');
  }
  return body;
}

function userP2002(meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('User P2002', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta,
  });
}

function providerJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const testSensitiveEncryptionKey: SensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-sensitive-key',
  key: Buffer.alloc(32, 11),
};

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

describe('AppService sensitive encryption key injection', () => {
  it('fails construction when the sensitive encryption key provider is absent', async () => {
    await expect(
      Test.createTestingModule({
        providers: [AppService, { provide: PrismaService, useValue: {} }],
      }).compile(),
    ).rejects.toThrow(/SENSITIVE_ENCRYPTION_KEY/);
  });

  it('receives exactly one explicit key without reading environment variables', async () => {
    const originalKey = process.env.SENSITIVE_DATA_KEY;
    const originalKeyRef = process.env.SENSITIVE_DATA_KEY_REF;
    delete process.env.SENSITIVE_DATA_KEY;
    delete process.env.SENSITIVE_DATA_KEY_REF;

    try {
      const module = await Test.createTestingModule({
        providers: [
          AppService,
          { provide: PrismaService, useValue: {} },
          {
            provide: SENSITIVE_ENCRYPTION_KEY,
            useValue: testSensitiveEncryptionKey,
          },
        ],
      }).compile();
      const service = module.get(AppService);

      expect(
        Object.values(service).filter(
          (value) => value === testSensitiveEncryptionKey,
        ),
      ).toHaveLength(1);
    } finally {
      if (originalKey === undefined) delete process.env.SENSITIVE_DATA_KEY;
      else process.env.SENSITIVE_DATA_KEY = originalKey;
      if (originalKeyRef === undefined)
        delete process.env.SENSITIVE_DATA_KEY_REF;
      else process.env.SENSITIVE_DATA_KEY_REF = originalKeyRef;
    }
  });
});

const registrationRequestFixtureId = '67e55044-10b1-426f-9247-bb680e5fe0c8';

function encryptedUserIdentity(
  recordId: string,
  identity: { displayName: string; mobilePhone: string | null },
) {
  return encryptSensitiveJson(
    identity,
    { tableName: 'user', recordId, fieldName: 'identityEnvelope' },
    testSensitiveEncryptionKey,
  );
}

function encryptedPatientField(
  recordId: string,
  fieldName: 'identityEnvelope' | 'contactEnvelope' | 'careDetailsEnvelope',
  value: Record<string, unknown>,
) {
  return encryptSensitiveJson(
    value,
    { tableName: 'patient_profile', recordId, fieldName },
    testSensitiveEncryptionKey,
  );
}

function encryptedPatientProfileFixture(
  recordId: string,
  values: {
    name?: string;
    gender?: string;
    age?: number;
    mobilePhone?: string | null;
    caregiverName?: string | null;
    caregiverPhone?: string | null;
    healthMetrics?: Record<string, unknown>;
    status?: string;
    responsibleDoctorId?: string | null;
  } = {},
) {
  return {
    id: recordId,
    userId: 'patient-user-id',
    responsibleDoctorId: values.responsibleDoctorId ?? 'doctor-profile-id',
    identityEnvelope: encryptedPatientField(recordId, 'identityEnvelope', {
      name: values.name ?? '患者',
      gender: values.gender ?? 'female',
      age: values.age ?? 72,
    }),
    contactEnvelope: encryptedPatientField(recordId, 'contactEnvelope', {
      mobilePhone: values.mobilePhone ?? null,
      caregiverName: values.caregiverName ?? null,
      caregiverPhone: values.caregiverPhone ?? null,
    }),
    careDetailsEnvelope: encryptedPatientField(
      recordId,
      'careDetailsEnvelope',
      { healthMetrics: values.healthMetrics ?? {} },
    ),
    status: values.status ?? 'active',
    createdAt: new Date('2026-05-14T09:00:00.000Z'),
    updatedAt: new Date('2026-05-14T09:00:00.000Z'),
  };
}

function encryptedRegistrationField(
  recordId: string,
  fieldName: 'identityEnvelope' | 'reviewEnvelope',
  value: Record<string, unknown>,
) {
  return encryptSensitiveJson(
    value,
    { tableName: 'registration_request', recordId, fieldName },
    testSensitiveEncryptionKey,
  );
}

function encryptedCareField(
  tableName: 'care_circle_post' | 'care_circle_comment' | 'care_precaution',
  recordId: string,
  fieldName: 'contentEnvelope' | 'moderationEnvelope',
  value: Record<string, unknown>,
  key = testSensitiveEncryptionKey,
) {
  return encryptSensitiveJson(value, { tableName, recordId, fieldName }, key);
}

function encryptedTrainingReviewField(
  recordId: string,
  reviewNote: string,
  key = testSensitiveEncryptionKey,
) {
  return encryptSensitiveJson(
    { reviewNote },
    {
      tableName: 'training_result',
      recordId,
      fieldName: 'reviewEnvelope',
    },
    key,
  );
}

function registrationCreateResult(args: { data: Record<string, unknown> }) {
  return Promise.resolve({
    ...args.data,
    reviewEnvelope: null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdUserId: null,
    createdPatientId: null,
    createdAt: new Date('2026-06-03T08:00:00.000Z'),
    updatedAt: new Date('2026-06-03T08:00:00.000Z'),
  });
}

describe('AppService ciphertext-only identity persistence', () => {
  it('persists patient user and profile values only in exact row-bound envelopes and phone lookup', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: args.data.id }),
        ),
      },
      patientProfile: {
        create: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve(args.data),
        ),
      },
      userRoleBinding: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) =>
        callback({
          user: prisma.user,
          patientProfile: prisma.patientProfile,
          userRoleBinding: prisma.userRoleBinding,
        }),
    );
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await service.createPatient(doctorUser, {
      account: 'patient_cipher',
      initialPassword: 'Temp-253913!',
      name: '仅密文患者',
      gender: 'female',
      age: 74,
      mobilePhone: '13800138000',
      caregiverName: '仅密文家属',
      caregiverPhone: '13900139000',
      healthMetrics: { bloodPressure: '131/79' },
    });

    const userData = prisma.user.create.mock.calls[0]?.[0].data;
    const patientData = mockArg<{ data: Record<string, unknown> }>(
      prisma.patientProfile.create,
    ).data;
    const userId = userData.id as string;
    const patientId = patientData.id as string;
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(patientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(userData).not.toHaveProperty('displayName');
    expect(userData).not.toHaveProperty('mobilePhone');
    expect(userData.mobilePhoneLookup).toBe(
      createPhoneLookupHmac('13800138000', testSensitiveEncryptionKey.key),
    );
    expect(
      decryptSensitiveJson(
        userData.identityEnvelope,
        { tableName: 'user', recordId: userId, fieldName: 'identityEnvelope' },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({ displayName: '仅密文患者', mobilePhone: '13800138000' });
    for (const field of [
      'name',
      'gender',
      'age',
      'mobilePhone',
      'caregiverName',
      'caregiverPhone',
      'healthMetrics',
    ]) {
      expect(patientData).not.toHaveProperty(field);
    }
    expect(
      decryptSensitiveJson(
        patientData.identityEnvelope,
        {
          tableName: 'patient_profile',
          recordId: patientId,
          fieldName: 'identityEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({ name: '仅密文患者', gender: 'female', age: 74 });
    expect(
      decryptSensitiveJson(
        patientData.contactEnvelope,
        {
          tableName: 'patient_profile',
          recordId: patientId,
          fieldName: 'contactEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      mobilePhone: '13800138000',
      caregiverName: '仅密文家属',
      caregiverPhone: '13900139000',
    });
    expect(
      decryptSensitiveJson(
        patientData.careDetailsEnvelope,
        {
          tableName: 'patient_profile',
          recordId: patientId,
          fieldName: 'careDetailsEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({ healthMetrics: { bloodPressure: '131/79' } });
    expect(JSON.stringify({ userData, patientData })).not.toContain(
      '仅密文患者',
    );
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      '仅密文患者',
    );
  });

  it('persists caregiver identity only in the user envelope and HMAC lookup', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            ...args.data,
            accountStatus: 'active',
            createdAt: new Date('2026-07-14T00:00:00.000Z'),
          }),
        ),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.createCaregiverAccount(adminUser, {
        account: 'caregiver_cipher',
        initialPassword: 'Temp-253913!',
        displayName: '仅密文照护人',
        mobilePhone: '13700137000',
      }),
    ).resolves.toMatchObject({
      account: 'caregiver_cipher',
      displayName: '仅密文照护人',
      mobilePhone: '13700137000',
    });

    const data = prisma.user.create.mock.calls[0]?.[0].data;
    const id = data.id as string;
    expect(data).not.toHaveProperty('displayName');
    expect(data).not.toHaveProperty('mobilePhone');
    expect(data.mobilePhoneLookup).toBe(
      createPhoneLookupHmac('13700137000', testSensitiveEncryptionKey.key),
    );
    expect(
      decryptSensitiveJson(
        data.identityEnvelope,
        { tableName: 'user', recordId: id, fieldName: 'identityEnvelope' },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({ displayName: '仅密文照护人', mobilePhone: '13700137000' });
    expect(JSON.stringify(data)).not.toContain('仅密文照护人');
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      '仅密文照护人',
    );
  });

  it('persists registration identity only in its row envelope and queries phone by HMAC', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      registrationRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            ...args.data,
            createdAt: new Date('2026-07-14T00:00:00.000Z'),
            updatedAt: new Date('2026-07-14T00:00:00.000Z'),
            reviewedByUserId: null,
            reviewedAt: null,
            createdUserId: null,
            createdPatientId: null,
            reviewEnvelope: null,
          }),
        ),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) =>
        callback({
          user: prisma.user,
          registrationRequest: prisma.registrationRequest,
          auditLog: prisma.auditLog,
        }),
    );
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.createRegistrationRequest({
        requestedRole: 'patient',
        account: 'registration_cipher',
        initialPassword: 'Temp-253913!',
        displayName: '仅密文申请人',
        mobilePhone: '13600136000',
        profile: { gender: 'female', age: 69, marker: '仅密文资料' },
      }),
    ).resolves.toMatchObject({
      account: 'registration_cipher',
      displayName: '仅密文申请人',
      mobilePhone: '13600136000',
    });

    const data = prisma.registrationRequest.create.mock.calls[0]?.[0].data;
    const id = data.id as string;
    for (const field of ['displayName', 'mobilePhone', 'profileSnapshot']) {
      expect(data).not.toHaveProperty(field);
    }
    const lookup = createPhoneLookupHmac(
      '13600136000',
      testSensitiveEncryptionKey.key,
    );
    expect(data.mobilePhoneLookup).toBe(lookup);
    expect(
      decryptSensitiveJson(
        data.identityEnvelope,
        {
          tableName: 'registration_request',
          recordId: id,
          fieldName: 'identityEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      displayName: '仅密文申请人',
      mobilePhone: '13600136000',
      profileSnapshot: { gender: 'female', age: 69, marker: '仅密文资料' },
    });
    const matchingLogin = {
      OR: [{ account: 'registration_cipher' }, { mobilePhoneLookup: lookup }],
    };
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: matchingLogin,
      select: { id: true },
    });
    expect(prisma.registrationRequest.findFirst).toHaveBeenCalledWith({
      where: objectContaining(matchingLogin),
      select: { id: true },
    });
    expect(JSON.stringify(data)).not.toContain('仅密文申请人');
    expect(JSON.stringify(data)).not.toContain('仅密文资料');
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      '仅密文申请人',
    );
  });

  it('approves an encrypted registration using row-bound review, user, and patient envelopes', async () => {
    const requestId = '5d049a26-0f28-4f4c-b0d3-04d41415bb54';
    const identityEnvelope = encryptedRegistrationField(
      requestId,
      'identityEnvelope',
      {
        displayName: '仅密文审批患者',
        mobilePhone: '13500135000',
        profileSnapshot: {
          gender: 'female',
          age: 68,
          caregiverName: '仅密文审批家属',
          caregiverPhone: '13400134000',
          healthMetrics: { bloodPressure: '129/77' },
        },
      },
    );
    const registrationRequest = {
      findUnique: jest.fn().mockResolvedValue({
        id: requestId,
        requestedRole: 'patient',
        account: 'approval_cipher',
        initialPasswordHash: '$argon2id$pending-request-hash',
        identityEnvelope,
        reviewEnvelope: null,
        reviewStatus: 'pending',
        credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    };
    const userCreate = jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: args.data.id }),
    );
    const patientCreate = jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: args.data.id }),
    );
    registrationRequest.update.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: requestId,
          requestedRole: 'patient',
          account: 'approval_cipher',
          identityEnvelope,
          reviewEnvelope: mockArg<{ data: Record<string, unknown> }>(
            registrationRequest.updateMany,
          ).data.reviewEnvelope,
          reviewStatus: 'approved',
          reviewedByUserId: doctorUser.id,
          reviewedAt: new Date('2026-07-14T01:00:00.000Z'),
          createdUserId: args.data.createdUserId,
          createdPatientId: args.data.createdPatientId,
          credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-07-14T00:00:00.000Z'),
          updatedAt: new Date('2026-07-14T01:00:00.000Z'),
        }),
    );
    const tx = {
      registrationRequest,
      user: { create: userCreate },
      patientProfile: { create: patientCreate },
      userRoleBinding: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      registrationRequest,
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.reviewRegistrationRequest(doctorUser, requestId, {
        decision: 'approved',
        decisionReason: '仅密文审核备注',
      }),
    ).resolves.toMatchObject({
      id: requestId,
      displayName: '仅密文审批患者',
      mobilePhone: '13500135000',
      reviewNote: '仅密文审核备注',
      reviewStatus: 'approved',
    });

    const claimData = mockArg<{ data: Record<string, unknown> }>(
      registrationRequest.updateMany,
    ).data;
    expect(claimData).not.toHaveProperty('reviewNote');
    expect(
      decryptSensitiveJson(
        claimData.reviewEnvelope,
        {
          tableName: 'registration_request',
          recordId: requestId,
          fieldName: 'reviewEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({ reviewNote: '仅密文审核备注' });

    const userData = userCreate.mock.calls[0]?.[0].data;
    const patientData = patientCreate.mock.calls[0]?.[0].data;
    const userId = userData.id as string;
    const patientId = patientData.id as string;
    expect(userData).not.toHaveProperty('displayName');
    expect(userData).not.toHaveProperty('mobilePhone');
    expect(
      decryptSensitiveJson(
        userData.identityEnvelope,
        { tableName: 'user', recordId: userId, fieldName: 'identityEnvelope' },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      displayName: '仅密文审批患者',
      mobilePhone: '13500135000',
    });
    expect(userData.mobilePhoneLookup).toBe(
      createPhoneLookupHmac('13500135000', testSensitiveEncryptionKey.key),
    );
    for (const field of [
      'name',
      'gender',
      'age',
      'mobilePhone',
      'caregiverName',
      'caregiverPhone',
      'healthMetrics',
    ]) {
      expect(patientData).not.toHaveProperty(field);
    }
    expect(
      decryptSensitiveJson(
        patientData.identityEnvelope,
        {
          tableName: 'patient_profile',
          recordId: patientId,
          fieldName: 'identityEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({ name: '仅密文审批患者', gender: 'female', age: 68 });
    expect(
      decryptSensitiveJson(
        patientData.contactEnvelope,
        {
          tableName: 'patient_profile',
          recordId: patientId,
          fieldName: 'contactEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      mobilePhone: '13500135000',
      caregiverName: '仅密文审批家属',
      caregiverPhone: '13400134000',
    });
    expect(
      decryptSensitiveJson(
        patientData.careDetailsEnvelope,
        {
          tableName: 'patient_profile',
          recordId: patientId,
          fieldName: 'careDetailsEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({ healthMetrics: { bloodPressure: '129/77' } });
    expect(
      JSON.stringify(registrationRequest.updateMany.mock.calls),
    ).not.toContain('仅密文审核备注');
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      '仅密文审核备注',
    );
  });
});

describe('AppService encrypted identity reads', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const userId = '38302bfd-cf2f-424c-9cc4-f60174795f54';
  const patientId = '83efb2cc-0e2f-4158-9c22-dde22be81bd8';
  const doctorUserId = 'a4aa238c-98bc-4ef9-978c-3a781d2d80d0';
  const caregiverUserId = 'e6b3340f-3e02-4e61-b204-96b1750dce1a';

  beforeAll(() => {
    process.env.JWT_SECRET = 'unit-test-jwt-secret-at-least-32-bytes';
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  function patientDetailFixture(contactEnvelope: Prisma.JsonValue) {
    return {
      ...encryptedPatientProfileFixture(patientId, {
        name: '无联系方式患者',
        gender: 'female',
        age: 73,
      }),
      contactEnvelope,
      responsibleDoctor: {
        id: 'doctor-profile-id',
        title: '主任医师',
        department: '康复科',
        user: {
          id: doctorUserId,
          identityEnvelope: encryptedUserIdentity(doctorUserId, {
            displayName: '负责医生',
            mobilePhone: null,
          }),
        },
      },
      caregiverRelations: [],
      riskGrades: [],
      rehabPlans: [],
      trainingSessions: [],
      assessments: [],
      consents: [],
    };
  }

  it('decrypts login identity from a row-bound user envelope without selecting legacy fields', async () => {
    const password = 'Temp-253913!';
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: userId,
          account: 'encrypted_login',
          passwordHash: await hashCredential(password),
          credentialVersion: 1,
          passwordResetRequired: true,
          authSessionVersion: 3,
          accountStatus: 'active',
          identityEnvelope: encryptedUserIdentity(userId, {
            displayName: '密文登录用户',
            mobilePhone: '13800138000',
          }),
          roleBindings: [
            {
              roleCode: 'patient',
              relatedObjectType: 'patient',
              relatedObjectId: patientId,
              organizationId: null,
            },
          ],
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.login({ account: 'encrypted_login', password }),
    ).resolves.toMatchObject({
      status: 'password_reset_required',
      user: { account: 'encrypted_login', displayName: '密文登录用户' },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { account: 'encrypted_login' },
      select: {
        id: true,
        account: true,
        passwordHash: true,
        credentialVersion: true,
        passwordResetRequired: true,
        authSessionVersion: true,
        accountStatus: true,
        identityEnvelope: true,
        roleBindings: {
          where: { bindingStatus: 'active' },
          select: {
            roleCode: true,
            relatedObjectType: true,
            relatedObjectId: true,
            organizationId: true,
          },
        },
      },
    });
  });

  it.each([
    ['missing', null],
    [
      'tampered',
      {
        ...encryptedUserIdentity(userId, {
          displayName: '密文登录用户',
          mobilePhone: null,
        }),
        tag: Buffer.alloc(16, 4).toString('base64'),
      },
    ],
    [
      'wrong-key',
      encryptSensitiveJson(
        { displayName: '密文登录用户', mobilePhone: null },
        { tableName: 'user', recordId: userId, fieldName: 'identityEnvelope' },
        {
          kid: 'secret-manager://rehab/wrong-sensitive-key',
          key: Buffer.alloc(32, 19),
        },
      ),
    ],
  ])(
    'hard-fails %s user identity envelopes during login',
    async (_label, envelope) => {
      const password = 'Temp-253913!';
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: userId,
            account: 'encrypted_login',
            passwordHash: await hashCredential(password),
            credentialVersion: 1,
            passwordResetRequired: true,
            authSessionVersion: 3,
            accountStatus: 'active',
            identityEnvelope: envelope,
            roleBindings: [
              {
                roleCode: 'patient',
                relatedObjectType: 'patient',
                relatedObjectId: patientId,
                organizationId: null,
              },
            ],
          }),
        },
        auditLog: { create: jest.fn() },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.login({ account: 'encrypted_login', password }),
      ).rejects.toThrow();
    },
  );

  it('decrypts patient, doctor, and caregiver identities for patient detail DTOs', async () => {
    const actor: RequestUser = {
      ...patientUser,
      roles: [
        {
          roleCode: 'patient',
          relatedObjectType: 'patient',
          relatedObjectId: patientId,
        },
      ],
    };
    const prisma = {
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: patientId,
          userId,
          responsibleDoctorId: 'doctor-profile-id',
          identityEnvelope: encryptedPatientField(
            patientId,
            'identityEnvelope',
            {
              name: '密文患者详情',
              gender: 'female',
              age: 73,
            },
          ),
          contactEnvelope: encryptedPatientField(patientId, 'contactEnvelope', {
            mobilePhone: '13800138000',
            caregiverName: '密文照护姓名',
            caregiverPhone: '13900139000',
          }),
          careDetailsEnvelope: encryptedPatientField(
            patientId,
            'careDetailsEnvelope',
            { healthMetrics: { bloodPressure: '130/80' } },
          ),
          status: 'active',
          createdAt: new Date('2026-07-14T00:00:00.000Z'),
          updatedAt: new Date('2026-07-14T00:00:00.000Z'),
          responsibleDoctor: {
            id: 'doctor-profile-id',
            title: '主任医师',
            department: '康复科',
            user: {
              id: doctorUserId,
              identityEnvelope: encryptedUserIdentity(doctorUserId, {
                displayName: '密文负责医生',
                mobilePhone: null,
              }),
            },
          },
          caregiverRelations: [
            {
              id: 'relation-id',
              caregiver: {
                id: caregiverUserId,
                account: 'caregiver001',
                identityEnvelope: encryptedUserIdentity(caregiverUserId, {
                  displayName: '密文绑定家属',
                  mobilePhone: '13700137000',
                }),
              },
            },
          ],
          riskGrades: [],
          rehabPlans: [],
          trainingSessions: [],
          assessments: [],
          consents: [],
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    const result = await service.getPatient(actor, patientId);

    expect(result).toMatchObject({
      id: patientId,
      name: '密文患者详情',
      gender: 'female',
      age: 73,
      mobilePhone: '13800138000',
      caregiverName: '密文照护姓名',
      caregiverPhone: '13900139000',
      healthMetrics: { bloodPressure: '130/80' },
      responsibleDoctor: {
        user: { id: doctorUserId, displayName: '密文负责医生' },
      },
      caregiverRelations: [
        {
          caregiver: {
            account: 'caregiver001',
            displayName: '密文绑定家属',
            mobilePhone: '13700137000',
          },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('Envelope');
    const query = JSON.stringify(
      prisma.patientProfile.findUnique.mock.calls[0],
    );
    expect(query).not.toContain('displayName');
    expect(query).not.toContain('mobilePhone":true');
  });

  it('returns explicit null optional contact fields when patient detail has no contact envelope', async () => {
    const actor: RequestUser = {
      ...patientUser,
      roles: [
        {
          roleCode: 'patient',
          relatedObjectType: 'patient',
          relatedObjectId: patientId,
        },
      ],
    };
    const prisma = {
      patientProfile: {
        findUnique: jest.fn().mockResolvedValue(patientDetailFixture(null)),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(service.getPatient(actor, patientId)).resolves.toMatchObject({
      mobilePhone: null,
      caregiverName: null,
      caregiverPhone: null,
    });
  });

  it.each([
    [
      'invalid payload',
      encryptedPatientField(patientId, 'contactEnvelope', {
        mobilePhone: null,
        caregiverName: null,
      }),
    ],
    [
      'tampered',
      {
        ...encryptedPatientField(patientId, 'contactEnvelope', {
          mobilePhone: null,
          caregiverName: null,
          caregiverPhone: null,
        }),
        tag: Buffer.alloc(16, 7).toString('base64'),
      },
    ],
    [
      'wrong-key',
      encryptSensitiveJson(
        {
          mobilePhone: null,
          caregiverName: null,
          caregiverPhone: null,
        },
        {
          tableName: 'patient_profile',
          recordId: patientId,
          fieldName: 'contactEnvelope',
        },
        {
          kid: 'secret-manager://rehab/wrong-sensitive-key',
          key: Buffer.alloc(32, 21),
        },
      ),
    ],
  ])(
    'hard-fails a non-null %s patient contact envelope',
    async (_label, contactEnvelope) => {
      const actor: RequestUser = {
        ...patientUser,
        roles: [
          {
            roleCode: 'patient',
            relatedObjectType: 'patient',
            relatedObjectId: patientId,
          },
        ],
      };
      const prisma = {
        patientProfile: {
          findUnique: jest
            .fn()
            .mockResolvedValue(patientDetailFixture(contactEnvelope)),
        },
        auditLog: { create: jest.fn() },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(service.getPatient(actor, patientId)).rejects.toThrow();
    },
  );

  it('decrypts caregiver identity envelopes in caregiver relation list DTOs', async () => {
    const actor: RequestUser = {
      ...patientUser,
      roles: [
        {
          roleCode: 'patient',
          relatedObjectType: 'patient',
          relatedObjectId: patientId,
        },
      ],
    };
    const prisma = {
      consentRecord: {
        findFirst: jest.fn().mockResolvedValue({ id: 'consent-id' }),
      },
      caregiverRelation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'relation-id',
            patientId,
            caregiverUserId,
            relation: 'daughter',
            authorizationStatus: 'active',
            authorizedAt: new Date('2026-07-14T00:00:00.000Z'),
            revokedAt: null,
            scope: { progress: true },
            caregiver: {
              id: caregiverUserId,
              account: 'caregiver001',
              identityEnvelope: encryptedUserIdentity(caregiverUserId, {
                displayName: '密文关系列表家属',
                mobilePhone: '13700137000',
              }),
            },
          },
        ]),
      },
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(
      service.listCaregiverRelations(actor, patientId),
    ).resolves.toEqual([
      objectContaining({
        caregiver: objectContaining({
          displayName: '密文关系列表家属',
          mobilePhone: '13700137000',
        }),
      }),
    ]);
    expect(
      JSON.stringify(prisma.caregiverRelation.findMany.mock.calls[0]),
    ).not.toContain('displayName');
  });

  it.each([
    ['missing displayName', { mobilePhone: null }],
    ['blank displayName', { displayName: '   ', mobilePhone: null }],
    [
      'wrong-type mobilePhone',
      { displayName: '密文审计医生', mobilePhone: 13800138000 },
    ],
  ])(
    'rejects %s in valid user identity envelopes during service reads',
    async (_label, payload) => {
      const prisma = {
        auditLog: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'audit-id',
              actor: {
                id: doctorUserId,
                account: 'doctor001',
                identityEnvelope: encryptSensitiveJson(
                  payload,
                  {
                    tableName: 'user',
                    recordId: doctorUserId,
                    fieldName: 'identityEnvelope',
                  },
                  testSensitiveEncryptionKey,
                ),
              },
            },
          ]),
        },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(service.auditLogs(auditorAdminUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('decrypts patient identity before building the caregiver summary DTO', async () => {
    const prisma = {
      patientProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: patientId,
            responsibleDoctorId: 'doctor-profile-id',
          })
          .mockResolvedValueOnce({
            id: patientId,
            identityEnvelope: encryptedPatientField(
              patientId,
              'identityEnvelope',
              { name: '密文摘要患者', gender: 'female', age: 76 },
            ),
            contactEnvelope: null,
            riskGrades: [],
            rehabPlans: [],
            trainingSessions: [],
          }),
      },
      caregiverRelation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'relation-id',
          scope: {
            summary: true,
            reminders: false,
            progress: true,
            rawAssessment: false,
            planEdit: false,
          },
        }),
      },
      consentRecord: {
        findFirst: jest.fn().mockResolvedValue({ id: 'consent-id' }),
      },
      auditLog: { create: jest.fn() },
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    const result = await service.caregiverSummary(caregiverUser, patientId);
    expect(result).toMatchObject({
      patient: { id: patientId, name: '密*', age: 76 },
    });
    expect(result.patient).not.toHaveProperty('mobilePhone');
    expect(result.patient).not.toHaveProperty('caregiverName');
    expect(result.patient).not.toHaveProperty('caregiverPhone');
  });

  const invalidEncryptedPatientAges: Array<[string, unknown]> = [
    ['numeric string', '72'],
    ['boolean', true],
    ['null', null],
    ['below range', 0],
    ['above range', 121],
    ['non-integer', 72.5],
  ];

  it.each(invalidEncryptedPatientAges)(
    'rejects %s age in patient detail identity envelopes',
    async (_label, age) => {
      const actor: RequestUser = {
        ...patientUser,
        roles: [
          {
            roleCode: 'patient',
            relatedObjectType: 'patient',
            relatedObjectId: patientId,
          },
        ],
      };
      const prisma = {
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: patientId,
            userId,
            responsibleDoctorId: 'doctor-profile-id',
            identityEnvelope: encryptedPatientField(
              patientId,
              'identityEnvelope',
              { name: '患者', gender: 'female', age },
            ),
            contactEnvelope: encryptedPatientField(
              patientId,
              'contactEnvelope',
              {
                mobilePhone: null,
                caregiverName: null,
                caregiverPhone: null,
              },
            ),
            careDetailsEnvelope: encryptedPatientField(
              patientId,
              'careDetailsEnvelope',
              { healthMetrics: {} },
            ),
            status: 'active',
            createdAt: new Date('2026-07-14T00:00:00.000Z'),
            updatedAt: new Date('2026-07-14T00:00:00.000Z'),
            responsibleDoctor: {
              id: 'doctor-profile-id',
              title: '主任医师',
              department: '康复科',
              user: {
                id: doctorUserId,
                identityEnvelope: encryptedUserIdentity(doctorUserId, {
                  displayName: '负责医生',
                  mobilePhone: null,
                }),
              },
            },
            caregiverRelations: [],
            riskGrades: [],
            rehabPlans: [],
            trainingSessions: [],
            assessments: [],
            consents: [],
          }),
        },
        auditLog: { create: jest.fn() },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(service.getPatient(actor, patientId)).rejects.toThrow(
        '患者年龄数据无效。',
      );
    },
  );

  it.each(invalidEncryptedPatientAges)(
    'rejects %s age in caregiver summary identity envelopes',
    async (_label, age) => {
      const prisma = {
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue({
            id: patientId,
            identityEnvelope: encryptedPatientField(
              patientId,
              'identityEnvelope',
              { name: '患者', gender: 'female', age },
            ),
            riskGrades: [],
            rehabPlans: [],
            trainingSessions: [],
          }),
        },
        caregiverRelation: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'relation-id',
            scope: {
              summary: true,
              reminders: false,
              progress: true,
              rawAssessment: false,
              planEdit: false,
            },
          }),
        },
        consentRecord: {
          findFirst: jest.fn().mockResolvedValue({ id: 'consent-id' }),
        },
        auditLog: { create: jest.fn() },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.caregiverSummary(caregiverUser, patientId),
      ).rejects.toThrow('患者年龄数据无效。');
    },
  );

  it.each(invalidEncryptedPatientAges)(
    'rejects %s age in patient export identity envelopes',
    async (_label, age) => {
      const prisma = {
        patientProfile: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: patientId,
              identityEnvelope: encryptedPatientField(
                patientId,
                'identityEnvelope',
                { name: '患者', gender: 'female', age },
              ),
              contactEnvelope: encryptedPatientField(
                patientId,
                'contactEnvelope',
                {
                  mobilePhone: null,
                  caregiverName: null,
                  caregiverPhone: null,
                },
              ),
              careDetailsEnvelope: encryptedPatientField(
                patientId,
                'careDetailsEnvelope',
                { healthMetrics: {} },
              ),
              responsibleDoctor: null,
              status: 'active',
              createdAt: new Date('2026-07-14T00:00:00.000Z'),
              updatedAt: new Date('2026-07-14T00:00:00.000Z'),
            },
          ]),
        },
        auditLog: { create: jest.fn() },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.exportDataset(adminUser, 'patients', {
          format: 'json',
          reason: '严格年龄解密测试',
        }),
      ).rejects.toThrow('患者年龄数据无效。');
    },
  );

  it('projects audit actor identity to exactly account and displayName', async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-id',
            action: 'patient.view',
            actor: {
              id: doctorUserId,
              account: 'doctor001',
              identityEnvelope: encryptedUserIdentity(doctorUserId, {
                displayName: '密文审计医生',
                mobilePhone: null,
              }),
            },
          },
        ]),
      },
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    await expect(service.auditLogs(auditorAdminUser)).resolves.toEqual([
      {
        id: 'audit-id',
        action: 'patient.view',
        actor: {
          account: 'doctor001',
          displayName: '密文审计医生',
        },
      },
    ]);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          actor: {
            select: { id: true, account: true, identityEnvelope: true },
          },
        },
      }),
    );
  });

  it('projects dashboard audit actors to exactly account and displayName', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const groupBy = jest.fn().mockResolvedValue([]);
    const prisma = {
      user: { count },
      patientProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        count,
      },
      doctorProfile: { count },
      caregiverRelation: { count },
      assessmentRecord: { count },
      trainingSession: { count, groupBy },
      rehabPlan: { count, groupBy },
      consentRecord: { count, groupBy },
      deviceRegistry: { count, groupBy },
      trainingResult: {
        count,
        aggregate: jest.fn().mockResolvedValue({
          _avg: {
            score: null,
            completionRate: null,
            durationSeconds: null,
            motionAccuracy: null,
            reactionTimeMs: null,
          },
        }),
        groupBy,
      },
      riskGradeRecord: { groupBy },
      auditLog: {
        count,
        groupBy,
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'dashboard-audit-id',
            action: 'patient.view',
            actor: {
              id: doctorUserId,
              account: 'doctor001',
              identityEnvelope: encryptedUserIdentity(doctorUserId, {
                displayName: '密文审计医生',
                mobilePhone: '13800138000',
              }),
            },
          },
        ]),
      },
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );

    const result = await service.dashboard(superAdminUser);

    expect(result.auditLogs).toEqual([
      {
        id: 'dashboard-audit-id',
        action: 'patient.view',
        actor: {
          account: 'doctor001',
          displayName: '密文审计医生',
        },
      },
    ]);
  });
});

describe('AppService patient onboarding', () => {
  function createService() {
    const prisma = {
      doctorProfile: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'new-patient-user-id',
        }),
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
          user: prisma.user,
          patientProfile: prisma.patientProfile,
          userRoleBinding: prisma.userRoleBinding,
        }),
    );

    return {
      prisma,
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
    };
  }

  it('allows admins to create patient profiles by responsible doctor account', async () => {
    const { prisma, service } = createService();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.doctorProfile.findUnique.mockResolvedValue(null);
    prisma.doctorProfile.findFirst.mockResolvedValue({
      id: 'doctor-profile-id',
    });
    prisma.patientProfile.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...args.data,
          status: 'active',
          createdAt: new Date('2026-05-14T08:00:00.000Z'),
          updatedAt: new Date('2026-05-14T08:00:00.000Z'),
        }),
    );

    const created = await service.createPatient(adminUser, {
      account: 'patient_new',
      initialPassword: 'Temp-253913!',
      name: '赵阿姨',
      gender: 'female',
      age: 70,
      responsibleDoctorId: 'doctor001',
      healthMetrics: { bloodPressure: '128/78' },
    });

    expect(created).toMatchObject({
      responsibleDoctorId: 'doctor-profile-id',
      name: '赵阿姨',
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

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
        identityEnvelope: anyValue(Object),
        contactEnvelope: anyValue(Object),
        careDetailsEnvelope: anyValue(Object),
      }),
      select: objectContaining({
        id: true,
        identityEnvelope: true,
        contactEnvelope: true,
        careDetailsEnvelope: true,
      }),
    });
    const patientData = mockArg<{ data: Record<string, unknown> }>(
      prisma.patientProfile.create,
    ).data;
    expect(patientData).not.toHaveProperty('name');
    expect(patientData).not.toHaveProperty('gender');
    expect(patientData).not.toHaveProperty('age');
    expect(patientData).not.toHaveProperty('healthMetrics');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: objectContaining({ passwordResetRequired: true }),
      select: { id: true },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'admin-user-id',
        actorRole: 'admin',
        action: 'patient.create',
        targetType: 'patient_profile',
        targetId: created.id,
        result: 'success',
      }),
    });
  });

  it('maps the exact User mobilePhoneLookup P2002 during patient creation', async () => {
    const { prisma, service } = createService();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(
      userP2002({ modelName: 'User', target: ['mobilePhoneLookup'] }),
    );

    await expect(
      service.createPatient(doctorUser, {
        account: 'patient_conflict',
        initialPassword: 'Temp-253913!',
        name: '冲突患者',
        gender: 'female',
        age: 70,
        mobilePhone: '13800001111',
      }),
    ).rejects.toThrow('患者账号或手机号已存在。');
  });

  it('rethrows an unrelated P2002 during patient creation unchanged', async () => {
    const { prisma, service } = createService();
    const conflict = userP2002({
      modelName: 'PatientProfile',
      target: ['userId'],
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(conflict);

    await expect(
      service.createPatient(doctorUser, {
        account: 'patient_unrelated',
        initialPassword: 'Temp-253913!',
        name: '无关冲突患者',
        gender: 'female',
        age: 70,
      }),
    ).rejects.toBe(conflict);
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
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
    };
  }

  it('allows admin to create a caregiver login account without patient binding', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:00:00.000Z');
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        const data = args.data;
        return Promise.resolve({
          id: data.id,
          account: data.account,
          identityEnvelope: data.identityEnvelope,
          accountStatus: 'active',
          createdAt,
        });
      },
    );

    const created = await service.createCaregiverAccount(adminUser, {
      account: ' caregiver_new ',
      initialPassword: 'Temp-253913!',
      displayName: ' 张家属 ',
      mobilePhone: '13900001234',
    });

    expect(created).toEqual({
      id: anyValue(String),
      account: 'caregiver_new',
      displayName: '张家属',
      mobilePhone: '13900001234',
      accountStatus: 'active',
      createdAt,
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { account: 'caregiver_new' },
          {
            mobilePhoneLookup: createPhoneLookupHmac(
              '13900001234',
              testSensitiveEncryptionKey.key,
            ),
          },
        ],
      },
      select: { id: true },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: objectContaining({
        account: 'caregiver_new',
        passwordHash: stringMatching(/^\$argon2id\$/),
        passwordUpdatedAt: anyValue(Date),
        passwordResetRequired: true,
        identityEnvelope: anyValue(Object),
        mobilePhoneLookup: createPhoneLookupHmac(
          '13900001234',
          testSensitiveEncryptionKey.key,
        ),
      }),
      select: {
        id: true,
        account: true,
        identityEnvelope: true,
        accountStatus: true,
        createdAt: true,
      },
    });
    const caregiverData = mockArg<{ data: Record<string, unknown> }>(
      prisma.user.create,
    ).data;
    expect(caregiverData).not.toHaveProperty('displayName');
    expect(caregiverData).not.toHaveProperty('mobilePhone');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'admin-user-id',
        actorRole: 'admin',
        action: 'user.create.caregiver',
        targetType: 'user',
        targetId: created.id,
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
        initialPassword: 'Temp-253913!',
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
    prisma.user.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        const data = args.data;
        return Promise.resolve({
          id: data.id,
          account: data.account,
          identityEnvelope: data.identityEnvelope,
          accountStatus: 'active',
          createdAt,
        });
      },
    );

    await expect(
      service.createCaregiverAccount(operatorAdminUser, {
        account: 'caregiver_operator',
        initialPassword: 'Temp-253913!',
        displayName: '运营创建家属',
      }),
    ).resolves.toMatchObject({
      id: anyValue(String),
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
        initialPassword: 'Temp-253913!',
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
        initialPassword: 'Temp-253913!',
        displayName: '李明',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('maps the exact User mobilePhoneLookup P2002 during caregiver creation', async () => {
    const { prisma, service } = createService();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(
      userP2002({ modelName: 'User', target: ['mobilePhoneLookup'] }),
    );

    await expect(
      service.createCaregiverAccount(adminUser, {
        account: 'caregiver_conflict',
        initialPassword: 'Temp-253913!',
        displayName: '冲突家属',
        mobilePhone: '13900001111',
      }),
    ).rejects.toThrow('家属账号或手机号已存在。');
  });

  it.each([
    ['constraint name target', { target: 'user_mobilePhoneLookup_key' }],
    ['missing model', { target: ['mobilePhoneLookup'] }],
    [
      'another model',
      { modelName: 'RegistrationRequest', target: ['mobilePhoneLookup'] },
    ],
    ['another field', { modelName: 'User', target: ['accountStatus'] }],
    [
      'additional metadata',
      {
        modelName: 'User',
        target: ['mobilePhoneLookup'],
        constraint: 'user_mobilePhoneLookup_key',
      },
    ],
  ])('rethrows caregiver %s P2002 unchanged', async (_label, meta) => {
    const { prisma, service } = createService();
    const conflict = userP2002(meta);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(conflict);

    await expect(
      service.createCaregiverAccount(adminUser, {
        account: 'caregiver_unrelated',
        initialPassword: 'Temp-253913!',
        displayName: '无关冲突家属',
      }),
    ).rejects.toBe(conflict);
  });
});

describe('AppService registration requests', () => {
  function createService() {
    const prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      registrationRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn((input: unknown) => Promise.resolve(input)),
        update: jest.fn((input: unknown) => Promise.resolve(input)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
          user: typeof prisma.user;
          registrationRequest: typeof prisma.registrationRequest;
          patientProfile: typeof prisma.patientProfile;
          userRoleBinding: typeof prisma.userRoleBinding;
          auditLog: typeof prisma.auditLog;
        }) => Promise<unknown>,
      ) =>
        callback({
          user: prisma.user,
          registrationRequest: prisma.registrationRequest,
          patientProfile: prisma.patientProfile,
          userRoleBinding: prisma.userRoleBinding,
          auditLog: prisma.auditLog,
        }),
    );

    return {
      prisma,
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
    };
  }

  it('creates a pending patient registration request without creating an account', async () => {
    const { prisma, service } = createService();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.registrationRequest.findFirst.mockResolvedValue(null);
    prisma.registrationRequest.create.mockImplementation(
      registrationCreateResult,
    );

    const created = await service.createRegistrationRequest({
      requestedRole: 'patient',
      account: ' patient_apply ',
      initialPassword: 'Temp-253913!',
      displayName: ' 申请患者 ',
      mobilePhone: '13800001111',
      profile: {
        gender: 'female',
        age: 71,
        healthMetrics: { bloodPressure: '126/78' },
      },
    });

    expect(created).toMatchObject({
      id: anyValue(String),
      requestedRole: 'patient',
      account: 'patient_apply',
      reviewStatus: 'pending',
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { account: 'patient_apply' },
          {
            mobilePhoneLookup: createPhoneLookupHmac(
              '13800001111',
              testSensitiveEncryptionKey.key,
            ),
          },
        ],
      },
      select: { id: true },
    });
    expect(prisma.registrationRequest.create).toHaveBeenCalledWith({
      data: objectContaining({
        requestedRole: 'patient',
        account: 'patient_apply',
        id: anyValue(String),
        identityEnvelope: objectContaining({
          alg: 'AES-256-GCM',
          kid: 'secret-manager://rehab/unit-sensitive-key',
          contentType: 'application/json',
        }),
        mobilePhoneLookup: createPhoneLookupHmac(
          '13800001111',
          testSensitiveEncryptionKey.key,
        ),
        reviewStatus: 'pending',
      }),
      select: anyValue(Object),
    });
    const createInput: unknown =
      prisma.registrationRequest.create.mock.calls[0]?.[0];
    expect(createInput).not.toHaveProperty('data.displayName');
    expect(createInput).not.toHaveProperty('data.mobilePhone');
    expect(createInput).not.toHaveProperty('data.profileSnapshot');
    expect(JSON.stringify(createInput)).not.toContain('bloodPressure');
    expect(JSON.stringify(createInput)).not.toContain('126/78');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: undefined,
        actorRole: undefined,
        action: 'registration_request.create',
        targetType: 'registration_request',
        targetId: created.id,
        result: 'success',
      }),
    });
  });

  it('approves a patient registration request and creates the account only during review', async () => {
    const { prisma, service } = createService();
    const requestedAt = new Date('2026-06-03T08:00:00.000Z');
    const reviewedAt = new Date('2026-06-03T09:00:00.000Z');
    prisma.registrationRequest.findUnique.mockResolvedValue({
      id: registrationRequestFixtureId,
      requestedRole: 'patient',
      account: 'patient_apply',
      initialPasswordHash: '$argon2id$pending-request-hash',
      identityEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'identityEnvelope',
        {
          displayName: '申请患者',
          mobilePhone: '13800001111',
          profileSnapshot: {
            gender: 'female',
            age: 71,
          },
        },
      ),
      reviewStatus: 'pending',
      credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      createdAt: requestedAt,
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'approved-user-id' });
    prisma.patientProfile.create.mockResolvedValue({
      id: 'approved-patient-id',
    });
    prisma.registrationRequest.update.mockResolvedValue({
      id: registrationRequestFixtureId,
      requestedRole: 'patient',
      account: 'patient_apply',
      identityEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'identityEnvelope',
        {
          displayName: '申请患者',
          mobilePhone: '13800001111',
          profileSnapshot: {
            gender: 'female',
            age: 71,
          },
        },
      ),
      reviewEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'reviewEnvelope',
        { reviewNote: '机构确认身份' },
      ),
      reviewStatus: 'approved',
      reviewedByUserId: 'doctor-user-id',
      reviewedAt,
      createdUserId: 'approved-user-id',
      createdPatientId: 'approved-patient-id',
      credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      createdAt: requestedAt,
      updatedAt: reviewedAt,
    });

    await expect(
      service.reviewRegistrationRequest(
        doctorUser,
        registrationRequestFixtureId,
        {
          decision: 'approved',
          decisionReason: '机构确认身份',
        },
      ),
    ).resolves.toMatchObject({
      id: registrationRequestFixtureId,
      reviewStatus: 'approved',
      createdUserId: 'approved-user-id',
      createdPatientId: 'approved-patient-id',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: objectContaining({
        account: 'patient_apply',
        passwordHash: '$argon2id$pending-request-hash',
        passwordUpdatedAt: anyValue(Date),
        passwordResetRequired: true,
        id: anyValue(String),
        identityEnvelope: anyValue(Object),
        mobilePhoneLookup: createPhoneLookupHmac(
          '13800001111',
          testSensitiveEncryptionKey.key,
        ),
      }),
      select: { id: true },
    });
    expect(prisma.patientProfile.create).toHaveBeenCalledWith({
      data: objectContaining({
        userId: 'approved-user-id',
        id: anyValue(String),
        identityEnvelope: anyValue(Object),
        contactEnvelope: anyValue(Object),
        careDetailsEnvelope: anyValue(Object),
      }),
      select: { id: true },
    });
    expect(prisma.userRoleBinding.create).toHaveBeenCalledWith({
      data: {
        userId: 'approved-user-id',
        roleCode: 'patient',
        relatedObjectType: 'patient',
        relatedObjectId: 'approved-patient-id',
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'registration_request.review',
        targetType: 'registration_request',
        targetId: registrationRequestFixtureId,
        result: 'success',
      }),
    });
  });

  it('rejects a registration request without creating an account', async () => {
    const { prisma, service } = createService();
    prisma.registrationRequest.findUnique.mockResolvedValue({
      id: registrationRequestFixtureId,
      requestedRole: 'caregiver',
      account: 'caregiver_apply',
      initialPasswordHash: null,
      identityEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'identityEnvelope',
        {
          displayName: '申请家属',
          mobilePhone: '13900001111',
          profileSnapshot: {},
        },
      ),
      reviewStatus: 'pending',
      credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    prisma.registrationRequest.update.mockResolvedValue({
      id: registrationRequestFixtureId,
      requestedRole: 'caregiver',
      account: 'caregiver_apply',
      identityEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'identityEnvelope',
        {
          displayName: '申请家属',
          mobilePhone: '13900001111',
          profileSnapshot: {},
        },
      ),
      reviewEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'reviewEnvelope',
        { reviewNote: '信息不完整' },
      ),
      reviewStatus: 'rejected',
      reviewedByUserId: 'admin-user-id',
      reviewedAt: new Date('2026-06-03T09:00:00.000Z'),
      createdUserId: null,
      createdPatientId: null,
      credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-06-03T08:00:00.000Z'),
      updatedAt: new Date('2026-06-03T09:00:00.000Z'),
    });

    await expect(
      service.reviewRegistrationRequest(
        adminUser,
        registrationRequestFixtureId,
        {
          decision: 'rejected',
          decisionReason: '信息不完整',
        },
      ),
    ).resolves.toMatchObject({
      id: registrationRequestFixtureId,
      reviewStatus: 'rejected',
      createdUserId: null,
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userRoleBinding.create).not.toHaveBeenCalled();
    expect(prisma.patientProfile.create).not.toHaveBeenCalled();
  });
});

describe('AppService registration requests', () => {
  function createService() {
    const prisma = {
      registrationRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn((input: unknown) => Promise.resolve(input)),
        update: jest.fn((input: unknown) => Promise.resolve(input)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      patientProfile: {
        create: jest.fn(),
      },
      userRoleBinding: {
        create: jest.fn(),
      },
      caregiverRelation: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      <T>(callback: (tx: typeof prisma) => Promise<T>) => callback(prisma),
    );

    return {
      prisma,
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
    };
  }

  const submittedAt = new Date('2026-06-03T08:00:00.000Z');

  function mockPendingCaregiverApproval(
    prisma: ReturnType<typeof createService>['prisma'],
  ) {
    prisma.registrationRequest.findUnique.mockResolvedValue({
      id: registrationRequestFixtureId,
      requestedRole: 'caregiver',
      account: 'caregiver_new',
      initialPasswordHash: '$argon2id$pending-request-hash',
      identityEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'identityEnvelope',
        {
          displayName: '申请家属',
          mobilePhone: '13900000001',
          profileSnapshot: {},
        },
      ),
      reviewStatus: 'pending',
      credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    prisma.user.findFirst.mockResolvedValue(null);
  }

  it('creates a pending public registration request without creating an active user', async () => {
    const { prisma, service } = createService();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.registrationRequest.findFirst.mockResolvedValue(null);
    prisma.registrationRequest.create.mockImplementation(
      registrationCreateResult,
    );

    const created = await service.createRegistrationRequest({
      requestedRole: 'patient',
      account: ' patient_new ',
      initialPassword: 'Temp-253913!',
      displayName: ' 赵阿姨 ',
      mobilePhone: '13900000001',
      profile: {
        gender: 'female',
        age: 70,
        caregiverName: '赵子女',
        caregiverPhone: '13900000002',
        healthMetrics: { bloodPressure: '128/78' },
      },
    });

    expect(created).toMatchObject({
      id: anyValue(String),
      requestedRole: 'patient',
      account: 'patient_new',
      reviewStatus: 'pending',
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.registrationRequest.create).toHaveBeenCalledWith({
      data: objectContaining({
        requestedRole: 'patient',
        account: 'patient_new',
        initialPasswordHash: stringMatching(/^\$argon2id\$/),
        id: anyValue(String),
        identityEnvelope: anyValue(Object),
        mobilePhoneLookup: createPhoneLookupHmac(
          '13900000001',
          testSensitiveEncryptionKey.key,
        ),
        reviewStatus: 'pending',
      }),
      select: objectContaining({
        id: true,
        account: true,
        reviewStatus: true,
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: undefined,
        actorRole: undefined,
        action: 'registration_request.create',
        targetType: 'registration_request',
        targetId: created.id,
        result: 'success',
      }),
    });
  });

  it('propagates a forged User P2002 from public registration unchanged', async () => {
    const { prisma, service } = createService();
    const conflict = userP2002({
      modelName: 'User',
      target: ['mobilePhoneLookup'],
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.registrationRequest.findFirst.mockResolvedValue(null);
    prisma.registrationRequest.create.mockRejectedValue(conflict);

    await expect(
      service.createRegistrationRequest({
        requestedRole: 'caregiver',
        account: 'caregiver_public_request',
        initialPassword: 'Temp-253913!',
        displayName: '公开申请家属',
        mobilePhone: '13900000001',
        profile: {},
      }),
    ).rejects.toBe(conflict);

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('scopes registration request lists to each review role and rejects patients', async () => {
    const { prisma, service } = createService();
    prisma.registrationRequest.findMany.mockResolvedValue([
      {
        id: registrationRequestFixtureId,
        account: 'patient_new',
        requestedRole: 'patient',
        identityEnvelope: encryptedRegistrationField(
          registrationRequestFixtureId,
          'identityEnvelope',
          {
            displayName: '赵阿姨',
            mobilePhone: '13900000001',
            profileSnapshot: { gender: 'female', age: 70 },
          },
        ),
        reviewEnvelope: null,
        reviewStatus: 'pending',
        reviewedByUserId: null,
        reviewedAt: null,
        createdUserId: null,
        createdPatientId: null,
        credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
        createdAt: submittedAt,
        updatedAt: submittedAt,
      },
    ]);

    const doctorResult = await service.listRegistrationRequests(doctorUser);
    const adminResult = await service.listRegistrationRequests(adminUser);
    await expect(
      service.listRegistrationRequests(patientUser),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(doctorResult).toHaveLength(1);
    expect(adminResult).toHaveLength(1);
    expect(JSON.stringify(doctorResult)).not.toContain('initialPasswordHash');
    expect(JSON.stringify(adminResult)).not.toContain('profileSnapshot');
    expect(prisma.registrationRequest.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { requestedRole: 'patient' } }),
    );
    expect(prisma.registrationRequest.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { requestedRole: 'caregiver' } }),
    );
  });

  it('approves a patient registration request by creating user, patient role, profile, request update, and audit', async () => {
    const { prisma, service } = createService();
    prisma.registrationRequest.findUnique.mockResolvedValue({
      id: registrationRequestFixtureId,
      requestedRole: 'patient',
      account: 'patient_new',
      initialPasswordHash: '$argon2id$pending-request-hash',
      identityEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'identityEnvelope',
        {
          displayName: '赵阿姨',
          mobilePhone: '13900000001',
          profileSnapshot: {
            gender: 'female',
            age: 70,
            caregiverName: '赵子女',
            caregiverPhone: '13900000002',
            healthMetrics: { bloodPressure: '128/78' },
          },
        },
      ),
      reviewStatus: 'pending',
      credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'created-user-id' });
    prisma.patientProfile.create.mockResolvedValue({
      id: 'created-patient-id',
    });
    prisma.registrationRequest.update.mockResolvedValue({
      id: registrationRequestFixtureId,
      requestedRole: 'patient',
      account: 'patient_new',
      identityEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'identityEnvelope',
        {
          displayName: '赵阿姨',
          mobilePhone: '13900000001',
          profileSnapshot: { gender: 'female', age: 70 },
        },
      ),
      reviewEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'reviewEnvelope',
        { reviewNote: '资料完整' },
      ),
      reviewStatus: 'approved',
      reviewedByUserId: 'doctor-user-id',
      reviewedAt: new Date('2026-06-10T01:00:00.000Z'),
      createdUserId: 'created-user-id',
      createdPatientId: 'created-patient-id',
      createdAt: new Date('2026-06-10T00:00:00.000Z'),
      updatedAt: new Date('2026-06-10T01:00:00.000Z'),
      credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    const reviewed = await service.reviewRegistrationRequest(
      doctorUser,
      registrationRequestFixtureId,
      {
        decision: 'approved',
        decisionReason: '资料完整',
      },
    );

    expect(reviewed).toMatchObject({
      id: registrationRequestFixtureId,
      reviewStatus: 'approved',
    });
    expect(JSON.stringify(reviewed)).not.toContain('initialPasswordHash');
    expect(JSON.stringify(reviewed)).not.toContain('profileSnapshot');

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: objectContaining({
        account: 'patient_new',
        passwordHash: '$argon2id$pending-request-hash',
        passwordUpdatedAt: anyValue(Date),
        id: anyValue(String),
        identityEnvelope: anyValue(Object),
        mobilePhoneLookup: createPhoneLookupHmac(
          '13900000001',
          testSensitiveEncryptionKey.key,
        ),
      }),
      select: { id: true },
    });
    expect(prisma.patientProfile.create).toHaveBeenCalledWith({
      data: objectContaining({
        userId: 'created-user-id',
        responsibleDoctorId: 'doctor-profile-id',
        id: anyValue(String),
        identityEnvelope: anyValue(Object),
        contactEnvelope: anyValue(Object),
        careDetailsEnvelope: anyValue(Object),
      }),
      select: { id: true },
    });
    expect(prisma.userRoleBinding.create).toHaveBeenCalledWith({
      data: {
        userId: 'created-user-id',
        roleCode: 'patient',
        relatedObjectType: 'patient',
        relatedObjectId: 'created-patient-id',
      },
    });
    const approvedUpdateArgs: unknown =
      prisma.registrationRequest.update.mock.calls[0]?.[0];
    expect(approvedUpdateArgs).toEqual(
      objectContaining({
        data: objectContaining({
          createdUserId: 'created-user-id',
          createdPatientId: 'created-patient-id',
        }),
        select: objectContaining({ id: true }),
      }),
    );
    expect(prisma.registrationRequest.updateMany).toHaveBeenCalledWith({
      where: objectContaining({
        id: registrationRequestFixtureId,
        reviewStatus: 'pending',
        credentialExpiresAt: { gt: anyValue(Date) },
      }),
      data: objectContaining({
        reviewStatus: 'approved',
        initialPasswordHash: null,
      }),
    });
    expect(JSON.stringify(approvedUpdateArgs)).not.toContain(
      'initialPasswordHash',
    );
    expect(JSON.stringify(approvedUpdateArgs)).not.toContain('profileSnapshot');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'registration_request.review',
        targetType: 'registration_request',
        targetId: registrationRequestFixtureId,
        result: 'success',
        metadata: objectContaining({ decision: 'approved' }),
      }),
    });
  });

  it.each(['account', 'mobilePhoneLookup'])(
    'maps the exact User %s P2002 during registration approval',
    async (target) => {
      const { prisma, service } = createService();
      mockPendingCaregiverApproval(prisma);
      prisma.user.create.mockRejectedValue(
        userP2002({ modelName: 'User', target: [target] }),
      );

      await expect(
        service.reviewRegistrationRequest(
          adminUser,
          registrationRequestFixtureId,
          {
            decision: 'approved',
            decisionReason: '资料完整',
          },
        ),
      ).rejects.toThrow('申请账号或手机号已存在。');
    },
  );

  it('propagates unrelated P2002 targets during registration approval unchanged', async () => {
    const { prisma, service } = createService();
    const conflict = userP2002({
      modelName: 'User',
      target: ['passwordHash'],
    });
    mockPendingCaregiverApproval(prisma);
    prisma.user.create.mockRejectedValue(conflict);

    await expect(
      service.reviewRegistrationRequest(
        adminUser,
        registrationRequestFixtureId,
        {
          decision: 'approved',
          decisionReason: '资料完整',
        },
      ),
    ).rejects.toBe(conflict);
  });

  it('rejects a registration request without creating an active user', async () => {
    const { prisma, service } = createService();
    prisma.registrationRequest.findUnique.mockResolvedValue({
      id: registrationRequestFixtureId,
      requestedRole: 'caregiver',
      account: 'patient_new',
      initialPasswordHash: null,
      identityEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'identityEnvelope',
        {
          displayName: '赵阿姨',
          mobilePhone: null,
          profileSnapshot: {},
        },
      ),
      reviewStatus: 'pending',
      credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    prisma.registrationRequest.update.mockResolvedValue({
      id: registrationRequestFixtureId,
      requestedRole: 'caregiver',
      account: 'patient_new',
      identityEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'identityEnvelope',
        {
          displayName: '赵阿姨',
          mobilePhone: null,
          profileSnapshot: {},
        },
      ),
      reviewEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'reviewEnvelope',
        { reviewNote: '资料不完整' },
      ),
      reviewStatus: 'rejected',
      reviewedByUserId: 'admin-user-id',
      reviewedAt: new Date('2026-06-10T01:00:00.000Z'),
      createdUserId: null,
      createdPatientId: null,
      createdAt: new Date('2026-06-10T00:00:00.000Z'),
      updatedAt: new Date('2026-06-10T01:00:00.000Z'),
      credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    const reviewed = await service.reviewRegistrationRequest(
      adminUser,
      registrationRequestFixtureId,
      {
        decision: 'rejected',
        decisionReason: '资料不完整',
      },
    );

    expect(reviewed).toMatchObject({
      id: registrationRequestFixtureId,
      reviewStatus: 'rejected',
    });
    expect(JSON.stringify(reviewed)).not.toContain('initialPasswordHash');
    expect(JSON.stringify(reviewed)).not.toContain('profileSnapshot');

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.patientProfile.create).not.toHaveBeenCalled();
    expect(prisma.userRoleBinding.create).not.toHaveBeenCalled();
    expect(prisma.registrationRequest.updateMany).toHaveBeenCalledWith({
      where: objectContaining({
        id: registrationRequestFixtureId,
        reviewStatus: 'pending',
      }),
      data: objectContaining({
        reviewStatus: 'rejected',
        reviewedByUserId: 'admin-user-id',
        reviewEnvelope: anyValue(Object),
        initialPasswordHash: null,
      }),
    });
    const rejectedUpdateArgs: unknown =
      prisma.registrationRequest.update.mock.calls[0]?.[0];
    expect(JSON.stringify(rejectedUpdateArgs)).not.toContain(
      'initialPasswordHash',
    );
    expect(JSON.stringify(rejectedUpdateArgs)).not.toContain('profileSnapshot');
  });

  it('blocks duplicate account or mobile before creating an active user during approval', async () => {
    const { prisma, service } = createService();
    prisma.registrationRequest.findUnique.mockResolvedValue({
      id: registrationRequestFixtureId,
      requestedRole: 'patient',
      account: 'patient_new',
      initialPasswordHash: createHash('sha256').update('253913').digest('hex'),
      identityEnvelope: encryptedRegistrationField(
        registrationRequestFixtureId,
        'identityEnvelope',
        {
          displayName: '赵阿姨',
          mobilePhone: '13900000001',
          profileSnapshot: { gender: 'female', age: 70 },
        },
      ),
      reviewStatus: 'pending',
      credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    prisma.user.findFirst.mockResolvedValue({ id: 'existing-user-id' });

    await expect(
      service.reviewRegistrationRequest(
        doctorUser,
        registrationRequestFixtureId,
        {
          decision: 'approved',
          decisionReason: '资料完整',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.patientProfile.create).not.toHaveBeenCalled();
    expect(prisma.userRoleBinding.create).not.toHaveBeenCalled();
    expect(prisma.registrationRequest.update).not.toHaveBeenCalled();
  });
});

describe('AppService caregiver training privacy', () => {
  const caregiverSummaryPatientId = 'b9af87b5-849e-4dd9-966b-2fdb19ed37ec';
  const trainingResultId = '312b2531-089f-4d63-8e65-0e90d67e0c82';

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
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
    };
  }

  function mockActiveCaregiverAccess(
    prisma: ReturnType<typeof createService>['prisma'],
    scopeOverrides: Partial<{
      summary: boolean;
      reminders: boolean;
      progress: boolean;
      rawAssessment: boolean;
      planEdit: boolean;
    }> = {},
  ) {
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      userId: 'patient-user-id',
      responsibleDoctorId: 'doctor-profile-id',
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
        ...scopeOverrides,
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

  const technicalGameContent = {
    id: 'game-id',
    code: 'rhythm_reach_3d',
    name: '节奏触达',
    runtimeType: 'unity_webgl',
    manifestUrl: '/unity/rhythm_reach_3d/0.1.0/manifest.json',
    buildBaseUrl: '/unity/rhythm_reach_3d/0.1.0',
    gameVersion: '0.1.0',
    bridgeProtocolVersion: '1.0.0',
    buildStatus: 'released',
    releaseChannel: 'production',
    trainingTargets: ['上肢触达', '反应速度'],
    tags: ['上肢', '反应'],
    defaultDuration: 10,
    defaultDifficulty: '基础',
    supportsCamera: true,
    supportsMicrophone: false,
    supportedInputModes: ['camera_pose'],
    requiredMetrics: [{ metricType: 'reaction_time_ms', unit: 'ms' }],
    difficultyPolicy: { source: 'clinician_approved_plan' },
    dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
    requiredPermissions: ['camera_capture'],
    resultSchema: { schemaVersion: '1.0.0' },
    publishedStatus: 'published',
    licenseNotes: 'admin-only-license',
    sourceNotes: 'admin-only-source',
  };

  const technicalTrainingResult = {
    id: trainingResultId,
    score: 86,
    completionRate: 0.9,
    durationSeconds: 900,
    reactionTimeMs: 720,
    motionAccuracy: 0.82,
    exerciseIntensity: 'moderate',
    abnormalFlag: false,
    qualityFlag: 'valid',
    qualityReasons: [],
    reviewStatus: null,
    reviewConclusion: null,
    reviewEnvelope: null,
    reviewedByUserId: null,
    reviewedAt: null,
    metricsSummary: {
      rawDevicePayload: { providerPayload: 'sensitive' },
      rawPayloadHash: 'raw-payload-hash',
      dynamicDifficultyEvidence: { events: [{ runtimeFrameId: 'frame-001' }] },
    },
    createdAt: new Date('2026-05-14T08:10:00.000Z'),
  };

  const technicalTrainingSession = {
    id: 'session-id',
    patientId: 'patient-profile-id',
    rehabPlanId: 'plan-id',
    planItemId: 'plan-item-id',
    gameContentId: 'game-id',
    collectionBatchId: 'collection-batch-id',
    idempotencyKey: 'idempotency-key-001',
    gameRunId: 'run-001',
    clientStartedAt: new Date('2026-05-14T08:00:00.000Z'),
    clientEndedAt: new Date('2026-05-14T08:15:00.000Z'),
    deviceCode: 'camera-001',
    calibrationStatus: 'checked',
    runtimeConfigSnapshot: { manifestUrl: technicalGameContent.manifestUrl },
    unityBuildVersion: '0.1.0',
    bridgeProtocolVersion: '1.0.0',
    uploadAttemptCount: 2,
    lastUploadError: 'provider payload timeout',
    sessionStatus: 'completed',
    startedAt: new Date('2026-05-14T08:00:00.000Z'),
    endedAt: new Date('2026-05-14T08:15:00.000Z'),
    syncStatus: 'synced',
    interruptReason: null,
    motionMetrics: [
      {
        id: 'metric-id',
        metricType: 'reaction_time_ms',
        metricValue: 720,
        unit: 'ms',
        qualityFlag: 'valid',
        rawSummary: { joints: [1, 2, 3], providerPayload: 'raw-pose' },
      },
    ],
    gameContent: technicalGameContent,
    result: technicalTrainingResult,
  };

  const patientRecoveryContextKeys = [
    'patientId',
    'rehabPlanId',
    'planItemId',
    'gameContentId',
    'collectionBatchId',
    'gameRunId',
    'clientStartedAt',
    'deviceCode',
    'calibrationStatus',
    'runtimeConfigSnapshot',
    'unityBuildVersion',
    'bridgeProtocolVersion',
    'startedAt',
  ].sort();

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

  it('returns caregiver summary without raw training metrics or internal training ids', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:00:00.000Z');
    mockActiveCaregiverAccess(prisma);
    prisma.patientProfile.findUnique
      .mockResolvedValueOnce({
        id: caregiverSummaryPatientId,
        userId: 'patient-user-id',
        responsibleDoctorId: 'doctor-profile-id',
      })
      .mockResolvedValueOnce({
        id: caregiverSummaryPatientId,
        identityEnvelope: encryptedPatientField(
          caregiverSummaryPatientId,
          'identityEnvelope',
          { name: '李秀兰', gender: 'female', age: 72 },
        ),
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
      caregiverSummaryPatientId,
    );

    expect(result.recentTraining).toHaveLength(1);
    expect(result.recentTraining[0]).not.toHaveProperty('motionMetrics');
    expect(result.recentTraining[0]).not.toHaveProperty('id');
    expect(result.recentTraining[0]).not.toHaveProperty('planItemId');
    expect(result.recentTraining[0].result).not.toHaveProperty(
      'metricsSummary',
    );
    expect(result.recentTraining[0].result).not.toHaveProperty('id');
    expect(result.recentTraining[0].result).toMatchObject({
      score: 86,
      completionRate: 0.9,
      abnormalFlag: false,
    });
    const summaryQuery = mockArg<Record<string, unknown>>(
      prisma.patientProfile.findUnique,
      1,
    );
    expect(summaryQuery).toEqual({
      where: { id: caregiverSummaryPatientId },
      select: {
        id: true,
        identityEnvelope: true,
        riskGrades: {
          where: { isCurrent: true },
          take: 1,
          select: { riskLevel: true },
        },
        rehabPlans: {
          where: { isCurrent: true },
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              orderBy: { sequence: 'asc' },
              include: { gameContent: true },
            },
          },
          take: 1,
        },
        trainingSessions: {
          orderBy: { startedAt: 'desc' },
          take: 7,
          include: {
            result: {
              select: {
                score: true,
                completionRate: true,
                durationSeconds: true,
                reactionTimeMs: true,
                motionAccuracy: true,
                exerciseIntensity: true,
                abnormalFlag: true,
                createdAt: true,
              },
            },
            gameContent: true,
          },
        },
      },
    });
    expect(JSON.stringify(summaryQuery)).not.toMatch(
      /reasonEnvelope|reasonSummary|reviewEnvelope|reviewNote/,
    );
  });

  it('hides caregiver training progress when progress scope is not authorized', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:00:00.000Z');
    mockActiveCaregiverAccess(prisma, { progress: false });
    prisma.patientProfile.findUnique
      .mockResolvedValueOnce({
        id: caregiverSummaryPatientId,
        userId: 'patient-user-id',
        responsibleDoctorId: 'doctor-profile-id',
      })
      .mockResolvedValueOnce({
        id: caregiverSummaryPatientId,
        identityEnvelope: encryptedPatientField(
          caregiverSummaryPatientId,
          'identityEnvelope',
          { name: '李秀兰', gender: 'female', age: 72 },
        ),
        riskGrades: [{ riskLevel: 'moderate' }],
        rehabPlans: [],
        trainingSessions: [
          {
            id: 'session-id',
            patientId: 'patient-profile-id',
            sessionStatus: 'completed',
            startedAt: createdAt,
            gameContent: {
              id: 'game-id',
              name: '记忆卡片',
              trainingTargets: ['memory'],
              tags: ['低强度'],
            },
            result: {
              id: 'result-id',
              score: 86,
              completionRate: 0.9,
              abnormalFlag: false,
              createdAt,
            },
          },
        ],
      });

    const result = await service.caregiverSummary(
      caregiverUser,
      caregiverSummaryPatientId,
    );

    expect(result.recentTraining).toEqual([]);
  });

  it('keeps completed patient training records on the existing redacted shape', async () => {
    const { prisma, service } = createService();
    prisma.trainingSession.findMany.mockResolvedValue([
      technicalTrainingSession,
    ]);

    const result = await service.listTrainingRecords(
      patientUser,
      'patient-profile-id',
    );
    const payload = JSON.stringify(result);

    expect(result.sessions).toHaveLength(1);
    expect(Object.keys(result.sessions[0]).sort()).toEqual(
      [
        'id',
        'planItemId',
        'calibrationStatus',
        'sessionStatus',
        'startedAt',
        'endedAt',
        'interruptReason',
        'syncStatus',
        'gameContent',
        'result',
      ].sort(),
    );
    expect(result.sessions[0]).toMatchObject({
      id: 'session-id',
      planItemId: 'plan-item-id',
      sessionStatus: 'completed',
      gameContent: {
        id: 'game-id',
        name: '节奏触达',
        trainingTargets: ['上肢触达', '反应速度'],
      },
      result: {
        id: trainingResultId,
        score: 86,
        completionRate: 0.9,
        abnormalFlag: false,
        qualityFlag: 'valid',
      },
    });
    for (const forbidden of [
      'rawDevicePayload',
      'rawPayloadHash',
      'dynamicDifficultyEvidence',
      'joints',
      'providerPayload',
      'runtimeConfigSnapshot',
      'collectionBatchId',
      'idempotencyKey',
      'gameRunId',
      'deviceCode',
      'lastUploadError',
      'manifestUrl',
      'buildBaseUrl',
      'bridgeProtocolVersion',
      'resultSchema',
      'requiredMetrics',
      'difficultyPolicy',
      'licenseNotes',
      'sourceNotes',
    ]) {
      expect(payload).not.toContain(forbidden);
    }
  });

  it('returns exact recovery context only for an active patient training record', async () => {
    const { prisma, service } = createService();
    const activeTrainingSession = {
      ...technicalTrainingSession,
      id: 'active-session-id',
      collectionBatchId: null,
      gameRunId: null,
      clientStartedAt: null,
      bridgeProtocolVersion: null,
      sessionStatus: 'in_progress',
      result: null,
      endedAt: null,
      clientEndedAt: null,
    };
    prisma.trainingSession.findMany.mockResolvedValue([
      activeTrainingSession,
      technicalTrainingSession,
    ]);

    const result = await service.listTrainingRecords(
      patientUser,
      'patient-profile-id',
    );
    const activeRecord = result.sessions[0] as unknown as Record<
      string,
      unknown
    >;
    const completedRecord = result.sessions[1] as unknown as Record<
      string,
      unknown
    >;

    expect(activeRecord).toHaveProperty('recoveryContext');
    const recoveryContext = activeRecord.recoveryContext as Record<
      string,
      unknown
    >;
    expect(Object.keys(recoveryContext).sort()).toEqual(
      patientRecoveryContextKeys,
    );
    expect(recoveryContext).toEqual({
      patientId: activeTrainingSession.patientId,
      rehabPlanId: activeTrainingSession.rehabPlanId,
      planItemId: activeTrainingSession.planItemId,
      gameContentId: activeTrainingSession.gameContentId,
      collectionBatchId: activeTrainingSession.collectionBatchId,
      gameRunId: activeTrainingSession.gameRunId,
      clientStartedAt: activeTrainingSession.clientStartedAt,
      deviceCode: activeTrainingSession.deviceCode,
      calibrationStatus: activeTrainingSession.calibrationStatus,
      runtimeConfigSnapshot: activeTrainingSession.runtimeConfigSnapshot,
      unityBuildVersion: activeTrainingSession.unityBuildVersion,
      bridgeProtocolVersion: activeTrainingSession.bridgeProtocolVersion,
      startedAt: activeTrainingSession.startedAt,
    });
    expect(JSON.stringify(recoveryContext)).not.toMatch(
      /idempotencyKey|lastUploadError|rawPayload|motionMetrics/,
    );
    expect(completedRecord).not.toHaveProperty('recoveryContext');
    expect(completedRecord).not.toHaveProperty('runtimeConfigSnapshot');
  });

  it('keeps doctor training records with technical evidence for clinical review', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.trainingSession.findMany.mockResolvedValue([
      technicalTrainingSession,
    ]);

    const result = await service.listTrainingRecords(
      doctorUser,
      'patient-profile-id',
    );
    const payload = JSON.stringify(result);

    expect(payload).toContain('rawPayloadHash');
    expect(payload).toContain('runtimeConfigSnapshot');
    expect(payload).toContain('joints');
    const doctorTrainingSession = result.sessions[0];
    if (!('motionMetrics' in doctorTrainingSession)) {
      throw new Error('医生训练记录缺少临床复核动作证据。');
    }
    const motionMetrics = doctorTrainingSession.motionMetrics;
    if (!Array.isArray(motionMetrics)) {
      throw new Error('医生训练记录动作证据格式无效。');
    }
    expect(motionMetrics[0]).toMatchObject({
      rawSummary: { joints: [1, 2, 3] },
    });
  });

  it.each([
    ['patient progress', patientUser],
    ['doctor list', doctorUser],
  ])(
    'decrypts a reviewed training note for %s without exposing its envelope',
    async (_label, actor) => {
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      prisma.trainingSession.findMany.mockResolvedValue([
        {
          ...technicalTrainingSession,
          result: {
            ...technicalTrainingResult,
            reviewStatus: 'reviewed',
            reviewConclusion: 'accepted_valid',
            reviewEnvelope: encryptedTrainingReviewField(
              trainingResultId,
              '医生确认本次训练有效。',
            ),
            reviewedByUserId: 'doctor-user-id',
            reviewedAt: new Date('2026-07-15T02:00:00.000Z'),
          },
        },
      ]);

      const result = await service.listTrainingRecords(
        actor,
        'patient-profile-id',
      );

      expect(result.sessions[0].result).toMatchObject({
        id: trainingResultId,
        reviewNote: '医生确认本次训练有效。',
      });
      expect(JSON.stringify(result)).not.toMatch(/reviewEnvelope|ciphertext/);
    },
  );

  it.each([
    ['missing', null],
    [
      'tampered',
      (() => {
        const envelope = encryptedTrainingReviewField(
          trainingResultId,
          '医生确认本次训练有效。',
        );
        return {
          ...envelope,
          ciphertext: `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}`,
        };
      })(),
    ],
    [
      'wrong-key',
      encryptedTrainingReviewField(trainingResultId, '医生确认本次训练有效。', {
        ...testSensitiveEncryptionKey,
        key: Buffer.alloc(32, 17),
      }),
    ],
  ])(
    'hard-fails reviewed training list reads for a %s envelope',
    async (_label, reviewEnvelope) => {
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      prisma.trainingSession.findMany.mockResolvedValue([
        {
          ...technicalTrainingSession,
          result: {
            ...technicalTrainingResult,
            reviewStatus: 'reviewed',
            reviewConclusion: 'accepted_valid',
            reviewEnvelope,
            reviewedByUserId: 'doctor-user-id',
            reviewedAt: new Date('2026-07-15T02:00:00.000Z'),
          },
        },
      ]);

      await expect(
        service.listTrainingRecords(doctorUser, 'patient-profile-id'),
      ).rejects.toThrow();
    },
  );

  it('returns caregiver summary without technical plan and game metadata', async () => {
    const { prisma, service } = createService();
    mockActiveCaregiverAccess(prisma);
    prisma.patientProfile.findUnique
      .mockResolvedValueOnce({
        id: caregiverSummaryPatientId,
        userId: 'patient-user-id',
        responsibleDoctorId: 'doctor-profile-id',
      })
      .mockResolvedValueOnce({
        id: caregiverSummaryPatientId,
        identityEnvelope: encryptedPatientField(
          caregiverSummaryPatientId,
          'identityEnvelope',
          { name: '李秀兰', gender: 'female', age: 72 },
        ),
        riskGrades: [{ riskLevel: 'moderate' }],
        rehabPlans: [
          {
            id: 'plan-id',
            patientId: 'patient-profile-id',
            planName: '上肢训练计划',
            status: 'active',
            isCurrent: true,
            weekFrequency: 4,
            dailyDuration: 20,
            difficultyLadder: { internal: 'clinician-only' },
            recommendationReason: 'clinical internal note',
            items: [
              {
                id: 'plan-item-id',
                rehabPlanId: 'plan-id',
                gameContentId: 'game-id',
                sequence: 1,
                durationMinutes: 10,
                frequencyPerWeek: 4,
                difficulty: '基础',
                adaptiveRules: { source: 'clinician_approved_plan' },
                gameContent: technicalGameContent,
              },
            ],
          },
        ],
        trainingSessions: [technicalTrainingSession],
      });

    const result = await service.caregiverSummary(
      caregiverUser,
      caregiverSummaryPatientId,
    );
    const payload = JSON.stringify(result);

    expect(result.currentPlan).toMatchObject({
      id: 'plan-id',
      planName: '上肢训练计划',
      dailyDuration: 20,
      weekFrequency: 4,
      items: [
        objectContaining({
          durationMinutes: 10,
          frequencyPerWeek: 4,
          difficulty: '基础',
          gameContent: objectContaining({
            id: 'game-id',
            name: '节奏触达',
          }),
        }),
      ],
    });
    expect(result.recentTraining[0].gameContent).toMatchObject({
      id: 'game-id',
      name: '节奏触达',
      trainingTargets: ['上肢触达', '反应速度'],
    });
    expect(result.currentPlan?.items[0]).not.toHaveProperty('id');
    for (const forbidden of [
      'plan-item-id',
      'difficultyLadder',
      'recommendationReason',
      'adaptiveRules',
      'manifestUrl',
      'buildBaseUrl',
      'gameVersion',
      'bridgeProtocolVersion',
      'requiredMetrics',
      'difficultyPolicy',
      'resultSchema',
      'dynamicDifficultyTriggers',
      'requiredPermissions',
      'publishedStatus',
      'rawPayloadHash',
      'qualityFlag',
      'providerPayload',
      'licenseNotes',
      'sourceNotes',
    ]) {
      expect(payload).not.toContain(forbidden);
    }
  });
});

describe('AppService reward summaries', () => {
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
      rewardLedger: {
        findMany: jest.fn(),
      },
      achievement: {
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    return {
      prisma,
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
    };
  }

  it('returns patient reward totals and achievements from backend ledger', async () => {
    const { prisma, service } = createService();
    const issuedAt = new Date('2026-05-20T06:30:00.000Z');
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.rewardLedger.findMany.mockResolvedValue([
      {
        id: 'ledger-id',
        patientId: 'patient-profile-id',
        points: 10,
        status: 'issued',
        eventType: 'training_result.valid_completed',
        issuedAt,
        rule: {
          code: 'valid_training_completion',
          name: '完成一次有效训练',
        },
        trainingResult: {
          id: 'result-id',
          score: 92,
          qualityFlag: 'valid',
          abnormalFlag: false,
        },
      },
    ]);
    prisma.achievement.findMany.mockResolvedValue([
      {
        id: 'achievement-id',
        patientId: 'patient-profile-id',
        code: 'first_valid_training',
        name: '首次有效训练',
        progress: 1,
        target: 1,
        unlockedAt: issuedAt,
      },
    ]);

    const summary = await (
      service as AppService & {
        listPatientRewards: (
          user: RequestUser,
          patientId: string,
        ) => Promise<{
          totalPoints: number;
          ledger: unknown[];
          achievements: unknown[];
        }>;
      }
    ).listPatientRewards(patientUser, 'patient-profile-id');

    expect(summary.totalPoints).toBe(10);
    expect(summary.ledger).toHaveLength(1);
    expect(summary.achievements).toHaveLength(1);
    expect(JSON.stringify(summary)).not.toContain('evidence');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        action: 'reward.summary.view',
        targetType: 'patient_profile',
        targetId: 'patient-profile-id',
        result: 'success',
      }),
    });
  });
});

describe('AppService family care circle privacy', () => {
  const patientAuthorUserId = 'cb600462-445f-4126-8e4f-836c4214cc4c';
  const caregiverAuthorUserId = 'a215d3c9-901f-45a7-8ee3-5cd83159ef24';
  const postId = '8377f155-74e6-43cc-bbe4-cf47cc371b30';
  const commentId = '708d599c-6477-4987-b0bc-7309510894f8';
  const precautionId = '8ca03484-232b-457a-b2f1-c3cc90c32017';

  function careEnvelopeFailure(
    tableName: 'care_circle_post' | 'care_circle_comment' | 'care_precaution',
    recordId: string,
    fieldName: 'contentEnvelope' | 'moderationEnvelope',
    payload: Record<string, unknown>,
    failureMode: 'missing' | 'tampered' | 'wrong-key',
  ) {
    const wrongKey: SensitiveEncryptionKey = {
      kid: 'secret-manager://rehab/wrong-sensitive-key',
      key: Buffer.alloc(32, 12),
    };
    const envelope = encryptedCareField(
      tableName,
      recordId,
      fieldName,
      payload,
      failureMode === 'wrong-key' ? wrongKey : testSensitiveEncryptionKey,
    );
    if (failureMode === 'missing') return null;
    return failureMode === 'tampered'
      ? { ...envelope, ciphertext: `${envelope.ciphertext}A` }
      : envelope;
  }

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
      careCirclePost: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      careCircleComment: {
        create: jest.fn(),
      },
      carePrecaution: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      (callback: (client: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );

    return {
      prisma,
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
    };
  }

  function mockActiveCaregiverAccess(
    prisma: ReturnType<typeof createService>['prisma'],
    scopeOverrides: Partial<{
      summary: boolean;
      reminders: boolean;
      progress: boolean;
      rawAssessment: boolean;
      planEdit: boolean;
    }> = {},
  ) {
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      userId: 'patient-user-id',
      responsibleDoctorId: 'doctor-profile-id',
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
        ...scopeOverrides,
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

  it('allows authorized caregivers to list visible desensitized posts and published precautions', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:00:00.000Z');
    mockActiveCaregiverAccess(prisma);
    prisma.careCirclePost.findMany.mockResolvedValue([
      {
        id: postId,
        patientId: 'patient-profile-id',
        authorUserId: patientAuthorUserId,
        contentEnvelope: encryptedCareField(
          'care_circle_post',
          postId,
          'contentEnvelope',
          {
            body: '今天按时完成训练，心情不错。',
            mood: 'positive',
            privateMetadata: null,
          },
        ),
        moderationEnvelope: encryptedCareField(
          'care_circle_post',
          postId,
          'moderationEnvelope',
          { moderationReason: '患者和家属不可见的内部处理原因' },
        ),
        moderationStatus: 'visible',
        createdAt,
        author: {
          id: patientAuthorUserId,
          identityEnvelope: encryptedUserIdentity(patientAuthorUserId, {
            displayName: '李秀兰',
            mobilePhone: null,
          }),
        },
        comments: [
          {
            id: commentId,
            contentEnvelope: encryptedCareField(
              'care_circle_comment',
              commentId,
              'contentEnvelope',
              {
                body: '辛苦啦，晚饭后注意休息。',
                privateMetadata: null,
              },
            ),
            createdAt,
            author: {
              id: caregiverAuthorUserId,
              identityEnvelope: encryptedUserIdentity(caregiverAuthorUserId, {
                displayName: '李明',
                mobilePhone: null,
              }),
            },
          },
        ],
        reactions: [{ reactionType: 'encourage' }],
      },
    ]);
    prisma.carePrecaution.findMany.mockResolvedValue([
      {
        id: precautionId,
        contentEnvelope: encryptedCareField(
          'care_precaution',
          precautionId,
          'contentEnvelope',
          {
            title: '训练前确认周围无障碍物',
            content: '请站稳后再开始上肢触达训练。',
          },
        ),
        category: 'safety',
        priority: 'high',
        status: 'published',
        publishedAt: createdAt,
      },
    ]);

    const result = await (
      service as AppService & {
        listCareCirclePosts: (
          user: RequestUser,
          patientId: string,
        ) => Promise<{ posts: unknown[]; precautions: unknown[] }>;
      }
    ).listCareCirclePosts(caregiverUser, 'patient-profile-id');

    expect(prisma.careCirclePost.findMany).toHaveBeenCalledWith(
      objectContaining({
        where: {
          patientId: 'patient-profile-id',
          moderationStatus: 'visible',
        },
      }),
    );
    expect(prisma.carePrecaution.findMany).toHaveBeenCalledWith(
      objectContaining({
        where: {
          patientId: 'patient-profile-id',
          status: 'published',
        },
      }),
    );
    expect(JSON.stringify(result)).toContain('今天按时完成训练');
    expect(JSON.stringify(result)).not.toContain('patient001');
    expect(JSON.stringify(result)).not.toContain('13900000001');
    expect(JSON.stringify(result)).not.toContain('authorUserId');
    expect(JSON.stringify(result)).not.toContain('contentEnvelope');
    expect(JSON.stringify(result)).not.toContain('moderationEnvelope');
    expect(JSON.stringify(result)).not.toContain(
      '患者和家属不可见的内部处理原因',
    );
    expect(result.precautions).toHaveLength(1);
    expect(
      JSON.stringify(mockCalls(prisma.careCirclePost.findMany)),
    ).not.toMatch(
      /"body":true|"mood":true|"privateMetadata":true|"moderationReason":true/,
    );
    expect(
      JSON.stringify(mockCalls(prisma.carePrecaution.findMany)),
    ).not.toMatch(/"title":true|"content":true/);
  });

  it('hides published precautions when reminder scope is not authorized', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:00:00.000Z');
    mockActiveCaregiverAccess(prisma, { reminders: false });
    prisma.careCirclePost.findMany.mockResolvedValue([
      {
        id: postId,
        patientId: 'patient-profile-id',
        contentEnvelope: encryptedCareField(
          'care_circle_post',
          postId,
          'contentEnvelope',
          {
            body: '今天按时完成训练。',
            mood: 'positive',
            privateMetadata: null,
          },
        ),
        moderationEnvelope: null,
        moderationStatus: 'visible',
        createdAt,
        author: {
          id: caregiverAuthorUserId,
          identityEnvelope: encryptedUserIdentity(caregiverAuthorUserId, {
            displayName: '李明',
            mobilePhone: null,
          }),
        },
        comments: [],
        reactions: [],
      },
    ]);
    prisma.carePrecaution.findMany.mockRejectedValue(
      new Error('reminder query should not run'),
    );

    const result = await (
      service as AppService & {
        listCareCirclePosts: (
          user: RequestUser,
          patientId: string,
        ) => Promise<{ posts: unknown[]; precautions: unknown[] }>;
      }
    ).listCareCirclePosts(caregiverUser, 'patient-profile-id');

    expect(result.posts).toHaveLength(1);
    expect(result.precautions).toEqual([]);
    expect(prisma.carePrecaution.findMany).not.toHaveBeenCalled();
  });

  it('never exposes a visible post moderation reason to the patient summary reader', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:00:00.000Z');
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      userId: 'patient-user-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.careCirclePost.findMany.mockResolvedValue([
      {
        id: postId,
        contentEnvelope: encryptedCareField(
          'care_circle_post',
          postId,
          'contentEnvelope',
          { body: '患者可见动态', mood: null, privateMetadata: null },
        ),
        moderationEnvelope: encryptedCareField(
          'care_circle_post',
          postId,
          'moderationEnvelope',
          { moderationReason: '患者不可见的内部原因' },
        ),
        moderationStatus: 'visible',
        createdAt,
        author: null,
        comments: [],
        reactions: [],
      },
    ]);
    prisma.carePrecaution.findMany.mockResolvedValue([]);

    const result = await service.listCareCirclePosts(
      patientUser,
      'patient-profile-id',
    );

    expect(JSON.stringify(result)).toContain('患者可见动态');
    expect(JSON.stringify(result)).not.toContain('患者不可见的内部原因');
    expect(JSON.stringify(result)).not.toContain('moderationReason');
  });

  it('denies revoked caregivers before listing care-circle content', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      userId: 'patient-user-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.caregiverRelation.findFirst.mockResolvedValue(null);
    prisma.consentRecord.findFirst.mockResolvedValue(null);

    await expect(
      (
        service as AppService & {
          listCareCirclePosts: (
            user: RequestUser,
            patientId: string,
          ) => Promise<unknown>;
        }
      ).listCareCirclePosts(caregiverUser, 'patient-profile-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.careCirclePost.findMany).not.toHaveBeenCalled();
    expect(prisma.carePrecaution.findMany).not.toHaveBeenCalled();
  });

  it('creates posts and comments with exact row-bound envelopes and no legacy plaintext writes', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:00:00.000Z');
    mockActiveCaregiverAccess(prisma);
    prisma.careCirclePost.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...data,
          moderationEnvelope: null,
          createdAt,
        }),
    );
    prisma.careCirclePost.findUnique.mockResolvedValue({
      id: postId,
      patientId: 'patient-profile-id',
      moderationStatus: 'visible',
      patient: {
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      },
    });
    prisma.careCircleComment.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...data,
          createdAt,
        }),
    );

    const createdPost = await (
      service as AppService & {
        createCareCirclePost: (
          user: RequestUser,
          patientId: string,
          dto: { body: string; mood?: string; privateMetadata?: unknown },
        ) => Promise<unknown>;
        createCareCircleComment: (
          user: RequestUser,
          postId: string,
          dto: { body: string; privateMetadata?: unknown },
        ) => Promise<unknown>;
      }
    ).createCareCirclePost(caregiverUser, 'patient-profile-id', {
      body: '妈妈今天主动完成训练。',
      mood: 'encouragement',
      privateMetadata: {
        caregiverPhone: '13900000001',
        homeAddress: '一号楼 302',
      },
    });
    const createdComment = await (
      service as AppService & {
        createCareCircleComment: (
          user: RequestUser,
          postId: string,
          dto: { body: string; privateMetadata?: unknown },
        ) => Promise<unknown>;
      }
    ).createCareCircleComment(caregiverUser, postId, {
      body: '继续加油，注意休息。',
      privateMetadata: {
        caregiverPhone: '13900000002',
        contactNote: '晚饭后复查血压',
      },
    });

    const postCreateData = mockArg<{
      data: Record<string, unknown> & { id: string };
    }>(prisma.careCirclePost.create).data;
    const commentCreateData = mockArg<{
      data: Record<string, unknown> & { id: string };
    }>(prisma.careCircleComment.create).data;
    expect(postCreateData.contentEnvelope).toMatchObject({
      alg: 'AES-256-GCM',
      kid: 'secret-manager://rehab/unit-sensitive-key',
      contentType: 'application/json',
    });
    expect(commentCreateData.contentEnvelope).toMatchObject({
      alg: 'AES-256-GCM',
      kid: 'secret-manager://rehab/unit-sensitive-key',
      contentType: 'application/json',
    });
    expect(postCreateData).not.toHaveProperty('body');
    expect(postCreateData).not.toHaveProperty('mood');
    expect(postCreateData).not.toHaveProperty('privateMetadata');
    expect(commentCreateData).not.toHaveProperty('body');
    expect(commentCreateData).not.toHaveProperty('privateMetadata');
    expect(
      decryptSensitiveJson(
        postCreateData.contentEnvelope,
        {
          tableName: 'care_circle_post',
          recordId: postCreateData.id,
          fieldName: 'contentEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      body: '妈妈今天主动完成训练。',
      mood: 'encouragement',
      privateMetadata: {
        caregiverPhone: '13900000001',
        homeAddress: '一号楼 302',
      },
    });
    expect(
      decryptSensitiveJson(
        commentCreateData.contentEnvelope,
        {
          tableName: 'care_circle_comment',
          recordId: commentCreateData.id,
          fieldName: 'contentEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      body: '继续加油，注意休息。',
      privateMetadata: {
        caregiverPhone: '13900000002',
        contactNote: '晚饭后复查血压',
      },
    });
    expect(JSON.stringify(postCreateData.contentEnvelope)).not.toContain(
      '13900000001',
    );
    expect(JSON.stringify(postCreateData.contentEnvelope)).not.toContain(
      '一号楼',
    );
    expect(JSON.stringify(commentCreateData.contentEnvelope)).not.toContain(
      '13900000002',
    );
    expect(JSON.stringify(commentCreateData.contentEnvelope)).not.toContain(
      '晚饭后复查血压',
    );
    expect(JSON.stringify(createdPost)).toContain('妈妈今天主动完成训练');
    expect(JSON.stringify(createdComment)).toContain('继续加油');
    expect(JSON.stringify(createdPost)).not.toContain('Envelope');
    expect(JSON.stringify(createdComment)).not.toContain('Envelope');

    const auditPayload = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(auditPayload).toContain('care_circle.post.create');
    expect(auditPayload).toContain('care_circle.comment.create');
    expect(auditPayload).not.toContain('妈妈今天主动完成训练');
    expect(auditPayload).not.toContain('继续加油');
    expect(auditPayload).not.toContain('encouragement');
    expect(auditPayload).not.toContain('13900000001');
    expect(auditPayload).not.toContain('13900000002');
    expect(auditPayload).not.toContain('一号楼 302');
    expect(auditPayload).not.toContain('晚饭后复查血压');
    expect(auditPayload).not.toMatch(
      /contentEnvelope|moderationEnvelope|ciphertext|nonce|tag/,
    );
  });

  it('allows doctors to hide inappropriate posts from caregiver lists', async () => {
    const { prisma, service } = createService();
    prisma.careCirclePost.findUnique.mockResolvedValue({
      id: postId,
      patientId: 'patient-profile-id',
      moderationStatus: 'visible',
      patient: {
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      },
    });
    prisma.careCirclePost.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: postId,
          contentEnvelope: encryptedCareField(
            'care_circle_post',
            postId,
            'contentEnvelope',
            {
              body: '包含不适合展示的联系方式。',
              mood: null,
              privateMetadata: null,
            },
          ),
          moderationStatus: data.moderationStatus,
          moderationEnvelope: data.moderationEnvelope,
          createdAt: new Date('2026-05-14T08:00:00.000Z'),
        }),
    );

    const moderated = await (
      service as AppService & {
        moderateCareCirclePost: (
          user: RequestUser,
          postId: string,
          dto: { moderationStatus: string; reason?: string },
        ) => Promise<{ moderationStatus: string }>;
      }
    ).moderateCareCirclePost(doctorUser, postId, {
      moderationStatus: 'hidden',
      reason: '包含联系方式',
    });

    expect(moderated.moderationStatus).toBe('hidden');
    expect(JSON.stringify(moderated)).not.toContain('包含联系方式');
    expect(JSON.stringify(moderated)).not.toContain('Envelope');
    expect(prisma.careCirclePost.update).toHaveBeenCalledWith({
      where: { id: postId },
      data: objectContaining({
        moderationStatus: 'hidden',
        moderatedByUserId: 'doctor-user-id',
      }),
      select: anyValue(Object),
    });
    const updateData = mockArg<{ data: Record<string, unknown> }>(
      prisma.careCirclePost.update,
    ).data;
    expect(updateData).not.toHaveProperty('moderationReason');
    expect(
      decryptSensitiveJson(
        updateData.moderationEnvelope,
        {
          tableName: 'care_circle_post',
          recordId: postId,
          fieldName: 'moderationEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({ moderationReason: '包含联系方式' });
    const auditPayload = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(auditPayload).not.toContain('包含不适合展示的联系方式');
    expect(auditPayload).not.toContain('包含联系方式');
    expect(auditPayload).not.toMatch(
      /contentEnvelope|moderationEnvelope|ciphertext|nonce|tag/,
    );
  });

  it('creates precautions with a pre-generated UUID and one exact content envelope', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T08:00:00.000Z');
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.carePrecaution.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...data,
          createdAt,
        }),
    );

    const result = await (
      service as AppService & {
        createCarePrecaution: (
          user: RequestUser,
          dto: {
            patientId: string;
            title: string;
            content: string;
            category: string;
            priority: string;
            status: string;
          },
        ) => Promise<unknown>;
      }
    ).createCarePrecaution(doctorUser, {
      patientId: 'patient-profile-id',
      title: '训练前确认周围无障碍物',
      content: '请站稳后再开始上肢触达训练。',
      category: 'safety',
      priority: 'high',
      status: 'published',
    });

    const createData = mockArg<{
      data: Record<string, unknown> & { id: string };
    }>(prisma.carePrecaution.create).data;
    expect(createData.id).toEqual(stringMatching(/^[0-9a-f-]{36}$/));
    expect(createData).not.toHaveProperty('title');
    expect(createData).not.toHaveProperty('content');
    expect(
      decryptSensitiveJson(
        createData.contentEnvelope,
        {
          tableName: 'care_precaution',
          recordId: createData.id,
          fieldName: 'contentEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      title: '训练前确认周围无障碍物',
      content: '请站稳后再开始上肢触达训练。',
    });
    expect(JSON.stringify(result)).toContain('训练前确认周围无障碍物');
    expect(JSON.stringify(result)).not.toContain('Envelope');
    const auditPayload = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(auditPayload).not.toContain('训练前确认周围无障碍物');
    expect(auditPayload).not.toContain('请站稳后再开始');
    expect(auditPayload).not.toMatch(
      /contentEnvelope|moderationEnvelope|ciphertext|nonce|tag/,
    );
  });

  it.each(['missing', 'tampered', 'wrong-key'] as const)(
    'hard-fails care-circle reads for a %s content envelope',
    async (failureMode) => {
      const { prisma, service } = createService();
      mockActiveCaregiverAccess(prisma);
      const contentEnvelope = careEnvelopeFailure(
        'care_circle_post',
        postId,
        'contentEnvelope',
        {
          body: '只应由正确密钥解密。',
          mood: null,
          privateMetadata: null,
        },
        failureMode,
      );
      prisma.careCirclePost.findMany.mockResolvedValue([
        {
          id: postId,
          contentEnvelope,
          moderationEnvelope: null,
          moderationStatus: 'visible',
          createdAt: new Date('2026-05-14T08:00:00.000Z'),
          author: null,
          comments: [],
          reactions: [],
        },
      ]);
      prisma.carePrecaution.findMany.mockResolvedValue([]);

      await expect(
        (
          service as AppService & {
            listCareCirclePosts: (
              user: RequestUser,
              patientId: string,
            ) => Promise<unknown>;
          }
        ).listCareCirclePosts(caregiverUser, 'patient-profile-id'),
      ).rejects.toThrow();
    },
  );

  it.each(['missing', 'tampered', 'wrong-key'] as const)(
    'hard-fails care-circle reads for a %s comment content envelope',
    async (failureMode) => {
      const { prisma, service } = createService();
      mockActiveCaregiverAccess(prisma);
      prisma.careCirclePost.findMany.mockResolvedValue([
        {
          id: postId,
          contentEnvelope: encryptedCareField(
            'care_circle_post',
            postId,
            'contentEnvelope',
            { body: '可见动态', mood: null, privateMetadata: null },
          ),
          moderationEnvelope: null,
          moderationStatus: 'visible',
          createdAt: new Date('2026-05-14T08:00:00.000Z'),
          author: null,
          comments: [
            {
              id: commentId,
              contentEnvelope: careEnvelopeFailure(
                'care_circle_comment',
                commentId,
                'contentEnvelope',
                { body: '不可容忍坏信封的评论', privateMetadata: null },
                failureMode,
              ),
              moderationStatus: 'visible',
              createdAt: new Date('2026-05-14T08:01:00.000Z'),
              author: null,
            },
          ],
          reactions: [],
        },
      ]);
      prisma.carePrecaution.findMany.mockResolvedValue([]);

      await expect(
        service.listCareCirclePosts(caregiverUser, 'patient-profile-id'),
      ).rejects.toThrow();
    },
  );

  it.each(['missing', 'tampered', 'wrong-key'] as const)(
    'enforces the optional contract for a %s post moderation envelope',
    async (failureMode) => {
      const { prisma, service } = createService();
      mockActiveCaregiverAccess(prisma);
      prisma.careCirclePost.findMany.mockResolvedValue([
        {
          id: postId,
          contentEnvelope: encryptedCareField(
            'care_circle_post',
            postId,
            'contentEnvelope',
            { body: '可见动态', mood: null, privateMetadata: null },
          ),
          moderationEnvelope: careEnvelopeFailure(
            'care_circle_post',
            postId,
            'moderationEnvelope',
            { moderationReason: '内部处理原因' },
            failureMode,
          ),
          moderationStatus: 'visible',
          createdAt: new Date('2026-05-14T08:00:00.000Z'),
          author: null,
          comments: [],
          reactions: [],
        },
      ]);
      prisma.carePrecaution.findMany.mockResolvedValue([]);

      const request = service.listCareCirclePosts(
        caregiverUser,
        'patient-profile-id',
      );
      if (failureMode === 'missing') {
        await expect(request).resolves.toMatchObject({
          posts: [{ id: postId }],
        });
      } else {
        await expect(request).rejects.toThrow();
      }
    },
  );

  it.each(['missing', 'tampered', 'wrong-key'] as const)(
    'hard-fails care-circle reads for a %s precaution content envelope',
    async (failureMode) => {
      const { prisma, service } = createService();
      mockActiveCaregiverAccess(prisma);
      prisma.careCirclePost.findMany.mockResolvedValue([]);
      prisma.carePrecaution.findMany.mockResolvedValue([
        {
          id: precautionId,
          contentEnvelope: careEnvelopeFailure(
            'care_precaution',
            precautionId,
            'contentEnvelope',
            { title: '安全提醒', content: '不可容忍坏信封的注意事项' },
            failureMode,
          ),
          category: 'safety',
          priority: 'high',
          status: 'published',
          publishedAt: new Date('2026-05-14T08:00:00.000Z'),
          createdAt: new Date('2026-05-14T08:00:00.000Z'),
        },
      ]);

      await expect(
        service.listCareCirclePosts(caregiverUser, 'patient-profile-id'),
      ).rejects.toThrow();
    },
  );
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
      updateMany: jest.Mock;
    };
    rehabPlan: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    planAdjustmentRecord: {
      create: jest.Mock;
    };
    gameContent: {
      findUnique: jest.Mock;
    };
    collectionCondition: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    collectionProtocol: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
    };
    collectionBatch: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
    };
    trainingSession: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    trainingResult: {
      create: jest.Mock;
    };
    rewardRule: {
      findMany: jest.Mock;
    };
    rewardLedger: {
      upsert: jest.Mock;
      findMany: jest.Mock;
    };
    riskGradeRecord: {
      findFirst: jest.Mock;
    };
    achievement: {
      upsert: jest.Mock;
      findMany: jest.Mock;
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
        updateMany: jest.fn(),
      },
      rehabPlan: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      planAdjustmentRecord: {
        create: jest.fn(),
      },
      gameContent: {
        findUnique: jest.fn(),
      },
      collectionCondition: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      collectionProtocol: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      collectionBatch: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
      trainingSession: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      trainingResult: {
        create: jest.fn(),
      },
      rewardRule: {
        findMany: jest.fn(),
      },
      rewardLedger: {
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      riskGradeRecord: {
        findFirst: jest.fn(),
      },
      achievement: {
        upsert: jest.fn(),
        findMany: jest.fn(),
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
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
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
    difficultyPolicy: {
      source: 'clinician_approved_plan',
      safetyLimits: { minLevel: 1, maxLevel: 3 },
    },
    dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
    requiredPermissions: ['camera_capture'],
    resultSchema: {
      schemaVersion: '1.0.0',
      dynamicDifficultyEvidence: 'required',
    },
    publishedStatus: 'published',
    requiredMetrics: [
      { metricType: 'reaction_time_ms', unit: 'ms', min: 0, max: 60000 },
      { metricType: 'target_hit_rate', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'arm_raise_accuracy', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'duration_seconds', unit: 'seconds', min: 1, max: 3600 },
      { metricType: 'difficulty_level', unit: 'level', min: 1, max: 3 },
    ],
  };

  const formalCollectionCondition = {
    id: 'condition-id',
    code: 'clinic_light_standing',
    name: '诊室标准光照站姿',
    description: '标准诊室光照、1.5 米站姿、上半身入镜。',
    environment: { lighting: 'standard_clinic', distanceMeters: 1.5 },
    deviceRequirements: { camera: 'front_rgb', minResolution: '720p' },
    taskParameters: { posture: 'standing', bodyScope: 'upper_body' },
    qualityRules: { minPoseVisibility: 0.65 },
    status: 'active',
  };

  const formalCollectionProtocol = {
    id: 'protocol-id',
    conditionId: 'condition-id',
    gameContentId: 'game-id',
    code: 'rhythm_reach_clinic_v1',
    name: '节奏触达诊室采集协议',
    version: '1.0.0',
    runtimeType: 'unity_webgl',
    requiredConsentTypes: ['privacy_policy', 'camera_capture'],
    requiredInputModes: ['camera_pose'],
    requiredMetrics: unityGameContent.requiredMetrics,
    conditionRules: { requireUpperBodyInFrame: true },
    samplingConfig: { sampleRateHz: 30 },
    qualityGate: { minConfidence: 0.8 },
    status: 'active',
    condition: formalCollectionCondition,
  };

  const formalCollectionBatch = {
    id: 'collection-batch-id',
    patientId: 'patient-profile-id',
    rehabPlanId: 'plan-id',
    planItemId: 'plan-item-id',
    gameContentId: 'game-id',
    protocolId: 'protocol-id',
    conditionId: 'condition-id',
    protocolVersion: '1.0.0',
    status: 'ready',
    conditionSnapshot: {
      code: formalCollectionCondition.code,
      environment: formalCollectionCondition.environment,
    },
    protocolSnapshot: {
      code: formalCollectionProtocol.code,
      version: formalCollectionProtocol.version,
      requiredMetrics: formalCollectionProtocol.requiredMetrics,
      qualityGate: formalCollectionProtocol.qualityGate,
    },
    consentSnapshot: {
      version: 'v1.2',
      requiredTypes: ['privacy_policy', 'camera_capture'],
      grantedConsentIds: [
        'privacy_policy-consent-id',
        'camera_capture-consent-id',
      ],
      grants: [
        {
          id: 'privacy_policy-consent-id',
          consentType: 'privacy_policy',
          consentVersion: 'v1.2',
          status: 'granted',
          grantedAt: '2026-05-20T05:30:00.000Z',
        },
        {
          id: 'camera_capture-consent-id',
          consentType: 'camera_capture',
          consentVersion: 'v1.2',
          status: 'granted',
          grantedAt: '2026-05-20T05:30:00.000Z',
        },
      ],
      status: 'granted',
    },
    protocol: formalCollectionProtocol,
    condition: formalCollectionCondition,
  };

  it('writes same-chain audit metadata when confirming a rehab plan', async () => {
    const { prisma, service } = createService();
    const pendingPlan = {
      id: 'plan-id',
      patientId: 'patient-profile-id',
      doctorId: 'doctor-profile-id',
      planName: '正式训练方案',
      dailyDuration: 20,
      weekFrequency: 4,
      difficultyLadder: { level: 'baseline' },
      status: 'pending_confirm',
      isCurrent: false,
      patient: {
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      },
      items: [
        {
          id: 'plan-item-id',
          rehabPlanId: 'plan-id',
          gameContentId: 'game-id',
          sequence: 1,
        },
      ],
    };
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    const confirmedPlan = {
      ...pendingPlan,
      doctorId: 'doctor-profile-id',
      dailyDuration: 25,
      weekFrequency: 5,
      status: 'active',
      isCurrent: true,
      confirmedAt: new Date('2026-06-10T08:00:00.000Z'),
      items: [
        {
          id: 'plan-item-id',
          rehabPlanId: 'plan-id',
          gameContentId: 'game-id',
          sequence: 1,
          gameContent: unityGameContent,
        },
      ],
    };
    prisma.rehabPlan.findUnique
      .mockResolvedValueOnce(pendingPlan)
      .mockResolvedValueOnce(confirmedPlan);
    prisma.rehabPlan.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.confirmPlan(doctorUser, 'plan-id', {
        dailyDuration: 25,
        weekFrequency: 5,
        difficultyLadder: { level: 'baseline' },
        adjustmentReason: '确认正式训练安排',
      }),
    ).resolves.toMatchObject({
      id: 'plan-id',
      patientId: 'patient-profile-id',
      items: [objectContaining({ id: 'plan-item-id' })],
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'rehab_plan.confirm',
        targetType: 'rehab_plan',
        targetId: 'plan-id',
        result: 'success',
        metadata: objectContaining({
          patientId: 'patient-profile-id',
          doctorId: 'doctor-profile-id',
          planItemIds: ['plan-item-id'],
        }),
      }),
    });
  });

  const browserPoseGameContent = {
    id: 'browser-game-id',
    code: 'garden_reach',
    name: '上肢反应触达',
    runtimeType: 'browser_pose_canvas',
    manifestUrl: null,
    buildBaseUrl: null,
    gameVersion: '1.0.0',
    bridgeProtocolVersion: '1.0.0',
    buildStatus: 'released',
    releaseChannel: 'production',
    status: 'active',
    supportsCamera: true,
    supportedInputModes: ['camera_pose'],
    difficultyPolicy: {
      source: 'clinician_approved_plan',
      safetyLimits: { minLevel: 1, maxLevel: 3 },
    },
    dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
    requiredPermissions: ['camera_capture'],
    resultSchema: {
      schemaVersion: '1.0.0',
      dynamicDifficultyEvidence: 'required',
    },
    publishedStatus: 'published',
    requiredMetrics: [
      { metricType: 'reaction_time_ms', unit: 'ms', min: 0, max: 60000 },
      { metricType: 'target_hit_rate', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'pose_visibility_avg', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'arm_raise_accuracy', unit: 'ratio', min: 0, max: 1 },
    ],
  };

  const cognitiveGameContent = {
    id: 'cognitive-game-id',
    code: 'memory_path',
    name: '记忆路径',
    runtimeType: 'cognitive_web',
    manifestUrl: null,
    buildBaseUrl: null,
    gameVersion: '1.0.0',
    bridgeProtocolVersion: '1.0.0',
    buildStatus: 'released',
    releaseChannel: 'production',
    status: 'active',
    supportedInputModes: ['touch', 'keyboard'],
    difficultyPolicy: {
      source: 'clinician_approved_plan',
      safetyLimits: { minLevel: 1, maxLevel: 3 },
    },
    dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
    requiredPermissions: [],
    resultSchema: {
      schemaVersion: '1.0.0',
      dynamicDifficultyEvidence: 'required',
    },
    publishedStatus: 'published',
    requiredMetrics: [
      { metricType: 'sequence_recall_rate', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'path_completion_rate', unit: 'ratio', min: 0, max: 1 },
    ],
  };

  const browserCollectionProtocol = {
    ...formalCollectionProtocol,
    id: 'browser-protocol-id',
    gameContentId: 'browser-game-id',
    code: 'garden_reach_clinic_v1',
    name: '上肢反应触达诊室采集协议',
    runtimeType: 'browser_pose_canvas',
    requiredMetrics: browserPoseGameContent.requiredMetrics,
  };

  const browserCollectionBatch = {
    ...formalCollectionBatch,
    id: 'browser-collection-batch-id',
    gameContentId: 'browser-game-id',
    protocolId: 'browser-protocol-id',
    protocol: browserCollectionProtocol,
    protocolSnapshot: {
      code: browserCollectionProtocol.code,
      version: browserCollectionProtocol.version,
      requiredMetrics: browserCollectionProtocol.requiredMetrics,
    },
  };

  const cognitiveCollectionProtocol = {
    ...formalCollectionProtocol,
    id: 'cognitive-protocol-id',
    gameContentId: 'cognitive-game-id',
    code: 'memory_path_clinic_v1',
    name: '记忆路径认知采集协议',
    runtimeType: 'cognitive_web',
    requiredConsentTypes: ['privacy_policy'],
    requiredInputModes: ['touch', 'keyboard'],
    requiredMetrics: cognitiveGameContent.requiredMetrics,
  };

  const cognitiveCollectionBatch = {
    ...formalCollectionBatch,
    id: 'cognitive-collection-batch-id',
    gameContentId: 'cognitive-game-id',
    protocolId: 'cognitive-protocol-id',
    protocol: cognitiveCollectionProtocol,
    protocolSnapshot: {
      code: cognitiveCollectionProtocol.code,
      version: cognitiveCollectionProtocol.version,
      requiredMetrics: cognitiveCollectionProtocol.requiredMetrics,
    },
    consentSnapshot: {
      version: 'v1.2',
      requiredTypes: ['privacy_policy'],
      grantedConsentIds: ['privacy_policy-consent-id'],
      grants: [
        {
          id: 'privacy_policy-consent-id',
          consentType: 'privacy_policy',
          consentVersion: 'v1.2',
          status: 'granted',
          grantedAt: '2026-05-20T05:30:00.000Z',
        },
      ],
      status: 'granted',
    },
  };

  function validTrainingRuntimeConfigSnapshot(
    overrides: Record<string, unknown> = {},
  ) {
    return {
      runtimeType: 'unity_webgl',
      requiredMetrics: unityGameContent.requiredMetrics,
      approvedPlanItemId: 'plan-item-id',
      prescribedDurationSeconds: 480,
      durationSeconds: 480,
      resultContractVersion: 'rehab-unity-result-v2',
      collectionBatchId: 'collection-batch-id',
      minConfidence: 0.8,
      assessmentSourceId: 'assessment-approved-001',
      startingLevelSource: 'clinician_approved_plan',
      startingDifficultyLevel: 2,
      ...overrides,
    };
  }

  function validUnityTrainingResultSession(
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: 'session-id',
      patientId: 'patient-profile-id',
      rehabPlanId: 'plan-id',
      planItemId: 'plan-item-id',
      gameContentId: 'game-id',
      collectionBatchId: 'collection-batch-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      clientStartedAt: new Date('2026-05-20T06:00:00.000Z'),
      runtimeConfigSnapshot: validTrainingRuntimeConfigSnapshot(),
      result: null,
      collectionBatch: formalCollectionBatch,
      gameContent: unityGameContent,
      ...overrides,
    };
  }

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
          grantedAt: new Date('2026-05-20T05:30:00.000Z'),
        });
      },
    );
    prisma.rehabPlanItem.findFirst.mockResolvedValue({
      id: 'plan-item-id',
      durationMinutes: 8,
      difficulty: 'standard',
      adaptiveRules: { source: 'clinician_approved_plan' },
      gameContent: unityGameContent,
    });
    prisma.gameContent.findUnique.mockResolvedValue(unityGameContent);
    prisma.collectionCondition.findFirst.mockResolvedValue(
      formalCollectionCondition,
    );
    prisma.collectionProtocol.findFirst.mockResolvedValue(
      formalCollectionProtocol,
    );
    prisma.collectionBatch.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'browser-collection-batch-id'
            ? browserCollectionBatch
            : where.id === 'cognitive-collection-batch-id'
              ? cognitiveCollectionBatch
              : formalCollectionBatch,
        ),
    );
    prisma.collectionBatch.create.mockResolvedValue(formalCollectionBatch);
    prisma.collectionBatch.upsert.mockImplementation(
      ({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({
          ...formalCollectionBatch,
          ...create,
          operatorNotes: create.operatorNotes ?? null,
        }),
    );
    prisma.rewardRule.findMany.mockResolvedValue([]);
    prisma.rewardLedger.upsert.mockResolvedValue({ id: 'reward-ledger-id' });
    prisma.riskGradeRecord.findFirst.mockResolvedValue({
      id: 'risk-id',
      patientId: 'patient-profile-id',
      assessmentId: 'assessment-approved-001',
      riskLevel: 'moderate',
      isCurrent: true,
      createdAt: new Date('2026-05-20T05:00:00.000Z'),
    });
    prisma.achievement.upsert.mockResolvedValue({ id: 'achievement-id' });
    prisma.trainingSession.upsert.mockImplementation(
      ({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({
          ...create,
          deviceCode: create.deviceCode ?? null,
          unityBuildVersion: create.unityBuildVersion ?? null,
          result: null,
        }),
    );
    prisma.trainingSession.create.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, result: null }),
    );
    prisma.trainingSession.findUnique.mockResolvedValue(
      validUnityTrainingResultSession(),
    );
    prisma.trainingResult.create.mockResolvedValue({
      id: 'result-id',
    });
  }

  function validStartTrainingDto(
    overrides: Partial<{
      patientId: string;
      rehabPlanId: string;
      planItemId: string;
      gameContentId: string;
      collectionBatchId: string;
      gameRunId: string;
      deviceCode: string;
      calibrationStatus: string;
      clientStartedAt: string;
      idempotencyKey: string;
    }> = {},
  ) {
    return {
      patientId: 'patient-profile-id',
      rehabPlanId: 'plan-id',
      planItemId: 'plan-item-id',
      gameContentId: 'game-id',
      collectionBatchId: 'collection-batch-id',
      gameRunId: 'run-001',
      deviceCode: 'camera-001',
      calibrationStatus: 'checked',
      clientStartedAt: '2026-05-20T06:00:00.000Z',
      ...overrides,
    };
  }

  function validUnityTrainingResultDto(
    overrides: Partial<SubmitTrainingResultLike> = {},
  ): SubmitTrainingResultLike {
    return {
      score: 92,
      completionRate: 0.96,
      durationSeconds: 480,
      reactionTimeMs: 820,
      motionAccuracy: 0.91,
      exerciseIntensity: 'moderate',
      metricsSummary: {
        source: 'unity_webgl',
        source_only_not_camera_pose: false,
        resultContractVersion: 'rehab-unity-result-v2',
        gameRunId: 'run-001',
        gameVersion: '1.0.0',
        protocolVersion: '1.0.0',
        clientGeneratedAt: '2026-05-20T06:30:00.000Z',
        rawPayloadHash: 'hash-001',
        collectionBatchId: 'collection-batch-id',
        difficultyAdjustmentCount: 1,
        dynamicDifficultyEvidence: validDynamicDifficultyEvidence(),
      },
      motionMetrics: [
        {
          metricType: 'reaction_time_ms',
          metricValue: 820,
          unit: 'ms',
          confidence: 0.8,
          sampleCount: 240,
          windowStartedAt: '2026-05-20T06:00:00.000Z',
          windowEndedAt: '2026-05-20T06:30:00.000Z',
          qualityFlag: 'valid',
          rawSummary: { direction: 'forward' },
        },
        {
          metricType: 'target_hit_rate',
          metricValue: 0.86,
          unit: 'ratio',
          confidence: 0.86,
          sampleCount: 120,
          windowStartedAt: '2026-05-20T06:00:00.000Z',
          windowEndedAt: '2026-05-20T06:30:00.000Z',
          qualityFlag: 'valid',
        },
        {
          metricType: 'arm_raise_accuracy',
          metricValue: 0.91,
          unit: 'ratio',
          confidence: 0.91,
          sampleCount: 120,
          windowStartedAt: '2026-05-20T06:00:00.000Z',
          windowEndedAt: '2026-05-20T06:30:00.000Z',
          qualityFlag: 'valid',
        },
        {
          metricType: 'duration_seconds',
          metricValue: 480,
          unit: 'seconds',
          confidence: 1,
          sampleCount: 1,
          windowStartedAt: '2026-05-20T06:00:00.000Z',
          windowEndedAt: '2026-05-20T06:30:00.000Z',
          qualityFlag: 'valid',
        },
        {
          metricType: 'difficulty_level',
          metricValue: 3,
          unit: 'level',
          confidence: 1,
          sampleCount: 1,
          windowStartedAt: '2026-05-20T06:00:00.000Z',
          windowEndedAt: '2026-05-20T06:30:00.000Z',
          qualityFlag: 'valid',
        },
      ],
      ...overrides,
    };
  }

  function validDynamicDifficultyEvidence(
    overrides: Record<string, unknown> = {},
  ) {
    return {
      schemaVersion: '1.0.0',
      events: [
        {
          startingLevel: 2,
          startingLevelSource: 'clinician_approved_plan',
          approvedPlanItemId: 'plan-item-id',
          assessmentSourceId: 'assessment-approved-001',
          triggerReason: 'accuracy_high',
          before: {
            speed: 1,
            complexityLevel: 2,
          },
          after: {
            speed: 1.2,
            complexityLevel: 3,
          },
          adjustedAt: '2026-05-20T06:20:00.000Z',
          runtimeFrameId: 'run-001:frame:001',
          runtimeWindowId: 'run-001:difficulty-window:001',
          ...overrides,
        },
      ],
    };
  }

  function validBrowserPoseRuntimeConfigSnapshot(
    overrides: Record<string, unknown> = {},
  ) {
    return {
      runtimeType: 'browser_pose_canvas',
      resultContractVersion: 'browser-pose-result-v1',
      clientStartedAt: '2026-05-20T06:00:00.000Z',
      collectionBatchId: 'browser-collection-batch-id',
      requiredMetrics: browserPoseGameContent.requiredMetrics,
      approvedPlanItemId: 'plan-item-id',
      prescribedDurationSeconds: 480,
      assessmentSourceId: 'assessment-approved-001',
      startingLevelSource: 'clinician_approved_plan',
      startingDifficultyLevel: 2,
      ...overrides,
    };
  }

  function validBrowserPoseDynamicDifficultyEvidence(
    overrides: Record<string, unknown> = {},
  ) {
    return {
      schemaVersion: '1.0.0',
      events: [
        {
          startingLevel: 2,
          startingLevelSource: 'clinician_approved_plan',
          approvedPlanItemId: 'plan-item-id',
          assessmentSourceId: 'assessment-approved-001',
          triggerReason: 'accuracy_high',
          before: {
            speed: 1,
            complexityLevel: 2,
            targetSizeScale: 1,
            minimumLandmarkVisibility: 0.45,
            holdDurationScale: 1,
            targetIntervalMs: 1200,
            targetLifetimeMs: 2600,
          },
          after: {
            speed: 1.2,
            complexityLevel: 3,
            targetSizeScale: 0.85,
            minimumLandmarkVisibility: 0.5,
            holdDurationScale: 1.15,
            targetIntervalMs: 1000,
            targetLifetimeMs: 2167,
          },
          metricsWindow: {
            windowStartedAt: '2026-05-20T06:00:00.000Z',
            windowEndedAt: '2026-05-20T06:10:00.000Z',
            hitCount: 4,
            missCount: 0,
            sampleCount: 120,
            validFrameCount: 108,
            averageReactionTimeMs: 630,
            completionRate: 1,
            validFrameRatio: 0.9,
            motionAccuracy: 0.98,
          },
          adjustedAt: '2026-05-20T06:10:00.000Z',
          runtimeFrameId: 'pose-run-001:frame:1000',
          runtimeWindowId: 'pose-run-001:difficulty-window:1:0-1000',
          ...overrides,
        },
      ],
    };
  }

  function validBrowserPoseTrainingResultDto(): SubmitTrainingResultLike {
    const clientStartedAt = '2026-05-20T06:00:00.000Z';
    const clientGeneratedAt = '2026-05-20T06:30:00.000Z';
    return {
      score: 88,
      completionRate: 0.9,
      durationSeconds: 480,
      reactionTimeMs: 760,
      motionAccuracy: 0.86,
      exerciseIntensity: 'moderate',
      metricsSummary: {
        source: 'browser_pose_canvas',
        resultContractVersion: 'browser-pose-result-v1',
        gameRunId: 'pose-run-001',
        gameVersion: '1.0.0',
        protocolVersion: '1.0.0',
        clientGeneratedAt,
        rawPayloadHash: 'pose-hash-001',
        collectionBatchId: 'browser-collection-batch-id',
        targetDurationSeconds: 480,
        validFrameRatio: 0.9,
        difficultyAdjustmentCount: 1,
        dynamicDifficultyEvidence: validBrowserPoseDynamicDifficultyEvidence(),
      },
      motionMetrics: [
        {
          metricType: 'reaction_time_ms',
          metricValue: 760,
          unit: 'ms',
          confidence: 0.9,
          sampleCount: 4,
          windowStartedAt: clientStartedAt,
          windowEndedAt: clientGeneratedAt,
          qualityFlag: 'valid',
        },
        {
          metricType: 'target_hit_rate',
          metricValue: 0.9,
          unit: 'ratio',
          confidence: 0.9,
          sampleCount: 20,
          windowStartedAt: clientStartedAt,
          windowEndedAt: clientGeneratedAt,
          qualityFlag: 'valid',
        },
        {
          metricType: 'pose_visibility_avg',
          metricValue: 0.88,
          unit: 'ratio',
          confidence: 0.9,
          sampleCount: 108,
          windowStartedAt: clientStartedAt,
          windowEndedAt: clientGeneratedAt,
          qualityFlag: 'valid',
        },
        {
          metricType: 'arm_raise_accuracy',
          metricValue: 0.86,
          unit: 'ratio',
          confidence: 0.9,
          sampleCount: 20,
          windowStartedAt: clientStartedAt,
          windowEndedAt: clientGeneratedAt,
          qualityFlag: 'valid',
        },
      ],
    };
  }

  function validCognitiveRound(overrides: Record<string, unknown> = {}) {
    return {
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
      presentedAtMs: Date.parse('2026-05-20T06:20:00.000Z'),
      answerStartedAtMs: Date.parse('2026-05-20T06:20:02.000Z'),
      completedAtMs: Date.parse('2026-05-20T06:20:06.000Z'),
      ...overrides,
    };
  }

  function validCognitiveTrainingResultDto() {
    const commonSummary = {
      source: 'cognitive_web',
      gameRunId: 'memory-run-001',
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
      durationSeconds: 360,
      reactionTimeMs: 1000,
      motionAccuracy: 0.75,
      exerciseIntensity: 'low',
      metricsSummary: {
        ...commonSummary,
        gameVersion: '1.0.0',
        protocolVersion: '1.0.0',
        clientGeneratedAt: '2026-05-20T06:30:00.000Z',
        prescribedDurationSeconds: 360,
        rawPayloadHash: `sha256:${'a'.repeat(64)}`,
        rawInputStored: false,
        collectionBatchId: 'cognitive-collection-batch-id',
        rounds: [validCognitiveRound()],
        difficultyAdjustmentCount: 0,
        dynamicDifficultyEvidence: {
          schemaVersion: '1.0.0',
          events: [] as ReturnType<
            typeof validCognitiveDifficultyEvidence
          >['events'],
        },
      },
      motionMetrics: [
        {
          metricType: 'sequence_recall_rate',
          metricValue: 0.75,
          confidence: 1,
          unit: 'ratio',
          sampleCount: 1,
          windowStartedAt: '2026-05-20T06:00:00.000Z',
          windowEndedAt: '2026-05-20T06:30:00.000Z',
          qualityFlag: 'valid',
          rawSummary: { ...commonSummary },
        },
        {
          metricType: 'path_completion_rate',
          metricValue: 1,
          confidence: 1,
          unit: 'ratio',
          sampleCount: 1,
          windowStartedAt: '2026-05-20T06:00:00.000Z',
          windowEndedAt: '2026-05-20T06:30:00.000Z',
          qualityFlag: 'valid',
          rawSummary: { ...commonSummary },
        },
      ],
    };
  }

  function validCognitiveDifficultyEvidence(
    eventOverrides: Record<string, unknown> = {},
  ) {
    return {
      schemaVersion: '1.0.0',
      events: [
        {
          startingLevel: 2,
          startingLevelSource: 'clinician_approved_plan',
          approvedPlanItemId: 'plan-item-id',
          assessmentSourceId: 'assessment-approved-001',
          triggerReason: 'accuracy_high',
          before: {
            speed: 1.231,
            complexityLevel: 2,
            sequenceLength: 4,
            optionCount: 5,
            presentationMs: 2600,
          },
          after: {
            speed: 1.6,
            complexityLevel: 3,
            sequenceLength: 5,
            optionCount: 6,
            presentationMs: 2000,
          },
          windowRoundIds: ['round-1'],
          windowMetrics: {
            attemptCount: 4,
            correctCount: 4,
            accuracy: 1,
            averageResponseTimeMs: 1000,
          },
          adjustedAt: '2026-05-20T06:20:00.000Z',
          runtimeFrameId: 'memory-run-001:cognitive-round-round-1',
          runtimeWindowId: 'memory-run-001:rounds:round-1-round-1',
          ...eventOverrides,
        },
      ],
    };
  }

  function cognitiveTrainingResultDtoWithAdjustment(
    eventOverrides: Record<string, unknown> = {},
  ) {
    const dto = validCognitiveTrainingResultDto();
    const rounds = [
      validCognitiveRound({
        answers: ['blue', 'green', 'yellow', 'red'],
      }),
      validCognitiveRound({
        id: 'round-2',
        sequence: ['blue', 'green', 'yellow', 'red', 'purple'],
        answers: ['blue', 'green', 'yellow', 'red', 'white'],
        difficulty: {
          level: 3,
          sequenceLength: 5,
          optionCount: 6,
          presentationMs: 2000,
        },
        difficultyLevel: 3,
        presentedAtMs: Date.parse('2026-05-20T06:20:07.000Z'),
        answerStartedAtMs: Date.parse('2026-05-20T06:20:08.000Z'),
        completedAtMs: Date.parse('2026-05-20T06:20:13.000Z'),
      }),
    ];
    const commonSummary = {
      source: 'cognitive_web',
      gameRunId: 'memory-run-001',
      sequenceRecallRate: 0.889,
      pathCompletionRate: 1,
      completedRoundCount: 2,
      attemptCount: 9,
      correctStepCount: 8,
      totalStepCount: 9,
      mistakeCount: 1,
    };
    return {
      ...dto,
      score: 91,
      completionRate: 1,
      reactionTimeMs: 1000,
      motionAccuracy: 0.889,
      metricsSummary: {
        ...dto.metricsSummary,
        ...commonSummary,
        rounds,
        difficultyAdjustmentCount: 1,
        dynamicDifficultyEvidence:
          validCognitiveDifficultyEvidence(eventOverrides),
      },
      motionMetrics: [
        {
          metricType: 'sequence_recall_rate',
          metricValue: 0.889,
          confidence: 1,
          unit: 'ratio',
          sampleCount: 2,
          windowStartedAt: '2026-05-20T06:00:00.000Z',
          windowEndedAt: '2026-05-20T06:30:00.000Z',
          qualityFlag: 'valid',
          rawSummary: { ...commonSummary },
        },
        {
          metricType: 'path_completion_rate',
          metricValue: 1,
          confidence: 1,
          unit: 'ratio',
          sampleCount: 2,
          windowStartedAt: '2026-05-20T06:00:00.000Z',
          windowEndedAt: '2026-05-20T06:30:00.000Z',
          qualityFlag: 'valid',
          rawSummary: { ...commonSummary },
        },
      ],
    };
  }

  function cognitiveTrainingResultDtoAtUpperBoundary() {
    const dto = cognitiveTrainingResultDtoWithAdjustment();
    const maxDifficulty = {
      level: 3,
      sequenceLength: 6,
      optionCount: 7,
      presentationMs: 1500,
    };
    dto.metricsSummary.rounds[1].answers = [
      'blue',
      'green',
      'yellow',
      'red',
      'purple',
    ];
    dto.metricsSummary.rounds.push(
      validCognitiveRound({
        id: 'round-3',
        sequence: ['blue', 'green', 'yellow', 'red', 'purple', 'orange'],
        answers: ['blue', 'green', 'yellow', 'red', 'purple', 'orange'],
        difficulty: { ...maxDifficulty },
        difficultyLevel: 3,
        presentedAtMs: Date.parse('2026-05-20T06:20:14.000Z'),
        answerStartedAtMs: Date.parse('2026-05-20T06:20:15.000Z'),
        completedAtMs: Date.parse('2026-05-20T06:20:21.000Z'),
      }),
      validCognitiveRound({
        id: 'round-4',
        sequence: ['blue', 'green', 'yellow', 'red', 'purple', 'orange'],
        answers: ['blue', 'green', 'yellow', 'red', 'purple', 'orange'],
        difficulty: { ...maxDifficulty },
        difficultyLevel: 3,
        presentedAtMs: Date.parse('2026-05-20T06:20:22.000Z'),
        answerStartedAtMs: Date.parse('2026-05-20T06:20:23.000Z'),
        completedAtMs: Date.parse('2026-05-20T06:20:29.000Z'),
      }),
    );
    dto.metricsSummary.dynamicDifficultyEvidence.events.push({
      startingLevel: 2,
      startingLevelSource: 'clinician_approved_plan',
      approvedPlanItemId: 'plan-item-id',
      assessmentSourceId: 'assessment-approved-001',
      triggerReason: 'accuracy_high',
      before: {
        speed: 1.6,
        complexityLevel: 3,
        sequenceLength: 5,
        optionCount: 6,
        presentationMs: 2000,
      },
      after: {
        speed: 2.133,
        complexityLevel: 3,
        sequenceLength: 6,
        optionCount: 7,
        presentationMs: 1500,
      },
      windowRoundIds: ['round-2'],
      windowMetrics: {
        attemptCount: 5,
        correctCount: 5,
        accuracy: 1,
        averageResponseTimeMs: 1000,
      },
      adjustedAt: '2026-05-20T06:20:13.000Z',
      runtimeFrameId: 'memory-run-001:cognitive-round-round-2',
      runtimeWindowId: 'memory-run-001:rounds:round-2-round-2',
    });
    dto.metricsSummary.completedRoundCount = 4;
    dto.metricsSummary.attemptCount = 21;
    dto.metricsSummary.correctStepCount = 21;
    dto.metricsSummary.totalStepCount = 21;
    dto.metricsSummary.mistakeCount = 0;
    dto.metricsSummary.sequenceRecallRate = 1;
    dto.metricsSummary.pathCompletionRate = 1;
    dto.metricsSummary.difficultyAdjustmentCount = 2;
    dto.score = 100;
    dto.motionAccuracy = 1;
    dto.motionMetrics[0].metricValue = 1;
    for (const metric of dto.motionMetrics) {
      metric.sampleCount = 4;
      Object.assign(metric.rawSummary, {
        sequenceRecallRate: 1,
        pathCompletionRate: 1,
        completedRoundCount: 4,
        attemptCount: 21,
        correctStepCount: 21,
        totalStepCount: 21,
        mistakeCount: 0,
      });
    }
    return dto;
  }

  function cognitiveTrainingResultDtoForRawScoreRounding() {
    const dto = cognitiveTrainingResultDtoWithAdjustment();
    const baseMs = Date.parse('2026-05-20T06:20:00.000Z');
    const levelOneThreeStep = {
      level: 1,
      sequenceLength: 3,
      optionCount: 4,
      presentationMs: 3200,
    };
    const lowestDifficulty = {
      level: 1,
      sequenceLength: 2,
      optionCount: 3,
      presentationMs: 3800,
    };
    const rounds = [
      validCognitiveRound({
        presentedAtMs: baseMs,
        answerStartedAtMs: baseMs + 1000,
        completedAtMs: baseMs + 5000,
      }),
      validCognitiveRound({
        id: 'round-2',
        sequence: ['blue', 'green', 'yellow'],
        answers: ['blue', 'green', 'red'],
        difficulty: { ...levelOneThreeStep },
        difficultyLevel: 1,
        presentedAtMs: baseMs + 6000,
        answerStartedAtMs: baseMs + 7000,
        completedAtMs: baseMs + 10000,
      }),
    ];
    let nextPresentedAtMs = baseMs + 11000;
    for (let roundNumber = 3; roundNumber <= 12; roundNumber += 1) {
      const hasOneCorrectAnswer = roundNumber <= 10;
      rounds.push(
        validCognitiveRound({
          id: `round-${roundNumber}`,
          sequence: ['blue', 'green'],
          answers: hasOneCorrectAnswer ? ['blue', 'yellow'] : ['green', 'blue'],
          difficulty: { ...lowestDifficulty },
          difficultyLevel: 1,
          presentedAtMs: nextPresentedAtMs,
          answerStartedAtMs: nextPresentedAtMs + 1000,
          completedAtMs: nextPresentedAtMs + 3000,
        }),
      );
      nextPresentedAtMs += 4000;
    }
    dto.metricsSummary.rounds = rounds;
    dto.metricsSummary.dynamicDifficultyEvidence = {
      schemaVersion: '1.0.0',
      events: [
        {
          startingLevel: 2,
          startingLevelSource: 'clinician_approved_plan',
          approvedPlanItemId: 'plan-item-id',
          assessmentSourceId: 'assessment-approved-001',
          triggerReason: 'accuracy_low',
          before: {
            speed: 1.231,
            complexityLevel: 2,
            sequenceLength: 4,
            optionCount: 5,
            presentationMs: 2600,
          },
          after: {
            speed: 1,
            complexityLevel: 1,
            sequenceLength: 3,
            optionCount: 4,
            presentationMs: 3200,
          },
          windowRoundIds: ['round-1'],
          windowMetrics: {
            attemptCount: 4,
            correctCount: 3,
            accuracy: 0.75,
            averageResponseTimeMs: 1000,
          },
          adjustedAt: new Date(baseMs + 5000).toISOString(),
          runtimeFrameId: 'memory-run-001:cognitive-round-round-1',
          runtimeWindowId: 'memory-run-001:rounds:round-1-round-1',
        },
        {
          startingLevel: 2,
          startingLevelSource: 'clinician_approved_plan',
          approvedPlanItemId: 'plan-item-id',
          assessmentSourceId: 'assessment-approved-001',
          triggerReason: 'accuracy_low',
          before: {
            speed: 1,
            complexityLevel: 1,
            sequenceLength: 3,
            optionCount: 4,
            presentationMs: 3200,
          },
          after: {
            speed: 0.842,
            complexityLevel: 1,
            sequenceLength: 2,
            optionCount: 3,
            presentationMs: 3800,
          },
          windowRoundIds: ['round-2'],
          windowMetrics: {
            attemptCount: 3,
            correctCount: 2,
            accuracy: 2 / 3,
            averageResponseTimeMs: 1000,
          },
          adjustedAt: new Date(baseMs + 10000).toISOString(),
          runtimeFrameId: 'memory-run-001:cognitive-round-round-2',
          runtimeWindowId: 'memory-run-001:rounds:round-2-round-2',
        },
      ],
    };
    dto.metricsSummary.completedRoundCount = 12;
    dto.metricsSummary.attemptCount = 27;
    dto.metricsSummary.correctStepCount = 13;
    dto.metricsSummary.totalStepCount = 27;
    dto.metricsSummary.mistakeCount = 14;
    dto.metricsSummary.sequenceRecallRate = 0.481;
    dto.metricsSummary.pathCompletionRate = 1;
    dto.metricsSummary.difficultyAdjustmentCount = 2;
    dto.score = 59;
    dto.completionRate = 1;
    dto.reactionTimeMs = 1000;
    dto.motionAccuracy = 0.481;
    dto.motionMetrics[0].metricValue = 0.481;
    for (const metric of dto.motionMetrics) {
      metric.sampleCount = 12;
      Object.assign(metric.rawSummary, {
        sequenceRecallRate: 0.481,
        pathCompletionRate: 1,
        completedRoundCount: 12,
        attemptCount: 27,
        correctStepCount: 13,
        totalStepCount: 27,
        mistakeCount: 14,
      });
    }
    return dto;
  }

  function mockCognitiveTrainingResultSession(
    prisma: ReturnType<typeof createService>['prisma'],
    runtimeConfigOverrides: Record<string, unknown> = {},
  ) {
    mockTrainingAccess(prisma, ['privacy_policy']);
    const session = {
      id: 'session-id',
      patientId: 'patient-profile-id',
      rehabPlanId: 'plan-id',
      planItemId: 'plan-item-id',
      gameContentId: 'cognitive-game-id',
      collectionBatchId: 'cognitive-collection-batch-id',
      gameRunId: 'memory-run-001',
      clientStartedAt: new Date('2026-05-20T06:00:00.000Z'),
      unityBuildVersion: null,
      bridgeProtocolVersion: '1.0.0',
      runtimeConfigSnapshot: validTrainingRuntimeConfigSnapshot(
        runtimeConfigOverrides,
      ),
      result: null,
      collectionBatch: cognitiveCollectionBatch,
      gameContent: cognitiveGameContent,
    };
    prisma.trainingSession.findUnique.mockResolvedValue(session);
    return session;
  }

  async function expectCognitiveResultRejectedBeforeWrite(
    dto: SubmitTrainingResultLike,
    expected: RegExp,
  ) {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).rejects.toThrow(expected);

    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    expect(prisma.trainingSession.updateMany).not.toHaveBeenCalled();
  }

  describe('formal collection management', () => {
    it('lists collection conditions for game managers with stable ordering', async () => {
      const { prisma, service } = createService();
      prisma.collectionCondition.findMany.mockResolvedValue([
        formalCollectionCondition,
      ]);

      await expect(
        service.listCollectionConditions(operatorAdminUser),
      ).resolves.toEqual([formalCollectionCondition]);
      await expect(
        service.listCollectionConditions(auditorAdminUser),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.collectionCondition.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
      expect(prisma.collectionCondition.findMany).toHaveBeenCalledTimes(1);
    });

    it('creates collection conditions with formal snapshots and audit evidence', async () => {
      const { prisma, service } = createService();
      prisma.collectionCondition.create.mockResolvedValue({
        ...formalCollectionCondition,
        createdByUserId: 'operator-user-id',
      });

      await expect(
        service.createCollectionCondition(operatorAdminUser, {
          code: ' clinic_light_standing ',
          name: ' 诊室标准光照站姿 ',
          description: ' 标准诊室光照、1.5 米站姿、上半身入镜。 ',
          environment: { lighting: 'standard_clinic', distanceMeters: 1.5 },
          deviceRequirements: { camera: 'front_rgb', minResolution: '720p' },
          taskParameters: { posture: 'standing', bodyScope: 'upper_body' },
          qualityRules: { minPoseVisibility: 0.65 },
        }),
      ).resolves.toMatchObject({
        id: 'condition-id',
        code: 'clinic_light_standing',
      });

      expect(prisma.collectionCondition.create).toHaveBeenCalledWith({
        data: {
          code: 'clinic_light_standing',
          name: '诊室标准光照站姿',
          description: '标准诊室光照、1.5 米站姿、上半身入镜。',
          environment: { lighting: 'standard_clinic', distanceMeters: 1.5 },
          deviceRequirements: { camera: 'front_rgb', minResolution: '720p' },
          taskParameters: { posture: 'standing', bodyScope: 'upper_body' },
          qualityRules: { minPoseVisibility: 0.65 },
          status: 'active',
          createdByUserId: 'operator-user-id',
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'operator-user-id',
          actorRole: 'admin_operator',
          action: 'collection_condition.create',
          targetType: 'collection_condition',
          targetId: 'condition-id',
          result: 'success',
        }),
      });
    });

    it.each([
      ['doctor', doctorUser],
      ['admin_auditor', auditorAdminUser],
    ])(
      'rejects %s from creating collection conditions',
      async (_label, user) => {
        const { prisma, service } = createService();

        await expect(
          service.createCollectionCondition(user, {
            code: 'clinic_light_standing',
            name: '诊室标准光照站姿',
            environment: { lighting: 'standard_clinic' },
            deviceRequirements: { camera: 'front_rgb' },
            taskParameters: { posture: 'standing' },
            qualityRules: { minPoseVisibility: 0.65 },
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(prisma.collectionCondition.create).not.toHaveBeenCalled();
        expect(prisma.auditLog.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        'demo marker in JSON',
        {
          environment: { lighting: 'demo_lab' },
          deviceRequirements: { camera: 'front_rgb' },
          taskParameters: { posture: 'standing' },
          qualityRules: { minPoseVisibility: 0.65 },
        },
      ],
      [
        'fallback marker in text',
        {
          name: 'fallback 采集条件',
          environment: { lighting: 'standard_clinic' },
          deviceRequirements: { camera: 'front_rgb' },
          taskParameters: { posture: 'standing' },
          qualityRules: { minPoseVisibility: 0.65 },
        },
      ],
      [
        'array environment',
        {
          environment: ['standard_clinic'],
          deviceRequirements: { camera: 'front_rgb' },
          taskParameters: { posture: 'standing' },
          qualityRules: { minPoseVisibility: 0.65 },
        },
      ],
    ])(
      'rejects invalid collection condition config: %s',
      async (_label, patch) => {
        const { prisma, service } = createService();
        const dto = Object.assign(
          {
            code: 'clinic_light_standing',
            name: '诊室标准光照站姿',
            environment: { lighting: 'standard_clinic' },
            deviceRequirements: { camera: 'front_rgb' },
            taskParameters: { posture: 'standing' },
            qualityRules: { minPoseVisibility: 0.65 },
          },
          patch,
        );

        await expect(
          service.createCollectionCondition(operatorAdminUser, dto),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(prisma.collectionCondition.create).not.toHaveBeenCalled();
        expect(prisma.auditLog.create).not.toHaveBeenCalled();
      },
    );

    it('creates collection protocols only when linked game and condition match', async () => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      prisma.collectionProtocol.create.mockResolvedValue({
        ...formalCollectionProtocol,
        gameContent: unityGameContent,
      });

      await expect(
        service.createCollectionProtocol(operatorAdminUser, {
          conditionId: 'condition-id',
          gameContentId: 'game-id',
          code: 'rhythm_reach_clinic_v1',
          name: '节奏触达诊室采集协议',
          version: '1.0.0',
          runtimeType: 'unity_webgl',
          requiredConsentTypes: ['privacy_policy', 'camera_capture'],
          requiredInputModes: ['camera_pose'],
          requiredMetrics: unityGameContent.requiredMetrics,
          conditionRules: { requireUpperBodyInFrame: true },
          samplingConfig: { sampleRateHz: 30 },
          qualityGate: { minConfidence: 0.8 },
        }),
      ).resolves.toMatchObject({
        id: 'protocol-id',
        code: 'rhythm_reach_clinic_v1',
      });

      expect(prisma.collectionCondition.findFirst).toHaveBeenCalledWith({
        where: { id: 'condition-id', status: 'active' },
      });
      expect(prisma.gameContent.findUnique).toHaveBeenCalledWith({
        where: { id: 'game-id' },
      });
      expect(prisma.collectionProtocol.create).toHaveBeenCalledWith({
        data: objectContaining({
          conditionId: 'condition-id',
          gameContentId: 'game-id',
          code: 'rhythm_reach_clinic_v1',
          name: '节奏触达诊室采集协议',
          version: '1.0.0',
          runtimeType: 'unity_webgl',
          requiredConsentTypes: ['privacy_policy', 'camera_capture'],
          requiredInputModes: ['camera_pose'],
          requiredMetrics: unityGameContent.requiredMetrics,
          qualityGate: { minConfidence: 0.8 },
          status: 'active',
          createdByUserId: 'operator-user-id',
        }),
        include: { condition: true, gameContent: true },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'operator-user-id',
          actorRole: 'admin_operator',
          action: 'collection_protocol.create',
          targetType: 'collection_protocol',
          targetId: 'protocol-id',
          result: 'success',
        }),
      });
    });

    it.each([
      ['missing minConfidence', {}],
      ['legacy minPoseVisibility', { minPoseVisibility: 0.65 }],
      [
        'extra quality gate field',
        { minConfidence: 0.8, qualityFlag: 'valid' },
      ],
      ['non-numeric minConfidence', { minConfidence: '0.8' }],
      ['zero minConfidence', { minConfidence: 0 }],
      ['out-of-range minConfidence', { minConfidence: 1.01 }],
    ])(
      'rejects Unity protocol quality gate with %s',
      async (_label, qualityGate) => {
        const { prisma, service } = createService();
        mockTrainingAccess(prisma);

        await expect(
          service.createCollectionProtocol(operatorAdminUser, {
            conditionId: 'condition-id',
            gameContentId: 'game-id',
            code: 'rhythm_reach_clinic_v1',
            name: '节奏触达诊室采集协议',
            version: '1.0.0',
            runtimeType: 'unity_webgl',
            requiredConsentTypes: ['privacy_policy', 'camera_capture'],
            requiredInputModes: ['camera_pose'],
            requiredMetrics: unityGameContent.requiredMetrics,
            conditionRules: { requireUpperBodyInFrame: true },
            samplingConfig: { sampleRateHz: 30 },
            qualityGate,
          }),
        ).rejects.toThrow(/qualityGate/);

        expect(prisma.collectionProtocol.create).not.toHaveBeenCalled();
        expect(prisma.auditLog.create).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        'inactive condition',
        () => {
          const { prisma } = createService();
          prisma.collectionCondition.findFirst.mockResolvedValue(null);
          return { prisma };
        },
      ],
      [
        'runtime mismatch',
        () => {
          const { prisma } = createService();
          mockTrainingAccess(prisma);
          return { prisma, runtimeType: 'browser_pose_canvas' };
        },
      ],
      [
        'missing required game metric',
        () => {
          const { prisma } = createService();
          mockTrainingAccess(prisma);
          return {
            prisma,
            requiredMetrics: [
              ...unityGameContent.requiredMetrics,
              { metricType: 'unsupported_metric', unit: 'count' },
            ],
          };
        },
      ],
    ])('rejects collection protocol config when %s', async (_label, setup) => {
      const { prisma, ...patch } = setup();
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.createCollectionProtocol(operatorAdminUser, {
          conditionId: 'condition-id',
          gameContentId: 'game-id',
          code: 'rhythm_reach_clinic_v1',
          name: '节奏触达诊室采集协议',
          version: '1.0.0',
          runtimeType: 'unity_webgl',
          requiredConsentTypes: ['privacy_policy', 'camera_capture'],
          requiredInputModes: ['camera_pose'],
          requiredMetrics: unityGameContent.requiredMetrics,
          conditionRules: { requireUpperBodyInFrame: true },
          samplingConfig: { sampleRateHz: 30 },
          qualityGate: { minConfidence: 0.8 },
          ...patch,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.collectionProtocol.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('creates collection batches from the active plan item and protocol snapshots', async () => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);

      await expect(
        service.createCollectionBatch(doctorUser, {
          patientId: 'patient-profile-id',
          rehabPlanId: 'plan-id',
          planItemId: 'plan-item-id',
          gameContentId: 'game-id',
          protocolId: 'protocol-id',
          operatorNotes: '正式训练前准备完成',
        }),
      ).resolves.toMatchObject({
        id: 'collection-batch-id',
        protocolId: 'protocol-id',
      });

      expect(prisma.collectionBatch.create).toHaveBeenCalledWith({
        data: objectContaining({
          patientId: 'patient-profile-id',
          rehabPlanId: 'plan-id',
          planItemId: 'plan-item-id',
          gameContentId: 'game-id',
          protocolId: 'protocol-id',
          conditionId: 'condition-id',
          protocolVersion: '1.0.0',
          status: 'ready',
          conditionSnapshot: objectContaining({
            id: 'condition-id',
            code: 'clinic_light_standing',
            environment: formalCollectionCondition.environment,
          }),
          protocolSnapshot: objectContaining({
            id: 'protocol-id',
            code: 'rhythm_reach_clinic_v1',
            version: '1.0.0',
            requiredMetrics: unityGameContent.requiredMetrics,
          }),
          consentSnapshot: objectContaining({
            version: 'v1.2',
            requiredTypes: arrayContaining([
              'privacy_policy',
              'camera_capture',
            ]),
            grantedConsentIds: arrayContaining([
              'privacy_policy-consent-id',
              'camera_capture-consent-id',
            ]),
            status: 'granted',
          }),
          operatorNotes: '正式训练前准备完成',
          createdByUserId: 'doctor-user-id',
        }),
        include: { protocol: true, condition: true },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'collection_batch.create',
          targetType: 'collection_batch',
          targetId: 'collection-batch-id',
          result: 'success',
        }),
      });
    });

    it('rejects collection batch creation before required consent snapshot can be frozen', async () => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma, ['privacy_policy']);

      await expect(
        service.createCollectionBatch(doctorUser, {
          patientId: 'patient-profile-id',
          rehabPlanId: 'plan-id',
          planItemId: 'plan-item-id',
          gameContentId: 'game-id',
          protocolId: 'protocol-id',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.collectionBatch.create).not.toHaveBeenCalled();
      expect(prisma.collectionBatch.upsert).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('uses idempotency key without creating duplicate collection batches', async () => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);

      await expect(
        service.createCollectionBatch(doctorUser, {
          patientId: 'patient-profile-id',
          rehabPlanId: 'plan-id',
          planItemId: 'plan-item-id',
          gameContentId: 'game-id',
          protocolId: 'protocol-id',
          idempotencyKey: 'formal-batch-001',
        }),
      ).resolves.toMatchObject({
        id: 'collection-batch-id',
      });

      expect(prisma.collectionBatch.upsert).toHaveBeenCalledWith({
        where: {
          patientId_idempotencyKey: {
            patientId: 'patient-profile-id',
            idempotencyKey: 'formal-batch-001',
          },
        },
        update: {},
        create: objectContaining({
          idempotencyKey: 'formal-batch-001',
          patientId: 'patient-profile-id',
          protocolId: 'protocol-id',
          conditionId: 'condition-id',
        }),
        include: { protocol: true, condition: true },
      });
      expect(prisma.collectionBatch.create).not.toHaveBeenCalled();
    });

    it.each([
      [
        'non-current plan item',
        (prisma: ReturnType<typeof createService>['prisma']) => {
          prisma.rehabPlanItem.findFirst.mockResolvedValue(null);
        },
      ],
      [
        'inactive protocol condition',
        (prisma: ReturnType<typeof createService>['prisma']) => {
          prisma.collectionProtocol.findFirst.mockResolvedValue({
            ...formalCollectionProtocol,
            condition: { ...formalCollectionCondition, status: 'inactive' },
          });
        },
      ],
      [
        'protocol metric mismatch',
        (prisma: ReturnType<typeof createService>['prisma']) => {
          prisma.collectionProtocol.findFirst.mockResolvedValue({
            ...formalCollectionProtocol,
            requiredMetrics: [
              ...unityGameContent.requiredMetrics,
              { metricType: 'unsupported_metric', unit: 'count' },
            ],
            condition: formalCollectionCondition,
          });
        },
      ],
      [
        'malformed Unity protocol quality gate',
        (prisma: ReturnType<typeof createService>['prisma']) => {
          prisma.collectionProtocol.findFirst.mockResolvedValue({
            ...formalCollectionProtocol,
            qualityGate: { minPoseVisibility: 0.65 },
            condition: formalCollectionCondition,
          });
        },
      ],
    ])('rejects collection batch creation for %s', async (_label, override) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      override(prisma);

      await expect(
        service.createCollectionBatch(doctorUser, {
          patientId: 'patient-profile-id',
          rehabPlanId: 'plan-id',
          planItemId: 'plan-item-id',
          gameContentId: 'game-id',
          protocolId: 'protocol-id',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.collectionBatch.create).not.toHaveBeenCalled();
      expect(prisma.collectionBatch.upsert).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

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
          collectionBatchId: 'collection-batch-id',
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
            collectionBatchId: 'collection-batch-id',
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

    const session = await service.startTrainingSession(doctorUser, {
      ...validStartTrainingDto(),
      idempotencyKey: 'training-run-001',
    });

    expect(session).toMatchObject({
      patientId: 'patient-profile-id',
    });
    expect(session.id).toEqual(anyValue(String));

    expect(prisma.collectionBatch.findUnique).toHaveBeenCalledWith({
      where: { id: 'collection-batch-id' },
      include: { protocol: true, condition: true },
    });
    expect(prisma.trainingSession.upsert).toHaveBeenCalledWith({
      where: {
        patientId_idempotencyKey: {
          patientId: 'patient-profile-id',
          idempotencyKey: 'training-run-001',
        },
      },
      update: {},
      create: objectContaining({
        id: session.id,
        patientId: 'patient-profile-id',
        collectionBatchId: 'collection-batch-id',
        idempotencyKey: 'training-run-001',
        gameRunId: 'run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        unityBuildVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        runtimeConfigSnapshot: objectContaining({
          minConfidence: 0.8,
          clientStartedAt: '2026-05-20T06:00:00.000Z',
        }),
        createdByUserId: 'doctor-user-id',
        sessionStatus: 'in_progress',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'training_session.start',
        targetType: 'training_session',
        targetId: session.id,
        result: 'success',
        metadata: objectContaining({
          patientId: 'patient-profile-id',
          rehabPlanId: 'plan-id',
          planItemId: 'plan-item-id',
          collectionBatchId: 'collection-batch-id',
          gameContentId: 'game-id',
          gameRunId: 'run-001',
        }),
      }),
    });
  });

  it('keeps one start audit when the same game run is retried idempotently', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    let originalSession: Record<string, unknown> | undefined;
    prisma.trainingSession.upsert.mockImplementation(
      ({ create }: { create: Record<string, unknown> }) => {
        originalSession ??= {
          ...create,
          deviceCode: create.deviceCode ?? null,
          unityBuildVersion: create.unityBuildVersion ?? null,
          result: null,
        };
        return Promise.resolve(originalSession);
      },
    );
    const dto = {
      ...validStartTrainingDto(),
      idempotencyKey: 'training-run-idempotent',
    };

    const first = await service.startTrainingSession(doctorUser, dto);
    const retry = await service.startTrainingSession(patientUser, dto);

    expect(retry).toMatchObject({
      id: first.id,
      gameRunId: 'run-001',
      createdByUserId: 'doctor-user-id',
    });
    expect(prisma.trainingSession.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.trainingSession.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'doctor-user-id',
        action: 'training_session.start',
        targetId: first.id,
        result: 'success',
      }),
    });
  });

  it('rejects a reused idempotency key with another game run without a new start audit', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    let originalSession: Record<string, unknown> | undefined;
    prisma.trainingSession.upsert.mockImplementation(
      ({ create }: { create: Record<string, unknown> }) => {
        originalSession ??= {
          ...create,
          deviceCode: create.deviceCode ?? null,
          unityBuildVersion: create.unityBuildVersion ?? null,
          result: null,
        };
        return Promise.resolve(originalSession);
      },
    );
    const dto = {
      ...validStartTrainingDto(),
      idempotencyKey: 'training-run-idempotent-conflict',
    };

    await service.startTrainingSession(doctorUser, dto);
    await expect(
      service.startTrainingSession(doctorUser, {
        ...dto,
        gameRunId: 'run-002',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('maps only the observed Prisma 6 active-plan-item P2002 representation to 409', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    const activeConflict = new Prisma.PrismaClientKnownRequestError(
      'active plan item conflict',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: {
          modelName: 'TrainingSession',
          target: ['planItemId'],
        },
      },
    );
    prisma.trainingSession.upsert.mockRejectedValue(activeConflict);

    await expect(
      service.startTrainingSession(doctorUser, {
        ...validStartTrainingDto(),
        idempotencyKey: 'different-active-key',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not remap an unrelated P2002 from training start', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    const unrelatedConflict = new Prisma.PrismaClientKnownRequestError(
      'unrelated unique conflict',
      {
        code: 'P2002',
        clientVersion: '6.19.2',
        meta: {
          modelName: 'TrainingSession',
          target: ['patientId', 'idempotencyKey'],
        },
      },
    );
    prisma.trainingSession.upsert.mockRejectedValue(unrelatedConflict);

    await expect(
      service.startTrainingSession(doctorUser, {
        ...validStartTrainingDto(),
        idempotencyKey: 'unrelated-conflict-key',
      }),
    ).rejects.toBe(unrelatedConflict);
  });

  it.each([
    [
      'missing collection batch id',
      { collectionBatchId: '' },
      () => undefined,
      { skipsBatchLookup: true },
    ],
    [
      'missing collection batch record',
      {},
      (prisma: ReturnType<typeof createService>['prisma']) => {
        prisma.collectionBatch.findUnique.mockResolvedValue(null);
      },
      {},
    ],
    [
      'not-ready collection batch',
      {},
      (prisma: ReturnType<typeof createService>['prisma']) => {
        prisma.collectionBatch.findUnique.mockResolvedValue({
          ...formalCollectionBatch,
          status: 'draft',
        });
      },
      {},
    ],
    [
      'patient mismatch',
      {},
      (prisma: ReturnType<typeof createService>['prisma']) => {
        prisma.collectionBatch.findUnique.mockResolvedValue({
          ...formalCollectionBatch,
          patientId: 'other-patient-id',
        });
      },
      {},
    ],
    [
      'inactive protocol',
      {},
      (prisma: ReturnType<typeof createService>['prisma']) => {
        prisma.collectionBatch.findUnique.mockResolvedValue({
          ...formalCollectionBatch,
          protocol: { ...formalCollectionProtocol, status: 'inactive' },
        });
      },
      {},
    ],
    [
      'malformed active Unity protocol quality gate',
      {},
      (prisma: ReturnType<typeof createService>['prisma']) => {
        prisma.collectionBatch.findUnique.mockResolvedValue({
          ...formalCollectionBatch,
          protocol: {
            ...formalCollectionProtocol,
            qualityGate: { minPoseVisibility: 0.65 },
          },
        });
      },
      {},
    ],
    [
      'stale protocol version',
      {},
      (prisma: ReturnType<typeof createService>['prisma']) => {
        prisma.collectionBatch.findUnique.mockResolvedValue({
          ...formalCollectionBatch,
          protocolVersion: '0.9.0',
        });
      },
      {},
    ],
    [
      'missing consent snapshot',
      {},
      (prisma: ReturnType<typeof createService>['prisma']) => {
        prisma.collectionBatch.findUnique.mockResolvedValue({
          ...formalCollectionBatch,
          consentSnapshot: {},
        });
      },
      {},
    ],
  ])(
    'rejects starting formal training with %s',
    async (_label, dtoPatch, override, options) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      override?.(prisma);

      await expect(
        service.startTrainingSession(
          doctorUser,
          validStartTrainingDto(dtoPatch),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      if ('skipsBatchLookup' in options && options.skipsBatchLookup) {
        expect(prisma.collectionBatch.findUnique).not.toHaveBeenCalled();
      }
      expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
      expect(prisma.trainingSession.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing gameRunId', { gameRunId: '' }],
    ['missing deviceCode', { deviceCode: '' }],
    ['invalid calibrationStatus', { calibrationStatus: 'unchecked' }],
    ['invalid clientStartedAt', { clientStartedAt: 'not-a-date' }],
  ])('rejects starting formal training with %s', async (_label, dtoPatch) => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);

    await expect(
      service.startTrainingSession(doctorUser, validStartTrainingDto(dtoPatch)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
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
        collectionBatchId: 'collection-batch-id',
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
        collectionBatchId: 'collection-batch-id',
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
        collectionBatchId: 'collection-batch-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.create).not.toHaveBeenCalled();
  });

  it('rejects starting Unity training when released game lacks formal publish metadata', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.rehabPlanItem.findFirst.mockResolvedValue({
      id: 'plan-item-id',
      durationMinutes: 8,
      difficulty: 'standard',
      adaptiveRules: { source: 'clinician_approved_plan' },
      gameContent: {
        ...unityGameContent,
        difficultyPolicy: null,
        dynamicDifficultyTriggers: [],
        requiredPermissions: ['camera_capture'],
        resultSchema: null,
        publishedStatus: null,
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
        collectionBatchId: 'collection-batch-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.collectionBatch.findUnique).not.toHaveBeenCalled();
    expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
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
        collectionBatchId: 'collection-batch-id',
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
      durationMinutes: 8,
      difficulty: 'standard',
      adaptiveRules: { source: 'clinician_approved_plan' },
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
        collectionBatchId: 'browser-collection-batch-id',
        idempotencyKey: 'pose-training-run-001',
      }),
    ).resolves.toMatchObject({ patientId: 'patient-profile-id' });

    expect(prisma.trainingSession.upsert).toHaveBeenCalledWith({
      where: {
        patientId_idempotencyKey: {
          patientId: 'patient-profile-id',
          idempotencyKey: 'pose-training-run-001',
        },
      },
      update: {},
      create: objectContaining({
        patientId: 'patient-profile-id',
        gameContentId: 'browser-game-id',
        collectionBatchId: 'browser-collection-batch-id',
        gameRunId: 'pose-run-001',
        deviceCode: 'camera-001',
        calibrationStatus: 'checked',
        unityBuildVersion: undefined,
        bridgeProtocolVersion: '1.0.0',
        sessionStatus: 'in_progress',
      }),
    });
  });

  it('creates a training session for released cognitive web games without camera consent or pose device', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma, ['privacy_policy']);
    prisma.rehabPlanItem.findFirst.mockResolvedValue({
      id: 'plan-item-id',
      durationMinutes: 8,
      difficulty: '三步路径',
      gameContent: cognitiveGameContent,
    });

    await expect(
      service.startTrainingSession(doctorUser, {
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'cognitive-game-id',
        gameRunId: 'memory-run-001',
        collectionBatchId: 'cognitive-collection-batch-id',
        calibrationStatus: 'checked',
        clientStartedAt: '2026-05-20T06:00:00.000Z',
        idempotencyKey: 'memory-training-run-001',
      }),
    ).resolves.toMatchObject({ patientId: 'patient-profile-id' });

    expect(prisma.trainingSession.upsert).toHaveBeenCalledWith({
      where: {
        patientId_idempotencyKey: {
          patientId: 'patient-profile-id',
          idempotencyKey: 'memory-training-run-001',
        },
      },
      update: {},
      create: objectContaining({
        patientId: 'patient-profile-id',
        gameContentId: 'cognitive-game-id',
        collectionBatchId: 'cognitive-collection-batch-id',
        gameRunId: 'memory-run-001',
        deviceCode: undefined,
        calibrationStatus: 'checked',
        unityBuildVersion: undefined,
        bridgeProtocolVersion: '1.0.0',
        sessionStatus: 'in_progress',
      }),
    });
    expect(
      mockArgs<{ where: { consentType: string } }>(
        prisma.consentRecord.findFirst,
      ).map((args) => args.where.consentType),
    ).toEqual(['privacy_policy']);
    const snapshot = mockArg<{
      create: { runtimeConfigSnapshot: unknown };
    }>(prisma.trainingSession.upsert).create.runtimeConfigSnapshot;
    expect(snapshot).toEqual(
      objectContaining({
        runtimeType: 'cognitive_web',
        approvedPlanItemId: 'plan-item-id',
        startingLevelSource: 'clinician_approved_plan',
        requiredPermissions: [],
        collectionBatch: objectContaining({
          consentSnapshot: objectContaining({
            requiredTypes: ['privacy_policy'],
            grantedConsentIds: ['privacy_policy-consent-id'],
            status: 'granted',
          }),
        }),
      }),
    );
    expect(snapshot).toHaveProperty('assessmentSourceId');
  });

  it.each([
    ['standard', 'standard', 2],
    ['garden reach basic', '基础', 1],
    ['memory sequence', '三步序列', 1],
    ['memory path', '三步路径', 1],
    ['two-color sorting', '双色分拣', 2],
    ['slow rhythm', '慢节律', 1],
    ['bilateral rhythm', '左右节拍', 2],
    ['center shift', '重心转移', 2],
    ['four-point trace', '四点光轨', 3],
  ])(
    'maps released formal seed difficulty %s to an approved starting level',
    async (_label, difficulty, expectedStartingDifficultyLevel) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      prisma.rehabPlanItem.findFirst.mockResolvedValue({
        id: 'plan-item-id',
        durationMinutes: 8,
        difficulty,
        adaptiveRules: { source: 'clinician_approved_plan' },
        gameContent: browserPoseGameContent,
      });

      await expect(
        service.startTrainingSession(doctorUser, {
          patientId: 'patient-profile-id',
          rehabPlanId: 'plan-id',
          planItemId: 'plan-item-id',
          gameContentId: 'browser-game-id',
          gameRunId: `pose-run-${expectedStartingDifficultyLevel}`,
          deviceCode: 'camera-001',
          calibrationStatus: 'checked',
          clientStartedAt: '2026-05-20T06:00:00.000Z',
          collectionBatchId: 'browser-collection-batch-id',
          idempotencyKey: `pose-training-${expectedStartingDifficultyLevel}-${difficulty}`,
        }),
      ).resolves.toMatchObject({ patientId: 'patient-profile-id' });

      const snapshot = mockArg<{
        create: { runtimeConfigSnapshot: unknown };
      }>(prisma.trainingSession.upsert).create.runtimeConfigSnapshot;
      expect(snapshot).toEqual(
        objectContaining({
          approvedPlanItemId: 'plan-item-id',
          assessmentSourceId: 'assessment-approved-001',
          startingLevelSource: 'clinician_approved_plan',
          startingDifficultyLevel: expectedStartingDifficultyLevel,
        }),
      );
    },
  );

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
      difficulty: 'standard',
      adaptiveRules: { source: 'clinician_approved_plan' },
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
        collectionBatchId: 'collection-batch-id',
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
      collectionBatchId: 'collection-batch-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      clientStartedAt: new Date('2026-05-20T06:00:00.000Z'),
      runtimeConfigSnapshot: validTrainingRuntimeConfigSnapshot(),
      result: null,
      collectionBatch: formalCollectionBatch,
      gameContent: unityGameContent,
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
          collectionBatchId: 'collection-batch-id',
          dynamicDifficultyEvidence: validDynamicDifficultyEvidence(),
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
      collectionBatchId: 'collection-batch-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      result: null,
      collectionBatch: formalCollectionBatch,
      gameContent: unityGameContent,
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
          collectionBatchId: 'collection-batch-id',
          dynamicDifficultyEvidence: validDynamicDifficultyEvidence(),
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
      collectionBatchId: 'collection-batch-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      clientStartedAt: new Date('2026-05-20T06:00:00.000Z'),
      runtimeConfigSnapshot: validTrainingRuntimeConfigSnapshot(),
      result: null,
      collectionBatch: formalCollectionBatch,
      gameContent: unityGameContent,
    });
    prisma.trainingResult.create.mockResolvedValue({
      id: 'result-id',
      score: 92,
    });

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto(),
      ),
    ).resolves.toMatchObject({
      id: 'result-id',
      score: 92,
    });

    expect(prisma.trainingSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-id',
        sessionStatus: { in: ['started', 'in_progress'] },
      },
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
        collectionBatchId: 'collection-batch-id',
        score: 92,
        metricsSummary: {
          source: 'unity_webgl',
          source_only_not_camera_pose: false,
          resultContractVersion: 'rehab-unity-result-v2',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
          collectionBatchId: 'collection-batch-id',
          difficultyAdjustmentCount: 1,
          dynamicDifficultyEvidence: validDynamicDifficultyEvidence(),
        },
      }),
    });
    expect(prisma.motionMetric.createMany).toHaveBeenCalledWith({
      data: [
        objectContaining({
          trainingSessionId: 'session-id',
          collectionBatchId: 'collection-batch-id',
          gameRunId: 'run-001',
          source: 'unity_webgl',
          metricType: 'reaction_time_ms',
          metricValue: 820,
          unit: 'ms',
          confidence: 0.8,
        }),
        objectContaining({
          collectionBatchId: 'collection-batch-id',
          metricType: 'target_hit_rate',
        }),
        objectContaining({
          collectionBatchId: 'collection-batch-id',
          metricType: 'arm_raise_accuracy',
        }),
        objectContaining({
          collectionBatchId: 'collection-batch-id',
          metricType: 'duration_seconds',
        }),
        objectContaining({
          collectionBatchId: 'collection-batch-id',
          metricType: 'difficulty_level',
        }),
      ],
    });
    expect(
      prisma.trainingResult.create.mock.invocationCallOrder[0],
    ).toBeLessThan(
      prisma.trainingSession.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('rolls back a created result with 409 when the active-session CAS loses', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      rehabPlanId: 'plan-id',
      planItemId: 'plan-item-id',
      gameContentId: 'game-id',
      collectionBatchId: 'collection-batch-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      clientStartedAt: new Date('2026-05-20T06:00:00.000Z'),
      runtimeConfigSnapshot: validTrainingRuntimeConfigSnapshot(),
      result: null,
      collectionBatch: formalCollectionBatch,
      gameContent: unityGameContent,
    });
    prisma.trainingResult.create.mockResolvedValue({
      id: 'rolled-back-result-id',
      score: 92,
    });
    prisma.trainingSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.trainingResult.create).toHaveBeenCalledTimes(1);
    expect(prisma.trainingSession.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    expect(prisma.rewardRule.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalledWith({
      data: objectContaining({ action: 'training_result.submit' }),
    });
  });

  it('rolls back training result writes when the same-transaction success audit fails', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    const auditFailure = new Error('audit insert failed');
    let businessWritesCommitted = false;
    const tx: TrainingWritePrismaMock = {
      ...prisma,
      trainingSession: {
        ...prisma.trainingSession,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      trainingResult: {
        create: jest.fn().mockResolvedValue({
          id: 'result-id',
          score: 92,
          completionRate: 0.96,
          durationSeconds: 480,
          reactionTimeMs: 820,
          motionAccuracy: 0.91,
          exerciseIntensity: 'moderate',
          abnormalFlag: false,
          qualityFlag: 'valid',
        }),
      },
      motionMetric: {
        createMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      rewardRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockRejectedValue(auditFailure),
      },
    };
    prisma.$transaction.mockImplementation(
      async <T>(callback: (client: TrainingWritePrismaMock) => Promise<T>) => {
        const result = await callback(tx);
        businessWritesCommitted = true;
        return result;
      },
    );
    prisma.auditLog.create.mockRejectedValue(auditFailure);

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto(),
      ),
    ).rejects.toBe(auditFailure);

    expect(businessWritesCommitted).toBe(false);
    expect(tx.trainingSession.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.trainingResult.create).toHaveBeenCalledTimes(1);
    expect(tx.motionMetric.createMany).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        action: 'training_result.submit',
        targetType: 'training_session',
        targetId: 'session-id',
        result: 'success',
      }),
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('issues configured rewards once for valid non-abnormal training results', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.rewardRule.findMany.mockResolvedValue([
      {
        id: 'rule-id',
        code: 'valid_training_completion',
        name: '完成一次有效训练',
        eventType: 'training_result.valid_completed',
        points: 10,
        achievementCode: 'first_valid_training',
        achievementName: '首次有效训练',
        achievementTarget: 1,
        eligibility: { minScore: 60 },
        status: 'active',
      },
    ]);
    prisma.trainingResult.create.mockResolvedValue({
      id: 'result-id',
      sessionId: 'session-id',
      score: 92,
      completionRate: 0.96,
      durationSeconds: 480,
      reactionTimeMs: 820,
      motionAccuracy: 0.91,
      exerciseIntensity: 'moderate',
      abnormalFlag: false,
      qualityFlag: 'valid',
      createdAt: new Date('2026-05-20T06:30:00.000Z'),
    });

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto(),
      ),
    ).resolves.toMatchObject({
      id: 'result-id',
      score: 92,
    });

    expect(prisma.rewardRule.findMany).toHaveBeenCalledWith({
      where: {
        eventType: 'training_result.valid_completed',
        status: 'active',
      },
    });
    expect(prisma.rewardLedger.upsert).toHaveBeenCalledWith({
      where: {
        patientId_eventType_eventId_ruleId: {
          patientId: 'patient-profile-id',
          eventType: 'training_result.valid_completed',
          eventId: 'result-id',
          ruleId: 'rule-id',
        },
      },
      update: {},
      create: objectContaining({
        patientId: 'patient-profile-id',
        trainingResultId: 'result-id',
        ruleId: 'rule-id',
        eventType: 'training_result.valid_completed',
        eventId: 'result-id',
        points: 10,
        status: 'issued',
      }),
    });
    expect(prisma.achievement.upsert).toHaveBeenCalledWith({
      where: {
        patientId_code: {
          patientId: 'patient-profile-id',
          code: 'first_valid_training',
        },
      },
      update: objectContaining({
        progress: { increment: 1 },
      }),
      create: objectContaining({
        patientId: 'patient-profile-id',
        code: 'first_valid_training',
        name: '首次有效训练',
        progress: 1,
        target: 1,
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'training_result.submit',
        targetType: 'training_session',
        targetId: 'session-id',
        result: 'success',
        metadata: objectContaining({
          patientId: 'patient-profile-id',
          rehabPlanId: 'plan-id',
          planItemId: 'plan-item-id',
          collectionBatchId: 'collection-batch-id',
          gameContentId: 'game-id',
          gameRunId: 'run-001',
          trainingResultId: 'result-id',
        }),
      }),
    });
  });

  it('does not issue rewards for suspicious or abnormal training results', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.rewardRule.findMany.mockResolvedValue([
      {
        id: 'rule-id',
        code: 'valid_training_completion',
        eventType: 'training_result.valid_completed',
        points: 10,
        status: 'active',
      },
    ]);
    prisma.trainingResult.create.mockResolvedValue({
      id: 'result-id',
      score: 92,
      abnormalFlag: true,
      qualityFlag: 'suspicious',
    });

    await service.submitTrainingResult(
      doctorUser,
      'session-id',
      validUnityTrainingResultDto({
        completionRate: 0.4,
      }),
    );

    expect(prisma.rewardRule.findMany).not.toHaveBeenCalled();
    expect(prisma.rewardLedger.upsert).not.toHaveBeenCalled();
    expect(prisma.achievement.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-id',
        sessionStatus: { in: ['started', 'in_progress'] },
      },
      data: objectContaining({
        sessionStatus: 'upload_failed',
        syncStatus: 'synced',
      }),
    });
  });

  it('does not issue rewards for duplicate training result submissions', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      result: { id: 'existing-result-id' },
      collectionBatch: formalCollectionBatch,
      gameContent: unityGameContent,
    });

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.rewardRule.findMany).not.toHaveBeenCalled();
    expect(prisma.rewardLedger.upsert).not.toHaveBeenCalled();
    expect(prisma.achievement.upsert).not.toHaveBeenCalled();
  });

  it.each([
    [
      'session missing collection batch id',
      { collectionBatchId: undefined },
      {},
    ],
    [
      'session missing collection batch relation',
      { collectionBatch: null },
      {},
    ],
    [
      'non-writable collection batch status',
      {
        collectionBatch: {
          ...formalCollectionBatch,
          status: 'cancelled',
        },
      },
      {},
    ],
    [
      'result missing collectionBatchId',
      {},
      {
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
        },
      },
    ],
    [
      'result collectionBatchId mismatch',
      {},
      {
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
          collectionBatchId: 'other-batch-id',
        },
      },
    ],
    [
      'gameRunId mismatch',
      {},
      {
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'other-run-id',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
          collectionBatchId: 'collection-batch-id',
        },
      },
    ],
    [
      'gameVersion mismatch',
      {},
      {
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.1',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
          collectionBatchId: 'collection-batch-id',
        },
      },
    ],
    [
      'protocolVersion mismatch',
      {},
      {
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.1',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          rawPayloadHash: 'hash-001',
          collectionBatchId: 'collection-batch-id',
        },
      },
    ],
    [
      'invalid clientGeneratedAt',
      {},
      {
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: 'not-a-date',
          rawPayloadHash: 'hash-001',
          collectionBatchId: 'collection-batch-id',
        },
      },
    ],
    [
      'missing rawPayloadHash',
      {},
      {
        metricsSummary: {
          source: 'unity_webgl',
          gameRunId: 'run-001',
          gameVersion: '1.0.0',
          protocolVersion: '1.0.0',
          clientGeneratedAt: '2026-05-20T06:30:00.000Z',
          collectionBatchId: 'collection-batch-id',
        },
      },
    ],
    ['missing motion metrics', {}, { motionMetrics: [] }],
  ])(
    'rejects training result when %s',
    async (_label, sessionPatch, dtoPatch) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      prisma.trainingSession.findUnique.mockResolvedValue({
        id: 'session-id',
        patientId: 'patient-profile-id',
        collectionBatchId: 'collection-batch-id',
        gameRunId: 'run-001',
        unityBuildVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        clientStartedAt: new Date('2026-05-20T06:00:00.000Z'),
        runtimeConfigSnapshot: validTrainingRuntimeConfigSnapshot(),
        result: null,
        collectionBatch: formalCollectionBatch,
        gameContent: unityGameContent,
        ...sessionPatch,
      });

      await expect(
        service.submitTrainingResult(
          doctorUser,
          'session-id',
          validUnityTrainingResultDto(dtoPatch),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.trainingSession.update).not.toHaveBeenCalled();
      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'empty metric type',
      {
        motionMetrics: [
          ...validUnityTrainingResultDto()
            .motionMetrics.slice(0, 1)
            .map((metric) => ({ ...metric, metricType: '' })),
          ...validUnityTrainingResultDto().motionMetrics.slice(1),
        ],
      },
    ],
    [
      'confidence out of range',
      {
        motionMetrics: [
          ...validUnityTrainingResultDto()
            .motionMetrics.slice(0, 1)
            .map((metric) => ({ ...metric, confidence: 1.2 })),
          ...validUnityTrainingResultDto().motionMetrics.slice(1),
        ],
      },
    ],
    [
      'non-positive sample count',
      {
        motionMetrics: [
          ...validUnityTrainingResultDto()
            .motionMetrics.slice(0, 1)
            .map((metric) => ({ ...metric, sampleCount: 0 })),
          ...validUnityTrainingResultDto().motionMetrics.slice(1),
        ],
      },
    ],
    [
      'window end before start',
      {
        motionMetrics: [
          ...validUnityTrainingResultDto()
            .motionMetrics.slice(0, 1)
            .map((metric) => ({
              ...metric,
              windowStartedAt: '2026-05-20T06:31:00.000Z',
              windowEndedAt: '2026-05-20T06:30:00.000Z',
            })),
          ...validUnityTrainingResultDto().motionMetrics.slice(1),
        ],
      },
    ],
    [
      'rawSummary not object',
      {
        motionMetrics: [
          ...validUnityTrainingResultDto()
            .motionMetrics.slice(0, 1)
            .map((metric) => ({ ...metric, rawSummary: 'not-json-object' })),
          ...validUnityTrainingResultDto().motionMetrics.slice(1),
        ],
      },
    ],
  ])('rejects invalid motion metric detail: %s', async (_label, dtoPatch) => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto(dtoPatch),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it.each(
    [
      'reaction_time_ms',
      'target_hit_rate',
      'arm_raise_accuracy',
      'duration_seconds',
      'difficulty_level',
    ].flatMap((metricType) =>
      (
        [
          'confidence',
          'sampleCount',
          'windowStartedAt',
          'windowEndedAt',
          'qualityFlag',
        ] as const
      ).map((field) => [metricType, field] as const),
    ),
  )(
    'rejects Unity required metric %s without explicit %s',
    async (metricType, field) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      const dto = validUnityTrainingResultDto();
      const motionMetrics = dto.motionMetrics.map((metric) => {
        const updatedMetric = { ...metric };
        if (updatedMetric.metricType === metricType) {
          delete updatedMetric[field];
        }
        return updatedMetric;
      });

      await expect(
        service.submitTrainingResult(
          doctorUser,
          'session-id',
          validUnityTrainingResultDto({ motionMetrics }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    },
  );

  it('rejects duplicate Unity motion metric types', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    const dto = validUnityTrainingResultDto();

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto({
          motionMetrics: [...dto.motionMetrics, { ...dto.motionMetrics[0] }],
        }),
      ),
    ).rejects.toThrow(/不能重复/);

    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it('persists a suspicious Unity metric as suspicious and does not issue rewards', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    const dto = validUnityTrainingResultDto();

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto({
          motionMetrics: dto.motionMetrics.map((metric) =>
            metric.metricType === 'target_hit_rate'
              ? { ...metric, qualityFlag: 'suspicious' }
              : metric,
          ),
        }),
      ),
    ).resolves.toMatchObject({ id: 'result-id' });

    expect(prisma.trainingResult.create).toHaveBeenCalledWith({
      data: objectContaining({
        abnormalFlag: true,
        qualityFlag: 'suspicious',
        qualityReasons: arrayContaining([
          '动作指标 target_hit_rate 标记为可疑',
        ]),
      }),
    });
    expect(prisma.motionMetric.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.rewardRule.findMany).not.toHaveBeenCalled();
    expect(prisma.rewardLedger.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-id',
        sessionStatus: { in: ['started', 'in_progress'] },
      },
      data: objectContaining({ sessionStatus: 'upload_failed' }),
    });
  });

  it('persists Unity evidence below the protocol gate as suspicious without rewards', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    const dto = validUnityTrainingResultDto();

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto({
          motionMetrics: dto.motionMetrics.map((metric) =>
            metric.metricType === 'arm_raise_accuracy'
              ? { ...metric, confidence: 0.6 }
              : metric,
          ),
        }),
      ),
    ).resolves.toMatchObject({ id: 'result-id' });

    expect(prisma.trainingResult.create).toHaveBeenCalledWith({
      data: objectContaining({
        abnormalFlag: true,
        qualityFlag: 'suspicious',
        qualityReasons: arrayContaining([
          '动作指标 arm_raise_accuracy 置信度低于采集协议质量门禁',
        ]),
      }),
    });
    expect(prisma.rewardRule.findMany).not.toHaveBeenCalled();
    expect(prisma.rewardLedger.upsert).not.toHaveBeenCalled();
    expect(prisma.trainingSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-id',
        sessionStatus: { in: ['started', 'in_progress'] },
      },
      data: objectContaining({ sessionStatus: 'upload_failed' }),
    });
  });

  it('rejects a Unity metric qualityFlag outside valid and suspicious', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    const dto = validUnityTrainingResultDto();

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto({
          motionMetrics: dto.motionMetrics.map((metric) =>
            metric.metricType === 'target_hit_rate'
              ? { ...metric, qualityFlag: 'unknown' }
              : metric,
          ),
        }),
      ),
    ).rejects.toThrow(/只能是 valid 或 suspicious/);

    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it('rejects Unity motion metrics outside the exact five-item result contract', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    const dto = validUnityTrainingResultDto();

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto({
          motionMetrics: [
            ...dto.motionMetrics,
            {
              metricType: 'client_attention_score',
              metricValue: 0.9,
              unit: 'ratio',
              confidence: 0.9,
              sampleCount: 120,
              windowStartedAt: '2026-05-20T06:00:00.000Z',
              windowEndedAt: '2026-05-20T06:30:00.000Z',
              qualityFlag: 'valid',
            },
          ],
        }),
      ),
    ).rejects.toThrow(/精确等于五项正式指标/);

    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ['reaction_time_ms', { metricValue: 821 }, /reactionTimeMs/],
    ['arm_raise_accuracy', { metricValue: 0.9 }, /motionAccuracy/],
    ['duration_seconds', { metricValue: 479 }, /durationSeconds/],
    ['difficulty_level', { metricValue: 2 }, /最终动态难度证据/],
    ['target_hit_rate', { metricValue: 1.1 }, /超出正式合同范围/],
    ['target_hit_rate', { unit: 'percent' }, /单位必须是 ratio/],
  ])(
    'rejects Unity metric %s when its contract value is inconsistent',
    async (metricType, metricPatch, expectedError) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      const dto = validUnityTrainingResultDto();

      await expect(
        service.submitTrainingResult(
          doctorUser,
          'session-id',
          validUnityTrainingResultDto({
            motionMetrics: dto.motionMetrics.map((metric) =>
              metric.metricType === metricType
                ? { ...metric, ...metricPatch }
                : metric,
            ),
          }),
        ),
      ).rejects.toThrow(expectedError);

      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    },
  );

  it('rejects Unity duration that differs from the frozen prescription', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    const dto = validUnityTrainingResultDto();

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto({
          durationSeconds: 420,
          motionMetrics: dto.motionMetrics.map((metric) =>
            metric.metricType === 'duration_seconds'
              ? { ...metric, metricValue: 420 }
              : metric,
          ),
        }),
      ),
    ).rejects.toThrow(/冻结的处方时长一致/);

    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it('rejects a Unity session whose frozen requiredMetrics contract is not exact', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.trainingSession.findUnique.mockResolvedValue(
      validUnityTrainingResultSession({
        runtimeConfigSnapshot: validTrainingRuntimeConfigSnapshot({
          requiredMetrics: [
            ...unityGameContent.requiredMetrics,
            {
              metricType: 'client_attention_score',
              unit: 'ratio',
              min: 0,
              max: 1,
            },
          ],
        }),
      }),
    );

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto(),
      ),
    ).rejects.toThrow(/requiredMetrics 必须精确包含五项指标/);

    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it.each([
    [
      'result contract version',
      { resultContractVersion: 'rehab-unity-result-v1' },
      /结果合同版本/,
    ],
    [
      'collection batch identity',
      { collectionBatchId: 'other-collection-batch-id' },
      /采集批次不一致/,
    ],
    ['duration identity', { durationSeconds: 420 }, /冻结的处方时长一致/],
    [
      'quality gate identity',
      { minConfidence: 0.65 },
      /minConfidence 与采集协议质量门禁不一致/,
    ],
    [
      'invalid zero quality gate',
      { minConfidence: 0 },
      /minConfidence 必须大于 0 且小于等于 1/,
    ],
  ])(
    'rejects a Unity session with mismatched frozen %s',
    async (_label, runtimeConfigPatch, expectedError) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      prisma.trainingSession.findUnique.mockResolvedValue(
        validUnityTrainingResultSession({
          runtimeConfigSnapshot:
            validTrainingRuntimeConfigSnapshot(runtimeConfigPatch),
        }),
      );

      await expect(
        service.submitTrainingResult(
          doctorUser,
          'session-id',
          validUnityTrainingResultDto(),
        ),
      ).rejects.toThrow(expectedError);

      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    },
  );

  it('rejects a Unity result without the exact v2 result contract', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    const dto = validUnityTrainingResultDto();

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto({
          metricsSummary: {
            ...(dto.metricsSummary as Prisma.JsonObject),
            resultContractVersion: 'rehab-unity-result-v1',
          },
        }),
      ),
    ).rejects.toThrow(/结果合同版本/);

    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it('rejects a Unity session whose frozen protocol quality gate is missing', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.trainingSession.findUnique.mockResolvedValue(
      validUnityTrainingResultSession({
        collectionBatch: {
          ...formalCollectionBatch,
          protocolSnapshot: {
            ...formalCollectionBatch.protocolSnapshot,
            qualityGate: {},
          },
        },
      }),
    );

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto(),
      ),
    ).rejects.toThrow(/qualityGate.*minConfidence/);

    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['invalid', new Date('invalid')],
  ])(
    'rejects Unity metrics when session clientStartedAt is %s',
    async (_label, clientStartedAt) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      prisma.trainingSession.findUnique.mockResolvedValue({
        id: 'session-id',
        patientId: 'patient-profile-id',
        collectionBatchId: 'collection-batch-id',
        gameRunId: 'run-001',
        unityBuildVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        clientStartedAt,
        runtimeConfigSnapshot: validTrainingRuntimeConfigSnapshot(),
        result: null,
        collectionBatch: formalCollectionBatch,
        gameContent: unityGameContent,
      });

      await expect(
        service.submitTrainingResult(
          doctorUser,
          'session-id',
          validUnityTrainingResultDto(),
        ),
      ).rejects.toThrow(/clientStartedAt/);

      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'window start differs from session start',
      { windowStartedAt: '2026-05-20T06:00:01.000Z' },
    ],
    [
      'window end differs from result completion',
      { windowEndedAt: '2026-05-20T06:29:59.000Z' },
    ],
  ])(
    'rejects Unity reaction_time_ms metric when %s',
    async (_label, metricPatch) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      const dto = validUnityTrainingResultDto();

      await expect(
        service.submitTrainingResult(
          doctorUser,
          'session-id',
          validUnityTrainingResultDto({
            motionMetrics: dto.motionMetrics.map((metric) =>
              metric.metricType === 'reaction_time_ms'
                ? { ...metric, ...metricPatch }
                : metric,
            ),
          }),
        ),
      ).rejects.toThrow(/采样窗口必须精确绑定训练会话/);

      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    },
  );

  it('rejects physiological metric types without customer wearable evidence', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto({
          motionMetrics: [
            ...validUnityTrainingResultDto().motionMetrics,
            {
              metricType: 'heart_rate_bpm',
              metricValue: 78,
              unit: 'bpm',
              qualityFlag: 'valid',
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it.each([
    'reaction_time_ms',
    'target_hit_rate',
    'arm_raise_accuracy',
    'duration_seconds',
    'difficulty_level',
  ])(
    'rejects Unity training result missing required motion metric %s',
    async (missingMetricType) => {
      const { prisma, service } = createService();
      mockTrainingAccess(prisma);
      prisma.trainingSession.findUnique.mockResolvedValue({
        id: 'session-id',
        patientId: 'patient-profile-id',
        collectionBatchId: 'collection-batch-id',
        gameRunId: 'run-001',
        unityBuildVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        clientStartedAt: new Date('2026-05-20T06:00:00.000Z'),
        runtimeConfigSnapshot: validTrainingRuntimeConfigSnapshot(),
        result: null,
        collectionBatch: formalCollectionBatch,
        gameContent: unityGameContent,
      });

      const motionMetrics = validUnityTrainingResultDto().motionMetrics.filter(
        (metric) => metric.metricType !== missingMetricType,
      );

      await expect(
        service.submitTrainingResult(
          doctorUser,
          'session-id',
          validUnityTrainingResultDto({ motionMetrics }),
        ),
      ).rejects.toThrow(missingMetricType);

      expect(prisma.trainingSession.update).not.toHaveBeenCalled();
      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    },
  );

  it('rejects training result without dynamic difficulty evidence', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validUnityTrainingResultDto({
          metricsSummary: {
            source: 'unity_webgl',
            gameRunId: 'run-001',
            gameVersion: '1.0.0',
            protocolVersion: '1.0.0',
            clientGeneratedAt: '2026-05-20T06:30:00.000Z',
            rawPayloadHash: 'hash-001',
            collectionBatchId: 'collection-batch-id',
          },
        }),
      ),
    ).rejects.toThrow(/动态难度证据/);

    expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it('creates a training result when browser pose game source matches runtime', async () => {
    const { prisma, service } = createService();
    mockTrainingAccess(prisma);
    prisma.trainingSession.findUnique.mockResolvedValue({
      id: 'session-id',
      patientId: 'patient-profile-id',
      planItemId: 'plan-item-id',
      collectionBatchId: 'browser-collection-batch-id',
      gameRunId: 'pose-run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      clientStartedAt: new Date('2026-05-20T06:00:00.000Z'),
      runtimeConfigSnapshot: validBrowserPoseRuntimeConfigSnapshot(),
      result: null,
      collectionBatch: browserCollectionBatch,
      gameContent: browserPoseGameContent,
    });
    prisma.trainingResult.create.mockResolvedValue({
      id: 'result-id',
      score: 88,
    });

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validBrowserPoseTrainingResultDto(),
      ),
    ).resolves.toMatchObject({
      id: 'result-id',
      score: 88,
    });

    expect(prisma.trainingResult.create).toHaveBeenCalledWith({
      data: objectContaining({
        sessionId: 'session-id',
        source: 'browser_pose_canvas',
        gameRunId: 'pose-run-001',
        gameVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        rawPayloadHash: 'pose-hash-001',
        collectionBatchId: 'browser-collection-batch-id',
        score: 88,
        metricsSummary: objectContaining({
          dynamicDifficultyEvidence:
            validBrowserPoseDynamicDifficultyEvidence(),
        }),
      }),
    });
    expect(prisma.motionMetric.createMany).toHaveBeenCalledWith({
      data: [
        objectContaining({
          trainingSessionId: 'session-id',
          collectionBatchId: 'browser-collection-batch-id',
          gameRunId: 'pose-run-001',
          source: 'browser_pose_canvas',
          metricType: 'reaction_time_ms',
          metricValue: 760,
          unit: 'ms',
          confidence: 0.9,
          sampleCount: 4,
        }),
        objectContaining({
          collectionBatchId: 'browser-collection-batch-id',
          metricType: 'target_hit_rate',
        }),
        objectContaining({
          collectionBatchId: 'browser-collection-batch-id',
          metricType: 'pose_visibility_avg',
        }),
        objectContaining({
          collectionBatchId: 'browser-collection-batch-id',
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
      planItemId: 'plan-item-id',
      collectionBatchId: 'browser-collection-batch-id',
      gameRunId: 'pose-run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      clientStartedAt: new Date('2026-05-20T06:00:00.000Z'),
      runtimeConfigSnapshot: validBrowserPoseRuntimeConfigSnapshot(),
      result: null,
      collectionBatch: browserCollectionBatch,
      gameContent: browserPoseGameContent,
    });

    const dto = validBrowserPoseTrainingResultDto();
    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        ...dto,
        motionMetrics: [dto.motionMetrics[0]],
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
      planItemId: 'plan-item-id',
      collectionBatchId: 'browser-collection-batch-id',
      gameRunId: 'pose-run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      clientStartedAt: new Date('2026-05-20T06:00:00.000Z'),
      runtimeConfigSnapshot: validBrowserPoseRuntimeConfigSnapshot(),
      result: null,
      collectionBatch: browserCollectionBatch,
      gameContent: browserPoseGameContent,
    });

    const dto = validBrowserPoseTrainingResultDto();
    const [firstMetric, ...remainingMetrics] = dto.motionMetrics;
    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        ...dto,
        motionMetrics: [
          { ...firstMetric, qualityFlag: undefined },
          ...remainingMetrics,
        ],
      }),
    ).rejects.toThrow(/qualityFlag|质量标记/);

    expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it('rejects aggregate-only cognitive web evidence without per-round facts before writing', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = validCognitiveTrainingResultDto();
    const aggregateOnlyMetricsSummary = {
      ...dto.metricsSummary,
    } as Record<string, unknown>;
    delete aggregateOnlyMetricsSummary.rounds;

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        ...dto,
        metricsSummary:
          aggregateOnlyMetricsSummary as unknown as Prisma.InputJsonValue,
      }),
    ).rejects.toThrow(/rounds|逐轮|轮次/);

    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    expect(prisma.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it('rejects self-consistent cognitive aggregates that disagree with per-round answers before writing', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = validCognitiveTrainingResultDto();
    dto.metricsSummary.rounds[0].answers = ['blue', 'green', 'yellow', 'red'];

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).rejects.toThrow(/correctStepCount|逐轮|作答/);

    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    expect(prisma.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['completedRoundCount', 2],
    ['attemptCount', 5],
    ['correctStepCount', 4],
    ['totalStepCount', 5],
    ['mistakeCount', 2],
  ])(
    'rejects cognitive canonical summary count %s when only that field differs from per-round facts',
    async (field, forgedValue) => {
      const dto = validCognitiveTrainingResultDto();
      (dto.metricsSummary as Record<string, unknown>)[field] = forgedValue;

      await expectCognitiveResultRejectedBeforeWrite(
        dto,
        /汇总计数与逐轮.*作答事实不一致/,
      );
    },
  );

  it.each([
    ['sequenceRecallRate', 0.751],
    ['pathCompletionRate', 0.999],
  ])(
    'rejects cognitive metricsSummary.%s when it differs from per-round facts',
    async (field, forgedValue) => {
      const dto = validCognitiveTrainingResultDto();
      (dto.metricsSummary as Record<string, unknown>)[field] = forgedValue;

      await expectCognitiveResultRejectedBeforeWrite(dto, new RegExp(field));
    },
  );

  it.each([
    ['score', 81],
    ['completionRate', 0.999],
    ['motionAccuracy', 0.751],
    ['reactionTimeMs', 1001],
  ])(
    'rejects cognitive top-level %s when it differs from per-round facts',
    async (field, forgedValue) => {
      const dto = validCognitiveTrainingResultDto();
      (dto as unknown as Record<string, unknown>)[field] = forgedValue;

      await expectCognitiveResultRejectedBeforeWrite(dto, new RegExp(field));
    },
  );

  it.each([
    [
      'sequence metricValue',
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.motionMetrics[0].metricValue = 0.751;
      },
      /sequence_recall_rate.*metricValue/,
    ],
    [
      'path metricValue',
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.motionMetrics[1].metricValue = 0.999;
      },
      /path_completion_rate.*metricValue/,
    ],
    [
      'sampleCount',
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.motionMetrics[0].sampleCount = 2;
      },
      /sampleCount/,
    ],
    [
      'rawSummary aggregate',
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.motionMetrics[1].rawSummary.correctStepCount = 4;
      },
      /rawSummary.*correctStepCount/,
    ],
    [
      'missing rawSummary',
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        Reflect.deleteProperty(dto.motionMetrics[0], 'rawSummary');
      },
      /rawSummary/,
    ],
  ])(
    'rejects cognitive motion metric mismatch: %s',
    async (_label, mutate, expected) => {
      const dto = validCognitiveTrainingResultDto();
      mutate(dto);

      await expectCognitiveResultRejectedBeforeWrite(dto, expected);
    },
  );

  describe.each([
    ['sequence_recall_rate', 0],
    ['path_completion_rate', 1],
  ])(
    'cognitive %s rawSummary canonical validation',
    (metricType, metricIndex) => {
      it.each([
        ['source', 'browser_pose_canvas'],
        ['gameRunId', 'memory-run-002'],
        ['sequenceRecallRate', 0.751],
        ['pathCompletionRate', 0.999],
        ['completedRoundCount', 2],
        ['attemptCount', 5],
        ['correctStepCount', 4],
        ['totalStepCount', 5],
        ['mistakeCount', 2],
      ])('rejects a forged %s before writing', async (field, forgedValue) => {
        const dto = validCognitiveTrainingResultDto();
        const rawSummary = dto.motionMetrics[metricIndex].rawSummary as Record<
          string,
          unknown
        >;
        rawSummary[field] = forgedValue;
        const expected =
          field === 'source' || field === 'gameRunId'
            ? new RegExp(`${metricType}\\.rawSummary 身份与当前训练不一致`)
            : new RegExp(`${metricType}\\.rawSummary\\.${field}`);

        await expectCognitiveResultRejectedBeforeWrite(dto, expected);
      });
    },
  );

  it.each([
    [
      'an extra unknown metric',
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.motionMetrics.push({
          ...structuredClone(dto.motionMetrics[0]),
          metricType: 'client_attention_score',
        });
      },
    ],
    [
      'a whitespace-padded duplicate metric type',
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.motionMetrics.push({
          ...structuredClone(dto.motionMetrics[0]),
          metricType: ' sequence_recall_rate ',
        });
      },
    ],
    [
      'a duplicate canonical required metric',
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.motionMetrics.push(structuredClone(dto.motionMetrics[0]));
      },
    ],
  ])(
    'rejects cognitive motionMetrics containing %s',
    async (_label, mutate) => {
      const dto = validCognitiveTrainingResultDto();
      mutate(dto);

      await expectCognitiveResultRejectedBeforeWrite(
        dto,
        /motionMetrics|指标集合|metricType|必须且只能提供(?:两项|一次)/,
      );
    },
  );

  it.each([
    [
      'metricsSummary',
      false,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        (dto.metricsSummary as Record<string, unknown>).attestedBy = 'client';
      },
    ],
    [
      'round',
      false,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        (dto.metricsSummary.rounds[0] as Record<string, unknown>).runtimeState =
          'active';
      },
    ],
    [
      'difficulty',
      false,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        (
          dto.metricsSummary.rounds[0].difficulty as Record<string, unknown>
        ).runtimeOnly = true;
      },
    ],
    [
      'dynamicDifficultyEvidence',
      false,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        (
          dto.metricsSummary.dynamicDifficultyEvidence as Record<
            string,
            unknown
          >
        ).attestedBy = 'client';
      },
    ],
    [
      'event',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const adjusted = dto;
        (
          adjusted.metricsSummary.dynamicDifficultyEvidence.events[0] as Record<
            string,
            unknown
          >
        ).runtimeState = 'active';
      },
    ],
    [
      'before',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const adjusted = dto;
        (
          adjusted.metricsSummary.dynamicDifficultyEvidence.events[0]
            .before as Record<string, unknown>
        ).runtimeOnly = true;
      },
    ],
    [
      'after',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const adjusted = dto;
        (
          adjusted.metricsSummary.dynamicDifficultyEvidence.events[0]
            .after as Record<string, unknown>
        ).runtimeOnly = true;
      },
    ],
    [
      'windowMetrics',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const adjusted = dto;
        (
          adjusted.metricsSummary.dynamicDifficultyEvidence.events[0]
            .windowMetrics as Record<string, unknown>
        ).runtimeOnly = true;
      },
    ],
    [
      'rawSummary',
      false,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        (
          dto.motionMetrics[0].rawSummary as Record<string, unknown>
        ).attestedBy = 'client';
      },
    ],
  ])(
    'rejects a cognitive %s object with an extra key before writing',
    async (boundary, usesAdjustment, mutate) => {
      const dto = usesAdjustment
        ? cognitiveTrainingResultDtoWithAdjustment()
        : validCognitiveTrainingResultDto();
      mutate(dto);

      await expectCognitiveResultRejectedBeforeWrite(
        dto,
        new RegExp(`${boundary}.*(?:额外字段|键集合|字段必须精确)`),
      );
    },
  );

  it.each([
    [
      'metricsSummary.source',
      false,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.metricsSummary.source = ' cognitive_web ';
      },
    ],
    [
      'metricsSummary.gameRunId',
      false,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.metricsSummary.gameRunId = ' memory-run-001 ';
      },
    ],
    [
      'metricsSummary.rawPayloadHash',
      false,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.metricsSummary.rawPayloadHash = ` sha256:${'a'.repeat(64)} `;
      },
    ],
    [
      'rawSummary.source',
      false,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.motionMetrics[0].rawSummary.source = ' cognitive_web ';
      },
    ],
    [
      'rawSummary.gameRunId',
      false,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        dto.motionMetrics[0].rawSummary.gameRunId = ' memory-run-001 ';
      },
    ],
    [
      'event.startingLevelSource',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const event = dto.metricsSummary.dynamicDifficultyEvidence.events[0];
        event.startingLevelSource = ' clinician_approved_plan ';
      },
    ],
    [
      'event.approvedPlanItemId',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const event = dto.metricsSummary.dynamicDifficultyEvidence.events[0];
        event.approvedPlanItemId = ' plan-item-id ';
      },
    ],
    [
      'event.assessmentSourceId',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const event = dto.metricsSummary.dynamicDifficultyEvidence.events[0];
        event.assessmentSourceId = ' assessment-approved-001 ';
      },
    ],
    [
      'event.triggerReason',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const event = dto.metricsSummary.dynamicDifficultyEvidence.events[0];
        event.triggerReason = ' accuracy_high ';
      },
    ],
    [
      'event.adjustedAt',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const event = dto.metricsSummary.dynamicDifficultyEvidence.events[0];
        event.adjustedAt = ' 2026-05-20T06:20:00.000Z ';
      },
    ],
    [
      'event.runtimeFrameId',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const event = dto.metricsSummary.dynamicDifficultyEvidence.events[0];
        event.runtimeFrameId = ' memory-run-001:cognitive-round-round-1 ';
      },
    ],
    [
      'event.runtimeWindowId',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const event = dto.metricsSummary.dynamicDifficultyEvidence.events[0];
        event.runtimeWindowId = ' memory-run-001:rounds:round-1-round-1 ';
      },
    ],
    [
      'event.windowRoundIds',
      true,
      (dto: ReturnType<typeof validCognitiveTrainingResultDto>) => {
        const event = dto.metricsSummary.dynamicDifficultyEvidence.events[0];
        event.windowRoundIds[0] = ' round-1 ';
      },
    ],
  ])(
    'rejects whitespace-padded cognitive identity %s before writing',
    async (identity, usesAdjustment, mutate) => {
      const dto = usesAdjustment
        ? cognitiveTrainingResultDtoWithAdjustment()
        : validCognitiveTrainingResultDto();
      mutate(dto);

      await expectCognitiveResultRejectedBeforeWrite(
        dto,
        new RegExp(
          `${identity.replaceAll('.', '\\.')}.*(?:精确|首尾空白|canonical)`,
        ),
      );
    },
  );

  it.each([
    ['string decimal', '360.5'],
    ['fractional number', 360.5],
    ['boolean', true],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ])(
    'rejects cognitive durationSeconds when it is %s before writing',
    async (_label, forgedDuration) => {
      const dto = validCognitiveTrainingResultDto();
      (dto as unknown as Record<string, unknown>).durationSeconds =
        forgedDuration;

      await expectCognitiveResultRejectedBeforeWrite(
        dto,
        /durationSeconds|训练时长.*正整数/,
      );
    },
  );

  it.each([
    [
      'duplicate round id',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[1].id = 'round-1';
      },
      /round-2|连续|重复/,
    ],
    [
      'non-contiguous round id',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[1].id = 'round-3';
      },
      /round-2|连续/,
    ],
    [
      'round id with surrounding whitespace',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[1].id = ' round-2 ';
      },
      /round-2|连续/,
    ],
    [
      'duplicate sequence value',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[1].sequence = [
          'blue',
          'green',
          'yellow',
          'red',
          'red',
        ];
      },
      /sequence.*唯一|重复/,
    ],
    [
      'duplicate answer value',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[1].answers = [
          'blue',
          'green',
          'yellow',
          'red',
          'red',
        ];
      },
      /answers.*唯一|重复/,
    ],
    [
      'difficulty rule mismatch',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[1].difficulty.optionCount = 99;
      },
      /difficulty|难度|optionCount/,
    ],
    [
      'difficultyLevel mismatch',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[1].difficultyLevel = 2;
      },
      /difficultyLevel/,
    ],
    [
      'fractional timestamp',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[1].completedAtMs += 0.5;
      },
      /completedAtMs.*整数|时间/,
    ],
    [
      'round timestamp order',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[1].answerStartedAtMs =
          dto.metricsSummary.rounds[1].presentedAtMs - 1;
      },
      /时间|answerStartedAtMs/,
    ],
    [
      'round outside session window',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[0].presentedAtMs = Date.parse(
          '2026-05-20T05:59:59.999Z',
        );
      },
      /会话|时间/,
    ],
    [
      'overlapping rounds',
      (dto: ReturnType<typeof cognitiveTrainingResultDtoWithAdjustment>) => {
        dto.metricsSummary.rounds[1].presentedAtMs =
          dto.metricsSummary.rounds[0].completedAtMs - 1;
      },
      /重叠|时间/,
    ],
  ])(
    'rejects invalid cognitive per-round facts: %s',
    async (_label, mutate, expected) => {
      const dto = cognitiveTrainingResultDtoWithAdjustment();
      mutate(dto);

      await expectCognitiveResultRejectedBeforeWrite(dto, expected);
    },
  );

  it('accepts a truthful one-round cognitive web result without a difficulty adjustment event', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    prisma.trainingResult.create.mockResolvedValue({
      id: 'result-id',
      score: 80,
    });

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validCognitiveTrainingResultDto(),
      ),
    ).resolves.toMatchObject({
      id: 'result-id',
      score: 80,
    });

    expect(
      mockArgs<{ where: { consentType: string } }>(
        prisma.consentRecord.findFirst,
      ).map((args) => args.where.consentType),
    ).toEqual(['privacy_policy']);
    expect(prisma.trainingResult.create).toHaveBeenCalledWith({
      data: objectContaining({
        sessionId: 'session-id',
        source: 'cognitive_web',
        gameRunId: 'memory-run-001',
        gameVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        rawPayloadHash: `sha256:${'a'.repeat(64)}`,
        collectionBatchId: 'cognitive-collection-batch-id',
        metricsSummary: objectContaining({
          completedRoundCount: 1,
          difficultyAdjustmentCount: 0,
          dynamicDifficultyEvidence:
            validCognitiveTrainingResultDto().metricsSummary
              .dynamicDifficultyEvidence,
        }),
      }),
    });
    expect(prisma.motionMetric.createMany).toHaveBeenCalledWith({
      data: [
        objectContaining({
          trainingSessionId: 'session-id',
          collectionBatchId: 'cognitive-collection-batch-id',
          gameRunId: 'memory-run-001',
          source: 'cognitive_web',
          metricType: 'sequence_recall_rate',
          metricValue: 0.75,
        }),
        objectContaining({
          source: 'cognitive_web',
          metricType: 'path_completion_rate',
          metricValue: 1,
        }),
      ],
    });
  });

  it('persists cognitive canonical objects without retaining client references', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    prisma.trainingResult.create.mockResolvedValue({ id: 'result-id' });
    const dto = cognitiveTrainingResultDtoWithAdjustment();

    await service.submitTrainingResult(doctorUser, 'session-id', dto);

    const persistedSummary = mockArg<{
      data: { metricsSummary: Record<string, unknown> };
    }>(prisma.trainingResult.create).data.metricsSummary;
    const persistedMetrics = mockArg<{
      data: Array<{ rawSummary: Record<string, unknown> }>;
    }>(prisma.motionMetric.createMany).data;
    const persistedSnapshot = structuredClone({
      persistedSummary,
      persistedMetrics,
    });
    expect(Object.keys(persistedSummary).sort()).toEqual(
      [
        'attemptCount',
        'clientGeneratedAt',
        'collectionBatchId',
        'completedRoundCount',
        'correctStepCount',
        'difficultyAdjustmentCount',
        'dynamicDifficultyEvidence',
        'gameRunId',
        'gameVersion',
        'mistakeCount',
        'pathCompletionRate',
        'prescribedDurationSeconds',
        'protocolVersion',
        'rawInputStored',
        'rawPayloadHash',
        'rounds',
        'sequenceRecallRate',
        'source',
        'totalStepCount',
      ].sort(),
    );
    expect(persistedMetrics).toHaveLength(2);
    expect(persistedMetrics.map((metric) => metric.rawSummary)).toEqual([
      {
        source: 'cognitive_web',
        gameRunId: 'memory-run-001',
        sequenceRecallRate: 0.889,
        pathCompletionRate: 1,
        completedRoundCount: 2,
        attemptCount: 9,
        correctStepCount: 8,
        totalStepCount: 9,
        mistakeCount: 1,
      },
      {
        source: 'cognitive_web',
        gameRunId: 'memory-run-001',
        sequenceRecallRate: 0.889,
        pathCompletionRate: 1,
        completedRoundCount: 2,
        attemptCount: 9,
        correctStepCount: 8,
        totalStepCount: 9,
        mistakeCount: 1,
      },
    ]);

    dto.metricsSummary.rounds[0].sequence[0] = 'forged-after-submit';
    dto.metricsSummary.dynamicDifficultyEvidence.events[0].before.speed = 999;
    dto.motionMetrics[0].rawSummary.correctStepCount = 999;

    expect({ persistedSummary, persistedMetrics }).toEqual(persistedSnapshot);
    expect(persistedSummary).not.toBe(dto.metricsSummary);
    expect(persistedMetrics[0].rawSummary).not.toBe(
      dto.motionMetrics[0].rawSummary,
    );
  });

  it('snapshots the complete cognitive DTO before the first await', async () => {
    const { prisma, service } = createService();
    const session = mockCognitiveTrainingResultSession(prisma);
    prisma.trainingResult.create.mockResolvedValue({ id: 'result-id' });
    let resolveSession!: (value: typeof session) => void;
    prisma.trainingSession.findUnique.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    const dto = cognitiveTrainingResultDtoWithAdjustment();

    const pending = service.submitTrainingResult(doctorUser, 'session-id', dto);
    dto.score = 1;
    dto.completionRate = 0.5;
    dto.durationSeconds = 361;
    dto.reactionTimeMs = 999;
    dto.motionAccuracy = 0.1;
    dto.exerciseIntensity = 'moderate';
    dto.metricsSummary.prescribedDurationSeconds = 361;
    dto.metricsSummary.rawPayloadHash = `sha256:${'b'.repeat(64)}`;
    dto.metricsSummary.rounds[0].sequence[0] = 'forged-after-call';
    dto.metricsSummary.dynamicDifficultyEvidence.events[0].before.speed = 999;
    dto.motionMetrics[0].metricValue = 0.1;
    dto.motionMetrics[0].windowStartedAt = '2026-05-20T06:05:00.000Z';
    dto.motionMetrics[0].rawSummary.correctStepCount = 2;
    resolveSession(session);

    await expect(pending).resolves.toMatchObject({ id: 'result-id' });
    const resultData = mockArg<{
      data: {
        score: number;
        completionRate: number;
        durationSeconds: number;
        reactionTimeMs: number;
        motionAccuracy: number;
        exerciseIntensity: string;
        rawPayloadHash: string;
        metricsSummary: {
          rawPayloadHash: string;
          rounds: Array<{ sequence: string[] }>;
          dynamicDifficultyEvidence: {
            events: Array<{ before: { speed: number } }>;
          };
        };
      };
    }>(prisma.trainingResult.create).data;
    const metricData = mockArg<{
      data: Array<{
        metricValue: number;
        windowStartedAt: Date;
        windowEndedAt: Date;
        rawSummary: { correctStepCount: number };
      }>;
    }>(prisma.motionMetric.createMany).data;
    expect(resultData.score).toBe(91);
    expect(resultData.completionRate).toBe(1);
    expect(resultData.durationSeconds).toBe(360);
    expect(resultData.reactionTimeMs).toBe(1000);
    expect(resultData.motionAccuracy).toBe(0.889);
    expect(resultData.exerciseIntensity).toBe('low');
    expect(resultData.rawPayloadHash).toBe(`sha256:${'a'.repeat(64)}`);
    expect(resultData.metricsSummary.rawPayloadHash).toBe(
      `sha256:${'a'.repeat(64)}`,
    );
    expect(resultData.metricsSummary.rounds[0].sequence[0]).toBe('blue');
    expect(
      resultData.metricsSummary.dynamicDifficultyEvidence.events[0].before
        .speed,
    ).toBe(1.231);
    expect(metricData[0].metricValue).toBe(0.889);
    expect(metricData[0].windowStartedAt).toEqual(
      new Date('2026-05-20T06:00:00.000Z'),
    );
    expect(metricData[0].windowEndedAt).toEqual(
      new Date('2026-05-20T06:30:00.000Z'),
    );
    expect(metricData[0].rawSummary.correctStepCount).toBe(8);
  });

  it.each([
    ['windowStartedAt', '2026-05-20T06:00:00.001Z'],
    ['windowEndedAt', '2099-01-01T00:00:00.000Z'],
  ])(
    'rejects cognitive motion metric %s that is not exactly session-bound',
    async (field, forgedValue) => {
      const dto = validCognitiveTrainingResultDto();
      for (const metric of dto.motionMetrics) {
        Object.assign(metric, { [field]: forgedValue });
      }

      await expectCognitiveResultRejectedBeforeWrite(
        dto,
        new RegExp(`${field}|动作指标窗口|训练会话|结果完成时间`),
      );
    },
  );

  it('rejects cognitive evidence with a forged sequenceLength', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = cognitiveTrainingResultDtoWithAdjustment();
    dto.metricsSummary.dynamicDifficultyEvidence.events[0].before.sequenceLength = 99;

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).rejects.toThrow(/sequenceLength/);
  });

  it('rejects cognitive evidence with a forged optionCount', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = cognitiveTrainingResultDtoWithAdjustment();
    dto.metricsSummary.dynamicDifficultyEvidence.events[0].after.optionCount = 99;

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).rejects.toThrow(/optionCount/);
  });

  it('rejects cognitive evidence with a forged presentationMs', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = cognitiveTrainingResultDtoWithAdjustment();
    dto.metricsSummary.dynamicDifficultyEvidence.events[0].after.presentationMs = 999;

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).rejects.toThrow(/presentationMs/);
  });

  it('rejects a non-contiguous cognitive difficulty ladder transition', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = cognitiveTrainingResultDtoWithAdjustment();
    dto.metricsSummary.dynamicDifficultyEvidence.events[0].after = {
      speed: 2.133,
      complexityLevel: 3,
      sequenceLength: 6,
      optionCount: 7,
      presentationMs: 1500,
    };

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).rejects.toThrow(/连续|阶梯|after/);
  });

  it('rejects cognitive round and window identities that only share the gameRunId prefix', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = cognitiveTrainingResultDtoWithAdjustment({
      runtimeFrameId: 'memory-run-001:cognitive-round-round-2',
      runtimeWindowId: 'memory-run-001:rounds:round-2-round-2',
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).rejects.toThrow(/runtimeFrameId|runtimeWindowId|轮次/);
  });

  it('rejects forged cognitive windowMetrics', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = cognitiveTrainingResultDtoWithAdjustment({
      windowMetrics: {
        attemptCount: 4,
        correctCount: 4,
        accuracy: 0.5,
        averageResponseTimeMs: 1000,
      },
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).rejects.toThrow(/windowMetrics|accuracy/);
  });

  it.each([
    [
      'before references another valid difficulty tier',
      {
        before: {
          speed: 1,
          complexityLevel: 1,
          sequenceLength: 3,
          optionCount: 4,
          presentationMs: 3200,
        },
      },
      /before 与真实轮次 difficulty 不一致/,
    ],
    [
      'windowMetrics.attemptCount is a valid but incorrect integer',
      {
        windowMetrics: {
          attemptCount: 5,
          correctCount: 4,
          accuracy: 1,
          averageResponseTimeMs: 1000,
        },
      },
      /windowMetrics 与 windowRoundIds 指向的真实轮次不一致/,
    ],
    [
      'windowMetrics.correctCount is a valid but incorrect integer',
      {
        windowMetrics: {
          attemptCount: 4,
          correctCount: 3,
          accuracy: 1,
          averageResponseTimeMs: 1000,
        },
      },
      /windowMetrics 与 windowRoundIds 指向的真实轮次不一致/,
    ],
    [
      'triggerReason is supported but disagrees with the real round',
      { triggerReason: 'accuracy_low' },
      /triggerReason 与真实轮次重算结果不一致/,
    ],
    [
      'adjustedAt is an ISO timestamp before the referenced round was presented',
      { adjustedAt: '2026-05-20T06:19:59.999Z' },
      /adjustedAt 必须位于 windowRoundIds 指向的真实轮次时间内/,
    ],
  ])(
    'rejects an isolated cognitive dynamic guard mismatch when %s',
    async (_label, eventOverrides, expected) => {
      const dto = cognitiveTrainingResultDtoWithAdjustment(eventOverrides);

      await expectCognitiveResultRejectedBeforeWrite(dto, expected);
    },
  );

  it('rejects cognitive window response time that differs from its real round even when the trigger is unchanged', async () => {
    const dto = cognitiveTrainingResultDtoWithAdjustment({
      windowMetrics: {
        attemptCount: 4,
        correctCount: 4,
        accuracy: 1,
        averageResponseTimeMs: 1001,
      },
    });

    await expectCognitiveResultRejectedBeforeWrite(
      dto,
      /windowMetrics\.averageResponseTimeMs|真实轮次/,
    );
  });

  it('rejects cognitive windowMetrics that disagree with the referenced round answers', async () => {
    const dto = cognitiveTrainingResultDtoWithAdjustment();
    dto.metricsSummary.rounds[0].answers = [
      'blue',
      'green',
      'yellow',
      'purple',
    ];
    dto.metricsSummary.correctStepCount = 7;
    dto.metricsSummary.mistakeCount = 2;
    dto.metricsSummary.sequenceRecallRate = 0.778;
    dto.score = 82;
    dto.motionAccuracy = 0.778;
    dto.motionMetrics[0].metricValue = 0.778;
    for (const metric of dto.motionMetrics) {
      metric.rawSummary.correctStepCount = 7;
      metric.rawSummary.mistakeCount = 2;
      metric.rawSummary.sequenceRecallRate = 0.778;
    }

    await expectCognitiveResultRejectedBeforeWrite(
      dto,
      /windowMetrics|真实轮次|triggerReason/,
    );
  });

  it('rejects cognitive adjustedAt after its referenced round completed', async () => {
    const dto = cognitiveTrainingResultDtoWithAdjustment({
      adjustedAt: '2026-05-20T06:20:06.001Z',
    });

    await expectCognitiveResultRejectedBeforeWrite(
      dto,
      /adjustedAt|轮次.*时间/,
    );
  });

  it('rejects cognitive adjustedAt after the result completedAt', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = cognitiveTrainingResultDtoWithAdjustment({
      adjustedAt: '2099-01-01T00:00:00.000Z',
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).rejects.toThrow(/adjustedAt|完成时间/);
  });

  it('rejects cognitive startingLevelSource that differs from the server config', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = cognitiveTrainingResultDtoWithAdjustment({
      startingLevelSource: 'clinician_approved_assessment',
    });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).rejects.toThrow(/startingLevelSource/);
  });

  it('rejects empty cognitive events for a claimed multi-round result', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = validCognitiveTrainingResultDto();

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        ...dto,
        metricsSummary: {
          ...dto.metricsSummary,
          completedRoundCount: 2,
          attemptCount: 8,
          correctStepCount: 6,
          totalStepCount: 8,
          mistakeCount: 2,
        },
      }),
    ).rejects.toThrow(/events|单轮|completedRoundCount|汇总计数|逐轮/);
  });

  it('rejects empty cognitive events when the single-round counts do not match the starting difficulty', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = validCognitiveTrainingResultDto();

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        ...dto,
        metricsSummary: {
          ...dto.metricsSummary,
          attemptCount: 5,
          totalStepCount: 5,
          correctStepCount: 4,
          mistakeCount: 1,
        },
      }),
    ).rejects.toThrow(/attemptCount|totalStepCount|起始难度|汇总计数|逐轮/);
  });

  it('accepts complete cognitive evidence bound to the server session', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    prisma.trainingResult.create.mockResolvedValue({ id: 'result-id' });

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        cognitiveTrainingResultDtoWithAdjustment(),
      ),
    ).resolves.toMatchObject({ id: 'result-id' });
  });

  it('rejects a real non-boundary multi-round cognitive chain when its event is missing', async () => {
    const dto = cognitiveTrainingResultDtoWithAdjustment();
    dto.metricsSummary.difficultyAdjustmentCount = 0;
    dto.metricsSummary.dynamicDifficultyEvidence.events = [];

    await expectCognitiveResultRejectedBeforeWrite(
      dto,
      /事件缺失|event.*缺失|连续难度调整/,
    );
  });

  it('rejects a cognitive adjustment event for the final round without a next real round', async () => {
    const dto = validCognitiveTrainingResultDto();
    dto.metricsSummary.difficultyAdjustmentCount = 1;
    (
      dto.metricsSummary.dynamicDifficultyEvidence.events as Array<
        Record<string, unknown>
      >
    ).push({
      startingLevel: 2,
      startingLevelSource: 'clinician_approved_plan',
      approvedPlanItemId: 'plan-item-id',
      assessmentSourceId: 'assessment-approved-001',
      triggerReason: 'accuracy_low',
      before: {
        speed: 1.231,
        complexityLevel: 2,
        sequenceLength: 4,
        optionCount: 5,
        presentationMs: 2600,
      },
      after: {
        speed: 1,
        complexityLevel: 1,
        sequenceLength: 3,
        optionCount: 4,
        presentationMs: 3200,
      },
      windowRoundIds: ['round-1'],
      windowMetrics: {
        attemptCount: 4,
        correctCount: 3,
        accuracy: 0.75,
        averageResponseTimeMs: 1000,
      },
      adjustedAt: '2026-05-20T06:20:06.000Z',
      runtimeFrameId: 'memory-run-001:cognitive-round-round-1',
      runtimeWindowId: 'memory-run-001:rounds:round-1-round-1',
    });

    await expectCognitiveResultRejectedBeforeWrite(
      dto,
      /没有后续完成轮次|伪造|窗口轮次/,
    );
  });

  it('rejects a next-round difficulty that differs from the real event.after chain', async () => {
    const dto = cognitiveTrainingResultDtoWithAdjustment();
    const secondRound = dto.metricsSummary.rounds[1];
    secondRound.sequence = [
      'blue',
      'green',
      'yellow',
      'red',
      'purple',
      'orange',
    ];
    secondRound.answers = ['blue', 'green', 'yellow', 'red', 'purple', 'white'];
    secondRound.difficulty = {
      level: 3,
      sequenceLength: 6,
      optionCount: 7,
      presentationMs: 1500,
    };
    secondRound.completedAtMs = Date.parse('2026-05-20T06:20:14.000Z');
    dto.metricsSummary.attemptCount = 10;
    dto.metricsSummary.correctStepCount = 9;
    dto.metricsSummary.totalStepCount = 10;
    dto.metricsSummary.mistakeCount = 1;
    dto.metricsSummary.sequenceRecallRate = 0.9;
    dto.score = 92;
    dto.motionAccuracy = 0.9;
    dto.motionMetrics[0].metricValue = 0.9;
    for (const metric of dto.motionMetrics) {
      Object.assign(metric.rawSummary, {
        sequenceRecallRate: 0.9,
        attemptCount: 10,
        correctStepCount: 9,
        totalStepCount: 10,
        mistakeCount: 1,
      });
    }

    await expectCognitiveResultRejectedBeforeWrite(
      dto,
      /after.*下一轮 difficulty|连续难度链/,
    );
  });

  it('accepts unchanged consecutive rounds at the upper difficulty boundary without a fake event', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    prisma.trainingResult.create.mockResolvedValue({ id: 'result-id' });

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        cognitiveTrainingResultDtoAtUpperBoundary(),
      ),
    ).resolves.toMatchObject({ id: 'result-id' });
  });

  it('rejects a forged adjustment event at the upper difficulty boundary', async () => {
    const dto = cognitiveTrainingResultDtoAtUpperBoundary();
    dto.metricsSummary.difficultyAdjustmentCount = 3;
    dto.metricsSummary.dynamicDifficultyEvidence.events.push({
      startingLevel: 2,
      startingLevelSource: 'clinician_approved_plan',
      approvedPlanItemId: 'plan-item-id',
      assessmentSourceId: 'assessment-approved-001',
      triggerReason: 'accuracy_high',
      before: {
        speed: 2.133,
        complexityLevel: 3,
        sequenceLength: 6,
        optionCount: 7,
        presentationMs: 1500,
      },
      after: {
        speed: 2.133,
        complexityLevel: 3,
        sequenceLength: 6,
        optionCount: 7,
        presentationMs: 1500,
      },
      windowRoundIds: ['round-3'],
      windowMetrics: {
        attemptCount: 6,
        correctCount: 6,
        accuracy: 1,
        averageResponseTimeMs: 1000,
      },
      adjustedAt: '2026-05-20T06:20:21.000Z',
      runtimeFrameId: 'memory-run-001:cognitive-round-round-3',
      runtimeWindowId: 'memory-run-001:rounds:round-3-round-3',
    });

    await expectCognitiveResultRejectedBeforeWrite(
      dto,
      /边界难度|不存在的调整|伪造/,
    );
  });

  it('uses the mean of per-round response times instead of a globally weighted response time', async () => {
    const dto = cognitiveTrainingResultDtoWithAdjustment();
    dto.metricsSummary.rounds[1].completedAtMs = Date.parse(
      '2026-05-20T06:20:18.000Z',
    );
    dto.reactionTimeMs = 1500;
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    prisma.trainingResult.create.mockResolvedValue({ id: 'result-id' });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).resolves.toMatchObject({ id: 'result-id' });

    const forged = cognitiveTrainingResultDtoWithAdjustment();
    forged.metricsSummary.rounds[1].completedAtMs = Date.parse(
      '2026-05-20T06:20:18.000Z',
    );
    forged.reactionTimeMs = 1556;
    await expectCognitiveResultRejectedBeforeWrite(forged, /reactionTimeMs/);
  });

  it('calculates score from raw 13/27 accuracy before rounding the exposed rate', async () => {
    const dto = cognitiveTrainingResultDtoForRawScoreRounding();
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    prisma.trainingResult.create.mockResolvedValue({ id: 'result-id' });

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', dto),
    ).resolves.toMatchObject({ id: 'result-id' });

    const forged = cognitiveTrainingResultDtoForRawScoreRounding();
    forged.score = 58;
    await expectCognitiveResultRejectedBeforeWrite(forged, /score/);
  });

  it('rejects a first cognitive round that differs from the runtimeConfigSnapshot starting difficulty', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma, {
      startingDifficultyLevel: 1,
    });

    await expect(
      service.submitTrainingResult(
        doctorUser,
        'session-id',
        validCognitiveTrainingResultDto(),
      ),
    ).rejects.toThrow(/首轮 difficulty|起始难度/);
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    expect(prisma.trainingSession.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['empty array', []],
    ['non-array object', {}],
  ])('rejects cognitive rounds supplied as %s', async (_label, rounds) => {
    const dto = validCognitiveTrainingResultDto();
    (dto.metricsSummary as Record<string, unknown>).rounds = rounds;

    await expectCognitiveResultRejectedBeforeWrite(
      dto,
      /rounds.*非空逐轮事实数组/,
    );
  });

  it.each([
    ['approvedPlanItemId', { approvedPlanItemId: 'other-plan-item-id' }, 1],
    ['assessmentSourceId', { assessmentSourceId: 'other-assessment-id' }, 1],
    ['startingLevel', { startingLevel: 3 }, 1],
    ['runtimeFrameId', { runtimeFrameId: 'other-run-id:frame:round-1' }, 1],
    [
      'runtimeWindowId',
      { runtimeWindowId: 'other-run-id:difficulty-window:round-1' },
      1,
    ],
    ['difficultyAdjustmentCount', {}, 0],
  ])(
    'rejects cognitive difficulty evidence when %s breaks the server-owned evidence chain',
    async (field, eventPatch, difficultyAdjustmentCount) => {
      const { prisma, service } = createService();
      mockCognitiveTrainingResultSession(prisma);
      const dto = cognitiveTrainingResultDtoWithAdjustment(eventPatch);

      await expect(
        service.submitTrainingResult(doctorUser, 'session-id', {
          ...dto,
          metricsSummary: {
            ...dto.metricsSummary,
            difficultyAdjustmentCount,
          },
        }),
      ).rejects.toThrow(new RegExp(field));

      expect(prisma.trainingSession.update).not.toHaveBeenCalled();
      expect(prisma.trainingResult.create).not.toHaveBeenCalled();
      expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
    },
  );

  it('rejects cognitive web training result when cognitive metrics are incomplete', async () => {
    const { prisma, service } = createService();
    mockCognitiveTrainingResultSession(prisma);
    const dto = validCognitiveTrainingResultDto();

    await expect(
      service.submitTrainingResult(doctorUser, 'session-id', {
        ...dto,
        motionMetrics: dto.motionMetrics.filter(
          (metric) => metric.metricType !== 'path_completion_rate',
        ),
      }),
    ).rejects.toThrow(/path_completion_rate/);

    expect(prisma.trainingSession.update).not.toHaveBeenCalled();
    expect(prisma.trainingResult.create).not.toHaveBeenCalled();
    expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
  });

  it.each([
    [
      'unity session receiving browser pose result',
      'unity_webgl',
      'browser_pose_canvas',
    ],
    [
      'browser pose session receiving Unity result',
      'browser_pose_canvas',
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
        collectionBatchId:
          runtimeType === 'unity_webgl'
            ? 'collection-batch-id'
            : 'browser-collection-batch-id',
        gameRunId: 'run-001',
        unityBuildVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        result: null,
        collectionBatch:
          runtimeType === 'unity_webgl'
            ? formalCollectionBatch
            : browserCollectionBatch,
        gameContent:
          runtimeType === 'unity_webgl'
            ? unityGameContent
            : browserPoseGameContent,
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
            collectionBatchId: 'collection-batch-id',
            dynamicDifficultyEvidence: validDynamicDifficultyEvidence(),
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
      collectionBatchId: 'collection-batch-id',
      gameRunId: 'run-001',
      unityBuildVersion: '1.0.0',
      bridgeProtocolVersion: '1.0.0',
      result: {
        id: 'result-id',
      },
      collectionBatch: formalCollectionBatch,
      gameContent: unityGameContent,
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
          collectionBatchId: 'collection-batch-id',
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
        collectionBatchId: 'collection-batch-id',
        gameRunId: 'run-001',
        unityBuildVersion: '1.0.0',
        bridgeProtocolVersion: '1.0.0',
        result: null,
        collectionBatch: formalCollectionBatch,
        gameContent: unityGameContent,
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
  const trainingReviewPatientId = '238765ff-0433-442f-8522-f11780a88d38';
  const trainingReviewResultId = '0dc1c52c-f5c4-4fb1-96cb-5634b15260f4';

  function createService() {
    const prisma = {
      trainingResult: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      patientProfile: {
        findUnique: jest.fn(),
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
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
    };
  }

  const suspiciousResult = {
    id: trainingReviewResultId,
    sessionId: 'session-id',
    qualityFlag: 'suspicious',
    abnormalFlag: true,
    qualityReasons: ['训练时长过短', '完成率过低'],
    reviewStatus: null,
    reviewConclusion: null,
    reviewEnvelope: null,
    reviewedByUserId: null,
    reviewedAt: null,
    session: {
      id: 'session-id',
      patientId: trainingReviewPatientId,
      patient: encryptedPatientProfileFixture(trainingReviewPatientId),
    },
  };

  const expectedTrainingResultResponseSelect = {
    id: true,
    sessionId: true,
    collectionBatchId: true,
    source: true,
    gameRunId: true,
    gameVersion: true,
    bridgeProtocolVersion: true,
    submittedByUserId: true,
    submittedAt: true,
    clientGeneratedAt: true,
    rawPayloadHash: true,
    score: true,
    completionRate: true,
    durationSeconds: true,
    reactionTimeMs: true,
    motionAccuracy: true,
    exerciseIntensity: true,
    abnormalFlag: true,
    qualityFlag: true,
    qualityReasons: true,
    reviewStatus: true,
    reviewConclusion: true,
    reviewEnvelope: true,
    reviewedByUserId: true,
    reviewedAt: true,
    metricsSummary: true,
    createdAt: true,
  };

  it('allows responsible doctors to review suspicious training results and audits the conclusion', async () => {
    const { prisma, service } = createService();
    const reviewedAt = new Date('2026-05-20T07:00:00.000Z');
    const reviewedResultWithSession = {
      ...suspiciousResult,
      reviewStatus: 'reviewed',
      reviewConclusion: 'needs_retrain',
      reviewEnvelope: encryptedTrainingReviewField(
        trainingReviewResultId,
        '姿态置信度不足，本次结果不纳入训练趋势，请患者重新训练。',
      ),
      reviewedByUserId: 'doctor-user-id',
      reviewedAt,
    };
    const { session: _session, ...reviewedResult } = reviewedResultWithSession;
    void _session;
    prisma.trainingResult.findUnique
      .mockResolvedValueOnce(suspiciousResult)
      .mockResolvedValueOnce(reviewedResult);
    prisma.trainingResult.updateMany.mockResolvedValue({ count: 1 });

    const response = await service.reviewTrainingResult(
      doctorUser,
      trainingReviewResultId,
      {
        reviewConclusion: 'needs_retrain',
        reviewNote: '姿态置信度不足，本次结果不纳入训练趋势，请患者重新训练。',
      },
    );
    expect(response).toMatchObject({
      id: trainingReviewResultId,
      reviewStatus: 'reviewed',
      reviewConclusion: 'needs_retrain',
      reviewNote: '姿态置信度不足，本次结果不纳入训练趋势，请患者重新训练。',
      reviewedByUserId: 'doctor-user-id',
    });
    expect(response).not.toHaveProperty('session');
    expect(JSON.stringify(response)).not.toMatch(
      /identityEnvelope|contactEnvelope|careDetailsEnvelope|runtimeConfigSnapshot|idempotencyKey|deviceCode|lastUploadError|abortReason|motionMetrics|reviewEnvelope|ciphertext/,
    );

    expect(prisma.trainingResult.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: trainingReviewResultId },
      select: {
        id: true,
        sessionId: true,
        qualityFlag: true,
        abnormalFlag: true,
        reviewStatus: true,
        reviewConclusion: true,
        reviewEnvelope: true,
        reviewedByUserId: true,
        reviewedAt: true,
        session: {
          select: {
            patientId: true,
            patient: { select: { id: true, responsibleDoctorId: true } },
          },
        },
      },
    });
    expect(prisma.trainingResult.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: trainingReviewResultId },
      select: expectedTrainingResultResponseSelect,
    });

    expect(prisma.trainingResult.updateMany).toHaveBeenCalledWith({
      where: {
        id: trainingReviewResultId,
        sessionId: 'session-id',
        reviewStatus: null,
        reviewConclusion: null,
        reviewedByUserId: null,
        reviewedAt: null,
      },
      data: {
        reviewStatus: 'reviewed',
        reviewConclusion: 'needs_retrain',
        reviewEnvelope: anyValue(Object),
        reviewedByUserId: 'doctor-user-id',
        reviewedAt: anyValue(Date),
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'training_result.review',
        targetType: 'training_result',
        targetId: trainingReviewResultId,
        result: 'success',
        metadata: {
          patientId: trainingReviewPatientId,
          sessionId: 'session-id',
          reviewConclusion: 'needs_retrain',
        },
      },
    });
    const updateData = mockArg<{ data: Record<string, unknown> }>(
      prisma.trainingResult.updateMany,
    ).data;
    expect(updateData).not.toHaveProperty('reviewNote');
    expect(
      decryptSensitiveJson(
        updateData.reviewEnvelope,
        {
          tableName: 'training_result',
          recordId: trainingReviewResultId,
          fieldName: 'reviewEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      reviewNote: '姿态置信度不足，本次结果不纳入训练趋势，请患者重新训练。',
    });
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toMatch(
      /姿态置信度不足|reviewEnvelope|ciphertext/,
    );
  });

  it('hard-fails a reviewed response with an unsupported stored conclusion', async () => {
    const { prisma, service } = createService();
    const { session: _session, ...reviewedResult } = {
      ...suspiciousResult,
      reviewStatus: 'reviewed',
      reviewConclusion: 'unsupported_conclusion',
      reviewEnvelope: encryptedTrainingReviewField(
        trainingReviewResultId,
        '非法结论不应被返回。',
      ),
      reviewedByUserId: 'doctor-user-id',
      reviewedAt: new Date('2026-05-20T07:00:00.000Z'),
    };
    void _session;
    prisma.trainingResult.findUnique
      .mockResolvedValueOnce(suspiciousResult)
      .mockResolvedValueOnce(reviewedResult);
    prisma.trainingResult.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.reviewTrainingResult(doctorUser, trainingReviewResultId, {
        reviewConclusion: 'needs_retrain',
        reviewNote: '提交的合法结论不应掩盖数据库中的非法结论。',
      }),
    ).rejects.toThrow('训练复核状态与加密载荷不一致。');
  });

  it('rejects blank review conclusion and note before updating or auditing', async () => {
    const { prisma, service } = createService();

    await expect(
      service.reviewTrainingResult(doctorUser, trainingReviewResultId, {
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
      service.reviewTrainingResult(doctorUser, trainingReviewResultId, {
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
      reviewEnvelope: encryptedTrainingReviewField(
        trainingReviewResultId,
        '已要求重新训练。',
      ),
      reviewedByUserId: 'doctor-user-id',
      reviewedAt: new Date('2026-05-20T07:00:00.000Z'),
    });

    await expect(
      service.reviewTrainingResult(doctorUser, trainingReviewResultId, {
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
      service.reviewTrainingResult(auditorAdminUser, trainingReviewResultId, {
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
        targetId: trainingReviewPatientId,
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
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
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
    createdAt: new Date('2026-05-20T08:00:00.000Z'),
    updatedAt: new Date('2026-05-20T08:00:00.000Z'),
    supportsCamera: true,
    supportsMicrophone: false,
    supportedInputModes: ['camera_pose'],
    requiredMetrics: [
      { metricType: 'reaction_time_ms', unit: 'ms', min: 0, max: 60000 },
      { metricType: 'target_hit_rate', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'arm_raise_accuracy', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'duration_seconds', unit: 'seconds', min: 1, max: 3600 },
      { metricType: 'difficulty_level', unit: 'level', min: 1, max: 3 },
    ],
    difficultyPolicy: {
      source: 'clinician_approved_plan',
      startingLevel: 'from_latest_approved_assessment_and_plan_item',
      runtimeType: 'unity_webgl',
      safetyLimits: { minLevel: 1, maxLevel: 3 },
    },
    dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
    requiredPermissions: ['camera_capture'],
    resultSchema: {
      schemaVersion: '1.0.0',
      runtimeType: 'unity_webgl',
      dynamicDifficultyEvidence: 'required',
    },
    publishedStatus: 'published',
  };

  const releasedBrowserPoseGame = {
    id: 'browser-game-id',
    code: 'garden_reach',
    name: '上肢反应触达',
    trainingTargets: ['reaction', 'upper_limb'],
    tags: ['反应', '中低强度', '动作准确率'],
    defaultDuration: 8,
    defaultDifficulty: '基础',
    runtimeType: 'browser_pose_canvas',
    manifestUrl: null,
    buildBaseUrl: null,
    gameVersion: '1.0.0',
    bridgeProtocolVersion: '1.0.0',
    buildStatus: 'released',
    releaseChannel: 'production',
    status: 'active',
    supportsCamera: true,
    difficultyPolicy: {
      source: 'clinician_approved_plan',
      safetyLimits: { minLevel: 1, maxLevel: 3 },
    },
    dynamicDifficultyTriggers: [
      'prior_assessment',
      'reaction_slow',
      'accuracy_high',
      'accuracy_low',
      'fatigue_risk',
      'clinician_limit',
    ],
    requiredPermissions: ['camera_capture'],
    resultSchema: {
      schemaVersion: '1.0.0',
      requiredMetrics: [
        'reaction_time_ms',
        'target_hit_rate',
        'pose_visibility_avg',
        'arm_raise_accuracy',
      ],
      dynamicDifficultyEvidence: 'required',
    },
    publishedStatus: 'published',
    createdAt: new Date('2026-05-20T08:05:00.000Z'),
    updatedAt: new Date('2026-05-20T08:05:00.000Z'),
    supportedInputModes: ['camera_pose'],
    requiredMetrics: [
      { metricType: 'reaction_time_ms', unit: 'ms', min: 0, max: 60000 },
      { metricType: 'target_hit_rate', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'pose_visibility_avg', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'arm_raise_accuracy', unit: 'ratio', min: 0, max: 1 },
    ],
  };

  const releasedCognitiveGame = {
    id: 'cognitive-game-id',
    code: 'memory_path',
    name: '记忆路径',
    trainingTargets: ['memory', 'sequence', 'executive'],
    tags: ['近记忆', '序列回忆', '低强度'],
    defaultDuration: 8,
    defaultDifficulty: '三步路径',
    runtimeType: 'cognitive_web',
    manifestUrl: null,
    buildBaseUrl: null,
    gameVersion: '1.0.0',
    bridgeProtocolVersion: '1.0.0',
    buildStatus: 'released',
    releaseChannel: 'production',
    status: 'active',
    createdAt: new Date('2026-05-20T08:10:00.000Z'),
    updatedAt: new Date('2026-05-20T08:10:00.000Z'),
    supportedInputModes: ['touch', 'keyboard'],
    requiredMetrics: [
      { metricType: 'sequence_recall_rate', unit: 'ratio', min: 0, max: 1 },
      { metricType: 'path_completion_rate', unit: 'ratio', min: 0, max: 1 },
    ],
  };

  it('recommends formally ready Unity, browser pose, and cognitive web games', async () => {
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
      confirmedById: 'doctor-user-id',
      confirmedAt: new Date('2026-05-20T05:30:00.000Z'),
      createdAt: new Date('2026-05-20T06:00:00.000Z'),
    });
    prisma.gameContent.findMany.mockResolvedValue([
      releasedUnityGame,
      releasedBrowserPoseGame,
      releasedCognitiveGame,
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
              : item.gameContentId === 'cognitive-game-id'
                ? releasedCognitiveGame
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
        runtimeType: {
          in: ['unity_webgl', 'browser_pose_canvas', 'cognitive_web'],
        },
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
            objectContaining({ gameContentId: 'cognitive-game-id' }),
          ]),
        },
      }),
      include: {
        items: {
          orderBy: { sequence: 'asc' },
          include: { gameContent: true },
        },
      },
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
        objectContaining({ gameContentId: 'cognitive-game-id' }),
      ]),
    );
  });

  it('keeps newly released equal-score formal games in the top three recommendation set', async () => {
    const { prisma, service } = createService();
    const newestBrowserPoseGame = {
      ...releasedBrowserPoseGame,
      id: 'new-browser-game-id',
      code: 'new_trial_pose_game',
      name: '试点上肢触达',
      createdAt: new Date('2026-05-24T08:00:00.000Z'),
      updatedAt: new Date('2026-05-24T08:00:00.000Z'),
    };
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
      confirmedById: 'doctor-user-id',
      confirmedAt: new Date('2026-05-20T05:30:00.000Z'),
      createdAt: new Date('2026-05-20T06:00:00.000Z'),
    });
    prisma.gameContent.findMany.mockResolvedValue([
      {
        ...releasedBrowserPoseGame,
        id: 'old-browser-game-1',
        code: 'old_pose_1',
        name: '旧训练一',
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        updatedAt: new Date('2026-05-20T08:01:00.000Z'),
      },
      {
        ...releasedBrowserPoseGame,
        id: 'old-browser-game-2',
        code: 'old_pose_2',
        name: '旧训练二',
        createdAt: new Date('2026-05-20T08:02:00.000Z'),
        updatedAt: new Date('2026-05-20T08:02:00.000Z'),
      },
      {
        ...releasedBrowserPoseGame,
        id: 'old-browser-game-3',
        code: 'old_pose_3',
        name: '旧训练三',
        createdAt: new Date('2026-05-20T08:03:00.000Z'),
        updatedAt: new Date('2026-05-20T08:03:00.000Z'),
      },
      newestBrowserPoseGame,
    ]);
    prisma.rehabPlan.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'plan-id',
        ...data,
        items: data.items.create.map((item) => ({
          ...item,
          gameContent:
            item.gameContentId === 'new-browser-game-id'
              ? newestBrowserPoseGame
              : releasedBrowserPoseGame,
        })),
      }),
    );

    await service.recommendPlan(doctorUser, {
      patientId: 'patient-profile-id',
    });

    const createdItems =
      prisma.rehabPlan.create.mock.calls[0][0].data.items.create;
    expect(createdItems).toEqual(
      expect.arrayContaining([
        objectContaining({ gameContentId: 'new-browser-game-id' }),
      ]),
    );
    expect(createdItems).toHaveLength(3);
  });

  it('scores English training tags so trial-created formal games match recommendation intent', async () => {
    const { prisma, service } = createService();
    const englishTaggedBrowserPoseGame = {
      ...releasedBrowserPoseGame,
      id: 'english-tag-browser-game-id',
      code: 'browser_pose_trial_reaction',
      name: 'Browser Pose Trial Reaction',
      tags: ['reaction', 'upper_limb', 'moderate_intensity'],
      createdAt: new Date('2026-05-24T08:00:00.000Z'),
      updatedAt: new Date('2026-05-24T08:00:00.000Z'),
    };
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
      confirmedById: 'doctor-user-id',
      confirmedAt: new Date('2026-05-20T05:30:00.000Z'),
      createdAt: new Date('2026-05-20T06:00:00.000Z'),
    });
    prisma.gameContent.findMany.mockResolvedValue([
      {
        ...releasedBrowserPoseGame,
        id: 'old-cn-game-1',
        tags: ['反应', '中低强度'],
      },
      {
        ...releasedBrowserPoseGame,
        id: 'old-cn-game-2',
        tags: ['反应', '中低强度'],
      },
      {
        ...releasedBrowserPoseGame,
        id: 'old-cn-game-3',
        tags: ['反应', '中低强度'],
      },
      englishTaggedBrowserPoseGame,
    ]);
    prisma.rehabPlan.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'plan-id',
        ...data,
        items: data.items.create.map((item) => ({
          ...item,
          gameContent:
            item.gameContentId === 'english-tag-browser-game-id'
              ? englishTaggedBrowserPoseGame
              : releasedBrowserPoseGame,
        })),
      }),
    );

    await service.recommendPlan(doctorUser, {
      patientId: 'patient-profile-id',
    });

    const createdItems =
      prisma.rehabPlan.create.mock.calls[0][0].data.items.create;
    expect(createdItems).toEqual(
      expect.arrayContaining([
        objectContaining({ gameContentId: 'english-tag-browser-game-id' }),
      ]),
    );
  });

  it('scores English training targets when trial-created games keep intent outside tags', async () => {
    const { prisma, service } = createService();
    const trialBrowserPoseGame = {
      ...releasedBrowserPoseGame,
      id: 'trial-browser-game-id',
      code: 'browser_pose_trial_20260528',
      name: '本地验收上肢触达训练',
      trainingTargets: ['reaction', 'upper_limb', 'cognitive'],
      tags: ['moderate_intensity', 'attention', 'motor'],
      createdAt: new Date('2026-05-28T06:00:00.000Z'),
      updatedAt: new Date('2026-05-28T06:00:00.000Z'),
    };
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
      confirmedById: 'doctor-user-id',
      confirmedAt: new Date('2026-05-20T05:30:00.000Z'),
      createdAt: new Date('2026-05-20T06:00:00.000Z'),
    });
    prisma.gameContent.findMany.mockResolvedValue([
      {
        ...releasedBrowserPoseGame,
        id: 'old-cn-game-1',
        tags: ['反应', '中低强度'],
        createdAt: new Date('2026-05-20T08:01:00.000Z'),
        updatedAt: new Date('2026-05-20T08:01:00.000Z'),
      },
      {
        ...releasedBrowserPoseGame,
        id: 'old-cn-game-2',
        tags: ['反应', '中低强度'],
        createdAt: new Date('2026-05-20T08:02:00.000Z'),
        updatedAt: new Date('2026-05-20T08:02:00.000Z'),
      },
      {
        ...releasedBrowserPoseGame,
        id: 'old-cn-game-3',
        tags: ['反应', '中低强度'],
        createdAt: new Date('2026-05-20T08:03:00.000Z'),
        updatedAt: new Date('2026-05-20T08:03:00.000Z'),
      },
      trialBrowserPoseGame,
    ]);
    prisma.rehabPlan.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'plan-id',
        ...data,
        items: data.items.create.map((item) => ({
          ...item,
          gameContent:
            item.gameContentId === 'trial-browser-game-id'
              ? trialBrowserPoseGame
              : releasedBrowserPoseGame,
        })),
      }),
    );

    await service.recommendPlan(doctorUser, {
      patientId: 'patient-profile-id',
    });

    const createdItems =
      prisma.rehabPlan.create.mock.calls[0][0].data.items.create;
    expect(createdItems).toEqual(
      expect.arrayContaining([
        objectContaining({ gameContentId: 'trial-browser-game-id' }),
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
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      riskGradeRecord: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      aiAnalysisRecord: {
        create: jest.fn(),
      },
      aiConversationSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      aiConversationMessage: {
        create: jest.fn(),
        findMany: jest.fn(),
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
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
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

  const encryptedAssessmentId = '283713da-322c-462f-9784-42da468f3dd4';
  const encryptedRiskId = '1181f2dd-e397-48c2-a7e2-feb993bf9eaa';
  const encryptedAiAnalysisId = '613458d3-d242-4cc4-845f-05a759683a7e';

  function encryptedAssessmentResult(
    envelopeKey: SensitiveEncryptionKey = testSensitiveEncryptionKey,
  ) {
    return encryptSensitiveJson(
      {
        scoreSummary: assessmentDto.scoreSummary,
        rawInputSummary: assessmentDto.rawInputSummary,
      },
      {
        tableName: 'assessment_record',
        recordId: encryptedAssessmentId,
        fieldName: 'resultEnvelope',
      },
      envelopeKey,
    );
  }

  function encryptedReadRiskReason(
    envelopeKey: SensitiveEncryptionKey = testSensitiveEncryptionKey,
  ) {
    return encryptSensitiveJson(
      { reasonSummary: 'MMSE 22 分，CDR 1 分，提示中度风险。' },
      {
        tableName: 'risk_grade_record',
        recordId: encryptedRiskId,
        fieldName: 'reasonEnvelope',
      },
      envelopeKey,
    );
  }

  function encryptedReadAiInput(
    envelopeKey: SensitiveEncryptionKey = testSensitiveEncryptionKey,
  ) {
    return encryptSensitiveJson(
      { inputSummary: assessmentDto.rawInputSummary },
      {
        tableName: 'ai_analysis_record',
        recordId: encryptedAiAnalysisId,
        fieldName: 'inputEnvelope',
      },
      envelopeKey,
    );
  }

  function encryptedReadAiOutput(
    envelopeKey: SensitiveEncryptionKey = testSensitiveEncryptionKey,
  ) {
    return encryptSensitiveJson(
      {
        outputSummary: {
          riskLevel: 'moderate',
          reasonSummary: 'MMSE 22 分，CDR 1 分，提示中度风险。',
          transcript: assessmentDto.rawInputSummary.transcript,
          analysisSummary: assessmentDto.rawInputSummary.analysisSummary,
        },
      },
      {
        tableName: 'ai_analysis_record',
        recordId: encryptedAiAnalysisId,
        fieldName: 'outputEnvelope',
      },
      envelopeKey,
    );
  }

  function tamperedEnvelope<T extends { ciphertext: string }>(envelope: T) {
    return {
      ...envelope,
      ciphertext: `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}`,
    };
  }

  function encryptedReviewAssessmentResult(
    recordId: string,
    rawInputSummary: Record<string, unknown> = assessmentDto.rawInputSummary,
  ) {
    return encryptSensitiveJson(
      { scoreSummary: assessmentDto.scoreSummary, rawInputSummary },
      {
        tableName: 'assessment_record',
        recordId,
        fieldName: 'resultEnvelope',
      },
      testSensitiveEncryptionKey,
    );
  }

  function encryptedReviewRiskReason(recordId: string, reasonSummary: string) {
    return encryptSensitiveJson(
      { reasonSummary },
      {
        tableName: 'risk_grade_record',
        recordId,
        fieldName: 'reasonEnvelope',
      },
      testSensitiveEncryptionKey,
    );
  }

  function assessmentP2002(meta: Record<string, unknown>) {
    return new Prisma.PrismaClientKnownRequestError('Assessment P2002', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta,
    });
  }

  function grantAssessmentConsents(
    prisma: ReturnType<typeof createService>['prisma'],
  ) {
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
  }

  function encryptedAssessmentReadFixture(
    resultEnvelope: unknown,
    overrides: {
      reasonEnvelope?: unknown;
      inputEnvelope?: unknown;
      outputEnvelope?: unknown;
    } = {},
  ) {
    return {
      id: encryptedAssessmentId,
      patientId: 'patient-profile-id',
      assessmentType: 'MMSE/CDR',
      source: 'clinician_input',
      status: 'completed',
      resultEnvelope,
      startedAt: new Date('2026-07-15T01:00:00.000Z'),
      completedAt: new Date('2026-07-15T01:30:00.000Z'),
      createdAt: new Date('2026-07-15T01:30:00.000Z'),
      riskGrades: [
        {
          id: encryptedRiskId,
          patientId: 'patient-profile-id',
          assessmentId: encryptedAssessmentId,
          riskLevel: 'moderate',
          systemRiskLevel: 'moderate',
          manualRiskLevel: null,
          isCurrent: true,
          reasonEnvelope: Object.prototype.hasOwnProperty.call(
            overrides,
            'reasonEnvelope',
          )
            ? overrides.reasonEnvelope
            : encryptedReadRiskReason(),
          confirmedById: null,
          confirmedAt: null,
          createdAt: new Date('2026-07-15T01:30:00.000Z'),
        },
      ],
      aiAnalyses: [
        {
          id: encryptedAiAnalysisId,
          patientId: 'patient-profile-id',
          assessmentId: encryptedAssessmentId,
          trainingSessionId: null,
          analysisScene: 'assessment_summary',
          modelVersion: 'spark-manual-v1',
          confidence: 0.84,
          inputEnvelope: Object.prototype.hasOwnProperty.call(
            overrides,
            'inputEnvelope',
          )
            ? overrides.inputEnvelope
            : encryptedReadAiInput(),
          outputEnvelope: Object.prototype.hasOwnProperty.call(
            overrides,
            'outputEnvelope',
          )
            ? overrides.outputEnvelope
            : encryptedReadAiOutput(),
          createdAt: new Date('2026-07-15T01:30:00.000Z'),
        },
      ],
    };
  }

  it('persists assessment, risk, and AI clinical payloads only in row-bound envelopes', async () => {
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
    prisma.assessmentRecord.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, status: 'completed' }),
    );
    prisma.riskGradeRecord.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve(data),
    );
    prisma.aiAnalysisRecord.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve(data),
    );

    await service.createAssessment(doctorUser, assessmentDto);

    const assessmentData = mockArg<{
      data: Record<string, unknown> & { id: string; resultEnvelope: unknown };
    }>(prisma.assessmentRecord.create).data;
    const riskData = mockArg<{
      data: Record<string, unknown> & { id: string; reasonEnvelope: unknown };
    }>(prisma.riskGradeRecord.create).data;
    const aiData = mockArg<{
      data: Record<string, unknown> & {
        id: string;
        inputEnvelope: unknown;
        outputEnvelope: unknown;
      };
    }>(prisma.aiAnalysisRecord.create).data;

    expect(prisma.assessmentRecord.create).toHaveBeenCalledWith({
      data: assessmentData,
      select: {
        id: true,
        patientId: true,
        assessmentType: true,
        source: true,
        status: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });

    expect(assessmentData.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(riskData.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(aiData.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(assessmentData).not.toHaveProperty('scoreSummary');
    expect(assessmentData).not.toHaveProperty('rawInputSummary');
    expect(riskData).not.toHaveProperty('reasonSummary');
    expect(aiData).not.toHaveProperty('inputSummary');
    expect(aiData).not.toHaveProperty('outputSummary');

    expect(
      decryptSensitiveJson(
        assessmentData.resultEnvelope,
        {
          tableName: 'assessment_record',
          recordId: assessmentData.id,
          fieldName: 'resultEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      scoreSummary: assessmentDto.scoreSummary,
      rawInputSummary: assessmentDto.rawInputSummary,
    });
    const decryptedRisk = decryptSensitiveJson<Record<string, unknown>>(
      riskData.reasonEnvelope,
      {
        tableName: 'risk_grade_record',
        recordId: riskData.id,
        fieldName: 'reasonEnvelope',
      },
      testSensitiveEncryptionKey,
    );
    expect(decryptedRisk.reasonSummary).toContain('MMSE 22');
    expect(
      decryptSensitiveJson(
        aiData.inputEnvelope,
        {
          tableName: 'ai_analysis_record',
          recordId: aiData.id,
          fieldName: 'inputEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({ inputSummary: assessmentDto.rawInputSummary });
    const decryptedAiOutput = decryptSensitiveJson<{
      outputSummary: { reasonSummary: string };
    }>(
      aiData.outputEnvelope,
      {
        tableName: 'ai_analysis_record',
        recordId: aiData.id,
        fieldName: 'outputEnvelope',
      },
      testSensitiveEncryptionKey,
    );
    expect(decryptedAiOutput.outputSummary.reasonSummary).toContain('MMSE 22');

    const auditJson = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(auditJson).not.toContain(assessmentDto.rawInputSummary.transcript);
    expect(auditJson).not.toContain(
      assessmentDto.rawInputSummary.analysisSummary,
    );
    expect(auditJson).not.toContain('MMSE 22');
  });

  it('maps only the exact current-risk P2002 to a conflict', async () => {
    const { prisma, service } = createService();
    grantAssessmentConsents(prisma);
    prisma.$transaction.mockRejectedValueOnce(
      assessmentP2002({
        modelName: 'RiskGradeRecord',
        target: ['patientId'],
      }),
    );

    await expect(
      service.createAssessment(doctorUser, assessmentDto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['wrong model', { modelName: 'AssessmentRecord', target: ['patientId'] }],
    [
      'wrong target',
      { modelName: 'RiskGradeRecord', target: ['assessmentId'] },
    ],
    [
      'extra metadata',
      {
        modelName: 'RiskGradeRecord',
        target: ['patientId'],
        constraint: 'forged',
      },
    ],
  ])(
    'propagates a %s P2002 from assessment creation unchanged',
    async (_case, meta) => {
      const { prisma, service } = createService();
      grantAssessmentConsents(prisma);
      const error = assessmentP2002(meta);
      prisma.$transaction.mockRejectedValueOnce(error);

      await expect(
        service.createAssessment(doctorUser, assessmentDto),
      ).rejects.toBe(error);
    },
  );

  it('decrypts typed assessment, risk, and AI list DTOs without exposing envelopes', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.assessmentRecord.findMany.mockResolvedValue([
      encryptedAssessmentReadFixture(encryptedAssessmentResult()),
    ]);

    const result = await service.listAssessments(
      doctorUser,
      'patient-profile-id',
    );

    expect(result).toEqual([
      objectContaining({
        id: encryptedAssessmentId,
        scoreSummary: assessmentDto.scoreSummary,
        rawInputSummary: assessmentDto.rawInputSummary,
        riskGrades: [
          objectContaining({
            id: encryptedRiskId,
            reasonSummary: 'MMSE 22 分，CDR 1 分，提示中度风险。',
          }),
        ],
        aiAnalyses: [
          objectContaining({
            id: encryptedAiAnalysisId,
            inputSummary: assessmentDto.rawInputSummary,
            outputSummary: objectContaining({ riskLevel: 'moderate' }),
          }),
        ],
      }),
    ]);
    const responseJson = JSON.stringify(result);
    expect(responseJson).not.toContain('Envelope');
    expect(responseJson).not.toContain('ciphertext');
  });

  it.each([
    ['missing', null],
    [
      'tampered',
      (() => {
        const envelope = encryptedAssessmentResult();
        return {
          ...envelope,
          ciphertext: `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}`,
        };
      })(),
    ],
    [
      'wrong-key',
      encryptedAssessmentResult({
        ...testSensitiveEncryptionKey,
        key: Buffer.alloc(32, 17),
      }),
    ],
  ])(
    'hard-fails assessment list reads for a %s envelope',
    async (_case, envelope) => {
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      prisma.assessmentRecord.findMany.mockResolvedValue([
        encryptedAssessmentReadFixture(envelope),
      ]);

      await expect(
        service.listAssessments(doctorUser, 'patient-profile-id'),
      ).rejects.toThrow();
    },
  );

  it.each([
    ['risk reason missing', { reasonEnvelope: null }],
    [
      'risk reason tampered',
      { reasonEnvelope: tamperedEnvelope(encryptedReadRiskReason()) },
    ],
    [
      'risk reason wrong-key',
      {
        reasonEnvelope: encryptedReadRiskReason({
          ...testSensitiveEncryptionKey,
          key: Buffer.alloc(32, 17),
        }),
      },
    ],
    ['AI input missing', { inputEnvelope: null }],
    [
      'AI input tampered',
      { inputEnvelope: tamperedEnvelope(encryptedReadAiInput()) },
    ],
    [
      'AI input wrong-key',
      {
        inputEnvelope: encryptedReadAiInput({
          ...testSensitiveEncryptionKey,
          key: Buffer.alloc(32, 17),
        }),
      },
    ],
    ['AI output missing', { outputEnvelope: null }],
    [
      'AI output tampered',
      { outputEnvelope: tamperedEnvelope(encryptedReadAiOutput()) },
    ],
    [
      'AI output wrong-key',
      {
        outputEnvelope: encryptedReadAiOutput({
          ...testSensitiveEncryptionKey,
          key: Buffer.alloc(32, 17),
        }),
      },
    ],
  ])('hard-fails assessment list reads for %s', async (_case, overrides) => {
    const { prisma, service } = createService();
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    prisma.assessmentRecord.findMany.mockResolvedValue([
      encryptedAssessmentReadFixture(encryptedAssessmentResult(), overrides),
    ]);

    await expect(
      service.listAssessments(doctorUser, 'patient-profile-id'),
    ).rejects.toThrow();
  });

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
      status: 'completed',
    });

    await expect(
      service.createAssessment(doctorUser, assessmentDto),
    ).resolves.toMatchObject({
      id: stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      patientId: 'patient-profile-id',
    });

    const createdAssessmentId = mockArg<{ data: { id: string } }>(
      prisma.assessmentRecord.create,
    ).data.id;
    expect(prisma.assessmentRecord.create).toHaveBeenCalledWith({
      data: objectContaining({
        id: createdAssessmentId,
        patientId: 'patient-profile-id',
        assessmentType: 'MMSE/CDR',
        source: 'clinician_input',
        resultEnvelope: anyValue(Object),
        completedAt: anyValue(Date),
      }),
      select: {
        id: true,
        patientId: true,
        assessmentType: true,
        source: true,
        status: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });
    expect(prisma.riskGradeRecord.updateMany).toHaveBeenCalledWith({
      where: { patientId: 'patient-profile-id', isCurrent: true },
      data: { isCurrent: false },
    });
    expect(prisma.riskGradeRecord.create).toHaveBeenCalledWith({
      data: objectContaining({
        patientId: 'patient-profile-id',
        assessmentId: createdAssessmentId,
        riskLevel: 'moderate',
        systemRiskLevel: 'moderate',
        isCurrent: true,
        reasonEnvelope: anyValue(Object),
      }),
    });
    expect(prisma.aiAnalysisRecord.create).toHaveBeenCalledWith({
      data: objectContaining({
        patientId: 'patient-profile-id',
        assessmentId: createdAssessmentId,
        analysisScene: 'assessment_summary',
        modelVersion: 'spark-manual-v1',
        confidence: 0.84,
        inputEnvelope: anyValue(Object),
        outputEnvelope: anyValue(Object),
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'assessment.create',
        targetType: 'assessment_record',
        targetId: createdAssessmentId,
        result: 'success',
      }),
    });
  });

  it('confirms current assessment risk grade with responsible doctor and audit log', async () => {
    const { prisma, service } = createService();
    const assessmentPatientId = '3322ffbc-a45a-4d99-9b2a-3857f9b4c85a';
    const initialAssessment = {
      id: encryptedAssessmentId,
      patientId: assessmentPatientId,
      assessmentType: 'MMSE/CDR',
      status: 'completed',
      resultEnvelope: encryptedReviewAssessmentResult(encryptedAssessmentId),
      patient: encryptedPatientProfileFixture(assessmentPatientId),
      riskGrades: [
        {
          id: encryptedRiskId,
          assessmentId: encryptedAssessmentId,
          patientId: assessmentPatientId,
          riskLevel: 'moderate',
          systemRiskLevel: 'moderate',
          manualRiskLevel: null,
          reasonEnvelope: encryptedReviewRiskReason(
            encryptedRiskId,
            'MMSE 22 分，CDR 1 分，提示中度风险。',
          ),
          isCurrent: true,
          confirmedById: null,
          confirmedAt: null,
        },
      ],
      aiAnalyses: [],
    };
    prisma.assessmentRecord.findUnique
      .mockResolvedValueOnce(initialAssessment)
      .mockResolvedValueOnce({
        ...initialAssessment,
        riskGrades: [
          {
            ...initialAssessment.riskGrades[0],
            manualRiskLevel: 'moderate',
            confirmedById: 'doctor-user-id',
            confirmedAt: new Date('2026-06-10T08:00:00.000Z'),
            reasonEnvelope: encryptedReviewRiskReason(
              encryptedRiskId,
              'MMSE 22 分，CDR 1 分，提示中度风险。\n医生确认：已结合量表与访谈确认当前风险结论。',
            ),
          },
        ],
      });
    prisma.riskGradeRecord.findFirst.mockResolvedValue(
      initialAssessment.riskGrades[0],
    );
    prisma.riskGradeRecord.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.reviewAssessment(doctorUser, encryptedAssessmentId, {
        decision: 'approved',
        manualRiskLevel: 'moderate',
        reviewNote: '已结合量表与访谈确认当前风险结论。',
      }),
    ).resolves.toMatchObject({
      id: encryptedAssessmentId,
      riskGrades: [
        objectContaining({
          id: encryptedRiskId,
          confirmedById: 'doctor-user-id',
          manualRiskLevel: 'moderate',
        }),
      ],
    });

    expect(prisma.assessmentRecord.findUnique).toHaveBeenCalledWith(
      objectContaining({
        where: { id: encryptedAssessmentId },
        select: objectContaining({ resultEnvelope: true }),
      }),
    );
    expect(prisma.riskGradeRecord.findFirst).toHaveBeenCalledWith({
      where: {
        assessmentId: encryptedAssessmentId,
        patientId: assessmentPatientId,
        isCurrent: true,
      },
      orderBy: { createdAt: 'desc' },
      select: objectContaining({ reasonEnvelope: true }),
    });
    expect(prisma.riskGradeRecord.updateMany).toHaveBeenCalledWith({
      where: {
        id: encryptedRiskId,
        assessmentId: encryptedAssessmentId,
        patientId: assessmentPatientId,
        isCurrent: true,
        confirmedAt: null,
        confirmedById: null,
      },
      data: objectContaining({
        manualRiskLevel: 'moderate',
        confirmedById: 'doctor-user-id',
        confirmedAt: anyValue(Date),
        reasonEnvelope: anyValue(Object),
      }),
    });
    expect(prisma.assessmentRecord.updateMany).toHaveBeenCalledWith({
      where: { id: encryptedAssessmentId, status: 'completed' },
      data: objectContaining({
        status: 'doctor_confirmed',
        resultEnvelope: anyValue(Object),
      }),
    });
    const riskUpdateData = mockArg<{
      data: { reasonEnvelope: unknown };
    }>(prisma.riskGradeRecord.updateMany).data;
    const assessmentUpdateData = mockArg<{
      data: { resultEnvelope: unknown };
    }>(prisma.assessmentRecord.updateMany).data;
    expect(riskUpdateData.reasonEnvelope).toMatchObject({
      aad: {
        tableName: 'risk_grade_record',
        recordId: encryptedRiskId,
        fieldName: 'reasonEnvelope',
      },
    });
    expect(
      decryptSensitiveJson(
        riskUpdateData.reasonEnvelope,
        {
          tableName: 'risk_grade_record',
          recordId: encryptedRiskId,
          fieldName: 'reasonEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      reasonSummary:
        'MMSE 22 分，CDR 1 分，提示中度风险。\n医生确认：已结合量表与访谈确认当前风险结论。',
    });
    expect(assessmentUpdateData.resultEnvelope).toMatchObject({
      aad: {
        tableName: 'assessment_record',
        recordId: encryptedAssessmentId,
        fieldName: 'resultEnvelope',
      },
    });
    expect(
      decryptSensitiveJson(
        assessmentUpdateData.resultEnvelope,
        {
          tableName: 'assessment_record',
          recordId: encryptedAssessmentId,
          fieldName: 'resultEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    ).toEqual({
      scoreSummary: assessmentDto.scoreSummary,
      rawInputSummary: {
        ...assessmentDto.rawInputSummary,
        doctorReview: {
          decision: 'approved',
          reviewNote: '已结合量表与访谈确认当前风险结论。',
          reviewerUserId: doctorUser.id,
          reviewedAt: anyValue(String),
        },
      },
    });
    const updateJson = JSON.stringify({
      riskUpdateData,
      assessmentUpdateData,
    });
    for (const legacyField of [
      'reasonSummary',
      'scoreSummary',
      'rawInputSummary',
      'inputSummary',
      'outputSummary',
    ]) {
      expect(updateJson).not.toContain(`"${legacyField}"`);
    }
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'doctor-user-id',
        actorRole: 'doctor',
        action: 'assessment.review',
        targetType: 'assessment_record',
        targetId: encryptedAssessmentId,
        result: 'success',
        metadata: objectContaining({
          patientId: assessmentPatientId,
          decision: 'approved',
          riskGradeId: encryptedRiskId,
        }),
      }),
    });
    expect(prisma.riskGradeRecord.update).not.toHaveBeenCalled();
  });

  it('keeps assessment review audit in the same transaction as clinical updates', async () => {
    const { prisma, service } = createService();
    const assessmentPatientId = '50dfdcf7-f403-4146-94b2-c438db982777';
    const initialAssessment = {
      id: encryptedAssessmentId,
      patientId: assessmentPatientId,
      assessmentType: 'MMSE/CDR',
      status: 'completed',
      resultEnvelope: encryptedReviewAssessmentResult(encryptedAssessmentId),
      patient: encryptedPatientProfileFixture(assessmentPatientId),
      riskGrades: [
        {
          id: encryptedRiskId,
          assessmentId: encryptedAssessmentId,
          patientId: assessmentPatientId,
          riskLevel: 'moderate',
          systemRiskLevel: 'moderate',
          manualRiskLevel: null,
          reasonEnvelope: encryptedReviewRiskReason(
            encryptedRiskId,
            'MMSE 22 分，CDR 1 分，提示中度风险。',
          ),
          isCurrent: true,
          confirmedById: null,
          confirmedAt: null,
        },
      ],
      aiAnalyses: [],
    };
    prisma.assessmentRecord.findUnique
      .mockResolvedValueOnce(initialAssessment)
      .mockResolvedValueOnce(initialAssessment);

    const txAuditCreate = jest.fn().mockResolvedValue({});
    const tx = {
      ...prisma,
      assessmentRecord: {
        ...prisma.assessmentRecord,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      riskGradeRecord: {
        ...prisma.riskGradeRecord,
        findFirst: jest.fn().mockResolvedValue(initialAssessment.riskGrades[0]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: txAuditCreate,
      },
    };
    prisma.$transaction.mockImplementationOnce(
      async (callback: (transaction: typeof prisma) => Promise<unknown>) => {
        const result = await callback(tx);
        expect(txAuditCreate).toHaveBeenCalledWith({
          data: objectContaining({
            actorUserId: 'doctor-user-id',
            actorRole: 'doctor',
            action: 'assessment.review',
            targetType: 'assessment_record',
            targetId: encryptedAssessmentId,
            result: 'success',
            metadata: objectContaining({
              patientId: assessmentPatientId,
              decision: 'approved',
              riskGradeId: encryptedRiskId,
            }),
          }),
        });
        return result;
      },
    );

    await expect(
      service.reviewAssessment(doctorUser, encryptedAssessmentId, {
        decision: 'approved',
        manualRiskLevel: 'moderate',
        reviewNote: '已结合量表与访谈确认当前风险结论。',
      }),
    ).resolves.toMatchObject({ id: encryptedAssessmentId });

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects concurrent duplicate assessment risk confirmation when the guarded update misses', async () => {
    const { prisma, service } = createService();
    const currentRisk = {
      id: encryptedRiskId,
      assessmentId: encryptedAssessmentId,
      patientId: 'patient-profile-id',
      riskLevel: 'moderate',
      systemRiskLevel: 'moderate',
      manualRiskLevel: null,
      reasonEnvelope: encryptedReviewRiskReason(
        encryptedRiskId,
        'MMSE 22 分，CDR 1 分，提示中度风险。',
      ),
      isCurrent: true,
      confirmedById: null,
      confirmedAt: null,
    };
    prisma.assessmentRecord.findUnique.mockResolvedValue({
      id: encryptedAssessmentId,
      patientId: 'patient-profile-id',
      status: 'completed',
      patient: {
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      },
      resultEnvelope: encryptedReviewAssessmentResult(encryptedAssessmentId),
      riskGrades: [currentRisk],
      aiAnalyses: [],
    });
    prisma.riskGradeRecord.findFirst.mockResolvedValue(currentRisk);
    prisma.riskGradeRecord.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.reviewAssessment(doctorUser, encryptedAssessmentId, {
        decision: 'approved',
        manualRiskLevel: 'moderate',
        reviewNote: '已结合量表与访谈确认当前风险结论。',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects returning an assessment after the current risk has already been confirmed', async () => {
    const { prisma, service } = createService();
    const confirmedRisk = {
      id: 'risk-grade-id',
      assessmentId: 'assessment-id',
      patientId: 'patient-profile-id',
      riskLevel: 'moderate',
      systemRiskLevel: 'moderate',
      manualRiskLevel: 'moderate',
      reasonSummary: 'MMSE 22 分，CDR 1 分，医生已确认。',
      isCurrent: true,
      confirmedById: 'doctor-user-id',
      confirmedAt: new Date('2026-06-10T08:00:00.000Z'),
    };
    prisma.assessmentRecord.findUnique.mockResolvedValue({
      id: 'assessment-id',
      patientId: 'patient-profile-id',
      status: 'doctor_confirmed',
      patient: {
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      },
      rawInputSummary: {},
      riskGrades: [confirmedRisk],
      aiAnalyses: [],
    });
    prisma.riskGradeRecord.findFirst.mockResolvedValue(confirmedRisk);

    await expect(
      service.reviewAssessment(doctorUser, 'assessment-id', {
        decision: 'returned',
        reviewNote: '旧页面误操作退回。',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.assessmentRecord.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects assessment review when the current risk grade is missing', async () => {
    const { prisma, service } = createService();
    prisma.assessmentRecord.findUnique.mockResolvedValue({
      id: encryptedAssessmentId,
      patientId: 'patient-profile-id',
      status: 'completed',
      resultEnvelope: encryptedReviewAssessmentResult(encryptedAssessmentId),
      patient: {
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      },
      riskGrades: [],
      aiAnalyses: [],
    });

    await expect(
      service.reviewAssessment(doctorUser, encryptedAssessmentId, {
        decision: 'approved',
        reviewNote: '没有当前风险等级时不能确认。',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.riskGradeRecord.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('creates AD-8 assessment with structured items and risk based on AD-8 total score', async () => {
    const { prisma, service } = createService();
    const ad8Dto = {
      patientId: 'patient-profile-id',
      assessmentType: 'AD-8',
      scoreSummary: {
        ad8Total: 4,
        itemMemoryProblems: 1,
        itemReducedInterest: 0,
        itemRepeatsQuestions: 1,
        itemTroubleLearningTools: 0,
        itemForgetsMonthYear: 1,
        itemHandlesFinancesPoorly: 0,
        itemTroubleAppointments: 1,
        itemDailyThinkingMemoryProblems: 0,
      },
      rawInputSummary: {
        source: 'clinician_input',
        transcript: '照护者访谈提示近期重复提问和日期定向问题增多。',
        analysisSummary:
          'AD-8 总分 4 分，提示认知改变可能，建议结合 MMSE/CDR 复核。',
        modelVersion: 'ad8-clinician-structured-v1',
        confidence: 0.82,
        informant: {
          name: '李明',
          relation: '儿子',
        },
        scaleVersion: 'AD8-2005',
      },
    };

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
      id: 'ad8-assessment-id',
      patientId: 'patient-profile-id',
      assessmentType: 'AD-8',
    });

    await expect(
      service.createAssessment(doctorUser, ad8Dto),
    ).resolves.toMatchObject({
      id: stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      patientId: 'patient-profile-id',
    });

    const assessmentData = mockArg<{
      data: { id: string; resultEnvelope: unknown };
    }>(prisma.assessmentRecord.create).data;
    const riskData = mockArg<{
      data: { id: string; reasonEnvelope: unknown };
    }>(prisma.riskGradeRecord.create).data;
    expect(assessmentData).toEqual(
      objectContaining({
        patientId: 'patient-profile-id',
        assessmentType: 'AD-8',
        source: 'clinician_input',
        resultEnvelope: anyValue(Object),
        completedAt: anyValue(Date),
      }),
    );
    expect(riskData).toEqual(
      objectContaining({
        patientId: 'patient-profile-id',
        assessmentId: assessmentData.id,
        riskLevel: 'moderate',
        systemRiskLevel: 'moderate',
        isCurrent: true,
        reasonEnvelope: anyValue(Object),
      }),
    );
    expect(
      decryptSensitiveJson<{ reasonSummary: string }>(
        riskData.reasonEnvelope,
        {
          tableName: 'risk_grade_record',
          recordId: riskData.id,
          fieldName: 'reasonEnvelope',
        },
        testSensitiveEncryptionKey,
      ).reasonSummary,
    ).toBe('AD-8 4/8，提示认知改变可能，系统判定为中度风险。');
  });

  it.each([
    ['patient', patientUser],
    ['caregiver', caregiverUser],
  ])(
    'rejects %s formal assessment creation even when patient data is otherwise accessible',
    async (_roleLabel, actor) => {
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });

      await expect(
        service.createAssessment(actor, assessmentDto),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.consentRecord.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
    },
  );

  it('rejects AD-8 assessment when any item is missing or total does not match items', async () => {
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

    await expect(
      service.createAssessment(doctorUser, {
        patientId: 'patient-profile-id',
        assessmentType: 'AD-8',
        scoreSummary: {
          ad8Total: 3,
          itemMemoryProblems: 1,
          itemReducedInterest: 0,
          itemRepeatsQuestions: 1,
          itemTroubleLearningTools: 0,
          itemForgetsMonthYear: 1,
          itemHandlesFinancesPoorly: 0,
          itemTroubleAppointments: 1,
        },
        rawInputSummary: assessmentDto.rawInputSummary,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
  });

  it('rejects production AI assessment when provider call evidence is missing', async () => {
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

    await expect(
      service.createAssessment(doctorUser, {
        ...assessmentDto,
        rawInputSummary: {
          ...assessmentDto.rawInputSummary,
          source: 'production_ai_assessment',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
  });

  it('rejects assessment when source is not an allowed production or clinician source', async () => {
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

    await expect(
      service.createAssessment(doctorUser, {
        ...assessmentDto,
        rawInputSummary: {
          ...assessmentDto.rawInputSummary,
          source: 'temporary_ai_import',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
  });

  it('rejects production AI assessment when evidence endpoint is not a production HTTPS reference', async () => {
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

    await expect(
      service.createAssessment(doctorUser, {
        ...assessmentDto,
        rawInputSummary: {
          ...assessmentDto.rawInputSummary,
          source: 'production_ai_assessment',
          evidence: {
            provider: 'iflytek-spark',
            model: 'spark-x1',
            modelVersion: 'spark-x1-2026-05',
            callId: 'ai-call-20260524-001',
            endpointRef: 'http://localhost:3000/mock/chat',
            promptVersion: 'cognitive-assessment-2026-05',
            calledAt: '2026-05-24T10:00:00.000Z',
            humanReview: {
              required: true,
              reviewerUserId: doctorUser.id,
              reviewedAt: '2026-05-24T10:03:00.000Z',
              conclusion: 'approved',
            },
          },
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
  });

  it('rejects production AI assessment until human review approves the model output', async () => {
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

    await expect(
      service.createAssessment(doctorUser, {
        ...assessmentDto,
        rawInputSummary: {
          ...assessmentDto.rawInputSummary,
          source: 'production_ai_assessment',
          evidence: {
            provider: 'iflytek-spark',
            model: 'spark-x1',
            modelVersion: 'spark-x1-2026-05',
            callId: 'ai-call-20260524-001',
            endpointRef:
              'https://spark-api.customer-health.cn/v1/chat/completions',
            promptVersion: 'cognitive-assessment-2026-05',
            calledAt: '2026-05-24T10:00:00.000Z',
            humanReview: {
              required: true,
              reviewerUserId: doctorUser.id,
              reviewedAt: '2026-05-24T10:03:00.000Z',
              conclusion: 'needs_revision',
            },
          },
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
  });

  it('rejects speech AI assessment when microphone consent is missing', async () => {
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
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.createAssessment(doctorUser, {
        ...assessmentDto,
        rawInputSummary: {
          ...assessmentDto.rawInputSummary,
          source: 'speech_ai_assessment',
          evidence: {
            ai: {
              provider: 'xiaomi-mimo',
              model: 'mimo-v2.5',
              modelVersion: 'mimo-v2.5',
              callId: 'ai-call-20260524-001',
              endpointRef:
                'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
              promptVersion: 'cognitive-assessment-mimo-2026-05',
              calledAt: '2026-05-24T10:00:00.000Z',
            },
            humanReview: {
              required: true,
              reviewerUserId: doctorUser.id,
              reviewedAt: '2026-05-24T10:03:00.000Z',
              conclusion: 'approved',
            },
            speech: {
              provider: 'xiaomi-mimo-audio-understanding',
              modelVersion: 'mimo-v2.5',
              callId: 'speech-call-20260524-001',
              endpointRef:
                'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
              source: 'provider_audio_understanding',
              calledAt: '2026-05-24T09:58:00.000Z',
              audio: {
                mimeType: 'audio/wav',
                durationSeconds: 42,
              },
            },
          },
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.consentRecord.findFirst).toHaveBeenLastCalledWith({
      where: {
        patientId: 'patient-profile-id',
        consentType: 'microphone_capture',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      },
      orderBy: { grantedAt: 'desc' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
  });

  it('creates production AI assessment only with explicit provider, call, and review evidence', async () => {
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

    const productionRawInputSummary = {
      ...assessmentDto.rawInputSummary,
      source: 'production_ai_assessment',
      evidence: {
        provider: 'iflytek-spark',
        model: 'spark-x1',
        modelVersion: 'spark-x1-2026-05',
        callId: 'ai-call-20260524-001',
        endpointRef: 'https://spark-api.customer-health.cn/v1/chat/completions',
        promptVersion: 'cognitive-assessment-2026-05',
        calledAt: '2026-05-24T10:00:00.000Z',
        humanReview: {
          required: true,
          reviewerUserId: doctorUser.id,
          reviewedAt: '2026-05-24T10:03:00.000Z',
          conclusion: 'approved',
        },
      },
    };

    await expect(
      service.createAssessment(doctorUser, {
        ...assessmentDto,
        rawInputSummary: productionRawInputSummary,
      }),
    ).resolves.toMatchObject({
      id: stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      patientId: 'patient-profile-id',
    });

    const assessmentData = mockArg<{
      data: { id: string; resultEnvelope: unknown };
    }>(prisma.assessmentRecord.create).data;
    const decryptedResult = decryptSensitiveJson<{
      rawInputSummary: typeof productionRawInputSummary;
    }>(
      assessmentData.resultEnvelope,
      {
        tableName: 'assessment_record',
        recordId: assessmentData.id,
        fieldName: 'resultEnvelope',
      },
      testSensitiveEncryptionKey,
    );
    expect(decryptedResult.rawInputSummary).toEqual(
      objectContaining({
        source: 'production_ai_assessment',
        evidence: objectContaining({
          humanReview: objectContaining({
            required: true,
            conclusion: 'approved',
            reviewerUserId: doctorUser.id,
            reviewedAt: anyValue(String),
          }),
        }),
      }),
    );
    expect(
      decryptedResult.rawInputSummary.evidence.humanReview.reviewedAt,
    ).not.toBe('2026-05-24T10:03:00.000Z');
  });

  it('creates speech AI assessment from frontend evidence envelope with AI, speech, and human review evidence', async () => {
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
      })
      .mockResolvedValueOnce({
        id: 'microphone-consent-id',
        patientId: 'patient-profile-id',
        consentType: 'microphone_capture',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      });
    prisma.assessmentRecord.create.mockResolvedValue({
      id: 'assessment-id',
      patientId: 'patient-profile-id',
      assessmentType: 'MMSE/CDR',
    });

    const speechAiRawInputSummary = {
      ...assessmentDto.rawInputSummary,
      source: 'speech_ai_assessment',
      evidence: {
        ai: {
          provider: 'xiaomi-mimo',
          model: 'mimo-v2.5',
          modelVersion: 'mimo-v2.5',
          callId: 'ai-call-20260524-001',
          endpointRef:
            'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
          promptVersion: 'cognitive-assessment-mimo-2026-05',
          calledAt: '2026-05-24T10:00:00.000Z',
        },
        speech: {
          provider: 'xiaomi-mimo-audio-understanding',
          modelVersion: 'mimo-v2.5',
          callId: 'speech-call-20260524-001',
          endpointRef:
            'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
          source: 'provider_audio_understanding',
          calledAt: '2026-05-24T09:58:00.000Z',
          audio: {
            mimeType: 'audio/wav',
            durationSeconds: 42,
          },
        },
        humanReview: {
          required: true,
          reviewerUserId: doctorUser.id,
          reviewedAt: '2026-05-24T10:03:00.000Z',
          conclusion: 'approved',
        },
      },
    };

    await expect(
      service.createAssessment(doctorUser, {
        ...assessmentDto,
        rawInputSummary: speechAiRawInputSummary,
      }),
    ).resolves.toMatchObject({
      id: stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      patientId: 'patient-profile-id',
    });

    const assessmentData = mockArg<{
      data: { id: string; resultEnvelope: unknown };
    }>(prisma.assessmentRecord.create).data;
    const decryptedResult = decryptSensitiveJson<{
      rawInputSummary: typeof speechAiRawInputSummary;
    }>(
      assessmentData.resultEnvelope,
      {
        tableName: 'assessment_record',
        recordId: assessmentData.id,
        fieldName: 'resultEnvelope',
      },
      testSensitiveEncryptionKey,
    );
    expect(decryptedResult.rawInputSummary).toEqual(
      objectContaining({
        source: 'speech_ai_assessment',
        evidence: objectContaining({
          humanReview: objectContaining({
            required: true,
            conclusion: 'approved',
            reviewerUserId: doctorUser.id,
            reviewedAt: anyValue(String),
          }),
        }),
      }),
    );
    expect(
      decryptedResult.rawInputSummary.evidence.humanReview.reviewedAt,
    ).not.toBe('2026-05-24T10:03:00.000Z');
  });

  it('rejects speech AI assessment when speech evidence lacks provider call time or audio summary', async () => {
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

    await expect(
      service.createAssessment(doctorUser, {
        ...assessmentDto,
        rawInputSummary: {
          ...assessmentDto.rawInputSummary,
          source: 'speech_ai_assessment',
          evidence: {
            ai: {
              provider: 'xiaomi-mimo',
              model: 'mimo-v2.5',
              modelVersion: 'mimo-v2.5',
              callId: 'ai-call-20260524-001',
              endpointRef:
                'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
              promptVersion: 'cognitive-assessment-mimo-2026-05',
              calledAt: '2026-05-24T10:00:00.000Z',
            },
            speech: {
              provider: 'xiaomi-mimo-audio-understanding',
              modelVersion: 'mimo-v2.5',
              callId: 'speech-call-20260524-001',
              endpointRef:
                'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
              source: 'provider_audio_understanding',
            },
            humanReview: {
              required: true,
              reviewerUserId: doctorUser.id,
              reviewedAt: '2026-05-24T10:03:00.000Z',
              conclusion: 'approved',
            },
          },
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
  });

  it('rejects speech AI assessment when speech evidence keeps browser webm instead of provider-ready audio', async () => {
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
      })
      .mockResolvedValueOnce({
        id: 'microphone-consent-id',
        patientId: 'patient-profile-id',
        consentType: 'microphone_capture',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      });

    await expect(
      service.createAssessment(doctorUser, {
        ...assessmentDto,
        rawInputSummary: {
          ...assessmentDto.rawInputSummary,
          source: 'speech_ai_assessment',
          evidence: {
            ai: {
              provider: 'xiaomi-mimo',
              model: 'mimo-v2.5',
              modelVersion: 'mimo-v2.5',
              callId: 'ai-call-20260524-001',
              endpointRef:
                'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
              promptVersion: 'cognitive-assessment-mimo-2026-05',
              calledAt: '2026-05-24T10:00:00.000Z',
            },
            speech: {
              provider: 'xiaomi-mimo-audio-understanding',
              modelVersion: 'mimo-v2.5',
              callId: 'speech-call-20260524-001',
              endpointRef:
                'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
              source: 'provider_audio_understanding',
              calledAt: '2026-05-24T09:58:00.000Z',
              audio: {
                mimeType: 'audio/webm',
                durationSeconds: 42,
              },
            },
            humanReview: {
              required: true,
              reviewerUserId: doctorUser.id,
              reviewedAt: '2026-05-24T10:03:00.000Z',
              conclusion: 'approved',
            },
          },
        },
      }),
    ).rejects.toThrow('语音音频类型必须是小米支持的正式音频格式');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
  });

  describe('AI assessment draft generation', () => {
    const aiEnvNames = [
      'AI_REQUIRED_FOR_LAUNCH',
      'AI_PROVIDER',
      'AI_MODEL_VERSION',
      'AI_MODEL_ENDPOINT',
      'MIMO_API_KEY_REF',
      'MIMO_API_KEY',
      'AI_PROVIDER_TIMEOUT_MS',
      'AI_PROVIDER_MAX_RESPONSE_BYTES',
      'AI_PROMPT_VERSION',
      'AI_HUMAN_REVIEW_REQUIRED',
    ] as const;
    const envSnapshot = { ...process.env };

    function configureAiEnv() {
      process.env.AI_REQUIRED_FOR_LAUNCH = 'true';
      process.env.AI_PROVIDER = 'xiaomi-mimo';
      process.env.AI_MODEL_VERSION = 'MiMo-V2.5';
      process.env.AI_MODEL_ENDPOINT = 'https://token-plan-cn.xiaomimimo.com/v1';
      process.env.MIMO_API_KEY_REF = 'secret-manager://mimo/unit-key';
      process.env.MIMO_API_KEY = 'unit-runtime-secret';
      process.env.AI_PROVIDER_TIMEOUT_MS = '15000';
      process.env.AI_PROVIDER_MAX_RESPONSE_BYTES = '1048576';
      process.env.AI_PROMPT_VERSION = 'cognitive-assessment-mimo-2026-05';
      process.env.AI_HUMAN_REVIEW_REQUIRED = 'true';
    }

    function clearAiEnv() {
      for (const name of aiEnvNames) {
        delete process.env[name];
      }
    }

    function grantRequiredConsents(
      prisma: ReturnType<typeof createService>['prisma'],
    ) {
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
    }

    afterEach(() => {
      for (const name of aiEnvNames) {
        if (envSnapshot[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = envSnapshot[name];
        }
      }
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    it('rejects AI draft generation when runtime config is missing and does not call provider', async () => {
      clearAiEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantRequiredConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAiAssessmentDraft(doctorUser, {
          patientId: 'patient-profile-id',
          transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
      expect(prisma.aiAnalysisRecord.create).not.toHaveBeenCalled();
    });

    it('rejects non-Xiaomi AI provider before calling assessment draft provider', async () => {
      configureAiEnv();
      process.env.AI_PROVIDER = 'vendor-standard-ai';
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantRequiredConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAiAssessmentDraft(doctorUser, {
          patientId: 'patient-profile-id',
          transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
      expect(prisma.aiAnalysisRecord.create).not.toHaveBeenCalled();
    });

    it('blocks AI draft generation without privacy and AI consents before provider call', async () => {
      configureAiEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      prisma.consentRecord.findFirst.mockResolvedValueOnce(null);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAiAssessmentDraft(doctorUser, {
          patientId: 'patient-profile-id',
          transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
    });

    it('rejects malformed model output instead of creating fallback assessment data', async () => {
      configureAiEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantRequiredConsents(prisma);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        providerJsonResponse({
          id: 'mimo-call-001',
          choices: [{ message: { content: '建议继续观察，不是 JSON。' } }],
        }),
      );

      await expect(
        service.createAiAssessmentDraft(doctorUser, {
          patientId: 'patient-profile-id',
          transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
        }),
      ).rejects.toBeInstanceOf(ProviderResponseRejectedException);

      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
      expect(prisma.aiAnalysisRecord.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.assessment_draft.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'failed',
          metadata: objectContaining({
            provider: 'xiaomi-mimo',
            modelVersion: 'MiMo-V2.5',
            promptVersion: 'cognitive-assessment-mimo-2026-05',
            callId: 'mimo-call-001',
            failureStage: 'provider_response_validation',
          }),
        }),
      });
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        '患者完成 MMSE 量表',
      );
    });

    it('classifies a malformed HTTP 2xx provider body as response_rejected without retrying', async () => {
      configureAiEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantRequiredConsents(prisma);
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html>provider internal error</html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      );

      let caught: unknown;
      try {
        await service.createAiAssessmentDraft(doctorUser, {
          patientId: 'patient-profile-id',
          transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ProviderResponseRejectedException);
      expect((caught as ProviderResponseRejectedException).getStatus()).toBe(
        502,
      );
      expect(JSON.stringify(caught)).not.toContain('provider internal error');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          action: 'ai.assessment_draft.generate',
          result: 'failed',
          metadata: objectContaining({
            failureStage: 'provider_response_validation',
          }),
        }),
      });
    });

    it('audits provider call failures without creating fallback assessment data', async () => {
      configureAiEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantRequiredConsents(prisma);
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          providerJsonResponse({ error: { code: 'UPSTREAM_BUSY' } }, 503),
        );

      await expect(
        service.createAiAssessmentDraft(doctorUser, {
          patientId: 'patient-profile-id',
          transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
        }),
      ).rejects.toMatchObject({
        providerRequestError: { kind: 'upstream_http', upstreamStatus: 503 },
      });

      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
      expect(prisma.aiAnalysisRecord.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.assessment_draft.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'failed',
          metadata: objectContaining({
            provider: 'xiaomi-mimo',
            modelVersion: 'MiMo-V2.5',
            promptVersion: 'cognitive-assessment-mimo-2026-05',
            failureStage: 'provider_call',
          }),
        }),
      });
    });

    it('aborts a timed-out AI assessment provider call without retrying', async () => {
      jest.useFakeTimers();
      configureAiEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantRequiredConsents(prisma);
      let providerSignal: AbortSignal | undefined;
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation((_input, init) => {
          providerSignal = init?.signal ?? undefined;
          return new Promise<Response>(() => undefined);
        });
      let caught: unknown;

      void service
        .createAiAssessmentDraft(doctorUser, {
          patientId: 'patient-profile-id',
          transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
        })
        .catch((error: unknown) => {
          caught = error;
        });

      await jest.advanceTimersByTimeAsync(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(DEFAULT_PROVIDER_TIMEOUT_MS);

      expect(caught).toBeInstanceOf(ProviderUnavailableException);
      expect(caught).toMatchObject({
        providerRequestError: { kind: 'timeout' },
      });
      expect(providerSignal?.aborted).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          action: 'ai.assessment_draft.generate',
          result: 'failed',
          metadata: objectContaining({ failureStage: 'provider_call' }),
        }),
      });
    });

    it('returns a pending human review draft from OpenAI-compatible model output without persisting assessment records', async () => {
      configureAiEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantRequiredConsents(prisma);
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        providerJsonResponse({
          id: 'mimo-call-001',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scoreSummary: {
                    mmse: 21,
                    cdr: 1,
                    memory: 45,
                    orientation: 62,
                    executive: 50,
                    language: 72,
                  },
                  analysisSummary:
                    '患者短时记忆与执行功能下降，建议进行反应、注意力与上肢协调训练。',
                  confidence: 0.82,
                }),
              },
            },
          ],
        }),
      );

      await expect(
        service.createAiAssessmentDraft(doctorUser, {
          patientId: 'patient-profile-id',
          assessmentType: 'MMSE/CDR',
          transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
        }),
      ).resolves.toMatchObject({
        patientId: 'patient-profile-id',
        assessmentType: 'MMSE/CDR',
        status: 'pending_human_review',
        riskLevel: 'moderate',
        scoreSummary: {
          mmse: 21,
          cdr: 1,
          memory: 45,
          orientation: 62,
          executive: 50,
          language: 72,
        },
        rawInputSummary: {
          source: 'production_ai_assessment',
          transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
          analysisSummary:
            '患者短时记忆与执行功能下降，建议进行反应、注意力与上肢协调训练。',
          modelVersion: 'MiMo-V2.5',
          confidence: 0.82,
          evidence: {
            provider: 'xiaomi-mimo',
            model: 'MiMo-V2.5',
            modelVersion: 'MiMo-V2.5',
            callId: 'mimo-call-001',
            endpointRef:
              'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
            promptVersion: 'cognitive-assessment-mimo-2026-05',
            humanReview: {
              required: true,
              status: 'pending_human_review',
            },
          },
        },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          signal: expect.any(AbortSignal) as AbortSignal,
          headers: objectContaining({
            Authorization: 'Bearer unit-runtime-secret',
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
      expect(prisma.aiAnalysisRecord.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.assessment_draft.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'success',
        }),
      });
    });

    it('returns an AD-8 AI draft without requiring MMSE or CDR scores', async () => {
      configureAiEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantRequiredConsents(prisma);
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        providerJsonResponse({
          id: 'mimo-ad8-call-001',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scoreSummary: {
                    ad8Total: 6,
                    itemMemoryProblems: 1,
                    itemReducedInterest: 1,
                    itemRepeatsQuestions: 1,
                    itemTroubleLearningTools: 0,
                    itemForgetsMonthYear: 1,
                    itemHandlesFinancesPoorly: 1,
                    itemTroubleAppointments: 1,
                    itemDailyThinkingMemoryProblems: 0,
                  },
                  analysisSummary: 'AD-8 总分 6 分，提示认知改变可能。',
                  confidence: 0.86,
                }),
              },
            },
          ],
        }),
      );

      await expect(
        service.createAiAssessmentDraft(doctorUser, {
          patientId: 'patient-profile-id',
          assessmentType: 'AD-8',
          transcript: '照护者完成 AD-8 访谈，报告重复提问和财务处理困难。',
        }),
      ).resolves.toMatchObject({
        patientId: 'patient-profile-id',
        assessmentType: 'AD-8',
        status: 'pending_human_review',
        riskLevel: 'high',
        scoreSummary: {
          ad8Total: 6,
          itemMemoryProblems: 1,
          itemReducedInterest: 1,
          itemRepeatsQuestions: 1,
          itemTroubleLearningTools: 0,
          itemForgetsMonthYear: 1,
          itemHandlesFinancesPoorly: 1,
          itemTroubleAppointments: 1,
          itemDailyThinkingMemoryProblems: 0,
        },
      });

      const requestBody = JSON.parse(mockRequestBody(fetchSpy)) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userPrompt = JSON.parse(requestBody.messages[1].content) as {
        requiredScoreSummaryFields: string[];
      };
      expect(userPrompt.requiredScoreSummaryFields).toEqual([
        'ad8Total',
        'itemMemoryProblems',
        'itemReducedInterest',
        'itemRepeatsQuestions',
        'itemTroubleLearningTools',
        'itemForgetsMonthYear',
        'itemHandlesFinancesPoorly',
        'itemTroubleAppointments',
        'itemDailyThinkingMemoryProblems',
      ]);
      expect(userPrompt.requiredScoreSummaryFields).not.toContain('mmse');
      expect(userPrompt.requiredScoreSummaryFields).not.toContain('cdr');
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
    });

    it('normalizes numeric score strings from provider output before returning the draft', async () => {
      configureAiEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantRequiredConsents(prisma);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        providerJsonResponse({
          id: 'mimo-call-strings-001',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scoreSummary: {
                    mmse: '21',
                    cdr: '1',
                    memory: '45',
                    orientation: '62',
                    executive: '50',
                    language: '72',
                  },
                  analysisSummary:
                    '患者短时记忆与执行功能下降，建议进行反应、注意力与上肢协调训练。',
                  confidence: '0.82',
                }),
              },
            },
          ],
        }),
      );

      const draft = await service.createAiAssessmentDraft(doctorUser, {
        patientId: 'patient-profile-id',
        assessmentType: 'MMSE/CDR',
        transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
      });

      expect(draft.scoreSummary).toEqual({
        mmse: 21,
        cdr: 1,
        memory: 45,
        orientation: 62,
        executive: 50,
        language: 72,
      });
      expect(
        Object.values(draft.scoreSummary).every(
          (value) => typeof value === 'number',
        ),
      ).toBe(true);
      expect(draft.rawInputSummary.confidence).toBe(0.82);
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.assessment_draft.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'success',
          metadata: objectContaining({
            callId: 'mimo-call-strings-001',
          }),
        }),
      });
    });

    describe('continuous AI conversation', () => {
      const conversationMessage =
        '最近经常忘记日期，也会重复问家人同一个问题。';
      const assistantReply =
        '已记录这些变化。请继续描述最近一周的睡眠、用药和日常活动情况。';
      const conversationSessionId = '03cf5f98-e250-4e42-87dd-27c40c5433a1';
      const userMessageId = '44c267fb-5d6d-4f23-947f-7c0571646c58';
      const conversationMessageSelect = {
        id: true,
        sessionId: true,
        turnIndex: true,
        role: true,
        contentEnvelope: true,
        createdAt: true,
      };
      const conversationSessionSelect = {
        id: true,
        patientId: true,
        createdByUserId: true,
        assessmentType: true,
        status: true,
        startedAt: true,
        completedAt: true,
        provider: true,
        modelVersion: true,
        callId: true,
        endpointRef: true,
        promptVersion: true,
        summaryEnvelope: true,
        reviewEnvelope: true,
        reviewedByUserId: true,
        reviewedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      };
      const conversationSessionWithMessagesSelect = {
        ...conversationSessionSelect,
        messages: {
          orderBy: { turnIndex: 'asc' },
          select: conversationMessageSelect,
        },
      };

      function encryptedConversationMessage(
        recordId: string,
        value: {
          content: string;
          contentSnapshot: Record<string, unknown>;
          evidenceMetadata: Record<string, unknown>;
        },
        key = testSensitiveEncryptionKey,
      ) {
        return encryptSensitiveJson(
          value,
          {
            tableName: 'ai_conversation_message',
            recordId,
            fieldName: 'contentEnvelope',
          },
          key,
        );
      }

      function encryptedConversationSessionField(
        fieldName: 'summaryEnvelope' | 'reviewEnvelope',
        value: Record<string, unknown>,
        key = testSensitiveEncryptionKey,
      ) {
        return encryptSensitiveJson(
          value,
          {
            tableName: 'ai_conversation_session',
            recordId: conversationSessionId,
            fieldName,
          },
          key,
        );
      }

      function failedConversationEnvelope(
        failureMode: 'missing' | 'tampered' | 'wrong-key',
        createEnvelope: (
          key: SensitiveEncryptionKey,
        ) => ReturnType<typeof encryptSensitiveJson>,
      ) {
        if (failureMode === 'missing') return null;
        const envelope = createEnvelope(
          failureMode === 'wrong-key'
            ? {
                kid: 'secret-manager://rehab/wrong-conversation-key',
                key: Buffer.alloc(32, 23),
              }
            : testSensitiveEncryptionKey,
        );
        return failureMode === 'tampered'
          ? { ...envelope, ciphertext: `${envelope.ciphertext}A` }
          : envelope;
      }

      it('starts a session only after patient access and AI processing consent', async () => {
        configureAiEnv();
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
          service.startAiConversation(doctorUser, {
            patientId: 'patient-profile-id',
            assessmentType: 'MMSE/CDR',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(prisma.consentRecord.findFirst).toHaveBeenLastCalledWith({
          where: {
            patientId: 'patient-profile-id',
            consentType: 'ai_processing',
            consentVersion: 'v1.2',
            status: 'granted',
            revokedAt: null,
          },
          orderBy: { grantedAt: 'desc' },
        });
        expect(prisma.aiConversationSession.create).not.toHaveBeenCalled();
      });

      it('creates a continuous AI conversation session with provider metadata', async () => {
        configureAiEnv();
        const { prisma, service } = createService();
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        grantRequiredConsents(prisma);
        prisma.aiConversationSession.create.mockImplementation(
          ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              ...data,
              summaryEnvelope: null,
              reviewEnvelope: null,
              callId: null,
              completedAt: null,
              reviewedByUserId: null,
              reviewedAt: null,
              startedAt: new Date('2026-06-03T09:00:00.000Z'),
              createdAt: new Date('2026-06-03T09:00:00.000Z'),
              updatedAt: new Date('2026-06-03T09:00:00.000Z'),
            }),
        );

        await expect(
          service.startAiConversation(doctorUser, {
            patientId: 'patient-profile-id',
            assessmentType: 'MMSE/CDR',
          }),
        ).resolves.toMatchObject({
          id: stringMatching(/^[0-9a-f-]{36}$/),
          status: 'active',
          provider: 'xiaomi-mimo',
          modelVersion: 'MiMo-V2.5',
        });

        expect(prisma.aiConversationSession.create).toHaveBeenCalledWith({
          data: objectContaining({
            id: stringMatching(/^[0-9a-f-]{36}$/),
            patientId: 'patient-profile-id',
            createdByUserId: 'doctor-user-id',
            assessmentType: 'MMSE/CDR',
            status: 'active',
            provider: 'xiaomi-mimo',
            modelVersion: 'MiMo-V2.5',
            endpointRef:
              'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
            metadata: objectContaining({
              turnCount: 0,
              consentSnapshot: {
                version: 'v1.2',
                requiredTypes: ['privacy_policy', 'ai_processing'],
                grantedConsentIds: ['privacy-consent-id', 'ai-consent-id'],
                status: 'granted',
              },
            }),
          }),
          select: {
            id: true,
            patientId: true,
            createdByUserId: true,
            assessmentType: true,
            status: true,
            startedAt: true,
            completedAt: true,
            provider: true,
            modelVersion: true,
            callId: true,
            endpointRef: true,
            promptVersion: true,
            summaryEnvelope: true,
            reviewEnvelope: true,
            reviewedByUserId: true,
            reviewedAt: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      });

      it('rejects unsupported AI conversation assessment types before creating a session', async () => {
        configureAiEnv();
        const { prisma, service } = createService();
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        grantRequiredConsents(prisma);

        await expect(
          service.startAiConversation(doctorUser, {
            patientId: 'patient-profile-id',
            assessmentType: 'unsupported-scale',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(prisma.aiConversationSession.create).not.toHaveBeenCalled();
      });

      it('appends user and supplier-backed assistant turns without raw provider payload audit metadata', async () => {
        configureAiEnv();
        const { prisma, service } = createService();
        prisma.aiConversationSession.findUnique.mockResolvedValue({
          id: conversationSessionId,
          patientId: 'patient-profile-id',
          createdByUserId: 'doctor-user-id',
          assessmentType: 'MMSE/CDR',
          status: 'active',
          metadata: { turnCount: 1 },
          provider: 'xiaomi-mimo',
          modelVersion: 'MiMo-V2.5',
          endpointRef:
            'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
        });
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        grantRequiredConsents(prisma);
        prisma.aiConversationMessage.findMany.mockResolvedValue([
          {
            id: userMessageId,
            sessionId: conversationSessionId,
            turnIndex: 1,
            role: 'user',
            contentEnvelope: encryptedConversationMessage(userMessageId, {
              content: '历史消息：最近睡眠变浅。',
              contentSnapshot: { source: 'prior_turn' },
              evidenceMetadata: { source: 'clinician_or_patient_input' },
            }),
            createdAt: new Date('2026-06-03T08:59:00.000Z'),
          },
        ]);
        prisma.aiConversationSession.updateMany.mockResolvedValue({ count: 1 });
        prisma.aiConversationMessage.create
          .mockImplementationOnce(
            ({ data }: { data: Record<string, unknown> }) =>
              Promise.resolve({
                ...data,
                createdAt: new Date('2026-06-03T09:01:00.000Z'),
              }),
          )
          .mockImplementationOnce(
            ({ data }: { data: Record<string, unknown> }) =>
              Promise.resolve({
                ...data,
                createdAt: new Date('2026-06-03T09:02:00.000Z'),
              }),
          );
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
          providerJsonResponse({
            id: 'mimo-conversation-call-001',
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: assistantReply,
                    evidence: {
                      focus: ['memory', 'orientation'],
                      nextQuestion: 'sleep-medication-activity',
                    },
                  }),
                },
              },
            ],
          }),
        );

        await expect(
          service.appendAiConversationMessage(
            doctorUser,
            conversationSessionId,
            {
              content: conversationMessage,
              contentSnapshot: {
                clinicalContext: '最近经常忘记日期。',
              },
            },
          ),
        ).resolves.toMatchObject({
          sessionId: conversationSessionId,
          userMessage: { role: 'user', content: conversationMessage },
          assistantMessage: { role: 'assistant', content: assistantReply },
        });

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
          expect.objectContaining({
            method: 'POST',
            signal: expect.any(AbortSignal) as AbortSignal,
            headers: objectContaining({
              Authorization: 'Bearer unit-runtime-secret',
              'Content-Type': 'application/json',
            }),
          }),
        );
        expect(prisma.aiConversationMessage.create).toHaveBeenNthCalledWith(1, {
          data: objectContaining({
            id: stringMatching(/^[0-9a-f-]{36}$/),
            sessionId: conversationSessionId,
            role: 'user',
            turnIndex: 2,
            contentEnvelope: objectContaining({
              alg: 'AES-256-GCM',
              kid: 'secret-manager://rehab/unit-sensitive-key',
              contentType: 'application/json',
            }),
          }),
          select: {
            id: true,
            sessionId: true,
            turnIndex: true,
            role: true,
            contentEnvelope: true,
            createdAt: true,
          },
        });
        const userData = mockArg<{
          data: Record<string, unknown> & {
            id: string;
            contentEnvelope: unknown;
          };
        }>(prisma.aiConversationMessage.create).data;
        expect(userData).not.toHaveProperty('content');
        expect(userData).not.toHaveProperty('contentSnapshot');
        expect(userData).not.toHaveProperty('evidenceMetadata');
        expect(
          decryptSensitiveJson(
            userData.contentEnvelope,
            {
              tableName: 'ai_conversation_message',
              recordId: userData.id,
              fieldName: 'contentEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
        ).toEqual({
          content: conversationMessage,
          contentSnapshot: { clinicalContext: '最近经常忘记日期。' },
          evidenceMetadata: { source: 'clinician_or_patient_input' },
        });
        expect(prisma.aiConversationMessage.create).toHaveBeenNthCalledWith(2, {
          data: objectContaining({
            id: stringMatching(/^[0-9a-f-]{36}$/),
            sessionId: conversationSessionId,
            role: 'assistant',
            turnIndex: 3,
            contentEnvelope: objectContaining({
              alg: 'AES-256-GCM',
              kid: 'secret-manager://rehab/unit-sensitive-key',
              contentType: 'application/json',
            }),
          }),
          select: {
            id: true,
            sessionId: true,
            turnIndex: true,
            role: true,
            contentEnvelope: true,
            createdAt: true,
          },
        });
        expect(prisma.auditLog.create).toHaveBeenCalledWith({
          data: objectContaining({
            actorUserId: 'doctor-user-id',
            actorRole: 'doctor',
            action: 'ai.conversation.message.append',
            targetType: 'ai_conversation_session',
            targetId: conversationSessionId,
            result: 'success',
            metadata: objectContaining({
              provider: 'xiaomi-mimo',
              modelVersion: 'MiMo-V2.5',
              callId: 'mimo-conversation-call-001',
            }),
          }),
        });
        const auditJson = JSON.stringify(prisma.auditLog.create.mock.calls);
        expect(auditJson).not.toContain(conversationMessage);
        expect(auditJson).not.toContain(assistantReply);
        expect(auditJson).not.toContain('unit-runtime-secret');
        expect(auditJson).not.toContain('requestBody');
        expect(auditJson).not.toContain('responseBody');
        expect(auditJson).not.toContain('raw provider payload');
        expect(auditJson).not.toContain('base64');
        expect(auditJson).not.toContain('audio');
        expect(auditJson).not.toMatch(/contentEnvelope|ciphertext|nonce|tag/);
        expect(JSON.stringify(fetchSpy.mock.calls[0][1]?.body)).toContain(
          '历史消息：最近睡眠变浅',
        );
        expect(JSON.stringify(fetchSpy.mock.calls[0][1]?.body)).not.toMatch(
          /contentEnvelope|ciphertext|nonce|tag|contentSnapshot|evidenceMetadata/,
        );
        expect(prisma.aiConversationMessage.findMany).toHaveBeenCalledWith({
          where: { sessionId: conversationSessionId },
          orderBy: { turnIndex: 'desc' },
          take: 20,
          select: {
            id: true,
            sessionId: true,
            turnIndex: true,
            role: true,
            contentEnvelope: true,
            createdAt: true,
          },
        });
        expect(prisma.aiConversationSession.findUnique).toHaveBeenCalledWith({
          where: { id: conversationSessionId },
          select: {
            id: true,
            patientId: true,
            assessmentType: true,
            status: true,
            metadata: true,
          },
        });
        expect(prisma.aiConversationSession.updateMany).toHaveBeenCalledWith({
          where: {
            id: conversationSessionId,
            status: 'active',
            metadata: { path: ['turnCount'], equals: 1 },
          },
          data: objectContaining({
            callId: 'mimo-conversation-call-001',
            metadata: objectContaining({ turnCount: 3 }),
          }),
        });
      });

      it('rolls back a supplier-backed conversation turn when its success audit write fails', async () => {
        configureAiEnv();
        const { prisma, service } = createService();
        prisma.aiConversationSession.findUnique.mockResolvedValue({
          id: conversationSessionId,
          patientId: 'patient-profile-id',
          assessmentType: 'MMSE/CDR',
          status: 'active',
          metadata: { turnCount: 0 },
        });
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        grantRequiredConsents(prisma);
        prisma.aiConversationMessage.findMany.mockResolvedValue([]);

        const stagedWrites: string[] = [];
        const committedWrites: string[] = [];
        const auditFailure = new Error('sensitive conversation audit failure');
        const tx = {
          ...prisma,
          aiConversationSession: {
            ...prisma.aiConversationSession,
            updateMany: jest.fn().mockImplementation(() => {
              stagedWrites.push('session');
              return Promise.resolve({ count: 1 });
            }),
          },
          aiConversationMessage: {
            ...prisma.aiConversationMessage,
            create: jest
              .fn()
              .mockImplementation(({ data }: { data: object }) => {
                stagedWrites.push('message');
                return Promise.resolve({
                  ...data,
                  createdAt: new Date('2026-06-03T09:01:00.000Z'),
                });
              }),
          },
          auditLog: {
            create: jest.fn().mockRejectedValue(auditFailure),
          },
        };
        prisma.$transaction.mockImplementation(
          async (callback: (transaction: typeof tx) => Promise<unknown>) => {
            const value = await callback(tx);
            committedWrites.push(...stagedWrites);
            return value;
          },
        );
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
          providerJsonResponse({
            id: 'mimo-conversation-audit-failure',
            choices: [
              {
                message: {
                  content: JSON.stringify({ reply: assistantReply }),
                },
              },
            ],
          }),
        );
        await expect(
          service.appendAiConversationMessage(
            doctorUser,
            conversationSessionId,
            { content: conversationMessage },
          ),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
        expect(stagedWrites).toEqual(['session', 'message', 'message']);
        expect(committedWrites).toEqual([]);
      });

      it('appends after a long session using the latest 20 turns in ascending provider order', async () => {
        configureAiEnv();
        const { prisma, service } = createService();
        prisma.aiConversationSession.findUnique.mockResolvedValue({
          id: conversationSessionId,
          patientId: 'patient-profile-id',
          assessmentType: 'MMSE/CDR',
          status: 'active',
          metadata: { turnCount: 22 },
        });
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        grantRequiredConsents(prisma);
        const existingMessages = Array.from({ length: 22 }, (_, index) => {
          const turnIndex = index + 1;
          const id = `00000000-0000-4000-8000-${String(turnIndex).padStart(12, '0')}`;
          return {
            id,
            sessionId: conversationSessionId,
            turnIndex,
            role: turnIndex % 2 === 0 ? 'assistant' : 'user',
            contentEnvelope: encryptedConversationMessage(id, {
              content: `历史轮次 ${turnIndex}`,
              contentSnapshot: { source: 'prior_turn' },
              evidenceMetadata: { source: 'conversation_history' },
            }),
            createdAt: new Date(
              `2026-06-03T09:${String(turnIndex).padStart(2, '0')}:00.000Z`,
            ),
          };
        });
        prisma.aiConversationMessage.findMany.mockResolvedValue(
          [...existingMessages].reverse().slice(0, 20),
        );
        prisma.aiConversationSession.updateMany.mockResolvedValue({ count: 1 });
        prisma.aiConversationMessage.create.mockImplementation(
          ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              ...data,
              createdAt: new Date('2026-06-03T09:30:00.000Z'),
            }),
        );
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
          providerJsonResponse({
            id: 'long-conversation-provider-call',
            choices: [
              {
                message: {
                  content: JSON.stringify({ reply: assistantReply }),
                },
              },
            ],
          }),
        );

        await expect(
          service.appendAiConversationMessage(
            doctorUser,
            conversationSessionId,
            { content: conversationMessage },
          ),
        ).resolves.toMatchObject({
          userMessage: { turnIndex: 23, content: conversationMessage },
          assistantMessage: { turnIndex: 24, content: assistantReply },
        });

        expect(prisma.aiConversationMessage.findMany).toHaveBeenCalledWith({
          where: { sessionId: conversationSessionId },
          orderBy: { turnIndex: 'desc' },
          take: 20,
          select: conversationMessageSelect,
        });
        const providerRequest = JSON.parse(mockRequestBody(fetchSpy)) as {
          messages: Array<{ role: string; content: string }>;
        };
        const providerInput = JSON.parse(
          providerRequest.messages[1].content,
        ) as {
          previousTurns: Array<{ role: string; content: string }>;
        };
        expect(providerInput.previousTurns).toHaveLength(20);
        expect(providerInput.previousTurns.map((turn) => turn.content)).toEqual(
          Array.from({ length: 20 }, (_, index) => `历史轮次 ${index + 3}`),
        );
        expect(prisma.aiConversationSession.updateMany).toHaveBeenCalledWith({
          where: {
            id: conversationSessionId,
            status: 'active',
            metadata: { path: ['turnCount'], equals: 22 },
          },
          data: objectContaining({
            metadata: objectContaining({ turnCount: 24 }),
          }),
        });
        expect(prisma.aiConversationMessage.create).toHaveBeenNthCalledWith(
          1,
          objectContaining({
            data: objectContaining({ turnIndex: 23, role: 'user' }),
          }),
        );
        expect(prisma.aiConversationMessage.create).toHaveBeenNthCalledWith(
          2,
          objectContaining({
            data: objectContaining({
              turnIndex: 24,
              role: 'assistant',
            }),
          }),
        );
      });

      it('keeps clinical content and envelope JSON out of provider failure audits', async () => {
        configureAiEnv();
        const { prisma, service } = createService();
        prisma.aiConversationSession.findUnique.mockResolvedValue({
          id: conversationSessionId,
          patientId: 'patient-profile-id',
          assessmentType: 'MMSE/CDR',
          status: 'active',
          metadata: { turnCount: 0 },
        });
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        grantRequiredConsents(prisma);
        prisma.aiConversationMessage.findMany.mockResolvedValue([]);
        prisma.aiConversationMessage.create.mockImplementation(
          ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              ...data,
              createdAt: new Date('2026-06-03T09:01:00.000Z'),
            }),
        );
        jest
          .spyOn(globalThis, 'fetch')
          .mockRejectedValue(new Error('provider unavailable'));

        await expect(
          service.appendAiConversationMessage(
            doctorUser,
            conversationSessionId,
            {
              content: conversationMessage,
              contentSnapshot: { clinicalContext: '失败调用的临床上下文' },
            },
          ),
        ).rejects.toMatchObject({
          providerRequestError: { kind: 'network' },
        });

        expect(prisma.aiConversationMessage.create).not.toHaveBeenCalled();
        expect(prisma.aiConversationSession.update).not.toHaveBeenCalled();
        expect(prisma.aiConversationSession.updateMany).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
        const auditJson = JSON.stringify(prisma.auditLog.create.mock.calls);
        expect(auditJson).toContain('provider_call');
        expect(auditJson).not.toContain(conversationMessage);
        expect(auditJson).not.toContain('失败调用的临床上下文');
        expect(auditJson).not.toMatch(
          /"(?:contentEnvelope|ciphertext|nonce|tag|requestBody|responseBody)":/,
        );
      });

      it.each([
        'invalid content snapshot',
        'invalid historical message envelope',
        'out-of-sync turn state',
      ] as const)(
        'does not reserve, audit, record telemetry, or call the provider for %s',
        async (failureMode) => {
          configureAiEnv();
          const { prisma, service } = createService();
          const methods = service as unknown as {
            reserveMimoUsage: jest.Mock;
            auditAiConversationFailure: jest.Mock;
            recordProviderTelemetry: jest.Mock;
          };
          const reserve = jest
            .spyOn(methods, 'reserveMimoUsage')
            .mockResolvedValue(undefined);
          const auditFailure = jest.spyOn(
            methods,
            'auditAiConversationFailure',
          );
          const recordTelemetry = jest.spyOn(
            methods,
            'recordProviderTelemetry',
          );
          prisma.aiConversationSession.findUnique.mockResolvedValue({
            id: conversationSessionId,
            patientId: 'patient-profile-id',
            assessmentType: 'MMSE/CDR',
            status: 'active',
            metadata: {
              turnCount: failureMode === 'out-of-sync turn state' ? 1 : 0,
            },
          });
          prisma.patientProfile.findUnique.mockResolvedValue({
            id: 'patient-profile-id',
            responsibleDoctorId: 'doctor-profile-id',
          });
          grantRequiredConsents(prisma);
          prisma.aiConversationMessage.findMany.mockResolvedValue(
            failureMode === 'invalid historical message envelope'
              ? [
                  {
                    id: userMessageId,
                    sessionId: conversationSessionId,
                    turnIndex: 1,
                    role: 'user',
                    contentEnvelope: null,
                    createdAt: new Date('2026-06-03T08:59:00.000Z'),
                  },
                ]
              : [],
          );
          const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockRejectedValue(new Error('must not call provider'));
          const dto = {
            content: conversationMessage,
            idempotencyKey: 'conversation-preflight-key-0001',
            ...(failureMode === 'invalid content snapshot'
              ? { contentSnapshot: 'not-an-object' }
              : {}),
          };

          await expect(
            service.appendAiConversationMessage(
              doctorUser,
              conversationSessionId,
              dto,
            ),
          ).rejects.toBeInstanceOf(
            failureMode === 'out-of-sync turn state'
              ? ConflictException
              : failureMode === 'invalid content snapshot'
                ? BadRequestException
                : Error,
          );

          expect(reserve).not.toHaveBeenCalled();
          expect(fetchSpy).not.toHaveBeenCalled();
          expect(auditFailure).not.toHaveBeenCalled();
          expect(recordTelemetry).not.toHaveBeenCalled();
          expect(prisma.auditLog.create).not.toHaveBeenCalled();
        },
      );

      it.each(['missing', 'tampered', 'wrong-key'] as const)(
        'does not call the provider for a %s historical message envelope',
        async (failureMode) => {
          configureAiEnv();
          const { prisma, service } = createService();
          prisma.aiConversationSession.findUnique.mockResolvedValue({
            id: conversationSessionId,
            patientId: 'patient-profile-id',
            assessmentType: 'MMSE/CDR',
            status: 'active',
            metadata: { turnCount: 1 },
          });
          prisma.patientProfile.findUnique.mockResolvedValue({
            id: 'patient-profile-id',
            responsibleDoctorId: 'doctor-profile-id',
          });
          grantRequiredConsents(prisma);
          prisma.aiConversationMessage.findMany.mockResolvedValue([
            {
              id: userMessageId,
              sessionId: conversationSessionId,
              turnIndex: 1,
              role: 'user',
              contentEnvelope: failedConversationEnvelope(failureMode, (key) =>
                encryptedConversationMessage(
                  userMessageId,
                  {
                    content: '损坏的历史临床消息。',
                    contentSnapshot: {},
                    evidenceMetadata: {},
                  },
                  key,
                ),
              ),
              createdAt: new Date('2026-06-03T08:59:00.000Z'),
            },
          ]);
          const fetchSpy = jest
            .spyOn(globalThis, 'fetch')
            .mockRejectedValue(new Error('must not call provider'));

          await expect(
            service.appendAiConversationMessage(
              doctorUser,
              conversationSessionId,
              { content: conversationMessage },
            ),
          ).rejects.toThrow();

          expect(fetchSpy).not.toHaveBeenCalled();
          expect(prisma.aiConversationMessage.create).not.toHaveBeenCalled();
          expect(prisma.$transaction).not.toHaveBeenCalled();
        },
      );

      it('allows only one concurrent append transaction to commit a complete turn', async () => {
        configureAiEnv();
        const { prisma, service } = createService();
        prisma.aiConversationSession.findUnique.mockResolvedValue({
          id: conversationSessionId,
          patientId: 'patient-profile-id',
          assessmentType: 'MMSE/CDR',
          status: 'active',
          metadata: { turnCount: 0 },
        });
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        prisma.consentRecord.findFirst.mockImplementation(
          ({ where }: { where: { consentType: string } }) =>
            Promise.resolve({
              id: `${where.consentType}-consent-id`,
              patientId: 'patient-profile-id',
              consentType: where.consentType,
              consentVersion: 'v1.2',
              status: 'granted',
              revokedAt: null,
            }),
        );
        prisma.aiConversationMessage.findMany.mockResolvedValue([]);
        prisma.aiConversationSession.updateMany
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 });
        prisma.aiConversationMessage.create.mockImplementation(
          ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              ...data,
              createdAt: new Date('2026-06-03T09:01:00.000Z'),
            }),
        );
        jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
          Promise.resolve(
            providerJsonResponse({
              id: 'concurrent-provider-call',
              choices: [
                {
                  message: {
                    content: JSON.stringify({ reply: assistantReply }),
                  },
                },
              ],
            }),
          ),
        );

        const results = await Promise.allSettled([
          service.appendAiConversationMessage(
            doctorUser,
            conversationSessionId,
            { content: '并发消息 A' },
          ),
          service.appendAiConversationMessage(
            doctorUser,
            conversationSessionId,
            { content: '并发消息 B' },
          ),
        ]);

        expect(
          results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
          results.filter((result) => result.status === 'rejected'),
        ).toHaveLength(1);
        expect(prisma.aiConversationMessage.create).toHaveBeenCalledTimes(2);
        expect(prisma.aiConversationSession.updateMany).toHaveBeenCalledTimes(
          2,
        );
      });

      it('does not append messages when completion wins the observed turn-count race', async () => {
        configureAiEnv();
        const { prisma, service } = createService();
        const activeSession = {
          id: conversationSessionId,
          patientId: 'patient-profile-id',
          createdByUserId: 'doctor-user-id',
          assessmentType: 'MMSE/CDR',
          status: 'active',
          metadata: { turnCount: 0 },
        };
        const pendingSession = {
          ...activeSession,
          status: 'pending_human_review',
          summaryEnvelope: encryptedConversationSessionField(
            'summaryEnvelope',
            { summary: '竞态完成总结。' },
          ),
          reviewEnvelope: encryptedConversationSessionField('reviewEnvelope', {
            reviewNote: '竞态完成复核。',
          }),
          messages: [],
        };
        prisma.aiConversationSession.findUnique.mockImplementation(
          ({ select }: { select?: Record<string, unknown> }) =>
            Promise.resolve(select?.messages ? pendingSession : activeSession),
        );
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        prisma.consentRecord.findFirst.mockImplementation(
          ({ where }: { where: { consentType: string } }) =>
            Promise.resolve({
              id: `${where.consentType}-consent-id`,
              patientId: 'patient-profile-id',
              consentType: where.consentType,
              consentVersion: 'v1.2',
              status: 'granted',
              revokedAt: null,
            }),
        );
        prisma.aiConversationMessage.findMany.mockResolvedValue([]);
        prisma.aiConversationSession.updateMany
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 });
        let releaseProvider: ((response: Response) => void) | undefined;
        let markProviderStarted: (() => void) | undefined;
        const providerStarted = new Promise<void>((resolve) => {
          markProviderStarted = resolve;
        });
        jest.spyOn(globalThis, 'fetch').mockImplementation(
          () =>
            new Promise<Response>((resolve) => {
              releaseProvider = resolve;
              markProviderStarted?.();
            }),
        );

        const appendPromise = service.appendAiConversationMessage(
          doctorUser,
          conversationSessionId,
          { content: '与完成操作竞态的消息。' },
        );
        await providerStarted;
        await expect(
          service.completeAiConversation(doctorUser, conversationSessionId, {
            summary: '竞态完成总结。',
            reviewNote: '竞态完成复核。',
          }),
        ).resolves.toMatchObject({ status: 'pending_human_review' });
        releaseProvider?.(
          providerJsonResponse({
            id: 'race-provider-call',
            choices: [
              {
                message: {
                  content: JSON.stringify({ reply: assistantReply }),
                },
              },
            ],
          }),
        );
        await expect(appendPromise).rejects.toBeInstanceOf(ConflictException);

        expect(prisma.aiConversationMessage.create).not.toHaveBeenCalled();
      });

      it('submits a session into explicit pending_human_review state', async () => {
        const { prisma, service } = createService();
        const activeSession = {
          id: conversationSessionId,
          patientId: 'patient-profile-id',
          createdByUserId: 'doctor-user-id',
          assessmentType: 'MMSE/CDR',
          status: 'active',
          metadata: { turnCount: 0 },
        };
        const pendingSession = {
          ...activeSession,
          status: 'pending_human_review',
          summaryEnvelope: encryptedConversationSessionField(
            'summaryEnvelope',
            { summary: '患者主诉近期记忆和日期定向下降。' },
          ),
          reviewEnvelope: encryptedConversationSessionField('reviewEnvelope', {
            reviewNote: '请医生结合量表复核。',
          }),
          completedAt: new Date('2026-06-03T09:30:00.000Z'),
          messages: [],
        };
        prisma.aiConversationSession.findUnique
          .mockResolvedValueOnce(activeSession)
          .mockResolvedValueOnce(pendingSession);
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        prisma.aiConversationSession.updateMany.mockResolvedValue({ count: 1 });

        await expect(
          service.completeAiConversation(doctorUser, conversationSessionId, {
            summary: '患者主诉近期记忆和日期定向下降。',
            reviewNote: '请医生结合量表复核。',
          }),
        ).resolves.toMatchObject({
          id: conversationSessionId,
          status: 'pending_human_review',
          summary: '患者主诉近期记忆和日期定向下降。',
          reviewNote: '请医生结合量表复核。',
        });

        expect(prisma.aiConversationSession.updateMany).toHaveBeenCalledWith({
          where: {
            id: conversationSessionId,
            patientId: 'patient-profile-id',
            status: 'active',
            metadata: { path: ['turnCount'], equals: 0 },
          },
          data: objectContaining({
            status: 'pending_human_review',
            summaryEnvelope: objectContaining({ alg: 'AES-256-GCM' }),
            reviewEnvelope: objectContaining({ alg: 'AES-256-GCM' }),
            completedAt: expect.any(Date) as Date,
            metadata: objectContaining({
              turnCount: 0,
              humanReview: objectContaining({
                required: true,
                status: 'pending_human_review',
              }),
            }),
          }),
        });
        const updateData = mockArg<{
          data: { summaryEnvelope: unknown; reviewEnvelope: unknown };
        }>(prisma.aiConversationSession.updateMany).data;
        expect(updateData).not.toHaveProperty('summary');
        expect(updateData).not.toHaveProperty('reviewNote');
        expect(
          decryptSensitiveJson(
            updateData.summaryEnvelope,
            {
              tableName: 'ai_conversation_session',
              recordId: conversationSessionId,
              fieldName: 'summaryEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
        ).toEqual({ summary: '患者主诉近期记忆和日期定向下降。' });
        expect(
          decryptSensitiveJson(
            updateData.reviewEnvelope,
            {
              tableName: 'ai_conversation_session',
              recordId: conversationSessionId,
              fieldName: 'reviewEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
        ).toEqual({ reviewNote: '请医生结合量表复核。' });
        expect(prisma.aiConversationSession.findUnique).toHaveBeenNthCalledWith(
          1,
          {
            where: { id: conversationSessionId },
            select: {
              id: true,
              patientId: true,
              status: true,
              metadata: true,
            },
          },
        );
        expect(prisma.aiConversationSession.findUnique).toHaveBeenNthCalledWith(
          2,
          {
            where: { id: conversationSessionId },
            select: conversationSessionWithMessagesSelect,
          },
        );
        const auditJson = JSON.stringify(prisma.auditLog.create.mock.calls);
        expect(auditJson).not.toContain('患者主诉近期记忆和日期定向下降');
        expect(auditJson).not.toContain('请医生结合量表复核');
        expect(auditJson).not.toMatch(
          /summaryEnvelope|reviewEnvelope|ciphertext|nonce|tag/,
        );
      });

      it('marks a pending AI conversation as reviewed with approved human review metadata', async () => {
        const { prisma, service } = createService();
        const pendingSession = {
          id: conversationSessionId,
          patientId: 'patient-profile-id',
          createdByUserId: 'doctor-user-id',
          assessmentType: 'MMSE/CDR',
          status: 'pending_human_review',
          reviewedByUserId: null,
          reviewedAt: null,
          summaryEnvelope: encryptedConversationSessionField(
            'summaryEnvelope',
            { summary: '待医生复核的会话总结。' },
          ),
          reviewEnvelope: encryptedConversationSessionField('reviewEnvelope', {
            reviewNote: '初始人工复核要求。',
          }),
          metadata: {
            consentSnapshot: {
              version: 'v1.2',
              requiredTypes: ['privacy_policy', 'ai_processing'],
              grantedConsentIds: ['privacy-consent-id', 'ai-consent-id'],
              status: 'granted',
            },
            humanReview: {
              required: true,
              status: 'pending_human_review',
            },
          },
        };
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        const reviewedSession = {
          ...pendingSession,
          patientId: 'patient-profile-id',
          status: 'reviewed',
          reviewEnvelope: encryptedConversationSessionField('reviewEnvelope', {
            reviewNote: '已结合量表完成复核。',
          }),
          reviewedByUserId: 'doctor-user-id',
          reviewedAt: new Date('2026-06-03T10:00:00.000Z'),
          messages: [],
        };
        prisma.aiConversationSession.findUnique
          .mockResolvedValueOnce(pendingSession)
          .mockResolvedValueOnce(reviewedSession);
        prisma.aiConversationSession.updateMany.mockResolvedValue({ count: 1 });

        await expect(
          service.reviewAiConversation(doctorUser, conversationSessionId, {
            conclusion: 'approved',
            reviewNote: '已结合量表完成复核。',
          }),
        ).resolves.toMatchObject({
          id: conversationSessionId,
          status: 'reviewed',
          reviewedByUserId: 'doctor-user-id',
          summary: '待医生复核的会话总结。',
          reviewNote: '已结合量表完成复核。',
        });

        expect(prisma.aiConversationSession.updateMany).toHaveBeenCalledWith({
          where: {
            id: conversationSessionId,
            patientId: 'patient-profile-id',
            status: 'pending_human_review',
            reviewedByUserId: null,
            reviewedAt: null,
          },
          data: objectContaining({
            status: 'reviewed',
            reviewEnvelope: objectContaining({ alg: 'AES-256-GCM' }),
            reviewedByUserId: 'doctor-user-id',
            reviewedAt: expect.any(Date) as Date,
            metadata: objectContaining({
              humanReview: objectContaining({
                required: true,
                status: 'reviewed',
                conclusion: 'approved',
                reviewerUserId: 'doctor-user-id',
              }),
            }),
          }),
        });
        const updateData = mockArg<{
          data: { reviewEnvelope: unknown };
        }>(prisma.aiConversationSession.updateMany).data;
        expect(updateData).not.toHaveProperty('reviewNote');
        expect(
          decryptSensitiveJson(
            updateData.reviewEnvelope,
            {
              tableName: 'ai_conversation_session',
              recordId: conversationSessionId,
              fieldName: 'reviewEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
        ).toEqual({ reviewNote: '已结合量表完成复核。' });
        expect(prisma.aiConversationSession.findUnique).toHaveBeenNthCalledWith(
          1,
          {
            where: { id: conversationSessionId },
            select: {
              id: true,
              patientId: true,
              status: true,
              summaryEnvelope: true,
              reviewEnvelope: true,
              reviewedByUserId: true,
              reviewedAt: true,
              metadata: true,
            },
          },
        );
        expect(prisma.aiConversationSession.findUnique).toHaveBeenNthCalledWith(
          2,
          {
            where: { id: conversationSessionId },
            select: conversationSessionWithMessagesSelect,
          },
        );
        const auditJson = JSON.stringify(prisma.auditLog.create.mock.calls);
        expect(auditJson).not.toContain('已结合量表完成复核');
        expect(auditJson).not.toMatch(
          /summaryEnvelope|reviewEnvelope|ciphertext|nonce|tag/,
        );
      });

      it('lists patient AI conversations by patient access', async () => {
        const { prisma, service } = createService();
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        prisma.aiConversationSession.findMany.mockResolvedValue([
          {
            id: conversationSessionId,
            patientId: 'patient-profile-id',
            status: 'pending_human_review',
            summaryEnvelope: encryptedConversationSessionField(
              'summaryEnvelope',
              { summary: '列表中的会话总结。' },
            ),
            reviewEnvelope: encryptedConversationSessionField(
              'reviewEnvelope',
              { reviewNote: '列表中的复核说明。' },
            ),
            messages: [
              {
                id: userMessageId,
                sessionId: conversationSessionId,
                turnIndex: 1,
                role: 'user',
                contentEnvelope: encryptedConversationMessage(userMessageId, {
                  content: conversationMessage,
                  contentSnapshot: { clinicalContext: '列表临床上下文' },
                  evidenceMetadata: {
                    source: 'clinician_or_patient_input',
                  },
                }),
                createdAt: new Date('2026-06-03T09:01:00.000Z'),
              },
            ],
          },
        ]);

        const result = await service.listPatientAiConversations(
          doctorUser,
          'patient-profile-id',
        );
        expect(result).toEqual([
          objectContaining({
            id: conversationSessionId,
            patientId: 'patient-profile-id',
            status: 'pending_human_review',
            summary: '列表中的会话总结。',
            reviewNote: '列表中的复核说明。',
            messages: [
              objectContaining({
                id: userMessageId,
                content: conversationMessage,
                contentSnapshot: { clinicalContext: '列表临床上下文' },
              }),
            ],
          }),
        ]);
        expect(JSON.stringify(result)).not.toContain('Envelope');

        expect(prisma.aiConversationSession.findMany).toHaveBeenCalledWith({
          where: { patientId: 'patient-profile-id' },
          orderBy: { startedAt: 'desc' },
          select: {
            id: true,
            patientId: true,
            createdByUserId: true,
            assessmentType: true,
            status: true,
            startedAt: true,
            completedAt: true,
            provider: true,
            modelVersion: true,
            callId: true,
            endpointRef: true,
            promptVersion: true,
            summaryEnvelope: true,
            reviewEnvelope: true,
            reviewedByUserId: true,
            reviewedAt: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            messages: {
              orderBy: { turnIndex: 'asc' },
              select: {
                id: true,
                sessionId: true,
                turnIndex: true,
                role: true,
                contentEnvelope: true,
                createdAt: true,
              },
            },
          },
        });
        expect(
          JSON.stringify(prisma.aiConversationSession.findMany.mock.calls),
        ).not.toMatch(
          /"summary":true|"reviewNote":true|"content":true|"contentSnapshot":true|"evidenceMetadata":true/,
        );
      });

      it.each(
        (['summary', 'review', 'message'] as const).flatMap((target) =>
          (['missing', 'tampered', 'wrong-key'] as const).map(
            (failureMode) => ({ target, failureMode }),
          ),
        ),
      )(
        'hard-fails $target reads for a $failureMode conversation envelope',
        async ({ target, failureMode }) => {
          const { prisma, service } = createService();
          prisma.patientProfile.findUnique.mockResolvedValue({
            id: 'patient-profile-id',
            responsibleDoctorId: 'doctor-profile-id',
          });
          const summaryEnvelope =
            target === 'summary'
              ? failedConversationEnvelope(failureMode, (key) =>
                  encryptedConversationSessionField(
                    'summaryEnvelope',
                    { summary: '坏信封测试总结。' },
                    key,
                  ),
                )
              : encryptedConversationSessionField('summaryEnvelope', {
                  summary: '有效总结。',
                });
          const reviewEnvelope =
            target === 'review'
              ? failedConversationEnvelope(failureMode, (key) =>
                  encryptedConversationSessionField(
                    'reviewEnvelope',
                    { reviewNote: '坏信封测试复核。' },
                    key,
                  ),
                )
              : encryptedConversationSessionField('reviewEnvelope', {
                  reviewNote: '有效复核。',
                });
          const contentEnvelope =
            target === 'message'
              ? failedConversationEnvelope(failureMode, (key) =>
                  encryptedConversationMessage(
                    userMessageId,
                    {
                      content: '坏信封测试消息。',
                      contentSnapshot: {},
                      evidenceMetadata: {},
                    },
                    key,
                  ),
                )
              : encryptedConversationMessage(userMessageId, {
                  content: '有效消息。',
                  contentSnapshot: {},
                  evidenceMetadata: {},
                });
          prisma.aiConversationSession.findMany.mockResolvedValue([
            {
              id: conversationSessionId,
              patientId: 'patient-profile-id',
              status: 'pending_human_review',
              summaryEnvelope,
              reviewEnvelope,
              messages: [
                {
                  id: userMessageId,
                  sessionId: conversationSessionId,
                  turnIndex: 1,
                  role: 'user',
                  contentEnvelope,
                  createdAt: new Date('2026-06-03T09:01:00.000Z'),
                },
              ],
            },
          ]);

          await expect(
            service.listPatientAiConversations(
              doctorUser,
              'patient-profile-id',
            ),
          ).rejects.toThrow();
        },
      );
    });
  });

  describe('speech assessment transcript generation', () => {
    const speechEnvNames = [
      'SPEECH_REQUIRED_FOR_LAUNCH',
      'SPEECH_PROVIDER',
      'SPEECH_TO_TEXT_ENDPOINT',
      'MIMO_API_KEY_REF',
      'MIMO_API_KEY',
      'SPEECH_PROVIDER_TIMEOUT_MS',
      'SPEECH_PROVIDER_MAX_RESPONSE_BYTES',
      'STT_MAX_DECODED_AUDIO_BYTES',
      'STT_MAX_DURATION_SECONDS',
      'SPEECH_MODEL_VERSION',
    ] as const;
    const envSnapshot = { ...process.env };

    const speechTranscriptDto = {
      patientId: 'patient-profile-id',
      assessmentType: 'MMSE/CDR',
      audio: {
        contentBase64: Buffer.from('formal-audio-bytes').toString('base64'),
        mimeType: 'audio/wav',
        durationSeconds: 42,
      },
    };

    function configureSpeechEnv() {
      process.env.SPEECH_REQUIRED_FOR_LAUNCH = 'true';
      process.env.SPEECH_PROVIDER = 'xiaomi-mimo-audio-understanding';
      process.env.SPEECH_TO_TEXT_ENDPOINT =
        'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
      process.env.MIMO_API_KEY_REF = 'secret-manager://mimo/unit-key';
      process.env.MIMO_API_KEY = 'unit-speech-runtime-secret';
      process.env.SPEECH_PROVIDER_TIMEOUT_MS = '15000';
      process.env.SPEECH_PROVIDER_MAX_RESPONSE_BYTES = '1048576';
      process.env.STT_MAX_DECODED_AUDIO_BYTES = '10485760';
      process.env.STT_MAX_DURATION_SECONDS = '600';
      process.env.SPEECH_MODEL_VERSION = 'mimo-v2.5';
    }

    function clearSpeechEnv() {
      for (const name of speechEnvNames) {
        delete process.env[name];
      }
    }

    function grantSpeechConsents(
      prisma: ReturnType<typeof createService>['prisma'],
    ) {
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
        })
        .mockResolvedValueOnce({
          id: 'microphone-consent-id',
          patientId: 'patient-profile-id',
          consentType: 'microphone_capture',
          consentVersion: 'v1.2',
          status: 'granted',
          revokedAt: null,
        });
    }

    afterEach(() => {
      for (const name of speechEnvNames) {
        if (envSnapshot[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = envSnapshot[name];
        }
      }
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    it('rejects speech transcript generation when launch scope is not enabled and does not call provider', async () => {
      clearSpeechEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAssessmentSpeechTranscript(
          doctorUser,
          speechTranscriptDto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
      expect(prisma.aiAnalysisRecord.create).not.toHaveBeenCalled();
    });

    it('blocks speech transcript generation without microphone consent before provider call', async () => {
      configureSpeechEnv();
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
        })
        .mockResolvedValueOnce(null);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAssessmentSpeechTranscript(
          doctorUser,
          speechTranscriptDto,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.consentRecord.findFirst).toHaveBeenLastCalledWith({
        where: {
          patientId: 'patient-profile-id',
          consentType: 'microphone_capture',
          consentVersion: 'v1.2',
          status: 'granted',
          revokedAt: null,
        },
        orderBy: { grantedAt: 'desc' },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
    });

    it('rejects browser webm speech audio before provider call because Xiaomi requires provider-ready audio', async () => {
      configureSpeechEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAssessmentSpeechTranscript(doctorUser, {
          ...speechTranscriptDto,
          audio: {
            ...speechTranscriptDto.audio,
            mimeType: 'audio/webm',
          },
        }),
      ).rejects.toThrow('语音转写音频类型必须是小米支持的正式音频格式');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
    });

    it('rejects unsupported speech audio before provider call', async () => {
      configureSpeechEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAssessmentSpeechTranscript(doctorUser, {
          ...speechTranscriptDto,
          audio: {
            ...speechTranscriptDto.audio,
            mimeType: 'text/plain',
          },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
    });

    it('rejects fractional speech duration before the provider and quota gate', async () => {
      configureSpeechEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAssessmentSpeechTranscript(doctorUser, {
          ...speechTranscriptDto,
          audio: {
            ...speechTranscriptDto.audio,
            durationSeconds: 42.5,
          },
        }),
      ).rejects.toThrow('语音转写音频时长必须是 1 到 600 之间的整数秒');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
    });

    it('returns 400 when decoded STT audio exceeds the required byte limit', async () => {
      configureSpeechEnv();
      process.env.STT_MAX_DECODED_AUDIO_BYTES = '3';
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAssessmentSpeechTranscript(doctorUser, {
          ...speechTranscriptDto,
          audio: {
            ...speechTranscriptDto.audio,
            contentBase64: Buffer.from('four').toString('base64'),
          },
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 400 when STT duration exceeds the required integer-second limit', async () => {
      configureSpeechEnv();
      process.env.STT_MAX_DURATION_SECONDS = '42';
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAssessmentSpeechTranscript(doctorUser, {
          ...speechTranscriptDto,
          audio: {
            ...speechTranscriptDto.audio,
            durationSeconds: 43,
          },
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects invalid speech runtime endpoint before provider call', async () => {
      configureSpeechEnv();
      process.env.SPEECH_TO_TEXT_ENDPOINT = 'http://localhost:9000/stt';
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAssessmentSpeechTranscript(
          doctorUser,
          speechTranscriptDto,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
    });

    it('rejects non-Xiaomi speech providers before calling the Xiaomi audio understanding protocol', async () => {
      configureSpeechEnv();
      process.env.SPEECH_PROVIDER = 'vendor-standard-stt';
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createAssessmentSpeechTranscript(
          doctorUser,
          speechTranscriptDto,
        ),
      ).rejects.toThrow('当前语音转写接口仅支持小米 MiMo 音频理解协议');

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
    });

    it('returns a transcript from Xiaomi audio understanding without persisting assessment records', async () => {
      configureSpeechEnv();
      process.env.STT_MAX_DECODED_AUDIO_BYTES = String(
        Buffer.byteLength(speechTranscriptDto.audio.contentBase64, 'base64'),
      );
      process.env.STT_MAX_DURATION_SECONDS = String(
        speechTranscriptDto.audio.durationSeconds,
      );
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        providerJsonResponse({
          id: 'mimo-audio-call-001',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  transcript: '今天是星期一，我记得三个词是苹果、桌子和硬币。',
                }),
              },
            },
          ],
        }),
      );

      await expect(
        service.createAssessmentSpeechTranscript(
          doctorUser,
          speechTranscriptDto,
        ),
      ).resolves.toMatchObject({
        patientId: 'patient-profile-id',
        assessmentType: 'MMSE/CDR',
        status: 'transcribed',
        transcript: '今天是星期一，我记得三个词是苹果、桌子和硬币。',
        speechEvidence: {
          provider: 'xiaomi-mimo-audio-understanding',
          modelVersion: 'mimo-v2.5',
          callId: 'mimo-audio-call-001',
          endpointRef:
            'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
          source: 'provider_audio_understanding',
          calledAt: expect.any(String) as string,
          audio: {
            mimeType: 'audio/wav',
            durationSeconds: 42,
          },
        },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          signal: expect.any(AbortSignal) as AbortSignal,
          headers: objectContaining({
            'api-key': 'unit-speech-runtime-secret',
            'Content-Type': 'application/json',
          }),
        }),
      );
      const requestBody = JSON.parse(
        fetchSpy.mock.calls[0][1]?.body as string,
      ) as {
        model: string;
        messages: Array<{
          role: string;
          content:
            | string
            | Array<{
                type: string;
                text?: string;
                input_audio?: { data: string };
              }>;
        }>;
      };
      expect(requestBody.model).toBe('mimo-v2.5');
      expect(requestBody.messages[1].content).toEqual(
        arrayContaining([
          objectContaining({
            type: 'input_audio',
            input_audio: objectContaining({
              data: `data:audio/wav;base64,${speechTranscriptDto.audio.contentBase64}`,
            }),
          }),
          objectContaining({
            type: 'text',
            text: expect.stringContaining('逐字转写') as string,
          }),
        ]),
      );
      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
      expect(prisma.aiAnalysisRecord.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.assessment_speech_transcript.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'success',
          metadata: objectContaining({
            provider: 'xiaomi-mimo-audio-understanding',
            modelVersion: 'mimo-v2.5',
            callId: 'mimo-audio-call-001',
            source: 'provider_audio_understanding',
            calledAt: expect.any(String) as string,
          }),
        }),
      });
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        '今天是星期一',
      );
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        speechTranscriptDto.audio.contentBase64,
      );
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        'unit-speech-runtime-secret',
      );
    });

    it('audits Xiaomi audio understanding failures without returning placeholder transcript', async () => {
      configureSpeechEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          providerJsonResponse({ error: { code: 'UPSTREAM_BUSY' } }, 503),
        );

      await expect(
        service.createAssessmentSpeechTranscript(
          doctorUser,
          speechTranscriptDto,
        ),
      ).rejects.toMatchObject({
        providerRequestError: { kind: 'upstream_http', upstreamStatus: 503 },
      });

      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
      expect(prisma.aiAnalysisRecord.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.assessment_speech_transcript.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'failed',
          metadata: objectContaining({
            provider: 'xiaomi-mimo-audio-understanding',
            modelVersion: 'mimo-v2.5',
            failureStage: 'provider_call',
          }),
        }),
      });
    });

    it('rejects malformed Xiaomi audio understanding output instead of returning placeholder transcript', async () => {
      configureSpeechEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantSpeechConsents(prisma);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        providerJsonResponse({
          id: 'mimo-audio-call-002',
          choices: [{ message: { content: '无法判断。' } }],
        }),
      );

      await expect(
        service.createAssessmentSpeechTranscript(
          doctorUser,
          speechTranscriptDto,
        ),
      ).rejects.toBeInstanceOf(ProviderResponseRejectedException);

      expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
      expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
      expect(prisma.aiAnalysisRecord.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.assessment_speech_transcript.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'failed',
          metadata: objectContaining({
            provider: 'xiaomi-mimo-audio-understanding',
            modelVersion: 'mimo-v2.5',
            callId: 'mimo-audio-call-002',
            failureStage: 'provider_response_validation',
          }),
        }),
      });
    });

    it.each([undefined, '   '])(
      'rejects Xiaomi audio understanding output with non-canonical content %p even when reasoning_content contains a transcript',
      async (content) => {
        configureSpeechEnv();
        const { prisma, service } = createService();
        prisma.patientProfile.findUnique.mockResolvedValue({
          id: 'patient-profile-id',
          responsibleDoctorId: 'doctor-profile-id',
        });
        grantSpeechConsents(prisma);
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(
          providerJsonResponse({
            id: 'mimo-audio-call-non-canonical-content',
            choices: [
              {
                message: {
                  content,
                  reasoning_content: JSON.stringify({
                    transcript: '不得作为正式转写返回的推理内容。',
                  }),
                },
              },
            ],
          }),
        );

        await expect(
          service.createAssessmentSpeechTranscript(
            doctorUser,
            speechTranscriptDto,
          ),
        ).rejects.toBeInstanceOf(ProviderResponseRejectedException);

        expect(prisma.assessmentRecord.create).not.toHaveBeenCalled();
        expect(prisma.riskGradeRecord.create).not.toHaveBeenCalled();
        expect(prisma.aiAnalysisRecord.create).not.toHaveBeenCalled();
      },
    );
  });

  describe('TTS speech output generation', () => {
    const ttsEnvNames = [
      'TTS_REQUIRED_FOR_LAUNCH',
      'TTS_PROVIDER',
      'TTS_ENDPOINT',
      'MIMO_API_KEY_REF',
      'MIMO_API_KEY',
      'TTS_PROVIDER_TIMEOUT_MS',
      'TTS_PROVIDER_MAX_RESPONSE_BYTES',
      'TTS_MODEL_VERSION',
      'TTS_VOICE_ID',
      'TTS_OUTPUT_FORMAT',
    ] as const;
    const envSnapshot = { ...process.env };

    const ttsSpeechOutputDto = {
      patientId: 'patient-profile-id',
      text: '今天的触达训练准备开始，请保持身体稳定。',
      scenario: 'training_cue',
    };
    const validWavAudioBase64 = Buffer.from(
      'RIFF$\x00\x00\x00WAVEfmt ',
      'binary',
    ).toString('base64');

    function configureTtsEnv() {
      process.env.TTS_REQUIRED_FOR_LAUNCH = 'true';
      process.env.TTS_PROVIDER = 'xiaomi-mimo-tts';
      process.env.TTS_ENDPOINT =
        'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
      process.env.MIMO_API_KEY_REF = 'secret-manager://mimo/unit-key';
      process.env.MIMO_API_KEY = 'unit-tts-runtime-secret';
      process.env.TTS_PROVIDER_TIMEOUT_MS = '15000';
      process.env.TTS_PROVIDER_MAX_RESPONSE_BYTES = '14680064';
      process.env.TTS_MODEL_VERSION = 'mimo-v2.5-tts';
      process.env.TTS_VOICE_ID = 'Chloe';
      process.env.TTS_OUTPUT_FORMAT = 'wav';
    }

    function clearTtsEnv() {
      for (const name of ttsEnvNames) {
        delete process.env[name];
      }
    }

    function grantTtsConsents(
      prisma: ReturnType<typeof createService>['prisma'],
    ) {
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
    }

    afterEach(() => {
      for (const name of ttsEnvNames) {
        if (envSnapshot[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = envSnapshot[name];
        }
      }
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    it('rejects TTS speech output when launch scope is not enabled and does not call provider', async () => {
      clearTtsEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantTtsConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createTtsSpeechOutput(doctorUser, ttsSpeechOutputDto),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalledWith({
        data: objectContaining({
          action: 'ai.tts_speech_output.generate',
          result: 'success',
        }),
      });
    });

    it('blocks TTS speech output without AI processing consent before provider call', async () => {
      configureTtsEnv();
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
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createTtsSpeechOutput(doctorUser, ttsSpeechOutputDto),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.consentRecord.findFirst).toHaveBeenLastCalledWith({
        where: {
          patientId: 'patient-profile-id',
          consentType: 'ai_processing',
          consentVersion: 'v1.2',
          status: 'granted',
          revokedAt: null,
        },
        orderBy: { grantedAt: 'desc' },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects invalid TTS endpoint before provider call', async () => {
      configureTtsEnv();
      process.env.TTS_ENDPOINT = 'http://localhost:9000/tts';
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantTtsConsents(prisma);
      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('should not call provider'));

      await expect(
        service.createTtsSpeechOutput(doctorUser, ttsSpeechOutputDto),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns synthesized Xiaomi TTS audio and audits without sensitive payloads', async () => {
      configureTtsEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantTtsConsents(prisma);
      const audioBase64 = validWavAudioBase64;
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        providerJsonResponse({
          id: 'mimo-tts-call-001',
          choices: [
            {
              message: {
                audio: {
                  data: audioBase64,
                },
              },
            },
          ],
        }),
      );

      await expect(
        service.createTtsSpeechOutput(doctorUser, ttsSpeechOutputDto),
      ).resolves.toMatchObject({
        patientId: 'patient-profile-id',
        status: 'synthesized',
        audio: {
          contentBase64: audioBase64,
          mimeType: 'audio/wav',
          byteLength: Buffer.byteLength(audioBase64, 'base64'),
        },
        ttsEvidence: {
          provider: 'xiaomi-mimo-tts',
          modelVersion: 'mimo-v2.5-tts',
          callId: 'mimo-tts-call-001',
          endpointRef:
            'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
          source: 'provider_text_to_speech',
          calledAt: expect.any(String) as string,
          voiceId: 'Chloe',
          audio: {
            mimeType: 'audio/wav',
            format: 'wav',
          },
        },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          signal: expect.any(AbortSignal) as AbortSignal,
          headers: objectContaining({
            'api-key': 'unit-tts-runtime-secret',
            'Content-Type': 'application/json',
          }),
        }),
      );
      const requestBody = JSON.parse(
        fetchSpy.mock.calls[0][1]?.body as string,
      ) as {
        model: string;
        messages: Array<{ role: string; content: string }>;
        audio: { format: string; voice: string };
      };
      expect(requestBody.model).toBe('mimo-v2.5-tts');
      expect(requestBody.messages).toEqual(
        arrayContaining([
          objectContaining({
            role: 'assistant',
            content: ttsSpeechOutputDto.text,
          }),
        ]),
      );
      expect(requestBody.audio).toEqual({
        format: 'wav',
        voice: 'Chloe',
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.tts_speech_output.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'success',
          metadata: objectContaining({
            provider: 'xiaomi-mimo-tts',
            modelVersion: 'mimo-v2.5-tts',
            callId: 'mimo-tts-call-001',
            source: 'provider_text_to_speech',
            calledAt: expect.any(String) as string,
            voiceId: 'Chloe',
          }),
        }),
      });
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        ttsSpeechOutputDto.text,
      );
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        audioBase64,
      );
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        'unit-tts-runtime-secret',
      );
    });

    it('audits Xiaomi TTS provider failures without returning placeholder audio', async () => {
      configureTtsEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantTtsConsents(prisma);
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          providerJsonResponse({ error: { code: 'UPSTREAM_BUSY' } }, 503),
        );

      await expect(
        service.createTtsSpeechOutput(doctorUser, ttsSpeechOutputDto),
      ).rejects.toMatchObject({
        providerRequestError: { kind: 'upstream_http', upstreamStatus: 503 },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.tts_speech_output.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'failed',
          metadata: objectContaining({
            provider: 'xiaomi-mimo-tts',
            modelVersion: 'mimo-v2.5-tts',
            failureStage: 'provider_call',
          }),
        }),
      });
      expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
        ttsSpeechOutputDto.text,
      );
    });

    it('rejects malformed Xiaomi TTS output instead of returning placeholder audio', async () => {
      configureTtsEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantTtsConsents(prisma);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        providerJsonResponse({
          id: 'mimo-tts-call-002',
          choices: [{ message: { content: '无法生成音频。' } }],
        }),
      );

      await expect(
        service.createTtsSpeechOutput(doctorUser, ttsSpeechOutputDto),
      ).rejects.toBeInstanceOf(ProviderResponseRejectedException);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.tts_speech_output.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'failed',
          metadata: objectContaining({
            provider: 'xiaomi-mimo-tts',
            modelVersion: 'mimo-v2.5-tts',
            callId: 'mimo-tts-call-002',
            failureStage: 'provider_response_validation',
          }),
        }),
      });
    });

    it('rejects Xiaomi TTS output whose bytes do not match the declared wav format', async () => {
      configureTtsEnv();
      const { prisma, service } = createService();
      prisma.patientProfile.findUnique.mockResolvedValue({
        id: 'patient-profile-id',
        responsibleDoctorId: 'doctor-profile-id',
      });
      grantTtsConsents(prisma);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        providerJsonResponse({
          id: 'mimo-tts-call-003',
          choices: [
            {
              message: {
                audio: {
                  data: Buffer.from('formal-tts-audio-bytes').toString(
                    'base64',
                  ),
                },
              },
            },
          ],
        }),
      );

      await expect(
        service.createTtsSpeechOutput(doctorUser, ttsSpeechOutputDto),
      ).rejects.toBeInstanceOf(ProviderResponseRejectedException);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: 'doctor-user-id',
          actorRole: 'doctor',
          action: 'ai.tts_speech_output.generate',
          targetType: 'patient_profile',
          targetId: 'patient-profile-id',
          result: 'failed',
          metadata: objectContaining({
            provider: 'xiaomi-mimo-tts',
            modelVersion: 'mimo-v2.5-tts',
            callId: 'mimo-tts-call-003',
            failureStage: 'provider_response_validation',
          }),
        }),
      });
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
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
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
  const unityFormalPublishMetadata = {
    difficultyPolicy: {
      source: 'clinician_approved_plan',
      startingLevel: 'from_latest_approved_assessment_and_plan_item',
      runtimeType: 'unity_webgl',
      safetyLimits: { minLevel: 1, maxLevel: 3 },
    },
    dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
    requiredPermissions: ['camera_capture'],
    resultSchema: {
      schemaVersion: '1.0.0',
      runtimeType: 'unity_webgl',
      requiredMetrics: [
        'reaction_time_ms',
        'target_hit_rate',
        'arm_raise_accuracy',
        'duration_seconds',
        'difficulty_level',
      ],
      dynamicDifficultyEvidence: 'required',
    },
    publishedStatus: 'published',
  } as const;
  const unityRequiredMetrics = [
    { metricType: 'reaction_time_ms', unit: 'ms', min: 0, max: 60000 },
    { metricType: 'target_hit_rate', unit: 'ratio', min: 0, max: 1 },
    { metricType: 'arm_raise_accuracy', unit: 'ratio', min: 0, max: 1 },
    { metricType: 'duration_seconds', unit: 'seconds', min: 1, max: 3600 },
    { metricType: 'difficulty_level', unit: 'level', min: 1, max: 3 },
  ];

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
    const difficultyPolicy = {
      source: 'clinician_approved_plan',
      safetyLimits: { minLevel: 1, maxLevel: 3 },
    };
    const resultSchema = {
      schemaVersion: '1.0.0',
      requiredMetrics: [
        'reaction_time_ms',
        'target_hit_rate',
        'pose_visibility_avg',
        'arm_raise_accuracy',
      ],
      dynamicDifficultyEvidence: 'required',
    };
    prisma.gameContent.create.mockResolvedValue({
      ...gameContent,
      id: 'browser-game-id',
      code: 'garden_reach',
      name: '上肢反应触达',
      trainingTargets: ['反应速度', '上肢协调'],
      tags: ['中低强度', '动作准确率'],
      runtimeType: 'browser_pose_canvas',
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
      difficultyPolicy,
      dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
      requiredPermissions: ['camera_capture'],
      resultSchema,
      publishedStatus: 'published',
    });

    await expect(
      service.createGameContent(adminUser, {
        code: 'garden_reach',
        name: '上肢反应触达',
        runtimeType: 'browser_pose_canvas',
        gameVersion: '1.0.0',
        trainingTargets: ['反应速度', '上肢协调'],
        tags: ['中低强度', '动作准确率'],
        defaultDuration: 8,
        defaultDifficulty: '基础',
        supportsCamera: true,
        supportsMicrophone: false,
        supportedInputModes: ['camera_pose'],
        requiredMetrics: [
          { metricType: 'reaction_time_ms', unit: 'ms', min: 0, max: 60000 },
          { metricType: 'target_hit_rate', unit: 'ratio', min: 0, max: 1 },
          { metricType: 'pose_visibility_avg', unit: 'ratio', min: 0, max: 1 },
          { metricType: 'arm_raise_accuracy', unit: 'ratio', min: 0, max: 1 },
        ],
        difficultyPolicy,
        dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
        requiredPermissions: ['camera_capture'],
        resultSchema,
        publishedStatus: 'published',
      }),
    ).resolves.toMatchObject({
      id: 'browser-game-id',
      runtimeType: 'browser_pose_canvas',
      buildStatus: 'released',
      releaseChannel: 'production',
      gameVersion: '1.0.0',
    });

    expect(prisma.gameContent.create).toHaveBeenCalledWith({
      data: objectContaining({
        code: 'garden_reach',
        runtimeType: 'browser_pose_canvas',
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: '1.0.0',
        buildStatus: 'released',
        releaseChannel: 'production',
        supportsCamera: true,
        supportedInputModes: ['camera_pose'],
        difficultyPolicy,
        dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
        requiredPermissions: ['camera_capture'],
        resultSchema,
        publishedStatus: 'published',
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

  it('allows publisher admins to create released cognitive web game content with formal metadata', async () => {
    const { prisma, service } = createService();
    prisma.gameContent.findUnique.mockResolvedValue(null);
    const difficultyPolicy = {
      source: 'clinician_approved_plan',
      safetyLimits: { minLevel: 1, maxLevel: 3 },
    };
    const resultSchema = {
      schemaVersion: '1.0.0',
      requiredMetrics: ['sequence_recall_rate', 'path_completion_rate'],
      dynamicDifficultyEvidence: 'required',
    };
    prisma.gameContent.create.mockResolvedValue({
      ...gameContent,
      id: 'cognitive-game-id',
      code: 'memory_path',
      name: '记忆路径',
      trainingTargets: ['近记忆', '序列回忆'],
      tags: ['低强度', '认知'],
      runtimeType: 'cognitive_web',
      manifestUrl: null,
      buildBaseUrl: null,
      gameVersion: '1.0.0',
      buildStatus: 'released',
      releaseChannel: 'production',
      supportsCamera: false,
      supportedInputModes: ['touch', 'keyboard'],
      requiredMetrics: [
        { metricType: 'sequence_recall_rate', unit: 'ratio', min: 0, max: 1 },
        { metricType: 'path_completion_rate', unit: 'ratio', min: 0, max: 1 },
      ],
      difficultyPolicy,
      dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
      requiredPermissions: [],
      resultSchema,
      publishedStatus: 'published',
    });

    await expect(
      service.createGameContent(adminUser, {
        code: 'memory_path',
        name: '记忆路径',
        runtimeType: 'cognitive_web',
        gameVersion: '1.0.0',
        trainingTargets: ['近记忆', '序列回忆'],
        tags: ['低强度', '认知'],
        defaultDuration: 8,
        defaultDifficulty: '三步路径',
        supportsCamera: false,
        supportsMicrophone: false,
        supportedInputModes: ['touch', 'keyboard'],
        requiredMetrics: [
          { metricType: 'sequence_recall_rate', unit: 'ratio', min: 0, max: 1 },
          { metricType: 'path_completion_rate', unit: 'ratio', min: 0, max: 1 },
        ],
        difficultyPolicy,
        dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
        requiredPermissions: [],
        resultSchema,
        publishedStatus: 'published',
      }),
    ).resolves.toMatchObject({
      id: 'cognitive-game-id',
      runtimeType: 'cognitive_web',
      buildStatus: 'released',
      releaseChannel: 'production',
      gameVersion: '1.0.0',
      publishedStatus: 'published',
    });

    expect(prisma.gameContent.create).toHaveBeenCalledWith({
      data: objectContaining({
        code: 'memory_path',
        runtimeType: 'cognitive_web',
        manifestUrl: null,
        buildBaseUrl: null,
        gameVersion: '1.0.0',
        buildStatus: 'released',
        releaseChannel: 'production',
        supportsCamera: false,
        supportedInputModes: ['touch', 'keyboard'],
        requiredMetrics: [
          { metricType: 'sequence_recall_rate', unit: 'ratio', min: 0, max: 1 },
          { metricType: 'path_completion_rate', unit: 'ratio', min: 0, max: 1 },
        ],
        difficultyPolicy,
        dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
        requiredPermissions: [],
        resultSchema,
        publishedStatus: 'published',
        bridgeProtocolVersion: '1.0.0',
        status: 'active',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'admin-user-id',
        actorRole: 'admin',
        action: 'game_content.publish_cognitive_web',
        targetType: 'game_content',
        targetId: 'cognitive-game-id',
        result: 'success',
      }),
    });
  });

  it('rejects released cognitive web game content without explicit required permissions', async () => {
    const { prisma, service } = createService();
    prisma.gameContent.findUnique.mockResolvedValue(null);
    prisma.gameContent.create.mockResolvedValue({
      ...gameContent,
      id: 'cognitive-game-id',
      code: 'memory_path',
      name: '记忆路径',
      runtimeType: 'cognitive_web',
      gameVersion: '1.0.0',
      buildStatus: 'released',
      releaseChannel: 'production',
      supportsCamera: false,
      supportedInputModes: ['touch', 'keyboard'],
      requiredMetrics: [
        { metricType: 'sequence_recall_rate', unit: 'ratio', min: 0, max: 1 },
        { metricType: 'path_completion_rate', unit: 'ratio', min: 0, max: 1 },
      ],
      difficultyPolicy: {
        source: 'clinician_approved_plan',
        safetyLimits: { minLevel: 1, maxLevel: 3 },
      },
      dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
      requiredPermissions: [],
      resultSchema: {
        schemaVersion: '1.0.0',
        requiredMetrics: ['sequence_recall_rate', 'path_completion_rate'],
        dynamicDifficultyEvidence: 'required',
      },
      publishedStatus: 'published',
    });

    await expect(
      service.createGameContent(adminUser, {
        code: 'memory_path',
        name: '记忆路径',
        runtimeType: 'cognitive_web',
        gameVersion: '1.0.0',
        trainingTargets: ['近记忆', '序列回忆'],
        tags: ['低强度', '认知'],
        defaultDuration: 8,
        defaultDifficulty: '三步路径',
        supportsCamera: false,
        supportsMicrophone: false,
        supportedInputModes: ['touch', 'keyboard'],
        requiredMetrics: [
          { metricType: 'sequence_recall_rate', unit: 'ratio', min: 0, max: 1 },
          { metricType: 'path_completion_rate', unit: 'ratio', min: 0, max: 1 },
        ],
        difficultyPolicy: {
          source: 'clinician_approved_plan',
          safetyLimits: { minLevel: 1, maxLevel: 3 },
        },
        dynamicDifficultyTriggers: ['prior_assessment', 'clinician_limit'],
        resultSchema: {
          schemaVersion: '1.0.0',
          requiredMetrics: ['sequence_recall_rate', 'path_completion_rate'],
          dynamicDifficultyEvidence: 'required',
        },
        publishedStatus: 'published',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.gameContent.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects operator admins from publishing browser pose game content', async () => {
    const { prisma, service } = createService();

    await expect(
      service.createGameContent(operatorAdminUser, {
        code: 'garden_reach',
        name: '上肢反应触达',
        runtimeType: 'browser_pose_canvas',
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
        code: 'garden_reach',
        name: '上肢反应触达',
        runtimeType: 'browser_pose_canvas',
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
      requiredMetrics: unityRequiredMetrics,
      ...unityFormalPublishMetadata,
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
        requiredMetrics: unityRequiredMetrics,
        ...unityFormalPublishMetadata,
      }),
    ).resolves.toMatchObject({
      buildStatus: 'released',
    });

    expect(prisma.gameContent.update).toHaveBeenCalledWith({
      where: { id: 'game-id' },
      data: objectContaining({
        buildStatus: 'released',
        releaseChannel: 'production',
        requiredMetrics: unityRequiredMetrics,
        difficultyPolicy: unityFormalPublishMetadata.difficultyPolicy,
        dynamicDifficultyTriggers:
          unityFormalPublishMetadata.dynamicDifficultyTriggers,
        requiredPermissions: unityFormalPublishMetadata.requiredPermissions,
        resultSchema: unityFormalPublishMetadata.resultSchema,
        publishedStatus: 'published',
      }),
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

  it('rejects publishing Unity build without formal publish metadata', async () => {
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
        requiredMetrics: unityRequiredMetrics,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.gameContent.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
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
          tx: Pick<ConsentRevocationPrismaMock, 'consentRecord' | 'auditLog'>,
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
    const auditLog = {
      create: jest.fn<Promise<unknown>, []>(() => Promise.resolve({})),
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
      auditLog,
      $transaction: jest.fn(
        async (
          callback: (
            tx: Pick<ConsentRevocationPrismaMock, 'consentRecord' | 'auditLog'>,
          ) => Promise<unknown>,
        ) => callback({ consentRecord, auditLog }),
      ),
    };

    return {
      prisma,
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
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
        id: 'consent-id',
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
    prisma.patientProfile.findUnique.mockResolvedValue({
      id: 'patient-profile-id',
      userId: 'patient-user-id',
    });

    await expect(
      service.revokeConsent(patientUser, 'consent-id'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.patientProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'patient-profile-id' },
      select: { id: true, userId: true },
    });
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
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
    };
  }

  it('allows admin to query audit logs with service-side filters', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T09:00:00.000Z');
    const actorUserId = 'cbe1eacb-91e3-4df6-872c-2639ec930f62';
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
          id: actorUserId,
          account: 'caregiver001',
          identityEnvelope: encryptedUserIdentity(actorUserId, {
            displayName: '李明',
            mobilePhone: null,
          }),
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
      include: {
        actor: {
          select: { id: true, account: true, identityEnvelope: true },
        },
      },
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
      service: new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      ),
    };
  }

  it('exports patient rows with masked identity fields and writes audit log', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T09:00:00.000Z');
    const exportPatientId = '58a5cd9c-6cd8-4429-896a-af9c26c024c7';
    const exportDoctorUserId = 'ba4c6f01-b1bd-4db7-ae95-73dd31573354';
    prisma.patientProfile.findMany.mockResolvedValue([
      {
        id: exportPatientId,
        identityEnvelope: encryptedPatientField(
          exportPatientId,
          'identityEnvelope',
          { name: '李秀兰', gender: 'female', age: 72 },
        ),
        contactEnvelope: encryptedPatientField(
          exportPatientId,
          'contactEnvelope',
          {
            mobilePhone: '13800006721',
            caregiverName: '李明',
            caregiverPhone: '13900008206',
          },
        ),
        careDetailsEnvelope: encryptedPatientField(
          exportPatientId,
          'careDetailsEnvelope',
          { healthMetrics: { bloodPressure: '132/82' } },
        ),
        status: 'active',
        createdAt,
        updatedAt: createdAt,
        responsibleDoctor: {
          user: {
            id: exportDoctorUserId,
            identityEnvelope: encryptedUserIdentity(exportDoctorUserId, {
              displayName: '王医生',
              mobilePhone: null,
            }),
          },
        },
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
    expect(JSON.stringify(exported.payload)).not.toContain('moderate');
    expect(prisma.patientProfile.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        identityEnvelope: true,
        contactEnvelope: true,
        careDetailsEnvelope: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        responsibleDoctor: {
          select: {
            user: { select: { id: true, identityEnvelope: true } },
          },
        },
      },
    });
  });

  it('exports null optional patient contact fields when the contact envelope is absent', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T09:00:00.000Z');
    const exportPatientId = 'b713b809-1cf6-4e2e-bc24-a36a8aa0352d';
    prisma.patientProfile.findMany.mockResolvedValue([
      {
        ...encryptedPatientProfileFixture(exportPatientId, {
          name: '李秀兰',
          gender: 'female',
          age: 72,
        }),
        contactEnvelope: null,
        createdAt,
        responsibleDoctor: null,
      },
    ]);

    const exported = await service.exportDataset(adminUser, 'patients', {
      format: 'json',
      reason: '可选联系方式导出测试',
    });

    expect(exported.payload.rows).toEqual([
      expect.objectContaining({
        maskedMobilePhone: null,
        maskedCaregiverName: null,
        maskedCaregiverPhone: null,
      }),
    ]);
  });

  it.each([
    ['admin', adminUser],
    ['super admin', superAdminUser],
  ])('denies %s patient-level assessment exports', async (_label, actor) => {
    const { prisma, service } = createService();
    prisma.assessmentRecord.findMany.mockResolvedValue([]);

    await expect(
      service.exportDataset(actor, 'assessments', {
        format: 'json',
        reason: '科研统计',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.assessmentRecord.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: actor.id,
        action: 'data.export',
        targetId: 'assessments',
        result: 'denied',
        metadata: objectContaining({ stage: 'authorization' }),
      }),
    });
  });

  it('denies risk-level filtering that could reveal patient clinical state', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findMany.mockResolvedValue([]);

    await expect(
      service.exportDataset(adminUser, 'patients', {
        format: 'json',
        reason: '按风险统计',
        riskLevel: 'moderate',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.patientProfile.findMany).not.toHaveBeenCalled();
  });

  it('escapes CSV formula-like cells before download', async () => {
    const { prisma, service } = createService();
    const createdAt = new Date('2026-05-14T09:00:00.000Z');
    const exportPatientId = '356aaf9a-5dfe-4117-aa82-e2637ea10b4f';
    prisma.patientProfile.findMany.mockResolvedValue([
      {
        ...encryptedPatientProfileFixture(exportPatientId, {
          name: '=HYPERLINK("http://bad.example")',
          gender: '+female',
          age: 72,
          mobilePhone: '13800006721',
          caregiverName: '-caregiver',
          caregiverPhone: '13900008206',
          healthMetrics: {},
          status: '@active',
        }),
        status: '@active',
        createdAt,
        responsibleDoctor: null,
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

  it.each([
    ['admin', adminUser],
    ['super admin', superAdminUser],
  ])(
    'denies %s clinical training-record exports without relying on precise filters',
    async (_label, actor) => {
      const { prisma, service } = createService();
      prisma.trainingSession.findMany.mockResolvedValue([]);

      await expect(
        service.exportDataset(actor, 'training-records', {
          format: 'csv',
          reason: '训练质量复盘',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.trainingSession.findMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: actor.id,
          action: 'data.export',
          targetId: 'training-records',
          result: 'denied',
          metadata: objectContaining({ stage: 'authorization' }),
        }),
      });
    },
  );

  it.each([
    ['risk level', { riskLevel: 'high' }],
    ['training quality', { qualityFlag: 'valid' }],
  ])(
    'denies precise %s filters on an allowed patient dataset',
    async (_label, filter) => {
      const { prisma, service } = createService();

      await expect(
        service.exportDataset(adminUser, 'patients', {
          format: 'csv',
          reason: '患者数据复盘',
          ...filter,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.patientProfile.findMany).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          actorUserId: adminUser.id,
          action: 'data.export',
          targetId: 'patients',
          result: 'denied',
          metadata: objectContaining({ stage: 'authorization' }),
        }),
      });
    },
  );

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
    const consentPatientId = '0f7db92c-6ef4-4d70-8379-b826274401dc';
    prisma.consentRecord.findMany.mockResolvedValue([
      {
        id: 'consent-id',
        patientId: consentPatientId,
        consentType: 'camera_capture',
        consentVersion: 'v1.2',
        status: 'granted',
        grantedAt,
        revokedAt: null,
        evidenceSnapshot: { ipAddress: '127.0.0.1' },
        patient: {
          id: consentPatientId,
          identityEnvelope: encryptedPatientField(
            consentPatientId,
            'identityEnvelope',
            { name: '李秀兰', gender: 'female', age: 72 },
          ),
        },
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

  it('denies operator-only and auditor data exports with audit evidence', async () => {
    const { prisma, service } = createService();
    prisma.patientProfile.findMany.mockResolvedValue([]);

    await expect(
      service.exportDataset(operatorAdminUser, 'patients', {
        format: 'json',
        reason: '运营统计',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.exportDataset(operatorAdminUser, 'audit-logs', {
        format: 'json',
        reason: '审计日志导出',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

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
        result: 'denied',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: objectContaining({
        actorUserId: 'operator-user-id',
        actorRole: 'admin_operator',
        action: 'data.export',
        targetType: 'data_export',
        targetId: 'audit-logs',
        result: 'denied',
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
    expect(prisma.patientProfile.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    const auditCalls = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(auditCalls).not.toContain('运营统计');
    expect(auditCalls).not.toContain('审计日志导出');
    expect(auditCalls).not.toContain('审计尝试导出');
  });
});
