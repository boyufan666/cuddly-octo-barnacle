# hd117.com 单机部署

用户授权在现有阿里云服务器上运行 Web、API、PostgreSQL 与 Redis，新建空库，只创建机构、管理员和医师。此方案不迁移本地测试数据。原 Render 部署配置继续独立存在。

## 运行配置

- Ubuntu 24.04，Node.js 24.19.0，pnpm 10.29.3；依赖使用 frozen lockfile 安装。
- PostgreSQL 18 / Redis 8：Compose 持久卷，仅向 127.0.0.1 发布 5432 / 6379，均配置随机密码。
- `DEPLOYMENT_MODE=single-host`：API 仅监听 127.0.0.1:4000，并校验 Redis 为本机 6379、密码至少 32 字节。
- Web 监听 127.0.0.1:3000；Nginx 保留 API 原路径进行同源转发，HTTPS 与 www 重定向到 hd117.com。
- `/etc/rehab/api.env` 保存运行环境；MiMo 与数据加密密钥保存在 `/etc/secrets/` 普通文件内，不进入源码包。
- 服务器独立生成 JWT、数据库、Redis、数据加密密钥和初始账号密码；复用已有 MiMo 供应商及模型配置。
- 首次登录强制改密；手机号明确为空，角色资料待负责人完善。生产初始化不创建患者、同意记录或训练结果。

## 资源与运行限制

服务器实际内存约 1.6 GiB，已配置 3 GiB swap 供短时运行峰值使用。PostgreSQL 容器内存上限 384 MiB、Redis 128 MiB，API 512 MiB、Web 384 MiB。这些上限不代表已完成并发容量验收。

禁止在这台生产主机执行 `pnpm regression:full`、Playwright 测试服务、全量 TypeScript 检查或并发构建。2026-10-24 的回归期间，可用内存降至约 67.5–74.6 MiB，2 核主机负载达到约 40，阻塞任务约 35；磁盘利用率约 97%，CPU I/O 等待约 89%，随后 SSH 与 HTTPS 失去响应。现有 swap 和生产服务的内存上限不能限制独立启动的回归进程。

`scripts/run-full-regression.mjs` 在检测到 `/etc/rehab/api.env` 时拒绝所有 scope，并在启动任何子进程前报错。检查只判断文件是否存在，不读取配置内容。该边界覆盖这个回归入口；直接运行单个构建或测试命令仍需遵守上述生产机限制。

发布构建和完整回归在独立 Linux runner 上执行，使用各门禁要求的专用 disposable 数据库；不得使用生产数据库 `rehab_platform`。从本机浏览器打开 `https://hd117.com/` 验证线上登录、导航和页面响应；会创建或修改测试业务数据的自动化流程在隔离测试环境运行。

本次部署显式配置 AI 配额：每日每用户/患者 100 次、每机构 1000 次；语音 3600 秒、TTS 50000 字符；高成本操作每用户每分钟 10 次。技术预算单位为 AI 请求 100、语音每秒 1、TTS 每字符 1，用户/患者每日预算 100000、机构 1000000；这些单位不等于人民币。具体计数作用域以 `mimo-usage-gate.ts` 为准。运营方可修改 `/etc/rehab/api.env` 后重启 API。

## 运维

```bash
systemctl status rehab-api rehab-web nginx
docker compose -f /opt/rehab/current/infra/single-host/compose.yaml ps
curl --fail https://hd117.com/health/ready
journalctl -u rehab-api -u rehab-web --since '10 min ago'
systemctl start rehab-backup.service
```

`rehab-backup.timer` 每日北京时间 03:15 左右生成 PostgreSQL 自定义格式备份，保存于 `/opt/rehab/shared/backups`，保留约 7 日。备份目前与数据库同机，应另行落实异地备份；恢复加密数据还需保管 `/etc/secrets/sensitive_data_key` 及对应 key reference。

`rehab-retention.timer` 每日北京时间 04:15 左右执行供应商遥测清理，保留期 30 日。Certbot 系统定时任务负责 TLS 证书续期。

### 无响应后的恢复检查

重启后先确认依赖、服务和资源，再检查线上页面：

```bash
uptime
free -m
systemctl is-enabled docker rehab-api rehab-web nginx
systemctl --failed --no-pager
docker compose -f /opt/rehab/current/infra/single-host/compose.yaml ps
curl --fail --max-time 10 http://127.0.0.1:4000/health/ready
curl --fail --max-time 10 https://hd117.com/health/ready
curl --fail --max-time 10 -I https://hd117.com/
```

数据库和 Redis 运行在 Compose 容器内，不能根据宿主机 `postgresql.service` 或 `redis-server.service` 的 inactive 状态判断数据库故障。已完成重启后不要直接 kill 历史记录里的 PID；PID 可能被复用，必须先核对当前进程的命令行、工作目录和进程组。先保留对应启动周期的 journal、sysstat 和回归日志，再清理已确认的测试进程；不要通过重置数据库恢复服务。

部署源码由当前工作区导出，包内 `source-manifest.json` 记录基准 Git commit 和每个文件 SHA-256，包外 SHA-256 校验传输。未经提交的工作区内容由该清单标识，不能将基准 commit 单独当作完整发布标识。运行版本位于 `/opt/rehab/releases`，`/opt/rehab/current` 指向当前版本。

## 首次安装顺序

1. 安装 Node.js/pnpm、Docker Compose、Nginx、Certbot，建立 rehab 系统账号及密钥目录。
2. 放入独立生成的 Secret Files 和运行环境文件；创建 PostgreSQL/Redis 持久卷。
3. 在独立且与目标主机架构匹配的 Linux runner 安装锁定依赖、生成 Prisma Client 并构建应用；校验发布产物 SHA-256，解包到服务器的新发布目录。
4. 通过 `pnpm db:migrate:deploy` 应用迁移，再执行 `pnpm db:bootstrap:production`。不得调用 demo/customer seed。
5. 安装服务单元，启动 API/Web，验证数据库和 Redis readiness；配置证书和 `nginx-tls.conf`。
6. 验证登录、HTTPS、匿名访问保护、备份恢复和 MiMo 连通性，再交付账号。

首次证书签发使用 `nginx.conf`（HTTP）；签发成功后安装 `nginx-tls.conf`，不要在证书文件尚不存在时启用 TLS 配置。
