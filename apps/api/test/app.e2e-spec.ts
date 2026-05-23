import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma.service';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    account: string;
    displayName: string;
  };
  context: {
    primaryRole?: string;
    patientIds: string[];
    caregiverPatientIds: string[];
    doctorIds: string[];
    adminPermissions: string[];
  };
};

type PatientResponse = {
  id: string;
  userId: string;
};

type ConsentResponse = {
  id: string;
  status: 'granted' | 'revoked';
};

type CaregiverRelationResponse = {
  id: string;
};

type AuditLogResponse = {
  id: string;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  result: 'success' | 'failed' | 'denied';
  metadata?: unknown;
  actor?: {
    displayName: string;
    account: string;
  } | null;
};

describe('Rehab platform data authorization flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const password = '253913';
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const accountPrefix = `e2e_${runId}`;
  const createdUserIds = new Set<string>();
  const createdPatientIds = new Set<string>();
  const createdConsentIds = new Set<string>();
  const exportReasonHashes = new Set<string>();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      await cleanupTestData();
    }
    if (app) {
      await app.close();
    }
  });

  async function cleanupTestData() {
    const patientIds = Array.from(createdPatientIds);
    const userIds = Array.from(createdUserIds);
    const consentIds = Array.from(createdConsentIds);

    if (patientIds.length || userIds.length || consentIds.length) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorUserId: { in: userIds } },
            { targetId: { in: [...patientIds, ...userIds, ...consentIds] } },
          ],
        },
      });
    }

    if (patientIds.length) {
      await prisma.caregiverRelation.deleteMany({
        where: { patientId: { in: patientIds } },
      });
      await prisma.userRoleBinding.deleteMany({
        where: { relatedObjectId: { in: patientIds } },
      });
      await prisma.consentRecord.deleteMany({
        where: { patientId: { in: patientIds } },
      });
      await prisma.patientProfile.deleteMany({
        where: { id: { in: patientIds } },
      });
    }

    if (userIds.length) {
      await prisma.userRoleBinding.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { targetId: { startsWith: accountPrefix } },
          { actor: { account: { startsWith: accountPrefix } } },
          ...Array.from(exportReasonHashes).map((reasonHash) => ({
            metadata: {
              path: ['reasonHash'],
              equals: reasonHash,
            },
          })),
        ],
      },
    });
  }

  function reasonHash(reason: string) {
    return createHash('sha256')
      .update(reason.trim())
      .digest('hex')
      .slice(0, 16);
  }

  async function login(account: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ account, password })
      .expect(201);
    return response.body as LoginResponse;
  }

  function bearer(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('runs caregiver account, patient consent, binding, summary, and revoke flow', async () => {
    const admin = await login('admin');
    const doctor = await login('doctor001');
    const doctorId = doctor.context.doctorIds[0];
    expect(doctorId).toBeTruthy();

    const caregiverAccount = `${accountPrefix}_cg`;
    const caregiver = await request(app.getHttpServer())
      .post('/caregivers')
      .set(bearer(admin.accessToken))
      .send({
        account: caregiverAccount,
        initialPassword: password,
        displayName: 'E2E 家属',
        mobilePhone: `139${String(Date.now()).slice(-8)}`,
      })
      .expect(201);
    createdUserIds.add((caregiver.body as { id: string }).id);

    const patientAccount = `${accountPrefix}_pt`;
    const patientCreate = await request(app.getHttpServer())
      .post('/patients')
      .set(bearer(doctor.accessToken))
      .send({
        account: patientAccount,
        initialPassword: password,
        name: 'E2E 患者',
        gender: 'female',
        age: 70,
        mobilePhone: `138${String(Date.now()).slice(-8)}`,
        healthMetrics: {
          bloodPressure: '128/80',
          heartRate: 72,
        },
      })
      .expect(201);
    const patient = patientCreate.body as PatientResponse;
    createdPatientIds.add(patient.id);
    createdUserIds.add(patient.userId);

    const patientLogin = await login(patientAccount);
    expect(patientLogin.context.patientIds).toContain(patient.id);

    const consentTypes = [
      'privacy_policy',
      'caregiver_sharing',
      'camera_capture',
      'ai_processing',
    ] as const;
    for (const consentType of consentTypes) {
      const consent = await request(app.getHttpServer())
        .post('/consents')
        .set(bearer(patientLogin.accessToken))
        .send({
          patientId: patient.id,
          subjectUserId: patientLogin.user.id,
          consentType,
          consentVersion: 'v1.2',
          evidenceSnapshot: {
            source: 'api_e2e',
            consentType,
          },
        })
        .expect(201);
      createdConsentIds.add((consent.body as ConsentResponse).id);
    }

    const relationResponse = await request(app.getHttpServer())
      .post(`/patients/${patient.id}/caregivers`)
      .set(bearer(patientLogin.accessToken))
      .send({
        caregiverAccount,
        relation: '女儿',
        scope: {
          summary: true,
          reminders: true,
          progress: true,
          rawAssessment: false,
          planEdit: false,
        },
      })
      .expect(201);
    const relation = relationResponse.body as CaregiverRelationResponse;

    const caregiverLogin = await login(caregiverAccount);
    expect(caregiverLogin.context.caregiverPatientIds).toContain(patient.id);

    await request(app.getHttpServer())
      .get(`/patients/${patient.id}/training-records`)
      .set(bearer(caregiverLogin.accessToken))
      .expect(403);

    const summaryResponse = await request(app.getHttpServer())
      .get(`/caregiver/patients/${patient.id}/summary`)
      .set(bearer(caregiverLogin.accessToken))
      .expect(200);
    expect(JSON.stringify(summaryResponse.body)).not.toContain('motionMetrics');
    expect(JSON.stringify(summaryResponse.body)).not.toContain(
      'metricsSummary',
    );

    await request(app.getHttpServer())
      .patch(`/patients/${patient.id}/caregivers/${relation.id}/revoke`)
      .set(bearer(patientLogin.accessToken))
      .expect(200);

    await request(app.getHttpServer())
      .get(`/caregiver/patients/${patient.id}/summary`)
      .set(bearer(caregiverLogin.accessToken))
      .expect(403);

    const deniedAuditResponse = await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .query({
        result: 'denied',
        actorRole: 'caregiver',
        action: 'access.denied',
        targetType: 'patient_profile',
        targetId: patient.id,
        actorAccount: caregiverAccount,
        limit: 10,
      })
      .set(bearer(admin.accessToken))
      .expect(200);
    const deniedAudits = deniedAuditResponse.body as AuditLogResponse[];
    expect(deniedAudits.length).toBeGreaterThanOrEqual(1);
    expect(
      deniedAudits.every(
        (log) =>
          log.result === 'denied' &&
          log.actorRole === 'caregiver' &&
          log.action === 'access.denied' &&
          log.targetType === 'patient_profile' &&
          log.targetId === patient.id &&
          log.actor?.account === caregiverAccount,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .query({ result: 'blocked' })
      .set(bearer(admin.accessToken))
      .expect(400);

    await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set(bearer(doctor.accessToken))
      .expect(403);
  });

  it('exports desensitized patient data and records export audit', async () => {
    const admin = await login('admin');
    const doctor = await login('doctor001');
    const reason = `${accountPrefix}_export_reason`;
    exportReasonHashes.add(reasonHash(reason));

    const exportResponse = await request(app.getHttpServer())
      .post('/admin/exports/patients')
      .send({
        format: 'json',
        reason,
        limit: 10,
      })
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(exportResponse.headers['cache-control']).toBe('no-store');
    expect(exportResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(exportResponse.headers['content-disposition']).toContain(
      'rehab-patients',
    );
    expect(exportResponse.body).toMatchObject({
      dataset: 'patients',
      format: 'json',
      rowCount: expect.any(Number) as number,
      columns: expect.arrayContaining([
        'patientExportId',
        'maskedName',
        'maskedMobilePhone',
        'maskedCaregiverPhone',
      ]) as string[],
    });
    const exportText = JSON.stringify(exportResponse.body);
    expect(exportText).toContain('138****6721');
    expect(exportText).not.toContain('13800006721');
    expect(exportText).not.toContain('13900008206');
    expect(exportText).not.toContain('bloodPressure');

    await request(app.getHttpServer())
      .post('/admin/exports/patients')
      .send({ format: 'json', reason })
      .set(bearer(doctor.accessToken))
      .expect(403);

    await request(app.getHttpServer())
      .post('/admin/exports/not-real')
      .send({ format: 'json', reason })
      .set(bearer(admin.accessToken))
      .expect(400);

    const auditResponse = await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .query({
        action: 'data.export',
        targetType: 'data_export',
        targetId: 'patients',
        actorRole: 'admin_super',
        limit: 5,
      })
      .set(bearer(admin.accessToken))
      .expect(200);
    const audits = auditResponse.body as AuditLogResponse[];
    expect(
      audits.some(
        (log) =>
          log.action === 'data.export' &&
          log.targetType === 'data_export' &&
          log.targetId === 'patients' &&
          log.result === 'success',
      ),
    ).toBe(true);

    const exportAuditResponse = await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .query({
        action: 'data.export',
        targetType: 'data_export',
        limit: 20,
      })
      .set(bearer(admin.accessToken))
      .expect(200);
    const exportAudits = exportAuditResponse.body as AuditLogResponse[];
    const auditText = JSON.stringify(exportAudits);
    expect(auditText).not.toContain(reason);
    expect(auditText).not.toContain('13800006721');
    expect(
      exportAudits.some(
        (log) =>
          log.targetId === 'patients' &&
          log.result === 'denied' &&
          log.metadata &&
          JSON.stringify(log.metadata).includes('"stage":"authorization"'),
      ),
    ).toBe(true);
    expect(
      exportAudits.some(
        (log) =>
          log.targetId === 'invalid_dataset' &&
          log.result === 'failed' &&
          log.metadata &&
          JSON.stringify(log.metadata).includes(
            '"requestedDatasetKnown":false',
          ),
      ),
    ).toBe(true);
  });

  it('enforces split admin role permissions through real tokens', async () => {
    const superAdmin = await login('admin');
    const operator = await login('operator001');
    const auditor = await login('auditor001');
    const reason = `${accountPrefix}_operator_export_reason`;
    exportReasonHashes.add(reasonHash(reason));

    expect(superAdmin.context.primaryRole).toBe('admin_super');
    expect(superAdmin.context.adminPermissions).toEqual(
      expect.arrayContaining([
        'dashboard.view',
        'audit.read',
        'data.export',
        'user.manage',
      ]),
    );
    expect(operator.context.primaryRole).toBe('admin_operator');
    expect(operator.context.adminPermissions).toEqual(
      expect.arrayContaining(['dashboard.view', 'data.export', 'user.manage']),
    );
    expect(auditor.context.primaryRole).toBe('admin_auditor');
    expect(auditor.context.adminPermissions).toEqual(
      expect.arrayContaining(['dashboard.view', 'audit.read']),
    );

    await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set(bearer(superAdmin.accessToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set(bearer(operator.accessToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set(bearer(auditor.accessToken))
      .expect(200);

    await request(app.getHttpServer())
      .post('/admin/exports/patients')
      .send({ format: 'json', reason, limit: 1 })
      .set(bearer(operator.accessToken))
      .expect(200);
    await request(app.getHttpServer())
      .post('/admin/exports/patients')
      .send({ format: 'json', reason })
      .set(bearer(auditor.accessToken))
      .expect(403);

    const auditResponse = await request(app.getHttpServer())
      .get('/admin/audit-logs')
      .query({
        action: 'data.export',
        targetType: 'data_export',
        targetId: 'patients',
        limit: 20,
      })
      .set(bearer(superAdmin.accessToken))
      .expect(200);
    const audits = auditResponse.body as AuditLogResponse[];
    expect(
      audits.some(
        (log) => log.actorRole === 'admin_operator' && log.result === 'success',
      ),
    ).toBe(true);
    expect(
      audits.some(
        (log) => log.actorRole === 'admin_auditor' && log.result === 'denied',
      ),
    ).toBe(true);

    const shortRunId = runId.replace(/_/g, '').slice(-12);
    const caregiverAccount = `op_${shortRunId}_cg`;
    const caregiver = await request(app.getHttpServer())
      .post('/caregivers')
      .set(bearer(operator.accessToken))
      .send({
        account: caregiverAccount,
        initialPassword: password,
        displayName: 'E2E 运营创建家属',
      })
      .expect(201);
    createdUserIds.add((caregiver.body as { id: string }).id);

    await request(app.getHttpServer())
      .post('/caregivers')
      .set(bearer(auditor.accessToken))
      .send({
        account: `au_${shortRunId}_cg`,
        initialPassword: password,
        displayName: 'E2E 审计创建家属',
      })
      .expect(403);
  });

  it('health endpoint returns service status', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', service: 'rehab-platform-api' });
  });
});
