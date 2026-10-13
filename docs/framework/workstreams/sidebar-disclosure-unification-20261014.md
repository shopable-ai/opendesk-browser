# Side Panel 折叠区排版统一 · 2026-10-14

## 范围与负责人

本对话只处理可信 Side Panel 折叠组件与「开发」Tab 的视觉一致性。初始核查 main 基线：e64af0b8a42fd4ae02eeeedf50da5f23a52802ae；提交前已核对新 main 的新增提交只涉及独立的 Scheduled Tasks 测试。写入文件：`src/ui/design-system.css`、`src/ui/tool-shell.css`、`src/ui/tool.html`、`tests/environment/sidebar-component-contract.test.mjs`、`scripts/tests/sidebar-r19-layout-visual.mjs` 和本文件。页面授权、代码执行、SDK、RunHost、Native Agent 和第三方工具沙箱均不在修改范围。

## 问题和实现

- 现状已存在 `od-disclosure`，但开发页对参数 JSON、运行结果、运行历史、网页身份、诊断区有多份冲突的标题字重 / 字号 / padding / 边框。折叠时高度与正文对齐不一致。
- 以「运行结果」的 `od-disclosure` 为公共标准：顶层标题统一 13px、650 字重、40px 最小高度、8px 纵向与 12px 水平 padding，居中对齐；触摸下最小 44px。统一折叠指示符，不取消原生 `details/summary` 键盘语义。
- 「当前网页」「参数 JSON」「运行目标与版本」和「Advanced / Diagnostics」收敛为同一顶层卡片；嵌套历史/高级详情继续 `od-disclosure--flat`，首次连接指引仅保留信息标题的强调色。
- 移除开发 Tab 对 summary 的局部字体和额外顶部 padding/border，保留功能控件结构、ID、动态状态与真实执行合同。
- 公共 CSS 不引入 Tailwind Preflight、新依赖、CDN、运行时 JS 或第三方工具宿主越权。

## 验证与留存

- 源码合同检查：`node --test tests/environment/sidebar-component-contract.test.mjs`，验证开发顶层/嵌套视觉语义和单一公共标题规则。
- 几何检查：`node scripts/tests/sidebar-r19-layout-visual.mjs <输出目录>`，验证侧边栏 300/320/360/420/520 CSS px 多状态、普通与粗指针下的折叠头尺寸及溢出，并保存实际 HTML/CSS 静态 Chrome 证据。
- 全局回归：`npm run check`、`npm test`、`npm run build`、`npm run build:dev`、`npm run verify`。以上必须以实际运行结果登记；仅修改源码不视为 PASS。
- 后续必须在用户 Mac 上核对 `dist/development` 的真实扩展身份与已安装 Side Panel，开发页手动/本地项目两种状态下折叠与展开、300–520px、125%/200% 缩放、暗色/键盘、运行/停止反馈。没有同候选原生证据时为 `NOT_TESTED`；不宣称整站或专家 95+ 已完成。
- 其他 Tab 的历史专用 `summary` 样式（任务、定时计划、工作流、云控、工具、Debug）需要按 R27/R30 分区域迁移，不能把本次公共基类的修复冒充全部已迁移。宽泛删除其局部 CSS 会破坏已有状态布局，须按实际渲染逐项验证。

## CI 真实失败核对（后续修复）

2026-10-14 `075a1ab` 的 Sidebar R19 静态 Chrome 工作流 [38433080226](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433080226) FAIL：`schedule-form` 场景宽度 300px，`.schedule-source-row` 实测间距 4px，违反原有 8px 动作组合同。根因是 `tool-shell.css` 的 `@media(max-width:340px)` 覆写共享 gap。这是「我的 → 定时计划」原有问题，不是开发页折叠交互的回归。删除窄屏覆写、保留既有按钮大小与排布，并在源码合同中增加防回归断言。修复后的静态 Chrome / 用户 Mac 证据按新候选单独记录，未执行前保持 `NOT_TESTED`。
