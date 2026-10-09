# OpenDesk Browser R10.1 使用说明与 API

OpenDesk 可以运行你保存在本机的 JavaScript：读取网页、执行自动化，或者给网页添加按钮和样式。修改源码后明确再运行，便会读取新版本；已经完成的 Controller 结果保留原版本。第一次使用从[快速入门](quickstart.zh-CN.md)开始。

## 各组件做什么

| 组件 | 职责 | 什么时候需要 |
| --- | --- | --- |
| OpenDesk Chrome 扩展 | 网站授权、目标网页、执行、Sidebar 和结果 | 所有浏览器运行 |
| Native Host | 连接本机 MCP 与扩展，核验连接身份 | 读取本地 JS/项目目录时 |
| Codex / MCP | Codex 编辑文件；MCP 提供七个 `opendesk.dev.*` 工具 | AI 操作入口；Sidebar 本地项目也需要同一 MCP 进程提供源码 |
| Sidebar「开发」 | 手工草稿或已授权本地项目，明确运行、停止、看结果 | 希望在浏览器里操作时 |
| Controller | 通过 `page` / Locator 自动化网页，运行在受控 Worker | 读标题、定位、填写、点击等 |
| Page USER_SCRIPT | 在网页 USER_SCRIPT 世界使用 `document` 和受管 UI | 添加按钮、CSS、图片或读 DOM |
| 源码目录 | package、JS 模块及声明资产 | 多文件、npm、HTTPS ESM 项目；它不是另一个扩展 |

```text
本地 JS / 项目目录
  → 同一个 MCP 的授权源码 provider → Native Host → OpenDesk 扩展
    → Controller：runId → 持久 resultId
    → Page USER_SCRIPT：previewId → 预览回执
Codex 调 MCP；Sidebar 本地项目读取同一 provider 后使用原执行入口。
```

手工草稿不依赖本地目录 provider。Python 只在演示时提供测试 HTML；真实网站不需要它。

## 文档导航

| 我想做什么 | 教程 / 参考 | 示例 |
| --- | --- | --- |
| 尽快跑通一次并读结果 | [快速入门](quickstart.zh-CN.md) | [单文件标题](../../examples/programs/local-controller/title.js) |
| 创建或修改 JS / 多文件项目 | [项目格式与授权](local-projects.zh-CN.md) | [相对 ESM Controller](../../examples/programs/local-controller/README.md) |
| 让 Codex 调用工具 | [七个 MCP 工具](mcp-local-development.zh-CN.md) | attach → status → run → result |
| 用 Page / Locator 自动化网页 | [Controller](controller.zh-CN.md) | [完整现代 Page API](../framework/modern-page-api.zh-CN.md) |
| 在网页显示自己的 UI | [Page USER_SCRIPT](page-userscript.zh-CN.md) | [按钮 / CSS / PNG](../../examples/programs/local-page-ui/README.md) |
| 在浏览器选择项目、保存草稿 | [Sidebar 操作](sidebar-local-projects.zh-CN.md) | 模式开关、项目、参数、Run / Stop |
| 使用 npm / HTTPS 或恢复失败 | [依赖与故障排查](dependencies-and-errors.zh-CN.md) | [npm](../../examples/programs/page-npm-lodash/README.md)、[HTTPS](../../examples/programs/remote-esm-page/README.md) |

## 先选择你要做什么

| 需求 | 使用方式 | 执行身份与结果 |
| --- | --- | --- |
| 读取标题、定位元素、执行网页自动化 | Controller 程序，复用现有 Page/Locator/RunHost | `runId`；持久 Controller 结果有独立 `resultId`、源码版本和释放状态 |
| 在目标网页显示自己的按钮、文字、CSS 或图片 | Page USER_SCRIPT 程序；需要对应网站权限和允许用户脚本 | `previewId`、`sourceHash`、`documentId`；预览回执不等于持久 Controller Result |
| 自己选择本地项目并点击运行 | Sidebar「开发」中的本地项目模式 | 仍使用上述 Controller 或 Page 路径 |
| 让 Codex 编辑文件、调用执行工具、读取结果 | 已配置的本地 stdio MCP：`opendesk.dev.*` | 与 Sidebar 复用原 Native 连接和运行体系 |

Controller 和 Page 是不同执行方式；Sidebar 与 Codex/MCP 是使用入口。多文件项目是 JavaScript 源码目录，不是另一个 Chrome 插件。Native Host 在获授权的本地文件访问与 Chrome 扩展之间提供连接。

## 日常开发闭环

前提是已有对应扩展和 Native 能力，已明确授权项目目录与目标网站，并在 Chrome 打开目标网页。同目录示例见[本地 Controller](../../examples/programs/local-controller/README.md)和[本地 Page UI](../../examples/programs/local-page-ui/README.md)。

1. 在本地编辑已授权的 JS、CSS 或资产。单文件可以直接绑定；目录沿用 `package.json.opendesk` 项目合同。
2. 让 Codex 调用 `opendesk.dev.status`，核对 Native 连接、项目 `bindingId` 和真实目标网页。目录绑定继承 package 中的运行类型与网站范围；单文件绑定按接口明确指定类型和网站。
3. 有意运行：让 Codex 调用 `opendesk.dev.run`，或在 Sidebar 的本地项目模式选择项目并点击运行。每次有意执行使用新的 `requestId`，读取当前源码。
4. Controller 用 `runId` 查询 `opendesk.dev.result`；Page 用 `previewId` 查询。核对源码哈希、目标文档与真实状态。修改源码后再次明确运行，原 Controller 持久结果保持原版本。

MCP 工具由 Codex 调用；上述工具名称不是网页控制台里的全局 JavaScript 对象。保存文件不会自动执行，也不承诺文件 watcher 或通用 HMR。普通本地开发不需要反复构建扩展、上传源码 JSON 或重新安装程序。

需要停止时，Controller 使用原运行身份执行 Stop 并查询收尾；Page 的 Stop 仅清理该预览登记的受管 UI/资源，不能撤销任意业务效果。再次预览受管 Page 会先处理旧实例的清理。

## 依赖和异常

多文件可以使用静态相对 ESM；已锁定并满足实际 resolver 合同的 npm、HTTPS ESM 支持本地开发读取和构建。HTTPS 首次锁定需要明确授权，后续校验固定缓存字节并离线复用；npm 依赖属于用户项目的 package/lock 与安装目录。扩展构建、项目开发构建、正式不可变产物是三个不同阶段。具体流程见[统一 JavaScript 操作指南](../product/program-development-dual-format-and-sidebar.zh-CN.md)。

若执行回执丢失，保留原 `requestId`，在同一 MCP 会话以 `admissionRequestId` 只读查询原执行。`OUTCOME_UNKNOWN`、断连或 `NOT_FOUND` 不代表没有执行，不能因此盲目重放有副作用的程序。原请求不能跨会话自动接管；导航、权限或 Host 身份变化仍以真实状态为准。

## 当前验证边界

R10.1 本轮已补 Native 信号终止后的 socket 清理，取得真实 Mac/CFT 的 Sidebar、撤权/恢复、端口恢复、导航和迟到 ACK 拒绝证据。实际开发 Codex 源码 101→102 与旧结果冻结已有原始证据；新开发包按相关输入一致复用，未重复执行整条 Codex 链路。原生菜单目前使用真实 AX 辅助验证，自动菜单驱动稳定性尚未证明。

2026-10-10 核对：实施 [PR #50](https://github.com/shopable-ai/opendesk-browser/pull/50) 已合入 main。文档起点为实施基线 `3d1697ff`，本轮在文档分支同步 main `f14b97f0`，保留已合入的源码错误定位说明；原实施记录中的 draft 状态是当时快照。生产安装、ZIP 和发布按用户要求暂缓，正式 F3 未关闭。历史失败整轮保持 FAIL，分项 PASS 不等于同包完整验收。文档检查不会提升已有证据等级。
