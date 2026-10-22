# Dynamic App Runtime R1.4-LOCAL：真实运行记录

2026-10-22，Asia/Shanghai；证据中的 ISO 时间使用 UTC。

**当前可用：** 开发者通过原扩展中心导入含可选后台入口的 Sidebar Tool v2，审阅后打开 UI、调用 SDK、创建计划，关闭侧栏后执行隔离计算，再打开 UI 读取自己的结果。B2 上两个冻结后新应用已经完成这条真实 Mac Chrome 链路。本轮额外修复并原生验证了卸载不释放计划容量的缺陷，并补齐 Offscreen 故障恢复及合法 Cloud 共享停止交错。

**完成边界：** 独立复核确认 G-DYNAMIC 原始 15 条条件在冻结 B2／本地审阅 A/B 范围内 PASS。G-DECOUPLING 未完成；独立评分前五维达到 95，第六维发布合规 78，六维全部 ≥95 的总目标未完成。商店合规为 RELEASE_POLICY_NOT_VERIFIED。此结论不外推完整发布者、故障与官方业务原生矩阵；B1 是历史候选，不能覆盖 B2 未测项。

## 本轮修复与实际用户操作

1. B1 真实 UI 创建计划达到原有 128 上限后，超额正确返回 E_LIMIT；但正式卸载临时应用后，110 条非 deleted 定义仍占名额，尽管 registry、owned storage 和 Alarm 已清除。原始失败：`artifacts/dynamic-app-r14-local/revoke-probe/uninstall-capacity-leak.json`。
2. 修复提交 `e47829d23d8a18f6a621f67717bd09ed68845341` 已普通推送 main。复用原 Scheduler/repository，将精确旧 owner 的定义 tombstone、取消未准入 Fire，保留历史 Run/Result。原 Installer 的持久清理日志与锁一直保留到原 Host 确认定义退役、Alarm 清除并读回；错误或回执未知时阻止同 ID 重装。原 Alarm 同步串行读取最新有效性和定义，避免旧快照重建 Alarm。未新增存储、Host、安装器或调度器。
3. B2 原生复验：初始 A/B 两条定义；通过 A UI 逐条创建 126 个远期计划并完成审阅，总数 128，第 129 个被拒绝 E_LIMIT。正式卸载 A 后，其 127 条定义逐一 deleted/paused、generation+1、nextDueAt=null；活动定义 128→1，A Alarm 全清。B 的定义、完整结果不变，A completed Run 与 Journal 保留，清理日志在成功回执后移除。
4. B 正式创建新计划并在侧栏关闭后执行，UI 读回新 nonce `b2-released-capacity`，Run `adb688b0-fb8a-43bc-a8cb-c850d55c9166` completed/Worker retired，原 SDK Journal durable。A 同包重新安装获得新 generation，严格普通链再次通过。
5. B2 运行中停用、恢复、升级 1.0.0→1.1.0 已实测。停用 Run `e13bc73d-b8f6-48d2-84ca-673a29b4743d`、升级 Run `6dd4c440-310c-4024-b975-c948482ce4bc` 均 stopped/E_TOOL_CHANGED、Worker retired；分别等待 31 秒，未见旧 nonce 迟到写入。
6. 新清理入口真实 SIDE_PANEL 负向请求：仍安装的 B 无 pending uninstall 返回 E_OWNER；额外 generation、runId、owner 返回 E_SCHEMA。随后在 A 真实 Alarm 启动、Worker 正运行时，由实际 `cloud-control/runner.html` Offscreen 文档发送清理 B 的请求，同样返回 E_OWNER（要求真实 Installer document），B 前后未变，A 仍运行并最终完成。这些是明确的协议负面探针，不属于普通 UI 执行链。最终 A Run `8424dc8d-f7e1-4d27-bb20-c0fddf4f9b0a`、Result `2b0a3d93-f906-41b8-b62c-51de4cf2b4b8` 与 UI 读回一致；原退休记录 releaseCount=1，全部消费者空闲后 Offscreen contexts=0。
7. 同 Profile 完整 Browser 重启 PID 6354→15311，Extension ID 不变。升级 A 1.1.0 的预建计划恢复，UI 正确读回，Run `1388b561-5681-4264-bfbf-9fbc5bb03e32` completed，Result `8276a54f-2457-41a2-8da4-b54019355ab2` 成功，旧 127 条计划仍退役。**重启至首个观察样本存在空档，首样本晚于到期约 7 秒**；此证据证明重启恢复与结果，不替代严格普通链的全区间无瞬时 UI 监测。
8. B2 A/B 在 `2026-10-22T01:18:58.583Z` 同时到期。关闭真实侧栏和管理页、停止真实 SW 并脱离所有调试 session 后，连续 target 发现与采样确认无 UI、HTTP(S) 或专用执行 TAB，Cloud disabled。两个原 Run 均成功：A `d3ec3a25-8194-474f-b15b-813ce116f576`，B `5b24ab9d-584e-4809-a1b8-8fa3650d2baf`。A Worker 退休并在原事务释放单槽后 **2136ms**，B 才准入。每个 Fire 仅一条 linked Run、start Journal 和终态 Result；service-result 不计成重复 Run。UI 分别读回不同 nonce 与正确算法结果。只读独立审查确认该关联；证据 `lifecycle/b2-simultaneous-sw-1792631848557/`。
9. 在实际安装的 A 非可信 UI 中，公开 SDK 取消 B 的真实计划返回 E_OWNER；选择 B owner 的 listOwn/storage.get 返回 E_SCHEMA，B 的安装、数据、计划及完整 Run/Journal 未变。这是负面 SDK 探针，证据 `b2-owned-plan-negatives.json`。
10. 通过原 A/B UI 审阅创建 13 条同到期计划，超过每批 12 条的读取批次。全区间侧栏关闭、无 HTTP(S)/专用 TAB、Cloud disabled；13 个 Fire 均各对应一个 completed Run 与终态 Result，全部算法结果正确，每次下一准入均晚于上一 Worker 退休与单槽释放，A/B UI 分别读回自己的结果。原驱动错误地要求两个分别 `now()` 的事务时间戳毫秒相等；保留原 FAIL，依据原始 13 条账本修正顺序断言后完成对账，未新增计划或重放。证据 `lifecycle/b2-batch13-1792632898346/reconciled-proof.json`。此结论限定有限批次无丢失和串行性，不称 SDK 并发超额或无限期无饥饿。
11. 有限先后排序：A₁ 先到期并占槽约 20 秒，B₁ 在其后 5 秒到期，A₂ 在其后 10 秒到期。真实准入顺序为 A₁ `75b1c0b2-e898-47a8-9b1d-b9fcc359ccde` → B₁ `8a4e2735-3ea3-4abe-a62e-1eabdead13d4` → A₂ `befdbade-9ea7-45a6-993b-18548478b808`，每次前一个 Worker 退休并释放原槽后才准入下一条，较早到期的 B 没有被后来的 A 插队。关闭侧栏全区间及两个 UI 的正常读回均已核对，证据 `lifecycle/b2-fifo-1792633217581/proof.json`。
12. 实际 Offscreen 故障：A 的真实 Alarm Run `a4661216-243e-431d-8270-47617ec4687b` 已通过原 SDK 写入 started 后，在其 25 秒计算等待中关闭实际 Offscreen target。原 A 变为 interrupted/retired、仅一次释放单槽，未重放且 UI 未出现该 nonce 的迟到结果。后续独立 B Alarm 在新文档 `8E4EFF4C68690A2222E30ECBA1584E58` 完成，Run `c722e867-4442-409e-a994-3864381e14fb`、Result `cb1a136d-8bf3-4910-87bd-4f8619dfe1c8` 与 UI 一致。故障前另做明确只读协议对照：当前文档的有效 Run 可查询 quota，同一 registration 采用旧文档 Run 返回 E_OWNER，未产生旧操作 Journal；这不等于提取并伪造旧私有 Port。关闭侧栏全区间监测通过，证据 `lifecycle/b2-offscreen-fault-1792634089115/proof.json`。两次诊断准备失败均在实际故障前，已对账各自原计划正常结果，未重放。

13. 合法共享 Cloud 停止：通过原「开发」在真实 demo-form.html 执行固定表单源码，Run `e8543cb3-cabf-4dcb-9c90-e301ac16a6e5`，再原 UI 核对原生回执、设为本地可用、安装 sample.form-fill 1.0.0。使用原 CLI Provider 固定 loopback 43112，真实 UI 配对及批准一个任务且不回传正文；UI「已连接」、Host「已就绪」，服务端 executor=1、Job=0。A 真实 Alarm Run `9096e713-f9d1-467f-8183-8cd9abf74637` 活动时，从 Cloud UI 点击停止。Cloud 已 disabled，但 A 仍在同一 Offscreen `DFA4D45EDC0627B6D6D45D09E15D783B` running，随后原 SDK 结果、Result `f8711bc8-2a7e-494f-ad76-be6e7224426d` 与 UI 对应；退休 releaseCount=1，B 全部 owned storage 未变，空闲后 Offscreen=0。最终经原 UI 解除配对，Provider 返回 revoked=true、UI「撤销已确认」、本地 Cloud 配置清除；仅停止本轮自有 Provider，保留其他服务。证据 `cloud-shared/shared-stop-1792635022898/proof.json`、`cloud-shared/cleanup-proof.json`。此用例验证共享消费者交错，关闭侧栏的普通链由此前独立严格用例证明；未提交远程 Job，不冒充公网远程执行或商店验收。

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
| 4 生命周期与安全 | PASS（本轮必要闭环）；扩展矩阵 NOT_VERIFIED | B2 停用/升级/卸载/重装、Browser/SW 恢复、批次及 FIFO、跨 owner、旧文档 Host、实际 Offscreen 故障、合法 Cloud 共享停止均有证据；未测范围保留如下 |
| 5 收尾、解耦、政策 | PARTIAL | 源码、正式包、解耦剩余清单和本地证据已交付；G-DECOUPLING、六维全95+和商店认可未完成 |

B1 的 SW 停止与双应用同到期、Browser 重启、timeout→queued B、能力移除/恢复、Offscreen 故障恢复、ACK 丢失对账/OUTCOME_UNKNOWN、Controller/Page 原生结果保留在 [b1-summary.json](../evidence/dynamic-app-r14-local/b1-summary.json)。相关未改 RunHost/Sandbox/SDK 路径提供有限回归支持；共享 Scheduler/Installer 已变，不将旧候选证据整批记成 B2 原生 PASS。Offscreen 恢复旧记录自身的 closureMonitoring=NOT_VERIFIED 保持不变。

独立复评将本轮剩余操作收敛为：B2 真实 Offscreen 关闭故障及旧 Host 文档所有权负例、App 活动时停止已配对 Cloud 的共享资源交错。前者现已通过；后者现已用仓库原本机 Provider CLI 与真实 UI loopback 配对通过，不需公网部署。独立只读复核确认原始条件 1–15 对本轮 local-reviewed A/B 均有足够证据判定 PASS，未发现当前具体产品 BLOCK；G-DYNAMIC 达成本轮 LOCAL 完成条件。实际 Cloud Job 执行中的停止交错与公网远程执行未纳入本用例，不冒称通过。

有限 13 条同到期及 A₁→B₁→A₂ 批次已通过；128 条计划定义容量不等同于 SDK 并发队列超额，`ready().slice(0,12)` 仅为分批。独立源码核对确认原 Scheduler 按到期时间排序，128 定义、周期最短 1 分钟与 App 固定 5 分钟启动期限共同界定可执行积压；不是新增 Fire 数量上限。过期可转 MISSED，不承诺过载全部必达。SDK 在途 RPC 没有独立计数上限，不将其与单槽执行等待队列混为一谈。私有 Port 提取、不同市场发布者及完整回执故障矩阵仍未全面原生验证，保留限制；不据此追加无限测试或三官方业务迁移为 LOCAL 双应用完成条件。

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
| Runtime 唯一性与精简性 | 95 | 是 | 仍复用原系统；合法 Cloud 在线消费者停止时保留活动 App、空闲才关闭。未测 Cloud Job 执行中停止；无当前修复项，归档证据即可 |
| SDK 身份、权限与隔离 | 95 | 是 | 实际 CSP/跨 owner/绑定覆盖及旧文档 Host E_OWNER；B 数据不变。私有 Port 提取及发布者矩阵未测，保留限制，无当前修复项 |
| 生命周期与可靠性 | 95 | 是 | 卸载、重装、停用/升级、真实 Offscreen 故障、新文档恢复、13 批次/FIFO/Cloud 交错通过。重启附观察空窗，完整回执故障矩阵未重做；不承诺无限公平或任意 exactly-once |
| 编译后双应用独立性 | 96 | 是 | 冻结后新 A/B 与完整哈希证据；B2 同到期、13 批与先后排序、卸载 A 后 B 续用均已实测 |
| MV3 与发布合规 | 78 | 否 | 实际隔离位置和 CSP、官方政策；缺商店对本候选的审核结论。下一步留到正式发布阶段核对候选并完成审核；不自动发布 |

只读独立审查未发现 e478 清理协议的剩余 BLOCK，架构 CLEAR。最终独立复核及评分见本机 `b2-final-independent-review.md`、`b2-final-independent-scores.json`，摘要保存 SHA。旧评分与原始限制保留，不以未执行检查提高分数。本轮产品修复、A/B 源码与唯一正式包已推送；后续原生证据增补不改 Browser 或应用字节，最终 SHA 与推送状态以交付 Git 核对为准。
