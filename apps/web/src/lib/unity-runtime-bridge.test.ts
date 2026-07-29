import assert from "node:assert/strict";
import test from "node:test";
import {
  createUnityTrainingRuntimeFailureState,
  loadRehabUnityBridge,
  rehabUnityBridgeScriptPath,
} from "./unity-runtime-bridge.ts";

function validBridge(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: "1.0.0",
    resultContractVersion: "rehab-unity-result-v2",
    eventType: "training_result",
    postTrainingResultJson: () => undefined,
    getRuntimeConfig: () => ({}),
    ...overrides,
  };
}

test("loadRehabUnityBridge loads the platform bridge script before formal Unity start", async () => {
  const loadedScripts: string[] = [];
  const result = await loadRehabUnityBridge(
    async (src) => {
      loadedScripts.push(src);
    },
    () => validBridge(),
  );

  assert.deepEqual(loadedScripts, [rehabUnityBridgeScriptPath]);
  assert.equal(result.protocolVersion, "1.0.0");
  assert.equal(result.resultContractVersion, "rehab-unity-result-v2");
});

test("loadRehabUnityBridge rejects when the bridge script does not expose RehabUnityBridge", async () => {
  await assert.rejects(
    () =>
      loadRehabUnityBridge(
        async () => undefined,
        () => undefined,
      ),
    /Unity 平台桥接脚本未加载/,
  );
});

test("loadRehabUnityBridge rejects a bridge protocol mismatch instead of downgrading", async () => {
  await assert.rejects(
    () =>
      loadRehabUnityBridge(
        async () => undefined,
        () => validBridge({ protocolVersion: "0.9.0" }),
      ),
    /桥接协议版本必须是 1.0.0/,
  );
});

test("loadRehabUnityBridge rejects a missing or stale result contract before Unity starts", async () => {
  const bridgeWithoutResultContractVersion = { ...validBridge() };
  Reflect.deleteProperty(
    bridgeWithoutResultContractVersion,
    "resultContractVersion",
  );

  await assert.rejects(
    () =>
      loadRehabUnityBridge(
        async () => undefined,
        () => bridgeWithoutResultContractVersion,
      ),
    /结果合同版本必须是 rehab-unity-result-v2/,
  );
  await assert.rejects(
    () =>
      loadRehabUnityBridge(
        async () => undefined,
        () =>
          validBridge({
            resultContractVersion: "rehab-unity-result-v1",
          }),
      ),
    /结果合同版本必须是 rehab-unity-result-v2/,
  );
});

test("Unity message validation failures produce a visible terminal runtime state", () => {
  const sourceFailure = createUnityTrainingRuntimeFailureState("source");
  assert.equal(sourceFailure.runtimeState, "error");
  assert.equal(sourceFailure.manifestState.state, "error");
  assert.match(sourceFailure.manifestState.message, /来源无效/);

  const resultFailure = createUnityTrainingRuntimeFailureState("result");
  assert.equal(resultFailure.runtimeState, "error");
  assert.equal(resultFailure.manifestState.state, "error");
  assert.match(resultFailure.manifestState.message, /训练结果无效/);
});
