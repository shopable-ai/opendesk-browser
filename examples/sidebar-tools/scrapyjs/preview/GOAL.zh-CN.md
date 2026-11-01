# ScrapyJS 预览目标与关键测试条件

## 当前结果 v7：柔和按钮与配置库（2026-11-01）

最新用户反馈已实施：浅灰主操作/发送、白底选中页签、中性气泡、用途明确的配置库，以及可见技术长段移除。[当前交付索引](../../../../artifacts/sidebar-preview-kit/official-neutral-20261101-v7-evidence/README.md)维护同SHA回放、独立评审与固定入口同步结果。综合设计96.1、架构96.875；不得表述为每一维都严格>95（设计证据95、架构维护94）。历史严格逐维目标没有全部达成，不能伪报；本轮已完成当前用户操作与95+综合方案，不因旧清单自动扩大为重构或正式验收。

当前完整预览为v7，旧v4、v5失败评审及v6中间候选保留各自范围。真实AI/采集/Native/安装/production不在本轮；原UNKNOWN和安全围栏保留，不提交推送或晋升包。

## 历史目标与严格逐维标准：官方 React Aria 风格试点（2026-11-01）

本轮以官网 aria-nova / Neutral 收敛原工具浅色 UI，与公共组件和原 Preview Kit 同源。下一条用户操作是打开完整离线页面，编辑/保存/取消规则与 JSON，查看/导出结果，开合 Chat、审阅提案并显式应用/命名保存。保留原功能与 UNKNOWN 围栏。具体设计见[当前设计](DESIGN.md#官方-react-aria-风格试点2026-11-01)。

完成须有同候选三件套、工作区与 Chat 的核心回放、来源/CSP与公开Runtime定向检查、当前截图及两位独立只读评审。每位对下方既有八维分别给分，目标严格>95；不能继承历史评分。交付状态与原始评审见[本轮交付记录](../../../../artifacts/sidebar-preview-kit/official-neutral-20261101-v4-evidence/delivery.json)。本轮到离线 UI 收尾停止，不自动启动下文历史完整矩阵、真实AI、采集、安装或包晋升；不提交推送，不测试宽度/缩放。

生效日期：2026-10-31。范围：本工具当前离线浅色交互预览及其同源 React UI。

2026-11-01 增量仍沿用原八维量表与离线边界。当前候选 `078926cb…` 的审阅落点、独立操作底栏、可见标题/阶段、发送原因和资料层级验证见 [当前证据](../evidence/ui-design-browser-20261101.json)，具体设计见 [DESIGN.md](DESIGN.md#2026-11-01--审阅可发现性与共享-chat-层级)。下方 2026-10-31 评分属于旧候选，不作为本轮通过依据。

[本轮独立子Agent评审](../evidence/ui-design-review-20261101.json)为100 / 98 / 100 / 99 / 99 / 100 / 98 / 99，均>95且无当前离线设计阻断；[受评HTML及同目录三件套](../../../../artifacts/scrapyjs/design-20261101/candidate4/preview.html)为冻结交付。本目录固定三件套已由并行任务更新，未覆盖、不沿用本轮评分；工作区同源及真实AI/安装/采集未由设计评分证明。

[2026-10-31 历史独立复评](../evidence/ui-toolbar-chat-review-20261031.json)：100 / 96 / 97 / 99 / 98 / 100 / 97 / 96，仅属于其原候选，不代表本轮评分或原生验收批准。

## 当前组合与验证层级

完整工具栏 Chat 组合是 **Host 公共入口 + workspace/business + SharedConversationDock + SharedConversationFrame/session**。工具通过 `OpenDeskTool.setConversationState({visible:boolean,open:boolean})` 声明展示状态，从 `OpenDeskTool.root` 接收 `opendesk:conversation-action`，其 `detail` 为 `{action:'toggle'}`，再受控更新 open。这些能力仅控制展示，不授予权限、不自动发送。`SharedConversationDock` 是纯展示组件，使用受控 `open/onClose`；消息、输入和会话继续使用原 Frame/session。Host 实际安装入口为 NOT_TESTED；本轮验证层级是工具源码与 preview 模拟。

实际参照为 `projects/bookmark-manager/preview/react`，它消费真实 App + TrustedWorkspace：HeaderSlot 中小字 AI 按钮紧挨卸载；展开后业务在上、Chat 在下，以细分隔条形成底部 split，支持拖动及键盘调整；收起回到按钮，重开保留草稿。此处只复用公开组合与交互，不导出 TrustedWorkspace/HeaderSlot，不跨 iframe DOM，也不复制书签业务。

Frame 示例只是消息/输入片段，不能作为完整工具栏 Chat 范例。公共 `components.html` 顶栏的小 AI 按钮也必须能够实际开合底部 Chat，不能只有内容区 Frame。业务节点、当前页签、编辑与 Chat 草稿、消息和提案保持挂载；收起不取消请求、不清除 busy/UNKNOWN 围栏、不自动重发。

本轮实际产品回放、来源锁与未测边界见 [工具栏 Chat 证据](../evidence/ui-toolbar-chat-browser-20261031.json)；独立复评分数和扣分见上方链接，未执行项不推定通过。

## 目标与完成标准

1. 用户直接打开 [preview.html](preview.html)，即可体验“选配置 → 核对目标 → 模拟采集 → 查看完整结果 → 导出”，无需启动服务。
2. Host 顶栏紧挨卸载的小字 AI 按钮展开/收起底部共享 Chat split，细分隔条可拖动/键盘调整，配置、目标、当前页签、编辑/Chat 草稿、消息及必要滚动保留；不再出现替代工作区的独立 AI 页面。编辑规则、JSON、配置管理和提案审阅继续可用。
3. 独立只读评审先通过“实际工具栏入口与真实 consumer 参照一致”和“规范/模板来源正确”两个前提，再对八个适用维度**分别 >95/100，整数分至少 96**评分且无阻断：需求符合度、样式一致性、层级可读性、操作反馈、键盘焦点、复用隔离、可维护性、证据充分性。不能用均分掩盖单项不足。
4. HTML、manifest、浏览器操作报告和独立评审绑定同一候选 SHA；同一候选具备关键操作证据、对应截图和受影响保护的定向检查。

业务 owner 保持 `examples/sidebar-tools/scrapyjs/`，复用当前 React、App Model、SDK adapter、公共组件及原预览生成器。旧独立 Chrome 扩展只参考功能，不复制成第二套业务界面。

## 关键测试条件

| 编号 | 用户操作 / 条件 | 必须观察到的结果 | 验证入口 |
| --- | --- | --- | --- |
| K1 | 打开离线 HTML | 配置和主动作可见；按钮确实可点击；无页面/控制台运行错误。源码、产物及 HTML 的来源 SHA 一致 | manifest、浏览器报告、runtime-source.test.mjs |
| K2 | 新建、选择、保存、复制、改名、删除配置 | 使用明确名称；重复名称保留输入并报错；切换/删除/示例替换需要相应确认。取消/Escape 不丢草稿并恢复焦点；内存保存成功才显示已保存 | preview-interactions.mjs、app-model.test.mjs |
| K3 | 编辑字段、分页和完整 JSON | 未应用或无效草稿阻止 Run/Save；跨页签保留输入；错误就近显示并聚焦修正；不同编辑器不清除对方错误。复杂规则转到 JSON 后说明可见、原规则无损 | preview-interactions.mjs、app-view.test.mjs |
| K4 | 开始、停止、查询原运行 | 运行中锁定配置和预览重置；停止只作用于原请求。宿主终态不能冒充实例退休；确认退休后才能恢复开始，过期等待提示消失。身份不匹配拒绝，结果未知不自动重放 | preview-interactions.mjs、app-model.test.mjs |
| K5 | 查看结果、列设置、完整记录与导出 | 简单表格不裁掉末列；长数据仍可局部滚动及打开完整记录；列设置不改原数据；单页不显示多余分页。Node 验证完整导出 payload、CSV 转义及分页不丢记录；浏览器验证下载触发和 `SIMULATED-` 文件名 | preview-interactions.mjs、results-model.test.mjs、app-model.test.mjs |
| K6 | Host 顶栏 AI 开合、分隔条拖动/键盘调整 → 固定提案 → 差异 → 应用 → 命名副本 | 业务在上/Chat 在下；收起返回按钮、重开保留草稿；工作区、当前页签、字段/坏 JSON/Chat 草稿、消息、提案、滚动和结果保留；开合不卸载、不清锁，关闭/Escape 返回 AI 按钮。鼠标与 Enter 发送、Shift+Enter/IME 拒发；busy/UNKNOWN 可收起且保留原锁、停止及迟到结果保护。应用后就地命名副本，原记录不变，不自动 Run；复制后清旧结果归属。重名失败仍提示未保存；对应提案保存成功后当前 AI 反馈不得再要求命名保存 | ai-dock-interactions.mjs、ai-app.test.mjs、ai-panel.test.mjs、ai-request.test.mjs、ai-pending.test.mjs、shared-conversation-send.test.mjs |
| K7 | 成功、空、失败、加载、权限拒绝、不可信文本 | 空结果不编造数据；失败标题、原因和样式一致，原因就近可见，空结果 CSV 禁用。权限拒绝阻止 Run、保留草稿，不能误导为存储冲突或要求打开网页；不可信文本只作文本显示 | 六种模拟场景与截图、preview-interactions.mjs、results-model.test.mjs |
| K8 | 键盘与禁用状态 | 页签方向键/Home 可操作；Escape 取消或关闭后恢复焦点；字段错误可定位；禁用控件外观明确。共享发送保留 Enter、Shift+Enter、IME 和 blocked 保护 | preview-interactions.mjs、shared-conversation-send.test.mjs |
| K9 | 隔离、来源、权限与重置 | 保留 opaque iframe、CSP 及固定运行时来源校验；不可信来源不能操纵外层重置；dirty/busy 时不能切换场景丢弃状态。保留 CAS、Task 身份和 UNKNOWN 围栏；不增加权限或第二套 Host/安装器 | runtime-source.test.mjs、app-model.test.mjs、共享 UI 内存编译检查 |
| K10 | 规范/模板和独立 UI/UX 复评 | 先确认两个前提；R27、preview kit、组件组合和 canonical 外壳来源可追溯。实现者与只读评审分离；读取同候选截图与操作结果，八维分别给观察、扣分和范围。每项 >95 且无阻断才通过 | DESIGN.md、preview.manifest.json、ui-toolbar-chat-review-20261031.json |

表内测试文件位于本工具 `tests/`；`runtime-source.test.mjs` 位于 `preview/`，共享发送回归位于仓库 `tests/environment/`。浏览器在正常窗口、默认缩放下执行。

## 历史风格来源候选（2026-10-31，已由工具栏/split 纠偏取代）

以下 100/99 等评分与操作只描述旧内容区 Frame 候选，不能作为当前标准或新组合 PASS。新组合须先过实际入口与参照前提，再以同 SHA 证据评审；缺少证据为 NOT_SCORED。

- HTML SHA256：`d2bc23d59a6bb563fbe576769f03b51dc09586d12dbdeace61e2f036860e51e5`；真实React UI与共享Frame/session，SDK仅内存模拟。字段/disclosure/title进入canonical CSS编译，目标卡为真实Card。
- 同候选[操作、computed与11张截图](../evidence/ui-style-source-browser-20261031.json)：28项AI浏览器检查通过，含可见标签聚焦、禁止有效提案原样重发、纠正需求可生成且阻止应用旧提案、开合草稿保留、差异/应用/命名/保存。6项AI Node检查通过；1369项来源无漂移。
- 62项工作区操作及11项来源阶段Node检查在前一风格候选`af532da0…`通过。当前只修改AI标签、重复就绪提示与提案发送guard，继续复用其未受影响范围，不冒充新SHA重跑。公共组件套件39项检查与Chat各内存状态操作保留其独立产物范围。
- 首轮风格候选层级95分未通过，原评审完整保留在`artifacts/scrapyjs/style-source-20261031/review-candidate2.json`。当前[独立子Agent复评](../evidence/ui-style-source-review-20261031.json)为 **PASS_SCOPED_OFFLINE_DESIGN_REVIEW_WITH_MINOR_DEDUCTIONS**：需求100、样式99、层级99、反馈99、键盘98、复用隔离100、维护98、证据98，八维均>95且无当前功能阻断。不沿用旧分数，不作为真人专家或原生验收认证。保留标题层级、输入前扫描路径、未同意时的就近提示、未来CSS约束及部分状态截图/纯键盘路径缺口，本轮不继续扩大。

## 历史间距候选（本次风格来源纠偏已取代）

用户指出现有间距仍有问题后，旧分数不再充当本轮完成证据。基线实测发现AI提案返回后Chat被固定高度网格压为2px；同时存在目标动作gap与padding叠加、列设置默认margin及标签间隔缺失。具体修复和固定评分细项见 DESIGN.md。

- 当时 HTML SHA256：`273baa41081a07ceec7d18db18539cfa52211ebc6893475d046cb131cd26f7c3`，当时状态 **PASS_SCOPED_UI_REVIEW**，不代表当前任务完成。
- 页面负责AI上下文和审阅滚动，消息局部滚动保留；完整JSON默认折叠但可查看。工作区、消息、原请求保护和应用/保存语义不变。
- 新候选的computed间距、截图、操作报告与评分由 `../evidence/ui-spacing-browser-20261031.json` 和 `../evidence/ui-spacing-review-20261031.json` 绑定，不覆盖历史报告。
- 实测目标卡从214.5px降至183px，提案后Chat从2px恢复到206.25px。字段组12px、标签到输入8px、相关说明4px；checkbox和列设置列表margin归零，有边框disclosure使用12px surface圆角，flat无外框。
- 当时候选新跑25项AI浏览器操作、11项Node检查和14项computed核对，6个布局状态、12张截图绑定同SHA；1369项来源锁逐项匹配。62项工作区操作在前一间距候选`173c…`通过，本次仅两处关联组和圆角改变，保留其原候选范围，不冒充当前SHA重跑。
- 首次间距复评的样式一致性95分未通过，明确指出两处相关说明间距和disclosure圆角；按原规范修复后才提交当前候选复评。原候选、操作证据及评审保留在`artifacts/scrapyjs/spacing-20261031/review-initial-candidate/`与`review-initial.json`。
- [最终独立设计子Agent评审](../evidence/ui-spacing-review-20261031.json)：两个前提通过；需求100、样式100、层级99、反馈98、键盘97、复用隔离100、维护100、证据99，八维均>95且无当前布局阻断。实际查看12张新截图，独立核对1369项来源与12张截图哈希。仍保留空Chat/placeholder重复、权限原因多区重复、完整键盘路径和pending瞬间真实指针操作证据缺口，不将模拟评分当成真人专家认证或安装验收。

## 历史交互候选（上一轮结论，仅其当时范围）

- 旧候选 SHA256：`9eb4bd8f7cca98f84cd076be98bdfd99999845a7b582e364f17cfcd7a5c3b5d6`，未满足本轮新纠偏，不能沿用其评分。
- [浏览器操作证据](../evidence/ui-preview-browser-20261031.json)：62 个交互检查通过，页面/控制台错误为空，11 张截图覆盖主要工作区及六种模拟场景。
- 41 项定向 Node 检查及 1 项共享 UI 内存编译检查通过；工具 Vite 构建通过。数量仅作补充，不能替代 K1–K10 的行为证据。
- [独立评审](../evidence/ui-preview-review-20261031.json)：六维依次 97、97、98、97、97、96，均分 97，无本轮阻断项。保留非阻断扣分，不宣称满分。
- 上一轮候选 SHA256：`3b77fca0a318e5453bc7fd6836328f2b527e76db06c164e6ca66fdb1825ad5dd`。其当时报告为 **PASS_SCOPED_UI_REVIEW**，但遗漏了本轮实证的布局压缩缺陷，不能证明新间距目标完成；对应HTML保留在本轮artifacts/previous-preview。
- [历史操作证据](../evidence/ui-ai-dock-browser-20261031.json)：22 项浏览器切片、5 张截图；22 项定向 Node 与4项来源检查、工具构建通过。旧62项未重跑；未受影响的历史证据保留原范围。
- [历史独立评审](../evidence/ui-ai-dock-review-20261031.json)：两个前提通过，八维分别100、98、96、100、97、99、100、100，无阻断。维度顺序为需求、样式、层级、反馈、焦点、复用隔离、维护、证据；各项观察、扣分和边界在评审原文中。
- 首轮新候选因保存成功后仍提示未保存而未通过（反馈94分）；原评审、候选和截图保留在 `artifacts/scrapyjs/ai-dock-20261031/`。B1 已以对应提案的实际保存回执修复，补失败/成功断言后对新 SHA 复评，未覆盖或沿用旧评分。
- 已安装 ScrapyJS 总体状态仍以工具主 README 为准；离线 UI 完成不代表真实 AI 产品闭环完成。

## 最短执行步骤

1. 先回放真实 consumer 的 AI 开合、底部 split 调整、收起焦点和重开草稿，对照当前失败或未验证点。
2. 核对公开合同与已有 Host 入口，按完整组合保留业务、Chat 与原请求状态；不以内容区 AI 配置加大 Frame 代替。
3. 使用原生成器输出新目录，保留工具、运行时、组件与 HTML 的来源 SHA，不手改生成 HTML。
4. 对同 SHA 候选保存截图与受影响行为的定向证据，含顶栏按钮开合、拖动/键盘分隔条及草稿保留；未执行项写 NOT_TESTED。
5. 固定交付 `preview.html`、`preview.manifest.json`、`preview.context.json` 三件套，不混用不同候选。新证据见 [工具栏 Chat 记录](../evidence/ui-toolbar-chat-browser-20261031.json)，未执行项保持 NOT_TESTED。

## 失败、补测与停止条件

- 任一关键行为失败、来源漂移、未知副作用或单维 ≤95，当前候选不能标为完成。先区分产品、驱动断言和环境问题，再做最小修复与对应复验。
- 有效未受影响证据继续保留；不默认重跑全部62项或根测试。历史折叠布局候选曾运行62项离线工作区操作，只证明其当时范围；这不扩大成真实采集或原生验收。工具源码改变后，为交付同源 HTML 执行工具编译及原生成器，不构建 Browser。
- 只有相关源码变化、新失败或证据失效时才补测受影响项。UI 变化需更新对应截图与独立复评；不因无关主分支更新重跑全部检查。
- 交付 HTML、本文件、来源 manifest、操作报告和同 SHA 独立评审，满足上述标准即停止本轮；不自动进入后续正式验收。

## 验证边界

内存模拟保存不证明持久化；模拟复制回执不写系统剪贴板；固定 AI 提案不连接或理解真实模型；模拟任务不采集网站。

真实 AI、Native、当前候选的网站采集、安装/升级、production、暗色和屏幕阅读器专项均为 **NOT_TESTED**。物理宽度/缩放矩阵为 **OUT_OF_SCOPE**。不重置或重放原 UNKNOWN 请求，不触碰原安装、身份及并行服务；不得将预览评分用作原生验收结论。

本轮不提交推送、包晋升、安装、Browser build、真实 AI 或完整验收；不因文档门槛启动产品。Host 实际安装与工具源码/preview 模拟分别记证据，不相互替代。
