---
name: opendesk-extension-ui
description: Create or revise OpenDesk Browser's built-in extension UI: Side Panel tabs and subviews (especially 我的 → 定时计划), options/settings, Marketplace and trusted extension pages. Enforce existing R27/R28/R30 layout and accessible navigation before adding CSS or components.
---

# OpenDesk Browser · 扩展内置页面与 Tab UI 工程

## 触发、边界和第一动作

用户要求**新增/调整浏览器扩展自身的 Tab、某 Tab 中的列表、详情、创建/编辑表单、设置或运行状态页**，以及“布局、标题、边框、间距、折叠状态、返回、焦点不一致”时，**首先**触发本 Skill。典型场景：`我的 → 定时计划`、`工具` 索引/详情、`开发` 可折叠区、`发现`、`工作流`、`云控`、扩展 Settings/Marketplace。

这是 **UI 与信息架构 Skill**，不是 UI 框架或新的组件库。只修改属于用户任务的页面与 CSS；不擅自修改安装/执行/Chrome 权限。涉及后台、SW、Content Script、Worker 或 SDK 边界时调用 [扩展运行环境 Skill](../opendesk-extension-runtime/SKILL.md)；涉及第一方工具业务/可信直挂使用 [可信功能 Skill](../opendesk-trusted-sidebar-feature/SKILL.md)。用户/AI 动态工具 iframe UI 由 [工具开发 Skill](../opendesk-sidebar-tool-dev/SKILL.md) 处理，不复用宿主特权 DOM/CSS。

**先核对当前主分支与本地未提交/并行差异，再改文件；不强推、不全仓重排 CSS。**

## 唯一现行规范（禁止复制成第二套设计系统）

按顺序读：

1. `AGENTS.md`、`docs/framework/testing-guide.md`、既有变更/原始验收证据；
2. [R27 跨界面布局与样式](../../../docs/architecture/ui-layout-conventions-r27.zh-CN.md)：全局原则、按容器的尺寸/密度、Tailwind 隔离、验证矩阵；
3. [R28 Tab 多功能区与子视图](../../../docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md)：Tab/Index/Section/Subview/Surface、列表/详情/表单切换、状态；
4. [R30 Side Panel 页面顶部与纵向节奏](../../../docs/architecture/sidebar-design-system-r20.zh-CN.md)：工具 Tab 的标题/操作布局作为参照，**不是**复制历史 CSS；
5. 当前源码：`src/ui/tool.html`、`src/ui/tool-shell.js`、`src/ui/tool-shell.css`、`src/ui/design-system.css`、**唯一 token** `src/ui/design-tokens.css`；若是计划，则查看 `src/ui/scheduled-task-workbench.js` 与 `tests/environment/scheduled-task-ui-r1.test.mjs`。

**入口先分类**：可信 Side Panel 使用上述 `od-*`；扩展 Settings 使用自身 CSS + 合适的 tokens；Marketplace 属于独立响应式页面；Native Workspace 使用固定离线 Tailwind v4，且 `:root` 16px 保证 rem 基准；sandbox/网页注入 UI 不引入宿主 CSS、全局 reset、Preflight 或特权代码。

## 开始实现之前必须画出“可见导航”和页面状态

在改代码前先写下以下五项（简短文字或状态图即可），没有就不要直接堆 HTML：

1. **入口**：属于原有哪个一级 Tab？OpenDesk 当前正式页签为“我的 / 发现 / 工作流 / 开发 / 工具 / 云控”，开发版另有调试。除非用户明确要求改变产品导航并完整验收，否则**不新建一级 Tab，不隐藏/合并原 Tab**。
2. **用户对象**：索引页的主对象是什么（任务、计划、工具、订阅等）；卡片只展示名称、状态、最重要数值与 1–2 个高频动作。
3. **子视图**：`Index → Detail → Edit/Create / Management → Back` 是逻辑结构，不代表一次把所有内容同时显示。详情、表单、管理、历史各归其合法视图；轻量技术诊断才用 `details` 折叠。不因同一个 Tab 就把列表、详情、编辑全部混在一个无限滚动面板。
4. **状态与返回**：明确 loading/empty/error/paused/running/unknown/draft-dirty 的可见反馈、返回目标、恢复滚动和焦点、用户修改未保存时的内联确认。轮询不能重建正在编辑的 Select、丢失草稿或误触发 Save/Run。
5. **安全动作**：暂停/停止、权限、安装、保存、删除等由原业务/Authority 授权；UI 切换、获取数据、保存源码绝不隐式运行任务或扩大授权。

**最小 UI 状态机**（示意，不要求新建全局路由器）：

```text
现有 Tab（我的）
 ├─ 任务索引 / 我的任务
 └─ 定时计划（二级功能）
     ├─ Index：计划列表 + 新建
     ├─ Detail：单计划状态 / 历史 / 次要操作（需要时）
     ├─ Form：创建或编辑同一计划
     └─ Management：已安装任务选择/管理
独立运行页：使用既有 tool.html 的受信任运行 Host，不新增 SW/RunHost
```

## 所有内置页面统一的视觉硬约束

| 角色 | 必须优先使用 | 常见错误 |
| --- | --- | --- |
| 页首 | `od-page-head` + `od-page-title` + `od-page-actions`；返回左、当前对象动作右 | 同一视图两个同等级主标题，或者把返回放在正文末尾 |
| 区块与列表 | `od-page` / `od-stack` / `od-toolbar`；`od-surface` 承担卡片边框与 padding | 一个页面三层套卡、每行另设边框和 gutter |
| 通用按钮与输入 | `od-button` / `od-icon-button` / `od-field`；危险操作用现有危险态和真实确认 | 不同 Tab 私自设置按钮配色/粗细、摘要中嵌独立按钮 |
| 折叠信息 | `od-disclosure`、`--flat`、`--info`；summary 字号、行高、图标、padding 由公共 CSS 控制 | 用页面局部选择器重复定义所有 `summary`，关闭后高度不一致 |
| 状态与验证 | 语义文案 + `role=status/alert`、label/error 的 `aria-describedby` | 只靠颜色、11px 灰字说明权限/失败、隐藏区仍占空白 |
| 版心与间距 | 单一 `--od-page-gutter`；`--space-1/2/3/4` 分别 4/8/12/16px；34px 图标、36px 常规控件 | 重复容器 padding、魔法 7/9/11px、无依据 `!important` |
| 响应式 | `min-width:0` / `minmax(0,1fr)`；按钮换行、文本可换行、局部滚动 | 小屏强压 20px 图标、整页横向滚动、200% 缩放裁切 |

R30 首行的普通标题为 12px/600；同区域 8px、说明紧邻 4px、独立区域 16px。只在确切产品密度差异有说明和回归时采用例外。**公共规范的修改必须服务至少两个真实消费者；新页面不得重新声明 :root、颜色 token 或另一套 Toolbar。** Side Panel 不为了统一界面而全量引入 Tailwind/Quasar；Workspace Tailwind 不能渗入沙箱或普通网页。

## 「我的 → 定时计划」专项防退化示例

当前真实实现已在 `#workbench-tasks` 下包含 `#scheduled-panel`，以及 `#schedule-list-view`、`#schedule-form`、任务管理与独立 runner；`src/ui/scheduled-task-workbench.js` 的 `show(view)` 切换视图。它的计划列表卡片目前还内嵌较重的历史/更多/删除确认。**这不是已经存在完整单计划 Detail 页的证明。**

新一轮计划布局任务应首先判断：若单条计划需要展示历史分页、技术版本、复杂权限或管理动作，优先给它独立 Detail 子视图，只在 Index 留下名称、状态、下次执行、频率和不超过两个主要动作。用当前 `scheduleId` / `generation` / 固定任务版本复用既有 RPC，保留真实返回上下文、草稿保护、历史不重复加载与出错恢复。切勿为了排版重做 `alarms`、RunHost、Task Registry 或把运行页变成新一级 Tab。必须保护既有 DOM ID/测试选择器；新详情 ID 只能在真实实施时定义，不能在 Skill 文档里假定已存在。

计划列表首屏最重要信息是“何时执行、是否启用、有何需要处理”；创建/编辑表单为独立连续流程；高级时区/版本/RunId 不应与主要动作平级。计划已有无 Host、UNKNOWN、settling 等真实状态，不得通过 CSS/文案掩盖失败或伪造可执行性。

## 标准开发与验证流程

1. **审前**：识别实际页面、当前导航、容器所有者、CSS 来源及 UI 生命周期；对照 1–2 个已存在的合理消费者。可只读生成 DOM/状态层级，不先“统一重写”页面。
2. **最小变更**：只改确切组件、类与范围内 CSS；先复用 `od-*`，业务 CSS 只保留真正业务布局。保护真实点击、Run/Stop/权限回调与事件解绑。
3. **源码测试**：对应范围选择现成测试，例如：

   ```sh
   node --test tests/environment/sidebar-component-contract.test.mjs tests/environment/ui-layout-conventions-r27.test.mjs tests/environment/scheduled-task-ui-r1.test.mjs tests/environment/sidebar-tab-memory.test.mjs tests/framework/sidebar-develop-layout-r29.test.mjs
   ```

4. **构建**：涉及可信扩展 UI 时依相关变化执行 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`；不要与其他 Agent 同时覆写共享 dist/Chrome Profile。
5. **视觉与交互**：Side Panel 300/320/360/420/520 CSS px；实际 Chrome 100/125/150/200% zoom，浅色/深色、长中文/URL、零项/1 项/20 项、错误/加载/授权撤销。记录 scrollWidth、可见区域、焦点/ARIA、文本对比、实际用户点击、截图和候选 SHA/包哈希。真实 Side Panel、CDP 标签页和静态预览必须**分级记录，不能替代**。
6. **回归**：保留 Tab 导航、列表/详情/表单返回、保存草稿、Stop 所有权、后台任务身份、卸载/撤权；只修视觉也要验证受影响的交互。

## 独立质量评分，不用漂亮截图补安全缺口

为每个变更分别报告：信息架构、页面排版一致性、可读性、响应式、可访问性、交互/表单保真、跨界面隔离、回归充分性、原生证据（各独立 0–100 或 `NOT_TESTED`）。产品交付要求相关核心维度**逐项达到 95/100**、无阻断失败，并有绑定当前源码/构建身份的真实 Chrome 记录；静态规范/Node PASS 不能代替产品 95+。未达到明确写出差距，不通过美化评分掩盖。
