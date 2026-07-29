# 浏览器体感实机验收 Runbook

本文用于证明首个 `browser_pose_canvas` 不是演示数据，而是在真实浏览器、真实摄像头、真实账号和真实数据库中完成训练采集、结果入库和审计留痕。

## 验收边界

- 本验收只校验已经产生的实机证据，不创建患者、不生成训练结果、不补写动作指标、不补审计日志。
- `pnpm verify:trial-empty-loop` 只能证明 API 空库业务闭环，不能替代摄像头和姿态识别实机验收。
- `pnpm verify:browser-pose-evidence` 只能校验证据 JSON 的结构和字段交叉引用，不能替代只读 API 验真。
- 正式通过必须执行 `pnpm verify:browser-pose-field-acceptance`，并同时校验证据 JSON、本地截图/录屏文件、训练记录 API 和审计日志 API。
- 验收数据必须来自正式训练页面、真实 API 返回、训练记录查询、审计日志和现场截图/录屏。
- 若缺少摄像头授权、姿态识别、训练完成页、四项动作指标、附件文件、训练记录读取账号、审计读取账号或审计日志，本项视为未通过。
- 摄像头标签必须是浏览器或系统返回的真实设备标签或型号；`已授权摄像头`、`Camera authorized` 等通用授权状态文案不能作为正式 `device.cameraLabel`。
- evidence JSON、API 地址和审计 metadata 会递归拒绝 `mock/demo/seed/fallback/fixed/manual` 标记，包括拼接词形和 URL 编码写法。
- evidence JSON 和审计 metadata 不得包含 `token/key/secret/authorization/accessToken/requestBody/responseBody/payload/raw/*Base64` 等敏感字段或原始载荷；合法 `sha256:` 哈希摘要可保留。
- 只读验真遇到登录、Cookie、CSRF、HTTP 失败或字段不一致时会硬失败；HTTP 响应体和实际 mismatch 值会被隐藏，只输出失败阶段或字段，避免泄露凭据、身份标识或训练载荷。
- 本验收只接受 `qualityFlag=valid` 且 `abnormalFlag=false` 的有效训练样本。异常、可疑或低质量训练结果的医师复核属于异常数据治理能力验收，应通过 `pnpm verify:contracts` 验证 `training_result.review`、复核结论和审计日志，不作为本字段验收通过样本。

## 前置条件

1. 患者已完成 `privacy_policy` 和 `camera_capture` 授权。
2. 医师已确认当前生效康复方案，且方案中包含正式 `browser_pose_canvas` 训练项目。
3. 训练内容状态为 `active + released + production`，`bridgeProtocolVersion=1.0.0`。
4. 现场浏览器通过 HTTPS 访问正式或试点环境页面。
5. 摄像头可用，姿态识别模型加载成功，站位和光线满足训练要求。

## 现场步骤

1. 使用患者账号进入今日训练页面，选择浏览器体感训练内容。
2. 完成摄像头授权和姿态识别就绪检查，记录浏览器版本、页面地址、浏览器或系统返回的真实摄像头标签和模型版本；若浏览器未返回摄像头标签，本项不能用授权状态文案替代。
3. 完成一次完整训练，不使用固定成绩、脚本注入或手工填写动作指标。
4. 提交训练结果后，在患者端或医师端确认训练记录可见。
5. 后台查询审计日志，确认存在 `training_session.start` 和 `training_result.submit`。
6. 保存训练完成页截图、训练过程录屏或录像、审计日志截图。
7. 按 `docs/templates/browser-pose-evidence.template.json` 填写证据 JSON。
8. 也可在患者端训练结果页使用“导出浏览器体感验收 JSON”面板生成 evidence。该面板只负责组装已入库训练记录和人工填写的验收信息；若当前账号已加载审计日志，面板可自动匹配 `training_session.start` 和 `training_result.submit` 成功日志并写入日志 ID，但不会创建、补写、修复或伪造审计日志，也不会采集或补造截图、录屏。若页面提示该结果需要 `training_result.review`，说明它属于异常复核验收，不应作为本字段验收 evidence 导出。

## JSON 自检命令

填写证据 JSON 后，可先执行静态自检：

```bash
pnpm verify:browser-pose-evidence -- '<evidence-json-path>'
```

也可以使用环境变量：

```bash
BROWSER_POSE_EVIDENCE_FILE='<evidence-json-path>' pnpm verify:browser-pose-evidence
```

缺少字段、字段不一致、摄像头标签为通用授权状态文案、来源或任意文本字段包含 `mock/demo/seed/fallback/fixed/manual`、存在敏感字段或原始载荷、缺动作指标、缺截图、缺审计动作或包含 `training_result.review` 时，命令必须失败，不允许脚本自动推断或填默认值。

`docs/templates/browser-pose-evidence.template.json` 仅作为填写模板。模板中的 `<...>` 占位符必须替换为现场实机证据后再校验，模板文件本身不应通过正式验收。

## 只读实机验真命令

正式验收必须再执行只读验真：

```bash
BROWSER_POSE_PATIENT_ACCOUNT='<具备训练记录读取权限的账号>' \
BROWSER_POSE_PATIENT_PASSWORD='<由密钥管理系统注入的账号密码>' \
BROWSER_POSE_AUDIT_ACCOUNT='<具备 audit.read 权限的账号>' \
BROWSER_POSE_AUDIT_PASSWORD='<由密钥管理系统注入的账号密码>' \
pnpm verify:browser-pose-field-acceptance -- \
  '<evidence-json-path>' \
  --api-base-url 'https://api.rehab.example.com'
```

也可以把证据路径和 API 地址一并通过环境变量提供。账号密码必须由受控密钥管理系统注入，不要写入 evidence JSON、Runbook、命令参数或仓库文件：

```bash
BROWSER_POSE_EVIDENCE_FILE='<evidence-json-path>' \
BROWSER_POSE_API_BASE_URL='https://api.rehab.example.com' \
BROWSER_POSE_PATIENT_ACCOUNT='<具备训练记录读取权限的账号>' \
BROWSER_POSE_PATIENT_PASSWORD='<由密钥管理系统注入的账号密码>' \
BROWSER_POSE_AUDIT_ACCOUNT='<具备 audit.read 权限的账号>' \
BROWSER_POSE_AUDIT_PASSWORD='<由密钥管理系统注入的账号密码>' \
pnpm verify:browser-pose-field-acceptance
```

该命令分别为训练记录读取账号和审计读取账号创建独立 `CookieSessionClient`。每个客户端先执行 `GET /auth/csrf`，再由客户端在 `POST /auth/login` 上自动携带匹配的 CSRF cookie/header；登录成功后的业务读取只携带各自的 `rehab_session`/`rehab_csrf` cookie，不发送 `Authorization` 或 Bearer。除登录所需的非安全方法外，验真业务 API 只执行 `GET` 查询和本地文件读取，不创建患者、训练 session、训练结果、动作指标、审计日志、截图或录像。缺少任一账号密码、Cookie/CSRF 建立失败、API 地址、证据文件、附件文件、训练记录或审计日志时必须立即失败，不重试、不切换认证路径。API 地址必须是正式 HTTPS，且不得包含 `mock/demo/seed/fallback/fixed/manual` 的明文、拼接或 URL 编码标记。

## 必须包含的证据

- 现场验收信息：验收时间、验收人员、现场名称和环境。
- 浏览器信息：浏览器名、版本、`userAgent`、HTTPS 页面地址。
- 摄像头信息：设备编号、真实摄像头标签、脱敏设备哈希、分辨率。
- 姿态识别信息：`browser_pose_canvas`、模型名、模型版本、关键点数量、平均可见度。
- 业务关联：患者、康复计划、计划项、训练内容、医师确认记录。
- 训练会话：`sessionId`、`gameRunId`、`deviceCode`、开始/结束时间、同步状态。
- 训练结果：`source=browser_pose_canvas`、版本、协议、payload hash、质量标记、异常标记和核心结果。
- 动作指标：`reaction_time_ms`、`target_hit_rate`、`pose_visibility_avg`、`arm_raise_accuracy`。
- 审计证据：`training_session.start` 和 `training_result.submit` 对应审计日志。`training_result.review` 不属于本字段验收证据，需在异常复核契约验收中验证。
- 附件证据：至少一张截图和一份训练过程录屏或录像。

## API 反查要求

- 训练记录 API 必须能按 `patient.patientId` 查询到 `trainingSession.sessionId` 对应的 session。
- session 必须与 evidence 中的患者、康复计划、计划项、训练内容、`gameRunId`、设备编号、校准状态、完成状态和同步状态一致。
- `gameContent` 必须与 evidence 中的运行方式、版本、协议、发布通道和发布状态一致。
- `trainingResult` 必须与 evidence 中的结果 ID、来源、`gameRunId`、版本、协议、payload hash、质量标记、异常标记和核心分数一致。
- `motionMetrics` 必须包含四项正式动作指标，且每项的值、单位、置信度、采样数、窗口时间、质量标记、来源和 `gameRunId` 与 evidence 一致。
- 审计日志 API 必须能按 `training_session.start` 和 `training_result.submit` 查到 `targetType=training_session`、`targetId=sessionId`、`result=success` 的日志。
- 训练记录 API 的 2xx 响应必须是对象，两个审计 API 的 2xx 响应必须是数组；空体、`null` 或其他错误 shape 一律失败。每个动作必须恰好匹配一条 evidence 指定的成功审计候选，并递归扫描全部候选的 metadata。
- evidence 中的 `auditEvidence.auditLogIds` 必须与 API 查到的审计日志 ID、动作、目标和结果一致。
- 匹配到的审计 metadata 必须只保留安全摘要，不得包含 token、密钥、请求/响应正文、原始 payload、base64 原始内容或演示/手工标记。
- 管理后台审计日志列表会展示完整日志 ID；现场验收时应筛选 `training_session.start`、`training_result.submit`、`targetType=training_session` 和对应 `sessionId` 后，将成功审计日志 ID 填入 evidence。训练结果页的审计自动聚合只读取页面已加载日志并辅助填写 ID，最终仍以 `pnpm verify:browser-pose-field-acceptance` 的只读 API 反查结果为准。

## 失败判定

- evidence JSON、训练结果来源、API 地址或审计 metadata 包含 `mock/demo/seed/fallback/fixed/manual` 标记，包括 `mockapi`、`demoapi`、`seeddata`、`fallbackserver`、`fixedscore`、`manualentry` 或 URL 编码变体。
- evidence JSON 或审计 metadata 包含 token、密钥、请求/响应正文、原始 payload、base64 原始内容等敏感字段；只允许保存必要业务 ID、结构化指标和合法哈希摘要。
- `trainingSession.gameRunId` 与 `trainingResult.gameRunId` 不一致。
- `gameVersion` 或 `bridgeProtocolVersion` 与正式训练内容不一致。
- 任一正式动作指标缺失、采样数为空、置信度缺失或质量标记不是显式 `valid`。
- 训练会话不是 `completed + synced`。
- 缺少现场截图、训练录屏或审计日志关联。
- 页面不是 HTTPS 正式或试点地址。
- 摄像头标签为空，或使用 `已授权摄像头` 等通用授权状态文案代替真实设备标签。
- 任一附件路径不存在、不是文件或文件大小为 0。
- API 地址不是 HTTPS，或缺少训练记录读取账号密码、审计读取账号密码，或任一 Cookie/CSRF 会话无法建立。
- 训练记录 API 返回的 session/result/gameContent/motionMetrics 与 evidence 不一致。
- 审计 API 查不到 evidence 指定的审计 ID，或动作、目标、结果不匹配。
- evidence 声明 `training_result.review`，或训练结果不是 `qualityFlag=valid` 且 `abnormalFlag=false` 的有效训练样本。
- 只读验真输出中不得要求验收人员粘贴 HTTP 响应体或 mismatch 原值；如需排查，应在受控后台按权限查看审计和业务记录。
