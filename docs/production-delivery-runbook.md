# GitHub + Render 生产交付 Runbook

本文是生产执行手册。范围固定为 GitHub 受保护分支、Render、全量 MiMo AI/STT/TTS、真实临床闭环、浏览器体感以及客户要求时的 Unity WebGL。详细整改顺序以 `docs/github-render-mimo-production-deployment-plan.md` 为准。

## 生产前置条件

- 客户资料包已通过 `pnpm verify:customer-production-input -- <input.json>`；三项 MiMo `requiredForLaunch` 均为 `true`。
- GitHub required checks、依赖审计、迁移清单、API/Web 测试、交付契约和 Build 校验通过。
- 客户已经批准 Render 团队、区域、数据库、Key Value、备份恢复、监控告警、HTTPS 域名和运营责任；Blueprint 当前统一使用新加坡，未经数据驻留批准不得创建生产资源。
- 客户已经批准 MiMo 账号、host、模型、提示词、音色、费用、配额窗口、失败计费/退款/重试规则、数据处理、telemetry 留存和医生复核责任。
- 验收中的患者、临床评估、同意、设备、采集条件、训练内容和现场证据均真实且已授权。

## Render 运行时合同

使用仓库根目录 `render.yaml` 管理 Production 候选资源。该候选的 API、Web 与 Cron 均设置 `autoDeployTrigger: off`，不能把通过 CI 的任意提交直接部署到 Production；Staging 的 `checksPass` 配置和指向不可变 Git SHA/tag 的 Production 推广机制必须由客户另行批准、验证和归档。普通配置与 Secret File 的责任必须分离：

- Render 托管 `JWT_SECRET`；数据库使用 Render Postgres 连接。
- `SENSITIVE_DATA_KEY_REF` 与 `SENSITIVE_DATA_KEY_FILE=/etc/secrets/sensitive_data_key` 必须配置。
- `MIMO_API_KEY_REF` 与 `MIMO_API_KEY_FILE=/etc/secrets/mimo_api_key` 必须配置；AI、STT、TTS 共用该 MiMo Secret File。
- 一次性首启配置、管理员口令和医师口令分别只从 `PRODUCTION_BOOTSTRAP_CONFIG_FILE=/etc/secrets/production_bootstrap.json`、`PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE=/etc/secrets/production_bootstrap_admin_password`、`PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD_FILE=/etc/secrets/production_bootstrap_doctor_password` 读取。它们的内容只由客户在 API 服务的 Secret Files 中维护，不能写入环境变量、Git 或验收资料。
- 不得设置 `MIMO_API_KEY`、`AI_API_KEY`、`SPEECH_API_KEY`、`TTS_API_KEY` 或将原始 key 写入任何普通环境变量。
- `AI_REQUIRED_FOR_LAUNCH`、`SPEECH_REQUIRED_FOR_LAUNCH`、`TTS_REQUIRED_FOR_LAUNCH` 与 `AI_HUMAN_REVIEW_REQUIRED` 都必须精确为 `true`。
- provider 必须精确为 `xiaomi-mimo`、`xiaomi-mimo-audio-understanding`、`xiaomi-mimo-tts`；endpoint 必须是 `MIMO_ALLOWED_HOSTS` 内的 HTTPS 地址。
- 配置 AI/STT/TTS 的模型、提示词、音色、输出格式、timeout、最大响应字节数和 `MIMO_USAGE_*` 全部正整数配额。`MIMO_KEY_VALUE_URL` 使用 Render Key Value 私有 URL。
- API 必须以 `NODE_ENV=production`、`COOKIE_SECURE=true` 运行；Web 的 `NEXT_PUBLIC_API_BASE_URL` 是正式 HTTPS API origin。

生产启动会校验以上合同，并在数据库、迁移校验、Key Value 探针或 MiMo 配置失败时拒绝 `/health/ready`。禁止默认值、自动降级、非 MiMo 供应商或浏览器本地替代。

## 发布步骤

1. 将通过审查的 commit 合入 GitHub 受保护发布分支；确认 CI 成功，不强推或跳过 required check。
2. 在 Render 创建/更新 Postgres、Key Value、API、Web 和 telemetry retention cron；填写 custom domains、Secret Files 与 `sync: false` 环境变量，所有真实值只在 Render 中出现。
3. 对新库或经批准的 staging 数据库执行 `pnpm db:migrate:deploy`。先取得备份和恢复演练记录；不得手工改表或回填迁移状态。
4. 新生产库只执行 `pnpm db:bootstrap:production` 进行首启。该命令限定 `NODE_ENV=production`，从 `/etc/secrets` 的 `PRODUCTION_BOOTSTRAP_CONFIG_FILE`、`PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE`、`PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD_FILE` 与敏感数据密钥文件读取受控输入；它仅幂等创建机构、`admin_super` 和首位医师、强制首次改密并写审计。不得改用 `db:seed`、`db:seed:trial`、SQL 脚本或明文环境变量。
5. 等待 API `/health/live` 与 `/health/ready`、Web 首页及 HTTPS 通过。检查 CSP、HSTS、secure Cookie、CORS、摄像头安全上下文和 Key Value 可用性。
6. 先在 Staging 完成真实 MiMo、临床、训练和审计验收；所有 Go 条件满足后再推广同一已验证 release 到 Production。

## 真实现场验收

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

Unity 是本期已批准范围时，额外完成 `pnpm verify:unity-field-evidence` 和 `pnpm verify:unity-field-acceptance`。脚本和只读验真不得创建患者、训练或审计数据；缺真实 patient consent、MMSE/CDR/认知维度、医师确认、设备/协议/批次、MiMo 调用、播放、运行时或审计记录时均失败。

## 监控、保留与回滚

- 监控 API 健康、数据库、Key Value、MiMo 拒绝/失败、配额、延迟、TTS 播放失败、训练安全事件和备份任务。
- GitHub CI 的 `test:integration:mimo-usage-gate-redis` 只连接固定的 disposable `redis://127.0.0.1:6379/15`，并要求 `MIMO_USAGE_GATE_REDIS_TEST_CONFIRM_DISPOSABLE=YES`。它验证真实 Redis 的跨实例原子性，不读取或连接 Render Key Value、Staging 或 Production。
- retention cron 仅清理最小化 provider telemetry。每个 UTC 日期只有一个运行记录；只有 `failed` 或已超过持久化 deadline 的 `running` 记录可被条件更新原子接管重试，并复用首次的 retention days 与 cutoff。`completed`、仍在 deadline 内的 `running`、竞争失败者和历史 deadline 为空的 `running` 均返回 `already_ran`。删除、成功事件和完成状态在一个数据库事务内提交；审计、临床、患者、原始训练数据的留存/删除由客户政策和合规流程决定。
- 出现安全、可用性或临床数据问题时，按已批准 Runbook 回退到上一 GitHub 已验证 release，并保留审计与事件记录。不得通过固定结果、手工越权、临时 key、代理服务或功能降级恢复服务。

发布门禁和客户资料格式详见 `docs/customer-input-to-launch-gate-runbook.md`、`docs/customer-final-input-request.md` 与主计划。
