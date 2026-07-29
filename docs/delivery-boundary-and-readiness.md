# 交付边界与上线准备清单

本文用于区分“正式交付源码”“本地开发资料”“客户历史参考资料”和“上线前必须补齐事项”，避免将原型、示例密钥或初始化数据误当作生产能力交付。

客户 `康复平台设计(1).docx` 的正式交付范围先按 `docs/customer-docx-coverage-matrix.md` 核对。该矩阵以 `DOCX-USER-LOGIN` 到 `DOCX-SOCIAL-SQUARE` 作为总需求账本，并要求所有能力遵循 `No fallback allowed`：缺正式配置、授权、运行时资源、供应商证据、采集批次、审计日志或现场证据时必须阻断；Wearable device integration is customer-gated，Production deployment is customer-gated，Public social square is customer-gated。

## 正式交付范围

以下内容属于当前新项目正式交付范围：

- `apps/web`：四角色 Web 前端与体感训练页面
- `apps/api`：NestJS API、认证授权、业务接口、审计与导出
- `packages/db`：Prisma schema、迁移与本地初始化脚本
- `infra/docker-compose.yml`：本地开发 PostgreSQL
- `docs/unity`：Unity WebGL Bridge 协议
- `docs/formal-training-content-runbook.md`：正式训练内容发布手册
- `docs/formal-delivery-acceptance-runbook.md`：正式交付总验收 Runbook
- `docs/formal-delivery-gap-analysis.md`：正式可交付差距总结
- `docs/customer-docx-coverage-matrix.md`：客户 DOCX 需求到实现、验证、边界和门禁的总覆盖矩阵
- `docs/game-module-delivery-strategy.md`：游戏模块正式交付策略
- `docs/browser-pose-game-library-delivery-plan.md`：浏览器体感多游戏库交付计划
- `docs/customer-acceptance-criteria.md`：客户验收标准
- `docs/customer-production-input-checklist.md`：客户上线资料准备清单
- `docs/customer-final-input-request.md`：客户可转发的最终资料索取单
- `docs/customer-input-to-launch-gate-runbook.md`：客户资料到上线门禁 Runbook
- `docs/ai-speech-provider-selection-free-first.md`：MiMo AI、语音与费用确认说明
- `docs/ai-assessment-draft-integration.md`：MiMo AI 评估草稿、临床人工复核与阻断边界
- `docs/ai-assessment-acceptance-runbook.md`：AI 评估草稿到医生复核正式入库的验收 Runbook
- `docs/formal-acceptance-chain-runbook.md`：同一正式业务链只读验真 Runbook
- `docs/ad8-caregiver-interview-acceptance-runbook.md`：AD-8 照护者访谈正式验收 Runbook
- `docs/speech-provider-readiness-notes.md`：MiMo STT/TTS 生产协议、Secret File、同意与现场验收边界
- `docs/customer-delivery-progress-and-input-summary.md`：客户交付推进与资料确认摘要
- `docs/production-delivery-runbook.md`：生产交付 Runbook
- `docs/browser-pose-field-acceptance-runbook.md`：浏览器体感实机验收 Runbook
- `docs/collection-condition-data-capture-runbook.md`：不同采集条件下结构化数据收集 Runbook
- `docs/templates/multi-condition-data-capture.template.json`：多采集条件数据收集 evidence JSON 模板
- `docs/unity-field-acceptance-runbook.md`：Unity WebGL 正式现场验收 Runbook
- `docs/templates/unity-field-evidence.template.json`：Unity WebGL 现场 evidence JSON 模板
- `docs/speech-transcript-acceptance-runbook.md`：语音转写正式现场验收 Runbook
- `docs/templates/speech-transcript-evidence.template.json`：语音转写 evidence JSON 模板
- `docs/templates/speech-transcript-acceptance-config.template.json`：语音转写现场 API 验收配置模板
- `docs/tts-speech-output-acceptance-runbook.md`：TTS 语音输出正式现场验收 Runbook
- `docs/templates/tts-speech-output-evidence.template.json`：TTS 语音输出 evidence JSON 模板
- `docs/templates/tts-speech-output-acceptance-config.template.json`：TTS 语音输出现场 API 验收配置模板
- `docs/templates/ai-assessment-acceptance-config.template.json`：AI 评估现场 API 验收配置模板
- `docs/templates/formal-acceptance-chain.template.json`：同一正式业务链只读验真配置模板
- `docs/templates/ad8-caregiver-interview-acceptance-config.template.json`：AD-8 照护者访谈验收配置模板
- `docs/templates/speech-ai-assessment-acceptance-config.template.json`：语音转写到 AI 正式评估组合验收配置模板
- `docs/empty-real-loop-acceptance-runbook.md`：新库真实总闭环验收 Runbook
- `docs/templates/empty-real-loop-orchestrator.template.json`：新库真实总闭环验收编排配置模板
- `docs/supply-chain-license-policy-runbook.md`：Render 等价 Linux 生产依赖 SBOM、许可证清单与客户策略门禁手册
- `docs/templates/customer-license-policy.template.json`：客户安全负责人许可证策略审批模板
- `docs/templates/customer-acceptance-package-manifest.template.json`：客户验收包 manifest 归档模板
- `docs/web-playwright-regression-runbook.md`：Web 前端真实浏览器回归测试 Runbook
- `scripts/verify-speech-ai-assessment-acceptance.mjs`：语音转写、AI 草稿、医生复核和 `speech_ai_assessment` 正式入库组合验收脚本
- `scripts/web-playwright-regression.spec.mjs`：Web 前端真实浏览器回归测试用例
- `scripts/playwright-regression.config.mjs`：Web 前端 Playwright 回归测试配置
- `apps/web/public/unity/rehab-unity-bridge.js`：Unity 训练结果回传桥接脚本
- `scripts/verify-local-contracts.mjs`：本地接口契约验收脚本
- `scripts/verify-trial-empty-loop.mjs`：试点空库闭环验收脚本
- `scripts/verify-browser-pose-evidence.mjs`：浏览器体感 evidence JSON 静态自检脚本
- `scripts/verify-browser-pose-field-acceptance.mjs`：浏览器体感实机只读验真脚本，核对附件文件、训练记录 API 和审计日志 API
- `scripts/verify-unity-field-evidence.mjs`：Unity WebGL evidence JSON 静态自检脚本
- `scripts/verify-unity-field-acceptance.mjs`：Unity WebGL 现场只读验真脚本，核对真实 Unity runtime、Bridge 事件、附件文件、训练记录 API 和审计日志 API
- `scripts/verify-speech-transcript-evidence.mjs`：语音转写 evidence JSON 静态自检脚本
- `scripts/verify-speech-transcript-acceptance.mjs`：语音转写现场 API 验收脚本，核对真实录音文件、患者授权、转写响应和审计日志 API
- `scripts/verify-tts-speech-output-evidence.mjs`：TTS 语音输出 evidence JSON 静态自检脚本
- `scripts/verify-tts-speech-output-acceptance.mjs`：TTS 语音输出现场 API 验收脚本，核对供应商音频、播放证据和审计日志 API
- `scripts/verify-ai-assessment-acceptance.mjs`：AI 评估现场 API 验收脚本，核对 AI 草稿不入库、医生复核 approved 后正式评估入库、风险评级、AI 分析和审计日志
- `scripts/verify-formal-acceptance-chain.mjs`：正式业务链只读验真脚本，核对同一患者的授权、评估、方案、训练、复核、家属摘要和审计日志
- `scripts/verify-multi-condition-data-capture.mjs`：多采集条件数据只读验真脚本，核对至少两组不同采集条件下的批次、训练记录、结果、动作指标和审计日志
- `scripts/verify-ad8-caregiver-interview-acceptance.mjs`：AD-8 照护者访谈正式验收脚本，核对授权家属摘要、8 个 AD-8 题项、医生复核、风险评级和审计日志
- `scripts/verify-customer-production-input.mjs`：客户生产资料包校验脚本
- `scripts/verify-empty-real-loop-orchestrator.mjs`：新库真实总闭环验收编排脚本
- `scripts/verify-customer-acceptance-package-manifest.mjs`：客户验收包 manifest 校验脚本

## 参考附件与联调记录

以下资料可作为开发联调和供应商选型参考，但不作为正式验收证据，也不替代客户账号、正式密钥托管、真实录音/音频、供应商调用日志、现场截图/录屏、API 反查和审计反查：

- `docs/xiaomi-token-plan-stt-tts-connectivity-record.md`：小米 MiMo Token Plan STT/TTS 本地联通记录与推荐 endpoint

## 不纳入运行源码包

以下内容不应作为当前新项目运行源码包的一部分：

- `客户提供/`：客户历史版本、旧原型、参考资料和旧部署文档
- `node_modules/`
- `.next/`
- `dist/`
- `coverage/`
- `infra/data/`
- 任意目录下的 `.env`、`.env.local`、`.env.production` 等环境变量文件
- `.playwright-cli/`
- `.playwright-mcp/`

如需将 `客户提供/` 作为附件交付，应单独标注为“客户原始资料/参考附件”，并完成敏感信息、密钥、非生产逻辑和第三方依赖审查。

## 本地初始化数据边界

`pnpm db:seed` 只用于本地开发和自动化验收，不作为试点或生产初始化方式。

本地初始化脚本可能创建示例机构、账号、患者、授权、评估、康复计划、训练记录和审计记录，用于验证完整业务链路。试点或生产环境应通过正式数据导入和账号开通流程生成真实数据。

## 试点初始化边界

试点或准生产环境首次初始化应使用 `pnpm db:seed:trial`，且必须显式配置 `TRIAL_*` 环境变量。

该流程只创建系统角色、试点机构、首个平台超级管理员、首个医师档案和初始化审计日志，不创建患者、AI 评估、康复计划、训练记录或动作指标。完整运行手册见 `docs/trial-initialization-runbook.md`。

## 上线前必须替换

- `DATABASE_URL`：正式数据库连接
- `JWT_SECRET`：强随机密钥
- `WEB_ORIGIN`：正式前端域名
- `NEXT_PUBLIC_API_BASE_URL`：正式 API 域名
- `DEFAULT_PATIENT_PASSWORD`：不得使用固定通用密码
- PostgreSQL 密码和访问策略
- HTTPS 证书和反向代理配置
- 日志、备份、监控和告警配置
- MiMo 密钥与病历加密密钥：必须替换 `MIMO_API_KEY_REF`、`MIMO_API_KEY_FILE=/etc/secrets/mimo_api_key`、`SENSITIVE_DATA_KEY_REF` 与 `SENSITIVE_DATA_KEY_FILE=/etc/secrets/sensitive_data_key`；原始 key 环境变量在生产中禁止存在。
- 全量 MiMo：`AI_REQUIRED_FOR_LAUNCH`、`SPEECH_REQUIRED_FOR_LAUNCH`、`TTS_REQUIRED_FOR_LAUNCH` 和 `AI_HUMAN_REVIEW_REQUIRED` 必须均为 `true`；provider 固定为 MiMo 三项精确值，并替换客户批准的 HTTPS endpoint、模型、提示词、音色、输出格式、限制、Key Value 配额和 telemetry 留存。
- 真实临床：替换患者同意、MMSE、CDR、认知维度、风险确认、医师复核、设备/采集条件/协议/批次及现场证据；这些值不能由 seed、脚本或本地样例产生。

## 当前阻塞交付事项

客户 DOCX 需求覆盖、当前状态、验证命令和 customer-gated 项以 `docs/customer-docx-coverage-matrix.md` 为准；矩阵中软件侧标为 `done` 的条目仍必须按对应 proof、现场证据、客户资料包和 `No fallback allowed` 边界验收，不能被口头说明或本地演示替代；标为 `customer-gated` 的条目必须等客户补齐范围、资料和运营责任后另行验收。

1. MiMo AI、STT、TTS 必须同时具备生产配置、正式 HTTPS endpoint、`secret-manager://...` 引用、Render Secret File、配额/计费书面规则、模型/语音调用日志留存和医师人工复核/播放证据；任一项缺失均为上线硬阻断，不能以 mock/demo/local、本地录入、其他供应商或脚本兜底替代。
   `POST /ai/assessment-speech-transcripts` 只是严格 STT 接入骨架，不解除真实语音服务接入阻塞。
   若声明真实大模型评估上线，还必须按 `docs/ai-assessment-acceptance-runbook.md` 执行现场 API 验收。
   若声明真实语音转写上线，还必须按 `docs/speech-transcript-acceptance-runbook.md` 执行 evidence JSON 自检和现场 API 验收。
   若声明“语音输入 + AI 评估 + 正式入库”为一期正式能力，还必须执行 `pnpm verify:speech-ai-assessment-acceptance -- <config-json-path>`，证明 `STT -> AI 草稿 -> 医生 approved -> speech_ai_assessment 入库 -> 审计` 的组合链路真实可用。
   若声明 TTS 语音输出上线，还必须按 `docs/tts-speech-output-acceptance-runbook.md` 执行 evidence JSON 自检和现场 API 验收，证明 `POST /ai/tts-speech-outputs -> 供应商音频 -> 前端播放 -> 审计` 链路真实可用。
2. 至少 1 个正式训练内容实机验收：发布浏览器体感或 Unity 内容，完成真实训练运行、结果生成、入库和审计。
3. Unity WebGL 正式构建接入：`manifest.json`、Build 文件、真实 Unity runtime、Bridge 回传、只读训练记录验真和审计验真。
4. 隐私权限专项验收：撤回授权阻断、家属摘要脱敏、医师患者归属、导出脱敏审计。
5. 生产部署方案：Web、API、PostgreSQL、静态训练资源、HTTPS、备份与监控。
6. 客户验收标准冻结：角色权限、训练指标、AI 输入输出、数据导出范围、设备和浏览器要求。

详细缺口、游戏路线、客户验收口径和生产上线准备见：

- `docs/formal-delivery-gap-analysis.md`
- `docs/formal-delivery-acceptance-runbook.md`
- `docs/game-module-delivery-strategy.md`
- `docs/customer-acceptance-criteria.md`
- `docs/customer-production-input-checklist.md`
- `docs/customer-final-input-request.md`
- `docs/customer-input-to-launch-gate-runbook.md`
- `docs/ai-speech-provider-selection-free-first.md`
- `docs/ai-assessment-acceptance-runbook.md`
- `docs/formal-acceptance-chain-runbook.md`
- `docs/ad8-caregiver-interview-acceptance-runbook.md`
- `docs/customer-delivery-progress-and-input-summary.md`
- `docs/production-delivery-runbook.md`
- `docs/browser-pose-field-acceptance-runbook.md`
- `docs/collection-condition-data-capture-runbook.md`
- `docs/unity-field-acceptance-runbook.md`
- `docs/templates/unity-field-evidence.template.json`
- `docs/speech-transcript-acceptance-runbook.md`
- `docs/templates/speech-transcript-evidence.template.json`
- `docs/templates/speech-transcript-acceptance-config.template.json`
- `docs/tts-speech-output-acceptance-runbook.md`
- `docs/templates/tts-speech-output-evidence.template.json`
- `docs/templates/tts-speech-output-acceptance-config.template.json`
- `docs/templates/ai-assessment-acceptance-config.template.json`
- `docs/templates/formal-acceptance-chain.template.json`
- `docs/templates/ad8-caregiver-interview-acceptance-config.template.json`
- `docs/templates/speech-ai-assessment-acceptance-config.template.json`
- `docs/empty-real-loop-acceptance-runbook.md`
- `docs/templates/empty-real-loop-orchestrator.template.json`
- `scripts/verify-empty-real-loop-orchestrator.mjs`
- `docs/templates/customer-acceptance-package-manifest.template.json`
- `scripts/verify-customer-acceptance-package-manifest.mjs`
- `docs/web-playwright-regression-runbook.md`
- `scripts/web-playwright-regression.spec.mjs`
- `scripts/playwright-regression.config.mjs`

## 交付验收建议

每次准备交付前至少执行：

```bash
node --test scripts/__tests__/customer-docx-coverage-boundary.test.mjs
pnpm test:delivery
pnpm delivery:check
pnpm test:playwright
pnpm --filter @rehab-platform/web exec tsc --noEmit --pretty false
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web build
pnpm verify:contracts
```

当客户要求一次性证明“登录/RBAC、患者建档、授权、AI/STT/TTS、Unity、浏览器体感、家属脱敏查看、后台审计”全部进入本期正式交付范围时，应使用显式配置执行总闭环编排：

```bash
pnpm verify:empty-real-loop -- <orchestrator-config-json>
```

该编排器只串联现有验收脚本，不创建数据、不生成证据、不读取 `.env`、不补写审计日志。任一子验收失败即停止，缺配置、缺授权、缺正式证据时应由客户或运维补齐现场资料后重跑。

总闭环报告、专项 evidence、截图/录屏、脱敏导出样例和审计样例整理成客户验收包后，应执行：

```bash
pnpm verify:customer-acceptance-package-manifest -- <manifest-json-path> --package-root <customer-acceptance-package-dir>
```

配置模板：`docs/templates/customer-acceptance-package-manifest.template.json`

该命令只检查 manifest 指向的交付证据文件存在、非空、摘要匹配且不含占位符、伪数据标记或敏感字段；它不读取 `.env`，不读取 field acceptance 运行时账号密码，不生成 evidence，也不替代任何专项现场验收。

Web 前端壳层回归应使用真实浏览器执行：

```bash
pnpm test:playwright
```

该检查只证明 Next.js 前端可启动、核心导航可切换、AI/STT/TTS、Unity WebGL、浏览器体感、家属协同、脱敏导出和审计入口仍可见；它不创建业务数据、不读取 `.env`，也不替代真实 AI/语音供应商验收、Unity/体感实机采集验收或空库总闭环验收。执行说明见 `docs/web-playwright-regression-runbook.md`。

完成浏览器体感训练现场验收后，应先校验证据 JSON：

```bash
pnpm verify:browser-pose-evidence -- <evidence-json-path>
```

正式通过还必须执行只读实机验真：

```bash
BROWSER_POSE_PATIENT_ACCOUNT='<browser-patient-read-account>' \
BROWSER_POSE_PATIENT_PASSWORD='<browser-patient-read-password>' \
BROWSER_POSE_AUDIT_ACCOUNT='<browser-audit-read-account>' \
BROWSER_POSE_AUDIT_PASSWORD='<browser-audit-read-password>' \
pnpm verify:browser-pose-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com
```

只读实机验真必须能证明截图/录屏文件存在且非空、训练记录 API 与 evidence 一致、`training_session.start` 和 `training_result.submit` 两类成功审计日志与 evidence 一致。正式浏览器体感现场验收只接受 `qualityFlag=valid` 且 `abnormalFlag=false` 的有效训练样本；异常、可疑或低质量结果的 `training_result.review`、复核结论和审计日志由 `pnpm verify:contracts` 验收，不放入 field acceptance 通过样本。训练结果页的审计自动聚合只读取已加载日志并辅助填写 ID，最终仍以只读 API 验真为准。缺 API、缺 Browser Pose 专属患者/审计账号密码、Cookie/CSRF 登录失败、缺附件、缺训练记录或缺审计日志时，浏览器体感训练不能计为正式可交付。API 地址、evidence JSON 和审计 metadata 必须拒绝 `mock/demo/seed/fallback/fixed/manual` 的明文、拼接和 URL 编码标记，不得包含密码、token、密钥、请求/响应正文、原始 payload 或 base64 原始内容；验真失败时不得输出 HTTP 响应体或 mismatch 原值。

完成 Unity WebGL 正式现场验收后，应先校验证据 JSON：

```bash
pnpm verify:unity-field-evidence -- <evidence-json-path>
```

正式通过还必须执行只读实机验真：

```bash
UNITY_FIELD_PATIENT_ACCOUNT='<unity-patient-read-account>' \
UNITY_FIELD_PATIENT_PASSWORD='<unity-patient-read-password>' \
UNITY_FIELD_AUDIT_ACCOUNT='<unity-audit-read-account>' \
UNITY_FIELD_AUDIT_PASSWORD='<unity-audit-read-password>' \
pnpm verify:unity-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com
```

Unity 只读实机验真只执行 `GET` 查询和本地文件读取，不创建或补写任何业务数据。它必须能证明真实 Unity WebGL runtime 已启动、Bridge 事件与训练结果一致、截图/录屏文件存在且非空、训练记录 API 与 evidence 一致、`training_session.start` 和 `training_result.submit` 两类成功审计日志与 evidence 一致。正式 Unity WebGL 现场验收只接受 `qualityFlag=valid` 且 `abnormalFlag=false` 的有效训练样本；异常、可疑或低质量结果的 `training_result.review`、复核结论和审计日志由 `pnpm verify:contracts` 验收，不放入 field acceptance 通过样本。训练结果页的审计自动聚合只读取已加载日志并辅助填写 ID，最终仍以只读 API 验真为准。缺 API、缺 Unity 专属患者/审计账号密码、Cookie/CSRF 登录失败、缺附件、缺训练记录、缺审计日志或缺真实 Unity WebGL runtime 时，Unity 训练不能计为正式可交付；mock、demo、seed、fallback、fixed、manual 和固定成绩不能计为正式证据。API 地址、evidence JSON 和审计 metadata 必须拒绝伪数据标记、敏感字段和原始载荷；验真失败时不得输出 HTTP 响应体或 mismatch 原值。

完成 AI 评估正式现场验收时，必须执行：

```bash
pnpm verify:ai-assessment-acceptance -- <config-json-path>
```

配置模板：`docs/templates/ai-assessment-acceptance-config.template.json`

该验收会通过平台 API 生成 AI 草稿，并确认草稿阶段不会新增正式评估记录；随后只在配置中的人工复核结论为 `approved` 时创建正式评估，并反查风险评级、AI 分析记录和 `ai.assessment_draft.generate`、`assessment.create` 审计日志。缺 HTTPS API、缺 token、缺 `privacy_policy` 或 `ai_processing` 授权、缺供应商调用证据、缺人工复核批准、缺风险/AI 分析/审计记录时，真实 AI 评估不能计为正式可交付；mock、demo、seed、fallback、fixed 结果和手工包装不能计为正式证据。

完成语音转写正式现场验收后，应先校验证据 JSON：

```bash
pnpm verify:speech-transcript-evidence -- <evidence-json-path>
```

正式通过还必须执行现场 API 验收：

```bash
pnpm verify:speech-transcript-acceptance -- <config-json-path>
```

配置模板：`docs/templates/speech-transcript-acceptance-config.template.json`

语音转写现场验收会读取真实录音文件，调用平台 API，并反查患者授权和审计日志。它不会直接调用供应商密钥、不会创建正式评估、不会生成 AI 草稿、不会补审计日志。缺 HTTPS API、缺 token、缺真实录音文件、缺 `microphone_capture` 授权、缺供应商调用证据或缺成功审计日志时，语音转写不能计为正式可交付；mock、demo、seed、fallback、fixed transcript 和手工转写不能计为正式证据。

完成语音 AI 组合验收时执行：

```bash
pnpm verify:speech-ai-assessment-acceptance -- <config-json-path>
```

配置模板：`docs/templates/speech-ai-assessment-acceptance-config.template.json`

该命令会读取真实录音文件，依次调用 `POST /ai/assessment-speech-transcripts`、`POST /ai/assessment-drafts` 和 `POST /assessments`，要求最终评估来源为 `speech_ai_assessment`，并保留 `{ ai, speech, humanReview }` 证据结构。它会反查语音转写审计、AI 草稿审计和正式评估创建审计；缺授权、缺供应商证据、草稿阶段误入库、人工复核不匹配、风险评级/AI 分析缺失或审计缺失时必须失败。

脚本文件：`scripts/verify-speech-ai-assessment-acceptance.mjs`

完成 TTS 语音输出正式现场验收时，应先校验证据 JSON：

```bash
pnpm verify:tts-speech-output-evidence -- <evidence-json-path>
```

正式通过还必须执行现场 API 验收：

```bash
pnpm verify:tts-speech-output-acceptance -- <config-json-path>
```

配置模板：`docs/templates/tts-speech-output-acceptance-config.template.json`

TTS 验收会通过平台 API 调用 `POST /ai/tts-speech-outputs`，要求返回真实供应商音频、`provider_text_to_speech` 证据、浏览器播放结果和 `ai.tts_speech_output.generate` 审计日志。缺 HTTPS API、缺 token、缺 `privacy_policy`/`ai_processing` 授权、缺供应商音频、缺调用 ID、缺成功审计日志时必须失败；浏览器 SpeechSynthesis、预生成音频、固定音频、mock/demo/fallback/manual 证据不能计为正式可交付。

试点或生产环境准备前，还必须在目标环境变量已显式配置后执行：

```bash
pnpm delivery:check:production -- --customer-input customer-production-input.json
```

该检查会拒绝占位符、本地地址、开发 JWT 密钥、固定本地密码和非 HTTPS 正式地址，并校验环境变量中的 AI/语音上线范围与客户资料包一致；失败时应由客户或运维提供正式配置，不允许脚本自动替换为默认值。

此外，应使用真实浏览器逐角色验证：

- 患者：建档授权、结构化评估、今日训练、训练结果
- 家属：授权摘要、今日提醒、隐私边界
- 医师：负责患者、方案调整、训练结果回看
- 运营管理：训练内容、脱敏导出、审计日志
