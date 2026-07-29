# MiMo AI、语音与费用确认说明

更新时间：2026-07-22

本文替代早期的“免费优先、多供应商选型”说明。它定义本期 GitHub + Render 生产交付唯一允许的 AI、语音转写和语音播报方案，不构成价格承诺或供应商授权。

## 生产结论

本期必须同时启用并验收以下三项 MiMo 能力：

- AI 评估与对话：`xiaomi-mimo`。
- 音频理解转写：`xiaomi-mimo-audio-understanding`。
- 语音播报：`xiaomi-mimo-tts`，且 TTS 模型只能是 `mimo-v2.5-tts`、`mimo-v2.5-tts-voicedesign` 或 `mimo-v2.5-tts-voiceclone`。

不接受讯飞、星火、阿里云、通义、DeepSeek、Kimi、智谱、OpenAI、个人账号、代理服务或浏览器本地语音作为生产替代。任何 MiMo 请求失败、配额耗尽、授权不足、响应不合规或审计证据缺失时，相关业务操作必须失败并保留受控审计；不得转向其他供应商、固定文本、预生成音频、规则推断、mock、demo 或 fallback。

## 客户必须确认的 MiMo 资料

客户将以下信息填写进 `docs/templates/customer-production-input.template.json` 的 `mimo`、`ai`、`speech` 和 `tts` 节点，并用实际资料替换全部占位符：

- 客户主体的 MiMo 账号负责人、数据处理授权、生产可用性和费用责任人。
- 单一受批准的 MiMo HTTPS 主机名列表 `mimo.allowedHosts`，以及 AI、音频理解、TTS 三个精确 endpoint；host、路径和模型版本必须来自客户授权的 MiMo 服务说明。
- `mimo.apiKeyRef` 的客户密钥管理引用和 Render Secret File 路径 `/etc/secrets/mimo_api_key`。资料包只保留引用与文件路径，绝不含真实密钥。
- 每项能力的模型、提示词版本、TTS 音色与 `mp3` 或 `wav` 输出格式。
- 三项 provider 的请求超时和最大响应字节数；它们是上限，不是客户端重试或降级策略。
- Render Key Value 私有连接、命名空间、窗口、请求数、音频秒数、TTS 字符数、预算单位与计费因子。额度、窗口语义、失败请求是否计费和退款/重试规则须由客户书面批准后实施。
- 至少 30 天的最小化 provider telemetry 留存期，以及数据保留、删除、访问和审计责任人。

生产配置必须同时满足 `AI_REQUIRED_FOR_LAUNCH=true`、`SPEECH_REQUIRED_FOR_LAUNCH=true`、`TTS_REQUIRED_FOR_LAUNCH=true` 和 `AI_HUMAN_REVIEW_REQUIRED=true`。这些不是范围开关；生产运行时会拒绝任何 `false` 或缺失值。

## 安全与临床边界

- Render 只接收 Secret File，不接收原始 MiMo API key；原始 key 不得进入 GitHub、Render 普通环境变量、浏览器、日志、截图、验收包或工单。
- AI 草稿永远不能自动创建正式评估。医师必须对真实临床输入、MMSE、CDR、认知维度、风险等级和摘要进行人工复核并确认。
- STT 前必须存在 `privacy_policy`、`ai_processing` 与 `microphone_capture` 的真实患者同意；TTS 前必须存在 `privacy_policy` 与 `ai_processing` 同意。撤回后不得继续调用。
- 仅保存调用时间、provider、模型、endpoint host、受控关联 ID、耗时、状态和哈希等最小化 telemetry；不得保存原始音频、转写全文、提示词、响应正文、Base64 音频或密钥。

## 验收与 Go/No-Go

先校验客户资料包：

```bash
pnpm verify:customer-production-input -- <customer-production-input.json>
```

在 Render Staging 使用真实客户授权的资料完成以下验收：

```bash
pnpm verify:ai-assessment-acceptance -- <ai-config.json>
pnpm verify:speech-transcript-evidence -- <speech-evidence.json>
pnpm verify:speech-transcript-acceptance -- <speech-config.json>
pnpm verify:tts-speech-output-evidence -- <tts-evidence.json>
pnpm verify:tts-speech-output-acceptance -- <tts-config.json>
```

四类证据必须能反查同意、真实 MiMo 调用、医师复核或播放、审计日志及最小化 telemetry。缺任意一项、MiMo host 未批准、使用了非 MiMo 供应商、未确认配额/失败计费策略，或证据含伪数据标记时，结论为 `BLOCKED`。

完整的 GitHub、Render、数据库、训练运行时和客户验收顺序见 `docs/github-render-mimo-production-deployment-plan.md`；客户资料交接见 `docs/customer-final-input-request.md`。
