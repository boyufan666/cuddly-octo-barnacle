# Unity WebGL Assets

正式 Unity WebGL 构建产物放在本目录下：

```text
unity/<gameCode>/<version>/
  Build/
  StreamingAssets/
  manifest.json
```

平台桥接 SDK：

```text
unity/rehab-unity-bridge.js
```

协议文档：

```text
docs/unity/unity-webgl-bridge-protocol.md
```

不要把固定演示结果写入 Unity 构建或模板。游戏结束时必须按协议发送真实结构化训练结果。

正式启用步骤：

1. 放入真实 Unity WebGL 构建文件和 `manifest.json`。
2. 将数据库 `game_content.manifestUrl` 配置为对应 manifest 地址。
3. 将数据库 `game_content.buildStatus` 改为 `released`。
4. Unity 运行时通过 `window.RehabUnityBridge.getRuntimeConfig()` 获取 `sessionId`、`gameRunId`、`gameVersion`。
5. Unity 结束训练时通过 `postTrainingResult` 回传真实采集结果。
