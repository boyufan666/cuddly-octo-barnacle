# 客户正式上线资料索取单

用途：一次性收集 GitHub + Render 生产上线、全量 MiMo 能力、真实临床闭环与现场验收所需资料。资料不完整时，系统和验收结论必须是 `BLOCKED`；不能以演示账号、测试病历、seed、个人 token、临时代理、浏览器本地语音或任何 fallback 补齐。

客户应从 `docs/templates/customer-production-input.template.json` 复制资料包，替换全部占位符后提交。项目组只校验资料和证据，不接收真实密钥、原始音频、完整转写、原始病历或 Base64 音频。

```bash
pnpm verify:customer-production-input -- <customer-production-input.json>
pnpm delivery:check:production -- --customer-input <customer-production-input.json>
```

这两项检查不能替代 Staging 的真实 MiMo 调用、医师复核、摄像头/Unity 实机训练或客户最终验收。

## 1. GitHub 与 Render

- GitHub 组织、私有仓库、管理员、受保护主分支、required checks、CODEOWNERS 和发布责任人。
- Render 团队、账单负责人、部署区域与数据驻留书面批准。当前 Blueprint 将 API、Web、PostgreSQL、Key Value 和 retention cron 放在新加坡；客户必须确认该区域符合合同与数据处理要求。
- Web/API 正式 HTTPS 域名、DNS 管理人、证书和续期责任人。
- Render Postgres 备份、恢复目标、恢复演练负责人、监控告警和故障通报责任人。
- 客户确认 `render.yaml` 中所有 `sync: false` 环境变量、Secret Files、custom domains 和关键资源计划；不得把真实值提交到 GitHub。

## 2. 密钥、连接与运行时安全

- `DATABASE_URL` 的受控引用；强 `JWT_SECRET` 的 Render 托管方式。
- `SENSITIVE_DATA_KEY_REF` 和 Secret File `/etc/secrets/sensitive_data_key`。
- `MIMO_API_KEY_REF` 和 Secret File `/etc/secrets/mimo_api_key`。仅客户/运维向 Render Secret File 写入真实 key；资料包只填写 `secret-manager://` 引用和固定文件路径。
- 生产首启所需的 `PRODUCTION_BOOTSTRAP_CONFIG_FILE`、`PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE` 和 `PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD_FILE` Secret Files。客户/运维必须在 Render 私密配置中维护其内容；项目资料包、GitHub 和验收附件不得包含机构人员资料或首始口令明文。
- MiMo allowlist 主机名、AI/音频理解/TTS 的精确 HTTPS endpoint、每项模型、提示词版本、TTS 音色和 `mp3` 或 `wav` 输出格式。
- Render Key Value 私有 URL、额度 key prefix、窗口、请求数、音频秒数、TTS 字符数、预算单位、计费因子、探针超时以及三类 provider 的超时和最大响应字节数；另提供最小化 provider telemetry 的 30--3650 天留存期与无默认的有限执行时限。
- 客户书面批准配额窗口语义、供应商失败是否计费、退款/重试规则与超过额度的业务处理。项目组不会自行假定或实现兜底策略。

## 3. 全量 MiMo 与合规授权

本期三个能力均是生产上线范围，资料包中必须全部为 `true`：

- `ai.requiredForLaunch`，provider 必须为 `xiaomi-mimo`，且 `humanReviewRequired=true`。
- `speech.requiredForLaunch`，provider 必须为 `xiaomi-mimo-audio-understanding`，且 `microphoneConsentRequired=true`。
- `tts.requiredForLaunch`，provider 必须为 `xiaomi-mimo-tts`，且 `patientPlaybackConsentRequired=true`。

客户还需提供：MiMo 账号主体和负责人、第三方 AI 数据处理书面批准、服务许可/费用承担人、最小化 telemetry 留存和删除策略、医师人工复核责任人。讯飞、星火、阿里云、通义、DeepSeek、Kimi、智谱、OpenAI 或任何其他服务不能作为本期生产替代。

## 4. 真实临床与患者数据

- 隐私协议版本、留存/删除规则、同意记录责任人和撤回流程。
- 经批准的真实患者来源、建档责任人、脱敏导出审批责任人；不得用 seed 或手工构造的结果作为生产验收。
- 每位进入 Staging/Production 验收患者的真实 `privacy_policy`、`ai_processing`、`camera_capture`；使用 STT 时还需要 `microphone_capture`。TTS 依赖前两项同意。
- 真实临床评估：MMSE、CDR、认知维度分数、临床摘要/来源、风险确认、医生人工复核结论和责任医师。
- 评估、方案、采集条件/协议/批次、训练会话、结果复核和家属脱敏摘要必须能够关联为同一业务链。

## 5. 训练内容、设备与现场

- 至少一个已发布的浏览器体感内容、指定浏览器版本、摄像头型号、电脑/网络/场地光照、陪护及异常停止规则。
- 经批准的采集条件、设备、质量阈值、协议参数、批次和实际训练安排。
- 若 Unity 是一期范围：真实 WebGL Build、manifest、版本、资源授权、Bridge 协议与实机回传证据。
- 真实现场附件：截图、录屏/录像、evidence JSON、训练记录和审计只读反查账号。不得用截图、旧 Build、固定分数或脚本造数代替运行时证据。

## 6. 必须交付的验收材料

- 角色、授权、评估、AI/STT/TTS、训练、复核、家属脱敏、导出和审计的真实证据。
- Staging 的 MiMo AI、STT、TTS 现场验收记录，包含受控调用证据、医生复核和 TTS 播放证据。
- 浏览器体感与（如适用）Unity WebGL 的 evidence、截图/录屏、结果/动作指标与审计反查。
- Render 部署、HTTPS、健康检查、迁移、备份恢复、监控告警、Key Value、Secret File 和生产回滚记录。
- 填写后的客户验收包 manifest；包内不得包含密钥、原始病历、完整转写、原始音频、Base64 或 provider 请求/响应正文。

## 7. 缺失即阻断

缺 GitHub 治理、Render 账户/区域批准、HTTPS、密钥、数据库、Key Value、监控/备份、MiMo 三项配置、真实同意、临床评估、医师复核、设备/采集条件、现场证据或验收包任一项，都不能发布或宣称生产完成。下一步执行顺序见 `docs/customer-input-to-launch-gate-runbook.md` 与主计划。
