# ChatGPT 网页修改本机代码

状态：2026-11-11，当前 Mac/ChatGPT 账号的单文件代码修改闭环已实测。复用已有 OpenDesk 文件 MCP 和官方 Secure MCP Tunnel，不新增 Tunnel、key、文件执行器或 Shell 通道。

## 选择与入口

当前建议使用 **OpenDesk 文件 MCP + 官方 Tunnel**。本机 `shopme` 来自 `shopable-station/packages/shopme-cli`，其 MCP 面向文档检索与保存，README 明确限制通用 Shell/任意代码文件访问，不用于这次代码编辑。

- ChatGPT 应用：[OpenDesk Code Mac96](https://chatgpt.com/plugins/plugin_asdk_app_6af43ab28b9c819183779be407f97d00)。已连接原来的 Tunnel。
- 真实网页测试：[修复代码文件](https://chatgpt.com/c/6af43b2a-a560-83ee-968c-b0879d257356)。
- key：仓库根目录 `.local/credentials/openai/opendesk.key`；非秘密元数据：同目录 `opendesk.json`。路径与权限规则见[凭证文档](local-credentials.zh-CN.md)。
- 后端 owner：独立仓库 `/Users/shopme/Documents/workspace/opendesk`，原 Native Files Bridge 和 `tests/mcp/tools/secure-tunnel/` 启动器；不修改 Browser Framework 来实现业务文件编辑。

原 `OpenDesk Desktop Mac96` 应用缓存的是桌面工具目录，单纯将本地后端切到 files 并不会让它出现文件工具。本次在同一 Tunnel 上创建独立 Code 应用后，网页正确发现四个文件工具；原 Desktop 应用保留。同一 Tunnel 不并行启动 desktop/files 两个后端。

本机另有 CodexPro 工具登记，但其原有远程端点本轮连接失败，不能当作已可用的代码开发入口；本轮没有修复或替换它。

## 当前能力

| 工具 | 已实现用途 |
| --- | --- |
| `tm_files_list` | 枚举获准路径及其祖先 |
| `tm_files_read` | 读取批准的 UTF-8 文件及真实 SHA256 |
| `tm_files_write` | 用 `expectedSha256` 和稳定 UUID `requestId` 修改已有文件，提供写入及读回事实 |
| `tm_files_status` | 查询写入回执；每次查询仍检查当前授权 |

每次授权最多 32 个精确文件、期限最多 1800 秒，正文上限 32 KiB。当前没有文件创建、删除、重命名、代码搜索、patch/diff、Git 或运行测试工具。这已支持网页修改指定代码文件；完整 WebCodex 式项目开发还需要在原文件/权限合同内补齐相应能力。本次测试命令由本地 Codex 执行，网页没有执行 Shell。

Tunnel 提供连接通道；本地工作区、文件列表、内容输出同意和活跃 lease 才决定可访问内容。key 不等于文件授权，不应发送到聊天。官方依据：[Secure MCP Tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)、[Custom MCP Server](https://developers.openai.com/api/docs/guides/custom-mcp-server)。

## 后续复用顺序

当前仍使用原 CLI 与启动器准备一次有限会话，没有新增“一键启动整个仓库”的产品入口。

1. 通过现有 Native CLI 查询当前连接，核对 `ready` / `runtimeCurrent` 并绑定实际 connection ID。连接 ID 可能随重连变化；旧 ID 的 `E_CONNECTION_GONE` 不能靠重写配对配置解决。
2. 由可信本机操作员使用 `browser --connection <id> workspace add --path <明确目录> --access read-write` 获取 workspace ID。再准备私有 approval JSON，列出本次允许读写的精确相对文件，确认正文会传送给该 ChatGPT Tunnel。
3. 用 `browser --connection <id> files-mcp grant --approval-file <approval.json> --credential-file <capability.json>` 持有前台 lease。approval 的字段为 `purpose: "opendesk.files-mcp.v1"`、`workspaceId`、`ttlSeconds`、`bodyEgressConsent: true`、`files: [{path, access}]`。capability 使用私有 0700 目录、0600 文件，不是持久 Tunnel key。
4. 使用原 `prepare-run.py --mode files` 准备新 run，显式提供当前 index、候选二进制及 provenance、`--core-run` 和 `--files-bridge-credential-file`；使用原 `start-online.py --run-dir <新 run> --key-file <短路径 key>` 前台启动。二者须使用支持 `hashlib.file_digest` 的 Python 3.11+；本轮为 Homebrew Python 3.14，系统 `/usr/bin/python3` 版本过旧。不得复用已消费的历史 run 或绕过 provenance。
5. 在 ChatGPT 选择 **OpenDesk Code Mac96**，提供 workspace ID、相对文件名和具体修改目标。先 read 获得 SHA，再以该 SHA 和单一 UUID write，最后 read 验证。冲突或结果未知时查询回执，不换 UUID 盲目重发。
6. 本地检查实际 diff，执行与改动对应的检查。结束后 `files-mcp revoke --grant-id <id>`，停止所属前台客户端，`workspace revoke --workspace-id <id>`；保留应用和持久 key，下一次重新授予文件范围。

Native 安全合同位于独立仓库 `docs/integrations/mcp/files-bridge-native-contract.zh-CN.md`；启动与 provenance 规则位于 `docs/integrations/mcp/secure-mcp-tunnel.md`。以上路径均相对 `/Users/shopme/Documents/workspace/opendesk`，不是新增实现。

## 本轮证据与收尾

测试文件位于当前 Browser 仓库 `artifacts/chatgpt-code-edit-20261111/`，属于忽略的临时样例，不是产品业务源码。

- `total.mjs` 初始把求和写成 `sum - value`。本地 Node 测试先失败（`-5 !== 5`）。
- 网页实际读取未知随机注释与 SHA，仅写入一次，将 `-` 改为 `+`，再读回。独立磁盘对比确认只有该运算符变化、注释与格式保留。
- `node --test artifacts/chatgpt-code-edit-20261111/total.test.mjs` 通过（正数、负数、空数组三项断言）；`node --check` 通过。
- 通过同一文件连接器读取未批准的 `total.test.mjs` 被 `E_FILES_ACCESS / NOT_DISPATCHED` 拒绝；撤销 grant 后读取原获准 `total.mjs` 同样被拒绝。这两项为连接器安全检查，网页修改证据是上述独立对话。
- grant 与临时 workspace 已撤销；lease 已退出；本任务 Tunnel launcher/client 已停止，临时健康端口已释放。Code 应用保持安装，成功网页保留供查看。下一次使用需重新启动并授予文件范围。

本地证据：样例目录的 `acceptance.json`、`web-result.txt`、`web-result.png`；私有运行记录位于独立 OpenDesk 仓库 `.runtime/tests/mcp-files-core/20261111-code-edit/`。历史候选二进制的 provenance 已核对，本轮没有重建或证明它与当前所有未提交源码相同。

本轮只修改了本指南、README 与凭证布局文档，迁移了被忽略的本机凭证引用，并通过网页修改了上述临时样例。没有提交或推送，没有变更其他 Agent 的产品源码、watcher、日常扩展安装路径或 Native 配对。完整项目开发、多文件冲突、production 及跨平台验收未执行。
