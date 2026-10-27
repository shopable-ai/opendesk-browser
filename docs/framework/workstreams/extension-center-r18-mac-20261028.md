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
- **NOT_TESTED**：真实已安装 Side Panel 的320/360/400/440/520精确宽度、200%缩放、完整深浅色与触屏等价矩阵；五应用逐项未知/卸载/身份变化的全部原生故障场景；所有受支持 Page 类型的完整原生矩阵；被发行门禁阻断的新 AI 回复思维导图包；Side Panel Console 完整采集。已有 Node/服务替身结果不能填补这些原生项。
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
