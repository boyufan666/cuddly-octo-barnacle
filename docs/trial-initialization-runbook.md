# 试点初始化运行手册

本文用于试点或准生产环境的首次初始化。目标是只建立真实业务运行所需的最小账号和机构基础，不写入患者、评估、康复计划或训练记录。

## 初始化范围

`pnpm db:seed:trial` 只允许创建以下数据：

- 系统角色定义：患者、家属、医师、平台管理、超级管理员、普通运营、只读审计。
- 试点机构：机构编码、名称、类型和启用状态。
- 首个平台超级管理员账号：用于后续开通运营、审计、训练内容和业务配置。
- 首个医师账号与医师档案：用于后续负责患者建档和康复方案确认。
- 初始化审计日志：记录初始化动作、机构编码和本次初始化账号。

该脚本不会创建患者、家属关系、知情同意、AI 评估、风险评级、康复计划、训练记录、动作指标或训练内容。

## 环境变量

运行前必须在目标环境显式配置以下变量：

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

敏感数据密钥要求：

- `SENSITIVE_DATA_KEY_REF` 必须是非空且无首尾空格的精确密钥引用。
- `SENSITIVE_DATA_KEY` 必须是 canonical base64，解码后恰好为 32 bytes。
- 两个变量必须与目标环境 API 运行时使用的密钥完全一致；任一变量缺失或格式错误时，脚本会在任何数据库写入前直接失败。

可选变量：

```text
TRIAL_ADMIN_MOBILE_PHONE
TRIAL_DOCTOR_MOBILE_PHONE
```

密码要求：

- `TRIAL_ADMIN_INITIAL_PASSWORD` 和 `TRIAL_DOCTOR_INITIAL_PASSWORD` 必须不同。
- 不得使用本地开发密码、通用初始密码或客户公开文档中的示例密码。
- 试点交付后应由客户指定管理员完成首次登录和密码重置。

## 执行前检查

1. 确认目标数据库为空库或已经完成正式迁移，且不是开发验收库。
2. 确认任意目录下的 `.env*` 文件、部署平台变量或 CI/CD Secret 中未使用本地开发凭证。
3. 确认 `JWT_SECRET`、`WEB_ORIGIN`、`NEXT_PUBLIC_API_BASE_URL` 已按目标环境配置。
4. 确认 `SENSITIVE_DATA_KEY_REF` 和 `SENSITIVE_DATA_KEY` 与 API 运行时配置完全一致。
5. 确认没有执行 `pnpm db:seed`，该命令只用于本地开发和自动化验收。
6. 确认本次初始化账号由客户或项目负责人书面确认，账号名称不使用测试人员个人临时账号。

## 执行步骤

1. 安装依赖并生成 Prisma Client：

```bash
pnpm install
pnpm db:generate
```

2. 执行数据库迁移：

```bash
pnpm db:migrate
```

3. 执行试点初始化：

```bash
pnpm db:seed:trial
```

4. 本地或联调环境启动服务并验证健康检查：

```bash
pnpm dev
```

访问：

- Web：`http://localhost:3000`
- API 存活检查：`http://localhost:4000/health/live`

部署到试点或生产环境时，应使用对应部署方式启动服务，并访问正式域名，不使用 localhost 作为验收地址。

## 执行后验证

初始化后至少验证：

- 超级管理员账号可以登录，并能进入运营管理与审计页面。
- 医师账号可以登录，并能进入负责患者工作台。
- 系统中没有被脚本创建的患者、家属、AI 评估、康复计划或训练记录。
- 审计日志存在一条 `trial.initialize` 记录。
- 由管理员通过正式流程新建患者后，医师可以查看患者并继续完成评估、方案确认和训练记录查看。

建议执行命令：

```bash
pnpm verify:contracts
pnpm --filter @rehab-platform/web exec tsc --noEmit --pretty false
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web build
```

## 试点数据进入方式

正式试点数据必须按以下路径产生：

- 患者基础信息：由管理端或医师端建档流程创建。
- 隐私与知情同意：由用户登录后签署，或由授权流程记录来源、版本和时间。
- AI 评估数据：由真实问答、量表或客户确认的导入流程生成。
- 康复计划：由系统推荐后经医师确认或调整后下发。
- 训练数据：由浏览器体感训练、Unity WebGL 训练或正式训练设备回传结构化结果。
- 审计数据：由系统在访问、修改、导出和授权操作时自动记录。

## 禁止事项

- 禁止在试点或生产环境执行 `pnpm db:seed`。
- 禁止把本地开发账号、示例患者、示例训练成绩作为客户试点数据。
- 禁止长期共用同一个初始密码。
- 禁止为展示效果手工插入固定训练成绩或固定 AI 结论。
- 禁止绕过知情同意直接采集摄像头、语音、健康指标或家属共享数据。
