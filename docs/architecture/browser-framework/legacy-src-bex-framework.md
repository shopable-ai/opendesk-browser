# Legacy src-bex Framework — 旧系统事实地图

> 本文只记录 Legacy，不把 Current/Target 倒灌进来。  
> 固定事实源：`shopable-ai/todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex`。  
> 用户指定的本机 `/Users/shopme/Documents/workspace/todo-user-vue/src-bex` 在当前执行环境不可读，因此不能证明本机未提交内容与该 SHA 完全一致。

## 1. 一句话结论

Legacy `src-bex` 是一个混合浏览器扩展运行时：

1. **后台浏览器自动化主线**：共享 `ChromePage` 单例提供 Puppeteer 风格 Page API，通过 active tab + Chrome API/页面脚本执行；
2. **页面 SDK/service 主线**：把 `axiosx / AppStorage / AppLocal / utility` 注入网页，借 CustomEvent/content-script/background relay 调用扩展特权；
3. **脚本启动入口**：网页或后台还能提交一整段控制代码运行，它最终仍消费 `page` 和 service 能力。

它不是一个已发现 `Browser → BrowserContext → Page` 的 Puppeteer 内核。

## 2. Legacy 模块图

```text
src-bex
│
├─ ChromePage.ts
│  ├─ ChromePage
│  ├─ ChromeElement
│  ├─ Keyboard
│  ├─ pendingEvents / operationCompleted
│  └─ exported shared page singleton
│
├─ background.ts
│  ├─ imports/uses shared page
│  ├─ bridge/service dispatcher
│  ├─ HTTP via axios
│  ├─ storage/resource/notification utilities
│  └─ raw script/controller execution paths
│
├─ my-content-script.ts
│  └─ page-side environment / SDK asset injection
│
├─ assets/js/custom_event.js
│  └─ DOM CustomEvent ↔ chrome.runtime relay
│
├─ assets/js/core/
│  ├─ axiosx.js       request facade + event correlation
│  ├─ brige.js        browser/background bridge helpers
│  ├─ appStorage.js   persistent facade
│  ├─ appLocal.js     temporary facade
│  ├─ common.js
│  ├─ serverUtils.js
│  └─ utils.js
│
├─ chrome-local-storage-api.js
│  └─ separate chrome.storage.local/BEX helper
│
└─ consumers
   ├─ controller/csdn.ts
   ├─ assets/js/controller/csdn.js
   ├─ assets/js/testMonkey.esm.js
   └─ other injected/business scripts
```

## 3. ChromePage 到底是什么？

### 3.1 是 Puppeteer 风格 API，不是 Puppeteer 内核

固定源码中可见：

- `title/content/url/reload/goto`
- `$ / $$ / $eval / $$eval`
- `click/type`
- `waitFor/waitForTimeout/waitForSelector/waitForFunction`
- `evaluate/eval`
- `screenshot`
- `uploadFile`
- `cookies/setCookie/deleteCookie`
- `addScriptTag/addStyleTag`
- `ChromeElement`
- `Keyboard`

但本轮 Legacy tree/search **没有发现**：
- `ChromeContext`
- `BrowserContext`
- `PageProxy`
- Puppeteer package 驱动执行
- CDP session 作为 ChromePage 的底层模型

所以“ChromePage 是 Puppeteer 风格抽象”是事实；“Legacy 本来就有 Current 的 context/proxy/authority”不是事实。

### 3.2 目标选择是隐式 active tab

Chrome 分支执行页面代码时，`ChromePage._execute` 会查询当前窗口的 active tab，然后把脚本送进去。目标身份不是一个 durable 的 `tabId/frameId/documentId` 契约。

因此旧模型的核心事实是：

```text
page method
  ↓
运行时重新选择 active tab
  ↓
向该 tab 执行脚本 / 调 Chrome API
```

这也是后续 Current 必须显式 target binding 的真实原因之一。

## 4. 一条真实 Browser Automation 调用链

以 `page.title()` 为代表：

```text
真实 consumer / background controller
→ ChromePage.title()
→ ChromePage.evaluate(() => document.title)
→ ChromePage._execute(...)
→ 创建 eventId / pendingEvents[eventId]
→ chrome.tabs.query({active:true,currentWindow:true})
→ chrome.tabs.executeScript(... code ...)
→ 目标页面执行代码
→ operationCompleted(eventId, result/error)
→ ChromePage pendingEvents 找到回调
→ Promise resolve/reject
→ consumer
```

这是 Legacy 自己的 RPC/Promise 机制；不是 Current 的 request identity，也不是 durable transaction。

## 5. navigation：page.goto 的真实含义

Legacy `goto(url)` 的意图是：

```text
consumer
→ page.goto(url)
→ 找到当前 active tab
→ chrome.tabs.update(tabId,{url})
→ 等待 tab update/complete 类事件
→ Promise 完成
```

需要记录的行为风险：

- 目标最初由 active tab 得出；
- navigation 期间没有 Current 那种 exact old-document → new-document handoff identity；
- 监听完成与本次 durable request identity 没有绑定；
- background/SW 中断时没有发现等价的持久恢复合同；
- “浏览器发生导航”与“调用者确定拿到本次导航最终结果”不是同一事实。

这不意味着 Legacy 架构“错误”；它只是旧行为事实。

## 6. DOM / execute / evaluate

### 6.1 DOM 操作在哪里执行？

ChromePage 的 DOM 读取、click/type、selector evaluation 等最终在目标网页上下文执行页面 JavaScript。宿主端负责拼装脚本、选择 tab、等待回调。

`$ / $$` 的旧语义尤其不能直接等同 Puppeteer live `ElementHandle`：
- 旧实现倾向序列化 DOM/outerHTML 或返回宿主可表示结果；
- `ChromeElement` 主要是 `page + selector` 的后续操作代理；
- 没有发现一个可跨导航继续代表同一 DOM node 的 CDP handle。

### 6.2 evaluate / eval

Legacy 同时存在：
- function 型 evaluate；
- string/eval 型执行；
- background/controller raw script 路径。

这些路径的执行语义并不完全相同。尤其 raw script 可以在后台高权限控制环境里获得 `page`，不能把它和网页 MAIN world 的普通 `eval` 混成一类。

### 6.3 Promise / error

ChromePage 单操作主要依赖：
- eventId
- `pendingEvents`
- callback/operationCompleted

返回值/错误通过脚本和消息序列化跨上下文。没有发现 Current 那样统一的 tagged-value codec、durable operation journal、effect_unknown recovery。

## 7. click / type / wait

### click

旧 click 是页面脚本层面的 DOM/事件模拟，不应自动解释成真实硬件输入或 CDP Input domain。

### type

旧 type 主要是目标输入元素值/事件语义，和完整 Puppeteer 键盘输入不等价。旧 `Keyboard` 也以页面事件模拟为主。

### wait

`waitFor / waitForSelector / waitForFunction / waitForTimeout` 均存在，但超时/停止主要属于当前 Promise/计时器和页面回调；没有发现统一 durable cancellation barrier。

因此 Legacy 行为契约应描述“调用意图和实际实现”，而不是事后给它补 Current 的强取消语义。

## 8. screenshot / upload / cookies

### screenshot

Legacy Chrome 环境使用 Chrome 的页面/可见区域截图能力；另有 WebView/Capacitor 分支。它不是一个 task-linked artifact pipeline。

### upload

`uploadFile` 与辅助路径支持把 Blob/data URL/URL 等转换后赋给 file input。上传动作最终还是目标页面 DOM/file input 效果。

### cookies

`ChromePage.cookies(...urls)`：
- 若扩展有 cookies permission，则调用 `chrome.cookies.getAll`；
- 否则 fallback 到页面 `document.cookie`。

`setCookie/deleteCookie`：
- 构造 `document.cookie` 脚本；
- 通过 `eval` 在页面执行；
- `httpOnly` 无法通过页面 JS 设置；
- 源码中的失败路径以 log 为主，不能自动等价 Current typed error contract。

## 9. Legacy Page SDK 是什么？

页面 SDK 是另一条主线，不是 ChromePage 的别名。

网页侧可见/相关 API 包括：

- `axiosx`
- `AppStorage`
- `AppLocal`
- bridge helpers
- `log`
- `getTime`
- `bexUrl`
- `requestResource`
- notification/server utility 等服务

### 9.1 SDK 如何进入页面？

真实链条是：

```text
my-content-script.ts
→ 将 SDK/core/app assets 放进目标网页环境
→ 网页 MAIN-world globals 可调用 axiosx/AppStorage/AppLocal/...
```

不能只写“content script 通信”：页面业务程序需要拿到 MAIN-world API，而 content script/extension world 再承担跨上下文 relay。

## 10. Legacy SDK 真实调用链

以 `axiosx.get(url)` 为代表：

```text
网页 MAIN world consumer
→ axiosx.get(url)
→ callChromeBridgeInterface('AXIOS_GET', args)
→ 生成 eventId
→ 页面保存本次 Promise callback
→ dispatch CustomEvent('CHROME_BRIDGE_INTERFACE', ...)
→ assets/js/custom_event.js 监听
→ chrome.runtime / BEX message
→ background.ts bridge dispatcher
→ AXIOS_GET handler
→ background axios.get(...)
→ 得到 response / error
→ background 触发 callback/operation-completed 路径
→ 页面侧 bridge 找到 eventId
→ 原 axiosx Promise resolve/reject
```

这条链与 ChromePage 的共同点只有“跨上下文 + Promise correlation”；其消费者、执行点和权限目的不同。

## 11. axiosx 为什么存在？

事实上的用途是：**让网页业务代码借扩展 background 的能力执行 HTTP，并保持类似 axios 的调用体验。**

它与页面直接 fetch/axios 的区别来自扩展环境：
- background 执行真正 HTTP；
- 扩展可以拥有网页没有的 host 权限/CORS 能力；
- 页面只拿序列化后的结果；
- 还可以统一走旧 service bridge。

但 Legacy **没有发现** Current P1 那样的应用层模型：

```text
source document A
+ capability
+ exact target origin B
+ grant incarnation
+ request digest
+ durable effect state
```

所以不能把旧 axiosx 写成“原本就有跨 origin authority”。

## 12. Legacy HTTP 行为模型

### 真正发送者

background 里的 axios/service handler。

### headers / cookie / credentials

旧 HTTP 行为受 axios 默认/config 与扩展权限影响；本轮没有证据支持把它归纳成 Current 的 `credentials: omit` 或 manual redirect。两者必须作为迁移差异单独测试。

### timeout / cancel

旧 axios/config 可能支持部分 timeout，但没有发现统一跨 Page SDK → background → effect journal 的 durable cancel 模型。

### request identity

页面 bridge 有 eventId/callback correlation，但它不是 Current 的：
- stable requestId
- request digest conflict detection
- idempotent replay protection
- `effect_unknown`

### failure vs unknown effect

Legacy 没发现一个明确的持久状态来区分：
- 请求确定失败；
- 请求可能已对服务器产生效果，但结果丢失。

这正是 Current 新增 `effect_unknown / no replay` 有必要的事实依据。

## 13. AppStorage / AppLocal / chrome.storage 是三类事实

不要把它们全部写成“旧 storage”。

| Legacy API | 后台事实 | 生命周期 |
|---|---|---|
| `AppStorage` | background localStorage 风格 KV | 持久，值语义偏 String |
| `AppLocal` | background `globalThis[key]` 临时 KV | background 进程/运行时级，非 durable |
| BEX/chrome local helpers | `chrome.storage.local` | 独立存储机制 |

因此 Current 将 AppStorage 与 AppLocal 分别映射到 durable namespaced KV 和 `chrome.storage.session`，属于“保持用途、替换实现和生命周期合同”，不是 1:1 文件复制。

## 14. 下载 / artifact

在本轮固定 Legacy `src-bex` 中，没有发现 Current 那种通用：

```text
run
→ result
→ artifact bytes/hash
→ export job
→ download attempt
→ chrome.downloads receipt
→ reconcile
→ Blob/resource release
```

因此不能说“Legacy download lifecycle 已直接迁移”。

如果某个旧业务脚本通过 DOM、HTTP 或浏览器默认下载产生文件，那是业务行为；它不等于存在 framework-level artifact/download state machine。

## 15. Legacy 生命周期事实

| 场景 | Legacy 事实 |
|---|---|
| page method pending | 主要依赖内存 pendingEvents/callback |
| navigation | active tab + Chrome navigation/listener；无 exact document handoff |
| tab close | 未发现统一 durable operation retirement |
| stop | 存在业务/脚本停止意图，但未发现 Current 式“先持久 cancel fence，再 abort local wait”的统一机制 |
| timeout | 各方法/计时器局部处理；不是统一 durable deadline |
| disconnect | bridge/runtime 中断会影响在途 Promise；未发现统一恢复协议 |
| background/SW restart | AppLocal/global pending 等内存状态无法视为 durable；未发现通用恢复 |
| unknown external effect | 未发现显式 `effect_unknown` 状态和“不重放”合同 |

因此这些项目在映射表中不能简单写 ✓；必须逐行为判定。

## 16. 权限模型

Legacy 的权限边界主要来自：
- extension manifest permissions / host access；
- content script/injection 是否能进入页面；
- background 能否调用对应 Chrome API；
- 页面是否拿到了 bridge SDK。

这与 Current 的应用层 source/capability/target grant 不同。

**Legacy extension permission 是事实；Legacy single authority 不是事实。**

## 17. Legacy 真实消费者

本轮不是只 grep API 名。至少发现：

- `src-bex/controller/csdn.ts`
- `src-bex/assets/js/controller/csdn.js`
- `src-bex/assets/js/testMonkey.esm.js`
- background 中的脚本/controller 入口
- 页面注入后的 axiosx/AppStorage/AppLocal 调用面

因此 ChromePage 与 Page SDK 都有真实消费场景，不应被 Current 的新 API 外观替换后就宣布兼容完成。

## 18. Legacy 两条主线如何连接？

它们通过“脚本运行时”连接：

```text
一个控制程序
  ├─ 可调用 page.* 操作浏览器
  └─ 可调用 HTTP/storage 等 service

一个网页业务程序
  ├─ 可直接访问自己页面 DOM
  └─ 可通过 SDK 请求 background service
```

旧 raw `executeScript` 还允许页面触发后台控制代码，这把两条主线进一步连接起来。

Current 是否继续允许“网页提交任意后台脚本”是安全/兼容决策；**不能因为 Current 拒绝 raw background eval，就说 Legacy 没有这个能力。**

## 19. Legacy 能力总表

| 能力 | Legacy |
|---|---|
| ChromePage | 有，核心自动化 facade |
| ChromeContext | 本轮固定源码未发现 |
| BrowserContext | 本轮固定源码未发现 |
| PageProxy | 本轮固定源码未发现 |
| Puppeteer API 风格 | 有 |
| Puppeteer/CDP 内核 | 未发现 |
| navigation | 有 |
| click/type/wait | 有 |
| evaluate/eval | 有 |
| screenshot | 有 |
| upload | 有 |
| cookies | 有 |
| frame-aware exact identity | 未发现 Current 等价模型 |
| axiosx | 有 |
| AppStorage | 有 |
| AppLocal | 有 |
| requestResource / utility | 有 |
| raw background script execution | 有 |
| requestId/digest authority | 未发现 |
| durable cancellation barrier | 未发现 |
| effect_unknown/no replay | 未发现 |
| task-linked artifact/download state machine | 未发现 |

## 20. Legacy 证据边界

本文结论是**源码事实恢复**，不是“旧扩展在 Chrome 2026 仍能跑”的声明。manifest/API 时代差异、Chrome API deprecation、旧服务端依赖均需要另行运行验证。

若之后能读取用户本机 `todo-user-vue/src-bex`：
1. 先对 Git SHA/工作区 diff；
2. 对本文件涉及的 ChromePage、background、content、core SDK 文件逐项复核；
3. 有本机差异时，以本机旧源码优先修正本文，而不是强行保持 GitHub 版本。
