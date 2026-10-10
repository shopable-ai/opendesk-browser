# R5 Mac 最终 Native Host 验收接续

2026-10-10；对话 `01a1250e-c344-7401-a476-ff8057e9a34b`；状态 **IN_PROGRESS**。

用户要求最终完整 OpenDesk.app、官方 Go CLI、真实 Chrome 授权、持久 Run/Result/Stop、生命周期、安全和可恢复回滚；只在 OpenDesk master / Browser main，不建分支或 Worktree。

本对话独占：`OPENDESK_NATIVE_INSTANCE=r5-mac`、`~/.local/share/opendesk-browser-r5/codex-cft-profile`、该 Profile 的 Chrome for Testing、`~/Applications/OpenDesk-R5/OpenDesk.app`、独立构建快照和本轮证据。标准网页仅 `http://127.0.0.1:43111/demo-form.html`。不拥有并不停止 43111 服务、Browser dev 43120、日常 Chrome、默认 Node Host、其他任务的 GUI。

R2 对话 `01a124da-a62c-7e20-81a3-970409883a22` 持有安装事务、配对和相关 AppShell 源码写权。R5不覆盖其修改。第三方 floating-toolbar dirty 源码不混入最终候选；等待 R2 提交后从提交归档构建完整 App。

原始证据与前轮交接：`/Users/shopme/Documents/workspace/opendesk/.runtime/tests/browser-native-r5/HANDOFF.md`。本轮证据根：`/Users/shopme/Documents/workspace/opendesk/.runtime/tests/browser-native-r5/final-20261010/`。前轮候选 PASS 不提升为最终候选 PASS；所有原始失败保留。

已取得前候选现场证据：实际撤销 nativeMessaging 后 doctor disconnected、Socket absent；独立 Profile 正常退出后完整备份；通过真实 Chrome 扩展管理 UI 移除/重装相同实际 ID；出现真实原生许可提示并点击允许，保留 PNG/AX；doctor connected。此前仅 permissions.remove 再 request 被 Chrome 自动恢复历史许可，不计原生提示 PASS。

已观测前候选 SIGTERM 退出并清理 Socket，真实可信按钮重连到新 Host、新 inode；原 harness 错把 doctor disconnected 的退出码当作异常，保留失败，修复 harness 后最终候选需重验。其他任务持有 `com.opendesk.desktop` GUI 单实例；不停止其进程、不修改 App ID。

最终候选 SHA/包/安装/Run 身份与验收结果待填写，当前 **NOT_ACCEPTED**。尚无95+评分依据。
