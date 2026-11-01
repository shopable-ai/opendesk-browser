## 当前：规则排序、显示排序与自定义 CSV（2026-11-01）

[打开完整交互预览](../../../../artifacts/scrapyjs/light-20261101/candidate15-field-order/preview.html) · [本地入口](http://127.0.0.1:49870/candidate15-field-order/preview.html) · [源码、截图和验证](../../../../artifacts/scrapyjs/light-20261101/candidate15-field-order/README.md)。

「采集规则」行首手柄可拖动排序，顺序随配置保存；字段名与选择器原样保留。结果区「显示设置」也保留独立拖动，仅调整当前表格，不改变规则与下载顺序。两处共用鼠标/键盘交互：空格拾起、方向键或 Home/End 移动、Enter 放下、Esc 取消。保留字段即时编辑、清空、点选、列表范围和原忙态/UNKNOWN保护。

原 CSV、JSON 下载保留，新增「自定义 CSV 表头」；展开后每字段只有一个名称输入框和简单表头预览，留空使用原名、重名提示。临时名称只用于这次 CSV 第一行；规则页「CSV 表头（可选）」可预填并随配置保存。AI/人工也可写 `output.fieldNames`，例如 `{"title":"标题"}`；JSON 的原始字段 key 不改，未启用自动语言识别。

同一冻结候选通过 69 项相关 Node 检查、52 项离线交互检查，页面/控制台错误 0。真实网站、真实 AI、Native、安装及 production 仍为 `NOT_TESTED`；未晋升包、提交或推送。以下旧候选只保留各自历史，旧名称/显隐入口不作为当前设计。

# 当前：字段修改直接生效（2026-11-01）

[打开更新后的完整预览](preview.html)。字段名、采集规则及列表范围的有效修改立即进入配置草稿，删除「字段更改未应用 / 取消 / 应用字段」和范围应用栏。直接保存配置或开始采集即可；不完整或无效输入原位保留、提示并阻止保存/运行，修正后自动恢复，Esc 回到最后合法值。新增和重命名不中断连续输入，点选结果直接回填，自定义 CSV 表头与排序随字段改名保留。

最终候选为 `fields-immediate-20261101/candidate6`，固定三件套与其逐字节一致。同 SHA 的字段、点选、范围和连续键盘排序定向交互全部通过，页面/控制台错误为 0；1,387 项冻结来源无漂移。并行任务随后修改的点选模拟 helper 保留在工作区，未混入此冻结 HTML。独立 AI 专家复评与完整证据见[本轮记录](../evidence/fields-immediate-20261101.json)。仅 `SOURCE_COMPONENT_PREVIEW`；正式包、安装、真实网站/AI/Native/production 和系统 IME 未测，未提交推送。下方涉及字段应用/取消和旧评分均为历史候选。

# 历史：列表容器直接切换 / 点选与结果 info（2026-11-01）

## 历史：从结果进入显示设置（candidate11）

[打开完整亮色交互预览](../../../../artifacts/scrapyjs/light-20261101/candidate11-result-display/preview.html) · [本地交互入口](http://127.0.0.1:49870/candidate11-result-display/preview.html) · [交付与来源记录](../../../../artifacts/scrapyjs/light-20261101/candidate11-result-display/README.md)。先点击「开始采集」获得模拟结果，再从结果下载区右侧进入「显示设置」。无记录时不显示该入口。

显示名称是结果表头别名，和顺序、显隐一起在结果区原位编辑；不再放在采集规则的开关中。改名即时预览，原 key 始终可见；Enter/失焦完成当前输入，Esc 撤销当前改名。完成收起设置并恢复入口焦点，设置区域内非编辑状态 Esc 也可收起。显示设置仅本次使用，切换配置或关闭工具后重置，不随配置保存；完整记录及 CSV/JSON 保留原始 key、隐藏字段和全部记录。规则页专注字段/选择器，保留框内清空、点选、列表范围和复杂 JSON。

真实源码为 `src/App.jsx`、`src/Results.jsx`、`src/ColumnSettings.jsx`、`src/RuleEditor.jsx` 及原局部样式；列控制器由旧规则组件移入结果组件，沿用原 `resolveColumns`，未新增模型、依赖或 SDK。25 项相关 Node 检查、27 项本轮离线交互及同候选宿主截图检查通过，页面/控制台错误 0。HTML SHA `c843d74ec2f77a9b4f7553ff7197cf8f78cdb03517ea62327d5c1f5b5dc189eb`。构建在独立源码快照中使用原构建器完成，未覆盖工具 dist、固定预览三件套或正式包。

仅 `SOURCE_COMPONENT_PREVIEW`；真实网站/AI/Native/安装/production 为 `NOT_TESTED`，未提交、推送或晋升包。本轮不评分，未声称用户已认可审美。下方旧“当前”和候选均保留其历史范围；candidate9 的名称开关已由本节取代。


[打开预览](preview.html) →「采集规则」→「列表范围」：列表容器右侧常驻双箭头与框选按钮。双箭头一键循环切换，无候选弹窗；反馈列表名与条数。框选演示点选整个列表，确认只回填范围草稿，仍需应用/保存；取消保持原值。结果行仅一个 info 图标查看完整 JSON，复制在详情内保留。已修复切换推荐列表后字段点选仍使用旧样本的问题。

旧接口已确认是目标网页 MAIN 世界 `window.selector.next()`，读取当前容器使用 `getCurrentSelector()`；调用副作用包括列表/子项高亮与表格数据提取。当前 Sidebar 公开 SDK 尚无已证实绑定，预览仅在离线样例模拟，未调用旧桥或新增权限。真实网页切换/点选、安装、Native、production 均 `NOT_TESTED`。

最终 candidate3 与本目录三件套字节一致，HTML SHA `c04dc23203af7406d611f0a1265f4758033cede179d79350cddd57a64658a0f4`。独立 AI 设计终评 **97/100**，达到本轮 >95 目标；工程评审 **93/100**，无已确认阻断，保留 LSP 与 IME 验证余量，不将其冒称 95+。33 项本轮离线操作、25 项字段点选及 22 项定向 Node 检查通过；生成及同步时1386输入来源一致，零页面/控制台错误。随后5项并行源码变化；固定预览仍与candidate3同字节，当前工作树来源一致性记为DRIFT，分数不外推到这些后续变化。分数仅覆盖离线方案；[详细交付及原始评审](../../../../artifacts/scrapyjs/list-container-20261101/README.md)。保留并行列管理与样式改动；未晋升安装包或提交推送。

---

# ScrapyJS 交互预览

## 当前：显示名称滑块与统一列管理（2026-11-01）

打开 [preview.html](preview.html) →「采集规则」。仅保留一处「显示名称」滑块：关闭时编辑选择器，开启后同一格改为结果表头别名，原字段名只读。取消名称Tab、字段/列统计、重复操作提示与字段下方名称输入；行首手柄调整列顺序，眼睛控制显示。未聚焦时选择器不为隐藏按钮预留空间，排序提示只在操作中出现。

显示偏好在同配置保存、重跑及页面往返中保留，但不写入配置，切换或关闭工具后重置；CSV/JSON保持完整原字段和记录。恢复与说明收在「显示选项」，AI/程序按目标语言匹配名称仅为VIP后续规划。

固定三件套已与最终candidate12逐字节同步，HTML SHA `c5fb5016aea7b71734dbb3cb7b96eb1a4d38af7249350da16f67effe40439fdc`，同步时1386来源输入零漂移。独立AI设计复评 **96/100**，达到>95；同SHA39组列管理交互、24项相关Node检查通过，无运行错误。[本轮证据与边界](../../../../artifacts/scrapyjs/unified-rules-20261101/README.md)、[独立复评](../../../../artifacts/scrapyjs/unified-rules-20261101/design-review12.json)。本轮仅离线真实React+模拟SDK，未安装/发布或验证真实采集；保留并行规则点选、范围点选与结果反馈。下文均为各自历史候选，评分不继承。

## 当前：聚焦规则输入框内的清空 / 点选（2026-11-01）

按用户最新纠偏，删除独立点选/验证工具栏。打开 [preview.html](preview.html) →「采集规则」→ 聚焦一行规则输入框：右侧框内出现清空字符和点选两个无文字图标。空值隐藏清空；点选绑定该行，点内容即可自动生成选择器，文字/链接地址/图片地址用普通语言选择。直接展示将采集到的值，程序自动检查，用户无需执行验证或阅读 CSS。使用后进入原未应用草稿，应用/保存仍须显式操作；取消回到原输入框。

这是离线样例方案；真实网站点选尚无公开 Sidebar SDK 接入，未安装、升级或发布。完整后续方案和边界见 [DESIGN 首节](DESIGN.md)。旧手动验证方案及其评分已由本节取代，不继承到本候选。独立 AI 设计终评 **98.5/100**，六维均 >95；工程终评 **97/100**，无产品阻断；20 项规则/草稿/原引擎范围对比和 25 项离线交互已通过，零页面/控制台错误；最终版本与独立评审见 [本轮记录](../../../../artifacts/scrapyjs/rule-picker-20261101/README.md)。

## 当前：亮色与中性分段导航（2026-11-01）

[打开本轮亮色交互预览](../../../../artifacts/scrapyjs/light-20261101/candidate9-neutral/preview.html)。业务 Tab 采用一套中性分段语言：浅灰轨道、白色选中面、深灰字与轻微层次，不叠加彩色底线。灰白工作面与正文更中性；蓝色主要保留给开始/保存及键盘焦点。状态继续使用语义色。参考官方 shadcn Tabs / Radix Segmented Control，未引入新依赖或改共享组件。

保留最新行内规则、显示列编辑与并行字段辅助；顶部低频任务入口收至状态行，结果下载与显示列同行，JSON 保留缩进、内部横向滚动，语法与限制按需展开。草稿库中保存为主操作，并在一处对照保存版与草稿字段数。

本轮冻结候选为 [candidate9-neutral](../../../../artifacts/scrapyjs/light-20261101/candidate9-neutral/preview.html)，HTML SHA `272b497a356621dd767eca1a65ee67c8f735322601b545bbc38360e3fb9e978a`。[定向交互](../../../../artifacts/scrapyjs/light-20261101/candidate9-neutral/interaction-report.json)和[视觉/下载与对比度](../../../../artifacts/scrapyjs/light-20261101/candidate9-neutral/visual-report.json)通过，覆盖有重叠；截图覆盖状态中的可见启用文字最低 4.71:1，页面/控制台错误为零。显示名称采用并行 owner 最新的开关与横排标签。旧 candidate7 复合断言失败已分类；candidate8 的标签竖排导致本轮主动弃用，原件保留。详见[本轮交付](../../../../artifacts/scrapyjs/light-20261101/README.md)。

1389 个生成来源输入在快照核对中无漂移；为保护并行 writer，用原构建器在独立源码快照中编译，未写入工具 dist 或固定三件套。冻结后另有排序提示、输入留白和说明文案更新，本候选不代表整个最新工作树，差异已记录。candidate6/7 及旧 AI 评分保留为历史；本轮没有评分门槛，用户审美认可尚未取得。

本轮真实网站采集、AI、已安装扩展、Native、production均为NOT_TESTED；未晋升安装包、提交或推送。此页面由原生成器消费真实组件与内存SDK生成，不手改HTML，不改变Browser运行环境；AI顶栏仅打开占位说明。下文保留各自历史，不外推其分数或原生结论。

## 历史：规则与显示列直接单行编辑（2026-11-01）

[打开交互预览](preview.html)。字段用“字段名｜完整规则｜删除”一行输入兼展示，移除重复的“采集字段”标题和独立编辑表单；“＋ 添加字段”位于字段列表底部居中。列表范围只设置一次、独立应用。编辑时才出现应用/取消，取消恢复正确未保存状态；复杂规则保持只读并转完整 JSON。

显示列改为“手柄｜显隐｜显示名输入”，直接改名并即时更新本次预览，Enter/失焦完成、Esc撤销；改名后保留原字段标识。排序帮助折叠、恢复默认位于底部。显示设置不改变CSV/JSON下载的原字段、隐藏字段与完整记录。

同候选字段行36px；53项定向离线操作、33项相关Node检查通过，页面/console错误0。固定三件套与冻结candidate5同字节；[行为与截图](../../../../artifacts/scrapyjs/rules-inline-20261101/browser5/report.json)、[来源核对](../../../../artifacts/scrapyjs/rules-inline-20261101/delivery.json)、[独立代码复核](../../../../artifacts/scrapyjs/rules-inline-20261101/code-review4.json)。独立AI设计首评94.75；修复交叉草稿锁、删除提示归属与重复下载回执后，最终复评 **97.0/100**（八维均≥96）。见[本轮评审](../evidence/ui-inline-rules-columns-20261101.json)。同步时1384来源输入一致，随后并行源码继续更新；分数与操作结论仅绑定冻结candidate5及同字节固定预览，不沿用历史候选分数。

当前仍为真实组件+模拟SDK的离线预览。保留并行主题更新与原权限/身份/未知状态保护；没有安装、晋升正式包或提交推送，真实采集/AI/Native/production未测。下方各候选评分与旧“当前”仅属于各自历史版本。

## 本次导航增量（2026-11-01）

预览复用完整真实宿主页头。进入配置库后显示 `scrapyjs 采集/配置库`，唯一返回先回采集根页，再回简化扩展列表；进入聚焦搜索，返回恢复入口及工作区滚动，保留业务与 AI 占位挂载。命名/保存中不丢表单，根返回仍保护草稿与运行。原 `navigation-header.js` adapter 使用公共状态 normalizer 与真实标题 formatter，不给 iframe 宿主 DOM 或特权。

[同候选证据与同步状态](../../../../artifacts/scrapyjs/library-navigation-20261101/README.md)为本轮入口；固定三件套同步必须通过来源锁与现有文件比较，不能手改生成 HTML。并行源码变化后冻结候选仍保留其 SHA，不能把历史预览标成最新源码。当前正式 scrapyjs 未获完整官方包导航准入，Mock 仅演示；实际安装、真实 AI/采集、Native、IME、读屏及 production `NOT_TESTED`，未晋升包或提交推送。

## 当前：配置库交互预览重新设计（2026-11-01）

[打开新版交互预览](http://127.0.0.1:56347/artifacts/scrapyjs/library-redesign-20261101/candidate2/preview.html)，点击配置库图标进入；固定 [preview.html](preview.html) 已同步。返回导航、标题、新建和搜索分层；列表明确当前使用；编辑规则突出，保存仅在有更改时出现；复制/重命名/导出/删除收进更多操作。搜索可按名称或网站筛选，支持清空、无匹配恢复；保存版与草稿字段数明确区分，切换确认点名目标，原草稿/身份/CAS/忙态与UNKNOWN保护保留。

旧版独立评分 **76/100**，最终同候选两位独立设计评审 **98/100、96/100**，以较低分96达到本轮 >95 目标。[分维评审、截图与交付证据](../../../../artifacts/scrapyjs/library-redesign-20261101/README.md)。配置库22项、原控件51项、状态11项定向离线回放通过（覆盖有重叠）；1373项来源核对零漂移。评分只针对本次离线配置库，不外推到真实安装。源码同步到原工具，未安装/升级或晋升正式包，真实AI/采集/production未测，未提交推送。下文为各自历史候选。

## 当前：目标网址直接单行编辑（2026-11-01）

[打开交互预览](preview.html)。采集目标内直接显示网址输入框，移除网址折叠行与重复标签；同源说明保留为输入框无障碍说明，错误和运行限制仍就近提示。真实 App 源码与本目录三件套已同步，未更新正式安装包。

本工具构建、网址身份定向测试，以及直接编辑、无效网址、跨源阻止运行、无效 JSON 草稿保护的离线浏览器检查通过；页面/控制台错误为 0。[同候选操作及截图](../../../../artifacts/scrapyjs/url-input-20261101/report.json)、[来源核对](../../../../artifacts/scrapyjs/url-input-20261101/parity.json)。本轮实际安装态与真实采集未测试；下方链接和统计属于各自历史候选。

## 历史：文字采集按钮、图标配置库与 AI 预览占位（2026-11-01）

[打开最终交互预览](http://127.0.0.1:56346/official-scrapyjs-20261101-preview-handoff-v2/preview.html)。宽按钮保留播放图标与「开始采集」文字，停止保持紧凑图标；配置库入口只显示图标，保留 tooltip / 无障碍名称及原有子视图操作。

仅在离线预览中，右上角 AI 打开底部简洁窗口，说明「这里是 AI 对话的预览占位」，并指出实际入口「OpenDesk → 扩展 → scrapyjs 采集 → 右上角 AI」。支持关闭、再次打开、Escape 与入口焦点恢复，不显示发送表单、不调用 AI adapter。实际扩展仍默认使用完整 AiPanel / 公共 Chat，不能把占位开关带入实际工具。工具工作区显式持有 flex / 业务滚动布局，避免占位分支缺少 Chat 动态样式后超出可见区域。

最终 HTML SHA `c083b39a6dfe32b1128032c59df11b30d9c357a04bd9cb03562fb7e9be0d2e12`；同候选 52 项离线交互通过，页面/控制台错误 0，默认完整 Chat 的定向保留检查及本工具构建通过。[交付与截图](../../../../artifacts/sidebar-preview-kit/scrapyjs-preview-handoff-20261101-evidence/README.md)。首轮布局失败和旧候选保留，历史评分不外推，本轮 NOT_SCORED。固定三件套来源核对与同步见交付记录。

下一阶段已由用户授权创建新对话完善实际扩展 UI：优先「开发 → 本地项目 scrapyjs → 在侧栏调试」，核对真实入口及最新设计；本轮预览不证明当前安装态已更新。真实 AI / 采集 / Native / 安装升级 / production 未由本轮验证，旧 UNKNOWN 不处理、不重放；不恢复全量测试、评分或宽度缩放专项。未晋升正式包、提交或推送。

## 历史候选：配置库子视图与紧凑列管理（2026-11-01）

[完整页面](http://127.0.0.1:56346/official-scrapyjs-20261101-library-final/preview.html)由原生成器生成，HTML SHA `826b3e2bc59404a17ca418952a74d742927aa6877406d2e976087575270c4b3d`。[同源文件](../../../../artifacts/sidebar-preview-kit/official-scrapyjs-20261101-library-final/preview.html)可离线打开；[交付索引](../../../../artifacts/sidebar-preview-kit/scrapyjs-library-columns-20261101-evidence/README.md)包含来源核对、固定三件套同步、独立分维评分和截图。下方候选身份、分数和旧“当前”描述保留历史，不外推到本候选。

配置库使用内部子视图，返回保留业务/Chat/滚动/焦点；当前配置的保存、复制、重命名、规则编辑、导出及删除继续走原模型。显示列为紧凑列表，按需改名；手柄支持鼠标拖放，键盘用空格/Enter 拾起、方向键/Home/End 定位、空格/Enter 确认、Escape 取消。排序确认前不改变表格。隐藏、改名、排序和分页不影响 CSV / JSON 下载的原始完整数据。

同 SHA 的 `final-replay/report.json` 42 项和 `final-states/report.json` 11 项通过，均无页面/控制台错误；37 项模型测试通过。测试扩充仅在浏览器内存模拟 SDK 注入 51 条记录及下载失败/等待，不改生成 HTML。可用原驱动 `tests/run-preview.mjs --library-columns <URL> <新证据目录>` 或 `--library-states` 定向回放。原 `final/report.json` 的手势中截图驱动失败保留，最终回放移除该手势中的截图后通过，未为此改产品代码。

本轮仅离线 UI；真实 AI/网站/Native/安装/production、系统剪贴板、真人屏幕阅读器、触控及 pointercancel/lostcapture/列表外松开专项均未测试。停止截图只证明 Stop 已受理、等待原实例退出，不证明退休终态。不晋升包、提交或推送，不清除旧 UNKNOWN。

## 历史 v7：柔和按钮与配置库（2026-11-01）

[完整离线预览](../../../../artifacts/sidebar-preview-kit/official-scrapyjs-20261101-reviewed-v7/preview.html)采用浅灰开始/应用/发送按钮、白底选中页签、中性消息气泡；“管理”改为配置库，提供网站/字段/当前标识、切换、复制新配置、重命名、规则编辑、导出及独立删除区。配置键盘切换完成后恢复焦点，Escape可继续关闭，原草稿/CAS保护保留。可见哈希和Shared UI构建状态长段已删除，来源记录仍在manifest。

HTML SHA `081d843467756d38fc2d716ed40815b55aba33206a578472773476e2b581f825`；[当前交付索引](../../../../artifacts/sidebar-preview-kit/official-neutral-20261101-v7-evidence/README.md)维护本候选回放、独立评审与固定入口同步结果。v5两次未达标评审原件保留，v6为中间视觉候选；不沿用v4评分。仅离线UI，真实AI/采集/安装/Native/production未测；不提交推送或晋升安装包。

## 历史 v3/v4：官方 React Aria 风格试点（2026-11-01）

[完整冻结页面](../../../../artifacts/sidebar-preview-kit/official-scrapyjs-20261101-reviewed-v3/preview.html)为原真实 App + 模拟 SDK，同源HTML SHA `bad6b1ef24718acb077f52d3a77613a477f99d767709bf4869bdf74fda4aacae`。本轮统一共享 aria-nova / Neutral 外观，保留配置、规则、JSON、结果和底部 Chat。固定三件套同步与独立评审的最终状态见[本轮交付记录](../../../../artifacts/sidebar-preview-kit/official-neutral-20261101-v4-evidence/delivery.json)，后文 `660485a4…`、`078926cb…` 及其他候选分数均属历史。

[工作区操作报告](../../../../artifacts/sidebar-preview-kit/official-neutral-20261101-evidence/scrapy-core-v3/report.json)62项、[Chat操作报告](../../../../artifacts/sidebar-preview-kit/official-neutral-20261101-evidence/scrapy-chat-v3/report.json)42项通过，绑定同HTML与截图。规范与组件模板见[原Preview Kit](../../../../docs/api/sidebar-preview-kit.zh-CN.md#官方风格试点合同2026-11-01)，布局与边界见[DESIGN](DESIGN.md#官方-react-aria-风格试点2026-11-01)。这是当前离线 UI 证据，真实模型/网站/安装/Native/production仍为NOT_TESTED，原UNKNOWN未清除。

继续编辑复用[43127 Mock Vite](http://127.0.0.1:43127/preview/dev.html)和当前源码；未运行时用 `npm run dev:mock --prefix examples/sidebar-tools/scrapyjs`。重新交付时只构建本工具，原 `build-preview.mjs --out <新目录>` 生成同源三件套，核对来源后再同步，不能手改HTML。Browser watcher与 `dist/development` 不受本次离线工作影响。

## 本次核心按钮初测（2026-11-01）

[preview.html](preview.html) 已同步最终源码候选，HTML SHA256 为 `660485a4ca43d25a5057e56df14f2ccf820eaf35e2c4197f19e63014aa09af33`。本次修复字段删除/应用反馈、分页与详情反馈、配置导出失败提示、完整发送资料预览和再次开始失败/停止的数据保留。见[初测记录](../evidence/buttons-core-20261101.json)与[按钮清单](../INTERACTIONS.zh-CN.md)。下方旧设计候选、评分和统计保留历史边界，不代表本次正式验收。

原有 `43127` 模拟 Vite 服务继续复用，没有重启 Browser、改变 `dist/development` 或安装。待发送预览与实际载荷包含相同的 HTML 样本；是否附上当前配置由勾选控制。所有模拟发送和采集仍明确标识为模拟，复制仅为模拟回执；下载是实际浏览器下载，已读回核对内容。

本次只跑相关 Node、Chat、工作区及按钮失败路径初测；新切片可用原 `tests/run-preview.mjs --buttons <HTML URL> <输出目录>` 回放。真实 AI、真实 Chrome、真实采集、系统剪贴板均 NOT_TESTED；历史 UNKNOWN 未处理，不通过刷新或重置绕过它。固定三件套由原生成器同步，旧文件备份仅在 `artifacts/scrapyjs/buttons-20261101/previous-fixed-preview/`。

直接用 Chrome 打开 [preview.html](preview.html)。文件自包含，无需启动服务；使用本工具真实 React UI、App Model 和 SDK adapter，只有 SDK 请求由内存模拟器接管。它不是已安装扩展或正式安装包。

## 最新设计（2026-11-01）

Chat 增加可见标题与阶段，输入旁解释当前不能发送的原因；新提案在对话内定位“审阅配置”，不抢审阅焦点。变更优先展示，保持不变的字段与完整 JSON 可展开；HTML 样本、Provider 和调用信息归入“更多资料与诊断”。操作按钮位于滚动区外的独立底栏，不遮挡新值。业务、消息、草稿与原请求状态保持。

本轮[受评冻结快照](../../../../artifacts/scrapyjs/design-20261101/candidate4/preview.html) SHA `078926cb…` 的42项 Chat、62项工作区、11项设计/组件操作及10项 Node检查通过；生成与设计回放时1371项来源锁零漂移，文字对比度实测最低6.01:1，默认审阅值与底栏无相交。该候选已纳入一轮并行源码更新并重新验证；其后工作区及固定三件套继续被并行任务更新，本轮未覆盖其新文件，不声明当前工作区 SOURCE_PARITY_PASS。见 [当前验证记录](../evidence/ui-design-browser-20261101.json)。仅为离线 SOURCE_COMPONENT_PREVIEW，真实 AI、安装与采集均 NOT_TESTED。

[独立设计子Agent复评](../evidence/ui-design-review-20261101.json)：需求100、样式98、层级100、反馈99、键盘99、复用隔离100、维护98、证据99，均>95；保留非阻断扣分。该结论只绑定candidate4冻结三件套，不外推本目录被并行更新的 `preview.html` 或真人专家认证。

已有风格入口：[原预览 Skill](../../../../.agents/skills/opendesk-ui-preview/SKILL.md)、[唯一外壳模板](../../../../scripts/templates/sidebar-tool-preview-shell.html)、[完整组件参考](../../../../prototypes/sidebar/extension-ui-showcase/index.html)。本轮由原生成器输出的[可交互共享 Chat / 组件示例](../../../../artifacts/scrapyjs/design-20261101/components/components.html)及[接入配方](../../../../artifacts/scrapyjs/design-20261101/components/component-recipes.md)为本机临时产物，不是新模板体系或可安装包。

以下组合合同继续有效；2026-10-31 的候选统计和评分属于历史，不能替代本轮评分。

完整工具栏 Chat 组合是 **Host 公共入口 + workspace/business + SharedConversationDock + SharedConversationFrame/session**。工具通过 `OpenDeskTool.setConversationState({visible:boolean,open:boolean})` 声明展示状态，从 `OpenDeskTool.root` 接收 `opendesk:conversation-action`，其 `detail` 为 `{action:'toggle'}`，再受控更新 open。这些能力仅控制展示，不授予权限、不自动发送。`SharedConversationDock` 是纯展示组件，使用受控 `open/onClose`；消息、输入和会话继续使用原 Frame/session。Host 实际安装入口为 NOT_TESTED；本轮验证层级是工具源码与 preview 模拟。

实际参照为 `projects/bookmark-manager/preview/react`，它消费真实 App + TrustedWorkspace：HeaderSlot 中小字 AI 按钮紧挨卸载；展开后业务在上、Chat 在下，以细分隔条形成底部 split，支持拖动及键盘调整；收起回到按钮，重开保留草稿。此处只复用公开组合与交互，不导出 TrustedWorkspace/HeaderSlot，不跨 iframe DOM，也不复制书签业务。

Frame 示例只是消息/输入片段，不能作为完整工具栏 Chat 范例。公共 `components.html` 顶栏的小 AI 按钮也必须能够实际开合底部 Chat，不能只有内容区 Frame。业务节点、当前页签、编辑与 Chat 草稿、消息和提案保持挂载；收起不取消请求、不清除 busy/UNKNOWN 围栏、不自动重发。

本轮目标、关键测试条件、通过门槛和停止条件见 [GOAL.zh-CN.md](GOAL.zh-CN.md)。

2026-10-31 历史三件套来自候选 `9f313a12…`，34项 Chat、62项工作区操作与18项 Node定向检查通过；[历史来源、截图及未测边界](../evidence/ui-toolbar-chat-browser-20261031.json)。本轮固定三件套以上方最新设计及当前 manifest 为准。书签参照的配置/收起按钮已补入完整点击区并实际验证；配置面板预览不连接 Provider。

[2026-10-31 历史独立复评](../evidence/ui-toolbar-chat-review-20261031.json)：100 / 96 / 97 / 99 / 98 / 100 / 97 / 96，仅属于其原候选，不代表本轮评分或原生验收批准。

## 可以体验

- 选择、命名保存、复制、重命名、删除配置，以及未保存草稿的放弃确认。
- 编辑字段、分页与详情；复杂字段转到完整 JSON。无效或未应用的草稿会阻止运行、保存。
- 模拟开始、停止、结果、列显隐、完整记录、CSV / 完整 JSON 下载。
- Host 工具栏小字 AI 按钮展开/收起业务下方的 SharedConversationDock；细分隔条支持拖动与键盘调整；配置、目标、页签、业务与 Chat 草稿保留，关闭/Escape 返回按钮。收起待处理请求不停止、不清锁。固定示例提案 → 差异审阅 → 显式应用 → 就地命名独立副本，保持 Chat；示例只新增 `column_title`，不理解输入、不连接模型、不自动采集。
- 页面外的“纯模拟场景控制”：success、empty、error、permission-denied、loading、untrusted。草稿、确认操作或运行尚未结束时，切换和重置被锁定。

保存仅在本次 iframe 内存中，刷新页面会清空。复制按钮只模拟确认，不写系统剪贴板；可手动选中文字复制。下载文件有 `SIMULATED-` 前缀，只含模拟数据或当前内存配置。网络连接被 CSP 禁止，iframe 保持 opaque origin，仅允许脚本和显式下载。

## 源码与继续迭代

真实业务 owner 是本工具目录，入口为 `src/main.jsx → App.jsx`。结果在 `Results.jsx`，AI 审阅在 `AiPanel.jsx`。旧 `scrapyJsChrome` 只作功能项参考，不复制其弹窗布局。本轮设计依据见 [DESIGN.md](DESIGN.md)。

以下命令均在仓库根目录执行。只更新工具 UI，不写 Browser 的 `dist/development`：

```sh
npm run dev:mock --prefix examples/sidebar-tools/scrapyjs
```

访问 [持续开发预览](http://127.0.0.1:43127/preview/dev.html)。这是独立网页 Vite HMR，SDK 仍为模拟器；它不等于 Browser 已连接 serve 或真实工具已更新。已有服务时复用，不重复启动。

生成新的离线候选：

```sh
npm run build --prefix examples/sidebar-tools/scrapyjs
node examples/sidebar-tools/scrapyjs/preview/build-preview.mjs --out artifacts/previews/scrapyjs/<新的候选目录>
```

输出目录须是新的；生成器拒绝覆盖已有文件。检查候选后，同步其 `preview.html`、`preview.manifest.json`、`preview.context.json` 到本目录。它们属于同一预览，不能混用不同候选。

Shared UI 从公开固定入口的当前源码在内存中编译，复用固定 React 19.2.0 与公共组件；manifest 记录工具产物、依赖、编译配置、输入 SHA 和输出 SHA。`SOURCE_COMPONENT_PREVIEW` 不代表 WXT/安装包/原生通过。显式指定旧 runtime 与 receipt 时继续严格核对，不以失败旧快照冒充新构建。

## 验证与评分边界

当前标准以本页顶部的真实参照和完整组合为准。旧内容区 AI 配置 + 嵌大 Frame 布局不符合本轮要求。工具源码与 preview 模拟是本轮验证层级，Host 实际安装 NOT_TESTED；同 SHA 操作、截图与定向检查见 [本轮证据](../evidence/ui-toolbar-chat-browser-20261031.json)，当前回放已完成，未执行的真实安装与 Provider 项仍为 NOT_TESTED。

用户要求八维分别 >95（整数至少96），但须先满足实际入口与参照一致、规范/来源可追溯两个前提。证据不足为 NOT_SCORED，不强行评分。旧风格候选 `d2bc23…e51e5` 的[操作记录](../evidence/ui-style-source-browser-20261031.json)和[100/99 等评审](../evidence/ui-style-source-review-20261031.json)均为历史，不能作为新标准或当前 PASS。

旧间距候选 `273baa…26f7c3` 及其评分已被用户本轮风格纠偏取代，保留在 [历史间距记录](../evidence/ui-spacing-browser-20261031.json) 与 [历史评审](../evidence/ui-spacing-review-20261031.json)，不能充当当前候选证据。

前轮 [AI 就地操作记录](../evidence/ui-ai-dock-browser-20261031.json) 与 [八维评审](../evidence/ui-ai-dock-review-20261031.json) 为历史：遗漏了提案返回后Chat压缩问题，不能沿用为本轮间距评分。更早的 [UI 操作记录](../evidence/ui-preview-browser-20261031.json) 和 [六维评审](../evidence/ui-preview-review-20261031.json) 也保留其原候选范围。保存反馈仍覆盖重名失败与成功保存；新评分条件见目标文件，当前新组合未据此给分。

定向 Node 检查覆盖模型身份、草稿与 CAS、原请求停止/退休、复杂规则、结果完整性、预览来源及共享发送事件。`tests/run-preview.mjs` 是可选 Playwright 驱动；可用 `PLAYWRIGHT_MODULE` 指向已有本地模块、`CHROME_BIN` 指向现有测试 Chrome，无需安装新依赖。

历史切片使用 `node examples/sidebar-tools/scrapyjs/tests/run-preview.mjs --ai-dock <HTML URL> <新证据目录>`，只运行 `ai-dock-interactions.mjs`。当时切片增加可见标签与提案发送guard，合计28项。不加该参数保留旧完整驱动供需要时使用。

评分只适用于本离线浅色 UI 的已验证范围；真实模型、网站采集、最新安装/升级、production、暗色及屏幕阅读器专项均未由此证明。真实 AI 原请求 UNKNOWN 和 CSDN 页面限制仍按工具主 README 处理。

## 再遇到风格或 Chat 预览不一致

可直接说：“用 opendesk-ui-preview 修正同源离线预览，先真实 consumer 开合对照，再核对 Host 公共入口和完整组合；保留草稿，原生成器新目录，同 SHA 截图/定向证据，固定三件套，不安装或调用真实 AI。”

1. 先回放真实 consumer 的 AI 开合、底部 split 调整、收起焦点和重开草稿，对照当前失败或未验证点。
2. 核对公开合同与已有 Host 入口，按完整组合保留业务、Chat 与原请求状态；不以内容区 AI 配置加大 Frame 代替。
3. 使用原生成器输出新目录，保留工具、运行时、组件与 HTML 的来源 SHA，不手改生成 HTML。
4. 对同 SHA 候选保存截图与受影响行为的定向证据，含顶栏按钮开合、拖动/键盘分隔条及草稿保留；未执行项写 NOT_TESTED。
5. 固定交付 `preview.html`、`preview.manifest.json`、`preview.context.json` 三件套，不混用不同候选。将同 SHA 截图和操作报告链接回本工具 README；本轮已在上述证据中记录，未执行项不预填 PASS。

共享示例从原 kit 的 `components.html` 进入，顶栏小 AI 按钮也须实际开合；不是只看内容区 Frame。命令和边界见[预览 Skill](../../../../.agents/skills/opendesk-ui-preview/SKILL.md)与[套件文档](../../../../docs/api/sidebar-preview-kit.zh-CN.md)。本轮文档检查只核对链接/内容，不执行上方构建或浏览器命令；不提交推送、晋升、安装、Browser build、真实 AI 或完整验收。
