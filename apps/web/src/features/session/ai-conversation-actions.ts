import { api } from "@/lib/api";
import type {
  AiConversationSession,
  AssessmentRecord,
  AuthenticatedSession,
  CreateAssessmentRequest,
  PatientProfile,
  ReviewAiConversationRequest,
} from "@/types/api";

type AiConversationActionDependencies<TIdentity> = {
  aiConversations?: AiConversationSession[];
  captureRoleActionIdentity: () => TIdentity;
  handleRequestError: (error: unknown, defaultMessage: string) => void;
  isRoleActionIdentityCurrent: (identity: TIdentity) => boolean;
  patient?: PatientProfile;
  primaryRole?: string;
  reloadRoleData: (
    session: AuthenticatedSession,
    patientId?: string,
  ) => Promise<boolean>;
  session?: AuthenticatedSession | null;
  setActionStatus: (message: string | null) => void;
  setDataError: (message: string | null) => void;
  setDataStatus: (message: string) => void;
};

export function createAiConversationActions<TIdentity>({
  aiConversations,
  captureRoleActionIdentity,
  handleRequestError,
  isRoleActionIdentityCurrent,
  patient,
  primaryRole,
  reloadRoleData,
  session,
  setActionStatus,
  setDataError,
  setDataStatus,
}: AiConversationActionDependencies<TIdentity>) {
  async function handleCreateAssessmentFromAiConversation(
    payload: CreateAssessmentRequest,
  ): Promise<AssessmentRecord> {
    if (!session || !patient) {
      throw new Error("缺少医师会话或当前患者，不能保存正式评估。");
    }
    if (primaryRole !== "doctor") {
      throw new Error("当前角色不能从 AI 对话保存正式评估。");
    }
    if (payload.patientId !== patient.id) {
      throw new Error("正式评估请求的 patientId 与当前患者不一致。");
    }
    const conversationEvidence = payload.rawInputSummary.conversationEvidence;
    if (
      !conversationEvidence ||
      typeof conversationEvidence !== "object" ||
      Array.isArray(conversationEvidence)
    ) {
      throw new Error("正式评估请求缺少 AI 对话 session 证据。");
    }
    const conversationEvidenceRecord = conversationEvidence as Record<
      string,
      unknown
    >;
    const conversationSessionId = conversationEvidenceRecord.sessionId;
    const sourceConversation = aiConversations?.find(
      (item) => item.id === conversationSessionId,
    );
    if (
      !sourceConversation ||
      sourceConversation.patientId !== patient.id ||
      sourceConversation.status !== "pending_human_review" ||
      conversationEvidenceRecord.patientId !== patient.id ||
      conversationEvidenceRecord.status !== "pending_human_review"
    ) {
      throw new Error(
        "正式评估请求的 patientId/sessionId/status 与当前待复核 AI 对话不一致。",
      );
    }

    const actionIdentity = captureRoleActionIdentity();
    setDataError(null);
    setActionStatus("正在保存 AI 对话对应的待复核正式评估");
    try {
      const assessment = await api.createAssessment(payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) {
        throw new Error("正式评估返回时当前患者或医师会话已变化，已阻止回填。");
      }
      if (assessment.status !== "completed") {
        throw new Error("正式评估响应状态不是 completed，已阻止 AI 对话批准。");
      }
      if (!(await reloadRoleData(session, payload.patientId))) {
        throw new Error(
          "正式评估已返回，但患者数据刷新未完成，已阻止重复保存和 AI 对话批准。",
        );
      }
      setDataStatus("待复核正式评估已保存并回填");
      setActionStatus(
        "待复核正式评估已回填医师工作台，请继续使用既有评估复核按钮确认正式结论。",
      );
      return assessment;
    } catch (error) {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        handleRequestError(error, "待复核正式评估保存失败");
      }
      throw error;
    }
  }

  async function handleReviewAiConversationFromDoctor(
    sessionId: string,
    payload: ReviewAiConversationRequest,
  ): Promise<AiConversationSession> {
    if (!session || !patient) {
      throw new Error("缺少医师会话或当前患者，不能复核 AI 对话。");
    }
    if (primaryRole !== "doctor") {
      throw new Error("当前角色不能复核 AI 对话。");
    }
    const conversation = aiConversations?.find(
      (item) => item.id === sessionId,
    );
    if (
      !conversation ||
      conversation.patientId !== patient.id ||
      conversation.status !== "pending_human_review"
    ) {
      throw new Error(
        "AI 对话的 patientId/sessionId/status 与当前待复核记录不一致。",
      );
    }
    if (!payload.reviewNote.trim()) {
      throw new Error(
        payload.conclusion === "returned"
          ? "退回 AI 对话必须填写医师说明。"
          : "批准 AI 对话必须填写医师复核说明。",
      );
    }
    if (payload.conclusion === "approved") {
      const linkedAssessment = patient.assessments?.find((assessment) => {
        const evidence = assessment.rawInputSummary?.conversationEvidence;
        const evidenceRecord =
          evidence && typeof evidence === "object" && !Array.isArray(evidence)
            ? (evidence as Record<string, unknown>)
            : undefined;
        return (
          evidenceRecord?.patientId === patient.id &&
          evidenceRecord?.sessionId === sessionId &&
          evidenceRecord?.status === "pending_human_review" &&
          (assessment.status === "completed" ||
            assessment.status === "doctor_confirmed")
        );
      });
      if (!linkedAssessment) {
        throw new Error("当前 AI 对话尚无成功保存的正式评估，不能执行批准。");
      }
    }

    const actionIdentity = captureRoleActionIdentity();
    setDataError(null);
    setActionStatus(
      payload.conclusion === "approved"
        ? "正在批准 AI 对话"
        : "正在退回 AI 对话",
    );
    try {
      const reviewed = await api.reviewAiConversation(sessionId, payload);
      if (!isRoleActionIdentityCurrent(actionIdentity)) {
        throw new Error(
          "AI 对话复核返回时当前患者或医师会话已变化，已阻止回填。",
        );
      }
      if (!(await reloadRoleData(session, patient.id))) {
        throw new Error(
          "AI 对话复核已返回，但患者数据刷新未完成，已阻止重复操作。",
        );
      }
      setDataStatus("AI 对话复核状态已刷新");
      setActionStatus(
        payload.conclusion === "approved"
          ? "AI 对话已批准，正式评估仍按既有流程单独确认。"
          : "AI 对话已退回，患者可补充后再次提交。",
      );
      return reviewed;
    } catch (error) {
      if (isRoleActionIdentityCurrent(actionIdentity)) {
        handleRequestError(error, "AI 对话复核失败");
      }
      throw error;
    }
  }

  return {
    handleCreateAssessmentFromAiConversation,
    handleReviewAiConversationFromDoctor,
  };
}
