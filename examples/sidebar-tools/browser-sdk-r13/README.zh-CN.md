# Browser SDK 右键菜单与状态查询示例

本目录提供可以**不经 npm / Vite / 另一套扩展构建，直接导入 Side Panel「工具」**的完整 JSON 示例。

1. 导入 [selection-notes.opendesk-tool.json](selection-notes.opendesk-tool.json)，审阅 `browser.contextMenu` 能力并安装。
2. 打开测试网页：`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，进入 `http://127.0.0.1:43111/demo-form.html`。
3. Side Panel「工具 → 我的工具 → 选区笔记」详情顶部点击右键菜单按钮，在**真实用户点击**中批准 Chrome 可选 `contextMenus` 权限及当前网站。示例声明仅允许 `http://127.0.0.1/*` 和 `https://example.com/*`。其他站点需由开发者修改声明后重新审核工具包。
4. 在目标网页选中文字，右键选择 OpenDesk Browser → 保存到选区笔记，Side Panel 自动打开工具。工具调用 `OpenDeskSDK.browser.launch.consume()` 一次性领取，检查选区并由用户手工点击「确认保存」。读取和持久化沿用 `OpenDeskTool.request('storage.get/set')`，不会暗中保存。
5. 导入 [browser-capabilities.opendesk-tool.json](browser-capabilities.opendesk-tool.json)，点击「读取能力清单」，观察 `implementation`、`callableNow`、`reasonCode` 的区别。未声明菜单能力的工具只能发现状态，不能注册菜单。
6. [Page SDK 页面示例](page-sdk.html)：**不要**通过 `file://` 打开；需要 HTTP(S) 网站以及已安装扩展。网页只能查询受限能力不可用，不能绕过宿主授权。

**安全限制**：工具沙箱不拥有原生 `chrome.contextMenus`，浏览器可能在点击与后台读取之间导航；没有可验证的活动文档或者来源不一致时，敏感选区拒绝交付。Chrome `contextMenus.onClicked` 不提供点击瞬间的 `documentId`，完全消除同 URL 极端导航竞争需要更强的来源观测，不可把此示例当作已完成该等级的安全证明。

**尚未实测**：此示例代码已直接写入 Git 分支，但浏览器真实菜单路径和生产安装包仍需要 Mac Chrome 验收。