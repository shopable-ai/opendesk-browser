# Bookmark Manager｜产品需求与交互验收约束

> **文档状态：R2.9 DESIGN_PROTOTYPE_NOT_SOURCE_BOUND 候选；R2.8 已归档；设计仍待实际浏览器验收。**
>
> 记录日期：2026-10-15。正式工具 ID：`bookmark-manager`；独立项目：`examples/sidebar-tools/bookmark-manager/`；当前源码包版本：`0.3.8`。
>
> **用户对本版的评价：整体质量相对较差，因此本次是保留可回溯版本，不是确认它为最终视觉设计。** 不给出未经实际评审的 95+ 分数，不因 CI PASS 自动升级为 `DESIGN_APPROVED` 或 `NATIVE_PASS`。

## 一、正式目录与三个不同层次

| 层次 | 位置 | 作用 / 约束 |
| --- | --- | --- |
| 正式独立工具源码 | `src/index.html`、`src/style.css`、`src/main.js`、`src/model.js`、`src/service.js` | **唯一**正式业务 UI / 数据服务实现；经 `tool.config.json` 打包，不从预览文件反向引入 Mock |
| 预览设计候选 | [`preview/index.html`](preview/index.html) | **R2.9 DESIGN_PROTOTYPE_NOT_SOURCE_BOUND**；从 R2.8 的离线正式源码同源快照迭代的设计版本，R2.8 原版留在 Git 历史 |
| 预览模拟及测试 | 仓库根目录 `scripts/preview/`、`scripts/tests/` | 仅替换 SDK 适配边界以模拟大量书签、故障、撤权及交互；测试专用代码和控制按钮**不属于**可安装扩展 |

统一视觉组件与 Token 来源：`src/ui/design-tokens.css`、`src/ui/design-system.css`；禁止在本工具重新定义另一套基础按钮、主题、权限系统、Host 或 Chrome API 私有接入。

## 二、目标与能力范围

在 OpenDesk Browser 的独立 Sidebar Tool 中使用 **Full Bookmarks** 管理 Chrome 原生书签，以尽可能简单的浏览与整理流程覆盖：

1. **浏览**完整书签树和文件夹层级，选择、折叠、展开以及显示当前项只读详情。
2. **搜索**所有已加载书签的标题、网址与目录；大量数据分页读入，不能把界面首屏展示限制当成搜索范围。当前 SDK 合同最多 20,000 节点，列表默认分批展示。
3. **创建**新书签、新文件夹，支持目标目录筛选和选择。
4. **编辑**名称与有效网址，以及必要时变更所在目录；移动可作为独立的显式操作。
5. **删除**单项或文件夹，危险删除必须明确确认；递归删除沿用 Host 一次性限时票据。
6. **收藏当前页**，仅通过具有有效文档与 Tab 绑定的公共 SDK 获取当前页来源，避免在错误网页上写入。
7. **刷新 / 观察变化**：同步其他窗口的变更、处理读取失败和权限撤销，保护尚未保存的草稿。

工具卸载**不删除**用户的 Chrome 原生书签；禁止通过 Preview Mock 冒充实际书签权限。

## 三、必须满足的用户交互合同（P0）

### 3.1 选择与编辑明确分离

- 默认是浏览与只读详情。**单击书签或文件夹主内容只切换选中对象，不能自动打开编辑表单或弹窗。**
- 编辑只能由“编辑信息”、条目独立操作菜单中的“编辑”或明确已定义的快捷键进入；移动、删除、新建也是不同命令。
- 编辑表单与只读详情复用**同一个 Inspector**，不可在窄屏另外创建一套行为不同的编辑器。
- 没有改动的编辑状态下，点选其他条目直接切到目标书签的**只读详情**。再次选中当前条目不应意外进入编辑。
- 点击行内容、文件夹展开箭头和行操作菜单时不能互相误触发。行内操作应具有可靠的点击目标及可见的焦点反馈。

### 3.2 未保存草稿的切换

- 编辑内容已经更改，再点其他条目时，**不应自动保存、自动丢弃，也不应把目标书签表现为正在编辑**。
- 保留旧选中 ID 与草稿，在视野内显示清楚的“当前项目 → 目标项目”提示。待决策时隐藏易造成混淆的旧编辑输入表单。
- “继续编辑草稿” / Escape：恢复原输入及键盘焦点；“放弃草稿并查看”：丢弃草稿并显示目标的只读详情。
- 选择新建、移动、删除等其他操作时同样应用脏草稿保护；切换守卫不能造成死循环、误保存或错误对象写入。

### 3.3 保存、冲突和危险操作

- 仅表单字段的明确保存手势调用 SDK；Enter 不能误触发目录披露、`select` 或其他按钮的保存。
- 一次写入 SDK 结果返回后，仍须通过读取原生树核实目标 ID、名称、网址和位置，才能向用户宣称已更新。
- 写入**明确失败**时保留草稿、允许用户明确重试；`E_OUTCOME_UNKNOWN`、部分写入未核实等情况必须提示结果未知、禁止无条件重放。
- 发生外部修改时需先读取与对比，再由用户决定是否重新以最新状态编辑；不能静默覆盖外部数据。
- 递归删除继续采用官方 Full Bookmarks `prepareRemoveTree` → 一次性删除票据 → `removeTree`，复核子树签名，禁止弱化 Host 前置条件。
- 失去权限时清空原生数据的可见与敏感残留，停止观察与编辑；首次授权及权限恢复须经 OpenDesk 可信宿主界面。

## 四、UI 体验及后续优化目标（待用户评审）

目前 **R2.8 版本仅作保存**。下一版应在不改变上述真实功能的前提下重点评估，而不是把当前预览直接宣称为 95+ 完成品：

- **信息层级**：树列表、选中高亮、详情、编辑和操作菜单有明确主次；避免用户分不清只读和编辑。
- **布局密度**：侧栏约 320–400 CSS px 下不得反复跳位、持续展开冗长编辑器或产生不必要的横向滚动；宽屏可利用额外空间，但只保留一套状态逻辑。
- **操作连续性**：选中、编辑、保存、取消、搜索、移动和返回时保留合理滚动位置、焦点与搜索上下文，不让菜单遮挡或无故重置。
- **视觉质量**：字体、留白、按钮层级、图标一致性、表单宽度、提示与警告色遵从共享设计系统。应结合真实截图逐项做视觉评审；当前没有用户认可的最终视觉基准，也没有可靠的专家高分结论。
- **状态完整性**：正常、空目录、载入中、读取异常、权限拒绝、超长中文、长 URL、大量文件夹、外部冲突、未知写入结果、模拟撤权都应可复现。
- **可访问性**：键盘 Tab、Enter、Escape、F2、可见 Focus、`aria-current`、`role`、按钮名称及读屏行为按实际 Chrome 测试，而不是仅查看 Mock 的静态 DOM。

后续设计需先给出候选并取得用户确认，再更新本文件的结论、正式 UI 与预览。**不得因文件名 `preview/index.html` 就把这版认定为已批准设计稿。**

## 五、预览与实验台的隔离要求

- `preview/index.html` 是**完整自包含的离线 HTML 快照**，包含官方来源的模拟 Side Panel / 正式包同源 UI 以及预览外部测试区域；它**不是** `src/index.html`，不能被 `tool.config.json.files`、安装包或 Host 引入。
- 离线“预览测试辅助工具”必须位于模拟设备容器 `.preview-device` **之外**，默认折叠。工具 iframe 内绝对不得出现实验台 DOM、Mock 调试按钮、模拟撤权菜单。
- 外层测试按钮只允许发送已列入允许列表的 Mock 命令，并校验回执来源；`iframe` 必须保持 `sandbox="allow-scripts"` 且不得开放 `allow-same-origin`、真实网络、文件、权限或浏览器持久数据。
- 本工具专有的实验台 CSS / JS 只能在 `build-preview.mjs` 生成该工具时追加；不能更改 Quick Notes、AdBlock、Reading TOC 等其他工具的共享模板输出结构。
- **冻结样本不应被常规生成步骤自动覆盖**。未来重做预览需先生成临时新候选、比对交互和文件身份，并在用户明确认可后再替换 `preview/index.html`；Git 历史保留此版。

## 六、本次归档身份与验收等级

| 项目 | 已核实的信息 |
| --- | --- |
| 归档预览 | `examples/sidebar-tools/bookmark-manager/preview/index.html` |
| 原始 CI 源提交 | `f76dab1b75e598805494947cd290a193708f625c` |
| 对应工具包 | `bookmark-manager@0.3.8` |
| HTML 源文件大小 | 201,336 字节 |
| HTML SHA-256 | `16792a707abfba8b1d6564fa0ad7b671e59aea4e3679594fd5c4bc259e8765b2` |
| Git blob SHA-1 | `a2c02b57886a5e3e0a0eefbddaf6f8e5ae80231c` |
| 源码 / CI 证据 | [Bookmark Manager R2.8 CI #38758243043](https://github.com/shopable-ai/opendesk-browser/actions/runs/38758243043)；同候选 49 项 UI Node 测试、75 项 SDK 定向测试、双视口 Headless Chrome Mock 和生产 / 开发构建通过 |
| 产品视觉最终确认 | **NOT_APPROVED**：用户明确认为当前质量仍不理想 |
| 用户设备真实 Chrome 安装 / 全书签权限 / 原生 CRUD | **NATIVE_NOT_TESTED**；不以 Mock 测试冒充 |
| 专家设计分数、Issue #75 | **NOT_SCORED**；Issue **OPEN** |

主要工程工作台账：`docs/framework/workstreams/bookmark-manager-r24-runtime-closure.md`。官方预览合同：`docs/architecture/browser-framework/ui-preview-contract-r1.zh-CN.md`。

## 七、下一轮实施与验收准则

下一次继续开发时，**先读取本文件与 `preview/index.html`，再检查最新 `main` 的真实独立工具源码**。先提出针对当前质量不足的明确视觉 / 交互候选，不重新建立书签 SDK、宿主业务或通用预览引擎。

交付时至少核实：

1. 单击行只读、显式编辑、取消后只读、脏草稿切换决策与输入焦点恢复。
2. 主列表、Inspector、行菜单在窄侧栏和宽视口下的实际视觉截图与点击，不发生错位或误编辑。
3. 保存/移动/删除的写后读回、并发冲突、权限撤销及未知结果保护规则没有退化。
4. 实验台只在正式模拟设备外，安装 JSON 完全不包含 Mock 逻辑。
5. Node、共享 Preview、真实 Headless Chrome Mock、正式安装 Chrome Native 的证据**分别**报告，并记录失败用例，不假报产品 95+。
6. 得到用户确认之后才可调整归档预览或变更设计状态；此版持续留在 Git 历史中可追溯。


## 八、Bookmark Manager R2.9 — PREVIEW-FIRST 设计候选（2026-10-16）

> **DESIGN_PROTOTYPE_NOT_SOURCE_BOUND / DESIGN_NOT_APPROVED / CHROME_NOT_TESTED**。此版直接基于 R2.8 的完整真实 iframe 快照修改离线预览专属 DOM、CSS 和 JS。正式 src/、SDK、Host、Chrome 权限、发行包及 0.3.8 版本未改；R2.8 提交 f76dab1b、归档提交 434e67e、原始 HTML SHA-256 16792a707abfba8b1d6564fa0ad7b671e59aea4e3679594fd5c4bc259e8765b2 均保留。

### 实际审计根因

原 main.js renderList() 对每次选中均 replaceChildren()，窄屏时将 Inspector 放入选中书签行后面，且多次移动 Inspector 的 DOM 父节点。action=folder 又会自动展开；folder/detail 后强制 scrollIntoView。这共同造成滚动跳动、焦点丢失、编辑似乎一直展开、操作菜单令列表移位。预览设备原来也固定 360px，不能检验宽度适配。

### 已固化的预览设计决定

- 侧栏（<740px）使用 **固定的唯一 Inspector**，放在列表行之外的 #bm-inline-slot；≥740px 放在右栏。不复制第二份编辑器，不在书签行中插入表单。
- 单击书签 / 文件夹正文只选中并展示 **只读详情**；仅展开箭头负责展开 / 收起；编辑只能显式点击“编辑信息”、行菜单“编辑”或 F2。
- 投影行未变时只同步 aria-current / 选中态，不重建整树 DOM；数据、展开、菜单、搜索结果确实变化时才重建，保留滚动与可恢复焦点。
- 行操作菜单改为当前行浮层，避免撑高后续列表；靠近容器底部时尝试向上放置。还需真实 Chrome 测试顶部/底部裁切和键盘操作。
- 详情标明“已选择 · 只读详情”，编辑标明“编辑中 · 保存后生效”，删除区显式标明危险操作；URL 以两行摘要显示，完整值仍保存在 DOM 及 title。
- 沿用原 R2.8 的脏草稿守卫、放弃/继续、写后读回、外部冲突、权限撤销和一次性删除票据，不重新实现 SDK 或 Chrome 数据业务。
- 预览实验台仍位于 .preview-device **之外**、默认折叠；新增 360/400/960 三个宽度按钮及 ?width=360|400|960 参数。正式 iframe sandbox 保持 allow-scripts，未加入 allow-same-origin 或外部网络。
- 保留共享 OpenDesk CSS Token 与 od-* 语义组件，仅追加工具布局/状态的预览样式，不创建第二套正式组件库。此文件应视为 R2.9 设计候选，不能用常规 build-preview 自动覆盖。

### 验收门禁（尚未完成）

必须在实际 Chromium 对本候选跑 360/400/960、必要时 125%/150% 缩放；覆盖选择/重复选中/文件夹箭头、编辑保存取消、干净切换、脏草稿守卫与输入焦点恢复、新建/移动/删除、全树搜索、2000+ 数据、100+ 目录、长文本、错误和权限撤销，保留可复核截图。Node、**本次新候选** Headless Chrome Mock、已安装 Native Chrome 需要单独给出证据；未执行记 NOT_TESTED，所有十维度暂 NOT_SCORED，不能继承 R2.8 CI 分数或宣称 95+。


### R2.9 第二轮截图复审（2026-10-16）

首次 Chromium Mock CI [38772642879](https://github.com/shopable-ai/opendesk-browser/actions/runs/38772642879) 已在 360/400/960 真正打开存档 HTML，26 个文件保存 21 张关键状态截图、3 张流程终态图、HTML 和 JSON。人工查看截图发现：预览元数据（冗长 Source 哈希）遮挡第一屏、窄屏 Inspector 较长、行菜单位于滚动溢出容器内可能被裁切。第二轮已把来源元数据折叠、收紧 Inspector 只读信息密度，并把 row actions 变成同一 opaque iframe 内 #tool-root 子节点的固定定位菜单；Esc 恢复触发器焦点，撤权移除菜单，选择其他对象清除失效旧错误。新测试截图 \`menu-open.png\`、弹层视口完整性与 Esc 被新增至 r29-chrome.mjs，须以第二轮 CI 为准，不继承首次 CI。正式 src/、SDK、Host、工具安装包保持不变；DESIGN_PROTOTYPE_NOT_SOURCE_BOUND，Native/UX≥95 仍须独立证据。
