# 新库真实总闭环验收 Runbook

本文用于把新库验收从“单个脚本通过”升级为“客户可交付证据链通过”。该流程只做编排，不创建数据、不补写记录、不生成证据、不读取密钥；任何子验收失败都应判定为 `BLOCKED`。

## 适用范围

执行入口：

```bash
pnpm verify:empty-real-loop -- <orchestrator-config-json>
```

如需留下客户验收归档摘要，可显式指定报告输出路径：

```bash
pnpm verify:empty-real-loop -- <orchestrator-config-json> --report-output evidence/reports/empty-real-loop-report.json
```

该报告只记录编排步骤、执行状态、退出码和时间，不记录子脚本 stdout/stderr、配置全文、evidence 全文、真实 token、请求体、响应体、base64 音频或原始训练载荷。未显式传入 `--report-output` 时脚本不会写默认报告。

配置模板：

```bash
cp docs/templates/empty-real-loop-orchestrator.template.json empty-real-loop-orchestrator.json
```

模板中的 `<...>` 必须替换为现场真实资料或证据路径。模板文件本身不应通过正式验收。

AI/STT/语音 AI/TTS 子验收配置可分别从以下模板复制后填写：

- `docs/templates/formal-acceptance-chain.template.json`
- `docs/templates/ad8-caregiver-interview-acceptance-config.template.json`
- `docs/templates/ai-assessment-acceptance-config.template.json`
- `docs/templates/speech-transcript-acceptance-config.template.json`
- `docs/templates/speech-ai-assessment-acceptance-config.template.json`
- `docs/templates/tts-speech-output-acceptance-config.template.json`

总编排配置必须在 `unity` 和 `browserPose` 中分别填写 `patientAccount`、`patientPassword`、`auditAccount`、`auditPassword`。八项值都由客户或运维在现场提供；Browser Pose 与 Unity、患者读取与审计读取均使用不同账号。配置文件含运行时密码，必须仅在受控现场以最小文件权限保存，验收后按客户凭据管理制度处置，不得进入 evidence、报告或版本库。

## 编排顺序

脚本会按以下顺序执行，前一步失败时立即停止：

1. `pnpm delivery:check:production -- --customer-input <customer-production-input>`
2. `pnpm verify:trial-empty-loop`
3. 正式业务链只读验真：`pnpm verify:formal-acceptance-chain -- <config>`
4. AD-8 照护者访谈正式验收：`pnpm verify:ad8-caregiver-interview-acceptance -- <config>`
5. AI 评估正式验收：`pnpm verify:ai-assessment-acceptance -- <config>`
6. STT 语音转写证据和现场验收：`pnpm verify:speech-transcript-evidence -- <evidence>`、`pnpm verify:speech-transcript-acceptance -- <config>`
7. 语音输入进入 AI 评估组合验收：`pnpm verify:speech-ai-assessment-acceptance -- <config>`
8. TTS 语音输出证据和现场验收：`pnpm verify:tts-speech-output-evidence -- <evidence>`、`pnpm verify:tts-speech-output-acceptance -- <config>`
9. Unity WebGL 证据和现场只读验真：`pnpm verify:unity-field-evidence -- <evidence>`、`pnpm verify:unity-field-acceptance -- <evidence> --api-base-url <api>`；编排器只向该现场验真子进程传入配置中的四项 `UNITY_FIELD_*` 凭据环境变量。
10. 浏览器体感证据和现场只读验真：`pnpm verify:browser-pose-evidence -- <evidence>`、`pnpm verify:browser-pose-field-acceptance -- <evidence> --api-base-url <api>`；编排器只向该现场验真子进程传入配置中的四项 `BROWSER_POSE_*` 凭据环境变量。
11. 家属授权、脱敏摘要、撤权阻断、后台审计和脱敏导出契约：`pnpm verify:contracts`

## 配置要求

- `trialEmptyLoop.required` 必须为 `true`。
- `unity` 和 `browserPose` 均必须显式提供各自的 `patientAccount`、`patientPassword`、`auditAccount`、`auditPassword`；缺任一项时，在任何子进程或网络请求前失败。
- Browser Pose 与 Unity 不能共享账号；每个 verifier 的患者读取账号和审计读取账号也必须不同。
- `caregiverAudit.required` 和 `caregiverAudit.localContractsRequired` 必须为 `true`。
- 若 `formalAcceptanceChain.requiredForLaunch=true`，必须提供同一条正式业务链只读验真配置路径。
- 若 `ad8CaregiverInterview.requiredForLaunch=true`，必须提供 AD-8 照护者访谈现场验收配置路径。
- 若 `aiRequiredForLaunch=true`，必须提供 AI 评估现场验收配置路径。
- 若 `speechRequiredForLaunch=true`，必须提供 STT evidence、STT 现场验收配置和语音 AI 评估组合验收配置。
- 若 `ttsRequiredForLaunch=true`，必须提供 TTS evidence 和 TTS 现场验收配置。
- 若 `unity.requiredForLaunch=true`，必须提供 Unity evidence 和正式 HTTPS API；运行时使用 Unity 专属患者/审计 Cookie 会话凭据。
- 若 `browserPose.requiredForLaunch=true`，必须提供浏览器体感 evidence 和正式 HTTPS API；运行时使用 Browser Pose 专属患者/审计 Cookie 会话凭据。

## 安全边界

- field acceptance 不接受 access token、Bearer、token 引用或凭据文件参数，也不存在旧认证兼容路径。
- 编排器从显式 JSON 字段构造两组互相隔离的 field 子进程环境：Unity 仅收到显式 `PATH` 和四项 `UNITY_FIELD_*`，Browser Pose 仅收到显式 `PATH` 和四项 `BROWSER_POSE_*`，不会读取父环境中的同名凭据。其他子验收保留原有运行环境，但编排器会剔除全部八项 field 凭据变量，避免凭据跨子进程泄漏。
- 两个 verifier 都用 `CookieSessionClient` 分别登录患者读取账号和审计读取账号；Cookie/CSRF、401/403 或缺 `rehab_session` 时立即失败，不继续业务读取、不重试。
- 脚本不会把某个能力 scope 从 `true` 改成 `false`，也不会在失败后跳过子验收。
- 出现 `mock`、`demo`、`seed`、`fallback`、`fixed`、`manual` 或 `<...>` 占位符时必须失败。

## 交付判断

通过该编排只表示“所有必需验收脚本按顺序通过”。正式交付仍需保留：

- `--report-output` 生成的新库真实总闭环验收报告；若状态为 `BLOCKED`，只能用于定位阻断点，不能作为通过交付证据。
- 客户资料包和生产配置检查结果。
- 空库闭环执行日志。
- 正式业务链只读验真配置、同一患者的评估/方案/训练/复核/家属摘要 ID 和授权/业务审计日志。
- AD-8 照护者访谈验收配置、医生复核记录、正式 AD-8 评估 ID、风险评级、分析记录和审计日志。
- AI/STT/TTS 调用 ID、审计 ID、医生复核记录、真实录音或播放证据。
- Unity 和浏览器体感 evidence JSON、截图、录屏、训练记录 API 和审计 API 验真结果。
- 家属授权查看、撤权阻断、后台审计和脱敏导出契约验收结果。
