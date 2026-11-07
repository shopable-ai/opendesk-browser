# ScrapyJS · 统一采集与多执行环境架构 R2.2（网页端实施权威决策）

> 决策日期：2026-10-30。状态：`DESIGN_APPROVED_FOR_INCREMENTAL_WORK / CONTRACT_NOT_IMPLEMENTED / MULTI_NODE_NOT_TESTED`。
>
> **此文是后续跨对话的统一业务架构与施工边界，不是已发布功能清单。** 每个新对话先读此文、最新 `main`、对应源码和证据；已提交的能力不重做。架构与验收状态变化须更新本文对应条目，不复制一份新的总规划。
>
> 业务唯一源码（本次确认）：`examples/sidebar-tools/scrapyjs/`；未来经批准迁移至 `projects/scrapyjs/` 时整体转移，不能两处并行。**目前本文件还没有可执行的统一 Schema、Router、Desktop/Android 生产 Adapter，也没有正式节点管理 UI。**

## 1. 原始产品目标：不能漂移

**AI 描述采集需求 → 产生可审阅的声明式 Recipe → 核对目标 Origin、请求头与数据边界 → 在 1–3 页许可站点试采 → 选择本机 Browser、电脑 HTTP/独立浏览器或自己的 Android 蜂窝网络执行 → 独立读回真实数据与出口证据 → 保存版本复跑 → 经另行确认后可长期运行与收费交付。**

需要解决的用户实际问题：
- 非技术用户在当前浏览器网页提取列表/详情、翻页、查看数据并保存配置；
- 有些 API 或静态网页需要**允许范围内的 HTTP 请求头**。浏览器本身管理 Host、Origin、Cookie、部分 Client Hints、TLS 等，不能把“可设置请求头”误理解为“可以修改所有浏览器协议特征”；
- HTTP 模式若在 Browser 中不能可靠实现，应使用**已有 OpenDesk Desktop HTTP 客户端**，不是改写 Browser 的安全策略或新造 Go/Node HTTP Runtime；
- 用户自己的 Android 手机可作为**受限任务执行节点**：Wi-Fi 对接 Mac，CELLULAR 出站请求，真实结果经 Wi-Fi 回传；无须公网入站 IP；
- 未来自己的电脑、异地设备可主动领取经批准任务；陌生用户社区共享代理与分账**延期独立评估**，绝不默认启用。

产品只有一个用户入口：**ScrapyJS React 侧栏**。Desktop/Android 是按需安装或连接的执行端，不再开发独立的平行 ScrapyJS 管理产品。普通用户默认继续使用当前 Browser。

## 2. 总体架构与能力选择

```text
ScrapyJS React（唯一任务管理与审阅入口）
    ├─ AI 生成草稿 / 手动配置 / 命名版本 / 原采集结果
    └─ 可信业务层（PLANNED：统一 Recipe / ExecutionPlan / NodeCapabilities）
          ├─ Browser tab：当前明确授权网页，原 Controller Task + DOM
          ├─ Desktop HTTP：复用 OpenDesk http.request / axios / http.download
          ├─ Desktop Browser：未来独立 Chromium/Playwright Context（NOT_IMPLEMENTED）
          └─ Android Cellular HTTP：复用 todo-user 原生 App，逐连接指定 CELLULAR（NOT_IMPLEMENTED）
                        ↓
             RunReceipt / 真实数据 / 原始证据 / Stop / 资源释放
                        ↓
               结果预览、校验、导出、保存 Recipe
```

| 执行类型（建议标识） | 主要适用 | 登录态/DOM/Headers | 当前状态 |
| --- | --- | --- | --- |
| `browser-tab` | 当前网页 DOM、动态交互、已有授权会话 | 浏览器管理 Headers，原会话在已批准 Tab 内，不导出 Cookie | **ALREADY_IMPLEMENTED（原 ScrapyJS 核心，按旧候选证据范围）** |
| `desktop-http` | API、JSON、静态 HTML、可控的普通 Headers | HTTP 数据请求；不天然拥有用户浏览器 DOM、Cookie 或浏览器 TLS 特征 | **平台 HTTP API 已有；ScrapyJS Adapter 未实现** |
| `desktop-browser` | JavaScript 渲染但须隔离执行的站点 | 独立浏览器 Context；要独立审阅授权、会话和资源管理 | **PLANNED / NOT_IMPLEMENTED** |
| `android-cellular` | 自有手机移动数据出口、受限 HTTP GET | Android `Network` 绑定 Cellular；不自动转移 Browser 登录状态 | **隔离 PoC 源码已提交；todo-user 集成与真实双网 NOT_TESTED** |
| 可选未来 Cloud/Provider | 用户另行批准的长期任务 | 第三方数据条款、计费和独立授权 | **PLANNED** |

**能力路由必须保守**：Browser 的动态 DOM Recipe 不能未经审阅转为普通 HTTP GET；静态 HTML 获取不等于 JavaScript 执行。任务要求 DOM/JS、Cookie、某 Header、网络出口或安全隔离时，只有能被真实证据支持的引擎才可被选择；不支持应明确拒绝，禁止隐藏切换执行端、网络出口或授权范围。现有固定 Task `scrapyjs.capture` 0.4.0 的原站点范围及 90 秒限制保持不变。

## 3. 已核实的代码资产与归属（2026-10-30 快照）

### Browser：`shopable-ai/opendesk-browser`（`main`）

- `src/App.jsx`、`src/app-model.js`、`adapters/app-sdk.js`、`controller/capture.js`（均相对本产品目录）：已有 React、AI 草稿、字段/分页、结果、配置、原 Task 执行；不要重写。
- `tool.config.json` 已查看为 1.6.3，`scrapyjs.capture` Task 为 0.4.0；最新安装态仍须以独立安装/审阅证据判断，不把源码版本当正式晋升。
- `src/framework/sdk/registry.js`：通用 HTTP SDK `normalizeConfig` 可接收有限 `headers`，但拒绝 `cookie`、`authorization`、`proxy-authorization`、`host`、`origin`、`referer`、`sec-*`；具有限额与 Authority。**这不是 Controller DOM 采集任务可修改所有导航请求 Header 的证明**。
- `src/platform/chrome/network.js`：现有受限 `fetch` 请求使用 `credentials: 'omit'`、`redirect: 'manual'`、权限前后校验与响应大小限制；不能作为共享用户会话/代理服务。
- `src/platform/chrome/browser-fingerprint.js`：已有固定的 CDP `Emulation.setUserAgentOverride` 与受控 Browser 环境能力；仅绑定已授权前台 Tab，不接受任意 CDP 方法。不要在 ScrapyJS 中发明第二套 CDP Host。
- `src/platform/chrome/browser-managed-proxy.js`：浏览器级 PAC 管理、独占/权限/恢复合同，**不是按 ScrapyJS 单个 Job 隔离的代理**。
- `src/platform/chrome/browser-network-observe.js`：元数据级请求观察，明确不暴露原始 Header/Cookie/body；不能冒充真实 Header 抓包验证。
- `nodes/poc/android/`、`nodes/poc/mac/`：私人 Android/Mac PoC 与结果合同已存在；`ANDROID_DEVICE`、`REAL_NETWORK` 均为 `NOT_TESTED`，不应复制第二套产品。

### Desktop：`shopable-ai/opendesk`（现有默认分支 `master`）

- `docs/api/http.md`、`examples/runtime/http.js`、`examples/http/download.js`：已有 `http.request()`、`axios`、`http.download()`，支持请求 Header、取消、响应/下载等操作。HTTP 下载已有安全写入和内容摘要；调用权限/重定向限制仍须沿用原 API。
- **先创建应用级 ScrapyJS Desktop Adapter，复用现有 HTTP Runtime**；没有证据说明“从 Browser 自动调起 Desktop 执行 ScrapyJS Job”已经打通。
- 禁止因为产品适配需求未经审阅就修改 Go 原生 Runtime。该仓库使用现有默认 `master`；不创建新分支来满足“main-only”的字面要求。

### Android：`shopable-ai/todo-user`（`main`）

- 已有 Capacitor 8、Quasar/Vue、`com.todo6.MainActivity` Plugin 注册、Java/Kotlin、网络基础权限及已有自动化/HID 能力。
- **正式 Android 节点应作为 todo-user 的独立 `ScrapyNode` 模块**，保留 App 身份、用户数据和原自动化功能。原 ScrapyJS `nodes/poc/android` 仅供审查与迁移参考，不是第二款长期维护的 App。
- 现有 `DevHttpServer`、MQTT/Socket、示例“领取/放弃”及任意脚本执行接口**不等于**已审阅的远程 Broker；不得通过这些接口开放任务脚本或公开代理。
- Android `ConnectivityManager` 和 `Network.openConnection` 的方案可行性需具体机型实测；Wi-Fi 局域网通信 + Cellular 对外请求不是自动成立，失败必须关闭。

## 4. HTTP Header、浏览器特征与真实网络出口：严格分层

| 要求 | Browser 当前页 / Browser SDK | Desktop HTTP | Android Cellular HTTP | 验收口径 |
| --- | --- | --- | --- | --- |
| `Accept`、普通业务自定义 Header、`Content-Type` | SDK 的独立 HTTP API 有受限 Header 输入；**当前 DOM 导航不保证能覆盖** | 可经 HTTP API 审阅配置 | 可在原生 HTTP 客户端审阅配置 | 本人控制的回显 Fixture 读取实际 Header |
| `Accept-Language` | 可评估受控 Browser 环境 API，网络实际值另行核验 | 评估原客户端支持 | 评估原客户端支持 | 独立请求值而非网页 `navigator.language` |
| `User-Agent` | 固定 CDP UA 方案与 SDK fetch 不是同一语义 | 仅在实际测试支持后标记可配置 | 仅在实际测试支持后标记可配置 | 请求回显、浏览器 UA、UA-CH 分开记录 |
| `Sec-CH-UA-*` / 浏览器管理 Header | 不提供用户任意文本覆写 | 不伪称 HTTP 客户端具有浏览器 Client Hints | 不伪称蜂窝请求就是 Chrome | 显示不支持或独立正式验证 |
| `Cookie`、`Authorization`、私有登录状态 | 保留当前已授权 Tab 内，由 Browser Authority 管理；SDK 一般 Header 输入禁止 | 首版不从 Browser 导出身份凭据；未来独立秘密授权 | 首版禁止账号、Cookie、私有文件外传 | 默认不会跨设备传播 |
| `Host`、`Origin`、`Referer`、`Sec-Fetch-*` | 浏览器管理/SDK 受限；不开放任意覆写 | 不作为未经审阅的任意覆写接口 | 不作为任意覆写接口 | 引擎能力表明确边界 |
| TLS ClientHello / ALPN / HTTP2 指纹 | 不能用 Header 配置来改变 | 当前不承诺支持修改 | 当前不承诺支持修改 | 独立网络层能力，绝不虚报 |
| 公网出口 IP / Proxy | Browser/Host 全局代理会影响其他流量 | 取决于电脑真实出口与受审独立配置 | 显式绑定手机 `CELLULAR`，可能位于运营商 CGNAT 后面 | 服务端 IP + 网络选择 + 本地结果交叉核对 |

重要原则：
1. **预期值、客户端配置成功、服务器观察值、实际网络出口**是不同证据，UI 必须区分。
2. Chrome MV3 `declarativeNetRequest.modifyHeaders` 可以修改受支持范围内的网络 Header，但存在规则优先级、授权及作用范围；没有独立审阅/生命周期证据前，**不要为本产品直接扩大 DNR 或 debugger 权限**。
3. 能发送自定义 HTTP Header 不等于可以修改浏览器指纹、TLS 或真实 IP；也不提供绕过验证码、访问限制、风控或站点禁令的能力。
4. 同一任务对多个引擎的 Header Profile 必须先能力匹配，不允许悄悄忽略不支持的配置。
5. 不向服务器回显服务发送敏感 Header；使用自有 Fixture 的无害标记字段作为验证样本。

## 5. 统一任务与结果合同（**建议 Schema；尚无实现**）

**Browser 产品目录是业务合同唯一权威**。下一阶段才实现版本化 JSON Schema、验证器、纯函数路由及最小测试；Desktop/Android 使用固定版本/哈希的受审合同镜像或编译产物，禁止三个仓库手写三套可漂移 Schema。该合同不替换已有 `scrapyjs.capture` manifest，也不自动扩大权限。

| 合同名 | 最小字段 | 设计约束 |
| --- | --- | --- |
| `Recipe` | `recipeId`、`schemaVersion`、`immutableVersion/hash`、`sourceOrigin`、`fields`、`pagination`、`renderingRequirement`、`requiredCapabilities` | 纯声明式，不包含任意脚本或原 Browser 会话 |
| `HeaderProfile` | `headerProfileId`、`approvedHeaderNames`、`values/ref`、`sensitivity`、`observability` | 允许字段白名单；敏感值不写入 Recipe/日志；拒绝未审阅头 |
| `NetworkProfile` | `mode`（direct / cellular / approved-proxy）、`requiredTransport`、`noFallback`、`egressVerification` | 身份与网络来源分别证实 |
| `NodeCapabilities` | `nodeId`、`engineKind`、`features`（DOM/JS/HTTP/Headers）、`networkCapabilities`、`maxLimits`、`status`、`contractVersion` | 声称支持不等于真机 PASS；不可泄露硬件敏感标识 |
| `ExecutionPlan` | `planId`、`recipeHash`、`chosenEngine`、`allowedOrigins`、`approvedHeaderProfile`、`budget`、`approvalRef`、`idempotencyKey` | 不增加原 Task 权限；本机/设备二次验证，超范围拒绝 |
| `RunReceipt` | `runId`、`planHash`、`nodeId`、`actualEngine`、`actualTransport`、`origin`、`pageCount`、`dataHash`、`limitsUsed`、`status`、`stopState`、`releasedAt`、`evidenceRef` | 回执与真实数据独立读回；`unknown` 不自动重发；Stop 受理 ≠ 已释放 |

建议正式执行阶段命名：`created → awaiting_approval → running → stop_requested → completed / failed / stopped / unknown`。不得把“请求已接收”、“文件已请求下载”、“Stop 已请求”当成最终已完成。重定向、域名/DNS 重新解析、SSRF、大小与配额在具体执行节点**重新校验**，不要相信来自 Browser 的单次前端批准。

跨端兼容规则：当引擎不支持 `renderingRequirement`、`requiredCapabilities`、具体 Header、登录状态或网络要求时，输出`不可执行原因`和允许的其他选项；不会自动改选引擎或跨设备转移会话。

## 6. 产品交互（仍待实施）

默认紧凑侧栏：**当前目标 → 规则/AI 草稿 → 执行位置（默认 Browser）→ 试采/Stop → 结果/保存**。原有采集与结果逻辑、命名配置、草稿保护、下载和 Stop 不重建。

- 「执行位置」：当前浏览器、我的电脑 HTTP、我的电脑独立浏览器（能力未实现时禁用）、我的 Android 手机（未配对时不可运行）；每个选项按合同展示动态 DOM / Headers / 是否支持登录态 / 实际网络出口。
- 「高级」：允许的 Header Profile、网络模式、超时、流量/费用预算、站点来源、合法数据使用范围。任何敏感操作明确授权。
- 「节点详情」：配对、Wi-Fi 与 Cellular 双通道、是否私有、最近执行、预算和 Stop；社区共享**默认关闭且此阶段不能开启**。
- UI 预览要求：对话内可点击，尽可能复用现有 React 设计源；320/360/400/440/520px、200% 缩放、键盘、明暗主题，不能以 Mock 当真实设备。
- 主界面不得把 Browser Managed Proxy 错写成“仅此任务使用代理”；不得把普通浏览器网页 Headers 和 Desktop HTTP Headers 混为一谈。

## 7. 网络、安全与商业边界

- A0 手机热点只证明 Mac/PC 的**整体网络**出口可能经过手机，不证明单任务双网络 Node。
- A1 私有 Android：Mac←Wi-Fi→手机→CELLULAR→允许的 HTTPS 测试站点；Wi-Fi 只需局域网可达；手机网络绑定逐连接，不靠 `bindProcessToNetwork` 修改整个 App；掉线 fail-closed。详情见 `../nodes/poc/README.zh-CN.md`。
- B 远程节点：未来采用**设备主动出站 TLS**、有界签名 Job、租约、授权、限量、幂等读回，不要求公网入站 IP。
- C 社区共享出口：未来单独做运营商条款、风险/合规、投诉/责任和结算审阅；与私有节点/领取任务**不共享默认开关**。禁止安装即分享、开放住宅代理、裸 TCP 转发、自动 IP 轮换等。
- Device/Node 不发送 Cookie、登录会话、手机私人文件或不必要的设备 ID；服务端只接受允许的 Origin，禁止请求内网、云元数据、DNS/重定向跳板，不执行远端任意 JS/Python。
- 针对手机真实流量：PoC 的页面响应大小限制**不等于**运营商准确流量计费；不能给用户虚构已使用金额、准确流量或贡献收益。

## 8. 网页 GitHub 直接实施：四段不重叠

下列 ID 是跨对话施工顺序，**不是当前已完成的代码版本**。每段在新的网页版对话读取 GitHub 最新 HEAD，引用此文与前一段的提交 SHA，发现目标已经实现则只测未完成项；不能换个标题再做一次旧任务。阶段改动仅在现有默认分支（Browser `main`、todo-user `main`、Desktop `master`）；不创建分支、Worktree、PR。

| 顺序 / 提示词 GOAL | 负责仓库 | 本阶段只需真正交付 | 明确不做 / Exit Gate |
| --- | --- | --- | --- |
| **R2.2-FRAMEWORK-WEB** | Browser ScrapyJS | 唯一 `Recipe/ExecutionPlan/HeaderProfile/NetworkProfile/NodeCapabilities/RunReceipt` 合同、验证器、能力匹配、对应测试和源绑定可点击设计预览 | 不接真实远程设备，不改 Host/Task 权限；校验器拒绝不支持 Header/DOM/Origin，输出提交 SHA |
| **R2.3-ANDROID-WEB** | todo-user | 把已有 `nodes/poc/android` 审查合并为同一 App 内 `ScrapyNode` Kotlin 模块 + Capacitor Plugin + Vue 最小入口 + 合同兼容与断链/Stop 测试 | 不创建第二套 Android App、不改 HID/Accessibility、不做后台服务；无真机则 `ANDROID_DEVICE/REAL_NETWORK=NOT_TESTED` |
| **R2.4-DESKTOP-WEB** | OpenDesk Desktop | 基于既有 `http.request` / `axios` 做 ScrapyJS 静态 HTTP Adapter、受控 Header 回显 Fixture、停止/结果/哈希/预算 | 不重建 HTTP/Go Runtime，不提前实现独立浏览器 Worker，不建 Browser 管理 UI；无实测则标记 NOT_TESTED |
| **R2.5-BROWSER-WEB** | Browser ScrapyJS | 在**原** React Root 添加执行位置、Header 能力审阅、真实节点状态、受限调用/统一结果与可点击交互预览 | 未打通的引擎禁用并显示原因，不将 Mock 标为已连接，不扩大固定 Task 权限 |

后续 **R2.6-LOCAL-ACCEPTANCE**（只有上述网页版代码提交且对应可测试时才进入）：Mac Chrome + 自己 Android 真机分别验收 Browser 回归、Header 回显、Wi-Fi/CELLULAR 出口、1–3 页真实结果、Stop 和恢复。不能因为“有代码”就跳到本地 Codex 验收。更远期的 B/C Broker、收费或陌生节点市场均不包含在 R2.2～R2.6 中。

### 后续新对话的最小启动句

> GOAL：ScrapyJS [明确填上面的单个阶段 ID]。原始目标与架构权威为本文件 `docs/UNIFIED-EXECUTION-ARCHITECTURE.zh-CN.md`；先读取三仓最新默认分支及已有提交，对上一阶段结果做 ALREADY_IMPLEMENTED / MISSING / BLOCKED / NOT_TESTED 去重，只增量实现本阶段 Exit Gate。网页版 GitHub 直接提交；不重做原 ScrapyJS/Host/Runtime；没有真实设备不报 PASS。输出完成/未完成/阻断、改动文件和提交 SHA、下一阶段入口。

## 9. 状态账本与测试/评分

| 项目 | 截至本次文档核查 | 不得推导出的结论 |
| --- | --- | --- |
| Browser `scrapyjs.capture` 0.4.0、React/AI/规则/结果 | 已有正式业务源码；历史部分安装态采集证据按原候选保留 | 不代表 R2.5 新 UI 或所有 AI 请求已 PASS |
| Browser HTTP SDK / CDP Fingerprint / Managed Proxy | 宿主能力存在，权限与范围独立 | 不代表 ScrapyJS 任意 Header/代理已支持 |
| Desktop HTTP/axios/download | 现有 Runtime 和文档存在 | 不代表 Browser→Desktop 的 ScrapyJS Adapter 已完成 |
| Android R2.0 隔离 PoC 与 Mac 接收器 | `SOURCE_EXISTS / DEVICE_NOT_TESTED` | 不代表 todo-user 已集成或双网出口已验证 |
| 统一 Schema、能力 Router、Desktop Adapter、todo-user ScrapyNode、React 执行位置 | `NOT_IMPLEMENTED` | 不得写成已提交 |
| 远程 Broker、社区共享、积分/账单 | `NOT_IMPLEMENTED / DEFERRED` | 不得显示可用或产生费用 |

证据分层：`SOURCE / NODE / CHROMIUM / MAC_CHROME / ANDROID_BUILD / ANDROID_DEVICE / REAL_NETWORK / REAL_RUNHOST / CLOUD / BILLING`。真实测试未运行记 `NOT_TESTED`；存在旧版本证据记 `HISTORICAL_PASS`，不可冒充当前候选 `CURRENT_PASS`。

设计/提示词评审从**产品契合、Browser Runtime、请求头真实性、Android/Desktop 集成、安全隐私、UX、可维护性、测试追溯**八维分别 100 分制评分；每维目标≥95，算术平均≥95，**不能累加或用平均掩盖单项低分**。设计自评与独立人员评审、真实运行验收要分别记录，不人为填高分。

### 反方审计必答
1. 是否把浏览器 DOM、HTTP GET、独立 Chromium 和 Android 蜂窝执行混作相同能力？
2. 有没有把“设置了 Header”说成“服务器观察到 Header”，或把 UA 当成 TLS/IP？
3. 会不会绕过既有 Browser Authority/固定 Task 来源许可或从浏览器导出 Cookie？
4. 是否建立了第二套 Android App、Go/Node HTTP Runtime、React Root 或三套 Schema？
5. 网络不匹配、Stop 未释放、结果未知或重连时会不会私自改走别的网络、重复请求/收费？
6. 未通过真实测试的选项有没有在 UI 中被伪装为在线可用？

## 10. 其它文档责任：避免重复

- [PRODUCT-ROADMAP](PRODUCT-ROADMAP.zh-CN.md)：长期产品优先级与商业推进，保留旧 R0～R4 的历史含义；本文件的 `R2.2～R2.5` 是**单独的网页开发分段**。
- [AI-ENGINE-PROXY-ARCHITECTURE](AI-ENGINE-PROXY-ARCHITECTURE.zh-CN.md)：AI Provider、Scrapling/Crawl4AI、代理与云运行专题，不再作为跨端合同的唯一权威。
- [COMMUNITY-NODES-MOBILE-EGRESS](COMMUNITY-NODES-MOBILE-EGRESS.zh-CN.md)：A0/A1/B/C 手机与社区网络专题，细节以它和 [PoC 手册](../nodes/poc/README.zh-CN.md) 为准。
- [COMMERCIALIZATION-COMPETITORS](COMMERCIALIZATION-COMPETITORS.zh-CN.md)：商业模式与竞品；不是本期上线许可。
- [ScrapyJS README](../README.zh-CN.md)、[真实 evidence](../evidence/)：既有开发候选/安装态/运行证据，不被规划文档覆盖。
