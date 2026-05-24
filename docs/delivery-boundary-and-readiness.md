# 交付边界与上线准备清单

本文用于区分“正式交付源码”“本地开发资料”“客户历史参考资料”和“上线前必须补齐事项”，避免将原型、示例密钥或初始化数据误当作生产能力交付。

## 正式交付范围

以下内容属于当前新项目正式交付范围：

- `apps/web`：四角色 Web 前端与体感训练页面
- `apps/api`：NestJS API、认证授权、业务接口、审计与导出
- `packages/db`：Prisma schema、迁移与本地初始化脚本
- `infra/docker-compose.yml`：本地开发 PostgreSQL 与 Redis
- `docs/unity`：Unity WebGL Bridge 协议
- `docs/formal-training-content-runbook.md`：正式训练内容发布手册
- `docs/formal-delivery-acceptance-runbook.md`：正式交付总验收 Runbook
- `docs/formal-delivery-gap-analysis.md`：正式可交付差距总结
- `docs/game-module-delivery-strategy.md`：游戏模块正式交付策略
- `docs/customer-acceptance-criteria.md`：客户验收标准
- `docs/customer-production-input-checklist.md`：客户上线资料准备清单
- `docs/production-delivery-runbook.md`：生产交付 Runbook
- `docs/browser-pose-field-acceptance-runbook.md`：浏览器体感实机验收 Runbook
- `apps/web/public/unity/rehab-unity-bridge.js`：Unity 训练结果回传桥接脚本
- `scripts/verify-local-contracts.mjs`：本地接口契约验收脚本
- `scripts/verify-trial-empty-loop.mjs`：试点空库闭环验收脚本
- `scripts/verify-browser-pose-evidence.mjs`：浏览器体感 evidence JSON 静态自检脚本
- `scripts/verify-browser-pose-field-acceptance.mjs`：浏览器体感实机只读验真脚本，核对附件文件、训练记录 API 和审计日志 API
- `scripts/verify-customer-production-input.mjs`：客户生产资料包校验脚本

## 不纳入运行源码包

以下内容不应作为当前新项目运行源码包的一部分：

- `客户提供/`：客户历史版本、旧原型、参考资料和旧部署文档
- `node_modules/`
- `.next/`
- `dist/`
- `coverage/`
- `infra/data/`
- 任意目录下的 `.env`、`.env.local`、`.env.production` 等环境变量文件
- `.playwright-cli/`
- `.playwright-mcp/`

如需将 `客户提供/` 作为附件交付，应单独标注为“客户原始资料/参考附件”，并完成敏感信息、密钥、非生产逻辑和第三方依赖审查。

## 本地初始化数据边界

`pnpm db:seed` 只用于本地开发和自动化验收，不作为试点或生产初始化方式。

本地初始化脚本可能创建示例机构、账号、患者、授权、评估、康复计划、训练记录和审计记录，用于验证完整业务链路。试点或生产环境应通过正式数据导入和账号开通流程生成真实数据。

## 试点初始化边界

试点或准生产环境首次初始化应使用 `pnpm db:seed:trial`，且必须显式配置 `TRIAL_*` 环境变量。

该流程只创建系统角色、试点机构、首个平台超级管理员、首个医师档案和初始化审计日志，不创建患者、AI 评估、康复计划、训练记录或动作指标。完整运行手册见 `docs/trial-initialization-runbook.md`。

## 上线前必须替换

- `DATABASE_URL`：正式数据库连接
- `REDIS_URL`：正式 Redis 连接
- `JWT_SECRET`：强随机密钥
- `WEB_ORIGIN`：正式前端域名
- `NEXT_PUBLIC_API_BASE_URL`：正式 API 域名
- `DEFAULT_PATIENT_PASSWORD`：不得使用固定通用密码
- PostgreSQL/Redis 密码和访问策略
- HTTPS 证书和反向代理配置
- 日志、备份、监控和告警配置
- AI/语音生产配置：供应商、正式 HTTPS endpoint、`secret-manager://...` 密钥引用、模型/语音调用日志留存和医师人工复核证据

## 当前阻塞交付事项

1. 真实 AI/语音服务接入：必须同时具备生产供应商配置、正式 HTTPS endpoint、`secret-manager://...` 密钥引用、模型/语音调用日志留存和医师人工复核证据；任一项缺失均为上线硬阻断，不能以 mock/demo/local、本地录入或脚本兜底替代。
2. 至少 1 个正式训练内容实机验收：发布浏览器体感或 Unity 内容，完成摄像头授权、姿态识别、结果生成、入库和审计。
3. Unity WebGL 正式构建接入：`manifest.json`、Build 文件和 Bridge 回传验收。
4. 隐私权限专项验收：撤回授权阻断、家属摘要脱敏、医师患者归属、导出脱敏审计。
5. 生产部署方案：Web、API、PostgreSQL、Redis、静态训练资源、HTTPS、备份与监控。
6. 客户验收标准冻结：角色权限、训练指标、AI 输入输出、数据导出范围、设备和浏览器要求。

详细缺口、游戏路线、客户验收口径和生产上线准备见：

- `docs/formal-delivery-gap-analysis.md`
- `docs/formal-delivery-acceptance-runbook.md`
- `docs/game-module-delivery-strategy.md`
- `docs/customer-acceptance-criteria.md`
- `docs/customer-production-input-checklist.md`
- `docs/production-delivery-runbook.md`
- `docs/browser-pose-field-acceptance-runbook.md`

## 交付验收建议

每次准备交付前至少执行：

```bash
pnpm test:delivery
pnpm delivery:check
pnpm --filter @rehab-platform/web exec tsc --noEmit --pretty false
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web build
pnpm verify:contracts
```

完成浏览器体感训练现场验收后，应先校验证据 JSON：

```bash
pnpm verify:browser-pose-evidence -- <evidence-json-path>
```

正式通过还必须执行只读实机验真：

```bash
pnpm verify:browser-pose-field-acceptance -- \
  <evidence-json-path> \
  --api-base-url https://api.rehab.example.com \
  --patient-token <training-record-read-token> \
  --audit-token <audit-read-token>
```

只读实机验真必须能证明截图/录屏文件存在且非空、训练记录 API 与 evidence 一致、`training_session.start` 和 `training_result.submit` 审计日志 ID 与 evidence 一致。缺 API、缺 token、缺附件、缺训练记录或缺审计日志时，浏览器体感训练不能计为正式可交付。

试点或生产环境准备前，还必须在目标环境变量已显式配置后执行：

```bash
pnpm delivery:check:production
```

该检查会拒绝占位符、本地地址、开发 JWT 密钥、固定本地密码和非 HTTPS 正式地址；失败时应由客户或运维提供正式配置，不允许脚本自动替换为默认值。

此外，应使用真实浏览器逐角色验证：

- 患者：建档授权、结构化评估、今日训练、训练结果
- 家属：授权摘要、今日提醒、隐私边界
- 医师：负责患者、方案调整、训练结果回看
- 运营管理：训练内容、脱敏导出、审计日志
