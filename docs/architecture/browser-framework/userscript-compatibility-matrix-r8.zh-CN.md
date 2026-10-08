# OpenDesk Browser R8：元数据与 GM API 逐项兼容矩阵

> 对照：shopable-ai/opendesk-browser 的 GitHub main，**初始审计 commit fa8e3fba80ca6f86a2f8160c08d19c6f925ce670**，2026-10-09。后续仅新增 R8 文档提交，未重测代码。矩阵的“实现”专指可定位源码，不等于真实 Chrome 通过。证据级别使用 SOURCE_IMPLEMENTED / COMPONENT_TESTED（存在并有历史 Node 测试）/ BUILD_VERIFIED（必须当前候选实跑构建）/ CHROME_NATIVE_VERIFIED（必须真实 Chrome）/ PARTIAL / MISSING / NOT_TESTED。R8 未实跑 Node、构建或 Chrome，不应自称本轮通过。

## 1. 来源与本地真实链

关键源码：
- [dependency-metadata.js](https://github.com/shopable-ai/opendesk-browser/blob/main/src/scripting/user-scripts/dependency-metadata.js) 负责解析和 assertUserScriptExecutable。
- [dependency-manager.js](https://github.com/shopable-ai/opendesk-browser/blob/main/src/scripting/user-scripts/dependency-manager.js) 管第三方字节、审核、来源身份、SHA-256 和依赖锁。
- [preview.js](https://github.com/shopable-ai/opendesk-browser/blob/main/src/scripting/user-scripts/preview.js) 经 Broker 调用 chrome.userScripts.execute，精确当前主文档。
- [page-program-contract.js](https://github.com/shopable-ai/opendesk-browser/blob/main/src/scripting/user-scripts/page-program-contract.js)、[page-program-package.js](https://github.com/shopable-ai/opendesk-browser/blob/main/src/scripting/user-scripts/page-program-package.js) 是 Page 类型固定清单和 register 描述编译器，**不是注册调度器**。
- [network.js](https://github.com/shopable-ai/opendesk-browser/blob/main/src/platform/chrome/network.js) 现有 SDK HTTP NetworkService，不能说已经兼容 GM_xmlhttpRequest。
- [broker.js](https://github.com/shopable-ai/opendesk-browser/blob/main/src/platform/host/broker.js)、[authority.js](https://github.com/shopable-ai/opendesk-browser/blob/main/src/platform/host/authority.js)、[tasks/service.js](https://github.com/shopable-ai/opendesk-browser/blob/main/src/platform/tasks/service.js) 提供受信宿主与 Controller Task。
- [tests/environment](https://github.com/shopable-ai/opendesk-browser/tree/main/tests/environment) 有 parser、dependency、page-preview、page-program-package、task-package-flow 等组件测试；真实 native 状态见 [implementation-status](implementation-status.md)。

## 2. UserScript 元数据：仅识别 / 有语义 / 拒绝

| 指令 | 是否解析 | main 已有执行语义 | R8 决策与等级 |
| --- | --- | --- | --- |
| @name / @namespace / @version / @description | 是，descriptive/directives | 展示/保留，**不能视为已安装版本选择或自动更新** | P0 安装元数据展示与唯一标识；PARTIAL |
| @author / @license / @homepageURL / @supportURL / @icon 等 | 是，描述性字段；外部 URL 不能据此成为下载来源 | 部分只保留，不下载，不赋权 | P1 可靠出处、来源身份、许可证风险；PARTIAL |
| @match | 是 | HTTP(S) Chrome 匹配规范验证；可生成注册描述，但正式安装未接入 | P0 用户批准、运行注册、验收 once/zero；PARTIAL |
| @exclude-match | 是 | 原生注册候选规则验证，正式匹配未运行 | P0 同 @match；PARTIAL |
| @include / @exclude | 是 | **明确 E_MATCH_SEMANTICS_UNSUPPORTED**，并非 Tampermonkey glob/正则兼容 | P1 转换/运行规则需独立规格；MISSING |
| @run-at document-start/end/idle | 是 | 映射 document_start/end/idle，**立即预览不按照时机调度** | P0 注册并真实验证时机；PARTIAL |
| @noframes | 是 | 对应 allFrames=false；即时预览本来仅主 frame | P0 跨 iframe 单独测试；PARTIAL |
| @grant none | 是 | 允许但仍是 USER_SCRIPT 隔离，**不进入 MAIN，不自动提供 unsafeWindow** | P0 明确警告与手册；SOURCE_IMPLEMENTED（受限语义） |
| @grant GM_* / GM.* | 是 | 当前明确 E_GRANT_UNSUPPORTED，不透传 Chrome API | P1 分级适配并按运行身份授权；MISSING |
| @connect | 是 | 当前明确拒绝执行语义；声明本身不授网络目标许可 | P1 GM_xhr broker 适配和 destination allowlist；MISSING |
| @require | 是，按序、HTTPS、来源 identity 与可选强 hash | D1 锁定已核准的字节、离线验证、按顺序 Page preview；注册描述编译器复用；**正式自动注册未完成** | P0/1 验证 cache、顺序、篡改、离线重启；PARTIAL / COMPONENT_TESTED（历史） |
| @resource | 是，名称与 URL 可识别 | 当前 E_RESOURCE_UNSUPPORTED，没有 GM resource 绑定/注入 | P1 资源字节锁、Text/URL mime 管控；MISSING |
| @updateURL / @downloadURL | 是 | 只产生 W_UPDATE_NOT_IMPLEMENTED；不是可信来源证明或自动更新开关 | P1 审核后更新、权限 diff、显式确认与回滚；PARTIAL（信息级） |
| @inject-into content | 是 | 仅 USER_SCRIPT 受限路径；page/auto 不批准 | P3 才审 MAIN/unsafeWindow；PARTIAL |
| @sandbox / @unwrap / @webRequest / @world / @run-in / @top-level-await | 是（或识别拒绝） | 不支持语义；不能被“跳过未知”蒙混 | P3/P4 按风险挑选，默认拒绝；MISSING |
| @background / @crontab（ScriptCat） | 非 OpenDesk 已授权标准 | 不提供对应执行/调度语义，未知 directive 拒绝 | P2 引入新的 runtime kind/显式迁移；MISSING |
| @require-css、@definition、CAT.*（ScriptCat 扩展） | 不保证 | 不得混同 Tampermonkey 标准 | 仅按明确适配版本兼容；MISSING |

解释：仅解析并保存 metadata != 在新文档导航时自动运行；打印注册描述 != 浏览器原生持久注册；已有 COMPONENT_TESTED 仅意味着历史定向单元测试，非 R8 本轮运行证据。

### 解析与安全细节

- 仅识别源码开头真实 UserScript 头部，避免字符串/中部伪 metadata；最多 64KiB 头部、64 条 require、128 条 match；超额失败。
- @require 相对 URL 只以实际用户脚本导入 URL 为 base，不以当前网页或 @downloadURL 代替。仅受限 HTTPS 外部资源；摘要是**完整实际字节的固定身份**，不是安全鉴定。
- 依赖锁必须关联脚本身份、依赖顺序、world 与固定内容；shared hash cache 不等于 shared approval。
- 页面立即预览模式是“当前主文档用户触发”，@match/@run-at 只做信息提示，不自动模拟 document-start。
- @grant none 在 OpenDesk USER_SCRIPT 中不暴露页面 JS 全局，和部分传统管理器行为不同，必须向迁移用户明说。

## 3. GM API 逐方法矩阵：目标语义、现状、实现层、验收

兼容 tier：G0=无特权纯脚本/GM_info/样式等只读；G1=异步键值存储与资源、菜单；G2=网络/通知/下载/标签页；G3=Cookie、剪贴板、unsafeWindow 和复杂同步/跨页面特性。GM.* Promise **默认比旧 GM_* 同步版更适合作为新实现合同**；只有具有可证明本地同步镜像时才提供 GM_getValue 同步读取，绝不在 UI 或 UserScript 线程假装同步等待 SW 消息。

| API | 期望方法合同与主要权限 | 当前 OpenDesk main | 目标 Tier / 兼容边界 / 真实测试 |
| --- | --- | --- | --- |
| GM_info / GM.info | 只读冻结脚本元数据、脚本运行世界、管理器标识、版本 | MISSING（当前默认无隐式 GM_info） | G0；仅可信 metadata 快照，不泄露扩展任意内部权限；对象冻结/污染测试 |
| GM_addStyle | 注入本脚本所属文档 CSS，返回可移除对象或能力受限结果 | MISSING | G0；跨 frame/document 生命周期，CSS 注入撤销；只按文档身份 |
| GM_getValue / GM_getValues | 传统同步读取与 GM.getValue Promise，脚本命名空间隔离 | MISSING（已有 SDK storage 不等于 GM） | G1；先 Promise，再定义同步缓存冷启动行为，不返回另一脚本内容 |
| GM_setValue / GM_setValues | 旧同步形式/现代 Promise，存储要按 script ID + owner namespace 分区，写入顺序和异常 | MISSING | G1；写失败显式错误；JSON/value serialization；权限撤销、重启一致性 |
| GM_deleteValue / GM_listValues | 删除/列举当前脚本 key，兼容同步/Promise 差异 | MISSING | G1；键空间仅 script，重复删除/排序约定测试 |
| GM_addValueChangeListener / GM_removeValueChangeListener | 同脚本跨 frame / tab 值变更，标记 remote 与订阅资源清理 | MISSING | G1（后段）；worker 重启重新订阅；不可无界广播 |
| GM_getResourceText | 已锁定 @resource 文本，编码/MIME/大小限制 | MISSING | G1；SHA、UTF-8 失败、离线、未声明拒绝 |
| GM_getResourceURL | 访问已批准资源 URL / data/blob 与撤销时效 | MISSING | G1；避免向网页 MAIN 泄露 WAR/敏感资源；URL 生命周期固定 |
| GM_registerMenuCommand / GM_unregisterMenuCommand | 脚本独立菜单、顺序、重载后的注册与清理 | MISSING | G1；普通 UI 的脚本菜单，不增加 Sidebar 一级导航；无脚本可伪造其他脚本 menu |
| GM_log | 兼容日志 API 与受限序列化 | MISSING | G0/G1；可做来源级、大小预算、隐私脱敏，不能截取全部页面 console |
| GM_xmlhttpRequest / GM.xmlHttpRequest | 请求对象 callbacks readyState, onload/onerror/ontimeout/onabort/onloadend，headers, responseType, timeout, abort handle；Promise 变体对照官方各家差异 | MISSING；已有 network service 只支持受控短 GET/POST/PUT/DELETE、Text/JSON、默认 credentials:omit、redirect:manual、受限 headers，**不是 xhr 兼容** | G2；新增 GmHttpAdapter 投影→唯一 Broker，@connect × Chrome 目标 host × 用户授予 × 脚本 grant × deadline；禁止自动送 cookie、禁止禁止头绕过；流/ArrayBuffer/Blob 后置 |
| GM_download / GM.download | 浏览器保存文件，回调/Promise、文件名与 MIME 校验、手势和配额 | MISSING，宿主存在下载服务 | G2；必须额外授权用户动作/可用目录，不以用户网站权限自动下载 |
| GM_notification | 受控消息通知、click/done、速率/隐私约束 | MISSING，宿主通知 API 已有 | G2；授权和关闭后回调的生命周期，拒绝伪造系统消息 |
| GM_openInTab / GM.openInTab | 新建/聚焦标签、active/insert、close/onclose 句柄 | MISSING，宿主 tabs API 已有 | G2；仅限可允许 http(s) URL，不开放任意 chrome.tabs 对象 |
| GM_setClipboard / GM.setClipboard | 可信用户意图、文本/MIME 控制、权限 | MISSING | G3；实际可用性与 user gesture、跨浏览器分别测试 |
| GM_cookie | get/list/set/delete Cookie；domain/path/storeId/sameSite/httpOnly/partitionKey 差异 | MISSING，manifest 有 cookies 并不等于脚本已授权 | G3；高风险单独确认、目标 domain 严格白名单与最少权限；默认不开放 |
| unsafeWindow / GM unsafeWindow | 用户脚本与主页面共享对象/页面世界 | MISSING；USER_SCRIPT 与 MAIN 隔离 | G3 或明确不实现；**不能仅通过 @grant none 放权**；页面同源脚本可篡改对象、扩大攻击面 |
| GM_getTab / GM_saveTab / GM_getTabs | 管理器兼容标签私有状态 | MISSING | G3 视真实需求；避免枚举其他用户数据，未证明价值先不做 |
| GM_webRequest | 拦截/修改网络请求；受 MV3 和规则 API 限制 | MISSING | 明确不在常规 GM 路线；必要时做独立受审插件能力，不承诺 Tampermonkey 旧语义 |
| GM_cookie / GM_xmlhttpRequest 二进制高级项 | Blob/ArrayBuffer、response stream、cookies、redirect、upload progress | MISSING | 先给具体 profile/version 的“部分兼容”标记；没有 native 浏览器验收不写 fully compatible |

### GmHttpAdapter 与现有 axiosx/fetch 的关系

- 浏览器页面的 fetch 是标准 Web API，受页面 CORS；**不会因为 OpenDesk 页面注入了 axiosx 就自动绕过 CORS**。
- 已有 OpenDesk SDK axiosx 与 host NetworkService 是面向受信 SDK 的网络 API，不应直接把相同请求方法/头白名单、返回值包装当成 GM_xmlhttpRequest 全量兼容。
- 新增 GM 专属 facade 只负责“接口签名、事件与错误投影”；网络副作用仍走现有 Broker 审核/Host NetworkService **可复用的底层 transport**。确有 GM 需要的 XMLHttpRequest 语义/流式二进制时，单独扩展可审计驱动，而非取消现有超时、header、credentials 防线。
- 每次导航/关闭/撤权必须失效，未知副作用结果不能自动重发请求；用户脚本自己调用页面 fetch 不应被当成已获跨域 GM 权限。

## 4. Runtime / Browser 兼容能力矩阵

| 能力 | 源码现状 | R8 要求和 Chrome 验收 |
| --- | --- | --- |
| PageScript 编辑与当前页单次试运行 | SOURCE_IMPLEMENTED；历史组件测试，原生 NOT_TESTED | exact current tab/window/document、用户开关及授权、真实 DOM 改变；超时/导航/撤权 |
| 正式 PageScript 保存、Verified、Available、Installed | PARTIAL：仅 Page manifest + 描述编译器；Trusted proof hook 是调用者要求而非已接入权威发行 | P0 刻意不同于 Controller Task v1 的 type-specific verification |
| url 自动注册与 refresh | MISSING：无真实页面注册 reconcile | 用户安装→注册→reload once / nonmatch zero |
| SPA pushState / replaceState / popstate | MISSING（自动注入本质是 document boundary） | P1 明确分两个模式：document-run once / opt-in location-change callbacks；不每次路由全脚本重执行 |
| 同站/跨源 iframe | PARTIAL：rules.allFrames 适配字段，single preview 只 main frame | P0 自动注册测试 frame / document URL 与 host 权限，不越过约束 |
| 依赖 @require 审批缓存与锁 | SOURCE_IMPLEMENTED / 历史 COMPONENT_TESTED | 原 Chrome 目标顺序、CSS/JS 世界、断网命中/篡改拒绝 |
| 用户暂停/恢复 | MISSING（Page 注册） | disable/unregister 后**下一文档不启动**；不能回滚已经修改的 DOM |
| 版本升级与失败回滚 | MISSING | frozen sourceHash + dependencyLock + permission delta + manifestHash → prepare → verify → CAS → swap；失败保留旧版 |
| 扩展更新重新注册 | MISSING | Chrome userScripts 注册扩展更新清空；onInstalled('update') 与 SW 启动对账，getScripts 真实比较 |
| 浏览器重启与 profile 切换 | NOT_TESTED | 存储权威 desired set、Chrome native actual set 对账；权限未授予则 remain disabled |
| Background Script | MISSING | P2 脚本不能访问 page DOM、不假设 SW 常驻，短任务 journal / 执行 lease |
| Scheduled Task | MISSING | P2 chrome.alarms + 存储型 schedule, nextDueAt, fireId, ledger; Chrome 150+ persistAcrossSessions 仍要启动对账，不承诺秒级 |
| UserCSS | MISSING | P2 独立 CSS asset/registration，不能以普通 JS Runtime 代替 |
| Native Agent Bridge | **PR #11 仍 open，不在 main**；文档有 R6 合同 | 合并/验收独立进行，R8 不宣称完成 |
| 页面之外全部 chrome.* 权限 | 不对第三方脚本开放（正确设计） | 按 capability broker + Chrome real grant 双重校验，不通配 |

## 5. 逐平台已知差异与测试数据要求

- Tampermonkey：GM_* callback/synchronous 旧式、GM.* Promise、不同行为版本差异；@require/@resource、@run-at timing、CSP/MAIN 不能据 API 名一致推断结果一致。
- ScriptCat：扩展 @background/@crontab、CAT.agent.* 不是通用 Userscript 标准；2026 v1.4 stable 与 v1.5 beta/main 分开，Firefox 特别分层。
- Violentmonkey：2026 Chrome MV3 已有发行版本；默认 document-end（与 OpenDesk document-idle 不同），临时启动时间争议应做原生对照。
- Greasemonkey：Firefox Promise-first、GM4 migration，callback/sync 不保证。
- FireMonkey：Firefox、JS/CSS 组合管理；管理方法/事件和 Chrome 标准不同。
- Safari Userscripts / Stay：Safari WebExtension+用户网站许可、不保证后台、GM 所有 API 或 Chromium 开关适用。
- OrangeMonkey 商店“全部 GM”尚非真实 2026 API 测试，兼容程度暂 UNKNOWN。

建议机器可读兼容测试数据未来采用：{manager,version,browser,version,profile,api,mode,sourceHash,websitePermissions,metadata,status,expected,observed,runId,evidencePath}。任何“完全兼容”必须逐参数、逐浏览器和版本经过真实原生回归。

## 6. 官方规范、策略与后续验收顺序

- [Chrome userScripts 官方](https://developer.chrome.com/docs/extensions/reference/api/userScripts) — Chrome 138+ 每扩展 Allow User Scripts，USER_SCRIPT、configureWorld messaging 和 onUserScriptMessage，扩展更新后注册清空。
- [Chrome SW 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — 30 秒空闲终止，所有内存状态不持久。
- [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms) — Chrome 150+ persistAcrossSessions，最小 30s + 允许延迟；P2 必须做缺席对账。
- [Chrome Store policy](https://developer.chrome.com/docs/webstore/program-policies/policies) — 用户提供的脚本执行与远程代码处理要走明示路径。
- [Tampermonkey docs](https://www.tampermonkey.net/documentation.php)、[ScriptCat types](https://github.com/scriptscat/scriptcat/blob/main/src/types/scriptcat.d.ts)、[ScriptCat GM bridge](https://github.com/scriptscat/scriptcat/blob/main/docs/references/architecture-gm-api.md) 提供竞争目标**而非实现已等价的证据**。

**R8.1 先完成 P0，不抢跑 G1/G2。** 对每项结果分别标 SOURCE_IMPLEMENTED / COMPONENT_TESTED / BUILD_VERIFIED / CHROME_NATIVE_VERIFIED，并保留失败信息；源码静态扫描、Node Mock 或 ZIP 打包均不可替代真实 Chrome 用户脚本开关与真实站点效果。


## 7. 补充 API 与指令（2026-10-09 查漏）

新增参考 [R8 188 项能力总清单](../../product/browser-automation-feature-catalog-r8.zh-CN.md)。以下 API 在首轮 R8 逐项 GM 表中没有充分展开。**均不属于 R8.1 的 P0 安装闭环；不能因“在 Tampermonkey 文档中存在”而给 OpenDesk 写 SOURCE_IMPLEMENTED。**

| 元数据/API/行为 | 官方证据/语义 | OpenDesk main 当前证据 | 决策等级与前置验证 |
| --- | --- | --- | --- |
| GM_addElement | Tampermonkey 支持向某个节点添加指定标签（不同世界/属性需要校验） | MISSING（未有 GM facade）；已有 DOM 能力不等于 GM_addElement | G0+ / P1 可选；仅受限元素和安全属性、执行世界与脚本生命周期测试 |
| GM_getValues / GM_setValues / GM_deleteValues | TM v5.3+ 批量值 API，旧/新方法返回及失败原子性需比较 | MISSING；已有 SDK storage 不是 GM keyspace | G1 / P1；脚本隔离、批量写、重启恢复、同步缓存一致性 |
| GM_getTab / GM_saveTab / GM_getTabs | TM 脚本私有标签状态；与 chrome.tabs 读取权限不是同一个能力 | MISSING | G3 / P3，需实测管理器间生命周期差异，暂不承诺 |
| GM_audio.* | TM 音频静音/状态变更 API，涉及浏览器和应用上下文 | MISSING | LX，缺少足够本产品价值，审计后明确不实现即可 |
| GM_log | 与管理器日志投影相关，要求序列化、隐私/资源限制 | MISSING，不能将 console.log 等同兼容接口 | G0 / P1，受控日志生命周期 |
| window.onurlchange | Tampermonkey 兼容事件；ScriptCat 1.4.0 Release 提到 Navigation API 实现 | MISSING | P1；SPA 导航订阅行为单独测试，不能把每次路由变化变成整脚本重新注入 |
| @run-in / @sandbox / @unwrap | 执行隔离或特殊运行时上下文 | 现有 D1 parser 对部分作识别与拒绝，不具备完整执行语义 | G3 / P3，MAIN/USER_SCRIPT 的 CSP、页面污染、用户承诺须逐项审计 |
| @run-at context-menu | ScriptCat 特有时机，不是 Chrome document-start/end/idle 原生映射 | MISSING | P2 Trigger Adapter + 用户手势，明确是非标准扩展语义 |
| @installURL / @updateURL / @downloadURL | Greasy Fork 可能剥离/替换某些更新指令；来源由可信下载入口另行确定 | @updateURL/@downloadURL 信息级识别；@installURL 语义未确认支持 | P1 执行前须有真实 importSourceUrl、更新域名/权限差异和固定 hash，不信声明即授权 |
| @antifeature | Greasy Fork 对跟踪、广告、联盟、挖矿、收费等要求披露 | 元数据 parser 可识别 descriptive；**安装 UI 呈现与风险确认未证实** | P1 安装审查标签；无法发现的恶意行为不等于安全 |
| 浏览器触发快捷键 / CustomEvent | Automa 官方 Trigger block 支持这类事件 | OpenDesk 未审全局 commands；CustomEvent 授权无产品实现证据 | P2/P3；来自网页的事件必须作为不可信触发建议，不直接越权启动 |
| HTTP 请求拦截/改写 | Requestly 通过独立拦截与网络规则产品提供 | OpenDesk axiosx/GM_http 属**宿主发出的单次 HTTP**，不是拦截别的页面流量 | 高风险独立模块；近期拒绝与 GM_xhr 混淆 |

### 新的跨浏览器和政策差异

- [Firefox MV3 userScripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts) 规定 userScripts **只能作为 optional permission 申请**；[Chrome 文档](https://developer.chrome.com/docs/extensions/reference/api/userScripts) 则要求 manifest 中 userScripts install-time 声明，并在 Chrome 138+ 扩展详情里打开 Allow User Scripts。跨浏览器不能复制相同 manifest 宣布兼容。
- Chrome 的扩展更新会清空原生 UserScript 注册。另需注意切换开关撤销后：Service Worker 内 chrome.userScripts 对象可能保持定义，但**调用方法仍抛错**。单纯使用 typeof chrome.userScripts 判断可用性不足，应以真实 API 尝试及失败关闭验证。
- [Chrome Web Store 政策](https://developer.chrome.com/docs/webstore/program-policies/policies) 要求使用最少权限，不可借 UserScripts 的远程代码例外给特权 SW/Host 运行任意远程代码。当前所有网站与 Cookies 的安装期声明是现状事实，不是自动合规证明。
- [Tampermonkey 官方 GM 列表](https://www.tampermonkey.net/documentation.php)、[Greasy Fork metadata 规则](https://greasyfork.org/en/help/meta-keys)、[Automa Trigger](https://www.goautoma.com/extension/docs/blocks/trigger.html)、[ScriptCat 1.5 Beta](https://github.com/scriptscat/scriptcat/releases) 用作新增条目来源。尚未真实浏览器复现的语义仍记 NOT_TESTED/UNVERIFIED。
