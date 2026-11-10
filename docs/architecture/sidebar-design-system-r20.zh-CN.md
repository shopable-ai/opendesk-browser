# OpenDesk Browser Sidebar R20 设计系统和布局契约

日期：2026-10-10，R26 布局补充：2026-10-12；集合与五 Tab 映射补充：2026-11-10。现行范围：Side Panel 五个正式页签「我的／扩展／工作流／开发／云控」，以及共用可信 React 应用的任务目录、独立应用标签页。源码宿主为 `src/ui/sidepanel.html`，构建入口为 `sidepanel.html`；独立应用适配入口为 `src/ui/app.html`。`tool.html` 已退役。下文 R20/R26/R30 旧「工具」布局为历史参考，最新产品导航以 [R4 规格](../product/sidebar-ui-spec.zh-CN.md) 为准。

本文件描述 Side Panel 的具体实现规则。**跨页面统一的尺寸、Tailwind 映射、Workspace/Settings/应用市场/沙箱分层及独立评分标准**以 [OpenDesk UI 布局与样式规范 R27](ui-layout-conventions-r27.zh-CN.md) 为准；两者共享 `src/ui/design-tokens.css`，不建立第二套 token 表。

## 历史技术选择与现行 React 边界

R20 最初从原生 HTML/JavaScript 与 WXT 固定输出中拆出公共 CSS。Tailwind 的主要作用是提供 utility classes 和编译时样式生成；它本身不决定组件层级与间距所有权。现行五 Tab 已由 `src/ui/react/app-shell.tsx` 组合，唯一可信 React 根为 `src/ui/react/`；React 方向、可选共享组件与自定义 HTML/Vue 零退化以 [R33 合同](react-ui-shared-components-r33.zh-CN.md) 为准。本文件不再把原生页面或“不引入 Tailwind”当作长期产品架构。

继续复用唯一 Tokens、现有公共 CSS 与真实 React 组件；各视图持有自身布局。Native Workspace 的离线 Tailwind 产物不进入 Side Panel，普通 HTML/Vue/React 工具不因统一可信工作台而迁移框架或新增依赖；不得加载浏览器 CDN 或在受控页面执行外部样式运行时。

## 源码位置与责任边界

- `src/ui/design-tokens.css`：唯一可信宿主 `:root` 设计变量，语义色、4/8/12/16px 间距、8px 控件圆角、12px 卡片圆角、34px 图标按钮、12px 宿主页面水平 gutter。
- `src/ui/design-system.css`：读取上述 token，负责基础原生控件、通用布局原语和可访问性焦点；不得再定义另一套 `:root` 调色板。
- `src/ui/tool-shell.css`：仅保存五页签和完整目录的特殊布局/响应式/运行反馈；不再声明全局 `:root` 或基础控件 reset。
- `src/ui/react/app-shell.tsx` / `tabs/`：五 Tab、子视图、Dock 与 ToolHost 的真实 DOM 组合；`components/ui/` 的现有封装及组件 CSS 保留各自职责。CSS 类存在不代表有同名 React 导出；Markdown 描述选择、关系与证据，CSS 提供可执行视觉规则，两者共同构成交付。
- 通用类规范：`od-page` 页签、`od-toolbar` 头部/工具栏、`od-stack` 纵向列表、`od-surface` 卡片、`od-button`/次按钮 `od-button--secondary`、`od-icon-button`、`od-field`、`od-segmented`。
- 新 UI 先选通用原语，只有真实交互或布局差异才添加 `developer-*`、`workflow-*` 等视图选择器。严格保留所有旧 DOM IDs、真实 Role/ARIA、RunHost/Stop 所有权和信任边界。
- 工具沙箱运行用户 HTML，不能自动加载这套高权限 UI 样式；需要独立、安全的工具主题合同才允许后续复用。

## R26 Side Panel 和隔离工具：统一尺寸与唯一留白层（2026-10-12）

### R30 工具 Tab / 工具详情作为跨 Tab 排版基准（2026-10-14）

R30 原从旧「工具」索引页顶部及打开应用后的可信详情头部提炼视觉基准；新产品统一「扩展」列表继续借鉴其版面规则，不重建旧「我的工具／发现工具」导航。其他 Tab 的新增/调整部分遵循同一契约；当时先落实开发页，不代表全部历史 Tab 已完成迁移。

- **顶部**：普通列表/表单由 `#workspace-content` 提供一层 `--space-3` 顶部留白，首行不再叠加页面 padding。可见 ToolHost 的通栏标题负责自身顶部留白，工作区仅在该状态取消顶部 padding；完整规则见下方留白所有权。复用 `od-page-head`，普通最小高度 `--od-icon-size`，标题用 `od-page-title`（12px、600、1.5 行高）。相关短状态可同行，长文字可换行；详情标题需要单行时保留可访问的完整名称。
- **垂直节奏**：标题栏到所属内容、同区域相邻控件/折叠项统一 8px；说明与所属内容 4px；真正独立章节 16px；卡片内部仍为 12px。由父容器 gap 负责，不叠加子元素 margin。12px 卡片 padding 不等于所有行都应隔 12px。
- **头部动作区**：`od-page-actions` 靠右，当前公共 CSS 间隔 8px。添加/导入/刷新/复制/设置等短、熟悉的操作用 `od-icon-button`，基类保留常规命中尺寸。现行 `od-page-head` 内使用 Ghost 外观；R40 历史记录的 4px 不是当前公共动作组的默认 gap，已安装 ToolHost 的更紧凑例外见 R4.2。不沿用历史页头的浅底带边框要求。每个动作有 title、aria-label 和可见焦点，保留 hidden/disabled。
- **背景类型**：普通页头采用现行 Ghost；页头外图标按公共基类/quiet 变体选择。主要执行用现有 primary；危险动作用现有 danger，保留确认；Hover、Focus 和展开态读取公共 tokens，不按页面重建。不能把普通刷新/复制涂成主要执行按钮。
- **详情动作归属**：返回在标题左侧；作用于整个详情的打开独立页、设置、显示/隐藏、卸载放右侧头部。只作用于结果、历史或项目集合的复制/刷新放所属区域头部，不散落正文或放进 summary 内成为第二个交互控件。运行/停止、安装确认、权限批准等保留明确文字及原决策/授权链，展示按[统一确认与反馈合同](browser-framework/confirmation-and-feedback.zh-CN.md)选择，不固定要求正文内确认区。
- **开发页映射（历史 R30，由现行 R31 补充）**：来源/本地项目开关是第一行；只读源码的「新建」在该行右侧。当前网页虽然是轻量上下文信息，但**属于一级独立的有边框 `od-disclosure`**，不是 `--flat`；动态网页 host 与状态仍保持原始语义。技术详情才使用 `--flat`。来源行与网页、状态与结果分别同组 8px，独立章节 16px，卡片内部 12px，编辑器至少 216px；本地项目刷新、结果复制、历史刷新留在所属区域。
- **窄宽度**：不得缩小 icon；≤240px 可让动作组换行，粗指针实际命中区域至少 44px。验收分别记录静态 CSS 布局、实际浏览器 zoom 和已安装扩展证据，不能互相提升。

共享头部/按钮外观由 `design-system.css` 维护；`tool-shell.css` 只负责业务排版和状态差异。参考实现为 `sidebar-tool-list-view`、`sidebar-tool-display`、`developer-source-switch`。

### 间距与圆角的使用入口

取值只在 [`design-tokens.css`](../../src/ui/design-tokens.css) 维护；本文件不再复制 Token 数值表。跨界面的场景映射与页面/区域/卡片/列表/控件所有权见 [R27 第 2、3 节](ui-layout-conventions-r27.zh-CN.md#2-尺寸间距字体色彩)。下文保留 Side Panel 的具体组合理由与例外。

### 留白所有权和使用原则（2026-11-10 修订）

- **普通页与扩展列表**：`#workspace-content` 负责上下 12px、左右 `--od-page-gutter` 的唯一页面留白；背景变白不改变此规则。搜索栏、列表外缘、详情信息卡外缘共用水平对齐线；卡片和控件内部保留自身留白。扩展中心不再覆写整个工作区的 padding。列表条目统一以标题为主，说明最多一行，升级状态跟随标题，而不是平铺数个操作按钮。
- **应用运行页**：可见 ToolHost 头部通栏，工作区顶部为 0，由头部自身 `--space-2` padding 与最小高度提供呼吸空间；隐藏的调试预览 Host 不触发这个例外。`#workbench-tools` 作为完整内容画布宽度，重新加一层内部 gutter 来对齐可信按钮/标题；`#sidebar-tool-frame` 横向抵消该内部 gutter，iframe 不绘制第二层边框和 padding。这既避免重复左右缩进，也保证框架**不超过工具面板本身的滚动宽度**。沙箱继续自行决定内部留白，原工具不必修改。
- **扩展信息详情**：沿用普通页外边距，首行标题和返回控件不再分别叠加顶部 8px；详情标题下的 12px 与信息卡内部留白属于内容节奏。
- **独立画布**：工作流沿用已有会话滚动与零上下 padding；完整目录、独立应用标签页保留各自 surface 合同，不将普通页规则强加给全屏画布。
- **区域内布局**：一行控件以 `gap:var(--space-2)` 为主；控件组垂直间隔用 8px、独立章节用 16px；卡片内部 pad 12px；辅助文案与正文用 4px。不要为了修视觉问题多次覆写同一处 `padding`，不要叠加父级和子级两个“页面 gutter”。
- **窄屏与长文本**：所有弹性子项 `min-width:0`，标题/URL 按需换行；标签列表可局部横向滚动，但 `#workspace-content` 不得因 iframe 额外产生横向滚动。输入框正文的 8px 内边距属于控件自身，并不计入页面的第二层 gutter。
- **显示状态与低频技术信息**：空列表一句话说明下一步；技术摘要（如源代码 SHA）放在“技术信息”折叠区域；从详情返回工具列表后不保留“已隐藏悬浮目录”等过期操作反馈。

### 集合列表与独立参数区（2026-11-10）

**共同设计决定：**同类对象使用单一集合外框、内部行分隔，降低重复圆角和选中描边的视觉重量。公共 `od-collection` / `od-collection-row` 已由「我的」任务选择与扩展中心共同消费，沿原共享 CSS 实施。这是 CSS 组合，不是 React Collection API；其他 Tab 按真实内容选择布局；本轮已在独立默认 360px 原生 Side Panel 核对实际加载，完整发布验收仍未执行。

- **集合边界**：外框读取 `--od-line`、表面读取 `--od-paper`、外圆角读取 `--radius-surface`；首尾行服从集合轮廓，行内不再绘制完整卡片外框或各自圆角。相邻行仅一条内部细分隔，无行间卡片 gutter。集合外层不额外加一圈内容 padding；已有外卡片时先确定哪一层真正拥有边界。
- **行内节奏**：四周 `--space-3`（12px）padding，扩展图文 `--space-2`（8px）gap；任务的完整图标与两行名称使用 `--space-3`（12px），名称与次信息 `--space-1`（4px）。行高由文字、换行和命中区域共同决定；禁止用固定高度裁切名称、状态或动作。普通描述可一行省略，但错误、权限范围与恢复入口不适用。
- **选择与焦点**：选中只改变行内轻背景、强调文字或克制的标记，并保留真实 `aria-pressed` / `aria-selected` 语义；不以外框加粗、双重阴影或重复整圈品牌描边表示选择。键盘 `focus-visible` 单独使用 `--od-focus`，必须可见且不被集合圆角裁掉；Hover 不伪装成选中，选中不表示已经运行或授权。
- **集合到工作区**：任务选择集合与独立操作/结果区之间由共同父容器提供 `--space-4`（16px）。操作 workspace 沿用集合底边与 16px 留白分隔，不再重复横线；水平沿用页面对齐线，不增加第二重水平 padding。参数字段不常驻列表下方：从行内运行图标或菜单打开当前面板的模态 Sheet；标题说明任务，底部保留取消和明确 Run，长表单内部滚动。无参数任务在同一 Sheet 中说明无需参数，不保留空表单区。选择和打开均不执行或授权。
- **唯一工作区**：切换选择、筛选、展开/收起继续复用原 `task-selected-workspace` 实例，保留 IME、输入、焦点与业务生命周期。参数 Sheet 关闭保留同一表单节点和草稿；原生 dialog 提供背景 inert、键盘与焦点返回，组合输入中 Enter/Escape 不执行或关闭。Schema 是唯一有效性判断，错误关联字段并在 React 提交后聚焦；Run 重新校验打开时的任务/版本/hash/安装身份。布局拆出集合不授权重建表单、不重复 ID、不自动执行任务；选择行与管理按钮是独立控件，不能嵌套按钮或让子动作触发行选择。
- **公共与业务所有权**：集合外框、表面、内部分隔归 `design-system.css`；行内节奏遵循共同 token，具体交互主体、悬浮动作及选择/焦点由原组件和布局 CSS 组合。任务状态、描述、选择/展开行为和参数数据归原业务 owner；父布局 gap 与显隐归对应页面。不要在 `tool-shell.css` 重做任务专用集合外框或逐行卡片皮肤。

**2026-11-11 最新调整：**任务参数/运行入口移到行内悬浮层，不再在集合下显示独立按钮；任务与扩展列表均不为菜单预留独立列或右侧 padding。默认展示一个菜单入口，跟随最后悬停/聚焦行；重要停用状态留在文字区，不被浮层覆盖。Sheet 默认紧凑动态表单，标签置于控件容器左侧，布尔控件靠右；长字符串按现有约束使用多行输入，另可切换 JSON。JSON 与表单沿用原校验和每个固定版本的草稿，不扩充 Schema 或执行权限。当前证据为定向 Node 与 ego 源码预览；原 watcher 被并行 AI Proxy 来源锁阻塞，尚未宣称新原生候选生效。下方 96.1 分属于上一轮 `63879a1c…`，不自动覆盖本次调整。

本次视觉完善实际复用 `components/ui/button.tsx` 的 Button/IconButton、`input.tsx` 的 React Aria Input/Textarea 以及原 `od-input-group`；不是完整 shadcn 主题迁移。标题 600 字重与描述 400 区分，悬浮动作沿当前行底色渐隐；布尔为完整左标签加右控件，不受短标签列宽限制。Sheet 的身份标题、参数工具栏、字段和固定底栏分别分组。源码绑定预览已核对实际 360px、320px、JSON 错误、菜单键盘与焦点返回，Node 行为 125 项、布局边界 12 项通过；[本轮证据](../../artifacts/task-row-redesign-20261111/README.md)说明源码、预览与未生效的运行态边界。

**基线与实现：**真侧栏曾观察到任务逐条圆角卡片贴合、选中整框偏重、参数区与末行相连；开发本地连接断开时表单等距堆叠。现有 `MyTaskRows` 以 `task-browser` 父容器直接组合集合与唯一 workspace，使 16px gap 作用于实际边界；选中按钮持有轻背景与内侧标记，焦点独立显示。源码预览和默认宽度真实加载已检查；本地项目 Native 连接恢复仍未验证。

### 字阶、密度与对齐（2026-11-10）

- **字阶表达角色**：`od-page-title` 为紧凑页首的 12px/600/1.5；对象名称或区域标题使用正文层级 `od-title`（默认 13px/650/1.5）；正文使用 `od-body`（13px/400/1.55），描述/帮助使用 `od-note`（12px/400/1.55）。11px 的 `od-technical` 只承载次要技术值，主要状态、失败原因与权限不能降为技术小字。这些是当前默认组件的用法，显式主题下仍消费同一语义 token，不在业务中硬编码锁死。
- **密度从组合获得**：先减少重复页头、逐条卡片和无必要框线，再安排主次信息与低频折叠；不靠缩字号、缩点击区域、隐藏主要动作获得紧凑。列表名称优先可读，辅助说明降低字重与颜色，不整页加粗。
- **水平对齐**：页首、搜索、集合外缘和独立参数区共用工作区对齐线；行正文按行内 padding 向内对齐，不反向增加页面 gutter。图标固定占位，正文 `min-width:0` 可伸展，动作区靠尾端；多行名称/描述按顶部对齐，单行工具栏按中心对齐。
- **字段与操作对齐**：同一表单标签、字段、帮助/错误共用起始线，`od-form-field` 内为 4px；相邻独立字段组通常 12px，工具栏标签到选项组 8px。主要执行与取消/停止按所属区域分组，长标签先换行，不为凑同排牺牲名称和焦点。
- **本地项目具体分组**：项目选择与刷新构成同一 toolbar；工具关联的标签、选择器和说明/错误构成字段组；源码关联/侧栏调试等按钮组成 8px toolbar。字段组间 12px、独立连接恢复/安装审阅/参数区域间 16px，组内继续用 `od-form-field` 的 4px；不让每个 label、select、说明、按钮、诊断块在同一父容器中等距排列。断开时保留真实状态与原连接恢复入口，分组不能伪装在线。
- **页头与正文职责**：宿主拥有唯一返回、可见工具/子页路径和当前对象动作，正文只展示业务。现行规则见[导航合同](sidebar-tool-navigation-contract-r1.zh-CN.md#同一宿主页头的可见路径与唯一返回现行)，不恢复“只显示设置/详情短标题、路径只放 title”的旧规则。

### 五 Tab 真实布局映射（2026-11-10 源码观察）

统一组合入口为 [`SidebarAppShell`](../../src/ui/react/app-shell.tsx)；以下是当前源码定位和共同规范的应用目标，不是五 Tab 本轮运行验收结果。保留各业务现有 DOM ID 与唯一 owner，不按历史 ID 名称重建产品导航。

| 产品 Tab | 真实组件与布局区域 | 应用规范与待核对点 |
| --- | --- | --- |
| 我的 | [`MyTasksPage`](../../src/ui/react/tabs/my-page.tsx)：`#workbench-tasks`、任务页首/搜索、`#task-installed-cards`、`#task-selected-workspace`；[`MyTaskRows`](../../src/ui/react/tabs/tasks.tsx)；计划 Index/Form/Detail/管理仍在原 `#scheduled-panel` | 任务选择采用单一集合；独立操作区在外并间隔 16px，参数移入常驻表单的模态 Sheet。结果/历史按自身区域处理；不得因行重排丢输入、Stop 或返回焦点。计划详情已有真实组件，不能按旧文档推定尚无 Detail |
| 扩展 | [`ExtensionCenterPage`](../../src/ui/react/tabs/tools.tsx)：搜索/筛选、`#extension-center-list`、信息详情和语言子页；[`ToolHost`](../../src/ui/react/tabs/tool-host.tsx) 为运行页独立 owner | 普通对象列表使用连续行与轻操作；信息详情沿普通 gutter，运行页沿通栏头部/iframe 例外。应用与网页增强类型、安装状态和返回上下文保留，不能因同列显示合并安装 Authority |
| 工作流 | [`WorkflowPage`](../../src/ui/react/tabs/workflow.tsx)：页首、历史视图、`.workflow-scroll` 会话/步骤/参数、底部 `.workflow-composer` | 会话保留自身滚动与输入区，工作区零上下 padding 是已有例外；消息不是逐条对象卡片。步骤编辑、权限审阅、参数仍由业务组合，不自动套集合；本轮无实测缺陷则仅验证，局部 gap 差异不自动触发改版 |
| 开发 | [`DeveloperPage`](../../src/ui/react/tabs/develop.tsx) 依次组合 ContextHeader、LocalProject、SourceEditor、Execution、Advanced、Diagnostics；[`develop-editor.tsx`](../../src/ui/react/tabs/develop-editor.tsx)、[`develop-local.tsx`](../../src/ui/react/tabs/develop-local.tsx)、[`develop-execution.tsx`](../../src/ui/react/tabs/develop-execution.tsx) 持有对应区域，底部为 DeveloperDock | 来源+当前网页、运行状态+结果分别 8px 关联组；独立章节父布局 16px。当前网页为一级 `od-disclosure`，技术信息用 flat。已按上方规则组合本地项目字段、关联说明及操作组；同源预览检查了长内容与草稿保留，默认宽度真实页面已核对，不把视觉调整当 Native 连接恢复 |
| 云控 | [`CloudConnectionPage`](../../src/ui/react/tabs/cloud.tsx)：页首、连接概览、首次连接、待审核程序、任务授权、请求记录、客户端凭据及配对设置 | 保留连接、授权、审阅与请求记录的真实分区，不默认每区加卡片。当前 `.cloud-panel` 为 12px 的源码观察不单独构成产品故障；本轮无实测缺陷则仅验证。授权清单保留完整范围、固定版本及真实确认，不能为密度隐藏风险 |

### 状态、响应式与例外（2026-11-10）

| 状态 | 可见反馈与布局要求 |
| --- | --- |
| Loading / busy | 在所属区域说明等待；已有内容可保留，限制确实不可并发的动作。更新不得重建正在输入的控件或使按钮位置来回跳动 |
| Empty / 无搜索结果 | 区分未安装、无匹配、未选对象；给出合法下一步/清除筛选，不保留空卡片或参数占位 |
| Selected / expanded / running | 分别绑定选择、展开与真实运行状态，不互相推定；标记与文字可读，焦点独立可见 |
| Disabled / readonly / paused / 未授权 | 保留值、作用范围、原因及恢复入口；禁用是真实状态，不能只降低透明度而仍响应动作 |
| Success | 实际成功后复用共享 Toast/notify 或一直可见的就近状态；保存/复制/安装回执不能只追加到滚动正文末尾 |
| Error / offline / unknown / revoked | 就近持久显示原因与恢复动作，关联字段用 `aria-describedby`；保留 `role=alert/status`。未知结果禁止自动重放，无关成功不清错误 |
| Dirty / 返回 / 取消 | 业务保留草稿、目标 revision 与返回上下文；需要确认时沿[公共合同](browser-framework/confirmation-and-feedback.zh-CN.md)使用异步统一浮层，退出恢复焦点，不增加同步原生弹窗 |

响应式先使文案/按钮换行，弹性区域 `min-width:0`，Grid 使用可收缩列；长 URL/技术值局部换行或局部滚动。页面不横向滚动，固定 Dock 不遮住最后一个字段/错误/动作；常规控件保持自身尺寸，粗指针提供 44px 命中区。键盘 Tab/Shift+Tab、Enter/Space、返回/关闭后的焦点与真实状态保持，降低动效遵循 `prefers-reduced-motion`。

**例外边界：**ToolHost 通栏/iframe、工作流会话滚动、独立 Catalog/应用页、代码编辑器最小高度/等宽字体、R4.2 已安装工具紧凑头部及显式官方主题均保留各自 owner。例外仅覆盖所需尺寸/滚动/主题，不改变普通页 gutter、业务草稿或信任边界；不要把 ToolHost 的 30px 或局部主题的 32px 控件推广到默认五 Tab。新增例外按 R27 记录消费者、理由、范围和验证缺口。

**本轮证据与运行边界：**共享集合、本地项目分组和任务参数 Sheet 已实施。离线及上一轮真实记录保留在 `artifacts/five-tab-layout-20261110/`、`artifacts/five-tab-task-params-20261110/`；最终证据归 `artifacts/five-tab-core-ui-20261111/`。ego 原生面板被并行任务占用，已释放本任务 TaskSpace，临时独立 CFT 155 Profile 加载日常 `dist/development`，复用原 watcher，不更改日常扩展或 Native 配对。只读测试任务经原验证/安装链后，在最新候选完成真实成功 Run、可见结果与 Stop，持久回执均 released；参数修正仅清除所属过期摘要，不清其他字段或权限/运行错误。历史百度文档围栏未重放；实体 OS IME、本地项目 Native 连接、主题/缩放矩阵和 production 仍为 `NOT_TESTED`。

**独立复评（2026-11-11）：**最终候选 `63879a1c65e8c698dcc451817f1151cd9b4bcb873ec1979083a5017bd3d4da13` 的默认 360×819 CSS px、DPR 2 原生布局与参数 Sheet 获 `PASS_SCOPED`，综合 96.1/100、八维最低 95，无阻断项；[评分及补充](../../artifacts/five-tab-core-ui-20261111/review.json)、[运行身份与哈希](../../artifacts/five-tab-core-ui-20261111/candidate-binding.json)、[操作证据](../../artifacts/five-tab-core-ui-20261111/README.md)共同限定此结论。上一轮 95 分保留为历史；临时 Profile 的网页增强预装权限缺口不因布局及只读任务评分而视为通过。

### CSS 与工具隔离边界

工具沙箱为 opaque-origin，`src/sidebar-tools/sandbox.html` 不加载高权限 `design-tokens.css` / `design-system.css`，不允许外部 CDN、运行时 @import 或绕过 CSP。独立工具在自身 CSS 中声明**数值匹配**的 token（例如 `examples/sidebar-tools/quick-notes/src/style.css`），而非跨信任边界复用宿主样式。默认 Page Installed 记录和 Side Panel 工具包属于两个不同安装系统，列表只进行可信读取展示，绝不合并注册表。

### R26.2 网页笔记最窄尺寸规则（2026-10-12）

- 侧栏支持 300/320/360/420/520 CSS px；浏览器实际 200% 缩放可能使有效 CSS 布局宽度降到约 160–220px。网页笔记在不超过 **220 CSS px** 时将「关联当前网页」单独占满一行，删除和保存按钮在第二行靠右对齐；其他宽度继续使用单行操作栏。该规则防止勾选标签被图标挤压折行。
- 在 800 CSS px 及以上的独立工具标签页，笔记主体最大宽度 **760px** 并居中，避免独立页面的文本编辑框横跨整个桌面窗口；侧栏内保留原 12px 对称外边距。
- `scripts/tests/sidebar-quick-notes-layout-visual.mjs` 从**实际工具源码**加载 HTML/CSS 和 Logo，在受控 Chrome 里验证 12 种有效 CSS 宽度 × 4 种内容状态：整个页面无横向溢出、详情/正文/附件/按钮左右边缘对齐、图标尺寸固定 34px、窄屏标签完整与宽屏编辑器限制。记录为 `STATIC_SOURCE_CHROME`，不执行工具 JS，也不宣称真实 Mac Chrome 200% 扩展 E2E。

### 交付检查标准

- 静态回归检查宿主 gutter 与工具 iframe outdent、沙箱独立 4/8/12/16px token、控件 34px、简洁空状态、技术信息折叠与返回列表清理提示。
- 实际 Mac Chrome 需在 300/320/360/420/520px 及 125%/200% 缩放中检查真实已安装工具列表、网页笔记详情（长标题/网址/文本）、手动保存与更新，不能出现页面级水平滚动或 iframe 被裁切。
- 没有绑定当前候选源码身份的真实浏览器证据时，必须明确记为 `NOT_TESTED`，不能仅凭静态合同测试宣称原生通过或产品专家评分达到 95+。

## R28：开发工具栏及逐页布局检查

- 代码来源保持一行：左侧「直接编辑」，右侧「本地项目」真实 switch；普通行高至少36px，标签/关联控件使用 `--space-2`。不把来源选择、代码格式和运行权限混为同一个开关。
- 代码类型采用真实 radio 分段组，**可见「代码类型」文字与 JS / React / Vue 选项同排**。`fieldset/legend` 保留组语义，完整名称 JavaScript / React JSX / Vue SFC 保留于 ARIA 和 title；键盘 Tab 进入、方向键选择。禁止为了压缩宽度把正文缩到10px或只保留不可访问的图标。
- 标签、选项组使用 flex/grid 和统一 gap；单选点击高度至少36px，粗指针44px。组内紧密间距4px、标签与组选项8px；不通过额外 margin 或多层 card 堆出空白。300/320/360/420/520/600px 应同排；极窄有效宽度允许自然换行，页面不可水平溢出。
- 格式说明放在编辑器之后，避免挤占工具栏；只有当前选择的必要提示可见。源码只读下拉与「新建」保持同排，文件名可以截断，操作文字和键盘焦点不可截断。
- 运行/保存/停止仍由底部 dock 承担，不在每个区域复制操作。保存、切换格式与切换来源不自动运行网页；DOM ID、radio value、执行世界和授权合同保持稳定。
- 逐页检查「我的」（含任务搜索、定时、云控授权）、「扩展」（应用/网页增强统一列表、详情和授权）、工作流、开发、云控及开发版隐藏调试：页面只有一层 gutter；主操作同排；关联项4/8px、分组12/16px；说明与技术详情有明确层级；无横向溢出、dock遮挡或隐藏元素留白。CSS选择器必须指向当前真实宿主，不能沿用已迁移的页签 ID。
- Side Panel 继续复用 `design-tokens.css` 与现有原生 CSS 原语，实现与 Tailwind 相同的统一空间规格；不加载 Workspace 的 Tailwind Preflight，不新增运行时 CDN 或依赖。
- 专家95分目标须提供评分维度、截图、几何数据、实际加载身份和可信输入记录。布局专项评分、静态渲染、真实扩展交互、主题/缩放、安装与最终验收分别记录；未覆盖或用户要求停止的项目明确保留，不能以均分抵消。

本轮实施和证据入口：[Sidebar R28 工作流](../framework/workstreams/sidebar-inline-layout-r28-01a130d1.md)。

## 安全与构建闭环

`src/ui/sidepanel.html` 顺序链接 `design-tokens.css`、`design-system.css`、`tool-shell.css` 及相关业务样式，保留空的 React 挂载节点与既有脚本；五 Tab DOM 由 React shell 持有。静态资源映射与校验继续由 `scripts/prepare-public.mjs`、`scripts/verify-package.mjs` 维护，不改变 Chrome 权限/CSP，不增加运行时远程样式或第二套 Root。文档修订不触发 watcher、构建或重装。

R19 的真实 HTML/CSS 静态 Chrome 检查扩展为加载两份本地样式后再执行 300／360／420／520px 的 28 个组合、测量控件/间距和截图。测试只切换显示与示例内容，`STATIC_MARKUP_CHROME` 不代表原生扩展/授权回执。

## 后续验收与限制

- 定向组件：Sidebar 样式约束、五页 DOM 基本类、package 文件缺失/恶意 CSS、历史用户脚本回归。
- 构建：`npm run check`，生产/开发双包和 `npm run verify`；检查实际 `ui/design-system.css` 文件的引用与安装包一致。
- 静态 Chrome：五页签状态、不同宽度无横向溢出、开发区块一致性、圆角、键盘焦点；旧 R19 截图仍保留作对照。
- 真正 Mac Chrome 原生视觉／125%/200% 缩放／键盘交互／Run/Stop 等待独立实际验收，不能把静态 PASS 说成专家评分 95+。

Native Agent 全页 Workspace 和 Settings 具有自己的大屏结构与本地文件操作流程，而且正在由其他会话并行开发，不在本轮直接整体重写。这两页可在后续独立任务复用 `--od-*` tokens 并迁移到对应密度规范，避免并行改动覆盖。

## R29：全界面紧凑动作组（2026-10-13）

文字动作与常规图标按钮采用34px桌面高度，输入/选择器保持36px，代码类型radio保持36px。工作流图标和发送按钮沿用既有R15.3的36px合同，组内保持一致；本次不覆写其他负责人的回归测试。文字按钮以4px纵向、8/12px横向padding压缩外观，不缩小正文；低于34px的工具撤权/更新/安装动作补足命中区。粗指针动作至少44px，Tab焦点沿用统一token。

标题/状态靠左，同行操作以8px间隔组成靠右工具组；独立表单的确认/取消、步骤/版本维护、定时计划及底部运行/保存/停止采用内容宽度并对齐尾端，必要时自然换行。搜索/选择器可伸展，导航卡片仍保留内容所需面积。云托管配对、批准与停止/解除/核对分组，授权说明紧邻原checkbox；只调整布局，保留原授权和执行合同。本轮颜色/暗色及125%/200%缩放由用户暂停，不将未验证范围记作PASS。

固定评分及逐页状态矩阵：[R29验收表](../framework/workstreams/evidence/sidebar-layout-r29-20261013/acceptance.md)；正式截图、源码/实际加载包绑定与独立评审见[R29工作流](../framework/workstreams/sidebar-layout-r29-20261013.md)。95分只用于该固定布局范围，不能升级为安装/F3/ZIP验收。

## R28：一个 Tab 中的多功能区、索引和子视图

新增统一规范：[Side Panel 多功能区 Tab 布局契约 R28](sidebar-multi-section-tab-contract-r28.zh-CN.md)。以 R28 制定时原「工具」Tab 的已安装工具 / 已安装网页工具 / 高级功能 / 导入 / 详情返回为历史结构案例（现行列表以 R4 为准），形成 **Tab Root → Index/Section → Detail/Form/Management → Review** 的组合规范；确认展示按现行公共合同选择，不限定行内。仅抽取信息架构、优先级、视图切换与可访问性，不复制工具 Tab 历史 CSS 或业务授权。R27 维护跨界面使用约定，Token 取值唯一来源仍为 `design-tokens.css`；本文件维护 Side Panel 视觉原语与 gutter 约定。

新增「我的 → 定时计划」与未来在现有 Tab 内嵌多个功能区时，必须遵守 R28：标题只出现一次，二级返回在左，主次区域按真实任务优先，技术信息按需折叠，主要操作和危险操作分层；在原 Trusted Host 内复用 `od-*`、不得新开一级 Tab 或跨用户工具 sandbox 借权限。具体首批应用范围、测试及原生证据见 [Scheduled Tasks R2.4 UI GOAL](../framework/prompts/goal-scheduled-tasks-r2.4-ui-multi-section-final-20261013.zh-CN.md)。


## R30：公共组件外观唯一所有权与迁移用法（2026-10-13）

这是既有 R20 设计系统的**实施说明**，不是第二套设计系统。公共数值只在 `src/ui/design-tokens.css` 调整；`src/ui/design-system.css` 是公共外观唯一来源；`src/ui/tool-shell.css` 负责宿主布局、尺寸和交互状态。工具的业务样式由各自项目持有，具体边界见下文 R31。Side Panel 无需强制改为 Tailwind，也不向第三方工具 iframe / 网页注入宿主 CSS。

| 角色 | 公共类 | 使用规则 |
| --- | --- | --- |
| 主／次／危险／纯文字操作 | `od-button` + `od-button--secondary / --danger / --quiet` | 默认外观完整；页面禁止重新定义普通按钮颜色、边框和圆角 |
| 图标按钮 | `od-icon-button` + `--primary / --danger` | 固定 34px；必须有 `title`、`aria-label` 和可见焦点；首次授权也不能变宽 |
| 表单字段 | `od-field`、`od-form-field`、`od-field-label`、`od-field-help / od-field-error` | 输入框默认 36px 高；readonly、disabled、aria-invalid 由公共 CSS 管；字段组内部 4px、组间由页面 gap 管 |
| 文字 | `od-body`、`od-note`、`od-technical`、`od-title` | 正文 13px、说明 12px、技术文字 11px；粗体强调不改变同一段落的字号及正文颜色 |
| 卡片与结果 | `od-surface`、`od-surface--padded`、`od-result` | 同类容器使用同一普通边框变量；内部结果和技术内容不重复叠卡片 |
| 折叠 | `od-disclosure`、`--info`、`--flat` | 独立功能区有外框；首次说明仅标题允许信息型蓝色；内部技术信息无外框 |
| 提醒 | `od-alert`、`od-alert--warning`、`od-alert--error` | 状态色由公共 token 提供；普通正文不染蓝或染红 |
| 布局 | `od-toolbar`、`od-stack`、`od-segmented` | 页面负责组间距与 flex/grid，公共组件负责自身留白 |

实际 HTML 继续使用既有静态样式入口（公共三份 CSS 加云控业务 CSS），通过选择角色复用组件，不复制演示皮肤：

```html
<div class="od-stack">
  <details class="od-disclosure od-disclosure--info">
    <summary>首次使用：连接方法</summary>
    <p>连接成功后选择项目；此处正文使用默认文字颜色。</p>
    <button type="button" class="od-button od-button--secondary">连接本机 OpenDesk</button>
  </details>
  <div class="od-form-field">
    <label class="od-field-label" for="example-url">目标网站</label>
    <input class="od-field" id="example-url" aria-describedby="example-hint">
    <p class="od-field-help" id="example-hint">完整 HTTPS 网址。</p>
  </div>
  <details class="od-disclosure od-disclosure--flat">
    <summary>技术信息</summary>
    <pre class="od-result">按需查看</pre>
  </details>
  <div class="od-toolbar">
    <button class="od-button">运行</button>
    <button class="od-button od-button--secondary">保存</button>
  </div>
</div>
```

**保留的合理例外：**JavaScript 编辑器继续有等宽字体和可调整高度，但 `#script-source` 的普通表单边框、配色与圆角来自 `od-field`；工作流输入框、目标来源切换开关、原生文件控件、目录筛选保留其具体功能布局。`workflow-ai-plan` 是固定 34px 图标发送按钮，模型接收方/首次许可通过旁边说明、title 和 ARIA 告知，JS 仍严格判断用户手势与独立网页读取授权。由 JavaScript 创建的工作流步骤必须同样应用公共类。

**防退化与验证级别：**`tests/environment/sidebar-component-contract.test.mjs` 是受影响的源码合同检查；已有 `scripts/tests/sidebar-r19-layout-visual.mjs` 用于真实 HTML/CSS 的静态 Chrome 渲染检查，不能代替用户 Mac 的已安装 Side Panel 原生验收。没有完成的检查保持 `NOT_TESTED`；95+ 只按实证评分。


## R31：公共组件唯一视觉所有权（2026-10-15）

这是**已有 R20/R30 的修正**，并非第二套 Design System。跨界面范围及 HTML 语义矩阵见 [R27](ui-layout-conventions-r27.zh-CN.md)，多 Section 的组织见 [R28](sidebar-multi-section-tab-contract-r28.zh-CN.md)。

- `src/ui/design-tokens.css`：跨组件通用的语义颜色、暗色值、间距及圆角的唯一变量来源。不接收 Cookie Editor 等应用专属色板，也不承接仅某个组件使用的局部变量。
- `src/ui/design-system.css`：共享 `od-disclosure`（一级边框、paper、标题、Hover、Focus）、`--flat`（次级无框）、`--info`（标题说明）、`od-surface--padded`、按钮/字段/工具栏/提示及结果的**唯一视觉实现**。普通标题 44px、flat 36px；粗指针统一至少 44px，后续取值以源码为准。
- `src/ui/tool-shell.css`：只管理视图 Grid/Flex、父容器 gap、局部宽高/滚动与真实业务状态；不得复制通用 `summary` 的最小高度、Hover 背景或边框圆角。开发页同组 `developer-context`、`developer-run-area` 使用 `od-stack` 8px，独立区块父 Grid 16px。
- **业务归属（2026-10-28）**：可安装工具的主题、插画色和专用按钮变体留在 `examples/sidebar-tools/<id>/src/`；经审计的可信权限界面样式留在该工具 `trusted/host.css`，由现有可信 React 根固定引入，不从安装包加载可信 CSS。共享组件自身的变量（例如对话气泡）留在组件 CSS，并限定在组件根上。只有已有独立消费者、语义也通用的规则才提升为公共组件；多个业务页面看起来相近不构成提升理由。退役功能无引用的样式直接删除。
- **应用定制**：复用公共 `od-*` 基类，专用变体使用应用前缀；不要给框架增加单应用的 `od-button--*` 或主题类。声明 `@opendesk-shared-design` 的工具可在自己的单一根类 `@scope (.app-root){…}` 内定义应用主题和变体，公共组件默认外观仍由共享来源提供。现有编译器保留全局覆盖及远程资源限制，拒绝 scope 内的全局注册规则和无效字符串；作用域只是 CSS 归属边界，不增加权限。
- **不要嵌套重复边框**：主功能独立 `od-disclosure`；依赖 SHA、编译产物和运行历史使用内部 `od-disclosure od-disclosure--flat`；首次说明使用 `--info`。普通卡片需要 padding 时同时使用 `od-surface od-surface--padded`。
- **隔离边界**：这些 CSS 原语只为可信 Side Panel/共用可信工具页提供直接复用。Native Workspace、Settings、Marketplace、可安装工具 iframe 及目标网页仍按 R27 各自隔离构建与主题映射，不扩大权限或跨执行世界加载宿主 CSS。
- **验收**：用 `sidebar-component-contract.test.mjs` 的 CSS 规则/声明检查保护外观所有权，`sidebar-r19-layout-visual.mjs` 比较开发与云控两 Tab 的计算背景、边框、圆角、标题、Hover、深浅色；静态 Chrome 结果不能冒充 Mac 原生扩展、真实缩放、权限或安装验收。缺证据标 `NOT_TESTED`。

直接复用的 HTML：

```html
<details class="od-disclosure">
  <summary>当前网页 <span id="script-current-page-host">正在识别…</span></summary>
  <div>地址与可运行状态由现有业务代码动态维护</div>
</details>
<details class="od-disclosure od-disclosure--flat"><summary>依赖 SHA</summary><pre class="od-result">按需查看</pre></details>
<div class="od-surface od-surface--padded">普通内容卡片</div>
```

### R31 本轮完成目标与关键测试条件（2026-10-28）

**当前目标：公共设计层只承担通用职责，应用独立拥有业务样式，拆分后受影响界面的外观与操作保持一致，并有可重复执行的归属检查。** 本轮以源码分层和受影响范围验证为完成边界；正式安装包更新另按原发行合同触发。

| 目标 | 完成条件 |
| --- | --- |
| 公共层通用 | `design-tokens.css` / `design-system.css` 中已识别的应用专属变量、主题、选择器和单应用按钮变体为零；通用安装管理和导航仍由宿主持有。新增公共变体须记录至少两个现有独立业务消费者及一致的通用语义，脱离具体业务数据仍可成立；未满足时留在自身 owner。 |
| 专用样式有明确 owner | 沙箱应用样式、固定可信权限界面样式、共享组件局部变量分别归属应用 `src/`、工具 `trusted/`、组件 CSS；无重复实现、无为了移除业务名称而保留业务条件的公共规则。移走的规则能逐项核对选择器语义、声明、条件与顺序。 |
| 拆分保持使用体验 | 同一浏览器、字体和视口下，受影响界面浅深色、控件状态与焦点的计算样式相对拆分前基线无差异；原有点击对象、按钮可用性、确认/取消和隐藏行为保持。 |
| 后续修改可回归 | 归属与编译边界检查保留在仓库；测试会拒绝应用样式回流和作用域逃逸。视觉证据记录实际输入、浏览器、场景和结果，不能用测试总数或旧报告替代当前改动的证明。 |

关键测试按真实影响选择；以下是本次拆分的必守条件，不是要求每次修改文档都执行全套产品测试。

| 关键条件 | 通过标准 | 对应入口 / 证据 |
| --- | --- | --- |
| 归属及无重复 | 公共设计无 Cookie 专属规则；6 个已拆分工具的样式不回流 `tool-shell.css`；可信样式固定导入原 React 根；退役 AdBlock 仅保留必要隐藏保护。共享设置类在 Time Review / Stay Focus 中语义中性，原控制器 ID 不变。 | [应用归属检查](../../tests/environment/application-style-ownership.test.mjs)、[可信功能归属检查](../../tests/environment/trusted-feature-style-ownership.test.mjs) |
| 定制有界 | 应用根内主题和变体有效；根外同类控件、文档根变量、无关 Quick Notes 编译结果不受 Cookie 定制影响。全局覆盖、非法 scope 根、坏字符串换行、转义 URL、远程资源及 scope 内全局注册规则均须拒绝；合法注释、字符串括号、emoji 和续行可通过。 | 应用归属检查；浏览器中比较应用根内/外控件及根变量 |
| 外观和焦点保持 | Cookie 列表、编辑器、账号界面及按钮 hover / expanded / pressed / disabled；Time Review、Stay Focus、Cookie 首次授权和书签授权界面，在浅深色下比较几何、颜色、背景、边框、字体、display、间距和焦点。当前范围内计算样式差异为零，Tab 焦点可见；预览强制主题与系统主题组合保持原行为。 | [Cookie 设计检查](../../tests/environment/cookie-editor-react-design.test.mjs)、可信功能归属检查；同输入 Chromium 计算样式比较 |
| 受影响操作保持 | 设置控件确认/取消、隐藏、busy 和 disabled 行为正确；原生点击对象同步传递，原 ID、焦点和滚动目标保持。应用列表到编辑、取消及弹层开关保持；CSS 改动不能让隐藏或禁用控件重新可操作。源码断言或静态 DOM 比较不能充当真实安装操作证据。 | [可信设置交互检查](../../tests/environment/trusted-settings-react-ownership.test.mjs)、[网站授权定向回归](../../tests/environment/time-review-r15-site-grants.test.mjs)；受影响应用的最短操作链 |
| 编译及加载保持 | 应用实际构建入口可编译，产物保留原生 scope 且通过共享 CSS 编译器；固定可信 CSS 随现有 React bundle 加载，无遗漏的额外 CSS 资产。共享沙箱 UI 保持原固定 React/组件来源，动态安装包的 CSS/JS 不进入可信样式入口。 | [可信样式内存编译](../../tests/environment/react-sidebar-style-bundle-r23.test.mjs)；[共享 UI R16](../../tests/environment/sidebar-shared-ui-r16.test.mjs) 的 `fixed shared UI compiles`、[R17](../../tests/environment/sidebar-shared-ui-r17.test.mjs) 的 `upstream React Aria`；Cookie 实际入口 `write:false` 编译 |
| 结论与输入一致 | 保存基线/候选相关源码和实际 CSS 摘要、浏览器版本、场景及差异；历史证据可在相关输入未变时复用。新引入或无法排除与本次改动相关的失败阻止完成；证实无关的旧失败单独记录。权限、来源、身份或撤权异常必须先分类并验证，不以放宽校验取得通过。 | 源码 diff、定向结果与候选证据；真实安装/升级未执行时保持 `NOT_TESTED` |

**执行与停止条件：** 修改归属/编译器时先运行两份归属检查；影响控件类、CSS 顺序或样式时，再运行对应组件/交互检查和受影响场景的计算样式比较；修改构建入口时才补相关内存编译。上述当前受影响条件全部满足、无未解释的新失败后，即可报告“源码优化完成”。不以固定的 54 项测试数或 95 分作为长期通过标准，不因本轮完成自动启动发布或全仓巡检。

**现有证据（上轮观察，本次仅制定合同，未重跑）：** 本机 `artifacts/css-ownership-20261028/verification.json` 记录 54 项定向检查，以及 Cookie 8 组、可信宿主 12 组、预览主题 4 组的计算样式零差异。这些为静态/模拟界面与编译证据；应用完整操作链及同候选真实 Chrome 安装/升级尚未据此验收。正式包 `2.0.39` 与开发配置 `2.0.40` 的既有差异、其他旧断言问题保留原记录，只有实际阻断当前步骤时处理。

**阶段边界：** 本轮不启动正式包晋升、Chrome 安装/升级、全仓旧测试修复、尺寸/缩放矩阵或全量评分。后续明确进入发布阶段时，再按原打包器的候选→定向门禁→同源晋升→同 ID 更新流程验证版本、权限与数据保留；不得将本节的源码完成视为发布完成。

## R31 目标适配：第一方可信工具 UI 不必默认 iframe（2026-10-13）

这是 [官方预编译 UI / 动态工具隔离决策](browser-framework/custom-tool-ui-and-local-development.zh-CN.md#r16-设计决策官方预编译-ui-与动态工具隔离并存2026-10-13) 在 **Side Panel 布局**上的增量规则，**当前尚未实施**；不改变上文对现行 iframe 工具的 R26/R30 约束。

- 时间回顾等在**编译期确认**的第一方可信 UI 可复用既有 `#sidebar-tool-display`、宿主标题栏、`od-page/od-toolbar/od-button/od-surface` 和同一 `src/ui/design-tokens.css` 直接渲染，不添加第二层页面 gutter、第二个卸载入口或新的滚动容器。可用 ES Module/局部 CSS/必要时 ShadowRoot 防止同名变量和 CSS 污染；ShadowRoot 并非安全边界。
- 未经编译期准入的安装工具继续使用原 opaque-origin iframe；不把宿主 `design-tokens.css`、Preflight、`chrome.*` 或任意包脚本放进工具执行世界。视觉差异通过隔离工具自己的 CSS 数值映射修复，不能为“统一样式”解除权限隔离。
- 可信界面上的开始/恢复/暂停应在同一区域完成；首次来源与网站权限在原位可信 DOM 完成。已存在有效权限时避免二次确认，只有扩大范围、Chrome 缺失权限或不可逆清理才要求必要审核。320/360/400/600px、200% 缩放与真实键盘顺序以同候选 Chrome 证据为准，不能把静态 UI 评审当原生 95+ PASS。

## R40：工具标题栏次级操作与紧凑 Ghost 图标（2026-10-23）

以下保留 R40 的历史设计及消费者记录。现行公共 `od-page-actions` 的源码 gap 为 8px，Ghost 外观不意味着自动使用 4px；ToolHost 的尺寸与布局继续按其真实 owner 及 R4.2 例外核对。

- 正式宿主拥有唯一标题栏，标准尺寸 `--od-icon-size`（当前 34px）；顶部操作组以 `--space-1`（4px）排布。`od-page-head` 内图标按钮默认透明背景、透明边框，Hover/展开使用 `--od-muted`，保留可见 Focus、文字 `aria-label` / `title`。不要通过取消按钮点击区域来节省宽度；动作过多时低频操作应合并进更多菜单。
- 已验证的官方 Sidebar Tool 可通过既有 `OpenDeskTool.setNavigation({page,title,canBack,primary,secondary,secondaryExpanded})` 声明一个可选**展示级**次级入口；当前 `secondary` 枚举 `transfer` 或 `more`，宿主仅渲染图标、状态并将 `secondary` 点击回送给原沙箱，不读取菜单内容或代替执行。非官方/未验证工具仍保留自己的工具内导航，不能用此显示契约提升权限。
- Prompt Shortcuts 把导入/导出触发图标移入宿主顶部（新建按钮旁）；真正的 `input[type=file]` 用户点击、已获 `user.export` 能力支持的 `browser.downloads.text` 调用、8 KiB 容量校验、ETag 并发控制与菜单均保留在沙箱。展开菜单从 iframe 内容顶部对齐，关闭后**不保留空白工具栏行**。不要跨 iframe 转发合成文件点击、伪造用户手势，也不要将导入导出升级为第二个 Host。
- 宿主标签、动作密度和状态色属于公共 `src/ui/design-system.css` / `src/ui/tool-shell.css`，扩展只管理浮层定位和业务反馈。`preview/index.html` 是模拟交互预览，真实 Chrome/CFT 是否达到目标必须另验；窄尺寸下检查标题省略、按钮顺序、Tab/Escape、弹出层不裁切。

## R4.2：已安装工具共享标题栏单行紧凑收纳（2026-10-23）

R40 的通用 34px Ghost 图标、4px 间距仍用于普通页头。**仅**已安装工具的可信 `sidebar-tool-view-head` 在 R4.2 按窄侧栏实际空间采用桌面 30×30px 命中区域、17px 图标、2px 相邻间距；默认无背景与边框，使用原有 Hover/Focus/展开态 Tokens。标题 `flex:1;min-width:0`，单行省略。粗指针改为 44×44px，更多菜单内操作至少 44px。320px 宽度须通过标题省略而不是减小点击区域保障单行；真实触屏、200% 缩放以及焦点读序仍须用 Chromium/安装版分别确认，不能凭源码评为无障碍 PASS。

标题行的顺序由已有可信 React Host 决定：返回、标题、官方核准的主操作（新建）、次级操作（导入导出）、共享 AI Chat Slot、可信「更多」。设置、显示控制、右键菜单和卸载在同一更多容器中**移动原始 `ToolField` 控件，不复制 ID，不增加新权限或第二套 Host**。更多负责打开/关闭及焦点；原安装/设置/卸载业务、二次确认、授权与导航仍通过 `src/ui/sidebar-tools.js` 分发。任意功能缺少授权时不因菜单内嵌而获权。

Prompt Shortcuts 的 `ps-count` 保留数量计算及 `aria-live`，用视觉隐藏样式从文档流移除；`ps-seed-hint` 可见提示与其冗余布局删除。关闭导入导出时不可把焦点放回隐藏统计，必须转到真实可见按钮。无官方导航核准的安装或开发预览，仍应保留工具自身的操作回退。

`examples/sidebar-tools/prompt-shortcuts/preview/index.html` R4.2 保留原完整交互场景，并模拟 320/360/400/440px、更多、导入导出与共享聊天位置；模拟不是安装、Chrome 权限或 Provider 实测。正式 JSX 编译、框架菜单行为、包晋升及 Mac Chrome 安装必须按各自证据分别标记 PASS/FAIL/NOT_TESTED。


## 2026-11-09 · Web Flow V0.3.2 浅蓝灰皮肤收敛（Host 层）

- **来源与目标**：以 `projects/webflow/preview/index.html` 的浅蓝灰、连续页头和细分隔为视觉参考；不复制其 CSS 为第二套框架，不将聊天模拟当作安装版视觉验收。正式视觉仍以 `src/ui/design-tokens.css` 与 `src/ui/design-system.css` 为权威。
- **颜色语义（2026-11-10 修正）**：浅色次级文字使用 `--od-sub:#5b6e86`，在白底及浅灰底均保留普通小文本 AA 对比度；`--od-line:#dfe6ef`。默认浅色页面画布 `--od-bg:#fff` 与表面 `--od-paper:#fff` 均为白色，五 Tab、详情、工具宿主和独立 Catalog 沿同一 `design-system.css` 的 root/body 消费，不在单个 Tab 追加背景覆盖。Web Flow 预览外围展示画布的 `#f4f6fa` 不用作默认产品页面底色，`#f7f6fd` 也不属于这套产品参考色板。保留原 `--od-muted` 的悬停/只读语义、`--od-brand`、`--od-focus`、暗色 Tokens 及危险/成功语义。不要照搬预览中对比度不足的浅灰小字，也不跨沙箱覆盖工具自身主题。
- **Header 所有权**：`od-toolbar` 只负责水平排列，`od-page-head` 仍提供公共页头结构与 Ghost 操作视觉。仅 `sidebar-tool-view-head` 负责已安装工具顶部连续白底、单层边线、48px 页头和与 iframe 对齐的唯一 gutter；原 30px 桌面、44px 粗指针命中区不因视觉调整而缩小。五 Tab 从语义色读取文字/选中态，暗色模式保留原高对比度选中提示。
- **可信状态与独立应用**：Web Flow 的可信自动运行行在 Header 下使用同一画布宽度和底部分隔线，运行授权按钮仍保持 44px 命中区；工具内 `wf-app` 在隔离 iframe 中单独映射浅色语义颜色及暗色文字对比，不注入宿主 CSS。其它工具不必修改业务结构或授权边界。
- **回归与交付**：公共 CSS 改动按现有 `sidebar-component-contract.test.mjs`、`sidebar-tool-spacing-contract.test.mjs`、`sidebar-tool-header-title-r2.test.mjs` 与相关真实消费者回归。Web Flow 源码变化后由原 `projects/webflow/preview/build-design.mjs` 生成当前源码同源预览并执行 `check-design.mjs`，不可手修生成 HTML/manifest 冒充同源。只有与当前候选绑定的真实 Mac Chrome 截图及 computed style、点击/焦点/主题核验才能报告视觉 ≥95；未测标 `NOT_TESTED`。
- **本轮关键测试条件（2026-11-10）**：在实际加载的 `dist/development`、原扩展 ID 和已连接 watcher 下逐一进入五个产品 Tab，核实 root/body 的浅色计算背景均为 `rgb(255, 255, 255)`，透明工作区及详情/工具返回继续呈现同一白色画布。当前真实宽度下无页面级水平溢出、菜单遮挡或操作裁切；搜索命中/无结果/清空、类型筛选/恢复、菜单 Escape/焦点及详情返回保持可用。共享浅深色文字、焦点及输入边界对比度作定向检查；截图须与实际 revision 绑定，临时样式不得当作持久生效。尚未执行的主题切换、尺寸/缩放矩阵、安装和 production 验收保留 `NOT_TESTED`，不扩大为本轮前置。
