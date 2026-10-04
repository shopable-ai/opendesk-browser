# K1：Allow User Scripts 历史信号有界诊断与合同差异提案

状态：**BLOCK；提案未生效**。只诊断 `F1-PAGE-AUTH-CSP` 的开关历史反例，未修改产品、fixture 机制、公共 gates 或冻结方案。round4 批准不是 F1 通过；round5 control SLO 修正与此缺陷独立。

原页面候选 `2edcc1b0ca37f22a21105255cf90a02f1fa1b4a6e72081fa23d816708ee3a036` 保持不变。本次新增诊断源码 `probe-switch-history.mjs`，诊断候选 `0726cdf8e49880f9c516f95f48b35f273d9e0204749174bd1a3cf35bc2f5a576`，不能作为合格页面候选。

正式数据：[diagnostic JSON](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prototypes/user-scripts-v2/m5-bounded-diagnostic-k1-2026-10-02.json)。完整原始输入、UI 截图、actual/effect/delivery/cleanup、binary hash、OS、完整版本、extensionId、fresh profile、document/world 及源码快照见 [20:42 report](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-switch-history-2026-10-02T20-42-10-638Z-4f8e3ea3/report.json)；[evidence manifest](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-switch-history-2026-10-02T20-42-10-638Z-4f8e3ea3/evidence-manifest.json) 冻结文件摘要。

## 实际反例与已排除范围

138.0.7204.183、154.0.8037.92 各在独立 fresh profile 操作真实 Chrome UI；没有 `fixture.recheck`、injected fence、假 revoke flag 或 profile prefs 改写。两 world × pending/native-completed × 两版本，共 **8/8 原合同 False**：同 host/doc OFF→ON 后旧结果仍被接受，各旧操作仅结算一次；4 个 pending 的原生调用在 OFF 期间完成，仍返回有效 typed payload。已发出的页面 effect 可以完成，开关并未提供自动取消证据。

| 原生候选信号 | 两版本实测 | 结论 |
| --- | --- | --- |
| 不匹配实际 URL 的固定 `void 0` registry marker | ON 后 registry 与原值同 hash | 排除本 marker 作为历史 witness |
| 独立 world configuration | ON 后配置同 hash | 排除本配置作为历史 witness |
| 缓存 namespace / getScripts 引用 | 引用相同；调用可用性 true→false→true | 提供当前可用性，不能区分中间历史 |
| USER_SCRIPT / MAIN 实例 marker | 两者均保留 | 两 world 分别排除，未用一个推定另一个 |
| user-script port | OFF 期间仍 echo，未 disconnect | 排除本 port 作为历史 epoch witness |
| host document/timeOrigin、已监听事件 | host 未重建；本次监听未捕获 switch 事件 | 无可用历史信号；不能冒称所有 API 均已排除 |

已监听范围仅 `permissions.onAdded/onRemoved`、runtime `onInstalled/onStartup/onSuspend/onSuspendCanceled`、document `pageshow/pagehide/freeze/resume/visibilitychange`、port message/disconnect，以及实际 namespace/API、registry/config 和 host context 读取。120ms 观察窗口仅记录本次诊断，不是任何最短 OFF 时长保证；不继续扫描全 SDK/API。

每版 **12 次实际 userScripts.execute**：4 次实例诊断、4 次旧操作、4 次恢复后新操作。旧操作错误接受与新操作成功分账，不计为 12 个合同成功。所有原生记录独立于 adapter prevalidation/diag；本轮资源 pending/barrier/timer/rawPending 均归零，marker/config 已撤除，浏览器/服务器已关闭，6 个本次诊断 profile 已清理。

**OFF 新原生调用拒绝已有直接证据**：保留的 R4 两版 `raw-injections.json` 索引 56/61，分别 USER_SCRIPT/MAIN，`apiInvoked=true`、`executeType=function`，原生报 `userScripts.execute` 不可用；对应 `*-SWITCH-REVOKE-INFLIGHT.actual.ui.after=false`，新调用 effect `postRevoke=null`。这 4 条证明 API availability，不采用同记录中 runner recheck 对旧 pending 的 fence 作为机制证明。实际引用及原始输入/结果保存在正式 JSON。

本轮两版 OFF 时 `permissions.getAll()` 与 ON 前完全相同，origin grants 仍在。相对地，保留的 [Architect 独立 site probe](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/independent-evidence/2026-10-02T20-08-55-875Z/report.json) 有 4 个真实 site revoke/restore 对照：未调用 runner recheck，旧结果仍被 `permissions.onRemoved` fence 拒绝。这些对照不证明 ownGrant 产品实现，也不消除 switch 的 8 个失败。

官方版本源码的 `UserScriptManager::SetUserScriptPrefEnabled` 切换脚本来源可用性；`ExtensionUserScriptLoader::SetSourceEnabled` 保留注册信息，ON 时重新加入；154 renderer 更新当前允许状态与 bindings。见 [138 loader](https://raw.githubusercontent.com/chromium/chromium/refs/tags/138.0.7204.183/extensions/browser/extension_user_script_loader.cc#L670)、[154 loader](https://raw.githubusercontent.com/chromium/chromium/refs/tags/154.0.8037.92/extensions/browser/extension_user_script_loader.cc#L684)、[154 dispatcher](https://raw.githubusercontent.com/chromium/chromium/refs/tags/154.0.8037.92/extensions/renderer/dispatcher.cc#L1304)。[官方 API 文档](https://developer.chrome.com/docs/extensions/reference/api/userScripts) 描述 138+ 已有 context 缓存 namespace 与当前调用可用性的区别。源码快照/URL/hash 已保存；138 dispatcher 超时、154 idl 404 如实保留，不依赖其缺失来推断。上述证据不证明所有可能浏览器信号均不存在。

## 最小合同差异提案（等待受影响范围独立复核）

原 `F1-PAGE-AUTH-CSP.expected` 原样保留：

> real browser UI change confirmed by actual permission/API+mutation negative controls; new operations reject while revoked; pending effects may occur but old result fenced; restore only after actual revoke; no permissions.remove required workaround false proof

提议只细分这条合同中的 **Allow User Scripts 历史保证**，不修改冻结 case 文件：

1. Chrome Allow User Scripts 是 `userScripts` **当前 API availability gate**。OFF 新原生调用拒绝；不能据此称 origin permission 或工具 ownGrant 已被撤销，也不能声称已发 native effect 自动取消。
2. 真正 site/origin grant 撤销、目标 document 失效、ownGrant 撤销仍必须 **monotonic fence**：旧请求终态不可重新打开；恢复只允许新授权代次的新操作。此要求不缩窄，ownGrant 产品实现本轮未放行、未实现或实测。
3. 操作自身若通过原生 API 实际观察到 OFF，可 latch 旧操作失效并拒绝旧结果；ON 不得清除此 latch。此机制目前 **未实现/未验证**，不能采用测试注入 fence；若边界获准，须由 host 操作生命周期接管实际原生失败/权限/document 事件，并以无 runner recheck 的受影响用例证明。
4. 同 host/doc 内 **未被操作生命周期观察到的 OFF→ON**，当前已查原生信号无法保证取消旧 native 结果；此一历史保证拟列为明确兼容限制。当前读数恢复 true 不证明授权连续，周期轮询不提供完整历史证明。已发 effect 可能完成，不能声称自动撤权或撤回 effect。

保留 **48 成员、183 SDK、63 resources 及其他冻结分母的全部原条目/合同**；code/file、精准 doc、typed/raw、CSP、真正 site grant/doc/ownGrant 的原要求不变。8 个失败与两份独立反例、旧四 raw FAIL 和 required host remove FAIL、原 expected/批准 hash/候选 hash/范围差异理由全部保留，不删 case、不改 PASS。

差异理由：已查原生状态在 OFF→ON 后恢复相同，不能支撑原历史保证；仅改 runner 或轮询会再次隐藏反例。v5 第 240 行要求新增/排除/条件缩窄记录差异与理由，经受影响范围独立复核并保留原分母；该路径允许提案，未授权本 lane 修改 scope/gates。

后续顺序：**受影响范围 Architect → Critic 独立复核差异 → 明确放行该范围实现 → 受影响实际复测 → F1 功能独立 review**。在完成这些步骤前保持 BLOCK；若原不可观察历史保证必须保留，则此实现仍不合格，不推进 backend/F2 或 K2 产品。
