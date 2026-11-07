# Design

## 作用域与本轮入口（2026-11-01）

- 本轮官方风格试点：[独立状态入口](#当前获批官方风格试点2026-11-01) → [官方来源与组件合同](docs/api/sidebar-preview-kit.zh-CN.md#官方风格试点合同2026-11-01) → [工具接入指南](docs/api/sidebar-tool-development.zh-CN.md#获批官方风格试点2026-11-01)。实施方向已获批；最新v7按用户反馈采用浅灰按钮与配置库；交付与评分见当前试点入口，用户视觉终验不由离线评分代替。
- 下方原 `Source of truth` 及其阅读目录章节保留 reading-toc 多语言历史作用域；其批准、评分与证据不构成本轮试点或全局 UI 的批准。AI Proxy、Fingerprint 及其他独立章节各自保持原作用域。

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
