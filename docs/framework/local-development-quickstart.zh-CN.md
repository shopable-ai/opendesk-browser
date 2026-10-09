# OpenDesk 本地开发：先看这一页

> 当前状态（2026-10-09）：R2.2 的主要功能已经通过 PR #37、#42 合入 `main`，PR #44 保存了真实 Chrome 证据；**用户自己的 Mac / Codex 连接还没有现场验收**。完整记录见 [R2.2 实施与限制报告](local-development-r22-report.zh-CN.md)。

## 1. 只有一套 OpenDesk，不是多套浏览器程序

```text
Codex（编辑本地 JS 文件）
  ↓ 通过同一个 stdio MCP 调用 opendesk.dev.*
Node.js Native Host（本地授权目录读取、版本校验、认证连接）
  ↓ 既有 Native Messaging / 已注册 Host
OpenDesk Chrome 扩展
  ├─ Controller：页面定位、读取和浏览器自动化（原 RunHost / Authority）
  └─ USER_SCRIPT：给目标网页加入按钮、样式、图片等 Page UI

同一 Sidebar「开发」页也复用上述本地源码 provider，不增加新运行器。
```

| 名称 | 作用 | 是正常使用的必需部分吗？ |
| --- | --- | --- |
| OpenDesk Chrome 扩展 | 页面执行、权限控制、Sidebar、结果展示 | 是 |
| Node.js Native Host | 把 Codex 的本地目录访问安全接入扩展 | **只有使用本地 MCP / 目录直连时需要** |
| Codex + MCP | 让 AI 编辑文件并调用 `opendesk.dev.status/run/result` 等工具 | **只有选择 AI 直连工作流时需要** |
| `examples/programs/local-controller` | 多文件自动化程序的**测试示例** | 否 |
| `examples/programs/local-page-ui` | 网页按钮、CSS、PNG 的**测试示例** | 否 |
| Python `http.server` | 临时提供 `demo-form.html` 测试网页，**不执行项目 JS** | **否；只在手工测试该示例页时用** |

两个 `local-*` 目录不是两个 Chrome 插件或 Native 安装，而是验证 Controller 和 Page UI 两种运行入口的 JavaScript 项目。七个 `opendesk.dev.*` 是同一个 MCP 服务的工具，不是七个进程。

**真实网站使用无需 Python。** 手工验收时使用 `python3 -m http.server ...` 仅是因为两个示例的权限范围绑定 `http://127.0.0.1:43111`，需要一个临时 HTTP 网页。仓库自动化真实 Chrome 验收驱动本身已用 Node.js 内建 HTTP 服务，不需要把 Python 打包到扩展、设置为生产依赖或另建项目源码服务。已有 `AGENTS.md` 规定这一唯一的手工演示页面，不应为消除 Python 字样而新增一套产品服务器。

## 2. 哪些已经完成？

- **已实现：**多文件静态相对 ESM，Codex/MCP 和 Sidebar 直接读取最新目录，Controller 真实运行、Page USER_SCRIPT 预览，显式刷新受管 Page UI、Stop 与安全清理；修改文件后下一次有意运行不需要 `build:program`、打包 ZIP、导出 JSON 或上传。
- **已有真实云端 macOS Chrome 证据：**P0–P3 22 项定向断言通过；只证明原候选及列明的场景，**不能代替用户 Mac 的 Codex 验收**。
- **尚未实现：**Local Dev Resolver 直接使用 npm / HTTPS 模块；这是 [R10.1 独立任务](prompts/goal-r10-1-local-codex-https-esm-acceptance.md)，正式 `build:program` 的已锁定依赖构建是另一条发布路径。
- **仍需本机验证：**实际 Codex 注册、Native 安装/授权、Chrome 完整重启、重要断线/权限竞态及停用开发链后的已安装 Task。

## 3. 第一次在自己的 Mac 上安装（仅必要时做）

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
git status --short
git pull --ff-only
node --version             # 要求 >=22.12.0
npm ci --ignore-scripts
```

首次从源码安装本轮扩展：按文档执行一次 `npm run build`，在 Chrome 开发者模式加载 `dist/production`；已有对应版本则跳过。查看 Chrome 的**实际扩展 ID**，首次配置 Native 时运行：

```sh
node native-agent/cli.mjs setup --extension-id "实际扩展ID"
node native-agent/cli.mjs doctor
```

旧 Native Host 是**复制安装的快照**：只有确实检测到旧版时，先停用 Native、确认运行已收尾，再执行 `node native-agent/cli.mjs update --extension-id "实际扩展ID"`。Chrome for Testing / 自定义 profile 需按 [完整指南](local-development-r22.zh-CN.md#首次配置) 添加精确 `--browser`、`--user-data-dir`；绝不猜 ID、删除正在用的 socket 或修改用户日常 Chrome profile。

配置 Codex 一次（若已经存在正确条目，不重复创建）：

```sh
codex mcp add opendesk-dev -- node "/Users/shopme/Documents/workspace/opendesk-browser/native-agent/local-dev/mcp.mjs" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-controller" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-page-ui"
```

在真实 Chrome 里通过已有设置入口批准 Native 和目标网站权限；Page UI 再开启扩展详情的「允许用户脚本」。MCP 进程应保持运行，同一 Native 连接不启动第二个 provider。权限授权不由测试脚本绕过。

## 4. 日常使用只要四步

1. 在 Codex 中修改已经授权的 `.js`、`.css`、图片等项目文件；程序仍遵守 `opendesk.project.v1` 及精确网站范围。
2. 使用 `opendesk.dev.status` 核对绑定、Native、目标网页与注册 Host。
3. 有意调用 `opendesk.dev.run`，本次读取最新源码；Controller 返回 `runId`，Page 返回 `previewId`。
4. 用 `opendesk.dev.result` 查询**同一执行身份**的真实结果与 `sourceHash`；修复源码后使用**新的有意运行请求**再执行。

不需要每次 `npm run build`、`npm run build:program`，也不上传 JSON。`npm run build` 只在扩展自身版本更新时使用；`build:program` 留给正式不可变产物/发布。当前没有自动文件 watcher 或 React/Vue HMR：**文件保存不等于自动执行**。

## 5. 什么时候才会用 Python？

**仅当你要手工打开仓库标准测试页**时，在仓库根目录运行：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

Chrome 打开 `http://127.0.0.1:43111/demo-form.html`。这是一个临时静态 HTTP 测试网页服务，和项目源码加载、Native、MCP、Chrome 扩展构建无关；停止服务不影响已经安装的扩展。访问真实已授权网站时不用此命令；但两个样例的默认允许 origin 不适用于其他网站，修改网站范围前应明确核对权限。

## 6. 接下来执行哪个任务？

**先用自己的 Mac 上的 Codex 做 [R12 本机真实验收](prompts/goal-r12-local-mac-codex-acceptance.md)**，只修实际失败，不重新制造 P0–P3 功能。R12 通过后再决定是否开展 R10.1 npm / HTTPS ESM 本地直连。正式安全合同、七个 MCP 工具和失败处理详见 [完整开发指南](local-development-r22.zh-CN.md)。
