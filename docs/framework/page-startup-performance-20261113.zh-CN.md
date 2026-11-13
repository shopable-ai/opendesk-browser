# ChatGPT 网页增强启动性能（2026-11-13）

本轮目标：已安装的 AI Send Queue 和 AI 对话滚动导航在 ChatGPT 的原生结构就绪后及时显示并可用，以同页提示词快捷按钮为对照。阶段为核心开发；不进入 production、压力测试或评分，不发送 ChatGPT 消息。历史启动可靠性记录见 [原续接](workstreams/page-startup-reliability-20261113.md)。

**当前结论：真实性能门槛仍为 FAIL。当前对话实读 `goal: null`，没有恢复旧目标；更早对话的 paused 仅为上次交接观察，本轮未跨对话重查。最新 A 源码已通过定向检查，但构建被其他 owner 的 WebFlow 来源 pin 阻塞，运行候选仍为 `4ee8ed`。不能把单次较快样本或 Node PASS 当作速度达标。**

## 目标和判定

| 条件 | 本轮门槛 |
| --- | --- |
| 单页连续正常刷新 | 两个增强分别至少 10 个独立 document；就绪至 UI 可见可用的 P95 ≤1000 ms，nearest-rank 计算 |
| 三页同时加载 | 同轮至少三个不同页面/document，两个增强各页延迟 ≤3000 ms |
| 缺失与错误 | 20 秒仍缺失、bootstrap 错误、同一目标重复 UI、不可用均失败；单个 >20 秒样本不能被 P95 掩盖 |
| 同候选 | 每样本记录扩展 ID、已应用 revision、SW SHA；测量前后与磁盘候选一致，变化则失败 |
| 提示词对照 | 同页记录时间；它是固定可信 Content 路径，不等同于已安装 Page Program 的启动路径 |

队列起点为真实可见且位于 form 的原生编辑器。导航起点为已有 assistant 回复及其原生按钮结构就绪；测量该回复自己的导航按钮。无回复的首页标记 navigation 不适用，不记 0 ms、不计入其 10 个有效样本。用户关闭浮动 dock 时，不把 dock 缺失当故障。多个回复各有一组合法按钮不算重复，同一个回复重复才算失败。

提示词快捷按钮使用 closed ShadowRoot：通过公开 host 几何及可访问性快照观察，不能因为没有 open shadowRoot 判定缺失。采样记录页面 visibility，区分后台页面节流；不把 DOM 插入或 lifecycle 隐藏节点当实际 UI 首显。

## 已确认的问题和本轮修复

真实只读诊断：711 条 execution、562 条带 lifecycle、517 条不在 session mirror，分布于 235 个待确认的旧 document。`preview-worlds.js` 原来在每次账本恢复中逐个 await `webNavigation.getFrame({documentId})`；同一次增强启动又会多次读取该账本。既有页面上队列 lifecycle 约 8 秒、导航约 20.6 秒才出现；这些时间是执行节点出现时间，不是合格的 UI 延迟样本。

最小平台修复：每次账本读取按 exact documentId 去重，最多 8 个只读查询并发，按原 execution 顺序恢复世界与核验身份。不改变整个 boot 的副作用串行、Authority、安装版本绑定、来源、撤权、unknown、world 配额和 CAS。查询异常及 BFCache 仍保留；不跨读取缓存空值，不删除历史 execution。

本轮还实施了以下受影响范围内的修复：

- 新文档没有同程序旧运行需要清理时，不再为一个空集合检查读取完整世界账本；分配世界时仍完整验证。
- 原 IDB 事务内的有界正向 entry 扫描，在支持的浏览器使用 `getAllRecords` 批量读取，保留范围、精确续读、顺序、事务和错误 abort；不支持时保留 cursor。参考 [Chrome 141 官方说明](https://developer.chrome.com/release-notes/141#indexeddb_getallrecords_and_direction_option_for_getall_and_getallkeys)。本轮 ego Chromium 156 实读该 API 可用。
- 同一新 manifest 的独立默认资源并行 fetch/hash，按声明顺序组装；不缓存跨次结果，失败仍拒绝。
- 只有原生自动 bootstrap 的精确文档 lexical marker 校验成功，才让后续注入立即继续，避免再次等 idle；原批准的 runAt 不变，手动运行保持保守时序，提前伪造消息不能建立 marker 或准入执行。
- 每次父扩展授权检查仍读取最新 registry、启停和 epoch，只校验唯一目标包；同一次调用完整验证一次并计算原 canonical hash，不重复验证无关包，不跨请求缓存授权。重复目标、目标篡改、停用和替换仍拒绝。
- 在既有 execution result 记录纯数字分阶段计时。`totalMs` 截止结果生成，**不包含 finally 的 slot release 与外层完成记录写入**；不得直接用各阶段相加冒充完整 boot 耗时。正式指标来自页面真实 UI 观测。
- 最新源码候选将固定源码读取、资产校验和编译移到最多四项的只读准备池；完成后按就绪顺序进入原串行执行链。调用输入先复制；执行前重新核对安装 token/版本/授权代数、permission epoch、精确文档、fresh candidate/resolution 和 Available proof，且 receipt hash 必须与准备时一致。世界、共享 slot、源码派发、完成和 unknown 仍使用原链；准备失败也排入该链，等待原 suspension/reconcile 完成。新增 `preflightQueueMs`、`preflightMs`，不隐藏准备池等待。准备池已在 `87acb1` 生成并实测一次，后续 `420e5f` 同时包含成功 registration facts 缓存；均不是 P95 通过证据。

不做跨读取 negative cache 的依据：Chrome 官方文档说明 BFCache 恢复保留 documentId，但 `getFrame` 空结果没有承诺 document 永久销毁；上游还有映射延迟建立等空值分支。参见 [官方 Frame IDs](https://developer.chrome.com/docs/extensions/reference/api/webNavigation#frame_ids)、[getFrame](https://developer.chrome.com/docs/extensions/reference/api/webNavigation#method-getFrame) 与 [固定上游实现](https://github.com/chromium/chromium/blob/1480da990167dc5fa0501ae03f5de3fe4f3c3e3e/chrome/browser/extensions/api/web_navigation/web_navigation_api.cc#L52-L122)。不把观测结果升级为授权缓存。

## 关键回归与证据入口

- 大量历史文档：峰值并发 ≤8、相同 document 每轮只查一次、结果乱序不改恢复顺序、每轮重新观测。
- 身份与预算：同 world 冲突仍拒绝；cached/查询失败仍占预算；关闭文档不恢复；session 丢失不退还活跃文档配额。
- 生命周期：安装身份、版本/source binding、撤权、managed disposal、unknown 与 stale writer CAS 定向回归。
- 用户行为：刷新后唯一队列按钮和同回复导航可用；保留原文与草稿；不重复注入、不自动发送。
- 判定器：不适用样本、候选漂移、重复 document、少样本、缺失、错误、超时、三页不完整等不能假 PASS。
- 原生时序：idle/end 自动引导后可立即继续；缺 marker、撤权、换文档仍拒绝；两种时序的手动运行不冒称 bootstrap 已到达。
- 包身份：canonical 字节/重排一致；Page、controller、background 篡改继续拒绝，授权读取每次重新观察最新状态。
- 准备池：慢准备不挡住另一份已就绪程序，峰值 ≤4，准备不占执行槽；用四个 permit 的门控证明准备已完成后再变更安装、文档、native descriptor、proof 或 candidate，必须在派发前拒绝。同文档并发重复请求只执行一次，其他程序不能越过 unknown 槽；失败准备的 suspension 也遵守原执行顺序，后项仍可继续。

定向命令：

```sh
node --test tests/environment/page-installed-managed-lifecycle.test.mjs tests/environment/page-installed-programs.test.mjs tests/environment/app-page-programs.test.mjs tests/foundation/idb-durability-r201.test.mjs tests/environment/page-startup-evaluator.test.mjs tests/environment/builtin-libraries.test.mjs tests/environment/builtin-failures.test.mjs
node --test --test-name-pattern 'combined package|embedded full|async verification|document_end companion|digest-consistent' tests/environment/sidebar-tool-page-module-package.test.mjs
node --test --test-name-pattern 'canonical|hash|verification rejects|async verifier|large UI' tests/environment/app-controller-package.test.mjs tests/environment/app-service-package-r14.test.mjs tests/environment/task-delegation-package.test.mjs
node scripts/evaluate-page-startup.mjs artifacts/page-startup-20261113/latest.json
```

前三项分别证明受影响的生命周期、存储、资源、包身份和判定逻辑，最后一项才判定真实性能是否达标。上一候选分别为 **301/301、5/5、9/9 PASS**。本次准备池变更重新执行启动、managed lifecycle、父包三组，共 **274 项 PASS**（主组 273，新增失败顺序门控 1）；语法和差异空白检查通过。未受本次变更影响的存储/资源/判定器沿用上一轮证据。Node PASS 不代表浏览器速度达标。

## 本轮运行记录（持续更新）

上一对话运行记录：使用 ego TaskSpace 137，自建页面、共享 Profile；不是 Cookie/权限隔离环境。扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，固定加载 `dist/development`，复用原开发更新链。原 writer OOM 退出且端口、锁已释放后，本任务以进程级 `NODE_OPTIONS=--max-old-space-size=8192 npm run dev` 恢复唯一 writer（上次观察 PID 24359，guard 43120、serve 43119；开始新一轮时重查），没有修改全局配置。产物由原安全链应用，没有强制 reload 或改写 unknown/slot。

旧运行 revision `99c6621f8491216b312a84fd2e799f921106e799601d9c74cd37164d639f2071`，SW `609edfb8b29db655d463fd0ffbe206baa2ea5393a87baeca9a1e4ecd9fb52125`。`artifacts/page-startup-20261113/baseline.json` 选择器未适配新版编辑器/导航设置，不能计算合格延迟，保留其 lifecycle 原始值。修正选择器后的 `baseline-corrected.json`：提示词 113.1 ms，队列/导航 25 秒缺失，并有 `E_BUILTIN_RESOURCE`。当时其他 owner 正重启原开发服务，产物处于构建中；保留这次失败，不用它证明稳态性能改善。

较早完整测量候选 revision `14b299fe2a9d514740272ee6d2095a358adb53d3ff25cee4f05f2bf10d52413d`，SW SHA `a58cb323fba65bd490acfbcb5dfdc579a1ebc4fad1854f0c807c8c3ed5ef76cf`，每个样本前后均核对同候选。实际安装为队列 r25、导航 r20；本轮未替换业务安装包。

| 真实性能 | 队列 | 导航 | 提示词对照 |
| --- | ---: | ---: | ---: |
| 单页 10 个独立 document 的 P95 | 4581.5 ms | 8062.2 ms | 1070.9 ms |
| 三页同时加载的最大值 | 12257.4 ms | 14789.8 ms | 639.6 ms |

13 个页面样本均有唯一、可用 UI，没有 bootstrap 错误或 20 秒缺失；速度门槛仍失败。单页大部分样本为队列约 1.56–2.02 秒、导航约 2.86–4.37 秒，但较慢样本必须计入，不能删除后宣称改善率。旧基线选择器/环境不一致，**没有同候选前后各 10 次的严格改善率证据**。

只读阶段计时说明：历史账本读取已从数百毫秒降到常见约 10–40 ms；导航自身注入约十几毫秒，但仍受此前增强串行启动拖延。TOC async main 会等待首次三次 AppPage RPC，每次 RPC 又重复执行完整授权；它的 native completion 约 0.88–1.37 秒，不等于单纯 Chrome idle 延迟。三页队首阻塞进一步放大。提示词走固定可信 Content 路径，所以不承受同一 Page Program 队列，不能以其速度推断另外两者是相同启动链。

保留证据位于本机忽略目录 `artifacts/page-startup-20261113/`：`candidate-14b299-10-plus-3.json`（原始观测和阶段计时）、`evidence-14b299-10-plus-3.json`（判定输入）、`evaluator-14b299.txt`（FAIL）、`final-targeted-tests.tap` 及两份 package 检查输出。私有会话 URL 仅在本机采集材料内，不写入正式测试 fixture。

## 下一步与停止边界

`420e5fb9e2181383d29aa2d764173c066ca1aae35cb82b4389b1d6e137283955` 已构建并安全应用，SW `261e503a9f96c56daf2d685c72246c3045b7ec872836a3b63c45e77c46e8bc12`。此前并行业务来源锁构建阻塞已解除，不是当前阻塞。该候选单次诊断：队列 3595.7 ms、导航 986.1 ms、提示词 482.3 ms；UI 唯一可用，缓存均命中，但队列仍慢。最新 installed-programs 门控证据 276 PASS。未完成此候选的 10+3。

本续接同候选再刷新一次（`candidate-resume-diagnostic.json`）：队列 6986.6 ms、导航 4811.2 ms、提示词 511.4 ms，均唯一可用、无 bootstrap 错误。导航自身 native completion 9.5 ms，而执行链等待 5493.4 ms；队列结果生成前 UI 已可见，因此其本次阶段记录尚未完成。不能将单次较快值当 P95。

本续接先做一处小修复：`dependency-metadata.js` 的 `readLine` 原本对每个字符调用一次 RegExp。对实际已安装 mindmap r5 的 4,276,194 字节源码，隔离 Node 解析五次为 48.87–55.14 ms；只把行尾查找改为引擎原生扫描后为 3.26–7.05 ms。源码/资源哈希、授权、runAt 和实际执行串行均保持原链；没有实施 dependency-manager 成功缓存。本地微测不能证明浏览器端到端收益，待同候选测量。新增大注释下全部 JS 换行、偏移及代码后伪头回归，修改前先锁定行为，修改后 metadata、dependency-manager 与 installed-programs 共 219 PASS，语法及差异空白检查通过。

续接开始 writer PID 40319 在运行，随后自行退出且监听已释放；本任务没有终止它。通过原守卫以进程级 `NODE_OPTIONS=--max-old-space-size=8192 npm run dev` 恢复唯一 writer PID 45081（PTY 48333），沿用 `dist/development`、serve 43119 与 guard 43120；已生成并安全应用含扫描修复的 `1c5b7f`；随后资源更新为 `4ee8ed`，两者 SW SHA 相同。未重装扩展或改 Native 配对。

## 本续接完整开发测量与结论

最终同候选为 revision `4ee8edf7162a3188625beed5f099b0e915b1753a6e505be03aba2190a221765a`，SW SHA `9f126e0f67bcc2d2e4d6dc71e363cf3529a508107b7108c592e65485ab050047`。13 个独立 document 的前后身份均一致；收尾实读 applied 身份与 extension URL 返回的 SW 字节摘要一致。安装版仍为队列 r25、导航 r20，enabled/registered、批准 `document_idle`，未改业务包。

| 同候选真实 UI 指标 | 队列 | 导航 | 提示词对照 |
| --- | ---: | ---: | ---: |
| 单页 10 次刷新 P95（nearest-rank） | 4256.6 ms | 1721.4 ms | 1007.3 ms |
| 三页同批最大延迟 | 10707.8 ms | 6466.3 ms | 534.7 ms |
| 原门槛裁决 | FAIL | FAIL | 仅作对照 |

13 页 UI 均唯一、可用，无 bootstrap 错误、驱动异常或 20 秒缺失。`node scripts/evaluate-page-startup.mjs artifacts/page-startup-20261113/evidence-4ee8ed-10-plus-3.json` 返回退出码 1：两个单页 P95 超过 1000 ms，三页的两个增强每页都超过 3000 ms。`latest.json` 已同步这份完整证据；没有放宽门槛或删去慢样本。

采样过程保留了两份中断记录：`candidate-scanner-10-plus-3.json` 第二轮捕获 `E_DOCUMENT_STALE`，账本明确对应上一个 document 的 reading-toc 被刷新取消，当前页两个目标程序均 completed。此后每轮 UI 观测结束后，等待本 document 五个已批准匹配程序的启动结算，再开始下一次独立刷新；等待不计入或改动任何 UI 起点/首显时间，错误仍全量保留并判失败。`candidate-scanner-settled-10-plus-3.json` 第九轮检测到 revision 从 `1c5b7f` 变化为 `4ee8ed`，整组停止，未与最终样本拼接；最后重新收集了完整 10+3。

剩余主要等待已由同候选阶段记录确认：单页队列 `queueWaitMs` 1619.6–3420.3 ms，导航 557.5–2914.4 ms；三页队列 5908.0–9161.6 ms，导航 6114.2–7931.2 ms。相应原生用户源码执行队列为 15.4–33.7 ms、导航为 7.8–13.2 ms。不同起点的时间不直接相加；`totalMs` 也不是完整端到端时间。这些记录证明当前主要问题仍是既有串行执行链等待，不证明进一步固定源码缓存能够解决它。

本续接增量只有 `dependency-metadata.js` 的行尾扫描、所属 metadata 行为回归及本记录；没有修改 dependency-manager，也没有新增跨调用源码/授权缓存。局部解析提速成立，真实端到端目标仍未达成。候选同时包含并行 owner 的其他更新，因此不计算相对旧候选的严格改善率，也不把收益全部归因于此小修复。既有准备池和有界 registration facts 缓存本轮未改，不把缓存命中当作性能结论。

证据入口：`candidate-4ee8ed-10-plus-3.json`、`evidence-4ee8ed-10-plus-3.json`、`evaluator-4ee8ed.txt`、`final-runtime.json`、`metadata-before.json`、`metadata-after.json` 和 `metadata-scanner-targeted.tap`，均位于忽略的 `artifacts/page-startup-20261113/`。私有会话 URL 只保留在本机原始采样材料，不提交。源码/定向检查已通过，相关编译和运行候选已分别核对；真实性能保持 FAIL。

本轮测量结束已释放 TaskSpace 137。唯一 dev writer PID 45081/PTY 48333 保留；后续并行 WebFlow 源码保存曾触发新的来源 pin 构建失败（见 `dev-resume.log`），最后可用候选仍为上述 `4ee8ed`，不是恢复旧的构建阻塞结论。本任务不修改该业务或来源 pin。

后续只应针对以上串行等待中具体占比最大的一段先做隔离时序，再决定最小修复；不自动实施 dependency-manager 缓存、改变 runAt、并行派发用户源码或扩大到整套 SDK。安装身份、fresh proof/source、精确文档、撤权、Authority slot 和 unknown 不重放继续保留。本轮按已授权的开发测量结果收尾，原目标未达成，不标记完成，不进入 production、评分或全量回归。

浏览器冷启动、production、真实撤权 UI 操作和长期后台恢复为 NOT_TESTED。未提交、未推送；并行业务改动及现有开发服务继续保留。

## 本轮 A 候选与 B 具体方案（TaskSpace 143）

本轮用户授权先说明方案，再自主实施最小可逆改动；允许评估跨页及同页并行。此前“不能并行派发用户源码”的实施限制不再替代设计判断。当前仍为持续开发与最小验证，不提交、推送、创建分支/worktree/PR，不进入 production 或正式评分；95+ 不能由设计或 Node 通过推定。

### 当前瓶颈与本轮最小改动

开始先复用最新完整同候选 10+3 原始证据，再做一轮真实 ChatGPT 刷新：原候选 `4ee8ed` 的队列 **2769.6 ms**、导航 **1671.6 ms**、提示词对照 **0 ms**，均唯一可用，无 bootstrap/驱动错误，五个匹配程序结算后才结束。本轮单次诊断不能计算 P95；提示词 0 表示首次扫描时已经可用，不是物理零耗时。原始记录为 `candidate-baseline-143-smoke.json`，没有拼接到任何 10+3，也没有覆盖 `latest.json`。

现有 `executions` 串行链、`preview.js active` 和 `@slot.preview` 让所有文档等待前项完整完成。原始一轮 Reading TOC 的 native completion 847.2 ms，而队列自身 17.2 ms；目标工具固定资源/编译常见 5–7 ms，mindmap 约 105 ms。A 只能缩短串行准备段，不能承诺解决 TOC 完整 main 的等待或单页门槛。

A 已实施，业务包和批准 runAt 保持原状：

- `installed-programs.js`：原有最多 4 项纯准备池中，在 descriptor 后调用同一 preview 的 `prepareInstalled`；结果只随当前 invocation 传递，进入实际执行前仍重新读取当前 candidate/resolution/proof、安装 token/generation、permission epoch、原生注册和精确 document。准备失败仍进入原串行失败结算顺序。
- `preview.js`：独立固定资源读取/校验和 frame 资源解析可重叠，编译在准备池内完成；没有 Worker、依赖、持久缓存或新增执行入口。一次性不透明句柄只保留当前 invocation 的产物，消费即删除，并核对 fresh manifest、源码字节和依赖身份。句柄不授权，不分配 world，不写执行账本，不持有 Authority slot。最终组装仍使用实际分配的 world、当前执行键和 nonce，dispatch/mutation 原子顺序不变。
- 阶段字段 `invocationPreparationMs` 属于纯准备（包含于 `preflightMs`），`consumePreparationMs` 记录串行消费成本；不能把前者和端到端时间重复相加。没有把 `Promise.all` 称为 CPU 并行。
- `page-installed-programs.test.mjs` 增加三项行为门控：编译与前一 main 等待重叠但不占第二槽；句柄一次性、源码/依赖变化拒绝；准备失败释放许可且后项继续。该测试与 `app-page-programs.test.mjs` 的 double 接入同一 compiler 实例，重启时重新建立对应句柄 owner。

相关三组定向检查 **279/279 PASS**：`node --test tests/environment/page-installed-managed-lifecycle.test.mjs tests/environment/page-installed-programs.test.mjs tests/environment/app-page-programs.test.mjs`。覆盖准备池上限、同 document 防重、fresh proof/source/native descriptor/document、撤权/替换、失败结算、父子 frame 生命周期、nonce/CAS、unknown 阻止后续派发和 SW 恢复不重放；语法和相关 diff 空白检查通过。本轮没有修改并发准入，因此这些结果不证明 B 的并发安全性。

独立只读代码审查对比本轮开始快照，未发现 A 引入的可操作问题；审查者另跑 16 项定向检查与语法/AST 检查通过。该审查不包含真实浏览器或新候选构建，也不提升为完整验收。

### B 的实际边界与修改清单（尚未实施）

A 新候选先通过真实 UI 单次测量，再推进 B；当前构建阻塞时不叠加第二个未经测量候选。

B 应继续使用原 Authority、执行账本和 `runs/@slot`：保留 `currentRunId` 及手动 `preview`，在同一槽位事务中维护最多 **2** 个 installed reservation；键包含 `browserSessionIncarnation / namespace / tabId / documentId`，同 document 跨程序 FIFO，同安装/document 原准入键仍只成功一次。全局 Controller、手动预览或 legacy 未结算槽存在时不能准入 installed；任一 installed 活跃时不能启动 Controller/手动预览。不靠页面世界隔离推导 Authority 资源安全。

**unknown 继续全局阻止新派发**，即使另一 document 或空余许可也不能绕过。槽内 unknown 必须在后项准入前持久化，最终 dispatch 同事务核对原 nonce/executionKey/session 和全局未知状态；不能先释放许可再记录 unknown。已派发动作不自动重放，恢复只对账，只有原合同认可的精确文档消失等证据才能释放。安装/停用/替换 mutation 与最终原生调用仍走原 `ordered` 顺序，不等待用户 main 才释放 mutation 队列。

必须一起修改和定向验证的真实消费者：

| 范围 | 文件与责任 |
| --- | --- |
| 调度与真实执行 | `installed-programs.js` 的 executions、最终 dispatch 和 resource dispatch；`preview.js` 的 active、verifyTarget、finally 及未结算 child frame；`preview-admission.js` 的 reserve/reserveInstalled/reserveFrame/assertFrame/release |
| Controller 与槽位写入 | `src/platform/host/controller-methods.js`、`src/platform/host/authority.js`：新准入互斥、整槽写入不抹除 installed 所有权、slotAvailable 如实反映忙碌 |
| 其他真正准入者 | `src/cloud-control/service.js`、`src/page-events/web-task-ingress.js`：有 installed 槽时不 claim |
| 开发刷新与 Offscreen 空闲 | `src/development/worker.js`、`src/cloud-control/runner-lifecycle.js`：任何活动/unknown reservation 都不是 idle |
| 恢复与子资源 | 原 `recoverExecutions` 同时核对 main 和独立 resource request reservation；parent 完成但 shared child 未结算时保留原槽，不把 child unknown 随 parent 成功释放 |

对应门控必须证明不同文档推进/上限 2/同文档串行及防重、Controller/手动预览互斥、父子资源共享、安装替换/撤权、fresh proof/source、精确 document、nonce/CAS、失败释放、全局 unknown 阻止后续派发和 SW 恢复不重放。不能只改 Map/Promise.all 或删除 active；不能仅因这些测试通过宣称三页 ≤3000 ms。

C 同页并发仍未实施。若 A、B 后单页仍失败，先定位阻塞程序的具体 DOM、受管 UI、RPC 与生命周期，证明独立性并说明最小方案后再改。跨页结果不能替代单页 P95。

### 源码、构建、运行和证据状态

- **源码**：A 已实现并通过上述定向检查；B/C 未实施，目标未完成。未修改业务安装包、runAt、来源 pin、安装身份或授权；未提交/推送。
- **构建**：唯一 dev writer PID **45081** 仍持有 guard **43120** 和 serve **43119**。A 保存后原 watcher 再次报 `[opendesk-fixed-sw] Trusted ChatGPT files source changed; review and re-pin before fixed build: projects/webflow/trusted/chatgpt-result-adapter.js`，未生成可供本轮采样的新候选。本任务未更改该来源校验或其他 owner 的 pin，没有第二个 writer/构建覆盖。
- **运行**：结束时 disk 与 applied 均为 revision `4ee8edf7162a3188625beed5f099b0e915b1753a6e505be03aba2190a221765a`，SW `9f126e0f67bcc2d2e4d6dc71e363cf3529a508107b7108c592e65485ab050047`，extension ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。队列 r25、导航 r20 均 enabled/registered、authorization active、`document_idle`，没有自动升级业务包。
- **性能**：A 新候选真实 UI 和 10+3 **NOT_TESTED**；原完整 10+3 仍 FAIL：单页 P95 队列 4256.6 ms、导航 1721.4 ms、提示词 1007.3 ms；三页最大分别 10707.8 / 6466.3 / 534.7 ms。没有计算跨候选改善百分比，没有伪造 95+ 结论。
- **收尾**：TaskSpace **143** 已 `finish({keep:[]})` 释放；默认共享 Profile，不是权限隔离环境。Ego Lite 提示有可用更新，本轮未升级。当前原生 goal 实读仍为 null；旧 goal 状态未跨对话重查。

本机忽略证据新增：`preparation-a-task.patch`（本轮核心最小 diff）、`preparation-a-targeted.tap`、`preparation-a-build-blocker.txt`、`runtime-preparation-a-blocked.json`、`candidate-baseline-143-smoke.json`、`evidence-baseline-143-smoke.json`、`collect-baseline-143-smoke.mjs`；采样器仍含私有会话 URL，仅留本机。源码/Node PASS 不提升为 BUILD/RUNTIME/PERFORMANCE PASS。下一条操作是由 WebFlow owner 完成该固定源码的来源审查后复用原 watcher 核对 A 候选，再测一次 UI；有改善依据才完整同候选 10+3，不先改并发或重放任何未知动作。

## B 核心实施与真实开发观察（TaskSpace 146）

本节更新上述 TaskSpace 143 的历史状态。用户明确要求优化所有页面共用的 `executions` 链，并优先完成核心、只做直接相关验证，因此本轮实施 B；未进入 production、正式评分、全量 CI 或长期矩阵。**框架并发核心已实现；自动加载性能目标仍未达成。**

### 选择、实现和安全边界

改成 tool 引用类型不会自动缩短此启动链：队列已经是 tool 的 Page companion，仍由同一安装 Authority 执行。提示词快捷按钮走固定可信 Content，不能以换包类型取得这条信任路径。本轮没有更换业务包或将动态代码提权。

- `installed-programs.js`：原 mutation 队列保留；实际启动改为最多 **2** 个精确文档许可，键绑定 session/namespace/tabId/documentId，等待项最多 256。异步准备前确定同文档 FIFO；手动 Run 是全局屏障。真实三页发现第三页等待过久后，仅增加文档轮转：释放许可时优先另一个等待文档，不能越过手动屏障。父 main 返回后仍等待其在途子帧结算才交还文档许可，直接依赖子帧最多 16 项。
- `preview-admission.js`：仍使用原 `runs/@slot.preview`，installed 采用 truthy 的有界集合；Controller、手动预览、云控、开发刷新及 Offscreen 的原忙碌判断继续生效，不新增 Host/Authority/数据库。释放按原 nonce 做 CAS，不清除兄弟项；legacy singleton 不能被新文档加入。旧恢复释放路径原子限定为 legacy，不能绕过新集合的子帧检查。
- `preview.js`：保留手动 `active`，installed 有界跟踪文档；真实派发仍重新核对 source/proof、安装 token/generation、权限 epoch、原生注册及精确 document。最终槽检查和 Native 调用仍与 mutation 顺序互斥，不等待用户 main 才释放 mutation 队列。
- `preview-worlds.js`：原账本增加本次 pending binding，防止另一分配重置尚未绑定的世界；原生命周期引用的活动子世界也受保护。建立持久绑定后移除 pending；配置/探针失败只清除匹配 pending，保留已消耗的文档世界预算。
- `page-frame-runtime.js`：子请求在准备前登记共享占用，main 成功不释放未结算 child；retired 状态保持终态，迟到回执不能复活资源。unknown 在任何异步持久化之前同步阻止全局新派发；持久化失败不解除栅栏。已确认文档死亡后的迟到拒绝不会留下无槽位的永久栅栏。恢复按原父/子 UUID 对账，缺少绑定、cached/live/查询失败均保留，不重放。

同页用户源码仍串行，C 未实施。这些程序共享 DOM；当前包没有证明启动独立性的通用合同，本轮没有凭名称或 USER_SCRIPT 世界放开同页源码并发。

### 核心验证与专家评审

只运行与本次调度/槽位/世界/资源生命周期直接相关的检查，没有运行全仓测试。核心覆盖不同文档推进、并发上限、同文档防重/FIFO、轮转与多个同页等待项和手动屏障组合、fresh proof/source、停用、精确文档、nonce/CAS、子帧持有、失败释放、unknown 持久化失败和恢复不重放。

- 最新调度检查 13 项 PASS；随后将单独轮转案例替换为组合案例，轮转/上限/手动 3 项 PASS。
- 最新 admission 13 项 PASS；受影响 frame admission/runtime 及世界恢复/预算检查 PASS。详细命令与输出保留在 `concurrency-b-*.tap`，不将重复运行数相加。
- 独立 Architect 对安全架构修正后评为 **96/100**；另一 Code Reviewer 对轮转与组合证据评为 **96/100**。前者 29/30 正确性、24/25 安全、24/25 生命周期、10/10 范围、9/10 验证；后者为限定范围 COMMENT。**这是设计评审，不是加载性能、正式发布或完整验收的 96 分。** 导航/BFCache 配置清理仅维持原合同，冷启动、production、真实撤权 UI 和长期后台恢复仍 NOT_TESTED。

### 构建、安装与真实 UI 结果

原 watcher 已恢复构建，本任务没有修改 WebFlow pin、重启服务或增加第二个 writer。PID 45081 持续写 `dist/development`，复用 serve 43119 / guard 43120 和原安全更新链。队列 r25、导航 r20 最近读取仍 enabled/registered、authorization active、`document_idle`；本轮匹配程序增加为 6 项，包含 mouse gestures 与 subagent，不能与旧五项环境计算严格改善百分比。

下表是独立的开发 smoke，**不是完整同候选 10+3，也不是 P95**。所有已接受样本自身及其组内的 before/after 身份一致；不同候选从未拼接。

| 候选与采样 | 队列 ready→可用 | 导航 ready→可用 | 提示词对照 | 结果 |
| --- | ---: | ---: | ---: | --- |
| `17513953…`：一次单页 | 1676.0 ms | 1763.8 ms | 首扫已见 | 未达单页门槛 |
| `17513953…`：三页最大，轮转前 | 9398.6 ms | 10943.5 ms | 1001.5 ms | 未达三页门槛 |
| `09be0ea7…`：一次单页，轮转后 | 1872.3 ms | 2645.4 ms | 首扫已见 | 未达单页门槛 |
| `ad301e51…`：三页最大，轮转后 | 6715.6 ms | 14967.5 ms | 1715.6 ms | 未达三页门槛；见环境限制 |

这些已接受页面均有唯一可用 UI、无 bootstrap 错误或 20 秒缺失。对照“首扫已见”不表示真实物理零延迟。最后三页组仍开着采样器中断后留下的另外两张本任务 ChatGPT 页面，资源环境不是纯三页；保留原始观察，不据此认定性能改善或正式三页通过。另保留 `candidate-concurrency-fair-146-three-aborted.json`：重复的本任务页面 query marker 导致精确绑定歧义，采样器中断，未接受样本；修复仅在本机采样器，不修改产品迎合驱动。中途 revision 从 `09be0ea7…` 变为 `ad301e51…`，前后样本没有合并。

首个 B 单页的队列/导航 Native completion 约 19.2 / 13.0 ms，queueWait 约 1540 / 3351 ms；导航前的 reading-toc main 等待回执约 876.5 ms。三页还出现较大的 preparation、world allocation、metadata 与 completion 等待。起点不同，不相加为端到端指标。跨文档并发和轮转没有证明这些等待已解决，不能以设计分或 Node PASS 宣称目标完成。

收尾实读 applied revision `a0e39ae5ae2fd529d916f1ff28fdb161aca161c61482f052f4bb746530f3b829`，SW `5a7a2fc5d26bb183e63cbc39c35b78b3ca1a88c743035f95c2cff0e4c8e0ea4f`，扩展 ID 仍 `ccfcjegpkdlgbclopjmadlcjedelidmf`；该收尾 revision 没有性能样本，不能冒用 `ad301e51…` 的证据。TaskSpace 146 已成功 `finish({keep:[]})`，本任务页面全部释放，未改草稿、未发送 ChatGPT 消息。Ego Lite 提示可更新，本轮未升级。

本机证据：`concurrency-b-task.patch`、`concurrency-b-*.tap`、`candidate/evidence-concurrency-b-146-*.json`、`candidate/evidence-concurrency-fair-146-*.json`、`runtime-concurrency-b-final.json`。采样器含私有会话 URL，仅在忽略目录内。`latest.json` 保持原完整 `4ee8ed…` 10+3 失败证据；没有用 smoke 替换它。当前只交付框架核心与真实性能失败记录，不提交/推送；下一项性能工作应处理同页等待和初始化资源开销，不能靠继续增加并发或重复无关测试宣布完成。
