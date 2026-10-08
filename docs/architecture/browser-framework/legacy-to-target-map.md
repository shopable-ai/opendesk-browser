# 功能前后对照与任务调用链：从一件用户任务读懂框架

> 旧版：`todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex`。
> 新版源码观察点：`opendesk-browser@cdef268b861060a84731134088580844b2632994`，src 子树 `38cc631a3d4d792453149788a2c1a620f74d34b6`。
> 本轮为源码关系与文档核验，没有新的产品测试、构建或原生浏览器 PASS。此前 `01b48dcb…` 的测试数量不得自动填到本版。

## 一、先区分三个“任务”

**用户场景**是“网页请求一个接口”“导航后填写表单”等要做的事情；**工程任务**是为这个场景补哪个缺口；**运行任务**是实际程序的一次 runId。三者有关联，但不是同一个对象。

本页的场景01—14只是中文检索编号，不创建新任务引擎，也不替代原有迁移账本和用例 ID。先沿场景认识新旧框架，再决定工程任务。

## 二、功能改变前后：用户实际感受到什么？

下面的“已有”指已查实现或入口，不等于当前版浏览器验收通过。全部条目都需同时看后面的兼容与验证栏。

| 场景 | 用户想做什么 | 改变前 | 改变后／当前边界 | 迁移关系 |
|---|---|---|---|---|
| 01 | 运行一段控制程序 | 后台 wrapAsync/eval，可访问共享 page；整段结果协议不可靠 | 工具保存固定版本，再经 RunHost/Worker 运行并结算结果 | 机制替代；旧全部启动入口不因此兼容 |
| 02 | 导航并读取目标页 | active tab；goto 经 eval 设置 location；完成事件未绑定目标 | 明确 tab/frame/document；原生导航与文档交接 | 部分迁移：主要用途保留，目标及等待合同改变 |
| 03 | 点击、输入、等待 | 合成 DOM 事件、追加输入、局部等待 | 固定页面操作＋绑定文档＋取消检查 | 部分迁移：正常用途已接通，旧消费者仍需逐项核验 |
| 04 | 执行网页 JS／读取网页变量 | evaluate 与 eval 两种机制；eval 按 '=' 猜用途 | USER_SCRIPT 计算与 MAIN 执行分开；eval 明确模式 | 部分迁移：world、模式、异常和值合同需对照 |
| 05 | 网页请求同源或跨源 HTTP | axiosx 事件桥 → 后台 axios → 页面回调 | 工具批准来源与目标 → 正式 SDK → 统一授权 → fetch | 部分迁移：入口接通；凭据、重定向、错误语义改变 |
| 06 | 保存持久配置 | AppStorage → 后台 localStorage | AppStorage → 授权命名空间持久 KV | 机制替代；旧数据内容的迁移不能由 API 兼容推导 |
| 07 | 临时保存变量 | AppLocal → 后台 globalThis | AppLocal → 浏览器 storage.session | 机制替代；生命周期和作用域改变 |
| 08 | 日志、时间、扩展地址、资源 | BEX 服务；requestResource 可取远程内容装载 | 受控 service 门面与包内资源合同 | 部分迁移；旧远程资源执行用途不原样保留 |
| 09 | 截图／向页面上传文件 | captureVisibleTab；URL/Blob/data URL → file input | 明确目标截图；有预算的上传分块/提交 | 部分迁移；正向效果必须独立验证 |
| 10 | Cookie 读写删除 | 原生读取或 document.cookie；写删走页面脚本 | 受限原生 Cookie 服务与范围检查 | 部分迁移；HttpOnly、错误与输入对象行为不同 |
| 11 | 下载本次运行结果 | 有业务 a.click 下载；未确认统一结果产物流程 | 持久结果 → artifact → attempt → 下载回执 → 资源释放 | 仅新版的通用流程；不等于所有旧业务下载已迁移 |
| 12 | 打开网页后自动出现增强脚本 | 内容脚本按环境装载站点脚本、SDK、公共库 | 有 SDK 安装与页面计算机制；未确认完整通用管理闭环 | 部分机制／待核实；不能直接标已迁移 |
| 13 | 不离开网页，点按钮启动整段自动化 | 页面 executeScript → 后台 raw eval | raw 页面入口拒绝；工具 Controller 有实现 | 原机制替代，等价的页面启动入口未确认 |
| 14 | 停止、关闭页面、后台重启后不串任务 | 分散内存回调与计时器；未确认统一持久合同 | 运行/授权/操作/资源分别失效与恢复，不重放未知效果 | 新版增强；不冒充旧行为原样保留 |

不能把“仅新版新增可靠性”算进“旧功能已迁移数量”，也不能把“拒绝了旧危险通道”算成对应用户需求已经交付。

## 三、技术方案对照：以前谁干的活，现在由谁接走？

下面路径中，旧版相对 `src-bex/`，新版相对 `src/`。

| 旧技术／文件 | 原来解决的问题 | 新版文件／方案 | 为什么需要变化 | 需要确认的代价 |
|---|---|---|---|---|
| ChromePage.ts 共享 page + active tab | 统一页面操作入口 | framework/ChromePage.js + context.js 的绑定 page | 防止切换活动页后操作错误目标 | 不能再依赖任意全局 new ChromePage 即可运行 |
| _execute 拼字符串 + pendingEvents | 发送动作，等单次结果 | context.request + PageProxy + host/client + 编码 | 分离调用身份、值、目标和结果相关性 | 更多文件，但每个箭头应可追踪 |
| tabs.executeScript／script DOM 注入 | 执行页面操作和用户代码 | native-driver + packaged/page-session/registry + page-evaluator | 固定操作、用户代码、执行世界分道 | 并非所有旧脚本和变量可见性原样保留 |
| core/axiosx.js + custom_event.js | 页面请求后台 HTTP | framework/sdk/http/bridge/transport + agents/page-relay | 保留页面便利入口，规范消息 | DOM 事件是载体，不是授权凭证 |
| background.ts 服务 switch | 后台选择执行能力 | broker + sdk-broker/service + 各 driver | 分发、授权、实际效果分开 | 不能把这些层看成互相替代的同一个类 |
| 后台直接 axios | 以扩展环境代办 HTTP | platform/chrome/network.js | 统一预算、目标校验与效果记录 | 凭据、重定向、错误和响应对象变化 |
| localStorage / globalThis | 持久／临时值 | platform/storage/repository.js / session.js | 命名空间、生命周期和操作事实明确 | 必须另核对旧数据与旧跨页共享需求 |
| background wrapAsync/eval | 启动任意控制代码 | run-host + sandbox/controller + worker-runtime | 在受控环境运行并追踪结算 | 网页原启动入口不自动获得等价替代 |
| my-content-script 装载业务资源 | 网页增强 | 已有 SDK/页面计算机制；管理闭环待补 | 保留增强需求，同时明确版本与装载范围 | 不能用 SDK 安装替代自动用户脚本管理 |
| 业务 a.click 下载 | 产生下载动作 | ui/script-editor + platform/downloads | 文件字节、结果身份、原生终态可对账 | 提交、完成、磁盘验证必须分开 |

详细旧链见[旧框架](legacy-src-bex-framework.md)，详细新链见[新框架](current-and-target-framework.md)。本页不再把一串英文层次名称当调用链。

## 四、场景任务卡：必须有去程、执行点、回程和缺口

<a id="scene-02"></a>
### 场景02：导航到页面，然后读标题

**用户动作：**在控制程序里调用 `await page.goto(url); return await page.title();`。这是说明用的组合示例；本轮没有把它冒充某份已经取得的旧业务脚本。

**旧文件链：**

```text
ChromePage.ts：goto
→ 注册 tabs.onUpdated + timeout
→ eval('window.location.href=...')
→ addScriptTag({content})
→ evaluate(插入 script 的函数)
→ _execute：pendingEvents + tabs.query({active:true})
→ tabs.executeScript
→ 页面 script 设置 location.href
→ 收到 complete 后 navigationPromise 结算
→ 下一次 title → evaluate(document.title) → 单操作回调
```

**新文件链：**

```text
ui/script-editor.js：start
→ run-host.js：start/startController
→ 已准入 Controller Worker 执行用户代码
→ framework/ChromePage.js：goto
→ framework/context.js：request
→ scripting/sandbox/page-proxy.js 的 MessagePort
→ 宿主 controller + relayContextRequest
→ run-host 注入 transport → platform/host/client.js
→ SW/broker 路由 controllerOperation
→ platform/host/controller-methods.js
→ framework/control/native-driver.js：execute/navigate
→ chrome.tabs.update(明确 tabId)
→ webNavigation 观察新 documentId 与就绪
→ handoff + 原 requestId 返回
→ 上下文更新当前 page 文档
→ title 走 packaged/page-session.js → registry 的 DOM 读取
```

**改变前后：**旧版操作时选活动页，完成监听没有绑定本次目标；新版绑定具体文档并有可信导航交接。旧版 timeout=0 被改默认值；新版参数、期限和错误要按当前合同逐项验证。不能写“只有执行技术变了，使用行为完全没变”。

**消费者证据：**新版工具 `script-editor.start` 已定位；旧版 API 链已定位，实际旧导航业务调用者仍待补；原生 runner 是测试消费者，不等于旧业务消费者。

**验证入口：**现有 `tests/framework/k3-context.test.mjs`、`k3-native-driver.test.mjs`、`k5-controller-product-native.mjs` 为核验线索，本轮未重跑。验收必须从正式工具执行，并观察 A/诱饵 B、新旧 document、标题、错误和旧元素失效。

**任务完成条件：**导航真的作用于选定 A；切活动页不操作 B；返回时达到约定就绪；下一条读取命中新文档；停止/超时/导航失败不被写成成功。

源码：[旧 goto](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts#L190-L225)、[旧 eval/执行](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts#L930-L1066)、[新导航](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/framework/control/native-driver.js#L166-L208)、[新真实用户入口](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/ui/script-editor.js#L190-L230)。

<a id="scene-05"></a>
### 场景05：网页 A 通过扩展请求接口 B

**用户动作：**在已经装好 SDK 的网页按钮中调用 `axiosx.get(B)`。

**旧文件链：**

```text
core/axiosx.js：get → callChromeBridgeInterface
→ ChromeBridgeEvents[eventId]
→ CustomEvent('CHROME_BRIDGE_INTERFACE')
→ assets/js/custom_event.js：messager
→ runtime 消息
→ background.ts：handleChromeBridgeInterface
→ 后台 axios.get
→ ChromeBridgeCallBack：JSON/Base64
→ executeScriptInCurrentPage：重新选活动 tab
→ 页面 core/brige.js：ChromeBridgeOperationCompleted
→ 以 eventId 完成原 Promise
```

**新文件链，先批准：**

```text
ui/tool-shell.js 点击 sdk-install
→ ui/sdk-approval.js：approve
→ 原生 permissions.request + 固定批准快照
→ client.request('installSdk')
→ broker.js：createSdkInstaller
→ authority.grantSdk / authorizeSdkInjection
→ 固定 page-relay（ISOLATED）+ sdk-main（MAIN）
```

**新文件链，再请求：**

```text
fixtures/sdk-target-origins/client.js：按钮 → run → probe
→ OpenDeskSDK.ready / axiosx.get
→ sdk/http.js → bridge.call → transport.request
→ 页面 CustomEvent → agents/page-relay.js
→ runtime actual sender → sw.js → broker
→ sdk-broker.requestSdk → authority.admitSdk
→ sdk/service.execute → chrome/network.request → fetch
→ 原生响应／效果记录／交付检查
→ 原消息结果 → 页面结果事件 → 原 requestId Promise
```

**改变前后：**旧版后台 axios 接收 config，但 catch 会吞异常；新版固定省略 credentials、手动 redirect、有界响应、类型化错误。拥有 B 的原生权限也不等于 A 被应用层批准访问 B。页面 SDK 来源空间不变成目标 B 的空间。

**消费者证据：**新版 client.js 是已确认的正式 SDK 测试页面；它不是旧业务迁移证明。旧调用者仍要从可达语句寻找，不能使用提前 return 后的 axiosx 片段。

**验证：**A→B 正向返回且服务确实观察请求；未批准 C 的服务次数为零；拒绝权限时不扩权；A 导航/撤权后旧结果不交付；服务已发生效果后重启，不自动重发。页面的 parallel 按钮生成两次新调用，不是同 requestId 去重测试。

**当前结论：**正式消费者与执行链接通；行为部分改变；本轮未运行同版浏览器验收。旧测试报告的 PASS 不填成这张卡的新结果。

源码：[真实客户端](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/tests/framework/fixtures/sdk-target-origins/client.js)、[旧 HTTP](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/background.ts#L102-L151)、[新准入与回程](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/platform/host/sdk-broker.js)、[新 HTTP](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/platform/chrome/network.js#L35-L92)。

**不要漏掉同名接口的另一张子卡：**控制程序里的 axiosx 由 `worker-runtime → proxy.services → context.serviceCall(kind:'service') → controllerOperation.executeService → network.request` 执行。它不是页面 SDK 链，应分开验收身份、范围、取消和返回。

<a id="scene-12"></a>
### 场景12：打开网页后，自动出现增强脚本和按钮

**旧链：**`my-content-script.ts:bexContent → 等待 body → initData → jQuery.ready → appendScript(core/库) → envJson 分支 → 业务脚本 → 页面 DOM/事件`。远程资源路径为 `appendScript → requestResourceByBridge → BEX background fetch → script.textContent`。

**新已有机制：**固定页面 SDK 安装、packaged DOM 操作、`page-evaluator → userScripts.execute`。这些机制分别已存在，但本轮没有确认一个通用的“脚本安装/启用 → URL 匹配 → 指定时机注入 → 每文档实例 → 停用/升级/清理”的正式消费者闭环。

**功能差异：**能手动 evaluate 一段 JS，不等于刷新匹配网页后它会自动回来；脚本初始化函数返回，也不等于它创建的按钮和监听器已经停止。

**目标建议，不是现有 API：**先选一个无特权、只增加按钮的受控脚本，验证匹配页装载、不匹配页零注入、重复刷新/安装不产生重复实例、停用后的行为。再接共享服务和必要身份隔离，不新建第二套数据库或运行平台。

**当前结论：**需求保留；部分机制存在；通用闭环与准确承接模块待核实。本轮不把它悄悄从迁移范围删除，也不启动该功能开发。

源码：[旧页面增强装载](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/my-content-script.ts)、[新页面计算机制](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/scripting/user-scripts/page-evaluator.js)。

<a id="scene-13"></a>
### 场景13：网页按钮启动一整段自动化

**旧链：**`core/brige.js:executeInBg（executeScript 别名） → CHROME_PAGE_EXECUTE → custom_event.js → background.handleChromePageExecute → executeScript → wrapAsync → eval`。

**新链的已确认部分：**工具的保存/运行入口 → RunHost → 统一任务准入 → Controller Worker；页面 SDK 的 raw executeScript 入口明确拒绝。两者之间不能画一条不存在的“网页按钮自动转工具任务”实线。

**改变前后：**原用途是从网页直接触发控制程序；新工具运行提供更明确结果和生命周期，但使用位置不同。用户是否接受必须单列，不能因为安全改造合理就默认入口差异已批准。

**最小目标候选：**页面请求一个固定脚本引用、受约束参数和已批准目标，由现有任务准入承接；权限必要时在可信工具确认。此处没有定义或声称已经实现新启动 API。

**验收：**网页内真实按钮触发指定程序并显示本次 run 的结果；未批准程序/参数/目标拒绝且无效果；重复点击的语义明确；停止/导航不复活旧任务。

**当前结论：**机制替代已经有对应工具路径，原页面触发需求仍缺等价闭环证据。

源码：[旧启动](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/background.ts#L402-L418)、[新页面 SDK](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/framework/sdk/entry.js)、[新工具运行](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/run-host.js#L45-L114)。

## 五、其余场景的文件入口与必须观察的结果

完整去回程见新旧两篇；此表指向分支，不把所有方法都假装逐个浏览器跑过。

| 场景 | 旧入口 → 执行点 | 新入口 → 执行点 | 必须观察，不只是看内部 PASS |
|---|---|---|---|
| 01 程序运行 | background.executeScript → eval | script-editor.start → RunHost → Worker → settleController | 实际 return/throw、版本固定、最终结算与资源退役 |
| 03 交互等待 | ChromePage.click/type/waitFor* → _execute／计时器 | ChromePage → controllerOperation → native-driver.packaged → page-session → registry | 目标 DOM、事件次数、追加输入、超时、取消、旧文档失效 |
| 04 页面 JS | evaluate/_execute；eval/addScriptTag | page-evaluator.buildPageEvaluation → native-driver.userScript → userScripts.execute | 指定 world 的值、Promise、异常；MAIN 与 USER_SCRIPT 不串全局变量 |
| 06 持久值 | appStorage → bridge → 后台 localStorage | SDK/Controller 门面 → repository.executeSdk | 类型、空值、clear 范围、重启、旧数据是否迁移 |
| 07 临时值 | appLocal → bridge → 后台 globalThis | SDK/Controller 门面 → session.executeSdk | SW 重启、浏览器会话结束、多页面/脚本作用域 |
| 08 工具资源 | BEX bridge.send/on → log/time/fetch | SDK service → background-services | 真实 return shape；允许资源字节/hash，远程执行不误放行 |
| 09 截图上传 | screenshotInChrome / uploadFile helpers | native-driver.screenshot / uploadFromURL；packaged uploadChunk/uploadCommit | 正常图片的内容与目标；input.files 的字节、名称、类型与事件 |
| 10 Cookie | cookies/getAll；set/deleteCookie/eval | native-driver.cookieOperation → chrome/cookies 服务 | 正确 URL/store/path，输入不被意外修改，越界无效果 |
| 11 下载结果 | 页面 downloadFile → a.click | script-editor.downloadResult → prepare/readArtifact → prepare/dispatchAttempt → observeDownload/reconcile | 原生终态＋实际文件字节/hash＋Blob释放；不是仅下载 ID |
| 14 停止恢复 | 分散 Map/timer/runtime 消息 | RunHost/authority/controller-methods/sdk-methods + broker.recover + 页面 dispose | 取消先后关系、无晚到效果、未知结果不重放、资源与 slot 是否释放 |

截图与上传是同一“浏览器资源”场景族，但正向验收分别计，不能以一个通过替代另一个。

## 六、行为改变前后必须单独成账

| 行为点 | 旧事实 | 新事实／当前判断 | 应如何验收 |
|---|---|---|---|
| 目标选择 | Page 每次查活动标签 | 绑定 tab/frame/document | 切换活动页后的实际效果 |
| navigation 完成 | 监听任何 complete；先 await eval | 指定目标原生事件与可信文档交接 | 诱饵页 complete 不提前完成 A |
| 输入 | 逐字符追加并发合成事件 | 仍有追加型固定操作，限制明确 | 初始值、输入类型、事件与最终值 |
| $/$$ | 宿主解析克隆 DOM | 有 DOM 宿主才支持；Worker 使用可序列化快照 | 不以 Worker 拒绝证明克隆 DOM 正向兼容 |
| evaluate 返回 | 函数结果与字符串 true 分支不同 | 明确描述、编码、异常与执行世界 | false/0/undefined、嵌套值、抛错、异步返回 |
| HTTP 错误 | AXIOS 分支 catch 吞错 | 类型化错误、效果事实与交付分离 | HTTP失败、网络失败、超时、响应已知而交付被拒绝分别测 |
| HTTP 凭据与跳转 | config 交后台 axios；不能默认同新限制 | omit credentials、manual redirect | 不将旧登录接口依赖视为已兼容 |
| AppStorage | 后台全局存储区 | 授权命名空间 KV | API、旧数据迁移、跨页共享三件事分开 |
| AppLocal | 后台进程变量 | 浏览器会话存储 | SW 重启不等于浏览器重启 |
| 页面 raw execute | 可请求后台启动代码，无可靠整段结果返回 | 页面拒绝，工具程序有受控运行 | 保留用户用途与保留危险机制分开判断 |
| stop/cancel | 未确认通用合同 | 持久取消、操作中止、资源退役分别存在 | 本地 Promise 拒绝不等于服务器效果撤销 |
| restart/disconnect | 内存 Map 不是恢复依据 | journal/宿主观察/授权代次/未知状态 | 查不到结果不能自动 retry |
| unknown effect | 未确认显式分类 | 不重放未知效果 | 服务已观察副作用后断链，观察次数不增加 |

“改变”不自动意味着退步或错误；但必须说明影响哪个旧消费者、为什么改变、需要什么适配、谁确认接受。未经用户或既有批准合同确认，不写“已批准不兼容”。

## 七、完成度台账：三栏而不是一个百分比

| 能力族 | 调用是否接通 | 旧行为兼容结论 | 本轮验证状态 |
|---|---|---|---|
| 浏览器自动化 | 已定位正式工具、Page、执行器与回程 | 部分迁移；目标、world、参数/错误有变化 | 静态源码已核对；未新增同版浏览器结果 |
| 页面 SDK / HTTP | 已定位真实 A/B/C 客户端和正式服务链 | 部分迁移；旧业务消费者仍待确认 | 静态源码已核对；本轮未运行 HTTP/Chrome 用例 |
| Controller 服务 | 已确认 Worker 注入与 service 分支 | 不得套用页面 SDK 的授权合同 | 本轮未重新运行该链 |
| 持久／会话存储 | 有正式门面与后端分支 | 实现、作用域和生命周期替代；旧数据另核对 | 未完成本版逐项重验 |
| 截图／上传／Cookie | 有对应 Page 分支和执行器 | 正向能力与限制分别记账 | 未完成本版逐项重验 |
| 产物／下载 | 真实 UI 消费者与回程存在 | 新通用流程；旧业务下载不自动兼容 | 未新增本版文件/hash证据 |
| 页面增强管理 | 部分底层机制 | 完整通用闭环未确认 | 待核实正式入口与用户链 |
| 网页启动完整任务 | 工具启动已接，网页等价入口未确认 | 原机制替代，用户场景仍有缺口 | 不计完成 |
| 权限／生命周期 | 统一授权、失效、恢复实现存在 | 新增边界与可靠性 | 未将全部历史报告绑定到本版 |

本表不删除历史 PASS，也不声称历史从未跑过。每份历史报告应保留 source/package/test input/status，评估差异后决定能否沿用。当前 `src` 子树与旧 P1 不同，必须先做这个核对。

测试状态使用：未查、仅定位用例、本轮未运行、本轮通过、本轮失败、环境阻塞、历史证据待关联。不要将“仅定位用例”写成“组件通过”。组件、集成、原生浏览器、真实旧消费者是不同证据栏。

## 八、每个后续工程任务的最小交付模板

```text
用户场景编号／中文任务名：
用户入口和期望可见结果：
旧版来源 SHA、真实调用者（未找到就写未找到）：
旧文件::函数 → 通信/数据 → 最终执行点 → 返回：
新版来源 SHA、正式调用者：
新文件::函数 → 通信/数据 → 最终执行点 → 返回：
改变前后：目标、输入、world、结果、错误、停止/导航/重启：
变化性质：保留／修复旧缺陷／安全限制／范围缩减／延期；批准依据：
实现接通情况：
行为兼容结论：
测试用例与是否实际运行：
原生浏览器版本、构建身份、正向和反例观察：
第一个不一致及具体文件/函数：
下一项最小工作：
```

每个箭头注明函数调用、事件、消息、存储读写或平台调用；最终执行点有实线，未实现连接写缺口。不得为了模板好看编造旧消费者、函数或已通过状态。

## 九、下一步只按三个优先级推进

### 第一优先级：固定版本，补足三条高频关系

绑定场景02、05、12/13。先将本机旧源码与固定远端核对，补可达的真实旧消费者；按当前源码追踪正式入口和返回，核对现有测试与实际包。重点文件是旧 ChromePage/background/my-content-script/core，以及新 script-editor/RunHost/context/SDK/broker/native-driver。没有取得旧业务脚本的条目仍标待核实。

### 第二优先级：复用现有入口进行当前同版验收

先运行自动化基本链和 P1 A/B/C 链，再覆盖相应停止、导航、撤权、未知效果；逐条补场景卡，而不是先追求总测试数量。绑定旧 page/axiosx 用途、新正式工具与客户端、实际页面 DOM 和服务端次数。若失败，记录首个不一致，不顺势扩大重构。

### 第三优先级：只实现已经定位的功能缺口

优先处理旧消费者确实依赖、当前缺入口或语义不等价的场景。页面增强和网页触发完整任务先确认产品合同与最小正向链，再复用现有运行、授权和持久化。截图/上传/Cookie/下载/恢复按当前包补横向验收，不重写正确状态机、数据库和执行后端。

以后每次 AI 开发交付都要让维护者回答：**以前这件事在哪几处实现；现在由谁接走；哪个行为变了；哪条证据能证明当前可用；下次出问题先看哪个文件。**答不出来时，应补工程可追踪性，而不是继续叠加新层。
