# Browser SDK 右键菜单与状态查询示例

本目录提供可以**不经 npm / Vite / 另一套扩展构建，直接导入 Side Panel「工具」**的完整 JSON 示例。

1. 导入 [selection-notes.opendesk-tool.json](selection-notes.opendesk-tool.json)，审阅 `browser.contextMenu` 能力并安装。
2. 打开测试网页：`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，进入 `http://127.0.0.1:43111/demo-form.html`。
3. Side Panel「工具 → 我的工具 → 选区笔记」详情顶部点击右键菜单按钮，在**真实用户点击**中批准 Chrome 可选 `contextMenus` 权限及当前网站。示例声明仅允许 `http://127.0.0.1/*` 和 `https://example.com/*`。其他站点需由开发者修改声明后重新审核工具包。
4. 在目标网页选中文字，右键选择 OpenDesk Browser → 保存到选区笔记，Side Panel 自动打开工具。工具调用 `OpenDeskSDK.browser.launch.consume()` 一次性领取，检查选区并由用户手工点击「确认保存」。读取和持久化沿用 `OpenDeskTool.request('storage.get/set')`，不会暗中保存。
5. 导入 [browser-capabilities.opendesk-tool.json](browser-capabilities.opendesk-tool.json)，点击「读取能力清单」，观察 `implementation`、`callableNow`、`reasonCode` 的区别。未声明菜单能力的工具只能发现状态，不能注册菜单。
6. [Page SDK 页面示例](page-sdk.html)：在另外一个不占用 43111 端口的终端运行 `python3 -m http.server 43112 --bind 127.0.0.1 --directory examples/sidebar-tools/browser-sdk-r13`，访问 `http://127.0.0.1:43112/page-sdk.html`。不要使用 `file://`；普通网页只能查询受限能力状态，不能绕过宿主授权。

**安全限制**：工具沙箱不拥有原生 `chrome.contextMenus`。Chrome 菜单回调本身不提供 `documentId`，因此复用已有 ISOLATED Content Script 预先记录真实右键手势的**文档身份元数据，不收集正文或选区**。点击后必须同时匹配此凭据、当前 Chrome 文档和工具授权；Worker 恢复期间丢失凭据、同 URL 换文档、工具停用或权限撤销均拒绝交付。启动工具代码还必须等到绑定票据成功。真实 Mac Chrome GUI 竞态仍需验证，不要把组件模拟当作产品级 PASS。

**验收状态**：代码已写入 Git 隔离分支。此前同一候选的生产/开发构建与 macOS Chrome Worker 恢复已有自动化 PASS；**实际 macOS GUI 右键菜单选择、原生权限、保存结果仍为 NOT_TESTED**，需保留同一包身份的截图/运行回执。