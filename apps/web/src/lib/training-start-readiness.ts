export type TrainingStartReadinessInput = {
  hasPlanItem: boolean;
  gameReady: boolean;
  requiresCameraCheck: boolean;
  deviceReady: boolean;
  poseReady: boolean;
  trainingPreparationReady: boolean;
  isBusy: boolean;
};

export type TrainingStartBlockedKey =
  | "busy"
  | "plan_item"
  | "game_content"
  | "device"
  | "pose"
  | "training_preparation";

export type TrainingStartReadinessResult = {
  canStart: boolean;
  blockedKey?: TrainingStartBlockedKey;
  message?: string;
};

export function resolveTrainingStartReadiness(
  input: TrainingStartReadinessInput,
): TrainingStartReadinessResult {
  if (input.isBusy) {
    return {
      canStart: false,
      blockedKey: "busy",
      message: "正在创建训练，请稍候。",
    };
  }
  if (!input.hasPlanItem) {
    return {
      canStart: false,
      blockedKey: "plan_item",
      message: "请先在今日训练中选择要开始的训练任务。",
    };
  }
  if (!input.gameReady) {
    return {
      canStart: false,
      blockedKey: "game_content",
      message: "训练内容尚未准备完成，请联系医师或工作人员处理。",
    };
  }
  if (input.requiresCameraCheck && !input.deviceReady) {
    return {
      canStart: false,
      blockedKey: "device",
      message: "请先完成摄像头设备检测，再开始训练。",
    };
  }
  if (input.requiresCameraCheck && !input.poseReady) {
    return {
      canStart: false,
      blockedKey: "pose",
      message: "请先完成站位和动作识别检查，再开始训练。",
    };
  }
  if (!input.trainingPreparationReady) {
    return {
      canStart: false,
      blockedKey: "training_preparation",
      message: "今天的训练还未完成准备，请联系医师或工作人员处理。",
    };
  }
  return { canStart: true };
}
