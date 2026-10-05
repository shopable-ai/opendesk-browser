# OpenDesk Browser Framework：先理解怎么用，再理解怎样实现

> 文档类型：框架语义与导航入口。更新：2026-10-05。
> CURRENT 是固定源码的静态事实，不是本轮浏览器验收结果；TARGET 是后续设计建议，不能当成已经存在的公开 API。本文不改变产品权限、owner、兼容合同或测试通过状态。

## 1. 最重要的框架：两个用法，六个责任

OpenDesk Browser 要解决两种事情：

**用法 A：把一份自动化脚本保存起来，在明确的网页上运行，取得本次结果。**

**用法 B：网页里的程序需要 HTTP、扩展存储等能力，通过 SDK 请求扩展提供受控服务。**

两者可以组合，但网页请求一个服务，不等于启动一整份自动化脚本；网页点击按钮，也不等于用户已授予扩展权限。

```text
用法 A：保存脚本 → 选择脚本版本、参数、目标网页 → 点击运行
        → 创建一次受控运行
        → page 读写网页；axiosx / AppStorage 等请求服务
        → 返回本次结果，或明确失败、停止、效果未知

用法 B：网页按钮 / 网页 DevTools / 网页业务程序
        → 调用已安装且获准的 Page SDK
        → 扩展执行一项服务
        → 结果回到原来源文档的本次 Promise
```

| 责任 | 用普通话解释 | 不是它的责任 |
|---|---|---|
| 脚本资产 | 保存哪份程序、哪个版本、需要什么参数 | 保存成功不是已经执行 |
| 触发入口 | 用户在哪里选择并启动任务：扩展工具、页面按钮、控制台 | 入口外观不证明执行位置或权限 |
| 运行管理 | 为本次执行建立身份、固定版本与目标，管理停止和结果 | 不在高权限后台直接 eval 任意外来字符串 |
| Automation API | `page.title()`、`page.click()`、`page.type()`：操作目标网页 | 不是页面加载 SDK 后自动获得的后台 Page 全局对象 |
| Page SDK / 服务能力 | `axiosx.get()`、`AppStorage.getItem()`：请求宿主服务 | 不是任意后台函数调用接口 |
| 共同底座 | 授权、真实调用者、固定目标、通信、状态与执行事实 | 不以 UI 颜色或内存回调表代替事实 |

这些是逻辑责任，不要求创建六个项目、六个数据库或新的执行引擎。实际文件对应见 [CURRENT / TARGET](current-and-target-framework.md)。

## 2. 第一组语义调用：运行一份自动化脚本

### A1：读取目标网页标题

**需求：** 用户选中一个网页，运行“读取标题”，得到那个网页的标题。

下面是当前 Controller 脚本正文示例，应放在扩展的脚本编辑器中保存并运行，不是直接粘贴到任意网页控制台的初始化代码：

```js
const title = await page.title();
return { title };
```

| 问题 | 答案 |
|---|---|
| 谁触发？ | 用户在扩展工具中运行已保存版本 |
| 脚本在哪里？ | Controller 脚本资产；运行固定已提交版本 |
| 程序在哪里执行？ | 受控 Controller Worker；不是目标网页主世界 |
| 标题在哪里读取？ | 对应固定目标文档内的包内操作执行器 |
| `page` 是什么？ | 当前运行注入的目标网页代理，不是某个活动标签的别名 |
| 成功怎么看？ | 本次运行的实际返回值，且来自指定文档 |
| 失败怎么看？ | 目标过期、撤权、停止等明确拒绝；不能改读另一张活动页 |

[源码：运行入口](../../../src/run-host.js)、[Worker 注入参数](../../../src/scripting/sandbox/worker-runtime.js)、[Page API](../../../src/framework/ChromePage.js)、[固定读取操作](../../../src/scripting/packaged/registry.js)。

### A2：填写搜索条件并读取结果

适用于用户有权操作的测试表单；选择器是示例，测试页面需提供对应元素。

```js
await page.waitForSelector('#query');
await page.type('#query', 'OpenDesk');
await page.click('#search');
await page.waitForSelector('#result');
return await page.snapshot('#result');
```

语义：等待输入框 → 追加输入文本 → 点击搜索 → 等待结果元素 → 返回可序列化快照。

限制：当前 `type` 是追加而非替换；`click` 是合成 DOM 事件；元素出现不自动证明业务响应新鲜或搜索成功。复杂页面仍需对应业务断言。不能宣传为真实键盘鼠标、完整 Puppeteer 兼容或任意页面通用脚本。

## 3. 第二组语义调用：网页请求扩展服务

### B1：网页请求一个 HTTP 接口

**前提：** 扩展已经给来源网页 A 的精确文档安装 SDK，并批准相应能力；访问额外目标 B 还需要应用层目标批准和必要原生权限。

下面是网页主世界的示例，可放在该网页按钮处理函数中，也可在 DevTools 选中该网页上下文后调用。URL 是说明用占位地址，替换为有权使用的测试接口。

```js
const sdk = globalThis.OpenDeskSDK;
if (!sdk) throw new Error('请先在扩展工具中为本网页安装并授权 SDK');
await sdk.ready();
const response = await sdk.axiosx.get('https://api.example.test/status');
console.log(response.status, response.data);
```

语义：网页请扩展代表它访问一个已批准的目标，然后等这次服务结果。`ready()` 可能复用之前的 Hello，不是持续授权证明；每次真实调用仍由后台核验。

区别：网页自己 `fetch()` 是网页网络调用；`sdk.axiosx.get()` 通过受控扩展服务。不能把后者宣传成无条件绕过网站权限、登录要求或所有网络限制。

### B2：网页保存一个设置

同样先安装 SDK，并批准 `storage.persistent`：

```js
await AppStorage.setItem('reportFormat', 'csv');
const format = await AppStorage.getItem('reportFormat');
console.log(format);
```

这不是保存一份可执行脚本，也不是写网站自己的 `window.localStorage`。当前实现是扩展提供的命名空间化持久 KV。`AppLocal` 则表示会话级临时值，不应写成持久保存。

[源码：SDK 安装与公开名称](../../../src/framework/sdk/entry.js)、[HTTP 外观](../../../src/framework/sdk/http.js)、[方法合同](../../../src/framework/sdk/registry.js)、[会话存储](../../../src/platform/storage/session.js)。

## 4. 旧 `executeScript` 必须独立讲清楚

旧网页在 bridge 已成功注入后，具有这样的调用意图：

```js
// LEGACY ONLY：只用于解释旧语义，不是新框架推荐执行入口。
executeScript('console.log(await page.title())');
```

实际含义不是“在这个网页原地执行括号里的代码”，而是：

```text
网页调用 executeScript
→ 发 CHROME_PAGE_EXECUTE
→ content-script relay
→ 扩展 background 执行传入的控制代码
→ 控制代码调用后台的 page
→ page 再去操作目标网页
```

而且旧网页 `executeScript` 只派发事件，不返回整份脚本的业务结果 Promise。写 `await executeScript(...)` 不能证明脚本执行完成。旧 `page.title()` 自己的 Promise 与“整份脚本完成”是两个层级。

新框架应该继承“方便启动自动化”的需求，而不是继承“任意网页向高权限后台提交任意代码”的实现。CURRENT 的 Page SDK 对原始脚本执行入口明确拒绝。TARGET 若增加页面运行按钮，应引用已经保存、固定版本且获准的脚本，通过可信确认或已有的限定调用许可进入运行管理；不能直接恢复旧 eval 通道。

[旧链与证据](legacy-src-bex-framework.md)。

## 5. 使用场景不是同一件事

| 场景 | 保存/触发/执行的正确区分 | 证据状态 |
|---|---|---|
| 扩展工具中保存脚本并运行 | 保存版本 → 选目标 → Controller → Page API → 结果 | 当前主线存在实现；本轮未运行验收 |
| 已安装 SDK 的网页 DevTools 调服务 | 网页上下文 → SDK → 扩展服务 → 原网页 Promise | 旧/新均有对应机制；需安装与授权条件 |
| 网页按钮调用 HTTP / Storage | 按钮只是 SDK 调用入口，不需要运行一整份 Controller | 候选受控示例已有按钮消费者 |
| 网页按钮启动已保存自动化脚本 | 按钮请求脚本 ID/固定版本/参数，由框架决定是否准入 | TARGET 场景；不能从已有 SDK 推断已实现 |
| 旧网页发送原始控制代码给后台 | 旧 executeScript / CHROME_PAGE_EXECUTE | 旧源码路径确认，新 Page SDK 拒绝 |
| 旧脚本管理 UI 的“运行”按钮 | 已发现本机 HTTP 和服务端设备分发路径 | 不等于已证明扩展本地保存、目标网页按钮闭环 |
| 页面加载时自动运行 | 需要明确的自动触发注册与撤销合同 | 本轮不新增；不能由注入代码存在推断支持 |

DevTools 不是一种特殊后台权限：网页控制台、扩展 Service Worker 控制台、隔离世界是不同执行上下文。普通网页 DevTools 不会仅因打开 F12 就获得扩展后台 `page`。

## 6. 什么叫“旧框架正确”？

必须分开三种判断：**需求模型合理**、**旧实现确实满足语义**、**在当前浏览器上可以安全运行**。第一项成立不自动推出后两项。

每个场景统一用一句话验收：

> 谁，在什么入口，用哪份代码/版本，对哪个目标，请求什么能力，应该获得什么结果；失败、撤销、导航和重试时允许发生什么？

例如 `page.title()`：目标是选择的网页，活动标签变化不能改变读取对象。SDK HTTP：结果必须回到原来源文档，后台 ACK 或网络已发出不能当成页面收到结果。保存脚本：保存后再次运行的是固定版本，不是悄悄换成最新内容。

这些问题先回答清楚，再阅读 authority、journal、transport 等内部实现。

## 7. 四份文档的职责与阅读顺序

| 文档 | 回答的问题 |
|---|---|
| 本 README | 框架怎么用？两个用法和关键语义是什么？ |
| [旧框架模型](legacy-src-bex-framework.md) | 旧调用到底经过哪里？哪些用户描述已证实，哪些尚未证实？ |
| [当前与目标](current-and-target-framework.md) | 当前已经接了什么？目标职责与验证怎么安排？ |
| [能力迁移地图](legacy-to-target-map.md) | 旧能力怎样保留、适配、替换、删除或延期？ |

Architecture 使用本目录作人工入口；Contracts/Invariants 继续归有效合同与源码 schema；Migration/Compatibility 继续使用 [机器账本](../../framework/source-compatibility-ledger.json) 和已批准的差异；Validation 继续使用实际 tests/evidence。本文不覆盖历史 evidence，不把候选文档整份自动批准为产品合同。

## 8. 审计基线与边界

Legacy：`todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5`。Current 主线产品源码：`opendesk-browser@6214b5e9132f58cbe0402a34973b7ee38c851d53`。P1 候选：`38763c78209794bec53c8ca848bfa0789dc4796e`，分支 `codex/p1-2-sdk-target-origins-20261004`。

与上一轮 `dc25c048...` 相比，该候选已增加 `src/ui/sdk-approval.js`、工具接线与受控页面示例。上轮“候选界面未接入”的描述只适用于旧候选，不能继续当现状。本轮只读源码与文档，不构建、不执行真实浏览器用例，不改机器账本完成标志。未能读取大型账本全文，不宣称所有内部符号已完整复核。

官方语义参考：[DevTools 执行上下文](https://developer.chrome.com/docs/devtools/console/reference#context)、[Content scripts / isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)。
