import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuditResult,
  GameContent,
  Prisma,
  RiskLevel,
  RoleCode,
  TrainingResult,
  TrainingSessionStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { requireEnv } from './config';
import { RequestUser } from './current-user';
import { PrismaService } from './prisma.service';

const currentConsentVersion = 'v1.2';
const supportedFormalRuntimeTypes = [
  'unity_webgl',
  'browser_pose_game',
] as const;
const browserPoseGameRequiredMetricTypes = [
  'reaction_time_ms',
  'target_hit_rate',
  'pose_visibility_avg',
  'arm_raise_accuracy',
] as const;
const trainingReviewConclusions = [
  'confirmed_abnormal',
  'accepted_valid',
  'excluded_from_analysis',
  'needs_retrain',
] as const;
const clinicianAssessmentSources = [
  'clinician_input',
  'clinician_recorded_trial_assessment',
] as const;
const productionAiAssessmentSources = [
  'production_ai_assessment',
  'speech_ai_assessment',
] as const;
const allowedAssessmentSources = [
  ...clinicianAssessmentSources,
  ...productionAiAssessmentSources,
] as const;
const speechAiAssessmentSources = ['speech_ai_assessment'] as const;
const humanReviewConclusions = [
  'approved',
  'rejected',
  'needs_revision',
] as const;

type FormalRuntimeType = (typeof supportedFormalRuntimeTypes)[number];
type TrainingReviewConclusion = (typeof trainingReviewConclusions)[number];
type ProductionAiAssessmentSource =
  (typeof productionAiAssessmentSources)[number];

type LoginDto = {
  account: string;
  password: string;
};

type PatientDto = {
  account: string;
  initialPassword: string;
  name: string;
  gender: string;
  age: number;
  mobilePhone?: string;
  caregiverName?: string;
  caregiverPhone?: string;
  responsibleDoctorId?: string;
  healthMetrics?: Prisma.InputJsonValue;
};

type CaregiverAccountDto = {
  account: string;
  initialPassword: string;
  displayName: string;
  mobilePhone?: string;
};

type ConsentDto = {
  patientId: string;
  subjectUserId: string;
  consentType:
    | 'privacy_policy'
    | 'ai_processing'
    | 'camera_capture'
    | 'microphone_capture'
    | 'caregiver_sharing';
  consentVersion: string;
  evidenceSnapshot?: Prisma.InputJsonValue;
};

type CaregiverRelationDto = {
  caregiverAccount?: string;
  relation?: string;
  scope?: Prisma.InputJsonValue;
};

type AssessmentDto = {
  patientId: string;
  assessmentType?: string;
  scoreSummary?: Prisma.InputJsonValue;
  rawInputSummary?: Prisma.InputJsonValue;
};

type RecommendPlanDto = {
  patientId: string;
};

type ConfirmPlanDto = {
  dailyDuration: number;
  weekFrequency: number;
  adjustmentReason: string;
  difficultyLadder?: Prisma.InputJsonValue;
  itemAdjustments?: Array<{
    gameContentId: string;
    durationMinutes: number;
    frequencyPerWeek: number;
    difficulty: string;
  }>;
};

type StartTrainingDto = {
  patientId: string;
  rehabPlanId: string;
  planItemId: string;
  gameContentId: string;
  idempotencyKey?: string;
  gameRunId?: string;
  deviceCode?: string;
  calibrationStatus?: string;
  clientStartedAt?: string;
};

type SubmitTrainingResultDto = {
  score: number;
  completionRate: number;
  durationSeconds: number;
  reactionTimeMs: number;
  motionAccuracy: number;
  exerciseIntensity: string;
  metricsSummary?: Prisma.InputJsonValue;
  motionMetrics?: Array<{
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

type ReviewTrainingResultDto = {
  reviewConclusion?: string;
  reviewNote?: string;
};

type AuditLogQueryDto = {
  result?: string;
  actorRole?: string;
  actorUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  actorAccount?: string;
  from?: string;
  to?: string;
  dateFrom?: string;
  dateTo?: string;
  take?: string | number;
  limit?: string | number;
};

type ExportDataset =
  | 'patients'
  | 'assessments'
  | 'training-records'
  | 'consents'
  | 'audit-logs';

type ExportFormat = 'csv' | 'json';

type ExportDatasetQueryDto = {
  format?: string;
  reason?: string;
  dateFrom?: string;
  dateTo?: string;
  patientId?: string;
  riskLevel?: string;
  qualityFlag?: string;
  limit?: string | number;
};

type ExportFilters = {
  reason: string;
  dateFrom?: Date;
  dateTo?: Date;
  patientId?: string;
  riskLevel?: RiskLevel;
  qualityFlag?: string;
  limit: number;
};

type ExportCellValue = string | number | boolean | null;
type ExportRow = Record<string, ExportCellValue>;

type ExportPayload = {
  dataset: ExportDataset;
  format: ExportFormat;
  generatedAt: string;
  rowCount: number;
  columns: string[];
  rows: ExportRow[];
};

type AdminPermission =
  | 'dashboard.view'
  | 'audit.read'
  | 'data.export'
  | 'user.manage'
  | 'game.manage'
  | 'game.publish';

type UpdateUnityBuildDto = {
  manifestUrl?: string | null;
  buildBaseUrl?: string | null;
  gameVersion?: string | null;
  bridgeProtocolVersion?: string;
  buildStatus?: string;
  releaseChannel?: string;
  supportsCamera?: boolean;
  supportsMicrophone?: boolean;
  supportedInputModes?: unknown;
  requiredMetrics?: unknown;
};

type CreateGameContentDto = {
  code: string;
  name: string;
  runtimeType: string;
  gameVersion?: string | null;
  trainingTargets: unknown;
  tags: unknown;
  defaultDuration: number;
  defaultDifficulty: string;
  supportsCamera: boolean;
  supportsMicrophone: boolean;
  supportedInputModes: unknown;
  requiredMetrics: unknown;
};

type UpdateGameContentStatusDto = {
  status: string;
};

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { account: dto.account },
      include: { roleBindings: { where: { bindingStatus: 'active' } } },
    });

    if (!user || user.passwordHash !== this.hashPassword(dto.password)) {
      throw new UnauthorizedException('账号或密码错误');
    }

    if (user.accountStatus !== 'active') {
      throw new ForbiddenException('账号不可用');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: RequestUser = {
      id: user.id,
      account: user.account,
      displayName: user.displayName,
      roles: user.roleBindings.map((binding) => ({
        roleCode: binding.roleCode,
        relatedObjectType: binding.relatedObjectType,
        relatedObjectId: binding.relatedObjectId,
        organizationId: binding.organizationId ?? undefined,
      })),
    };

    if (!payload.roles.length) {
      throw new ForbiddenException('账号未绑定可用角色');
    }

    const accessToken = sign(payload, requireEnv('JWT_SECRET'), {
      expiresIn: '8h',
    });

    await this.audit(
      user.id,
      this.primaryRole(payload),
      'auth.login',
      'user',
      user.id,
      'success',
    );

    const context = await this.buildUserContext(payload);

    return {
      accessToken,
      user: payload,
      context,
    };
  }

  async me(user: RequestUser) {
    const roleCodes = user.roles.map((role) => role.roleCode);
    return {
      user,
      homePath: this.resolveHomePath(roleCodes),
      context: await this.buildUserContext(user),
    };
  }

  async createPatient(user: RequestUser, dto: PatientDto) {
    if (!this.hasAnyAdminRole(user)) {
      this.requireAnyRole(user, ['doctor']);
    }
    if (this.hasAnyAdminRole(user)) {
      this.requireAdminPermission(user, 'user.manage');
    }
    const account = this.validateAccount(dto.account);
    const initialPassword = this.validateInitialPassword(dto.initialPassword);
    const name = this.requiredString(dto.name, '患者姓名不能为空。');
    const gender = this.requiredString(dto.gender, '患者性别不能为空。');
    const age = this.requiredInteger(dto.age, '患者年龄不能为空。');
    this.assertRange(age, 1, 120, '患者年龄必须在 1 到 120 岁之间。');
    const mobilePhone = this.optionalString(
      dto.mobilePhone,
      '患者手机号必须是文本。',
    );
    const caregiverName = this.optionalString(
      dto.caregiverName,
      '照护人姓名必须是文本。',
    );
    const caregiverPhone = this.optionalString(
      dto.caregiverPhone,
      '照护人联系方式必须是文本。',
    );
    const healthMetrics =
      dto.healthMetrics === undefined
        ? {}
        : this.requiredJsonObject(
            dto.healthMetrics,
            '基础健康指标必须是结构化对象。',
          );
    const responsibleDoctorId = await this.resolveResponsibleDoctorId(
      user,
      dto.responsibleDoctorId,
    );

    await this.ensurePatientLoginAvailable(account, mobilePhone);

    const patient = await this.prisma
      .$transaction(async (tx) => {
        const patientUser = await tx.user.create({
          data: {
            account,
            passwordHash: this.hashPassword(initialPassword),
            displayName: name,
            mobilePhone,
          },
        });

        const patientProfile = await tx.patientProfile.create({
          data: {
            userId: patientUser.id,
            responsibleDoctorId,
            name,
            gender,
            age,
            mobilePhone,
            caregiverName,
            caregiverPhone,
            healthMetrics,
          },
        });

        await tx.userRoleBinding.create({
          data: {
            userId: patientUser.id,
            roleCode: 'patient',
            relatedObjectType: 'patient',
            relatedObjectId: patientProfile.id,
          },
        });

        return patientProfile;
      })
      .catch((error: unknown) => {
        if (this.isUniqueConstraintError(error)) {
          throw new BadRequestException('患者账号或手机号已存在。');
        }
        throw error;
      });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'patient.create',
      'patient_profile',
      patient.id,
      'success',
    );
    return patient;
  }

  async createCaregiverAccount(user: RequestUser, dto: CaregiverAccountDto) {
    this.requireAdminPermission(user, 'user.manage');
    const account = this.validateAccount(dto.account, '家属登录账号不能为空。');
    const initialPassword = this.validateInitialPassword(
      dto.initialPassword,
      '家属',
    );
    const displayName = this.requiredString(
      dto.displayName,
      '家属姓名不能为空。',
    );
    const mobilePhone = this.optionalString(
      dto.mobilePhone,
      '家属手机号必须是文本。',
    );

    await this.ensureCaregiverLoginAvailable(account, mobilePhone);

    const caregiver = await this.prisma.user
      .create({
        data: {
          account,
          passwordHash: this.hashPassword(initialPassword),
          displayName,
          mobilePhone,
        },
        select: {
          id: true,
          account: true,
          displayName: true,
          mobilePhone: true,
          accountStatus: true,
          createdAt: true,
        },
      })
      .catch((error: unknown) => {
        if (this.isUniqueConstraintError(error)) {
          throw new BadRequestException('家属账号或手机号已存在。');
        }
        throw error;
      });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'user.create.caregiver',
      'user',
      caregiver.id,
      'success',
    );

    return caregiver;
  }

  async getPatient(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'full');

    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      include: {
        responsibleDoctor: { include: { user: true } },
        riskGrades: { where: { isCurrent: true }, take: 1 },
        rehabPlans: {
          where: {
            OR: [{ isCurrent: true }, { status: 'pending_confirm' }],
          },
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          include: { items: { include: { gameContent: true } } },
        },
        trainingSessions: {
          orderBy: { startedAt: 'desc' },
          take: 5,
          include: { result: true, gameContent: true },
        },
        caregiverRelations: {
          where: {
            authorizationStatus: 'active',
            revokedAt: null,
          },
          orderBy: { authorizedAt: 'desc' },
          include: {
            caregiver: {
              select: {
                id: true,
                account: true,
                displayName: true,
                mobilePhone: true,
              },
            },
          },
        },
        assessments: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: { aiAnalyses: true },
        },
        consents: {
          orderBy: { grantedAt: 'desc' },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('患者不存在');
    }

    await this.audit(
      user.id,
      this.primaryRole(user),
      'patient.view',
      'patient_profile',
      patientId,
      'success',
    );
    return patient;
  }

  async createConsent(user: RequestUser, dto: ConsentDto) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: dto.patientId },
      select: { id: true, userId: true },
    });
    if (!patient) {
      throw new NotFoundException('患者不存在');
    }
    const subjectUserId = this.requiredString(
      dto.subjectUserId,
      '授权签署主体不能为空。',
    );
    if (subjectUserId !== patient.userId || subjectUserId !== user.id) {
      throw new ForbiddenException('仅患者本人账号可签署该患者授权。');
    }
    await this.assertPatientAccess(user, dto.patientId, 'full');
    const consentType = this.validateConsentType(dto.consentType);
    const consentVersion = this.requiredString(
      dto.consentVersion,
      '授权协议版本不能为空。',
    );
    if (consentVersion !== currentConsentVersion) {
      throw new BadRequestException(
        `授权协议版本必须为当前版本 ${currentConsentVersion}。`,
      );
    }
    const existingConsent = await this.prisma.consentRecord.findFirst({
      where: {
        patientId: dto.patientId,
        subjectUserId,
        consentType,
        consentVersion,
        status: 'granted',
        revokedAt: null,
      },
    });
    if (existingConsent) {
      throw new BadRequestException('该授权版本已签署，无需重复提交。');
    }

    const consent = await this.prisma.consentRecord.create({
      data: {
        patientId: dto.patientId,
        subjectUserId,
        consentType,
        consentVersion,
        evidenceSnapshot: this.requiredJsonObject(
          dto.evidenceSnapshot,
          '缺少授权证据快照，不能创建授权记录。',
        ),
      },
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'consent.grant',
      'consent_record',
      consent.id,
      'success',
    );
    return consent;
  }

  async revokeConsent(user: RequestUser, consentId: string) {
    const consent = await this.prisma.consentRecord.findUnique({
      where: { id: consentId },
      select: {
        id: true,
        patientId: true,
        subjectUserId: true,
        consentType: true,
        consentVersion: true,
        status: true,
        revokedAt: true,
      },
    });
    if (!consent) {
      throw new NotFoundException('授权记录不存在。');
    }
    if (consent.status !== 'granted' || consent.revokedAt) {
      throw new BadRequestException('授权记录已撤回，请勿重复操作。');
    }
    if (consent.consentVersion !== currentConsentVersion) {
      throw new BadRequestException(
        `只能撤回当前版本 ${currentConsentVersion} 的授权。`,
      );
    }

    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: consent.patientId },
      select: { id: true, userId: true },
    });
    if (!patient) {
      throw new NotFoundException('患者不存在');
    }
    if (patient.userId !== user.id || consent.subjectUserId !== user.id) {
      throw new ForbiddenException('仅患者本人账号可撤回该患者授权。');
    }
    await this.assertPatientSelf(user, consent.patientId);

    const revokedAt = new Date();
    const revoked = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.consentRecord.updateMany({
        where: {
          patientId: consent.patientId,
          subjectUserId: consent.subjectUserId,
          consentType: consent.consentType,
          consentVersion: currentConsentVersion,
          status: 'granted',
          revokedAt: null,
        },
        data: {
          status: 'revoked',
          revokedAt,
        },
      });
      if (!updated.count) {
        throw new BadRequestException('授权记录已撤回，请勿重复操作。');
      }
      return tx.consentRecord.findUnique({
        where: { id: consent.id },
      });
    });

    if (!revoked) {
      throw new NotFoundException('授权记录不存在。');
    }

    await this.audit(
      user.id,
      this.primaryRole(user),
      'consent.revoke',
      'consent_record',
      consent.id,
      'success',
      {
        patientId: consent.patientId,
        consentType: consent.consentType,
      },
    );

    return revoked;
  }

  async listCaregiverRelations(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'full');
    await this.assertCurrentConsent(patientId, 'caregiver_sharing');

    return this.prisma.caregiverRelation.findMany({
      where: {
        patientId,
        authorizationStatus: 'active',
        revokedAt: null,
      },
      orderBy: { authorizedAt: 'desc' },
      include: {
        caregiver: {
          select: {
            id: true,
            account: true,
            displayName: true,
            mobilePhone: true,
          },
        },
      },
    });
  }

  async createCaregiverRelation(
    user: RequestUser,
    patientId: string,
    dto: CaregiverRelationDto,
  ) {
    await this.assertPatientSelf(user, patientId);
    await this.assertCurrentConsent(patientId, 'caregiver_sharing');

    const caregiverAccount = this.validateAccount(
      dto.caregiverAccount,
      '家属登录账号不能为空。',
    );
    const relation = this.requiredString(dto.relation, '家属关系不能为空。');
    const scope = this.validateCaregiverScope(dto.scope);

    const caregiverUser = await this.prisma.user.findUnique({
      where: { account: caregiverAccount },
      select: {
        id: true,
        account: true,
        displayName: true,
        mobilePhone: true,
        accountStatus: true,
      },
    });
    if (!caregiverUser) {
      throw new BadRequestException('家属账号不存在，请先由管理员创建账号。');
    }
    if (caregiverUser.accountStatus !== 'active') {
      throw new ForbiddenException('家属账号不可用。');
    }
    if (caregiverUser.id === user.id) {
      throw new BadRequestException('患者本人账号不能绑定为家属。');
    }

    const relationRecord = await this.prisma.$transaction(async (tx) => {
      const record = await tx.caregiverRelation.upsert({
        where: {
          caregiverUserId_patientId: {
            caregiverUserId: caregiverUser.id,
            patientId,
          },
        },
        update: {
          relation,
          authorizationStatus: 'active',
          revokedAt: null,
          authorizedAt: new Date(),
          scope,
        },
        create: {
          caregiverUserId: caregiverUser.id,
          patientId,
          relation,
          authorizedAt: new Date(),
          scope,
        },
        include: {
          caregiver: {
            select: {
              id: true,
              account: true,
              displayName: true,
              mobilePhone: true,
            },
          },
        },
      });

      await tx.userRoleBinding.upsert({
        where: {
          userId_roleCode_relatedObjectId: {
            userId: caregiverUser.id,
            roleCode: 'caregiver',
            relatedObjectId: patientId,
          },
        },
        update: {
          relatedObjectType: 'patient',
          bindingStatus: 'active',
        },
        create: {
          userId: caregiverUser.id,
          roleCode: 'caregiver',
          relatedObjectType: 'patient',
          relatedObjectId: patientId,
          bindingStatus: 'active',
        },
      });

      return record;
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'caregiver_relation.create',
      'caregiver_relation',
      relationRecord.id,
      'success',
      {
        patientId,
        caregiverUserId: caregiverUser.id,
        scope,
      },
    );

    return relationRecord;
  }

  async revokeCaregiverRelation(
    user: RequestUser,
    patientId: string,
    relationId: string,
  ) {
    await this.assertPatientSelf(user, patientId);

    const relation = await this.prisma.caregiverRelation.findFirst({
      where: {
        id: relationId,
        patientId,
        authorizationStatus: 'active',
        revokedAt: null,
      },
      select: { id: true, caregiverUserId: true },
    });
    if (!relation) {
      throw new NotFoundException('家属绑定关系不存在或已撤回。');
    }

    const revoked = await this.prisma.$transaction(async (tx) => {
      const record = await tx.caregiverRelation.update({
        where: { id: relation.id },
        data: {
          authorizationStatus: 'inactive',
          revokedAt: new Date(),
        },
        include: {
          caregiver: {
            select: {
              id: true,
              account: true,
              displayName: true,
              mobilePhone: true,
            },
          },
        },
      });

      await tx.userRoleBinding.updateMany({
        where: {
          userId: relation.caregiverUserId,
          roleCode: 'caregiver',
          relatedObjectId: patientId,
        },
        data: { bindingStatus: 'inactive' },
      });

      return record;
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'caregiver_relation.revoke',
      'caregiver_relation',
      relation.id,
      'success',
      { patientId, caregiverUserId: relation.caregiverUserId },
    );

    return revoked;
  }

  async createAssessment(user: RequestUser, dto: AssessmentDto) {
    await this.assertPatientAccess(user, dto.patientId, 'full');

    await this.assertCurrentConsent(dto.patientId, 'privacy_policy');
    await this.assertCurrentConsent(dto.patientId, 'ai_processing');

    const assessmentType = this.requiredString(
      dto.assessmentType,
      '评估类型不能为空。',
    );
    const scoreSummary = this.requiredJsonObject(
      dto.scoreSummary,
      '缺少有效评估数据，请先完成 MMSE/CDR 量表或上传已批准的生产 AI 评估结果。',
    );
    this.validateAssessmentScoreSummary(scoreSummary);
    const rawInputSummary = this.requiredJsonObject(
      dto.rawInputSummary,
      '缺少评估分析结果，不能创建风险评级记录。',
    );
    const source = this.requiredString(
      rawInputSummary.source,
      '缺少评估来源，不能创建评估记录。',
    );
    const transcript = this.requiredString(
      rawInputSummary.transcript,
      '缺少语音转写或评估摘要，不能创建评估记录。',
    );
    const analysisSummary = this.requiredString(
      rawInputSummary.analysisSummary,
      '缺少 AI 分析摘要，不能创建风险评级记录。',
    );
    const modelVersion = this.requiredString(
      rawInputSummary.modelVersion,
      '缺少 AI 分析模型版本。',
    );
    const confidence = this.requiredNumber(
      rawInputSummary.confidence,
      '缺少 AI 分析置信度。',
    );
    this.assertRange(confidence, 0, 1, 'AI 分析置信度必须在 0 到 1 之间。');
    this.assertAllowedAssessmentSource(source);
    this.assertProductionAssessmentEvidence(rawInputSummary, source);
    if (this.isSpeechAiAssessmentSource(source)) {
      await this.assertCurrentConsent(dto.patientId, 'microphone_capture');
    }

    const riskLevel = this.calculateRiskLevel(scoreSummary);
    const reasonSummary = this.riskReason(riskLevel, scoreSummary);

    const assessment = await this.prisma.$transaction(async (tx) => {
      const record = await tx.assessmentRecord.create({
        data: {
          patientId: dto.patientId,
          assessmentType,
          source,
          scoreSummary,
          rawInputSummary,
          completedAt: new Date(),
        },
      });

      await tx.riskGradeRecord.updateMany({
        where: { patientId: dto.patientId, isCurrent: true },
        data: { isCurrent: false },
      });

      await tx.riskGradeRecord.create({
        data: {
          patientId: dto.patientId,
          assessmentId: record.id,
          riskLevel,
          systemRiskLevel: riskLevel,
          isCurrent: true,
          reasonSummary,
        },
      });

      await tx.aiAnalysisRecord.create({
        data: {
          patientId: dto.patientId,
          assessmentId: record.id,
          analysisScene: 'assessment_summary',
          modelVersion,
          confidence,
          inputSummary: rawInputSummary,
          outputSummary: {
            riskLevel,
            reasonSummary,
            transcript,
            analysisSummary,
          },
        },
      });

      return record;
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'assessment.create',
      'assessment_record',
      assessment.id,
      'success',
    );
    return assessment;
  }

  async listAssessments(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'full');
    return this.prisma.assessmentRecord.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      include: { riskGrades: true, aiAnalyses: true },
    });
  }

  async recommendPlan(user: RequestUser, dto: RecommendPlanDto) {
    await this.assertPatientAccess(user, dto.patientId, 'full');

    const currentRisk = await this.prisma.riskGradeRecord.findFirst({
      where: { patientId: dto.patientId, isCurrent: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!currentRisk) {
      throw new BadRequestException(
        '患者尚无当前风险评级，请先完成评估后再生成康复方案。',
      );
    }
    const candidateGames = await this.prisma.gameContent.findMany({
      where: {
        status: 'active',
        runtimeType: { in: [...supportedFormalRuntimeTypes] },
        buildStatus: 'released',
        gameVersion: { not: null },
        bridgeProtocolVersion: '1.0.0',
      },
      orderBy: { name: 'asc' },
    });
    const games = candidateGames.filter((game) =>
      this.isGameReadyForFormalTraining(game),
    );
    if (!games.length) {
      throw new BadRequestException(
        '没有已发布且配置完整的正式训练游戏，无法生成康复方案。',
      );
    }

    const selectedGames = games
      .map((game) => ({
        game,
        score: this.scoreGame(game.tags, currentRisk.riskLevel),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.rehabPlan.updateMany({
        where: {
          patientId: dto.patientId,
          status: 'pending_confirm',
        },
        data: { status: 'ended' },
      });

      return tx.rehabPlan.create({
        data: {
          patientId: dto.patientId,
          planName: '系统推荐个性化康复计划',
          status: 'pending_confirm',
          isCurrent: false,
          weekFrequency: currentRisk.riskLevel === 'high' ? 3 : 4,
          dailyDuration: currentRisk.riskLevel === 'high' ? 16 : 24,
          difficultyLadder: {
            mode: 'rule_based',
            firstWeek: currentRisk.riskLevel === 'high' ? 'low' : 'moderate',
          },
          recommendationReason:
            '根据认知评级、游戏标签和训练目标生成，可由医师调整。',
          items: {
            create: selectedGames.map(({ game }, index) => ({
              gameContentId: game.id,
              sequence: index + 1,
              durationMinutes: game.defaultDuration,
              frequencyPerWeek: index === 0 ? 5 : 3,
              difficulty: game.defaultDifficulty,
              adaptiveRules: {
                source: 'rule_based',
                increaseWhenAccuracyAbove: 0.9,
                reduceWhenMissesAbove: 5,
              },
            })),
          },
        },
        include: { items: { include: { gameContent: true } } },
      });
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'rehab_plan.recommend',
      'rehab_plan',
      plan.id,
      'success',
    );
    return plan;
  }

  async confirmPlan(user: RequestUser, planId: string, dto: ConfirmPlanDto) {
    if (!this.hasAnyAdminRole(user)) {
      this.requireAnyRole(user, ['doctor']);
    }
    if (this.hasAnyAdminRole(user)) {
      this.requireAdminPermission(user, 'user.manage');
    }

    const plan = await this.prisma.rehabPlan.findUnique({
      where: { id: planId },
      include: { patient: true, items: true },
    });
    if (!plan) throw new NotFoundException('计划不存在');
    await this.assertPatientAccess(user, plan.patientId, 'full');

    const actingDoctorId = this.resolveDoctorIdForPlan(user, plan.patient);

    const confirmed = await this.prisma.$transaction(async (tx) => {
      await tx.rehabPlan.updateMany({
        where: { patientId: plan.patientId, isCurrent: true },
        data: { isCurrent: false, status: 'ended' },
      });
      await tx.rehabPlan.updateMany({
        where: {
          patientId: plan.patientId,
          status: 'pending_confirm',
          id: { not: planId },
        },
        data: { status: 'ended' },
      });

      const difficultyLadder = this.jsonInput(
        dto.difficultyLadder ?? plan.difficultyLadder ?? {},
      );

      const updated = await tx.rehabPlan.update({
        where: { id: planId },
        data: {
          doctorId: actingDoctorId,
          dailyDuration: dto.dailyDuration,
          weekFrequency: dto.weekFrequency,
          difficultyLadder,
          status: 'active',
          isCurrent: true,
          confirmedAt: new Date(),
        },
        include: { items: { include: { gameContent: true } } },
      });

      if (dto.itemAdjustments?.length) {
        for (const item of dto.itemAdjustments) {
          await tx.rehabPlanItem.updateMany({
            where: { rehabPlanId: planId, gameContentId: item.gameContentId },
            data: {
              durationMinutes: item.durationMinutes,
              frequencyPerWeek: item.frequencyPerWeek,
              difficulty: item.difficulty,
            },
          });
        }
      }

      await tx.planAdjustmentRecord.create({
        data: {
          rehabPlanId: planId,
          doctorId: actingDoctorId,
          originalSnapshot: {
            dailyDuration: plan.dailyDuration,
            weekFrequency: plan.weekFrequency,
            difficultyLadder: this.jsonInput(plan.difficultyLadder ?? {}),
            items: plan.items,
          },
          adjustedSnapshot: {
            dailyDuration: dto.dailyDuration,
            weekFrequency: dto.weekFrequency,
            difficultyLadder,
            itemAdjustments: dto.itemAdjustments ?? [],
          },
          adjustmentReason: dto.adjustmentReason,
        },
      });

      return updated;
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'rehab_plan.confirm',
      'rehab_plan',
      planId,
      'success',
    );
    return confirmed;
  }

  async startTrainingSession(user: RequestUser, dto: StartTrainingDto) {
    await this.assertTrainingWriteAccess(user, dto.patientId);
    await this.assertCurrentConsent(dto.patientId, 'privacy_policy');
    await this.assertCurrentConsent(dto.patientId, 'camera_capture');

    const planItem = await this.prisma.rehabPlanItem.findFirst({
      where: {
        id: dto.planItemId,
        rehabPlanId: dto.rehabPlanId,
        gameContentId: dto.gameContentId,
        rehabPlan: {
          patientId: dto.patientId,
          status: 'active',
          isCurrent: true,
        },
      },
      include: { gameContent: true },
    });
    if (!planItem) {
      throw new BadRequestException('训练项目不属于当前生效计划');
    }
    this.assertGameReadyForFormalTraining(planItem.gameContent);

    const runtimeContext = this.buildTrainingRuntimeContext(
      dto,
      planItem.gameContent,
    );

    const session = dto.idempotencyKey
      ? await this.prisma.trainingSession.upsert({
          where: { idempotencyKey: dto.idempotencyKey },
          update: {},
          create: {
            patientId: dto.patientId,
            rehabPlanId: dto.rehabPlanId,
            planItemId: dto.planItemId,
            gameContentId: dto.gameContentId,
            idempotencyKey: dto.idempotencyKey,
            ...runtimeContext,
            sessionStatus: 'in_progress',
          },
        })
      : await this.prisma.trainingSession.create({
          data: {
            patientId: dto.patientId,
            rehabPlanId: dto.rehabPlanId,
            planItemId: dto.planItemId,
            gameContentId: dto.gameContentId,
            ...runtimeContext,
            sessionStatus: 'in_progress',
          },
        });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'training_session.start',
      'training_session',
      session.id,
      'success',
    );
    return session;
  }

  async submitTrainingResult(
    user: RequestUser,
    sessionId: string,
    dto: SubmitTrainingResultDto,
  ) {
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: { result: true, gameContent: true },
    });
    if (!session) throw new NotFoundException('训练会话不存在');

    await this.assertTrainingWriteAccess(user, session.patientId);
    await this.assertCurrentConsent(session.patientId, 'privacy_policy');
    await this.assertCurrentConsent(session.patientId, 'camera_capture');

    if (session.result) {
      throw new BadRequestException('该训练会话已提交结果，请勿重复回传。');
    }

    this.validateTrainingResult(dto);
    const metricsSummary = this.requiredJsonObject(
      dto.metricsSummary,
      '缺少真实训练结果，请完成体感游戏后再回传。',
    );
    const resultSource = this.requiredString(
      metricsSummary.source,
      '缺少训练结果来源，请由体感游戏回传结构化结果。',
    );
    if (/demo|mock/i.test(resultSource)) {
      throw new BadRequestException(
        '训练结果来源不能使用 demo/mock 标记，请接入真实采集结果后再回传。',
      );
    }
    this.assertTrainingResultSourceMatchesRuntime(
      resultSource,
      session.gameContent.runtimeType,
    );
    const gameRunId = this.requiredString(
      metricsSummary.gameRunId,
      '缺少游戏运行批次 ID，请由训练过程回传 gameRunId。',
    );
    if (session.gameRunId !== gameRunId) {
      throw new BadRequestException(
        '训练结果 gameRunId 与当前训练会话不一致。',
      );
    }
    const gameVersion = this.requiredString(
      metricsSummary.gameVersion,
      '缺少游戏版本，请由训练过程回传 gameVersion。',
    );
    const expectedGameVersion =
      session.gameContent.runtimeType === 'unity_webgl'
        ? session.unityBuildVersion
        : session.gameContent.gameVersion;
    if (expectedGameVersion && expectedGameVersion !== gameVersion) {
      throw new BadRequestException('训练结果 gameVersion 与会话版本不一致。');
    }
    const protocolVersion = this.requiredString(
      metricsSummary.protocolVersion,
      '缺少桥接协议版本，请由训练过程回传 protocolVersion。',
    );
    if (session.bridgeProtocolVersion !== protocolVersion) {
      throw new BadRequestException('训练结果桥接协议版本与会话不一致。');
    }
    const clientGeneratedAt = this.parseDate(
      this.requiredString(
        metricsSummary.clientGeneratedAt,
        '缺少客户端结果生成时间。',
      ),
      '客户端结果生成时间无效。',
    );
    const rawPayloadHash = this.requiredString(
      metricsSummary.rawPayloadHash,
      '缺少训练结果 payload 哈希，请由训练过程生成后回传。',
    );
    if (!dto.motionMetrics?.length) {
      throw new BadRequestException(
        '缺少动作识别指标，请完成体感游戏后再回传。',
      );
    }
    this.assertBrowserPoseResultMetrics(
      session.gameContent.runtimeType,
      dto.motionMetrics,
    );
    const motionMetrics = dto.motionMetrics.map((metric) => {
      const metricType = this.requiredString(
        metric.metricType,
        '动作指标类型不能为空。',
      );
      const metricValue = this.requiredNumber(
        metric.metricValue,
        '动作指标数值不能为空。',
      );
      const confidence =
        metric.confidence === undefined
          ? undefined
          : this.requiredNumber(metric.confidence, '动作指标置信度无效。');
      if (confidence !== undefined) {
        this.assertRange(
          confidence,
          0,
          1,
          '动作指标置信度必须在 0 到 1 之间。',
        );
      }
      const rawSummary =
        metric.rawSummary === undefined
          ? undefined
          : this.requiredJsonObject(
              metric.rawSummary,
              '动作指标摘要必须是对象。',
            );
      const unit = this.optionalString(metric.unit, '动作指标单位必须是文本。');
      const sampleCount =
        metric.sampleCount === undefined
          ? undefined
          : this.requiredInteger(
              metric.sampleCount,
              '动作指标采样数必须是整数。',
            );
      if (sampleCount !== undefined && sampleCount <= 0) {
        throw new BadRequestException('动作指标采样数必须大于 0。');
      }
      const windowStartedAt = metric.windowStartedAt
        ? this.parseDate(metric.windowStartedAt, '动作指标窗口开始时间无效。')
        : undefined;
      const windowEndedAt = metric.windowEndedAt
        ? this.parseDate(metric.windowEndedAt, '动作指标窗口结束时间无效。')
        : undefined;
      if (
        windowStartedAt &&
        windowEndedAt &&
        windowStartedAt.getTime() > windowEndedAt.getTime()
      ) {
        throw new BadRequestException('动作指标窗口开始时间不能晚于结束时间。');
      }
      const qualityFlag =
        this.optionalString(
          metric.qualityFlag,
          '动作指标质量标记必须是文本。',
        ) ?? 'valid';
      const bodyPart = this.optionalString(
        metric.bodyPart,
        '身体部位必须是文本。',
      );
      const jointName = this.optionalString(
        metric.jointName,
        '关节点名称必须是文本。',
      );
      return {
        metricType,
        metricValue,
        unit,
        confidence,
        sampleCount,
        windowStartedAt,
        windowEndedAt,
        qualityFlag,
        bodyPart,
        jointName,
        rawSummary,
      };
    });
    const quality = this.evaluateTrainingQuality(dto);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.trainingSession.update({
        where: { id: sessionId },
        data: {
          sessionStatus: quality.sessionStatus,
          syncStatus:
            quality.sessionStatus === 'completed' ? 'synced' : 'failed',
          clientEndedAt: clientGeneratedAt,
          endedAt: new Date(),
          interruptReason: quality.reason,
          uploadAttemptCount: { increment: 1 },
        },
      });

      const created = await tx.trainingResult.create({
        data: {
          sessionId,
          source: resultSource,
          gameRunId,
          gameVersion,
          bridgeProtocolVersion: protocolVersion,
          submittedByUserId: user.id,
          submittedAt: new Date(),
          clientGeneratedAt,
          rawPayloadHash,
          score: dto.score,
          completionRate: dto.completionRate,
          durationSeconds: dto.durationSeconds,
          reactionTimeMs: dto.reactionTimeMs,
          motionAccuracy: dto.motionAccuracy,
          exerciseIntensity: dto.exerciseIntensity,
          abnormalFlag: quality.abnormalFlag,
          qualityFlag: quality.qualityFlag,
          qualityReasons: quality.qualityReasons,
          metricsSummary,
        },
      });

      await tx.motionMetric.createMany({
        data: motionMetrics.map((metric) => ({
          trainingSessionId: sessionId,
          gameRunId,
          source: resultSource,
          metricType: metric.metricType,
          metricValue: metric.metricValue,
          unit: metric.unit,
          confidence: metric.confidence,
          sampleCount: metric.sampleCount,
          windowStartedAt: metric.windowStartedAt,
          windowEndedAt: metric.windowEndedAt,
          qualityFlag: metric.qualityFlag,
          bodyPart: metric.bodyPart,
          jointName: metric.jointName,
          ...(metric.rawSummary ? { rawSummary: metric.rawSummary } : {}),
        })),
      });

      return created;
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      'training_result.submit',
      'training_session',
      sessionId,
      'success',
      quality,
    );
    return result;
  }

  async listTrainingRecords(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'full');
    const sessions = await this.prisma.trainingSession.findMany({
      where: { patientId },
      orderBy: { startedAt: 'desc' },
      include: { result: true, gameContent: true, motionMetrics: true },
    });

    const validResults = sessions
      .filter((session) => this.hasCompletedTrainingResult(session))
      .map((session) => session.result)
      .filter((result): result is NonNullable<typeof result> =>
        Boolean(result),
      );

    return {
      sessions,
      summary: {
        totalSessions: sessions.length,
        completedSessions: sessions.filter((session) =>
          this.hasCompletedTrainingResult(session),
        ).length,
        averageScore: validResults.length
          ? Math.round(
              validResults.reduce((sum, result) => sum + result.score, 0) /
                validResults.length,
            )
          : 0,
        abnormalCount: validResults.filter((result) => result.abnormalFlag)
          .length,
      },
    };
  }

  async reviewTrainingResult(
    user: RequestUser,
    resultId: string,
    dto: ReviewTrainingResultDto,
  ) {
    const reviewConclusion = this.validateTrainingReviewConclusion(
      dto.reviewConclusion,
    );
    const reviewNote = this.requiredString(
      dto.reviewNote,
      '训练复核说明不能为空。',
    );

    const result = await this.prisma.trainingResult.findUnique({
      where: { id: resultId },
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
    if (!result) throw new NotFoundException('训练结果不存在');
    this.assertTrainingResultRequiresReview(result);
    this.assertTrainingResultNotReviewed(result);

    await this.assertTrainingReviewAccess(user, result.session.patient);

    const reviewed = await this.prisma.trainingResult.update({
      where: { id: resultId },
      data: {
        reviewStatus: 'reviewed',
        reviewConclusion,
        reviewNote,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
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

    await this.audit(
      user.id,
      this.primaryRole(user),
      'training_result.review',
      'training_result',
      resultId,
      'success',
      {
        patientId: result.session.patientId,
        sessionId: result.sessionId,
        reviewConclusion,
      },
    );

    return reviewed;
  }

  async caregiverSummary(user: RequestUser, patientId: string) {
    await this.assertPatientAccess(user, patientId, 'summary');
    const caregiverRelation = await this.findActiveCaregiverAuthorization(
      user.id,
      patientId,
    );
    if (!caregiverRelation) {
      throw new ForbiddenException('缺少有效家属共享授权。');
    }
    const caregiverScope = this.validateCaregiverScope(caregiverRelation.scope);

    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      include: {
        riskGrades: { where: { isCurrent: true }, take: 1 },
        rehabPlans: {
          where: { isCurrent: true },
          include: { items: { include: { gameContent: true } } },
          take: 1,
        },
        trainingSessions: {
          orderBy: { startedAt: 'desc' },
          take: 7,
          include: { result: true, gameContent: true },
        },
      },
    });

    if (!patient) throw new NotFoundException('患者不存在');
    const currentRisk = patient.riskGrades[0]?.riskLevel;

    await this.audit(
      user.id,
      'caregiver',
      'caregiver.summary.view',
      'patient_profile',
      patientId,
      'success',
    );

    return {
      patient: {
        id: patient.id,
        name: this.maskName(patient.name),
        age: patient.age,
      },
      currentRisk: currentRisk ?? null,
      currentPlan: patient.rehabPlans[0],
      recentTraining: patient.trainingSessions.map((session) => ({
        id: session.id,
        patientId: session.patientId,
        rehabPlanId: session.rehabPlanId,
        planItemId: session.planItemId,
        gameContentId: session.gameContentId,
        sessionStatus: session.sessionStatus,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        gameContent: session.gameContent,
        result: session.result
          ? {
              id: session.result.id,
              score: session.result.score,
              completionRate: session.result.completionRate,
              durationSeconds: session.result.durationSeconds,
              reactionTimeMs: session.result.reactionTimeMs,
              motionAccuracy: session.result.motionAccuracy,
              exerciseIntensity: session.result.exerciseIntensity,
              abnormalFlag: session.result.abnormalFlag,
              qualityFlag: session.result.qualityFlag,
              createdAt: session.result.createdAt,
            }
          : null,
      })),
      permissions: {
        rawAssessment: caregiverScope.rawAssessment,
        planEdit: caregiverScope.planEdit,
        fullMedicalRecord: false,
      },
    };
  }

  async auditLogs(user: RequestUser, query: AuditLogQueryDto = {}) {
    this.requireAdminPermission(user, 'audit.read');
    const where = this.buildAuditLogWhere(query);
    const take = this.resolveAuditLogTake(query.take ?? query.limit);
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: { actor: { select: { displayName: true, account: true } } },
    });
  }

  async exportDataset(
    user: RequestUser,
    datasetParam: string,
    query: ExportDatasetQueryDto = {},
  ) {
    const actorRole = this.primaryRole(user);
    const requestedDataset = this.safeExportTargetId(datasetParam);
    const reasonHash = this.exportReasonHash(query.reason);

    if (!this.hasAdminPermission(user, 'data.export')) {
      await this.audit(
        user.id,
        actorRole,
        'data.export',
        'data_export',
        requestedDataset,
        'denied',
        {
          requestedDatasetKnown: requestedDataset !== 'invalid_dataset',
          reasonHash,
          stage: 'authorization',
          desensitized: true,
        },
      );
      throw new ForbiddenException('角色权限不足');
    }

    let dataset: ExportDataset | undefined;
    let format: ExportFormat | undefined;
    let filters: ExportFilters | undefined;
    let stage: 'validation' | 'query' = 'validation';
    let payload: ExportPayload;

    try {
      dataset = this.validateExportDataset(datasetParam);
      format = this.resolveExportFormat(query.format);
      filters = this.resolveExportFilters(query);
      stage = 'query';
      payload = await this.buildExportPayload(dataset, format, filters);
    } catch (error) {
      await this.audit(
        user.id,
        actorRole,
        'data.export',
        'data_export',
        dataset ?? requestedDataset,
        'failed',
        {
          requestedDatasetKnown: requestedDataset !== 'invalid_dataset',
          format: format ?? null,
          filters: filters ? this.exportAuditFilters(filters) : null,
          reasonHash,
          stage,
          errorType: this.safeErrorType(error),
          desensitized: true,
        },
      );
      throw error;
    }

    await this.audit(
      user.id,
      actorRole,
      'data.export',
      'data_export',
      dataset,
      'success',
      {
        format,
        filters: this.exportAuditFilters(filters),
        rowCount: payload.rowCount,
        columns: payload.columns,
        desensitized: true,
        reasonProvided: true,
        reasonLength: filters.reason.length,
        reasonHash,
      },
    );

    if (format === 'csv') {
      return {
        format,
        filename: this.exportFilename(dataset),
        content: this.toCsv(payload.columns, payload.rows),
        payload,
      };
    }

    return {
      format,
      filename: this.exportFilename(dataset, 'json'),
      content: JSON.stringify(payload),
      payload,
    };
  }

  async dashboard(user: RequestUser) {
    if (!this.hasAnyAdminRole(user)) {
      this.requireAnyRole(user, ['doctor']);
    }
    const isAdmin = this.hasAnyAdminRole(user);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const doctorIds = user.roles
      .filter((role) => role.roleCode === 'doctor')
      .map((role) => role.relatedObjectId);
    const patientWhere: Prisma.PatientProfileWhereInput = isAdmin
      ? {}
      : { responsibleDoctorId: { in: doctorIds } };
    const relatedPatients = await this.prisma.patientProfile.findMany({
      where: patientWhere,
      select: { id: true, userId: true },
    });
    const patientIds = relatedPatients.map((patient) => patient.id);
    const patientUserIds = relatedPatients.map((patient) => patient.userId);
    const scopedPatientFilter: Prisma.AssessmentRecordWhereInput = isAdmin
      ? {}
      : { patientId: { in: patientIds } };
    const scopedPlanFilter: Prisma.RehabPlanWhereInput = isAdmin
      ? {}
      : { patientId: { in: patientIds } };
    const scopedSessionFilter: Prisma.TrainingSessionWhereInput = isAdmin
      ? {}
      : { patientId: { in: patientIds } };
    const scopedConsentFilter: Prisma.ConsentRecordWhereInput = isAdmin
      ? {}
      : { patientId: { in: patientIds } };
    const scopedRiskFilter: Prisma.RiskGradeRecordWhereInput = isAdmin
      ? { isCurrent: true }
      : { patientId: { in: patientIds }, isCurrent: true };
    const scopedTrainingResultFilter: Prisma.TrainingResultWhereInput = isAdmin
      ? {}
      : { session: { patientId: { in: patientIds } } };

    const [assessmentIds, planIds, sessionRecords, consentIds] = isAdmin
      ? [[], [], [], []]
      : await Promise.all([
          this.prisma.assessmentRecord
            .findMany({
              where: { patientId: { in: patientIds } },
              select: { id: true },
            })
            .then((records) => records.map((record) => record.id)),
          this.prisma.rehabPlan
            .findMany({
              where: { patientId: { in: patientIds } },
              select: { id: true },
            })
            .then((records) => records.map((record) => record.id)),
          this.prisma.trainingSession
            .findMany({
              where: { patientId: { in: patientIds } },
              select: { id: true, deviceId: true },
            })
            .then((records) => records),
          this.prisma.consentRecord
            .findMany({
              where: { patientId: { in: patientIds } },
              select: { id: true },
            })
            .then((records) => records.map((record) => record.id)),
        ]);
    const sessionIds = sessionRecords.map((record) => record.id);
    const scopedDeviceIds = Array.from(
      new Set(
        sessionRecords
          .map((record) => record.deviceId)
          .filter((deviceId): deviceId is string => Boolean(deviceId)),
      ),
    );
    const scopedDeviceFilter: Prisma.DeviceRegistryWhereInput = isAdmin
      ? {}
      : { id: { in: scopedDeviceIds } };
    const auditWhere: Prisma.AuditLogWhereInput = isAdmin
      ? {}
      : {
          OR: [
            { actorUserId: user.id },
            { targetType: 'patient_profile', targetId: { in: patientIds } },
            {
              targetType: 'assessment_record',
              targetId: { in: assessmentIds },
            },
            { targetType: 'rehab_plan', targetId: { in: planIds } },
            {
              targetType: 'training_session',
              targetId: { in: sessionIds },
            },
            { targetType: 'consent_record', targetId: { in: consentIds } },
          ],
        };
    const userWhere: Prisma.UserWhereInput = isAdmin
      ? {}
      : {
          OR: [
            { id: { in: patientUserIds } },
            {
              roleBindings: {
                some: {
                  roleCode: 'doctor',
                  relatedObjectId: { in: doctorIds },
                },
              },
            },
            {
              caregiverRelations: {
                some: {
                  patientId: { in: patientIds },
                  authorizationStatus: 'active',
                  revokedAt: null,
                },
              },
            },
          ],
        };

    const [
      users,
      activeUsers,
      patients,
      doctors,
      caregiverRelations,
      assessments,
      todayAssessments,
      trainings,
      todayTrainings,
      completedTrainings,
      activePlans,
      pendingPlans,
      consentRecords,
      deviceTotal,
      deviceOnline,
      abnormalResults,
      deniedAudits,
      failedAudits,
      qualityAggregate,
      riskRows,
      planStatusRows,
      sessionStatusRows,
      consentStatusRows,
      consentTypeRows,
      deviceStatusRows,
      qualityFlagRows,
      auditResultRows,
      recentActionRows,
      auditLogs,
    ] = await Promise.all([
      this.prisma.user.count({ where: userWhere }),
      this.prisma.user.count({
        where: { ...userWhere, accountStatus: 'active' },
      }),
      this.prisma.patientProfile.count({ where: patientWhere }),
      isAdmin
        ? this.prisma.doctorProfile.count()
        : Promise.resolve(doctorIds.length),
      this.prisma.caregiverRelation.count({
        where: isAdmin
          ? { authorizationStatus: 'active', revokedAt: null }
          : {
              patientId: { in: patientIds },
              authorizationStatus: 'active',
              revokedAt: null,
            },
      }),
      this.prisma.assessmentRecord.count({ where: scopedPatientFilter }),
      this.prisma.assessmentRecord.count({
        where: { ...scopedPatientFilter, createdAt: { gte: todayStart } },
      }),
      this.prisma.trainingSession.count({ where: scopedSessionFilter }),
      this.prisma.trainingSession.count({
        where: { ...scopedSessionFilter, startedAt: { gte: todayStart } },
      }),
      this.prisma.trainingSession.count({
        where: { ...scopedSessionFilter, sessionStatus: 'completed' },
      }),
      this.prisma.rehabPlan.count({
        where: { ...scopedPlanFilter, status: 'active', isCurrent: true },
      }),
      this.prisma.rehabPlan.count({
        where: { ...scopedPlanFilter, status: 'pending_confirm' },
      }),
      this.prisma.consentRecord.count({ where: scopedConsentFilter }),
      this.prisma.deviceRegistry.count({ where: scopedDeviceFilter }),
      this.prisma.deviceRegistry.count({
        where: { ...scopedDeviceFilter, status: 'online' },
      }),
      this.prisma.trainingResult.count({
        where: { ...scopedTrainingResultFilter, abnormalFlag: true },
      }),
      this.prisma.auditLog.count({
        where: { ...auditWhere, result: 'denied' },
      }),
      this.prisma.auditLog.count({
        where: { ...auditWhere, result: 'failed' },
      }),
      this.prisma.trainingResult.aggregate({
        where: scopedTrainingResultFilter,
        _avg: {
          score: true,
          completionRate: true,
          durationSeconds: true,
          motionAccuracy: true,
          reactionTimeMs: true,
        },
      }),
      this.prisma.riskGradeRecord.groupBy({
        by: ['riskLevel'],
        where: scopedRiskFilter,
        _count: { _all: true },
      }),
      this.prisma.rehabPlan.groupBy({
        by: ['status'],
        where: scopedPlanFilter,
        _count: { _all: true },
      }),
      this.prisma.trainingSession.groupBy({
        by: ['sessionStatus'],
        where: scopedSessionFilter,
        _count: { _all: true },
      }),
      this.prisma.consentRecord.groupBy({
        by: ['status'],
        where: scopedConsentFilter,
        _count: { _all: true },
      }),
      this.prisma.consentRecord.groupBy({
        by: ['consentType', 'status'],
        where: scopedConsentFilter,
        _count: { _all: true },
      }),
      this.prisma.deviceRegistry.groupBy({
        by: ['status'],
        where: scopedDeviceFilter,
        _count: { _all: true },
      }),
      this.prisma.trainingResult.groupBy({
        by: ['qualityFlag'],
        where: scopedTrainingResultFilter,
        _count: { _all: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ['result'],
        where: auditWhere,
        _count: { _all: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: auditWhere,
        _count: { _all: true },
      }),
      this.prisma.auditLog.findMany({
        where: auditWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { actor: { select: { displayName: true, account: true } } },
      }),
    ]);
    const onlineRate = deviceTotal
      ? `${Math.round((deviceOnline / deviceTotal) * 100)}%`
      : '0%';
    const toCountRows = <T extends Record<string, unknown>, K extends keyof T>(
      rows: Array<T & { _count: { _all: number } }>,
      key: K,
    ) =>
      rows.map((row) => ({
        key: String(row[key]),
        count: row._count._all,
      }));

    return {
      scope: {
        role: isAdmin ? (this.primaryRole(user) ?? 'admin') : 'doctor',
        doctorIds,
        patientIds: isAdmin ? [] : patientIds,
      },
      metrics: {
        users,
        patients,
        doctors,
        assessments,
        trainings,
        activePlans,
        pendingPlans,
        abnormalResults,
        onlineRate,
      },
      overview: {
        activeUsers,
        caregiverRelations,
        completedTrainings,
        todayAssessments,
        todayTrainings,
        consentRecords,
        deniedAudits,
        failedAudits,
      },
      distributions: {
        riskLevels: toCountRows(riskRows, 'riskLevel'),
        planStatuses: toCountRows(planStatusRows, 'status'),
        sessionStatuses: toCountRows(sessionStatusRows, 'sessionStatus'),
        consentStatuses: toCountRows(consentStatusRows, 'status'),
        deviceStatuses: toCountRows(deviceStatusRows, 'status'),
        qualityFlags: toCountRows(qualityFlagRows, 'qualityFlag'),
        auditResults: toCountRows(auditResultRows, 'result'),
      },
      quality: {
        averageScore:
          qualityAggregate._avg.score === null
            ? null
            : Math.round(qualityAggregate._avg.score),
        averageCompletionRate: qualityAggregate._avg.completionRate,
        averageDurationSeconds:
          qualityAggregate._avg.durationSeconds === null
            ? null
            : Math.round(qualityAggregate._avg.durationSeconds),
        averageMotionAccuracy: qualityAggregate._avg.motionAccuracy,
        averageReactionTimeMs:
          qualityAggregate._avg.reactionTimeMs === null
            ? null
            : Math.round(qualityAggregate._avg.reactionTimeMs),
      },
      devices: {
        total: deviceTotal,
        online: deviceOnline,
        offline: Math.max(deviceTotal - deviceOnline, 0),
        onlineRate,
      },
      consents: {
        total: consentRecords,
        byType: consentTypeRows.map((row) => ({
          consentType: row.consentType,
          status: row.status,
          count: row._count._all,
        })),
      },
      recentActions: recentActionRows
        .map((row) => ({
          action: row.action,
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      auditLogs,
    };
  }

  async listGameContents(user: RequestUser) {
    if (!this.hasAnyAdminRole(user)) {
      throw new ForbiddenException('仅后台账号可查看游戏内容配置。');
    }
    this.requireAdminPermission(user, 'dashboard.view');
    return this.prisma.gameContent.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async createGameContent(user: RequestUser, dto: CreateGameContentDto) {
    this.requireAdminPermission(user, 'game.manage');

    const code = this.validateGameCode(dto.code);
    const name = this.requiredString(dto.name, '游戏名称不能为空。');
    const runtimeType = this.validateFormalRuntimeType(dto.runtimeType);
    const trainingTargets = this.validateStringArray(
      dto.trainingTargets,
      'trainingTargets 必须是非空字符串数组。',
    );
    const tags = this.validateStringArray(
      dto.tags,
      'tags 必须是非空字符串数组。',
    );
    const defaultDuration = this.requiredInteger(
      dto.defaultDuration,
      '默认训练时长必须是整数分钟。',
    );
    this.assertRange(
      defaultDuration,
      1,
      180,
      '默认训练时长必须在 1 到 180 分钟之间。',
    );
    const defaultDifficulty = this.requiredString(
      dto.defaultDifficulty,
      '默认难度不能为空。',
    );
    const supportsCamera = this.requiredBoolean(
      dto.supportsCamera,
      'supportsCamera 必须是布尔值。',
    );
    const supportsMicrophone = this.requiredBoolean(
      dto.supportsMicrophone,
      'supportsMicrophone 必须是布尔值。',
    );
    const supportedInputModes = this.validateStringArray(
      dto.supportedInputModes,
      'supportedInputModes 必须是非空字符串数组。',
    );
    const requiredMetrics = this.validateRequiredMetrics(dto.requiredMetrics);

    if (supportsCamera && !supportedInputModes.includes('camera_pose')) {
      throw new BadRequestException(
        '启用摄像头采集的游戏必须包含 camera_pose 输入模式。',
      );
    }
    const browserPoseGameVersion =
      runtimeType === 'browser_pose_game'
        ? this.validateGameVersion(
            this.requiredString(
              dto.gameVersion,
              '浏览器体感游戏必须填写 gameVersion。',
            ),
          )
        : null;
    if (runtimeType === 'browser_pose_game') {
      this.requireAdminPermission(user, 'game.publish');
      this.assertBrowserPoseCreateCanBeReleased({
        name,
        supportsCamera,
        supportedInputModes,
        requiredMetrics,
      });
    }
    const existing = await this.prisma.gameContent.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('游戏编码已存在。');
    }

    try {
      const created = await this.prisma.gameContent.create({
        data: {
          code,
          name,
          trainingTargets,
          tags,
          defaultDuration,
          defaultDifficulty,
          runtimeType,
          manifestUrl: runtimeType === 'browser_pose_game' ? null : undefined,
          buildBaseUrl: runtimeType === 'browser_pose_game' ? null : undefined,
          gameVersion:
            runtimeType === 'browser_pose_game'
              ? browserPoseGameVersion
              : undefined,
          buildStatus:
            runtimeType === 'browser_pose_game' ? 'released' : 'pending_assets',
          releaseChannel:
            runtimeType === 'browser_pose_game' ? 'production' : 'development',
          bridgeProtocolVersion: '1.0.0',
          supportsCamera,
          supportsMicrophone,
          supportedInputModes,
          requiredMetrics,
          status: 'active',
        },
      });

      await this.audit(
        user.id,
        this.primaryRole(user),
        runtimeType === 'browser_pose_game'
          ? 'game_content.publish_browser_pose'
          : 'game_content.create',
        'game_content',
        created.id,
        'success',
        {
          code: created.code,
          buildStatus: created.buildStatus,
          status: created.status,
        },
      );

      return created;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('游戏编码已存在。');
      }
      throw error;
    }
  }

  async updateGameContentStatus(
    user: RequestUser,
    gameContentId: string,
    dto: UpdateGameContentStatusDto,
  ) {
    this.requireAdminPermission(user, 'game.manage');

    const status = this.validateGameStatus(dto.status);
    const current = await this.prisma.gameContent.findUnique({
      where: { id: gameContentId },
    });
    if (!current) {
      throw new NotFoundException('游戏内容不存在');
    }

    if (current.status === status) {
      return current;
    }

    const updated = await this.prisma.gameContent.update({
      where: { id: gameContentId },
      data: { status },
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      status === 'active'
        ? 'game_content.enable'
        : status === 'inactive'
          ? 'game_content.disable'
          : 'game_content.archive',
      'game_content',
      gameContentId,
      'success',
      {
        code: updated.code,
        previousStatus: current.status,
        status: updated.status,
        buildStatus: updated.buildStatus,
      },
    );

    return updated;
  }

  async updateUnityBuildConfig(
    user: RequestUser,
    gameContentId: string,
    dto: UpdateUnityBuildDto,
  ) {
    this.requireAdminPermission(user, 'game.manage');

    const current = await this.prisma.gameContent.findUnique({
      where: { id: gameContentId },
    });
    if (!current) {
      throw new NotFoundException('游戏内容不存在');
    }

    const nextConfig = this.resolveUnityBuildConfig(current, dto);
    if (nextConfig.buildStatus === 'released') {
      this.requireAdminPermission(user, 'game.publish');
      this.assertUnityBuildCanBeReleased(nextConfig);
    }

    const updated = await this.prisma.gameContent.update({
      where: { id: gameContentId },
      data: nextConfig,
    });

    await this.audit(
      user.id,
      this.primaryRole(user),
      nextConfig.buildStatus === 'released'
        ? 'game_content.publish_unity_build'
        : 'game_content.update_unity_build',
      'game_content',
      gameContentId,
      'success',
      {
        code: updated.code,
        buildStatus: updated.buildStatus,
        gameVersion: updated.gameVersion,
        bridgeProtocolVersion: updated.bridgeProtocolVersion,
      },
    );

    return updated;
  }

  private async assertPatientAccess(
    user: RequestUser,
    patientId: string,
    access: 'summary' | 'full',
  ) {
    if (this.hasAnyAdminRole(user)) return;

    const patientRole = user.roles.find(
      (role) =>
        role.roleCode === 'patient' && role.relatedObjectId === patientId,
    );
    if (patientRole) return;

    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
    });
    if (!patient) throw new NotFoundException('患者不存在');

    const doctorRole = user.roles.find(
      (role) =>
        role.roleCode === 'doctor' &&
        role.relatedObjectId === patient.responsibleDoctorId,
    );
    if (doctorRole) return;

    const caregiverRole = user.roles.find(
      (role) => role.roleCode === 'caregiver',
    );
    if (caregiverRole && access === 'summary') {
      const relation = await this.findActiveCaregiverAuthorization(
        user.id,
        patientId,
      );
      if (relation) return;
    }

    await this.audit(
      user.id,
      this.primaryRole(user),
      'access.denied',
      'patient_profile',
      patientId,
      'denied',
    );
    throw new ForbiddenException('无权访问该患者数据');
  }

  private async assertTrainingWriteAccess(
    user: RequestUser,
    patientId: string,
  ) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { id: true, responsibleDoctorId: true },
    });
    if (!patient) throw new NotFoundException('患者不存在');

    if (
      this.hasRole(user, 'admin_super') ||
      this.hasRole(user, 'admin_operator')
    ) {
      return;
    }

    const patientRole = user.roles.find(
      (role) =>
        role.roleCode === 'patient' && role.relatedObjectId === patient.id,
    );
    const doctorRole = user.roles.find(
      (role) =>
        role.roleCode === 'doctor' &&
        role.relatedObjectId === patient.responsibleDoctorId,
    );
    if (patientRole || doctorRole) return;

    await this.audit(
      user.id,
      this.primaryRole(user),
      'access.denied',
      'patient_profile',
      patientId,
      'denied',
      { reason: 'training_write_required' },
    );
    throw new ForbiddenException('无权写入训练数据');
  }

  private async assertTrainingReviewAccess(
    user: RequestUser,
    patient: { id: string; responsibleDoctorId: string | null },
  ) {
    if (
      this.hasRole(user, 'admin') ||
      this.hasRole(user, 'admin_super') ||
      this.hasRole(user, 'admin_operator')
    ) {
      return;
    }

    const doctorRole = user.roles.find(
      (role) =>
        role.roleCode === 'doctor' &&
        patient.responsibleDoctorId !== null &&
        role.relatedObjectId === patient.responsibleDoctorId,
    );
    if (doctorRole) return;

    await this.audit(
      user.id,
      this.primaryRole(user),
      'access.denied',
      'training_result',
      patient.id,
      'denied',
      { reason: 'training_review_required' },
    );
    throw new ForbiddenException('无权复核该训练结果');
  }

  private async buildUserContext(user: RequestUser) {
    const context: {
      primaryRole: RoleCode | undefined;
      patientIds: string[];
      caregiverPatientIds: string[];
      doctorPatientIds: string[];
      doctorIds: string[];
      organizationIds: string[];
      caregiverScopes: Record<string, Prisma.JsonValue>;
      adminPermissions: AdminPermission[];
    } = {
      primaryRole: this.primaryRole(user),
      patientIds: [],
      caregiverPatientIds: [],
      doctorPatientIds: [],
      doctorIds: [],
      organizationIds: [],
      caregiverScopes: {},
      adminPermissions: [],
    };

    for (const role of user.roles) {
      if (role.roleCode === 'patient') {
        context.patientIds.push(role.relatedObjectId);
      }
      if (role.roleCode === 'caregiver') {
        context.caregiverPatientIds.push(role.relatedObjectId);
      }
      if (role.roleCode === 'doctor') {
        context.doctorIds.push(role.relatedObjectId);
      }
      if (role.organizationId) {
        context.organizationIds.push(role.organizationId);
      }
      if (this.isAdminRole(role.roleCode)) {
        context.adminPermissions.push(...this.adminPermissions(role.roleCode));
      }
    }

    context.adminPermissions = Array.from(new Set(context.adminPermissions));

    if (context.caregiverPatientIds.length) {
      const relations = await this.prisma.caregiverRelation.findMany({
        where: {
          caregiverUserId: user.id,
          patientId: { in: context.caregiverPatientIds },
          authorizationStatus: 'active',
          revokedAt: null,
        },
        select: { patientId: true, scope: true },
      });
      context.caregiverScopes = Object.fromEntries(
        relations.map((relation) => [relation.patientId, relation.scope]),
      );
    }

    if (context.doctorIds.length) {
      const patients = await this.prisma.patientProfile.findMany({
        where: { responsibleDoctorId: { in: context.doctorIds } },
        select: { id: true },
      });
      context.doctorPatientIds = patients.map((patient) => patient.id);
    }

    return context;
  }

  private async resolveResponsibleDoctorId(
    user: RequestUser,
    requestedDoctorId: string | undefined,
  ) {
    const doctorRole = user.roles.find((role) => role.roleCode === 'doctor');

    if (!this.hasAnyAdminRole(user)) {
      if (!doctorRole) {
        throw new ForbiddenException('当前账号未绑定医师身份');
      }
      if (
        requestedDoctorId &&
        requestedDoctorId !== doctorRole.relatedObjectId
      ) {
        throw new ForbiddenException('普通医师只能创建自己负责的患者');
      }
      return doctorRole.relatedObjectId;
    }

    if (!requestedDoctorId) {
      throw new BadRequestException('管理员创建患者时必须指定负责医师');
    }

    const doctorByProfileId = await this.prisma.doctorProfile.findUnique({
      where: { id: requestedDoctorId },
      select: { id: true },
    });
    if (doctorByProfileId) return doctorByProfileId.id;

    const doctorByAccount = await this.prisma.doctorProfile.findFirst({
      where: { user: { account: requestedDoctorId } },
      select: { id: true },
    });
    if (doctorByAccount) return doctorByAccount.id;

    throw new BadRequestException('负责医师不存在');
  }

  private resolveDoctorIdForPlan(
    user: RequestUser,
    patient: { responsibleDoctorId: string | null },
  ) {
    if (this.hasAnyAdminRole(user)) {
      if (patient.responsibleDoctorId) return patient.responsibleDoctorId;
      throw new ForbiddenException('患者未绑定负责医师，无法确认方案');
    }

    const doctorId = user.roles.find(
      (role) => role.roleCode === 'doctor',
    )?.relatedObjectId;
    if (!doctorId) {
      throw new ForbiddenException('当前账号未绑定医师身份');
    }

    return doctorId;
  }

  private async assertPatientSelf(user: RequestUser, patientId: string) {
    const patientRole = user.roles.find(
      (role) =>
        role.roleCode === 'patient' && role.relatedObjectId === patientId,
    );
    if (!patientRole) {
      await this.audit(
        user.id,
        this.primaryRole(user),
        'access.denied',
        'patient_profile',
        patientId,
        'denied',
        { reason: 'patient_self_required' },
      );
      throw new ForbiddenException('仅患者本人账号可管理家属共享授权。');
    }
  }

  private async assertCurrentConsent(
    patientId: string,
    consentType: ConsentDto['consentType'],
  ) {
    const consent = await this.prisma.consentRecord.findFirst({
      where: {
        patientId,
        consentType,
        consentVersion: currentConsentVersion,
        status: 'granted',
        revokedAt: null,
      },
      orderBy: { grantedAt: 'desc' },
    });

    if (!consent) {
      throw new ForbiddenException(`缺少 ${consentType} 授权`);
    }
  }

  private async findActiveCaregiverAuthorization(
    caregiverUserId: string,
    patientId: string,
  ) {
    const [relation, consent] = await Promise.all([
      this.prisma.caregiverRelation.findFirst({
        where: {
          caregiverUserId,
          patientId,
          authorizationStatus: 'active',
          revokedAt: null,
        },
      }),
      this.prisma.consentRecord.findFirst({
        where: {
          patientId,
          consentType: 'caregiver_sharing',
          consentVersion: currentConsentVersion,
          status: 'granted',
          revokedAt: null,
        },
      }),
    ]);

    return relation && consent ? relation : null;
  }

  private evaluateTrainingQuality(dto: SubmitTrainingResultDto) {
    const reasons: string[] = [];
    if (dto.durationSeconds < 60) reasons.push('训练时长过短');
    if (dto.completionRate < 0.5) reasons.push('完成率过低');
    if (dto.reactionTimeMs <= 0 || dto.reactionTimeMs > 10000)
      reasons.push('反应时间异常');
    if (dto.motionAccuracy < 0 || dto.motionAccuracy > 1)
      reasons.push('动作准确率超范围');

    return {
      abnormalFlag: reasons.length > 0,
      qualityFlag: reasons.length > 0 ? 'suspicious' : 'valid',
      qualityReasons: reasons,
      sessionStatus:
        reasons.length > 0
          ? ('upload_failed' as TrainingSessionStatus)
          : ('completed' as TrainingSessionStatus),
      reason: reasons.join('；') || undefined,
    };
  }

  private hasCompletedTrainingResult(session: {
    sessionStatus: TrainingSessionStatus;
    result?: TrainingResult | null;
  }) {
    return session.sessionStatus === 'completed' && Boolean(session.result);
  }

  private assertGameReadyForFormalTraining(game: GameContent) {
    if (game.status !== 'active') {
      throw new BadRequestException('训练游戏未启用，不能开始训练。');
    }
    const runtimeType = this.validateFormalRuntimeType(game.runtimeType);
    if (runtimeType === 'unity_webgl') {
      this.assertUnityWebglGameReady(game);
      return;
    }
    this.assertBrowserPoseGameReady(game);
  }

  private isGameReadyForFormalTraining(game: GameContent) {
    try {
      this.assertGameReadyForFormalTraining(game);
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        return false;
      }
      throw error;
    }
  }

  private validateFormalRuntimeType(value: string): FormalRuntimeType {
    if (supportedFormalRuntimeTypes.includes(value as FormalRuntimeType)) {
      return value as FormalRuntimeType;
    }
    throw new BadRequestException(
      `训练游戏运行时不受支持：${value}。当前仅支持 unity_webgl 或 browser_pose_game。`,
    );
  }

  private assertUnityWebglGameReady(game: GameContent) {
    if (game.buildStatus !== 'released') {
      throw new BadRequestException(
        `训练游戏 ${game.name} 尚未发布正式 Unity WebGL 构建，当前状态：${game.buildStatus}。请先上传并配置正式构建资产。`,
      );
    }
    if (!game.manifestUrl?.trim()) {
      throw new BadRequestException(
        `训练游戏 ${game.name} 缺少 manifestUrl，不能开始正式训练。`,
      );
    }
    if (!game.gameVersion?.trim()) {
      throw new BadRequestException(
        `训练游戏 ${game.name} 缺少 gameVersion，不能开始正式训练。`,
      );
    }
    if (game.bridgeProtocolVersion !== '1.0.0') {
      throw new BadRequestException(
        `训练游戏 ${game.name} 的桥接协议版本不受支持：${game.bridgeProtocolVersion}。`,
      );
    }
  }

  private assertBrowserPoseGameReady(game: GameContent) {
    if (game.buildStatus !== 'released') {
      throw new BadRequestException(
        `浏览器体感游戏 ${game.name} 尚未发布正式版本，当前状态：${game.buildStatus}。`,
      );
    }
    if (!game.gameVersion?.trim()) {
      throw new BadRequestException(
        `浏览器体感游戏 ${game.name} 缺少 gameVersion，不能开始正式训练。`,
      );
    }
    if (game.bridgeProtocolVersion !== '1.0.0') {
      throw new BadRequestException(
        `浏览器体感游戏 ${game.name} 的桥接协议版本不受支持：${game.bridgeProtocolVersion}。`,
      );
    }
    if (!game.supportedInputModes.includes('camera_pose')) {
      throw new BadRequestException(
        `浏览器体感游戏 ${game.name} 必须包含 camera_pose 输入模式。`,
      );
    }
    this.assertRequiredMetricTypes(
      game.requiredMetrics,
      [...browserPoseGameRequiredMetricTypes],
      `浏览器体感游戏 ${game.name} 缺少正式动作指标配置。`,
    );
  }

  private assertBrowserPoseCreateCanBeReleased(config: {
    name: string;
    supportsCamera: boolean;
    supportedInputModes: string[];
    requiredMetrics: unknown;
  }) {
    if (!config.supportsCamera) {
      throw new BadRequestException('浏览器体感游戏必须启用摄像头采集。');
    }
    if (!config.supportedInputModes.includes('camera_pose')) {
      throw new BadRequestException(
        '浏览器体感游戏必须包含 camera_pose 输入模式。',
      );
    }
    this.assertRequiredMetricTypes(
      config.requiredMetrics,
      [...browserPoseGameRequiredMetricTypes],
      `浏览器体感游戏 ${config.name} 缺少正式动作指标配置。`,
    );
  }

  private assertRequiredMetricTypes(
    value: unknown,
    requiredMetricTypes: string[],
    message: string,
  ) {
    if (!Array.isArray(value) || !value.length) {
      throw new BadRequestException(message);
    }
    const metricTypes = new Set(
      value.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new BadRequestException(message);
        }
        const metric = item as Record<string, unknown>;
        return this.requiredString(metric.metricType, message);
      }),
    );
    const missingMetricTypes = requiredMetricTypes.filter(
      (metricType) => !metricTypes.has(metricType),
    );
    if (missingMetricTypes.length) {
      throw new BadRequestException(
        `${message} 缺少：${missingMetricTypes.join('、')}。`,
      );
    }
  }

  private assertTrainingResultSourceMatchesRuntime(
    resultSource: string,
    runtimeType: string,
  ) {
    const formalRuntimeType = this.validateFormalRuntimeType(runtimeType);
    if (resultSource !== formalRuntimeType) {
      throw new BadRequestException(
        `训练结果来源 ${resultSource} 与游戏运行时 ${formalRuntimeType} 不匹配。`,
      );
    }
  }

  private assertBrowserPoseResultMetrics(
    runtimeType: string,
    motionMetrics: Array<{
      metricType: string;
      confidence?: number;
      sampleCount?: number;
      qualityFlag?: string;
    }>,
  ) {
    if (runtimeType !== 'browser_pose_game') return;

    const byMetricType = new Map(
      motionMetrics.map((metric) => [metric.metricType, metric]),
    );
    const missingMetricTypes = browserPoseGameRequiredMetricTypes.filter(
      (metricType) => !byMetricType.has(metricType),
    );
    if (missingMetricTypes.length) {
      throw new BadRequestException(
        `浏览器体感训练结果缺少正式动作指标：${missingMetricTypes.join('、')}。`,
      );
    }

    for (const metricType of browserPoseGameRequiredMetricTypes) {
      const metric = byMetricType.get(metricType);
      if (!metric) continue;
      if (metric.confidence === undefined) {
        throw new BadRequestException(
          `浏览器体感训练指标 ${metricType} 缺少置信度。`,
        );
      }
      if (metric.sampleCount === undefined) {
        throw new BadRequestException(
          `浏览器体感训练指标 ${metricType} 缺少采样数。`,
        );
      }
      if (metric.qualityFlag !== 'valid') {
        throw new BadRequestException(
          `浏览器体感训练指标 ${metricType} 的 qualityFlag 必须显式为 valid。`,
        );
      }
    }
  }

  private resolveUnityBuildConfig(
    current: GameContent,
    dto: UpdateUnityBuildDto,
  ): Prisma.GameContentUpdateInput {
    const buildStatus =
      dto.buildStatus === undefined
        ? current.buildStatus
        : this.validateBuildStatus(dto.buildStatus);
    const releaseChannel =
      dto.releaseChannel === undefined
        ? current.releaseChannel
        : this.validateReleaseChannel(dto.releaseChannel);
    const bridgeProtocolVersion =
      dto.bridgeProtocolVersion === undefined
        ? current.bridgeProtocolVersion
        : this.validateBridgeProtocolVersion(dto.bridgeProtocolVersion);
    const manifestUrl =
      dto.manifestUrl === undefined
        ? current.manifestUrl
        : this.optionalString(dto.manifestUrl, 'manifestUrl 必须是文本。');
    const buildBaseUrl =
      dto.buildBaseUrl === undefined
        ? current.buildBaseUrl
        : this.optionalString(dto.buildBaseUrl, 'buildBaseUrl 必须是文本。');
    const gameVersion =
      dto.gameVersion === undefined
        ? current.gameVersion
        : this.optionalString(dto.gameVersion, 'gameVersion 必须是文本。');
    const supportsCamera =
      dto.supportsCamera === undefined
        ? current.supportsCamera
        : this.requiredBoolean(
            dto.supportsCamera,
            'supportsCamera 必须是布尔值。',
          );
    const supportsMicrophone =
      dto.supportsMicrophone === undefined
        ? current.supportsMicrophone
        : this.requiredBoolean(
            dto.supportsMicrophone,
            'supportsMicrophone 必须是布尔值。',
          );
    const supportedInputModes =
      dto.supportedInputModes === undefined
        ? current.supportedInputModes
        : this.validateStringArray(
            dto.supportedInputModes,
            'supportedInputModes 必须是字符串数组。',
          );
    const requiredMetrics =
      dto.requiredMetrics === undefined
        ? this.jsonInput(current.requiredMetrics ?? [])
        : this.validateRequiredMetrics(dto.requiredMetrics);

    return {
      runtimeType: 'unity_webgl',
      manifestUrl,
      buildBaseUrl,
      gameVersion,
      bridgeProtocolVersion,
      buildStatus,
      releaseChannel,
      supportsCamera,
      supportsMicrophone,
      supportedInputModes,
      requiredMetrics,
    };
  }

  private assertUnityBuildCanBeReleased(config: Prisma.GameContentUpdateInput) {
    if (config.runtimeType !== 'unity_webgl') {
      throw new BadRequestException('一期只允许发布 Unity WebGL 游戏。');
    }
    const manifestUrl = this.requiredString(
      config.manifestUrl,
      '发布正式构建前必须填写 manifestUrl。',
    );
    if (
      !manifestUrl.startsWith('/unity/') ||
      !manifestUrl.endsWith('/manifest.json')
    ) {
      throw new BadRequestException(
        'manifestUrl 必须是 /unity/.../manifest.json 形式的正式站内资源路径。',
      );
    }
    const buildBaseUrl = this.requiredString(
      config.buildBaseUrl,
      '发布正式构建前必须填写 buildBaseUrl。',
    );
    if (!manifestUrl.startsWith(`${buildBaseUrl}/`)) {
      throw new BadRequestException(
        'manifestUrl 必须位于 buildBaseUrl 目录下。',
      );
    }
    this.validateGameVersion(
      this.requiredString(
        config.gameVersion,
        '发布正式构建前必须填写 gameVersion。',
      ),
    );
    this.validateBridgeProtocolVersion(
      this.requiredString(
        config.bridgeProtocolVersion,
        '发布正式构建前必须填写 bridgeProtocolVersion。',
      ),
    );
    if (config.releaseChannel !== 'production') {
      throw new BadRequestException(
        '发布 released 构建时 releaseChannel 必须是 production。',
      );
    }
    const supportedInputModes = this.validateStringArray(
      config.supportedInputModes,
      '发布正式构建前必须填写 supportedInputModes。',
    );
    if (config.supportsCamera && !supportedInputModes.includes('camera_pose')) {
      throw new BadRequestException(
        '启用摄像头采集的正式构建必须包含 camera_pose 输入模式。',
      );
    }
    this.validateRequiredMetrics(config.requiredMetrics, true);
    if (/demo|mock|seed_import/i.test(JSON.stringify(config))) {
      throw new BadRequestException(
        '正式 Unity 构建配置不能包含 demo/mock/seed_import 标记。',
      );
    }
  }

  private validateBuildStatus(value: unknown) {
    const status = this.requiredString(value, 'buildStatus 不能为空。');
    if (
      !['pending_assets', 'validating', 'released', 'rejected'].includes(status)
    ) {
      throw new BadRequestException(
        'buildStatus 必须是 pending_assets、validating、released 或 rejected。',
      );
    }
    return status;
  }

  private validateReleaseChannel(value: unknown) {
    const channel = this.requiredString(value, 'releaseChannel 不能为空。');
    if (!['development', 'staging', 'production'].includes(channel)) {
      throw new BadRequestException(
        'releaseChannel 必须是 development、staging 或 production。',
      );
    }
    return channel;
  }

  private validateBridgeProtocolVersion(value: unknown) {
    const version = this.requiredString(
      value,
      'bridgeProtocolVersion 不能为空。',
    );
    if (version !== '1.0.0') {
      throw new BadRequestException('bridgeProtocolVersion 当前仅支持 1.0.0。');
    }
    return version;
  }

  private validateGameVersion(value: string) {
    if (!/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value)) {
      throw new BadRequestException(
        'gameVersion 必须是语义化版本号，例如 1.0.0。',
      );
    }
    return value;
  }

  private validateGameCode(value: unknown) {
    const code = this.requiredString(value, '游戏编码不能为空。');
    if (!/^[a-z0-9_-]{2,64}$/.test(code)) {
      throw new BadRequestException(
        '游戏编码只能包含小写字母、数字、下划线或短横线，长度 2 到 64 位。',
      );
    }
    return code;
  }

  private validateGameStatus(value: unknown) {
    const status = this.requiredString(value, '游戏状态不能为空。');
    if (!['active', 'inactive', 'archived'].includes(status)) {
      throw new BadRequestException(
        '游戏状态必须是 active、inactive 或 archived。',
      );
    }
    return status;
  }

  private validateStringArray(value: unknown, message: string) {
    if (!Array.isArray(value)) {
      throw new BadRequestException(message);
    }
    const normalized = value.map((item) => this.requiredString(item, message));
    if (!normalized.length) {
      throw new BadRequestException(message);
    }
    return Array.from(new Set(normalized));
  }

  private validateRequiredMetrics(value: unknown, requireNonEmpty = false) {
    if (!Array.isArray(value)) {
      throw new BadRequestException('requiredMetrics 必须是数组。');
    }
    if (requireNonEmpty && !value.length) {
      throw new BadRequestException(
        '发布正式构建前 requiredMetrics 不能为空。',
      );
    }
    const metrics = value.map((item, index) => {
      const metric = this.requiredJsonObject(
        item,
        `requiredMetrics 第 ${index + 1} 项必须是对象。`,
      );
      const metricType = this.requiredString(
        metric.metricType,
        `requiredMetrics 第 ${index + 1} 项缺少 metricType。`,
      );
      const unit = this.requiredString(
        metric.unit,
        `requiredMetrics 第 ${index + 1} 项缺少 unit。`,
      );
      const min =
        metric.min === undefined
          ? undefined
          : this.requiredNumber(
              metric.min,
              `requiredMetrics 第 ${index + 1} 项 min 无效。`,
            );
      const max =
        metric.max === undefined
          ? undefined
          : this.requiredNumber(
              metric.max,
              `requiredMetrics 第 ${index + 1} 项 max 无效。`,
            );
      if (min !== undefined && max !== undefined && min > max) {
        throw new BadRequestException(
          `requiredMetrics 第 ${index + 1} 项 min 不能大于 max。`,
        );
      }
      return {
        metricType,
        unit,
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
      };
    });
    return this.jsonInput(metrics);
  }

  private buildTrainingRuntimeContext(
    dto: StartTrainingDto,
    game: GameContent,
  ) {
    const gameRunId = this.requiredString(
      dto.gameRunId,
      '游戏运行批次 ID 不能为空，请由前端设备检测通过后生成并传入。',
    );
    const deviceCode = this.requiredString(
      dto.deviceCode,
      '设备编号不能为空，请完成摄像头设备识别后再开始训练。',
    );
    const calibrationStatus = this.requiredString(
      dto.calibrationStatus,
      '校准状态不能为空，请完成设备检测后再开始训练。',
    );
    if (!['checked', 'completed'].includes(calibrationStatus)) {
      throw new BadRequestException(
        '开始正式训练前，设备校准状态必须是 checked 或 completed。',
      );
    }
    const clientStartedAt = this.requiredString(
      dto.clientStartedAt,
      '客户端训练开始时间不能为空。',
    );

    return {
      gameRunId,
      deviceCode,
      calibrationStatus,
      clientStartedAt: this.parseDate(
        clientStartedAt,
        '客户端训练开始时间无效。',
      ),
      runtimeConfigSnapshot: this.jsonInput({
        runtimeType: game.runtimeType,
        manifestUrl: game.manifestUrl,
        buildBaseUrl: game.buildBaseUrl,
        gameVersion: game.gameVersion,
        bridgeProtocolVersion: game.bridgeProtocolVersion,
        releaseChannel: game.releaseChannel,
        supportedInputModes: game.supportedInputModes,
        requiredMetrics: game.requiredMetrics,
      }),
      unityBuildVersion:
        game.runtimeType === 'unity_webgl' ? game.gameVersion : undefined,
      bridgeProtocolVersion: game.bridgeProtocolVersion,
    };
  }

  private calculateRiskLevel(scoreSummary: Prisma.JsonObject): RiskLevel {
    const mmse = this.requiredNumber(scoreSummary.mmse, 'MMSE 分数不能为空。');
    if (mmse < 18) return 'high';
    if (mmse < 24) return 'moderate';
    return 'low';
  }

  private riskReason(level: RiskLevel, scoreSummary: Prisma.JsonObject) {
    const mmse = this.requiredNumber(scoreSummary.mmse, 'MMSE 分数不能为空。');
    const cdr = this.requiredNumber(scoreSummary.cdr, 'CDR 分数不能为空。');
    return `MMSE ${mmse}/30，CDR ${cdr}，系统判定为${this.riskLabel(level)}。`;
  }

  private riskLabel(level: RiskLevel) {
    return level === 'high'
      ? '高风险'
      : level === 'moderate'
        ? '中度风险'
        : '低风险';
  }

  private scoreGame(tags: string[], riskLevel: RiskLevel) {
    const text = tags.join(',');
    let score = 50;
    if (text.includes('近记忆')) score += 20;
    if (text.includes('反应')) score += 15;
    if (text.includes('执行力')) score += 12;
    if (riskLevel === 'high' && text.includes('低强度')) score += 20;
    if (riskLevel !== 'high' && text.includes('中低强度')) score += 10;
    return score;
  }

  private hashPassword(password: string) {
    return createHash('sha256').update(password).digest('hex');
  }

  private async ensurePatientLoginAvailable(
    account: string,
    mobilePhone: string | undefined,
  ) {
    await this.ensureLoginAvailable(account, mobilePhone, '患者');
  }

  private async ensureCaregiverLoginAvailable(
    account: string,
    mobilePhone: string | undefined,
  ) {
    await this.ensureLoginAvailable(account, mobilePhone, '家属');
  }

  private async ensureLoginAvailable(
    account: string,
    mobilePhone: string | undefined,
    label: string,
  ) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ account }, ...(mobilePhone ? [{ mobilePhone }] : [])],
      },
      select: { id: true },
    });
    if (existingUser) {
      throw new BadRequestException(`${label}账号或手机号已存在。`);
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private jsonInput(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  }

  private requiredJsonObject(
    value: unknown,
    message: string,
  ): Prisma.JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private requiredString(value: unknown, message: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(message);
    }
    return value.trim();
  }

  private optionalString(value: unknown, message: string) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(message);
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  private requiredNumber(value: unknown, message: string) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new BadRequestException(message);
    }
    return numberValue;
  }

  private requiredBoolean(value: unknown, message: string) {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(message);
    }
    return value;
  }

  private requiredInteger(value: unknown, message: string) {
    const numberValue = this.requiredNumber(value, message);
    if (!Number.isInteger(numberValue)) {
      throw new BadRequestException(message);
    }
    return numberValue;
  }

  private assertRange(
    value: number,
    min: number,
    max: number,
    message: string,
  ) {
    if (value < min || value > max) {
      throw new BadRequestException(message);
    }
  }

  private validateAccount(value: unknown, message = '患者登录账号不能为空。') {
    const account = this.requiredString(value, message);
    if (!/^[a-zA-Z0-9_.-]{4,32}$/.test(account)) {
      throw new BadRequestException(
        '登录账号需为 4-32 位字母、数字、下划线、点或短横线。',
      );
    }
    return account;
  }

  private validateCaregiverScope(value: unknown) {
    const scope = this.requiredJsonObject(
      value,
      '家属授权范围不能为空，且必须是结构化对象。',
    );
    const summary = this.requiredBoolean(
      scope.summary,
      '家属授权范围必须明确 summary 权限。',
    );
    const reminders = this.requiredBoolean(
      scope.reminders,
      '家属授权范围必须明确 reminders 权限。',
    );
    const progress = this.requiredBoolean(
      scope.progress,
      '家属授权范围必须明确 progress 权限。',
    );
    const rawAssessment = this.requiredBoolean(
      scope.rawAssessment,
      '家属授权范围必须明确 rawAssessment 权限。',
    );
    const planEdit = this.requiredBoolean(
      scope.planEdit,
      '家属授权范围必须明确 planEdit 权限。',
    );
    if (!summary) {
      throw new BadRequestException('家属绑定必须至少授予 summary 摘要权限。');
    }
    if (rawAssessment || planEdit) {
      throw new BadRequestException(
        '一期家属端仅允许摘要、提醒和进展查看，不开放原始评估或计划编辑。',
      );
    }
    return {
      summary,
      reminders,
      progress,
      rawAssessment,
      planEdit,
    };
  }

  private validateInitialPassword(value: unknown, label = '患者') {
    const password = this.requiredString(value, `${label}初始密码不能为空。`);
    if (password.length < 6 || password.length > 64) {
      throw new BadRequestException(
        `${label}初始密码长度必须在 6 到 64 位之间。`,
      );
    }
    return password;
  }

  private validateAssessmentScoreSummary(scoreSummary: Prisma.JsonObject) {
    const requiredFields = [
      'mmse',
      'cdr',
      'memory',
      'orientation',
      'executive',
      'language',
    ] as const;
    for (const field of requiredFields) {
      this.requiredNumber(
        scoreSummary[field],
        '评估分数字段不完整：mmse、cdr、memory、orientation、executive、language 为必填。',
      );
    }

    this.assertRange(
      Number(scoreSummary.mmse),
      0,
      30,
      'MMSE 分数必须在 0 到 30 之间。',
    );
    this.assertRange(
      Number(scoreSummary.cdr),
      0,
      3,
      'CDR 分数必须在 0 到 3 之间。',
    );
    for (const field of ['memory', 'orientation', 'executive', 'language']) {
      this.assertRange(
        Number(scoreSummary[field]),
        0,
        100,
        '评估分项分数必须在 0 到 100 之间。',
      );
    }
  }

  private assertAllowedAssessmentSource(source: string) {
    if (!allowedAssessmentSources.includes(source as never)) {
      throw new BadRequestException(
        '评估来源必须为已确认的结构化录入或已接入生产 AI/语音来源。',
      );
    }
  }

  private assertProductionAssessmentEvidence(
    rawInputSummary: Prisma.JsonObject,
    source: string,
  ) {
    if (!this.isProductionAiAssessmentSource(source)) {
      return;
    }

    const evidence = this.requiredJsonObject(
      rawInputSummary.evidence,
      '生产 AI/语音评估必须提供供应商调用证据。',
    );
    this.requiredProductionEvidenceText(evidence.provider, 'AI 供应商');
    this.requiredProductionEvidenceText(evidence.model, 'AI 模型');
    this.requiredProductionEvidenceText(evidence.modelVersion, 'AI 模型版本');
    this.requiredProductionEvidenceText(evidence.callId, 'AI 调用 ID');
    this.assertProductionEvidenceHttpsRef(evidence.endpointRef, 'AI endpoint');
    this.requiredProductionEvidenceText(evidence.promptVersion, '提示词版本');
    this.requiredIsoDate(evidence.calledAt, 'AI 调用时间');

    const humanReview = this.requiredJsonObject(
      evidence.humanReview,
      '生产 AI/语音评估必须提供人工复核记录。',
    );
    const reviewRequired = this.requiredBoolean(
      humanReview.required,
      '生产 AI/语音评估必须明确人工复核 required=true。',
    );
    if (!reviewRequired) {
      throw new BadRequestException('生产 AI/语音评估必须经过人工复核。');
    }
    this.requiredProductionEvidenceText(
      humanReview.reviewerUserId,
      '人工复核人',
    );
    this.requiredIsoDate(humanReview.reviewedAt, '人工复核时间');
    const conclusion = this.requiredProductionEvidenceText(
      humanReview.conclusion,
      '人工复核结论',
    );
    if (!humanReviewConclusions.includes(conclusion as never)) {
      throw new BadRequestException(
        '人工复核结论必须为 approved、rejected 或 needs_revision。',
      );
    }
    if (conclusion !== 'approved') {
      throw new BadRequestException(
        '生产 AI/语音评估必须经人工复核批准后才能入库。',
      );
    }

    if (this.isSpeechAiAssessmentSource(source)) {
      const speech = this.requiredJsonObject(
        evidence.speech,
        '语音 AI 评估必须提供语音转写供应商调用证据。',
      );
      this.requiredProductionEvidenceText(speech.provider, '语音识别供应商');
      this.requiredProductionEvidenceText(speech.modelVersion, '语音模型版本');
      this.requiredProductionEvidenceText(speech.callId, '语音调用 ID');
      this.assertProductionEvidenceHttpsRef(
        speech.endpointRef,
        '语音识别 endpoint',
      );
    }
  }

  private isProductionAiAssessmentSource(
    source: string,
  ): source is ProductionAiAssessmentSource {
    return productionAiAssessmentSources.includes(source as never);
  }

  private isSpeechAiAssessmentSource(source: string) {
    return speechAiAssessmentSources.includes(source as never);
  }

  private requiredProductionEvidenceText(value: unknown, label: string) {
    const text = this.requiredString(value, `${label}不能为空。`);
    this.assertNoDemoMockLocalManual(text, label);
    return text;
  }

  private assertProductionEvidenceHttpsRef(value: unknown, label: string) {
    const endpointRef = this.requiredProductionEvidenceText(value, label);
    let url: URL;
    try {
      url = new URL(endpointRef);
    } catch {
      throw new BadRequestException(`${label} 必须是有效的 HTTPS 地址。`);
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException(`${label} 必须使用 HTTPS。`);
    }
    this.assertNoDemoMockLocalManual(url.hostname, label);
    if (
      ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname) ||
      url.hostname.endsWith('.local')
    ) {
      throw new BadRequestException(`${label} 不能指向本地或测试地址。`);
    }
    return endpointRef;
  }

  private requiredIsoDate(value: unknown, label: string) {
    const text = this.requiredString(value, `${label}不能为空。`);
    const timestamp = Date.parse(text);
    if (!Number.isFinite(timestamp)) {
      throw new BadRequestException(`${label}必须为有效 ISO 时间。`);
    }
    return text;
  }

  private assertNoDemoMockLocalManual(value: string, label: string) {
    if (/\b(mock|demo|local|manual|fallback)\b/i.test(value)) {
      throw new BadRequestException(
        `${label} 不能包含 mock、demo、local、manual 或 fallback。`,
      );
    }
  }

  private validateTrainingResult(dto: SubmitTrainingResultDto) {
    this.assertRange(
      this.requiredNumber(dto.score, '训练得分不能为空。'),
      0,
      100,
      '训练得分必须在 0 到 100 之间。',
    );
    this.assertRange(
      this.requiredNumber(dto.completionRate, '训练完成率不能为空。'),
      0,
      1,
      '训练指标超出有效范围：completionRate/motionAccuracy 必须在 0 到 1 之间。',
    );
    this.assertRange(
      this.requiredNumber(dto.motionAccuracy, '动作准确率不能为空。'),
      0,
      1,
      '训练指标超出有效范围：completionRate/motionAccuracy 必须在 0 到 1 之间。',
    );
    const durationSeconds = this.requiredNumber(
      dto.durationSeconds,
      '训练时长不能为空。',
    );
    if (durationSeconds <= 0) {
      throw new BadRequestException('训练时长必须大于 0。');
    }
    const reactionTimeMs = this.requiredNumber(
      dto.reactionTimeMs,
      '反应时间不能为空。',
    );
    if (reactionTimeMs <= 0) {
      throw new BadRequestException('反应时间必须大于 0。');
    }
    const intensity = this.requiredString(
      dto.exerciseIntensity,
      '运动强度不能为空。',
    );
    if (!['low', 'moderate', 'high'].includes(intensity)) {
      throw new BadRequestException('运动强度必须是 low、moderate 或 high。');
    }
  }

  private validateTrainingReviewConclusion(
    value: unknown,
  ): TrainingReviewConclusion {
    const conclusion = this.requiredString(value, '训练复核结论不能为空。');
    if (
      !trainingReviewConclusions.includes(
        conclusion as TrainingReviewConclusion,
      )
    ) {
      throw new BadRequestException(
        '训练复核结论必须是 confirmed_abnormal、accepted_valid、excluded_from_analysis 或 needs_retrain。',
      );
    }
    return conclusion as TrainingReviewConclusion;
  }

  private assertTrainingResultRequiresReview(result: {
    abnormalFlag: boolean;
    qualityFlag: string;
  }) {
    if (result.abnormalFlag || result.qualityFlag !== 'valid') return;
    throw new BadRequestException('该训练结果未被标记为异常或可疑，无需人工复核。');
  }

  private assertTrainingResultNotReviewed(result: { reviewStatus: string | null }) {
    if (result.reviewStatus !== 'reviewed') return;
    throw new BadRequestException('该训练结果已完成复核，请勿重复提交。');
  }

  private validateConsentType(value: unknown): ConsentDto['consentType'] {
    const validTypes: Array<ConsentDto['consentType']> = [
      'privacy_policy',
      'ai_processing',
      'camera_capture',
      'microphone_capture',
      'caregiver_sharing',
    ];
    if (
      typeof value !== 'string' ||
      !validTypes.includes(value as ConsentDto['consentType'])
    ) {
      throw new BadRequestException('授权类型无效。');
    }
    return value as ConsentDto['consentType'];
  }

  private validateExportDataset(value: string): ExportDataset {
    const datasets: ExportDataset[] = [
      'patients',
      'assessments',
      'training-records',
      'consents',
      'audit-logs',
    ];
    if (!datasets.includes(value as ExportDataset)) {
      throw new BadRequestException('导出数据集无效。');
    }
    return value as ExportDataset;
  }

  private resolveExportFormat(value: unknown): ExportFormat {
    if (value === undefined || value === null || value === '') return 'csv';
    const format = this.optionalString(value, '导出格式必须是文本。');
    if (format !== 'csv' && format !== 'json') {
      throw new BadRequestException('导出格式必须是 csv 或 json。');
    }
    return format;
  }

  private resolveExportFilters(query: ExportDatasetQueryDto): ExportFilters {
    const reason = this.requiredString(query.reason, '导出原因不能为空。');
    const dateFromText = this.optionalString(
      query.dateFrom,
      '导出开始时间必须是文本。',
    );
    const dateToText = this.optionalString(
      query.dateTo,
      '导出结束时间必须是文本。',
    );
    const dateFrom = dateFromText
      ? this.parseDate(dateFromText, '导出开始时间无效。')
      : undefined;
    const dateTo = dateToText
      ? this.parseDate(dateToText, '导出结束时间无效。')
      : undefined;
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException('导出开始时间不能晚于结束时间。');
    }

    const patientId = this.optionalString(
      query.patientId,
      '患者 ID 必须是文本。',
    );
    const riskLevelText = this.optionalString(
      query.riskLevel,
      '风险等级必须是文本。',
    );
    if (riskLevelText && !['low', 'moderate', 'high'].includes(riskLevelText)) {
      throw new BadRequestException('风险等级必须是 low、moderate 或 high。');
    }
    const qualityFlag = this.optionalString(
      query.qualityFlag,
      '数据质量标记必须是文本。',
    );

    return {
      reason,
      dateFrom,
      dateTo,
      patientId,
      riskLevel: riskLevelText as RiskLevel | undefined,
      qualityFlag,
      limit: this.resolveExportLimit(query.limit),
    };
  }

  private resolveExportLimit(value: unknown) {
    if (value === undefined || value === null || value === '') return 100;
    const limit = this.requiredInteger(value, '导出条数必须是整数。');
    this.assertRange(limit, 1, 500, '导出条数必须在 1 到 500 之间。');
    return limit;
  }

  private async buildExportPayload(
    dataset: ExportDataset,
    format: ExportFormat,
    filters: ExportFilters,
  ): Promise<ExportPayload> {
    const rows = await this.buildExportRows(dataset, filters);
    const columns = this.exportColumns(dataset);
    return {
      dataset,
      format,
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      columns,
      rows,
    };
  }

  private buildExportRows(dataset: ExportDataset, filters: ExportFilters) {
    if (dataset === 'patients') return this.exportPatients(filters);
    if (dataset === 'assessments') return this.exportAssessments(filters);
    if (dataset === 'training-records')
      return this.exportTrainingRecords(filters);
    if (dataset === 'consents') return this.exportConsents(filters);
    return this.exportAuditLogs(filters);
  }

  private exportColumns(dataset: ExportDataset) {
    const columns: Record<ExportDataset, string[]> = {
      patients: [
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
      assessments: [
        'assessmentExportId',
        'patientExportId',
        'maskedPatientName',
        'assessmentType',
        'mmse',
        'cdr',
        'memory',
        'orientation',
        'executive',
        'language',
        'riskLevel',
        'aiConfidence',
        'createdAt',
      ],
      'training-records': [
        'sessionExportId',
        'patientExportId',
        'maskedPatientName',
        'gameName',
        'sessionStatus',
        'syncStatus',
        'score',
        'completionRate',
        'durationSeconds',
        'reactionTimeMs',
        'motionAccuracy',
        'exerciseIntensity',
        'abnormalFlag',
        'qualityFlag',
        'startedAt',
      ],
      consents: [
        'consentExportId',
        'patientExportId',
        'maskedPatientName',
        'consentType',
        'consentVersion',
        'status',
        'grantedAt',
        'revokedAt',
      ],
      'audit-logs': [
        'auditLogExportId',
        'actorRole',
        'maskedActorAccount',
        'action',
        'targetType',
        'targetExportId',
        'result',
        'createdAt',
      ],
    };
    return columns[dataset];
  }

  private async exportPatients(filters: ExportFilters): Promise<ExportRow[]> {
    const where: Prisma.PatientProfileWhereInput = {};
    if (filters.patientId) where.id = filters.patientId;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }
    if (filters.riskLevel) {
      where.riskGrades = {
        some: { riskLevel: filters.riskLevel, isCurrent: true },
      };
    }

    const patients = await this.prisma.patientProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      include: {
        responsibleDoctor: {
          include: { user: { select: { displayName: true } } },
        },
        riskGrades: { where: { isCurrent: true }, take: 1 },
      },
    });

    return patients.map((patient) => ({
      patientExportId: this.exportStableId('patient', patient.id),
      maskedName: this.maskName(patient.name),
      gender: patient.gender,
      age: patient.age,
      maskedMobilePhone: this.maskPhone(patient.mobilePhone),
      maskedCaregiverName: this.maskNullableName(patient.caregiverName),
      maskedCaregiverPhone: this.maskPhone(patient.caregiverPhone),
      responsibleDoctor:
        patient.responsibleDoctor?.user.displayName ?? '未绑定',
      currentRiskLevel: patient.riskGrades[0]?.riskLevel ?? null,
      status: patient.status,
      createdAt: patient.createdAt.toISOString(),
    }));
  }

  private async exportAssessments(
    filters: ExportFilters,
  ): Promise<ExportRow[]> {
    const where: Prisma.AssessmentRecordWhereInput = {};
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }
    if (filters.riskLevel) {
      where.riskGrades = { some: { riskLevel: filters.riskLevel } };
    }

    const assessments = await this.prisma.assessmentRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      include: {
        patient: { select: { id: true, name: true } },
        riskGrades: { orderBy: { createdAt: 'desc' }, take: 1 },
        aiAnalyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return assessments.map((assessment) => {
      const score = this.asJsonObject(assessment.scoreSummary);
      return {
        assessmentExportId: this.exportStableId('assessment', assessment.id),
        patientExportId: this.exportStableId('patient', assessment.patientId),
        maskedPatientName: this.maskName(assessment.patient.name),
        assessmentType: assessment.assessmentType,
        mmse: this.exportNumber(score.mmse),
        cdr: this.exportNumber(score.cdr),
        memory: this.exportNumber(score.memory),
        orientation: this.exportNumber(score.orientation),
        executive: this.exportNumber(score.executive),
        language: this.exportNumber(score.language),
        riskLevel: assessment.riskGrades[0]?.riskLevel ?? null,
        aiConfidence: assessment.aiAnalyses[0]?.confidence ?? null,
        createdAt: assessment.createdAt.toISOString(),
      };
    });
  }

  private async exportTrainingRecords(
    filters: ExportFilters,
  ): Promise<ExportRow[]> {
    const where: Prisma.TrainingSessionWhereInput = {};
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.dateFrom || filters.dateTo) {
      where.startedAt = {};
      if (filters.dateFrom) where.startedAt.gte = filters.dateFrom;
      if (filters.dateTo) where.startedAt.lte = filters.dateTo;
    }
    if (filters.riskLevel) {
      where.patient = {
        riskGrades: {
          some: { riskLevel: filters.riskLevel, isCurrent: true },
        },
      };
    }
    if (filters.qualityFlag) {
      where.result = { qualityFlag: filters.qualityFlag };
    }

    const sessions = await this.prisma.trainingSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: filters.limit,
      include: {
        patient: { select: { id: true, name: true } },
        gameContent: { select: { name: true } },
        result: true,
      },
    });

    return sessions.map((session) => ({
      sessionExportId: this.exportStableId('session', session.id),
      patientExportId: this.exportStableId('patient', session.patientId),
      maskedPatientName: this.maskName(session.patient.name),
      gameName: session.gameContent.name,
      sessionStatus: session.sessionStatus,
      syncStatus: session.syncStatus,
      score: session.result?.score ?? null,
      completionRate: session.result?.completionRate ?? null,
      durationSeconds: session.result?.durationSeconds ?? null,
      reactionTimeMs: session.result?.reactionTimeMs ?? null,
      motionAccuracy: session.result?.motionAccuracy ?? null,
      exerciseIntensity: session.result?.exerciseIntensity ?? null,
      abnormalFlag: session.result?.abnormalFlag ?? null,
      qualityFlag: session.result?.qualityFlag ?? null,
      startedAt: session.startedAt.toISOString(),
    }));
  }

  private async exportConsents(filters: ExportFilters): Promise<ExportRow[]> {
    const where: Prisma.ConsentRecordWhereInput = {};
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.dateFrom || filters.dateTo) {
      where.grantedAt = {};
      if (filters.dateFrom) where.grantedAt.gte = filters.dateFrom;
      if (filters.dateTo) where.grantedAt.lte = filters.dateTo;
    }
    if (filters.riskLevel) {
      where.patient = {
        riskGrades: {
          some: { riskLevel: filters.riskLevel, isCurrent: true },
        },
      };
    }

    const consents = await this.prisma.consentRecord.findMany({
      where,
      orderBy: { grantedAt: 'desc' },
      take: filters.limit,
      include: { patient: { select: { name: true } } },
    });

    return consents.map((consent) => ({
      consentExportId: this.exportStableId('consent', consent.id),
      patientExportId: this.exportStableId('patient', consent.patientId),
      maskedPatientName: this.maskName(consent.patient.name),
      consentType: consent.consentType,
      consentVersion: consent.consentVersion,
      status: consent.status,
      grantedAt: consent.grantedAt.toISOString(),
      revokedAt: consent.revokedAt?.toISOString() ?? null,
    }));
  }

  private async exportAuditLogs(filters: ExportFilters): Promise<ExportRow[]> {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) where.createdAt.lte = filters.dateTo;
    }
    if (filters.patientId) {
      where.OR = [
        { targetId: filters.patientId },
        {
          metadata: {
            path: ['patientId'],
            equals: filters.patientId,
          },
        },
      ];
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
      include: { actor: { select: { account: true } } },
    });

    return logs.map((log) => ({
      auditLogExportId: this.exportStableId('audit', log.id),
      actorRole: log.actorRole ?? null,
      maskedActorAccount: this.maskAccount(log.actor?.account),
      action: log.action,
      targetType: log.targetType,
      targetExportId: log.targetId
        ? this.exportStableId(log.targetType, log.targetId)
        : null,
      result: log.result,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  private exportAuditFilters(filters: ExportFilters) {
    return {
      dateFrom: filters.dateFrom?.toISOString() ?? null,
      dateTo: filters.dateTo?.toISOString() ?? null,
      patientFilterApplied: Boolean(filters.patientId),
      patientExportId: filters.patientId
        ? this.exportStableId('patient', filters.patientId)
        : null,
      riskLevel: filters.riskLevel ?? null,
      qualityFlag: filters.qualityFlag ?? null,
      limit: filters.limit,
    };
  }

  private exportFilename(dataset: ExportDataset, format: ExportFormat = 'csv') {
    const stamp = new Date().toISOString().slice(0, 10);
    return `rehab-${dataset}-${stamp}.${format}`;
  }

  private toCsv(columns: string[], rows: ExportRow[]) {
    const bom = '\uFEFF';
    const lines = [
      columns.map((column) => this.escapeCsvValue(column)).join(','),
      ...rows.map((row) =>
        columns.map((column) => this.escapeCsvValue(row[column])).join(','),
      ),
    ];
    return `${bom}${lines.join('\n')}`;
  }

  private escapeCsvValue(value: ExportCellValue | undefined) {
    const rawText = value === null || value === undefined ? '' : String(value);
    const text = /^[=+\-@\t\r]/.test(rawText) ? `'${rawText}` : rawText;
    if (/[",\n\r]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  }

  private asJsonObject(value: Prisma.JsonValue): Prisma.JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private exportNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private exportStableId(scope: string, id: string) {
    return `${scope}_${createHash('sha256')
      .update(`${scope}:${id}`)
      .digest('hex')
      .slice(0, 12)}`;
  }

  private exportReasonHash(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;
    return createHash('sha256').update(value.trim()).digest('hex').slice(0, 16);
  }

  private safeExportTargetId(value: string) {
    return [
      'patients',
      'assessments',
      'training-records',
      'consents',
      'audit-logs',
    ].includes(value)
      ? value
      : 'invalid_dataset';
  }

  private safeErrorType(error: unknown) {
    if (error instanceof BadRequestException) return 'BadRequestException';
    if (error instanceof ForbiddenException) return 'ForbiddenException';
    if (error instanceof NotFoundException) return 'NotFoundException';
    return error instanceof Error ? error.constructor.name : 'UnknownError';
  }

  private buildAuditLogWhere(
    query: AuditLogQueryDto,
  ): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    const result = this.optionalString(query.result, '审计结果必须是文本。');
    if (result) {
      if (!['success', 'failed', 'denied'].includes(result)) {
        throw new BadRequestException(
          '审计结果必须是 success、failed 或 denied。',
        );
      }
      where.result = result as AuditResult;
    }

    const actorRole = this.optionalString(
      query.actorRole,
      '操作者角色必须是文本。',
    );
    if (actorRole) {
      if (!this.isRoleCode(actorRole)) {
        throw new BadRequestException('操作者角色无效。');
      }
      where.actorRole = actorRole as RoleCode;
    }

    const actorUserId = this.optionalString(
      query.actorUserId,
      '操作者 ID 必须是文本。',
    );
    if (actorUserId) where.actorUserId = actorUserId;

    const action = this.optionalString(query.action, '审计动作必须是文本。');
    if (action) where.action = action;

    const targetType = this.optionalString(
      query.targetType,
      '目标类型必须是文本。',
    );
    if (targetType) where.targetType = targetType;

    const targetId = this.optionalString(
      query.targetId,
      '目标 ID 必须是文本。',
    );
    if (targetId) where.targetId = targetId;

    const actorAccount = this.optionalString(
      query.actorAccount,
      '操作者账号必须是文本。',
    );
    if (actorAccount) {
      where.actor = {
        account: { contains: actorAccount, mode: 'insensitive' },
      };
    }

    const dateFrom = this.optionalString(
      query.dateFrom ?? query.from,
      '开始时间必须是文本。',
    );
    const dateTo = this.optionalString(
      query.dateTo ?? query.to,
      '结束时间必须是文本。',
    );
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom)
        where.createdAt.gte = this.parseDate(dateFrom, '开始时间无效。');
      if (dateTo)
        where.createdAt.lte = this.parseDate(dateTo, '结束时间无效。');
    }

    return where;
  }

  private resolveAuditLogTake(value: unknown) {
    if (value === undefined || value === null || value === '') return 100;
    const take = this.requiredInteger(value, '审计日志条数必须是整数。');
    this.assertRange(take, 1, 200, '审计日志条数必须在 1 到 200 之间。');
    return take;
  }

  private parseDate(value: string, message: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(message);
    }
    return date;
  }

  private requireAnyRole(user: RequestUser, roles: RoleCode[]) {
    if (!roles.some((role) => this.hasRole(user, role))) {
      throw new ForbiddenException('角色权限不足');
    }
  }

  private hasRole(user: RequestUser, role: RoleCode) {
    return user.roles.some((userRole) => userRole.roleCode === role);
  }

  private hasAnyAdminRole(user: RequestUser) {
    return user.roles.some((role) => this.isAdminRole(role.roleCode));
  }

  private isAdminRole(role: RoleCode) {
    return ['admin', 'admin_super', 'admin_operator', 'admin_auditor'].includes(
      role,
    );
  }

  private hasAdminPermission(user: RequestUser, permission: AdminPermission) {
    return user.roles.some((role) =>
      this.adminPermissions(role.roleCode).includes(permission),
    );
  }

  private requireAdminPermission(
    user: RequestUser,
    permission: AdminPermission,
  ) {
    if (!this.hasAdminPermission(user, permission)) {
      throw new ForbiddenException('后台权限不足');
    }
  }

  private adminPermissions(role: RoleCode): AdminPermission[] {
    if (role === 'admin' || role === 'admin_super') {
      return [
        'dashboard.view',
        'audit.read',
        'data.export',
        'user.manage',
        'game.manage',
        'game.publish',
      ];
    }
    if (role === 'admin_operator') {
      return ['dashboard.view', 'data.export', 'user.manage', 'game.manage'];
    }
    if (role === 'admin_auditor') {
      return ['dashboard.view', 'audit.read'];
    }
    return [];
  }

  private isRoleCode(value: string) {
    return [
      'patient',
      'caregiver',
      'doctor',
      'admin',
      'admin_super',
      'admin_operator',
      'admin_auditor',
    ].includes(value);
  }

  private primaryRole(user: RequestUser): RoleCode | undefined {
    const priority: RoleCode[] = [
      'admin_super',
      'admin_operator',
      'admin_auditor',
      'admin',
      'doctor',
      'caregiver',
      'patient',
    ];
    return priority.find((role) => this.hasRole(user, role));
  }

  private resolveHomePath(roles: RoleCode[]) {
    if (roles.some((role) => this.isAdminRole(role))) return '/admin';
    if (roles.includes('doctor')) return '/doctor';
    if (roles.includes('caregiver')) return '/family';
    return '/patient';
  }

  private maskName(name: string) {
    return name.length > 1 ? `${name[0]}*` : '*';
  }

  private maskNullableName(name?: string | null) {
    return name ? this.maskName(name) : null;
  }

  private maskPhone(phone?: string | null) {
    if (!phone) return null;
    if (phone.length < 7) return '*'.repeat(phone.length);
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }

  private maskAccount(account?: string | null) {
    if (!account) return null;
    if (account.length <= 2) return '*'.repeat(account.length);
    if (account.length <= 6) return `${account[0]}***${account.slice(-1)}`;
    return `${account.slice(0, 3)}***${account.slice(-2)}`;
  }

  private async audit(
    actorUserId: string | undefined,
    actorRole: RoleCode | undefined,
    action: string,
    targetType: string,
    targetId: string | undefined,
    result: AuditResult,
    metadata: Prisma.InputJsonValue = {},
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        actorRole,
        action,
        targetType,
        targetId,
        result,
        metadata,
      },
    });
  }
}
