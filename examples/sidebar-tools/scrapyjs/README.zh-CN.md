# scrapyJs 采集应用

当前阶段是 **真实扩展持续开发与线上核心采集验证**。源码版本 1.5.0，唯一正式 App 包仍为 1.3.1；不因源码版本号认为已晋升或安装。此前 1.4.0 原生证据作为历史保留。完整原浏览器 SDK 保持原样；来源 `scrapyJs` / `scrapyJsChrome` 仓库只读。

## 当前目标与关键测试条件（2026-10-29）

目标是让当前 React UI 在真实 Side Panel 中可用，并完成豆瓣及可访问的 CSDN 当前页采集。用户入口固定为工具栏打开 Side Panel →「开发 → 本地项目 → scrapyjs → 在侧栏调试」；不直接导航扩展 URL。开发快照与安装态候选分别记录身份及权限，不以 Mock、历史报告、静态快照或编译成功代替真实操作。

| 关键操作 | 通过条件 | 尚缺的证据 |
| --- | --- | --- |
| 进入真实侧栏与开发更新 | 显示当前源码；核对扩展路径/ID、服务连接和应用快照；可逆 JSX/CSS 修改及还原均在侧栏可见 | 当前 React 显示及两次可见更新 |
| 配置与编辑 | 命名配置保存后关闭重开仍在；字段修改应用正确且无关规则保留；开发数据不写正式命名空间 | 当前真实侧栏操作与隔离读回 |
| 草稿保护 | 无效 JSON、未应用字段/分页草稿跨页签保留；取消切换仍保留原选择及草稿；保存/运行不会悄悄采用旧值 | 当前真实侧栏操作 |
| 豆瓣主链 | 用 `originalSites[2]`，刷新目标后明确开始；独立实时 DOM 的标题、URL、相关字段与记录及表格相符；原运行完成并退休 | 当前 React 的线上运行、DOM 与回执 |
| CSDN 主链 | 用 `originalSites[3]` 完成同一当前页流程；使用实际 DOM 条数，访问限制或验证码如实记录 | 当前 React 的线上运行、DOM 与回执 |
| 下载 | CSV 与完整 JSON 实际落盘并读回，逐值对应同一次结果；不截断、不以下载请求受理代替落盘 | 当前运行的下载文件及读回 |
| 运行与 Stop | 运行期间不能改写配置，结果属于启动配置；Stop 作用原请求，区分受理和退休；未知回执禁止重复开始 | 当前原实例与身份回执 |

本地调试的存储/网页读取可直接验证；Task 和下载继续使用原安装审阅链批准的同源码开发候选及固定 Task 0.3.0。该权限边界不因侧栏入口改变。核心完成后停止扩张，正式包晋升、production、完整生命周期、95+、全量 SDK/宿主及宽度/缩放矩阵仍延期。

2026-10-29 已建立上述执行目标，源码与候选未变化，复用已有 6 项定向检查。原先被拒绝的是接管扩展 Workspace 标签页，不应据此判断整个原生 Side Panel 不可操作；该 Workspace 的原拒绝及禁止绕过仍保留。后续通过原生工具栏已打开 Side Panel 并进入「开发 → 本地项目」，确认开发服务连接；所选 `/Applications/Google Chrome.app` 实为 CFT 149，该窗口 Native 离线，调试入口禁用。已连接的 Native Host 实际属于 `/Users/shopme/Applications/Google Chrome.app` 的日常 Chrome，但其原生状态读取超时；普通 HTTP 测试标签页可打开。当前阻塞是浏览器实例选择与日常 Chrome 原生控制超时，尚未进入 scrapyjs，不能认定工具产品故障。各项真实 React 操作仍为 `NOT_TESTED`；原始事实和后续补证统一写入 `evidence/extension-dev-20261029.json`。

## 真实扩展的持续开发入口

先检查并复用已运行的监听，不重复启动。Browser 自身复用根仓库 `npm run dev`，Chrome 加载 `dist/development`，并在「调试 → 本地开发服务」核对连接。应用有另外两个环节：

```sh
# 应用 JSX/CSS 编译监听；只写本应用 dist。
npm run dev --prefix examples/sidebar-tools/scrapyjs
# 完整编译回执通过后，发布供 Native 读取的不可变快照。
node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/scrapyjs
# 首次目录接入；已经连接时继续用原 Workspace。
opendesk browser dev /Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/scrapyjs
```

在真正 Chrome 的「开发 → 本地项目」选 scrapyjs，再点击「在侧栏调试」。Vite 编译、stage 发布与 Browser 开发连接分别核验；应用更新通过原 Native 会话替换沙箱实例，不是网页 Vite HMR，也不承诺保留 React 内存状态。修改 JSX/CSS 后必须在真实侧栏看到变化及还原，才算扩展开发更新证据。

当前本地调试只提供隔离 session 存储及 `currentPage.info`，不会继承正式安装版的 Task 委托或下载权限。`tasks.read/start/stop` 需通过原安装态 App：使用唯一打包器生成当前源码的临时候选，经「扩展」原安装审阅链安装，再使用独立安装并批准的固定 `scrapyjs.capture` 0.3.0。候选准备不等于正式包晋升；不修改 Host 以绕过限制。

线上核心场景是 `examples/original-sites.js` 的 `originalSites[2]`（豆瓣读书）与 `[3]`（CSDN）；两者都是当前页采集。实际网页、当前 DOM、运行退休回执、表格与下载读回分别留证，不使用历史条数作固定预期。2026-10-29 本轮已确认日常扩展服务连接，已编译并 stage 当前 React；真实侧栏更新和当前 UI 的线上采集仍待验证，不能引用下节 Mock 结果代替。

## 辅助 Mock 网页（不证明扩展或线上采集）

需要辅助 UI 检查时才运行 `npm run dev:mock --prefix examples/sidebar-tools/scrapyjs`，访问 `http://127.0.0.1:43127/preview/dev.html`。它直接加载 `src/App.jsx`、CSS、原 App Model 与 adapter，使用内存 SDK；不覆盖 Browser 的 `dist/development`，不安装工具包。此前 JSX/CSS 网页 HMR 结果仅属于该辅助入口。

这是明确标注的内存模拟 UI：命名配置仅保存在该预览实例内，运行返回模拟记录，下载名称带 `SIMULATED-`。模拟场景选择位于工具 iframe 外，支持正常、空结果、失败、持续运行、权限拒绝和不可信文本；不调用真实网页或 Native。配置新建/保存/改名/复制/删除、字段添加/改名/删除、分页应用、无效 JSON 和草稿保护、模拟运行/停止/下载已通过实际浏览器操作。可重复驱动见 `tests/preview-interactions.mjs`，证据见 `evidence/react-ui-dev-20261029.json`；真实网页采集与原生安装仍为 NOT_TESTED。

功能取舍和 React 选择见 `INTERACTIONS.zh-CN.md`。当前只做实际扩展核心流程所需的应用编译、stage 与开发候选准备；正式包晋升、production 和完整验收继续延期。此前临时候选早于本轮 UI 修复，不能作为当前源码产物。

业务只在本目录维护。App 运行在原 opaque iframe，固定 `scrapyjs.capture` Task 运行在原 Controller Worker，使用词法 `page/params`。没有新执行器、宿主或安装器。固定 Task v0.3.0 批准的精确 origin 为 `http://127.0.0.1:43111`、`https://book.douban.com`、`https://download.csdn.net`。安装审阅完整范围，不为每个配置创建 Task；Chrome 网站权限及当前目标 Authority 继续独立检查。

## 历史安装与业务使用

两个包需分别经原入口审阅安装：

1. 「开发」/原任务目录导入 `controller/scrapyjs.opendesk-task.json`，验证固定源码并安装 Task v0.3.0。
2. 「扩展」导入本目录唯一正式 App `scrapyjs.opendesk-tool.json` v1.3.1；它精确委托上述 Task v0.3.0。此包不包含当前 React UI。保留同 ID 的配置，更新时不先卸载。
3. 打开标准页面 `http://127.0.0.1:43111/demo-form.html`，打开采集 App、刷新目标。默认读取 `#sample-list` 的直接 `li`；`.::text` 是原引擎自身文本语法。
4. 打开「采集规则 → 字段与属性」，填写列表容器和列表项；可选填写字段名、CSS 选择器及文本/属性类型，点击「应用字段」。同名更新，其他字段保留。
5. 需要时展开「采集规则 → 分页与列表详情」。填写下一页 CSS、页数上限和去重字段；详情需列表 URL 字段、双方共同身份字段和详情 `itemConfig`。点击「应用分页与详情」，然后开始。

### App 1.4.0 操作界面与旧 Chrome 对照

先在独立可见 Mac CFT 加载只读来源 `scrapyJsChrome` 的副本，打开真实 `www/popup_crawl.html`，切换数据预览、Config 和 Headers，再与已安装 App 1.3.1 对照。旧 UI 的任务下拉、运行/导出工具栏及数据/配置分区值得保留；其 Headers 实际编辑的是展示列名，不是选择器，未将它误称为完整字段编辑器。旧扩展本次只验证 UI 渲染和这些页签操作，未验证旧采集流程。

| 旧界面习惯 | 当前 App 的改进 |
| --- | --- |
| 命名任务下拉选择 | 配置改为下拉选择，保存就近放置；多份配置不再堆成多行按钮。新建、另存为、重命名、删除及原确认继续保留。 |
| 开始、状态位于数据/配置页签上方 | 共用目标与运行反馈，下方切换「数据预览 / 采集规则」。开始后进入数据预览；切页签保留坏 JSON、未应用字段和分页详情草稿。 |
| Config 保留完整规则；Headers 逐项列出字段 | 已有字段显示名称及原选择器，点击可载入文本/属性规则；复杂描述符、嵌套或 XPath 规则直接打开完整 JSON，不自动改写。所有校验、处理、分页和详情语义保留。 |

常用路径为「选择配置 → 确认目标 → 开始采集」。目标网址默认显示紧凑摘要，点击展开修改；目标与当前网页不同源时，主操作旁提示切换网站、刷新当前网页，真正目标及权限仍由原任务链核验。页签支持方向键、Home/End 和可见焦点。

字段点击载入本身不写存储；修改后仍须「应用字段」，再运行或保存。同名更新其他字段保留；未应用时禁用载入其他字段，避免丢弃草稿。切换配置遇到脏草稿先确认，取消后下拉框仍显示实际原配置。高级完整 JSON 保留原语义，无法表示为普通 CSS/属性的字段不强行转换。

结果仍保留全部字段、原始快照与导出顺序；表格优先显示 title。Stop 受理、原实例退休、未知结果不重放及原 ETag CAS 均未改变。新版本不重冻固定 Task 0.3.0，也不增加权限。

本次同候选 App 1.4.0 经原安装审阅链从 1.3.1 更新，五份原命名配置保留；字段修改/保存/销毁重开、坏 JSON 和未应用字段跨页签及取消切换、切换清旧结果通过。豆瓣样本返回 20 条、11 字段，逐值表格及 JSON/CSV 实际下载字节一致。配置下拉测试采用标准 DOM 选择驱动，其余相关按钮和文本使用浏览器输入；不冒称物理 Mac 下拉菜单点击。证据索引 `evidence/legacy-ui-20261029.json`，旧/新截图与原始报告在 `artifacts/scrapyjs/legacy-ui-20261029/`。

这是独立静态开发扩展快照，没有 serve 连接，未更新日常 Chrome，也不代表 production/正式生命周期验收。1.3.1 首轮改进和原业务证据分别保留在 `evidence/ui-20261029.json`、`evidence/original-sites-20261029.json`，有效未变证据继续复用。

### 豆瓣图书与 CSDN 原例

`examples/original-sites.js` 导出四份完整配置，顺序为豆瓣历史样本、CSDN 历史样本、豆瓣线上、CSDN 线上。将所需条目的 `config` 完整 JSON 粘贴到「采集规则 → 高级 · 完整 JSON」，保存为命名配置；打开对应网址、刷新目标、开始采集。可用下面的本地命令取得线上豆瓣 JSON，索引改为 `3` 即为 CSDN：

```sh
node --input-type=module -e 'import {originalSites} from "./examples/sidebar-tools/scrapyjs/examples/original-sites.js"; console.log(JSON.stringify(originalSites[2].config,null,2))'
```

两份原例均只采当前页：没有分页或详情需求。豆瓣保留 title 属性、url、publication、可空 rating，并按原 `splitPublication` 生成 publication_raw、author、translator、publisher、publication_date、price、currency，共 11 字段；无法解析的价格/币种按原规则保留 null。CSDN 的 title、url、description、price_text、metrics_text、author_display、membership 共 7 字段保留原文本、单位和作者分隔符。

本批 App1.3.0/Task0.3.0 在独立 Mac CFT 的原安装链与真实 App 中通过：历史样本豆瓣 **20 条**、CSDN **9 条**；线上豆瓣 **20 条**、CSDN **9 条**。历史预期来自原 script.json/DOM；线上预期来自运行时独立 DOM 读取，条数并非长期保证。四份配置均完成保存、销毁重开、原 Task 采集、完整表格核对、JSON/CSV 文件下载读回；运行 completed/released，切换配置清除旧结果。CSDN 首条本次为 PCL学习，学习人数文本是线上当前值，不能用历史 8938 强行断言。

可提交索引为 `evidence/original-sites-20261029.json`；原始报告 `artifacts/scrapyjs/original-sites-20261029/app-c/report.json`。样本及独立预期见 `fixtures/{douban-books,csdn}.html`、`examples/original-sites-expected.json`。样本仅保留原列表，去除远程脚本与资源，来源哈希和改动已记录；它们不冒充线上访问。本任务的静态开发快照位于 `artifacts/scrapyjs/original-sites-20261029/browser-source/dist/development`，包校验通过，浏览器已关闭、临时样本映射已移除；日常 Chrome/开发输出未切换。完整构建先遇到既有资源清单不一致，修复校验器后对同一编译产物通过完整包校验；不另称 production 或正式发行通过。

### 命名配置

- 初次升级时，原单配置显示为「默认配置」，内容保留；读取不写入，下一次明确保存才转为命名记录。
- 「＋ 新建」创建默认草稿，编辑后「保存配置」填写名称。「配置管理 → 另存为 / 复制」将当前有效配置保存为独立记录，原记录不变。
- 在下拉框选择已保存的名称切换；最后选中的已保存记录会在销毁 App 再打开后恢复。「重命名」用于已保存且没有脏草稿的记录；有修改先保存。名称忽略首尾空格、按 NFC 规范化，大小写不敏感的同名会明确拒绝。
- 切换、新建或删除遇到未保存 JSON / 未应用字段、分页、详情编辑时，先确认丢弃；取消保留原内容与选择。删除总需确认，删完最后一份后显示可继续编辑的默认草稿。复制和新配置名称表单也可取消或按 Escape。
- 保存、切换、重命名和删除共用原 ETag 条件写入。发生冲突或保存回执未知时保留草稿和远端列表，禁止自动重试；「读取保存版本」只读远端，「用保存版本替换草稿」经确认后采用远端完整列表。需要的本地草稿应先复制到外部文本。
- 运行期间锁定配置编辑和管理，Stop 始终作用于原实例。结果显示启动时的配置名称；切换配置后清空上一份结果，不把旧结果归给新配置。配置记录 ID 与固定 `scrapyjs.capture` Task 身份互不替代。

命名配置是 App 自身数据：同一 `capture-config` 存储项使用 `{schemaVersion:1, selectedId, records:[{id,name,config}]}`，最多 10 份，**整个存储项 JSON 合计最多 8,192 UTF-8 字节**；不为每个名称创建 Task。名称 1–60 个字符、最多 180 UTF-8 字节。每份采集配置仍遵守原 itemConfig / options 各 4,096 字节限制。超限、损坏记录和非法配置均拒绝保存，草稿与原保存值保留；较大的旧单配置仍可读取，不会为了迁移自动截断或覆盖。

历史 App 1.2.0 已在独立 Mac CFT 的原安装升级入口验证：A/B 保存切换、销毁重开、改名复制、同名拒绝、删除确认与取消、JSON/字段/分页草稿保护，以及两份不同字段的真实采集均通过；运行均 completed/released。旧列表详情配置与控件来回切换完整保留。36 项定向 Node 检查通过；ETag 冲突/并发保存、容量、损坏存储和详情草稿保护属于组件证据。可提交索引为 `evidence/named-configs-20261029.json`，原始报告为 `artifacts/scrapyjs/native-profiles/candidate-20261029-c/report.json` 与 `supplement-20261029-a/report.json`。原生测试使用上批固定静态开发快照，不代表日常 Chrome 已更新或 production 验收。

未应用的表单编辑阻止运行与保存。完整 JSON 保留原选择器/嵌套字段语法，也可填写原 `validation` / `fieldRequirements` / `processing`；配置只接收数据。表格呈现真实记录，完整快照仍保留。宿主、引擎、Stop 受理和实例退休分别显示；结果未知时禁止重复开始。原 Stop、配置 ETag 冲突保护和 JSON/CSV 下载继续使用已有链路。

分页链接通过公开 `page.goto()` 推进原目标会话；普通 DOM 链接点击会因文档替换触发安全栅栏，不能直接沿用旧扩展的点击导航。按钮与同文档锚点仍使用公开 Locator，保留点击处理器；链接按当前文档 base URI 解析。分页只开放 CSS，最多 10 页；达到上限时保留已采集数据及 partial/page_limit，不伪称自然结束；详情最多 100 条、串行执行，严格核对 URL 与 ID，不静默重试。相同身份而内容不同报错；重复详情 URL、详情覆盖列表字段、错误 ID、非法价格均拒绝。详情 `numberFields` 使用来源示例的严格小数 Pipeline。滚动分页、XPath 翻页、断点恢复和重试管理未交付。

## 先脚本验证，再接 UI

可复制的零参数 ESM 入口：

| 脚本 | 输入与独立预期 | 本批真实 Controller 结果 |
| --- | --- | --- |
| `examples/fields.js` | GitHub 旧例三行；文本、href、可空属性；名称经原 Pipeline 大写 | 三行全部字段一致；BrowserValidation 运行，URL 绝对化；completed/released |
| `examples/pagination.js` | 两页共五行，两个重复；首次出现顺序三条 | 两页、三条、重复 2；`site_exhausted` 自然终止 |
| `examples/list-detail.js` | 旧 catalog 的 A/B/C、Ada/Ben/Cara、19.90/25.00/30.00；列表有 A 重复 | 三条 URL/ID 正确关联，价格为 19.9/25/30；列表和详情原引擎均 completed |
| `controller/main.js` | 同样的声明式详情参数，作为固定 Task | 与上述完整黄金一致；经原验证/安装链安装 |

输入、输出和来源差异见 `fixtures/README.md`、`examples/expected.json`。旧 Node HTTP 例子的 PASS 不作浏览器证据；这里用原 ChromeSpider / BaseSpider / Request / Scheduler / ItemLoader / Pipeline，在受控网页世界执行真实 DOM 提取。

复现时保留既有 `npm run dev` watcher、标准 demo 服务和日常 Chrome，使用独立 CFT/Profile 的不变开发快照：

```sh
# 前提：canonical demo 服务正在 127.0.0.1:43111 提供 examples/tasks。
# 仅添加有所有权检查的临时映射，不修改 demo-form.html 或重启服务。
node examples/sidebar-tools/scrapyjs/tests/fixture-mount.mjs mount
node examples/sidebar-tools/scrapyjs/tests/build-examples.mjs artifacts/scrapyjs/my-examples
node examples/sidebar-tools/scrapyjs/tests/native-examples.mjs --suite=artifacts/scrapyjs/my-examples/suite.json --out=artifacts/scrapyjs/my-native-run
node examples/sidebar-tools/scrapyjs/tests/fixture-mount.mjs unmount
```

`build-examples.mjs` 为每个入口准备独立源码快照，并调用现有 `build-program-project.mjs`；它不运行引擎。原「开发」入口导入固定草稿并显式 Run，原持久结果绑定 sourceHash/runId/resultId/retirement。`params` 可传 `url`，仍须原任务范围和页面授权。

原始脚本报告：`artifacts/scrapyjs/native-examples/core-d-20261029/report.json`。可提交的证据摘要与每项证据层级见 `migration-status.json` 和 `evidence/core-examples-20261029.json`。本批 App 独立成功报告为 `artifacts/scrapyjs/native-examples/app-d-driver5-20261029/report.json`：同一 App 的三组字段/分页/详情配置应用、未应用保护、三条全字段表格、保存后销毁并重开、完整 JSON 46,312 字节下载读回均通过。前一报告整体 BLOCKED 是后续 App 下拉框驱动失败，四个脚本结果本身均 PASS；未改写历史状态。

## 后续打包阶段（当前延期）

以下仅记录后续交付流程，不是当前 UI 开发的前置步骤。UI 稳定且进入打包阶段后，先执行本工具的 JSX 编译，再候选测试，经原 `--promote-from` 原子晋升和 `--check-project` 同源核对。Task 源码/manifest 改动则重新冻结、运行、验证、安装，并同步 App 的精确委托；不静默更新已安装 Revision。

```sh
# Task 范围或源码变化时，先按原 program build/验证/安装链冻结新 Task 并同步精确 pin。
# 固定 Task 0.3.0；以下仅供后续打包阶段，须先编译当时的 UI 源码。
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --out artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json
SCRAPYJS_CANDIDATE=artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json node --test examples/sidebar-tools/scrapyjs/tests/{profiles,app-model,app-view,package}.test.mjs
# 测试通过后才执行：
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --promote-from artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --check-project
# 本批原生操作使用 tests/native-examples.mjs 的 --app-lane=original-sites --headed；
# suite 参数须遵守固定 Task 的 url/configJson/optionsJson paramsSchema，见原始报告输入。
```

完整原 SDK 为 1,136,734 bytes，SHA-256 `c7a266c1bd5f34ba5e5a85d163c0573fc1d5afb60c07d0ce46af8393e7ada4be`。`engine/browser.js` 只把 classic IIFE 已有导出转为词法 ESM；无压缩、删模块、假 window/DOM 或 Node 能力模拟。通知见 `vendor/scrapyjs/THIRD_PARTY_LICENSES.txt`。无需为日常业务重新生成这份未变 SDK。

Task v0.3.0 sourceHash `12668947ef0f99851986891b911ee3d32deca993e42066b48f496691579feb4f`，manifestHash `1bec7362a33d4aeb4ce051d2eed699aa4876e3c7ae82efc536005f287340f53a`。App 和 Task 包摘要从同源检查及证据账本读取。

## 尚未完成

可视选择/高亮/表格选择与选择器生成、完整处理/质量编辑、自动保存/来源 profile 运行策略/自动重绑定、暂停/继续、检查点恢复/调度及大结果体验尚未完成，不是当前 UI 阶段的完成条件。AI 助手、克隆 UI、配置任务库和通用录制/回放明确排除；命名配置继续保留。Rule/LinkExtractor/runCheckpointTasks 等完整实现保留不等于已在 OpenDesk 逐项运行。原 `processing.splitPublication` 的本批豆瓣当前页验证见原站点证据；它不代表任意出版格式均受支持。

上轮 v0.1.0 六项单页核心证据保留在 `migration-status.json.coreEvidence`，包括正常 Stop、回包前取消和 JSON/CSV 文件下载。它们是旧候选证据，不提升为新候选的全量验收。旧 `k3-sandbox-error-forwarding.test.mjs` 的过时 Worker URL 夹具缺口继续保留，未放宽来源校验。本轮延期 production、升级/撤权正式验收、完整 32 项验收、95+ 评分、宽度/缩放矩阵及压力测试。Node 文件/CLI 专用功能本轮不迁。
