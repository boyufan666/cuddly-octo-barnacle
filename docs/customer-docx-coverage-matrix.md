# Customer DOCX Coverage Matrix

This matrix is the top-level requirement map for `客户提供/康复平台设计(1).docx`. It links each customer-facing requirement to a delivery target, proof command, current status, and boundary note.

No fallback allowed. Missing formal configuration, authorization, runtime assets, provider evidence, collection batches, audit logs, or field evidence must block the related formal capability instead of silently switching to mock, demo, fixed, browser-local, generated, manual, or fallback behavior.

Wearable device integration is customer-gated. It requires the customer to provide device model, SDK/API or protocol, metric definitions, sampling frequency, value ranges, authorization scope, and field evidence before implementation can be counted as complete.

Production deployment is customer-gated. It requires the customer or operations owner to provide servers, domain names, HTTPS certificates, database, Redis, backup, monitoring, logging, secret management, and operational ownership before deployment can be counted as complete.

## Customer Supplement Scope Adjustment

The customer supplement changes the product emphasis from making any single game complex to proving that the platform can estimate potential screening signals and coordinate multiple intervention plans. The formal scope is:

- Future clinical value is expressed as 潜在患病风险 and 潜在患病率趋势 screening support, built from scale results, AI assessment drafts, clinician-reviewed training plans, game metrics, and progress trends.
- Risk assessment is only a screening and intervention-planning aid. It cannot be presented as diagnosis, confirmed incidence, or treatment prediction, and the delivery wording must state: 不能把风险评估表述为诊断结论.
- 多方案干预 is the primary game-delivery target. 不同运动游戏方案 and cognitive plans should be available for clinician selection and adjustment instead of depending on one complex game.
- 游戏复杂度不是主交付指标. The primary delivery indicators are plan quantity and coverage, thinking/motor classification, formal metric collection, progress trend review, and clinician confirmation.
- Game content remains grouped as 思维类 and 运动类. The customer examples include motor rehabilitation games such as 乒乓球、羽毛球、太极拳、节奏光剑、虚拟园艺、虚拟家乡记忆 and cognitive games such as 记忆配对、快速计算、麻将、虚拟扑克牌、解谜游戏.
- 保留现有 Unity、浏览器体感和认知网页训练内容. New games must join the same formal data collection, audit, authorization, runtime-asset, and no-fallback gates as existing Unity, browser pose, and cognitive web content.

| ID | Customer wording from DOCX | Implementation target | Required proof | Delivery status | Boundary note |
| --- | --- | --- | --- | --- | --- |
| DOCX-USER-LOGIN | 用户注册/登录；三类登陆界面：患者、医师、家属 | Institution login plus reviewed account-opening requests for patient, caregiver, doctor, admin/operator/auditor roles | PROOF-ACCOUNT-ACCESS | done | No fallback allowed: registration requests cannot create active accounts until authorized review approves them. |
| DOCX-PATIENT-PROFILE | 个人信息管理；患者可查看和维护基础信息 | Patient profile, consent checklist, caregiver binding, and patient `我的` task area | PROOF-PATIENT-PROFILE | done | No fallback allowed: missing patient profile, consent, or caregiver binding must show a blocking user action, not generated placeholder data. |
| DOCX-METRIC-DATA | 指标数据录入与查看；用户指标数据管理 | MMSE/CDR/AD-8 metrics, health indicators, game completion, single training duration, reaction time, accuracy, error distribution, limb symmetry, rhythm sync, operation sequence, hint/skip use, progress trend metrics, collection batches, clinician result review | PROOF-METRIC-DATA | done | No fallback allowed: metrics must come from formal API records or accepted field evidence, not seed/fixed/manual scores. |
| DOCX-AI-DIALOGUE | AI 对话入口；通过 AI 对话降低复杂操作成本 | Patient AI dialogue entry, STT voice input, TTS prompt playback, multi-turn session, clinician review handoff | PROOF-AI-DIALOGUE | done | No fallback allowed: provider failure or missing Xiaomi MiMo config must block AI/STT/TTS functions instead of returning local text or browser speech. |
| DOCX-AI-RESULT | AI 分析结果展示；模型结果结构化返回前端展示 | AI assessment draft evidence, structured MMSE/CDR/AD-8 fields, risk rating, doctor approve/reject/edit before formal write | PROOF-AI-RESULT | done | No fallback allowed: AI drafts cannot become formal assessments without clinician approval and provider evidence. |
| DOCX-UNITY-GAME | Unity 小游戏入口；接入一个或多个轻量化体感小游戏 | Unity WebGL runtime entry, bridge protocol, `rhythm_reach_3d` build validation, runtime evidence | PROOF-UNITY-GAME | done | No fallback allowed: if Unity build, manifest, runtime, bridge event, training record, or audit evidence is missing, Unity cannot count as formally delivered. |
| DOCX-GAME-RESULT | 游戏记录与结果查看；记录游戏过程及游戏结果数据并回传后台 | Training session, result submission, motion metrics, patient result view, doctor review, family desensitized progress | PROOF-GAME-RESULT | done | No fallback allowed: duplicate, abnormal, low-quality, or incomplete results cannot be accepted as valid training completion. |
| DOCX-ADMIN-USERS | 管理后台：用户信息管理 | Admin account request review, role management, patient/caregiver/doctor/operator governance | PROOF-ADMIN-USERS | done | No fallback allowed: role assignment and account activation must remain explicit admin/doctor actions. |
| DOCX-ADMIN-METRICS | 管理后台：用户指标数据管理；基础运营配置与查询统计 | Admin/doctor metrics review, collection condition governance, operation configuration, statistics query, and audit-linked statistics | PROOF-ADMIN-METRICS | done | No fallback allowed: aggregate statistics cannot infer missing patient metrics, fill absent collection evidence, or report unverified operational numbers. |
| DOCX-ADMIN-AI | 管理后台：AI 对话记录管理；模型结果查看与管理 | Admin/doctor AI evidence summaries, provider metadata, clinician review status, no raw provider payload display | PROOF-ADMIN-AI | done | No fallback allowed: admin views may show metadata only; raw request/response bodies, full transcripts, secrets, and audio base64 stay out of audit and UI. |
| DOCX-ADMIN-GAMES | 管理后台：游戏数据管理；基础运营配置与查询统计 | Training content governance, Unity/browser pose/cognitive web runtime status, thinking and motor game categories, game library publishing and result quality review | PROOF-ADMIN-GAMES | done | No fallback allowed: unpublished, unlicensed, missing-runtime, or placeholder game content cannot be launched as a formal training item. |
| DOCX-AI-STT-TTS | AI 能力模块：语音输入与语音输出、语音转文字、大模型对话处理、贵方现有机器学习/大模型接口接入 | Xiaomi MiMo text model, MiMo audio-understanding STT, MiMo TTS, strict launch gates and evidence scripts | PROOF-AI-STT-TTS | done | No fallback allowed: browser SpeechSynthesis, generated audio, fixed transcripts, local summaries, or personal-token-only evidence cannot count as formal AI/STT/TTS delivery. |
| DOCX-PLAN-MATCHING | 基于 AI 对话结果自动生成认知评级；匹配 1-3 个推荐游戏方案；人工调整；每周频次、时长、难度阶梯 | Rule-based recommendation, potential disease risk and potential prevalence trend support, 1-3+ thinking/motor training plan options, clinician adjustment and confirmation | PROOF-PLAN-MATCHING | done | No fallback allowed: current claim is explainable rules plus clinician confirmation for screening support; it cannot become diagnosis, confirmed prevalence, collaborative filtering, or treatment prediction. |
| DOCX-REALTIME-CAPTURE | 游戏内实时数据采集与反馈：动作轨迹、反应时间、准确率、运动强度/生理指标、实时难度、语音/视觉鼓励 | MediaPipe browser pose, Phaser/canvas pose games, Unity bridge metrics, cognitive web operation metrics, collection condition metadata, dynamic difficulty policy, patient guidance, TTS encouragement where configured | PROOF-REALTIME-CAPTURE | done | No fallback allowed: wearable physiological metrics remain customer-gated; motion intensity and dynamic difficulty records can be accepted only from supported runtime metrics and verified trigger rules until device evidence exists. |
| DOCX-PRIVACY-AUDIT | 安全与隐私：敏感信息加密、分级权限、数据脱敏、隐私协议与知情同意、日志审计 | Sensitive encryption envelope, RBAC, consent/revoke, desensitized export, audit logs, acceptance package manifest | PROOF-PRIVACY-AUDIT | done | No fallback allowed: missing key refs or key material must fail instead of storing plaintext sensitive payloads. |
| DOCX-FAMILY-SOCIAL | 家属：可查看患者康复进度，与接下来注意事项 | Privacy-safe family care circle, caregiver progress summary, doctor precautions, comments/reactions with moderation | PROOF-FAMILY-SOCIAL | done | No fallback allowed: caregiver progress and precautions must stay within authorized family scope and cannot expose raw clinical, motion, provider, audit, or export data. |
| DOCX-SOCIAL-SQUARE | 社交模块：增加社交广场，提升趣味性 | Public social square is a customer-confirmation gate; current delivery scope is private care-circle interaction only | PROOF-SOCIAL-SQUARE-BOUNDARY | customer-gated | No fallback allowed: public social-square behavior cannot be treated as delivered until customer confirms scope, moderation policy, privacy review, consent wording, and operational ownership. |

## Proof Catalog

### PROOF-ACCOUNT-ACCESS

```bash
pnpm --filter @rehab-platform/api exec jest --runInBand apps/api/src/app.service.spec.ts
pnpm test:playwright
```

### PROOF-PATIENT-PROFILE

```bash
pnpm test:playwright
node --test scripts/__tests__/patient-facing-ux-boundary.test.mjs
```

### PROOF-METRIC-DATA

```bash
pnpm verify:formal-acceptance-chain -- <config-json-path>
pnpm verify:multi-condition-data-capture -- <config-json-path>
```

### PROOF-AI-DIALOGUE

```bash
node --test scripts/__tests__/ai-conversation-ui.test.mjs
pnpm verify:speech-ai-assessment-acceptance -- <config-json-path>
```

### PROOF-AI-RESULT

```bash
pnpm verify:ai-assessment-acceptance -- <config-json-path>
node --test scripts/__tests__/speech-ai-assessment-ui.test.mjs
```

### PROOF-UNITY-GAME

```bash
pnpm verify:unity-rhythm-reach-webgl-build
pnpm verify:unity-field-acceptance -- <evidence-json-path> --api-base-url <api-url> --read-credentials <read-credentials-json> --patient-token-ref <secret-ref> --audit-token-ref <secret-ref>
```

### PROOF-GAME-RESULT

```bash
pnpm verify:browser-pose-field-acceptance -- <evidence-json-path> --api-base-url <api-url> --read-credentials <read-credentials-json> --patient-token-ref <secret-ref> --audit-token-ref <secret-ref>
pnpm verify:formal-acceptance-chain -- <config-json-path>
```

### PROOF-ADMIN-USERS

```bash
pnpm test:playwright
node --test scripts/__tests__/api-route-uniqueness.test.mjs
```

### PROOF-ADMIN-METRICS

```bash
node --test scripts/__tests__/collection-condition-ui.test.mjs
node --test scripts/__tests__/admin-governance-ia.test.mjs
pnpm verify:multi-condition-data-capture -- <config-json-path>
```

### PROOF-ADMIN-AI

```bash
node --test scripts/__tests__/speech-ai-assessment-acceptance.test.mjs
pnpm verify:ai-assessment-acceptance -- <config-json-path>
```

### PROOF-ADMIN-GAMES

```bash
node --test scripts/__tests__/browser-pose-game-library-seed.test.mjs
pnpm verify:unity-rhythm-reach-source
pnpm verify:unity-rhythm-reach-webgl-build
```

### PROOF-AI-STT-TTS

```bash
pnpm verify:speech-transcript-acceptance -- <config-json-path>
pnpm verify:tts-speech-output-acceptance -- <config-json-path>
pnpm verify:speech-ai-assessment-acceptance -- <config-json-path>
```

### PROOF-PLAN-MATCHING

```bash
pnpm verify:formal-acceptance-chain -- <config-json-path>
node --test scripts/__tests__/patient-training-task-library.test.mjs
```

### PROOF-REALTIME-CAPTURE

```bash
node --test scripts/__tests__/browser-pose-gameplay-differentiation.test.mjs
node --test scripts/__tests__/phaser-pose-stage.test.mjs
pnpm verify:browser-pose-field-acceptance -- <evidence-json-path> --api-base-url <api-url> --read-credentials <read-credentials-json> --patient-token-ref <secret-ref> --audit-token-ref <secret-ref>
```

### PROOF-PRIVACY-AUDIT

```bash
pnpm delivery:check
node --test scripts/__tests__/sensitive-encryption-boundary.test.mjs scripts/__tests__/customer-acceptance-package-manifest.test.mjs
pnpm verify:customer-acceptance-package-manifest -- <manifest-json-path> --package-root <acceptance-package-dir>
```

### PROOF-FAMILY-SOCIAL

```bash
node --test scripts/__tests__/care-circle-privacy.test.mjs
pnpm test:playwright
```

### PROOF-SOCIAL-SQUARE-BOUNDARY

```bash
node --test scripts/__tests__/care-circle-privacy.test.mjs
node --test scripts/__tests__/customer-docx-coverage-boundary.test.mjs
```

## Customer-Gated Items Not Counted Complete By Source Code Alone

- Wearable physiological data: customer must provide device model, SDK/API/protocol, sampling and threshold definitions, consent wording, and field evidence.
- Production deployment: customer or operations owner must provide infrastructure, HTTPS, database, Redis, backups, monitoring, log retention, secret management, and owner contacts.
- Customer-owned Unity games: customer must provide WebGL build files, manifest, version, licensing proof, and bridge adaptation evidence before they can be accepted as formal content.
- Formal AI/STT/TTS production use: customer must provide provider account, HTTPS endpoints, model versions, `secret-manager://...` key references, runtime key injection, call logs, consent records, and field acceptance evidence.
