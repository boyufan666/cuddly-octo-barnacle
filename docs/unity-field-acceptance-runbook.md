# Unity WebGL 正式现场验收 Runbook

本文用于证明 Unity WebGL 训练内容不是演示数据，而是在真实浏览器、真实 Unity WebGL runtime、真实账号、真实 API 和真实数据库中完成训练运行、Bridge 回传、结果入库和审计留痕。

## 验收边界

- 本验收只校验已经产生的 Unity WebGL 现场证据，不创建患者、不创建训练 session、不提交训练结果、不补写动作指标、不补审计日志、不生成或补录附件。
- `pnpm verify:unity-field-evidence` 只校验证据 JSON 的结构、字段和交叉引用，不能替代只读 API 验真。
- 正式通过必须执行 `pnpm verify:unity-field-acceptance`，并同时校验证据 JSON、本地截图/录屏文件、训练记录 API 和审计日志 API。
- 验收数据必须来自真实 Unity WebGL Build、正式 HTTPS 页面、真实 Unity loader 启动记录、Bridge 事件、训练记录查询、审计日志和现场截图/录屏。
- 缺 API 地址、训练记录读取账号、审计读取账号、附件文件、训练记录、审计日志或真实 Unity WebGL runtime 时必须失败。
- 不得把 mock、demo、seed、本地脚本样例、fallback、固定成绩、手工补写字段或非 Unity WebGL runtime 当作正式证据。
- evidence JSON、API 地址和审计 metadata 会递归拒绝 `mock/demo/seed/fallback/fixed/manual` 标记，包括拼接词形和 URL 编码写法。
- evidence JSON 和审计 metadata 不得包含 `token/key/secret/authorization/accessToken/requestBody/responseBody/payload/raw/*Base64` 等敏感字段或原始载荷；合法 `sha256:` 哈希摘要可保留。
- 只读验真遇到登录、Cookie、CSRF、HTTP 失败或字段不一致时会硬失败；HTTP 响应体和实际 mismatch 值会被隐藏，只输出失败阶段或字段，避免泄露凭据、身份标识或训练载荷。
- 本验收只接受 `qualityFlag=valid` 且 `abnormalFlag=false` 的有效训练样本。异常、可疑或低质量训练结果的医师复核属于异常数据治理能力验收，应通过 `pnpm verify:contracts` 验证 `training_result.review`、复核结论和审计日志，不作为本字段验收通过样本。
- Unity 结果契约只接受 `resultContractVersion=rehab-unity-result-v2`。训练会话、runtime 配置快照、Bridge 顶层事件、`metricsSummary` 和训练结果必须绑定同一个非空 `collectionBatchId`，不得省略、推断或补默认值。
- `rehabPlan.durationMinutes` 是处方时长唯一来源；它乘以 60 后必须严格等于 runtime 配置快照、Bridge 事件和训练结果的 `durationSeconds`。
- 审计证据必须恰好提供两个且唯一的 `auditLogIds`，`requiredActions` 必须恰好且唯一地包含 `training_session.start` 与 `training_result.submit`。

## 前置条件

1. 患者已完成 `privacy_policy` 和训练所需授权。
2. 医师已确认当前生效康复方案，且方案中包含正式 Unity WebGL 训练项目和大于 0 的整数分钟处方时长。
3. Unity 训练内容状态为 `released + production`，`runtimeType=unity_webgl`，`bridgeProtocolVersion=1.0.0`。
4. Unity WebGL Build 已由 Unity Editor 生成真实 `.loader.js`、`.framework.js`、`.data`、`.wasm` 和 `manifest.json`，并通过 Web 端 HTTPS 静态资源地址访问。
5. 现场浏览器通过 HTTPS 访问正式或试点环境页面，能加载 Unity loader 并启动 `unityInstance`。
6. 训练结果必须由 Unity WebGL runtime 通过平台 Bridge 回传，不允许固定成绩、脚本注入或人工填写训练结果。

## 现场步骤

1. 使用患者账号进入今日训练页面，选择 Unity WebGL 训练内容。
2. 记录浏览器名称、版本、`navigator.userAgent`、训练页面 HTTPS 地址。
3. 确认 Unity loader、Build 资源和 `unityInstance` 已真实加载，记录 `manifestUrl`、`buildBaseUrl`、`gameVersion`、`bridgeProtocolVersion`、`resultContractVersion=rehab-unity-result-v2`、loader 加载时间、Unity 实例启动时间、Canvas 分辨率和 `devicePixelRatio`。
4. 完成一次完整 Unity 训练，不使用 `mock/demo/seed/fallback/fixed/manual` 数据、不使用固定成绩、不手工改写 Bridge payload。
5. 提交训练结果后，在患者端或医师端确认训练记录可见。
6. 后台查询审计日志，确认存在且只选取本次 session 对应的 `training_session.start` 和 `training_result.submit` 各一条成功日志，两个日志 ID 必须不同。
7. 保存 Unity 训练完成页截图、训练过程录屏或录像、审计日志截图。
8. 按 `docs/templates/unity-field-evidence.template.json` 填写证据 JSON。也可在训练结果页使用“导出 Unity WebGL 验收 JSON”面板组装 evidence；若当前账号已加载审计日志，面板可自动匹配 `training_session.start` 和 `training_result.submit` 成功日志并写入日志 ID，但不会创建、补写、修复或伪造审计日志，也不会生成截图、录屏或 Unity 运行证据。若页面提示该结果需要 `training_result.review`，说明它属于异常复核验收，不应作为本字段验收 evidence 导出。模板仅展示字段结构，占位符必须替换为现场真实证据。

## JSON 自检命令

填写证据 JSON 后，可先执行静态自检：

```bash
pnpm verify:unity-field-evidence -- '<evidence-json-path>'
```

也可以使用环境变量：

```bash
UNITY_FIELD_EVIDENCE_FILE='<evidence-json-path>' pnpm verify:unity-field-evidence
```

缺少字段、字段不一致、来源不是 `unity_webgl`、任意文本字段包含 `mock/demo/seed/fallback/fixed/manual`、存在敏感字段或原始载荷、缺 Unity runtime 信息、缺 `rehab-unity-result-v2`、缺采集批次、缺动态难度事件、处方时长不一致、动作指标质量字段未显式填写、缺截图、审计 ID/动作不是恰好两个且唯一或包含 `training_result.review` 时，命令必须失败，不允许脚本自动推断或填默认值。

`docs/templates/unity-field-evidence.template.json` 仅作为填写模板。模板中的 `<...>` 占位符必须替换为现场 Unity WebGL 实机证据后再校验，模板文件本身不应通过正式验收。

## 只读实机验真命令

正式验收必须再执行只读验真：

```bash
UNITY_FIELD_PATIENT_ACCOUNT='<具备训练记录读取权限的账号>' \
UNITY_FIELD_PATIENT_PASSWORD='<由密钥管理系统注入的账号密码>' \
UNITY_FIELD_AUDIT_ACCOUNT='<具备 audit.read 权限的账号>' \
UNITY_FIELD_AUDIT_PASSWORD='<由密钥管理系统注入的账号密码>' \
pnpm verify:unity-field-acceptance -- \
  '<evidence-json-path>' \
  --api-base-url 'https://api.rehab.example.com'
```

也可以把证据路径和 API 地址一并通过环境变量提供。账号密码必须由受控密钥管理系统注入，不要写入 evidence JSON、Runbook、命令参数或仓库文件：

```bash
UNITY_FIELD_EVIDENCE_FILE='<evidence-json-path>' \
UNITY_FIELD_API_BASE_URL='https://api.rehab.example.com' \
UNITY_FIELD_PATIENT_ACCOUNT='<具备训练记录读取权限的账号>' \
UNITY_FIELD_PATIENT_PASSWORD='<由密钥管理系统注入的账号密码>' \
UNITY_FIELD_AUDIT_ACCOUNT='<具备 audit.read 权限的账号>' \
UNITY_FIELD_AUDIT_PASSWORD='<由密钥管理系统注入的账号密码>' \
pnpm verify:unity-field-acceptance
```

该命令分别为训练记录读取账号和审计读取账号创建独立 `CookieSessionClient`。每个客户端先执行 `GET /auth/csrf`，再由客户端在 `POST /auth/login` 上自动携带匹配的 CSRF cookie/header；登录成功后的业务读取只携带各自的 `rehab_session`/`rehab_csrf` cookie，不发送 `Authorization` 或 Bearer。除登录所需的非安全方法外，验真业务 API 只执行 `GET` 查询和本地文件读取，不创建患者、训练 session、训练结果、动作指标、审计日志、截图或录像。缺少任一账号密码、Cookie/CSRF 建立失败、API 地址、证据文件、附件文件、训练记录、动作指标或审计日志时必须立即失败，不重试、不切换认证路径。API 地址必须是正式 HTTPS，且不得包含 `mock/demo/seed/fallback/fixed/manual` 的明文、拼接或 URL 编码标记。

## 必须包含的证据

- 现场验收信息：验收时间、验收人员、现场名称和环境。
- 浏览器信息：浏览器名、版本、`userAgent`、HTTPS 页面地址。
- 设备信息：`deviceCode`、设备类型、输入方式、校准状态和分辨率。
- Unity runtime 信息：`runtimeType=unity_webgl`、`manifestUrl`、`buildBaseUrl`、`gameVersion`、`bridgeProtocolVersion=1.0.0`、loader 加载时间、Unity 实例启动时间、Canvas 分辨率和 `devicePixelRatio`。
- 业务关联：患者、康复计划、计划项、训练内容、医师确认记录和大于 0 的整数分钟处方时长。
- 训练内容：`runtimeType=unity_webgl`、正式版本、正式 HTTPS Build 地址、`releaseChannel=production`、`buildStatus=released`。
- 训练会话：`sessionId`、`collectionBatchId`、`gameRunId`、`deviceCode`、开始/结束时间、完成状态、同步状态和 runtime 配置快照；快照必须显式包含 `resultContractVersion=rehab-unity-result-v2`、相同 `collectionBatchId` 和处方秒数。
- Bridge 事件：`type=training_result`、`action=training_result`、`resultContractVersion=rehab-unity-result-v2`、`sessionId`、`collectionBatchId`、`gameRunId`、版本、协议、客户端生成时间、payload hash 和处方秒数。`metricsSummary` 必须逐项重复并匹配 source、结果契约、采集批次、运行 ID、版本、协议、时间和哈希。
- 动态难度证据：`bridgeEvent.metricsSummary.dynamicDifficultyEvidence.schemaVersion=1.0.0` 且 `events` 非空；每个事件必须显式记录医师批准的起始难度及来源、方案项目、评估来源、触发原因、调整前后速度与复杂度、调整时间、当前 `gameRunId` 下的 frame/window ID，难度未变化时还必须提供非空 `safetyClampReason`。
- 训练结果：`source=unity_webgl`、结果 ID、`collectionBatchId`、版本、协议、payload hash、提交时间、质量标记、异常标记、分数、完成率、训练时长、反应时间、动作准确率和训练强度。
- 动作指标：至少包含本次 Unity 训练正式计算并入库的动作指标，每项必须显式提供值、单位、置信度、正整数采样数、窗口开始/结束时间和 `qualityFlag=valid`；缺字段不能按默认质量通过。
- 审计证据：`auditLogIds` 必须恰好两个且唯一，`requiredActions` 必须恰好且唯一地包含 `training_session.start` 和 `training_result.submit`。`training_result.review` 不属于本字段验收证据，需在异常复核契约验收中验证。
- 附件证据：至少一张 Unity 训练现场截图和一份训练过程录屏或录像。

## API 反查要求

- 训练记录 API 必须能按 `patient.patientId` 查询到 `trainingSession.sessionId` 对应的 session。
- session 必须与 evidence 中的患者、康复计划、计划项、训练内容、`gameRunId`、设备编号、校准状态、完成状态和同步状态一致。
- `trainingSession.runtimeConfigSnapshot` 必须与 evidence 中的 Unity runtime 类型、manifest、Build 地址、游戏版本、协议版本和发布通道一致，并与 session/Bridge/result 使用相同采集批次和 `rehab-unity-result-v2`。
- `gameContent` 必须与 evidence 中的运行方式、版本、协议、发布通道、发布状态、manifest 和 Build 地址一致。
- `trainingResult` 必须与 evidence 中的结果 ID、来源、`collectionBatchId`、`gameRunId`、版本、协议、payload hash、提交时间、质量标记、异常标记和核心结果一致。
- `trainingResult.metricsSummary` 必须与 Bridge 事件中的来源、`resultContractVersion`、`collectionBatchId`、`gameRunId`、版本、协议、客户端生成时间、payload hash 和完整动态难度证据一致。
- `motionMetrics` 必须包含 evidence 中列出的正式动作指标，且每项的值、单位、置信度、采样数、窗口时间、质量标记、来源和 `gameRunId` 与 evidence 一致。
- 审计日志 API 必须能按 `training_session.start` 和 `training_result.submit` 查到 `targetType=training_session`、`targetId=sessionId`、`result=success` 的日志。
- 训练记录 API 的 2xx 响应必须是对象，两个审计 API 的 2xx 响应必须是数组；空体、`null` 或其他错误 shape 一律失败。每个动作必须恰好匹配一条 evidence 指定的成功审计候选，并递归扫描全部候选的 metadata。
- evidence 中的两个唯一 `auditEvidence.auditLogIds` 必须分别与 API 查到的 `training_session.start`、`training_result.submit` 审计日志 ID、动作、目标和结果一致，不接受一个 ID 重复承担两个动作。
- 匹配到的审计 metadata 必须只保留安全摘要，不得包含 token、密钥、请求/响应正文、原始 payload、base64 原始内容或演示/手工标记。
- 训练结果页的审计自动聚合只读取页面已加载日志并辅助填写 ID，最终仍以 `pnpm verify:unity-field-acceptance` 的只读 API 反查结果为准。

## 失败判定

- evidence JSON、训练结果来源、API 地址或审计 metadata 包含 `mock/demo/seed/fallback/fixed/manual` 标记，包括 `mockapi`、`demoapi`、`seeddata`、`fallbackserver`、`fixedscore`、`manualentry` 或 URL 编码变体。
- evidence JSON 或审计 metadata 包含 token、密钥、请求/响应正文、原始 payload、base64 原始内容等敏感字段；只允许保存必要业务 ID、结构化指标和合法哈希摘要。
- 缺真实 Unity WebGL runtime 信息，或 `manifestUrl`、`buildBaseUrl` 不是正式 HTTPS 地址。
- `unityRuntime.manifestUrl` 不位于 `buildBaseUrl` 目录下。
- `trainingSession.gameRunId`、`bridgeEvent.gameRunId` 与 `trainingResult.gameRunId` 不一致。
- `trainingSession.collectionBatchId`、runtime 配置快照、Bridge 顶层事件、`metricsSummary` 与 `trainingResult.collectionBatchId` 任一缺失或不一致。
- runtime 配置快照、Bridge 顶层事件或 `metricsSummary` 缺少精确的 `resultContractVersion=rehab-unity-result-v2`。
- `rehabPlan.durationMinutes` 不是大于 0 的整数，或乘以 60 后与 runtime 配置快照、Bridge 事件、训练结果任一 `durationSeconds` 不严格相等。
- `dynamicDifficultyEvidence` 缺失、schema 不是 `1.0.0`、事件为空、事件字段不完整、方案项目不匹配、frame/window ID 不属于当前 `gameRunId`，或未变化事件缺 `safetyClampReason`。
- `gameVersion` 或 `bridgeProtocolVersion` 与正式训练内容不一致。
- 训练会话不是 `completed + synced`。
- 任一 evidence 动作指标缺失、采样数为空、置信度缺失或质量标记不是显式 `valid`。
- 缺少现场截图、训练录屏，或审计日志 ID/动作不是恰好两个且唯一。
- 任一附件路径不存在、不是文件、为空，或不在 evidence JSON 所在目录内。
- API 地址不是 HTTPS，或缺少训练记录读取账号密码、审计读取账号密码，或任一 Cookie/CSRF 会话无法建立。
- 训练记录 API 返回的 session/result/gameContent/runtimeConfigSnapshot/motionMetrics 与 evidence 不一致。
- 审计 API 查不到 evidence 指定的审计 ID，或动作、目标、结果不匹配。
- evidence 声明 `training_result.review`，或训练结果不是 `qualityFlag=valid` 且 `abnormalFlag=false` 的有效训练样本。
- 只读验真输出中不得要求验收人员粘贴 HTTP 响应体或 mismatch 原值；如需排查，应在受控后台按权限查看审计和业务记录。
