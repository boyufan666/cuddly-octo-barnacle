import type { RequestUser } from '../src/current-user';
import { AppService } from '../src/app.service';
import { PrismaService } from '../src/prisma.service';
import type { SensitiveEncryptionKey } from '../src/sensitive-encryption';

const seedPassword = process.env.TASK6_SEED_API_E2E_SEED_PASSWORD;
const keyReference = process.env.SENSITIVE_DATA_KEY_REF;
const encodedKey = process.env.SENSITIVE_DATA_KEY;
const scopedDatabaseUrl = process.env.TASK6_SEED_API_E2E_SCOPED_DATABASE_URL;

function requireRunnerEnvironment() {
  if (
    process.env.TASK6_SEED_API_E2E_CONFIRM_ISOLATED_SCHEMA !== 'YES' ||
    !scopedDatabaseUrl ||
    process.env.DATABASE_URL !== scopedDatabaseUrl
  ) {
    throw new Error(
      'Encrypted-seed API PostgreSQL smoke requires the confirmed isolated-schema runner.',
    );
  }
  if (!seedPassword || !keyReference || !encodedKey) {
    throw new Error(
      'Encrypted-seed API PostgreSQL smoke requires explicit seed password and encryption key inputs.',
    );
  }
  const key = Buffer.from(encodedKey, 'base64');
  if (key.byteLength !== 32 || key.toString('base64') !== encodedKey) {
    throw new Error(
      'Encrypted-seed API PostgreSQL smoke requires a canonical base64 32-byte encryption key.',
    );
  }
  return { kid: keyReference, key } satisfies SensitiveEncryptionKey;
}

function expectNoEncryptionStorageFields(value: unknown) {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') {
    throw new Error('Expected the API result to be JSON-serializable.');
  }
  for (const marker of [
    'Envelope',
    'ciphertext',
    '"aad"',
    '"iv"',
    '"kid"',
    '"tag"',
  ]) {
    expect(serialized).not.toContain(marker);
  }
}

function objectContaining<T extends object>(value: T): unknown {
  return expect.objectContaining(value) as unknown;
}

function arrayContaining<T>(value: T[]): unknown {
  return expect.arrayContaining(value) as unknown;
}

describe('encrypted seed through real API reads on isolated PostgreSQL', () => {
  const encryptionKey = requireRunnerEnvironment();
  const wrongKeyBytes = Buffer.from(encryptionKey.key);
  wrongKeyBytes[0] ^= 0xff;
  const wrongEncryptionKey: SensitiveEncryptionKey = {
    kid: encryptionKey.kid,
    key: wrongKeyBytes,
  };
  const prisma = new PrismaService();
  const service = new AppService(prisma, encryptionKey);
  const wrongKeyService = new AppService(prisma, wrongEncryptionKey);
  const patientId = '6d8dfde7-6b95-4ca2-8d1a-2af98927b205';
  const patientUserId = '6d8dfde7-6b95-4ca2-8d1a-2af98927b105';
  const patientActor: RequestUser = {
    id: patientUserId,
    account: 'patient001',
    displayName: '李秀兰',
    roles: [
      {
        roleCode: 'patient',
        relatedObjectType: 'patient',
        relatedObjectId: patientId,
      },
    ],
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('decrypts seeded user identity through login without exposing storage fields', async () => {
    const result = await service.login({
      account: 'patient001',
      password: seedPassword!,
    });

    expect(result).toMatchObject({
      status: 'password_reset_required',
      user: { account: 'patient001', displayName: '李秀兰' },
    });
    expectNoEncryptionStorageFields(result);
  });

  it('decrypts seeded patient detail through its production serializer', async () => {
    const result = await service.getPatient(patientActor, patientId);

    expect(result).toMatchObject({
      id: patientId,
      name: '李秀兰',
      gender: 'female',
      age: 72,
      mobilePhone: '13800006721',
      caregiverName: '李明',
      caregiverPhone: '13900008206',
      healthMetrics: {
        medicalRecordNo: 'SEED-ALZ-0001',
        bloodPressure: '132/82',
        heartRate: 76,
        gaitRisk: 'low',
      },
      responsibleDoctor: {
        title: '主任康复治疗师',
        department: '认知康复科',
        user: { displayName: '王医生' },
      },
      caregiverRelations: [
        { caregiver: { account: 'caregiver001', displayName: '李明' } },
      ],
    });
    expectNoEncryptionStorageFields(result);
  });

  it('decrypts seeded assessment, risk, and AI DTOs without exposing storage fields', async () => {
    const result = await service.listAssessments(patientActor, patientId);

    expect(result).toEqual(
      arrayContaining([
        objectContaining({
          id: '6d8dfde7-6b95-4ca2-8d1a-2af98927b201',
          scoreSummary: objectContaining({ mmse: 20, cdr: 1 }),
          rawInputSummary: objectContaining({
            medicalRecordNo: 'SEED-ALZ-0001',
          }),
          riskGrades: arrayContaining([
            objectContaining({
              id: '6d8dfde7-6b95-4ca2-8d1a-2af98927b202',
              reasonSummary:
                'MMSE 20/30，CDR 1.0，近记忆和执行力分项存在波动。',
            }),
          ]),
          aiAnalyses: arrayContaining([
            objectContaining({
              id: '6d8dfde7-6b95-4ca2-8d1a-2af98927b203',
              inputSummary: objectContaining({
                medicalRecordNo: 'SEED-ALZ-0001',
              }),
              outputSummary: objectContaining({
                riskLevel: 'moderate',
              }),
            }),
          ]),
        }),
      ]),
    );
    expectNoEncryptionStorageFields(result);
  });

  it('hard-fails seeded API reads under the wrong encryption key', async () => {
    await expect(
      wrongKeyService.login({
        account: 'patient001',
        password: seedPassword!,
      }),
    ).rejects.toThrow();
    await expect(
      wrongKeyService.getPatient(patientActor, patientId),
    ).rejects.toThrow();
    await expect(
      wrongKeyService.listAssessments(patientActor, patientId),
    ).rejects.toThrow();
  });

  it('hard-fails login when a required envelope is missing', async () => {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "user" ALTER COLUMN "identityEnvelope" DROP NOT NULL',
    );
    await prisma.$executeRawUnsafe(
      'UPDATE "user" SET "identityEnvelope" = NULL WHERE "account" = $1',
      'operator001',
    );

    await expect(
      service.login({ account: 'operator001', password: seedPassword! }),
    ).rejects.toThrow();
  });
});
