> **R3 增量校对（2026-10-08）**：下文完整保留 2026-10-08 SOURCE-CONFIRMED 原始审计草案，曾于旧 Current HEAD `02cd057c` 观察。最新已检查远端 `main=7bf72497c14d97a2b5cdedd642c4599c46c1983f`；旧草案头部“唯一 Writer 禁止并行”已由该 HEAD 的 `AGENTS.md`/ `docs/framework/parallel-development.md` **SUPERSEDED**：现在允许独立 worktree/agent 分支开发，仍禁止直接改 main 或共享 native 环境。远端仍是 IndexedDB v2、Controller saved revision、原有 userScripts page evaluator，但未找到 Task Candidate/Verification/Available 正式资产链、自动注入页面脚本管理器或 jQuery dependencyLock。R3 候选分支是独立增量，未声称 Chrome PASS。原始审计附件 SHA-256 `40d1bb9392f4450b26bb030a082fa393fb867d8b41ca0965a41d79d9c171ee72`。下文表 A/B、UNKNOWN、旧结论按审计记录原样保留，不将旧候选静态事实升级为当前运行证据。\n\n---\n\n# OpenDesk Browser 第三方类库：Legacy → Current 运行关系、迁移总账与最小依赖方案

> 审计状态：**静态源码确认（SOURCE-CONFIRMED），不代表本地构建或 Chrome 原生验收通过**。  
> 观察时间：2026-10-08。Current GitHub `main`：`02cd057cff1e2742714791f22faf9f915d6ebf4c`；Legacy GitHub `main` 对照源码：`0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5`。  
> 项目真实 Mac 工作区未挂载到当前执行环境；现有唯一 Writer 仍处于 `active-implementation`。本文作为**独立待集成草案**生成，不表示已写入 GitHub、Mac、本地 `dist` 或 README。 

## 一、证据分层与结论原则

- **SC（SOURCE-CONFIRMED）**：对应代码与消费者链条已定位。说明代码存在及可推导执行路径，不证明 Chrome 真执行。
- **BC（BUILD-CONTRACT）**：已核对构建输入、WXT 策略、资源 allowlist 与产物校验代码；**未核对当前 Mac 的实际 dist/ZIP 字节**。
- **NATIVE（真实浏览器）**：只有同一个 Chrome 安装件、原生 tab/frame/documentId、浏览器执行返回和页面可观察效果齐全才算通过；目前 Current **NOT_TESTED**。
- **PARTIAL**：接口或部分行为存在，但旧消费者仍有差异。
- **MISSING**：当前目标产品所需能力在已检查 Current 源码没有相应管理闭环。
- **OUT_OF_SCOPE_PENDING**：旧业务可定位，但本期是否保留该业务需要按 `AGENTS.md` 的“浏览器自动化核心”范围进一步核对；不是“旧库不需要”的证明。
- **UNKNOWN**：本地未挂载、缺少被引用源码文件、构建结果或实际运行证据。

不可混淆：源码快照 ≠ 运行时代码；npm 包 ≠ 被浏览器加载；manifest 声明 ≠ 有效构建 manifest；API 名称 ≠ 完整语义兼容；Node PASS ≠ Chrome PASS。

## 二、Legacy 加载环境图

```text
src-bex（Quasar/BEX）
├─ Background：background.ts、TimeReview.ts、controller/csdn.ts
│   ├─ npm imports → axios / lodash / moment / query-string / socket.io-client
│   └─ src-bex/manifest.json 声称：store.legacy/psl/axios/moment/js-cookie/
│      TraceTimeUtil/lodash/query-string/background.js
│      注意：旧 MV3 service_worker 被写为数组，不能据此认定有效装载。
│
├─ Content Script 默认 ISOLATED（按旧 manifest）
│   ├─ jquery.min.js（v3.2.1）→ jQuery.noConflict() → jQuery(document).ready()
│   ├─ growl-notification.min.js → GrowlNotification.notify()
│   ├─ moment.min.js / axios.min.js / js.cookie.min.js
│   └─ custom_event.js → window CustomEvent → chrome.runtime.sendMessage
│
├─ 被访问网页 MAIN（由 my-content-script.ts 动态 append <script>）
│   ├─ brige.js / axiosx.js / appStorage.js / appLocal.js / common/utils/Env
│   ├─ lodash.min.js / moment.min.js / axios.min.js / js.cookie.min.js
│   ├─ fingerprintjs@3.js（代码中引用；远端受版本控制文件缺失）
│   └─ env.APP_ENV=bilivip && env.isClient → assets/app_script/{csdnbase,csdn,app_chatGpt}.js
│      env.APP_ENV=testmonkey → testMonkey.esm.js
│      Vue / Quasar 的这两条 append 调用被注释；quasar.umd.js 在远端大小为 0。
│
├─ 扩展 UI：Quasar/Vue 应用及构建产物（不同于旧 Vue/Quasar 静态 vendor 注入）
└─ 构建依赖：旧根项目 npm dependencies；不得全部视为 src-bex 扩展 runtime。
```

### 旧 HTTP 的三条不同链

1. **后台 Axios**：`background.ts`、`TimeReview.ts`、`controller/csdn.ts` 等 npm `import axios` → 后台请求。`background.ts:initEngine()` 还设置过后台自己的 `globalThis.axiosx = axios`，该别名**不是**页面的 `axiosx.js`。
2. **网页 axiosx**：页面 `axiosx.get` → `callChromeBridgeInterface` → `CHROME_BRIDGE_INTERFACE` CustomEvent → ISOLATED `custom_event.js` → `chrome.runtime.sendMessage` → 后台 `handleChromeBridgeInterface` → **后台 Axios** → `ChromeBridgeCallBack` → 动态注入页面回调 → `ChromeBridgeOperationCompleted` → Promise。旧实现仅部分透传错误，`brige.js` 的回调 Map 未看到成功后删除；旧后台还用 `chrome.tabs.query({active:true})` 定向回调而非原始请求 frame，因此有错送与丢回程风险。
3. **普通网页 Axios**：`axios.min.js` 在 Content Script 列表与 MAIN 注入列表都有出现，分别是隔离世界和 MAIN 世界的不同全局实例，直接按本环境的普通 Axios 网络语义工作，**不**通过后台的 `axiosx` bridge。

重要旧注入缺陷：`appendScript()` 为每个 `<script src>` 创建节点并 `appendChild`，没有在后一库装载前等待上一库 `onload`；“写在前面”不能充当依赖 ready 证明。又受到站点 CSP、WAR、MV3 资源约束等影响。

## 三、Current 实际执行环境图

```text
扩展 Side Panel：src/ui/{tool-shell,script-editor}.js
    │   保存 scriptId/revision/sourceHash；当前 Run 强制使用已提交版本
    ▼
RunHost：src/run-host.js
    │   获取 Authority 认可的绑定、revision pin 与目标身份
    ▼
沙箱 Controller Worker：src/scripting/sandbox/worker-runtime.js
    ├─ 无页面 document、window、jQuery、扩展 chrome 权限
    ├─ page.* → src/framework/context.js → 原有单一 Authority/Broker
    │    ├─ 固定 ISOLATED 页面代理：src/scripting/packaged/{page-session,registry}.js
    │    └─ 页面计算：src/scripting/user-scripts/page-evaluator.js
    │        → 原生 chrome.userScripts.execute(USER_SCRIPT 或显式 MAIN)
    └─ axiosx.* → context.services → src/platform/host/controller-methods.js
                 → src/platform/chrome/network.js → 授权后的 fetch

获准页面 MAIN：src/framework/sdk/entry.js → globalThis.OpenDeskSDK / axiosx
    └─ src/framework/sdk/{bridge,transport}.js → CustomEvent
       → Content ISOLATED：src/agents/page-relay.js
       → chrome.runtime.sendMessage → src/platform/host/sdk-broker.js
       → src/platform/host/sdk-methods.js 授权
       → src/framework/sdk/service.js → src/platform/chrome/network.js

Background Service Worker：src/entrypoints/background.js → src/sw.js
    ├─ Authority、Broker、持久化、特权服务
    └─ 不是任意第三方 JS 的自动导入与执行环境
```

Current 的 WXT 使用固定 IIFE 输出、固定注册清单和 build verifier；`manifest.json` 是 WXT 输入，WXT 会根据实际 background entry 生成最终 background 字段。源码 `manifest.json` 只公开 `framework/sdk-main.js` 作为对应 WAR，`src/framework/sdk/resource-contract.js` 仅允许固定资源及旧名字映射到组合 SDK；`docs/contracts/source-snapshots/` 内的 Legacy vendor **不属于 Current 自动执行资源**。

## 四、表 A：旧第三方文件 / 加载环境与 Current 对应

| 库/实际文件 | Legacy 加载者与环境 | Legacy 全局、消费者与行为 | Current 对应和证据 | 迁移判断 |
|---|---|---|---|---|
| axios（npm `axios`） | `background.ts`、`TimeReview.ts`、`controller/csdn.ts` npm import；后台环境 | `axios.get/post/put/delete`、defaults/baseURL、认证头；业务 API、跨环境桥调用 | `src/framework/sdk/http.js` 外观；`src/platform/host/controller-methods.js` 和 `sdk-broker.js` → `src/platform/chrome/network.js` 授权 `fetch` | **PARTIAL**：GET/POST/PUT/DELETE 与常用响应外观存在；不等于 Axios 完整配置、认证头与拦截器 |
| `assets/js/axios.min.js`（v0.21.1） | manifest Content ISOLATED；`my-content-script.ts` 注入 MAIN；另被写在旧后台 manifest 数组 | 各自世界的 `axios`，普通页面调用；后台静态声明不等于被有效加载 | Current 未包含该 vendor；`axiosx` ≠ 页面 `axios` | **PARTIAL/缺兼容**：页面既有代码如直接调用 `axios`，不能自动认为可用 |
| `assets/js/core/axiosx.js` | Content 注入 MAIN | `globalThis.axiosx` → CustomEvent → 后台 Axios | `src/framework/sdk/{http,bridge,transport,entry}.js` + `src/agents/page-relay.js` + `src/platform/host/sdk-broker.js` | **核心路径已实现（SC），Native NOT_TESTED**；权限与错误行为发生变化 |
| `assets/js/jquery.min.js`（v3.2.1） | 旧 manifest Content ISOLATED | `jQuery.noConflict()`、`jQuery(document).ready()`；旧页面已有 `$` 不应被覆盖 | 当前没有 jQuery vendor 或用户选择依赖的脚本管理闭环；可用原生 `DOMContentLoaded` 替换框架内部 ready | **框架内部可替代；用户脚本依赖能力 MISSING** |
| `assets/js/lodash.min.js` | `my-content-script.ts` 注入 MAIN；旧后台 manifest 数组；npm `lodash` 被后台业务 import | `TimeReview.ts` 的 `_.throttle/isEmpty/sortBy/values`、后台工具；网页 `_` 注入 | Current 无通用 lodash runtime；已检查代码采用 JS 语言/API 及固定操作 | **业务消费者迁移待确认；任意用户脚本依赖 MISSING** |
| `assets/js/moment.min.js`（v2.18.1） | Content ISOLATED、MAIN 注入、旧后台数组；后台 npm `moment` | `TimeReview.ts` 日期格式、加时、跨日拆分 | Current 不打包 Moment；核心可用 Date/Intl，但不能直接判定跨日业务行为等价 | **TimeReview 业务待决定，不计核心已完成** |
| `assets/js/js.cookie.min.js`（v3.0.5） | Content ISOLATED、MAIN 注入、旧后台数组 | 全局 `Cookies`；实际业务消费者待进一步核对本地脚本 | `src/platform/chrome/cookies.js` 是受控浏览器 cookies 服务；网页 `document.cookie` 不等于 `js-cookie` API | **PARTIAL/UNKNOWN**；库语法兼容仍缺失 |
| `fingerprintjs@3.js`（引用） | `my-content-script.ts` 尝试注入 MAIN；`utils/UtilDevice.ts` 和 `core/utils.js` 调用 `FingerprintJS.load()` | 设备指纹 / CSDN 业务 | `src/framework/sdk/utils.js:getFingerprint()` 主动抛 `E_RESOURCE_UNAVAILABLE`；`UtilDevice` 有受控 `getAppId`，不是指纹等价物 | **UNKNOWN + 明确不等价**；远端 Legacy 引用资源没有跟踪文件 |
| Vue `assets/js/vue.global.prod.js` | 旧 `my-content-script.ts` 的 MAIN 动态注入被注释；旧扩展 UI 经 Quasar 构建使用 Vue | `assets/js/controller/csdn.js` 调用 `Vue.createApp`，但该文件不能证实被当前条件路径装载 | Current UI 不依赖把 Vue 注入访问网站 | **Core 不必迁移；CSDN 条件业务 UNKNOWN** |
| Quasar `assets/js/quasar.umd.js` | 旧 MAIN 注入被注释；旧 Quasar UI 是独立构建运行环境 | 条件 CSDN 代码调用 Quasar；受检远端 UMD 文件大小为 0 | Current 原生 Side Panel/CSS 及 JS | **Core 不必迁移；站点 UI 业务 UNKNOWN** |
| `query-string.min.js`（文件头指向 1.0.1） | 旧后台 manifest 列表；`TimeReview.ts` 另外 npm import `query-string` | `queryString.parse` 处理网站搜索参数；npm 版未必与静态 1.0.1 相同 | Current 核心可使用 `URLSearchParams`，但尚无此业务逐例验收 | **业务待对照，静态 vendor 不必无条件迁移** |
| `assets/js/socket.io.min.js`（v4.0.0） | Legacy 资产文件存在；未在已查旧 manifest/appendScript 中找到这份资产的主动装载 | `background.ts` 的实际后台消费者是 npm `socket.io-client`，连接并处理事件 | Current 无自动连接原业务 socket 的框架核心实现 | **资产无 active loader 证据；旧远端任务业务 OUT_OF_SCOPE_PENDING** |
| `assets/js/growl-notification.min.js` | Content ISOLATED | `my-content-script.ts` 的提醒 `GrowlNotification.notify` | `src/framework/sdk/notifications.js`、`src/platform/chrome/notifications.js` 可发 Chrome 原生通知，但不是 DOM Growl | **PARTIAL**：通道替代，UI 呈现/条件提醒不等价 |
| `assets/js/store.legacy.min.js` | 旧后台 manifest 数组 | `background.ts:initData()` 用 `store.get('token')` 读取令牌 | Current `src/platform/storage/` 负责受控持久化 | **框架职责替代，Legacy 初始化机制不可照搬** |
| `assets/js/psl.min.js` | 仅找到旧后台 manifest 数组声明 | `psl` 全局；未核实具体有效旧消费者 | Current `URL` 与权限规则，非 `psl` 公共后缀库的等价声明 | **UNKNOWN/勿盲迁** |
| `assets/js/TraceTimeUtil.js` | 旧后台 manifest 数组 | 后台 `TraceTimeUtil` 全局、跟踪器/XHR等；属于旧业务工具非普通第三方 npm 库 | Current 固定 service/target 模块，非逐文件兼容 | **业务范围待确认，不能把快照当运行成功** |
| `assets/js/testMonkey.esm.js` | 仅在 APP_ENV=testmonkey 条件注入 MAIN | 条件调试脚本（浏览器运行未确认） | Current 用户脚本机制可作为承接方向，但没有此脚本的依赖注册/自动安装证据 | **UNKNOWN/延期** |
| `assets/app_script/{csdnbase,csdn,app_chatGpt}.js` | 旧源码 `APP_ENV=bilivip && isClient` 条件注入 MAIN | CSDN / ChatGPT 站点业务待追踪；远端 Legacy 树和迁移快照均没有该目录 | Current 无这些文件运行证据 | **UNKNOWN**；必须在旧本地/实际构建包确认后决定 |

表中 npm 模块、浏览器 vendor、扩展 UI 和运行资源严格分开；绝不因为库文件存在就推导业务 PASS。

## 五、表 B：旧功能到 Current 实际执行点

| 用户功能 | Legacy 调用链 / 真实消费者 | Current 调用链 / 最终执行点 | 关键差异 | 完成度与验收 |
|---|---|---|---|---|
| Controller 发 HTTP | `background.ts`/`TimeReview.ts` → Axios | `sandbox/worker-runtime.js` 参数 `axiosx` → `framework/context.js` → `host/controller-methods.js` → `chrome/network.js:request()` → `fetch` | Current 受原有 run/target 授权、严格配置，强制 `credentials:'omit'`；旧带认证头 TimeReview 不能直接替换 | **SC/PARTIAL；Native NOT_TESTED** |
| 页面跨环境 axiosx | MAIN `axiosx.js` → CustomEvent → `custom_event.js` → `background.ts` → Axios → 注入回调 | MAIN `sdk/entry.js` → `bridge.js` → `transport.js` → ISOLATED `agents/page-relay.js` → `sdk-broker.js` → `service.js` → `network.js` | 来源文档+grant+method 校验、Promise 超时、回执，拒绝 raw execute | **SC/已实现路径；Native NOT_TESTED** |
| 页面普通 axios | ISOLATED/MAIN 各自 `axios.min.js` → 普通 `axios` 请求 | Current **没有**向 USER_SCRIPT/MAIN 安装 axios.min.js；已有 `axiosx` 是受限服务 | API、请求来源、CORS、Cookie、headers 都不同 | **缺原样调用语法；需要按消费者决定是否提供依赖** |
| 扩展内部 jQuery ready | `my-content-script.ts` → `jQuery(document).ready` | 固定 DOM session：`scripting/packaged/registry.js` / 原生 document API | 不需要在核心环境继续暴露 `$` | **可替代的功能，非用户脚本兼容** |
| 用户脚本 jQuery DOM 操作 | Legacy 静态 jQuery / 条件注入意图 | `user-scripts/page-evaluator.js` → `native-driver.js` → `chrome.userScripts.execute`; 无依赖描述/加载 | USER_SCRIPT 默认无 jQuery；`worldId` 未见使用，管理器未建 | **MISSING** |
| 站点通知 | `GrowlNotification.notify` → 页面 DOM | `sdk/notifications.js` → `platform/chrome/notifications.js` Chrome 通知 | 显示位置、皮肤、权限与生命周期不同 | **PARTIAL** |
| 设备身份 | `UtilDevice.ts` → FingerprintJS、App ID | `framework/utils/device.js` → 受控 AppID；`sdk/utils.js:getFingerprint` 明确拒绝 | 不能把随机设备 ID 当真实浏览器指纹等价 | **PARTIAL；Fingerprint 缺口/业务待定** |
| 时间追踪/节流/跨日上报 | `TimeReview.ts` → lodash/moment/query-string/axios | 当前未定位到同等 TimeReview 业务闭环 | 核心自动化迁移与旧时间管理业务范围应分开 | **OUT_OF_SCOPE_PENDING，不计 PASS** |
| Socket 远端脚本命令 | `background.ts:initSocket` → npm `socket.io-client` → SCRIPT_RUN / `executeScript` | Current 由已认证手动启动、固定 revision + Authority 管理 | 不接受旧服务端任意代码直达高权限 `eval` | **旧 unsafe 路径明确不应恢复；业务改造另立授权设计** |
| 运行、停止和持久结果 | 旧后台 `eval`、旧 `ChromePage` + Page SDK | `run-host.js` → 版本 pin → 沙箱 Worker → Broker/Authority → 持久 result/retirement | Current 更强身份与回收；用户脚本持久驻留是另一生命周期 | **已见真实源码调用链；Native 未在本轮测试** |
| 用户临时预览未保存代码 | Legacy/早期 IDE 调试运行诉求 | `src/ui/script-editor.js:start()` 强制 `currentRevision`、已保存源码，`script-run` 在未保存时被禁用 | 当前不满足开发预览；设计应增加临时冻结代码身份，仍使用同一 Authority/driver | **MISSING** |

### SDK HTTP 明确不等于完整 Axios

Current 只认可 `params, headers, timeout, responseType, withCredentials:false`，拒绝 `Authorization/Cookie/Origin` 等受限头，要求绝对 HTTP URL；最终执行 `fetch` 的 `credentials:'omit'` 与 `redirect:'manual'`。保留 GET/POST/PUT/DELETE、响应 `data/status/headers` 不等于 Axios 实例默认值、相对 URL、认证 Cookie、请求/响应拦截器、上传/下载流、全部错误形态兼容。不能把旧认证上报消费者标注为“已迁移”。

### jQuery 与 noConflict 的准确边界

- `my-content-script.ts` 顶层 `jQuery.noConflict()` 在旧 manifest 默认 Content Script ISOLATED 执行，只释放**该隔离世界**中的 `$` 别名，不意味着网站 MAIN `window.jQuery` 被修改。
- `noConflict()` 通常释放 `$`；`noConflict(true)` 尝试同时释放 `$` 与 `jQuery`，恢复 jQuery 加载前的两个全局引用。它**不**撤销 DOM、事件、插件副作用，不保护被其他页面代码中途更改的全局引用，也不能解决多版本已共享扩展全局的问题。
- 用户脚本依赖应默认 `USER_SCRIPT + 独立 worldId`，与网站自身的 `window.$` 和 `window.jQuery` 分开。只使用原生 DOM 的核心框架不需要自动打包 jQuery。
- `MAIN` 仅为确实要接入网站自己的 JS/插件的脚本启用，必须先告知冲突风险并要求每站点显式确认；即便用 `noConflict(true)`，依然不能保证零副作用。

## 六、最小 Script Dependency Manager（设计，尚未实施）

**推荐从两种依赖来源起步，优先 A、再加 B，不创建插件市场：**

A. **内置固定目录**：扩展包里固定的 `jquery@3.7.x`（以引入时选定的**精确 patch 版本**锁定）、可选 lodash；将 `libraryId/version/sha256/license/source=packaged` 与真实产物关联，按脚本选择，不默认给全站注入。

B. **用户本地 JS 文件导入**：UI 文件选择器读取文件，计算 SHA-256，检查大小、类型、许可/来源说明，作为 `source=local-import` 的不可变资产写入已有受控持久化；不能用 CDN URL 代替，也绝不可送进 SW/Controller Worker 作为高权限可执行依赖。首版只支持可直接装载的 classic JS/IIFE/UMD；依赖 ESM、bundler/npm 安装、脚本自身网络再拉取可执行代码均不作为首版支持范围。

**四层数据模型，不新增第二套 Authority：**

```text
DependencyAsset      id, version, sha256, license, origin(packaged|local-import), bytes, status
ScriptRevision       scriptId, revision, sourceHash, dependencyLock[{id, version, sha256, order}], world, matches, frames
RunAdmission         runId, revisionPin, target{tabId, frameId, documentId}, approvedOrigin, permission/grant, dependencyHashes
RunInstance          runId, documentId, worldId, loadReceipts, sideEffects, cleanup, state, result
```

ScriptRevision 的依赖表必须形成受信的不可变 revision；更换库版本=创建新 revision，不修改正在运行的旧版。资产安装≠脚本保存≠一次运行≠运行停止/清理；预览代码可采用有 TTL 的临时 revision/内容哈希和现有一次性授权，不必强制在用户脚本库中永久保存，但不得绕过 Authority。

**执行顺序：** 已获授权的具体文档 → 确认库资产 hash/revision 及许可 → 检查原生 `chrome.userScripts` 可用 → `chrome.userScripts.execute({target:{tabId,documentIds:[documentId]},world:'USER_SCRIPT',worldId,js:[...依赖代码, 用户脚本代码]})` → 检查原生返回 `frameId/documentId/error/result` → 检查页面真实 DOM 效果 → 写入运行凭据。顺序/ready 必须在原生 Chromium 实验验证；对异步库初始化应由脚本声明和 loader 显式 await。`worldId` 使用非 `_` 前缀，以 **脚本身份及运行实例** 选择，避免两脚本即使引入不同 jQuery 版本也共享默认 User Script 世界。

去重规则：**资产字节存储一次、同一脚本/文档/world 每版本装载一次**；不同 world 下可能各有 JS 实例，不能用“一份全局 jQuery”假装跨 world 共享。对于长期自动运行，之后再研究基于既有 Native adapter 的 `register/getScripts/update/unregister` 与 extension 更新时重新登记；首版先 on-demand execute，不必预注册全站自动注入。

**安全边界**：页面脚本改 DOM 不自动获得 `chrome.storage`、后台 fetch、SDK、当前 Controller run 或其它身份。Chrome `userScripts.configureWorld({messaging:true})` 若未来需要，必须作为单独明确授权项，并由可信 `runtime.onUserScriptMessage` sender 和现有 Broker/Authority 进行准入，不信任来自页面的 scriptId/namespace。MAIN 已有 Page SDK 也不能自动借给 USER_SCRIPT；两者世界隔离。

**退出语义**：停止先取消后续注入与撤销特权服务，再请求脚本可选 cleanup；`unregister` 不会逆转已经修改的 DOM、已登记页面事件或同步脚本副作用，必要时提醒用户刷新网页。原生导航天然导致旧 document 失效；SPA 需定义独立的 URL 变更规则，不以每次路由变化默认重复执行。取消/失败不得默默继续；失效请求要按原 Authority 撤权/文档 fence 拒绝。

**MAIN 兼容特殊案例**：在同一 MAIN 执行序列中先保存站点 `$`/`jQuery`，加载库，得到私有 jQuery 句柄，执行 `noConflict(true)`，将句柄显式交给受控脚本。因 MAIN 没有 `worldId`，两个脚本即使清理全局仍可能互相干扰；该模式不是安全隔离承诺。用户脚本与网站共享 JS realm，注入后已发生的影响不能假定可自动撤销。

## 七、最小 Chrome 验收矩阵（Current 安装件本轮未执行）

| Case | 期望与必须记录的原生证据 |
|---|---|
| 1. 网站已有 `$`/`jQuery` | 扩展加载 USER_SCRIPT 依赖前后，MAIN `window.$` 和 `window.jQuery` 的原引用 `===`；测试脚本独立日志 |
| 2. USER_SCRIPT 中 jQuery | 指定已授权 document / 独立 worldId，调用 jQuery 修改指定 DOM，原生回执 `frameId/documentId` 与页面效果一致 |
| 3. MAIN + `noConflict(true)` | 显式获准且警示后运行，页面旧版 `$`/`jQuery` 恢复，脚本内部句柄仍有效；记录插件/事件残留限制 |
| 4. 多脚本不同 jQuery 版本 | A/B 两个 `worldId`；每个读取自己的 `jQuery.fn.jquery`；MAIN 网站全局不变 |
| 5. 先依赖后脚本 | 单次 `userScripts.execute(js:[...])` 库就绪后才能让使用者开始；插入 loader 明确回执，失败阻断下游 |
| 6. 生命周期 | 二次运行、refresh、SPA、停用、navigation；没有新的重复注册，资源清理具备可核对观测，不能声明无法撤销 DOM 已撤销 |
| 7. 目标授权 | 无站点授权/失效 document/跨 frame/撤权后一律拒绝，绝无 JS 副作用 |
| 8. Controller 隔离 | Worker 中 `window/document/jQuery/高权限 chrome` 不意外可访问；未经明确 service admission 不向它注入库 |

统一记录：Current 原始提交及安装 ZIP SHA-256、构建 manifest、Chrome 版本和 Profile、`scriptId/revision/sourceHash`、`libraryId/version/hash`、目标 `tabId/frameId/documentId`、`world/worldId`、权限票据、原生 `InjectionResult`、DOM/变量对比、取消与清理记录。只看到测试 PASS/Console log/截图之一都不能替代整套身份闭环。

### 浏览器环境实际尝试记录（不能标为 PASS）

当前执行容器有 Chromium 144.0.7559.96，但不含用户的 Mac 仓库、Current `dist` 和 Legacy 本地构建输出。为验证平台机制，在 **/tmp** 单独制作了 MV3 最小插件清单（仅 `userScripts`、`tabs`、`scripting` 权限，固定本地 HTTP 测试页，测试 jQuery 来源为容器预装的 **3.6.1**，并非拟引入的 3.7.x）；用隔离 profile 启动 headless Chromium。CDP 可以连接测试网页，但没有发现扩展的 Service Worker target，尝试访问 `chrome://extensions/` 时返回 `chrome-error://chromewebdata/`，文案为 `extensions is blocked / Your organization doesn’t allow you to view this site`。因此无法进入原生 `userScripts.execute`、也没有可用的 `InjectionResult`。所有 8 项案例仍 **NOT_TESTED**，没有成功、失败或通过率记录；已结束临时浏览器和 HTTP 服务进程。此环境限制不等于 OpenDesk Browser 自身功能失败。

## 八、反方审计与三项优先级

### 反方审计

1. **需要完整 Library Manager 吗？** 不需要。当前只有“选择内置固定库 + 本地文件导入 + 不可变锁定 + 一次按文档装载”的最小需求，先无市场、无自动远端安装、无 npm 解析。
2. **可否只用已有 script asset + userScripts？** 很多机制可复用，尤其 Native adapter 和既有 Broker。但当前 `scriptRevisions` 的字段、编辑器保存以及用户脚本资产注册均无依赖宣告；不能仅凭 `userScripts.execute` 声称产品完成。
3. **需新增公共 API 吗？** 首版尽量不对外新增泛用方法，先由现有 UI/host 的受控资产方法承接依赖绑定；确实存在新 wire 字段时必须验证 schema/authority/storage 原有合同。
4. **会破坏 SDK 吗？** 不应触碰固定 Page SDK 的 grant；另外 CURRENT Page SDK 安装器对既存同名全局会主动拒绝，不能把 jQuery 注入任务当成规避这个边界的理由。
5. **是否会提权/远端执行？** 禁止：不加载 CDN 作为扩展高权限脚本，不从任意页可伪造消息建立许可，也不把任意本地 JS 导入 SW。
6. **会重复多版本 jQuery？** 同一 world 按依赖锁去重；不同 world 独立实例是隔离成本而非缺陷，不跨隔离边界“共享”对象。

### 后续仅三个优先级

**P0：本地事实复核与真实最小复现。** 确认 `AGENTS.md`、唯一 writer 释放、工作区 `git status`、Legacy 未跟踪 `assets/app_script/` 与 `fingerprintjs@3.js`、实际 WXT `dist` manifest/JS 清单、相同包哈希；跑上述 8 项最小原生测试中可以执行的无代码改造子集。重点是 `src-bex/my-content-script.ts`、`src-bex/background.ts`、`scripts/verify-package.mjs`、`src/framework/control/native-driver.js`。

**P1：最小依赖声明与按世界装载。** 在 writer 合法接管后，仅围绕 `src/ui/script-editor.js`、`src/platform/storage/repository.js`、`src/platform/host/controller-methods.js`、`src/framework/control/native-driver.js`、`src/scripting/user-scripts/page-evaluator.js`，以及内置文件打包必须同步修改的 `scripts/build-contract.mjs`、`scripts/verify-package.mjs`、`wxt.config.mjs` 评估“内置固定 jQuery 版本 + script revision dependency lock + USER_SCRIPT worldId + 运行回执”的最小差异；先验证 JS 加载顺序、用户脚本 DOM 效果与不触碰 MAIN 全局，不实现完整通用库市场。

**P2：本地导入、MAIN 兼容与生命周期封口。** 仅在 P1 Chrome 证据成立后扩展本地 JS 导入、许可/hash、明确 MAIN opt-in、`noConflict(true)` 测试、重复注册/导航/SPA/停用、开发临时预览，并同步文档 README 入口。确保不改变 SDK 现有 grant 模型、不增加第二套 Authority/执行器。

## 九、来源入口（固定 GitHub commit；实际测试仍需本地核验）

- Legacy [`manifest.json`](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/manifest.json)、[`background.ts`](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/background.ts)、[`my-content-script.ts`](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/my-content-script.ts)、[`axiosx.js`](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/core/axiosx.js)、[`brige.js`](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/core/brige.js)、[`custom_event.js`](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/assets/js/custom_event.js)、[`TimeReview.ts`](https://github.com/shopable-ai/todo-user/blob/0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5/src-bex/TimeReview.ts)。
- Current [`framework/sdk/entry.js`](https://github.com/shopable-ai/opendesk-browser/blob/02cd057cff1e2742714791f22faf9f915d6ebf4c/src/framework/sdk/entry.js)、[`agents/page-relay.js`](https://github.com/shopable-ai/opendesk-browser/blob/02cd057cff1e2742714791f22faf9f915d6ebf4c/src/agents/page-relay.js)、[`platform/host/controller-methods.js`](https://github.com/shopable-ai/opendesk-browser/blob/02cd057cff1e2742714791f22faf9f915d6ebf4c/src/platform/host/controller-methods.js)、[`platform/chrome/network.js`](https://github.com/shopable-ai/opendesk-browser/blob/02cd057cff1e2742714791f22faf9f915d6ebf4c/src/platform/chrome/network.js)、[`scripting/user-scripts/page-evaluator.js`](https://github.com/shopable-ai/opendesk-browser/blob/02cd057cff1e2742714791f22faf9f915d6ebf4c/src/scripting/user-scripts/page-evaluator.js)、[`framework/control/native-driver.js`](https://github.com/shopable-ai/opendesk-browser/blob/02cd057cff1e2742714791f22faf9f915d6ebf4c/src/framework/control/native-driver.js)、[`ui/script-editor.js`](https://github.com/shopable-ai/opendesk-browser/blob/02cd057cff1e2742714791f22faf9f915d6ebf4c/src/ui/script-editor.js)、[`manifest.json`](https://github.com/shopable-ai/opendesk-browser/blob/02cd057cff1e2742714791f22faf9f915d6ebf4c/manifest.json)。
- 官方参考：[Chrome `userScripts`](https://developer.chrome.com/docs/extensions/reference/api/userScripts)、[MV3 Service Worker 迁移](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)、[MV3 Remote Code 约束](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)。

### 目标 README 最小入口（需要合法 Writer 集成）

`[第三方依赖运行关系与脚本依赖最小方案](third-party-library-map.md) — Legacy 库来源/执行世界、Current SDK/Controller 对照、用户导入 jQuery 的边界与验证状态。`
