import { randomInt, randomUUID } from 'node:crypto';

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppService } from '../src/app.service';
import type { RequestUser } from '../src/current-user';
import { PrismaService } from '../src/prisma.service';
import {
  createPhoneLookupHmac,
  encryptSensitiveJson,
} from '../src/sensitive-encryption';

const testSensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-sensitive-key',
  key: Buffer.alloc(32, 11),
};

jest.setTimeout(30_000);

type PatientFixture = {
  id: string;
  userId: string;
  rehabPlanId: string;
  planItemId: string;
};

type CaregiverRaceState = {
  consentId: string;
  relationId: string;
  patientId: string;
  caregiverUserId: string;
};

type Fixtures = {
  organizationId: string;
  doctorUserId: string;
  adminUserId: string;
  caregiverUserId: string;
  caregiverAccount: string;
  createdCaregiverRoleDefinition: boolean;
  doctorId: string;
  assessmentId: string;
  gameContentId: string;
  conditionId: string;
  protocolId: string;
  protocolVersion: string;
  patients: [PatientFixture, PatientFixture];
};

type BarrierKind = 'conversation' | 'registration' | 'training';
type CaregiverBarrierMode = 'create-first' | 'revoke-first';

const barrierDefinitions = {
  conversation: {
    table: 'ai_conversation_session',
    sequence: 'task4_ai_conversation_review_barrier_seq',
    function: 'task4_ai_conversation_review_barrier_fn',
    trigger: 'task4_ai_conversation_review_barrier_trigger',
  },
  registration: {
    table: 'registration_request',
    sequence: 'task4_registration_review_barrier_seq',
    function: 'task4_registration_review_barrier_fn',
    trigger: 'task4_registration_review_barrier_trigger',
  },
  training: {
    table: 'training_result',
    sequence: 'task4_training_review_barrier_seq',
    function: 'task4_training_review_barrier_fn',
    trigger: 'task4_training_review_barrier_trigger',
  },
} as const;

const caregiverBarrierDefinition = {
  sequence: 'task4_caregiver_relation_barrier_seq',
  activationFunction: 'task4_caregiver_relation_activation_barrier_fn',
  activationTrigger: 'task4_caregiver_relation_activation_barrier_trigger',
  revokeFunction: 'task4_caregiver_relation_revoke_barrier_fn',
  revokeTrigger: 'task4_caregiver_relation_revoke_barrier_trigger',
} as const;

describe('Task 4 concurrency guarantees on disposable PostgreSQL', () => {
  const runPrefix = `task4_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const phoneSeed = String(randomInt(100_000_000)).padStart(8, '0');
  const prisma = new PrismaService();
  const contenderA = new PrismaService();
  const contenderB = new PrismaService();
  const serviceA = new AppService(contenderA, testSensitiveEncryptionKey);
  const serviceB = new AppService(contenderB, testSensitiveEncryptionKey);
  let fixtures: Fixtures | undefined;

  const adminActor: RequestUser = {
    id: '',
    account: `${runPrefix}_admin`,
    displayName: 'Task 4 Admin',
    roles: [
      {
        roleCode: 'admin_super',
        relatedObjectType: 'admin',
        relatedObjectId: `${runPrefix}_admin`,
      },
    ],
  };
  const doctorActor: RequestUser = {
    id: '',
    account: `${runPrefix}_doctor`,
    displayName: 'Task 4 Doctor',
    roles: [],
  };
  const patientActor: RequestUser = {
    id: '',
    account: `${runPrefix}_patient_a`,
    displayName: 'Task 4 Patient A',
    roles: [],
  };

  beforeAll(async () => {
    if (
      process.env.TASK4_E2E_CONFIRM_DISPOSABLE !== 'YES' ||
      !process.env.DATABASE_URL ||
      process.env.DATABASE_URL !== process.env.TASK4_E2E_DATABASE_URL
    ) {
      throw new Error(
        'Task 4 PostgreSQL concurrency tests require the explicit confirmed disposable runner.',
      );
    }

    await Promise.all([
      prisma.$connect(),
      contenderA.$connect(),
      contenderB.$connect(),
    ]);
    fixtures = await createFixtures();
    adminActor.id = fixtures.adminUserId;
    doctorActor.id = fixtures.doctorUserId;
    doctorActor.roles = [
      {
        roleCode: 'doctor',
        relatedObjectType: 'doctor_profile',
        relatedObjectId: fixtures.doctorId,
      },
    ];
    patientActor.id = fixtures.patients[0].userId;
    patientActor.roles = [
      {
        roleCode: 'patient',
        relatedObjectType: 'patient',
        relatedObjectId: fixtures.patients[0].id,
      },
    ];
  });

  afterEach(async () => {
    await dropCasBarrier('conversation');
    await dropCasBarrier('registration');
    await dropCasBarrier('training');
    await dropCaregiverBarrier();
    await cleanupDynamicRecords();
  });

  afterAll(async () => {
    try {
      await dropCasBarrier('conversation');
      await dropCasBarrier('registration');
      await dropCasBarrier('training');
      await dropCaregiverBarrier();
      await cleanupDynamicRecords();
      await cleanupBaseFixtures();
    } finally {
      await Promise.all([
        prisma.$disconnect(),
        contenderA.$disconnect(),
        contenderB.$disconnect(),
      ]);
    }
  });

  it('allows exactly one concurrent current risk grade per patient', async () => {
    const current = requiredFixtures();
    const attempts = await Promise.allSettled([
      contenderA.riskGradeRecord.create({
        data: riskGradeData(
          current.patients[0].id,
          current.assessmentId,
          'moderate',
          `${runPrefix}_current_risk_a`,
        ),
      }),
      contenderB.riskGradeRecord.create({
        data: riskGradeData(
          current.patients[0].id,
          current.assessmentId,
          'high',
          `${runPrefix}_current_risk_b`,
        ),
      }),
    ]);

    expectSingleUniqueWinner(attempts);
    await expect(
      prisma.riskGradeRecord.count({
        where: { patientId: current.patients[0].id, isCurrent: true },
      }),
    ).resolves.toBe(1);
  });

  it('allows one current and one pending rehab plan per patient under concurrent inserts', async () => {
    const current = requiredFixtures();
    const patientId = current.patients[0].id;

    const currentAttempts = await Promise.allSettled([
      contenderA.rehabPlan.create({
        data: rehabPlanData(
          patientId,
          `${runPrefix}_concurrency_current_a`,
          'active',
          true,
        ),
      }),
      contenderB.rehabPlan.create({
        data: rehabPlanData(
          patientId,
          `${runPrefix}_concurrency_current_b`,
          'active',
          true,
        ),
      }),
    ]);
    const pendingAttempts = await Promise.allSettled([
      contenderA.rehabPlan.create({
        data: rehabPlanData(
          patientId,
          `${runPrefix}_concurrency_pending_a`,
          'pending_confirm',
          false,
        ),
      }),
      contenderB.rehabPlan.create({
        data: rehabPlanData(
          patientId,
          `${runPrefix}_concurrency_pending_b`,
          'pending_confirm',
          false,
        ),
      }),
    ]);

    expectSingleUniqueWinner(currentAttempts);
    expectSingleUniqueWinner(pendingAttempts);
    await expect(
      prisma.rehabPlan.count({ where: { patientId, isCurrent: true } }),
    ).resolves.toBe(1);
    await expect(
      prisma.rehabPlan.count({
        where: { patientId, status: 'pending_confirm' },
      }),
    ).resolves.toBe(1);
  });

  it('allows exactly one pending registration per account', async () => {
    const account = `${runPrefix}_shared_account`;
    const attempts = await Promise.allSettled([
      contenderA.registrationRequest.create({
        data: registrationData(account, testPhone(1)),
      }),
      contenderB.registrationRequest.create({
        data: registrationData(account, testPhone(2)),
      }),
    ]);

    expectSingleUniqueWinner(attempts);
    await expect(
      prisma.registrationRequest.count({
        where: { account, reviewStatus: 'pending' },
      }),
    ).resolves.toBe(1);
  });

  it('allows exactly one pending registration per non-null mobile while null mobiles do not collide', async () => {
    const mobilePhone = testPhone(3);
    const mobilePhoneLookup = createPhoneLookupHmac(
      mobilePhone,
      testSensitiveEncryptionKey.key,
    );
    const mobileAttempts = await Promise.allSettled([
      contenderA.registrationRequest.create({
        data: registrationData(`${runPrefix}_mobile_account_a`, mobilePhone),
      }),
      contenderB.registrationRequest.create({
        data: registrationData(`${runPrefix}_mobile_account_b`, mobilePhone),
      }),
    ]);
    const nullMobileAttempts = await Promise.allSettled([
      contenderA.registrationRequest.create({
        data: registrationData(`${runPrefix}_null_mobile_a`, null),
      }),
      contenderB.registrationRequest.create({
        data: registrationData(`${runPrefix}_null_mobile_b`, null),
      }),
    ]);

    expectSingleUniqueWinner(mobileAttempts);
    expect(nullMobileAttempts).toHaveLength(2);
    expect(
      nullMobileAttempts.every(({ status }) => status === 'fulfilled'),
    ).toBe(true);
    await expect(
      prisma.registrationRequest.count({
        where: { mobilePhoneLookup, reviewStatus: 'pending' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.registrationRequest.count({
        where: {
          account: {
            in: [`${runPrefix}_null_mobile_a`, `${runPrefix}_null_mobile_b`],
          },
          mobilePhoneLookup: null,
          reviewStatus: 'pending',
        },
      }),
    ).resolves.toBe(2);
  });

  it('allows exactly one concurrent service grant and commits exactly one audit', async () => {
    const current = requiredFixtures();
    const patientId = current.patients[0].id;
    const consentDto = {
      patientId,
      subjectUserId: current.patients[0].userId,
      consentType: 'ai_processing' as const,
      consentVersion: 'v1.2',
      evidenceSnapshot: { source: `${runPrefix}_concurrent_grant` },
    };

    const attempts = await Promise.allSettled([
      serviceA.createConsent(patientActor, consentDto),
      serviceB.createConsent(patientActor, consentDto),
    ]);

    const fulfilled = attempts.filter(
      (attempt) => attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    await expect(
      prisma.consentRecord.count({
        where: {
          patientId,
          consentType: 'ai_processing',
          consentVersion: 'v1.2',
          status: 'granted',
          revokedAt: null,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          actorUserId: patientActor.id,
          action: 'consent.grant',
        },
      }),
    ).resolves.toBe(1);
  });

  it('scopes concurrent collection batch idempotency keys to the patient', async () => {
    const current = requiredFixtures();
    const idempotencyKey = `${runPrefix}_collection_idempotency`;
    const attempts = await Promise.allSettled([
      contenderA.collectionBatch.create({
        data: collectionBatchData(current.patients[0], idempotencyKey),
      }),
      contenderB.collectionBatch.create({
        data: collectionBatchData(current.patients[0], idempotencyKey),
      }),
      prisma.collectionBatch.create({
        data: collectionBatchData(current.patients[1], idempotencyKey),
      }),
    ]);

    expectPatientScopedIdempotency(attempts);
    await expect(
      prisma.collectionBatch.count({
        where: { patientId: current.patients[0].id, idempotencyKey },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.collectionBatch.count({
        where: { patientId: current.patients[1].id, idempotencyKey },
      }),
    ).resolves.toBe(1);
  });

  it('scopes concurrent training session idempotency keys to the patient', async () => {
    const current = requiredFixtures();
    const idempotencyKey = `${runPrefix}_training_idempotency`;
    const attempts = await Promise.allSettled([
      contenderA.trainingSession.create({
        data: trainingSessionData(current.patients[0], idempotencyKey),
      }),
      contenderB.trainingSession.create({
        data: trainingSessionData(current.patients[0], idempotencyKey),
      }),
      prisma.trainingSession.create({
        data: trainingSessionData(current.patients[1], idempotencyKey),
      }),
    ]);

    expectPatientScopedIdempotency(attempts);
    await expect(
      prisma.trainingSession.count({
        where: { patientId: current.patients[0].id, idempotencyKey },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.trainingSession.count({
        where: { patientId: current.patients[1].id, idempotencyKey },
      }),
    ).resolves.toBe(1);
  });

  it('allows exactly one service-level registration review CAS winner', async () => {
    const account = `${runPrefix}_registration_review`;
    const registration = await prisma.registrationRequest.create({
      data: registrationData(account, null),
    });
    await installCasBarrier('registration');

    const attempts = await Promise.allSettled([
      serviceA.reviewRegistrationRequest(adminActor, registration.id, {
        decision: 'rejected',
        decisionReason: 'Task 4 concurrent review A',
      }),
      serviceB.reviewRegistrationRequest(adminActor, registration.id, {
        decision: 'rejected',
        decisionReason: 'Task 4 concurrent review B',
      }),
    ]);

    expectSingleCasWinner(attempts);
    await expect(
      prisma.registrationRequest.findUniqueOrThrow({
        where: { id: registration.id },
      }),
    ).resolves.toMatchObject({ reviewStatus: 'rejected' });
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'registration_request.review',
          targetId: registration.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('allows exactly one service-level training review CAS winner', async () => {
    const current = requiredFixtures();
    const session = await prisma.trainingSession.create({
      data: trainingSessionData(
        current.patients[0],
        `${runPrefix}_training_review_session`,
      ),
    });
    const result = await prisma.trainingResult.create({
      data: {
        sessionId: session.id,
        source: 'unity_webgl',
        gameRunId: `${runPrefix}_review_game_run`,
        gameVersion: 'task4-test',
        bridgeProtocolVersion: '1.0.0',
        rawPayloadHash: `${runPrefix}_review_payload`,
        score: 10,
        completionRate: 0.5,
        durationSeconds: 30,
        reactionTimeMs: 500,
        motionAccuracy: 0.5,
        exerciseIntensity: 'moderate',
        abnormalFlag: true,
        qualityFlag: 'suspicious',
        qualityReasons: ['task4_concurrency_review'],
      },
    });
    await installCasBarrier('training');

    const attempts = await Promise.allSettled([
      serviceA.reviewTrainingResult(doctorActor, result.id, {
        reviewConclusion: 'needs_retrain',
        reviewNote: 'Task 4 concurrent training review A',
      }),
      serviceB.reviewTrainingResult(doctorActor, result.id, {
        reviewConclusion: 'excluded_from_analysis',
        reviewNote: 'Task 4 concurrent training review B',
      }),
    ]);

    expectSingleCasWinner(attempts);
    await expect(
      prisma.trainingResult.findUniqueOrThrow({ where: { id: result.id } }),
    ).resolves.toMatchObject({
      reviewStatus: 'reviewed',
      reviewedByUserId: current.doctorUserId,
    });
    await expect(
      prisma.auditLog.count({
        where: { action: 'training_result.review', targetId: result.id },
      }),
    ).resolves.toBe(1);
  });

  it('allows exactly one service-level AI conversation review CAS winner', async () => {
    const current = requiredFixtures();
    const sessionId = randomUUID();
    const session = await prisma.aiConversationSession.create({
      data: {
        id: sessionId,
        patientId: current.patients[0].id,
        createdByUserId: current.doctorUserId,
        assessmentType: 'MMSE/CDR',
        status: 'pending_human_review',
        completedAt: new Date(),
        provider: 'task4_concurrency_test',
        modelVersion: 'task4-test',
        endpointRef: 'task4://concurrency-test',
        summaryEnvelope: encryptSensitiveJson(
          { summary: 'Task 4 concurrent AI conversation review' },
          {
            tableName: 'ai_conversation_session',
            recordId: sessionId,
            fieldName: 'summaryEnvelope',
          },
          testSensitiveEncryptionKey,
        ),
        reviewEnvelope: encryptSensitiveJson(
          { reviewNote: 'Pending responsible doctor review' },
          {
            tableName: 'ai_conversation_session',
            recordId: sessionId,
            fieldName: 'reviewEnvelope',
          },
          testSensitiveEncryptionKey,
        ),
        metadata: {
          humanReview: {
            required: true,
            status: 'pending_human_review',
          },
        },
      },
    });
    const formalAssessmentId = randomUUID();
    await prisma.assessmentRecord.create({
      data: {
        id: formalAssessmentId,
        patientId: current.patients[0].id,
        assessmentType: 'MMSE/CDR',
        source: 'task4_concurrency_test',
        resultEnvelope: encryptSensitiveJson(
          {
            scoreSummary: {},
            rawInputSummary: {
              conversationEvidence: {
                sessionId: session.id,
                patientId: current.patients[0].id,
                assessmentType: 'MMSE/CDR',
                status: 'pending_human_review',
              },
            },
          },
          {
            tableName: 'assessment_record',
            recordId: formalAssessmentId,
            fieldName: 'resultEnvelope',
          },
          testSensitiveEncryptionKey,
        ),
      },
    });
    await installCasBarrier('conversation');

    const attempts = await Promise.allSettled([
      serviceA.reviewAiConversation(doctorActor, session.id, {
        conclusion: 'approved',
        reviewNote: 'Task 4 concurrent AI review A',
      }),
      serviceB.reviewAiConversation(doctorActor, session.id, {
        conclusion: 'approved',
        reviewNote: 'Task 4 concurrent AI review B',
      }),
    ]);

    expectSingleCasWinner(attempts);
    const reviewed = await prisma.aiConversationSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(reviewed).toMatchObject({
      status: 'reviewed',
      reviewedByUserId: current.doctorUserId,
      reviewedAt: expect.any(Date) as Date,
    });
    expect(reviewed.metadata).toMatchObject({
      humanReview: {
        required: true,
        status: 'reviewed',
        conclusion: 'approved',
        reviewerUserId: current.doctorUserId,
      },
    });
    await expect(
      prisma.auditLog.count({
        where: { action: 'ai.conversation.review', targetId: session.id },
      }),
    ).resolves.toBe(1);
  });

  it('deactivates a relation created first when consent revocation races its commit', async () => {
    const state = await createCaregiverRaceState();
    await installCaregiverBarrier('create-first', state.consentId);

    const creation = serviceA.createCaregiverRelation(
      patientActor,
      state.patientId,
      caregiverRelationDto(),
    );
    await waitForCaregiverBarrierEntry();
    const revocation = serviceB.revokeConsent(patientActor, state.consentId);
    const attempts = await Promise.allSettled([creation, revocation]);

    expect(attempts[0].status).toBe('fulfilled');
    expect(attempts[1].status).toBe('fulfilled');
    await expectCaregiverAuthorizationRevoked(state);
    await expect(
      prisma.auditLog.count({
        where: {
          actorUserId: patientActor.id,
          action: {
            in: ['caregiver_relation.create', 'consent.revoke'],
          },
        },
      }),
    ).resolves.toBe(2);
  });

  it('hard-fails relation reactivation when consent revocation wins the row lock', async () => {
    const state = await createCaregiverRaceState();
    await installCaregiverBarrier('revoke-first', state.consentId);

    const revocation = serviceA.revokeConsent(patientActor, state.consentId);
    await waitForCaregiverBarrierEntry();
    const creation = serviceB.createCaregiverRelation(
      patientActor,
      state.patientId,
      caregiverRelationDto(),
    );
    const attempts = await Promise.allSettled([revocation, creation]);

    expect(attempts[0].status).toBe('fulfilled');
    expect(attempts[1].status).toBe('rejected');
    if (attempts[1].status === 'rejected') {
      expect(attempts[1].reason).toBeInstanceOf(ForbiddenException);
    }
    await expectCaregiverAuthorizationRevoked(state);
    await expect(
      prisma.auditLog.count({
        where: {
          actorUserId: patientActor.id,
          action: 'caregiver_relation.create',
        },
      }),
    ).resolves.toBe(0);
  });

  function caregiverRelationDto() {
    const current = requiredFixtures();
    return {
      caregiverAccount: current.caregiverAccount,
      relation: 'daughter',
      scope: {
        summary: true,
        reminders: true,
        progress: true,
        rawAssessment: false,
        planEdit: false,
      },
    };
  }

  async function createCaregiverRaceState(): Promise<CaregiverRaceState> {
    const current = requiredFixtures();
    const patientId = current.patients[0].id;
    const revokedAt = new Date(Date.now() - 60_000);
    const relation = await prisma.caregiverRelation.create({
      data: {
        caregiverUserId: current.caregiverUserId,
        patientId,
        relation: 'daughter',
        authorizationStatus: 'inactive',
        authorizedAt: new Date(Date.now() - 120_000),
        revokedAt,
        scope: caregiverRelationDto().scope,
      },
    });
    await prisma.userRoleBinding.create({
      data: {
        userId: current.caregiverUserId,
        roleCode: 'caregiver',
        relatedObjectType: 'patient',
        relatedObjectId: patientId,
        bindingStatus: 'inactive',
      },
    });
    const consent = await prisma.consentRecord.create({
      data: {
        patientId,
        subjectUserId: current.patients[0].userId,
        consentType: 'caregiver_sharing',
        consentVersion: 'v1.2',
        evidenceSnapshot: { source: 'task4_concurrency_test' },
      },
    });
    return {
      consentId: consent.id,
      relationId: relation.id,
      patientId,
      caregiverUserId: current.caregiverUserId,
    };
  }

  async function expectCaregiverAuthorizationRevoked(
    state: CaregiverRaceState,
  ) {
    await expect(
      prisma.consentRecord.findUniqueOrThrow({
        where: { id: state.consentId },
      }),
    ).resolves.toMatchObject({
      status: 'revoked',
      revokedAt: expect.any(Date) as Date,
    });
    await expect(
      prisma.caregiverRelation.findUniqueOrThrow({
        where: { id: state.relationId },
      }),
    ).resolves.toMatchObject({
      authorizationStatus: 'inactive',
      revokedAt: expect.any(Date) as Date,
    });
    await expect(
      prisma.userRoleBinding.findUniqueOrThrow({
        where: {
          userId_roleCode_relatedObjectId: {
            userId: state.caregiverUserId,
            roleCode: 'caregiver',
            relatedObjectId: state.patientId,
          },
        },
      }),
    ).resolves.toMatchObject({ bindingStatus: 'inactive' });
    await expect(
      prisma.caregiverRelation.count({
        where: {
          patientId: state.patientId,
          authorizationStatus: 'active',
          revokedAt: null,
        },
      }),
    ).resolves.toBe(0);
  }

  function requiredFixtures() {
    if (!fixtures) {
      throw new Error('Task 4 PostgreSQL fixtures were not initialized.');
    }
    return fixtures;
  }

  function rehabPlanData(
    patientId: string,
    planName: string,
    status: 'active' | 'pending_confirm',
    isCurrent: boolean,
  ) {
    const current = requiredFixtures();
    return {
      patientId,
      doctorId: current.doctorId,
      source: 'task4_concurrency_test',
      planName,
      status,
      isCurrent,
      weekFrequency: 3,
      dailyDuration: 20,
      difficultyLadder: {},
      recommendationReason: 'Task 4 PostgreSQL concurrency test',
    };
  }

  function registrationData(account: string, mobilePhone: string | null) {
    const id = randomUUID();
    return {
      id,
      requestedRole: 'caregiver' as const,
      account,
      credentialExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mobilePhoneLookup:
        mobilePhone === null
          ? null
          : createPhoneLookupHmac(mobilePhone, testSensitiveEncryptionKey.key),
      identityEnvelope: encryptSensitiveJson(
        {
          displayName: 'Task 4 Registration',
          mobilePhone,
          profileSnapshot: {},
        },
        {
          tableName: 'registration_request',
          recordId: id,
          fieldName: 'identityEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
      reviewStatus: 'pending' as const,
    };
  }

  function testPhone(suffix: number) {
    return `+155${phoneSeed}${String(suffix).padStart(2, '0')}`;
  }

  function riskGradeData(
    patientId: string,
    assessmentId: string,
    riskLevel: 'moderate' | 'high',
    reasonSummary: string,
  ) {
    const id = randomUUID();
    return {
      id,
      patientId,
      assessmentId,
      riskLevel,
      systemRiskLevel: riskLevel,
      isCurrent: true,
      reasonEnvelope: encryptSensitiveJson(
        { reasonSummary },
        {
          tableName: 'risk_grade_record',
          recordId: id,
          fieldName: 'reasonEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    };
  }

  function userFixtureData(
    account: string,
    displayName: string,
    passwordHash: string,
  ) {
    const id = randomUUID();
    return {
      id,
      account,
      passwordHash,
      identityEnvelope: encryptSensitiveJson(
        { displayName, mobilePhone: null },
        {
          tableName: 'user',
          recordId: id,
          fieldName: 'identityEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    };
  }

  function patientFixtureData(
    userId: string,
    responsibleDoctorId: string,
    name: string,
    age: number,
  ) {
    const id = randomUUID();
    return {
      id,
      userId,
      responsibleDoctorId,
      identityEnvelope: encryptSensitiveJson(
        { name, gender: 'unspecified', age },
        {
          tableName: 'patient_profile',
          recordId: id,
          fieldName: 'identityEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
      contactEnvelope: Prisma.DbNull,
      careDetailsEnvelope: encryptSensitiveJson(
        { healthMetrics: {} },
        {
          tableName: 'patient_profile',
          recordId: id,
          fieldName: 'careDetailsEnvelope',
        },
        testSensitiveEncryptionKey,
      ),
    };
  }

  function collectionBatchData(
    patient: PatientFixture,
    idempotencyKey: string,
  ) {
    const current = requiredFixtures();
    return {
      patientId: patient.id,
      rehabPlanId: patient.rehabPlanId,
      planItemId: patient.planItemId,
      gameContentId: current.gameContentId,
      protocolId: current.protocolId,
      conditionId: current.conditionId,
      protocolVersion: current.protocolVersion,
      idempotencyKey,
    };
  }

  function trainingSessionData(
    patient: PatientFixture,
    idempotencyKey: string,
  ) {
    const current = requiredFixtures();
    return {
      patientId: patient.id,
      rehabPlanId: patient.rehabPlanId,
      planItemId: patient.planItemId,
      gameContentId: current.gameContentId,
      idempotencyKey,
    };
  }

  function expectSingleUniqueWinner<T>(
    attempts: Array<PromiseSettledResult<T>>,
  ) {
    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<T> =>
        attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'P2002' });
  }

  function expectPatientScopedIdempotency<T>(
    attempts: Array<PromiseSettledResult<T>>,
  ) {
    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<T> =>
        attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'P2002' });
  }

  function expectSingleCasWinner<T>(attempts: Array<PromiseSettledResult<T>>) {
    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<T> =>
        attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
  }

  async function createFixtures(): Promise<Fixtures> {
    return prisma.$transaction(async (tx) => {
      const existingCaregiverRole = await tx.roleDefinition.findUnique({
        where: { code: 'caregiver' },
      });
      if (!existingCaregiverRole) {
        await tx.roleDefinition.create({
          data: {
            code: 'caregiver',
            name: 'Caregiver',
            level: 10,
          },
        });
      }
      const organization = await tx.organization.create({
        data: {
          name: 'Task 4 Concurrency Organization',
          code: `${runPrefix}_organization`,
          type: 'hospital',
        },
      });
      const doctorUser = await tx.user.create({
        data: userFixtureData(
          doctorActor.account,
          doctorActor.displayName,
          `${runPrefix}_doctor_password_hash`,
        ),
      });
      const adminUser = await tx.user.create({
        data: userFixtureData(
          adminActor.account,
          adminActor.displayName,
          `${runPrefix}_admin_password_hash`,
        ),
      });
      const caregiverAccount = `cg_${runPrefix.slice(-20)}`;
      const caregiverUser = await tx.user.create({
        data: userFixtureData(
          caregiverAccount,
          'Task 4 Caregiver',
          `${runPrefix}_caregiver_password_hash`,
        ),
      });
      const doctor = await tx.doctorProfile.create({
        data: {
          userId: doctorUser.id,
          organizationId: organization.id,
          title: 'Task 4 Doctor',
          department: 'Rehabilitation',
        },
      });
      const patientUsers = await Promise.all([
        tx.user.create({
          data: userFixtureData(
            `${runPrefix}_patient_a`,
            'Task 4 Patient A',
            `${runPrefix}_patient_a_password_hash`,
          ),
        }),
        tx.user.create({
          data: userFixtureData(
            `${runPrefix}_patient_b`,
            'Task 4 Patient B',
            `${runPrefix}_patient_b_password_hash`,
          ),
        }),
      ]);
      const patients = await Promise.all(
        patientUsers.map((user, index) =>
          tx.patientProfile.create({
            data: patientFixtureData(
              user.id,
              doctor.id,
              `Task 4 Patient ${index + 1}`,
              60 + index,
            ),
          }),
        ),
      );
      const assessmentId = randomUUID();
      const assessment = await tx.assessmentRecord.create({
        data: {
          id: assessmentId,
          patientId: patients[0].id,
          assessmentType: 'task4_concurrency',
          source: 'task4_concurrency_test',
          resultEnvelope: encryptSensitiveJson(
            { scoreSummary: {}, rawInputSummary: {} },
            {
              tableName: 'assessment_record',
              recordId: assessmentId,
              fieldName: 'resultEnvelope',
            },
            testSensitiveEncryptionKey,
          ),
        },
      });
      const gameContent = await tx.gameContent.create({
        data: {
          code: `${runPrefix}_game`,
          name: 'Task 4 Concurrency Game',
          trainingTargets: ['task4'],
          tags: ['concurrency'],
          defaultDuration: 10,
          defaultDifficulty: 'moderate',
        },
      });
      const condition = await tx.collectionCondition.create({
        data: {
          code: `${runPrefix}_condition`,
          name: 'Task 4 Concurrency Condition',
        },
      });
      const protocolVersion = 'task4-v1';
      const protocol = await tx.collectionProtocol.create({
        data: {
          conditionId: condition.id,
          gameContentId: gameContent.id,
          code: `${runPrefix}_protocol`,
          name: 'Task 4 Concurrency Protocol',
          version: protocolVersion,
          runtimeType: 'unity_webgl',
        },
      });
      const basePlans = await Promise.all(
        patients.map((patient, index) =>
          tx.rehabPlan.create({
            data: {
              patientId: patient.id,
              doctorId: doctor.id,
              source: 'task4_concurrency_test',
              planName: `${runPrefix}_base_plan_${index + 1}`,
              status: 'draft',
              isCurrent: false,
              weekFrequency: 3,
              dailyDuration: 20,
              difficultyLadder: {},
              recommendationReason: 'Task 4 concurrency fixture',
            },
          }),
        ),
      );
      const planItems = await Promise.all(
        basePlans.map((plan, index) =>
          tx.rehabPlanItem.create({
            data: {
              rehabPlanId: plan.id,
              gameContentId: gameContent.id,
              sequence: 1,
              durationMinutes: 10,
              frequencyPerWeek: 3,
              difficulty: `task4_${index + 1}`,
            },
          }),
        ),
      );

      return {
        organizationId: organization.id,
        doctorUserId: doctorUser.id,
        adminUserId: adminUser.id,
        caregiverUserId: caregiverUser.id,
        caregiverAccount,
        createdCaregiverRoleDefinition: !existingCaregiverRole,
        doctorId: doctor.id,
        assessmentId: assessment.id,
        gameContentId: gameContent.id,
        conditionId: condition.id,
        protocolId: protocol.id,
        protocolVersion,
        patients: [
          {
            id: patients[0].id,
            userId: patientUsers[0].id,
            rehabPlanId: basePlans[0].id,
            planItemId: planItems[0].id,
          },
          {
            id: patients[1].id,
            userId: patientUsers[1].id,
            rehabPlanId: basePlans[1].id,
            planItemId: planItems[1].id,
          },
        ],
      };
    });
  }

  async function installCaregiverBarrier(
    mode: CaregiverBarrierMode,
    consentId: string,
  ) {
    const barrier = caregiverBarrierDefinition;
    const escapedConsentId = consentId.replaceAll("'", "''");
    const activationWait =
      mode === 'create-first'
        ? `
        WHILE (SELECT last_value FROM "${barrier.sequence}") < 2
          AND NOT EXISTS (
            SELECT 1
            FROM pg_stat_activity AS activity
            WHERE pg_backend_pid() = ANY(pg_blocking_pids(activity.pid))
          ) LOOP
          IF clock_timestamp() >= barrier_deadline THEN
            RAISE EXCEPTION 'Task 4 caregiver create-first barrier timed out';
          END IF;
          PERFORM pg_sleep(0.01);
        END LOOP;`
        : '';
    const revokeWait =
      mode === 'revoke-first'
        ? `
        WHILE (SELECT last_value FROM "${barrier.sequence}") < 2
          AND NOT EXISTS (
            SELECT 1
            FROM pg_stat_activity AS activity
            WHERE pg_backend_pid() = ANY(pg_blocking_pids(activity.pid))
          ) LOOP
          IF clock_timestamp() >= barrier_deadline THEN
            RAISE EXCEPTION 'Task 4 caregiver revoke-first barrier timed out';
          END IF;
          PERFORM pg_sleep(0.01);
        END LOOP;`
        : '';

    await dropCaregiverBarrier();
    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE "${barrier.sequence}" START WITH 1`,
    );
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${barrier.activationFunction}"()
      RETURNS trigger AS $$
      DECLARE
        barrier_deadline timestamptz := clock_timestamp() + interval '10 seconds';
      BEGIN
        IF OLD."authorizationStatus" = 'inactive'
          AND NEW."authorizationStatus" = 'active' THEN
          PERFORM nextval('"${barrier.sequence}"');
          ${activationWait}
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${barrier.revokeFunction}"()
      RETURNS trigger AS $$
      DECLARE
        barrier_deadline timestamptz := clock_timestamp() + interval '10 seconds';
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "consent_record"
          WHERE "id" = '${escapedConsentId}'
            AND "status" = 'revoked'
            AND "revokedAt" IS NOT NULL
        ) THEN
          PERFORM nextval('"${barrier.sequence}"');
          ${revokeWait}
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${barrier.revokeTrigger}"
      BEFORE UPDATE ON "caregiver_relation"
      FOR EACH STATEMENT EXECUTE FUNCTION "${barrier.revokeFunction}"()
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${barrier.activationTrigger}"
      AFTER UPDATE ON "caregiver_relation"
      FOR EACH ROW EXECUTE FUNCTION "${barrier.activationFunction}"()
    `);
  }

  async function waitForCaregiverBarrierEntry() {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const [state] = await prisma.$queryRawUnsafe<
        Array<{ is_called: boolean }>
      >(`SELECT is_called FROM "${caregiverBarrierDefinition.sequence}"`);
      if (state?.is_called) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Task 4 caregiver barrier was not reached.');
  }

  async function dropCaregiverBarrier() {
    const barrier = caregiverBarrierDefinition;
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${barrier.activationTrigger}" ON "caregiver_relation"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${barrier.revokeTrigger}" ON "caregiver_relation"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${barrier.activationFunction}"()`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${barrier.revokeFunction}"()`,
    );
    await prisma.$executeRawUnsafe(
      `DROP SEQUENCE IF EXISTS "${barrier.sequence}"`,
    );
  }

  async function installCasBarrier(kind: BarrierKind) {
    const barrier = barrierDefinitions[kind];
    await dropCasBarrier(kind);
    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE "${barrier.sequence}" START WITH 1`,
    );
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${barrier.function}"()
      RETURNS trigger AS $$
      DECLARE
        barrier_deadline timestamptz := clock_timestamp() + interval '10 seconds';
      BEGIN
        PERFORM nextval('"${barrier.sequence}"');
        WHILE (SELECT last_value FROM "${barrier.sequence}") < 2 LOOP
          IF clock_timestamp() >= barrier_deadline THEN
            RAISE EXCEPTION 'Task 4 ${kind} CAS barrier timed out';
          END IF;
          PERFORM pg_sleep(0.01);
        END LOOP;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${barrier.trigger}"
      BEFORE UPDATE ON "${barrier.table}"
      FOR EACH STATEMENT EXECUTE FUNCTION "${barrier.function}"()
    `);
  }

  async function dropCasBarrier(kind: BarrierKind) {
    const barrier = barrierDefinitions[kind];
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${barrier.trigger}" ON "${barrier.table}"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${barrier.function}"()`,
    );
    await prisma.$executeRawUnsafe(
      `DROP SEQUENCE IF EXISTS "${barrier.sequence}"`,
    );
  }

  async function cleanupDynamicRecords() {
    const current = fixtures;
    if (!current) return;

    const patientIds = current.patients.map(({ id }) => id);
    const actorIds = [
      current.doctorUserId,
      current.adminUserId,
      ...current.patients.map(({ userId }) => userId),
    ];
    await prisma.auditLog.deleteMany({
      where: { actorUserId: { in: actorIds } },
    });
    const sessions = await prisma.trainingSession.findMany({
      where: {
        patientId: { in: patientIds },
        idempotencyKey: { startsWith: runPrefix },
      },
      select: { id: true },
    });
    await prisma.trainingResult.deleteMany({
      where: { sessionId: { in: sessions.map(({ id }) => id) } },
    });
    await prisma.trainingSession.deleteMany({
      where: { id: { in: sessions.map(({ id }) => id) } },
    });
    await prisma.collectionBatch.deleteMany({
      where: {
        patientId: { in: patientIds },
        idempotencyKey: { startsWith: runPrefix },
      },
    });
    await prisma.riskGradeRecord.deleteMany({
      where: { patientId: { in: patientIds } },
    });
    await prisma.aiConversationSession.deleteMany({
      where: {
        patientId: { in: patientIds },
        provider: 'task4_concurrency_test',
      },
    });
    await prisma.rehabPlan.deleteMany({
      where: {
        patientId: { in: patientIds },
        planName: { startsWith: `${runPrefix}_concurrency_` },
      },
    });
    await prisma.registrationRequest.deleteMany({
      where: { account: { startsWith: runPrefix } },
    });
    await prisma.userRoleBinding.deleteMany({
      where: {
        userId: current.caregiverUserId,
        relatedObjectId: { in: patientIds },
      },
    });
    await prisma.caregiverRelation.deleteMany({
      where: { patientId: { in: patientIds } },
    });
    await prisma.consentRecord.deleteMany({
      where: { patientId: { in: patientIds } },
    });
  }

  async function cleanupBaseFixtures() {
    const current = fixtures;
    if (!current) return;

    const patientIds = current.patients.map(({ id }) => id);
    const planItemIds = current.patients.map(({ planItemId }) => planItemId);
    const rehabPlanIds = current.patients.map(({ rehabPlanId }) => rehabPlanId);
    const userIds = [
      current.doctorUserId,
      current.adminUserId,
      current.caregiverUserId,
      ...current.patients.map(({ userId }) => userId),
    ];
    await prisma.rehabPlanItem.deleteMany({
      where: { id: { in: planItemIds } },
    });
    await prisma.rehabPlan.deleteMany({
      where: { id: { in: rehabPlanIds } },
    });
    await prisma.assessmentRecord.deleteMany({
      where: { patientId: { in: patientIds } },
    });
    await prisma.patientProfile.deleteMany({
      where: { id: { in: patientIds } },
    });
    await prisma.doctorProfile.delete({ where: { id: current.doctorId } });
    await prisma.userRoleBinding.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (current.createdCaregiverRoleDefinition) {
      await prisma.roleDefinition.delete({ where: { code: 'caregiver' } });
    }
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
