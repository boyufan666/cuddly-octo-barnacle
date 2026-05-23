# Rehab Platform API

NestJS 后端服务，负责康复平台的一期核心业务接口：

- 账号登录、角色识别、RBAC 与数据范围控制
- 患者建档、知情同意、家属授权绑定
- 评估记录、风险评级、康复计划推荐与医师确认
- 训练会话、训练结果、动作指标与数据质量标记
- 训练内容管理、训练资源发布配置、Unity Bridge 结果校验
- 浏览器体感训练内容正式发布校验
- 脱敏数据导出、审计日志、系统事件

## 本地运行

从仓库根目录执行：

```bash
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

健康检查：

```bash
curl http://localhost:4000/health
```

## 配置

API 从仓库根目录 `.env` 读取配置。`.env.example` 只提供字段结构，试点/生产环境必须独立配置：

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `WEB_ORIGIN`
- `PORT`
- `DEFAULT_PATIENT_PASSWORD`

## 验收

从仓库根目录执行：

```bash
pnpm verify:contracts
```

该脚本会使用本地 API 和数据库验证真实写入、运行时约束、训练结果入库、动作指标入库和审计日志，并在结束后清理本次验收数据。脚本不进行摄像头实采，也不生成姿态帧。

## 生产注意事项

- 不得使用本地初始化账号和固定密码作为试点/生产账号。
- 必须使用强随机 `JWT_SECRET`。
- `WEB_ORIGIN` 必须限定为正式前端域名。
- 数据库、Redis、日志、备份和 HTTPS 应由部署环境统一管理。
- AI/语音服务、Unity 静态资源、对象存储等外部能力应通过后端受控接入，不直接暴露敏感密钥给前端。
- 训练内容发布流程见 `../../docs/formal-training-content-runbook.md`。
