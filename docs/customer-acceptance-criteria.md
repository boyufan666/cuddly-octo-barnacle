# 客户验收标准

本文用于冻结客户验收口径。所有验收均以真实 API、真实数据库、真实浏览器和真实权限为准，不以静态原型、seed 数据或固定演示结果作为通过依据。

客户 `康复平台设计(1).docx` 的逐项交付映射以 `docs/customer-docx-coverage-matrix.md` 为总索引。该矩阵从 `DOCX-USER-LOGIN` 到 `DOCX-SOCIAL-SQUARE` 明确每项客户原文、实现目标、验证命令、交付状态和边界说明；所有验收项均适用其中的 `No fallback allowed` 原则，穿戴设备、生产部署和公开社交广场按矩阵标注为 customer-gated，不得仅凭源码或本地演示宣称完成。

当前 UI 推翻重做最终执行以 `docs/superpowers/plans/2026-06-10-minimal-premium-ui-master-closure-plan.md` 为准，执行名称为 `Complete Minimal Premium UI Overhaul`；`docs/superpowers/plans/2026-06-09-minimal-premium-ui-complete-overhaul-plan.md` 仅作为历史重置证据。客户侧产品口径为：系统围绕潜在患病风险测量、医师复核后的多方案干预、可靠数据采集和可追溯训练结果形成闭环；游戏保持简单，训练内容按 `思维训练` 和 `运动训练` 分类，重点是方案丰富度、干预匹配和数据质量，而不是复杂游戏展示。

## 角色与账号

- 患者可以登录、查看个人信息、签署授权、完成评估、查看推荐方案、开始训练、查看训练结果。
- 患者端最终入口为 `今日 -> 训练 -> 记录 -> 我的`，不展示原始 evidence、供应商 payload、审计 ID 或导出治理。
- 家属端最终入口为 `照护 -> 进展 -> 提醒 -> 我的`；家属只能在患者授权后查看摘要、提醒和进展，不可查看原始评估转写、原始动作指标或编辑方案。
- 医师端最终入口为 `患者 -> 评估 -> 计划 -> 准备 -> 复核`；医师只能查看负责患者的完整业务数据，可以录入评估、复核 AI/STT/量表证据、调整并确认方案，并通过独立 `准备` 工作区为当前生效方案创建正式训练准备/采集批次。
- 管理员端最终入口为 `账号 -> 内容 -> 配置 -> 审计`；管理员可以管理账号、训练内容、供应商/运行时 readiness、审计日志和脱敏导出，供应商 readiness 收纳在 `配置`，脱敏导出收纳在 `审计`，运营统计只能作为治理页内摘要。
- 审计角色只能查看授权范围内审计信息，不可创建患者、发布游戏或导出敏感原始数据。

## AI 评估

- 患者必须完成 `privacy_policy` 和 `ai_processing` 授权后才能创建评估记录。
- 评估记录必须包含 MMSE、CDR、记忆、定向、执行、语言分项。
- AD-8 照护者访谈必须作为正式筛查能力验收：8 个题项必须全部结构化记录，`ad8Total` 必须等于 8 项之和，并由负责医师 `approved` 后才创建正式评估、当前风险评级和分析记录。
- AD-8 正式验收必须通过 `pnpm verify:ad8-caregiver-interview-acceptance -- <config-json-path>`，证明患者已有隐私、AI 处理和家属共享授权，家属摘要可授权访问且脱敏，医生复核后 AD-8 入库，并能反查 `assessment.create` 与 `caregiver.summary.view` 审计日志。
- 当前一期保留“结构化评估录入”能力：医师或评估人员录入 MMSE/CDR、问答转写或评估摘要、分析结论、人工来源、录入人和量表依据；不得把人工录入包装成真实 AI 结果。
- 真实 AI 评估才要求供应商、模型版本、调用 ID、正式 HTTPS endpoint、提示词版本、置信度、调用时间和人工复核记录。
- 系统能生成当前风险等级，并关闭旧的当前风险等级。
- 真实大模型评估必须使用 `production_ai_assessment` 来源，并提供供应商、模型、模型版本、调用 ID、正式 HTTPS endpoint、提示词版本、调用时间和人工复核记录；缺任一项不得创建正式评估记录。AI 草稿也必须在供应商配置、授权和调用证据满足验收要求时，才可作为真实 AI 草稿计入。
- 真实大模型评估必须通过 `pnpm verify:ai-assessment-acceptance -- <config-json-path>` 验收，证明 AI 草稿不入库、医生 `approved` 后才正式入库，并能反查风险评级、AI 分析和审计日志。
- 真实语音评估必须使用 `speech_ai_assessment` 来源，除大模型证据外还必须提供语音识别供应商、语音模型版本、语音调用 ID、正式 HTTPS endpoint，并已签署 `microphone_capture` 授权；缺授权或缺证据必须阻断。
- 若验收“语音输入 + AI 评估 + 正式入库”组合能力，必须通过 `pnpm verify:speech-ai-assessment-acceptance -- <config-json-path>`，证明真实录音经 STT 转写后进入 AI 草稿，医生 `approved` 后以 `speech_ai_assessment` 来源入库，并保留 `{ ai, speech, humanReview }` 证据和三类审计日志。
- 供应商、模型、endpoint、调用 ID 和提示词版本不得包含 `mock`、`demo`、`local`、`manual` 或 `fallback` 标记，不允许把手工录入包装成真实 AI/STT 评估。
- 真实大模型/语音能力上线前，只能表述为“支持接入/结构化录入”，不能表述为“已完成真实 AI 自动评估”。

## TTS 语音输出

- TTS 必须独立于 STT 验收；`speech.requiredForLaunch` 或 `SPEECH_TO_TEXT_ENDPOINT` 不能代表语音输出已完成。
- 客户资料包必须明确 `ai.requiredForLaunch`、`speech.requiredForLaunch` 与 `tts.requiredForLaunch` 都为 `true`，生产环境三个对应变量也都为 `true`。
- TTS 必须提供 `TTS_PROVIDER=xiaomi-mimo-tts`、`TTS_ENDPOINT`、`TTS_MODEL_VERSION`、`TTS_VOICE_ID`、`TTS_OUTPUT_FORMAT`、provider 限制；三项能力共用 `MIMO_API_KEY_REF`、`MIMO_API_KEY_FILE`、approved host 和 Key Value 配额。
- TTS endpoint 必须是 approved MiMo host 上的正式 HTTPS 地址；密钥引用必须是 `secret-manager://...`，运行时密钥只允许由 Render Secret File 注入，不得写入前端、审计日志或交付文档。
- 患者必须签署 `privacy_policy` 与 `ai_processing` 授权后，才能调用 `POST /ai/tts-speech-outputs`。
- TTS 响应必须来自真实供应商音频，包含供应商、模型版本、调用 ID、endpoint 引用、音色、场景、文本哈希和音频摘要。
- 前端只能播放后端返回的供应商音频；不得使用浏览器 `SpeechSynthesis`、系统朗读、预生成音频、静态 mp3、固定音频或人工上传音频作为正式证据。
- 音频必须为平台支持的 `audio/wav` 或 `audio/mpeg`，且 base64 解码后必须与声明格式匹配。
- 成功和失败都必须写入 `ai.tts_speech_output.generate` 审计；审计 metadata 不得包含完整文本、base64 音频、请求/响应原文或密钥。
- TTS 正式现场验收必须执行 `pnpm verify:tts-speech-output-evidence -- <evidence-json-path>` 和 `pnpm verify:tts-speech-output-acceptance -- <config-json-path>`。

## 康复方案

- 生成方案前必须已有患者、必要授权、当前风险评级和至少一个正式训练内容。
- 康复方案验收必须体现潜在患病风险测量后的多方案干预能力：系统可以根据风险等级、评估摘要和正式训练内容形成不同训练安排，并由医师确认后生效。
- 推荐方案最多包含 1-3 个训练内容，并展示推荐原因。
- 医师确认前，方案状态为待确认；医师确认后，方案才成为当前生效方案。
- 医师调整频次、时长、难度和原因后，系统必须保留调整记录。
- 当前推荐算法验收口径为“可解释规则推荐 + 医师确认”，不是协同过滤或疗效预测。

## 体感训练游戏

- 至少一个正式浏览器体感训练内容可完成真实训练。
- 训练游戏验收以简单游戏、稳定采集和方案覆盖为主，不以游戏复杂度作为通过标准；患者可见分类必须包含 `思维训练` 和 `运动训练`，并能表达 `风险评估辅助`、`干预训练`、`数据采集` 等用途。
- 浏览器体感与 Unity WebGL 均可作为训练运行时；后续训练内容不强制 Unity，浏览器体感不是 Unity 失败后的兜底，而是并行可验收运行时。
- 训练开始前必须通过隐私授权、摄像头授权、当前生效方案项和游戏发布状态校验。
- 浏览器必须能识别摄像头并加载姿态识别模型。
- 姿态质量不足时应提示用户调整站位、光线或摄像头，不生成有效训练结果。
- 训练中应有明确的视觉或语音反馈，帮助患者完成动作。
- 训练结果必须包含 `reaction_time_ms`、`target_hit_rate`、`pose_visibility_avg`、`arm_raise_accuracy`。
- Unity 游戏只有在真实 WebGL Build、manifest、真实 Unity runtime 启动、Bridge 回传、训练记录 API 反查、审计日志 API 反查和只读现场验真记录齐备后才能算正式接入。
- Unity WebGL 训练结果必须使用 `source=unity_webgl`，`runtimeType=unity_webgl`，`bridgeProtocolVersion=1.0.0`，不得包含 `mock/demo/seed/fallback/fixed/manual` 标记。

## 数据与审计

- 本期正式采集范围仅包括患者档案与授权、结构化评估分数、AI/STT/TTS 证据元数据、采集条件与摄像头/设备元数据、姿态/游戏指标、动态难度事件、医师复核结论、家属可见脱敏进展、审计与脱敏导出证据；不采集、不展示、不宣称穿戴生理指标，除非客户提供设备型号、SDK/API/协议、授权范围和现场证据后另行验收。
- 不同条件下收集数据必须通过正式采集条件、采集协议和采集批次实现；训练 session、训练结果和动作指标必须能反查到同一个 `collectionBatchId`。
- 缺采集批次、批次与患者/方案/训练内容不匹配、结果回传批次不一致时，系统必须阻断，不得自动创建默认批次或降级为普通训练。
- 采集条件和采集协议不得包含 `mock/demo/local/manual/fallback` 标记，不得把 seed、固定成绩或旧原型数据作为正式采集数据。
- 一条正式业务链必须能通过 `pnpm verify:formal-acceptance-chain -- <config-json-path>` 只读验真，证明同一患者的正式评估、当前方案、训练 session、训练结果、医生复核、家属摘要和审计日志可以相互关联。
- 训练开始、训练结果提交、评估创建、方案推荐、方案确认、授权签署、导出操作必须写入审计日志。
- 授权签署、家属绑定、评估创建、方案推荐、方案确认、训练开始、训练结果提交、训练结果复核和家属摘要查看必须能反查成功审计日志。
- 重复提交同一训练 session 结果应被拒绝。
- 训练结果来源、API 地址、evidence JSON 和审计 metadata 不能包含 `mock/demo/seed/fallback/fixed/manual` 标记，包括拼接词形和 URL 编码写法。
- evidence JSON 和审计 metadata 不得包含 token、密钥、请求/响应正文、原始 payload 或 base64 原始内容；只允许保存必要业务 ID、结构化指标和合法哈希摘要。
- 过短训练、异常反应时间、低质量姿态数据应被标记或阻断。
- 患者、家属、医师、管理员的数据访问范围必须符合角色权限。

## 隐私与导出

- 用户首次使用相关能力前必须签署对应授权。
- 撤回授权后，对应能力应被阻断。
- 家属端只展示摘要，不展示原始转写、原始动作指标和敏感健康数据。
- 导出数据必须脱敏，姓名、手机号、照护人信息和原始摘要不得直接泄露。
- 导出必须填写原因并写入审计日志，审计中不保存原始导出原因全文。
- 本地契约验收必须证明家属授权摘要可读且脱敏、家属完整训练记录被拒、撤回 `caregiver_sharing` 后家属摘要被阻断，并能反查 `caregiver.summary.view`、`access.denied`、`consent.revoke` 审计日志。

## 环境与设备

- 正式环境必须使用 HTTPS 和正式域名。
- 推荐浏览器为 Chrome、Edge 或 Safari 的较新版本，现场验收需记录实际版本。
- 摄像头需支持稳定 640x480 或以上画面。
- 现场网络应能访问 Web、API、姿态识别模型资源和静态训练资源。
- 若客户要求内网部署，应提前确认模型资源、依赖包和 Unity 静态资源的离线部署方案。

## 验收证据

以下仅为基础附件，不替代各专项 runbook、API 反查和只读验真；AI/STT/TTS、Browser Pose、Unity、隐私审计仍必须分别按对应脚本和现场证据通过。

- 每个角色按最终 IA 至少保留主入口截图或 smoke 记录：患者 `今日 / 训练 / 记录 / 我的`，医师 `患者 / 评估 / 计划 / 准备 / 复核`，家属 `照护 / 进展 / 提醒 / 我的`，管理员 `账号 / 内容 / 配置 / 审计`。
- 一条从建档到训练结果入库的完整业务数据记录。
- 一份后台审计日志截图或导出样例。
- 一份脱敏导出样例。
- 一份浏览器体感游戏实机训练记录，先通过 `pnpm verify:browser-pose-evidence -- <evidence-json-path>` 完成 JSON 自检，再显式设置 `BROWSER_POSE_PATIENT_ACCOUNT`、`BROWSER_POSE_PATIENT_PASSWORD`、`BROWSER_POSE_AUDIT_ACCOUNT`、`BROWSER_POSE_AUDIT_PASSWORD`，并执行 `pnpm verify:browser-pose-field-acceptance -- <evidence-json-path> --api-base-url <正式 API>` 完成 Cookie+CSRF 只读实机验真。
- 如果接入 TTS，则需要 TTS evidence JSON、供应商调用 ID、播放截图或录屏、`POST /ai/tts-speech-outputs` 响应摘要、`ai.tts_speech_output.generate` 审计日志反查记录和 `pnpm verify:tts-speech-output-*` 验收结果。
- 如果接入 Unity，则需要 Unity Build 文件清单、manifest、Bridge 回传日志、训练结果记录、截图/录屏、训练记录 API 反查记录和审计日志 API 反查记录。

最终客户验收包必须提供 `docs/templates/customer-acceptance-package-manifest.template.json` 填写后的 manifest，并执行 `pnpm verify:customer-acceptance-package-manifest -- <manifest-json-path> --package-root <customer-acceptance-package-dir>`。manifest 只保存证据文件相对路径、摘要、验收时间、范围声明和脱敏/审计确认，不保存真实 token、完整转写、TTS 全文、请求/响应正文、base64 音频或原始训练载荷；缺文件、摘要不匹配、出现占位符或伪数据标记时不得通过客户验收。`emptyRealLoop.acceptanceReportPath` 必须是编排器生成的完整 PASSED 报告，包含非空且全部通过的步骤、与步骤一致的 summary 和空 failures；包内所有文件的真实路径必须仍位于 package root，符号链接不得指向包外文件。

浏览器体感实机训练记录必须按 `docs/templates/browser-pose-evidence.template.json` 保存证据 JSON，并包含现场截图、训练过程录屏或录像、`training_session.start` 和 `training_result.submit` 审计日志关联。只读实机验真必须同时证明附件文件存在且非空、训练记录 API 中 session/result/gameContent/motionMetrics 与 evidence 一致、审计日志 API 中审计 ID/动作/目标/结果与 evidence 一致；缺任一项不得通过客户验收。验真失败时不得输出 HTTP 响应体或 mismatch 原值。

Unity WebGL 正式现场验收必须按 `docs/templates/unity-field-evidence.template.json` 保存证据 JSON，执行 `pnpm verify:unity-field-evidence -- <evidence-json-path>`，显式设置 `UNITY_FIELD_PATIENT_ACCOUNT`、`UNITY_FIELD_PATIENT_PASSWORD`、`UNITY_FIELD_AUDIT_ACCOUNT`、`UNITY_FIELD_AUDIT_PASSWORD`，再执行 `pnpm verify:unity-field-acceptance -- <evidence-json-path> --api-base-url <正式 API>`。只读验真通过隔离的患者/审计 Cookie+CSRF 会话执行 `GET` 查询和本地附件读取，不创建患者、不创建训练 session、不提交训练结果、不补写动作指标、不补审计日志；缺 API、缺任一 Unity 专属账号密码、Cookie/CSRF 登录失败、缺附件、缺训练记录、缺审计日志或缺真实 Unity WebGL runtime 时不得通过客户验收。mock、demo、seed、fallback、fixed、manual、本地脚本样例和固定成绩不得作为正式 Unity 证据；验真失败时不得输出 HTTP 响应体或 mismatch 原值。

TTS 语音输出正式现场验收必须按 `docs/templates/tts-speech-output-evidence.template.json` 保存证据 JSON，并执行 `pnpm verify:tts-speech-output-evidence -- <evidence-json-path>` 和 `pnpm verify:tts-speech-output-acceptance -- <config-json-path>`。现场 API 验收会调用平台 `POST /ai/tts-speech-outputs`，反查授权、供应商音频和审计日志；缺 HTTPS API、缺 token、缺授权、缺供应商音频、音频格式不匹配、缺成功审计日志或证据中含 mock/demo/seed/fallback/fixed/manual 时不得通过客户验收。
