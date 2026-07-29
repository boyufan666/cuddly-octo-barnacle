# 正式交付总验收 Runbook

本文用于把客户资料、生产配置、真实数据闭环、AI/STT/TTS 证据、体感训练实机验收和最终交付包串成一个可执行流程。任何步骤缺资料、缺证据或校验失败，都应判定为 `BLOCKED`，不得用 seed、mock、demo、固定结果、手工改字段或 fallback 替代。

## 0. 验收原则

- 所有验收以真实 API、真实数据库、真实浏览器、真实权限和真实审计日志为准。
- 本地 seed 数据、静态原型图、截图样例和旧客户 demo 只能作为参考，不能作为正式验收通过依据。
- 已实现平台接入小米 MiMo AI/STT/TTS 的严格调用链路；正式交付需通过真实客户账号、运行时密钥、供应商调用日志和验收脚本。
- 本期正式 AI/STT/TTS 均使用小米 MiMo。客户必须提供 MiMo 客户账号、正式 HTTPS endpoint、`secret-manager://...` 引用、Render Secret File、模型/语音调用日志、医师人工复核和 TTS 播放验收证据。任何非 MiMo 供应商都不属于本期部署范围，不能作为替代或临时恢复方案。
- 浏览器体感训练必须有摄像头实采、动作指标入库、训练记录 API 和审计日志 API 证据。
- Unity WebGL 训练必须有真实 WebGL Build、真实 Unity runtime 启动、Bridge 回传、动作指标入库、训练记录 API 和审计日志 API 证据。

## 1. 客户资料包验收

给客户发送资料索取时，可先使用 `docs/customer-final-input-request.md` 作为短版清单；客户回复后按 `docs/customer-input-to-launch-gate-runbook.md` 整理为结构化资料包并执行上线门禁。

客户先按模板填写资料包：

```bash
cp docs/templates/customer-production-input.template.json customer-production-input.json
```

模板文件只展示字段结构，原样必须校验失败。执行校验前，应替换为客户确认后的正式资料。

填写后执行：

```bash
pnpm verify:customer-production-input -- customer-production-input.json
```

通过条件：

- 正式 Web/API 域名均为 HTTPS。
- 数据库、敏感数据密钥和 MiMo 密钥均为 `secret-manager://...` 引用；生产实际密钥只经 Render Secret File `/etc/secrets/sensitive_data_key` 与 `/etc/secrets/mimo_api_key` 注入。
- 隐私协议、授权责任人、数据留存、脱敏导出责任人已填写。
- AI/STT/TTS 均已填写 MiMo 账号负责人、费用确认、模型版本、endpoint、调用日志、AI 医师复核与 TTS 播放证据，且三个 `requiredForLaunch` 都为 `true`。
- 任何 `requiredForLaunch=false`、缺失或非 MiMo provider 都必须阻断本期生产启动与验收。
- 浏览器体感已提供实机 evidence 路径、目标浏览器和摄像头型号。
- 如本次交付包含 Unity WebGL，已提供 Unity evidence 路径、真实 Build/manifest 路径、目标浏览器和现场设备信息。

失败处理：

- 缺任何字段，先退回客户补资料。
- 出现 `<...>`、`mock`、`demo`、`local`、`manual`、`fallback`、明文 key、HTTP、本地地址，必须阻断。
- 此命令只验证客户材料完整性，不替代生产环境变量检查、真实 AI/STT/TTS 调用验收或体感实机验真。

## 2. 生产配置门禁

在目标环境变量已由客户或运维显式配置后执行：

```bash
pnpm delivery:check:production -- --customer-input customer-production-input.json
```

通过条件：

- `DATABASE_URL`、`JWT_SECRET`、`WEB_ORIGIN`、`NEXT_PUBLIC_API_BASE_URL`、`DEFAULT_PATIENT_PASSWORD` 均为正式配置。
- 必须显式声明 `AI_REQUIRED_FOR_LAUNCH`、`SPEECH_REQUIRED_FOR_LAUNCH` 和 `TTS_REQUIRED_FOR_LAUNCH`，且分别与客户资料包的 `ai.requiredForLaunch`、`speech.requiredForLaunch`、`tts.requiredForLaunch` 一致。
- `AI_REQUIRED_FOR_LAUNCH`、`SPEECH_REQUIRED_FOR_LAUNCH`、`TTS_REQUIRED_FOR_LAUNCH` 与 `AI_HUMAN_REVIEW_REQUIRED` 均精确为 `true`，并与客户资料包一致。
- MiMo 生产配置齐全：`MIMO_API_KEY_REF`、`MIMO_API_KEY_FILE`、`MIMO_ALLOWED_HOSTS`、`MIMO_USAGE_*`、`AI_PROVIDER=xiaomi-mimo`、AI 模型/endpoint/提示词/限制、`SPEECH_PROVIDER=xiaomi-mimo-audio-understanding`、STT 模型/endpoint/限制、`TTS_PROVIDER=xiaomi-mimo-tts`、TTS 模型/endpoint/音色/格式/限制。
- endpoint 必须为 HTTPS；密钥必须为引用；日志留存 30 到 3650 天；AI 人工复核必须为 `true`。

失败处理：

- 不允许脚本自动替换默认值。
- 不允许把本地 `.env`、固定密码、localhost、HTTP、开发 JWT 或 demo 配置带入试点/生产。

## 3. 空库真实闭环验收

生产环境首次初始化必须用 `pnpm db:bootstrap:production`。该命令仅在 `NODE_ENV=production` 下运行，从 `/etc/secrets` 的 `PRODUCTION_BOOTSTRAP_CONFIG_FILE`、`PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE`、`PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD_FILE` 与敏感数据密钥文件读取输入，只幂等创建机构、平台管理员和首位医师，强制首次改密并写审计；不创建患者、评估、计划或训练数据。不得用 `pnpm db:seed`、`pnpm db:seed:trial`、手工 SQL 或明文口令替代。

然后准备真实环境变量并执行：

```bash
pnpm verify:trial-empty-loop
```

通过条件：

- trial 管理员和医师能登录。
- 管理员通过正式 API 创建患者。
- 患者签署当前版本隐私、评估数据处理和摄像头授权。
- 医师录入结构化 MMSE/CDR 和评估摘要。
- 管理员发布正式 `browser_pose_canvas` 训练内容。
- 医师生成并确认康复方案。
- 患者开始训练并提交结构化训练结果和四项动作指标。
- 医师能查询训练记录和动作指标。

边界：

- 该脚本不调用真实 AI/STT/TTS，不产生生产 AI/STT/TTS 调用日志。
- 该脚本不替代浏览器摄像头实机验收。

## 4. AI/STT/TTS 真实能力验收

本节是本期必须完成的真实 AI/STT/TTS 验收。

供应商固定为小米 MiMo AI/STT/TTS 严格调用链路。客户资料包必须与该契约一致；非 MiMo 供应商不在本期变更范围，也不得作为失败后的恢复路径。

后端入库要求：

- 大模型评估必须使用 `production_ai_assessment` 来源。
- 语音评估必须使用 `speech_ai_assessment` 来源，并要求患者已签署 `microphone_capture`。
- `rawInputSummary.evidence` 必须包含供应商、模型、模型版本、调用 ID、正式 HTTPS endpoint、提示词版本、调用时间、人工复核记录。
- 人工复核结论必须为 `approved` 才允许创建评估记录、风险评级和 AI 分析记录。

大模型评估若纳入本次上线范围，必须按 `docs/ai-assessment-acceptance-runbook.md` 执行现场 API 验收：

```bash
pnpm verify:ai-assessment-acceptance -- <config-json-path>
```

验收配置可从 `docs/templates/ai-assessment-acceptance-config.template.json` 复制后填写；模板本身含占位符，不能直接作为正式验收配置。

该脚本会调用平台 API 生成 AI 评估草稿，确认草稿阶段没有创建正式评估，再使用配置中的医生人工复核 `approved` 记录调用 `POST /assessments`，并反查正式评估、风险评级、AI 分析和审计日志。脚本不会读取供应商密钥，不补写审计日志，不把失败转成成功；任一证据缺失必须失败。

客户必须提供的证据：

- 供应商控制台配置截图或清单。
- 密钥托管引用清单，不包含真实密钥明文。
- 至少一条脱敏调用日志样例，包含调用 ID、调用时间、模型版本、提示词版本、错误码或成功状态、关联评估记录。
- 医师人工复核记录，包含复核人、复核时间、结论和关联评估。
- 语音能力还需语音识别调用日志和 `microphone_capture` 授权记录。

语音转写 STT 若纳入本次上线范围，必须按 `docs/speech-transcript-acceptance-runbook.md` 执行两步验收：

```bash
pnpm verify:speech-transcript-evidence -- <evidence-json-path>
pnpm verify:speech-transcript-acceptance -- <config-json-path>
```

现场 API 配置可从 `docs/templates/speech-transcript-acceptance-config.template.json` 复制后填写；录音文件必须是真实现场采集音频。

第一步校验证据 JSON、供应商调用证据、人工复核边界和附件；第二步读取真实录音文件，通过平台 API 调用 `POST /ai/assessment-speech-transcripts`，并只读反查患者授权和审计日志。该流程不会创建正式评估、不会生成 AI 草稿、不会直接调用供应商密钥、不会补写审计日志；任一证据缺失必须失败。

TTS 语音输出若纳入本次上线范围，必须按 `docs/tts-speech-output-acceptance-runbook.md` 执行两步验收：

```bash
pnpm verify:tts-speech-output-evidence -- <evidence-json-path>
pnpm verify:tts-speech-output-acceptance -- <config-json-path>
```

现场 API 配置可从 `docs/templates/tts-speech-output-acceptance-config.template.json` 复制后填写；播报文本必须是现场真实验收内容。

该流程通过平台 API 调用 `POST /ai/tts-speech-outputs`，要求后端调用真实 TTS 供应商、前端播放供应商返回音频，并反查 `ai.tts_speech_output.generate` 审计日志。供应商音频必须是与声明格式匹配的 WAV 或 MP3；浏览器本地朗读、预生成音频、静态 mp3、手工上传音频或任何 fallback 不能作为正式 TTS 验收证据。

若本期正式范围要求“语音输入直接进入 AI 评估闭环”，还必须执行组合验收：

```bash
pnpm verify:speech-ai-assessment-acceptance -- <config-json-path>
```

组合验收配置可从 `docs/templates/speech-ai-assessment-acceptance-config.template.json` 复制后填写；它必须串联真实录音、真实 STT、真实 AI 草稿和医生复核入库。

该脚本会读取真实录音文件，依次完成语音转写、AI 草稿生成、医生 `approved` 后正式评估创建，并反查 `speech_ai_assessment` 评估记录、风险评级、AI 分析、语音转写审计、AI 草稿审计和正式评估审计。正式评估证据必须保存 `{ ai, speech, humanReview }`，不能把语音转写文本或手工摘要包装为真实语音 AI 评估。

失败处理：

- 缺供应商证据、调用日志、人工复核、麦克风授权或 TTS 播放验收时，不能按真实 AI/STT/TTS 验收通过。
- 不允许把结构化录入、手工摘要、seed 数据或脚本结果包装成真实 AI/STT/TTS 结果。

## 4A. 同一正式业务链只读验真

当客户要求一次性交付时，必须证明“授权、评估、方案、训练、复核、家属摘要和审计”属于同一条业务链，而不是多个互不相干的截图或脚本样例。

准备配置：

```bash
cp docs/templates/formal-acceptance-chain.template.json formal-acceptance-chain.json
```

填写现场真实 ID 后执行：

```bash
pnpm verify:formal-acceptance-chain -- <config-json-path>
```

通过条件：

- 同一 `patientId` 能反查有效 `privacy_policy`、`ai_processing`、`camera_capture` 和 `caregiver_sharing` 授权。
- 同一 `assessmentId` 能反查正式评估、风险评级和分析记录。
- 同一 `rehabPlanId`、`planItemId`、`gameContentId` 是当前 active 方案的一部分。
- 同一 `trainingSessionId`、`trainingResultId` 能反查训练结果、动作指标和医生复核 `reviewStatus=reviewed`。
- 授权家属 token 能读取同一患者摘要，且摘要不暴露原始动作指标、采集明细、方案编辑权限或完整病历。
- 审计 token 能反查 `consent.grant`、`caregiver_relation.create`、`assessment.create`、`rehab_plan.recommend`、`rehab_plan.confirm`、`training_session.start`、`training_result.submit`、`training_result.review`、`caregiver.summary.view` 成功审计日志。

边界：

- 该脚本只读验真，不创建数据、不补审计、不替代 AI/STT/TTS 供应商调用验收，也不替代 Unity/浏览器体感现场实机验收。
- 方案调整记录当前没有单独只读 API，本脚本只能验证确认后的当前方案和 `rehab_plan.confirm` 审计日志。

## 5. 浏览器体感实机验收

现场完成浏览器体感训练后，先保存 evidence JSON、截图和录屏，然后执行：

```bash
pnpm verify:browser-pose-evidence -- <evidence-json-path>
```

再执行只读实机验真：

```bash
BROWSER_POSE_PATIENT_ACCOUNT='<browser-patient-read-account>' \
BROWSER_POSE_PATIENT_PASSWORD='<browser-patient-read-password>' \
BROWSER_POSE_AUDIT_ACCOUNT='<browser-audit-read-account>' \
BROWSER_POSE_AUDIT_PASSWORD='<browser-audit-read-password>' \
pnpm verify:browser-pose-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com
```

通过条件：

- evidence JSON 字段完整，无占位符。
- 截图和录屏文件存在且非空。
- API 中能反查到训练 session、训练结果、游戏内容和四项动作指标。
- 审计日志 API 中能反查到 `training_session.start` 和 `training_result.submit`。
- evidence 中的 session/result/gameContent/motionMetrics/auditLogIds 与真实 API 数据一致。

失败处理：

- 缺 API、缺 Browser Pose 专属患者/审计账号密码、Cookie/CSRF 登录失败、缺附件、缺训练记录、缺动作指标、缺审计日志时，浏览器体感训练不能计为正式可交付。
- 姿态质量不足、训练时长过短、异常反应时间等应按后台复核流程处理，不得改造成正常训练结果。

## 6. Unity WebGL 正式现场验收

仅当本次交付包含 Unity WebGL 训练内容时执行本节。Unity 源码自检或 WebGL Build 文件校验不能替代现场只读验真。

现场完成 Unity WebGL 训练后，先保存 evidence JSON、截图和录屏，然后执行：

```bash
pnpm verify:unity-field-evidence -- <evidence-json-path>
```

再执行只读实机验真：

```bash
UNITY_FIELD_PATIENT_ACCOUNT='<unity-patient-read-account>' \
UNITY_FIELD_PATIENT_PASSWORD='<unity-patient-read-password>' \
UNITY_FIELD_AUDIT_ACCOUNT='<unity-audit-read-account>' \
UNITY_FIELD_AUDIT_PASSWORD='<unity-audit-read-password>' \
pnpm verify:unity-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com
```

通过条件：

- evidence JSON 字段完整，无占位符。
- Unity runtime 为 `unity_webgl`，manifest、Build 地址和训练页面均为正式 HTTPS 地址。
- `gameContent`、`unityRuntime`、`trainingSession.runtimeConfigSnapshot`、`bridgeEvent` 和 `trainingResult` 的版本、协议、`gameRunId`、payload hash 交叉一致。
- 截图和录屏文件存在且非空。
- API 中能反查到训练 session、训练结果、游戏内容、runtime 快照和 evidence 中列出的动作指标。
- 审计日志 API 中能反查到 `training_session.start` 和 `training_result.submit`。
- evidence 中的 session/result/gameContent/motionMetrics/auditLogIds 与真实 API 数据一致。

失败处理：

- 缺 API、缺 Unity 专属患者/审计账号密码、Cookie/CSRF 登录失败、缺附件、缺训练记录、缺动作指标、缺审计日志或缺真实 Unity WebGL runtime 时，Unity 训练不能计为正式可交付。
- 不得把 mock、demo、seed、本地脚本样例、固定成绩、手工补写字段或非 Unity WebGL runtime 当作正式 Unity 证据。
- 只读实机验真只执行 `GET` 查询和本地文件读取；不得创建患者、创建训练 session、提交训练结果、补写动作指标、生成附件或补审计日志。

## 7. 交付前代码与契约检查

每次准备交付前执行：

```bash
pnpm test:delivery
pnpm delivery:check
pnpm --filter @rehab-platform/api exec tsc --noEmit --pretty false
pnpm --filter @rehab-platform/web exec tsc --noEmit --pretty false
pnpm --filter @rehab-platform/web lint
pnpm verify:contracts
```

`pnpm verify:contracts` 覆盖本地真实 API 契约，包括家属摘要脱敏、家属越权读取完整训练记录被拒、撤回摄像头/家属共享授权后的能力阻断、可疑训练结果复核、重复复核拒绝、脱敏导出和对应审计日志反查。该脚本不进行摄像头实采，也不能替代浏览器体感实机验真。

如涉及浏览器 UI 变更，还应使用真实浏览器完成关键页面人工验收：

- 患者：`今日 / 训练 / 记录 / 我的`，评估下一步、训练准备、真实结果保存和无技术/演示文案。
- 医师：`患者 / 评估 / 计划 / 准备 / 复核`，评估风险持久化、训练准备创建、复核保存。
- 家属：`照护 / 进展 / 提醒 / 我的`，授权摘要、脱敏进展、刷新后仍不展示原始指标。
- 管理员：`账号 / 内容 / 配置 / 审计`，权限门控、reason-required 导出、导出审计日志。

## 7.1 2026-06-11 Unit 8 历史全量回归记录

运行时间：`2026-06-11 17:53:48 CST`

本节仅保留 2026-06-11 当时的执行证据，不代表当前产物状态，也不得作为当前回归全绿、Unity WebGL 可交付或部署就绪的依据。当前结论见 7.3 节。

| Unit   | Step               | Command                                                                                                                                                                                                                                                                      | ExitCode | Result  | ExactOutputSummary / Evidence                                                                                                                        | BlockerIfAny                                                                                                                                             |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit 8 | Infra              | `pnpm infra:up`                                                                                                                                                                                                                                                              | `0`      | PASS    | Postgres container running                                                                                                                           | -                                                                                                                                                        |
| Unit 8 | DB migrate         | `pnpm db:migrate`                                                                                                                                                                                                                                                            | `1`      | BLOCKED | Prisma loaded `localhost:55432`; failed with `Error: Schema engine error:`                                                                           | Prisma `migrate dev --name init` schema engine failure. `migrate status` below proves DB already up to date; do not mark migrate command passed.         |
| Unit 8 | DB status          | `pnpm --filter @rehab-platform/db exec prisma migrate status`                                                                                                                                                                                                                | `0`      | PASS    | `14 migrations found`; `Database schema is up to date!`                                                                                              | -                                                                                                                                                        |
| Unit 8 | DB seed            | `pnpm db:seed`                                                                                                                                                                                                                                                               | `0`      | PASS    | `Seed completed. Local initialization accounts are ready.`                                                                                           | -                                                                                                                                                        |
| Unit 8 | Source delivery    | `node --test scripts/__tests__/*.test.mjs`                                                                                                                                                                                                                                   | `0`      | PASS    | `452` tests, `0` failures                                                                                                                            | -                                                                                                                                                        |
| Unit 8 | Web unit           | `pnpm --filter @rehab-platform/web exec tsx --test 'src/lib/*.test.ts' 'src/features/patient/*.test.ts' 'src/features/doctor/*.test.ts' 'src/features/doctor/*.test.tsx' 'src/features/caregiver/*.test.ts' 'src/features/admin/*.test.ts' 'src/features/session/*.test.ts'` | `0`      | PASS    | `160` tests, `0` failures                                                                                                                            | -                                                                                                                                                        |
| Unit 8 | Web lint           | `pnpm --filter @rehab-platform/web lint`                                                                                                                                                                                                                                     | `0`      | PASS    | ESLint exit `0`                                                                                                                                      | -                                                                                                                                                        |
| Unit 8 | Web typecheck      | `pnpm --filter @rehab-platform/web exec tsc --noEmit`                                                                                                                                                                                                                        | `0`      | PASS    | TypeScript exit `0`                                                                                                                                  | -                                                                                                                                                        |
| Unit 8 | API unit           | `pnpm --filter @rehab-platform/api exec jest --runInBand`                                                                                                                                                                                                                    | `0`      | PASS    | `4` suites, `249` tests passed                                                                                                                       | Watchman printed a local permission warning only; Jest passed.                                                                                           |
| Unit 8 | API e2e            | `pnpm --filter @rehab-platform/api exec jest --config ./test/jest-e2e.json --runInBand --watchman=false`                                                                                                                                                                     | `0`      | PASS    | `1` suite, `4` tests passed                                                                                                                          | Initial `pnpm --filter @rehab-platform/api test:e2e` was blocked by Watchman state-file permission; rerun disabled Watchman only, not business behavior. |
| Unit 8 | DB validate        | `pnpm --filter @rehab-platform/db exec prisma validate`                                                                                                                                                                                                                      | `0`      | PASS    | `The schema at prisma/schema.prisma is valid`                                                                                                        | -                                                                                                                                                        |
| Unit 8 | Local contracts    | `pnpm verify:contracts`                                                                                                                                                                                                                                                      | `0`      | PASS    | Real local API/DB contract chain passed and cleaned temporary data                                                                                   | First run failed because API was not running on `localhost:4000`; rerun after starting real API passed.                                                  |
| Unit 8 | Unity source       | `pnpm verify:unity-rhythm-reach-source`                                                                                                                                                                                                                                      | `0`      | PASS    | `Unity Rhythm Reach source verification passed.`                                                                                                     | -                                                                                                                                                        |
| Unit 8 | Unity WebGL build  | `pnpm verify:unity-rhythm-reach-webgl-build`                                                                                                                                                                                                                                 | `0`      | PASS    | `Unity Rhythm Reach WebGL build verification passed.`                                                                                                | -                                                                                                                                                        |
| Unit 8 | Delivery check     | `pnpm delivery:check`                                                                                                                                                                                                                                                        | `0`      | PASS    | `交付前检查通过。`                                                                                                                                   | -                                                                                                                                                        |
| Unit 8 | Browser regression | `pnpm test:playwright`                                                                                                                                                                                                                                                       | `0`      | PASS    | `35 passed (2.8m)`; `output/playwright/test-results/.last-run.json` status `passed`; `96` screenshots under `output/playwright/web-regression-*.png` | First sandbox run was blocked by local service startup/port permissions; authorized rerun used real local API/Web and passed.                            |

Formal verifier blockers recorded during Unit 8:

| Command                                            | ExitCode | Blocker                                                                                                                                           |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify:formal-acceptance-chain`              | `1`      | Missing formal business-chain config JSON path with real HTTPS API, role tokens and same-chain IDs.                                               |
| `pnpm verify:multi-condition-data-capture`         | `1`      | Missing multi-condition evidence JSON path or `MULTI_CONDITION_CAPTURE_EVIDENCE_FILE`.                                                            |
| `pnpm verify:browser-pose-evidence`                | `1`      | Missing Browser Pose field evidence JSON path or `BROWSER_POSE_EVIDENCE_FILE`.                                                                    |
| `pnpm verify:browser-pose-field-acceptance`        | `1`      | Missing Browser Pose evidence JSON path; also requires formal API plus explicit Browser patient/audit account and password environment variables. |
| `pnpm verify:unity-field-evidence`                 | `1`      | Missing Unity field evidence JSON path or `UNITY_FIELD_EVIDENCE_FILE`.                                                                            |
| `pnpm verify:unity-field-acceptance`               | `1`      | Missing Unity evidence JSON path; also requires formal API plus explicit Unity patient/audit account and password environment variables.          |
| `pnpm verify:speech-transcript-evidence`           | `1`      | Missing speech transcript evidence JSON path or `SPEECH_TRANSCRIPT_EVIDENCE_FILE`.                                                                |
| `pnpm verify:speech-transcript-acceptance`         | `1`      | Missing speech transcript acceptance config JSON path or `SPEECH_TRANSCRIPT_ACCEPTANCE_CONFIG`.                                                   |
| `pnpm verify:ai-assessment-acceptance`             | `1`      | Missing AI assessment acceptance config JSON path or `AI_ASSESSMENT_ACCEPTANCE_CONFIG`.                                                           |
| `pnpm verify:speech-ai-assessment-acceptance`      | `1`      | Missing speech + AI assessment acceptance config JSON path or `SPEECH_AI_ASSESSMENT_ACCEPTANCE_CONFIG`.                                           |
| `pnpm verify:tts-speech-output-evidence`           | `1`      | Missing TTS speech output evidence JSON path or `TTS_SPEECH_OUTPUT_EVIDENCE_FILE`.                                                                |
| `pnpm verify:tts-speech-output-acceptance`         | `1`      | Missing TTS speech output acceptance config JSON path or `TTS_SPEECH_OUTPUT_ACCEPTANCE_CONFIG`.                                                   |
| `pnpm verify:customer-acceptance-package-manifest` | `1`      | Missing customer acceptance package manifest JSON path and `--package-root`.                                                                      |

No-fallback statement：本次 Unit 8 回归未新增 fallback、mock、demo、fake readiness、fake result、fake success、silent downgrade 或 `page.route(...fulfill)`；任何缺客户正式配置、缺现场设备、缺证据 JSON、缺 field acceptance 各角色账号密码或服务不可用的情况均记录为 blocker，并继续执行其它独立真实检查。

Unit 8 review gate follow-up（2026-06-11）：evidence-doc reviewer 与 code-quality reviewer 均无 Critical/Important findings。Minor 已关闭：浏览器截图证据扩展为具体角色路径；患者训练任务 purpose badge 的显示条件已改为 `purposes.length || tags.length` 并用 `patient-training-task-library` RED/GREEN 覆盖。

Unit 9 pre-review privacy fix（2026-06-11）：业务流复核发现家属 summary API 虽然 UI 脱敏，但客户端 payload 仍包含训练 session、plan item、result 内部 ID。已按 TDD 修复为家属 summary 不序列化这些内部链路 ID；正式 Playwright 链路改为证明家属 reload 后可见脱敏训练进展，并断言 response JSON 不包含 planItemId、trainingSessionId、trainingResultId。后续 completion audit 又发现 `currentPlan.items[].id` 仍会向家属 summary 客户端暴露 plan-item 内部 ID；已用 RED/GREEN 修复为 caregiver plan item 只保留 `sequence / durationMinutes / frequencyPerWeek / difficulty / gameContent` 等业务字段。该修复不新增 fallback/mock/demo，也不把家属端作为同链 ID 读取入口。

## 7.2 2026-06-11 Unit 9 历史手工产品 Smoke 记录

运行时间：`2026-06-11 19:13 CST`

本轮手工 smoke 使用本地真实 Web/API：`http://localhost:3000`、`http://localhost:4000`。操作通过浏览器真实登录、点击、刷新和表单提交完成；未使用 `page.route(...fulfill)`、localStorage 状态注入、固定成绩、mock、demo、fallback 或 silent downgrade。

Evidence files:

- 结构化记录：`output/manual-smoke/unit9-manual-smoke-evidence.json`
- 医师准备页截图：`output/manual-smoke/unit9-doctor-preparation.png`
- 家属进展页截图：`output/manual-smoke/unit9-caregiver-progress.png`
- 管理员导出审计页截图：`output/manual-smoke/unit9-admin-audit-export.png`

| Role                       | Account                  | Scope                                          | Result                 | Evidence / Blocker                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------ | ---------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Patient                    | `patient001`             | `今日 / 训练 / 记录 / 我的`                    | PASS with real blocker | Verified one next task, preparation flow, saved records, profile/authorization and no patient technical/demo copy. Unity movement training start was blocked by real camera/posture readiness (`请先完成摄像头设备检测，再开始训练。`); no fake camera or fixed result was used. Real result persistence remains covered by the formal same-ID cognitive UI chain. |
| Doctor                     | `doctor001`              | `患者 / 评估 / 计划 / 准备 / 复核`             | PASS                   | Verified persisted doctor-confirmed risk, current plan, visible preparation record and review queue. Follow-up RED/GREEN removed raw backend preparation names from doctor-visible preparation copy.                                                                                                                                                               |
| Caregiver                  | `caregiver001`           | `照护 / 进展 / 提醒 / 我的`                    | PASS                   | Verified reload-stable authorized summary, desensitized patient name `李*`, refreshed progress, and no raw internal IDs or technical copy.                                                                                                                                                                                                                         |
| Caregiver no authorization | `unit9_unbound_76141349` | Login after real admin-created unbound account | PASS                   | Created through admin UI without patient binding; login was blocked before any family workspace with `账号未绑定可用角色`, so no cached patient progress was shown.                                                                                                                                                                                                |
| Admin                      | `admin`                  | `账号 / 内容 / 配置 / 审计`                    | PASS                   | Verified four governance entries, reason-required export button disabled until reason was filled, real desensitized CSV export success, and UI audit query for `脱敏数据导出 / 数据导出 / 成功`. Visible export/audit text did not include raw patient/caregiver phones.                                                                                           |

历史 Unit 9 completion audit（2026-06-11 19:38 CST）：final verification matrix was rerun after the caregiver plan-item privacy fix. 下表仅记录当时结果，不代表 2026-07-17 当前回归状态。

| Command                                                                                                                                                                                                                         | ExitCode | Result  | Evidence / Blocker                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------- |
| `pnpm infra:up`                                                                                                                                                                                                                 | `0`      | PASS    | Postgres container running.                                                        |
| `pnpm db:migrate`                                                                                                                                                                                                               | `1`      | BLOCKED | Same Prisma `Schema engine error`; do not mark as passed.                          |
| `pnpm db:seed`                                                                                                                                                                                                                  | `0`      | PASS    | `Seed completed. Local initialization accounts are ready.`                         |
| `node --test scripts/__tests__/*.test.mjs`                                                                                                                                                                                      | `0`      | PASS    | `453` tests, `0` failures.                                                         |
| `pnpm --filter @rehab-platform/web exec tsx --test src/lib/*.test.ts src/features/patient/*.test.ts src/features/doctor/*.test.ts src/features/caregiver/*.test.ts src/features/admin/*.test.ts src/features/session/*.test.ts` | `0`      | PASS    | `159` tests, `0` failures; existing Node module-type performance warning only.     |
| `pnpm --filter @rehab-platform/web lint`                                                                                                                                                                                        | `0`      | PASS    | ESLint exit `0`.                                                                   |
| `pnpm --filter @rehab-platform/web exec tsc --noEmit`                                                                                                                                                                           | `0`      | PASS    | TypeScript exit `0`.                                                               |
| `pnpm --filter @rehab-platform/api exec jest --runInBand --watchman=false`                                                                                                                                                      | `0`      | PASS    | `4` suites, `249` tests passed.                                                    |
| `pnpm --filter @rehab-platform/api exec tsc --noEmit --pretty false`                                                                                                                                                            | `0`      | PASS    | API TypeScript exit `0`.                                                           |
| `pnpm --filter @rehab-platform/db exec prisma validate`                                                                                                                                                                         | `0`      | PASS    | Prisma schema valid.                                                               |
| `pnpm verify:contracts`                                                                                                                                                                                                         | `0`      | PASS    | Real local API/DB contract chain passed and cleaned temporary data.                |
| `pnpm delivery:check`                                                                                                                                                                                                           | `0`      | PASS    | `交付前检查通过。`                                                                 |
| `pnpm exec playwright test --config scripts/playwright-regression.config.mjs scripts/formal-ui-business-chain.spec.mjs --project=chromium-1280`                                                                                 | `0`      | PASS    | Focused formal chain passed after same-result timestamp and caregiver privacy fix. |
| `pnpm test:playwright`                                                                                                                                                                                                          | `0`      | PASS    | `35 passed (3.3m)` across five viewport projects.                                  |

Formal customer/site verifier blockers after Unit 9 audit remain the same missing-input blockers: formal acceptance config JSON, multi-condition evidence JSON, Browser Pose evidence JSON, Unity evidence JSON, speech/TTS evidence/config JSONs, AI acceptance config JSON, and customer acceptance package manifest plus `--package-root`.

No-fallback statement：Unit 9 completion audit did not add fallback、mock、demo、fake readiness、fake result、fake success、silent downgrade or `page.route(...fulfill)`. Missing customer configs, field evidence, device materials and explicit per-role Cookie-session credentials remain blockers instead of being bypassed.

## 7.3 2026-07-17 当前完整回归与生产模式 Playwright 复验

当前完整回归的权威日志为 `tmp/regression-full-20260717-unity-rebuild.log`。`pnpm regression:full` 已完成第 29/29 个门禁，`29/29` 全部通过；测试合计 `2257/2257`，`0 failed`、`0 skipped`，顶层命令 exit code 为 `0`。生产模式 Playwright 另有专项日志 `tmp/playwright-post-visual-20260717.log`，用于补充截图和视觉修复证据。本地完整回归全绿仍不能替代真实 Unity runtime、Bridge 回传、训练入库、审计现场验收、客户资料和生产配置，因此不能据此声明 Unity WebGL 已正式交付或平台已可正式部署。

| Scope                 | Current result | Evidence / limitation                                                                                                               |
| --------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Automated tests       | PASS           | 当前完整回归为 `2257/2257`，`0 failed`、`0 skipped`                                                                                 |
| Regression gates      | PASS           | 已完成第 `29/29` 个门禁，`29/29` 全部通过；顶层命令 exit code 为 `0`                                                                |
| PostgreSQL migrations | PASS           | 专用测试 PostgreSQL `127.0.0.1:32768` 中识别并执行 `22` 个迁移，状态为无 pending；本轮没有连接项目 `55432` 数据库                   |
| Playwright            | PASS           | 当前完整回归和生产模式专项复验均为五个 viewport project 各 `1` 个 account setup 和 `7` 个 business test，每项目 `8/8`，合计 `40/40` |
| Unity source          | PASS           | `Unity Rhythm Reach source verification passed.`                                                                                    |
| Unity WebGL build     | PASS           | 使用外接盘固定版本 Unity `6000.0.75f1` 正式重建；新产物包含 `rehab-unity-result-v2`，WebGL build verifier 通过                      |

当前生产模式 Playwright 已生成 managed 截图精确 `90/90` 张，五个 viewport 各 18 张，且为 90 个唯一 SHA-256。尺寸分别为 1280 `1280x800`、1366 `1366x768`、1440 `1440x900`、Pixel `1082x2202`、iPhone `1170x1992`。Pixel 与 iPhone 新联系表人工检查确认无 Next.js `N` 浮层，admin/doctor 导航完整按两列显示，页面均从顶部采集。`output/playwright/test-results/.last-run.json` 仍只记录最后一个 iPhone 子进程，不是五项目聚合证据；完整回归聚合结果以 `tmp/regression-full-20260717-unity-rebuild.log` 为准，截图和视觉专项证据以 `tmp/playwright-post-visual-20260717.log` 及当前产物为准。截图不能替代 Unity WebGL 真实运行证据。

正式客户交付和生产部署仍至少缺少以下输入与验收：

- 在目标浏览器和现场设备运行本轮已由 Unity `6000.0.75f1` 重建并通过二进制 verifier 的 WebGL 产物，补齐真实 runtime、Bridge 回传、训练结果、审计反查、截图/录屏和 evidence JSON 验收。
- 客户正式 Web/API 域名、HTTPS、服务器、机构与角色账号、生产 PostgreSQL、备份恢复、监控告警、密钥托管引用和上线责任人。
- 隐私协议、知情同意、授权撤回规则、数据留存周期、脱敏导出范围和审批责任链。
- 按 launch scope 提供 AI/STT/TTS 正式供应商配置、配额、真实音频、第三方数据处理授权、调用日志、医师人工复核和 TTS 播放证据。
- Unity、Browser Pose、多条件采集、正式业务闭环和客户现场 evidence package，以及对应只读账号、Cookie 会话和目标设备环境。
- 生产配置检查、客户现场验收和最终部署签署。

2026-07-17 本轮整改和回归未加入 retry、skip、fallback、mock、demo、兼容 OR、默认成功、伪结果或 silent downgrade；所有缺失条件均保持为明确 blocker。

## 8. 最终交付包

交付包至少包含：

- 当前 monorepo 源码、迁移、脚本和文档。
- 客户最终资料索取单 `docs/customer-final-input-request.md` 及客户回复记录。
- 客户资料到上线门禁执行记录，对应 `docs/customer-input-to-launch-gate-runbook.md`。
- 客户资料包 `customer-production-input.json` 及校验通过记录。
- 生产配置门禁执行记录。
- 空库真实闭环验收记录。
- 浏览器体感 evidence JSON、截图、录屏和只读实机验真记录。
- Unity WebGL evidence JSON、截图、录屏和只读现场验真记录。
- 如接入真实 AI/STT/TTS：供应商配置、调用日志、人工复核、TTS 播放证据和授权记录。
- 如接入 Unity：WebGL Build 文件、`manifest.json`、Bridge 回传日志、训练结果记录、训练记录 API 反查记录和审计日志 API 反查记录。
- 脱敏数据导出样例和导出审计日志。

不得纳入交付包：

- `.env`、`.env.local`、`.env.production`。
- `node_modules`、`.next`、`dist`、`coverage`、`infra/data`。
- 客户历史 demo 目录作为运行源码。
- 真实密钥明文、真实患者未脱敏附件、未经授权的第三方素材或 Unity 资源。

## 9. 客户最终需提供清单

可直接转发给客户的短版清单见 `docs/customer-final-input-request.md`，本节作为验收 runbook 内的完整核对口径。

- 服务器、域名、HTTPS、数据库、备份和监控负责人。
- 隐私协议正文、版本、生效日期、授权撤回规则和数据留存周期。
- 超级管理员、运营、审计、医师账号清单。
- 真实患者数据采集范围、试点患者来源、脱敏和导出审批规则。
- MiMo 大模型、音频理解/STT 与 TTS 客户账号，TTS 音色、输出格式和播放验收负责人。
- AI/STT/TTS 的费用、QPS、并发、额度窗口、失败计费/退款/重试规则、生产使用授权和超额计费确认。
- 正式 HTTPS endpoint、Secret File 与密钥托管引用、模型版本、提示词版本、调用日志留存、医师人工复核责任人和 TTS 播放验收材料。
- 浏览器体感验收设备、摄像头型号、目标浏览器、训练场地和现场验收负责人。
- 如客户已有 Unity 游戏：WebGL Build、`manifest.json`、素材/插件授权证明、Bridge 适配确认、现场验收 evidence、截图/录屏，以及 Unity 专属患者读取和审计读取账号密码；这些账号不得与 Browser Pose 共用。
