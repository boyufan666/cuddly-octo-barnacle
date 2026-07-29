# MiMo AI 评估与人工复核接入说明

更新时间：2026-07-22

## 生产能力与不可替代边界

平台通过 `POST /ai/assessment-drafts` 使用 `xiaomi-mimo` 生成结构化评估草稿；它不创建正式评估、风险评级或 AI 分析记录。只有具备临床权限的医师审阅真实资料并以 `approved` 确认后，`POST /assessments` 才能写入正式临床记录。

本期生产环境必须同时启用 MiMo AI、音频理解转写和 TTS，且使用同一经批准的 MiMo 账号、host allowlist、Secret File、Key Value 配额和最小化 telemetry 规则。不存在“关闭 AI 后继续以规则/模板结果运行”的生产模式；所有 MiMo 失败都必须显式失败，不得以任何其他模型、手工推断、固定分数、mock、demo 或 fallback 代替。

## 前置真实业务条件

在请求 AI 草稿前，必须已经具备：

- 真实患者身份、机构归属和当前有效的 `privacy_policy` 与 `ai_processing` 同意。
- 医师提供或确认的真实临床输入，包括 MMSE、CDR、认知维度分数、病程/访谈摘要和风险判断所需资料。
- 客户批准的 MiMo 第三方数据处理、模型版本、提示词版本、计费/配额规则、医生复核责任人和留存策略。

若输入来自录音，还必须先通过 `POST /ai/assessment-speech-transcripts`，并具有 `microphone_capture` 同意、真实录音、有效 MiMo 音频理解转写和人工检查。转写草稿绝不能绕过人工检查或直接成为正式评估。

## 受控生产配置

生产启动要求以下核心配置精确匹配：

```text
AI_REQUIRED_FOR_LAUNCH=true
SPEECH_REQUIRED_FOR_LAUNCH=true
TTS_REQUIRED_FOR_LAUNCH=true
AI_HUMAN_REVIEW_REQUIRED=true
AI_PROVIDER=xiaomi-mimo
AI_MODEL_ENDPOINT=https://<approved-mimo-host>/...
AI_MODEL_VERSION=<customer-approved-mimo-model>
AI_PROMPT_VERSION=<approved-prompt-version>
MIMO_API_KEY_REF=secret-manager://...
MIMO_API_KEY_FILE=/etc/secrets/mimo_api_key
MIMO_ALLOWED_HOSTS=<approved-hosts>
MIMO_KEY_VALUE_URL=<Render-private-key-value-url>
```

Provider 的超时/响应上限、请求/预算/音频秒数/TTS 字符数限额和 telemetry 留存期均需提供明确正整数并经客户批准。原始 key、原始临床文本、完整转写、模型提示词、响应正文、音频和 Base64 不得进入仓库、前端、日志、审计 metadata 或验收包。

## 前端与医生流程

1. 医师录入并核对真实临床资料，确认患者同意仍有效。
2. 平台调用 `POST /ai/assessment-drafts` 获取结构化草稿及最小化调用证据。
3. 医师逐项复核 MMSE、CDR、认知维度、摘要、置信度和风险建议；不接受自动提交。
4. 医师确认后调用 `POST /assessments`，创建正式评估、风险评级和分析记录。
5. 审计人员按权限反查授权、AI 草稿、人工确认和正式入库的关联审计记录。

## 真实验收与阻断条件

在客户授权的 Staging 环境执行：

```bash
pnpm verify:ai-assessment-acceptance -- <ai-config.json>
pnpm verify:speech-ai-assessment-acceptance -- <speech-ai-config.json>
```

验收必须证明 AI 草稿未自动入库、医生确认者与责任人一致、正式评估包含真实临床数据和风险记录，并能反查同意、受控 MiMo 调用与审计日志。缺真实同意、临床资料、医师确认、MiMo 配置、配额批准、调用证据或审计记录时必须失败，不能用 seed、样例、手工补写或模拟结果补齐。

完整配置与 Render 发布顺序见 `docs/github-render-mimo-production-deployment-plan.md`。
