# 采集条件数据收集 Runbook

本文用于验收“在不同条件下收集人的数据”的正式能力。一期目标不是长期保存原始视频或音频，而是把每次训练产生的数据绑定到明确的采集条件、采集协议和采集批次，使训练 session、训练结果和动作指标可追溯、可复核、可导出。

## 数据链路

- `CollectionCondition`：记录环境、设备要求、任务参数和质量规则，例如光照、距离、摄像头规格、姿态要求。
- `CollectionProtocol`：记录训练内容、运行时、授权类型、输入模式、必需指标、采样配置和质量门禁。
- `CollectionBatch`：医师或运营人员为指定患者、当前方案项和训练内容创建的正式采集批次，保存条件和协议快照。
- `TrainingSession.collectionBatchId`：开始训练时必须绑定已准备好的批次。
- `TrainingResult.collectionBatchId`：提交训练结果时必须与训练 session 绑定的批次一致。
- `MotionMetric.collectionBatchId`：每条结构化动作指标必须能反查同一批次。

## 验收步骤

1. 管理员创建采集条件，字段中不得包含 `mock`、`demo`、`local`、`manual` 或 `fallback`。
2. 管理员基于启用状态的采集条件创建采集协议，并绑定正式训练内容、运行时、输入模式和必需指标。
3. 医师为患者当前生效方案项创建采集批次，批次必须匹配患者、方案、方案项、训练内容、协议版本和启用状态。
4. 患者开始训练时，前端必须传入 `collectionBatchId`；缺少已准备批次时只显示“训练准备未完成”的友好阻断。
5. 后端创建 `training_session` 时写入 `collectionBatchId`，并在运行快照中保留条件和协议快照。
6. 训练资源回传结果时，`metricsSummary.collectionBatchId` 必须与 session 一致。
7. 后端创建 `training_result` 和 `motion_metric` 时写入同一个 `collectionBatchId`。
8. 审计日志至少覆盖采集条件创建、采集协议创建、采集批次创建、训练开始和训练结果提交。

## 多条件证据验收

客户强调“不同条件下收集人的数据”时，应至少准备两组不同采集条件的现场证据，例如标准诊室光照和低光照，或站姿和坐姿。两组证据必须来自同一正式患者或同一验收患者，并且每组都要有独立的采集条件、采集协议、采集批次、训练 session、训练结果和动作指标。

证据模板：

```bash
docs/templates/multi-condition-data-capture.template.json
```

只读验真命令：

```bash
pnpm verify:multi-condition-data-capture -- \
  evidence/multi-condition/multi-condition-data-capture.json \
  --api-base-url https://api.customer-health.cn \
  --review-account <doctor-or-admin-account> \
  --review-password <doctor-or-admin-password> \
  --audit-account <auditor-or-admin-account> \
  --audit-password <auditor-or-admin-password>
```

也可通过 `MULTI_CONDITION_CAPTURE_REVIEW_ACCOUNT`、`MULTI_CONDITION_CAPTURE_REVIEW_PASSWORD`、`MULTI_CONDITION_CAPTURE_AUDIT_ACCOUNT`、`MULTI_CONDITION_CAPTURE_AUDIT_PASSWORD` 提供凭据。账号和密码必须显式提供；脚本不提供默认值。密码不得写入版本库或验收证据。

该命令必须使用医师或管理员复核账号读取训练记录技术证据，不能使用患者账号。复核角色和审计角色分别使用独立 `CookieSessionClient`：各自先获取 CSRF cookie，再携带匹配的 `x-csrf-token` 完成登录，之后仅使用各自 cookie jar 读取受保护数据。两个账号必须全部登录成功后才开始读取训练记录；认证失败立即终止，不自动重试、不切换认证路径、不继续验收。

命令只读取训练记录 API 和审计日志 API，不创建采集条件、不创建批次、不开始训练、不提交结果、不补写指标、不补审计日志。它会校验：

- 至少两组 `collectionCondition.code` 不同。
- 每组 `collectionBatch.batchId` 不同，不能复用同一批次证明不同条件。
- 每组训练 session 的 `collectionBatchId`、result 的 `collectionBatchId`、`metricsSummary.collectionBatchId` 和每条 motionMetric 的 `collectionBatchId` 全部一致。
- 每组 runtime snapshot 保留采集条件、协议和批次快照。
- 每组动作指标包含 `trajectory_summary`、`reaction_time_ms`、`target_hit_rate`、`pose_visibility_avg`、`arm_raise_accuracy`、`motion_intensity`、`duration_seconds`。
- 每组训练结果包含轨迹摘要、动态难度证据、安全限制原因和 `physiologicalMetricsStatus: customer-gated`。
- 每组都有 `training_session.start` 和 `training_result.submit` 成功审计日志。

## 失败即阻断

- 不存在采集批次、批次不是 `ready`、患者/方案/方案项/训练内容不匹配时，训练不能开始。
- 采集协议或条件未启用时，训练不能开始。
- 训练结果缺少 `metricsSummary.collectionBatchId` 或与 session 不一致时，结果不能入库。
- 任何配置或证据中出现 `mock/demo/local/manual/fallback` 标记时，不能作为正式采集能力通过。
- 不允许自动创建默认条件、默认协议或默认批次；缺配置必须由医师或管理员补齐后重新开始。
- 多条件验收中，少于两组条件、两组条件 code 相同、批次复用、session/result/metric 批次不一致、缺动作指标或缺审计日志时必须失败。
- 未提供客户穿戴设备型号、SDK/API/协议、采样规则、阈值范围、授权范围和现场证据时，生理指标必须保持 `customer-gated`；不能把摄像头运动强度改名为生理数据。

## 出界说明

- 当前交付的是结构化数据采集链路，不承诺长期保存完整原始视频、原始音频或逐帧图像。
- 如客户要求保存原始视频/音频，必须另行确认存储位置、加密、留存周期、删除规则、授权范围、下载权限和审计要求。
- 当前采集能力可用于按条件追溯训练数据，不等同于多中心科研数据集、疗效预测模型或协同过滤算法。
- 当前未交付穿戴设备生理指标采集；该能力需要客户提供设备与现场证据后另行验收。
