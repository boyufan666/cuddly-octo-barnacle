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
- 医师录入结构化 MMSE/CDR/AI 摘要评估。
- 管理员创建并发布 `browser_pose_game` 正式训练内容。
- 医师生成推荐方案并确认方案。
- 患者创建训练 session。
- 患者提交结构化训练结果和动作指标。
- 医师查询训练记录，确认结果和 4 条动作指标已入库。

脚本不会创建演示患者、不会依赖完整 seed 示例数据、不会打印密码或 token。

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
TRIAL_VERIFY_ASSESSMENT_MODEL_VERSION=<assessment-model-version> \
TRIAL_VERIFY_ASSESSMENT_CONFIDENCE=<assessment-confidence> \
TRIAL_VERIFY_GAME_CODE=<new-browser-pose-game-code> \
TRIAL_VERIFY_GAME_NAME=<browser-pose-game-name> \
TRIAL_VERIFY_GAME_VERSION=<browser-pose-game-version> \
TRIAL_VERIFY_GAME_TRAINING_TARGETS=<comma-separated-targets> \
TRIAL_VERIFY_GAME_TAGS=<comma-separated-tags> \
TRIAL_VERIFY_GAME_DEFAULT_DURATION=<duration-minutes> \
TRIAL_VERIFY_GAME_DEFAULT_DIFFICULTY=<difficulty> \
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

## 失败判定

以下情况视为 `BLOCKED` 或验收失败，不允许脚本自行兜底：

- trial 管理员或医师账号不存在、密码错误或权限不足。
- 管理员缺少 `user.manage`、`game.manage` 或 `game.publish` 权限。
- 患者账号或游戏编码已存在。
- 患者不能以本人账号签署当前版本授权。
- API 缺少患者创建、授权、评估、训练内容发布、推荐、确认、训练 session 或结果提交能力。
- 没有可发布且配置完整的 `browser_pose_game` 正式训练内容。
- 训练结果缺少结构化 `metricsSummary` 或 `motionMetrics`。

## 注意事项

- 当前脚本按真实 API 写入验收数据；执行前应选择一次性患者账号和游戏编码。
- 当前脚本证明 API 空库闭环，不替代浏览器摄像头与姿态识别实机验收；实机证据需按 `docs/browser-pose-field-acceptance-runbook.md` 另行校验。
- 脚本不做自动重试、不切换账号、不复用既有患者或游戏内容。
- 如需要清理验收数据，应由管理员按数据库运维流程执行，并保留审计记录。
