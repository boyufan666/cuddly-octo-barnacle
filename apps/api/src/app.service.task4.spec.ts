import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { hkdfSync } from 'node:crypto';
import { AppService } from './app.service';
import type { RequestUser } from './current-user';
import { PrismaService } from './prisma.service';
import {
  decryptSensitiveJson,
  encryptSensitiveJson,
} from './sensitive-encryption';
import { createProviderOperationResponseHmac } from './provider-operation';

const testSensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-sensitive-key',
  key: Buffer.alloc(32, 11),
};

const conversationId = '10873b82-c539-4692-9465-33f5b29ea022';
const completedAssessmentId = 'a3f6b7d8-1c2e-4f90-8a6b-5d7e9f102938';
const careCirclePostId = 'e825e886-2e32-44ab-ae1e-0588e82981f4';
const trainingResultId = '4dc5c14f-c092-44ee-b86d-065d27ebf0d0';
type SensitiveEnvelope = ReturnType<typeof encryptSensitiveJson>;

function objectContaining<T extends object>(value: T): unknown {
  return expect.objectContaining(value);
}

const responsibleDoctor: RequestUser = {
  id: 'responsible-doctor-user-id',
  account: 'doctor_responsible',
  displayName: '负责医师',
  roles: [
    {
      roleCode: 'doctor',
      relatedObjectType: 'doctor',
      relatedObjectId: 'responsible-doctor-profile-id',
    },
  ],
};

const otherDoctor: RequestUser = {
  id: 'other-doctor-user-id',
  account: 'doctor_other',
  displayName: '其他医师',
  roles: [
    {
      roleCode: 'doctor',
      relatedObjectType: 'doctor',
      relatedObjectId: 'other-doctor-profile-id',
    },
  ],
};

const patient: RequestUser = {
  id: 'patient-user-id',
  account: 'patient_task4',
  displayName: '患者',
  roles: [
    {
      roleCode: 'patient',
      relatedObjectType: 'patient',
      relatedObjectId: 'patient-id',
    },
  ],
};

const caregiver: RequestUser = {
  id: 'caregiver-user-id',
  account: 'caregiver_task4',
  displayName: '家属',
  roles: [
    {
      roleCode: 'caregiver',
      relatedObjectType: 'patient',
      relatedObjectId: 'patient-id',
    },
  ],
};

const superAdmin: RequestUser = {
  id: 'super-admin-user-id',
  account: 'admin_task4',
  displayName: '超级管理员',
  roles: [
    {
      roleCode: 'admin_super',
      relatedObjectType: 'admin',
      relatedObjectId: 'super-admin-user-id',
    },
  ],
};

const operatorAdmin: RequestUser = {
  id: 'operator-admin-user-id',
  account: 'operator_task4',
  displayName: '运营管理员',
  roles: [
    {
      roleCode: 'admin_operator',
      relatedObjectType: 'admin',
      relatedObjectId: 'operator-admin-user-id',
    },
  ],
};

const auditorAdmin: RequestUser = {
  id: 'auditor-admin-user-id',
  account: 'auditor_task4',
  displayName: '审计管理员',
  roles: [
    {
      roleCode: 'admin_auditor',
      relatedObjectType: 'admin',
      relatedObjectId: 'auditor-admin-user-id',
    },
  ],
};

const patientRecord = {
  id: 'patient-id',
  userId: 'patient-user-id',
  responsibleDoctorId: 'responsible-doctor-profile-id',
};

describe('Task 4 clinical authorization and atomic state machines', () => {
  describe('AI conversation review', () => {
    function createService() {
      const transactionAudit = jest.fn().mockResolvedValue({});
      const summaryEnvelope = encryptSensitiveJson(
        { summary: '会话已完成并等待医生复核。' },
        {
          tableName: 'ai_conversation_session',
          recordId: conversationId,
          fieldName: 'summaryEnvelope',
        },
        testSensitiveEncryptionKey,
      );
      const pendingReviewEnvelope = encryptSensitiveJson(
        { reviewNote: '请医生完成临床复核。' },
        {
          tableName: 'ai_conversation_session',
          recordId: conversationId,
          fieldName: 'reviewEnvelope',
        },
        testSensitiveEncryptionKey,
      );
      const formalAssessmentEnvelope = encryptSensitiveJson(
        {
          scoreSummary: {},
          rawInputSummary: {
            conversationEvidence: {
              sessionId: conversationId,
              patientId: 'patient-id',
              assessmentType: 'MMSE/CDR',
              status: 'pending_human_review',
            },
          },
        },
        {
          tableName: 'assessment_record',
          recordId: completedAssessmentId,
          fieldName: 'resultEnvelope',
        },
        testSensitiveEncryptionKey,
      );
      let reviewedEnvelope = pendingReviewEnvelope;
      const tx = {
        aiConversationSession: {
          updateMany: jest
            .fn()
            .mockImplementation(
              ({ data }: { data: { reviewEnvelope: SensitiveEnvelope } }) => {
                reviewedEnvelope = data.reviewEnvelope;
                return Promise.resolve({ count: 1 });
              },
            ),
          findUnique: jest.fn().mockImplementation(() =>
            Promise.resolve({
              id: conversationId,
              patientId: 'patient-id',
              status: 'reviewed',
              summaryEnvelope,
              reviewEnvelope: reviewedEnvelope,
              reviewedByUserId: responsibleDoctor.id,
            }),
          ),
        },
        auditLog: { create: transactionAudit },
      };
      const prisma = {
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        caregiverRelation: { findFirst: jest.fn() },
        consentRecord: { findFirst: jest.fn() },
        aiConversationSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: conversationId,
            patientId: 'patient-id',
            assessmentType: 'MMSE/CDR',
            status: 'pending_human_review',
            summaryEnvelope,
            reviewEnvelope: pendingReviewEnvelope,
            reviewedByUserId: null,
            reviewedAt: null,
            metadata: {
              humanReview: {
                required: true,
                status: 'pending_human_review',
              },
            },
          }),
          update: jest.fn().mockResolvedValue({
            id: conversationId,
            patientId: 'patient-id',
            status: 'reviewed',
          }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        assessmentRecord: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: completedAssessmentId,
              resultEnvelope: formalAssessmentEnvelope,
            },
          ]),
        },
        providerOperation: {
          findFirst: jest.fn().mockResolvedValue({
            provider: 'xiaomi-mimo',
            modelVersion: 'MiMo-V2.5',
            endpointHost: 'token-plan-cn.xiaomimimo.com',
          }),
        },
        $transaction: jest.fn(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      return {
        prisma,
        tx,
        service: new AppService(
          prisma as unknown as PrismaService,
          testSensitiveEncryptionKey,
        ),
      };
    }

    it.each([
      ['patient', patient],
      ['caregiver', caregiver],
      ['other doctor', otherDoctor],
      ['super admin', superAdmin],
      ['operator admin', operatorAdmin],
    ])(
      'rejects %s and allows only the responsible doctor',
      async (_label, actor) => {
        const { prisma, service } = createService();

        await expect(
          service.reviewAiConversation(actor, conversationId, {
            conclusion: 'approved',
            reviewNote: '已完成临床复核。',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(prisma.aiConversationSession.update).not.toHaveBeenCalled();
      },
    );

    it('claims pending_human_review once and writes the audit in the same transaction', async () => {
      const { prisma, tx, service } = createService();

      await expect(
        service.reviewAiConversation(responsibleDoctor, conversationId, {
          conclusion: 'approved',
          reviewNote: '已完成临床复核。',
        }),
      ).resolves.toMatchObject({ status: 'reviewed' });

      expect(tx.aiConversationSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: conversationId,
          patientId: 'patient-id',
          status: 'pending_human_review',
          reviewedByUserId: null,
          reviewedAt: null,
        },
        data: objectContaining({
          status: 'reviewed',
          reviewedByUserId: responsibleDoctor.id,
          reviewedAt: expect.any(Date) as Date,
        }),
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          action: 'ai.conversation.review',
          targetId: conversationId,
        }),
      });
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('returns 409 when another reviewer wins the CAS', async () => {
      const { tx, service } = createService();
      tx.aiConversationSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.reviewAiConversation(responsibleDoctor, conversationId, {
          conclusion: 'approved',
          reviewNote: '并发复核。',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('allows returning an AI conversation without a saved formal assessment', async () => {
      const { prisma, service } = createService();

      await expect(
        service.reviewAiConversation(responsibleDoctor, conversationId, {
          conclusion: 'returned',
          reviewNote: '请补充本次评估所需的对话信息。',
        }),
      ).resolves.toMatchObject({ status: 'reviewed' });

      expect(prisma.assessmentRecord.findMany).not.toHaveBeenCalled();
    });

    it('requires an approved AI conversation to have a formal assessment linked to the same session', async () => {
      const { prisma, service } = createService();
      const unrelatedAssessmentId = '08c2d5e7-f91a-4b63-a6e2-3f4b5c6d7e8f';
      prisma.assessmentRecord.findMany.mockResolvedValue([
        {
          id: unrelatedAssessmentId,
          resultEnvelope: encryptSensitiveJson(
            {
              scoreSummary: {},
              rawInputSummary: {
                conversationEvidence: {
                  sessionId: 'other-conversation-id',
                  patientId: 'patient-id',
                  assessmentType: 'MMSE/CDR',
                  status: 'pending_human_review',
                },
              },
            },
            {
              tableName: 'assessment_record',
              recordId: unrelatedAssessmentId,
              fieldName: 'resultEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
        },
      ]);

      await expect(
        service.reviewAiConversation(responsibleDoctor, conversationId, {
          conclusion: 'approved',
          reviewNote: '不能使用其他会话的评估。',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('authorizes before revealing that an AI conversation was already reviewed', async () => {
      const prisma = {
        aiConversationSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'conversation-id',
            patientId: 'patient-id',
            status: 'reviewed',
          }),
        },
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.reviewAiConversation(otherDoctor, 'conversation-id', {
          conclusion: 'approved',
          reviewNote: '无权探测状态。',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('authorizes before revealing append eligibility for a submitted AI conversation', async () => {
      const prisma = {
        aiConversationSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'conversation-id',
            patientId: 'patient-id',
            status: 'pending_human_review',
          }),
        },
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.appendAiConversationMessage(otherDoctor, 'conversation-id', {
          content: '无权探测该会话是否还能追加消息。',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('authorizes before revealing completion eligibility for a submitted AI conversation', async () => {
      const prisma = {
        aiConversationSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'conversation-id',
            patientId: 'patient-id',
            status: 'pending_human_review',
          }),
        },
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.completeAiConversation(otherDoctor, 'conversation-id', {
          summary: '无权探测该会话是否还能提交。',
          reviewNote: '无权探测状态。',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('formal assessment authorization and reviewer binding', () => {
    type AssessmentCreateArgs = {
      data: {
        id: string;
        resultEnvelope: unknown;
      };
    };

    function productionAssessment() {
      return {
        patientId: 'patient-id',
        assessmentType: 'MMSE/CDR',
        physicalConditions: ['no_known_limitations'],
        scoreSummary: {
          mmse: 22,
          cdr: 1,
          memory: 0.7,
          orientation: 0.65,
          executive: 0.68,
          language: 0.8,
        },
        rawInputSummary: {
          source: 'production_ai_assessment',
          transcript: '患者近期日期定向下降。',
          analysisSummary: '量表与访谈提示中度风险。',
          modelVersion: 'MiMo-V2.5',
          confidence: 0.91,
          evidence: {
            provider: 'xiaomi-mimo',
            model: 'MiMo-V2.5',
            modelVersion: 'MiMo-V2.5',
            callId: 'call-task4-001',
            endpointRef: 'https://example.invalid/v1/chat/completions',
            promptVersion: 'assessment-v1',
            calledAt: '2026-07-13T01:00:00.000Z',
            humanReview: {
              required: true,
              conclusion: 'approved',
              reviewerUserId: 'spoofed-client-reviewer',
              reviewedAt: '2000-01-01T00:00:00.000Z',
            },
          },
        },
      };
    }

    function createService() {
      const tx = {
        assessmentRecord: {
          create: jest
            .fn<
              Promise<{ id: string; patientId: string }>,
              [AssessmentCreateArgs]
            >()
            .mockResolvedValue({
              id: 'assessment-id',
              patientId: 'patient-id',
            }),
        },
        rehabPlan: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        riskGradeRecord: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({ id: 'risk-id' }),
        },
        aiAnalysisRecord: { create: jest.fn().mockResolvedValue({}) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const providerOperationId = '4c7d9e50-3d2a-4f6b-8c1e-7b9a2d5e6f10';
      const assessment = productionAssessment();
      const providerResponse = {
        result: {
          scoreSummary: assessment.scoreSummary,
          rawInputSummary: {
            transcript: assessment.rawInputSummary.transcript,
            analysisSummary: assessment.rawInputSummary.analysisSummary,
          },
          physicalConditions: assessment.physicalConditions,
        },
      };
      const responseHmacKey = Buffer.from(
        hkdfSync(
          'sha256',
          testSensitiveEncryptionKey.key,
          Buffer.from('rehab-provider-operation-hmac-v1', 'utf8'),
          Buffer.from('canonical-response-hmac', 'utf8'),
          32,
        ),
      );
      const providerResponseEvidence = {
        id: providerOperationId,
        responseCiphertext: encryptSensitiveJson(
          providerResponse,
          {
            tableName: 'provider_operation',
            recordId: providerOperationId,
            fieldName: 'responseCiphertext',
          },
          testSensitiveEncryptionKey,
        ),
        responseHmac: createProviderOperationResponseHmac(
          providerOperationId,
          providerResponse,
          responseHmacKey,
        ),
      };
      const prisma = {
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        consentRecord: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 'privacy-consent' })
            .mockResolvedValueOnce({ id: 'ai-consent' }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        providerOperation: {
          findFirst: jest.fn().mockResolvedValue({
            ...providerResponseEvidence,
            provider: 'xiaomi-mimo',
            modelVersion: 'MiMo-V2.5',
            endpointHost: 'example.invalid',
          }),
        },
        $transaction: jest.fn(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      return {
        prisma,
        tx,
        service: new AppService(
          prisma as unknown as PrismaService,
          testSensitiveEncryptionKey,
        ),
      };
    }

    it.each([
      ['patient', patient],
      ['caregiver', caregiver],
      ['other doctor', otherDoctor],
      ['super admin', superAdmin],
      ['operator admin', operatorAdmin],
    ])(
      'rejects %s from creating a formal assessment',
      async (_label, actor) => {
        const { service } = createService();
        await expect(
          service.createAssessment(actor, productionAssessment()),
        ).rejects.toBeInstanceOf(ForbiddenException);
      },
    );

    it('replaces client reviewer identity/time with responsible doctor and server time', async () => {
      const { prisma, tx, service } = createService();

      await service.createAssessment(responsibleDoctor, productionAssessment());

      const createData = tx.assessmentRecord.create.mock.calls[0][0].data;
      const assessmentResult = decryptSensitiveJson<{
        rawInputSummary: {
          evidence: {
            humanReview: {
              reviewerUserId: string;
              reviewedAt: string;
            };
          };
        };
      }>(
        createData.resultEnvelope,
        {
          tableName: 'assessment_record',
          recordId: createData.id,
          fieldName: 'resultEnvelope',
        },
        testSensitiveEncryptionKey,
      );
      expect(
        assessmentResult.rawInputSummary.evidence.humanReview.reviewerUserId,
      ).toBe(responsibleDoctor.id);
      expect(
        assessmentResult.rawInputSummary.evidence.humanReview.reviewedAt,
      ).not.toBe('2000-01-01T00:00:00.000Z');
      expect(
        Number.isNaN(
          Date.parse(
            assessmentResult.rawInputSummary.evidence.humanReview.reviewedAt,
          ),
        ),
      ).toBe(false);
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({ action: 'assessment.create' }),
      });
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('patient detail access', () => {
    it.each([
      ['super admin', superAdmin],
      ['operator admin', operatorAdmin],
      ['caregiver', caregiver],
      ['other doctor', otherDoctor],
    ])('rejects %s from full clinical patient reads', async (_label, actor) => {
      const prisma = {
        patientProfile: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(patientRecord)
            .mockResolvedValueOnce({ ...patientRecord, assessments: [] }),
        },
        caregiverRelation: { findFirst: jest.fn() },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.getPatient(actor, 'patient-id'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('selects and serializes only safe responsible doctor display fields', async () => {
      const patientId = '4cb8208c-f071-4ea4-8e50-27181fe07e36';
      const patientUserId = '47e9bc5e-c349-43c8-b984-3396f30c55f8';
      const doctorUserId = '215b0770-a062-4305-95ba-82b506f90d15';
      const patientActor: RequestUser = {
        ...patient,
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
            userId: patientUserId,
            responsibleDoctorId: 'responsible-doctor-profile-id',
            identityEnvelope: encryptSensitiveJson(
              { name: '患者', gender: 'female', age: 72 },
              {
                tableName: 'patient_profile',
                recordId: patientId,
                fieldName: 'identityEnvelope',
              },
              testSensitiveEncryptionKey,
            ),
            contactEnvelope: encryptSensitiveJson(
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
              testSensitiveEncryptionKey,
            ),
            careDetailsEnvelope: encryptSensitiveJson(
              { healthMetrics: {} },
              {
                tableName: 'patient_profile',
                recordId: patientId,
                fieldName: 'careDetailsEnvelope',
              },
              testSensitiveEncryptionKey,
            ),
            status: 'active',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
            responsibleDoctor: {
              id: 'responsible-doctor-profile-id',
              title: '主任医师',
              department: '康复医学科',
              user: {
                id: doctorUserId,
                identityEnvelope: encryptSensitiveJson(
                  {
                    displayName: responsibleDoctor.displayName,
                    mobilePhone: '13900000000',
                  },
                  {
                    tableName: 'user',
                    recordId: doctorUserId,
                    fieldName: 'identityEnvelope',
                  },
                  testSensitiveEncryptionKey,
                ),
              },
            },
            riskGrades: [],
            rehabPlans: [],
            trainingSessions: [],
            caregiverRelations: [],
            assessments: [],
            consents: [],
          }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      const detail = await service.getPatient(patientActor, patientId);

      expect(prisma.patientProfile.findUnique).toHaveBeenCalledWith(
        objectContaining({
          select: objectContaining({
            responsibleDoctor: {
              select: {
                id: true,
                title: true,
                department: true,
                user: { select: { id: true, identityEnvelope: true } },
              },
            },
          }),
        }),
      );
      expect(detail.responsibleDoctor).toEqual({
        id: 'responsible-doctor-profile-id',
        title: '主任医师',
        department: '康复医学科',
        user: {
          id: doctorUserId,
          displayName: responsibleDoctor.displayName,
        },
      });
      for (const forbiddenField of [
        'passwordHash',
        'authSessionVersion',
        'credentialVersion',
        'passwordResetRequired',
        'passwordUpdatedAt',
        'account',
        'mobilePhone',
        'lastLoginAt',
        'accountStatus',
      ]) {
        expect(JSON.stringify(detail.responsibleDoctor)).not.toContain(
          forbiddenField,
        );
      }
    });
  });

  describe('training clinical write role matrix', () => {
    function createService() {
      const prisma = {
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        rehabPlanItem: { findFirst: jest.fn() },
        collectionProtocol: { findFirst: jest.fn() },
        collectionBatch: { findUnique: jest.fn() },
        consentRecord: { findFirst: jest.fn() },
        trainingSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'training-session-id',
            patientId: 'patient-id',
            result: null,
            sessionStatus: 'in_progress',
          }),
          create: jest.fn(),
          upsert: jest.fn(),
        },
        trainingResult: { create: jest.fn() },
        motionMetric: { createMany: jest.fn() },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      return {
        prisma,
        service: new AppService(
          prisma as unknown as PrismaService,
          testSensitiveEncryptionKey,
        ),
      };
    }

    const startDto = {
      patientId: 'patient-id',
      rehabPlanId: 'plan-id',
      planItemId: 'plan-item-id',
      gameContentId: 'game-id',
      collectionBatchId: 'collection-batch-id',
      gameRunId: 'run-id',
      deviceCode: 'device-id',
      calibrationStatus: 'checked',
      clientStartedAt: '2026-07-13T00:00:00.000Z',
    };
    const resultDto = {
      score: 90,
      completionRate: 0.9,
      durationSeconds: 600,
      reactionTimeMs: 700,
      motionAccuracy: 0.9,
      exerciseIntensity: 'moderate',
      metricsSummary: {
        source: 'unity_webgl',
        gameRunId: 'run-id',
        gameVersion: '1.0.0',
        protocolVersion: '1.0.0',
        clientGeneratedAt: '2026-07-13T00:10:00.000Z',
        rawPayloadHash: 'hash-id',
        collectionBatchId: 'collection-batch-id',
      },
      motionMetrics: [{ metricType: 'reaction_time_ms', metricValue: 700 }],
    };

    const operations = [
      {
        label: 'training start',
        invoke: (service: AppService) =>
          service.startTrainingSession(serviceActor, startDto),
      },
      {
        label: 'training result submission',
        invoke: (service: AppService) =>
          service.submitTrainingResult(
            serviceActor,
            'training-session-id',
            resultDto,
          ),
      },
      {
        label: 'collection batch creation',
        invoke: (service: AppService) =>
          service.createCollectionBatch(serviceActor, {
            patientId: 'patient-id',
            rehabPlanId: 'plan-id',
            planItemId: 'plan-item-id',
            gameContentId: 'game-id',
            protocolId: 'protocol-id',
          }),
      },
    ];
    let serviceActor: RequestUser;

    it.each([
      ['super admin', superAdmin],
      ['operator admin', operatorAdmin],
    ])(
      'rejects %s from every patient clinical training write',
      async (_label, actor) => {
        for (const operation of operations) {
          const { prisma, service } = createService();
          serviceActor = actor;

          await expect(operation.invoke(service)).rejects.toBeInstanceOf(
            ForbiddenException,
          );
          expect(prisma.rehabPlanItem.findFirst).not.toHaveBeenCalled();
          expect(prisma.collectionProtocol.findFirst).not.toHaveBeenCalled();
          expect(prisma.consentRecord.findFirst).not.toHaveBeenCalled();
          expect(prisma.trainingSession.create).not.toHaveBeenCalled();
          expect(prisma.trainingSession.upsert).not.toHaveBeenCalled();
          expect(prisma.trainingResult.create).not.toHaveBeenCalled();
          expect(prisma.motionMetric.createMany).not.toHaveBeenCalled();
        }
      },
    );
  });

  describe('care-circle moderation and clinical precaution publication', () => {
    type ModerationUpdateArgs = {
      data: {
        moderationStatus: string;
        moderationEnvelope: SensitiveEnvelope;
      };
    };
    type PrecautionCreateArgs = {
      data: {
        id: string;
        contentEnvelope: SensitiveEnvelope;
        category: string;
        priority: string;
        status: string;
        publishedAt: Date | null;
      };
    };

    function createService() {
      const postContentEnvelope = encryptSensitiveJson(
        { body: '患者今日完成了训练。', mood: null, privateMetadata: null },
        {
          tableName: 'care_circle_post',
          recordId: careCirclePostId,
          fieldName: 'contentEnvelope',
        },
        testSensitiveEncryptionKey,
      );
      const careCirclePost = {
        findUnique: jest.fn().mockResolvedValue({
          id: careCirclePostId,
          patientId: 'patient-id',
          moderationStatus: 'visible',
          patient: patientRecord,
        }),
        update: jest.fn().mockImplementation(({ data }: ModerationUpdateArgs) =>
          Promise.resolve({
            id: careCirclePostId,
            contentEnvelope: postContentEnvelope,
            moderationStatus: data.moderationStatus,
            moderationEnvelope: data.moderationEnvelope,
            createdAt: new Date('2026-07-13T00:00:00.000Z'),
          }),
        ),
      };
      const auditLog = { create: jest.fn().mockResolvedValue({}) };
      const prisma = {
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        carePrecaution: {
          create: jest
            .fn()
            .mockImplementation(({ data }: PrecautionCreateArgs) =>
              Promise.resolve({
                id: data.id,
                contentEnvelope: data.contentEnvelope,
                category: data.category,
                priority: data.priority,
                status: data.status,
                publishedAt: data.publishedAt,
                createdAt: new Date('2026-07-13T00:00:00.000Z'),
              }),
            ),
        },
        careCirclePost,
        auditLog,
        $transaction: jest.fn(),
      };
      prisma.$transaction.mockImplementation(
        async (
          callback: (client: {
            careCirclePost: typeof careCirclePost;
            auditLog: typeof auditLog;
          }) => Promise<unknown>,
        ) => callback({ careCirclePost, auditLog }),
      );
      return {
        prisma,
        service: new AppService(
          prisma as unknown as PrismaService,
          testSensitiveEncryptionKey,
        ),
      };
    }

    it.each([
      ['super admin', superAdmin, 'draft'],
      ['super admin', superAdmin, 'published'],
      ['operator admin', operatorAdmin, 'draft'],
      ['operator admin', operatorAdmin, 'published'],
      ['auditor admin', auditorAdmin, 'draft'],
      ['auditor admin', auditorAdmin, 'published'],
    ])(
      'rejects %s from creating a %s CarePrecaution',
      async (_label, actor, status) => {
        const { prisma, service } = createService();

        await expect(
          service.createCarePrecaution(actor, {
            patientId: 'patient-id',
            title: '训练安全提醒',
            content: '训练前确认周围没有障碍物。',
            category: 'safety',
            priority: 'high',
            status,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(prisma.carePrecaution.create).not.toHaveBeenCalled();
      },
    );

    it('allows only the responsible doctor to publish a patient CarePrecaution', async () => {
      const { prisma, service } = createService();

      await expect(
        service.createCarePrecaution(responsibleDoctor, {
          patientId: 'patient-id',
          title: '训练安全提醒',
          content: '训练前确认周围没有障碍物。',
          category: 'safety',
          priority: 'high',
          status: 'published',
        }),
      ).resolves.toMatchObject({ status: 'published' });

      expect(prisma.carePrecaution.create).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            patientId: 'patient-id',
            createdByUserId: responsibleDoctor.id,
            status: 'published',
            publishedAt: expect.any(Date) as Date,
          }),
        }),
      );
    });

    it('keeps operator post moderation separate from clinical publication', async () => {
      const { prisma, service } = createService();

      await expect(
        service.moderateCareCirclePost(operatorAdmin, careCirclePostId, {
          moderationStatus: 'hidden',
          reason: '包含不适合公开的信息。',
        }),
      ).resolves.toMatchObject({ moderationStatus: 'hidden' });

      expect(prisma.careCirclePost.update).toHaveBeenCalled();
    });

    it('rolls back care-circle moderation when its same-transaction success audit fails', async () => {
      const auditFailure = new Error('audit insert failed');
      const postContentEnvelope = encryptSensitiveJson(
        { body: '患者今日完成了训练。', mood: null, privateMetadata: null },
        {
          tableName: 'care_circle_post',
          recordId: careCirclePostId,
          fieldName: 'contentEnvelope',
        },
        testSensitiveEncryptionKey,
      );
      let persistedModerationStatus = 'visible';
      let stagedModerationStatus = persistedModerationStatus;
      const tx = {
        careCirclePost: {
          update: jest
            .fn()
            .mockImplementation(({ data }: ModerationUpdateArgs) => {
              stagedModerationStatus = data.moderationStatus;
              return Promise.resolve({
                id: careCirclePostId,
                contentEnvelope: postContentEnvelope,
                moderationStatus: stagedModerationStatus,
                moderationEnvelope: data.moderationEnvelope,
                createdAt: new Date('2026-07-13T00:00:00.000Z'),
              });
            }),
        },
        auditLog: { create: jest.fn().mockRejectedValue(auditFailure) },
      };
      const prisma = {
        careCirclePost: {
          findUnique: jest.fn().mockResolvedValue({
            id: careCirclePostId,
            patientId: 'patient-id',
            moderationStatus: 'visible',
            patient: patientRecord,
          }),
          update: jest
            .fn()
            .mockImplementation(({ data }: ModerationUpdateArgs) => {
              persistedModerationStatus = data.moderationStatus;
              return Promise.resolve({
                id: careCirclePostId,
                contentEnvelope: postContentEnvelope,
                moderationStatus: persistedModerationStatus,
                moderationEnvelope: data.moderationEnvelope,
                createdAt: new Date('2026-07-13T00:00:00.000Z'),
              });
            }),
        },
        auditLog: { create: jest.fn().mockRejectedValue(auditFailure) },
        $transaction: jest.fn(
          async (callback: (client: typeof tx) => Promise<unknown>) => {
            stagedModerationStatus = persistedModerationStatus;
            const result = await callback(tx);
            persistedModerationStatus = stagedModerationStatus;
            return result;
          },
        ),
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.moderateCareCirclePost(operatorAdmin, careCirclePostId, {
          moderationStatus: 'hidden',
          reason: '包含不适合公开的信息。',
        }),
      ).rejects.toBe(auditFailure);

      expect(persistedModerationStatus).toBe('visible');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.careCirclePost.update).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          action: 'care_circle.post.moderate',
          targetId: careCirclePostId,
          result: 'success',
        }),
      });
      expect(prisma.careCirclePost.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('consent grant transaction', () => {
    it('inserts the grant and its audit in the same transaction', async () => {
      const grantedConsent = {
        id: 'consent-id',
        patientId: 'patient-id',
        subjectUserId: patient.id,
        consentType: 'ai_processing',
        consentVersion: 'v1.2',
        status: 'granted',
        revokedAt: null,
      };
      const tx = {
        consentRecord: {
          create: jest.fn().mockResolvedValue(grantedConsent),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        consentRecord: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(grantedConsent),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.createConsent(patient, {
          patientId: 'patient-id',
          subjectUserId: patient.id,
          consentType: 'ai_processing',
          consentVersion: 'v1.2',
          evidenceSnapshot: { acceptedAt: '2026-07-13T00:00:00.000Z' },
        }),
      ).resolves.toEqual(grantedConsent);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.consentRecord.create).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({
          action: 'consent.grant',
          targetId: 'consent-id',
        }),
      });
      expect(prisma.consentRecord.findFirst).not.toHaveBeenCalled();
      expect(prisma.consentRecord.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('caregiver clinical progress scope', () => {
    it('rejects reward and achievement progress without scope.progress', async () => {
      const prisma = {
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        caregiverRelation: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'relation-id',
            patientId: 'patient-id',
            caregiverUserId: caregiver.id,
            authorizationStatus: 'active',
            revokedAt: null,
            scope: {
              summary: true,
              reminders: true,
              progress: false,
              rawAssessment: false,
              planEdit: false,
            },
          }),
        },
        consentRecord: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'caregiver-consent-id',
            patientId: 'patient-id',
            consentType: 'caregiver_sharing',
            consentVersion: 'v1.2',
            status: 'granted',
            revokedAt: null,
          }),
        },
        rewardLedger: { findMany: jest.fn().mockResolvedValue([]) },
        achievement: { findMany: jest.fn().mockResolvedValue([]) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.listPatientRewards(caregiver, 'patient-id'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.rewardLedger.findMany).not.toHaveBeenCalled();
      expect(prisma.achievement.findMany).not.toHaveBeenCalled();
    });
  });

  describe('dashboard audit permission', () => {
    function createService() {
      const count = jest.fn().mockResolvedValue(1);
      const groupBy = jest.fn().mockResolvedValue([]);
      const auditLog = {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([{ id: 'audit-id' }]),
      };
      const prisma = {
        user: { count },
        patientProfile: {
          findMany: jest.fn().mockResolvedValue([]),
          count,
        },
        doctorProfile: { count },
        caregiverRelation: { count },
        assessmentRecord: { count, findMany: jest.fn() },
        trainingSession: { count, findMany: jest.fn(), groupBy },
        rehabPlan: { count, findMany: jest.fn(), groupBy },
        consentRecord: { count, findMany: jest.fn(), groupBy },
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
        auditLog,
      };
      return {
        prisma,
        auditLog,
        service: new AppService(
          prisma as unknown as PrismaService,
          testSensitiveEncryptionKey,
        ),
      };
    }

    it('returns operator dashboard content without querying or returning audit data', async () => {
      const { auditLog, service } = createService();

      const dashboard = await service.dashboard(operatorAdmin);

      expect(dashboard.metrics).toMatchObject({
        users: 1,
        patients: 1,
        assessments: 1,
        trainings: 1,
      });
      expect(dashboard.scope).toMatchObject({
        role: 'admin_operator',
        permissions: { auditRead: false },
      });
      expect(auditLog.count).not.toHaveBeenCalled();
      expect(auditLog.groupBy).not.toHaveBeenCalled();
      expect(auditLog.findMany).not.toHaveBeenCalled();
      expect(dashboard).not.toHaveProperty('auditLogs');
      expect(dashboard).not.toHaveProperty('recentActions');
      expect(dashboard.overview).not.toHaveProperty('deniedAudits');
      expect(dashboard.overview).not.toHaveProperty('failedAudits');
      expect(dashboard.distributions).not.toHaveProperty('auditResults');
    });

    it('queries and returns audit data when the actor has audit.read', async () => {
      const { auditLog, service } = createService();

      const dashboard = await service.dashboard(superAdmin);

      expect(dashboard.scope).toMatchObject({
        role: 'admin_super',
        permissions: { auditRead: true },
      });
      expect(auditLog.count).toHaveBeenCalledTimes(2);
      expect(auditLog.groupBy).toHaveBeenCalledTimes(2);
      expect(auditLog.findMany).toHaveBeenCalledTimes(1);
      expect(dashboard).toMatchObject({
        recentActions: [],
        auditLogs: [{ id: 'audit-id' }],
      });
      expect(dashboard.overview).toMatchObject({
        deniedAudits: 0,
        failedAudits: 0,
      });
      expect(dashboard.distributions).toHaveProperty('auditResults');
    });
  });

  describe('consent revoke state ordering', () => {
    it('authorizes patient and signing subject before revealing revoked state', async () => {
      const prisma = {
        consentRecord: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'consent-id',
            patientId: 'patient-id',
            subjectUserId: patient.id,
            consentType: 'camera_capture',
            consentVersion: 'v1.2',
            status: 'revoked',
            revokedAt: new Date('2026-07-13T00:00:00.000Z'),
          }),
        },
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.revokeConsent(otherDoctor, 'consent-id'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.patientProfile.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('caregiver sharing withdrawal', () => {
    function createService() {
      const revokedConsent = {
        id: 'old-sharing-consent',
        patientId: 'patient-id',
        subjectUserId: patient.id,
        consentType: 'caregiver_sharing',
        consentVersion: 'v1.0',
        status: 'revoked',
        revokedAt: new Date(),
      };
      const tx = {
        consentRecord: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue(revokedConsent),
        },
        caregiverRelation: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'relation-id', caregiverUserId: caregiver.id },
            ]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        userRoleBinding: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        consentRecord: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'old-sharing-consent',
            patientId: 'patient-id',
            subjectUserId: patient.id,
            consentType: 'caregiver_sharing',
            consentVersion: 'v1.0',
            status: 'granted',
            revokedAt: null,
          }),
        },
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      return {
        prisma,
        tx,
        service: new AppService(
          prisma as unknown as PrismaService,
          testSensitiveEncryptionKey,
        ),
      };
    }

    it('revokes an old granted caregiver consent, all active relations, bindings, and audit atomically', async () => {
      const { prisma, tx, service } = createService();

      await expect(
        service.revokeConsent(patient, 'old-sharing-consent'),
      ).resolves.toMatchObject({ status: 'revoked' });

      expect(tx.consentRecord.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'old-sharing-consent',
          status: 'granted',
          revokedAt: null,
        },
        data: { status: 'revoked', revokedAt: expect.any(Date) as Date },
      });
      expect(tx.caregiverRelation.updateMany).toHaveBeenCalledWith({
        where: {
          patientId: 'patient-id',
          authorizationStatus: 'active',
          revokedAt: null,
        },
        data: {
          authorizationStatus: 'inactive',
          revokedAt: expect.any(Date) as Date,
        },
      });
      expect(tx.userRoleBinding.updateMany).toHaveBeenCalledWith({
        where: {
          userId: { in: [caregiver.id] },
          roleCode: 'caregiver',
          relatedObjectType: 'patient',
          relatedObjectId: 'patient-id',
          bindingStatus: 'active',
        },
        data: { bindingStatus: 'inactive' },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: objectContaining({ action: 'consent.revoke' }),
      });
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('hard-fails inside relation creation when the current caregiver consent cannot be locked', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        caregiverRelation: {
          upsert: jest.fn().mockResolvedValue({ id: 'relation-id' }),
        },
        userRoleBinding: { upsert: jest.fn().mockResolvedValue({}) },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        consentRecord: {
          findFirst: jest.fn().mockResolvedValue({ id: 'current-consent-id' }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: caregiver.id,
            account: caregiver.account,
            displayName: caregiver.displayName,
            mobilePhone: null,
            accountStatus: 'active',
          }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.createCaregiverRelation(patient, 'patient-id', {
          caregiverAccount: caregiver.account,
          relation: 'daughter',
          scope: {
            summary: true,
            reminders: true,
            progress: true,
            rawAssessment: false,
            planEdit: false,
          },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.caregiverRelation.upsert).not.toHaveBeenCalled();
      expect(tx.userRoleBinding.upsert).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('registration and training review permissions/CAS', () => {
    it('lists only patient applications for doctors', async () => {
      const prisma = {
        registrationRequest: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await service.listRegistrationRequests(responsibleDoctor);

      expect(prisma.registrationRequest.findMany).toHaveBeenCalledWith(
        objectContaining({ where: { requestedRole: 'patient' } }),
      );
    });

    it('lists only caregiver applications for account administrators', async () => {
      const prisma = {
        registrationRequest: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await service.listRegistrationRequests(superAdmin);

      expect(prisma.registrationRequest.findMany).toHaveBeenCalledWith(
        objectContaining({ where: { requestedRole: 'caregiver' } }),
      );
    });

    function registrationService(requestedRole: 'patient' | 'caregiver') {
      const registrationId = 'e910ab7e-357c-443d-a391-50c5cbd8f139';
      const transaction = jest.fn();
      const prisma = {
        registrationRequest: {
          findUnique: jest.fn().mockResolvedValue({
            id: registrationId,
            requestedRole,
            account: `task4_${requestedRole}`,
            initialPasswordHash: null,
            identityEnvelope: encryptSensitiveJson(
              {
                displayName: '申请人',
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
            reviewStatus: 'pending',
            credentialExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        $transaction: transaction,
      };
      transaction.mockImplementation(
        async (callback: (client: unknown) => Promise<unknown>) =>
          callback(prisma),
      );
      return {
        registrationId,
        service: new AppService(
          prisma as unknown as PrismaService,
          testSensitiveEncryptionKey,
        ),
      };
    }

    it('uses the responsible registration role: doctors review patients and account admins review caregivers', async () => {
      const patientRegistration = registrationService('patient');
      await expect(
        patientRegistration.service.reviewRegistrationRequest(
          superAdmin,
          patientRegistration.registrationId,
          { decision: 'rejected', decisionReason: '临床注册由接诊医师负责。' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const caregiverRegistration = registrationService('caregiver');
      await expect(
        caregiverRegistration.service.reviewRegistrationRequest(
          responsibleDoctor,
          caregiverRegistration.registrationId,
          {
            decision: 'rejected',
            decisionReason: '家属账号由账号管理员负责。',
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 409 when a registration review CAS loses', async () => {
      const registration = registrationService('caregiver');
      await expect(
        registration.service.reviewRegistrationRequest(
          superAdmin,
          registration.registrationId,
          { decision: 'rejected', decisionReason: '资料不完整。' },
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    function trainingReviewService() {
      const result = {
        id: trainingResultId,
        sessionId: 'training-session-id',
        qualityFlag: 'suspicious',
        abnormalFlag: true,
        qualityReasons: ['姿态异常'],
        reviewStatus: null,
        reviewConclusion: null,
        reviewEnvelope: null,
        reviewedByUserId: null,
        reviewedAt: null,
        session: {
          id: 'training-session-id',
          patientId: 'patient-id',
          patient: patientRecord,
        },
      };
      const tx = {
        trainingResult: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findUnique: jest.fn().mockResolvedValue(result),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        trainingResult: {
          findUnique: jest.fn().mockResolvedValue(result),
          update: jest.fn().mockResolvedValue(result),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
      };
      return {
        prisma,
        tx,
        service: new AppService(
          prisma as unknown as PrismaService,
          testSensitiveEncryptionKey,
        ),
      };
    }

    it.each([
      ['super admin', superAdmin],
      ['operator admin', operatorAdmin],
      ['patient', patient],
      ['caregiver', caregiver],
      ['other doctor', otherDoctor],
    ])('rejects %s from training review', async (_label, actor) => {
      const { service } = trainingReviewService();
      await expect(
        service.reviewTrainingResult(actor, trainingResultId, {
          reviewConclusion: 'needs_retrain',
          reviewNote: '需要重新训练。',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 409 when a training review CAS loses', async () => {
      const { tx, service } = trainingReviewService();
      await expect(
        service.reviewTrainingResult(responsibleDoctor, trainingResultId, {
          reviewConclusion: 'needs_retrain',
          reviewNote: '需要重新训练。',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('authorizes before revealing that a training result needs no review', async () => {
      const prisma = {
        trainingResult: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'training-result-id',
            sessionId: 'training-session-id',
            qualityFlag: 'valid',
            abnormalFlag: false,
            qualityReasons: [],
            reviewStatus: null,
            reviewConclusion: null,
            reviewedByUserId: null,
            reviewedAt: null,
            session: {
              id: 'training-session-id',
              patientId: 'patient-id',
              patient: patientRecord,
              gameContent: {},
              motionMetrics: [],
            },
          }),
        },
        patientProfile: {
          findUnique: jest.fn().mockResolvedValue(patientRecord),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };
      const service = new AppService(
        prisma as unknown as PrismaService,
        testSensitiveEncryptionKey,
      );

      await expect(
        service.reviewTrainingResult(otherDoctor, 'training-result-id', {
          reviewConclusion: 'needs_retrain',
          reviewNote: '无权探测状态。',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

describe('Task 4 idempotency immutable context', () => {
  it('treats JSON key order as equal but rejects any immutable field change', () => {
    const service = new AppService(
      {} as PrismaService,
      testSensitiveEncryptionKey,
    );
    const assertImmutableContext = Reflect.get(
      service,
      'assertImmutableIdempotencyContext',
    ) as (
      resource: string,
      actual: Record<string, unknown>,
      expected: Record<string, unknown>,
    ) => void;
    const actual = {
      patientId: 'patient-id',
      rehabPlanId: 'plan-id',
      runtimeConfigSnapshot: { b: 2, a: 1 },
    };
    const same = {
      patientId: 'patient-id',
      rehabPlanId: 'plan-id',
      runtimeConfigSnapshot: { a: 1, b: 2 },
    };

    expect(() =>
      assertImmutableContext.call(service, 'training session', actual, same),
    ).not.toThrow();
    expect(() =>
      assertImmutableContext.call(service, 'training session', actual, {
        ...same,
        rehabPlanId: 'different-plan-id',
      }),
    ).toThrow(ConflictException);
  });
});
