# 浏览器体感实机验收 Runbook

本文用于证明首个 `browser_pose_game` 不是演示数据，而是在真实浏览器、真实摄像头、真实账号和真实数据库中完成训练采集、结果入库和审计留痕。

## 验收边界

- 本验收只校验已经产生的实机证据，不创建患者、不生成训练结果、不补写动作指标。
- `pnpm verify:trial-empty-loop` 只能证明 API 空库业务闭环，不能替代摄像头和姿态识别实机验收。
- 验收数据必须来自正式训练页面、API 返回、训练记录查询、审计日志和现场截图/录屏。
- 若缺少摄像头授权、姿态识别、训练完成页、四项动作指标或审计日志，本项视为未通过。

## 前置条件

1. 患者已完成 `privacy_policy` 和 `camera_capture` 授权。
2. 医师已确认当前生效康复方案，且方案中包含正式 `browser_pose_game` 训练项目。
3. 训练内容状态为 `active + released + production`，`bridgeProtocolVersion=1.0.0`。
4. 现场浏览器通过 HTTPS 访问正式或试点环境页面。
5. 摄像头可用，姿态识别模型加载成功，站位和光线满足训练要求。

## 现场步骤

1. 使用患者账号进入今日训练页面，选择浏览器体感训练内容。
2. 完成摄像头授权和姿态识别就绪检查，记录浏览器版本、页面地址、摄像头标签和模型版本。
3. 完成一次完整训练，不使用固定成绩、脚本注入或手工填写动作指标。
4. 提交训练结果后，在患者端或医师端确认训练记录可见。
5. 后台查询审计日志，确认存在 `training_session.start` 和 `training_result.submit`。
6. 保存训练完成页截图、训练过程录屏或录像、审计日志截图。
7. 按 `docs/templates/browser-pose-evidence.template.json` 填写证据 JSON。

## 证据校验命令

```bash
pnpm verify:browser-pose-evidence -- <evidence-json-path>
```

也可以使用环境变量：

```bash
BROWSER_POSE_EVIDENCE_FILE=<evidence-json-path> pnpm verify:browser-pose-evidence
```

缺少字段、字段不一致、来源包含 `demo/mock`、缺动作指标、缺截图或缺审计动作时，命令必须失败，不允许脚本自动推断或填默认值。

`docs/templates/browser-pose-evidence.template.json` 仅作为填写模板。模板中的 `<...>` 占位符必须替换为现场实机证据后再校验，模板文件本身不应通过正式验收。

## 必须包含的证据

- 现场验收信息：验收时间、验收人员、现场名称和环境。
- 浏览器信息：浏览器名、版本、`userAgent`、HTTPS 页面地址。
- 摄像头信息：设备编号、摄像头标签、脱敏设备哈希、分辨率。
- 姿态识别信息：`browser_pose_game`、模型名、模型版本、关键点数量、平均可见度。
- 业务关联：患者、康复计划、计划项、训练内容、医师确认记录。
- 训练会话：`sessionId`、`gameRunId`、`deviceCode`、开始/结束时间、同步状态。
- 训练结果：`source=browser_pose_game`、版本、协议、payload hash、质量标记、异常标记和核心结果。
- 动作指标：`reaction_time_ms`、`target_hit_rate`、`pose_visibility_avg`、`arm_raise_accuracy`。
- 审计证据：`training_session.start` 和 `training_result.submit` 对应审计日志。
- 附件证据：至少一张截图和一份训练过程录屏或录像。

## 失败判定

- 训练结果来源包含 `demo`、`mock` 或任何脚本演示标记。
- `trainingSession.gameRunId` 与 `trainingResult.gameRunId` 不一致。
- `gameVersion` 或 `bridgeProtocolVersion` 与正式训练内容不一致。
- 任一正式动作指标缺失、采样数为空、置信度缺失或质量标记不是显式 `valid`。
- 训练会话不是 `completed + synced`。
- 缺少现场截图、训练录屏或审计日志关联。
- 页面不是 HTTPS 正式或试点地址。
