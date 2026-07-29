# 语音转写正式现场验收 Runbook

本文用于证明语音转写不是演示文本，而是在真实浏览器、真实患者授权、真实后端 API、真实语音供应商和真实审计日志中完成一次语音评估转写。

## 验收边界

- 本验收只覆盖 STT 语音转文字，不覆盖 TTS 语音输出。
- 本验收只证明“真实录音 -> STT 转写 -> 审计”单链路；若客户验收“语音输入 + AI 评估 + 正式入库”组合能力，还必须执行 `pnpm verify:speech-ai-assessment-acceptance -- <config-json-path>`。
- `pnpm verify:speech-transcript-evidence` 只校验证据 JSON 的结构、字段和交叉引用，不能替代真实 API 验收。
- `pnpm verify:speech-transcript-acceptance` 会读取一份现场录音文件，通过平台 API 提交到 `POST /ai/assessment-speech-transcripts`，并只读反查患者授权和审计日志。
- 脚本不会直接调用供应商密钥，不会创建正式评估记录，不会生成 AI 草稿，不会补写审计日志，不会把失败转成成功。
- 缺 HTTPS API、现场账号口令、真实录音文件、`microphone_capture` 授权、供应商调用证据或成功审计日志时必须失败。
- 不得把 mock、demo、seed、fallback、fixed transcript、手工录入文本或固定转写结果当作正式语音验收证据。

## 前置条件

1. 客户确认全量 `AI_REQUIRED_FOR_LAUNCH=true`、`SPEECH_REQUIRED_FOR_LAUNCH=true`、`TTS_REQUIRED_FOR_LAUNCH=true`，且生产配置已通过 `pnpm delivery:check:production`。
2. 后端配置 `SPEECH_PROVIDER=xiaomi-mimo-audio-understanding`、正式 HTTPS `SPEECH_TO_TEXT_ENDPOINT`、`SPEECH_MODEL_VERSION`、限制、approved MiMo hosts、Key Value 配额以及 `MIMO_API_KEY_REF` / `/etc/secrets/mimo_api_key`。生产原始 provider key 变量不得存在。
3. 患者已签署 `privacy_policy`、`ai_processing` 和 `microphone_capture`，且授权未撤回。
4. 现场使用 HTTPS Web 页面进入评估页，浏览器支持 `MediaRecorder`；Chrome/Edge 录制的 WebM 只作为浏览器中间格式，平台提交供应商前必须转换为 WAV。
5. 准备一段真实评估问答录音文件，音频格式必须是小米音频理解支持的正式格式：`audio/wav`、`audio/mpeg`、`audio/mp4`、`audio/ogg` 或 `audio/flac`。
6. 准备一个具备患者读取和语音转写权限的账号口令，以及另一个具备 `audit.read` 权限的审计账号口令。两个账号必须不同，并分别登录、使用独立 cookie jar 和独立 cookie 会话，不得共享高权限会话。

## 现场步骤

1. 使用患者或医师账号打开评估页，确认麦克风授权状态为已签署。
2. 点击开始语音评估录音，完成一段 MMSE/CDR 问答后停止并转写。
3. 确认转写文本只回填到问答转写框，不自动创建正式评估记录。
4. 保存评估页转写回填截图。
5. 后台查询 `ai.assessment_speech_transcript.generate` 审计日志，确认 `targetType=patient_profile`、`targetId=patientId`、`result=success`。
6. 按 `docs/templates/speech-transcript-evidence.template.json` 填写证据 JSON。模板中的 `<...>` 必须替换为现场真实证据。

## JSON 自检命令

```bash
pnpm verify:speech-transcript-evidence -- <evidence-json-path>
```

也可以使用环境变量：

```bash
SPEECH_TRANSCRIPT_EVIDENCE_FILE=<evidence-json-path> \
pnpm verify:speech-transcript-evidence
```

该命令会拒绝缺字段、非 HTTPS endpoint、非 `secret-manager://` 密钥引用、未授权、自动创建正式评估、原始音频长期保存、占位符和 `mock/demo/seed/fallback/fixed` 标记。

## 真实 API 验收命令

准备一个配置 JSON，例如：

```json
{
  "apiBaseUrl": "https://api.rehab.example.com",
  "patientAccount": "<具备患者读取和语音转写权限的账号>",
  "patientPassword": "<患者账号口令>",
  "auditAccount": "<具备 audit.read 权限的审计账号>",
  "auditPassword": "<审计账号口令>",
  "patientId": "<真实患者 ID>",
  "assessmentType": "MMSE/CDR",
  "audioFilePath": "/secure/evidence/speech/mmse-real.wav",
  "audioMimeType": "audio/wav",
  "durationSeconds": 42
}
```

执行：

```bash
pnpm verify:speech-transcript-acceptance -- <config-json-path>
```

也可以使用环境变量：

```bash
SPEECH_TRANSCRIPT_ACCEPTANCE_CONFIG=<config-json-path> \
pnpm verify:speech-transcript-acceptance
```

该命令会：

- 使用患者账号和审计账号分别完成 CSRF 登录，保存彼此隔离的 session cookie；运行时不接收或发送 Bearer token。
- 先校验业务账号与审计账号不同；同账号会在任何文件读取和网络请求前失败。随后检查音频文件存在且非空，避免提交空文件。
- 查询患者详情，确认 `privacy_policy`、`ai_processing` 和 `microphone_capture` 均有效。
- 调用 `POST /ai/assessment-speech-transcripts`，要求返回非空 `transcript` 和完整 `speechEvidence`。
- 查询审计日志，要求当前 action/target/result 成功候选恰好一条，并完整匹配 `speechEvidence.provider/modelVersion/callId/endpointRef/source/calledAt/audio`。所有候选都会扫描额外字段，不能用第二条重复记录夹带转写、token 或音频载荷。
- 任一 CSRF、登录、必需 API 或审计节点返回 `204`、JSON `null`/`false`、空字符串、非 JSON 原始字符串或错误顶层类型时，记录固定脱敏错误后立即失败；错误消息不回显响应对象或值。配置 JSON 解析失败也不会拼接解析器消息。
- 审计 metadata 只允许供应商证据摘要字段，`audio` 只允许 `mimeType` 和 `durationSeconds`；任何其他未知字段、嵌套对象/数组，或 token、secret、cookie、credential、transcript、text、audio base64、payload、request、response 等原始载荷键及其变体均失败，同时继续扫描尾部带 `=` 的 Bearer、密钥和 base64 等敏感值。合法 40 位十六进制或 UUID/callId 不按 Base64 误拒。
- 响应中的危险键和值都会递归扫描，包括 mock、demo、seed、fallback、fixed、manual、synthetic 及键名变体。

`verify:speech-ai-assessment-acceptance` 组合验收同样使用独立会话：业务会话配置为 `doctorAccount`/`doctorPassword`，审计会话配置为 `auditAccount`/`auditPassword`；不接受 `doctorToken`、`auditToken` 或登录响应中的 `accessToken` 作为运行时认证。

语音 AI 组合验收保持“STT → AI 草稿 → 医师人工批准 → 正式评估 → 审计反查”的正式持久化流程。验证器不得通过删除临床事实、删减转写或伪造摘要规避敏感持久化问题；相关字段的静态加密依赖 Task3 字段加密实现。

## 必须包含的证据

- 现场验收信息：验收时间、验收人员、现场名称和环境。
- 浏览器信息：浏览器名、版本、`userAgent`、HTTPS 页面地址。
- 患者信息：真实患者 ID 和脱敏导出 ID。
- 授权信息：`microphone_capture` 授权 ID、协议版本、授权时间和状态。
- 供应商信息：`xiaomi-mimo-audio-understanding`、模型版本、正式 HTTPS endpoint、`secret-manager://...` 密钥引用、客户账号负责人和调用日志留存天数。
- 音频采集信息：实际提交供应商的 MIME 类型、时长、采集时间、`rawAudioStored=false` 和浏览器录音方式。若浏览器原始录音为 WebM，证据中仍必须填写转码后提交供应商的 `audio/wav`。
- 转写结果：患者 ID、评估类型、`status=transcribed`、真实转写文本、供应商调用 ID、调用时间和来源。
- 人工复核：必须要求人工复核，且 `formalAssessmentCreatedAutomatically=false`。
- 审计证据：`ai.assessment_speech_transcript.generate` 成功日志。
- 附件证据：至少一张评估页转写回填截图。

## 失败判定

- 未签署或已撤回 `microphone_capture`。
- API 或供应商 endpoint 不是 HTTPS。
- 密钥引用不是 `secret-manager://...`。
- 语音供应商不是 `xiaomi-mimo-audio-understanding`。
- 返回结果缺少非空 `transcript`、`speechEvidence.callId`、模型版本或 endpoint。
- 成功审计候选不是恰好一条，或审计未完整匹配当前 evidence 的 `callId`、供应商、模型版本、endpoint、source、calledAt 和 audio。
- 业务账号与审计账号相同，或任一必需 2xx 响应的类型/shape 不符合约定。
- 自动创建正式评估记录，或将语音转写结果直接包装成正式 AI 评估。
- 长期保存原始音频，或在审计日志中保存 base64 音频、明文密钥、完整敏感转写。
- 任一证据键名或值包含 mock、demo、seed、fallback、fixed、manual、synthetic 或 `<...>` 占位符。
