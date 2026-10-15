# OpenDesk Browser · HTML 预览外壳模板 R1.2

日期：2026-10-15。性质：Preview Contract R1 的 UI 外壳实施补充，不是第二个设计系统或新的安装器。

## 1. 结论和用户决定

**供 ChatGPT 评审、日常工具设计使用的预览 HTML 外壳只使用正式的浅色主题。** 不提供浅色/深色切换。保留正式 Chrome Extension 的明暗模式实现；原有 `--theme dark` 只服务于显式的产品深色诊断测试，工具内容在该测试场景下可为暗色，但 *预览外壳始终为浅色*。

复用原则：不能把一张手工画的示意图冒充已安装的 Side Panel。抽取真实 `src/ui/tool.html` 的工作台导航和工具工具栏、抽取 `src/ui/tool-shell.css` 必需的选择器，以及 `src/ui/design-tokens.css` / `src/ui/design-system.css`。生成文件中再次声明的浅色 Token 值从源文件**自动提取**，不另存第二套维护值。

## 2. 两种预览，一套权威

| 预览阶段 | 单一模板 | 构建入口 | 允许修改的对象 |
| --- | --- | --- | --- |
| AI 对话设计稿 | `scripts/templates/sidebar-preview.html` | `scripts/sidebar-preview-kit.mjs create / check` | 明确的 `#od-preview-app` 与 Mock JS；静态受保护外壳不允许改 |
| 正式工具源码同源 HTML | `scripts/templates/sidebar-tool-preview-shell.html` | `scripts/preview/build-preview.mjs` | 工具正式源码 + 构建期样式 + SDK 模拟边界；**生成产物不允许手工修补** |

它们不是两套设计规范。第二种生成器调用 `scripts/preview/sidebar-shell-source.mjs`，只提取真实导航、工具详情头与必要视觉规则；工具业务 HTML/CSS/JS 仍是原 `createSidebarToolPackage()` 的正式构建结果。整体环境由可信的静态外壳和 `sandbox="allow-scripts"` 的不可信工具 iframe 两个不同安全世界组成。

## 3. 可视范围和上下文成本

默认是 **Side Panel / 扩展工具详情**。顶部显示「我的 / 扩展 / 工作流 / 开发 / 云控」五标签（历史隐藏调试标签仍属于源码）；只有「扩展」承载真实工具 UI。点击其他标签只显示“非本次预览范围”的占位文字，不嵌入其他标签页面、状态机、SDK 或业务包。

真实工具详情头保留：
- 返回：转到最小化工具列表占位，可重新打开；**无需复制完整的扩展搜索、筛选、列表点击打开功能**。
- 标题：从真实工具包读取。
- 删除/卸载：显示预览专用的二次确认；确认后只卸载当前 iframe 的模拟运行实例，绝不接触真实用户数据、Chrome 权限与正式安装。
- 设置、页面内浮动/上下文菜单：只在真实工具确有此要求并有正式接线证明时逐项加入；无关按钮/新标签打开可以隐藏。

按钮、焦点和布局的形式来自正式 `od-*` 组件 / `tool-shell.css`；预览自己的 CSS 仅设置设备容器、占位信息、弹窗和媒体布局，不定义第二套 palette。

## 4. 直接生成与验收

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

## 5. 推进任务树：共七步

1. **来源与模板锁定（R1.2）**：确定两种预览的界限；共用正式 Token/组件。验收：非法私有皮肤或丢失生产导航选择器时失败。
2. **预览外壳定稿（R1.2）**：仅浅色，五个导航标题但只加载当前工具；真实来源的 Back/Title/卸载。验收：Chrome 静态预览下可操作，非真实卸载。
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
