# OpenDesk Browser：开发 → 安装 → 扩展管理 → 发布的所有权与格式合同

> 决策日期：2026-10-19。此文是跨类型的**产品与架构职责规范**，不是新增 Installer、统一格式的 Schema 或已经完成的线上发布回执。事实来源按 2026-10-19 核对的 main 0131430e81be5015f50e9dbb8092d8e330f46a9b 记录；实施时仍以最新 main 与原合同为准。下面明确标识 SOURCE_VERIFIED（已有代码）、PRODUCT_DECISION（目标职责）、PROPOSED（待实施）和 NOT_IMPLEMENTED（缺失）。

## 1. 单向职责关系（PRODUCT_DECISION）

**「开发」负责创作和冻结可安装制品；「扩展」负责正式安装后的管理；「我的」负责已安装 Controller Task 的运行和计划；「发布」是独立的发行工作流，不授予本机安装或上传的默认权限。**

    开发：创建 / 编辑 / 预览 / 构建 / 校验固定版本
                  │
                  ├── 安装到本机（明确确认、权限审阅）
                  │           ↓
                  │    原有类型专用 Installed Authority
                  │           ↓
                  │    扩展：查看 / 设置 / 启停 / 更新 / 卸载
                  │           └── Controller Task 继续由「我的」管理
                  │
                  └── 生成可分发的固定安装包（不等于已安装）
                              ↓
                       提交公开市场（另一次明确上传/发布意图）
                              ↓
                   身份 / 来源 / 内容 / 权限 / 审核 / 上架
                              ↓
                    其他用户获取固定版本并自行审阅安装
                    （线上作者上传到市场：NOT_IMPLEMENTED）

用户在「开发」完成权限卡片、Page 预览或版本验证，均**不代表**已安装成功、已授权公开源码上传、发布审核通过或 Chrome Web Store 上架。用户应能分别选择「安装到本机」「导出安装包」「提交发布」；已安装项的更新、卸载不得要求进入「开发」或连接 Provider。

**禁止**仅因「扩展」采用一个列表，就将各类型统一为一套原生执行世界、注册表、包 Schema 或 Chrome 卸载 API。OpenDesk Browser 是一款 Chrome Extension；OpenDesk 内的 Sidebar App 和 Page Program 不是两个独立的 CRX/Chrome Extension。

## 2. 三种真实安装制品，不可相互伪装（SOURCE_VERIFIED）

| 类型 / 用户看到的位置 | 当前可导入/冻结的格式 | 关键内容与执行世界 | 当前权威 |
| --- | --- | --- | --- |
| Sidebar App / 「扩展 · 应用」 | 项目正式文件 **（工具 ID）.opendesk-tool.json**；format = **opendesk.sidebar-tool.v1** 或 **opendesk.sidebar-tool.v2** | id、version、title、description、capabilities、html/css/js；可选 uiRuntime、backgroundPolicy；v2 有 requires、contributes、可选 scripts。打开时在 opaque-origin iframe 运行，通过获准 SDK/Host 调用能力 | src/ui/sidebar-tools/package.js、installation.js，SIDEBAR_TOOL_STORE |
| Page Program / 「扩展 · 网页增强」 | **.opendesk-page.json**；format = **opendesk.page-install.v1** | programId、version、title、revision、entryFormat、sourceUtf8、sourceHash、pageRules、packageHash（共十个且不允许额外字段）；在经授权的网站 USER_SCRIPT 世界按安装规则自动执行 | src/scripting/user-scripts/page-install-package.js、installed-programs.js，Installed Page Authority |
| Controller Task / 「我的」 | format = **opendesk.task-package.v1**，内含 **opendesk.task.v1** manifest | taskId、version、siteOrigins、permissions、paramsSchema、固定程序 sourceHash 等；只由用户 Run 或独立批准的计划触发，使用 Controller Worker/RunHost | src/platform/tasks/contract.js，Task Authority |

以上三种都是 **OpenDesk 的安装数据格式**。其中 Sidebar App 和 Page Program 在同一个「扩展」产品列表投影，但底层执行/撤权方式不同；Controller Task 不因可以被开发或发布就自动转为 App。

**真实格式约束（不可用想象的统一 JSON 覆盖）：**

- Sidebar v1/v2 的 package 内容通过 validateSidebarToolPackage 校验，当前数组存储键为 **opendesk.sidebar-tools.installed.v1**；单工具数据另有 **opendesk.sidebar-tools.data.v1:** 前缀，启停状态和来源/授权仍各自有权威记录。原 ID、包版本和数据隔离应在原位升级时得到保护。
- Page 离线安装包必须校验 sourceHash、packageHash 和固定 pageRules；当前离线导入不接受远程 @require 或未闭合的 ESM，限制顶层 document_idle / USER_SCRIPT。**它不是 Chrome manifest.json**，不声明独立扩展权限。
- Task manifest 目前只接受一个精确网站 origin 与 page.automation 能力；Task 安装和运行证明不等价于 Page 的自动脚本注册证明。
- 用户欲发行独立 Chrome Web Store 扩展（CRX/manifest）是**另一条产品线**，本规范不假定 OpenDesk App/Page 安装包可直接提交 Chrome Web Store。

## 3. 分清五类数据与身份（PRODUCT_DECISION + SOURCE_VERIFIED）

| 数据层 | 保存什么 | 绝不能推导为 |
| --- | --- | --- |
| 开发项目 / Draft | 可编辑源码、临时预览、Provider/CLI 绑定、Run/Preview 证据 | 已安装或可公开发布 |
| 冻结候选 / Build Artifact | 固定源码字节、依赖锁、sourceHash、版本/manifestHash、可复现资源 | 自动执行许可；可以随意删除的临时缓存 |
| 正式安装 / Installed Authority | 已安装 ID、版本、包/清单哈希、安装世代、授权范围、启停与原生核验状态 | 公网已经上架；站点新增权限已批准 |
| 扩展用户私有数据 | 工具独有数据、配置、既有保存内容、授予网站的权限、撤销与清理记录 | 制品发布内容；可以随源码上传或版本升级随意清空 |
| 发布目录 / Release & Catalog | 作者/发行来源、不可变版本与包字节摘要、审核、上架/下架、更新说明 | 用户机器已安装、已有权限或正在运行 |

关键三重身份：

- **制品身份**：Sidebar 的 tool id + version + 经验证的 package digest；Page 的 programId + revision + manifestHash/sourceHash。格式不同，不由单个字符串判断可信。
- **本机安装身份**：Page 的 installationId + authorization.generation 等受信记录；Sidebar 的包身份/安装生命周期和撤销代际。它们不得从公网显示名、文件名或开发草稿直接继承授权。
- **发行身份（待实现）**：独立 publisher/namespace + 不可变 release version + artifact type + 内容摘要 + 审核/来源证明。与本地 ID 映射前要做冲突校验，不能仅凭相同 ID 覆盖另一作者的安装及数据。

发行身份相关字段只是**产品概念**，并非已实现的数据结构。特别是 Page 离线包目前严格只允许十个字段，市场作者、许可证、截图、签名或审核状态等**不得直接混入该 JSON**。未来应在独立的经过版本化审核的发行描述中绑定精确包哈希，且不得创建第二份本机 Installed Authority。

## 4. Page 的「安装包」与「已安装记录」确实不同（SOURCE_VERIFIED）

Page 离线安装包的十个键来自 page-install-package.js：

| 安装包字段 | 意义 |
| --- | --- |
| format | opendesk.page-install.v1 |
| programId / version / revision / title | 程序与可读发行版本、技术修订、名称 |
| entryFormat | classic-userscript 或 async-main |
| sourceUtf8 / sourceHash | 冻结页面源码与源字节 SHA-256 |
| pageRules | 网站匹配/排除、世界和运行时机（经解析校验） |
| packageHash | 对其余九个字段计算的规范摘要 |

安装后**不是**把上面的 JSON 当作 Sidebar App 存进去。现有 Page Authority 在 frameworkKV 中保存 tag = **page-installed-v1** 的正式记录，重要字段包括：

- namespace、programId、revision、title、manifestHash、sourceHash、builtinIdentity、pageRules；
- enabled、nativeId、nativeState、token、installedAt、error；
- authorization（installationId、generation、status、scope、approvedAt）；
- 可选 managedCleanup、lastExecution 等恢复和运行结果信息。

它的原生效果通过 Chrome 的 userScripts 注册引导。安全的卸载顺序是：按精确安装身份先阻止新执行 → 注销与 getScripts 读回 → 受管页面清理核对 → 删除正式安装记录 → 再次读回。已经打开的网页可能保留旧副作用，需要告知刷新。这与 Sidebar App 的原安装记录清理不相同，**不代表出现了第二套错误安装方式**。

**当前仍待验证的耦合点**：Page 已安装版本的 descriptor/material() 仍调用 dependency-manager.js 的 readStoredPageCandidate() 读取**持久化冻结 Candidate**。这并不需要在线 Provider 或开发界面，但不能凭“Candidate”名称将它当作可安全删除的草稿。必须先证明已安装产物拥有被保护的资源引用或迁移所有权，再考虑 Candidate 清理和去重；否则可能破坏重启、更新或卸载。

## 5. 本地安装链：统一用户入口，不抹平安全差异

- 从开发的 Page 本地项目：本地源码/成功验证 → 准备并审核固定 Page 版本 → 已有 import/verify/available 前置步骤 → **installPageProgram** → Installed Page Authority。
- 从「扩展」导入 .opendesk-page.json：严格校验离线包 → 独立确认网站权限 → **importPageInstallPackage → installPageProgram** → **同一个** Installed Page Authority。
- Sidebar 的本地 JSON 与官方随包 Catalog：已有 **installReviewedSidebarTool**，使用 Sidebar 原独立安装存储与沙箱。不得把 Page 包转换为 Sidebar 包。
- 「扩展」统一列表只读取以上权威记录的投影，不拥有第二个生命周期数据库；React 不应直接执行 Chrome 特权 API。
- 同 ID 更新需要比对旧权限、新网站范围、哈希与安装世代；不得因本地源码、Provider 或新 Candidate 变化自动更新，已停用版本不得被重新导入静默启用。

**后续待落地的精简**：开发中的安装编排要尽量复用现有审核/安装逻辑；只有已经被证明没有消费者且 React 真正接管的旧管理视图才可删除。不要以“一处统一 UI”为由删除类型专用 Authority 或受管清理。

## 6. 发布不是安装：三条发行阶段（SOURCE_VERIFIED / NOT_IMPLEMENTED）

| 阶段 | 当前真实能力 | 用户语义 |
| --- | --- | --- |
| A. 本机安装与离线导出 | **已有** Sidebar 正式 JSON 构建/晋升与导入；Page 离线包构建/导入；Controller 固定 Task 包 | 「安装到我的 OpenDesk」「导出可分享安装包」 |
| B. 官方随浏览器分发 | **已有** official-tools/catalog.json + 固定源码/哈希，随 OpenDesk 的 WXT 扩展版本分发（目前主要面向 Sidebar Tool） | 官方审核的随包目录更新，**不是**任何作者都能自行上传的市场 |
| C. 公开市场上传与发布 | **NOT_IMPLEMENTED**：.agents/skills/opendesk-marketplace-publish/RESERVED.md 明确没有有效的在线作者上传/审核/上架服务 | 未来「提交到 OpenDesk 市场」，不能显示虚假成功 |

已存在市场网站和有限安装交接，不等于公开发行服务器、第三方签名来源、上传回执或 Page/Task 远程发布渠道已经交付。用户的**安装权限确认**与**公开上传/发布确认**必须分开，发布过程不得默认上传私人 Cookie、站点数据、用户本机目录、密钥或安装授权。

**发布工作流建议（PROPOSED，未经服务端合同落地不得冒充正式能力）：**

1. 开发者选择类型并冻结可复现安装包，核实原始 sourceHash/packageHash、依赖、许可和能力/站点范围。
2. 选择本机安装、离线导出或「准备提交发布」；三者互不自动触发。
3. 发布前展示包类型、版本、源码上传范围、作者身份/命名空间、许可证、商店介绍、权限差异与可能公开的数据；真实用户明确确认上传。
4. 由**独立的发行渠道**验证 publisher 所有权、固定字节、重发幂等、签名/来源、恶意行为/权限审核、上架/撤回与版本不可变性，返回可读回的操作回执。
5. 市场中的其他用户按固定发行来源下载，仍在自己的 OpenDesk 受信界面重新审核与安装，使用原类型的 Installed Authority；市场网页不能代替该用户批准 Chrome 权限。
6. 更新要保留本机用户数据、已有显式停用和未变授权；来源冲突、未知回执、撤回与失败均应显式可恢复。

没有真实发布服务与经过审核的来源信任根时，第三阶段记录 **BLOCKED / ONLINE_PUBLISH_NOT_IMPLEMENTED**；不要自行捏造 API、登录、签名密钥或把前端演示按钮写成“已上架”。

### 6.1 离线发行预检命令（SOURCE_WIRED；不代表线上发布）

在任一种正式安装包构建、原 Schema 验证及冻结之后，可复用唯一离线预检：

    node scripts/prepare-extension-release.mjs --package <已冻结的安装包.json> --metadata <发行资料.json> --out <预检结果.json>

发行资料文件必须独立于可执行包，使用 schema = `opendesk.release-preflight-input.v1`，并提供 `publisherName`、`license`、`summary`、`releaseNotes`、`sourceDisclosure: "package-includes-executable-source"` 和 `screenshots` 数组（可为空；非空项需包含 `relativePath` 与 `sha256`，指向发行资料目录下的真实 PNG）。发行资料只能表达作者声明，不能代替验证作者所有权。

此命令直接调用三种原安装包校验器（Sidebar / Page / Task），不重写既有字段；核对精确文件 SHA-256、原包字节大小、发行描述和截图完整性；使用**另一个输出文件**记录 `OFFLINE_PACKAGE_VALIDATED` 和 `ONLINE_PUBLISH_NOT_IMPLEMENTED`。作者身份核验、源码安全审查、上传/审核服务及**上传授权**仍是明确未满足项。它不会更新 Installed Authority、启动代码、请求 Chrome 权限、联网或上架。结果文件不是市场准入凭证。脚本及测试以最新 main 的真实源码与测试结果为准，不用 CLI 返回值冒充真实 Chrome 或市场发布证据。

## 7. 需要修复的结构性缺口与验收证据

- **P0：安装版资源所有权**：Provider 断开和原项目不可用时继续执行固定版本 A；改变开发源码 B 不改变安装版本；对 Candidate/依赖材料清理采取引用保护或无损迁移，禁止直接删库。以真实 Chrome A→B、新文档、重启及卸载逐项证明。
- **P0：单一管理入口**：普通用户在「扩展」完成 Page 的启停/更新/卸载，无需进入开发；旧 Sidebar/Installed Page 视图只有迁完真实消费者才能删。
- **P0：数据保持**：同 ID 更新保留原工具独立存储、已停用状态和已批准网站范围；新增权限显式二次审阅；卸载只清理该安装自有资源。
- **P0：权限与副作用**：UNKNOWN 不能等于成功，不能因开发验证成功自动运行或公开上传；原生注销失败、Host 丢回执、BFCache 等只读对账、不盲重放。
- **P1：发行者工作流**：先形成可发布的包与独立来源/审核合同；确认线上服务和生产信任前不得宣称上传上架可用。Page 公开分发亦需单独评审其用户脚本来源与 Chrome 政策。
- **证据分级**：SOURCE_WIRED、NODE_PASS、BUILD_PASS、CHROME_NATIVE_PASS、MAC_CHROME_NOT_TESTED、ONLINE_PUBLISH_NOT_IMPLEMENTED 分开；文档和 JSON 校验不能冒充真实 Chrome、作者上传或市场上架。

## 8. 现有权威入口（防止重造）

- [Side Panel 五 Tab 与 Extension Center 现行产品规格](../../product/sidebar-ui-spec.zh-CN.md)
- [扩展创作工作流 / 类型选择与所有权](../../../.agents/workflows/extension-creation.md)
- [网站权限与安装即用合同](site-permission-onboarding.zh-CN.md)
- [Sidebar Tool 唯一正式打包 Skill](../../../.agents/skills/opendesk-sidebar-tool-package/SKILL.md)
- [Page / Task 正式程序发布 Skill](../../../.agents/skills/opendesk-program-publish/SKILL.md)
- [在线市场发布未实现状态与门槛](../../../.agents/skills/opendesk-marketplace-publish/RESERVED.md)
- [官方 Catalog 数据与安装路径](../../api/official-tools-catalog.zh-CN.md)
- [市场网站与正式 HTTPS 边界](app-market-website-r5.zh-CN.md)
- [Page 离线包校验](../../../src/scripting/user-scripts/page-install-package.js)、[Page Installed Authority](../../../src/scripting/user-scripts/installed-programs.js)、[Page Candidate 持久读取](../../../src/scripting/user-scripts/dependency-manager.js)
- [Sidebar 工具包合同](../../../src/ui/sidebar-tools/package.js)、[Task 包合同](../../../src/platform/tasks/contract.js)

本规范没有更改任何运行时代码、包格式、权限或已有存储。真实来源以文件与 Git 提交为证；未完成的发布和候选所有权迁移不得因规范落地而被宣称 PASS。

## 9. R6.0：一个插件多个运行组件的产品架构决策（2026-10-19）

> **PRODUCT_DECISION / DESIGN_PROPOSED，不代表已完成组合安装功能。** 研究基线 main `b44dc1971d28fe69cb4c9ac335c16fcd49f7a9cc`；编辑前核对后续 main `f13fc637cd1a17982355d4ab5ce20158481610d3` 的变更只涉及 Prompt Shortcuts 与 Cookie Editor 的预览/测试，未触及本节研究的源文件。**CHROME_NATIVE_NOT_TESTED / MAC_CHROME_NOT_TESTED / ONLINE_PUBLISH_NOT_IMPLEMENTED。** 本节追加决策而不取代上文现有格式和 Authority 合同。

### 9.1 五层概念不可互换

- **产品身份**：用户看到、选择安装、启停、更新和卸载的一个插件。一个产品可以是纯 Page、纯 Sidebar、纯 Task、第一方固定能力组合，或未来多个动态制品的组合。不得强制纯 Page 携带 Sidebar。
- **使用场景**：侧栏、网页增强、页面自动化、浏览器后台、组合应用。这是产品意图，不是代码运行世界或文件扩展名。
- **运行入口及权限世界**：Sidebar opaque sandbox；Page `USER_SCRIPT`；经过审核、随浏览器构建的可信 `ISOLATED` Content Script；Controller Worker / RunHost；宿主固定 MV3 Service Worker。共享 JS 仅在经各入口编译后成为对应产物代码，不是可单独执行的跨世界入口。
- **可安装执行制品**：既有 `opendesk.sidebar-tool.v1/v2`、`opendesk.page-install.v1`、`opendesk.task-package.v1`，由各自现有 Authority 接受。Sidebar v2 的 `scripts` 只在原 opaque sandbox 顺序执行固定 Classic 依赖，不能声明 Page 或 SW 入口。
- **发行描述、身份与生命周期**：开发草稿、固定制品、已安装授权记录、用户私有数据、市场发行元数据分别持久化。来源签名/发布者证明不能由裸 ID、SHA 或本地 filename 冒充。

### 9.2 五个真实对照及 Reading TOC 的反例

| 产品 | 动态 Sidebar 包 / 代码 | 其他源码实际归属 | 结论 |
| --- | --- | --- | --- |
| Reading TOC | `reading-toc.opendesk-tool.json` v1.0.9；其 `js` 为 `examples/sidebar-tools/reading-toc/src/main.js` | `src/reading-toc/page.js` 由 `src/entrypoints/page-relay.js` 静态加载进固定可信 Content Script；安装包**没有** Page 源码字段 | 一个 Sidebar 产品调用预编译可信网页能力；**不是**第三方可移植多世界 JS 包 |
| Prompt Shortcuts | v2 包，主 JS + `scripts[]` 中固定 `trusted/model.js` Classic 资产 | `examples/sidebar-tools/prompt-shortcuts/trusted/page.js` 静态编入原 Page Relay；菜单由固定宿主控制 | 不因网页按钮存在而迁为 `.opendesk-page.json` |
| Stay Focus | Sidebar v1 配置含 `backgroundPolicy` | `examples/sidebar-tools/stay-focus/trusted/service.js` 被 `src/sw.js` 静态导入，`trusted/page-notice.js` 编入 Relay | 关闭侧栏后仍有固定后台职责，**不支持动态 SW JS** |
| AdBlock | React Sidebar 工具，仓库源码配置 v1.2.1、仓库便携 `adblock.opendesk-tool.json` 仍 v1.2.0（需单独解决晋升） | `examples/sidebar-tools/adblock/trusted/service.js` 固定于 SW，拥有自己的 DNR 规则 | DNR 权力不能因同 ID 第三方包而继承 |
| ChatGPT Mind Map | 无 Sidebar 必需项 | `examples/programs/chatgpt-mindmap/src/main.js` 及其他源码构建为独立 USER_SCRIPT + 受管资源，正式发行采用 `opendesk.page-install.v1` | 独立 Page 是有效产品类型；本轮未原生重验，部分第三方资源公开发行许可仍受限 |

`manifest.json` 只注册原固定 `agents/page-relay.js` 等宿主脚本；`src/sidebar-tools/reading-toc-existing-tabs.js` 的修复注入也是固定宿主文件。旧固定可信能力与未来动态 Page 安装是不同信任路径，不能相互转换或统称为 `.opendesk-page.json`。

### 9.3 方案取舍：A 为兼容基线，B 为目标，C 暂不引入

- **A（保留三套专用格式且完全独立发行）**：兼容和安全成本最低，但普通用户须分别安装管理多个动态制品，不满足第三方组合产品诉求；现有第一方 fixed Host 组合仍可正常使用。
- **B（保留三套执行包，在发行与产品管理层聚合）——选择的演进方向**：一个**来源可核验的产品发行身份**引用 0–N 个不同类型、已独立校验和固定哈希的制品；不更改原代码执行世界；各 Authority 仍为唯一安装、授权、回收权威。只在有真实第二个动态组件需要整体安装时，引入**最小、非授权性的协调事务/所有权回执**。现有固定宿主能力作为经审查的 `requiredHostFeature`，**不虚构独立子安装记录**。纯 Page / Sidebar / Task 延用单独发行和安装路径。
- **C（现有格式进化为全能多入口执行包）**：会迫使严格校验器、权限、作者体验、存储迁移、失败恢复同步重做，在真实 B 验证未失败前不合理；不实施。
- **不是本轮决策**：不新建 `.opendesk-app.json`、ZIP、第二 Installer、第二 Registry/Host/SDK、通用特权 SW 入口或自动公开发布。B 所需**发行层的引用元数据及运输方式仍待 R6.1 经真实需求验证后最小定义**；不能声称现有三个严格 JSON 格式已经支持一文件组合离线安装。

### 9.4 B 的安装、运行与数据安全边界（必须先实现才可对外宣称）

1. **身份**：将经信任渠道验证的 `publisherId + productId + immutableReleaseDigest` 与已有各子安装 `kind + nativeAuthorityKey + artifactHash + installationId/generation` 关联。产品协调记录仅是可核验的所有权与事务凭据，**不是新增运行权限**。裸 `productId`、同名安装包或仅有 SHA 不构成发行者身份。
2. **组成**：声明每个子组件 `required/optional`、功能用途、固定摘要和受限权限范围；第一方内置 Content/SW 服务只标为宿主支持要求，不能附带第三方后台代码。组件相互调用必须通过已授权的 SDK/Host/RunHost 协议。
3. **安装前**：先整体验证每个子包和发行来源、版本/摘要、权限差集及目标 Chrome/SDK 能力，防止同 ID 原有安装被接管；现有子安装默认**不得静默认领**，更不得在卸载时清除。
4. **安装期间**：用户一次理解整体用途与新增权限，但 Chrome 独立手势/授权仍照原平台规则执行；操作必须有可恢复 journal。所有新子组件必须先处于**不可执行的准备态或权威执行栅栏**，随后逐一读回原生状态再提交可用。**当前 `installPageProgram` 默认首次启用并注册，尚不支持此组合阶段的原生不可执行准备**，因此这个组合一次安装闭环是 **NOT_IMPLEMENTED**；不得只增加 UI 和 JSON 就报 PASS。
5. **失败和更新**：跨 Chrome Storage、IndexedDB、`chrome.userScripts`、DNR、Controller 等没有统一原生原子事务。采用经验证的可恢复协调步骤，先栅栏再迁移；失败保护旧版本私有数据、已停用意图、已核验权限，按精确身份撤销**本次确实新创建**的子组件；部分失败显示 `degraded/cleanup-pending/outcome-unknown`，不假报整体成功，不盲目重试未知写入或副作用。
6. **停用/卸载**：整体停用必须分别调用原 Authority 的撤权/停机；Controller 正在运行需要原 RunHost 的运行栅栏，Page 要注销并处理活跃旧网页副作用，固定宿主服务停止自己的规则。卸载按所有权和版本/代际 CAS 删除，仅清理**确实归该安装拥有**的资源；共享固定宿主代码、他人组件、其他插件数据、用户真实网站数据不可删除。无证据不自动迁移本地用户数据。
7. **资源所有权 P0**：`installed-programs.js` 的 `material/descriptor` 会经 `dependency-manager.js` 的 `readStoredPageCandidate` 读取持久 `page-candidate-v1`。它是当前已安装版本运行所需的冻结源码材料，不依赖在线 Provider，但**不能按临时 Candidate 删除**。先补所有权/引用保护及 Provider 断开、开发目录删除、重启、新文档的真实验收，再重命名、迁移或 GC。
8. **发布**：独立于本机安装。签名/发布者验证、版本不可变、公开源码与许可审阅和一键获取多制品均属后续；现有 `official-tools/catalog.json` 主要描述 Sidebar 固定发行，`opendesk.release-preflight-input.v1` 只做离线预检；不能冒充线上多组件发行或商店审核通过。

### 9.5 R6.1 最小实施门禁与反方回归

- 先给出现存 A/FIXED 组合与未来 B/DYNAMIC 组合的可执行验收矩阵，不修改 v1/v2 Sidebar、Page v1、Task v1 的现有严格 Schema。
- R6.1 优先做 **read-only 产品关联试点 + 资源所有权/失败恢复证明**。若试点涉及真实跨 Authority 安装，必须先在原 Page Authority 增加经严格测试的“不可执行准备/提交”语义和取消/撤权栅栏，**否则阻止启用聚合安装动作**。禁止另造沙箱、SW 或并行 Installed Authority。
- 十个否证：Reading TOC 固定可信逻辑；Prompt Shortcuts 格式保留；纯 Page 无 Sidebar；未审阅 SW JS 注入被拒；部分安装与回执丢失；共享/他人数据不被清理；Provider 删除仍执行已安装固定源码；同 ID 跨发布者接管被拒；无第二 Installer/Registry/Host；统一 UI 不误授权。
- 实证区分 `SOURCE_VERIFIED`、`DESIGN_PROPOSED`、`NOT_IMPLEMENTED`、`NODE_PASS`、`BUILD_PASS`、`CHROME_NATIVE_PASS`、`MAC_CHROME_NOT_TESTED`。不基于架构文档、虚构分数或 Mock 宣称生产 95+。

### 9.6 开发、构建与单文件安装：R6.0 用户反馈后的交付约束（2026-10-19）

> **PRODUCT_REQUIREMENT + SOURCE_VERIFIED + DESIGN_PROPOSED（分开）**：前面的多目录是高级作者的**源码工作区示例**，绝不是用户安装后必须保留的文件结构。此前 R6.0/B 只论证了多 Authority 产品聚合，**未闭环证明一个编辑器、一个 JSON 导入的组合产品体验**；上一轮的高设计评分不可作为这部分验收依据。

**用户必须能理解的三个不同对象：**

| 层 | 普通用户看到的操作 | 现有代码事实与缺口 |
| --- | --- | --- |
| 开发 | 「开发」默认**一个代码输入框**；按需要选择当前代码的 Controller/Page 入口。只有组合项目才按需切换组件/文件，仍可复用**同一个编辑器实例**，不能强迫普通用户管理目录、多个同时打开的编辑框或本地 Provider | `src/ui/develop-fields.js` 定义唯一主要 `script-source`，`src/ui/script-editor.js` 区分 Controller/Page 缓冲区；`src/ui/local-project.js` 支持单独连接已授权目录项目。**当前直接输入框不等于已支持创建 Sidebar + Page 组合**；Sidebar 的 HTML/CSS/JS 仍由独立项目与原工具打包器提供 |
| 构建 | 点击构建固定版本后，系统对每个**执行入口**分别闭合依赖并生成固定、可验证代码；编译中允许临时目录，但不要求用户保留或导入它 | `scripts/build-sidebar-tool.mjs` 将 HTML/CSS/JS 与可选固定脚本资产写入**一个 Sidebar JSON**；`scripts/build-program-project.mjs` 将单个 Page/Controller 项目的多文件模块闭合到相应执行产物；`scripts/build-page-install-package.mjs` 将闭合 Page 源码写入**一个 Page JSON** |
| 发行/安装 | 普通单类型插件继续导入**一个原 JSON**；用户希望组合产品同样是**一次选择、一个可携带文件、一次产品审阅、一个插件卡片**，而非手动装两个互不相关的 JSON | **现有单类型方案已支持各自单 JSON。当前 Sidebar v1/v2 / Page v1 / Task v1 都是严格 Schema，无法直接把另一个类型的安装包塞进未知字段。第三方动态组合的单文件发行与整体安装仍 NOT_IMPLEMENTED** |

**一个编辑框 ≠ 只能存在一个源文件，也 ≠ 一个 JS 文件可在所有权限世界自动运行。** 推荐的用户 UI：简单模式直接编辑一个明确类型的 JS/JSX；确有多个执行入口时，在**相同编辑器**中切换「侧栏界面 / 网页增强 / 可选自动化」组件的源码，或者关联本地项目；文件选择是按需高级能力，而非新增多个并排编辑器。运行类型必须显式固定于构建配置，不能从代码关键字臆测权限。缺省直接编辑仅能按当前源码已支持的类型工作，不虚报组合一键构建已经上线。

**组合产品的“一个 JSON”怎样演进？** 首先用真实试点验证两种最小发行运输路径：
1. **候选 B1：单个 JSON 外层运输封装**，仅装载完整且逐一验证的既有 Sidebar/Page/Task 固定子包与最小产品发行元数据；解包校验和审阅后仍调用**原类型 Authority**。不允许外层授权或执行 SW JS。它**需要一个新的最小运输 Schema**，但不改动子包 Schema；在证明必要性前只属于设计候选，不创造正式文件名、后缀、安装器或发布成功状态。
2. **候选 B2：发布目录引用多个子包**，保留现有格式且改动少，但要求多个文件或者在线可靠取回，不符合“本机离线一个 JSON 文件即可导入”的用户体验；只可作为内部构建/中间制品或兼容路径，不能冒充最终产品体验。

如坚持“不增加任何新的 Schema”又要求“动态 Sidebar + Page + Task + 一个 JSON 可移植安装”，按现有三个严格校验器**不可同时满足**。必须透明权衡最小外层 Schema、在某个既有格式上推出新版本、或保留多文件；不能用旧 Sidebar `scripts[]` 冒充动态 Page 或借用第一方固定 SW 功能掩盖缺口。

**R6.1 顺序修正**：先证明「一个主要编辑器 → 两个真实运行入口的固定构建 → 一份离线 JSON（设计并严格校验候选）→ 原 Authority 安装与恢复 → 扩展中心一张卡片」的产品闭环，再把跨 Authority 安装能力标记为已实现；若安全的 Page 不可执行准备/回滚、组件所有权和已安装资源持久引用仍未闭环，**不得开放最终一键安装**。纯 Sidebar/Page/Task 原 JSON、原 UI 流程不迁移。此处为目标与缺口说明，不代表 Browser/Native/真实 Chrome 测试通过。

