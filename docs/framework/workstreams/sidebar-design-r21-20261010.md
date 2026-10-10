# Sidebar R21 · 五页签视觉收敛与验收工作流

日期：2026-10-10；分支：仅 `main`；目标：在已合入的 R19/R20 上做可验证的增量收敛，不创建另一个设计系统。GitHub Connector 写入仓库，不占用用户 Mac 本机项目、Chrome Profile、固定端口或 dist。初始代码提交：[`a35ab9523`](https://github.com/shopable-ai/opendesk-browser/commit/a35ab9523facea0b8f1848836cff42104c733ade)。

## 本轮已定位与修复的源问题

- **工具列表动态操作未复用公共控件**：原 `sidebar-tools.js` 的站点开关、卸载和新标签页按钮没有 `od-icon-button`，两项宽度约 30px；现在它们接入 34px 公共图标规格，保留各自真实 handler、ARIA/title 与 tool sandbox。
- **图标重复规则与焦点标签过长**：在 `design-system.css` 定义标准图标几何；视图样式移除工具图标重复尺寸，保留语义颜色。键盘焦点 tooltip 加最大宽度和换行，避免长工具名横向撑出侧栏。未修改用户 iframe 内 CSS。
- **工作流输入与辅助字号漂移**：统一面板表单输入/选择框 36px 等级及部分 10／10.5px 弱可读辅助文字。工作流特有 36px 操作图标仍保留既有变体。
- **旧产品规范误标为现行**：把五页签真实信息架构置顶，完整保留 R5/R6 历史段落为存档，不将历史三页签当作现行。
- **历史静态门禁只检查 28 场景**：扩展同一 Chrome 实际 HTML/CSS 夹具，覆盖运行视觉占位、长名称、空／错／加载／展开、审批、设置、结果、工具导入／更新／已安装／显示容器；仍然只标为 `STATIC_MARKUP_CHROME`。

## 验证合同、复用边界与证据等级

原 R20 的 [28/28 静态布局](https://github.com/shopable-ai/opendesk-browser/actions/runs/38062310949)、[85/85 组件与双构建](https://github.com/shopable-ai/opendesk-browser/actions/runs/38062478828) 是各自当时源码候选的历史 PASS，不能自动提升为当前 R21 PASS。

R21 独立目标：`tests/environment/sidebar-r21-design-system.test.mjs`、定向 Sidebar/Tool/Workflow Node 回归、`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`；以及 R19 扩展静态 Chrome 4 宽度截图与 metrics。静态 CSS 指标和原生安装扩展不是同一个测试级别。CI 应在对应候选上检查，不修改预算或 CSP。

| 页面 | 已覆盖的代码/静态审计点 | 本轮 Native Mac 扩展 |
| --- | --- | --- |
| 我的 | 任务列表、长名称、空状态、静态运行外观；真实 Run/Stop 所有权未新增授权 | NOT_TESTED |
| 发现 | 搜索筛选、长名称、空／错误状态和外轮廓 | NOT_TESTED |
| 工作流 | 对话初态、设置、审批、结果和输入框密度 | NOT_TESTED |
| 开发 | 网页摘要、代码编辑、直接／本地模式、连接中、错误、展开 | NOT_TESTED |
| 工具 | 官方推荐、安装审阅与更新、动态图标、独立工具框架和错误 | NOT_TESTED |

`STATIC_MARKUP_CHROME` 夹具只启用 DOM 展示与代表性模拟文字，不派发原生可信事件、不执行工具、不授予权限。必须在独立用户 Mac Chrome MV3 环境做真实安装、包 SHA、125%/200% 缩放、键盘、审批、文件导入、iframe、工具运行、Run/Stop、历史、重开等验收；未完成前 `EXPERT_SCORE_95_PLUS=NOT_VERIFIED`、`FINAL_ACCEPTED=NO`。

## 后续原生复核和独立页风险

- 加载精确生产包并核对 Git SHA、目录、manifest、dist 与 Chrome 扩展 ID；禁止借用别的任务的 Profile/端口。
- 300/360/420/520px 全部状态截屏，保存 computed styles、键盘焦点和视觉缺陷 ID；使用 `examples/tasks/demo-form.html` 做受信任页面。
- 检查工具导入审阅／卸载／Tab 打开／网站开关、网页笔记及阅读目录的实际沙箱和数据边界。
- Native Agent Workspace / Settings 目前由其他并行工作流维护，仅记录差异，未来适配 `--od-*`，不得直接覆盖。
- 六维评分需附每页实际证据与分数，无证据不宣布 ≥95/100。

本文件是 R21 独立工作流记录；后续需补入候选 SHA、CI 链接、原始截图目录、失败/修复详情及 Mac 本地结果。旧验收材料保持不变。
