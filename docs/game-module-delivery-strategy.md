# 游戏模块正式交付策略

本文用于明确游戏模块如何做到“可交付、可验收、可采集真实数据”，避免把现成小游戏、演示数据或不可控黑盒当作正式康复训练内容。

## 总体结论

一期游戏模块采用“两阶段组合路线”：

- P0 主路线：自研浏览器体感训练游戏，基于现有 `browser_pose_game` 和 MediaPipe PoseLandmarker 完成真实采集闭环。
- Unity 路线：作为正式接入能力保留。客户已有 Unity WebGL 游戏时按 Bridge 协议接入；客户没有成品时，Unity 游戏需要另立自研任务并交付真实 Build 文件。

不建议直接引用网上现成小游戏作为正式交付。原因是版权、许可证、数据结构、动作指标、摄像头采集、医疗适用说明和审计链路都不可控。

## 可引用的技术组件

- MediaPipe：可作为浏览器姿态识别基础，许可证为 Apache-2.0。正式交付时需要记录版本、模型地址、浏览器兼容性和第三方许可证。
- Phaser：可作为 2D Web 游戏引擎，许可证为 MIT。适合做反应、触达、节奏、注意力等轻量训练。
- Canvas/React：可直接实现轻量训练交互，减少外部依赖。
- Three.js：可作为 3D 表现层，许可证为 MIT，但一期不是必须。
- YOLO/Ultralytics：官方授权存在 AGPL/企业许可约束。不建议作为免费闭源交付方案，除非客户确认开源义务或购买企业许可。

许可证参考：

- MediaPipe License: <https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE>
- Phaser License: <https://phaser.io/download/license>
- Three.js License: <https://github.com/mrdoob/three.js/blob/dev/LICENSE>
- Ultralytics License: <https://www.ultralytics.com/license>

## P0 自研浏览器体感游戏

首个正式训练内容建议命名为“上肢反应触达”或同类业务名称，运行时类型为 `browser_pose_game`。

必须采集并入库：

- `reaction_time_ms`：目标出现到有效触达的反应时间。
- `target_hit_rate`：有效命中次数 / 目标出现次数。
- `pose_visibility_avg`：训练窗口内姿态关键点平均可见度。
- `arm_raise_accuracy`：上肢关键点进入目标区域的准确率。

必须具备：

- 摄像头授权和隐私授权通过后才能开始。
- 姿态识别质量不足时明确提示，不生成有效训练结果。
- 训练过程生成 `gameRunId`、版本、协议、payload hash、训练窗口和动作指标。
- 结果提交到 `training_session`、`training_result`、`motion_metric`，并能被患者、医师和后台查看。
- 后台创建训练内容时必须是 `active + released + production + bridgeProtocolVersion=1.0.0`。
- 现场验收时按 `docs/browser-pose-field-acceptance-runbook.md` 生成证据 JSON，并通过 `pnpm verify:browser-pose-evidence` 校验。

## Unity 接入路线

客户已有 Unity WebGL 游戏时，准入条件如下：

- 客户确认 Unity 工程、构建产物、素材、音频、字体、模型和第三方插件的使用权、交付权和上线权。
- 客户确认 Unity Runtime、Unity Asset Store 资源和第三方 SDK 的授权满足目标部署方式。
- 提供完整 WebGL Build 文件和 `manifest.json`。
- 能加载 `apps/web/public/unity/rehab-unity-bridge.js`。
- 能读取 `window.RehabTrainingRuntimeConfig` 中的 `sessionId`、`gameRunId`、`gameVersion`。
- 训练结束时调用 Bridge 回传真实结构化结果。
- 回传字段符合 `docs/unity/unity-webgl-bridge-protocol.md`。
- 不包含 `demo`、`mock`、`seed_import` 或固定成绩逻辑。

客户没有 Unity 成品时，不能宣传已完成 Unity 游戏。可另立任务自研一个轻量 Unity WebGL 游戏，例如节奏触达类训练，但必须交付：

- Unity 项目源码或可审查工程包。
- WebGL Build 文件。
- `manifest.json`。
- 指标计算逻辑说明。
- Bridge 回传验收记录。
- 版本发布记录。

## 禁止事项

- 禁止把本地 seed 游戏内容作为试点或生产训练资源。
- 禁止固定成绩、固定动作指标或无摄像头采集的假结果。
- 禁止接入无法输出结构化指标的黑盒游戏。
- 禁止在用户未签署隐私协议和摄像头授权时开始体感训练。
- 禁止把第三方游戏素材、音频、图片、模型直接放入交付包，除非许可证和客户授权已经确认。

## 验收标准

- 至少一个正式 `browser_pose_game` 可在真实浏览器中完成训练。
- 训练结果包含四项正式动作指标且质量标记为真实计算结果。
- 医师端能查看训练历史和趋势，后台能查到审计日志。
- 低质量姿态、训练过短、异常反应时间会被标记或阻断。
- Unity 只在真实 Build 和 Bridge 验收完成后进入推荐候选池。
