# 小米 MiMo Token Plan STT/TTS 联通记录

本文记录本地联调结论，用于说明当前 `tp-...` Token Plan key 应使用 Token Plan endpoint，而不是普通 `api.xiaomimimo.com` endpoint。本文不保存真实密钥、原始请求体、原始响应体或完整音频。

## 结论

- Token Plan 文本大模型可用：`https://token-plan-cn.xiaomimimo.com/v1/chat/completions`，模型 `mimo-v2.5`。
- Token Plan TTS 可用：同一 endpoint，模型 `mimo-v2.5-tts`，返回真实 WAV 音频，文件头为 `RIFF...WAVE`。
- Token Plan 语音识别可用：同一 endpoint，模型 `mimo-v2.5-asr`，可转写由 TTS 生成的 WAV 音频。MiMo 官方当前语音识别协议要求使用该 ASR 模型，并在 `message.content` 返回纯转写文本。
- 普通 `https://api.xiaomimimo.com/v1/chat/completions` 对当前 `tp-...` key 返回 `401 Invalid API Key`，不适合作为本项目当前本地联调 endpoint。

## 本地项目级验证

本地用项目后端 `AppService` 直接调用真实供应商接口，mock 患者权限、授权和审计数据库写入，只让供应商调用走真实网络。

验证结果：

- `createTtsSpeechOutput` 成功调用 `mimo-v2.5-tts`，返回 `audio/wav`。
- 返回音频通过项目内 WAV 文件头校验。
- `createAssessmentSpeechTranscript` 使用上一步 TTS 生成的 WAV 音频，成功转写出“请告诉我，今天是星期几？”。
- TTS 审计 action 为 `ai.tts_speech_output.generate`。
- STT 审计 action 为 `ai.assessment_speech_transcript.generate`。
- TTS 审计 metadata 不包含完整待合成文本。

## 推荐本地配置

本地 `.env` 可使用同一个 Token Plan key 联调 AI、STT 和 TTS，但 `.env` 不得提交仓库。

```env
AI_PROVIDER="xiaomi-mimo"
AI_MODEL_ENDPOINT="https://token-plan-cn.xiaomimimo.com/v1"
AI_MODEL_VERSION="mimo-v2.5"

SPEECH_PROVIDER="xiaomi-mimo-audio-understanding"
SPEECH_TO_TEXT_ENDPOINT="https://token-plan-cn.xiaomimimo.com/v1/chat/completions"
SPEECH_MODEL_VERSION="mimo-v2.5-asr"

TTS_PROVIDER="xiaomi-mimo-tts"
TTS_ENDPOINT="https://token-plan-cn.xiaomimimo.com/v1/chat/completions"
TTS_MODEL_VERSION="mimo-v2.5-tts"
TTS_VOICE_ID="Chloe"
TTS_OUTPUT_FORMAT="wav"
```

正式交付仍必须使用客户账号、正式密钥托管引用、运行时密钥注入、供应商调用日志和现场验收 evidence。不能把个人 Token Plan key、聊天记录中的 key 或本地 `.env` 当作生产密钥。

## 验收要求

- TTS 现场验收：`pnpm verify:tts-speech-output-evidence -- <evidence-json-path>`，再执行 `pnpm verify:tts-speech-output-acceptance -- <config-json-path>`。
- STT 现场验收：`pnpm verify:speech-transcript-evidence -- <evidence-json-path>`，再执行 `pnpm verify:speech-transcript-acceptance -- <config-json-path>`。
- 语音输入进入 AI 评估闭环：`pnpm verify:speech-ai-assessment-acceptance -- <config-json-path>`。
