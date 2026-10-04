K1 final source SHA256：`711f26eb86374be69617a8c638ba3736cf27c96b3bff437def5c8f37681a28d1`。批准的 round5 execution contract：`a9c47c0e20d8bb5710fead199fc197ac98d3bc098dc3d96f2a719ed50b50651b`。

138.0.7204.183 与 154.0.8037.92 在两个独立 fresh profile、同一冻结源码上完整运行，各 46 PASS / 0 FAIL，无 fixtureFailure。43 项原矩阵加 3 项每次物理终止后的真实新控制调用；按 status 字段统计。此交付是作者实测，待主执行联合冻结并独立功能/code review；backendPrototypePassed/F2 保持 false。

| 浏览器 | STOP destroy/absence/physical observed (ms) | DEADLINE 同上 (ms) | HOST-CLOSE 同上 (ms) |
|---|---|---|---|
| Chrome/138.0.7204.183 | 2006.622 / 2054.934 / 2428.519 | 2005.428 / 2055.257 / 2426.956 | 6.188 / 161.569 / 559.611 |
| Chrome/154.0.8037.92 | 2003.098 / 2024.090 / 2328.993 | 2004.465 / 2014.720 / 2320.674 | 9.082 / 165.455 / 517.320 |

本次源码变更范围是原 K1 fixture/runner：run-native.mjs 的 round5 单调时间/因果 oracle 与输出前缀、run.mjs 的 contract hash/诊断目录、host.js 的 due/fired/准入关闭单调时间；原 lane 之前的 sandbox/sw/worker-harness 私有通道、资源和真实身份修复已保持。manifest.json、产品 src、共享浏览器、公共 gates 和其他 lane 未由本 lane 修改。

因果链在 user body 执行前持有 held barrier：真实 Worker 自身 Blob URL/name/null-origin 私有握手，继而原生 TracingSessionIdForWorker 的 URL + workerId 与 targetId 精确相同，pid/workerThreadId 确定 CPU 测量对象。Page.frameAttached 绑定 creator frame 与本 host 的 parent frame；同一 PID/frame 的原生 sandbox FunctionCall 确认 creator。没有用最高 renderer CPU 猜对象。循环创建前到销毁都没有 Worker 或 creator sandbox Inspector session。

单调时间按三次 host/runner 往返校准，保留每次上下界与 0.2ms quantization 余量；以最早可能的真实 trigger 作保守计时。deadline due/fired、实际 stop、host-close 发送时点均记录。两次 150ms 的 post CPU 区间验证持续静止；null 样本保留 null，仅当独立 OS ps 确认该已因果绑定 PID 在 3s 内退出才以生命周期证明停止。原生 targetDestroyed 与独立 absence retrieval 都用原始单调观测时间，后续取回 trace 不重置时钟。STOP/DEADLINE 的 old2sContractStatus 仍 FAIL；119 个旧 round4 artifact 的完整字节 SHA 未变，原失败不改写。

完整链包括 BaseAlice、async/await/类型/错误/取消、private peer/replay/run-epoch/rebind/global patch、有效 Worker CSP 日志和服务器 HTTP/WS 正负归因、stop/deadline/host-close、各 5 次 success/throw/timeout/cancel、SW 停止/唤醒和 private port/host epoch 重连。权限由原生 extension UI 截图与 permissions.getAll/contains 记录（headless WebUI；userScripts UI revoke/restore 为另一冻结 page lane 的维度）。

MAIN 有唯一原生服务器 POST entered（实际 documentURL）与 CPU 增长后才退休明确 owned tab；借用 sentinel 的 owned=false/拒绝退休/dispose 后仍存在均实证。最后由创建 sentinel 的 runner 回收；仅声明 owned-tab 退休，不声称 MAIN 可通过 Worker.terminate 打断。

资源方面，20 次操作后 per-run Worker/port/Blob/probe 实际为0、独立 native Worker targets 回到空基线、DOM waits/pending/timer 回基线；相同 worker-src 下固定 harness 正向加载成功，再尝试实际已 revoked URL 得到真实 Worker loader 错误。loader 直接采样当前 opaque realm 的退休 URL及正向 URL，旧 realm 通过实际退休/target lifecycle 释放，不把 fetch 的 CSP 错误当 URL 撤销。保留 host-owned port/frame=1 的运行基线；最终 dispose 的 pending/timer/port/frame/pageWaits/resourceReplies 全0。

两个最终 browser exit0，serverClosed=true、CDP waiters0、aborted requests0；final-cleanup-audit.json 确认本 lane 所有 round4/round5 profile 的 browser PID/进程组均无存活。20:53 第一项 oracle 准备失败（timerDue 元数据变量位置）与 check2 定向复测都保留在各自新目录；本次两个 final runs 从完整启动到清理成功。

原生 trace 使用 [Chrome DevTools Tracing 协议](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/) 的浏览器级 start/dataCollected/end；未使用 Worker Debugger.attach、Profiler 或 V8 CPU profiler category。run.mjs 的 Playwright 路径仅为诊断，本次资格证据来自 run-native.mjs。

完整原始输入、expected/actual/effect/delivery/cleanup、binary hash/OS/version/extension/profile/document/world、Trace/Protocol/UI 图像在 final-evidence-manifest.json 中逐项以路径与 SHA256 绑定。主执行拥有最终独立资格与联合候选冻结。

逐项合同/条件、两版对应 caseIds、原始 JSON 路径和未直接执行的观测边界见 final-contract-mapping.json；AFTER-TERMINATION 三项已在每版46项中完成，不再修改源码或重跑。
