import type { GameContent } from "@/types/api";

export const browserPoseGameRequiredMetrics = [
  "reaction_time_ms",
  "target_hit_rate",
  "pose_visibility_avg",
  "arm_raise_accuracy",
] as const;

export type BrowserPoseRequiredMetricType =
  (typeof browserPoseGameRequiredMetrics)[number];

export type BrowserPosePresentationEngine = "react_canvas" | "phaser_canvas";

export type BrowserPoseScoringProfile =
  | "reaction_reach"
  | "memory_sequence"
  | "selective_sort"
  | "steady_breath"
  | "bilateral_coordination"
  | "trajectory_tracking"
  | "balance_shift";

export type BrowserPoseGameplayProfile = {
  scoringProfile: BrowserPoseScoringProfile;
  targetPrefix: string;
  stagePrompt: string;
  scoringHint: string;
  resultLabel: string;
  liveStatLabels: {
    actionWindows: string;
    reaction: string;
  };
  scoreWeights: {
    completion: number;
    accuracy: number;
    validFrame: number;
    reaction: number;
  };
};

export type BrowserPoseTargetSide = "left" | "right" | "both";

export type BrowserPoseTargetPatternPoint = {
  side: BrowserPoseTargetSide;
  x: number;
  y: number;
  radius: number;
  label: string;
};

export type BrowserPoseGameDefinition = {
  code: string;
  name: string;
  clinicalPurpose: string;
  patientInstruction: string;
  runtimeType: "browser_pose_canvas";
  presentationEngine: BrowserPosePresentationEngine;
  engineName: "React Canvas" | "Phaser";
  engineLicense: "MIT" | "Platform Source";
  sensingSource: "mediapipe_pose";
  scoringProfile: BrowserPoseScoringProfile;
  trainingTargets: string[];
  tags: string[];
  defaultDuration: number;
  defaultDifficulty: string;
  gameVersion: string;
  bridgeProtocolVersion: "1.0.0";
  buildStatus: "released";
  releaseChannel: "production";
  status: "active";
  supportedInputModes: readonly ["camera_pose"];
  requiredMetrics: ReadonlyArray<{
    metricType: BrowserPoseRequiredMetricType;
    unit: "ms" | "ratio";
    min: number;
    max?: number;
  }>;
  difficultyPolicy: Record<string, unknown>;
  dynamicDifficultyTriggers: Array<
    | "prior_assessment"
    | "reaction_slow"
    | "accuracy_high"
    | "accuracy_low"
    | "fatigue_risk"
    | "clinician_limit"
  >;
  requiredPermissions: readonly ["camera_capture"];
  resultSchema: Record<string, unknown>;
  publishedStatus: "published";
  targetIntervalMs: number;
  targetExpiresMs: number;
  targetPattern: BrowserPoseTargetPatternPoint[];
  minDurationSeconds: number;
  minValidFrameRatio: number;
  minAverageVisibility: number;
  minActionWindows: number;
};

export const browserPoseRequiredMetricContract: BrowserPoseGameDefinition["requiredMetrics"] =
  [
    { metricType: "reaction_time_ms", unit: "ms", min: 0, max: 60000 },
    { metricType: "target_hit_rate", unit: "ratio", min: 0, max: 1 },
    { metricType: "pose_visibility_avg", unit: "ratio", min: 0, max: 1 },
    { metricType: "arm_raise_accuracy", unit: "ratio", min: 0, max: 1 },
  ];

const sharedDynamicDifficultyTriggers: BrowserPoseGameDefinition["dynamicDifficultyTriggers"] =
  [
    "prior_assessment",
    "reaction_slow",
    "accuracy_high",
    "accuracy_low",
    "fatigue_risk",
    "clinician_limit",
  ];

const sharedBrowserPoseDifficultyPolicy = {
  source: "clinician_approved_plan",
  startingLevel: "from_latest_approved_assessment_and_plan_item",
  levels: [
    { level: 1, speed: 0.8, complexityLevel: 1 },
    { level: 2, speed: 1, complexityLevel: 2 },
    { level: 3, speed: 1.2, complexityLevel: 3 },
  ],
  safetyLimits: {
    minLevel: 1,
    maxLevel: 3,
    unchangedRequiresSafetyClampReason: true,
  },
};

const sharedBrowserPoseResultSchema = {
  schemaVersion: "1.0.0",
  requiredMetrics: [...browserPoseGameRequiredMetrics],
  requiredEvidence: [
    "dynamicDifficultyEvidence",
    "runtimeFrameId",
    "runtimeWindowId",
    "safetyClampReasonWhenUnchanged",
  ],
};

const sharedFormalBrowserPoseMetadata = {
  difficultyPolicy: sharedBrowserPoseDifficultyPolicy,
  dynamicDifficultyTriggers: sharedDynamicDifficultyTriggers,
  requiredPermissions: ["camera_capture"],
  resultSchema: sharedBrowserPoseResultSchema,
  publishedStatus: "published",
} as const;

export const browserPoseGameDefinitions = [
  {
    code: "garden_reach",
    name: "花园触达",
    clinicalPurpose: "训练反应速度、注意保持和上肢触达控制。",
    patientInstruction: "看到花朵亮起后，用对应手腕平稳触达目标区域。",
    runtimeType: "browser_pose_canvas",
    presentationEngine: "react_canvas",
    engineName: "React Canvas",
    engineLicense: "Platform Source",
    sensingSource: "mediapipe_pose",
    scoringProfile: "reaction_reach",
    trainingTargets: ["运动训练", "reaction", "attention", "upper_limb"],
    tags: [
      "运动训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "purpose:data_capture",
      "风险评估辅助",
      "干预训练",
      "数据采集",
      "中低强度",
      "反应",
      "动作准确率",
      "moderate_intensity",
    ],
    defaultDuration: 8,
    defaultDifficulty: "基础",
    gameVersion: "1.0.0",
    bridgeProtocolVersion: "1.0.0",
    buildStatus: "released",
    releaseChannel: "production",
    status: "active",
    supportedInputModes: ["camera_pose"],
    requiredMetrics: browserPoseRequiredMetricContract,
    ...sharedFormalBrowserPoseMetadata,
    targetIntervalMs: 1200,
    targetExpiresMs: 2600,
    minDurationSeconds: 60,
    minValidFrameRatio: 0.7,
    minAverageVisibility: 0.45,
    minActionWindows: 6,
    targetPattern: [
      { side: "right", x: 0.72, y: 0.34, radius: 0.12, label: "右手" },
      { side: "left", x: 0.22, y: 0.52, radius: 0.12, label: "左手" },
      { side: "right", x: 0.64, y: 0.42, radius: 0.12, label: "右手" },
      { side: "left", x: 0.26, y: 0.62, radius: 0.12, label: "左手" },
      { side: "right", x: 0.66, y: 0.3, radius: 0.12, label: "右手" },
      { side: "left", x: 0.2, y: 0.56, radius: 0.12, label: "左手" },
    ],
  },
  {
    code: "mirror_sequence",
    name: "镜像序列",
    clinicalPurpose: "训练工作记忆、动作顺序保持和双侧上肢协调。",
    patientInstruction: "按屏幕亮起顺序，用左右手依次完成镜像触达。",
    runtimeType: "browser_pose_canvas",
    presentationEngine: "phaser_canvas",
    engineName: "Phaser",
    engineLicense: "MIT",
    sensingSource: "mediapipe_pose",
    scoringProfile: "memory_sequence",
    trainingTargets: [
      "思维训练",
      "运动训练",
      "memory",
      "executive",
      "upper_limb",
    ],
    tags: [
      "思维训练",
      "运动训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "purpose:data_capture",
      "风险评估辅助",
      "干预训练",
      "数据采集",
      "近记忆",
      "执行力",
      "低强度",
      "memory",
      "executive",
    ],
    defaultDuration: 8,
    defaultDifficulty: "三步序列",
    gameVersion: "1.0.0",
    bridgeProtocolVersion: "1.0.0",
    buildStatus: "released",
    releaseChannel: "production",
    status: "active",
    supportedInputModes: ["camera_pose"],
    requiredMetrics: browserPoseRequiredMetricContract,
    ...sharedFormalBrowserPoseMetadata,
    targetIntervalMs: 1050,
    targetExpiresMs: 3000,
    minDurationSeconds: 60,
    minValidFrameRatio: 0.7,
    minAverageVisibility: 0.45,
    minActionWindows: 6,
    targetPattern: [
      { side: "left", x: 0.28, y: 0.38, radius: 0.115, label: "左上" },
      { side: "right", x: 0.72, y: 0.38, radius: 0.115, label: "右上" },
      { side: "left", x: 0.34, y: 0.6, radius: 0.115, label: "左下" },
      { side: "right", x: 0.66, y: 0.6, radius: 0.115, label: "右下" },
      { side: "left", x: 0.23, y: 0.5, radius: 0.115, label: "左中" },
      { side: "right", x: 0.77, y: 0.5, radius: 0.115, label: "右中" },
    ],
  },
  {
    code: "nebula_sort",
    name: "星云分拣",
    clinicalPurpose: "训练选择性注意、反应抑制和视觉分类能力。",
    patientInstruction: "只触达提示颜色的星球，忽略干扰目标。",
    runtimeType: "browser_pose_canvas",
    presentationEngine: "phaser_canvas",
    engineName: "Phaser",
    engineLicense: "MIT",
    sensingSource: "mediapipe_pose",
    scoringProfile: "selective_sort",
    trainingTargets: [
      "思维训练",
      "运动训练",
      "attention",
      "executive",
      "reaction",
      "upper_limb",
    ],
    tags: [
      "思维训练",
      "运动训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "purpose:data_capture",
      "风险评估辅助",
      "干预训练",
      "数据采集",
      "注意力",
      "执行力",
      "反应",
      "moderate_intensity",
    ],
    defaultDuration: 8,
    defaultDifficulty: "双色分拣",
    gameVersion: "1.0.0",
    bridgeProtocolVersion: "1.0.0",
    buildStatus: "released",
    releaseChannel: "production",
    status: "active",
    supportedInputModes: ["camera_pose"],
    requiredMetrics: browserPoseRequiredMetricContract,
    ...sharedFormalBrowserPoseMetadata,
    targetIntervalMs: 950,
    targetExpiresMs: 2400,
    minDurationSeconds: 60,
    minValidFrameRatio: 0.7,
    minAverageVisibility: 0.45,
    minActionWindows: 7,
    targetPattern: [
      { side: "right", x: 0.68, y: 0.32, radius: 0.105, label: "目标星球" },
      { side: "left", x: 0.3, y: 0.44, radius: 0.105, label: "目标星球" },
      { side: "right", x: 0.76, y: 0.58, radius: 0.105, label: "目标星球" },
      { side: "left", x: 0.22, y: 0.64, radius: 0.105, label: "目标星球" },
      { side: "right", x: 0.62, y: 0.48, radius: 0.105, label: "目标星球" },
      { side: "left", x: 0.38, y: 0.3, radius: 0.105, label: "目标星球" },
    ],
  },
  {
    code: "balance_breath",
    name: "平衡呼吸舱",
    clinicalPurpose: "训练稳定站姿、节律控制和低强度持续注意。",
    patientInstruction: "保持上半身稳定，按呼吸节奏用双手靠近光环。",
    runtimeType: "browser_pose_canvas",
    presentationEngine: "phaser_canvas",
    engineName: "Phaser",
    engineLicense: "MIT",
    sensingSource: "mediapipe_pose",
    scoringProfile: "steady_breath",
    trainingTargets: [
      "思维训练",
      "运动训练",
      "attention",
      "balance",
      "upper_limb",
    ],
    tags: [
      "思维训练",
      "运动训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "purpose:data_capture",
      "风险评估辅助",
      "干预训练",
      "数据采集",
      "低强度",
      "节律",
      "稳定性",
      "low_intensity",
    ],
    defaultDuration: 8,
    defaultDifficulty: "慢节律",
    gameVersion: "1.0.0",
    bridgeProtocolVersion: "1.0.0",
    buildStatus: "released",
    releaseChannel: "production",
    status: "active",
    supportedInputModes: ["camera_pose"],
    requiredMetrics: browserPoseRequiredMetricContract,
    ...sharedFormalBrowserPoseMetadata,
    targetIntervalMs: 1400,
    targetExpiresMs: 3400,
    minDurationSeconds: 60,
    minValidFrameRatio: 0.72,
    minAverageVisibility: 0.46,
    minActionWindows: 6,
    targetPattern: [
      { side: "both", x: 0.5, y: 0.34, radius: 0.13, label: "双手上举" },
      { side: "left", x: 0.3, y: 0.52, radius: 0.12, label: "左手慢触" },
      { side: "right", x: 0.7, y: 0.52, radius: 0.12, label: "右手慢触" },
      { side: "both", x: 0.5, y: 0.62, radius: 0.13, label: "双手回落" },
      { side: "left", x: 0.34, y: 0.4, radius: 0.12, label: "左侧稳定" },
      { side: "right", x: 0.66, y: 0.4, radius: 0.12, label: "右侧稳定" },
    ],
  },
  {
    code: "bilateral_rhythm_sync",
    name: "双手节拍协同",
    clinicalPurpose: "训练双侧上肢协同、节拍同步和左右切换控制。",
    patientInstruction:
      "跟随节拍，用左右手分别触达对应光点；双手提示时尽量同时完成。",
    runtimeType: "browser_pose_canvas",
    presentationEngine: "phaser_canvas",
    engineName: "Phaser",
    engineLicense: "MIT",
    sensingSource: "mediapipe_pose",
    scoringProfile: "bilateral_coordination",
    trainingTargets: ["运动训练", "coordination", "attention", "upper_limb"],
    tags: [
      "运动训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "purpose:data_capture",
      "风险评估辅助",
      "干预训练",
      "数据采集",
      "双手协同",
      "节拍",
      "左右切换",
      "moderate_intensity",
    ],
    defaultDuration: 8,
    defaultDifficulty: "左右节拍",
    gameVersion: "1.0.0",
    bridgeProtocolVersion: "1.0.0",
    buildStatus: "released",
    releaseChannel: "production",
    status: "active",
    supportedInputModes: ["camera_pose"],
    requiredMetrics: browserPoseRequiredMetricContract,
    ...sharedFormalBrowserPoseMetadata,
    targetIntervalMs: 1100,
    targetExpiresMs: 2800,
    minDurationSeconds: 60,
    minValidFrameRatio: 0.72,
    minAverageVisibility: 0.46,
    minActionWindows: 7,
    targetPattern: [
      { side: "both", x: 0.5, y: 0.36, radius: 0.13, label: "双手同步" },
      { side: "left", x: 0.28, y: 0.46, radius: 0.115, label: "左手节拍" },
      { side: "right", x: 0.72, y: 0.46, radius: 0.115, label: "右手节拍" },
      { side: "both", x: 0.5, y: 0.58, radius: 0.13, label: "双手合拍" },
      { side: "right", x: 0.66, y: 0.34, radius: 0.115, label: "右手切换" },
      { side: "left", x: 0.34, y: 0.62, radius: 0.115, label: "左手切换" },
    ],
  },
  {
    code: "orbital_trace_follow",
    name: "轨迹追踪巡航",
    clinicalPurpose: "训练视觉追踪、轨迹保持和平滑上肢控制。",
    patientInstruction: "沿着屏幕光轨平稳跟随移动，尽量不要偏离轨迹。",
    runtimeType: "browser_pose_canvas",
    presentationEngine: "phaser_canvas",
    engineName: "Phaser",
    engineLicense: "MIT",
    sensingSource: "mediapipe_pose",
    scoringProfile: "trajectory_tracking",
    trainingTargets: [
      "思维训练",
      "运动训练",
      "attention",
      "visual_tracking",
      "upper_limb",
    ],
    tags: [
      "思维训练",
      "运动训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "purpose:data_capture",
      "风险评估辅助",
      "干预训练",
      "数据采集",
      "视觉追踪",
      "轨迹控制",
      "平滑度",
      "moderate_intensity",
    ],
    defaultDuration: 8,
    defaultDifficulty: "四点光轨",
    gameVersion: "1.0.0",
    bridgeProtocolVersion: "1.0.0",
    buildStatus: "released",
    releaseChannel: "production",
    status: "active",
    supportedInputModes: ["camera_pose"],
    requiredMetrics: browserPoseRequiredMetricContract,
    ...sharedFormalBrowserPoseMetadata,
    targetIntervalMs: 300,
    targetExpiresMs: 1800,
    minDurationSeconds: 60,
    minValidFrameRatio: 0.72,
    minAverageVisibility: 0.46,
    minActionWindows: 12,
    targetPattern: [
      { side: "both", x: 0.22, y: 0.36, radius: 0.105, label: "光轨起点" },
      { side: "both", x: 0.42, y: 0.28, radius: 0.105, label: "上弧追踪" },
      { side: "both", x: 0.66, y: 0.4, radius: 0.105, label: "右侧巡航" },
      { side: "both", x: 0.76, y: 0.62, radius: 0.105, label: "下弧跟随" },
      { side: "both", x: 0.52, y: 0.7, radius: 0.105, label: "回环稳定" },
      { side: "both", x: 0.28, y: 0.58, radius: 0.105, label: "左侧回收" },
    ],
  },
  {
    code: "center_shift_bridge",
    name: "重心转移星桥",
    clinicalPurpose: "训练重心转移、站立平衡、姿态控制和持续注意。",
    patientInstruction:
      "跟随星桥提示缓慢移动身体中线，在左、中、右目标区内稳定保持。",
    runtimeType: "browser_pose_canvas",
    presentationEngine: "phaser_canvas",
    engineName: "Phaser",
    engineLicense: "MIT",
    sensingSource: "mediapipe_pose",
    scoringProfile: "balance_shift",
    trainingTargets: [
      "思维训练",
      "运动训练",
      "balance",
      "posture_control",
      "attention",
    ],
    tags: [
      "思维训练",
      "运动训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "purpose:data_capture",
      "风险评估辅助",
      "干预训练",
      "数据采集",
      "重心转移",
      "平衡",
      "姿态控制",
      "low_intensity",
    ],
    defaultDuration: 8,
    defaultDifficulty: "左右重心",
    gameVersion: "1.0.0",
    bridgeProtocolVersion: "1.0.0",
    buildStatus: "released",
    releaseChannel: "production",
    status: "active",
    supportedInputModes: ["camera_pose"],
    requiredMetrics: browserPoseRequiredMetricContract,
    ...sharedFormalBrowserPoseMetadata,
    targetIntervalMs: 1250,
    targetExpiresMs: 3200,
    minDurationSeconds: 60,
    minValidFrameRatio: 0.74,
    minAverageVisibility: 0.48,
    minActionWindows: 7,
    targetPattern: [
      { side: "left", x: 0.34, y: 0.5, radius: 0.11, label: "左侧重心" },
      { side: "both", x: 0.5, y: 0.48, radius: 0.1, label: "中线稳定" },
      { side: "right", x: 0.66, y: 0.5, radius: 0.11, label: "右侧重心" },
      { side: "both", x: 0.5, y: 0.58, radius: 0.1, label: "回到中线" },
      { side: "left", x: 0.3, y: 0.54, radius: 0.11, label: "左侧保持" },
      { side: "right", x: 0.7, y: 0.54, radius: 0.11, label: "右侧保持" },
    ],
  },
] as const satisfies readonly BrowserPoseGameDefinition[];

const browserPoseGameDefinitionMap: Map<string, BrowserPoseGameDefinition> =
  new Map(
    browserPoseGameDefinitions.map((definition) => [
      definition.code,
      definition,
    ]),
  );

const gameplayProfiles = {
  reaction_reach: {
    scoringProfile: "reaction_reach",
    targetPrefix: "反应动作",
    stagePrompt: "看到目标后快速、平稳完成动作。",
    scoringHint: "看到提示后越及时、动作越平稳，本次表现越好。",
    resultLabel: "反应触达表现",
    liveStatLabels: {
      actionWindows: "完成情况",
      reaction: "训练节奏",
    },
    scoreWeights: {
      completion: 52,
      accuracy: 28,
      validFrame: 12,
      reaction: 8,
    },
  },
  memory_sequence: {
    scoringProfile: "memory_sequence",
    targetPrefix: "记忆序列",
    stagePrompt: "记住屏幕亮起顺序，再按顺序完成动作。",
    scoringHint: "顺序记得越完整、动作越平稳，本次表现越好。",
    resultLabel: "记忆序列保持",
    liveStatLabels: {
      actionWindows: "序列完成",
      reaction: "序列节奏",
    },
    scoreWeights: {
      completion: 46,
      accuracy: 34,
      validFrame: 14,
      reaction: 6,
    },
  },
  selective_sort: {
    scoringProfile: "selective_sort",
    targetPrefix: "分拣目标",
    stagePrompt: "只靠近提示目标，避开干扰项。",
    scoringHint: "分拣越准确、干扰越少，本次表现越好。",
    resultLabel: "分拣抗干扰表现",
    liveStatLabels: {
      actionWindows: "分拣/干扰",
      reaction: "训练节奏",
    },
    scoreWeights: {
      completion: 48,
      accuracy: 30,
      validFrame: 10,
      reaction: 12,
    },
  },
  steady_breath: {
    scoringProfile: "steady_breath",
    targetPrefix: "呼吸稳定",
    stagePrompt: "跟随呼吸节律靠近光环并保持稳定。",
    scoringHint: "节律越稳定、双手越平稳，本次表现越好。",
    resultLabel: "呼吸稳定控制",
    liveStatLabels: {
      actionWindows: "保持情况",
      reaction: "节律间隔",
    },
    scoreWeights: {
      completion: 38,
      accuracy: 40,
      validFrame: 18,
      reaction: 4,
    },
  },
  bilateral_coordination: {
    scoringProfile: "bilateral_coordination",
    targetPrefix: "双手协同",
    stagePrompt: "跟随节拍完成左右手对应动作。",
    scoringHint: "双手配合越平稳、左右切换越清楚，本次表现越好。",
    resultLabel: "双手节拍协同",
    liveStatLabels: {
      actionWindows: "配合情况",
      reaction: "配合节奏",
    },
    scoreWeights: {
      completion: 42,
      accuracy: 38,
      validFrame: 12,
      reaction: 8,
    },
  },
  trajectory_tracking: {
    scoringProfile: "trajectory_tracking",
    targetPrefix: "路线跟随",
    stagePrompt: "沿着光轨连续、平稳地跟随。",
    scoringHint: "跟随越连续、动作越平稳，本次表现越好。",
    resultLabel: "轨迹追踪表现",
    liveStatLabels: {
      actionWindows: "路线进度",
      reaction: "跟随状态",
    },
    scoreWeights: {
      completion: 40,
      accuracy: 42,
      validFrame: 12,
      reaction: 6,
    },
  },
  balance_shift: {
    scoringProfile: "balance_shift",
    targetPrefix: "平衡移动",
    stagePrompt: "跟随星桥提示，平稳移动并保持身体中线。",
    scoringHint: "移动越平稳、保持越充分，本次表现越好。",
    resultLabel: "重心平衡控制",
    liveStatLabels: {
      actionWindows: "平衡进度",
      reaction: "移动状态",
    },
    scoreWeights: {
      completion: 38,
      accuracy: 42,
      validFrame: 16,
      reaction: 4,
    },
  },
} as const satisfies Record<
  BrowserPoseScoringProfile,
  BrowserPoseGameplayProfile
>;

export function listBrowserPoseGameDefinitions(): BrowserPoseGameDefinition[] {
  return browserPoseGameDefinitions.map(cloneBrowserPoseGameDefinition);
}

export function getBrowserPoseGameDefinition(
  code: string,
): BrowserPoseGameDefinition {
  const definition = browserPoseGameDefinitionMap.get(code);
  if (!definition) {
    throw new Error(`未配置正式浏览器体感游戏：${code}。`);
  }
  return cloneBrowserPoseGameDefinition(definition);
}

export function tryGetBrowserPoseGameDefinition(code: string) {
  const definition = browserPoseGameDefinitionMap.get(code);
  return definition ? cloneBrowserPoseGameDefinition(definition) : undefined;
}

export function getBrowserPoseGameplayProfile(
  scoringProfile: BrowserPoseScoringProfile,
): BrowserPoseGameplayProfile {
  return {
    ...gameplayProfiles[scoringProfile],
    liveStatLabels: { ...gameplayProfiles[scoringProfile].liveStatLabels },
    scoreWeights: { ...gameplayProfiles[scoringProfile].scoreWeights },
  };
}

export function buildBrowserPoseGameContentSeed(
  code: string,
): Pick<
  GameContent,
  | "code"
  | "name"
  | "trainingTargets"
  | "tags"
  | "defaultDuration"
  | "defaultDifficulty"
  | "runtimeType"
  | "manifestUrl"
  | "buildBaseUrl"
  | "gameVersion"
  | "bridgeProtocolVersion"
  | "buildStatus"
  | "releaseChannel"
  | "supportsCamera"
  | "supportsMicrophone"
  | "supportedInputModes"
  | "requiredMetrics"
  | "difficultyPolicy"
  | "dynamicDifficultyTriggers"
  | "requiredPermissions"
  | "resultSchema"
  | "publishedStatus"
  | "status"
> {
  const definition = getBrowserPoseGameDefinition(code);
  return {
    code: definition.code,
    name: definition.name,
    trainingTargets: [...definition.trainingTargets],
    tags: [...definition.tags],
    defaultDuration: definition.defaultDuration,
    defaultDifficulty: definition.defaultDifficulty,
    runtimeType: definition.runtimeType,
    manifestUrl: null,
    buildBaseUrl: null,
    gameVersion: definition.gameVersion,
    bridgeProtocolVersion: definition.bridgeProtocolVersion,
    buildStatus: definition.buildStatus,
    releaseChannel: definition.releaseChannel,
    supportsCamera: true,
    supportsMicrophone: false,
    supportedInputModes: [...definition.supportedInputModes],
    requiredMetrics: definition.requiredMetrics.map((metric) => ({
      ...metric,
    })),
    difficultyPolicy: cloneJsonObject(definition.difficultyPolicy),
    dynamicDifficultyTriggers: [...definition.dynamicDifficultyTriggers],
    requiredPermissions: [...definition.requiredPermissions],
    resultSchema: cloneJsonObject(definition.resultSchema),
    publishedStatus: definition.publishedStatus,
    status: definition.status,
  };
}

export function requiresEnhancedBrowserPoseStage(
  definition: BrowserPoseGameDefinition,
) {
  return definition.presentationEngine === "phaser_canvas";
}

function cloneBrowserPoseGameDefinition(
  definition: BrowserPoseGameDefinition,
): BrowserPoseGameDefinition {
  return {
    ...definition,
    trainingTargets: [...definition.trainingTargets],
    tags: [...definition.tags],
    supportedInputModes: [...definition.supportedInputModes],
    requiredMetrics: definition.requiredMetrics.map((metric) => ({
      ...metric,
    })),
    difficultyPolicy: cloneJsonObject(definition.difficultyPolicy),
    dynamicDifficultyTriggers: [...definition.dynamicDifficultyTriggers],
    requiredPermissions: [...definition.requiredPermissions],
    resultSchema: cloneJsonObject(definition.resultSchema),
    targetPattern: definition.targetPattern.map((target) => ({ ...target })),
  };
}

function cloneJsonObject<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
