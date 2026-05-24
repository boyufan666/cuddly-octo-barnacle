# Rehab Platform Web

Next.js 前端应用，覆盖四类角色入口：

- 患者端：建档授权、设备权限、AI 评估、智能匹配、今日训练、训练准备、实时采集、训练反馈
- 家属端：授权患者摘要、今日训练提醒、阶段进展
- 医师端：负责患者管理、评估查看、康复计划确认与调整、训练结果回看
- 运营管理端：运营概览、家属账号创建、训练内容管理、训练资源发布、安全脱敏与审计

## 本地运行

从仓库根目录执行：

```bash
pnpm dev:web
```

默认访问地址：

```text
http://localhost:3000
```

## 配置

Web 端通过环境变量连接 API：

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

试点或生产环境应配置为正式 API 域名，并通过 HTTPS 访问。

## 体感与 Unity 资源

- 浏览器体感训练依赖摄像头权限和姿态识别模型加载。
- 浏览器体感训练内容可由具备发布权限的管理员在运营管理端创建并发布。
- Unity WebGL 资源应放在 `public/unity/<gameCode>/<version>/`。
- Unity 训练内容必须提供 `manifest.json` 和构建产物，并通过 `public/unity/rehab-unity-bridge.js` 回传结构化训练结果。

详见：

- `../../docs/formal-training-content-runbook.md`
- `../../docs/unity/unity-webgl-bridge-protocol.md`
- `public/unity/README.md`

## 验收重点

- 四角色登录后只展示各自授权页面。
- 患者端未完成授权时不能进入对应采集或 AI 处理流程。
- 家属端只显示授权摘要，不开放完整病史、原始评估或计划编辑。
- 医师端只查看负责患者的完整业务数据。
- 运营管理端展示脱敏数据、训练内容配置和审计日志。
- 训练结果必须由真实采集或合法训练资源回传生成，不使用固定成绩。
- 浏览器体感训练完成后，应将 evidence JSON、截图、录屏与真实 API 训练记录和审计日志一起通过 `pnpm verify:browser-pose-field-acceptance` 只读验真；仅有前端截图不能作为正式验收依据。

## 构建与检查

从仓库根目录执行：

```bash
pnpm --filter @rehab-platform/web exec tsc --noEmit --pretty false
pnpm --filter @rehab-platform/web lint
pnpm --filter @rehab-platform/web build
```

## 浏览器要求

- 支持摄像头权限授权。
- 支持 WebAssembly 和现代浏览器 API。
- 医院内网或私有化环境需提前确认姿态识别模型和 Unity 静态资源的访问策略。
