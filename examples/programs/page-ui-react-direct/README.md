# React 普通 JavaScript · 通用跨站悬浮组件（R24.3）

本目录演示**在不同普通网页中运行的 React 悬浮 UI**，不是阅读目录、网页采集或 Side Panel 小工具。保留项目 ID、标准 `react` 导入和 `entryMode: "component"`。开发者只编辑 `src/main.js`，不必自行调用 `createPageUI`、创建 React root、运行 Vite 或在本项目安装 React。

## 第三方依赖与 JSON：本项目不以油猴声明为主入口

本目录 `package.json` 是**项目源码配置**，不是可直接安装的 Side Panel 工具 JSON。现有 `opendesk.framework: "react"` 声明由 OpenDesk 提供固定 React/ReactDOM；没有自动包含 ECharts，也不是任意 CDN 依赖表。

新增用户项目依赖应继续使用标准 `dependencies` + 项目锁 + `import`，而不是修改 OpenDesk 扩展源码或往 React 组件顶部添加 `@require`。确需指定 CDN 的 **ESM** 可以写静态 HTTPS URL import，由现有本地项目准备器在显式锁定后离线链接；**UMD 的 `.min.js` 不等于 ESM 模块**。这些作者依赖在准备后进入冻结代码/包，安装者不必拥有 Node、npm 或仓库。

不要用 `document.createElement('script')` 把 CDN 库放进目标网页 MAIN 世界，再假设本项目的 USER_SCRIPT React 组件能访问那个全局变量；也不要为此切换世界、降低 CSP 或破坏受管 Stop。Side Panel 内部图表则应在该工具自己的 sandbox 中运行，不向目标网页注入图表库。

**当前边界**：本项目没有完成 ECharts 的依赖准备、实际体积、JSON 交付及真实 Chrome 图表验证。小依赖可复用现有固定打包流程；大型库是否需要版本化资源包，必须先测量并补齐构建器、包校验、安装存储与执行器，不能只在 v1 JSON 中添加未实现字段。浏览器只编辑源码的新第三方依赖准备也不能被当前单组件 JSX 编译能力替代。

完整方案、源码事实、安装/加载顺序和清理规则见 [项目依赖、JSON 分发与执行世界](../../../docs/architecture/browser-framework/project-dependencies-json-and-execution.zh-CN.md)。其中明确区分已支持与待实现，不把设计文档当运行成功证明。

## 挂载与权限

- `pageRules.matches: ["*://*/*"]` 覆盖普通 HTTP(S) 文档，`allFrames: false`，不要求页面拥有 `#page-ui-demo-target` 或任何测试页节点。
- 系统生成的 `scripts/page-component-entry.mjs` 复用 `@opendesk/ui`：默认 `floating` 宿主 + Shadow DOM、React root、Stop 时 `root.unmount()`。不额外实现执行器、监听特权事件或从目标网站/CDN加载 React。
- **匹配范围不是网站访问授权。** 本通配配置仅供手动跨站开发演示，不代表自动取得全站访问权限，更不应该直接用于默认自动安装的正式工具。每个目标网站仍必须满足 Chrome Site Access、用户脚本许可和真实执行授权；换站点后需明确再次运行。
- `chrome://`、扩展页、`file://` 等不属于本 HTTP(S) 范围；某些受限制的 HTTP(S) 页面也不能注入。悬浮组件不读取表单或修改原站点内容。

## 使用

1. 按 [本地目录 CLI](../../../docs/framework/local-directory-cli-r17.zh-CN.md) 完成 Native Host 安装/配对，在此目录运行 `opendesk browser dev .` 并保持连接。
2. Chrome 打开一个已经批准访问的 HTTP(S) 网页。Sidebar → 开发 → 本地项目 → 本项目 → **运行**。保存只自动准备，**不会自动在网页执行**。
3. 右上角应出现悬浮卡片，展示当前网页标题、域名和路径；计数按钮验证 React 事件/Hooks，刷新按钮读取最新标题/URL，收起与展开验证组件状态。
4. 切换到另一个已获准访问的普通网页，重新点击运行；用 Sidebar 的受管 Stop 结束，确认 UI、React effect 监听器和宿主均被清理。
5. 仍可使用标准测试页 `http://127.0.0.1:43111/demo-form.html` 回归，但**它不是运行前提**。服务启动方式：在仓库根目录执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。

## 与其他示例的边界

浏览器无需 Native 的 **React JSX 直接编辑模式** 已支持官方单组件 JSX 的按需编译与网页 Run/Stop（[真实 Chrome 历史证据](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847)），但它**不会读取本目录、继承本目录通配 `pageRules`、执行多文件导入或隐式替换已安装版本**。本目录 `src/main.js` 仍按 `opendesk browser dev .` 的 Native 已授权本地目录开发方式操作；两者都只能显式 Run。

`page-ui-toc-react-direct`（由另一个对话单独实现时）负责章节抽取和目录跳转。本项目只验证跨站 React 悬浮挂载，**不复制阅读目录功能**，不修改 `page-ui-react`、`page-ui-vue`、`page-ui-vue-direct`。

旧的 `src/legacy-main.js` 和 `src/enhancement.js` 只作为 R24.2 指定测试页的可逆高亮兼容示例保留；`examples/import-ready/history/` 中的旧版导入快照/回执不得重写。每次修改当前源码或匹配规则后，必须用原有构建器重新生成并验证**当前** `examples/import-ready/page-ui-react-direct.opendesk-draft.json`，旧文件哈希不得冒充本版证据。

[组件使用指南](../../../docs/api/page-ui-frameworks.zh-CN.md) · [导入草稿](../../import-ready/README.zh-CN.md)
