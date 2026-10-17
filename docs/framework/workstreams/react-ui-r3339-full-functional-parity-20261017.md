# OpenDesk Browser React Side Panel R33.3.9 — 功能对齐与证据

日期：2026-10-17
状态：PARTIAL_IMPLEMENTED · INTERACTIVE_PREVIEW_UNDER_CI · INSTALLED_EXTENSION_NATIVE_CHROME=NOT_TESTED

## 治理、范围与证据原则

唯一仓库 shopable-ai/opendesk-browser，唯一目标分支 main。
保留并行 Agent 工作：每次修改从当时远端 HEAD 与原 blob SHA 出发，创建基于 HEAD 的正常提交，
无 branch/worktree/PR、无 force/reset/clean/stash。初始审计基线 30effda6 仅历史参考，
main 由多个 Agent 并行推进，不能把初始 SHA 当最新 HEAD。

正式五 Tab：我的、扩展、工作流、开发、云控；Debug 仅 Development 且只读。
沿用 React 19 唯一 root、正式 DOM、design-tokens + design-system、现有业务 Owner。
不允许把 Preview-only 操作提升为具有 Chrome/Host/权限执行能力的第二套系统。

相关改动记录：
- 0e50f441：MyTaskRows 维护独立展开状态，同一任务再次点击收起；旧 DOM fallback 对齐；Chromium CDP 回归。
- f8911f0a：修正“任务管理”排版，不覆盖共享 disclosure summary 视觉声明。
- d7d08f5a：生成器复用实际 workbench-discover；My 搜索、任务目录、计划表单/列表/编辑审阅 UI。
- 197a1074：复用实际 Sidebar Tool 导入文件表单，候选能力审阅，扩展状态机内存展示。
- be59cbc8：旧 DOM 收起后保持唯一真实 workspace 位于选中任务卡内，不新增第三个列表兄弟。
- 99fbea6f：Chromium 回放 My/Plan/Extension，追加 UI 交互前后截图与 CI 门禁。

## 源码功能矩阵（R=原 Owner，P=纯预览，N=Native NOT_TESTED）

完整审计链路为：功能 → 正式 DOM → 原业务 Owner → React Owner →
Adapter → Snapshot/Subscription/Dispose → 离线预览 → Chrome → 证据。
此表只申报已读取代码或已写入适配器；未核查不能推断 PASS。

| 功能 | 正式 DOM | 业务 Owner / React Owner | Snapshot/Subscribe/Dispose | Preview | Chrome / 状态 |
|---|---|---|---|---|---|
| 我的：任务列表、选中、展开收起 | task-installed-list/cards、task-selected-workspace | TaskWorkbench / MyTaskRows | 原 TaskWorkbench 单一选择；React expandedTaskId 纯 UI；dispose 原接口 | P 点击、切换、收起；不清理参数 | CDP 回归，Native N |
| 我的：搜索、筛选 | task-search-toggle/panel、local-filter-* | TaskWorkbench / 预览 PreviewMyFlows | 正式监听原 Owner；预览独立内存搜索 | P 查询与筛选 | Native N |
| 我的：添加任务/任务目录 | task-open-catalog、workbench-discover、task-install | TaskWorkbench.navigate(catalog) / 预览 Portal | 正式包固定身份、网站范围与授权仍独占 | P 同源目录，不执行安装 | Native N |
| 我的：参数、网站、Run、Stop、结果历史 | task-params-form、task-current-site、task-dock、task-history | TaskWorkbench/RunHost，React 不夺取执行权 | 保留参数编辑/草稿与原 RunId/ResultId；Stop 始终由 RunHost 控制 | P 只读状态或禁执行 | Native N |
| 我的：任务停启、卸载 | task-toggle、task-uninstall、task-refresh | TaskWorkbench | 原存储、授权与清理/刷新机制 | P 原 DOM 可见，不代表真实变更 | Native N |
| 我的：定时计划入口与列表 | schedule-open、scheduled-panel、schedule-plan-list | ScheduledTaskWorkbench / PreviewMyFlows | 正式调度器与原列表仍唯一；预览仅内存 | P 列表、详情、进入表单 | Native N |
| 计划：一次/每天/每周/间隔规则、时区 | schedule-form/kind/timezone、schedule-save-confirm | ScheduledTaskWorkbench / 原 DOM 复用 | 正式 NextFire/任务代际没有副本 | P 表单切换、确认步骤；不算实际下次运行 | Native N |
| 计划：暂停、恢复、编辑、删除、管理、Stop | schedule-detail-view、schedule-task-manager、schedule-stop | ScheduledTaskWorkbench/RunHost / PreviewMyFlows | 真实触发历史与未知结果保留原 owner | P 内存暂停恢复、删除审阅；Stop 不执行 | Native N |
| 扩展：搜索/类型/范围/行详情/设置 | extension-center-list/detail/toolbar | ExtensionCenter / ExtensionToolbar/Rows/Detail | 官方目录 + 安装记录订阅由原 Owner 管理，生命周期单源 | P 内存条目与详情动作 | Native N |
| 扩展：本地 JSON 文件与基础审阅 | sidebar-tool-import/file/preview、extension-center-import-host | SidebarTools Loader、Installer / 预览复用正式 DOM | 生产 Host 校验、能力审核不在预览复制 | P 基础 JSON 字段、能力、版本与 1MiB 读入限制；明确未正式校验 | Native N |
| 扩展：同 ID 安装/更新/状态读回 | sidebar-tool-install/update、extension-center-status | SidebarTools Loader + Authority / 预览内存记录 | 正式只有 Installer 能持久安装，必须回读 | P 同 key 替换、不重复；只改内存 | Native N |
| 扩展：启停、卸载、撤权、清理恢复 | sidebar-tool-action-review、extension-center-detail | ExtensionCenter/Installed Page Authority/SidebarTools | 正式权限/清理读回逻辑保持原有 | P 审阅、内存操作；不能声称撤权成功 | Native N |
| 扩展：iframe Sandbox 与 Page Program | sidebar-tool-frame、installed-page-tools-list | 原 Sandbox + Page Authority | 第三方工具隔离，React 不直接安装/授权 | P 无任何真实扩展执行 | Native N |
| 工作流：新对话/新工作流/历史/设置 | workflow-head-actions、workflow-manage-panel | workflow-view / WorkflowHeader/Transcript/SettingsSheet | RunId/Revision 归原 Owner | P 已批准简洁对话；剩余动作未全面覆盖 | Native N |
| 工作流：规划、权限、Run/Stop、结果 | workflow-ai-proposal/approval、workflow-result-panel | Workflow RunHost | 真实执行及未知结果没有第二套调度 | P 可视面板，部分流程缺演示事件 | Native N |
| 开发：JS/React/Vue/Controller/Page | page-component-framework、script-source、script-editor | script-editor / DeveloperFramework/Actions | 源码编辑器/IME/版本/编译唯一 Owner | P 类型切换，部分操作禁用 | Native N |
| 开发：编译、预览、安装、版本 | develop-panels | script-editor + 当前编译/安装 Owner | 不引入第二份运行时或依赖库 | P 正式 DOM 保留，交互待补 | Native N |
| 云控：八项只读状态 | cloud-my-state、cloud-overview-* | cloud-hosting / CloudOverviewText | 正式状态由原订阅投影，React 不 Claim | P 八字段内存 Fixture | Native N |
| 云控：配对、授权、停止与恢复 | cloud-pair/unpair、cloud requests | cloud-hosting + Provider Authority | Stop 与 Provider 撤权区分、不可自动重跑 | P 只读/原 DOM，关键动作未覆盖 | Native N |
| Debug：只读脱敏、刷新、复制 | debug-* | debug-workbench / DebugDiagnosticText | Dispose 后晚到回调安全需原生复验 | P 无敏感数据，禁止执行 | Native N |

## 失败追溯（不删除门禁）

CI 39026495797 的 Node 契约 FAIL：新增 Task Manager padding-inline 直接覆盖共享 disclosure 外观。
真实原因由 tests/environment/sidebar-component-contract.test.mjs 揭示。
处理方式：改为 task-management-heading 和 task-management-actions 业务内容缩进，原组件外观不变。
CI 39026947890 的 Node 契约 FAIL：收起任务后 hidden workspace 变成列表额外兄弟节点。
真实原因由 tests/environment/task-workbench.test.mjs 揭示。
处理方式：fallback 即使收起仍把相同 workspace 留在选中卡片里，仅 hidden 切换。
原 Chromium React/CDP fixture、生产与开发构建、Verify 和 Size 于该轮分别报告 PASS，
但整个 workflow 因 Node 契约 FAIL，不得称该提交发布 PASS。

## 验收命令及工件

CI: .github/workflows/sidebar-six-react-preview-r3336.yml
- 官方 HTML：prototypes/sidebar/react-preview/index.html，由 scripts/preview/build-sidebar-six-react-preview.mjs 生成。
- 来源：tool.html + 五份正式 CSS + 正式 React TSX + 离线 adapter；输出含输入 SHA-256。
- 生成：node scripts/preview/build-sidebar-six-react-preview.mjs
- 漂移：node scripts/preview/build-sidebar-six-react-preview.mjs --check
- 原 React fixture：node scripts/tests/react-sidebar-r3331-browser.mjs
- 本轮真实 Chromium 离线交互：node scripts/tests/sidebar-six-react-preview-interaction.mjs
- Node：node --test tests/environment/task-workbench.test.mjs tests/environment/react-my-cloud-r3338.test.mjs tests/environment/sidebar-component-contract.test.mjs
- Package：npm run check；npm run build；npm run build:dev；npm run verify；npm run build:size
- 图像：六 Tab 截图 + my-expanded-360、my-collapsed-360、my-plan-confirmed-360、
  extension-import-review-360、extension-uninstall-review-360；所有新交互截图必须有前后 DOM 断言。
- CI 页面以对应提交 SHA 的 GitHub Actions Workflow 为准，不以成功上传图片替代交互门禁。

Mac 本地 Native 测试尚未在此环境执行：
INSTALLED_EXTENSION_NATIVE_CHROME=NOT_TESTED
标准网页测试目标：http://127.0.0.1:43111/demo-form.html
必须在 Mac 已安装 Chrome 实测安装/更新/卸载/网站权限撤回、
Controller Run/Stop、定时计划真实执行和断线恢复、Provider 撤权与未知状态；
无真实测试不得将 Source UI Preview 标为产品能力 PASS。

## 反方审计与质量结论

- 是否另建 Host/Installer/任务 DB？否。新模块只有 React 局部状态与 HTML 预览逻辑。
- 是否让未审核文件运行？否。导入仅解析 JSON 基础字段，未启动工具。
- 是否让模拟安装误导用户？操作前、卡片、详情与反馈均注明 UI_PREVIEW_ONLY，无 Native claim。
- 是否满足全部六页功能对齐？否。工作流、开发、云控仍需按原控制器补齐与真实测试。
- 是否会破坏现有身份/权限/草稿？保持原 Owner，并新增回归；最终风险仍依赖 Native。
- 是否已经五维专家 ≥95？尚无充分证据，不予认证：
  功能覆盖：PARTIAL；React 架构：局部验证；
  UI/UX：待 360/420/520 + 200% 交互审计；
  权限/隔离：Native NOT_TESTED；
  可靠性：最新提交全绿 CI 待复核。

终态门禁：完整矩阵逐操作确认、同源 HTML 检查通过、Linux Chromium 真实交互通过、
最新 main 指向已通过源码的提交、Mac 原生安装与权限 PASS，
然后才能给出独立五维 95+ 专家评价。


## R33.3.10 · CI 交互阻塞与预览状态修正（新 CI 待复核）

- 基线：远端 main `30327518938acf930a6cbe43da8138de88416468`；严格只改 source-bound Preview adapter、定向 Chromium 回放、本文工作记录。Installer、RunHost、Page Authority、Sandbox 和真实权限合同不变。
- 历史失败：[39028578195](https://github.com/shopable-ai/opendesk-browser/actions/runs/39028578195)。卸载审阅确认后错误断言详情应继续显示；预览设计确实清除选中项并返回可安装列表。
- Chromium 回放现在断言：详情关闭、列表显示、可安装范围选中、同一固定身份不重复、卸载后操作文案为“查看详情”、模拟标记保留。新增同 ID 的 1.2.0 → 1.3.0 文件导入和版本核对。
- 产品预览修复：内存安装/卸载同步主要操作文案，修复“卸载后仍显示打开”；重新打开导入时清空旧 file input 以允许同名文件重选；卸载后把焦点移到扩展搜索。
- 这些是预览行为和回归检查，不是生产扩展安装实现的替代品。最新提交的 Actions 执行结果未知前标为 `PENDING`；Mac Chrome 原生安装、Host、真实网站权限与任务执行为 `NOT_TESTED`。
- `prototypes/sidebar/react-preview/index.html` 是本地/CI 生成产物，当前不在 Git 跟踪中；以同 SHA 的 CI 附件交付完整 HTML 和截图，禁止将旧附件冒充本轮新版。

### R33.3.10 CI 实际结果、后续计划交互（2026-10-17）

- Preview Chromium 真实指针/文件选择回放：**PASS**，参见 [Actions 39029498691](https://github.com/shopable-ai/opendesk-browser/actions/runs/39029498691) 的 `six-tab-preview` Job，对应 `b4b07b7a`。该证据包含：扩展同 ID 升级、卸载审阅与关闭详情、返回列表及 UI_PREVIEW_ONLY；**不**证明主分支全部构建 PASS。
- 同一 CI 的 `package-gates`：**FAIL**。Build production/build:dev 根因是并行 Cookie Editor 静态可信 UI 试点 `examples/sidebar-tools/cookie-editor/ui/CookieEditorView.jsx` 被导入 privileged bundle，触发 `scripts/bundle-provenance.mjs` 的历史/第三方源码边界检查。严禁禁用 provenance 或直接信任示例代码。由 Cookie 试点源码 owner 调整可信源码归属/架构和配套校验；本轮没有跨 owner 改写。Verify/Size 因上游构建失败而 BLOCKED。
- 计划预览实现：`9e81ee0d` 复用原 DOM 增加表单原值指纹草稿保护、计划字段编辑回填、预览时区选择与搜索、任务管理筛选、JSON 对象参数/周规则/间隔规则验证和暂停初始值。跳转：`8446fbac` 将“新建脚本”导向真实存在的开发 Tab，而不是无反馈返回任务列表。
- **新变更尚待证据**：计划表单增强由 [Actions 39029780977](https://github.com/shopable-ai/opendesk-browser/actions/runs/39029780977) 回放，未完成时保持 `CHROMIUM_PENDING`；导入/卸载通过的旧截图、HTML 不得冒充该提交的成果。
- 交互 HTML 是生成器真实产物，CI artifact 名称 `sidebar-six-react-preview`（含 `prototypes/sidebar/react-preview/index.html`）。交付时应以对应源码 SHA 的 artifact 为准；不能将 `UI_PREVIEW_ONLY` 的内存更新标成 Host/Installer 持久操作。
- 正式五 Tab 的 Native 逐入口完整覆盖、Chrome 已安装开发包、权限、Provider/RunHost、360px/200% 及长中文逐项可用性尚未取得足够证据，继续 `INSTALLED_EXTENSION_NATIVE_CHROME=NOT_TESTED`，95+ 五维评分不得认证。

- 后续 [Actions 39029780977](https://github.com/shopable-ai/opendesk-browser/actions/runs/39029780977) 的 `six-tab-preview` 进入前置 `React/DOM contracts` 后 **FAIL**（11 tests / 10 PASS / 1 FAIL），尚未执行新 Chromium 交互回放。直接原因：并行 Bookmark Trusted React 试点在 `src/ui/react/main.tsx` 中引入 `../../../examples/sidebar-tools/bookmark-manager/...`，违反 `tests/environment/react-sidebar-r333.test.mjs` 的 privileged React UI 禁止导入 examples/sidebar-tools 合同。该门禁与 Cookie 的 `bundle-provenance` 失败原则一致。**不能因为此失败断言计划 UI 已错，也不能为了测试 PASS 放宽安全边界**；须由 Bookmark/Trusted owner 修正经过审核的静态 UI 源码归属。新的 HTML artifact 仅保留生成文件，没有 360px Chromium 截图和通过的交互证据；继续使用经 `b4b07b7a` PASS 的旧 HTML 时必须标出对应 SHA。

## R33.3.11 · 添加任务 / 扩展使用页 / 定时计划导航修复（2026-10-17）

### 已落地源码与 Owner 边界

- 正式「我的」点击添加不再直接把完整 Task Catalog 推入用户视野：`tool.html` 使用顶部紧凑 `task-add-menu`，优先本地 JSON / JS 文件；可显式选择「浏览任务目录 ↗」打开原独立完整目录，或前往「开发」创建脚本。
- `task-workbench.js` 的新入口**复用原 `readFile(fileOverride)` → `importTaskPackage` / 导入未保存草稿 → 原 Host 验证 → 原 Installer 审阅**，没有新建安装器、隐式授权或后台执行。文件失败提示保留在添加区，关闭可返回原任务列表。
- 正式 `ExtensionCenter.openRow` 本来已按照 `resolveExtensionRowIntent` 调用 `sidebarTools.openTool`；本轮保留此真实路径。离线 `sidebar-six-preview.tsx` 则纠正已安装条目误入安装前详情：复用正式 `#sidebar-tool-display` 及返回 / 设置 / 卸载 Header，`#sidebar-tool-frame` 中只有 **UI_PREVIEW_ONLY 隔离 Fixture**，不加载或执行扩展。未安装候选仍进入安装审阅；内存更新不冒充 Host 回执。
- 正式 `schedule-open-runner` 和 `schedule-create` 移至唯一 Header 右侧、34px SVG IconButton，并保留 title / aria-label；不再给运行页按钮设置 textContent 覆盖 SVG。宿主状态仍位于列表正文，原 `ScheduledTaskWorkbench` 的调度、时区、身份固定、历史、草稿保护和回退逻辑保持不变。
- 离线 Schedule 创建/编辑标题区分、运行入口仅在列表页出现，任务管理使用 Header 单一返回入口；扩展菜单更改显示范围后自动关闭，避免覆盖条目并截获点击。

### 本轮仓库提交

- `0a9f564`：正式任务添加与计划 Header（`tool.html`、`task-workbench.js`、`scheduled-task-workbench.js`、`tool-shell.css`）。
- `d476079`：任务添加/计划预览。
- `e307bc2`：扩展使用页复用正式 Header 与隔离 Fixture。
- `7f637db` / `a1341a1`：同步 Node / Chromium 路由断言。
- `5ef4a23`：扩展可安装筛选菜单遮挡修复，安装审阅后返回已安装列表。
- `9352213`：计划任务管理移除重复返回操作。

### 实际验证与尚存阻塞（反方审计）

- `a1341a1` 的 [Actions 39036100075](https://github.com/shopable-ai/opendesk-browser/actions/runs/39036100075)：`six-tab-preview` 中正式 DOM+CSS+React **生成步骤 PASS**，上传 `sidebar-six-react-preview` 单文件 HTML（输入 SHA-256 见页面元数据）；但随后 `react-sidebar-r333.test.mjs` **FAIL**，原因为并行 Bookmark Manager Trusted UI 从 `examples/sidebar-tools` 导入 privileged React 源码。Chromium CI 截图/交互步骤均 **BLOCKED**；`package-gates` 未完成全套验收、运行器被关闭。不要放宽源码来源、安全/Bundle Provenance 合同或假报 CI 绿色。
- 已从上述 CI artifact 提取确实由生成器构建的 HTML，并在**独立 Linux Chromium + Playwright** 以 DOM 加载模式执行真实点击：六 Tab 初始化、任务添加展开、定时计划列表/创建、已安装扩展用页/设置/返回 **PASS（离线 UI）**，JS pageerror / console.error 为空。发现「可安装」筛选菜单仍覆盖条目，已经在 `5ef4a23` 定向修复，需后续同 SHA 预览复测。
- 没有执行 Mac Native Chrome 已安装扩展、Host 权限、真实文件安装、真实定时执行和恢复；一律 **NOT_TESTED**。仅静态与离线成功不能支持功能完整性、安全或可靠性 ≥95 的交付评分。
- 六 Tab 全功能闭环仍未完成：开发编译/安装 UI、工作流执行/历史、云控配对授权、调试刷新脱敏等须按本表原 Owner 继续逐项实际核对；不能为 Preview 重新实现 Host/Installer。
- 独立专家质量：功能完整性 **待评分**、React/业务边界 **局部验证**、响应式 UX **局部验证**、权限隔离 **Native NOT_TESTED**、回归可靠性 **CI BLOCKED**。在全部真实证据和复核截图完成之前，**不认证五维 95+**。

### 下一步最小闭环

1. Bookmark Manager/Trusted Runtime owner 在其负责源码中修复 React 特权来源问题；Cookie Editor Trusted provenance 若仍 FAIL 须由对应 owner 解决，不删除测试。
2. 最新 main 重跑 `node scripts/preview/build-sidebar-six-react-preview.mjs --check`、受影响 `task-workbench.test.mjs`、六 Tab Chromium 点击回放与 360/420/520/200% 溢出检查，保留 artifact 对应 SHA。
3. Mac 已安装 Chrome 实测任务包导入、固定身份审核、已安装工具使用、定时计划保存/执行/停止/未知结果；再补工作流、开发、云控和调试业务缺口。

### R33.3.11 独立 Chromium 复核（生成器原件，非 Native）

- 安全补丁 `a1b2618`：切换到开发 Tab 或任务文件导入成功进入开发页后，焦点恢复至可见的开发 Tab；添加面板关闭时只有仍在「我的」才聚焦原「添加」按钮。
- 使用 [Actions 39036612758](https://github.com/shopable-ai/opendesk-browser/actions/runs/39036612758) 的 `9352213` 六 Tab 生成 HTML 原件（`od-source-input-sha256=27520aa3fb7df208c7de23b131ea15a89bc371dda1d4b6541fa90ff327805a87`），在隔离 Linux Chromium 的 Playwright `set_content` 模式进行点击、布局和表单检查。该方式是真实 JS 渲染/浏览器指针事件，**不是** Chrome Extension 安装、Host 或 Native 验收。
- 复核矩阵：360 / 420 / 520px 各包含任务列表及添加、定时列表/表单/任务管理/每周/间隔、扩展列表/已安装使用/设置/返回/未安装详情、工作流/开发/云控/调试视图；另在 360px 做 200% 缩放计划编辑。**63 项断言 PASS，0 项 FAIL**；主内容区与预览舞台 3 个宽度及 200% 均未发现水平溢出；捕获 JS pageerror / console.error 均为空。该记录针对 `9352213`，不扩大解释为后续全仓库 CI 全绿。
- 所有操作不写入实际 Chrome 用户数据；测试中的计划/安装/草稿仅内存 Fixture。UI 测试成功也不足以给出五维 95+ 或 Mac Native PASS。
- 外部工作流仍存在 Trusted Bookmark React 来源约束及 Cookie provenance（待仓库最新 OWNER / CI 复核），不因为离线 Chromium PASS 而放行正式发布。

## R33.3.12 · 时区、导入格式及本地项目模式 UX 修正（2026-10-17）

**用户发现的三个真实场景**：定时计划以“更改→搜索→选择→完成”暴露 IANA 实现细节；我的导入 JSON / JS 与扩展工具包格式混淆；离线六 Tab「开发→本地项目」开关未绑定事件、无可见反馈。

### 源码对齐与实际修复

- **时区（正式 + 预览）**：`tool.html` 改为直接显示唯一原生 `#schedule-timezone` select，不再显示更改、搜索、完成面板；`ScheduledTaskWorkbench.populateTimeZoneSelect` 保持 `getScheduleDeviceTimeZone` 默认、常用城市及完整 IANA 分组、编辑时旧时区固定和 `saveSchedule` 实际权限/保存契约。选项显示可读城市与**当前** UTC 偏移；DST 仍由 `platform/tasks/schedule-time.js` 计算，偏移不是存储键。无自动重绑定、无第二调度器。
- **我的导入**：严格区分 `opendesk.task-package.v1`（任务包 JSON）/`opendesk.program-draft.v1|v2`（源码草稿 JSON）/`.js`（源码草稿）与扩展 `opendesk.sidebar-tool.v1|v2`（`.opendesk-tool.json`）。导错文件给清晰入口提示，不能自动安装、授权或运行；原任务候选验证与 Host 仍是唯一权威。
- **本地项目**：正式 `createLocalProjectView` 已存在、复用原 Native/Provider/RunHost 与单一安装权威；它**不是**浏览器直接任意选择目录功能。可运行项目须通过 `opendesk browser dev .` / `opendesk-dev .` 或单文件 `opendesk browser project add` 明确授权，再由 `projects.list/project.resolve` 回读与校验。正式模式切换现在同步「本地项目」标题。离线 Preview 复用 `#local-project-mode/#local-project-tools/#local-project-select`，可切换样例、查看状态、刷新及首次接入说明，但**未连接真实 Native**；所有有副作用操作均为 `UI_PREVIEW_ONLY` 或禁用。
- **滚动与焦点**：预览仅切换路由时重置主滚动，项目模式/时区/设置变更不应使页面跳顶；计划列表、表单、任务管理各保留合理滚动与聚焦。共享 DOM、React Root、Design Tokens 与 Authoritative Owners 不变。

### 对应提交与验证范围

- 正式时区：`93b5fc7`；React 预览：`48f1ee4`；本地项目控件：`f00ea61`，正式标题与任务文件类型提示：`d45e12d`；导入 Preview：`9a362f2`；相关 Node/Native/Chromium 合同测试：`0d34c94` / `a7b5c24` / `1a60dc2` / `efd807c` / `75659d3`；滚动/焦点：`6d18b35` / `c124703`。
- 本任务直接影响 `src/ui/tool.html`、`scheduled-task-workbench.js`、`task-workbench.js`、`local-project.js`、`tool-shell.css`、两个正式 DOM 的离线 React 适配及受影响测试。没有修改原 Installer、Provider/RunHost、安全域与 Package Provenance。
- **当前门禁：CI 待执行；未取得与最终源码一致的完整构建/Chromium 证据时保持 `NOT_TESTED`**。Mac 已安装 Chrome 的单次计划、夏令时、任务包验证与本地 Native 项目授权/回读没有本轮实测，也不能继承旧截图宣称 PASS。安全来源阻塞不得通过删除合同测试来绕过。

### 后续产品改善（不在本次混入重构）

- 正式 Side Panel 的本地项目首次授权仍偏开发者命令式，未来可在既有 Native 身份/权限框架上研究**明确用户手势的选择文件/目录 GUI**；不能用未经确认的 Web File Picker 授予 Host 本机目录权限。
- 添加任务后优先展示“已导入待验证/下一步审阅”回执，避免把编写源码与安装已审核任务混为同一种操作；可基于目前单一 Task Catalog 打磨，勿新增任务 Installer。
- 对正式计划做真实 Native 360px/200% 与键盘/焦点回归，检查时区修改不抹掉保存草稿；完成后才能评价阶段性 UX 95+。

### R33.3.12 离线 Chromium 实际复核（来源 SHA 绑定）

- 对应 [Actions 39039265448](https://github.com/shopable-ai/opendesk-browser/actions/runs/39039265448)，GitHub 正式生成器的 **Build from installed DOM, CSS and real React components = PASS**，取得 `d61f46eadb45529b7c89633f78eaccafeb1e8df2` 对应 `sidebar-six-react-preview` 完整 HTML（含真实 tool.html/CSS/React TSX + 预览 adapter 的输入 SHA-256 元信息）。CI 的 **React/DOM 合同仍失败**，后续 CI Chromium 步骤未执行，不能伪造 CI GREEN。
- 在独立 Linux Chromium + Playwright `set_content` 上运行 360 / 420 / 520px 多状态、真 click/select/file-input：**34 项 PASS / 0 FAIL / 0 JS errors**。涉及直接时区选择，IANA Tokyo/New York，可见区域无横向滚动，「开发」本地项目切换/选择/刷新/返回，以及任务导入时拒绝扩展工具 JSON。这是 **OFFLINE_UI_PREVIEW** 层级，不是原生安装、Host 或任务执行验证。
- 本轮针对 screenshot 发现「本地项目」标题与同名开关重复：正式 `local-project.js` + 离线 `sidebar-six-preview.tsx` 更新为左「项目连接」、右「本地项目」，提交 `7a4a2a7` / `d61f46e`；上述 34 项复核使用修正后的 d61f46e 生成 HTML。保留原 Host 授权/固定源码校验，无新用户目录授权路径。
- 未运行 Mac Native Chrome、Provider、真实定时任务。包括 Native 真实授权、原计划固定时区与 DST 切换、任务安装/回读在内均 **NOT_TESTED**，不得通过预览状态或离线评分间接标记 PASS。


## R33.3.13 · 云控 Header 与正文状态分层（2026-10-17）

- **基线与写入范围**：远端 main `44b3c3ee88da11ca78508fae043674d2e939e3cf`；目标文件仅 `src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/react/preview/sidebar-six-preview.tsx`、本记录和 `tests/environment/cloud-layout-r33313.test.mjs`。独立 GitHub Connector 写入，未读到 Mac 本机工作区/暂存/并行 Agent 状态，不假报本地干净或 Native 验收。
- **正式 UI**：Header 只保留「云控」及原 `cloud-open-console` / `cloud-overview-refresh` SVG IconButton；`cloud-my-state` 原动态详情进入既有 `cloud-diagnostics` 折叠区，不再造成标题拥挤，也不重复向读屏器直播。保持 `cloud-overview-state` 为正文 live 主状态，连接/授权任务数为精简指标，Provider/Host/Slot/Requests 低频折叠；诊断采用自适应列宽（在 320/360/420px 实际内容容器自动单列，520px 可双列），原 270px 以下主要指标单列规则保留。客户端密钥/Side Panel 停止承诺仍可在低频设置中查阅。
- **业务保真**：CloudHosting 仍唯一拥有 Provider 配对、连接、云请求、逐任务许可、外部凭据与撤销；未改 `cloud-hosting.js`、原 RunHost、Authority、React 单根或设计 Token。旧 ID 不改，长中文和错误文本按原 CSS 正常换行。
- **交互预览**：沿用 `build-sidebar-six-react-preview.mjs` 从正式 DOM/CSS 和 React TSX 生成页面。适配器只投影六种本地场景、为 Header 图标提供可见的预览反馈，使用原 DOM 展示禁用的任务审阅、非真实请求详情和原有应用/设置折叠。所有预览示例显式 `UI_PREVIEW_ONLY`，禁用配对/批准/停止/撤权/Run 跳转，不创建第二执行器或假冒真实请求。
- **验证等级**：GitHub 源码/树 blob 校核与可在当前环境执行的静态不变量独立记录；如未获得同 SHA 的正式生成器 `--check`、Node 套件、production Build、真实 Chromium 点击截图/CI、Mac Native Chrome 等回执，统一标 `NOT_TESTED`，**不能打正式五维 95+**。远端 main 不追踪 `prototypes/sidebar/react-preview/index.html` 生成 HTML；不能以手写 HTML 代替正式同源构建产物。
- **跟进**：Mac main 工作区核对真实并行改动后运行定向 Node、生成 HTML / --check、360/420/520px 与 200% Chromium 截图及 Provider/授权失败回归，保留 CI commit/hash 与真实运行证据。对其他试点来源门禁按 owner 协调，不跨界修改。

### R33.3.13 同 SHA CI 与 Chromium 追踪

- 初次功能提交 `0051e7a15a9272ae63e84dd8eda03148ca1212fd` 的 [six-tab-preview Actions 39041550969](https://github.com/shopable-ai/opendesk-browser/actions/runs/39041550969)：**正式 DOM/CSS/React 生成步骤 PASS**，发布单文件 `sidebar-six-react-preview` artifact，HTML 中 `od-source-input-sha256=9d80d05829bffdcb0390ae4b508ead35a5b0c9e33673e105d6a11246eeb8dee7`；`Guard source drift and React/DOM contracts` **10 PASS / 1 FAIL**，失败为既有 `react-sidebar-r333.test.mjs` 对 `src/ui/react/main.tsx` 的 `examples/sidebar-tools` 特权 React 导入来源门禁，非本轮 Cloud Header/状态测试，CI Chromium 与 production Build 未执行。应由并行 Bookmark/React owner 修复，不放宽断言。
- 对上述 Actions 真实生成 HTML，在独立 Linux Chromium + Playwright `set_content` 中渲染 React，切云控、切场景，360 / 420 / 520px Header 单行（34px 高，34px 图标）、主内容宽度等于滚动宽度、0 JS pageerror，控制台/刷新预览反馈、连接设置展开、请求详情开关 PASS。辅助产物级 Node 合同 4/4 PASS，但这**不是**仓库 `node --test tests/environment/cloud-layout-r33313.test.mjs` 的运行记录。
- 复核发现原 `@media(max-width:380px)` 只响应外层浏览器窗口，离线预览把 Stage 缩小到 320/360px 时不触发，折叠诊断展开仍双列；本次后续改为 `repeat(auto-fit,minmax(min(100%,200px),1fr))`，经浏览器样式注入实测 320/360/420 单列、520 双列。该变动须通过**更新后的**正式生成器及同 SHA Chromium 再验；对初次提交的截图不得声称覆盖后续 CSS。
- 200% 仅做过 CSS Zoom 测试，不是已安装 Chrome 的真实浏览器缩放；Mac Native Chrome / Provider/Host 安全回归 / CI 全绿依然 `NOT_TESTED` 或 `FAIL`，五维 95+ 不予认证。

## R33.3.14 · 2026-10-17 · 主页面 Header 第一阶段

范围：正式「我的」页面隐藏低使用频率的搜索/筛选入口，将安装计数保留为屏幕阅读器专用状态，不删除 TaskWorkbench 的筛选能力、DOM ID 或安装任务权限判断。隐藏入口不应接收 Tab 焦点；表单收起后的焦点回到可见的「添加任务」。React 同源预览的计数不再把 UI_PREVIEW_ONLY 混进标题，Chrome 回放改为断言搜索确实隐藏。

工作流设计基准：`prototypes/sidebar/workflow.html`（较新的简短入口，含 R23.10 历史/新对话设计）。旧 `prototypes/sidebar/workflow/index.html` 仅保留历史参考，不以旧版覆盖新入口。正式 Workflow Owner 不改，真实 Provider/Authority/RunHost 不随设计原型迁移。

剩余范围（NOT_TESTED / NOT_IMPLEMENTED）：定时计划共享展示投影、Hover/触屏操作、多状态同源 React 预览、正式工作流 UI 差异修复、360/420/520px 截图、Mac Native。当前第一阶段仅为源码/回归脚本改动，不能申报 R33.3.14 总体 95+ 验收。生成器/Node/Build/Chromium/CI 均须以实际运行回执定级。


## R33.3.15 · 2026-10-17 · 计划旧断言修复与同源工作流预览接线

**真实写入范围 / 并行边界**：本轮仅通过有 SHA 校验的 GitHub Contents API 向最新 `main` 写入独立文件；未进入用户 Mac 工作区，也不能保证 Mac 本地未提交 diff。正式 `WorkflowView`、`React main.tsx`、Bookmark Trusted UI 和 Installer/RunHost 均由同期其他提交管理，本轮不覆盖这些 Owner。所有提交均非新分支、非 PR、非强推。

- **定时计划旧断言**：`79753a1` 以 `formatScheduleRule` 四种规则的实际结果和正式 `presentSchedulePlan(plan,view.records)` 引用代替 `frequencyLabel(plan)` 旧实现位置检查。持续保护人类可读日期/间隔语义，禁止为兼容测试复制第二套展示算法；没有更改 Scheduler。
- **工作流业务核查**：原 `src/ui/workflow/workflow-view.js` 已有 `connectWorkflowEvents` 和 `onHistory/onNewSession/onNewWorkflow/onResumeHistory/onOpenSavedHistory`，历史保存读取仍使用原 `loadSaved` 和来源/源码哈希校验；原 Provider、Permission、RunHost 不在本轮预览代码中模拟执行。工作流产品交互端到端 **仍需实际 Chrome 验证**；相关并行源码如再变更必须重新复核。
- **同源六 Tab 预览**：`71715e0` 在原 `src/ui/react/preview/sidebar-six-preview.tsx` 接入正式 `WorkflowHistory`、`WorkflowSourceName` portals（复用正式 `tool.html` 的现有宿主节点），离线内存模拟历史/新对话/未保存草稿审阅；示例历史点击只说明真实来源验证要求，发送只说明缺少 Provider/Authority/RunHost，不假报真实副作用。原 Scheduler 状态卡仍消费 `presentSchedulePlan`。
- **正式 AI 来源组件对齐**：`c67c4b4` 跟进正式 Provider 中新增的 Codex/HTTPS 按钮及协议切换；预览仅使用内存表单状态，在输入 HTTPS 模型 ID 后只显示该 ID，选 Codex 时只显示 `Codex`；不存储 Key 或批准网页读取。
- **降低技术字符串噪声**：`2aa7020`、`4864baf` 将六 Tab 正文的 `UI_PREVIEW_ONLY` 改为可读的“仅预览”语义，保留源码/生成 HTML 的来源与离线边界标识；`48f1c37` 同步原 Chromium 语义断言。
- **Chromium 可执行回归**：`c3a20ee`、`cd41f7f` 在正式 `scripts/tests/sidebar-six-react-preview-interaction.mjs` 添加历史展开、草稿保护、新工作流确认、无 Host 提示及来源切换/模型名称真实 CDP 指针操作；`3c4ef72` 为六 Tab CI 添加工作流 320/360/420/520px 截图。提交的是测试代码，**不代表测试实际 PASS**。
- **设计入口**：继续采用 `prototypes/sidebar/workflow.html`；旧 `prototypes/sidebar/workflow/index.html` 不再作为当前产品基准。独立设计 Mock 不能替代正式 DOM/React/业务合约。

**实际证据与限制**：GitHub Actions 六 Tab 工作流在 `cd41f7f` 对应 [Actions 39048163536](https://github.com/shopable-ai/opendesk-browser/actions/runs/39048163536) 查询时为 `queued`；没有本轮 Node/Build/Preview 生成、`--check`、截图、Chromium 点击、CI 全绿的完成回执。`prototypes/sidebar/react-preview/index.html` 不追踪在 `main`；若同源生成器在该 SHA 的 CI 成功，附件名为 `sidebar-six-react-preview`，在此之前不能提供“已生成”链接。Linux Chromium 本环境存在但没有可用完整仓库和依赖，**未在本轮运行项目测试**。Mac 已安装 Chrome/真实 Scheduler/Authority/RunHost 为 `NOT_TESTED`；测试失败或并行 Bookmark 来源门禁仍须按各 Owner 独立收敛。

**验收准入**：五维（产品功能、UI/UX、React 架构、安全与权限、测试可靠性）**均未认证 ≥95**；待同一源码 SHA 的 Node、真实 Build、Chromium、CI 证据与 Mac Native 真实行为后逐项评分，不能以提交和静态断言替代。


## R33.3.15-A · 2026-10-18 · GitHub 远端定向修复及证据分级

### 本轮实际修改

- **真实故障（已修复）**：正式 \`src/ui/react/tabs/workflow.tsx\` 的 \`WorkflowHistory\` 中，Codex「恢复历史」按钮在 \`model.busy=true\` 时仍保持可点击和可聚焦，而现有 \`WorkflowView.onResumeSessionClick\` 已拒绝 busy 恢复。先在 GitHub 原件上验证「React busy 禁用」检查 **FAIL**、Controller guard **PASS**，再为该按钮增加 \`disabled={Boolean(model.busy)}\`。不修改 Controller、Provider、授权、RunHost 或任务执行代码。
- **测试保护**：\`tests/environment/workflow-ui-states.test.mjs\` 增加从正式 React 组件提取恢复按钮并验证禁用状态的断言，同时保留 Controller busy 拒绝校验。提交：[\`b9e3331\`](https://github.com/shopable-ai/opendesk-browser/commit/b9e333106764449581a476147a036e06faba9204)、[\`b94a510\`](https://github.com/shopable-ai/opendesk-browser/commit/b94a5109073d6f18e9f94035cd661d0d248d2242)、[\`6792f65\`](https://github.com/shopable-ai/opendesk-browser/commit/6792f6544b9934b3fa3ba9cb4bffe6df3674ba30)。最后一项是修复新增测试中的正则表达式转义，不是产品运行结果。
- **修复后独立源码检查**：从 GitHub \`main\` 重读 React、Controller、测试文件，恢复按钮 \`disabled\` 匹配 **PASS**；测试表达式文本匹配 **PASS**；Controller \`busy\` 拒绝匹配 **PASS**。此级别仅为 **SOURCE_CONTRACT_PASS**，绝非 Node/Chromium/Native PASS。

### 真实门禁、阻塞与限制

- **Bookmark Trusted UI 来源 BLOCKED（并行 Owner）**：\`src/ui/react/main.tsx\` 第 16–17 行依然 \`from '../../../examples/sidebar-tools/bookmark-manager/…'\`，和 \`tests/environment/react-sidebar-r333.test.mjs\` 的受信任代码来源守卫冲突。绝不删除守卫、扩大 examples 信任范围或擅自修改并行 Bookmark 试点 Owner 源码。由该 Owner 将正式可信应用源码、导入路径、Bundle Provenance 与相关测试统一收敛。
- **历史 CI，不能外推**：[\`39048163536\`](https://github.com/shopable-ai/opendesk-browser/actions/runs/39048163536) 的 \`six-tab-preview\` 已成功生成正式 DOM/CSS/React 同源 HTML；\`package-gates\` 中计划投影 3 项独立测试通过。但两个 Job 后来因 Runner shutdown/cancellation 未完成整体 Node、Build、Chromium、上传附件，均不是 PASS。该运行不对应本轮最后提交。
- **本轮 GitHub 远端环境没有访问用户 Mac 工作区**，不能核对 \`git status\`、并行未提交 diff、\`npm run dev\` watcher、安装扩展路径或 Native/Host。当前独立 Linux 容器没有该完整仓库与 \`node_modules\`，不能运行用户列出的仓库 Node、Build、预览生成器或 Chromium 回归；均 **NOT_TESTED**。没有制造假的 HTML、截图或安装证据。
- **同源 HTML**：权威生成器为 \`scripts/preview/build-sidebar-six-react-preview.mjs\`，预期本机产物路径 \`prototypes/sidebar/react-preview/index.html\` 是 Git 忽略的构建结果。当前提交未生成和验证同 SHA HTML/CI Artifact；不得链接不存在的产物。
- **计划十状态、持久 Host 回读、暂停恢复、历史未知状态、工作流版本/sourceHash 恢复、停止/权限拒绝**：只读检查现有源码与测试，**还未取得当前 SHA 的端到端 Node/Installed Chrome/Native 证据**。
- **安全约束**：仅对远端 \`main\` 执行 Contents API 的 blob-SHA 校验写入，未创建分支、Worktree、PR、未强推；不能由此推断 Mac 本地状态。正式 Owner 业务和特权框架未改。

### 最终验收准入

最新可读工作提交：\`6792f6544b9934b3fa3ba9cb4bffe6df3674ba30\`（本记录追加提交会形成更新的 HEAD，以最终仓库为准）。

证据分级：\`SOURCE_CONTRACT_PASS\`（上述修复）｜\`NODE_PASS=NOT_TESTED\`｜\`BUILD_PASS=NOT_TESTED\`｜\`SOURCE_BOUND_PREVIEW_PASS=NOT_TESTED\`（当前 SHA）｜\`CHROMIUM_PASS=NOT_TESTED\`｜\`INSTALLED_CHROME_PASS=NOT_TESTED\`｜\`NATIVE_PASS=NOT_TESTED\`｜\`CI_PASS=NOT_TESTED\`（当前 SHA）。

五维评分认证：产品功能 **不足证据**；UI/UX **不足证据**；React 架构 **来源门禁 BLOCKED**；安全与权限 **Native NOT_TESTED**；测试可靠性 **当前 CI NOT_TESTED**。**不认证任何一项 ≥95**。

下一步：Bookmark/Trusted Owner 先修复来源违规，同时在真实 Mac 上以最新 \`main\` 执行本轮列出的定向 Node → 同源生成器/--check → isolated Build → Chromium 多宽度 → 同 SHA CI → 已安装 Chrome/Host；逐项记录日志、截图、SHA、安装来源及真实任务结果，再进行五维评分。
