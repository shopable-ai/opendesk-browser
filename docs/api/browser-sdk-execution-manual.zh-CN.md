# OpenDesk Browser SDK 唯一冻结执行手册（2026-10-13）

> **当前代码基线（2026-10-15，按 GitHub main 的生成目录核查）**：获批准合同 **72 项**，其中**公开 SDK Registry/Facade 70 项、可信 Host-only 2 项**；公开接口的编译分类 **DIRECT 3 / SCOPED 49 / CUSTOM 18**。这里的 CUSTOM 同时归并部分 EXISTING_SERVICE 和 COMPOSED，不代表 18 个可直接透传的 Chrome API。以上是**源码登记与绑定数**，不是 70 项真实 Chrome 验收通过。历史 114 个候选名称中尚有 **91 个待后续分类处理**，它们不是已经获批的接口。R11.5 架构状态 **PARTIAL**；独立证据和构建阻塞见 [R11.5 工作记录](../framework/workstreams/browser-sdk-r115-architecture-proof-20261015.md)。

> **历史 R10.6 快照（2026-10-14；非当前数量）**：55 项批准合同 = 53 项公开 Registry + 2 项可信 Host-only；SOURCE_WIRED 与 Node / Build / Native 分开登记。此前 R5–R10.5 数字保留为历史，不代表当前接口数量或真实 Chrome 验收。当前证据见 [R10.6 工作流](../framework/workstreams/browser-sdk-r106-20261014.md)。

> **范围：SDK 设计与后续实施合同。不是实现验收报告。**
> 本手册是 Browser SDK 当前唯一正式实施入口；结构化逐接口事实见 [browser-sdk-interface-matrix.json](browser-sdk-interface-matrix.json)。其余 R7/R8、旧 35 项兼容映射、R5 114 候选和 R9 工作记录只是历史或输入，不得重新替代本手册。
> **目标状态：DESIGN FROZEN；IMPLEMENTATION ONLY。** 冻结仅意味着执行选择已确定，不意味着源码、Node、Build、真实 Chrome 均已通过。
> 当前固定发现基线：Chromium 提交 b5485910372708cd11d9a814a3e382fe8da57df3，Chrome 最低版本 138，Manifest V3。设计扫描发现 191 个源 Schema（JSON/WebIDL/IDL）、163 个 Namespace、1,255 个 Method、321 个 Event、91 个 Property，即 1,830 个有分类目录条目。获批准实施合同现有 55 项：源码正式 Registry 已登记 53 项（包含 Cookies 11 项、Downloads 4 项、Storage 4 项、Bookmarks 2 项、Scheduler 3 项），另有 2 项已接线的可信 Host-only（History / Permissions），不进入公开 Registry。11 项 Cookies 属于附加逐站点授权的 installed-tool 公共 SDK；另有受信内置 Cookie UI 的独立 Host-only 调用入口，但不得混作同一种调用身份。SOURCE_WIRED 仅表示源码接线，非 Node / Build / Native 通过。数字与每项来源由接口矩阵生成；**此处的“已发现”不等于目标平台全部可用，更不等于公开已实现。**

## 0. 决策优先级与一次封版的边界

1. 本手册及接口矩阵共同构成设计封版合同。现行源码运行时事实始终以 src/framework/sdk/browser-contract.js 中 BROWSER_OPERATIONS、src/framework/sdk/browser-schemas.js、已接线的 Host/Driver 为准。计划操作在实际注册前不能称为可调用。
2. 2026-10-13 预发布合同高于 R7/R8 的原 35 项永久兼容主张：允许 KEEP、RENAME、MERGE、DELETE、NEW，按功能组一次迁移仓内消费者，不保留无意义别名、deprecated shim 或旧 35 计数分母。历史证据、旧 Chrome native receipt、603+19/B05/F3/ZIP 验收合同继续原样保留。
3. **统一公开入口仅 OpenDeskSDK.browser。** 不新增 OpenDeskChromeSDK、UniversalChromeProxy、动态 chrome[namespace] 透传、第二 Registry、第二 Browser Host、第二 Authority、第二 Scheduler、第二 Cookie Driver。
4. 官方固定 Schema 是**发现目录**，不是对沙箱的授权。matrix.nativeInterfaces 的一个成员并不自动进入 SDK；只有 approvedOperations 才是设计批准名单；其中只有 visibility=APPROVED_TOOL_REGISTERED 且源码实际接线的操作目前能进入正常调用路径。
5. 适用目标是桌面 Chrome MV3、最低 Chrome 138。每个原生操作必须做实际目标 Chrome 版本、权限、上下文和 Feature Presence 核验。矩阵中 minChrome=null 表示未证实，**绝非 Chrome 138 已验证**。例如 chrome.sidePanel.close 至少 Chrome 145，138 不可假定支持；不得通过静默绕过或虚构 Polyfill 宣称通过。Chromium private/internal、ChromeOS/kiosk/enterprise、Chrome App/MV2、DevTools-only 及只读类型声明已经逐项或逐源分类，不作一般沙箱公开。
6. 发生重大真实安全、平台不可实现或相互矛盾的接口合同时，仅在同一手册与矩阵进行 **有证据的局部修订**，不另建新一份总体 GOAL 或架构方案。仅仅是 Node 失败、源码未完成、Chrome 未测试，不触发重新设计。

## 1. 唯一架构：路径与职责冻结

| 层 | 唯一责任与可执行文件 | 禁止 |
| --- | --- | --- |
| Native Discovery | docs/api/browser-sdk-interface-matrix.json；历史 8-namespace 种子 docs/api/chrome-native-api-catalog.json；固定 Chromium JSON/WebIDL/IDL 的提交与 blob SHA | 不能将自动发现自动变成权限、动态 RPC 或真实 Chrome PASS |
| Registry / Schema | src/framework/sdk/browser-contract.js 的 BROWSER_OPERATIONS + src/framework/sdk/browser-schemas.js；唯一获批准的运行时操作表、版本、输入/输出和错误合同 | 不以旧 35 项、114 候选、compatibility-map 代替注册表；不建立第二份运行时名单 |
| Developer Wrapper | src/framework/sdk/browser.js 的 createBrowserSdk；src/sidebar-tools/bridge.js；只提供 OpenDeskSDK.browser、Promise、对象参数、opaque Ref | 沙箱内不能直接调用 chrome.*、不能泄露 tabId/downloadId/cookie value |
| Tool Admission | src/ui/sidebar-tools.js 在真实安装工具身份、packageHash、installEpoch、工具授权、Origin、真实用户意图下建立单次请求 | UI 的前端声明、模拟点击、任意 page-origin 不等于授权 |
| Browser Host / Dispatcher | src/platform/chrome/context-menus.js 的既有 BROWSER_HOST_PROTOCOL、真实 Sender、documentId、tab/window、意图消费、撤权、生命周期和未知效果决策 | 不平行新增通用 Router / 浏览器授权数据库 / 第二 Host |
| Driver / Existing Services | src/platform/chrome/browser-tabs.js、cookies.js、browser-cookie-host.js（受信薄适配）、browser-network-observe.js、browser-screenshot.js、permission-gate.js、src/platform/downloads/、src/platform/storage/、src/platform/tasks/schedule-service.js | 不把业务逻辑重复写进 RPC 层；不破坏 Controller 旧 Cookie 行为、现有下载/存储/定时服务 |
| Controller Authority | src/platform/host/authority.js 与 RunHost 为 Controller/Page 的已有强身份和执行边界；Browser Host 只在现有授权模型下协作 | 不把 Controller 注入世界、可信 Cookie UI、普通第三方 Tool 当作同一权限身份 |

固定调用链：OpenDeskSDK.browser → installed-tool bridge → Side Panel 的已安装身份/用户操作校验 → 唯一 Browser Host (真实 Sender 与授权快照再次验证) → namespace Driver/现有服务 → Chrome 原生 API → 有界、脱敏、稳定回执。Page SDK 只提供已有本地 capabilities 发现与明确的 E_CONTEXT 拒绝，不自动拥有浏览器操作。可信内置 UI 走已存在的 Host-only 受信流，**不能以“官方发布”替代真实可信执行世界**。

固定 mappingKind：DIRECT（安全直接绑定）、SCOPED（施加资源/Origin/工具所有权）、COMPOSED（多 API 组成有限操作）、EXISTING_SERVICE（复用当前服务）、HOST_ONLY（只在真实可信 Host）、UNSUPPORTED（有真实平台/版本证据不可实现）。当前 nativeInterfaces 的安全分类不能被当作某项已经注册；每项批准操作的实际 nativeApis、Host、Driver 和能力在 approvedOperations 中精确记录。


### 1.1 面向扩展开发者：两条链路（2026-10-15）

**真正的用户目标**：开发者在 OpenDesk Browser 的**已安装独立 Sidebar 工具**中使用 `OpenDeskSDK.browser.*`，以统一、类型明确的接口调用经批准的 Chrome 浏览器能力，而不必为每一个普通 API 重写桥接、Facade、参数封送及 Host 路由。工具包 ID 不决定 Chrome API 的业务分组；“已安装 Sidebar 工具”与“普通网页 Page SDK / Controller / 外部 Chrome 扩展”属于不同执行身份，不能混同授权。

**链路 A：接口开发/编译链路（只负责“如何生产 API”，不执行用户操作）**

```text
固定 Chromium API JSON/WebIDL/IDL（原生名称、参数、签名与返回类型）
  → docs/api/browser-sdk-interface-matrix.json
      ├─ nativeInterfaces：官方发现、固定来源与精确原生签名
      └─ approvedOperations：唯一已批准的 OpenDesk 接口合同
          （权限、世界、Scope、手势、效果、SDK 差异）
  → scripts/generate-browser-bindings.mjs（现有唯一编译入口）
      ├─ src/framework/sdk/browser-direct.generated.js（仅限批准的 DIRECT）
      ├─ docs/api/browser-sdk-binding-catalog.generated.json（只读编译目录）
      ├─ src/framework/sdk/browser-contract.js + browser-schemas.js
      │   （Registry/Schema 消费结果；非 DIRECT 尚有手写项）
      └─ scripts/browser-sdk-developer.mjs
          → browser-sdk.developer.generated.d.ts / .md（生成能力已测试，文件未正式提交）
```

**链路 A 当前不等于完整自动化**：正式 3 个 DIRECT 接口已从批准矩阵派生 Registry、Schema、绑定并经已有 SDK Facade 挂载；生成器目前对 DIRECT 的实际限制是**同名、只读、Promise、无网站 Scope**。参数标量别名只在测试夹具证明，**不同 SDK/Chrome 方法名、复合参数和返回值转换没有正式闭环**。目前不少 SCOPED/EXISTING_SERVICE/COMPOSED 仍要在 `browser-contract.js`、`browser-schemas.js` 手工定义，不能因为生成了目录或开发者类型就声称人工维护成本已达标。Chromium 官方签名只用于可验证的类型推导，发现条目**不能直接批准权限**。

**链路 B：安装工具的真实调用/安全执行链路（运行期）**

```text
examples/sidebar-tools/<tool-id>/tool.config.json（声明所需 capability）
  → 用户的工具 JavaScript：OpenDeskSDK.browser.<namespace>.<method>(...)
  → src/framework/sdk/browser.js（统一公开 Facade、校验输入）
  → src/sidebar-tools/bridge.js（不可信工具 iframe 通过消息请求）
  → src/ui/sidebar-tools.js（安装身份、权限、包 hash、epoch、站点/用户意图）
  → src/platform/chrome/context-menus.js（原有唯一可信 Browser Host）
      （真实 Sender/Document、Chrome 权限、授权复核、撤销与生命周期）
  → src/framework/sdk/browser-bindings.js（只允许编译过的已批准绑定）
      ├─ DIRECT → 有限且固定的 Chrome Promise API
      └─ SCOPED / EXISTING_SERVICE / COMPOSED
           → 既有可信 Driver / Service → Chrome 原生 API
  → JSON/大小/返回值检查 + 结束前再验权限
  → Bridge → 开发者得到安全结果或明确错误
```

**两个真实已登记示例**：

```js
// DIRECT：已安装工具声明 browser.i18n 能力。
const language = await OpenDeskSDK.browser.i18n.detectLanguage({text:'Hello OpenDesk'});

// SCOPED：需已有权限及可信界面实际点击确认。
// Driver 调用 chrome.tabs.create，返回 SDK 安全 tabRef 而非原生 tabId。
const {tabRef} = await OpenDeskSDK.browser.tabs.create({url:'https://example.org/'});
```

**边界**：已安装工具声明 capability 不等于自动获权；浏览器能力发现不等于接口获批；不提供动态 `chrome[namespace][method]` 代理、任意 tabId 或广域 Cookie。对 Browser Tabs、Downloads、Cookies、操作手势等必须保持原 Host/Driver 中的精确站点、Document、工具身份、撤权与副作用未知处理。Page SDK 只可进行现有本地只读能力发现，不能因为本文的 SDK 例子而获得 Chrome 特权。

### 1.2 目前到底完成多少（按类型与验收等级分开）

| 口径 | 数量 / 状态 | 正确理解 |
| --- | --- | --- |
| Chromium Schema 发现 | 191 个源文件、1,830 个发现条目 | 是接口发现目录；未在每次 CI 完整重解析全部上游原始字节 |
| 正式批准合同 | 72 | `approvedOperations`；不是 72 个原生验收成功 |
| 已登记的公开 SDK 方法 | 70 | Registry/Facade 已有相应源码：DIRECT 3、SCOPED 49、CUSTOM 18 |
| 不公开的可信 Host-only | 2 | 不允许普通安装工具直接使用 |
| 可复用的正式 DIRECT 自动生成 | 3 | `runtime.getPlatformInfo` / `i18n.getAcceptLanguages` / `i18n.detectLanguage`；有 Node/Host 假 Chrome 路径证据 |
| 复杂映射、Schema 去重复 | PARTIAL | 带作用域 Driver 已有，但通用映射生成和去手写工作尚未证明 |
| 开发者类型/API 文档 | 生成器有 Node 证据 | `.d.ts`、`.md` 正式生成文件尚未提交；漂移检查需纳入持续验收 |
| 剩余历史候选 | 91 个名称 | 不是 91 项已经批准或需要无条件开放的 Chrome API |
| 本轮所有接口的真实 Chrome / 独立产品评分 | NOT_TESTED / NOT_SCORED | Node PASS、源码登记与 Build/Native 绝不互相替代 |

上述数字可用 `docs/api/browser-sdk-binding-catalog.generated.json#counts` 和 `bindings[].mode` 复核。下文 R10.6 `55/53` 属于其日期对应的历史快照，不能作为当前统计。每轮重新核对最新 `main`，不能把本节 2026-10-15 的快照长期当作动态真值。

### 1.3 下一阶段怎样推进（拒绝重复造框架）

1. **先完成可执行映射机制，不按 API 数量冲业绩**：三个验证场景分别为正式同名 DIRECT（`i18n.detectLanguage`）、正式有权限/返回转换的 SCOPED（`tabs.create` + 可信 Driver/TabRef）、未额外获批的测试夹具（SDK/Chrome 名称或参数不同）。再选一个现有 EXISTING_SERVICE 做去重复回归，但不能把工具存储当作主要业务目标。
2. **减少实际人工维护**：在现有批准矩阵和 `generate-browser-bindings.mjs` 内完成原生签名类型推导、必须人工审核的差异、预编译映射、Registry/Schema/SDK/`.d.ts`/`.md` 一致派生。禁止出现第二份手工 Registry 或新的动态 Chrome RPC；特殊作用域继续复用旧 Driver，不生成权限决策。
3. **证明能够复用到第二个不同方法**：用前后源代码差异统计人工必改文件、手写代码点和同一 Host 调用/拒绝结果。普通获批接口不再逐项手写 Facade/Schema/Host 分支，才可标记 `ARCHITECTURE_PROVEN`。修改只是减少 JSON 行数、生成额外报表或迁移一个孤立方法，仍标记 PARTIAL。
4. **分级交付**：定向 Node 正反向、冻结检查、真实生成并检查类型/文档、生产/开发构建、安装工具调用与真实 Chrome 分开记录；不能绕过其他并行扩展的安全构建门禁。架构证明通过后，按现有 91 项分类、实际需求、用户价值和权限风险逐批推进，优先复用已有 canonical SDK 能力。

## 2. 全接口目录的事实约束与分类

本轮固定范围从 Chromium 提交 b5485910372708cd11d9a814a3e382fe8da57df3 下 chrome/common/extensions/api/、extensions/common/api/ 根目录全部可枚举的 JSON、WebIDL、IDL 文件及 chrome/common/extensions/api/devtools/ 内 5 个 Schema 读取，保留原始 Git blob SHA；共 191 个 Schema。11 个纯类型/manifest 声明文件不具有公共顶层 Namespace，sourceFiles 明确列为 NO_PUBLIC_NAMESPACE_DEFINITION，不臆造操作。初版 chrome-native-api-catalog.json 的 119 个条目均包含在新矩阵中，旧 8 Namespace 目录**仍是 R8 历史种子，不得作为新的全量分母**。

矩阵 bucket 含义：

| 分类 | 处理决定 |
| --- | --- |
| SCOPED_OR_TRUSTED_CANDIDATE | 原生存在，必须进一步有逐项最小权限与所有权映射；只有 approvedOperationIds 所指操作得到实施批准 |
| TRUSTED_HOST_OR_EXISTING_SERVICE | 浏览器广域、身份、注入、拦截、权限、全局存储或生命周期能力；不得给不可信工具建立原生代理，必须走现有可信 Host / service |
| INTERNAL_NOT_EXPOSED | Chromium 内部、private、experimental、测试接口；不是普通扩展稳定 API |
| PLATFORM_OR_POLICY_ONLY | ChromeOS、kiosk、企业策略或指定系统条件；Mac 桌面一般运行环境不满足 |
| LEGACY_NOT_EXPOSED | Chrome App、MV2、历史或废弃接口；不是新 SDK 目标 |
| DEVTOOLS_ONLY | 需要 DevTools 扩展页面/独立权限环境，当前工具执行世界不可用 |
| NOT_APPROVED_FOR_TOOL | 已发现但未获得开放授权/产品需求，不直接公开；仍保留原生签名、来源与理由 |
| VERSION_GATED | 有明确最低版本证据（如 sidePanel.close 145），按最低 Chrome 138 阻止误用 |

**“发现”不是“实施”。** 初版 1,830 条目中允许保留后续产品能力未获批准的分类；不得因为要凑“全接口”就向任意工具暴露敏感 Chrome 原生 API。若后续确需开放，先按本手册的既定模板在同一矩阵补准确合同，安全审查只是接口范围决策，不意味着为用户自写 JS 库引入逐库人工审核。

范围说明：这份目录是上述**固定 Chromium Schema 来源**的穷尽解析，不宣称覆盖 Chrome 浏览器内部一切未被这些 Schema 声明的 API，也不宣称对每一个新增 Chrome 版本的可用性都完成 Native 测试。发现、稳定性、原生可用性必须分别记录；源文件枚举缺漏或新版 IDL 差异的实际证据需在 P0 补充同一矩阵。

## 3. 已批准接口合同的机器事实

docs/api/browser-sdk-interface-matrix.json#approvedOperations 是唯一逐接口实施清单。每条含 operation ID、精确签名、输入/输出 Schema（现行注册项引用真实 browser-schemas.js 对应操作）、公开/Host-only 信任等级、Chrome 权限、工具 Capability、Origin/TabRef 作用域、用户手势、生命周期、错误码、SDK/Registry/Schema/Host/Driver 源码目标、Phase、正反向测试与真实 Chrome 证据要求。可重复计算的审核分母是 55，**不是历史 35，也不是原生发现 1,830**。

当前 55 项按责任划分：

| 领域 | 数量 | 冻结决定 |
| --- | ---: | --- |
| 非 Cookies 现行 Browser SDK | 33 | 含 P3 新接线自有下载 4 项；正确功能保留并复用 Host，SOURCE_WIRED 不等于 NATIVE_PASS |
| Cookies | 11 | 已注册 `OpenDeskSDK.browser.cookies`，限已安装工具声明能力、用户在受信 Side Panel 按网站单独批准且 Host 二次验证；Page SDK 不得调用；内置可信 UI 保持独立 Host-only 身份，复用 cookies.js |
| Bookmarks、可信 History | 3 | 尚待实现：书签只操作新建自有书签，History 浏览数据只在可信 UI 显式授权；Downloads 四项已经登记在现行 33 项中 |
| Permissions | 1 | requestForTool 是可信用户手势入口，严格来自 Manifest optional_permissions/Origin，不允许第三方工具自行伪造 gesture |
| Storage | 4 | 仅已安装工具自己命名空间，必须限制字节和数量；clear 只删自己的键，绝不转为 chrome.storage.local.clear 全局清除 |
| Scheduler | 3 | 只调现有 schedule-service + chrome.alarms，为已安装的固定 Revision 授权；不创建第二个闹钟/调度数据库 |
| **合计** | **55** | 后续不得凭发现目录无审批地增加公有接口 |

下述能力没有批准成“第三方工具可自由调用”：Chrome 原生任意 cookies 全局查询/清理、全浏览器 tabId 枚举/删除、所有历史记录/下载记录、任意 chrome.scripting 注入、全局 chrome.storage、debugger、proxy、identity、management、declarativeNetRequest 动态规则、原生消息、真实浏览器监听的无界事件流。这些能力已经按 nativeInterfaces 安全 bucket 入库，但不是漏项。

### 2026-10-13 · P3 单接口局部修订（补齐已授权的同源导航）
此前 54 项矩阵漏登记用户 R9 已明确要求且源码已经实现的 `browser.tabs.navigateOwned({tabRef,url})`。按单一合同批准 **该 R9 时点 55 项 = 40 项当时 Registry（含 Cookies 11）+ 15 项当时待实施**；R10.1 当前进度以本节下方动态状态和矩阵为准。该接口只允许当前安装工具自己拥有的 TabRef 导航至**完全相同的 Origin**，执行 Chrome tabs.update({url}) 前销毁旧 TabRef，未知副作用不重试；跨 Origin、旧 Document、失效权限一律拒绝。相关源码和 Node 测试已有接线，但当前候选真实 Chrome 仍为 NOT_TESTED。原始 191 Schema / 1,830 Native 条目及来源 Hash 不变。新增只读结构校验 `scripts/check-browser-sdk-interface-matrix.mjs`：验证目录与审批映射，**不重新解析上游 191 个原始源文件**，不能替代独立上游字节复核和 Native PASS。

> **R10.1 历史时点源码与矩阵记录（44 项，不代表本轮现状）：** 正式矩阵 `approvedRegistered=44`、`approvedCookieHostOnly=0`，11 项 Cookies 均为 `APPROVED_TOOL_REGISTERED`，并受原有权限边界约束；另有独立可信内置 UI 的内部 Host-only 路由。已同步的矩阵可见性不代表 44 项全数获得 Node、Build 或 Native Chrome PASS。

### R10.1 P3 · 下载能力局部进度（2026-10-13）

正式新增 `browser.downloads.download({url,filename?,saveAs?})`、`getOwned({downloadRef})`、`listOwned({cursor?,limit?})` 和 `cancelOwned({downloadRef})` 四项。调用复用唯一 Registry / Wrapper / Browser Host，Host 拒绝未安装、错误包摘要 / Epoch、未获网站与 Chrome downloads 权限、未消费真实用户点击意图的写入 / 取消。实际 `chrome.downloads.download/search/cancel` 在受限 `src/platform/chrome/browser-downloads.js` Driver 内执行，产生易撤销、不含原生 ID 的 opaque DownloadRef；不会枚举全浏览器下载历史。Driver 不新增授权来源或并列下载数据库，内存 Ref 在 Worker 重启后自然失效；Chrome 效果无法确认时报告 `E_OUTCOME_UNKNOWN`，不得自动重试。本轮记录为 SOURCE_WIRED，Node / Build / Native Chrome 同候选状态仍 NOT_TESTED；原批准合同总数 55 不变，计划剩余 11 项。

## 4. Cookies 11 项正式 SDK 与可信 UI 的共用安全合同

唯一受信操作名（按现行 src/platform/chrome/browser-cookie-host.js#TRUSTED_COOKIE_OPERATIONS）：

1. browser.cookies.get：当前所选页面 URL 的 Cookie，按名称查询；同名跨 Path/partition 多条返回 E_COOKIE_AMBIGUOUS，不能任意选第一条。
2. browser.cookies.getAll：已安装工具只返回已明确授权的网站 URL / Cookie Store / PartitionKey 范围内的匹配集合，上限 50 条且有约 11.5 KB 的回执预算；不持有全浏览器 Cookie 列表。
3. browser.cookies.set：name/value、Path、SameSite、Secure、__Host-/__Secure- 和 Domain 不扩权，提交后按 Driver 回读/未知效果语义验收。
4. browser.cookies.remove：必须精确匹配 name/domain/path/storeId/partitionKey，缺失拒绝、歧义拒绝。
5. browser.cookies.clearSite：只作用当前所选页面实际匹配 Cookie；部分删除后的未知效果返回 E_OUTCOME_UNKNOWN，不自动重试。
6. browser.cookies.getCurrentStore：只取所选非无痕页面 Store；**不能写成 chrome.cookies.getAllCookieStores 的全局公开别名**。
7. browser.cookies.getPartitionKey：按真实 tabId/frameId/Document 取得分区键，不能猜测或使用工具提供的任意身份。
8. browser.cookies.observe.start：受信 UI 真点击；会话默认 15 秒、上限 30 秒、最多 50 条、最多 8 个并行会话，Worker 仅内存持有。
9. browser.cookies.observe.getStatus：仅读当前会话状态、缓存数量、丢弃数与 expiresAt；不消费事件。
10. browser.cookies.observe.read：以 sessionRef / 十进制 cursor / limit≤50 读取脱敏事件，返回 seq、nextCursor、gapCount、droppedCount；**绝不包含 Cookie value**。
11. browser.cookies.observe.stop：停止并撤销会话；导航、撤权、关 UI、Worker 重启使旧会话失效。

Cookies 的两种**不同身份**复用唯一的 context-menus.js Browser Host 与现有 Cookie Driver：① 安装工具通过 `OpenDeskSDK.browser.cookies.*` → iframe Bridge → Side Panel → `kind:'tool'` → `authorizedCookie` → `browser-cookie-host.js#executeInstalled`，须核查安装 packageHash、Epoch、工具 Capability、真实 Chrome 站点权限、受信 UI 分站点 read/values/write/observe/clear 授权、Origin、非无痕 Store、精确 PartitionKey 和每次写入/删除的一次性用户点击；只在**额外**授予 values 且工具声明 values 时才可向该工具返回 Cookie 明文。② 可信内置 Cookie UI 使用已有 Host-only `browser.cookies.approve` / `browser.cookies.execute` 与强 Document 绑定。内部 approve/execute 不属于公开 SDK，也不是第二 Host；不能以官方工具包来源替代安装工具真实权限。读取回执受长度与敏感值限制，事件永不含值，撤权和副作用未知不自动重试。Controller 旧 getCookies/setCookies/deleteCookiesByUrl 仍复用 cookies.js。当前属于 SOURCE_WIRED，原生 Mac Chrome 仍 NOT_TESTED。

R7 的 getStores、10 项 native-mapping 文件属于历史，不再作为当前 Cookie 名称/数量的真相；R9 实际 11 项以本手册、矩阵与真实 Host 源码一致为准。

### R9 Cookie 事件元数据作用域收紧（2026-10-13）
`chrome.cookies.onChanged` 是扩展级事件，不是当前网页独享事件。可信 Host 在缓冲任何名称/域名/路径等**脱敏元数据之前**，新增所选网页 URL 的 RFC6265 Path 匹配、HostOnly 域名匹配、StoreId 和真实 PartitionKey 属性比较。不允许其它路径、别的 HostOnly 域或其它 topLevelSite/hasCrossSiteAncestor 的事件混入；比较分区键不依赖 JSON 键的排列顺序。未分区 Cookie 仅在同一 URL/Store 规则满足时可匹配。Cookie value 依旧不进入任何事件回执。Node 和真实 Chrome 的候选验收独立，Native Chrome 仍 NOT_TESTED。

## 5. 旧架构迁移：KEEP / RENAME / MERGE / DELETE / NEW

- KEEP：当前 Registry 的正常操作与业务安全效果，保留权限与生命周期语义，但逐一复查正确 Host 和 SDK 入口。
- RENAME：browser.tabs.open → browser.tabs.create；browser.tabs.focus → browser.tabs.activateOwned；browser.tabs.closeOwned → browser.tabs.removeOwned；Cookie 可信 getStores → getCurrentStore，仓内消费者一次性改用新名字，不保留别名。getOwned/listOwned/pinOwned/reloadOwned 均是 own TabRef 作用域；reloadOwned 在发出 chrome.tabs.reload 前不可逆地撤销旧 TabRef，Chrome 回执只证明收到重新加载请求，不证明新文档加载完成。
- MERGE（SDK 入口已完成）：`browser.clipboard.writeText` 和 `browser.downloads.text` 均经正式 `browser.*` 操作调用并复用已有 Side Panel 受信导出服务；公开 Wrapper 不再转换成旧 `clipboard.writeText` / `file.download` UI alias。Node、Build 与真实 Chrome 手势/回执仍需独立验收。
- R10.5 原生下载请求与可读取资源严格区分：`browser.network.observe.export` 仅返回 `{status:'started',bytes,truncated}`；`browser.screenshot.captureVisible` 仅返回 `{status:'started',bytes,width,height}`。这只证明 Chrome 接受了下载请求，**不证明文件已保存**。两者都没有可读取的持久 ResourceRef，不对工具公开随机 `resourceRef`、原生 `downloadId` 或 PNG 字节。截图的内部临时 Ref 在 Host 内消费；保持真实用户意图、身份、Origin/Document、撤权和副作用未知不重试。
- R10.4 官方语义：Chrome `tabs.create` 本身无需 `tabs` 原生权限，现行 SDK 去掉不必要的 Chrome 权限要求，但仍要求 `browser.tabs` 工具能力、精确 Origin、真实点击与 opaque Ref；Owned 操作使用 `tabs` 敏感 URL 与 `webNavigation` Document 核验时保留实际 Host 权限。
- 受限差异：`browser.cookies.get` 有同名多 Path 候选时采用 `E_COOKIE_AMBIGUOUS` 拒绝，回执为 `{cookie,scope}`，不同于 Chrome 原生选择最长 Path 并返回 Cookie；独立 values/Store/Partition 授权不放宽。下一轮 Cookie 消费者迁移应判断是否更名以明确此差异。
- DELETE：已从现行 Registry 清理的 9 个 R8 开发期 Media/Speech/Notifications 占位不以旧 35 项义务复活。后续从所有当前测试分母/现行文档删除其“必须可调用”的假定，但历史测试和旧快照保留 Git 历史。
- NEW：Cookie observe.read；下载 own Ref 的 4 项、书签 own/可信历史、权限受信请求、隔离 storage 4 项、现有 Scheduler 3 项；以矩阵列出的精确合同实施。禁止为了名字像 Chrome 原生而隐瞒较小的可访问作用域。

每个 Phase 的**强制消费者检索范围**：src/、src/entrypoints/、src/ui/、src/sidebar-tools/、src/platform/、official-tools/、examples/、tests/、scripts/、docs/api/、docs/framework/、manifest.json，以及打包后实际生成的 Side Panel 工具入口。必须同时检索 JS、HTML、JSON、Markdown、类型、测试 fixture 的旧名字或 alias；在迁移记录列出命中路径、修改或明确不改的原因。核心现有点：src/framework/sdk/browser.js、src/framework/sdk/browser-contract.js、src/framework/sdk/browser-schemas.js、src/sidebar-tools/bridge.js、src/ui/sidebar-tools.js、src/platform/chrome/context-menus.js、src/platform/chrome/browser-tabs.js、src/platform/chrome/browser-cookie-host.js、src/ui/trusted-cookie-workbench.js、src/platform/chrome/cookies.js、src/platform/host/authority.js、src/platform/tasks/schedule-service.js、src/platform/storage/、src/platform/downloads/。

安全扫描标准命令：

~~~bash
rg -n "browser\.tabs\.(open|focus|closeOwned)|browser\.cookies\.getStores|browser\.cookies\.(approve|execute)|clipboard\.writeText|file\.download|browser-sdk-compatibility-map|BROWSER_OPERATIONS|createBrowserSdk|OpenDeskSDK\.browser" src official-tools examples tests scripts docs manifest.json
~~~

任何命中都需要判断是**当前消费者**还是**有意保留的历史资料**，禁止盲目全局替换。旧设计若仍被当前测试、生成器或文档误当成 active contract，P1 必须修复。

### R9 TabRef Same-URL Document 重新绑定防护（2026-10-13）
自有标签的 `tabRef` 在首次经 `webNavigation.getFrame` 取得 active `documentId` 时固定该 Document。若同 URL 的新 Document 替换旧 Document，而 `tabs.onUpdated` 事件遗漏，也必须撤销旧 Ref；不可仅凭 `tabId` 与完整 URL 相等继续操作。特别是 `tabs.activateOwned` 需在 Native `tabs.update` **前后**复核同一 Document、同一已安装工具和 Origin；若 Chrome 已发生副作用而后置授权变化，报告 `E_OUTCOME_UNKNOWN`，不自动重试。旧 Ref 被撤销后仍不能重新认领，且不将真实 tabId 暴露给沙箱。本安全增强仅为 SOURCE_WIRED，尚未取得同候选原生 Chrome PASS。

## 6. Phase 0–7：固定源码与通过条件

| 批次 | 精确目标与先决条件 | 必须满足的完成条件 |
| --- | --- | --- |
| P0 · 源与账本 | 固定本矩阵 sourceFiles 191 项、1830 nativeInterfaces、现有 119 种子条目全包含；核对 Chromium JSON/WebIDL/IDL、源 gitBlobSha、目标 Chrome/manifest、注册表、实际仓内消费者；不改 Chrome 权限 | 自动验证全 Schema 能解析，Namespace/Method/Event/Property 每条有 bucket 与理由，批准操作签名/Schema/路径齐全；缺来源或版本不得假设支持；记录证据和当前 Git SHA |
| P1 · 唯一调用链 | src/framework/sdk/browser-contract.js、browser-schemas.js、browser.js、src/sidebar-tools/bridge.js、src/ui/sidebar-tools.js、src/platform/chrome/context-menus.js；先完成旧 UI alias 归并 | 不存在重复 Registry/Host/Grant；真实工具身份 + 安全错误码 + no dynamic chrome.*；原 29 现行能力无回归，所有仓内旧签名消费者迁移 |
| P2 · Cookies | src/platform/chrome/browser-cookie-host.js、cookies.js、context-menus.js、src/ui/sidebar-tools.js、Cookie Editor 与受信 Cookie UI | 11 项按获授权的安装工具独立公开；无 Cookie Capability、无分站点许可、错误 Origin/Document、跨 Store/Partition、旧安装身份或撤权均拒绝；敏感值另需 values 授权，精确写/删/清理与观察游标经过 Node 后再取真实 Chrome 证据 |
| P3 · Tabs/Downloads/Bookmarks/History | src/platform/chrome/browser-tabs.js、src/platform/downloads/、src/platform/chrome 新增薄 namespace adapter（不得另建 Host）；Registry/Wrapper/Schema 同批修改 | TabRef、DownloadRef、BookmarkRef 不泄露宿主原生 ID；reloadOwned 调用前撤销旧 TabRef，未知 Native 副作用不盲重试；owned 操作不能影响其他工具/网站；History 只可信 UI；安全失败无未知重放；所有对应消费者和测试同批更新 |
| P4 · Permissions/Storage | src/platform/chrome/permission-gate.js、src/platform/storage/、src/ui/sidebar-tools.js、context-menus.js；不新建 Permission DB | optional permission 只在真实用户手势请求，拒绝/撤权后即时生效；local.get/set/remove/clear 只在自己命名空间、配额可验，不影响其他工具或全局 storage |
| P5 · Scheduler | src/platform/tasks/schedule-service.js、schedule-contract.js、schedule-repository.js 与现有安装任务体系，底层 chrome.alarms 只在可信 Host；同步更新 Browser SDK 对应操作 | 已安装固定 Revision 才可排期；列表/取消只看 own；重启恢复、不重复投递、撤权取消/隔离、没有新 Scheduler |
| P6 · 事件及其他原生映射 | contextMenus、sidePanel、webNavigation、network.observe、events、runtime，以及矩阵内已批准 COMPOSED / EXISTING_SERVICE 映射；不因有 nativeInterfaces 就自动公开其余敏感能力 | 有界事件带游标/丢弃计数；观察停止与权限撤销收敛；worker 重启不可错用旧会话；Chrome 138 不支持的调用明确 E_CAPABILITY 或具体版本拒绝 |
| P7 · 完整验证与交付 | 逐批 Node/源检查、构建、真实 Mac Chrome 原生测试、SDK 与 Consumer 回归；更新唯一矩阵进度和证据并安全提交 | 每批准接口要么 NATIVE_PASS，要么明确 NOT_TESTED/BLOCKED 并附阻碍，绝不假报 100%；最新同一候选 SHA、package hash、Chrome version、sender、负向权限、Worker 生命周期与结果回执可追溯 |

执行顺序固定 P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7；具备明确独立性时可以同一阶段按组件顺序完成，但不允许绕过前置身份与权限合同直接生成原生 RPC。新增源码文件仅在矩阵已写明为 NEW adapter 的位置创建，不能另建第二框架。

## 7. 全接口签名、错误码、权限和生命周期

1. 任何批准公开操作默认单对象入参（零参用空对象语义）、Promise、稳定错误码。现行 48 项（含 Cookies 11、Downloads 自有 4 项和 Storage 4 项）输入输出 Schema **直接引用源码** src/framework/sdk/browser-schemas.js 对应 operation；其余 7 项尚属规划，只有进入真实 Registry、Host/Driver 后方可称 SOURCE_WIRED。未来修复后必须以实际源码解析结果验证机器合同，不得用“已规划”冒充实际 Validator。
2. 公共操作最小权限四联检：Chrome extension API permission / 真正已授予的 host origin / 已安装工具能力与 Epoch / 当前真实 Document 与用户授权行为。Chrome Manifest 含 <all_urls>、cookies、downloads 等权限不代表任意安装工具获得同权限。
3. Sensitive native API 映射默认拒绝，除非 matrix.approvedOperationIds 明确列出特定作用域操作。全部 Host-only 操作都不能序列化为普通 OpenDeskSDK.browser 方法给 iframe/Page。raw tabId、windowId、任意下载 ID、完整浏览历史、token 和未脱敏网络事件不得穿越普通工具沙箱；Cookie value 仅能按已安装工具身份、精确站点、非无痕 Store/Partition 与额外 values 授权定向返回，不得默认暴露。
4. 错误码以实际代码可识别的 E_SCHEMA、E_CONTEXT、E_SERVICE_UNSUPPORTED、E_CHROME_PERMISSION_REQUIRED、E_OWNER、E_DOCUMENT_CHANGED、E_USER_GESTURE_REQUIRED、E_OUTCOME_UNKNOWN、E_LIMIT 以及 Cookie 精确匹配错误为底线。不得默默吞错返回成功；更不能猜测执行是否已发生然后重试副作用。
5. Ref 必须为有界、不可猜的 opaque 句柄，与工具安装身份、权限范围、目标窗口/文档及生命周期绑定。Tool 被禁用、重装、撤权、导航、Worker 重启后不能凭旧 Ref 重新获得权限。事件流固定有界、带游标与 dropped/gap 反馈；不以永久全局监听代替已授权 session。
6. 一般公开操作只支持 sidebar-tool 的已安装受控执行世界。Page SDK 仅有已经明确的 capabilities / 本地只读发现，其他操作 E_CONTEXT。Controller 原有 RunAuthority 保持独立安全边界，不由于统一 SDK 提升 Page 或 Controller 的跨身份权限。
7. 新增签名的显示样例与精确 JSON inputSchema/outputSchema 以矩阵为准；若后续发现某 Schema 在 Chrome 138 不适用，先保存真实 Native 平台证据并局部标记 VERSION_GATED / BLOCKED，而不是为凑数量增加特权兜底。

## 8. 测试、证据等级和反向验收

| 状态 | 唯一含义 | 最低证据 |
| --- | --- | --- |
| SOURCE_WIRED | 源码的 SDK → Host → Driver 路由可以静态追踪 | 目标文件、调用图、精确提交 SHA、参数/返回合同 |
| NODE_PASS | 针对候选源码的正向与拒绝用例通过 | 测试命令、退出码、原始输出、候选 SHA；不能叫 Chrome PASS |
| BUILD_PASS | 生产/开发构建或特定指定产物检查通过 | npm run check、npm run build / build:dev 等精确命令与实际产物哈希 |
| NATIVE_PASS | 同候选真实 Chrome 扩展安装、真实 Sender、真实用户动作及 Chrome API 回执通过 | SHA、Package hash、Chrome version、扩展 ID、操作名、Origin/Document/工具 Epoch、实际 receipt、撤权负向及 Worker 生命周期日志 |
| NOT_TESTED | 当前候选没有本等级可核验原始证据；历史候选 PASS 不能继承 | 记录 NOT_TESTED + 原因/测试入口 |
| BLOCKED | 真实环境/平台/权限/安全或测试条件阻止继续 | 准确 blocker、受影响 ID、来源与解除条件；不得自动降级为 PASS |

每批准操作至少有：Schema 正向；未知字段/错误入参；未安装或禁用工具；恶意/伪 Sender；错误 Origin/Document；旧 installEpoch；权限拒绝/撤权；用户手势伪造；资源越界；重复调用或不确定 Chrome 副作用；正常 Worker 重启/导航；当前候选真实 Chrome 原生行为。若某项不适用（例如零参 capabilities），记录明确 N/A 理由而非静默删除负向断言。

标准源码检查与局部测试入口：

~~~bash
node scripts/sync-chrome-api-catalog.mjs --check
node --test tests/environment/browser-sdk-r8-catalog.test.mjs
node --test tests/environment/browser-sdk-coverage.test.mjs tests/environment/browser-sdk-r2-host.test.mjs
node --test tests/environment/browser-sdk-r7-trusted-cookies.test.mjs tests/environment/browser-sdk-r8-cookies.test.mjs
node --test tests/environment/browser-tabs-host.test.mjs
npm run check
npm run build
~~~

旧 sync-chrome-api-catalog 脚本目前仍针对历史 8 Namespace 种子；P0 必须核对其范围并使新的完整接口矩阵具有**可复算的来源覆盖检查**，不能把旧 check PASS 等同新的 191 源扫描 PASS。新增 P3–P6 的测试文件应按矩阵 testContract.target 创建。真正 Chrome 原生由用户 Mac Chrome for Testing 的单一占用者执行，不以 Mock、DOM synthetic click、伪造日志或 UI 截图冒充。

本设计阶段通过 GitHub API 只读核查和 Git Blob 生成矩阵，不等于在用户 Mac 运行 Node、构建或 Chrome；所以现行接口的候选 Node/Build/Native 初始均保留 NOT_TESTED，原有历史证据不覆盖。

## 9. 95 分制设计门禁与真实完成条件

五维各 20 分、总 100 分：覆盖完整性（固定 Schema 的 Namespace/Method/Event/Property 有源和分类）；架构一致性（只有一个 Registry/公开入口/Host、不同执行世界不偷换身份）；可执行性（55 项签名、源码目标、P0–P7 和消费迁移）；安全性（真实手势、最小权限、Cookie 精确身份、撤权、未知副作用）；测试可验证性（正反向用例、同候选 Native 证据、状态不得串级）。**只有 ≥95 且无关键未决架构选择、相互矛盾源码事实和未解决写入冲突，才允许在交付报告中称 DESIGN FROZEN。** 不能用“设计评分”代替“实现进度”或真实 Chrome PASS。

不构成设计阻碍的实施问题：缺少未来 P3–P6 源码、尚未跑 Mac Chrome、当前某条操作仍 NODE/BUILD NOT_TESTED；它们由各自阶段执行合同解决。构成设计阻碍的问题：发现已批准接口存在不可表达的安全权限、Chrome 最低版本无法实现且无明确定义的降级策略、源码现状否定本手册宣称的接口或 Schema、无法确认安全写入原仓库。出现这些情况不得假称封版，必须留下明确的 blocker/证据，先局部修订同一两份正式文档。

## 10. 安全 Git 规则与实施自动循环

1. 唯一可写分支 main；只读核查 git branch/status/HEAD、origin/main、目标文件差异、当前并行写入与测试资源占用。**没有本地 Mac 挂载时不得声称检查了 Mac 工作区**，可以在不冲突时只对远端进行基于 latest HEAD 的条件式提交。
2. 任何并行 Agent 正在改同文件、存在无法解释的 worktree 差异、远端 HEAD lease 失败时，停止写入，说明冲突。不得新建分支、worktree、PR、强推、reset、覆盖 public-owner.json 或历史 native receipt。
3. 一次只执行矩阵中的第一项 status 未达本阶段完成条件的批准操作；核对来源与消费者，修改真实源码，做定向测试和负向测试；更新同一矩阵 status、验证级别和证据 SHA，安全提交 main；继续下一条。
4. 每组接口完成后复核 Phase 条件；只有相同候选的 Node/Build/Native 证据才能进到对应 PASS，不因为其他对话或旧候选曾成功而自动继承。
5. 后续对话默认执行以下续接指令，无需再写一份总体 GOAL：**读取 AGENTS.md → 本手册 → 矩阵 → 当前 BROWSER_OPERATIONS / Host / Driver → 找第一未完成批准操作 → 修改源码和消费者 → 定向测试 → 原生验证或标记 NOT_TESTED/BLOCKED → 更新矩阵与账本 → 安全提交 main → 下一项。** 仅在实际重大阻碍时局部修改本手册，不进行全面架构重新选型。

## 11. 历史索引与来源

- **现行合同优先**：[Browser SDK 预发布收敛合同](browser-sdk-prelaunch-contract-20261013.zh-CN.md)、本手册、[接口矩阵](browser-sdk-interface-matrix.json)、AGENTS.md。
- **旧资料归档继续保留**：browser-sdk-architecture-r8.zh-CN.md（旧 35 项保留要求已失效）、browser-sdk-compatibility-map.json（仅迁移检索输入）、browser-sdk-native-mapping.json（R7 10 项 Host 私有历史，不覆盖 R9 11 项）、browser-sdk-full-interface-inventory.zh-CN.md（114 候选历史）、chrome-native-api-catalog.json（原始 8 Namespace / 119 条种子）、docs/framework/workstreams/browser-framework-four-layer-ledger.json（旧分层快照）。
- **现行组件验收账本**：docs/framework/workstreams/browser-sdk-acceptance.json；只引用有实际候选 SHA 的既存事实，不篡改历史收据。
- **官方参考**：https://developer.chrome.com/docs/extensions/reference/api ，https://github.com/chromium/chromium/tree/b5485910372708cd11d9a814a3e382fe8da57df3/extensions/common/api ，https://github.com/chromium/chromium/tree/b5485910372708cd11d9a814a3e382fe8da57df3/chrome/common/extensions/api 。
- **运行时事实与验收资料不等同**：src/framework/sdk/browser-contract.js 是当前“真正在 Registry 注册”的事实；矩阵 approvedOperations 是后续设计准入；Native evidence 只能由用户 Mac 的真实 Chrome 测试产生。

**手册状态变更约束**：一旦在 main 中以无冲突提交与完整矩阵校验完成封版，正式进入 IMPLEMENTATION ONLY；后续不再创建第二份 Browser SDK 总体执行手册。


### R10.3 · 工具隔离 Storage 接线（2026-10-13）

以上 R10.1 的 44/11 数字是历史候选快照，本轮批准接口总数仍为 **55**。正式 Registry 新增 `browser.storage.local.get/set/remove/clear` 四项源码接线，合计 **48 项 SOURCE_WIRED，7 项待实施**（Bookmarks 2、可信 History 1、可信 Permissions 1、Scheduler 3）。复用现有 Side Panel 每工具存储命名空间、每工具 Web Lock 与回读确认，不新建存储数据库。clear 需要可信 Side Panel 真点击和 Host 一次性 Intent；普通读写须核实安装版本、包摘要、Install Epoch、工具能力及 Chrome 原生权限。所有同候选 Node、Build、Native Chrome 证据仍为 NOT_TESTED，不把源码登记当作最终验收。

### R10.5 Registry 发现回执预算

`browser.capabilities.list` 返回全部当前 48 项带权限状态的类型化条目，不为旧 12 KB 门槛裁剪或隐藏拒绝原因。仅该只读发现接口采用 **20 KB** 响应上限；其他 Browser SDK 操作继续保留原 12 KB 限制，最大 64 条 Schema 数组及所有权限/Origin/身份检查保持不变。
