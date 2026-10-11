# 知识收件箱 R24：产品级 UI/UX 迭代与验收

日期：2026-10-11。仓库：shopable-ai/opendesk-browser。工作范围：知识收件箱官方可安装工具及其最小必要测试/开发文档；不重建宿主框架，不改变知识数据模型。

## 起点与影响识别

审计起点 main：96812e6ed942fd256eb9f44d071093dc204ff554。通过 GitHub 同时核对历史中文截图候选 dece01194df2cb5a5a6779d95697c9f3a80f53f8 与本轮起点：工具的 src/index.html、src/style.css、src/main.js、内置 JSON 的 blob SHA 完全相同；宿主侧 sidebar-tools.js 已变化。因此，dece011 的 360px 中文浅/深历史截图可以作为**工具自身老样式参考**，但不是本轮对最新完整宿主重新采集的改造前原生证据。

缺口：旧详情在标题、分类、标签、备注之后才呈现只读 textarea 正文；四个导出按钮和编辑复选框同级竞争注意力。分类之外无标签筛选、排序；品牌页头、常驻描述、备份入口占用了窄屏面积。Markdown 缺少标题/列表/代码可读排版。

## R24 改造范围

- 正式工具入口默认阅读，标题、来源日期、分类/标签及高频「复制 Markdown」优先；编辑单独进入；下载、工作区、来源、删除折叠至「更多」。
- 列表增加搜索清除、标签过滤和最近修改/最近保存/标题排序；复用原 knowledge.list 搜索和既有 tags/createdAt/updatedAt，不新增持久化字段。
- Markdown 使用 DOM 文本节点渲染标题、段落、引用、代码、列表和简单表格；绝不直接执行原始 HTML，不自动创建远程图片请求；超长正文降级为完整纯文本。
- 编辑保存只对真正修改启用；原始回答与个人草稿仍按现有 revision 合同独立持久化。恢复原文必须单独确认；编辑状态通知按序写入宿主，保留取消和删除确认。
- 隔离 iframe 内明确映射 R20/R21 的字体/间距/焦点/颜色语义，不新增框架；改进 360px 窄侧栏和明暗模式。
- 工具发布版本由 1.0.0 增至 1.1.0，保留知识工具 ID 及能力声明，重新同步规范生成包和官方内置包。
- R1 Chrome 用例由旧复选框断言改为真实读/编辑模式与不可信 Markdown 的负向断言，加入多视口明暗截图/溢出采样；增加 R24 静态合同测试。
- docs/api/sidebar-tool-development.zh-CN.md 增加所有 Side Panel 可安装工具共用的 UI 方法，不批量重写其他工具。

## 安全与兼容性约束

仍沿用现有 page.capture、knowledge.store、user.export 以及受信任 knowledge 服务；未调用其他 Chrome/Native 功能或外部网络请求。无存储格式升级，无新增依赖，不改变旧记录数据。原始回答一旦捕获就不能通过编辑工具覆写。工作区仅是待载入草稿，Native 落盘仍需用户显式授权/确认和读回校验。

## 测试与证据登记

- PRECHECK：远端 main 起点、历史源码 blob、AGENTS、R20/R21 开发规范、模型/service、原生测试均已审阅。
- STATIC：待提交的 JavaScript 已经 V8 语法解析；禁止 innerHTML 赋值、自动图片元素、fetch/chrome 直接访问；待在仓库 CI 执行新增静态测试。
- COMPONENTS/CHECK/BUILD/VERIFY：**NOT_TESTED**（提交时 CI 尚未出结果时不得写通过）。
- REAL_CHROME_CONTROLLED_FIXTURE：**NOT_TESTED**，需核查同候选 CI 的真实 Chrome 安装/页面点击/iframe/保存、删除、撤权及 UI 截图。
- 最新主干改造前的 Chrome 同视口重拍、真实线上 ChatGPT、用户 Mac Native 文件落盘、系统剪贴板落地、独立 Tab 人工体验、浏览器 200% 缩放：**NOT_TESTED**。
- 视觉、布局、操作效率、功能、响应式、无障碍、数据安全、性能八维评分：**NOT_VERIFIED**，不能未看截图即给出 95+。

截图采样测试文件（跑通后）：artifacts/knowledge-inbox-r1/list-WIDTH-THEME.png、reader-WIDTH-THEME.png、edit-dirty-WIDTH-THEME.png、confirm-WIDTH-THEME.png、saved-outline-WIDTH-THEME.png、visual-metrics.json。WIDTH 是 CDP 模拟的 CSS 视口宽度，不能把 600/1000 的模拟宽度误报为原生 Side Panel 可直接拉伸到该宽度或独立标签页已验收。

## 开发与本地验收入口

1. 在干净 main 上核对状态、HEAD 和并行占用，不覆盖其他 Agent 的 dist/Profile。
2. npm ci --ignore-scripts --no-audit --no-fund（已有锁定依赖可复用），然后 node --check examples/sidebar-tools/knowledge-inbox/src/main.js。
3. node scripts/build-sidebar-tool.mjs examples/sidebar-tools/knowledge-inbox --out examples/sidebar-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json，并核对与 src/sidebar-tools/knowledge-inbox.opendesk-tool.json 完全一致。
4. node --test tests/environment/knowledge-inbox-r24-ui.test.mjs tests/environment/knowledge-inbox-r1.test.mjs tests/environment/sidebar-tools-host.test.mjs；npm run check、npm run build、npm run build:dev、npm run verify。
5. 在独占受控 CFT 环境执行：CHROME_BIN=Chrome-for-Testing-path OPENDESK_NATIVE_HEADED=1 xvfb-run -a node --test tests/framework/knowledge-inbox-native-r1.test.mjs（Linux）；Mac 上不使用 xvfb-run，保持单独 Profile，不借用其他任务浏览器。
6. 人工在 Side Panel 工具列表审阅/安装、对 chatgpt.com 单独授权、保存回答、搜索过滤、阅读/编辑、复制/下载/工作区、撤权/删除，并测试宿主关闭时的脏数据保护。不要误把「打开工作区」写成磁盘成功。

## 后续独立任务（非 R24 P0）

备份恢复、多记录合并、离线图片包、Markdown 追加、外部博客/Notion/企业知识库连接器：需要自己的持久化迁移/权限/负向测试与真实目的地回执；本轮不先行加入 UI。

本工作流将在拿到实际 CI 候选 SHA、构建日志、截图及异常修复后补充真实结果；保留 R1 证据原貌。

## R24 续接验收与最新发行状态（2026-10-11）

### 正式发布链路变更

R24 最初建立的 1.1.0 双份包同步方式，已由并行集成的 R4.5 官方资源目录治理替换。本节记录**最新实际源码**，上方 1.1.0 和旧路径保留为实施历史，不再当作现行安装步骤。

- 当前单一可维护源码：examples/sidebar-tools/knowledge-inbox/src/{index.html,style.css,main.js} 与同目录 tool.config.json；稳定工具 ID 为 knowledge-inbox。
- 当前 tool.config.json 版本：**1.1.1**。official-tools/catalog.json 按需声明可信项目及 optional 安装策略，不冗余登记具体版本、工具能力或 SHA。用户明确审核后安装，ChatGPT 网站权限另行批准；不做默认复装。
- 当前正式构建按构建脚本由源码产生 dist/production/official-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json 及官方 Catalog、digest/尺寸约束；不再把旧 src/sidebar-tools/knowledge-inbox.opendesk-tool.json 当成最新发行文件。普通作者仍可运行 npm run build:sidebar-tool -- examples/sidebar-tools/knowledge-inbox 得到独立包。
- 本轮 R24 改动后追加了 sandbox 通用 setState({dirty,busy}) 同步修复，避免编辑保存完毕之后被普通输入脏标记错误阻断退出。原文和个人草稿继续修订隔离，恢复原文后再次修改不会抹掉新草稿。
- 主仓最近存在并行 Page UI、工具市场、Native Workspace 的提交；不能仅凭后续 SHA 与本轮不同而声称整个最新扩展已经过同一候选 Chrome 全部验收。

### 已核实的原生与构建证据

| 候选 / 证据 | 实际结果 | 适用范围 |
|---|---|---|
| R24 既有闭环候选 079daf744a54cb70d9a8df0b1324c520145845a1，[Actions 38126123463](https://github.com/shopable-ai/opendesk-browser/actions/runs/38126123463) | 定向测试 110/110、生产/开发构建及 verify、真实 Chrome 受控流程 SUCCESS；全仓测试 1083 项、0 fail | 该候选保留 1.1.0 工具包；后续官方 Catalog 迁移需要新证据 |
| R24.1 并行候选 6e5f1dc7bc72a64c20a3aeda7c8e1d7ebfe83437，[Actions 38127099886](https://github.com/shopable-ai/opendesk-browser/actions/runs/38127099886) | 112/112 定向、双构建、真实 Chrome 均 PASS；全环境出现 Page UI LocalDev Webpack 无法解析 page-program-rules.js，结果 FAIL | 不是 R24 知识 UI 回归的通过记录；失败历史保留，不删测 |
| **本轮增强验收 dfffbf73837803de7d8b70e7c5d404c2297b4ab2**，[Actions 38127610335](https://github.com/shopable-ai/opendesk-browser/actions/runs/38127610335) | **整体 SUCCESS**：112/112 定向测试，production/build:dev/verify PASS，真实受控 Chrome 1/1 PASS，全环境 1095 项＝1088 pass + 7 skip + 0 fail + 0 cancelled | 最新 R24 筛选、状态、读写、卸载与授权流程的完整可追溯候选；不等于线上站点/用户 Mac 验收 |

最新 Chrome Artifact：[knowledge-inbox-r1-evidence，11697029299](https://github.com/shopable-ai/opendesk-browser/actions/runs/38127610335/artifacts/11697029299)，含 38 张 360/400/600/1000 CSS 视口、浅色/深色截图及 JSON 测量、正式内置包和构建报告。38 组 documentElement.scrollWidth 与 clientWidth 采样均无大于 2px 的横向溢出；保存回答、去重、撤权、编辑原文分离、恢复后再编辑、标签筛选/分类无结果、搜索清除、空收件箱、删除确认、宿主关闭保护和 SPA 复测通过。

证据校验索引：
- 下载的原始 CI ZIP SHA-256：df963bdb49df569d4079f41dc6d24a259ec295c19275125c505fcf05649e4b4b（1,770,976 bytes）。
- result.json SHA-256：58a5326d3350f10cac8f2c0a101dfa5568709de83bb70c19e1fdd966cad274c1。
- visual-metrics.json SHA-256：cf96e91f78f88ca95c27766d6d65d4ec6fcbd7362cf8fafc7f3857a34c706676。
- CFT 环境是 Linux Chrome for Testing 155，真实安装扩展、用户输入和受控 ChatGPT 形状页面；600/1000px 为模拟桌面宽视口，**不是**已证明 Chrome Side Panel 可手工拉伸到这些宽度。
- 生产包资源审计仍显示 SW 接近既有上限：321,939 / 327,680 bytes，余额 5,741；本轮没有放宽预算。对最新并行主干须继续遵守单资源占用和增量影响复核。

### 截图及独立质量评分（保守审查，非验收达标声明）

历史改造前截图位于 docs/framework/workstreams/evidence/knowledge-inbox-r1-20261011/ci-dece011-inbox-{light,dark}.png，展示旧版详情编辑态；新候选的 reader/list/edit-dirty/confirm/search-empty/category-empty/empty/saved-outline 截图由上方同一 CI Artifact 提供。**旧图与新图并非所有场景严格同内容同状态的完整前后对照**，不能据此夸大 UI 提升或声称完整视觉验收。

以下为根据真实 360/400/600/1000 截图、代码结构及现有定向/受控 Chrome 证据作出的**各维独立、暂定专家分数**。满分 100，不拿总分掩盖单项。不是用户测试、WCAG 自动化审计或用户 Mac 验收的结果。

| 维度 | 暂评分 | 证据与距离 ≥95 的具体缺口 |
|---|---:|---|
| 视觉设计与专业程度 | 87 | list/reader/light/dark 已去掉品牌口号和大片表单；正文首标题与详情标题可能重复，宿主浅背景与工具独立暗色存在断裂 |
| 布局密度与信息架构 | 89 | 38 组采样无横溢；360px 标签/排序/刷新同排仍拥挤，弱提示文字偏小 |
| 操作效率与易用性 | 89 | 默认阅读、主复制、次级菜单、清除筛选均实测；列表缺快速复制/近期编辑快捷入口 |
| 主要功能完整性 | 89 | CFT 的保存/搜索/草稿/撤权/删除通过；Native 实际写盘、真实系统剪贴板与恢复备份尚无交付证据 |
| 响应式和深浅主题 | 88 | 同一候选多宽度双主题截图；深色 iframe 与部分宿主明色界面未完全统一，200% 原生缩放未验证 |
| 无障碍与键盘交互 | 82 | 有语义标签/焦点/对话框键盘处理；未完成真实 200% 缩放、全页面 Tab 路径与 WCAG 2.2 AA 逐元素对比度审计 |
| 状态管理与数据安全 | 92 | revision 冲突、原始内容隔离、编辑 dirty/busy 与拒绝关闭 CFT PASS；崩溃后未保存草稿恢复仍无实现 |
| 性能与工程可维护性 | 90 | 构建通过，包受固定上限约束，无新增 UI 框架；200 条/150 KB 大内容的真实渲染性能和长期交互耗时未测 |

**结论**：改造已进入可用、可持续测试的产品版本，但八维均未可验证地达到 95。不得写为 EXPERT_95_PLUS_PASS；后续应以真实截图、键盘、对比度和重复工作流使用测量逐项收敛。

### 对其他可安装小工具的只读抽样（不擅自重写）

- quick-notes 的 CSS 目前仅 light scheme；React/Vue Starter 的 src/style.css 同样以浅色为主，后续应补独立沙箱暗色映射。
- reading-toc 有暗色、响应式、focus-visible，但存在 CONTENTS 装饰式重复头部，可按宿主实际标题精简。
- web-markdown-clipper、markdown-workbench 已有暗色和焦点规则，但工具内部再次显示工具标题，窄屏存在重复层级优化空间。
- 本轮只确认这些源码层现象，未对其他工具最新 Chrome 包进行新一轮原生验收；不将知识收件箱的评分或截图套用于它们。
- 可复用 UI 设计与实施规则已纳入 docs/api/sidebar-tool-development.zh-CN.md 的第 6A 节；该文档是所有工具的人/AI 开发规则，不将业务专有界面照搬为第三套框架。

### 后续严格分层任务

- **R24 产品质量**：移除内容首标题重复、提高 11px 辅助文字可读性，优化窄屏筛选密度，验证列表主操作和最近编辑的减少点击收益；保留重新评分证据。
- **原生可访问性**：360/400px、真实 200% 缩放、全部 Tab/Shift+Tab/Escape、Focus Return、明暗对比度逐元素与低权限状态；不要用 CSS 模拟缩放代替真实 Chrome 缩放。
- **真实用户环境**：在线 ChatGPT 结构变化，用户 Mac Native 选择目录/显式创建/读回、系统剪贴板、下载落盘、独立 Tab、站点撤权、卸载后数据边界，分别报告 TESTED/NOT_TESTED。
- **P2 隔离需求**：备份恢复、多记录合并、图片离线附件、Markdown 追加、博客/Notion/企业系统真实交付，另立数据迁移与权限合同，不混入 R24 UI 主流程。

## R24 v1.1.2 正式 UI 精简与独立通过记录（2026-10-11）

### 对上一节的当前值修正

本轮知识收件箱的真实 tool.config.json 已从 v1.1.1 升至 **v1.1.2**；当前仍由官方 Catalog 将源码打包为固定工具资源，用户审核安装、独立网站授权和沙箱/Native 边界均保持不变。上一节的 v1.1.1 是历史通过候选，不是当前工具版本。

变更提交：[fd00db355b2560ab519113d5bc2fae225b55167b](https://github.com/shopable-ai/opendesk-browser/commit/fd00db355b2560ab519113d5bc2fae225b55167b)。本次真实文件变更：

- 主体阅读时，如果第一条 Markdown 标题与记录标题文本严格相同，只在阅读 DOM 中显示一次。原始 Markdown、独立草稿、复制和下载导出都完整保留；不同文本的标题继续展示。
- 将刷新收件箱从与标签、排序同排的高密度工具条移入「管理」次级菜单，缩小 360px 布局竞争；标签/排序控件字号调整为 13px，结果计数、卡片元信息和脚注增至 12px。
- 同步升级真实 Chrome 标题负例、官方包一致性合同测试、用户使用说明和开发目录说明。没有引入新依赖、新 schema、新权限或第三套设计系统。

### 失败原始记录与修复边界

- [Actions 38128315221](https://github.com/shopable-ai/opendesk-browser/actions/runs/38128315221) 首次 v1.1.2 构建和组件 PASS，但 Chrome 在官方安装按钮前失败。官方工具入口已变成从可信 Catalog 异步创建，不能直接把按钮不存在视为业务未实现。
- [Actions 38128470443](https://github.com/shopable-ai/opendesk-browser/actions/runs/38128470443) 等待真实入口后仍超时，因此 [98e561627fcfbd2c196f0d21c20174cfa7da88a9](https://github.com/shopable-ai/opendesk-browser/commit/98e561627fcfbd2c196f0d21c20174cfa7da88a9) 加入只读现场诊断（目录文字、按钮存在/disabled、可见性、宿主状态），没有自动安装、模拟授权或放宽匹配。
- [Actions 38129128485](https://github.com/shopable-ai/opendesk-browser/actions/runs/38129128485) 候选 98e5616：受控 Chrome 实际安装/采集/筛选/编辑/删除/撤权 **1/1 PASS**；组件与双构建 PASS。完整 Node22 环境仍有 1 项权限清单测试断言失败：permission-gate.test.mjs 固定的旧 cookies/notifications 顺序，未覆盖新增 unlimitedStorage。失败不是知识阅读/草稿回归；不篡改失败历史。
- 并行主干随后按新的受控权限目录修复该断言，知识生产源码/Chrome 驱动及包资源未变化；本轮在下一候选重新运行**完整**知识 CI，而非将旧失败手工改成通过。

### 当前独立 SUCCESS 候选、原始证据

**候选 SHA：858fd2f858f1579bce646759c512a0221d44bd22**。完整 [Knowledge CI Run 38129262403](https://github.com/shopable-ai/opendesk-browser/actions/runs/38129262403) **SUCCESS**，job 114439991471：

| 项目 | 精确结果 |
|---|---|
| R24 受影响组件 | 113 tests / 113 pass / 0 fail / 0 skip |
| Source check、production、development、verify | 全部通过；SW 321,939 / 327,680 bytes，余量 5,741（持续 CRITICAL 预算提示） |
| 真正加载 MV3 扩展的受控 ChatGPT DOM Chrome | 1 / 1 PASS，逐步审核/安装、单独网站授权、保存/去重、搜索/标签/空态、阅读/编辑/恢复、禁脚本 Markdown、删除、工具关闭、SPA、撤权 |
| 全仓 Node22 环境 | 1,099 项：1,092 pass、7 skip、0 fail、0 cancelled |
| 视觉截图 | 38 张 PNG，360/400/600/1000 CSS 视口、明暗模式；38 组 iframe documentElement.scrollWidth 与 clientWidth 差为 0 |

CI 原始 [Artifact 11699121258](https://github.com/shopable-ai/opendesk-browser/actions/runs/38129262403/artifacts/11699121258)：ZIP 共 1,761,720 bytes、SHA-256 **a4102184bbaf80279a4b1f06d511249744a3101ecd61af99421b75623cfe55e3**。内含 result.json（SHA-256 547ff04df0cbf7f644679193c1e7129799fe46bb5c42c9ef3d6582b4cc714170）、visual-metrics.json（SHA-256 cf96e91f78f88ca95c27766d6d65d4ec6fcbd7362cf8fafc7f3857a34c706676）和可审阅的官方包。内置 knowledge-inbox v1.1.2 JSON 42,854 bytes，SHA-256 **6c465b74f626c63ba25f816c68f20984b8d1db5bea7b23e000687c41aa7cd3c2**。这些是本候选专属哈希，不复用到后续未知构建。

截图逐态检查：list 明/暗、reader 明/暗、search-empty、category-empty、empty、edit-dirty、confirm、saved-outline 均可辨识。阅读页可见标题一次、正文/代码优先、原文折叠；列表筛选和副作用按钮重组后层级更清楚；没有页面级横溢。仍有宿主浅背景与工具暗色内容区域的整体主题差异，以及窄屏工具栏小按钮密度，不能凭截图夸称 95 分以上。

本轮**不改变**前述八个独立暂定评分，也不把上述结构/测试成功称为八项均已达 95/100。真实用户 Mac Chrome、原生文件保存与读回、系统剪贴板落盘、线上 ChatGPT 实际页面、200% 真实缩放、全面 WCAG 2.2 AA/读屏键盘覆盖、已验收 ZIP/F3 仍 **NOT_TESTED**。不能将受控 CFT 实测升级为以上范围。

### 代码提交、后续并行影响核对

1. 组件/UI 主提交 fd00db355b2560ab519113d5bc2fae225b55167b；测试诊断提交 98e561627fcfbd2c196f0d21c20174cfa7da88a9；正式可追溯成功候选 858fd2f858f1579bce646759c512a0221d44bd22。
2. 该候选之后并行主干还修改了工具安装器/配额与资料文档。**后续 main HEAD 不自动成为同一个 Chrome 已验收包**；如发现实际受影响输入有变化，按 testing-guide 的 AFFECTED_INPUTS 进行最小补测。
3. 本次代码部署位于仓库 main 的上述提交；用户本地拉取最新 main、npm ci 后执行 npm run check、npm run build、npm run build:dev、npm run verify，再于专用 Chrome Profile 中审阅安装。源代码只维护 examples/sidebar-tools/knowledge-inbox/src/；官方包由构建自动产出，不能直接编辑 dist。
4. 下一轮优先：200%/高对比度/全键盘实测、Mac Native 真实保存、最近编辑/快捷复制减少点击的可用性实证。批量管理、备份导入、图片离线包、外部连接器按单独合同实施，不阻塞本次已验证的 R24 主流程。

## R24.3 —— 键盘导航、层级 Escape、焦点可见与正式测试续接（2026-10-11）

在既有 v1.1.2 的源码上增量实现，当前 tool.config.json 升级为 **v1.1.3**。仅修改知识收件箱示例、测试与文档，不新增权限、Native 入口、数据迁移或第三套 UI 框架。

### 产品改进

- 列表保留原生 button 与 Tab/Enter 语义：聚焦记录时可用 ↑/↓、Home/End 跳转；不拦截输入框或下拉框的键盘。
- Esc 在阅读模式优先关闭更多菜单、结构导图或原文信息；最后才调用同一防丢弃返回动作。编辑态仍保留未保存确认，返回列表恢复原记录焦点。
- 增加读屏可理解的列表键盘说明；恢复阅读标题 focus-visible 的键盘焦点轮廓。
- Chrome 新增两条通过受控 ChatGPT 页面可信 Save 点击持久化的记录，验证方向键/Enter/Esc/焦点恢复和撤销站点授权不丢知识。
- docs/api/sidebar-tool-development.zh-CN.md 的 6A 节追加这些可复用规则，不影响其他工具权限。

### 证据、失败与续接

- v1.1.3 HTML/CSS/JS 已做 Git blob SHA 精确核对，独立 Node JavaScript 语法检查通过，无资源预算变更。
- OFFLINE_STANDALONE_CHROMIUM：使用精确源码和 mock 业务数据，在 Chromium 360px 检查双记录 ↑/↓、Home/End、Enter、Esc、搜索快捷键 /、Ctrl+S 编辑保存、未保存弹层；模拟 180 CSS px 无整页横溢。它**不是**正式 MV3 安装、在线 ChatGPT 或真实 200% Chrome 缩放证明。
- 首轮候选 b3e5779d7e0d0f26d198f32b5aac231182a14e81 / [Actions 38133288210](https://github.com/shopable-ai/opendesk-browser/actions/runs/38133288210)：定向 123/123、源码与生产/开发构建及 verify 通过；CFT 新增 Enter 激活测试超时，整体 FAIL。Arrow/Home/End 之前的断言已通过，失败历史不得删除。
- 独立 Chromium CDP 复现表明仅 keyDown + keyUp 无法触发原生按钮 Enter click，而 rawKeyDown + char（回车字符）+ keyUp 可以，Playwright 原生 Enter 同样通过。只调整测试驱动，不改业务激活事件或跳过审批。修复提交 [556f7fdd93171be0fdee9c97d4eb300572eb5dd7](https://github.com/shopable-ai/opendesk-browser/commit/556f7fdd93171be0fdee9c97d4eb300572eb5dd7)。
- 后续真实扩展 Run [38133903314](https://github.com/shopable-ai/opendesk-browser/actions/runs/38133903314)，候选 556f7fdd93171be0fdee9c97d4eb300572eb5dd7，登记为 **PENDING / NOT_VERIFIED**（最近核查仍在 Actions runner 队列）。必须等全套测试和 Artifact 完成后单独归档具体成功、失败及截图，不可提升当前候选为 PASS。
- v1.1.2 成功候选和全部证据原样保留；主干其他任务有大量同时提交，不能把早期整包 PASS 直接转移到更晚 HEAD。全仓独立 Page 组件失败须如实保留，不关闭门禁或修改权限断言制造绿色结果。

### 后续明确未测

用户 Mac 在线 ChatGPT、真实 200% Chrome zoom、全键盘与 WCAG 2.2 AA 逐元素审计、Native 工作区实际落盘+SHA 读回、系统剪贴板、独立标签页、发布级 ZIP/F3 都是 NOT_TESTED。八维独立质量均 ≥95 的声明仍 NOT_VERIFIED。


### R24.3 复验终态 —— SUCCESS（2026-10-11）

上文 PENDING 状态是当时队列快照，现由精确候选的 GitHub Actions 实测替代。

- **正式成功候选**：556f7fdd93171be0fdee9c97d4eb300572eb5dd7，完整 [Actions 38133903314](https://github.com/shopable-ai/opendesk-browser/actions/runs/38133903314)，job 114453704982：**COMPLETED / SUCCESS**。
- **定向组件**：123/123 PASS、0 FAIL；Source check、生产/开发双构建及 verify 均通过。
- **真实 Chromium for Testing MV3 受控页面**：1/1 PASS。单独审核安装、ChatGPT 站点授权、保存/去重、草稿/原文与未保存保护、搜索/标签/空态、2 条通过真实 ChatGPT Save 点击建立的记录、原生 ↑/↓/Home/End/Enter/Escape、焦点返回、撤权保留两条已存数据、SPA 等通过。没有模拟 privileged 存储写入或跳过审核。
- **完整 Node22 环境测试**：1,148 项＝1,141 PASS + 7 SKIP + 0 FAIL + 0 CANCELLED。
- **严格体积合同**：SW 325,526 / 327,680 bytes，仅剩 2,154 bytes，仍处于 BUILD_SIZE_CRITICAL 风险；未为使 R24 通过而放宽预算。
- **原始 Artifact**：[knowledge-inbox-r1-evidence / 11700760465](https://github.com/shopable-ai/opendesk-browser/actions/runs/38133903314/artifacts/11700760465)，ZIP 2,101,076 bytes、SHA-256 72a187206a7cff75647ede0b58c079ed1820358b1f327b4dcaed2cdb63c7132f。44 张 PNG 截图包含 list、list-two-records、list-keyboard、reader、edit-dirty、confirm、search-empty、category-empty、empty、saved-outline；360/400/600/1000 CSS 视口与浅/深主题。44 组 visual-metrics 的最大 iframe 横向溢出为 0。
- **发行工具包**：生成的 official-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json 版本 1.1.3，44,583 bytes、SHA-256 8e5fa3060c89cce29e8bb7b18ffe9588b708e359b763fd21080f9b9d826c1c35；没有第二份手工生成源码。
- **审计原始文件**：result.json 638 bytes / SHA-256 8f44ce77f4557bcbdfe4f36ee7df2a966a012fc99147413b049dec1882028849；visual-metrics.json 6,719 bytes / SHA-256 a3445b6a475aef370c35c846553a87d1cf91e2d2c4fb4c0e87050f02d83dd278。

此成功仅适用于候选 556f7fdd 的受控 CFT/Node/构建矩阵。后续主干并行修改须先做受影响输入差异检查，不自动继承整体包 SUCCESS；已连接的真实用户 Mac、在线登录 ChatGPT、200% 系统缩放、系统剪贴板落盘、Mac Native 工作区实际文件创建与读回及最终 F3/ZIP 仍 **NOT_TESTED**。八维逐项 ≥95 的产品级最终验收仍 **NOT_VERIFIED**，不得因 CI 全绿擅自宣称视觉或无障碍达到 95。

## R24.4 Mac 本地验收 —— 01a12ade（2026-10-11）

状态：IN_PROGRESS。起点 `9fcd615559ae64d00c87ce22d25f7fe418ff638d`，远端 `aef8db9839b0be0481554af13990a1a329a4c330`，双方分叉且存在他人未提交阅读目录改动，不快进、不合并。仅本轮范围文件提交。证据目录 `artifacts/knowledge-inbox-r24-mac/20261011-01a12ade-01/`。

复用：556f7fdd 的知识收件箱源码未变；宿主、package/lock、WXT 输入已变，本轮做定向组件、双构建、真实 Mac CFT。资源：根 node/build/dev 未发现活动 cwd，构建沿用既有 43120 output guard；新临时 profile/随机 CDP 端口，旧 R16 CFT155/43129、Native 和其他 Chrome 不接管。禁止覆盖旧截图，驱动先支持独立证据目录。Native 临时目录独立，实际创建需明确确认；线上用户自行登录。
