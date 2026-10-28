# AI 应用开发 R1.2 · Side Panel Web 差量（2026-10-28）

- 当前 owner：R1.2 Side Panel 预览生命周期；写入范围：`src/ui/tool-shell.js`、`src/ui/react/app-shell.tsx`、`src/ui/react/tabs/tool-host.tsx`、`src/ui/sidebar-tools.js`、定向测试及本记录。
- 原始目标：同一 quick-notes-react 源码经 Vite watch / Native 快照在真实 Side Panel 连续可见热更新两次，随后经现有 Host 完成隔离开发 SDK 联调；不能借独立预览标签页冒充。
- 确认缺口：原 `keepDeveloperPreview` 只保护切往 Develop，切往 My/Workflow/Cloud 时 `setVisible(false)` 会调用 `suspendTool()` 销毁正在调试的 iframe。
- 最小修复：有效 Side Panel 预览随普通 Tab 切换保持同一 ToolHost；浏览 Extensions 时仅隐藏调试宿主并显示安装列表；阻止安装版工具/设置覆盖开发预览；应用调试仅用 Stop 退出，不通过返回按钮暗中销毁。
- 复用：原 ToolHost、Session、Native Workspace、Sandbox、React Root、授权和安装器；不新增运行协议、权限或开发数据写入路径。
- 本轮无本地 Mac Repo/Chrome 控制环境。源码差量与静态回归断言已写入；Node/CI/构建/Side Panel 可见双更新/SDK ETag/Mac Chrome 均需在同候选实际执行，未取得回执不得标 PASS。
- P1 已知阻断：`src/native-agent/tool-development-storage.js` 的 `sender.tab.id` Owner 模型尚不适用于 Side Panel，必须在真实 P0 建立后单独完成强身份绑定与负例回归。

## 后续 R1.2 差量（同日）

- `5be5da5a98d19dc2011726a057ca71068bd8fda3`：导航保持开发 iframe、同一 ToolHost 隐藏预览并显示安装列表、安装版工具不得覆盖预览。
- `552cd56b52c90f42df961b6d4ee9de0d35dc31f5`：修复新加的 source-contract 回归测试正则转义。
- `1e350fe6e6343c64979f99f8a93f0ea3890082e8`：Native Workspace 跨窗口／同窗 Owner 替换后停止旧预览；新快照写入前再次核对窗口及预览指针；增加竞态定向测试源码。
- 扩展列表补充开发预览期间无法打开安装版应用的可见提示，避免隐藏 ToolHost 内的错误不可见。
- 相关 GitHub Actions 的 `Sidebar R1 P0 targeted checks` 在本轮检查时仍为 QUEUED（R1.1: `40696929458`；R1.2: `40700155278`）。队列不是 PASS。
- 不具备本机 Mac Chrome/Native 工作区和源文件实时操作；未取得与 SHA 匹配的两次可见 JSX 变更证据，也未完成 P1 SDK ETag。优先让本地 Codex 使用真实 Chrome 跑定向测试和最短双更新链，不提前扩展架构。
