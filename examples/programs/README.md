# OpenDesk Browser 多文件 Demo 总览

## 默认本地开发

[local-controller](local-controller/README.md) 提供“改 src/extract.js → MCP 运行新源码 → 原 Controller 持久结果”的只读示例。按 [R2.2 使用说明](../../docs/framework/local-development-r22.zh-CN.md) 完成一次连接，之后不用 build:program、JSON 上传或覆盖草稿。现有多文件示例沿用同一个项目格式；下文构建流程保留为显式冻结交付。Page 本地预览与 Sidebar 目录控件的当前状态见 [工作记录](../../docs/framework/workstreams/local-dev-r22-c036.json)。


| 示例 | 技术目标 | 当前证据边界 |
| --- | --- | --- |
| [page-heading](page-heading/) | 旧有 Page ESM 标题读取 | 本地构建 |
| [controller-title](controller-title/) | 旧有 Controller ESM 标题读取 | 本地构建与 Candidate |
| [local-controller](local-controller/README.md) | Codex/MCP 修改本地多文件，直接使用最新已保存源码 | Native/MCP/Chrome 测试按 [本地开发工作记录](../../docs/framework/workstreams/local-dev-r22-c036.json) 核对；用户 Mac 另验收 |
| [page-npm-lodash](page-npm-lodash/README.md) | 项目级 npm 锁定 `lodash-es@4.17.21` → 单一 Page JS | npm 构建与 Node 回归；真实 Mac Chrome 另验收 |
| [remote-esm-page](remote-esm-page/README.md) | HTTPS 静态 `import` → 明确锁定 → 离线重复构建 | R10 公开 CDN / 离线 CI 通过；浏览器内真实运行另验收 |
| [sidebar-page-demo](sidebar-page-demo/) | 3 个源模块 → Page USER_SCRIPT → 测试页可见标记 | 可构建；真实 Chrome 待验收 |
| [sidebar-controller-demo](sidebar-controller-demo/) | 3 个源模块 → Controller Locator → 真实表单/结果 | 可构建；真实 Chrome 待验收 |
| [sidebar-assets-contract](sidebar-assets-contract/) | Page CSS/JSON/PNG 的有界打包与安全拒绝 | 本地构建与负向回归；真实 Chrome 待验收 |

需要先选哪一种开发流程？阅读 [统一 JavaScript 使用指南](../../docs/product/program-development-dual-format-and-sidebar.zh-CN.md)：

- 普通 Page/Controller 直接在 Sidebar 编写与试运行，不需要 `package.json`；
- 本地相对 ESM 项目通过授权目录和 MCP/Sidebar 连接运行，修改文件后无需导入 JSON；
- npm 或 HTTPS ESM 项目必须已有明确的项目依赖、真实 `npm ci` 安装以及对应锁（HTTPS 还需远端锁+哈希缓存）；**现行 LocalDevResolver v2 可以在授权多文件项目上内存构建并通过 MCP/Sidebar 显式运行，不必每次上传 JSON**。只有正式冻结交付时才走 `build:program` 输出 `program.js` / `program.opendesk-draft.json`；单文件手工草稿和未锁定的导入仍不接受。

原有多文件 UI 演示仍以 `examples/tasks/demo-form.html` 为统一受控测试页；**remote-esm-page 的匹配范围目前为 `https://example.com/*`，并非此 localhost 测试页**。如需测试 localhost，须先在受信项目 `pageRules` 按授权目标调整并重新构建，不自动放宽匹配权限。

参考 [Program API 文档](../../docs/framework/sidebar-project-api-r1.zh-CN.md)、[文件夹与资源架构](../../docs/architecture/browser-framework/sidebar-project-intake-r1.zh-CN.md) 与 [Codex 本地验收目标](../../docs/framework/prompts/goal-sidebar-multifile-native-acceptance-r1.md)。

Demo 选择、目录和运行原理见 [Sidebar Demo 指南 R2](../../docs/framework/sidebar-demo-guide-r2.zh-CN.md)，新对话执行 [自动导入与可见运行提示词 R2](../../docs/framework/prompts/goal-sidebar-multifile-auto-import-demo-r2.md)。主展示使用 `page-ui-basic`；先用 `sidebar-page-demo` / `sidebar-controller-demo` 证明导入执行链路。`sidebar-assets-contract` 只返回资源记录，不渲染 CSS/PNG。

继续真实验收前先读[续测与复用入口](../../docs/framework/workstreams/sidebar-multifile-native-r1-20261009.md#resume)：已合入修复的构建/组件证据按相关输入复用；优先补 JSON 文件导入、只读 JS 源码展示、Page/Controller 实际执行及资源效果，逐项保存真实回执。锁屏、观察器和 Native CLI/CI 失败分别处理，不因换聊天或文档变更重跑已通过的集合。

```sh
npm ci --ignore-scripts
node --test tests/environment/sidebar-project-demo.test.mjs
npm run build:program -- examples/programs/sidebar-page-demo
npm run build:program -- examples/programs/sidebar-controller-demo
```

上面两种 JS 构建还输出 `program.opendesk-draft.json`：在现有完整任务目录导入，可保留多文件只读源码快照与固定执行字节。开发模式可使用 `--mode development` 生成可读 JS 与本地 Source Map。构建结果为 `BUILT_UNVERIFIED`，不是 `Installed`；当前 main 已支持 Page CSS/JSON/PNG 有界打包；Controller 资源仍以 `E_PROJECT_ASSET_ENV` 拒绝。原 R1 提示词中的 `E_PROJECT_ASSET_BUILD` 门槛对应旧基线，差异与原始结果保存在[本轮验收记录](../../docs/framework/workstreams/sidebar-multifile-native-r1-20261009.md)。资源构建成功不等于安装或真实网页验收通过。

- [page-ui-basic](page-ui-basic/README.md)：R1 原生 Shadow DOM 页面工具；独立 CSS、JSON 与 PNG 固定内嵌，按需 UI 样式与关闭/重新打开（仅手动 USER_SCRIPT 试运行，Chrome 待验收）。
