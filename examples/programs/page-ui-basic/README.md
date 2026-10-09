# Page UI Basic：原生 Shadow DOM 多文件 UI（R1）

“读取本页信息”执行本地 `renderPanel` 按钮逻辑：空字符串或纯空白报错并聚焦输入；有效输入先 trim，在点击时读取 `getPageTitle`，进入 busy，120ms 后将 `{pageTitle,input}` 写到面板结果区并恢复按钮。点击后的标题变化不会改变这次快照。Enter 触发同一按钮；busy 期间不重复执行。`main()` 的 `UI_OPEN` 只表示初始化，按钮输出是 DOM 中的 JSON，不是 Controller 的持久结果或 API 返回 Promise。这里没有调用 Controller、现代 Page 自动化服务、Native Host 或网络 API。

标题时点验收：先运行本示例，再在标准页“当前网页标题”输入新标题并点击“更新网页标题”，最后在示例中输入带首尾空格的文字并点击读取。结果应使用新标题和 trim 后的文字。关闭、完全退出、导航或同 ID 重跑会取消尚未完成的受管定时器，旧面板不得出现晚到结果。

这不是独立 HTML 原型，也不是可安装的正式 Page 任务。它是通过现有多文件构建器编译后，在 **Page USER_SCRIPT 的手动试运行入口**执行的真实源码项目。入口为 `src/main.js`，UI 模块 `@opendesk/ui` 在构建时内嵌，不需要 React/Vue/Tailwind。

文件：`src/main.js`、`src/view.js`、`src/title.js`、`assets/panel.css`、`assets/config.json`、`assets/mark.png`、`package.json`。

## 构建与导入（仓库根目录）

```sh
npm ci --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/page-ui-basic
npm run build:program -- examples/programs/page-ui-basic
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

校验应返回 `AUTHORING_VALID_NOT_PACKAGED`，构建应返回 `BUILT_UNVERIFIED` 和实际 `outputDirectory`。输出位于 `artifacts/programs/sample.page-ui-basic/0.1.0/r31-production/<哈希>/`，含 `program.js`、`program.opendesk-draft.json`、`artifact.json`；源码资产已经作为固定字节内嵌 JS，**不需要**复制开发目录到扩展，不要把 `package.json` 当成可导入程序。

1. 在真实 Chrome 中加载仓库实际构建的 MV3 扩展，按浏览器需要打开扩展的「允许用户脚本」，确认目标页面有访问权限。
2. 访问标准页面：`http://127.0.0.1:43111/demo-form.html`。保持该窗口的 Sidebar 打开。
3. 在「发现 → 导入」进入**已有独立完整任务目录**，选择本次构建目录里的 `program.opendesk-draft.json`（也可用 `program.js`，但会失去源码快照）。
4. 返回「开发」，确认显示 `sample.page-ui-basic` 和 **Page** 类型，展开「网页用户脚本 · 依赖与试运行」，使用 **OpenDesk · async function main()** 入口，点击 **在当前网页试运行 DOM 脚本**。不要点击 Controller 的「运行草稿」来执行 DOM UI。
5. UI 将出现在网页右上方，不改变既有页面表单、按钮、样式。若确认成功，应有本地图片、输入框、「读取本页信息」「关闭」「完全退出」按钮及状态/结果区。

## 预期交互与清理

- 输入内容 → 点击「读取本页信息」：先出现「正在读取」，随后在结果区展示**本页标题与输入内容**，没有 HTTP 请求。
- 输入空字符串：提示输入错误；不把结果作为 HTML 执行。
- 点击「关闭」：仅销毁面板，右下方仍保留**重新打开工具**。点击它能重新创建面板而**不再次执行 main()**。
- 点击「完全退出」：面板与启动按钮均清理；若要再启动，须通过 Sidebar **再次手动试运行**。这不是持久安装/自动恢复。
- 同一网页在用户再次预览时，同 ID 的 launcher/面板会要求旧实例受管清理，避免重复按钮；网页 `pagehide` 时也清理。
- 开发者可在页面 Console 检查 `document.querySelectorAll('[data-opendesk-ui-owner]').length`；面板和 launcher 同时活跃应为 2，关面板为 1，完全退出为 0。只统计本示例时，请确认没有别的 UI 项目实例。

## 故障处理与验收边界

- `E_USER_SCRIPTS_UNAVAILABLE`：核查 Chrome 扩展「允许用户脚本」和当前扩展版本；`E_PERMISSION`：核查站点授权。
- `E_PREVIEW_WORLD_LIMIT`：同一文档手动预览世界已达上限，刷新标准测试网页后重新导入/运行；正常关闭再点 launcher 不消耗新世界。
- `E_PROJECT_ASSET_URL` / `E_PROJECT_ASSET_TYPE` / `E_PROJECT_ASSET_LIMIT`：检查 CSS 本地引用、图片签名、格式与预算。
- 图片不显示或 CSS 未生效：检查页面 CSP 与 `data:` 加载是否允许、ShadowRoot 的 style 节点及 Chrome Console；**Node 构建通过不代表真实 CSP 验收通过**。
- 对 320/400/600 CSS px、200% 缩放、网页全局 button/input 样式、重复打开关闭 20 次、导航/BFCache/离线加载逐项留实际 Chrome 证据。未经执行不得填 PASS。

公共接口与资源限制详见 [Page UI API](../../../docs/framework/ui-api.zh-CN.md)。其他真实测试继续使用单一 `examples/tasks/demo-form.html`，本示例不新增替代性手工测试页面。
