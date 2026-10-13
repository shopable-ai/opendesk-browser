# GOAL：OpenDesk Browser Scheduled Tasks R2.4 UI Final

## 继承「工具」Tab 多功能区规范，正式重构定时计划 Side Panel + 独立运行页

日期：2026-10-13。默认中文。

仓库：https://github.com/shopable-ai/opendesk-browser
Mac 工作目录：`/Users/shopme/Documents/workspace/opendesk-browser`
唯一允许写入/推送分支：`main`

### 一、执行目标

**直接基于 OpenDesk Browser 真实源码改善「我的 → 定时计划」及独立可见运行页的产品布局、信息层级、交互效率、状态可读性、响应式与无障碍，并提炼可复用于其他 Tab 的多功能区组合规则。**

这不是再造调度器、重建 UI 框架、只产出审计报告/Next GOAL，也不是创建脱离真实插件的第二套 HTML 原型。

**本 GOAL 仅负责 UI/UX，可与 R2.3 可靠性 GOAL 分工，但两个 Agent 禁止同时修改同一文件。** 若 R2.3 正在写 `scheduled-task-workbench.js`、`tool.html`、`tool-shell.css`、相关测试或工作记录，必须先只读检查、提醒用户协调文件占用；在文件释放后重新读取 HEAD 与文件 SHA 才编辑。不得为绕过冲突创建 branch/worktree/PR、强推、reset/clean 或覆盖他人改动。无冲突的规范文档/核查可先做。

### 二、必须先读取和继承现有 UI 规范，不允许重复建一个 Design System

- `AGENTS.md`、`docs/framework/parallel-development.md`、`docs/framework/testing-guide.md`。
- `docs/architecture/ui-layout-conventions-r27.zh-CN.md`：唯一跨界面 Tokens、spacing、gutter、zoom、隔离原则。
- `docs/architecture/sidebar-design-system-r20.zh-CN.md`：Side Panel R20/R26 原语、真实宽度与唯一页面 gutter。
- **`docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md`：本轮必须遵守的 Tab 内多功能区布局标准。**
- 参照真实「工具」Tab：`src/ui/tool.html` 中 `#workbench-tools`、`#sidebar-tool-list-view`、`#sidebar-tool-display`，以及 `src/ui/sidebar-tools.js`、`src/ui/tool-shell.css`。
- 定时任务现有：`src/ui/scheduled-task-workbench.js`、`src/ui/scheduled-task-host.js`、`src/ui/tool-shell.js`、`src/platform/tasks/schedule-*.js`、`src/run-host.js`。
- `docs/framework/workstreams/scheduled-tasks-r2-20261013.md` 与 R2.3 执行记录；现有原生脚本/工作流和测试。

### 三、现有真实界面的问题，不要重新从零猜测

历史已验收 macOS Chrome 截图位于 Actions [38352071965](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352071965) 与完整重启 [38352072059](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352072059) 的 artifact，包括：

- `schedule-list-original-sidepanel.png`
- `schedule-created-original-sidepanel.png`
- `visible-runner-after-native-schedule.png`（已切到管理列表，不能当独立运行概览）
- `r2-restarted-visible-runner.png`（实际运行概览，存在重复标题和四张同权重卡）

源码及截图可见的实际缺口：
- Side Panel 顶部返回在右侧、缺少清楚主标题/视图层级；状态长提示与按钮占首屏。
- 新建计划与打开运行页同权重；计划卡片把版本/任务/频率/时区排在一行，真正重要的**下次运行时间**被降为次要灰字。
- 编辑、暂停、删除同权重；历史与技术信息布局仍影响快速扫描。
- 独立运行页出现「OpenDesk 运行页 · 运行概览」和大号「运行概览」重复、长免责声明占首屏、四张卡像通用监控 Dashboard；真正操作对象及按钮在首屏下方。
- 运行宿主状态可能包含 `completed` 等内部枚举；中文、原因和恢复动作没有统一设计。

必须针对上述缺口实际修改，而不是只改一个颜色或新增一堆静态文案。

### 四、真实产品改造的固定目标

**P0-A：Side Panel「我的 → 定时计划」**
1. 保留一级「我的/发现/工作流/开发/工具/云控」，不增加「定时任务」一级 Tab。参考「工具」Tab 的 Index → Detail/Form/Management 原位切换，左侧返回、紧凑标题、右侧上下文动作；不破坏返回状态/草稿。
2. 计划索引首屏要回答：有几个计划、下次什么时候、当前运行是否正常、现在能做什么。用一个清晰的新建入口；运行页是上下文动作，非与新建等权重的主按钮。
3. 卡片：名称与状态 → **下次运行时间（主视觉）** → 人类可读频率/任务名称 → 主要动作（暂停/恢复、编辑）；删除进入次级/更多且需原位确认。长名称/URL/时区换行，不能横向溢出。
4. 历史默认精简，只展示最近结果入口/简短摘要；完整 Run/Result/FireId 进可展开技术详情或历史子视图。保留已实现的分页、精确原 Run 关联，不复制数据。
5. 无计划空态、Host 不可用、等待目标、需要授权、运行中、失败、UNKNOWN 有明确下一步；不叠加重复提示。

**P0-B：创建/编辑计划**
1. 单列以用户操作顺序组织：名称及可信安装任务（原 Select + 两个图标）→ 目标页与参数 → 执行规则 + 下次时间预览 → 高级选项 → 保存前确认。
2. 不能弱化已验证/已安装来源过滤、固定 task/version/hash/generation、安全目标 URL、JSON 对象、IANA 时区、DST、错过策略和权限提示；保留所有业务 DOM ID、ARIA。
3. 表单内联错误要紧贴控件且可聚焦；确认步骤展示固定任务、网站和时间而不是技术 JSON 转储。已编辑的旧版本不能静默被新版本替代。
4. 320/360/420/真实 zoom 200% 下，原任务选择 Select 与两枚 Icon 仍可用，但不能强制挤成不可点击的按钮；极窄空间可以合理重排并保留同一语义。

**P0-C：独立可见运行页**
1. 主标题只出现一次，简短 Host 状态与明确入口；将 Chrome 关闭/休眠等背景运行限制移到不干扰首屏的辅助说明。
2. 当有运行中任务：以当前运行对象为主；否则以最接近的下一计划为主。显示任务名称、运行/下次时间、需要处理的问题和允许的暂停、恢复、停止等真实操作。
3. 最近结果、宿主连接状态作为次要区域，不再四张同等级统计卡堆满首屏；危险/高级与原始枚举降级或折叠；不能把「管理全部计划」和正文 CTA 重复展示。
4. 宿主必须仍是原 `tool.html?scheduledRunner=1` 与原 RunHost；UI 调整不能增加 hidden host/Authority/DB/额外 SW、Cloud/Time Review alarm。
5. 宽屏与窄窗口都有独立可读排版，而非拉伸 Side Panel；中文长文本、异常状态、空态不会遮挡任务操作。

**P1：统一可复用规范落地**
- 将真实落地差异反馈到 R28 与 R20（R27 token 不另建）。用已存在的 `od-page/od-toolbar/od-stack/od-surface/od-icon-button/od-field`；只有至少两个场景经过验证具有同一结构，才考虑追加共享语义 CSS 原语。
- 「工具」Tab 的安装/发现/详情/设置切换和侧栏工具沙箱界限不得被计划任务 CSS 选择器污染；测试六个一级 Tab 回归。

### 五、必须实现的真实可交付验证

1. 每一轮 UI 修改后运行 `node --test tests/environment/scheduled-task-ui-r1.test.mjs tests/environment/scheduled-tasks-r1.test.mjs`、已有 `tool-ui-tab` / `sidebar-product-contract` / `task-workbench` 相关测试；稳定的原生脚本如果 DOM 选择器发生变更，应同步修改真实驱动，不允许“让测试通过而不点实际按钮”。
2. `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`；包字节、WXT 固定入口、CSP 不可放宽。
3. 原生 Chrome：Side Panel 300/320/360/420/520 CSS px、运行页 360/594/760/980；必须区分真实浏览器 100/125/150/200% 缩放与 CDP viewport 仿真。检查横向溢出、首屏操作可见、长中文、长 URL、嵌套空白、焦点、键盘、状态对比度。
4. 截图必须来源于实际构建的 `tool.html`；至少有「工具」Tab 参照页、定时空列表/有计划、创建/确认表单、独立运行概览、运行中与权限不足。记录每张截图的 SHA、Chrome 版本、Profile 和尺寸。不要把早期原型、mock 或静态 markup 充当产品最终验收。
5. 原 Controller 执行、Alarm/FireId/RunId/ResultId、真实网页动作、Worker 退休、Host 关闭/恢复和 Task 权限/版本必须不回归。原生功能证据只复用**同一相关输入身份**，不能因为外观相似就冒用以前的包 hash。

### 六、专家质量评分和输出

视觉设计、信息架构、任务快速扫描、操作效率、表单体验、错误/恢复、响应式/真实 200% 缩放、可访问性、跨 Tab 统一、源码维护性、权限安全、真实 Chrome E2E **分别以 100 分给出评价和证据**。每项目标 ≥95；无证据填 NOT_TESTED，不允许用平均分掩盖任何低分项。

输出实际修改文件、前后截图对照、没有重复创建的新层/库的说明、DOM/组件/构建/原生结果及链接、Git commit 和 push 状态、剩余低于 95 的问题。不要输出下一份 GOAL 代替代码。

**先核查与 R2.3 并行工作文件所有权；确认安全就直接改真实源码并持续运行到独立 UI 闭环验收。**
