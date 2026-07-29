import { randomUUID } from 'node:crypto';

import { AppService } from '../src/app.service';
import { hashCredential } from '../src/credential-security';
import type { RequestUser } from '../src/current-user';
import { PrismaService } from '../src/prisma.service';
import { encryptSensitiveJson } from '../src/sensitive-encryption';

const testSensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-sensitive-key',
  key: Buffer.alloc(32, 11),
};

describe('credential security on disposable PostgreSQL', () => {
  const runPrefix = `task2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const prisma = new PrismaService();
  const service = new AppService(prisma, testSensitiveEncryptionKey);
  const actor: RequestUser = {
    id: '',
    account: `${runPrefix}_admin`,
    displayName: 'Task 2 Admin',
    roles: [
      {
        roleCode: 'admin_super',
        relatedObjectType: 'admin',
        relatedObjectId: 'task2-admin',
      },
    ],
  };

  beforeAll(async () => {
    if (
      process.env.TASK2_E2E_CONFIRM_DISPOSABLE !== 'YES' ||
      process.env.DATABASE_URL !== process.env.TASK2_E2E_DATABASE_URL
    ) {
      throw new Error(
        'Credential security PostgreSQL e2e requires the confirmed disposable runner.',
      );
    }
    await prisma.$connect();
    await prisma.roleDefinition.upsert({
      where: { code: 'caregiver' },
      update: {},
      create: { code: 'caregiver', name: '家属', level: 20 },
    });
    const adminId = randomUUID();
    const admin = await prisma.user.create({
      data: {
        id: adminId,
        account: actor.account,
        identityEnvelope: encryptSensitiveJson(
          { displayName: actor.displayName, mobilePhone: null },
          {
            tableName: 'user',
            recordId: adminId,
            fieldName: 'identityEnvelope',
          },
          testSensitiveEncryptionKey,
        ),
        passwordHash: await hashCredential('Admin-Final-253913!'),
        passwordResetRequired: false,
        passwordUpdatedAt: new Date(),
      },
    });
    actor.id = admin.id;
  });

  afterEach(async () => {
    await dropAuditFailureTrigger();
    const requests = await prisma.registrationRequest.findMany({
      where: { account: { startsWith: runPrefix } },
      select: { id: true, createdUserId: true },
    });
    const users = await prisma.user.findMany({
      where: { account: { startsWith: runPrefix } },
      select: { id: true },
    });
    const userIds = users.map(({ id }) => id);
    const targetIds = requests.map(({ id }) => id).concat(userIds);
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ actorUserId: { in: userIds } }, { targetId: { in: targetIds } }],
      },
    });
    await prisma.registrationRequest.deleteMany({
      where: { account: { startsWith: runPrefix } },
    });
    await prisma.userRoleBinding.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({
      where: { account: { startsWith: runPrefix }, NOT: { id: actor.id } },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: actor.id } });
    await prisma.user.delete({ where: { id: actor.id } });
    await prisma.$disconnect();
  });

  it('allows exactly one concurrent consumer of a reset session version', async () => {
    const targetId = randomUUID();
    const target = await prisma.user.create({
      data: {
        id: targetId,
        account: `${runPrefix}_reset`,
        identityEnvelope: encryptSensitiveJson(
          { displayName: 'Reset Target', mobilePhone: null },
          {
            tableName: 'user',
            recordId: targetId,
            fieldName: 'identityEnvelope',
          },
          testSensitiveEncryptionKey,
        ),
        passwordHash: await hashCredential('Temporary-253913!'),
        passwordResetRequired: true,
        passwordUpdatedAt: new Date(),
        authSessionVersion: 7,
      },
    });

    const attempts = await Promise.allSettled([
      service.completePasswordReset(target.id, 7, {
        newPassword: 'Final-Password-A-253913!',
      }),
      service.completePasswordReset(target.id, 7, {
        newPassword: 'Final-Password-B-253913!',
      }),
    ]);

    expect(
      attempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({
      passwordResetRequired: false,
      authSessionVersion: 8,
    });
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'auth.password.required_reset_complete',
          targetId: target.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('allows exactly one concurrent approval to create an identity', async () => {
    const account = `${runPrefix}_concurrent_review`;
    const registration = await createCaregiverRegistration(account);

    const attempts = await Promise.allSettled([
      service.reviewRegistrationRequest(actor, registration.id, {
        decision: 'approved',
        decisionReason: '并发审核一',
      }),
      service.reviewRegistrationRequest(actor, registration.id, {
        decision: 'approved',
        decisionReason: '并发审核二',
      }),
    ]);

    expect(
      attempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    await expect(prisma.user.count({ where: { account } })).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'registration_request.review',
          targetId: registration.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('rolls back approval, identity creation, and digest clearing when audit fails', async () => {
    const account = `${runPrefix}_rollback`;
    const registration = await createCaregiverRegistration(account);
    await installAuditFailureTrigger(registration.id);

    await expect(
      service.reviewRegistrationRequest(actor, registration.id, {
        decision: 'approved',
        decisionReason: '审核审计回滚',
      }),
    ).rejects.toThrow('task2 forced audit failure');

    await expect(
      prisma.registrationRequest.findUniqueOrThrow({
        where: { id: registration.id },
      }),
    ).resolves.toMatchObject({
      reviewStatus: 'pending',
      initialPasswordHash: registration.initialPasswordHash,
      createdUserId: null,
    });
    await expect(prisma.user.count({ where: { account } })).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'registration_request.review',
          targetId: registration.id,
        },
      }),
    ).resolves.toBe(0);
  });

  async function createCaregiverRegistration(account: string) {
    const registrationId = randomUUID();
    return prisma.registrationRequest.create({
      data: {
        id: registrationId,
        requestedRole: 'caregiver',
        account,
        initialPasswordHash: await hashCredential('Temporary-253913!'),
        credentialExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        identityEnvelope: encryptSensitiveJson(
          {
            displayName: 'Task 2 Caregiver',
            mobilePhone: null,
            profileSnapshot: {},
          },
          {
            tableName: 'registration_request',
            recordId: registrationId,
            fieldName: 'identityEnvelope',
          },
          testSensitiveEncryptionKey,
        ),
      },
    });
  }

  async function installAuditFailureTrigger(targetId: string) {
    await dropAuditFailureTrigger();
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION task2_fail_registration_review_audit()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."action" = 'registration_request.review'
          AND NEW."targetId" = '${targetId}' THEN
          RAISE EXCEPTION 'task2 forced audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER task2_fail_registration_review_audit_trigger
      BEFORE INSERT ON "audit_log"
      FOR EACH ROW EXECUTE FUNCTION task2_fail_registration_review_audit()
    `);
  }

  async function dropAuditFailureTrigger() {
    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS task2_fail_registration_review_audit_trigger ON "audit_log"
    `);
    await prisma.$executeRawUnsafe(`
      DROP FUNCTION IF EXISTS task2_fail_registration_review_audit()
    `);
  }
});
