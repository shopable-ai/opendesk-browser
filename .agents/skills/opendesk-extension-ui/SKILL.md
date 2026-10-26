---
name: opendesk-extension-ui
description: Improve OpenDesk Browser five-tab UI (我的/扩展/工作流/开发/云控), 扩展 center unified list, app/Page 网页增强 badges, search, filters, details, installation-management and task/schedule views. Enforce R27/R28/R30 and accessibility; not an SDK/permission or sandbox package skill.
---

# OpenDesk Browser · 扩展内置页面与 Tab UI 工程

## 触发、边界和第一动作

用户要求**新增/调整浏览器扩展自身的 Tab、某 Tab 中的列表、详情、创建/编辑表单、设置或运行状态页**，以及“布局、标题、边框、间距、折叠状态、返回、焦点不一致”时，**首先**触发本 Skill。典型场景：`我的 → 定时计划 / 任务搜索`、`扩展 → 搜索 / 统一列表 / 筛选 / 应用与网页增强标签 / 详情与返回 / 安装管理 / 网站授权展示`、`开发` 折叠区、`工作流`、`云控`、扩展 Settings/Marketplace。原「发现」「工具」不再是现行一级 Tab。

这是 **UI 与信息架构 Skill**，不是 UI 框架或新的组件库。只修改属于用户任务的页面与 CSS；不擅自修改安装/执行/Chrome 权限。涉及后台、SW、Content Script、Worker 或 SDK 边界时调用 [扩展运行环境 Skill](../opendesk-extension-runtime/SKILL.md)；涉及第一方工具业务/可信直挂使用 [可信功能 Skill](../opendesk-trusted-sidebar-feature/SKILL.md)。用户/AI 可安装应用 iframe UI 由 [应用开发 Skill](../opendesk-sidebar-tool-dev/SKILL.md) 处理，不复用宿主特权 DOM/CSS。

**先核对当前主分支与本地未提交/并行差异，再改文件；不强推、不全仓重排 CSS。**

## 唯一现行规范（禁止复制成第二套设计系统）

**最新五 Tab/类型标签的权威**为 [R4 产品规格](../../../docs/product/sidebar-ui-spec.zh-CN.md) 与 `src/ui/react/app-shell.tsx`。R37 正式 HTML 为根目录 `sidepanel.html`，源码 `src/ui/sidepanel.html` 只含空挂载节点；旧 `tool.html` 已退役。遗留 `tab-tools`/`workbench-tools` DOM ID 不是仍存在「工具」一级 Tab 的证据。

先恢复 `AGENTS.md` 的当前阶段、用户最新优先级及目标文件 diff；以下按任务选择相关章节，不是每次依次读完的清单：

- 调整布局密度、间距、容器或样式隔离：查 [R27 跨界面布局与样式](../../../docs/architecture/ui-layout-conventions-r27.zh-CN.md) 的对应规则。
- 调整列表/详情/表单、返回与草稿：查 [R28 Tab 多功能区与子视图](../../../docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md)。
- 调整页首、折叠或公共视觉：查 [R30/R31 Side Panel 设计系统](../../../docs/architecture/sidebar-design-system-r20.zh-CN.md)；历史页面仅作参照，不复制历史 CSS。
- 实现时先读目标组件和直接事件/样式依赖；涉及公共规则才补查 `src/ui/design-system.css`、唯一 token `src/ui/design-tokens.css` 或对应 shell。计划任务按受影响入口查 `src/ui/scheduled-task-workbench.js`，不预先扫描所有公共源码。
- 确需运行测试或复用验收证据时，再查 `docs/framework/testing-guide.md`、相关测试与同输入证据；历史验收不是普通功能开发的阅读前置条件。

**入口先分类**：可信 Side Panel 使用上述 `od-*`；扩展 Settings 使用自身 CSS + 合适的 tokens；Marketplace 属于独立响应式页面；Native Workspace 使用固定离线 Tailwind v4，且 `:root` 16px 保证 rem 基准；sandbox/网页注入 UI 不引入宿主 CSS、全局 reset、Preflight 或特权代码。

## 改变导航或交互时核对受影响的页面状态

新建页面或改变导航/交互时，简要说明下列受影响项；既有缺陷直接核对当前入口及失败步骤，不要求重画完整状态图或新建 HTML 原型：

1. **入口**：属于现行哪个一级 Tab？正式为 **我的 / 扩展 / 工作流 / 开发 / 云控**，开发版另有隐藏「调试」。旧「发现」的任务检索属于「我的」；旧「工具」和已安装 Page 的管理统一在「扩展」。无正式产品变更及验收，**不新建一级 Tab，不隐藏/合并五 Tab**。
2. **用户对象**：索引页的主对象是什么（任务、计划、应用、网页增强、订阅等）；卡片只展示名称、状态、最重要数值与 1–2 个高频动作。
3. **子视图**：`Index → Detail → Edit/Create / Management → Back` 是逻辑结构，不代表一次把所有内容同时显示。详情、表单、管理、历史各归其合法视图；轻量技术诊断才用 `details` 折叠。不因同一个 Tab 就把列表、详情、编辑全部混在一个无限滚动面板。
4. **状态与返回**：明确 loading/empty/error/paused/running/unknown/draft-dirty 的可见反馈、返回目标、恢复滚动和焦点、用户修改未保存时的内联确认。扩展统一列表还需检查筛选和详情返回后的滚动/焦点、已安装/未安装/更新状态隔离。轮询不能重建正在编辑的 Select、丢失草稿或误触发 Save/Run。
5. **安全动作**：暂停/停止、权限、安装、保存、删除等由原业务/Authority 授权；UI 切换、获取数据、保存源码绝不隐式运行任务或扩大授权。

**最小 UI 状态机**（示意，不要求新建全局路由器）：

```text
现有 Tab（我的）
 ├─ 任务索引 / 我的任务
 └─ 定时计划（二级功能）
     ├─ Index：计划列表 + 新建
     ├─ Detail：单计划状态 / 历史 / 次要操作（需要时）
     ├─ Form：创建或编辑同一计划
     └─ Management：已安装任务选择/管理
独立运行页：使用同一 sidepanel.html React 应用及既有受信任运行 Host，不新增 SW/RunHost
```

## 已安装应用的页内轻导航（R2.2，2026-10-26）

遇到「书签管理 / 设置」中间巨大空白，或「提示词快捷按钮 / 提示词详情」重复时，先查[现行 Sidebar Tool 导航合同](../../../docs/architecture/sidebar-tool-navigation-contract-r1.zh-CN.md)，直接修共享正式业务页头，不另建 Nav、模拟 HTML 或第二套组件。**可见标题只保留当前层级**：工具根页「书签管理」，可信设置「设置」，书签编辑「编辑」，提示词详情「详情」，新建「新建」。完整应用/业务路径与实际版本放 `title`，完整上下文写入 `aria-label`；不使用两个 flex span 拉开父子文字。未知页名不可通过宽泛正则裁剪，确有溢出才使用 CSS 单次省略号。

职责：`src/ui/sidebar-tools/title-path.js` 一次返回 `{visible,context}` 两个字符串（特殊页名必须用 `Object.hasOwn` 核对映射，不能从原型继承），`src/ui/sidebar-tools.js` 由已安装元数据、真实业务导航及可信设置取得上下文，`src/ui/react/tabs/tool-host.tsx` 只渲染一个标题文本节点，不使用 `renderText` 子元素分支，并保留原返回操作，`src/ui/tool-shell.css` 仅处理可用宽度和按钮热区。设置区域保留 `aria-label`，移除重复「工具设置」H2。书签 React 的真实编辑 Sheet 可 Back 且继续脏草稿守卫；详情 PreviewPane、Dialog、菜单不可伪装路由。沙箱 `setNavigation` 必须沿原包字节、安装代际、实例和来源约束；显示缩写不改变权限、业务状态或 SDK。纯宿主改动无需重打未改动的书签及提示词 JSON 包。

同步唯一产品/架构规范、相关工具 README 与定向回归，覆盖根页、设置、详情、新建/编辑、未知长标题、ARIA 完整路径、原 Back 安全边界和按钮空间。源码/CI 通过不等于本机已安装 Chrome 通过，未测标 `NOT_TESTED`。

R2.2 生命周期检查：标题接收、呈现与动作发送都绑定当前完整包、安装代际及实例；撤销后清除旧导航，保留草稿不等于保留宿主控制权。重复打开同一有效可信 UI 不重建实例；延迟初始化/恢复失败不得销毁新工作区。书签编辑区 ARIA 复用同一业务页名。复用[本轮证据与缺口](../../../docs/framework/workstreams/sidebar-tool-title-r22-local-20261026.md)，按最新用户阶段只做受改动影响的增量验证，不重复矩阵或补跑来凑分。

## 共享 AI 设置与 Native Options 的两层交互（2026-10-26）

多个第一方 AI 对话框的设置入口统一复用 `src/ui/react/components/provider-settings.tsx` 和既有 Provider Runtime；**默认在同一个 Sheet 内展示 AI 来源、本机连接 Switch、实际在线状态、上次成功连接记录及重新检测**，不得每次都要求跳转到 `src/native-agent/settings.html`。只有首次安装/开发配对、目录工作区、困难诊断和长隐私披露等低频操作才进入独立 Options 页；不因此加第三个 Nav 或重复保存按钮。用户切换 AI 来源仍由现有「保存 AI 设置」生效，本机 Switch 则独立且即时提交，并明确告知两者保存语义不同。

**必须区分三层状态：** Chrome Native Messaging 的授权、连接开关的已启用、Native Host 实际 `hello/welcome` 握手在线；三者不等价，且均不等于 Codex Provider 可推理。完整正常/错误/恢复语义详见 [Native Agent Bridge 的设置 UI 合同](../../../docs/architecture/browser-framework/native-agent-bridge-r1.zh-CN.md)。历史成功时间仅在握手回执后留于本地，不存在记录不得猜测旧版安装是否曾连接；当前离线时仍可显示历史，但绝不显示「已连接」。正在连接、未知、需要重载都必须语义可见，Switch 状态始终绑定真实设置回读，不乐观伪造成功。

**权威与安全：** 可信 ToolShell 把原 `AGENT_CONFIG_PROTOCOL` 的有限设置 facade 传给同一个 React Root；只有实际用户启用手势触发 `permissions.request(nativeMessaging)`。SW 侧验证 sender、documentId、顶层来源和 `sidepanel.html` 合法身份，拒绝动态工具 iframe、网页脚本与 Scheduled Runner。禁止复制另一个 SW、Host、权限记录、Provider 或开启时自动执行业务。取消弹窗不撤销已提交的 Native Switch；权限撤销、状态失败和失回执后由唯一后台状态重新判定。

**排版与隐私：** Options 继续复用设计 Token，自有隔离 CSS；第一屏只放 Switch、当前状态、重新检测与说明，文件工作区放次级卡片，扩展 ID/配对诊断默认折叠。已有可选统计同意开关和完整披露必须保留，长文字可以默认折叠但不能缩小同意范围或变相默认开启。修改中文文案须同步 EN/JA/繁中既有 i18n 目录；避免设置页切换语言后残留中文。真实 320/360/400px、键盘焦点、Chrome 权限手势、离线/重启/撤权和实际回读需要绑定同一构建候选，未测报告 `NOT_TESTED`。本类回归优先 `shared-ai-conversation-r23.test.mjs`、`native-agent-bridge.test.mjs` 与既有真实 Chrome Options 入口；不得为了旧选择器保留重复按钮。

## 所有内置页面统一的视觉硬约束

| 角色 | 必须优先使用 | 常见错误 |
| --- | --- | --- |
| 页首 | `od-page-head` + `od-page-title` + `od-page-actions`；返回左、当前对象动作右 | 同一视图两个同等级主标题，或者把返回放在正文末尾 |
| 区块与列表 | `od-page` / `od-stack` / `od-toolbar`；`od-surface` 承担卡片边框与 padding | 一个页面三层套卡、每行另设边框和 gutter |
| 通用按钮与输入 | `od-button` / `od-icon-button` / `od-field`；危险操作用现有危险态和真实确认 | 不同 Tab 私自设置按钮配色/粗细、摘要中嵌独立按钮 |
| 折叠信息 | `od-disclosure`、`--flat`、`--info`；summary 字号、行高、图标、padding 由公共 CSS 控制 | 用页面局部选择器重复定义所有 `summary`，关闭后高度不一致 |
| 状态与验证 | 语义文案 + `role=status/alert`、label/error 的 `aria-describedby` | 只靠颜色、11px 灰字说明权限/失败、隐藏区仍占空白 |
| 版心与间距 | 单一 `--od-page-gutter`；`--space-1/2/3/4` 分别 4/8/12/16px；34px 图标、36px 常规控件 | 重复容器 padding、魔法 7/9/11px、无依据 `!important` |
| 响应式 | `min-width:0` / `minmax(0,1fr)`；按钮换行、文本可换行、局部滚动 | 小屏强压 20px 图标、整页横向滚动、200% 缩放裁切 |

R30 首行的普通标题为 12px/600；R31 明确「当前网页」属于有边框的一级 `od-disclosure`，不是历史描述中易被误解的 `--flat`。同区域 8px、说明紧邻 4px、独立区域 16px。只在确切产品密度差异有说明和回归时采用例外。**公共规范的修改必须服务至少两个真实消费者；新页面不得重新声明 :root、颜色 token 或另一套 Toolbar。** Side Panel 不为了统一界面而全量引入 Tailwind/Quasar；Workspace Tailwind 不能渗入沙箱或普通网页。

## R31：HTML 直接复用与 CSS 所有权（必检）

```html
<details class="od-disclosure"><summary>一级功能区</summary><div>正文</div></details>
<details class="od-disclosure od-disclosure--flat"><summary>依赖 SHA / 技术历史</summary><pre class="od-result">按需查看</pre></details>
<details class="od-disclosure od-disclosure--info"><summary>首次说明</summary><p>说明文字</p></details>
<div class="od-surface od-surface--padded">普通卡片</div>
<input class="od-field" aria-label="输入值">
```

**视觉所有权：**公共背景、边框、圆角、标题最小高度、展开/关闭 Hover、Focus、深浅色和粗指针规则仅在 `design-system.css`；全部语义值仅在 `design-tokens.css`。业务 `tool-shell.css` 可以设置父 Grid/Flex/gap、局部宽高、编辑器滚动和真正特殊的动态状态，不得写 `#workbench-develop … > summary` 类公共视觉覆盖。普通标题默认 44px，内部 `--flat` 默认 36px（粗指针至少 44px）；本 Skill 不另维护相竞争的数值表，真实值以 CSS 为准。

开发页中「来源与当前网站」「运行状态与结果」分别是 8px 的关联组；卡片 padding 由 `od-surface--padded` 提供 12px；彼此独立的主章节由父容器 `--space-4` 分隔 16px。新增 Modifier 须先证明至少两个真实消费者确需同一语义。保留 `#developer-target-detail` 等 ID/ARIA、Run/Save/Stop/安装/权限的原绑定，当前网页域名与可运行状态仍动态展示，不能写成固定网址。

**受影响范围检验：**修改共享 CSS 规则/声明所有权时运行 `sidebar-component-contract.test.mjs`；修改开发 `#developer-results-panel` 或云控 `#cloud-hosting` 的对应样式时，按当前阶段选用 `sidebar-r19-layout-visual.mjs` 的相关比较。保留现有键盘/窄屏/粗指针覆盖，不因此每次运行完整矩阵。只报告实际执行的证据层级；涉及的原生/安装项未执行标 `NOT_TESTED`，宽度与缩放专项按当前任务范围处理。仅可信 Side Panel 可直接复用完整宿主 CSS；Workspace、Settings、Marketplace 使用各自隔离构建/主题映射，独立工具 iframe 与目标网站严禁导入宿主特权 CSS/JS。
## 「我的 → 定时计划」专项防退化示例

当前真实实现已在 `#workbench-tasks` 下包含 `#scheduled-panel`，以及 `#schedule-list-view`、`#schedule-form`、任务管理与独立 runner；`src/ui/scheduled-task-workbench.js` 的 `show(view)` 切换视图。它的计划列表卡片目前还内嵌较重的历史/更多/删除确认。**这不是已经存在完整单计划 Detail 页的证明。**

新一轮计划布局任务应首先判断：若单条计划需要展示历史分页、技术版本、复杂权限或管理动作，优先给它独立 Detail 子视图，只在 Index 留下名称、状态、下次执行、频率和不超过两个主要动作。用当前 `scheduleId` / `generation` / 固定任务版本复用既有 RPC，保留真实返回上下文、草稿保护、历史不重复加载与出错恢复。切勿为了排版重做 `alarms`、RunHost、Task Registry 或把运行页变成新一级 Tab。必须保护既有 DOM ID/测试选择器；新详情 ID 只能在真实实施时定义，不能在 Skill 文档里假定已存在。

计划列表首屏最重要信息是“何时执行、是否启用、有何需要处理”；创建/编辑表单为独立连续流程；高级时区/版本/RunId 不应与主要动作平级。计划已有无 Host、UNKNOWN、settling 等真实状态，不得通过 CSS/文案掩盖失败或伪造可执行性。

## 标准开发与验证流程

用户要求复测「工作流」真实发送与同一对话连续操作时，读取[核心冒烟手册](../../../docs/framework/guides/workflow-core-smoke.zh-CN.md)，先区分历史成功、当前加载产物和待验证源码。UI 交互仍由本 Skill 负责，涉及 Provider／权限／RunHost 时按原边界协作；手册只维护一份，不另建同内容 Skill。只整理文档不启动产品运行环境。

按 [AGENTS.md 的开发阶段规则](../../../AGENTS.md#开发阶段先完成核心需求与最小验证用户于2026-10-17明确)选择本轮需要的步骤，以下不是每次任务的全量清单。选命令前执行其中的“验证命令的相关性判断”，失败后先按“失败先分类再决定修复”处理；开始、用户纠偏及旧 GOAL 自动续跑时先核对最新阶段和下一条用户操作。核心流程未通时先修复；仅改文档或 Skill 时只核对内容、链接和格式。

1. **核心入口**：先走当前问题的一条最短操作链，记录失败或未验证步骤；仅核对相关页面、容器、CSS 来源和事件生命周期，需要复用时再看已有消费者。
2. **最小变更**：只改确切组件、类与范围内 CSS；先复用 `od-*`，业务 CSS 只保留真正业务布局。保护真实点击、Run/Stop/权限回调与事件解绑。
3. **定向验证**：仅选能证明本次行为的现成检查。共享组件/布局对应 `tests/environment/sidebar-component-contract.test.mjs` / `ui-layout-conventions-r27.test.mjs`；计划操作对应 `scheduled-task-ui-r1.test.mjs`；Tab 记忆对应 `sidebar-tab-memory.test.mjs`；开发布局对应 `tests/framework/sidebar-develop-layout-r29.test.mjs`。这些是候选入口，不是成组必跑命令。
4. **按需构建集成**：确需编译或产物证据时，先证明它与当前操作的阻塞或改动有关，再选最小相关检查；按 AGENTS 的失败分类和构建重试规则处理，不因构建发现无关来源 pin 或 CI 失败扩写任务。正常开发复用已有 dev watcher，不覆写并行 dist/Profile。正式包验收仅由用户当前明确要求或适用的正式交付合同触发，在核心可用后执行。
5. **视觉与交互**：开发阶段验证本次影响的正常用户操作、焦点和滚动。完整多状态矩阵仅由当前明确要求或适用正式合同触发；宽度、缩放专项仍须用户针对当前任务明确要求。按实际执行范围记录焦点/ARIA、截图及候选身份；真实 Side Panel、CDP 标签页和静态预览分级记录，不能互相替代。
6. **回归**：保留 Tab 导航、列表/详情/表单返回、保存草稿、Stop 所有权、后台任务身份、卸载/撤权；只修视觉也要验证受影响的交互。

## 独立质量评分，不用漂亮截图补安全缺口

独立评分仅在用户当前明确要求或适用的正式交付合同要求时执行，按该要求选择信息架构、排版一致性、可读性、响应式、可访问性、交互/表单保真、跨界面隔离、回归与原生证据等维度。适用 95+ 目标时仍须相关核心维度逐项达到 95/100、无阻断失败，并有绑定当前候选的真实 Chrome 证据；静态规范/Node PASS 不能代替产品 95+，未测项标 `NOT_TESTED`。普通开发只报告核心操作、受影响验证和剩余缺口。
