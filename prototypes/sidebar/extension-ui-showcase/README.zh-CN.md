# Extension UI Design System · 当前执行入口（2026-10-27）

**最高目标：** 为开发者和 AI 提供 Foundation → Components → Patterns → 6 Business Recipes → Developer/AI Guide → Source & Proof。组件系统优先，不再把 Bookmark Tree 当成 P0 或 UI 风格模板。

**唯一入口：** [index.html](./index.html)（直接转到原有 [Source-Aligned Atlas](./r27-source-aligned-atlas.html)；不再维护独立第二套色板与展示框架）。Atlas 默认 Components，首先显示已有 React 编译预览，再显示可检索目录、来源类型与适用/反模式；Foundation 仍是第一项规范分类；Guide 提供可信 React、独立 HTML 与 Vue Tool 最小示例及三种任务的选型。全部是参考资料，不会安装应用或申请 Host 权限。

**可复用现状（截至审计起点 05808f0）：** 共享 React=Button/IconButton、Card/CardContent、Switch；其他由正式 CSS、React Aria、业务 React、沙箱 Tool 提供，且保持真实等级。P01–P16 与六业务复用原页面；R2.8 Tree 是历史业务参考，非同源当前验收。预览编译产物在仓库中存在（约 1.6 MB），但构建输入 SHA 与当前 main 的一致性、320–960px/200%/键盘/Chrome **NOT_TESTED**。禁止把本页编辑或 Node 检查当成产品 95+ 通过。

## R3.0 · 真实 React 预览优先与窄屏导航差量（2026-10-27）

- **现有主入口不变：** `prototypes/sidebar/extension-ui-showcase/index.html` → 原 `r27-source-aligned-atlas.html`。没有第二个 Atlas、React Root 或共享组件库。
- **组件优先：** 默认 Components，原 `scripts/preview/build-sidebar-six-react-preview.mjs` 产物在目录之前；22 类参考及 P01–P16 原位保留。预览能显示不代表已通过最新源码同源校验。
- **窄屏真实缺口：** 原导航在 ≤740px 强制横向滚动，iframe 固定 360px 且 `max-width:none`。现改为窄屏章节选择器 + iframe `max-width:100%`，并显示请求宽度与实际宽度。请求 960px、容器不足时不会冒充精确 960px 视口。
- **可见失败：** Atlas 探测同源 iframe 是否挂载 `.od-demo-gallery`；未检测到或因来源隔离无法读取时，提示独立打开，绝不将 iframe `load` 当作正式 Chrome 验收。

**本地查看（必须从仓库根目录启动 HTTP 服务，不通过 GitHub Raw 链接打开 HTML）：**

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
python3 -m http.server 4173 --bind 127.0.0.1
# 浏览器打开：http://127.0.0.1:4173/prototypes/sidebar/extension-ui-showcase/index.html
```

**同源候选检查：** `node scripts/preview/build-sidebar-six-react-preview.mjs --check`。只有该命令通过才能把现有 `react-preview/index.html` 当作当前源码产物；失败时由本地 Codex 审核原构建依赖后使用同一脚本再生成，避免覆盖并行工作。仓库连接不等于本地 Mac Chrome，320/360/400/440/960、200% 放大、焦点、菜单、Dialog 和实际截图仍为 `NOT_TESTED`，需本地验收。

**权威文档：** [设计决策与开发复用契约](../../../docs/framework/extension-ui-reference-patterns-r25.zh-CN.md)；[P01–P16 Layout Recipe](../../../docs/framework/extension-ui-layout-recipes-r25.zh-CN.md)；[执行边界与组件所有权](../../../.agents/skills/opendesk-extension-ui/SKILL.md)。历史 R2.8 以下保留作审计来源，不再作为下一轮实施优先级。

---

# 历史记录 · R2.3 → R2.8（只读，非当前 P0）

## R2.8 · 真实 React Tree 优先与评分纠偏（2026-10-26）

**唯一继续使用的 Atlas 文件：** [R2.8 React-first Atlas（修改原 R2.7 HTML，而非重新创建）](./r27-source-aligned-atlas.html)。默认进入 Components，首屏嵌入已有的 Bookmark Manager React 编译 Tree；Patterns 新增 P01–P16 逐项分级。

**P0 结论：CURRENT_SOURCE_NOT_TESTED / NOT_PASSED。**

- 正式 Tree：`examples/sidebar-tools/bookmark-manager/src/react/App.jsx`；CSS：`src/react/style.css`（不是旧 Classic 的 `src/style.css`）。文件夹层级、直接子项数量、搜索、展开折叠、选中、方向键、Home/End、F2 均已有实现；大于 120 行时启用 44px 虚拟化。
- 现有批准离线 React 预览：`examples/sidebar-tools/bookmark-manager/preview/index.html`。最后更新 2026-10-17；manifest 的 `reactRuntime=true`、`mock=true`、`sourceBound=false`、`nativeVerified=false`、`toolVersion=0.3.8`。它确实使用编译 React App，但只是**旧版 Mock 渲染**。
- 正式 App.jsx 2026-10-26 仍有修改；当前正式包 0.3.12 的安装尚未获本次 Chrome 证据。旧 React 预览不能代替新版源码、Host 授权或原生书签验收。
- P01–P16 的精确状态和原因在 Atlas 的 **Patterns** Tab。`REAL_REACT_RENDERED` 的 P05/P06/P15 仅指历史 React 预览，其余为 `DOCUMENTED_ONLY` 或 `SIMULATED_ONLY`；本轮 **0/16** 项达到同候选真实浏览器证据，`REAL_TOOL_RENDERED` 无新增证据。没有凭空创作新的 Tree/组件库。

### 正式差异清单

| 优先 | 差异 | 处理 |
| --- | --- | --- |
| P0 | R2.7 默认不是 Tree，模拟 R2.6 Tree 容易被误认作共享 React Tree | 已在现有 Atlas 首屏接入原 React 编译预览，明确历史版本与 Mock 属性 |
| P0 | 旧批准 React 预览截至 10 月 17 日，正式 App.jsx 于 10 月 26 日更新 | 待执行原 `preview/react/build-preview.mjs` 生成 `dev.html`，通过 `preview:check` / `preview:chrome` 再按既有审批流程晋升 |
| P0 | 当前 React/HTML/Vue Tool 的业务实例与可信组件不等价 | 已在 Atlas 分层标记 Shared React、Host CSS、Business React、Tool React/HTML、Simulated |
| P1 | 正式 `.bm-count` 在 <=349px 被 CSS 隐藏，740px 改用并排 Inspector | 320/360/400/440/960px + 200% 需真实核查，再决定必要的最小修复 |
| P1 | 当前 React Tree 的按键、ARIA、滚动与独立安装版本没有新候选证据 | 本轮 NOT_TESTED，不引用旧 CI 冒充 PASS |

### 八维静态初评（满分 100，每维独立，非浏览器验收）

| 维度 | 分数 | 状态 |
| --- | ---: | --- |
| 正式视觉一致性 | 78 | 当前浏览器对照 NOT_TESTED |
| 组件覆盖 | 38 | 真实组件库仅 Button/Card/Switch；P0 未通过 |
| 布局模式 | 80 | 16 Pattern 已分类，大部分尚非同源渲染 |
| 业务交互 | 57 | 旧 React Tree Mock 存在，最新版实际业务未验 |
| 响应式 | 59 | CSS 断点可读，当前视口/缩放 NOT_TESTED |
| 无障碍 | 61 | 有 ARIA/键盘处理，当前焦点和读屏 NOT_TESTED |
| 源码可复用性 | 82 | 单 Root/唯一 Tokens，跨 Tool 复用仍受隔离限制 |
| 真实性与验收证据 | 74 | 已区分真实与模拟，尚无本轮 Chrome 回执 |

**静态初评平均：66.125/100（约 66.1）。** 这是证据约束下的阶段评估，不能宣称八维独立专家已评到 95；正式验收为 NOT_TESTED / P0_NOT_PASSED。严格门槛仍为每项 >=95 且有对应真实证据，不以旧 Mock/旧 Chromium 替代。

**下一实际动作：** 保留所有 R2.3–R2.7 的有效结果，优先用现有 React 构建脚本编译新 `dev.html`、检查与最新 App/CSS 对应的 SHA，验证书签真实 Tree、计数/折叠/搜索/键盘/虚拟化，再进行正式产品必要差量修复。已批准的 `preview/index.html` 不经已有 Chromium 审批不得手动覆盖。

---


> **用途：设计与交互审阅；不代表正式安装、Host、Chrome 或 React 运行验收。** 此目录不是新 UI 框架、组件包或第二个 React Root。

## 直接打开哪一个？

| 入口 | 角色 | 真实性 |
| --- | --- | --- |
| [R2.6 业务优先交互参考](./r26-business-layout-review.html) | 六类业务入口直接进入完整页面；参考 R2.4 的核心编辑/菜单/保护流程，收敛 R2.5 Group/Pattern 到折叠说明和真实源码逐行摘录；320/360/400/440/960px、深色、长文本与模拟写入故障 | **`CHAT_ADAPTER_NOT_SOURCE_HTML`**；GitHub `main` 已保存、内嵌 JS 语法解析 `PASS`；真实浏览器交互/视觉/焦点 `NOT_TESTED` |
| [R2.5 Layout Pattern / Group 互动参考](./r25-layout-patterns.html) | 16 个布局模式、6 个真实业务映射、右侧源码摘录，支持 320/360/400/440/960px、主题、长文案与恢复状态 | **`CHAT_ADAPTER_NOT_SOURCE_HTML`**；源码已保存、JS 语法解析 PASS；真实浏览器交互 `NOT_TESTED` |
| [正式 React 同源 Showcase 外壳](./index.html) | 装载现有 [React 离线预览产物](../react-preview/index.html)，作为真实源码对照 | `UI_PREVIEW_ONLY`；需先由既有构建流程生成/更新产物 |
| [R2.4 业务导向交互预览](./r24-business-review.html) | 开发、扩展管理、Prompt Shortcuts、书签、Cookie、语言及输入细节；含独立子页/错误状态 | **`CHAT_ADAPTER_NOT_SOURCE_HTML`**，独立内存模拟，不是 React 构建 |
| [R2.3 六场景聊天适配预览](./archive/r23-web-chat-adapter.html) | 历史控件行为、语言、资源、FormRow、菜单、状态对照 | **`CHAT_ADAPTER_NOT_SOURCE_HTML`**；保留用于比较，不推荐作为新 UI 基准 |
| [R2.3 固定 blob 获取器](./archive/r23-source-html-loader.html) | 获取历史 Git blob `e2796f4…` 对应的原始 React 离线 HTML | 历史固定 SHA 与大小；**不是最新 `main`**，首次使用需要 GitHub 网络连接 |

### 直接可用与不可证明的事项

- R2.4 文件为单文件 HTML，内嵌样式、交互与**演示数据**；本轮保存的是此前生成并审阅过的字节，并未修改正式功能。
- R2.4 演示不能读写 Chrome 权限、正式工具存储、Host 或安装器；模拟“保存”“授权”“导入”“运行”只改变预览数据或状态。
- 同源 React Showcase 仅证明对应构建候选的 React UI 行为；没有当前候选浏览器证据时，视觉 / 键盘 / 200% / Mac Chrome 均记 `NOT_TESTED`。
- R2.3 和 R2.4 均是**归档，不相互覆盖**。未来设计迭代另建版本化预览并按证据晋升，不能把 R2.4 适配器直接替换正式 React 入口。

## 原始目标与 R2.5 补足方向

核心目标不是“更多控件”，而是**让独立扩展开发者利用现有 UI 契约，快速选到合适的布局、组件组合和完整交互代码**，并与正式 OpenDesk 的五个 React Tab 保持一致的视觉语言；保留 HTML/React/Vue 旧扩展和 SDK/Host/Installer 兼容。

R2.4 的业务布局已有价值；缺口是 **Group/Section/Form/Toolbar/List/Detail/Action/State 等可复用组合模式的有组织索引、真实源码示例和开发选型说明**。

R2.5 新增参考成果：
1. [完整可点击 HTML（版本化，不覆盖 R2.4）](./r25-layout-patterns.html)
2. [按业务找 Pattern / 真实源码索引](./r25-source-index.zh-CN.md)
3. [16 Pattern、Group 选型与可复用源码 Recipe](../../../docs/framework/extension-ui-layout-recipes-r25.zh-CN.md)

历史设计入口（保留供对照）：[R2.5 原设计矩阵](../../../docs/framework/extension-ui-reference-patterns-r25.zh-CN.md)、[前一轮 R2.5-WEB 执行提示词](../../../docs/framework/prompts/goal-extension-ui-pattern-library-r25-web-20261026.zh-CN.md)。正式 React/Chrome 验收及任何生产修复尚未执行。

### 源码真相和所有权

- 统一 Tokens：[design-tokens.css](../../../src/ui/design-tokens.css)；宿主样式：[design-system.css](../../../src/ui/design-system.css)。
- 正式可信 React：[src/ui/react/](../../../src/ui/react/)；真实 UI 组件：[components/ui/](../../../src/ui/react/components/ui/)。
- 主业务参考：[开发](../../../src/ui/react/tabs/develop.tsx)、[扩展中心](../../../src/ui/react/tabs/tools.tsx)、[ToolHost](../../../src/ui/react/tabs/tool-host.tsx)、[语言管理](../../../src/ui/react/tabs/locale-manager.tsx)。
- 独立扩展示例：[Prompt Shortcuts](../../../examples/sidebar-tools/prompt-shortcuts/)、[Bookmark Manager](../../../examples/sidebar-tools/bookmark-manager/)、[Cookie Editor](../../../examples/sidebar-tools/cookie-editor/)。
- **不可把 `design-tokens.css` 当成允许注入独立 iframe / 网页的公共全局 stylesheet。** 沙箱工具只复用获批准的扩展样式契约或自身受限样式。

## R2.6 优先使用与复用边界

- **默认先打开 [R2.6 业务参考](./r26-business-layout-review.html)**：选择扩展管理、提示词、书签、Cookie、开发工作台或语言管理，直接点击完整操作流；可按需展开 Group 选型、源码原文摘录与六类 Group 速查。
- R2.6 **沿用 R2.4 内存业务交互模型并精简外壳**；R2.5 的 16 Pattern、已存在索引与 Recipe 保留在下方，不新增第二套组件库。
- 真实源码摘录包含来源路径和对应 blob SHA，但均标为 **SOURCE_EXCERPT_ONLY**；不能在不同执行世界直接复制组件并获得 Host/SDK/权限能力。HTML、React、Vue 复用须以原消费者和工具构建上下文为准。
- R2.6 的业务页 **不是 React 编译构建或真实 Tool UI**，也没有安装、授权或持久化能力。已验证 HTML 文件与 JS 语法、静态结构；Chromium/Mac Chrome 下的视觉、键盘、宽度、焦点与真实业务保真度仍 **NOT_TESTED**。
- 从 R2.5 迁移而来的 IME 输入会话保护、删除/撤权二次确认与结果未知人工读回，仍需要真实浏览器针对性回归；不把静态检查提升为操作验收。
