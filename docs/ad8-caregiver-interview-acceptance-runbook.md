# AD-8 照护者访谈正式验收 Runbook

本文用于证明平台支持客户原需求中的 AD-8 照护者访谈筛查，并且该能力不是页面演示：必须通过真实 API 创建正式评估、风险评级、分析记录和审计日志。

## 验收边界

- `pnpm verify:ad8-caregiver-interview-acceptance` 会调用平台 API 完成只读授权检查和正式 AD-8 写入。
- 脚本验证“授权家属摘要可读且脱敏 -> 医生复核 AD-8 8 个题项 -> `POST /assessments` 创建 AD-8 -> 反查风险评级/分析记录 -> 反查审计日志”。
- 脚本不会创建患者、不会创建家属账号、不会补写授权、不会伪造审计日志。
- 缺医生账号/密码、家属账号/密码、审计账号/密码、患者授权、家属授权、8 个题项、医生 `approved`、风险评级、分析记录或审计日志时必须失败。
- 医师、家属和审计账号必须两两不同，并分别创建独立 Cookie 会话；账号冲突会在任何网络请求前失败。不接受旧 `doctorToken`、`caregiverToken`、`auditToken` 或 `accessToken` 代替账号密码，也不发送 `Authorization`/Bearer。
- 每个角色都必须先完成 `GET /auth/csrf` 和 `POST /auth/login`。登录以及 Cookie/CSRF 校验错误会立即失败，不重试、不切换认证方式。
- 不得把 mock、demo、seed、fallback、fixed、manual、synthetic 文本或固定结果作为正式 AD-8 验收证据。

## 前置条件

1. 患者已签署 `privacy_policy`、`ai_processing` 和 `caregiver_sharing` 授权。
2. 家属账号已由平台创建，并与患者建立 active 家属关系。
3. 医师账号对应用户必须是本次 `humanReview.reviewerUserId`。
4. 审计账号必须具备 `audit.read` 权限。
5. AD-8 访谈必须来自真实照护者或家属访谈，不使用模板文字或固定结论。

## 配置 JSON

创建仅本机验收人员可读的临时 JSON 文件；`apiBaseUrl` 必须是 API 的 HTTPS origin（例如 `https://api.rehab.example.com`），不要附加 `/api` 路径。所有 `<...>` 必须替换为现场真实值：

```json
{
  "apiBaseUrl": "https://api.rehab.example.com",
  "doctorAccount": "<医师账号>",
  "doctorPassword": "<医师密码>",
  "caregiverAccount": "<授权家属账号>",
  "caregiverPassword": "<授权家属密码>",
  "auditAccount": "<具备 audit.read 权限的账号>",
  "auditPassword": "<审计账号密码>",
  "patientId": "<真实患者 ID>",
  "informant": {
    "caregiverUserId": "<授权家属用户 ID>",
    "relation": "daughter"
  },
  "humanReview": {
    "reviewerUserId": "<医师用户 ID>",
    "reviewedAt": "2026-05-31T09:15:00.000Z",
    "conclusion": "approved",
    "notes": "医生已复核 AD-8 访谈和结构化题项"
  },
  "interview": {
    "assessmentSource": "caregiver_interview",
    "transcript": "<真实照护者访谈转写>",
    "analysisSummary": "<真实访谈分析摘要>",
    "confidence": 0.86,
    "items": {
      "itemMemoryProblems": 1,
      "itemReducedInterest": 0,
      "itemRepeatsQuestions": 1,
      "itemTroubleLearningTools": 0,
      "itemForgetsMonthYear": 1,
      "itemHandlesFinancesPoorly": 1,
      "itemTroubleAppointments": 0,
      "itemDailyThinkingMemoryProblems": 0
    }
  }
}
```

不要把配置文件提交到版本库；验收完成后由现场人员删除。脚本不会缓存密码、保存登录响应中的 `accessToken`，也不会生成默认凭据。

## 验收命令

```bash
pnpm verify:ad8-caregiver-interview-acceptance -- <config-json-path>
```

总闭环验收会在 `ad8CaregiverInterview.requiredForLaunch=true` 时自动执行该脚本：

```bash
pnpm verify:empty-real-loop -- <orchestrator-config-json>
```

## 脚本会验证什么

- `apiBaseUrl` 必须是正式 HTTPS，且不能包含 `mock/demo/seed/fallback/fixed/manual/synthetic` 标记。
- 配置、业务响应、正式记录和每条审计候选必须递归满足 JSON plain object 契约：对象原型只能是 `Object.prototype`，own keys 只能是 enumerable string data keys；数组逐项检查。symbol、non-enumerable、accessor、custom/null prototype 或数组额外属性都会硬失败。
- 危险值标签与 payload 之间允许一个或多个空白、冒号、等号、下划线、连字符或其组合；secret payload 最少为 8 个字符。正常 `token-plan endpoint` 文本和 endpoint hostname 不按 token 误拒。
- 医师、授权家属和审计账号的账号/密码必须显式提供，旧 token-only 配置会在任何网络请求前失败。
- 三个角色账号必须两两不同，并分别通过 Cookie 会话登录；账号冲突必须在任何网络请求前失败。登录 POST 和后续 `POST /assessments` 自动携带 `rehab_csrf` cookie 与匹配的 `x-csrf-token`，所有请求都不得携带 `Authorization`。
- 医师会话的 `GET /me` 必须返回医师角色，且当前医师用户必须等于 `humanReview.reviewerUserId`。
- 家属会话的 `GET /me` 必须返回家属角色，且当前家属用户必须等于 `informant.caregiverUserId`。
- 患者必须有有效 `privacy_policy`、`ai_processing` 和 `caregiver_sharing` 授权。
- 授权家属必须能访问 `GET /caregiver/patients/:id/summary`，摘要不得包含原始动作指标、采集明细、原始评估权限、方案编辑权限或完整病历权限。
- AD-8 必须包含 8 个题项，每项只能是 0 或 1，`ad8Total` 由脚本按 8 项求和生成。
- 脚本只在 `humanReview.conclusion=approved` 时调用 `POST /assessments`。
- 正式评估创建后，必须能通过 `GET /patients/:id/assessments` 反查 AD-8 正式评估、风险评级和分析记录。
- `assessment.create` 和 `caregiver.summary.view` 审计成功候选都必须恰好一条；返回的每条审计候选都会递归扫描危险键、危险值和演示/合成标记，不能从重复候选中只挑第一条。
- 审计查询只使用独立审计 Cookie 会话，不复用医师或家属 cookie。
- 登录、CSRF、API 或字段校验失败时脚本立即失败；不会自动重试、回退到 Bearer、补写数据或把失败伪装为成功。
- API 失败或字段不一致时，脚本只报告路径和失败类别，不打印响应体、服务端返回 ID/值、访谈原文、token、密钥或模型摘要。

## 交付口径

通过本脚本只能证明 AD-8 照护者访谈作为“筛查记录 + 医生复核入库 + 风险评级 + 审计追溯”已经可用。它不证明自动诊断能力，也不替代 MMSE/CDR、医生临床判断或客户线下评估流程。
