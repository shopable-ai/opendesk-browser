# Dynamic App Runtime R1.4-LOCAL：真实运行记录

2026-10-22，Asia/Shanghai；证据中的 ISO 时间使用 UTC。

**当前可用：** 开发者通过原扩展中心导入含可选后台入口的 Sidebar Tool v2，审阅后打开 UI、调用 SDK、创建计划，关闭侧栏后执行隔离计算，再打开 UI 读取自己的结果。B2 上两个冻结后新应用已经完成这条真实 Mac Chrome 链路。本轮额外修复并原生验证了卸载不释放计划容量的缺陷。

**完成边界：** G-DYNAMIC 核心链和本次卸载修复 PASS；全部 15 条最终条件仍为 PARTIAL，不能标记完整验收完成。G-DECOUPLING 未完成；六维没有全部达到 95；商店合规为 RELEASE_POLICY_NOT_VERIFIED。B1 是历史候选，不能覆盖 B2 未测项。

## 本轮修复与实际用户操作

1. B1 真实 UI 创建计划达到原有 128 上限后，超额正确返回 E_LIMIT；但正式卸载临时应用后，110 条非 deleted 定义仍占名额，尽管 registry、owned storage 和 Alarm 已清除。原始失败：`artifacts/dynamic-app-r14-local/revoke-probe/uninstall-capacity-leak.json`。
2. 修复提交 `e47829d23d8a18f6a621f67717bd09ed68845341` 已普通推送 main。复用原 Scheduler/repository，将精确旧 owner 的定义 tombstone、取消未准入 Fire，保留历史 Run/Result。原 Installer 的持久清理日志与锁一直保留到原 Host 确认定义退役、Alarm 清除并读回；错误或回执未知时阻止同 ID 重装。原 Alarm 同步串行读取最新有效性和定义，避免旧快照重建 Alarm。未新增存储、Host、安装器或调度器。
3. B2 原生复验：初始 A/B 两条定义；通过 A UI 逐条创建 126 个远期计划并完成审阅，总数 128，第 129 个被拒绝 E_LIMIT。正式卸载 A 后，其 127 条定义逐一 deleted/paused、generation+1、nextDueAt=null；活动定义 128→1，A Alarm 全清。B 的定义、完整结果不变，A completed Run 与 Journal 保留，清理日志在成功回执后移除。
4. B 正式创建新计划并在侧栏关闭后执行，UI 读回新 nonce `b2-released-capacity`，Run `adb688b0-fb8a-43bc-a8cb-c850d55c9166` completed/Worker retired，原 SDK Journal durable。A 同包重新安装获得新 generation，严格普通链再次通过。
5. B2 运行中停用、恢复、升级 1.0.0→1.1.0 已实测。停用 Run `e13bc73d-b8f6-48d2-84ca-673a29b4743d`、升级 Run `6dd4c440-310c-4024-b975-c948482ce4bc` 均 stopped/E_TOOL_CHANGED、Worker retired；分别等待 31 秒，未见旧 nonce 迟到写入。
6. 新清理入口真实 SIDE_PANEL 负向请求：仍安装的 B 无 pending uninstall 返回 E_OWNER；额外 generation、runId、owner 返回 E_SCHEMA。B 的 registry、owned data、计划、Run、Journal 前后相同。这是明确的协议负面探针，不属于普通 UI 执行链。没有活跃 Offscreen，不能宣称真实 Offscreen sender 拒绝已测。
7. 同 Profile 完整 Browser 重启 PID 6354→15311，Extension ID 不变。升级 A 1.1.0 的预建计划恢复，UI 正确读回，Run `1388b561-5681-4264-bfbf-9fbc5bb03e32` completed，Result `8276a54f-2457-41a2-8da4-b54019355ab2` 成功，旧 127 条计划仍退役。**重启至首个观察样本存在空档，首样本晚于到期约 7 秒**；此证据证明重启恢复与结果，不替代严格普通链的全区间无瞬时 UI 监测。

上述原始记录集中在 `artifacts/dynamic-app-r14-local/b2-capacity/`、`b2-native/` 和 `lifecycle/b2-*`；长期精简摘要及全部 106 个构建文件 SHA-256 见 [b2-summary.json](../evidence/dynamic-app-r14-local/b2-summary.json)。

## B2 冻结与两个新应用

- 源码：已提交 main `e47829d23d8a18f6a621f67717bd09ed68845341`；从只读 main 快照与本轮精确修复构建，排除其他会话未提交改动。冻结后 main 的无关更新不冒充本候选源码；本轮相关 Runtime/SDK/Host/Scheduler 输入已逐项核对。
- 静态 production 目录：`artifacts/dynamic-app-r14-local/b2-review-source/dist/production`。冻结时间 `2026-10-22T00:20:34.320Z`，106 文件，构建包指纹 `209482c4ec66e71950c3325f84c28a0e5a6515dacddefb359ecc990986a28da8`。完整原始清单在目录外 `b2-files.sha256.json`；复核无新增文件、各文件哈希和字节数一致。
- Mac Chrome for Testing `156.0.8078.4`；真实 Extension ID `llgenebfpfbpmkeknbnpimjjjoihnofi`；仅使用本轮临时 Profile `codex-cft-r14-ymqrk2oo`，最近启动记录 `b2-browser-restart-launch.json`。未修改日常 Chrome、dist/development 或其他 watcher。
- A/B 均在 `2026-10-22T00:20:34.670Z` 创建新随机 ID 和源码，晚于冻结 350ms；扫描确认 ID 不在冻结构建中。独立算法计算 expected，安装前固定期望与身份。

| 应用 | 首次严格链结果 | RunId |
| --- | --- | --- |
| app-primes-423c62d375df | 10000 内素数 1229 个，和 5736396，末项 9973 | 2d1c4fd4-c36e-4e27-b8c6-1b7f9b6a8516 |
| app-words-b72b4bea7cec | 144 词、13 个不同词，checksum 1ae57e0d | 8b1f1001-ef61-474a-9968-cdd2a04e4e92 |

A 初次 1.0.0 Package Hash `953397dc16d3df76cefd8c09e81a834e6003f3a1df4012bcb777bd8ca76a5a71`；后台 Hash `e33ef4113d42f637f2f0b2e54f7ddd400279b6328b1c2934ea9e8a5975576259`。最终交付 A 1.1.0 Package Hash `21f5a6508d0c7e2877f8b3a5c3baf39021da52995b66960a38598c734034ea75`，后台算法字节未变，升级后实际结果绑定新 generation `676b1219-5adf-4426-bae2-cef9bfa9b794`。

B 1.0.0 Package Hash `82a350ca8bff1919a604f9403f802aa209ce17249118886e2d604e2725a42e28`；后台 Hash `4a0a1fb8ac2a3defe9cb2f6c1eb9ec27e9e8ca4a5e492c5c6e0c8a0978e620b4`。各安装来源、generation、Fire/Run/Result、包及驱动身份见摘要；local-reviewed 是明确本地审阅，不是发布者签名。

正式包与源码分别在 `examples/sidebar-tools/app-primes-423c62d375df/`、`examples/sidebar-tools/app-words-b72b4bea7cec/`；每目录只有一个正式 JSON。使用原 packer candidate→包/来源门禁→promote-from→check-project。历史包留在本机证据和 Git，不在目录堆叠多个正式包。

A/B 正常链均使用正式文件选择、安装和计划审阅、原生按钮输入；关闭实际 SIDE_PANEL 和管理 TAB 后自然等待，Cloud disabled，无 HTTP(S) 页、无 scheduledRunner 专用 TAB。重新打开真实侧栏，通过 UI 读回，再只读关联 Alarm/Fire→原 Run→Result→durable SDK Journal。没有直接调用回调、注入结果或在特权顶层运行应用代码。

## 架构与授权

仍只有原 SW、共享 Offscreen、createRunHost、Sandbox Controller/Worker、Browser SDK Registry/Host、Authority、Installer、Scheduler、Run/Result/Journal、Stop/Settlement 和单执行槽。app-service 无网页目标，不制造假 Tab/Document/Page，不削弱旧 Controller/Page 网页身份或 Task v1 service 禁令。

后台首版开放原 `browser.storage.local.get/set/getQuota`、`browser.capabilities.list/getStatus`；原 Installer/Authority 绑定 app、package/code hash、安装代次与来源，Host 在实际效果前重验状态、权限和 Run。Worker 不能选择 owner/namespace。A/B UI 存取同名 result 仍分别读回；公开 listOwn 只列自己的计划。七字段身份覆盖、跨 owner/key 写入、未授权网页能力被拒绝。

源码在 opaque Sandbox 的 Blob Worker 执行。A/B 实测 origin:null、无 Chrome runtime；fetch、importScripts、动态 import、WebSocket 有实际 CSP 违规事件。没有放宽特权 Extension CSP。原读取超限确定错误回执修复继续在 B2 真实执行，应用捕获 E_LIMIT 后可继续写结果；实际未知写入仍保留对账与禁止盲重放。

30 秒运行期限及原存储/消息预算保留；不承诺 OS 内存强隔离、任意副作用 exactly-once、秒级 Alarm、Chrome 退出后继续 JS 或商店批准。Alarm 专用 handler 与恢复 reconcile 共用逻辑，现有持久记录不能区分每次到期的唯一路径。

## 验证、环境和 Gate

- 卸载修复：73/73 Scheduler/Task/SDK，26/26 定向 Installer，七个既有消费者夹具 299 PASS、1 个既有 skip；独立源码审查 APPROVE/CLEAR。曾观察到无关市场目录来源 pin 不一致，定向 Installer 命令显式排除该项；保留原失败，不将其称全仓 PASS。
- 包合同 17/17、升级包合同 17/17、同源晋升及 isolated production 构建 PASS。最初输入复制期间启动的构建被来源漂移守卫拒绝，未冻结；输入固定后重新构建才形成 B2。
- 原生初次 UI JS 曾阻塞：Chrome blob-internals 实际显示 PENDING_QUOTA，当时磁盘仅约 163MiB 空闲，尚未提交任何计划。只清除本轮两个废弃快照内的重复 .runtime 副本，保留冻结构建和证据，重启自有浏览器后同字节 B2 恢复。没有改 CSP、配额或运行限额。清理收据 `redundant-runtime-copy-cleanup.json`。
- 测试驱动字段／Journal 状态断言错误、A 自有未保存输入保护均保留失败记录，修正驱动或经正式确认后只核查原结果；没有盲目重放未知副作用。

| Gate | 当前状态 | 范围 |
| --- | --- | --- |
| 0 基线、环境与入口 | PASS | 只在 main；独立 production 候选，不覆盖并行工作 |
| 1 真实机制 | PASS | 原 RunHost/Sandbox/SDK Host，真实 Chrome 原生调度 |
| 2 单应用闭环 | PASS | 安装→UI→调度→关闭→存储→重开 |
| 3 冻结后双新应用 | PASS | B2 后新 A/B、不同算法、106 文件字节不变 |
| 4 生命周期与安全 | NOT_VERIFIED（完整矩阵） | B2 卸载容量/续用/重装、运行中停用/升级、重启恢复及四项新入口拒绝通过；其余仍分项未测 |
| 5 收尾、解耦、政策 | NOT_VERIFIED | 可交付源码与正式包；未获全面95+或商店认可 |

B1 的 SW 停止与双应用同到期、Browser 重启、timeout→queued B、能力移除/恢复、Offscreen 故障恢复、ACK 丢失对账/OUTCOME_UNKNOWN、Controller/Page 原生结果保留在 [b1-summary.json](../evidence/dynamic-app-r14-local/b1-summary.json)。相关未改 RunHost/Sandbox/SDK 路径提供有限回归支持；共享 Scheduler/Installer 已变，不将旧候选证据整批记成 B2 原生 PASS。Offscreen 恢复旧记录自身的 closureMonitoring=NOT_VERIFIED 保持不变。

尚缺：B2 同到期竞争及队列超额/长期公平性、完整回执故障与快速重装原生矩阵、私有 Port/旧 document epoch/不同市场发布者身份矩阵、受影响 Cloud/官方应用原生回归。Cloud 正运行中关闭共享消费者需合法配对，当前没有该凭据；不用改内部状态伪造消费者。因此原始最终条件 11、12、15 的完整边界仍未闭合，不标记 G-DYNAMIC 完成。

## G-DECOUPLING：独立未完成

| 应用 | 应用私有业务 | 保留可信 Driver／SDK 缺口 | 仍有静态耦合与迁移要求 |
| --- | --- | --- | --- |
| Stay Focus | 额度、白名单、专注会话、提醒与原因 | 已有 siteBudget；站点预算、DNR、前台观测仍须受控，后台事件范围需独立授权 | sw.js 静态 service、Installer stop/cleanup、Host 分流；先迁业务，保留 Driver 授权及规则归属 |
| AdBlock | 订阅、过滤编译、计数、偏好 | 受管 content blocking/DNR 可复用；订阅网络与规则生命周期须最小授权 | sw.js 静态 service、专用 Host/Content/清理；固定来源及策略作用域后迁移 |
| AI VIP Share | 站点方案、账号、共享会话、登录态 | Cookie/网络/Native 等仍为可信受控 Driver；敏感凭据流程未由 storage-only 后台开放 | sw.js 静态 service、Host/Content/清理；独立数据权限合同后迁移，不能直接塞入动态 Worker |

没有宣称三项迁移完成，也没有借本次修复触碰它们的私有业务。源码线索保留于本机 `decoupling-review.md`，未来开始时重查行号。

## 发布政策与独立评分

已核对官方 [Offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen)、[Alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)、[CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)、[商店政策](https://developer.chrome.com/docs/webstore/program-policies/policies) 与 [MV3 附加要求](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)。浏览器机制支持不等于动态代码及 SDK 桥接获商店批准；没有自动提交或发布，RELEASE_POLICY_NOT_VERIFIED。

| 维度 | 独立分数 | ≥95 | 证据、剩余风险与最小下一步 |
| --- | ---: | --- | --- |
| 真实 Chrome 可行性 | 95 | 是 | B2 双应用、卸载续用与重装；原生主链已有证据，不扩成无关版本矩阵 |
| Runtime 唯一性与精简性 | 90 | 否 | 仍复用原系统；官方工具私有清理耦合尚存，按独立解耦任务逐项处理 |
| SDK 身份、权限与隔离 | 94 | 否 | 实际 CSP/跨 owner/绑定字段及新增清理拒绝；补真实 Offscreen、旧 epoch、发布者负例 |
| 生命周期与可靠性 | 94 | 否 | 卸载、重装、停用/升级栅栏已验证；重启恢复附监测边界，补必要队列/清理故障原生用例 |
| 编译后双应用独立性 | 94 | 否 | 冻结后新 A/B 与完整哈希证据；B2 同到期竞争尚未执行 |
| MV3 与发布合规 | 78 | 否 | 实际隔离位置和 CSP、官方政策；缺商店对本候选的审核结论，不自动发布 |

只读独立审查未发现 e478 清理协议的剩余 BLOCK，架构 CLEAR。评分是阶段判断，不因新增恢复记录自动上调；证据见本机 `b2-independent-followup.md`。本轮产品修复已推送；A/B 源码、唯一正式包与本记录一并安全提交，最终 SHA 与推送状态以交付 Git 核对为准。
