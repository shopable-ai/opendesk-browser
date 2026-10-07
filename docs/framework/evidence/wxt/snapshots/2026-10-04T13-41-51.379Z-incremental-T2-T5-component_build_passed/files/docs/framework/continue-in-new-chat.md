# OpenDesk Browser 新对话续接提示词

## 任务目标与授权

接续已有 OpenDesk Browser 通用框架迁移工作。先形成可执行、可追溯、经独立评审的方案和逐项迁移清单，然后按计划继续实施和真实验收。不要直接从 UI 开发或原型补测开始，也不要重新从零调查整个项目。

主目标是：将旧项目 src-bex 中的浏览器自动化核心，按明确职责迁入 OpenDesk Browser 现有 native MV3/webpack 工程，保留已约定支持的公开 API 和调用语义，修复已记录的执行、目标绑定、异步回程和生命周期问题。

“选择网页并授权 → 编写脚本和参数 → 保存版本 → 选择版本运行 → 停止 → 查看结果或错误 → 下载文件”是迁移后框架的一项整体接线验收。它不能代替 ChromePage、页面 SDK、公共服务和资源的逐项迁移验收，也不能成为偏离框架迁移的新产品开发主线。

本提示词授权你在新对话中持续完成上述工作：
- 当前处于计划模式时，仅完成方案、映射和评审，不实施产品修改。
- 当前允许执行时，先落实下面的阶段0和评审门；满足条件后自动继续F1、F2、F3，不在每个普通可逆步骤询问是否继续。
- 本次是当前新对话的续接任务，不恢复、不消息启动之前的旧审计、旧实施或旧②B任务。需要Goal时在当前对话建立明确目标，不擅自恢复其他对话。
- 不自动进入完整采集业务迁移、优化、发布或部署。
- 不捏造通过、跳过必选用例、继承不属于当前候选的评分和完成状态。

## 一、用户已经明确的问题与决定

此前已经执行和改写提示词多次，但仍难判断正在迁移什么、迁移是否正确、还有什么未完成。此次必须修正执行组织及完成判断，不能只再改一段目标措辞。

必须同时交付并持续维护：
1. 一份明确执行顺序、依赖、产出和放行条件的主计划。
2. 迁移前与迁移后的逐项对应关系。
3. 每项能力的兼容决定、具体测试、真实结果和证据。
4. 用户能直接看懂的完成情况与未完成清单。
5. 同一候选方案的独立架构与验收评审；每位均至少95/100、明确批准、没有未关闭的阻断问题。评分必须真实，不为达标抬分。

已明确拒绝在新框架中使用 src/compat/src-bex/ 这种按旧项目名称组织的目录。也不能换成 legacy/src-bex 或复制旧 assets/js/core 树来绕过要求。

原则是：保留约定的对外调用行为，内部按新工程职责组织。旧项目名称只保留为文档、来源账本和历史证据，不成为新运行时目录、import或打包路径。

## 二、工程位置、资料优先级与写入边界

真正的目标工程：
/Users/shopme/Documents/workspace/opendesk-browser

旧核心来源，只读：
/Users/shopme/Documents/workspace/todo-user-vue/src-bex

其他只读来源：
/Users/shopme/Documents/workspace/scrapyJsChrome
/Users/shopme/Documents/workspace/scrapyJs

冻结审计根，只读：
/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85

即使当前工作目录是 scrapyJsChrome，也不能把它当作目标工程修改。

优先级：
1. 用户最新要求及本提示词中的明确修订。
2. 新对话落实并通过评审的主计划、映射清单与兼容差异。
3. 目标工程 docs/framework/goal-constraints.md 中未被本提示词明确修订的原始约束。
4. 冻结审计的技术合同和历史证据。

现有 goal-prompt.md 是上一轮修订，仍有旧目录方案；不能再次把它当成更高优先级要求，将旧结构带回来。本轮定向修订目录归属、执行组织和完成判定，其他安全、兼容及必选测试要求继续有效。

目标工程允许修改的范围延续原授权：
- src/run-host.js、src/sw.js、src/environment.js；
- src/platform/**、src/framework/**、src/agents/**、src/scripting/**、src/ui/**、src/plugins/automation-example/**；
- manifest.json、webpack.config.cjs、既有build/pack/verify/check-source脚本；
- tests/**、docs/contracts/**、docs/framework/**。
原允许的 src/compat/src-bex/** 不再作为本次实现目标。
features/scraping、plugins/scraping及相关业务边界仅做已有T13的必要去耦，不开发完整业务。
保持 native MV3/webpack，不整体覆盖工程、不迁WXT/TS、不新增未经授权的依赖、不修改全局模型配置。资源必须有实际消费者、来源与许可依据。

## 三、已有结论：不要重新从零发现

下面是前次只读核对得到的事实。新对话先做有限漂移检查；若代码变了，记录具体差异，不能默默沿用过期结论。

### 1. 旧框架的核心能力

旧 ChromePage.ts：
- ChromePage、ChromeElement、Keyboard提供导航、标题/内容/URL、元素查询、输入点击、等待、页面函数、Cookie、截图、上传等能力。
- evaluate函数形式等待Promise并返回结果；旧字符串形式有返回true、忽略args的独立兼容语义。
- _execute使用旧tabs.executeScript，并查询活动标签页。
- 文件导出共享page，background.ts消费它；新框架必须替换为每run绑定。
- 关键源码锚点：ChromePage.ts:143、989、1032、1047、1073、1095、1136。

另一条独立主链是网页SDK：
- my-content-script.ts注入SDK；
- assets/js/core/axiosx.js等发起请求；
- custom_event.js转发；
- background.ts提供服务；
- brige.js的固定回调完成网页原Promise。
因此不能只完成“工作台启动控制脚本”，就认为旧框架迁移完成。页面SDK必须能在没有控制脚本运行时调用获授权的短服务。
关键锚点：my-content-script.ts:148、axiosx.js:26、custom_event.js:5、background.ts:102及716、brige.js:16。

其他必须登记的能力包括：
- AppStorage、AppLocal、chrome-local-storage-api；
- axiosx四方法、通知、服务探测；
- UtilScrpt、UtilDevice、UtilInfo、DeviceType和事件常量；
- 注入、编码、资源及消费者；
- 业务专属、远程、native和其他条件支持项。

### 2. 当前目标工程尚未完成核心迁移

上次核对：
- src/run-host.js仍创建createScrapingModule，start仍要求template并compileTemplate。
- src/sw.js仍主要装配环境健康检查，没有完成通用框架broker的实际入口装配。
- authority/broker、target、page-port、storage、downloads文件存在，但仍需通用化、去耦、真实接线和验收。
- 计划中的ChromePage门面、每run context、网页SDK尚未在产品中完成迁移。
- 不能根据文件存在、productionRunHostImplemented标志、构建成功或原型通过宣布迁移完成。

### 3. 当前完成数据

docs/framework/source-compatibility-ledger.json已有：
- 72项来源文件处置；
- 48项ChromePage/ChromeElement/Keyboard成员。

上次核对这些条目均没有取得runtimePass；48不包含完整页面SDK、服务和资源覆盖，必须另列其验收条目。

execution-gates.json记录：
- designApproved=true：指历史设计候选；
- boundedPrototypeResearchAllowed=true；
- backendPrototypePassed=false；
- fullImplementationReleased=false；
- frameworkFunctionalMigrationComplete=false。

这些false不能因新提示词、目录方案或专家高分被改成true。

### 4. 原型证据与已知不足

原型只证明部分执行机制，尚未接入产品。

控制脚本原型：
tests/prototypes/user-control-v2/
docs/framework/prototypes/f1-resume-plan.md

已有局部真Chrome证据：用户async-body、部分await操作、输入追加BaseAlice、点击等待读取、异常、语法错误、未授权操作及部分停止/超时/伪造场景。
未闭合：while(true)真实Worker终止、资源清理独立证据、有效CSP/网络限制归因。
独立观察runner曾误选浏览器内建扩展的service worker，属于测试工具问题；核对真实目标后修复，不把这个失败当产品机制结论。附着调试器也可能干扰Worker target生命周期观察，应区分测试工具影响与真实终止失败。

页面函数原型：
tests/prototypes/user-scripts-v2/
docs/framework/prototypes/user-scripts-v2/checkpoint.md

已有Chrome for Testing149中的局部code/file、精确document、两个world、包装后Promise/error/undefined、授权和旧文档竞争证据。
原报告仍有失败：原生throw/rejection的结果表达、host权限撤销步骤。不能把包装适配通过写成原生API全部通过，不能用撤权失败后的成功请求证明权限恢复。
最低版本/当时稳定版、真实UI撤权恢复和pending竞争等矩阵未完成。

更早的tests/prototypes/execution及旧EX08报告保留原样：
classic Blob只是已批准后端内有局部证据的加载分支；包内classic/module和module Blob失败不能删除。
不能要求四种分支全部成功才承认某个分支可行；也不能把pong、心跳、fetch失败或调用terminate当作完整安全/终止证明。
关键后端真实不可行时保存复现并停止该分支，不能自动换WASM、特权eval或扩大研究范围。

### 5. 评审历史：必须准确区分

历史冻结设计manifest：
acca60edf9031aafb4ecb740f5f0f33777a3694d23499f28ce37af63b38f592f
历史Architect97、Critic98只属于该旧候选。

上一对话的新方案：
- C1架构评审96/100，APPROVE，仅限方案。
- C1全文hash：
  8386b62772779e9ceae40e3211d8b01644b05e723e23ff5247cddd67bc0ebac0
- 修订C2架构复核记录为99/100，APPROVE，仅限方案。
- C2全文hash：
  2a8268edb2ce4594da892567a5f8db71315e2dc1dcb8701951a82edd7edacb3b

C2的独立Critic评审在上一对话中断前没有取回最终结论，续接查询也未找到该子代理。必须标记“独立Critic结论待完成”，不能说双方已通过。

上一轮处于Plan Mode，C2正文和新评审未形成完整的仓库落盘审批包。本提示词是结论交接，不是C2原文，也不具有上述hash。新对话应依据已确定结论落盘当前候选和实际映射，再对同一候选完成独立评审。不要把历史评分变成当前文件的审批凭证。

## 四、已经确定的新架构及对应关系

以下路径均相对目标工程，是职责决定，不表示文件已经存在。

|旧来源/职责|新承接位置|要求|
|---|---|---|
|ChromePage.ts的ChromePage/ChromeElement/Keyboard|src/framework/ChromePage.js|公共门面，复用原client/target/PagePort，不另造执行与权限底座|
|共享page与options构造器上下文|src/framework/context.js|createRunContext由RunHost在准入、版本pin和目标绑定后创建；提供ctx.page及会话绑定的ChromePage(options)，无context报E_PAGE_CONTEXT_REQUIRED|
|控制脚本、wrapAsync执行、页面evaluate|src/run-host.js、src/scripting/{sandbox,user-scripts,packaged}/|控制Worker与页面函数分开；生产Worker代理归sandbox/page-proxy.js|
|后台身份、路由、Chrome短服务|既有src/platform/host、target、page-port、storage、downloads；src/platform/chrome；src/sw.js装配|唯一authority/broker/router/journal/IDB，SDK和控制脚本共用|
|brige/axiosx/AppStorage/AppLocal/common/serverUtils|src/framework/sdk/{bridge,http,storage,notifications,servers,utils}.js|实现文件按职责命名；保留约定的axiosx、AppStorage、AppLocal、固定回调等公开名字|
|custom_event、注入及回程编码|src/agents/page-relay.js、既有bootstrap/page-agent、src/platform/page-port/{sdk-injection,codec}.js|固定资源、真实sender、精确document；codec不拥有权限或任务|
|chrome-local-storage-api|framework/sdk/storage.js及既有platform/storage|保留已约定get/set/remove返回语义；持久与会话存储寿命分开，不建第二IDB|
|UtilScrpt|framework/utils/script.js及scripting|JSON工具与执行分离；formatJSON兼容已冻结的紧凑输出/非法原文透传，不执行非JSON代码|
|UtilDevice及DeviceType|framework/utils/device.js及platform/storage|浏览器信息、UA、稳定ID、原类型数值；native不虚报支持|
|UtilInfo|framework/utils/network-info.js及网络服务|可选、显式授权，原外部地址不擅自替换，不主动代用户联网|
|旧事件常量|framework/events.js|原字符串保留，脚本run/stop归RunHost；设备业务事件明确typed拒绝|
|SDK sleep/指纹外观|framework/sdk/utils.js|保留通用sleep；缺指纹资源报E_RESOURCE_UNAVAILABLE，不启动设备业务|
|工具窗口、版本和结果入口|既有src/ui|实际消费上述框架，不保留第二套演示adapter|

进一步确定的来源处置：
- dom.ts是旧Quasar hook，detectQuasar调用被注释；detect-quasar.js属旧开发工具。本轮排除运行时，保留来源、编码/边界样本和对应测试记录，不生成占位模块。
- testMonkey.esm.js由旧APP_ENV=testmonkey条件加载，含独立页面局部类及整包业务UI。列为“旧业务UI延期，未迁移”，保留CMP06独立语义对照与PROV证据，不代替主ChromePage、不复制bundle、不把延期算迁移成功。
- 以上是对旧表模糊“适配/按消费者”去向的明确修订，阶段0必须在差异表中记录并随新候选评审，不静默删除原测试。
- 72项来源中的资源，只有当前或本轮固定消费者引用的才打包；SDK必要第三方资源归framework/sdk/vendor，UI资源归ui/assets。逐条写具体消费者、目标路径、hash、许可及load/error用例。
- 动态资源引用须落实成明确允许清单；无法解析不能标通过。无本轮消费者的旧业务资源明确排除本轮产物，保留来源记录。
- 不重做全库审计，沿既有72项与必要消费闭包有限核对。

## 五、先建立能判断完成的主计划与账本

实施阶段0落盘：
1. docs/framework/execution-plan.md：唯一主执行计划，说明旧能力、新职责、依赖、阶段产出和放行条件。
2. 升级现有source-compatibility-ledger.json为唯一完成数据源，保留原来源hash、72/48基线及历史证据。
3. progress.md由该账本派生；goal-prompt.md只保留任务目标、主计划入口、当前阶段及推进/停止规则。
4. 同步goal-constraints、execution-gates、framework-handoff的当前方案和owner指针，但不覆盖历史审批，不将功能false改成true。

先核验唯一公共writer。旧owner记录可能过期：
- execution-gates仍可能写01a0fcd7-ddff-7b41-be5c-b42b425b31af；
- public-owner曾记录01a0fd25-57a0-7e13-8da0-1fe3ee2986c1，paused-user-interruption。
这些ID只用于发现冲突，不是恢复旧任务的指令。确认没有其他活跃公共writer后，由当前对话接管并保留前任记录。

每个来源片段、API、SDK服务及资源条目必须包含：
- 稳定ID；
- 原文件/符号/行号/hash和原行为；
- 本轮核心、业务延期或资源排除；
- 保留、修正、限制、不支持及理由；
- 确切新模块和产品入口调用链；
- 所属T任务、阶段、依赖和owner；
- 具体case ID、输入及预期；
- 当前状态、实际结果、候选版本和证据引用。

同一旧文件拆成多个职责时用子项，不能迁完一小段就把整个旧文件标完成。
48成员外另列SDK/服务/资源，不用48/48掩盖它们。

状态推进与检查：
- 已映射：职责、路径、语义、具体case及预期明确；不要求拟建文件已经存在。
- 已实现：有实际实现证据；文件存在本身不足。
- 已接入：从真实产品入口可达并使用唯一公共底座。
- 已实测：有同一产品候选、具体环境下的真实输入/结果/证据。
- 已独立验收：独立复核同一候选完整证据通过。
- 失败、阻塞、未测、过期单列。

分别报告：
- 72来源处置覆盖率；
- 48成员判定覆盖率；
- 本轮必须迁移能力的实际通过x/y；
- SDK/服务/资源的实际通过情况；
- 未完成、受限、延期与排除清单。

不要把排除/延期算迁移成功，不通过修改分母隐藏未完成。旧表泛写“CMP01–06”等范围不能替代逐项case和预期。

方案正文/映射清单hash用于证明审批对象；产品包hash用于证明功能实测对象。两者不能互代。
产品代码或资源变化使受影响证据过期，最终F3在固定最终包上全量重验。

## 六、执行顺序及放行门

继续复用原T01–T13，不另造一套无对应关系的任务编号。可以用以下阶段组织它们。

### 阶段0：校准方案、迁移清单和评审
有限核对已有资料与源码漂移，落实全部对应关系、具体兼容差异、测试规格、目录及责任边界。
明确已确定事项，不能把关键架构选择写成“实施时再决定”。
阶段0不开始F2产品实现，也不要求F2文件已存在。
对同一候选按Architect→Critic顺序独立评审，各自至少95/100、明确批准且无阻断项后，批准当前方案。
发现问题修订并复核，不反复重做全库审计，不继承旧分数。

### 阶段1：F1执行后端资格，T10原型
在已有两条机制和原型基础上补缺，不重新开发整个fixture。
控制脚本：用户async-body、await/异常、私有通道、假peer/重放/global patch、有效CSP、网络正对照、真实死循环终止及资源清理。
页面函数：code/file、精确document、两个world的Promise/error/undefined、真实授权开关/撤权/旧文档竞争。
先修测试工具错误，保留真实失败和未测边界。
最低候选版本及当时稳定版按实际取得的版本验证，不用manifest120或现有149原型推定完整支持138。支持矩阵收口后同步manifest minimum_chrome_version；缩窄范围必须明确并重审。
全必需证据及独立复核通过，才backendPrototypePassed=true并记录F2放行。
原型通过不计产品迁移完成。

### 阶段2：公共底座与真实装配，T02–T06/T12
泛化现authority/broker/target/PagePort/storage/downloads并接入SW；解除通用能力对采集模板、收费、row/seal的要求。
实现真实sender、精确目标、原子准入/去重、导航转换、唯一数据库、脚本不可变revision/head、结果/artifact、CAS/pin/tombstone。
用真实IDB、sender与HTTP服务验证底座准入、100并发去重和四崩溃点。
这里不关闭需要完整页面SDK链的B05。

### 阶段3：公共API与通用运行，T07/T01/T10产品
迁入48成员和每run context；生产Worker代理接同底座；RunHost固定选定committed UTF8版本/hash和参数。
落实await、返回/异常、停止、超时、宿主关闭、一次结算及持久结果。
运行r1期间保存r2或删除脚本不改变在途r1；重开仅读持久状态，重新执行必须显式新run。
不注册采集也能运行普通脚本。

### 阶段4：网页SDK、工具与资源，T08–T09/T12
接通固定注入、relay、独立sdk-service和唯一authority。
同时接入工作台最小allowPageSdk授权动作，验证真实页面Hello→SDK→服务→固定回调→原Promise。
此时完整关闭B05：不启动controller即可调用获授权短服务、真实100并发/四崩溃点、错误/撤权/导航/送达失败、未知写不重放。
逐项验证存储寿命、网络响应、工具、资源load/error和清理。

### 阶段5：完整用户入口与业务去耦，T11/T13边界
在现工作台完成选网页/授权、脚本和参数、保存和选择版本、运行/停止、结果/错误、实际下载。
用真实产品入口验证r1/r2、关闭重开、文件落地hash。
禁用采集仍通过。临时adapter归并或删除，不能交付两套实现。
不实施完整采集、设备、CSDN或录制业务。

### 阶段6：F3最终验收与冻结
同一最终扩展包运行原必选测试及历史问题回归，独立代码与功能验收通过后，才frameworkFunctionalMigrationComplete=true。
冻结公共SDK/API/schema/version/grants及handoff，完成本轮后停止，不自动进入F4、优化或发布。

## 七、关键合同与验收，不得弱化

完整细节继续沿用冻结合同；以下是不可遗漏的重点：

- 一个authority/broker/router/journal/IDB；控制脚本与独立SDK短服务共用。
- 真实MessageSender身份；精确tab/frame/document/version；不伪造hostDocumentId、不以payload补身份、不默认active/allTabs、不共享global page。
- 导航保留原操作target和from/to；旧等待/元素失效；新document身份、权限、lease、取消和deadline复验后才更新根page。
- SDK服务有能力/命名空间/预算约束；同ID同digest关联原pending/durable/unknown，冲突拒绝；未知写不自动重发。
- effect、delivery、receipt、durable、download complete分开；Promise一次结算不等于副作用一次。
- 控制Worker停止后关闭新操作准入并终止Worker；不承诺撤销已发副作用，也不承诺通用终止页面主线程死循环。
- 禁止特权页/SW eval/new Function、allow-same-origin和主线程假terminate。
- 精确兼容包括：null/[]、false/0/undefined、type追加并返回Typed、click返回clicked；函数evaluate的await/throw/无闭包；旧字符串true/忽略args；eval歧义拒绝；业务PageBrigeCode不当协议信封。
- AppStorage字符串转换/持久namespace与AppLocal会话值/寿命分开；SW重启和浏览器会话结束分别验证。
- formatJSON严格JSON紧凑输出、非法原文透传且不执行代码；axiosx四方法及可序列化响应投影、未知config拒绝；serverUtils按真实可观察结果/延迟判断。
- remote/native/fullPage等受限能力明确限制并测试typed拒绝，不能记成功实现。
- F3保留PROV/CMP/RESOURCE/EX/NAV/B01–05/AUTH/USC/CTRL/FIX/PLG/SVC/DLGEN/LEAK全部本轮必选；历史17失败、R1–R8逐条实关。
- 真实IDB事务abort、升级blocked/versionchange、CAS、pin、删除在途源码保护、SW重启；真实下载complete及文件hash。
- 1000轮成功/异常/超时/取消/导航，10轮host/SW重连、2轮插件禁用，检查pending/timer/subscription/port/Worker/Blob回baseline。
- 原型、mock、构建、设计评分和工作台单条成功都不能替代上述证据。

数据库恢复决定：
升级前复用rawBackup导出保留显式key的完整快照并校验hash；升级事务abort使用IDB原子回滚。
成功升级后禁止假设旧JS能读取或回写新schema。使用支持当前schema的只读恢复入口保存数据和诊断，通过向前修复恢复服务，不自动覆盖用户数据。
在隔离测试profile演练快照恢复、记录/key/hash核对及升级前后故障，再接入产品升级。

构建检查的已知接线项：
当前scripts/verify-package.mjs硬编码旧权限/CSP及四个JS入口，新增SDK/sandbox后必须同步更新。
按已批准权限、资源清单和执行域校验，不能为通过构建改为放行任意脚本。
保留npm check、npm test，显式运行foundation测试及新增framework合同/账本测试；现npm test只覆盖environment，不能冒称全框架测试。
production/development分别build/pack并verify；实际浏览器验收另列证据。
扩展现check-source做账本/目录/入口检查，不另造构建体系。

## 八、独立评审方式与运行组织

评分100分：
- 需求与来源覆盖25；
- 职责与边界25；
- 依赖与可执行性20；
- 验收与追溯20；
- 风险与恢复10。

架构与验收评审必须分开，Architect完成后再交Critic。各自给分项、总分、具体扣分、阻断项、结论及候选hash。至少95只是必要条件，不能抵消阻断问题。
这些是AI角色方案评审，不能冒充人工专家签字或产品功能验收。

上一轮已采纳的四项架构意见不要丢失：
1. 账本按状态检查，映射阶段不要求未来文件存在。
2. 底座验证与完整SDK B05验收分期，避免循环依赖。
3. 方案清单hash与产品包hash用途分开。
4. 数据库成功升级后的恢复采用只读诊断和向前修复。

当前App在tmux之外。默认用Codex原生子代理作有限、独立并行任务，不假设omx team/question已可用，不因为运行时关键词出现就自动启动OMX。
延续原模型要求：native子代理用default加载完整安装角色提示，请求gpt-6.1-sol、xhigh；服务端实际模型无证据则记unknown，不改全局配置。
最多6并发；主代理负责共享底座、主计划/账本及最终整合。F1两个无共享写范围的原型lane可并行；公共接口和依赖工作顺序执行。

## 九、资料读取顺序与首轮交付

首先在目标工程读取：
1. docs/framework/goal-constraints.md、progress.md；
2. source-compatibility-ledger.json、execution-gates.json、framework-handoff.json、public-owner.json；
3. 两个v2原型checkpoint及必要报告；
4. 冻结审计outputs中的file-tasks.md、compatibility-delta.md、protocol-contract.md、test-spec.md；
5. 只在补足具体映射/差异时查design.md、migration-complete.md、source-evidence.md、issues.md及必要源码。

72实际来源和48成员的基线在冻结根evidence/upstream-v3。
历史153 same/7 drift、4 extra及后续选定来源漂移分开保留；只核对相关变更闭包，不重新审计全部来源。

新对话首轮必须先给出并落实：
- 已继承哪些结论，有限检查发现了什么变化；
- 当前到底处于哪个阶段，哪些门仍未通过；
- 可执行主计划与逐项新旧对应；
- 同一候选方案的评审状态；
- 下一项具体交付与完成证据。

随后按门禁持续推进，不需要用户重复提醒“先有计划、迁移对应、判断完成”。

进度更新使用人能看懂的格式：
“当前迁移哪项旧能力 → 新模块与真实调用链 → 本次实际验证 → 尚缺/失败 → 下一项交付”。

每次报告区分计划、原型实测、产品接通和最终验收。不要只报内部编号、文件数、测试数或高分；最终完成必须能沿账本追到真实产品与证据。

