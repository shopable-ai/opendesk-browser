# Current + Target Framework — 当前实现与最小目标

> Current 产品源码固定为 `01b48dcb49b31844d30c0e6fdeed1756e5046f11`。  
> 当前候选分支在本轮观察到的 HEAD 为 `3b7d6a361c05a8f40e26afae1776ed9e3b7b18e6`；相对 P1 交付 HEAD `5b265238…` 的后续提交没有修改 `src/`。  
> TARGET 不是“应该重新设计成什么”，而是由 Legacy 缺陷/行为 + Current 已有结构推导出的最小必要模型。

## 1. Current 一句话

Current OpenDesk Browser 是一个 MV3 浏览器自动化与 Page SDK 运行时：

- Controller script 使用 Puppeteer 风格 `ChromePage`；
- `RunContext` 把 page 操作绑定到 exact target 和 request lifecycle；
- `PageProxy`/sandbox 让保存脚本获得受控 page surface；
- 单一 broker/authority 负责主体、目标、授权、request identity、cancel/recovery；
- platform drivers 负责 Chrome 原生效果；
- IndexedDB/session storage 保存 durable facts；
- artifact/download 有独立生命周期；
- Page SDK 在 MAIN world，relay 在 ISOLATED world，SW 提供 privileged service。

## 2. Current 模块地图

```text
Product/UI
│
├─ Tool shell / Script editor
│
├─ Controller program
│   ↓
│  RunHost
│   ↓
│  sandbox controller / worker
│   ↓
│  PageProxy
│   ↓
│  ChromePage / ChromeElement / Keyboard
│   ↓
│  RunContext
│   ↓
│  controller operation envelope
│
└─ Page SDK consumer
    ↓
   OpenDeskSDK / axiosx / AppStorage / AppLocal
    ↓
   MAIN bridge / codec
    ↓ CustomEvent
   ISOLATED page-relay
    ↓ runtime
                ┌─────────────────────────┐
                │ single broker/authority │
                │ identity / grant        │
                │ target / request        │
                │ journal / cancel/recover│
                └────────────┬────────────┘
                             ↓
             runtime services / platform drivers
             ├─ scripting / userScripts
             ├─ tabs / webNavigation
             ├─ cookies
             ├─ network fetch
             ├─ storage.session
             ├─ notifications
             └─ downloads
                             ↓
                durable repository / receipts
```

## 3. Public API / ChromePage

### 3.1 Current ChromePage 的角色

`src/framework/ChromePage.js` 仍保留 Legacy/Puppeteer 风格编程模型，但它不再自己猜 active tab。

Current page 是**已绑定 RunContext 的 façade**：
- constructor 需要 context；
- context 持有 identity/revision/target/transport/signal；
- 每次操作形成 typed operation；
- transport 将操作送到 controller authority/native driver；
- target 是 tab/frame/document 级事实。

这是 Legacy `global page + active tab` 的 REPLACED 实现。

### 3.2 ChromeContext / PageProxy

Current 没有必要假装存在 Legacy `ChromeContext`。当前对应的是：
- `src/framework/context.js` 的 RunContext；
- `src/scripting/sandbox/page-proxy.js` 的 PageProxy。

RunContext 解决“这次运行是谁、绑定哪个 target、何时取消、request/deadline 属于谁”；PageProxy 解决“保存脚本拿到怎样的 page surface”。

这两者是 CURRENT ONLY / Target 必要层，不是旧类名迁移。

## 4. Current Browser Automation 真实调用链

以 Controller 中 `await page.goto(url)` 为代表：

```text
保存并准入的 controller source
→ sandbox Worker
→ PageProxy / ChromePage.goto(url)
→ RunContext.request(browser.goto,...)
→ controller operation envelope
   (run identity + revision + exact target + requestId/deadline)
→ broker/authority/controller methods
→ native-driver
→ Chrome tabs/webNavigation native action
→ navigation receipt
→ authority validates old/new document handoff
→ targetVersion/documentId update
→ typed result
→ RunContext
→ ChromePage Promise
→ controller script
→ durable final result
```

与 Legacy 的关键差异：
- 不在操作时重新找 active tab；
- navigation 是明确的 old document → new document handoff；
- request/target 有可核验身份；
- 在途操作可以受 durable cancellation 和 host/permission/document invalidation 约束。

## 5. DOM / evaluate / world

Current 把代码执行分成不同安全 lane：

### 固定 DOM 操作

title/content/click/type/snapshot 等可走 packaged/fixed operation，不把任意 caller code 交给高权限 background eval。

### 用户定义 evaluate

`src/scripting/user-scripts/page-evaluator.js` 与 native driver 使用 Chrome `userScripts` 能力执行受控页面计算。它和 MAIN world 资源注入不是同一 world。

历史 API48 native 验证曾明确暴露这一差异：
- `addScriptTag({content})` 写入 MAIN world；
- `page.eval(..., expression)` 可读该 MAIN-world 值；
- `page.evaluate` 的受控 user-script world 不应自动共享该 MAIN global。

因此 world 语义的改变必须写入兼容合同，不能只比较函数名。

## 6. Current Page SDK

### 6.1 注入链

```text
trusted tool selection
→ exact tab/frame/document
→ sdk-approval snapshots source + capabilities + targetOrigins
→ chrome.permissions.request in trusted click
→ broker.installSdk
→ authority.grantSdk
→ fixed relay injected ISOLATED
→ fixed sdk-main injected MAIN
→ page sees OpenDeskSDK
```

世界隔离是有意设计：
- MAIN：网页真正消费 `OpenDeskSDK`；
- ISOLATED：extension relay；
- service worker：privileged broker/driver；
- relay 不因收到 CustomEvent 就信任 payload 中自报身份，真实 sender 由 runtime/channel 派生。

### 6.2 SDK request 链

```text
webpage A MAIN
→ OpenDeskSDK.call / axiosx / storage facade
→ codec + requestId/deadline
→ MAIN CustomEvent
→ ISOLATED relay
→ chrome.runtime
→ sdk-broker
→ authority validates source document + grant
→ registry maps method → capability/effect
→ service executor
→ platform driver
→ native receipt / durable operation state
→ post-effect authorization/delivery checks
→ relay
→ original A Promise
```

这条链已经是真实产品消费者入口，不是测试直接调用 `internalAuthority()`。

## 7. Current HTTP / axiosx

### 7.1 谁真正发送 HTTP？

`src/platform/chrome/network.js`。

### 7.2 为什么仍需要 axiosx？

保留 Legacy consumer 的调用习惯，但实际执行已正式化为：
- SDK method registry；
- source/capability/target authority；
- typed config normalization；
- Chrome extension network driver；
- durable request/effect facts。

### 7.3 Current 有意改变的语义

当前 network driver：
- `fetch` 使用 `credentials: 'omit'`；
- redirect 采用明确限制/manual 处理；
- 敏感 headers 有限制；
- timeout/deadline 与 AbortSignal 有统一预算；
- requestId + canonical digest 可检测 duplicate/conflict；
- 发生效果但无法确认结果时可进入 `effect_unknown`；
- recovery 不自动重放未知外部效果。

这些不能被描述成 Legacy axios 默认行为“原样迁移”。它们属于 ADAPT/REPLACED，需要消费者兼容验收。

## 8. Current Storage

### AppStorage

Current 把它映射到 durable、namespaced `frameworkKV`/repository，并把 request result 与 transaction 事实关联。

相对 Legacy background localStorage：
- 保留持久 KV 用途；
- 限制 clear 到授权命名空间；
- 加 request/durable semantics；
- 不允许一个网页清掉 background 所有杂项状态。

### AppLocal

Current 使用 `chrome.storage.session` + browser-session incarnation / namespace。

相对 Legacy `globalThis[key]`：
- 保留“临时会话值”用途；
- 不再污染 background globals；
- SW restart 内 session 可保持；
- 整个 browser session restart 后应该失效。

历史真实 Chrome SDK 证据已经验证过“SW restart 后 session/persistent 保持”和“browser session end 后 persistent 保留、AppLocal 失效”，但当前 P1 包仍需同包 L6。

## 9. Authority：为什么 Target 必须保留

Legacy 真实问题：
- active tab/bridge payload 是隐式目标；
- extension permission 与应用授权混在一起；
- eventId 是 correlation，不是 durable request identity；
- 没有统一 unknown-effect/no-replay；
- background restart 后内存 pending 不是恢复事实。

Current 已经用一个逻辑 authority 解决：

- source principal/namespace；
- controller target；
- SDK source document；
- capability grant；
- exact target origin；
- grant incarnation；
- requestId/digest；
- owner epoch/slot；
- cancellation fence；
- navigation/permission/tab invalidation；
- recover；
- `effect_unknown` / `paused_unknown`。

因此 TARGET 应**保留单一 authority**，而不是再建第二套 SDK authority 或 browser authority。

## 10. Native permission 与应用 authority 的关系

二者不是同一个概念：

```text
Chrome host permission
= 扩展平台层是否有资格访问某 origin

Application grant
= 这个 source document / principal
  是否被允许用某 capability
  访问哪些 target origins
```

P1.3 的工具 UI 会：
1. 选 exact tab/frame/document；
2. 选 capability；
3. 输入/规范化 target origins；
4. 在 trusted click 内调用 `chrome.permissions.request`；
5. 再把同一个 snapshot 提交 authority；
6. 校验 authority receipt 与 snapshot 完全一致后才显示 installed。

这层存在的原因来自真实安全边界，不是为了架构整齐。

## 11. Cancellation / timeout / stop

Current 的关键规则是：

```text
先让 durable cancel fence 赢事务
→ 再 abort 本地 waits / Worker
```

`src/run-host.js` 的 stop 路径明确这样实现。

它解决 Legacy 中“本地 Promise 停了但外部 effect 可能继续”“SW 中断后不知道是否应重放”的问题。

Target 必须保留：
- cancellation barrier；
- deadline；
- host close；
- document/navigation invalidation；
- permission revocation；
- terminal/unknown state；
- cleanup/retirement。

不能只保留一个 `cancel()` 方法名。

## 12. SW restart / unknown effect

Current authority recovery 的核心原则：

**未知外部效果不重放。**

如果一个有副作用请求已经 dispatched，但 SW 在 receipt/result 确认前重启：
- durable journal 仍能观察 request；
- recovery 不重新 authorize/dispatch 同一个未知 effect；
- 状态进入 `effect_unknown` 或对应 paused unknown；
- caller 的后续 duplicate request 能得到 typed unknown，而不是再发一次 POST。

这不是 Legacy 行为兼容项，而是 CURRENT ONLY 的可靠性增强。

## 13. Artifact / download

Current 有独立 `src/platform/downloads/index.js`，其模型包括：

```text
durable successful controller result
→ prepare artifact
→ bytes/chunks + sha256
→ export job
→ reader pin
→ fresh same-extension Blob URL
→ download attempt
→ chrome.downloads native dispatch
→ map/reconcile downloadId
→ durable receipt/candidate
→ release Blob/resource
```

这层不是 Legacy “页面触发一个下载”的简单 wrapper。它解决：
- result 与下载文件如何绑定；
- 文件 hash/bytes 是否还是原结果；
- SW 重启如何恢复；
- 是否重复提交下载；
- 何时能 revoke Blob；
- 谁拥有 artifact。

TARGET 应保留这套生命周期，不为了“Legacy 没有”而删除。

## 14. Current UI

`src/ui/tool-shell.js` 与 `src/ui/sdk-approval.js` 已经是正式 P1.3 consumer：
- tab/document inventory；
- capability checkboxes；
- target origins；
- approval preview；
- trusted install click；
- permission/navigation/tab close 后 UI 变 stale；
- 历史 receipt 不被当成当前授权证明。

所以“P1.3 只有内部 API，没有 UI consumer”是错误结论。

但当前 P1 package 的原生手势/popup/真实 A→B acceptance 仍是 L6 缺口。

## 15. P1.2 / P1.3 / P1.4 精确定位

```text
完整 Browser Framework
│
├─ Browser automation
│  ├─ Context / exact target
│  ├─ Page
│  ├─ Navigation
│  ├─ DOM / JS / wait
│  ├─ cookie / screenshot / upload
│  └─ lifecycle
│
├─ Page SDK
│  ├─ axiosx
│  ├─ storage
│  ├─ local
│  └─ utility APIs
│
├─ Extension runtime
│  ├─ MAIN
│  ├─ ISOLATED relay
│  ├─ SW
│  └─ codec/transport
│
├─ Authority
│  ├─ source
│  ├─ capability
│  ├─ target
│  ├─ grant
│  └─ lifecycle
│
├─ HTTP
├─ Durable state
├─ Artifact/download
└─ UI
```

- **P1.2**：Page SDK + Authority 中的 exact target-origin / grant 纵切；
- **P1.3**：UI + native permission + exact document approval 入口；
- **P1.4**：正式 SDK consumer → broker/authority → HTTP driver 的 golden path 与回归。

P1 没有重新完成整个 Browser automation 子树。

## 16. 历史 native 证据与当前候选的关系

### 历史 SDK native

`docs/framework/evidence/f2-sdk-native/native-2026-10-04T09-23-54.100Z-a9793184`

- Chrome 138；
- production package `99d6d078…`；
- 17/17 PASS；
- 覆盖真实 UI install、Hello、HTTP 四动词、storage、100 concurrent promises、SW effect_unknown、permission removal、navigation invalidation、browser-session restart 等。

这是强 L5 证据。

### 历史 Browser automation native

Controller native evidence 包括：
- `OWNED-GOTO-TYPE-CLICK-WAIT-READ-RETURN` PASS；
- API48 曾有一次因 `addScriptTag`/world 预期错误 FAIL；
- 后续 package `99d6d078…` 的 API48 run 调整为真实 world 合同后 PASS。

这恰好证明：**“48 个 API 有代码”不等于行为合同已正确。**

### 当前 P1

P1 candidate README 记录：
- product source `01b48dcb…`；
- source tree `8ea3d1d…`；
- production `61ac11ca…`；
- 239 + 237 tests PASS；
- CI PASS；
- native user chain NOT_TESTED。

所以当前结论必须写：
- Current 实现具备很强的历史 native 依据；
- 但 P1 新 source/package 的 L6 仍要重跑。

## 17. 最小 Target

```text
Public API
   ↓
Codec / Transport
   ↓
Single Authority
   ↓
Runtime / Host
   ↓
Platform Driver
   ↓
Durable State
```

外加横切：
- native permission；
- request identity/digest；
- cancellation barrier；
- owner slot/transaction pin；
- artifact/download lifecycle；
- SDK/axiosx 正式消费者；
- unknown effect no replay。

### 为什么每层需要？

| 层 | Legacy/Current 证据 | 必要性 |
|---|---|---|
| Public API | Legacy consumer 依赖 page/axiosx/storage | 保持消费者入口，避免重写所有业务脚本 |
| Codec/Transport | 两边都有跨 world/context Promise | 区分序列化/相关性与授权，不让 relay 成 authority |
| Single Authority | Legacy 隐式目标/权限；Current 已有可靠 owner | 集中 source/target/grant/request/lifecycle |
| Runtime/Host | Legacy background shared page；Current RunHost/Worker | 管真实运行资源和脚本生命周期 |
| Platform Driver | Legacy 直接 Chrome API；Current 已分 driver | 把授权与 native effect 分离，便于测试/恢复 |
| Durable State | Legacy pending/global state 无恢复保证；Current IDB journals | stop/restart/unknown-effect/result/artifact 的事实来源 |

不需要为了图漂亮再拆第二套数据库、第二套 broker 或平行 SDK runtime。

## 18. 不应重写的 Current 正确资产

除非有行为证据要求，否则应保留：
- 已有 authority 状态机；
- request/digest/idempotence；
- durable repositories；
- cancellation barrier；
- navigation target-version handoff；
- storage session/persistent 分层；
- network effect journal；
- artifact/download 状态机；
- native receipt/recovery；
- fixed MAIN/ISOLATED SDK injection。

后续开发重点应是**补消费者兼容和当前候选 L6**，而不是再次重构这些正确资产。
