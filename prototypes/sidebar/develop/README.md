# 开发页原型 · 审核记录

此目录保存 **OpenDesk Browser 五 Tab 中「开发」视图的离线交互原型**，并不包含可安装扩展的实际权限、运行器或真实 React 组件。

| 文件 | 作用 |
| --- | --- |
| `r2-full-preview.html` | R2 原始完整基线（保留旧的全部显式按钮和功能入口，用于回退与对照） |
| `r2.1-audited-preview.html` | R2.1 精简审计基线 |
| `r2.2-spacing-preview.html` | R2.2 间距整改基线 |
| `r2.3-clean-preview.html` | R2.3 参数去重与间距审计基线 |
| `r2.4-header-preview.html` | R2.4 页头与编辑器精简基线 |
| `index.html` | **R2.5 最新原型**：本地项目运行验证后按 Controller/Page 类型安装，支持只读管理及升级演示 |
| `preview-contract.test.mjs` | Node 静态回归：防止重复标题、覆盖补丁和功能 ID 缺失 |

## 设计原则与反方审计

- **不重复发明执行世界**：`Controller` 与 `Page` 是真实运行位置，不是两种并列的语言。默认只显示 `JS / React / Vue`；JS 可选「任务 / 网页」，React、Vue 属于网页组件，运行方式不在同一行重复出现。
- **不把 Git 当作运行发布器**：本地多文件源码版本由 Git 管理；浏览器端固定 `revision/sourceHash` 是任务运行、验证、安装和回执追溯所必需的快照，但不需要默认提供一套可见的“版本管理器”。高级入口在底部更多菜单；发布/安装始终要用户主动完成。
- **Page 自动安装不是日常编辑动作**：单次试运行 → 保存网页增强候选 → 检查并安装；只有候选存在才展示安装，只有安装后才展示启停与卸载；危险卸载有二次确认。已安装内容的日常管理应优先归于「扩展 → 网页增强」。
- **依赖/编译产物是技术证据，不是一个新功能入口**：自动处理 SDK/ESM 锁与 React/Vue 编译，平时不占编辑器首屏；需要排错时仍可从高级选项查看来源、校验、许可证与源码哈希。
- **SDK 不因开发者模式自动向网页越权**：开发者可信 Controller/Page 工作流尽量减少二次点击；网页 Main world 仍可能由第三方脚本调用 SDK。同源请求可用不代表跨站、持久存储、设备 ID 等权限自动授予。保留 exact Origin / documentId / Authority 执行时校验、撤销与不明状态只读检查。
- **间距符合现行宿主节奏**：相邻控件 8px，辅助说明紧邻 4px，独立章节 16px，卡片内部 12px；图标 34px，普通控件 36px，源码编辑区至少 216px，页面 gutter 单一所有者 11px。

## 离线交互证据与限制

R2.1 已在本次会话的 Chromium 静态页面环境做 **23 项交互断言全部通过**：默认单行切换、JS/React 模式回切、模拟 Run/Save/Page 发布阶段、撤销前确认、本地多文件预览、SDK origin 拒绝/审批/文档失效、Esc 关闭、420/360px 横向溢出等；该检查 **不是真实 Chrome 扩展 E2E**。

目前的 `index.html` 仍为原生 HTML/CSS/JS Mock。**不声称**它已通过 `scripts/sidebar-preview-kit.mjs check` 的正式模板合同，也不声称 React 19 / macOS Native 安装验收。下一轮需用仓库正式模板 / Skills 重建最终认可结构，并迁到既有 React 单一 Root / `od-*` 组件，不新增 React Root、不改授权 Authority 合同、不扩张业务范围。

执行参考：
- `.agents/skills/opendesk-extension-ui/SKILL.md`
- `.agents/skills/opendesk-ui-preview/SKILL.md`
- `docs/architecture/sidebar-design-system-r20.zh-CN.md`
- `src/ui/tool.html` / `src/ui/tool-shell.js` / `src/ui/sdk-approval.js`

## 下一步

1. 用户确认可见信息架构及截图；若有不满意，**只**修改当前 R2.3 对应区域。
2. 使用 `scripts/sidebar-preview-kit.mjs create/check` 或对应平台正式预览流程，通过既有浅色壳和设计 Tokens 输出来源可查、静态可 lint 的 UI。
3. 真正迁入已有 React 19 单一 Root；保留源码编辑器、RunHost、Page 运行、SDK Authority 和原有业务 DOM/事件语义，不用 Mock 覆盖真实操作。
4. CI Chromium + 本地 macOS Chrome 做 E2E；对任意未测试场景标注 NOT_TESTED，不伪造“95+ PASS”。

## R2.2 垂直节奏精修（2026-10-17）

- 当时的最新 HTML：`index.html`（R2.2，现已归档）；R2.1 原样归档为 `r2.1-audited-preview.html`，R2 原样归档为 `r2-full-preview.html`。不覆盖历史。
- **修复根因，而不是加负 margin 补丁**：把浏览器默认 `p/pre` 上下外边距归零；统一移除折叠区 `.fold` 自带的底部 8px margin，由所属区域统一管理 gap；SDK 抽屉 `.drawer-section` 不再把 `section-head` 的 margin 和 Grid gap 重复计算。
- **统一尺寸**：章节 16px、同组 8px、标签/说明 4px、卡片内 12px、图标按钮 34px、通常输入 36px、源码编辑器至少 216px。结果标题 / 当前运行状态 / 复制按钮合为同一个头部，源代码和说明为独立 `editor-code-group`，保留原功能 ID。
- **页面状态**：默认 JS Controller、Page 模式、React、Vue、本地多文件、历史展开、长标题、SDK 抽屉与高级权限，均仍由原离线 Mock 处理；这不是正式 RunHost/SDK 调用。没有修改 `src/ui/` 或权限 Authority。
- **实测差值**（Chromium 静态预览，420px）：运行结果模块由 193px → 165px；代码到说明 4px，说明到参数 8px，编辑区到运行结果 16px，结果正文到历史 8px，高级两折叠项间 8px，SDK 抽屉标题到正文 8px。
- **回归结果**：原有 23/23 个交互场景通过；新 75/75 个布局/状态断言通过（320/360/420px、长标题、折叠、模式、本地项目、SDK 抽屉、键盘 Escape 和页面/区域横向溢出），来自本会话本地 headless Chromium + Playwright 自测；不是独立外部专家验收。
- **仍需正式验证**：官方 `sidebar-preview-kit.mjs check` / 官方 Preview Shell、React 19 正式组件迁移、真实 Chrome Side Panel 和 Mac 原生验收均为 `NOT_TESTED`。非正式模板合同，不宣称已取得独立专家评分 95+ 或生产环境 95+。
- **后续注意**：生产 React 迁移必须复用正式 `--space-1/2/3/4` 和 `od-*`，**由布局父容器负责间距、取消子控件重复 margin**，保留已有精确文档授权与实际运行/安装语义。不要把 Mock 的静态状态误接入真实 Authority。

## R2.3 参数去重与间距合同（2026-10-17）

**本轮问题根因：** R2.2 的「参数 JSON（可选）」摘要右侧重复打印 `{"value":0}`，展开又有第二个「参数 JSON」标签；同时先前 R2/R2.1/R2.2 连续在样式末尾覆盖早期 CSS，导致 token、控件高度、间距所有权难以推导。过去只核对总 gap 与横向溢出，未将**可见文案重复**及**展开态 computed geometry**设为回归门槛。

**本轮变更：**
- 折叠标题只显示「运行参数｜可选」；展开后直接是带 `sr-only` label 的编辑框，JSON 数据不出现在折叠摘要里。格式错误时展开并聚焦编辑框、显示就地错误，输入纠正后自动清除错误。
- 保留 R2.2 视觉语言；把 R2.1/R2.2 的末尾覆盖并入原始 CSS 规则，`:root` 只存在一处；`viewport`、`page-head`、`fold>summary` 等均只有一个基础定义。取消冗余「当前网页」装饰标签与初始重复结果状态。
- 运行结果未生成前禁用复制；新建结果后启用。代码编辑器保留 Tab 缩进，Escape 后 Tab 可以离开输入框；窄屏 180/220px 的操作区自动折行；弱对比度元数据及未选中 Tab 文本提高到理论 WCAG AA 白底 4.5:1 以上（静态颜色计算）。
- **不删除原有业务入口：** JS / React / Vue、Controller / Page、独立本地项目、版本与任务候选、网页增强的安装/启停/卸载、SDK 按需授权、目标诊断等保留。R2.2 与 R2.1 旧文件均独立归档。

**本次同一候选的本地证据：** Chromium 144.0 headless，在 220/240/320/360/420/520 CSS px 下做 176 项静态/交互/布局断言，`176/176 PASS`，包含 420px 下 14 处关键内容间隔精确命中 4/8/16px，SDK 抽屉四处章节间隔均为 16px，模拟运行、错误恢复、Page 保存/安装/卸载、权限变更、焦点恢复等。GitHub 保留的 Node 静态合同有 8 项（含主动恢复重复标题的反例），本地等价 Node 候选脚本 `8/8 PASS`；**GitHub CI 运行此新文件尚未核实**。原有 R2.2 的 172 个 DOM ID 全部保留，新增一个 `params-error`。

**证据边界：** 此 HTML 仍是原生 HTML/CSS/JS 离线模拟，不是 React 组件，也不执行真实浏览器 SDK 或系统授权。官方 `scripts/sidebar-preview-kit.mjs check`、正式 React 19 迁移、独立外部专家评审、macOS Chrome 扩展实装均为 `NOT_TESTED`；不得将 176 项模拟断言或专家自评分称作正式产品 95+ 验收。

**下一步：** 使用 `.agents/skills/opendesk-extension-ui/SKILL.md` 和 `opendesk-ui-preview`，以 R2.3 的内容层级和间距合同迁入现有 React 19 单一 Root / `od-*` 宿主组件。先检查重复文案和可见性，再跑源码同源模板测试、Chromium 布局与实际 Mac Chrome；避免再次在 CSS 文件末尾追加覆盖规则。

## R2.4 页头精简（2026-10-17）

- 删除与顶部「开发」Tab 重复的可见 H1「开发」，保留无障碍专用「开发工作区」标题。
- 目标网页卡片已显示站点、URL、状态；删除重复的「运行目标」区块标题和「自动绑定」可见文字。隐藏的 \`#target-kind\` 保留为原型动态状态锚点；默认运行时仍按当前网页刷新并校验。
- 「当前草稿」源码 textarea 默认高度由最小 216px 改为 **164px**（最小 140px），保留竖向拖拽调整与已有源码内容；不添加额外编辑器按钮。
- 移除正文底部的版本及「离线预览」提示；**真实业务功能不受影响**。模拟跨站请求与只读授权状态按钮进入页头右侧 \`···\` 的「预览说明与模拟工具」菜单，默认不显示，点击外部或按 Escape 关闭并同步 \`aria-expanded\`，避免将模拟授权按钮误认成正式开发功能。
- 旧版 R2.3 原样归档 \`r2.3-clean-preview.html\`；其余 R2、R2.1、R2.2 基线仍保留，不改变 React、RunHost、SDK Authority 或正式工具源码。
- 本轮离线 Chromium 通过 320／360／420px 三种宽度的主要布局与交互冒烟测试：编辑器 164px、可纵向调整、页面无横向溢出、菜单开启/关闭与焦点返回、模拟运行和 SDK 抽屉；**这些检查仅代表离线 HTML**。本地 Node 静态合同测试 9/9 PASS；仓库 CI / 同版本真实 Mac Chrome 安装 / React 19 正式迁移仍 **NOT_TESTED**。

**预览入口**：\`prototypes/sidebar/develop/index.html\`。静态合同：\`node --test prototypes/sidebar/develop/preview-contract.test.mjs\`。官方源码同源模板、React 正式业务和权限仍是独立验收阶段。

## R2.5 本地项目验证后安装（2026-10-17）

**真实能力调查**：正式 `src/ui/local-project-install-ui.js` 和 `src/ui/local-project-install.js` 已实现运行成功之后通过既有 Task/Page Authority 审核并安装；`src/ui/script-editor.js` 本地模式会在得到确定的成功回执后启用「保存为任务 / 保存到我的工具」。此前 R2.4 预览切入本地模式后永久隐藏 `#save-btn`，旧「准备安装快照」误跳往技术性版本管理，且目的区域处于隐藏态。R2.5 **修复原型与正式能力不一致**，未改动生产源码。

- 本地 **Controller** 运行成功后，底部按钮显示「保存为任务」；名称、semver（如 `1.0.0`）和本次确切网站范围经审阅后，预览记录模拟安装到「我的 → 自动化任务」。
- 本地 **Page**（JS/React/Vue 对应 Page 程序）成功后按钮显示「安装网页增强」；名称、正整数版本与站点范围经审阅后，记录模拟安装到「扩展 → 网页增强」。明确提示：**正式 Page 验证会再次执行同一冻结程序，可能产生重复网页副作用**。
- 本地项目与直接编辑复用底部运行/保存操作区；选中项目但未运行、来源变化或页面导航后，安装动作不可使用。查看已安装版本、再次运行后识别同源同版本、演示更新不覆盖旧项目的能力均在原型中可点击。源码变化模拟入口仅在右上角预览菜单中，不属于生产 UI。
- 已安装固定版本不依赖始终连接本地文件；更改本地源文件需要重新运行并显式批准更新。安装失败或回执未知，正式实现必须只读核对，不盲目重试。真实源码是否可正式安装取决于原 Authority 验证证据：**Controller 仅返回数据不一定足以生成可安装任务，可能需要原生页面操作成功回执**。
- **不做三合一转换**：Page ≠ Sidebar Tool 应用，Page 安装到「扩展 → 网页增强」；有独立侧边栏 UI 的应用仍使用 Sidebar Tool 项目与官方包构建/安装流程，不由 Controller/Page 项目一键转格式。
- 为避免顶部「本地项目」模式开关与左侧标题重复，切换时标题改为「项目源码」；Page 不显示 Controller 的项目参数。安装审阅由原本隐藏且不可达的入口替换为独立的内联确认区域，保留取消、校验错误、键盘退出与焦点返回。滚动只修改 `#viewport`，不滚动整个 Side Panel 外壳，也不遮挡底部按钮。

**验证与证据等级**：本轮原型在无 Chrome 扩展权限的 headless Chromium 中，用真实点击测试了 220/280/320/360/420/520px 六种宽度、Page/Controller 分类、来源/网页变化失效、安装审阅、非法版本、安装结果、已安装管理、模拟项目升级与无横向溢出，**198/198 项断言通过**（同一离线模拟候选）。Node `--check` 对内联 JavaScript 通过，DOM 没有重复 ID 或远程脚本来源。仓库静态合同已追加 R2.5 检查，但这版最新测试在 GitHub CI / 同版本真实 macOS Chrome 中尚未执行。正式 UI 的真实 Native/Chrome 安装闭环仍标记 `NOT_TESTED`。

**重要限制**：本 HTML 是无持久化、无权限的离线 Mock，模拟安装结果只存在当前预览会话，关闭页面即失效。本文「已安装」指的是原型演示，并非真实 OpenDesk 安装回执。正式 R25.1 代码已具备对应流程，并不代表这一回合完成了新的正式功能验证。

**建议后续**：将 R2.5 的类目文案与按需安装入口对齐现有 React 19 开发 Tab / `src/ui/local-project-install-ui.js`；核对旧「保存到我的工具」文案是否应改「安装网页增强」，并在真实 Native Provider、Chrome 扩展、安装后重启、更新与权限撤销场景中完成产品验收。
