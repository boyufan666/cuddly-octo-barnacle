# 阿尔茨海默病 AI+体感康复平台

一期工程采用全栈 monorepo，目标是跑通真实数据闭环：

- `apps/web`：Next.js 患者端、家属端、医师端、管理治理端
- `apps/api`：NestJS API，负责认证、权限、评估、康复计划、训练采集、审计与导出
- `packages/db`：Prisma schema、迁移与本地初始化脚本
- `infra/docker-compose.yml`：本地开发用 PostgreSQL

## 本地开发启动

1. 准备环境变量：

```bash
cp .env.example .env
```

`.env.example` 只提供字段结构。试点或生产环境必须替换为独立生成的密钥、数据库凭证、域名和 CORS 配置。

2. 启动本地 PostgreSQL：

```bash
pnpm infra:up
```

如果提示 Docker daemon 未运行，请先启动 Docker Desktop 或 Colima。

3. 生成 Prisma Client、执行迁移和本地初始化：

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

`pnpm db:seed` 仅用于本地开发与自动化验收，不作为试点或生产数据初始化方案。
执行前必须显式配置 `DEFAULT_PATIENT_PASSWORD`、`SENSITIVE_DATA_KEY_REF` 和
`SENSITIVE_DATA_KEY`；seed 使用的两个敏感数据密钥变量必须与 API 运行时完全一致。
该默认入口继续创建完整演示数据，包括已完成评估、当前风险、康复计划和训练记录；客户重新部署不得使用该入口。

试点环境只初始化机构、平台管理账号和首个医师账号时，使用：

```bash
pnpm db:seed:trial
```

该脚本要求显式提供 `TRIAL_*`、`SENSITIVE_DATA_KEY_REF` 和
`SENSITIVE_DATA_KEY` 环境变量，不创建患者、评估、康复计划或训练记录。两个敏感数据密钥变量必须与 API 运行时完全一致。
完整步骤和验收边界见 `docs/trial-initialization-runbook.md`。

4. 启动前后端：

```bash
pnpm dev
```

- Web: `http://localhost:3000`
- API liveness: `http://localhost:4000/health/live`

## 客户重新部署初始化

客户重新部署并需要患者、家属、医师及管理账号可直接登录时，必须使用客户专用入口：

```bash
pnpm db:migrate:deploy
pnpm db:seed:customer
```

`pnpm db:seed:customer` 只接受执行过当前 Prisma migrations、且除 `_prisma_migrations` 外所有业务表均为空的新数据库。它会在同一个串行化事务中检查空库并写入数据；任一业务表已有记录时会直接失败，不会删除、合并或覆盖既有数据，也不会改走默认 seed、trial seed 或其他初始化流程。失败后应修正配置或更换新的空数据库，不得在已有客户业务库上重试。

客户入口创建以下基线：

- 1 个客户机构，以及超级管理员、运营、审计、医师、患者、家属共 6 个可登录账号；每个账号首次登录必须重置密码。
- 1 份患者基本资料、责任医师关系、家属授权，以及隐私、AI、摄像头、麦克风和家属共享授权。
- 9 个 `released`、`production`、`published`、`active` 的正式游戏。
- 不创建已完成评估、当前风险、AI 分析、康复计划、计划调整、训练 session、训练结果或动作指标；患者登录后必须先进入 AI 评估。

除 `DATABASE_URL`、`SENSITIVE_DATA_KEY_REF` 和 `SENSITIVE_DATA_KEY` 外，必须逐项显式配置：

```text
CUSTOMER_SEED_CONFIRM_EMPTY_DATABASE=I_UNDERSTAND_CUSTOMER_SEED_REQUIRES_A_NEW_EMPTY_DATABASE
CUSTOMER_ORG_CODE
CUSTOMER_ORG_NAME
CUSTOMER_ORG_TYPE

CUSTOMER_ADMIN_ACCOUNT
CUSTOMER_ADMIN_DISPLAY_NAME
CUSTOMER_ADMIN_MOBILE_PHONE
CUSTOMER_ADMIN_INITIAL_PASSWORD

CUSTOMER_OPERATOR_ACCOUNT
CUSTOMER_OPERATOR_DISPLAY_NAME
CUSTOMER_OPERATOR_MOBILE_PHONE
CUSTOMER_OPERATOR_INITIAL_PASSWORD

CUSTOMER_AUDITOR_ACCOUNT
CUSTOMER_AUDITOR_DISPLAY_NAME
CUSTOMER_AUDITOR_MOBILE_PHONE
CUSTOMER_AUDITOR_INITIAL_PASSWORD

CUSTOMER_DOCTOR_ACCOUNT
CUSTOMER_DOCTOR_DISPLAY_NAME
CUSTOMER_DOCTOR_MOBILE_PHONE
CUSTOMER_DOCTOR_INITIAL_PASSWORD
CUSTOMER_DOCTOR_TITLE
CUSTOMER_DOCTOR_DEPARTMENT

CUSTOMER_PATIENT_ACCOUNT
CUSTOMER_PATIENT_NAME
CUSTOMER_PATIENT_MOBILE_PHONE
CUSTOMER_PATIENT_INITIAL_PASSWORD
CUSTOMER_PATIENT_GENDER
CUSTOMER_PATIENT_AGE
CUSTOMER_PATIENT_MEDICAL_RECORD_NO

CUSTOMER_CAREGIVER_ACCOUNT
CUSTOMER_CAREGIVER_NAME
CUSTOMER_CAREGIVER_MOBILE_PHONE
CUSTOMER_CAREGIVER_INITIAL_PASSWORD
CUSTOMER_CAREGIVER_RELATION
```

账号必须为 4–32 位字母、数字、下划线、点或短横线；6 个账号、手机号和初始密码必须分别互不相同。`CUSTOMER_PATIENT_GENDER` 只能是 `female`、`male` 或 `unspecified`，年龄必须是 1–120 的整数。所有文本都拒绝首尾空格，所有初始密码必须满足 8–128 位密码策略。客户入口不读取 `DEFAULT_PATIENT_PASSWORD`。

## 客户 Mac 一键启动

首次从 GitHub 克隆后，客户或运维先准备 Node.js `24.14.1`、pnpm `10.29.3`、Docker Desktop，并在项目根目录执行：

```bash
pnpm install --frozen-lockfile
cp .env.example .env
```

然后填写本节列出的基础字段和完整 MiMo AI/STT/TTS 字段。新安装必须使用客户专用的空数据库，不得复用开发机的 `rehab_platform` 数据库。需要本地演示 seed 数据时，确认 `DEFAULT_PATIENT_PASSWORD` 后显式执行 `pnpm db:seed`；客户重新部署必须按“客户重新部署初始化”一节执行 `pnpm db:seed:customer`。`pnpm db:seed:trial` 和受控 production bootstrap 只覆盖各自既有的小范围账号开通场景，不能替代客户完整基线初始化。启动器不会自动初始化账号或覆盖数据库。

客户 Mac 使用项目根目录的 `一键启动康复平台.command`。双击启动前，必须由客户或运维在项目根目录的 `.env` 中显式填写以下基础字段：

```text
DATABASE_URL
JWT_SECRET
WEB_ORIGIN
PORT
NEXT_PUBLIC_API_BASE_URL
COOKIE_SECURE
PUBLIC_CREDENTIAL_THROTTLE_LIMIT
PUBLIC_CREDENTIAL_THROTTLE_TTL_MS
SENSITIVE_DATA_KEY_REF
SENSITIVE_DATA_KEY
POSTGRES_PASSWORD
```

首次在新空数据库上部署客户基线时，还必须填写上一节列出的全部 `CUSTOMER_*` 字段，并在项目根目录的终端中显式执行：

```bash
./scripts/start-customer-mac.sh --initialize-customer
```

该命令会先执行迁移，再只执行 `pnpm db:seed:customer`，随后构建并启动服务。初始化成功后，后续日常启动不带参数，直接双击 `一键启动康复平台.command`；普通启动不会再次执行任何 seed。客户初始化失败时不会改用默认演示 seed，也不会自动删除或覆盖数据库。

- `COOKIE_SECURE` 只能精确填写 `true` 或 `false`。HTTPS 填 `true`；本地 HTTP 可由用户显式填写 `COOKIE_SECURE=false`，启动器不会根据 URL 推断。
- 客户 Mac 启动器的 Web 端口固定为 `3000`；`PORT` 是 API 端口，必须是 `1` 到 `65535` 的未占用端口，通常填写 `4000`，不能填写 `3000`。
- `PUBLIC_CREDENTIAL_THROTTLE_LIMIT` 与 `PUBLIC_CREDENTIAL_THROTTLE_TTL_MS` 必须是 `1` 到 `9007199254740991` 之间、不带符号和前导零的 base-10 正安全整数。
- `SENSITIVE_DATA_KEY_REF` 必须是非空且没有首尾空格的精确密钥引用。
- `SENSITIVE_DATA_KEY` 必须是 canonical base64 编码，解码后恰好为 32 bytes。可由运维执行 `openssl rand -base64 32` 生成后显式填入。
- `POSTGRES_PASSWORD` 必须显式非空；启动器校验通过后会将其导出给 Docker Compose 子进程。

启动器不会生成默认值、不会修改 `.env`、不会兼容旧变量，也不会在缺失配置时继续执行。任一字段缺失或不合法时，会在 Docker、构建、进程启动和端口操作前给出中文修复提示。

启动成功后访问 `http://localhost:3000`。若要确认 AI、语音识别和语音合成供应商配置，先执行 `pnpm verify:mimo:connectivity`；该命令只验证真实供应商响应，不产生患者临床记录。

### 本次修复版客户重新部署顺序

本次修复调整了患者首屏和业务状态链路：患者先完成真实 AI 对话评估，提交后由医师复核并确认正式评估，再由医师生成、调整和确认康复方案，患者训练完成后查看真实训练反馈。不要在旧的演示数据库上直接执行客户初始化，否则旧的完成评估和康复计划仍可能保留。

安全重新部署按以下顺序执行：

1. 在旧项目目录先执行 `./scripts/stop-customer-mac.sh`；如需停止 Docker 服务，再执行 `pnpm infra:down`。这两步不会删除旧数据。
2. 将本次交付包解压到新的项目目录；不要复制旧目录的 `infra/data/postgres`、`.env`、`logs` 或 `.customer-runtime`。
3. 在新目录执行 `pnpm install --frozen-lockfile`，复制 `.env.example` 为 `.env`，填入基础运行配置、真实 MiMo 配置和全部 `CUSTOMER_*` 初始账号配置。
4. 先执行 `pnpm verify:mimo:connectivity`，确认 AI、STT、TTS 均为真实供应商连通；失败时停止，不进入临床数据初始化。
5. 仅在确认新目录使用的是已迁移的全新空数据库后执行 `./scripts/start-customer-mac.sh --initialize-customer`。该命令只执行客户 seed；任何失败都会停止，不会改用 demo seed、删除数据库或覆盖已有业务数据。
6. 看到 `Startup complete` 后访问 `http://localhost:3000`，按客户验收流程依次用患者、医师、家属、管理员、运营和审计账号检查权限与数据范围。
7. 首次初始化成功后的日常启动不再带参数，双击 `一键启动康复平台.command` 或执行 `./scripts/start-customer-mac.sh` 即可；退出项目执行 `./scripts/stop-customer-mac.sh`，Docker 数据库按需执行 `pnpm infra:down`。

如果客户必须保留旧数据库，应先备份并另行设计数据迁移验收，不能把 `--initialize-customer` 当作原地升级命令。

## 本地初始化账号

以下账号仅用于本地开发和验收脚本，试点/生产环境必须通过正式账号开通流程创建，不得使用固定密码。

| 角色         | 本地账号       |
| ------------ | -------------- |
| 患者         | `patient001`   |
| 家属         | `caregiver001` |
| 医师         | `doctor001`    |
| 平台管理人员 | `admin`        |
| 运营人员     | `operator001`  |
| 审计查看人员 | `auditor001`   |

本地初始化密码由 seed 脚本设置，正式交付时应由客户或运维人员按安全策略重置。

## 试点初始化变量

`pnpm db:seed:trial` 至少需要：

```text
DATABASE_URL
SENSITIVE_DATA_KEY_REF
SENSITIVE_DATA_KEY
TRIAL_ORG_CODE
TRIAL_ORG_NAME
TRIAL_ORG_TYPE
TRIAL_ADMIN_ACCOUNT
TRIAL_ADMIN_DISPLAY_NAME
TRIAL_ADMIN_INITIAL_PASSWORD
TRIAL_DOCTOR_ACCOUNT
TRIAL_DOCTOR_DISPLAY_NAME
TRIAL_DOCTOR_INITIAL_PASSWORD
TRIAL_DOCTOR_TITLE
TRIAL_DOCTOR_DEPARTMENT
```

`SENSITIVE_DATA_KEY_REF` 必须是非空且无首尾空格的精确密钥引用；
`SENSITIVE_DATA_KEY` 必须是 canonical base64，解码后恰好为 32 bytes。两者缺失或格式错误时，脚本会在任何数据库写入前直接失败。

可选变量：

```text
TRIAL_ADMIN_MOBILE_PHONE
TRIAL_DOCTOR_MOBILE_PHONE
```

## 当前已落地能力

- 一次性交付 Web 信息架构已收敛为四类角色工作流：患者 `我的 -> 今日 -> 训练 -> 记录`，医师 `患者队列 -> 评估复核 -> 计划管理 -> 训练复核`，管理员 `账号治理 -> 内容治理 -> 供应商治理 -> 审计治理 -> 导出治理`，家属 `照护中心 -> 进展 -> 注意事项 -> 个人资料`。
- 统一账号登录、角色识别和数据范围控制
- 患者建档、知情同意、家属授权绑定
- 评估记录、风险评级、康复方案推荐与医师确认
- 浏览器体感训练壳、结构化训练结果提交、动作指标入库
- 家属摘要查看、脱敏数据导出、审计日志查询
- 训练结果幂等、异常数据标记、授权撤回阻断、医师患者归属校验
- 本地契约验收覆盖家属摘要脱敏、家属越权拒绝、授权撤回阻断、异常训练复核和对应审计反查
- 浏览器体感 evidence JSON 自检与只读实机验真脚本，支持核对附件文件、训练记录 API 和审计日志 API
- Unity WebGL evidence JSON 自检与只读现场验真脚本，支持核对真实 Unity runtime、Bridge 事件、附件文件、训练记录 API 和审计日志 API
- 训练结果页支持审计自动聚合：仅匹配页面已加载的真实成功审计日志，辅助写入 evidence 的审计 ID；正式训练内容现场验收只接收有效、非异常样本，异常复核审计通过 `pnpm verify:contracts` 验收
- 语音转写 evidence JSON 自检与现场 API 验收脚本，支持核对真实录音文件、三项授权、供应商调用证据和审计日志 API
- AI 评估草稿到正式评估验收脚本，支持核对真实 AI 草稿、医生复核批准、正式评估入库、风险评级、AI 分析和审计日志
- 正式业务链只读验真脚本，支持核对同一患者的授权、评估、方案、训练、医生复核、家属摘要和审计日志是否相互关联
- 多采集条件数据只读验真脚本，支持核对至少两组不同采集条件下的 `collectionBatchId -> session -> result -> motionMetrics` 链路和审计日志
- AD-8 照护者访谈正式验收脚本，支持核对授权家属摘要、8 个 AD-8 题项、医生复核、风险评级和审计日志
- 语音转写到 AI 评估正式入库组合验收脚本，支持核对 `STT -> AI 草稿 -> 医生 approved -> speech_ai_assessment 入库 -> 三类审计日志`
- TTS 语音输出接口 `POST /ai/tts-speech-outputs`、前端播放入口、evidence JSON 自检与现场 API 验收脚本，支持核对小米 MiMo TTS 供应商音频、播放证据和审计日志
- 已实现平台接入小米 MiMo AI/STT/TTS 的严格调用链路；正式交付需通过真实客户账号、运行时密钥、供应商调用日志和验收脚本。
- 语音转写接入边界接口 `POST /ai/assessment-speech-transcripts`：只做权限、三项授权、正式 STT 配置和音频约束校验；未接入客户正式语音供应商协议时会硬阻断，不产生语音转文字或语音合成结果
- 前端入口回归能力：`pnpm test:playwright` 使用真实浏览器验证 14 个核心页面入口、AI/STT/TTS、Unity WebGL、浏览器体感、家属协同、脱敏导出和审计入口不丢失；仅验证入口与关键文案，不验证供应商调用、采集、入库或现场闭环

## 仍需补齐的交付项

- 真实 AI/STT/TTS 现场验收证据：模型版本、密钥托管、调用记录、供应商协议、真实音频/语音输出证据和审计反查。
- 至少 1 个正式可训练内容的实机验收：摄像头授权、姿态识别、结果生成、入库与审计。
- Unity WebGL 正式现场验收：真实 WebGL runtime 启动、Bridge 回传、训练结果入库和审计反查。仓内 Build 与 manifest 自检不能替代现场验收。
- 生产部署配置为客户资料门禁：HTTPS、域名、CORS、强密钥、备份、监控、日志留存、密钥托管和运维责任人。
- 生产依赖 SBOM 与许可证批准为上线门禁：必须在 Render 等价 Linux CI 的冻结安装树中生成，并由客户安全负责人批准当前锁文件的全部许可证表达式。执行说明见 `docs/supply-chain-license-policy-runbook.md`，审批模板见 `docs/templates/customer-license-policy.template.json`。
- 穿戴设备为客户资料门禁；未提供设备型号、SDK/API/协议、采样规则、指标阈值、授权范围和现场证据前，不采集也不声明穿戴生理指标。
- 公开社交广场不计入本期完成范围；本期交付为患者授权下的私有照护圈。公开社交需客户确认可见人群、审核机制、举报/拉黑、隐私协议、临床隐私审查、审计和留存责任后另行验收。
- 试点后续正式数据进入流程：患者、训练内容、隐私协议版本与真实业务数据采集

生产环境将 `AI_REQUIRED_FOR_LAUNCH`、`SPEECH_REQUIRED_FOR_LAUNCH`、`TTS_REQUIRED_FOR_LAUNCH` 和 `AI_HUMAN_REVIEW_REQUIRED` 固定为 `true`。AI、音频理解和 TTS 分别只能使用 `xiaomi-mimo`、`xiaomi-mimo-audio-understanding`、`xiaomi-mimo-tts`；启动时要求客户批准的 HTTPS host、MiMo Secret File、Key Value 配额和受控 provider 限制。

正式交付必须使用客户 MiMo 账号、`MIMO_API_KEY_REF` 与 `/etc/secrets/mimo_api_key`、模型/提示词/音色、真实录音与语音输出、调用日志、最小化 telemetry、医生人工复核和审计反查。缺任一项时生产检查与客户验收硬阻断；不得关闭能力、切换供应商、使用浏览器本地语音或生成伪结果。详见 `docs/speech-provider-readiness-notes.md`。

## 数据采集与隐私口径

平台当前采集和保存的正式数据范围包括：患者档案与授权记录、结构化评估分数、AI/STT/TTS 证据元数据、采集条件与摄像头/设备元数据、浏览器体感或 Unity 训练指标、动态难度事件、医师复核结论、家属可见脱敏进展、审计日志和脱敏导出证据。证据包和审计 metadata 不保存真实 token、密钥、完整转写、TTS 全文、请求/响应正文、base64 音频或原始训练载荷。

浏览器体感与 Unity WebGL 均可作为训练运行时，后续训练内容不强制使用 Unity。摄像头或游戏运行时可记录运动强度、轨迹、反应、准确率、完成率和质量标记，但不得把这些指标改名为穿戴生理数据。穿戴生理指标仅在客户提供设备与现场证据后另行接入和验收。

客户资料包可从模板 `docs/templates/customer-production-input.template.json` 复制后填写。模板文件只展示字段结构，原样不会通过正式资料校验；必须替换为客户确认后的正式资料，并执行：

```bash
pnpm verify:customer-production-input -- <customer-production-input.json>
```

该命令只校验客户材料和证据完整性，不能替代 `pnpm delivery:check:production`、真实 AI/语音调用验收或浏览器体感实机验真。

AI 评估正式验收必须执行：

```bash
pnpm verify:ai-assessment-acceptance -- <config-json-path>
```

配置可从 `docs/templates/ai-assessment-acceptance-config.template.json` 复制后填写；模板中的占位符必须替换为现场真实 API、token、患者 ID、转写/摘要和医生复核信息。

该验收会通过平台 API 调用 `POST /ai/assessment-drafts` 和 `POST /assessments`，证明 AI 只生成待医生复核草稿，医生 `approved` 后才创建正式评估、风险评级和 AI 分析记录，并反查审计日志。脚本不会直接读取供应商密钥，不会补写审计日志，不会把失败转成成功；缺正式 HTTPS API、缺 token、缺授权、缺供应商调用证据、缺人工复核批准或缺审计日志时必须失败。

语音转写正式现场验收必须先执行 JSON 自检，再执行真实 API 验收：

```bash
pnpm verify:speech-transcript-evidence -- <evidence-json-path>
pnpm verify:speech-transcript-acceptance -- <config-json-path>
```

现场 API 配置可从 `docs/templates/speech-transcript-acceptance-config.template.json` 复制后填写；录音路径必须指向真实非空音频文件。

语音转写现场验收会读取一份真实录音文件，通过平台 API 提交到 `POST /ai/assessment-speech-transcripts`，并反查患者授权和审计日志。它不会直接调用供应商密钥，不会创建正式评估记录，不会生成 AI 草稿，不会补写审计日志。缺正式 HTTPS API、缺 token、缺真实录音文件、缺 `microphone_capture` 授权、缺供应商调用证据或缺成功审计日志时必须失败。

若本期把“语音输入 + AI 评估 + 正式评估入库”作为一个正式能力验收，还必须执行组合验收：

```bash
pnpm verify:speech-ai-assessment-acceptance -- <config-json-path>
```

组合验收配置可从 `docs/templates/speech-ai-assessment-acceptance-config.template.json` 复制后填写；它必须使用同一真实患者、真实录音和当前 doctor token 对应医生复核人。

该命令会读取真实录音文件，依次调用语音转写、AI 草稿和正式评估创建 API，要求最终 `rawInputSummary.source=speech_ai_assessment`，并保留 `{ ai, speech, humanReview }` 证据结构。缺三项授权、缺语音/AI 供应商证据、草稿阶段误创建正式评估、人工复核人不匹配、缺风险评级/AI 分析/审计日志时必须失败。

脚本文件：`scripts/verify-speech-ai-assessment-acceptance.mjs`

TTS 语音输出正式现场验收必须先执行 JSON 自检，再执行真实 API 验收：

```bash
pnpm verify:tts-speech-output-evidence -- <evidence-json-path>
pnpm verify:tts-speech-output-acceptance -- <config-json-path>
```

现场 API 配置可从 `docs/templates/tts-speech-output-acceptance-config.template.json` 复制后填写；`text` 必须是现场真实播报内容，不能使用固定演示文本替代验收。

TTS 验收会通过平台 API 调用 `POST /ai/tts-speech-outputs`，确认后端调用真实 TTS 供应商、返回 provider 音频并在前端播放，同时反查 `ai.tts_speech_output.generate` 审计日志。脚本不会直接读取供应商密钥，不接受浏览器本地朗读、预生成音频或固定音频作为正式证据。

完整空库真实闭环交付验收可使用总编排器统一执行：

```bash
pnpm verify:empty-real-loop -- <orchestrator-config-json>
```

该命令只按顺序串联生产配置门禁、空库闭环、AI/STT/TTS、Unity、浏览器体感、家属授权脱敏与审计契约验收；它不创建数据、不生成证据，也不会在子验收失败后跳过或替换能力。首个 `pnpm delivery:check:production` 步骤会按标准生产就绪检查读取仓库根目录 `.env`，并由父进程中的同名生产环境变量覆盖。Browser/Unity field 账号密码必须由显式总编排配置提供，不从根 `.env` 或父进程继承；总编排只向每个 field 子进程传入 `PATH` 和该运行时对应的四项凭据。配置模板见 `docs/templates/empty-real-loop-orchestrator.template.json`，执行说明见 `docs/empty-real-loop-acceptance-runbook.md`。

客户验收包归档前应复制 `docs/templates/customer-acceptance-package-manifest.template.json` 填写 manifest，并执行：

```bash
pnpm verify:customer-acceptance-package-manifest -- <manifest-json-path> --package-root <customer-acceptance-package-dir>
```

该命令只检查验收包 manifest 指向的客户资料包、总闭环报告、AI/STT/TTS、Unity、浏览器体感、截图/录屏、脱敏导出和审计样例是否存在且安全；它不读取 `.env`，不读取 field acceptance 运行时账号密码，不生成证据，也不把缺失能力替换为其他能力。

一次性正式交付还应执行同一业务链只读验真：

```bash
pnpm verify:formal-acceptance-chain -- <config-json-path>
```

配置模板：`docs/templates/formal-acceptance-chain.template.json`

该命令证明同一患者的授权、正式评估、当前方案、训练 session、训练结果、医生复核、家属摘要和审计日志可以相互关联；它只执行只读 API 查询，不创建或补写任何业务数据。AD-8 照护者访谈验收使用：

```bash
pnpm verify:ad8-caregiver-interview-acceptance -- <config-json-path>
```

配置模板：`docs/templates/ad8-caregiver-interview-acceptance-config.template.json`

前端页面壳层回归可使用真实浏览器执行：

```bash
pnpm test:playwright
```

该命令启动 Next.js Web 应用并用 Chromium 检查登录、建档授权、摄像头/麦克风权限入口、AI 评估、方案匹配、训练、家属、医师、账号/内容/供应商治理、脱敏导出和审计页面入口。它只验证 UI 导航和关键正式能力文案，不能替代真实 AI/语音/Unity/体感采集、数据库闭环或现场验收。详细说明见 `docs/web-playwright-regression-runbook.md`，测试文件见 `scripts/web-playwright-regression.spec.mjs` 和 `scripts/playwright-regression.config.mjs`。

## Unity/体感训练交付策略

一期优先保证至少一个训练内容真实可用，再扩展多游戏库：

- 浏览器体感训练使用摄像头姿态识别采集结构化指标。
- 一期包含 Unity WebGL 正式能力时，必须同时完成真实 WebGL Build 校验和现场只读验真；浏览器体感可作为并行训练内容，不作为 Unity 失败后的替代能力。
- 客户已有 Unity 游戏时，按平台 Bridge 协议接入。
- 我方自研 Unity 游戏时，需提供真实 WebGL 构建产物和版本清单。
- 所有训练内容都必须回传真实结构化训练结果，不接受固定成绩或缺失动作指标。

浏览器体感训练现场验收时，先执行 JSON 自检，再执行只读实机验真：

```bash
pnpm verify:browser-pose-evidence -- <evidence-json-path>
BROWSER_POSE_PATIENT_ACCOUNT='<browser-patient-read-account>' \
BROWSER_POSE_PATIENT_PASSWORD='<browser-patient-read-password>' \
BROWSER_POSE_AUDIT_ACCOUNT='<browser-audit-read-account>' \
BROWSER_POSE_AUDIT_PASSWORD='<browser-audit-read-password>' \
pnpm verify:browser-pose-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com
```

只读实机验真不会创建或补写数据；缺 API、缺 Browser Pose 专属患者/审计账号密码、Cookie/CSRF 登录失败、缺截图/录屏文件、缺训练记录或缺审计日志时必须失败。正式浏览器体感现场验收只接受 `qualityFlag=valid` 且 `abnormalFlag=false` 的有效训练样本，异常、可疑或低质量结果的 `training_result.review`、复核结论和审计日志由 `pnpm verify:contracts` 验收。训练结果页的审计自动聚合只会匹配已加载的成功审计日志并辅助填写 ID，不能替代 `pnpm verify:browser-pose-field-acceptance`。API 地址、evidence JSON 和审计 metadata 会拒绝 `mock/demo/seed/fallback/fixed/manual` 的明文、拼接和 URL 编码标记；HTTP 失败响应体和字段不一致原值会被隐藏，避免泄露密码、身份标识或训练载荷。`pnpm verify:contracts` 用于验证本地真实 API 权限、家属脱敏、授权撤回、异常复核和审计契约，但不能替代摄像头实采验收；`pnpm verify:trial-empty-loop` 也不能替代摄像头实采验收。

Unity WebGL 正式现场验收同样必须先执行 JSON 自检，再执行只读实机验真：

```bash
pnpm verify:unity-field-evidence -- <evidence-json-path>
UNITY_FIELD_PATIENT_ACCOUNT='<unity-patient-read-account>' \
UNITY_FIELD_PATIENT_PASSWORD='<unity-patient-read-password>' \
UNITY_FIELD_AUDIT_ACCOUNT='<unity-audit-read-account>' \
UNITY_FIELD_AUDIT_PASSWORD='<unity-audit-read-password>' \
pnpm verify:unity-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com
```

Unity 只读验真只执行 `GET` 查询和本地附件读取，不创建患者、不创建训练 session、不提交训练结果、不补写动作指标、不补审计日志。正式 Unity WebGL 现场验收只接受 `qualityFlag=valid` 且 `abnormalFlag=false` 的有效训练样本，异常、可疑或低质量结果的 `training_result.review`、复核结论和审计日志由 `pnpm verify:contracts` 验收。训练结果页的审计自动聚合只会匹配已加载的成功审计日志并辅助填写 ID，不能替代 `pnpm verify:unity-field-acceptance`。缺正式 HTTPS API、缺 Unity 专属患者/审计账号密码、Cookie/CSRF 登录失败、缺附件、缺训练记录、缺审计日志或缺真实 Unity WebGL runtime 时必须失败；mock、demo、seed、fallback、fixed、manual、本地脚本样例和固定成绩不能作为正式 Unity 证据。API 地址、evidence JSON 和审计 metadata 会拒绝伪数据标记、敏感字段和原始载荷；HTTP 失败响应体和字段不一致原值会被隐藏。

桥接协议和 Unity 调用模板见：

- `docs/formal-training-content-runbook.md`
- `docs/unity/unity-webgl-bridge-protocol.md`
- `apps/web/public/unity/rehab-unity-bridge.js`

Unity WebGL 构建产物建议放在：

```text
apps/web/public/unity/<gameCode>/<version>/
```

自研 Unity 轻 3D 训练源码位于：

```text
unity/rhythm-reach-3d/
```

当前已包含可打开的 `RhythmReachTraining.unity` 场景、WebGL bridge 模板、真实指标计算脚本、正式 WebGL 构建入口和仓内 WebGL 构建产物；正式通过仍需要 HTTPS 静态资源运行、现场 Unity runtime 启动、Bridge 回传、训练入库与审计验真。源码自检命令：

```bash
pnpm verify:unity-rhythm-reach-source
```

生成真实 WebGL Build 文件：

```bash
"/Volumes/UnityEditors/Hub/Editor/6000.0.75f1/Unity.app/Contents/MacOS/Unity" \
  -batchmode \
  -nographics \
  -quit \
  -projectPath "/Users/thl/IdeaProjects/Rehabilitation platform/unity/rhythm-reach-3d" \
  -executeMethod Rehab.EditorTools.RhythmReachWebGlBuilder.BuildFormalWebGl \
  -logFile "/Users/thl/IdeaProjects/Rehabilitation platform/unity-rhythm-reach-webgl-build.log"
```

该构建入口必须由 Unity Editor 生成真实 `.loader.js`、`.framework.js`、`.data`、`.wasm` 和 `manifest.json`。正式浏览器运行仍需要按 `docs/unity/unity-webgl-bridge-protocol.md` 做平台回传验收。

构建完成后校验 manifest、文件大小和 SHA-256：

```bash
pnpm verify:unity-rhythm-reach-webgl-build
```

## 交付边界

`客户提供/康复平台3.0` 为客户历史版本和参考资料目录，不属于当前新项目的正式交付源码。正式交付以本 README 中列出的 monorepo 主工程、迁移、接口、前端页面、训练桥接协议和验收脚本为准。

详细交付边界、排除目录和上线前准备清单见：

- `docs/delivery-boundary-and-readiness.md`
- `docs/supply-chain-license-policy-runbook.md`
- `docs/templates/customer-license-policy.template.json`
- `docs/trial-initialization-runbook.md`
- `docs/formal-training-content-runbook.md`
- `docs/formal-delivery-acceptance-runbook.md`
- `docs/formal-delivery-gap-analysis.md`
- `docs/game-module-delivery-strategy.md`
- `docs/browser-pose-game-library-delivery-plan.md`
- `docs/customer-acceptance-criteria.md`
- `docs/customer-production-input-checklist.md`
- `docs/customer-final-input-request.md`
- `docs/customer-input-to-launch-gate-runbook.md`
- `docs/ai-speech-provider-selection-free-first.md`：本期 MiMo AI、语音与费用确认说明。
- `docs/ai-assessment-acceptance-runbook.md`
- `docs/xiaomi-token-plan-stt-tts-connectivity-record.md`
- `docs/customer-delivery-progress-and-input-summary.md`
- `scripts/verify-speech-ai-assessment-acceptance.mjs`
- `scripts/verify-tts-speech-output-evidence.mjs`
- `scripts/verify-tts-speech-output-acceptance.mjs`
- `docs/templates/customer-production-input.template.json`
- `docs/templates/customer-acceptance-package-manifest.template.json`
- `docs/templates/unity-field-evidence.template.json`
- `docs/templates/ai-assessment-acceptance-config.template.json`
- `docs/speech-transcript-acceptance-runbook.md`
- `docs/templates/speech-transcript-evidence.template.json`
- `docs/templates/speech-transcript-acceptance-config.template.json`
- `docs/tts-speech-output-acceptance-runbook.md`
- `docs/templates/tts-speech-output-evidence.template.json`
- `docs/templates/speech-ai-assessment-acceptance-config.template.json`
- `docs/templates/tts-speech-output-acceptance-config.template.json`
- `docs/production-delivery-runbook.md`
- `docs/browser-pose-field-acceptance-runbook.md`
- `docs/collection-condition-data-capture-runbook.md`
- `docs/unity-field-acceptance-runbook.md`
- `docs/empty-real-loop-acceptance-runbook.md`
- `docs/templates/empty-real-loop-orchestrator.template.json`
- `scripts/verify-empty-real-loop-orchestrator.mjs`
- `scripts/verify-customer-acceptance-package-manifest.mjs`
- `docs/web-playwright-regression-runbook.md`
- `scripts/web-playwright-regression.spec.mjs`
- `scripts/playwright-regression.config.mjs`
