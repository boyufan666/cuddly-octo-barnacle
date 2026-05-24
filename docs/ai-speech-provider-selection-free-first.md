# AI/语音供应商免费优先选型说明

更新时间：2026-05-24
用途：用于客户沟通和上线前选型，不作为价格承诺。AI/语音供应商的免费额度、模型版本、价格和区域政策变化很快，正式上线前必须以客户账号控制台和供应商官网当前页面为准。

## 结论

如果客户已有星火或讯飞账号，优先评估 `讯飞星火大模型 + 讯飞语音识别`。优势是中文能力、语音能力和客户已有资源可以复用；具体可用模型、免费额度、试用权限、有效期和生产授权必须由客户在讯飞控制台或官方页面实时确认。

如果客户没有明确供应商账号，但能开通阿里云，优先评估 `阿里云百炼 / 通义千问 + 百炼语音识别`。阿里云百炼官方页面提供新人免费额度和用量控制说明；具体额度、覆盖模型、有效期、地域和用完即停配置必须以客户控制台实时结果为准。

如果客户只追求低成本大模型 API，可评估 `DeepSeek`、`Kimi/Moonshot`、`智谱 GLM`。这些更适合作为低成本或特定能力备选，但仍要客户提供账号、费用确认、调用日志和合规授权，不能把第三方临时代理或个人 token 当生产能力。

`OpenAI` 不建议作为“免费优先”首选。OpenAI API 以官方价格页和客户 API 账单为准，ChatGPT 订阅不能直接等同于本项目 API 生产额度；除非客户接受境外服务、合规审查和付费预算，否则不作为一期默认方案。

## 选型原则

- 先用客户已有账号和已有供应商资源，避免新开户注册、合规审批和付款周期。
- 免费额度只用于试点降成本，不作为生产 SLA 或长期运行依据。
- 免费额度必须确认：额度大小、有效期、QPS、并发、可否生产使用、超额计费、是否可开启用完即停。
- 任何真实 AI/语音评估都必须保留调用日志、模型版本、提示词版本和医师人工复核记录。
- 不接受 `mock`、`demo`、`local`、个人临时 token、第三方不明代理或无法提供日志的服务。

## 候选方案

| 优先级 | 方案 | 适用情况 | 免费/成本口径 | 主要风险 |
| --- | --- | --- | --- | --- |
| 1 | 讯飞星火 + 讯飞语音识别 | 客户已有星火/讯飞资源，或需要中文语音能力 | 以客户讯飞控制台确认的免费额度、试用权限、模型范围和费用规则为准 | 需客户确认具体套餐、QPS、额度有效期和生产授权 |
| 2 | 阿里云百炼/通义千问 + 百炼语音识别 | 客户能开通阿里云或已有阿里云账号 | 以客户阿里云百炼控制台确认的新人额度、有效期、覆盖模型和用量控制为准 | 免费额度地域、模型范围和有效期有限，超额会按量计费 |
| 3 | DeepSeek API | 主要希望低成本文本大模型，语音另接讯飞/阿里/智谱 | 官方价格页展示低价按量计费，适合低成本试点 | 不保证免费额度；语音能力需另配；需评估合规和可用性 |
| 4 | 智谱 GLM + GLM-ASR | 需要国产模型、文本和语音同供应商备选 | 以客户智谱控制台确认的活动额度、模型价格和 ASR 计费规则为准 | 免费活动变化快；需确认模型、ASR、并发和费用 |
| 5 | Kimi/Moonshot | 需要长上下文、低成本文本模型备选 | 官方平台按 token 计费，支持透明用量控制 | 不作为免费首选；语音需另接；需确认国内/国际平台差异 |
| 6 | OpenAI | 客户明确接受境外服务、预算和合规 | API 费用以官方价格页和客户 API 账单为准，ChatGPT 订阅不能直接等同于 API 额度 | 不满足“最好免费”；合规、跨境、成本和密钥管理要求更高 |

## 推荐落地组合

### A. 客户已有星火账号

- 大模型：`AI_PROVIDER=iflytek-spark`
- 语音识别：`SPEECH_PROVIDER=iflytek-iat` 或客户控制台实际产品编码
- 适用：客户说“现在好像有星火”，且希望尽量免费。
- 必须让客户提供：星火账号负责人、可用模型版本、免费额度截图或清单、APIPassword 密钥托管引用、语音识别权限、调用日志样例。

### B. 客户有阿里云账号

- 大模型：`AI_PROVIDER=aliyun-bailian-qwen`
- 语音识别：`SPEECH_PROVIDER=aliyun-bailian-asr`
- 适用：客户能接受阿里云账户体系和百炼控制台。
- 必须让客户提供：百炼开通地域、免费额度页面截图、免费额度用完即停配置截图、API Key 密钥托管引用、模型版本和调用日志样例。

### C. 客户只有低成本诉求，没有语音供应商

- 大模型可先评估：DeepSeek、Kimi、智谱 GLM。
- 语音识别仍建议优先讯飞或阿里云，避免为了低价模型牺牲语音识别稳定性。
- 必须让客户确认：是否允许健康数据和问答转写发送给该供应商，是否有发票/合同/数据处理协议。

## 写入客户资料包

客户资料包 `customer-production-input.json` 中建议这样填写。示例值只说明字段形态，不代表供应商最终 endpoint、模型版本或生产可用性；只有客户要求真实 AI/语音上线时，`requiredForLaunch` 才应设为 `true`。

```json
{
  "ai": {
    "requiredForLaunch": true,
    "freeTierPreferred": true,
    "provider": "iflytek-spark",
    "accountOwner": "客户 AI 供应商账号负责人",
    "freeQuotaConfirmed": true,
    "freeQuotaDescription": "免费额度、有效期、QPS、并发、超额计费和生产使用授权说明",
    "endpoint": "https://spark-api.customer.example.com/v1/chat/completions",
    "apiKeyRef": "secret-manager://rehab-prod/iflytek-spark-api-key",
    "modelName": "Spark Lite/Pro/Ultra 或客户确认版本",
    "modelVersion": "客户控制台确认的模型版本",
    "promptVersion": "cognitive-assessment-2026-06",
    "callLogRetentionDays": 180,
    "humanReviewRequired": true,
    "humanReviewOwner": "负责复核的医师账号"
  },
  "speech": {
    "requiredForLaunch": true,
    "freeTierPreferred": true,
    "provider": "iflytek-iat",
    "accountOwner": "客户语音供应商账号负责人",
    "freeQuotaConfirmed": true,
    "freeQuotaDescription": "免费试用权限、有效期、并发和超额计费说明",
    "endpoint": "https://speech.customer.example.com/v2/iat",
    "apiKeyRef": "secret-manager://rehab-prod/iflytek-iat-api-key",
    "modelVersion": "客户控制台确认的语音识别版本",
    "microphoneConsentRequired": true
  }
}
```

填写后执行：

```bash
pnpm verify:customer-production-input -- customer-production-input.json
```

## 需要客户确认的问题

- 是否已有星火/讯飞账号？账号主体是客户公司还是个人？
- 星火免费额度具体是多少、有效期到哪天、QPS/并发是多少、是否允许试点或生产使用？
- 语音识别免费试用是否覆盖评估场景？是否支持普通话、方言和噪声环境？
- 免费额度用完后是否自动停用，还是按量扣费？
- 是否允许把健康数据、问答转写、评估摘要发送到该供应商？
- 是否能提供供应商控制台截图、调用日志样例和费用确认？
- 密钥是否可以放入客户正式密钥管理系统，并只给项目 `secret-manager://...` 引用？
- 医师人工复核流程由谁负责，复核记录保存多久？

## 官方资料参考

- 讯飞星火 HTTP 接口文档：<https://www.xfyun.cn/doc/spark/HTTP%E8%B0%83%E7%94%A8%E6%96%87%E6%A1%A3.html>
- 讯飞语音听写流式 WebAPI：<https://www.xfyun.cn/doc/asr/voicedictation/API.html>
- 讯飞实时语音转写标准版：<https://www.xfyun.cn/doc/asr/rtasr/API.html>
- 阿里云百炼新人免费额度：<https://help.aliyun.com/zh/model-studio/new-free-quota/>
- 阿里云百炼模型调用价格：<https://help.aliyun.com/zh/model-studio/model-pricing>
- DeepSeek 官方模型与价格：<https://api-docs.deepseek.com/quick_start/pricing>
- 智谱 GLM-ASR：<https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-asr>
- 智谱 GLM-4-Long：<https://docs.bigmodel.cn/cn/guide/models/text/glm-4-long>
- Kimi/Moonshot 模型推理价格：<https://platform.moonshot.cn/docs/pricing/chat>
- OpenAI API Pricing：<https://openai.com/api/pricing/>
