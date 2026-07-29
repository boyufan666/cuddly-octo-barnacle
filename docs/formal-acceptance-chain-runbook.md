# 正式业务链只读验真 Runbook

本文用于证明一次客户验收不是多个孤立脚本分别通过，而是同一患者、同一评估、同一确认方案、同一训练记录、同一训练复核、同一家属授权摘要和同一组审计日志可以相互关联。

## 验收边界

- `pnpm verify:formal-acceptance-chain` 只执行 `GET` 查询和本地配置读取，不创建患者、不签授权、不推荐方案、不开始训练、不提交训练结果、不补写审计日志。
- 脚本验证同一 `patientId` 下的 `assessmentId`、`rehabPlanId`、`planItemId`、`gameContentId`、`trainingSessionId`、`trainingResultId` 和 `caregiverUserId` 是否能通过平台 API 互相关联。
- 脚本要求训练结果已经医生复核，家属摘要已经脱敏，审计日志能反查授权、家属绑定、评估、推荐、确认、训练开始、训练结果、训练复核和家属摘要查看。
- 缺任一 ID、缺正式 HTTPS API、缺任一角色账号/密码、缺有效授权、缺风险评级、缺动作指标、缺复核、缺审计日志或出现 `mock/demo/seed/fallback/fixed/manual`、敏感字段、原始载荷时必须失败。

## 配置 JSON

可先复制模板，再填写现场真实业务 ID：

```bash
cp docs/templates/formal-acceptance-chain.template.json formal-acceptance-chain.json
```

模板中的 `<...>` 必须替换为现场真实 API 和业务 ID。模板当前认证段不可直接沿用；复制后必须删除旧认证占位字段，并改为以下六个显式账号/密码字段：

```json
{
  "apiBaseUrl": "https://api.customer-health.cn/api",
  "doctorAccount": "<doctor-account>",
  "doctorPassword": "<doctor-password>",
  "caregiverAccount": "<caregiver-account>",
  "caregiverPassword": "<caregiver-password>",
  "auditAccount": "<auditor-or-admin-account>",
  "auditPassword": "<auditor-or-admin-password>",
  "chain": {},
  "requiredAuditActions": []
}
```

`chain` 和 `requiredAuditActions` 必须保留模板中的完整结构和值域。配置文件包含现场密码，不得提交到版本库；运行结束后按现场凭据管理制度删除或安全归档。

## 运行时认证

- 脚本为医师、家属、审计角色分别创建独立 `CookieSessionClient`，不跨角色共享 cookie jar。
- 每个角色先执行 `GET /auth/csrf`，再以匹配的 `rehab_csrf` cookie 和 `x-csrf-token` 请求头执行 `POST /auth/login`；登录成功后只使用各自的 `rehab_session` 和 `rehab_csrf` cookie。
- 三个角色必须全部登录成功，脚本才开始读取受保护业务数据。认证失败、`password_reset_required`、缺登录上下文或缺 session cookie 都立即终止，不自动重试，不切换认证路径，也不继续输出验收成功。

## 验收命令

```bash
pnpm verify:formal-acceptance-chain -- <config-json-path>
```

总闭环验收会在 `formalAcceptanceChain.requiredForLaunch=true` 时自动执行该脚本：

```bash
pnpm verify:empty-real-loop -- <orchestrator-config-json>
```

## 脚本会验证什么

- `GET /patients/:id`：验证患者、有效授权、当前 active 方案、方案项、正式训练内容和 active 家属关系。
- `GET /patients/:id/assessments`：验证正式评估、风险评级和分析记录。
- `GET /patients/:id/training-records`：验证训练 session、训练结果、动作指标和医生复核状态。
- `GET /caregiver/patients/:id/summary`：验证家属能查看同一患者摘要，且不暴露原始动作指标、采集明细、原始评估权限、方案编辑权限或完整病历权限。
- `GET /admin/audit-logs`：验证 `consent.grant`、`caregiver_relation.create`、`assessment.create`、`rehab_plan.recommend`、`rehab_plan.confirm`、`training_session.start`、`training_result.submit`、`training_result.review`、`caregiver.summary.view` 成功审计日志。
- 所有必需 API 的 2xx 响应仍必须满足明确对象/数组契约；空体、`null`、布尔值、文本或错误 shape 一律失败。每个审计动作与目标必须恰好匹配一条成功候选，并递归扫描全部返回候选，不能因第一条匹配而忽略重复项或敏感 metadata。

## 当前 API 边界

- 方案调整记录没有单独只读 API，本脚本只能验证确认后的当前方案和 `rehab_plan.confirm` 审计日志。
- `training_result.submit` 审计目标是 `training_session`，训练结果 ID 通过 `GET /patients/:id/training-records` 的 `session.result.id` 关联。
- 家属摘要设计上不暴露 `motionMetrics` 和 `metricsSummary`，完整动作指标只能用医师/管理员完整训练记录接口验证。

## 交付口径

通过本脚本可以向客户说明：一条正式业务链的数据不是孤立存在，而是能从角色权限、授权、评估、方案、训练、复核、家属摘要和审计层面相互印证。它不替代 AI/STT/TTS 供应商调用验收，也不替代 Unity/浏览器体感现场实机验收。
