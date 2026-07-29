# Web Playwright 回归测试 Runbook

本文用于验证前端正式交付页面在真实浏览器中仍可加载、导航和展示关键能力入口。本 runbook 同时包含壳层视觉回归与本地正式业务链 Playwright 证据；壳层 spec 不替代数据库闭环，formal spec 提供本地同链证据但不替代现场专项验收。

## 验收目标

- 使用 Chromium 启动真实浏览器访问 Next.js Web 应用。
- 验证登录入口、账号申请入口和四类角色的极简业务导航可见且可切换。
- 验证正式能力入口没有被误删，包括账号审核、建档授权、摄像头/麦克风权限入口、AI/STT/TTS、方案匹配、浏览器体感、Unity WebGL、家属协同、内容治理、配置治理、脱敏导出和审计日志。
- 在未登录或没有患者上下文时，允许页面展示正式权限门禁文案，例如“等待患者建档数据”“训练会话尚未开始”；这不是数据闭环验收结果。
- 在 `1280x800`、`1366x768`、`1440x900`、Pixel 7 和 iPhone 14 五个项目检查页面没有水平溢出，底部任务导航不会遮挡主要操作，通用页面左右栏、Unity 舞台和自拍监看区不会发生矩形重叠。
- Unit 7 视觉回归还会检查可见按钮、标题、标签和关键说明文字没有文本裁切；患者、医生、家属主流程不得出现 Provider、Endpoint、manifest、runtimeType、fallback、mock、demo、技术验收等技术或演示文案。

## 执行命令

运行前必须显式提供以下独立 Playwright 环境变量；配置不会读取默认端口、复用已有服务或提供密钥默认值：

- `PLAYWRIGHT_DATABASE_URL`：数据库名必须精确为 `rehab_playwright_test`，且不得带 `schema` 参数。
- `PLAYWRIGHT_CONFIRM_DISPOSABLE=YES`：精确确认该专库允许被本轮整体重置。
- `PLAYWRIGHT_WEB_PORT`、`PLAYWRIGHT_API_PORT`：两个不同的 `1..65535` 端口。
- `PLAYWRIGHT_JWT_SECRET`：至少 32 UTF-8 字节。
- `PLAYWRIGHT_COOKIE_SECURE`：只能为 `true` 或 `false`。
- `PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_LIMIT`、`PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS`：十进制正安全整数。
- `PLAYWRIGHT_SENSITIVE_DATA_KEY_REF`：无首尾空白的非空密钥标识。
- `PLAYWRIGHT_SENSITIVE_DATA_KEY`：规范 Base64 编码的 32 字节密钥。
- `PLAYWRIGHT_SEED_PASSWORD`：符合 8..128 字符策略的本轮 seed 初始密码。
- `PLAYWRIGHT_ACCOUNT_PASSWORD`：与 seed 初始密码不同、符合相同策略的浏览器回归密码。

```bash
pnpm test:playwright
```

该命令会先完整校验所有必需输入，再清理 runner 自己管理的旧证据：`output/playwright/web-regression-*.png` 和 `output/playwright/test-results`。清理失败会在任何 build 或数据库 reset 前终止；同目录中不匹配 `web-regression-*.png` 的其他现场验收文件不属于该 runner，不会被删除。清理完成后，runner 使用本轮显式 `NEXT_PUBLIC_API_BASE_URL` 执行一次 Web production build，再执行一次 DB build，并对五个业务项目逐一执行 `migrate reset --force --skip-seed`、加密 seed 和带唯一 `--project` 的 Playwright Test。Playwright 通过 `next start` 运行该 production build，截图中不会出现 Next.js 开发工具浮层。每个视口都使用全新专库状态，不会继承前一视口创建的评估、待确认方案、训练会话或审计记录；任何一步失败都会立即终止整个 runner。每个项目自己的 account-setup 依赖会对 `admin`、`doctor001`、`patient001`、`caregiver001` 逐个执行真实 CSRF 登录、确认 `password_reset_required`、完成首次改密、只使用新密码重新登录并退出；不直接更新数据库密码，不尝试旧密码重试。

浏览器部分共执行 40 个测试：五个隔离项目各执行 1 个账号 setup 和 7 个业务/视觉用例。业务覆盖仍为五个视口下 35 个用例，额外的 5 个 setup 用于证明每次全新 seed 后的首次改密链路。

- Web 地址：`http://127.0.0.1:${PLAYWRIGHT_WEB_PORT}`
- API 地址：`http://127.0.0.1:${PLAYWRIGHT_API_PORT}`
- 测试文件：`scripts/web-playwright-regression.spec.mjs`
- 测试文件：`scripts/formal-ui-business-chain.spec.mjs`
- 账号 setup：`scripts/playwright-account-setup.spec.mjs`
- 配置文件：`scripts/playwright-regression.config.mjs`

所有必需输入会在数据库 reset 前一次性校验。API 进程由 Playwright 使用上述数据库、JWT、Cookie、限流和敏感数据密钥配置启动，并等待 `/health/live`；Web 进程使用同一轮显式 API 端口启动。两个服务均设置 `reuseExistingServer: false`，端口已占用或任何必需变量缺失时立即失败，不会复用已有进程、等待 shell 重试或读取默认值。

不需要服务器的角色工作区生命周期 harness 使用独立 Web script，且作为 `test:unit` 与 `regression:full` 的独立步骤执行：

```bash
pnpm --filter @rehab-platform/web run test:role-workspace-lifecycle
```

统一 PostgreSQL/full runner 中的 API smoke 还要求独立的 `API_SMOKE_*` 配置：`API_SMOKE_DATABASE_URL`、`API_SMOKE_CONFIRM_DISPOSABLE=YES`、`API_SMOKE_JWT_SECRET`、`API_SMOKE_COOKIE_SECURE`、`API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_LIMIT`、`API_SMOKE_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS`、`API_SMOKE_SENSITIVE_DATA_KEY_REF`、`API_SMOKE_SENSITIVE_DATA_KEY`。runner 会在任何子进程启动前按与 API 相同的严格规则校验并映射这些值。

## 产物位置

- Unit 7 角色入口截图：`output/playwright/web-regression-login-entry-<project>.png`
- Unit 7 患者主流程截图：`output/playwright/web-regression-patient-<今日|训练|记录|我的>-<project>.png`
- Unit 7 医生主流程截图：`output/playwright/web-regression-doctor-<患者|评估|计划|准备|复核>-<project>.png`
- Unit 7 家属主流程截图：`output/playwright/web-regression-caregiver-<照护|进展|提醒|我的>-<project>.png`
- Unit 7 管理端入口截图：`output/playwright/web-regression-admin-<账号|内容|配置|审计>-<project>.png`
- 完整成功时生成 90 张 `web-regression-*.png`：每个项目 18 张，5 个项目合计 90 张。runner 不再生成与“管理端审计”内容重复的 shell 截图。
- 失败截图、trace 和 video：`output/playwright/test-results/`；配置只在失败时保留这些产物，成功运行不会生成正式业务链 trace。

只有本轮严格 runner 完整通过且 `web-regression-*.png` 文件数精确为 90 时，才可将这 90 张截图视为同一轮成功证据；每次截图前，测试会把应用滚动区、患者/家属嵌套滚动区和工作台导航横向位置精确复位到顶部/左侧并等待断言通过。失败或中途终止时目录可能只有本轮已生成的部分截图，不能宣称完整视觉回归通过。`output/` 是本地验收产物目录，不应纳入正式源码提交。

## Unit 8 历史运行记录（旧配置）

以下记录来自 `2026-06-11` 的旧配置，仅保留为历史记录；其中固定的 `localhost:3000/4000`、已有服务清理和运行方式均已被本文前述严格 `PLAYWRIGHT_*` 契约及双 `webServer` 编排取代，不是当前执行说明。旧目录统计的 96 张 `web-regression-*.png` 包含 95 张五项目截图和一张当前代码不会生成的遗留 `web-regression-shell.png`，因此不能作为单轮隔离证据。

运行时间：`2026-06-11 17:53:48 CST`

| Unit   | Step               | Command                | ExitCode | Result             | Evidence                                                        |
| ------ | ------------------ | ---------------------- | -------- | ------------------ | --------------------------------------------------------------- |
| Unit 8 | Browser regression | `pnpm test:playwright` | `0`      | `35 passed (2.8m)` | `output/playwright/test-results/.last-run.json` status `passed` |

本轮 `pnpm test:playwright` 通过 `scripts/playwright-regression.config.mjs` 运行 `scripts/formal-ui-business-chain.spec.mjs` 与 `scripts/web-playwright-regression.spec.mjs`，覆盖 `chromium-1280`、`chromium-1366`、`chromium-1440`、`chromium-pixel`、`chromium-iphone` 五个项目。首次普通沙箱执行被本地服务启动环境阻断：API 子进程报 `PrismaClientInitializationError P1001`，Web 绑定 `localhost:3000` 报 `listen EPERM ::1:3000`；随后清理失效 4000 进程并在授权执行环境重新运行，完整通过。

旧目录中可对应到五个项目的 95 张截图：

- Shell：`output/playwright/web-regression-shell-chromium-1280.png`
- Shell：`output/playwright/web-regression-shell-chromium-1366.png`
- Shell：`output/playwright/web-regression-shell-chromium-1440.png`
- Shell：`output/playwright/web-regression-shell-chromium-pixel.png`
- Shell：`output/playwright/web-regression-shell-chromium-iphone.png`
- Login：`output/playwright/web-regression-login-entry-chromium-1280.png`
- Login：`output/playwright/web-regression-login-entry-chromium-1366.png`
- Login：`output/playwright/web-regression-login-entry-chromium-1440.png`
- Login：`output/playwright/web-regression-login-entry-chromium-pixel.png`
- Login：`output/playwright/web-regression-login-entry-chromium-iphone.png`
- 患者今日：`output/playwright/web-regression-patient-今日-chromium-1280.png`、`output/playwright/web-regression-patient-今日-chromium-1366.png`、`output/playwright/web-regression-patient-今日-chromium-1440.png`、`output/playwright/web-regression-patient-今日-chromium-pixel.png`、`output/playwright/web-regression-patient-今日-chromium-iphone.png`
- 患者训练：`output/playwright/web-regression-patient-训练-chromium-1280.png`、`output/playwright/web-regression-patient-训练-chromium-1366.png`、`output/playwright/web-regression-patient-训练-chromium-1440.png`、`output/playwright/web-regression-patient-训练-chromium-pixel.png`、`output/playwright/web-regression-patient-训练-chromium-iphone.png`
- 患者记录：`output/playwright/web-regression-patient-记录-chromium-1280.png`、`output/playwright/web-regression-patient-记录-chromium-1366.png`、`output/playwright/web-regression-patient-记录-chromium-1440.png`、`output/playwright/web-regression-patient-记录-chromium-pixel.png`、`output/playwright/web-regression-patient-记录-chromium-iphone.png`
- 患者我的：`output/playwright/web-regression-patient-我的-chromium-1280.png`、`output/playwright/web-regression-patient-我的-chromium-1366.png`、`output/playwright/web-regression-patient-我的-chromium-1440.png`、`output/playwright/web-regression-patient-我的-chromium-pixel.png`、`output/playwright/web-regression-patient-我的-chromium-iphone.png`
- 医生患者：`output/playwright/web-regression-doctor-患者-chromium-1280.png`、`output/playwright/web-regression-doctor-患者-chromium-1366.png`、`output/playwright/web-regression-doctor-患者-chromium-1440.png`、`output/playwright/web-regression-doctor-患者-chromium-pixel.png`、`output/playwright/web-regression-doctor-患者-chromium-iphone.png`
- 医生评估：`output/playwright/web-regression-doctor-评估-chromium-1280.png`、`output/playwright/web-regression-doctor-评估-chromium-1366.png`、`output/playwright/web-regression-doctor-评估-chromium-1440.png`、`output/playwright/web-regression-doctor-评估-chromium-pixel.png`、`output/playwright/web-regression-doctor-评估-chromium-iphone.png`
- 医生计划：`output/playwright/web-regression-doctor-计划-chromium-1280.png`、`output/playwright/web-regression-doctor-计划-chromium-1366.png`、`output/playwright/web-regression-doctor-计划-chromium-1440.png`、`output/playwright/web-regression-doctor-计划-chromium-pixel.png`、`output/playwright/web-regression-doctor-计划-chromium-iphone.png`
- 医生准备：`output/playwright/web-regression-doctor-准备-chromium-1280.png`、`output/playwright/web-regression-doctor-准备-chromium-1366.png`、`output/playwright/web-regression-doctor-准备-chromium-1440.png`、`output/playwright/web-regression-doctor-准备-chromium-pixel.png`、`output/playwright/web-regression-doctor-准备-chromium-iphone.png`
- 医生复核：`output/playwright/web-regression-doctor-复核-chromium-1280.png`、`output/playwright/web-regression-doctor-复核-chromium-1366.png`、`output/playwright/web-regression-doctor-复核-chromium-1440.png`、`output/playwright/web-regression-doctor-复核-chromium-pixel.png`、`output/playwright/web-regression-doctor-复核-chromium-iphone.png`
- 家属照护：`output/playwright/web-regression-caregiver-照护-chromium-1280.png`、`output/playwright/web-regression-caregiver-照护-chromium-1366.png`、`output/playwright/web-regression-caregiver-照护-chromium-1440.png`、`output/playwright/web-regression-caregiver-照护-chromium-pixel.png`、`output/playwright/web-regression-caregiver-照护-chromium-iphone.png`
- 家属进展：`output/playwright/web-regression-caregiver-进展-chromium-1280.png`、`output/playwright/web-regression-caregiver-进展-chromium-1366.png`、`output/playwright/web-regression-caregiver-进展-chromium-1440.png`、`output/playwright/web-regression-caregiver-进展-chromium-pixel.png`、`output/playwright/web-regression-caregiver-进展-chromium-iphone.png`
- 家属提醒：`output/playwright/web-regression-caregiver-提醒-chromium-1280.png`、`output/playwright/web-regression-caregiver-提醒-chromium-1366.png`、`output/playwright/web-regression-caregiver-提醒-chromium-1440.png`、`output/playwright/web-regression-caregiver-提醒-chromium-pixel.png`、`output/playwright/web-regression-caregiver-提醒-chromium-iphone.png`
- 家属我的：`output/playwright/web-regression-caregiver-我的-chromium-1280.png`、`output/playwright/web-regression-caregiver-我的-chromium-1366.png`、`output/playwright/web-regression-caregiver-我的-chromium-1440.png`、`output/playwright/web-regression-caregiver-我的-chromium-pixel.png`、`output/playwright/web-regression-caregiver-我的-chromium-iphone.png`
- 管理端账号：`output/playwright/web-regression-admin-账号-chromium-1280.png`、`output/playwright/web-regression-admin-账号-chromium-1366.png`、`output/playwright/web-regression-admin-账号-chromium-1440.png`、`output/playwright/web-regression-admin-账号-chromium-pixel.png`、`output/playwright/web-regression-admin-账号-chromium-iphone.png`
- 管理端内容：`output/playwright/web-regression-admin-内容-chromium-1280.png`、`output/playwright/web-regression-admin-内容-chromium-1366.png`、`output/playwright/web-regression-admin-内容-chromium-1440.png`、`output/playwright/web-regression-admin-内容-chromium-pixel.png`、`output/playwright/web-regression-admin-内容-chromium-iphone.png`
- 管理端配置：`output/playwright/web-regression-admin-配置-chromium-1280.png`、`output/playwright/web-regression-admin-配置-chromium-1366.png`、`output/playwright/web-regression-admin-配置-chromium-1440.png`、`output/playwright/web-regression-admin-配置-chromium-pixel.png`、`output/playwright/web-regression-admin-配置-chromium-iphone.png`
- 管理端审计：`output/playwright/web-regression-admin-审计-chromium-1280.png`、`output/playwright/web-regression-admin-审计-chromium-1366.png`、`output/playwright/web-regression-admin-审计-chromium-1440.png`、`output/playwright/web-regression-admin-审计-chromium-pixel.png`、`output/playwright/web-regression-admin-审计-chromium-iphone.png`
- 旧目录 `web-regression-*.png` 文件总数曾为 `96`，其中一张是未清理的遗留 `web-regression-shell.png`；当前严格单轮规则为 `90`
- Playwright 结果状态：`output/playwright/test-results/.last-run.json`

No-fallback statement：本次 Unit 8 浏览器回归未新增 fallback、mock、demo、fake readiness、fake result、fake success、silent downgrade 或 `page.route(...fulfill)`；普通沙箱端口/服务问题通过重新运行真实本地服务解决，没有用浏览器本地状态、固定分数或 route fulfill 替代业务状态。

## 2026-07-17 当前执行状态

- 生产模式 Playwright 五个 viewport project 各执行 `1` 个 account setup 和 `7` 个业务测试，每项目 `8/8`，合计 `40/40`；当前 managed 截图为 `90/90` 张，五个 viewport 各 18 张，且为 90 个唯一 SHA-256。完整回归聚合结果以 `tmp/regression-full-20260717-unity-rebuild.log` 为准，视觉专项证据为 `tmp/playwright-post-visual-20260717.log`。
- 完整回归已完成第 `29/29` 个门禁，`29/29` 全部通过；测试合计 `2257/2257`，`0 failed`、`0 skipped`，顶层命令 exit code 为 `0`。Unity source 和本轮正式重建的 WebGL build verifier 均通过。
- Playwright 和本地完整回归不证明真实 Unity runtime、Bridge 回传、训练结果入库、审计现场验收或生产配置已经完成，因此不能据此声明 Unity WebGL 已正式交付或平台已生产部署就绪。

## 正式业务链验收

`scripts/formal-ui-business-chain.spec.mjs` 不是壳层 smoke。它会通过真实浏览器和本地 API 执行同一患者的正式链路：

- 医生确认评估风险。
- 医生确认方案。
- 医生在 `准备` 工作区创建训练准备记录。
- 患者开始训练并提交训练结果。
- 医生保存训练复核结论。
- 家属刷新后只能看到脱敏进展。
- 管理员查询同链审计日志，并执行 reason-required 同患者脱敏档案 CSV 导出；后台安全策略不提供评估正文或精确训练指标导出。

该 spec 会捕获并断言同一链路中的 `patientId`、`assessmentId`、`riskGradeId`、`rehabPlanId`、`planItemId`、`collectionBatchId`、`trainingSessionId`、`trainingResultId`、`gameRunId`、审计 metadata、CSV `patientExportId` 和本次导出 reason hash。导出 reason 包含本次 `trainingSessionId`，审计仅保存其哈希；CSV 不得泄露原始 patient/session/result ID。它不得使用 `page.route(...fulfill)`、mock、demo、fallback、固定分数或浏览器本地状态绕过真实接口。

## 边界声明

- `scripts/web-playwright-regression.spec.mjs` 是壳层与视觉回归，不创建患者、评估、康复计划、训练记录或审计日志。
- `scripts/formal-ui-business-chain.spec.mjs` 会创建正式评估、方案、准备记录、训练会话、训练结果、复核、审计和脱敏导出记录，用于证明真实同链业务闭环。
- Playwright 配置和统一 runner 不会从 `.env` 补齐任何必需输入；API 进程即使执行现有 dotenv 加载，所有本轮必需值也已由 preflight 校验并通过显式进程环境传入，dotenv 不会覆盖这些值。测试不输出密钥、token、客户音频或训练原始 payload。
- 不证明真实 AI/语音/Unity/体感训练已经完成交付。
- 不接受把该测试成功作为正式数据闭环、供应商调用或现场实机验收的替代。

## 与正式验收的关系

交付前建议将本测试和现有验收一起执行：

```bash
pnpm test:delivery
pnpm delivery:check
pnpm test:playwright
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web build
```

若客户要求证明真实业务闭环，还必须执行 `docs/empty-real-loop-acceptance-runbook.md`、`docs/ai-assessment-acceptance-runbook.md`、`docs/speech-transcript-acceptance-runbook.md`、`docs/tts-speech-output-acceptance-runbook.md`、`docs/unity-field-acceptance-runbook.md` 和 `docs/browser-pose-field-acceptance-runbook.md` 中定义的现场验收。
