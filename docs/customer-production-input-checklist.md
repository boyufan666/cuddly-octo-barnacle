# 客户生产资料准备清单

此清单与 `customer-production-input/v2` 校验器一一对应。所有字段必须填写为客户实际批准的值；模板、示例域名、占位符、localhost、明文密钥、个人 token、mock、demo、seed、手工结果或 fallback 都会导致资料包或现场验收失败。

```bash
pnpm verify:customer-production-input -- <customer-production-input.json>
```

## GitHub、Render 与基础设施

- [ ] GitHub 私有仓库、受保护分支、required checks、CODEOWNERS、发布权限和紧急回滚责任人已确认。
- [ ] Render 团队、账单、生产区域与数据驻留已书面批准；当前 Blueprint 使用新加坡。
- [ ] Web 和 API 都有客户正式 HTTPS origin；没有路径、查询参数、凭据或 localhost。
- [ ] Render Postgres、Key Value、API、Web、telemetry retention cron 均在受批准区域；资源规格、备份、恢复、监控、告警和责任人已确认。
- [ ] `render.yaml` 的 custom domains、Secret Files 和每项 `sync: false` 由授权运维填写，真实值不进入 GitHub。

## 密钥与配置

- [ ] 数据库密钥以 `secret-manager://...` 引用交付。
- [ ] `SENSITIVE_DATA_KEY_REF` 与 `/etc/secrets/sensitive_data_key` 已由 Render Secret File 提供。
- [ ] `MIMO_API_KEY_REF` 与 `/etc/secrets/mimo_api_key` 已由 Render Secret File 提供；未设置 `MIMO_API_KEY`、`AI_API_KEY`、`SPEECH_API_KEY` 或 `TTS_API_KEY` 等原始生产环境变量。
- [ ] `MIMO_ALLOWED_HOSTS`、MiMo 三项 endpoint、模型、提示词版本、TTS 音色和输出格式均已批准。
- [ ] Key Value 私有 URL、命名空间、窗口、探针超时、所有请求/时长/字符/预算限额和计费因子均填写为正整数或有效私有连接。
- [ ] 三类 provider 的超时和最大响应字节数、`providerTelemetryRetentionDays`（30--3650 天）和 `providerTelemetryRetentionTimeoutMs`（无默认的有限执行时限）均经客户批准。

## 全量 MiMo 能力

- [ ] `ai.requiredForLaunch=true`、`ai.provider=xiaomi-mimo`、`ai.humanReviewRequired=true`，并指定模型、提示词与医师复核责任人。
- [ ] `speech.requiredForLaunch=true`、`speech.provider=xiaomi-mimo-audio-understanding`、`speech.microphoneConsentRequired=true`，并指定音频理解 endpoint 与模型。
- [ ] `tts.requiredForLaunch=true`、`tts.provider=xiaomi-mimo-tts`、`tts.patientPlaybackConsentRequired=true`，并指定允许的 MiMo TTS 模型、音色和 `mp3`/`wav` 格式。
- [ ] 客户已批准 MiMo 第三方数据处理、费用、额度窗口、失败计费、退款/重试规则和最小化 telemetry 的留存/删除方式。
- [ ] 无任何替代供应商或本地语音方案被列为上线能力。

## 真实临床、同意与数据治理

- [ ] 隐私协议版本、数据留存/删除、同意和撤回责任人已确认。
- [ ] 已取得用于验收的真实患者数据采集批准、患者来源、脱敏负责人和导出审批负责人。
- [ ] 每位验收患者具备有效的 `privacy_policy`、`ai_processing`、`camera_capture`；使用 STT 的患者另有 `microphone_capture`。
- [ ] 真实 MMSE、CDR、认知维度、临床摘要、风险确认和责任医师复核已准备，且不会用脚本示例或 seed 替代。
- [ ] 家属共享授权、访问范围和脱敏导出审批已验证。

## 训练、设备与证据

- [ ] 至少一个已发布浏览器体感内容完成目标浏览器、摄像头、网络、场地和质量阈值的实机验收。
- [ ] 采集条件、设备、质量阈值、协议参数、采集批次和训练安排均为客户批准的真实配置。
- [ ] 如 Unity 为上线范围，真实 WebGL Build、manifest、版本、授权和 Bridge 回传已验收。
- [ ] 已准备 Staging 的 AI、STT、TTS、浏览器体感、Unity（如适用）、正式业务链、脱敏导出和审计只读反查证据。
- [ ] 验收包 manifest 只含受控文件路径和摘要，不含密钥、原始病历、完整转写、音频、Base64 或 provider 正文。

## 不通过的处理

资料或实机验收有任一未勾选项时，结论是 `BLOCKED`。项目组只记录具体缺项并请求补齐；不更改上线范围、不伪造临床数据、不启用降级路径，也不以测试通过代替真实客户验收。完整执行顺序见 `docs/customer-input-to-launch-gate-runbook.md`。
