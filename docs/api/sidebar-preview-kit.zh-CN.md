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

`create` 输出三个文件：

| 文件 | 用途 |
| --- | --- |
| preview.html | 自包含设计稿，包含规范 CSS、可编辑内容/模拟 JS、应用外部状态/主题/恢复控件、真实来源导航与工具栏，以及新建/编辑/取消/删除确认示例 |
| chatgpt-prompt.txt | 粘贴到网页的生成约束；仍需附上 HTML 实际内容 |
| manifest.json | 输入 SHA、HTML SHA 与证据等级；不是权限或信任凭据 |

在用户指定的既有 ChatGPT 对话中，由用户附上 `preview.html` 并发送提示词及工具需求；本工具不自动发消息、不读取凭据。模型须先列需求/视图/组件映射，再返回完整 HTML。若网页无法读取附件，明确缺失并改为用户粘贴完整文本；只给本地路径、模型自述“已遵守”、对话缩略预览均不能证明模型接收了规范。仓库 skill 为 `.agents/skills/opendesk-ui-preview/SKILL.md`。

模型回收时只允许改 `#od-preview-app` 内部，以及 `#od-preview-behavior` 中 `/* DESIGN_APP_BEHAVIOR */` 标记之后的工具模拟逻辑；标记及前面的共享宿主交互由 check 保护；全部 CSS、外壳、外部模拟声明、CSP 和源身份保持原样。仓库模板维护允许增加真正通用的外部辅助区，并同步保护区与来源锁；专有故障注入仍仅在目标 adapter 实现。需要额外组件或布局时先在仓库评估真实缺口，扩展模板并重新生成，不在模型结果中临时覆盖颜色/圆角/按钮。预览可在普通浏览器独立打开；Workspace 的静态 HTML 净化预览会移除执行入口，不能据此判定本交互模板坏掉。

两个生成器通过 `scripts/preview/sidebar-shell-source.mjs` 共用真实 `src/ui/react/` 导航/工具栏及 `src/ui/tool-shell.css`。SSR 当前含 7 项，预览只显示「我的 / 扩展 / 工作流 / 开发 / 云控」正式五 Tab，不按固定 SSR 总数判断；隐藏 `app-debug` 等调试项目不载入业务。设计稿保留可编辑应用区域；返回、工具标题、模拟卸载取消/确认及恢复沿用真实外壳位置，取消/Escape 恢复触发按钮焦点。

设计稿外部辅助区演示已授权、未授权、撤权、加载、空、失败、长文本与恢复，授权均为模拟；light/dark 只改变应用，宿主永远 light。预览说明、状态/主题控件与“重置模拟数据”操作不放入应用内容；内容不重复工具标题或对象/检测说明，刷新放所属区域右上角。正式工具源码、安装包及 iframe 不含这些辅助控件。顶部正式工具标题已有 `role="heading"`，应用内不再放 `h1`；检查器会拒绝内容区的 `h1`。设计稿未保存表单期间禁用外部状态/主题/恢复，取消或 Escape 返回后恢复这些控件。

检查器验证当前源哈希、保护区、样式快照、重复 ID、按钮/输入语义、脚本语法及明显真实能力调用。任一失败 CLI 返回非零。过期模板保留原件，重生成后迁移内容并重验；不重写历史 manifest。未锁定任意 JS 的运行效果：静态 lint 和文档 CSP **不是不可信代码安全执行器**，通过检查也不能免除源码审阅与独立浏览器观察。

模板的可复现实测入口（复用已有 Playwright/CFT；不自动下载依赖）：

```sh
node scripts/tests/sidebar-preview-kit-browser.mjs <套件目录> <新的独立证据目录>
```

环境没有仓库级 Playwright 时，用 `OPENDESK_PLAYWRIGHT_MODULE` 指向现有 `playwright/index.mjs`；需要选择已有 CFT 时，用 `OPENDESK_PREVIEW_CHROME_BIN` 指定其可执行文件。观察器新建独立上下文、读取 canonical CSS 建立另一参考页，并在结束时关闭浏览器。原始报告绑定其记录的源文件、HTML、观察器 SHA、浏览器版本与平台。此脚本验证模板示例；改为实际工具流程后须同步该工具的用例，不能把模板按钮用例当作任意生成界面通过。

## 组件与组合的直接入口（2026-10-30）

同一个 `sidebar-preview-kit.mjs create` 现在输出五个文件：`preview.html`（可编辑设计稿）、`components.html`（可操作共享组件示例）、`component-recipes.md`（HTML/JSX 接入片段）、`chatgpt-prompt.txt`、`manifest.json`。从设计稿应用外部的「打开可操作组件与用法」进入示例；两个 HTML 同目录离线打开即可。给网页模型时附上设计稿和用法文件，不能只给本地路径。

示例不是新 Atlas 或组件库；完整设计参考仍在 [既有统一入口](../../prototypes/sidebar/extension-ui-showcase/index.html)。最小运行消费者为 [sidebar-component-recipes.jsx](../../scripts/preview/sidebar-component-recipes.jsx)，直接导入真实 `Button / IconButton / Card / CardContent / Switch` 源码，用当前 React/React Aria 编译；生成器复用同一宿主壳。`manifest.componentReference` 保存 HTML/用法 SHA 及编译源/依赖 SHA。证据为 `SOURCE_COMPONENT_PREVIEW`，不代表已安装的 `sidebar-shared-ui.js` 或正式工具包通过。组件源码仍只归 `src/ui/react/components/ui/`，没有新增共享 API 或依赖。

| 用途 | HTML 设计稿与工具 | React 工具 |
| --- | --- | --- |
| 主要 / 次要 / 轻量 / 危险按钮 | `od-button` + `--primary / --secondary / --quiet / --danger` | `Button variant="primary / secondary / quiet / danger"`；默认 secondary |
| 卡片与内边距 | `od-shared-card` → `od-shared-card-content` | `Card` → `CardContent`，同一 CSS |
| 字段与帮助/错误 | `od-form-field` → `od-field-label`、`od-field`、`od-field-help/error` | 当前同样组合原生 label/input 与 canonical CSS；无共享 Field/Select 导出 |
| 正常 / 空与加载 / 失败 / 权限撤权 | `od-note / od-alert / od-alert--error / od-alert--warning`，配合 status/alert | 同一原生语义与显式编译的 canonical CSS |
| 开关 | 保留原生 checkbox 基线 | 真实 React Aria `Switch`，传 `isSelected / onChange / isDisabled` |
| 删除确认 | Card + 对象/后果 + secondary 取消 + danger 确认 | 相同组合；没有新增 Dialog API |

模板默认使用上述字段、Card 和状态组合；独立分区 16px、区内 8px、CardContent 12px；刷新位于所属区右上角。列表低频删除用 quiet，确认才用 danger。空值错误关联 `aria-describedby / aria-invalid`，修正时清除；确认默认焦点在取消，取消/Escape 恢复触发者。检查器拒绝未知/冲突按钮变体、悬空描述引用及移动/改写保护区参考链接；原有来源、CSP 和宿主脚本前缀保护继续有效。

正式 HTML 工具在自身 CSS 保留原有 `/* @opendesk-shared-design */`，由 [唯一构建期提取器](../../scripts/preview/shared-tool-design.mjs) 输出 canonical 原语和同源 Card 子集，无需另抄卡片样式。React 工具复用已有 `@opendesk/ui` 运行时与项目编译入口，例如 [quick-notes-react](../../projects/quick-notes-react/README.md)。该运行时自动提供 Button/Card/Switch 样式，**不自动提供全套表单与布局 CSS**；需要的 od-* 通过工具原静态 CSS 构建显式提取，不把整个宿主 CSS/权限脚本注入 iframe。新提取规则只影响后续候选生成，不替用户升级已安装包。

当前没有统一沙箱 Menu/Tree/Combobox/Dialog API；组件示例不声称这些能力已封装。HTML/Vue/React 原工具、安装身份及数据保持原合同。真实 Chrome 安装、权限、Native、生产发布和真实 AI 附件回收均为 NOT_TESTED。

## 目标与关键验收条件

| 目标 | 关键条件 | R1 的证据范围 |
| --- | --- | --- |
| 样式来源唯一 | 内联 CSS 与 canonical 文件逐字一致；伪造/过期源、按钮覆盖、新 style 拒绝；保存实际输入 SHA（含 React 外壳来源） | 定向 Node 合同 |
| 模型确实获得规范 | 实际网页对话收到 HTML 内容与提示词；返回同源完整文件；保留请求/回答、返回 HTML SHA、模型可见附件事实 | REAL_AI，未执行则 NOT_TESTED |
| 用户流程可走通 | 新建→空值错误→保存；编辑→取消不改数据；编辑保存；删除→取消与确认；空态可恢复；失败/撤权/忙禁止编辑；长文本可读 | 独立离线浏览器真实输入，不用 DOM 赋值或 synthetic events |
| 交互与无障碍 | 顶部正式标题提供 heading、应用无重复 h1、每视图一个主要操作；label/error/status 关联；键盘 Tab/Shift+Tab/Enter/Escape；表单与确认返回后焦点正确可见、长列表滚动位置恢复；禁用态真实 | DOM/可访问树 + 键盘与焦点观察 |
| 视觉一致 | 宿主浅色、应用按支持切换 light/dark，以及 hover/focus/disabled 状态；按钮、图标、输入、卡片、折叠与同源 CSS 参考的 computed style 相同；截图人工复核 | STATIC_PREVIEW_CHROME，仅证明设计稿 |
| 隔离与迁移 | 无网络/真实 Chrome/SDK/文件或持久数据；模拟不报原生成功；不得把宿主 CSS/脚本注入运行时动态 iframe | 静态负例 + 浏览器网络/控制台观察；实际 Host 另验 |
| 真实安装产品 | 按原项目打包、保留既有 opaque-origin iframe/可信静态模块边界；同候选权限、撤权、生命周期与核心操作通过 | NATIVE_CHROME / PACKAGE，不能用原型替代 |

正常窗口、默认缩放；多档缩放和 Side Panel 物理宽度矩阵为 OUT_OF_SCOPE。保留既有相关历史测试，不删除、不标成此次 PASS。离线预览不占用 Browser 开发 watcher，也不要求重建扩展。

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

对已有独立工具的正式 Side Panel 预览，返回、标题、产品设置和卸载属于**同一可信工具栏**，不能在工具内容区额外生成同名标题、Logo 或设置专属水平行。具备产品设置视图的正式工具应复用已存在的 `#sidebar-tool-settings-open`（如 AdBlock），与卸载按钮同排，原型模拟必须从固定宿主源得到按钮，预览中只更换模拟状态和 SDK 响应。标题和返回图标共享间距/字号来源，不能对某张离线 HTML 手工覆写公共外壳。修改此模板须同步来源锁并按受影响交互核对来源一致性与返回焦点，不默认执行宽度矩阵；只有 native Chrome 安装记录才可评价 DNR 等真实业务。

## R1.3：既有生产预览的轻量复用

对于已有正式工具，执行 `node scripts/preview/build-preview.mjs --tool quick-notes --surface side-panel --scenario success --theme light --width 360 --height 760`，输出 `artifacts/previews/quick-notes/side-panel-success-light-360.html` 及同名 `.context.json`。日常对话使用后者的短摘要，必要时提供完整正式 HTML。不要以仓库文件路径冒充 ChatGPT 已收到/执行了完整 HTML。

quick-notes 外部状态支持 `success / permission-denied / revoked / loading / empty / error / untrusted / long`，并提供工具主题与恢复；切换重建纯内存 iframe，明确提示会重置模拟数据，不表示真实授权，也不涉及真实结果未知（unknown）的操作；产品未知副作用保护保持原样。bookmark-manager 外部选择支持 `success / empty / error / loading / permission-denied / untrusted` 六种既有场景及 light/dark，切换同样重建内存 iframe；另保留专属外部 lab 的 8 项命令（含运行时 revoke/restore）。不支持 quick-notes 新增的 `revoked / long` 场景值，`revoke` 命令不等于 `revoked` 场景；其他工具未接入的控件明确不支持，不注入书签 lab。

简短自然语言入口：“**使用 OpenDesk 正式预览模板，设计一个 XXX 工具，直接在当前对话展示可交互的浅色 HTML。**” AI 先核对聊天执行能力：可运行原始完整 HTML 则记录 `SOURCE_HTML_INLINE`；只能用聊天组件实现近似则声明 `CHAT_ADAPTER_NOT_SOURCE_HTML` 并说明来源差异。已有工具优先正式源码同源，新增设计稿沿用 `sidebar-preview-kit.mjs create/check`。详细证据分层和交互清单以 [权威外壳文档](../architecture/browser-framework/ui-preview-shell-template-r12.zh-CN.md) 为准。
