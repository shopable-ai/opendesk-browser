# OpenDesk Browser 多文件 Demo 总览

## 优先选择零参数预装库 Demo（2026-10-12）

- [Controller 全局变量零参数 Demo](controller-globals-zero-arg/README.md)：`export default async function main()`，直接读取 `page.title()/page.url()`、`_.words()`、`dayjs()`，无需给用户 main 传递对象。
- [Page USER_SCRIPT 全局变量零参数 Demo](page-globals-zero-arg/README.md)：无参数 ESM `main()`、`document`、`_`、`dayjs`；不允许误用 Controller `page`。两者的 Node 回归统一见 `tests/environment/runtime-globals-zero-arg.test.mjs`，真实 Mac Chrome 验收另行绑定。

单文件 Controller 的完整默认库实例见 [`controller-globals-zero-arg.js`](single-file/controller-globals-zero-arg.js)，可直接粘贴到 Side Panel「开发」→「运行草稿」；单文件 Page 开发入口见 [`async function main()` 零参数脚本](single-file/page-globals-zero-arg.js)；Background、可信宿主和普通工具的对照见 [固定静态导入与工具桥 Demo](../libs/trusted-imports/README.zh-CN.md)。单文件脚本不能使用 `export default`。

这两项专门纠正旧多文件样例的 `main({page})` 误导，并保留旧入口 ABI，**不改写已有 R2.2 Golden 源码与历史回执**。完整各执行环境区别见 [零参数预装运行合同](../../docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。

## ESM R2.2 当前验收与开发入口

命令均从 opendesk-browser 仓库根目录执行。已有 Native/扩展配对时，用 `opendesk browser dev "$PWD/examples/programs/项目目录"` 接入现有 Sidebar；修改模块后再次明确运行，不需要导出/上传编译结果。MCP 仍使用现有七个 `opendesk.dev.*` 工具，身份取实际回执。保存只触发本地准备，不自动操作网页。

本机 Chrome for Testing 155 的现有 Native/MCP 驱动已实际执行全部七个 ESM 示例；原始回执、DOM、截图、输入与包 SHA、失效阻断和证据边界见 [ESM R2.2 专属记录](../../docs/framework/workstreams/esm-r22-examples-01a1296d.zh-CN.md)。sidebar-page-demo 的 proof.js 与 local-controller 的 extract.js 有源码修改再运行证据；sidebar-controller-demo 已验证真实搜索与 Locator 异常；page-heading/controller-title 使用显式 localhost 测试授权副本，原 example.com 网站未测；remote-esm-page 使用受控 Mock 依赖与 localhost 副本，真实 CDN 未访问。

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/sidebar-project-demo.test.mjs tests/environment/program-entry.test.mjs tests/environment/page-dependencies-ui.test.mjs tests/environment/esm-r21-wire-boundary.test.mjs tests/environment/remote-esm-review.test.mjs tests/environment/local-project-connection.test.mjs tests/environment/local-dev.test.mjs
node --test tests/integration/esm-examples-acceptance.test.mjs
```

第二条集成命令使用 Node 26.3.1，在现有 Webpack/Resolver 上验证真实文件图、哈希、源码修改、缓存、错误诊断与 OS 拒绝联网的锁定 HTTPS Mock；只算 L2。CI 的 macOS `esm-examples` 切片单独保存 L3/L4 身份，不把 Node/vm 当 Chrome。锁定 npm 示例另执行 `npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts --no-audit --no-fund`。所有运行产物写 `.runtime/`，不提交。


> R10.1 当前中文使用入口：[快速入门](../../docs/api/quickstart.zh-CN.md)，[七个 MCP 工具](../../docs/api/mcp-local-development.zh-CN.md)。复用原候选证据，按相关输入判断是否需要重测；不以示例运行代替安装/F3。

## 默认本地开发

[local-controller](local-controller/README.md) 提供“改 src/extract.js → MCP 运行新源码 → 原 Controller 持久结果”的只读示例。按 [R2.2 使用说明](../../docs/framework/local-development-r22.zh-CN.md) 完成一次连接，之后不用 build:program、JSON 上传或覆盖草稿。现有多文件示例沿用同一个项目格式；下文构建流程保留为显式冻结交付。Page 本地预览与 Sidebar 目录控件的当前状态见 [工作记录](../../docs/framework/workstreams/local-dev-r22-c036.json)。


| 示例 | 技术目标 | 当前证据边界 |
| --- | --- | --- |
| [可直接导入的 React/Vue 草稿](../import-ready/README.zh-CN.md) | 发现 → 导入已有 JSON，切换开发/直接编辑运行 | 已构建未验证草稿，不是安装/自动启动 |
| [page-ui-react-direct](page-ui-react-direct/) | 推荐：React 19 纯 JS，直接在目标网站插入组件 | 用户无需 npm、Vite 或自行编译 |
| [page-ui-toc-react-direct](page-ui-toc-react-direct/README.md) | React Direct 网页悬浮目录，自动收集 H1–H6、章节定位和 Stop 清理 | 独立 Demo；模型测试已跑，Mac 原生验收待执行 |
| [page-ui-vue-direct](page-ui-vue-direct/) | 推荐：Vue 3 纯 JS，直接在目标网站插入组件 | 用户无需 npm、Vite 或自行编译 |
| [page-ui-basic](page-ui-basic/) | 原生网页增强按钮、可撤销段落标记（R24.1） | 当前补丁待真实 Chrome 候选验收 |
| [page-ui-react](page-ui-react/) | React JSX + `root.unmount()` 的网页内 UI，原 Page Runtime | LOCKED_SOURCE：Vite PASS；Page 容量不足 / Chrome NOT_TESTED |
| [page-ui-vue](page-ui-vue/) | Vue 3 SFC + `app.unmount()` 的网页内 UI，原 Page Runtime | LOCKED_SOURCE：Vite PASS；Page 容量不足 / Chrome NOT_TESTED |
| [page-heading](page-heading/) | namespace/re-export Page ESM 标题读取 | R2.2 localhost 临时授权副本 Chrome L4 PASS；原 example.com 未测 |
| [controller-title](controller-title/) | Controller ESM 标题读取 | R2.2 localhost 临时授权副本 Chrome L4 PASS；原 example.com 未测 |
| [local-controller](local-controller/README.md) | Codex/MCP 修改本地多文件，直接使用最新已保存源码 | 原 R2.2 证据与[R10.1 后续 Mac/Codex 证据](../../docs/framework/workstreams/r101-development-01a12159.md)分开核对；不推广为每个新包已重跑 |
| [local-page-ui](local-page-ui/README.md) | 受管按钮、CSS、PNG、显式替换/Stop | 原 R2.2 与 R10.1 定向 Sidebar 证据分层保留，非 Installed/F3 |
| [page-npm-lodash](page-npm-lodash/README.md) | 项目级 npm 锁定 `lodash-es@4.17.21` → 单一 Page JS | R9 构建/Node 证据保留；R10.1 锁定依赖直连有定向本机证据，按实际输入复用 |
| [remote-esm-page](remote-esm-page/README.md) | HTTPS 静态 `import` → 明确锁定 → 离线重复构建 | R10 CDN/离线 CI 与 R10.1 实际开发直连证据分开保留；新候选按输入判断 |
| [sidebar-page-demo](sidebar-page-demo/) | 3 个源模块 → Page USER_SCRIPT → 测试页可见标记 | R2.2 Chrome L4 PASS；子模块修改、新源码/preview 身份及单节点已核对 |
| [sidebar-controller-demo](sidebar-controller-demo/) | 3 个源模块 → Controller Locator → 真实表单/结果 | R2.2 Chrome L4 PASS；真实 Locator、计数与未知效果只读恢复已核对 |
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

## ESM R2.1 Final 快速路径

- [page-heading](page-heading/README.md)：namespace、named import、local re-export、async 默认入口及 Page DOM。
- [sidebar-controller-demo](sidebar-controller-demo/README.md)：现有 3 模块 Controller + Locator，复用唯一标准 `examples/tasks/demo-form.html`。
- [remote-esm-page](remote-esm-page/README.md)：本地模块封装 HTTPS `lodash-es/add.js`，首次单独审阅/逐 URL 批准；固定缓存后离线重复编译。
- 自动化负向 fixture 留在 `tests/environment/page-dependencies-ui.test.mjs`、`local-project-connection.test.mjs`、`remote-esm-review.test.mjs`，不和用户示例混放。Node/Go/Native/Chrome 不得混用成功等级。
