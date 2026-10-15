# GOAL：OpenDesk Browser UI R32.3 NEXT — INTERACTIVE PREVIEW, REACT UI KIT & BOOKMARK TREE CLOSURE

## 直接验证和实现平台组件能力：书签 Tree/下拉菜单 → 可交互 HTML 预览 → React 技术选型 → 容量合同复核 → 小范围正式落地 → 文档持续同步

**日期：2026-10-15。默认中文。此 GOAL 可独立复制到新的普通 ChatGPT 网页对话；不依赖读者记住旧聊天。**

仓库：https://github.com/shopable-ai/opendesk-browser

Mac 本地工作目录：/Users/shopme/Documents/workspace/opendesk-browser（只有具备本地执行能力时使用）。

唯一允许修改、提交及正常推送的分支：**main**。不创建分支、worktree、PR，不强推、reset/clean、覆盖并行工作或进行生产发布。当前是预发布产品，允许对不合理开发期契约进行有证据的调整，但不得破坏现有权限/安全和真实业务行为。

执行原则：**PLATFORM FIRST / REAL SOURCE FIRST / WORKING PREVIEW FIRST / FIX COMPONENT BEHAVIOR / REACT PILOT / ONE DESIGN SYSTEM / MEASURE BEFORE BUDGET / DOCS IN SYNC / SMALL SAFE IMPLEMENTATION / EVIDENCE-BASED SCORING**

---

## 一、最高目标（绝不埋在文件链接里）

**把 OpenDesk Browser 从“界面视觉基本统一，但 Tree、Select、Menu 等交互需要每个工具重复手写”的阶段，推进到“用户和 AI 能直接选用成熟、漂亮、可访问、可安装的公共 UI 组件来快速开发应用”的阶段。**

本轮不以新增 CSS 类名、重写 HTML 页数、组件数量或评分表代替结果，核心成功定义为：

1. **让我在当前 ChatGPT 网页对话中直接看到并操作书签管理器 Tree / 文件夹选择器 / 更多菜单的改进原型**，可比较当前原生方案与至少一种实际可行的 React 方案。
2. **确定一个有证据的近期架构选择**：是否现在为复杂独立工具采用 React；React Aria Components、Radix + 明确 Tree 方案谁更适合；简单工具是否继续原生；是否需要、何时再将宿主五个 Tab React 化。
3. **形成可供 AI/开发者复用的最小平台 UI Kit 方案或首批真实组件实现**，让下一个应用不再重写树、菜单、键盘焦点与主题；优先覆盖 Tree、Select/Combobox、Dropdown Menu。
4. **查清并合理处理工具包容量**：早期 AI 设定的 JS 220000 长度、总包 320000 UTF-8 字节属于仓库预算，并非不可修改的 Chrome 官方硬限制；不能仅因超出旧值排除高质量组件。选择新上限须有可解释依据，实施时保持整个打包/导入/沙箱链路一致和有界。
5. **关键工程结论和实施进度直接同步到已有仓库 Markdown / Skill / 工作流记录**，不是只在聊天里输出新提示词、漂亮评分或下载文件。

**本轮第一可见成果 = 可操作的预览，不是又一份技术方案。第一实施试点 = 独立书签管理器的复杂组件，不是把五个宿主 Tab 全部重写。**

---

## 二、为什么要做：当前问题和边界

本仓库现有事实（执行前须从最新 main 复核）：

- Side Panel 主体由原生 HTML/JS + \`design-tokens.css\` / \`design-system.css\` / \`tool-shell.css\` 驱动，已有 \`od-*\` 公共视觉类，但不等于拥有完整交互组件框架。
- Native Workspace 已离线编译 Tailwind v4；**Tailwind 是样式工具，不是 Tree、菜单、对话框的完整行为库**。Side Panel 当前不必先迁移 Tailwind。
- \`examples/sidebar-tools/react-starter/\` 已有 React 19 + Vite → 单个本地 IIFE JS + 静态 CSS → 现有独立工具打包器的路径，无需为了试点重建工具安装框架。
- \`examples/sidebar-tools/bookmark-manager/\` 是独立 Sidebar Tool。现有 Tree、行菜单、目标文件夹 select 主要靠手写 DOM/事件；用户已指出 Tree 体验差，历史曾发生“可以读取详情，编辑保存失败”的问题。**这两类问题分别审计；换 React 不自动修好 SDK/Host 写入。**
- 普通安装工具仍在 opaque-origin iframe 内运行，经现有 SDK/Host 请求能力。React、组件库、CSS 和 Shadow DOM 不能授予新的 Chrome/Native 权限，不得把动态工具 JS 放进受信宿主 DOM。
- R31 已收敛 \`od-*\` 公共外观；复用其语义 Token，不创建并行设计系统。
- 首版工具 R1 文档已写明容量为可复核预算，具体数值缺乏完整量化推导。既不能恢复为不可变硬门槛，也不能直接改成无限大。

读者不能把“有一个 React Starter”“文档里提过 UI Kit”“网页预览能点击”误写成“React Kit 已正式完成 / 书签真实保存已通过”。

---

## 三、优先级任务树与阶段输出

### P0 / Phase 0：只做必要的最新源码审计，立刻锁定真实消费者

先读（GitHub 直连即可，不预设可访问 Mac）：

- \`AGENTS.md\`、\`docs/framework/parallel-development.md\`、\`docs/framework/testing-guide.md\`
- \`docs/architecture/browser-ui-r23.zh-CN.md\`（现行平台及容量决策）
- \`docs/framework/workstreams/ui-platform-r32-20261015.md\`（已完成及未测）
- \`.agents/skills/opendesk-ui-preview/SKILL.md\`
- \`.agents/skills/opendesk-sidebar-tool-dev/SKILL.md\`
- \`.agents/skills/opendesk-sidebar-tool-package/SKILL.md\`
- \`examples/sidebar-tools/bookmark-manager/src/{index.html,main.js,style.css,model.js,service.js}\`、\`tool.config.json\`
- \`examples/sidebar-tools/react-starter/{package.json,vite.config.mjs,tool.config.json}\`
- \`src/ui/design-{tokens,system}.css\`、\`src/ui/sidebar-tools/package.js\`、\`scripts/build-sidebar-tool.mjs\`

必要时再扩展到现有预览器、安装器、测试，勿以全仓研究拖延用户预览。

**马上输出一张现状对照表**：组件 | 真实消费者 | 当前技术 | 具体缺陷 | 原生能否修复 | 复杂库可能带来的收益 | 安全/体积约束。至少覆盖 Tree、原生 Select、菜单、Dialog、列表行、表单状态。标记“已在源码确认 / 真实 Chrome 待验”，不要猜测。

**Phase 0 完成标志：** 说清“当前缺少哪种交互能力”和“第一预览要演示什么”，然后进入预览，不无限扩展调研。

### P0 / Phase 1：当前对话直接展示可操作的书签管理器 HTML 原型

**优先实现预览本身，而不是只展示 HTML 代码、图片或文件路径。** 先用当前网页对话可用的交互式网页/HTML 能力展示；若环境不支持内嵌交互，诚实说明并生成可直接打开的完整离线 HTML 文件。必要的假数据与业务 Mock 必须明确标记。不能把不可点击的截图称作可交互预览。

原型只需一个 Side Panel 尺寸的书签工具及“切换版本”操作，不需要复刻五个正式 Tab，也不创建永久第六个“组件实验室”Tab。

采用同一组模拟数据及可见操作，提供：
- **A：现行原生 Tree 基线**，尽量遵守真实结构和样式，能够观察当前问题。
- **B：React + React Aria Components 的 Tree / 选择器 / Menu 实验**。
- **C：React + Radix 的菜单/选择器 + 明确可用的 Tree 实现**；明确 Radix 本身不自动提供完整 Tree。
- 如果本次执行环境无法真正构建 React 库，先提供**标注“交互等效模拟”**的对照，不得把模拟结果冒充 React Aria/Radix 的实际行为、体积或性能。等有构建执行能力时补做最小真实库版本。

原型必须有实用的书签树，而不是孤立组件展示：
- 书签与文件夹混排、嵌套缩进、单行整体 Hover、选中/展开区分、可见行操作按钮。
- 展开/折叠；方向键、Home/End、Enter/Space、Escape；焦点移动与恢复。
- 文件夹/书签搜索、搜索后定位、长中文/URL、空/错误/加载状态。
- 选择目标文件夹（真实层级感，必要时支持搜索）、新增文件夹、编辑书签、移动、删除确认；取消和草稿保护。
- 只读 Chrome 根/Managed 节点不可编辑/删除，不能用美化掩盖限制。
- 300/320/360/420/520 CSS px、Light/Dark、长文本可切换；这是预览宽度，不冒充实际 Chrome 200% Zoom。
- 模拟保存时显示 Mock 回执、失败/权限状态，严禁访问用户真实 Chrome 书签。

**Phase 1 完成标志：** 用户能在当前对话或打开的完整预览中实际体验 Tree、菜单、选择器与编辑/返回流程，并能对 A/B/C 的体验做判断。

### P0 / Phase 2：用书签问题决定“现在要不要 React”

首先解释：技术框架不是为了追求流行，而是解决多处独立工具手工构造 DOM、状态、ARIA、Focus 导致的重复开发和不稳定交互。

最小真实候选必须比较：
1. 保留 HTML/JS + \`od-*\` + 有界公共行为层。
2. React + React Aria Components。
3. React + Radix + 实际 Tree 实现（不能只装 Radix 就声称具备 Tree）。

检查这三条路径的真实可用性，功能先于视觉评价：键盘、焦点、可搜索 Select/Combobox、Menu、长列表、状态同步、包体积、CSP、兼容现有 SDK 与安装器、AI 生成新工具的开发成本。

**明确作出当下决策**：
- 简单工具为何继续/不继续使用原生；
- 复杂独立工具是否现在 React 化；
- 选择哪些公共组件、版本及按需导入方式；
- 宿主五 Tab 是否保持原生，什么事实才触发未来局部迁移；
- Tailwind 只保留现有 Workspace，或何时作为编译期工具加入独立 React 工具；不把 Tailwind 和 Radix/React Aria 混为一层。

库选择允许随着真实实验修正；不得为维持之前的“专家 96 分”勉强选某库。

**Phase 2 完成标志：** 一张有证据的比较表 + 唯一优先实施路线 + 明确弃选理由。

### P1 / Phase 3：最小平台 UI Kit 与可复用开发路径

先复用已有 Design Tokens、公共非特权视觉提取、React Starter、\`opendesk-ui-preview\` 和工具打包器，不发明第二个安装包格式、SDK、Host、设计系统或主题表。

为确定的复杂工具路线设计或在具备执行条件时实现**第一批 3 个公共组件**：
- Tree（含键盘、焦点、只读、层级及可扩展性）；
- Select/Combobox（文件夹/项目选择、搜索与表单校验）；
- Dropdown Menu（可发现、ESC、焦点恢复、危险操作）。

明确职责：\`UI Core\` 为轻量原生工具，\`UI React\` 为编译期按需引入的复杂交互组件；\`Templates / Skill / Preview\` 让 AI 直接使用组件而不是每次重写。以上是逻辑分层，具体源码位置先审计现有目录再决定，不创建多个空壳 npm 包。

要求给出**至少一个 AI 能复制使用的最小工具代码示例**，说明组件 API、主题映射、事件/业务 SDK 分离和构建/安装入口。不得把未实现的 API 写成已经发布的正式 SDK。各工具只打包实际引用的控件，不能因平台包含组件目录就让所有工具初始加载全部库。

**Phase 3 完成标志：** 新建同类书签/目录工具时可直接复用组件，且安装和沙箱权限边界不变；若环境无法编码，则标明源码实施未完成，而不是只宣布架构完成。

### P1 / Phase 4：容量上限溯源、合理调整与小范围验证

**不要让旧 AI 设定的上限在技术选型前形成否决权。** 当前实现中的 JS 220000 和总包 320000 是内部校验事实，不是 Chrome 固定平台值；旧文件中的其他 HTML/CSS、script 资产限制也必须按当轮代码确认。

先以实际构建的书签候选及 React Starter 测量：JS UTF-16 长度、UTF-8 字节、CSS、最终 JSON、内联依赖、gzip/Brotli、初始加载和至少一个大数据量场景；区分扩展安装体积与 Side Panel 初始执行成本。无法真实构建时，诚实标注 NOT_TESTED，不给精确体积估算冒充数据。

**容量决策包含三种合法结果**：保留旧预算；有实证地提高/拆分预算；或采用经过安全论证的固定资源复用。不要拍新的任意大数，也不要为多几 KB 引入一个第二套复杂运行时。

本次已授权原则上可以调整内部工具包容量，但**实施时必须覆盖整个消费链**：源读取 → 预编译 → 打包/JSON → 导入 → Host → 消息/存储 → Sandbox Bridge → 更新/恢复 → 验证。不能只改一个 \`MAX_PACKAGE_BYTES\`，导致打包成功而运行失败。保留固定哈希、真实身份、CSP、能力许可、有限资源保护、旧包兼容和边界拒绝；预算变化不自动意味着用户授权调整所有存储配额或安装数量。

若缺乏有效构建/测试环境，本轮先保存容量调整设计和实测缺口，不在黑箱环境中盲改安全相关校验。

**Phase 4 完成标志：** 预算分类、选定值或清楚的未定原因、受影响消费点、原始测量、边界测试与新旧兼容结论；只有实际源码生效后才宣称已扩容。

### P1 / Phase 5：小范围源码实施、回归与文档同步

优先在 \`examples/sidebar-tools/bookmark-manager/\` 改良组件 UI，而不是先迁移宿主 \`tool.html\` 五 Tab；业务模型/Service/SDK/权限继续使用现有路径。若需要对工具包容量进行源码修改，应先列明测试范围及全链所有权，并遵循并行开发协议。

先跑 Tree/表单/包验证的必要定向测试，再按修改范围执行 \`npm run check\`、\`npm run build:sidebar-tool\` 和相关构建；现有 \`npm run dev\` watcher 负责 \`dist/development\`，不能覆盖并行资源。无本地 Chrome 权限时真实安装/读写、500+ 数据、键盘、Zoom、撤权、重启一律 NOT_TESTED，不能借静态截图冒充原生验收。

**每完成一个阶段，就立即在现有权威文件保存结论**：
- \`docs/architecture/browser-ui-r23.zh-CN.md\`：React/组件分层、技术选择、容量政策和架构理由。
- \`docs/framework/workstreams/ui-platform-r32-20261015.md\`：执行状态、原始证据、失败、未测、SHA、下一步。
- \`.agents/skills/opendesk-ui-preview/SKILL.md\` 和 \`.agents/skills/opendesk-sidebar-tool-package/SKILL.md\`：当预览/打包合同真正变化时同步。
- 现有工具开发/API 文档：只有实际公开用法与源码改变时同步。
- 本 GOAL：执行步骤确需修订时原位更新，避免新建互相竞争的总 GOAL。

保存公开可审阅的理由，不要求恢复旧 AI 的内部推理。文档和源码的 \`SOURCE_WIRED / NODE_PASS / BUILD_PASS / STATIC_CHROME_PASS / NATIVE_PASS / NOT_TESTED\` 必须严格区分。对已验证且输入不变的结果允许复用；未测留空而不是填 95 分。

---

## 四、交付顺序与验收门槛

**用户先看见可以操作的预览，再看专家决策，然后才是实施细节。** 不要用“读取文件→再输出另一个提示词→新对话继续”的链条替代执行。

本轮依次交付：
1. 当前真实 UI 技术与书签控件缺陷清单（简洁、可核对）。
2. **当前对话内可操作的 Tree/Select/Menu A/B/C 预览**，或无法内嵌时完整可打开 HTML，明确哪些是模拟。
3. React Aria、Radix + Tree 和原生路线的独立比较、当前唯一首选与放弃项理由。
4. 第一批 3 个平台组件的复用方式、AI 使用示例及合法沙箱/主题接入。
5. 真实包体与容量复核结果，若实施扩容则给新值、对应源码与全链回归。
6. 实际可以安全完成的源码改动、最小定向测试、真实提交/推送与文档链接。
7. 尚未执行的构建、Mac Chrome 和正式产品项逐一标记 NOT_TESTED，不编造 PASS。

**独立质量维度**：Tree/表单功能、列表/菜单操作效率、键盘/屏幕阅读器、视觉与响应式、AI 开发复用效率、维护成本、包体与性能、沙箱安全、迁移风险、真实 Chrome。目标各项 ≥95，但没有同类证据不能主观给分或用平均分遮盖失败。

**停止条件：不是“报告已经写完”，而是“用户有可操作原型、选型有证据、首批组件和预算有明确可执行结论，能实施的部分已经实施并安全同步”。**

普通 ChatGPT 网页对话没有本机 Mac 能力时，仍须优先完成 GitHub 源码审计、对话内预览、方案、权威文档同步；对真实 npm 构建或 Chrome 原生无法完成之处准确记录原因，不能在对话里假称已执行。

**现在直接从最新源码开始，先让我看到可以操作的书签 Tree、文件夹选择和菜单预览。**
