# ScrapyJS 预览目标与关键测试条件

## 当前任务：将新版交互接入实际扩展业务（2026-11-01）

**本节是本次业务同步的目标与测试合同。** 下文 v7、candidate 等记录保留其原始范围；旧离线评分、旧安装成功及“只做预览”边界不替代本节，也不自动触发正式发布。当前交付先设置目标、差异和关键测试条件；业务实施与实际运行结果分别记录，不因写好目标就标记功能完成。

**目标**：用户从 OpenDesk「扩展 → scrapyjs 采集」打开实际工具，能够按新版交互编辑规则、保存并重开配置、执行真实采集、核对完整记录并下载正确的 CSV/JSON；界面动作、配置草稿、持久化数据和固定 Task 参数一致。预览专用的点选/列表切换须明确真实接入结果，不能用样例数据完成产品验收。

**下一条操作**：先从「开发 → 本地项目 scrapyjs → 在侧栏调试」打开当前源码，选择一个原有配置，修改一个合法字段后直接保存、重开并核对，再执行采集和下载。先记录具体失败/未验证步骤，再修该步骤；不先执行全量测试或重建 Browser。调试权限不能完成的安装态操作单列验证，不能关掉权限检查。

### 已核对的入口与差异

类型为 Sidebar Tool v2，业务 owner 仍是 `examples/sidebar-tools/scrapyjs/`；React 在 opaque-origin iframe 内运行，通过原 `OpenDeskTool.request` / adapter、App Model 和固定 `scrapyjs.capture` Task 工作。主 Skill 为 `opendesk-sidebar-tool-dev`；正式包/安装另走既有打包与审阅链。当前目标不要求修改 Browser Framework；公开能力缺口尚未证明，不能据此扩大平台写入范围。

| 层次 | 本次只读观察 | 实施时的处理 |
| --- | --- | --- |
| 交互基线 | 固定 `preview.html` 的 SHA-256 为 `8d2b2c3e4681944b58ff8e5f69d9ab62ffa6d122ffba225525c04376dd17130e`，来源是字段即时编辑 candidate6；README 还引用排序/CSV 的其他冻结候选 | 先核对最新用户选择、真实组件和对应测试，冻结一个本轮候选及来源；不能拼接不同候选的通过结论 |
| 正式入口 | `src/main.jsx` 挂载 `<App/>`；`preview/entry.jsx` 额外注入 `RuleAssistant`、`ListScopeAssistant` 并启用 AI 占位 | 真实采集、存储、下载和完整 Chat 保留正式入口；预览 mock 和占位不能带入正式包 |
| 业务源码 | 字段即时编辑、排序与 CSV 接线已有实现或未提交增量，不能当作空白项目重写 | 优先复用 `App.jsx`、`RuleEditor.jsx`、`FieldOrder.jsx`、`Results.jsx`、`ColumnSettings.jsx`、`app-model.js`、`editor.js` 与 `adapters/app-sdk.js`；只修实测缺口 |
| 结果交互差异 | 当前 `Results.jsx` 和 `result-display-interactions.mjs` 已采用「自定义 CSV 表头」及本次 CSV 排序，没有旧「显示设置」入口；历史 DESIGN/README 仍描述旧方案 | 实施前核对本轮 UI 基线；不根据旧章节自动恢复显隐/显示名称设置。表格显示、规则顺序、自定义 CSV 顺序分别验证 |
| 工具构建 | `dist/build-ready.json` 的来源记录与当前 11 个文件不符：adapter、App、Results、RuleEditor、ai-config、app-model、capture-trials、editor、results-model 及两份业务 CSS | 旧 dist 不能证明新 UI 已运行；复用原 watcher/构建器，相关源码稳定后再取得同源产物。不得覆盖并行输出 |
| 真实点选 | 两个助手目前仅由 preview entry 注入，操作离线样例；正式 main 没有注入。旧网页 `window.selector.next()` 不是当前沙箱公开 SDK 证明 | 标记 `REAL_PAGE_ADAPTER_NOT_WIRED`。先查公开 SDK/真实消费者并走授权入口；无法在工具内解决时补齐公共缺口证据，再交 Runtime owner，不直接搬 mock 或在 Host 增加 scrapyjs 特例 |
| 既有安装 | 仓库配置为 App `1.8.2`、Task `0.6.1`；旧证据记录 CFT149 上采集和下载成功 | 只是旧候选证据，本次未读取当前安装状态。开始运行时重新核对包、Task 身份及当前页；不据版本相同推断源码相同 |

以上是开始时观察，源码、Profile、watcher、安装和服务状态在执行时重查。当前没有启动或切换产品环境。旧记录中的 Browser 路径为 `dist/development`，serve 连接未证明；不得写成当前持续开发已连接。

### 实施顺序与写入范围

1. **P0：确认同一 UI 基线并打开真实入口。** 对照最新交互、正式/预览 entry 和当前源码，记录本轮包含的动作及其真实 adapter。保留现有工具 ID、配置、Task 固定身份、草稿与 UNKNOWN 保护。
2. **P0：规则 → 草稿 → 保存 → 重开。** 合法字段/范围即时进入配置草稿；排序和名称元数据正确持久化，错误输入仍可修正。复用原 Model、editor 和 CAS，不增加第二套配置状态或自动保存。
3. **P0：采集 → 记录 → 下载。** 核对实际发送的完整规则与当前目标；结果对应同一次运行。原始下载保持完整，自定义 CSV 的列顺序、表头和每一行对齐。
4. **P0：真实点选与列表切换。** 按原 UI 操作补真实网页 adapter，区分字段、列表范围与取消/迟到回填；缺少合法公共能力就保留明确阻塞及最小平台接入任务，其他独立业务继续。此项未接通时只能交付已完成部分，不能宣称新版全量可用。
5. **P0：同候选验证与可见结果。** 先最短真实链，失败后选定向检查。源码和产物对应且真实侧栏可见，再核对当前安装候选；正式更新若进入本轮，通过原打包、版本、审阅和安装链完成，不卸载重装或跳过确认。

默认写入工具自身源码、adapter、定向测试/fixture 及本文件。Controller/引擎仅在真实参数或提取失败证明需要时改动；来源快照不能手改代替上游同步。Browser `src/`、独立 `scrapyJs` / `scrapyJsChrome` 仓库均不因本次 UI 同步自动进入写入范围。

### 关键测试条件（业务实施的通过标准）

| 编号 | 操作或输入 | 必须观察到的结果 | 最小证据 / 既有入口 |
| --- | --- | --- | --- |
| B1 | 在真实侧栏打开本轮源码/候选 | 是正式 App 业务入口；当前 UI 与所选基线一致，无运行错误。记录源码/构建/包或调试快照身份；不能只有离线 HTML 截图 | `src/main.jsx`、本地项目调试、`dist/build-ready.json`；固定预览仅作对照 |
| B2 | 连续新增、改名、修改规则/范围，随后直接保存或采集 | 合法值即时生效，无额外“应用字段”；焦点和中文输入不被重建打断。空值、重复名、非法规则原位保留并阻止保存/运行；Esc 只恢复当前输入最后合法值。复杂 JSON 无损 | `inline-rules.test.mjs`、`inline-draft.test.mjs`、`rules-inline-interactions.mjs`；真实侧栏操作 |
| B3 | 拖动规则顺序；Space → 方向键/Home/End → Enter 或 Esc | 确认后顺序随配置保存并在重开后恢复；取消不提交；连续移动保留逻辑字段焦点。改名同步迁移 `output.fieldNames` / `fieldOrder`，选择器与原数据不变 | `field-order-interactions.mjs`、`app-model.test.mjs`、`profiles.test.mjs` |
| B4 | 原配置保存、重开；新建/复制/改名/删除；取消切换或制造 CAS 冲突 | 原配置及其他记录保留；未保存草稿有保护。实际写入并读回才显示保存成功；冲突或结果未知保留草稿，不自动覆盖/重试 | `profiles.test.mjs`、`app-model.test.mjs`；真实存储读回 |
| B5 | 点击真实网页的字段，选择文字/链接/图片地址；取消或页面已切换 | 规则来自目标网站，回填正确字段并可立即采集；取消不改配置。绑定当前 tab/document/配置代次；过期、跨页、跨配置和撤权回填拒绝。页面与沙箱均无残留监听/高亮 | `rule-selection.test.mjs`、`rule-picker-interactions.mjs` 只证明算法/预览；还须真实网页 adapter 与定向身份/清理证据 |
| B6 | 切换下一个列表或点选整个列表；无匹配/只有一个候选 | 切换一次点击即完成，不加候选弹窗或第二次确认；点选可取消，确认后范围即时进入草稿。反馈实际列表/条数，字段随后使用新范围；不静默清空过滤项或扩大为全页 | `list-scope-interactions.mjs`、`rule-selection.test.mjs`；真实网页，不能用离线 books 样例冒充 |
| B7 | 列表项+相对字段；完整路径独立字段；旧容器+直接子项；缺失字段/零匹配 | 按真实配置进入固定 Task；关联记录不串行，独立字段不靠数组下标猜拼行，旧直接子项规则保持。缺失字段、空结果如实返回，不扩范围或编造值 | `list-item-only.test.mjs`、`extraction-contract.test.mjs`、`app-model.test.mjs`；本机确定性 fixture 和一条真实采集链 |
| B8 | 开始 → 等待结果；Stop；未知回执/迟到结果/身份不符 | 结果属于原 Task/Run/配置；停止只作用于原运行，宿主终态不冒充实例退休；UNKNOWN 不重放，未退休不能重新开始。确认取消也不额外 start | `app-model.test.mjs`；真实正常链与本次受影响的最小生命周期检查。历史 UNKNOWN 不为验收重放或清空 |
| B9 | 查看完整记录；下载原 CSV/JSON；结果多页、缺失字段、零/false/嵌套/长值 | 当前表格与完整记录相符；下载保留全部记录及原 key，不随可见页截断。区分空、失败、partial 和权限拒绝；不可信内容按文本显示 | `results-model.test.mjs`、`app-model.test.mjs`；实际下载文件逐行/逐字段与同次原始结果比对 |
| B10 | 预设 CSV 名称并保存；本次自定义表头/顺序；空名称、重名、公式与 UTF-8 上限 | 预设可重开恢复；本次排序只影响本次 CSV，表头和所有数据行同步，原 CSV/JSON、表格与采集规则不变。空名称回退原 key；重复/非法表头拦住自定义下载；公式防护保留；超过 150000 字节拒绝而不截断，成功须有下载回执 | `custom-csv-export.test.mjs`、`result-display-interactions.mjs`、`field-order-interactions.mjs`；真实下载核对 |
| B11 | 返回配置库/采集页；AI 开合；配置/字段/JSON/Chat 有草稿 | 导航不丢草稿、焦点和必要滚动；无导航准入仍有合法返回。正式入口保留完整 Chat，收起不取消或重放请求。预览 AI 占位和模拟提案不进入正式工具，不据本轮 UI 同步发真实 AI 请求 | `app-view.test.mjs`、`ai-panel.test.mjs` 的受影响用例；真实侧栏开合。完整 AI 推理闭环另列 `NOT_TESTED` |
| B12 | 目标页变化、权限拒绝/撤销、旧 Task/旧实例、来源漂移 | 明确阻止相关动作且保留草稿；不扩权、不跨文档回填、不自动更新固定 Revision。构建/包身份不符不能覆盖正式包；受影响的 CSP、来源与 Authority 保护保持 | `app-model.test.mjs`、`page-adapter.test.mjs`；产物变化才选 `package.test.mjs`、`preview/runtime-source.test.mjs` 及对应真实负例 |

测试文件除特别注明外位于工具 `tests/`。以上是选择条件，不是要求先全部运行的命令矩阵：每次先说明当前失败/改动、要证明的行为及尚缺证据，再选择对应切片；无改动、无新失败且证据仍有效的项目不重跑。不新增只核对源码字符串的测试来代替用户动作。

### 完成、交付与停止

- **目标设置完成**：本节落盘并核对事实、文件入口和测试映射；业务接线、构建、安装与真实操作结果仍分别待执行，不因文档完成改变其状态。
- **核心业务完成**：B1–B12 中本轮动作及受影响保护有同候选证据，最短真实链「编辑 → 保存/重开 → 采集 → 下载核对」跑通；真实点选/切换若仍仅模拟或阻塞，必须点名未完成，不能宣称整个新版 UI 已接通。
- **交付内容**：变更文件与动作映射、必要定向结果、源码/产物身份、实际可见结果、剩余缺口及下一步。`SOURCE_WIRED`、`BUILD_PASS`、`PACKAGE_PASS`、`NATIVE_CHROME` 分开记录；缺证据标 `NOT_TESTED`，失败保留原记录。
- **安装更新**：仅在进入该步骤时，按原打包器生成并验证临时候选，再晋升唯一正式 JSON；核对同 ID 版本及固定 Task 绑定，经原审阅安装，重开确认旧数据与新 UI。不把 `app:update` 成功当作已安装，不默认升级 Task 或绕过其独立冻结/验证。
- **停止条件**：完成本轮约定的核心业务及对应最小验证即停止；不自动恢复历史评分、全量 CI、production/CWS、压力/变异测试、宽度/缩放矩阵或系统 IME 专项。实际输入中复现的故障仍需修复。
- **协作与安全**：只在现有 `main` 工作，保留所有并行改动；不建分支/worktree/PR。先核对实际文件与 watcher/Profile owner，不覆盖输出或停止他人服务；原 UNKNOWN 不重试、不清空，也不通过新窗口/重载绕过其相关保护。提交、推送和发布不由本目标自动授权。

本次仅设置目标与条件，未执行产品测试、Browser/工具构建、安装、真实采集/点选、AI 请求、包晋升、提交或推送。历史有效证据保留其原候选范围。

---

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
