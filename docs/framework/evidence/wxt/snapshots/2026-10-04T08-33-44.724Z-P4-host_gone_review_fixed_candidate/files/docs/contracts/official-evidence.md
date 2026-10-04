# 阶段 01：Chrome / MV3 与最小工具链官方证据

检索日期：2026-10-01（America/Los_Angeles）。角色：researcher；范围：设计证据，不做生产实现。本文是本任务唯一写入文件；不安装依赖，不修改 manifest / 源码 / 锁文件，不编译来源快照，不发送任何 chat 消息。

标记规则：**官方事实**来自原始官方文档或标准；**快照事实**只证明已保存文件的内容；**设计推断**是本阶段拟定规则，不是浏览器保证；**pending**表示尚未实测。以下所有外部链接均于上述日期经 web 检索；滚动文档不能替代指定浏览器版本的运行证据。

## 1. 拟定结论与版本边界

**设计决定（用户指定优先级）**：采用原生 MV3 manifest + 已有 webpack 5 / Terser；源码继续使用有效 HTML / JavaScript，允许原生 ESM 模块组织，注入入口交付 classic IIFE。WXT 仅做官方证据对照，不引入依赖、不启动迁移。源码格式、构建配置和浏览器最终加载产物分别验收，不能用“源文件是 ESM”证明注入产物可运行。

**设计推断**：拟定 `minimum_chrome_version: "120"`，并非宣布兼容通过。该字段定义安装版本门槛，不构成 API 或业务兼容证明。[Minimum Chrome Version](https://developer.chrome.com/docs/extensions/reference/manifest/minimum-chrome-version)（页面更新：2024-04-26）。

| 对象 | 官方事实 / 版本证据 | 本阶段状态 |
| --- | --- | --- |
| 最低 Chrome 120 | 首版所需 documentId（106）、runtime.getContexts（116）在门槛内；offscreen（109）仅作候选对照，首版排除；120 允许 alarms 最短 30 秒周期 | **拟定；验证 pending** |
| 当前普通 Desktop Stable 参考 | 官方 Chrome 154 release notes：2026-09-22 稳定发布；官方 9 月归档中 2026-09-29 Desktop Stable 公告：Windows / Mac `154.0.8037.92/.93`，Linux `154.0.8037.92`，逐步推送 | **版本公告已核；实际安装版本、运行验证 pending** |
| Chrome 155 | Chrome Platform Status 标注计划 Stable 日期 2026-10-06；不能据此把 155 当作本日普通稳定版基线 | 不纳入当前必测通过声明 |

版本来源：[Chrome 154](https://developer.chrome.com/release-notes/154)、[Chrome Releases September 2026](https://chromereleases.googleblog.com/2026/09)（定位 2026-09-29 “Stable Channel Update for Desktop”）、[Chrome Platform Status](https://chromestatus.com/release-notes)。归档可读；9 月 29 日单篇链接在本次读取返回 Google 重定向 / 500，因此补丁号引用官方归档，不声称单篇成功抓取。当前版本证据不包括 Extended Stable、Early Stable，也不证明所有设备已经收到更新。

## 2. downloads：事件、查询与完成语义

**官方事实**：需要 `downloads` 权限；`onCreated` 在下载开始时给出 DownloadItem；`download()` 返回新下载 id（Promise 自 Chrome 96），并不等待完成。`onChanged` 给变化字段，排除 `bytesReceived`、`estimatedEndTime`；成功终态是 `state="complete"`，中断是 `interrupted`。`search({id})` 查询指定项，普通查询默认 limit=1000；`id` 跨浏览器会话持久。`exists` 可能过时，search 不等待存在性检查完成，检查至多每 10 秒一次。DownloadItem 有 url / finalUrl / referrer / byExtensionId，没有 tabId / frameId / documentId；接口清单没有读取下载文件内容的方法。[Downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)（页面更新：2026-09-11；核验章节：DownloadItem、DownloadQuery、State、download、search、onCreated、onChanged）。

**设计推断 / 拟定契约**：

- 接受任务、拿到 downloadId、下载 complete、业务消费完文件是不同确认点；不得用 `onCreated`、文件名出现或 `download()` resolve 报成功。
- 已知 id 时以 `search({id})` 做恢复核对；`onChanged` 与 search 可重复触发同一状态处理，因此结果提交需要幂等。监听器先注册，再恢复待处理记录；不能假定事件与异步落账天然有序。
- 任务保存 requestId → downloadId 映射；事件先到时保留未归属观察，后续按 id 对账。创建成功但 id 尚未持久化即 worker 终止的窗口不能假装消失，也不能直接重试下载制造副本；恢复先核对已知证据，无法唯一归属标为待核对。
- host 网页触发的下载不能凭 url / referrer / 文件名唯一认定来源文档；网页导航、多个 iframe、同 URL 并发和历史下载会产生歧义。没有可靠归属时不得把猜测变成成功回执。
- complete 只确认 Chrome 下载终态；不等于文件仍存在、不等于内容校验或业务处理完成。字节读取属于另一个明确授权的能力，不能从 downloads 权限推导。
- 空 search 结果是缺失 / 擦除 / 不可恢复状态，不能解释为成功；只查有任务依据的 id / 有界候选，不把全量下载历史当任务队列。

## 3. host Blob 与 extension Blob：所有权、传输和释放

**官方事实（标准）**：File API 的 Blob URL 静态方法暴露给 Window / DedicatedWorker / SharedWorker，未暴露给 ServiceWorker。Blob URL 与创建环境及 storage key 关联；fetch 受同 partition 限制（顶层导航有例外），文档卸载清理相关条目；revoke 后再解引用失败。标准不定义 `chrome.downloads` 的权限提升行为。[W3C File API §8](https://w3c.github.io/FileAPI/#url)（Editor’s Draft：2026-09-12；工作草案，不是 Chrome 120 实测）。

**官方事实（Chrome）**：offscreen 自 Chrome 109 / MV3，需 `offscreen` 权限；入口必须是包内静态 HTML，每个 profile 同时一个（split incognito 分开）。只支持扩展 `runtime` API；`BLOBS` reason 包括 createObjectURL。除 AUDIO_PLAYBACK 的特殊计时外，其他 reason 不设该生命周期时限，但文档没有承诺跨浏览器重启持久。当前 `offscreen.hasDocument()` 是 Chrome 150+。[Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)（更新：2026-09-21）。

| 场景 | 设计推断 / 拟定边界 | 待验证 |
| --- | --- | --- |
| host 网页创建的 `blob:https://…` | 属于创建网页环境；不能把 URL 字符串当可跨源、跨导航、跨重启存活的文件句柄。需要在有效所属文档中完成读取 / 下载协作 | 同 document、iframe、partition、导航 / revoke 后行为 |
| 在 MAIN world 取得网页 Blob | 仅在需要页面 JavaScript 对象时使用最小 MAIN 桥；桥接数据不可信。持有 Blob 对象与仅持有 Blob URL 分开建模 | 严格页面 CSP、伪造消息、重复请求 |
| extension 自建导出 Blob | 可拟定由普通扩展 HTML host 持有；需要隐藏 host 时用 offscreen `BLOBS`。offscreen 持有 Blob / URL，worker 调 downloads；不让 offscreen 调 downloads / tabs / scripting | 扩展 origin Blob URL 能否稳定被 downloads 消费 |
| URL 生命周期 | host 持有到所需消费者完成；至少不能拿到下载 id 就立刻 revoke。成功 / 失败终态后协调释放；host 丢失时标不可恢复或从持久原始数据重建 | 极快下载、取消、host 被关闭、worker 重启 |

**设计推断**：host_permissions 不能作为“任意网页 Blob 可从 extension worker fetch”的保证；也不能把标准的 fetch 限制机械套成 downloads 一定成功 / 一定失败。本次官方来源没有保证这条跨上下文路径，Chrome 120 与当前版均 **pending**。下载观察不提供 Blob 字节；若任务需要内容，应明确谁在何种上下文取得字节及其存续期。

## 4. sender.documentId、路由和执行世界

**官方事实**：MessageSender 的 documentId / documentLifecycle 自 Chrome 106，均可选；documentId 是发起连接文档的 UUID，documentLifecycle 是建连时快照，不代表持续有效状态。origin 可能不同于 url 或为 opaque；tab / frameId 并非所有 sender 都存在。`runtime.getContexts()` 自 Chrome 116 / MV3，用于当前扩展上下文发现，不能发现任意网页 Blob。[Runtime API](https://developer.chrome.com/docs/extensions/reference/api/runtime)（核验 MessageSender / getContexts；页面更新标注 2024-02-06）。

**官方事实**：tabs.sendMessage / tabs.connect 的 documentId 定向选项自 106；连接或投递失败会报错。[Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)。scripting 的 documentIds / InjectionResult.documentId 自 106，documentIds 与 frameIds 互斥；默认 ISOLATED，MAIN 与网页共享 JavaScript 环境；files / func 二选一，func 序列化后丢失绑定参数和闭包环境。[Scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting?hl=en)（更新：2026-09-11）。

**设计推断**：

- 由浏览器提供的 sender 元数据确认请求来源；payload 自称的 tabId / documentId / origin 不作为授权。拟保存 `(extensionId, tabId, frameId, documentId, requestId)`，按上下文类型允许不同字段；网页相关任务缺失 documentId 时明确拒绝 / 降级，不能声称 Chrome 120 保证每个 sender 都有该字段。
- 回发到原 documentId，不导航后盲发到相同 tabId / frameId 的新文档。投递失败或文档失效返回明确失败；持续任务的重新绑定需要新请求，不能沿用陈旧身份。
- MAIN bridge 只负责必要的页面对象访问；ISOLATED content bridge 做有限转发，扩展特权动作交给 worker。MAIN payload 内的身份字段不能冒充 runtime sender。
- documentId 不是能力 token，也不代替来源白名单、参数约束和 requestId 去重；BFCache / prerender / 同文档导航的存续规则留到实测，不从“UUID”推导每次 URL 变化必换 id。

**官方事实（消息契约）**：Chrome runtime 消息使用 JSON 序列化；当前文档说明监听器返回 Promise 的异步应答能力从 Chrome 148 逐步启用，`return true` + sendResponse 仍适用；content script 输入需验证，特权操作限制范围。[Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)（页面更新标注：2025-12-03，章节带较新版本说明）。**设计推断**：Chrome 120 基线保留同步监听器返回 literal true 的异步应答路径；不把原生 Blob / ArrayBuffer 的 structured-clone 能力套到 runtime 消息。大对象传输单独定义格式、边界、预算及失败恢复，当前阶段不实现。

## 5. 权限按动作拆分

| 动作 | 官方事实 | 本阶段拟定约束 |
| --- | --- | --- |
| 查询 / 监听 / 创建下载 | downloads 权限，见 §2 | 不额外申请 downloads.open / downloads.ui / downloads.shelf；不解析不稳定错误文本 |
| scripting 注入 | 需要 scripting 加目标 host_permissions 或 activeTab | 手动临时入口可用 activeTab；自动后台入口不能假定用户手势授权存在。[Scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting?hl=en) |
| activeTab | 用户调用扩展后临时授权；同源路径导航可继续，离开授权来源 / 关页撤销 | 记录请求上下文，动作前复核权限；不得把 activeTab 当永久站点授权。[activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) |
| 扩展 fetch 外域 | 扩展跨源请求需 host_permissions；content script 跨源请求仍按跨源处理 | 精确服务来源，不接受任意 URL 代理请求；不以此承诺 host Blob 可读。[Network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) |
| MAIN / ISOLATED | isolated 世界不能直接看到网页变量；MAIN 下网页 CSP 适用 | 最小 MAIN 桥；不以脚本注入当作绕过页面 CSP 的保证。[Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) |
| 网页访问扩展资源 | WAR 用 resources / matches 等限定；content script 本身不需列入 WAR | 只暴露需要由网页加载的资源；WAR 不授予 downloads / scripting 特权。[Web Accessible Resources](https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources?hl=en) |
| tabs / storage | tabs 权限用于敏感 Tab 信息，不是开放 tabs namespace；storage API 需 storage 权限 | 不因调用 tabs.sendMessage 就默认索取全局 tabs；跨浏览器重启恢复 metadata 才选持久存储。[Tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)、[Storage](https://developer.chrome.com/docs/extensions/reference/api/storage) |

## 6. MV3 生命周期与恢复

**官方事实**：worker 通常在空闲 30 秒、单次处理超过 5 分钟或 fetch 响应超过 30 秒时终止；事件可唤醒，内存全局变量会丢失。Chrome 110 扩展 API 调用重置计时；114 起仅打开 port 不重置，发送消息才影响存活；120 alarms 最短周期 30 秒。这些不是无限保活保证。[Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)（页面更新标注 2023-05-02；含后续版本段落）。

**官方事实**：事件监听器需顶层同步注册。[Worker events](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events)。worker 用静态 import 需 manifest background.type=module；动态 import() 不支持，代码必须在包内。[Worker basics](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics)。storage.session 在禁用 / reload / 更新 / 浏览器重启时清除，不能充当跨浏览器会话的持久队列；storage.local 可保存持久状态。[Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)。

**设计推断**：downloads / runtime 等监听器先同步挂载，恢复任务后再进行异步对账；原生 ESM 源不得在注册前 top-level await。保存任务关联、阶段和终态提交记录；不保存 Blob URL 字符串就宣称数据可恢复。worker 重启后检查扩展 host 是否仍存在、按 downloadId search、幂等推进；host 所属文档已丢失则走失败 / 数据重建契约。计时器 / port / offscreen 心跳不能成为正确性的前提；如使用 alarms，只作为核对触发器，不是准点执行或永久在线保证。

## 7. 工具链快照与 WXT 对照

### 7.1 来源快照：声明范围与锁定版本分开

**快照事实**：只读 `docs/contracts/source-snapshots/scrapyJs/package.json` 和 `package-lock.json`，包为 `scrapyjs@1.0.0`，lockfileVersion=3。没有检查来源 webpack 配置或生产源码，因此不能证明现有入口已满足产物要求。

| 工具 | package.json 声明 | package-lock.json 精确版本 / 关系 |
| --- | --- | --- |
| webpack | devDependency `^5.95.0` | `5.95.0` |
| webpack-cli | devDependency `^5.1.4` | `5.1.4` |
| terser-webpack-plugin | devDependency `^5.3.10` | `5.3.10`；也被 webpack 依赖 |
| terser | 未直接声明 | `5.34.1`；插件依赖范围 `^5.26.0` 的锁定解析 |

SHA256（原始文件字节，主代理本任务内再次核对一致）：

```text
package.json       a46fc3a71d5a5882923dc818c648432907860d4e056f0ab8e859652f4c771f84
package-lock.json  0ca66beeb7d8b17ddb4a2d2d96330e632714c8d1713ddafe9ce491eca2a3df84
```

快照没有 WXT / TypeScript 包记录；存在 Vite 的传递记录不能证明扩展采用 Vite。以上只说明快照，不证明目标仓库已经安装或复用该工具链，也不构成自动拷贝整个 scrapyJs 依赖树的理由。

### 7.2 官方能力证据

- **官方事实**：webpack 支持 ESM import / export 源；源码模块系统不等于输出加载形式。[webpack ESM](https://webpack.js.org/guides/ecma-script-modules/)。HTML Standard 将无 type / JavaScript MIME type 的 script 作为 classic，将 type=module 作为模块；classic 不等于 ES5。[HTML Standard script](https://html.spec.whatwg.org/multipage/scripting.html#the-script-element)。
- **官方事实**：output.iife 默认 true，控制输出包装；启用 output.module 会改变为模块输出并关闭 IIFE。在线 Output 文档包含新于 5.95.0 的选项，不可据此使用新版本才有的内置 HTML / copy 功能。[webpack Output](https://webpack.js.org/configuration/output/#outputiife)。
- **官方事实**：runtimeChunk=false 使 runtime 嵌入各 entry chunk；5.95.0 引入 avoidEntryIife，生产模式开启，可能去掉入口模块层的 IIFE。它与 output.iife 外层包装不是同一个语义，不能据此断言整个 bundle 一定失去隔离。[webpack Optimization](https://webpack.js.org/configuration/optimization/#optimizationavoidentryiife)。
- **官方事实**：插件 5.3.10 README 的普通 JS 配置支持 terserOptions.module=false；Terser 5.34.1 的 module=true 意味着输入模块的 strict / 顶层优化假设，不是 ESM → classic 打包器。Terser 的 ecma 选项不能替代完整语法降级。[Plugin v5.3.10 README](https://raw.githubusercontent.com/webpack-contrib/terser-webpack-plugin/v5.3.10/README.md)、[Terser v5.34.1 README](https://raw.githubusercontent.com/terser/terser/v5.34.1/README.md)。精确版本官方 README 用作包行为证据；没有引用第三方示例。
- **官方事实**：WXT 模板默认 TS，但官方允许改扩展名使用 JS；全量 TS 不是 WXT 的必要前提。[WXT Installation](https://wxt.dev/guide/installation.html)。在线站点标识 v0.21.4，文档部分 Last updated 为空，本文以检索日记录，不虚构发布日期。

**设计推断**：源码保留原生 ESM JavaScript，注入入口先用 webpack 解析 / 打包，再由现有插件压缩为可按 classic 加载的产物，是有官方能力依据的路径。拟定显式关闭注入入口模块输出、保持 IIFE 隔离、内联所需 runtime、禁止依赖外部公共 / 异步 chunk；是否满足要求最终看产物。本阶段不交付 webpack 配置，不证明来源现有配置合格。保留有效 HTML / JS 不等于保留与 MV3 CSP 冲突的内联事件处理器、eval 或远程脚本；只修必要边界，无全量 TS 改写。

### 7.3 与当前 WXT 对照：按结果判断，不按框架标签判断

| 人工审查项 | 原生 manifest + 已有 webpack / Terser（本阶段优先） | WXT 官方能力 / 迁移成本 |
| --- | --- | --- |
| manifest 所有权 | 项目直接维护；权限和入口显式可审查 | 从配置和入口约定产生最终 manifest，需比对权限和 host_permissions |
| HTML / JS 保留 | 有效 HTML / JS 可保留；资源复制和路径需由所选最小流程保证 | 可用 JS；HTML 入口经 Vite 打包的脚本需 type=module，不是无改动搬运 |
| 注入产物 | 注入入口拟定独立 classic IIFE | content / unlisted script 也输出 IIFE；因此无需借“能产 IIFE”引入 WXT |
| background | classic bundle 或 manifest 声明的静态 ESM 是单独决策，不与注入入口混淆 | 默认单文件 IIFE；选 type=module 可改 ESM，并引入跨页面分块 |
| 输出结构 | 项目明确 manifest → 文件路径映射 | entrypoints / assets / public 约定，默认 .output；迁移需要移动文件与配置 |
| 依赖与环境 | 快照已有上述锁定工具；优先不新增依赖 | v0.21 要求 Node >=22、Vite 为 required peer；typescript / web-ext 是功能相关 optional peers，不能把其 TS 示例读成强制全量迁移 |
| 注入返回值 | 明确最终脚本的求值结果 / 公开 API 契约，不能把 IIFE 内 return 当整文件结果 | v0.21 content / unlisted globalName 默认 false；依赖 InjectionResult.result 时官方要求核对 / 显式配置 globalName |

WXT 原始来源：[ES Modules](https://wxt.dev/guide/essentials/es-modules.html)、[Entrypoints](https://wxt.dev/guide/essentials/entrypoints.html)、[Project Structure](https://wxt.dev/guide/essentials/project-structure.html)、[Migrate to WXT](https://wxt.dev/guide/resources/migrate)、[Upgrading WXT](https://wxt.dev/guide/resources/upgrading)。均为本日在线文档对照；未安装或验证 WXT。Installation 中部分自动开浏览器描述与 v0.21 升级说明有版本差异，当前环境 / peer 要求以升级章节为准，不沿用旧默认值。

**设计取舍**：在“保留有效 HTML / JS、Chrome MV3、注入产物独立、优先无新增依赖”的当前约束下，原生 manifest + 快照锁定工具已经覆盖所需构建能力；WXT 带来的入口 / manifest 生成和开发流程整合，本阶段没有足以抵消新增依赖与迁移面的明确需求。因此保持用户指定优先路径，理由是范围与产物能力，不是“WXT 强迫 TS”或“WXT 无法产 IIFE”。源码迁移工作量、性能、体积与实际构建成功率均未测量，不作优劣数据结论。若后续需要多浏览器发布或约定式开发流程，可另行评估；不能在阶段 01 擅自扩大实现范围。

### 7.4 两条工具链共同的最终产物准则（全部 pending）

1. **语法与包装**：每个 classic 注入文件按 Script grammar / sourceType=script 解析，无残留静态 import / export、import.meta、顶层 await。检查压缩后 AST 的实际 IIFE 调用及作用域隔离；动态 import 虽可出现在 classic 中，本契约仍不允许其引入运行时模块 / chunk 依赖。不能仅看文件名、首字符或配置选项。
2. **依赖闭合**：拟定每个注入入口单文件包含所需 runtime / 依赖；没有未声明全局、require、外部模块加载器或公共 / 异步 chunk 请求。普通扩展页面与 worker 的资源策略单独验收，不把“所有文件必须单文件”扩展到整个包。
3. **入口行为**：在真正的 manifest content_scripts 或 scripting.executeScript({files}) 路径验证初始化顺序、ISOLATED / MAIN 世界、预期公开 API、求值返回值、重复注入。IIFE 内部返回值不自动构成 InjectionResult.result。
4. **MV3 / CSP**：最终包不依赖 eval / new Function / 远程代码或开发服务器；关闭需要 eval 的 devtool 路径。扩展页外部脚本随包交付；严格网页 CSP 下 MAIN 桥能力另测。[Extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)（更新：2024-02-13）。
5. **HTML 与资源**：保留 DOM / 样式 / 事件契约，按 final manifest、HTML src / href、注入调用和 WAR 逐一确认路径可达；无仅 dev 环境成立的资源引用。框架生成 manifest 也必须做同样检查。
6. **压缩等价与可追溯性**：压缩前后比较结果、错误、消息和可观察副作用；不未经证明开启 unsafe 或属性名混淆。记录锁定版本、文件 hash 和未来构建产物清单；不为验证准则预先新增 AST / TypeScript / WXT 依赖。

## 8. 阶段 01 验证状态

| 必验场景 | Chrome 120 | 当前 Desktop Stable 154（实测时记录完整版本 / OS） |
| --- | --- | --- |
| unpacked manifest 安装、权限最小化、CSP 合规 | pending | pending |
| 最终 classic IIFE 注入产物加载，无模块 / 闭包 / 分块缺失 | pending | pending |
| onCreated → onChanged complete / interrupted；极快下载、重复观察幂等 | pending | pending |
| worker 终止前后事件与 id 落账竞态、search 恢复、记录擦除 | pending | pending |
| 同 URL 并发 / iframe 归属、documentId 缺失、导航后旧文档路由 | pending | pending |
| host Blob 读取 / revoke / 导航、partition、严格网页 CSP | pending | pending |
| extension host Blob → downloads、host 关闭、浏览器重启 | pending | pending |
| offscreen 单例并发创建、BLOBS 释放、只通过 runtime 调度 | pending | pending |
| Chrome 120 消息 literal true 应答、JSON 数据边界、拒绝伪造请求 | pending | pending |
| 有效 HTML / JS 保留；压缩前后可观察行为一致、产物资源闭合 | pending | pending |

本阶段已完成的是官方资料检索与契约设计，未执行浏览器行为测试、构建或生产验收。文档事实置信度高；Blob 跨上下文行为、竞态恢复和最终产物兼容性仍需运行证据，不能据本文标为通过。

## 9. 供主代理人工审查与独立复核的交接

`solution-overview` 可据 §2–6 展示“页面所属数据 → 有限桥接 → worker 授权 / 调度 → downloads 终态 → 恢复核对”的职责链；`framework-decision` 可据 §7 审查选择理由、WXT 的真实能力及未测量项；`task-breakdown` 可据 §8 列出阶段后的验证任务、通过条件和失败分支。这三个文档不在本角色写集内，本文不代写，也不以它们存在为完成条件。

本次较早 high 子代理结果仅用于定位官方材料；关键工具版本 / SHA256 与官方产物章节已再次核对，设计结论保持可挑战状态。按用户新指令，后续 native 子代理应继承模型并使用 xhigh，不降档或指定旧模型。**主代理安排的独立 xhigh review：pending**；优先审查 download 归属缺口、Blob 数据路径、Chrome 120 版本门槛、IIFE 返回值、WXT v0.21 环境要求和事实 / 推断分界。不得把“证据文档写完”升级为生产实现或兼容验收通过。

范围说明：本产品host是可见扩展工具窗口，首版采用ISOLATED顶层DOM；本文的网页Blob、MAIN桥和offscreen比较是可选能力说明，不是首版执行依赖或验收项。正式必验表以test-plan为准，不能由候选API版本推导必须引入权限。
