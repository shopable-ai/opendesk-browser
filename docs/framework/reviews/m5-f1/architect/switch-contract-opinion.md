# Allow User Scripts 边界修订前置意见

**可以提交受影响条件修订供正式独立评审；当前 F1 仍 BLOCK。未批准任何新候选。**

[v5 第239行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prompts/goal-migration-v5.txt:239) 明确允许记录理由、保留原分母/历史并经受影响范围独立复核的条件缩窄。因此可讨论的最小差异是：**操作未观察到的浏览器 Allow User Scripts OFF→ON，不承诺追溯取消已派发旧结果**。这不是把整个开关从安全边界删除；浏览器开关仍是用户对原生 API 入口的访问授权。区别仅在它未提供框架可消费的持久历史 epoch。

已独立读 witness 报告、完整137行 probe及对应快照，核验23个证据文件和8个源码快照，无 hash mismatch。报告 SHA 为 `5a39c45d8db035ad13bb1106689699274d695b4dccc5b481193e722d4f5a1e4c`，诊断候选为 `0726cdf8e49880f9c516f95f48b35f273d9e0204749174bd1a3cf35bc2f5a576`。两实际版本共8项旧 expected 的 contractMet:false；namespace/method、恢复后的 registry/worldConfigurations、两 world marker 保留，OFF 时 USER_SCRIPT Port 仍 echo 且无 disconnect，已监听事件与 permissionEvents 为空。[报告](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-switch-history-2026-10-02T20-42-10-638Z-4f8e3ea3/report.json) 支持这些路径无可用历史信号，不能证明所有可能原生侧信道都不存在；我没有可指出的可靠同后端修复。

可提交的边界必须同时满足：

- OFF 拒绝新 userScripts 调用；原生负对照保留。不得用 scripting/eval fallback、自动重放或新增权限绕过。接受结果前仍做原生当前可用性检查，不宣称它与浏览器开关原子同步。
- 操作自身实际观察到 OFF/API rejection 后持续作废旧结果，ON 不复活该操作；不能由 runner/recheck 或诊断探测人为写 fence。polling 只能证明已观察到的区间。
- origin permission、框架 own explicit grant、取消/deadline、精确 document/host/session/lease 失效仍须 fence；再授权不能恢复旧 epoch。未观察到的开关瞬变只在上述真实 authority/身份均未失效时落入限制。
- 两 world、code/file、全部48 API及独立 SDK 服务/资源保留。固定打包 SDK/relay 不新增对该开关的依赖；72/191/184/48/603原分母及稳定ID保留。

正式差异必须写明 [旧 F1 expected](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-5/candidate/stage0/f1-cases.json:284) 的“所有开关撤回都 fence”如何缩窄，并列出影响调用链、EX01/EX04/AUTH01、用户可见限制及未变化的真实授权边界。保留旧 expected、8个 false、既有 native/required-remove FAIL 和计数/hash；版本化新 expected，不能删除/skip旧用例或改旧结果为 PASS。原603基线、当前批准修订及追加 cases 分开记账。

建议新增的具体形状（尚未注册或批准）：

| 场景 | 新验收谓词 |
|---|---|
| OFF 新调用、ON 新操作 | OFF typed 拒绝且未 dispatch；恢复后新操作正常 |
| 操作自身观察 OFF，随后 ON | pending/native-completed 旧结果均持续拒绝，不由测试写 fence |
| 未观察瞬变 | 诚实保留旧 false，记录无历史回执和实际结果；只在当前授权/身份/lease有效时允许收回结果，不能称旧 fence 已实现 |
| origin/own grant 撤回再授权、doc失效 | 每种真实撤回的旧结果仍拒绝；两个 world、两版本、两 pending 阶段均验证，下一合法新操作正常 |

“把所有撤权都叫 availability”、忽略 OFF、关闭借用页、削减 API/SDK、用 poll interval 保证全部快速瞬变，均不可批准。这里没有要求额外一次泛化真人确认的原文依据；本消息仅授权给意见，不能视为合同已采纳。应按 [v5 第272行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prompts/goal-migration-v5.txt:272) 提交明确正式新候选，先同 hash Architect→独立 Critic，再运行新批准合同的真实 F1。最终两 lane frozen union 的12合同独立验收前，backend/allF1PASS/F2/F3均不放行。
