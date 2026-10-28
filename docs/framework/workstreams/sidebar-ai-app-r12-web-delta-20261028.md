# AI 应用开发 R1.2 · Side Panel Web 差量（2026-10-28）

- 当前 owner：R1.2 Side Panel 预览生命周期；写入范围：`src/ui/tool-shell.js`、`src/ui/react/app-shell.tsx`、`src/ui/react/tabs/tool-host.tsx`、`src/ui/sidebar-tools.js`、定向测试及本记录。
- 原始目标：同一 quick-notes-react 源码经 Vite watch / Native 快照在真实 Side Panel 连续可见热更新两次，随后经现有 Host 完成隔离开发 SDK 联调；不能借独立预览标签页冒充。
- 确认缺口：原 `keepDeveloperPreview` 只保护切往 Develop，切往 My/Workflow/Cloud 时 `setVisible(false)` 会调用 `suspendTool()` 销毁正在调试的 iframe。
- 最小修复：有效 Side Panel 预览随普通 Tab 切换保持同一 ToolHost；浏览 Extensions 时仅隐藏调试宿主并显示安装列表；阻止安装版工具/设置覆盖开发预览；应用调试仅用 Stop 退出，不通过返回按钮暗中销毁。
- 复用：原 ToolHost、Session、Native Workspace、Sandbox、React Root、授权和安装器；不新增运行协议、权限或开发数据写入路径。
- 本轮无本地 Mac Repo/Chrome 控制环境。源码差量与静态回归断言已写入；Node/CI/构建/Side Panel 可见双更新/SDK ETag/Mac Chrome 均需在同候选实际执行，未取得回执不得标 PASS。
- P1 已知阻断：`src/native-agent/tool-development-storage.js` 的 `sender.tab.id` Owner 模型尚不适用于 Side Panel，必须在真实 P0 建立后单独完成强身份绑定与负例回归。
