# scrapyJs 采集应用

**新版 UI 业务同步目标（2026-11-01）**：[当前目标、真实接入差异与关键测试条件](preview/GOAL.zh-CN.md#当前任务将新版交互接入实际扩展业务2026-11-01)。以实际侧栏的「编辑 → 保存/重开 → 采集 → 下载核对」为核心完成标准，点选/列表切换的离线模拟另列真实接入要求；历史预览分数和旧安装成功不替代本轮结果。

**最新需求边界**：用户的列表目标是逐条关联记录，完整字段路径应作为便捷输入；下述底层独立字段能力不等于“自动准备记录规则”已经完成。当前通用准备链仍待完善，未自动改变 parse 语义或添加推断。

**当前 JS 记录与字段模型（2026-11-01）**：完整 CSS 路径字段可省略 `_listItem` 和 `_listContainer`，返回页面对象中的独立字段/数组；一书一行等关联记录使用 `_listItem` 与相对字段，可选容器保留旧直接子项语义。插件的简单手工表单不改，高级 JSON 保留完整路径。parsePage、HTTP candidate 与浏览器 validation 已按真实记录验证，不要求唯一父容器；零匹配不扩大范围，字段、身份、URL、状态与分页保护保留。

普通字段例：`{title: '.subject-list > li.subject-item .info h2 a::text'}`。关联记录例：`{_listItem: '.subject-list > li.subject-item', title: '.info h2 a::text', url: '.info h2 a::href'}`。完整路径不会按字段数组下标自动拼行；有缺失字段时使用关联记录模式。仅需一条整页对象时可用 `ItemLoader.parse(page, itemConfig, true)`；需要稳定字段数组可显式 `cardinality:'many'`。

本轮只改 JS 核心、必要消费者和官方生成 SDK；Python runner 未修改、未测试。固定来源以 `vendor/scrapyjs/provenance.json` 为准，本地记录见 `artifacts/scrapyjs/record-model-20261101/REPORT.md`。真实网站在隔离 Chromium 中验证，未更新安装态、工具 dist、正式包或 Browser `dist/development`；下方旧 hash、测试与安装结论仅代表各自历史候选。

## 历史增量：列表容器可省略（2026-11-01，已由上节完善）

普通浏览器采集可以只指定记录选择器，例如 `itemConfig: {_listItem: '.book-list > li', title: 'h2::text', url: 'a::href'}`。在「列表范围」中将容器留空、列表项填写 `.book-list > li` 即可；配置校验、Controller 使用的完整 SDK 和离线规则预览采用相同语义。已有容器配置继续仅选直接子项；两者都留空按单页提取，不根据字段数组猜测行关系。此处原先的严格容器限制已由上节的实际记录验证取代，身份保护保留。

本次同步上游唯一构建产物及完整来源快照，仅两个提取源码文件发生变化。核心 `scrapyjs@1.0.0`、扩展 `3.15.0`、协议 `1.0` 不变；browser SDK SHA-256 为 `42caa8fbbd0580ebf43e1be5c84a17f99f65b5fa438b0ce1ba4675c5fed4387c`，精确输入见 `vendor/scrapyjs/provenance.json`。历史 SDK 哈希不代表本次产物。

验证：Node v26.3.1 下核心六文件 239 项检查、语法检查、API 文档检查和 Node/browser 构建通过；Node v24.16.0 下本工具七文件 67 项检查通过，Chrome 扩展协议 42 项通过。隔离 Chromium `156.0.8078.4` 使用真实 SDK / Controller / Scheduler 验证跨父节点记录、缺失字段关联、旧直接子项规则及 XPath 边界，并在内存中编译受影响 JSX；[可重放脚本](../../../artifacts/scrapyjs/list-item-only-20261101/check.mjs)及[结果](../../../artifacts/scrapyjs/list-item-only-20261101/report.json)保存于本地临时产物。

仅更新源码、SDK 及其来源记录；未覆盖并行工具 dist、冻结预览或正式安装包。已安装 UI、OpenDesk 权限链、真实网站与 production 为 `NOT_TESTED`，未安装、提交或推送。下方历史预览不代表本次源码已加载。

## 当前：自定义 CSV 表头内管理表格预览顺序（2026-11-02）

[打开完整交互预览](../../../artifacts/scrapyjs/light-20261101/candidate15-field-order/preview.html) · [本地入口](http://127.0.0.1:49870/candidate15-field-order/preview.html) · [源码、截图和验证](../../../artifacts/scrapyjs/light-20261101/candidate15-field-order/README.md)。

「采集规则」行首手柄可拖动排序，顺序随配置保存；字段名与选择器原样保留。结果区已移除单独的「显示设置」按钮和卡片：进入「自定义 CSV 表头」后，可展开「表格预览列顺序（可选）」调整表格顺序并恢复默认；该顺序仍不影响 CSV、JSON 或规则。拖动和键盘空格/方向键/Home/End/Enter/Esc 操作继续复用原 FieldOrder，保留字段即时编辑、清空、点选、列表范围和忙态/UNKNOWN 保护。

原 CSV、JSON 下载保留，「自定义 CSV 表头」中的列排序、名称输入与预览仍独立于表格排序，每字段一个名称输入框，留空使用原名、重名提示。规则页的「CSV 表头（可选）」折叠标题、编辑区和预览统一白色背景，并恢复编辑容器左右内边距。临时名称只用于这次 CSV 第一行；规则页「CSV 表头（可选）」可预填并随配置保存。AI/人工也可写 `output.fieldNames`，例如 `{"title":"标题"}`；JSON 的原始字段 key 不改，未启用自动语言识别。

上方历史冻结候选的 69 项 Node 检查、52 项离线交互仅证明 11 月 1 日旧布局，不能外推到合并后的 11 月 2 日源码。11 月 2 日 UI 源码和交互用例已提交 GitHub main；最新产物构建、正式包晋升、Chrome 真实侧栏、采集/下载与 production 仍未验证。以下旧候选只保留历史，旧独立显示设置入口不作为当前设计。

## 当前：字段修改直接生效（2026-11-01）

[打开更新后的交互预览](preview/preview.html)。删除「字段更改未应用 / 取消 / 应用字段」以及列表范围的应用栏。字段名、规则和点选结果合法后立即进入配置草稿，可直接保存或采集；保存配置仍负责持久化。无效输入就近提示并拦住保存/运行，修正后恢复，Esc 返回最后合法值。新增和连续重命名保持输入焦点；字段改名保留自定义 CSV 表头与排序。

真实工具源码同步，原构建器在独立快照生成预览，固定 HTML / manifest / context 三件套逐字节一致。独立 AI 专家复评 **96.5/100**，达到本轮 >95；评分仅绑定当前离线候选。未更新正式包或安装态，真实网站、Native、AI、production 与系统 IME 未测。[本轮验证与独立 AI 评审](evidence/fields-immediate-20261101.json)。下文涉及未应用字段的操作与分数属于历史候选。

## 历史：从结果进入显示设置（candidate11）

[打开完整亮色交互预览](../../../artifacts/scrapyjs/light-20261101/candidate11-result-display/preview.html) · [本地交互入口](http://127.0.0.1:49870/candidate11-result-display/preview.html) · [交付与来源记录](../../../artifacts/scrapyjs/light-20261101/candidate11-result-display/README.md)。先点击「开始采集」获得模拟结果，再从结果下载区右侧进入「显示设置」。无记录时不显示该入口。

显示名称是结果表头别名，和顺序、显隐一起在结果区原位编辑；不再放在采集规则的开关中。改名即时预览，原 key 始终可见；Enter/失焦完成当前输入，Esc 撤销当前改名。完成收起设置并恢复入口焦点，设置区域内非编辑状态 Esc 也可收起。显示设置仅本次使用，切换配置或关闭工具后重置，不随配置保存；完整记录及 CSV/JSON 保留原始 key、隐藏字段和全部记录。规则页专注字段/选择器，保留框内清空、点选、列表范围和复杂 JSON。

真实源码为 `src/App.jsx`、`src/Results.jsx`、`src/ColumnSettings.jsx`、`src/RuleEditor.jsx` 及原局部样式；列控制器由旧规则组件移入结果组件，沿用原 `resolveColumns`，未新增模型、依赖或 SDK。25 项相关 Node 检查、27 项本轮离线交互及同候选宿主截图检查通过，页面/控制台错误 0。HTML SHA `c843d74ec2f77a9b4f7553ff7197cf8f78cdb03517ea62327d5c1f5b5dc189eb`。构建在独立源码快照中使用原构建器完成，未覆盖工具 dist、固定预览三件套或正式包。

仅 `SOURCE_COMPONENT_PREVIEW`；真实网站/AI/Native/安装/production 为 `NOT_TESTED`，未提交、推送或晋升包。本轮不评分，未声称用户已认可审美。下方旧“当前”和候选均保留其历史范围；candidate9 的名称开关已由本节取代。


## 当前亮色交互预览（2026-11-01）

[打开本轮冻结的亮色HTML](../../../artifacts/scrapyjs/light-20261101/candidate9-neutral/preview.html)。内容导航改为浅灰轨道、白色选中面与深灰文字，去掉淡蓝按钮底与蓝色底线的混合；蓝色主要用于开始/保存和键盘焦点。保留并行的行内规则、清空/点选及显示名称开关，JSON 继续按原缩进横向滚动。

本轮为真实组件与模拟 SDK 的离线设计迭代。已回放导航/草稿、显示名/显隐、完整下载和配置库返回；尚未取得用户审美认可，不使用 AI 分数作为完成条件。源码快照、同候选完整宿主截图、来源差异与未测边界见[预览说明](preview/README.zh-CN.md)和[交付记录](../../../artifacts/scrapyjs/light-20261101/README.md)。固定预览与工具 dist 归并行 owner，未覆盖；本轮未安装、晋升、提交或推送。

## 本轮离线 UI：规则与显示列一行编辑（2026-11-01）

[打开同源交互预览](preview/preview.html)。采集字段输入兼展示，去掉重复标题，“＋ 添加字段”在字段底部居中；公共列表范围独立应用。显示列直接勾选、改名和拖动，复杂规则无损保留到JSON。取消不再误报新改动，旧校验错误指向当前输入；原始下载保持完整。

当前candidate5的53项浏览器操作、33项相关Node检查通过，真实安装/采集/AI未测；未晋升、提交或推送。设计决定、截图、来源与独立评审见[本轮预览说明](preview/README.zh-CN.md)。其余历史候选分数与原生记录不外推到本轮。

## 本次增量：配置库与宿主页头整合（2026-11-01）

已接入导航能力的实例使用同一宿主页头显示 `scrapyjs 采集/配置库`，返回按配置库 → 采集根页 → 扩展列表逐级执行。内容删除重复返回、页标题与用途说明，保留配置计数、新建、搜索和管理；选中配置的名称/保存字段数不再在操作区重复。搜索隐藏当前项时仍明确操作对象，编辑后清除旧保存反馈。草稿、未应用字段、命名、忙态、身份与原有焦点/滚动保护保持。

沿用已有 `OpenDeskTool.setNavigation`，不新建 Router/Header/Host。**正式 scrapyjs 尚不在导航能力的完整官方包准入目录内**，当前实际安装接入 `NOT_TESTED`；未获此能力的实例保留工具内返回，避免进入配置库后失去退出路径。离线 Mock 的接入不构成准入或安装证明。未修改目录准入、权限、正式包或既有安装。

本次候选、同 SHA 完整宿主截图、定向操作、独立分维评分与固定入口同步状态统一见[本轮证据索引](../../../artifacts/scrapyjs/library-navigation-20261101/README.md)。历史评分只属于原候选，后续并行主题与规则编辑亦须按新快照理解。

## 当前：新版实际安装 UI 已跑通采集与下载（2026-11-01）

App **1.8.2** / 固定 Task **0.6.1** 已通过原安装器更新到原 CFT149 扩展。实际从「扩展 → scrapyjs 采集」选择原保存配置，在豆瓣编程列表点击开始，成功返回 **20 条、12 列**，持久运行状态为 `completed / released`。JSON / CSV 均实际下载；20 条的标题、链接、出版信息、评分与当前网页核对一致，CSV 的 240 个单元格与 JSON 一致。详情弹窗、列显隐、键盘列排序、恢复默认及配置库搜索/往返正常；8 份原配置保留，隐藏列后的原始下载内容不变。

本轮修复两个当前入口阻塞：离线 AI 占位使用独立 preview entry，正式入口继续挂载完整 Chat；旧 Task 的运行时身份过期，使用**相同采集源码哈希、相同权限与站点**的新版本，经真实草稿运行 → 原生回执核对 → 本地可用 → 安装后，更新 App 的精确绑定。未放宽验证，也未重建 Browser。

相关模型53项、包与沙箱9项、预览来源4项、Chat草稿保留1项通过。正式 JSON 与当前源码逐字节匹配。原 Browser 仍为 `dist/development`，本次没有恢复或证明根 serve 的实时连接；不把本机安装态结果当作 production 验收。真实 AI 推理、当前版本 Stop/CSDN/HTTP/production 未测；原 UNKNOWN 请求保留、未取消或重放。[本轮完整证据](../../../artifacts/scrapyjs/ui-run-20261101/README.md)；[机器记录](evidence/ui-run-20261101.json)。本轮未提交或推送，保留并行未提交源码及共享样式的归属；下文结论均按各自历史候选理解。

## 历史：配置库交互预览重新设计（2026-11-01）

[打开新版交互预览](http://127.0.0.1:56347/artifacts/scrapyjs/library-redesign-20261101/candidate2/preview.html)，点击配置库图标进入；固定 [preview.html](preview/preview.html) 已同步。返回导航、标题、新建和搜索分层；列表明确当前使用；编辑规则突出，保存仅在有更改时出现；复制/重命名/导出/删除收进更多操作。搜索可按名称或网站筛选，支持清空、无匹配恢复；保存版与草稿字段数明确区分，切换确认点名目标，原草稿/身份/CAS/忙态与UNKNOWN保护保留。

旧版独立评分 **76/100**，最终同候选两位独立设计评审 **98/100、96/100**，以较低分96达到本轮 >95 目标。[分维评审、截图与交付证据](../../../artifacts/scrapyjs/library-redesign-20261101/README.md)。配置库22项、原控件51项、状态11项定向离线回放通过（覆盖有重叠）；1373项来源核对零漂移。评分只针对本次离线配置库，不外推到真实安装。源码同步到原工具，未安装/升级或晋升正式包，真实AI/采集/production未测，未提交推送。下文为各自历史候选。

## 历史：实际侧栏 UI 与完整 Chat（2026-11-01）

已通过真实 Chrome 的「开发 → 本地项目 scrapyjs → 在侧栏调试」加载源码快照 `aec0c11df99f`（App 1.8.0 / Task 0.6.0，未安装）。实际侧栏保留文字采集按钮、紧凑停止、图标配置库、规则末尾高级设置、JSON 标题/说明/紧凑导出，以及默认取消的受控确认。原生操作核对了配置库往返、无效 JSON 保护、确认框 Tab / Escape / 焦点返回与完整 Chat 开合后的未发送草稿保留；AI 占位仍仅用于离线预览。

本轮只修工具局部高度和业务滚动：实际调试 iframe 未收到宿主高度提示时，百分比高度使 Chat 撑到屏幕外；现在优先使用既有 Host 高度提示，缺失时采用固定 660px 回退，并提高业务滚动规则的局部优先级。真实侧栏已看到业务区、Chat 和输入框同时可用；未执行宽度/缩放或多屏幕高度矩阵。[本轮证据](evidence/actual-ui-20261101.json)；[实际截图、检查与未测边界](../../../artifacts/scrapyjs/actual-ui-20261101/README.md)。

真实 AI 请求/取消/重放、采集、成功保存配置、真实下载、安装升级及 production 均未由本轮验证；原 UNKNOWN 未处理，既有用户配置未改写。调试预览隔离权限，当前非目标页提示与写入/下载拒绝符合该入口边界。原目录 Provider 与本工具编译/快照 watcher 保留供继续调试；Browser 本体仍加载原 `dist/development`，未重建、重装、晋升包、提交或推送。下方记录按各自历史候选解读。

## 历史离线预览：文字采集按钮、图标配置库与 AI 占位（2026-11-01）

[打开最终交互预览](http://127.0.0.1:56346/official-scrapyjs-20261101-preview-handoff-v2/preview.html)。宽按钮保留播放图标与「开始采集」文字，停止保持紧凑图标；配置库入口只显示图标，保留 tooltip / 无障碍名称及原有子视图操作。

仅在离线预览中，右上角 AI 打开底部简洁窗口，说明「这里是 AI 对话的预览占位」，并指出实际入口「OpenDesk → 扩展 → scrapyjs 采集 → 右上角 AI」。支持关闭、再次打开、Escape 与入口焦点恢复，不显示发送表单、不调用 AI adapter。实际扩展仍默认使用完整 AiPanel / 公共 Chat，不能把占位开关带入实际工具。工具工作区显式持有 flex / 业务滚动布局，避免占位分支缺少 Chat 动态样式后超出可见区域。

最终 HTML SHA `c083b39a6dfe32b1128032c59df11b30d9c357a04bd9cb03562fb7e9be0d2e12`；同候选 52 项离线交互通过，页面/控制台错误 0，默认完整 Chat 的定向保留检查及本工具构建通过。[交付与截图](../../../artifacts/sidebar-preview-kit/scrapyjs-preview-handoff-20261101-evidence/README.md)。首轮布局失败和旧候选保留，历史评分不外推，本轮 NOT_SCORED。固定三件套来源核对与同步见交付记录。

该离线预览不证明安装态已更新；后续实际侧栏 UI 的核心开发结果见本页首节。真实 AI / 采集 / 安装升级 / production 仍未由本轮验证，旧 UNKNOWN 不处理、不重放；不恢复全量测试、评分或宽度缩放专项。未晋升正式包、提交或推送。

## 历史离线 UI：规则、JSON、新建确认与采集图标（2026-11-01）

[打开完整交互预览](http://127.0.0.1:56346/official-scrapyjs-20261101-controls-v2/preview.html)。规则中的「高级设置」移到常用字段/分页组之后，使用相同折叠样式与间距；完整 JSON 配置采用标题说明、右侧紧凑下载动作和编辑区，错误及导出反馈就近显示。开始/停止改为同尺寸播放/方块图标，保留 tooltip、无障碍名称和运行状态文字。

新建/切换/删除仍使用原 pendingAction 模型，确认以工具沙箱内 React 受控原生 `dialog` + `alertdialog` 呈现：默认取消、Tab 首尾约束、Escape/取消保留草稿并返回对应触发入口，确认才执行。公开 Shared UI 无 Dialog 导出；未新增依赖或改 Framework。中文输入组合仅通过合成事件保护检查，真人 IME 未测。

候选 HTML SHA `2348b53038ce37fcbcce90e8839684c72e0325e3d1dee770b113d41829a8d705`；45 项定向离线交互、40 项相关模型检查和本工具构建通过，页面/控制台错误 0。1372 项来源锁无漂移，HTTP/文件一致，固定三件套经原 guard 核对后逐字节同步。[交付记录与截图](../../../artifacts/sidebar-preview-kit/scrapyjs-controls-20261101-evidence/README.md)；可用 `tests/run-preview.mjs --controls <URL> <证据目录>` 回放本轮切片（Playwright 使用既有本机环境）。前轮评分不外推，本轮 NOT_SCORED。

当前仅离线真实 React + 模拟 SDK；真实 AI、网站采集、Native、安装/升级和 production 未由本轮证明。旧 UNKNOWN 未处理/取消/重放，停止截图仅证明受理与等待原实例退出。复用原 43127/56346 服务；未晋升包、提交或推送。

## 历史离线 UI：配置库子视图与紧凑列管理（2026-11-01）

[打开完整预览](http://127.0.0.1:56346/official-scrapyjs-20261101-library-final/preview.html)。配置库成为工具内部子视图，可返回原采集界面；保留规则草稿、Chat、结果页码和滚动位置，继续复用原配置身份、CAS 与忙态保护。结果列以紧凑列表整理，支持鼠标拖动、键盘拾起/移动/确认/取消、按需改名、显隐和恢复默认。CSV / JSON 使用共用下载图标，下载始终包含全部原始字段与记录。

当前冻结 HTML SHA `826b3e2bc59404a17ca418952a74d742927aa6877406d2e976087575270c4b3d`；[交付记录](../../../artifacts/sidebar-preview-kit/scrapyjs-library-columns-20261101-evidence/README.md)记录同候选的 42 项交互、11 项状态检查、37 项模型测试、独立分维评审与固定三件套同步结果。旧候选和失败证据保留，下方旧“当前/最新”只属于其历史阶段。源文件仍由本工具持有，未修改 Framework 或新增依赖。

这是离线真实 React + 模拟 SDK；真实 AI、网站采集、Native、安装与 production 为 NOT_TESTED，旧 UNKNOWN 未处理或重放。持续迭代复用 [43127 Mock Vite](http://127.0.0.1:43127/preview/dev.html)，不写 Browser 的 `dist/development`；未晋升安装包、提交或推送。[设计决定](preview/DESIGN.md)与[操作说明](INTERACTIONS.zh-CN.md)以各自首节为准。

## 历史 v7：官方 React Aria 风格试点（2026-11-01）

本次在原真实 React UI 中选入公共 `od-theme-shadcn`：官网 aria-nova / Neutral 的主次按钮、柔和字段边界、焦点和字阶；系统字体与14px字段是明确的离线/侧栏适配。业务仍归本目录，复用公开 Input/Textarea、显式 Aria Button 与原 Dock/Frame/session；工作区页签保留原生键盘语义。规则、JSON、结果及完整 Chat 均保留，不修改采集算法或 AI 请求围栏。

[完整离线页面](../../../artifacts/sidebar-preview-kit/official-scrapyjs-20261101-reviewed-v7/preview.html)为当前v7候选：浅灰开始/应用/发送按钮、白底选中页签及中性消息气泡。“配置库”展示网站、字段数和当前标记，复用原模型支持切换、复制为新配置、重命名、编辑规则、导出JSON和删除；键盘切换后恢复焦点，草稿/确认/CAS不放宽。技术哈希和构建状态长段从可见页面移除，manifest保留来源与未测边界。[当前交付索引](../../../artifacts/sidebar-preview-kit/official-neutral-20261101-v7-evidence/README.md)维护本候选回放、独立评审和固定三件套同步状态；旧候选与失败评审保留，不沿用旧评分。

[设计与范围](preview/DESIGN.md#官方-react-aria-风格试点2026-11-01)；[模板、规范与提示词](../../../docs/api/sidebar-preview-kit.zh-CN.md#官方风格试点合同2026-11-01)。继续迭代复用 [Mock Vite](http://127.0.0.1:43127/preview/dev.html)，不写 Browser 的 `dist/development`。当前仅源码组件离线验证；真实 AI/网站/Native/安装/production/系统剪贴板保持 NOT_TESTED，UNKNOWN 未处理且不得重放。未晋升包、提交或推送。

## 核心按钮与定向初测（2026-11-01，本次）

已在真实 React UI + 模拟 SDK 中跑通「Host AI → 输入发送 → 差异/完整 JSON → 显式应用 → 命名保存」，不会自动采集。继续复用公开 Dock、Frame、session 和原 ai.info/generate/cancel；没有改 Browser Framework 或旧 scrapyJs/scrapyJsChrome。

本次修复：最后字段删除失败的原因在规则区可见；字段/分页/详情应用给出就近反馈；配置导出错误直接显示在 JSON 页；待发送资料预览补齐实际发送的 HTML 样本；再次开始的准备失败或派发前停止保留上次退休结果，准备期间 Stop 可用。配置 CRUD、取消/禁用、Chat 开合与草稿、无效 JSON、结果分页/列设置/详情、复制模拟回执及下载内容均有定向初测。

打开[最新同源预览](preview/preview.html)。[本次记录](evidence/buttons-core-20261101.json)绑定最终 HTML SHA `660485a4…`、构建身份、测试原件与未测边界；按钮清单见 [INTERACTIONS](INTERACTIONS.zh-CN.md)。源码版本仍为 App 1.8.0 / Task 0.6.0，本次未晋升、安装、提交或推送。

真实 Chrome、真实 AI、真实采集、系统剪贴板均为 **NOT_TESTED**；浏览器下载的模拟配置、提案、51 条结果 JSON/CSV 已读回核对。历史 UNKNOWN 未清除、未换 ID、未重放。下一优先事项是只读恢复原请求可信终态；具备合法发送条件后，才在真实安装态验证同一条 AI→保存→用户单独采集链。本次到核心功能和初测停止，后面的历史评分/完整验收要求不自动恢复，其他目标状态仍未知。

## 离线界面设计增量（2026-11-01）

本轮只完善共享 Chat 与 ScrapyJS 同源离线界面：可见标题/阶段、输入旁的发送条件、新提案定位审阅、变更优先与按需展开完整资料；审阅操作使用独立底栏，避免覆盖配置新值。真实 AI 未决请求、CSDN 验证码与已安装产品状态仍以下节核心结论为准，离线修改不表示这些问题已恢复。

打开 [本轮受评的冻结离线预览](../../../artifacts/scrapyjs/design-20261101/candidate4/preview.html)，设计决定见 [工具设计合同](preview/DESIGN.md)；本轮候选与截图/操作/来源记录见 [设计验证](evidence/ui-design-browser-20261101.json)。[独立设计子Agent复评](evidence/ui-design-review-20261101.json)八维为100 / 98 / 100 / 99 / 99 / 100 / 98 / 99，均>95，仅覆盖该冻结HTML。沿用 [原预览 Skill](../../../.agents/skills/opendesk-ui-preview/SKILL.md)、唯一宿主模板及公共 Dock / Frame / session；未晋升或安装正式工具包。

`preview/preview.html` 及其manifest/context在交付前已被并行任务更新，本轮来源guard阻止覆盖，保留其新输出；该位置不沿用上述冻结快照评分。本轮三个冻结文件均位于上方candidate4目录，当前工作区同源状态不作通过声明。

## 历史：本机采集 / 任务工作线与集成记录

以下为原工作线的历史记录，版本、环境和未测状态仅适用于其原候选。恢复合并后的组合源码没有重新构建或验证；保留的正式 JSON 为用户草稿 1.8.2，不代表当前组合源码的同源包。

**2026-10-31 Git 集成边界：** 合并源码配置为 App 1.8.0，保留本机试采与远端 HTTP/Task 0.6.0；本地原正式 App 1.7.4 JSON 逐字节保留，仍委托 Task 0.4.1。组合源码尚未重新编译、晋升或安装；下文两端证据只证明各自原候选，不相互提升。

## R1.7 当前状态与亲手测试（2026-10-30）

**2026-10-30 第二批 Git 集成说明：** 源码保留本机试采与共享 Chat，并合入固定 Task 0.4.1 的运行时身份修复；源码配置仍为 App 1.7.1。原已晋升 App 1.7.1 JSON 逐字节保留（仍委托 Task 0.4.0），没有降级为远端 1.6.4，也未手工拼接包内容。合并后源码尚未重新编译、晋升正式包或完成安装验收；下列版本与安装记录分别只证明各自原候选。

**“实现完成”不等于“普通用户全流程验通”。** 当前源码与唯一正式 App 包均为 **1.7.1**，真实安装最后核实为 **1.7.0**，固定 Controller Task 为 **0.4.0**。1.7.1 修复本地 AI 50 页需求被原浏览器 10 页校验拒绝的问题，原浏览器上限保留；定向检查与单包同源门禁通过，实际升级待执行。真实 Chrome 中的 **AI → 本机试采 → 明确确认长任务 → 重开侧栏 → Stop → 下载落盘** 仍为 `NOT_TESTED`。后文 1.3.1–1.6.0 的版本、安装和验收描述属于此前阶段，不能覆盖本节。当前实现、包身份和已有证据见 [R1.7 说明](R1.7-LOCAL-RUNNER.zh-CN.md) 与 [验证记录](evidence/r17-verification.json)。

**用户最新要求：由 Codex 先自行完成真实测试，全部关键条件成立后，才交付经过验证的使用方式。** 下方六步仅是待验证草稿，不要求用户代跑，也不以说明已保存或环境准备完成作为可用交付。宽度/主题/原生 200% 缩放、睡眠恢复、production 与正式评分继续延期。原浏览器采集入口和 Task 的三个 Origin 保留；本地 Fixture 不扩入原 Controller 授权。

### 当前目标与关键测试条件（唯一当前入口）

目标正文：**在真实安装态 OpenDesk 上自行跑通并保存同候选 ScrapyJS R1.7 核心全链证据，修复实际阻塞并针对性回归，全部关键条件成立后再向用户交付经过验证的使用方式。**

当前唯一 owner 为接续任务 `01a18c24-e6e0-7b82-8a3b-4d270f4d7537`，本任务 `get_goal=null` 后已创建完整八项条件 Goal，实际状态为 `active`。前 owner `01a18bd5-be11-7ff2-8d91-e73c88d4e3e8` 最后实读 `paused`，更旧源任务的 blocked Goal 保留，均未迁移或伪报完成。同 Profile 独立普通 Chrome 窗口已从正常工具栏进入侧栏并完成 ScrapyJS 1.7.0 原链首次安装，真实 ID、serve 连接与完整 ed52 revision 已核实；实际加载路径、旧配置升级与安装态 AI 全链尚未核实。Cookie owner 正诊断桌面输入，Scrapy 未抢焦点；Fixture、Python 与共享 watcher 已按真实 PID 核对并接手复用。全部八项成立前不得标记 complete 或声称“确保正常 / 可直接使用”。逐项状态与原始证据索引统一记录在 [验证记录的 currentCoreAcceptance](evidence/r17-verification.json)，不另建验收体系。

| 关键操作 | 必须取得的真实证据 | 当前状态 |
| --- | --- | --- |
| 真实入口、同 ID 更新 | 实际扩展身份/加载路径/serve 连接及构建、包指纹；同 ID App 更新后旧配置保留，使用当前真实 Host | IN_PROGRESS：1.7.0 原链首次安装及包 SHA 一致；真实 ID、连接和完整 ed52 revision 已从正常 tooltip 核实。加载路径及旧配置升级仍未核实 |
| 单一 AI 入口 | 安装态 React 经真实 ai.generate、原可信 Provider 与发送审阅返回有效声明式配置；保存实际接收方和请求身份 | NOT_TESTED |
| 三页试采与黄金 | 真实 Python 访问三页恰好六条，id/title/price 全字段与下表一致，F 价格为空串；完整度正确，错误与 worker 退出明确 | NOT_TESTED：已有 Python 集成黄金证据不等于安装态链通过 |
| 试采认证与 full | 试采前 full 不可启动；输入或配置变化使认证失效；明确确认的 full 精确绑定原 previewRunId/configHash/config/scope，不再次 AI 改写或静默重放 | NOT_TESTED：现有 Client/Host 证据仅复用其原验证等级 |
| 活跃任务重开 | full 活跃时真正关闭并重开侧栏，后台继续、恢复同 runId，不创建第二任务 | NOT_TESTED |
| Stop 原任务 | 至少采一页后 Stop，确认原 PID 退出、workerExited，且无后续采集请求；自然完成或停止受理不算通过 | NOT_TESTED_IN_CHROME |
| 下载落盘与读回 | CSV 和 JSONL 经真实 Chrome 保存到磁盘，独立全字段读回与同 run 一致；请求受理不算落盘 | NOT_TESTED |
| 受影响的安全保护 | 针对实际改动核对 Origin、安装身份、权限、撤权及未知回执不重放；保留原浏览器采集主链 | 未变的本地集成证据复用；真实安装及运行链 NOT_TESTED |

当前下一条操作是桌面输入交回后，打开已安装 App 的 AI 入口并经可信 Host 配对。正常「调试→本地开发服务」tooltip 已实际显示扩展 ID `ljclbnojkhhgdpoaaggiihlmidgcoihi` 与完整 revision `ed52e7aea28a2bfe5373a16b8f5024b89bb0ddb06b16d0b0824928eb9b3f5d55`，与共享 owner 的新磁盘回执一致；旧 1d 证据仅保留历史。唯一 watcher 为 PID 27680，仍写原 `dist/development`。Python PID 38045 已手动监听 43231，health 返回 1.7.0 / Scrapling 0.5；私有配对文件已生成但尚未交可信 Host，未创建真实采集 run。共享环境 owner 为 `01a18b96-4e45-7971-b993-28d6dde17f60`。实际加载路径未直接核实；扩展管理页与 Workspace 的既有安全拒绝继续有效，不使用 CLI、配置读取或 CDP 绕过。

### 开始前由 Codex 准备

复用现有根开发 watcher 与 `dist/development`，由其恢复 owner 确认产物就绪，再核对实际 Chrome 的加载路径、扩展 ID、开发连接和指纹。沿「扩展」原安装审阅入口更新同 ID 的 App，保留旧配置。Python 使用本工具已有私有 `.venv`，由 Codex 按 [启动合同](local-runner/README.md) 手动启动一次，并用已核实扩展 Origin 和精确 Fixture Origin 配对；不要求普通用户猜 ID、输入命令或处理源码包。

本轮已启动独立 Fixture `http://127.0.0.1:43233/page-1.html`（50 页，每页延迟 1 秒），真实 Chrome 已打开首页；前三页 HTTP 输入逐字段核对为下面六条。这只是**演示输入可用**，不是采集结果。进程归本接续任务管理，当前启动记录与输入检查在本机忽略目录 `artifacts/scrapyjs/r17-manual-demo/`。原 43234 网页为**纯模拟 UI**，不用于证明真实 AI 或采集。

当前真实安装已完成：原审阅显示 `scrapyjs` 1.7.0 与规范包 SHA-256 `cb0de984ebbab77dc63c2d48715011752c472e218bf2f91842683526c5c82b45`，安装成功提示已保存。安装前列表未见 ScrapyJS，本次不能宣称旧配置升级已通过。截图在 `artifacts/scrapyjs/r17-manual-demo/`；正常 tooltip 已核实 ID 和完整当前候选。**六步核心链尚未验通**：Python 已就绪，安装态 AI/Host 配对/采集/Stop/下载尚未执行。

### 六步操作草稿（待 Codex 自测，尚未验通）

1. **打开真实应用。** 在 Chrome 打开演示首页，再从 OpenDesk 侧栏「扩展」打开「scrapyjs 采集」。应看到已安装的 1.7.0，旧配置仍在；点「✧ AI 配置」后应进入「AI 采集工作台」，有「试采页数」和「AI 生成并试采」。不要使用「开发」的只读预览替代安装态。
2. **填写这次要采什么。** 目标 URL 填 `http://127.0.0.1:43233/page-1.html`，粘贴下方演示需求。勾选「目标网址与页面标题（必选）」；这次不需要发送旧配置，可取消「发送当前完整配置」。试采页数保留「3 页（默认）」。应看到实际 Provider、模型和接收地址；此时长任务按钮仍不可用。
3. **审阅后生成并试采。** 点「AI 生成并试采」，在原可信发送审阅中核对接收方与资料后确认。首次本机配对仍使用可信 Host 的文件选择器，由 Codex 协助选择为本次服务准备的文件；不要把凭证贴进应用或 AI。应依次看到真实 AI 返回、试采正在运行、采集完成，访问 3 页、6 条记录、worker 已确认退出；有错误时保留原输入和错误，先修正，不重复点击启动。
4. **逐字段核对，再启动。** 展开六条「完整 JSON」，对照下表；应只有 `id/title/price`，`id/title` 完整度 100%，`price` 为 5/6 非空，最后价格为空串，错误为 0。可先导出这次试采的 JSONL/CSV 留存黄金对照。点「核对试采，准备长任务」，勾选核对确认，再点「确认并开始长任务」。应出现新的长任务 run，配置/hash/目标及 previewRunId 仍绑定刚才的试采；这一步不需要再次让 AI 改写规则。不要先点「应用为配置草稿」或修改输入，它们会使当前试采认证失效。
5. **重开并停止同一次任务。** 趁仍在运行，立即关闭侧栏，再打开该应用的 AI 工作台；需要时点「查询原 run」。应恢复刚才的同一个长任务 runId，页数继续增长，不能新建第二任务。至少采完一页后点「Stop · 停止原 run」，等到「已停止」且「worker 已确认退出」，记录数不再增加。演示配置最多 50 页，若重开前已经自然完成，只记录自然完成，不能把它算作 Stop 通过；未知回执只查询原 run，不换 ID 自动重跑。
6. **下载并打开文件。** 点「导出 JSONL」和「导出 CSV」，完成 Chrome 的保存操作，再实际打开两个文件。应包含该 run 截至导出时的全部已采记录，字段和值相符，空价格仍为空；第 4 步导出的试采应恰好是下面六条。只有真的落盘、读回核对，才记下载通过；“已请求导出”不是落盘证明。

演示需求（可直接复制，无私人网页内容）：

```text
只采集 http://127.0.0.1:43233/page-1.html 及同源下一页的公开测试数据。
列表为 #books 的直接 li 子元素。每条只要三个字段：id 读取当前 li 的 data-id 属性；title 读取 h2 的文本；price 读取 .price 的文本，缺失时保留空字符串，不删记录。
下一页链接为 a.next，最多采集 50 页，以 id 去重。只用静态 CSS 声明式配置，不添加详情、processing、validation 或 fieldRequirements。
先试采 3 页，核对结果后再由我确认长任务。
```

| id | title | price |
| --- | --- | --- |
| A | 浏览器工具 | `19.50` |
| B | 本地任务 | `25.00` |
| C | 声明式采集 | `30.00` |
| D | 持久结果 | `0.00` |
| E | 精确分页 | `42.25` |
| F | 停止与恢复 | `""`（空字符串） |

这里的“核心 Demo 完成”要求六步在同一真实安装态实际走完，并保存同次 Provider/配置/preview/full 身份、重开/退出和下载读回证据。Fixture HTTP 检查、模拟 React 预览、包晋升或旧 Task 的 Chrome 通过记录各自保留范围，不代替这条链。

## 远端 HTTP / Task 0.6.0 工作线 · 原候选历史

以下保留远端原候选的实现与验收证据，不代表本机组合源码已重新打包或安装。

## 最近核验结论（2026-10-31）

**豆瓣的手工配置采集、结果查看、列整理和导出已实测可用；AI 修改配置到实际执行的完整流程，以及本次 CSDN 专栏采集仍未完成。整个 ScrapyJS 尚未完成，当前证据仅属于核心功能开发阶段。**

| 用户操作 | 当前结论 |
| --- | --- |
| 手工改规则、命名保存、重新打开 | 前序保存与重开已通过；最近续接确认已保存配置可选择、重开，没有再做新的命名保存 |
| 从已安装的 ScrapyJS 开始豆瓣采集 | 最近真实 Task 完成，返回 20 条、12 字段并释放资源 |
| 列改名、隐藏、恢复默认；完整记录查看与复制 | 最近实际操作通过；详情仅逐项核验第 1 条 |
| CSV / JSON 导出 | 实际下载的 240 个单元格逐值一致；隐藏列仍保留，显示名不改写原字段 |
| 本机 Node HTTP、UA/Header、Stop 与错误/撤权 | 前序原 Chrome 实证覆盖对应本机场景；续接未重跑，测试服务已停止、配对已撤销；公网未验证 |
| AI 修改→差异→应用→保存→执行 | 未完成；旧请求终态 UNKNOWN，无可用恢复句柄，本次续接零新请求 |
| CSDN 专栏采集及导出 | 未完成；固定目标页出现验证码，页面替换触发任务安全停止，无本次业务数据 |

**版本已收敛到 App 1.8.0 / scrapyjs.capture 0.6.0。** 正式文件摘要与最近原 Chrome 安装态核验对应，前序 1.7.0 / Task 0.4.1 的运行时失配不再是这组候选的当前阻塞。该次核心核验续接仅整理文档，未重跑产品或构建；本轮另有下节所列同源 UI 修改和离线预览验证，尚未晋升或安装。详见 [核心功能结论、验证范围与证据身份](docs/CORE-STATUS-20261031.zh-CN.md)。

实际使用入口：**扩展 → 已安装的 scrapyjs 采集**。源码 owner 为本目录；配置选择 `src/index.html`、`dist/tool.js/css`，React 入口 `src/main.jsx → App.jsx`，结果组件 `Results.jsx`，AI 组件 `AiPanel.jsx`。

源码迭代继续复用 **开发 → 本地项目 scrapyjs → 在侧栏调试**。最近观察目录连接离线、源码 Provider 为 `E_DEV_PROVIDER_UNAVAILABLE`；需要该入口时重查连接，不代表已安装工具不可用。原 Browser 使用仓库 `dist/development`，最近观察 serve connected；不重装扩展或启动第二个输出 writer。开发预览与安装态的数据、权限分开，预览空列表不代表已保存配置丢失。

后续先处理 AI 原请求的合法恢复阻塞；可信终态和发送条件具备后，再分别验证提案、差异、应用、命名保存、重开和单独 Task 执行。CSDN 仅在固定目标页合法可用后继续。production、完整验收/CI/矩阵、压力、宽度/缩放继续延期；用户本轮重新要求的离线 UI/UX 评分单独见下节，不恢复上述正式验收。

## 当前工具栏 Chat 交付（2026-10-31）

已从实际 Host 标题栏的卸载旁 AI 按钮开合底部 split；业务区独立滚动，Chat 草稿、消息、提案与业务编辑保持挂载。当前固定预览 SHA256 为 `9f313a12ef254dd025f2dfee050ed0b9459f3318f41d9d44211df88e0490a70b`。同 SHA 的 34 项 Chat 操作、62 项工作区操作及 17 张截图通过；18 项定向 Node 检查通过，1371 项来源锁无漂移。详见[本轮证据](evidence/ui-toolbar-chat-browser-20261031.json)。

公共完整组合示例位于仓库 `artifacts/scrapyjs/toolbar-chat-20261031/components-delivery/components.html`，已实际验证入口、聚焦、收起/重开草稿、Send/Stop 与 Escape。书签参照另验证右上配置及收起两个完整可点击按钮、设置面板与焦点返回；不是只看旧截图。当前证据仅为离线真实 React / 模拟 SDK；未重载已安装扩展，未连接真实 AI、处理原 UNKNOWN、提交推送或晋升安装包。[独立八维复评](evidence/ui-toolbar-chat-review-20261031.json)为 100 / 96 / 97 / 99 / 98 / 100 / 97 / 96，均 >95，无本轮阻断；语义类型诊断未执行，不构成合并或原生验收批准。

## 本轮离线交互预览（2026-10-31 纠偏）

离线入口为 [preview/preview.html](preview/preview.html)，来源与操作见 [preview/README.zh-CN.md](preview/README.zh-CN.md)，目标见 [preview/GOAL.zh-CN.md](preview/GOAL.zh-CN.md)。旧 ScrapyJS 的“内容区 AI 配置 + 嵌大 Frame”不是本轮完整 Chat 标准。

完整工具栏 Chat 组合是 **Host 公共入口 + workspace/business + SharedConversationDock + SharedConversationFrame/session**。工具通过 `OpenDeskTool.setConversationState({visible:boolean,open:boolean})` 声明展示状态，从 `OpenDeskTool.root` 接收 `opendesk:conversation-action`，其 `detail` 为 `{action:'toggle'}`，再受控更新 open。这些能力仅控制展示，不授予权限、不自动发送。`SharedConversationDock` 是纯展示组件，使用受控 `open/onClose`；消息、输入和会话继续使用原 Frame/session。Host 实际安装入口为 NOT_TESTED；本轮验证层级是工具源码与 preview 模拟。

实际参照为 `projects/bookmark-manager/preview/react`，它消费真实 App + TrustedWorkspace：HeaderSlot 中小字 AI 按钮紧挨卸载；展开后业务在上、Chat 在下，以细分隔条形成底部 split，支持拖动及键盘调整；收起回到按钮，重开保留草稿。此处只复用公开组合与交互，不导出 TrustedWorkspace/HeaderSlot，不跨 iframe DOM，也不复制书签业务。

Frame 示例只是消息/输入片段，不能作为完整工具栏 Chat 范例。公共 `components.html` 顶栏的小 AI 按钮也必须能够实际开合底部 Chat，不能只有内容区 Frame。业务节点、当前页签、编辑与 Chat 草稿、消息和提案保持挂载；收起不取消请求、不清除 busy/UNKNOWN 围栏、不自动重发。

已实际回放书签参照的入口、底部 split、配置/收起和草稿保留；当前工具源码与 preview 模拟证据见下方交付记录。历史 [风格来源评审](evidence/ui-style-source-review-20261031.json)、[间距评审](evidence/ui-spacing-review-20261031.json) 与更早评分仅属于各自旧候选，不能证明新入口或新组合通过。八维分别 >95 的用户要求保留，但先验证实际入口和参照前提，证据不足时 NOT_SCORED，不沿用 100/99 或强行给分。

保存/任务仅内存模拟、AI 固定提案、复制模拟回执及 SIMULATED- 下载继续如实标注。不开真实 AI、不处理或重放原 UNKNOWN，不安装、晋升包、构建 Browser、提交推送或恢复完整验收。

<details>
<summary>历史开发记录与证据（以下不是当前版本、运行状态或待执行授权）</summary>

> 以下保留各阶段原始说明，包括后来被替代的版本、阶段、权限及验收判断。与本页顶部冲突时，以顶部的明确版本和环境边界为准；历史“无 HTTP 入口”、恢复评分、固定 Task 版本等不能作为当前实施指令。

## 版本收敛阶段原记录（已由上方最近核验结论更新）

以下原文保留该阶段的版本失配、候选与服务观察，不作为当前安装状态或待执行授权。

## 当前版本与实际入口（2026-10-31）

**最新工作源码为 1.8.0，原 CFT149 已实际打开它的三个 Tab；唯一正式 App 包及该浏览器安装态为 1.7.0。安装态核心采集仍被固定 Task 的运行时身份拦截，尚未收敛为可直接采集的最新版。** 本节是本轮观察；下方折叠记录中的“当前 / 最新 / PASS”只属于各自日期、环境和候选。

| 对象 | 本轮实读状态 | 含义 |
| --- | --- | --- |
| 工作源码 `tool.config.json` | App **1.8.0** / Task **0.6.0**，并行 Node 转发开发中 | 不等于已晋升、安装或验收 |
| 原 CFT149 源码调试 | **1.8.0**，快照 `675002c85a52`；采集结果 / 采集规则 / 配置 JSON | 原本地项目入口已实际打开；只读隔离预览，不能运行真实 Task 或 AI |
| 唯一正式 App 文件 | **1.7.0**，SHA256 `5345de38fb2a30a6c28389228141c9983af993c61e7d02b955e41d6edb10bdc6` | [scrapyjs.opendesk-tool.json](scrapyjs.opendesk-tool.json)；固定要求 Task 0.5.0，不能与正在变化的 Task 0.6.0 文件当成已配对发行组合 |
| 原 CFT149 安装态 | App **1.7.0** / Task **0.4.1**；原“豆瓣核心”配置保留 | App 已经原安装审阅更新；点击开始采集仍在 `tasks.read` 准备阶段失败 |

源码开发入口只有一条：原浏览器工具栏 → OpenDesk → **开发 → 本地项目 scrapyjs → 在侧栏调试**。实际业务 owner 为本目录；配置使用 `src/index.html`、`dist/tool.js/css`，React 源码为 `src/main.jsx → App.jsx`，结果表格为 `Results.jsx`。AI 助手是同一 App 的另一视图，没有发现第二套生效业务源码。

安装态入口为 **扩展 → scrapyjs 采集**。它与源码调试区的数据和权限分开；预览空列表不表示安装配置丢失。原浏览器仍为 CFT **149.0.7827.55**、扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`、仓库 `dist/development`；没有切换 Profile 或扩展目录。

### 已完成与尚未完成

- **可见更新已实测于 1.7.0：**同一原侧栏自动显示临时标题“采集配置 · 1.7.0 自动更新验证”，逐字节还原后自动恢复，快照回到正式包 SHA。该证据不冒充 1.8.0 的新一轮改动验证。
- **App 更新已完成：**原安装器核对同 ID 1.6.4 → 1.7.0、权限未变化后确认更新，原“豆瓣核心”配置和完整 JSON 保留。
- **固定任务阻塞已定位：**原目录只有 0.4.1 已安装；0.5.0 已导入为待验证候选。原开发入口导入 SHA `bfc42784e7c5cca8437151d136442ae6c8c22c31461f369a8a9224174a433475` 的同源码草稿，在豆瓣完成并显示“资源已释放”，返回实际书目数据。随后核对候选时返回 `E_BUILTIN_VERSION_UNAVAILABLE`：候选绑定的内置运行时已改变，需要新版本重新验证。没有伪造回执、覆盖固定版本或放宽校验。
- **安装态采集未通过：**尚无本轮安装态结果表格、runId/resultId 与下载读回成功证据。直接草稿运行、热更新和历史 20 条记录均不替代这一项。
- **HTTP 不是完全没有入口：**[1.7.0 / 0.5.0 本机 HTTP 证据](evidence/http-local-20261031.json)已覆盖独立静态 CFT155 的对应范围；不能用于证明原 CFT149、公网或当前 1.8.0 Node 出口。1.8.0 / 0.6.0 与新增 `network.localRelay` 仍由并行任务开发验证，本轮不替它晋升、安装或批准新能力。
- **真实 AI 仍受 unknown 围栏约束：**请求 `cb6d0e92-0e45-4ae0-a30c-96377d535106` 没有可信 sessionId/turnId/终态。本轮新推理为零，未清 pending、取消或重放；界面消失不证明结束。

下一条采集操作是：待当前 App/Task 候选完成并固定后，在原 Browser 运行同一 Task 源码，核对当前运行时及持久页面回执，沿原审阅链更新精确配对，再从已保存的“豆瓣核心”开始采集并核对结果表格。共享 Browser 更新会使旧候选验证失效，不能靠保存配置修复。

### 服务、清理与证据

复用现有 App 编译 watcher、快照 watcher 和根 Browser watcher；不启动第二个输出 writer。目录 CLI 曾按原实例恢复并成功打开 1.8.0 预览，随后报 `E_NATIVE_NOT_READY` 退出；最终目录连接已中断。需要源码预览时仍使用下面的原命令；已有连接时不重复启动：

```sh
OPENDESK_NATIVE_INSTANCE=scrapyjs-react-01a186cc /Applications/OpenDesk.app/Contents/MacOS/opendesk browser dev /Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/scrapyjs
```

`E_PROJECT_SCHEMA` / 文件工作区可用是该 Sidebar 项目没有 Controller Provider 的已知提示；从已配对浏览器走上述入口。Browser 使用持续开发目录，服务连接曾实读 CONNECTED；本轮验证中共享输出曾短暂缺少 manifest/入口，随后恢复，多次预览/目录文档被关闭。没有主动重载、覆盖输出或停止其他 owner 的服务，最终连接状态须在原“调试 → 本地开发服务”重新读取。

已清理误导性的顶层“最新 1.6.4”和“HTTP 完全无入口”结论，将原文保留为折叠历史。本轮临时标题快照 `2417f0bafe88` 已校验解码后的各块及完整包 SHA，并从预览目录可恢复地移至 `artifacts/scrapyjs/version-convergence-20261031/temporary-title-snapshot/`；`latest.json`、正式包、配置、其他快照和并行源码未删除或覆盖。前序隔离的旧 16 KB 分块缓存仍保留原恢复材料。

完整本轮记录见 [现有证据索引](evidence/ai-ux-continuation-20261030.json) 的 `versionConvergence20261031`。本轮未提交或推送。production、完整 CI/宿主矩阵、宽度/缩放、压力、独立评分与真实 AI 主链均未纳入本轮完成条件。

## 1.6.4 源码启动与可见更新（历史，2026-10-31）

已恢复原 CFT149 的「开发 → 本地项目 → 在侧栏调试」：当前源码 **1.6.4**、快照 `42fdb94d7779`，实际显示「采集结果 / 采集规则 / 配置 JSON」。本次启动前目录连接离线，应用编译及快照 watcher 均未运行；另有旧 16 KB Native 分块与当前 24 KB 发布规则共用包哈希目录的缓存冲突。旧缓存已验证完整并保留在本机 artifacts，再由原 watcher 重建；正式包和平台源码未改。

**可见更新已实测：**临时将源码标题改为「采集配置 · 热更新验证」，同一侧栏自动显示；逐字节还原后自动恢复，快照回到 `42fdb94d7779`。没有重新安装应用。当前留在隔离源码预览，编译、快照和原目录 CLI 保持运行；已安装包不会自动被该预览替换。此前 Task 运行时拒绝与原 AI unknown 均未因此解决。详见 [启动记录](evidence/ai-ux-continuation-20261030.json) 的 `liveSourceStartup20261031`。

## 原 CFT149 界面复查（2026-10-30 23:46）

原实例实际安装界面为 **App 1.6.4**，包含「采集结果 / 采集规则 / 配置 JSON」三个 Tab；AI 助手是同一应用内切换的独立视图。当前 `src/main.jsx → App.jsx` 是配置指定的 React 入口，结果组件保留表格；源码与构建回执匹配，唯一正式包通过 `--check-project` 同源核对。本次未发现两套业务 UI 同时生效，未修改源码或重新安装。已将界面留在多 Tab 工作区。

**本次原 CFT149 的采集操作失败，不能以历史成功代替：**已安装 Task 为 **0.4.1**，固定源码与 manifest 哈希匹配；选择「豆瓣核心」并在同源网页点击「开始采集」，提示「固定采集任务与当前运行时不匹配」，仍为「等待引擎 / 尚无运行 / 尚无结果」。错误对应 adapter 在 `tasks.read` 准备阶段的运行时校验拒绝；失配来源尚未核实，没有放宽校验或重试。当前运行生成表格及下载均 **NOT_TESTED**。下文 CFT155 与此前 CFT149 的成功证据保留各自环境和时间边界。

共享 Chat 的中文多行草稿、返回工作区后重开保留及清空通过；这使用粘贴，不证明原生 IME。原 AI 请求仍缺少可信终态，未发送新推理、调用取消或清除 pending。Browser 实际加载 `dist/development`，调试页显示开发服务已连接（revision `ab031e1cf824`）；本次未重启、重载或覆盖现有服务。详见 [本次复查证据](evidence/ai-ux-continuation-20261030.json) 的 `installedUiRecheck20261030`。

## Header 修改、删除与真实触发链（历史，2026-10-30）

普通 Header 的**本地 Chromium 传输分支**已补齐可点击诊断：`Accept` / `X-Client-Tag` 从 A 改 B、删除后，配置快照、原 NetworkService 提交的 Fetch 参数、CDP 观察和服务器 `rawHeaders` 逐次对应。删除后 `X-Client-Tag` 不存在，`Accept` 为浏览器默认 `*/*`。19 个诊断场景共 17 次实际请求；运行中编辑不改变原三页配置，Stop/超时只请求首个流式页面，服务器观察提前关闭，12 组 UA/敏感/无效配置零请求。这里的 runId 是诊断关联号，**不是安装态 Host runId**。

当前产品真实入口仍是「扩展 → scrapyjs → 开始采集」→ `tasks.read/start` → 固定 DOM Task。App 和 Task 都不接受 Header/UA 配置；公开 `OpenDeskSDK.browser.network.request` 已存在，但尚未形成 ScrapyJS 的安装态 HTTP 授权、执行和结果闭环。**安装态 Header 运行仍 BLOCKED，Browser UA override 仍 UNSUPPORTED**；本轮未改引擎、包、权限或产品 UI，也未用 Desktop/Node/CDP 覆写代替产品能力。

本次静态 development 快照无 serve 连接，日常 Browser 与原 AI unknown Profile 未动。复现命令、实际调用、分层状态、服务端样本与最小公共能力缺口见 [HTTP 边界增量](docs/HTTP-ADAPTER-BOUNDARY-R2.4.1.zh-CN.md#header-修改删除与触发链2026-10-30增量) 和 [关联证据](evidence/http-header-transitions-20261030.json)。历史豆瓣/CSDN DOM 采集结果不用于证明 Header 能力。

## 原站点示例复查（历史，2026-10-30）

优先复用旧 `scrapyJsChrome/examples/douban-books`、`examples/csdn` 已迁入的 `examples/original-sites.js`，未另造规则或扩大固定 Task 的站点范围。真实 Mac CFT155 的原安装态 App **1.6.4** / Task **0.4.1** 完成豆瓣读书当前页采集：**20 条、11 字段**，与同页独立 DOM 预期逐值一致，表格及实际 JSON/CSV 下载读回通过；原运行 `completed/released`。条数与内容是本次观察，不能固定为以后线上断言。

CSDN 原示例地址本次返回 **HTTP 521 / 安全验证页**，没有列表，记为 `BLOCKED_SITE_VERIFICATION`；只访问一次，未操作验证码或重试。此前 CSDN 9 条、7 字段及本地样本证据保留为历史，不代表本次线上通过。只读检索旧 Chrome/core 示例尚未找到豆瓣电影的独立采集配置，未将读书页面的电影导航当作示例。

本轮修正测试驱动的过时表格断言（字段名、类型提示、操作列及空值显示），没有修改 App、采集引擎或正式包。前两次驱动失败原件保留，后续完整链已通过。结果和导出文件摘要见 [原站点证据索引](evidence/original-sites-20261030.json)。本次环境为隔离的静态 development 快照，无 serve 连接；只证明安装态 DOM 当前页流程，**公网受控 HTTP 仍 BLOCKED**，不证明 Header 覆盖、反爬解决、真实 AI 或 production 验收。各次自有测试浏览器均已关闭，日常开发实例未改动。

## HTTP Header 实证增量（历史，2026-10-30）

真实 Mac CFT155 + 原 NetworkService 在独立本地回显 fixture 完成三页 HTTP 提取：`Accept`、`X-Client-Tag` 的配置、Fetch 参数、服务器观察一致，三条数据与独立预期相同；流式请求取消后服务器观察到连接提前关闭。结果文件独立读回 SHA 一致，仅证明 fixture 文件，不是 Host 持久运行回执。

修复前实证 `User-Agent` 参数被接受但被 Chromium 替换；现已在唯一公共校验处发请求前拒绝，Node SDK/Host 与 Chromium 源码传输验证通过。原 App 仍只有 DOM 采集入口，App **1.6.4** / Task **0.4.1** 未变；**公网 HTTP 仍 BLOCKED，未解决站点反爬**。没有正式 HTTP Grant、全 DNS/实际 peer 安全证明或 HTTP 运行身份读回，暂不集成假运行按钮。

复现命令、三层 Header 证据、Desktop 复用结论及未验证项见 [HTTP 边界的当前增量](docs/HTTP-ADAPTER-BOUNDARY-R2.4.1.zh-CN.md#header-真实请求增量2026-10-30) 和 [证据索引](evidence/http-header-proof-20261030.json)。这次不重复旧 200 项内核/DOM 验收，不重建 Browser 或晋升工具包。

## R2.4.2 本机验明（历史，2026-10-30）

HTTP 内核四类缺陷已差量修复，定向 21/21、ScrapyJS App CI Node 200/200 通过。实际 Mac CFT155 已验证原安装链、命名保存重开、DOM 三行独立预期、表格、JSON/CSV 下载读回、重复 Run、运行中 Stop 退休、草稿退出确认及停用/恢复。Chrome HTML/JSON 解析独立验证通过。各项只证明对应范围；**公网 HTTP 仍 BLOCKED**，没有真实 Header、DNS 全地址及 peer IP 证明，不显示可运行入口。

当前唯一包仍为 App **1.6.4**、固定 Task **0.4.1**；其他对话已在 `b7ffa0397` 修复旧包失配，本轮核对同源并复用，没有重复晋升或改权限。完整缺陷、命令、原始失败的分类、证据链及独立八维评分见 [R2.4.2 本机验收报告](docs/LOCAL-ACCEPTANCE-R2.4.2.zh-CN.md) 和 [证据索引](evidence/local-acceptance-r242-20261030.json)。本次为隔离的静态 development 快照，无 serve 连接，不代表日常 Chrome、production 或 Desktop 验收；原 AI unknown 请求未重放，R2.5 尚未启动。

## 中长期产品规划（2026-10-30）

以下文件保存本轮 AI 爬虫、代理与商业化讨论中的**长期目标与设计决策**。它们均为 **PLANNED / NOT_IMPLEMENTED**，不改变上方真实采集、安装态及候选验收状态：

- [跨端统一执行架构与网页版四阶段交接](docs/UNIFIED-EXECUTION-ARCHITECTURE.zh-CN.md)：Browser / Desktop / Android 分工、Headers 能力、唯一合同、去重和验收边界；跨端可信 HTTP 与正式 UI 集成未实施，已有 v1 合同及静态业务内核的当前状态以上方 R2.4.2 为准。
- [产品目标与分阶段路线图](docs/PRODUCT-ROADMAP.zh-CN.md)：当前基础、差距、P0/P1/P2、1–3 页 AI 试采及后续验收。
- [AI 引擎、代理与云运行技术架构](docs/AI-ENGINE-PROXY-ARCHITECTURE.zh-CN.md)：Scrapling、Crawl4AI、Apify 等执行适配与安全边界。
- [商业模式、竞品与上下游服务](docs/COMMERCIALIZATION-COMPETITORS.zh-CN.md)：模板复用、定制开发、维护、代理与收费路径。
- [自有私有双网络 PoC 与真实设备测试步骤](nodes/poc/README.zh-CN.md)：隔离源码已提交；安卓编译与真实网络均 NOT_TESTED。
- [自有手机/电脑网络与社区协作节点](docs/COMMUNITY-NODES-MOBILE-EGRESS.zh-CN.md)：Wi-Fi 控制 + 蜂窝采集出口、远程主动领取任务及未来自愿共享；**仅设计，不是已启用代理服务**。

**当前不创建新 Runtime、云服务、付费功能或扩展权限；后续按最新 main 实际完成状态增量实施。**


## 采集运行时身份修复（历史，2026-10-30）

远端修复时的安装态与唯一可安装包为 **App 1.6.4 + Task 0.4.1**。旧 Task 0.4.0 的内置运行时身份与当前 Browser 不匹配，导致「开始采集」在任务准备阶段被拒绝；保存采集配置不会更新固定 Task 的验证记录。

沿原开发入口运行相同源码后，在原任务目录核对持久运行及页面回执，设为本地可用并安装 0.4.1，再经原扩展安装器更新同 ID App。Task sourceHash 仍为 `94313223c8fd3ea37d5cc89d0027c6e7446fc60f4393310aab04dc588db2b08e`，三个 origin、`page.automation` 与 App 权限均未变化；没有修改引擎或放宽运行时身份校验。

原 CFT149 侧栏选择已保存的「豆瓣核心」并点击「开始采集」，实际返回 **20 条、11 字段**，宿主与引擎均 `completed`，原实例 `released`，配置仍显示已保存。错误提示现在明确要求更新 App 与固定 Task，保留配置，并在准备失败时清除旧任务句柄，禁止用旧身份启动。模型/适配器 20 项、配置 11 项及候选包绑定检查通过；唯一正式 JSON 已通过原打包器显式晋升并与当前源码核对。详见 [修复证据](evidence/runtime-identity-repair-20261030.json)。

这次证据只覆盖当前开发 Browser 中的采集修复；没有重建、重载或更换 Browser，也没有发送新的 AI 请求。原 AI 请求的 unknown 状态及此前限制继续保留；AI 主链、production、独立评分、全量生命周期及其他站点复验均未执行。本次包同步不构成这些项目的正式验收。

## 此前 AI 界面对齐范围（2026-10-30，历史）

2026-10-30 Git 集成已将下述共享 Chat、未决 AI 身份恢复与字段差异审阅合入上方 R1.7 本机试采流程。合并后源码尚未重新编译、晋升正式包或完成真实安装验收；原 1.7.1 包与以下各阶段证据继续绑定各自原候选，不能作为合并后源码的同源或原生验收结果。

本节记录此前**独立应用开发、共享 Chat 复用、安装态界面对齐与最小验证**阶段。当时源码、实时调试快照及安装态已对齐为 1.6.3（SHA256 `a9064a9dbfdd2719446286c3812093c27463c5f4d94c157e3eb545e06d0c1b1d`）；当时唯一正式包仍保留 1.3.1，未晋升。该次经原安装审阅链更新同一个应用，未提交、推送，也没有修改 Go。

安装态对齐复查（2026-10-30）：从原 CFT 的「扩展 → 已安装 → scrapyjs 采集」确认旧实例为 1.6.2（SHA256 `56c5a05d6f884771148b3bb0fa41f56b89f7d5e7a8b4b134e09fd1ad2283eea7`），显示旧 AI 表单；本地源码预览已是共享 Chat。用原打包器生成与不可变调试快照逐字节相同的临时候选，原安装器核对“权限未变化”、固定 Task 0.4.0 与包 SHA 后更新到 1.6.3。重新从同一列表打开，实际显示共享对话区、输入框及正确样式；临时中文草稿可编辑并已清空，未发送。原「CSDN 核心」命名配置、7 个字段、列表选择器及完整 JSON 仍在。返回原 CSDN 标签页并刷新目标后显示“准备采集”，未启动任务。采集结果区当前“尚无记录 / 尚无运行”，没有新的有数据表格原生证据，不据此判定历史表格丢失或损坏。此次没有修改业务源码、重编/重装 Browser、升级固定 Task 或晋升正式包。

AI 配置助手现复用书签管理器同一 `SharedConversationFrame` 与 `createConversationSession`，通过固定 opt-in `@opendesk/ui` 在本工具 opaque iframe 内运行。共享部分仅包含展示、输入和内存会话；真实推理仍经既有 `ai.info/generate/cancel`、共享 Provider 与安装 Authority。没有复制第二套 Chat、Provider 或宿主，也没有将采集业务挂入可信 React 根。公开边界见 [Sidebar Tool AI API](../../../docs/api/sidebar-tools-ai.zh-CN.md)。

用户流程为：描述需求 → 明确选择发送资料 → 生成独立提案 → 查看全部差异与完整 JSON → 明确应用 → 命名保存独立配置 → 单独「开始采集」。已有配置应用 AI 提案后默认进入“副本”命名表单，原记录保持不变；没有自动保存或运行。确定性组件验证覆盖保留完整原规则、仅新增与 `title` 同选择器及提取语义的 `column_title`、输入变化使旧提案失效、独立保存及运行分离。**该验证使用传输 fixture，不是真实模型成功证据。**

真实 CFT149（149.0.7827.55、原 Default Profile、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`）已通过「开发 → 本地项目 → scrapyjs → 在侧栏调试」打开当前源码。可逆 JSX 标题与 CSS 标记的自动更新、还原已实测；最新共享 Chat 显示、中文草稿输入、关闭重开保留及清空也已实测。最近快照 SHA256 `a9064a9dbfdd2719446286c3812093c27463c5f4d94c157e3eb545e06d0c1b1d`，仍标记“实时开发预览 / 未安装 / 隔离测试数据”。只读预览拒绝真实 AI、Task 与真实写入，发送按钮保持禁用；本轮没有放宽该限制。

Native 已由前序 owner 恢复，当前真实工作区显示“Native 已连接”。Browser 仍加载固定 `dist/development`；根 `npm run dev` 由并行 owner 维护，曾重启并短暂缺少工作区/沙箱文件，随后已恢复。当前应用编译监听、stage 监听与同实例目录 CLI 可用；此前未单独核实的根 WXT 客户端连接，已在原 CFT「调试 → 本地开发服务」读到“开发服务已连接”（revision `31e5d8260b078983a525d43f133b96e03a56082e4cd774b898eddc8213296b7f`）；这是当次实际连接观察，不保证后续服务状态。辅助 Mock 的 named exports 已同步；其旧 Shared UI 来源回执已过期，本轮未重建或启动该辅助预览。

原 AI 请求 `cb6d0e92-0e45-4ae0-a30c-96377d535106` 仍为 **unknown**，没有可信 sessionId、turnId 或终态证据。本轮未重新派发、未重放、未应用迟到结果，也未借新窗口、Provider、安装或重载绕过围栏。下一条真实推理须先按原身份取得可信处置结果；当前真实 Provider 推理、AI 提案原生应用/保存及后续 Task 采集仍为 **NOT_TESTED**。界面未显示旧请求不证明旧请求已经结束。

固定 `scrapyjs.capture` Task 0.4.0 保持不变：sourceHash `94313223c8fd3ea37d5cc89d0027c6e7446fc60f4393310aab04dc588db2b08e`，manifestHash `b0a7b212f244e16de772e54724f1e039a3c7d2d238b9443031a6f37a61af0e95`。没有重冻、重装、扩大三个 origin 或改动引擎。历史 Task 采集、结果排版与下载证据继续保留，不能替代本次 AI 主链。

本轮 31 项工具定向检查通过；共享 UI 3 项通过、1 项因缺少现成编译示例回执跳过，未为该跳过启动构建。公开运行时检查确认没有导出可信 Workspace、Provider 或凭据模块。原共享 Chat 检查源码指纹仍一致，复用已有 31 项工具与共享 UI 检查；本次临时候选包定向检查 1/1 通过。完整记录见 [接续证据](evidence/ai-ux-continuation-20261030.json) 的 `sharedChatDevelopmentContinuation`（此前阶段）及 `visibleUiConsistencyContinuation`（当前安装态对齐）。独立专家 95+、正式晋升/production、完整生命周期、全量宿主与压力专项继续延期，评分保持 **NOT_SCORED**；下文旧阶段的 95+ 要求不作为当前开发前置条件。

## 此前 1.5.0 核心采集证据（历史）

此前阶段为 **真实扩展持续开发与线上核心采集验证**。当时源码版本 1.5.0，唯一正式 App 包仍为 1.3.1；不因源码版本号认为已晋升或安装。此前 1.4.0 原生证据作为历史保留。完整原浏览器 SDK 保持原样；来源 `scrapyJs` / `scrapyJsChrome` 仓库只读。

## 当时目标与关键测试条件（历史，2026-10-29）

**核心目标：用户能在真实 OpenDesk 侧栏中编辑并保存采集配置，完成豆瓣及可访问的 CSDN 当前页采集，查看正确表格，下载完整结果，并安全停止运行。** 当前 React 源码的可见更新、配置持久化和草稿保护一并取得真实操作证据。

当前接续对话 `01a1880c-2137-7d53-974f-2d85d04090af` 已取得下列七项核心条件的真实证据，开发核心目标已达成。此前对话 `01a186cc-38d5-7592-a41c-089eb98f2d9e` 的 Goal 上次实读仍为 `blocked`，其状态没有被跨对话改写；当时的脚本权限阻塞已在接续对话经用户当次明确授权解除。OpenDesk 启动、Native 连接、目录接入和浏览器控制仍只属于前置子任务。

用户入口固定为工具栏打开 Side Panel →「开发 → 本地项目 → scrapyjs → 在侧栏调试」；不直接导航扩展 URL。开发快照与安装态候选分别记录身份及权限，不以 Mock、历史报告、静态快照或编译成功代替真实操作。

| 关键操作 | 通过条件 | 尚缺的证据 |
| --- | --- | --- |
| 进入真实侧栏与开发更新 | 显示当前源码；核对扩展路径/ID、服务连接和应用快照；可逆 JSX/CSS 修改及还原均在侧栏可见 | PASS：真实本地侧栏显示，JSX/CSS 同会话自动更新及逐字节还原 |
| 配置与编辑 | 命名配置保存后关闭重开仍在；字段修改应用正确且无关规则保留；开发数据不写正式命名空间 | PASS：安装态保存、重开、字段保留；本地调试记录与安装区隔离 |
| 草稿保护 | 无效 JSON、未应用字段/分页草稿跨页签保留；取消切换仍保留原选择及草稿；保存/运行不会悄悄采用旧值 | 安装态 1.5.0 真实侧栏操作 PASS |
| 同源码 App 与固定 Task | 原安装审阅；Task 同源码成功试运行、核对证据后设为本地可用并安装 | PASS：App 1.5.0；Task 0.3.0 同源码 demo completed/资源释放，走原核对→本地可用→安装链 |
| 豆瓣与 CSDN 主链 | `originalSites[2]` / `[3]` 当前页；独立页面内容与记录及表格相符；原运行完成并退休 | PASS：豆瓣 20 条、11 字段，CSDN 9 条、7 字段；两次均 completed/released；条数为本次观察 |
| 下载 | CSV 与完整 JSON 实际落盘并读回，逐值对应同一次结果；不截断、不以下载请求受理代替落盘 | PASS：两站 JSON/CSV 均在 Downloads 落盘；全部记录与字段逐值相符，已保留原件摘要 |
| 运行与 Stop | 运行期间不能改写配置，结果属于启动配置；Stop 作用原请求，区分受理和退休；未知回执禁止重复开始 | PASS：运行控件锁定；切配置清旧结果；原请求 Stop 受理，原 runId/resultId stopped/released |

完成判断以本表的真实用户行为为准。每项记录 `PASS / FAIL / BLOCKED / NOT_TESTED` 及对应源码、快照或候选身份；站点访问限制单独记载，不能填成采集通过。复用仍有效的历史证据，只补当前 React 界面及本次实际受影响行为的验证。连接恢复、测试数量或候选构建成功不替代这些条件。

本地调试的存储/网页读取可直接验证；Task 和下载继续使用原安装审阅链批准的同源码开发候选及固定 Task 0.3.0。该权限边界不因侧栏入口改变。此前核心完成后曾延期 95+；本轮用户已恢复真实 AI 与独立 95+ 评审。正式包晋升、production、完整生命周期、全量 SDK/宿主及宽度/缩放矩阵继续延期。

2026-10-29 已建立上述执行目标，源码与候选未变化，复用已有 6 项定向检查。原先被拒绝的是接管扩展 Workspace 标签页；该拒绝及禁止绕过仍保留。通过原生工具栏已打开 Side Panel；日常 Chrome Native 正常但原生状态读取超时；CFT 149 最初 Native 离线，后续已按用户明确授权恢复独立连接（见下段）。

后续通过 CFT 的 `chrome://version` 核对真实 Profile 为 `~/Library/Application Support/Google/Chrome for Testing/Default`；其用户数据目录没有 `NativeMessagingHosts/com.shopable.opendesk_browser.agent.json`，而日常 Chrome 对应注册存在。CFT 原设置已启用，重新检测仍离线。独立实例 `scrapyjs-react-01a186cc` 最初未安装。用户回复“允许独立注册并继续本地调试”后，已用官方 CLI 完成该 CFT 的独立注册；真实设置页及该实例 doctor 均确认在线，扩展 ID 一致。日常 Chrome 注册文件 SHA-256 保持不变；应用编译、stage、根开发监听和原目录 CLI 均保留。CFT 使用同实例环境变量的独立目录 CLI，文件工作区已可用；Controller Provider 的 `E_PROJECT_SCHEMA` 不影响 Sidebar App 预览。

此前安装与权限观察：通过 CFT 的原安装审阅链安装同源码 React 候选 1.5.0，实际进入采集 App。配置 A 保存后销毁、重开恢复；新增 label 字段后 title 与列表规则保留。字段、坏 JSON、分页草稿跨页签和取消配置切换均保留，未应用时保存/运行禁用。这些配置与草稿证据属于安装态；本地开发更新及存储隔离已另行验证如下。当时固定 Task 0.3.0 仅导入为待验证候选；同源码试运行 `945f880d-d5c3-4a9e-8835-949eee336e9f` 返回 `E_USER_SCRIPTS_UNAVAILABLE` 并释放资源，未自动重放。后续成功链见下段，历史失败及原始身份保留在 `evidence/extension-dev-20261029.json`。

通过原「开发 → 本地项目 → scrapyjs → 在侧栏调试」已显示当前 React 1.5.0。JSX 标题和 CSS 伪元素标记均在同一会话自动出现；还原后原界面自动恢复，源码、构建回执及快照重新匹配原始 `055e93055b66`。初次预览曾中断，通过原入口重开后完成自动更新与还原，未修改框架。隔离调试区最初没有安装区记录，新保存的「本地隔离验证」在预览重开及快照替换后仍在；正式安装区仍仅有 A、B、「豆瓣核心」，没有混入调试记录。当前根开发服务实际连接，revision `35192800cdbe`。固定 Task 的 Chrome 用户脚本授权仍未回复；线上采集、下载、Stop 不报通过。随后复核 Chrome 用户脚本开关仍关闭、该授权仍未答复；同一阻塞满足连续三轮审计后，原生 Goal 已更新为 blocked，未完成项全部保留。

交接复查（2026-10-29 22:20，Asia/Shanghai）：CFT 独立实例 doctor 仍在线，当前 JSX/CSS、构建回执及候选摘要与已验证版本一致。此前根开发、应用编译、stage、Mock 监听及目录 CLI 已不在进程列表，43119/43120/43127 无监听；上述“仍在运行”是此前观察。OpenDesk、日常 Chrome/CFT 两个实例及标准 demo 服务仍在。接收方先只读核对，只在后续源码迭代或目录预览确需时补启缺少的服务，不因监听停止重做已有通过操作。原 Goal 实读仍为 blocked，创建新对话不改变其生命周期。

接续核心结果（2026-10-29）：仍使用 CFT 149、同一扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、仓库 `dist/development` 和独立 Native 实例 `scrapyjs-react-01a186cc`，没有切换加载目录或重建产物。用户明确允许开启 Chrome 用户脚本后，原开发入口主动发起固定源码 demo 运行 `63b452f5-b7f5-44fe-9487-dbe006334b9d`，完成并释放资源；在原任务目录核对本机持久运行和页面回执，再设为本地可用、安装 Task 0.3.0。

安装态 React App 的豆瓣运行 `1e4c5df5-d8ae-45dc-9746-31dd75627570` 和 CSDN 运行 `2320b540-dd4f-4d43-aa68-87a3bd4a53ab` 均 `completed/released`。独立读取同一 CFT 页面原生 AX 中的当前内容，与表格全部非空单元格及下载记录对照；CSV 全字段与同次完整 JSON 相符。AX 不暴露空单元格，因此空值由 JSON/CSV 读回验证，不能冒称执行过网页 JS 属性探针。CSDN 起初显示滑块，用户授权后再次观察已正常显示内容；未操作验证码、未刷新挑战，不推断访问恢复原因。

另存「原实例 Stop 验证」配置，在同一固定 Task 等待不存在的选择器期间核对配置/字段/完整 JSON/目标及开始按钮锁定，再点击原 Stop。`3e5b6ebd-6491-4609-bf20-08a163d8e00c` 保持原请求和结果身份，回执为 `stopped/released`，编辑解锁。切换配置清除上一份结果及导出入口。完整索引见 [本轮证据](evidence/extension-dev-20261029.json) 的 `coreContinuation01a1880c`；下载原件和读回报告保存在本机 `artifacts/scrapyjs/react-core-20261029-01a1880c/`。本轮仅更新说明与证据，产品源码和正式包未变。

## 真实扩展的持续开发入口

先检查并复用已运行的监听，不重复启动。Browser 自身复用根仓库 `npm run dev`，Chrome 加载 `dist/development`，并在「调试 → 本地开发服务」核对连接。应用有另外两个环节：

```sh
# 应用 JSX/CSS 编译监听；只写本应用 dist。
npm run dev --prefix examples/sidebar-tools/scrapyjs
# 完整编译回执通过后，发布供 Native 读取的不可变快照。
node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/scrapyjs
# 首次目录接入；已经连接时继续用原 Workspace。
opendesk browser dev /Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/scrapyjs
```

在真正 Chrome 的「开发 → 本地项目」选 scrapyjs，再点击「在侧栏调试」。Vite 编译、stage 发布与 Browser 开发连接分别核验；应用更新通过原 Native 会话替换沙箱实例，不是网页 Vite HMR，也不承诺保留 React 内存状态。修改 JSX/CSS 后必须在真实侧栏看到变化及还原，才算扩展开发更新证据。

当前本地调试只提供隔离 session 存储及 `currentPage.info`，不会继承正式安装版的 Task 委托或下载权限。`tasks.read/start/stop` 需通过原安装态 App：使用唯一打包器生成当前源码的临时候选，经「扩展」原安装审阅链安装，再使用独立安装并批准的固定 `scrapyjs.capture` 0.3.0。候选准备不等于正式包晋升；不修改 Host 以绕过限制。

线上核心场景是 `examples/original-sites.js` 的 `originalSites[2]`（豆瓣读书）与 `[3]`（CSDN）；两者都是当前页采集。实际网页内容、运行退休回执、表格与下载读回分别留证，不使用历史条数作固定预期。当前 React 的两站真实采集已通过；开发更新与还原复用同源码已有证据。历史连接观察不表示 watcher 当前仍在线，后续源码迭代开始时应重查；下节 Mock 不替代扩展证据。

## 辅助 Mock 网页（不证明扩展或线上采集）

需要辅助 UI 检查时才运行 `npm run dev:mock --prefix examples/sidebar-tools/scrapyjs`，访问 `http://127.0.0.1:43127/preview/dev.html`。它直接加载 `src/App.jsx`、CSS、原 App Model 与 adapter，使用内存 SDK；不覆盖 Browser 的 `dist/development`，不安装工具包。此前 JSX/CSS 网页 HMR 结果仅属于该辅助入口。

这是明确标注的内存模拟 UI：命名配置仅保存在该预览实例内，运行返回模拟记录，下载名称带 `SIMULATED-`。模拟场景选择位于工具 iframe 外，支持正常、空结果、失败、持续运行、权限拒绝和不可信文本；不调用真实网页或 Native。配置新建/保存/改名/复制/删除、字段添加/改名/删除、分页应用、无效 JSON 和草稿保护、模拟运行/停止/下载已通过实际浏览器操作。可重复驱动见 `tests/preview-interactions.mjs`，证据见 `evidence/react-ui-dev-20261029.json`；真实网页采集与原生安装仍为 NOT_TESTED。

功能取舍和 React 选择见 `INTERACTIONS.zh-CN.md`。当前只做实际扩展核心流程所需的应用编译、stage 与开发候选准备；正式包晋升、production 和完整验收继续延期。此前临时候选早于本轮 UI 修复，不能作为当前源码产物。

业务只在本目录维护。App 运行在原 opaque iframe，固定 `scrapyjs.capture` Task 运行在原 Controller Worker，使用词法 `page/params`。没有新执行器、宿主或安装器。固定 Task v0.3.0 批准的精确 origin 为 `http://127.0.0.1:43111`、`https://book.douban.com`、`https://download.csdn.net`。安装审阅完整范围，不为每个配置创建 Task；Chrome 网站权限及当前目标 Authority 继续独立检查。

## 历史安装与业务使用

两个包需分别经原入口审阅安装：

1. 「开发」/原任务目录导入 `controller/scrapyjs.opendesk-task.json`，验证固定源码并安装 Task v0.3.0。
2. 「扩展」导入本目录唯一正式 App `scrapyjs.opendesk-tool.json` v1.3.1；它精确委托上述 Task v0.3.0。此包不包含当前 React UI。保留同 ID 的配置，更新时不先卸载。
3. 打开标准页面 `http://127.0.0.1:43111/demo-form.html`，打开采集 App、刷新目标。默认读取 `#sample-list` 的直接 `li`；`.::text` 是原引擎自身文本语法。
4. 打开「采集规则 → 字段与属性」，填写列表容器和列表项；可选填写字段名、CSS 选择器及文本/属性类型，点击「应用字段」。同名更新，其他字段保留。
5. 需要时展开「采集规则 → 分页与列表详情」。填写下一页 CSS、页数上限和去重字段；详情需列表 URL 字段、双方共同身份字段和详情 `itemConfig`。点击「应用分页与详情」，然后开始。

### App 1.4.0 操作界面与旧 Chrome 对照

先在独立可见 Mac CFT 加载只读来源 `scrapyJsChrome` 的副本，打开真实 `www/popup_crawl.html`，切换数据预览、Config 和 Headers，再与已安装 App 1.3.1 对照。旧 UI 的任务下拉、运行/导出工具栏及数据/配置分区值得保留；其 Headers 实际编辑的是展示列名，不是选择器，未将它误称为完整字段编辑器。旧扩展本次只验证 UI 渲染和这些页签操作，未验证旧采集流程。

| 旧界面习惯 | 当前 App 的改进 |
| --- | --- |
| 命名任务下拉选择 | 配置改为下拉选择，保存就近放置；多份配置不再堆成多行按钮。新建、另存为、重命名、删除及原确认继续保留。 |
| 开始、状态位于数据/配置页签上方 | 共用目标与运行反馈，下方切换「数据预览 / 采集规则」。开始后进入数据预览；切页签保留坏 JSON、未应用字段和分页详情草稿。 |
| Config 保留完整规则；Headers 逐项列出字段 | 已有字段显示名称及原选择器，点击可载入文本/属性规则；复杂描述符、嵌套或 XPath 规则直接打开完整 JSON，不自动改写。所有校验、处理、分页和详情语义保留。 |

常用路径为「选择配置 → 确认目标 → 开始采集」。目标网址默认显示紧凑摘要，点击展开修改；目标与当前网页不同源时，主操作旁提示切换网站、刷新当前网页，真正目标及权限仍由原任务链核验。页签支持方向键、Home/End 和可见焦点。

字段点击载入本身不写存储；修改后仍须「应用字段」，再运行或保存。同名更新其他字段保留；未应用时禁用载入其他字段，避免丢弃草稿。切换配置遇到脏草稿先确认，取消后下拉框仍显示实际原配置。高级完整 JSON 保留原语义，无法表示为普通 CSS/属性的字段不强行转换。

结果仍保留全部字段、原始快照与导出顺序；表格优先显示 title。Stop 受理、原实例退休、未知结果不重放及原 ETag CAS 均未改变。新版本不重冻固定 Task 0.3.0，也不增加权限。

本次同候选 App 1.4.0 经原安装审阅链从 1.3.1 更新，五份原命名配置保留；字段修改/保存/销毁重开、坏 JSON 和未应用字段跨页签及取消切换、切换清旧结果通过。豆瓣样本返回 20 条、11 字段，逐值表格及 JSON/CSV 实际下载字节一致。配置下拉测试采用标准 DOM 选择驱动，其余相关按钮和文本使用浏览器输入；不冒称物理 Mac 下拉菜单点击。证据索引 `evidence/legacy-ui-20261029.json`，旧/新截图与原始报告在 `artifacts/scrapyjs/legacy-ui-20261029/`。

这是独立静态开发扩展快照，没有 serve 连接，未更新日常 Chrome，也不代表 production/正式生命周期验收。1.3.1 首轮改进和原业务证据分别保留在 `evidence/ui-20261029.json`、`evidence/original-sites-20261029.json`，有效未变证据继续复用。

### 豆瓣图书与 CSDN 原例

`examples/original-sites.js` 导出四份完整配置，顺序为豆瓣历史样本、CSDN 历史样本、豆瓣线上、CSDN 线上。将所需条目的 `config` 完整 JSON 粘贴到「采集规则 → 高级 · 完整 JSON」，保存为命名配置；打开对应网址、刷新目标、开始采集。可用下面的本地命令取得线上豆瓣 JSON，索引改为 `3` 即为 CSDN：

```sh
node --input-type=module -e 'import {originalSites} from "./examples/sidebar-tools/scrapyjs/examples/original-sites.js"; console.log(JSON.stringify(originalSites[2].config,null,2))'
```

两份原例均只采当前页：没有分页或详情需求。豆瓣保留 title 属性、url、publication、可空 rating，并按原 `splitPublication` 生成 publication_raw、author、translator、publisher、publication_date、price、currency，共 11 字段；无法解析的价格/币种按原规则保留 null。CSDN 的 title、url、description、price_text、metrics_text、author_display、membership 共 7 字段保留原文本、单位和作者分隔符。

本批 App1.3.0/Task0.3.0 在独立 Mac CFT 的原安装链与真实 App 中通过：历史样本豆瓣 **20 条**、CSDN **9 条**；线上豆瓣 **20 条**、CSDN **9 条**。历史预期来自原 script.json/DOM；线上预期来自运行时独立 DOM 读取，条数并非长期保证。四份配置均完成保存、销毁重开、原 Task 采集、完整表格核对、JSON/CSV 文件下载读回；运行 completed/released，切换配置清除旧结果。CSDN 首条本次为 PCL学习，学习人数文本是线上当前值，不能用历史 8938 强行断言。

可提交索引为 `evidence/original-sites-20261029.json`；原始报告 `artifacts/scrapyjs/original-sites-20261029/app-c/report.json`。样本及独立预期见 `fixtures/{douban-books,csdn}.html`、`examples/original-sites-expected.json`。样本仅保留原列表，去除远程脚本与资源，来源哈希和改动已记录；它们不冒充线上访问。本任务的静态开发快照位于 `artifacts/scrapyjs/original-sites-20261029/browser-source/dist/development`，包校验通过，浏览器已关闭、临时样本映射已移除；日常 Chrome/开发输出未切换。完整构建先遇到既有资源清单不一致，修复校验器后对同一编译产物通过完整包校验；不另称 production 或正式发行通过。

### 命名配置

- 初次升级时，原单配置显示为「默认配置」，内容保留；读取不写入，下一次明确保存才转为命名记录。
- 「＋ 新建」创建默认草稿，编辑后「保存配置」填写名称。「配置管理 → 另存为 / 复制」将当前有效配置保存为独立记录，原记录不变。
- 在下拉框选择已保存的名称切换；最后选中的已保存记录会在销毁 App 再打开后恢复。「重命名」用于已保存且没有脏草稿的记录；有修改先保存。名称忽略首尾空格、按 NFC 规范化，大小写不敏感的同名会明确拒绝。
- 切换、新建或删除遇到未保存 JSON / 未应用字段、分页、详情编辑时，先确认丢弃；取消保留原内容与选择。删除总需确认，删完最后一份后显示可继续编辑的默认草稿。复制和新配置名称表单也可取消或按 Escape。
- 保存、切换、重命名和删除共用原 ETag 条件写入。发生冲突或保存回执未知时保留草稿和远端列表，禁止自动重试；「读取保存版本」只读远端，「用保存版本替换草稿」经确认后采用远端完整列表。需要的本地草稿应先复制到外部文本。
- 运行期间锁定配置编辑和管理，Stop 始终作用于原实例。结果显示启动时的配置名称；切换配置后清空上一份结果，不把旧结果归给新配置。配置记录 ID 与固定 `scrapyjs.capture` Task 身份互不替代。

命名配置是 App 自身数据：同一 `capture-config` 存储项使用 `{schemaVersion:1, selectedId, records:[{id,name,config}]}`，最多 10 份，**整个存储项 JSON 合计最多 8,192 UTF-8 字节**；不为每个名称创建 Task。名称 1–60 个字符、最多 180 UTF-8 字节。每份采集配置仍遵守原 itemConfig / options 各 4,096 字节限制。超限、损坏记录和非法配置均拒绝保存，草稿与原保存值保留；较大的旧单配置仍可读取，不会为了迁移自动截断或覆盖。

历史 App 1.2.0 已在独立 Mac CFT 的原安装升级入口验证：A/B 保存切换、销毁重开、改名复制、同名拒绝、删除确认与取消、JSON/字段/分页草稿保护，以及两份不同字段的真实采集均通过；运行均 completed/released。旧列表详情配置与控件来回切换完整保留。36 项定向 Node 检查通过；ETag 冲突/并发保存、容量、损坏存储和详情草稿保护属于组件证据。可提交索引为 `evidence/named-configs-20261029.json`，原始报告为 `artifacts/scrapyjs/native-profiles/candidate-20261029-c/report.json` 与 `supplement-20261029-a/report.json`。原生测试使用上批固定静态开发快照，不代表日常 Chrome 已更新或 production 验收。

未应用的表单编辑阻止运行与保存。完整 JSON 保留原选择器/嵌套字段语法，也可填写原 `validation` / `fieldRequirements` / `processing`；配置只接收数据。表格呈现真实记录，完整快照仍保留。宿主、引擎、Stop 受理和实例退休分别显示；结果未知时禁止重复开始。原 Stop、配置 ETag 冲突保护和 JSON/CSV 下载继续使用已有链路。

当前 P0 引擎升级源码使用固定 Task **0.4.0**：分页链接通过公开 `page.goto()` 推进原目标会话，按 `document.baseURI` 解析，确认新文档后等待配置的完整页标记；标记也须适用于空末页。按钮、同文档锚点和没有可靠完成信号的异步翻页在动作前返回 `NOT_SUPPORTED`，不再把固定 300ms 静止当作加载完成。下一页控件须唯一，字段 DSL 继续交给原 ItemLoader。旧安装 Task 0.3.0 不会自动获得这些修复；来源、候选和未测范围见 [P0 升级记录](PLAYWRIGHT-UPGRADE.zh-CN.md)。分页只开放 CSS，最多 10 页；达到上限时保留已采集数据及 partial/page_limit，不伪称自然结束；详情最多 100 条、串行执行，严格核对 URL 与 ID，不静默重试。相同身份而内容不同报错；重复详情 URL、详情覆盖列表字段、错误 ID、非法价格均拒绝。详情 `numberFields` 使用来源示例的严格小数 Pipeline。滚动分页、XPath 翻页、断点恢复和重试管理未交付。

## 先脚本验证，再接 UI

可复制的零参数 ESM 入口：

| 脚本 | 输入与独立预期 | 本批真实 Controller 结果 |
| --- | --- | --- |
| `examples/fields.js` | GitHub 旧例三行；文本、href、可空属性；名称经原 Pipeline 大写 | 三行全部字段一致；BrowserValidation 运行，URL 绝对化；completed/released |
| `examples/pagination.js` | 两页共五行，两个重复；首次出现顺序三条 | 两页、三条、重复 2；`site_exhausted` 自然终止 |
| `examples/list-detail.js` | 旧 catalog 的 A/B/C、Ada/Ben/Cara、19.90/25.00/30.00；列表有 A 重复 | 三条 URL/ID 正确关联，价格为 19.9/25/30；列表和详情原引擎均 completed |
| `controller/main.js` | 同样的声明式详情参数，作为固定 Task | 与上述完整黄金一致；经原验证/安装链安装 |

输入、输出和来源差异见 `fixtures/README.md`、`examples/expected.json`。旧 Node HTTP 例子的 PASS 不作浏览器证据；这里用原 ChromeSpider / BaseSpider / Request / Scheduler / ItemLoader / Pipeline，在受控网页世界执行真实 DOM 提取。

复现时保留既有 `npm run dev` watcher、标准 demo 服务和日常 Chrome，使用独立 CFT/Profile 的不变开发快照：

```sh
# 前提：canonical demo 服务正在 127.0.0.1:43111 提供 examples/tasks。
# 仅添加有所有权检查的临时映射，不修改 demo-form.html 或重启服务。
node examples/sidebar-tools/scrapyjs/tests/fixture-mount.mjs mount
node examples/sidebar-tools/scrapyjs/tests/build-examples.mjs artifacts/scrapyjs/my-examples
node examples/sidebar-tools/scrapyjs/tests/native-examples.mjs --suite=artifacts/scrapyjs/my-examples/suite.json --out=artifacts/scrapyjs/my-native-run
node examples/sidebar-tools/scrapyjs/tests/fixture-mount.mjs unmount
```

`build-examples.mjs` 为每个入口准备独立源码快照，并调用现有 `build-program-project.mjs`；它不运行引擎。原「开发」入口导入固定草稿并显式 Run，原持久结果绑定 sourceHash/runId/resultId/retirement。`params` 可传 `url`，仍须原任务范围和页面授权。

原始脚本报告：`artifacts/scrapyjs/native-examples/core-d-20261029/report.json`。可提交的证据摘要与每项证据层级见 `migration-status.json` 和 `evidence/core-examples-20261029.json`。本批 App 独立成功报告为 `artifacts/scrapyjs/native-examples/app-d-driver5-20261029/report.json`：同一 App 的三组字段/分页/详情配置应用、未应用保护、三条全字段表格、保存后销毁并重开、完整 JSON 46,312 字节下载读回均通过。前一报告整体 BLOCKED 是后续 App 下拉框驱动失败，四个脚本结果本身均 PASS；未改写历史状态。

## 当时后续打包阶段（历史）

以下仅记录后续交付流程，不是当前 UI 开发的前置步骤。UI 稳定且进入打包阶段后，先执行本工具的 JSX 编译，再候选测试，经原 `--promote-from` 原子晋升和 `--check-project` 同源核对。Task 源码/manifest 改动则重新冻结、运行、验证、安装，并同步 App 的精确委托；不静默更新已安装 Revision。

```sh
# Task 范围或源码变化时，先按原 program build/验证/安装链冻结新 Task 并同步精确 pin。
# 固定 Task 0.3.0；以下仅供后续打包阶段，须先编译当时的 UI 源码。
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --out artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json
SCRAPYJS_CANDIDATE=artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json node --test examples/sidebar-tools/scrapyjs/tests/{profiles,app-model,app-view,package}.test.mjs
# 测试通过后才执行：
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --promote-from artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --check-project
# 本批原生操作使用 tests/native-examples.mjs 的 --app-lane=original-sites --headed；
# suite 参数须遵守固定 Task 的 url/configJson/optionsJson paramsSchema，见原始报告输入。
```

完整原 SDK 为 1,136,734 bytes，SHA-256 `c7a266c1bd5f34ba5e5a85d163c0573fc1d5afb60c07d0ce46af8393e7ada4be`。`engine/browser.js` 只把 classic IIFE 已有导出转为词法 ESM；无压缩、删模块、假 window/DOM 或 Node 能力模拟。通知见 `vendor/scrapyjs/THIRD_PARTY_LICENSES.txt`。无需为日常业务重新生成这份未变 SDK。

Task v0.3.0 sourceHash `12668947ef0f99851986891b911ee3d32deca993e42066b48f496691579feb4f`，manifestHash `1bec7362a33d4aeb4ce051d2eed699aa4876e3c7ae82efc536005f287340f53a`。App 和 Task 包摘要从同源检查及证据账本读取。

## 当时尚未完成（历史）

可视选择/高亮/表格选择与选择器生成、完整处理/质量编辑、自动保存/来源 profile 运行策略/自动重绑定、暂停/继续、检查点恢复/调度及大结果体验尚未完成，不是当前 UI 阶段的完成条件。AI 助手已由本轮恢复实施；克隆 UI、配置任务库和通用录制/回放继续排除，命名配置继续保留。Rule/LinkExtractor/runCheckpointTasks 等完整实现保留不等于已在 OpenDesk 逐项运行。原 `processing.splitPublication` 的本批豆瓣当前页验证见原站点证据；它不代表任意出版格式均受支持。

上轮 v0.1.0 六项单页核心证据保留在 `migration-status.json.coreEvidence`，包括正常 Stop、回包前取消和 JSON/CSV 文件下载。它们是旧候选证据，不提升为新候选的全量验收。旧 `k3-sandbox-error-forwarding.test.mjs` 的过时 Worker URL 夹具缺口继续保留，未放宽来源校验。本轮延期 production、升级/撤权正式验收、完整 32 项验收、宽度/缩放矩阵及压力测试。独立 95+ 评分按本轮要求执行。Node 文件/CLI 专用功能本轮不迁。

</details>


### 2026-10-31 · 风格来源与共享 Chat 预览修订

当前离线入口为 [preview/preview.html](preview/preview.html)，来源、操作和后续维护步骤见[预览 README](preview/README.zh-CN.md)。本次将工具字段/折叠区接入原 canonical CSS 提取器，目标卡使用共享 Card，当时 AI 在内容区组合 Frame/session；这只是历史消息/输入片段，未满足本轮 Host 工具栏 + workspace/business + Dock + Frame/session 标准。公共 `components.html` 顶栏小 AI 按钮也须实际开合。没有晋升正式安装包、提交/推送、更新已安装 Browser 或操作真实未决请求。旧评分仅保留历史范围。

### 2026-11-01 · 列表容器与记录范围审计

源码现保留四种明确模式：容器 + 列表项过滤容器直接子项；仅容器取直接子项；仅 `_listItem` 按整页 CSS 选择记录；均省略按单页。多个/嵌套容器按文档顺序、节点身份去重，内容相同的不同记录保留。空值、错误类型和不支持的范围选择器报错，不回退全页；相对顶层选择器、`:scope`、伪元素及 Cheerio/jQuery 扩展不能作为列表范围。字段仍相对每条记录读取。已有严格 validation / parsePage 合同不自动移除或放宽。

本次同步核心、Chrome SDK、侧栏固定源码快照及 export-only 消费产物；命名配置四模式保存/重开与离线预览已验证。验收报告与命令见仓库 `artifacts/scrapyjs/container-audit-20261101/README.md`，正式安装版与工具包未更新。Chromium fixture/独立扩展证据不代表 OpenDesk 已安装 App/Task 升级，侧栏全套测试仍有独立 UI 与旧正式包失败，详见报告。

### 2026-11-01 · 从完整字段准备列表（核心开发）

原工具目录继续作为唯一业务 owner。当前配置可先填写 `title/url/price` 的完整 CSS 字段路径，无需填写 `_listItem/_listContainer`。在「AI 配置 → 更多资料与诊断 → 提供必要 HTML 样本」粘贴代表性 HTML，再点击「从完整字段准备列表」；成功后审阅差异、应用为未保存草稿，最后沿原命名保存链保存。准备在本地使用同源 `ItemLoader.prepareList`，无需 AI Provider，不自动抓正文或开始采集。已有明确列表规则和普通详情提案保留原路径。

记录边界由真实节点和字段归属证明，歧义或未出现的字段会要求补足信息。缺可选标量沿用空字符串、缺 many 为 `[]`，相同标题不合并。未知/未决请求、忙态、目标/配置/输入变更和过期提案继续阻止应用。支持范围与严格重放的必填/身份合同见 [上游 API](../../../../scrapyJs/docs/api/items-pipelines-exports.md)。本轮只更新源码和来源锁定 SDK；没有构建工具 dist、晋升正式包、安装或操作日常 Chrome。最终候选行为与未测边界见仓库 `artifacts/scrapyjs/record-model-20261101/author-entry/` 的本轮报告。
