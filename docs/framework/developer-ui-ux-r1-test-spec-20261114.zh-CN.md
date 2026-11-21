# 开发 Tab UI/UX 关键测试条件 R1

**最新增量（2026-11-17）：** 以[第14节](#developer-results-saved-tests-20261117)的结果、手动保存及同源码组件验证为本轮完成条件；旧原生矩阵保留证据边界。

**当前独立增量（2026-11-15）：** 本轮离线原型按[第13节D01–D09](#developer-prototype-permissions-tests-20261115)验证；下方正式产品实施与旧评分保留各自证据范围。

日期：2026-11-14。对应[优化目标](developer-ui-ux-r1-20261114.zh-CN.md)与 [DESIGN.md](../../DESIGN.md#开发-tab-uiux2026-11-14独立作用域)。**当前以11.5的核心实施验证为准，覆盖此前仅离线/待确认及第1–10节冲突的矩阵与95+要求。** 旧分数不证明当前产品达标；源码/Node/实际侧栏DOM与原生动作分别报告，安装和production仍NOT_TESTED。

## 1. 测试原则与证据

- 先验证实际默认宽度、正常缩放下的一条核心链；记录真实 CSS 宽高，不为测试另设“理想宽屏”。首屏几何、操作可达、遮挡与观感必须来自同一实际原生 Side Panel 候选。
- 每项运行前说明对应改动、要证明的行为和缺口；复用现成检查，只有真实覆盖缺口才新增行为测试。不新增样式字符串/文案镜像断言，不运行根 `npm test` 或无关全量 CI。
- 绑定日期、浏览器版本、实际扩展 ID/加载路径、mode/edition、开发服务状态/applied revision、相关源码与产物 SHA、视口、截图和回执；有 dirty 时不能只记录 Git HEAD。来源/页面/包/运行 identity 保留原校验。
- 源码静态检查、Node 行为、源码预览、真实原生操作分别标记。每项记录 PASS / FAIL / NOT_TESTED / OUT_OF_SCOPE 与原因；失败先分产品、断言/驱动、环境，不让产品迁就过时选择器。
- 自动化默认 Ego Lite；原生 Side Panel、权限手势等能力须取得对应证据。必要回退先说明具体能力缺口，保留现有资源；不把普通标签页或预览冒充原生侧栏。

## 2. P0 关键条件

| ID | 用户操作/条件 | 必须观察的结果 | 证据与触发范围 |
| --- | --- | --- | --- |
| K01 首屏层级 | 正常就绪态打开开发，分别查看直接编辑和本地项目 | 唯一页首；来源、对象、目标状态和适用主操作可辨认；直接编辑首屏可见源码起始内容，本地项目首屏可见项目选择与状态；无需管理/诊断完成主链；无常驻 runId/SHA/安装长表单或重复帮助 | 真实前后截图＋DOM/计算样式；首屏改动必测 |
| K02 统一外观 | 与同候选相邻 Tab 比较页首、按钮、字段、提示、折叠和焦点 | 复用既有组件/Tokens；单 gutter，边缘对齐；无装饰性套卡、竞争主按钮、整页横向滚动或 Dock 遮挡；技术信息可局部滚动 | 同尺度截图/实际测量；布局改动必测，共享 CSS 改动补真实消费者 |
| K03 直接编辑 | 选来源/类型/适用环境，编辑源码与参数，明确 Run | 编辑和选择不会执行；动作进入原编译/RunHost；结果对应本次输入与目标；保存入口可见且不成为运行前置 | 原生最短主链＋回执；JS Controller/Page 为不同路径，受影响 JSX/Vue 分别核对 |
| K04 本地项目 | 选已授权项目，查看准备状态，执行适用的运行或“在侧栏调试” | 项目状态先于可选配置；独立项目首次调试不以建立工具关联为前置；已有关联因安装身份变化而失效时保留原重新确认和禁止静默换目录保护；按项目类型呈现主操作，Sidebar 调试与 Page/Controller Run 不混淆；不运行 npm、不隐式安装 | 原生项目链＋现有 controller 定向测试；本地区域改动必测 |
| K05 返回与草稿 | 编辑中文/参数，切换允许切换的来源/子视图，打开管理/历史后返回；存在 dirty/busy 时尝试离开 | 遵守原允许/拒绝/确认语义；保留草稿、代码类型、选择、结果及合理滚动/焦点；取消确认仍在原实例；状态更新不重建正在编辑的控件 | React 行为＋原生交互；导航/显隐改动必测，不以跨重启持久化扩写范围 |
| K06 保存与安装 | 找到版本入口，保存/加载当前对象，进入验证或安装审阅并取消 | 草稿/只读快照/冻结候选可辨认；保存不安装、不运行；ID/revision/hash/generation 和权限审阅沿原链；被移动的旧功能均有等价入口 | 原业务定向测试＋受影响原生入口；版本/安装入口改动必测，不扩大为全量安装验收 |
| K07 结果与历史 | 成功返回后复制；进入记录选择历史、查看/下载，再返回 | 新结果/错误在当前视口可感知；历史与本次明确区分；复制/下载属于所选记录且保留原 Codec 类型语义；刷新/查询不会执行；普通成功不清无关错误 | 结果行为＋原生回执；结果/历史/反馈改动必测 |
| K08 Run/Stop 所有权 | 在改动触及的准备、运行或受管 UI 阶段停止；查看另一对象/Tab | 可用 Stop 始终可达，清楚表示取消准备/停止运行/停止调试；只作用于原 owner；终态/取消恰好一次，不重放，不因导航遗失停止能力 | 原 controller 定向测试＋同候选实际停止回执；Dock/导航/执行状态改动必测 |
| K09 阻塞与恢复 | 分别构造本地断连、Provider 未就绪、权限缺失及结果未知中受影响的状态 | 原因和适用下一步可见；不显示虚假“就绪/成功”；无关恢复不强制重配对；未知效果先查询，不自动重试；错误不埋在折叠区/滚动末尾 | 定向状态测试，原生覆盖实际触及的状态；未触及的故障注入延期 |
| K10 权限与目标 | 查看当前网页/固定运行目标，进入受影响授权/撤权入口 | 两种目标不互相覆盖；Chrome、Cookie、SDK 文档级服务/origin、目录授权分清；只读查询不申请权限；真实用户手势、精确身份与撤权继续有效 | 原 owner 权限测试；移权限入口、目标摘要或相关事件绑定时必测，安装审阅不省略必要披露 |
| K11 键盘与 IME | Tab/Shift+Tab、Enter/Space 操作新入口/选择器，Escape 关闭适用浮层，中文组合输入 | 顺序合理、焦点可见、隐藏控件不获焦；返回恢复触发点；IME Enter/Escape 不误运行或关闭；字段错误关联输入。正文对比度 ≥4.5:1，适用非文本控件 ≥3:1 | 真实键盘＋语义/样式检查；新控件/子视图必测，OS 实体 IME 未执行单列 NOT_TESTED |
| K12 原路径兼容 | 选择受影响的 JS/JSX/Vue、Controller/Page、Standard/Developer 或本地项目样本 | 原有可用路径保持；Standard 不因改 UI 装入大编译器；旧 HTML/Vue 工具不改源码也可经原 SDK/Host 使用；用户代码仍在原执行世界与 sandbox | 只测变更实际触及的路径，列明未触及/未验证项；不为覆盖表格启动全矩阵 |

K01–K05、K11 为基础 UI 门槛；其余按本次实际改动触发。标记“不触发”必须说明依赖未变；不能通过缩小范围跳过已受影响的权限、Stop、草稿或身份保护。执行期间只跑能解除当前阻塞或证明当前变更的最小检查组。

## 3. 可复用检查入口

以下是实施时按改动选用的入口，**不是本轮已运行清单，也不是全部必跑**。每组都须补足其不能证明的原生视觉/手势证据。

| 改动 | 现有检查入口（仓库相对路径） | 证明范围/限制 |
| --- | --- | --- |
| 字段、选择、输入及动作投影 | `tests/environment/developer-view-contract.test.mjs`；`react-sidebar-render-r3331.test.mjs`；`react-dom-input-csp-r3331.test.mjs` | 原 React owner、输入值/原生事件、资源释放；不证明真实 IME 或浏览器手势 |
| 开发页布局、结果/历史、共享外观 | `tests/environment/developer-layout.test.mjs`；`tests/framework/sidebar-develop-layout-r29.test.mjs`；共享 CSS 变更再选 `tests/environment/sidebar-component-contract.test.mjs`、`ui-layout-conventions-r27.test.mjs` | 布局合同与历史动作；文字/嵌套改变先核对断言是否仍有效，不用保留旧冗余制造 PASS |
| 本地状态、关联与预览 | `tests/environment/local-project-status-ui.test.mjs`；`local-project-connection.test.mjs`；`local-project-tool-preview.test.mjs`；`local-project-source-transfer.test.mjs` | 真实状态投影/调试边界；不代表本机 Native 已握手或实际编译成功 |
| 保存/安装入口 | `tests/environment/local-project-install-ui-r251.test.mjs`；`program-source.test.mjs`；按改动选 `script-editor-ui.test.mjs` | 原身份、快照、保存/安装语义；Page/Controller 选原 owner 对应测试，不跨类型替代 |
| 依赖、目标及权限 | `tests/environment/develop-dependencies-react.test.mjs`；`develop-host-controls.test.mjs` | 原依赖校验、目标/文档、手势转交、撤权和过期回执围栏；不替代 Chrome 实际授权 |
| Tab/子视图导航 | `tests/environment/sidebar-tab-memory.test.mjs` 及开发页相应行为测试 | 原记忆范围；新增子视图有实际覆盖缺口时补草稿/返回行为测试，不复制全套用例 |

## 4. 设计检查点、后续评分参考与阻断规则

本阶段使用以下六项检查点记录实际改善，不强制独立评分。用户后续明确要求独立评分时，沿用原合同**各项 ≥95/100**的参考目标，不以平均分掩盖弱项；使用当前真实候选截图、操作回执和组件来源。本轮另对源码预览作有限视觉复评，见第 5 节；该分数不等于六项产品维度或原生验收。

| 维度 | 五个检查点（每项满分 20） |
| --- | --- |
| 信息架构 | 来源明确；编辑对象明确；主流程无需高级区；次级入口具名；返回层级清楚 |
| 风格一致性 | 页首；字阶；按钮/字段；间距/对齐；语义色/状态均与现行系统一致 |
| 视觉密度与可读性 | 首屏显示该来源的创作内容（源码或项目选择/状态/主动作）；无重复说明/标题；无无效空白/套卡；主次清楚；长内容局部滚动 |
| 核心操作 | 编辑/调试可用；保存入口可发现；Run 语义明确；Stop 可达且对象准确；结果/历史可理解 |
| 状态与反馈 | 准备/运行可区分；空态有下一步；错误可恢复；未知无伪成功；成功回执可感知 |
| 可访问性 | 控件具名；键盘顺序；可见焦点/返回；IME 与输入保真；对比度/错误关联 |

仅在执行后续评分时，每个检查点：20＝完整且有证据；15＝有具体轻微缺陷但不阻碍操作；10＝明显影响发现/效率；0＝不可用或违背合同。缺证据标 NOT_TESTED，不折算得分，不发布该维度达标结论。≥95 意味每维至多一个轻微缺陷，并须记录缺陷与后续处置。该量表不自动扩大本阶段验证范围。

**任一已触发 P0 FAIL、功能被删却无替代入口、错误执行/安装、Stop 丢失、草稿丢失、权限/隔离回归或未知结果自动重放，均阻断产品完成；高视觉分不能抵消。** 原生能力被环境阻塞时报告缺口，保留可独立推进的源码工作，不降级证据冒充 PASS。

## 5. 当前执行状态与延期项

本轮已实施运行环境分段、代码示例、就近说明和本地状态/调试层级。`developer-editor-interaction.test.mjs` 用真实 React DOM 点击验证新 radio 的原生事件/字段桥接、忙态禁用、源码保留和 placeholder；现有 Controller/Page 路由及组件 Run/Stop 定向检查 10/10 PASS。Ego 源码预览的实测记录归 `artifacts/developer-ui-ux-20261114/ui-checks.json`，包括方向键与可见焦点、中文草稿、类型切换、本地顺序及同色输入边框。此结果只覆盖 K01/K02/K05/K11 的源码 UI 层，以及 K03/K08/K12 的 Node 受影响行为层，不代替对应原生条件。

后续交付最少包含：冗余处置对照、变更文件、同候选默认侧栏前后截图、已触发 K 条件及回执、六项设计检查点的证据、剩余失败与 NOT_TESTED。正式六维独立评分、完整宽度/缩放/主题/跨版本矩阵、全工具回归与 production 均延期，用户当前核心阶段优先。


## 6. 本轮新增的直接判定条件

| 条件 | 判定 |
| --- | --- |
| 环境选择 | 页面直接显示两项，值仍为 controller/page；鼠标与方向键调用原动作；忙态不能改变；切换不执行、不转换源码 |
| 默认示例（2026-11-14 最新要求） | 四类示例首次写入真实编辑值；JS 返回网页信息，React/Vue 为计数按钮。各格式的草稿、参数及身份独立保留，切回恢复修改和清空状态；原忙态、只读和可信事件保护保留；切换无执行、保存或权限申请副作用 |
| 说明准确 | React/Vue 明确指网页组件；组合帮助给出本地项目调试侧栏、扩展导入审阅组合包、打开或刷新获准网站的步骤；侧栏预览不会更新已安装网页代码，语言标签不授予执行权限 |
| 视觉与间距 | 编辑器/参数等 od-field 复用 --od-input-border；选中与focus分开；说明4px、字段组12px、独立组16px，仅记录实际样式与几何 |
| 本地项目层级 | 状态后紧接适用的连接/恢复，再放调试与可选关联；刷新后 Tab 可直达连接，Enter 仅调用原动作；折叠关联不隐藏已发生的阻塞原因，无工具关联的调试仍按原 controller/身份链处理 |

原生验证缺口：Ego Page API 不将新打开的原生侧栏列为可操作 Page，原生 UI inventory 超时。旧 watcher 已退出、旧 Web Flow pin 阻塞已解除；并行 writer 编译连接区后在帮助重编译时 OOM 退出；确认输出守卫释放后，原入口恢复的 dev writer（PID 65678）已编译最终帮助和 tool-shell，但实际加载路径、serve/applied revision 与真实 Run/Stop、Native、OS IME、installation、production 仍为 NOT_TESTED。输出就绪不证明原生应用。

基线已知失败：修改前现有 144 项组中 143 PASS，`draft import rejects empty/oversized sources...` 的大小上限断言失败；未以本轮 UI 改动修订该无关边界。其他失败须在本轮验证记录中分类，不删除安全断言换取通过。

## 7. 本轮验证结果（2026-11-14）

| 检查 | 结果及边界 |
| --- | --- |
| 新 radio / placeholder / 草稿 | `developer-editor-interaction.test.mjs` 真实 React DOM 点击通过，并确认本地调试反馈位于折叠区外；只证明 UI 桥接、不自动运行和源码保留，不冒充执行器测试 |
| Controller/Page 与组件执行保护 | `script-editor.test.mjs` 受影响选择/Run/Stop/编译路由 10/10 PASS |
| 本地状态反馈与原身份保护 | 最后修订后 `local-project-tool-preview.test.mjs` 10/10 PASS，覆盖显式调试失败反馈、精确目录、包更新后重新关联、未知来源拒绝与只读目录查询；新反馈回归在修复前失败、修复后通过 |
| 原开发结构/视图/React/本地预览 | 139 项中 138 PASS；一项 `local-project-status-ui` 失败为旧文案正则仍要求“实时开发预览”，当前 HEAD 已改为“在侧栏调试”，相关状态实现未由本轮修改；不改产品迎合该断言 |
| 修改前基线 | 144 项中 143 PASS；已有草稿大小上限断言失败，见第 6 节；本轮未修改导入上限 |
| Ego 源码 UI | `ui-checks.json`、`layout-check.json`、`scroll-check.json`：中文草稿、类型切换、方向键/可见焦点、同色输入边框、4/12/16px 间距、本地顺序和末尾内容可达均通过；所有动作运行在无 Host 的源码预览 |
| 有限视觉复评 | 同尺寸直接编辑 80 → 93/100，本地未连接 91/100；完整 Dock 可见。此为四项静态视觉复评，不是六维正式达标；连接入口后置已由本次续接微调，最终复评单独记录 |
| 续接恢复入口 | `developer-editor-interaction.test.mjs` 最后源码下 1/1 PASS；`recovery-ui-checks.json` 确认刷新 → 连接 → 首次说明的键盘顺序、焦点、预览回执、帮助开合及来源往返草稿保留。未重复未改动的 10+10 路由/身份组 |
| 编译与原生候选 | `recovery-final/inputs.json` 记录最终源码预览 esbuild 的 124 个输入；共享 writer OOM 退出后，原入口恢复的 dev writer 已编译最终固定 tool-shell，revision `aeba5af1596c…`。`recovery-development-output.json` 记录 revision/产物 SHA；真实安装态、已应用 revision 和 Run/Stop 未验证。未启动第二 writer、未改 pin、未复制预览覆盖 dist |

两项旧失败和原生缺口不应被写成“全量测试通过”；本轮正式产品验收仍为 NOT_TESTED。源码实现、定向 UI 结果与当前安装生效须分别报告。

续接同条件截图：断连态 `after-local.png` → `after-local-recovery.png`，直接编辑 `after-refined.png` → `after-editor-recovery.png`；`after-combined-help.png` 展示可操作的组合说明。画布 520×1000 CSS、工作台 360×820、浅色正常缩放，file:// 源码预览不接 Host，采集前等待开关动画与 checked 状态一致。最终有限视觉判定归 `review-recovery-final.json`，不恢复全量评分或验收。

续接最终有限复评：独立 designer 判定 `PASS_SCOPED_IMPROVEMENT`，本地断连态 **91→94/100**、直接编辑保持 **93/100**，具体子分与边界见 `review-recovery-final.json`；未发现新的源码预览视觉阻断项，停止继续改版，不将结果提升为原生/六维 ≥95 验收。

## 8. 最新白色布局增量的验证

本增量固定亮色，重点为开发排版，正式全量验收仍延期。只更新受影响的既有结构/样式合同，不新增源码字符串镜像测试。

| 检查 | 当前结果与范围 |
| --- | --- |
| 开发交互、结构与历史 | `developer-editor-interaction`、`developer-layout`、`sidebar-develop-layout-r29` 10/10 PASS；保存原 radio/原生事件、忙态、源码、历史与 RunHost 动作绑定 |
| 共享折叠与样式 owner | `sidebar-component-contract` 相关 7/7 PASS；完整组中的 Workflow 测试缺少 `chrome`，其遗留 DOM 使后续 SSR Portal 失败，未改动该无关环境或产品逻辑 |
| 扩展内诊断入口 | `extension-center-r47-interaction` 中旧 Page / companion 清理诊断 3/3 PASS，查看与返回不触发安装或清理重放 |
| 源码亮色预览 | `source-preview-checks.json`：同条件编辑器 320→208px（-35%）、控件共同起点、管理组 16px，React/本地切换后中文源码与 JSON 草稿保留；键盘开合及手动拉伸另有同源预览回执 |
| 来源与限制 | `workbench-source/inputs.json` 不含提案覆盖，记录真实源码输入；它是离线 React UI，不证明当前安装、Native、系统 IME、真实 Run/Stop 或 production |

本轮新截图以 `develop-source-light-*` 为准；前文评分、构建 revision 和 360×820 工作台证据为历史候选，不覆盖新排版。

## 9. DOM 方案的实施后验证（尚未执行）

此节只定义第8节方案批准后怎样证明效果；本轮不运行。所有条件初始 **NOT_TESTED**。方案分数只评价本规格能否执行，不给未知产品结果记PASS。

### 9.1 行为先行与最小触发

- DOM移动前先运行/补强 developer-editor-interaction 的受影响行为：手动与本地、JS Controller/Page/React/Vue切换保留中文源码和JSON；导入只读不丢源码；挂载/开合不Run/不安装/不授权；原nativeEvent、patch-before-action、一次操作一次action。
- 新wrapper可能改变祖先显示和原生事件，故补“hidden=false但祖先隐藏”的可见性、toggle→snapshot与snapshot.open→DOM双向、重渲染open不复位；程序主动打开结果不被关闭祖先遮挡。检查订阅清理和稳定reviewId。
- 本地安装review移动时定向保护子控件Escape冒泡、busy拒绝取消、可聚焦ref；Run/Stop、未知结果与敏感动作沿原业务处理，不使用不可信合成事件声称原生授权通过。
- 受影响的输入/textarea/select/options/defaults、radio fieldset禁用、switch相邻兄弟、反馈直接span需检查真实DOM/行为。只断言当前迁移的不变量，不做全仓fixture升级。
- 复用命令（确认后、对应修改触发）：node --test tests/environment/developer-layout.test.mjs tests/framework/sidebar-develop-layout-r29.test.mjs tests/environment/developer-editor-interaction.test.mjs。其中静态case只作合同补证；若旧结构字符串断言失效，按语义更新/替换，不为它保留坏结构，也不新增CSS字符串镜像。
- 公共field/disclosure CSS修改触发 sidebar-component-contract 的开发/共享相关case，并检查“我的”参数及扩展诊断真实消费者。完整文件已知Workflow chrome fixture问题单独标环境失败，不作为开发布局修复对象。仅有类型/依赖变化时才选相关类型检查；源预览bundle可证明相关TSX可编译，不代表production构建。

### 9.2 候选、视口与状态清单

首轮独立实施评审证实：现有生成器仅设置同document的360px容器；520px画布的media query仍按520px，不能证明真实360px侧栏。旧workbench-source及520×1000/360容器截图保留为历史叠加间距证据，不再作为真实窄视口oracle。

确认后、DOM编辑前，在既有生成器及build-preview.mjs增加可选 query viewport=panel 的**预览壳模式**，默认模式不变。panel模式只令html/body/外壳无额外padding且铺满真实文档viewport，隐藏预览header/notice、去stage自身装饰border；stage高宽取真实viewport，现有fitStage分支不再减header/44px，也不受860px外壳clamp。保持原rAF/高度实际变化才写回的ResizeObserver保护。该模式不覆盖真实产品根、Tab/字段/编辑器的任何CSS；记录壳差异及其源码SHA，与产品previewOverrides=[]分开。

然后在DOM改动前、后分别生成独立阶段：

- node artifacts/developer-ui-ux-20261114/build-preview.mjs dom-layout-before --workbench --source
- node artifacts/developer-ui-ux-20261114/build-preview.mjs dom-layout-after --workbench --source

采集打开各自 index.html?tab=develop&task=layout&width=360&theme=light&viewport=panel，由ego设置**文档viewport为360×860 CSS px**，不再用520px画布装窄div模拟。320px单点使用320×860文档viewport和width=320。截图直接取该文档；需要并排展示可在报告中排版，不把拼接画布当布局viewport。每次脚本重新设置并读回Emulation（调用间会复位）。这是批准后的生成/采集路径，本轮未实现/未运行。

两阶段必须同DPR、字体、正常缩放、数据、open/hidden与滚动锚点，保留默认及展开截图/测量。逐项读回window.innerWidth/innerHeight、documentElement.clientWidth/clientHeight、工作台rect及matchMedia('(max-width:380px)').matches：360/320点均应为true；布局viewport宽度不符即采集FAIL。页面内容宽度另外记录，不能把扣掉gutter后的宽度当document宽度。真实Side Panel复核时用相同实际文档宽高和媒体查询结果匹配，不先假设其必为360×860。

编辑器保留原height:clamp(140.4px,20.8vh,208px)及拖伸/滚动；新360×860文档的未拖伸理论height为178.88px（含box-sizing实读），不是旧1000px文档的208px。相同真实viewport的before/after必须一致；不得为追平历史外画布截图改产品CSS。360×860是本轮可重复预览条件，不是伪造实际原生面板尺寸。

inputs.json逐项绑定实际源码SHA、previewOverrides=[]，壳模式和生成器SHA单列。先冻结dom-layout-before，再迁移DOM生成after，不依赖重建时已经改变的源码当before。并行变更使输入变动时记录相关差异；不能以无关HEAD代表同候选。截图标注源码预览/未接Host；fixture禁用的Run/安装不算真实核心动作。

| 状态 | 必须展开并测量的区域 | 操作/数据来源 |
| --- | --- | --- |
| D0 默认手动/JS Controller | 来源、当前网页、编辑器、状态/结果；结果空态 | 真实view默认snapshot，记录所有open/hidden |
| D1 手动各运行方式 | 参数、运行方式说明；React/Vue的依赖/编译信息在有数据时 | 原actions切换；存在的内存snapshot fixture提供数据，不发网络/权限；各分支至少一组有效内容 |
| D2 保存管理 | 脚本ID/Revision、Controller库、候选表单全部字段与说明 | 正常Controller模式；明确打开候选flat，不只看关闭摘要 |
| D3 Page管理 | Page保存候选、列表、验证/安装动作区及技术信息 | 原Page模式；仅渲染/只读交互，不用fixture安装代替授权 |
| D4 本地项目 | 选择、断连恢复、核心动作、参数、关联、guide、安装review、诊断 | 原内存view fixture按断连/就绪/审阅状态分别运行，不能强制display绕过业务祖先hidden；连接事实未知不伪造在线 |
| D5 结果与历史 | 有结果、历史选择、完整身份、runId查询/下载、运行目标/deadline | 原结果view的有数据snapshot，保留原业务open。区分当前结果与历史 |
| D6 高级诊断 | SDK、目标origin说明、批准快照、服务fieldset、状态/结果；目标健康 | 空/长origin、长SHA、错误/unknown状态用内存view投影；不进行真实授予/撤销 |
| D7 定向保护 | “我的”参数表单与 task-history-panel/task-tools；扩展 ec-page-diagnostics/ec-preinstall-diagnostic | 同候选原入口，只检查共享选择器会命中的部分；旧无body折叠不得漂移 |
| D8 溢出点 | D2长标签/长按钮、D4长路径、D6长origin/风险说明 | 默认360与受影响320px单点；无全量宽度/主题/缩放矩阵 |

对D1–D6每个条件分支，无fixture或没有可操作状态必须列出具体缺口；该分支不能以D0截图替代。可添加纯预览view fixture，不编辑产品状态或编造安装事实。条件数据由现有字段/dependency snapshot生成，保留原hidden/open规则。

### 9.3 几何 oracle（最终渲染，不检查源码字符串）

测量前等待React提交、字体ready和相关动画结束；不滚动改变几何，截图时再以相同滚动锚点采集。读getBoundingClientRect及getComputedStyle；标记实际可见元素（自身与祖先无hidden/display:none、非关闭details正文、有client rect）。可访问视觉隐藏label不参与可见间距比较，但仍验证关联。记录所有命中的CSS来源、computed margin/padding/gap/display/max-width及主题根数量，定位失败时才补matched-rule细节。

| 条件/代表目标 | 断言（CSS px） |
| --- | --- |
| script-id、script-revision、task-dev-*、sdk-target-origins、local参数、历史选择/查询等同类字段 | control或control-row.top − visibleLabel.bottom =4；help.top − control/row.bottom =4（有help时）；所有参与项外部margin-block=0 |
| SDK textarea→说明 | 从旧28变为4；label→textarea从旧16变为4，不能只查父gap=4 |
| 相邻字段组 | nextFieldGroup.top − previousFieldGroup.bottom =12；字段help/error计入其组bbox |
| 同一操作组/工具栏 | 同行相邻按钮、换行后的行间=8；不拿有换行的控件边缘误当字段间距。状态→关联动作/次级折叠=8 |
| 独立章节/管理section | 下组top − 上组bottom =16；来源→当前网页、状态→结果例外=8 |
| primary/info展开正文 | firstLayoutRoot.borderBox.top − summary.bottom =8；body内左起点为details.left+borderLeft+12，右侧同样12；末布局根borderBox到details内底边=12。分别覆盖单pre根、字段根与普通布局根，根margin-block均为0；pre内部padding单列保留 |
| flat展开正文 | 顶8、左右0、底0，同样覆盖单pre/字段/普通根且根margin-block=0；以所在父内容根为参照，嵌套后不再次缩进12 |
| summary高度与焦点 | 单行primary/info最小44，flat最小36，粗指针最小44；长文可增高。focus可见且未被相邻overflow裁切 |
| 隐藏/空态 | 隐藏节点无布局rect且不可Tab到；无可见孩子的纯wrapper没有padding/gap空洞；有意义空态/错误/unknown保持可见 |
| 历史pre与说明迁移 | 展开完整历史时，pre计算max-height仍240px、overflow仍auto；超过240px内容确可局部滚动，说明p字体与before一致；确认新body路径命中，不能只检查规则存在 |
| “我的”字段保护 | 保留嵌套横向control组，不套开发label→control垂直4px断言；同状态before/after的control/help/error rect、间距及样式无漂移，错误关联与焦点有效 |
| 窄点与长内容 | 页面scrollWidth≤clientWidth+1；控件/工具行不超父内容边界；换行不重叠；编辑器/日志按既有局部滚动 |

间距/对齐允许±0.5 CSS px（DPR和小数坐标），不四舍五入吞掉1px以上偏差。原生border分别读值，不把1px边框误算进12px inset。按钮换行以实际行聚类比较，不要求不同行间存在水平8px。legend不按普通label bbox硬套：核对fieldset内首个服务项与legend的现有4px关系，关闭/disabled语义保留。

可见性、DOM角色/父边界、度量目标缺失先FAIL，不能返回“无样本=通过”。对每种字段族在测试采集时枚举全部可见字段组，不只抽三个漂亮样本；8.2清单中的条件分支都有覆盖或明确NOT_TESTED。截图不能替代数值，数值也不能替代点击/键盘与状态回执。

长表单键盘路径（D2/D4，360与受影响320点）：先以Tab聚焦相应summary，Enter或Space展开；D2依次到task-dev-id/version/title/description/author/schema/intent-templates/intent-result-texts和task-create-candidate；disabled或原业务hidden项按原语义跳过，记录实际焦点ID而不硬编码Tab次数。填入中文/JSON后Shift+Tab逆向回到入口，再展开核对草稿保持；只验证到达保存候选动作，不自动提交业务。

D4使原fixture呈现安装review并由原ref对焦，Tab遍历名称/版本/确认/取消，Shift+Tab反向；非busy下在子控件按Escape仅走一次原取消，busy时Escape不能取消，状态/草稿保持。每步记录activeElement、可见rect、滚动容器scrollTop与Dock/top-nav边界：焦点完整落在workspace可见滚动区域且不被Dock盖住，必要时由原滚动机制带入视口；不得把DOM存在当可操作。review被业务关闭才按既有逻辑恢复原触发点；不凭fixture宣布真实安装/授权通过。

### 9.4 可重复方法与报告

确认后的持久检查入口拟为 scripts/preview/check-develop-layout.mjs（当前未创建）：消费ego从同源预览采集的JSON，按本节关系和阈值判定、缺失样本失败、输出逐条PASS/FAIL；不启动第二浏览器、不引入依赖或新框架。用实际测量样本校验oracle；有现成可复用的几何校验器则扩展原入口，不并存两份。采集脚本采用当时 ego-browser skill 公开的API，不能臆造工具或全局粘贴注入。宿主CSS改动另触发实际导出切片核查，确认publicRules/button/theme视觉声明未引入host reset；整体digest变化如实记录，不批量重打旧工具。运行时需node tests与此几何入口都通过，源码字符串断言不能补足失败几何。

每条样本至少有 caseId、state、nodeId/role、relation、expected、tolerance、rect、computedStyle、observed、result；候选级记录sourceInputs及SHA、预览是否有override、日期/浏览器版本、画布/frame/内部viewport、DPR、zoom、theme root、实际open/hidden、截图路径与console错误。保留同视口默认及展开before/after，失败只存对应截面即可，不制造整页无关快照。

同一脚本读取字段组、折叠起点和父子margin总和，出现偏差打印参与节点及owner；修复应删掉重复owner/修组合，不再靠高specificity补差值。仅修改测试候选fixture必须标明，不能假称来源产品数据。

真实产品：只有获得受支持的Side Panel入口后，沿现有dist/development与原安全刷新读取实际revision，复核默认/展开、来源切换、草稿、键盘、结果显示及当前有条件的核心操作；不能以fixture Run/安装替代。未取得能力时源码与预览可以分别交付，但真实Side Panel/权限/Native/系统IME/production明确NOT_TESTED。是否新增专项环境由当前实际阻塞决定，不自动启动CFT、安装新扩展或恢复正式验收矩阵。

停止条件：8.2受影响DOM均有唯一owner，最小行为保护与同候选几何通过，无新增console/溢出/焦点/草稿回归，共享消费者无本轮漂移；随后给出源码、预览、产物、运行四层结果。遇到交互/安全回归先停该迁移单元，不扩大任务来追求全绿。正式发布、95分产品验收和全量CI继续延期。

### 9.5 确认前独立 demo 的有限检查（已执行）

此段仅记录第8.9节独立提案页的可用性，不改变上文产品验证仍未执行的状态。没有运行产品构建、Node产品回归、watcher刷新或安装。

- `artifacts/developer-ui-ux-20261114/dom-proposal-demo/inputs.json` 绑定当前155项源码输入和六份内存覆盖；两份HTML SHA256均与文件相符，生成器语法检查通过。`structure-check.json` 确认178个原静态ID无缺失，仅新增四个具名标题ID。
- ego-browser TaskSpace 62 中，两个 iframe 内部 `innerWidth` 为360或320，`innerHeight` 为860，`matchMedia('(max-width:380px)')` 为true。七场景×两宽度的28个frame观察均无workspace横向溢出和previewError；不能用外层页面宽度替代此记录。
- `geometry.json` 中提案：脚本ID与Revision标签→控件均4px，字段之间12px；SDK origin标签→textarea→help为4/4px；展开的受采样body只有一个布局根、直接details孩子为summary+body，summary→根8px，根上margin为0。旧布局对应值保留在同一记录便于对照。本地参数先于源码关联且为flat，SDK有三个只读服务示例。
- `interactions.json` 仅记录真实浏览器控件操作的代码类型/运行环境联动、普通中文草稿在切换中保留、原生summary键盘开合。普通fill不证明系统IME；示例数据与空权限不证明真实业务行为。

未执行项保留第9.1–9.4节的原状态，尤其真实Side Panel、权限授权/撤销、Native、未知结果、安装review焦点、动态依赖和production。独立设计复核只判断示例有无误导/阻断，不给产品验收分，也不沿用旧方案分数。

## 10. 内容与交互提案的关键测试（最新门槛）

### 10.1 当前状态与证据分层

最新目标归目标规格第10节。本轮先形成内容处置与功能映射，再检查独立demo；**下表均为待执行条件，不能因写入文档记PASS。** 新候选以 `content-proposal-v2/` 单一入口及hash绑定，旧demo仅作对照。

只要求当前demo能证明的内容/导航/输入/显隐/键盘/布局。原生Run/Stop、Native、权限、安装、IME和production不以模拟取代，分别NOT_TESTED；后续真实产品实施再按实际改动选用K01–K12和第9节必要检查，不恢复完整矩阵。

### 10.2 必过条件

| ID | 检查操作/样本 | 通过条件与证据 |
| --- | --- | --- |
| C01 内容处置与零丢失 | 对照原六个开发组件及字段/动作/状态 | 每项保留、精简、改写、归位都有理由/新入口/owner/对应测试；原功能有等价可达路径；权限必要语义逐句核对；仅对照表不证明交互 |
| C02 首屏四问 | 单看360px默认编辑与本地项目内部截图，不看外层demo注释 | reviewer能指出当前对象、执行位置/类型、适用主动作、当前下一步/阻塞原因；不会误认已连接或已授权；原始回答留档 |
| C03 内容显著改善 | 同尺度before/after并实际展开设置/版本 | 创作区优先、常用结果不藏在高级区；长管理/权限内容不与源码同权重常驻；正常说明无重复、术语可理解；不能只改变gap或靠删能力得分 |
| C04 导航与发现 | 从编辑进入版本/记录/设置/SDK，再返回 | 入口有名称、当前位置和返回目标清楚；主流程不经高级区；可选管理最多一次具名入口进入，具体功能在所属视图可发现；不加产品一级Tab/路由框架 |
| C05 草稿与选择 | 输入普通中文、参数；切换类型/环境/来源；往返子视图 | 源码/参数不被示例覆盖，选择和结果保留；当前Page/Controller管理与环境一致；返回恢复合理焦点/滚动；普通fill不等于系统IME |
| C06 当前结果与历史 | 分别查看空/成功/错误/历史示例，选择记录及返回 | 空态说明结果去向；结果类型/所属对象清楚；历史不冒充本次，不覆盖草稿；当前错误/未知仍有可见原因与下一步，复制/下载指向所选记录 |
| C07 本地项目状态 | 空列表/断连/准备/示例已选；进入可选关联与返回 | 首屏项目+真实状态优先；断连只突出有效恢复；Sidebar调试与Page/Controller运行区分；关联不成前置；不伪造Native在线、不真实连接 |
| C08 保存/版本与候选 | 进入版本、展开适用Page或Controller、创建候选表单并返回 | 当前保存/加载可发现；候选与安装区别明确；危险动作降级但有入口；原身份/版本/冻结/验证/权限必要字段仍可查；真实Save/安装禁用，操作不调用Host |
| C09 SDK与权限内容 | 查看网页/文档/服务/origin、批准快照及撤销说明 | 明确文档级授权、精确来源和目标、完整新范围不自动合并、Chrome与SDK区别、撤销不回滚/未知不重放；决策所需内容在动作前可见，不能用短摘要取代必要披露；只读诊断不伪装授权 |
| C10 状态与动作语义 | 查看ready/blocked/running/success/failed/unknown中被改动的状态 | 示例显式标识；主动作/Stop与对象一致；原生执行全部禁用并就近说明离线原因；导航/编辑/查询不触发Run/安装/授权；不能用按钮变色伪造业务成功 |
| C11 键盘与焦点 | Tab/Shift+Tab遍历，Enter/Space操作选择/折叠，返回/Escape处理适用菜单 | 所有新导航可键盘操作；隐藏页控件不可获焦；可见focus且不被Dock遮挡；菜单/返回恢复原触发点；输入Enter不运行，按键不触发两次；IME留单列NOT_TESTED |
| C12 窄屏与短视口 | 360px为主；320px与受影响短高度；展开长表单、错误与长URL | 无整页横向滚动、截断主按钮或Dock覆盖；页内滚动与代码局部滚动分清；字体/点击区不靠缩小过关；选择器、长行、必要风险与底部动作可到达 |
| C13 来源与入口可用 | 从交付链接直接打开，刷新，单独显示内部画面，核对hash | 自包含无需服务；不能误交shell模板/空白占位符；真实iframe内部宽高匹配，浅色root与候选一致；无未捕获错误/外网脚本；input/override/HTML/截图/review可追溯 |
| C14 独立可见评审 | 两位native reviewer阅读最终内部截图、关键操作记录及内容映射 | 设计与交互两个视角对六维分别≥95且无阻断；每项分数有观察依据/扣分；未测不打分，不以旧分/平均补齐。评审后候选变更需复核受影响项 |

任何能力丢失、导航死路、草稿丢失、状态误导、必要授权语义缺失、真实副作用误触发、不可达Stop或关键控件、未绑定候选的评分均阻断。缺原生环境只限制相应原生结论，不降低demo的C01–C14门槛。

### 10.3 六维评分与记录格式

六维分别是内容清晰、信息层级、视觉密度、核心操作、状态反馈、可访问性。每位reviewer独立报告每维0–100、观察的场景/截图/操作、具体扣分、阻断与未测项；不预填分数、不由作者自评。≥95是本轮明确目标，不是必须给出的答案；仍有弱项就按缺陷修正，不修改量表追分。

报告至少包含candidateId/输入与HTML SHA、日期/浏览器、内部视口/主题/场景、实际操作与观察、C-ID、PASS/FAIL/NOT_TESTED/OUT_OF_SCOPE及原因；体验结论必须用真实截图和控件操作，文字方案与源码字符串不能代替。C02原始四问答案与C14原始review保留，不只留平均分和摘要。

本轮停止条件：内容/入口/状态映射完成，C01–C14对应demo证据通过，六维双独立评审达标无阻断，最终入口及前后证据可直接审阅；真实产品仍待用户确认。当前尚未满足，不标完成。


### 最新视觉纠偏与移交（2026-11-14）

用户再次指出没有看见明显的 UI 排版/布局优化，并质疑 Vue 等低相关检查的优先级。**视觉目标仍未完成**。下一 owner 先改独立 demo 的可见布局、密度、对齐和内容层级，优先展示同尺寸前后图，再做与改动直接相关的最小验证；不先重复 Vue/兼容测试、完整审计或追逐评分。正式产品改动仍待用户确认。

上次候选 `content-v2-bd2983b47db89d0f` 的离线检查与两份独立评分只证明各自观察范围：设计 96/97/95/97/96/95，交互 96/97/95/97/98/97。它们不覆盖最新用户视觉判断，也不证明全部条件功能等价或真实产品验收。`content-proposal-v2/acceptance.json` 已改为 `VISUAL_GOAL_NOT_MET`；旧原始报告保留，不能把自动汇总的“完成”当继续依据。91项操作/审计检查无需在输入未变时重复。

### 最新覆盖：先选路线（2026-11-14）

当前暂停单候选UI微调、补测和评分。先向用户交付不同推进路线的收益/成本/风险与预估排序；路线分数不得称为实际页面质量分。若采用需求驱动多候选路线，首轮只比较同内容、同Tokens、同360px视口的明显不同构图，选定后才做该候选所需交互验证。旧矩阵、独立≥95要求与未完成清单不作为路线选择阶段的前置。

## 11. R2.6基线与A/B提案的最小验证（当前有效）

需求以目标规格第11节为准。本轮先看认可基线、写功能处置、制作两份同内容/360×860画面，再比较并选择需要验证的候选。旧原型的CSS字符串、164/208/216尺寸、Tab缩进和旧功能ID测试不直接作为新提案的产品要求；未运行旧测试、根测试、产品构建或完整矩阵。

### 11.1 方向判断与触发范围

作者初看B更简，独立designer实际看六张直接编辑/本地项目截图后倾向A：A的分段和有边界设置更容易发现；B省出的空间主要成为留白。最终**A为优先候选，B冻结供比较，R2.6继续保留认可基线**；没有宣布整体已优于R2.6，也没有用户确认正式改版。

检查由本轮实际变化触发：普通textarea/来源和子视图关系需要证明草稿不丢及焦点能返回；Run/Stop展示需要证明运行中不会通过管理入口隐藏停止；未知结果不能因切换而重新开放运行；低频内容移走后需要证明320短视口仍能访问字段与Dock。复制/下载/安装/授权离线禁用。只运行下列行为，不恢复C01–C14全矩阵或评分循环。

### 11.2 实际结果

使用 ego-browser、同一TaskSpace63，检查入口 `artifacts/developer-ui-ux-20261114/r26-based-proposal/a.html`。记录与可重复脚本为同目录 `browser-checks.json` / `verify-browser.mjs`；A HTML SHA-256为 `dd0685f7da03814fc0612d9adae18605e769d5121ba61095bbd82774ae5b1628`。

| 行为组 | 结果及实际观察 |
| --- | --- |
| 默认360×860 | PASS：textarea实际164px；Dock y799–860，完整显示；无整页横向溢出 |
| 输入与键盘 | PASS：中文草稿与原缩进保留；Enter只编辑不运行；Tab直接到运行选项summary，2px可见焦点 |
| 切换与返回 | PASS：JS/React/Vue、两运行位置、本地来源切换后源码/参数/选择保留；诊断返回恢复触发按钮焦点；菜单Escape关闭并回焦 |
| 本地项目 | PASS：未选项目不能运行；侧栏项目按钮为“模拟侧栏调试”，不冒充Controller运行或正式安装 |
| 保存 | PASS：只写当前页面内存，返回后草稿保留、就近模拟回执可见；不写正式脚本库，刷新持久化NOT_TESTED |
| Run/Stop呈现 | PASS：模拟运行变“模拟停止”；运行中管理/来源入口受限，避免隐藏Stop；停止后恢复编辑。并未执行输入脚本 |
| 错误与未知 | PASS：非法参数展开并聚焦原字段、错误持久；未知状态在进入诊断/返回/切换世界后仍保留且不能重放 |
| 结果动作 | PASS：示例完成结果的复制与JSON下载均禁用；本次详情与过去记录分开 |
| 320×600 | PASS：展开选项时无横向溢出，聚焦期限字段bottom457.18，Dock top539；诊断子视图可滚动到runId，不被隐藏Dock遮挡 |

共15个行为检查点通过，只是离线呈现证据。最初B试查在菜单使用不唯一的CSS selector遇到驱动歧义，未据此判定产品失败；后续选择A并收窄选择器完成检查。未为旧断言或驱动错误改产品。

### 11.3 证据与限制

对照入口 `r26-based-proposal/index.html`，完整同尺寸图 `compare-edit.png` / `compare-local.png`；每个内部画面360×860，含底部操作区，原型与候选使用相同目标/源码/未选本地场景。R2.6本地截图等待切换toast消失后采集，避免把瞬态遮挡当固定布局缺陷。原参考截图与原HTML均保留。

视觉评审是静态比较，结果记录在同目录 `visual-review.md`；路线预估不打数值，页面质量也未给数值，两者不互相替代，旧95+不沿用。后续只给A模拟逻辑补Stop/未知状态保护，未继续挪控件或改视觉；A最终截图/行为记录绑定同一HTML。

真实Side Panel、真实Host Run/Stop、Native、Chrome/SDK权限授予与撤销、安装升级、系统IME、production为NOT_TESTED。格式/edition实际可用性、精确安装对象跳转、保存ID/版本迁移、真实结果Codec与加载覆盖草稿，均须未来正式实施按实际变更核实，不能用本页内存模型代替。A离线检查不证明真实产品功能零退化，也不表示已经授权正式改版。

### 11.4 原型入口更新的最小核对（最新）

用户认可简化方向并授权更新原型index，未授权正式产品改版。当前 `prototypes/sidebar/develop/index.html` 与11.2已检查A逐字节相同；旧R2.6逐字节另存 `r2.6-baseline-preview.html`，两份hash见需求11.6。无需重复原15项行为检查或产品测试矩阵。

- **静态检查PASS**：`node --test prototypes/sidebar/develop/preview-contract.test.mjs` 共17项，明确分为3项当前原型检查和14项旧R2.6快照断言。当前检查只覆盖脚本解析、自包含资源、静态ID/label/ARIA关系与CSP联网/提交限制；不把静态PASS当交互或产品成功。旧断言只记录历史实现，不作为当前需求。
- **新路径浏览器核对PASS**：ego-browser沿用TaskSpace63，直接打开原型index；360×860、整页scrollWidth360，textarea164，Dock y799–860。填入中文草稿→模拟运行显示“模拟停止”→模拟停止显示“模拟已停止”→本地未选时Run禁用，源码保留；随后刷新恢复默认画面。
- **新证据**：`artifacts/developer-ui-ux-20261114/r26-based-proposal/promotion.json` 与 `promoted-index-360.png`。任务资源已finish，仅保留当前原型页面供查看。

README与两份原规格继续区分当前决定和历史记录。未删除旧HTML，未新增历史功能ID约束，未运行产品构建、安装或真实执行；11.3全部NOT_TESTED边界不变。

### 11.5 现有开发 Tab 核心实施验证（上轮记录；11.6覆盖）

由需求11.7的实际变更触发：导航/隐藏关系需证明草稿、焦点、单字段与Stop可达；运行位置改为select需证明原nativeEvent和disabled语义；成功提示需证明真实保存/复制回执；移动历史/诊断需证明仍查询原RunHost而不执行或授权。仅运行这些相关检查，不以根npm test、产品全量构建或正式矩阵为前置。

| 检查 | 结果与证据范围 |
| --- | --- |
| `node --test tests/environment/developer-editor-interaction.test.mjs tests/framework/sidebar-develop-layout-r29.test.mjs` | **5/5 PASS**。真实React树+原field store；中文多行/JSON保留、select原事件、导航无业务副作用、返回焦点、Stop原action一次、历史/诊断查询与结果显隐、字段唯一/可访问label。键盘为DOM事件处理，不冒称真实Tab遍历/IME |
| `script-editor.test.mjs` 核心定向 | **22/22 PASS**。保存不运行/不授权、保存及复制共享通知/拒绝不报成功、持久脚本重开、历史版本不变、Stop归属/取消边界/未知收尾、Page React/Vue保存重开及拒绝过期Candidate；命令与日志归证据目录 |
| `script-editor-ui.test.mjs` 受影响运行保护定向 | **67/67 PASS**，涵盖原Run、执行世界、源变化围栏、精确Page回执、Controller与本地入口保护；此后只改React呈现与CSS，原owner输入未变，复用有效结果 |
| 语法/格式 | 修改的JS `node --check`、React fixture一次内存编译及 `git diff --check` PASS；未启动完整产品构建 |
| 实际development侧栏 | 精确ID/侧栏URL读取到新`developer-more-button`和空源码；「本地开发服务」显示已连接、指纹 `43a246773610`。实际视口360×601，textarea164，Dock y542–601；Native已连接/Provider未接入，只检查来源切换，恢复原直接编辑 |
| 画面与窄视口 | **STATIC_RECORD_ONLY**。实际侧栏DOM/CSS冻结文件在ego渲染360×601、360×860、320×600，无文档横向溢出，textarea164，Run及Dock完整。截图不是新Mock，也不是原生窗口截图；原型作参考，不把示例目标/源码伪装为真实状态 |

额外检查保留失败，不能汇总为全套PASS：

- 最初扩大执行 `script-editor-ui.test.mjs` 为92/97：四个file-only目录断言仍要求旧“尚未发现可运行入口”文案，实际未改的owner已允许目录进入文件工作区/侧栏调试；属于过时断言，未让产品退回旧语义。另一个managed Page项目编译失败：`page-ui.js`已静态导入`page-toast.js`，但未改的 `native-agent/local-dev/resolver.mjs` 冻结HELPERS只有UI/MOUNT/RULES，虚拟输入缺该依赖。磁盘源文件存在；这是独立本地编译缺项，未在本轮扩大平台修改。
- 保存/Stop等较宽名称匹配的 `script-editor.test.mjs` 为59/60：旧导入测试把33334个“中”（100002字节）视作超限；当前未改的Controller预算为2MiB，故“应抛异常”断言失效。未放宽校验，也未改旧断言制造PASS；随后按本轮行为收窄至上述22项通过。

原生边界：ego Page API未暴露Side Panel目标；原生CUA能读取实际侧栏AX，但截图指向另一窗口，Raise后又进入Spaces总览，精确点击返回windowNotFoundAtPosition。未继续盲点、未全局粘贴或发送代码，UI锁已释放。仅通过精确侧栏DOM进行无执行/授权的来源切换和只读取证；**真实Run→结果→Stop、可信手势、系统IME、本地可运行Provider、安装/升级/授权/撤权、production与独立评分均NOT_TESTED**。已有单元/React检查不把这些提升为PASS。

证据目录：`artifacts/developer-ui-ux-20261114/core-implementation/`，含相关日志、输入/资产hash、`live-dom.json`/`live-local.json`、冻结HTML、静态截图及`static-geometry.json`。主分支未提交/推送，本任务未改原型，未重启/替换原watcher或日常加载目录，未更改其他对话goal状态。原型实施基线与收尾并行版本的差异见需求11.7及`verification.json`；上述检查只证明本轮select与单一保留源码的正式组件，不证明后来原型的radio或独立草稿已实施。


### 11.6 正式组件对齐与独立草稿的最小验证（当前有效）

由本轮原生radio、四槽草稿及结果/管理页改动触发：证明选择事件仍进原owner、四槽不会串写、加载/只读/未知栅栏不退化、管理导航不会执行业务、Stop与实际反馈可见。布局检查证明当前主流程和窄屏可达，不执行根npm test或旧完整验收。

| 检查 | 新鲜结果与范围 |
| --- | --- |
| `node --test tests/environment/developer-editor-interaction.test.mjs tests/framework/sidebar-develop-layout-r29.test.mjs` | **5/5 PASS**。radio真实原nativeEvent/先更新原字段/disabled、中文与JSON草稿、导航无执行/安装/授权、返回焦点、详情原身份、空管理占位隐藏/实际unknown持续、管理中Stop、只读文件名及动态按钮文案保留图标、字段唯一及原历史RunHost查询 |
| `script-editor.test.mjs` 下列18项过滤检查 | **18/18 PASS**。四槽源码/参数/ID/revision独立、主动清空、跨槽导入、readonly与New恢复、busy/不可信输入不覆盖、Standard不露编译模式、Page React/Vue保存重开、加载迟到/历史revision、实际编译字节及未知Page世界栅栏 |
| 语法/格式 | 修改JS `node --check`、React fixture内存编译（包含静态截图生成）与`git diff --check` PASS，无第二dev/build writer |
| 360×860同尺寸 | 正式JSX+CSS显式示例fixture；与认可基线图对照目标卡64.5px、编辑卡199.5px/源码164、options y408.59375、Dock61px/y799一致。另实际看本地、React、保存、安装和诊断，保存卡不再留空隙/双框 |
| 320×600 | 编辑/展开选项/本地/保存的document宽均320；编辑器164，底部y539–600；保存页无空Dock。是静态布局证据，不当真实键盘遍历 |
| development原侧栏 | 已连接，指纹`ef13e4c35bcd`，textarea164、Dock61；六份CSS字节与dist匹配。当前扩展页不可运行、Run禁用，原结果不改；未执行脚本或安装 |

18项命令（不运行同文件无关旧断言）：

```sh
node --test --test-name-pattern='blank editor and untouched|independent direct-edit drafts|cross-slot JS import|readonly imported project|authored and imported source|Standard seeds|save and reopen restores|outcome-unknown browser component|Page world is locked|late Save/Load|late saved-script|project import displays|program-draft package import|historical revision|fresh loaded Controller ESM|fresh loaded forged' tests/environment/script-editor.test.mjs
```

只读独立评审指出“下载JSON”仅导航的语义问题，已改成“下载选项”；未发现明确radio或草稿串槽/越权问题。此为代码评审，不冒称独立视觉评分或原生运行验收。11.5的无关旧失败分类继续保留，未为制造全绿修改其断言/产品。

证据均在原 `artifacts/developer-ui-ux-20261114/core-implementation/`：`alignment-source-inputs.json`、`alignment-final-geometry.json`、`alignment-narrow-geometry.json`、`alignment-verdict-final.json`、`alignment-runtime-assets.json`、`alignment-compare-final.png` 与各最终静态截图。fixture生成时读取的当前原型hash为后续并行`e24c…`（只用相同默认源码文本）；认可视觉基线仍是已保存的`alignment-prototype-content.png`及开始时`d16f…`，两者明确分开。后续原型检查曾使用旧`.target-card`选择器得到null，修正为已存在`#target/.editor-card`后获取几何；这是诊断选择器失败，未改变产品。后续版本的Dock53px/结果区差异不拿来声称当前匹配。

**NOT_TESTED**：原生可信Run→真实结果→Stop、系统IME、本地可运行Provider、真实保存/安装/升级/授权/撤权、production、独立视觉评分。现有DOM/Node证据不提升上述范围为PASS。原目标/任务/输出与并行dirty保护不变；main未提交推送。TaskSpace63完成释放，只保留原产品入口页。

<a id="developer-permission-defaults-tests-20261115"></a>

## 12. 权限默认预选的关键测试（2026-11-15）

对应[本轮目标](developer-ui-ux-r1-20261114.zh-CN.md#developer-permission-defaults-20261115)与[唯一默认策略](../architecture/browser-framework/userscript-sdk-authorization-r1.zh-CN.md#developer-permission-defaults-20261115)。用户最新要求覆盖旧五项方案：当前可用 SDK 服务全预选、Cookie 默认选中，并降低新用户点选与排障成本。本次已实施默认值、草稿保留和可读标签；下表保留完整目标条件，不将局部 Node/DOM 证据报成整项或原生授权 PASS。当前证据见本节末尾。

| ID | 条件/真实操作 | 必须观察的结果 |
| --- | --- | --- |
| P01 默认精确 | 为普通 HTTP(S) 文档创建全新 SDK 授权草稿并查看独立 Cookie 设置 | 策略规定的八项可用服务全部勾选，独立 Cookie 默认选中；network.info 未选且禁用，仅有 label 的未准入项不出现可用假象。未来未经审定的 Registry 新增能力默认未选；无精确文档时不能批准 |
| P02 输入无副作用 | 初始化、打开诊断、返回、勾选/取消、刷新列表与查看批准快照 | 这些输入不触发 `permissions.request`、`installSdk`、`revokeSdkGrant` 或业务网络/存储写入/通知；只读列表/授权查询可执行。状态明确为草稿，不显示新增授权成功；原页面自动最小 HTTP 策略单独按旧合同运行 |
| P03 尊重手改 | 取消一个或全部预选，开合/返回/刷新同一 document；修改目标后返回 | 原值保留，全部取消也不被当成“尚未初始化”；无服务时不能批准，有可理解下一步。网页列表刷新后重新选回同一有效 document 不重置草稿；dispose 后旧回包不更新新实例 |
| P04 普通开发不断路 | 使用不需要高级 SDK 的既有普通运行样本与同源 HTTP 样本 | 无需打开权限页或批准默认集即可走原主链；编辑/Run 不隐式提交 SDK 扩权。同源 HTTP 仍受原原生许可、文档和撤权检查；只测实际受影响执行路径，不启动格式全矩阵 |
| P05 精确批准与实际服务 | 明确批准默认集并验证受影响服务；再手工取消一个高级能力后提交收缩快照并尝试该能力 | 一次提交的服务精确等于当次勾选快照；原 Authority/回执一致后才确认。默认八项走原受控驱动，输入/批准本身不发送通知或主动调用服务；用户取消的能力在收缩授权后被拒绝。存储遵守原命名空间，内置资源仍拒绝清单外/远程资源；network 非只读、持久数据读写/删除、稳定应用ID与MAIN 整页可调用的范围披露可见 |
| P06 目标与实验预填 | 普通文档目标留空；添加合法跨站目标；输入无效范围；进入/离开原本地实验页并手改 | 普通空白仅同源，不自动添加常见 API/局域网。最多 8 条精确 Origin，协议/主机/有效端口受检，路径/通配符等拒绝；有额外目标却取消 network 时不能批准。原精确实验入口仍预填原目标，即使基础集已选；离开时不泄漏自动目标，手工取消/修改不被反复覆盖；原自动 HTTP 固定范围不扩大 |
| P07 Cookie 独立 | 默认选中时普通 Controller/适用本地运行；主动取消后再运行；Cookie 原生许可缺失；尝试从 MAIN SDK 借用 | 默认选中仅加入原适用运行预检，不自动读取 Cookie、请求新权限或运行脚本；已有许可不重复申请，缺失则显示具名恢复入口。取消后同 owner 内返回/刷新不重选，且不冒充撤销已有 Chrome 权限；Page/JSX/Vue不被虚构 Cookie 能力，MAIN SDK 不获得 Cookie/凭证，已安装任务/工具权限不变 |
| P08 真实手势 | 非可信事件、真实 click、client.ready 等待及忙态双击 | 合成事件不能批准；真实点击在第一个 await 前进入原原生权限请求；批准忙态最多提交一次，无定时器代替手势。Node 模拟只能证明事件接线，原生手势另测 |
| P09 精确文档与失效 | A 文档修改选项/目标后切 B；同 URL 导航为新 document；审批期间导航、关闭或撤权 | 新文档按默认集准备，不复制 A 的个别修改/目标，不继承实际 grant；旧选择和回执不能批准新文档。失效后原实例后续调用被围栏化；默认预选、刷新与原自动策略均不能复活主动撤销的授权 |
| P10 旧授权与完整替换 | 只读查询已有授权；编辑新草稿；批准收缩/扩张并分别拒绝、接受；旧实例撤销迟到 | 查询不请求新 Chrome 权限、不改草稿；显示实际快照及本次新增/移除范围，未知则明确未确认。只有明确批准才提交完整替换；拒绝不伪称旧范围消失/新范围生效；旧实例撤销不伤及新授权 |
| P11 未知与恢复 | 安装/撤销已提交后丢回执，或回执与服务/目标/document 不符 | 不报成功、不自动重试或重新批准；旧回执仅作历史，当前状态保持 unknown/stale，可只读查询核对；无关成功 Toast 不清权限错误。真实撤权完成不回滚已发生效果，也不因仍勾选而自动重授 |
| P12 默认侧栏操作 | 默认宽度/正常缩放，键盘逐项选择、审阅、批准、查询、撤销并返回编辑 | 组与标签可读，不只展示技术 key；checkbox/fieldset 具名，状态不只靠勾选/颜色。当前申请与真实授权、文档级影响及替换后果可发现；按原合同显示确认/错误/成功，返回保留代码草稿/选择/结果与焦点，Stop 仍可达 |
| P13 新用户操作预算 | 网站/依赖/执行能力合法就绪的新用户，从开发默认示例开始；另走确需SDK的新草稿 | 普通主链为选网页 → Run → 结果，零次逐项权限勾选、零次进入诊断；确需 SDK 时当前八项默认全选、目标/主文档可验证预填，无需填写 documentId/capability key，只做一次产品内集中审阅。Chrome 自身许可确认仍沿原链，不再加通用启用步骤；页面/目标不适用时准确说明 |
| P14 就近恢复 | 当前操作缺网站/Cookie/SDK能力或目标范围，分别取消恢复、恢复成功和遭遇未知 | 当前视口显示易懂原因与原合法“恢复访问/审阅权限”动作，目标/已知缺项预填；不能只报 E_PERMISSION 或要求自己找复选框。取消不丢草稿，成功返回原操作并提示可运行；未知先只读核对，不自动执行/重跑，动态需求无法判定时不猜全网授权 |
| P15 有效授权复用 | 当前同一精确文档/身份/范围已确认后，再次使用同能力；再撤权、导航或扩大范围 | 授权有效且覆盖所需范围时，不重复逐项选择/审阅/安装或原生请求；撤权/新文档/范围变化后按原 Authority 重新检查，仅请求真正缺失范围。只读查询与准备不扩权，不额外建跨站持久授权或全局“已同意”boolean |
| P16 默认当前网页 | 打开诊断；切换当前网页、导航、进入不适用页面；无有效窗口 | 默认选择本窗口当前HTTP(S)主文档，显示标题/地址，无需重复下拉；只列本窗口非隐身网页。未确认/失效/根documentId或URL不匹配时禁批准，不回退其他网页或全局查询；同文档标题/路径变化不重置草稿 |
| P17 手动目标保持 | 展开更换网页或子框架，手选后切活动标签、刷新；点击使用当前网页 | 手选网页/子框架不被自动跟随覆盖，刷新保留仍有效的精确文档；恢复当前网页后重新跟随，草稿按精确文档隔离，迟到回包/dispose不复活旧目标 |
| P18 图标刷新 | 检查实际React按钮；取消服务后刷新当前文档 | 按钮只显示刷新图标，具备“刷新网页与文档”的title和无障碍名称、原生键盘能力；读取中禁用，完成恢复，取消项不重选；初始化/选择/刷新均不申请权限或提交授权 |

### 按变化触发的最小验证入口

- 默认集/文档草稿/实验预填变化：扩充 `tests/environment/develop-host-controls.test.mjs` 的行为用例，验证请求计数、实际 rows 与快照；不以源码字符串断言代替用户动作。
- 批准输入/回执展示有变化：复用 `tests/framework/k2-sdk-ui-approval.test.mjs`，覆盖同步手势转交、快照漂移、拒绝、迟到及未知。SDK 文档授权范围或驱动调用受影响时，再选 `tests/framework/k2-sdk-target-authority.test.mjs` 与对应已有服务测试，不启动整个 Browser SDK 矩阵。
- React 新分组/状态/返回：沿用开发页 React owner 行为测试；在真实默认侧栏对同一候选记录精确文档、加载 ID/路径、连接/applied revision、截图及操作回执。至少验证明确批准 → 一个已选服务真实调用 → 查询 → 撤销 → 后续拒绝；其余已选服务由定向驱动测试补证，新增原生能力有变化才补对应原生动作。

P01–P03、P06、P07、P09、P12 为全预选/Cookie默认值改动直接触发；新用户恢复/复用接线触发 P13–P15。其余保护须核对原调用未变及可复用证据，依赖/输入变化时补测。缺少真实 Chrome 手势/授权证据就单列 NOT_TESTED，不以模拟或文档核对提升为 PASS。无需运行根 `npm test`、全量构建、生产验收、评分或宽度/主题矩阵。

### 本次默认值与标签增量的证据

- `tests/environment/develop-host-controls.test.mjs`：17/17，通过当前八项与 Cookie 初值、无授权请求/RPC、手工部分/全部取消及目标清空后的同文档刷新保留、精确 tab/frame/document 草稿隔离与返回、两处原实验页预填、导航后的新草稿，以及真实 React checkbox 取消事件接线。新增行为用例 11 项；原有迟到响应、dispose、查询/撤销接线继续通过。
- `tests/framework/k2-sdk-ui-approval.test.mjs` 与 `k2-sdk-target-authority.test.mjs`：43/43，证明原精确目标、替换快照、同步可信点击接线、撤权和未知不重放围栏。这里的 `isTrusted` 为模拟，不构成原生手势证据。
- `tests/environment/sidebar-draft-runhost.test.mjs`：7/7，原 Controller 草稿准备/取消/晚到权限应答和冻结目标继续通过；Cookie 已有预检调用未改，不据此宣称真实 Cookie 读取或缺项恢复已测试。
- `node --check` 对本次两个 JS owner 通过；16 处本增量本地链接/显式锚点及定向 `git diff --check` 通过。
- 持续开发：原 watcher PID42614 运行期间因并行 Web Flow 来源校验失败，revision 停留在 `78636418e58b…`；并行修改更新校验记录且源码 hash 匹配后，通过既有配置重载重新读取。原进程随后退出，确认 PID/输出锁已无活动 owner 后用原 `npm run dev` 恢复同一路径，现有守卫防止双 writer；未停止其他服务、另建加载目录或放宽来源校验。恢复后的 output owner PID5089，保留运行。
- 实际运行态：扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf` 的本任务 Side Panel DOM，在 revision `2757495e69e8eb88126e30af9227c3824fa1cdc99299cce3c35e8a19f35176b8` 已确认八项全选、Cookie 勾选、network.info 禁用未选、HTTP短标签；取消 network/Cookie 后返回编辑再进入仍保留，源码草稿未变。实际加载的 `ui/tool-shell.js` SHA256 与 `dist/development` 的文件和 revision清单一致，开发服务显示相同 applied revision。证据：`artifacts/developer-permission-defaults-20261115/runtime-check.json` 与可复现脚本。TaskSpace92已释放，未点批准/运行/撤销。该DOM表面报告viewport为0×0，仅证明加载代码、DOM状态与输入事件，不作为默认宽度视觉或原生指针证据；记录中的visible只表示存在client rect。
- **NOT_TESTED / 后续**：实际新增 SDK 授权、各服务副作用、Chrome 原生批准/撤权、Cookie 真实读取与恢复、新用户完整 Run 链、旧授权差异展示及 P13–P15 的完整流程；完整矩阵、production 和独立评分延期。

### 当前网页与刷新图标增量证据（2026-11-15）

- 本次 `tests/environment/develop-host-controls.test.mjs` 为35/35通过，原17项保留，并覆盖P16–P18的owner行为及实际React折叠区/图标语义。包括本窗口筛选、等待当前owner就绪、无窗口不查询全局、无当前目标不选实验页、根documentId/URL不符拒绝、手选网页/子框架固定与恢复跟随、导航与同文档路径变化、草稿隔离和迟到清理。原Authority及SDK实现未改，上一增量的43项围栏证据保持其原范围，不重复运行整个矩阵。
- 实际扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf` 的本任务Side Panel：本地空白测试页A自动选中主文档，取消network后图标刷新仍保留；活动B时手选A，再切换活动页仍保持A，点击“使用当前网页”切回B；默认选择区收起，刷新按钮无文字、有SVG及准确title/aria-label。未点批准、运行或撤销。首次直接对同值select派发事件的观察不用于证明手动保持，改为真实不同选项、等待当前owner及文档稳定后记录。DOM viewport为360×601；不据此宣称原生指针、键盘焦点或视觉评分通过。
- 运行时读取的 `ui/tool-shell.js` SHA256为 `56ffb7b61ce7c3c4762d0ed2e7aae252446348a7bb390056a6b642dde02958ae`，与 `dist/development` 文件及构建revision `cad6f24bd8d532c9b065bc82e0bf1edbe82c37b9a89cbde25e9adc40a9cff7c6` 清单一致；不是applied revision声明。本任务测试侧栏最初仍为旧控件，重载本任务未编辑的侧栏后已显示新控件。记录见 `artifacts/developer-sdk-target-20261115/runtime-check.json` 和 `runtime-manual-check.json`。
- 原PID5089开发进程后来异常退出，另一个并行owner已恢复PID11194及原输出锁；本任务未启动第二writer或重启该服务。当前侧栏开发状态仍为“正在连接开发服务…”，**持续更新连接未验证**；源码、产物和本次实际加载状态分别记录，不承诺保存后已自动应用。连接排障、原生完整授权链、production及评分不扩大为本次小改动前置。


<a id="developer-prototype-permissions-tests-20261115"></a>
## 13. 离线原型权限与间距：关键条件（2026-11-15）

对应[本轮目标](developer-ui-ux-r1-20261114.zh-CN.md#developer-prototype-permissions-ui-20261115)。固定默认360×860、正常缩放，只验证当前单文件离线原型，不套用第12节真实Authority/原生授权的PASS。

| ID | 关键条件与预期 |
| --- | --- |
| D01 | 八项可用服务预选；network.info禁用未选；Cookie为独立自动化选项，网页/组件/侧栏不借用；普通模拟运行无需进入诊断 |
| D02 | SDK、手选目标及高级查询初次折叠；同文档刷新/返回保留部分或全部取消；默认当前主文档，手选/恢复可达 |
| D03 | origin带路径/通配符/账号/非HTTP(S)/超过8项拒绝；有跨站目标但取消network禁批准。字段错误紧邻输入，ARIA关联；修正后恢复 |
| D04 | 模拟批准A再输入B，可分别查看旧回执A与草稿B；新增/移除能力和跨站范围可读。批准完整替换不合并；查询不改草稿或清字段错误 |
| D05 | 示例文档草稿隔离，返回原文档保留手改；导航后旧模拟授权失效、新文档默认8项且目标空白。撤销保留草稿、不回滚网页效果 |
| D06 | 菜单Tab/Shift+Tab、方向/Home/End、Escape可用；移出收起、子页返回恢复原触发点/编辑区滚动与草稿；组合输入Escape不返回 |
| D07 | JS自动化/网页、React、Vue分别保留修改和主动清空；模拟运行锁输入且Stop可达；未知禁重放，诊断返回不解除 |
| D08 | 360×860无整页横向溢出，字段内4px/字段组12px/区块16px，各能力点击区≥34px；长范围/审阅局部可读，底部动作和回执可见可达。仅关键视觉变化截图 |
| D09 | 当前内联脚本可解析、离线CSP、静态ID及动态label/ARIA引用有效；只运行相关原型检查。真实SDK/Chrome、安装、Native、实体IME及production均NOT_TESTED |

### 本轮结果（离线候选）

当前HTML SHA256：`a67630d79ef058e0a54a8c1c5e5f834e71c456f6001eb1bace59fae1d9e562c0`。Ego实际file响应体与磁盘一致；360×860正常缩放下，42项行为与10项本地模式/长范围/键盘补查全部通过。覆盖D01–D09的本轮离线部分，不覆盖同编号或第12节的真实授权条件。

能力列表实测388→192px、SDK展开正文934.02→777.55px；各行点击区≥34px，字段帮助距输入4px，字段组12px、独立区16px。无页面横向溢出；长快照可Tab进入、PageDown实际滚动、Tab离开，批准回执当前视口可见。最终四张关键状态图已逐张复核；独立只读源码复核无阻断性回归，不设置或沿用旧分数。

现有静态检查17项通过，其中3项当前原型、14项历史R2.6；动态ID/label/ARIA由本轮浏览器另查。8处新链接/显式锚点及定向diff空白检查通过。首轮滚动断言引用与定向PageDown等待方式属于测试驱动修正；实际发现的菜单触发器焦点移出问题已修复并复测，不改产品迎合断言。

[范围、截图与复核记录](../../artifacts/develop-permissions-ui-20261115/review.md) · [42项行为](../../artifacts/develop-permissions-ui-20261115/browser-report.json) · [10项补查](../../artifacts/develop-permissions-ui-20261115/visual-report.json)。TaskSpace98已释放。真实SDK/Chrome授权、Cookie读取、原生Side Panel/安装/IME/Native及production均NOT_TESTED；合成composition事件只验证guard。未构建、提交、推送或操作并行服务。

<a id="developer-results-saved-tests-20261117"></a>
## 14. 结果与已保存脚本：本轮关键条件（2026-11-17）

对应[目标第14节](developer-ui-ux-r1-20261114.zh-CN.md#developer-results-saved-management-20261117)。本轮只验证改动的真实组件与原业务owner，不将内存Host模拟等同真实安装态。

| ID | 用户行为与保护 | 当前证据 |
| --- | --- | --- |
| M01 | 唯一结果复制图标具名，复制原显示值；完成资源默认折叠，历史/下载保留且不执行 | React交互、原clipboard成功/失败handler测试；Ego36项中的结果/历史操作，真实系统clipboard未测 |
| M02 | 明确无自动保存；子视图保留完整草稿；手动保存走原版本CAS且不运行/授权 | 原script-editor定向集成与Ego手动保存内存回执，不模拟跨重启持久化 |
| M03 | 列表所选加载/删除与编辑器ID分清；未保存覆盖先确认；取消零覆盖/删除；同字节但未保存身份仍确认 | Controller revision管理45项及Controller/Page取消集成 |
| M04 | 确认后身份/版本/编辑上下文/选择/代际变化拒绝；隐藏/卸载/超时结算一次，不出现迟到弹框；Page恢复不抢回页面或覆盖后续编辑 | view/真实React交互10项；script-editor定向14项（含3项Page恢复迟到回归） |
| M05 | 失败/未知持久可见、原记录可达且未知不重放；管理期间Stop仍转发原owner动作 | Ego组件操作与原结果拒绝/历史重载等待的15项定向检查，不等同实际Run/Stop |
| M06 | 默认360px与320×540无横向页面溢出；确认safe focus/inert/Tab/Escape、返回及加载焦点；通知在视口可见可关闭 | Ego真实JSX/CSS+revision owner，36项PASS；实体IME未测 |

临时证据目录：`artifacts/develop-simplify-20261117/`。`source-inputs.json`记录40个实际编译输入的SHA256；`browser-verification.json`包含36项行为、5条内存操作回执和明确模拟边界；`results-clean-360.png`、`library-360.png`、`replace-360.png`、`delete-360.png`、`failure-360.png`与`delete-320-short.png`为同候选关键截图。成功Toast沿原共享通知可关闭/自动消失，浏览器逐条读回回执后再关闭继续下一步，不以脚本点击穿透通知。

产品运行环境未切换：`dist/development`目录存在，但本轮未确认连续开发连接、实际加载路径和已应用revision。Ego发现原扩展ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 的Side Panel目标；本任务自有普通扩展页回落目录，不能冒充原生侧栏。当前安装态、真实Chrome权限/安装/执行/系统剪贴板、Native、实体IME与production均为NOT_TESTED。未启动第二watcher、重装或替换目录。

续修证据：`followup-browser-verification.json`绑定当前41个真实JSX/CSS/Controller管理owner输入，22项Ego操作通过；长脚本名在360px完整换行，320×540弹窗与按钮完整可达，取消不删对象/不覆盖草稿，显式保存、列表加载、精确删除与结果复制各有内存回执。对应截图为 `followup-library-360.png`、`followup-delete-360.png`、`followup-delete-320-short.png`、`followup-save-360.png`、`followup-results-360.png`。本轮发现旧预览遗漏正式入口已加载的 `confirmation.css`，补齐预览来源后才复核遮罩与排版；这不是产品新增另一套弹窗。旧36项记录保留为上个快照，不与当前输入混算。

对应Node证据：Controller管理45项、更新后的React交互1项、保存/迟到Save/Load/简短完成状态3项通过；原记录定位及拒绝/旧结果保护14项通过，结果重载/view/React相关21项由独立实现owner核对。重叠检查不相加。原“任务状态：”断言已过时，按当前简短“已完成”行为修正。浏览器复制只核对动作参数，不读写系统剪贴板。未新增产品构建、安装或运行环境切换；原生与production边界保持NOT_TESTED。

独立设计复核结果写入 `design-review-final.json`：信息清晰度96、主流程95、保存管理96、可访问性96、窄屏布局96，均分95.8；五维均≥95，仅适用于UI_PREVIEW_ONLY。初评指出保存名称/标识混淆及长值难核对，已改为「脚本标识」并从同一草稿字段显示完整保存目标，最终同候选22项包含此改进。历史位于更多菜单的首次发现成本保留为轻微扣分，不增加重复入口。41项源码指纹无漂移；真实安装态与production未评分。

独立代码复核发现同一runId的迟到快照可能覆盖较新的完成/资源状态；已在原结果owner中让状态或资源状态变化一并使待决读取失效。新增两项回归先复现失败、修复后通过，相关结果读取13项、未知/拒绝/旧结果14项以及正常完成与保存相关5项通过。此补修不改变UI快照输入，也不启动新的执行或环境。

<a id="developer-saved-history-prototype-tests-20261117"></a>
## 15. 已保存脚本交互原型证据（2026-11-17）

对应[需求第15节](developer-ui-ux-r1-20261114.zh-CN.md#developer-saved-history-prototype-20261117)。上轮HTML SHA256：`44ba5a23db501a841d0d714e0aaf64ddbbb1d1b00a04e446fd1cd46618d55894`。所有本节证据只属OFFLINE_PROTOTYPE，数据由真实UI模拟保存创建，不预填历史。

`artifacts/develop-open-20261117/prototype-verification.json`绑定同SHA，8组Ego行为通过：空历史到明确保存；同标识追加版本且快捷入口只显示最新；覆盖取消／确认与焦点、零运行；Controller／Page分组及React身份、键盘和旧版加载；删除取消／确认保留编辑字节；本地项目版本隔离；320px长标识换行和弹层边界；模拟Run／Stop忙碌保护。测试脚本为同目录`prototype-checks.mjs`。

独立评审指出跨类型覆盖风险后，`prototype-cross-mode.mjs`先动态复现React目标草稿未确认即被替换。最小修复后4组通过，`prototype-cross-mode-verification.json`绑定最终SHA：React、Vue、网页JS分别证明目标草稿确认、取消保留双方、确认加载精确字节且不运行；另证明切换会保留当前脏草稿，目标干净时无需丢弃确认。原8组也在最终候选重跑通过。

关键截图：`prototype-empty-360.png`、`prototype-history-360.png`、`prototype-confirm-360.png`、`prototype-history-320.png`及`prototype-cross-mode-confirm-360.png`。最终关键画面已目视核对；320px页面scrollWidth=320，弹层left=8/right=312且不超出视口。现有静态合同17/17通过，其中仅3项检查当前原型语法／ID关联／离线CSP，14项为R2.6历史快照，不作为当前交互通过数。首轮覆盖取消焦点落到body的问题已修复，最终取消回到原编辑区。

`prototype-design-review.json`记录独立只读评审85.6：对应修复前SHA`70baba1d…88356`及当时四图／8组证据；不能当作最终修复候选已重新评分。旧正式组件预览95.8同样不适用于本HTML。后续改善当前身份、旧版本辨认、保存就近校验、打开点击区。

此前正式React未提交WIP单独保留：原owner定向84/84与React交互1/1通过；扩大后的editor选择组29通过1失败，显式Run遇到`E_REMOTE_PERMISSION_PENDING`，需开始时核对是就绪等待还是产品问题，不报全绿，也不作为本轮HTML的前置。证据分别为本目录`owner-tests.log`、`react-tests.log`、`save-run-diagnostic.log`；`source-preview.html`只是真实JSX＋内存服务预览。正式加载、真实持久化、Chrome权限／Run／安装／系统剪贴板、Native、实体IME和production均NOT_TESTED。未启动第二构建writer或重装，TaskSpace137已释放，不提交推送。

### 15.1 本轮身份、版本与草稿保护的最终证据

最终HTML SHA256：`c7eeb313496b597d279d6bf659c66f8c02915b6442f49f4970788fb68c463b6c`。证据归 `artifacts/develop-open-20261117/identity-v2/`：`verification.json`绑定同候选，`manifest.json`记录12张最终截图及各自SHA；`checks.mjs`为本轮Ego操作脚本。记录由UI明确保存创建，无预填历史、真实存储或输入源码执行。TaskSpace138已释放；重放须新建TaskSpace并更新脚本顶部ID。

最终10组通过：新稿与空历史／打开点击区；必填、字符、长度的字段持久校验及ARIA、Enter保存；同标识追加r2和快捷最新、取消／确认；旧版类型／时间／摘要／只读源码与零执行；React／Vue／网页JS跨槽位保护；同一网页身份跨格式旧版恢复；删除取消／保稿／删除后的覆盖保护；本地项目隔离与模拟运行忙碌保护；320px长标识、菜单／管理边界和键盘；主动清空／纯空白／隐藏槽位保稿及128字符确认换行。320px页面scrollWidth=320，弹层left=8/right=312/bottom=692，textarea高164px；打开点击区实测56×36px。动态ARIA引用无缺失。

当前语法／静态ID关联／离线CSP三项通过；同一静态命令17/17中另外14项仍为R2.6历史快照，不计当前交互覆盖。命令为 `node --test prototypes/sidebar/develop/preview-contract.test.mjs`，输出在 `identity-v2/static-tests.log`。只检查本轮文件diff空白与上述行为，无产品构建、根CI或真实运行验收。

一次独立AI设计复评90.8（清晰度92、主流程86、保存历史94、可访问性92、窄屏90）属于修复前 `e009976c…c54a7`，详情 `identity-v2/design-review.json`。评审未独立操作浏览器，截图在评审时顺序更新，其材料边界已记录。指出的空内容草稿保护和确认缺少格式均已实际复现／修复；额外复现的128字符确认scrollWidth880/clientWidth294溢出也已修复。最终候选通过上述定向操作并目视核对，不重新追分或冒称最终独立复评分。

普通保存／打开Toast缩短；完整标识与版本持续留在编辑器。最终截图包括 `saved-360.png`、`old-version-360.png`、`save-error-360.png`、`deleted-draft-confirm-360.png`、`long-identity-320.png`、`latest-320.png`、`manage-320.png`、`long-empty-confirm-320.png`。`long-confirm-before-320.png`与`pre-final-defects.json`只保留修复前缺陷证据，不混入最终截图清单。

仍为OFFLINE_PROTOTYPE_ONLY：真实持久化、当前安装侧栏生效、真实Run／Stop、Chrome权限／安装、系统剪贴板、实体IME、读屏、Native、production和正式验收均NOT_TESTED。未改正式React WIP、运行服务或并行发行文件，未提交／推送。

### 15.2 编辑区减法：最新候选与证据

**撤销打开后的正式源码证据（覆盖下方旧布局）：** `artifacts/develop-open-20261117/editor-clean-v7/verification.json`记录6组Ego操作及42份实际JSX/CSS/原revision owner输入指纹。编辑区无打开／浮层／虚构文件名，说明仅供读屏；360px无横向溢出且源码164px；更多→管理→返回保留草稿和焦点；显式保存、所选版本加载沿原owner，保存回执不再指向已撤除入口。默认源码截图已目视检查，TaskSpace143已释放。`developer-editor-interaction.test.mjs`与原`script-editor.test.mjs`保存反馈定向回归各1项通过。未更改原型HTML，未启动产品构建、安装、提交或推送；实际安装态、真实持久化／执行、Native、production和独立评分仍NOT_TESTED。

用户最新纠偏覆盖15.1的常驻标题／下方说明布局。最终HTML SHA256：`992f3b8f069b7c855a1f813d5e4d4d91500c45a1bc9f9bf3565326eaf30c267f`。证据归 `artifacts/develop-open-20261117/compact-v3/`，`verification.json`与`manifest.json`绑定当前HTML及最终截图。临时CSS试排先确认效果，再落入同一源码；不是仅临时修改页面。

5组定向检查通过：工具栏只保留打开／参考图标，无可见身份和代码下方说明；保存页保留当前身份、版本、字段错误与Enter提交，按钮状态点随编辑／保存变化；空内容取消／确认、打开旧版及跨类型目标草稿保护；本地模式隐藏手工状态点并关联自身说明，模拟运行仍禁止打开；320px长标识仅在列表换行，各格式和打开→示例→文档→源码的Tab顺序可用，ARIA引用完整。没有重跑旧完整矩阵或启动产品构建。

360px实测：源码高164px，工具栏外高37px（含1px边框），编辑卡片到运行选项8px；运行选项顶部从535.1875px移至469.5px，减少65.6875px。320px文档scrollWidth=320，弹层left=8/right=312；128字符身份不再撑高编辑器工具栏。最终 `editor-360.png`、`editor-320.png`、`save-context-360.png`、`open-320.png`已目视检查。

当前静态语法／ID与ARIA引用／离线CSP三项通过；同命令17/17中的14项仍为历史R2.6快照，不能算当前交互。原型刷新清空，真实产品、持久化、读屏／实体IME、权限、Native、安装与production仍NOT_TESTED。本轮无独立重评分、不改正式React、不构建／安装／提交／推送。TaskSpace139已释放。
