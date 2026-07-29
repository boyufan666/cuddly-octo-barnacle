# AI 评估正式验收 Runbook

本文用于证明真实大模型只生成待医生复核的评估草稿，正式评估记录、风险评级和 AI 分析记录只能在医生人工复核 `approved` 后创建。

## 验收边界

- `pnpm verify:ai-assessment-acceptance` 会通过平台 API 调用 `POST /ai/assessment-drafts` 和 `POST /assessments`。
- 本脚本证明“文本/转写输入 -> AI 草稿 -> 医生复核 -> `production_ai_assessment` 入库”链路；若客户验收“真实语音输入 + AI 评估 + `speech_ai_assessment` 入库”组合能力，还必须执行 `pnpm verify:speech-ai-assessment-acceptance -- <config-json-path>`。
- 脚本不直接读取或调用供应商密钥，不补写审计日志，不把失败转成成功。
- AI 草稿阶段不得创建 `assessment_record`、`risk_grade_record` 或 `ai_analysis_record`。
- 正式入库必须带供应商、模型、HTTPS endpoint、调用 ID、提示词版本、调用时间和医生人工复核 `approved` 记录。
- `humanReview.reviewerUserId` 必须等于医师 Cookie 会话通过 `GET /me` 返回的当前用户 ID，不能在配置中手工填写他人作为复核人。
- 缺 HTTPS API、缺医师账号/密码、缺审计账号/密码、缺 `privacy_policy` 或 `ai_processing` 授权、缺 AI 供应商调用证据、缺人工复核批准、缺风险/AI 分析/审计记录时必须失败。
- 脚本为医师和审计角色分别创建独立 Cookie 会话；不接受旧 `doctorToken`、`auditToken` 或 `accessToken` 代替账号密码，也不发送 `Authorization`/Bearer。
- 每个角色都必须使用独立 `CookieSessionClient` 和独立 cookie jar，先分别完成 `GET /auth/csrf` 和 `POST /auth/login`。业务账号与审计账号相同时会在任何语音文件读取或网络请求前失败；登录以及 Cookie/CSRF 校验错误会立即失败，不重试、不切换认证方式。
- 不得把 mock、demo、seed、fallback、fixed、manual、synthetic 结果或手工摘要包装成真实 AI 自动评估。

## 前置条件

1. 客户确认全量 `AI_REQUIRED_FOR_LAUNCH=true`、`SPEECH_REQUIRED_FOR_LAUNCH=true`、`TTS_REQUIRED_FOR_LAUNCH=true`，并已通过 `pnpm delivery:check:production`。
2. 后端已配置 `AI_PROVIDER=xiaomi-mimo`、正式 HTTPS `AI_MODEL_ENDPOINT`、模型/提示词/请求限制、`MIMO_API_KEY_REF`、`MIMO_API_KEY_FILE=/etc/secrets/mimo_api_key`、approved MiMo hosts、Key Value 配额和 `AI_HUMAN_REVIEW_REQUIRED=true`。生产原始 provider key 变量不得存在。
3. 患者已签署 `privacy_policy` 和 `ai_processing`，且授权未撤回。
4. 准备一个具备患者完整业务权限和 AI 草稿/正式评估提交权限的医师账号；该账号对应用户必须就是 `humanReview.reviewerUserId`。
5. 准备一个具备 `audit.read` 权限的审计账号。
6. 准备一段真实 MMSE/CDR 转写或临床摘要，不使用模板、seed 文本或固定演示结论。

## 配置 JSON

创建仅本机验收人员可读的临时 JSON 文件。`apiBaseUrl` 必须是 API 的 HTTPS origin（例如 `https://api.rehab.example.com`），不要附加 `/api` 路径。所有 `<...>` 必须替换为现场真实值：

```json
{
  "apiBaseUrl": "https://api.rehab.example.com",
  "doctorAccount": "<具备患者完整业务权限的医师账号>",
  "doctorPassword": "<医师密码>",
  "auditAccount": "<具备 audit.read 权限的账号>",
  "auditPassword": "<审计账号密码>",
  "patientId": "<真实患者 ID>",
  "assessmentType": "MMSE/CDR",
  "transcript": "真实评估问答转写或临床摘要",
  "humanReview": {
    "reviewerUserId": "<医生用户 ID>",
    "reviewedAt": "2026-05-27T10:15:00.000Z",
    "conclusion": "approved",
    "notes": "医生复核评分、摘要和风险等级后批准入库"
  }
}
```

不要把配置文件提交到版本库；验收完成后由现场人员删除。脚本不会缓存密码、保存登录响应中的 `accessToken`，也不会生成默认凭据。

## 验收命令

```bash
pnpm verify:ai-assessment-acceptance -- <config-json-path>
```

也可以使用环境变量：

```bash
AI_ASSESSMENT_ACCEPTANCE_CONFIG=<config-json-path> \
pnpm verify:ai-assessment-acceptance
```

## 脚本会验证什么

- `apiBaseUrl` 必须是正式 HTTPS，且不能包含 `mock/demo/seed/fallback/fixed/manual/synthetic` 标记。
- 医师和审计账号的账号/密码必须显式提供，旧 token-only 配置会在任何网络请求前失败。
- 配置、业务响应、正式记录和每条审计候选必须递归满足 JSON plain object 契约：对象原型只能是 `Object.prototype`，own keys 只能是 enumerable string data keys；数组逐项检查。symbol、non-enumerable、accessor、custom/null prototype 或数组额外属性都会硬失败；`scoreSummary` own keys 必须精确等于六个评分字段。
- 危险值标签与 payload 之间允许一个或多个空白、冒号、等号、下划线、连字符或其组合；secret payload 最少为 8 个字符。正常 `token-plan endpoint` 文本和 endpoint hostname 不按 token 误拒。
- 两个角色分别通过 Cookie 会话登录；登录 POST、`POST /ai/assessment-drafts` 和 `POST /assessments` 自动携带 `rehab_csrf` cookie 与匹配的 `x-csrf-token`，所有请求都不得携带 `Authorization`。
- 医师会话登录后调用 `GET /me` 校验当前用户属于医师角色，且 `humanReview.reviewerUserId` 等于当前用户 ID。
- 患者必须有有效 `privacy_policy` 和 `ai_processing` 授权。
- 调用 `POST /ai/assessment-drafts` 后，评估列表不能新增正式评估记录。
- AI 草稿必须返回 `pending_human_review`、结构化 `scoreSummary`、`production_ai_assessment` 来源、供应商调用证据、HTTPS endpoint、调用 ID、提示词版本和调用时间。
- 脚本只在配置中的 `humanReview.conclusion=approved` 时调用 `POST /assessments`。
- 正式评估创建后，必须能通过 `GET /patients/:id/assessments` 反查正式评估、风险评级和 AI 分析记录。
- 本 AI verifier 的 `ai.assessment_draft.generate` 和 `assessment.create` 审计成功候选都必须恰好一条；每条返回候选都会递归扫描，不能从重复候选中只挑第一条。
- Speech AI 组合验收要求 `ai.assessment_speech_transcript.generate`、`ai.assessment_draft.generate` 和 `assessment.create` 各自恰好一条当前 action/target/result 成功候选。语音审计完整绑定 speech evidence（包括 `audio`），草稿审计完整绑定其审计摘要身份字段，正式创建审计不允许额外 metadata；每类返回的所有候选都会扫描敏感或额外字段。
- 审计查询只使用独立审计 Cookie 会话，不复用医师 cookie。
- 登录、CSRF、API 或字段校验失败时脚本立即失败；`204`、JSON `null`/`false`、空字符串、非 JSON 和错误 shape 全部硬失败；不会自动重试、回退到 Bearer、补写数据或把失败伪装为成功。
- API 失败或字段不一致时，脚本只报告路径和失败类别，不打印响应体、服务端返回 ID/值、转写或模型摘要，避免泄露 token、密钥、转写或模型内容。
- 配置 JSON 解析失败只输出固定脱敏错误；响应和审计中的危险键和值都会递归扫描，包括 mock、demo、seed、fallback、fixed、manual、synthetic 及键名变体。Bearer 扫描覆盖尾部 `=`，合法 40 位十六进制或 UUID/callId 不按 Base64 误拒。

## 失败判定

- AI 草稿接口缺配置、缺授权或供应商调用失败。
- AI 草稿响应缺少供应商证据、调用 ID、调用时间、提示词版本或 `pending_human_review` 状态。
- 草稿阶段自动创建了正式评估记录。
- 人工复核结论不是 `approved`。
- `humanReview.reviewerUserId` 与当前医师会话用户不一致，或当前会话不是医师用户。
- 正式评估未保存供应商调用证据和人工复核记录。
- 正式评估无法反查风险评级或 AI 分析记录。
- 任一审计成功候选数量不是一条、身份字段未与当前 evidence 完整绑定，或任一候选 metadata 保存了 token、密钥、原始转写、base64/audio 载荷、额外字段、演示标记或 `manual`/`synthetic` 手工包装标记。

## 交付口径

通过本脚本只能证明一次真实 AI 评估闭环满足“草稿、人工复核、正式入库、审计可追溯”的要求。它不证明模型医学有效性，也不代表协同过滤、疗效预测或自动诊断能力已经完成。正式对客户表述仍应限定为“AI 辅助认知评估草稿 + 医生复核入库”。
