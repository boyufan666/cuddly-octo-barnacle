# 阿尔茨海默病 AI+体感康复平台 模块边界与 API 资源草案

## 1. 文档说明

- 文档版本：`v0.1`
- 文档用途：用于后端模块拆分、API 资源规划、前后端协作边界对齐
- 依赖文档：
  - [rehab-platform-mvp-prd.md](/Users/thl/IdeaProjects/Rehabilitation platform/docs/rehab-platform-mvp-prd.md)
  - [rehab-platform-role-flows-and-pages.md](/Users/thl/IdeaProjects/Rehabilitation platform/docs/rehab-platform-role-flows-and-pages.md)

## 2. 角色标记

- `患` = 患者端
- `医` = 医师端
- `家` = 家属端
- `管` = 管理员端
- `内` = 系统内部/AI 服务/任务调度使用

## 3. 模块边界总览

建议按以下模块拆分：

1. 认证与身份模块
2. 患者档案与照护关系模块
3. 同意与授权模块
4. 评估与 AI 分析模块
5. 风险分级模块
6. 康复计划模块
7. 训练内容模块
8. 训练执行与训练记录模块
9. 训练结果汇总与异常干预模块
10. 消息提醒模块
11. 设备与权限检测模块
12. 平台治理与系统配置模块
13. 审计与合规模块

## 4. 模块设计

### 4.1 认证与身份模块

职责：

- 登录、登出、刷新令牌
- 用户基础账号
- 角色绑定与 RBAC 判定
- 当前身份上下文切换

核心资源：

- `User`
- `Session`
- `RoleBinding`
- `PermissionScope`

核心 API：

- `POST /auth/login` `患/医/家/管`
- `POST /auth/logout` `患/医/家/管`
- `POST /auth/refresh-token` `患/医/家/管`
- `GET /me` `患/医/家/管`
- `GET /me/roles` `患/医/家/管`
- `POST /me/switch-role` `患/医/家/管`
- `GET /permissions/me` `患/医/家/管`
- `GET /admin/users` `管`
- `POST /admin/users` `管`
- `PATCH /admin/users/{userId}/status` `管`
- `POST /admin/users/{userId}/roles` `管`

### 4.2 患者档案与照护关系模块

职责：

- 患者建档与资料维护
- 医师负责关系
- 家属绑定关系
- 患者访问范围控制

核心资源：

- `PatientProfile`
- `DoctorAssignment`
- `CaregiverRelation`

核心 API：

- `POST /patients` `医`
- `GET /patients` `医/管`
- `GET /patients/{patientId}` `医`
- `PATCH /patients/{patientId}` `医`
- `GET /me/patient-profile` `患`
- `PATCH /me/patient-profile` `患`
- `GET /patients/{patientId}/caregivers` `医`
- `POST /patients/{patientId}/caregivers` `患/医`
- `PATCH /patients/{patientId}/caregivers/{relationId}` `患/医`
- `DELETE /patients/{patientId}/caregivers/{relationId}` `患/医`
- `GET /caregiver/patients` `家`
- `GET /caregiver/patients/{patientId}/summary` `家`

### 4.3 同意与授权模块

职责：

- 隐私政策、AI 数据处理、摄像头/麦克风授权
- 家属共享授权
- 同意撤回和留痕

核心资源：

- `ConsentRecord`
- `ConsentTemplate`
- `SharingAuthorization`

核心 API：

- `GET /consent/templates` `患/家/医/管`
- `GET /me/consents` `患/家`
- `POST /me/consents` `患/家`
- `POST /me/consents/{consentId}/withdraw` `患/家`
- `GET /patients/{patientId}/consents` `医`
- `POST /patients/{patientId}/sharing-authorizations` `患`
- `PATCH /patients/{patientId}/sharing-authorizations/{authId}` `患`
- `GET /caregiver/authorizations` `家`
- `GET /admin/consent-configs` `管`
- `PUT /admin/consent-configs/{type}` `管`

### 4.4 评估与 AI 分析模块

职责：

- 发起评估
- 采集评估输入
- 生成结构化评估结果
- 保存 AI 分析摘要和版本

核心资源：

- `AssessmentRecord`
- `AssessmentInput`
- `AIAnalysisRecord`

核心 API：

- `POST /patients/{patientId}/assessments` `医`
- `GET /patients/{patientId}/assessments` `医`
- `GET /patients/{patientId}/assessments/{assessmentId}` `医`
- `POST /me/assessments` `患`
- `GET /me/assessments/current` `患`
- `GET /me/assessments/history` `患`
- `POST /assessments/{assessmentId}/inputs` `患/内`
- `POST /assessments/{assessmentId}/complete` `患/内`
- `POST /assessments/{assessmentId}/retry` `患/医`
- `GET /assessments/{assessmentId}/ai-analysis` `医`
- `GET /patients/{patientId}/latest-assessment-summary` `医`
- `GET /me/latest-assessment-summary` `患`

### 4.5 风险分级模块

职责：

- 基于评估结果形成风险等级
- 提供判断依据摘要
- 支持医师确认或修正

核心资源：

- `RiskLevelRecord`
- `RiskAdjustmentRecord`

核心 API：

- `GET /patients/{patientId}/risk-level` `医`
- `GET /me/risk-level` `患`
- `POST /patients/{patientId}/risk-level/confirm` `医`
- `POST /patients/{patientId}/risk-level/adjust` `医`
- `GET /patients/{patientId}/risk-level/history` `医`
- `GET /patients/{patientId}/risk-level-basis` `医`
- `GET /me/risk-level-summary` `患`

### 4.6 康复计划模块

职责：

- 基于评估与风险等级生成初始计划
- 医师确认、调整、下发、暂停、结束
- 维护版本链与当前唯一生效计划

核心资源：

- `RehabPlan`
- `RehabPlanVersion`
- `RehabPlanItem`
- `PlanGoal`

核心 API：

- `POST /patients/{patientId}/plan-recommendations` `内/医`
- `GET /patients/{patientId}/plan-recommendations/latest` `医`
- `POST /patients/{patientId}/plans` `医`
- `GET /patients/{patientId}/plans` `医`
- `GET /patients/{patientId}/plans/current` `医`
- `GET /patients/{patientId}/plans/{planId}` `医`
- `PATCH /patients/{patientId}/plans/{planId}` `医`
- `POST /patients/{patientId}/plans/{planId}/activate` `医`
- `POST /patients/{patientId}/plans/{planId}/pause` `医`
- `POST /patients/{patientId}/plans/{planId}/end` `医`
- `GET /patients/{patientId}/plans/{planId}/versions` `医`
- `GET /me/current-plan` `患`
- `GET /me/current-plan/summary` `患`
- `GET /caregiver/patients/{patientId}/plan-summary` `家`

### 4.7 训练内容模块

职责：

- 游戏和训练项目管理
- 内容上下架、适用风险等级、难度和目标配置

核心资源：

- `GameContent`
- `GameRule`
- `DifficultyProfile`
- `ContentVersion`

核心 API：

- `GET /game-contents` `医/管`
- `GET /game-contents/{gameId}` `医/管`
- `GET /me/available-game-contents` `患`
- `POST /admin/game-contents` `管`
- `PATCH /admin/game-contents/{gameId}` `管`
- `POST /admin/game-contents/{gameId}/enable` `管`
- `POST /admin/game-contents/{gameId}/disable` `管`
- `GET /admin/game-contents/{gameId}/versions` `管`

### 4.8 训练执行与训练记录模块

职责：

- 患者发起训练
- 训练会话状态流转
- 过程指标采集
- 结果回传和结构化归档

核心资源：

- `TrainingTask`
- `TrainingSession`
- `TrainingResult`
- `MotionMetric`
- `TrainingInterruptRecord`

核心 API：

- `GET /me/today-training-tasks` `患`
- `GET /me/training-tasks/{taskId}` `患`
- `POST /me/training-sessions` `患`
- `GET /me/training-sessions/{sessionId}` `患`
- `POST /training-sessions/{sessionId}/pause` `患`
- `POST /training-sessions/{sessionId}/resume` `患`
- `POST /training-sessions/{sessionId}/terminate` `患`
- `POST /training-sessions/{sessionId}/metrics` `内`
- `POST /training-sessions/{sessionId}/result` `内`
- `POST /training-sessions/{sessionId}/sync-retry` `内`
- `GET /me/training-records` `患`
- `GET /me/training-records/{sessionId}` `患`
- `GET /patients/{patientId}/training-records` `医`
- `GET /patients/{patientId}/training-records/{sessionId}` `医`
- `GET /caregiver/patients/{patientId}/training-records/summary` `家`

### 4.9 训练结果汇总与异常干预模块

职责：

- 训练结果按天、周、计划周期聚合
- 异常检测
- 医师待处理视图

核心资源：

- `TrainingSummary`
- `TrainingTrend`
- `AbnormalTrainingAlert`
- `InterventionRecord`

核心 API：

- `GET /me/training-summary` `患`
- `GET /me/training-trends` `患`
- `GET /patients/{patientId}/training-summary` `医`
- `GET /patients/{patientId}/training-trends` `医`
- `GET /doctor/abnormal-alerts` `医`
- `GET /doctor/abnormal-alerts/{alertId}` `医`
- `POST /doctor/abnormal-alerts/{alertId}/handle` `医`
- `GET /caregiver/patients/{patientId}/progress-summary` `家`

### 4.10 消息提醒模块

职责：

- 训练提醒
- 未完成提醒
- 异常提示
- 已读状态

核心资源：

- `Notification`
- `ReminderTask`
- `MessageReadState`

核心 API：

- `GET /me/notifications` `患/医/家/管`
- `POST /me/notifications/{notificationId}/read` `患/医/家/管`
- `GET /caregiver/reminders` `家`
- `GET /me/training-reminders` `患`
- `POST /internal/reminders/dispatch` `内`
- `POST /admin/notifications` `管`

### 4.11 设备与权限检测模块

职责：

- 摄像头/麦克风授权状态
- 设备在线状态
- 训练前环境校验

核心资源：

- `DeviceAuthorization`
- `DeviceRegistry`
- `DeviceHealthCheck`

核心 API：

- `GET /me/device-authorizations` `患`
- `POST /me/device-authorizations/check` `患`
- `POST /me/device-authorizations` `患`
- `GET /admin/devices` `管`
- `GET /admin/devices/{deviceId}` `管`
- `POST /admin/devices/{deviceId}/health-check` `管`
- `PATCH /admin/devices/{deviceId}/status` `管`

### 4.12 平台治理与系统配置模块

职责：

- 协议版本
- 系统参数
- 字典项
- 运营概览

核心资源：

- `SystemConfig`
- `DictionaryItem`
- `PolicyVersion`
- `DashboardMetric`

核心 API：

- `GET /admin/dashboard/overview` `管`
- `GET /admin/system-configs` `管`
- `PUT /admin/system-configs/{key}` `管`
- `GET /admin/dictionaries/{type}` `管`
- `PUT /admin/dictionaries/{type}` `管`
- `GET /admin/policy-versions` `管`
- `POST /admin/policy-versions` `管`

### 4.13 审计与合规模块

职责：

- 关键操作审计
- 数据访问留痕
- 敏感操作查询

核心资源：

- `AuditLog`
- `SensitiveAccessRecord`
- `SystemEventLog`

核心 API：

- `GET /admin/audit-logs` `管`
- `GET /admin/audit-logs/{logId}` `管`
- `GET /admin/system-events` `管`
- `GET /admin/system-events/{eventId}` `管`
- `POST /internal/audit-logs` `内`
- `POST /internal/system-events` `内`

## 5. 推荐模块依赖顺序

建议主链路依赖如下：

`认证与身份`
-> `患者档案与照护关系`
-> `同意与授权`
-> `评估与 AI 分析`
-> `风险分级`
-> `康复计划`
-> `训练执行与训练记录`
-> `训练结果汇总与异常干预`

横向支撑模块：

- `训练内容模块`
- `消息提醒模块`
- `设备与权限检测模块`
- `平台治理与系统配置模块`
- `审计与合规模块`

## 6. 按角色看的 API 使用重点

### 6.1 患者端

核心资源：

- `auth`
- `me/patient-profile`
- `me/consents`
- `me/assessments`
- `me/current-plan`
- `me/today-training-tasks`
- `me/training-sessions`
- `me/training-records`
- `me/training-summary`
- `me/notifications`
- `me/device-authorizations`

### 6.2 医师端

核心资源：

- `patients`
- `patients/{id}/assessments`
- `patients/{id}/risk-level`
- `patients/{id}/plans`
- `patients/{id}/training-records`
- `patients/{id}/training-summary`
- `doctor/abnormal-alerts`
- `game-contents`

### 6.3 家属端

核心资源：

- `caregiver/patients`
- `caregiver/patients/{id}/summary`
- `caregiver/patients/{id}/plan-summary`
- `caregiver/patients/{id}/progress-summary`
- `caregiver/reminders`
- `me/notifications`

### 6.4 管理员端

核心资源：

- `admin/users`
- `admin/game-contents`
- `admin/devices`
- `admin/dashboard/overview`
- `admin/system-configs`
- `admin/policy-versions`
- `admin/audit-logs`
- `admin/system-events`

## 7. 关键边界约束

1. 患者任一时点只能有一个“当前生效计划”。
2. 风险分级建议独立成域，不直接混入评估结果主表。
3. 家属端默认只读取摘要资源。
4. 管理员端默认访问治理数据和脱敏数据，不直接访问患者敏感详情。
5. 训练结果聚合与异常提醒建议作为读模型或分析域。
6. AI 输出必须通过 `AIAnalysisRecord` 留痕，但保持辅助建议定位。

## 8. 后续建议

下一步建议继续产出：

1. `OpenAPI 目录结构建议`
2. `资源命名规范`
3. `接口鉴权矩阵`
4. `前端页面到 API 资源映射表`
