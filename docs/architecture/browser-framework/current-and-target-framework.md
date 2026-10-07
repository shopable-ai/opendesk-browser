# 新框架：文件怎样协作，以及哪些目标仍未闭合

> 新版源码观察点：`cdef268b861060a84731134088580844b2632994`，`src` 子树 `38cc631a3d4d792453149788a2c1a620f74d34b6`。
> 不是旧 P1 源码 `01b48dcb…` 的同一源码树。历史测试和构建结果不能未经核对套用。
> 当前部分写实现事实，目标部分写建议；本轮没有新增产品运行、构建或浏览器通过记录。

## 一、先把新术语翻译成原来的工作

| 责任 | 中文解释 | 当前文件／函数 | 不负责什么 |
|---|---|---|---|
| 用户入口 | 用户从哪里保存、运行、批准、下载 | `ui/script-editor.js:createScriptEditor`；`ui/tool-shell.js` | 界面颜色不授予后台能力 |
| 运行宿主 | 管理这一次控制程序及其执行资源 | `run-host.js:createRunHost/startController/completeController` | 不任意切换操作目标 |
| 隔离执行 | 真正运行用户控制代码 | `scripting/sandbox/worker-runtime.js:installControlWorker` | 不直接持有 Chrome 特权 API |
| 页面代理 | 把脚本里的 page 方法转成受控请求 | `scripting/sandbox/page-proxy.js:createWorkerPageProxy` | 不是新的授权中心 |
| 运行上下文 | 记录本次身份、版本、目标和取消信号 | `framework/context.js:createRunContext/request/exchange` | 不依赖当前活动标签来确定目标 |
| Page 外观 | 保留熟悉的 goto/click/type 等编程接口 | `framework/ChromePage.js` | 同名不代表全部旧参数和行为兼容 |
| 编码和传输 | 把值和消息准确送到另一执行环境 | `platform/page-port/codec.js`、`platform/host/client.js`、`framework/sdk/transport.js` | 不凭 payload 自报身份授权 |
| 消息分发 | 将请求送到对应服务 | `platform/host/broker.js:createFoundationBroker` | 不另建第二套 grant 解释 |
| 统一授权 | 决定谁可对哪个目标执行何种操作 | `authority.js` 组合 `controller-methods.js`、`sdk-methods.js` | 模块分文件不等于多个独立 authority |
| 具体执行 | 调浏览器 API、发送 HTTP、操作页面 | `framework/control/native-driver.js`、`platform/chrome/`、`scripting/packaged/` | 不自行扩大授权 |
| 持久记录 | 保存版本、运行、操作、结果与产物 | `platform/storage/`、`platform/downloads/` | 不把内存 pending 当恢复依据 |

这是一张责任图，不是强制串行流程。启动一次任务的链、任务中的一次 page 调用、网页 SDK 请求，是三种不同的时序。

## 二、场景01：从工具运行一段控制程序

### 保存链

```text
用户点击 script-save
→ ui/script-editor.js：save
→ host.controller.commitControllerScript
→ platform/host/client.js：request
→ 扩展消息 → SW → broker 的 commitControllerScript 路由
→ controller-methods.js：commitControllerScript
→ storage.commitScriptRevision
→ scriptHeads / scriptRevisions
→ 返回 revision/contentHash → 界面 remember(row)
```

### 启动与结束链

```text
用户点击 script-run
→ script-editor.js：start(event)
   → 取目标、已保存版本、参数
   → 在可信点击内请求原生权限
→ run-host.js：start → startController
→ controls.startControllerRun → client.request → broker → 统一授权
→ controller-methods.js：startControllerRun
   → 准入、固定代码版本、目标和运行身份
→ 返回 claim
→ run-host.js：createRunContext + controllerFactory
→ scripting/sandbox/controller.js 管理隔离页面／Worker
→ worker-runtime.js：installControlWorker
→ AsyncBody(page,params,axiosx,AppStorage,AppLocal,storage,...)
→ 用户代码 return 或 throw
→ Worker 消息返回结果／错误
→ run-host.js：completeController
   → 等待执行资源退役信息
   → 构造固定 finishRequestId 和结算请求
   → settleController
→ finishControllerRun / 持久结果 / 目标退役
→ script-editor.js：snapshotControllerRun → 展示结果
```

“准入返回 claim”不等于“程序执行结束”；“程序返回”不等于“资源收尾完成”；“结果在库里”不等于“仍可向当前调用者交付”。当前 `run-host.js` 已有结算待确认等分支，不能继续照搬旧版本的简化完成链。

证据：[工具入口](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/ui/script-editor.js#L76-L230)、[宿主](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/run-host.js#L45-L114)、[Worker 实际参数](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/scripting/sandbox/worker-runtime.js)、[准入实现](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/platform/host/controller-methods.js)。

## 三、场景02—04：同一次运行怎样操作网页？

### 共用传话链

```text
Worker 内用户代码调用 page 方法
→ ChromePage 方法校验参数
→ Worker 侧 RunContext.request
   → 固定 identity/revision/target/requestId，编码参数
→ PageProxy 经私有 MessagePort 发 operation
→ 宿主 controller 接收，relayContextRequest 复核绑定
→ RunHost 注入的 transport
→ controls.controllerOperation → client.request
→ runtime 消息 → SW/broker
→ controller-methods.js：controllerOperation
→ 授权、操作记录、执行／结果处理
```

PageProxy 是 `createWorkerPageProxy` 构造的代理，不是从旧源码迁来的同名类。RunContext 是角色与对象，不应为了图整齐新增一个叫 ChromeContext 的类。

### 导航分支

```text
ChromePage.goto(url, options)
→ 上述共用链，operation.kind='browser'
→ native-driver.js：execute → navigate
→ 核验原目标，监听 webNavigation 原生事件
→ chrome.tabs.update(明确 tabId,{url})
→ onCommitted 取得新 documentId
→ 等待指定 DOM/complete 事件，复核目标
→ 返回 result + handoff(from,to)
→ controller-methods 更新可信目标记录
→ RunContext.exchange 更新本次 page 的当前文档
→ goto Promise 返回
```

旧元素仍绑定旧文档；Page 的可信导航交接不能自动给旧元素新文档权限。

### 点击、输入、等待、读取分支

```text
ChromePage.click/type/title/waitForSelector 等
→ 共用链，operation.kind='packaged'
→ native-driver.js：packaged → pageReady
   → 必要时 scripting.executeScript 注入固定 page-session（ISOLATED）
→ tabs.sendMessage，指定 documentId/frameId
→ scripting/packaged/page-session.js：listener → execute
→ registry.createPackagedPageSession(...).execute(method,args)
→ 真正读取／修改目标 DOM
→ 编码 value 或 error，并带原 requestId/runId/ownerEpoch
→ 原路返回，执行后再核验 → page Promise
```

普通 Page 调用不是一概走 `agents/page-agent.js`；后者与采集/选择场景有关，不能因名称像“页面代理”就把所有箭头画到那里。

### 用户页面代码分支

`evaluate/$eval/$$eval/waitForFunction` 进入 `operation.kind='user-script'`；`page-evaluator.js:buildPageEvaluation` 生成代码和 world，再由 `native-driver.js:userScript` 调 `chrome.userScripts.execute`。

当前源码明确：普通 evaluate 默认 `USER_SCRIPT`；`eval` 的明确 expression/statement 模式及 `evaluateExpression` 使用 `MAIN`。MAIN 里的变量不应被假设在 USER_SCRIPT 世界共享。框架等待的取消不等于任意同步页面死循环都可中断。

证据：[上下文](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/framework/context.js)、[原生执行与导航](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/framework/control/native-driver.js#L100-L208)、[页面消息接收与返回](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/scripting/packaged/page-session.js#L17-L83)、[执行世界](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/scripting/user-scripts/page-evaluator.js#L7-L54)。

## 四、场景05：普通网页的 axiosx 请求链

### 先装载，再调用；这是两条链

```text
装载链：
工具选来源文档 A、能力、额外目标 B
→ ui/sdk-approval.js：approve
→ 原生权限申请 → 校验批准快照
→ client.request('installSdk')
→ broker.js：createSdkInstaller
→ authority.grantSdk
→ createTabsService.injectFixed
   → 隔离环境 page-relay
   → 页面环境 sdk-main
→ 返回本次安装回执
```

```text
请求链：
A 页面按钮／已有业务程序
→ OpenDeskSDK.axiosx.get(B)
→ sdk/http.js：createHttp → sdk/bridge.js：call
→ sdk/transport.js：request，编码 requestId/args/deadline
→ DOM CustomEvent
→ agents/page-relay.js：installPageRelay 内转发
→ chrome.runtime.sendMessage，实际 sender 来自浏览器
→ sw.js → broker 的 SDK_REQUEST
→ createSdkRequestHandler → sdk-broker.js：requestSdk
→ authority.admitSdk
→ sdk-broker.js：execute
→ framework/sdk/service.js：execute
→ platform/chrome/network.js：request
→ 授权前检查 + assertDispatch → fetch
→ 响应处理／原生回执／记录效果
→ 后检查 → sdk-broker 交付核验
→ valueWire → 隔离 relay → 页面结果事件
→ 原 requestId 的 Promise resolve/reject
```

当前 `sdk-broker.execute` 接收服务 `{ok:true,value}`，不是旧版本的 `result.data`。这种内部结果合同变化也是“源码有变化”的具体证据。

当前 HTTP 执行点使用 `credentials:'omit'`、`redirect:'manual'`、有界超时和返回体；返回类似 Axios 的 data/status/headers/config 投影，不是完整 Axios 对象。服务器已经看见请求、驱动收到响应、记录效果、允许交付、网页收到结果必须分别看。

实际受控消费者：[A/B/C 页面 client.js](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/tests/framework/fixtures/sdk-target-origins/client.js) 的按钮 → `run → probe → sdk.ready → sdk.axiosx.get`。它不是旧业务消费者，但确实走正式 SDK，而非内部 authority。其 parallel 按钮是两次新调用，不能充当“相同 requestId 只执行一次”的验收。

证据：[安装及路由](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/platform/host/broker.js#L19-L165)、[SDK 准入与回程](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/platform/host/sdk-broker.js)、[真正 HTTP 执行](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/platform/chrome/network.js#L35-L92)。

## 五、同名服务的另一条链：控制程序里的 axiosx

```text
已准入 Worker 中调用 axiosx / AppStorage / AppLocal
→ worker-runtime 注入的 proxy.services
→ context.js：services → serviceCall
→ request(method,[args],{kind:'service'})
→ PageProxy／宿主共用控制通道
→ controller-methods.js：controllerOperation → executeService
→ network.request 或 storage.executeSdk
→ 控制任务自己的操作记录与回执
→ 返回控制脚本的 Promise
```

这条链没有经过网页 MAIN SDK、DOM CustomEvent 或页面 SDK grant。它共用 HTTP/存储执行实现，但持有的是 Controller 的运行身份、期限和目标边界。**接口复用不等于授权身份复用。**页面 A→B 的 P1 通过，也不能自动证明 Controller 的服务调用行为通过。

证据：[Worker 注入](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/scripting/sandbox/worker-runtime.js#L18-L37)、[serviceCall](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/framework/context.js)、[executeService](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/platform/host/controller-methods.js#L422-L451)。

## 六、场景06—11：具体执行点与状态在哪里？

| 场景 | 入口与执行点 | 状态／返回 | 不能误读 |
|---|---|---|---|
| 06 持久存储 | SDK 或 Controller 的 storage 门面 → `repository.js:executeSdk` | 授权命名空间内 frameworkKV、请求与结果记录 | 不等于把旧后台全部 localStorage 数据自动搬入 |
| 07 临时存储 | 同上 → `storage/session.js:createSessionTyped` | chrome.storage.session；作用域来自可信上下文 | 不再是后台 globalThis，也不等于页面关闭立即删除 |
| 08 工具与资源 | 页面 SDK service → `chrome/background-services.js` | log/time/扩展根地址／允许的包内资源 | 旧远程资源装载用途未因此保持 |
| 09 截图／上传 | ChromePage → native-driver 的 screenshot/uploadFromURL 或 packaged uploadChunk/uploadCommit | 图片值／目标 input 变化／操作回执 | 不能把 fullPage 拒绝算截图正向验收；截图也不自动生成下载文件 |
| 10 Cookie | ChromePage → native-driver → `chrome/cookies.js` | 原生 Cookie 操作及范围检查 | 不是页面 SDK 获得任意 Cookie 权限 |
| 11 下载结果 | `script-editor.js:downloadResult → prepareArtifact/readArtifact → prepareAttempt → dispatchDownload` | 产物字节/hash、尝试、回执、资源释放 | 提交成功不等于浏览器完成，更不等于磁盘 hash 已核对 |

### 下载的回程与失败收尾

`script-editor.js:observeDownload` 调 `reconcileDownload`，随后按条件释放本地 Blob、提交 `recordResourceRelease`。当前还存在准备阶段失败的 `releaseUnsubmitted → retirePreparation → retirePreparedArtifact` 路径。它不是旧页面 `a.click()` 的同义替换，而是新建的可追踪结果交付能力。

源码：[下载实际 UI 消费者及回程](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/ui/script-editor.js#L117-L190)、[下载服务](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/platform/downloads/index.js)。除已列关键链外，本轮未逐个重新执行所有截图、Cookie、上传、下载分支。

## 七、场景14：停止、页面离开和后台恢复

控制任务停止：工具／RunHost → `stopControllerRun` → 事务写入 cancelSeq、状态、版本与租约 → 中止在途操作 → 尝试清理页面等待；最终结果、Worker 退役与目标释放另行结算。借用页面不应被当作自建页面随便关闭。

页面服务失效：来源文档离开或撤权 → SDK grant 生命周期核验／失效 → 原请求后续执行和交付受限。不能把本地 Promise 不再等待理解成服务器已经撤销效果。

后台恢复：`broker.createFoundationBroker` 重新建立服务并调用 `authority.recover`；当前还核对持久宿主是否实际存在。查宿主失败会有 unknown 分支，不能以查询错误证明宿主已经消失。

源码：[控制任务停止与结算](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/platform/host/controller-methods.js#L499-L645)、[宿主恢复](https://github.com/shopable-ai/opendesk-browser/blob/cdef268b861060a84731134088580844b2632994/src/platform/host/broker.js#L56-L143)。这些是实现路径，不是本轮原生崩溃测试结果。

## 八、源码文件和装载文件不要混写

| 源码 | 构建入口 | 浏览器装载名 |
|---|---|---|
| `framework/sdk/entry.js` | `entrypoints/sdk-main.js` | `framework/sdk-main.js`，MAIN |
| `agents/page-relay.js` | `entrypoints/page-relay.js` | `agents/page-relay.js`，ISOLATED |
| `scripting/packaged/page-session.js` | `entrypoints/page-session.js` | `scripting/packaged/page-session.js`，ISOLATED |
| `sw.js` | `entrypoints/background.js` | `sw.js`，后台 Service Worker |

上表源码相对 `src/`。真实运行必须使用对应构建产物，不把源码路径存在当装载成功。入口和输出规则应与 `scripts/build-contract.mjs`、`wxt.config.mjs` 及实际包清单一起核对。

## 九、目标：只补缺的关系，不重写正确底座

### 已有职责为什么需要保留

| 要解决的真实问题 | 已有承担者 | 最小演进原则 |
|---|---|---|
| 旧活动标签可能漂移 | 绑定上下文、明确 target、导航 handoff | 不退回隐式 active-tab，不为此另造 Browser 对象体系 |
| 跨环境参数和结果丢失／串线 | codec、requestId、受控 transport | 保留独立编码与通信责任 |
| 来源、能力、目标混淆 | 单一 authority 的不同准入分支＋原生权限 | 不复制第二套授权账本 |
| 停止与效果提交竞争 | 事务、cancel 屏障、版本 pin、slot | 保留原状态机，补消费者与异常验收 |
| 结果与下载不能对账 | durable result、artifact、attempt、receipt | 保留字节/hash 与资源生命周期 |
| 发生过效果但结果丢失 | 操作日志、未知效果、不重放 | 不用自动 retry 掩盖未知状态 |

### 仍需独立闭合的功能

**场景12：页面增强。**旧版有环境分支和站点脚本装载；新版有 userScripts 页面计算机制，但本轮没有确认完整通用管理闭环。目标应从“装一个只修改 DOM 的脚本 → 匹配网页装载 → 刷新 → 停用”开始。安装版本、触发规则、文档实例、清理限制都需要单列；不将其强塞入没有 DOM 的控制 Worker。

**场景13：网页按钮启动完整任务。**旧 raw executeScript 有这一用途；新版页面 SDK 拒绝 raw 脚本不等于保留了便捷启动入口。可候选为固定脚本引用＋已批准参数范围＋现有任务准入，但这是目标建议，不是已实现公开 API。不能让普通页面按钮本身充当特权批准证明。

当前页面 SDK 的来源文档／origin 身份也不等于将来用户脚本按 scriptId 隔离。界面传一个 scriptId 不足以建立可信脚本身份。

P1.2/P1.3/P1.4 仍分别定位为页面服务目标授权、工具批准入口和实际 SDK 服务用户链；不扩大成全部 Browser Framework 的完成标签。
