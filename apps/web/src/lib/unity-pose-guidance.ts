export type UnityPoseGuidanceLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type UnityPoseWristCursor = {
  side: "left" | "right";
  screenX: number;
  screenY: number;
  visibility: number;
};

export type UnityPoseGuidanceSnapshot = {
  status: "tracking" | "low_visibility" | "no_pose";
  instruction: string;
  leftWrist?: UnityPoseWristCursor;
  rightWrist?: UnityPoseWristCursor;
  averageVisibility: number;
};

export type UnityReachHit = {
  targetId: string;
  x: number;
  y: number;
  z: number;
  confidence: number;
  source: "camera_pose";
};

export type UnityPoseGuidanceOptions = {
  minVisibility?: number;
};

export type UnityPoseHitTrackerOptions = UnityPoseGuidanceOptions & {
  stableFrameCount?: number;
  minIntervalMs?: number;
  reachXMin?: number;
  reachXMax?: number;
  reachYMin?: number;
  reachYMax?: number;
  reachZ?: number;
};

export type UnityPoseHitTrackerUpdate = {
  guidance: UnityPoseGuidanceSnapshot;
  stableFrames: number;
  requiredStableFrames: number;
  lastAcceptedAtMs?: number;
  reachHit?: UnityReachHit;
};

const leftWristIndex = 15;
const rightWristIndex = 16;
const defaultMinVisibility = 0.45;
const defaultStableFrameCount = 2;
const defaultMinIntervalMs = 180;
const defaultReachXMin = -1.5;
const defaultReachXMax = 1.5;
const defaultReachYMin = -1.1;
const defaultReachYMax = 1.1;
const defaultReachZ = 4;

export function buildUnityPoseGuidanceSnapshot(
  landmarks: UnityPoseGuidanceLandmark[],
  options: UnityPoseGuidanceOptions = {},
): UnityPoseGuidanceSnapshot {
  const minVisibility = options.minVisibility ?? defaultMinVisibility;
  const averageVisibility = roundRatio(averageVisibilityOf(landmarks));
  if (!landmarks.length) {
    return {
      status: "no_pose",
      instruction: "请面对摄像头并让上半身完整入镜。",
      averageVisibility,
    };
  }

  const leftWrist = toWristCursor(landmarks[leftWristIndex], "left", minVisibility);
  const rightWrist = toWristCursor(landmarks[rightWristIndex], "right", minVisibility);
  if (!leftWrist && !rightWrist) {
    return {
      status: "low_visibility",
      instruction: "识别置信度偏低，请改善光线、站远一点并保持双手入镜。",
      averageVisibility,
    };
  }

  return {
    status: "tracking",
    instruction: rightWrist
      ? "请用右手或左手触达 Unity 画面中的发光目标。"
      : "已看到左手，请保持另一只手入镜并触达目标。",
    leftWrist,
    rightWrist,
    averageVisibility,
  };
}

export function createUnityPoseHitTracker(
  options: UnityPoseHitTrackerOptions = {},
) {
  const minVisibility = options.minVisibility ?? defaultMinVisibility;
  const stableFrameCount = Math.max(
    1,
    Math.round(options.stableFrameCount ?? defaultStableFrameCount),
  );
  const minIntervalMs = Math.max(0, options.minIntervalMs ?? defaultMinIntervalMs);
  const reachXMin = options.reachXMin ?? defaultReachXMin;
  const reachXMax = options.reachXMax ?? defaultReachXMax;
  const reachYMin = options.reachYMin ?? defaultReachYMin;
  const reachYMax = options.reachYMax ?? defaultReachYMax;
  const reachZ = options.reachZ ?? defaultReachZ;

  let stableSide: UnityPoseWristCursor["side"] | undefined;
  let stableFrames = 0;
  let lastEmitAtMs = Number.NEGATIVE_INFINITY;
  let lastAcceptedAtMs: number | undefined;
  let nextTargetId = 1;

  return {
    update(
      landmarks: UnityPoseGuidanceLandmark[],
      timestampMs: number,
    ): UnityPoseHitTrackerUpdate {
      const guidance = buildUnityPoseGuidanceSnapshot(landmarks, { minVisibility });
      if (guidance.status !== "tracking") {
        stableSide = undefined;
        stableFrames = 0;
        return {
          guidance,
          stableFrames,
          requiredStableFrames: stableFrameCount,
          lastAcceptedAtMs,
        };
      }

      const wrist = chooseReachWrist(guidance);
      if (!wrist) {
        stableSide = undefined;
        stableFrames = 0;
        return {
          guidance,
          stableFrames,
          requiredStableFrames: stableFrameCount,
          lastAcceptedAtMs,
        };
      }

      if (stableSide === wrist.side) {
        stableFrames += 1;
      } else {
        stableSide = wrist.side;
        stableFrames = 1;
      }

      if (
        stableFrames < stableFrameCount ||
        timestampMs - lastEmitAtMs < minIntervalMs
      ) {
        return {
          guidance,
          stableFrames,
          requiredStableFrames: stableFrameCount,
          lastAcceptedAtMs,
        };
      }

      lastEmitAtMs = timestampMs;
      lastAcceptedAtMs = timestampMs;
      return {
        guidance,
        stableFrames,
        requiredStableFrames: stableFrameCount,
        lastAcceptedAtMs,
        reachHit: {
          targetId: `webgl-pose-${nextTargetId++}`,
          x: roundCoordinate(
            reachXMin + wrist.screenX * (reachXMax - reachXMin),
          ),
          y: roundCoordinate(
            reachYMax - wrist.screenY * (reachYMax - reachYMin),
          ),
          z: reachZ,
          confidence: roundRatio(wrist.visibility),
          source: "camera_pose",
        },
      };
    },
  };
}

function toWristCursor(
  landmark: UnityPoseGuidanceLandmark | undefined,
  side: UnityPoseWristCursor["side"],
  minVisibility: number,
) {
  const visibility = landmark?.visibility ?? 0;
  if (!landmark || visibility < minVisibility) {
    return undefined;
  }

  return {
    side,
    screenX: roundRatio(1 - landmark.x),
    screenY: roundRatio(landmark.y),
    visibility: roundRatio(visibility),
  };
}

function chooseReachWrist(guidance: UnityPoseGuidanceSnapshot) {
  if (!guidance.leftWrist) return guidance.rightWrist;
  if (!guidance.rightWrist) return guidance.leftWrist;
  return guidance.leftWrist.visibility >= guidance.rightWrist.visibility
    ? guidance.leftWrist
    : guidance.rightWrist;
}

function averageVisibilityOf(landmarks: UnityPoseGuidanceLandmark[]) {
  if (!landmarks.length) return 0;
  return (
    landmarks.reduce((sum, landmark) => sum + (landmark.visibility ?? 0), 0) /
    landmarks.length
  );
}

function roundRatio(value: number) {
  return Number(value.toFixed(3));
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(4));
}
