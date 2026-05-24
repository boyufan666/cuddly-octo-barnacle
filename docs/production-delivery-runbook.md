# 生产交付 Runbook

本文用于正式上线或试点上线前准备。目标是保证平台能真实收集数据，并满足安全、隐私、审计和可运维要求。

## 交付前置条件

- 客户确认正式域名、服务器、数据库、Redis、对象存储或静态资源部署方式。
- 客户确认隐私协议、知情同意文本、授权版本号和数据留存要求。
- 客户确认 AI/语音服务供应商、调用方式、密钥、额度、部署区域和日志要求。
- 客户确认至少一个正式训练内容的验收标准。
- 客户确认运维责任：备份、监控、故障处理、账号开通和数据导出审批。

## 基础设施

- Web：部署 Next.js 生产构建，使用正式 `NEXT_PUBLIC_API_BASE_URL`。
- API：部署 NestJS 服务，配置正式 `DATABASE_URL`、`REDIS_URL`、`JWT_SECRET`、`WEB_ORIGIN`。
- PostgreSQL：使用正式账号、强密码、独立网络访问策略和定期备份。
- Redis：使用访问控制、持久化策略和内网访问。
- 静态训练资源：Unity WebGL Build、manifest、模型文件和游戏资源必须通过 HTTPS 访问。
- 反向代理：建议使用 Nginx、Caddy 或云厂商网关，统一配置 HTTPS、压缩、上传大小和安全响应头。

## 必须替换的配置

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `WEB_ORIGIN`
- `NEXT_PUBLIC_API_BASE_URL`
- `DEFAULT_PATIENT_PASSWORD`
- PostgreSQL 密码
- Redis 密码或访问策略
- AI/语音服务密钥
- `AI_PROVIDER`
- `AI_MODEL_VERSION`
- `AI_MODEL_ENDPOINT`
- `AI_API_KEY_REF`
- `AI_PROMPT_VERSION`
- `AI_CALL_LOG_RETENTION_DAYS`
- `AI_HUMAN_REVIEW_REQUIRED`
- `SPEECH_PROVIDER`
- `SPEECH_TO_TEXT_ENDPOINT`
- `SPEECH_API_KEY_REF`
- `SPEECH_MODEL_VERSION`
- 对象存储或静态资源访问密钥

不得使用本地 `.env`、固定通用密码、开发数据库或开发 JWT 密钥上线。

## 初始化流程

1. 执行数据库迁移。
2. 使用 `pnpm db:seed:trial` 初始化角色、机构、首个管理员和首个医师。
3. 通过正式后台创建患者、家属、训练内容和授权记录。
4. 使用 `docs/trial-empty-loop-runbook.md` 准备真实环境变量并执行空库闭环验收。
5. 保存验收截图、日志和审计记录。

试点或生产环境不得使用 `pnpm db:seed` 生成患者、评估、训练计划或训练记录。

## AI/语音接入

正式接入前必须确认：

- 语音转文字服务提供商、接口、密钥、费用和部署区域。
- 大模型服务提供商、模型版本、提示词版本、输入输出字段和失败策略。
- 是否允许上传健康数据、语音转写和评估摘要到第三方服务。
- 模型调用日志保存内容、脱敏策略和审计要求。
- 医师是否必须人工确认 AI 生成结果。

生产配置必须显式提供 `AI_PROVIDER`、`AI_MODEL_VERSION`、`AI_MODEL_ENDPOINT`、`AI_API_KEY_REF`、`AI_PROMPT_VERSION`、`AI_CALL_LOG_RETENTION_DAYS`、`AI_HUMAN_REVIEW_REQUIRED`、`SPEECH_PROVIDER`、`SPEECH_TO_TEXT_ENDPOINT`、`SPEECH_API_KEY_REF` 和 `SPEECH_MODEL_VERSION`。`AI_MODEL_ENDPOINT` 与 `SPEECH_TO_TEXT_ENDPOINT` 必须使用正式 HTTPS 地址；供应商、模型、提示词、密钥引用不能包含 `mock`、`demo` 或 `local` 标记；`AI_API_KEY_REF` 与 `SPEECH_API_KEY_REF` 必须使用 `secret-manager://...` 形式的密钥引用，不能把真实密钥值直接写入环境变量；`AI_HUMAN_REVIEW_REQUIRED` 必须为 `true`；调用日志留存天数必须为 30 到 3650 的整数。

未完成上述接入时，只能交付结构化录入和接口边界，不能宣传真实 AI 自动评估已完成。

## 游戏上线

浏览器体感训练上线要求：

- 训练内容在后台发布为 `browser_pose_game`。
- 配置 `gameVersion`、`camera_pose` 和四项动作指标。
- 现场完成摄像头授权、姿态识别、训练结果入库和审计验收。
- 记录浏览器版本、摄像头型号、网络环境和训练数据样例。
- 按 `docs/browser-pose-field-acceptance-runbook.md` 保存实机证据 JSON、截图、录屏和审计关联。
- 使用正式 API 地址、训练记录读取 token 和审计读取 token 执行只读实机验真，证明 evidence 与真实 API 数据一致。

Unity WebGL 上线要求：

- 将 Build 文件放入正式静态资源目录。
- 提供 `manifest.json`，并配置 `manifestUrl`、`buildBaseUrl`、`gameVersion`、`bridgeProtocolVersion=1.0.0`。
- 通过 Bridge 回传真实结构化结果。
- 完成资源完整性、版本匹配、训练结果、审计日志验收。

## 安全与隐私

- 所有正式访问必须使用 HTTPS。
- 后台账号必须分级授权，超级管理员、运营、审计只开放各自权限。
- 患者敏感信息、健康指标、授权记录和训练数据不得出现在前端日志或公开静态资源中。
- 导出必须脱敏并写入审计。
- 授权撤回后，对应 AI、摄像头、家属共享能力必须被阻断。
- 不长期保存完整视频，默认只保存结构化动作指标和必要摘要。

## 监控与备份

- 监控 API 健康检查、登录失败、评估创建、训练 session、结果提交、导出和审计写入。
- 配置 PostgreSQL 每日备份，并定期做恢复演练。
- 记录 API 错误日志，但不得打印密码、token、原始健康敏感数据。
- 配置磁盘、CPU、内存、数据库连接数和 Redis 状态告警。
- 保留关键审计日志，满足客户数据追溯要求。

## 上线验收命令

代码级验收：

```bash
pnpm test:delivery
pnpm delivery:check
pnpm delivery:check:production
pnpm lint
pnpm build
pnpm --filter @rehab-platform/api exec jest --runInBand
```

`pnpm delivery:check:production` 必须在正式 `DATABASE_URL`、`REDIS_URL`、`JWT_SECRET`、`WEB_ORIGIN`、`NEXT_PUBLIC_API_BASE_URL`、`DEFAULT_PATIENT_PASSWORD`、AI 服务配置和语音转写服务配置已由客户或运维显式配置后运行。缺少正式值、仍指向 localhost、使用开发密钥、固定密码、HTTP 地址、mock/demo/local 标记或未要求人工复核时应失败，不允许脚本自行兜底。

真实闭环验收：

```bash
pnpm verify:trial-empty-loop
```

该命令必须显式提供 `TRIAL_VERIFY_*` 环境变量。缺少变量时应失败，不允许自动使用默认账号、默认密码或演示数据。

浏览器体感实机验收：

```bash
pnpm verify:browser-pose-evidence -- <evidence-json-path>
pnpm verify:browser-pose-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com \
  --patient-token <training-record-read-token> \
  --audit-token <audit-read-token>
```

第一个命令只校验现场实机训练后保存的证据 JSON。第二个命令会只读核对截图/录屏文件、训练记录 API 和审计日志 API，不会创建训练数据、不会生成动作指标，也不会替代摄像头和姿态识别采集。缺少正式 HTTPS API、读取 token、附件、训练记录或审计日志时必须失败，不允许改用 seed、本地演示账号或手工构造响应作为通过依据。
