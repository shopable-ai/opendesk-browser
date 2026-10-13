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

## 第二轮 CI 的历史测试修正

`da6cb667` 的 R19 [38433689576](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433689576) 已通过原先失败的 `schedule-form 300px`，随后在 `develop 300px` 遇到 **旧验收规则**：编辑器圆角要求 12px，而 R30 `od-field` 的控制圆角为 8px。同步修订 R19 脚本为 8px 控件圆角，并根据 R27 `--space-3` 校正开发大区块 12px 布局间距（原脚本仍要求 8px）。保留溢出、折叠标题高度/字号/字重、操作组和状态覆盖。

R21 [38433689575](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433689575) 则因原测试 `sidebar-develop-layout-r29.test.mjs` 用严格 `class="单一类"` 判断历史子折叠、并要求 R30 已删除的独立外观 CSS 而 FAIL。更新测试，改为核对包含共享类的组件语义、`design-system.css` 唯一外观、现有历史 RunHost 和触控 / 可访问性约束；不恢复旧版重复 CSS。下一候选的全部定向、静态 Chrome、用户 Mac 原生结果须继续单独核对，未运行不得写 PASS。

## 第三轮几何收敛与 R21 过时合同清理

`1f04bf3` 的 R19 [38434280184](https://github.com/shopable-ai/opendesk-browser/actions/runs/38434280184) 在 `develop 300px` 报实际间距向量 `[8,12,12,12,12,12,12,12,12,12]`。上层宿主 Tab 和编辑器内部为不同 gutter owner，分别按 8px/12px 检查，不改变产品以迁就旧断言。修复 `.developer-run-technical p` 直接覆盖水平 margin，使展开正文继承共享卡片左右 12px 留白。

R21 [38434280150](https://github.com/shopable-ai/opendesk-browser/actions/runs/38434280150) 的历史 Development R29 测试现已 4/4 PASS；集成套件其余旧断言仍认为 320px 额外静态 Chrome 场景不允许、源码新建按钮一定要业务 CSS 明写 12px、工作流卡片/警告与代码编辑器必须各自定义圆角，以及 stylesheet 数量永远等于3。这些与 R27/R30 公共视觉合同和既有 5 个宿主可信 CSS 资源不符。调整这几项断言以核对 **同一权威公共 CSS、真实 class 及动态资源数量**；没有删除组件真实断言。

另一个 `sidebar-tools-host.test.mjs` 的 `host state did not settle` 仍是与折叠外观无直接关联的业务运行时 FAIL，须单独复现和修复，不能通过提高评分或修改断言掩盖。新候选原生 Mac Chrome 仍 `NOT_TESTED`。

## 真实溢出定位

R19 [38434969667](https://github.com/shopable-ai/opendesk-browser/actions/runs/38434969667) 已通过 `develop` 和 `develop-local` 在 300px 下的统一标题尺寸/间距检查，但 `develop-details`（展开运行结果、网页 JS 试运行、版本管理）出现真实 `contentOverflow/panelOverflow=true`。不允许忽略溢出或调低断言；增强同一 Chrome 测试，报告超出面板右边界的可见 DOM 元素及 computed overflow 诊断，以便下一修复针对真实来源。
