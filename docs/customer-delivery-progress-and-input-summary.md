# 客户交付推进与资料确认摘要

本文用于向客户或项目负责人说明当前交付状态、下一步上线门禁、客户需要补充的资料，以及 AI/语音免费优先选型口径。它不是替代验收脚本的口头说明；正式上线仍以客户资料包、生产环境变量、实机验收、调用日志和审计记录为准。

## 当前交付状态

- 已具备全栈 MVP 骨架：Web 前端、NestJS API、Prisma 数据模型、PostgreSQL/Redis 本地基础设施。
- 已具备四角色业务闭环基础：患者、家属、医师、管理员的账号权限、患者建档、授权、评估、康复计划、训练记录、审计和脱敏导出。
- 已具备浏览器体感训练主线：`browser_pose_game` 训练内容、动作指标结构、训练结果入库、浏览器体感 evidence 自检和只读实机验真脚本。
- 已具备客户资料包和生产门禁：`verify:customer-production-input` 校验客户资料，`delivery:check:production -- --customer-input customer-production-input.json` 校验生产环境和客户资料包一致性。
- 已具备免费优先 AI/语音选型说明：优先评估客户已有星火/讯飞，其次评估阿里云百炼/通义千问，低成本备选 DeepSeek、智谱、Kimi/Moonshot。

## 不能直接宣称完成的能力

- 不能宣称真实 AI/语音评估已完成，除非客户提供正式供应商账号、HTTPS endpoint、`secret-manager://...` 密钥引用、模型版本、调用日志、第三方数据处理授权和医师人工复核证据。
- 不能宣称 Unity 正式游戏库已完成，除非客户提供 Unity WebGL Build、`manifest.json`、授权证明和 Bridge 回传验收，或另立 Unity 自研交付任务。
- 不能宣称生产上线完成，除非正式域名、HTTPS、服务器、数据库、Redis、备份、监控、密钥托管和审计留存均已配置并通过门禁。
- 不能用 seed、mock、demo、localhost、个人 token、临时代理、手工改字段或固定成绩作为正式验收依据。

## 客户必须先确认的上线范围

客户资料包中的 `ai.requiredForLaunch` 和 `speech.requiredForLaunch` 必须明确为布尔值 `true` 或 `false`，并与生产环境变量 `AI_REQUIRED_FOR_LAUNCH`、`SPEECH_REQUIRED_FOR_LAUNCH` 完全一致。

- `true` 表示该真实能力纳入本次上线范围，必须提供正式供应商配置和验收证据。
- `false` 表示该真实能力不纳入本次上线范围，只能交付结构化录入和接口边界。
- `false` 不是兜底，不允许在真实服务失败时自动降级为 mock，也不能宣传为真实 AI/语音能力。
- 对应 scope 为 `false` 时，生产环境不得残留该能力的半配置，例如 `AI_PROVIDER`、`AI_MODEL_ENDPOINT`、`SPEECH_PROVIDER` 或 `SPEECH_TO_TEXT_ENDPOINT`。

## 最优先向客户索取的资料

1. 正式 Web 域名、API 域名、服务器方案、HTTPS 证书、数据库、Redis、备份、监控和运维负责人。
2. 隐私协议正文、版本号、生效日期、授权撤回规则、真实患者数据采集范围、数据留存周期和脱敏导出审批人。
3. 超级管理员、运营管理员、审计查看人员、医师账号清单，以及患者和家属账号开通或绑定方式。
4. 浏览器体感验收设备、摄像头型号、目标浏览器、网络环境、训练场地光线和现场验收负责人。
5. 是否已有 Unity WebGL 游戏；如有，提供 Build、`manifest.json`、版本号、素材/插件授权证明和 Bridge 适配负责人。
6. 是否要求本期上线真实 AI/语音能力；如果要求，继续提供下面 AI/语音资料。

## AI/语音免费优先资料

如果客户要求本期上线真实 AI/语音能力，优先确认这些资料：

- 是否已有星火/讯飞账号，账号主体是客户公司还是个人，是否能提供控制台截图。
- 星火或讯飞语音是否有免费额度，额度大小、有效期、QPS、并发、覆盖模型、是否允许试点或生产使用。
- 免费额度用完后是否自动停用，还是按量扣费；是否能配置用完即停。
- 是否允许把健康数据、问答转写和评估摘要发送给对应 AI/语音供应商。
- 正式 HTTPS endpoint、模型版本、语音识别版本、提示词版本、调用日志样例。
- 密钥是否能托管在客户正式密钥系统中，并只向项目提供 `secret-manager://...` 引用。
- 医师人工复核负责人、复核记录保存方式和日志留存天数。

免费优先建议顺序：

1. 客户已有星火/讯飞：优先 `讯飞星火大模型 + 讯飞语音识别`。
2. 客户已有阿里云或能开通阿里云：评估 `阿里云百炼 / 通义千问 + 百炼语音识别`。
3. 客户只追求低成本文本大模型：评估 DeepSeek、智谱 GLM、Kimi/Moonshot，语音仍建议另接讯飞或阿里云。
4. OpenAI 不作为免费优先默认方案；除非客户接受境外服务、合规审查和付费预算。

## 推荐推进顺序

1. 客户填写 `customer-production-input.json`，明确 AI/语音、Unity、浏览器体感、真实数据采集范围。
2. 执行 `pnpm verify:customer-production-input -- customer-production-input.json`，资料不合格先退回补充。
3. 客户或运维配置正式生产环境变量，执行 `pnpm delivery:check:production -- --customer-input customer-production-input.json`。
4. 使用 `pnpm db:seed:trial` 初始化试点基础角色和账号，不创建患者、评估、训练记录等业务数据。
5. 执行空库真实闭环验收，确保建档、授权、结构化评估、计划、训练和审计均使用真实 API。
6. 完成浏览器体感实机验收，保存 evidence JSON、截图、录屏、训练记录 API 和审计日志 API 验真结果。
7. 如 AI/语音 scope 为 `true`，完成真实供应商调用、日志留存、授权记录和医师人工复核验收。
8. 如 Unity 为本期 scope，完成 WebGL 资源完整性、Bridge 回传、训练结果和审计验收。

## 最终交付证据包

- `customer-production-input.json` 及资料包校验通过记录。
- `pnpm delivery:check:production -- --customer-input customer-production-input.json` 通过记录。
- 正式域名、HTTPS、数据库、Redis、备份、监控和密钥托管配置证据。
- 隐私协议、知情同意、授权撤回、家属共享、导出脱敏和审计日志证据。
- 空库闭环验收记录。
- 浏览器体感 evidence JSON、截图、录屏和只读实机验真记录。
- 如接入真实 AI/语音：供应商控制台截图、调用日志、模型版本、提示词版本、人工复核记录和授权记录。
- 如接入 Unity：WebGL Build、manifest、授权证明、Bridge 回传日志和训练结果记录。
