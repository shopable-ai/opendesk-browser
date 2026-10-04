# OpenDesk Browser 通用框架迁移主计划

当前候选：M5-C1（作者方案，阶段0独立审批 pending）。当前 Goal/唯一公共 writer：01a0fda9-8a86-7f72-89be-e292ffc94ed4。执行依据为 prompts/goal-migration-v5.txt 全文及其历史附件；历史审批不批准本候选。原工程保持 native MV3/webpack。

## 关键执行任务（当前执行入口）

不再扩充规划清单。191项合同只作逐项验收账本，工程执行按以下7个关键任务推进；任务状态见 execution-tasks.json。

|任务|实际交付|依赖/当前状态|完成判据|
|---|---|---|---|
|K0|冻结已有候选，立即Architect→Critic独立审批|进行中|同hash双APPROVE≥95且零阻断；不提前写产品|
|K1|修通现有v2控制Worker与页面userScripts后端|K0通过即执行|真实终止/资源/CSP/返回错误/撤权/精确doc与版本矩阵，独立F1放行|
|K2|后台公共底座实际接入原工程|K1→K2|唯一broker/authority、真实IDB/授权/目标/下载；对应17失败与R1–R8修复|
|K3|ChromePage48成员、控制脚本、版本/运行/停止/结果|K2→K3|真实goto→type→click→wait→读取→return跑通，逐成员证明|
|K4|独立页面SDK、服务、工具与必要资源迁入|K2→K4；与K3互斥写范围并行|无controller独立运行，真实B05及服务/资源验收|
|K5|现工作台真实入口接上框架|K3+K4→K5|授权→保存脚本→运行/停止→持久结果→真实下载完整基本功能|
|K6|冻结同一最终包逐项验收及独立复核|K5→K6|全部必选与压力/重连/禁插件验证无缺失/失败/stale|

每个任务以实际文件、可达调用链和运行证据交付，计划和文件存在均不算迁移通过。当前核心瓶颈是K0尚未送审及K1安全/语义证明未闭合；主writer立即冻结送审，评审期间仅做K1工具与环境准备。

## 当前真实状态与放行条件

当前处于阶段0。旧72来源、48成员均未取得产品 runtimePass；既有 foundation 文件不能作为已迁移证据。RunHost仍依赖 createScrapingModule、template与compileTemplate，SW未装配foundation broker，根manifest最低版本120仅是环境工程旧值。F1控制原型只取得局部证明；死循环终止观察、资源清理、有效CSP/网络归因未闭合。页面函数CfT149的包装返回有局部证据；原生throw/rejection四项失败、host撤权失败与版本矩阵保留。历史17失败与R1–R8全部未关闭。新状态不恢复旧Goal。

阶段0只写本计划、账本、差异、测试规格、来源有限漂移与审批资料。当前Architect与Critic均pending。候选manifest绑定计划、账本、差异、逐项case与继承合同实际路径/hash；报告置于候选之外。Architect→Critic严格顺序，均≥95、明确APPROVE且零阻断才通过；修改对象后双方都重审同一新hash，最多5轮，不抬分。

## 能力包与依赖顺序

|顺序|旧能力→新职责|具体产出与依赖|测试与放行|
|---|---|---|---|
|阶段0|72来源与48成员及SDK/服务/资源→唯一账本|保留旧hash/ID与历史证据；每项明确原行为、新模块、差异、case输入/预期、完成条件；冻结必需分母|当前同一候选两次独立批准；映射阶段不要求未来文件存在|
|F1 / T10|后台wrapAsync控制→sandbox Worker；evaluate→userScripts|修现有两个v2 runner，沿classic Blob已批准分支；不重写fixture。两lane写范围独立，公用版本矩阵由主writer合并|真实死循环终止/资源/CSP/private RPC与code/file/doc/world/Promise/error/授权竞争全部必需证明及独立复核；backendPrototypePassed才能true|
|F2 第一批 / T02→T04→T03→T05→T06/T12|background路由、存储、目标与下载→原platform与SW|先冻结v2 schema/codec/registry/grants；同IDB迁移与原子准入；再精确目标/导航、通用artifact、唯一broker装配；原收费/row/seal规则仅保留到T13业务边界|真实sender/IDB/CAS/abort/restart与foundation115及environment20相关全集；底座100并发/四崩溃点。完整SDK B05此时仍open|
|F2 第二批 / T07→T10产品→T01|48成员与共享page/控制脚本→framework门面/context/RunHost|在claim准入、revision pin、目标绑定后createRunContext；生产sandbox/page-proxy复用原client；固定committed UTF8源码与params，持久return/error/终态|逐48成员正例/异常/限制；r1运行中保存r2与删除；双run不串页；停止/超时/host关闭fence、Worker终止、一次结算；不注册采集即可运行|
|F2 第三批 / T08→T09→T12|brige/axiosx/storage/工具/注入资源→framework/sdk、utils、events、relay|工作台最小allowPageSdk授权→真实Hello→原authority内部sdk-service→短服务→精确document固定callback→原Promise；不启动controller；K4拥有src/agents/page-relay.js与现src/ui/tool-shell.js/tool.html最小allowPageSdk入口，K5后续扩展工作台|完整B05真实HTTP 100并发/四崩溃点、错误/撤权/导航/送达失败、unknown写不重放；存储两种寿命、工具与资源load/error|
|F2 第四批 / T11/T13|旧消费者与现工作台→真实集成入口|现UI补目标授权、脚本/参数/版本保存选择、run/stop、持久结果/artifact下载；T13仅必要去耦。临时adapter归并或删除|真实入口r1/r2、关闭重开、Chrome download complete与文件hash；禁采集；独立SDK另验，不能以此流程代48/SDK用例|
|F3|支持范围框架→同一最终包冻结|production/development各build/pack/verify；固定一个最终production包，fresh profile逐项全量重验；独立代码/功能复核，冻结API/SDK/schema/version/grants/handoff|所有必选无缺失/失败/过期，历史17与R1–R8实关；1000轮、10重连、2禁插件资源baseline；frameworkFunctionalMigrationComplete才true，随后停止|

F2批次不是另设门。所有F2写入依赖F1资格通过，F1原型不计产品完成。遇测试工具错误、可逆实现缺口持续修复；真实关键后端不可行保存复现，停止该后端及依赖分支，不自行换WASM/特权eval/扩大范围。未测是待办，不能当缺前提停工。

## 唯一公共底座和精确调用链

保留原 platform/host/{client,broker,authority}.js、protocol.js、schema.js、target/index.js、page-port/index.js、storage/{idb,repository,index}.js、downloads/index.js。controller和SDK共用一个authority/router/journal/IDB。codec只编码，不持有权限/任务。page-relay只传输真实sender可核验的请求；payload绝不能补缺身份。SDK内部静态framework.sdk-service.v1 driver分配run/op，与网页principal分离，不调用伪host注册、不占controller全局slot，预算15s/一次短服务/namespace/cap白名单。

SDK admission键为canonical元组(principal,tab,frame,document,grantIncarnation,requestId)，不含SW epoch/port。一个IDB事务复验grant与typed canonical digest、分配唯一run/op/journal。相同digest关联原pending/durable/unknown；冲突E_REQUEST_CONFLICT；commit前abort无效果、commit未dispatch恢复原op、写后无receiptunknown不重发、durable未delivery只送原结果。新grant不接旧pending；关闭incarnation后永久拒旧请求；unknown不TTL删除。effect/delivery/receipt/durable/download complete分账。

controller链：现tool-shell→原client→broker/authority claim与revision pin→target绑定→RunHost createRunContext→sandbox固定harness/private MessagePort→page-proxy→原client/broker/admission/PagePort→固定agent或userScripts→原pending→持久result。切active tab不改绑定。无context构造E_PAGE_CONTEXT_REQUIRED；提供会话绑定ChromePage(options)和ctx.page，不共享global page。

导航由持久navigationIntent独立等待新doc握手；旧普通等待/元素失效，goto/reload不靠旧agent生存。settlement保留发出时target与from/to；浏览器身份/最终URL/权限/lease/cancel/deadline重验后原子更新根page。stop先commit取消准入再关闭Worker；不承诺撤销已发效果或terminate网页主线程。

## 源码、数据库与恢复决定

同一数据库从现v1向v2前向升级，保留已有store与显式key，新增scriptHeads/scriptRevisions/results/frameworkKV，复用artifacts；grant、admission、operation、host采用commandJournal的独立namespace tag。结构与索引由T02/T04合同case冻结，不增第二库。revision内容为committed UTF8 bytes/hash，head CAS与pin分离，删除仅tombstone，GC拒在途pin。AppStorage持久namespace/String转换；AppLocal在chrome.storage.session使用typed JSON namespace，SW重启保留、新browser session清空。

升级前原rawBackup按真实cursor导出全store显式key/value快照，核hash；升级abort靠IDB原子回滚。成功升级后使用支持当前schema的只读恢复入口保留诊断与快照，经前向修复恢复；禁止旧JS回写新schema或自动覆盖用户数据。在隔离profile演练blocked/versionchange/abort、快照恢复和前后key/hash再接产品。

## 行为决定与资源边界

详细唯一映射见source-compatibility-ledger.json；精确case见test-spec-v5.json；本次覆盖差异见compatibility-delta-v5.md。所有来源原数据保留，子项才是能力完成单位；完成一个片段不能把background等整文件判通过。

门面文件framework/ChromePage.js；上下文framework/context.js；SDK按bridge/http/storage/notifications/servers/utils命名；JSON/device/network-info工具按framework/utils职责命名；旧事件归framework/events.js；回程codec归platform/page-port/codec.js。禁止按旧工程目录命名runtime/import/pack路径。

dom.ts和detect-quasar.js排除本轮runtime，保留编码/边界测试；testMonkey整包旧业务UI延期且未迁移，保留CMP06独立语义/PROV。资源只按固定消费者允许清单打包。无消费者旧UI/vendor/设备资源排除但保留原来源hash，不算迁移成功；缺指纹资源typed E_RESOURCE_UNAVAILABLE。资源新路径、源hash、许可依据、load/error必须齐；动态引用无法解析不得通过，不为消除unknown拷整bundle。

权限计划在实际manifest与grant中冻结：storage/scripting/downloads及精确目标所需tabs/webNavigation、页面函数userScripts；cookies/notifications按服务授权，HTTP(S)主机仍显式选择/授权，SDK默认无script/cookie/跨origin能力。不使用offscreen/debugger产品权限，不扩大allTabs执行。captureVisibleTab只允许明确绑定且当前可见的目标并复验，fullPage/native typed拒绝。

预算继续沿冻结design/protocol：UTF8控制源码≤128KiB；原始base64每块≤128KiB、单envelope≤256KiB、总artifact≤8MiB/64块，逐块及全量hash；超限typed拒绝。generic artifact固定artifactId/namespace/runId/kind(json/text/bytes)/mime/byteLength/sha256/payloadRef/suggestedFilename，由同storage commit后供下载。用户控制任意JS协作pause明确E_PAUSE_UNSUPPORTED，checkpoint只适用于包内合同，不能宣称暂停任意栈。

所有设备事件原字符串由events公开，设备handler仍延期；串联网络/配置不获取旧token。新替代API明确snapshot(selector)/snapshots(selector)返回纯{outerHTML}或数组，evaluateExpression(expression:string)仅一个非空字符串，在MAIN精确doc await表达式，多余参数E_ARGUMENT_TYPE。这些独立于原48成员，额外列入必需分母。源码资源按逻辑来源13条记录，同一输出bundle/relay物理路径只打包一次；不复制旧assets/core。

资源故障验收保持最终包字节不变：用实际页面CSP/加载拦截、过期document或固定allowlist查找失败触发真实错误路径。移除/损坏包文件只用于单列静态包验证反例，变体包hash不能抵扣最终包功能case。production资源实际功能用同最终production包，development单列build/资源装载检查，证据不得互代。MIT notice按真实根LICENSE原字节随两个包保留，检查case独立于功能成功。

## 测试、版本和证据规则

继承冻结outputs/test-spec.md、protocol-contract.md、compatibility-delta.md及evidence/upstream-v3/test-spec.md/type-click-compatibility.md的本轮必选合同。PROV/CMP/RESOURCE/EX/NAV/B01–05/AUTH/USC/CTRL/FIX/PLG/SVC/DLGEN/LEAK、A01/A02全部保留；SCR完整业务/OPT/F4以后不执行，历史17采集底座回归仍保留并在T13边界实关，不删除skip。具体新增case只是这些合同的展开。

F1最低候选138和执行时实际Stable完整矩阵：Chrome完整version/二进制hash/OS/profile/extensionId/授权开关/doc/world/CSP都记录。现149仅局部证据。取得官方版本信息后用真实二进制验证；无法取得或不通过138，则明确差异与受影响能力、独立重新批准收窄最低版本，再同步manifest，不推定120/138支持。

页面函数返回/error/undefined以冻结typed wrapper承接旧API合同；原生API错误字段实测独立记录。旧四个raw失败不抹除、不改写成原生全通过，新观察case必须记录actual shape，新的合同判决由F1独立复核；不能仅以wrapper通过提前backendPrototypePassed。实际host站点授权UI撤销/恢复与pending barrier要补，不能用remove required permission失败后的成功调用作恢复证据。

每例必须含sourceHash、方案候选、产品包hash（原型另hash）、完整环境、输入/预期/实际、pass与截图/协议/IDB/HTTP/文件/清理引用。方案hash只证审批，包hash只证产品。代码/资源变化使受影响证据stale，F3最终包全量重验；独立验收人与作者分离，不自评分。

保留 npm run check、npm test（仅environment），显式node --test tests/foundation/*.test.mjs与tests/framework/*.test.mjs；真实IDB和Chrome测试另列。新的只读基线：foundation实际115例，98通过、原17失败；environment20/20，二者合计历史135例。源码检查通过32文件。日志见stage0/baseline-foundation.json/.log，不能冒称真Chrome或真实IDB证明。按批准入口、资源清单和执行域更新原verify-package/check-source，禁止任意脚本豁免。生产/开发分别build/pack/verify，全框架实测不能冒称npm test覆盖。

## 账本与推进规则

进度由唯一账本派生，分别显示72处置、48判定、必需能力x/y、SDK/服务/资源、受限拒绝、延期和排除。mapped→implemented→integrated→tested→independently-accepted各有证据，不由文件存在推断。排除/延期不进成功数；分母每版保留ID清单及差异理由，变更受影响范围独立审查。主writer负责公用底座与整合；作者助手只写独立文档草案；评审default子代理完整加载安装architect/critic，继承主执行模型并使用xhigh，实际服务端runtime无证据记unknown。

每次报告：具体旧能力→新模块/真实调用链→本次实验证→未测/失败→下一项交付。Goal原生状态为准，旧文件paused仅历史。全部最终必选与独立验收通过后冻结并停止，不自动进入采集、优化或发布。

SDK资源注入确定使用原PagePort先安装固定ISOLATED relay，再通过chrome.scripting.executeScript({target:{tabId,documentIds:[documentId]},files:["framework/sdk-main.js"],world:"MAIN"})注入打包固定SDK入口。原生文件执行完成及精确document的真实Hello均满足才Ready；不加载远程源码，不依赖controller或userScripts开关。缺权限、document失效、文件加载失败保留各自typed错误，await期间撤权/导航先fence旧请求。

K4固定relay严格采用v5指定src/agents/page-relay.js。主writer负责K4对已有broker/storage/SW/environment/manifest的SDK短服务装配；SDK实现代理只写独占sdk/utils/relay/chrome服务模块，K3不同时修改这些公用文件。K4最小授权UI先交付，K5在其后扩展同一真实入口。


## F1 原生终止窗口更正（M5-C1 round-5）

本轮实测揭示此前 F1-CTRL-TRUE-TERMINATE 的严格 2s 判据与选定 Chrome 原生机制冲突。138.0.7204.183 与 154.0.8037.92 上游 WorkerThread 均配置 2s 强制终止等待；无 CDP/Debugger 连接、同 Worker-harness async-body 的独立 OS CPU 诊断观察到约 2.07s 才停止增长。round-4 的 FAIL 原样保留，不能改标 PASS。

拟定正式判据：实际 host stop/deadline 触发起 3s 内，证明精确关联的 run/Blob Worker 执行停止且 browser TargetDestroyed/不存在，同时证明此前真实死循环 CPU 增长、之后 CPU 静止及 surviving host 可响应。3s 由原生 2s 等待及至多 1s 调度/独立观察余量构成；若超过 3s 或身份/CPU 关联不充分仍 FAIL。关闭操作准入、一次结算和已发副作用边界维持原合同；调用 terminate、heartbeat、计数或只看最终 CPU 为零不构成物理终止证明。页面 MAIN 死循环不承诺通用终止，只允许框架自己创建页的受控退休，借用页不得关闭。

这是执行测试合同的显式修正，需同候选 Architect→Critic 独立批准后生效；不是提示词评审或作者自我放行。F1 全版本实证及独立代码/功能复核之后才可放行 F2。184 必需正能力、191 处置合同、72 来源、48 API、603 必选产品用例及 SDK 独立验收不变，浏览器版本、权限、执行后端和目标业务范围不变。
