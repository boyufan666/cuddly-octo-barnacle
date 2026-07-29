# 正式训练内容发布手册

本文用于试点或生产环境发布训练内容。目标是保证康复方案推荐和患者训练不依赖本地初始化数据，训练结果必须来自真实采集或正式训练资源回传。

## 发布路径

平台一期支持两类正式训练内容：

- 浏览器体感训练：平台内置摄像头姿态识别训练壳，适合先跑通真实采集闭环。
- Unity WebGL 训练：客户或我方提供正式 WebGL 构建产物，通过 Bridge 协议回传结果。

两类训练内容都必须包含训练目标、标签、默认时长、默认难度、采集方式、训练指标和版本信息。已发布内容才会进入康复方案推荐候选池。

## 浏览器体感训练发布

适用场景：

- 客户暂时没有可交付 Unity WebGL 游戏。
- 需要先完成摄像头授权、姿态识别、训练结果入库和审计验收。
- 需要至少一个正式训练内容支撑 AI 评估后的康复方案推荐。

后台操作路径：

1. 使用具备 `game.publish` 权限的管理员账号登录。
2. 进入“运营管理”。
3. 在“新建训练内容”中选择“训练运行方式：浏览器体感”。
4. 填写训练版本号，例如 `1.0.0`。
5. 选择需要摄像头，并确保采集方式包含 `camera_pose`。
6. 填写训练结果指标配置，至少包含：

```json
[
  { "metricType": "reaction_time_ms", "unit": "ms" },
  { "metricType": "target_hit_rate", "unit": "ratio" },
  { "metricType": "pose_visibility_avg", "unit": "ratio" },
  { "metricType": "arm_raise_accuracy", "unit": "ratio" }
]
```

发布结果：

- `runtimeType=browser_pose_canvas`
- `buildStatus=released`
- `releaseChannel=production`
- `bridgeProtocolVersion=1.0.0`
- 不需要 `manifestUrl` 或 Unity Build 文件。
- 操作写入审计日志 `game_content.publish_browser_pose`。

权限边界：

- 普通运营账号可以创建 Unity 待资源内容，但不能发布浏览器体感训练内容。
- 超级管理员或具备发布权限的管理员才能创建已发布浏览器体感训练内容。

## Unity WebGL 训练发布

适用场景：

- 客户已有 Unity WebGL 构建产物。
- 需要接入一个或多个正式体感小游戏。
- 游戏能通过 `window.RehabUnityBridge.postTrainingResult(...)` 回传结构化结果。

后台操作路径：

1. 在“新建训练内容”中选择“训练运行方式：Unity WebGL”。
2. 创建后内容保持 `pending_assets`，此时不会进入推荐候选池。
3. 将 Unity 构建产物放入：

```text
apps/web/public/unity/<gameCode>/<version>/
```

4. 进入“训练资源发布配置”，选择对应 Unity 内容。
5. 填写：

```text
manifestUrl=/unity/<gameCode>/<version>/manifest.json
buildBaseUrl=/unity/<gameCode>/<version>
gameVersion=<version>
bridgeProtocolVersion=1.0.0
releaseChannel=production
buildStatus=released
```

6. 保存后由 API 校验资源路径、版本、发布通道、采集方式和指标配置。

发布结果：

- `runtimeType=unity_webgl`
- `buildStatus=released`
- `releaseChannel=production`
- `manifestUrl` 必须是 `/unity/.../manifest.json`
- 操作写入审计日志 `game_content.publish_unity_build`。

详细 Bridge 协议见 `docs/unity/unity-webgl-bridge-protocol.md`。

## 推荐方案前置条件

康复方案推荐至少需要：

- 患者已建档。
- 患者已完成当前版本 AI 处理授权。
- 已有评估记录和当前风险等级。
- 至少一个训练内容处于：

```text
status=active
buildStatus=released
gameVersion 非空
bridgeProtocolVersion=1.0.0
```

浏览器体感内容还必须包含 `camera_pose` 和四项正式动作指标。Unity 内容还必须具备正式 `manifestUrl`。

## 发布后实机验真

浏览器体感训练内容发布后，必须用真实患者或验收患者完成一次完整训练，并按 `docs/browser-pose-field-acceptance-runbook.md` 准备 evidence JSON、现场截图和训练过程录屏。

验真顺序：

```bash
pnpm verify:browser-pose-evidence -- <evidence-json-path>
BROWSER_POSE_PATIENT_ACCOUNT='<browser-patient-read-account>' \
BROWSER_POSE_PATIENT_PASSWORD='<browser-patient-read-password>' \
BROWSER_POSE_AUDIT_ACCOUNT='<browser-audit-read-account>' \
BROWSER_POSE_AUDIT_PASSWORD='<browser-audit-read-password>' \
pnpm verify:browser-pose-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com
```

只读实机验真必须用显式提供的患者读取账号/密码与审计读取账号/密码建立两套独立 Cookie 会话，从 API 反查训练 session、训练结果、四项动作指标和两类审计日志，并确认本地截图/录屏文件存在且非空。该步骤不会补造数据；缺任一账号密码、缺 API、缺附件、缺训练记录或缺审计日志时不得把训练内容标记为已完成客户验收。

## 禁止事项

- 禁止使用本地 seed 训练内容作为试点或生产训练资源。
- 禁止发布缺失动作指标的训练内容。
- 禁止使用固定训练成绩替代真实采集结果。
- 禁止在未取得摄像头授权时开始体感训练。
- 禁止把包含 `demo`、`mock`、`seed_import` 标记的 Unity 配置发布为正式构建。
