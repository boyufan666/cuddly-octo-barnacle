# 客户资料到上线门禁 Runbook

本文用于把客户回复的资料转成可执行的上线门禁。它衔接 `docs/customer-final-input-request.md`、`docs/templates/customer-production-input.template.json`、`docs/production-delivery-runbook.md` 和正式验收脚本，避免资料收齐后仍靠口头判断。

原则：资料缺失、证据缺失、配置不合规或验收失败时，结论必须是 `BLOCKED`。不得用 mock、demo、localhost、个人 token、临时代理、手工改字段、seed 数据或 fallback 作为替代。

## 1. 整理客户回复

收到客户资料后，先建立客户资料包工作副本：

```bash
cp docs/templates/customer-production-input.template.json customer-production-input.json
```

模板文件只展示字段结构，原样必须校验失败。不得把模板中的示例域名、说明文字、枚举提示或示例账号当成客户正式资料。

逐项把客户回复填入 `customer-production-input.json`：

- `project`：客户名称、验收负责人、目标日期、部署模式。
- `infrastructure`：正式 Web/API 域名、服务器方案、数据库/Redis 密钥引用、备份和监控负责人。
- `legal`：隐私协议版本、授权负责人、数据留存、第三方 AI 数据处理授权。
- `accounts`：超级管理员、运营、审计、医师账号清单。
- `dataCollection`：真实患者采集授权、患者来源、脱敏和导出审批负责人。
- `ai`：大模型供应商、账号负责人、免费额度确认、HTTPS endpoint、密钥引用、模型和提示词版本、调用日志、人工复核。
- `speech`：语音供应商、免费额度确认、HTTPS endpoint、密钥引用、模型版本、麦克风授权要求。
- `trainingContent`：浏览器体感实机 evidence 路径、目标浏览器、摄像头型号、Unity 是否为上线必需。
- `acceptanceEvidence`：角色截图、评估证据、训练证据、审计证据、脱敏导出、部署证据。

## 2. 客户资料包门禁

先执行资料包校验：

```bash
pnpm verify:customer-production-input -- customer-production-input.json
```

通过条件：

- 所有正式域名和 AI/语音 endpoint 均为 HTTPS。
- 数据库、Redis、AI、语音密钥均为 `secret-manager://...` 引用。
- AI/语音若 `requiredForLaunch=true`，必须具备供应商、账号负责人、模型版本、免费额度或费用确认、调用日志留存和医师人工复核。
- AI/语音若 `requiredForLaunch=false`，资料包可不填写供应商、endpoint、密钥和第三方 AI 授权，但交付范围只能写“结构化评估录入和接口边界”，不能宣称真实 AI/语音能力。
- 浏览器体感必须提供实机 evidence 路径、目标浏览器和摄像头型号。
- 资料包中不得出现占位符、mock、demo、local、manual、fallback、明文密钥或本地地址。

失败处理：

- 退回客户补资料或改为“不声明该能力上线”。
- 不允许把 `requiredForLaunch` 改成 `false` 来绕过客户明确要求上线的真实能力；范围变更必须由客户或验收负责人确认，开发方不得为了通过门禁自行修改。
- 不允许把供应商临时试用、个人 token 或代理地址写成生产能力。

## 3. AI/语音 Go/No-Go

仅当客户要求真实 AI/语音上线时执行本节。免费优先选型口径见 `docs/ai-speech-provider-selection-free-first.md`。

Go 条件：

- 客户确认供应商账号主体、可用模型、免费额度或费用、有效期、QPS、并发、超额计费、是否允许试点或生产使用。
- 客户确认允许把健康数据、问答转写和评估摘要发送给该供应商。
- 客户提供正式 HTTPS endpoint，不是 localhost、mock、demo、临时代理或个人测试地址。
- 客户提供 `secret-manager://...` 密钥引用，不提供真实密钥明文。
- 客户提供模型版本、语音模型版本、提示词版本、调用日志留存天数。
- 客户指定医师人工复核负责人，且 `AI_HUMAN_REVIEW_REQUIRED=true`。
- 语音能力上线时，患者必须签署 `microphone_capture` 授权。

No-Go 条件：

- 只有“有免费额度”的口头描述，但没有控制台截图、额度说明、有效期或生产/试点授权。
- 只有 ChatGPT、个人控制台、个人 token、第三方不明代理或无法留存日志的服务。
- endpoint 非 HTTPS，或包含 mock/demo/local/manual/fallback 标记。
- 缺调用日志、模型版本、提示词版本或人工复核记录。

No-Go 时，只能交付结构化评估录入和 AI/语音接口边界，不能宣传真实 AI 自动评估或真实语音识别已完成。

## 4. 生产环境变量门禁

客户资料包通过后，由客户或运维在目标环境显式配置正式环境变量，再执行：

```bash
pnpm delivery:check:production -- --customer-input customer-production-input.json
```

必须显式配置基础项和上线范围项：

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `WEB_ORIGIN`
- `NEXT_PUBLIC_API_BASE_URL`
- `DEFAULT_PATIENT_PASSWORD`
- `AI_REQUIRED_FOR_LAUNCH`
- `SPEECH_REQUIRED_FOR_LAUNCH`

`AI_REQUIRED_FOR_LAUNCH` 和 `SPEECH_REQUIRED_FOR_LAUNCH` 必须与客户资料包中的 `ai.requiredForLaunch`、`speech.requiredForLaunch` 保持一致，只接受精确的 `true` 或 `false`。`false` 只表示该真实能力不在本次上线范围，不是失败后的兜底，也不能包装为真实 AI/语音结果。

当 `AI_REQUIRED_FOR_LAUNCH=true` 时，还必须配置：

- `AI_PROVIDER`
- `AI_MODEL_VERSION`
- `AI_MODEL_ENDPOINT`
- `AI_API_KEY_REF`
- `AI_PROMPT_VERSION`
- `AI_CALL_LOG_RETENTION_DAYS`
- `AI_HUMAN_REVIEW_REQUIRED`

当 `SPEECH_REQUIRED_FOR_LAUNCH=true` 时，还必须配置：

- `SPEECH_PROVIDER`
- `SPEECH_TO_TEXT_ENDPOINT`
- `SPEECH_API_KEY_REF`
- `SPEECH_MODEL_VERSION`

当对应 scope 为 `false` 时，不得残留该能力的半配置，例如 `AI_PROVIDER`、`AI_MODEL_ENDPOINT`、`SPEECH_PROVIDER` 或 `SPEECH_TO_TEXT_ENDPOINT`。否则应判定为阻断，避免把非上线范围配置误当作生产能力。

失败处理：

- 缺变量、占位符、localhost、HTTP、开发 JWT、固定本地密码、明文密钥或 mock/demo/local 标记时必须阻断。
- 不允许脚本自动替换默认值。
- 不允许把本地 `.env` 当成试点或生产配置。

## 5. 浏览器体感 Go/No-Go

至少一个正式训练内容必须完成实机验收。

Go 条件：

- 管理后台已发布正式 `browser_pose_game` 训练内容。
- 目标电脑、浏览器、摄像头、训练场地和网络环境已记录。
- 患者已签署摄像头授权。
- 现场完成摄像头授权、姿态识别、训练中反馈、训练结果入库和审计日志。
- evidence JSON、截图、录屏、训练记录 API 和审计日志 API 均保存。

执行验收：

```bash
pnpm verify:browser-pose-evidence -- <evidence-json-path>
pnpm verify:browser-pose-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com \
  --patient-token <training-record-read-token> \
  --audit-token <audit-read-token>
```

No-Go 条件：

- 缺摄像头授权、截图/录屏、动作指标、训练记录 API 或审计日志 API。
- 训练结果来源为 mock/demo，或成绩固定生成。
- 姿态质量不足、训练过短、异常反应时间未进入复核。

No-Go 时，不能宣称体感训练正式可交付。

## 6. Unity Go/No-Go

只有客户明确要求 Unity 作为一期上线范围时执行。

Go 条件：

- 客户提供 Unity WebGL Build 文件、`manifest.json`、版本号和授权证明。
- `manifest.json` 指向的 loader、data、framework、wasm、StreamingAssets 均存在并版本匹配。
- Unity 通过 `docs/unity/unity-webgl-bridge-protocol.md` 回传真实结构化结果。
- 训练 session、training result、motion metrics 和 audit log 均可反查。

No-Go 条件：

- 只有截图、视频或旧 demo，没有 WebGL Build 和授权证明。
- 无法通过 Bridge 回传结构化训练指标。
- 资源缺失、版本不匹配或无法通过 HTTPS 加载。

No-Go 时，只能说明 Unity 接入通道已预留，不能宣称已有正式 Unity 游戏库。

## 7. 空库闭环与最终验收

在试点或准生产环境中，用 `pnpm db:seed:trial` 初始化角色、机构、首个管理员和首个医师，不创建患者、评估、计划或训练数据。

然后执行：

```bash
pnpm verify:trial-empty-loop
```

最终交付前至少保留：

- `customer-production-input.json` 及校验通过记录。
- `pnpm delivery:check:production -- --customer-input customer-production-input.json` 通过记录。
- 空库闭环验收记录。
- 浏览器体感 evidence JSON、截图、录屏和只读实机验真记录。
- 如接入 AI/语音：供应商控制台截图、调用日志、模型版本、提示词版本、人工复核记录和授权记录。
- 如接入 Unity：WebGL Build、manifest、授权证明、Bridge 回传日志和训练结果记录。
- 脱敏导出样例和导出审计日志。

任一材料缺失时，最终结论为 `BLOCKED`，不得以演示数据、口头说明或脚本构造结果替代。
