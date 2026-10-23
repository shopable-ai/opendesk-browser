# 书签重装后侧栏列表恢复（2026-10-24）

Owner：本对话 `01a16a1c-5e74-7423-b221-96c038df41be`。阶段：日常持续开发核心修复，仅 main。

现场：日常 Chrome 的扩展中心停在“正在读取扩展…”，调试控制器也未初始化。Side Panel DevTools 显示 `DataCloneError`，调用链为 `workflow-ui-state.js:152` → `createWorkflowView` → `tool-shell.js:195`，中断扩展中心控制器创建。用户卸载、重装、授权和刷新 SDK 是故障出现时的操作；尚不能据此归因于安装数据或书签权限。

归属与最小修复：公共可信 UI 投影（`opendesk-extension-ui`），将普通控件快照的 `value` 从整个控件记录改为该控件的值，保留密钥遮蔽和 Proxy 隔离。不是工具 SDK 能力缺口，不修改 Installer/Host/Authority、包或权限。

写入范围：`src/ui/workflow/workflow-ui-state.js`、`tests/environment/workflow-ui-state-snapshot.test.mjs`、本记录、工具 `README.zh-CN.md`、工具 `evidence/list-recovery-20261024.json`。其余文件只读；原有 Cookie 测试与 SDK Schema 测试改动保留。

用户随后确认界面不是最新样式。实际详情为 0.3.11 / 正确 SHA，但来源未记录，故按原安全合同进入 Classic 沙箱。官方目录为 optional，非预装。市场以完整包一致就仅给“打开使用”，同版本来源缺失无法从 UI 重新审阅，尽管原安装器已有同包补来源能力。追加写入 `src/marketplace/page.js`、`tests/environment/marketplace-source-review.test.mjs`：补明确审阅入口，仅完全相同包可同版本确认来源；不同字节、降级仍拒绝。既有 Installer 与准入不改。

资源：接管日常 Chrome 侧栏操作；复用原 npm dev PID 16868 / 16888 与 `dist/development` writer，不另起构建。故障现场扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，日志 applied revision `519e4e1f31b368e85211c9307af78d3baa588d26a29c8ec090f6573dd3ab6add`。加载路径及修复后实时连接待 UI 读回。

验证：先用 Node 直接复现真实 UI 状态创建失败，再验证初始/更新快照可克隆、值正确、旧快照不变及密钥不泄露；随后用原 watcher 在真实侧栏检查列表、设置授权/刷新、书签读取、返回重开及其他安装保留。禁止清空数据或修改 Chrome 存储。production、评分、全矩阵、书签 CRUD/模型请求延期。

结果：本轮两项故障均恢复。Chrome 实际加载 `dist/development`，调试页开发连接成功，revision `353c60ea36e17e4862f78568c062839d793c27d1ec65ca358dfed8b9d1706935`；原 watcher PID 保留。11 项扩展仍在，官方来源补记后打开正式 React，3 节点书签树、刷新、设置往返及列表重开通过，已有 Full 授权仍有效。包保持 0.3.11 / 原 SHA，不构建或晋升 JSON。当前停留原 ChatGPT 页的书签界面；自有市场和路径核查 Tab 已关闭。

定向快照/市场测试 11 PASS，精确可信准入测试 1 PASS，JS 语法及 diff 检查通过。先前相邻工作流组为 24 PASS / 1 FAIL：既有 no-DOM 静态正则命中 `workflowSession.append()`，与本次标量修复无关，延期。未复跑卸载/重装或 Classic SDK-refresh；来源丢失的原始路径未知，不将恢复后的只读核心链冒充该链完整验收。详细证据在工具 `evidence/list-recovery-20261024.json`。不再操作用户数据、Profile 或服务；后续只提交本轮文件。

提交前发现并行主分支同步到 `fd9b1b78c`，相同一行标量修复已由 `dac62c356` 带入 main，文件不再存在未提交差异。保留该提交；本轮提交仅含来源审阅 UI、两份回归测试、README 和证据/本记录。未重新构建或因无关 main 更新重复验收；原生结论绑定上述实际 revision。
