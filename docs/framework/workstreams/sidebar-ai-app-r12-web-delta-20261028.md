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

### 扩展管理可用性补正

- 原 ToolHost 同时拥有导入抽屉与活动应用：不能通过给整个 ToolHost 根节点设置 `hidden` 来隐藏调试 iframe，否则「扩展」的安装导入也会不可见。
- 同一 React ToolHost 始终挂载，导航至扩展管理时只对 `#sidebar-tool-display` 应用可逆隐藏；导入抽屉仍可正常呈现。普通标签页切换不销毁原 iframe，启动安装版应用仍须先 Stop 开发预览。

## R1.3 LOCAL · 真实 Mac 入口核查（2026-10-28 22:35 CST）

- 本机 main 起点 `9ef05833d1d3d1fd22f6c3a7d27054f3bb7853ae`，fetch 后与 origin/main 一致。以上四项 R1.2 修复均仍在历史及实现中，不重新实施。
- 真实日常 Chrome 工具栏打开了右侧 OpenDesk 面板，但 `chrome-extension://ccfcjegpkdlgbclopjmadlcjedelidmf/sidepanel.html` 显示 `ERR_FILE_NOT_FOUND`。Chrome 扩展详情确认加载目录为本仓库 `dist/development`；目录确实缺少 `manifest.json`、`sidepanel.html` 和 `development-update.json`。这是 P0 入口环境阻断，尚未取得成功运行的 `SIDE_PANEL` 上下文证据。
- 当前是持续开发服务进程仍在、输出不完整的状态：原 dev PID `71284`，端口 `43119/43120`。未停止该服务、未另启 Browser build/dev、未复制静态文件补齐未通过门禁的包。共享来源审查及构建恢复由现有「完成 AI 队列 R5.10 验收」对话负责，其最新日志显示 Cookie 固定来源校验阻断；未修改其 pin 或接管相关文件。
- 使用 Native manifest 所指向的 Go 执行 `browser doctor`（不加不受支持的 `--json`），实际返回 `connected: true`、`nativeConnected: true`，`local.extensionId` 与 Chrome 和 `allowed_origins` 均为上述 ID；`hostRegistrations` 为空。这不证明预览已运行。
- 确认本项目原无 Vite/stage watcher 后，分别启动 README 已有的 `npm run watch --prefix examples/sidebar-tools/quick-notes-react` 与 `node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/quick-notes-react`。真实 Vite 编译完成，带源码绑定的 buildId 为 `00778c57-6160-4419-9625-4a09dc5827ce`，完整快照 SHA 为 `0f811a7bfe3cacee1dc5bdb1b7f999f9c1bd8b39cb0b639af5771fd97efcc557`。未修改 App.jsx、正式安装包或正式数据；这些回执不能代替两次可见更新。
- 独立原生子 Agent Sartre（explore）执行指定六文件基线：99 项，95 PASS、4 FAIL。双击用例未等待现有 `windows.getCurrent()` 异步校验，最小修复仅在原断言前等待已有 `settle()`；其单一 intent、捕获来源和仅打开一次的断言保留。修复后 `local-project-tool-preview.test.mjs` 为 9/9 PASS。
- 真实项目编译修复旧回执缺 `sources` 的环境缺口后，`sidebar-quick-notes-react-pack-r21.test.mjs` 为 2/3 PASS；剩余一项因历史 `.opendesk-preview` 双栏比较的 canonical CSS 过期而失败，不是本次实时 stage 快照失败。不为该演示比较覆盖 Browser 输出或提前进入 P2。
- 通过 GitHub 连接器重新查询：`40696929458`、`40700697601` 都已 FAILURE，失败在更早的 `R15 semantic workflow compiler, AI adapter and multi-state Sidebar contract` 步骤。未因此重跑 CI 或构建。
- 原始本机回执：`artifacts/sidebar-ai-app-r13-local-20261028/entry-evidence.json`、`local-project-preview-after.tap`、`quick-notes-source-receipt.tap`。真实 Chrome 原生截图与可访问树在本对话工具记录中；未声称存在本地截图文件。
- 本轮工程状态：`SOURCE_DONE=PARTIAL / BUILD_PASS=PARTIAL`（工具编译成功，Browser 输出阻断）`/ PREVIEW_PASS=BLOCKED / SDK_PASS=BLOCKED / MAC_CHROME_PASS=PARTIAL`（只核对了真实入口、加载身份与 Native 连接）。八维正式验收及平均分均 `NOT_SCORED`；未获得成功运行、双更新和 SDK 证据前不宣称 95+。
- 下一条最小操作：共享 dev owner 恢复同目录完整输出后，从「开发 → 本地项目 → 在侧栏调试」继续，取得真实 `SIDE_PANEL` 身份并做两次 App.jsx 可见变更、编译错误保留及恢复；P0 通过前不实施 P1 Owner 改造或正式包晋升。
