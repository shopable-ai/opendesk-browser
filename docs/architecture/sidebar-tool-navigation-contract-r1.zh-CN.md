# Sidebar Tool Navigation Contract R1 · 已安装可信框架上的最小层级协作

状态：R14 源码合同（2026-11-08）；R1.2 保留历史试点。同一宿主页头展示工具/子页路径与唯一分层返回，R14 在现有 `setNavigation` 上增加可选动作快照，不创建 Router 或第二条导航栏。Bridge、Host、React More 与 AI Proxy / ScrapyJS 消费者已接入。当前证据为定向 Node 与真实浏览器中的源码夹具，分层记录见下表；它们不证明用户实际安装、Native 或发布批准。R2.2 的“仅短标题、完整路径只在 title/ARIA”限制仍由现行可见路径规则替代。

| R14 证据 | 范围 |
| --- | --- |
| [Host 回归](../../artifacts/r14-header-actions/host-final.tap) | 30 项：完整快照、实例/页面/revision、身份/撤权、状态围栏与异步失败隔离 |
| [AI 消费者](../../artifacts/r14-header-actions/ai-final.tap) | 119 项：导航、环境与服务；unknown 恢复和失败只读请求的通知循环 |
| [ScrapyJS](../../artifacts/r14-header-actions/scrapy-final.tap)、[旧消费者](../../artifacts/r14-header-actions/legacy-final.tap) | 分别 3 / 15 项定向检查；不是完整工具回归 |
| [浏览器布局](../../artifacts/r14-header-actions/browser-matrix.json) | ego 源码夹具，三语 × 明暗主题 × 280/320/330/380/390/500 CSS px，共 36 项；长标题、六动作、禁用原因、固定控件与 Escape |
| [AI 操作](../../artifacts/r14-header-actions/ai-browser-final.json)、[ScrapyJS 操作](../../artifacts/r14-header-actions/scrapy-browser.json) | 四个 AI 入口及返回、配置库及返回不重挂载；iframe 外点关闭 More 并保留输入焦点；内存适配器，不是代理/采集/真实安装证据 |

夹具复用真实 Host/Bridge/React/App；ego 使用共享 Profile。为避免已装 Page SDK 的 HTTP 注入冲突，ScrapyJS 夹具以 data-origin 文档运行，补足 `crypto.randomUUID`，只允许固定夹具脚本且禁止 connect；这些适配不是 production CSP 或真实安装验证。源码输入/输出指纹保存在[夹具清单](../../artifacts/r14-header-actions/browser-fixture/inputs-sha256.json)。production、实际安装及独立复评以对应新回执为准，未有回执不得外推。

## 同一宿主页头的可见路径与唯一返回（现行）

R2.2 曾用末级短标题解决父子 flex span 拉开的大空白，但把工具上下文仅留在悬浮与 ARIA 中，不能满足当前可见路径需求。现在由同一页头连续显示工具名与当前子页；不恢复两个分别占宽的 flex span，不在内容中再造标题、说明或返回。

| 实际视图 | 同一宿主页头可见标题 | 唯一返回目标 |
| --- | --- | --- |
| scrapyjs 采集根页 | `scrapyjs 采集` | 扩展列表 |
| scrapyjs 配置库 | `scrapyjs 采集/配置库` | 采集根页，再返回扩展列表 |
| 已适配工具根页 | 工具名 | 扩展列表 |
| 已适配工具设置、详情、新建或编辑 | 工具名 / 当前业务子页 | 原业务父页，保留进入上下文 |
| 未获准入或未适配工具 | 工具原名称 | 保持原宿主根操作，内部导航由工具负责 |

- **展示 owner**：沿用 `src/ui/sidebar-tools/title-path.js`、`src/ui/sidebar-tools.js` 与 `src/ui/react/tabs/tool-host.tsx` 的现有职责；同一标题文本保留工具/子页上下文，`title` 与 `aria-label` 补充完整语义及实际版本，不能代替可见路径。只在确有溢出时 CSS 单次省略；未知业务名不做宽泛正则裁剪，映射继续用 `Object.hasOwn`。`title-path.js` 已在源码中改为工具/页名显示。
- **内容归属**：已适配子页只展示业务数据、搜索、表单及必要状态；移除与宿主页头重复的标题、用途说明、返回和同一主操作。业务区块名、字段帮助、错误/权限/空态说明仍按实际需要保留。可信设置也不重复“工具设置”H2，可访问区域名称保留。
- **能力与准入**：现有有界 `OpenDeskTool.setNavigation` 是发现起点；先核对公开导航合同、真实消费者及真实安装状态，不因内容里出现返回按钮就宣称 API 缺失。按用户 2026-11-04 决定，所有已审阅安装的工具均可使用导航展示，不以当前官方 Catalog 的版本、包 SHA 或发行来源记录匹配为运行前提；旧版本、本地审阅包、来源记录缺失/过期及目录不可用均不能恢复“仅完整官方包”门槛。真实安装包身份绑定、能力、安装代际（epoch）、来源/实例验证及撤权保护保持原合同；这不将动态代码提权，也不允许直接控制宿主 DOM。无复现证据的缺口仍为 `SDK_GAP_NOT_PROVEN`。
- **生命周期与保护**：导航接收、呈现及动作发送继续绑定完整包字节、安装代际、活动实例与来源；撤销后清除旧提示，保留草稿不保留控制权。重复打开同一有效实例不重建；延迟初始化失败不能销毁新工作区。子页返回交给原业务处理。已安装沙箱在根页上报 busy 时，根返回只展示扩展列表，保留原 iframe、实例、草稿与请求；随后可切到其他 Tab，重开同一工具恢复原实例，不重复初始化或执行。真正关闭、替换、更新或卸载仍保留 dirty/busy/保存中/结果未知及撤权围栏；未知副作用不自动重放。只读预览与可信原生界面保持原关闭保护。

### 未决操作期间的根页返回（2026-11-04）

ScrapyJS 的历史 AI 请求或本机任务尚未确认结束时，可能持续上报 busy；不能将它一律提示为“正在保存”，也不能靠清锁、重建 iframe 或重跑请求恢复导航。宿主允许用户先返回扩展列表，并保留唯一原实例；提示用户重新打开原工具查询、停止或继续查看原操作。工具自己的隐藏任务须在根页提供可见恢复入口。任务确认结束后，普通关闭重新适用原有草稿保护。

此返回行为不新增后台运行合同、授权或第二个工具实例，不表示请求已停止或保存成功。列表显示状态不代表执行已空闲；开发自动刷新继续检查原工具的 dirty/busy 与 Provider Lease，不得因工具隐藏而跳过。旧实例消息、跨窗口撤权、卸载和包身份校验继续由原 Host 处理。定向回归入口为 `tests/environment/sidebar-tools-host.test.mjs` 的 `Host Back preserves a busy sandbox while returning to the list and other tabs`，以及 ScrapyJS [项目测试](../../projects/scrapyjs/tests/local-runner-app.test.mjs)的空闲恢复和原结构任务恢复场景；Node 结果与真实 Chrome 生效状态分别报告。

### 开发与预览的接入及验证顺序

1. 先观察完整宿主已有的返回、标题和主操作，记录当前页、父页与下一条用户操作，不能只看 iframe 内容。
2. 查公开导航能力、最小真实消费者及目标工具受信准入，区分未接入、预览 Mock 未对齐和已复现的平台缺陷；不先调查整套宿主或新建导航 API。
3. 将工具/子页路径接到同一宿主页头，返回遵循子页→工具根页→扩展列表；内容只保留业务，主操作沿现有有界入口避免重复。
4. 对同一候选的完整宿主视图检查根页及子页：可见路径正确、仅一个返回、逐级目标正确、未保存取消/保留、忙态/未知保护与焦点恢复有效。预览 Mock 必须对齐原导航状态/动作；截图裁掉宿主页头或只检查内容不能证明去重完成。
5. 当前任务要求评分时，在信息架构/交互及视觉冗余维度显式扣除重复导航、重复标题/说明/主操作，记录具体位置与扣分理由；不得以同源或测试通过抵消。旧评分仅作历史证据，不能沿用为新候选通过；修复后须绑定同候选完整宿主视图重新验证，未复评不报新评分通过。离线与真实已安装 Chrome 分级，未执行记 `NOT_TESTED`。

### scrapyjs 重复导航根因与修复记录（2026-11-01）

旧候选完整宿主视图出现双返回，宿主 Back 直接退出到扩展列表：工具 App 未调用 `setNavigation`，预览 adapter 未提供该方法，共享 shell Back 仅返回 list；标题 helper 仅显示叶名。公共 SDK 已足够表达所需导航，问题在接入及标题呈现。

该次修复记录中 `title-path.js` 已改为工具/页名，工具 App 与预览 adapter 已接入导航，并记录了定向离线流程通过。当时因 official source catalog 匹配而限制正式 scrapyjs 导航的做法已由 2026-11-04 决定取消，不能作为当前准入要求；历史实际安装接入为 `NOT_TESTED`，不在本次文档修订中改写为通过。App 按能力检测，仅已接入实例去掉内容返回；无能力实例保留原工具内返回，不能因预览 Mock 可用而切断真实工具的退出路径。离线通过不代表安装通过，也不沿用旧评分为新候选通过。

## R14 · 可选 Header 动作完整快照

**框架拥有 Header，应用拥有业务。** 新生成扩展优先复用原 `OpenDeskTool.setNavigation`，不另建页级工具栏或宿主 DOM 接口。Header 只投影展示信息并把点击交回原应用；业务页面、草稿、请求、确认、权限申请及结果处理仍由应用负责。旧 v1/v2 安装包没有任何 schema 变化，不做持久化迁移或强制重包。

### 状态与兼容

- 原字段 `page/title/canBack/primary/secondary/secondaryExpanded` 的合同保留；无 `headerActions` 的旧调用，其 normalize 返回值完全不变，不补动作字段或默认数组。
- `headerActions` 可选，为至多 6 项的数组。每次 `setNavigation` 都替换完整导航状态及动作快照，不合并旧动作；省略该字段或传 `[]` 不保留上一页动作。顶层及动作对象未知字段仍拒绝，重复动作 ID 拒绝，不裁剪、不部分接受。
- `headerActions` 非空且 `secondary:'more'` 时整次调用返回 `false`，应用立即重新提交不含 `headerActions` 的旧 base。`secondary:'transfer'` 可共存；空动作数组与 `more` 不构成此冲突。
- 先检测 `typeof OpenDeskTool.setNavigation === 'function'`；只有 `OpenDeskTool.navigationFeatures?.headerActions === true` 才表示 SDK 与 Host 两端支持增强。增强接入可选，增强 `setNavigation` 返回 `false` 时立即提交旧 base；没有特性、旧 Bridge 或 base 也被拒绝时保留业务内容入口和原导航，不能切断核心功能。
- Host 可设 `headerActionsEnabled:false` 关闭新动作投影，原返回、主/次操作继续工作。能力声明不替代当前状态接收、显示或授权的判断；应用仍保留核心业务内容入口，不以 Header 是否出现决定功能可用性。

| 动作字段 | 校验与语义 |
| --- | --- |
| `id` | 必填字符串，正则 `^[a-z][a-z0-9-]{0,31}$`；同一快照唯一 |
| `label` | 必填字符串，去首尾空格后长度 1..40，拒绝控制字符 |
| `icon` | 可选，仅 `new/edit/settings/diagnostics/subscriptions/library/list/refresh` |
| `priority` | 可选，整数 -10..10，默认 0 |
| `disabledReason` | 可选字符串，去首尾空格后长度 1..80，拒绝控制字符；存在即禁用，空串不是启用方式，启用须省略字段 |

控制字符拒绝规则沿用导航文本规则，包括 C0/C1（U+0000–001F、U+007F–009F）及双向文本控制 U+202A–202E、U+2066–2069；不能用修剪来吞掉非法控制字符。动作对象只允许上表字段，不传 `permission/js/url/html/callback`。label 是展示文本，不是命令、HTML、可信授权文案或任意图标源码。

### 点击、页面状态与清理

Host→app 复用 `kind:'navigation-action'`；原 root 事件 `opendesk-tool-navigation` 新增 detail `{action:'header',actionId,page}`，原 `back/primary/secondary` 的 detail 完全不变（仍为 `{action}`），不向旧动作附加新字段。

每次状态替换推进快照 revision，点击必须绑定并复核真实活动实例、当前页面和该快照 revision；同一页换快照后旧按钮也不能执行。页面切换、实例替换、撤权及销毁时清除旧投影与监听，迟到动作和回调不得落入新实例；revision 是围栏，不是新增业务路由或安装数据。宿主 `busy/dirty/actionReview` 任一为真时新 Header 动作不可执行，`disabledReason` 存在的动作同样不可执行。此限制不改写原返回保护，尤其不取消上方忙态根返回保留实例的规则。

应用每次进入页面、编辑或开始/结束异步操作，都同步真实 `page` 与 `OpenDeskTool.setState({dirty,busy})`，收到动作后再次核对当前页、状态及动作 ID。dirty 仅在保存已确认或用户明确放弃后清除；busy 不可为导航强行清锁，结果未知不得自动重放。actionReview 是宿主原审阅锁，不增加应用自报授权字段。卸载时解绑事件并清理本实例的定时器/订阅；不能用销毁回调清除未决效果或伪造完成。

导航不授予权限或用户手势，root 上的 CustomEvent 不能当作 `isTrusted`。权限、安装身份、能力与 epoch 继续走原安装/Authority。危险授权、代理应用/应用代理配置、Cookie 修改或导出、正文采集等敏感动作不得由 Header 无确认快捷执行；按钮可打开原业务审阅界面，实际执行必须经过对应可信确认和权限链。完整最小接入及事件解绑见[公开 API 示例](../api/sidebar-tools.zh-CN.md#r14-headeractions-可选接入示例)。

More 支持方向键、Home/End、Escape、Tab 与外点关闭；焦点进入 iframe 等其他文档时同样关闭，保留新的输入焦点。读取、身份解析或可信 handler 的同步/异步失败只在仍属当前快照时提示，保留原应用实例，不自动重试。AI Proxy 的 unknown 导航锁只在服务 `GET_STATE` 或 `STOP` 明确返回 `outcomeUnknown:false` 时解除；无关成功响应不能当作未知效果已核实。

## 用户原则

顶部固定唯一 `←` 按钮：根页面回扩展列表，工具内子页面逐级返回；右侧按上下文保留最多必要操作，低频新标签页入口归入可信设置。最近摘录是网页剪藏首页内容，不是中间独立层级。设置由原页面进入时保留原页面实例，返回后恢复；未保存草稿先走原有安全保护。任何扩展未经显式适配，不擅自删掉自己的导航 UI。

R2.2 本地证据与验证缺口见[增量记录](../framework/workstreams/sidebar-tool-title-r22-local-20261026.md)。原生已安装业务操作、源码绑定布局夹具和 Node 安全测试分别记录，不能互相替代；用户最新要求只保留增量检查，不自动扩展完整验收。

## R1.2 历史试点的 owner 与消息边界

本节记录当时仅剪藏的试点，不是现行官方工具白名单或动作全集；现行有界导航以原 Bridge 的 `normalizeToolNavigation`、宿主准入和上方现行规则为准。

- 业务 owner：`examples/sidebar-tools/web-markdown-clipper/src/notes.js`，负责 `home → library → reader → edit`、从 `recent → reader` 直返首页、编辑来源、搜索/筛选/滚动以及保存/取消。不得使用 `window.history.back()`。
- 可信呈现 owner：现有 `ToolHost` / `src/ui/sidebar-tools.js`，只绘制标题、左返回及当前上下文图标，根页面仍使用原关闭/生命周期。不得复制一套浏览历史。
- 原版 `src/sidebar-tools/bridge.js` 仍是隔离入口，不允许扩展代码直接修改可信 React DOM。所有消息沿 `SIDEBAR_TOOL_PROTOCOL`，必须通过 `event.origin==='null'`、实际 `event.source`、宿主活动 `instance` 与 `toolId` 验证。工具被关闭、切换或实例重新创建后清空显示提示，旧消息一律无效。
- 当前已验真官方工具沿原协议上报各自受约束的 `OpenDeskTool.setNavigation`；历史 `web-markdown-clipper` 页面 ID 为 `home | library | reader | edit | new`。Sandbox→Host 使用 `kind:'navigation-state'`；Host→Sandbox 使用 `kind:'navigation-action'` 且 `action` 仅 `back | primary`。宿主将页面 ID 映射为内置标题和图标，绝不接受扩展自填可信标题、HTML、URL、脚本或特权操作。
- `busy / dirty` 使用既有 `OpenDeskTool.setState` 与宿主原始生命周期。编辑未保存时业务返回触发确认，打开设置前提示先保存或取消。保存或其他操作未决时禁止销毁或替换原实例；已安装沙箱根返回按上方现行规则保留实例并展示列表，其他关闭路径仍通过原有保护。
- `primary` 行为由 `notes.js` 自己判断：资料库新建、阅读进入编辑、编辑/新建保存。显示提示不能代替业务端再次验证当前状态。
- 旧工具及独立标签页：没有 `setNavigation` 的工具保留既有内部页头与按钮。没有已验证活动子页时宿主根返回保持旧操作，不凭空推断历史。独立标签页不创建虚假的扩展列表路由。

## R1.2 兼容性调查（历史记录，不代表当前准入状态）

| 扩展 | 已检查的源码头部 | 本轮处理 |
|---|---|---|
| Bookmark Manager | `bm-head` 中含「书签管理」标题、刷新 | 候选重复标题；涉及现有 React 生命周期，需单独适配 |
| Reading TOC | `toc-head` / `CONTENTS`、目录模式 | 目录与网页锚点切换独立，本轮保持原 UI |
| Cookie Editor | `site-bar` 网站选择与状态 | 非产品标题重复；高权限网站状态保留 |
| Prompt Shortcuts | `ps-head` 含新建及辅助标题 | 高频操作保留，不重复添加框架新建 |
| AdBlock | React `App.jsx`，索引 HTML 仅根节点 | JSX 与规则编辑属于独立流程，待专项审查 |
| AI VIP Share | `ai-vip-brand` 中有 Logo + 产品标题 | 可能占用空间，待下一轮低风险减法评估 |

本轮优先正式剪藏，其他六款未声称全部已适配或已达到 UX 95。

## R1.2 历史交付边界（不作为当前任务前置）

以下保留历史验收范围，当前阶段及宽度/缩放专项按 AGENTS 和最新任务要求选择，不自动执行。源码级一致性/纯 JS 语法检查、内存级业务导航试验不代表已在真实 React 编译产物或 Chrome 通过。Node 测试、`node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project`、同 ID 1.2.4 升级、浏览器 320/360/400/440px 和 200% 缩放及暗色、键盘触屏、真实存储读回是 Mac Codex 必须关闭的独立验收门槛。
