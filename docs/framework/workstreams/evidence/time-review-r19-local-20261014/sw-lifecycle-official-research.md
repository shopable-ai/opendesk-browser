## Research: Chrome 155 MV3 自然休眠与恢复

### Request Type

Comprehensive research：官方生命周期、CDP 行为与最小原生验法。结论来自外部文档和 Chromium 源码；未检查本地驱动、未执行浏览器验收。

### Direct Answer

**Browser 级 CDP 连接可以保留；关键是没有 SW attachment，也没有持续触发 SW 的业务活动。`0.5min` heartbeat alarm 不保证出现可观察的自然休眠窗口。`Target.closeTarget` 只能证明强制停止后的恢复。**

| 行为 | 对自然休眠的影响 |
|---|---|
| Browser WebSocket 连接、`Browser.getVersion`、`Target.getTargets`、`Target.setDiscoverTargets` | 属于浏览器信息/目标发现，不等同于附加 SW；可作为最小观察面，但须确认客户端没有隐式 auto-attach。[CDP Target](https://chromedevtools.github.io/devtools-protocol/tot/Target/) |
| `Target.attachToTarget` 指向 SW；auto-attach 覆盖 SW；打开 SW DevTools | 会附加调试器，抑制正常 idle 停止。**即使不执行任何 Runtime 命令也会污染测试。**[官方调试说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug#debug_the_service_worker) |
| SW 上的 `Runtime.evaluate` / `callFunctionOn` | 需要 SW 调试会话；不适合在自然休眠窗口中探测状态。 |
| 扩展事件、SW 中的扩展 API 调用、实际 RPC 消息 | 重置 idle 计时；停止 Time RPC 只是必要条件之一。[生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) |
| SW 持有 `runtime.connectNative()` 连接 | 官方明确会保持 SW 存活；仅停止消息发送不足以解除这一条件。外部原生驱动进程仍在运行，本身不等于这种连接。[生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) |
| 长连接消息、SW WebSocket 收发、offscreen 消息 | 可延长生命周期或重置计时；普通 port 仅打开与持续发送消息须区分。[生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) |
| `Target.closeTarget`、`ServiceWorker.stopWorker` | 主动停止，不能登记为自然休眠。 |

**0.5min alarm 的准确判断：**创建一个未来 alarm 不是永久 keepalive，但每次 `onAlarm` 都是扩展事件，会重置计时。周期与 30 秒 idle 阈值重合，加上 handler/API 工作和调度延迟，可能持续运行，也可能短暂停止再醒来；两者都不能预先保证。官方允许 alarm 任意延后，unpacked 扩展还存在频率限制例外，因此不能用“等待 31 秒”或“alarm 周期是 30 秒”推导已休眠。[alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)

### Supporting Examples：现有 Time Review 驱动的最小策略

以下是验收建议，不是已执行结果。

1. **建立无侵入观察。**复用现有 Browser CDP 连接，启用 Target discovery，按真实扩展 ID、SW script URL、browser context 过滤。确认 SW `attached:false`，并确认所有相关客户端都没有 SW auto-attach。不要创建 SW session 来读取状态。

2. **记录真实静默边界。**完成最后一次正常操作及其回执后，以驱动侧单调时钟记录 `t0`。静默窗口内停止 Time RPC、状态轮询和会触发 SW 的 UI 操作；排除持续 native-messaging port、周期消息及未完成工作。**从最后一条已观察到的 RPC 算起，只能作为静默下界，不能假定它就是最后一次内部 API 调用。**

3. **等待真实停止，而不是等待一个数字。**被动记录 target 事件。若现有驱动已经具备普通 page 会话，可考虑在那里启用 `ServiceWorker.enable`，接收匹配版本的 `workerVersionUpdated.runningStatus`；不 attach SW，并禁用相关 auto-attach。该 handler 需要 renderer/storage-partition context，不能假定 Browser 根会话支持它。[Chrome 155 handler 源码](https://github.com/chromium/chromium/blob/3ff7ac5a9224be9156d7f8703a06e22890aafd34/content/browser/devtools/protocol/service_worker_handler.cc)

   最强状态证据是明确的 `running → stopped`。仅有 `targetDestroyed`/target 消失，须同时排除 crash、扩展 reload/update、浏览器退出和主动停止；**事件本身没有说明 idle 原因，target ID 是否变化也不是恢复的硬门槛。**

4. **分开验证两条恢复链。**
   - **Heartbeat：**已经观察到停止后，继续完全被动等待真实 alarm；观察重新 running，并在窗口结束后通过现有正式入口核对真实业务结果。
   - **Real event：**另一次已确认停止后，由现有原生输入触发正常产品事件，核对重新运行及其业务结果。
   
   Heartbeat 恢复后再点击，不能证明点击从休眠唤醒了 SW。也不要用 `ServiceWorker.startWorker`、模拟 dispatch、API/storage 注入或时间改写替代上述链条。

5. **结果分别登记。**
   - 自然停止状态证据＋无干预时间线＋真实 heartbeat 恢复：自然休眠/heartbeat 恢复证据。
   - 自然停止状态证据＋真实事件恢复：自然休眠/事件恢复证据。
   - `closeTarget` 后恢复：强制停止恢复证据。
   - 只有等待超时、target 快照或业务成功：自然休眠 **NOT_TESTED / 证据不足**。

**若原候选始终启用 0.5min heartbeat，最小策略是保留原配置、被动捕获实际停止；捕获不到就保留证据不足。**若产品已有正式配置可以延长周期，可另测该配置，但不能把它提升为原 0.5min 配置的通过证据。

### Official Docs Evidence

- [SW 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)：30 秒 inactivity、事件/API 重置、native messaging 与其他延寿条件。
- [Debug extensions](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug)：检查 SW 会使它保持活动。
- [alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)：30 秒最小周期、非精确调度及 unpacked 例外。
- [CDP Target](https://chromedevtools.github.io/devtools-protocol/tot/Target/) / [ServiceWorker](https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/)：discovery、attachment、主动控制与状态事件的区别。

### Version Note

检索日为 **2026-10-14**。官方 CFT 数据（时间戳 2026-10-13）列出 Stable **155.0.8059.39**；对应 Chromium tag commit 为 **`3ff7ac5a9224be9156d7f8703a06e22890aafd34`**。实际验收仍须记录驱动连接的完整版本，不能用该列表替代本机身份。[CFT 数据](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json)、[版本 tag](https://chromium.googlesource.com/chromium/src/+/refs/tags/155.0.8059.39)

### Source-Reference Evidence

补充源码用于确认文档未细述的 CDP 边界，均固定到上述 Chrome 155 SHA：

- [SW agent host](https://github.com/chromium/chromium/blob/3ff7ac5a9224be9156d7f8703a06e22890aafd34/content/browser/devtools/service_worker_devtools_agent_host.cc)：attachment 设置 `SetDevToolsAttached`；`Close()` 调用 `StopWorker()`。
- [EmbeddedWorkerInstance](https://github.com/chromium/chromium/blob/3ff7ac5a9224be9156d7f8703a06e22890aafd34/content/browser/service_worker/embedded_worker_instance.cc)：`StopIfNotAttachedToDevTools()` 在已附加时返回，跳过停止。
- [SW DevTools manager](https://github.com/chromium/chromium/blob/3ff7ac5a9224be9156d7f8703a06e22890aafd34/content/browser/devtools/service_worker_devtools_manager.cc)：存在 stopped-host 保存/复用路径，不能把新 target ID 当成恢复的唯一标准。

### Reusable Takeaway

**保留 Browser CDP，被动观察真实 stopped，再分别等待真实 heartbeat 或触发真实事件。30 秒是生命周期阈值，不是固定秒点的验收承诺；0.5min alarm 使休眠窗口不可靠，强制关闭不能补成自然休眠 PASS。**官方证据已足以确定这一策略；现有驱动是否隐式 attach、是否持有 native port，以及候选是否实际休眠，仍属于原生验收事实。
