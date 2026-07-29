import type { GameContent } from "@/types/api";

export const hiddenPatientTagPatterns = [
  /^engine:/i,
  /^license:/i,
  /^sensing:/i,
  /^runtime:/i,
  /mediapipe/i,
  /phaser/i,
  /unity_webgl/i,
];

const patientTrainingTagLabels = new Map<string, string>([
  ["attention", "注意力"],
  ["balance", "平衡练习"],
  ["coordination", "协调控制"],
  ["cognitive", "认知练习"],
  ["executive", "执行力"],
  ["gait-balance", "步态平衡"],
  ["language", "语言表达"],
  ["low_intensity", "低强度"],
  ["memory", "记忆力"],
  ["memory_sequence", "记忆序列"],
  ["moderate_intensity", "中等强度"],
  ["motor", "动作控制"],
  ["path_planning", "路线规划"],
  ["posture_control", "姿势控制"],
  ["reaction", "反应能力"],
  ["sequence", "序列回忆"],
  ["upper_limb", "上肢活动"],
  ["visual_tracking", "视觉追踪"],
  ["上肢活动", "上肢活动"],
  ["上肢训练", "上肢活动"],
  ["动作准确率", "动作控制"],
  ["中低强度", "中低强度"],
  ["低强度", "低强度"],
  ["中等强度", "中等强度"],
  ["反应", "反应能力"],
  ["反应能力", "反应能力"],
  ["注意力", "注意力"],
  ["记忆力", "记忆力"],
  ["近记忆", "记忆力"],
  ["序列回忆", "序列回忆"],
  ["路径完成", "路径完成"],
  ["双手协同", "协调控制"],
  ["节拍", "节奏控制"],
  ["左右切换", "左右切换"],
  ["节律", "节奏控制"],
  ["稳定性", "稳定性"],
  ["平衡", "平衡练习"],
  ["姿势控制", "姿势控制"],
  ["视觉追踪", "视觉追踪"],
  ["轨迹控制", "轨迹控制"],
  ["平滑度", "平滑度"],
  ["重心转移", "重心转移"],
  ["执行力", "执行力"],
  ["步态平衡", "步态平衡"],
  ["语言表达", "语言表达"],
  ["路线规划", "路线规划"],
]);

const patientDifficultyLabels = new Map<string, string>([
  ["basic", "基础"],
  ["easy", "基础"],
  ["standard", "标准"],
  ["medium", "标准"],
  ["normal", "标准"],
  ["advanced", "进阶"],
  ["hard", "进阶"],
  ["基础", "基础"],
  ["标准", "标准"],
  ["进阶", "进阶"],
  ["三步序列", "三步序列"],
  ["双色分拣", "双色分拣"],
  ["慢节律", "慢节律"],
  ["左右节拍", "左右节拍"],
  ["重心转移", "重心转移"],
  ["四点光轨", "四点光轨"],
  ["三步路径", "三步路径"],
]);

type PatientTrainingCategoryInput = Pick<GameContent, "runtimeType">;
type PatientTrainingPurposeLabel = "风险评估辅助" | "干预训练";

const patientTrainingPurposeLabels = new Map<string, PatientTrainingPurposeLabel>([
  ["purpose:risk_assessment", "风险评估辅助"],
  ["purpose:intervention", "干预训练"],
  ["风险评估辅助", "风险评估辅助"],
  ["干预训练", "干预训练"],
]);

export function patientTrainingTagsLabel(values: string[]) {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) continue;
    if (hiddenPatientTagPatterns.some((pattern) => pattern.test(value))) {
      continue;
    }

    const label = patientTrainingTagLabels.get(value);
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    labels.push(label);
  }

  if (!labels.length) {
    return [];
  }
  return labels;
}

export function patientTrainingTargetsLabel(values: string[]) {
  return patientTrainingTagsLabel(values).join("与");
}

export function patientTrainingCategoryLabel(
  input: PatientTrainingCategoryInput | string[],
) {
  if (Array.isArray(input)) {
    if (input.some((value) => value.trim() === "思维训练")) return "思维训练";
    if (input.some((value) => value.trim() === "运动训练")) return "运动训练";
    const labels = patientTrainingTagsLabel(input);
    if (labels.some((label) => /记忆|认知|注意|执行|序列|路径|视觉/.test(label))) {
      return "思维训练";
    }
    if (labels.some((label) => /上肢|动作|平衡|姿势|重心|协调|节奏/.test(label))) {
      return "运动训练";
    }
    return null;
  }

  switch (input.runtimeType) {
    case "cognitive_web":
      return "思维训练";
    case "browser_pose_canvas":
    case "unity_webgl":
      return "运动训练";
  }
}

export function patientTrainingPurposeLabel(values: string[]) {
  const labels: PatientTrainingPurposeLabel[] = [];
  const seen = new Set<PatientTrainingPurposeLabel>();

  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) continue;
    const label = patientTrainingPurposeLabels.get(value);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }

  return labels;
}

export function patientTrainingDifficultyLabel(value: string) {
  const normalized = value.trim();
  const mapped = patientDifficultyLabels.get(normalized.toLowerCase());
  if (mapped) return mapped;

  const businessLabel = patientDifficultyLabels.get(normalized);
  if (businessLabel) return businessLabel;

  return null;
}
