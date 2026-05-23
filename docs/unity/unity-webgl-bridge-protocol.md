# Unity WebGL 训练桥接协议 v1.0.0

## 交付策略

一期建议采用“自研轻量 Unity WebGL 训练壳 + 可替换游戏内容”的方式交付。

- 如果客户已有 Unity 游戏：按本文协议接入，游戏结束时回传结构化结果。
- 如果我们自研游戏：先做 1 个正式可用的轻量体感训练游戏，例如 `rhythm_saber`，仍按同一协议回传。
- 不建议一期直接承诺复杂多游戏自研包；也不建议接黑盒游戏且无法控制数据结构。

## Web 资源放置规范

Unity WebGL 构建产物统一放在：

```text
apps/web/public/unity/<gameCode>/<version>/
```

建议目录：

```text
apps/web/public/unity/rhythm_saber/1.0.0/
  Build/
    rhythm_saber.loader.js
    rhythm_saber.framework.js
    rhythm_saber.data
    rhythm_saber.wasm
  StreamingAssets/
  manifest.json
```

平台 SDK 文件固定为：

```text
apps/web/public/unity/rehab-unity-bridge.js
```

Unity 页面或 WebGL 模板需要先加载该文件，再调用 `window.RehabUnityBridge.postTrainingResult(...)`。

## Unity -> Web 训练结果事件

Unity 训练结束后必须向父页面发送 `postMessage`。事件结构如下：

```json
{
  "type": "training_result",
  "action": "training_result",
  "protocolVersion": "1.0.0",
  "sessionId": "training-session-id",
  "gameRunId": "run-001",
  "gameVersion": "1.0.0",
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
    "gameCode": "rhythm_saber",
    "gameVersion": "1.0.0",
    "deviceCode": "camera-001",
    "gameRunId": "run-001",
    "protocolVersion": "1.0.0",
    "clientGeneratedAt": "2026-05-20T06:30:00.000Z",
    "rawPayloadHash": "sha256-payload-hash"
  },
  "motionMetrics": [
    {
      "metricType": "arm_raise_accuracy",
      "metricValue": 0.88,
      "confidence": 0.94,
      "unit": "ratio",
      "sampleCount": 120,
      "rawSummary": {
        "sampleCount": 120
      }
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
| `sessionId` | string | 是 | 必须等于平台当前训练会话 ID |
| `gameRunId` | string | 是 | 必须等于平台训练配置里的运行批次 ID |
| `gameVersion` | string | 是 | 必须等于平台当前游戏版本 |
| `clientGeneratedAt` | string | 是 | Unity 生成结果的 ISO 时间 |
| `rawPayloadHash` | string | 是 | Unity 对原始结果 payload 计算的哈希或签名摘要 |
| `score` | number | 是 | `0-100` |
| `completionRate` | number | 是 | `0-1` |
| `durationSeconds` | number | 是 | 大于 `0` |
| `reactionTimeMs` | number | 是 | 大于 `0` |
| `motionAccuracy` | number | 是 | `0-1` |
| `exerciseIntensity` | string | 是 | `low`、`moderate`、`high` |
| `metricsSummary` | object | 是 | 必须包含真实来源信息，`source` 不允许 `demo/mock` |
| `motionMetrics` | array | 是 | 非空数组 |
| `motionMetrics[].metricType` | string | 是 | 指标编码 |
| `motionMetrics[].metricValue` | number | 是 | 指标值 |
| `motionMetrics[].confidence` | number | 是 | `0-1` |
| `motionMetrics[].unit` | string | 否 | 指标单位，例如 `ratio`、`ms` |
| `motionMetrics[].sampleCount` | number | 否 | 该指标采样数量，必须为正整数 |
| `motionMetrics[].windowStartedAt` | string | 否 | 指标窗口开始时间 |
| `motionMetrics[].windowEndedAt` | string | 否 | 指标窗口结束时间 |
| `motionMetrics[].rawSummary` | object | 否 | 指标摘要 |

平台会拒绝：

- 协议版本不匹配。
- `sessionId` 与当前训练会话不一致。
- `gameRunId`、`gameVersion` 或协议版本与当前训练会话不一致。
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
  window.RehabUnityBridge.postTrainingResult({
    sessionId: config.sessionId,
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
      gameCode: config.gameCode,
      deviceCode: config.deviceCode
    },
    motionMetrics: [
      {
        metricType: "arm_raise_accuracy",
        metricValue: 0.88,
        confidence: 0.94,
        unit: "ratio",
        sampleCount: 120
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
