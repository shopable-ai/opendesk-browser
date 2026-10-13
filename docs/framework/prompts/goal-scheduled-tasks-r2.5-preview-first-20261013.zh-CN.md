# GOAL：OpenDesk Browser Scheduled Tasks R2.5 — HTML Preview First

## 先完成唯一可交互 HTML 预览、真实源码功能映射、专家级 UI 评审；用户确认之后再改生产 UI

日期：2026-10-13。默认中文。

仓库：https://github.com/shopable-ai/opendesk-browser

Mac 本地：`/Users/shopme/Documents/workspace/opendesk-browser`

唯一可写分支：`main`。

**本轮执行模式：PREVIEW FIRST / REAL SOURCE GROUNDED / SINGLE CANONICAL HTML / VISUAL REVIEW GATE。**

### 一、本轮目标和边界（极重要）

**直接读取真实 OpenDesk Browser 仓库，基于目前 R2 已实现的定时任务功能，先优化、完成并实际渲染一份高质量、可交互、可切换状态的 HTML 预览。**

本轮不是从零设计调度器，不是再开发一套 Scheduled Tasks，也不是直接重构生产 UI。**在用户明确认可预览前，不要修改 `src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/scheduled-task-workbench.js`、Authority、RunHost、存储、调度或权限代码。** 尤其不能与并行运行的 R2.3/R2.4 Agent 争抢生产 UI 文件。

这是一个完整且独立的可审查交付：**唯一 HTML 文件 + 真正浏览器渲染截图 + 每项功能到生产源码的映射 + 视觉质量验收 + 可直接打开的链接/本对话预览**。不要仅返回设计观点、静态截图或新的 GOAL。

用户批准之后，才在下一次明确授权的实施阶段将同一版设计同步到原有生产 DOM/CSS/JS，并重跑原生 Chrome 测试。HTML 预览不能证明 Chrome Alarm、Task 授权、Run/Result、用户 Profile 的真实运行。

### 二、先读取仓库里的现行规范和真实实现

必须核查最新 `main` 的 HEAD、`AGENTS.md`、并行开发协议、工作树和目标文件 SHA；允许并行 Agent 持续推进，不创建分支、worktree、PR、不强推、不 reset/clean、不覆盖别人未提交内容。

必须先完整阅读并执行：
- `docs/architecture/ui-layout-conventions-r27.zh-CN.md`：唯一颜色、尺寸、间距、Token、响应式权威。
- `docs/architecture/sidebar-design-system-r20.zh-CN.md`：R20/R26 Side Panel 基础布局、单一 gutter 和 `od-*` 原语。
- `docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md`：以「工具」Tab 提炼 Index → Detail/Form/Management → Inline Review 的多功能区组织方式。
- `docs/framework/prompts/goal-scheduled-tasks-r2.4-ui-multi-section-final-20261013.zh-CN.md`：之前的 UI 目标，避免重新理解产品功能。
- `docs/framework/workstreams/scheduled-tasks-r2-20261013.md`、`docs/api/scheduled-tasks.zh-CN.md`。
- `src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/design-tokens.css`、`src/ui/design-system.css`、`src/ui/scheduled-task-workbench.js`、`src/ui/scheduled-task-host.js`、`src/ui/tool-shell.js`。
- 只读参考真正「工具」Tab：`#sidebar-tool-list-view`、`#sidebar-tool-display`、`src/ui/sidebar-tools.js`。
- `src/platform/tasks/schedule-contract.js、schedule-service.js、schedule-repository.js、schedule-time.js` 中真实状态及 API（路径有空格的显示仅作说明，以仓库实际存在的四个文件为准）。
- `tests/environment/scheduled-task-ui-r1.test.mjs`、`tests/framework/scheduled-tasks-r1-native-mac.test.mjs`，以及已取得 PASS 的截图/日志和 package hash。

**历史原型**：`examples/ui/scheduled-tasks-r1-preview.html` 仍是 R1 的模拟交互文档，不是当下的 R2 生产 UI；必须审阅其中有用的表单与交互，但保留原文件不覆盖它，也不把它直接宣称为已通过的 R2 设计。

### 三、唯一 HTML 成品位置：严禁多套备选方案造成分叉

目标唯一新版 HTML：

`examples/ui/scheduled-tasks-r2.5-preview.html`

- 若该文件已存在，基于它原位优化，**不得另建** `final-v2.html`、`prototype-new.html`、`preview-2.html`、多套页面或无关 mock app。
- 历史 R1 HTML 保留。R2.5 只允许**一份**正式预览，用同一页面上的**预览控制台**切换 Side Panel/独立运行页、业务状态、设备宽度与示例数据。
- 使用单文件 HTML + 可维护的局部 CSS + 原生 JS/状态机 + 确定性 fixture；**不引入外部 CDN/远程脚本/图片依赖，不引入第二套 Design System，不调用真实扩展 API/Authority/Cloud/Chrome 权限，不执行用户代码，不伪造 Run/Result 或网页效果**。
- 颜色与间距使用 R27/R20 权威语义，单文件可携带经过源码核对的 Token 快照，并注明预览数据来源及日期；不要假装复制的 CSS 自动等于真实生产 CSS。
- 预览控制台应清晰标记“**仅界面模拟 · 不运行任务**”，最好与产品画布视觉隔离，不得把模拟“成功运行”表现成真的扩展执行记录。

### 四、先冻结 UI 功能映射，保证预览不会变漂亮却无法实现

在开始画新版界面**之前**，从当前真实 `tool.html + scheduled-task-workbench.js` 提炼“用户操作 → 原 DOM / Host 方法 → 是否需要真实 Chrome 权限 → 原状态约束”映射表。至少覆盖：

1. 入口：`我的 → 定时计划`，左侧返回，现有六个一级 Tab 不变。
2. 列表/空态、多计划、下一次时间、暂停/恢复、编辑、删除及原位确认。
3. 创建/编辑：已验证并安装任务选择（Select 右侧两枚“新建脚本/管理任务” Icon，不混入选项）、固定版本/网站权限、URL、JSON、一次/每天/每周/间隔、IANA 时区、下次时间预览、错过策略、确认保存。
4. 任务管理：搜索、全部/启用/停用过滤、任务详情、停用/启用、卸载/确认、返回来源并保留草稿。
5. 运行历史：最近结果、展开明细、加载更早 20 条、RunId/ResultId/FireId 和资源结算只在技术详情。
6. 独立运行页：`scheduledRunner=1` 的可见 Host，当前 Run、下一计划、最近结果、暂停/恢复、合法 Stop、管理入口；**不是第二个调度器**。
7. 状态：READY、WAITING_HOST、WAITING_TARGET、WAITING_SLOT、RUNNING、SETTLING、SUCCESS、FAILED、STOPPED、UNKNOWN、MISSED、CANCELLED、NEEDS_ATTENTION、暂停、权限撤销与 Task 安装身份变化。用户主要文案必须中文、说明下一步。
8. 边界约束：无可见 Host 才是 WAITING_HOST；Runner 自身可见时不应凭空宣称“没有任何可见 Host”。被拒绝/UNKNOWN 的原 Fire 不自动重跑；授权恢复不能隐形绕过 Chrome 或重新绑定旧计划版本；不能把模拟中新增的权限请求当真实功能。

把映射表写在最终交付说明，若需持久化可放入 HTML 注释中的 `PRODUCT_PARITY_CONTRACT` 小节，避免另起一批零散 MD。凡真实系统没有的操作，在预览中标注“设计候选，生产未实现”，不得偷偷变成承诺。

### 五、专家级 UI/UX 改造目标（重点是密度、层级与体验）

**A. Side Panel — 计划列表：**
- 一层清晰头部：左侧返回 +“定时计划”，右侧唯一主要 CTA“＋ 新建”或同等级图标；打开运行页是次要/上下文操作，**不与新建同权重**。
- 首屏应立即回答：目前有多少计划、下一次执行何时、当前任务/宿主有无问题、现在能做什么；不堆重复说明和无用数字卡。
- 一条计划卡片的扫描优先级：任务名称和可读状态 → **下次运行时间（主视觉）** → 人类可读频率与任务来源 → 主要动作暂停/恢复、编辑。删除与内部 ID 移到二级入口/确认，不与普通操作并排等权。
- 列表支持 0、1、3、20+ 计划的视觉状态。长中文、URL、任务名不得让按钮重叠或导致整页横向滚动。
- 历史优先显示摘要而不是默认拉开 20 条；按用户点击展开/分页。必须有错误和 loading 行为。

**B. 创建/编辑计划：**
- 分成用户能理解的单列顺序：计划名称与来源 → 目标网页与参数 → 频率、日历/星期和下次执行预览 → 高级策略 → 明确的保存确认。
- 固定任务版本/网站/授权是可读摘要，不大段技术文本；不存在的网站权限明确提示“需去 Chrome 设置处理”，不能新增虚构的一键授权。
- 下一次执行时间应突出显示；时区、DST、每隔 30 分钟的展示与当前真实调度契约一致。
- 字段内联错误紧贴输入控件；保存后保留正确状态，取消/返回不无故丢失草稿。
- 对窄屏的两枚脚本 Icon 做真实点击目标和换行布局审核；不要让 HTML 模拟的弹窗、报错或提交步骤偏离生产的两阶段确认。

**C. 独立运行页：**
- 大标题只出现一次；“可见 Host/Chrome 关闭期间不能执行”等重要但低频说明放在合适的简短辅助说明/帮助，而不占用整屏。
- 如有正在运行的任务，**当前任务占第一焦点**；否则是**下一条计划**。焦点卡应显示时间、状态、可用的暂停/恢复/停止，以及异常时下一步。
- 最近一次结果和宿主信息用次要紧凑布局，不再用四张同视觉权重的大统计卡抢走首屏。
- “管理全部计划”清晰可找到，但不重复三次；列表与运行页返回路径合理，操作焦点保持正确。

**D. 与「工具」Tab 统一：**
- 必须继承 R28 的“索引 → 详情/表单/管理 → 原位确认”布局和 R27/R20 Tokens / `od-*` 语义，不抄写工具 Tab 的权限/存储/沙箱代码。
- 不增加“定时任务”一级 Tab，不覆盖其他 Tab CSS，不触碰宿主信任边界。
- 不要为了“高级感”加大片空卡、很淡的 11px 关键文字、过度阴影、无意义动画；对比度与紧凑操作优先。

### 六、必须在同一 HTML 里内置可点击的预览控制台

可切换的**真实可评审状态**至少包括：

- **画布**：Side Panel 列表、创建、编辑、任务管理、历史、删除确认，以及宽屏独立运行页。
- **数据**：空计划、单计划、3 个不同规则计划、20 条运行记录、100+ 历史记录、长中文名称/长 URL、无已安装任务、有已安装但停用任务。
- **运行与安全**：待执行、运行中、成功、失败、无 Host、等待网页、等待执行槽、权限撤销、NEEDS_ATTENTION、UNKNOWN 不可自动重试、暂停/恢复。
- **时间规则**：一次、每天、每周多选星期、间隔，切换示例必须同步 UI 预览，不能展示互相冲突的时间和状态。
- **尺寸**：Side Panel 300/320/360/420/520 CSS px，独立运行页 360/594/760/980 CSS px；额外展示接近 200% 实际缩放后的有效窄宽度。预览宽度切换**不等于**真实 Chrome zoom，界面中要注明。

交互必须真实影响**该 HTML 内部状态**：打开/返回、创建/编辑、表单校验、模拟保存确认、暂停/恢复、历史展开/分页、任务过滤与管理、权限状态切换、运行页切换、重置 fixture。没有后端权限的模拟操作绝不能尝试实际执行 Task。

### 七、正式验收流程：先真实浏览器渲染再交付

1. 从最新真实 UI 获取同一场景的基线截图（若只能拿到过去 SHA 的 Actions 截图，标为历史参考，不能冒充当前运行）。
2. 先给出 1 个统一方向，不同时设计 A/B/C 三套竞争方案。完成该唯一 HTML，启动真实 Chromium/Chrome 渲染，至少保存 Side Panel 320/360/420、独立页 594/760/980 的截图；每种宽度增加至少一种长文字/错误/UNKNOWN 状态检查。验证 DOM、截图真实对应同一 HTML 文件。
3. 自动检查无整页水平溢出、标题/按钮未相互遮挡、焦点环可见、标签与输入关联、按钮点击目标、中文信息完整、一次状态切换能正确撤销。手工/真实浏览器检查 Tab/Shift+Tab/Enter/Space/Escape 和浅/暗色对比。
4. 有条件时用 Chrome 真正缩放检查 100/125/150/200%；如果仅以 viewport 改 CSS 宽度，**不得将其记为 native browser zoom PASS**。
5. 不需要为纯 preview 声称生产 Chrome E2E PASS；记录 `PREVIEW_BROWSER_RENDERED`、`INTERACTION_SIMULATED`、`PRODUCTION_PARITY_REVIEWED` 与 `NATIVE_EXTENSION_NOT_TESTED`。
6. 各专家维度分别评估：信息架构、视觉层级、排版密度、可读性、任务操作效率、状态及恢复、表单体验、响应式、可访问性、设计系统一致性、生产源码可实现性，每项目标 ≥95/100。**没有证据写 NOT_TESTED；未到目标继续修同一 HTML，不通过平均分假称达标**。
7. 在**当前对话直接展示新 HTML 实际效果**（能嵌入 HTML 预览就嵌入；否则给出由本次工具真实创建的可点击 HTML 文件链接和截图/预览，附 GitHub 文件地址）。不能只返回一段源代码、README、架构说明或“下一轮执行”。

### 八、本轮提交与交接边界

- 将唯一 `examples/ui/scheduled-tasks-r2.5-preview.html` 写入仓库的 `main`，保存测试/截图及对应 Git SHA；若和并行 Agent 冲突，**仅暂停冲突文件**，不得覆盖未提交修改。
- 优先只写 **R2.5 预览及它独有的证据**，不要改生产 UI/Authority/RunHost；记录今后实现真正需要变动的 DOM ID、CSS 作用域、视图函数、测试选择器及每项风险。
- 交付 **原型 → 生产实现映射表**：每个新画面与操作对应真实文件、已有方法、是否复用、是否需要新增安全 UI 处理。该表是以后实施准确性的关键，不是单纯视觉评分。
- 明确告知用户“R2.5 HTML 视觉/交互预览完成，可评审；真实扩展页面仍为原版”，**由用户下一次批准后再进入生产同步阶段**。
- 给出 HTML GitHub 地址、当前对话真实预览入口、截图证据位置、测试情况、原型文件 SHA、Git commit 与是否推送 main；若环境无法真实渲染，要标注 NOT_TESTED，不能承诺“100%正确”。

**现在直接读取最新仓库并完成 HTML Preview First：优先产出真实可浏览、可切换完整状态的唯一 HTML；不要把“再写一份 GOAL”代替交付，也不要提前大规模改生产 UI。**
