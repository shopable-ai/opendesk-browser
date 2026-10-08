# 旧框架：技术方案、文件职责与真实调用链

> 旧版固定来源：`shopable-ai/todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex`。
> 本文只写旧源码事实；没有运行旧扩展，也没有读取到用户 Mac 上的未提交源码。场景编号与[功能对照](legacy-to-target-map.md)对应。

## 一、旧框架的整体关系

旧系统将三类事情放在同一扩展工程中：用 ChromePage 编写浏览器自动化；向网页注入增强脚本；让网页通过 SDK 请求后台 HTTP、存储和其他服务。

```text
控制程序／后台生成的脚本
  → 后台共享 page → ChromePage → 浏览器 API／页面脚本 → 网页

内容脚本的环境配置
  → 注入 core SDK、公共库、站点业务脚本 → 网页增强与事件监听

网页业务代码
  → axiosx / AppStorage / AppLocal
  → DOM 自定义事件 → 内容脚本转发 → 后台服务 → 网页回调

网页 executeScript(code)
  → 另一类 DOM 自定义事件 → 后台启动控制代码 → 可再调用 page
```

ChromePage 是 Puppeteer 风格的接口封装，不等于 Puppeteer 执行内核。已核对的 `src-bex` 中没有确认到 ChromeContext、BrowserContext、PageProxy 对象或 CDP 会话内核；不能从类名相似反推这些结构存在。`ChromePage.ts` 还保留 CAPACITOR/WebView 分支，是另一宿主路径，不证明当前 Chrome 构建运行过它。

## 二、技术与文件职责清单

| 技术／方案 | 具体文件与函数 | 解决什么问题 | 运行位置与边界 |
|---|---|---|---|
| Page 接口封装 | `ChromePage.ts`：ChromePage、ChromeElement、Keyboard | 以 page 方法组织页面操作 | 后台／支持的宿主；不是任意网页都自动有 page |
| 共享页面对象 | `ChromePage.ts` 末尾 `const page = new ChromePage()`；导出并挂全局 | 控制代码访问统一 Page | 共享对象，不是固定 tab/document 会话 |
| 字符串脚本注入 | `ChromePage._execute` | 把动作送进浏览器页面 | Chrome 分支调用旧 `tabs.executeScript` |
| 活动标签选择 | `_execute`：`tabs.query({active:true})` 后排除扩展页并取首项 | 动态决定执行页 | 没有 `currentWindow:true`；没有固定 document 身份 |
| 单操作回调 | `pendingEvents`、`operationCompleted`、`handleMessage` | 跨上下文完成一个 Page 方法的 Promise | 内存 Map；不是持久任务记录 |
| 页面 MAIN 代码 | `eval → addScriptTag → evaluate` | 访问页面环境变量、插入脚本 | 以 DOM script 元素执行；与注入脚本所在环境不同 |
| SDK 装载 | `my-content-script.ts`：`appendScript`、`initData` | 向网页放入 core SDK 和业务依赖 | 内容脚本操作 DOM；装载不等于每个依赖已就绪 |
| 页面服务门面 | `assets/js/core/axiosx.js`：axiosx、callChromeBridgeInterface | 页面发起异步服务请求 | 页面 globals；不是 ChromePage |
| DOM 事件转发 | `assets/js/custom_event.js`：CustomEventDetector.messager | 页面消息转为扩展消息 | `chrome.runtime.sendMessage`；给事件类型加 `hid_` |
| 后台服务分发 | `background.ts`：handleChromeBridgeInterface | 方法名路由到 HTTP、KV 等能力 | 后台特权环境 |
| SDK 回程 | `background.ts`：ChromeBridgeCallBack、executeScriptInCurrentPage；`core/brige.js`：ChromeBridgeOperationCompleted | 把服务结果送回页面 Promise | 再次选择活动页；并非始终回原来源文档 |
| Quasar BEX 服务桥 | `bexContent`、`bexBackground`、bridge.send/on | 内容脚本／Quasar 应用调用服务 | 与 core SDK 自定义事件链不同 |
| 整段控制脚本启动 | `core/brige.js`：executeInBg；`background.ts`：handleChromePageExecute、executeScript | 从页面提交控制代码 | 后台 `wrapAsync` 后 `eval`；不等于 Page.evaluate |

## 三、场景01／02：控制程序导航并读取页面

### 1. 读标题：单操作完整去回程

入口可以是后台已有控制代码调用 `await page.title()`。这里只把它作为已存在 API 的使用示例，不将示例冒充已找到的业务脚本。

```text
控制代码调用 page.title()
→ ChromePage.ts：title()
→ evaluate(() => document.title)
→ 生成 eventId，拼接函数、参数和完成回调
→ _execute(functionString, eventId)
   → pendingEvents.set(eventId, {resolve,reject})
   → chrome.tabs.query({active:true})
   → 排除 chrome-extension:// 页面，取第一个候选
   → chrome.tabs.executeScript(tab.id, {code:functionString})
→ 目标页读取 document.title
→ 注入代码 chrome.runtime.sendMessage({action:'operationCompleted',eventId,result})
→ ChromePage.handleMessage → operationCompleted
→ JSON 解析 PageBrigeCode/message/data
→ 完成本次 Promise，清理该 Page pending 项
```

源码：[Page 与回调](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts#L24-L152)、[evaluate 与实际执行](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts#L989-L1066)。

### 2. goto：必须按源码记录，不能写成 tabs.update

```text
page.goto(url)
→ ChromePage.goto 创建 navigationPromise
   → 注册 chrome.tabs.onUpdated 监听与 timeout
→ 构造 `window.location.href = "...";`
→ await this.eval(code)
→ eval 发现代码包含 '='
→ addScriptTag({content:code})
→ evaluate(负责创建 script 元素的函数)
→ _execute → 选择活动页 → tabs.executeScript
→ 页面 DOM 插入 script → 页面代码设置 window.location.href
→ tabs.onUpdated 收到 status === 'complete'
→ navigationPromise resolve；goto 返回该 Promise
```

准确限制：完成监听没有用本次 tabId/url 做过滤；`waitUntil` 被读取但实际监听判断仍是 complete；传入 timeout=0 会被 `timeout || 30000` 改为默认值。`goto` 还要先等 `eval` 路径返回，因此不能把 navigationPromise 自己的超时简化成整个调用必然可靠结算。

源码：[goto 190—225 行](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts#L190-L225)、[eval 930—986 行](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts#L930-L986)。

## 四、场景03／04：点击、输入、等待和执行页面 JS

| 用户动作 | 实际 API 与后续调用 | 旧行为，而非推定行为 |
|---|---|---|
| 点击 | `click → _execute → 页面 querySelector/dispatchEvent → 完成消息` | 合成 mousedown/up/click 或对应按钮事件；正常返回 `clicked` |
| 输入 | `type → _execute → element.value += char → 键盘/输入事件` | 逐字符追加，不是默认替换；正常返回 `Typed` |
| 等待元素 | `waitForSelector → _execute → requestAnimationFrame 检查 → 回调 → new ChromeElement(page,selector)` | 元素包装的是 selector 与 page，不是浏览器 live node handle |
| 等待函数 | `waitForFunction → _execute → predicate/polling → 回调` | 局部 timeout，未确认通用跨任务取消合同 |
| 等待时间 | `waitForTimeout → setTimeout` | 在调用宿主等待；不是页面修改 |
| 读取单／多元素 | `$ / $$ → evaluate(outerHTML) → 宿主 document 解析` | 返回克隆 DOM 快照，不是原页面节点 |
| 元素上执行函数 | `$eval / $$eval → evaluate → 页面 new Function → 执行用户函数` | 使用函数源码字符串；不能保留宿主闭包 |
| evaluate(function) | `evaluate → _execute → async IIFE await fn → 完成消息` | 正常返回计算值；没有统一包装所有执行异常的 catch |
| evaluate(string) | `字符串语句 + 完成回调` | 与函数返回值模式不同；正常完成回调给 true |
| eval(string) | 含 '=' 时注入脚本；否则借隐藏 chromeextension 元素传值 | 以字符猜测代码用途，有单独页面环境读写路径 |

源码：[DOM 快照及元素函数](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts#L228-L339)、[点击输入等待](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts#L614-L804)。不能从正常回程推导“任何抛错、导航、tab 关闭都保证 Promise 结算”。

## 五、场景05：网页请求后台 HTTP

### 1. 请求路径

```text
网页代码 axiosx.get(url, config)
→ core/axiosx.js：get
→ callChromeBridgeInterface('AXIOS_GET', {BridgeUrl_Inject:url,config})
→ 生成 eventId，在 ChromeBridgeEvents 保存 resolve/reject
→ window.dispatchEvent(CustomEvent('CHROME_BRIDGE_INTERFACE', detail))
→ assets/js/custom_event.js：CustomEventDetector.messager
→ chrome.runtime.sendMessage({type:'hid_CHROME_BRIDGE_INTERFACE',detail,...})
→ background.ts 消息分发
→ handleChromeBridgeInterface
→ axios.get(api, data.config)
→ HTTP 由后台 axios 发出
```

### 2. 回程不是简单的 sendResponse

```text
后台得到 res
→ ChromeBridgeCallBack(BridgeEventId,res)
→ 包装 PageBrigeCode/message/data，JSON + Base64
→ executeScriptInCurrentPage
→ chrome.tabs.query({active:true})，向 tabs[0] 注入回调脚本
→ script 元素在页面调用 ChromeBridgeOperationCompleted
→ core/brige.js 查 ChromeBridgeEvents[eventId]
→ 解析并 resolve(data) / reject(message)
```

来源与结果关联依赖事件 ID，但回程重新选活动标签。四类 AXIOS 分支的 `.catch(e => {})` 会吞掉 axios 异常；所以“服务请求失败必定让网页 Promise reject”不是可靠的旧合同。页面回调 Map 与 ChromePage.pendingEvents 是两套对象，不应混为一个。

旧源码未展示来源 A、能力、精确目标 B、授权代次、持久请求摘要组成的应用层授权系统。扩展权限与这条服务桥确实存在，但不能把二者解释成更强的安全模型。

源码：[axiosx 与请求封装](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/core/axiosx.js)、[事件转发](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/custom_event.js)、[后台 HTTP](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/background.ts#L102-L151)、[回程注入](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/background.ts#L704-L737)、[页面结算](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/core/brige.js)。

## 六、场景06—08：存储与工具服务

| 能力 | 入口／调用关系 | 最终存储或执行点 | 生命周期／值语义 |
|---|---|---|---|
| AppStorage | `appStorage.js → callChromeBridgeInterface(APPSTORAGE_*) → handleChromeBridgeInterface` | 后台 localStorage | String 风格；clear 清空该后台存储区 |
| AppLocal | `appLocal.js → APPLOCAL_* → handleChromeBridgeInterface` | 后台 globalThis[key] | 后台运行时变量；与其他全局属性共用空间 |
| local helpers | `chrome-local-storage-api.js` 的 get/save/remove | chrome.storage.local | 原生存储回调转 Promise |
| BEX storage.* | 内容脚本 bridge.send → background 的 bridge.on | chrome.storage.local | 独立于以上 CustomEvent 请求链 |
| log/getTime | BEX bridge.send/on | console.log / Date.now | 这里是服务事件名；未据此证明网页存在同名 global 函数 |
| bexUrl | 内容脚本 `initData → bridge.send('bexUrl')` | 后台按 location 得扩展根 URL | 返回 `{url}` |
| requestResource | `appendScript → requestResourceByBridge → bridge.send` | 后台 fetch(url).text() | 返回 success/data 或 success/error；可供装载远程脚本内容 |

源码：[BEX 服务及资源](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/background.ts#L808-L1003)、[内容脚本消费者](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/my-content-script.ts#L74-L210)。普通页面自己的 localStorage、后台 localStorage、chrome.storage.local 必须分别记账。

## 七、场景09—11：截图、上传、Cookie 和下载

| 能力 | 源码路径 | 行为与限制 |
|---|---|---|
| 截图 | `ChromePage.screenshot → screenshotInChrome → tabs.query → captureVisibleTab` | 可见页 data URL；另一分支调用 webView.capturePicture；无统一产物记录 |
| 上传 | `uploadFile → _uploadFromBlob/_uploadFromDataUrl/_uploadFromUrl → evaluate` | FileReader 或 fetch 获取字节，再用 DataTransfer/File 设置 input.files 并派发 change；固定文件名/type；ArrayBuffer 分支接入 FileReader 的实际兼容仍需验证 |
| Cookie 读 | `cookies → permissions.contains → chrome.cookies.getAll`，否则 `_getDocumentCookies → evaluate(document.cookie)` | 两种执行机制；源码 getAll 传 `{urls}` 的实际 API 行为未运行验证 |
| Cookie 写删 | `setCookie/deleteCookie → eval(document.cookie=...)` | httpOnly 写入被忽略；catch 后记录日志；deleteCookie 还修改输入对象 |
| 业务下载 | 页面 controller 的 `downloadFile → a.href/download → a.click()` | 有下载用途，不等于存在通用任务产物、下载回执状态机 |

源码：[Cookie](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts#L470-L611)、[截图上传](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts#L819-L919)、[业务下载辅助函数](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/controller/csdn.js#L455-L463)。

## 八、场景12／13：装载页面脚本，或者启动整段控制程序

### 页面增强装载

```text
my-content-script.ts：bexContent
→ 等待 document.body → initData
→ bridge.send('bexUrl')、jQuery(document).ready
→ appendScript 装入 core SDK、公共库及环境
→ 读取 assets/env.json
→ 根据 APP_ENV/isClient 选择 app_script 等业务脚本
→ 页面脚本可修改 DOM、增加交互
```

`appendScript` 对扩展 URL 设置 script.src，对远程 URL 请求 BEX requestResource 后写 script.textContent。多个调用顺序不能当作每个脚本 load 已完成。环境分支是实际装载机制，但不能据此宣称具备任意脚本安装、启停、匹配元数据的通用管理器。

### 页面启动控制程序

```text
网页 executeScript(code)〔别名 executeInBg〕
→ core/brige.js：executeInBg
→ CustomEvent('CHROME_PAGE_EXECUTE', {script})
→ custom_event.js → chrome.runtime.sendMessage
→ background.ts：handleChromePageExecute
→ executeScript(str)
→ wrapAsync(str)
→ eval(action)
→ 控制代码可以再调用后台共享 page
```

页面门面没有返回整段程序结果 Promise。后台虽然函数声明 async，但 `eval(action)` 没有 return/await 其结果；“消息已收到”“包装函数返回”“整个程序结束”不是同一时刻。

源码：[后台启动入口 402—418 行](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/background.ts#L402-L418)、[页面入口 brige.js](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/core/brige.js)。

## 九、旧生命周期与实际消费者边界

Page 方法的内存 pendingEvents、网页 SDK 的 ChromeBridgeEvents、后台临时全局值、BEX 服务回调，是不同生命周期对象。已查源码未建立统一的整段任务取消屏障、tab/document 退役、后台重启恢复或“外部效果未知不得重放”记录。没有确认不等于业务从未有过停止需求；不能把 socket disconnect 或业务计时停止当作框架统一 cancel。

消费者记录必须区分：

| 线索 | 可确认的内容 | 不能确认的内容 |
|---|---|---|
| background 中生成 page.evaluate 字符串并 executeScript | 存在实际自动化调用意图和启动路径 | 不证明所有 Page 方法都有业务消费者 |
| my-content-script 的 bexUrl/requestResource 调用 | 已定位真实服务调用者 | 不证明所有服务名都暴露为网页 global |
| 页面 CSDN controller | 有业务桥与下载函数；某些 axiosx 语句位于提前 return 之后 | 不能直接把不可达 axiosx 语句算有效消费者 |
| controller/csdn.ts | 有直接 axios 的后台服务 | 不能因文件名是 controller 就算 ChromePage 消费者 |
| assets/js/testMonkey.esm.js | 有注入路径线索；本次内容读取未返回有效代码 | 不列为已确认可运行的 ChromePage 回归脚本 |
| 未取得的远端脚本、本机未提交脚本 | 待补来源 | 不由测试样例代替 |

源码中的 manifest 声明、旧 API 和后台环境用法还需要实际构建核验；本文不保证旧扩展在本次浏览器环境可直接运行。
