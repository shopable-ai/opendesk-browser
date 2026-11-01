# 扩展应用 HTML 预览套件 R1

目标：ChatGPT 网页生成的工具设计稿沿用 OpenDesk 的按钮、表单、标题和状态语义；评审后的预览可追溯到实际设计系统，避免每个工具再创一套界面。交付是独立离线设计文档，不新增安装器、Host、SDK、AI Provider 或应用市场。

## 问题证据与选择

已核对的仓库事实：`workspace-ai-proposal.js` 发送任务、文件正文和身份；`workspace-chat-request.js` 回填被请求文件；工作流 planner 返回步骤 JSON。它们未自动附带 UI skill、R27 或设计 CSS。`sidebar-tool-development.zh-CN.md` 要求独立原型，但沙箱不继承宿主样式。用户当前失败 HTML 尚未提供，因此具体回答的偏离位置仍为 UNKNOWN。

选择 **确定性工具 + 可携带网页上下文 + 本地 skill**：只写 skill 不能让网页模型看到规范；复制一份手工 CSS 会漂移；修改工作流 JSON planner 会混淆职责。生成器直接读取唯一 CSS，网页提示词与 HTML 一起交付，回收后进行静态检查与交互评审。

## 既有入口与本轮增量

2026-10-30：两个既有生成器共用唯一完整宿主 DOM `scripts/templates/sidebar-tool-preview-shell.html`，共享导航、返回与模拟卸载行为来自 `scripts/preview/sidebar-shell-behavior.js`。`scripts/templates/sidebar-preview.html` 仅为设计内容/模拟逻辑 fragment；kit 输出仍是完整单文件 HTML、prompt 和 manifest。共享 helper 配置只读、纯模拟，不写入平台，也不改变公开 API。实际证据见本轮生成文件与报告，生成成功不代表交互终验或测试 PASS；普通离线预览不默认进入安装、Browser 构建、发布、全量验收或评分。

```sh
node scripts/sidebar-preview-kit.mjs create \
  --out artifacts/sidebar-preview-kit/my-tool-r1 --title "我的工具"
node scripts/sidebar-preview-kit.mjs check /absolute/path/returned-preview.html
```

`create` 输出五个文件：

| 文件 | 用途 |
| --- | --- |
| preview.html | 自包含设计稿，包含规范 CSS、可编辑内容/模拟 JS、应用外部状态/主题/恢复控件、真实来源导航与工具栏，以及新建/编辑/取消/删除确认示例 |
| components.html | 从当前共享源码编译的可操作组件参考，复用同一外壳，不是正式安装包 |
| component-recipes.md | HTML/JSX 接入片段、页面组合及运行时边界；与设计稿一起交给网页模型 |
| chatgpt-prompt.txt | 粘贴到网页的生成约束；仍需附上 HTML 实际内容 |
| manifest.json | 输入 SHA、HTML SHA 与证据等级；不是权限或信任凭据 |

在用户指定的既有 ChatGPT 对话中，由用户附上 `preview.html`、`component-recipes.md` 并发送提示词及工具需求；`components.html` 可另行打开操作参考。本工具不自动发消息、不读取凭据。模型须先列需求/视图/组件映射，再返回完整 HTML。若网页无法读取附件，明确缺失并改为用户粘贴完整文本；只给本地路径、模型自述“已遵守”、对话缩略预览均不能证明模型接收了规范。仓库 skill 为 `.agents/skills/opendesk-ui-preview/SKILL.md`。

模型回收时只允许改 `#od-preview-app` 内部，以及 `#od-preview-behavior` 中 `/* DESIGN_APP_BEHAVIOR */` 标记之后的工具模拟逻辑；标记及前面的共享宿主交互由 check 保护；全部 CSS、外壳、外部模拟声明、CSP 和源身份保持原样。仓库模板维护允许增加真正通用的外部辅助区，并同步保护区与来源锁；专有故障注入仍仅在目标 adapter 实现。需要额外组件或布局时先在仓库评估真实缺口，扩展模板并重新生成，不在模型结果中临时覆盖颜色/圆角/按钮。预览可在普通浏览器独立打开；Workspace 的静态 HTML 净化预览会移除执行入口，不能据此判定本交互模板坏掉。

两个生成器通过 `scripts/preview/sidebar-shell-source.mjs` 共用真实 `src/ui/react/` 导航/工具栏及 `src/ui/tool-shell.css`。SSR 当前含 7 项，预览只显示「我的 / 扩展 / 工作流 / 开发 / 云控」正式五 Tab，不按固定 SSR 总数判断；隐藏 `app-debug` 等调试项目不载入业务。设计稿保留可编辑应用区域；返回、工具标题、模拟卸载取消/确认及恢复沿用真实外壳位置，取消/Escape 恢复触发按钮焦点。

设计稿外部辅助区演示已授权、未授权、撤权、加载、空、失败、长文本与恢复，授权均为模拟。官方风格试点中公共组件参考展示 light/dark，工具内容、宿主和辅助区保持 light；旧候选的应用明暗切换仅作历史行为记录。预览说明、状态/主题控件与“重置模拟数据”操作不放入应用内容；内容不重复工具标题或对象/检测说明，刷新放所属区域右上角。正式工具源码、安装包及 iframe 不含这些辅助控件。顶部正式工具标题已有 `role="heading"`，应用内不再放 `h1`；检查器会拒绝内容区的 `h1`。设计稿未保存表单期间禁用外部状态/主题/恢复，取消或 Escape 返回后恢复这些控件。

检查器验证当前源哈希、保护区、样式快照、重复 ID、按钮/输入语义、脚本语法及明显真实能力调用。任一失败 CLI 返回非零。过期模板保留原件，重生成后迁移内容并重验；不重写历史 manifest。未锁定任意 JS 的运行效果：静态 lint 和文档 CSP **不是不可信代码安全执行器**，通过检查也不能免除源码审阅与独立浏览器观察。

模板的可复现实测入口（复用已有 Playwright/CFT；不自动下载依赖）：

```sh
node scripts/tests/sidebar-preview-kit-browser.mjs <套件目录> <新的独立证据目录>
```

环境没有仓库级 Playwright 时，用 `OPENDESK_PLAYWRIGHT_MODULE` 指向现有 `playwright/index.mjs`；需要选择已有 CFT 时，用 `OPENDESK_PREVIEW_CHROME_BIN` 指定其可执行文件。观察器新建独立上下文、读取 canonical CSS 建立另一参考页，并在结束时关闭浏览器。原始报告绑定其记录的源文件、HTML、观察器 SHA、浏览器版本与平台。此脚本验证模板示例；改为实际工具流程后须同步该工具的用例，不能把模板按钮用例当作任意生成界面通过。

## 官方风格试点合同（2026-11-01）

**当前入口：工具v7柔和按钮与配置库；共享模板v5去除可见来源哈希长段。** 已获批方向仍为shadcn/ui + React Aria base + Nova + Neutral。工具通过现有secondary/outline/quiet和局部Frame公共气泡变量降低黑色视觉重量，不改全局官方primary定义。当前目录为`official-neutral-20261101-reviewed-v5/`与`official-scrapyjs-20261101-reviewed-v7/`；[当前交付索引](../../artifacts/sidebar-preview-kit/official-neutral-20261101-v7-evidence/README.md)维护同源候选、定向回放、独立复评与同步结果。v4评审只保留历史范围；v5未达标评审原件保留，不回填分数。来源meta/manifest、模拟声明及安全检查保留；真实AI/Native/安装/production未测。

v3 回放通过但两位独立评审未放行，失败记录保留在 `official-neutral-20261101-evidence/design-review-v3.json` 和 `architecture-review-v3.json`；不再作为当前源码或评分证据。v1 和下文 expert-patterns 保留历史身份。真实AI/Native/安装/production未测；离线独立评审不等于用户视觉终验。

### 官方默认配置与出处

[create?base=aria&preset=b0](https://ui.shadcn.com/create?base=aria&preset=b0) 的默认 preset 编码为 `b0`，style 为 `nova`，base 为 `aria`；`baseColor/theme/chartColor` 均为 `neutral`，`font=inter`、`fontHeading=inherit`、`iconLibrary=lucide`、`menuAccent=subtle`、`menuColor=default`、`radius=default`、`rtl=false`、`pointer=false`。生成配置 style 为 `aria-nova`。**Neutral 是主题名，不是名为“Neutral UI”的官方 preset。** 全站默认 base 是 Base UI；列表命名 preset `Nova (Aria)` 的字体是 Geist，与此 URL 默认 Inter 有区别。

- [React Aria 正式 base 与八种 style](https://ui.shadcn.com/docs/changelog/2026-07-react-aria)：支持 `--base aria`，默认 base 仍是 Base UI。
- [官方 DEFAULT_CONFIG](https://github.com/shadcn-ui/ui/blob/24a16429815cc4d691f38b49d0f4ffc11a9daef4/apps/v4/registry/config.ts#L173-L189)、[URL 默认 b0](https://github.com/shadcn-ui/ui/blob/24a16429815cc4d691f38b49d0f4ffc11a9daef4/apps/v4/app/%28app%29/%28create%29/lib/search-params.ts#L43-L79)、[Nova (Aria) 命名 preset](https://github.com/shadcn-ui/ui/blob/24a16429815cc4d691f38b49d0f4ffc11a9daef4/apps/v4/registry/config.ts#L435-L452)：解释上述默认项差异。
- [Theming](https://ui.shadcn.com/docs/theming)、[Neutral 源码](https://github.com/shadcn-ui/ui/blob/24a16429815cc4d691f38b49d0f4ffc11a9daef4/apps/v4/registry/themes.ts#L5-L75)、[Nova CSS](https://github.com/shadcn-ui/ui/blob/24a16429815cc4d691f38b49d0f4ffc11a9daef4/apps/v4/registry/styles/style-nova.css)：颜色、尺寸、变体和状态来源。旧 HSL registry 与 Theming 示例彩色 charts 不代替当前 `chartColor=neutral` 灰阶。
- [React Aria Styling](https://react-aria.adobe.com/styling)：RAC 默认无样式，以 data 状态及 render props 提供样式挂点；行为 base 不等于视觉主题。

官方 registry 的 `files[].content` 已展开 base 模板的 `cn-*` 标记，直接采用时应读取发布源码：

| 组件 | 官方文档 | 官方发布源码 |
| --- | --- | --- |
| Button | [Aria Button](https://ui.shadcn.com/docs/components/aria/button) | [button.json](https://ui.shadcn.com/r/styles/aria-nova/button.json) |
| Input | [Aria Input](https://ui.shadcn.com/docs/components/aria/input) | [input.json](https://ui.shadcn.com/r/styles/aria-nova/input.json) |
| Select | [Aria Select](https://ui.shadcn.com/docs/components/aria/select) | [select.json](https://ui.shadcn.com/r/styles/aria-nova/select.json) |
| Tabs | [Aria Tabs](https://ui.shadcn.com/docs/components/aria/tabs) | [tabs.json](https://ui.shadcn.com/r/styles/aria-nova/tabs.json) |
| Switch | [Aria Switch](https://ui.shadcn.com/docs/components/aria/switch) | [switch.json](https://ui.shadcn.com/r/styles/aria-nova/switch.json) |
| Dialog / 确认框参考 | [Aria Dialog](https://ui.shadcn.com/docs/components/aria/dialog) | [dialog.json](https://ui.shadcn.com/r/styles/aria-nova/dialog.json) |

核对日期2026-11-01；固定官方快照为 `shadcn-ui/ui@24a16429815cc4d691f38b49d0f4ffc11a9daef4`，快照 CLI 为4.23.0、官网 RAC 为1.20.0，不能据此改写本仓库依赖版本。原始配置及来源摘要见[官方证据 JSON](../../artifacts/sidebar-preview-kit/official-neutral-20261101-evidence/official-sources.json)；这是取证资料，不是运行时数值配置，也不是 OpenDesk 最终候选身份。

### 唯一 CSS 来源、映射与有意偏离

[design-tokens.css](../../src/ui/design-tokens.css) 的 **`.od-theme-shadcn` 显式接入** Neutral；[design-system.css](../../src/ui/design-system.css) 维护规范组件。可执行字体、颜色、数字与状态样式只在 CSS 维护；本节解释来源，不能成为第二份数值真相或生成器输入。未接入表面与工具局部主题不因试点自动迁移。

| 官方语义 | 现有 od-* 映射 / 用途 |
| --- | --- |
| foreground / muted-foreground / border | `--od-ink` / `--od-sub` / `--od-line` |
| background / muted | `--od-paper` / `--od-bg`、`--od-muted` |
| primary / primary-foreground | `--od-brand` / `--od-on-brand` |
| input / ring | `--od-input-border` / `--od-focus` |
| destructive | `--od-negative`；`--od-negative-bg` 按明暗派生危险浅底 |
| secondary / secondary-foreground | `--od-action-bg` / `--od-action-ink`；此作用域 action border 为透明 |
| radius | `--radius-control`；`--radius-surface` 按官方比例派生 |

官方 Nova Button 的 default/sm/xs/lg 高度来源为 **32/28/24/36px**，默认文字 **14px/500**；Neutral radius 为 **0.625rem**，默认根字号对应 **10px**。当前 CSS 沿用这些密度来源，具体 padding、字阶、圆角和覆盖以 CSS 为准，不宣称所有变体逐像素一致。本地 `primary/secondary/quiet/danger/outline/link` 分别适配官方 `default/secondary/ghost/destructive/outline/link` 外观，不把官方变体名冒充本地 API。

两项明确偏离：**系统字体替代默认 Inter，不加载远程字体；字段统一14px**，而官方 Input 为 `text-base md:text-sm`（md 前16px）。这是侧栏密度选择，不称官方原样输出；字体栈和字号仅由 CSS 定义，不写入 JSX、生成 HTML 覆盖或 Markdown token 配置。

### 组件语义与最小状态合同

以下为本地试点验收合同，包含保留的原生交互，不表示官方已替本地实现全部状态。**Button 显式 `base='aria'` 使用 RAC，其余调用保持 native；Input/Textarea 新增 RAC，Switch 为真实 RAC。原生 select、保留原生键盘语义的按钮式 Tabs、inline confirmation 仅适配官方外观，不称 RAC Select/Tabs/Dialog，不虚构公共导出。** 官方 Button 动作/禁用为 `onPress/isDisabled`；Input primitive 的输入事件语义与上层 TextField 的值式 `onChange/isDisabled` 不混用，见 [Button API](https://react-aria.adobe.com/Button)、[TextField API](https://react-aria.adobe.com/TextField)。

公开接入从 `@opendesk/ui` 导入 `Button/Input/Textarea`。本地 Button 在 Aria 路径转发 `onPress`，并将 `disabled` 或 `isDisabled` 合并为 RAC `isDisabled`；示例优先用 `onPress` 表达动作。Input/Textarea 分别包装 RAC `Input/TextArea`，自身加入 `od-field` 与 `data-slot="input"/"textarea"`，使用 `disabled`、`readOnly` 和事件式 `onChange(event)`，取值为 `event.target.value`；不把它们写成 TextField 的值式回调或 `isDisabled` 接口。标签、帮助、错误由调用表单显式关联，不自动生成 Field/TextField 包装。`IconButton`、Card 与 Chat 展示组件不因同页使用而成为 RAC 控件。

| 控件 | normal / hover | focus / disabled | invalid / loading、标签与帮助错误 |
| --- | --- | --- | --- |
| Button | 一处主要动作，次要/quiet/outline/danger/link 按 CSS 分层；hover 不改变布局、不成为唯一可发现提示 | focus-visible 使用 ring；真实禁用阻止重复动作，保留名称；native/Aria 各用真实属性 | 字段 invalid 不冒充按钮错误，提交错误归所属状态区；loading 明确忙状态并防重复提交，不丢失名称；接入 Aria pending 时保留其可聚焦语义 |
| Input / Textarea | input 边界、foreground、muted placeholder；hover 不要求额外边框色 | 焦点可见，disabled 不可编辑；readonly 可读/可选择，不等于 disabled | label 真实关联，placeholder 不代替标签；aria-invalid 与就近错误、帮助 ID 通过 aria-describedby 关联；loading 锁定相关写入并保留草稿/原因 |
| 原生 Select 外观适配 | 使用字段语义；选项弹层保留浏览器原生绘制，不承诺与 RAC Popover 一致 | 保留原生键盘、选择、focus-visible 和 disabled；不伪造 listbox | 可见 label、当前值、帮助和错误关联；loading 不清空已有选项/值或重复提交；invalid 有文字解释 |
| 现有 line Tabs | 线形选中指示与正文层级；hover 只补充，选中不靠颜色唯一表达 | tablist/tab/tabpanel、aria-selected、关联及既有方向键/Home/End；disabled 不可激活 | 不套字段 invalid；页内错误/加载归 panel 并播报，不改选中项或清草稿；有名称，帮助不只在 hover 中 |
| RAC Switch | 选中 primary、未选 input，thumb 表示状态；hover 不承担状态表达 | data-selected/data-focus-visible/data-disabled；Space、标签关联及真实禁用有效 | 可见标签与作用说明；保存中防重复切换，失败保留/恢复实际值并就近报错；unknown 不重放，不伪造已生效 |
| inline confirmation / 确认框 | 明确对象、影响、取消与危险确认，保留原 inline 流程；Dialog 仅作外观参考 | 进入先聚焦取消；取消/Escape 恢复触发者，触发者失效则合理邻项；保留草稿保护，不虚称 modal/RAC focus trap | 确认中显示忙状态、防重复写入；失败留原区域，unknown 不重放；标题/描述/错误可访问关联，inline 不加伪 aria-modal |

标签、帮助、错误和 loading 都须有可读文字；状态按实际语义选择 status/alert/aria-busy，不逐次播报无关变化。仅验证本次实际改变的控件、键盘和焦点，不把状态表扩成每次全量验收。

### 主题、Portal 与 ownerDocument 边界

公共组件参考与HTML模板展示浅/深；**本轮 ScrapyJS 工具内容保持浅色**，可信宿主与外部辅助区也保持浅色。各公共示例在自己的显式主题根切换，不由系统深色或示例切换污染工具。沙箱 iframe 不自动继承父文档变量，沿原构建/提取入口在自身文档接入 CSS，不导入完整 Host CSS、Preflight 或特权代码。

Portal 挂载点必须位于**同一 ownerDocument、同一显式主题边界内**；同文档 body 若在主题容器之外仍会丢失变量，不可据此加全局覆盖。ShadowRoot 同样在自己的样式边界处理。禁止跨 iframe 文档、把沙箱内容 portal 到可信 Host 或提升执行世界。native select 与 inline confirmation 不因这条合同改造成 Portal/RAC Dialog。

既有生成器继续输出 `preview.html / components.html / component-recipes.md / chatgpt-prompt.txt / manifest.json` 完整五件套；源码→生成→同候选操作/截图→独立复评，不手改生成 HTML，不用官方快照 SHA 替代最终产物 SHA。ScrapyJS 保持原 owner，仅复用公共风格/预览入口，不搬业务、服务或权限。评分保持 PENDING，旧分数不升级本候选；本次文档修改不启动构建、浏览器或评分。

## 风格来源与页面组合（2026-11-01）

**React 是实现方式，Shared UI 提供控件；整页风格还取决于信息层级、业务布局、状态和局部主题。** 本轮目标是改善后续扩展的默认设计起点；成功条件是来源可查、内容优先、常用操作就近、单层留白、交互不退化。范围与决策见 [DESIGN 的独立作用域](../../DESIGN.md#扩展设计模板与风格组合2026-11-01独立作用域)，不批量改版现有工具。

| 职责 | 唯一现有入口 | 如何使用 |
| --- | --- | --- |
| 颜色、字体、间距、圆角语义 | [design-tokens.css](../../src/ui/design-tokens.css) | 沿用已有变量；组件内部尺寸以当前 canonical CSS 为准，不在文档另定义数值表 |
| 公共控件外观与交互 | [design-system.css](../../src/ui/design-system.css)、[共享 React 控件](../../src/ui/react/components/ui/)、本套件 `components.html` | HTML 复用规范语义；React 仅使用实际已公开的 `@opendesk/ui` 成员 |
| 页面布局与示例 | [sidebar-preview.html](../../scripts/templates/sidebar-preview.html)、[原生成器](../../scripts/sidebar-preview-kit.mjs)及本节 | 先选任务组合，再使用控件；模板仅是设计起点，不是运行时工具脚手架 |
| AI 开发与预览路由 | [开发 Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)、[预览 Skill](../../.agents/skills/opendesk-ui-preview/SKILL.md) | 继续使用现有入口；Skill 不会自动附到外部模型上下文，须交付实际附件 |

参考依据是当前源码，不能把参考工具当成组件库：[Cookie Editor App](../../examples/sidebar-tools/cookie-editor/app/CookieEditorApp.jsx)使用共享 Button，其 [react.css](../../examples/sidebar-tools/cookie-editor/src/react.css)还定义应用作用域主题与业务布局；[书签 App](../../projects/bookmark-manager/src/react/App.jsx)使用共享 Button/IconButton，其 [style.css](../../projects/bookmark-manager/src/react/style.css)负责树、搜索、详情与编辑。可复用紧凑密度、就近操作和渐进展开；不复制它们的业务 CSS、颜色、私有服务或可信组件作为全局默认。两项目有并行工作，本节不声明其当前包或安装验收通过。

### 从样板提炼标准：Tokens、控件、组合分别处理

以下数值为先前基线的差异观察，保留诊断历史；本轮已获批的显式主题及偏离以[官方风格试点合同](#官方风格试点合同2026-11-01)为准，不要求先恢复旧数值或重新批准。

无需把两工具整体“转换成 design-tokens.md”。**CSS 保留可执行的唯一值源，Markdown 记录设计选择、适用场景与证据，模板演示这些选择。** 下表是本轮源码观察，数值用于解释差异，不是第二份 token 配置或已批准的新默认。

| 观察项 | 当前公共基线与样板差异 | 提炼方式 |
| --- | --- | --- |
| 颜色 / 输入边界 | 公共 `--od-input-border` 浅色为 `#7f8da1`；Cookie 的作用域映射为 `#e5eaf1`，因而边界更柔和 | 候选调色板须同时核对文本/控件边界对比、focus/error/disabled 与深色；通过后才修改唯一 Tokens，不把浅边框直接推广 |
| 按钮密度 / 字重 | 公共按钮最小36px、圆角8px、字重650；Cookie 有33px/11px的局部 compact；书签 CSS 另保留34px/圆角9px/字重580的自有按钮规则，是否实际作用还取决于 JSX 类名 | 区分阅读文字和操作控件，保留正文可读性与触控热区；先用现有 quiet/IconButton，确有多个同类消费者才评估公共紧凑变体，不虚构 `size` API |
| 图标 / 表面 | 默认 icon 与 Card 有边框/表面；样板按区域采用轻量操作、连续树行与平面内容 | 按场景使用现有 quiet 变体；只给需要分组的区域表面，不用全局清除边框或阴影来改业务布局 |
| 间距 / 信息层级 | 样板还有局部3/7/9px等值；共享控件与页面容器各有自身留白 | 提炼“单一留白 owner、内容优先、区域动作就近”，不逐值抄成全局 token，也不要求工具像素完全相同 |

要提升公共组件本身的外观，应先用同一数据、相同状态对照当前控件和候选：普通/hover/focus/disabled/error、浅深主题、图标和文字操作都可实际操作；独立视觉评审明确哪里更清楚、哪里仍生硬，再决定修改 Tokens 还是控件样式。已验证的公共决定回写原 CSS，模板由原生成器重新生成；业务差异继续留工具。不新增平行主题文件、组件库或 `design-tokens.md` 值表来掩盖不一致。

**技术同源与设计质量是两个判断。** computed style 与 canonical 一致只能证明没有漂移；视觉质量还需结合真实内容、对比层级、操作负担、状态和键盘观察。原有测试全绿不能换算为95分，也不能证明模板已经与 Cookie/书签同等成熟。本轮只完成默认列表组合与规范入口，公共调色板/组件皮肤尚未改版或独立评分。

| 任务组合 | 默认结构与视觉层级 | 必须保留的交互 |
| --- | --- | --- |
| 列表 / 资源树 | 区域标题与创建/刷新同行；同类记录用紧凑行，按需共用一个集合表面；名称优先，摘要按需第二行；树保留层级 | 编辑/删除等行操作用 quiet 或已有 IconButton，可访问名称含对象；不依赖 hover 才可用，不强行把树改成卡片 |
| 新建 / 编辑 | 按任务分组，字段标签、输入、帮助、错误相邻；高级属性渐进展开；不逐字段套 Card | 保存、取消、校验、脏草稿和修订冲突保留，退出回到触发者 |
| 只读详情 | 正文先于管理动作；显式进入编辑，技术信息折叠 | 保留选中对象、返回位置及焦点，不把查看等同于编辑 |
| 设置 | 二态用已支持 Switch/原生 checkbox，互斥项用原生选择或原有组件；按任务分组 | 说明即时生效或保存后生效，保留真实生效反馈、取消和未保存保护 |

这是四种**组合指引**，不是新增 List/Field/Tree/Dialog 公共 API。默认模板只演示列表→表单→确认；`components.html` 用于操作真实基础控件，不代表四套完整产品已实现。`preview-*` 是离线布局辅助类，正式工具布局仍由自身 CSS 持有。工具页不重复宿主标题；每个当前任务视图一个主要操作，行编辑/删除低强调，危险色留给确认。正常就绪不常驻说明，空、加载、失败、权限原因与实际保存回执保留文字。

分区使用现有16px、集合内8px、CardContent12px；由一个容器负责一层留白，避免父 gap 与子 margin 叠加。字段等组件内部以当前 canonical 规则为准，不能为了凑统一数字覆写控件。默认模板将逐条 Card 改为单集合表面，空/阻断状态不留下空卡片；保留原增删改、取消、主题和焦点行为。未来需要别的版式时按任务选用，不把此列表示例强加给全部工具。

**按改动触发测试，先冻结通过条件：**

| 本次改动 | 最小验证与通过条件 | 证据边界 |
| --- | --- | --- |
| 仅文档 / Skill | 事实、链接、范围与公开 API 名称正确；无旧宽度矩阵或发布前置误入当前阶段 | 不启动产品、构建或浏览器 |
| 模板 / 生成器 / 组合样例 | 原 `sidebar-preview-kit.test.mjs`；重新 `create` 后 `check`，源 SHA、保护区、CSP、样式和模拟能力边界仍通过 | 静态合同及 SOURCE_COMPONENT_PREVIEW；不证明模型读取了附件 |
| 可见布局 / 交互 | 原 `sidebar-preview-kit-browser.mjs` 真实输入；新建校验/保存、编辑取消/保存、删除取消/确认、Escape/焦点、空/失败/撤权/忙/长文本、浅深主题及 canonical computed style；本轮另核对单集合、无逐条卡片、动作对象名称和空态无空表面 | STATIC_PREVIEW_CHROME，截图绑定同一 HTML/输入 SHA；不能以测试数量代替布局复核 |
| 后续某工具实际接入 | 在其唯一 owner 复用同源预览，只运行受影响用户操作；包输入变更才检查包同源，涉及真实权限/安装才进入原合同 | 工具源码、包、安装证据分别记录，未执行为 NOT_TESTED |

正常窗口默认缩放；本轮不做宽度/缩放矩阵、全量 Browser 构建、正式包晋升、真实 AI 或安装评分。验收失败先分类：驱动/旧断言只修驱动，实际交互缺陷只修模板；来源漂移重生成，不放宽校验。用户继续评价体验时，对照同候选截图与实际操作再调整，不用主观95分结束迭代。

## 组件与组合的直接入口（2026-10-30）

### 可见预览与成熟样板提炼（2026-11-01）

`scripts/templates/sidebar-preview.html` 是生成器的内容/行为片段，不能当成完整预览交付。应交付生成目录中的 **components.html**（完整组合）和 **preview.html**（可编辑设计稿）。客户端若只显示 HTML 源码或过滤脚本，用仅绑定 `127.0.0.1` 的静态服务打开生成目录；先检查 HTTP 200、`text/html` 和响应字节 SHA 与 manifest 一致，再检查实际内容及一次点击。链接可下载不等于页面已执行；同时提供可见截图。没有实际载入证据，不标记 `SOURCE_HTML_INLINE`。

`components.html` 现在默认呈现有五条代表性内容的资源工作台，含分组/搜索/无结果恢复、只读详情、编辑主字段、展开其他属性、保存与取消。偏好设置即时改变实际分组；基础控件保留原 Switch、字段、确认和异常状态演示。导航保持挂载；资源新建/编辑及删除确认期间锁定切换/主题/重置。基础控件字段是独立演示草稿，取消恢复最近保存值；显式恢复初始预览会重置它。预览布局与状态只属于离线示例，不新增公共组件 API。

| 从成熟工具提炼 | 当前源码 | 进入规范/模板的内容 | 仍留业务 owner |
| --- | --- | --- | --- |
| 搜索与按需筛选 | Cookie `CookieSearch`；书签搜索区 | 常驻搜索、清除恢复焦点、无结果恢复 | Cookie 过滤条件、书签路径算法 |
| 摘要行与低强调操作 | Cookie `CookieRows`；书签 `Tree` | 名称优先、次信息分层、单一集合表面 | 敏感值、树键盘/虚拟行、业务标记 |
| 先读后改 | 书签 `PreviewPane / Inspector` | 打开先读详情，显式编辑；返回到来源行 | 书签服务、文件夹选择与提交 |
| 渐进表单 | Cookie `CookieAdvancedFields` | 主字段优先、次属性折叠、错误就近、取消不提交 | Cookie 分区/权限/身份 |
| 状态列表 | Cookie `CookieHttpConnections` | 状态有文字、空态有下一步、恢复就地发生 | 网络连接/账号状态机 |
| 草稿与完整工具栏 Chat | 原消费者及公开 Chat 合同 | 保持视图/会话、取消与焦点；复用现有 Dock/Frame/session | 业务提案、Provider、真实授权 |

样板源码对应 `examples/sidebar-tools/cookie-editor/app/components/` 与 `projects/bookmark-manager/src/react/App.jsx`。Atlas 的书签旧目录和 Cookie React 来源已修正；历史构建仍保持历史标签，不靠改链接升级证据。

**实施顺序**：先修预览可达性与来源 → 在原组件消费者中展示完整组合 → 当前候选操作/截图 → 独立评审 → 只有发现多个真实消费者需要同一种新语义时，才由公共组件 owner 在原位置提取。CSS 数值继续只在 canonical Tokens 中维护；Markdown 写角色、密度选择、组合和反例；Skill 负责发现顺序、生成及验收入口。可导入控件使用已有 Shared UI，工具布局归自身，禁止将成熟工具整份 CSS 或特权业务搬进公共模板。

本轮按以下六维分别评分（0–100），**每维 >95 且无阻断项**才报告“方案评审达标”；总均分不代替最低维度。两位独立评审分别检查源码方案与当前截图/交互证据，意见原文保留，低分指出可执行缺口后复评。

| 维度 | 要检查的证据与扣分条件 |
| --- | --- |
| 来源与复用 | 真实 owner/类/组件可定位；无重复 Token 表、伪公共 API 或业务复制 |
| 信息与视觉层级 | 有代表性内容与列表/详情/表单/设置；浅深截图、操作权重、单层留白；不能只看按钮小样 |
| 交互与可访问性 | 搜索恢复、只读/编辑区分、保存/取消、字段关联、键盘与焦点、草稿保护有实际操作 |
| 兼容与边界 | 原 HTML/Vue/React 不迁移；无真实网络/存储/权限调用；不影响业务主题与正式包 |
| 预览交付 | 完整 HTML 实际打开、有内容、可点击；HTTP 字节身份与截图可核对；不能交付源码 fragment |
| 可维护性与验证 | 原生成器/Atlas/Shared UI 继续唯一；变更有定向验证和来源锁；限制与后续触发条件明确 |

检查只覆盖本轮离线模板方案，正常窗口默认缩放；Native、production、真实 AI、两参考工具的当前安装验收为 `NOT_TESTED`。评分不证明这些项目通过，也不保证未来生成的每个工具自动达到同样视觉质量。

上一轮离线候选 `artifacts/sidebar-preview-kit/expert-patterns-20261101-reviewed/` 的两位独立 AI 子代理评审记录为六维最低96，架构/设计分数依上表顺序分别为 `97/97/96/97/97/97` 与 `98/96/96/98/98/97`，完整意见保存在本机 `artifacts/sidebar-preview-kit/expert-patterns-20261101-evidence/expert-reviews.json`。组件 HTML SHA 为 `f6b5d8458b63f84f64657e7faf5f1406f038f1f1cfa087a4ec94a55c459061b9`；同目录 `browser-1793466702409/report.json` 的150项定向检查、29组样式对照及 `delivery-reviewed.json` 的 HTTP/IAB 回执对应同一候选。**用户随后指出按钮变体、输入边框及排版仍不成熟，视觉项已重新打开；这些历史分数不能继续证明当前视觉已获认可或问题全部闭合。** 不改写原评审，也不凭反馈臆造新的分数。


同一个 `sidebar-preview-kit.mjs create` 现在输出五个文件：`preview.html`（可编辑设计稿）、`components.html`（可操作共享组件示例）、`component-recipes.md`（HTML/JSX 接入片段）、`chatgpt-prompt.txt`、`manifest.json`。从设计稿应用外部的「打开可操作组件与用法」进入示例；两个 HTML 同目录离线打开即可。给网页模型时附上设计稿和用法文件，不能只给本地路径。

示例不是新 Atlas 或组件库；完整设计参考仍在 [既有统一入口](../../prototypes/sidebar/extension-ui-showcase/index.html)。最小运行消费者为 [sidebar-component-recipes.jsx](../../scripts/preview/sidebar-component-recipes.jsx)，直接导入真实 `Button / IconButton / Card / CardContent / Switch / Input / Textarea` 源码，用当前 React/React Aria 编译；生成器复用同一宿主壳。`manifest.componentReference` 保存 HTML/用法 SHA 及编译源/依赖 SHA。证据为 `SOURCE_COMPONENT_PREVIEW`，不代表已安装的 `sidebar-shared-ui.js` 或正式工具包通过。组件源码归现有 `src/ui/react/components/`，session 归 `src/ui/conversation/`，展示 API 与组件边界见下文；本页不扩展授权合同。

| 用途 | HTML 设计稿与工具 | React 工具 |
| --- | --- | --- |
| 主要 / 次要 / 轻量 / 危险按钮 | `od-button` + `--primary / --secondary / --quiet / --danger` | `Button base="aria" variant="primary / secondary / quiet / danger"`；默认 secondary，未显式选 base 时保留 native |
| 卡片与内边距 | `od-shared-card` → `od-shared-card-content` | `Card` → `CardContent`，同一 CSS |
| 字段与帮助/错误 | `od-form-field` → `od-field-label`、`od-field`、`od-field-help/error` | RAC `Input/Textarea` 配合原生 label、帮助/错误关联；无共享 Field/Select 导出 |
| 正常 / 空与加载 / 失败 / 权限撤权 | `od-note / od-alert / od-alert--error / od-alert--warning`，配合 status/alert | 同一原生语义与显式编译的 canonical CSS |
| 开关 | 保留原生 checkbox 基线 | 真实 React Aria `Switch`，传 `isSelected / onChange / isDisabled` |
| 共享 Chat | 打开同目录 components.html；顶栏小 AI 按钮实际开合 | Host 公共入口 + workspace/business + SharedConversationDock + Frame/session，纯内存展示模拟 |
| 删除确认 | Card + 对象/后果 + secondary 取消 + danger 确认 | 相同组合；没有新增 Dialog API |

模板默认使用上述字段、Card 和状态组合；独立分区 16px、区内 8px、CardContent 12px；刷新位于所属区右上角。列表低频删除用 quiet，确认才用 danger。空值错误关联 `aria-describedby / aria-invalid`，修正时清除；确认默认焦点在取消，取消/Escape 恢复触发者。检查器拒绝未知/冲突按钮变体、悬空描述引用及移动/改写保护区参考链接；原有来源、CSP 和宿主脚本前缀保护继续有效。

正式 HTML 工具在自身 CSS 保留原有 `/* @opendesk-shared-design */`，由 [唯一构建期提取器](../../scripts/preview/shared-tool-design.mjs) 输出 canonical 原语和同源 Card 子集，无需另抄卡片样式。React 工具复用已有 `@opendesk/ui` 运行时与项目编译入口，例如 [quick-notes-react](../../projects/quick-notes-react/README.md)。按本轮实施更新，public runtime only 路径已补齐显式主题内 Input/Textarea 的完整字段外观，与 Button/Card/Switch 一同由公共运行时提供；不能再要求作者为获得字段外观额外复制 CSS。标签、帮助、错误的语义关联及工具布局仍由调用方持有，需要的布局/状态规则沿工具原静态 CSS 构建显式提取；不把整个宿主 CSS/权限脚本注入 iframe。指南示例与 Skill 段已由原 owner 更新；这些实施事实不代表新候选已验收，也不替用户升级已安装包。

当前没有统一沙箱 Menu/Tree/Combobox/Dialog API；组件示例不声称这些能力已封装。HTML/Vue/React 原工具、安装身份及数据保持原合同。真实 Chrome 安装、权限、Native、生产发布和真实 AI 附件回收均为 NOT_TESTED。

### Frame 片段与完整工具栏 Chat

Frame 消息/输入示例在唯一 `components.html` 入口内同源编译 `conversation.tsx`、Frame CSS 与 session，manifest 记录源/依赖/HTML SHA，不消费旧 Browser 构建。Frame 自带 CSS，消费者提供有界 flex column（min-height:0、overflow:hidden），限制消息区滚动且不压缩输入；示例高度不是通用产品高度。session 稳定创建、订阅与卸载清理。单独运行此片段只证明消息/输入，不证明完整工具栏组合。

完整工具栏 Chat 组合是 **Host 公共入口 + workspace/business + SharedConversationDock + SharedConversationFrame/session**。工具通过 `OpenDeskTool.setConversationState({visible:boolean,open:boolean})` 声明展示状态，从 `OpenDeskTool.root` 接收 `opendesk:conversation-action`，其 `detail` 为 `{action:'toggle'}`，再受控更新 open。这些能力仅控制展示，不授予权限、不自动发送。`SharedConversationDock` 是纯展示组件，使用受控 `open/onClose`；消息、输入和会话继续使用原 Frame/session。Host 实际安装入口为 NOT_TESTED；本轮验证层级是工具源码与 preview 模拟。

实际参照为 `projects/bookmark-manager/preview/react`，它消费真实 App + TrustedWorkspace：HeaderSlot 中小字 AI 按钮紧挨卸载；展开后业务在上、Chat 在下，以细分隔条形成底部 split，支持拖动及键盘调整；收起回到按钮，重开保留草稿。此处只复用公开组合与交互，不导出 TrustedWorkspace/HeaderSlot，不跨 iframe DOM，也不复制书签业务。

Frame 示例只是消息/输入片段，不能作为完整工具栏 Chat 范例。公共 `components.html` 顶栏的小 AI 按钮也必须能够实际开合底部 Chat，不能只有内容区 Frame。业务节点、当前页签、编辑与 Chat 草稿、消息和提案保持挂载；收起不取消请求、不清除 busy/UNKNOWN 围栏、不自动重发。

应用外部辅助区模拟 ready/busy/error/blocked/review 与完成回复；输入、Send/Stop、反馈与审阅仍经 Frame/session，仅本页内存，不调用真实 ai、Provider、安装或持久化。Host 按钮在此为展示模拟，不冒充安装验证。

最短步骤（可直接复用）：

1. 先回放真实 consumer 的 AI 开合、底部 split 调整、收起焦点和重开草稿，对照当前失败或未验证点。
2. 核对公开合同与已有 Host 入口，按完整组合保留业务、Chat 与原请求状态；不以内容区 AI 配置加大 Frame 代替。
3. 使用原生成器输出新目录，保留工具、运行时、组件与 HTML 的来源 SHA，不手改生成 HTML。
4. 对同 SHA 候选保存截图与受影响行为的定向证据，含顶栏按钮开合、拖动/键盘分隔条及草稿保留；未执行项写 NOT_TESTED。
5. 本设计套件交付同目录五件套：`preview.html`、`components.html`、`component-recipes.md`、`chatgpt-prompt.txt`、`manifest.json`。已有工具的 `build-preview.mjs` 才使用 `preview.html`、`preview.manifest.json`、`preview.context.json` 合同；不混用两个入口或不同候选。将同 SHA 的截图和操作证据链接放回对应文档；未执行项不预填 PASS。

纯文档修订只检查链接与内容，不启动产品。离线迭代不默认触发 Browser build、安装、包晋升、真实 AI、提交推送或完整验收。本轮模板方案使用本页六维、每维 >95 的门槛；其他工具专项另有八维要求时归对应任务，不混作本轮分母。实际入口与参照一致、规范/来源可追溯仍是前提；旧 100/99 只是历史评分，不强行给分。

## 目标与关键验收条件

### 最新视觉反馈与框架事实（2026-11-01）

**以下为试点获批前的诊断历史。** 原生 Button/字段等“当前”描述及“尚未实施”顺序仅适用于当时源码；最新接线事实与待完成项以上方[官方风格试点合同](#官方风格试点合同2026-11-01)为准。原始用户反馈和旧评分保留，不因新增合同自动闭合。

**当前状态：基础预览交付与离线操作已有证据；视觉系统未定稿（PENDING_VISUAL_ACCEPTANCE）。** 本次用户明确指出按钮、输入框边框颜色和排版不佳，因此重新打开 K03/K09 的视觉判断。此前完成的“目标设置与证据核验”不代表公共皮肤已完成。此轮浏览器控制连接未能读回当前页，诊断使用同候选已有截图与当前源码；不记作新一轮浏览器操作通过。

当前依赖声明为 React/React DOM `19.2.0`、React Aria Components `1.22.1`、Tailwind CSS `4.3.3`。Shared UI 是 OpenDesk 自有组件层，不是独立第三方产品；`Button/IconButton` 当前为原生 button 的 React 封装，字段为原生 input/select/textarea + canonical CSS，Switch 才直接消费 React Aria。Card/Switch 有 shadcn 改编来源，**并不等于整套 shadcn 皮肤已经接入**。Tailwind 已列入构建依赖，也不代表这些控件由 Tailwind 决定外观。

官方在线参考：

- [shadcn React Aria Button](https://ui.shadcn.com/docs/components/aria/button)：对照主要、次要、描边与轻量操作、尺寸和状态；当前 OpenDesk 仅提供 primary/secondary/quiet/danger，不声称已导出官方全部变体或 size API。
- [shadcn React Aria Input](https://ui.shadcn.com/docs/components/aria/input)：对照字段、标签、帮助/错误和分组。
- [shadcn Dashboard](https://ui.shadcn.com/examples/dashboard)：参考真实内容下的导航与信息层级，不把宽屏页面直接缩成侧栏。
- [shadcn Create](https://ui.shadcn.com/create)：在线查看视觉主题候选。[React Aria 样式说明](https://react-aria.adobe.com/styling)明确交互基础默认无样式；[shadcn React Aria 基座更新](https://ui.shadcn.com/docs/changelog/2026-07-react-aria)是优先评估方案，不是本仓库已完成的集成。

诊断依据：公共 `--od-input-border:#7f8da1` 同时被次要按钮的 `--od-action-border` 复用，输入与次要操作的轮廓权重接近；默认按钮及字段标签均使用650字重。Cookie 在自身 `@scope` 内把输入/次要按钮边框映射到更浅的局部线色，并另有 compact/choice 密度；书签保留自己的按钮与连续列表布局。它们的成熟观感不是 React 自动产生的。已有截图还显示分组标题、字段标签、正文及导航层级接近；这些是视觉待办，不因同源样式对照通过而消失。

**建议的下一步（尚未实施）：**

1. 以官方 Button/Input 为控件参考，保留现有品牌与工具边界；先在原组件消费者中对照现有与候选。按钮分清主要、次要、轻量、危险确认，必要时再评估描边和密度接口；输入默认/hover/focus/error/disabled/readonly 各状态成组设计。减轻边框不能牺牲可辨识性：依赖边界识别控件时检查对比，键盘焦点仍清晰可见。
2. 用同一份资源数据制作一页完整列表→详情→编辑/设置的前后对照；拉开标题、正文、标签、次信息的字重/色彩层级，减少无必要表面和重复外框，保留原4/8/12/16节奏。只在控件小样好看不足以通过。
3. 视觉判断独立于来源/行为测试：先列当前缺陷和对应截图，再检查候选是否解决。保留旧评分；新候选未完成前不报新的95+。复评必须结合完整页面、状态与具体扣分理由，用户仍指出的明确问题不能由模型分数覆盖。
4. 候选确定后才由原 owner 修改唯一 Tokens/组件 CSS，核对受影响消费者，再用原生成器更新模板；Markdown维护语义/组合/反例，Skill维护入口和检查方法。只写 design-tokens.md、临时覆盖生成 HTML 或复制两工具整套 CSS 都不能完成此目标。本次仅记录诊断与方向，未修改公共皮肤、安装依赖或运行产品构建。

### 当前目标与完成判定（2026-11-01）

验收条件继续适用；下表证据状态仅记录 expert-patterns 旧候选。官方 Neutral 试点须按受影响项绑定新候选，当前判定为 PENDING，旧 PASS 不自动继承为新候选 PASS。

**目标：把 Cookie Editor、书签管理的成熟信息层级与交互，固化为可复用的扩展 UI 设计起点。** 沿用唯一 Tokens、真实 Shared UI、原组件消费者与生成器，交付能正确打开、内容充分、交互完整、来源可核对的预览和组合规范；两位独立 AI 架构/设计评审六维均严格 >95、无剩余发现。可执行数值归 CSS，Markdown 记录语义、组合与反例，Skill 提供发现/生成/验证入口。

本轮范围是**离线模板方案**。不因设置目标自动进入全产品皮肤改版、参考工具重写或安装发布。正常窗口、默认缩放；复用同一候选已有有效证据，不为重新设置目标重跑浏览器或产品构建。

| 关键测试条件 | 可判定的通过标准 | 当前证据状态 |
| --- | --- | --- |
| K01 · 预览实际可用 | 交付完整 `components.html / preview.html`；HTTP 200、`text/html`、响应 SHA 与 manifest 一致；实际看到代表性内容，完成一次打开详情→返回；有同候选截图 | PASS：已有 HTTP/IAB 回执；不能用源码 fragment、下载成功或截图独自代替实际交互 |
| K02 · 来源唯一且可追溯 | Tokens、共享控件、组合、生成输入及产物 SHA 对应；真实 owner 可定位；无平行 Token 值表、伪公共 API 或整套业务 CSS 复制 | PASS：本次只读复核所有已记录输入及两个 HTML，零漂移 |
| K03 · 内容与视觉足够评审 | 至少覆盖有长标题/摘要的分组列表、只读详情、主字段/可选备注表单、即时设置；主次动作清楚、单层集合与留白；宿主浅色、应用浅/深截图；同源控件样式对照 | REOPENED：内容/截图及29组样式对照仍有效；用户指出控件与排版不成熟，视觉待完善，不再整体记 PASS |
| K04 · 核心数据操作正确 | 搜索→无结果→清除恢复；新建→校验→保存；先读详情再编辑；保存A→改B→取消仍为A；删除取消不改数据、确认只改本页内存；设置实际改变列表分组 | PASS：原观察器中的对应操作；以真实点击/输入验证主流程 |
| K05 · 草稿、键盘与焦点 | 资源新建/编辑及删除确认期间保护切换/主题/重置；取消/Escape恢复触发者；改名不再匹配搜索时保留查询、解释并回退搜索框；字段 label/error 关联；Tab/Shift+Tab/Enter/Escape可用 | PASS：离线操作；组合输入 Escape guard 仅为合成事件验证，真实 Mac IME 为 NOT_TESTED |
| K06 · 状态可理解、可恢复 | 空态有下一步；读取失败、未授权、撤权、忙状态解释原因并阻止相关操作；状态切回就绪可继续；长文本可读；设置回执不串到资源页，清除搜索不残留旧解释 | PASS：对应模拟状态和恢复断言；模拟授权不等于真实权限通过 |
| K07 · 完整 Chat 核心组合 | 卸载旁 AI 入口开合底部 Dock；收起/重开保留草稿；Send/Stop与固定模拟回复可操作；键盘调整分隔条；关闭恢复入口焦点，业务视图保留 | PASS：离线核心操作；指针拖动及完整 Chat 异常状态矩阵未由本轮报告证明，记 NOT_TESTED |
| K08 · 隔离与兼容边界 | 预览只改内存，不调用真实网络、Chrome/Host/Provider或持久存储；CSP/来源负例有效，控制台无错误；不把预览壳/私有能力注入原工具，不新增原工具迁移要求 | PASS：离线行为、静态合同与来源核对；已安装 HTML/Vue/React 工具的原生兼容仍为 NOT_TESTED |
| K09 · 独立专家门槛 | 按本页既定六维，两位评审每维都 >95，且无剩余发现；评审与同一候选身份及证据绑定，保留原始意见，不按平均分或测试数量换算；明确用户视觉问题须闭合 | REOPENED：原架构/设计最低96保留为历史评审；当前视觉反馈尚未闭合，新候选及复评未完成 |

**完成规则：K01–K09 的本轮必需标准全部 PASS、证据身份一致、无未解决的本轮问题，才能声明“离线模板方案达标”。** 表中明确未测试的独立项不补写为 PASS，也不自动扩大为前置条件。测试项数量是观察器记录，不能直接换算为完成百分比或专家分数。

### 先前候选与证据（历史，不覆盖官方 Neutral 试点）

- 候选：[候选 manifest](../../artifacts/sidebar-preview-kit/expert-patterns-20261101-reviewed/manifest.json)；来源 Hash `d05b2b7634b37b318014496880630142bc441b0d426546b40a3106e35f60d8cc`；组件 HTML SHA `f6b5d8458b63f84f64657e7faf5f1406f038f1f1cfa087a4ec94a55c459061b9`。
- [定向浏览器报告](../../artifacts/sidebar-preview-kit/expert-patterns-20261101-evidence/browser-1793466702409/report.json)：150项检查、29组样式对照 PASS，HTTP请求和控制台/页面错误均为0；报告自身的观察器 SHA 已与当前源码只读核对。
- [交付回执](../../artifacts/sidebar-preview-kit/expert-patterns-20261101-evidence/delivery-reviewed.json)：同候选 HTTP 字节身份及 IAB 实际列表→详情→返回。此为本轮已有操作记录，不代表服务永久在线；再次发生无法打开时先核对实际 URL、服务及响应，不凭历史 PASS 判可用。
- [独立评审原文](../../artifacts/sidebar-preview-kit/expert-patterns-20261101-evidence/expert-reviews.json)：旧候选六维评分及当时问题闭合的历史记录，不证明本次导航缺陷已修复或新候选通过。39项 Node 合同为前次已执行记录，本次文档修订未重跑，也不将其数量设为固定门槛。

以上生成物与报告是本机本轮证据，不是已发布资产；换机器或清理 artifacts 后需恢复对应候选，不能将不存在的附件算为完成证据。本次仅核对当前文件身份、内容和链接，不重启浏览器、不刷新产品环境。

### 失效与重测触发条件

1. **仅改目标、说明或链接**：核对内容、链接及差异即可；无新失败、无来源变化，不重复有效产品或浏览器测试。
2. **模板、组合 JSX、控件/CSS、运行时或依赖实际变化**：原生成器输出新目录，不手修产物；运行受影响静态合同/行为检查，视觉变化更新对应截图；重新绑定独立评审，变化维度复评，未变维度复用须说明依据。
3. **输入、HTML、manifest、报告或评审身份不一致**：标记 STALE，暂停将该候选作为当前 PASS 交付；先定位漂移，不能只改 Hash 或混用旧报告制造通过。只暂停受影响的交付判断，保留其他并行工作。
4. **实际点击再次空白或报错**：先复现最短链，区分服务/URL/文件交付与产品故障，只修直接阻塞，再验证相同行为；不自动重装扩展或全量构建。

### 条件触发的后续验证

真实 AI 附件读取与生成回收、正式工具包、同候选 Native 权限/撤权/生命周期、production、原生 IME及已安装工具兼容均为 NOT_TESTED；在对应实际工具或发布任务触发后，才按原 owner 与适用合同验证。多档缩放、Side Panel 物理宽度矩阵、跨浏览器压力矩阵与本轮全量 CI 为 OUT_OF_SCOPE。保留既有历史证据，不删除、不将未执行项改成 PASS，不占用产品 watcher。

## 历史评分与后续实施（不作为本轮前置）

以下保留历史方案审查方法与路线，不作为普通离线预览的评分、真实模型交互、安装或完整验收前置；实际未执行项如实标记。

独立专家按六项分别 0–100 评分：需求与网页可达性、单一样式/漂移、交互/可访问性、隔离边界、测试/证据、可维护性。**每项 ≥95、无阻断项**才通过方案关卡；低分指出可执行缺口，修订后复评。不把平均分、测试数量或模型自评分当完成百分比。专家方案评分与 REAL_AI/原生产品评分分开。

实施顺序：

1. 历史 R1：生成/检查工具、模板、网页上下文、skill、定向回归、离线浏览器及独立专家审查。
2. 下一实际工具需求：用用户指定对话执行一次真实生成→回收→检查→修订，按上表保存证据；没有发送授权时不代用户发消息。
3. 产品入口接线：若真实使用证明必要，在 Workspace **显式设计预览**入口复用生成器合同，覆盖文件提案与读取回填两条路径；不塞进步骤 JSON planner。此项未实施。
4. 生产实现：按工具类型将已确认结构迁入既有源码；动态工具只在自身作用域映射 token/组件语义；可信 UI 由固定预编译入口接入。复用原打包、stage 和同候选真实 Chrome 验收。

当前状态、专家原文、原始日志和剩余项见 [R1 工作流](../framework/workstreams/sidebar-preview-kit-r1-20261015.md)。

## R1.9.5：正式工具栏与产品设置来源规则

先核对宿主已有返回/标题/主操作，再发现公开导航能力、最小真实消费者与受信准入，按[唯一导航合同](../architecture/sidebar-tool-navigation-contract-r1.zh-CN.md#开发与预览的接入及验证顺序)对齐工具与预览导航 Mock；能力存在，不能直接宣称 API 缺失。R2.2 仅短标题且路径只在 title/ARIA 的限制已被替代：同一宿主页头可见工具/子页路径，scrapyjs 为“scrapyjs 采集/配置库”，唯一返回配置库→采集根页→扩展列表。内容只保留业务，移除重复标题、用途说明、返回及同一主操作；不在内容里弥补受保护外壳的接入不足。旧候选接入根因见同一导航合同的根因与修复记录；正式 scrapyjs 不在导航准入中，实际安装接入仍为 `NOT_TESTED`，不得放宽准入，本次文档不宣称已修复。

对同候选的完整宿主视图核对可见路径、唯一返回、正确层级、未保存取消/保留、忙态/未知保护及焦点恢复；只截内容区、静态来源一致或旧候选分数不能证明完成。评分适用时在信息架构/交互及视觉冗余维度明确扣重复导航、标题/说明/主操作冗余，保留位置与理由，不用测试数量抵消；原生未测仍记 `NOT_TESTED`。此处规定后续验证方法，本次仅文档检查，不启动产品或评分。

对已有独立工具的正式 Side Panel 预览，返回、标题、产品设置和卸载属于**同一可信工具栏**，不能在工具内容区额外生成同名标题、Logo 或设置专属水平行。具备产品设置视图的正式工具应复用已存在的 `#sidebar-tool-settings-open`（如 AdBlock），与卸载按钮同排，原型模拟必须从固定宿主源得到按钮，预览中只更换模拟状态和 SDK 响应。标题和返回图标共享间距/字号来源，不能对某张离线 HTML 手工覆写公共外壳。修改此模板须同步来源锁并按受影响交互核对来源一致性与返回焦点，不默认执行宽度矩阵；只有 native Chrome 安装记录才可评价 DNR 等真实业务。

## R1.3：既有生产预览的轻量复用

对于已有正式工具，执行 `node scripts/preview/build-preview.mjs --tool quick-notes --surface side-panel --scenario success --theme light --width 360 --height 760`，输出 `artifacts/previews/quick-notes/side-panel-success-light-360.html` 及同名 `.context.json`。日常对话使用后者的短摘要，必要时提供完整正式 HTML。不要以仓库文件路径冒充 ChatGPT 已收到/执行了完整 HTML。

quick-notes 外部状态支持 `success / permission-denied / revoked / loading / empty / error / untrusted / long`，并提供工具主题与恢复；切换重建纯内存 iframe，明确提示会重置模拟数据，不表示真实授权，也不涉及真实结果未知（unknown）的操作；产品未知副作用保护保持原样。bookmark-manager 外部选择支持 `success / empty / error / loading / permission-denied / untrusted` 六种既有场景及 light/dark，切换同样重建内存 iframe；另保留专属外部 lab 的 8 项命令（含运行时 revoke/restore）。不支持 quick-notes 新增的 `revoked / long` 场景值，`revoke` 命令不等于 `revoked` 场景；其他工具未接入的控件明确不支持，不注入书签 lab。

简短自然语言入口：“**使用 OpenDesk 正式预览模板，设计一个 XXX 工具，直接在当前对话展示可交互的浅色 HTML。**” AI 先核对聊天执行能力：可运行原始完整 HTML 则记录 `SOURCE_HTML_INLINE`；只能用聊天组件实现近似则声明 `CHAT_ADAPTER_NOT_SOURCE_HTML` 并说明来源差异。已有工具优先正式源码同源，新增设计稿沿用 `sidebar-preview-kit.mjs create/check`。详细证据分层和交互清单以 [权威外壳文档](../architecture/browser-framework/ui-preview-shell-template-r12.zh-CN.md) 为准。
