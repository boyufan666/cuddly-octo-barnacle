# MiMo 语音能力生产就绪说明

更新时间：2026-07-22

本文说明本期唯一允许的 MiMo 音频理解与 TTS 生产路径。它不证明客户账号、模型权限、区域合规或真实现场验收已经完成。

## 固定生产协议

| 能力 | 生产 provider | 平台接口 | 允许的 MiMo 协议 |
| --- | --- | --- | --- |
| 语音转写草稿 | `xiaomi-mimo-audio-understanding` | `POST /ai/assessment-speech-transcripts` | MiMo `chat/completions` 语音识别 endpoint，使用 `mimo-v2.5-asr`、`input_audio` 和 `asr_options.language` |
| 语音播报 | `xiaomi-mimo-tts` | `POST /ai/tts-speech-outputs` | 客户批准的 MiMo `chat/completions` TTS endpoint，模型为受批准的 `mimo-v2.5-tts*` |

不得把未被客户批准的标准 `/v1/audio/transcriptions` 或 `/v1/audio/speech` 当作生产接口；也不得因为这些 endpoint 不可用而切换到浏览器朗读、静态音频、其他供应商、文本模型推断、固定转写或任何 fallback。

## 必须的生产配置

生产 API 启动会逐项验证下列契约。所有值由 Render Blueprint 配置，`sync: false` 的值只能由客户授权的运维人员填写：

```text
NODE_ENV=production
SPEECH_REQUIRED_FOR_LAUNCH=true
TTS_REQUIRED_FOR_LAUNCH=true
MIMO_API_KEY_REF=secret-manager://...
MIMO_API_KEY_FILE=/etc/secrets/mimo_api_key
MIMO_ALLOWED_HOSTS=<approved-mimo-hosts>
SPEECH_PROVIDER=xiaomi-mimo-audio-understanding
SPEECH_TO_TEXT_ENDPOINT=https://<approved-mimo-host>/...
SPEECH_MODEL_VERSION=mimo-v2.5-asr
TTS_PROVIDER=xiaomi-mimo-tts
TTS_ENDPOINT=https://<approved-mimo-host>/...
TTS_MODEL_VERSION=mimo-v2.5-tts
TTS_VOICE_ID=<approved-voice>
TTS_OUTPUT_FORMAT=mp3|wav
SPEECH_PROVIDER_TIMEOUT_MS=<positive-integer>
SPEECH_PROVIDER_MAX_RESPONSE_BYTES=<positive-integer>
TTS_PROVIDER_TIMEOUT_MS=<positive-integer>
TTS_PROVIDER_MAX_RESPONSE_BYTES=<positive-integer>
MIMO_KEY_VALUE_URL=<Render Key Value private URL>
MIMO_USAGE_*=<customer-approved-positive-integers>
```

`MIMO_API_KEY`、`SPEECH_API_KEY`、`TTS_API_KEY`、`AI_API_KEY` 等原始环境变量在生产环境被明确拒绝。Secret File 必须是 `/etc/secrets` 目录下的直接普通文件，文件内容只包含一个无空白的真实密钥。资料包和文档只保存 `secret-manager://` 引用与文件路径。

## 授权、数据和失败处理

- STT 必须先验证患者 `privacy_policy`、`ai_processing` 与 `microphone_capture` 同意；音频格式、字节数、时长和请求上限不满足时直接拒绝。
- TTS 必须先验证患者 `privacy_policy` 与 `ai_processing` 同意；不能把 TTS 同意视为麦克风同意，也不能用 STT endpoint 代替 TTS。
- 服务只接受结构合规的真实 MiMo 响应。供应商超时、网络失败、配额拒绝、响应为空、格式不匹配、审计或 telemetry 写入失败均为失败；不自动重试、切换或伪造成功。
- 仅记录最小化的 provider telemetry：provider、模型、endpoint host、受控关联 ID、状态、耗时和哈希。禁止把原始音频、Base64、转写全文、播放文本、响应正文或密钥写入日志、审计 metadata 或验收包。

## 真实验收

1. 客户先填完 `customer-production-input/v2`，并执行 `pnpm verify:customer-production-input -- <input.json>`。
2. 在 Staging 用真实、已同意的录音和患者运行 STT 证据检查与现场 API 验收。
3. 在同一受控环境用真实播报文本、目标浏览器和播放设备运行 TTS 证据检查与现场 API 验收。
4. 医师审核 STT 草稿和 AI 草稿；审计人员只读反查授权、调用、播放/复核和最小化 telemetry。
5. Production 仅在 Staging 通过、Render `/health/ready` 通过、客户批准费用/配额策略后发布。

所需命令和证据模板见 `docs/speech-transcript-acceptance-runbook.md`、`docs/tts-speech-output-acceptance-runbook.md` 及主计划。任何真实数据、凭据、临床记录或设备证据缺失时，结论为 `BLOCKED`。
