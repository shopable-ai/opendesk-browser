# OpenDesk 本地开发：先看这一页

> 2026-10-10 当前中文主入口：[R10.1 使用说明与 API](../api/README.md)，日常操作见[快速入门](../api/quickstart.zh-CN.md)。这里保留简明导航，精确参数统一维护在 docs/api。

OpenDesk 是 Chrome 扩展；Native Host 连接本机目录和扩展；Codex 通过同一个 stdio MCP 编辑文件、调用七个工具；Sidebar 也可以从该 MCP 的源码 provider 选择项目。Controller 用 page/Locator 自动化网页，Page USER_SCRIPT 用 document 添加网页 UI。示例项目不是新的插件，Python 只提供演示 HTML，真实网站不用它。

> **修改扩展自身源码**：使用 `npm run dev` 持续编译并在 Chrome 加载固定的 `dist/development`；首次安装与自动刷新说明见[扩展源码开发 R13.1](extension-development-r131.zh-CN.md)。下面的 Native/MCP 本地项目开发仍是独立用途。

## 当前已能使用什么

- 单文件和静态相对 ESM 多文件，Controller 真实运行、Page 预览、Sidebar 本地项目开关与明确再次运行。
- 项目内已安装且精确锁定的 npm、已有锁和缓存的 HTTPS ESM，经现有 Resolver 内存构建；dev.run 不联网下载/生成新锁。
- 受管 Page UI 的显式替换和 Stop 清理；Controller 的持久结果、冻结旧版本、Stop/deadline。
- R10.1 已有实际开发 Mac Codex 及定向 Sidebar/Native 生命周期证据；当前开发包的 Codex 链路按相关后端输入一致复用，未每包重跑。2026-10-10 核对 PR #50 已合入 main，见[原记录](workstreams/r101-development-01a12159.md)。原 R2.2 报告中的“本机未验收”是历史候选状态。

这些分项结果不代表任意机器、所有竞态、同包完整验收或正式 F3/ZIP 已完成。生产安装、ZIP、发布按当前要求暂缓。没有自动 watcher 或通用 HMR，保存不等于执行。

## 日常四步

1. 本机编辑明确授权的 JS/项目文件，格式见[本地项目](../api/local-projects.zh-CN.md)。
2. MCP status 核对绑定、Native、Host 和目标；目录自动绑定，单文件须显式指定类型与 origin。
3. 新的有意 requestId 调 run，或 Sidebar「开发」开启「本地项目」开关，点击「刷新」、选项目后明确运行。
4. Controller 用 runId 查持久 resultId/结果自身 revision/sourceHash 与 released；Page 用 previewId 查非持久预览。再编辑后明确运行，旧 Controller 结果保持原版本。

丢 ACK、断连或撤权先[只读恢复](../api/dependencies-and-errors.zh-CN.md#断连和未知结果)，不换 ID 盲目重放 run/Stop/清理。

## 第一次配置与演示

已有正确开发环境就直接使用，不反复安装。[首次配置](../api/quickstart.zh-CN.md#首次配置)包含 Node >=22.12.0、真实扩展 ID、Native setup/update/doctor、stdio MCP 与独立的网站/用户脚本权限；浏览器/profile 参数详见[原配置指南](local-development-r22.zh-CN.md#首次配置)。

只有演示 demo-form 时才启动 Python。先检查 43111 端口归属，空闲时在仓库根执行：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html`。端口被他人占用时使用自己的端口，并同步对齐 Controller origin/单文件授权，不夺取他人资源。

下一步：[跑通一次并修改源码](../api/quickstart.zh-CN.md)、[七个工具](../api/mcp-local-development.zh-CN.md)、[Controller](../api/controller.zh-CN.md)、[Page UI](../api/page-userscript.zh-CN.md)、[Sidebar](../api/sidebar-local-projects.zh-CN.md)、[npm/HTTPS 与故障排查](../api/dependencies-and-errors.zh-CN.md)。
