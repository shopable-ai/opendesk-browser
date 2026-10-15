---
name: opendesk-ui-preview
description: Generate and check an offline OpenDesk Sidebar App HTML design preview using canonical buttons and tokens, with an attachable ChatGPT prompt OR generate a source-bound offline preview from an existing installed tool package; not arbitrary website design.
---

# OpenDesk 规范化 HTML 设计预览

网页模型不会因仓库中存在 skill 就获得其中内容。给网页对话的是**实际生成的 HTML 附件和提示词全文**，不是本地路径或“已阅读规范”的声明。

先按根 AGENTS.md 核对 main、目标文件 diff、工作流与输出资源。新原型运行：

```sh
node scripts/sidebar-preview-kit.mjs create --out artifacts/sidebar-preview-kit/<本次唯一目录> --title "工具名称"
```

生成的 `preview.html` 内联当前 `src/ui/design-tokens.css` 与 `src/ui/design-system.css`；`chatgpt-prompt.txt` 可直接粘贴，HTML 须实际附给网页模型；`manifest.json` 保留输入与文件 SHA。输出目录已有时换一个新目录，不覆盖旧证据。

这是**独立离线设计文档**。只修改 `#od-preview-app` 内部 HTML 和 `#od-preview-behavior` 模拟 JS；保护其他区域和全部 CSS。用 od-* 公共组件，不另造按钮视觉。支持正常/空/失败/撤权/忙/长文本；主操作、表单错误、取消、危险确认和焦点恢复要实际可演示。实际扩展、Host/SDK、安装包与网站权限不在本阶段调用。

回收模型返回的完整文件后运行：

```sh
node scripts/sidebar-preview-kit.mjs check /absolute/path/returned-preview.html
```

失败则针对错误修订；过期则重生成并迁移两个可编辑区域。lint 通过只证明静态合同，不能证明任意 JS 安全、真实模型读取附件、视觉或原生功能。用独立离线浏览器上下文进行真实点击/键盘、深浅色与 computed style 检查，再独立评审方案；无证据项记 NOT_TESTED。默认不做缩放或 Side Panel 物理宽度专项测试。

完整目标、验收表、网页附件回收、生产迁移边界见 [预览套件合同](../../../docs/api/sidebar-preview-kit.zh-CN.md)。真实实现按 [应用开发 skill](../opendesk-sidebar-tool-dev/SKILL.md) 接续；不可把完整宿主 CSS/脚本从此设计文档注入动态工具 iframe，也不可把静态设计稿当作可安装包。独立方案评分逐维 ≥95 后才报告方案达标；产品通过须另有同候选原生证据。

## R32.3：平台原型、候选评估与结论回写

平台 UI、书签 Tree、反复失效的 Select/Combobox 或 React 选型任务，先读 [现行架构](../../../docs/architecture/browser-ui-r23.zh-CN.md) 的 R32.3 补充与 [续接 GOAL](../../../docs/framework/prompts/goal-ui-platform-r32.3-document-driven.zh-CN.md)。目标是复用成熟视觉和行为，不是每个工具重写树、菜单和焦点系统。

保留原生基线，优先制作书签 Tree/Select/Menu 的最小真实 React 候选。React Aria 与 Radix 加明确 Tree 方案均待验证，不以旧聊天评分封版，不强制制作七套完整产品或先重写五个 Tab。相同数据和场景下比较实际交互；HTML 模拟、实际库运行、静态 Chrome 与已安装工具证据分开。

旧容量是可调整的内部预算，不能在候选筛选前按旧值排除 React；实际容量变更由 [打包 Skill](../opendesk-sidebar-tool-package/SKILL.md) 接续全链一致性，不改变权限、CSP 或安装语义。按需构建并复用同源公共视觉，不能跨 iframe 借用宿主特权。

每阶段审计、原型、选型、预算实验完成后，立即写回架构与 [R32 工作流](../../../docs/framework/workstreams/ui-platform-r32-20261015.md)：状态、决定、理由、证据、版本、限制和下一步；合同变化再同步相关 Skill。用户已要求保存时正常提交授权 main 文档，不以下载文件代替。当前环境不能直接渲染 HTML 时，明确说明并生成完整可打开文件；不得假报模型已读附件或交互通过。

## 生产工具同源预览（Preview Contract R1）

**阶段区别**：前面的 `sidebar-preview-kit.mjs` 是可编辑的网页对话**设计稿**，并非正式工具组件。已存在真实独立工具时，使用以下**安装包同源预览**，不要把设计稿直接冒充可安装工具，也不要创建另一套 UI Skill。新增能力以 [生产预览构建/验收合同](../../../docs/architecture/browser-framework/ui-preview-contract-r1.zh-CN.md) 为准。

源码→共享资源→正式包→预览：`src/ui/design-tokens.css` / `src/ui/design-system.css` → `scripts/preview/shared-tool-design.mjs`（构建期提取非特权视觉规则）→ `scripts/build-sidebar-tool.mjs`（现有正式可安装包）→ `scripts/preview/build-preview.mjs`（同样的 HTML、CSS、业务 JS，只有 SDK 适配边界切换为内存 Mock）。本轮**只有 quick-notes / side-panel** 拥有真实适配；网页注入和独立页面请求必须报未实现，不能用 iframe 假装正式 ShadowRoot。

从仓库根目录执行：

```sh
node scripts/preview/build-preview.mjs --tool quick-notes --surface side-panel --scenario success --theme light --width 360 --height 760
node scripts/preview/check-preview-contract.mjs
node --test tests/environment/sidebar-preview-contract.test.mjs tests/environment/sidebar-quick-notes.test.mjs
```

可选 `--scenario success|empty|error|loading|permission-denied|untrusted`、`--theme light|dark`、`--width 320|360|400|480`，离线自包含结果在 `artifacts/previews/quick-notes/`。输入变动后**先重新生成并审核**，再显式 `node scripts/preview/check-preview-contract.mjs --update-lock`；CI 会依据原始正式资源与源码 SHA 检出陈旧产物。生成 HTML 不允许手修，Mock 无真实 Chrome/网络/存储/任务权限；动态内容仍走业务 JS 的安全文本赋值。不得替 sandbox 注入宿主完整 CSS。

必须运行非法自定义按钮样式与过期 Token 两项反例测试，记录 Node/CI 结果。Mac 实装 Chrome 和网页注入环境是另一证据等级：截图、计算样式、键盘交互、缩放及包身份没有验证，不写 95+ PASS。新工具应在最小范围实现正式共享 UI 及对应 Mock 适配，再扩大 CLI 允许范围；仍由原官方安装器管理权限和生命周期。


## R1.2：浅色 Side Panel 外壳模板（正式预览必须遵守）

先读 [预览模板与七步推进计划](../../../docs/architecture/browser-framework/ui-preview-shell-template-r12.zh-CN.md)。**预览外壳只有浅色**，禁止再添加主题选择器、手工深色 Palette 或给 AI 输出独立的黑白两套模板。正式扩展的暗色支持不改；旧 `--theme dark` 只可用于明确要求的工具暗色诊断，宿主预览外壳仍为浅色。

- 对话设计稿继续通过 `scripts/sidebar-preview-kit.mjs create/check` 调用 `scripts/templates/sidebar-preview.html`；不复制 CSS。
- 正式安装包同源预览通过 `scripts/preview/build-preview.mjs` 调用 `scripts/templates/sidebar-tool-preview-shell.html`。导航和工具页头必须由 `scripts/preview/sidebar-shell-source.mjs` 从 `src/ui/tool.html` 及正式 `tool-shell.css` 提取。禁止复制所有五个选项卡的内容、复制专用按钮 CSS，或把整套可信宿主权限脚本加入工具 iframe。
- 五个一级标签只作为可见上下文；预览中只有“扩展”有真实业务 UI。保留真实 Back/Title/卸载位置，卸载二次确认只关闭模拟 iframe，返回仅需精简的工具列表占位。列表中点击打开、在新标签打开等非关键流程默认省略；具体工具确需 Settings/网页注入开关时再按正式源码启用。
- 每轮至少检查正常、空、失败、权限不足、加载与不可信输入。对话中**直接展示可交互 HTML**并附上可打开的正式生成文件，未具备 HTML 执行能力就说明限制；只给图片、下载包或仓库 URL 不能代替当前上下文预览。
- 生成后执行 `node scripts/preview/check-preview-contract.mjs`、`node --test tests/environment/sidebar-preview-shell.test.mjs tests/environment/sidebar-preview-contract.test.mjs`；明确记载生产已安装 Chrome 尚未验证部分。模板/正式依赖修改后重新生成并审阅，不准手改生成的 HTML 解决视觉问题。

为了节省 AI 上下文，传递“工具/展示面/当前视图 + 关键状态/交互 + 设计来源与 commit/Mock 声明”的短提要即可；详细源码和编译产物留在仓库并按需加载。不要把 5 个 Tab、真实包 JS、全部 CSS 内联进每轮文字提示词。

## R1.3：聊天内交互展示与极简上下文（2026-10-15）

沿用前述 **两个既有生成器**，不再创建 HTML 框架、设计系统或总 Registry。详见 [模板的 R1.3 正式合同](../../../docs/architecture/browser-framework/ui-preview-shell-template-r12.zh-CN.md)。

- 日常入口：“使用 OpenDesk 正式预览模板，设计 XXX 工具，直接在当前对话展示可交互的浅色 HTML。” 先确认工具所属环境和已有源码；已有工具使用 `scripts/preview/build-preview.mjs`，全新设计稿使用 `sidebar-preview-kit.mjs create`。
- 正式工具生成时保存同名 `.context.json` 轻量文件，优先提供 `view/scenario/hostInteractions/source/simulation`，不把五个 Tab 的 JS/CSS 或整个业务包塞进每轮对话。
- **只有客户端确实载入正式生成 HTML 字节，才能宣称 `SOURCE_HTML_INLINE`。** 如果只可以用聊天交互组件近似还原，必须显著标注 `CHAT_ADAPTER_NOT_SOURCE_HTML`，报告差异，另外交付正式离线 HTML 路径。图或 URL 不算对话内交互通过。
- 正式 Side Panel 导航从真实宿主提取，预览时仅把 `aria-controls` 绑定到确实存在的模拟面板；模拟卸载明确不清理真实数据；取消/Escape 正常恢复触发按钮焦点。
- 离线 Node、Headless Chrome、用户 Mac 已安装扩展是**三种独立证据**。无同候选 Mac Chrome 记录，`NATIVE_CHROME=NOT_TESTED`，不得用静态评分补齐。


## R1.4：预览诊断区必须在工具之外（2026-10-15）

有正式工具的 Source-Bound Preview 严格划分 **实际工具区域** 与 **离线预览辅助工具**：

- \`src/index.html\` / 正式安装包 / \`iframe#opendesk-preview-frame\` 只包含生产业务 UI。**禁止**将“预览实验台”、模拟权限切换、故障注入、测试菜单、CI 操作按钮插入工具容器、详情、页面顶部或 sandbox iframe，即使它们标注“不是正式工具”也不行。
- 诊断 UI 只允许由 \`scripts/preview/build-preview.mjs\` 在外部 \`sidebar-tool-preview-shell.html\` 的 **\`.preview-device\` 之外**按工具 ID 显式构建。默认折叠、明确“非正式工具”，真实截图/用户观察首先呈现不带诊断的正式 Side Panel。临时故障注入不得改变正式 SDK/Host、权限、发布包或浏览器持久数据。
- 若外层诊断需要改变离线 iframe 的测试状态，只能调用工具专有的 Mock 允许列表，经有界的仅预览消息协议发送到 opaque iframe，核对来源 WindowProxy 和离线确认消息；不得借 \`allow-same-origin\`、直接 \`chrome.*\`、外部网络、跨世界 DOM 访问或通用特权 Bridge。
- Chrome 回归须分别断言：真实包内无实验台；生成 frameHtml 内无实验台控件；外部 \`.preview-device\` 之外可找到实验台；控件点击只修改 Mock 内存。用户点击书签行只查看只读详情；仅“编辑”操作进入输入态。编辑草稿未保存而选其他行时，先显示清晰的放弃/保留决定，不得把新行呈现为仍在编辑的表单。
- 实验台不属于生产 UI 视觉评分范围；CI Chrome Mock 只能证明模拟交互，Native 扩展安装/CRUD 必须另有相同候选身份的证据。共享模板源码锁变化需审查后按 Git blob 核实，绝不随意哈希重算制造通过。
