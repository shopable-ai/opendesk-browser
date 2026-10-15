# OpenDesk Browser R23 · UI 架构与共享设计边界

初版：2026-10-11；R32.3 平台 UI 与容量政策补充：2026-10-15。初版基线 `d56c84273f7fcab8b837269ef5472fafd1fd19e5` 仅供追溯。本文区分已实施事实、用户确认的方向和待验证选择；真实证据查 [R23 工作流](../framework/workstreams/ui-r23.md) 与 [R32 续接记录](../framework/workstreams/ui-platform-r32-20261015.md)。保存文档不代表新 UI Kit、扩容或原生验收已经完成。

## 当前实际 UI 地图

正式导航以 [现行产品规格](../product/sidebar-ui-spec.zh-CN.md) 为准；R23 初版的「发现 / 工具」不再作为现行一级 Tab 名称。

| 正式界面 | 入口 / JS | 渲染及业务状态 | 样式与发布 | 验证边界 |
| --- | --- | --- | --- | --- |
| 我的 / 扩展 / 工作流 / 开发 / 云控 | `src/ui/tool.html` / `tool-shell.js`、`task-workbench.js`、`sidebar-tools.js`、`workflow/workflow-view.js` | 原生 DOM；RunHost、任务槽、持久结果与权限归原有模块 | `design-tokens.css` → `design-system.css` → `tool-shell.css` | 五 Tab 与工具回归；真实扩展事件另测 |
| 独立工具标签页 | 同一 `ui/tool.html` 与可信 Host | 工具 iframe 保持隔离 | 复用外壳，不注入宿主完整 CSS | 工具导入、安装、生命周期 |
| Native Options | `src/native-agent/settings.html` / `settings.js` | 原生表单；Native 权限、回执不变 | 共享 Tokens + `settings.css`；允许自然滚动 | 真实权限手势和连接另测 |
| Native Workspace | `src/native-agent/workspace.html` / `workspace.js` + `settings.js` | 原生 DOM，文件读写与冲突语义不变 | `workspace.tailwind.css` 离线编译，内联 Tokens | 文件/预览/AI、真实 Native 保存另测 |
| 独立可安装应用 | `examples/sidebar-tools/<tool-id>/` | 经典 JS 或本地预编译 React/Vue；经原 SDK 请求业务能力 | 原打包器、opaque-origin iframe；已有 React/Vue Starter | 组件、打包、安装、真实业务写入分别验收 |

扩展固定入口、用户程序构建与可安装工具包构建职责不同。UI 框架只在获选 UI 环境按需使用，不顺带注入 SW、Controller Worker、网页 SDK 或全部用户程序。

## 唯一 Tokens 与层次

- `src/ui/design-tokens.css`：共享语义变量唯一来源，不承载页面滚动、reset 或资源加载。
- `src/ui/design-system.css`：可信 Side Panel / 工具 Host 公共视觉；完整文件包含宿主页面规则，不直接载入动态工具 iframe、Native 页或第三方网页。
- `src/ui/tool-shell.css`：业务布局、状态与滚动；不以页面选择器重复公共组件外观。
- `src/native-agent/settings.css`：Options 布局，不改真实权限手势。
- `src/native-agent/workspace.tailwind.css`：保留既有离线 Tailwind，产物无在线 JIT/CDN；不扩散 Preflight。
- 工具可显式选择 `scripts/preview/shared-tool-design.mjs` 的构建期非特权公共视觉提取，或沿用安全独立主题映射。这不等于运行时注入宿主完整 CSS/JS。生成资源绑定权威源码与哈希，不维护第二套颜色和间距。

具体视觉、跨界面和组合规范分别由 [R20/R31](sidebar-design-system-r20.zh-CN.md)、[R27](ui-layout-conventions-r27.zh-CN.md)、[R28](sidebar-multi-section-tab-contract-r28.zh-CN.md) 维护；本文不复制 CSS 数值表。

## R23 历史 React 决策及 R32.3 修订

R23 当时不引入 React/shadcn，是对当时宿主状态、缺少挂载边界及体积证据的阶段判断，其中入口数量、单入口预算是历史快照。**不构成“React 永远只适合未来”或“旧容量不可修改”的现行规则。** 实际入口和容量必须重新查源码。

2026-10-15 用户明确：OpenDesk 尚未正式上线，应从用户及 AI 应用开发平台角度评价组件；应减少反复自研 Tree、选择器、菜单、焦点及主题的成本。用户同时允许复核并调整早期 AI 设置的容量上限。本次确认方向和决策方法，不把候选库、聊天评分或未实现 API 写成产品事实。

## R32.3 平台组件方案

**一个 Design System，轻量应用与复杂应用都能复用。** 按业务体验、可访问性、维护和可测资源成本决定，不把最少字节作为唯一目标。

| 能力层 | 定位 | 实施状态 |
| --- | --- | --- |
| Design Tokens / 公共视觉 | 延续现有权威与公共类 | 已有，不重建 |
| UI Core | 简单工具继续使用原生 HTML/CSS 与公共行为 | 已有部分，不宣称完整控件库已存在 |
| UI React | 成熟复杂交互组件与平台外观封装 | 待验证方向，复用 React Starter，不先全量改宿主 |
| Templates / Skill / Preview | AI/开发者复用模板、固定依赖、同源预览 | 沿现有入口补缺口 |

这些名称是职责层，不代表已创建同名 npm 包或四套框架。**平台提供丰富组件，不等于运行时全量载入。** 开发时可安装完整依赖，构建时只纳入实际使用部分，并检查 tree-shaking 结果。懒加载不等于零安装成本；不同 iframe 不能共享一个可变 React 单例。未来若采用固定内容寻址资源，代码文件复用和文档内实例仍须分开。

### 第一消费者与优先级

优先在 `examples/sidebar-tools/bookmark-manager/` 验证 Tree、Select/Combobox、Dropdown Menu；其次完善 Dialog/Confirm、List Item/Action Row、表单错误和状态。文件夹与书签保持同一树，覆盖方向键、Home/End、展开、焦点/选择、搜索定位、长文本和大数据量；保护只读根、Managed 节点、事件刷新中的草稿与失败恢复。

独立工具业务不迁回宿主。**UI 渲染层改造不会自动修复 SDK/Host 写入失败。** Tree/表单可用性和真实编辑、保存、移动、删除回执分别验收。

### 待决库与验证次序

保留原生基线，优先比较 React + React Aria Components 与 React + Radix Primitives + 明确 Tree 实现。React Aria 是优先研究候选，Radix 是强候选，**均未封版**。其他路线仅在真实缺口需要时比较，不要求七套完整应用同时实现。

执行时核对官方目录和目标版本；不能把菜单/折叠当完整 Tree，也不能把普通 Select 当可搜索 Combobox。React、行为库、平台样式和 Tailwind 属于不同层；行为库不自动提供美观主题，Tailwind 不自动解决树键盘与焦点。保留 Workspace Tailwind，是否扩大到宿主另作决策。

先做核心可交互原型与最小真实构建，稳定后再扩展场景、生命周期、安装测试；不把大规模全仓测试置于第一组件实现之前。先前聊天的 80/93/96 等分数是条件性预评，不作为验收、库排序或扩容依据；正式评估逐维记录版本、证据、失败与未测。

## R32.3 容量政策：可调整的产品预算

### 原始依据

首版提交 `59153b6460c453cd2f548cc23586d91a5c2959ef` 已定义工具容量，同提交 [R1 产品说明](https://github.com/shopable-ai/opendesk-browser/blob/59153b6460c453cd2f548cc23586d91a5c2959ef/docs/product/sidebar-custom-tools-r1.zh-CN.md) 明确说容量是 R1 预算、扩大须复核消息与存储链。此次查阅未找到 JS 220000、总包 320000 必须取这些值的量化推导或用户数值批准记录。不是完全无设计说明，也不能臆造原作者/AI 的内部推理。

### 三类约束必须分开

| 类型 | 处理方式 |
| --- | --- |
| 浏览器/外部平台真实限制 | 核实最新官方资料及实际通道，区分扩展消息、Native Messaging、存储和文件导入 |
| 仓库资源预算/历史阈值 | 允许修改、放宽、拆分或统一；旧测试数字、AI 软预算、历史文档不形成永久否决 |
| 安全与身份保证 | 保留 CSP、沙箱、固定来源/版本/哈希、真实手势、权限/安装身份、路径检查、有限资源防护和明确失败 |

**不能仅因 React UI 超过旧预算就淘汰它。** 获得具体容量实施授权后，允许直接更新预算与代码，不必仅因越过早期 AI 数字再次申请同类批准；仍遵守 main、依赖及并行资源规则。旧文档“不能通过改预算过关”应解释为禁止跳过验证、伪造 PASS 或只改测试，不是禁止有理由地更新合同。

以代表性应用和目标设备决定工作预算。证据不足时可采用明确标注适用范围、测量方法和复核节点的暂定预算，继续核心开发；不要重新拍一个任意大数再当永久门槛。不能因为原始理由不全就等待全部历史恢复而停工。此前聊天的 gzip 30 KB/解压 150 KB 等建议也不是用户确认的硬门槛。

不要自动把这项授权扩成调整所有安装数量、数据配额或 Native 协议限制；它们如阻碍平台目标应分别分类复核。也不建立第二个重复预算注册中心。

### 全链一致性与验证

沿现有模块检查：源文件读取/预编译 → 打包/编码 → 导入/目录读取 → Host → 消息/预览/stage → 存储 → Sandbox Bridge → 升级/卸载/恢复。至少核对 `scripts/build-sidebar-tool.mjs`、`src/ui/sidebar-tools/package.js`、`src/sidebar-tools/bridge.js` 与现有 Host/Importer/Stage/本地预览，实际路径以当前源码为准。

不能只改一个 MAX_PACKAGE_BYTES，导致打包通过而安装或沙箱继续按旧值拒绝。优先统一重复预算所有权及派生校验；保留旧包可读性，确需元数据版本化才定义迁移，不为改数字新建包格式、安装器或第二个 Host。

分别测量 JavaScript `.length`（UTF-16 code units）、UTF-8 原始字节、minified 字节、gzip/Brotli、最终 JSON、ZIP、初始加载量和内存。核对中文、emoji、JSON 转义、scripts 与内联资源；不能把压缩体积与原始字段限制直接比较。覆盖临界内/恰等于/超限、异常输入、坏哈希/来源、无权限、多工具存储、取消恢复及旧包兼容。

较大工具包可以是功能体验和开发效率的合理取舍，但有限预算不应变成无限制。共享工具依赖如确有价值，先设计固定版本/资源与撤权、升级生命周期，不借扩容引入远程代码或跨 iframe 特权。

官方参考：[扩展消息](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)、[Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)、[Sandbox](https://developer.chrome.com/docs/extensions/reference/manifest/sandbox)、[CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)。这些不是上述 R1 数字的来源，也不能混作同一安装包上限。

## 文档驱动与持续保存

每个关键结论形成后立即更新权威文档：记录状态（已确认方向/待验证/已实施/已验证）、决定、证据、替代方案、风险、源码/构建身份和下一步，不等所有实验结束才保存。结果变化写替代关系并保留原始证据；保存可审阅的工程理由，不要求保存私有内部推理。

本文件拥有 UI 框架方向与容量政策；R20/R27/R28 保持视觉和组合责任；工具 API/开发文档、打包/预览 Skill 同步执行合同；[R32 工作流](../framework/workstreams/ui-platform-r32-20261015.md) 保存阶段状态和来源。不能只在聊天宣布选择了新库或提高了上限，源码与文档必须同步。

## 构建、安全和维护规则

1. 依赖固定版本、本地构建，不引入在线 CDN/JIT 或放松特权扩展页 CSP；白名单、验证器按获批产物合同同步，不静默跳过验证。
2. 只有已审计固定宿主源码能挂载可信 DOM。动态用户/AI/市场工具继续走原 opaque-origin iframe 与受限 SDK，UI Kit 不授予 Chrome/Native 权限。
3. 同一 DOM 子树由一个渲染者负责；迁移保护真实手势、订阅清理、草稿、状态回程和撤权，不让旧 DOM 重绘与 React 同时接管。
4. 复用 Preview Skill、设计套件和生产同源预览；现有适配只支持 quick-notes 时，先补边界，不声称已支持书签。视觉模拟不冒充实际库、SDK 或原生 CRUD。
5. 先定向验证，稳定核心功能后再按范围构建和原生验收；不覆盖 watcher、dist/development 或 Chrome Profile。未测标 NOT_TESTED。

网页版接续入口：[R32.3 GOAL](../framework/prompts/goal-ui-platform-r32.3-document-driven.zh-CN.md)。历史 R19–R31 成功只对各自输入有效，不因本文保存升级为完整平台 UI 95+。
