# Unity WebGL 训练桥接协议 v1.0.0

## 交付策略

一期建议采用“自研轻量 Unity WebGL 训练壳 + 可替换游戏内容”的方式交付。

- 如果客户已有 Unity 游戏：按本文协议接入，游戏结束时回传结构化结果。
- 如果我们自研游戏：先做 1 个正式可用的轻量体感训练游戏，例如 `rhythm_reach_3d`，仍按同一协议回传。
- 不建议一期直接承诺复杂多游戏自研包；也不建议接黑盒游戏且无法控制数据结构。

## Web 资源放置规范

Unity WebGL 构建产物统一放在：

```text
apps/web/public/unity/<gameCode>/<version>/
```

建议目录：

```text
apps/web/public/unity/rhythm_reach_3d/0.1.2/
  Build/
    rhythm_reach_3d.loader.js
    rhythm_reach_3d.framework.js
    rhythm_reach_3d.data
    rhythm_reach_3d.wasm
  manifest.json
```

平台 SDK 文件固定为：

```text
apps/web/public/unity/rehab-unity-bridge.js
```

Unity 页面或 WebGL 模板需要先加载该文件，再调用 `window.RehabUnityBridge.postTrainingResult(...)`。

自研 `rhythm_reach_3d` 当前由 Unity Editor 构建入口生成正式 WebGL 产物和 manifest：

```bash
"/Volumes/UnityEditors/Hub/Editor/6000.0.75f1/Unity.app/Contents/MacOS/Unity" \
  -batchmode \
  -nographics \
  -quit \
  -projectPath "/Users/thl/IdeaProjects/Rehabilitation platform/unity/rhythm-reach-3d" \
  -executeMethod Rehab.EditorTools.RhythmReachWebGlBuilder.BuildFormalWebGl \
  -logFile "/Users/thl/IdeaProjects/Rehabilitation platform/unity-rhythm-reach-webgl-build.log"
```

## Web -> Unity runtime config

平台必须从开始训练响应的服务端运行配置快照取得 `clientStartedAt` 与
`trainingSession.collectionBatchId`，并从当前医生已批准的 `planItem.durationMinutes` 计算
`durationSeconds = durationMinutes * 60`。随后将三者原样发送给 Unity：

```json
{
  "type": "training_config",
  "action": "training_config",
  "protocolVersion": "1.0.0",
  "resultContractVersion": "rehab-unity-result-v2",
  "sessionId": "training-session-id",
  "clientStartedAt": "2026-05-20T06:15:00.000Z",
  "collectionBatchId": "collection-batch-id",
  "gameRunId": "run-001",
  "gameCode": "rhythm_reach_3d",
  "gameVersion": "0.1.2",
  "deviceCode": "camera-001",
  "bridgeProtocolVersion": "1.0.0",
  "durationSeconds": 900,
  "minConfidence": 0.8
}
```

`resultContractVersion`、`clientStartedAt`、`collectionBatchId` 和 `durationSeconds` 都是必填字段。
`resultContractVersion` 当前固定为 `rehab-unity-result-v2`，它是 runtime config、C# 结果
envelope、公共 bridge 与 TypeScript parser 共用的版本化合同标识。Unity 必须拒绝缺失、空白或非正数
配置；不得生成批次 ID，不得使用场景默认时长，也不得在配置错误时继续使用上一次配置。
`GameSessionController` 必须以该 `durationSeconds` 控制本次 session 的完成时机。

## Unity -> Web 训练结果事件

Unity 训练结束后必须向父页面发送 `postMessage`。事件结构如下：

```json
{
  "type": "training_result",
  "action": "training_result",
  "protocolVersion": "1.0.0",
  "resultContractVersion": "rehab-unity-result-v2",
  "sessionId": "training-session-id",
  "collectionBatchId": "collection-batch-id",
  "gameRunId": "run-001",
  "gameVersion": "0.1.2",
  "clientGeneratedAt": "2026-05-20T06:30:00.000Z",
  "rawPayloadHash": "sha256-payload-hash",
  "score": 86,
  "completionRate": 0.9,
  "durationSeconds": 900,
  "reactionTimeMs": 720,
  "motionAccuracy": 0.82,
  "exerciseIntensity": "moderate",
  "metricsSummary": {
    "source": "unity_webgl",
    "resultContractVersion": "rehab-unity-result-v2",
    "collectionBatchId": "collection-batch-id",
    "gameCode": "rhythm_reach_3d",
    "gameVersion": "0.1.2",
    "deviceCode": "camera-001",
    "gameRunId": "run-001",
    "protocolVersion": "1.0.0",
    "clientGeneratedAt": "2026-05-20T06:30:00.000Z",
    "rawPayloadHash": "sha256-payload-hash",
    "dynamicDifficultyEvidence": {
      "schemaVersion": "1.0.0",
      "events": [
        {
          "startingLevel": 2,
          "startingLevelSource": "clinician_approved_plan",
          "approvedPlanItemId": "plan-item-id",
          "assessmentSourceId": "assessment-id",
          "triggerReason": "accuracy_high",
          "before": { "speed": 1, "complexityLevel": 2 },
          "after": { "speed": 1.2, "complexityLevel": 3 },
          "adjustedAt": "2026-05-20T06:29:00.000Z",
          "runtimeFrameId": "run-001:frame:1800",
          "runtimeWindowId": "run-001:runtime-window:0:2026-05-20T06:15:00.000Z-2026-05-20T06:29:00.000Z"
        }
      ]
    }
  },
  "motionMetrics": [
    {
      "metricType": "reaction_time_ms", "metricValue": 720, "confidence": 0.94,
      "unit": "ms", "sampleCount": 120,
      "windowStartedAt": "2026-05-20T06:15:00.000Z", "windowEndedAt": "2026-05-20T06:30:00.000Z"
    },
    {
      "metricType": "target_hit_rate", "metricValue": 0.9, "confidence": 0.94,
      "unit": "ratio", "sampleCount": 120,
      "windowStartedAt": "2026-05-20T06:15:00.000Z", "windowEndedAt": "2026-05-20T06:30:00.000Z"
    },
    {
      "metricType": "arm_raise_accuracy", "metricValue": 0.88, "confidence": 0.94,
      "unit": "ratio", "sampleCount": 120,
      "windowStartedAt": "2026-05-20T06:15:00.000Z", "windowEndedAt": "2026-05-20T06:30:00.000Z"
    },
    {
      "metricType": "duration_seconds", "metricValue": 900, "confidence": 1,
      "unit": "seconds", "sampleCount": 120,
      "windowStartedAt": "2026-05-20T06:15:00.000Z", "windowEndedAt": "2026-05-20T06:30:00.000Z"
    },
    {
      "metricType": "difficulty_level", "metricValue": 3, "confidence": 1,
      "unit": "level", "sampleCount": 120,
      "windowStartedAt": "2026-05-20T06:15:00.000Z", "windowEndedAt": "2026-05-20T06:30:00.000Z"
    }
  ]
}
```

字段规则：

| 字段 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `type` | string | 是 | 固定 `training_result` |
| `action` | string | 是 | 固定 `training_result` |
| `protocolVersion` | string | 是 | 当前固定 `1.0.0` |
| `resultContractVersion` | string | 是 | 当前固定 `rehab-unity-result-v2`；顶层与 `metricsSummary` 必须一致 |
| `sessionId` | string | 是 | 必须等于平台当前训练会话 ID |
| `collectionBatchId` | string | 是 | 必须原样回传 runtime config 中由开始训练响应提供的批次 ID |
| `gameRunId` | string | 是 | 必须等于平台训练配置里的运行批次 ID |
| `gameVersion` | string | 是 | 必须等于平台当前游戏版本 |
| `clientGeneratedAt` | string | 是 | Unity 生成结果的 ISO 时间 |
| `rawPayloadHash` | string | 是 | Unity 对原始结果 payload 计算的哈希或签名摘要 |
| `score` | number | 是 | `0-100` |
| `completionRate` | number | 是 | `0-1` |
| `durationSeconds` | number | 是 | 大于 `0`；为受处方时长控制的实际训练时长，不得来自场景默认值 |
| `reactionTimeMs` | number | 是 | 大于 `0` |
| `motionAccuracy` | number | 是 | `0-1` |
| `exerciseIntensity` | string | 是 | `low`、`moderate`、`high` |
| `metricsSummary` | object | 是 | 必须包含同一 `resultContractVersion`、`collectionBatchId`、真实来源和 `dynamicDifficultyEvidence` |
| `metricsSummary.dynamicDifficultyEvidence.events[].runtimeFrameId` | string | 是 | 必须以当前训练配置的精确 `gameRunId` 加 `:` 开头，并保留运行帧号语义 |
| `metricsSummary.dynamicDifficultyEvidence.events[].runtimeWindowId` | string | 是 | 必须以当前训练配置的精确 `gameRunId` 加 `:` 开头，并保留训练窗口序号与时间范围语义 |
| `motionMetrics` | array | 是 | 非空数组，且必须包含 `reaction_time_ms`、`target_hit_rate`、`arm_raise_accuracy`、`duration_seconds`、`difficulty_level` |
| `motionMetrics[].metricType` | string | 是 | 指标编码 |
| `motionMetrics[].metricValue` | number | 是 | 指标值 |
| `motionMetrics[].confidence` | number | 是 | `0-1` |
| `motionMetrics[].unit` | string | 否 | 指标单位，例如 `ratio`、`ms` |
| `motionMetrics[].sampleCount` | number | 否 | 该指标采样数量，必须为正整数 |
| `motionMetrics[].windowStartedAt` | string | 是 | 指标窗口开始时间 |
| `motionMetrics[].windowEndedAt` | string | 是 | 指标窗口结束时间，不能早于开始时间 |
| `motionMetrics[].rawSummary` | object | 否 | 指标摘要 |

平台会拒绝：

- 协议版本不匹配。
- 顶层或 `metricsSummary.resultContractVersion` 不是 `rehab-unity-result-v2`。
- `sessionId` 与当前训练会话不一致。
- 顶层或 `metricsSummary.collectionBatchId` 缺失，或二者与当前训练会话批次不一致。
- `gameRunId`、`gameVersion` 或协议版本与当前训练会话不一致。
- 任一动态难度事件的 `runtimeFrameId` 或 `runtimeWindowId` 未以当前 `gameRunId` 加 `:` 开头。
- 缺少任意必填字段。
- 数值越界。
- `motionMetrics` 为空。
- `metricsSummary.source` 包含 `demo` 或 `mock`。
- 重复提交同一个训练会话结果。

## 浏览器 SDK 调用

```html
<script src="/unity/rehab-unity-bridge.js"></script>
<script>
  const config = window.RehabUnityBridge.getRuntimeConfig();
  const windowStartedAt = "2026-05-20T06:15:00.000Z";
  const windowEndedAt = "2026-05-20T06:30:00.000Z";
  window.RehabUnityBridge.postTrainingResult({
    resultContractVersion: config.resultContractVersion,
    sessionId: config.sessionId,
    collectionBatchId: config.collectionBatchId,
    gameRunId: config.gameRunId,
    gameVersion: config.gameVersion,
    clientGeneratedAt: new Date().toISOString(),
    rawPayloadHash: "sha256-payload-hash-from-unity",
    score: 86,
    completionRate: 0.9,
    durationSeconds: 900,
    reactionTimeMs: 720,
    motionAccuracy: 0.82,
    exerciseIntensity: "moderate",
    metricsSummary: {
      source: "unity_webgl",
      resultContractVersion: config.resultContractVersion,
      collectionBatchId: config.collectionBatchId,
      gameCode: config.gameCode,
      deviceCode: config.deviceCode,
      dynamicDifficultyEvidence: {
        schemaVersion: "1.0.0",
        events: [{
          startingLevel: 2,
          startingLevelSource: "clinician_approved_plan",
          approvedPlanItemId: config.approvedPlanItemId,
          assessmentSourceId: config.assessmentSourceId,
          triggerReason: "accuracy_high",
          before: { speed: 1, complexityLevel: 2 },
          after: { speed: 1.2, complexityLevel: 3 },
          adjustedAt: new Date().toISOString(),
          runtimeFrameId: `${config.gameRunId}:frame:1800`,
          runtimeWindowId: `${config.gameRunId}:runtime-window:0:${windowStartedAt}-${windowEndedAt}`
        }]
      }
    },
    motionMetrics: [
      {
        metricType: "reaction_time_ms", metricValue: 720, confidence: 0.94,
        unit: "ms", sampleCount: 120, windowStartedAt, windowEndedAt
      },
      {
        metricType: "target_hit_rate", metricValue: 0.9, confidence: 0.94,
        unit: "ratio", sampleCount: 120, windowStartedAt, windowEndedAt
      },
      {
        metricType: "arm_raise_accuracy", metricValue: 0.88, confidence: 0.94,
        unit: "ratio", sampleCount: 120, windowStartedAt, windowEndedAt
      },
      {
        metricType: "duration_seconds", metricValue: 900, confidence: 1,
        unit: "seconds", sampleCount: 120, windowStartedAt, windowEndedAt
      },
      {
        metricType: "difficulty_level", metricValue: 3, confidence: 1,
        unit: "level", sampleCount: 120, windowStartedAt, windowEndedAt
      }
    ]
  });
</script>
```

## Unity `.jslib` 模板

```javascript
mergeInto(LibraryManager.library, {
  Rehab_PostTrainingResult: function (jsonPtr) {
    var json = UTF8ToString(jsonPtr);
    window.RehabUnityBridge.postTrainingResultJson(json);
  }
});
```

## Unity C# 调用模板

```csharp
using System.Runtime.InteropServices;
using UnityEngine;

public class RehabTrainingResultBridge : MonoBehaviour
{
    [DllImport("__Internal")]
    private static extern void Rehab_PostTrainingResult(string json);

    public void SubmitResult(string json)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        Rehab_PostTrainingResult(json);
#else
        Debug.Log(json);
#endif
    }
}
```

正式项目中，`json` 必须由游戏真实采集结果生成，不允许填固定样例数据。

## 本地验收

1. 患者签署摄像头采集授权。
2. 当前患者存在医生确认后的生效康复计划。
3. 患者开始训练，平台创建真实 `training_session`。
4. Unity WebGL 通过本协议发送训练结果事件。
5. 页面显示“已接收 Unity/WebGL 训练结果事件”。
6. 用户点击“提交训练结果入库”。
7. 后端写入 `training_result` 和 `motion_metric`。
8. 训练反馈页、医师端、后台统计可以查看到本次训练记录。

## 参考

Unity WebGL 与浏览器脚本交互采用 Unity 官方支持的 WebGL browser scripting / JavaScript interop 能力，可通过 `.jslib` 暴露 JavaScript 函数给 C# 调用。
