# 生产依赖 SBOM 与许可证门禁手册

生产发布前必须从当前实际 pnpm 安装树生成依赖工件，并由客户安全负责人对当前锁文件的许可证表达式作出书面批准。该门禁不访问网络、不调用 npm SBOM，也不接受空工作区、模板、waiver、单组件例外、未知许可证或缺失安装元数据。

## 生成工件

Production 基线、客户审批和发布门禁只能使用与 Render 发布环境等价的 Linux CI 作业中、在 `pnpm install --frozen-lockfile` 后生成的工件。macOS 开发机可以运行生成器作严格诊断：它会按本机精确目标验证安装树，并且只会排除已由 lockfile 证明不适用的 optional 分支；这类诊断工件不能用于客户批准或 Production 发布。开发机不得猜测 Linux 包、手工补写组件或将未证明不适用的缺失包视为可忽略。

`pnpm list` 会展开包管理器已知的 optional 二进制，即使该二进制不适用于当前 OS、CPU 或 Linux libc。生成器使用结构化解析的 pnpm v9 lockfile 同时验证父 snapshot 的 `optionalDependencies` 关系与 child 的 `os`、`cpu`、`libc` 限制。只有一个 child 被父 snapshot 明确标记 optional、其 lockfile 元数据明确排除当前目标、且安装路径确实不存在时，才会剪枝该 child 及其子树。普通依赖、当前目标兼容的 optional 依赖、缺少或歧义的 lockfile 元数据、以及任何已安装但不兼容的包都会失败。Linux 目标必须由 Node runtime report 精确确认 glibc；无法确认时失败，不会猜测 musl 或将安装失败当成可选。

Render 等价 Linux CI 必须运行 glibc 用户态和能提供 `process.report.getReport().header.glibcVersionRuntime` 的 Node 运行时；生成器无法精确确认 libc 时会失败。此限制防止把 glibc/musl 的不同 optional 二进制误归类为相同构件。Linux CI 生成和验收必须在同一次冻结安装之后执行：

```bash
pnpm supply-chain:artifacts
```

命令从 `pnpm list -r --prod --depth Infinity --json` 给出的已安装生产依赖路径读取每个外部组件的 `package.json`。它在 `output/supply-chain/` 生成：

- `production-dependencies.cdx.json`：CycloneDX 1.5 SBOM。
- `production-dependencies.licenses.json`：逐组件声明许可证清单。

两份工件都包含当前 `pnpm-lock.yaml` 的 SHA-256、Node 版本、pnpm 版本、平台、架构以及 Linux 场景的 libc。许可证必须直接来自组件 `package.json` 的且仅能二选一的声明：精确非空字符串 `license`，或旧版 npm 结构中唯一 `licenses[0].type` 的精确非空字符串。两种字段并存、`licenses` 不是单元素数组、空值、缺失或非字符串声明都会失败。除上述已证明不适用的 optional child 外，任何组件缺少安装路径、`package.json` 或名称/版本一致性时也会立即失败；不得从 README、仓库网页或相似组件推断许可证。

GitHub CI 使用固定 SHA 的 `actions/upload-artifact` 将 `output/supply-chain/**` 作为 `production-supply-chain` 非敏感工件保存 14 天，并在目录没有可上传文件时失败。工件不包含密钥、病历、请求/响应正文或音频；客户可据此填写批准策略。上传步骤使用 `always()`，因此当策略尚未获批但 SBOM 已完整生成时，客户仍可取得本次审阅依据；SBOM 生成不完整时没有工件且上传同样失败。

## 客户审批

1. 将 `docs/templates/customer-license-policy.template.json` 复制为 `docs/customer-approved-license-policy.json`。
2. 由客户安全负责人填写实际 `lockfileSha256`、姓名/责任身份、批准时间和完整的 `allowedLicenseExpressions` 精确列表。
3. 策略中的哈希必须与本次 SBOM 完全一致。依赖或锁文件变化后，旧策略自动失效，必须重新生成并重新批准。
4. 不填写任何逐组件例外、waiver 或“暂时放行”字段；验证器会拒绝未知字段。

模板不是批准文件，`pending_customer_approval` 也不会通过门禁。批准文件不得包含密钥、病历、Cookie、连接串或供应商原文。

## 执行门禁

```bash
pnpm verify:supply-chain:production
```

该命令会先重新生成 SBOM 与许可证清单，再要求上述客户批准策略存在、状态为 `approved`、结构有效、锁文件哈希匹配且允许所有当前声明的许可证表达式。它还要求生成环境为 Linux，并保留 `glibc` 目标与构件属性；任一失败均阻断 CI 和 Production；不会降级为审计提示或默认允许。

## SAST 状态

仓库已加入固定 Semgrep Community Edition API 基线门禁：只使用仓内本地规则、固定的容器摘要、禁网扫描、`--error` 和脱敏 JSON 报告。它不使用正则、ESLint、依赖审计或远程规则库冒充 SAST。

该基线只覆盖认证、AI、音频、训练结果及其 API 请求路径，不能被表述为“完整 SAST 已完成”。Production SAST 仍为 `BLOCKED`，直至客户安全负责人批准工具版本、规则覆盖范围、规则审查责任、报告留存、发现处置 SLA 和完整应用范围；不得通过 waiver、静默忽略或未固定工具解除阻断。
