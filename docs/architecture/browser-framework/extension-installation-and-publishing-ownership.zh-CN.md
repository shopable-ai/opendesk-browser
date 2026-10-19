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
| Sidebar App / 「扩展 · 应用」 | 项目正式文件 **<id>.opendesk-tool.json**；format = **opendesk.sidebar-tool.v1** 或 **opendesk.sidebar-tool.v2** | id、version、title、description、capabilities、html/css/js；可选 uiRuntime、backgroundPolicy；v2 有 requires、contributes、可选 scripts。打开时在 opaque-origin iframe 运行，通过获准 SDK/Host 调用能力 | src/ui/sidebar-tools/package.js、installation.js，SIDEBAR_TOOL_STORE |
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
