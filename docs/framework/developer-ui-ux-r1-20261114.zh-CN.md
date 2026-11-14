# 开发 Tab UI/UX 优化目标 R1

**当前独立增量（2026-11-15）：** 继续完善 `prototypes/sidebar/develop/index.html` 的离线交互、间距与权限诊断，按[第13节](#developer-prototype-permissions-ui-20261115)执行。下方正式组件与运行环境的历史实施不扩大本轮范围。

日期：2026-11-14。当前阶段：**第11.7节：把用户认可的原型落实到现有开发 Tab，完成核心改进与最小验证**。第11节覆盖第1–10节冲突的入口、尺寸、功能常驻、三方案及评分门槛；11.7覆盖此前仅离线/待确认的边界。历史记录保留，本文件不是正式产品验收通过的声明。

设计决定入口：[DESIGN.md](../../DESIGN.md#开发-tab-uiux2026-11-14独立作用域)。视觉数值、组件与布局继续归 [R20](../architecture/sidebar-design-system-r20.zh-CN.md)、[R27](../architecture/ui-layout-conventions-r27.zh-CN.md)、[R28](../architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md) 与 [R33](../architecture/react-ui-shared-components-r33.zh-CN.md)，不建立第二套设计系统。行为门槛见[关键测试条件](developer-ui-ux-r1-test-spec-20261114.zh-CN.md)。

## 1. 最终目标与当前边界

**让开发者打开「开发」即可辨认当前来源、编辑对象、运行目标、可用主操作及真实状态；以最少必要层级完成编辑/调试、运行、看结果。** 保存、版本、安装、历史和权限仍可发现、可返回，各自保留原业务语义。

| 优先级 | 目标 | 可判断的完成条件 |
| --- | --- | --- |
| P0 | 主流程清楚 | 正常就绪态无需打开管理或诊断，即可编辑/选项目、明确运行或调试、看到状态和结果；主动作可见且对象明确 |
| P0 | 与其他 Tab 统一 | 页首、字体、按钮、字段、间距、状态和反馈复用现有规则；页面只有一层 gutter，无装饰性套卡、重复标题或第二套视觉变量 |
| P0 | 去除展示冗余 | 相同目的的入口和说明合并；可选关联、身份字段和技术详情不抢首屏；每个被移走的功能都有具名入口与返回路径 |
| P0 | 原能力零退化 | 编辑、编译、预览、保存、Run、Stop 和已有安装/撤权流程保持；切换与返回不丢草稿，不混淆当前目标、历史结果或运行 owner |
| P1 | 设计质量可复核 | 按六项设计检查点对照当前候选的默认侧栏前后证据，具体说明改善与剩余问题；独立评分在用户明确要求时执行，缺证据不计 PASS |

本轮按用户最新细化需求实施运行环境二选一、代码示例 placeholder、字段/间距一致性及本地项目主要动作前置，并用源码绑定预览进行截图复核。最新要求固定白色亮色调，优先改开发页排版；具体增量见第 7 节。原方案中的完整版本/安装/历史二级视图重组继续延期；不自动进入 production、安装全矩阵、极窄宽度/缩放矩阵或压力测试。评分仅对本轮取得的证据范围有效。

## 2. 已确认的现状与待验证问题

基于 `main` 当前源码及独立 designer 只读审查。下列结构事实可复核；“难发现、拥挤”等体验影响仍需当前原生截图和操作证据。

| 源码事实 | 优化判断 | 来源 |
| --- | --- | --- |
| 页面顺序组合上下文、本地项目、编辑器、执行、保存管理、诊断；有条件显隐 | 缺少清晰的“创作主线/对象管理”层级，不能用简单再加卡片解决 | [develop.tsx](../../src/ui/react/tabs/develop.tsx) |
| 来源使用“本地项目”开关，标题在“直接编辑/项目连接”间变化 | 来源属于互斥创作路径，建议采用同一具名来源选择，避免被理解成额外启用步骤 | [develop-editor.tsx](../../src/ui/react/tabs/develop-editor.tsx)、[local-project.js](../../src/ui/local-project.js) |
| 修改前本地项目选择后先放可选工具关联、关联说明和按钮，再放项目状态 | 状态与可用主动作前置；可选关联归项目设置，不让用户误以为关联是调试前提 | [develop-local.tsx](../../src/ui/react/tabs/develop-local.tsx) |
| 保存管理包含版本加载、Page 候选/安装、Controller 版本/任务表单、权限及删除 | 按当前对象组织二级视图；保留条件显隐，不声称所有内容同时出现 | [develop-advanced.tsx](../../src/ui/react/tabs/develop-advanced.tsx)、[script-editor.js](../../src/ui/script-editor.js) |
| 下载位于“运行结果 → 运行记录与技术信息 → 结果下载与任务查询” | 当前结果保留复制，历史记录与下载相邻；高级 runId 查询不作为普通下载前置 | [develop-execution.tsx](../../src/ui/react/tabs/develop-execution.tsx) |
| 下一次草稿运行期限与实际运行目标/版本放在同一区域 | 可编辑“运行选项”与只读“本次运行详情”分组，避免把未来设置误认为本次状态 | 同上 |
| SDK 授权与通信检查都归“高级诊断”；依赖按实现路径分散呈现 | 明确区分权限操作与只读诊断；依赖可收敛展示入口，保留各自控制器和校验 | [develop-diagnostics.tsx](../../src/ui/react/tabs/develop-diagnostics.tsx)、[develop-dependencies.tsx](../../src/ui/react/tabs/develop-dependencies.tsx) |

真实入口观察：使用 Ego Lite 本任务 TaskSpace，从 `sidepanel.html` 标签页中的“打开 OpenDesk 侧栏”进入，目录返回“已打开…请选择开发”。标签页本身显示本地任务目录，不能当作开发 Tab。Ego Page API 未列出新原生面板；原生 UI 观察连接超时。因此未取得开发首屏截图、当前模式/edition、实际加载路径、开发连接及候选指纹，不据此给当前界面打分。未访问 `chrome://extensions`，未替换加载目录或启动构建。

## 3. 目标信息架构

以下为总体布局方向；本轮已实施范围见第 6 节，其他内容继续延期。保留五个一级 Tab，不新增路由框架。

| 层级 | 常驻/按需 | 内容与主要操作 |
| --- | --- | --- |
| 上下文 | 常驻 | 唯一页首；“直接编辑 / 本地项目”来源；当前网页域名与可用状态。完整标题/URL 按需展开 |
| 直接编辑 | 该来源下常驻 | 代码类型、适用的执行环境、唯一源码编辑器；只读快照明确标识。参数、运行选项、依赖详情按需查看 |
| 本地项目 | 该来源下常驻 | 项目选择、连接/准备状态、适用的运行或“在侧栏调试”入口；空/断连态只突出一个有效下一步 |
| 执行反馈 | 常驻简明状态，结果按状态出现 | 原运行 Dock、当前状态、阻塞原因；结果可见、复制就近。运行中 Stop 清晰可达，不被管理入口替换 |
| 版本与安装 | 按需二级视图 | 当前对象保存、已保存版本、候选验证与原安装审阅；Page 与 Controller 分对象呈现 |
| 运行记录 | 按需二级视图 | 记录选择 → 单次结果/下载/实际目标和版本；runId 查询为内部高级项 |
| 项目设置 | 本地模式按需 | 源码关联、首次配置说明、连接详情；不增加调试授权前置步骤 |
| 权限与诊断 | 按需，明确分组 | Chrome 网站访问、脚本能力、网页 SDK 授权分别标范围；通信检查区区分只读检查与“授权并创建检查页”，后者明确后果并保留可信手势 |

首屏围绕上下文、创作、执行反馈三个逻辑区；不要求三张卡片。不新增大标题、副标题口号、统计卡或永久帮助横幅。来源首选复用现有分段控件；若适配暴露草稿/生命周期问题，先修原投影，不建立第二套状态源。

保存是高频能力：在创作区提供一个具名“版本与安装”入口，进入后优先“保存当前版本”，不埋在诊断或多层高级折叠里。危险动作归当前对象管理，保留原审阅；取消不产生副作用。

## 4. 保留、合并与降级展示

- **保留**：JS/JSX/Vue、Controller/Page、Standard/Developer 差异；编辑/编译/预览/保存/运行/停止；本地项目、任务候选、Page 安装、历史/下载、权限及撤权。
- **合并展示**：重复来源文案、相同对象的版本入口、同一次运行的历史/目标/版本/下载；依赖仅在证实当前模式确有重复入口时合并显示。原协议、数据与控制器不合并。
- **降级展示**：可选源码关联、首次命令说明、runId/SHA/完整 URL/编译产物和高级查询；阻塞原因、需要决策的权限范围、未知效果不能隐藏到这些技术详情中。
- **先核对再移除**：任何重复按钮/说明须列原功能、替代入口、消费者和验证条件；没有等价可达路径就保留。已安装 Page 的管理职责在「扩展」，迁移入口前须验证精确对象定位、返回和未保存保护，不直接删除开发侧动作。
- **必须区分**：当前活动网页与本次固定运行目标；目录关联与正式源码身份；保存候选与安装；Chrome 权限与 SDK 文档级授权；历史结果与本次结果。不能为去重合并这些语义。

## 5. 实施顺序、归属与停止条件

1. **取得当前基线**：真实侧栏进入开发，记录默认尺寸、模式/edition、加载路径/ID、开发连接/applied revision 与首屏截图。先走一条最短主链，确认最先出现的问题；不要先跑全组测试。
2. **首屏收敛**：调整上下文、来源选择、项目状态和可选关联层级，突出唯一创作区及适用主操作；先解决实际默认宽度下的布局问题。
3. **低频内容分流**：按对象整理版本/安装、历史/下载和权限/诊断，复用 R28 子视图/返回；保护同一编辑实例及原动作绑定。
4. **定向验证与视觉复核**：按测试规格验证改动影响的主链、返回/草稿、状态和安全保护，再用同候选前后截图独立评审；修具体缺陷，不为凑分扩写范围。

默认写入仅限 `src/ui/react/tabs/develop*.tsx`、必要的 `src/ui/develop-{view,fields}.js` 和 `src/ui/tool-shell.css` 开发页布局。共享外观仍归现有公共 CSS；确有至少两个消费者需求才改公共规则并验证受影响消费者。业务控制器只因可复现回归做最小修复，不扩成 SDK/Authority/Native 重写；用户代码保留原 sandbox。

只在现有 `main` 工作，不建分支/worktree/PR；保留并行 dirty。开发复用原 `dist/development` 和 watcher，产品源码变更后再按需验证产物；不启动第二 writer。未授权提交/推送，本轮不执行。当前已知并行改动包括 Page 启动/预览、Web Flow、Subagent 及其他扩展，本轮不写入其文件。

**规格完成**：目标、每项冗余的处置、功能保护、关键测试及延期范围明确，链接有效。当前 UI 实施状态见下节；不恢复原计划全部管理改版。

**产品优化完成（后续）**：当前候选已触发 P0 全通过、默认侧栏主流程有真实证据、无已知阻断回归，六项设计检查点有对应证据与缺口说明；交付修改清单、截图和验证缺口。独立评分不是本阶段前置。原生观察不可用时可继续独立源码工作，但不能宣称视觉/产品验收 PASS。


## 6. 本轮已实施的具体决定与验证边界

| 项目 | 实施与完成条件 |
| --- | --- |
| 运行环境 | 原 `controller/page` 值和动作保留，以「自动化 / 网页」原生 radio 分段展示；键盘可切换、忙态禁用；不新增一级 Tab 或第三种执行世界 |
| 默认示例（2026-11-14 最新要求） | JS 自动化、JS 网页、React JSX、Vue SFC 首次打开直接填入可编辑源码，不再用 placeholder。四种格式在原编辑器 owner 分别保留内存草稿、参数和身份；切回恢复修改或主动清空后的内容。只读快照不填充，切换不自动运行 |
| 说明层级 | 编辑器旁保留一句用途与明确 Run 提示；类型差异、侧栏与复合项目收进「如何选择运行方式」，原 edition 提示仍保留 |
| 本地项目 | 项目选择 → 真实状态 → 适用的连接/恢复 → 调试/保存 → 可选源码关联。原关联/身份与调试校验保留；只增加展示层的状态显隐；调试失败、失效关联及保存回执保留在按钮附近，不藏在可选折叠内 |
| 视觉一致 | 两组选择共用开发页 `developer-choices`；字段继续使用公共 `od-field` / `--od-input-border`。间距规范原已存在：说明紧邻 4px、字段组 12px、独立区域 16px；没有新增 Tokens 或第二套皮肤 |
| 复合项目说明 | [原选型页](../api/extension-development-selection.zh-CN.md#开发-tab-的运行环境怎样选2026-11-14) 解释 Controller / Page / Sidebar 的选择与既有 `page.module` 同包试点；帮助明确「本地项目 → 在侧栏调试」「扩展 → 导入 → 获准网站验证」的不同操作，侧栏预览不更新已安装网页代码；现有 Prompt Shortcuts 固定网页适配器身份保留 |

证据目录：`artifacts/developer-ui-ux-20261114/`。`before-final.png` 与 `after-refined.png` 使用同一正式根容器 class、520×1000 CSS 画布和 360×820 的源码工作台；预览通过实际 `SidebarAppShell` / `DeveloperPage` 与原 CSS 渲染，假状态明确为 `UI_PREVIEW_ONLY`。原六 Tab 综合预览入口因已搬迁的百度任务 fixture 缺失不能运行，本轮仅生成定向临时预览，不修改该无关入口。

续接时只读确认旧 watcher 已退出、Web Flow 当前源码与原 pin 一致，旧失败已不再阻断来源准入。随后并行 Page 刷新任务启动了正常 `npm run dev`（PID 59971，原输出 `dist/development`，日志 `artifacts/page-refresh-missing-20261114/dev.log`）；本任务先复用它，连接区重排编译成功；随后该 writer 在帮助文案重编译时耗尽约 4GB V8 堆并退出（摘要 `shared-writer-oom.txt`）。确认其已退出、输出守卫释放后，本任务沿原入口恢复一次 `npm run dev`（PID 65678，日志 `/tmp/developer-ui-recovery-dev.log`），最终 revision 为 `aeba5af1596c262883a46d211ca8e9fc8c45cc8ad23fe7e1d64f699b588ae294`，实际 tool-shell 已包含新帮助，产物 SHA 与 marker 相符。未修改 pin、手动清锁、并发第二 writer 或复制预览覆盖 dist。输出 revision/SHA 与候选记录见 `recovery-development-output.json`；构建不等于安装或运行生效。Ego 打开侧栏得到新原生 target，但 Page API 不将它列为可操作 Page；原生 UI inventory 也超时。观察到的扩展 URL ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`；实际加载路径、原生 mode/edition、serve/applied revision、真实编辑 → Run → 结果/Stop、Native/IME 与 production 仍为 `NOT_TESTED`。

独立 designer 对同尺寸直接编辑源码预览评分 **80 → 93/100**，四项视觉子分为信息层级 93、一致性 95、密度 91、可读性 93；本地未连接预览 91/100。未达正式各维 ≥95，亦不覆盖核心执行、Native 或安装态。续接按该问题将原 recovery 整块移到状态之后、灰色动作和可选折叠之前；连接按钮由工作台 y≈462px 前移到 y≈303px，状态到按钮间距 8px。原 ID、可信点击及连接状态投影均保留。测量证据确认编辑器说明间距 4px、字段组 12px、独立区 16px，源码/参数边框同色；键盘聚焦最末主折叠项后正文可滚动到达且不被 Dock 遮挡。评分和交互证据的范围分别记录，不相互替代。

续接证据：`after-local.png` → `after-local-recovery.png` 对比断连态，`after-refined.png` → `after-editor-recovery.png` 对比直接编辑；原 before 不重建。均为 520×1000 CSS 画布内的 360×820 工作台、浅色与正常缩放，当前截图来自 file:// 离线源码预览，等待 Switch 动画到达实际 checked 终态后采集。HTTP 预览曾出现已安装阅读目录的网页浮层，因此改用离线文件采集源码界面，未修改该扩展或产品样式。最终源码输入归 `recovery-final/inputs.json`，交互回执归 `recovery-ui-checks.json`，最终有限评审归 `review-recovery-final.json`。这些都不证明原生执行。

续接最终有限复评：独立 designer 判定 `PASS_SCOPED_IMPROVEMENT`，本地断连态 **91→94/100**、直接编辑保持 **93/100**，具体子分与边界见 `review-recovery-final.json`；未发现新的源码预览视觉阻断项，停止继续改版，不将结果提升为原生/六维 ≥95 验收。

## 7. 白色亮色布局增量

用户最新指出开发 Tab 排版最差。本增量只讨论亮色布局，先在原六 Tab React 预览验证提案，再同步真实 owner；未新建主题、Tokens、React Root 或业务状态源。

- 两行选择共用 80px 标签列与 8px 横向间距，避免代码类型、运行环境的选项起点错开。
- 编辑器默认高度按原值的 65% 设置，保留原字号、局部滚动和纵向手动拉伸；同一 520×1000 画布、360px 工作台下由 320px 变为 208px。
- 运行方式说明与可选参数并列为编辑器内次级折叠；运行结果、运行身份、保存管理和诊断保留原一级入口。保存管理通过内部布局组统一 16px 间距，Revision 标签位于输入行上方，输入与加载按钮同排；原 ID、事件与条件显隐均保留。
- 公共折叠统一 12px 字阶，一级 44px、内部 flat 36px，粗指针继续至少 44px。「我的」更多操作与其同级区域一致；扩展诊断复用公共折叠，清理正文移除重复 inset。此处服务已有多个真实消费者，不复制页面皮肤。

最新入口为 `artifacts/developer-ui-ux-20261114/workbench-source/index.html`，其中不注入提案 JSX 或 CSS；`inputs.json` 记录实际 259 项输入。前后截图 `develop-source-light-before.png` / `develop-source-light-after.png` 以及管理区对应截图均为相同亮色、画布和 360×860 工作台，before 仅调整预览外壳，移除实验控件并修正外壳 ResizeObserver 回调，不改基线 UI 内容与样式。原始基线文件保留于 `workbench-before/`，实验方案保留于 `workbench-preview/`。

开发页定向检查 10/10、共享布局相关检查 7/7、旧 Page 诊断入口交互 3/3 通过。完整共享测试另有缺少 `chrome` 和随后 SSR Portal 的测试环境失败，未改业务迎合测试；单独运行相关共享合同后通过。实际 Side Panel、已应用 revision、Native、真实 Run/Stop、系统 IME 与 production 为 NOT_TESTED；旧构建和独立评分仅属上次候选，不覆盖本增量。本对话未执行提交或推送；并行任务已将共享 main 的源码及合同断言分别纳入 `d1a1223a1`、`36fef5e3d`，保留该历史。

## 8. DOM 与间距归属方案（尚未实施）

### 8.1 当前决定、事实与根因

状态：**v2.1，双评审核查完成，等待用户明确确认；尚未实施**。只讨论白色亮色界面。允许调整早期 DOM，保留全部业务、事件、状态与安全合同。用户确认前仅维护本方案/验证规格/评审记录；不改产品、不构建、不启动 watcher、浏览器、安装或测试。该顺序来自本轮用户明确要求，优先于前轮“直接修复”。

2026-11-14 本轮只读重查：main；dirty 为 DESIGN.md、本目标/测试规格及并行云控 STAGE 文档。后者不属于本任务。workbench-source/inputs.json 的 **259/259 sourceInputs 哈希与当前文件一致，previewOverrides=[]**；它是有效的旧源码预览基线，不是新结构实现。

| 证据 | 结论及边界 |
| --- | --- |
| design-tokens.css:20–23 | 已有 4/8/12/16px，无 Token 缺失 |
| design-system.css:11/18/19/23/28/30 | p、row、label、textarea、details、details>section 自带 margin |
| 同文件:42/80/109–117 | od-stack gap=8；od-form-field gap=4；disclosure 又给每个正文直接孩子添加 margin/inset |
| develop-advanced.tsx 的 script-id 与 script-revision | 前者 label/input 分散，后者有字段 wrapper；同一父 gap 对两者关系含义不同 |
| develop-diagnostics.tsx 的 sdk-target-origins | label/textarea/help 是外层 grid 三个孩子；textarea 与 p 仍有默认 margin |
| tool-shell.css:173–191/275–289 | 局部清零和新 gap 只修了部分直接孩子；深一层或加 wrapper 后不再匹配 |
| 前轮同源亮色几何 | script-id label→input 8、Revision 4、SDK label→textarea 16、textarea→help 28（12+8+8），help→status 曾为24px。沿用已有测量，本轮未新运行浏览器 |
| 前轮主题根检查 | .od-theme-shadcn 数量为0，不能归因为该主题；今后仍记录实际 scope |
| 现有布局测试 | 多数验证源码字符串/组合合同，漏掉展开后最终几何；PASS 不能覆盖该缺陷 |

**根因链**：DOM 没有表达“字段/操作组/独立章节”的关系 → 多种组件同时拥有同一段空白 → 业务覆盖只能修中特定深度 → 静态测试无法发现最终叠加。过去调整 gap/margin 没有统一关系与所有权，所以不能收敛。当前已有规范方向正确，需要将其落实为稳定 DOM、明确正文槽和几何判定；不另建规范系统。

### 8.2 用户操作与目标 DOM 清单

保留既有大顺序“来源与网页 → 当前创作区 → 状态与结果 → 运行目标 → 保存管理 → 高级诊断”，保持现有默认 open/hidden 投影；不开展管理子路由、五 Tab 全量重设计。只有当前模式的创作区参与布局，另一分支继续挂载保存草稿。底部 DeveloperDock 的 Run/Stop 不搬入折叠。

| 区域/真实 owner | 目标组合与层级 | 默认/展开和间距 |
| --- | --- | --- |
| 来源与当前网页；develop-editor | 页首来源/本地开关 + 当前网页 primary。保留 source-switch 内 input + track 紧邻关系。网页标题/URL 为紧密文案组 | 来源→网页8；primary 正文用唯一 body，内部文案4 |
| 代码类型与环境；develop-editor | 保留 fieldset/legend、radio name 与 label/input/span；同一80px标签列。二者组成操作组，不套卡 | 行间8、标签列→选项8；允许选项换行，保留36px/粗指针44px命中区 |
| 编辑器/参数；develop-editor | 原编辑器字段组；下方同级 flat“如何选择运行方式”“参数 JSON”。参数 label+textarea 成 od-form-field | 编辑器区域独立字段组12；两个次级折叠8（移除原 gap:0），各自展开 body；帮助不重复渲染 |
| 依赖与编译产物；develop-dependencies/editor | Classic、Network、组件远程依赖、生成源码保留各自状态边界；details 只含 summary+body，移除 details 本身的 od-stack；锁选择、依赖条目、审核动作分组 | 同一依赖工作区8；条目/字段12，单条身份文案4；无数据按原 hidden，不制造空卡或新必审步骤 |
| 本地项目；develop-local | 项目选择字段组 → 真实状态/恢复入口 → 在侧栏调试/检查保存 → 项目参数（Controller可选） → 源码关联（可选） → 按需安装review → 连接诊断。后三类均保留原身份和显隐 | 状态与恢复/核心动作8；独立子组16，字段组12；项目参数作为本地创作区内 flat，前移到可选关联之前，避免落在诊断之后。首次连接方法 info 保留 |
| 保存与管理；develop-advanced | primary；body 内按原条件显示“脚本身份”“网页版本与安装”“Controller版本与任务”“高级设置”。这些是平铺 section，不每组再套有框 details | section 间16；section 内字段组12、动作与反馈8。保留当前模式条件，不把隐藏Page与Controller都显示 |
| 脚本身份 | script-id 与 Revision 都用 od-form-field；Revision 的 input+加载按钮是字段内8px工具行 | 两个字段组间12；label→control都是4。script-id不再与Revision使用不同DOM关系 |
| Page 管理 | 可见静态h3“网页程序版本与安装”标记本section并aria-labelledby关联；原page-preview-mode-title保留ID与动态“试运行”文字，降为内部说明标题，不再代替管理标题。保存候选动作/回执；已保存网页脚本字段组（label/select/detail）；加载/验证、安装/运行/停用/恢复/卸载/刷新维持原动作分组和顺序 | 字段组12；同一操作阶段8；权限/未知效果说明紧随所属动作，不折叠到不可见位置 |
| Controller 候选表单 | 保留 task-package-dev flat 与原受控字段，正文按“身份与描述”“参数与匹配/结果核验”“保存候选与状态”三个具名组；每组为section+可见h4并以唯一ID/aria-labelledby关联，组标题到组内字段列表8px；无需新路由、无额外折叠 | 组间16、字段间12、字段内4、操作与状态8。保留所有字段、placeholder、校验与冻结/验证/安装语义 |
| 运行结果与历史；develop-execution | 原状态条仍在折叠外；结果 primary；body 内工具栏+结果8，历史 flat；历史选择/查询/下载字段统一，完整历史继续 flat | 状态→结果8；历史字段组12、字段内4；结果空态保留“尚无结果”，结果区域不隐藏 |
| 运行目标与版本；develop-execution | 保留 primary，不塞入结果/管理的关闭祖先。deadline字段组+身份文案组；业务主动打开路径不变 | 字段与身份组12；身份文案4；值长则换行，不扩大页面 |
| 高级诊断与SDK；develop-diagnostics | 外层primary；SDK、目标健康flat。各有body；SDK按说明、网页/文档/服务、目标origin、批准快照、批准/查询/撤销、状态结果分组。批准快照仍默认open | 字段组12、字段内4；同一操作8；快照与显式动作保留先后，不删权限范围/风险说明。目标健康地址也成字段组，按钮在控件工具行 |

这不是把所有 details 统一上边框：primary 表达可独立折叠的主功能；flat 表达已在某上下文内的设置/技术细节；info 只用于首次解释入口，沿用现行共享外观，不增加视觉方向。业务类用于布局/状态，不自动构成新 variant。

### 8.3 唯一间距 owner 与正文槽

| 关系 | 唯一 owner | 现有 Token / 规则 |
| --- | --- | --- |
| label → control（或工具行）→ help/error | od-form-field | 4px；fieldset的legend按原语义单独核对，不把视觉隐藏label当占位行 |
| 同一操作组、状态与关联动作、关联次级折叠 | 对应 od-stack / od-toolbar | 8px；按钮允许换行，双行时 row/column gap仍8 |
| 相邻独立字段组 | 开发业务的字段列表父布局 | 12px；不新增全局 gap alias |
| 独立章节/管理section | developer-editor / management父布局 | 16px |
| summary → 首个正文，primary/info左右及底部 | 公共 od-disclosure-body（拟新增的可选正文槽） | 顶8、左右12、底12；flat 顶8、左右0、底0。正文只收一份inset |
| 文案内标题/值/次信息 | 文案小组 | 4px；列表/代码块内部留白不当作外部间距 |

**选择可选 body 槽，而不全局删除旧 margins。** 正式新增名拟为 od-disclosure-body；只是现有 disclosure 的组合槽，不建立新 React 状态组件、Root、组件包或 Token。两处首批真实消费者为保存管理 develop-advanced 与 SDK/健康诊断 develop-diagnostics；开发页其他折叠逐项迁入同一规则。共享CSS由框架owner维护，业务分组继续属于各开发组件。

组合合同：details 的直接孩子只有 summary 和一个 body；body 中只有一个有间距语义的布局根（od-stack、od-form-field、业务字段列表、管理section列表或单个pre）。body 本身只负责 inset、min-width:0 和隔离 margin 折叠（如 flow-root），不再给每个业务孩子分别加 margin。不在 details 元素上声明 grid/flex，保留原生关闭语义。

实施采用**宿主opt-in规则**，不修改现有公开字段/disclosure规则。已核实 scripts/preview/shared-tool-design.mjs:90/129 会将公共字段与disclosure切片给HTML工具，src/entrypoints/sidebar-shared-ui.js:21/27另提取button/theme切片。因此不再把导出影响当作未知：新规则放在design-system.css原 sharedEnd（Keep the trusted tool host）之后，位于两条公共切片之外。复用现有可信根 .opendesk-react-app 限定；不新增主题或Root，不给沙箱导入宿主样式。

在该宿主范围内，.od-disclosure > .od-disclosure-body 显式 margin:0、max-width:100%、min-width:0，按primary/flat/info设置padding；原逐孩子margin仍供无body旧结构使用，body通过固定组合选择器优先级覆盖，不更改summary外观。可用固定规则 .opendesk-react-app .od-disclosure > .od-disclosure-body（specificity 0,3,0）覆盖旧last-child规则（0,2,1），flat同级规则随后声明；这是唯一声明位置，不加ID链/!important或业务补丁。

**body > 唯一布局根必须 margin-block:0**，包括普通div/section、od-stack、od-form-field及单pre根；body自己的margin也为0。flow-root只隔离折叠，不能替代这项清零。保留布局根内部padding、pre背景/局部滚动、ol缩进和checkbox命中区；body不接受裸文本，先包装为单个文案/布局根。于是首根border-box距summary底边只有8，primary/info末根border-box距details内底边只有12，flat为0；pre内文本padding不算外部inset。

od-form-field直接孩子margin-block:0的修复只限原可信根下 data-workbench-page=develop 与 data-workbench-page=tasks 两个既有页面，不影响其他Tab/iframe。这两个消费者分别为开发字段与“我的”任务参数；后者为横向control内含label的结构，保留原DOM，仅比对无漂移，不套开发纵向字段oracle。body内od-stack/工具行的直接布局项也在同一宿主规则中清理外部margin；开发外层父布局只清自身直接布局项。不作全后代reset。宿主规则不得夹入button/theme/publicRules提取区；定向检查实际导出CSS的视觉声明不新增上述宿主规则（整体来源digest变更需单独记录），不重打无关工具包。

内容起点统一为：primary/info 的内容左边 = details外缘 + 实际左border +12；flat 的内容左边 = 所在父内容左边，不再缩进12。正文与summary的**标记起点**同轴；不强迫正文对齐箭头之后的标题文字（标题额外含标记宽度与gap）。同层级正文右边相应对齐。现行summary 44/flat36是单行最小高度，长摘要允许增高；粗指针至少44。不改主题/字体/颜色。

不新增 spacing alias：当前四个值及组件/父布局足够表达语义；只在实际第二消费者出现且现有语义不能表达时另提方案。编辑器208px上限、140.4px最小高度及20.8vh原公式、局部滚动与拖伸保留；真实独立视口下的计算值按测试规格9.2判定。

### 8.4 代表性前后结构（示意，非已落地源码）

现状 SDK：不同关系散在父 grid 中，gap8 会被用于label→textarea，子margin又叠加：

~~~tsx
<section className="developer-diagnostics-body od-stack">
  <label htmlFor="sdk-target-origins">额外批准的目标 origin</label>
  <DevelopField as="textarea" id="sdk-target-origins" className="od-field" />
  <p id="sdk-target-help">原范围与风险说明</p>
</section>
~~~

提案：让一个字段成为父布局的一个孩子；使用普通稳定wrapper，不改变字段key或动作：

~~~tsx
<DevelopField as="details" id="developer-sdk-diagnostics"
  className="od-disclosure od-disclosure--flat">
  <summary id="sdk-title">网页 SDK 授权管理</summary>
  <div className="od-disclosure-body">
    <section className="developer-diagnostics-body" aria-labelledby="sdk-title">
      {/* 字段列表父布局 gap=12，其他原内容按8.2保持 */}
      <div className="od-form-field">
        <label htmlFor="sdk-target-origins" className="od-field-label">
          额外批准的目标 origin
        </label>
        <DevelopField as="textarea" id="sdk-target-origins"
          className="od-field" aria-describedby="sdk-target-help" />
        <p id="sdk-target-help" className="od-field-help">原范围与风险说明</p>
      </div>
    </section>
  </div>
</DevelopField>
~~~

保存管理同理：原 script-version-identity 中分散的label/input合成 od-form-field，与原Revision字段组并列；management-body保留作16px分组布局根，由body包住。除8.2明确的Page静态标题与候选分组标题，保留所有原props、文字与状态；原page-preview-mode-title仍由控制器投影试运行格式说明，不能把它改成静态管理标题。上例只省略展示无关属性，不能照此删字段属性。

删除/收敛清单按迁移单元执行，不先全仓删CSS：

- 新body替代已迁移折叠的逐孩子margin/max-width；无body旧消费者保留原路径。
- 移除 developer-management-section 用8px同时排列label与字段组的旧规则，改12px字段列表；重复的 management-section margin清零与内部 od-form-field gap覆盖随新组合删除。
- developer-history-field 改用 od-form-field，删除其8px字段gap、label/input margin清零及 :not(:first-of-type)追加margin。把 .developer-history-disclosure>pre 和 >p 明确迁移为 >.od-disclosure-body>pre / >p（单根形式），保留pre的240px max-height/overflow和说明文字字体；若内容改用布局根，则按真实根路径迁移，不以更高specificity补偿。历史按钮布局保留；只有新路径命中且旧路径无消费者才删旧规则。
- developer-results-body、developer-history-content、developer-diagnostics-body 保留有意义的布局角色，删除原来补偿disclosure inset/元素默认margin的重复声明，不重绘summary。
- local-project-guide>ol / >button 改为 body内明确结构选择器，保留list缩进和按钮对齐。manual-source-editor、外层16px与来源/状态8px有效规则保留；source-options gap0改8。
- 只有旧规则无剩余真实消费者、同单元几何与交互通过后才删除；已有高specificity胜出时查来源并删旧声明，不加更长ID链或 !important 叠补丁。

### 8.5 交互保真、可访问性与状态

1. 单DOM owner、原ID唯一、htmlFor/aria-describedby/legend/role及Live Region保留；不重写 SDK/Host/Authority/通知。保留Type、name、options和本地/手动参数默认值，不能改成defaultValue/defaultOpen。
2. DevelopField 使用 field.className ?? props.className，整串覆盖。默认snapshot由 develop-fields.js / develop-view.js 投影；先盘点真实计算类。新body/field wrapper优先用普通JSX；必须改字段类（如local参数primary→flat）时同时更新默认字段模型与所有动态写入来源。textSet字段不得包业务孩子，避免被投影清掉。
3. 保留switch input + track、radio label>input与span、developer-run-feedback直接span；后者的 :has(>span…) 不能被wrapper破坏。保留fieldset禁用继承与首legend例外；不把真实控件移入legend。
4. 回调继续patch-before-action、传原event.nativeEvent，一次操作一次action；details toggle只同步open，不保存、不运行、不授权。稳定key和reviewId保留；无需条件卸载重建编辑器或参数。
5. 原hidden是唯一业务真相。没有额外默认关闭的祖先挡住结果主动open；manual/local/readonly/Page/Controller边界保留。空容器不得以padding/gap留下空洞：纯布局wrapper无可见孩子时不参与布局（由现有状态派生hidden，或仅用于无功能布局的精准选择器）；不能用 :empty 泛隐所有p/role=status/未知回执。隐藏控件不可Tab到，且 [hidden] 不得被display:grid规则反盖。
6. 保留安装review可聚焦section/tabIndex、子控件Escape冒泡到原处理器及busy拒绝取消；wrapper不stopPropagation，不重复授权。busy/unknown/撤权栅栏及结果未知不重放。
7. summary支持Tab、Enter/Space和可见focus；同tab开合/重渲染不丢草稿、选择、open或手动高度。折叠含当前焦点的正文时，只有实际发生焦点不可见才归还该summary；不把后台状态刷新变成无条件抢焦点。
8. 工具行以minmax(0,1fr)/min-width:0缩放，按钮分行不截字；80px标签列只用于两行选择，不强制所有表单横排。长URL/SHA/说明换行，源码/日志保留各自局部滚动；不设固定正文高度。默认360px为主，受影响长内容用320px单点保护，不恢复极窄/缩放全矩阵。

### 8.6 确认后的文件级实施、验证与回退

| 顺序 | 文件/动作 | 完成条件与范围 |
| --- | --- | --- |
| 0 | 重查main/diff、实际产品入口与服务owner；记录受影响文件哈希与旧渲染基线 | 保留并行文件；当前阶段不提交/推送、不建分支/worktree/PR。涉及产品时先报告dist/development及实际连接状态，未知不写在线 |
| 0a | scripts/preview/build-sidebar-six-react-preview.mjs及原build-preview.mjs增加可选panel视口壳；冻结dom-layout-before | DOM/CSS迁移前完成；按测试规格9.2读回真实视口/media query/高度并保留输入SHA和截图。先建立可比较before，不改产品DOM |
| 1 | tests/environment/developer-editor-interaction.test.mjs 及原相关行为测试 | 先保住本次会移动字段的草稿、toggle/open、hidden祖先、事件一次性、review焦点/Escape。只补实际缺口，不写CSS字符串镜像。测试为fake actions时标明不证明权限真手势 |
| 2 | src/ui/design-system.css；develop-advanced.tsx、develop-diagnostics.tsx；必要的develop-fields.js | 先在保存/SDK两个真实消费者接body和字段组合，读最终class、几何与交互；此步不清其他Tab旧disclosure正文 |
| 3 | develop-editor.tsx、develop-local.tsx、develop-dependencies.tsx、develop-execution.tsx；必要的develop.tsx | 按8.2逐区迁移，保留open/hidden边界；去details的od-stack；修本地params层级。每个单元过关后删其补偿CSS |
| 4 | src/ui/tool-shell.css；必要的develop-controls.tsx | shell只保留业务父布局/响应式/滚动。controls预期只读；只有证实投影与合法组合不相容才最小调整，不能为排版改变事件协议 |
| 5 | 复用第0a步panel视口壳与已冻结before，生成dom-layout-after；测试规格第9节 | 只生成/采集after并对比同条件before，保留inputs与截图/测量；单目标ego TaskSpace用后释放；不覆盖历史preview或并行dist |
| 6 | docs现有R27/R20组合说明与本目标/测试规格、DESIGN | 实施后在原权威章节更新body组合，不创造平行规范。按源码/预览/构建/实际运行分别写结果，停止在本次核心布局范围 |

公共CSS相关时，定向保护“我的”参数字段与 task-history-panel/task-tools、扩展 ec-page-diagnostics/ec-preinstall-diagnostic 的展开布局及查看/返回；不改其业务DOM。若采用宿主范围field reset导致它们计算值不变，记录同候选的无漂移结果即可。其余Tab只在选择器实际命中且有变化时补查，不默认全量验收。

最小验证详见现有测试规格第9节：先行为保护，再结构迁移，再最终render几何/交互。Node针对开发的三文件、共享合同相关case、受影响的语法/类型检查按改动触发；Workflow已知chrome fixture失败先分类，不修无关模块。不以旧10项PASS代替展开几何。纯方案阶段只核对文档/链接，不跑这些检查。

回退按最小迁移单元：保存修改前受影响hunk与哈希；失败时先保留日志/截图，只撤本任务该单元变更，保留其他owner的新修改。不得git reset/checkout整文件覆盖并行工作。可选body未接入的消费者原样，局部回退不要求全站跟进；不引入运行时实验开关作为第二条长期布局路径。核心交互回归即停该单元扩散，安全/权限回归立即回退受影响单元；单纯旧测试选择器失效先查合同，不为断言保留坏DOM。

### 8.7 评审量表、硬性失败与未知

只评**解决方案质量**，不评当前产品、不代替浏览器验收。独立native reviewer继承父model/provider，不给目标分答案；作者不自评。两位分别从信息架构/设计及实施/回归审查同一版本，均需≥95且无阻断；取低分判断，不取平均掩盖问题。未达标按具体意见修订，重新核查同一权重；不允许只调分或放宽口径。

| 维度 | 满分 | 评分证据/扣分依据 |
| --- | --- | --- |
| 信息层级 | 15 | 8.2是否覆盖全部真实操作、主次折叠与保留的延期边界 |
| DOM/组件一致性 | 20 | 8.3–8.4组合、真实消费者、迁移与删除路径是否明确 |
| 间距所有权 | 20 | 每段空白唯一owner、四档语义、inset/例外、级联/隐藏处理 |
| 可访问性/响应式 | 10 | label/legend、焦点/键盘、长字/换行/窄点是否可执行 |
| 交互保真 | 15 | snapshot/事件/草稿/open/hidden/原生语义/安装review与安全 |
| 可维护性 | 10 | 文件边界、无第二系统、可选迁移、删除/回退与文档归属 |
| 验证可执行性 | 10 | 最终几何、失败定位、候选绑定、行为与预览/原生证据边界 |

硬性失败：遗漏核心功能/改变权限或执行合同；让busy/unknown可重放；新布局没有唯一spacing owner；仅字符串测试；不处理snapshot类覆盖/祖先隐藏；缺同视口几何标准；无法安全保留并行修改；将方案分数冒充产品通过。任一项即不可交付实施批准。

当前未知：真实Side Panel的加载/服务/应用revision，迁移后最终计算样式/交互，ego对原生侧栏与权限手势的能力，OS IME和production。它们不是本轮已证实的PASS；确认后按当前入口最小验证。旧preview可证明旧DOM，不能保证新DOM。方案批准后遇到需要新增公共变体、重写业务协议、扩大五Tab或无法保持原生语义的情况，停止该扩展部分并给出具体修订，不静默扩大实施范围。

### 8.8 独立评审与修订记录

- v1：设计97/100，无阻断；实施94/100，有B1（body单pre根margin未闭合），未达到双评审门槛。原始逐项证据、扣分与风险归 artifacts/developer-ui-ux-20261114/dom-plan-review/v1-*-review.json；原v1文档快照和manifest保留。
- v2：修订body唯一根margin、宿主导出边界、历史pre/p路径；补Page静态管理标题、候选可访问分组和长表单键盘路径；预览改为真实独立文档视口，旧520画布仅保留历史比较。权重/阈值不变。v2设计100/100、实施99/100，均无阻断；实施仅扣1分于8.6/9.2的预览前置顺序不一致。
- v2.1：把panel壳与before冻结明确移到第0a步、DOM迁移之前，第5步只生成after；其余方案及测试规格不变。两位已实读SHA/快照并核对该差异，无新阻断，确认原100/99分仍适用，不追满分。随后只更新本状态与评审记录，未改受评设计/验证合同。

| 固定维度 | 满分 | 设计视角 v1→v2.1 | 实施视角 v1→v2.1 |
| --- | --- | --- | --- |
| 信息层级 | 15 | 14→15 | 15→15 |
| DOM/组件一致性 | 20 | 20→20 | 19→20 |
| 间距所有权 | 20 | 20→20 | 17→20 |
| 可访问性/响应式 | 10 | 9→10 | 10→10 |
| 交互保真 | 15 | 15→15 | 15→15 |
| 可维护性 | 10 | 10→10 | 10→9 |
| 验证可执行性 | 10 | 9→10 | 8→10 |
| 合计 | 100 | 97→100 | 94（B1阻断）→99（无阻断） |

v1扣分依据为：Page标题歧义、候选分组语义/长表单键盘步骤不明确、单pre根margin遗漏、历史直接子选择器迁移遗漏、窄容器冒充窄文档视口。v2.1均已在方案中修订。实施99分保守保留v2对顺序不一致的1分扣除，评审核查修正后明确不重新追分。设计满分仅表示该视角未发现剩余方案扣分项，不代表零实现风险或产品满分。

证据原件：[v1设计](../../artifacts/developer-ui-ux-20261114/dom-plan-review/v1-design-review.json)、[v1实施](../../artifacts/developer-ui-ux-20261114/dom-plan-review/v1-implementation-review.json)、[v2设计](../../artifacts/developer-ui-ux-20261114/dom-plan-review/v2-design-review.json)、[v2实施](../../artifacts/developer-ui-ux-20261114/dom-plan-review/v2-implementation-review.json)、[v2.1设计核查](../../artifacts/developer-ui-ux-20261114/dom-plan-review/v2.1-design-addendum.json)、[v2.1实施核查](../../artifacts/developer-ui-ux-20261114/dom-plan-review/v2.1-implementation-addendum.json)。同目录v1/v2/v2.1 manifest与不可变快照绑定各次受评正文；两个reviewer均由native subagent独立执行，未指定模型/provider覆盖，未改产品或运行环境。

方案门槛：**通过（两视角最低99、无阻断）**。截至本次v2.1方案评审，产品/预览/安装/运行均未验证；之后新增的有限demo证据仅归第8.9节。残余风险为宿主CSS真实命中、草稿/焦点与祖先显隐、panel壳和几何oracle待实现、真实Side Panel入口/服务/revision及权限Native证据未知；它们必须由确认后的定向验证解决，不能由方案分数豁免。
- 用户批准：**待确认**。无论分数如何，本轮不自动实施。

### 8.9 可交互示例与正式页面的关系（2026-11-14补充）

用户追问“示例怎样、直接修改页面还是新 demo”后，本轮新增[独立离线 demo](../../artifacts/developer-ui-ux-20261114/dom-proposal-demo/index.html)，用于确认前直接观看。**现在创建的是独立提案页；确认后修改的仍是现有开发 Tab，不新增正式产品页面。** 正式组件、公共 CSS、开发 watcher、安装包及运行环境均未由本轮改变。

demo 有“当前布局 / 提案”并排对比与“只看提案”，仅白色/浅色。七个按钮分别呈现默认编辑、保存管理、网页管理、任务候选、SDK 授权、本地项目、结果历史；两个 iframe 分别具有真实 360×860 或 320×860 CSS px 视口。每侧可独立滚动、展开折叠、编辑草稿及切换代码类型/运行环境；切换场景只投影离线状态，不替换源码草稿。执行、安装、授权、连接等动作按钮禁用，服务勾选是只读示例，浏览器没有连接真实 Host/Native/网页。

复用的是当前源码的 SidebarAppShell、DeveloperPage、DevelopField、原预览 view 和原 Tokens。生成器仅在 `artifacts/developer-ui-ux-20261114/dom-proposal-demo/` 内保存六份组件的提案副本与演示样式；不把模拟 DOM 写回 `src/`。`inputs.json` 记录本次155项源码输入、六份覆盖内容及生成 HTML 的 SHA256，不能拿旧预览或旧评审 manifest 冒充本次来源。重建仅运行同目录 `build.mjs`，属于离线 demo 打包，不是产品 build 或新 watcher。

重点先看“SDK 授权”和“保存管理”：前者实际测得标签→控件 / 控件→说明从16/28px变为4/4px；后者脚本 ID 与 Revision 都是4px字段内间距，字段之间从8变为12px。“任务候选”展示三个具名组，“网页管理”展示新增静态管理标题而保留动态试运行说明；“本地项目”展示参数前移到源码关联前并使用 flat。所有原178个静态ID在副本中保留，仅新增四个标题ID。

demo 的14个状态组合（七场景×两宽度）无 workspace 横向溢出；被采样的展开 disclosure 均是 summary+body，首正文根距 summary 8px且根margin为0。键盘与草稿证据归 `interactions.json`，几何证据归 `geometry.json`，截图与边界说明归[demo README](../../artifacts/developer-ui-ux-20261114/dom-proposal-demo/README.md)。这仅证明这些离线示例，不替代第9节的产品实现验证；动态依赖、真实安装审阅、Native、系统IME及正式Side Panel仍为NOT_TESTED，产品95分验收继续延期。原方案设计100/实施99分不转移给demo。独立designer复核指出的三项示例缺口均已修正，并只读复核确认无剩余阻断或实质误导，原文归 `review.json`；没有给demo或产品新评分。

## 10. 内容、信息架构与交互提案重做（最新目标）

### 10.1 状态、原因与交付边界

用户最新判断：看不出完成，截图观感评分很低，旧demo可能只好一点，内容也需要优化。**接受该反馈作为当前结论：旧demo未满足用户的设计目标，提案未完成。** 原几何通过和文字方案100/99分只保留历史作用域，不能推翻用户反馈，也不再作为本轮收尾证据。

本轮目标是把「开发」从低频设置与长说明堆叠的面板，重做为清楚的“选择来源→编辑/选项目→明确运行或调试→看结果”工作台；版本、历史、权限与诊断可发现、按需进入、能返回。内容与交互的改动必须在实际可见候选中显著体现，不能仅用几px间距或外层说明代替。

当前只写独立demo及本文件、对应测试规格与DESIGN.md。允许在demo内重组版本/历史/设置子视图和文案；不改变正式产品组件、DOM/CSS、控制器、权限或SDK，不启动产品build、watcher、安装、发布，不提交/推送。demo可复用原打包依赖生成自己的离线产物，不写dist。正式实施必须等用户明确确认最终可审阅候选；本目标的停止点是合格提案交付，不把用户尚未回复记作完成或阻断。

### 10.2 具体结果与信息层级

1. 默认编辑首屏以创作对象为中心，清楚区分直接编辑/本地项目、JS/React/Vue、自动化/Page的语义；显示当前目标与真实可用性。主操作具名，不要求先读长帮助或进入“高级”。
2. 本地项目首屏先显示选择、当前连接/准备状态和适用下一步；Sidebar调试与Page/Controller运行不混淆，不以可选源码关联为前置；离线演示不伪造Native就绪。
3. 结果与当前操作关联，成功/错误/运行中/未知可辨认；错误和恢复仍可见。历史、完整身份与高级查询不挤占创作区，查看历史不会覆盖草稿或冒充本次结果。
4. 保存与版本是具名入口，进入后优先当前对象的保存/加载；Page与Controller各有适用管理，不把全部生命周期按钮同权重平铺。任务候选、安装/卸载等复杂表单或危险动作在所属子视图，原功能保留。
5. 权限管理与只读诊断分清；网页SDK明确是文档级授权。说明采用“用途/范围→必要字段→批准快照及后果→明确动作”，精确origin/document、服务、撤销局限及未知不重放等必要披露不能被摘要替代。
6. 保留现有白色/浅色Tokens、字体/焦点/字段/按钮组件与唯一React根。降低噪声靠去重和归位，不靠缩小文字/点击区、装饰卡片或删除能力。

### 10.3 内容处置与功能映射（编码前必备）

以下为最小盘点；demo编码前按原组件与ID补全可查的内容对照。每个迁移项记录原内容/动作、真实owner、新位置/入口、保留/精简/改写/归位理由、影响状态及测试ID。不能以“已优化”代替对照。

| 原区域 | 内容决定与目标位置 | 保留的关键语义/状态 |
| --- | --- | --- |
| 来源与当前网页 | 创作上下文合并为紧凑摘要；完整URL与精确身份按需进入 | 当前活动网页不等于固定运行目标；未连接/受限不得写就绪 |
| 类型/环境与长帮助 | 选项名称及适用关系就近简述；完整运行方式/组合项目步骤按需查看 | React/Vue是网页组件；选择/编辑不执行，不替换已有源码 |
| 源码、参数、依赖、运行选项 | 源码常驻；参数与下一次运行选项就近，依赖摘要按当前状态显示 | 必须批准的来源/风险不能藏；草稿期限不冒充本次运行期限 |
| 执行状态、结果、历史、runId | 当前状态/结果常用；记录及下载归同一历史对象，技术查询降级 | 当前/历史标签、原Codec、复制对象、错误与Stop所有权 |
| 保存管理 | 当前对象版本入口；保存/加载优先，冻结候选/任务表单分步呈现 | 保存不安装/运行，精确ID/revision/generation及原审阅 |
| 本地项目、连接、关联、诊断 | 项目/状态/适用动作优先；可选关联与首次命令归项目设置 | 未连接原因不能折叠，授权/来源身份与已有保护不省略 |
| SDK、网站访问、健康检查 | 设置下明确分组；授权与只读检查名称分清，长技术解释按需 | Chrome与SDK作用域、精确文档和origin、撤销与未知后果 |
| 编译产物、SHA、安装技术值 | 所属对象的技术详情 | 可查且可返回，不新增另一套存储或Authority |

有状态/权限含义的段落逐句核对，不以整体长度比例作删除指标。正常说明目标是一句说清当前关系或下一步；不设机械字数上限，避免长句换成无法理解的术语。

### 10.4 演示与来源合同

唯一新候选入口拟为 `artifacts/developer-ui-ux-20261114/content-proposal-v2/index.html`；完整壳为可直接打开的自包含文件，不能把带未替换占位符的模板HTML当交付入口。demo外层导航只负责选择案例/比较，不是产品新增导航；评审必须单独查看内部360px画面，禁止靠外层解释补齐产品含义。

优先复用SidebarAppShell、DevelopProvider/DevelopField和现有预览view及组件，在内存副本/本目录呈现提案；原业务state与执行/权限链不改。复用原组件不表示复用原信息堆叠；为表达子视图可加demo内展示状态，但不另建产品框架/Token/Root。每个控件有原功能映射，导航不会调用Run/安装/授权。所有真实执行动作禁用并给出离线原因；可操作的演示状态单列“示例”，不能把模拟Stop/成功当真实业务回执。

输入、覆盖、样式、生成HTML和候选标识保存SHA；默认/展开/状态截图、控件操作、两位review均绑定同一最终候选。旧demo原样保留为对照，不覆盖历史证据；源码预览、正式源码、产物和运行证据分别报告。

### 10.5 质量与停止条件

以对应测试第10节为准。独立设计和交互reviewer分别对**内容清晰、信息层级、视觉密度、核心操作、状态反馈、可访问性**逐维评分，均需≥95/100且无阻断；只读文字方案不得给可见体验分，未观察的行为明确NOT_TESTED而非推断满分。分数须附当前截图/控件证据、具体扣分和余项；不取平均值、沿用旧分或指定答案。

默认360px正常缩放为主要证据，320px及短视口仅验证受影响的换行、操作可达和滚动；不扩为全主题/浏览器/缩放矩阵。权限/Native/真实Run/系统IME/正式SidePanel与production未连接就保留NOT_TESTED，不阻断已授权的提案工作，也不据此宣称产品通过。

满足以下全部条件才交付“提案目标完成”：内容对照和功能映射完整；同候选关键demo检查通过；两个独立review逐维达标无阻断；打开入口可用，明显改善能从内部画面与真实交互辨认；交付前后截图、可交互demo、原始评审、检查与限制。正式产品仍待用户确认，不能把提案完成写成产品完成。


### 最新视觉纠偏与移交（2026-11-14）

用户再次指出没有看见明显的 UI 排版/布局优化，并质疑 Vue 等低相关检查的优先级。**视觉目标仍未完成**。下一 owner 先改独立 demo 的可见布局、密度、对齐和内容层级，优先展示同尺寸前后图，再做与改动直接相关的最小验证；不先重复 Vue/兼容测试、完整审计或追逐评分。正式产品改动仍待用户确认。

上次候选 `content-v2-bd2983b47db89d0f` 的离线检查与两份独立评分只证明各自观察范围：设计 96/97/95/97/96/95，交互 96/97/95/97/98/97。它们不覆盖最新用户视觉判断，也不证明全部条件功能等价或真实产品验收。`content-proposal-v2/acceptance.json` 已改为 `VISUAL_GOAL_NOT_MET`；旧原始报告保留，不能把自动汇总的“完成”当继续依据。91项操作/审计检查无需在输入未变时重复。

### 最新覆盖：方案选择，暂停单候选微调（2026-11-14）

用户认为本轮版本可能更丑，要求先比较解决路线及评分排序。当前不继续 content-proposal-v2 的迭代或补测，也不把其17项局部离线检查当作视觉通过。建议路线为“必要功能分级 → 一份与旧布局解耦的需求MD → 同内容/同Tokens/同360px视口的3种独立布局 → 用户比较选择 → 只精修胜出项”。需求MD复用本规格作为唯一入口，功能映射另作证据，避免复制出第二份相互竞争的规范。此路线尚待选择，不自动生成下一套页面；独立离线提案不等于新正式页面，正式实施仍待明确确认。

## 11. 认可 R2.6 基线上的真实需求与离线提案（当前有效）

### 11.1 用户任务与边界

**直接编辑的核心是：把完整脚本输入普通多行文本框，选择必要的执行位置，交给现有入口运行/停止，看到状态、返回值与可恢复错误。** 不以 IDE、文件工作区、版本管理器或发布控制台为目标。第10节的失败候选不再迭代；不要求三种布局、双评审95+或全矩阵。

本轮入口是 `prototypes/sidebar/develop/index.html`（R2.6，纯 HTML/CSS/JS Mock）。2026-11-14 重查 main 与 dirty 后，以 ego-browser TaskSpace63 实际查看直接编辑及未选本地项目，内部360×860；新截图见 `artifacts/developer-ui-ux-20261114/reference-r26-recheck-{edit,local}-360.png`。最初未正确维持视口的截图已用实际360×860重新采集，不将外层窗口尺寸当内部视口。

保留：白底、轻边框、紧凑选择、164px可拉伸textarea、清楚的底部主动作、单列排版。问题：任务态仍见网页发布；“存快照”语义不清；参数、空历史和SDK占据默认注意力；历史/下载/runId/身份混组；未选本地项目仍像可运行。独立离线提案属于可信开发Tab的展示研究，不是新扩展、Sidebar Tool或新正式产品页。

用户任务按发生顺序：

1. 输入或粘贴完整脚本；编辑、换类型、切来源和查看其他内容不执行，不覆盖草稿。
2. JS 必须能区分“自动化（page）/网页（document）”；React/Vue 只用于网页组件，且受真实 edition 可用性约束，不推定为侧栏应用。运行前校验真实目标与所需权限。
3. 明确点击现有Run；运行中Stop只作用于该运行owner。只提供运行器实际支持的停止，不暗示回滚网页效果。
4. 就近看状态和结果；失败指出原因与下一步；结果未知时持久提示、核查原记录，禁止自动或一键重放。
5. 需要模块、npm、CSS/资源或已有外部编辑器时，切“本地项目”：选已授权目录→看准备/连接状态→执行适用操作。Sidebar Tool 是“在侧栏调试”，Controller/Page 是对应运行；不自建文件编辑器/Git。
6. 为日后复用而保存脚本，与安装/发布为独立任务。保存不执行、不授予权限、不自动安装；安装审阅仅在明确进入该任务时出现。

### 11.2 功能处置（不以旧DOM或测试ID为理由）

| 功能/信息 | 本轮处置 | 用户价值、证据与去向 |
| --- | --- | --- |
| 普通textarea、完整粘贴、原生选择/撤销/换行、纵向拉伸 | 默认保留 | 核心输入；R2.6及真实develop-editor均已使用textarea，默认164px延续认可基线 |
| Tab插空格、Escape后Tab离开、编辑快捷运行、文件树/行号 | 从提案移除 | Tab直接到下一控件，无隐藏退出模式；不引入快捷运行。粘贴保留原缩进。是否给高频作者可选缩进属以后验证，非当前前置 |
| JS执行位置与当前网页摘要 | 默认保留 | 真实Controller/Page执行世界不同；来源见develop-editor及公开local-projects；完整URL按需，实际固定运行目标在本次详情 |
| React/Vue | 按条件出现 | 保留格式选择，不同时塞入全部任务；A保留小分段，B用单一格式选择。选择不替换源码；网页组件/edition限制就近说明 |
| Run/Stop、必要状态及返回值 | 默认保留 | develop-execution和原Dock；Stop按真实运行状态/支持能力出现。离线只用明确模拟按钮，不调用Host |
| 参数JSON、下一次运行期限 | 按条件出现/合并 | 有参数需求时打开“运行选项”；期限只影响下一次草稿，不混入上次运行身份；本地Controller有自己的参数 |
| 当前结果复制/下载 | 按条件出现 | 结果出现后就近，绑定该条结果与真实Codec；不与runId查询捆绑。离线按钮禁用，无剪贴板/文件副作用 |
| 过去运行记录 | 按条件出现 | 有记录时在结果附近给“过去运行”；无记录时不占一张空卡。技术值不当记录标题；核对develop-execution |
| runId手工查询、hash/revision/generation | 移到诊断/只读详情 | 可支持故障定位和身份校验；运行系统必须保存不等于人必须输入。查询归“权限与诊断”，运行身份归所选记录详情 |
| 保存脚本与加载 | 默认保留入口/合并 | 底部“保存脚本”与“已保存脚本”具名入口；保存的是可复用源码，底层固定快照由原存储承担。首存名称可收集；不把revision当必填 |
| 快照、按版本加载与删除 | 移到管理 | develop-advanced已有能力；在已保存对象下按需显示时间/版本及高级身份，不与普通保存平级。是否能自动生成ID、是否需命名迁移仍待正式实施核实 |
| 本地源码版本操作 | 从默认提案移除 | 源码历史由外部编辑器/Git负责；Browser仍可保存执行/安装需要的不可变版本，但不做Git分支/提交/回滚UI |
| 本地项目选择、刷新与适用动作 | 默认保留（该来源） | local-projects与develop-local真实入口；未选禁用运行，错误/连接恢复可见；Sidebar预览不等于安装或网页代码已更新 |
| 首次连接、目录授权说明、可选工具关联 | 按条件/项目设置 | 未连接显示恢复；已连接不重复授权。关联只是目录指针，不证明安装来源、不授予安装权限；长命令与诊断不默认常驻 |
| Page安装、任务候选、发布 | 移到管理 | 具名“安装与发布”入口进入相应对象流程，编辑页不默认放表单或“网页增强·试运行与发布”卡；审阅/冻结/验证不省略 |
| 已安装对象的启停/卸载 | 移到所属管理，尚需核实跳转 | Page归“扩展→网页增强”，Task归“我的”；正式迁移前核实精确对象定位/返回，不能凭目标位置就删原动作 |
| 依赖/编译 | 按条件出现 | 确有模块/编译失败时显示原因和原恢复；来源、许可证和hash归详情；短脚本不需要常驻“检查固定版本” |
| 网页SDK、Chrome网站访问与授权 | 按条件/权限任务，保留可操作管理 | 缺权限时在Run前明确范围及可信授权入口；SDK精确origin/document/服务与Chrome许可分开。原型在“权限与诊断”内默认折叠保留能力/跨站范围选择、模拟批准、查询与撤销，不以说明卡替代管理；普通Run不依赖SDK配置，日常无故障不放“已加载”宣传卡。真实产品继续复用DevelopDiagnostics与原Authority |
| 健康检查、授权并创建检查页 | 移到诊断并区分副作用 | 前者只读；后者必须原可信手势与说明；离线均不真实触发 |
| 历史HTML/旧测试 | 尚需核实/保留 | 它们是证据与消费者，不是用户功能；仅审计，不删除、不修改历史断言以制造通过 |

源码证据只用于确认能力存在，未证明真实运行可用：`src/ui/react/tabs/develop-{editor,local,execution,advanced,diagnostics,dependencies}.tsx`；公开说明 `docs/api/local-projects.zh-CN.md`。正式实施先复用这些owner及现有RunHost/Authority，不新建执行、授权、存储或路由系统。

### 11.3 R2.6与现行风格：复用与验证

| 项目 | R2.6 | canonical现状 | 本轮判断 |
| --- | --- | --- | --- |
| 颜色 | ink #1b2c49、brand #365eda、白底 | 主色相同；sub #5b6e86，muted #f5f7fb | 直接引用原亮色Token快照，沿用蓝主动作，不套可选黑色shadcn主题 |
| 边框 | line #e1e8f1；输入 #dce3ed，很轻 | line #dfe6ef；input/action border #7f8da1更重 | 卡片直接用line；候选保留轻输入轮廓，聚焦用focus。正式od-field的深轮廓需原消费者中另验，不能批量替换后宣称更好 |
| 字阶 | 13正文/12.5且较重标题/11辅助/11.7代码 | 13正文/12说明和页首/11技术值 | 标题12/600、说明12，11只给次要技术值；不靠缩字省空间 |
| 高度 | 常规36、图标34；小选择34 | 常规36、图标34、折叠44/flat36 | 尺寸可复用；164px输入框为本次离线基线，旧216/208断言不自动适用 |
| 圆角 | 控件8/卡片12/胶囊 | 相同 | 直接复用radius-control/surface/pill |
| 间距 | 4/8/12/16，gutter11 | 4/8/12/16，gutter12 | 对齐12外缘，关联8、说明4、独立区16；不叠加全局p/label/textarea margin |
| 按钮 | 蓝Run，白次按钮，字重650 | od-button次按钮灰底+深边框；页首Ghost | 主动作/图标尺寸直接用；保留R2.6轻次按钮，正式secondary的观感列待验 |
| 焦点 | 2px品牌outline；textarea内部1px | 统一2px focus、offset2 | 统一可见焦点，textarea不屏蔽outline，Tab自然离开 |
| 布局 | 单列+独立正文滚动+固定底部61 | 原工作台Root/分区/唯一gutter | 沿用完整壳与Dock，减内容噪声；不创建第二Root/全局Token/正式页面 |

候选内嵌的light token块是原文件的离线快照，标来源/hash；不是新设计系统，也不改全局CSS。暂不整包导入design-system的document reset、默认margin和重轮廓；正式原语的可用性/观感分开判断。

### 11.4 候选与停止条件

- A：保留R2.6目标卡、来源开关、代码分段、带草稿头的164px输入框、参数折叠与结果布局；拆走技术/发布噪声，对齐Token与正文层级。
- B：同一视觉语言，代码格式收为一个选择器，普通textarea去掉虚构文件头；选项用轻入口，当前结果集中，管理有具名入口；同样保留保存与本地项目。
- 使用相同目标、源码、选项与示例结果，360×860内部视口和完整Dock。先截图比较；只精修更好的一个。若无明确改善保留R2.6，不无限微调。排序及取舍是设计判断，不替用户宣布审美认可；路线预估与页面质量不互相冒充，不预填95+。
- 当前目录拟为 `artifacts/developer-ui-ux-20261114/r26-based-proposal/`；R2.6原文件与旧截图保留。历史用途与候选清理表另作为本节审计证据，不建立第二需求规范。
- 方向选定后只验证输入/草稿、展开/返回/焦点、360及必要320/短视口、模拟Run/Stop。离线动作注明模拟或禁用，禁止真实执行/复制/下载/安装/授权。
- 实际Side Panel、Host Run/Stop、Native、权限授予/撤销、安装升级、系统IME及production均NOT_TESTED。当前原生goal读回null；旧对话goal跨对话状态未知，不改其生命周期。

### 11.5 本轮交付与具体取舍

已制作[对照入口](../../artifacts/developer-ui-ux-20261114/r26-based-proposal/index.html)、[A](../../artifacts/developer-ui-ux-20261114/r26-based-proposal/a.html)与[B](../../artifacts/developer-ui-ux-20261114/r26-based-proposal/b.html)，各自自包含、无需服务。默认编辑及本地未选场景采用相同数据，360×860完整截图见同目录。

| 判断维度 | A | B |
| --- | --- | --- |
| 内容清晰 | 拆走空历史/网页发布/SDK状态；“保存脚本”可理解 | 再去掉文件头，输入更直接；其他格式需打开下拉 |
| 视觉主次 | 最接近认可基线，主动作/输入/设置边界清楚 | 更空，设置弱化后有接近说明文字的问题 |
| 密度 | 本地页减负明显；结果下留白较大 | 再省空间主要成为留白，未形成决定性收益 |
| 操作发现性 | 保留紧凑代码分段和有边界设置 | 格式/设置发现性弱于A；主Run/保存仍可见 |
| 风格一致性 | 延续R2.6轻边框、蓝主动作与卡片语言 | 色彩一致，但无框设置行与卡片入口混用 |

候选排序 **A→B**，不把R2.6排成失败版本：独立评审认为两者本地页有清晰的信息减负，但尚不足以证明整体观感超过用户认可基线。作者最初倾向B，收到上述看图证据后改以A优先，仅补A的模拟状态保护并做最小检查；不继续B微调、不增加第三方案。路线收益/风险为定性判断，实际页面也未打数值分，没有把路线预估冒充页面质量。

A普通输入/草稿/返回焦点、Run/Stop呈现、未知不重放与320短视口的15项离线检查通过，详见原测试规格第11节。保存只是当前页内存演示；版本加载与真实安装禁用，不能冒充已完成。R2.6原文件hash未改，六个历史HTML、README与原测试都未修改或删除。

历史文件清单与消费者证据见[用途审计](../../artifacts/developer-ui-ux-20261114/r26-based-proposal/history-audit.md)：当前index、README、测试保留，6个旧HTML按历史归档身份保留在原处；候选整理仅是README过时行动指引与实现写法断言，不在本轮执行。当前源码未发现生产消费者；CI确实执行原测试，不据此把测试字段当需求。

停止于可审阅离线交付。保留认可基线和A/B供用户比较；正式现有开发Tab的改版、真实运行/权限/安装验收及所有产品构建仍待未来明确授权。本轮只在main写独立artifact与这三份设计文档，保留全部并行dirty，未创建分支/worktree/PR、提交或推送；未启动/停止产品服务或写dist。

### 11.6 用户认可简化方向后更新原型入口（最新）

用户反馈“现在感觉简化了很多”，并同意更新 `prototypes/sidebar/develop/index.html`。已采用11.5优先的A，逐字节复制为当前index；11.1/11.5中的“index是R2.6/未改原文件”描述是此次提升前的记录，当前路径以本节为准。此授权仅覆盖离线原型，不扩展到正式开发Tab。

判断：先前存在展示层的过度设计，把低频安装/发布、历史和技术查询与输入/运行平级，且混淆保存源码和执行快照。系统仍须记录真实目标、runId、revision/hash、权限与未知状态；这次改变它们的出现时机与去向，没有以简化为由废除能力或保护。

| 此次保存在原型目录的文件 | 处理 |
| --- | --- |
| `index.html` | 当前A，自包含HTML/CSS/JS；SHA-256 `dd0685f7da03814fc0612d9adae18605e769d5121ba61095bbd82774ae5b1628` |
| `r2.6-baseline-preview.html` | 新增原样快照；SHA-256 `96ae44df81e820a7b06b73e2bb622c7f9711eba076acb1a7ebac2bd8ab1a7f73`，保留认可基线 |
| `README.md` | 更新当前入口、取舍与演示边界；旧行动指引明确仅作历史 |
| `preview-contract.test.mjs` | 当前检查语法/静态关联/离线资源边界；旧布局、ID、Tab及安装断言只读取R2.6快照，不强迫当前原型恢复旧设计 |

六个既有历史HTML原地保留，不删除。A/B生成器、B候选、比较截图和评审留原artifacts目录，不成为当前原型的运行依赖；需求/测试继续使用这两份原规格，不复制另一份到原型目录。新路径最小核对通过，详见原测试规格11.4；未修改正式产品源码、构建或dist，未提交推送。

### 11.7 现有开发 Tab 核心实施（上轮记录；11.8覆盖）

用户现已授权将认可的index落实到现有开发Tab，并建立本对话原生goal。当前完成范围是核心代码、受影响最小验证、可审阅画面与准确未测边界；不恢复三方案、95+、完整矩阵、production或安装验收。11.1–11.6中的“仅离线/正式实施待授权/goal为null”保留为历史阶段记录。

类型与归属：这是可信开发工作台UI，由现有 `src/ui/react/` 根组合；不是新Sidebar Tool、Page Program或Controller安装项目。未发现需要修改公开SDK/Authority的缺口，执行、版本、安装和权限继续调用原owner。

| 用户操作 | 实施与复用 |
| --- | --- |
| 输入完整脚本 | `develop-editor.tsx` 保留单一原生textarea，默认164px并可纵向拉伸；紧凑JS/React/Vue，JS位置使用原字段的原生select；无Tab缩进拦截或快捷运行 |
| 选择运行选项 | 参数和下一次Controller期限归同一折叠；React/Vue、依赖准备与错误仍按原投影和edition显示，不增加授权 |
| Run/Stop与结果 | 原nativeEvent交给原action；Run先返回编辑，Stop按原可停止状态出现在Dock，跨管理视图仍可达；当前/选中结果复用唯一字段与Codec，未知状态不因导航重放 |
| 保存/加载 | 底部具名保存入口；原Controller CAS持久版本和Page Candidate不变。沿用ASCII脚本标识，明确输入约束；Controller保存自动递增，Page保留可选版本号。保存不运行、不安装；已有延迟加载防覆盖检查保留，未另增确认合同 |
| 管理/历史/诊断 | 展示状态只导航，不调用业务action；编辑器始终挂载，返回恢复触发点焦点。历史、下载及手工runId查询分开，后者在诊断且可见所选结果；删除在可见脚本标识的管理任务内；Page刷新与旧安装/启停/卸载入口保留 |
| 本地项目 | 原选择/刷新→状态与恢复→侧栏调试→参数/安装审阅→可选关联/诊断顺序。原安装审阅无关闭祖先；Dock检查保存调用原本地owner，不把Sidebar调试变成Controller运行 |
| 成功回执 | Controller保存/加载/删除、Page保存与复制成功接原共享Toast；原错误和未知状态仍持久，复制拒绝不发成功消息 |

修改限原Develop组件、`develop-view/fields`、成功反馈接线及Develop作用域CSS和定向测试。未创建第二Root/Token/执行器/存储/权限层。仅在现有main编辑，无提交推送；并行「我的」、ToolHost/Workflow样式和其他文档改动原样保留。本任务未修改原型及R2.6快照。

原型版本边界：实施依据为开始时认可的index，SHA-256 `dd0685f7da03814fc0612d9adae18605e769d5121ba61095bbd82774ae5b1628`。收尾观察到index并行变为 `d16fc06427681c0843eae356e31d72501db0497bcd27c2929504fd013a6394e4`，运行位置改为radio，且按格式/位置保存独立草稿。本轮正式组件仍为select与单一保留源码，未同步这两项后来差异；未覆盖并行原型，也不声称与其当前版本完全一致。R2.6快照仍为 `96ae44df81e820a7b06b73e2bb622c7f9711eba076acb1a7ebac2bd8ab1a7f73`。

运行环境：保留已有 `npm run dev` PID92181，输出仍为 `dist/development`，无第二build/writer。实际ego侧栏ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、视口360×601，读回服务连接和指纹 `43a246773610`；实际空编辑器高度164px。通过精确侧栏DOM切换本地来源，Native显示已连接但源码Provider未接入，随后恢复直接编辑。该切换是程序化呈现检查，不是可信Run/授权手势。

画面保存在 `artifacts/developer-ui-ux-20261114/core-implementation/`：`live-dom-static-360x860.png`、`live-local-static-360x860.png`、360×601及320×600静态记录。它们从实际侧栏DOM/CSS冻结生成，未编造就绪数据，**不称为原生窗口截图，也不证明真实Run/Stop或本地项目可运行**。原生AX与截图窗口绑定不一致，已停止该处操作、释放UI锁。定向测试、额外失败分类和NOT_TESTED见测试规格11.5。


### 11.8 认可原型的正式组件对齐（当前有效）

当前授权延续11.7的核心实施，目标是让真实Develop Tab接近本轮认可原型的布局和呈现。基线固定为开始时读取的 `prototypes/sidebar/develop/index.html` SHA-256 `d16fc06427681c0843eae356e31d72501db0497bcd27c2929504fd013a6394e4`。不恢复完整矩阵、评分、production、发布或新goal；本轮实读goal为null，未创建/修改goal。

| 用户操作 | 最终实现与必要语义 |
| --- | --- |
| 看当前目标、输入代码 | 原目标标题/host/状态组成轻卡；JS/React/Vue与JS运行位置采用紧凑原生radio；带真实文件名的单textarea默认164px，可拉伸，无Tab缩进拦截 |
| 切换格式/世界 | 原editor owner维护Controller、Page、React、Vue四个直接编辑槽，分别保留源码、参数、ID/revision和已加载Page状态。首次空槽填原示例；主动清空后不再填。切换不运行、不授权；readonly项目、busy及unknown仍阻止不合法切换 |
| 运行选项与结果 | 参数JSON、Controller草稿期限在具名可选折叠内；原依赖/模式说明保留。当前结果默认可见；“本次详情”进入原运行身份，“下载选项”进入原持久下载控件，避免仅导航却声称下载 |
| 保存与管理 | 具名返回+单组保存卡，ASCII稳定ID及Controller自动revision/Page显式version不变。管理页无空执行区和空Dock；实际错误/未知/恢复反馈持续可见，运行中Stop仍在原Dock |
| 本地项目 | 选择/刷新、真实状态、有效恢复与侧栏调试保持主流程；首次指南及关联/参数/连接归设置。原安装审阅在可选折叠外，调试错误不被折叠隐藏 |
| 真实状态 | 当前页面不可运行时Run仍禁用；示例对照不替换真实目标/结果。原权限、冻结身份、版本、未知不重放、取消与迟到回包保护保留 |

复用边界：原可信React根、DevelopField/View、RunHost、脚本/本地项目owner与现有Token；CSS只改Develop区域，未创建第二框架/存储/权限层。外层真实工作台导航与品牌由原owner负责，不复制原型mock外壳；这是保留现有产品合同的差异。原持久结果JSON下载仍需要其原选中对象，界面清楚称“下载选项”。

视觉证据：`artifacts/developer-ui-ux-20261114/core-implementation/alignment-compare.html` 和 `alignment-compare-final.png`。左为认可基线截图，右为正式JSX/CSS的同数据静态呈现，每侧360×860；不是用新HTML重画产品。目标卡64.5px、编辑卡199.5px、textarea164px、选项y408.59375、Dock61px/y799与该基线记录一致；另看本地、React、保存、安装、诊断与320×600。必要的真实状态文案、稳定ID/版本和权限披露保留，不给无依据的“100%”数值。

运行证据：沿用 `dist/development` 与扩展ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；已有writer现为PID42614（并行owner恢复，本任务未启动/停止）。精确本任务window的Side Panel读回“开发服务已连接”、指纹 `ef13e4c35bcd`，六份链接CSS hash与实际dist文件一致，见 `alignment-live.json` / `alignment-runtime-assets.json`。实际目标是不可运行的扩展页，原已存在结果原样保留；本轮未点击Run。实际DOM/CSS冻结文件与源码示例fixture分别记录，不能把静态截图当原生窗口截图或可信执行回执。

并行边界：取证时原型已被其他owner继续更新为 `e24c1920a888a6e761676c3495b4673ba89c41983533bb0bf7bf3ef9019922ec`，包含新增调试信息和后续布局差异；该文件及并行改动原样保留。新增范围不自动变成本轮认可基线，本轮未声称匹配该后续版本。原 `alignment-prototype-content.png` 保留认可版本的实际画面；后续版本另记，不混写输入hash。无提交/推送、安装或发布。

后续只读核对又观察到原型hash `195da42fc871c1f4d4362edf4e19543ae1e1b42ae4023d2e7877aebe5edf26e2`；其owner仍在迭代。该观察不改变本轮锁定基线，不继续追随或覆盖并行版本。

<a id="developer-permission-defaults-20261115"></a>

## 12. 权限默认预选与开发可用性（2026-11-15，设计目标）

本增量回应“开发 → 更多 → 权限与诊断”的多选框是否应默认勾选。**用户最新优先级：方便新用户开发、减少点选与事后不知道如何处理的问题，权限尽量全选。** 因此当前支持的 SDK 服务全部预选，独立 Cookie 选项也默认选中；首次使用集中审阅、有效授权直接复用、缺项就近恢复。此决定覆盖早先只预选五项的方案。当前已实施默认值、文档草稿与可读标签，并按12.5简化网页选择；集中恢复等后续目标不计入本次完成范围，预选不自动授予权限。唯一默认表与新用户主流程仅在[分层授权合同](../architecture/browser-framework/userscript-sdk-authorization-r1.zh-CN.md#developer-permission-defaults-20261115)维护，本文与 DESIGN 只引用。

### 12.1 当前事实与下一条用户操作

- 服务行由 `createDeveloperHostControls` 从 `ADMITTED_METHODS` 生成，现已按明确白名单默认选中八项；`network.info` 继续未选且禁用。同一精确文档刷新/返回保留手改，新文档不继承旧目标；原实验页的新草稿保留八项预选并预填原固定目标。此前全部未选是旧源码行为，并非界面未连接。来源：[host controls](../../src/ui/develop-host-controls.js)、[Registry](../../src/framework/sdk/registry.js)、[批准草稿](../../src/ui/sdk-approval.js)。
- Cookie checkbox 属于独立脚本设置，现已在自身字段默认勾选，Controller/本地运行仍据此只读检查 Chrome Cookie 权限。默认 Chrome 网站访问、脚本能力和 MAIN 文档级 SDK 服务不能互相替代。来源：[开发字段](../../src/ui/develop-fields.js)、[Controller 运行](../../src/ui/controller-draft-run.js)、[本地运行](../../src/ui/local-project-run.js)。
- 普通同源 HTTP 已有自动最小授权，常规 Run 无需批准高级 SDK 服务；目前没有取得“开发失败就是未勾选导致”的真实操作证据。因此这是便利性设计，不把它写成已复现故障或承诺解决所有运行失败。
- 本次核心操作为打开真实开发 Tab → 权限与诊断 → 核对默认值 → 手动取消 → 返回编辑再进入，已取得实际 Side Panel DOM 状态与开发产物一致的证据。更完整的新用户示例 Run → 结果、明确批准 → 服务调用及就近恢复为后续验证，不将默认勾选当成运行/授权已成功。开发仍使用原 `dist/development`，本次连接与 applied revision 记录归测试规格。

### 12.2 目标与完成条件

| ID | 目标/完成条件 | 对应验证 |
| --- | --- | --- |
| G-P1 减少漏选 | 新开发草稿的当前可用 SDK 服务和独立 Cookie 选项默认全选，无需逐项寻找；既有同源 HTTP 与普通 Run 不新增授权前置 | P01、P02、P04、P07 |
| G-P2 范围清楚 | 本次申请与真实授权状态可区分；Cookie、高级能力、跨站目标保持各自边界，批准展示完整替换范围 | P05–P08、P10 |
| G-P3 尊重修改 | 同文档返回/刷新不重置手工取消；新文档使用默认集且不继承旧的手填目标/实际授权；原实验页预填仍可用且不覆盖手改 | P03、P06、P09 |
| G-P4 不制造假成功 | 只有匹配回执才确认；拒绝、撤权、导航、旧回包与未知不复活权限、不自动重试、不清无关错误 | P09–P11 |
| G-P5 最小改动 | 复用可信 React 根、原字段 owner/Registry/Authority 与既有确认和反馈；默认宽度下勾选、审阅、批准/撤销、返回均可达 | P12；文件范围如下 |
| G-P6 新用户不查配置 | 原网站权限与依赖合法就绪时，默认示例首次成功不进入权限诊断、不手工点选服务；确需新增 SDK 授权时只做一次产品内集中审阅，Chrome 原生许可沿原链 | P13 |
| G-P7 缺项可恢复且不重复 | 缺权限在当前操作旁给出原因与具名恢复动作；尽可能预填可验证目标，返回保留编辑状态；有效授权重复使用不弹重复审阅，不把未知操作自动重放 | P14、P15 |

### 12.3 实施归属与后续顺序

1. **默认值与草稿归属**：优先在 `src/ui/develop-host-controls.js` 定义覆盖当前八项可用服务的明确默认集，按当前 Registry 交集投影；由同一 owner 管理 pristine/edited 与精确文档绑定。Cookie 只在 `src/ui/develop-fields.js` 的自身字段定向设置默认选中，不全局改 `createDeveloperView` 初值。同步处理 `sdkDocumentChanged`、刷新和原实验页预填，不建第二授权存储；针对缺口扩充 `tests/environment/develop-host-controls.test.mjs` 与原运行预检测试。
2. **可理解的申请、恢复与回执**：在 `src/ui/react/tabs/develop-diagnostics.tsx` 调整分组、可读标签、待批准/实际状态及集中审阅；Cookie 在原 `develop-advanced.tsx` 保持独立。缺项提示优先从原编辑/运行反馈进入现有网站恢复或 SDK 审阅入口，带入可核实目标；精确技术身份不要求手填。批准仍走 `src/ui/sdk-approval.js`，只有实际授权未覆盖才要求审阅；Run 保持只读权限检查，恢复后由用户明确运行，不改变原 grant、撤权或未知恢复语义。涉及原 UI/运行反馈 adapter 时只修本任务接线，不重写 Authority/Host。
3. **验证当前行为**：先用原 owner Node/React 检查证明默认输入无副作用、手改保留与精确快照；再在当前真实侧栏测试一条批准/调用/查询/撤销链及受影响负例。原生工具能力不足时分层报告，不以预览或模拟 `isTrusted` 冒充 Chrome 手势。按[测试增量](developer-ui-ux-r1-test-spec-20261114.zh-CN.md#developer-permission-defaults-tests-20261115)选用检查。

### 12.4 风险、文档与停止条件

主要风险是开发者把全预选当成已授权、集中审阅未表达整页影响、默认集随 Registry 扩张、刷新复选旧值，以及新默认集破坏实验预填/旧授权替换语义。分别用独立状态、简明范围审阅、明确白名单、文档草稿归属和原范围回执解决；MAIN 整页第三方可调用的披露保留。减少步骤优先复用已有合法许可和准备输入，不新增静默 grant，也不靠失败后盲目自动重跑。任意 JS 的全部能力需求无法保证提前识别，应给准确恢复入口。

用户本次追问后的交付范围为默认值、手改保留和标签，12.3 第 1 项已实施，第 2 项仅完成可读标签及网络范围说明，第 3 项按本次改动做定向验证。HTTP 标签只显示“HTTP 网络请求”，网络设置及统一授权范围摘要解释同源与额外跨站；日志/时间/内置资源不再直接显示技术 key。更完整的就近恢复、旧授权差异展示和新用户主链优化仍为后续目标，不扩大本次完成声明。

本轮同步原目标、原测试规格、原分层授权合同和 DESIGN 入口；不新增权限体系、Skill、全局 AGENTS 规则或第二份 API 规范。实际证据与未测项只在[测试增量](developer-ui-ux-r1-test-spec-20261114.zh-CN.md#developer-permission-defaults-tests-20261115)记录；原生授权/撤销未测单列 NOT_TESTED。独立评分、完整矩阵、production、发布与提交推送不由本增量自动触发。

<a id="developer-sdk-page-target-20261115"></a>
### 12.5 当前网页优先与图标刷新（2026-11-15，已实施）

下一条用户操作是打开网页 SDK 授权管理后直接核对当前网页，无需再次下拉选择。复用唯一 `currentPageTarget` 的本窗口、当前 HTTP(S) 网页及主文档；主区显示标题和地址，原网页/文档下拉移入默认折叠的“更换网页或子框架”。手动选择后固定该目标，切换标签页不覆盖；“使用当前网页”明确恢复跟随。列表只包含本窗口非隐身 HTTP(S) 网页，无有效窗口时不退回全局列表，无可用当前文档时不擅自选择实验页。

原“刷新网页列表”改为共享 `od-icon-button` 刷新图标，保留原生按钮、键盘操作、`title` 与 `aria-label="刷新网页与文档"`；读取期间禁用。刷新同时重读网页与精确文档，保留仍有效的手动选择和同文档草稿。文档变化立即使旧批准快照失效，迟到响应不覆盖新选择；原可信点击、精确 document/Origin、Authority、撤权和未知不重放继续适用。

实施仅在原host controls、字段、React诊断区与 `tool-shell.js` 注入现有owner，不改 `current-page-target.js`、SDK或Authority。完成条件是默认零次重复选网页、手选可保持/恢复、刷新可发现且不授权；对应P16–P18。实际源码/产物/运行证据及开发服务连接限制见原测试规格。

<a id="developer-prototype-permissions-ui-20261115"></a>
## 13. 开发原型交互与权限诊断（2026-11-15，离线范围）

下一条用户操作：编辑草稿 → 底部「…」→ 权限与诊断 → 核对当前目标和选择 → 模拟批准/查询/撤销 → 返回原编辑。普通运行仍无需进入该页。本轮只改现有单文件原型与目标/测试记录。

- **密度与间距**：沿用Tokens、轻边框和默认360×860；字段说明/错误由字段组持有4px，独立字段组12px、区块16px。能力列表用两列保留34px点击区，精确身份/替换审阅/已批准详情按需展开，不缩字号或删除功能。
- **当前策略**：引用第12节的八项可用服务预选、禁用项不选；Cookie作为自动化独立设置，不加入MAIN SDK快照。默认当前主文档、具名刷新、手选子文档与恢复当前网页保持可发现。
- **范围与状态**：选择只改内存草稿，模拟已批准范围独立保存；审阅显示新增/移除能力和跨站范围，批准完整替换。查询不改输入，撤销不清草稿；示例文档隔离手改，导航使旧模拟授权失效，新文档使用默认草稿。
- **交互保真**：保留分格式草稿和主动清空、返回触发点/滚动、Run/Stop及未知不重放。菜单可键盘遍历、移出后关闭；组合输入Escape不触发返回。模拟完成回执在当前视口可见。
- **停止条件**：通过[测试规格第13节D01–D09](developer-ui-ux-r1-test-spec-20261114.zh-CN.md#developer-prototype-permissions-tests-20261115)，记录当前HTML哈希。无需历史截图/评分、根测试或产品构建；真实SDK/Chrome授权、Cookie读取、原生Side Panel/安装/IME/Native及production均NOT_TESTED。不提交推送、不操作并行服务。
