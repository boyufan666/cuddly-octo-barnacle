# TTS 语音输出正式验收 Runbook

## 目标

验证一期语音输出是通过平台后端调用真实 TTS 供应商生成音频，并在前端播放供应商返回音频。验收不接受浏览器 `SpeechSynthesis`、系统朗读、预生成 mp3、静态音频或人工上传音频作为替代。

## 前置配置

- `TTS_REQUIRED_FOR_LAUNCH=true`
- `TTS_PROVIDER=xiaomi-mimo-tts`
- `TTS_ENDPOINT=https://<customer-approved-mimo-host>/...`
- `MIMO_API_KEY_REF=secret-manager://...` 与 `MIMO_API_KEY_FILE=/etc/secrets/mimo_api_key`
- `MIMO_ALLOWED_HOSTS=<customer-approved-mimo-hosts>`、Render Key Value 配额以及 TTS provider 的 timeout/response 限制
- `TTS_MODEL_VERSION=mimo-v2.5-tts`
- `TTS_VOICE_ID` 使用客户确认音色
- `TTS_OUTPUT_FORMAT=wav`；当前现场验收器严格验证 PCM WAV，若客户批准 `mp3`，必须先扩展并回归该验收器后才能作为生产格式发布
- `AI_REQUIRED_FOR_LAUNCH=true`、`SPEECH_REQUIRED_FOR_LAUNCH=true`、`AI_HUMAN_REVIEW_REQUIRED=true`，并配置客户批准的最小化 telemetry 留存期

## 现场验收步骤

1. 准备具备患者访问权限的账号口令，以及另一个具备 `audit.read` 权限的审计账号口令；两个账号必须不同，并使用独立 CookieSessionClient、独立 cookie jar 和独立 cookie 会话。
2. 确认患者已签署 `privacy_policy` 与 `ai_processing` 授权。
3. 打开评估录入页，点击“播放评估题目语音”。
4. 确认页面能听到供应商生成音频，且失败时只提示失败，不播放预置或本地朗读。
5. 查询后台审计，确认存在 `ai.tts_speech_output.generate` 成功记录。
6. 将现场截图、供应商调用 ID、审计 ID 填入 `docs/templates/tts-speech-output-evidence.template.json`。
7. 执行 `pnpm verify:tts-speech-output-evidence -- <evidence.json>`。
8. 执行 `pnpm verify:tts-speech-output-acceptance -- <config.json>`。

## 验收配置示例

```json
{
  "apiBaseUrl": "https://api.rehab.customer.example.com",
  "patientAccount": "具备患者访问和 TTS 触发权限的账号",
  "patientPassword": "患者账号口令",
  "auditAccount": "具备 audit.read 权限的审计账号",
  "auditPassword": "审计账号口令",
  "patientId": "patient_real_001",
  "text": "请告诉我，今天是星期几？",
  "scenario": "assessment_prompt"
}
```

验证器会分别完成 CSRF 登录并维护相互隔离的 session cookie；运行时不接收或发送 Bearer token，也不使用登录响应中可能出现的 `accessToken`。患者账号与审计账号相同时，会在任何网络请求前失败。

任一 CSRF、登录、必需 API 或审计节点返回 `204`、JSON `null`/`false`、空字符串、非 JSON 原始字符串或错误顶层类型时，验证器会记录固定脱敏错误后立即失败，不回显实际响应对象或值。配置 JSON 解析失败同样只输出固定脱敏错误，不拼接解析器消息。审计查询必须恰好返回一条当前 action/target/result 候选，并完整匹配 `provider`、`modelVersion`、`callId`、`endpointRef`、`source`、`calledAt`、`voiceId`、`scenario`、`inputTextHash` 和 `audio`；所有候选都必须接受敏感字段扫描。审计 metadata 顶层仅允许这些供应商证据摘要字段；`audio` 仅允许 `mimeType`、`format`、`byteLength`，其他未知、嵌套或敏感键均失败，并保留 Bearer、密钥和 base64 等敏感值扫描。

`audio.contentBase64` 必须严格解码为完整 RIFF/WAVE 文件，且实际解码字节数必须等于 `audio.byteLength`。验证器使用纯 JavaScript 解析 chunk，不调用 `ffprobe`：RIFF size 必须覆盖完整文件；必须有且只有一个 16 字节 PCM `fmt ` chunk 和一个非空 `data` chunk；所有 chunk 数据与奇数长度 padding 都不得越界；允许未知但结构完整的 chunk。当前支持 PCM 编码 `audioFormat=1`、1/2 声道、8000/16000/22050/24000/32000/44100/48000 Hz、8/16/24/32 位；`blockAlign`、`byteRate` 和 `data` 对齐必须与这些字段一致。

## 必须失败的情况

- 未启用 `TTS_REQUIRED_FOR_LAUNCH=true`。
- TTS endpoint 不是 HTTPS 或指向本地地址。
- MiMo 密钥引用不是 `secret-manager://`，或运行时不是 Render Secret File。
- 缺少 `privacy_policy` 或 `ai_processing` 授权。
- 供应商调用失败、缺少 `callId`、缺少 `audio.contentBase64` 或音频为空。
- `audio.contentBase64` Base64 解码后不是上述受支持的完整 PCM WAV，或实际字节数与 `audio.byteLength` 不一致。
- 审计日志缺失或审计 metadata 含明文密钥、完整文本、base64 音频。
- 成功审计候选不是恰好一条、身份字段未与当前 `ttsEvidence` 完整绑定，或任一候选包含额外字段。
- 患者业务账号与审计账号相同，或任一必需 2xx 响应的类型/shape 不符合约定。
- 键名或值使用 mock、demo、seed、fixed、manual、fallback、synthetic 标记的证据。
