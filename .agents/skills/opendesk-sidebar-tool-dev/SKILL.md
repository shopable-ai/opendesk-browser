---
name: opendesk-sidebar-tool-dev
description: Author, iterate and preview sandboxed 扩展 center Sidebar App UI and business logic in existing independent tool projects with OpenDeskTool.request; hand off packaging, install verification and offline release to opendesk-sidebar-tool-package, not Page/Task or audited trusted runtime features.
---

# OpenDesk Browser · 扩展中心应用（Sidebar Tool）开发 Skill

## 普通用户的完整操作闭环：描述 → 预览 → 更新

**这是普通用户的入口 Skill。** 用户可以只说「修改阅读目录四个按钮，然后更新我已安装的阅读目录」。AI/Codex 自行定位原应用、复用已确认需求、修改原源码并运行核心交互，用户不必阅读 `src/`、WXT、MV3 或执行 Browser 编译命令。用户端操作说明见 [扩展应用开发与更新](../../../docs/product/extension-app-user-workflow.zh-CN.md)。

- **新建**：用一句话描述功能 → AI 确定应用/网页增强类型与原有权限合同 → 正式源码同源预览和定向修复 → 转打包 Skill 准备版本 → 用户通过「扩展」审阅确认安装 → 打开并验证。
- **更新已安装应用**：核对旧工具 ID、版本、数据和能力 → 在原项目修复 → 只验证变化 → Codex 调用 `npm run app:update -- <id>` 准备同 ID 正式包 → 用户在「扩展」审阅确认更新 → 重开应用、核对旧数据和功能。**禁止先卸载再安装**。
- **网页增强**：保留 Page Program 的独立冻结和安装机制，切勿用 Sidebar JSON 假装能装它。
- **混合型第一方应用**：例如阅读目录侧栏 UI 可独立更新，但其 `trusted/` 网页悬浮目录由 Browser 固定 Content Script 提供；仅更新 JSON 不改变网页脚本。AI 应协调受信功能/Browser 维护者处理实际静态变更；用户仍只接收一个完整的更新结论，不必自行编译插件。

当前 `app:update` 命令自动处理应用版本检查、无扩权的 PATCH 提升、相关 Node 测试、单一正式包晋升与 SHA 核验；**不会调用 Chrome 安装器、绕过安装确认或承诺用户 Mac 的安装已生效**。如需要真实本机验收但无设备条件，明确 `INSTALLED_CHROME_NOT_TESTED`。用户描述中出现「浏览器插件本体编译/重载/打包」时应直接路由管理员 Skill，而非要求普通应用用户学习 WXT。

**当前入口限制**：该命令仍固定查找 examples owner，且不自动发现全部项目自有测试；对于 `projects/` 产品，应由 AI 按[目录合同第 6 节](../../../docs/architecture/extension-project-layout.zh-CN.md#6-当前支持与明确缺口)选择现有路径参数打包/验证/晋升链或交平台 owner 修复入口，不让普通用户迁回旧目录，也不把部分 Node PASS 当成全部业务已验证。

## 触发与文档优先级

当用户说「在**扩展**里开发、安装、打开或管理一个**小应用**」或要求 AI/Codex 创建、修改、打包、预览、安装和验收 Side Panel 可安装应用时使用。**「扩展」是一级 Tab，「应用」是行级类型标签**，不是单独 Tab。本 Skill 不负责 Controller Task、Page USER_SCRIPT「网页增强」或第一方可信功能。

先用 [五种使用场景与多 JS 分工指南](../../../docs/api/extension-development-selection.zh-CN.md) 判断：侧栏管理 UI 选本 Skill；自动化、网页增强各走原脚本合同；后台服务先核查受审固定能力；组合式应用按职责协作，不能声明一个 JSON 就取得任意后台 JS 或创建第五套 Runtime。再读 [R4 现行产品导航与术语](../../../docs/product/sidebar-ui-spec.zh-CN.md)。保留技术模型 `examples/sidebar-tools/<id>/`、`opendesk.sidebar-tool.v1/v2`、opaque-origin iframe、`OpenDeskTool.request`、打包器、Host 和安装协议，**不因产品叫扩展而改变技术身份**。

**零技术输入的前置关卡**：一句话新建工具且需求尚未明确时，按[自然语言扩展开发工作流 R2](../../workflows/extension-creation.md) 的 Phase 0–3 恢复/明确产品场景、F/S/A 与 P0/P1，通过 Gate A 再实施。已有工具的明确修复先恢复已批准需求、原型和最新源码，不因新一句短话重新做整套需求/设计关卡；权限、隐私和不可逆行为仍保留原批准门禁。后续只进入当前任务需要的开发、预览或打包阶段，不建立新路由器；当前自动化执行入口仍为 `NOT_IMPLEMENTED`。

先核对 [AGENTS.md](../../../AGENTS.md) 的当前阶段、真实 `main`、相关 diff 和工具自身 README/范围内规则；其余资料按需取用：

- [统一开发规范](../../../docs/api/sidebar-tool-development.zh-CN.md)：本次项目结构、UI 或交付对应章节，不顺次执行全部阶段。
- [公开 API 合同](../../../docs/api/sidebar-tools.zh-CN.md)：本次使用的 schema、操作、权限和可信边界。
- [示例导航](../../../examples/sidebar-tools/README.zh-CN.md)：需要选择实现模式时查相符示例；已有工具不为读完示例而扩大调查。
- [测试指南](../../../docs/framework/testing-guide.md) 与相关原始证据：准备执行验证或复用证据时查；没有运行资源需求时不做环境巡检。

**已安装复合工具的身份保护**：Prompt Shortcuts 的实际 `tool.config.json` 是 Sidebar Tool v2，网页操作由原 `trusted/page.js` 与宿主受审 Browser SDK 提供；Cookie Editor/Bookmark Manager 也保留已授权 v2 SDK。修改这类工具的 UI 或网站规则，不得仅根据“网页按钮”就改成 Page Program，也不能扩大原私有能力为第三方通用 `request`。正式来源、安装与权限按 [公开 Browser SDK v2](../../../docs/api/browser-sdk.zh-CN.md) 和各工具 README 核对。

**第三方作者免读 Browser 内部源码**：本 Skill、公开 SDK/Schema、示例和工具自身 README 足够作为默认开发输入。`src/ui/sidebar-tools/package.js` 等内部实现仅供平台维护者在已证明通用缺口时调查；不能要求普通用户读取 Broker/Host，也不能靠某工具需求新增通用运行器。无证据时记 `SDK_GAP_NOT_PROVEN`。

**开发前发现与复用**：先执行[唯一工作流的发现与复用步骤](../../workflows/extension-creation.md#二-b发现与复用)，记录实际 owner/入口、下一条操作、已有消费者、公开边界及复用判断。新正式 Sidebar 产品默认 `projects/<id>/`，教学示例位于 `examples/sidebar-tools/<id>/`；已有正式项目服从自身 README/配置及实际消费者，不重建旧目录。AI Chat 先读[公共职责与最小接入](../../../docs/api/sidebar-tools-ai.zh-CN.md#独立-chat-的职责与最小接入)，复用业务无关展示/会话和受控推理；最小消费者片段仅作辅助，不复制书签 App，不把书签业务当成共享合同。业务 adapter 留工具，公共出口不足先按工作流取证再交 Runtime owner，不让普通作者先研究 Go。真实 Native/平台故障仍由对应 owner 处理，不能以此建立路径禁令。

## 工具项目归属与演进顺序（2026-10-30 更新）

**目录与测试只遵守[扩展项目目录与测试归属合同](../../../docs/architecture/extension-project-layout.zh-CN.md)**：新正式 Sidebar 产品默认 `projects/<id>/`，教学示例留 `examples/sidebar-tools/<id>/`；以下历史 examples 路径仅表示尚未迁移项目或示例，不覆盖这个新默认。先找真实 owner，不重建副本。业务测试/fixture 放 `<owner>/tests/`，框架公共安全/接线测试留根目录；当前 native.tests 的框架路径限制保持。明确现有行为覆盖缺口才加测试，不为可逆文案/样式或每轮版本新增正则文件；日常直接选相关测试，不默认根 npm test 或完整 CI。自动发现、app:update 的当前限制与迁移顺序以该合同第 6–7 节为准，不能把目录设计说成 runner 已修复。

**结构与起点按需选择**：按合同第 2 节的存在条件复用最小 HTML、React/Vue Starter；先区分自带框架与 Shared UI 模式，重设新项目身份和最小能力，不复制 dist/收据/正式包。预览模板只生成预览壳，不作源码脚手架。已有复杂目录由真实消费者决定必要性，不按最小树清理；项目级 AGENTS 只承载确有差异的边界/禁改项，命令事实由 README 维护，不强制每个项目创建。

**先在同一仓库模块化，不拆仓库、不新增一套工具体系。** 新正式 Sidebar 产品使用 `projects/<id>/`，教学示例使用 `examples/sidebar-tools/<id>/`，已有工具使用已核实的正式项目目录；官方项目的 HTML/CSS/JS 是**真实发行源码**，不是待迁移的演示副本。新增或修改一般工具优先只触碰自己的配置、UI、资产、README 和测试，不为独立二字创建 `opendesk-tools` 仓库、独立 Chrome 扩展、额外 Host 或另一套包格式。顶层“我的/扩展/工作流/开发/云控”等 Tab 是宿主产品导航，不能当作各工具的源码边界。

**按执行环境辨认代码，不以一个目录对应一个 JS World：**

| 世界 | 工具的典型责任 | 当前源码落点与接入方式 |
| --- | --- | --- |
| Sandbox 工具 UI | 表单、展示、`OpenDeskTool.request` | `<owner>/src/` 或已配置源码位置；独立构建安装的 JSON，opaque-origin iframe；不接触 `chrome.*` |
| 扩展 Background / MV3 SW | 长期策略、Alarm、Chrome DNR、事件恢复 | 确需可信服务时由已审计项目 `trusted/` 或原有 `src/<feature>/` 的**固定预编译**代码通过现有 `src/sw.js` 接线；SW 可休眠，业务状态须持久化 |
| Content Script / ISOLATED | 限定目标文档中的提醒、授权后的 DOM 操作 | 确需时经既有静态 `src/entrypoints/page-relay.js` 接线；不能依赖 Side Panel 持续打开 |
| Page / MAIN | 极少数需要网页 JS 上下文的操作 | 默认**无**此入口；如必须使用，沿用既有明确授权的 SDK/User Script 世界合同，严禁把可信宿主权限送入网站 |
| 可信 Side Panel / 扩展页面 | 真实点击、Chrome 原生权限申请、危险操作确认 | 独立项目 `trusted/tool-host.js`、`trusted/host-controls.js` 或尚在 `src/<feature>/` 的审计代码由固定扩展构建入口引用；不能从动态工具包导入 JS |
| 扩展拦截说明页 | DNR 导航说明、无敏感信息显示 | 经固定资源清单编译；不加载可安装 UI 的动态字节 |

**以已完成 R2 业务提取的 Stay Focus 为例**：当前 `projects/stay-focus/src/` 是独立工具 UI；同一项目 `trusted/` 是受审后台、策略、DNR、页面提醒和权限适配的业务源，经原 `src/sw.js`、`src/entrypoints/` 等固定入口编译；旧 `src/stay-focus/` 转发层已删除，不重建。当前 files 选择 `src/index.html` 和 `dist/tool.js/css`；预编译与来源收据按项目 README，修改固定可信模块另由 Browser 构建交付。目录名不是世界边界：纯模型可被 UI 编译引用；Prompt Shortcuts 的 v2 files.dependencies 也选择 trusted/model.js 进入沙箱，两个环境不共享内存或权限。见 [当前产品入口](../../../projects/stay-focus/README.zh-CN.md) 和 [R2 历史提取证据](../../../docs/framework/workstreams/stay-focus-extraction-r2-20261018.md)；历史路径保留。**不为路径美观二次搬动代码**。

依赖方向以 `工具 UI → 受控工具请求 → 现有可信宿主/授权 → 工具受信任服务 → Chrome 能力` 为准。共用宿主可以有**固定、审计的组合入口**，但不得继续长出某个工具的业务策略、确认文案、私有存储/DNR 清理细节；这些属于该工具的受信任模块。反过来，工具也不能复制通用安装器、消息授权、SW 或构建器。

**未来抽离的触发条件**：只有当独立发布节奏、跨产品复用或跨团队维护出现可验证的实际需求，并且现有 Catalog、源码哈希、固定入口、调试与验收可安全消费外部版本化源码时，才评估单独仓库或包。当前不引入跨仓库同步、符号链接式运行时加载、远程特权 JS 或自动扫描工具目录并授予权限。目录独立与安全隔离是两个不同指标。

**独立交付/宿主耦合检查（新增必读）**：开发工具业务时参照[宿主解耦合同与 AdBlock / Stay Focus 最新源码审计](../../../docs/architecture/browser-framework/sidebar-tool-host-decoupling.zh-CN.md)，分别确认 L1 源码归属、L2 宿主编译依赖、L3 已支持策略 JSON 独立更新、L4 后台算法升级；只把业务搬到 `trusted/` 不等于 L2/L4 已通过。默认不新增 `src/sw.js`、`page-relay.js`、通用 `installation.js` 或 Sidebar Host 的单工具 ID 分支。只有已证实的公共 SDK 缺口才能按 Runtime Skill 审查 `src/`；有界受审固定服务保留现有安全栅栏，不允许 JSON 注入特权 JS。发布声明必须区分 UI 包、策略包与 Browser 固定后台版本。

## R3.1 发行、安装与真实能力门槛

- 普通用户只需要发布的 OpenDesk Browser 扩展和既有官方 Catalog 离线工具包；不得要求下载源码、安装 Node 或复制 Background。维护者在核实的唯一 owner 开发，新正式产品/教学示例按上面的目录合同选择。
- 进入安装更新/发行阶段、正式包字节有变化时，提升三段式版本，经原有 packer/catalog 生成资源；普通源码迭代不反复升级正式包。不能把同版本不同字节当作升级，不复制安装器、Host、SDK 或权限模块。
- 普通能力使用现有 Browser SDK；确需 Chrome 原生权限时只能依赖固定、经审计的预编译扩展逻辑。工具审阅、安装确认、启动都应检查目标发行扩展能否实际提供所需可信能力；缺失提示升级，不能假装安装成功。
- Background 管持久计时与 DNR，Content Script 管网页显示，沙箱管 UI，Side Panel 固定 Host 管权限和可信点击。前台授权按钮应在首次打开的可见区域；已停用工具不可触发无效的原生授权。
- 当前任务进入正式安装/生命周期验收时，按适用合同保留安装→打开→必要授权→核心运行→停用→卸载→清理失败恢复→重新安装的证据；普通开发只验证本次受影响步骤。卸载/清理变更保留 Quick Notes/Time Review 等相关跨工具对照；任何移除只能处理自有命名空间与自有 DNR ID。
- Node、构建、CI、真实 Chrome 是不同证据等级：没有与本次最终候选身份一致的 Mac Chrome/CFT 原生凭据就标为 `NOT_TESTED`，不能提前给出 95+ 通过分。

## R3.2 真实运行能力与权限分级

区分 **工具已安装、工具已启用、后台/网页服务真实可用、Chrome 原生权限已批准**。声明 capability、侧栏出现一个 JS 适配器、源码构建通过，都不能证明 Background/Content Script 具有真实工作能力。先核查真实消费者和已有 Browser SDK、Page Relay、Controller/USER_SCRIPT、可信 Host，不为工具新建运行器。

Stay Focus 安装提交前，静态 Side Panel 适配器的 `focus.probe` 对当前 MV3 Service Worker 验证服务协议与必要 Chrome API。此请求不是沙箱公开能力，不需要先安装，也不申请原生权限。缺失、错误版本或不可达服务是 `RUNTIME_UNAVAILABLE`，阻止继续持久化安装并保留已有用户数据；当前 Manifest 已把 `declarativeNetRequestWithHostAccess` 声明为必需权限；`idle` 才是可由可信真实点击申请的可选权限。服务缺失与尚未取得可选权限/网站授权要分别报告，不能把两项都写成点击后申请的可选权限。探测正常并不证明计时、提醒、DNR 已在 Chrome 实测。

逐项核对「应用/用户场景 → Sandbox、Side Panel、SW、ISOLATED 或 MAIN → 实际操作 → Manifest/原生权限 → 显式网站授权 → 重启/撤权/停用副作用 → 测试和真实证据」。状态用 `SUPPORTED`、`PERMISSION_REQUIRED`、`RUNTIME_UNAVAILABLE`、`UNSUPPORTED`、`NOT_TESTED`；没有同候选真实 Chrome 证据不能判原生通过。独立安装不要求普通用户有项目源码，但预编译特权服务必须随正式扩展发行。

## 按需产品方案与交互预览

用户当前要求设计预览，或新建/显著改造 UI 确需先确定交互时，取用 [统一开发规范的设计章节](../../../docs/api/sidebar-tool-development.zh-CN.md#产品设计与对话预览关卡新建显著改造-ui-时适用)，不把其中评分、矩阵和正式验收自动串成开发前置条件。明确的既有功能修复直接在原入口完成，不重画原型或重走已批准的设计。

需要网页模型设计时，使用 [opendesk-ui-preview](../opendesk-ui-preview/SKILL.md) 的 canonical CSS、源 SHA 与真实附件传递规范；本地 Skill 路径不等于网页模型已获得规范。交付交互原型时使用无 Chrome/Native 写入权限的模拟数据，提供可打开 HTML，并在客户端支持时直接呈现；截图或包 JSON 不等于交互预览。设计原型、stage 只读包预览和可安装包分级，完整宿主 CSS 不可注入动态工具 iframe。

**离线公共预览模板（2026-10-30）**：沿用 `sidebar-preview-kit.mjs` 设计稿和 `scripts/preview/build-preview.mjs` 源码同源预览；二者共同消费 `scripts/templates/sidebar-tool-preview-shell.html` 这一唯一完整宿主 DOM，导航/返回/模拟卸载共用 `scripts/preview/sidebar-shell-behavior.js`；`scripts/templates/sidebar-preview.html` 仅为设计内容/模拟逻辑 fragment，kit 仍输出完整单文件 HTML、prompt 和 manifest。共享 helper 配置只读、纯模拟，不产生平台写入或公开 API 变化。`sidebar-shell-source.mjs` 继续提取真实 `src/ui/react/` 导航/工具栏与 `src/ui/tool-shell.css`。SSR 当前含 7 项（含隐藏 `app-debug`），预览仅显示正式五 Tab，不硬编码总数。设计稿仅允许修改 `#od-preview-app` 内部与 `#od-preview-behavior` 中 `/* DESIGN_APP_BEHAVIOR */` 标记之后的工具逻辑；标记及之前的共享宿主交互受 check 保护。返回/标题/模拟卸载取消、确认和恢复沿用真实外壳位置，顶部正式工具标题已有 `role="heading"`，内容不重复工具标题或 `h1`。状态、主题、恢复及模拟说明留在应用外部；正式源码、安装包和 iframe 不含辅助控件。宿主始终 light，工具仅按已支持能力切换 light/dark。

设计稿外部状态为模拟已授权/未授权/撤权/加载/空/失败/长文本及恢复；未保存表单期间禁用外部状态/主题/恢复，取消或 Escape 返回后恢复这些控件。quick-notes 场景支持 `success / permission-denied / revoked / loading / empty / error / untrusted / long`，外部状态/工具主题/恢复切换重建纯内存 iframe，须提示模拟数据会重置，不冒充真实授权。bookmark-manager 外部选择支持 `success / empty / error / loading / permission-denied / untrusted` 六种既有场景及 light/dark，切换同样重建内存 iframe；另保留专属外部 lab 的 8 项运行时命令（含 revoke/restore）。它不支持 quick-notes 新增的 `revoked / long` 场景值，`revoke` 命令不等于 `revoked` 场景；未接入控件的工具明确不支持，不复用其专有故障注入。允许共享模板增加真正通用的外部辅助区，并同步来源锁与受影响检查。源码同源预览切换重置纯模拟内存，不涉及真实结果未知（unknown）的操作；产品未知副作用保护保持原样。实际证据见本轮生成文件与报告，生成成功不代表交互终验或测试 PASS；普通离线预览不默认进入安装、Browser 构建、发布、全量验收或评分。详见[预览外壳合同](../../../docs/architecture/browser-framework/ui-preview-shell-template-r12.zh-CN.md)。

独立工具页不堆静态描述：依照 [R28 多功能区 Tab 契约](../../../docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md)，头部默认只有返回、当前标题和必要操作；文件夹/列表等集合“＋ 新建”放在所属区域标题右侧，条目管理入口必须能在窄屏/键盘下找到。真正的授权/错误等动态提示放到状态区，不借口信息完整性常驻重复描述。

**内容区精简与状态间距**：按[统一 UI 规范](../../../docs/api/sidebar-tool-development.zh-CN.md#6-统一-uiux-与代码质量规范)移除不提供目标选择的重复对象/检测说明，刷新放在所属区域右上角；不为刷新另留空行。同步删除失效的 DOM 查询和冗余渲染，保留实际状态、忙碌锁及可访问名称。状态行自然撑高，检查分隔线到文字、文字到卡片底部的留白，不用固定最小高度或纵向均分填充。正式源码与已有交互 HTML 同步修改，只验证受影响的操作与状态。

**子视图标题同步（R2.2）**：业务通过原有受约束的 `OpenDeskTool.setNavigation({page,title,canBack,...})` 继续上报**完整**业务页名（例如「提示词详情」「编辑书签」）；已验真宿主的共享 Header **只显示当前短名称**（「详情」「编辑」；可信设置「设置」；根页仍为工具名）。完整工具/业务路径在可信 `title` / `aria-label` 中，不在沙箱里删业务含义，也不创建面包屑、第二条 Header 或父子 flex 拉伸留白。普通第三方或未验真的同 ID 包保留自己的内部导航，不能控制可信标题。书签 React 的新建/编辑 Sheet 有真实 `requestCloseSheet()` 和脏草稿 Back，允许显示短标题；详情 PreviewPane、菜单仍非子路由。权限、保存锁和返回操作不由标题字符串决定。详见[共享导航合同](../../../docs/architecture/sidebar-tool-navigation-contract-r1.zh-CN.md)；纯 Browser Host 修复不必重打未改动的 JSON 包。

R2.2 增量约束：新建/编辑表单的区域 ARIA 名称复用已有业务导航标题；不要另写一套状态映射。旧实例收到撤权后即使保留可复制草稿，也不能再更新可信标题或接收宿主导航动作；延迟恢复回调须绑定原实例。书签本轮已执行记录见[R2.2 本地证据](../../../docs/framework/workstreams/sidebar-tool-title-r22-local-20261026.md)。只复验当前变更影响的操作；不重复已通过矩阵，不为静态可信 React/Host 修复重打未变化的 JSON。

## 与编译、发行和未来市场 Skill 的明确分工

- **本 Skill 主责**：HTML/CSS/JS、React/Vue 组件的功能实现、用户界面、源码正确性、隔离预览和开发侧功能测试。修改已核实工具项目中的 `src/`、`tool.config.json` 等真实业务源码。
- **编译/JSON/独立目录安装包/安装确认**：转交 [Sidebar Tool 打包 Skill](../opendesk-sidebar-tool-package/SKILL.md)，它持有 `build-sidebar-tool.mjs`、可再现性、版本、输出、生成包一致性、离线 Catalog 和安装验收的详细流程。本 Skill 不建立第二种构建命令或打包器。
- **第三方线上市场上传/审核/上架**：当前仅 [预留说明](../opendesk-marketplace-publish/RESERVED.md)，尚无可调用发布接口；不得标记已上架。市场 UI 属 `opendesk-extension-ui`，授权/Host 属 Runtime。

## 任务判断（先选一条，再改代码）

- **普通工具 / UI**：在已核实工具项目中编辑 `tool.config.json` 及 `src/index.html/style.css/main.js`。依赖少则经典 JS，不为简单表单新建 React 应用。
- **复杂组件**：复用既有 React/Vue 项目与本地 IIFE + 静态 CSS 构建。当前工具可显式选择 `uiRuntime: "opendesk.react-ui.v1"` 使用固定 Shared UI，按实际项目配置处理外部依赖；最新 AdBlock 已有真实例子。工具在自己的沙箱文档创建 Root，不把 App 导入主工作台 Root。Tailwind 仅作为构建期可选工具；构建后仍走唯一打包器。
- **网页按钮 / DOM 增强**：先确认是否为 Page USER_SCRIPT，属于该类型就走 `examples/programs/<id>/` 与 `opendesk-script-authoring`，不能因为用户说“扩展”就默认建可信 Content/Host。
- **Native / 特权数据**：先查公开 `OpenDeskTool.request`，固定 `page.toc/page.clip/page.capture/knowledge.store` 不是第三方任意 DOM API。缺公开能力先取证，不足记 `SDK_GAP_NOT_PROVEN`，危险权限无法合规授予记 `BLOCKED`；证实通用 SDK/Native 缺口交 `opendesk-extension-runtime`，经审计第一方专有业务交 `opendesk-trusted-sidebar-feature`，仅处理实际阻塞。
- **普通工具导入**：当前任务需要可安装交付时，才进入打包 Skill；受影响门禁通过后在工具目录保留唯一、规范构建的 `<id>.opendesk-tool.json`，不能只给 CI ZIP。**官方可选工具**仍由 `official-tools/catalog.json` 和同一构建器生成离线资源。正式包不手工编辑，不为每次迭代增加新文件；提交遵守当前用户授权。

**源码修改不是安装包发布。** 对当前任务要交付给用户安装的工具，开发过程中只生成 `artifacts/` 或 `.opendesk-preview/` 临时候选；完成受影响测试后转交打包 Skill 进行 `--promote-from`，工具根最终只保留一个同 ID `.opendesk-tool.json` 并随源码提交。未通过时保留上一个正式包，不能只交付 CI ZIP；不要给同一工具连续制造 R/日期/版本后缀的正式包。普通工具源码归本项目，Host/原生权限仍由现有审计入口处理。

## 需要预览或安装交付时的既有入口

```bash
# 普通 Sidebar App 源码在此目录维护：
# examples/sidebar-tools/<id>/tool.config.json + src/index.html/style.css/main.js

# 可选：不安装的只读测试/预览快照
node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/<id>
# STAGED_NOT_INSTALLED，不授予网站、Cookie 或浏览器权限
```

持续迭代优先「开发 → 本地项目 → 在侧栏调试」，复用项目自身编译 watcher 和 `node scripts/watch-sidebar-tool.mjs <真实项目目录>`；按[直接调试与开发数据隔离](../../../docs/api/sidebar-tool-development.zh-CN.md#直接调试与开发数据隔离2026-10-29)核对真实来源、快照、实例和获准调试能力。Native Workspace「只读预览工具 ↗」保留为[只读预览路径](../../../docs/api/sidebar-tool-development.zh-CN.md#b-本地只读预览改得勤但暂不安装)，不混用两种权限。快照 watcher 不运行 npm、不安装；React/Vue 先有项目原完整编译回执。Browser 固定资源另由维护者复用 WXT serve，不要求工具作者启动第二个 WXT。按本次失败选择可见更新/错误恢复检查，不能以状态 SHA 代替真实画面；iframe 替换不保证内存状态保留。正式数据/权限不参与开发链，历史 unknown 对相关刷新与副作用的限制按工作流执行，无依赖的安全编辑继续。

React/Vue 可复用项目本身的已有预编译配置，源码创建和 UI 调试由本 Skill 负责；**正式 JSON 生成、项目目录预构建包、版本/原始字节核对及本地导入/离线发行**统一按 [`opendesk-sidebar-tool-package`](../opendesk-sidebar-tool-package/SKILL.md) 执行。源码/UI 调整本身不意味着已经安装、运行、获准读 Cookie 或完成 Chrome 原生测试。不重复定义 `--out`、Catalog、Host、SW 或市场上传协议。

## 必须始终保护的合同

- 封闭 JSON 字段、稳定 toolId 和三段版本；审阅是否超包/字符/资产/存储配额。密钥/私人记录不可入包。
- sandbox 使用公开 `globalThis.OpenDeskTool`（root/request、只读 locale 等）及获准 v2 `OpenDeskSDK`；具体全局以对应合同为准，不能说只有两个字段；`chrome.*`、任意站点 DOM、Native、跨域请求、下载任意文件与远程可执行脚本不得变成隐式权限。
- 授权按具体 capability、真实 sender/document、当前安装包、显式站点许可和真实用户行为落实。装了工具不等于网页已授权。
- 数据原文、用户编辑、修订冲突、异步结果未知和卸载时清理/备份均需按当前代码及用户需求设计。不使用 UI 定时器假装持久后台。UI 卸载后内存实例结束；重开从获准存储恢复。停止专注时段、停用全部规则、停用工具与卸载是不同操作：不能把关闭 UI 说成撤销 Cookie 修改/DNR，也不能把停用一律说成删除业务数据。
- 同 ID JSON 升级只更换该包选择的代码和对现有批准能力的调用，不替换固定 Background/Content/权限适配器。纯模块跨环境复用时核对数据合同和版本兼容；独立后台需求链接既有产品 REQUIREMENTS，不新增任意 JS 权限入口。
- 视觉遵守现有 Side Panel R19/R20/R21/R23 设计原则：紧凑、一致、浅深模式、键盘和无障碍。但 iframe 样式不会自动继承宿主 token；需在工具自己 CSS 实现，不能未经审查改变公共设计系统。
- 尊重并行 main 的**实际文件所有权**、构建锁、Chrome Profile 与既有证据；不以“全局唯一 writer”阻塞不相交任务，不覆盖同一文件的并行改动；未经授权不推送远端或执行完整发布/强推/重置。

## 质量门槛与交付

按 [AGENTS.md 的开发阶段规则](../../../AGENTS.md#开发阶段先完成核心需求与最小验证用户于2026-10-17明确)选择当前完成条件；用户调整优先级后，旧 GOAL、计划和历史清单不继续触发全量验证。文档/Skill 变更仅核对差异、链接、事实、元数据及阶段逻辑，不运行产品测试、构建或浏览器。

- **普通开发**：先在原入口走最短核心操作链并修复，再执行能证明本次行为的语法/类型/依赖或工具定向检查。仅改工具 UI/业务不触发官方扩展全量构建。公共工具合同/Host 实际变化时，才从 `tests/environment/sidebar-tools.test.mjs`、`sidebar-tools-host.test.mjs` 选择相关项；不因同属一个工具就运行整组测试。
- **受影响的安全保护**：权限、CSP、来源锁定、身份、撤权、旧 epoch、未知副作用、DNR 自有规则或清理变更，保留对应负例和必要跨工具对照；Workspace 只读预览保持只读，侧栏直接调试仅按原隔离开发能力合同，安装/更新仍经原审阅和确认。可信模块交由其 owner Skill，不因普通工具开发扩大宿主范围。
- **确需产物证据**：React/Vue 按项目已有配置预编译；正式 JSON 按打包 Skill 构建、校验后晋升同源候选。只有受影响的扩展入口/Manifest/编译闭包确需证明时才选相应扩展构建与包校验；失败先定位入口、日志和定向检查，相关输入和诊断依据均未变化时不重复全量构建。复用已有 watcher，保护共享输出。
- **浏览器与正式交付**：当前核心操作必须依赖浏览器证明时，只走相关正常流程和安全场景。完整安装/更新/撤权矩阵、正式包/Chrome/Mac 验收及独立评分，仅由用户当前明确要求或适用正式交付合同触发，在核心可用后执行；环境可用不是触发条件。宽度、缩放专项仍按用户当前明确范围处理；保留历史标准与证据。
- **文档与结果**：信息写回唯一 owner：通用方法归本开发规范，API 归 `sidebar-tools.zh-CN.md`，具体操作归工具 README，确需特殊说明才用 DEVELOPMENT/范围内 AGENTS，路线沿用 REQUIREMENTS/ROADMAP。开发只报告核心操作、实际检查和剩余缺口，不新建评分或验收账本；正式交付按原合同保留原始证据与候选身份。相关未执行项标 `NOT_TESTED`；`STAGED_NOT_INSTALLED`、构建或 fixture PASS 均不能替代真实安装、网站、Native 或落盘证据。

当真实代码/合同与本 Skill 不一致时，先纠正文档或报告差异，不要静默添加新的私有 API 或绕过包验证。


**R1.2 同类资源树例外**：书签/文件夹这类父子文件树共用创建工具栏，不为文件夹和书签各增加一行区域标题；按本次改动定向检查创建、折叠/搜索或自定义行菜单，320px 专项仅在当前明确要求时执行。特殊 Chrome 全量书签能力必须落在受审第一方源码，不可由沙箱工具借用。

## 渐进式 UI 本地化

正常创建 Sidebar Tool 时**只写一种源语言**；用户明确要求某种目标语言时，在原 ID 的同一工程加入 `locales.json` 与构建配置 `locales`，使用现有 `scripts/build-sidebar-tool.mjs` 对翻译的源文案、占位符、纯文字约束与离线嵌入执行校验。运行时使用框架提供的只读 `OpenDeskTool.locale` 与 `onLocaleChange` 更新显示，严格禁止通过 `chrome.i18n`、Browser SDK `i18n` 或存储直接改全局语言。交付仍按现有工具打包、同 ID 升级与同源预览规则执行；宿主权限译文不可由用户包覆盖。详情：[正式本地化合同](../../../docs/api/sidebar-tool-localization.zh-CN.md)。


## R5.6 · React Shared UI 开发规范（2026-10-20）

**UI 框架按真实需求选用。** 小型、没有复杂组件状态的工具可以保留 HTML/原生 JS；当用户明确要求 React，或工具已有多处表单、菜单、异步读写和嵌套视图时，优先复用仓库已有 React Shared UI，不应机械回退到 `document.createElement()`/DOM 重新拼接。只改工具本身，不迁移其他 HTML/Vue 应用。

**先核对唯一公开合同**：选择 `uiRuntime: "opendesk.react-ui.v1"` 后，工具按[Shared UI 合同](../../../docs/api/sidebar-tool-development.zh-CN.md)使用固定 `OpenDeskPageReact`、`OpenDeskSidebarUI`；Chat 展示/会话另见[公共 AI bridge](../../../docs/api/sidebar-tools-ai.zh-CN.md)。成员以现行合同、项目配置和目标 Browser 的实际导出为准，平台维护者必要时核对 `src/entrypoints/sidebar-shared-ui.js`，本 Skill 不维护第二份封闭清单。不能把可信 `src/ui/react/` 任意组件或业务 consumer 当成沙箱 API；新源码导出也不证明旧运行候选已有能力。视觉复用现有 Design Tokens，React 只拥有工具自身 Root，不挂可信 Side Panel Root、不调用 `chrome.*`，不复制组件库。

**参考真实消费者**：[AdBlock App](../../../projects/adblock/src/App.jsx)、[main.jsx](../../../projects/adblock/src/main.jsx)、[Vite 配置](../../../projects/adblock/vite.config.mjs) 与[原编译器](../../../scripts/build-adblock-react.mjs)；`examples/sidebar-tools/shared-ui-demo/` 展示外置 React 的组件使用。引用项目须交叉核对当前配置和构建消费，不能只检查 Markdown 链接；路径过时先纠正引用，不复制旧目录。JSX 构建走既有 Vite + IIFE + 本地 CSS，`react`/`react-dom/client`/`react/jsx-runtime`/`@opendesk/ui` 通过既有浏览器受控 Runtime 外置；单 Root，`pagehide` 时 `root.unmount()`，Effect 释放轮询和事件监听。Classic JS 直接通过现有运行时创建 React 元素也是合法的过渡源码，但**未经实际 Vite 编译不能声称已交付 JSX/Vite 产物**。

**交互规范**：编辑/添加/关闭/更多操作首选共享 `IconButton`，必须有明确 `label`/触控热区/键盘焦点；不把所有动作都变成无文字图标。保存、危险移除和可信授权保留可理解的语义。复杂菜单优先沿用已有 React Aria 能力；若组件尚未公开，使用可检查的轻量菜单并完成 Escape、外部点击、焦点恢复与触控检查，不另建全局菜单库。只验证当前受影响的交互；宽度/缩放专项仅在用户当前明确要求时执行。

**异步与所有权**：仅通过现有 `OpenDeskTool.request` 读写；后台/可信 Host 仍是计时、DNR、授权和规则真相来源。写入用单次锁和可核实回执，状态读用请求代次防止旧响应覆盖新状态；静默轮询不能覆盖未保存的 React draft。Host 结果未知不能自动重试风险写入，正在导航时必须再次核对当前网页身份，不把 iframe 点击冒充可信真实点击。若 Host 仍要求二次受信确认，如实标注产品阻断，不在沙箱绕过。

**源码与打包证据**：`tool.config.json.files` 只能指向真实存在的 HTML/CSS/JS。若引用 `dist/tool.js`、`dist/tool.css`，必须先真实构建并产生与源码绑定的 `dist/build-ready.json`；源码一改，旧回执作废。工具正式包经唯一 `scripts/build-sidebar-tool.mjs` 构建、回归、`--promote-from`、`--check-project` 晋升，禁止手改安装包。预览必须用本次已构建的确切 JS/CSS/同版本共享运行时，Mock 只在工具 iframe 外；不要让预览使用旧原生界面而包使用 React。证据明确区分 `SOURCE_WIRED`、`BUILD_PASS`、`PACKAGE_PASS`、`NATIVE_CHROME=NOT_TESTED`，不得以原型截图证明 Chrome 限制生效。


## 普通 Sidebar App 申请后台网站预算（site-budget.v2）

仅当现有 SDK Registry 支持 `browser.siteBudget` 时，在原项目 `tool.config.json` 声明受限能力与 `backgroundPolicy`：`{kind:'site-budget.v2',dailyMinutes:30,defaultSites:[],schedule:{enabled:false,days:[1,2,3,4,5],startMinute:540,endMinute:1020},suggestions:[{host:'example.com',name:'Example',category:'工作',suggestLimit:true,quick:false}]}`。保存/运行时由应用 UI 使用 `OpenDeskSDK.browser.siteBudget.getStatus()` 取得 `desiredPolicyRev`，再通过 `setPolicy({enabled,dailyMinutes,sites,schedule,expectedRev})` 申请用户审阅。安装/升级先由原 Installer 验证版本、容量、来源与包摘要；未批准时不得因模板自动创建规则。普通工具不要把 `chrome.*`、DNR ID、Worker JavaScript 或自建报警/保活器写入自己的项目。

仍按已有 `scripts/build-sidebar-tool.mjs` → Extension Center 导入/审核 → 同 ID 升级 → 停用/卸载路径交付。不需要重编 Browser 来更改已支持的站点、额度、时段；但**此能力截至 R1.4 仅有源码提交，原生 Chrome 与固定 B0 验收尚未通过**。无原生证据不得声称侧边栏关闭后计时或新包独立升级已验证。见 `docs/api/browser-sdk.zh-CN.md`。

## 2026-10-30 · 组件组合入口

模板完善与新设计先运行原 `sidebar-preview-kit.mjs create`，从同目录 `components.html` 实际操作真实共享 Button/IconButton/Card/Switch，读取 `component-recipes.md` 的 HTML/JSX 接入；设计稿外部有直接入口。不是另建 Atlas，完整参考仍用 `prototypes/sidebar/extension-ui-showcase/index.html`。具体支持、源码及边界见[组件与组合入口](../../../docs/api/sidebar-preview-kit.zh-CN.md#组件与组合的直接入口2026-10-30)。

默认复用 Card、od-form-field/label/field/help/error、od-alert 及各语义状态组合，不能只要求“遵守规范”。React 从现有 `@opendesk/ui` 导入，原生字段不是虚构的 Field/Select API；运行时不自动发布全套表单/布局 CSS，需要时由工具静态 CSS 显式编译 canonical 规则。HTML 原工具继续原生语义，原共享样式提取器现已输出同源 Card 子集，不手绘 React Aria Switch。组件示例为 SOURCE_COMPONENT_PREVIEW，单独保存源/依赖/产物 SHA，不能冒充安装包或 Native 验收。
