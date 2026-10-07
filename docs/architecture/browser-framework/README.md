# OpenDesk Browser：浏览器自动化与网页用户脚本框架

> 2026-10-05，架构定位修订。首先解释框架的浏览器能力与运行模型，再解释内部层次。
> LEGACY 是旧源码事实，CURRENT 是固定版本的实现事实，TARGET 是设计建议。设计写入不等于功能实现、独立审查通过或浏览器验收通过；本文不改变产品授权、执行 owner 或原有测试状态。

## 1. 一句话定位

**OpenDesk Browser 是以浏览器扩展为运行载体的浏览器自动化与网页用户脚本框架：通过 Puppeteer 风格的 ChromePage API 驱动网页，通过页面用户脚本增强网页，并为这些程序提供受控的浏览器与宿主服务。**

在产品层，它既可以承载油猴类脚本管理器，也可以承载浏览器自动化工作台。二者不是两个独立底座，也不意味着已经完整兼容 Tampermonkey 或 Puppeteer。

“保存脚本”和“请求一次 HTTP”不是足够完整的框架划分：前者是资产管理动作，后者是共享能力调用；它们没有说明程序如何操作浏览器，也遗漏了页面内用户脚本的运行与生命周期。

## 2. 核心模型：两类脚本运行方式，共享浏览器能力

```text
OpenDesk Browser：浏览器自动化 / 网页增强
│
├─ 产品与入口
│   脚本库、编辑/导入、启用/停用、匹配规则、工具栏、页面按钮、调试
│
├─ 控制脚本运行方式：从页面之外驱动浏览器
│   JavaScript 控制程序
│     → ChromePage / ChromeElement / Keyboard
│     → 定位、点击、输入、导航、等待、读取、页面计算
│     → 明确的 tab / frame / document
│   当前对应：Controller / RunHost / 固定操作与受控 userScripts 执行
│
├─ 页面用户脚本运行方式：在网页内部增强网页
│   已安装、启用并获准的脚本
│     → 匹配网址与注入时机，或手动触发
│     → 页面执行环境中的 document / DOM / 事件
│     → 增加按钮、修改界面、填写表单、监听页面变化
│   当前只存在部分机制与旧业务注入；完整通用管理闭环尚未证明
│
├─ 共享服务能力
│   HTTP、持久/会话存储、通知、资源、下载与所需浏览器服务
│   → axiosx / AppStorage / AppLocal 等 API 外观
│   → Page SDK 也可以供获准的普通网页业务程序调用
│
└─ 共同可信底座
    脚本版本与身份、来源和目标授权、消息协议、平台适配、运行状态与结果
```

这是逻辑职责图，不是要求每条调用按所有方框顺序执行。页面用户脚本可以直接访问其文档的 DOM；不应强迫它绕到后台再通过 ChromePage 操作同一个 DOM。需要扩展特权的请求才进入对应服务准入路径。

页面 SDK 是能力入口，不是第三种脚本运行环境。扩展工具、网页按钮、F12 是触发位置，也不是三套运行引擎。脚本不使用 HTTP 或存储时，仍然可以是完整的浏览器自动化或网页增强功能。

## 3. ChromePage 的准确角色：Puppeteer 风格的浏览器自动化 API

应保留用户熟悉的 Page / Element / Keyboard 编程模型：

```js
// 当前 Controller 脚本正文示例；运行前由工具绑定获准目标。
// 假设测试页具有 #query、#search、#result，且输入框最初为空。
await page.waitForSelector('#query');
await page.type('#query', 'OpenDesk');
await page.click('#search');
await page.waitForSelector('#result');
return { title: await page.title() };
```

语义：等待输入框 → 输入 → 点击 → 等待结果元素 → 读取目标标题。结果元素出现不等于业务查询成功，实际案例还要检查结果新鲜度与业务值。

| 能力族 | 代表接口 | 要保留的语义 |
|---|---|---|
| 页面与导航 | title、content、url、goto、reload | 对明确网页读取或导航 |
| 元素定位与读取 | $、$$、ChromeElement、snapshot | 明确快照与可操作对象的差别 |
| 交互 | click、type、Keyboard | 动作对象、返回值、等待与失败定义明确 |
| 等待 | waitForSelector、waitForFunction、waitForTimeout | 明确条件、超时、取消与文档失效 |
| 页面计算 | evaluate、$eval、$$eval | 在指定页面执行用户定义计算，而非高权限后台任意执行 |
| 浏览器资源 | screenshot、cookies、uploadFile 等 | 单项声明支持范围、权限和平台限制 |

**基于 Puppeteer 接口模型封装，不等于底层使用 Puppeteer 包或完整复刻其行为。**旧 `ChromePage.ts` 的 `_execute` 直接调用旧 Chrome API 或 WebView；不能仅因接口同名就声称使用 Puppeteer 执行引擎。

例如 Puppeteer 的 `Page.content()` 返回含 DOCTYPE 的完整 HTML，旧 OpenDesk `content()` 返回 body.innerHTML；旧 $/$$ 为 DOM 快照而非 Puppeteer live ElementHandle。迁移应记录这些差异，不静默破坏旧消费者。也不能因新 Puppeteer 有 locator 等接口，就默认本项目已有该接口。

Page 的绑定是浏览器上下文与受控目标，而不是当前活动标签的别名。可信导航可以更新 Page 的当前 document 身份；旧 document 的元素和在途操作不能因此自动得到新文档的权限。

源码：[Page API](../../../src/framework/ChromePage.js)、[Run context](../../../src/framework/context.js)、[固定 DOM 操作](../../../src/scripting/packaged/registry.js)、[旧 ChromePage](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/ChromePage.ts)。

## 4. 油猴类产品能力：不是只有“能运行一段 JS”

下面是标准用户脚本风格的**语义示例**。它展示目标产品体验，不代表当前 OpenDesk 已实现该元数据解析或 GM 兼容。

```js
// ==UserScript==
// @name         订单页统计按钮
// @match        https://example.test/orders*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  if (document.getElementById('opendesk-order-count')) return;
  const button = document.createElement('button');
  button.id = 'opendesk-order-count';
  button.textContent = '统计当前订单';
  button.addEventListener('click', () => {
    const count = document.querySelectorAll('#orders tbody tr').length;
    alert(`当前页面有 ${count} 条订单`);
  });
  document.body.append(button);
})();
```

完整语义是：安装并启用 → 打开匹配网页 → 在指定时机运行 → 网页出现按钮 → 点击时执行本页逻辑。脚本初始函数返回后，按钮和事件仍可存在；不能按一次短 RPC 已完成就认为页面脚本生命周期结束。

油猴类最小产品闭环应明确：脚本安装/保存与版本、启停、URL 匹配/排除、注入时机、frame 范围、执行世界、每文档实例、防重复注入、日志与错误，以及升级和卸载后的行为。

自动匹配执行必须基于预先批准的脚本与站点范围，不要求每次刷新都重新点运行，也不允许匹配规则本身自动授予特权。SPA 路由变化与完整文档导航须分开定义，不能默认每次路由变化重注入。

### 三项不同承诺

- **油猴类使用体验**：安装脚本后在匹配网页运行、增强网页。
- **用户脚本格式/GM API 兼容**：@match、@run-at、GM.* 等逐项合同与兼容测试。
- **完整生态兼容**：现有第三方脚本、依赖、更新与执行世界行为的兼容。

第一项可以作为产品目标；第二、三项不能由第一项推导。GM_setValue 的按脚本存储与 AppStorage 的历史命名空间也不能只换函数名。

## 5. 服务语义：为自动化、用户脚本和网页集成提供能力

在当前已安装并获准 Page SDK 的网页主世界中：

```js
const sdk = globalThis.OpenDeskSDK;
if (!sdk) throw new Error('请先通过扩展工具安装并授权 SDK');
await sdk.ready();
const response = await sdk.axiosx.get('https://api.example.test/status');
console.log(response.status, response.data);
```

URL 为占位示例，须替换为获准的测试地址。语义是“来源网页 A 请求扩展访问获准接口 B，结果返回 A 的这次调用”。ready 可能复用 Hello，不能代替本次授权检查。

Controller 内也能使用服务外观，但其身份和命名空间由运行上下文决定。页面用户脚本将来可以获得对应的受控服务适配；不能通过把 MAIN 世界的 Page SDK 直接暴露给所有脚本，就宣称完成按脚本隔离。

[SDK entry](../../../src/framework/sdk/entry.js)、[服务合同](../../../src/framework/sdk/registry.js)、[Controller Worker](../../../src/scripting/sandbox/worker-runtime.js)。

## 6. 四个必须独立记录的维度

| 维度 | 可选情况 | 不能混淆 |
|---|---|---|
| 程序来源 | 保存、导入、可信工具临时调试 | 有临时脚本需求不等于普通网页可提交后台任意代码；运行前冻结输入 |
| 触发方式 | 手动、页面按钮、网址匹配、事件 | 自动匹配不等于自动授权；F12 不额外授予后台权限 |
| 执行环境 | Controller Worker、页面 USER_SCRIPT、明确批准的 MAIN | 有 document 的页面脚本不能被强制塞入无 DOM 的 Worker |
| 能力范围 | DOM、ChromePage、HTTP、存储、通知等 | API 存在不等于当前身份有权调用 |

来源文档 A、自动化目标文档 T、网络目标 origin B 也是不同对象。@match 指定脚本适用网页；network target 指定可请求哪里；二者都不代替实际 tab/frame/document 的校验。

## 7. 共同底座，不同生命周期与信任边界

| 对象 | 身份与生命周期 |
|---|---|
| Controller 任务 | run + epoch + 固定代码版本 + 目标；成功、失败、停止、未知效果及资源回收 |
| 页面用户脚本 | 可信 script identity + revision + 文档实例；装载、活动、停用与文档退出 |
| Page SDK 请求 | 原始来源文档 + grant + request/digest；请求结果与交付检查 |

CURRENT Page SDK 使用来源文档/origin 授权，不是脚本级授权。TARGET 用户脚本的可信身份必须由安装/准入与绑定通道证明，不能相信网页消息里的 scriptId；MAIN 世界共享代码也不具有天然的脚本间隔离。

统一持久化、协议、authority 和 driver，不意味着所有脚本都占用同一个长任务 slot、使用同一存储键空间或处于同一个执行世界。页面内直接 DOM 修改不经过每次后台准入，不能宣称获得与受控 ChromePage 命令相同的逐动作日志或强制停止能力。

禁止高权限扩展上下文任意 eval，不等于禁止用户提供的 JavaScript。用户脚本能力通过符合平台要求的 userScripts 等受控路径承接。unregister 不能被解释为撤销已发生的页面效果；页面脚本停用必须分别描述未来注入、特权服务拒绝和已运行页面逻辑的清理限制。

## 8. 当前状态与下一步

| 主线 | 当前证据 | 后续决定 |
|---|---|---|
| Puppeteer 风格 Automation | ChromePage、context、Controller、固定操作、页面计算路径已存在 | 保留并按旧语义/目标文档/真实效果验收 |
| 页面用户脚本 | 旧项目有页面应用脚本注入；新项目有 userScripts 页面计算机制 | 不能算完整管理器；应补设计与独立用户链验证，不隐去此核心范围 |
| Page SDK / services | 独立 SDK 与后台服务已实现；P1 候选有 A/B 批准 UI | 完成同包真实调用验证，不等于用户脚本产品已完成 |
| 网页按钮启动完整任务 | 旧 raw executeScript 有启动意图，但没有可靠整段结果协议 | 保留场景，通过受限脚本引用与现有运行管理承接 |

先完成正在推进的 P1 授权/服务链及 ChromePage 对照验证，不与其产品写入竞争。随后以“安装一个只修改 DOM 的脚本 → 匹配网页自动装载 → 刷新与停用”证明页面用户脚本闭环，再验证它使用受控服务和按脚本隔离；不自动开启新阶段产品实现。

## 9. 文档与证据入口

| 文档 | 作用 |
|---|---|
| 本 README | 浏览器框架定位、两类脚本运行模型、语义调用 |
| [Legacy](legacy-src-bex-framework.md) | 旧 ChromePage、服务桥、脚本启动与页面注入事实 |
| [CURRENT / TARGET](current-and-target-framework.md) | 现有组件、目标边界、状态 owner、验收切片 |
| [迁移地图](legacy-to-target-map.md) | 旧能力逐项决定；不能把限定拒绝算作正向迁移成功 |

有效 Contracts/Invariants 仍由已批准合同与源码 schema 负责；[机器账本](../../framework/source-compatibility-ledger.json) 保留迁移 ID；tests/evidence 负责真实验证。首页修订不删除来源事实、不将候选自动批准为产品合同。

固定来源：Legacy `todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5`；主线文档修订前 `opendesk-browser@bb2038f992b1ad79311fc8436433a655f76ff735`（产品源码来自此前 6214b5e）；本轮观察到 P1 候选 `426409791a35acb6a6e5eb3f6fcc8b0600f562b5`。38763c7 到该候选的后续差异为构建/测试相关，不能据此增加本轮原生 PASS。本轮未全读大型 ledger，未执行浏览器验收。

官方依据：[Puppeteer Page](https://pptr.dev/api/puppeteer.page)、[Page.content](https://pptr.dev/api/puppeteer.page.content)、[Tampermonkey 文档](https://www.tampermonkey.net/documentation.php?locale=en)、[Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)、[Content scripts 与执行世界](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)。
