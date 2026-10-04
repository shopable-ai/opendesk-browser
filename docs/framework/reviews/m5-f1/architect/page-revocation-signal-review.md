# 页面撤权信号真实性补充复核

**BLOCK 保留；尚无新解法可审批。** 当前 runner/host/adapter 三个 hash 仍与被拒绝的页面候选 `2edcc1b0ca37f22a21105255cf90a02f1fa1b4a6e72081fa23d816708ee3a036` 一致。没有补跑完整矩阵，也没有写作者 fixture。完整源码下载 hash、行号、推断边界在 [JSON](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/page-revocation-signal-review.json)。

独立核实两个 exact tag：公开 userScripts schema ([138](https://raw.githubusercontent.com/chromium/chromium/refs/tags/138.0.7204.183/extensions/common/api/user_scripts.idl), [154](https://raw.githubusercontent.com/chromium/chromium/refs/tags/154.0.8037.92/extensions/common/api/user_scripts.webidl)) 均没有开关事件、授权历史或单调 epoch。Chrome [官方说明](https://developer.chrome.com/docs/extensions/reference/api/userScripts) 描述当前可用性检查，OFF 后已缓存 namespace 仍可能 defined、方法会拒绝，undefined 状态需 context reload 才重置。这没有承诺公开历史事件。

浏览器原生路径确有状态传播：[138 SetUserScriptPrefEnabled](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/native-signal-evidence/138.0.7204.183-user_script_manager.cc:157)、[154](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/native-signal-evidence/154.0.8037.92-user_script_manager.cc:130) 更新 allowed 布尔值、动态 script source 并通知 renderer；[138 helper](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/native-signal-evidence/138.0.7204.183-renderer_startup_helper.cc:418)、[154 helper](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/native-signal-evidence/154.0.8037.92-renderer_startup_helper.cc:552) 发 SetUserScriptsAllowed IPC；dispatcher 更新当前状态/bindings。所核路径没有发送给普通扩展 JS 的公开撤权历史事件。内部 IPC 不能直接当成现有后端可订阅的产品信号。

绑定更新也不等于 API 对象发生单调世代变化。[138 GetAPIHelper](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/native-signal-evidence/138.0.7204.183-native_extension_bindings_system.cc:834) 与 [154](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/native-signal-evidence/154.0.8037.92-native_extension_bindings_system.cc:962) 返回 per-context 已实例化缓存对象。因此仅比较对象/函数引用不足以证明撤权 epoch。原生确会重设 lazy bindings；若作者主张使用描述符、Port 或 sentinel 等可观察副作用，仍须给出精确版本源码、持续性与真实 UI/因果实证，不能由“有 bindings 更新”推成可靠回执。本复核不声称穷尽所有潜在原生侧信道。

轮询的最强反例很具体：t0 和 t1 两次原生可用性观察都为 ON；一种历史始终 ON，另一种历史在两次观察之间 OFF→ON。没有持久历史证据时，两者对 poll-only observer 相同。任意固定 poll interval 都不是最大观察间隔，host 任务暂停、原生回复延迟及进程暂停还会扩大盲区。加速轮询、等待 UI 稳定或测试一次长 OFF 不能证明所有 interval。已有 [四项真实开关反例](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/architect/independent-evidence/2026-10-02T20-08-55-875Z/report.json) 保持有效。

目前可证明的较窄边界是：操作自身实际观察到 disabled/API rejection 后，持久作废旧结果，恢复也不清除此 fence；真实权限事件可支持相应 host-origin fence；真实 incarnation/document 变化可否定旧身份。当前检查只证明检查时授权状态，不能证明自 dispatch 以来一直授权。这个边界**未获得合同修订批准**，不能替代 [F1-PAGE-AUTH-CSP](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/stage0/f1-cases.json:284) 的真实撤权旧结果 fence。

新解法必须去除 runner 主动写 fence，让操作自身消费真实浏览器证据，并在两个版本、两个 world 的 native pending 与 native completed/acceptance-held 场景证明恢复后旧结果拒绝。还需覆盖恢复发生在下次采样之前、host 任务延迟、下一有效操作及清理；测量 UI/API 状态不能修改接受状态。如果不能产生可靠的持久信号，保留 BLOCK 并明确报告限制，不能默许 polling 覆盖所有 interval。

round-5 Architect 顶层别名已规范化为 candidateManifestSha256=candidateSha256，independent=true；96/100 APPROVE、零 blockers 未改。该方案结论与页面功能结论分开。最终 union 尚未冻结，backend/allF1PASS/F2/F3 仍未批准。
