import { unityTrainingResultContractVersion } from "./unity-training-bridge";

export const rehabUnityBridgeScriptPath = "/unity/rehab-unity-bridge.js";
export const rehabUnityBridgeProtocolVersion = "1.0.0";

export type RehabUnityBridge = {
  protocolVersion: typeof rehabUnityBridgeProtocolVersion;
  resultContractVersion: typeof unityTrainingResultContractVersion;
  eventType: "training_result";
  postTrainingResultJson: (json: string, targetWindow?: Window) => unknown;
  getRuntimeConfig: () => Record<string, unknown>;
};

type ScriptLoader = (src: string) => Promise<void>;
type BridgeReader = () => unknown;

export async function loadRehabUnityBridge(
  loadScript: ScriptLoader,
  readBridge: BridgeReader = readWindowRehabUnityBridge,
): Promise<RehabUnityBridge> {
  await loadScript(rehabUnityBridgeScriptPath);
  const bridge = readBridge();

  if (!isPlainObject(bridge)) {
    throw new Error("Unity 平台桥接脚本未加载，不能启动正式 Unity 训练。");
  }
  if (bridge.protocolVersion !== rehabUnityBridgeProtocolVersion) {
    throw new Error(
      `Unity 平台桥接协议版本必须是 ${rehabUnityBridgeProtocolVersion}。`,
    );
  }
  if (bridge.resultContractVersion !== unityTrainingResultContractVersion) {
    throw new Error(
      `Unity 平台桥接结果合同版本必须是 ${unityTrainingResultContractVersion}。`,
    );
  }
  if (bridge.eventType !== "training_result") {
    throw new Error("Unity 平台桥接事件类型必须是 training_result。");
  }
  if (typeof bridge.postTrainingResultJson !== "function") {
    throw new Error("Unity 平台桥接脚本缺少 postTrainingResultJson。");
  }
  if (typeof bridge.getRuntimeConfig !== "function") {
    throw new Error("Unity 平台桥接脚本缺少 getRuntimeConfig。");
  }

  return bridge as RehabUnityBridge;
}

export function createUnityTrainingRuntimeFailureState(
  reason: "source" | "result",
) {
  const message =
    reason === "source"
      ? "训练结果来源无效，本次训练已停止，请重新进入任务。"
      : "训练结果无效，本次训练已停止，请重新进入任务。";
  return {
    runtimeState: "error" as const,
    manifestState: {
      state: "error" as const,
      message,
    },
  };
}

function readWindowRehabUnityBridge() {
  if (typeof window === "undefined") {
    throw new Error("Unity 平台桥接脚本只能在浏览器环境加载。");
  }
  return (window as Window & { RehabUnityBridge?: unknown }).RehabUnityBridge;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
