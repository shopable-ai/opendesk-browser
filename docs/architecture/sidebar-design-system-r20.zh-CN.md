# OpenDesk Browser Sidebar R20 设计系统和布局契约

日期：2026-10-10，R26 布局补充：2026-10-12；范围：现有 Side Panel 六个正式页签「我的／发现／工作流／开发／工具／云控」，以及共用 `tool.html` 的任务目录、独立工具标签页。

本文件描述 Side Panel 的具体实现规则。**跨页面统一的尺寸、Tailwind 映射、Workspace/Settings/应用市场/沙箱分层及独立评分标准**以 [OpenDesk UI 布局与样式规范 R27](ui-layout-conventions-r27.zh-CN.md) 为准；两者共享 `src/ui/design-tokens.css`，不建立第二套 token 表。

## 为什么本轮不引入 Tailwind

本项目实际使用 Chrome MV3、原生 HTML/JavaScript 和 WXT 固定输出，`tool-shell.css` 先前将全局 reset、按钮、输入框、视图布局混在一份约 50KB 的文件里。Tailwind 的主要作用是提供 utility classes 和编译时样式生成；不建立统一语义组件、不规范使用方式，照样可以出现五个页面五套间距。仓库已经为 Native Agent Workspace 引入 Tailwind 构建依赖，但 Side Panel 继续使用审核通过的静态 CSS 和语义 token；沙箱中禁止 CSS 运行时 import/外部 URL。无需再把 Side Panel 或 Vue/React 工具全部迁到 Tailwind/Quasar，避免打乱既有打包和权限边界。

**选定：一个本地、静态、零新依赖的 Design System + 各视图专属 CSS**。以后独立 Vue/React 工具可按同样变量映射使用 Tailwind，但不得加载浏览器 CDN 或在受控页面执行外部样式运行时。

## 源码位置与责任边界

- `src/ui/design-tokens.css`：唯一可信宿主 `:root` 设计变量，语义色、4/8/12/16px 间距、8px 控件圆角、12px 卡片圆角、34px 图标按钮、11px 宿主页面水平 gutter。
- `src/ui/design-system.css`：读取上述 token，负责基础原生控件、通用布局原语和可访问性焦点；不得再定义另一套 `:root` 调色板。
- `src/ui/tool-shell.css`：仅保存五页签和完整目录的特殊布局/响应式/运行反馈；不再声明全局 `:root` 或基础控件 reset。
- 通用类规范：`od-page` 页签、`od-toolbar` 头部/工具栏、`od-stack` 纵向列表、`od-surface` 卡片、`od-button`/次按钮 `od-button--secondary`、`od-icon-button`、`od-field`、`od-segmented`。
- 新 UI 先选通用原语，只有真实交互或布局差异才添加 `developer-*`、`workflow-*` 等视图选择器。严格保留所有旧 DOM IDs、真实 Role/ARIA、RunHost/Stop 所有权和信任边界。
- 工具沙箱运行用户 HTML，不能自动加载这套高权限 UI 样式；需要独立、安全的工具主题合同才允许后续复用。

## R26 Side Panel 和隔离工具：统一尺寸与唯一留白层（2026-10-12）

### R30 工具 Tab / 工具详情作为跨 Tab 排版基准（2026-10-14）

用户指定「工具」索引页顶部及打开工具后的可信详情头部为统一基准。其他 Tab 的新增/调整部分遵循同一契约；本次首先落实开发页，不代表全部历史 Tab 已完成迁移。

- **顶部**：从首行标题/动作开始，沿用 workspace-content 的单一 gutter；不额外加顶部卡片或 padding。复用 `od-page-head`，普通最小高度 `--od-icon-size`，标题用 `od-page-title`（12px、600、1.5 行高）。相关短状态可同行，长文字可换行；详情标题需要单行时保留可访问的完整名称。
- **垂直节奏**：标题栏到所属内容、同区域相邻控件/折叠项统一 8px；说明与所属内容 4px；真正独立章节 16px；卡片内部仍为 12px。由父容器 gap 负责，不叠加子元素 margin。12px 卡片 padding 不等于所有行都应隔 12px。
- **头部动作区**：`od-page-actions` 靠右，动作间隔 8px。添加/导入/刷新/复制/设置等短、熟悉的操作用 `od-icon-button`：34×34px、8px 圆角、18px 图标；普通按钮为 paper 背景、line 边框、sub 图标，hover 为 muted，展开状态使用 focus 边框与 accent ink。每个动作有 title、aria-label 和可见焦点，保留 hidden/disabled。
- **背景类型**：常规头部操作使用上述浅底带边框型；主要执行用现有 primary；危险动作用现有 danger，保留确认；工具详情的返回使用 muted 背景，低频设置可保持 quiet 类型。颜色只引用 tokens，不按页面重建。不能把普通刷新/复制涂成主要执行按钮。
- **详情动作归属**：返回在标题左侧；作用于整个详情的打开独立页、设置、显示/隐藏、卸载放右侧头部。只作用于结果、历史或项目集合的复制/刷新放所属区域头部，不散落正文或放进 summary 内成为第二个交互控件。运行/停止、安装确认、权限批准等需要明确语义的动作保留文字及现有确认区。
- **开发页映射**：来源/本地项目开关是第一行；只读源码的「新建」在该行右侧；当前网页是轻量展开信息；本地项目刷新、结果复制、历史刷新各在其区域头部。代码类型、编辑器、参数、状态和结果沿用 8px 同区域间隔，编辑器仍至少 216px。当前网页不是新的主要卡片标题。
- **窄宽度**：不得缩小 icon；≤240px 可让动作组换行，粗指针实际命中区域至少 44px。验收分别记录静态 CSS 布局、实际浏览器 zoom 和已安装扩展证据，不能互相提升。

共享头部/按钮外观由 `design-system.css` 维护；`tool-shell.css` 只负责业务排版和状态差异。参考实现为 `sidebar-tool-list-view`、`sidebar-tool-display`、`developer-source-switch`。

### 间距与圆角规格（统一 4px 基础网格）

| Token | 值 | 使用位置 |
| --- | ---: | --- |
| `--space-1` | 4px | 标签与数量、辅助说明与内容之间的紧密间隔 |
| `--space-2` | 8px | 工具栏按钮间、表单标签与输入框、同行元素 |
| `--space-3` | 12px | 卡片内边距、工具自身的页面留白、编辑内容区 |
| `--space-4` | 16px | 不同功能章节或列表分组之间 |
| `--radius-control` | 8px | 输入框、按钮和标签 chip |
| `--radius-surface` | 12px | 卡片、区块表面 |
| `--od-icon-size` | 34px | Side Panel 常规 icon 按钮；不得因为窄屏随机改变规格 |
| `--od-page-gutter` | 11px（≤340px 时 9px） | 可信宿主 `#workspace-content` 外层内容边距 |

### 留白所有权和使用原则

- **已安装工具列表**：`#workspace-content` 负责一层 gutter；工具卡片内部仅使用自己的 12px 内边距。列表条目统一以标题为主，说明最多一行，升级状态跟随标题，而不是平铺数个操作按钮。
- **工具详情**：`#workbench-tools` 作为完整内容画布宽度，重新加一层内部 gutter 来对齐上方可信按钮/标题；`#sidebar-tool-frame` 横向抵消该内部 gutter，iframe 不绘制第二层边框和 padding。这既避免重复左右缩进，也保证框架**不超过工具面板本身的滚动宽度**。各个沙箱工具自行用 `.notes-app` 等顶层容器设置 12px 内容留白，工具内容与上方宿主标题保持约 1px 以内的视觉对齐。
- **区域内布局**：一行控件以 `gap:var(--space-2)` 为主；控件组垂直间隔用 8px、独立章节用 16px；卡片内部 pad 12px；辅助文案与正文用 4px。不要为了修视觉问题多次覆写同一处 `padding`，不要叠加父级和子级两个“页面 gutter”。
- **窄屏与长文本**：所有弹性子项 `min-width:0`，标题/URL 按需换行；标签列表可局部横向滚动，但 `#workspace-content` 不得因 iframe 额外产生横向滚动。输入框正文的 8px 内边距属于控件自身，并不计入页面的第二层 gutter。
- **显示状态与低频技术信息**：空列表一句话说明下一步；技术摘要（如源代码 SHA）放在“技术信息”折叠区域；从详情返回工具列表后不保留“已隐藏悬浮目录”等过期操作反馈。

### CSS 与工具隔离边界

工具沙箱为 opaque-origin，`src/sidebar-tools/sandbox.html` 不加载高权限 `design-tokens.css` / `design-system.css`，不允许外部 CDN、运行时 @import 或绕过 CSP。独立工具在自身 CSS 中声明**数值匹配**的 token（例如 `examples/sidebar-tools/quick-notes/src/style.css`），而非跨信任边界复用宿主样式。默认 Page Installed 记录和 Side Panel 工具包属于两个不同安装系统，列表只进行可信读取展示，绝不合并注册表。

### R26.2 网页笔记最窄尺寸规则（2026-10-12）

- 侧栏支持 300/320/360/420/520 CSS px；浏览器实际 200% 缩放可能使有效 CSS 布局宽度降到约 160–220px。网页笔记在不超过 **220 CSS px** 时将「关联当前网页」单独占满一行，删除和保存按钮在第二行靠右对齐；其他宽度继续使用单行操作栏。该规则防止勾选标签被图标挤压折行。
- 在 800 CSS px 及以上的独立工具标签页，笔记主体最大宽度 **760px** 并居中，避免独立页面的文本编辑框横跨整个桌面窗口；侧栏内保留原 12px 对称外边距。
- `scripts/tests/sidebar-quick-notes-layout-visual.mjs` 从**实际工具源码**加载 HTML/CSS 和 Logo，在受控 Chrome 里验证 12 种有效 CSS 宽度 × 4 种内容状态：整个页面无横向溢出、详情/正文/附件/按钮左右边缘对齐、图标尺寸固定 34px、窄屏标签完整与宽屏编辑器限制。记录为 `STATIC_SOURCE_CHROME`，不执行工具 JS，也不宣称真实 Mac Chrome 200% 扩展 E2E。

### 交付检查标准

- 静态回归检查宿主 gutter 与工具 iframe outdent、沙箱独立 4/8/12/16px token、控件 34px、简洁空状态、技术信息折叠与返回列表清理提示。
- 实际 Mac Chrome 需在 300/320/360/420/520px 及 125%/200% 缩放中检查真实已安装工具列表、网页笔记详情（长标题/网址/文本）、手动保存与更新，不能出现页面级水平滚动或 iframe 被裁切。
- 没有绑定当前候选源码身份的真实浏览器证据时，必须明确记为 `NOT_TESTED`，不能仅凭静态合同测试宣称原生通过或产品专家评分达到 95+。

## R28：开发工具栏及逐页布局检查

- 代码来源保持一行：左侧「直接编辑」，右侧「本地项目」真实 switch；普通行高至少36px，标签/关联控件使用 `--space-2`。不把来源选择、代码格式和运行权限混为同一个开关。
- 代码类型采用真实 radio 分段组，**可见「代码类型」文字与 JS / React / Vue 选项同排**。`fieldset/legend` 保留组语义，完整名称 JavaScript / React JSX / Vue SFC 保留于 ARIA 和 title；键盘 Tab 进入、方向键选择。禁止为了压缩宽度把正文缩到10px或只保留不可访问的图标。
- 标签、选项组使用 flex/grid 和统一 gap；单选点击高度至少36px，粗指针44px。组内紧密间距4px、标签与组选项8px；不通过额外 margin 或多层 card 堆出空白。300/320/360/420/520/600px 应同排；极窄有效宽度允许自然换行，页面不可水平溢出。
- 格式说明放在编辑器之后，避免挤占工具栏；只有当前选择的必要提示可见。源码只读下拉与「新建」保持同排，文件名可以截断，操作文字和键盘焦点不可截断。
- 运行/保存/停止仍由底部 dock 承担，不在每个区域复制操作。保存、切换格式与切换来源不自动运行网页；DOM ID、radio value、执行世界和授权合同保持稳定。
- 逐页检查「我的」（含定时、云控授权）、发现、工具、工作流、开发及开发版调试：页面只有一层 gutter；主操作同排；关联项4/8px、分组12/16px；说明与技术详情有明确层级；无横向溢出、dock遮挡或隐藏元素留白。CSS选择器必须指向当前真实宿主，不能沿用已迁移的页签 ID。
- Side Panel 继续复用 `design-tokens.css` 与现有原生 CSS 原语，实现与 Tailwind 相同的统一空间规格；不加载 Workspace 的 Tailwind Preflight，不新增运行时 CDN 或依赖。
- 专家95分目标须提供评分维度、截图、几何数据、实际加载身份和可信输入记录。布局专项评分、静态渲染、真实扩展交互、主题/缩放、安装与最终验收分别记录；未覆盖或用户要求停止的项目明确保留，不能以均分抵消。

本轮实施和证据入口：[Sidebar R28 工作流](../framework/workstreams/sidebar-inline-layout-r28-01a130d1.md)。

## 安全与构建闭环

`src/ui/tool.html` 顺序链接 `design-tokens.css`、`design-system.css`、`tool-shell.css`，随后原有 JS。通过 `scripts/prepare-public.mjs` 的静态资源白名单发布宿主 CSS；`scripts/verify-package.mjs` 核查对应的 CSS，逐份拒绝 `@import`、`url(` 和 `expression(`，不改变 Chrome 权限/CSP、不增加运行时脚本，也不提高单个 JS 构建体积上限。既有开发源文件 watcher 派生自相同的静态映射，新 CSS 也会被监测并安全发布。

R19 的真实 HTML/CSS 静态 Chrome 检查扩展为加载两份本地样式后再执行 300／360／420／520px 的 28 个组合、测量控件/间距和截图。测试只切换显示与示例内容，`STATIC_MARKUP_CHROME` 不代表原生扩展/授权回执。

## 后续验收与限制

- 定向组件：Sidebar 样式约束、五页 DOM 基本类、package 文件缺失/恶意 CSS、历史用户脚本回归。
- 构建：`npm run check`，生产/开发双包和 `npm run verify`；检查实际 `ui/design-system.css` 文件的引用与安装包一致。
- 静态 Chrome：五页签状态、不同宽度无横向溢出、开发区块一致性、圆角、键盘焦点；旧 R19 截图仍保留作对照。
- 真正 Mac Chrome 原生视觉／125%/200% 缩放／键盘交互／Run/Stop 等待独立实际验收，不能把静态 PASS 说成专家评分 95+。

Native Agent 全页 Workspace 和 Settings 具有自己的大屏结构与本地文件操作流程，而且正在由其他会话并行开发，不在本轮直接整体重写。这两页可在后续独立任务复用 `--od-*` tokens 并迁移到对应密度规范，避免并行改动覆盖。

## R29：全界面紧凑动作组（2026-10-13）

文字动作与常规图标按钮采用34px桌面高度，输入/选择器保持36px，代码类型radio保持36px。工作流图标和发送按钮沿用既有R15.3的36px合同，组内保持一致；本次不覆写其他负责人的回归测试。文字按钮以4px纵向、8/12px横向padding压缩外观，不缩小正文；低于34px的工具撤权/更新/安装动作补足命中区。粗指针动作至少44px，Tab焦点沿用统一token。

标题/状态靠左，同行操作以8px间隔组成靠右工具组；独立表单的确认/取消、步骤/版本维护、定时计划及底部运行/保存/停止采用内容宽度并对齐尾端，必要时自然换行。搜索/选择器可伸展，导航卡片仍保留内容所需面积。云托管配对、批准与停止/解除/核对分组，授权说明紧邻原checkbox；只调整布局，保留原授权和执行合同。本轮颜色/暗色及125%/200%缩放由用户暂停，不将未验证范围记作PASS。

固定评分及逐页状态矩阵：[R29验收表](../framework/workstreams/evidence/sidebar-layout-r29-20261013/acceptance.md)；正式截图、源码/实际加载包绑定与独立评审见[R29工作流](../framework/workstreams/sidebar-layout-r29-20261013.md)。95分只用于该固定布局范围，不能升级为安装/F3/ZIP验收。

## R28：一个 Tab 中的多功能区、索引和子视图

新增统一规范：[Side Panel 多功能区 Tab 布局契约 R28](sidebar-multi-section-tab-contract-r28.zh-CN.md)。以现有「工具」Tab 的已安装工具 / 已安装网页工具 / 折叠高级能力 / 导入与发现 / 详情返回为真实结构参照，形成 **Tab Root → Index/Section → Detail/Form/Management → Inline Review** 的组合规范。仅抽取信息架构、优先级、视图切换与可访问性，不复制工具 Tab 历史 CSS 或业务授权。R27 继续是尺寸与 Tokens 唯一来源，本文件继续是 Side Panel 视觉原语与 gutter 约定。

新增「我的 → 定时计划」与未来在现有 Tab 内嵌多个功能区时，必须遵守 R28：标题只出现一次，二级返回在左，主次区域按真实任务优先，技术信息按需折叠，主要操作和危险操作分层；在原 Trusted Host 内复用 `od-*`、不得新开一级 Tab 或跨用户工具 sandbox 借权限。具体首批应用范围、测试及原生证据见 [Scheduled Tasks R2.4 UI GOAL](../framework/prompts/goal-scheduled-tasks-r2.4-ui-multi-section-final-20261013.zh-CN.md)。


## R30：公共组件外观唯一所有权与迁移用法（2026-10-13）

这是既有 R20 设计系统的**实施说明**，不是第二套设计系统。数值只在 `src/ui/design-tokens.css` 调整；`src/ui/design-system.css` 是公共外观唯一来源；`src/ui/tool-shell.css` 只负责业务特有布局、尺寸和交互状态。Side Panel 无需强制改为 Tailwind，也不向第三方工具 iframe / 网页注入宿主 CSS。

| 角色 | 公共类 | 使用规则 |
| --- | --- | --- |
| 主／次／危险／纯文字操作 | `od-button` + `od-button--secondary / --danger / --quiet` | 默认外观完整；页面禁止重新定义普通按钮颜色、边框和圆角 |
| 图标按钮 | `od-icon-button` + `--primary / --danger` | 固定 34px；必须有 `title`、`aria-label` 和可见焦点；首次授权也不能变宽 |
| 表单字段 | `od-field`、`od-form-field`、`od-field-label`、`od-field-help / od-field-error` | 输入框默认 36px 高；readonly、disabled、aria-invalid 由公共 CSS 管；字段组内部 4px、组间由页面 gap 管 |
| 文字 | `od-body`、`od-note`、`od-technical`、`od-title` | 正文 13px、说明 12px、技术文字 11px；粗体强调不改变同一段落的字号及正文颜色 |
| 卡片与结果 | `od-surface`、`od-surface--padded`、`od-result` | 同类容器使用同一普通边框变量；内部结果和技术内容不重复叠卡片 |
| 折叠 | `od-disclosure`、`--info`、`--flat` | 独立功能区有外框；首次说明仅标题允许信息型蓝色；内部技术信息无外框 |
| 提醒 | `od-alert`、`od-alert--warning`、`od-alert--error` | 状态色由公共 token 提供；普通正文不染蓝或染红 |
| 布局 | `od-toolbar`、`od-stack`、`od-segmented` | 页面负责组间距与 flex/grid，公共组件负责自身留白 |

实际 HTML 继续使用既有静态样式入口（公共三份 CSS 加云控业务 CSS），通过选择角色复用组件，不复制演示皮肤：

```html
<div class="od-stack">
  <details class="od-disclosure od-disclosure--info">
    <summary>首次使用：连接方法</summary>
    <p>连接成功后选择项目；此处正文使用默认文字颜色。</p>
    <button type="button" class="od-button od-button--secondary">连接本机 OpenDesk</button>
  </details>
  <div class="od-form-field">
    <label class="od-field-label" for="example-url">目标网站</label>
    <input class="od-field" id="example-url" aria-describedby="example-hint">
    <p class="od-field-help" id="example-hint">完整 HTTPS 网址。</p>
  </div>
  <details class="od-disclosure od-disclosure--flat">
    <summary>技术信息</summary>
    <pre class="od-result">按需查看</pre>
  </details>
  <div class="od-toolbar">
    <button class="od-button">运行</button>
    <button class="od-button od-button--secondary">保存</button>
  </div>
</div>
```

**保留的合理例外：**JavaScript 编辑器继续有等宽字体和可调整高度，但 `#script-source` 的普通表单边框、配色与圆角来自 `od-field`；工作流输入框、目标来源切换开关、原生文件控件、目录筛选保留其具体功能布局。`workflow-ai-plan` 是固定 34px 图标发送按钮，模型接收方/首次许可通过旁边说明、title 和 ARIA 告知，JS 仍严格判断用户手势与独立网页读取授权。由 JavaScript 创建的工作流步骤必须同样应用公共类。

**防退化与验证级别：**`tests/environment/sidebar-component-contract.test.mjs` 是受影响的源码合同检查；已有 `scripts/tests/sidebar-r19-layout-visual.mjs` 用于真实 HTML/CSS 的静态 Chrome 渲染检查，不能代替用户 Mac 的已安装 Side Panel 原生验收。没有完成的检查保持 `NOT_TESTED`；95+ 只按实证评分。


## R31 目标适配：第一方可信工具 UI 不必默认 iframe（2026-10-13）

这是 [官方预编译 UI / 动态工具隔离决策](browser-framework/custom-tool-ui-and-local-development.zh-CN.md#r16-设计决策官方预编译-ui-与动态工具隔离并存2026-10-13) 在 **Side Panel 布局**上的增量规则，**当前尚未实施**；不改变上文对现行 iframe 工具的 R26/R30 约束。

- 时间回顾等在**编译期确认**的第一方可信 UI 可复用既有 `#sidebar-tool-display`、宿主标题栏、`od-page/od-toolbar/od-button/od-surface` 和同一 `src/ui/design-tokens.css` 直接渲染，不添加第二层页面 gutter、第二个卸载入口或新的滚动容器。可用 ES Module/局部 CSS/必要时 ShadowRoot 防止同名变量和 CSS 污染；ShadowRoot 并非安全边界。
- 未经编译期准入的安装工具继续使用原 opaque-origin iframe；不把宿主 `design-tokens.css`、Preflight、`chrome.*` 或任意包脚本放进工具执行世界。视觉差异通过隔离工具自己的 CSS 数值映射修复，不能为“统一样式”解除权限隔离。
- 可信界面上的开始/恢复/暂停应在同一区域完成；首次来源与网站权限在原位可信 DOM 完成。已存在有效权限时避免二次确认，只有扩大范围、Chrome 缺失权限或不可逆清理才要求必要审核。320/360/400/600px、200% 缩放与真实键盘顺序以同候选 Chrome 证据为准，不能把静态 UI 评审当原生 95+ PASS。
