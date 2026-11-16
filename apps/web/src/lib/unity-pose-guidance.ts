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
  coordinateSpace: "mirrored_viewport";
  screenX: number;
  screenY: number;
  side: "left" | "right";
  confidence: number;
  source: "camera_pose";
};

export type UnityPoseGuidanceOptions = {
  minVisibility?: number;
};

export type UnityPoseHitTrackerOptions = UnityPoseGuidanceOptions & {
  stableFrameCount?: number;
  minIntervalMs?: number;
};

export type UnityPoseHitTrackerUpdate = {
  guidance: UnityPoseGuidanceSnapshot;
  stableFrames: number;
  requiredStableFrames: number;
  lastAcceptedAtMs?: number;
  reachHits: UnityReachHit[];
};

const leftWristIndex = 15;
const rightWristIndex = 16;
const defaultMinVisibility = 0.45;
const defaultStableFrameCount = 2;
const defaultMinIntervalMs = 180;
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

  const leftWrist = toWristCursor(
    landmarks[leftWristIndex],
    "left",
    minVisibility,
  );
  const rightWrist = toWristCursor(
    landmarks[rightWristIndex],
    "right",
    minVisibility,
  );
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
  const minIntervalMs = Math.max(
    0,
    options.minIntervalMs ?? defaultMinIntervalMs,
  );
  const states = {
    left: { frames: 0, lastEmit: Number.NEGATIVE_INFINITY },
    right: { frames: 0, lastEmit: Number.NEGATIVE_INFINITY },
  };
  let lastAcceptedAtMs: number | undefined;
  let nextTargetId = 1;

  return {
    update(
      landmarks: UnityPoseGuidanceLandmark[],
      timestampMs: number,
    ): UnityPoseHitTrackerUpdate {
      const guidance = buildUnityPoseGuidanceSnapshot(landmarks, {
        minVisibility,
      });
      const reachHits: UnityReachHit[] = [];
      for (const side of ["left", "right"] as const) {
        const state = states[side];
        const wrist =
          side === "left" ? guidance.leftWrist : guidance.rightWrist;
        if (!wrist) {
          state.frames = 0;
          continue;
        }
        state.frames += 1;
        if (
          state.frames < stableFrameCount ||
          timestampMs - state.lastEmit < minIntervalMs
        )
          continue;
        state.lastEmit = timestampMs;
        lastAcceptedAtMs = timestampMs;
        reachHits.push({
          targetId: `webgl-pose-${nextTargetId++}`,
          coordinateSpace: "mirrored_viewport",
          screenX: wrist.screenX,
          screenY: wrist.screenY,
          side,
          confidence: roundRatio(wrist.visibility),
          source: "camera_pose",
        });
      }
      return {
        guidance,
        stableFrames: Math.max(states.left.frames, states.right.frames),
        requiredStableFrames: stableFrameCount,
        lastAcceptedAtMs,
        reachHits,
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

/** This game's input coordinates changed in 0.1.3; the result envelope remains 1.0.0. */
export function assertUnityReachInputContract(
  game: {
    code: string;
    gameVersion?: string | null;
    bridgeProtocolVersion?: string | null;
    manifestUrl?: string | null;
    buildBaseUrl?: string | null;
  },
  session: {
    unityBuildVersion?: string | null;
    bridgeProtocolVersion?: string | null;
    runtimeConfigSnapshot?: unknown;
  },
): void {
  const snapshot = session.runtimeConfigSnapshot;
  if (
    game.code !== "rhythm_reach_3d" ||
    game.gameVersion !== "0.1.3" ||
    game.bridgeProtocolVersion !== "1.0.0" ||
    session.unityBuildVersion !== game.gameVersion ||
    session.bridgeProtocolVersion !== game.bridgeProtocolVersion ||
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot)
  ) {
    throw new Error("Unity 触达输入版本与训练会话不一致，不能启动训练。");
  }
  const config = snapshot as Record<string, unknown>;
  if (
    config.gameVersion !== game.gameVersion ||
    config.bridgeProtocolVersion !== game.bridgeProtocolVersion ||
    config.manifestUrl !== game.manifestUrl ||
    config.buildBaseUrl !== game.buildBaseUrl
  ) {
    throw new Error("Unity 触达输入版本与训练会话快照不一致，不能启动训练。");
  }
}
