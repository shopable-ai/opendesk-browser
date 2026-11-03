# CodeGraph 本地代码图谱

本仓库使用 [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph/tree/v1.6.2)，准确 npm 包名为 `@colbymchenry/codegraph`，固定版本 `1.6.2`、MIT 许可。它是开发工具，不导入 Chrome 扩展运行代码；无需 API Key 或外部图数据库。

## 安装与初始化

在仓库根目录操作。新 checkout 先按锁文件安装开发依赖；已有开发环境不必为查询重装依赖或重启 watcher。

```sh
# 仅新 checkout 首次安装；保留 optional 平台依赖，不使用 --omit=dev/optional。
npm ci --ignore-scripts
npm run codegraph -- version
npm run codegraph:init
npm run codegraph:status
```

`init` 同时创建 `.codegraph/` 并完成首次索引，无需紧接着再运行 `index`。发布包自带当前平台的 Node 与 Tree-sitter，平台包展开约 293 MB；首次安装需要下载。项目命令关闭匿名遥测，禁用缺少平台包时的隐式下载；平台包缺失时重新执行正常依赖安装。

## 日常查询

```sh
# 按符号或自然语言探索，返回相关源码和调用路径。
npm run codegraph:explore -- "SharedConversationDock"
npm run codegraph -- query createSharedAIProviderRuntime --limit 5 --json

# 查询谁调用它、它调用谁，以及变更影响范围。
npm run codegraph -- callers SharedConversationDock --limit 10 --json
npm run codegraph -- callees SharedConversationDock --limit 10 --json
npm run codegraph -- impact SharedConversationDock --depth 2 --json

# 文件与受影响测试是分析线索，不会自动运行测试。
npm run codegraph -- files --filter "src/ui/react/**" --json
npm run codegraph -- affected src/ui/ai/provider-runtime.js --json

# 未连接 MCP 时，查询前按需增量更新。
npm run codegraph:sync
```

同名符号可能有多个结果，结合返回的文件路径及源码确认 owner。索引与静态调用图不能证明浏览器执行、权限、撤权或业务操作成功；测试选择仍遵守根 `AGENTS.md` 的当前阶段与相关性规则。没有命中时回到 `rg` 和真实源码，不为制造命中修改业务。

## Codex MCP

唯一项目配置为 [`.codex/config.toml`](../../.codex/config.toml)。它通过 `npm run --silent codegraph:mcp` 使用本仓库锁定的 CLI，不使用全局安装或运行时 `npx @latest`。当前 `cwd` 固定为此 Mac 的真实仓库路径；移动 checkout 后需更新该项。

配置只在 trusted 项目生效。新 Codex 会话或客户端重新加载 MCP 后读取它；已有活动会话不保证热加载配置。可只读核对：

```sh
codex mcp get codegraph --json
```

MCP 暴露 `codegraph_explore` 与 `codegraph_status`，其余细分操作继续使用 CLI。连接期间由上游共享 daemon 监视并增量更新同一索引，多会话共享它；不添加系统启动服务或 Git hook，不覆盖 Browser 的 `dist/development`。不要为重建图谱停止其他会话的服务。

项目配置关闭遥测与隐式下载；源码图谱和缓存留在本机。Codex 查询返回的源码会进入当前助手上下文，仍受当前模型与数据使用边界约束。

## 索引范围与维护

根 [`codegraph.json`](../../codegraph.json) 在上游默认过滤和 `.gitignore` 之上，排除历史验收证据、外部源码快照、历史 workstream/prototype、预置第三方库及压缩文件，避免生成物淹没当前源码。保留 `src/`、`projects/`、`examples/`、`scripts/`、`tests/`、服务、Native 源码；scrapyjs 的真实业务依赖源码仍可查询。

`.codegraph/` 和 `.codegraph-*/` 只保存本机可重建数据，由 `.gitignore` 排除。修改排除规则后按需全量重建：

```sh
npm run codegraph -- index --force
```

不把索引加进构建、`pretest` 或 CI 的默认前置，也不把图谱的 affected 结果当作完整测试或运行证据。

已知上游限制：`1.6.2` 自带 Node `24.16.0`，[上游 #3219](https://github.com/colbymchenry/codegraph/issues/3219) 记录了内嵌运行时安全补丁滞后；更新系统 Node 不会更新这个内嵌副本。后续按上游正式发行升级依赖并更新锁文件，本次不宣称安全审计通过。

参考：[固定发行版使用说明](https://github.com/colbymchenry/codegraph/blob/v1.6.2/README.md)、[Codex MCP 配置](https://developers.openai.com/codex/mcp)。
