# OpenDesk Browser · HTML 预览外壳模板 R1.2

日期：2026-10-15；2026-10-30 增量修订。性质：Preview Contract R1 的 UI 外壳实施补充，不是第二个设计系统或新的安装器。

## 1. 结论和用户决定

**预览宿主外壳始终使用正式浅色主题。** 允许在应用之外提供 light/dark 工具主题控件，只改变应用区域；工具按实际支持演示，不支持时明确说明。正式 Chrome Extension 的明暗模式实现不变，不另造两套预览模板。

复用原则：不能把一张手工画的示意图冒充已安装的 Side Panel。由 `scripts/preview/sidebar-shell-source.mjs` 抽取真实 `src/ui/react/` 的工作台导航和工具栏、抽取 `src/ui/tool-shell.css` 必需的选择器，以及 `src/ui/design-tokens.css` / `src/ui/design-system.css`。生成文件中再次声明的浅色 Token 值从源文件**自动提取**，不另存第二套维护值。

## 2. 两种预览，一套权威

| 预览阶段 | 应用内容来源 | 构建入口 | 允许修改的对象 |
| --- | --- | --- | --- |
| AI 对话设计稿 | `scripts/templates/sidebar-preview.html` 内容/模拟逻辑 fragment | `scripts/sidebar-preview-kit.mjs create / check` | `#od-preview-app` 内部与 `#od-preview-behavior` 中 `/* DESIGN_APP_BEHAVIOR */` 之后的工具逻辑；共享宿主部分受保护 |
| 正式工具源码同源 HTML | 官方构建的工具 HTML/CSS/JS | `scripts/preview/build-preview.mjs` | 工具正式源码 + 构建期样式 + SDK 模拟边界；**生成产物不允许手工修补** |

两个既有生成器共同消费 `scripts/templates/sidebar-tool-preview-shell.html`，作为唯一完整宿主 DOM；`scripts/templates/sidebar-preview.html` 仅提供设计内容、样式与模拟逻辑 fragment，kit 输出仍是完整单文件 HTML、prompt 和 manifest。导航、返回及模拟卸载行为统一来自 `scripts/preview/sidebar-shell-behavior.js`。共享 helper 配置只读、仅服务离线模拟，不产生平台写入或公开 API 变化。

两个既有生成器共用 `scripts/preview/sidebar-shell-source.mjs`，只提取真实导航、工具详情头与必要视觉规则。设计稿应用区仍可编辑；源码同源预览的工具业务 HTML/CSS/JS 来自原 `createSidebarToolPackage()` 的正式构建接口，外层静态壳与 `sandbox="allow-scripts"` 工具 iframe 分属不同安全世界，离线壳不拥有真实宿主权限。

## 3. 可视范围和上下文成本

默认是 **Side Panel / 扩展工具详情**。顶部显示「我的 / 扩展 / 工作流 / 开发 / 云控」五标签（React SSR 当前含 7 项，包括隐藏的 `app-debug` 等调试项；不把 SSR 总数硬编码为可见标签数）；只有「扩展」承载真实工具 UI。点击其他标签只显示“非本次预览范围”的占位文字，不嵌入其他标签页面、状态机、SDK 或业务包。

真实工具详情头保留：
- 返回：转到最小化工具列表占位，可重新打开；**无需复制完整的扩展搜索、筛选、列表点击打开功能**。
- 标题：设计稿读取创建时的工具名称；源码同源预览读取真实工具包。顶部正式工具标题已有 `role="heading"`，应用内不添加重复 `h1` 或同名标题。
- 删除/卸载：显示预览专用的二次确认；取消或 Escape 恢复卸载按钮焦点；确认后只关闭当前模拟实例，可恢复打开，绝不接触真实用户数据、Chrome 权限与正式安装。
- 设置、页面内浮动/上下文菜单：只在真实工具确有此要求并有正式接线证明时逐项加入；无关按钮/新标签打开可以隐藏。

按钮、焦点和布局的形式来自正式 `od-*` 组件 / `tool-shell.css`；预览自己的 CSS 仅设置设备容器、占位信息、弹窗和媒体布局，不定义第二套 palette。

### 应用外部辅助区（2026-10-30）

允许在共享模板中增加真正通用的外部辅助区，放在 `.preview-device` / 应用内容之外。状态、工具主题、恢复及模拟说明均属于此区；正式源码、安装包和工具 iframe 不含这些控件。设计稿内容区不放预览说明或“重置模拟数据”按钮，刷新在所属区域右上角，不重复对象/检测信息。

| 入口 | 辅助能力与边界 |
| --- | --- |
| `sidebar-preview-kit.mjs` 设计稿 | 复用真实 nav/header，应用区保持可编辑；外部演示已授权、未授权、撤权、加载、空、失败、长文本及恢复；工具 light/dark 仅影响应用。表单未保存期间禁用外部状态/主题/恢复，取消或 Escape 返回后恢复；授权均为模拟。 |
| `build-preview.mjs` / quick-notes | 外部场景 `success / permission-denied / revoked / loading / empty / error / untrusted / long`、工具主题和恢复；切换时重建纯内存 iframe，明确提示模拟数据会重置。 |
| `build-preview.mjs` / bookmark-manager | 外部选择 `success / empty / error / loading / permission-denied / untrusted` 六种既有场景和 light/dark；切换重建内存 iframe。另保留专属 lab 的 8 项命令（含运行时 revoke/restore）。不支持 quick-notes 新增的 `revoked / long` 场景值；`revoke` 是命令，不是场景。 |
| 其他工具 | 仅展示已接入 adapter 的能力；未接入的状态/主题/恢复控件明确不支持，不塞入书签专有 lab。 |

公共辅助区的结构调整须同步来源锁和受影响检查；专有故障注入仍仅由目标 adapter 提供，不改变正式 SDK、权限或持久数据。源码同源预览切换会重置模拟内存，不涉及真实结果未知（unknown）的操作；不据此放宽产品的未知副作用保护。实际证据以本轮生成文件和报告为准；生成成功不代表交互终验或测试 PASS。

## 4. 既有生成入口与按需检查

下列命令为生成与按需检查入口；结果应绑定实际生成文件和报告，不从命令示例推断 PASS。离线增量不要求安装、构建 Browser、发布、全量验收或评分。

在 Node 22+ 的项目根目录：

```sh
node scripts/sidebar-preview-kit.mjs create --out artifacts/sidebar-preview-kit/review-001 --title "待评审工具"
node scripts/sidebar-preview-kit.mjs check artifacts/sidebar-preview-kit/review-001/preview.html

node scripts/preview/build-preview.mjs --tool quick-notes --surface side-panel --scenario success --theme light --width 360 --height 760
node scripts/preview/build-preview.mjs --tool bookmark-manager --surface side-panel --scenario empty --theme light --width 360
node scripts/preview/check-preview-contract.mjs
node --test tests/environment/sidebar-preview-shell.test.mjs tests/environment/sidebar-preview-contract.test.mjs tests/environment/sidebar-preview-kit.test.mjs
```

**ChatGPT 展示合同**：对话中优先给可交互预览，另外提供生成的完整 HTML；不得只给一个 GitHub 路径、图片或压缩包。浏览器打开由实际 HTML 实现，不用展示技术替代真实界面。为了不把工具包和全部 CSS/JS 吃进上下文，提供对话时只需传一屏视觉和**短清单**（视图/状态/交互约束、源码 commit、设计 SHA、隔离 Mock 声明）；真实字节留在仓库和正式生成文件中。需要工具源码修改时再按需读取该工具相关入口。对于在线聊天不能实际载入附件的情况，不可谎称它读到了模板。

## 5. 历史推进任务树：共七步

以下保留原阶段规划；普通离线模板迭代不以整棵任务树、后续 Chrome 对照或评分为前置。

1. **来源与模板锁定（R1.2）**：确定两种预览的界限；共用正式 Token/组件。验收：非法私有皮肤或丢失生产导航选择器时失败。
2. **预览外壳定稿（R1.2）**：宿主仅浅色，工具按支持切换主题，五个导航标题但只加载当前工具；真实来源的 Back/Title/卸载。验收：Chrome 静态预览下可操作，非真实卸载。
3. **AI 对话生成入口（后续）**：用 ChatGPT 当前对话能直接显示的 HTML 演示，复用生成文件与提要；对话预览与仓库文件有可追溯身份。
4. **组件与状态矩阵（后续）**：保存、失败、空态、加载、撤权、不可信数据、确认与返回；最低限度键盘、焦点和 aria 标签。
5. **自动化防漂移（R1.2 + 后续）**：模板、构建器和来源锁入 CI；反例检查；必要时添加相关选择器摘录的细粒度版本锁，减少无关宿主 CSS 改动造成重建。
6. **同候选真实 Chrome 对照（待实施）**：正式安装应用及其 Side Panel iframe，与源同构的离线预览对照；保存截图、DOM、计算样式、版本 SHA、交互与异常。没有原生身份不打 95+。
7. **扩展到其他工具（后续）**：Quick Notes 与 Bookmark Manager 样板成功后，每次只迁一个常用工具；页面注入、独立窗口/弹窗需相应的真实挂载适配，不把侧栏 iframe 当作其他运行环境。

**当前质量不能以“专家推断 95 分”认定**。R1.2 的 CI/组件证据与后续原生产品证据分别记录；跨任务复用此前通过且输入未变的结果，避免重复验收。

## 6. 原则与后续架构决策

- **组件机制**：原生 `od-*` 仍为现有生产事实。React/Radix、React Aria 与 Tree 方案由 R32 平台选型的运行证据决定，不把预览模板当新的框架决策。
- **容量**：HTML/JS/CSS 包预算须受原安装链约束，预览 HTML 容量不等于可安装工具包可支持同样大小；必要时实施预览快照压缩和按需加载，但不能让正式应用引用远程 CDN。
- **模拟边界**：只在 SDK/service 层 Mock，不伪造真实 Chrome 操作。预览中的“卸载”只是视图和 iframe 生命周期演示。
- **多 Agent**：写入 `main` 前比较 SHA，仅追加本任务所有的文件；不修改其他对话的 SDK、权限、安装器或旧验收证据。

## 7. R1.3：原生 HTML 与对话内适配层不可混淆

延续 R1.2 的宿主浅色、正式设计 token、五 Tab 外壳、受限 iframe、唯一完整宿主模板及设计 fragment，不建立第三个 HTML 生成器。生产工具预览的完整权威文件继续从 `node scripts/preview/build-preview.mjs --tool quick-notes --surface side-panel --scenario success --theme light --width 360 --height 760` 生成。

执行上述命令时，除 `*.html` 外，还写入同名 `*.context.json`。后者只记录当前工具、surface、详情视图、激活的扩展 Tab、Shell 关键模拟交互、场景与 CSS 宽度、来源 commit 与设计/工具/外壳 SHA、SDK Mock 能力边界及正式 HTML 路径。**它不是单独维护的组件注册表，也不复制 HTML/CSS/JS。** 模板/正式工具源码改动后必须重新生成文件，不手工修改旧产物。

聊天中的展示证据严格区分：

1. `SOURCE_HTML_INLINE`：聊天容器实际执行本次生成的完整 HTML 字节，且记录其来源指纹，可以声称“同源 HTML 已嵌入”。
2. `CHAT_ADAPTER_NOT_SOURCE_HTML`：不具备原始 HTML 执行能力时，改用聊天可视化适配层演示关键按钮/状态；必须醒目标识与源 HTML 不同，说明 DOM/CSS、iframe/Mock 与生产包行为不完全等价。**可操作不代表源 HTML 已在聊天中运行。**
3. `LINK_ONLY_NOT_ACCEPTED`：只给仓库链接、截图或文件下载，即使 CI PASS，也不满足对话内交互目标。

导航和页头通过 `sidebar-shell-source.mjs` 来自真实 `src/ui/react/`；样式从 `src/ui/tool-shell.css` 提取。生产 `aria-controls` 原本指向完整 Tab 页面，R1.3 在预览运行时只重指向已有 `tabpanel`，不更改源模板。工具卸载在预览中重新设置明确的模拟 aria-label，取消按钮或 Escape 会将焦点恢复到卸载按钮；确认时只清空模拟 iframe，可重新进入。其他四个 Tab 不载入业务，正式 Token/组件样式仍由构建期抽取。

必要定向检查：
```sh
node scripts/preview/check-preview-contract.mjs
node --test tests/environment/sidebar-preview-shell.test.mjs tests/environment/sidebar-preview-contract.test.mjs tests/environment/sidebar-preview-kit.test.mjs
```

GitHub CI 的 Headless Chrome 结果限于 `STATIC_OFFLINE_CHROME_PASS_NOT_INSTALLED`；同候选 Mac 真实 Chrome 扩展/Side Panel/iframe 的完整安装、键盘和计算样式无原始证据则记 `NATIVE_CHROME=NOT_TESTED`。不要因为静态回归通过就填 95+ 最终产品评分。

## 2026-10-30 · 模板组件组合补齐

设计稿生成仍用同一个 `sidebar-preview-kit.mjs`，新增同目录组件用法输出而非第三个生成器。`components.html` 使用同一真实来源外壳与当前共享 React 组件源码编译，只演示模板需要的按钮、Card、Switch、字段、状态和确认；完整参考仍归既有 Atlas。具体接入与支持范围统一维护于[组件与组合入口](../../api/sidebar-preview-kit.zh-CN.md#组件与组合的直接入口2026-10-30)。模板与组件页使用同一 Card CSS，HTML 工具原样式提取器输出其子集，表单/反馈沿用 canonical od-*。辅助主题/恢复/场景与用法留在应用外；CSP、源锁、宿主前缀和 iframe 权限边界继续有效。SOURCE_COMPONENT_PREVIEW 与正式包 Runtime、已安装 Chrome 分开，未执行的安装/Native/真实 AI 仍 NOT_TESTED。
