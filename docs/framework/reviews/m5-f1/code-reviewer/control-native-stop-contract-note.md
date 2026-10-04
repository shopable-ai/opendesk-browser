# 独立补充意见：原生 Worker 终止与 F1 的 2 秒门禁

**当前合同下仍为 REQUEST CHANGES；合同修正建议为 COMMENT，未批准。** 无最终 control 或两 lane 联合冻结 hash。旧 STOP/DEADLINE `<2s` 失败保持原样，不能以新阈值重标。此意见只处理用户指定的终止证据和门禁冲突，不接管架构 lane，也不改任何合同、gates 或账本。

## 合同与版本源码

批准的 [F1-CTRL-TRUE-TERMINATE:103](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/stage0/f1-cases.json:103) 要求真实 loop entered、admission closed、独立 Worker gone/CPU execution stopped within test 2s、host responsive、no late action，并保留旧失败。输入明确要求真实 `while(true){}`、正确 run/Blob/host 以及无 debugger 干扰。[v5:146](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prompts/goal-migration-v5.txt:146) 把真实 CPU 终止列为未闭合项；[v5:159](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prompts/goal-migration-v5.txt:159) 禁止用调用 terminate、心跳等代替证明，也禁止自动换后端。冻结 [test-spec:29](/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/test-spec.md:29) 将 2s 说明为测试阈值，未给普遍浏览器规范保证。

已直接取官方 Chromium 镜像的两个精确 tag，核对文件字节和调用链，完整 hash/行号在相邻 JSON：

| tag | worker_thread.cc SHA256 | 关键行 |
|---|---|---|
| 138.0.7204.183 | `7c989d222ed648eaf8650b7ce2f3d9ec4ab5b83e739ccb6788d7d667c5d0961e` | 82 常量；262 Terminate；532 延迟任务；568 强制中断 |
| 154.0.8037.92 | `f5e2a985450beea9dde7c0045654f789e22c38c43339c83292c364b1431e3a84` | 84 常量；265 Terminate；514 延迟任务；551 强制中断 |

两个 tag 均为 `kForcibleTerminationDelay = base::Seconds(2)`。普通 Terminate 安排关闭任务及父线程延迟任务，后者才调用 V8 强制中断；不是同步结束。`TerminateForTesting` 才走同步强制方法，它不是公开 Worker JS API。[138 worker_thread.cc](https://raw.githubusercontent.com/chromium/chromium/138.0.7204.183/third_party/blink/renderer/core/workers/worker_thread.cc)、[154 worker_thread.cc](https://raw.githubusercontent.com/chromium/chromium/154.0.8037.92/third_party/blink/renderer/core/workers/worker_thread.cc)

公开 DedicatedWorker.terminate → ThreadedMessagingProxyBase.TerminateGlobalScope → WorkerThread.Terminate 的链路也在两 tag 核实。DedicatedWorker.ContextDestroyed 调用相同 terminate，因此单纯销毁 iframe context 没有源码支持的同步绕过。[138 DedicatedWorker](https://raw.githubusercontent.com/chromium/chromium/138.0.7204.183/third_party/blink/renderer/core/workers/dedicated_worker.cc)、[138 messaging proxy](https://raw.githubusercontent.com/chromium/chromium/138.0.7204.183/third_party/blink/renderer/core/workers/threaded_messaging_proxy_base.cc)、[154 DedicatedWorker](https://raw.githubusercontent.com/chromium/chromium/154.0.8037.92/third_party/blink/renderer/core/workers/dedicated_worker.cc)、[154 messaging proxy](https://raw.githubusercontent.com/chromium/chromium/154.0.8037.92/third_party/blink/renderer/core/workers/threaded_messaging_proxy_base.cc)

**推断：** 对堵住自身任务队列的紧密 JS 死循环，现有普通公开 terminate 路径不能作为 `<2s` 保证。2 秒延迟再加父线程调度、消息与观测耗时，与严格门禁冲突。源码不是任意环境下 3 秒必停的规范保证，也不是实际 154 运行通过证据。

## 无 Inspector 的诊断核查

用户指定 [report-mock-keychain.json](/Users/shopme/Documents/workspace/opendesk-browser/tests/.cache/m5-worker-stop-diagnostic/report-mock-keychain.json) 的 SHA256 为 `3d88d523b1d9cff33bf13ca05746e5f588d1d6d13da63ed67540be6fbda5c8e3`。它自己明确标注 diagnostic only / not F1 qualification。实际 executable 是 138 CfT，独立 browser PID70423、opaque iframe；[diagnose.py:13](/Users/shopme/Documents/workspace/opendesk-browser/tests/.cache/m5-worker-stop-diagnostic/diagnose.py:13) 使用同 async-body `await page.mark(...); while(true){}`，17 行调用 terminate，39 行 OS ps 采样浏览器子进程累计 CPU。脚本没有连接 CDP/Debugger，启动时的 remote-debugging-port 标志本身不构成 Inspector attachment。

trigger payload t0=1790971965310ms；HTTP 接收 trigger 在 +1.847ms，terminate 调用返回通知在 +2.184ms。后者只说明 JS 调用返回。PID70456 的累计 CPU 在 +1925.16ms 为2.95s，到 +2075.88ms 为3.06s；+2231.90ms 及后续到 +3008.87ms 均为3.06s。因此存在约2秒附近的真实 CPU 持续执行及随后平台期，不能继续只解释为 target metadata 滞后。采样粒度、10ms CPU 表示精度与 ps 请求区间使精确停止时刻只能用区间说明，不能把“2.07s”当精确完成 timestamp。

本报告保存全部31个采样的有界 renderer CPU 摘要，但没有重跑该诊断。该 HTTP 脚本、版本源行为和已有 STOP/DEADLINE CPU 增长共同支持原生延迟的解释；它缺少正式的 exact Worker→PID/线程绑定、无loop负对照、完整采样请求/返回区间，不能独自完成 F1 资格。其记录 harness hash 为 `acef8dd9b9b1e7c5b7fc88eebf42213e150110b71a945d85655d5ca06958ac84`，复核时作者当前文件已为 `630ab92f6a629d8027d11c0f47c0b5c21a2c60f86a6d859b8ef0d78cabcd39ee`。这是非冻结作者文件已更新的事实，未认定篡改；最终必须有实际运行源码快照与候选绑定，不能把这个历史 report 冒充当前源证据。cleanup 记录 browserExit=0、serverClosed=true，未把这些计数代替终止证明。

## 最小合同修正建议：固定 3,000ms，另行正式审核

我的独立建议是提交明确修正候选。只将 F1-CTRL-TRUE-TERMINATE.expected 的 `within test 2s` 改为：

> within test 3000ms measured from the actual stop/deadline/host-close trigger, including native termination grace and observation uncertainty

其余原句保留。该候选确实放宽延迟测试门禁，**不能解释成旧2s合同本来允许3s**。3,000ms 是建议的固定测试预算：给已核实原生2s grace 留1s调度/观测空间，不是根据某次最大值动态改期望；不是 Chromium 的硬时限，也不是已证明两版合格。提交者应在修正候选中逐一列出对应 test-spec/计划的时间描述及 oracle 常量，消除同一候选内部2s/3s矛盾。不得修改 v5 的真实死循环终止要求。

支持机制保持：任意用户 async-body 和真实紧密 while-loop，stop/deadline/host-close 三触发，138与154，当前非特权 Worker 后端，既有 opaque/private RPC/CSP/权限边界。不得插入 yield、重写成合作取消、用别的 host-close PASS 替代 stop/deadline、缩小版本、增加 Debugger/权限/后端。即刻关闭准入、丢弃旧 run 结果、阻止新 action 的要求也不改；原生 grace 内已有外部副作用仍按原设计不能倒退撤销。

修正候选须包含修订文本及 diff、冻结 manifest/hash、原失败证据、精确版本源码引用、明确的固定 oracle 和观察方法，交真正独立正式候选审核。批准后另跑新候选的相应必要实证，原2s报告保持 FAIL，不就地改为 PASS/skip；新记录明确标出合同版本和新候选 hash。全部12条 F1 及总体结论仍必须绑定用户提供的同一最终两lane联合候选。此意见不构成修正候选 APPROVE，更不构成 allF1PASS。

如果仍坚持原2s：本复核没有发现能在同公开 Worker 机制中立即强制 V8 的可执行最小修复。当前作者 [host.js:23](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/fixture/host.js:23) 已尝试 owned iframe remove/rebind，不能再把它当未验证的万能解。host-close 的13ms结果是不同触发/资源销毁条件；关闭整个 host 不能直接替代需要继续响应的 stop/deadline。任何 proposed owned-process/realm retirement 都须先证明真实停止、既有 owner 范围、无 borrowed target 误销毁与存活 host/RPC，在此没有这种证明；不能承诺它消除2s grace。

## CPU 路径与当前作者 oracle

原合同的 Worker gone/CPU execution stopped 允许 CPU 证明路径，但最大增量 renderer、delta>0.1、单一150ms afterCPU0不构成因果绑定或永久停止证明。至少需要 exact run/Blob/host 对应进程/线程生命周期，或有独占活动来源、前后和无loop对照的严密隔离差分；带请求/返回时间与跨时钟误差的累计 CPU；loop活跃正对照、重复停止后观测、缺失进程的独立退出事实；真实t0与host准入/fence位置；末尾真实target退出及资源清理。目标最终销毁可佐证退出，不能倒推早于 deadline 的 CPU 停止。

复核末次读取的非冻结 [run-native.mjs:132](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-control-v2/run-native.mjs:132) 快照 hash 为 `224945843c0e145172c7c45be099d4f6c627bea05f70511f14c9beda8a82b163`：172 行现改回 targetDestroyed ≤2s 的 gate，155 行最高增量仍仅说明进程忙；169 行缺失PID记0目前是诊断字段，**不再称它是当前 PASS gate**。154 行优先 terminalTriggeredAt，但仍 fallback settledAt/started，必须按各触发实际位置审 timestamp，而非无条件接受。host 71 行在关闭 active 前取 terminalTriggeredAt、73 行发送 stop、77 行取 settledAt；trigger 是触发时刻，均非 terminate done。源码活跃变化，本意见只绑定这个读取快照，不对之后代码背书。

结论保持：旧 strict2s FAIL 不放行；若接受原生 grace 的有限延迟，则显式3,000ms合同候选先独立审核，再由真实同候选数据判定。页面独立 fence 阻断和 owned/borrowed 用户报告的新 FAIL 均不能由这项时间建议解除。

用户后续报告：主执行 round5 的3s小修订已获 Architect96 APPROVE，简称候选 a9c47，独立 Critic Hume 正审。此处按用户提供的进度记录，未将简称补成未核实的完整 hash，也未冒称本复核已经读到或批准该正式候选；未据此修改上述旧2s结果。无 backend 通过结论。最终仍等待新页面修复证据、control完整3s双版及用户给出的同一冻结联合候选，再做限定变更和全部12合同的同候选复核。
