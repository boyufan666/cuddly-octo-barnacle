# 平台全量修复、验收与 GitHub + Render + MiMo 上线主计划

**状态：** 实施中，尚未上线。本文覆盖从当前工作树整改、功能修复、完整回归、Staging 现场验收到 GitHub + Render 生产上线的全部工作；代码层已完成的工作不等于取得客户、临床和现场验收，也不代表当前已具备上线条件。

**一期目标：** 修复并验证认知康复服务平台的全部已声明功能，将其从 GitHub 受控分支部署到 Render，并将 MiMo AI 评估、语音转写（STT）和语音播报（TTS）全部纳入正式上线范围。任何代码缺陷、配置、授权、供应商调用、临床确认或现场证据缺失均必须阻断上线，不使用 mock、demo、seed、固定结果、浏览器本地语音或其他 fallback 替代。

### 当前实施快照（2026-07-22）

**已在当前工作树实现并有定向自动化回归的代码工作：**

- 生产 MiMo、病历加密均改为严格的 Render Secret File 合同；生产环境拒绝原始密钥、非直接路径和软链接，并通过 ready gate 验证数据库、迁移校验和与 Key Value。
- MiMo AI/STT/TTS 和连续对话已接入共享 Key Value 原子配额、用户-操作请求限流、预算、输入大小/时长限制、最小化 provider-call 遥测与留存清理 Cron；供应商原文、音频和密钥不写入遥测。
- Render Blueprint、GitHub Actions、Node/pnpm 固定、生产安全头、HTTPS 摄像头门禁、正式 Unity `0.1.2` manifest 校验、MediaPipe/Unity Git 资源门禁均已落在当前工作树。交付门禁现在只从默认 `HEAD` 或经安全解析的完整 SHA/ref 的 commit tree 读取部署文件、静态资源、迁移清单/校验和和源码根目录；已暂存或仅存在于工作区的文件不能作为 GitHub/Render 部署证明。它们尚未成为经审查的受控 Git 提交，不能表述为已完成仓库交付。
- Unity 保存窗口已修复为会话冻结的 `clientStartedAt`；正式 Unity 结果还必须明确声明 `source_only_not_camera_pose=false`，开发输入一律拒绝。Browser Pose 现使用 `browser-pose-result-v1`：服务端严格绑定四项指标的集合、单位、范围、质量、处方时长、冻结起止时间与主结果字段，并重算/校验动态难度事件链；Web 只从冻结的 `clientStartedAt` 开始计窗。Web 对 AI 草稿、连续对话、STT 和 TTS 现在要求调用方显式提供幂等键，并在当前已挂载页面内按逻辑意图保留同一键。服务端第一阶段持久化 outcome 账本已在四条生产外呼窗口启用：同键异请求冲突，未决相同意图即使换键、换医生或换配置也不会再次外呼，`reserved`、终态或未知状态同样被阻断；请求和结果使用 row-bound encryption，TTS 不保存 Base64 音频。它尚未提供跨刷新结果读取、人工对账页面或 TTS 资产存储，不能表述为完整受控重放。
- 生产运行事件已采用严格字段白名单，覆盖 ready、必选 Secret File、Key Value、MiMo 高成本拒绝/上游失败、供应商审计或遥测写入失败和留存失败；不写原始请求、音频、病历、身份标识、任意 metadata 或密钥。连续对话会先完成 snapshot、历史解密和轮次一致性预检再预留额度；provider 失败/响应拒绝的主运行事件在审计写入之前发出，审计失败不会遮蔽真实失败分类。
- MiMo 调用已收紧错误语义：网络、超时、取消和上游 HTTP 失败固定映射为脱敏 `503`；HTTP 成功但 JSON MIME、envelope、schema 或内容无效固定映射为脱敏 `502` 并记录 `response_rejected`；供应商审计或遥测写入失败会发出字段白名单运行事件，阻断本次业务完成并返回固定错误。连续对话的成功审计失败会回滚原 Prisma 事务后才映射 `503`。外呼已经发生的费用或结果不会因此被撤销，仍属于 P0 unknown-outcome。上述路径没有重试、降级模型或原始供应商响应透出。
- MiMo provider 客户端在 allowlist 之后强制拒绝 HTTP 重定向，避免初始可信 endpoint 经跨域跳转绕过主机校验；Render Blueprint 的 `previews.generation` 以字符串 `"off"` 表达，并已通过本地 YAML 结构和项目合同校验。官方 Render CLI/API provider 校验与 Dashboard 导入仍是外部上线门禁，尚未取得通过证据。
- API 生产启动与留存 Cron 已统一到 Nest 实际构建产物 `dist/*.js`；启动脚本、客户启动器、CI runner 和交付合同共用这一单一路径，不保留旧入口或复制产物兜底。
- 受控 `pnpm db:bootstrap:production` 已实现：仅从客户提供的直接 Secret Files 创建机构、`admin_super` 和医师，强制首次改密、事务锁、幂等审计；不创建患者、评估、计划、训练或结果。
- 已在一次性隔离 PostgreSQL 18 中以严格引用完成 `pnpm test:postgres` 的 9 个阶段；provider telemetry 留存重试迁移已在另一一次性隔离 PostgreSQL 上完成真实 `migrate deploy`、`migrate status` 与状态转换验证。固定镜像的 Semgrep `1.162.0` 已在真实 Docker 中扫描 API 范围，结果为 0 findings，且仅留下脱敏报告。Redis 跨实例运行仍只等待 GitHub Linux CI 的专用实例，未使用或改动现有宿主 Redis。

**尚未解决或尚未取得上线证据、必须阻断 Production 的事项：**

1. 客户尚未提供并批准正式 MiMo endpoint/模型/音色、Render 区域与套餐、Secret Files、配额、预算、用户请求限流、遥测留存超时和值班告警接收方；已在对话中出现过的密钥必须先轮换。
2. 客户必须书面确定配额窗口语义、供应商失败后的配额/费用结算规则、网络中断后的持久化幂等结果读取规则，以及 STT 音频时长的计费取整规则。当前 Redis 仍仅承担窗口 `reserved`；第一阶段 `ProviderOperation` 已持久化请求身份、状态、加密结果和未知案件并阻断重复外呼，但没有同键结果查询、人工状态查询、TTS 资产或财务结算。客户冻结计费/退款、留存和审计规则后，仍须实现这些受控能力并回归，不能猜测财务或临床策略。
3. 尚无经授权的真实患者或法务/伦理批准的验收数据、真实同意、临床评估、风险确认、计划、采集条件、协议和批次；不得以 seed、示例分数或手改数据库替代。
4. 尚未在客户自有 HTTPS Staging 上以正式 MiMo 和目标摄像头/麦克风完成 AI、STT、TTS、Browser Pose、Unity、保存、复核、备份恢复、告警和回滚演练；未取得 evidence 不能标记为上线。
5. 已升级到当前稳定 `next`/`eslint-config-next` `16.2.11`，并完成 Web 类型、lint、单元和生产构建回归；完整依赖审计仍报告 1 个高危（`next` 可选依赖链在锁文件中解析的 `sharp@0.34.5`）和 1 个中危（Next 精确依赖的 `postcss@8.4.31`），无低危或严重项。`sharp` 的上游范围为 `^0.34.5`，但直接添加 `sharp@0.35.3` 会在 pnpm 隔离树中与 Next 的旧可选解析并存，不能修复实际调用链，已移除；不能以 override、预发行框架或伪依赖取得假通过。许可证采集现支持 `package.json` 中二选一且直接声明的精确 `license` 或唯一 `licenses[0].type`，已为 `busboy@1.6.0` 和 `streamsearch@1.1.0` 的单一 `MIT` 声明解除元数据阻断；不会接受双字段、多条、空值、README、网页或手填推断。客户批准的许可证策略、Linux SBOM 与 GitHub CI 工件仍缺失。API SAST 已有本地真实 Docker 扫描证据；不能写 waiver、伪造锁文件或跳过门禁。
6. 当前工作树的代码、迁移、Render/CI 和文档大部分仍未追踪或未形成受控提交；交付门禁会因此按设计拒绝当前 `HEAD`，并且不会被 `git add` 绕过。未完成干净 clone 可复现构建、GitHub Required Check 和真实 Render Blueprint 校验前，不可作为部署基线。
7. Redis 跨实例集成、YAML 结构解析、连续对话限流绑定、结构化运行事件、Linux SBOM/许可证门禁和固定 Semgrep SAST 均已有代码及本地定向验证；但尚无 GitHub Linux 实跑、客户许可证/安全策略批准、日志转运/告警或 Render/现场 evidence。任一项没有明确退出码和可审查证据前，均保持阻断。

## 0. 总体范围、现状与完成定义

### 0.1 本计划覆盖的功能范围

- 账号、首次改密、Cookie/CSRF 登录、管理员/医师/患者/家属权限与审计。
- 患者建档、同意、授权撤回、临床评估、风险确认、康复计划、采集条件/协议/批次、训练会话、结果复核、家属脱敏摘要和导出审计。
- MiMo AI 评估草稿、连续对话、STT、TTS、医师人工复核、调用证据、费用/配额和日志留存。
- 浏览器体感、摄像头/麦克风权限、MediaPipe、Unity WebGL、Bridge、动作指标、质量门禁、异常复核和现场证据。
- GitHub 治理、数据库迁移、Render 架构、HTTPS、密钥、监控、备份、回滚、Staging、Production 和客户验收包。
- 穿戴设备接入和公开社交广场只有在客户补充设备协议、隐私/审核规则和运营责任后才进入本期变更；在此之前不能被宣称为已上线能力。

### 0.2 已验证的技术基线

| 项目                    | 已验证状态                                                                                                                                                                                                                                                                                                         | 仍需完成的工作                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 静态与单元回归          | Node 24 冻结安装、数据库/API/Web 的定向静态门禁、Blueprint、迁移清单、Unity 工件、交付门禁和历史凭据扫描均已记录本地通过；本次 `pnpm test:unit` 已完整通过（API 859 项）；静态/全量回归在任何构建前强制要求显式 HTTPS `NEXT_PUBLIC_API_BASE_URL`                                                                   | 以显式 CI 测试 origin 重跑时，`check:static` 已越过 API lint 并完成 API/Web 构建，随后按设计阻断于客户批准的 Linux Production SBOM/许可证策略；GitHub CI 会更早由真实依赖审计阻断 `sharp@0.34.5`、`postcss@8.4.31`。仍需 GitHub Linux CI 与完整依赖审计通过 |
| Unity 节奏触达 3D       | 保存窗口起点已统一为会话冻结的 `clientStartedAt`；`0.1.2` WebGL 产物和哈希已校验                                                                                                                                                                                                                                   | 正式 HTTPS 设备上完成 loader、Bridge、结果入库、动作指标和审计现场验收                                                                                                                                                                                      |
| 隔离环境                | 空库迁移、试点机构/账号和 `rhythm_reach_3d` 正式配置已完成                                                                                                                                                                                                                                                         | 不得作为生产资料或真实患者证据；Production 必须重新初始化                                                                                                                                                                                                   |
| AI/STT/TTS/连续对话接口 | 已实现 Secret File 合同、KV 原子配额与限流、输入限制、最小化遥测、留存任务、供应商 transport 失败 `503`/JSON 响应拒绝 `502` 和 ready 检查；不使用本地或固定结果 fallback                                                                                                                                           | Redis 真集成/CI、供应链门禁、客户正式 MiMo 配置及真实 HTTPS 调用和临床验收                                                                                                                                                                                  |
| PostgreSQL 与 API SAST  | 隔离 PostgreSQL 18 的严格 `test:postgres` 9 阶段和真实 Docker Semgrep `1.162.0` API 生产源扫描（当前 25 个非 `*.spec.ts` TypeScript 文件、6 类本地规则、0 findings）均通过；固定规则样例先验证所有本地类别与 `RegExp.exec` 非误报，报告严格证明 `scannedScope` 与请求范围一致，SAST 原始报告已清理，只保留脱敏报告 | GitHub Linux CI 运行、CI 工件归档、客户全仓规则范围/严重级别/修复 SLA 批准，以及真实 Render 运行证据                                                                                                                                                        |
| 本地启动                | API/Web/数据库可在本地隔离环境启动                                                                                                                                                                                                                                                                                 | 不能替代 Render、HTTPS、备份、监控、生产密钥和现场实机验收                                                                                                                                                                                                  |

### 0.3 当前必须关闭的技术与交付缺口

1. **P0，受控源码基线缺失：** 当前实现、迁移、CI、Blueprint、测试和运行说明尚未全部审查、追踪和提交。`delivery:check` 已严格从 `HEAD` 或显式安全 SHA/ref 的 commit tree 验证部署文件、正式 Unity/MediaPipe 资源、Prisma manifest/迁移校验和和 API/Web/DB 源码根目录；暂存区不构成证明。必须在不混入现有无关工作树改动的前提下形成最小受控提交，并用干净 clone 重建。
2. **P0，高成本调用的受控结果读取与对账缺失：** 第一阶段 `ProviderOperation`/outbox/case 已持久化四类生产外呼的请求身份、状态、加密结果及未知案件；同键异请求或不同执行语义会冲突，既有 `dispatching`、终态或未知状态均不会再次外呼。供应商成功后的审计/响应失败仍可能造成费用已发生而结果未被安全返回；刷新页面、身份变化、跨实例和服务端故障后尚无可查询、可授权返回的业务结果。客户必须先填写私有副本 `docs/templates/mimo-provider-outcome-policy.template.json` 并以 `mise x node@24.14.1 -- node scripts/verify-mimo-provider-outcome-policy.mjs -- <customer-policy.json>` 严格通过，冻结状态查询、对账、计费退款、未知结果、加密资产和四类留存规则；详见 `docs/mimo-provider-outcome-policy-runbook.md`。随后必须实现同键受控结果读取、人工对账/供应商状态查询、资产和结算，并完成全链路回归；不得自动重投或更换新键。
3. **P0，生产防护的真依赖验证未闭环：** 隔离 PostgreSQL 严格回归已通过，但 Redis 跨进程原子性、连续对话高成本限流、留存任务和 Render Cron 的真实服务约束仍必须完成 GitHub Linux CI 与 Render 验证；KV 故障必须 fail closed，不能改为内存计数或放行。
4. **P0，供应链门禁失败：** 已升级到当前稳定 `next`/`eslint-config-next` `16.2.11`，但当前锁仍让其可选依赖解析为高危 `sharp@0.34.5`，且 Next 精确依赖中危 `postcss@8.4.31`。将 `sharp@0.35.3` 另装为直接依赖已经实测为并存而非替换，故未保留；不能以 preview/canary、override 或伪依赖规避。生产清单现仅接受直接、唯一、非空的 `license` 或旧式 `licenses[0].type` 声明，已能读取 `busboy@1.6.0` 与 `streamsearch@1.1.0` 的单一 `MIT`；不会依据 README/网页推断或接受多声明。固定 Semgrep 已有真实本地 Docker 扫描，但 Linux 生产树生成、客户批准的许可证策略和 GitHub 工件仍未取得证据。修复必须更新真实依赖与锁文件，不能通过禁用扫描、降低严重级别或虚假 waiver 放行。
5. **P1，生产可观测性与恢复证据缺失：** 最小化结构化运行事件已实现，包含供应商审计/遥测写失败；但日志转运、告警路由、容量阈值、PITR/恢复、应用回滚与数据库前滚演练尚未在客户环境取得证据。
6. **P1，SAST 规则与全仓范围仍是本地基线：** 固定 Semgrep 会先执行覆盖 6 类本地规则的最小语义样例（包括 `RegExp.exec` 非误报），再严格发现并扫描当前 `apps/api/src/` 下全部 25 个非 `*.spec.ts` 生产 TypeScript 文件，拒绝符号链接、非普通文件、未知规则、异常 errors 或不完整/额外扫描路径；它既不是全仓 SAST，也不是客户批准的完整规则集。客户安全负责人必须决定全仓范围、规则、报告留存和处置 SLA，并在 GitHub Linux 中获得可审查工件。
7. **P1，Render/GitHub 实施缺失：** Render 工作区、隔离服务、Secret Files、私网连接、DNS/TLS、GitHub 分支保护、Required Checks、Secret Scanning 和实际 Blueprint deploy 尚未由客户完成。CI 已移除在 Corepack 固定 pnpm 激活前执行的 `setup-node` pnpm cache 请求，避免缓存步骤依赖未安装的 pnpm；首次真实 GitHub run 仍须验证整条受控流水线，不能以本地结构测试代替。
8. **P1，训练内容的现场缺口：** 静态构建通过不等于现场可用；浏览器体感和 Unity 都必须在客户 HTTPS 设备上完成真实摄像头、质量门禁、训练保存和审计验真。
9. **P1，正式数据闭环缺口：** 当前没有客户批准的患者同意、真实临床评估、风险确认、采集条件、协议、批次或正式验收包。此类资料只能由客户/临床方提供，不能由开发方补造。

### 0.3.1 修复与证据台账

本台账只描述截至本文日期的工作树和已记录测试，不能替代第 11 节的 Production 结论。`已实现` 表示代码和定向回归存在；它不表示已提交、已部署或已取得真实临床/客户 evidence。

| 修复项                 | 当前技术状态                                                                                                                                                                                                                                                                                                            | 已有或要求的验证                                                                                                                               | 仍然阻断的条件                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unity 节奏触达保存窗口 | 已实现：动作指标窗口使用冻结的 `clientStartedAt`，正式 WebGL 为 `0.1.2`                                                                                                                                                                                                                                                 | Unity 源码测试、WebGL manifest/hash 校验；现场须断言五项开始/结束时间                                                                          | 真实 HTTPS 摄像头、业务链和医师复核未验收                                                                                                                |
| 生产密钥与就绪检查     | 已实现：Secret File 严格路径/内容校验、数据库/迁移/KV `ready` fail closed                                                                                                                                                                                                                                               | 配置、交付和 ready 定向测试                                                                                                                    | 新 MiMo 凭据、Render Secret Files、真实 `ready` 接流未验证                                                                                               |
| MiMo 高成本边界        | 已实现：allowlist、解码后音频字节/整数时长、配额、预算、用户-操作限流；连续对话的本地 snapshot/历史/轮次预检在额度预留之前完成；双 API 实例 CI runner 候选已定义；Redis 同键重复会被阻断，Web 当前页同一逻辑意图复用调用方键并在未知结果时阻断重发；第一阶段 `ProviderOperation`/outbox/case 已阻断跨实例同键的重复外呼 | AI 草稿、连续对话 append、STT、TTS 路由 metadata/边界定向测试；当前页请求身份测试；Redis 双 gate 原子性测试；runner 在非 CI/缺专用依赖时先拒绝 | GitHub CI 中两个真实 API 实例共享 PostgreSQL/Redis 的记录证据、客户确认额度/窗口/并发/计费语义、跨刷新/跨实例的受控业务结果读取/人工对账及真实供应商验收 |
| 供应商调用遥测与留存   | 已实现：最小化 telemetry、UTC 单日记录、限时 Cron、仅删除 provider telemetry；持久化 `executionDeadlineAt`/`attemptCount`，仅原子接管 `failed` 或已过期且有 deadline 的 `running`，复用原始 cutoff；`completed`、活跃 `running` 和历史 deadline 为空的 `running` 均 fail closed                                         | migration manifest、留存状态机/失败审计测试；一次性 PostgreSQL 的真实迁移、状态与重试转换验证                                                  | Render Cron、告警接收、历史 deadline 为空记录的人工审计处置及真实生产数据库演练未验收                                                                    |
| 浏览器设备边界         | 已实现：HTTPS 安全上下文、摄像头/麦克风明确阻断、生产安全头                                                                                                                                                                                                                                                             | Web 定向测试和正式静态资源门禁                                                                                                                 | 客户域名/TLS、目标设备/浏览器及真实采集 evidence                                                                                                         |
| CI、Blueprint 与供应链 | 候选实现：固定 Actions SHA、历史凭据扫描、迁移/双 API 服务、Blueprint 结构检查、严格 audit、Linux SBOM/许可证与当前全部 25 个 API 生产 TypeScript 文件的 6 类本地规则 SAST 工件                                                                                                                                         | Node 24 本地脚本/结构测试、`next` `16.2.11` Web 回归与本地真实 Docker Semgrep 已通过；GitHub CI 必须有真实 run                                 | 锁定 `sharp@0.34.5`/`postcss@8.4.31` 审计阻断；Linux SBOM/客户许可证策略、全仓 SAST 规则范围决定、保护规则、工件归档和 Render 导入均未闭环               |
| 可观测性、告警与恢复   | 已实现严格字段白名单的运行失败事件，包含 MiMo 传输失败、响应拒绝和遥测写失败；尚未取得上线证据                                                                                                                                                                                                                          | 事件单测、事件到 sink/receiver 的注入演练、PITR、应用回滚和数据库前滚演练                                                                      | 客户日志/告警平台、阈值、RPO/RTO、值班与环境演练                                                                                                         |
| 临床业务与现场验收     | 开发方不得填补真实资料缺口                                                                                                                                                                                                                                                                                              | 仅可在客户批准的真实或专用验收数据上完成全链路                                                                                                 | 同意、评估、风险、计划、协议、批次、设备与签字均未提供                                                                                                   |

### 0.4 全量完成定义

平台只有在以下四层同时通过后才可称为“全部功能可用并可上线”：

1. 代码层：所有已声明功能有明确实现、失败阻断、审计和自动化回归；没有生产 fallback。
2. 环境层：GitHub、Render、密钥、数据库、HTTPS、监控、备份与回滚按本计划部署并演练。
3. 真实能力层：MiMo AI/STT/TTS、浏览器体感、Unity 和完整临床业务链在正式 HTTPS Staging 中实测通过。
4. 交付层：客户资料、授权、临床确认、脱敏 evidence、审计反查、验收报告和上线签署完整归档。

### 0.5 凭据安全处置

- 已在对话渠道提供过的 MiMo 凭据必须视为已暴露的凭据处理：在任何 Staging 或 Production 配置前，由客户在 MiMo 控制台撤销或轮换，并生成新的生产凭据。
- 新凭据只由客户指定管理员录入 Render Production Secret File。开发人员、GitHub Actions、文档、前端、测试、截图、日志和验收包均不得接触或复制其值。
- 任何历史本地 `.env`、临时配置文件或终端会话都不得迁移为生产密钥来源；首次上线前由客户完成清理和访问权限复核。

### 0.6 全量功能修复与验收矩阵

| 工作流                 | 必须完成的修复或核对                                                                                                                        | 自动化与现场完成判定                                                                   | 外部输入/责任                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 账号、认证与权限       | 固定 Node/运行时；生产 Cookie、CORS、CSRF、代理头和首管理员初始化策略；删除生产门禁对默认患者密码的错误依赖                                 | 管理员、医师、患者、家属首次改密、登录、登出、跨子域 Cookie、拒绝越权和审计均回归通过  | 客户确认角色、机构和运维管理员                             |
| 隐私与临床数据         | 同意版本、撤回阻断、患者-医生归属、家属脱敏、导出审批和敏感字段加密边界                                                                     | 授权、撤回、脱敏摘要、导出审计和数据访问拒绝契约通过                                   | 患者授权、法务留存/删除规则、临床负责人                    |
| 评估、风险、计划与采集 | MMSE/CDR/AD-8 等真实输入的字段校验；医师风险确认；计划确认；采集条件、协议、批次和 session 一致性                                           | 空库 API 闭环与真实验收患者闭环均通过；不接受示例分数或手改记录                        | 真实评估、风险、处方、采集阈值和医师确认                   |
| MiMo AI、STT、TTS      | Secret File、启动配置、MiMo 三项调用、共享配额、超时、最小化审计、留存清理和 ready 检查                                                     | AI 草稿到医生复核、真实录音 STT、STT-AI 组合、TTS 真音频播放和审计验收全部通过         | 新 MiMo 密钥、正式 endpoint、模型/音色、预算、数据处理授权 |
| 浏览器体感             | HTTPS 安全上下文、摄像头权限、MediaPipe 资源、质量门禁、异常结果复核和证据导出边界                                                          | 目标浏览器/摄像头下有效样本、四项指标、截图/录屏、训练记录和审计只读反查通过           | 设备、浏览器、场地、网络、验收人员                         |
| Unity WebGL            | `0.1.2` manifest/hash、loader、Bridge、冻结时间窗口、五项指标、重复提交阻断和异常复核                                                       | `windowStartedAt=clientStartedAt`、有效质量样本、训练结果入库、截图/录屏和审计反查通过 | Unity 素材/插件授权、设备、真实训练与现场负责人            |
| 训练内容与前端体验     | 清点所有正式训练内容，确认每项 runtime、版本、指标、权限、发布状态；修复验收中发现的状态文案、禁用条件、移动端布局、键盘/读屏和错误提示问题 | Web 生产构建、视觉回归、角色关键路径和实际设备人工验收通过                             | 客户冻结训练内容、指标和支持设备清单                       |
| 数据库与加密           | 生产 `migrate deploy`、加密密钥 KID 固定、后续轮换设计、历史迁移演练和前向恢复流程                                                          | Staging 空库迁移、已数据副本迁移、备份恢复和读取核验通过                               | 生产数据库、备份策略、RPO/RTO、数据负责人                  |
| 运维与发布             | `render.yaml`、CI、ready、告警、日志、PITR、回滚和维护窗口                                                                                  | Staging 部署、故障告警、恢复演练和 Production Go/No-Go 通过                            | Render/DNS/监控访问、运维责任人                            |

### 0.7 产品修复原则

1. 每个代码缺陷先以单元、契约、集成或浏览器测试复现，再提交最小修复和回归测试；不以修改文案、绕过校验或手动改库替代修复。
2. 每个“缺真实输入”的事项都登记为客户/临床方门禁，不写成开发兜底数据。
3. 每个训练内容在正式发布前必须具有可追踪的运行时、版本、输入模式、指标、质量规则、权限和发布审计；不得把 seed、demo 或本地运行内容混入正式库。
4. 每次合并后执行相应范围回归；涉及认证、共享 API、训练结果、加密、权限或运行时配置的改动必须执行完整静态回归和受控数据库集成回归。

### 0.8 功能范围与宣传口径矩阵

上线前由产品、临床和交付负责人共同冻结这一矩阵，并把每个条目关联到负责人、PR、测试、版本和证据包。任何未列入“本期正式范围”的条目都不得在客户材料、演示或上线公告中描述为可用。

| 能力                                            | 一期范围与当前定位                                                      | 上线前必须补齐的证据                                                       | 禁止宣传口径                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| 四角色与核心临床链路                            | 本期正式范围；已有业务骨架，仍待生产配置和真实闭环验收                  | 角色回归、同意/撤回、评估、风险、计划、训练、复核、脱敏导出和审计 evidence | 未完成实测前，不称为“已正式验收”                     |
| 浏览器体感                                      | 本期候选范围；至少一个已发布 `browser_pose_canvas` 内容须实机验收       | 目标设备、有效样本、四项指标、结果/审计反查和现场负责人签字                | 不称为“已支持任意摄像头、离线或弱网恢复”             |
| Unity 游戏                                      | 本期仅确认候选 `rhythm_reach_3d` `0.1.2`；多游戏数量以第 5.6 节清单为准 | WebGL manifest/授权、Bridge、五项指标、真实训练保存和复核 evidence         | 不称为“Unity 游戏库/多游戏矩阵已全部完成”            |
| MiMo AI、STT、TTS、连续对话                     | 本期正式目标；仅限完成正式配置、临床质量及正负向验收后                  | 三条真实供应商调用、连续对话隔离、医生复核、配额/失败阻断和脱敏审计        | 不称为“已接入 AI/语音”或“自动临床诊断”，直至验收完成 |
| 康复推荐                                        | 本期为可解释的规则过滤、标签匹配、加权评分和医师确认                    | 输入、权重、结果、医师确认和审计反查                                       | 不称为协同过滤、疗效预测或自主处方                   |
| 难度自适应、疗效趋势、协同过滤、报告模板        | 后续增强，不是本期承诺                                                  | 另行立项、临床方法、数据治理和专项验证                                     | 不得作为当前系统能力                                 |
| 离线/弱网恢复、穿戴设备、多中心分析、院内私有化 | 后续或客户输入阻塞                                                      | 设备/协议、网络策略、数据边界、部署责任及现场 evidence                     | 不得以现有 Web/Render 部署暗示支持                   |
| 公开社交广场                                    | 不在一期；当前仅私有照护圈                                              | 独立隐私政策、内容审核、举报处置、运营责任和专项验收                       | 不得称为公开社交功能                                 |

## 1. 已确认与边界

- GitHub 是唯一代码来源；Render 是一期生产托管平台。
- MiMo 是 AI、STT、TTS 的一期唯一供应商。当前代码只接受 `xiaomi-mimo`、`xiaomi-mimo-audio-understanding` 与 `xiaomi-mimo-tts`，不能通过填写讯飞、星火或其他供应商环境变量替代。
- 已提供的 MiMo 密钥属于机密。不得写入本文件、Git、`render.yaml`、`.env`、日志、截图、测试夹具或审计元数据。
- Render 上生产 API、Web、Postgres 和 Key Value 必须属于同一客户工作区、同一区域；Staging 与 Production 必须拥有完全独立的数据库、Key Value、密钥、账号与证据。
- 生产 Web 和 API 使用同一注册域的两个自有 HTTPS 子域，例如 `https://app.<customer-domain>` 与 `https://api.<customer-domain>`。不得把 `onrender.com` 地址当作正式 Cookie 和临床验收边界。
- 当前本地隔离库、临时服务、试点账号和 Unity 发布记录只用于准备或回归，不能作为生产数据或正式现场证据。

## 2. 上线前决策门禁

在开始生产代码改动前，客户、临床负责人和运维负责人应书面确认以下事项：

1. Render 工作区、区域、付费套餐、数据所在地和客户自有 DNS 域名。
2. MiMo 的正式 HTTPS endpoint、AI 模型版本、STT 模型版本、TTS 模型、音色、输出格式、QPS、并发、预算上限、费用审批和服务等级。
3. `AI_REQUIRED_FOR_LAUNCH=true`、`SPEECH_REQUIRED_FOR_LAUNCH=true`、`TTS_REQUIRED_FOR_LAUNCH=true`。这三个值均为正式上线范围，不能为通过部署检查而改为 `false`。
4. Render Secret Files 是否为客户批准的密钥托管载体；如客户强制使用外部密钥管理器，必须明确供应商、身份认证机制和运行时取密协议后再改造。
5. AI、音频和病历数据的第三方处理授权、日志留存周期、删除责任、导出审批、备份责任和紧急联系人。
6. AI/STT/TTS 限流和预算值。数值由客户批准的 MiMo 配额、临床工作量和成本预算决定，不在代码中猜测默认生产阈值。
7. 用于现场验收的真实、经授权患者资料，或经客户与伦理/法务批准的专用验收数据；不得由开发方伪造。

未完成任一项时，计划停留在 Staging 或代码准备阶段。

### 2.1 数据流、临床与合规门禁

客户法务、临床负责人和数据负责人须在正式 AI 或训练采集前共同签署以下表格。此表是实施输入和验收证据，不由开发人员填写结论。

| 门禁        | 必须冻结的内容                                                                                                                             | 通过证据                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| MiMo 数据流 | 每类 AI/STT/TTS 请求发送的字段、用途、最小化规则、存储位置、留存/删除、处理地域、供应商训练/二次使用、子处理者与 DPA                       | 数据流图、供应商条款/DPA、法务签字和系统字段白名单 |
| 授权与撤回  | 患者行为能力评估、监护人签署规则、`ai_processing`/`microphone_capture`/`camera_capture` 等同意版本、撤回后的未来调用阻断与历史法定留存处理 | 授权记录、撤回测试、患者/监护人和临床负责人签字    |
| 临床安全    | 训练适用人群、禁忌、不良事件定义、中止条件、医生复核责任、现场医护负责人和紧急处置流程                                                     | 临床 SOP、现场名单、异常/中止演练记录              |
| 验收数据    | 真实患者或专用验收数据的来源、授权编号、最小化范围、保管方式、验收后删除/留存责任                                                          | 数据使用批准、证据包清单、清理或留存记录           |
| AI 质量阈值 | AI 输出 schema、临床完整性和安全表述；STT 在目标普通话/方言/噪声/医学术语下的准确性；TTS 发音、可懂度、音色和终端播放要求                  | 临床负责人冻结的案例集、阈值、评分表和签字         |

模型、endpoint、提示词版本、音色、输出格式或供应商处理条款任一变更，均使对应 AI 质量 evidence 失效，必须重新验收。

## 3. 目标 Render 架构

Render Blueprint 的候选实现位于当前工作树根目录 `render.yaml`。不使用 `客户提供/康复平台3.0/render.yaml`，该文件属于旧的 Vite/npm 单服务项目且已被忽略。候选实现尚需受控提交、结构校验和真实 Render 导入验证。

| 资源                            | Render 类型      | 作用                                           | 网络与数据要求                                         |
| ------------------------------- | ---------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `rehab-platform-web-prod`       | Node Web Service | Next.js Web、Unity WebGL 和 MediaPipe 静态资源 | 公网，仅 `app.<customer-domain>`                       |
| `rehab-platform-api-prod`       | Node Web Service | NestJS API、认证、业务链、AI/STT/TTS           | 公网，仅 `api.<customer-domain>`；连接私网 DB/KV       |
| `rehab-platform-db-prod`        | Render Postgres  | 业务、审计和加密数据                           | 与 API 同区域，API 使用内部连接串                      |
| `rehab-platform-kv-prod`        | Render Key Value | AI/STT/TTS 跨实例配额与限流计数                | 与 API 同区域，仅私网访问                              |
| `rehab-platform-retention-prod` | Render Cron Job  | 已批准的供应商调用遥测留存清理                 | 与 API/DB 同区域；独立最小权限；只清遥测，不删业务审计 |

Next.js 当前不是静态导出应用，必须作为 Node Web Service 运行。`apps/web/public` 中的 Unity 和 MediaPipe 文件随 Web 服务构建发布；生产前必须确认 Git 已追踪这些资源。当前最大单一 WASM 文件低于 GitHub 单文件 100 MB 限制，不需要 Git LFS；不得提交 Unity 编辑器的 `Library` 等本地生成目录。

Render 支持以仓库根 `render.yaml` 管理服务、数据库、环境变量引用和 `preDeployCommand`；API 应使用 Render Postgres 的同区域内部连接串。[Render Blueprint 规范](https://render.com/docs/blueprint-spec) [Render Postgres 内网连接](https://render.com/docs/postgresql-creating-connecting)

Render Blueprint 支持 `cron` 服务类型；Render 会保证同一 Cron Job 任一时刻最多运行一个实例。留存任务仍须在应用侧实现幂等检查、明确退出码、成功/失败审计和告警，不能依赖第二个“备用”调度器。[Render Cron Jobs](https://render.com/docs/cronjobs) [Render Blueprint 规范](https://render.com/docs/blueprint-spec)

### 3.1 Staging 与 Production 的隔离和推广模型

**当前 P0 缺口：** 当前候选 `render.yaml` 只声明 `*-prod` 资源；API、Web 与 Cron 均明确设置 `autoDeployTrigger: off`，以避免检查通过的提交直接部署到 Production。它仍未声明独立 Staging 或不可变 SHA/tag 的审批推广机制，因此不得作为已完成的 Staging/Production 配置或连接客户生产域名。

上线前必须由客户和运维负责人采用 Render 已支持且经 Dashboard 实测的隔离方式，并将结果纳入受控配置：

1. Staging 与 Production 必须是两个独立 Render 环境，拥有不同的 API、Web、Postgres、Key Value、Cron、Secret Files、域名、账号权限和 evidence 存储位置；不得复用任何数据库、Redis DB、密钥文件或患者资料。
2. Staging 仅从受保护分支的 Required Checks 通过提交自动部署。API、Web 和 Cron 均必须以 `NODE_ENV=production` 运行，使 Secret File、Key Value 与高成本门禁和 Production 一致；环境差异只能来自独立 Render 项目、资源、域名和密钥，不能通过 `NODE_ENV=staging` 降低门禁。它必须先完成迁移、`/health/ready`、真实供应商和设备验收。
3. Production 只能从已审批的不可变 Git SHA/tag 推广；禁止让普通分支的 `checksPass` 直接接入 Production。客户必须在 Render Dashboard 实测并归档该推广机制、审批人和 deploy ID。
4. 无论采用两个经验证的 Blueprint 配置、两个项目/服务组或 Render 支持的其他隔离机制，都必须先由 `verify:render-blueprint`/CI 对每个候选配置单独验证名称、区域、变量、Secret File 和数据库/KV 引用，再导入 Render。不得凭假设复制当前 Production 候选 YAML。
5. 在这个冲突关闭前，所有 `*-prod` 名称只表示候选资源名称，不能创建、接流或绑定客户生产域名。

## 4. GitHub 整理与仓库治理

### 4.1 首次受控提交

1. 审查当前大量已修改和未追踪文件，按功能拆分为可审查提交：平台代码、数据库迁移、Web/Unity 静态资源、测试、文档和部署配置。
2. 明确排除 `.env*`、临时私钥、客户资料包、数据库导出、验收原始音频/视频、Playwright 运行结果和本地 Unity 编辑器缓存。
3. 确认 `apps/web/public/mediapipe/`、`apps/web/public/unity/rhythm_reach_3d/0.1.2/`、正式 manifest 以及桥接代码被追踪并在干净 clone 中可构建。
4. 固定 Node LTS 和 pnpm 版本，新增 `.node-version` 或根 `package.json` 的 `engines`。在选定版本的干净环境重新执行完整构建后才锁定。
5. 新增根 `render.yaml`、`.github/workflows/ci.yml` 和 Render 生产运行说明。不得提交任何实际 Render Secret File 内容。
6. 在候选提交上执行 `mise x node@24.14.1 -- pnpm delivery:check -- --git-ref <完整提交 SHA>`；该检查必须只读取该 commit tree，不得用 `git ls-files`、暂存区或工作区存在性替代。随后从同一 SHA 创建全新干净 clone，重新执行冻结安装、构建、静态回归和迁移清单校验，并将明确退出码与 SHA 归档。
7. `.gitattributes` 只允许对三个经 manifest/hash 校验的 MediaPipe WASM JavaScript 文件和 `0.1.2.framework.js` 关闭 whitespace 检查；不得对 `public/`、Unity 目录或其他文件使用通配例外。本次新增 `.gitignore` 规则只忽略离线安装器 `.dmg`、`tmp/playwright-qa/` 和 `.superpowers/` 本地工件，离线部署脚本、说明和手册生成源必须仍可追踪。

### 4.2 GitHub 保护规则

1. 建立受保护的 `main` 或 `production` 分支：禁止直接推送，至少一名代码审批者，必须通过 CI。
2. 启用 GitHub Secret Scanning、Push Protection 与 Dependabot 安全更新；配置仓库管理员和部署权限最小化。
3. Staging 只连接受保护分支，并设置 `checksPass` 自动部署；Production 候选保持 `autoDeployTrigger: off`，只能通过客户批准、可审计且指向不可变 Git SHA/tag 的推广机制部署。不要使用 GitHub Action 传递 MiMo 密钥；如使用 Render Deploy Hook，Hook URL 仅保存为 GitHub Secret。
4. PR Preview 默认关闭；如确有需要，只允许人工创建独立、无临床数据、无生产密钥的环境。

## 5. 生产代码改造工作包

### 5.1 严格的 Render Secret File 注入

**实施状态（2026-07-22）：** 严格 Secret File 读取器、配置契约、ready 检查和回归测试已在当前工作树实现。以下是必须保留的生产合同；在其成为受控提交并经客户 Secret File/Render 验证前，仍不可上线。

统一运行时密钥解析模块、API 配置、AI 服务和生产门禁必须满足：

1. Production 只接受 Render Secret File 路径，且路径固定在 `/etc/secrets/` 下。
2. 生产 API 使用一个 MiMo 密钥文件，例如 `/etc/secrets/mimo_api_key`；AI、STT、TTS 使用同一个已解析的 MiMo 凭据，不再分别从原始 `AI_API_KEY`、`SPEECH_API_KEY`、`TTS_API_KEY` 读取。
3. 使用独立的 `/etc/secrets/sensitive_data_key` 保存 32-byte canonical Base64 病历加密密钥。
4. 非秘密配置保存 `MIMO_API_KEY_REF`、`SENSITIVE_DATA_KEY_REF` 和对应 `*_KEY_FILE`。引用使用客户批准的版本标识，例如 `secret-manager://render/rehab-platform-prod/mimo-v1`，仅用于证据和审计，不包含密钥内容。
5. 生产模式中，文件缺失、内容为空、Base64 格式错误、引用非法、原始密钥变量存在，或原始变量和文件同时存在时，启动必须失败。
6. 本地开发模式可以显式使用本地变量，但必须和 Production 模式严格分支；不能在生产模式中自动退回环境变量。
7. Render Blueprint 和 GitHub 中只声明文件路径与 `sync: false` 的非秘密占位；Secret File 内容由客户指定管理员在 Render Dashboard 的 Production 环境手工录入。
8. 一次性首启还必须在 API 服务环境中挂载 `PRODUCTION_BOOTSTRAP_CONFIG_FILE=/etc/secrets/production_bootstrap.json`、`PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE=/etc/secrets/production_bootstrap_admin_password` 和 `PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD_FILE=/etc/secrets/production_bootstrap_doctor_password`。这些路径是 Blueprint 受检的非秘密配置；文件内容只由客户在 Render Secret Files 维护，且 `pnpm db:bootstrap:production` 必须人工触发，不能作为部署钩子自动执行。

Render Secret Files 在运行时可用，并可通过环境组受控共享；密钥不应硬编码到 Blueprint。[Render 环境变量和 Secret Files](https://render.com/docs/configure-environment-variables)

### 5.2 病历加密密钥稳定性与轮换

1. 首次生产部署前生成一个新的 32-byte Base64 加密密钥和不可变 KID，并通过 Secret File 配置。
2. 生产首次启用后不得通过替换 Secret File 直接轮换该密钥；现有加密 envelope 要求 KID 和当前密钥匹配，直接替换会导致历史记录无法解密。
3. 后续轮换单独实施：多 KID 解密支持、受控重加密任务、副本演练、校验、备份和回滚方案。该工作完成前，密钥轮换只能按变更冻结处理。

### 5.3 AI/STT/TTS 生产能力

**实施状态（2026-07-22）：** 当前工作树已实现严格 MiMo allowlist、JSON MIME/body/schema 校验、共享 Key Value 配额与用户-操作限流、输入大小/时长限制、最小化遥测、UTC 单日记录及失败/明确超时运行的受控留存接管和 ready gate。`completed`、活跃 `running` 和历史 `executionDeadlineAt=null` 的运行严格阻断。供应商审计或遥测写入失败会发出只含操作类别的运行事件并固定失败；连续对话的成功审计仍在原事务中，失败即回滚。第一阶段 `ProviderOperation`/outbox/case 已接入四类生产外呼：规范化 HMAC 识别同键异负载、加密保存请求/结果、状态条件迁移并在不确定结果时建案，绝不自动重试或新键重发。Web 已要求四类高成本请求显式提供键，并在当前页按经摘要的逻辑意图复用该键；未知结果不发送第二次请求。本地通过 `pnpm verify:mimo:connectivity` 以无患者信息的固定探针真实验证 AI 对话、TTS 音频载荷和 TTS 生成音频至 STT JSON 的供应商鉴权、模型与响应合同；该手动命令不进入 CI、不创建业务记录，也不构成受审计的应用流程或临床验收。Redis 真集成、供应链检查、客户批准的数值和实际供应商/临床验收尚未完成。该阶段尚无跨刷新结果读取、人工对账页面、供应商状态查询、TTS 资产或财务结算，不能将它表述为完整受控重放。

1. 在启动时集中校验 MiMo endpoint、模型、音色、输出格式、超时、密钥引用、Secret File 和留存配置；不能等真实患者请求到达后才发现缺少配置。
2. 保留现有“上游失败即失败、无自动重试”的原则；为 AI、STT、TTS 增加分别配置的超时和响应大小限制。
3. 为 AI 草稿、连续会话、STT 和 TTS 增加共享配额：按用户、患者和机构计数；STT 增加音频分钟限制，TTS 增加字符限制。
4. 使用 Render Key Value 的私网连接进行原子计数。KV 不可用时拒绝高成本调用，不能退回本机内存限流或放行。
5. 记录最小化调用证据：供应商、模型、提示词版本、密钥引用、调用 ID、请求 ID、耗时、状态类别和内容/音频哈希。禁止写入密钥、Cookie、Base64 音频、完整敏感评估内容或完整转写。
6. 实现经客户法务批准的 provider-call 留存清理任务；不得删除业务审计日志。
7. MiMo endpoint 仅允许客户批准的 HTTPS host 清单，拒绝重定向至其他域、内网地址或 IP 字面量。输入音频和 TTS 输出校验其规定 MIME；成功 JSON provider 响应必须为 `application/json` 或 `application/*+json`，并校验 body/schema、大小、解码后字节数和调用 ID。所有 transport 类失败（含网络、超时、取消和上游 HTTP）固定返回脱敏 `503`；HTTP 成功但 JSON MIME、envelope、schema 或内容无效固定返回脱敏 `502` 并写入 `response_rejected`。不得透出原始供应商响应，也不得为任一失败自动重试。
8. 配额递增、预算扣减和请求幂等键须使用 Key Value 原子操作；当前 Redis TTL 窗口内的同一 `operation + organization + patient + user + key` 仅能保留一次，但它不保存 outcome、payload/hash 或永久计费结论。计数窗口的 TTL 会在每次成功 reservation 时刷新，用户-操作限流也会在 service 幂等 gate 前消耗一次；窗口、过期后的费用语义和并发竞态必须由客户确认并有集成测试。
9. 前端不得为同一逻辑 AI 草稿、对话 turn、STT 录音或 TTS 文本于失败后生成新键。当前实现已在同一已挂载页面内满足此项，服务端第一阶段 operation 也会在跨实例/刷新后阻断既有键的重复外呼；键由调用方显式提供，未知结果保留该逻辑意图并阻断再次外呼；不写入 `localStorage`，不自动重试，也不允许“再次点击”换键。客户批准计费、退款、留存和审计后，再以数据库受控结果查询实现跨刷新/跨实例恢复。

### 5.4 健康检查与应用安全

**实施状态（2026-07-22）：** `live`/`ready`、生产安全头、HTTPS 设备门禁和最小化结构化运行失败事件已经在当前工作树实现并有定向回归。Render 健康检查、真实域名/TLS、设备权限、日志转运与告警仍须在 Staging 现场验证。

1. 将当前固定成功的 `/health` 拆分为 `/health/live` 和 `/health/ready`。
2. `live` 只证明进程存活；`ready` 执行数据库 `SELECT 1`、核对已部署迁移状态，并在任一 AI 范围为必选时验证 Key Value 连通性与原子操作。它还验证所有必选 AI/STT/TTS Secret File 与配置已解析，但不外呼供应商、不生成费用、不伪造探测调用。
3. Render API 健康检查指向 `/health/ready`。Render 只有在 HTTP 健康检查持续成功时才把新实例接入流量。[Render Health Checks](https://render.com/docs/health-checks)
4. API 在生产显式监听 `0.0.0.0:$PORT`，精确设置 `WEB_ORIGIN`，强制 `COOKIE_SECURE=true`。
5. 在 Next 配置中增加 CSP、HSTS、`X-Frame-Options` 或 `frame-ancestors`、`X-Content-Type-Options`、`Referrer-Policy` 和限制摄像头/麦克风权限的 `Permissions-Policy`。
6. 在训练与录音页面加入 `isSecureContext` 明确门禁，非 HTTPS 时不请求设备权限且给出阻断提示。

### 5.5 全量修复的代码工作包和测试边界

下表是实现阶段的工作分解，不等同于“修改这些文件就完成”。每个工作包均须先补齐失败用例，再实施最小修复，并运行对应回归；如实际代码边界不同，应在 PR 中说明原因和替代证据。

| 工作包                      | 预期改动边界                                                                | 必须新增或更新的验证                                                                                                            | 禁止的处理方式                                                           |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 运行时配置与密钥            | API 配置装载、启动校验、交付门禁、环境说明和配置测试                        | Production 仅接受 Secret File、非法路径/空文件/双重来源/原始变量均启动失败；Development 与 Production 分支测试                  | 隐式读取原始变量、把 `*_KEY_REF` 当作可解析密钥、缺密钥时关闭功能        |
| 认证、会话与边界安全        | API bootstrap、Cookie/CSRF/CORS、反向代理信任、Web 安全头和设备入口         | 四角色关键路径、越权拒绝、CSRF、跨子域 Cookie、HTTPS 设备上下文、CSP/权限策略回归                                               | 允许任意 origin、临时关闭 CSRF、以 HTTP 或 `onrender.com` 代替正式验收域 |
| 数据库、加密与迁移          | `packages/db` 迁移/脚本、加密 envelope、生产门禁、恢复 Runbook              | 空库 `migrate deploy`、已数据副本的加性迁移、备份恢复、KID 读取、敏感字段解密与审计反查                                         | `migrate dev/reset`、自动 seed、直接覆盖使用中的加密密钥                 |
| 临床链路与授权              | 同意、撤回、评估、风险、计划、采集条件/协议/批次、会话和复核服务及前端      | 撤回后的严格阻断；患者-医师归属；真实输入完整性；结果复核和家属脱敏读取                                                         | 伪造评估/同意/风险数据、手改数据库绕过业务流、将 AI 草稿直接记为正式评估 |
| MiMo AI、连续对话、STT、TTS | 供应商配置、请求封装、审计、配额/用户操作限流服务、Key Value 接入、留存任务 | 四条真实调用链、超时/上游失败/预算耗尽/限流/KV 不可用的拒绝、最小化审计、医生复核                                               | 浏览器本地语音、预生成音频、固定转写、失败后重试风暴、本机内存限流降级   |
| 浏览器体感与设备            | 摄像头/麦克风权限、MediaPipe 加载、质量判定、训练 UI、错误状态              | 实机 HTTPS、拒绝权限/设备断连/低质量样本、有效指标保存、审计和导出边界                                                          | 跳过质量门禁、没有真实设备时生成成功结果、把截图替代数据记录             |
| Unity WebGL 与 Bridge       | Unity 源码、运行时配置、Web 嵌入、manifest/资源发布、结果接口               | manifest/hash、Bridge 协议、冻结时间窗口、五项指标、重复提交/异常阻断、真机保存                                                 | 以 Web 伪造 Unity 指标、修改已完成历史结果、使用未发布资源替代正式版本   |
| 训练内容与体验              | 内容注册表、任务导航、管理员发布、角色页面、无障碍与响应布局                | 逐个已发布内容的角色权限、版本、指标、运行时、禁用原因、移动端和键盘/读屏验收                                                   | 未清点就声称“所有游戏可用”、隐藏失败状态、以 seed 内容代表正式内容       |
| 部署与可观测性              | `render.yaml`、根/子包脚本、CI、健康接口、日志与告警配置                    | 干净 clone CI、Staging 部署、ready/迁移、告警触发、应用回滚与数据库恢复演练                                                     | 从脏工作树部署、把生产密钥放入 CI、将服务回滚当成数据库回滚              |
| 供应链与容量                | 依赖、许可证、SBOM、静态/动态安全扫描、请求体/音频限制、性能压测和套餐评估  | 全 Git 历史 secret scan；漏洞/许可证审查；并发、p95、错误率、冷启动、DB 连接、Unity/MediaPipe 首载、音频大小/时长的客户批准阈值 | 静默忽略漏洞、猜测生产阈值、在无容量证据时选择套餐                       |

### 5.6 训练内容与游戏清单的冻结方法

1. 从 Production 候选库的内容注册表导出全部训练内容，不以本地文件夹数量、seed 记录或历史截图推断“游戏数量”。
2. 对每项候选内容建立版本清单：内容标识、名称、运行时（Web/Unity）、发布版本、输入设备、时长、指标、质量门槛、适用人群、角色权限、发布状态、资源 manifest 和审核人。
3. 仅 `active + released + production` 的内容进入本期上线清单；停用、草稿、过期或缺少 manifest/指标/审核记录的内容必须从导航和排程中移除或继续保持不可用。
4. 清单冻结后逐项执行对应运行时的现场验收，并在客户最终验收 manifest 中记录通过版本。任何新增内容都视为新的发布变更，重新进入本节和第 10 节流程。

### 5.7 供应链、安全与容量工作包

1. 对 Git 完整历史和当前暂存候选树执行凭据扫描；候选扫描只以 Git index 内容检测，并且错误输出只能包含 commit/index、文件路径和检测器名称，绝不输出命中值。对第三方依赖执行漏洞、许可证和 SBOM 审查。Unity、MediaPipe、字体、素材和插件必须附授权证明。
2. 对认证、导出、AI/语音和训练结果接口执行 SAST、依赖扫描及 API 越权/输入大小检查；认证端点和音频上传应用独立限流和明确大小/时长上限。
3. 由客户提供目标并发患者数、AI 并发、训练并发、音频上传上限和可接受 p95/错误率。Staging 在这些阈值下测量 API、数据库连接、Key Value、冷启动、Unity/MediaPipe 首次加载和供应商错误率，再确定 Render 实例与数据库套餐。
4. 任一漏洞、未知许可证或未获当前锁文件整体许可证策略批准的组件均为阻断；必须完成真实修复、重新生成工件并复验。客户对完整许可证表达式清单的批准不是逐组件例外，不得使用 waiver、暂时放行或到期签字替代修复。

### 5.8 无 fallback 的故障运行方式

1. MiMo、Key Value、必选 Secret File、operation 账本或必选配置任一不可用时，相关 AI/STT/TTS 操作必须明确不可用，显示可追踪的错误状态。供应商审计或遥测写失败现会发出字段白名单运行事件后以固定错误阻断；连续对话的成功审计失败会完整回滚原事务。operation 账本已阻断重复外呼，但事件 sink/告警送达、人工案件闭环和“供应商已成功但客户端未取得结果”的受控读取仍未完成，不能过度表述为当前已经完成。
2. 不切换其他模型/供应商，不使用浏览器或本地语音，不将请求排队为不可见的后台任务，不自动生成临床结论、转写或音频，不允许无共享限流的放行。
3. 网络中断、浏览器关闭或响应丢失导致结果不确定时，在客户冻结持久化幂等重放和供应商计费规则、并完成可审计实现与回归前，禁止自动重投、人工以新幂等键重投或把“重复键已阻断”表述为重放成功。当前角色工作台已在同一已挂载页面内保留逻辑意图与调用方键，并在未知结果时阻断再次外呼；这不是持久化 outcome 或受控重放。相同键只有在未来已实现的受控查询路径中才能返回既有结果，不能再次调用供应商。已经收到响应后发生 AI 草稿回填或 TTS 播放失败时，Web 可仅复用当前页响应；当前页阻断不覆盖 STT 之外的页面关闭、响应丢失、身份变化、刷新、跨实例或服务端 audit/telemetry 失败。
4. 供应商连续失败、额度耗尽、密钥撤销或 Key Value 故障都按可观测的业务阻断事件处理，而不是以“训练/评估成功但结果稍后补齐”掩盖。

## 6. Render Blueprint 与部署命令

当前工作树根目录已有 `render.yaml` 候选实现，使用 Render 原生 Node Runtime，不在一期引入不必要的 Dockerfile。API 和 Web 均从仓库根构建；Render Blueprint 的服务不能配置 monorepo `rootDir`。API 仅在 `apps/api/tsconfig.build.json` 中将 TypeScript 编译 `rootDir` 固定为 `./src`，以生成 `dist/main.js`；这不会限制源码从 workspace 读取 `packages/db`。在受控提交、结构校验和真实 Render 导入通过前，它仍只是候选工件。

### 6.1 API 服务

- Build：`corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm --filter @rehab-platform/api build`
- Pre-deploy：新增 `pnpm db:migrate:deploy`，内部使用 `prisma migrate deploy`
- Start：`pnpm --filter @rehab-platform/api start:prod`
- Health check：`/health/ready`
- Database URL：由 Blueprint `fromDatabase.connectionString` 注入，不在 Git 中写连接串。
- 必须选择支持 pre-deploy、健康检查和生产可用性的服务套餐。

### 6.2 Web 服务

- Build：`corepack enable && pnpm install --frozen-lockfile --prod=false && pnpm --filter @rehab-platform/web build`
- Start：`pnpm --filter @rehab-platform/web start -- -p $PORT -H 0.0.0.0`
- Build 前设置 `NEXT_PUBLIC_API_BASE_URL=https://api.<customer-domain>`。该变量会编译进 Next 产物，部署后不能仅改 API 环境变量替换。
- Web 不配置数据库、MiMo 或病历加密密钥。
- 构建后核对 Unity manifest、loader、framework、data、wasm 和 MediaPipe 资源均可通过自有 HTTPS 域名加载。

### 6.3 数据库和初始化

1. 新生产库只执行 `prisma migrate deploy`，不执行 `prisma migrate dev`、`pnpm db:seed` 或任何自动患者/训练数据 seed。对留存重试控制迁移，先在维护窗口完成备份、`migrate deploy` 与 `migrate status`，预留短暂 `ALTER TABLE` 锁；随后盘点 `provider_telemetry_retention_run` 中历史 `status='running' AND executionDeadlineAt IS NULL` 记录，由客户值班负责人书面决定并记录处置，最后才启用新版 Cron。不得让旧 Cron 与新状态机并发运行。
2. 新增一次性、幂等、人工触发且可审计的 `pnpm db:bootstrap:production`。它仅创建客户批准的机构、首管理员和医师，不创建患者、家属、评估、计划、训练内容、会话或结果；首管理员强制首次改密。`pnpm db:seed:trial` 只可用于 Staging/隔离试点，绝不可在 Production 执行。
3. 已存在患者数据的迁移不得直接套用空库流程。必须先备份和恢复演练，再执行加性迁移、同一密钥的受控 backfill、核验和最终约束。
4. 患者与家属账户必须经受保护的邀请、重置、过期和强制改密流程开通；`DEFAULT_PATIENT_PASSWORD` 不得为绕过门禁长期部署到 API，生产检查也不得依赖它。

### 6.4 留存 Cron Job

- 类型：`cron`；命令为受控的 provider-call telemetry 留存清理命令，必须有限时并在结束后返回明确退出码。
- 访问：只提供清理所需的数据库、日志/审计配置和最小权限 Secret File；不提供 Web 或训练业务写入权限，不调用 MiMo。
- 并发与重试：使用 Render 的单运行保证，并由应用持久化 UTC 单日记录、`executionDeadlineAt` 和 `attemptCount`。仅 `failed` 或 deadline 已过期的 `running` 可通过条件更新原子接管；`completed`、deadline 未过期的 `running`、竞争失败者和历史 deadline 为空的 `running` 一律返回 `already_ran`。历史未知运行记录必须由值班人员审计处置，不能自动接管。
- 一致性：重试复用首次记录的 retentionDays 与 cutoff，不按重试时间重新计算删除范围；开始重试、失败和完成均写入最小化审计事件。Cron 不调用 MiMo，不删除业务审计日志、患者业务记录或训练结果。
- 告警与响应：运行失败事件 `provider_telemetry.retention.failed` 必须由日志 sink 立即路由到客户值班方；`SystemEventLog` 的 `provider_telemetry.retention_purge_retry_started` 和失败/完成事件必须由受控查询纳入同一告警面板。客户在上线前冻结失败、重试和历史未知运行的响应时限、升级路径与责任人；没有这些值不得启用 Cron。
- 验证：每次任务记录删除范围摘要、保留依据、开始/结束、状态、尝试次数和告警；在 Render Staging 证明初次成功、失败后重试、超时运行接管、并发竞态阻断和历史未知运行阻断均符合预期。

## 7. CI/CD 流程

### 7.1 GitHub Actions

**实施状态（2026-07-22）：** 当前工作树已有固定 SHA 的 GitHub Actions、历史与暂存候选凭据扫描、迁移/双 API 实例测试、发布工件检查、严格依赖审计、Linux SBOM/许可证门禁、固定 Semgrep SAST 与非敏感报告上传候选实现。隔离 PostgreSQL 18 的严格 `test:postgres` 已完成 9 个阶段，固定 Semgrep 已在本地真实 Docker 扫描为 0 findings；它们仍未在 GitHub 的受保护分支实际运行。Web 已升级并回归至稳定 Next `16.2.11`，但当前依赖审计仍因 `sharp@0.34.5` 和 `postcss@8.4.31` 按设计失败，当前 macOS 也拒绝生成 Linux Production SBOM。CI 不得以忽略严重级别、禁用步骤或写入 waiver 的方式转绿。

每个 PR 和生产分支合并都执行：

1. 锁定 Node/pnpm 后的 `pnpm install --frozen-lockfile`。
2. 先以 GitHub 提供的不可变 `$GITHUB_SHA` 执行 `pnpm delivery:check -- --git-ref "$GITHUB_SHA"`，再执行 `pnpm check:static`、API/Web 类型检查、lint、单元测试、数据库契约测试、Unity 源码和 WebGL 产物校验。
   静态和全量回归在执行 Web production build 前必须显式提供精确 HTTPS `NEXT_PUBLIC_API_BASE_URL`；缺失、HTTP、凭据、路径、查询串或锚点均在任何子命令前失败。GitHub CI 使用仅限 CI 的测试 origin，Render 构建只接受客户实际 API origin。
   提交候选还必须以该不可变 SHA 运行 `delivery:check -- --git-ref <SHA>`；门禁从 Git tree 读取全部部署路径、迁移和 immutable asset 属性，不接受工作区或 index 证明。
3. 使用 CI 临时 PostgreSQL、临时密钥和无患者数据的集成测试；不缓存 `.env`、实际凭据、`.next` 完整产物或测试运行数据。
4. 校验 `render.yaml` 结构、生产变量名称、禁止明文密钥和禁止 localhost/placeholder；校验全部已发布 Prisma 迁移的名称和校验和已追踪且不可改写。
5. 对空库和脱敏已数据副本分别执行 `migrate deploy`/`migrate status`；schema 改动按 expand-contract 设计，并验证旧应用版本的回滚兼容性。
6. 生成可审查的构建与测试摘要，不上传敏感日志。
7. 生成 SPDX 或 CycloneDX SBOM、锁定许可证清单和 API SAST 报告；任一漏洞、许可证或 SAST 阻断项都必须使 Required Check 失败，直至完成真实修复和复验。
8. 在独立 disposable PostgreSQL/Redis job 中构建并启动两个真实 Production API 进程，以真实认证调用连续对话 append：前两次必须在 guard 后因不存在会话返回 `404`，随后跨实例并发请求必须为 `429`；同一 user+`ai` Redis 计数和 `providerTelemetry=0` 必须被断言。该 job 只能使用 CI 临时数据库、临时 Secret Files 和专用 Redis DNS，非 CI 或缺任何确认条件时必须先失败且不重置数据库。

**SAST 状态（2026-07-22）：** 固定 Semgrep `1.162.0` 镜像摘要、只读无网络运行、本地规则、规则语义样例、报告脱敏与 CI 工件上传已在当前工作树实现；每次扫描前固定样例都会验证 6 类本地规则，且明确覆盖 `RegExp.exec` 非误报。真实 Docker 本地扫描当前全部 25 个 API 生产 TypeScript 文件为 0 findings，原始报告已清理，仅保留不含源码或凭据的报告。运行器只 canonicalize 已知 `config.semgrep.` rule ID 前缀，要求 Semgrep errors 为数组，并严格证明报告 `scannedScope` 与动态发现的请求源范围一致；任何未知规则、异常报告、缺失/额外/重复扫描路径均失败。该证据仅覆盖 6 类本地规则，不能表述为全仓 SAST 或客户批准的完整规则覆盖。GitHub Linux Required Check、工件保留策略以及客户对完整范围、规则覆盖、严重级别和修复 SLA 的批准尚未完成，因此 API SAST 仍是 Production `BLOCKED`；不得把本地结果或规则文件表述为 GitHub/客户验收通过。

### 7.2 部署顺序

1. 合并至受保护分支。
2. GitHub Required Checks 全部通过。
3. Render `checksPass` 部署 Staging。
4. Staging API 先运行迁移，`/health/ready` 通过后开始接流；Web 使用已确定的 Staging API HTTPS 地址构建和部署。
5. 完成 Staging 的真实供应商和现场验收后，创建经过审批的生产发布版本。
6. Render Production 仅从已批准的提交部署；配置变更、Secret File 变更和域名变更均需要客户指定运维审批。

Render Blueprint 支持 `preDeployCommand`，且可配置 Git 检查通过后才自动部署。[Render Blueprint 规范](https://render.com/docs/blueprint-spec)

## 8. 域名、TLS、Cookie 与静态资源

1. 在 Render 添加 `app.<customer-domain>` 和 `api.<customer-domain>`，由客户配置 DNS 并完成验证。
2. Render 为自有域名提供并续期 TLS，且 HTTP 会重定向到 HTTPS；仍需完成应用安全头和 Cookie 配置。[Render TLS](https://render.com/docs/tls)
3. API 设置 `WEB_ORIGIN=https://app.<customer-domain>`；Web 构建使用 `NEXT_PUBLIC_API_BASE_URL=https://api.<customer-domain>`；Cookie 设置 `Secure`、`HttpOnly`、`SameSite=Lax`。
4. 生产域名验收覆盖登录、CSRF 写操作、跨子域 Cookie、摄像头、麦克风、Unity WebGL loader、Bridge 和 MediaPipe 资源请求。
5. 客户确认后关闭不需要的 `onrender.com` 公开入口，避免临床人员使用非正式地址。

## 9. 备份、监控、告警与回滚

1. 选择支持 PITR 的 Render Postgres 套餐，并记录客户要求的恢复点目标、恢复时间目标、留存周期和数据责任人。
2. 上线前在数据库副本演练恢复，记录恢复步骤、验证 SQL、审计核验和责任人签字。
3. 结构化日志输出到客户批准的日志平台；监控 API ready、数据库连接、登录失败、AI/STT/TTS 调用量、超时率、失败率、限流拒绝、预算、训练提交、导出和审计失败。
4. 对数据库、密钥读取失败、AI 超额、连续供应商失败、API ready 失败和备份失败建立告警。
5. Render 服务构建可回滚，但不会回滚数据库或环境变量。发布 Runbook 必须规定：应用回滚、数据库前滚修复、PITR 恢复到新数据库并切换连接串三种不同流程。

## 10. Staging 与正式现场验收

### 10.1 MiMo AI 专项验收

1. 使用经授权患者和客户正式 MiMo 账户创建 AI 评估草稿，证明草稿不会自动生成正式评估；医师 `approved` 后才创建评估、风险与审计记录。
2. 使用真实、获 `microphone_capture` 授权的录音执行 STT，核对逐字转写、模型、调用 ID、审计和失败阻断。
3. 使用真实 TTS 调用返回 MiMo 音频，在 Chrome 实际播放，核对音频格式、调用 ID、审计和授权。
4. 连续对话验收覆盖：会话归属、患者间上下文隔离、turn 顺序/长度限制、撤回授权后中止、完整审计以及真实 MiMo 调用证据。
5. 运行既有 AI、语音转写、语音 AI 评估、连续对话和 TTS 验收脚本，归档脱敏 evidence；不得用浏览器 `SpeechSynthesis`、静态音频、固定转写或手工结果替代。

### 10.2 MiMo 负向与临床质量验收

下列项必须逐项形成“请求、预期阻断、实际响应、脱敏审计、UI 状态、关联业务记录”的 evidence。共同判定是：不得写入正式评估/风险/训练或伪造音频结果，不得越权写入，不得切换供应商或启用本地/内存/固定结果 fallback。

| 类别       | 必测场景                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------- |
| 权限与归属 | 缺失或撤回同意、错误角色、跨患者/跨机构、过期会话和重复提交                                 |
| 输入与协议 | 空文本、超大/畸形音频、错误 MIME、解码后超限、错误 Base64、无效调用 ID、超长对话或乱序 turn |
| 上游与配置 | 密钥撤销/过期、非 allowlist endpoint、4xx、429、5xx、超时、畸形 JSON、空转写、错误音频格式  |
| 配额与并发 | 用户/患者/机构预算耗尽、并发竞态、重复幂等键、Key Value 不可用或无原子写入能力              |

技术调用成功不等于临床可用。客户临床负责人必须用第 2.1 节冻结的真实或批准案例，对 AI 输出 schema、临床完整性与安全表述，STT 的准确性，以及 TTS 的发音/可懂度/音色/设备播放逐项签字。模型、endpoint、提示词、音色或输出格式变更后重新验收。

### 10.3 业务与运动训练验收

1. 患者本人完成 `privacy_policy`、`ai_processing`、`camera_capture`；语音范围另完成 `microphone_capture`，家属范围另完成 `caregiver_sharing`。
2. 医师录入真实 MMSE、CDR、认知维度、评估摘要和风险确认；确认计划、采集条件、协议和批次。
3. 在正式 HTTPS 设备上完成 Browser Pose 与 Unity `rhythm_reach_3d` `0.1.2` 训练；保存有效的训练结果、动作指标、截图/录屏和审计。
4. 只接受 `qualityFlag=valid`、`abnormalFlag=false` 的 Unity 样本；医师完成训练复核，家属只读取获授权的脱敏摘要。
5. 执行正式业务链、Unity、Browser Pose、AI、STT、TTS 只读验真，打包客户验收 manifest。

## 11. Production Go/No-Go 清单

以下项目必须全部为通过，才允许把状态改为上线：

- [ ] GitHub 代码、Unity/MediaPipe 正式资源和部署配置已审查提交，且无机密或客户原始数据；同一不可变 SHA 的 commit-tree 门禁和全新干净 clone 回归均已通过。
- [ ] 功能范围与宣传口径矩阵已冻结；每个“本期正式范围”能力均有版本、负责人、测试和 evidence，后续能力未被误宣称。
- [ ] GitHub 分支保护、CI、Secret Scanning 和 Render `checksPass` 已启用。
- [ ] Render Staging/Production 的 API、Web、Postgres、Key Value、区域、域名和访问权限已隔离。
- [ ] 留存 Cron Job 的最小权限、单运行、幂等、成功/失败告警和“仅清 telemetry”证据已通过。
- [ ] Production Secret Files 已由客户指定管理员录入；代码和门禁均验证文件来源，不接受原始密钥环境变量。
- [ ] 客户私有的 MiMo 调用结果政策已通过 `verify-mimo-provider-outcome-policy.mjs`，明确供应商成功后响应不确定时的计费、退款、留存、审计、状态查询和人工处置规则；持久化 outcome/outbox、相同键受控重放和全链路回归已通过，未使用新键重投。
- [ ] MiMo AI、STT、TTS、连续对话的启动配置、配额、留存、正负向/临床质量验收和审计均通过。
- [ ] `prisma migrate deploy`、数据库备份和恢复演练通过；未自动 seed 患者或训练记录。
- [ ] `/health/live` 与 `/health/ready`、HTTPS、CORS、Cookie、CSRF、安全头、摄像头和麦克风门禁通过。
- [ ] Unity/Browser Pose 正式 HTTPS 现场证据、训练保存、动作指标和医师复核通过。
- [ ] Git 历史及暂存候选凭据扫描、依赖漏洞/许可证/SBOM、API 安全扫描和客户批准容量压测均通过；不存在未解决漏洞、未知许可证、waiver 或临时放行。
- [ ] 客户生产资料包、隐私/数据处理批准、监控告警、运维值班和回滚 Runbook 已签字确认。
- [ ] 上线观察期长度、成功阈值、回滚/事件触发条件和 Production 配置漂移核对已由客户书面批准。
- [ ] 客户验收包、脱敏 evidence、审计样例、截图/录屏与最终 manifest 已归档。

### 11.1 最终验收 Evidence Manifest

最终 manifest 只能使用 `PASS` 或 `BLOCKED`，不允许 `SKIP`、waiver 或无证据的口头确认。至少包含：

1. Git SHA/tag、CI run、Render Staging/Production deploy ID、服务版本和时间。
2. 全部 Prisma 迁移名称与 hash、非秘密配置指纹、密钥引用/KID（绝不含密钥值）。
3. MiMo 模型、endpoint 标识、提示词版本、音色、provider call/request ID 与同一业务链 ID。
4. 正向和负向 AI/STT/TTS/连续对话验收、临床质量评分和签署。
5. Browser Pose/Unity 版本、设备/浏览器、媒体 hash、训练/动作指标/审计 ID、业务复核与导出验证。
6. 备份恢复、告警、Cron 清理、容量测试、应用回滚/数据库前滚或 PITR 演练记录。
7. 每项 evidence 的脱敏状态、责任人、签署时间、保存位置和批准的留存期。

## 12. 实施顺序和交付物

| 顺序 | 工作包                | 主要交付物                                                                                               | 完成判定                                                                             |
| ---- | --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1    | 立项与凭据处置        | 范围冻结、责任矩阵、客户书面决策、新 MiMo 凭据                                                           | 第 2 节所有输入齐备；已披露凭据被轮换且未进入代码/文档                               |
| 2    | 正式内容与数据盘点    | 训练内容/游戏版本清单、迁移清单、未追踪工件分类、临床资料缺口表                                          | 每个候选训练内容具备运行时、版本、指标、权限和发布证据；不以 seed 代替生产内容       |
| 3    | GitHub 可复现基线     | 受控提交、`.node-version`/`engines`、锁定 pnpm、根部署工件、分支保护方案                                 | 全新干净 clone 的构建和静态回归通过；所有必需 Prisma 迁移和正式静态资源已追踪        |
| 4    | P0 密钥与运行时合同   | Secret File 读取器、配置契约、启动前校验、门禁和回归测试                                                 | Production 只用文件来源、双重来源和缺失来源均 fail closed；无生产 fallback           |
| 5    | 数据与临床业务修复    | 授权/撤回、临床链路、加密/KID、迁移和结果复核修复                                                        | 单元、契约和数据库集成回归通过；真实输入缺失项仍保持阻断                             |
| 6    | AI 能力加固           | MiMo 配置、Key Value 配额、预算、最小化审计、留存清理、ready 检查、经客户策略批准的持久化 outcome/outbox | AI/STT/TTS 的正常、超时、上游失败、超额、KV 失败和同键受控重放路径全部受测且严格拒绝 |
| 7    | 训练运行时修复        | 浏览器设备门禁、MediaPipe、Unity Bridge/资源/指标、训练导航与内容发布状态                                | Web/Unity 自动回归通过；所有已发布内容的版本清单可追溯                               |
| 8    | 安全与运维代码        | `live`/`ready`、CORS/Cookie/CSRF、Web 安全头、结构化日志和告警事件                                       | 安全回归、ready 失败、审计脱敏和告警触发测试通过                                     |
| 9    | 供应链与容量门禁      | 历史凭据扫描、依赖/许可证/SBOM、API 安全扫描、客户阈值压测                                               | 安全与容量证据通过；无未解决漏洞、未知许可证、waiver 或临时放行                      |
| 10   | Render 与 CI 基础设施 | `render.yaml`、生产迁移/Bootstrap/Cron 脚本、GitHub Actions、环境变量/Secret File 映射、部署 Runbook     | Blueprint/CI 验证通过；无秘密值进入 GitHub、Render YAML 或构建日志                   |
| 11   | Staging 基础设施演练  | 独立 Staging API/Web/DB/KV/Cron、DNS/TLS、迁移、备份恢复、应用回滚和告警                                 | 新库迁移、ready/KV、恢复、前滚修复、Cron 和告警演练有记录                            |
| 12   | 真实临床业务验收      | 经授权患者或批准验收数据、医生评估/风险/计划、协议/批次、会话                                            | 完整业务链只通过受保护 API/UI 创建；禁止手改库和示例成绩                             |
| 13   | MiMo 与语音现场验收   | AI 草稿复核、连续对话、真实 STT/TTS、正负向/配额/失败证据、临床评分和脱敏审计                            | 正式 MiMo 调用、音频播放、医生复核和只读反查均在 HTTPS Staging 通过                  |
| 14   | 体感与 Unity 现场验收 | 摄像头/麦克风、Browser Pose、Unity `0.1.2`、截图/录屏、质量和结果证据                                    | 真实设备训练保存、动作指标窗口、异常阻断和医生复核全部通过                           |
| 15   | 发布签署与上线        | Go/No-Go、Production 发布、上线观察、客户验收 manifest、证据归档                                         | 第 11 节所有项签署；上线后观察期内无阻断告警                                         |

各阶段原则上按序推进；Staging 或 Production 候选验收发现任一失败时，状态必须回到 `BLOCKED`：登记缺陷 ID 和可复现测试，提交修复 PR，执行受影响范围与全量回归，重新取得现场 evidence 后才能回到 `PASS`。禁止 waiver、手改数据库或临时配置放行。第 12 至 14 阶段的真实数据、患者授权和医师判断由客户/临床方负责提供；开发团队负责系统行为、访问控制、证据导出和回归，不得代填或推断临床内容。

## 13. 禁止事项

- 不提交、显示、复制或转发 MiMo 密钥、数据库连接串、JWT、病历加密密钥、Cookie 或真实患者原始数据。
- 不通过关闭 AI/STT/TTS 上线范围、使用个人免费 token、改成 localhost、填写模板值或放宽门禁来获得“通过”。
- 不在生产部署执行普通 `pnpm db:seed`、`prisma migrate dev`、数据库 reset 或自动创建患者/训练结果。
- 不把 Render 服务代码回滚误认为数据库回滚；不直接替换正在使用的病历加密密钥。
- 不用 seed、mock、demo、固定成绩、浏览器本地语音、预生成音频、手工审计或 fallback 代替真实验收。
