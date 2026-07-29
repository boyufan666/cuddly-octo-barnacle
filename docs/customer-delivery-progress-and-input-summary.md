# 客户交付推进与资料确认摘要

本文用于向客户或项目负责人说明当前交付状态、下一步上线门禁、客户需要补充的资料，以及小米 MiMo AI/STT/TTS 严格调用链路的验收口径。它不是替代验收脚本的口头说明；正式上线仍以客户资料包、生产环境变量、实机验收、调用日志和审计记录为准。

## 当前交付状态

- 2026-07-17 当前 `pnpm regression:full` 已完成第 29/29 个门禁，`29/29` 全部通过；测试合计 `2257/2257`，`0 failed`、`0 skipped`。权威日志为 `tmp/regression-full-20260717-unity-rebuild.log`。
- 当前完整回归的测试明细为：DB contracts `94/94`、API unit `720/720`、API contracts `31/31`、API controller integration `2/2`、Web unit `327/327`、Web role lifecycle `3/3`、Delivery tests `994/994`；PostgreSQL 专项分别为 `4/4`、`3/3`、`5/5`、`12/12`、`8/8`、`2/2`、`7/7`、`1/1`、`4/4`。
- 当前完整回归的 Playwright 阶段和生产模式专项复验均通过：五个 viewport project 分别执行 `1` 个 account setup 和 `7` 个 business test，每个项目 `8/8`，合计 `40/40`。完整回归聚合结果以 `tmp/regression-full-20260717-unity-rebuild.log` 为准，视觉专项日志为 `tmp/playwright-post-visual-20260717.log`；`output/playwright/test-results/.last-run.json` 只记录最后一个 iPhone 子进程，不能作为五项目聚合证据。
- 当前 managed 浏览器截图精确 `90/90` 张，五个 viewport 各 18 张，且为 90 个唯一 SHA-256。尺寸分别为 `1280x800`、`1366x768`、`1440x900`、`1082x2202`、`1170x1992`；Pixel 与 iPhone 新联系表人工检查确认无 Next.js `N` 浮层，admin/doctor 导航完整按两列显示，页面均从顶部采集。截图不能证明 Unity WebGL 真实运行。
- 已在外接盘 `/Volumes/UnityEditors` 使用项目锁定的 Unity `6000.0.75f1` 正式重建 WebGL；build exit code 为 `0`，新产物包含 `rehab-unity-result-v2`，Unity source verifier、WebGL build verifier 和完整回归均已通过。
- 本地完整回归全绿仍不能替代真实 Unity runtime、Bridge 回传、训练结果入库、审计现场验收，也不能替代客户资料包、生产配置检查和最终部署签署；当前不得宣称正式客户交付通过或生产部署就绪。
- 所有 PostgreSQL 和 Playwright 写测试均使用专用测试 PostgreSQL `127.0.0.1:32768`，日志识别并执行 `22` 个迁移且状态无 pending；本轮没有连接或验证项目 `55432` 数据库。
- 2026-06-11 Unit 8/9 回归和手工 smoke 记录仅作为历史证据保留，包括 `output/manual-smoke/unit9-manual-smoke-evidence.json` 及三张手工截图；其中的旧测试数量、迁移数量、Playwright 数量和 WebGL PASS 不能作为当前状态依据。
- 正式客户交付和生产部署仍缺客户正式域名与 HTTPS/API 地址、服务器与生产 PostgreSQL、机构和各角色账号、备份恢复、监控告警、Secret File、上线责任人、隐私与知情同意/撤回/留存/脱敏审批规则，以及 Unity、Browser Pose、多条件采集和正式业务闭环的现场 evidence package。MiMo AI/STT/TTS 还缺正式账号、host/模型、配额与失败计费规则、真实音频、第三方数据处理授权、调用日志、人工复核和播放验收材料。
- 已具备全栈 MVP 骨架：Web 前端、NestJS API、Prisma 数据模型、PostgreSQL 本地基础设施。
- 已具备四角色业务闭环基础：患者、家属、医师、管理员的账号权限、患者建档、授权、评估、康复计划、训练记录、审计和脱敏导出。
- 已具备浏览器体感训练主线：`browser_pose_canvas` 训练内容、动作指标结构、训练结果入库、浏览器体感 evidence 自检和只读实机验真脚本。
- 已具备客户资料包和生产门禁：`verify:customer-production-input` 校验客户资料，`delivery:check:production -- --customer-input customer-production-input.json` 校验生产环境和客户资料包一致性。
- 已实现平台接入小米 MiMo AI/STT/TTS 的严格调用链路；正式交付需通过真实客户账号、运行时密钥、供应商调用日志和验收脚本。
- 浏览器体感运行时已具备当前代码与测试链路；Unity WebGL 新 build 已满足 v2 result contract，但完成真实 runtime、Bridge、入库和审计现场验收前仍不能作为正式可交付运行时。后续游戏不强制使用 Unity。
- 本期交付为私有照护圈；公开社交广场需客户确认范围、审核机制、隐私协议和运营责任后另行验收。

## 不能直接宣称完成的能力

- 可以宣称已实现平台接入小米 MiMo AI/STT/TTS 的严格调用链路；不得宣称正式客户交付已通过，除非客户提供真实客户账号、HTTPS endpoint、`secret-manager://...` 密钥引用、运行时密钥、模型版本、TTS 音色/输出格式、供应商调用日志、第三方数据处理授权、医师人工复核证据、TTS 播放验收证据和验收脚本通过记录。
- 不能宣称 Unity 正式游戏库已完成。当前唯一 Unity 游戏已使用 `6000.0.75f1` 正式重建并通过 WebGL verifier 和完整回归，但仍需客户确认 `manifest.json`、授权证明，并补齐真实 runtime、Bridge 回传、训练入库和现场验收证据。
- 不能宣称生产上线完成，除非正式域名、HTTPS、服务器、数据库、备份、监控、密钥托管和审计留存均已配置并通过门禁。
- 不能宣称穿戴设备已接入或已采集生理指标，除非客户提供设备型号、SDK/API/协议、采样规则、指标阈值、授权范围和现场证据。
- 不能用 seed、mock、demo、localhost、个人 token、临时代理、手工改字段或固定成绩作为正式验收依据。
- 2026-07-17 本轮整改和回归未新增 retry、skip、fallback、mock、demo、兼容 OR、默认成功、fake readiness、fake result、fake success、silent downgrade 或 `page.route(...fulfill)`；缺正式凭据、缺设备、缺证据 JSON、缺验收包或服务不可用均记录为 blocker。

## 本期固定上线范围

客户资料包中的 `ai.requiredForLaunch`、`speech.requiredForLaunch` 和 `tts.requiredForLaunch` 必须全部为 `true`，并与 `AI_REQUIRED_FOR_LAUNCH=true`、`SPEECH_REQUIRED_FOR_LAUNCH=true`、`TTS_REQUIRED_FOR_LAUNCH=true` 完全一致。三项 provider 必须分别为 `xiaomi-mimo`、`xiaomi-mimo-audio-understanding` 和 `xiaomi-mimo-tts`；缺任一项、设为 `false` 或配置其他供应商都会阻断生产启动。

## 最优先向客户索取的资料

1. 正式 Web 域名、API 域名、服务器方案、HTTPS 证书、数据库、备份、监控和运维负责人。
2. 隐私协议正文、版本号、生效日期、授权撤回规则、真实患者数据采集范围、数据留存周期和脱敏导出审批人。
3. 超级管理员、运营管理员、审计查看人员、医师账号清单，以及患者和家属账号开通或绑定方式。
4. 浏览器体感验收设备、摄像头型号、目标浏览器、网络环境、训练场地光线和现场验收负责人。
5. 是否已有 Unity WebGL 游戏；如有，提供 Build、`manifest.json`、版本号、素材/插件授权证明和 Bridge 适配负责人。
6. MiMo AI/STT/TTS 的客户账号、费用、配额、失败计费/退款/重试书面规则和数据处理批准。
7. 是否要求生产部署、穿戴设备或公开社交广场进入本期范围；这些能力均为客户资料门禁，缺资料和现场证据时不得宣称完成。

## 小米 MiMo AI/STT/TTS 验收资料

本期按小米 MiMo 严格调用链路确认以下资料：

- 是否已有客户主体的小米 MiMo 账号，是否能提供控制台截图或客户确认清单。
- 是否允许把健康数据、问答转写、评估摘要和待播报文本发送给小米 MiMo。
- 正式 HTTPS endpoint、AI 模型版本、音频理解/STT 模型版本、TTS 模型版本、TTS 音色、输出格式、提示词版本、调用日志样例。
- 密钥是否能托管在客户正式密钥系统中，向项目提供 `secret-manager://...` 引用，并仅由 Render Secret File `/etc/secrets/mimo_api_key` 注入运行时。
- 医师人工复核负责人、复核记录保存方式和日志留存天数。
- TTS 播放验收负责人、目标浏览器、播放场景、供应商调用 ID 和审计 ID。

本期不接受其他供应商；MiMo 请求失败、配额耗尽或证据缺失时必须阻断，不能替换为其他服务或本地功能。

## 推荐推进顺序

1. 客户填写 `customer-production-input.json`，明确 AI/STT/TTS、Unity、浏览器体感、真实数据采集范围。
2. 执行 `pnpm verify:customer-production-input -- customer-production-input.json`，资料不合格先退回补充。
3. 客户或运维配置正式生产环境变量，执行 `pnpm delivery:check:production -- --customer-input customer-production-input.json`。
4. 使用 `pnpm db:seed:trial` 初始化试点基础角色和账号，不创建患者、评估、训练记录等业务数据。
5. 执行空库真实闭环验收，确保建档、授权、结构化评估、计划、训练和审计均使用真实 API。
6. 完成浏览器体感实机验收，保存 evidence JSON、截图、录屏、训练记录 API 和审计日志 API 验真结果。
7. 完成 MiMo AI/STT/TTS 的真实调用、最小化 telemetry、授权记录、医师人工复核和 TTS 播放验收。
8. 如 Unity 为本期 scope，使用本轮已由 Unity `6000.0.75f1` 重建并通过 verifier 的 WebGL 产物，继续完成真实 runtime、Bridge 回传、训练结果和审计验收。
9. 如生产部署、穿戴设备或公开社交广场为本期 scope，分别补齐生产环境证据、设备现场证据或公开社交审核/隐私/运营责任材料后另行验收。

## 最终交付证据包

- `customer-production-input.json` 及资料包校验通过记录。
- `pnpm delivery:check:production -- --customer-input customer-production-input.json` 通过记录。
- 正式域名、HTTPS、数据库、备份、监控和密钥托管配置证据。
- 隐私协议、知情同意、授权撤回、家属共享、导出脱敏和审计日志证据。
- 空库闭环验收记录。
- 浏览器体感 evidence JSON、截图、录屏和只读实机验真记录。
- 如接入真实 AI/STT/TTS：供应商控制台截图、调用日志、模型版本、TTS 音色/输出格式、提示词版本、人工复核记录、播放证据和授权记录。
- 如接入 Unity：使用固定版本 Unity 正式重建且通过 verifier 的 WebGL Build、manifest、授权证明、真实 runtime、Bridge 回传日志和训练结果记录。
