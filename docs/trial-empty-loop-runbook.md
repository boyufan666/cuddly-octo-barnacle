# seed-trial 后真实空库闭环验收 Runbook

本文用于验证 `pnpm db:seed:trial` 之后，系统能否不依赖 `patient001/admin` 示例 seed 数据，走通最小真实业务闭环。

## 验收边界

脚本路径：

```bash
pnpm verify:trial-empty-loop
```

覆盖路径：

- trial 管理员账号登录。
- trial 医师账号登录。
- 管理员按 trial 医师账号通过正式 API 创建患者，并验证后端解析到该医师绑定的 doctor profile。
- 患者登录并签署 `privacy_policy`、`ai_processing`、`camera_capture` 当前版本授权。
- 医师录入结构化 MMSE/CDR 和评估摘要。
- 管理员创建并发布 `browser_pose_canvas` 正式训练内容。
- 医师生成推荐方案并确认方案。
- 管理员创建正式采集条件。
- 管理员创建正式采集协议，协议必须基于本次采集条件和训练内容。
- 医师创建正式采集批次，批次必须绑定当前患者、当前方案、方案项、训练内容和采集协议。
- 患者创建训练 session，必须传入本次新建 `collectionBatchId`。
- 患者提交结构化训练结果和动作指标，`metricsSummary.collectionBatchId` 必须等于 session 的 `collectionBatchId`。
- 医师查询训练记录，确认 session、result 和 4 条 motionMetrics 都能反查到同一个 `collectionBatchId`。

认证边界：

- 管理员、医师、患者各自使用独立的 Cookie 会话，三者不得共用或替换 cookie jar。
- 每个角色严格按 `GET /auth/csrf` → `POST /auth/login` 登录；登录写请求自动携带与 `rehab_csrf` cookie 匹配的 `x-csrf-token`，后续写请求沿用该角色最新的匹配值。
- 每个受保护读请求必须携带当前角色自己的 `rehab_session`，不得携带其他角色的会话，也不接受其他认证参数或秘密引用配置。
- `TRIAL_VERIFY_ADMIN_ACCOUNT`、`TRIAL_VERIFY_ADMIN_PASSWORD`、`TRIAL_VERIFY_DOCTOR_ACCOUNT`、`TRIAL_VERIFY_DOCTOR_PASSWORD`、`TRIAL_VERIFY_PATIENT_ACCOUNT`、`TRIAL_VERIFY_PATIENT_PASSWORD` 任一缺失时，脚本必须在任何网络请求或 Prisma 初始化前硬失败。
- 任一登录返回 `password_reset_required` 时立即失败，必须先由人工完成密码重置；脚本不自动重置、不重试、不替换账号、不使用默认凭据，也不使用 fallback。

采集配置内容：

- 采集条件会写入 `environment`、`deviceRequirements`、`taskParameters` 和 `qualityRules`，用于记录本次验收的光照、站姿、摄像头、距离、训练时长和姿态质量门槛。
- 采集协议会写入 `requiredConsentTypes`、`requiredInputModes`、`requiredMetrics`、`conditionRules`、`samplingConfig` 和 `qualityGate`，用于约束本次训练必须具备摄像头授权、姿态输入、动作指标和质量规则。
- `TRIAL_VERIFY_GAME_TRAINING_TARGETS` 或 `TRIAL_VERIFY_GAME_TAGS` 必须包含 `reaction` 或 `反应`，`TRIAL_VERIFY_GAME_TAGS` 必须包含 `moderate_intensity`、`low_intensity`、`中低强度` 或 `低强度` 中至少一个，确保本次新建正式训练内容具备规则推荐所需的反应训练和强度标签；缺失时脚本应直接阻断，不得创建不可验收训练链路。最终是否进入推荐 Top 3 仍由 `/rehab-plans/recommend` 返回结果断言确认。

脚本不会创建演示患者、不会依赖完整 seed 示例数据、不会打印密码、会话 cookie 或 CSRF 值。

本脚本中的评估由医师结构化录入，用于验证空库 API 闭环；不调用真实语音转写或大模型服务，不产生生产 AI/语音调用日志，也不构成真实 AI/语音评估验收。若验收目标声明为真实 AI/语音评估，但未提供生产供应商、HTTPS endpoint、密钥引用、调用日志和人工复核证据，应判定为硬阻断，不得用本脚本结果替代。

## 前置条件

1. 数据库已完成迁移。
2. 已执行 `pnpm db:seed:trial`。
3. API 服务已启动，且 `JWT_SECRET` 与运行时配置正确。
4. 本次验收使用的患者账号和游戏编码必须尚未存在。
5. 本次验收密码由环境变量提供，不写入命令历史、脚本或文档。
6. trial 管理员必须同时具备 `user.manage`、`game.manage`、`game.publish` 权限。

## 环境变量

必填：

```text
TRIAL_VERIFY_API_BASE_URL
TRIAL_VERIFY_ADMIN_ACCOUNT
TRIAL_VERIFY_ADMIN_PASSWORD
TRIAL_VERIFY_DOCTOR_ACCOUNT
TRIAL_VERIFY_DOCTOR_PASSWORD
TRIAL_VERIFY_PATIENT_ACCOUNT
TRIAL_VERIFY_PATIENT_PASSWORD
TRIAL_VERIFY_PATIENT_NAME
TRIAL_VERIFY_PATIENT_GENDER
TRIAL_VERIFY_PATIENT_AGE
TRIAL_VERIFY_ASSESSMENT_MMSE
TRIAL_VERIFY_ASSESSMENT_CDR
TRIAL_VERIFY_ASSESSMENT_MEMORY
TRIAL_VERIFY_ASSESSMENT_ORIENTATION
TRIAL_VERIFY_ASSESSMENT_EXECUTIVE
TRIAL_VERIFY_ASSESSMENT_LANGUAGE
TRIAL_VERIFY_ASSESSMENT_TRANSCRIPT
TRIAL_VERIFY_ASSESSMENT_ANALYSIS_SUMMARY
TRIAL_VERIFY_ASSESSMENT_MODEL_VERSION
TRIAL_VERIFY_ASSESSMENT_CONFIDENCE
TRIAL_VERIFY_GAME_CODE
TRIAL_VERIFY_GAME_NAME
TRIAL_VERIFY_GAME_VERSION
TRIAL_VERIFY_GAME_TRAINING_TARGETS
TRIAL_VERIFY_GAME_TAGS
TRIAL_VERIFY_GAME_DEFAULT_DURATION
TRIAL_VERIFY_GAME_DEFAULT_DIFFICULTY
TRIAL_VERIFY_COLLECTION_CONDITION_CODE
TRIAL_VERIFY_COLLECTION_CONDITION_NAME
TRIAL_VERIFY_COLLECTION_PROTOCOL_CODE
TRIAL_VERIFY_COLLECTION_PROTOCOL_NAME
TRIAL_VERIFY_COLLECTION_PROTOCOL_VERSION
TRIAL_VERIFY_RESULT_SCORE
TRIAL_VERIFY_RESULT_COMPLETION_RATE
TRIAL_VERIFY_RESULT_DURATION_SECONDS
TRIAL_VERIFY_RESULT_REACTION_TIME_MS
TRIAL_VERIFY_RESULT_MOTION_ACCURACY
TRIAL_VERIFY_RESULT_EXERCISE_INTENSITY
TRIAL_VERIFY_METRIC_REACTION_TIME_MS
TRIAL_VERIFY_METRIC_REACTION_SAMPLE_COUNT
TRIAL_VERIFY_METRIC_REACTION_CONFIDENCE
TRIAL_VERIFY_METRIC_TARGET_HIT_RATE
TRIAL_VERIFY_METRIC_TARGET_SAMPLE_COUNT
TRIAL_VERIFY_METRIC_TARGET_CONFIDENCE
TRIAL_VERIFY_METRIC_POSE_VISIBILITY_AVG
TRIAL_VERIFY_METRIC_POSE_SAMPLE_COUNT
TRIAL_VERIFY_METRIC_POSE_CONFIDENCE
TRIAL_VERIFY_METRIC_ARM_RAISE_ACCURACY
TRIAL_VERIFY_METRIC_ARM_SAMPLE_COUNT
TRIAL_VERIFY_METRIC_ARM_CONFIDENCE
```

示例命令只展示变量名，不展示真实密码：

```bash
TRIAL_VERIFY_API_BASE_URL=http://localhost:4000 \
TRIAL_VERIFY_ADMIN_ACCOUNT=<trial-admin-account> \
TRIAL_VERIFY_ADMIN_PASSWORD=<from-secret-store> \
TRIAL_VERIFY_DOCTOR_ACCOUNT=<trial-doctor-account> \
TRIAL_VERIFY_DOCTOR_PASSWORD=<from-secret-store> \
TRIAL_VERIFY_PATIENT_ACCOUNT=<new-patient-account> \
TRIAL_VERIFY_PATIENT_PASSWORD=<new-patient-password> \
TRIAL_VERIFY_PATIENT_NAME=<real-acceptance-patient-name> \
TRIAL_VERIFY_PATIENT_GENDER=<patient-gender> \
TRIAL_VERIFY_PATIENT_AGE=<patient-age> \
TRIAL_VERIFY_ASSESSMENT_MMSE=<mmse-score> \
TRIAL_VERIFY_ASSESSMENT_CDR=<cdr-score> \
TRIAL_VERIFY_ASSESSMENT_MEMORY=<memory-score> \
TRIAL_VERIFY_ASSESSMENT_ORIENTATION=<orientation-score> \
TRIAL_VERIFY_ASSESSMENT_EXECUTIVE=<executive-score> \
TRIAL_VERIFY_ASSESSMENT_LANGUAGE=<language-score> \
TRIAL_VERIFY_ASSESSMENT_TRANSCRIPT=<clinician-transcript-or-summary> \
TRIAL_VERIFY_ASSESSMENT_ANALYSIS_SUMMARY=<clinician-analysis-summary> \
TRIAL_VERIFY_ASSESSMENT_MODEL_VERSION=<assessment-source-or-model-version> \
TRIAL_VERIFY_ASSESSMENT_CONFIDENCE=<assessment-confidence> \
TRIAL_VERIFY_GAME_CODE=<new-browser-pose-game-code> \
TRIAL_VERIFY_GAME_NAME=<browser-pose-game-name> \
TRIAL_VERIFY_GAME_VERSION=<browser-pose-game-version> \
TRIAL_VERIFY_GAME_TRAINING_TARGETS=<comma-separated-targets> \
TRIAL_VERIFY_GAME_TAGS=<comma-separated-tags-include-moderate_intensity-or-中低强度> \
TRIAL_VERIFY_GAME_DEFAULT_DURATION=<duration-minutes> \
TRIAL_VERIFY_GAME_DEFAULT_DIFFICULTY=<difficulty> \
TRIAL_VERIFY_COLLECTION_CONDITION_CODE=<new-collection-condition-code> \
TRIAL_VERIFY_COLLECTION_CONDITION_NAME=<collection-condition-name> \
TRIAL_VERIFY_COLLECTION_PROTOCOL_CODE=<new-collection-protocol-code> \
TRIAL_VERIFY_COLLECTION_PROTOCOL_NAME=<collection-protocol-name> \
TRIAL_VERIFY_COLLECTION_PROTOCOL_VERSION=<collection-protocol-version> \
TRIAL_VERIFY_RESULT_SCORE=<score> \
TRIAL_VERIFY_RESULT_COMPLETION_RATE=<completion-rate> \
TRIAL_VERIFY_RESULT_DURATION_SECONDS=<duration-seconds> \
TRIAL_VERIFY_RESULT_REACTION_TIME_MS=<reaction-time-ms> \
TRIAL_VERIFY_RESULT_MOTION_ACCURACY=<motion-accuracy> \
TRIAL_VERIFY_RESULT_EXERCISE_INTENSITY=<low-or-moderate-or-high> \
TRIAL_VERIFY_METRIC_REACTION_TIME_MS=<reaction-metric-value> \
TRIAL_VERIFY_METRIC_REACTION_SAMPLE_COUNT=<reaction-sample-count> \
TRIAL_VERIFY_METRIC_REACTION_CONFIDENCE=<reaction-confidence> \
TRIAL_VERIFY_METRIC_TARGET_HIT_RATE=<target-hit-rate> \
TRIAL_VERIFY_METRIC_TARGET_SAMPLE_COUNT=<target-sample-count> \
TRIAL_VERIFY_METRIC_TARGET_CONFIDENCE=<target-confidence> \
TRIAL_VERIFY_METRIC_POSE_VISIBILITY_AVG=<pose-visibility> \
TRIAL_VERIFY_METRIC_POSE_SAMPLE_COUNT=<pose-sample-count> \
TRIAL_VERIFY_METRIC_POSE_CONFIDENCE=<pose-confidence> \
TRIAL_VERIFY_METRIC_ARM_RAISE_ACCURACY=<arm-raise-accuracy> \
TRIAL_VERIFY_METRIC_ARM_SAMPLE_COUNT=<arm-sample-count> \
TRIAL_VERIFY_METRIC_ARM_CONFIDENCE=<arm-confidence> \
pnpm verify:trial-empty-loop
```

## 执行步骤

1. 准备本次验收专用的 trial 管理员、trial 医师、患者账号、训练内容编码、采集条件编码和采集协议编码，确认这些标识均未在目标环境存在。
2. 确认 API 已启动，`TRIAL_VERIFY_API_BASE_URL` 指向本次验收环境，且六个角色账号/密码变量均由环境变量或密钥系统显式传入。
3. 确认 `TRIAL_VERIFY_GAME_TRAINING_TARGETS`、`TRIAL_VERIFY_GAME_TAGS` 可被规则推荐识别；推荐写法为 `TRIAL_VERIFY_GAME_TRAINING_TARGETS=attention,reaction,upper_limb`，`TRIAL_VERIFY_GAME_TAGS=camera_pose,upper_body,moderate_intensity,standard_clinic`。
4. 执行 `pnpm verify:trial-empty-loop`，脚本应从建档、授权、评估、训练内容、推荐、确认、采集条件、采集协议、采集批次、训练 session、训练结果和动作指标一路通过。
5. 保存命令输出和验收证据，输出中不得包含密码、会话 cookie、CSRF 值、完整密钥或原始敏感健康数据。

## 失败判定

以下情况视为 `BLOCKED` 或验收失败，不允许脚本自行兜底：

- trial 管理员、医师或患者账号不存在、密码错误、权限不足，或登录返回 `password_reset_required`。
- 六个角色账号/密码变量任一缺失，或脚本未在首次网络请求和 Prisma 初始化前阻断。
- 任一角色未先获取 CSRF cookie、写请求的 CSRF header 与 cookie 不匹配、读请求缺少该角色自己的 `rehab_session`，或不同角色共用会话。
- 管理员缺少 `user.manage`、`game.manage` 或 `game.publish` 权限。
- 患者账号或游戏编码已存在。
- 患者不能以本人账号签署当前版本授权。
- API 缺少患者创建、授权、评估、训练内容发布、推荐、确认、训练 session 或结果提交能力。
- 没有可发布且配置完整的 `browser_pose_canvas` 正式训练内容。
- 缺少采集条件、采集协议或采集批次创建能力。
- 采集批次不是本次新建、不是 `ready`，或患者、方案、方案项、训练内容、采集协议任一不匹配。
- 患者创建训练 session 时未传 `collectionBatchId`，或 session 未绑定本次新建采集批次。
- 训练结果缺少结构化 `metricsSummary` 或 `motionMetrics`。
- `metricsSummary.collectionBatchId` 缺失，或与训练 session 的 `collectionBatchId` 不一致。
- 查询训练记录时 session、result 或任一 motionMetric 不能反查到同一个 `collectionBatchId`。
- 验收目标声明为真实 AI/语音评估，但缺少生产供应商、HTTPS endpoint、密钥引用、调用日志或人工复核证据。

## 验收证据

交付验收时至少保留：

- 执行时间、API base URL、执行人和目标环境说明。
- 本次新建患者账号、训练内容 code、采集条件 code、采集协议 code、采集批次 ID、训练 session ID 和训练 result ID；不得记录密码、会话 cookie 或 CSRF 值。
- 命令输出，需显示每一步均为“通过”，特别是“管理员创建正式采集条件”“管理员创建正式采集协议”“医师创建正式采集批次”“创建训练 session”“提交结构化训练结果”“训练记录可查询且动作指标已入库”。
- 查询或截图证据，证明 session、result 和 4 条 motionMetric 的 `collectionBatchId` 全部一致。
- 若本次验收目标包含真实 AI/语音，应另附供应商调用 ID、模型版本、调用时间、人工复核记录和脱敏日志；本脚本输出不能替代该证据。

## 注意事项

- 当前脚本按真实 API 写入验收数据；执行前应选择一次性患者账号和游戏编码。
- 当前脚本会创建本次验收专属采集条件、采集协议和采集批次，不查询和复用已有批次，不创建默认批次，不做 fallback。
- 所有本次验收标识都不得包含 `mock`、`demo`、`seed`、`local`、`manual`、`fallback`、`default`、`reuse` 或 `existing` 等非生产标记。
- `TRIAL_VERIFY_COLLECTION_CONDITION_CODE`、`TRIAL_VERIFY_COLLECTION_PROTOCOL_CODE` 以及相关名称和版本不得包含 `mock`、`demo`、`local`、`manual` 或 `fallback` 标记。
- 当前脚本证明 API 空库闭环，不替代浏览器摄像头与姿态识别实机验收；实机证据需按 `docs/browser-pose-field-acceptance-runbook.md` 另行校验。
- 脚本不做自动重试、不切换账号、不复用既有患者或游戏内容。
- 如需要清理验收数据，应由管理员按数据库运维流程执行，并保留审计记录。
