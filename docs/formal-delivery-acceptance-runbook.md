# 正式交付总验收 Runbook

本文用于把客户资料、生产配置、真实数据闭环、AI/语音证据、体感训练实机验收和最终交付包串成一个可执行流程。任何步骤缺资料、缺证据或校验失败，都应判定为 `BLOCKED`，不得用 seed、mock、demo、固定结果、手工改字段或 fallback 替代。

## 0. 验收原则

- 所有验收以真实 API、真实数据库、真实浏览器、真实权限和真实审计日志为准。
- 本地 seed 数据、静态原型图、截图样例和旧客户 demo 只能作为参考，不能作为正式验收通过依据。
- 客户若要求真实 AI/语音能力，必须提供供应商账号、正式 HTTPS endpoint、`secret-manager://...` 密钥引用、模型/语音调用日志和医师人工复核证据。
- 客户若希望优先免费大模型，应优先评估客户已有星火账号或供应商免费额度；免费额度必须确认生产/试点可用、有效期、QPS、并发和超额费用，不能使用个人临时 token 作为生产能力。
- 浏览器体感训练必须有摄像头实采、动作指标入库、训练记录 API 和审计日志 API 证据。

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
- 数据库、Redis、AI、语音密钥均为 `secret-manager://...` 引用。
- 隐私协议、授权责任人、数据留存、脱敏导出责任人已填写。
- AI/语音若声明上线，已填写供应商、账号负责人、免费额度或费用确认、模型版本、endpoint、调用日志、人工复核。
- AI/语音若不在本次上线范围，`requiredForLaunch` 必须由客户或验收负责人确认后设为 `false`，且不能宣传真实 AI/语音能力。
- 浏览器体感已提供实机 evidence 路径、目标浏览器和摄像头型号。

失败处理：

- 缺任何字段，先退回客户补资料。
- 出现 `<...>`、`mock`、`demo`、`local`、`manual`、`fallback`、明文 key、HTTP、本地地址，必须阻断。
- 此命令只验证客户材料完整性，不替代生产环境变量检查、真实 AI/语音调用验收或体感实机验真。

## 2. 生产配置门禁

在目标环境变量已由客户或运维显式配置后执行：

```bash
pnpm delivery:check:production -- --customer-input customer-production-input.json
```

通过条件：

- `DATABASE_URL`、`REDIS_URL`、`JWT_SECRET`、`WEB_ORIGIN`、`NEXT_PUBLIC_API_BASE_URL`、`DEFAULT_PATIENT_PASSWORD` 均为正式配置。
- 必须显式声明 `AI_REQUIRED_FOR_LAUNCH` 和 `SPEECH_REQUIRED_FOR_LAUNCH`，且与客户资料包的 `requiredForLaunch` 一致。
- 当 `AI_REQUIRED_FOR_LAUNCH=true` 时，AI 生产配置齐全：`AI_PROVIDER`、`AI_MODEL_VERSION`、`AI_MODEL_ENDPOINT`、`AI_API_KEY_REF`、`AI_PROMPT_VERSION`、`AI_CALL_LOG_RETENTION_DAYS`、`AI_HUMAN_REVIEW_REQUIRED`。
- 当 `SPEECH_REQUIRED_FOR_LAUNCH=true` 时，语音生产配置齐全：`SPEECH_PROVIDER`、`SPEECH_TO_TEXT_ENDPOINT`、`SPEECH_API_KEY_REF`、`SPEECH_MODEL_VERSION`。
- 对应 scope 为 `false` 时，不得保留半配置，也不能把结构化录入和接口边界包装为真实 AI/语音能力。
- endpoint 必须为 HTTPS；密钥必须为引用；日志留存 30 到 3650 天；AI 人工复核必须为 `true`。

失败处理：

- 不允许脚本自动替换默认值。
- 不允许把本地 `.env`、固定密码、localhost、HTTP、开发 JWT 或 demo 配置带入试点/生产。

## 3. 空库真实闭环验收

试点或准生产环境应先用 `pnpm db:seed:trial` 初始化角色、机构、平台管理员和首个医师，不创建患者、评估、计划或训练数据。

然后准备真实环境变量并执行：

```bash
pnpm verify:trial-empty-loop
```

通过条件：

- trial 管理员和医师能登录。
- 管理员通过正式 API 创建患者。
- 患者签署当前版本隐私、评估数据处理和摄像头授权。
- 医师录入结构化 MMSE/CDR 和评估摘要。
- 管理员发布正式 `browser_pose_game` 训练内容。
- 医师生成并确认康复方案。
- 患者开始训练并提交结构化训练结果和四项动作指标。
- 医师能查询训练记录和动作指标。

边界：

- 该脚本不调用真实 AI/语音，不产生生产 AI/语音调用日志。
- 该脚本不替代浏览器摄像头实机验收。

## 4. AI/语音真实能力验收

仅当客户声明一期需要真实 AI/语音能力时执行本节。

如客户要求优先免费方案，供应商选型和免费额度核验口径见 `docs/ai-speech-provider-selection-free-first.md`。该文档不能替代本节验收证据，选型完成也不等于真实 AI/语音上线通过。

后端入库要求：

- 大模型评估必须使用 `production_ai_assessment` 来源。
- 语音评估必须使用 `speech_ai_assessment` 来源，并要求患者已签署 `microphone_capture`。
- `rawInputSummary.evidence` 必须包含供应商、模型、模型版本、调用 ID、正式 HTTPS endpoint、提示词版本、调用时间、人工复核记录。
- 人工复核结论必须为 `approved` 才允许创建评估记录、风险评级和 AI 分析记录。

客户必须提供的证据：

- 供应商控制台配置截图或清单。
- 密钥托管引用清单，不包含真实密钥明文。
- 至少一条脱敏调用日志样例，包含调用 ID、调用时间、模型版本、提示词版本、错误码或成功状态、关联评估记录。
- 医师人工复核记录，包含复核人、复核时间、结论和关联评估。
- 语音能力还需语音识别调用日志和 `microphone_capture` 授权记录。

失败处理：

- 缺供应商证据、调用日志、人工复核或麦克风授权时，不能按真实 AI/语音验收通过。
- 不允许把结构化录入、手工摘要、seed 数据或脚本结果包装成真实 AI/语音结果。

## 5. 浏览器体感实机验收

现场完成浏览器体感训练后，先保存 evidence JSON、截图和录屏，然后执行：

```bash
pnpm verify:browser-pose-evidence -- <evidence-json-path>
```

再执行只读实机验真：

```bash
pnpm verify:browser-pose-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com \
  --patient-token <training-record-read-token> \
  --audit-token <audit-read-token>
```

通过条件：

- evidence JSON 字段完整，无占位符。
- 截图和录屏文件存在且非空。
- API 中能反查到训练 session、训练结果、游戏内容和四项动作指标。
- 审计日志 API 中能反查到 `training_session.start` 和 `training_result.submit`。
- evidence 中的 session/result/gameContent/motionMetrics/auditLogIds 与真实 API 数据一致。

失败处理：

- 缺 API、缺 token、缺附件、缺训练记录、缺动作指标、缺审计日志时，浏览器体感训练不能计为正式可交付。
- 姿态质量不足、训练时长过短、异常反应时间等应按后台复核流程处理，不得改造成正常训练结果。

## 6. 交付前代码与契约检查

每次准备交付前执行：

```bash
pnpm test:delivery
pnpm delivery:check
pnpm --filter @rehab-platform/api exec tsc --noEmit --pretty false
pnpm --filter @rehab-platform/web exec tsc --noEmit --pretty false
pnpm --filter @rehab-platform/web lint
pnpm verify:contracts
```

如涉及浏览器 UI 变更，还应使用真实浏览器完成关键页面人工验收：

- 患者：建档授权、结构化评估、今日训练、训练结果。
- 家属：授权摘要、提醒、隐私边界。
- 医师：负责患者、方案调整、训练结果回看。
- 管理员：训练内容、脱敏导出、审计日志。

## 7. 最终交付包

交付包至少包含：

- 当前 monorepo 源码、迁移、脚本和文档。
- 客户最终资料索取单 `docs/customer-final-input-request.md` 及客户回复记录。
- 客户资料到上线门禁执行记录，对应 `docs/customer-input-to-launch-gate-runbook.md`。
- 客户资料包 `customer-production-input.json` 及校验通过记录。
- 生产配置门禁执行记录。
- 空库真实闭环验收记录。
- 浏览器体感 evidence JSON、截图、录屏和只读实机验真记录。
- 如接入真实 AI/语音：供应商配置、调用日志、人工复核和授权记录。
- 如接入 Unity：WebGL Build 文件、`manifest.json`、Bridge 回传日志和训练结果记录。
- 脱敏数据导出样例和导出审计日志。

不得纳入交付包：

- `.env`、`.env.local`、`.env.production`。
- `node_modules`、`.next`、`dist`、`coverage`、`infra/data`。
- 客户历史 demo 目录作为运行源码。
- 真实密钥明文、真实患者未脱敏附件、未经授权的第三方素材或 Unity 资源。

## 8. 客户最终需提供清单

可直接转发给客户的短版清单见 `docs/customer-final-input-request.md`，本节作为验收 runbook 内的完整核对口径。

- 服务器、域名、HTTPS、数据库、Redis、备份和监控负责人。
- 隐私协议正文、版本、生效日期、授权撤回规则和数据留存周期。
- 超级管理员、运营、审计、医师账号清单。
- 真实患者数据采集范围、试点患者来源、脱敏和导出审批规则。
- 若客户确认本次上线真实 AI/语音能力，需提供大模型供应商账号；优先客户已有星火，或确认可用免费额度的通义千问、智谱、DeepSeek、Moonshot、OpenAI 等供应商。
- 若客户确认本次上线真实语音能力，需提供语音识别供应商账号；优先客户已有星火/讯飞语音能力或可用免费额度。
- 若客户确认本次上线真实 AI/语音能力，需提供 AI/语音费用、免费额度、QPS、并发、有效期、生产使用授权和超额计费确认。
- AI/语音免费优先选型依据：可参考 `docs/ai-speech-provider-selection-free-first.md` 填写，但最终仍以客户账号控制台、正式合同或供应商官网当前页面为准。
- 若客户确认本次上线真实 AI/语音能力，需提供正式 HTTPS endpoint、密钥托管引用、模型版本、提示词版本、调用日志留存和医师人工复核责任人。
- 浏览器体感验收设备、摄像头型号、目标浏览器、训练场地和现场验收负责人。
- 如客户已有 Unity 游戏：WebGL Build、`manifest.json`、素材/插件授权证明和 Bridge 适配确认。
