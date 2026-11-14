# ChatGPT 网页增强启动性能（2026-11-13）

本轮目标：已安装的 AI Send Queue 和 AI 对话滚动导航在 ChatGPT 的原生结构就绪后及时显示并可用，以同页提示词快捷按钮为对照。阶段为核心开发；不进入 production、正式发布或压力测试，不发送 ChatGPT 消息。独立源码评审不替代性能验收。历史启动可靠性记录见 [原续接](workstreams/page-startup-reliability-20261113.md)。

**当前结论（2026-11-14 续接）：队列、对应 assistant 导航及提示词控件在真实页面可见、唯一且可命中；性能仍未完成。148 两项 MED 修复已获独立静态复审 CLEAR，九个源码及既有 461/461 日志哈希一致；修复后的 af83ab/775b8e 开发候选已由 disk/applied/URL/VM 四处核实正在运行。155 新有效单次队列 upper=1002.4000005722046ms，严格 FAIL；导航 upper=861.1000003814697ms。没有向下取整、重复测同候选、创建新固定 N 组或执行 evaluator。原 goal 按用户要求仍 paused，未自动迁移/恢复/完成；production、全量 CI 和评分继续延期。146 的 1104ms、原固定组首轮 1141.3ms 及115历史字节缺口全部保留。详见末节“148 最终复审与155真实页面结果”。**

## 目标和判定

| 条件 | 本轮门槛 |
| --- | --- |
| 单页连续正常刷新 | 采样前固定每增强有效 N（默认 10，N≥10）及时间顺序/停止规则；就绪至 UI 可见可用的 nearest-rank P95 ≤1000 ms，N=10 时为最大值；不按中途成绩追加快样本 |
| 三页同时加载 | 同批三个均适用的不同页面/document，预先固定触发差上限和前后台安排；两个增强各页延迟 ≤3000 ms |
| 缺失与错误 | 20 秒仍缺失、bootstrap 错误、同一目标重复 UI、不可用均失败；单个 >20 秒样本不能被 P95 掩盖 |
| 同候选 | 每样本前后冻结扩展 ID、applied revision、实际 SW 字节 SHA，以及安装版本/包或源码身份、启停和批准匹配集合；任一漂移中止整组，不拼接，不要求匹配官方 Catalog |
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

## C 事务占用修复与测量纠偏（TaskSpace 20，2026-11-14）

**结果：未完成。** 本轮只修复已证实的独立读取事务占用，并收紧负时间差的判定；没有实现同页 main 并发，没有取得新的固定 N=10＋三页性能完成证据。修正驱动后的单次 smoke 仍慢，且队列在全部程序结算后被另一个匹配程序的浮层遮挡。下面分开记录源码、产物、观察和局限，不能用局部修复或评审分数代替达标。

### 复用、方案和最小 diff

先读取 B 末节、五个调度/生命周期文件及其相关 hunk、历史完整采样器和 evaluator。任务归通用 Page Program 平台；复用 `opendesk-extension-runtime`、原 Authority/IDB/Runner，不修改队列、导航等业务包。现有 main FIFO、最多 2 个活动文档、准备池 4 和账本查询 8 的边界均保留。FIFO 是当前实现，不是永久不可变合同；本轮没有足以放开任意同页 main 的 DOM/RPC/资源独立性证明。

源码证实：`readStoredPageCandidate` 的独立 readonly transaction 原来包住整个 `pageRow`，包括异步源码/manifest 哈希和固定资源校验；生产 `idb.js` 的 keepalive 会一直保留该事务，阻挡同 store 的 readwrite Authority 操作。最小调整是在该独立事务内读取并 clone 不可变快照，等待事务完成后再完整校验。外部调用方显式传入的 transaction 仍由原调用方 await，原子最终派发检查没有被拆开。

实际修改四文件，64 行新增、6 行删除：

- `src/scripting/user-scripts/dependency-manager.js`：仅移动上述独立快照校验边界。没有增加源码缓存、Worker、依赖或第二套基础设施；source/manifest、固定资源、依赖及 authoring 校验保留。
- `tests/environment/dependency-manager.test.mjs`：暂停哈希时，不相关写入能完成；当前调用仍得到原有效快照；下一次读取拒绝篡改。显式外层事务分支则仍挡住写入直至校验完成。
- `scripts/evaluate-page-startup.mjs`：可用时间早于 prerequisite 的 eligible 样本明确失败，不再 `Math.max(0, …)` 静默钳零。确有 UI 提前可用时仍需要连续观测形成可信上界，不能给此评估器伪造零值。
- `tests/environment/page-startup-evaluator.test.mjs`：覆盖两 cohort × 三增强的负差值、零边界和原始输入不变性；非法样本不补足有效样本数。原 schema、P95 算法和门槛未放宽。

门控先在旧实现上得到预期失败，再应用修复。独立事务释放只允许纯验证与无关写入重叠，不等于授权可缓存或用户 main 已并行。最终 fresh source/proof、安装 token/generation、permission epoch、原生注册、精确 document 和 mutation 顺序沿原链重核；unknown 全局栅栏、nonce/CAS、父子资源持有及手动屏障没有新增路径。

本任务没有执行暂存、提交或推送；执行中其他 owner 的同步提交 `5e35671f8` 已纳入这四文件，收尾与该提交内容一致。忽略目录中的 `snapshot-read-task.patch` 是仅含本任务四文件的可审阅 diff。若需撤回，先重查当前 hunk，只逆转本任务对应改动并复用原 watcher，不 reset main、不覆盖并行提交；本轮保留已验证的局部修复。

### 直接相关验证

这些检查用于证明缩短 readonly 占用不会把快照变成授权或拆掉显式事务边界，以及坏时间差不能制造 PASS：

- dependency-manager 定向文件 **36/36 PASS**；随后补入显式外层事务分支，更新的同一门控 **1/1 PASS**，不累计为 37 个不同测试。原实现的预期失败输出也保留。
- installed-programs 中 fresh source/proof/native/document、已准备安装变化、重复启动与 unknown 的相关选择检查 **10/10 PASS**。
- evaluator **18/18 PASS**；负时间差用例先在旧实现上失败。相关 JS 语法、解析和 diff 空白检查通过。
- 独立 reviewer 复核门控与边界，没有重跑全仓检查。真实 IndexedDB 竞争优势及撤权/替换新窗口的动态操作未直接验证；不能由串行存储 double 或 Node 结果推定浏览器性能。

证据为 `snapshot-read-before.tap`、`snapshot-read-after.tap`、`snapshot-read-atomic.tap`、`snapshot-read-authority.tap`。没有启动全仓测试、production 或额外构建命令；新产物由已存在的 dev writer 生成。

### 候选、安装集合与真实 smoke

开始即发现有效 dev writer **PID 85028**，原 guard **43120** / serve **43119** 正监听，锁根目录为本仓库；沿用 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development` 和原安全应用链，没有重启、覆盖输出或操作 `chrome://extensions`。使用新建的唯一 **TaskSpace 20**，共享 Profile；本任务只持有一张 ChatGPT 页和一张扩展诊断页。另有两张其他 owner/用户的 ChatGPT 页及现有 Side Panel，未关闭，无法排除背景负载。

纠正后 smoke 的样本前后均为：

- extension ID：`ccfcjegpkdlgbclopjmadlcjedelidmf`；management 实读 enabled、development、Developer 0.1.0。
- applied revision：`5a7e05a47a414ffdb76f82e286bf18a515c92901e0b088b49b900d8ad2859b96`。
- 磁盘 SW、扩展 URL 返回的 SW 字节及 applied 记录的 SHA 均为 `6e83fcdcc9246f83bc14bdde6a385d7297ae72d5e1a4d9e8e586368ca432f8b2`，当时磁盘 candidate manifest 同步一致。**这是字节和 applied 记录核对，未独立取得运行中 SW VM 的 Debugger script source，也未独立证明浏览器登记的加载路径；不能提升为完整组身份门禁已完备。**
- 安装 identity（source/manifest、token、installationId/generation、启停、批准 pageRules、父包 hash/内置身份）前后逐字段一致，不要求匹配当前官方 Catalog。本任务没有安装、升级、停用或改 runAt。

| 本次批准匹配程序集 | 安装 revision | source SHA 前 12 位 | 批准时机 |
| --- | ---: | --- | --- |
| `app.ai-send-queue` | 25 | `ab795b7ab732` | document_idle |
| `app.mouse-gestures` | 9 | `31694bf79286` | document_end |
| `app.reading-toc` | 13 | `920a815a64bf` | document_idle |
| `opendesk.ai-reply-mindmap` | 5 | `1e82bb337f5f` | document_idle |
| `opendesk.ai-scroll-navigation` | 24 | `15b5f924b997` | document_idle |
| `opendesk.subagent` | 2 | `6e5d6a757830` | document_idle |

六项均 enabled/registered、authorization active；完整匹配/排除集合和全部 hash 留在本机 raw candidate。初次诊断时还是五项，之后鼠标手势由并行活动加入；不同集合的观察不拼接、不计算改善率。历史导航 r20 已不是当前安装版本。

修正后的 `candidate-snapshot-20-smoke-bound.json` 是**一页、一次独立 document 的诊断，不是 P95 或三页结果**。采样前固定 smoke 1 次、目标扫描 25 ms、每增强首个 usable 最多等 20 秒、原生结构观察最多 30 秒；UI 后等待本 document 六个匹配程序精确安装回执全部 completed 且 slot 释放。结算等待上限固定 25 秒，仅引用现有 dependency preparation 上限；尚无覆盖整条自动 bootstrap 的统一 timeout，不能把这套 smoke 宣称为完整组采样器。

| 对象 | 原生就绪 → 首次可用观测 gap | 连续扫描给出的保守延迟区间 | 结论 |
| --- | ---: | ---: | --- |
| 队列：真实 editor/form 内按钮 | 2373.4 ms | 2349.3–2835.3 ms | 当前单次已慢；结算后又被浮层遮挡 |
| 导航：对应 assistant 所属 turn 的直属 native footer 内 Shadow 按钮 | 3016.7 ms | 2992.6–3050.6 ms | 唯一、可用，当前单次仍慢 |
| 提示词：公开 closed-shadow host 几何及可访问性 | 707.1 ms | 443.3–1169.0 ms | 对照；不声称精确物理延迟或 1 秒上界 |

三项 prerequisite/UI 均使用同 document 的 `performance.now()`，均在可见前台观测；首扫没有把已见 UI 记零，负值不钳零。本次最大扫描间隔 **461.9 ms**，因此必须保留区间。六项回执全部完成、无已捕获 bootstrap 错误或重复 UI，但结算后队列按钮中心实际命中 `opendesk.subagent.mini-chat.demo`，按钮自身未 disabled；这是真实可操作性冲突，`observed` 仅表示采集完成，不表示产品通过。本轮没有关闭该程序或改布局来制造 PASS，也没有点击发送或修改草稿。

驱动纠偏及原始材料全部保留：

- `candidate-current-20-smoke.json`：初次五项环境，旧口径含提示词负差，不能据此报零或达标。
- `candidate-snapshot-20-smoke.json`：URL query 标记后原生会话无法加载，属于原生入口中断，不能作为有效导航 N/A 或通过样本。
- `candidate-snapshot-20-smoke-unmarked.json`：旧探针选取 turn 后代工具栏，可能关联错误目标；因队列后续被遮挡，在导航 ready 后约 **18 秒**就停止。先前“导航就绪 20 秒仍缺失”的报告及 reviewer 对应 HIGH 结论已撤回，不能据此判真实导航缺失。
- `collect-snapshot-20-smoke-bound.mjs` 只最小修复上述 native footer 绑定和独立 deadline；对应新 raw 没有覆盖旧文件。结算后的队列遮挡作为独立失败保留。

没有依据进入完整 10+3，因此没有生成新 P95 或运行完整组 evaluator。完整采样器还须补齐精确绑定、实际运行字节身份、固定 N/替补与原始产品失败硬门禁、每增强结算截止及三页共同单调触发基准；历史采样器不能直接冒充已满足新增合同。`latest.json` 保留原 `4ee8ed` 完整失败组，全部私有会话 URL 仅在本机忽略材料内。

### 主要剩余等待、独立评审与继续条件

纠正后 smoke 的 navigation `queueWaitMs` **3617.6**、native completion **18.5**；queue 的对应值约 **781.3 / 18.2**。同期 mouse gestures 的 allocation **659.9 ms**、native **438.3 ms**，TOC native **1038.8 ms**，导航 metadata **213.2 ms**、postCompletion **244.3 ms**。这些阶段起点不同且 total 不含全部 finally/外层结算，不能相加成端到端延迟，也不能据此把目标全部等待指定给某一程序。

一次静止状态只读拆查（`world-ledger-readonly-20.json`）读取 1378 条执行记录、1216 条 lifecycle 和 42 条 session mirror，对缺失的 441 个 document 仍按最多 8 项查询；全部明确 absent，IDB 约 **16.8 ms**、查询约 **9.3 ms**、合计 **29.6 ms**。该诊断不修改账本、不开源码执行、不缓存负结果；它不能解释启动负载下约 660 ms 的整个 allocation。因此下一处具体性能诊断应在现有 allocation 分开记录世界串行等待、账本/配置重核、native configure/三次隔离 probe 及其 IDB 争用，再决定可以有界重叠的阶段。TOC main 的 AppPage RPC 等待也继续是候选；不要无证据建立大型源码缓存、删精确查询、释放未结算 child 或按程序名称开快车道。

独立原生 Architect/Code Reviewer 均继承父模型/provider，无浏览器和 dev writer 写权限。实际限定评分如下，均未达到 >95：

| 用户 rubric | Architect | 最新 Code Reviewer | 扣分/未验证 |
| --- | ---: | ---: | --- |
| 瓶颈及因果 25 | 22 | 21 | −3 / −4：源码因果成立，但真实端到端贡献及剩余等待归因不完整 |
| 并发资源正确性 25 | 25 | 23 | 0 / −2：原边界保留；真实 IDB 竞争回归未直接验证，没有新同页 main 并发证明 |
| 授权/生命周期 25 | 25 | 23 | 0 / −2：源码检查保留；新增窗口的撤权/替换动态竞态未验证 |
| 测量与范围 15 | 10 | 10 | −5 / −5：10+3 未完成；reviewer 另明确扣分包含扫描间隔限制 |
| 最小性/维护性 10 | 10 | 10 | 不扣分 |
| 合计 | **92/100** | **87/100** | 局部源码可保留；整体性能 REQUEST CHANGES |

Architect 是局部源码/方案评审；最新 reviewer 另独立读回并重算修正后的 smoke，撤回旧导航缺失判断。源码新增问题数为 0，不代表整体无故障；queue 浮层遮挡仍为 HIGH 产品阻断，不能由总分通过。LSP 工具未可用，未出具完整类型质量批准。没有为分数单独循环或恢复历史 96 分。

收尾三种身份分别记录在 `runtime-snapshot-20-final.json`：源码四文件 SHA 与限定 diff 相符（runtime 文件 `fd6ada3f345aeca64ddac49ceca13f0806195e2c257cb3b0a0d81494e7c80b81`）；applied 记录和扩展 URL 返回 SW 仍为上述 `5a7e05 / 6e83fc`。**磁盘此时已无有效 `development-update.json`**：原 watcher 在并行来源变更后报 `Trusted AI Proxy source changed; review and re-pin: projects/ai-proxy/src/ui/ProxyIcon.tsx`，保留的 sw.js 相同也不能证明完整构建。见 `snapshot-20-build-blocker.txt`；本任务未改该业务或 pin，没有重启/绕过安全守卫。这是新出现的 AI Proxy 阻塞，与已解除的历史 WebFlow 问题分开。

继续运行测量需由原 AI Proxy owner 完成实际来源审查并让原 writer 生成完整、稳定且可安全应用的候选；不以恢复磁盘为由放宽来源保护。独立的下一项性能工作是上述 allocation/RPC 关键段取证，队列遮挡交原浮层/业务 owner 修复；在原资源/依赖证明缺失时保持保守派发。新候选先做直接 smoke，有改善依据且操作可用后再冻结 N=10＋三页，不复用或拼接本轮诊断。

本轮不提交、推送、建分支/worktree/PR，不修改 Native 配对或 installed 业务包。TaskSpace 20 已成功 `finish({keep:[]})`，仅关闭本任务 p1/p3；原 dev writer 及用户/其他 owner 页面保留，回执为 `snapshot-20-release.json`。冷启动、production、真实撤权 UI、长期恢复与跨浏览器矩阵仍 **NOT_TESTED**。

## D AppPage 重复查询、世界阶段取证与浮层修复候选（TaskSpace 27，2026-11-14）

**结果仍未完成。** 当前队列 smoke 超过 1 秒，原安装的 Subagent r2 在结算后遮挡队列；新的 CSS 只完成页面临时验证和 r3 构建，未完成真实安装。没有新的 N=10、三页或 >95 结果。原目标实读仍为 active，不标 complete，也不把本轮首次环境阻塞标成 goal blocked。

### 真实入口、归属与最小改动

沿用既有 dev writer PID 85028、43119 serve / 43120 guard 和 `dist/development`，没有启动第二个 writer、静态 Browser build、替换扩展或访问扩展管理内部页。AI Proxy 的上次来源阻塞已由原 owner 解除；本轮未改其业务或 pin。一个目标使用 TaskSpace 27，保留其他 TaskSpace、其他 owner 页面、原 Native 配对和服务。

任务复用 `opendesk-extension-runtime` 维护通用执行链，Page 业务按 `opendesk-script-authoring` / `opendesk-program-publish` 由真实 `projects/subagent/` owner 处理。实际下一操作为刷新已匹配 ChatGPT 文档并使用原生 editor 内队列、assistant 直属 footer 导航；不发送消息、不改草稿、不停用六个匹配程序、不改 runAt。

本轮改动：

- `installed-programs.js` 的 `appExecution` 将 `nativeAPI()` 的无过滤可用性读取加随后 filtered 读取，合并为原 `readNativeUserScripts(api,{ids:[row.nativeId]})` 的一次精确新鲜读取。原生内容比对、真实 Sender、父包/授权、URL/document、nonce/world/session、权限和存储后复核都保留；没有缓存授权或扩大作用域。
- `preview-worlds.js` / `preview.js` 增加固定名称的阶段时长，分别观察世界串行等待、两次账本恢复内部 session/IDB/document 查询、配置清理、持久预留和三次隔离 probe。观测回调错误不影响分配，不等待其 Promise；诊断值不参与 Authority、预算、清理或派发决策。main FIFO、最多两个活动文档、准备池 4、账本查询 8 和独立世界探针保持原合同。
- `projects/subagent/src/mini-chat/view.js` 将浮层移到 composer 上方。底部间距和最大高度复用 `--od-mini-bottom`，高度扣除同一间距及顶部 16px，使用 border-box、vh fallback 和 dvh。只改展示，保留原任务恢复/unknown 语义；项目版本为 0.2.2。没有修改其既有待查 A→B→A 请求或触发任务。
- `app-page-programs.test.mjs` 新增行为回归：授权只查询一次精确 nativeId，后续原生注册被替换时仍重新读取并拒绝。**47/47 PASS**。Subagent view **9/9 PASS**；相关四个 JS 语法及限定 diff 空白检查通过。诊断作者报告已有世界分配/生命周期定向检查 1/1 PASS；不累计成全套回归或真实 Chrome 安全验收。

取证明确否定“直接复用第一次 ledger 再整体回写”的捷径：`ordered` 只串行当前实例，等待 native 配置清理时另一个实例可持久化新世界或 unknown。旧快照可能覆盖身份/状态或漏算预算；原跨实例 unknown 回归必须保留。本轮没有引入大型源码缓存、负 document 缓存、按程序名快车道或任意同页 main 并发。

### 两次独立 smoke 与计时局限

`candidate-instrumented-27-smoke.json` 与 `candidate-fixed-viewport-27-smoke.json` 都是独立的一页一次诊断，**不拼接**。前者 applied revision `a990ac6f18e0960e9234e830383a73ab4d2fb8ed417918913c6fedba23cfa1c5`；后者为 `4393a5c08601cb440f041cda6dbbeb3ebbd0924004b5db19dc54796ddad8f0c0`。两次 SW 字节相同，但完整 revision 不同，不以此计算优化率。每次前后 applied、磁盘/扩展 URL SW 和全部安装字段相等；六项安装集合仍是 C 节表中的 queue r25、mouse r9、TOC r13、mindmap r5、navigation r24、Subagent r2。

| 独立诊断 | 队列 native ready → 首次可用 gap | 保守延迟上界 | 结算后队列 |
| --- | ---: | ---: | --- |
| instrumented-27 | 2716.9ms | 2965.9ms | 命中 Subagent，失败 |
| fixed-viewport-27 | 1819.3ms | 2122.8ms | 命中 Subagent，失败 |

第一轮 queue `queueWaitMs=1336.9`、allocation 219.7ms，世界串行锁等待 0；navigation 的 queue wait 3576.5ms、allocation 57.5ms；mouse 两次 ledger 为 252.1/412.7ms，allocation 814.2ms。第二轮 navigation queue wait 3666.5ms，mouse `authorizeTargetMs=899.5`、allocation 616.2ms；TOC native completion 589.2ms。**世界串行锁不是这两次主等待**，完整世界分配、IDB/document 恢复及前序 main 仍有成本；嵌套时长不能相加当作端到端归因，也没有本次 AppPage 去重的可归因前后对照。

两次 raw 的 navigation 都记 `missing`，但不能直接断言注入缺失：原生侧栏打开改变 viewport；后续诊断在 viewport 变化后实际观察到直属 footer 下的唯一导航及命中。第二个驱动记录扫描时 1317×662，并保留原始 missing，仍不能仅靠事后几何解释其全部 20 秒过程。需把当前长回答/footer 适用条件、动态布局和匹配导航 r24 与当前源码版本的差异分开定位，不能把旧 descendant toolbar 当通过证据，也不为 raw 改成 N/A。

扫描目标 25ms，但实际最大间隔分别 314.1/303.5ms；原始差值与上界均保留。第二轮提示词提前出现（raw −630.9ms），连续扫描覆盖 ready 后可用，保守上界 303.5ms；没有把负数钳零喂 evaluator。每项 UI 独立等 20 秒，native prerequisite 等 30 秒；随后六个匹配安装回执精确 completed 且 slot 释放才结束，不在 pending main 上刷新。两个样本都等到了六项结算，没有捕获 bootstrap error，但首次可用不等于持续可用。

这仍是 smoke 驱动：25 秒结算上限仅来自 dependency preparation，不能证明覆盖整个 bootstrap。完整采样还须固定整条结算策略、原始产品失败/替补门禁、每次运行 VM 身份、持续/最终可操作性及三页共同单调触发和背景计划。操作未可用，故没有运行 N=10＋三页及完整组 evaluator；`latest.json` 未覆盖。

### 浮层临时证明、未安装候选与真实身份

开始先检查实际堆叠上下文和队列中心命中：旧 Subagent 在右下角遮挡原生 form 内的队列。临时改 CSS 后，1317×662 下队列中心与 Mini Chat 输入均命中自身。独立 reviewer 指出矮窗口高度常量失配后，采用上述共用变量修正；931×400、以 CSS 将 Mini Chat 高度撑至 1000px 的临时检查得到实际 height 224px、top 16px、bottom 240px，容器仍在视口内。这是 **temporary CSS proof，非已安装持久生效**，不包含发送或编辑草稿。

最终候选在 `artifacts/page-startup-20261113/subagent-27-sizing/subagent.opendesk-page.json`：revision 3、版本 0.2.2、sourceHash `93533a18ee742d3002fafcd46f59317f36451c9e3e4c8e0f86b9b4787e4ddf9d`、packageHash `41d570da64c33fc899e62b7f0ea8cfd2bb66db8dfe65f0252705f6c6b4c410b2`。通过原 program/page 打包器生成，构建仍为 BUILT_UNVERIFIED，不是 Available/Installed。修正尺寸后向旧不可变输出目录写入被 `E_BUILD_IMMUTABLE` 正确拒绝，随后使用新的 sizing 目录，未覆盖旧候选。旧 `subagent-27` 只是修正前材料，不能再用于安装或收尾身份。

真实安装入口仍为「扩展 → 网页增强」原审阅链。本轮 ego 能创建 native Side Panel context，但未取得持续可见、可定向操作的原生安装页面：先观察到零尺寸 hidden，后续为非零尺寸但 hidden；再次打开时 runtime context 存在，却未取得对应可操作调试 target。一次原生 surface inventory 也超时。没有在隐藏文档伪造 focus/visibility、直接调用 Authority、改 IDB、注入新包或用临时 CSS 代替安装。此限制尚未解除，当前实际安装仍为 r2。

最终只读 `runtime-snapshot-27-final.json` 证明：磁盘、applied、扩展 URL 返回以及 **运行中 SW VM 的 Debugger script source** SHA256 四者均为 `4ee734f6980c4051d7db0002a45434e4814b590b8c08137d45597daf48d31f27`；revision 为上述 `4393a5…`。这补足最终时点的 VM 读取，但不能追认两次 smoke 前后都已执行 VM 门禁。浏览器登记的实际加载路径仍未独立读回，仍须区分源码、完整构建、安装、运行身份。

### 独立评审及剩余工作

继承父模型/provider 的独立 code reviewer 只读实际限定 diff 与第一轮 raw，评分 **77/100，REQUEST CHANGES**：瓶颈/因果 16/25，资源正确 21/25，授权生命周期 25/25，测量 7/15，维护性 8/10。主要扣分为性能仍超标、缺少可归因对照、r3 未安装、未完成 10＋3、扫描间隔及持续可用性不足。无新增授权绕过。尺寸失配 MEDIUM 已在源码修正，reviewer 定向复核确认关闭；总分保持原分，不因局部修正制造 95+。

下一条需要完成的真实操作是：在可定向操作的原生「扩展 → 网页增强」里审阅并更新同一 Subagent r3，再核对实际安装 sourceHash/版本及结算后队列、Mini Chat、导航的可见/可操作状态。安装集合改变必须另冻结候选，不复用本轮样本。当前 native UI 能力未恢复前，禁止把 Node PASS 或临时样式提升为安装闭环。

性能方面仍需沿已证实的前序启动队列/新鲜 Authority 与账本成本做最小定位；若考虑复用恢复结果，必须保留 fresh session/持久记录、absent 精确重查、跨实例新增世界与 unknown 的保护。当前没有可安全跳过该复核的证明。核心 smoke 可用并有改善依据后，才补齐采样器硬门禁并执行同候选固定 N=10＋三页，再运行 evaluator。没有提交、推送、分支、worktree、PR、production 或无关全组测试。私有会话地址只留本机忽略材料，不写入本节。

收尾回执：TaskSpace 27 已 `finish({keep:[]})`，仅关闭本任务 p1/p4/p5；此前按本任务 windowId 关闭自己打开的 Side Panel。原 writer 锁仍为 PID 85028 / token `207022e7-db7b-4d3e-bf8a-7ad2dc1199b4`，未停止服务。回执保留为 `panel-27-release.json` 与 `taskspace-27-release.json`。

## E 同页有界父执行候选、适用几何与交接阻断（TaskSpace 30，2026-11-14）

**结论 REQUEST CHANGES，未完成。** C2 把两个活动文档上限改为全局最多两个父 invocation，允许不同程序同页重叠；同程序同 document 跨 revision 保持串行，手动 Run 保留 FIFO 屏障，子帧按 executionKey/nonce 归属。世界分配串行和两次新鲜账本恢复、最终 Authority/原生注册/精确 document、unknown 和父子资源保护保留。这个改动会改变不同程序的启动顺序，不能宣称任意第三方 DOM 逻辑都可交换。

改动归原 `preview-admission.js`、`installed-programs.js`、`preview.js` 及三项 admission/installed 测试；D 节计时与 AppPage 精确读取继续保留。定向调度/准入三组 **263 PASS**；父包与 managed lifecycle **108 PASS**，日志 `c2-parent-world-targeted.tap`；新增 `page-installed-owner-coexistence.test.mjs` **2 PASS**，用真实编译的导航/Mindmap 在两个启动/清理顺序下证明共享 footer 的独立管理、配置待决及原按钮/草稿保留。该 JSDOM 检查不是六程序原生可见性或性能证据。

独立只读 reviewer 在上述测试通过后复现两个未覆盖的 **HIGH**，均尚未修复：

1. `installed-programs.js` 的 `scheduleDocument` 先入队再 canonicalize owner；缺失 nativeId 的畸形消息抛 E_SCHEMA，却留下 ownerKey 未定义的项，阻塞后续合法启动。需在入队前核验同步 owner，并确保异步初始化失败移除/拒绝且恢复 drain；补畸形消息后合法自动启动和手动 Run 仍前进。
2. 独立 late-resource job 把 requestId 用作 reservation receiptNonce，retire 消息仍携父 nonce，无法匹配运行项，退役排在自身待决 Native 执行后。需分离父路由身份与 reservation nonce，以父身份和 requestId 定位精确运行资源；补 Native 待决时及时退役，以及迟到失败不复活 fence。不得删除既有退役身份/授权检查。

reviewer 结论为 REQUEST CHANGES，没有授予 >95 或整体安全批准；LSP/ast-grep 不可用，语法/Acorn 只补充局部检查。两位本轮子 agent 已关闭，不交接活跃写入者。

导航适用性已用本任务真实会话的只读几何对照复现：1317×662 时回答 height 370px 小于长回答阈值 396.5px，原 native footer 就绪但导航不适用；1317×585 时阈值 346.45px，出现唯一 assistant 直属 footer 导航。931×641 也可适用。原 missing raw 保留，不追改成 N/A；不能把普通 user footer 的另一组导航算重复。见 `nav-30-viewport-applicability.json`、`nav-30-real-geometry.json`。

新独立一次 smoke 为 `candidate-30-c2-smoke.json`，驱动 `collect-30-c2-smoke.mjs`，固定 1317×585。revision `923462278136069398768323b66fa3ff4b68271a3e8a2d2800d75d4b94a01d5a`，SW SHA `61238d76c26a9c20b419155798f7a362a3d020a362d811e2ffa46f4d674735ee`；每次前后磁盘/applied/URL/实际 SW VM 的 Debugger 源字节及完整安装集合相等，仍是原六项版本，Subagent r2 未更新。无 bootstrap error，六个精确回执 completed 且 slot 释放。

| 一次诊断 | ready→首次可用 raw gap | 保守上界 | 全部结算后 |
| --- | ---: | ---: | --- |
| 队列 | 3329.0ms | 3646.9ms | lost-usability，失败 |
| 对应 assistant 导航 | 4167.7ms | 4200.3ms | 唯一可用 |
| 提示词对照 | 27.3ms | 345.2ms | 可用 |

最大扫描间隔 646.1ms；raw 同时记录 visible/hidden，当前诊断页调用/前后台安排尚未形成完整采样硬门禁，因此不是固定前台合格样本，更不是 P95、三页或可归因提速。必须保留真实 queue lost-usability；不能因驱动限制丢弃产品失败。导航 queueWait 4809.3ms、TOC native completion 1455.3ms；其余嵌套时长不能相加当端到端因果。UI 每项 20 秒，native prerequisite 30 秒；120 秒只是诊断结算 watchdog，明确不冒充整个 bootstrap 合同。此次实际等到了全部结算才停止，没有在 pending 上刷新。`latest.json` 未覆盖。

安装仍是下一条未完成的用户操作之一：经原生「扩展 → 网页增强」审阅并更新 D 节 sizing 目录的 Subagent r3。只读 CUA 能找到原生安装列表，`chrome.debugger.getTargets()` 能定位本任务 native panel 并读取 DOM，但其实际宽高为 0×0，尚不可操作。没有伪造 focus/visibility/geometry、直接调用 installer/Authority、改 IDB 或强抢原生输入。最近 native UI 锁归其他 owner，开始时重查并按既有 ui-acquire/ui-release 协调；不是自动审批拒绝。r3 BUILT_UNVERIFIED 与实际 r2 的差别保持。

用户要求创建新对话继续完善：先修两项 HIGH 并补定向回归，再完成 r3 真实安装/队列结算后可操作性，再依新数据定位性能、修正采样器，烟测有改善依据后才做同候选 N=10＋三页与 evaluator。当前源码、构建、安装和运行证据分开，不补做 production/全量矩阵或评分循环。唯一记录继续本文件，私有地址仅留本机 artifacts。

交接时原对话 `01a1d669-4ab1-7600-b46a-c1de95fc57b8` 的 goal 实读 active，未暂停/完成；工具不能跨对话迁移目标。TaskSpace 30 仍活动并交给续接 owner，现有 p2 为本任务 ChatGPT 页、p3 为诊断页，p1 已因安全扩展重载消失；不新建 Space 规避 target 失效，不在交接后重复操作。原 PID 85028 writer、固定输出与其他 owner 服务/页面保留。若继续时 Space 已不存在，按官方 guide 的续接规则处理。新对话创建状态和首条正文核对由实际工具结果另报，不以本节代替。

## F 初始化与精确退役修复、测量驱动及当前阻塞（TaskSpace 30，2026-11-14）

**结果：四项已复现的调度/退役缺陷已修复，性能目标仍未完成。** 畸形引导后自动启动及手动 Run 能继续；独立 late-resource 在 Native 持续待决时可以退役，迟到拒绝不恢复 unknown 栅栏；手动重跑可先完成旧世界资源清理；伪造退役不能释放主执行或其他父执行的资源。上述是组件行为与限定复审结论，不能替代真实 Chrome、Subagent 安装或性能通过。

本节 owner 为 `01a1d6a1-f7bf-76d1-9ae6-84ddf18b0eb3`，继续原 Space 30 和 `main` 未提交改动。任务归通用执行链，使用 `opendesk-extension-runtime`；未改业务包、安装身份、站点范围、runAt、两父执行上限、准备池或世界预算，未新增缓存、依赖、Runner、Host 或 Authority。D/E 的未安装候选和历史 raw 原样保留。

### 已证实缺陷与最小修复

- `installed-programs.js`：同步 document/owner key 在入队前构造；异步 owner 读取或 key 构造失败时，移除并拒绝该项后继续 drain，避免 undefined-owner 成为永久 FIFO 屏障。
- 同文件将父路由 nonce、resource requestId 与 reservation nonce 分开；运行中资源按精确 document、executionKey、父 nonce 和 requestId 归属。`retire` 是对原资源销毁的控制观察，直接进入既有完整身份/退役检查，不排在等待该 disposer 的独占手动 Run 后。正常 execute 继续走原调度与授权。
- 独立复审另复现手动 Run 等待旧世界 disposer、而 disposer 的 retire 又排在该 Run 后的环路；真实 managed registry 的组件回归先失败，再以以上控制路径修复。没有通过取消资源或跳过清理消除等待。
- `preview-admission.js` 的原 release 增加可选 `installedResource` 绑定：在同一持久事务内核对 namespace、executionKey、当前 session、tab/document、父 nonce 及精确 shared child 或 standalone resource，才移除资源；主执行、兄弟资源和不匹配绑定不写入槽位。原因是无记录 retire 可以合法返回 `retired/notDispatched`，仅凭其结果和裸 requestId 不能释放别人的 reservation。既有可信 release 调用不变，迟到 Native 拒绝仍受 retired 终态保护。
- `installed-programs.js` 只增加数据计时 checkpoint，将原 preflight/boot prepare 分成安装读取、grant/document、descriptor/编译、fresh material/proof、原生注册/marker 和 admission。字段不参与授权或调度；没有因此省略 fresh source/proof、真实 sender、精确文档、撤权及最终派发事务检查。

回归先后证据位于忽略的 `artifacts/page-startup-20261113/`：`31-high-before.tap` 记录原两类失败，`31-rerun-before.tap` 记录旧 disposer 环路，`31-retirement-scope-before.tap` 记录退役误释放；修复后分别有 `31-high-final.tap`、`31-retirement-scope-after.tap`。六个直接相关调度/admission/managed lifecycle/frame 文件最终 **341/341 PASS**，日志 `31-scoped-final-targeted.tap`。随后将复审的跨父 A→B resource no-record 伪造退役及旧 session 负例持久化到测试，新增/受影响两项 **2/2 PASS**，日志 `31-retirement-broker-targeted.tap`；不把重复运行相加。相关 JS 语法及限定 diff 空白检查通过。未运行全仓测试、production 或真实撤权 UI。

### 两条独立诊断，均非性能通过

本轮采集器 `31-collector.mjs` 先在可信扩展诊断页建立只读后台监控，再导航被测页；测量区间只用不激活诊断页的 `task.tabs()` 读取状态，冻结 UI 观测后才读回原始结算。避免 ego 的 `Page.evaluate/cdp` 激活诊断页造成被测页 hidden。保留每次实际扫描间隔、可见性、带符号差值/保守区间、最终 hit/AX、六个精确 automatic completed 回执与 slot、每次前后完整安装身份及磁盘/applied/URL/实际 SW Debugger 源字节。34 项离线驱动门控检查通过；它仍是单条 smoke 驱动，**完整 N=10 与三页编排、完整结算策略和全部硬门禁未完成**，不冒称完整验收采集器。

固定 viewport 1317×585、目标扫描 25ms、实际间隔资格上限 100ms 均在运行前确定；20 秒 UI、30 秒 native prerequisite、120 秒诊断结算 watchdog 未放宽。120 秒不代表整个 bootstrap 合同。两次均无 hidden 转换，最终六项精确 completed、slot 释放；没有在 pending 上刷新，也没有发送消息或修改草稿。驱动资格失败仍保留产品失败，不用它剔除慢样本。

| 独立诊断 | 队列 | 对应 assistant 导航 | 限制与失败 |
| --- | --- | --- | --- |
| `31-smoke.json` | raw 2883.3ms；保守上界 3211.9ms | raw 2491.1ms；上界 2526.8ms；最终唯一可用 | 最大扫描间隔 328.2ms；队列 lost-usability，旧 Subagent r2 遮挡仍在，整条 rejected |
| `31-stages-smoke.json` | ready 后 20 秒未可用，随后 native composer 消失 | 无适用 native assistant/footer，未记为通过或 0 | 页面实际显示“无法加载此 ChatGPT 对话”；最大扫描间隔 340.4ms；保留 prerequisite/UI missing 和最终不可用，整条 rejected |

第一条提示词 raw 25.1ms、上界 353.8ms。第二条提示词 raw −317.9ms，连续观测区间上界 318.3ms，但最终原生前提消失；没有钳零或将其喂给 evaluator。两条均不是 P95，不拼接。第二条是新的真实网站入口失败，不能把六个 completed 等同于 UI 成功，也不能据此修改产品来适配不可用的会话。

`31-smoke` 的候选为 revision `052f1ae95f651abf04a696331e0d9ad99d63a6b75b13de1fe691db7d35c44d71`、SW `66fa2596a3178c67033b01763665f3e94cb74943493bd22881c70e622f6cde64`；未包含后来新增 checkpoint 和 scoped release。`31-stages-smoke` 及最终只读快照对应 revision `7e603d5f268daf6e8cfdecd920bb8841a21c979406d7b54ce3eb1b022362c81b`、SW `70d28295099aab8587e55715560a701603412bbbf0765d8c4081976af02e2e0b`，磁盘/applied/URL/实际运行 VM 四者一致；完整安装投影前后相同。不能用前一条数据追认最新字节的性能。

新 checkpoint 在第二条记录到 queue preflight 602.1ms，其中 descriptor 407.6ms、invocation preparation 115.7ms；boot prepare 161.4ms，其中 marker 118.9ms；世界分配 411.7ms，其中世界串行等待 60.4ms。导航 queue wait 1757.4ms、世界分配 137.8ms；TOC native completion 749.8ms。它把准备开销与队列/世界等待分开，但 descriptor 仍包含多项 fresh source/proof/父包/注册工作，不能凭该合计再引入缓存或认为某一 IDB/RPC 已被证明是根因；嵌套时长不相加为端到端贡献，也不计算跨候选改善率。

没有新的完整 10+3 或 evaluator 结果，`latest.json` 未覆盖，性能门槛及目标 **未达成**。

### 安装、开发环境与资源状态

实际安装仍为 E 的六项：queue r25、mouse r9、TOC r13、mindmap r5、navigation r24、Subagent **r2**，均 enabled/registered、authorization active。Subagent r2 sourceHash 仍是 `6e5d6a7578307a94627f8a785703af7e35e4d5fba067ea8ec5d5c5ef42649665`；D 的 sizing r3/version 0.2.2/sourceHash `93533a18ee742d3002fafcd46f59317f36451c9e3e4c8e0f86b9b4787e4ddf9d`/packageHash `41d570da64c33fc899e62b7f0ea8cfd2bb66db8dfe65f0252705f6c6b4c410b2` 仍 **BUILT_UNVERIFIED，未安装**，不能用 Browser 固定代码更新代替该审阅升级。

`ui-acquire` 数次返回 `native UI busy; do independent work, retry after owner releases`，锁仍归其他 owner；本任务未持有 UI 锁，未强抢/释放他人锁。原生 surface inventory 一次 30 秒超时，无可定向操作结果；最终 runtime context 也无本任务 SIDE_PANEL。普通顶层 sidepanel.html 只用于可信诊断，不作为安装管理替代。没有自动审批拒绝，没有直接调 installer/Authority、改 IDB、伪造 visibility/focus/geometry 或全局粘贴。受影响的原生更新动作暂停，独立源码、驱动与组件验证已完成。

开始时原 PID 85028 已退出、43119/43120 无监听，才恢复原 `npm run dev` 及唯一受 guard 保护的 `dist/development` 输出。恢复后的 PID 57276 随后有明确 `Reached heap limit` 的 4GB Node OOM，非源码/来源校验失败。确认其退出且无第二 writer 后，仅本次命令临时加 `NODE_OPTIONS=--max-old-space-size=8192` 重启原入口；当前唯一 writer PID **61448**，lock token `e0fe8d51-0646-48f1-bb4b-ec48ad58b1f1`，43119 serve/43120 guard 均监听，日志 `/private/tmp/page-startup-31-development-recovered.log`。未修改全局环境、来源 pin、扩展 ID/Native 配对，未终止其他服务；这不是长期内存问题已修复的声明。最终快照 `31-final-runtime.json` 保留源码哈希、构建/运行身份、安装及空闲槽位。浏览器登记加载路径仍 **NOT_TESTED**。

本任务 probe/monitor 已停止，new-document 脚本移除；最后确认精确结算及无占用后恢复 viewport，关闭本任务临时诊断页 p6，清除其 DevTools 暴露。旧诊断 p3/p4/p5 因安全扩展更新消失，未复用失效句柄。Space 30 的 p2 保留待继续，目标未完成，未以 finish 伪报收尾。两名独立原生子 agent 已关闭；其他 owner 的文件、页面、Profile、服务与输出保留，未暂存/提交/推送/建分支/worktree/PR。

### 独立复审与下一条操作

继承父模型/provider 的独立 reviewer 最终确认 scoped-release HIGH 关闭，本次限定审查无剩余 HIGH。reviewer 又独立验证跨父资源伪造与主 nonce 不能清槽、unknown 保护继续保留；后续上述两项回归按其建议入库。评分不是整体批准，且早于最后一条网站失败诊断，不追认新数据：

| rubric | 源码/测试 | 包含运行证据的评分 | 主要扣分 |
| --- | ---: | ---: | --- |
| 瓶颈因果 /25 | 22 | 17 | 尚无达标或可归因端到端改善 |
| 并发资源 /25 | 24 | 23 | 原生并发与完整采样不足 |
| 授权生命周期 /25 | 24 | 24 | 未有对应真实 Chrome 撤权竞态证据 |
| 测量范围 /15 | 12 | 8 | r3 未安装、扫描资格失败、完整 10+3 未完成 |
| 最小维护 /10 | 9 | 9 | 保留诊断/生命周期复杂度 |
| 合计 | **91/100** | **81/100** | 未达到 >95，整体仍未完成 |

下一条真实操作仍是合法取得原生 UI 资源并在可操作的「扩展 → 网页增强」审阅更新同一 Subagent r3，读回安装身份；同时需原适用 ChatGPT 入口可加载长回答/native composer。随后确认全部结算后 queue/Mini Chat/对应 assistant 导航都可操作，再依据 fresh 阶段数据决定最小性能修复。单条可用且有改善依据后，才完成完整采集编排/结算门禁并冻结 N=10＋三页，运行原 evaluator。当前没有这条安全执行路径，不循环重放、换 Space、强抢 UI 或用无关测试维持续跑。

本对话 goal 已按请求创建，实读仍 **active**；本轮首次遇到该阻塞，不满足连续三 goal turn 的 blocked 条件，也不标 complete/paused。原对话 goal 未跨对话同步。冷启动、production、真实撤权 UI、长期恢复、跨浏览器矩阵继续 NOT_TESTED。私有会话地址只留本机忽略 raw，不写本记录或交付摘要。

## G 续跑的采样门禁修复与会话恢复（TaskSpace 30，2026-11-14）

上轮为实质进展；本轮开始重查，原生 `ui-acquire` 仍返回 busy，唯一 dev writer PID 61448 仍活着。本轮未改产品源码/安装、未新增 startup 样本，也没有重跑已通过的产品测试。下述驱动修复不追认 F 或更早 raw 为合格样本。

发现 F 采集器只保存了完整 AX 树，并未硬性核对提示词公开宿主内存在可操作控件。现于本机忽略的 `32-prompt-accessibility.mjs` 实现：从公开 `[data-opendesk-prompts]` 宿主取得 backend identity，沿 AX 子树确认归属，要求非 ignored、有名称、enabled/focusable 的 button；读取该 AX 控件的几何中心，用公开 `document.elementFromPoint` 验证命中同一宿主及位于视口内。未读取关闭式 ShadowRoot 的内部 DOM。其他区域的按钮、disabled/空宿主、错误 backend、遮挡、脱离文档或 viewport 漂移均不能填补成功。

`31-collector.mjs` 调用该门禁；早期宿主扫描仍保留原 signed gap 和区间，但明确只是 public-host 证据，不能当作关闭式 shadow 内按钮早已可用。最终 AX/实际命中才构成控件可用性证明，另记录对应确认时点及保守上界；超过 UI deadline 或缺证明则失败，不捏造 first-appearance 时间，也未构造 evaluator 时间戳。新门禁与既有驱动检查 **49/49 PASS**，日志 `32-prompt-targeted.tap`。真实既有页面的只读 helper 检查为 closed-or-none 宿主、4 个归属控件、1 个已确认命中，见 `32-prompt-native.json`；它不证明启动时间、队列可用或整体通过。

F 的“无法加载此对话”已在本轮通过网站自带“再试一次”恢复。点击前已知六项结算且 slot 释放；仅重取会话，没有 Page.navigate、安装脚本重放、消息发送或草稿修改。最初等待逻辑只查旧 `#prompt-textarea`，误报输入区仍未恢复；保留该失败观测 `32-conversation-retry.json`，随后用原完整选择器检查得到实际 contenteditable composer 在 form 内、草稿长度 0、assistant 存在。见 `32-conversation-recovery.json` 和 `32-retry-document-binding.json`；timeOrigin 与 loader 均仍为 F 的原 document。全局导航元素数量不能用作该 assistant 直属 footer 的重复判定。

当前网站入口已恢复，队列中心仍未命中自身；r3 安装及整体目标仍未完成。真正的下一步仍是合法取得原生 UI 资源、在原审阅链更新 Subagent r3，再验证全体结算后的可操作性。不得把本次无刷新恢复或 AX helper 检查补作固定 N=10 的有效样本。

## H r3 原生更新与可操作性恢复（TaskSpace 30，2026-11-14）

**G 节的安装阻塞已解除，性能验收仍未通过。** 本轮合法取得原生 UI 锁，在本任务 Space 的真实 Side Panel「扩展 → 导入扩展」选择 D 节同一包，经版本及权限审阅点击确认更新一次，并读回已安装记录。Subagent 实际为 r3/version 0.2.2，sourceHash `93533a18ee742d3002fafcd46f59317f36451c9e3e4c8e0f86b9b4787e4ddf9d`、packageHash `41d570da64c33fc899e62b7f0ea8cfd2bb66db8dfe65f0252705f6c6b4c410b2`、manifestHash `4ccdf9f207387e1dada647d3df1a7c6b2a07a04c4186bc64570c0487f295a283`，installationId `3d3dd82b-1fab-43a0-b0fe-464683c313aa`，active/registered。其余五项固定版本、授权及源码身份未变。此后不能再把 F/G 的“r3 未安装”当作当前阻塞，也不能将新安装追认给历史 raw。

更新后的 managedCleanup unknown 记录精确指向另外两个 owner 的旧文档，不包含本任务当前 tab/document；未刷新、重放或操作那些页面。本任务先核对原文档六项 completed、slot 释放及草稿为空，再导航同一入口一次，等到 r3 对应新文档六项精确 completed 且 slot 释放。见本机忽略的 `32-installed-r3.json`、`32-prime-r3.json`。初次 UI 读取误用了 light DOM 选择器，未找到开放 shadow 内的 Mini Chat/导航按钮；该 raw 原样保留。随后用真实公开宿主及其开放 shadow 重新读取：队列与 Mini Chat 各唯一、enabled、中心命中自身；选定长 assistant 的直属原生 footer 内恰有一组导航，两个按钮均 enabled 且中心命中自身。全局另一组 user 导航没有算成 assistant 重复。见 `32-r3-core-ui.json`；没有发送消息、创建任务或更改草稿。

提示词 AX 的实际返回包含原生页面另一处重复 InlineTextBox nodeId，与目标宿主子树无关。helper 原先全树拒绝重复会误拒绝本目标；现仅对已绑定宿主及其可达 AX 子树要求身份无歧义，宿主重复、子树重复、脱离/替换、隐藏和遮挡仍拒绝。原 backend host 经 DOM.resolveNode 读回与实际命中绑定，整个最终证明区间持续记录 visibility，并在 finally 清理 remote object/listener。独立复审已关闭此前 replacement-host/hidden-proof 缺口；新增加无关重复节点回归后 helper 与采集门禁合计 **55/55 PASS**，日志 `32-prompt-subtree-targeted.tap`。没有读取关闭式 ShadowRoot 内部 DOM，也未将早期 public-host 时点冒充按钮首次可用。

新独立单条 `31-r3-core-smoke.json` 在同一 revision `7e603d5f268daf6e8cfdecd920bb8841a21c979406d7b54ce3eb1b022362c81b`、SW SHA `70d28295099aab8587e55715560a701603412bbbf0765d8c4081976af02e2e0b` 下完成。每次前后 disk/applied/URL/实际 SW Debugger 源字节和完整安装投影相等。全程 visible，133 次实际扫描；六项精确回执 completed、slot 释放，无 bootstrap error、重复 UI、lost-usability 或 native prerequisite missing。最终提示词 AX 绑定成功，4 个归属控件、1 个已验证命中。

| 独立诊断 | signed ready→首次可用 | 保守上界 |
| --- | ---: | ---: |
| 队列 | 1741.3ms | 1995.7ms |
| 对应 assistant 导航 | 1098.3ms | 1126.5ms |
| 提示词 public host（非按钮首次时点） | 869.8ms | 1124.0ms |

最大实际扫描间隔 **349.2ms** 超过预先固定的 100ms 门槛，整条 rejected；队列/导航本身也未达到 1000ms。单次 scan 耗时约 0.1–3.5ms，不能把主线程计时器长间隔直接归咎于扫描函数。队列 preflight descriptor 415.5ms、编译准备 116.6ms、boot prepare 268.7ms；导航 queue wait 1920ms；嵌套阶段不能相加作为端到端因果。本条不是固定 N=10/P95、三页或可归因提速证明，`latest.json` 未覆盖。

`32-series.mjs` 已有 **44 项离线 PASS**：预声明固定 N=10、无第 11 条替补、追加式原始证据归档、前置六项/slot、身份/可见性/实际扫描硬门禁及遇失败终止。它尚缺完整 live preflight/三页传输接入，不能以离线通过宣称已做 10+3。下一步依据本条仍慢的阶段做最小性能定位/修复，具备可用且改善的 smoke 后才运行完整同候选验收。门槛、两父执行预算、runAt、权限和未知副作用保护未放宽。

本轮原生 UI 操作已结束并通过官方 ui-release 释放本 owner 锁；未强抢其他 owner。持续开发仍复用唯一 PID 61448 writer 和原 `dist/development`，未另起构建覆盖输出。当前临时诊断 p7 仍为本任务资源，collector probe/monitor 已停止，其他任务页面/服务保留。浏览器登记加载路径、production、真实撤权 UI、完整 10+3/evaluator 仍 NOT_TESTED。未暂存、提交、推送、建分支/worktree/PR，goal 保持 active。

## I 当前增量：消除独立等待和单次重复解析（2026-11-14）

本节新增改动仍归原框架 owner，不改六项已安装业务包。`material()` 同时重新读取 candidate 与内置资源，`descriptor()` 同时校验父扩展与读取固定 material；两组均用 allSettled 等待所有读取结束后再传播原顺序错误，避免一项失败就提前释放准备池许可。所有当前源码/资源身份比较、Available proof、父授权及最终 dispatch 检查继续执行，没有跨请求授权、源码或文档空值缓存。两条门控回归先失败再通过，分别证明读取不再串行、内置资源变更仍拒绝，以及父授权等待期间替换仍不派发；另有失败 sibling 必须等另一读取结束的回归。

实际 CPU 剖析 `33-cpu-profile-2.json` 与 `31-cpu-diagnostic-smoke-2.json` 仅作带仪器诊断，不计入性能样本。8 秒 SW 观察中，IDB result 回调约 1202ms、encode 353ms、canonical string 282ms、frame header 解析 133ms；page 约 5760ms 区间内亦有站点/固定桥及 GC 工作。采样开销及异步调用栈限制使这些数字不能直接当作队列端到端贡献。初次剖析因复用诊断页时重复 Target.exposeDevToolsProtocol，在导航前 aborted，原始记录保留；采集器现复用该 agent-owned 诊断文档原 transport、counter/session，不重复暴露，不重建已有 transport。

`page-bundle.js` 的单次 validatePageSource 原来先 inspectPageSource 解析 frame JSON，再用 readPageFrameResources 对同一源码重做解析。现在直接对本次已捕获且通过结构/字节数校验的资源逐个计算 SHA；仍核对每段 code 与声明 hash，linked body hash 不变，不保存跨调用解析结果。既有篡改资源、链接体、嵌套和容量负例继续验证。相关 frame/installed/parent 三组 **247/247 PASS**（`33-validation-scoped.tap`）；随后父读取并行新增定向 **12/12 PASS**（`33-parent-overlap-after.tap`），不相加成独立覆盖总数。独立限定复审对 material 与 frame 改动无可操作发现；不等于目标安全/性能整体批准。

| 单条诊断（非正式组） | 队列 signed gap / 上界 | assistant 导航 signed gap / 上界 | 实际最大扫描间隔 |
| --- | ---: | ---: | ---: |
| `31-overlap-smoke.json`：仅 material 并行 | 1399.0 / 1696.2ms | 0 / 25.5ms | 296.6ms |
| `31-validation-smoke.json`：加入单次重复解析消除 | 2232.6 / 2490.1ms | 1962.0 / 2008.8ms | 265.2ms |
| `31-validation-warm-diagnostic.json`：同一字节的额外诊断 | 1648.1 / 1943.8ms | 65.2 / 100ms | 295.2ms |

均为全程 visible、精确六项完成且 slot 释放，提示词最终 AX 通过，但均因预先固定实际扫描 100ms 门槛 rejected，队列本身也仍慢。额外诊断起因是未先核对便提出冷缓存假设；随后读回两条六项均 registrationCacheHit=1，假设不成立，不能以该快值替换慢值或宣称缓存效果。不同站点前提就绪时点及候选不可拼接；导航 signed 0 只表示同次扫描发现就绪与可用，保守上界仍保留。

前一条身份为 revision `3006b368344a902d5934f38486a674562f38d116c884593099800466961db711`、SW `0ca22a1e1aa8abd552ae2dec36359a5fb22e27db8923cad2cdef103651e17e06`；后两条为 revision `dba6344be0b51e0e69e46efc24e00741f5b68dcfb6980db668050ea7061faa7a`、SW `dc926c00f321918da66f5b1299be122b4bee82d91d6d6e3265686432347e3063`。各条前后 disk/applied/URL/实际 VM 源字节及完整安装身份一致。旧完整 latest 仍未覆盖。

独立 executor 在忽略目录完成 `33-live-transport.mjs`：固定前置、共同客户端并发触发、观测/AX 与所有目标 visibility 关闭屏障后再读诊断。27 项 adapter 与原 44 项 coordinator 检查共 **71 PASS**，仅为 fake transport；真实三页生命周期 hooks 尚在接入，真实三页可见性/扫描节流仍未验证，不能将 cdpPage facade 称为非激活接口。新目标页面、刷新和验收仅由本任务 leader 执行。

### I 后续诊断与采样器复审

上述产品三文件最终相关检查为 **248/248 PASS**，见 `33-product-final-targeted.tap`。独立 reviewer 分别复审 material/frame 与后续 descriptor 并行改动，均无可操作发现；后者确认 parent-first 错误传播与 dispatch 前新鲜校验保留，未验证真实浏览器性能。

父读取并行候选 revision `4e6647cee6ad3993cd64891f81823303873d9f68fee79a85f1b6c57fb827cce5`、SW `b16f2083f68a2ca72dfe69991135a41f0655fcc310f4c99953a50c0e63ac3414` 的 `31-parent-overlap-smoke.json`：队列 signed/上界 **2226.6/2491.7ms**，导航 **1675.6/1701.4ms**，最大扫描间隔 **270.5ms**，仍 rejected。descriptor 的小范围串行消除没有证明端到端达标。

只读 `33-registry-read-size.json` 实读父工具 registry 10 项、约 2.2 MB、读取 10.4ms，不支持“43 MB registry 导致启动慢”的假设。`33-monitor-history-size.json` 则发现诊断监控器每 100ms 全读 1502 条 execution（约 4.6 MB，单读 20.6ms），只为等待本轮六项；已改为六个原自动执行键及全局槽位，最终仍完整前缀扫描，拒绝额外/手动执行、身份变化与未结算状态。四个新监控回归与原门禁/AX 共 **59 PASS**，见 `33-monitor-targeted.tap`。这仅减少测量干扰，不是产品提速。

同候选 `31-narrow-monitor-smoke.json` 队列 **1650.7/1906.0ms**、导航 **0/12.1ms**，实际最大扫描间隔 **283.9ms**，仍 rejected。该轮与 leader 启动的相关 Node 测试发生负载重叠，属于被干扰诊断，原始数据保留，不能比较为 monitor 优化收益。以上两轮六项均精确 completed、slot 释放、全程 visible、最终提示词 AX 通过，无已捕获 bootstrap error 或 lost-usability；仍不能补入正式 N=10。p7/p8/p9 随合法开发安全更新消失，当前诊断入口为本任务 p10；不能复用失效句柄。

`33-collector-lifecycle.mjs` 初版 shared monitor 与 lifecycle/adapter 50 项 fake 检查通过，随后独立只读复审仍复现 **2 HIGH、3 MEDIUM**：UI 在所有兄弟 AX/结算前停止扫描、迟到 bootstrap error 未进入最终资格、transport 丢弃结构化 abort/cleanup raw、console event 只绑定 target 而未绑定新文档、清理时未排干在途 monitor tick。正在原忽略模块修复，不以初版离线测试或 full-prefix/source bracketing 已存在来宣称 live 采样器合格。原来的 100ms 实际扫描、六项及全局槽位、身份和可操作性门禁保持。

## J 导航撤权避免读取无关 Controller 正文（2026-11-14）

当前核心诊断继续定位 UI 前的等待，未增加并发预算或跨调用缓存。`34-store-sizes.json` 实读原 `commandJournal` 2868 条，其中 1870 条 Controller operation 正文共 **18,096,881** code units，整库读取 **75.3ms**，当前无 SDK grant。`sw.js` 的每个 frame onCommitted 都调用原 SDK 撤权，而 `sdk-methods.js/revokeSdkGrants` 每次先整库取出再按 tag 过滤；这是与页面启动直接相关的无关正文物化。CPU profile 的通用 IDB result 回调不能确定每个键或端到端占比，上述数据不推定 1202ms 全来自此处。

最小修复仅在原撤权事务中使用现有 `scanEntries` 和原 `sdk-grant:` primary-key 前缀，每页 256 条、精确 afterKey 续读；不新建表、索引、授权层或缓存。同步失效围栏、affected 判定、事件后新 grant 的 epoch 比较、原 grant retirement/持久写入及事务回滚不变；缺 cursor 的原适配器继续使用原 all 路径。新回归先 4/4 失败，再通过；覆盖跨三页全部匹配 grant 被撤销、无关 Controller 正文不读取、事件后新 grant 保留、精确 incarnation 回滚，以及第二页失败撤销整笔持久改动。相关 SDK broker/跨源/安装竞态与 IDB 共 **56/56 PASS**，见 `34-sdk-scan-before.tap`、`34-sdk-scan-final.tap`。独立限定审查无可操作发现，并另运行 25 项相关离线检查；这不是完整安全/性能批准。

当前 revision `b70e253e20be92b5f316a5f38ddafe077192aee3b504e7a2c8ff185134881397`、SW SHA `19dfaea2a44c78cef0d7d844ce6b3bc987e4cd393cb0a06d582c8f8272d71ff9` 已核对 disk/applied/URL/实际 SW VM 字节相等，诊断页为本任务 p11。新采样器把六项回执与原 `browserSessionIncarnation` 绑定，首次在导航前发现旧文档虽六项 completed/global slot 释放，但属于开发重载前 session；`34-sdk-live-diagnostic.json` 原样保留，未导航。核对旧六项精确身份与全局槽后，仅做一次明确的安全页面更新；`31-sdk-session-prime.json` 新文档六项已属于当前 session、completed 且 slot 释放。该记录不是正式样本；队列 signed/上界 **1575.6/1797.5ms**、导航 **149.1/175.1ms**，最大扫描间隔 **227.1ms**，仍 rejected。

初版 lifecycle 的五处遗漏已修复并通过 **63** 项离线检查；随后现场预检又发现 CDP facade 误拒绝正常 undefined 返回、清理 TypeError 掩盖原错误，以及已打开页面的预检错误从 navigation zero 计算 UI deadline。前两次预检均未导航，分别保留 `34-sdk-live-ready-diagnostic.json`、`34-sdk-transport-diagnostic.json`。三项修复均先复现再修改，相关套件 **66 PASS**（`34-preflight-current-after.tap`）；预检只证明当前可用，不报告启动达标，正式新文档计时保持原样。

`34-sdk-transport-integrated.json` 在相同候选完成一次独立导航：队列 signed/上界 **1464.4/1715.2ms**，对应 assistant 导航 **1217.5/1249.9ms**，最大扫描间隔 **254.4ms**；全六项精确 completed、slot 释放、当前 session、最终 AX 通过，未捕获产品错误。驱动将 canonical 扫描保留至直接诊断读取后，又因自己激活诊断页制造 hidden（约 5588、5833ms），整条 aborted，不当作产品 hidden、合格样本或提速证据。正在把完整结算证明移入原后台 monitor，使全六项完整前缀/槽位证明和所有兄弟 AX 均先于观测关闭屏障，直接诊断读取在屏障后；不忽略原 hidden 或放宽门槛。

队列核心可操作，但端到端仍慢；未启动固定 N=10 或三页正式组，`latest.json` 未覆盖。当前唯一 dev writer 及 `dist/development` 保留，未另启构建/服务或暂存、提交、推送、建分支/worktree/PR。goal 仍 active，浏览器登记加载路径与正式 10+3/evaluator 仍 NOT_TESTED。


### J 后台结算屏障与剩余读取（2026-11-14）

采样器现在由原诊断文档后台完成全前缀六项、全局槽位、session 及 document/loader/timeOrigin 核对后，才发布带 owner token 的 full-final 屏障。客户端通过非激活的 task.tabs 取得屏障；所有兄弟 AX 完成后才关闭 canonical 扫描/visibility，随后直接读取诊断并独立重做完整结算核验。迟到 Runtime/bootstrap、清理失败和 unknown 仍进入最终判定；不以窄键轮询替代全量证明。新增屏障、迟到事件和预检回归合计 **73/73 PASS**，见 `35-boundary-after.tap`，尚不代表真实单页或三页合格。

带仪器诊断 `35-cpu-profile-sdk.json` / `31-cpu-sdk-diagnostic.json` 已停止并分离两个 profiler。SW 约 8131ms 中通用 IDB 返回回调约 886ms、GC 1276ms；page 约 5541ms 中存在站点、其他固定桥和 GC 工作。异步栈不足以将 886ms 全部归因于某个读取；没有依据修改其他工具桥。该轮队列 signed/上界约 **1636.6/1945ms**、导航 **1162.3/1200.6ms**、最大扫描间隔 **323ms**，仍 rejected，仅作定位。

直接源码链确认另一项启动读取：onCommitted → invalidateControllerTarget → invalidatePageTaskSource，以及 Subagent 的原 Page Task restore，均先读取整个 commandJournal，再筛选 page-task-request。现在仅这两处复用原事务的 `page-task-request:` 前缀扫描，每页 256 条、afterKey 续读；其他 request/CRUD 不变，无新表、索引、缓存或 Runner。原 tag、source/target 权限匹配、同步 source epoch 围栏、安装身份、unknown 及回滚语义保留；无 scanEntries 的旧适配器保留原 fallback。

新测试先 red 后 **11/11 PASS**（`36-page-task-request-{red,green,final}.tap`），指定 task-run-preparation 环境测试 **45/45 PASS**，源码语法与 diff 检查通过。覆盖跨三页读取而不物化无关 18MB、精确 tab/slot/安装身份、权限撤销、迟页失败原子性，以及失败不能解除 pending source epoch 围栏。测试全部退出后才进入下一轮浏览器诊断。端到端提速、固定 N=10、三页及 evaluator 仍未证明，未放宽任何现有门槛。


Page Task 修复候选 revision `99402281173f414db63a83d587c6a6be10be1b8d0d251b985acec91e8153fa82`、SW `c53bd626d416f1a67298c56d7dd04b8e519c71c4e052c89d78e048c77db290cf` 已核对真实运行字节，诊断入口 p12。开发重载后先在旧六项完成/槽位释放条件下做 session 过渡，见 `31-page-request-session-prime.json`，新六项属于当前 session 且 completed/free；该条仍因实际扫描间隔 rejected，未补入正式组。

随后 `36-page-request-barrier-diagnostic.json` 真实通过后台 full-final → 全部 AX → 关闭观测 → 独立完整读取 → 清理的边界；观测始终 visible、无产品失败、六项 completed/global slot 释放，清理 retired。队列 signed/上界 **1484.6/1777.1ms**，导航 **1258.6/1303.1ms**，实际扫描最大 **336.2ms**，整条 aborted，仅保留诊断。未再出现驱动激活诊断页制造的 hidden；这不代表采样通过。队列世界分配约315.7ms、reserveMetadataTarget约427.7ms，下一步只评估这两段的重复对账或串行等待，不增加预算或授权/历史缓存。


## K 新鲜性保护下的 CPU 与阶段诊断（2026-11-14）

限定架构复审确认：不能合并两次 fresh world ledger，也不能直接并行 session 与 durable lifecycle 读取；旧 durable ready 与新 session unknown 的倒序快照可能将未知状态覆盖。metadata editRecords 的独立新鲜读取/CAS 也保留。未采用这类提速路径；filtered 数组等数毫秒以内 CPU 改动没有足够当前因果证据，不实施。

实际 SW 剖析的 canonical UTF-16 逐字扫描约314ms/8秒。`protocol.js` 现在在引擎支持时使用原生 isWellFormed，缺支持继续原循环；非法 surrogate 的 E_SCHEMA/消息、JSON.stringify 字节、digestUtf8 与键/深度限制不变，无缓存。`37-unicode-cpu-diagnostic.json` 在本地 Node 对100万 code units、每路径12次：fallback平均3.737ms/native2.029ms，canonical SHA相同。它只证明局部CPU改善。unicode合法/非法序列、摘要与fallback，以及相关协议和包身份共 **44/44 PASS**（`37-unicode-admission.tap`）；独立只读复审无可操作发现，没有真实性能批准。

`preview.js` 仅增加 metadata 细分诊断，不参与授权、预算或阶段顺序。新候选 revision `80b6e36ecdb44941325c7a8036d515aea4f5dc60b1e98ecc426c92a962b39811`、SW `bb928d18f8945e70c12b16e97d1fb1ed32a9a1583a5b27781a8792e21e3edff4` 已实读VM字节，诊断页p13；原生 isWellFormed 存在。session 过渡 `31-unicode-metadata-session-prime.json` 队列 signed/上界 **1550.1/1851.2ms**，导航 **1121.3/1154.7ms**，最大扫描 **300.7ms**，rejected。六项精确completed/free、观测visible；不补作正式样本或Unicode端到端提速证明。

细分队列 metadata 总115.9ms中，admission2.4、compiledDigest0.4、execution binding33.7、worldMetadata78.4、target0.6ms。世界分配520.7ms中串行等待149.8、两次fresh ledger218.8/122.3ms；上一条对应总315.7ms，不能用嵌套耗时相加或跨轮差值宣称因果。当前没有依据继续围绕 compiled hash 优化。新一轮独立限定诊断正在检查剩余高成本阶段；没有扩大预算、清理历史/unknown或改runAt。


只读原生 IDB 批量诊断：第一次 `38-native-read-batches.json` 错将原生 IDBRecord 直接 JSON.stringify，得到 [{}]，不能证明字节身份，作为无效驱动记录保留。修正后 `38-materialized-read-batches.json` 显式读取 primaryKey/value：1544条、5,076,370序列化bytes，四次完整SHA相同；256/4096/4096/256批量耗时27.1/20.9/19/22ms。扩大批量只有数毫秒局部收益，没有改生产批量或把空闲读取当启动归因。

准备池4→2进行了可回退因果实验，保留父执行2、所有新鲜核验、FIFO/owner/手动屏障；相关上限门控先red、8项准备/过期拒绝回归green。候选 revision `71f2e73915162b46c5644d47c0921e0a20bfae6704a6a2c8b88d98d00a045748`、SW `7cebda1b665f5026d1bad56ae1fedcd501f5afff0289f3772a6f99291e2ff1b8` 的 `31-two-prepare-session-prime.json` 队列signed/上界 **1941/2212.1ms**、导航 **1329.8/1355.9ms**、最大扫描 **271ms**，仍rejected；六项completed/free、visible。实验没有改善依据，已仅撤回本次生产单字改动和测试门控，并逐字核对未覆盖其他hunk，恢复原准备池4。实验初次尝试在安全开发重载窗口遇到disk/applied/VM drift，导航前终止；没有强制reload。没有将实验快值、失败值补入正式N=10，也未扩大并发或删历史数据。


## L 只读准备不占父执行调度名额（2026-11-14）

发现另一处可复现的调度阻塞，而非调整并发数：scheduleDocument 原先先把 job 放入 runningJobs，再在 work 中等待 prepareBoot。两个只读准备同时待决就占满两条父调度名额，第三个已经准备好的独立 document 无法启动，尽管没有原生执行或 Authority slot 占用。新门控 `two blocked pure preparations do not occupy both parent execution leases` 在原实现失败，日志 `40-preparation-leases-before.tap`；原单 slow-preparation 测试只覆盖一个待决准备，没有覆盖双名额耗尽。

现在只对 handleBoot 的 job 传入 invocation-local preparation 完成信号；完成前保留队列位置、owner 和手动屏障，但不进入 runningJobs。失败完成同样交回原 work/ordered suspension 路径，不将失败丢弃。eligible 同时保留更早的同 owner 等待项，防止后一项准备更快便超车；晚资源默认仍可执行，不改变其父/child nonce、retirement 和 settlement 保护。父执行上限2、准备上限4、背压256、世界两次新鲜读取及CAS均保留，不新增缓存、Runner、数据表或程序名称快车道。

三条新增行为回归覆盖双 slow-preparation 后独立页面推进、prepared duplicate 不越过较早同 owner、未准备手动 Run 仍阻挡后续自动任务。相关 installed/admission 三组 **274/274 PASS**（`40-preparation-leases-final.tap`），managed lifecycle 与真实编译 Nav/Mindmap 双顺序共存 **63/63 PASS**（`40-preparation-children-coexistence.tap`），语法与 diff 检查通过。独立架构复审未发现阻断性安全或合同缺陷；其 LOW 建议是显式证明 duplicate 已完成准备后再检查同 owner 防超车，现已加强该门控并通过定向检查（`40-prepared-owner-proof.tap`）。这些结果不等于性能达标。

实际候选 revision `2e52c58ea7adeb5fb2479e1838619246a6d8ffcc0ff239570e9262e10dc69c09`、SW `20e383db282943b1a80a57bf60643cc9597e3b1e4ca5d09b7b93074e35c2e3e1` 的 `31-readiness-leases-session-prime.json` 前后完整身份一致，六项精确 completed、slot available；monitor 已停，所属 probe 已清除。队列 signed/保守上界 **1693.5/1991.1ms**、导航 **1578.3/1612ms**，最大实际扫描间隔 **297.4ms**，整条因采样门槛 rejected，不能用作固定 N=10 或改善证据。首次可用时刻分别约2963.9/4630.3ms，不能与从原生结构就绪起算的差值混淆。此修复改变不同 owner 的就绪调度顺序；下一步需要定位实际请求、回调和事务等待，仍未进入正式10+3。


## M 精确定位并移除其余 journal 全读（2026-11-14）

`41-request-causality.json` 是限时插桩诊断，不是合格性能样本：保留全部原操作，仅暂时包装原 SW 的 IDB/native 查询并在 finally 恢复、停 profiler 和 detach。18 次 commandJournal.getAll 的 result getter 合计815.5ms、单次最高72.2ms；同次12721个精确文档查询中12711个返回不存在、10个存在，无查询错误。没有据此删除历史、缓存文档缺失或减少世界两次新鲜读取。idle native 调用栈被 storage Promise 队列截断（42/43），因此随后用独立 Debugger 断点与 async stack 获取真实调用方（45）：17次中12次来自 assertHost 默认路径、5次来自 listPageTaskRequests；自动 resume、disable/detach 完成，无悬挂断点或 profiler。

assertHost 现使用同一个 readonly 事务内的 host:、256条/exclusive afterKey 扫描；保留首个匹配的tag/document/active/session选择、后置URL判断、精确registration get、扩展派生namespace/principal和无cursor fallback。列表复用原readPageTaskRequests，保留currentHost、namespace/tag、createdAt降序/最新64、preparation和projection。宿主回归修改前9项失败、修改后18/18；列表新增4项中3项在旧实现失败，完整文件15/15 PASS。独立只读复审CLEAR，无阻断性正确性或授权发现，原生跨实例未执行。

同候选revision `44ccf99ffe63fa6994c7b5ec4c139d56b4547fd8295cedd9018abd85173a6066`、SW `23aa49c58bac28864c3b4d293eb9b719fe23f3a7c9a9b22544eb9b69e2d5848e` 的31-host-prefix-session-prime.json，身份前后一致、六项completed/free。队列signed/上界1783.1/2026.2ms，导航1104.9/1119.5ms，最大扫描258.7ms，仍rejected，无端到端改善结论。48-after-prefix-causality.json 确认当前启动中整本journal读取已消失；原来最高的该项解码开销不再出现，但SW仍有约656.6ms GC、238次execution分页读取回调。49-page-profile.json 中用户Page程序自己的CPU较小，不能把Native completion的全部等待归因于其脚本CPU。两条均为插桩诊断，不能追认为10+3证据。

AppPage 的 readContext/storage.get 原先在 bridge 外层、私有数据读取前、返回前各做一次完整授权。限定审查 CLEAR 后，仅去掉只读操作的外层重复 pass，并把精确 message/sender world 核对放入每次 authorize；写入、authorize 和未知操作保留外层检查及原 lock 顺序。6条新增回归在原实现4失败/2通过，修复后完整 AppPage 文件54/54 PASS（50-app-read-boundaries-after.tap），包含读取期间 world 改变时拒绝返回；原 source/proof/Native/文档、写入未知结果和撤权保护保留。

候选 revision `9f72563c9b79d13ca0049441202fc3659963eff8ced540290d2638b4424432ca`、实际 SW `f71148ec725250e269562933632de0ead9c2dcb44fb039b1f8038668200cb5c7` 已经原 watcher 安全应用并核对前后身份。31-app-read-boundaries-prime.json 的队列 signed/上界1182.4/1420.1ms、导航708.3/762.3ms，最大扫描275.6ms。随后完整屏障诊断50-app-read-barrier-diagnostic.json 的队列1522.4/1768.2ms、导航1296.6/1325.3ms，最大扫描310.9ms。两条六项 completed/free、无bootstrap error，仍因扫描门槛 rejected/aborted；真实延迟也未达到1000ms，不声称改善或补作N10。

独立采样协议复审认为可为未来新组取消额外固定100ms扫描间隔限制，但必须同步处理 readiness 曾出现又消失、shadow 内部遮挡、保守有符号区间、实际触发时刻围栏及三真实可见窗口。100ms限制未取消；部分前置驱动修复见O，旧协议和旧 rejected raw 均保留。三窗口能力探查中，把本任务新建空白p19通过官方 windows.create 移出原窗后，ego TaskSpace将其标成closed，不能继续用原Page句柄；没有加载第三个站点文档。已按精确tab/window/about:blank核对并关闭本任务创建的空白页，UI锁释放，其他owner窗口未改。三页可同时可见/可操作的采样入口尚未取得。

全局2父执行、准备4、精确文档查询8、世界预算6、两次fresh ledger、unknown及原Source/Host/Authority保护保持。未进入正式固定10+3或evaluator，既有失败不覆盖、不补快值。


## N 合并 AppPage 授权中的重复父包检查（2026-11-14）

后续限定审查 CLEAR：appExecution 开头的父包检查与 descriptor 开始的独立新鲜父包检查重复。现仅移除开头这一处，descriptor 的父包/源码并行读取及 Native 精确注册核对后的最终父包检查保留；私有 namespace 仍须等待完整 authorize，写入在锁前的 outer authorize 也保留。无缓存或 proof 复用。多个条件同时无效时错误优先级可能改变，提前做的 permissions.contains、执行记录和 tab/frame 读取均只读。

新增桥接 parent/material 重叠门控在旧实现失败，见51-parent-overlap-before.tap，修改后完整AppPage61/61 PASS（51-parent-overlap-after.tap）。六项边界回归分别在 descriptor、Native 查询和返回前替换父包：前两处不得读取私有namespace，后一处不得返回已读数据。另补写锁门控1/1 PASS（51-write-lock-boundary.tap），伪造 world 或替换父包都不能进入工具锁，合法请求进入锁后仍拒绝CAS冲突。源码语法及限定diff检查通过。

候选 revision `7d5365d0c4e1326aeb7319d63c44e3749300448f40539ec40f135fddfd2e20c6`、实际 SW `93dfabed2061c8c27a8b00bdc9b36e7e791f2cc4c06426755e48b070c4359237` 已核对完整前后身份。31-parent-overlap-prime.json 队列 signed/上界 **2180.9/2461.4ms**、导航 **674.1/706ms**，最大扫描 **280.7ms**，仍 rejected；无bootstrap error，六项精确completed/global slot释放，monitor及所属probe清理。队列有660.2ms调度等待、执行总550.7ms；鼠标程序的世界分配604ms包含页面原生probe等待，不能全归因于SW CPU。该轮没有端到端改善证据，未触发固定10+3或evaluator。


## O 采样器内部命中与时间区间修复（2026-11-14）

四项驱动缺陷已先取得失败回归：open shadow host 的 retarget 命中会误接受内部遮挡；负的延迟区间下界被截成0；已观察到 native readiness 消失后再出现未拒绝；三页请求调用起点接近但其中回执迟至130ms仍通过100ms触发差检查。现在深入 open shadow 检查实际按钮/后代命中，保留有符号下界，拒绝已观察到的 readiness 丢失，并要求三页全部请求至回执的保守包络不超过100ms。closed shadow 提示词仍使用原公开host与独立绑定AX核对，不推断内部元素。没有取消原100ms扫描限制、改deadline、修改产品源码或重新解释旧失败。

55-measurement-before.tap 新回归4失败/1通过；第一次补丁在写入前终止，对应失败的55-measurement-after.tap保留。修正后五个采样器/series/lifecycle/transport测试文件合计 **156/156 PASS**（55-measurement-final.tap），独立限定复审CLEAR，无HIGH/MED。该复审不证明未采到的readiness连续性或真实三窗口已合格。

56-control-hit-barrier-diagnostic.json 在N同一候选上执行完整后台final → 全部AX → 关闭观测 → 独立完整读取/身份核对 → 清理。队列 signed/保守上界 **1986.5/2253.2ms**，导航 **632.6/675.8ms**，提示词 **646.7/913.2ms**，最大实际扫描 **266.2ms**；产品失败为空，因扫描间隔及子样本不合格而 aborted，refreshForbidden=false。六项精确身份/current session/completed与全局slot释放已核对，所属monitor/probe清理。队列延迟本身仍超过1000ms；没有补入固定N=10、重跑evaluator或宣称提速。

当前UI只读验证53-current-core-ui.json与54-current-nav-ui.json确认：原生form中队列按钮与Mini Chat按钮可穿透open shadow命中；选中长assistant的direct native footer中导航host唯一，两个34×34按钮均命中且未停用。未改草稿或发送消息。52-current-core-ui.json因编辑器、实际滚动容器和shadow选择器错误而无效，保留为驱动失败记录；53/54不是启动性能样本。

最近独立总评 **83/100**：因果18/25、资源24/25、授权24/25、测量8/15、维护9/10。当前源码复审CLEAR，最初两项HIGH已关闭；端到端因果、真实三页、新鲜原生撤权竞态、合格N=10/evaluator等证据仍缺。该分数取得于55驱动修复前，未自行提高，未达到>95要求。目标仍active；实际注册磁盘路径继续NOT_TESTED，测试、编译、安装与运行证据不互相替代。


## P 同一 TaskSpace 的三原生窗口能力探查（2026-11-14）

57-window-target-capability.json 仅使用本任务新建空白p21，证实移窗后虽然ego Page句柄不再可用，仍可通过原诊断页公开的官方CDP精确attach同一target并读取真实visibility/viewport/原生window；不是所有精确绑定路径都失效。普通normal窗口请求570px实际被限制到900px。58-popup-target-capability.json改用原生popup类型后，实际570px宽、762px高viewport，未使用设备尺寸或visibility模拟。

59-three-popup-capability.json 同一TaskSpace30新建三个唯一about:blank目标，核对原生tab/target/URL后移到三个popup。原生bounds分别为left=0/575/1150、top=40、570×850；三个实际viewport均570×762且visible，彼此不重叠，全部位于1728×998可用屏幕内。将三个窗口逐一置前后，整个观察段只在一个既有诊断回调中调用官方CDP，未再次通过Page SDK激活诊断窗口。该证据仅证明空白窗口几何与绑定能力，不证明站点、原生composer/footer、AX或三页性能。

所有探查target会话已detach，精确URL核对后仅关闭本任务创建的空白tab/window，UI锁已释放，原p2/p20和其他owner窗口保留。后续若采用响应式570×762三窗方案，须在任何新组前固定视口和协议，重新取得适用UI/原生前置条件、完整屏障及候选证据；不能把旧1317×585样本并入、回填或宣称已完成三页验收。当前100ms扫描规则保持，端到端队列仍FAIL。

60-*为复用原31/32/33采集逻辑的离线browser-side运输适配器，尚未用于站点。初版7/7证明实际bundle可走monitor/full-final/measurement-close/cleanup与失败归档，不能证明成功采样。独立复审发现两项HIGH和一项MED：成功单样本的清理状态路径与原transport组回执不符；同URL下target与tab/window未建立实际关联；设备尺寸覆盖可能掩盖自然viewport或窗口变化。已退回原owner补失败回归和修复。能力探查、离线测试及源码复审均不等于真实三页合格，修复与后续实测证据分别保留。


## Q 提前纯准备的限定候选与端到端缺口（2026-11-14）

限定架构复审允许复用可信onCommitted生命周期，为同一session/namespace/tab/document的一次自动invocation提前进行现有纯准备；不是提前运行用户代码，也不新增document_end消息桥。当前prepareBoot晚至真实bootstrap才开始，56的队列preflight约311.4ms、其后queueWait约877.8ms；这一候选只尝试利用导航至原runAt之间的空隙，不把这些数值直接当可减收益。

实施范围限定现有sw.js、broker.js、installed-programs.js及所属行为回归。交接项须有界、短期、完整安装与文档身份绑定、一次性消费；导航/关闭/替换/撤权/过期丢弃，迟到结果不回填。沿用准备池4，等已有准备Promise不再次占名额；不分配world/slot、不产生执行记录、不触发configure/execute/reconcile。原Chrome bootstrap到达后才按原FIFO和manual barrier入队，boot重新核验当前源码、候选、proof、原生注册/marker、document、grant和Authority。推测失败仅丢弃，实际boot退回原准备和失败路径，不因hint失败停用安装。

首版源码增量101行、删除3行；新增提前准备回归29/29、相关三个文件303/303及语法/diff检查通过（62-green-final.log、62-related-final.log、62-verification.json）。独立复审仍BLOCK：取消只清理交接Promise和Map，尚未解除已排队的推测准备，连续导航可能保留无界等待项；迟到导航selector也可能在当前文档验证前清掉较新文档的hint或once-only tombstone。正在原owner范围补负例与最小修复，首版GREEN不替代这两项关闭证据。

已有持续开发watcher自动产出并安全应用首版；61-pre-early-preparation-identity.json实读revision `d569f7117507027d4c3f2f2d6c3189136b5c8dc69ef8dbc784f9c76058177c58`、SW `df1b01b3dc4e898313de6a62e1bc278b31cf68a85bea63b19243d593ddc7e4bc`，disk/applied/URL/VM一致、slot空闲。原p20诊断页已随扩展更新消失，TaskSpace30内新建可信诊断p26；没有刷新站点。原p2六条completed属于更新前session，不能作为新session正式preflight。此读取只证明首版身份，不证明修订版或性能，源码复审关闭前不运行测量。

2/4/8/6、两次fresh ledger、unknown保护、runAt、匹配与原安装授权不变；正式10+3/evaluator及>95目标仍未完成。实际注册磁盘路径继续NOT_TESTED。

r2已关闭上述两项源码发现：推测准备只使用原池空闲permit，满池直接跳过，不进入真实bootstrap等待队列；正在运行的permit仍等真实结算。两个入口先取得当前tab/document及最新selector证明才失效其他文档，真实boot到达也围栏旧selector回读。新增负例覆盖四项blocked后40次导航/过期、B→迟到A→B、两个入口回读交错和boot先到。提前准备36/36、最终相关310/310（62-r2-assertion-fix-related.log），语法/diff通过；独立复审这两项CLEAR。一次相关运行309/310的失败仅比较两个独立owner的活动记录排列，未设准备就绪屏障；按已有ready调度合同修正为精确两个owner集合，保留第三项等待/释放推进、duplicate、同owner FIFO和manual barrier断言，原失败日志保留。累计源码+135/−4，没有为了该断言改变生产调度。

64-fresh-owned-document.json在同一TaskSpace30新建p28，只首次加载原已批准会话URL，没有重放p2旧文档；先证明空白文档无执行记录且global slot空闲，再等待新文档六项精确completed/current-session及slot释放。实际候选revision `5be37d18327cdfe3fc5d2b67631333fa35f1698c17e0f546826d649e4c7fb832`、SW `0e1ced2cec909ebc1a0286d4d8529afe6332d097aa5804db5d6a6291eacc1aa7`，前后disk/applied/URL/VM/完整安装集一致。更新后原p26也已消失，诊断为新p27；调试状态实读“开发服务已连接”及同revision。此证据只证明新候选自动启动完成，不是计时样本或性能达标；下一步仅做一次原1317×585完整屏障因果诊断。

66-early-preparation-barrier-diagnostic.json完成同候选的原1317×585完整屏障诊断：队列signed/保守上界 **1046/1299.5ms**，区间下界1010.7ms；导航 **731.3/763.1ms**，提示词 **389.5/643ms**，最大实际扫描312.6ms。队列本身超过1000ms，另因原100ms扫描门槛而aborted；六项精确/current-session/completed、global slot空闲、前后完整身份及观察器/session清理均已核对。没有单点提速或N=10结论。63/65分别在导航前因同URL匹配歧义、Page映射硬编码失败，保留为驱动失败记录，不是计时样本。


## R 三个真实站点窗口与下一组固定协议（2026-11-14，未开始正式组）

60运输适配器r2已修复P中的三项发现：核对原transport实际cleanup组结构和每个document/current-session；每次用官方target、tab及native window关联；禁止设备模拟掩盖自然viewport，并监听真实bounds变化。新增回归RED为7通过/4失败，修复后12/12；旧7/7及bundle集成检查通过，独立复审HIGH/MED均CLEAR。离线通过不等于站点通过。

67-three-real-popup-initialization.json在同一TaskSpace30创建三个新文档，逐页证明六项current-session/completed及global slot释放，再移入本任务三个原生popup。68-three-real-popup-preflight.json实际证明三页570×762自然viewport、队列和提示词唯一可用、提示词独立AX通过，但导航不适用，preflight保持blocked。69只读诊断确认完整回答高396px，低于原适用性算法在该视口下的461.5px阈值；这不是通过修改产品或放宽适用性来处理的故障。68原始productFailures标签及全部失败数据原样保留，后续分类不改写原记录。

70-native-585-ui-proof.json仅将上述精确拥有的三个原生窗口从570×850调整为570×673，实际自然viewport均570×585，未导航、未发Emulation。原算法阈值为346.45px，三页原生direct footer中的导航均适用、唯一且真实命中；队列和提示词同样唯一可用，closed prompt的绑定AX证明通过。三页均visible，六项/current-session/global slot及完整候选身份前后一致，所属probe/AX marker清除、所附session已detach。这是新视口的能力证明，不是启动计时或三页性能验收。

72-failed-preflight-retirement.json在关闭前重新核对上述三个精确document的六项/current-session/global slot、所属marker与monitor/session清理以及完整候选身份，保留68的blocked marker到页面关闭；随后只关闭本任务诊断p27，验证其target消失，原三站点窗口保留。新可信诊断为同一TaskSpace内的p32。没有清除active marker后重试，也没有修改68的结论或新建SDK/Authority退役入口。

独立协议复审有条件认可未来完整新10+3固定570×585、25ms目标扫描及500ms最大实际间隔：仍以保守upper判断单页1000ms和三页每页3000ms，保留100ms触发包络、20/30/120s边界、已观察readiness/usability丢失拒绝、完整final/AX/cleanup与身份围栏。较宽扫描只扩大不确定性，不能扣减延迟或重判旧raw；采样不能排除间隔内短暂闪失，结论限于按固定采样协议观测稳定。正式测量前仍须同步canonical围栏、定向测试和实际补丁的独立复审。原83/100评分、N=10/evaluator及>95缺口不变。

71已完成同步及实际补丁独立复审CLEAR。新协议显式标识为`71-natural585-gap500-v1`，legacy standalone仍保留100ms；500/501、单页1000/1001和三页每页3000/3001边界均有定向行为回归。RED为53通过/13失败，最终211/211，语法11项及manifest输入8项通过；285份旧证据字节未变。首次中间205/211的6项失败来自旧transport fixture的policy/viewport不匹配，原门禁正确拒绝；对齐该fixture后通过，没有放宽保护。原browser bundle为`4b49850d6b69b528c14acac5431dde75f5f87b89528a9c78f8278a5359224453`。

73-natural-585-smoke.json的真实三窗口前置检查通过，候选仍相同；随后单页因外层180s内未得到adapter最终/可归档回执而blocked，没有读取该次延迟或计入N。74在永久放弃该次测量后只读诊断：adapter已终止blocked/archiveReady=false，绑定检查失败、independent sessions已detach，原monitor另有一条保留session且full-final已settled。75确认此时四个owner的真实target/tab/window/URL均匹配，三页当前六项/current-session/completed/global slot及完整候选身份一致，测量页probe/bootstrap/AX均不存在；原失败缺少具体字段快照，不能认定为瞬时URL竞争或产品故障。

76-abandoned-smoke-retirement.json再次取得上述新鲜证明后，按原顺序disable/detach本owner已settled monitor的session并恢复listener；只关闭本任务测量页p29与诊断p32，销毁可能遗留的私有new-document registration和geometry listener，验证target消失。blocked marker保留到诊断页关闭，没有改写为finished、强制取消Native或清slot。p30/p31已证明无所属marker并保留，诊断改为同一TaskSpace的p33。73仍永久无效；下一步仅补绑定失败的有界诊断字段，保持原拒绝条件，先取得确切失败字段再决定修复。


77只增加现有绑定guard失败时的有界字段投影及本token的blocked终态信号，不新增浏览器查询、不改原接受条件、归档或重放权限。真实73失败字段仍UNKNOWN。新增行为RED为7通过/3失败，定向GREEN89/89，语法5项、manifest输入8项通过；181份既有证据及canonical collector保持原字节。候选IIFE SHA为`d94822a5405d7cf606496b8ceba68da025f8d1bcd4cfe8b7cd265a61157d44c6`，所有离线CPU工作已结束；77实际字节独立复审CLEAR；79一项短写MED修正后同样CLEAR，修后脚本SHA为`bbfdfc76012303daf7e4ca389c6ade0f3abdf5278cd2105117f358863010e6d3`。

78-fresh-owned-slot.json在同一TaskSpace30新建p34替换已经退役的p29；新文档首次加载原批准会话URL后六项/current-session/completed/global slot空闲，再移入slot0的真实570×673 popup，p30/p31保留。三个文档和完整候选身份再次一致，原临时monitor已退休。p34自然570×585及实际UI尚待新preflight证明；这次初次加载不是计时样本。79为全新单次绑定诊断，不接续73，不是固定N10的替换样本。


79-binding-driver-diagnostic.json的新三页preflight通过；单页再次被原guard拒绝，但这次首个失败字段已捕获：p34的`Page.navigate`返回后，`Target.getTargets`中同一唯一target/type的URL暂为空串，`chrome.tabs.get`的URL及pendingUrl仍为批准地址，status=loading，tab/window身份均匹配；唯一mismatch为targetUrl。后续CDP命令均因同一空URL被拒绝。外层收到本token的blocked信号后先完整落盘永久放弃，再只读有界poll；没有性能raw读回、身份晋升、重放或计入N。这证明本次导航过渡态与驱动校验相冲突，不证明产品启动故障或其性能合格。

80重新取得三页六项/current-session/completed/global slot空闲、完整候选身份相同、测量页marker不存在及原monitor full-final settled/idle；81按既有owner流程disable/detach该已结算session并恢复listener，只关闭p34/p33，blocked marker保留到关闭，销毁潜在私有registration/listener。83在同一TaskSpace创建p36替换退役slot，首次加载六项完成后移到原570×673位置，保留p30/p31，新诊断为p35，完整候选仍为5be/0e1。该初次加载没有性能计时资格。下一步只修driver对已证明导航中间状态的处理：空URL不能当作合法绑定，不重放导航，其他精确身份与foreignURL拒绝、全部计时阈值继续保留。


82仅修60运输适配器处理上述已证实的导航过渡态：本次实际dispatch目标、空Target URL、loading和批准pendingUrl及其余完整官方关联/几何证明才可等待；共同1000ms截止从首个实际dispatch起算且不可重置。空URL不能返回为合法绑定，只有全owner恢复原exact后才返回原loader receipt。并发资格在取证边界冻结，较旧合格快照须重读，已证明exact后再空和其他硬不符锁存；foreign pendingUrl同样对全部owner拒绝。原三页100ms完整wrapper envelope、25/500、20/30/120及canonical collector未改，1000ms不能取消未知native Promise。单页短空恢复、持续空/foreign/其他owner/几何、已发读取join、并发交错与真实三页160ms envelope拒绝的实际IIFE用例16/16，受影响回归89/89、语法6和manifest输入8通过；历史失败及fixture修正详见82-analysis.md，79–81原字节未变。entry为`36289a445e1533143c5c0130264f485885a6091becf73e01ad881200fe10fde1`、bundle为`ce375dd85696bdd8c0b31fea6799c0a7a9d085b2725e4d52125a29f21d944652`；全部CPU已结束，实际60/82补丁独立复审CLEAR，无HIGH/MED；live仍待执行。

84是基于已审79、使用83新owner的一次新诊断；新增blocked后唯一只读poll的2000ms独立时限，永久放弃与预算完整落盘后才调用，超时/拒绝记unknown并停止后续SDK，不宣称底层调用已取消。84独立薄diff复审CLEAR，脚本SHA为`8e07f41633f642e44aa48ea127864ab75a8e56eae9879952a09a7d91573d53b0`；82复审结束前不执行。未来正式32-series接入仍缺实际外层桥接：每个回调返回已获准的state.raw，archive-ready必须保存state并throw携带该raw，不能因底层raw合格掩盖adapter收尾blocked。正式固定N10+3/evaluator和>95仍未完成。


84实际执行在任何PageSDK、adapter或导航之前因原TaskSpace30已不在清单而拒绝，无计时或pending测量。空间消失原因未知，不能归因于产品或声称用户转交。按ego指南对已关闭空间的入口规则，同一目标新诊断空间为47/p1；85实读包括VM target在内的完整候选与83完全一致，原三个agent创建的popup target仍在，旧诊断p35已不在。没有重复创建站点。

86最终只读证明保留的p36/p30/p31仍为原documentId、完整官方target/tab/window与自然570×585/visible/几何一致，所属probe/bootstrap/AX均无，六项/current-session/completed/global slot空闲，原生composer草稿为空，独立proof会话已detach；完整身份仍为5be/0e1。86初次草稿检查仅用#prompt-textarea而错误拒绝，86-ui-projection记录缺该单一selector；改用原31 canonical完整selector并同时检查textarea.value或contenteditable.textContent后证明通过，未修改产品、文档或草稿，也未导航。原失败保留。87仅把已审84的空间、setup/key/output薄替换到此新诊断与原三个已重新证明的owned popup，薄diff与86资源证明已独立复核CLEAR；不是84测量的重放或旧raw续接。


87新单页仍未获完整测量屏障，永久放弃后才执行唯一2000ms只读poll；failureBinding为空且导航settling未过期。88限定生命周期诊断确认真实loader receipt已返回，新document六项/current-session/completed、global slot空闲，完整候选仍相同；测量页probe/bootstrap/AX不存在，原monitor full-final qualified且settled/idle，adapter独立sessions已detach。失败为new-document observation watchdog及缺失owner/document measurement barrier，不能当作产品启动超时或性能样本；没有读取或恢复其性能资格。

89再次取得新鲜六项/current-session/global slot与marker证明后，仅退役该own settled monitor的Runtime session并恢复原listener；关闭87所属p36和诊断p1，销毁遗留registration/listener，blocked marker保留到关闭。保留p30/p31，新的同Space47诊断为p2，完整候选身份前后相同；UI锁已释放。90离线捕获实际IIFE交给new-document API的source，在无bundle闭包globals的独立VM可解析并创建同token probe/bootstrap，尚未复现真实浏览器缺标记原因；不据假设修改产品或放宽门禁。正式N10+3/evaluator及独立>95仍未达成。


91按原83首次加载流程补齐已退役slot0：同Space47的新p3/target084965658739DD62969B478024FCF493/tab1114140079/window1114140080，自然570×673，保留p30/p31。三页六项/current-session/completed/global slot空闲、前后完整候选身份不变；这只是资源准备，不是计时样本。

94在两个全新自有空白页上做最小真实CDP协议比较，只导航到本地inert data HTML，不触及站点/草稿或旧87测量。两条独立flattened session均取得addScript identifier和新document/loader/source证明：未先Page.enable时marker为null；先Page.enable时同样注册脚本创建了正确nonce marker。两条均移除注册、detach并关闭测试页，完整候选身份不变。60原独立session初始化没有Page.enable；这是可复现的驱动域初始化缺口，正在其原owner修复，不是产品性能证明。90独立VM正例并不覆盖真实域激活要求，保留原正例与真实94反例，不改写87或其资格。


90已完成限定修复与CPU冻结：三个独立attach之后、registration之前，逐session用完整owner前后证明执行Page.enable；原observer closure证明后才disable所属domain并detach，未知观测不disable，不停止原33 monitor。实际IIFE的协议状态RED明确失败，定向74/74及71受影响3/3通过，语法5项、manifest输入8项通过，canonical和445份保护文件不变。entry `e2942ed59fc9efe011e223f4db8b3a47f1c347a4e65600e42c7ae82a0e8d14b2`，IIFE `b794fdf87cb0557b8b9e5b12fc1af754b6849fdca1dec713324d68e16a626b67`，manifest `12db94007020a4e5dd6a9e904241bc36d1b4ee76b2e339c495b4347f2a21f776`。真实修后站点观测尚未执行，待独立实际diff复审。

93只新增inert外层callbacks，原32继续拥有完整预声明固定N10+3及停止规则：exact13个one-use调用、合法barrier后返回state.raw、archive-ready仍throw、合法读回后identity失败保留原raw finding；blocked先fsync永久拒绝再唯一2000ms只读poll，unknown之后仅本地落盘。15/15针对性控制流及语法通过，bridge `b4530a2c657a71d6c81699de5d72007f57c7035b9e295d0849c2719b69e42d1f`，全部CPU已停；93/95/96正式链路复审延期，不能标CLEAR。95只是未执行的入口，必须先有当前候选全新合格单次及两个目标保守upper≤1000ms才能创建/运行新组；没有写正式plan或采样输出，不能以桥接完成代替N10/evaluator。

## 最新有效单次与调度时间线（2026-11-14）

90实际diff及94协议证据已独立复审CLEAR，无HIGH/MED。92在5be/0e1同候选上首次完成有效自然视口单次：最大扫描间隔286.9ms，单次扫描中位0.4ms/最大1.3ms，无产品或驱动错误，六项/current-session/completed及global slot空闲；full-final、AX、measurement close、独立快照/身份和cleanup全部通过。但队列保守upper **1859ms**，导航 **1374.9ms**，仍超过单页1000ms目标，不能进入正式10+3。提示词真实AX upper3205.8ms在对照20s范围内；该值不是队列/导航成绩。92原始值与失败事实保留。

97只补数字诊断，区分真实请求到达、准备就绪、取得调度槽及开始boot；原queueWaitMs仍保留“准备就绪至boot”的旧含义，不能将提前准备年龄误当实际等待。缺字段RED真实失败，新增测试GREEN1/1，相关调度/准备/unknown/退役回归47/47，语法通过；独立限定diff复审CLEAR。源码SHA `d10f30d1bb621988010a641a38fc1328c4df432f14d614b771606950167cbfe5`，测试SHA `8ce263ba4bb308ec99dc7b7abef9f90f8d0a596eadfcdc051efd3e30b18a2ff4`。没有改2/4/8/6限额、调度规则、Authority、runAt或未知栅栏。

现有唯一watcher61448生成并安全应用revision `2c9d4075a5282df0f80c640873d629866335a4499b80ce46cae28b803837b1b5`，SW `cb846e030c4c6b563aa357c4e2d159c87d4bd921cf320e454766b0651f427457`，disk/applied/URL/VM实读一致；实际Chrome磁盘加载路径仍NOT_TESTED。98前置在会话变化时正确拒绝旧session回执，没有计时导航。原诊断target已消失，同Space47唯一agent空白页按官方入口adopt为新诊断p6；原三个owned popup保留。99仅对92已知完成且observer已清理的slot0进行一次当前候选初始化，不计性能样本：新document `425FA10BA9EC7044BF3149B5E45A50CA` 六项/current-session/completed、global slot空闲，monitor及所属session已清理。该次队列ready→lease为0ms，旧queueWaitMs却为612.7ms；导航ready→lease为1437.3ms，ready时两个槽均占用，owner/manual阻塞标记均0。说明本次导航有真实两槽等待，队列旧值主要是准备年龄；99不提供端到端性能合格结论。

100限定只读账本诊断：1694条执行、session ledger29条，缺失恢复候选1502条/508个document，其中477个关联当前全量tab清单中不存在的tab，31个关联仍存在tab；新鲜tabs.query耗时0.3ms。101随后核对官方tab替换与document生命周期，不能证明“旧tabId不在清单”就代表原UUID已销毁，方案在实施前拒绝。原exact getFrame、BFCache及不可观测保守保护保留，没有缓存absence或清除其他owner/unknown历史。

99的重复文件写入使用truncate后writeFile，旧FileHandle偏移未复位，原文件含前导NUL；原字节保留。`99-archive-recovery.json`记录偏移和哈希，`99-initialize-current-timeline-recovered.json`仅从已有完整末段JSON恢复，没有再次读取浏览器或晋升为性能样本。后续重复落盘改为完整Buffer、显式position短写循环和fsync。

102将已预留世界的两处安装元数据更新限定到本次world/execution/nonce/compiled SHA：仍新鲜读取完整session及原始持久execution、完整绑定、生命周期和事务内CAS；只在对应session行存在时省去无关历史恢复，缺行回原完整恢复。初始写入和完成阶段分别核对原持久生命周期，独立审查发现的“缺失/null生命周期可被旧ready重建”MED已修复并复审CLEAR。外来行逐字保持，retire、child、releasePending及allocate/reserve两次完整账本不变。新增20项行为覆盖，相关392/392、语法及限定diff检查通过。104初始化三个owned窗口后，105在revision `18a16e5b021a8b510dcab8324cf6bd58fbb642418d66a7cece88d9732b193669` / SW `418363b5b0889b836f9978a43852d7792fd61e3c9f24c99aeecdebab6f61180d`取得有效单次：队列upper973.6ms，导航1235.9ms，max gap242.6ms；导航仍不达标，不能进入固定10+3。

106只让已持久预留、配置成功的installed main在等待原三次exact Native隔离探针时释放世界账本串行队列；父调度槽保留，全部探针及新鲜预留复核成功前不返回worldId或派发用户源码。导航、关闭、预留释放和替换均拒绝迟到证明；失败仅清理同world+nonce，不退预算，清理写入失败保留保护；默认child/manual未选择并行。两次fresh完整账本、2/4/8/6及4096限额、原source/Authority/target/unknown围栏不变。真实RED为1/7，首轮GREEN7/7；补齐后两次探针拒绝/错误document、清理写失败和默认预留child串行，相关405/405通过，独立实际diff复审CLEAR、无HIGH/MED。

107沿用唯一watcher61448、`dist/development`，三个owned popup完成当前会话初始化；候选revision `6bc4ae3cae176ffd67bc079a5830ca8d27ccf20a76be32837254c67b0d46ce1a` / SW `8d29c7072b6f55b771a2ea4685954b21994bcf11dff214e2503f3dbecd6dbcbc`，disk/applied/URL/VM完整身份一致，实际Chrome磁盘加载路径仍NOT_TESTED。108为该候选新有效单次：导航upper960.9ms，队列1217.6ms，max gap239.5ms，无产品或驱动错误；六项/current-session/completed/global slot空闲、final/AX/measurement close/独立快照与身份/cleanup通过。队列仍超1000ms；105与108不能拼成一个合格候选，也都不是N样本。正式固定N10+3、evaluator及独立>95继续未完成，93/95/96正式复审继续延期。

109只替换恢复查询的固定八个一批等待：本次去重UUID由最多八个查询者连续领取，每UUID仍新鲜exact getFrame一次，全部结算后按原execution顺序合并。异常继续保守保留，第二次账本重新查询；没有缓存absence、提限或省略任何一次完整账本。held-first门控用例真实RED1 fail，修复后相关406/406、语法和限定diff检查通过；独立实际diff复审CLEAR。108证明历史查询是明显开销，但没有逐请求证据证明batch尾部等待占比，收益不能预报。

110的当前候选为revision `c07307048171312cb2c7488cc389fa8a5de4c47c59607c06f85a97732b48c97c` / SW `b938a427b48f0f2ce168945955ae41e7d646c5adea94474ddc1647862031279e`，三个owned窗口完成新会话初始化及完整身份核对。111三页preflight通过，随后单页在Page.navigate后被驱动拒绝：同一唯一target/type、tab/window、批准tab URL和loading状态均匹配，但Target URL暂为空，pendingUrl的有界投影为null。该投影合并了属性缺失和其他非字符串，不能认定其原始类型。外层已先fsync永久放弃，再执行唯一两秒只读poll；没有性能raw读回、性能结论或重放。

112是独立只读生命周期对账：四owner恢复完整exact，三页六项/current-session/completed/global slot空闲，完整身份相同；原monitor settled/fullFinalQualified/idle、无inflight事件，adapter calls settled且无残留adapter session/detach错误。失败页仍有匹配原monitor token的probe/bootstrap，measurementClosed=false，不能测量合格化。113实际薄diff独立复审CLEAR后重新取得上述证明，只退休原已结算monitor，再关闭精确自有测量target及diagnostic，销毁活跃observer和private registration；blocked marker保留到关闭，不伪造measurement barrier。114在同Space47建立替换slot0，当前六项完成并保持真实570×585视口入口；其首次加载不计时。

115只修驱动对实际导航中的typed pendingUrl缺失等待：仅属性确实缺失且值为undefined时允许原等待分支；own undefined、null、空串及其他类型仍拒绝。空Target URL仍不是合法绑定，必须在原共同1000ms截止内恢复四owner完整exact，原100ms三页触发包络、硬漂移锁存与unknown/cleanup围栏继续保留。新增21项行为验证及受影响回归共102/102、71 policy 3/3通过，实际字节独立复审CLEAR，无HIGH/MED。entry SHA `36ec6dffa7099720a136abc5dbe4f0e397468b9ece7a0261c60aad2a66ad05d6`，IIFE `f2dc36e3bc4360ea4929077f24c74ca039efa0cc322b72a63b133ca35726c2d3`，manifest `4220636bc4eae9d7a1d54576fe98906e318db6ef7c4d00c7d12ce3bcca1b34a6`。111仍永久无效，不能根据115或后续观测改写其失败字段。

115测试导入原90测试时意外覆盖了三份历史产物：`90-captured-registration.js`、`90-original-path-evidence.json`、`90-serialization-evidence.json`。原hash已保留，但原字节没有可用备份，不能声称已恢复；现存改写字节另存115 forensic文件，失败检查、差异及恢复报告均保留。`115-checks.json`明确为`BLOCKED_PROTECTED_BYTES_NOT_RESTORED`、scopePass=false；102/102行为验证及当前驱动复审不能替代历史证据完整性。先前“445份保护文件不变”仅描述90当时观察，不再代表115之后的现状。

116在同一109候选revision `c07307048171312cb2c7488cc389fa8a5de4c47c59607c06f85a97732b48c97c` / SW `b938a427b48f0f2ce168945955ae41e7d646c5adea94474ddc1647862031279e`取得新有效自然视口单次：队列upper **1005.2ms**、导航 **477.4ms**，max gap243.3ms，无产品或驱动错误。六项/current-session/completed/global slot空闲，full-final、AX、measurement close、独立快照/身份及cleanup均通过；队列仍超过1000ms，不能四舍五入或重试抹除失败，也不是N样本。当前diagnostic为Space47/p7，替换后的slot0为p8、document `5695702767ABD8B110CA3190AF163B7A`，p30/p31保留；UI锁已释放。

117仅在已结算候选上做两组反序只读分页对照，不是启动计时或性能资格。真实IDB支持getAllRecords；256条页读7次，4096条页读1次，两组各读1778条/6308957字节且完整key/value SHA一致。256/4096顺序分别25.7/19.8ms，反序4096/256分别20.5/21.9ms；完整候选前后相同。这只能证明该次有限对照中1.4–5.9ms的扫描差异，不能预报端到端收益，尚未据此修改分页或扩大验收。正式固定N10+3、evaluator及独立>95继续未完成。

118随后仅修改`readPageRecords`的一处limit表达式：execution每页4096，其他kind仍256，原事务、prefix、exact afterKey、tag过滤、完整累积和all fallback均不变；不是4096条总截断，也不改变原执行配额。16项行为验证真实RED 6 fail后GREEN 16/16，现有IDB快路径/游标/失败等定向6/6；新增与受影响集成合计422/422。后页unknown集成明确把pending放在第4097条，仍恢复原slot/tombstone并保持cached/unknown不重放。实际字节独立复审CLEAR、无HIGH/MED；源码SHA `97091bf95857b53f49e0f81c8f1689927bbc243816cf2c90e4e59629c564c222`，当前源码/测试和日志身份记录在`118-current-source-manifest.json`。这不提供真实启动延迟通过结论。

119初始化在旧diagnostic已不在同Space47清单时，按原owner检查在任何identity/attach/navigation之前拒绝；current为空，没有计时样本或未知Native操作。随后的官方inventory显示仅一个agent-origin、未托管的about:blank，旧p7消失原因未知。121仅以该明确target的新鲜唯一性证明，在原空间adopt并重新建立diagnostic后继续原初始化；不是重试已发导航。119/120复审发现的“unknown导航未持久化attempt”和“start/readback缺即时fsync”两项MED已最小修复并复审CLEAR；原unknown不重放、归档及cleanup边界保持。

121实际初始化成功，diagnostic为同Space47/p9，三个owned popup六项/current-session/completed及global slot空闲；持续开发候选revision `bf7d3cc5f289ec1ce0a8657f2856b3f4f507a74badf3b195f834add7bcf00074`、SW `13552e86248f97bd031d99564cd055bc38ed5599a8649af08e10330345cd2877`，disk/applied/URL/VM身份一致，Chrome实际磁盘加载路径仍NOT_TESTED。120在该候选取得有效单次：队列upper **858.2ms**、导航 **974.9ms**、max gap226.8ms，无产品或驱动错误；真实prompt AX upper2120ms符合20s对照范围。六项、full-final、AX、measurement close、独立完整快照/身份和cleanup通过，UI锁随后释放。这是进入原固定采样的前置，不能计入其N或宣称P95达标。

原93桥接正式复审发现MED：最后一次回调在fsync/close等待中可被并发拒绝，但随后覆盖为complete并返回成功raw。124保留原字节备份，三处held窗口真实RED 3 fail，最终同步deadline检查RED 1 fail；修后19/19通过并独立实际diff复审CLEAR。所有末尾await后重查永久锁与原180s截止，再无await地提交终态；关闭前只记complete-intent，合法失败raw仍归原32保存。bridge SHA `e859f6f461fb0f8865f82748d4a1e84599e45d5024356c87902588643e481efa`。原32/31/33/60/71和产品源码未由此修改。

新122固定入口与123投影器仅用于该候选的全新`execution-pages4096-v1`组，旧95/96保留且不运行。123保留原保守端点及真AX，重新用原observationGate核对probe；只允许一致的accepted summary/result/three child，消费118真实422回归及全来源hash。39项离线检查包含in-memory synthetic完整39观察/13document正例和失败/重复/来源漂移负例；合成记录不写真实系列槽位，不提供live资格。此前空安装集导致的synthetic fixture失败已保留并修fixture，未放宽产品或原gate。122/123最终实际字节复审完成后才运行原固定N10+3；production、正式发布和评分仍不在当前阶段。

122/123最终复审均CLEAR、全部CPU ACK后，`execution-pages4096-v1`仅执行一次，停于初始preflight：`page.evaluate argument must be JSON-serializable`，acceptedSingles=0、三页未执行。93 transcript只有intent和rejected，没有start-intent/started；没有采样导航或性能样本，原组及错误保持原字节，不覆盖或补样。初步定位为93对原31无参数身份查询显式传入undefined；首次adapter参数的可选clockOrigin也需保持可序列化。仅修驱动并新增严格参数回归；产品候选和阈值不变。后续使用独立v2计划、文件和hash，不复用v1任何记录；v2执行前仍须实际字节复审、CPU结束及完整现场身份通过。UI锁已在本次拒绝后释放。

125只修93的两处可选参数：无参数时省略第二实参、首次clockOrigin未知时省略该属性；RED两项按预期失败，GREEN为原19＋新3共22/22，实际diff复审CLEAR。bridge SHA `d7d4cbf7dbe0439f8f877f925ffb19c189e84cce60cf031c986e4b26dc8f9a3e`。124末尾围栏、固定deadline、永久锁及unknown后的禁止SDK路径未变。v1是adapter启动前的参数拒绝，不是Native执行结果未知；此前初始化及identity CDP已经发生。

v2入口只替换runId及记录文件，投影同步独立输入/输出/来源，并核对runId与transcript精确绑定；新Map检查20/20、两个语法检查通过，实际薄diff复审CLEAR。全部CPU ACK后，`execution-pages4096-v2`仅执行一次：single-01有效但**队列upper1141.3ms FAIL**，导航349.8ms，max gap208.1ms，driverFailures为空。原32按首个产品失败停止，acceptedSingles=0、三页未执行，不替换或补样。两次回调均finished、归档/观察关闭/独立身份完成；raw pending=false、outcomeUnknown=false、refreshForbidden=false，六项完成且cleanup有效，UI锁随后释放。该失败优先于120单次前置PASS，固定N10＋三页仍未达成，不运行只允许完整组的投影或evaluator。此次队列parent lease即时取得，worldSerialWait225.9ms、两次fresh ledger116.8/94.4ms、allocate490.5ms；下一步仅诊断这一实际争用，不改阈值。

128仅修改原preview-worlds及其框架测试：首次完整只读ledger立即启动，并同步登记原FIFO队列位置；第二次fresh完整ledger仍在原锁内，清理只合并两次快照的原保护worldId（含子世界），最新rows单独决定6/4096配额和持久化。所有ledger查询共用8槽、逐调用释放，不缓存absence；原configure、三次顺序精确proof及nonce/CAS保留。新增12例在旧源上7 fail，修后12/12、相关434/434；独立复审补充第二次fresh读取拒绝负例后，最终13/13、相关435/435，旧日志未覆盖，实际源码与覆盖均CLEAR。source SHA `2bd97198833121ec6fe979c9e2481a9a877d0597525931dc7ccc47a1e72ee5f1`，final test `72a0fb717489816b5b07158807bff29fa5887de7188718ef6a3a7f940983a30b`。重叠阶段不相加估计收益，caller allocate总区间未改。

原唯一watcher PID61448、token及路径不变，磁盘新revision `0792c73a7fa67ae2c453c5650d4a0230235963ab1948036b24d9277fb5a97c42`、SW `68fd46af3ace550c227040dd4c8f9b863e6acef86998b29d94dfd10b42c22ecf`，manifest SW与实际字节一致且含新ledger wait标记。128-current-source-manifest绑定九文件、最终435原日志及磁盘候选，SHA `5158c954f5d799d9e04c06a92ba8488fb7b73bda15a467ab8adc78d6afd2ffb2`；此时runtime applied仍待核对。129在同p9从newtab返回官方sidepanel后，因页面生成新hostInstanceId而拒绝旧精确URL；current为空，尚未进行三个popup初始化或采样。131独立只读inventory保留并永久不作样本，确认同Space47/同C30 target/p9、agent归属与新实际URL；不是Native unknown。后续132仅绑定该固定hash的已读URL、移除goto/newtab分支，不重放诊断页导航；133仅更新原smoke输入/输出与独立globals。UI锁已释放，等待薄diff复审及新候选真实smoke，不能把435或磁盘构建当作性能PASS。

132实际full identity已确认0792/68fd在disk/applied/URL/VM一致、六安装不变，但扩展重载的新incarnation `e6e6d213-81bd-41e5-a9b4-dc3679cee90d` 与旧49ce不同，初始化在popup动作前停下。134固定132证据字节和新session；旧文档/派发前仍按原49ce记录核对，新导航及结算用e6新session，fresh identity必须等于132.before。134/135薄diff复审CLEAR；136仅为fake输出及SDK边界的离线前置核对，不是browser或性能证据。

134实际三页初始化成功，均六项完成、slot空闲、monitor拆除。135仅运行一个预声明新smoke：**队列upper1351.8ms FAIL**、导航761.6ms、max gap208.4ms；真实AX、归档、full-final、measurement close、独立身份与cleanup正常，raw pending/outcomeUnknown/refreshForbidden均false，adapter calls及observers关闭。当前p8新document `A8DB258C4749679DB21E255F86DAE489`；UI锁已释放。该次不计N，也不因135 status为qualified-natural-smoke就误报1000ms产品门禁PASS；尚未创建或运行新固定组/evaluator。内部分配本次317.3ms，旧v2单点490.5ms，不能据此宣称端到端改善；本次boot marker耗时87.6ms，旧单点5.1ms。后续仅定位真实启动链及队列消费者初始化，不修改测量端点、阈值或安全保护。跨SW performance timeOrigin与Date.now的简单拼接存在偏移，不据此拼接因果时间线。

137仅将完整history只读查询与原authorize→verifyTarget链重叠，owner和准备句柄校验仍在前；两分支全部结算后按原错误优先级处理，均成功后才退休旧UI或进入world/Native。新增7项在旧源上6 fail，修后7/7、相关442/442；实际源码及覆盖独立复审CLEAR。source SHA `71875eefec538b23b29de50c34ca81ccb8c78d58fc1e4d3a7e60b14436821c6e`、test `e748927aa35eceeb754d1d7a620bbefb246dc21091e08e4d1073c05c77ed76c3`。authorizeTarget、historyRead和共同join分别记录纯数字区间，不相加；historyWorlds改为join后的原退休/身份检查区间，total起止点不变。其余八个保护文件和128用例不变，没有提前Native marker或改变2/4/8/6/4096及三次proof。

原watcher61448生成revision `62d54ebf08367bddfb338e3078f94ef9f0d78ae668d92c6c1e17cfbdf9d5c4aa` / SW `ebee9a0d821edb216f0bb859ffacbbdd1dbda567396cfe8a98b8417625df7745`；137-current-source-manifest SHA `4796f4be8d75633f4712013e6b3cf5c61c780411bc5421165c78ef1d1a81e8b2`绑定九文件与442原日志。138/139实际复审中补齐诊断tab/window精确绑定，140五项离线实际callback检查通过并复审CLEAR；不是浏览器成绩。

138实际仅停于首项TaskSpace归属检查：47不在官方清单，current为空且没有诊断激活、attach或导航；停止记录保留，不是Native unknown。只读inventory显示仅其他任务0/10/33，未触碰。按ego“原空间已关闭”的入口规则，141只建立本目标替代Space50并记录意图；旧三个popup target仍在，旧C30诊断target不在，原因未知。144在新agent p1建立一次诊断，实际tab1114140098/window1114140097，完整disk/applied/URL/VM身份确认62d54/ebee、新session `b2977d3f-0798-41da-a0f1-c161e109c187`；未操作旧popup或计时。原生Chrome磁盘加载路径仍NOT_TESTED。后续仅重绑诊断及验证旧文档e6回执、新导航b297回执，现有135失败、固定N10＋三页未完成不变。UI锁已释放。

145/146薄diff实际复审CLEAR、全部CPU ACK后，145成功初始化原三个popup，六项/current-session/completed、slot空闲、monitor及session清理通过。146仅运行一次新候选自然视口诊断：**队列upper1104ms FAIL**、导航900.2ms、max gap263.2ms；驱动、bootstrap及runtime错误均为空，真实AX/full-final/measurement close/独立完整身份和cleanup通过，pending/outcomeUnknown/refreshForbidden均false。原始归档SHA `06396ca656523847efe77ef2f4c8cb1456ed25693b16b894178f93039bd2296f`，145初始化归档SHA `c44ca07e50bbee3dd86be756dc3420cd5bcabbd80a02a21067a8e2d924b7509c`。不重复此smoke、不计N，也不能将qualified-natural-smoke当性能PASS；固定N10＋三页及evaluator仍未执行新组。当前p8 document `FFB054F4647C0633CB9CC20AA9EB4984`，另外两页沿用145新文档；UI锁已释放。

146原SW诊断中，队列ready→lease为0ms；authorize/history共同join57.4ms，history51.6ms已被覆盖；first ledger56.9ms也已被worldSerialWait108.1ms覆盖。其world allocation257.9ms，三次顺序proof71.8/24.1/5.3ms，Native completion205.4ms。鼠标增强first ledger103.9ms仍暴露、world allocation339.6ms；这些是局部区间，不能直接相加或拼接页面/SW时钟估计端到端收益。页面从队列最后不可用1702.6到首次可用1965ms的263ms采样间隔覆盖了执行期间，不能据此宣称队列业务固定等待263ms。

147仅只读取得实际已安装队列r25源码104707字节，SHA `ab795b7ab732faf6e597c2050ad941772413d9f4349377df17c32102e650175b`，与冻结安装身份一致；没有执行、替换或升级业务包。可读派生源码表明初始化末尾立即inspect/render，没有await或固定180ms初始化等待；当前尚无依据修改队列业务。后续仅针对已测出的框架路径诊断，原阈值、端点和安全保护保持。

148首版在自动boot新鲜registration精确校验成功后、marker之前启动首份FULL只读观察；只在原allocate处入FIFO并消费，第二份fresh FULL仍独自决定配额及持久化。手动、直接调用及四槽不可变源码准备保持原路径。新增14项在保存137源码上RED 0/14，首版GREEN14/14、相关456/456，语法/差异检查5/5；这些只证明对应离线覆盖。独立实际复审随后发现两项MED：错误句柄可能在失败清理中退役另一份观察；已登记观察却省略句柄可能触发第三份FULL且原观察未drain。首版因此BLOCK，不进入页面初始化或smoke；正在限定修复及新增反例，原首版日志、hash与manifest保留。

首版148历史磁盘候选为`c7871a9fa78f5b8c4820f0d6e53d0cfb62bcef95c9eb7645e89efbd745de2e29` / SW `d6bea0863e10d4489a53cb8b31c9fa8b799c3522394bb60de2a5b216a0361f87`，148-current-source-manifest SHA `af89d1557a6ea22c32b3d79731698de4c008dc65968058eb463ab37facaae7f3`；不能据此宣称runtime或性能通过。原watcher61448及锁token不变。152仅只读inventory：Space50仍agent所有、原p1/A160 target在newtab、三个原popup target仍存在；没有诊断激活、导航、adapter或popup操作。149/150仅建立带UNBOUND保护的inert入口，151新候选运行身份尚未取得。


## 148 最终复审与155真实页面结果（2026-11-14 续接）

当前用户操作已经恢复：自然 viewport 570×585 的真实 ChatGPT 页面上，发送队列皇冠按钮可命中，目标 assistant 的导航可命中，提示词控件通过原 AX 可操作检查。未发送消息。该冻结候选仍未通过单页性能门槛，不能宣称完成固定 N=10 或三页并发验证。

- 源码：独立 reviewer Zeno 对最终148源码和测试差异给出 CLEAR；外来 B 句柄不被 A 认领/等待/丢弃，漏传原句柄及 source/target 错误先排空原观察再释放 owner。LSP/AST 工具不可用，CLEAR 仅为静态复审。九个文件与 `148-review-checks.json` 完全匹配，既有 461/461 日志 SHA `29bfa9c663fb051311d4f6e02cd34eed37c7829fe890aeee60b4a8d7f30b4bc6` 已核对，没有重复运行这些测试。本对话没有新增产品源码修改。
- 产物与运行：复用唯一 watcher PID61448 和 `dist/development`，revision `af83abf2ba356c40880b53dd573926c9f227fb4f4da8fa234bf7d728e85658f9`，SW `775b8e0d8a491154f650f1c298c28709c39b91824b9c1670e2f3d07e3b795849`；disk/applied/URL/运行 VM 与六项完整安装身份一致，session `80119f46-6e39-4d94-93d0-0cb92bd15e76`。实际 Chrome 磁盘加载路径仍 `NOT_TESTED`。
- 资源：原 p8 的 tab/target 均已不存在；p30、p31 原 owner/几何仍匹配，保留不重建。152证明缺失，153仅为缺失 p8 创建同一 Space50 下的新独占 popup p2（target `C9FD64BC71E91EF81501BF7DE66D9B1D`，tab1114140104/window1114140105）。149在任何 popup attach/导航前停止。154的驱动核对误将新 blank URL 与未来网站 URL 比较，失败发生于网站导航前；所属 session 已明确 detach，156纠正该绑定比较后初始化三个指定窗口，六项/current-session/completed、global-free、monitor/session 清理通过。没有修改采集器、端点、阈值、时钟、公开规则或业务安装版本。

155只执行一次本候选自然视口诊断，原31/32/33/60/71传输输入及 bundle 未变：

| 原端点结果 | 实测 | 判定 |
| --- | --- | --- |
| queue conservative upper | 1002.4000005722046ms | FAIL，超过1000ms，不能向下取整 |
| navigation conservative upper | 861.1000003814697ms | 本单次满足1000ms，不代表P95 |
| prompt 原 AX conservative upper | 2055.4000005722046ms | 本单次满足20s |
| 最大 scan gap | 215.9000005722046ms | 满足原500ms |

155完整身份、六项/current-session/global slot、full-final、独立快照、measurement close、AX、observer/session收尾有效；product/driver/bootstrap failures为空。这些资格检查不把超过1000ms的结果变为性能通过。目标 assistant 合法拥有自己的导航；页面上多个不同回复的导航不作为同目标重复。157截图显示队列与目标导航实际可见，截图发生于测量结束后，不属于性能样本。

本次队列实际父 lease 等待为0ms，旧 `queueWaitMs=653.0999994277954` 是源码准备年龄，不能作为排队等待。最大已测剩余阶段 `allocateMs=349.69999980926514`，其中 `worldSerialWaitMs=163.19999980926514`、第二次新鲜 FULL `worldReserveLedgerMs=84.80000019073486`；第一次 FULL 总耗时201.89999961853027ms，但到分配时 `worldAllocateReadWaitMs=0`。重叠计时不能相加；这份记录支持将后续调查转向原世界锁等待及其新鲜全量读取，不支持继续猜测提前第一读的收益，也不支持假设队列 r25 固定等待180ms。未改权限、容量、原 FIFO、全量查询、global8 permits、Native三证明、Authority/CAS/撤权或unknown保护；未承诺任何未经实测的节省。

固定 N=10及三页并发仍 `NOT_TESTED`：155 队列失败，按原门禁不创建新固定组，不补样/替换/拼接/追加，也不执行只接受39观察/13新文档的 evaluator。三页初始化与preflight不是三页并发性能证据。原goal仍 paused，当前续接不恢复它；production/发布/完整测试矩阵/95+继续延期。历史115三份证据原字节缺口未恢复。

完整证据以 `artifacts/page-startup-20261113/158-candidate-result.json` 为索引，绑定 `148-review-final.json`、修复后 `148-review-current-source-manifest.json`、`151-runtime-identity.json`、152/153/156资源身份、`155-history-overlap-diagnostic.json` 和157截图的实际 SHA。当前结论是一次有效失败和明确剩余耗时，尚未达成总目标。
