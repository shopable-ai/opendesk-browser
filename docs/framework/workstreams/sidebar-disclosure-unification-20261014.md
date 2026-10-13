# Side Panel 折叠区排版统一 · 2026-10-14

## R32 续接执行范围（2026-10-14）

追加定向测试所有权：`tests/environment/workflow-focus.test.mjs`（DOM fixture 需要按 class token 匹配，保留焦点行为）、`tests/environment/developer-layout.test.mjs`（旧 174px/600 字重断言与 R29 已实施的 216px/公共 650 字重不一致）。编辑前两文件 diff 均为空。`scheduled-task-ui-r1`、`sidebar-product-contract`、`sidebar-tools-host` 已有其他负责人未提交修改，本轮不覆盖或混入提交。

- 负责人：当前 Codex R32 对话；只在 `main` 写入。起始及远端基线均为 `89c3b298dc3cf8927b227b041b101770780ce58a`。已有 Cookie / Import / Cloud 未提交改动保留，不加入本轮提交。
- 本轮写入：`src/ui/design-system.css`、`src/ui/tool-shell.css`、`src/ui/tool.html`、`src/ui/cloud-hosting.css`；根据清单对可信动态模板仅追加公共类；`tests/environment/sidebar-component-contract.test.mjs`、`scripts/tests/sidebar-r19-layout-visual.mjs`、本工作流。跨模块行为/权限合同不变；R21 最小修复另按诊断登记具体路径。
- 执行：先关闭粗指针定时表单真实溢出，保留既有回归约束；再按一级卡片/二级技术详情迁移逐Tab并删除重复外观；最后定向Node、静态Chrome、构建与原生验收。已有回归覆盖先运行，缺失场景先补测再修复。不是重新设计信息架构。
- 资源：现有 PID 67778/67794 `npm run dev` 是 `dist/development` 写入者，不另起 watcher 或 build:dev 覆盖；静态Chrome使用本任务临时 profile、系统随机端口和 `artifacts/sidebar-r32-*` 独立证据目录。真实Chrome不占用其他Cloud/Cookie验收profile。
- 当前CI日志已重新取得：R19 run 38436690386 / job 115432404797，360px coarse 的操作列34px而按钮44px，右边界359超出父349；R21 run 38436690356 / job 115432404399，156 PASS / 1 FAIL；R1 run 38436690362 / job 115432405349，319 PASS / 16 FAIL，只分析本轮影响。
- 清单核查与R21诊断由两个原生子Agent只读并行，主负责人统一落盘CSS/模板和共享Git状态。所有结果按当前相关输入哈希登记，静态证据不提升为原生PASS；未独立审阅评分保持 `NOT_SCORED`。
- 动态模板追加公共类的具体写入文件：`src/ui/task-workbench.js`、`src/ui/scheduled-task-workbench.js`、`src/ui/installed-page-tools.js`、`src/ui/cloud-hosting.js`、`src/ui/workflow/workflow-view.js`。编辑前这些文件diff为空；仅修改details的class，不改事件、授权或运行行为。静态视觉脚本由原生子Agent Hume 独占编辑，主负责人收集真实Chrome证据。
- 迁移后的测试写入补充：`tests/environment/sidebar-r21-design-system.test.mjs`、`tests/environment/task-workbench.test.mjs`、`tests/environment/workflow-ui-states.test.mjs`。后两者编辑前diff为空，仅将旧的完整class字符串断言改为原业务类与公共折叠类并存，保留原隐私、冻结源码、授权和交互断言。

## R32 实施结果与验收边界（2026-10-14）

本轮修改真实 Side Panel，继续使用 `od-disclosure` / `--flat` / `--info`，没有新 UI、Tailwind、依赖、权限或 iframe 样式注入。独立审阅 Lovelace 检查了正文留白、hidden、标题布局及暂存边界；视觉驱动由 Hume 修改，最终修复和验证由本对话负责人执行。

| 页面 | 已迁移的真实组件 | 原生观察与缺口 |
|---|---|---|
| 开发 | 一级沿用运行结果标准；SDK 批准快照改为 flat；strong/b 继承公共字号和 650 字重 | 实际扩展中检查收起、展开及 Params JSON 的 Enter/Space/Tab/Shift+Tab；本地项目和完整宽度/缩放矩阵 NOT_TESTED |
| 我的 | 运行记录、网站权限、更多操作采用一级组件；动态历史、任务管理和定时高级详情采用 flat | 检查真实定时表单；当前没有已安装任务，安装任务详情的原生验收 NOT_TESTED |
| 发现 | 候选证据、冻结源码及版本身份采用 flat；不新增折叠层 | 实际空任务列表已观察；非空候选原生验收 NOT_TESTED |
| 工作流 | 管理折叠、参数/Schema、JavaScript、原值、技术身份、模型设置及动态步骤复用公共组件 | 原生展开高级参数和 Schema，正文与 Dock 不重叠；未发送模型请求 |
| 云控 | 连接/配对、外部应用采用一级组件；约束、运行身份及诊断采用 flat | 当前 main 导航把 cloud 归入 tasks，tabOrder 不含 cloud，而模板仍显示云控标签；真实点击没有切换。保留独立入口 FAIL，不恢复或重写 R14 授权流程 |
| 工具 | 可信 Cookie 主卡一级，变更记录、修改表单、网站授权 flat | 原生展开 Cookie 卡和技术详情；未读取 Cookie、批准网站或启动第三方工具 |
| Debug | 脱敏诊断快照一级组件 | 原生展开长 JSON；只读状态，无任务领取或执行 |

真实缺陷与删除的覆盖：

- R19 coarse 360px：两列固定 34px 容纳 44px 图标导致溢出。统一使用 `minmax(0,1fr) max-content max-content` 和 8px gap，删除后续 34px grid 覆盖；桌面图标仍 34px、coarse 仍至少 44px。
- 删除 tool-shell 中 33 处普通 summary 外观规则，保留 `#workflow-provider-settings>summary{display:none}` 这一独立设置子视图合同。删除 task、workflow、schedule、Cookie、Cloud 和 Debug 对公共卡片重复的 border/padding/radius；cloud-hosting 删除旧卡片 padding 及 summary 颜色覆盖。
- `#task-installed-detail`、`.task-tools .row`、两处 `.cloud-privacy-note` 的零横向 margin 覆盖公共 12px inset，造成左贴边、右空白 24px；删除后由公共正文规则提供对称留白。视觉驱动测量实际 margin 和左右边界，要求目标确实可见。
- SDK 批准快照中文标题在 360px 超出标题框约 5px。标题使用 span 包装，公共 `summary>span:only-child` 允许占据并收缩可用空间；没有针对 ID 加高优先级规则。独立复核后将规则限定为唯一标题 span，避免改变当前网页 label/hostname 的业务布局。
- 动态 JS 只追加组件类，保留原 ID、事件、授权及运行行为。workflow-view 的其他未提交规划/采用逻辑属于并行负责人，仅暂存 workflow-step 的 class 单行。

当前布局证据：

- `npm run check`：668 文件 PASS，`/tmp/sidebar-r32-check-accepted.log`。
- 七个定向 Node 文件：81 PASS / 0 FAIL，`/tmp/sidebar-r32-node-accepted.log`。
- R21 十文件本地集成：162 PASS / 0 FAIL，`/tmp/sidebar-r32-r21-accepted.log`。R10 修复由 Time Review 负责人提交于 `284b0d94`：短字节探测退役别名，保留 canonical 20KB、真实 click 和一次性授权断言，未增加延时或伪造 ack。
- 最终静态 Chrome：292 几何样本＋3 键盘样本 PASS，保留既有 my-cloud-open 场景；300/320/360/420/520、普通/粗指针、收起/单开/多开、长中文/URL/JSON、少量 dark/reduced-motion 场景。`artifacts/sidebar-r32-accepted-preserved/metrics.json` 的 `inputsStable=true`，六项 HTML/CSS 输入 SHA 绑定。metrics SHA-256：`81b1152ac49580708d49c44e735bb3bdd2d5ca0b655b924cdcda6ee484ea5cf5`。该证据严格为 `STATIC_MARKUP_CHROME`，不证明真实扩展导航、授权、安装或原生事件。
- 失败迭代日志与产物保留在 `/tmp/sidebar-r32-*`、`artifacts/sidebar-r32-*`；没有删除或提升历史 FAIL。

构建/全量验证的限制：生产和开发完整构建及 verify 曾 PASS，日志 `sidebar-r32-production-accepted.log`、`sidebar-r32-development-accepted.log`、`sidebar-r32-verify-accepted.log`；这些是最终唯一标题 span 收缩规则前的候选，不能冒充最终完整构建。最终重建被另一负责人重新启动的 npm run dev（PID 25149 / 输出 guard PID 25173、43120）拒绝，原始日志 `/tmp/sidebar-r32-build-final.log`。不停止他人 watcher、不改输出端口绕过资源锁。最终开发 watcher 已输出与源码相同的 HTML/CSS，但增量更新不代替完整候选 build/verify。

完整 npm test 曾记录 2283 / 2246 PASS / 35 FAIL / 2 SKIP（`/tmp/sidebar-r32-all-node-after-build.log`）：独立审阅分为 15 development 资源缺失、19 独立运行时/合同失败、1 production 模块来源断言。最终工作区重跑（`/tmp/sidebar-r32-all-node-current.log`）记录 **2290 / 2265 PASS / 23 FAIL / 2 SKIP**，包含独立 Cloud 撤权、市场证据、compiler 元数据、bundle 来源和旧工作流采用合同；没有剩余普通 disclosure class/字号/间距断言失败。当前 watcher 下 verify 的 production PASS，development 因 `Unexpected packaged asset` FAIL（`/tmp/sidebar-r32-verify-current-watcher.log`），增量开发输出不能视为可发布的完整候选。当前工作区包含其他 owner 未提交输入，全量结果不是纯 R32 提交验收。提交后 R19/R21 CI 按确切 SHA 另行更新，不隐藏这些失败。

原生身份与原始观察：通过 macOS CUA 操作 `/Users/shopme/Applications/Google Chrome.app` 的实际 Side Panel，扩展 UI 的加载路径为仓库 `dist/development`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；Native manifest allowed_origins 与 `opendesk browser doctor` 的 local.extensionId 一致。实际 DevTools 只读测量工具页：363×857 CSS px、DPR 2、页面无横向溢出；一级 40px/13px/650/8px 12px，flat 36px/12px/650/8px 0。原生截图和 AX/Console 原始结果保留在本对话工具输出，不能与静态 PNG 混称。最终同候选完整原生验收仍为 NOT_TESTED：宽度拖动返回 `noWindowsAvailable`，滑块动作未证实尺寸变化；Chrome 125% 只改变测试网页缩放，没有证明 Side Panel 本身缩放，随后恢复 100%。200%、300–520 全矩阵、暗色原生与本地项目模式均未登记 PASS。

评分为 **NOT_SCORED**。云控入口 FAIL、最终一致完整构建/CI及完整原生矩阵未关闭，不能宣布 95+ 或整体产品完成。

复现本地布局验证：

```sh
node --test tests/environment/sidebar-component-contract.test.mjs tests/framework/sidebar-develop-layout-r29.test.mjs tests/environment/sidebar-r21-design-system.test.mjs tests/environment/sidebar-ui-preview.test.mjs
CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing' node scripts/tests/sidebar-r19-layout-visual.mjs artifacts/sidebar-r32-recheck
opendesk browser doctor
```

完整构建必须等待输出 owner 明确交接 43120，然后在 main 依次执行 `npm run build`、`npm run build:dev`、`npm run verify`；原生继续使用上述已加载路径和 ID，在 `http://127.0.0.1:43111/demo-form.html` 打开真正 Side Panel，通过原生窗口调整宽度与焦点操作，读 DevTools 几何并保存各页 300–520 /125%/200% 证据。不能用 DOM 赋值、伪造事件或另装扩展替代此项。

## 范围与负责人

以下是 R31 历史实施记录；本轮 R32 的扩展范围、当前证据和未关闭项见本文末节。

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

## 300px 展开场景真实 CSS 根因与修复

诊断版 Chrome R19 [38435389431](https://github.com/shopable-ai/opendesk-browser/actions/runs/38435389431) 明确报告 `develop-details 300px` 中五个直接子控件溢出：`#script-params`、`#page-program-list`、`#script-id`、`#script-owned-url`、`#script-document`，每项边界均为 `left=22,right=302,width=280`（面板右边界约 291）。**根因不是需要新增 Tailwind，而是 `.od-disclosure>:not(summary)` 的左右 12px margin 与控件自身 `width:100%` 相加，导致真实溢出**。在框架公共 CSS 的 disclosure 内容规则中增加 `max-width:calc(100% - var(--space-3) - var(--space-3))`，嵌套 `--flat` 无侧边 inset 时单独恢复 `max-width:100%`。新增双重 Node 合同和保留真实 Chrome 300px 展开溢出阻断。未重新实测的新候选仍标记 `NOT_TESTED`。

## 定时计划表单操作区的有意左对齐

`f767d52` R19 [38435698788](https://github.com/shopable-ai/opendesk-browser/actions/runs/38435698788) 证实 300px 和 320px 的所有场景均通过，包括 `develop-details` 的真实水平溢出检查。继续至 360px `schedule-form` 时，旧静态脚本把表单底部 **“检查并确认 / 返回列表”** 的明确左对齐错误当作必须右对齐。代码 `.schedule-form>.schedule-actions{justify-content:flex-start}` 属于计划表单 R2.7 已确定的布局。验收脚本现在只为存在 `schedule-save` 的该表单操作组验证 **左侧内边缘**，其余操作组仍严格验证右侧内边缘；绝不放松按钮高度、8px 间距、真实宽度和溢出规则。
