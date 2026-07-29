import type { ConsentRecord, ConsentType, PatientProfile } from "@/types/api";

export const patientConsentVersion = "v1.2";

export const patientConsentDefinitions: Array<{
  type: ConsentType;
  title: string;
  description: string;
}> = [
  {
    type: "privacy_policy",
    title: "隐私授权",
    description: "允许平台保存账号、资料和必要服务记录。",
  },
  {
    type: "ai_processing",
    title: "评估数据授权",
    description: "允许平台处理量表分数、问答文本和评估摘要。",
  },
  {
    type: "camera_capture",
    title: "摄像头训练授权",
    description: "允许训练时记录动作表现和完成情况。",
  },
  {
    type: "microphone_capture",
    title: "语音评估授权",
    description: "允许评估时使用录音、转写和题目播报。",
  },
  {
    type: "caregiver_sharing",
    title: "家属共享授权",
    description: "允许授权家属查看脱敏训练进展和必要提醒摘要。",
  },
];

export function consentLabel(type: ConsentType) {
  return (
    patientConsentDefinitions.find((definition) => definition.type === type)
      ?.title ?? type
  );
}

export function summarizePatientConsents(patient: PatientProfile) {
  return patientConsentDefinitions.reduce(
    (summary, definition) => {
      summary[definition.type] = patient.consents.find(
        (consent) =>
          consent.consentType === definition.type &&
          consent.consentVersion === patientConsentVersion &&
          consent.status === "granted" &&
          !consent.revokedAt,
      );
      return summary;
    },
    {} as Partial<Record<ConsentType, ConsentRecord>>,
  );
}
