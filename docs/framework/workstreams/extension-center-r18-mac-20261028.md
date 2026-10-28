# 通用扩展 UI R1.8 · Mac 本地验收

- Owner：Codex chat `01a17e79-ae91-7ab2-9101-0f2b16586aa8`；2026-10-28；ACTIVE。
- 分支：仅 `main`；起始 HEAD `c64979744`，安全合入 `origin/main` 的 `19ffc88a0`。四个基线 `de7bf5d`、`bcdc73e`、`c2e7111`、`0e06188` 均已包含。
- 当前阶段：按用户最新“主要使用 dev 环境测试，不是 pro”，使用原 `dist/development` watcher 完成真实 Mac Google Chrome 核心操作与最小修复。production 构建、size 和正式包终验延期，不能将 dev 证据提升为 production PASS。
- 产品目标：普通应用列表点击直达原 ToolHost；Page Program 点击进入正式统一详情；正式预览与 React 同源。
- 本轮写入范围：`src/ui/sidebar-tools.js`、`src/ui/extension-center.js`，现有 Host/center 定向测试及其 DOM helper、R33.3 边界测试、原 Chromium fixture 的预编译配置、原生成器管理的 Clipper stage 及本记录。正式 React index、生成器与语言菜单由另一对话继续维护，本轮不提交其改动。
- 复用：原 ExtensionCenter Controller、React ExtensionDetail、SidebarTools/ToolHost、Page Authority、安装/卸载流程；不新建组件、Root、Host 或 Mock。
- 独立子任务：CI 日志只读复核（Pasteur）；导航、通用性和身份边界只读审查（Sagan）；Host/center 最小修复与回归（Kuhn）。父 agent 协调文件归属并操作自有 Chrome 窗口。
- 保留：所有原有 AI 知识库、ChatGPT bridge 等未提交改动；PID 7390 的 dev watcher、`dist/development`、日常 Chrome/Profile 及当前安装确认。无权占用其他既有 CFT Profile。
- 输出：`artifacts/extension-center-r18/`。早期准备的冻结输入副本未构建、未安装；已依用户最新要求延期 production，不创建分支/worktree，不停止其他服务。
- 证据分层：Node/服务替身 Chromium、同源静态预览、真实已安装扩展、原生 Side Panel 分别记录；未实际执行的项保持 NOT_TESTED/NOT_SCORED。

## 初始差异

| 状态 | 证据 |
| --- | --- |
| ALREADY_DONE | 四个基线均为 HEAD 祖先；现有正式文件与生成器已存在。 |
| NEEDS_FIX | R33.3 静态边界检查误报已有可信 Host CSS；预览检查报告 Clipper stage 过期。 |
| NOT_TESTED | 五应用真实 ToolHost、三类 Page Program、全部原生矩阵及八维终验。 |

## 验证

- 初跑四文件：18 PASS，18 SKIP（缺少 Playwright 路径）；已定位现有安装，补测进行中。跳过不算通过。
- R33.3：2 PASS / 1 FAIL；TSX 编译正常，边界正则误报静态 CSS。
- 原预览 `--check`：FAIL，`generated clipper stage missing or stale`。

后续结果、实际源码变更、候选身份、原生回执及资源释放在本记录追加。

## 复核与最小修复范围

- 补测使用现有 Playwright 与 `/Users/shopme/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`：四文件 36/36 PASS，无跳过；证据仍为真实 Chromium 输入加服务替身，不是已安装 Host。
- 原 R33.3 边界检查精确补齐六条既有 `trusted/host.css?raw` 导入，3/3 PASS；不豁免新的 JS 或任意路径。
- 原生成器只改变 Clipper stage；正式 React index 已同源无需重写。刷新后 `--check` PASS，R5.3 预览 Chromium PASS；Showcase Chromium PASS。
- 当前 R4 导出错误由原 fixture Vite 未预编译 React Aria 导致；仅给其现有 `optimizeDeps.include` 加 `react-aria-components` 后成功启动，后续停在无关 Workflow 来源文案旧断言。该旧断言保留，OUT_OF_SCOPE。
- R5.3 历史运行三条失败为我的页 runner位置、关闭的AI设置Sheet默认SSR、共享对话旧按钮断言，均 OUT_OF_SCOPE；未恢复废弃界面。R4 历史 job/step 已读到，但日志正文受403/Transport closed阻断，本地错误不冒充历史日志。
- 独立审查发现两个 Host 未知状态缺口：撤销代际存储损坏仍可能默认null复用；安装清单损坏未立即退役异步加载实例。Executor 子 agent 独占 `src/ui/sidebar-tools.js` 和现有定向测试修复，父 agent 不并发编辑这些文件。此为本轮明确身份/未知状态合同的最小保护，不改 Installer、Authority 或业务。
- 原生 UI 资源冲突：日常 Chrome 窗口/Side Panel 正由另一任务持续操作；不抢占。`/Applications/Google Chrome.app` 的真实 executable/Bundle ID 为 CFT，不能冒充正式 Chrome。原生验收等待可用的独占窗口协调，其余自动检查继续。

## 最新阶段与本机进展

- 用户最新明确“主要使用 dev 环境测试，不是 pro”。本轮切换为持续开发验收，延期 production 构建、size 审计和正式包评分；已开始的冻结副本未用于构建或安装。原 watcher 未停止、输出未覆盖。
- 用户允许新建 Chrome 窗口且不得抢占已有窗口。已创建自有窗口 560068779 / tab 560068780，在标准测试页打开原生 Side Panel。所有原生操作经 CUA；未修改日常扩展加载路径或 ID。
- 实际 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；调试页显示开发服务已连接，初次读回 revision `e0cd447777919b6e86118b28da5933fd4933e7090a70b628147532ce3ee99f2d`。期间发生安全刷新，后续 hostInstanceId 与最终 revision 另留回执。
- 真实 dev 已验证五应用主体单击直达原业务：Cookie 2.0.39、AdBlock 1.2.4、Bookmark 0.3.12、Clipper 1.2.3、Prompt 1.1.19；均观察实际 sandbox.html 与业务控件，非通用详情或 Fixture。未修改业务数据。
- Prompt 更多菜单→设置与权限→停用→列表显示查看详情且不加载旧 iframe→恢复，原记录读回成功；已恢复原 enabled 状态。
- AI 滚动导航与已安装历史 ChatGPT 思维导图进入正式统一详情。前者原始 off/cleanup pending 保留，后者 on/registered；每页一个主 Switch，网站范围及技术详情来自实际安装。历史 ChatGPT 思维导图不冒充被阻断发行的新 `opendesk.ai-reply-mindmap` 包。
- 正式 Page 目录仅三项 AI 且全部 blocked；不绕过其发行门禁。为补普通 Page 使用已有 `page-ui-basic` 示例原编译器和原 `build-page-install-package.mjs`，源码未改，固定 `sample.page-ui-basic`/0.1.0/r1，范围仍 `http://127.0.0.1/*`，仅用于本地测试。实际安装回执另记，BUILT_UNVERIFIED 不算安装成功。
- 新观察：普通应用启用成功消息残留到另一 Page 详情，已交 Executor 只读定位最小清理方案。
- Host 新增19回归通过；原有定向44、启停/标题22、返回7通过。更宽模式33/35，Prompt/Bookmark 可信 pin 与当前fixture版本漂移；原 HEAD同样失败，匹配Git固定包隔离前后12/12，通过证据分别保存，未放宽正式准入。
- Host 补丁独立审查：两HIGH已关闭，无新增安全回退；草稿保证文本保留，不承诺完整表单恢复。最终 check已通过。

## 非 AI 网页增强的真实 dev 回执

- 已经原生导入、审阅、确认安装 `sample.page-ui-basic`/0.1.0/r1，非 BUILT_UNVERIFIED。包路径 `artifacts/extension-center-r18/page-ui-basic.opendesk-page.json`，包 SHA-256 `5f4599d35017fef24fb2bad01efda11b714c362e84460d2f5b206b9f97caa1dc`。
- 安装身份 `8a99805e-9415-45fc-b799-5c5d00809367`；固定源码 `b8d9dd3bac816cff9498cf3e3dac957010ea08c38c6a06217abfe4868062f610`；Manifest `ec5bd5401031a4c9bd8c13599b4d388e0152b9d7ee1115cfbb081b916c1fcf8e`。
- 原列表进入正式 ExtensionDetail；一个主 Switch，范围只有 `http://127.0.0.1/*`，没有 AI 专属网站设置。鼠标停用后读回 disabled/unregistered；原生 Space 恢复后读回 active/registered。
- 只刷新自己的标准测试页后自动显示原示例 UI；输入 `R1.8 非 AI 网页增强` 并点击“读取本页信息”，实际返回本页标题和输入，状态“读取成功（无网络请求）”。本页捕获的 error/warn 为空；这不代表 Side Panel Console 全量无错。
- 回执、截图：`artifacts/extension-center-r18/native-dev/generic-page-install-review.*`、`generic-page-install-result.*`、`generic-page-disabled.*`、`generic-page-restored-space.*`、`generic-page-runtime-result.*`。这些是原生已安装 dev 与真实页面结果；静态预览证据另存，不互相代替。
- 新建测试 Page 后续通过原可信卸载流程收尾，不删除或升级原有五应用与两 AI 安装。
- 当前 dev 输入由多个对话持续变化，已观察安全刷新关闭自己的 Side Panel；每次重新打开都重新读回 hostInstanceId。不得将多个 revision 的截图称为同一冻结候选的完整矩阵。

## 最终 dev 结果与最小修复

### 三个实际问题

1. **未知安装/撤销状态可能复用旧实例。** Host 复用现有严格撤销代际校验，损坏记录使旧执行实例退役，保留已收到的草稿文本；异步 iframe 最终投递前再次核对安装、启停和代际。未知状态不能继续打开或写入，未修复/覆盖存储记录。只读预览保持原行为。
2. **操作成功提示跨详情残留。** 真实 Prompt 停用/恢复和普通 Page 安装后，旧成功文案会跟到无关详情。现在导航清理旧操作提示，并恢复被操作回执遮住的真实读取/目录错误；保留当前操作的成功回执和原草稿离开确认。真实 off/cleanup-pending 的 AI 滚动详情不再显示“应用恢复成功”。
3. **普通应用管理详情重复出现“打开使用”。** 收尾没有把这条既有失败简单归为历史漂移，而是在真实 Prompt 更多→查看详情复现。最小删除详情的重复打开分支，列表主体仍直达原 ToolHost，原设置/更新入口保留；`app-detail-duplicate-open-before.*` 与 `app-detail-no-duplicate-open.*` 有前后证据。

另修必要验收工具：原边界测试精确补齐六条既有可信 Host CSS 导入；原 fixture 预编译 React Aria，解除 `use-sync-external-store` 导出启动错误；用原生成器更新过期 Clipper stage。R1.5 旧驱动只点击 Switch 外层 LABEL，改为明确的 Controller 布尔回调回归，真实指针/Space 仍由原 Chromium 测试覆盖；DOM helper 补齐同一 linkedom window 的真实 `HTMLButtonElement`，没有吞异常。R5.0 源码断言保留完整 dispose 代数失效与清理，仅移除返回对象必须紧邻 refresh 的限制。没有恢复旧 UI、增加依赖或引入替代 Host。

### 真实操作与收尾

- 五应用均完成主体直达与更多菜单→原设置/权限页；Cookie 的既有未授权状态保留，未自动授予权限。Bookmark、Clipper 的现有权限只读查看，未扩大范围。Prompt 停用时只进详情，恢复后原 enabled 状态已读回。
- 已验证 Tab/Enter 打开 Bookmark/Prompt 更多菜单、Escape 关闭后恢复行菜单焦点；普通 Page 的 Space 操作由 Authority 读回 active/registered。鼠标和键盘这些实际链路通过，不代表全部输入矩阵完成。
- 测试 Page 首次卸载返回 **E_PAGE_CLEANUP_PENDING**，记录保留、程序停用，旧页面效果仍在；该次不能算成功。按现有提示刷新自己的测试页、刷新可信状态，确认旧 UI 已移除后，再经同一身份审阅和原卸载确认成功。最终列表恢复14项，测试 Page 已不存在。
- 卸载证据为 `generic-page-uninstall-review.*` → `generic-page-uninstall-cleanup-pending.*` → `generic-page-uninstalled-confirmed.*`。未删除其他已安装应用或 Page。
- Chrome 原生详情实际显示 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、加载来源 `~/文稿/workspace/opendesk-browser/dist/development`；`actual-dev-load-path.*` 留有截图和 AX。真实 Google Chrome 156.0.8078.48；`/Applications/Google Chrome.app` 的 CFT 149 仅用于部分自动预览检查，证据不混用。
- 详情去重后的连接读回 hostInstanceId `03c66b3b-3fc0-4364-afd9-963c864ceaa8`，revision `9fe9460cf54976e1a2e42ed3b49e36c40a016064dcc90ff1b716a25e2f2b3536`；`dev-connection-detail-fix.*`。此前 `dev-connection-latest.*` 读回 `90b58876-c82d-4d0b-967d-d9d00eb39767` / `e3c0d5bb6c5db33593feef542a225948b83ae7add9033bb97bd0d02a663a5441`，与当时输出 JSON 相同；较早提示清理修复的回执绑定 `aec745bf-8f2c-4248-a2c9-f9f51e927066` / `dad9e5434729080c5ceb1cf59ac5340fca389864ddc23a4a6fd839dd7566e76d`。这些属于持续开发的不同 revision。

### 最新验证结果

| 检查 | 结果与边界 |
| --- | --- |
| 用户指定四个 environment 文件 | 详情去重后重跑36/36 PASS，0 SKIP；`targeted-after-detail-fix.log` |
| `react-sidebar-r333.test.mjs` | 3/3 PASS；`react-contract-final.log` |
| Host 身份、启停、草稿、返回、只读预览定向 | 63/63 PASS；`review-medium-host.log` |
| center 完整文件 | 最新54/54 PASS，0 SKIP；`center-complete-final.log`。其中包含另一对话的两处 language hunks；它们保留未提交，不能将工作区结果表述为本提交独立全通过。此前50/50定向有4项排除，旧日志不冒充完整结果 |
| 审查新增7个负向回归 | 修复前0/7，修复后7/7；原始日志保留 |
| `npm run check` | 详情去重后PASS，1255个文件；`source-check-after-detail.log`。随后 helper 单项语法与完整54项测试通过 |
| 原 React 预览 `--check` | PASS；`preview-check-current.log`；input SHA `75233b5dbce1fd17d69888f4bdd18353e0508be2f9281a4752e0074b855ab56c`。包含并行对话未提交的正式 React/生成器输入，不冒充本提交独立发布证据 |
| Showcase Chromium / R5.3 preview Chromium | PASS；仅 SOURCE_BOUND_UI_PREVIEW_ONLY，不证明真实安装、权限或 Host |
| `react-sidebar-r3331-browser.mjs` | FAIL；导出错误已解除，后续 Workflow 模型来源文案旧断言失败，OUT_OF_SCOPE；`react-browser-fixed.log` |
| 历史六 Tab 合同 | 4 PASS / 3 FAIL；我的/工作流/开发旧断言，OUT_OF_SCOPE；`six-tab-historical.log` |
| 更宽 Host | 33/35；Prompt/Bookmark 包版本与可信 pin fixture 漂移，原 HEAD 同样失败；匹配固定包的隔离前后12/12，不放宽准入 |
| production build / build:size / 正式包验收 | DEFERRED，依用户最新 dev 阶段要求；未执行，不报 PASS |

R5.3 历史 job [122237112711](https://github.com/shopable-ai/opendesk-browser/actions/runs/40518022081/job/122237112711) 已读到准确三条失败；R4 历史 job [122236722294](https://github.com/shopable-ai/opendesk-browser/actions/runs/40518022689/job/122236722294) 已读到 React TSX/边界通过、Chromium步骤失败，但完整正文仍受连接/403限制。本地当前复现是独立证据。

### 复用、预览与未完成项

- 完全沿用 `resolveExtensionRowIntent` → `openRow` → `sidebarTools.openTool` → 原 ToolHost；正式 `ExtensionDetail`、状态模型、唯一 React Root、Shared UI、Tokens、Page Authority、Installer 与可信卸载流程沿用既有实现。未改 AI 导航算法或浮动按钮。
- 正式预览为 `prototypes/sidebar/react-preview/index.html`，本地直接打开；可用原 `node scripts/preview/build-sidebar-six-react-preview.mjs --check` 检查同源。`sidebar-six-preview.tsx` 仍不是正式构建入口。预览不能代替原生 Side Panel。
- 独立审查已关闭两项 HIGH 与后续两项 MEDIUM，未发现本轮新增回退；结论只覆盖本次 dev 修复，不等同整体发布批准。
- **NOT_TESTED**：真实已安装 Side Panel 的320/400/440/520精确宽度、200%缩放、完整深浅色与触屏等价矩阵；五应用逐项未知/卸载/身份变化的全部原生故障场景；所有受支持 Page 类型的完整原生矩阵；被发行门禁阻断的新 AI 回复思维导图包。已补当前 Side Panel Console 与360px读回，见下文；已有 Node/服务替身结果不能填补其余原生项。
- **R1.8不能标记最终完成**。当前交付是已验证的 dev 核心链路和最小修复；production 为主动延期，其他缺证项目如上。goal 工具的原始正文无法在当前接口改写，未将原始完整目标标记 complete。

| 八维独立验收（每项100） | 结果 | 原因 |
| --- | --- | --- |
| 产品目标符合度 | NOT_SCORED | 核心操作已支持，完整目标仍有未验项 |
| 视觉与信息层级 | NOT_SCORED | 未完成精确宽度/主题/缩放原生对照 |
| 普通应用导航正确性 | NOT_SCORED | 五项直达/设置通过，逐项异常原生矩阵未齐 |
| 网页增强详情通用性 | NOT_SCORED | 三类实际详情通过，新官方包及全部支持类型未齐 |
| React / Shared UI 复用 | NOT_SCORED | 源码/边界支持，完整候选验收未齐 |
| 安全与权限边界 | NOT_SCORED | 定向负向保护通过，全部原生故障场景未齐 |
| 响应式与无障碍 | NOT_SCORED | 部分原生键盘链通过，完整专项未齐 |
| 自动化、发行与证据可靠性 | NOT_SCORED | 仍有失败/历史日志缺口，production延期 |

综合算术平均值 **NOT_SCORED**；没有八个有证据的数值，不制造95分或相加评分。

## 提交后补充的原生证据与收尾

- 本轮修复提交为 `c1219d84a56675955a8ac7e8a7b811aa25510440`。随后另一对话提交 `b208dbc8fcf50559a96f3b8c0752df96d908695d`，将前述 React/语言菜单、生成器、Bookmark 等并行输入及两处 language 测试 hunks 一并保存。前文“保留未提交”描述的是测试执行时的文件状态；这些结果仍来自当时完整工作区，不能倒称为仅本轮修复提交的独立结果。本轮没有重写或纳入其提交。
- 在本轮独立窗口为 hostInstanceId `03c66b3b-3fc0-4364-afd9-963c864ceaa8` 打开原生 Side Panel DevTools，未连接或操作其他任务的 inspector。Console 显示两条 `official-tools/stay-focus/latest.json` 的 GitHub raw **404**，属于既有 Stay Focus 发行来源，记录为 OUT_OF_SCOPE；不宣称零 Console 错误。最初原始采集为 `sidepanel-console-before-matrix.*`，最终采集为 `sidepanel-console-final.*`。
- 测量时误将残余 Console 输入前缀与只读表达式拼接，造成一条 `ReferenceError: prefers is not defined`；这是本轮驱动输入错误，已单独保留，不能算为产品故障，也没有清空 Console 隐藏它。校正输入后正常读回真实渲染器数据。
- 默认主题读回 `innerWidth=360`、`innerHeight=731`、`devicePixelRatio=2`、`document.documentElement.scrollWidth=360`、dark=false；DPR=2是 Retina 比例，不能作为200%浏览器缩放证据。拖动手柄、辅助功能与方向键操作没有改变测量宽度，其他精确尺寸不能报 PASS，也未据此判定产品尺寸故障。
- 只在本轮 Side Panel renderer 使用 DevTools 的 `prefers-color-scheme: dark` 媒体模拟，实际读回 dark=true、width=360、scrollWidth=360；原 Prompt 工具与 Host 均显示深色。`native-viewport-360-dark.ax.txt`、`prompt-dark-native-render.*` 为 **真实已安装 dev 渲染＋媒体模拟**，不是系统主题切换、完整主题矩阵或静态预览。未修改 CSS。
- 已执行原生命令 **Do not emulate CSS prefers-color-scheme**，再次读回 dark=false、width=360、scrollWidth=360，随后仅关闭本轮 DevTools。`prompt-light-restored-native.*` 与 `extension-list-final-native.*` 保存默认主题下原 ToolHost 和返回列表的最终截图/AX。原 watcher、其他 Chrome 窗口、安装数据和授权保持其已有状态。
- 上述补充只有运行证据记录，无新的源码修复；不重复已通过且输入未变化的检查，不补跑已延期的 production 构建。八维结论和 R1.8 未完成状态保持不变。

## dev 停用详情的后续修正

- 在自己的真实 Chrome 窗口停用 Cookie 后，列表正确进入详情而没有加载业务 iframe，但使用说明仍写“应用已安装，可按需打开界面”。这是实际产品文案矛盾，不能归为旧测试漂移。`cookie-disabled-detail-native.*` 保留修复前证据。
- 最小修改 `src/ui/extension-center.js` 的普通应用说明：明确停用时显示“应用已停用；可在设置与权限中恢复”。原 Reading TOC 身份及专属说明、未知状态投影、原 Host、Authority 和权限操作均未修改；没有新增 UI 或 API。
- 在原 R4.8 详情测试补充启用说明、停用恢复指引及禁止误导文案断言。原源码先失败（`disabled-usage-before.log`）；修复后中心/行操作/React 详情三个现有文件 **78/78 PASS，0 SKIP**（`disabled-usage-after-browser.log`）。第一次未带浏览器依赖环境的执行为60 PASS/18 SKIP，保留原日志，不当作完整通过。`npm run check` 再次通过1255文件（`disabled-usage-source-check.log`）。
- 原正式预览 `--check` 通过（`disabled-usage-preview-check.log`），input SHA `036f7e81b4b9b3cfaf3d4fee1330f979bef8b2a9a5cd7295ef2bfe14878d4e27`。无需生成新页面；此元数据对应当时完整 main 工作区输入。
- 独立只读复核未发现阻止提交的问题，明确限定为这两处差异的源码/覆盖检查，不冒充独立原生或 production 验收。
- 修复后的 Cookie 详情已在 dev 实际读到新文案、停用状态及无业务 iframe；随后经原设置恢复 on。补完 AdBlock、Bookmark、Clipper 的菜单停用→主体进入详情→原设置 off→恢复 on→返回原业务，均未卸载、升级或更改业务数据、网站权限；AdBlock 原全局保护 off 也未切换。结合此前 Prompt，五应用现在各有原生停用/恢复证据，但仍未覆盖逐项未知/卸载/身份变化故障。
- 新证据位于既有 `native-dev/`：`cookie-disabled-detail-fixed-native.*`、`cookie-restored-after-usage-fix.*`、`adblock-disabled-native.*` / `adblock-restored-native.*`、`bookmark-disabled-native.*` / `bookmark-restored-native.*`、`clipper-disabled-native.*` / `clipper-restored-native.*`、`five-apps-restored-list-native.*`。所有应用恢复后停留扩展列表。
- 此次实际 hostInstanceId `d76900ef-7316-4a7b-96d5-c0ee6c0e913f`，调试页读到 **开发服务已连接**，revision `fc1a87c1f566cd5f679e623ff9594b912cb73178bb4da72b2e768561a5cb1023`，同一扩展ID/`dist/development`；`dev-connection-disabled-usage-fix.*`。保留原 watcher，不用 production 包替换日常环境。
- R4 准确 job 的日志连接再次返回 Transport closed，自己的真实 Chrome 页面明确提示 **Sign in to view logs**；没有取得完整正文。本窗口导航回本地测试页仍停在旧文档/加载中，而本地服务单独返回 HTTP200；记录浏览器/驱动阻塞，不作为扩展产品故障。`native-navigation-pending.*` 区分地址栏输入与实际旧文档，不能宣称导航成功，也不操作其他窗口的 debugger 解除它。
- Chrome 尺寸手柄的原生 Increment 辅助操作同样没有可见尺寸变化。未验证的精确宽度、200%、触屏和异常身份矩阵继续 NOT_TESTED，不据此修改 CSS 或宣称产品尺寸故障。八维仍均 NOT_SCORED，算术平均 NOT_SCORED；R1.8完整验收仍未完成，production 保持延期。

## 新标签页恢复、原生缩放与剩余阻塞

- 在本任务自己的 Chrome 窗口新增标签页，通过现有本地测试页入口实际加载 `http://127.0.0.1:43111/demo-form.html`；`native-new-tab-navigation-recovered.*` 记录新文档，而非只记录地址栏。此前旧标签页的导航停滞已绕开，没有取消其他任务的 debugger 或操作其他窗口。
- 通过 Chrome 原生菜单将本地网页从100%调到200%；`chrome-menu-zoom-200-native.*` 保留可见百分比。原 Prompt 业务及 AI 滚动导航统一详情仍能进入，分别保存 `prompt-native-browser-zoom-200.*`、`ai-scroll-native-browser-zoom-200.*`。AI详情仍只有一个主开关，并如实显示 off／原生清理待核对；没有为测试扩大网站授权或改变启用状态。
- **网页200%不等于侧栏200%。** 在本任务 Side Panel DevTools 的顶层 `top` 上下文只读测得：实际 `sidepanel.html?hostInstanceId=d76900ef-7316-4a7b-96d5-c0ee6c0e913f` 的 width=360、height=731、DPR=2、scrollWidth=360、dark=false、visualViewport.scale=1。`sidepanel-top-metrics-browser-zoom-200.*` 是顶层证据；较早的 `sidepanel-metrics-browser-zoom-200.*` 来自 sandbox iframe（360×626），不得混作顶层测量。侧栏自身200%重排仍为 NOT_TESTED。
- 已通过原生缩放弹层“重置”，实际读回100%（`chrome-zoom-restored-100-native.*`），仅关闭本任务 DevTools，并返回扩展列表及原详情入口焦点（`extension-list-after-zoom-restored-native.*`）。未清空 Console；既有两条 Stay Focus 索引404仍保留。
- 当前同一 Side Panel 实际读到“开发服务已连接”，revision仍为 `fc1a87c1f566cd5f679e623ff9594b912cb73178bb4da72b2e768561a5cb1023`，扩展ID和 `dist/development` 沿用原环境；`dev-connection-after-zoom-recovery.*`。没有重启或覆盖 dev watcher，没有新 production 构建。
- 新标签页和校准后的鼠标坐标下，原生分隔线拖动仍未产生可见宽度变化（`native-divider-drag-after-new-tab.*`）。跨本轮及前两轮尝试，辅助动作、方向键、拖动均未解除这一控制阻塞。不能用普通网页 viewport、CSS变换或静态预览填充真实 Side Panel 的精确宽度／缩放／触屏验收，也不能据驱动无效判定产品CSS损坏。其余尺寸和触屏仍为 NOT_TESTED；没有新的产品差异需要修改源码。
- dev核心操作和定向修复已有证据；剩余完整原生验收需要可实际控制侧栏尺寸、缩放和触屏的测试入口，以及仍缺失的逐应用原生异常证据。R4完整日志仍需有权读取的外部状态，已阻断的新思维导图发行也不由本轮绕过。当前无法在既定边界内完成这些项目；R1.8不标记完成，八维及算术平均保持 NOT_SCORED。仅新增运行证据记录，不重复输入未变的自动测试。

## 续接实测：dev 核心测试收尾（2026-10-28）

本次按用户最新要求完成 **dev 核心功能测试**，不恢复前文的完整正式验收目标。当前未复现阻断列表、普通应用直达、原管理入口或通用 Page 详情的新故障；AI 滚动导航的旧受管界面清理仍为 `unknown`，单独保留为未确认，不能称全部清理成功。核心测试已完成，不等于 R1.8 全量正式验收完成。

### 本次运行身份与操作

- 开始实读 `main` / `3481c02b47f2eb98319af0f74055c3243c56a5ea`，领先 `origin/main` 11 个提交，暂存区为空。两个正式产品文件 `src/ui/sidebar-tools.js`、`src/ui/extension-center.js` 与该 HEAD 无差异。本次没有新增产品源码修复、构建或安装。
- 复用原 `node scripts/dev.mjs` PID7390，43119/43120 仍监听；43111 原测试页服务保留。没有启动第二 writer，没有停止或覆盖已有服务。
- 实际操作的 Side Panel 仍为扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`，`hostInstanceId=d76900ef-7316-4a7b-96d5-c0ee6c0e913f`。调试页本次重新实读“开发服务已连接”，revision `fc1a87c1f566cd5f679e623ff9594b912cb73178bb4da72b2e768561a5cb1023`，与交接时一致。加载目录 `dist/development` 复用前述 `actual-dev-load-path.*` 原生证据；本次连接读回不单独证明加载路径或网页重新注入。
- 继续接收的 Google Chrome 本地实验台窗口，真实页面为 `http://127.0.0.1:43111/demo-form.html`。首次观察在同一 host 的 Cookie 原业务界面，随后返回列表并开始指定的最短书签操作链；未操作其他窗口、inspector 或 debugger。

| 核心操作 | 结果 | 证据时点 |
| --- | --- | --- |
| 书签管理：主体直达 → 返回 → 更多 → 设置与权限 | PASS；原沙箱业务加载书签，返回后焦点落在书签管理菜单；原设置读回工具 on，既有书签授权保留 | 本次执行；停用 → 详情 → 原设置恢复复用上次有效证据 |
| Cookie Editor：主体直达、更多、停用后详情、原设置恢复 | PASS；恢复后的启用状态保留 | 复用上次有效证据；本次起始还实际观察到原 Cookie 业务界面 |
| AdBlock：主体直达、更多、停用后详情、原设置恢复 | PASS；原业务全局保护 off 未更改 | 复用上次有效证据 |
| Web Markdown Clipper：主体直达、更多、停用后详情、原设置恢复 | PASS | 复用上次有效证据 |
| Prompt Shortcuts：主体直达、更多、停用后详情、原设置恢复 | PASS | 复用上次有效证据 |
| AI 对话滚动导航：正式统一详情、单一主开关、可信刷新 | PASS；开关 off、授权 disabled、Chrome 注册 disabled；受管界面清理 unknown，未确认成功 | 本次执行；没有切换启用、更新、重装或扩权 |
| 已安装历史 ChatGPT 思维导图：统一详情、单一主开关、范围与状态 | PASS；历史读回 active / registered，仅 ChatGPT 范围；不代表新官方发行包通过 | 复用上次有效证据 `mindmap-detail.*` / `mindmap-secondary.*` |
| 非 AI Page UI Basic：通用详情、停用/Space 恢复、真实页面标题与输入读取 | PASS；没有 AI 专属网站配置；临时安装已完成原身份可信卸载 | 复用上次有效证据；没有为复测重新安装 |

### AI 清理未知项的本次核对

本次先使用原“刷新可信状态”，再正常刷新自己的标准测试页并再次读取。两次均维持 off / disabled / disabled，受管界面清理仍为 `unknown`；安装身份为 `0f356e39-c6a2-4694-81e7-18ce3dbc2e1d`，固定源码 SHA `3d1157f6e92ff1e77d8ec56a7c1ccf7dacf57d67ade13343e3b8fd11ac429da6`。既有三 AI 站点与本地实验页匹配范围保持原样，没有新增授权。

当前可确认的是停用与 Chrome 注册读回，以及详情如实展示未知状态。当前页面没有观察到该 AI 导航界面；原有 Reading TOC 仍在，不能将其视为 AI 导航残留。这个观察不能证明所有旧 Document 的效果已清理。只读核对现有 Authority 说明：导航只是清理状态重查提示，不能单凭一次页面刷新证明所有原 Document 死亡；未知状态不允许直接恢复执行。没有证据将此归为新 UI 缺陷，也没有绕过原身份/清理守卫。未确认的清理会影响后续恢复或升级的就绪判断，本次保留有意停用状态，不宣称其恢复流程已通过。

### 证据、保护状态与结论

- 本次原生证据在既有 `artifacts/extension-center-r18/native-dev/`：`core-resume-bookmark-business.*`、`core-resume-bookmark-return.ax.txt`、`core-resume-bookmark-more.ax.txt`、`core-resume-bookmark-settings.*`、`core-resume-dev-connection.*`、`core-resume-ai-scroll-trusted.*`、`core-resume-ai-scroll-after-page-refresh.*`、`core-resume-extension-list-final.*`。业务、可信状态、连接与最终列表保留完整 AX；返回/菜单另有操作时 AX。最终为14项扩展列表，焦点回到 AI 滚动导航详情按钮。
- 复用已有中心/行操作/React 详情78/78、用户指定36/36、Host定向63/63、R33.3边界3/3及源码 check 的各自证据范围；本次没有源码变化或对应新失败，不重复这些自动测试，也不把它们称为本次新执行或同一冻结候选的全量原生验收。
- 原六个并行修改均保留。执行中又观察到其他任务修改 `examples/sidebar-tools/cookie-editor/app/CookieEditorApp.jsx`、`app/components/CookieEditorView.jsx`、`app/components/CookieImport.jsx` 及 `tests/environment/cookie-editor-react-design.test.mjs`，同样未触碰或纳入本轮。本次只补充本记录和被忽略的原生证据，没有为了产生新 SHA 而提交产品变更。
- **失败/未知分类**：本次无新增已确认核心产品故障；AI 旧受管界面清理为未确认。旧尺寸驱动阻塞、R4完整日志读取受限、Stay Focus两条索引404及旧无关断言保留原分类，不据此扩写产品修复或宣称零错误。
- **本轮 dev 核心功能测试：完成，保留上述清理未知项。全量正式验收：继续延期。** production冻结/构建/发布、宽度/侧栏200%/触屏/完整主题、逐应用全量原生异常矩阵与95分评分均未执行，不报PASS。原对话旧goal的blocked状态只复用交接观察，本次没有读取、修改、迁移、暂停或完成它，也没有新建goal。
