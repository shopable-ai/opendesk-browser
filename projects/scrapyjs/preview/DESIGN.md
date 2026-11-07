# 当前：规则顺序可保存，结果独立排序，CSV 名称按需编辑（2026-11-01）

用户最新选择保留「显示设置」拖动排序，并明确采集规则也需要拖动。两处复用 `FieldOrder`；规则顺序写配置，结果顺序按 profileEpoch 保存在当前会话。保留原 CSV/JSON，再加「自定义 CSV 表头」；名称编辑器只提供一项输入和简单表头预览，没有显隐、排序或语言猜测按钮。两种设置与下载可以独立使用。

配置沿用原命名配置/CAS，新增可选数据 `output:{fieldNames:{title:"标题"},fieldOrder:["title","source"]}`。对象键可能被存储重排，因此用数组保存字段顺序并在校验后重建 itemConfig 顺序；字段规则及保留项不变。名称映射与顺序元数据本身不传入固定 Task/本机采集引擎。JSON结果原key保持不变；CSV按真实导出顺序预览和替换表头，保留完整值、公式防护和150000字节上限。

人工可在采集前预填名称并保存；程序/AI可一次生成配置。未来按目标语言识别字段时，只在名称映射层提供可选择的建议，用户已有名称优先；不按地区暗改原字段，不要求JSON改名。本轮只实现映射与输入，不声称自动识别/翻译可用。

已用同候选验证规则/显示的鼠标拖动、键盘确认和取消、保存、默认恢复、临时CSV下载、名称预设、空值/重名、原始JSON/CSV、无效草稿保护及新增/重命名焦点。69项Node和52项离线交互通过，未评分。候选与源码见 [candidate15交付](../../../../artifacts/scrapyjs/light-20261101/candidate15-field-order/README.md)。并行的字段即时编辑与重命名映射修正保留；共享dist/固定预览/正式包未覆盖。以下章节是各自历史或仍适用的独立字段编辑说明，不恢复旧显示开关或显隐功能。

# 当前：字段修改直接生效（2026-11-01，用户纠偏）

删除「字段更改未应用 / 取消 / 应用字段」及同一编辑器的范围应用栏。合法输入、清空后修正及点选结果立即更新配置草稿；保存配置仍是唯一持久化操作。新增字段填完整后直接加入，重命名保持行序与输入节点。无效值原位保留、标明错误并阻止保存和运行；Esc 恢复最后合法值，未完成新增可从行末移除。不撤销之前已生效的其他修改。

选择输入即时更新，避免失焦、Enter 或额外确认成为隐藏通行证。复用原转换器、配置校验、草稿身份与运行/UNKNOWN保护，不增加自动保存、权限、SDK或依赖。只验证本轮字段/范围/点选及相关安全行为；原构建器在独立源码快照输出同源预览，通过后同步固定三件套，不写共享 dist 或正式包。下文涉及「未应用字段」的设计属于旧候选。

# 历史：显示名称归结果展示（candidate11）

实际操作发现：candidate9 的「设置显示列」跳转到「采集规则」，还需切换「显示名称」，把结果展示与采集逻辑混合。采用最小一致方案：有结果记录时，在下载操作旁提供「显示设置」，原位展开名称、顺序、显隐，表格继续在同一滚动区预览；无记录不提前展示。没有新增内层 Tab、子页、对话框或权限入口。

显示别名、原字段 key、采集规则有各自职责。原 key 在设置和已改名表头保持可见，别名不写回配置或下载。输入即时反馈；Esc 撤销当前名称，完成收起并恢复入口焦点，非编辑状态 Esc 收起；键盘/鼠标排序复用旧实现。保持原会话设置寿命，不引入持久化迁移；切换配置/关闭工具后重置，说明就近可见。采集规则删除显示名称开关、排序及显隐，保留采集字段、复杂 JSON 与点选/列表范围。未来 AI 翻译规划不在正常操作中占位。

执行计划与结果：已复现旧入口；先补真实浏览器行为检查；移用列控制器而非复制；修复空别名时原 key 重复显示；相关 Node/离线交互通过；用原构建器在 candidate11 独立快照生成完整 HTML 并核对来源、下载和完整宿主截图。未覆盖共享 dist/固定预览、未晋升/安装/提交/推送。不评分；用户审美认可与真实采集/AI/Native/production 仍未验证。

最终入口、SHA、截图与来源见 [candidate11 交付](../../../../artifacts/scrapyjs/light-20261101/candidate11-result-display/README.md)。以下设计与评分只保留各自历史，不重启旧目标。

---

# 当前增量：列表容器一键切换、点选与结果 info（2026-11-01）

用户最新纠偏：切换按钮点击即调用目标网页逻辑自动切换，无候选弹窗或再次选择；点选为独立入口。旧候选弹窗方案已撤回，candidate1仅保留历史证据与真实发现的跨容器字段点选失败，不继承其评分。

本轮仍是 Sidebar Tool 原 owner 的离线 SOURCE_COMPONENT_PREVIEW。列表容器输入内常驻双箭头/框选两个公共 IconButton；切换立即选择下一个示例列表并回填范围草稿，反馈列表名/条数，重复点击循环，不自动应用或保存。点选在离线示例高亮整个列表，取消保留进入前草稿，确认回填，保留应用/取消。已有列表项过滤不静默清空，无匹配就解释并保留原值。真实网站 API 的旧实现与当前公开 SDK 可调用性分别取证，不把离线模拟冒充网页接通。

结果每行只留一个 info IconButton，保留「打开第 N 条完整记录」无障碍名称及 tooltip；详情仍展示原始完整 JSON 并调用原复制服务。动作列由 100/84px 收至 48px，表格正文与下载数据保持原身份。

实施计划（writing-plans，复用本文件）：
- [x] 原 rule-selection 测试补独立候选、直接子项、无匹配、安全选择器，已观察缺失实现失败后通过。
- [x] ListScopeAssistant 原位双入口；App/RuleEditor仅注入preview adapter，复用原scopeOnly草稿与忙态/UNKNOWN锁。使用共享 rule-sample.js 修复「切到推荐列表后字段点选仍检查旧样本」真实失败。
- [x] 原工具局部编译及生成链记录新增输入，HTML不手改。candidate2通过32项本轮离线操作、25项原字段点选、22项Node定向检查，页面/控制台零错误。
- [x] candidate3 同 SHA 完整宿主截图与1386输入来源核对完成；独立AI设计97/100、工程93/100（无阻断，验证余量保留）。33项本轮操作、25项原字段与22项Node通过。真实网站/安装/Native/production仍NOT_TESTED。 同步后5项并行源码变化，当前工作树来源一致性为DRIFT；冻结候选及固定预览仍同字节，评分与回放仅绑定该候选。

旧代码接口已查明：`window.selector.next(customSelectors = null)` 在目标网页 MAIN 世界直接高亮并切换容器，返回表格数据；`getCurrentSelector()` 返回selector/itemCount/element，不能把DOM元素跨沙箱回传。旧扩展的专用桥不是当前公开Sidebar SDK；本轮仅定义同操作语义的离线adapter，未冒称已连接。旧模块与调用证据见本轮交付legacy-api.md。

---

# 当前亮色视觉修订：中性内容导航（2026-11-01）

用户指出 candidate6 的导航混合了圆角按钮、淡蓝选中面与蓝色底线，整体不美观。旧评分不作为本轮停止条件，也不代表用户认可。内容导航保留真实 Tab/tabpanel 与方向键语义，视觉采用 shadcn Tabs 默认分段、Radix Segmented Control 的单轨道思路：浅灰底、白色选中面、深灰字与轻微层次；不叠加彩色底线。参考 [shadcn Tabs](https://ui.shadcn.com/docs/components/tabs)、[Radix Segmented Control](https://www.radix-ui.com/themes/docs/components/segmented-control)，只借鉴视觉，不引入依赖。

工具底色与次级文字收回中性灰，蓝色保留主操作和键盘焦点。未选、hover、selected、focus、disabled 分开处理。并行 owner 已将规则内层 Tab 收为“显示名称”开关，保留该最新结构与规则助手，不恢复旧分组。实现范围仅 App 外层 Tab 与局部 style；使用原构建/生成器冻结新目录，验证视图切换、草稿保留、采集结果、显示名/显隐、下载与宿主返回，再核对来源和截图。安装、真实采集/AI、Native、正式包与评分不属于本轮。

candidate7 的历史行内失败已最小诊断：两个显示名输入存在，改名即时反映表头；其内层按钮丢失 role/aria-selected，复合断言在该语义项失败。当前并行源码已移除此内层 Tab，不为了旧驱动恢复它；新候选按开关后的真实用户操作验证。

---

# 当前：聚焦输入框内的清空与点选（2026-11-01，用户最新纠偏）

面向非技术用户。采集规则输入框右侧内置两个无文字 IconButton：清空字符和从网页点选。仅当前规则输入框 focus-within 时显示；空值不显示清空，Tab 可以从输入框进入图标。清空仅修改这一格草稿，不删除字段；Escape/取消可恢复。点选绑定该行，不能跳到其他字段。复杂规则仍走原 JSON 编辑。

移除独立「网页点选 / 验证规则」工具栏和手动验证任务。预览以示例网页演示点选，用户点击内容后自动生成相对 CSS、自动检查同类项，文字 / 链接地址 / 图片地址使用普通语言。直接展示将采集到的样本，仅发现缺失、空值或多匹配才就近提示；技术规则放只读折叠项。使用后进入原单字段未应用草稿，随后显式应用/保存，失焦不提交。

当前交付仍是 SOURCE_COMPONENT_PREVIEW，真实网站点选待公开 SDK 接入。自动检查在预览 adapter 内执行，不扩权 Browser、不调用采集 Task，不把模拟结果当真实验证。后续真实实现由原权限与文档身份合同控制；程序负责检查语法、作用域、匹配数和值，正常用户无需发起验证、阅读 CSS 或理解测试报告。

本轮复用真实 App/RuleEditor、公共 Input/IconButton、原草稿与运行/UNKNOWN 栅栏、单一预览生成器。保留并行新增的显示列/排序与局部样式。修复初评发现：picker 直接绑定所属行（复杂首字段不再导致不可见草稿）；样例记录枚举与原采集引擎同用容器直接子项和可选 item 过滤，不把后代匹配误报成功。

实施/验证：行内两个 icon 与焦点可见性 → 点样本自动回填/检查 → 原草稿应用/取消 → 对应浏览器回放及引擎范围回归 → 原生成器冻结/来源核对/专家复评。历史候选的布局和评分不继承到本方案。

---

## 当前增量：采集规则内切换显示名称（2026-11-01）

最新用户操作：在「采集规则」中用眼睛控制列显示、用行首手柄调整顺序；开启「显示名称」滑块后，原选择器位置直接改为表头别名输入，关闭后恢复选择器。取消名称选项卡、字段/列计数与「拖动排序 · 眼睛控制显示」提示，名称不堆叠到字段下方。

同一字段列表采用「手柄｜字段名｜选择器或显示名称｜眼睛｜删除/JSON」。别名模式保留原始字段名只读，显示设置即时作用于结果；采集选择器、字段身份、完整 CSV/JSON 下载保持原语义。额外结果列只标「结果附加列」，没有虚假选择器或删除字段动作。未应用草稿锁定切换、显隐与排序；复杂规则保留 JSON 入口。结果页「设置显示列」返回规则并聚焦手柄。

复用公共 Switch、Input、IconButton 及原 App/RuleEditor；显示偏好按 profileEpoch 隔离，同配置保存、往返及重跑保留，切换配置和新建草稿重置。恢复默认和键盘说明折叠到「显示选项」，AI/程序按目标语言匹配名称仅作为 VIP 后续规划，不显示可用按钮。

鼠标从手柄启动；键盘空格拾起、方向键/Home/End定位、Enter提交、Esc取消。普通列表边界外取消及返回无按键恢复已测；CDP单步跳出opaque iframe可能缺少child离开/松开事件，离开瞬间的真实原生表现未证实，不冒称全部边界通过。本轮仅为真实 React + 模拟 SDK 的 SOURCE_COMPONENT_PREVIEW，不触碰 Framework、引擎、权限、安装包或旧 UNKNOWN。最终同候选截图、检查与独立评分见预览 README 最新增量。

---

## 历史：亮色与蓝色强调（2026-11-01，candidate1–7）

本节导航决定已被首节中性分段方案取代，保留原候选设计依据；下述颜色叠加与评分流程不再作为当前要求。

最新用户只看亮色。本轮保留原 Sidebar Tool / React owner、行内规则、公共 Button/Input/IconButton/Card 与唯一宿主导航；修改工具局部主题映射，不创建主题系统或修改 Browser。固定预览上次为旧表单，必须用最新源码重新生成。

采用雾白工作底、白色内容面、深灰正文；蓝色主操作，选中 Tab/配置行采用淡蓝底、深蓝文字并辅以下划线/边框与选中语义。未选、hover、focus、disabled 分别表达；绿色完成、暖色警告、红色错误/停止沿用语义。只保留目标卡这一主要内容面，不逐项套卡。唯一12px工作区gutter，4/8/12/16间距。相比全中性灰，蓝色使当前操作清晰；相比多彩按钮，单色强调减少噪音。色值由本轮设计判断，用户只明确亮色与清晰配色。

最小实施：App根显式light；替换过时Graphite局部样式；保留其他行为不变。编译本工具，原生成器冻结三件套；回放采集/停止/记录下载、配置库搜索返回/草稿、行内规则与JSON、AI占位。检查实际背景文字>=4.5:1、输入与焦点边界；同HTML SHA截图交独立AI设计评审，诚实评分。历史深色分数不继承。不进入安装、正式包、提交推送、真实AI/采集、Native/production或宽度缩放矩阵。

结果层级进一步收敛：配置选择为首行，状态与低频任务入口同一行；规则/JSON折叠目标卡省去重复标签；下载与显示列同一行，表格前仅一条说明；JSON禁止软折行、只在编辑器内部横滚，原格式/大小限制在可展开说明中保留。库中有草稿时保存为主、编辑为次，元信息网站可省略并保留完整title，字段数量不拆行；错误焦点用红色、行分隔回中性，避免无语义蓝线。

---

## 当前增量：采集字段一行输入兼展示（2026-11-01）

最终冻结candidate5独立AI设计97.0/100；53项离线操作与33项Node通过。评分仅覆盖规则行/显示列，后续并行源码变化、选择器助手及真实安装不外推，见[本轮证据](../evidence/ui-inline-rules-columns-20261101.json)。

用户希望消除一个字段占5–7行的重复表单。已在固定离线入口复现字段区578px，显示列表与编辑表单分离。类型仍为原 Sidebar Tool，owner、React根、公开Input/Button/IconButton、模型与Mock SDK均复用；当前只交付本工具同源预览，不调用真实采集/AI，不改权限或安装包。

采用一字段一行「字段名输入｜完整规则输入｜删除/JSON操作」，输入本身承载已存值；列头只出现一次；按用户最新要求删掉“采集字段”标题/数量，将“＋ 添加字段”移到列表底部居中。规则沿引擎语法保留 `::text` / `::href` / `::src`，不另放读取下拉框和禁用属性框。复杂对象/XPath/HTML规则只读，显式到JSON无损编辑；长文本在输入框内滚动和全选。列表容器/项是公共范围，单独展开，两条标签与输入同行，独立应用，不随字段编辑写回。

备选：仅收紧原表单仍保留重复；每行弹窗增加编辑跳转。选择原位行编辑，常态不显示应用/取消，未应用时出现一次，并就近显示错误；失焦不提交，运行/保存继续阻止未应用编辑。Enter应用、IME不误触，Escape撤销本次行编辑；删除先点名确认且默认取消，原模型保护最后字段/引用/忙态/UNKNOWN。取消通过工具模型内部checkpoint恢复原dirty，只恢复同一配置引用和身份，不回滚真实改动或其他草稿；旧selector/attr错误映射到当前rule输入。无新增依赖或公共组件。

显示列同步应用相同原则：每列一行“手柄｜显隐｜显示名称输入”，移除展示/重命名双态表单和重复类型；名称实时影响本次预览，Enter/失焦完成、Esc恢复本次聚焦前名称，IME不误触。只有别名与原key不同时在行尾显示原字段；原key也始终作为无障碍说明。排序帮助折叠，恢复默认放底部，状态仅有反馈时出现。原鼠标/键盘排序、原始下载完整性和结果身份边界保留。首评94.75后修正三项：字段草稿未应用时禁止编辑分页，防止交叉草稿互锁；删除失败提示归入当前字段行；有结果时下载回执仅放下载区。新增对应操作验证。

验证仅覆盖本次行为：无损解析/重名/公共范围隔离的Node回归；实际离线UI直接改、添加、应用/取消、属性、复杂JSON、错误、长值、删除和配置切换草稿保护。原生成器生成新目录三件套，冻结同SHA截图与来源核对，由独立AI设计子Agent实评分，目标>95，未达则修正。真实安装/采集/AI、真人屏幕阅读器、production以及宽度缩放矩阵未测，不外推评分。

---

## 历史：石墨黑灰视觉（2026-11-01）

用户要求提升交互预览美感，采用黑灰风格，并以独立设计评审 >95 为目标。本轮类型仍为 Sidebar Tool，owner 为本工具；入口为原 preview/preview.html，原 App + SDK 内存模拟。下一条操作为打开预览、选择配置、开始采集并查看结果。旧浅色预览已完成这条最短链；本轮不继承任何旧候选评分。

依据本文件 Visual language / Accessibility，选择公开 od-theme-shadcn 的 data-theme=dark（Neutral）而非新主题系统：近黑工作底、石墨卡片、较亮灰选中面与输入边界、柔白主操作，成功/错误仍保留语义色和文字。保留 canonical 浅色宿主；深色仅限工具应用。12px 唯一 gutter 与 4/8/12/16 间距不变；目标标题、主操作、分段导航和表格拉开层级。反对给全部控件同级灰底、满屏亮边或装饰性渐变；不新增依赖、公共组件或业务权限。

实施与验证：只修改原 App 主题声明及工具作用域样式；原生成器重建同源冻结 HTML/manifest/context。检查默认空态、完成结果、规则/JSON、配置库、记录详情、删除取消/草稿保护、AI 占位开合和键盘焦点；测量文字对比度并保存同候选截图，独立评审后修复实际扣分。正常窗口与默认缩放，不开展宽度/缩放矩阵。安装、真实采集/AI、Native、production 均 NOT_TESTED。评分是独立 AI 设计评审，不能充当真人认证或正式产品验收。

---

## 当前增量：配置库层级与任务路径（2026-11-01）

用户要求重设计「返回采集 / 配置库」并独立评分 >95。当前入口为工具原 src/App.jsx 的 profile-management 子视图，真实 React + 内存 SDK 的 preview/preview.html；类型为 Sidebar Tool，opaque iframe，公开 OpenDeskTool.request，owner 保持本目录，使用原 v2 包合同。本轮只交付同源交互预览，不改 Framework、采集执行、权限、安装包或历史 UNKNOWN。

设计决定：返回采集单独作为上级导航；标题、配置数量与新建组成明确页头；名称/网站搜索不改变当前配置，清空与无匹配态可恢复；保存列表采用柔和选中底色、勾选和「当前使用」文字。下方仅保留编辑规则与保存更改作为主要动作，复制、重命名、导出及需二次确认的删除收进「更多操作」。保留原 ID、模型、CAS、草稿、忙态与焦点合同；所有按钮继续复用公共组件和既有 Tokens。

实施顺序：先新增搜索、键盘和配置身份保护回放并在旧版确认失败；再修改本工具 JSX/CSS；只构建本工具并由原生成器生成冻结三件套；定向回放搜索、选中、复制/重命名、删除取消、草稿切换与返回；同 SHA 截图/行为证据交独立评审，未达目标继续修正。旧评分不外推，未做真实安装与采集不写 PASS。

结果：最终HTML SHA `70e32655996821464b72e2940a8b9621ae1a7665fa02892a8d3de7947448fea7`，独立评审98/96（最低96，>95）；同源配置库22项/原控件51项/状态11项通过，覆盖有重叠。删除文字对比度4.76989:1，1373来源输入无漂移。干净状态仅保留一处保存反馈；64px列表行高由工具作用域选择器确保不被Runtime覆盖。详情和边界见[交付记录](../../../../artifacts/scrapyjs/library-redesign-20261101/README.md)。

---

## 当前增量：采集按钮有文字，AI 占位仅限预览（2026-11-01）

用户明确要求：宽采集按钮显示「开始采集」，配置库只用图标，离线 AI 只显示最简单的窗口和实际使用入口说明。复用原 Button / IconButton / Host 展示事件，不改 SDK 或请求/身份合同；当前完整 Chat 只在实际入口使用，预览以显式开关渲染简洁 aside，实际入口默认关闭该开关。

展开规则后，原工作区依赖完整 Dock 注入 flex 样式导致占位落到视口外。新增真实视口包含断言先复现失败，再由工具自己的 workspace / business CSS 保证纵向布局、可滚动业务区和底部占位。最终截图完整展示两段说明。关闭、Escape、焦点返回、配置库往返草稿和零 AI 请求均有回放。

最终同源 HTML `c083b39a6dfe32b1128032c59df11b30d9c357a04bd9cb03562fb7e9be0d2e12`，51 项定向离线交互、默认完整 Chat 保留检查与本工具构建通过；[交付](../../../../artifacts/sidebar-preview-kit/scrapyjs-preview-handoff-20261101-evidence/README.md)。本轮不评分；预览交付后创建新对话完善实际扩展 UI，保留完整 AI 功能与历史 UNKNOWN 保护。

---

## 历史增量：规则分组、JSON 层级与受控确认（2026-11-01）

实际入口先复现原 flat 高级组、JSON 独占导出行和普通 role=group 确认。业务 owner 仍为本工具，沿用公开 Button/IconButton/Textarea、原模型和 SDK adapter；公开合同无 Dialog，不新增组件库或依赖。

字段与属性、分页与列表详情是常用编辑；高级采集方式/示例放在其后，三者同用 canonical od-disclosure 与 8px 组间距，不增加卡片嵌套。JSON 以「完整 JSON 配置」标题及说明命名编辑区，导出为右侧 quiet 图标/短文字动作，错误、下载回执、复杂规则和限额说明保留。运行操作使用紧凑播放/方块 IconButton，状态文字和等待原实例退休仍独立可读。

pendingAction 全部复用同一工具内 React 受控原生 showModal 对话框，明确 alertdialog 名称和描述。默认取消、原生 inert 背景加显式 Tab 首尾约束、Escape/取消及触发焦点恢复；输入组合事件阻止误确认，忙态及 unknown 不绕过模型。新建不增加额外草稿判定：干净已保存配置直接新建，模型产生的新配置本身属于未保存草稿，不能将其当作干净配置绕过原确认。取消保留草稿，确认才按精确身份执行。

同源候选 `2348b53038ce37fcbcce90e8839684c72e0325e3d1dee770b113d41829a8d705` 的45项离线回放通过，相关40项模型检查及本工具构建通过。首轮原生 Tab 越出 iframe 已按实际失败补约束；首轮冻结截图缺少组间距已另产新候选，旧证据保留。详见[本轮交付](../../../../artifacts/sidebar-preview-kit/scrapyjs-controls-20261101-evidence/README.md)。本轮不评分，历史评分仅属原 SHA；不恢复安装/真实AI/完整验收。

---

## 配置库子视图与紧凑列管理（2026-11-01，本轮）

目标是管理配置、整理结果、下载完整数据。沿用本工具唯一 React 根、业务模型、公开组件和原导出接口；无新增依赖或 SDK 缺口。离线模拟预览，不安装、不提交、不触发真实采集或 AI。

方案判断：原就地展开让配置 CRUD 与采集/结果混在一条长页面；独立浏览器页会丢失上下文且增加入口。采用工具内部子视图，列表图标加“配置库”文字确保可发现，tooltip/无障碍名称明确。进入后仅隐藏采集工作区，不卸载规则、结果或 Chat；返回恢复业务滚动和入口焦点。子视图提供返回、数量、网站/字段摘要、当前/未保存标记、新建、保存、切换、复制、重命名、规则编辑、配置导出和删除确认。原 CAS/身份/草稿/忙态与 UNKNOWN 保护不变。已有两份配置，无必要增加搜索、排序或虚构时间统计。

列管理采用紧凑列表：可见性、显示名称、原字段和拖动手柄；改名按需展开。手柄同时支持鼠标拖放和键盘提起/方向键定位/确认/Escape取消，暂存落位到确认后才更改顺序，实时提示位置并恢复焦点。表头仍承担字段阅读，避免与横向滚动冲突；列管理是唯一排序入口。保留全部隐藏和恢复默认；页面明确说明显示设置不改变下载。下载按钮为共用图标加 CSV / JSON 短文字，保留完整原始结果无障碍名称、忙态、防重复及原错误反馈。

验证以本轮行为为单位：子视图进入/返回、滚动/草稿/结果/Chat保留、配置身份和 CRUD 取消/确认；列鼠标与键盘排序及取消、改名/隐藏/默认/分页/结果身份；下载实际模拟字节不受显示列影响，空/加载/失败反馈。候选通过原生成器冻结，同 SHA 截图和操作供独立评审；目标为综合 >95，各维实报，不恢复历史逐维门槛或正式验收。保留浅灰按钮、白底选中页签、中性气泡，技术来源只进 manifest/交付材料。

---

# ScrapyJS 交互预览设计

## 2026-11-01 · 柔和按钮与可理解的配置库（当前迭代）

最新用户反馈取代下文黑色主按钮与三动作管理面板的决定；v4 评分仅保留历史范围，本候选重新评审。已从真实离线入口复现：选中页签近黑、管理只重复名称。当前仍为离线 React / 模拟 SDK，不扩展安装与正式验收。

设计与实现顺序：复用公共 secondary 浅灰主操作、outline 白底选中页签与 quiet 未选中态；不改全局官方 Tokens。管理改为“配置库”，列出已保存配置的名称、网站、字段数与当前状态；点击切换复用原 selectProfile 与草稿确认。当前草稿另设操作区，明确“复制为新配置”，提供编辑规则、导出 JSON、重命名和独立危险区删除。导出复用同一请求与防重复锁，副本不覆盖原配置；不新增导入/批量/历史等未经模型支持的能力。

先验证配置库切换、复制、导出、删除取消、焦点和草稿保护，再跑受影响工作区与 AI 回放；由新 HTML 与截图独立评审。技术来源与未测边界保留在 manifest / 交付记录，删除用户界面上的哈希和构建状态长段。

v5 首评94.4，未达标，原评审保留。实际截图与源码核对后，在工具作用域使用既有 secondary/foreground 与 Frame 公共气泡变量：发送按钮浅灰、用户气泡中性灰；开始/应用以边框、字重和轻阴影强化，导出 outline、放弃 quiet。命名按钮按结果写创建配置/保存副本/保存新名称。合并本工具已有重复 AI 审阅声明并移除失效 primary 布局规则，不改变共享组件或请求路径。新候选 v6 重新取证评审，不回填 v5 分数。 v6视觉通过前发现配置切换保存后键盘焦点丢失，最终v7等待选择完成，仅在原触发元素或BODY持有焦点时恢复可见、可用的触发项；主动移到其他控件时不抢焦点。当前综合评分、严格逐维差额与边界以交付记录为准。

## 历史 v4 · 按钮页签与配置管理

用户已明确要求有背景的按钮 Tabs、创建/保存图标，并授权直接判断管理入口。采用同一灰底分段组与 primary 选中按钮；保留 native tab 语义、方向键/Home/End与业务状态。配置选择右侧用公共 IconButton 新建/保存，管理用带图标文字按钮，展开就地轻面板。标题仅视觉隐藏，仍为配置区域命名。沿用原模型、命名、CAS、冲突与未保存确认；Escape 先取消内部操作，再关闭管理并恢复入口焦点。

选择就地面板，因为只有三项动作且原命名/确认已在当前上下文；滑出模态会重复焦点管理，Switch 会误导为设置状态。业务与面板均留本工具，复用原公共组件/图标SVG模式，不新增依赖。先验证最新配置操作、键盘焦点与视觉，再生成同源候选及独立评审；v3与历史评分不外推。真实AI/安装/生产验收均不在本轮。

## 官方 React Aria 风格试点（2026-11-01）

本节是历史 v4 视觉迭代；后文审阅层级与旧分数保留原候选范围。真实入口为本目录 `preview.html`，冻结交付见[同源候选](../../../../artifacts/sidebar-preview-kit/official-scrapyjs-20261101-reviewed-v4/preview.html)；持续编辑复用43127独立Mock服务。唯一业务 owner 仍是本工具，无新增 SDK/Host/Authority/安装合同。

按[官方来源与明确偏离](../../../../docs/api/sidebar-preview-kit.zh-CN.md#官方风格试点合同2026-11-01)使用 aria-nova / Neutral，唯一视觉值在 `src/ui/design-tokens.css` 与 `design-system.css`，组件根仍是 `src/ui/react/components/ui/`。应用 workspace 选入 `od-theme-shadcn`，覆盖业务及底部 Chat；不改变外层可信工作台或其他工具皮肤。

- Button 以 `base="aria"` 使用真实 RAC；Input/Textarea 使用公开包装，保留事件、ref、ID和禁用条件；原生 select、checkbox 与工作区键盘页签保留。首次中间候选暴露 RAC Button 覆盖 tab role，已恢复页签 native 路径。
- 主操作黑色，次要/描边/轻量/危险确认区分；字段降低默认边框重量并保留可见焦点。标签与规则行减重，同类集合单表面，结果空态和列设置减少重框。
- 布局只在本工具持有，沿用分区16、关联项8、卡内12的现有节奏。正文、帮助、错误与状态各有层级；完整规则/JSON/结果/审阅资料按需展开而不删内容。
- Dock、Frame、session、业务节点和请求状态保持挂载；收起保留草稿、焦点与原请求，显式应用/命名保存继续。未知请求不能自动重放。

当前[工作区回放](../../../../artifacts/sidebar-preview-kit/official-neutral-20261101-v4-evidence/scrapy-core/report.json)72项与[Chat回放](../../../../artifacts/sidebar-preview-kit/official-neutral-20261101-v4-evidence/scrapy-chat/report.json)42项绑定v4 HTML SHA `b8d9db6179f95a11ccb323d8b80939bd5fb371262ea8f817a8a47313bcaf37ef`，包含对应截图。最终来源、独立两位评审与交付同步状态见[本轮交付记录](../../../../artifacts/sidebar-preview-kit/official-neutral-20261101-v4-evidence/delivery.json)。仅为离线 SOURCE_COMPONENT_PREVIEW；真实模型、网站采集、Native、安装/production、真人屏幕阅读器和真实IME均未由此证明；缩放/物理宽度矩阵不在本轮。

## 2026-11-01 · 审阅可发现性与共享 Chat 层级

本节为本轮增量设计，后文 2026-10-31 的评分只属于历史候选。根 DESIGN.md 的并行工具设计保留；本轮只改本工具 UI 与离线交付。

实际入口：`preview.html`；持续开发复用已有 `http://127.0.0.1:43127/preview/dev.html`，不停止服务。现有 Sidebar Tool / opaque iframe 通过公开 `@opendesk/ui` 的 Dock / Frame / session 展示，推理仍走原 `OpenDeskTool.request`。业务 owner 为 `examples/sidebar-tools/scrapyjs/`；无公共 SDK 缺口，不改 Framework。离线 HTML 不是 v2 安装包，真实安装/Provider/采集保持 NOT_TESTED。

基线核心链已运行：打开 → 顶栏 AI → 输入 → 明确勾选网页资料 → 固定模拟提案。截图证实提案返回后滚到末尾，技术折叠项占据可见区域，差异/应用在上方；Chat 无可见标题，发送阻断缺少输入旁的原因。

采用原真实 React UI 同源预览；不另画 HTML 或复制消费者业务。保留 ready 工作区，完善五项：

1. 通过 Dock.toolbar 显示“AI 配置”及当前阶段；工具局部布局让文字不遮挡分隔条/收起按钮。
2. 新有效提案仅在 Chat 内定位审阅标题，不抢输入焦点；普通消息只在接近底部时跟随，收起重开保留阅读位置。
3. 差异优先展示，保留字段按需展开；HTML 样本、Provider、错误上下文及调用记录集中到一个 canonical“更多资料与诊断”，完整内容不删除。
4. 输入框旁显示当前发送阻断原因，条件满足即移除；资料选择和既有请求围栏保持。
5. 审阅动作放在滚动区之外的独立底栏，并使用 Dock 原有 expandedFeedback 保障提案反馈空间；差异与完整 JSON 不会被动作覆盖。candidate2 曾有新值文字下缘 2.53px 遮挡，层级评分94未通过；原评审保留在 `artifacts/scrapyjs/design-20261101/candidate2/independent-review.json`。

样式沿用 R27 Tokens、公共按钮/表单/disclosure、12px 单 gutter 与 4/8/12/16 节奏。共享参考由原 `sidebar-preview-kit.mjs create` 生成 `artifacts/scrapyjs/design-20261101/components/components.html`，不另造模板。对话草稿、实例、业务编辑器持续挂载；未知结果不重放；应用→命名保存→单独采集保持。

验证计划：原 AI 状态 Node 测试；原 Chat 浏览器驱动补充标题/阻断提示/审阅落点/完整保留字段可达断言；受影响工作区操作；同候选截图、computed 字级/间距/对比与分隔条操作；同 SHA 来源锁；独立八维分别 >95。仅工具 UI 构建与离线候选，不做 Browser build、正式包晋升、安装、真实 AI、宽度/缩放矩阵。新评分以本轮证据为准。

冻结设计候选 `078926cb…` 新跑42项 Chat、62项工作区、11项设计/公共组件操作及10项 Node检查，生成与设计回放时1371项来源锁匹配，默认审阅值与底栏相交为0。candidate3设计复评通过后，发现3项并行源码更新；已保留其原评审并纳入源码重新生成candidate4，没有覆盖并行改动。其后工作区继续出现并行App与dist更新，交付按冻结HTML和manifest绑定，不声明当前工作区 SOURCE_PARITY_PASS；具体漂移见 [设计验证](../evidence/ui-design-browser-20261101.json)。

[最终独立设计子Agent评审](../evidence/ui-design-review-20261101.json)八维100 / 98 / 100 / 99 / 99 / 100 / 98 / 99，均>95且无冻结设计范围阻断。交付为 `artifacts/scrapyjs/design-20261101/candidate4/` 的同SHA三件套。本工具固定三件套交付前已由并行owner更新，guard拒绝覆盖；保留其输出，不将本轮冻结评分外推给该位置。当前离线设计已交付，不恢复真实AI/安装/正式验收。

---

[2026-10-31 历史独立复评](../evidence/ui-toolbar-chat-review-20261031.json)：100 / 96 / 97 / 99 / 98 / 100 / 97 / 96，仅属于其原候选，不代表本轮评分或原生验收批准。

## 沿用组合：工具栏入口与底部 split（2026-10-31）

完整工具栏 Chat 组合是 **Host 公共入口 + workspace/business + SharedConversationDock + SharedConversationFrame/session**。工具通过 `OpenDeskTool.setConversationState({visible:boolean,open:boolean})` 声明展示状态，从 `OpenDeskTool.root` 接收 `opendesk:conversation-action`，其 `detail` 为 `{action:'toggle'}`，再受控更新 open。这些能力仅控制展示，不授予权限、不自动发送。`SharedConversationDock` 是纯展示组件，使用受控 `open/onClose`；消息、输入和会话继续使用原 Frame/session。Host 实际安装入口为 NOT_TESTED；本轮验证层级是工具源码与 preview 模拟。

实际参照为 `projects/bookmark-manager/preview/react`，它消费真实 App + TrustedWorkspace：HeaderSlot 中小字 AI 按钮紧挨卸载；展开后业务在上、Chat 在下，以细分隔条形成底部 split，支持拖动及键盘调整；收起回到按钮，重开保留草稿。此处只复用公开组合与交互，不导出 TrustedWorkspace/HeaderSlot，不跨 iframe DOM，也不复制书签业务。

Frame 示例只是消息/输入片段，不能作为完整工具栏 Chat 范例。公共 `components.html` 顶栏的小 AI 按钮也必须能够实际开合底部 Chat，不能只有内容区 Frame。业务节点、当前页签、编辑与 Chat 草稿、消息和提案保持挂载；收起不取消请求、不清除 busy/UNKNOWN 围栏、不自动重发。

信息架构：Host 顶栏 AI → workspace 内上方 business（配置、目标、结果/规则/JSON 与领域审阅）→ 细分隔条 → 下方受控 Dock → Frame/session。业务拥有资料同意、提案校验、差异、应用/保存；公共展示组件不承担业务或推理授权。旧内容区 AI 配置 + 嵌大 Frame 的架构错误，不能仅调整间距后沿用旧评分。

先实际入口与参照对照，再审查规范/模板来源。八维各 >95 的用户要求保留；不足证据 NOT_SCORED，不强行打分。维度为需求、样式、层级、反馈、键盘焦点、复用隔离、维护、证据。评分必须绑定同 SHA 截图与定向操作，旧 100/99 等分数不构成新标准。

最短步骤：

1. 先回放真实 consumer 的 AI 开合、底部 split 调整、收起焦点和重开草稿，对照当前失败或未验证点。
2. 核对公开合同与已有 Host 入口，按完整组合保留业务、Chat 与原请求状态；不以内容区 AI 配置加大 Frame 代替。
3. 使用原生成器输出新目录，保留工具、运行时、组件与 HTML 的来源 SHA，不手改生成 HTML。
4. 对同 SHA 候选保存截图与受影响行为的定向证据，含顶栏按钮开合、拖动/键盘分隔条及草稿保留；未执行项写 NOT_TESTED。
5. 固定交付 `preview.html`、`preview.manifest.json`、`preview.context.json` 三件套，不混用不同候选。新证据见 [工具栏 Chat 记录](../evidence/ui-toolbar-chat-browser-20261031.json)，未执行项保持 NOT_TESTED。

当前源码及模拟产品已按工具栏/split 组合重跑，34 项 Chat、62 项工作区和 18 项 Node 检查通过；来源与截图见上述证据。保持离线，不提交推送/包晋升/安装/Browser build/真实 AI，不恢复完整验收。原 CAS、身份、撤权与 UNKNOWN 不重放保护保留。

<details>
<summary>历史设计与评分（保留原候选范围，不作为当前实施标准）</summary>

以下关于配置下方 AI、仅 Frame/session、无需公共 API、当前 SHA 或评分的判断均已由上方纠偏取代；原始历史记录保留，不宣称新组合已验证。


## 历史修订：公共样式来源与内容区 Frame（2026-10-31）

旧间距评分均为历史，本次重新验证。业务 owner 仍是本工具；阶段是离线真实 React / 模拟 SDK，未提交、安装或晋升正式包。

### 已观察的原因与决定

- 实际消费者已核对：`projects/bookmark-manager/src/react/App.jsx/style.css`；`examples/sidebar-tools/cookie-editor/app/CookieEditorApp.jsx/src/react.css`。两者也有业务皮肤，不能把其私有外观当作公共规范。保留其文件与现有43134服务只读。
- ScrapyJS 原 Runtime 只发布 Tokens、Button/Card/Switch，Frame 自带 `conversation-frame.css`。工具原来没有编译 canonical 表单与 disclosure，反而用全局 input、textarea、details/summary 自绘，故“套同一外壳”仍未得到同一内容风格。此项是工具接入缺漏，不是已证实的 SDK 故障（SDK_GAP_NOT_PROVEN）。
- 改由工具原 Vite 插件调用 `scripts/preview/shared-tool-design.mjs`，提取公开、无特权 CSS；dev:mock 与静态编译走同一插件。字段、标签、标题、折叠区显式使用 od-*；目标卡用真实 Card/CardContent。外部设计来源单独记录在构建回执 designSources，原预览生成器拒绝来源漂移。没有复制完整宿主 CSS。
- 迁移中的首个中间候选曾用 `.capture-app textarea`，其高优先级会覆盖 Frame 的比例字体；交付前已排除 `.od-conversation-input`，代码编辑器保留等宽字体。原基线 Chat computed 已是比例字体，不把这项迁移防护冒称旧版根因。Chat 的容器只负责 flex column / 局部消息滚动，Frame 拥有气泡、输入及 Send/Stop；session 和原 ai.* 请求围栏不变。
- AI 区域移到配置下方，打开时聚焦对应标题；目标、页签与业务编辑器不卸载。资料勾选保留明确同意，网址单行截断但 title 可看完整值；输入、消息、审阅、应用、命名保存保持原状态机。
- 公共组件配方原来没有 Chat，现沿原 `sidebar-preview-kit.mjs create` 的 `components.html` 展示真实 Frame/session 与容器，外部辅助区模拟 ready/busy/error/blocked/review。唯一入口见 [预览套件](../../../../docs/api/sidebar-preview-kit.zh-CN.md) 和 [原预览 Skill](../../../../.agents/skills/opendesk-ui-preview/SKILL.md)。不引入新框架或可信 Workspace。
- 首次风格来源复评的层级维度95分，未过门槛：输入缺少可见标签，返回后仍可原样发送且有重复提示。已在工具反馈槽增加关联可见标签；有效提案保留时阻止原样重发，纠正需求后可生成替代提案，放弃后恢复发送；删除重复就绪提示。旧需求、消息、stale校验和原请求围栏均保留。原未通过评审保存在 `artifacts/scrapyjs/style-source-20261031/review-candidate2.json`，不改旧分。

### 验证范围与完成依据

本次 canonical 字段/disclosure 影响所有业务表单，因此定向复用原工作区操作驱动，覆盖规则、JSON、结果列、配置管理与焦点；AI 驱动覆盖输入/开合/提案/保存与 busy。另核对当前截图、computed 字体/类名/间距、来源回执和 opaque/CSP。只构建工具，不构建 Browser。最终候选SHA `d2bc23d59a6bb563fbe576769f03b51dc09586d12dbdeace61e2f036860e51e5`：28项AI浏览器操作、6项AI Node检查、11张截图与1369项来源锁匹配；62项工作区及11项来源阶段Node证据保留前一候选原范围。[独立子Agent复评](../evidence/ui-style-source-review-20261031.json)八维100 / 99 / 99 / 99 / 98 / 100 / 98 / 98，全>95且无当前功能阻断；保留各项扣分与未测边界。完整绑定见 README 与 GOAL，不沿用旧评分。


## Source of truth
- 当前风格来源修订以前文为准；下述间距问题及原候选2px Chat属于历史修复，旧评分不证明当前候选完成。
- Active，2026-10-31。本文件只约束 ScrapyJS 侧栏预览及其同源 UI；根 DESIGN.md 的其他工具工作保留。
- 来源：本工具 README、src/App.jsx、Results.jsx、AiPanel.jsx、INTERACTIONS.zh-CN.md；独立 scrapyJsChrome 的 popup_crawl/recipes 仅参考功能。
- 最新纠偏：AI 按钮在当前工作区展开/收起共享 Chat，不能替代业务页面。独立评审各适用维度 >95（整数至少96）；目标和关键测试条件统一见 [GOAL.zh-CN.md](GOAL.zh-CN.md)。真实模型、站点采集、安装及生产验收独立记 NOT_TESTED。
- 风格依据：[R27](../../../../docs/architecture/ui-layout-conventions-r27.zh-CN.md)、[预览套件与组件组合](../../../../docs/api/sidebar-preview-kit.zh-CN.md)、[现有 Atlas 入口](../../../../prototypes/sidebar/extension-ui-showcase/index.html)、`scripts/preview/sidebar-component-recipes.jsx`。外壳仍取 canonical template / shell-source / shell-behavior，未另造模板。

## Brand
沉稳、清晰、可预测的数据工具。沿用 OpenDesk 语义色和公共按钮，避免装饰性统计、满屏卡片及多个同级主按钮。

## Product goals / Personas and jobs
为需要重复采集列表数据的用户提供：选配置、核对目标、开始/停止、读取完整结果、整理显示列及导出。规则和 JSON 保留专业能力，AI 提案仍需审阅、显式应用和保存。
不新增录制器、云节点、真实模型调用、公共 SDK 或浏览器权限。

## Information architecture
配置选择与保存 → 就地 AI 展开区 → 目标上下文和运行 → 结果 / 规则 / JSON。AI 收起时不占位；展开时配置、目标、当前页签和业务编辑器保持挂载。页面负责上下文与提案滚动，Chat只保留消息局部滚动；完整JSON默认折叠，差异与应用/放弃保持相邻。目标网址直接使用单行输入框，不再折叠或重复显示标签；保留无障碍说明及就近错误。管理操作、显示列、运行和 Provider 技术详情按需展开。

## Approaches / Design principles
1. 独立重画 HTML 易与真实功能漂移；不采用。
2. 复制旧 Chrome popup 布局无法适配当前工具及其授权模型；仅取功能参考。
3. 采用现有 React 组件同源预览，Mock 仅替换 SDK 边界。保留业务 ID、模型、存储、任务与 AI 未知状态保护。
4. “独立 Chat”指公共展示/会话的职责独立，不能解释为独立 AI 页面。书签正式消费者 `projects/bookmark-manager` 的 dock adapter 和可信 Workspace 仅作最小交互参考；沙箱只用公开 Frame/session/ai.*。本次无需公共 SDK 改动。
主动作清楚、上下文就近、技术细节渐进呈现；通过布局分组降低认知负担，不删除已有功能。

## 组件发现与复用

| 已有组件 / 样式 | 本轮复用 | 缺口与处理 |
| --- | --- | --- |
| 公共 Button / IconButton、tokens | AI 开合与提案动作沿用现有 Button，共享发送/停止沿用 Frame 的 IconButton | 不新绘按钮，不新增依赖 |
| SharedConversationFrame / createConversationSession | 一次创建、稳定挂载；只切换可见性，卸载时仍走原释放 | 原先隐藏业务属于工具布局问题，工具内修正 |
| 原生 label/input/details 与工具静态 CSS | od-* canonical字段、标题、disclosure经原提取器进入工具编译；保留12px gutter及焦点 | Runtime 无 Field/Select/Dialog API；不虚构导出、不注入完整宿主 CSS |
| Card / Switch 与组合示例 | 目标卡改用真实Card/CardContent；资料同意保留原生checkbox | 不增加嵌套卡片或改写资料勾选语义 |
| 原预览生成器和 canonical 外壳 | 同一真实 App、编译回执、来源 SHA 和外部 Mock 控制 | 不创建第二套 UI / 预览体系 |

## Visual language / Components
使用现有 --od-*、--space-*、--radius-*；章节16px、组12px、同行8px、元信息4px。一个页面 gutter，局部表格滚动。相关控件和说明用4px关联组，外部组间距保持8/12px；有边框disclosure沿用12px surface圆角，flat无外框。正文13px，标题14px，辅助文字12px，优先保证对比度。公共 Button、原生字段、Tab、details、dialog；图形仅使用内联装饰 SVG。

本轮布局修复计划：保留唯一12px工具gutter和现有canonical外壳；折叠内容用单一 `.disclosure-body` 管理12px分组间隔，删除对子项普遍加margin的规则；标签到字段8px、相关说明4px、原生checkbox margin归零。目标的标题/网页名组成4px信息组，刷新复用IconButton；主运行按钮不再叠加顶部padding。Chat资料使用紧凑fieldset保留未勾选的真实同意状态，样本与技术详情后置，完整JSON按需展开，消除max-height网格压缩。只改工具UI源码，不改公共Frame、SDK和权限。

## Accessibility / Responsive behavior
正常窗口与默认缩放；不做物理宽度/缩放矩阵。Tab 方向键/Home/End、可见焦点、Escape 取消、详情返回焦点、label/错误关联。表格保留 caption、列头、完整记录和非颜色状态；尊重 reduced-motion。不以隐藏内容失去可达性换取密度。

## Interaction states
- 初始/空：说明下一步；成功：记录与导出；运行中：原实例停止，编辑锁定。
- 无效/未应用规则：保留草稿且说明原因；权限拒绝：禁止运行；失败：显示原因与运行详情。
- Unknown：保留原身份且禁止重放；AI 真实恢复问题不由预览重置来解决。
- AI 开合不 unmount、不取消或清 pending；busy/UNKNOWN 收起后仍有“AI 请求待处理”提示及原锁，展开仍只能操作原请求。消息局部滚动不因开合重置；关闭/Escape 返回 AI 按钮，IME Escape 不关闭。放弃提案返回输入。
- 生成资料、原配置/网页、Provider generation 与提案校验沿原状态机。应用后就地打开命名副本，保留 Chat；只有显式保存写配置，采集仍单独开始。复制配置后旧结果按原身份合同清除。
- 保存反馈按提案 requestId 与应用配置绑定；模型完成写入和读回后才确认此提案已保存。重名失败保留命名指引；切换、重命名或保存另一份草稿不能冒充此提案的保存回执。不用提示文本匹配推断状态。
- 预览控制在应用外，切换纯内存状态须保护当前草稿和 busy 状态。

## Content voice / Implementation constraints
使用“保存配置、开始采集、完整记录”等具体动作。模拟说明留在外壳；不把成功模拟写成真实业务完成。
复用原 Vite、preview/build-preview.mjs 和正式浅色外壳；仅构建工具 UI 和本机预览 presentation，不触碰 Browser dist/development 或其他 watcher。

## Verification and independent review
先验证“AI 就地共享 Chat”和“规范/模板来源正确”两个前提。新候选按八个适用维度各100分独立评审：需求符合度、样式一致性、层级可读性、操作反馈、键盘焦点、复用隔离、可维护性、证据充分性；每维>95且无阻断才通过。每项包含观察、扣分与证据范围，评分绑定同候选 SHA、截图和操作结果。旧六维97分只是历史证据，不覆盖最新纠偏；不强制给分，不用检查数量换算分数。

本轮固定细项，每维五项各20分；轻微问题每项扣1–3分，影响操作扣4–10分，功能不可用或缺失扣11–20分。无证据写未验证，不自动给满分。样式与层级必须读取computed style并看真实截图；引用token或模板不能替代实测。

| 维度 | 五项固定检查 |
| --- | --- |
| 需求符合度 | 就地Chat；业务草稿保留；提案完整审阅；显式应用/保存；采集独立 |
| 样式一致性 | 单gutter；4/8/12/16间距；公共按钮/图标；表单/disclosure层级；对比与字级 |
| 信息层级可读性 | 目标密度；输入可发现；差异动作邻近；JSON/诊断渐进展开；滚动职责清楚且内容不压缩 |
| 操作效率反馈 | 主动作；必要发送勾选；保存失败/成功；收起不取消；UNKNOWN不重放 |
| 键盘焦点 | 页签；发送/换行/IME；关闭返回；错误焦点；审阅与详情可达 |
| 组件复用隔离 | 原模板；Button/Frame/session；工具CSS归属；公开ai边界；opaque/CSP |
| 可维护性 | 单布局owner；无margin叠加；状态回执明确；无新依赖/第二状态机；原生成链 |
| 证据充分性 | 新操作链；computed间距/Chat高度；多状态截图；同SHA来源锁；未测边界如实 |

## Open questions
- 已安装应用与当前候选 UI 的原生一致性，本轮不验证。
- 旧 AI 请求 UNKNOWN 与 CSDN 验证码仍按原核心状态记录，不在纯预览中恢复或重试。

## 已证实的公共 UI 缺口与最小修复

- SharedConversationFrame 的鼠标 Send 使用原生 form submit；opaque sandbox 无 `allow-forms`，真实 Chrome 报阻止提交，回调未到达；Enter 的直接受控回调可达。工具没有公开的 Send click 覆盖入口，内部绕过需复制共享 Chat，故修复共享 `conversation.tsx` 的按钮为 `type="button" onClick={submit}`。仍保留原事件、IME/blocked/空输入保护和 form 的兼容处理；不新增权限、Host、Provider 或业务判断。回归涵盖鼠标、Enter、Shift+Enter、IME 与 blocked，浏览器再次实际点击。
- 公共 Button 的 disabled 外观原来只在文档级 `button:disabled`，Shared UI 发布的公共 CSS 切片没有这一规则，opaque 工具的禁用 Stop 仍看起来可操作。只在 canonical `design-system.css` 公共切片补 `.od-button:disabled,.od-icon-button:disabled`，沿用原透明度与光标，不复制主题。浏览器验证真实禁用属性与计算外观。该修复对所有公开 Shared UI 消费者有效，未改变身份、授权或生命周期。
- 两处公共修复只经当前源码的内存编译、定向回归和离线 Chrome UI 验证；实际 Browser 构建、安装及可信消费者原生验收仍为 NOT_TESTED。本轮没有手动重载 Browser 或触碰未知请求。

</details>
# 历史：规则点选与手动验证初案（已由用户纠偏取代）

目标：原手填 CSS 保留，增加「网页点选 → 取值方式 → 样本验证 → 填入草稿 → 显式应用/保存」。本轮是离线交互方案，真实点选与只读验证尚无公开 Sidebar SDK 接口，不调用私有 Host、网站 DOM 或现有有导航副作用的采集 Task 冒充验证。

选择：复用原 App/RuleEditor 的草稿、应用、保存与运行锁；预览 entry 单独注入 RuleAssistant，实际安装 entry 不加载样例 DOM。原生成器记录新输入并生成固定三件套，不手改 HTML。相比仅加一个无响应按钮，本方案可实际操作；相比改 Browser 新增权限，范围保持在本次预览。

实施计划（writing-plans）：
- [ ] 先用真实 DOM 测试锁定相对 CSS 生成、文本/href/src、无匹配/多匹配/空值/非法 CSS，再实现预览专用 helper。
- [ ] 原规则顶部增加「网页点选」「验证规则」。点选对话框包含字段选择、新字段命名、可点击网页样本、取值方式、可改 CSS 和即时逐行验证。填入只创建未应用草稿；取消/Escape 恢复焦点，IME 不误关。
- [ ] 全字段验证显示每条规则的覆盖率及样本；零记录不算通过，未应用草稿/运行/UNKNOWN 时不可打开；弹窗期间守卫外部重置与配置切换。配置/列表范围修改使旧报告失效。
- [ ] 工具定向构建与离线浏览器回放，截图与来源 SHA 绑定，独立评审后修复实际问题。评分只涵盖离线方案，真实网站/安装/原生/production 未验证。

后续真实方案：先由平台 owner 证明公共能力缺口，再在原 Authority/Host 内评估文档绑定的 picker 与只读 probe。要求用户启动、目标 tab/frame/document 绑定、滚动高亮/取消、导航及撤权失效、稳定属性优先与唯一性证据、列表相对选择器、有限样本；不得返回 Cookie/整页 HTML、执行任意代码、隐式跳页或未知后自动重放。验证分语法、匹配、值完整性与人工语义确认；单页样本通过不保证跨页正确，分页及详情另行验证。

