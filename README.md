# 阿尔茨海默病 AI+体感康复平台

一期工程采用全栈 monorepo，目标是跑通真实数据闭环：

- `apps/web`：Next.js 患者端、家属端、医师端、运营管理端
- `apps/api`：NestJS API，负责认证、权限、评估、康复计划、训练采集、审计与导出
- `packages/db`：Prisma schema、迁移与本地初始化脚本
- `infra/docker-compose.yml`：本地开发用 PostgreSQL 与 Redis

## 本地开发启动

1. 准备环境变量：

```bash
cp .env.example .env
```

`.env.example` 只提供字段结构。试点或生产环境必须替换为独立生成的密钥、数据库凭证、Redis 地址、域名和 CORS 配置。

2. 启动本地数据库和 Redis：

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

试点环境只初始化机构、平台管理账号和首个医师账号时，使用：

```bash
pnpm db:seed:trial
```

该脚本要求显式提供 `TRIAL_*` 环境变量，不创建患者、评估、康复计划或训练记录。
完整步骤和验收边界见 `docs/trial-initialization-runbook.md`。

4. 启动前后端：

```bash
pnpm dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000/health`

## 本地初始化账号

以下账号仅用于本地开发和验收脚本，试点/生产环境必须通过正式账号开通流程创建，不得使用固定密码。

| 角色 | 本地账号 |
| --- | --- |
| 患者 | `patient001` |
| 家属 | `caregiver001` |
| 医师 | `doctor001` |
| 平台管理人员 | `admin` |
| 运营人员 | `operator001` |
| 审计查看人员 | `auditor001` |

本地初始化密码由 seed 脚本设置，正式交付时应由客户或运维人员按安全策略重置。

## 试点初始化变量

`pnpm db:seed:trial` 至少需要：

```text
DATABASE_URL
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

可选变量：

```text
TRIAL_ADMIN_MOBILE_PHONE
TRIAL_DOCTOR_MOBILE_PHONE
```

## 当前已落地能力

- 统一账号登录、角色识别和数据范围控制
- 患者建档、知情同意、家属授权绑定
- 评估记录、风险评级、康复方案推荐与医师确认
- 浏览器体感训练壳、结构化训练结果提交、动作指标入库
- 家属摘要查看、脱敏数据导出、审计日志查询
- 训练结果幂等、异常数据标记、授权阻断、医师患者归属校验
- 浏览器体感 evidence JSON 自检与只读实机验真脚本，支持核对附件文件、训练记录 API 和审计日志 API

## 仍需补齐的交付项

- 真实 AI/语音服务接入：语音转文字、大模型分析、模型版本与调用记录
- 至少 1 个正式可训练内容的实机验收：摄像头授权、姿态识别、结果生成、入库与审计
- Unity WebGL 正式构建接入：`manifest.json`、Build 文件、Bridge 回传验收
- 生产部署配置：HTTPS、域名、CORS、强密钥、备份、监控、日志留存
- 试点后续正式数据进入流程：患者、训练内容、隐私协议版本与真实业务数据采集

`pnpm delivery:check:production` 已将 `AI_REQUIRED_FOR_LAUNCH` 和 `SPEECH_REQUIRED_FOR_LAUNCH` 纳入上线范围门禁。客户或运维必须先显式声明真实 AI/语音能力是否属于本次上线范围；设为 `true` 时，必须同步提供供应商、模型版本、正式 HTTPS 接口、`secret-manager://...` 密钥引用、提示词版本、调用日志留存和人工复核策略；设为 `false` 时，对应正式配置必须留空，只能按“结构化评估录入和 AI/语音接口边界”交付，不能宣传真实 AI/语音能力已完成。

真实 AI/语音若被声明为本次上线范围，还必须提供供应商配置清单、HTTPS endpoint、`secret-manager://...` 密钥引用、模型调用日志样例和医师人工复核记录；任一项缺失时，生产检查和客户验收均应硬阻断。`false` 只表示范围未纳入，不是失败后的兜底或替代能力。

客户资料包可从模板 `docs/templates/customer-production-input.template.json` 复制后填写。模板文件只展示字段结构，原样不会通过正式资料校验；必须替换为客户确认后的正式资料，并执行：

```bash
pnpm verify:customer-production-input -- <customer-production-input.json>
```

该命令只校验客户材料和证据完整性，不能替代 `pnpm delivery:check:production`、真实 AI/语音调用验收或浏览器体感实机验真。

## Unity/体感训练交付策略

一期优先保证至少一个训练内容真实可用，再扩展多游戏库：

- 浏览器体感训练使用摄像头姿态识别采集结构化指标。
- 经客户确认一期范围为浏览器体感主线后，由具备发布权限的管理员发布浏览器体感训练内容，用于真实采集闭环。
- 客户已有 Unity 游戏时，按平台 Bridge 协议接入。
- 我方自研 Unity 游戏时，需提供真实 WebGL 构建产物和版本清单。
- 所有训练内容都必须回传真实结构化训练结果，不接受固定成绩或缺失动作指标。

浏览器体感训练现场验收时，先执行 JSON 自检，再执行只读实机验真：

```bash
pnpm verify:browser-pose-evidence -- <evidence-json-path>
pnpm verify:browser-pose-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com \
  --patient-token <training-record-read-token> \
  --audit-token <audit-read-token>
```

只读实机验真不会创建或补写数据；缺 API、缺 token、缺截图/录屏文件、缺训练记录或缺审计日志时必须失败。`pnpm verify:trial-empty-loop` 和 `pnpm verify:contracts` 不能替代摄像头实采验收。

桥接协议和 Unity 调用模板见：

- `docs/formal-training-content-runbook.md`
- `docs/unity/unity-webgl-bridge-protocol.md`
- `apps/web/public/unity/rehab-unity-bridge.js`

Unity WebGL 构建产物建议放在：

```text
apps/web/public/unity/<gameCode>/<version>/
```

## 交付边界

`客户提供/康复平台3.0` 为客户历史版本和参考资料目录，不属于当前新项目的正式交付源码。正式交付以本 README 中列出的 monorepo 主工程、迁移、接口、前端页面、训练桥接协议和验收脚本为准。

详细交付边界、排除目录和上线前准备清单见：

- `docs/delivery-boundary-and-readiness.md`
- `docs/trial-initialization-runbook.md`
- `docs/formal-training-content-runbook.md`
- `docs/formal-delivery-acceptance-runbook.md`
- `docs/formal-delivery-gap-analysis.md`
- `docs/game-module-delivery-strategy.md`
- `docs/customer-acceptance-criteria.md`
- `docs/customer-production-input-checklist.md`
- `docs/customer-final-input-request.md`
- `docs/customer-input-to-launch-gate-runbook.md`
- `docs/ai-speech-provider-selection-free-first.md`
- `docs/customer-delivery-progress-and-input-summary.md`
- `docs/templates/customer-production-input.template.json`
- `docs/production-delivery-runbook.md`
- `docs/browser-pose-field-acceptance-runbook.md`
