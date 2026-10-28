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

## R1.3 LOCAL · 真实侧栏双更新与导入修复（2026-10-28 23:12 CST）

- 用户授权跨对话协调后，共享恢复 owner 使用原 npm run dev 恢复同一 dist/development（PID 93865），未改加载路径或扩展 ID。完整输出回执为 b31330650b6a55464f44d8805e31060aef9fc9baa2de4ef74c5a03e65e14920f；本对话保留 Quick Notes React 的两个原 watcher。
- 从真实「开发 → 本地项目 → quick-notes-react → 在侧栏调试」进入。Chrome 自身 runtime.getContexts 实际返回 SIDE_PANEL，documentId 96B07635DFEFAEB4B18BF7D1658456EB、contextId 5ca5eab1-0da0-41ba-8096-00876ee3879e；windows.getCurrent 实际返回窗口 560068725。hostInstanceId a5c94ad6-39f4-4f62-aa80-a9860f166d7d 在两次更新和错误恢复中不变。Chrome context 的 tabId/windowId 均为 -1，不能把它们当独立标签页身份。
- 同一 Side Panel 中将 App.jsx 标签依次改为「我的笔记 · R1.3 更新一／二」，两次均无需重导入、安装或手动刷新，真实可见。快照依次为 8acb289d5ef3381ce367cb840af4f0f17a506d3a6dc3c142a74a35a78c2ae3c1 与 fd494f9434f1e66203e54fc84f2ea9d97d3652276a31192e639d30ecbb9878e3。故意引入 labelBROKEN JSX 错误后，界面和 latest 保留第二个成功快照，显示编译失败；恢复原标签后自动回到 0f811a7bfe3cacee1dc5bdb1b7f999f9c1bd8b39cb0b639af5771fd97efcc557。临时 App.jsx 改动已全部恢复。
- 实测「开发／应用调试／我的／扩展／工作流／云控」往返成功；未执行的开发草稿返回后保留，测试后恢复原空草稿和本地项目选择。
- 真实失败：调试运行时「扩展 → 导入扩展」被 openImport 的 active 条件拒绝。最小修复只允许只读开发预览期间打开原抽屉；已安装应用的 active 拒绝仍保留。新增两项定向测试，先复现一失败一通过，修复后连同原导入用例为 3/3 PASS；真实 Chrome 复验抽屉可见、取消后预览仍在。未执行安装操作或改写正式数据。
- 证据集中在 artifacts/sidebar-ai-app-r13-local-20261028/visible-react-evidence.json，包含每次 JSX 源码 SHA、buildId、快照 SHA 与对应 .png/.ax.txt；sidepanel-chrome-context.png/.ax.txt 为 Chrome 实际上下文回执。入口恢复后的 Host 差量安全重载产生新 hostInstanceId 0e82b2ce-a943-4047-84ca-6609e0289400，随后从正式入口重建会话并复验导入；不把新实例冒充原双更新实例。
- 目前已证明双更新、编译错误保留/恢复和导航；Stop、跨窗口、断连与旧请求失效仍在执行，P0 尚未整体完成。SDK 仍未授权，真实存储/ETag 为 BLOCKED；P1/P2 尚未开始。八维正式验收未评分，不给综合 95+。

## R1.3 LOCAL · Stop 转接修复与续接边界（2026-10-28）

- 真实失败：点击「停止调试」后更新订阅已断开，但旧 iframe、应用调试 Tab 和窗口 pointer 仍在。定位到 React view façade 漏转发现有 controller.stopReadOnlyPreview，导致 detachPanelPreview 中途抛错；不重写 Host 或停止逻辑，只补一处方法转发。
- 定向验证：原 React runtime refs 用例增加 Stop 转发后先复现 TypeError，修复后 sidebar-tools-view.test.mjs 13/13 PASS；新增 controller Stop 测试 1/1 PASS，确认移除 iframe、旧实例请求无回复、重复 Stop 无副作用且未触及正式存储。
- 原 dev watcher 自动发布 revision 5e7f6efeb643d9692546275309ea8728dfb7d5c2158129095165e91d08d925ac。真实新 hostInstanceId e844c1dd-7a45-40ca-8524-1fc5d065f2b6 点击 Stop 后退回「开发」，应用调试 Tab 和旧界面均消失；随后 JSX 临时改为「Stop 隔离检查」并发布新快照 7403c6a0ce930d1af41bcbea991b8096728bd463263500bb20dce65e78597f3d，旧预览没有恢复。App.jsx 已恢复，无正式源码或安装包变更。
- 证据：artifacts/sidebar-ai-app-r13-local-20261028/stop-fixed.png、stop-fixed.ax.txt、stop-after-next-build.ax.txt。第二个真实 Chrome 窗口 hostInstanceId dfb1ef89-044a-426c-adc6-4521d4e3ac3f 初开不继承应用调试，显式经正式入口后才能显示；证据 second-window-isolated.png/.ax.txt。Workspace 移窗操作尚未得到最终确认，不标 PASS。
- 共享 dev owner「完成 AI 队列 R5.10 验收」已明确当前不依赖日常 ccfc 扩展 NativeAgent，原生断连验证可在协调范围内继续，但本轮交接前尚未执行。保留原服务运行。P0 生命周期仍为 PARTIAL；SDK 真实联调 BLOCKED，P1/P2 未实施，不作八维正式评分。
- 用户要求创建新对话继续。接收方先完成跨窗口 owner 替换、Native 断连与旧实例失效，再进入 Side Panel 真实 SDK。准备交接时原对话 goal 最新实读为 paused（本轮未调用状态修改工具）；创建不会自动迁移或完成它，原对话移交后不重复操作接收方资源。


## R1.3 LOCAL · 生命周期、基本 SDK 与当前收尾范围（2026-10-28）

- 最新用户要求：不测试所有 SDK，几个基本接口成功、开发更新正常即可；另需覆盖 React 与 Shared UI 的简单更新检查。随后更新开发文档并创建新对话继续完善。全 SDK、全量矩阵、正式安装包晋升、production 验收和 95+ 评分均延期，不能从旧 GOAL 自动恢复。
- 真实操作已确认：Workspace 移至其他窗口会停止旧会话；同窗口新的 Workspace 会替换旧 owner；通过现有设置停用/恢复 Native 后旧预览不会复活。只验证了正常断连/重连，不声称进程崩溃验收。证据在 `artifacts/sidebar-ai-app-r13-local-20261028/` 的 `workspace-move-confirmed`、`workspace-move-old-panel-retired`、`owner-replacement-old-workspace`、`native-disconnected`、`native-reconnected-old-panel-retired` 对应可访问树/截图。此前双 JSX 更新、错误保留及恢复证据继续有效，不重复执行。
- 开发授权已适配真实 SIDE_PANEL：绑定可信 Host 的窗口、document/context/hostInstanceId、Workspace/source/快照 SHA/Native 会话/lease；`sender.tab` 不适用于该文档，Chrome context 的 tabId/windowId=-1 不得充当业务窗口。Native 尚未有 CLI attach 时的显式空字符串 leaseEpoch 依原合同严格比对，不能错拒，也不将其视作通配符。
- 安全更新使用新实例重校验；同来源、工具和能力范围可沿用本次调试意图。Stop、实际 owner/Native 失效、来源/权限变化以及未知写入结果清除意图，不能自动批准或重放写入。隔离数据仅保留当前浏览器会话，正式安装数据不变。
- 真实基本 SDK：可信界面批准后 React 应用可编辑，保存「你好 · R1.3-LOCAL 隔离笔记」后显示一条笔记和「已保存到本机」。这证明本次 `storage.get/set` 基本链成功，不等于全 SDK 或跨重启持久化验收。证据 `p1-sdk-save.ax.txt/.png`。`currentPage.info` 曾返回旧只读结果；已定位当时 Host 构建被体积门禁拒绝，Chrome 仍使用旧产物，不能把该结果宣称新桥接失败或成功。
- 用户明确允许合理扩大 Host 预算。唯一配置 `scripts/build-contract.mjs` 的 `SIDEBAR_TOOL_HOST_BYTES` 从 516 KiB 调为 1 MiB，开发/生产同值；WXT、audit 与包校验共用该值，AST/CSP/来源/身份/权限检查不变。当前源码含 basic page info 桥接；新产物与真实调用需在 watcher 恢复后复验。仅改配置不证明运行成功。
- 定向测试：在预算调整前，本次 owner/session/preview 三文件 108/108 PASS；补充预算与 Host 检查 26/26 PASS，见 `handoff-targeted-checks.txt`，包含 Host 1 MiB/+1 byte 边界。共享 dev 配置自动 restart 一度仍使用依赖缓存中的旧预算。原 watcher owner 已移交服务给「继续 AI 消息发送队列 R5.10 实机同步与验收」（`01a1831f-9060-76b3-b98d-758dceea4006`），已向接收 owner 发出安全重启同一服务的协调请求；未另开 writer。交接前最后检查，自动 restart 清理后 `dist/development/ui/sidebar-tool-host.js` 缺失，说明当前入口仍需恢复，不能报告热更新整体正常。
- 下一条未完成操作：确认同一 dev watcher 采用 1 MiB 并生成 Host 新产物；在正式入口做一次网页信息基本调用、批准后的 React JSX 更新/恢复，以及共享 UI 单个组件可见更新/恢复。已有未批准 JSX 双更新不可代替批准后重绑检查；iframe/应用 JSX 不可代替共享组件资源更新。完成这些最小检查并更新本记录即收尾，不扩正式验收。
- 交接准备时本对话 `01a1831a-0dee-7662-b5ad-37933df4416c` 的 goal 实读为空；更早来源对话的 goal 上次记录 paused，当前跨对话状态未知。创建不会自动迁移或结束旧 goal；接收 owner 负责后续文件与浏览器，本对话移交后不重复操作。


## R1.3 LOCAL · 基本联调完成与取消重复批准（2026-10-29）

- 当前用户纠偏：开发不应再添加独立的隔离存储批准步骤。已删除「批准隔离存储调试」「停止存储调试」两个按钮和常驻“已批准”提示；点击「在侧栏调试」直接进入可用会话，统一用原「停止调试」退出。未新增 Host、Authority 或安装流程。
- 原 dev owner 已明确移交管理权；只安全停止失效的原 node93865 后，恢复唯一 `npm run dev`（本次观察 node18415，npm18395），输出仍为 `dist/development`。真实 Chrome 扩展仍为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，调试页确认开发服务连接。恢复 revision `31a97aaa03affc85516693e2c874b88c12f11f572fba65328bdb48f0c8eff8f1`；Host 为 528503 bytes，已通过现有 1 MiB 门禁。
- 基本 SDK 在真实 Side Panel 已完成：`storage.get/set` 保存中文笔记；切到标准测试页后 `currentPage.info` 显示真实标题 `OpenDesk Browser · Browser Test Lab` 和 `http://127.0.0.1:43111/demo-form.html`。证据 `r13-resume-basic-sdk.ax.txt/.png`。
- JSX 可见文字更新到「我的笔记 · 已批准 JSX 更新」后自动重绑新 iframe，仍可保存；恢复原源码后回到原快照 `0f811a7bfe3cacee1dc5bdb1b7f999f9c1bd8b39cb0b639af5771fd97efcc557`。这组证据产生于取消按钮前，不能伪称为取消后的同候选更新验收；新入口的同范围重绑另由本次定向测试覆盖。证据 `r13-resume-approved-jsx`、`r13-resume-jsx-restored` 对应可访问树/截图。
- 共享 `CardContent` 临时文字「Shared UI · R1.3 检查」由固定 `sidebar-shared-ui.js` 更新后在真实沙箱可见。该修改触发既有扩展安全重载，重新从原入口打开后验证，没有承诺保留原 iframe 或跨重载的 session 数据。App.jsx 与 card.tsx 均已逐字节恢复，分别为 SHA `b07a5bc8859c92e27c5eb5acf9c0e8c510a6cb32a4b2ebbcc0cb9901b9b427cb`、`66e89f8da4d0645c7741b518e74c93982af2f1ef65cbc1411bbc908aef8ea363`；最终可见界面无临时文字。证据 `r13-resume-shared-ui-visible.ax.txt/.png` 和 `no-extra-approval-evidence.json`。
- 取消按钮后的首次实测暴露发布时序缺陷：侧栏可在 `storage.session.set` 返回前发起准入，而 owner 尚未准备对应快照，出现超时。最小修复在原发布边界先准备精确 owner，准入仍核对已提交窗口 pointer、Native authority 和当前源码。新增首次/更新发布竞态用例；不通过重试写入或放宽身份核验掩盖问题。
- 最终真实操作：从「开发 → 本地项目 → 在侧栏调试」直接进入可编辑应用，无额外批准；保存「你好 · 直接进入调试」后显示「已保存到本机」。hostInstanceId `2e46905d-7db9-4c0c-bf1e-d14bd41e3f45`，revision `a0ad448e46e088fc1874a0861632ea7a28adb393d73ad44f3cccc87819ac41e0`。证据 `r13-no-extra-approval-saved.ax.txt/.png`。当前轮仅证明这条最小核心链，未执行全 SDK 或正式验收。
- 受影响 owner/session/preview 定向验证 109/109 PASS；保留来源/窗口/document/context/实例、Stop、撤权、ETag、正式数据隔离和未知写入不重放保护。预算的既有 26/26 PASS 证据未失效，不重复执行。回执 `no-extra-approval-checks.tap`；`git diff --check` 通过。
- 官方 helper 已释放 native UI 锁，并通知「AI 发送队列 · 核心功能续接」可接续操作。Vite/stage/dev watcher 保持运行；本对话接下来仅文档与安全提交，不触发共享源码重载。全 SDK、production、正式包和 95+ 继续延期；核心收尾不自动恢复历史正式验收。
