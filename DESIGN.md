# Design

## 我的“添加任务”原型对齐（2026-11-15，核心实施）

- 用户本轮要求将更新后的 `prototypes/sidebar/my/index.html` 添加区落实到现有可信 React 页面。外层轻边框、内层文件拖放、居中“选择任务文件”、就近说明/错误、底部“浏览任务目录 / 新建脚本”按原布局与 Tokens 实施，复用 `MyControl`、原 TaskWorkbench 导入与安装审阅。
- 展开后在 React 提交完成时聚焦文件按钮；Escape 从区内按钮关闭并返回触发点，IME 组合输入不误关闭，拖放结束/关闭清理高亮。错误只在当前添加区持久展示，重试恢复 status；不覆盖原任务的其他错误。取消文件选择或拒绝覆盖开发草稿不导航、不报成功。
- 目录继续沿正式工作台已有的独立标签页安装/审阅链，图标和提示明确新标签页；本轮不把离线目录/文件预览模拟升级为另一套安装器，也不重做计划、任务管理或参数页。
- 16 项相关 Node 导入/取消/键盘检查通过；Ego 在360px的真实 JSX/CSS + TaskWorkbench、模拟 Host/API 预览中12项操作通过。源组件已能编译，截图及脚本在 `artifacts/my-add-task-20261115/`；预览不是安装态、真实权限、任务运行或 OS IME 证据。
- 原 PID 21424 在本轮期间退出；核实无活跃 writer 后，用原 `npm run dev` 恢复服务（PID 79083，127.0.0.1:43119），保留 `dist/development` 加载目录。最终 revision `a6f58e349647` 的两处 React/Controller source map 与当前源码逐字相同，产物 CSS 包含当前源 CSS；完整记录在同目录 `development-evidence.json`。Ego 打开正式扩展页返回 `ERR_BLOCKED_BY_CLIENT`，当前侧栏生效与 production 均 NOT_TESTED。未提交、推送或替换加载目录，保留并行搜索/开发等改动。

## 开发编辑器参考入口（2026-11-15，正式组件核心实施）

- 正式 `DevelopSourceEditor` 去掉可编辑状态的“当前草稿”，左侧弱化显示真实文件名（截断并保留完整 title）；固定源码保留“固定源码 · 只读”和原编辑保护。
- 右侧复用 `od-icon-button--quiet` 与原焦点样式，提供代码示例与 API 文档语义链接；随自动化 JS、网页 JS、React JSX、Vue SFC 切换，新标签打开且不替换/运行草稿。本地项目随原手工编辑区隐藏；通过现有四语言目录及工作台 locale 更新说明。
- 链接配置统一归 `src/config/browser-config.json`，与 market 共用原公共配置源：`navigation.developerReferences` 按四种模式保存 `examples` / `help` 完整 HTTPS URL。原校验器严格检查字段与地址并输出不可变副本；编辑器按模式直接读取，保留原新标签/草稿行为。配置说明归 `src/config/README.md`；源码预览指纹包含该 JSON。本次配置与原 market/编辑器交互 8 项定向检查通过，未重新构建或验证当前正式侧栏运行。
- 上下文帮助保持独立配置、复用文档：Controller/网页 JS 直达各自 main 入门，React/Vue 共用组件文档并直达各自 JSX/SFC 入门。用显式稳定锚点减少查找，不为每种模式复制一份文档；示例入口继续打开实际示例。八个参考目标与五个配置锚点已本地核对，编辑器及 AI 提示词模式映射两项定向检查通过。新文档锚点需随相应源码同步到 GitHub 后才在线可用；未进行在线评分、提交或发布。
- 最小验证：9 项相关 Node 交互/布局/草稿测试通过，新增文案的四语言参数与全部参考路径核对通过；真实 JSX/CSS 的 Ego 离线预览 12 项检查通过，360px 无横向溢出，标题栏 36px、图标 34px、编辑区 164px，只读长文件名、键盘顺序与新标签导航保真。证据在 `artifacts/develop-editor-references-20261115/`，仅为 `UI_PREVIEW_ONLY`。
- 收尾发现并保留并行 owner 的 React 网络 Import 默认示例、示例链接和测试更新；当前 React 示例指向 `examples/programs/page-ui-toc-react-direct/README.md#react-network-import-example`。本轮重新验证了受影响的交互与四项草稿/只读/本地保护；浏览器 12 项证据对应此前快照，不能证明新 React 示例已在产品中运行。
- 本轮正式侧栏入口返回 `ERR_FILE_NOT_FOUND`，`dist/development` 缺少入口，已保留原开发进程与并行输出；实际安装/当前运行生效及 production 均未验证。原 i18n 总检查在 HEAD 已有 `en is not defined`，本轮不改无关 helper。未提交、推送或发布。

## 开发原型权限与间距（2026-11-15，离线增量）

在现有 `prototypes/sidebar/develop/index.html` 继续完善「…→权限与诊断」及默认侧栏密度。沿用现有Tokens与4/8/12/16节奏；能力两列、说明/错误紧邻字段、低频目标和查询按需展开。现行八项预选与独立Cookie只准备输入，不授权；待批准草稿、替换差异与当前模拟回执分别展示。保持分格式草稿、返回/焦点、Run/Stop、未知不重放。目标归[原规格第13节](docs/framework/developer-ui-ux-r1-20261114.zh-CN.md#developer-prototype-permissions-ui-20261115)，关键条件归[测试规格第13节](docs/framework/developer-ui-ux-r1-test-spec-20261114.zh-CN.md#developer-prototype-permissions-tests-20261115)。仅离线内存模拟，不扩大到正式React/SDK、构建、安装、权限或评分。

## 我的主页面原型对齐（2026-11-15，核心实施）

用户最新要求将 `prototypes/sidebar/my/index.html` 落实到现有“我的”页面，重点是自动化任务列表下方；本节覆盖下方此前“仅离线原型”的阶段限制。子页面、新建/编辑计划与独立管理页的重设计仍延期，不恢复旧评分或完整验收矩阵。

- 在原 `MyTaskWorkspace` 对齐状态摘要、最近结果、运行记录、网站与权限；组内 8px、折叠行 44px、图标与右侧箭头复用共享 CSS 与唯一 Tokens。结果无数据时隐藏，空历史仍可展开；事实用语义 `dl`、真实版本/能力/来源。低频操作按原任务菜单打开，关闭回收焦点。
- 失败与未知有持久原因、恢复说明；未知可就近打开原记录，不执行任务。真实快照投影提供状态/时间/归属；切任务清除旧结果和原值展示。脱敏、显式原值查看、Run/Stop、安装/权限与 Authority 保留原 owner。
- 17 项相关 React/workbench 定向测试通过。Ego 在 360px 同数据、真实 JSX/CSS 预览中验证默认/展开/成功/失败/未知/停用/网页不可用和键盘焦点。默认区块相对几何一致；360×128 局部截图 RGB 平均绝对差 0.533/255，仅说明此局部候选，不换算为整页相似度或正式产品评分。
- [同数据对比](artifacts/my-main-alignment-20261115/comparison-final.png)、[范围与验证记录](artifacts/my-main-alignment-20261115/verification.json)。持续开发产物仍为 `dist/development`；当前实际侧栏加载视觉证据因 renderer 无响应未取得，真实 Run/Stop、安装、权限、IME 与 production 均未由本轮验证。并行改动与服务保留，未提交推送。

## 开发权限默认预选（2026-11-15，默认值已实施）

用户最新要求优先方便新用户开发、减少点选及事后不知道如何处理的问题，权限尽量全选。当前目标改为“所有已支持SDK服务默认预选，独立Cookie也默认勾选；首次集中审阅、有效授权直接复用、缺项就近恢复”，覆盖早先仅五项基础预选的方案。预选草稿与真实授权分开显示，普通 Run 和既有同源 HTTP 不增加批准前置，新用户无需先进入诊断或逐项勾选。唯一默认表、MAIN 文档级授权边界与新用户主流程归[原分层授权合同](docs/architecture/browser-framework/userscript-sdk-authorization-r1.zh-CN.md#developer-permission-defaults-20261115)，目标/实施归[开发规格第 12 节](docs/framework/developer-ui-ux-r1-20261114.zh-CN.md#developer-permission-defaults-20261115)，判定归[测试规格 P01–P15](docs/framework/developer-ui-ux-r1-test-spec-20261114.zh-CN.md#developer-permission-defaults-tests-20261115)。保留手改/主动取消、原实验页精确预填、完整替换审阅、撤权与未知不重放；不可用/未准入项不勾选，不自动扩大跨站目标，不创建开发绕过开关。Run仍只读检查，恢复成功带回原操作，不自动重跑未知效果。本次已实施八项服务与Cookie默认值、精确文档草稿保留、原实验页预填及中文标签。HTTP 项简化为“HTTP 网络请求”，同源与额外跨站范围统一放网络设置和批准摘要；勾选尚未授权。17项owner、43项原SDK围栏及7项Controller草稿检查通过；实际侧栏更新另记于测试规格。就近恢复、旧授权差异展示与完整新用户流程仍为后续，真实新增授权/服务调用/撤权均NOT_TESTED。不影响其他作用域/并行文件与服务，不提交推送。

网页选择进一步简化为默认复用本窗口的当前网页与主文档，主区只显示标题、地址和具名刷新图标；手动更换网页/子框架放在默认折叠区。手动选择后保持目标，通过“使用当前网页”恢复跟随。刷新只读且保留同文档草稿，精确身份与批准校验不变。目标与证据见[开发目标12.5](docs/framework/developer-ui-ux-r1-20261114.zh-CN.md#developer-sdk-page-target-20261115)及原测试规格的P16–P18；本次owner测试35/35，实际侧栏DOM验证已完成，开发服务连接仍未恢复，不能据此承诺后续自动更新。

## 开发原型运行结果与异常（2026-11-14，离线范围）

- 在原“运行结果”位置展示明确状态、返回值或错误摘要、恢复建议；失败与未知也能展开调试信息和查看历史。删除离线不可用的复制/下载占位按钮与重复的“本次详情”子页；未知态只显示一个原记录入口。成功但没有返回值明确显示 `undefined`，不能当作失败；停止不代表网页效果已回滚。
- “过去运行”仅保留在原“更多”菜单，供低频对比与排障，不在当前结果区常驻；结果未知时才就近提供“查看原运行记录”。
- 技术信息放在同一区域默认折叠的“调试详情”：本次来源/阶段、原始回执、可用的堆栈与本次日志。Console 是补充入口，不承载唯一错误信息；无日志、无行列或缺失回执如实说明，不推测为成功。
- 复用原轻边框、Token、8px组内间距和原生 details，错误具有持久 alert，状态具有 status；长堆栈局部滚动，展开不挤占底部停止按钮。新运行替换当前诊断，历史保留各次错误与详情，结果未知不重放。
- 调试详情与历史中的技术详情使用现有 `od-disclosure od-disclosure--flat`，复用公共箭头、字重、Hover、间距和粗指针规则；不再维护专用 summary 样式。自包含离线原型只嵌入 `src/ui/design-system.css` 相关规则快照，正式界面直接使用原公共 CSS。保持无外框、默认收起，不增加卡片或组件层。
- 当前只编辑 `prototypes/sidebar/develop/index.html` 及说明，使用明确标记的内存演示数据，不执行脚本、不接 Host、不承诺日志捕获能力、不定义新框架协议。后续正式接入只消费原 owner 的真实回执和允许公开的日志，保留来源、脱敏、撤权与未知效果保护。完整评分、产品构建、安装与 production 均不属于本轮。

## 开发离线原型间距优化（2026-11-14，本轮独立范围）

用户当前要求优化 `prototypes/sidebar/develop/index.html`，保留已有功能及并行改动。本轮仅编辑离线原型及其说明，不扩大到并行的正式开发Tab实施。复用下方 Visual language、R27与原canonical亮色token快照：4px关联、8px同组、12px容器/字段组、16px章节，父布局单一持有间距，正文和页脚使用同一gutter。目标、编辑前固定的95+独立评分标准与关键测试条件见[原型README](prototypes/sidebar/develop/README.md#本轮布局目标与关键测试条件2026-11-14)。本轮已完成默认360px原型优化：39项Ego检查通过，独立AI设计复评98.5/100，详见原型README的同候选证据。用户最新收缩为侧栏默认360px，不以窄屏/缩放为本轮验收前置；默认/展开/错误/本地/长内容/浮层、交互与截图必须绑定当前原型；原生产品及production仍独立、未测不得计入。

## 作用域与本轮入口（2026-11-01）

- 我的 Tab UI/UX（2026-11-15）：**主页面列表下方已进入原 React 核心实施；子页面延期。** 最新范围与证据见[主页面原型对齐](#我的主页面原型对齐2026-11-15核心实施)；[原型规格](docs/framework/my-ui-ux-r1-20261114.zh-CN.md)、[测试规格](docs/framework/my-ui-ux-r1-test-spec-20261114.zh-CN.md)及[HTML 参考](prototypes/sidebar/my/index.html)保留各候选归属，不能把原型评分当作正式侧栏验收。
- 开发 Tab UI/UX（2026-11-14）：**用户已授权把认可的原型落实到现有开发 Tab，当前为核心实施与最小验证阶段。** 最新决定归[目标规格11.7](docs/framework/developer-ui-ux-r1-20261114.zh-CN.md#117-现有开发-tab-核心实施最新)，证据和限制归[测试规格11.5](docs/framework/developer-ui-ux-r1-test-spec-20261114.zh-CN.md#115-现有开发-tab-核心实施验证最新)。原 React 根内已整理普通输入、运行选项、保存/历史/诊断和本地项目；复用现有 watcher 的 `dist/development`，不启动第二 writer。真实侧栏已加载新组件且开发服务已连接；画面为真实侧栏 DOM/CSS 的静态记录，原生点击 Run/Stop、IME、安装和 production 仍 NOT_TESTED。不恢复旧评分或完整矩阵，未提交推送。
- 五 Tab 共同布局规范（2026-11-10）：本轮设计依据与实施边界见[共同布局决定](#五-tab-共同布局决定2026-11-10独立作用域)、[R27 语义与间距所有权](docs/architecture/ui-layout-conventions-r27.zh-CN.md#token-语义与使用决策2026-11-10)、[R20 集合与真实映射](docs/architecture/sidebar-design-system-r20.zh-CN.md#集合列表与独立参数区2026-11-10)。规则已在共享 CSS、任务/扩展集合及本地项目表单中实施；源码预览与实际安装态分别记录。
- Side Panel 页面留白修复（2026-11-10）：规则归 [R20 留白所有权](docs/architecture/sidebar-design-system-r20.zh-CN.md#留白所有权和使用原则2026-11-10-修订)，变量归 `src/ui/design-tokens.css`。普通页由 shell 提供页面边距；通栏 ToolHost 头部负责自身顶部留白，避免全局清零与多层叠加。已在 Ego Lite 实际 development 侧栏检查扩展列表、网页笔记运行页、扩展信息详情及返回；production、窄屏/缩放矩阵与正式评分未执行。此状态只属于本次留白修复。
- 统一确认与反馈目标（2026-11-09）：见[本轮独立设计作用域](#统一确认与反馈2026-11-09独立作用域)、[唯一交互与异步合同](docs/architecture/browser-framework/confirmation-and-feedback.zh-CN.md)、[实施目标](docs/framework/shared-confirmation-r1-20261109.md)及[关键测试条件](docs/framework/shared-confirmation-r1-test-spec-20261109.md)。原对话已完成规范同步，用户要求新对话实施；公开确认 API 与运行验收仍未完成。
- 本轮官方风格试点：[独立状态入口](#当前获批官方风格试点2026-11-01) → [官方来源与组件合同](docs/api/sidebar-preview-kit.zh-CN.md#官方风格试点合同2026-11-01) → [工具接入指南](docs/api/sidebar-tool-development.zh-CN.md#获批官方风格试点2026-11-01)。实施方向已获批；最新v7按用户反馈采用浅灰按钮与配置库；交付与评分见当前试点入口，用户视觉终验不由离线评分代替。
- 下方原 `Source of truth` 及其阅读目录章节保留 reading-toc 多语言历史作用域；其批准、评分与证据不构成本轮试点或全局 UI 的批准。AI Proxy、Fingerprint 及其他独立章节各自保持原作用域。

<a id="my-ui-ux-20261114"></a>

## 我的 Tab UI/UX（2026-11-14，设计与原型）

- **目标与用户**：服务在实际默认侧栏宽度、正常缩放下使用已安装 Controller Task 的用户；主链为找到任务 → 准备参数 → 明确运行 → 看结果/停止。查找、添加、管理、AI 与计划保留可发现入口，不增加仪表盘或把任务参数变成常驻页面检索。
- **本轮阶段与交付**：维护[目标规格](docs/framework/my-ui-ux-r1-20261114.zh-CN.md)与[测试规格](docs/framework/my-ui-ux-r1-test-spec-20261114.zh-CN.md)，在原 `prototypes/sidebar/my/index.html` 及 README 迭代。最新用户反馈明确原业务布局基本可用：去掉顶部示例网页卡片，脚本行对齐现有 60px，复用原“参数与运行”布局和“取消 / 运行任务”，不另造“暂不运行 / 模拟运行”。HTML 仍是待审阅候选，不扩大为正式 React 修改、构建安装或发布。
- **搜索简化（2026-11-15）**：初期任务少，右上角搜索仅展开关键词输入，不展示「全部 / 当前网页 / 已停用」分段；默认检索全部任务，停用/网站状态留在任务本身。独立任务管理的筛选保持原入口。
- **信息架构**：一个任务集合；选中展开所属状态/结果/记录/权限，行内准备运行进入原参数 Sheet，Run/Stop 沿原 owner。添加任务沿原页内展开：文件/目录/新建脚本三入口，目录与文件预览逐级返回，不再用说明弹窗跳其他预览。计划走列表/详情/创建编辑/检查确认/保存后详情；创建取消回列表、编辑取消回原详情，切开发也保护脏稿。保留原任务管理/独立运行页，暂停未来调度与停止当前执行分清。
- **视觉与组件**：参考“开发”页白底、轻边框和紧凑层级，复用 R20/R27/R28/R33、唯一 Token/组件/React 根。单 gutter，父 gap、字段组和折叠 inset 各有 owner；不复制 HTML 样式进公共 CSS，不靠缩小字体/图标或删除功能提高密度。
- **任务管理入口补充（2026-11-15，离线增量）**：管理图标位于右上角时钟左侧，搜索/添加保留，底部重复入口移除。独立管理页按名称/ID/网站搜索、带数量的状态筛选，关联计划展开和详情原路返回；停用/未知限制、编辑绕行保稿、结算刷新及嵌套/删除返回焦点均有定向离线交互覆盖。完整决定和证据只在上述目标/测试规格维护，未实施正式 React、构建或安装。
- **最新计划设计（2026-11-15，覆盖旧82px方案）**：旧候选的右侧状态文字＋文字动作已被用户否定，行高不作为完成指标。列表左侧组合语义图标与“已启用 / 已暂停 / 待处理”，中间以名称、下次时间/暂停规则和任务建立扫描层级，右侧保留具名暂停/恢复图标。状态不只靠颜色，操作有提示、键盘与独立命中区。
- **计划表单与任务管理**：新建/编辑按名称、执行任务与目标、执行时间、保存后状态分组；任务选择旁保留新建脚本与任务管理入口。时间规则使用原生radio分段，日期/星期按规则出现；时区和规则摘要就近显示。保存后状态正向选择“按规则执行 / 暂停”，不让用户反推复选框含义。取消与“检查计划”固定在本视图操作栏；确认展示对象/目标/规则/状态，再保存到详情。任务管理是独立子视图，搜索、启用/停用筛选、版本/网站/关联计划、启停/卸载、复制到开发、建计划均有入口；从表单进入再返回保留草稿、错误、滚动和焦点，不用任务目录代替管理。
- **交互与保护**：参数默认表单、JSON 共享原 Schema/草稿，不推广原型示例校验；选择/打开参数/保存不隐式运行或安装。结果、Stop、未知请求、身份/权限/撤权继续由原 Task/Schedule workbench 与 Host 保证；UI 文案不证明执行已结算。
- **状态与可访问性**：区分空安装、无匹配、不可用、运行、成功/失败和未知；错误/恢复原因持久，短成功视口可见。图标具名、焦点/返回、Tab 循环、错误字段关联与 IME 按测试规格判定；当前仅以正常默认宽度为优先，完整主题/缩放矩阵延期。
- **功能保真与差异**：可信 React 已有 AI、文件选择/拖放、复制草稿、原值查看、计划完整规则/时区/策略等；独立 HTML 只模拟部分交互。这些原型缺项不是删除授权。原型固定 host/版本、计时器、内存草稿及简化未知/计划规则不能代替产品合同，差异只在目标规格维护。
- **证据与开放项**：本轮离线设计已收尾，当前79条行为记录通过，两位专家逐页均≥95且审阅范围无待修阻断。精确候选、同源截图、实际Ego操作和独立专家逐页结果只在[测试规格第5节](docs/framework/my-ui-ux-r1-test-spec-20261114.zh-CN.md#5-当前离线候选独立评审与证据边界)维护。旧 `e87bbd6d…` 的19项和82px方案已被否定，其他旧候选记录也不合计当前通过数。文件仅只读预览，不传递真实草稿或安装；真实Side Panel、加载路径/ID、开发连接、Run/Stop/权限/安装/调度、OS IME与production均NOT_TESTED。
- **所有权与停止条件**：只在现有 `main` 修改本节、两份规格和原独立 HTML/README，保留并行源码/规范/开发原型改动与所有服务。本轮以受影响原型交互通过、规格完整、互链有效、证据和范围准确，且独立专家对列表、新建/编辑、任务管理及一致性逐项≥95/100且无阻断项收尾；离线/D 条件通过不等于后续产品 K 条件通过，不恢复旧 GOAL 的正式验收。

## 五 Tab 共同布局决定（2026-11-10，独立作用域）

- **任务 UI 视觉完善（2026-11-11，当前方向）**：最新用户反馈优先于下方历史评分。任务集合采用安静的选择底色、统一任务图标、两行以内标题与一行摘要；行内悬浮动作使用共享 IconButton 和同色渐隐底层，不占右栏。参数抽屉保留原生 dialog 的焦点/身份合同，按标题、参数工具栏、紧凑字段、固定操作底栏分层。字段复用已有 React Aria Input/Textarea 与 `od-input-group`，枚举保留原 select，布尔为整行标签加右侧复选框。默认表单，JSON 切换继续走原校验/草稿 owner；不建立第二套主题、执行逻辑或弹层。先保存现状截图并检查视觉缺陷，再实现；完成后检查 360px、受影响窄宽度、键盘与草稿行为。当前原生 UI 连接超时，源码预览和真实运行须分开报告；不恢复独立评分或 production 验收。 结果：源码绑定预览 `06b87c33…` 已完成 360px/320px、菜单键盘、焦点返回、中文/JSON 草稿、错误与短视口内部滚动核对；行为检查 125/125、布局边界 12/12 通过。证据归 `artifacts/task-row-redesign-20261111/`。原 watcher 的 AI Proxy 来源锁错误仍在，新原生候选及真实 Run→结果→Stop 均为 NOT_TESTED；本轮未提交推送。
- **最新交互调整（2026-11-11）**：根据用户本轮反馈，取消列表下独立的「填写参数并运行」按钮，参数/运行与菜单覆盖在任务行上；默认保留一个菜单，跟随最后悬停/焦点行，触屏保留可见入口。任务与扩展的按钮都不占右侧独立列或额外 padding。参数 Sheet 默认使用左侧内置标签的紧凑动态表单，并提供 JSON 切换；两者复用原 Schema、草稿与固定安装身份，非法 JSON 不运行，JSON 不扩大支持的参数类型。源码及原 owner 定向检查已完成，证据归 `artifacts/task-row-compact-params-20261111/`。原 watcher 当前被并行 AI Proxy 来源锁不匹配阻塞；本轮 ego 源码预览不冒充原生已更新，下方 96.1 分及 Run/Stop 仅属于上一轮 `63879a1c…` 候选。
- **用户最新纠偏与续接重点**：只优先考虑正常 Side Panel 的实际默认宽度与核心使用，不继续把缩放、极窄宽度或完整矩阵作为本阶段前置。「我的」列表下的搜索关键词/结果数量属于选中脚本参数，当前常驻展开容易被误认成页面搜索；本轮在同一 Side Panel 以参数抽屉/Sheet 承载填写、校验与运行，并验证真实任务操作。参数已移入同面板原生模态 Sheet，列表外只保留所选任务、网站状态、操作与结果。表单始终挂载，关闭保留草稿；打开固定安装身份，明确 Run 才进入原权限与执行链。Schema 校验展示具名字段错误并定位输入，不能用 HTML required 加强原 Schema 的空字符串语义。本轮完成条件为当前核心 UI 与最小验证；独立评分、production 与完整矩阵不属于当前阶段，历史评分仅对原候选有效。
- **目标与依据**：让维护者从 Markdown 理解 Token 的角色、间距由谁负责、何时使用集合/卡片及如何映射真实五 Tab。已读当前 AGENTS.md、extension-ui Skill、唯一 token/公共 CSS 和 React 布局组件；`sidepanel.html` 是构建入口，源码宿主为 `src/ui/sidepanel.html`，五 Tab 由 `src/ui/react/app-shell.tsx` 组合，不沿用退役 `tool.html` 或旧短标题导航规则。
- **实测基线**：实际 development 侧栏「我的」任务独立圆角框彼此贴合、选中整框过重、参数区与末行相连；「开发」本地连接断开时，字段和说明呈等距堆叠。布局改进不证明本地连接恢复。
- **实施决定**：公共 `od-collection` / `od-collection-row` 由扩展与我的共同消费，使用单外框、内部行分隔；普通行 padding 12px、扩展图文 gap 8px、任务图文 gap 12px、名称到次信息 gap 4px。任务集合到独立操作 workspace 为 16px，沿用集合底边分隔，不重复加横线或水平 padding；参数字段由 workspace 内常驻的原生 dialog Sheet 按需展示，头部与操作底栏固定、长表单内部滚动。选中标记在按钮层，Hover 不遮盖，键盘焦点独立可见。
- **开发页分组**：保留 `od-form-field` 内 gap 4px，字段组间 12px、独立区域间 16px、按钮 toolbar 8px；本地项目将标签、字段、说明/错误组成真实关联组。来源/网页与状态/结果保留自身关联关系。运行、Stop、草稿、安装和 Native 连接业务不因排版调整改变。
- **统一与例外**：不预设每个 Tab 都使用卡片。工作流保留会话/输入区，云控保留连接与授权分区；现状无缺陷仅检查，不机械改版。ToolHost 通栏、iframe、局部官方主题、独立页面及编辑器例外按原 owner 保留，不迁移旧 HTML/Vue 工具、不建立第二套 Tokens/React Root。
- **规范分工**：[R27](docs/architecture/ui-layout-conventions-r27.zh-CN.md) 维护跨界面 Token 语义与间距所有权；[R20](docs/architecture/sidebar-design-system-r20.zh-CN.md) 维护 Side Panel 字阶、密度、集合/参数组合、状态/响应式及五 Tab 真实组件映射；本节维护本轮决定和状态。可执行值仍只归 `design-tokens.css`，公共视觉归 `design-system.css`。
- **证据与缺口**：离线预览和上一轮真实记录分别保留在 `artifacts/five-tab-layout-20261110/`、`artifacts/five-tab-task-params-20261110/`；本轮最终证据归 `artifacts/five-tab-core-ui-20261111/`。ego 原生面板仍被并行任务占用，因此释放本任务 TaskSpace，使用独立临时 CFT 155 Profile 加载同一 `dist/development`，复用原 dev watcher。经原导入→真实验证→本地可用→安装链的只读 Controller fixture，已在最新候选完成 Sheet 填参、成功 Run、可见结果及真实 Stop；持久回执均为 released。修正字段后仅清除该字段所属的过期错误摘要，保留其他字段及权限/运行错误，定向 Node 检查 112/112 通过。历史百度验证页与 `E_DOCUMENT_REPLACED` 未重放，不计为任务成功。OS 实体 IME、Native 本地项目连接、主题/缩放矩阵和 production 均为 `NOT_TESTED`。
- **独立复评（2026-11-11）**：最终候选 `63879a1c65e8c698dcc451817f1151cd9b4bcb873ec1979083a5017bd3d4da13` 在真实原生 Side Panel 默认 360×819 CSS px、DPR 2 下获 `PASS_SCOPED`，综合 96.1/100、八维最低 95，无阻断项；详见[评分及补充](artifacts/five-tab-core-ui-20261111/review.json)、[运行身份与哈希](artifacts/five-tab-core-ui-20261111/candidate-binding.json)和[操作证据](artifacts/five-tab-core-ui-20261111/README.md)。上一轮 `3746be42b794` 的 95 分属于历史记录。临时 Profile 的 `E_USER_SCRIPTS_UNAVAILABLE`/官方网页增强预装未完成仍为环境缺口，不把本轮布局和只读任务验证扩大为全部安装或发布验收。
- **范围与交付**：只在现有 `main` 修订三份规范及对应共享 CSS/React 组合，测试 fixture 归 `tests/fixtures/tasks/ui-readonly/`；复用已有预览入口和 dev watcher，保留其他 dirty，无提交推送。截图、失败分类、候选绑定与回执保留在上述 artifacts。源码、发布产物与原生运行证据分别报告，不以其他作用域评分代替本轮验证。

## 开发 Tab UI/UX（2026-11-14，独立作用域）

- **最新目标与状态**：原规格11.7优先；用户已授权把本轮开始时认可的 `prototypes/sidebar/develop/index.html` 落实到原有组件。普通多行输入→必要运行位置→原 Run/Stop→状态/结果为核心；保存、历史、安装和诊断按任务进入，草稿保持挂载。本任务未修改原型，收尾观察到其并行更新，版本差异归原规格11.7；不增加执行/权限/存储体系。
- **当前完成标准**：代码可审阅、原 owner 定向行为通过、现有开发更新与画面来源可核实、未测边界准确。独立评分、production、完整矩阵及真实安装不属当前阶段。5项 React/布局、22项核心 owner 定向检查通过；另67项受影响运行保护检查有效。扩大检查遇到的旧断言和编译输入缺项保留失败记录，不报告全套通过。
- **仍有效的布局原则**：只考虑白色亮色，复用现有Tokens/组件/React根与原业务权限链。父布局负责兄弟间距，字段组负责label/control/help，公共折叠正文负责inset；4/8/12/16px是实现约束，不单独构成体验完成。下方已实施记录和旧环境/服务状态都是上次观察，开始产品实施时重查，不用于本轮离线提案自证。
- **最新排版决定**：只考虑白色亮色调，优先修开发 Tab；不再进行主题或配色方案比较。代码类型与运行环境采用同一标签列，编辑器默认高度缩短 35% 并保留纵向拉伸，运行方式说明与参数归编辑器内次级折叠，保存管理的 Revision/按钮及脚本列表对齐。一级区域复用有边框的共享折叠，内部次级区域使用 flat；「我的」同级折叠与扩展详情同步复用公共规则。先验证离线提案再同步实际源码，最终预览及 320→208px 测量见 `artifacts/developer-ui-ux-20261114/workbench-source/` 和 `source-preview-checks.json`；本增量未构建或验证当前安装态，旧 revision 与评分不覆盖它。
- **状态与目标**：Implemented / native verification pending，按用户最新细化需求实施编辑区及本地项目 UI；让开发首屏围绕“选择来源 → 编辑或选项目 → 明确运行/调试 → 看结果”展开，减少重复说明、同权重操作和嵌套管理。详细范围、决策与完成标准归[目标规格](docs/framework/developer-ui-ux-r1-20261114.zh-CN.md)，行为条件归[测试规格](docs/framework/developer-ui-ux-r1-test-spec-20261114.zh-CN.md)。本轮已实施运行环境两项分段、代码 placeholder、说明与可选源码关联层级；版本/历史全面重组延期。
- **用户与使用环境**：直接编辑代码或调试本地项目的开发者；先服务实际默认宽度、正常缩放的 Side Panel。保留 Standard/Developer、JS/JSX/Vue、Controller/Page 及旧 HTML/Vue 工具；完整响应式矩阵和 production 验收延期。
- **信息架构**：来源、当前目标和真实可用状态先于创作区；本地项目状态后紧接有效的连接/恢复入口，再放调试、保存和可选源码关联。组合项目帮助给出本地调试、组合包导入与获准网站验证的具体路径。版本/安装、历史和权限管理按对象进入二级视图，轻量技术值继续按需折叠，不再把复杂表单堆进一个“高级”长面板。
- **视觉与组件**：安静、紧凑、明确；复用 R20/R27/R33、唯一 Tokens、`src/ui/react/` 和现有 `od-*`。同级标题、字段、按钮、提示与邻近 Tab 一致；不新建皮肤、组件包、Root，不靠缩小字体、图标或删除功能换取密度。
- **交互与状态**：编辑、来源切换和保存不自动执行。当前网页与实际运行目标、草稿与冻结版本分别表达；Run/Stop 绑定原 owner。二级返回保留草稿、选择、结果、滚动与焦点；错误/未知持续可见，成功回执使用现有通知。loading、empty、blocked、running、success、failed、unknown 按真实状态呈现。
- **可访问性与内容**：文字主操作、具名次级入口、可见焦点、字段关联错误；保留原 IME、键盘与可信手势。普通说明一句表达下一步；精确身份、授权范围与后果不因精简而省略。正文/控件对比度按现行 AA 合同，长源码和日志在局部滚动。
- **证据与开放项**：已通过真实 React/CSS 的 360px 源码预览检查运行环境选择、键盘焦点、源码保留、类型提示及本地状态顺序，证据归 `artifacts/developer-ui-ux-20261114/`。续接已将本机连接按钮前移约 159px，验证刷新后 Tab 直达连接、可见焦点、Enter 回执、首次帮助开合和中文草稿保留。Ego Page API 未暴露新原生面板，原生 UI inventory 超时；实际加载路径、已应用 revision、原生 Run/Stop/Native/IME 与 production 仍为 NOT_TESTED。原 watcher 已退出，旧 Web Flow pin 失败不再阻断；并行 Page 刷新 writer 编译重排后因堆内存耗尽退出，本任务确认其退出与守卫释放后沿原入口恢复 npm run dev（PID 65678），最终原 dist/development 产物包含新帮助文案，revision aeba5af1596c…；未并发第二 writer、覆盖加载目录或修改 pin。直接编辑历史有限视觉复评 80→93/100，本地续接复评及四层证据见目标/测试文档；均不代表正式 ≥95。4/12/16px 间距、输入边框同色和末尾内容可达复用原预览证据。

## 统一确认与反馈（2026-11-09，独立作用域）

- 状态：已形成现行设计/开发规范并获用户要求在新对话实施“业务代码修改＋框架公共能力”。原对话仅同步文档/Skill/规范与交接，不改产品源码、不运行浏览器或构建，不覆盖其他设计作用域。
- 目标：常规反馈不打断；确需选择的简短确认使用当前宿主内的统一浮层，不向业务正文插入顶部 sticky 确认块。表单、复杂差异审阅保留原业务 owner 的界面。
- 业务负责确认必要性、目标/后果/文案、草稿与数据版本、最终执行及回执；框架负责通用展示、可访问性、来源标识、实例隔离、取消和生命周期。普通确认仅返回选择；权限审阅继续由原 Authority 和可信真实点击路径执行。
- 复用：现有 `OpenDeskTool.ui.notify`、`setState`、Bridge/Host、Tokens、`src/ui/react/` 和已安装的 React Aria。异步 `ui.confirm` 已具 Bridge/Host 与可信 adapter 源码实现，实际支持仍以目标 Host 初始化声明为准，完整签名/状态只在[原 SDK 文档](docs/api/sidebar-tools.zh-CN.md#异步确认opendesktooluiconfirm拟议尚未实现)维护；交互与 Promise/then 规则只在上述公共合同维护。旧 HTML/Vue 不因使用确认能力引入 React。
- 交互：丢弃/删除默认焦点落“继续编辑／取消”；Escape 等同取消；破坏性确认不靠点击遮罩关闭；单宿主最多一个决策浮层，无无限队列和嵌套弹窗。关闭恢复原 iframe 内的可用触发点或宿主安全焦点，不跳页面、不清草稿。
- 编辑器关闭前确认由业务 adapter 暂时让出模态锁并保留原实例/字段，取消恢复，确认核验后才清理退出；已有待决确认或权限审阅不被替换。接口仅在明确不支持且无宿主待决 UI 时退回原安全本地确认，busy、取消、超时和撤权不触发第二弹窗。
- 异步：同步 guard/boolean adapter 不机械加 async；显式判断 action，return/await 后续操作、消费拒绝，pending 恰好一次结算；finally 只清原请求，确认后再验原对象/版本。保留正确 then，不做全仓语法迁移。
- 边界：不增加浏览器同步 `alert/confirm/prompt` 或沙箱 `allow-modals`；动态内容只以纯文本经原 Bridge 展示，不把业务 DOM/回调提升到可信 React。普通确认不得签发权限、模拟用户激活或重放未知操作。
- 实施节奏：先 Web Flow 离开草稿的框架入口、一个旧 HTML 工具和一个 React 工具的普通确认，包含现有编辑器关闭确认的最小接线；其余消费者分 owner 渐进迁移。普通数据确认和可信授权审阅共用展示原语，保留各自决策链。页面增强及复杂表单本体不纳入首批迁移。
- 与旧规范关系：R50 的浏览器同步弹窗禁令与安全保护保留；“所有确认必须行内”的展示选择由本目标调整。实施时同步原权威权限/交互文档与有效行为测试，不删除安全断言来迁就新 UI。
- 完成条件与证据：以相邻目标方案、测试规格中的 P0 为准；当前产品测试全部 `NOT_TESTED`，不设置或宣称产品评分、production 或安装验收。

## Source of truth
- Scope: 以下状态仅属阅读目录多语言 R23 历史，不是全局 UI 或官方风格试点状态；本轮入口见上方索引。
- Status: Language-only implementation approved by independent reviewer — 阅读目录多语言 R23；初版布局模拟保留为设计历史，不实施控件或核心功能重构。
- Last refreshed: 2026-10-25
- Latest user correction: 本轮只确保多语言设置正常及必要显示修正，不过度修改阅读目录。索引、章节提取、模式算法、定位与滚动、拖动、AI 会员/合作内容等正确核心功能保持；设计模拟不能成为改写这些功能的依据。
- Primary product surfaces: 阅读目录沙箱、可信网页悬浮目录、语言面板、可信工具设置。
- Evidence reviewed: AGENTS.md；R27/R28/R33；examples/sidebar-tools/reading-toc/preview/README.md；docs/framework/workstreams/locale-ux-r22.md；本轮 CFT 实际操作及 artifacts/reading-toc-ux-r23/baseline-settings-ja.png。
- 历史 R1.7.4 原型保留历史身份；用户最新纠偏覆盖固定 CONTENTS、仅图标及旧 PASS。产品事实仍归工具 README；本文件只约束本轮跨面体验。

## Brand
- 安静、直接、可靠。沿用 OpenDesk Tokens，不增加颜色或按钮体系。
- 信任信号：实际生效语言、可理解的范围、保存回执；避免营销说明和技术诊断抢占首屏。

## Product goals
- 先以可点击设计模拟确定主流程，经独立评审后实施并生成正式同源预览。
- 优先修复三种语言的相关可见产品文案与设置传播；重复显示控制、竖排标签只作最小显示修正。
- Non-goals: 五 Tab 全文翻译、采集、AI 能力开发、权限体系重写、production 发布、宽度×缩放矩阵。
- Current success signals: 三种语言的选择、实际生效范围、维护隔离及持久性正常；阅读目录原有核心行为不退化。用户收窄范围后，不再以完整六维95分驱动额外改造。原量表保留，范围外记 OUT_OF_SCOPE，未测记 NOT_TESTED，不报告整体95达标。

## Personas and jobs
- 阅读者在文章中跳转章节、暂时隐藏浮层、选择熟悉语言；工具管理者偶尔维护翻译包。
- 正常 Mac CFT 窗口与默认缩放；文章正文和章节名属于用户内容，永不翻译。

## Information architecture
- 以下布局、Switch 与分段选择是早期设计模拟，不属于本次语言修复的实施合同。实际产品保留原有内容层级、模式控件和全部核心功能。
- 扩展 → 阅读目录 → 语言 / 设置 → 返回阅读目录；返回列表后可重开。
- 单一工具栏标题。目录正文只有模式组、必要来源选择、章节及状态；沙箱刷新仍保留。
- 设置：工具语言入口 → 网页显示（网站、仅此页）→ 网站可用性 → 默认折叠例外 → 通用应用管理。
- 语言面板：默认语言 → 此工具语言 / 生效结果 → 状态反馈 → 默认折叠语言包维护。维护预览、取消、确认独立呈现。

## Design principles
- 一个展示面只有一套模式选择，网页和 Side Panel 各自保留。刷新只在 Side Panel。
- 标签横向可读；互斥模式用分段选择，二态设置用 Switch；状态和作用范围紧邻控件。
- 显示偏好、网站停用、工具停用语义各异，不能互相代替。维护目标不切换语言。

## Visual language
- 色彩、字号、圆角来自 src/ui/design-tokens.css；可信 od-* 组件来自 design-system.css。
- 4/8/12/16px 节奏、单 gutter、单层卡片。禁止压缩字号或隐藏功能凑布局。
- 模式短标签为主要/当前/全部/AI，完整名称供 tooltip 与可访问名称；英文 Main/Current/All/AI，日语 主要/現在/すべて/AI。
- 只有选择状态可动，尊重 reduced-motion；不加入装饰图或重复图标。

## Components
- 可信 React 根仅 src/ui/react/；复用现有 Switch、Button、原生 select、od-segmented、UninstallDialog。
- 设计稿复用 Sidebar Preview Kit；补入现有 shared-ui 视觉快照，不创造第二引擎。设计行为仅内存模拟。
- 沙箱及 ShadowRoot 独立映射相同语义；禁止导入完整宿主 CSS、Preflight、特权代码。

## Accessibility
- WCAG 2.2 AA 相关检查；控件有可见标签、名称和状态，反馈使用 status/alert。
- 分段组采用单选语义及方向键、Home/End；Switch 支持 Space；禁止四选一变二态。
- Escape/取消/关闭回到原触发器，禁用触发器则回到最近可用标题；进入子视图聚焦标题。
- 焦点可见，正文不因语言或模式切换滚动；章节点击才定位；拖动手柄与 Home 归位保留。

## Responsive behavior
- 自然换行、min-width:0；不以文字竖排换取空间。正常窗口验证；专项尺寸/缩放 OUT_OF_SCOPE。
- 触摸不依赖 hover 才能发现核心动作。tooltip 只补充，不承载唯一名称。

## Interaction states
- Loading: 明确等待，禁止未就绪写入；Empty: 无可识别章节，保留刷新。
- Error: 失败说明与显式重读；未知写入锁定写操作，重读不重放。
- Success: 显示实际保存语言及范围；关闭/重开保留选择。
- Disabled / permission: 原生限制、工具停用、站点停用、页面排除分别说明，禁止伪造授权。
- 缺语言包显示请求与实际回退语言；缺词显示回退原文及补全入口。导入必须先预览再确认，取消不写入。

## Content voice
- 简短操作语句。全局管理跟随全局；阅读目录业务及专属设置跟随工具实际语言。
- 语言面板通用安全提示使用可信内置译文；动态包无权覆盖。支持简中、English、已安装日本語。
- 繁中等其他选择明确真实支持/缺失与回退，不能静默混用、删语言或删功能制造通过。

| 语言选择 | 影响区域 | 实际生效语言 |
|---|---|---|
| OpenDesk 默认 | 通用语言管理、安全反馈；选择跟随的工具 | 简中 / English / 日本語可信译文；其他语言明确回退 |
| 工具跟随 | 阅读目录业务、专属设置、网页悬浮目录 | 由原 locale 服务解析全局偏好及可用资源 |
| 工具独立 | 仅阅读目录的以上区域 | 所选工具语言；缺包/缺词明示实际回退 |
| 维护目标 | 添加、补译、导入、导出、删除语言包 | 不切换界面，不改变工具或全局选择 |

## Implementation constraints
- 现有 locale 服务、安装/包身份、来源锁、权限、撤权、未知结果及不自动重放合同保持。
- 语言变化只重绘文案，不索引、不重置滚动、不重复注入、不扩权。SDK 缺口未证实不扩 Runtime。
- 实施以现有目录数据与事件处理为准；预览中的文章、模拟状态与模式过滤不是新的业务规范。不将模拟器的模式默认值、拖动吸附、AI 占位或权限状态替换真实实现。
- 只在 main；保留 Mind Map README 并行改动；不推送、分支、worktree、PR。
- 复用 PID43534 watcher 输出 dist/development；CFT64677 与43111服务保留。工具修改走候选→定向检查→同源晋升，真实安装须核对同候选。
- 预览截图、操作记录、候选身份和评分证据在 artifacts/reading-toc-ux-r23；可编辑稿与生成同源 HTML 明确分级。

## Review rubric (frozen before design)
每维 100 分，以下五项各 20。独立 reviewer 按实际交互、截图、源码逐项给分与扣分依据。小缺陷扣1–5，影响操作扣6–15，缺失/失败扣16–20；无证据记 NOT_TESTED，不得用平均分或改量表通过。任一阻断失败不通过。

| 维度 | 五项固定检查 |
|---|---|
| 操作便利与可发现性 | 主入口可见；设置返回；语言即时反馈；模式/章节可用；低频维护可找 |
| 信息架构与内容层级 | 单标题；模式不重复；日常与维护区分；显示与可用性区分；错误就近且可恢复 |
| 排版、控件和视觉一致性 | 横向可读；二态 Switch；四模式分段；Token/组件一致；无冗余卡片及图文重复 |
| 语言覆盖与作用范围表达 | 简中完整；英文完整；日语完整；跟随/独立/全局范围；缺包/缺词与维护目标 |
| 键盘、焦点、反馈与错误恢复 | Tab/Space/方向键；返回/关闭焦点；导入取消确认；失败/加载/权限；未知结果不重放 |
| 实现复用及边界清晰度 | 原预览引擎；宿主React/工具所有权；原服务和安装身份；CSS/执行世界隔离；源/包/安装/证据一致 |

## Open questions
- 基线未复现多个悬浮挂载；Side Panel 与网页各有一个合法展示面。基线实际安装1.0.10，新候选1.0.11须经原可信更新流程核对。
- 基线约70仅为历史体验初评。当前复现明确包含固定 CONTENTS、日语设置中文、旧眼睛按钮竖排与显示控制重复，不能称为正式评分。

## AI Proxy 直连操作（2026-11-09，独立作用域）

- 用户最新决定覆盖本轮早先的“首次直连弹窗”：选择只保存，明确点击“启用直连／切换为直连”后直接执行，不再弹“允许并记住”。侧栏及管理页就近说明所有标签页绕过系统代理、暂停恢复原设置；真实回执确认后才显示已应用。
- 仅已准入的固定可信 AI Proxy UI 与原生用户激活可复用该明确操作，沿原 Host 发放精确、一次性 intent，不新增长期线路授权。无激活只提示再次点击，不补第二个弹窗、不自动重放。沙箱调用不能自报可信来源，新代理线路／范围继续原敏感审阅，安装身份、权限、撤权及未知结果保护保留。
- 暂停／跟随系统不增加普通确认。新代理审阅的取消／Escape 仍是正常选择，不显示失败警告、不冒充成功。交互预览 `projects/ai-proxy/preview/direct-consent-preview.html` 已同步，复用当前业务组件和原策略，仅在 SDK/Host 边界模拟可信来源、激活及状态；不是原生安装或真实路由证据。当前冻结候选与验证见项目 README 顶部。

## AI Proxy 管理设置（2026-10-31，独立作用域）

- Status：最新添加入口与草稿交互同源 Preview 复评完成，UI及实现各六维最低96，保留三项低优先级建议；当前候选、实测与复评维护在 `projects/ai-proxy/README.zh-CN.md` 第 17 节，固定量表保留于历史设计节。此增量不改变上方阅读目录及下方诊断页合同。
- 证据：当前 43263 同源 Preview、`src/Settings.tsx`、`src/ui/OptionsShell.tsx` 与 `src/styles/options.css`。观察到横向七栏目隐藏入口、嵌套大留白和添加动作挤压列表。
- 决策：原生栏目选择、单层内容、添加代理优先、代理列表先于低频路由管理；复用 Tokens / Shared Button、原 navigation guard 与内存 Mock。保留三语、七区、返回/取消/焦点和保存不应用。
- 本轮只评分同源预览；正常默认缩放，尺寸矩阵/正式包/Native/真实代理均不因评分自动恢复。没有证据的项目不能赋分。

### 本轮导航与规则编辑增量（2026-10-31）

- **最新用户纠偏（优先于下方历史 Tab 决策）**：顶部不再新增「代理面板／管理设置」Tabs；复用 QuickPanel 齿轮和管理全部入口。设置栏保留七区选择、更多与关闭设置（返回代理面板），框架返回继续返回扩展列表。两种退出目的通过标签区分，沿用同一草稿／busy guard。
- **本轮密度和间距合同**：按 R27 使用现有 `--space-1/2/3/4`（4/8/12/16px）；章节16、同组12、同行操作及标签到字段8、名称到次信息4。当前侧栏适配 `sidebar-settings.css` 是这些受影响区域的唯一布局 owner；父容器 `gap` 负责间距，子项对应 margin 归零，不继续增加补丁文件或 `!important`。
- 代理列表采用选择标记＋名称/连接地址两行＋编辑/删除图标；本地客户端、需认证、已应用等状态放在行内图标，保留 title、ARIA 与应用/已选语义区别。规则列表采用域名/匹配范围、目标/优先级两行，启用状态用带说明图标，编辑/删除为34px图标按钮。失败、权限与实际代理状态保留明确文字。
- 管理页仅一处标题/计数和添加主动作。最新添加入口续作移除混合“其他添加方式”菜单：手动添加为文字主操作，旁边“导入配置”图标加文字进入配置备份；订阅记录与本地客户端有明确文字入口，PAC留在独立折叠区。“订阅与客户端”栏目和主面板空态名称说明实际职责，三语同步。复制/刷新菜单保留文字与图标；重复编辑/删除/关闭复用34px ProxyIcon/Shared Button，关键保存/应用/确认保留文字。
- 续作沿父gap统一章节16、字段分组12、标签8、记录内4px，FormField提供稳定语义类。移除旧菜单CSS、采集代理22px子margin、规则表单额外margin及编辑器页脚底色；PAC表单和两行记录沿用同一节奏。来源表单Cancel/Escape按revision确认，实体编辑按local ID直达并返回原焦点；规则来源与字段12px，长目标由既有动作焦点/悬停展开，Escape收起，动作位置保持稳定。危险图标hover保留危险色；连续添加仅在保存/revision成功并清空字段后恢复地址焦点。当前候选、实测与独立复评见项目README第17节；旧评分不覆盖此候选，安装和真实流量证据独立。
- 执行门禁：隔离旧PC布局的级联优先级，仍保留原公共控件样式；在同源Chromium中读取computed style，核对标题/列表无叠加margin、列表内容等高、单层表单gutter及字段gap。不能用“引用了Token”代替实际布局验证。当前结果与候选见项目README第15.2节。

- 以下保留历史导航方案及续轮依据；与上方最新用户纠偏冲突时以上方为准。
- 历史用户要求：修复框架与业务双返回，并完成独立专家六维各 ≥95 评审；前述旧预览分数不覆盖本候选。
- 当前实测：日常 Chrome 同时出现框架返回扩展列表与业务「← 代理面板」。采用框架唯一返回 + 稳定「代理面板｜管理设置」业务 Tab，取消业务返回栏；无需改变共享 Host 准入。
- 规则列表与添加/编辑分视图；当前网站快速添加保持自身独立表单。域名、子域范围、路由目标、保存结果按操作顺序组织；清晰标出保存不应用，保留原身份、优先级、启用状态、三语和草稿保护。
- 复用原 React、Shared Button、Tokens、navigation guard 与现有同源内存 Preview；无新依赖、权限、Router 或安装器。正常窗口默认缩放；真实流量、production、正式包、宽度/缩放矩阵仍延期。
- 固定六维：布局与密度、信息层级与可发现性、视觉与可读性、操作/草稿/反馈、键盘与焦点、组件复用与边界；每维按五项各20评分，六维分别 ≥95且无阻断。候选截图、真实交互、源码与输入SHA共同绑定；未知项不计为通过。详细量表和结果写回项目README与本轮证据。
- 续轮细节（2026-10-31）：规则行操作及删除确认包含域名与匹配范围；管理编辑页保留原规则来源；Quick／Settings 统一标题、单层外框、字段提示留白和高级焦点。保存错误留在所属表单，输入修正只清对应本地冲突；删除后复用原返回逻辑恢复邻项／添加焦点并清除旧保存回执，保留 revision／generation 保护。沿现有 Button／FormField／i18n，不增加组件层或改变保存不应用语义。最新候选、独立复核及未测边界见项目 README 第 15.1 节，旧评分仅作基线。

## Browser Fingerprint HTTP 诊断页（2026-10-30，独立作用域）

- Status: 本地页面核验及独立评审完成，八项最低95、平均97；见 `projects/browser-fingerprint/evidence/http-diagnostic-20261030.zh-CN.md`。以下仅约束 Browser Fingerprint 诊断页，保留上方阅读目录设计和并行工作。
- Source of truth: 用户明确选择独立 HTTP 诊断页，并要求已完成的扩展不过度修改。依据：`projects/browser-fingerprint/README.zh-CN.md`、R27、`src/ui/design-tokens.css`、d57 Host 实测。
- Brand / Product goals: 清晰、克制、以网页实际值为信任依据。HTTP 网页自行采集 UA、低熵 UA-CH、语言、时区和视口；扩展仍负责配置/应用/停止/可信报告。不是反关联或网络身份认证产品。
- Personas and jobs: QA / 本地化测试人员在同一目标 Tab 上观察应用前、应用后、停止后的真实差异。
- Information architecture: Browser Test Lab 链接 → 独立诊断页；顶部目标来源及采集状态 → 实际值与基线对比 → 可展开的核验步骤/能力边界。主要动作：立即读取、暂停自动读取、记录基线、复制/下载报告。
- Design principles: 本页值不消费扩展配置/消息；读取标量语言后读取完整数组，显露缓存不一致；基线只称“本页基线”，不能假定打开时未被覆盖；差异仅表示变化，不推定预设成功。
- Visual language / Components: R27 单 gutter、14px 正文、4/8/12/16/24px 间距；独立 CSS 映射 canonical Tokens，不加载可信 Host 样式或 Tailwind；原生 button/checkbox/details，表格包含字段、当前值、基线及状态。实际值为视觉主体，无装饰图。
- Accessibility: WCAG AA 相关项；语义表头/标题、可见焦点、文字状态；自动刷新不替换控件/抢焦点，不逐秒朗读时间戳；复制失败提供可选原文，保留键盘操作。
- Responsive behavior: 正常 Mac 窗口与默认缩放；长 UA 自然换行，表格局部滚动。专项宽度/缩放矩阵 OUT_OF_SCOPE。
- Interaction states: 首次采集后建立本页基线；单字段异常显示不可读取，不伪造值；隐藏页暂停采集，回到前台读新值；手动暂停可随时立即读；基线仅内存保留，刷新页面重新建立；复制失败可展开报告手动复制。
- Content voice: 中文优先，英文技术字段保留；“变化 / 与基线一致 / 不可读取”不写 PASS。HTTP Accept-Language 为 UNVERIFIABLE；Geolocation UNSUPPORTED；不采集公网 IP。
- Implementation constraints: 新增普通静态 HTTP 页面及自身资源，不使用 Chrome/SDK/特权注入、远程依赖、持久存储或遥测，不改扩展工具字节与 Host。复用现有 43111 静态服务；不重建 Browser。目标版本仍 0.2.2。
- Test/screenshot expectations: 单字段异常、完整数组差异和不可读取不能判一致的最小行为测试；真实 Mac 页面读取/暂停/基线/复制/导出及德国应用/停止可见验证；独立 reviewer 对源码、实测证据和截图评分。
- Review rubric: 功能、真实执行、数据一致性、生命周期、权限安全、交互、安装兼容、测试证据各100分，均≥95才称此页评审达标；缺证据记 NOT_TESTED，页评分不替代扩展发行验收。
- Open questions: 用户已选择独立 HTTP 页；任意网页悬浮面板不在本轮。新页公开托管地址未指定，先交付可访问本地 HTTP URL。

## 扩展设计模板与风格组合（2026-11-01，独立作用域）

### 当前获批官方风格试点（2026-11-01）

- Status：**最新v7柔和按钮与配置库；回放、评审及固定入口同步实况见交付记录**。当前结果见[交付索引](artifacts/sidebar-preview-kit/official-neutral-20261101-v7-evidence/README.md)。v3 虽通过网页回放，但两位独立评审未放行；失败原件保留，不沿用历史高分或来源匹配记录。
- 当前候选目录：`artifacts/sidebar-preview-kit/official-neutral-20261101-reviewed-v5/` 与 `artifacts/sidebar-preview-kit/official-scrapyjs-20261101-reviewed-v7/`。最新工具采用浅灰主操作、白底选中Tabs与配置库，保留原草稿与安全合同；公共Runtime-only尺寸/显式浅色语义色与导航持续态已核对。离线评审不能证明用户视觉终验、真实AI、安装或production。
- 官方定义：[create?base=aria&preset=b0](https://ui.shadcn.com/create?base=aria&preset=b0) 的默认 style 为 **nova**，Neutral 是配色，base 为 **aria**；生成配置 style 为 **aria-nova**。`b0` 原始字体为 Inter；列表中的命名 preset `Nova (Aria)` 使用 Geist，不能混称。全站默认 base 仍是 Base UI，没有核实出名为“Neutral UI”的官方 preset。依据：[React Aria 更新](https://ui.shadcn.com/docs/changelog/2026-07-react-aria)、[官方默认配置](https://github.com/shadcn-ui/ui/blob/24a16429815cc4d691f38b49d0f4ffc11a9daef4/apps/v4/registry/config.ts#L173-L189)。完整出处与状态合同集中于[预览套件官方风格合同](docs/api/sidebar-preview-kit.zh-CN.md#官方风格试点合同2026-11-01)。
- 唯一实现来源：`src/ui/design-tokens.css` 的显式 `.od-theme-shadcn` 持有 Neutral 变量与 `od-*` 映射；`src/ui/design-system.css` 持有组件外观。字体、尺寸及其他可执行数字只在 CSS 维护，文档仅解释来源与偏离，不另建 token 表、主题引擎或共享包。系统字体代替远程 Inter；字段统一14px，属于侧栏密度偏离，不能声称与官方 `text-base md:text-sm` 完全相同。
- 组件事实：Button 显式 `base='aria'` 才使用 RAC，否则原 native 路径保持；新增 Input/Textarea 使用 RAC，Switch 是真实 RAC。原生 select、现有键盘 line tabs、inline confirmation 仅适配官方外观，不称 RAC Select/Tabs/Dialog，不虚构公共导出。保留原交互、草稿与未知结果保护。
- 作用域：显式主题仅影响选择接入的表面；公共组件参考展示浅/深，工具内容及可信宿主/辅助区保持浅色。Portal 留在当前 ownerDocument 的主题容器；不跨 iframe/ShadowRoot，不把沙箱节点提升到可信 Host。
- 交付与归属：既有生成器输出完整五件套，不手改生成 HTML；ScrapyJS 保持原 owner，不复制业务 CSS、源码、权限或安装逻辑。现有阅读目录、AI Proxy、Fingerprint 独立合同和并行 dirty 内容保留；本次文档更新不证明运行、安装或评分通过。

### 先前诊断、候选与评分历史（不覆盖上述试点）

- Status：基础预览交付与离线操作已有证据，公共视觉系统未定稿（PENDING_VISUAL_ACCEPTANCE）。用户最新指出按钮变体、输入框边框与排版不佳，K03/K09 已重新打开；旧两位 AI 子代理最低96保留为历史评审，不能覆盖当前反馈。仅影响离线设计起点，不覆盖其他工具源码、正式包或安装状态。
- 用户目标：解释风格模板/Skill 与 React Shared UI 的关系，提炼 Cookie Editor、书签管理中已认可的体验，并设定适合开发阶段的测试条件。
- 证据：`scripts/templates/sidebar-preview.html`、`scripts/sidebar-preview-kit.mjs`、`scripts/preview/sidebar-component-recipes.jsx`；Cookie Editor 的 `app/CookieEditorApp.jsx`、`src/react.css`；书签真实 owner `projects/bookmark-manager/src/react/{App.jsx,style.css}`。两者均复用共享控件，另有业务布局；Cookie Editor 的局部主题明确不导出为平台默认。当前工作树有并行修改，不以旧包或历史评分证明它们本轮通过。
- 基线：原模板最短新建→保存→编辑取消→删除确认可用；离线 CFT 报告及浅/深截图在 `artifacts/sidebar-preview-kit/style-composition-20261101-before-evidence/`。视觉问题是重复条目卡片与带边框的编辑动作造成层级零碎，不是 React 运行故障。
- 方案选择（维护者判断）：沿用唯一 Tokens、Shared UI 和原生成器，补齐页面组合规则；本轮将条目改为一个集合表面内的紧凑行，行操作降低视觉权重。仅写抽象风格口号不能改变默认示例；复制 Cookie/书签 CSS 会把业务主题、树行为和特权依赖误当成公共接口，均不采用。
- Goals / success signals：能从一个入口找到模板、真实控件、成熟来源与检查方式；完整预览载入后可见、可点击；默认内容优先、单层集合、一个主要动作；真实演示分组搜索、详情、编辑、渐进字段、保存/取消、设置与焦点恢复。六维独立方案评分各 >95 且无阻断项才称方案达标。
- Non-goals：批量改版工具、迁移 HTML/Vue、创建共享包/新组件 API、调整全局 Tokens、修改 SDK/权限/Host、正式安装或全产品评分。组合配方不宣称已新增 List/Field/Dialog 组件。用户最新要求已将本轮离线方案的独立评分纳入范围。
- Personas / IA：扩展作者按任务选择列表、表单、详情或设置组合；用户先看内容与主要操作，低频技术信息渐进展开；导航仍归原宿主和工具各自 owner。
- Visual / components：共享色彩、字阶、圆角、按钮及焦点语义；区块16px、集合内8px、CardContent12px，组件内部以当前 canonical CSS 为准。一个容器负责一层留白；局部主题留业务作用域，不提升成全局默认；复杂树和菜单沿原消费者。
- Accessibility / states：文字动作保留，行操作的可访问名称含目标对象；错误就近、确认先聚焦取消、退出恢复触发者。空/失败/未授权/撤权/忙/长文本保留；正常“已就绪”不再占首屏，状态节点仍可播报实际操作反馈。
- Responsive / motion：正常窗口默认缩放、自然换行，不依赖 hover 才显示核心动作；宽度/缩放矩阵 OUT_OF_SCOPE，不加装饰动效。
- Implementation / tests：先复用现有模板合同与离线浏览器基线；修改后运行同一 Node 合同、重新生成并 check、离线真实输入及 computed style 对照。观察器只随集合 DOM/按钮变体更新选择器，并检查集合数量、无逐条卡片、动作名称与间距；不新增文案正则测试，不构建 Browser。通过条件和证据分级维护于 [预览套件合同](docs/api/sidebar-preview-kit.zh-CN.md#风格来源与页面组合2026-11-01)。
- Open questions / limits：用户未指定其他待改工具，本轮仅完善公共设计起点；真实模型附件回收、当前两参考工具安装、Native 和 production 为 NOT_TESTED，后续仅由对应实际任务触发。
- 最新追问：用户指出模板组件本身也可能不够成熟；已补充公共/样板的边框、按钮密度、字重和表面差异。可执行 token 值仍归唯一 CSS，Markdown 维护选择/组合/证据；技术同源不等于视觉质量，不把测试 PASS 或本轮列表优化宣称为公共皮肤已统一。
- 本轮验证：原 Node 模板合同39项通过；生成候选 check 通过；CFT 156.0.8078.4 离线报告 `artifacts/sidebar-preview-kit/style-composition-20261101-after-evidence/browser-1793465461934/report.json` 的124项检查及29组样式对照通过，HTML SHA为 `f0ffc7d125cccaea197246b5d3422e1f694a4ccbd1dd064b7f8d1f42e75a812a`。来源/链接/差异检查通过。复验中的既有 Escape 焦点断言抢在 requestAnimationFrame 前读取，观察器已改为等待实际焦点条件，未强制聚焦或改组件；失败报告保留。定向代码评审未发现可行动问题，不代表独立审美评分。未提交/推送。

- 用户最新阶段：解决“预览点击什么都看不到”，用完整页面与真实内容评估方案，要求独立评分 >95。此前给出的模板 fragment 链接不能作完整预览，已改交付原生成器生成的 components.html；本机静态服务只绑定127.0.0.1，不占用产品 watcher。
- 复用结论：读取两条相关历史聊天后保留“真实组件+完整入口/组合”原则，用户否定过的历史98–100不沿用。当前从 CookieSearch/CookieRows/CookieAdvancedFields、书签 PreviewPane/Inspector/Tree 提炼模式，未复制业务 CSS、SDK、数据或权限逻辑。Atlas 已修复旧书签路径及 Cookie React 来源；历史来源等级保留。
- 当前离线候选：`artifacts/sidebar-preview-kit/expert-patterns-20261101-v2/`；components HTML SHA `9d30fbdddac0155aeef5d07b475048118a2fe8dffe42dd113678368973c64c7d`。HTTP200/text-html/响应与manifest逐字节一致记录于 `artifacts/sidebar-preview-kit/expert-patterns-20261101-evidence/delivery.json`。IAB 实际打开列表→详情→编辑，名称获得焦点、导航及主题/重置禁用。此证据为离线完整页面，不声明 SOURCE_HTML_INLINE 或 Native。
- 当前验证：`artifacts/sidebar-preview-kit/expert-patterns-20261101-evidence/browser-1793466183052/report.json` 135项行为/合同检查、29组样式对照通过，附分组、表单、深浅主题截图。初次编辑锁定的断言暴露 effect 锁定存在提交间隙，已改用 layout effect 在绘制前同步；原失败证据保留。两位独立评审基于文档既定六维评分，结果待回写。

- 本轮最终结果（替代上方 v2/v3 暂态）：完整离线候选为 `artifacts/sidebar-preview-kit/expert-patterns-20261101-reviewed/`，组件 HTML SHA `f6b5d8458b63f84f64657e7faf5f1406f038f1f1cfa087a4ec94a55c459061b9`。HTTP200/text-html/manifest字节一致，IAB实际列表→详情→返回来源行，已保留可交互页签。最终报告 `artifacts/sidebar-preview-kit/expert-patterns-20261101-evidence/browser-1793466702409/report.json`：150项定向检查、29组样式对照通过；原Node合同39项最近一次通过，check/来源/链接/diff检查通过。无产品构建或安装。
- 独立复评结论：架构六维97/97/96/97/97/97；设计98/96/96/98/98/97；均严格 >95，无剩余发现。意见原文在同证据目录 `expert-reviews.json`。已修首轮弱导航、取消回滚、筛选后焦点丢失、IME Escape保护、危险动作层级、交付命名与证据缺口；复评再修说明范围、焦点日志噪声和设置回执串页。评分限离线方案；系统IME、Native、production、真实AI、原工具安装与未来生成质量均未获此评分证明。未提交/推送。
- 目标与关键条件设置（用户本轮明确要求）：已在[唯一验收入口](docs/api/sidebar-preview-kit.zh-CN.md#目标与关键验收条件)固化 K01–K09：完整可见交付、唯一来源、代表性视觉组合、核心数据操作、草稿/键盘/焦点、恢复状态、完整 Chat 核心组合、隔离边界、两位独立评审各维 >95。当前候选与全部输入、HTML、观察器/报告/交付/评审身份只读核对通过，无漂移；复用已有有效操作证据，未重跑测试或启动产品。文档分别记录 PASS、NOT_TESTED、OUT_OF_SCOPE、失效与最小重测触发条件；本轮不扩大到全产品改版、安装或发布。
- 最新视觉纠偏（2026-11-01，优先于上方历史达标表述）：已核对 Button 为原生 React 封装、字段为原生控件 + canonical CSS、Switch 消费真实 React Aria；不能把 Shared UI 称为完整 shadcn 皮肤。公共输入边框与次要按钮边框共用偏重轮廓，按钮/标签650字重及层级接近，与 Cookie 作用域内更轻边框/compact 和书签自有布局不同。官方 Button/Input/Dashboard/Create 链接与具体后续顺序维护于[最新反馈](docs/api/sidebar-preview-kit.zh-CN.md#最新视觉反馈与框架事实2026-11-01)。建议先在原消费者做控件状态和一页完整资源界面的前后对照，再按原 owner 回写唯一 CSS/模板；当前不修改皮肤，不新增依赖、平行 Token 表、组件包或业务复制。新视觉候选、用户反馈闭合及复评未完成，不报告新的95+；本次浏览器连接未读回，诊断只采用同候选已有截图与源码。

### 开发 Tab 最新阶段：先选择设计路线（2026-11-14，优先于旧微调/评分目标）

用户质疑当前版本更丑，并指出反复4–5小时仍未解决。当前阶段改为**比较并确定推进方案**，暂停 content-proposal-v2 的继续微调、测试和评分；已有离线检查不证明用户视觉目标达成，历史评分不得推动继续实施。

推荐待选路线：从真实开发功能提炼一份与旧DOM/布局解耦的简明需求，保留功能映射；固定现有浅色设计语言、canonical Tokens、React/Shell/字段边界；以同一内容、360px内部视口生成3种结构明显不同的独立离线布局，先同屏比较和选择，再精修胜出项。需求分为常驻核心、按模式/状态出现、低频管理；保存不能因与版本同组而降为低频，阻塞原因和操作前必要权限披露不得隐藏。独立页面指提案文件，不意味着新增正式产品页面或替换开发Tab。

当前只确定路线，不生成下一套页面；正式产品源码、构建/watcher、安装发布、提交推送继续不在授权范围。候选评价与路线预估分分开；独立评分不能替代用户对可见效果的选择。

### 开发 Tab 当前覆盖：回到认可R2.6并简化需求（2026-11-14）

以[需求第11节](docs/framework/developer-ui-ux-r1-20261114.zh-CN.md#11-认可-r26-基线上的真实需求与离线提案当前有效)为当前唯一任务决定，覆盖上方冲突的尺寸、三候选、暂停生成与95+要求。只做离线需求与A/B提案，正式src/CSS/控制器/SDK、构建/watcher、安装发布、提交推送不在范围。

认可基线是 `prototypes/sidebar/develop/index.html`，不是content-proposal-v2。保留白底轻边框、紧凑选择、普通164px textarea和底部Run；默认输入→必要位置→运行/停止→结果。不增加IDE/文件工作区/Git/发布控制台。保存脚本为复用任务；固定快照/revision/hash是内部与按需详情，不能强迫默认填写。React/Vue、参数、依赖和权限按实际场景出现；运行前真实目标/权限及未知不重放保护保留。

A保留原布局并整理内容；B同风格再简化。先比较真实360px截图，再只精修明确更好者；无改善就保留R2.6。候选内嵌canonical亮色Token快照，轻输入/次按钮与正式深轮廓的差异明确记为待验，不修改全局Token或创建新组件体系。历史文件只审计，不删除。当前与未来正式实施均只用现有main；本轮不改变任何产品运行环境。

本轮离线交付：[R2.6/A/B同尺寸对照](artifacts/developer-ui-ux-20261114/r26-based-proposal/index.html)。独立实际看图后优先A（原分段/有边界设置更易发现），B保留为比较；A仅完成15个离线行为检查，不继续视觉微调、不生成第三方案。R2.6仍是用户认可基线，未宣布新候选整体超过它；未打路线分/页面质量分，正式改版等待明确授权。功能处置、风格差异、历史用途与证据统一回到原规格第11节。

用户随后认为简化明显，并同意更新原型入口。现已将上述A原样提升为[当前index](prototypes/sidebar/develop/index.html)，旧R2.6逐字节归档为[r2.6-baseline-preview.html](prototypes/sidebar/develop/r2.6-baseline-preview.html)。本次目录仅更新index/README/现有检查并新增基线快照；其余历史HTML不动，生成器、B、截图和评审仍留artifacts，需求仍留原规格。新路径通过360×860输入保留、模拟Run/Stop、本地未选禁用与Dock呈现核对；现有检查明确拆为当前语法/离线结构和R2.6历史断言。此确认只授权离线原型，不授权正式产品改版。

### 开发 Tab 当前覆盖：落实认可原型（2026-11-14）

用户随后明确授权正式组件的核心实施，覆盖上方“只做离线/待确认”边界。源码沿用 `src/ui/react/tabs/develop*.tsx`、原 field store、脚本与本地项目 owner；仅在 Develop 作用域调整 CSS。普通 textarea 默认164px，JS执行位置为原生select，参数/期限收进运行选项；低频表单独立进入并可返回，Stop留在原Dock。保存沿原ASCII脚本标识与不可变版本，不创造名称迁移或第二存储；普通成功反馈复用共享通知。

实施依据为开始时原型SHA-256 `dd0685f7da03814fc0612d9adae18605e769d5121ba61095bbd82774ae5b1628`。收尾时观察到原型并行变为 `d16fc06427681c0843eae356e31d72501db0497bcd27c2929504fd013a6394e4`，新增运行位置radio及按格式/位置保留独立草稿；本任务保留该改动，未把它算作本轮已实施内容。

现有 PID92181 watcher 保留，真实 extension `ccfcjegpkdlgbclopjmadlcjedelidmf` 的侧栏读回“开发服务已连接”，构建指纹 `43a246773610`。真实本地模式读回 Native 已连接、源码 Provider 未接入，未声称本地运行通过。原生工具 AX 与窗口截图不一致，停止依赖焦点的操作并释放 UI 锁；只通过精确窗口DOM做来源切换与只读取证，没有执行脚本、安装或授权。画面和几何归 `artifacts/developer-ui-ux-20261114/core-implementation/`，其中截图是冻结实际DOM/CSS的静态记录，不能当原生截图或真实运行回执。完整限制与失败分类见原测试规格11.5；未提交推送，保留全部并行dirty。


### 开发 Tab 最新覆盖：按认可版本完成视觉对齐（2026-11-14）

本轮继续获授权的正式 Develop Tab 实施，视觉目标锁定开始时认可的 `index.html` SHA-256 `d16fc06427681c0843eae356e31d72501db0497bcd27c2929504fd013a6394e4`。上节“仍为select、未同步独立草稿”是上轮记录，现已由原生运行位置radio与Controller/Page/React/Vue四槽草稿覆盖。槽位由原 `script-editor.js` owner保存源码、参数、稳定ID及revision；空草稿不会再次填示例，readonly/busy/unknown栅栏保持，不增加存储或执行入口。

目标卡、紧凑分段、带文件名的164px textarea、可选运行设置、默认展开的结果、轻量管理入口、61px底部操作区按认可图对齐。保存页为一个分组卡；无反馈的管理页不留执行区/底部空占位，有真实错误、未知或恢复入口时仍显示；运行中的Stop在管理页仍可达。只读文件名读取原实际源码选择。下载入口标“下载选项”，进入原持久下载控件，不冒充已下载。

360×860内容区同数据对照中，目标卡64.5px、编辑卡199.5px（源码164px）、运行选项顶部408.59375px、Dock y799–860，与认可基线记录一致。源码静态预览覆盖编辑/React/本地/保存/安装/诊断等，320×600无文档横向溢出；保留真实身份、版本/权限细节、不可运行时Run禁用、原结果Codec及错误。未复制原型品牌栏和模拟五Tab外壳，不给虚构匹配百分比。

现有开发writer当前为并行owner恢复的PID42614，本任务未启停或另建writer；实际侧栏ID仍为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，输出仍 `dist/development`，读回已连接及指纹 `ef13e4c35bcd`，六份运行CSS与输出文件hash一致。实际DOM冻结截图与显式示例数据的正式JSX/CSS对照分别标记，均不冒充原生执行验收。取证时原型曾并行变为 `e24c1920a888a6e761676c3495b4673ba89c41983533bb0bf7bf3ef9019922ec`（新增调试区等）；原文件未改，后续新增范围未自动并入本轮。最终图为 `artifacts/developer-ui-ux-20261114/core-implementation/alignment-compare-final.png`，验证与边界见原需求11.8、测试规格11.6。main未提交/推送，未安装/发布。
