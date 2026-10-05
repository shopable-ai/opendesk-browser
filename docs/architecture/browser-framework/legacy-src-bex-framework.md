# Legacy src-bex：从用户调用恢复旧框架

> SOURCE-CONFIRMED / 静态分析。Legacy 固定为 `shopable-ai/todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5`。没有在当前 Chrome 重跑旧扩展，不声明其 manifest、权限或执行机制今天仍可直接运行。
> 先阅读 [语义入口](README.md)，不要先按文件目录理解产品。

## 1. 旧框架是什么

旧系统是一个混合宿主能力框架：用 `ChromePage` 编写自动化，用页面 SDK 请求后台服务，并包含脚本启动、环境注入、业务控制和设备运行的多种入口。

核心不是 `background.ts` 这个文件，而是三种不同的请求：

| 请求 | 普通话含义 | 典型旧调用 |
|---|---|---|
| 页面操作 | 替我读取/操作一个目标页面 | `await page.title()`、`await page.click('#search')` |
| 宿主服务 | 页面请扩展帮忙做一件服务工作 | `await axiosx.get(url)`、`await AppStorage.getItem(key)` |
| 启动脚本 | 把一整段自动化程序交给某个运行环境 | 页面 `executeScript(code)`、脚本管理 UI 的运行入口 |

“启动脚本”不是第三套 Page API，也不等于“请求服务”。它会在运行期间多次调用前两类能力。

## 2. 语义场景 L1：后台控制程序操作页面

旧后台初始化引入 `ChromePage` 与导出的 `page`，并暴露全局 Page。示例是在这个具备 Page 的宿主里调用，不是任意网页主世界里都能调用：

```js
const title = await page.title();
console.log(title);
```

```text
控制程序在宿主运行
→ ChromePage.title
→ evaluate(document.title)
→ _execute 注册 pendingEvents[eventId]
→ Chrome 分支查询 active tab
→ 旧 chrome.tabs.executeScript({ code })
→ 页面执行并发送 operationCompleted
→ 宿主查找 eventId，完成 Page 方法的 Promise
```

另外存在 CAPACITOR/WebView 分支：`webView.evaluateJavascript` 与 `AndroidPage.operationCompleted`。这是旧抽象的多宿主意图，不证明新浏览器扩展已支持 Android。

### 值得保留的语义与不能保留的假设

| API | 实际语义 | 判断 |
|---|---|---|
| title / url | 读标题、地址 | 读语义合理，目标选择机制需替换 |
| content | `document.body.innerHTML` | 不是完整 document HTML |
| goto / reload | 导航/刷新与等待意图 | 旧 goto 完成监听未限定本次目标；reload 的参数不等于都得到实现 |
| $ / $$ | 序列化 outerHTML 后在宿主解析快照 | 不是真实浏览器 live ElementHandle |
| waitForSelector 返回 ChromeElement | 将 selector 与 page 包装成后续操作对象 | 需要新增固定文档绑定，避免旧对象跨导航误用 |
| click / type | 合成 DOM 事件；type 追加值 | 不等价真实硬件输入或完整 Puppeteer 行为 |
| Keyboard | 向 document 派发合成键事件 | 旧注释已说明 Backspace 不能完成真实编辑 |
| evaluate(function) | 在目标上下文计算并返回结果 | 需求保留，字符串与运行权限分道改造 |

来源：[ChromePage.ts](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts)，重点 `title`、`goto`、`evaluate`、`_execute`、`operationCompleted`、`ChromeElement`、`Keyboard`。

## 3. 语义场景 L2：网页自己请求扩展服务

前提：旧 SDK 已被成功注入相应网页上下文，相关 relay 和后台均可用。

```js
const response = await axiosx.get('https://api.example.test/status');
console.log(response.data);
```

URL 是说明用占位符，不是运行验收输入。其意图是让网页获得后台 HTTP 结果，不是让后台运行整份网页脚本。

```text
网页业务程序 / 网页 DevTools
→ axiosx.get
→ callChromeBridgeInterface('AXIOS_GET', ...)
→ ChromeBridgeEvents[eventId] 保存页面 Promise 的回调
→ CustomEvent('CHROME_BRIDGE_INTERFACE')
→ assets/js/custom_event.js 转为 chrome.runtime 消息
→ background 去除 hid_ 前缀并分发
→ handleChromeBridgeInterface → axios.get
→ ChromeBridgeCallBack
→ executeScriptInCurrentPage（再次选择活动 tab）
→ 在页面调用 ChromeBridgeOperationCompleted
→ 对应 Promise resolve / reject
```

重要定位：`callChromeBridgeInterface` 定义在 `axiosx.js`，不是 `brige.js`；监听并转发 DOM 自定义事件的是 `custom_event.js`，不是单凭 `my-content-script.ts` 文件就能说明 relay 已完成。

### 三种旧存储不能合称一个 Storage

| 外观 | 后台实际存储 | 返回/生命周期意图 |
|---|---|---|
| AppStorage | 后台 localStorage | String 值，持久；旧 clear 可以清空整个后台存储区 |
| AppLocal | 后台 globalThis[key] | 临时值，可能与后台其他全局状态冲突 |
| BEX `bridge.send('storage.*')` | chrome.storage.local | 独立 Quasar 通信链；不能与前两者混写 |

来源：[axiosx.js](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/core/axiosx.js)、[brige.js](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/core/brige.js)、[custom_event.js](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/custom_event.js)、[background.ts](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/background.ts)。

## 4. 语义场景 L3：网页让后台启动一段控制程序

```js
// 只解释 LEGACY 接口，不是新框架执行建议。
executeScript('console.log(await page.title())');
```

```text
网页 brige.js 的 executeScript = executeInBg
→ CHROME_PAGE_EXECUTE 的 detail.script
→ custom_event.js
→ background.handleChromePageExecute
→ background.executeScript
→ wrapAsync + eval
→ 控制代码里的后台 page 操作目标页面
```

这里存在两个同名但职责不同的 `executeScript`：页面函数负责发事件，后台函数负责运行代码。只列函数名无法解释框架。

**整段启动没有可靠的业务结果 Promise。**页面 `executeInBg` 不返回业务完成结果；后台 `executeScript` 内部 `eval(action)` 也未将其结果作为整段执行的可靠返回协议传播。runtime 的 `Processed message successfully` 是消息处理 ACK，不是脚本中所有异步工作完成，更不是业务成功。

因此不能写成：`await executeScript(...)` 已证明得到整段脚本结果。Page 方法自身的 Promise 只是里面某一次操作的结果。

新框架取舍：KEEP 启动自动化的使用需求；REPLACE 运行宿主与结果协议；DROP 普通网页任意调用高权限后台 eval 的机制。

## 5. 语义场景 L4：脚本保存与运行按钮——本轮补查消费者

用户描述的“保存脚本、点运行”是必需使用场景，但“保存在哪里、点哪个按钮、实际发给谁”必须继续拆分。

| 已查到的入口 | 源码事实 | 不能据此推断 |
|---|---|---|
| `src/modules/operate/views/script.vue` | 有脚本 content/params 等编辑，保存调用 `service.app.operate.script.add/update` | 不是证实扩展本地脚本数据库 |
| `src/modules/operate/views/app/scripts.vue` | 脚本列表通过 `serviceApi.page` 获取；按钮 `onRun` 调 `http://localhost:60844/SCRIPT_RUN` | 不是证实按钮在目标业务网页内，或执行器一定是扩展后台 |
| `src/modules/operate/utils/UtilScrpt.ts` 的 onRun / doRun | HTTP 本机或局域网设备运行分支 | 不是 Chrome runtime transport |
| 同文件 doRunSend | 调 `service.app.operate.script.run({deviceId,scriptId,params,userId})`，注释说明服务端触发 WebSocket | 未检查服务端，不能宣称端到端设备分发通过 |
| `src-bex/background.ts` 的 SCRIPT_RUN listener | Socket 收到脚本后调用后台 executeScript | 证明接收端代码存在，不证明它与上面每个 UI 分支在当前部署闭合 |

来源：[script.vue](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src/modules/operate/views/script.vue)、[app/scripts.vue](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src/modules/operate/views/app/scripts.vue)、[UI UtilScrpt.ts](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src/modules/operate/utils/UtilScrpt.ts)。

本轮结论：脚本资产与运行入口有真实消费者；“扩展本地保存 → 目标网页内点击按钮 → 运行固定脚本”的精确旧闭环仍未在这些路径中完整证实。保留为待定位场景，不说不存在，也不编造已实现。

## 6. 注入层原来解决什么问题

`my-content-script.ts` 将 bridge、common、axiosx、AppStorage、AppLocal、utils、公共库、Env 和特定站点 app scripts 放进页面。目的：让网页业务程序获得一致的 SDK、依赖和宿主服务，而不是要求每个页面重新实现 Chrome 通信。

它混合了四种不同责任：SDK 引导、公共依赖、环境配置、具体业务启动。新框架分别承接为固定 SDK 安装、受限资源依赖、非敏感公开配置、可选 Feature。不能复制全部旧注入清单；远程文本获取后当 JS 执行的路径不进入通用服务。

来源：[my-content-script.ts](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/my-content-script.ts)。

## 7. 背景页的责任分类

| 旧责任 | 目标归属 | 处理原则 |
|---|---|---|
| message dispatcher / bridge envelope | Framework protocol + routing | 统一格式、错误与相关性，不负责再次授权 |
| HTTP / storage 服务合同 | Framework services | 保留公开语义；执行移交 driver/repository |
| tabs / windows / cookies / notifications | Platform Driver | 原生 API 与效果观察；仅在相应能力批准下运行 |
| Page 操作与脚本执行 | Automation + Runtime | 固定操作与用户代码分道，目标显式化 |
| 环境与依赖注入 | Runtime bootstrap / resource contract | 分离公开数据与执行代码 |
| CSDN、VIP、账号、TimeReview | Legacy Business Logic / 可选 Feature | 不作为核心 Framework 的启动依赖 |
| 设备、HID、远程 Socket 控制、代理设置 | Excluded Scope / 明确延期适配 | 本轮不迁入产品，不静默打开权限 |

## 8. 两套能力怎样重叠，哪里会失败

它们共享后台宿主及活动标签假设，但分别使用 `pendingEvents` 与 `ChromeBridgeEvents`。前者完成 Page 方法，后者完成网页服务调用；两者都不构成持久执行账本。

| 判断点 | 旧事实 | 最小应发现的错误 |
|---|---|---|
| 目标 | _execute 和 callback 都可能重新选 active tab | A 发请求后切到 B，操作或回调去错页面 |
| 导航 | Page 方法没有统一文档身份 | 同 tab 新文档收到旧操作或旧结果 |
| 相关性 | eventId 与内存 Map | 丢消息后悬挂、重启后丢失；Map 不是恢复机制 |
| 清理 | Page 完成会删除 pending；bridge 完成路径未删除公共表项 | 页面长期调用导致回调残留 |
| 数据 | 某些完成包装使用 `data || {}` | 0 / false / 空字符串被改变 |
| 错误 | 部分 axios catch 吞错，外层 catch 只日志 | 失败看似 undefined 成功，或 Promise 永不完成 |
| 权限 | 网页事件细节进入 privileged handler | 未区分来源文档、目标权限与请求能力 |
| 完成 | ACK、单操作 Promise、整段脚本混用 | “运行成功”提示不能证明业务目标完成 |

## 9. 迁移结论

保留旧系统的“脚本可复用、页面可操作、网页可请求宿主服务”三个需求。替换 active-tab/global page、公开回调权威、无限等待和后台任意字符串执行。

先从场景定义语义，再查实现是否满足语义，最后做真实浏览器验收。不能因为接口名字像 Puppeteer、按钮叫运行、manifest 写 MV3，就宣称能力已正确实现。
