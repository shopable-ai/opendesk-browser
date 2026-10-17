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
