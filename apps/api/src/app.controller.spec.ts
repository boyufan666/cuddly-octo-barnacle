import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: {
    appendAiConversationMessage: jest.Mock;
    createAiAssessmentDraft: jest.Mock;
    createAssessmentSpeechTranscript: jest.Mock;
    createCollectionBatch: jest.Mock;
    createCollectionCondition: jest.Mock;
    createCollectionProtocol: jest.Mock;
    createTtsSpeechOutput: jest.Mock;
    completeAiConversation: jest.Mock;
    createCareCircleComment: jest.Mock;
    createCareCirclePost: jest.Mock;
    createCarePrecaution: jest.Mock;
    listPatientAiConversations: jest.Mock;
    listCareCirclePosts: jest.Mock;
    listCollectionConditions: jest.Mock;
    listCollectionProtocols: jest.Mock;
    listPatientCollectionBatches: jest.Mock;
    moderateCareCirclePost: jest.Mock;
    listPatientRewards: jest.Mock;
    reviewAssessment: jest.Mock;
    reviewTrainingResult: jest.Mock;
    resumeTrainingSession: jest.Mock;
    abortTrainingSession: jest.Mock;
    startAiConversation: jest.Mock;
    startTrainingSession: jest.Mock;
    submitTrainingResult: jest.Mock;
    exportDataset: jest.Mock;
    getAiConversationAssessmentDraft: jest.Mock;
  };

  beforeEach(() => {
    appService = {
      appendAiConversationMessage: jest.fn(),
      createAiAssessmentDraft: jest.fn(),
      createAssessmentSpeechTranscript: jest.fn(),
      createCollectionBatch: jest.fn(),
      createCollectionCondition: jest.fn(),
      createCollectionProtocol: jest.fn(),
      createTtsSpeechOutput: jest.fn(),
      completeAiConversation: jest.fn(),
      createCareCircleComment: jest.fn(),
      createCareCirclePost: jest.fn(),
      createCarePrecaution: jest.fn(),
      listPatientAiConversations: jest.fn(),
      listCareCirclePosts: jest.fn(),
      listCollectionConditions: jest.fn(),
      listCollectionProtocols: jest.fn(),
      listPatientCollectionBatches: jest.fn(),
      moderateCareCirclePost: jest.fn(),
      listPatientRewards: jest.fn(),
      reviewAssessment: jest.fn(),
      reviewTrainingResult: jest.fn(),
      resumeTrainingSession: jest.fn(),
      abortTrainingSession: jest.fn(),
      startAiConversation: jest.fn(),
      startTrainingSession: jest.fn(),
      submitTrainingResult: jest.fn(),
      exportDataset: jest.fn(),
      getAiConversationAssessmentDraft: jest.fn(),
    };
    appController = new AppController(appService as unknown as AppService);
  });

  describe('health', () => {
    it('returns a dependency-free liveness result', () => {
      expect(appController.live()).toEqual({
        status: 'live',
        service: 'rehab-platform-api',
      });
    });

    it('delegates readiness to the dependency checker', async () => {
      const readiness = {
        assertReady: jest.fn().mockResolvedValue({
          status: 'ready',
          service: 'rehab-platform-api',
          migrationCount: 22,
        }),
      };
      const controller = new AppController(
        appService as unknown as AppService,
        readiness as never,
      );

      await expect(controller.ready()).resolves.toEqual({
        status: 'ready',
        service: 'rehab-platform-api',
        migrationCount: 22,
      });
      expect(readiness.assertReady).toHaveBeenCalledTimes(1);
    });
  });

  describe('training result review', () => {
    it('delegates training result review requests to the service', () => {
      appService.reviewTrainingResult.mockReturnValue({ id: 'result-id' });
      const user = { id: 'doctor-user-id' };
      const body = {
        reviewConclusion: 'needs_retrain',
        reviewNote: '姿态置信度不足，请重新训练。',
      };

      expect(
        appController.reviewTrainingResult(user as never, 'result-id', body),
      ).toEqual({
        id: 'result-id',
      });
      expect(appService.reviewTrainingResult).toHaveBeenCalledWith(
        user,
        'result-id',
        body,
      );
    });
  });

  describe('assessment review', () => {
    it('delegates assessment review requests to the service', () => {
      appService.reviewAssessment.mockReturnValue({
        id: 'assessment-id',
        riskGrades: [
          {
            id: 'risk-grade-id',
            confirmedById: 'doctor-user-id',
          },
        ],
      });
      const user = { id: 'doctor-user-id' };
      const body = {
        decision: 'approved',
        reviewNote: '已结合量表与访谈确认当前风险结论。',
        manualRiskLevel: 'moderate',
      };

      expect(
        appController.reviewAssessment(user as never, 'assessment-id', body),
      ).toEqual({
        id: 'assessment-id',
        riskGrades: [
          {
            id: 'risk-grade-id',
            confirmedById: 'doctor-user-id',
          },
        ],
      });
      expect(appService.reviewAssessment).toHaveBeenCalledWith(
        user,
        'assessment-id',
        body,
      );
    });
  });

  describe('training sessions', () => {
    it('delegates training session start requests to the service', () => {
      appService.startTrainingSession.mockReturnValue({ id: 'session-id' });
      const user = { id: 'patient-user-id' };
      const body = {
        planItemId: 'plan-item-id',
        gameContentId: 'game-id',
      };

      expect(appController.startTrainingSession(user as never, body)).toEqual({
        id: 'session-id',
      });
      expect(appService.startTrainingSession).toHaveBeenCalledWith(user, body);
    });

    it('delegates training result submission requests to the service', () => {
      appService.submitTrainingResult.mockReturnValue({ id: 'result-id' });
      const user = { id: 'patient-user-id' };
      const body = {
        score: 88,
        durationSeconds: 300,
      };

      expect(
        appController.submitTrainingResult(user as never, 'session-id', body),
      ).toEqual({
        id: 'result-id',
      });
      expect(appService.submitTrainingResult).toHaveBeenCalledWith(
        user,
        'session-id',
        body,
      );
    });

    it('delegates training session resume requests without creating a new session', () => {
      appService.resumeTrainingSession.mockReturnValue({
        id: 'session-id',
        sessionStatus: 'in_progress',
      });
      const user = { id: 'patient-user-id' };

      expect(
        appController.resumeTrainingSession(user as never, 'session-id'),
      ).toEqual({
        id: 'session-id',
        sessionStatus: 'in_progress',
      });
      expect(appService.resumeTrainingSession).toHaveBeenCalledWith(
        user,
        'session-id',
      );
      expect(appService.startTrainingSession).not.toHaveBeenCalled();
    });

    it('delegates the required abort reason DTO to the service unchanged', () => {
      appService.abortTrainingSession.mockReturnValue({
        id: 'session-id',
        sessionStatus: 'aborted',
      });
      const user = { id: 'doctor-user-id' };
      const body = { reason: '患者主动要求停止' };

      expect(
        appController.abortTrainingSession(user as never, 'session-id', body),
      ).toEqual({
        id: 'session-id',
        sessionStatus: 'aborted',
      });
      expect(appService.abortTrainingSession).toHaveBeenCalledWith(
        user,
        'session-id',
        body,
      );
    });
  });

  describe('AI assessment drafts', () => {
    it('delegates AI assessment draft generation requests to the service', () => {
      appService.createAiAssessmentDraft.mockReturnValue({
        status: 'pending_human_review',
      });
      const user = { id: 'doctor-user-id' };
      const body = {
        patientId: 'patient-profile-id',
        transcript: '患者完成 MMSE 量表，回忆与执行功能表现下降。',
      };

      expect(
        appController.createAiAssessmentDraft(user as never, body),
      ).toEqual({
        status: 'pending_human_review',
      });
      expect(appService.createAiAssessmentDraft).toHaveBeenCalledWith(
        user,
        body,
      );
    });

    it('delegates persisted AI assessment draft recovery requests to the service', async () => {
      appService.getAiConversationAssessmentDraft.mockReturnValue({
        status: 'pending_human_review',
      });
      const user = { id: 'doctor-user-id' };

      await expect(
        appController.getAiConversationAssessmentDraft(
          user as never,
          'conversation-session-id',
        ),
      ).resolves.toEqual({
        draft: {
          status: 'pending_human_review',
        },
      });
      expect(appService.getAiConversationAssessmentDraft).toHaveBeenCalledWith(
        user,
        'conversation-session-id',
      );
    });
  });

  describe('continuous AI conversations', () => {
    it('delegates AI conversation start requests to the service', () => {
      appService.startAiConversation.mockReturnValue({
        id: 'conversation-session-id',
      });
      const user = { id: 'doctor-user-id' };
      const body = {
        patientId: 'patient-profile-id',
        assessmentType: 'MMSE/CDR',
      };

      expect(appController.startAiConversation(user as never, body)).toEqual({
        id: 'conversation-session-id',
      });
      expect(appService.startAiConversation).toHaveBeenCalledWith(user, body);
    });

    it('delegates AI conversation message append requests to the service', () => {
      appService.appendAiConversationMessage.mockReturnValue({
        assistantMessage: { id: 'assistant-message-id' },
      });
      const user = { id: 'doctor-user-id' };
      const body = {
        content: '最近经常忘记日期。',
      };

      expect(
        appController.appendAiConversationMessage(
          user as never,
          'conversation-session-id',
          body,
        ),
      ).toEqual({
        assistantMessage: { id: 'assistant-message-id' },
      });
      expect(appService.appendAiConversationMessage).toHaveBeenCalledWith(
        user,
        'conversation-session-id',
        body,
      );
    });

    it('delegates AI conversation completion requests to the service', () => {
      appService.completeAiConversation.mockReturnValue({
        status: 'pending_human_review',
      });
      const user = { id: 'doctor-user-id' };
      const body = {
        summary: '患者主诉记忆和日期定向下降。',
        reviewNote: '请医生结合量表复核。',
      };

      expect(
        appController.completeAiConversation(
          user as never,
          'conversation-session-id',
          body,
        ),
      ).toEqual({
        status: 'pending_human_review',
      });
      expect(appService.completeAiConversation).toHaveBeenCalledWith(
        user,
        'conversation-session-id',
        body,
      );
    });

    it('delegates patient AI conversation listing requests to the service', () => {
      appService.listPatientAiConversations.mockReturnValue([
        { id: 'conversation-session-id' },
      ]);
      const user = { id: 'doctor-user-id' };

      expect(
        appController.listPatientAiConversations(
          user as never,
          'patient-profile-id',
        ),
      ).toEqual([{ id: 'conversation-session-id' }]);
      expect(appService.listPatientAiConversations).toHaveBeenCalledWith(
        user,
        'patient-profile-id',
      );
    });
  });

  describe('family care circle', () => {
    it('delegates care-circle listing requests to the service', () => {
      appService.listCareCirclePosts.mockReturnValue({
        posts: [{ id: 'post-id' }],
        precautions: [],
      });
      const user = { id: 'caregiver-user-id' };

      expect(
        appController.listCareCirclePosts(user as never, 'patient-profile-id'),
      ).toEqual({
        posts: [{ id: 'post-id' }],
        precautions: [],
      });
      expect(appService.listCareCirclePosts).toHaveBeenCalledWith(
        user,
        'patient-profile-id',
      );
    });

    it('delegates care-circle post creation requests to the service', () => {
      appService.createCareCirclePost.mockReturnValue({ id: 'post-id' });
      const user = { id: 'caregiver-user-id' };
      const body = {
        body: '今天训练完成得很好。',
        mood: 'encouragement',
      };

      expect(
        appController.createCareCirclePost(
          user as never,
          'patient-profile-id',
          body,
        ),
      ).toEqual({ id: 'post-id' });
      expect(appService.createCareCirclePost).toHaveBeenCalledWith(
        user,
        'patient-profile-id',
        body,
      );
    });

    it('delegates care-circle comment creation requests to the service', () => {
      appService.createCareCircleComment.mockReturnValue({ id: 'comment-id' });
      const user = { id: 'caregiver-user-id' };
      const body = { body: '注意休息，我们一起坚持。' };

      expect(
        appController.createCareCircleComment(user as never, 'post-id', body),
      ).toEqual({ id: 'comment-id' });
      expect(appService.createCareCircleComment).toHaveBeenCalledWith(
        user,
        'post-id',
        body,
      );
    });

    it('delegates care-circle moderation requests to the service', () => {
      appService.moderateCareCirclePost.mockReturnValue({
        moderationStatus: 'hidden',
      });
      const user = { id: 'doctor-user-id' };
      const body = {
        moderationStatus: 'hidden',
        reason: '包含不适合展示的信息。',
      };

      expect(
        appController.moderateCareCirclePost(user as never, 'post-id', body),
      ).toEqual({ moderationStatus: 'hidden' });
      expect(appService.moderateCareCirclePost).toHaveBeenCalledWith(
        user,
        'post-id',
        body,
      );
    });

    it('delegates care precaution creation requests to the service', () => {
      appService.createCarePrecaution.mockReturnValue({
        id: 'precaution-id',
      });
      const user = { id: 'doctor-user-id' };
      const body = {
        patientId: 'patient-profile-id',
        title: '训练前清理周围障碍物',
        content: '建议家属在旁观察，避免跌倒风险。',
        category: 'safety',
        priority: 'high',
        status: 'published',
      };

      expect(appController.createCarePrecaution(user as never, body)).toEqual({
        id: 'precaution-id',
      });
      expect(appService.createCarePrecaution).toHaveBeenCalledWith(user, body);
    });
  });

  describe('patient rewards', () => {
    it('delegates patient reward summary requests to the service', () => {
      appService.listPatientRewards.mockReturnValue({
        totalPoints: 10,
        ledger: [],
        achievements: [],
      });
      const user = { id: 'patient-user-id' };

      expect(
        appController.listPatientRewards(user as never, 'patient-profile-id'),
      ).toEqual({
        totalPoints: 10,
        ledger: [],
        achievements: [],
      });
      expect(appService.listPatientRewards).toHaveBeenCalledWith(
        user,
        'patient-profile-id',
      );
    });
  });

  describe('formal collection configuration', () => {
    it('delegates collection condition listing requests to the service', () => {
      appService.listCollectionConditions.mockReturnValue([
        { id: 'condition-id' },
      ]);
      const user = { id: 'admin-user-id' };

      expect(appController.listCollectionConditions(user as never)).toEqual([
        { id: 'condition-id' },
      ]);
      expect(appService.listCollectionConditions).toHaveBeenCalledWith(user);
    });

    it('delegates collection protocol listing requests to the service', () => {
      appService.listCollectionProtocols.mockReturnValue([
        { id: 'protocol-id' },
      ]);
      const user = { id: 'doctor-user-id' };

      expect(appController.listCollectionProtocols(user as never)).toEqual([
        { id: 'protocol-id' },
      ]);
      expect(appService.listCollectionProtocols).toHaveBeenCalledWith(user);
    });

    it('delegates collection condition creation requests to the service', () => {
      appService.createCollectionCondition.mockReturnValue({
        id: 'condition-id',
      });
      const user = { id: 'admin-user-id' };
      const body = {
        code: 'clinic_light_standing',
        name: '诊室标准光照站姿',
        environment: { lighting: 'standard_clinic' },
      };

      expect(
        appController.createCollectionCondition(user as never, body),
      ).toEqual({
        id: 'condition-id',
      });
      expect(appService.createCollectionCondition).toHaveBeenCalledWith(
        user,
        body,
      );
    });

    it('delegates collection protocol creation requests to the service', () => {
      appService.createCollectionProtocol.mockReturnValue({
        id: 'protocol-id',
      });
      const user = { id: 'admin-user-id' };
      const body = {
        conditionId: 'condition-id',
        code: 'rhythm_reach_clinic_v1',
        name: '节奏触达诊室协议',
        version: '1.0.0',
      };

      expect(
        appController.createCollectionProtocol(user as never, body),
      ).toEqual({
        id: 'protocol-id',
      });
      expect(appService.createCollectionProtocol).toHaveBeenCalledWith(
        user,
        body,
      );
    });

    it('delegates collection batch creation requests to the service', () => {
      appService.createCollectionBatch.mockReturnValue({
        id: 'collection-batch-id',
      });
      const user = { id: 'doctor-user-id' };
      const body = {
        patientId: 'patient-profile-id',
        rehabPlanId: 'plan-id',
        planItemId: 'plan-item-id',
        gameContentId: 'game-id',
        protocolId: 'protocol-id',
      };

      expect(appController.createCollectionBatch(user as never, body)).toEqual({
        id: 'collection-batch-id',
      });
      expect(appService.createCollectionBatch).toHaveBeenCalledWith(user, body);
    });

    it('delegates patient collection batch listing requests to the service', () => {
      appService.listPatientCollectionBatches.mockReturnValue([
        { id: 'collection-batch-id' },
      ]);
      const user = { id: 'doctor-user-id' };

      expect(
        appController.listPatientCollectionBatches(
          user as never,
          'patient-profile-id',
        ),
      ).toEqual([{ id: 'collection-batch-id' }]);
      expect(appService.listPatientCollectionBatches).toHaveBeenCalledWith(
        user,
        'patient-profile-id',
      );
    });
  });

  describe('speech assessment transcripts', () => {
    it('delegates speech transcript generation requests to the service', () => {
      appService.createAssessmentSpeechTranscript.mockReturnValue({
        status: 'pending_provider_integration',
      });
      const user = { id: 'doctor-user-id' };
      const body = {
        patientId: 'patient-profile-id',
        assessmentType: 'MMSE/CDR',
        audio: {
          contentBase64: 'Zm9ybWFsLWF1ZGlv',
          mimeType: 'audio/webm',
          durationSeconds: 42,
        },
      };

      expect(
        appController.createAssessmentSpeechTranscript(user as never, body),
      ).toEqual({
        status: 'pending_provider_integration',
      });
      expect(appService.createAssessmentSpeechTranscript).toHaveBeenCalledWith(
        user,
        body,
      );
    });
  });

  describe('TTS speech output', () => {
    it('delegates TTS speech output generation requests to the service', () => {
      appService.createTtsSpeechOutput.mockReturnValue({
        status: 'synthesized',
      });
      const user = { id: 'patient-user-id' };
      const body = {
        patientId: 'patient-profile-id',
        text: '今天的触达训练准备开始，请保持身体稳定。',
        scenario: 'training_cue',
      };

      expect(appController.createTtsSpeechOutput(user as never, body)).toEqual({
        status: 'synthesized',
      });
      expect(appService.createTtsSpeechOutput).toHaveBeenCalledWith(user, body);
    });
  });

  describe('data exports', () => {
    it('sets attachment headers with the service generated filename', async () => {
      appService.exportDataset.mockResolvedValue({
        filename: 'rehab-patients-2026-06-03.csv',
        format: 'csv',
        content: 'patient_id,name\\npatient_001,***',
      });
      const user = { id: 'admin-user-id' };
      const body = {
        format: 'csv',
        reason: '客户验收脱敏导出',
      };
      const response = {
        setHeader: jest.fn(),
      };

      await expect(
        appController.exportDataset(
          user as never,
          'patients',
          body,
          response as never,
        ),
      ).resolves.toBe('patient_id,name\\npatient_001,***');
      expect(appService.exportDataset).toHaveBeenCalledWith(
        user,
        'patients',
        body,
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="rehab-patients-2026-06-03.csv"',
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8',
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store',
      );
    });
  });
});
