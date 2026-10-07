# Legacy → Current → Target Migration Map

> 核心迁移账本（人工工程基线）。  
> Legacy：`todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex`。  
> Current 产品源码：`01b48dcb49b31844d30c0e6fdeed1756e5046f11`。  
> 当前候选分支本轮观察 HEAD：`3b7d6a361c05a8f40e26afae1776ed9e3b7b18e6`，其相对 P1 交付 HEAD 的后续提交不修改 `src/`。

## 1. 状态与验证等级

迁移状态：
`LEGACY ONLY` / `LEGACY + CURRENT` / `CURRENT ONLY` / `MIGRATED` / `PARTIALLY MIGRATED` / `REPLACED` / `NOT YET MIGRATED` / `UNKNOWN`。

验证等级：

| 等级 | 含义 |
|---|---|
| L0 | 源码存在 |
| L1 | API 存在 |
| L2 | 真实 consumer 已接正式路径 |
| L3 | component test |
| L4 | integration / compiled-product / CI |
| L5 | 历史真实 Chrome 用户链 |
| L6 | 当前候选源码/包的真实 Chrome 用户链 |

## 2. 核心 Legacy → Current 映射表

| Legacy 能力 | Legacy 文件/入口 | Legacy 真实调用链 | Current 对应模块 / 入口 | 状态 | 证据级别 | 关键差异 / Gap |
|---|---|---|---|---|---|---|
| ChromePage | `src-bex/ChromePage.ts`；background/global page consumers | consumer → shared page → active tab → script/Chrome API → pending callback | `src/framework/ChromePage.js` + `context.js` + Controller | **MIGRATED** | L4 当前；L5 历史 | 从 active-tab singleton 改为 exact target/context；当前候选 L6 待重验 |
| ChromeContext | Legacy 固定源码未发现 | 无可证链 | `RunContext` in `src/framework/context.js` | **CURRENT ONLY** | L4 | 不得反写成 Legacy 类；承担 identity/target/request/signal |
| PageProxy | Legacy 固定源码未发现 | 无可证链 | `src/scripting/sandbox/page-proxy.js` | **CURRENT ONLY** | L4/L5 历史 | 为保存脚本提供受控 page surface |
| global page | `ChromePage.ts` export + `background.ts` | background/controller → shared page | 每 run 注入/绑定 page | **REPLACED** | L4/L5 | 不再跨运行共享隐式 active target |
| active-tab targeting | `ChromePage._execute` 等 | 每次 query active tab | authority target `tabId/frameId/documentId/targetVersion` | **REPLACED** | L4/L5 | 焦点变化不改变已准入目标 |
| navigation | `ChromePage.goto/reload` | active tab → tabs.update/reload → completion listener | ChromePage → RunContext → controller op → native-driver → webNavigation handoff | **MIGRATED** | L4；L5 historical | Current 有 old/new document identity；候选 L6 待重验 |
| click | `ChromePage.click` | page script/DOM event | packaged/native operation | **MIGRATED** | L4；L5 historical | exact document + cancel；仍是声明的 DOM interaction，不等于硬件 input |
| type | `ChromePage.type`, Keyboard | page value/key events | packaged type + Keyboard facade | **MIGRATED** | L4；L5 historical | 兼容追加/事件语义需真实旧 consumer 回归 |
| wait | waitFor* | local timer/page predicate + callback | context/packaged/userScripts waits + signal/deadline | **MIGRATED** | L4；L5 historical | Current 有 cancellation/document fence |
| evaluate | `evaluate/eval` | injected page JS；function/string 路径 | page-evaluator/userScripts + explicit eval lane | **PARTIALLY MIGRATED** | L4；L5 historical API48 | world/mode 语义改变；需旧 consumer fixtures |
| DOM $/$$ | `ChromePage.$/$$` | serialize/read DOM → host representation | snapshot/DOM host + Worker restrictions | **PARTIALLY MIGRATED** | L4；L5 historical typed denial/positive eval | Legacy 不是 live ElementHandle；Current 对 Worker snapshot/context 限制更严格 |
| screenshot | `ChromePage.screenshot*` | capture visible/webview | native Chrome driver | **PARTIALLY MIGRATED** | L4；L5 historical limit tests | fullPage 等受限；当前候选 L6 待重验 |
| upload | `uploadFile` helpers | URL/data/blob → file input | upload driver/chunk/commit | **MIGRATED** | L4；L5 historical | Current 有预算/target identity |
| Cookie | `cookies/setCookie/deleteCookie` | chrome.cookies 或 document.cookie/eval | cookie driver + permission/target | **MIGRATED** | L4；L5 historical | Current typed permission/error；Legacy set/delete 会 log-swallow 部分失败 |
| Frame | 旧执行多依赖当前 tab/page，未发现 durable exact frame identity | 隐式页面上下文 | exact frameId/documentId + frame inventory | **REPLACED** | L4；L5 historical child-frame | Current 显式 frame/document 是新安全合同 |
| axiosx | `assets/js/core/axiosx.js` → CustomEvent → background axios | webpage → bridge → relay → background HTTP → callback | `framework/sdk/http.js` → relay → sdk-broker/authority → `chrome/network.js` | **MIGRATED** | L4 current；L5 historical 17/17 | credentials/redirect/header/config 与 Legacy 不完全相同；当前 P1 L6 未验 |
| AppStorage | `appStorage.js` → background localStorage | webpage → bridge → background persistent string KV | SDK storage → namespaced durable frameworkKV | **MIGRATED** | L4；L5 historical | clear 范围、request/durable semantics 改进 |
| AppLocal | `appLocal.js` → background globalThis | webpage → bridge → process-lifetime temp value | namespaced `chrome.storage.session` | **REPLACED** | L4；L5 historical | SW restart 可保持；browser session end 清空，语义更明确 |
| chrome.storage helper | `chrome-local-storage-api.js` / BEX storage | separate bridge → chrome.storage.local | SDK storage facade/repository | **PARTIALLY MIGRATED** | L4 | 需按旧 helper consumer 逐项核对 |
| log/getTime/bexUrl | core/service bridge | webpage → background utility | SDK/background-services | **MIGRATED** | L4；部分 L5 historical SDK 18 | 精确 legacy return/error shape 需 consumer regression |
| requestResource | bridge/background | 页面请求 background 获取资源，旧用途可加载外部资源 | packaged resource/controlled service | **REPLACED** | L4 | 不恢复“远程资源=可执行代码”的高权限通道 |
| raw executeScript / executeInBg | `brige.js/background.ts` | webpage → bridge → background eval/wrapAsync → shared page | Page SDK 拒绝 raw script；Controller Worker/RunHost 承接任务 | **REPLACED** | L4/L5 historical controller | 旧能力真实存在，但危险机制不保留；旧网页“启动任务”消费场景尚需正式替代入口 |
| transport correlation | eventId + page map/pendingEvents | in-memory callback | requestId + codec + transport pending + durable journal | **REPLACED** | L4/L5 | correlation 与 durable identity 分离 |
| cancel/stop | 分散业务 stop/Promise/timer | 未发现统一 durable fence | authority stop + durable cancel fence → local abort | **CURRENT ONLY / REPLACED** | L4；L5 historical stop cases | Current 更强；需当前候选 L6 |
| timeout | method/config timers | 局部 timeout | deadline + AbortSignal + driver budget | **REPLACED** | L4/L5 | 超时与 effect state 显式化 |
| SW/background restart | Legacy 无统一 durable recovery | memory pending/global state 不可靠 | authority recover + journal/session storage | **CURRENT ONLY** | L4；L5 historical | 当前 P1 L6 待重验 |
| unknown effect | Legacy 未发现显式状态 | 无通用区分 | `effect_unknown/paused_unknown`, no replay | **CURRENT ONLY** | L4；L5 historical | 关键可靠性增强 |
| authorization | manifest/host permissions + injection/bridge availability | extension-level privilege | native permission + application authority/grant | **REPLACED** | L4；L5 historical | P1.2/P1.3 主体 |
| artifact/download lifecycle | Legacy 未发现 framework-level task artifact FSM | 业务下载不等同 framework artifact | `platform/downloads` + artifacts/jobs/attempts/receipts | **CURRENT ONLY** | L4；L5 historical | 当前 candidate 同包验收待补 |

## 3. Page SDK 注入与返回链对照

### Legacy

```text
网页 A MAIN
→ injected axiosx/AppStorage/AppLocal
→ DOM CustomEvent
→ custom_event.js/content relay
→ runtime/BEX message
→ background dispatcher
→ axios/storage/resource/utility
→ callback code/bridge
→ eventId
→ 原网页 Promise
```

特点：
- API 真实消费者存在；
- relay 与 background 具有扩展权限；
- source/target grant 不是独立 authority；
- callback identity 主要是 eventId；
- background 对当前页面/active tab 的依赖较强。

### Current

```text
tool trusted approval
→ exact A document + capability + target origins
→ native permission
→ authority grant
→ fixed SDK MAIN + relay ISOLATED

网页 A MAIN
→ OpenDeskSDK/axiosx/AppStorage/AppLocal
→ codec + requestId/deadline
→ CustomEvent
→ ISOLATED relay
→ runtime actual sender
→ single authority
→ service/platform driver
→ durable operation/result
→ delivery authorization
→ 原 A Promise
```

状态：**MIGRATED + security/lifecycle REPLACED**。

## 4. 行为契约映射

| 行为 | Legacy | Current | 判断 | 未闭合点 |
|---|---|---|---|---|
| navigation resolve | active tab navigation + completion intent | exact target navigation receipt + document handoff | **改变且更强** | 当前候选 L6 |
| click | page DOM synthetic interaction | exact-doc packaged/native interaction | **主要保持** | 旧业务事件细节 |
| type | DOM value/key event semantics | packaged type/keyboard | **主要保持，有限制** | 追加/selection/input event 逐 consumer |
| evaluate(function) | page execution + callback | controlled userScripts/evaluator | **改变** | world/CSP/userScripts availability |
| eval(string) | string code path，可能和 background raw eval 混用 | explicit expression/statement or denied raw background execution | **改变** | 旧字符串脚本迁移 |
| wait | local/page wait | signal/deadline/document-bound | **保持意图、强化生命周期** | exact timeout timing |
| screenshot | visible capture/webview branch | native driver，unsupported options typed reject | **部分保持** | fullPage 等不是正向兼容 |
| upload | file input injection | bounded typed upload | **主要保持** | 文件类型/URL/network edge |
| download | 无统一 task artifact contract | durable artifact/download FSM | **新增** | 不应强行找 Legacy 1:1 |
| HTTP | background axios | authority + fetch driver | **改变** | credential/redirect/error shape |
| storage persistent | background localStorage String KV | durable namespaced KV | **保持用途、改变边界** | exact legacy string/coercion |
| AppLocal | background global variable | storage.session namespace | **改变生命周期实现** | 旧 consumer 是否依赖 SW/process 清空 |
| cookie read | chrome.cookies permission or document.cookie | exact target/permission cookie driver | **保持用途** | fallback/return shape |
| cancel | 无统一 barrier | durable fence then local abort | **新增/改变** | current candidate L6 |
| timeout | 局部 | durable deadline + abort | **强化** | consumer-visible exact errors |
| stop | 业务/运行路径分散 | authority stop/retire + worker abort | **强化** | current candidate L6 |
| disconnect/tab close | 无统一 durable contract | target invalidation/host close/retirement | **强化** | candidate native |
| SW restart | 无统一 recovery | journal recovery/session semantics | **新增** | candidate native |
| unknown effect | 无显式分类 | effect_unknown / no replay | **新增** | candidate native |

## 5. Consumer 级兼容：不能只对 API 名

### ChromePage consumer

至少要把 Legacy 中可追溯的：
- `controller/csdn.ts`
- `assets/js/controller/csdn.js`
- `assets/js/testMonkey.esm.js`

转换/固定为可运行 fixture，走**正式 Script/Controller/RunHost**入口。

不能用：
```text
test → nativeDriver.execute(...)
```
代替：
```text
legacy-like consumer source
→ saved controller
→ RunHost
→ PageProxy/ChromePage
→ authority
→ native Chrome
```

### Page SDK consumer

必须由实际网页：
```text
OpenDeskSDK / axiosx / AppStorage / AppLocal
```
发起，而不是测试直接调用 SDK authority/service。

P1 已经满足 L2/L4；当前缺的是同包 L6。

## 6. 功能完成度矩阵

符号：
- ✓ = 有直接事实；
- H = 历史真实 Chrome 证据（L5），不是当前候选 L6；
- — = Legacy 不具备对应强合同；
- ? = 当前证据不足；
- “当前 native”列只认当前 P1 product/package。

| 能力 | Legacy | Current source/API | 真实 consumer | Component | Integration/compiled | 历史 native | 当前 native | 状态 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Page navigation | ✓ | ✓ | ✓ Controller | ✓ | ✓ | H | ? | MIGRATED，需 L6 |
| click | ✓ | ✓ | ✓ | ✓ | ✓ | H | ? | MIGRATED，需 L6 |
| type | ✓ | ✓ | ✓ | ✓ | ✓ | H | ? | MIGRATED，需 L6 |
| wait | ✓ | ✓ | ✓ | ✓ | ✓ | H | ? | MIGRATED，需 L6 |
| evaluate | ✓ | ✓ | ✓ | ✓ | ✓ | H | ? | PARTIAL：world/consumer 语义 |
| DOM $/$$ | ✓ | ✓/受限 | ✓ | ✓ | ✓ | H | ? | PARTIAL |
| screenshot | ✓ | ✓/受限 | ✓ Controller | ✓ | ✓ | H | ? | PARTIAL |
| upload | ✓ | ✓ | ✓ | ✓ | ✓ | H | ? | MIGRATED |
| Cookie | ✓ | ✓ | ✓ Controller | ✓ | ✓ | H | ? | MIGRATED |
| axiosx | ✓ | ✓ | ✓ webpage/Controller | ✓ | ✓ | H | **NOT_TESTED for P1 package** | MIGRATED/P1 L4 |
| cross-origin HTTP target authority | — | ✓ | ✓ webpage | ✓ | ✓ | H older package | **NOT_TESTED** | CURRENT ONLY/P1 |
| AppStorage | ✓ | ✓ | ✓ | ✓ | ✓ | H | ? | MIGRATED |
| AppLocal | ✓ | ✓ | ✓ | ✓ | ✓ | H | ? | REPLACED implementation |
| raw webpage→background execute | ✓ | explicit reject/replacement | Controller consumer exists；same webpage-start need partial | ✓ | ✓ | H Controller | ? | REPLACED |
| request identity/digest | — | ✓ | ✓ | ✓ | ✓ | H | ? | CURRENT ONLY |
| durable cancellation | — | ✓ | ✓ | ✓ | ✓ | H | ? | CURRENT ONLY |
| SW recovery | — | ✓ | ✓ | ✓ | ✓ | H | ? | CURRENT ONLY |
| unknown-effect no replay | — | ✓ | ✓ | ✓ | ✓ | H | ? | CURRENT ONLY |
| SDK approval UI | — | ✓ | ✓ tool UI | ✓ | ✓ | H | **NOT_TESTED** | P1.3 current L4 |
| artifact/download | — | ✓ | ✓ product export/controller | ✓ | ✓ | H | ? | CURRENT ONLY |

## 7. P1 完成度矩阵

### P1.2 — Target authorization

**节点：** Page SDK Authority。

已完成：
- source document；
- capability；
- exact targetOrigins；
- same-origin default；
- grant incarnation；
- native permission + application grant 分离；
- request/digest/journal integration；
- revoke/navigation/permission lifecycle code；
- lookup/reference 与 unknown-effect 规则。

当前最高证据：**L4 + 历史 L5**。

未完成为当前候选 L6：
- 当前 package 的真实 grant/revoke/navigation/SW race。

### P1.3 — Tool authorization UI

**节点：** UI → native permission → authority。

已完成：
- exact tab/frame/document picker；
- capability picker；
- targetOrigins input/preview；
- trusted click 内 `permissions.request`；
- receipt 与原 snapshot 对账；
- navigation/tab close/permission remove 后 stale。

当前最高证据：**L4 + 历史 L5**。

未完成为当前候选 L6：
- 当前 package 的真实 Chrome permission prompt/deny/regrant/selection race。

### P1.4 — Formal SDK/axiosx golden path

**纵向链：**

```text
real webpage SDK consumer
→ MAIN transport
→ ISOLATED relay
→ SW broker
→ authority
→ network/storage/background driver
→ result/delivery
```

已完成：
- 正式 consumer 接线；
- loopback A/B/C component/integration；
- 239 + 237 tests；
- build/CI；
- conflict/timeout/target scope/codec 等回归。

当前最高证据：**L4 + 历史 L5**。

未完成：
- 当前 P1 package 的同包 native A→B/C acceptance。

## 8. “看起来完成但实际没有完成”清单

### 8.1 API48 ≠ 48 个正向功能全部兼容

历史真实 Chrome API48 曾整体 FAIL，只因为 `addScriptTag` 后错误地假设 `page.evaluate` 与 MAIN world 共享 global。后续把 world 合同写正确后才 PASS。

结论：API 名存在不等于语义正确。

### 8.2 typed rejection ≠ Legacy 正向能力迁移

例如：
- fullPage screenshot 被 `E_FULL_PAGE_UNSUPPORTED` 拒绝；
-某些 `$/$$` context 被 `E_DOM_SNAPSHOT_CONTEXT` 拒绝。

这些可以证明安全边界正确，但不能把“Legacy 支持的正向语义”记成 MIGRATED，除非 Target 明确决定不兼容并记录差异。

### 8.3 历史 native PASS ≠ 当前候选 native PASS

`99d6…` package 的 SDK 17/17 PASS 很强，但当前 P1 production 是 `61ac…`。source/package 改变后必须重新达到 L6。

### 8.4 P1 PASS ≠ Browser Framework PASS

P1 是 SDK authorization/HTTP 的纵向切片。ChromePage、controller、artifact/download、完整 lifecycle 有自己的矩阵。

### 8.5 wrapper/API 存在 ≠ consumer 已迁移

Current 可以有 `page.evaluate`、`axiosx`，但旧 controller/business script 未成为 regression fixture 时，消费者兼容仍是 partial。

### 8.6 cancel() 存在 ≠ lifecycle 完整

真正需要验证：
- pending native op；
- navigation；
- tab close；
- permission revoke；
- host close；
- deadline；
- SW restart；
- effect_unknown；
- no late effect。

Current 代码模型已有这些，但当前候选需要同包 native 证明。

## 9. Legacy → Current 行为差异必须保留的清单

开发中不得“为了兼容”无意删掉以下 Current 增强：

1. exact `tabId/frameId/documentId`；
2. navigation targetVersion handoff；
3. one logical authority；
4. native permission ≠ app grant；
5. requestId + canonical digest；
6. duplicate/conflict detection；
7. durable cancellation fence；
8. transaction/owner slot/pin；
9. effect_unknown / paused_unknown；
10. unknown effect no replay；
11. AppStorage namespace；
12. AppLocal session namespace/incarnation；
13. artifact hash/chunks；
14. download attempt/receipt/reconcile；
15. fixed MAIN SDK + ISOLATED relay；
16. real sender derived from platform, not payload claim。

旧 consumer 兼容应适配这些边界，而不是把框架退回 active-tab/raw-eval 模式。

## 10. Current Completion：按领域结论

| 领域 | 当前状态 | 解释 |
|---|---|---|
| Browser automation | **MIGRATED / PARTIAL behavior compatibility** | 主体强，旧 consumer/world 边界和当前 candidate native 待闭合 |
| Page SDK | **MIGRATED** | formal consumer 已接；raw background execute 被 REPLACED |
| HTTP | **MIGRATED with semantic changes** | authority/credentials/redirect/error contract 需旧 consumer 验收 |
| Runtime | **MIGRATED** | MAIN/ISOLATED/SW/codec/transport 明确 |
| Authority | **CURRENT ONLY, mature core** | P1 扩 target scope；不要另起 authority |
| UI | **P1.3 IMPLEMENTED at L4** | current P1 native acceptance pending |
| Storage | **MIGRATED/REPLACED** | persistent/session 都比 Legacy 更明确 |
| Artifact | **CURRENT ONLY** | durable result/download lifecycle |
| Lifecycle | **CURRENT ONLY + migration support** | 当前架构优势，但需同包 L6 |

## 11. 下一工程工作：只保留三项

### P0 / 第一优先级 — P1 current-package native closure

**Legacy capability：** axiosx / AppStorage / AppLocal / page SDK injection。  
**Current gap：** `01b48dcb…` + `61ac…` package 只有 L4，native user chain = NOT_TESTED。  
**模块：**
- `src/ui/sdk-approval.js`
- `src/ui/tool-shell.js`
- `src/platform/host/sdk-methods.js`
- `src/platform/host/sdk-broker.js`
- `src/platform/chrome/network.js`
- `src/framework/sdk/*`
- `src/agents/page-relay.js`

**验证：**
- A exact document install；
- B same/approved cross-origin success；
- unapproved C zero network effect；
- deny/revoke/regrant；
- source navigation invalidates old grant；
- 100 concurrent promises；
- SW restart after server effect → `E_EFFECT_UNKNOWN` and exactly one server hit；
- old request never resurrects after regrant。

### P1 / 第二优先级 — Legacy consumer compatibility pack

**Legacy capability：** ChromePage, raw controller script, SDK globals。  
**Current gap：** 当前测试主要证明 framework contracts；旧真实 consumer 未形成系统 fixture。  
**模块：**
- `src/framework/ChromePage.js`
- `src/framework/context.js`
- `src/scripting/sandbox/page-proxy.js`
- `src/scripting/sandbox/controller.js`
- `src/framework/control/native-driver.js`

**验证：**
- 从 Legacy `controller/csdn.ts`、`assets/js/controller/csdn.js`、`testMonkey.esm.js` 提取最小可重现脚本；
- 经正式 script save/run 入口执行；
- 对 goto/click/type/wait/evaluate/$/$$/cookie/upload/screenshot 逐行为标记：保持 / 改变 / 拒绝 / UNKNOWN；
- error shape、Promise timing、navigation 后旧 element、stop/timeout 一并记录。

### P2 / 第三优先级 — Same-package automation/lifecycle/artifact qualification

**Legacy capability：** page operations + file/user effects。  
**Current gap：** 强历史 native 证据不是当前 package L6。  
**模块：**
- `src/run-host.js`
- `src/platform/host/authority.js`
- `src/framework/control/native-driver.js`
- `src/platform/downloads/index.js`
- `src/platform/storage/*`

**验证：**
- owned/borrowed exact document；
- child frame；
- navigation handoff；
- stop/deadline/host close；
- permission revoke/tab close；
- SW recovery；
- screenshot/upload/cookies；
- durable result reopen；
- artifact/download bytes/hash/native receipt/blob release；
- no source/package drift。

## 12. 基线使用规则

今后任何 Goal 如果要宣称某能力“完成”，至少写清：

```text
Legacy consumer:
Legacy behavior:
Current public entry:
Current execution point:
Migration status:
Behavior delta:
Component evidence:
Integration evidence:
Native evidence package/source:
Remaining gap:
```

缺任一关键项时，不得用单一“已完成”掩盖不确定性。
