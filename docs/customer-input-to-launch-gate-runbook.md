# 客户资料到 GitHub + Render 上线门禁 Runbook

本 Runbook 将客户资料、修复、Staging 验收和 Production 发布串为可判定的门禁。它执行严格全量 MiMo 范围：AI、STT、TTS 均为生产必需能力。任何门禁失败均为 `BLOCKED`，不得改成缩小范围、替代供应商、伪造数据或 fallback。

## 1. 建立受控客户资料包

```bash
cp docs/templates/customer-production-input.template.json customer-production-input.json
pnpm verify:customer-production-input -- customer-production-input.json
```

填写实际的 `customer-production-input/v2` 后再次运行校验。必须特别确认：

- GitHub/Render 负责人、生产区域、web/api HTTPS origin、数据库、备份、监控和告警。
- `mimo` 节点的 Secret File 引用、approved hosts、provider 限制、Key Value 配额、telemetry 留存期（30--3650 天）和无默认的 retention job 执行时限。
- AI、speech、tts 三个 `requiredForLaunch` 都是 `true`，provider 精确为 `xiaomi-mimo`、`xiaomi-mimo-audio-understanding`、`xiaomi-mimo-tts`，且 AI 人工复核、STT 麦克风同意、TTS 播放同意均为 `true`。
- 真实患者数据采集与 MiMo 第三方处理已批准，机构、医生、脱敏/导出责任人可追溯。
- 浏览器体感内容/设备已确认；若 Unity 为上线范围，Build 和 manifest 已确认。

资料包仅存引用与脱敏元数据，不能存真实 key、token、病历、原始音频、完整转写或 provider 正文。

## 2. GitHub 合并前质量门禁

在独立分支完成代码审查、迁移审查和生产配置审查。required checks 必须覆盖依赖审计、静态检查、数据库迁移清单、API/Web 单元测试、交付契约、Unity Build 校验及 Render Blueprint 校验。

```bash
pnpm check:static
pnpm test:delivery
pnpm db:migration:manifest:verify
pnpm --filter @rehab-platform/api exec tsc --noEmit --pretty false
pnpm --filter @rehab-platform/web exec tsc --noEmit --pretty false
pnpm --filter @rehab-platform/web lint
```

变更涉及 AI、语音、权限、训练、数据库或部署时，还必须运行其定向单元/集成测试和完整回归。测试通过不等于生产批准；它不能替代客户真实数据、MiMo 调用或实机训练证据。

## 3. Render Staging 配置与迁移

从受保护 GitHub 提交创建或更新 Staging Blueprint。仅由客户授权运维填入 Render 的 `sync: false` 值和 Secret Files。

- API 必须以 `NODE_ENV=production`、`COOKIE_SECURE=true` 启动；`/health/ready` 必须在数据库、迁移校验、Key Value 探针和生产 MiMo 配置均通过后才返回成功。
- `MIMO_API_KEY_FILE=/etc/secrets/mimo_api_key` 与 `SENSITIVE_DATA_KEY_FILE=/etc/secrets/sensitive_data_key` 必须存在并合规；所有原始 provider key 环境变量必须不存在。
- `MIMO_KEY_VALUE_URL` 必须是 Render Key Value 私有地址；配额参数、timeout/response limits、telemetry 留存期和 retention job 执行时限必须是客户批准的精确值。
- 在部署前执行只增不减、可审查的 `pnpm db:migrate:deploy`。迁移备份、恢复演练与回滚步骤必须记录；不得靠手改生产表绕过迁移。
- 首次初始化使用 `pnpm db:bootstrap:production`，且只在 `NODE_ENV=production` 下运行。它读取 `/etc/secrets` 中直接的 `PRODUCTION_BOOTSTRAP_CONFIG_FILE`、`PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE`、`PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD_FILE` 与敏感数据密钥文件；只幂等创建机构、平台管理员和首位医师，强制首次改密并写受控审计。不得以 `db:seed`、`db:seed:trial` 或手工 SQL 替代生产首启，也不得将配置或口令写入资料包。
- Web 的 `NEXT_PUBLIC_API_BASE_URL` 必须是 API 的正式 HTTPS origin；发布后检查 CSP、HSTS、Cookie、CORS、摄像头安全上下文与前后端 origin。

Staging 任一启动、迁移、健康检查、Secret File、Key Value 或安全检查失败时停止，不自动写默认值或切换到本地配置。

## 4. 真实业务数据与临床准备

不得在生产或客户 Staging 用 seed、mock、固定结果或手工脚本构造验收链。必须由授权工作人员建立：

1. 首启完成后，由授权工作人员通过正式流程建立真实患者、有效的 `privacy_policy`、`ai_processing`、`camera_capture`，以及 STT 所需 `microphone_capture`。
2. 真实临床评估输入：MMSE、CDR、认知维度、临床摘要/来源、风险确认和医生责任归属。
3. 医师确认的评估、康复计划、采集条件、设备、质量阈值、协议参数、批次和训练安排。
4. 目标电脑、浏览器、摄像头、网络、场地、陪护/中止规则；以及 Unity（如适用）的真实 Build/manifest。

缺任一环节时，不能开启正式训练或执行保存验收。

## 5. Staging 现场验收

按真实执行顺序保留受控证据：

```bash
pnpm verify:ai-assessment-acceptance -- <ai-config.json>
pnpm verify:speech-transcript-evidence -- <speech-evidence.json>
pnpm verify:speech-transcript-acceptance -- <speech-config.json>
pnpm verify:speech-ai-assessment-acceptance -- <speech-ai-config.json>
pnpm verify:tts-speech-output-evidence -- <tts-evidence.json>
pnpm verify:tts-speech-output-acceptance -- <tts-config.json>
pnpm verify:browser-pose-evidence -- <browser-evidence.json>
pnpm verify:browser-pose-field-acceptance -- <browser-evidence.json> --api-base-url <https-api-origin>
pnpm verify:formal-acceptance-chain -- <business-chain-config.json>
```

Unity 是本期上线范围时，额外执行：

```bash
pnpm verify:unity-field-evidence -- <unity-evidence.json>
pnpm verify:unity-field-acceptance -- <unity-evidence.json> --api-base-url <https-api-origin>
```

验收必须证明：同一真实患者的同意、临床评估、医师确认、训练条件、会话、结果、动作指标、家属脱敏摘要和审计能够关联；AI/STT/TTS 均为真实 MiMo 调用且无替代路径；浏览器/Unity 均在真实设备上运行并保存真实结果。只读反查脚本不能创建、补写或修正记录。

## 6. Production Go/No-Go

只有下列全部满足才能将 GitHub 受保护分支发布到 Production：

- 客户资料包和生产环境门禁均通过。
- GitHub CI、完整回归、迁移清单和依赖审计通过。
- Staging 健康检查、迁移、备份恢复、监控告警、HTTPS/CSP/CORS/secure cookie 和 Key Value 均通过。
- 全量 MiMo 三项现场验收通过，医生人工复核、配额/失败计费书面规则和 telemetry 留存已经确认。
- 真实临床、同意、设备、采集、训练与审计证据完整；Unity 上线时 Unity 证据也完整。
- 客户验收包通过其 manifest 校验，并且没有敏感原始内容。

任一条件不满足为 `NO-GO/BLOCKED`。保持当前安全状态，记录缺项、责任人和恢复条件；不要通过关闭功能、更换供应商、修改结果或回填审计来发布。

## 7. 发布后监控与回滚

发布后持续检查 Render API `/health/live` 与 `/health/ready`、错误率、MiMo 拒绝/失败、Key Value 状态、配额告警、数据库备份和患者安全事件。异常时按经批准的回滚 Runbook 回退到上一已验证 GitHub release，并保留事件审计；不得在 Production 临时插入固定结果、人工绕过授权或非 MiMo 供应商。完整角色、命令和阶段依赖以 `docs/github-render-mimo-production-deployment-plan.md` 为准。
