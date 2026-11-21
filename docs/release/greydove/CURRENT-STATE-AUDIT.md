# GreyDove（灰鸽）T0 发布现状审计

审计日期：2026-11-17（北京时间）；首次远端抓取及本地检查约 17:37，运行产物观察至 17:44。范围：T0.1–T0.7；本报告不授权启动 T1/T2/T3 实施或提交商店。

依据：本目录既有 README、TASK-PLAN、BRAND-SPEC、STORE-LISTING、COMPLIANCE-AND-PRIVACY、RELEASE-CHECKLIST、COMMERCIALIZATION-ROADMAP 及根 `AGENTS.md`。唯一任务树仍为 `TASK-PLAN.zh-CN.md`。

证据标记：**事实**为本轮直接读取的源码、配置、文件或官方页面；**判断**为基于这些事实的发布建议；**未知/NOT_TESTED**表示没有足够证据。历史组件测试、生产构建、真实 Chrome、商店审核分别记录，不互相替代。

## 1. 核心结论

**当前不能作为 GreyDove 正式上架候选提交。** 已有浏览器自动化与脚本工作台实现和完整的构建/验证机制，但“品牌改名即可发布”的条件尚不成立。

| 优先级 | 关键工作/阻塞 | 结论性质、责任任务与通过条件 |
|---|---|---|
| P0 | 首发范围与脚本执行政策 | Standard 与 Developer 不同；必须固定 Standard 范围，解释用户代码、沙箱、Page、Controller、市场安装之间的信任边界。T0.7/T5.1/T5.5：每条首发描述能在最终 Standard ZIP 复现，并能说明动态代码适用的 API/沙箱政策边界。 |
| P0 | 权限、数据与公开隐私资料 | `<all_urls>`、debugger、cookies、proxy、userScripts 均有相关实现；AI、云控、可选统计存在网络链路。不能宣称完全离线、零上传或无数据处理。T5.2–T5.4：完成逐权限用途、接收方/留存/删除清单及公开隐私政策，且与后台声明一致。 |
| P0 | 发布账号与主体未知 | 本轮没有私人后台注册、付款、验证或提交资格证据。T0.5/T0.6/T5.7：账号持有人完成第 5 节人工核对，记录非敏感状态。未知不等于未注册。 |
| P0 | 最终图标素材缺失 | 未定位用户最终选定原图、正式源文件、权利记录或可追溯的 16/32/48/128 PNG 集。根 Manifest 没有 `icons`。T2.1 阻塞：取得原始材料，不自行换图或重设计。 |
| P1 | 对外品牌与素材尚未实施 | 当前仍显示 OpenDesk Browser/OD，存在多语言、工具内文案、通知、市场入口等引用。T1/T3/T4：按第 4 节逐 owner 修改，保留技术身份；以最终包截图复核。 |
| P1 | 缺少同一 GreyDove 候选的完整证据 | 旧 dist、旧 PASS 报告、现有运行进程不能拼成新候选通过。T6：冻结输入，Standard 构建、ZIP 内容/哈希、真实 Chrome、后台资料逐项绑定同一候选。 |
| P1 | 最新远端CI不是全绿 | 所查6项运行中5项failure，成功项仅为分支清理。失败原因尚未分类。T6.4按最终候选受影响行为读取日志、定位和验证，不把失败直接等同为品牌或产品缺陷。 |
| P1 | 随包工具合规与第三方许可 | AI VIP Share 的会话分配/Cookie/代理链需要账号及服务授权依据；视频工具需核对内容权利和宣传。T5.5/T5.6：明确随包/可安装范围、来源权利与必要披露。仅不宣传不能消除随包代码的审核责任。 |

本轮完成的是**现状审计交付**。T0.5/T0.6 人工确认仍开放，T0 总体保持 IN_PROGRESS；没有将外部未知状态伪报 VERIFIED。未修改产品、Manifest、图标、构建脚本；未构建、运行产品测试、安装、上传、提交或推送。

## 2. 最新仓库基线

| 项目 | 本轮直接观察 |
|---|---|
| 仓库/远端 | `shopable-ai/opendesk-browser`；origin 为 `git@github.com:shopable-ai/opendesk-browser.git` |
| 工作目录/分支 | `/Users/shopme/Documents/workspace/opendesk-browser`；`main` |
| 已执行远端更新 | `git fetch origin main` 成功；未 pull/merge/rebase |
| 抓取的 origin/main | `5926662a802ea76babadf6b8d6837c872eb21448` |
| 本地 HEAD | `0faddb6bb7293705bc6b4c257d8cea4936aab619`，2026-11-17 17:27:31 +08:00 |
| 分歧 | `git rev-list --left-right --count HEAD...origin/main` 为 `2 0`；本地包含远端并多两个提交，未擅自推送 |
| 旧规划基线 | `ec8766088b4f290386cf05d5848b56f767ce6d06` 是历史读取快照，不能继续标成最新远端 |
| 工作区 | 非干净，且审计中有并行写入；本轮三个允许文档在落盘前没有其他未提交修改 |
| 当前候选身份 | 未冻结；不存在本轮 GreyDove ZIP/packageHash/Chrome 实装证据 |

近期相关提交：

- `0faddb6bb`：保留本地诊断工作并同步 main；本地独有提交还包括 `e800e79fa` 的诊断取消回执处理。
- `5926662a8` 及此前 `7678b0b9f`、`264803584`、`5505ae4fd`、`184b04ede`、`95f6b16f3`、`5bcb4b93d`、`8b070ef1e`：保存本项目发布账本、商业化、检查清单、隐私计划、商品草案、品牌及任务规划，均不是品牌实施。
- `714b592dc`：2026-11-17 的工作流/编辑器集成；`2d2fa06b0`：2026-10-29 的高风险 scoped debugger SDK。它们影响功能/权限审计，不能只审旧发布文档。

17:37 工作区快照（后续并行变化不归本任务）：

```text
M DESIGN.md
M docs/framework/developer-ui-ux-r1-20261114.zh-CN.md
M docs/framework/developer-ui-ux-r1-test-spec-20261114.zh-CN.md
M examples/tasks/README.zh-CN.md
M scripts/wxt-development.mjs
M src/scripting/packaged/locator-dom.js
M src/ui/controller-results-view.js
M src/ui/controller-revision-view.js
M src/ui/develop-fields.js
M src/ui/develop-view.js
M src/ui/page-program-library.js
M src/ui/react/tabs/develop-advanced.tsx
M src/ui/react/tabs/develop-editor.tsx
M src/ui/react/tabs/develop-execution.tsx
M src/ui/script-editor.js
M src/ui/tool-shell.css
M tests/environment/controller-result-reload-wait.test.mjs
M tests/environment/developer-editor-interaction.test.mjs
M tests/environment/script-editor.test.mjs
M tests/framework/r5-modern-page-api.test.mjs
M wxt.config.mjs
?? examples/tasks/SCRIPT-UI-TESTING.zh-CN.md
?? examples/tasks/demo-ui-operations-draft.js
?? examples/tasks/form-ui-draft.js
?? src/ui/develop-script-picker.js
?? tests/environment/wxt-development-watch.test.mjs
```

这些文件均保留；尤其 `wxt.config.mjs`、编辑器相关文件是未来 T3 的潜在交叉 owner，实施前须重新读取 diff 并协调。源码结论来自此 HEAD 加工作区，不冒称纯远端提交状态。

17:59收尾复核时HEAD/origin引用未变；除本轮3份文档，另见并行新增修改 `src/ui/page-candidate-actions.js`、`src/ui/react/tabs/develop.tsx`、`tests/environment/controller-revision-management.test.mjs`，及未跟踪 `src/ui/react/tabs/develop-saved-scripts.tsx`、`tests/environment/develop-script-picker.test.mjs`。本任务未触碰这些文件，不把持续变化的共享工作树称为已冻结候选。

### 当前构建与运行环境

| 对象 | 已观察事实 | 不能推出的结论 |
|---|---|---|
| 持续开发 | PID `94541` 为 `node scripts/dev.mjs`，监听 `127.0.0.1:43119`；日常输出 `dist/development` | 监听不证明每个已打开 Side Panel 连接、已应用 revision 或无等待草稿 |
| 开发磁盘产物 | `dist/development/manifest.json`：OpenDesk Browser Developer、0.1.0；edition record 为 developer/compiler=true。17:39:39 的更新 revision 为 `c4703c854aafb9fa287720abc7ede51f3be232d1c633b8b20bbc8637c3981245`，观察期间持续变化 | 该 revision 是磁盘快照，不能当作 Chrome 已应用指纹 |
| 旧生产磁盘产物 | `dist/production` 为 Standard/compiler=false，OpenDesk Browser、0.1.0；Manifest mtime 2026-11-13 00:55:15，SHA256 `294fd628d27b3bb55bd062a110a41d6039cab7353a26af849ada2455f4f12bcc` | 不证明与当前 HEAD、工作区或已有 ZIP 同源 |
| 已有浏览器进程 | PID `28271` 启动参数加载 `dist/development`；PID `98795` 加载 `dist/production`，均为既有独立测试实例 | 启动参数不能证明当前启用状态、真实扩展 ID、页面执行版本或 Native 配对 |
| 真实运行身份 | 未进入共享 Side Panel、未读其“调试→本地开发服务”、未核对实际扩展 ID/Native allowed_origins | 当前已应用 revision、日常个人 Chrome 安装及 Native 配对：UNKNOWN；未刷新或争用其他 owner |

`docs/framework/evidence/wxt/builds/build-production.json` 是旧 passed 报告（attempt `9594ae6e-a665-4ea1-806b-a719a18316fe`，packageHash `4543abc643f31726ab6a08919fe204377fe182e48d37d26a1f7cbff2ccc8dfb3`）；`docs/framework/evidence/wxt/packages/pack-production.json` 又是不同旧回执。未逐输入重验，不能对应当前生产目录。更早的 `docs/environment/build-production.json` 仅列 7 个文件，也不是当前完整产品证据。

## 3. 当前项目实际状态

### 品牌、图标、商店资源

根 `manifest.json:3–7` 为 OpenDesk Browser / OD / 0.1.0 / “OpenDesk Browser 浏览器自动化框架。”；MV3，最低 Chrome 138，禁止 incognito。无 `icons` 或 Action 正式品牌图标。

最终鸽子方向已记录于 `BRAND-SPEC.md`，但仓库检索未定位最终参考图和正式源图，未找到与该图绑定的商业使用权记录。不能从文件名搜索证明所有图片内容都不存在，也未逐张检查 2,166 个已跟踪图片；结论是**未定位可交付资产**，不是擅自宣布用户从未保存过原图。

`scripts/prepare-public.mjs:127` 内嵌生成 `icons/notification.png`；`src/platform/host/sdk-broker.js:17`、`src/platform/chrome/notifications.js:26` 将其用于系统通知。它是独立通知资源，不能证明品牌图标齐备。`docs/contracts/source-snapshots/scrapyJsChrome/icons/icon16.png`、`icon48.png`、`icon128.png` 是旧来源快照，不能晋升为 GreyDove 图标。

商店至少需要 ZIP 内 128×128 PNG 和一张真实截图（1280×800 或 640×400，最多 5 张）；16/32/48 属本项目扩展适配要求，不能误写成所有尺寸均为商店后台强制上传项。440×280 小宣传图、1400×560 marquee 属可选宣传素材。现有 `src/market-site/media/` 的六张截图分别为 `knowledge-inbox-1.2.6.png`、`markdown-workbench-1.0.1.png`、`quick-notes-1.1.8.png`、`reading-toc-1.0.3.png`、`time-review-1.3.1.png`、`web-markdown-clipper-1.0.0.png`，不是最终 GreyDove 候选截图；其图片内嵌品牌尚待视觉复核。

### 构建、发行和生产 ZIP

**首发建议沿用已定 Standard production。edition 与 mode 是两条维度。**

| 发行 | 实际差异 | 默认构建/验证/打包路径 |
|---|---|---|
| Standard production | 不随包提供浏览器组件编译器；保留固定 React/Vue 运行时，不能称“不支持 React/Vue” | `npm run build` → `dist/production`；`node scripts/verify-package.mjs dist/production production`；`npm run pack` → `artifacts/opendesk-browser-production.zip` |
| Developer production | 增加固定组件编译器和对应许可证，开启浏览器编译常量；名称追加 Developer | `npm run build:developer` → `dist/production-developer`；`npm run verify:developer`；`npm run pack:developer` → `artifacts/opendesk-browser-production-developer.zip` |
| 静态 development | 静态开发包不是已连接 serve 的持续开发 | `npm run build:dev` 默认 Standard → `dist/development`；Developer 静态入口为 `build:developer:dev` → `dist/development-developer` |
| 日常持续开发 | `scripts/dev.mjs:32` 默认 Developer，但固定沿用日常路径 | `npm run dev` → `dist/development`；本轮复用、未重启既有 writer |

证据：`package.json:18–25`、`scripts/browser-editions-r245.mjs:26–39`、`wxt.config.mjs:33–68`、`scripts/build.mjs:26–51`、`scripts/pack.mjs:8–10`。

T6 时才执行下列链路，**本轮未运行**：在 owner 协调好的冻结候选/输出中 `npm ci --ignore-scripts` → `npm run check` → 显式确认 Standard 环境后 `npm run build` → 相关测试 → 单独验证 production → `npm run pack` → ZIP 与已验证目录逐文件比较。两版比较或完整矩阵按 T6 当时合同执行。

需纠正既有发布清单的使用边界（本轮不改该文件）：

- `npm run verify` 同时验证 production 与 development，仅构建 production 后不能假设它可独立通过。
- `npm test` 的 pretest 会编译 Adblock、Stay Focus、Cookie Editor、AI VIP Share，不能作为只读审计命令。
- build 会写 dist、`.wxt/public`、工具编译结果及构建回执；pack 不构建，但覆盖固定 ZIP/回执。verify 重建期望工具资源的条件分支也可能有临时编译副作用。
- Standard 命令需防止继承 `OPENDESK_BROWSER_EDITION=developer` 等外部配置；核对包内 `framework/browser-edition.json`，不能只看目录名。
- pack 先验证再压缩同一目录；源码未见与 build 同等的输出锁或压缩后完整文件重比。判断：存在并行 writer 导致候选漂移的窗口。T6 应冻结输出并复用 CI 的 ZIP 对照，不能只依赖 CRC。

### 已有校验与 CI

`scripts/verify-package.mjs:223/593/709` 已覆盖精确 Manifest/权限/CSP/WAR、文件集合、代码预算、AST/动态执行限制、固定 vendor/compiler 哈希、HTML/CSS、许可证、官方工具/Page 来源、sourcemap 和全包指纹。未证明 description/version 值与根输入全面一致；静态通过也不证明权限交互或商店审核。

`.github/workflows/r3-source-package.yml:31` 构建两种 mode、验证、打包并比较 ZIP 与 dist 及构建/打包 hash。`.github/workflows/browser-compiler-editions-r245.yml:34` 包含 Standard/Developer production 对比及固定 Chrome 155.0.8059.39 的专项步骤；其 push 过滤遗漏根 Manifest、lock、build-contract 和未来品牌图标目录。`.github/workflows/app-ci.yml`、`app-release.yml` 是独立 App 流程，后者含晋升/推送，不能作为本轮核查命令。**工作流定义存在不等于本次运行通过。**

本轮通过 GitHub 公开 REST API 查询抓取的远端 `5926662a802ea76babadf6b8d6837c872eb21448`，返回以下六项已完成运行；本地多出的两个提交及脏工作区不被这些结果覆盖：

| Workflow / 运行链接 | 本次远端结果 | 已读取的失败步骤/边界 |
|---|---|---|
| [Page userscript dependencies and package](https://github.com/shopable-ai/opendesk-browser/actions/runs/44052230112) | failure | r3-package：D1 metadata, immutable assets, real preview consumers and dependency UI |
| [R7 axiosx HTTP page + fixture contracts](https://github.com/shopable-ai/opendesk-browser/actions/runs/44052229852) | failure | 未读取详细日志，原因未分类 |
| [Site access targeted checks](https://github.com/shopable-ai/opendesk-browser/actions/runs/44052229869) | failure | site-access：Syntax and focused permission / Sidebar regressions |
| [Sidebar R1 P0 targeted checks](https://github.com/shopable-ai/opendesk-browser/actions/runs/44052229893) | failure | 未读取详细日志，原因未分类 |
| [Native Agent R1 components and package](https://github.com/shopable-ai/opendesk-browser/actions/runs/44052229858) | failure | 未读取详细日志，原因未分类 |
| [Cleanup merged short-lived OpenDesk branches](https://github.com/shopable-ai/opendesk-browser/actions/runs/44052230000) | success | 分支清理，不是产品/构建/权限验收 |

仅凭步骤名不能判定是产品缺陷、过时断言还是环境问题。本轮记录发布风险，不修 CI；T6.4 按最终候选的受影响行为读取日志、分类并修复，不能将当前远端说成发布全绿。

品牌接入约束：根 Manifest 是名称唯一来源；Standard name ≤65 字符以容纳 Developer 后缀，short_name ≤12。新增 `icons` 当前会触及顶层 Manifest 白名单；新增 `action.default_icon` 也触及 Action 精确合同。PNG 必须同时进入复制、必需/允许资源集合和哈希，单独加文件会成为 unexpected asset。相关 owner 为 `scripts/prepare-public.mjs`、`scripts/build-contract.mjs`、`scripts/verify-package.mjs` 及既有测试/CI，不能另造品牌打包器。

## 4. 完整品牌修改清单

### 检索范围与工作量

已跟踪路径 28,041；对可读 UTF-8 文件按区分大小写 `OpenDesk Browser|OpenDesk|\bOD\b` 扫描，命中文件 4,904（docs 3,045、projects 705、tests 447、evidence 217、examples 155、src 133、scripts 54，其余 148）。包含 SDK 名、历史资料和第三方压缩变量，**不是 4,904 个必改文件**。另以忽略大小写及旧描述扫描命中文件 13,386，额外大量是 `opendesk` 技术标识。复现入口：`git ls-files`，结合 `git grep -I -l -i -E 'OpenDesk|(^|[^[:alnum:]_])OD([^[:alnum:]_]|$)|浏览器自动化框架' -- .`；检索数为落盘审计文档前的快照。

下列是明确发行入口的定向修改清单；未逐条语义审阅所有历史文件，未做全图片 OCR。T3 完成条件是**实际发行资源的用户可见品牌清零**并保留内部身份；不能将本次扫描称为全部历史引用已经逐项人工验收。

工作量估计：下表与后续正式包清单去重共 **94 个用户可见必改/待确认文件的审阅工作集**（初次86＋复核新增8），含9个安装包JSON、1个示例源码文件；不含内部必保留、历史、测试/构建与条件契约文件。不是94个无条件必改文件，生成包须同源晋升，已有失活入口先确认真实消费者。全仓大小写敏感与不敏感检索的文本/边界规则不同，两组命中数不能直接相减计算遗漏。

### 用户可见品牌：定向修改

同一单元格中的路径各自列明；同文件的桌面 OpenDesk/协议/API 部分仍按下一节保留。

| 精确文件路径 | 修改理由/范围 |
|---|---|
| `manifest.json` | name、short_name、旧描述、正式品牌 icons；本轮不改权限或版本 |
| `README.md`；`package.json` | 外部介绍及过期描述；package 的内部 name 保留 |
| `src/ui/sidepanel.html`；`src/ui/app.html`；`src/ui/cloud-control.html`；`src/cloud-control/runner.html` | 文档标题/页头 |
| `src/ui/target-bootstrap.html`；`src/sidebar-tools/sandbox.html`；`src/scripting/sandbox/sandbox.html` | 执行与沙箱页标题；不改 Worker/协议身份 |
| `src/native-agent/settings.html`；`src/native-agent/workspace.html` | 扩展页标题、眉题、统计披露主体；原生程序名称保留 |
| `src/native-agent/http-relay.html:4`；`src/ui/trusted-history-workbench.js:106` | 本地HTTP转发页标题及可信Side Panel错误文案 |
| `src/ui/react/workspace/WorkspaceView.tsx:51` | 可见 OpenDesk 字标与 O 占位 |
| `src/i18n/locales/en.js`；`src/i18n/locales/ja.js`；`src/i18n/locales/zh-CN.js`；`src/i18n/locales/zh-TW.js` | 工作区/设置标题，约 24/177 行；区分独立原生程序提示 |
| `src/knowledge/page.js:113` | 字标及无障碍品牌 |
| `src/platform/chrome/blocked/blocked-always.html`；`src/platform/chrome/blocked/blocked-quota.html`；`src/platform/chrome/blocked/blocked-schedule.html`；`src/platform/chrome/blocked/blocked-session.html` | 拦截页标题与恢复指引 |
| `src/platform/chrome/managed-site-notice-page.js:38`；`src/platform/chrome/update-notice-page.js:29`；`src/platform/chrome/update-notice-service.js:351` | 提醒标题、aria 名与缺省品牌 |
| `src/platform/chrome/browser-screenshot-resources.js:73` | 用户下载文件名前缀，先核对消费者 |
| `src/platform/host/managed-site-runtime-contract.js:10`；`src/sidebar-tools/runtime-compatibility.js:5` | 用户可见恢复提示 |
| `src/ui/extension-center-localization.js`；`src/ui/locale-manager-localization.js`；`src/ui/tool-management-localization.js` | 四语言市场、设置路径、语言包及“跟随 OpenDesk” |
| `src/ui/sidebar-tools-fields.js:491`；`src/ui/react/tabs/locale-manager.tsx:256`；`src/ui/react/tabs/task-catalog.tsx:23`；`src/ui/react/tabs/tool-host.tsx:584` | 语言、打开侧栏及开发信息 |
| `src/ui/react/components/update-notice.tsx:52`；`src/ui/scheduled-task-workbench.js:205` | 本体更新与存储说明 |
| `src/ui/script-editor.js`；`src/ui/user-scripts-access.js:6`；`src/ui/tool-shell.js:729` | Chrome 允许用户脚本的扩展名及侧栏反馈；编辑器文件存在并行 owner |
| `src/ui/sidebar-tools/package.js:92`；`src/ui/sidebar-tools.js` | 安装来源、缺省标题、权限解释及错误/恢复文案 |
| `src/ui/developer-ai-prompt.js` | 四语言复制给作者的扩展介绍；CLI/package.json.opendesk/API 保留 |
| `src/ui/workflow/workflow-view.js:1611/1676` | 导出author与官方AI服务未开放提示；先确定展示主体，1684行本机产品名不联动改 |
| `src/market-site/templates.mjs`；`src/market-site/client.js` | 网站标题/字标、安装帮助与交接反馈；桌面 OpenDesk 名称保留 |
| `src/marketplace/marketplace.html`；`src/marketplace/market-install.html`；`src/marketplace/page.js` | 市场/审阅页标题、来源和发布者展示 |
| `src/marketplace/external.js`；`src/marketplace/install.js`；`src/marketplace/discovery.js`；`src/marketplace/page-install.js` | 外部交接、发现失败、工具栏/审阅提示 |
| `src/marketplace/catalog.js:6` | author 展示需与最终发布主体核对；`opendesk/...` 身份不联动替换 |
| `projects/adblock/src/App.jsx`；`projects/adblock/trusted/host-controls.js`；`projects/adblock/trusted/service.js` | 恢复指引、过滤说明及错误 |
| `projects/ai-proxy/src/i18n/locales/en.json`；`projects/ai-proxy/src/i18n/locales/zh-CN.json`；`projects/ai-proxy/src/i18n/locales/zh-TW.json` | 跟随宿主配色文案（1098 行） |
| `projects/bookmark-manager/src/index.html`；`projects/bookmark-manager/src/main.js:435` | 扩展授权指引 |
| `projects/cookie-editor/app/components/CookieBusinessPanels.jsx`；`projects/cookie-editor/src/main.js` | 需求标题/免责声明和确认恢复；涉及服务主体处另核对 |
| `projects/prompt-shortcuts/trusted/page.js:707` | 工具栏提示及真实可见 OD 字标（约 755 行），不能漏掉独立 OD |
| `projects/reading-toc/src/index.html:27`；`projects/reading-toc/locales.json`；`projects/reading-toc/languages/ja.opendesk-locale.json` | 合作字标、中英日文案及翻译 source 同步 |
| `projects/reading-toc/trusted/locales.generated.js` | 由原 owner 同源生成，不能手改生成文件伪造源一致性 |
| `projects/scrapyjs/src/App.jsx:69`；`projects/stay-focus/trusted/blocked.js`；`projects/subagent/src/mini-chat/model.js:21`；`projects/time-review/src/main.js` | 扩展入口、恢复与审批提示；scrapyJs 自有品牌不改 |
| `projects/webflow/src/ui/main.js`；`projects/webflow/trusted/chatgpt-files.html`；`projects/webflow/trusted/chatgpt-images-ui.js` | 作者提示词、任务入口及可信页标题 |
| `projects/webflow/src/chatgpt-conversation-result.js:50`；`projects/webflow/trusted/chatgpt-files-controller.js:497` | 已安装Task结果说明、文件操作复制提示词 |
| `projects/webflow/trusted/chatgpt-images.js:145/224`；`projects/webflow/trusted/chatgpt-bridge-page.js:190/401` | 可信页、图片保存回执、自动化候选及侧栏恢复提示；保留授权语义 |
| `projects/webflow/trusted/AutoSettings.tsx:175/210/224` | Web Flow接入与结果提示，扩展/本机产品混合处逐句确认 |
| `projects/webflow/trusted/legacy-chatgpt-panel.js` | 字标/默认搜索词/说明；先确认当前发行消费者，失活历史入口可保留，不因文件存在擅自恢复 |
| `examples/sidebar-tools/ui-notify-demo/src/index.html` | 通知实验室 aria-label |

源码修改后，按原编译/候选/验证/晋升合同同步，**不要手改内嵌 JS**：

- `projects/adblock/adblock.opendesk-tool.json`
- `projects/ai-proxy/ai-proxy.opendesk-tool.json`
- `projects/bookmark-manager/bookmark-manager.opendesk-tool.json`
- `projects/cookie-editor/cookie-editor.opendesk-tool.json`
- `projects/reading-toc/reading-toc.opendesk-tool.json`
- `projects/webflow/webflow.opendesk-tool.json`
- `examples/sidebar-tools/browser-sdk-context-menu-demo/selection-notes.opendesk-tool.json`
- `examples/sidebar-tools/browser-sdk-operations-demo/browser-operations.opendesk-tool.json`
- `examples/sidebar-tools/ui-notify-demo/ui-notify-demo.opendesk-tool.json`

扫描共命中 29 个正式/示例包；其余不少只含 SDK 名或 CSS 注释，不能全部重打。上述两个 browser-sdk demo 未发现 `tool.config.json`，实施前确认其原始生成入口，不补造第二套打包配置。其他固定可信工具文案由 Browser 构建交付，更新 JSON 不能代替固定代码生效。

### 内部技术标识：默认保留

| 文件/标识 | 保留理由 |
|---|---|
| `package.json` 的 name、`package-lock.json`、仓库/目录名 | 内部工程身份，无改名授权 |
| `src/entrypoints/sidebar-shared-ui.js`、`wxt.config.mjs` 中 OpenDeskTool/OpenDeskSidebarUI/OpenDeskPageReact、构建全局名 | 公共 API/编译桥，不是可见品牌 |
| `src/scripting/user-scripts/page-bundle.js`、`page-frame-resources.js`；`src/scripting/sandbox/sandbox.js` | 资源前缀、Worker 名、身份校验 |
| `src/platform/chrome/native-http-transport.js:26`；`projects/scrapyjs/src/App.jsx:422` | `OpenDesk-NativeHTTP/1.0` User-Agent 是协议值 |
| `projects/ai-vip-share/src/site-session.js:87` | `X-OpenDesk-Local-Test` 技术请求头 |
| Native host ID、allowed_origins、存储键、schema、消息 format、安装 ID/来源/hash | 不能因产品品牌改变授权/数据/配对身份 |
| `src/i18n/locales/zh-CN.js:189`、`:192`；`src/ui/react/tabs/develop-local.tsx:82`；`src/native-agent/settings.html:23/114/115` | 指独立 OpenDesk 原生程序；应表达 GreyDove 连接 OpenDesk，而非错误改名该产品 |
| `src/libs/vendor/my-utils/1.0.0/LICENSE.txt`、其他第三方版权声明 | 版权归属不属于品牌改造 |

条件契约：`src/native-agent/workspace-chat-request.js` 的“OpenDesk 文件请求结果”与 `projects/webflow/trusted/chatgpt-conversation-route.js:8` 正则配对；展示改名须同步生产者/消费者，不能孤立替换。`projects/ai-vip-share/src/main.js:1224` 的额度名称、`projects/cookie-editor/app/components/CookieHttpConnections.jsx:417` 的服务协议指向主体待确认。`src/ui/workflow/local-codex.js`、`src/ui/conversation/provider-consumer.js` 的本机 OpenDesk 提示同理保留；AI 系统提示中的工程术语不默认换名。

### 历史文档、测试与构建：区别处理

历史 `docs/contracts/source-snapshots/`、`docs/framework/evidence/`、`evidence/`、冻结的 `artifacts/`、原型 `prototypes/` 保留事实，不重写旧截图/receipt。当前公开文档先改 README/发布与必要用户指南，历史技术文档可增加品牌关系说明，不批量回写。

| 文件 | T3 处理 |
|---|---|
| `scripts/browser-editions-r245.mjs`；`wxt.config.mjs` | 根品牌派生、长度与 Action；只调整需要的合同，不复制品牌来源 |
| `scripts/prepare-public.mjs`；`scripts/build-contract.mjs`；`scripts/verify-package.mjs` | 正式 icons 资源链、Manifest/Action 字段及资源闭包/哈希 |
| `scripts/dev-chrome.mjs:47`；`tests/environment/native-agent-chrome-real.test.mjs:309` | 旧名称定位扩展，改名会影响驱动；避免误连其他扩展 |
| `tests/environment/sidebar-product-contract.test.mjs:133`；`market-page-copy.test.mjs:44`；`market-site-client-r5.test.mjs:209`；`extension-center-preinstall.test.mjs:67`；`adblock-r12.test.mjs:573`（均位于 `tests/environment/`） | 定向更新真实可见文案断言，保留行为与安全语义 |
| `tests/environment/browser-sdk-context-menu-r11.test.mjs:443` | OD 输入清理/菜单前缀语义，不能为清字符串而破坏测试 |
| `tests/environment/workflow-direct-execution.test.mjs:528` | 网页测试输入包含旧名，通常保留，不属于产品品牌 |
| `.github/workflows/browser-compiler-editions-r245.yml`；`.github/workflows/r3-source-package.yml` | 图标/Manifest 改动应触发相关校验；保留包比对，不以改 workflow 名替代验证 |
| `scripts/pack.mjs` 中 ZIP 名 | `opendesk-browser` 是内部产物命名，默认可保留；不影响商店展示，不必为品牌改名 |

## 5. Chrome Web Store 账号和人工准备事项

### 状态必须分别核对

本轮仅访问官方公开文档，未访问私人 Developer Dashboard、Payments 或账号安全页面。浏览器已有 Google 登录也不能证明 CWS 开发者资格。

| 对象 | 当前项目状态 | 人工核对与完成证据（仅记录非敏感结果） |
|---|---|---|
| 普通 Google 账号 | UNKNOWN | 选定长期控制的账号及恢复责任人；账号存在不代表开发者已注册 |
| CWS 开发者注册 | UNKNOWN | [Developer Dashboard](https://chrome.google.com/webstore/devconsole)；如显示注册协议，按真实主体接受；已能进入后台也需检查限制 |
| 一次性开发者注册费 | UNKNOWN | 注册流程/后台核对是否已支付；支付金额/可用方式以当时页面为准，不重复支付、不向代理提供卡信息 |
| 发布者资料与联系邮箱 | UNKNOWN | Dashboard → Account，核对 Publisher name、邮箱验证和通知邮箱；登录邮箱与公开联系邮箱并非必然相同 |
| Google 两步验证 | UNKNOWN | [账号安全](https://myaccount.google.com/security)中核对 2-Step Verification；CWS 发布和更新前必需 |
| 提交扩展资格 | UNKNOWN | Dashboard 账号/商品页确认无停权、待验证、地区/条款阻塞；本轮不创建商品、不上传 ZIP、不触发提交 |
| Trader / Non-Trader | 待用户自行确定并声明 | 所有开发者需声明；个人也可能是 Trader，免费也不自动等于 Non-Trader，不能代用户做法律身份选择 |
| Google Payments 资料 | UNKNOWN | [Google Payments](https://payments.google.com/)；注册费付款、Trader 验证用资料与未来收款是不同事实，不代表 GreyDove 已有支付系统 |

官方 Trader FAQ 说明：Trader 验证需要真实法定名称、联系电话和地址，并公开于商品页；手机号需 SMS 验证，相关验证可能要求 Payments profile，但验证本身不收费。常规 Account 文档还要求提供购买商品/额外功能/订阅的扩展填写实体地址；不能把这条误读成“免费 Trader 无需公开地址”。地区、身份及实际后台要求需一起判断。无需向本任务提供身份证、地址正文、密码、银行卡或付款凭证。

### 发布主体与公开资料决策

| 项目 | 现状 | 完成标准 |
|---|---|---|
| 个人/公司发布主体、责任人 | 待用户确认 | 法定主体、账号控制与授权责任明确；GitHub 组织名不证明公司注册或发布资格 |
| 公开开发者名称 | 待用户确认 | 与真实主体和最终品牌规范一致；不可擅填 shopable-ai 为法定公司 |
| 支持邮箱 | 未提供 GreyDove 正式地址 | 可收信、有人维护；完成后台验证 |
| 官方网站/域名 | 未确定归属与上线 URL | 真实可访问、受发布者控制；GitHub README 不自动等于官网 |
| 隐私政策 URL | 未确定 | 公开、持续可访问，涵盖第 7 节实际行为及全部接收方 |
| 分发国家/地区、语言、可见范围 | 待用户确认 | Dashboard Distribution 与支持能力/当地要求相符 |
| Trader 声明、公开地址/电话 | 待用户确认 | 按实际经营性质声明并完成后台验证，明确哪些资料将公开 |
| 官网/支持/隐私资料维护人 | 待用户确认 | 有长期维护和事故响应渠道 |

人工顺序：确认主体/控制人 → 同账号进入 Dashboard 查注册/付款 → Account 验证联系邮箱与名称 → 账号安全确认 2SV → 正确声明 Trader 并完成所需验证 → 核对地区及公开资料。将“已完成/未完成/需处理/未知”回填任务状态即可，敏感资料留在 Google/安全系统。

## 6. 首发功能白名单

本节白名单指**允许进入商品草案的有限能力**，不是当前已批准上架文案。所有条目仍须 T6 对最终 Standard ZIP 实测；本轮没有新增 COMPONENT/BUILD/CHROME PASS。

### 10 项完整功能矩阵

证据编号 E1–E7 的准确路径及绑定范围在下一表。**全部项目当前候选的组件执行、BUILD、真实 Chrome 状态均为 NOT_TESTED**；“未找到”仅指本轮检索范围，不能推断仓库绝无其他记录。

| 功能 | 当前 SOURCE 与真实 UI 接线 | Standard / Developer 差异 | 已找到的组件、production、Chrome 证据及范围 |
|---|---|---|---|
| **1. JavaScript 开发运行** | `src/ui/tool-shell.js:149` 创建开发视图、共享 RunHost 和编辑器；`src/ui/react/tabs/develop-editor.tsx:30` 提供直接编辑、本地项目入口 | 两版均有 JS 编辑运行；“开发”Tab 不是 Developer 专属 | E1：旧 Standard 产物身份；E2：历史五 Tab 布局。未建立当前 JS 编辑→运行→结果→停止的同候选 Chrome 证据 |
| **2. 自动化／工作流／任务计划** | `src/ui/tool-shell.js:390` 接工作流控制器；`src/ui/tool-shell.js:409` 接计划工作台，422行接计划 Host | 两版均接线；无证据表明是 Developer 专属 | E2：参数 Sheet 与布局，明确未执行任务；E5：WebFlow 历史组件、包证据，真实业务未通过。不能推导当前自动化或计划执行 PASS |
| **3. Page USER_SCRIPT／网页增强** | `src/ui/script-editor.js:361` 使用 USER_SCRIPT 规则；`src/ui/page-program-library.js:23` 提供安装、运行、停用、升级权限状态 | 两版均有；依赖用户脚本许可、站点访问与安装授权 | E4：旧 USER_SCRIPT 原型反例探测，绑定原型哈希与 Chrome 版本；不是当前产品。E7 有历史本地项目 Page 描述，不能覆盖当前候选 |
| **4. Controller／RunHost** | `src/run-host.js:21` 是实际 Host；`src/run-host.js:292` 标记实际实现；`src/ui/tool-shell.js:152` 为产品接线 | 两版均有；文件开头模板适配器的 `productionRunHostImplemented:false` 不代表实际 Host 未实现 | E3：历史 Host/SDK fixture 测试；E7：历史本地项目 Controller 闭环报告。均不能记当前 Controller Chrome PASS |
| **5. Sidebar 工具／扩展中心** | `src/ui/react/app-shell.tsx:137` 接统一扩展中心和 ToolHost；`src/ui/react/tabs/tools.tsx:523` 提供导入入口 | 两版均有；动态沙箱工具不因可信 React 工作台而获得提权 | E2：旧开发版扩展 Tab 布局；E5：WebFlow 组件／包；E6：Stay Focus 独立旧 production 真 Chrome。不能扩展为全部工具 PASS |
| **6. 应用市场／目录安装** | `src/ui/tool-shell.js:615` 接安装审阅；`src/marketplace/panel.js:21` 实现真实 Side Panel 身份与交接 | 非 Developer 专属；生产市场配置不完整：`src/marketplace/channel-config.json:4` 四项 production 字段均为 `null` | 找到源码及安装交接，未建立当前线上市场、获取、安装全链的组件／production／Chrome 绑定证据 |
| **7. 云控** | `src/ui/react/tabs/cloud.tsx:49` 显示连接、任务授权、执行端；`src/ui/tool-shell.js:594` 接实际 CloudHosting | 两版均接线；部署、配对与服务可用性另有条件 | E2 仅含旧云控 Tab 布局，不证明远程派发或执行。未建立当前生产端到端证据 |
| **8. AI** | `src/ui/tool-shell.js:390` 接 AI 工作流；`src/ui/react/main.tsx:125` 接 AI Proxy、提示词、书签对话；`src/ui/react/components/provider-settings.tsx:223` 提供本地 Codex／HTTPS 来源 | 两版均接线；依赖用户来源配置或 Native，不等于内置免费模型 | 找到共享组件与消费者接线，未建立当前候选真实模型请求→业务回执的 production／Chrome 证据。组件存在不记组件 PASS |
| **9. Native／本地项目** | `src/ui/tool-shell.js:182` 接连接状态与权限；`src/ui/tool-shell.js:443` 接本地项目；`src/native-agent/service-worker.js:201` 调用 `connectNative` | 两版均有；需要独立安装、配对、权限。**浏览器内 JSX/SFC 编译仅 Developer**：`scripts/browser-editions-r245.mjs:39`；Standard 隐藏编译选择：`src/ui/script-editor.js:55`。本地 Node/Native 编译不受该开关禁用 | E7：历史真实 Native／本地项目报告；未建立其与当前 HEAD、当前 Native 配对和最终 Standard ZIP 的绑定 |
| **10. 其他可见能力** | `src/ui/sidebar-tools/installation.js:9` 至20行关联阅读目录、时间回顾、提示词、Cookie Editor、Stay Focus；`src/ui/react/main.tsx:139` 接书签对话 | 未见上述接线受 Developer edition 限制；可用性取决于工具安装、权限与对应可信代码 | E6 只证明旧 Stay Focus 范围；其他能力未建立当前候选证据。Video SVIP、Video Downloader、AI VIP Share 沿用补充审计：**首发合规待查、暂不宣传** |

五个产品 Tab 的组件组合见 `src/ui/react/app-shell.tsx:1`。导航仅条件隐藏调试、应用调试：`src/ui/react/tabs/navigation.tsx:26`。

### 已有证据路径与绑定范围

| 编号 | 路径与绑定 | 可以证明／不能证明 |
|---|---|---|
| **E1 旧 production** | `dist/production/framework/browser-edition.json:1` 声明 Standard、`browserComponentCompiler:false` | 证明旧目录的 edition 记录；没有与当前 HEAD、脏工作区、最终 ZIP 的同源绑定。**当前 BUILD NOT_TESTED** |
| **E2 五 Tab／参数 Sheet 真 Chrome** | `artifacts/five-tab-task-params-20261110/candidate-binding.json:2`：CFT `155.0.8059.39`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，`dist/development`，持续开发指纹 `3746be42b79449a231ae0c4f66d14215c4573bc03ff0699d032329071459ba36`；`artifacts/five-tab-task-params-20261110/native-final-checks.json:12` 记录焦点、草稿、校验 | 是旧开发环境的真实布局交互证据；`taskExecuted:false`，不证明任务执行，也不是 production。该64位指纹不冒充 Git commit |
| **E3 SDK 组件与 production 历史记录** | `docs/framework/workstreams/browser-sdk-acceptance.json:6`：commit `0c4d4a885efb09b467148009e0ebe4981a1ae2da`、2026-10-15；24行起 Node，119行附近 production 构建证据；207行起原生 Chrome 未测 | 历史 Node/Host fixture 与产物检查；34行明确非 native Chrome。不能继承为当前 SDK 或产品 PASS |
| **E4 USER_SCRIPT 原型真 Chrome** | `docs/framework/reviews/m5-f1/architect/independent-evidence/2026-10-02T20-08-55-875Z/report.json:2`：仅 targeted counterexample、非完整 F1；3行原型 SHA256 `2edcc1b0ca37f22a21105255cf90a02f1fa1b4a6e72081fa23d816708ee3a036`；44行 Chrome `138.0.7204.183` | 原型特定反例探测，不是当前产品最低版本验收 |
| **E5 WebFlow 组件／包** | `artifacts/webflow-overview-r4-final-verify-20261112/final-report.md:13`：历史 SOURCE/NODE/PACKAGE 与 Chrome 分层；34行绑定 main `b09daf51ec5f37feafd22b371c8a03350ea4d97b`；工具 `0.3.33`、SHA256 `40a890f659e304eb0463f88617c0c1ce3a89a15f129632e0a154bef78eed2f28`；65行组件图使用 mock SDK | 有历史组件和同源包记录；79行明确无真实安装截图，CHROME/BUSINESS 未通过。不能记 Browser production PASS |
| **E6 Stay Focus 旧 production 真 Chrome** | `artifacts/stay-focus-r5103-native-final/native-report.json:2`：`896e5fcdba1e749d0538b42f811abfeee397206e+stay-focus-r5103-local-display-fix`；3行独立 production 加载路径；29–31行 SW、包哈希及 Chrome `149.0.7827.55` | 历史特定工具与带本地补丁候选的真实记录；不能覆盖当前 Standard、其他工具或最低 Chrome 138 |
| **E7 本地项目／Native 历史报告** | `docs/framework/local-development-r22-report.zh-CN.md:3` 指向后续记录；7行描述历史多文件项目真实闭环；164行附近至182行列证据边界，214行列组件／驱动入口 | 可作为历史发现入口；本轮未建立一个可归属于当前最终候选的 commit＋包＋Native＋Chrome 组合。保留其原 NOT_TESTED，不晋升 |

GreyDove 的账本目前尚未记录首次提交、审核通过或发布：`docs/release/greydove/RELEASE-RECORD.md:7`。这只是仓库记录状态，不是对商店后台状态的断言。


### 白名单与延期范围

| 宣传级别 | 能力与验收要求 |
|---|---|
| 可写入草案、最终候选通过后方可提交 | ①侧栏 JavaScript 编辑、运行、结果与停止；②在批准网站运行 Controller 自动化；③网页增强安装、批准规则自动运行、停用/卸载；④Sidebar 工具导入/管理/打开；⑤已安装任务及运行参数管理。每项都须以最终 Standard ZIP 正常用户链复现，不能只提供 mock 或源码截图。 |
| 有实现，附条件候选，暂不作首发承诺 | 计划执行须验证浏览器存活、触发与撤权；Native/本地项目须说明独立原生程序、配对及本机依赖；AI 须说明用户配置的 Provider、费用、数据接收方和真实业务回执。 |
| 不入首发白名单 | 云控虽有实现但缺当前端到端服务/执行证据；在线市场配置未就绪。AI VIP Share、Video SVIP、Video Downloader 暂不宣传，先完成第7节的随包合规判定。 |
| 仅有规划或本轮未找到交付实现 | GreyDove 会员/订阅/广告/市场结算属于 T7 规划；完整云同步、语音控制没有可据本轮确认的交付链。不能因“云控”代码存在而将其宣传成云同步；没有查到不等于数学证明仓库绝无代码。 |

不能宣传：无条件任意网站自动化、无限权限/绕过权限、所有 JavaScript/npm 包均可运行、Standard 内直接编译所有 JSX/Vue SFC、完整云同步或已上线官方云服务、免费/自带 AI、无需本机依赖的 Native 功能、市场购买/开发者结算/会员订阅、跨浏览器全面支持、语音控制、完全离线/零数据处理、已获 Google 审核或正式上架。

首发建议短句（候选，尚非提交文案）：**“在侧栏创建和管理 JavaScript 脚本与浏览器任务，按已授予的网站范围运行，并查看结果或停止任务。”** Page 用户代码需要 Chrome 138+ 的“允许用户脚本”开关；该浏览器要求不能被产品自己的安装即用规则绕过。AI、云控、Native、可选工具只在相应依赖、授权和证据齐备后补充准确说明。

## 7. 权限与隐私风险

### Manifest 范围和主要调用证据

根 Manifest 声明 16 个 required、9 个 optional，另有 `<all_urls>`；详见本轮真实 `manifest.json`。Chrome required 授权与产品安装/工具能力授权是两层，产品内审阅不自动缩小 Chrome 权限。

### 16 项 required 权限消费者

权限目录见 `src/platform/chrome/permission-gate.js:7`，与根 Manifest 相同。

| 权限 | 主要实际消费者 / 边界 |
|---|---|
| storage | 工具安装、授权、会话、遥测状态等；例如 `src/ui/tool-shell.js:173`、`src/analytics/collector.js:29`。 |
| scripting | 健康探针实际注入 `src/environment.js:153`；指纹读取在 MAIN world 执行 `src/platform/chrome/browser-fingerprint.js:177`。 |
| sidePanel | 设置 action 点击打开面板 `src/environment.js:71`；实际 open `src/ui/tool-shell.js:733`。 |
| activeTab | 健康目标绑定使用 activeTab 授权模式 `src/environment.js:147`；截图合同也声明依赖 `src/framework/sdk/browser-contract.js:116`。**具体 API 不存在 `chrome.activeTab` 调用，独立必要性仍需结合全站权限核查。** |
| downloads | 实际 download/search/cancel `src/platform/chrome/browser-downloads.js:62`。 |
| tabs | 创建目标标签 `src/environment.js:192`，读取/移除监听 `src/sw.js:178`。 |
| webNavigation | 读取 frame、监听提交及历史导航 `src/sw.js:178`、`src/sw.js:264`。 |
| debugger | 指纹会话 attach/sendCommand/detach `src/platform/chrome/browser-fingerprint.js:215`。 |
| userScripts | 已安装程序 register/unregister `src/scripting/user-scripts/installed-programs.js:845`；预览 execute `src/scripting/user-scripts/preview.js:256`。 |
| cookies | 原生 Cookie getAll/set/remove `src/platform/chrome/cookies.js:15`，可信 Cookie Host `src/platform/chrome/browser-cookie-host.js:326`。 |
| notifications | create、点击/关闭事件与 clear `src/platform/chrome/notifications.js:13`。 |
| unlimitedStorage | 有权限状态读取 `src/ui/sidebar-tools/storage-usage.js:20`，持久数据实际使用 IDB；**未发现可单独证明“必须无配额”的业务调用或容量证据。** |
| alarms | Scheduler 创建/清理 `src/platform/tasks/schedule-service.js:145`；遥测每五分钟 alarm `src/analytics/collector.js:115`。 |
| offscreen | 云控 runner 创建/关闭隐藏文档 `src/cloud-control/runner-lifecycle.js:36`。 |
| proxy | 浏览器 regular scope 的 settings get/set/clear `src/platform/chrome/browser-managed-proxy.js:123`。 |
| declarativeNetRequestWithHostAccess | 站点策略 dynamic rules `src/platform/chrome/browser-managed-site-policy.js:36`，网络传输 session rules `src/platform/chrome/network-transport.js:57`。 |

### 9 项 optional 权限消费者

目录见 `src/platform/chrome/permission-gate.js:31`。

| 权限 | 主要实际消费者 / 未找到项 |
|---|---|
| bookmarks | 完整书签接口动态调用与事件监听 `src/platform/chrome/bookmarks-full.js:72`。 |
| history | history.search `src/platform/chrome/history.js:84`。 |
| contextMenus | 菜单 API 动态调用 `src/platform/chrome/context-menus.js:101`。 |
| clipboardRead | 找到权限映射 `src/platform/chrome/permission-gate.js:172`；**本次生产源码搜索未找到实际系统剪贴板读取消费者。** 文件 `readText` 不算剪贴板读取。 |
| clipboardWrite | 实际 navigator.clipboard.writeText `src/marketplace/page.js:55`、`src/ui/script-editor.js:568`。**有写入行为不自动证明每个入口必须申请此权限。** |
| tabGroups | 找到权限映射 `src/platform/chrome/permission-gate.js:174`；**未找到实际 tabGroups API 消费者。** |
| webRequest | 监听请求、完成、错误 `src/platform/chrome/browser-network-observe.js:73`。 |
| nativeMessaging | runtime.connectNative `src/native-agent/service-worker.js:201`。 |
| idle | queryState 与状态监听 `src/platform/chrome/browser-managed-site-policy.js:6`、`src/platform/chrome/managed-site-lifecycle.js:21`。 |

源码中，普通运行只检查已有权限，不应顺带弹授权；工具授权要求可信点击，并复核包身份、安装世代、Side Panel 文档及最终 Chrome 权限。`src/platform/chrome/permission-gate.js:64`、`src/platform/chrome/permission-gate.js:294`。这是实现证据，尚非运行验收。

高关注事实及风险：

1. **全站、全 frame 的固定注入**：`manifest.json` 的 ISOLATED `agents/page-relay.js`、MAIN `framework/sdk-main.js` 在 http/https document_start 注入；另有 chatgpt.com 固定桥。需要解释实际工作台主用途，审计 sender/document/origin/撤权控制，不能仅以 activeTab 存在就声称只访问当前页。
2. **debugger**：`src/platform/chrome/browser-fingerprint.js:107/215/234` 有 attach/sendCommand/detach；`context-menus.js:424` 接入受控 fingerprint driver。判断：这是实装高风险 CDP 能力，不能泛称仅用于普通脚本运行；须说明指纹/浏览器状态能力是否属于首发及其单一用途、手势和范围，不能只从 Manifest 名推断安全。
3. **cookies**：`src/platform/chrome/cookies.js:8–57` 调用 getAll/set/remove 并在前后授权；`browser-cookie-host.js` 存在安装身份、站点、分页/观察和写入链。Cookie 可能含会话凭据；导出、复制、批量导入、第三方会话准备需分别披露，不能称不接触敏感数据。
4. **proxy**：`src/platform/chrome/browser-managed-proxy.js:127/151/245` 调用 Chrome proxy settings get/clear/set，影响 regular profile 网络流量；有 owner/同意/恢复合同，仍须调查代理方、凭证、流量与异常恢复。不能用用户点击作为第三方服务合法性证明。
5. **userScripts/动态用户代码**：`src/scripting/user-scripts/page-evaluator.js` 构造专用执行代码；installed-programs/page-install-authorization/packaged-dependencies 分离安装来源与站点权限。必须逐链区分 User Scripts API、固定 scripting 注入、Controller sandbox、Sidebar opaque iframe 及远程依赖，不能用一项豁免替整套产品背书。官方 MV3 允许特定 User Scripts/Debugger 用途及与扩展 API 隔离的沙箱例外，仍要求可审查全部功能、指定 API 正当用途及数据合规。
6. **Native**：`src/native-agent/service-worker.js`、`workflow-ai-service.js`、文件工作区涉及本机桥/文件/模型；optional nativeMessaging、原生独立批准及配对不能省略。浏览器仓库无法单独证明原生程序/模型服务的全部留存、日志和传输政策。

### 数据流与第三方

| 数据/路径 | 已见行为与限制 | T5 必补内容 |
|---|---|---|
| URL、DOM、标题、网页内容 | Controller/Page/当前页工具读取；`src/platform/host/controller-methods.js`、`src/platform/target/` 及任务结果链 | 按功能列字段/触发/站点；核实错误、日志、导出及清除路径 |
| 脚本、任务、结果、草稿 | 本地 storage/IndexedDB 与 Native 授权项目读写；`src/platform/storage/`、RunHost、任务结果与工具存储 | 保留期限、容量、导入导出、卸载/删除的差异；本轮未读取私人内容 |
| AI 输入/观察/会话 | `src/ui/workflow/ai-plan.js:75/111` 向配置 endpoint POST，Bearer 凭证、credentials=omit；`provider-runtime.js:18` 有本机 Codex/HTTPS 来源 | 接收方由用户配置，不等于固定只发 OpenAI；网页观察与上下文的最小化、同意、删除、Provider 留存需查；没有验证真实推理可用 |
| 云控配对/任务/结果 | `src/cloud-control/service.js:120/276/899` 向配置 HTTPS Provider 发送配对及任务/receipt；结果受 resultAllowed 控制；connection.js WSS/HTTPS Pull | 服务端身份、地区、保存期限、撤权/结果可见性；本轮不推断已有公有云运营服务 |
| 可选使用统计 | `src/analytics/config.js` 默认 `ANALYTICS_INGEST_URL=''`，当前默认未配置；collector 默认 consent=false，有版本化披露、撤销/中断与有界队列 | 实现可配置后向 Cloudflare Worker/D1、PostHog 传假名安装ID、工具使用/执行类别；不是匿名且不应宣称从不上传。核对最终端点、部署、日志/IP、后台访问及删除留存 |
| 统计字段与窗口 | `src/analytics/contract.js` 限定字段，披露版本 v8、单批≤10、≤16KB、事件最长7天；`settings.html:125` 有用户说明 | 7天是客户端事件上限，不是 D1/PostHog 服务端删除保证；须检查 `services/analytics/worker.mjs`/schema 与真实部署 |
| 工具网络、会话、媒体 | 依公开 network/能力审阅访问工具配置服务；AI VIP Share 有 Cookie 会话准备及受管代理；视频下载有直接/HLS媒体请求 | 服务接收方、账号和内容权利、目标站点条款；本轮不能证明服务运营授权 |
| 市场/发现 | `src/marketplace/channel-config.json` production origin/extensionId/acquireUrl/verifiedAt=null | 公共网络市场未就绪不阻塞本地目录功能，但不能宣传已上线交易市场；检查未来站点日志/下载来源 |

已见控制是源码事实，不是本轮安全验收结论。最终还需对真实请求、服务端、脱敏失败、权限拒绝/撤回、未知副作用不重放等做定向验证。本轮不删除权限，也不把空端点当成永久无隐私风险。

补充已定位的数据边界：

- `src/platform/storage/idb.js:4` 包含运行、命令日志、pageSnapshots、records、结果、脚本版本及frameworkKV；不只是设置。`src/cloud-control/service.js:271` 将Provider URL/credential/配对身份写入KV，写入点未见应用层加密，不能声称该凭据已加密。
- `src/ui/workflow/data-sharing.js:3` 对参数默认值、既有fill.text、navigate query/hash作有限处理，但用户新request、selector、pathname和获准观察仍可能含敏感信息；`src/ui/workflow/responses.js:128` 的 `store:false` 不证明接收方绝不留存。`src/cloud-control/service.js:886` 的full结果可含valueWire/error；Native AI另走 `src/native-agent/workflow-ai-service.js:28`。
- 统计真实设计链为可信SW→HTTPS ingest→Cloudflare Worker→D1→PostHog。`services/analytics/worker.mjs:42/73/78` 读取请求IP并盐哈希限流、用installId作distinct_id；不能称匿名或从不处理IP。示例EU域名不证明生产区域。
- `src/analytics/collector.js:103/388` 撤销会中断请求、清本地队列，但不能撤回服务端已收数据。`services/analytics/worker.mjs:173` 有未发送超7天、已发送超35天等定时清理代码；需验证真实部署及清理运行，且不等于PostHog/日志全链删除。D1 ACK也不等于PostHog已收到。实际端点、留存、删除入口与跨系统执行仍UNKNOWN。

### 随包业务和许可证

- `projects/ai-vip-share/src/main.js:198`、`server-cookie-batches.js:28`、`trusted/service.js:211` 确有会话分配、Cookie批次及代理链；生产服务配置为空/未验收不消除授权审查需求。源码 README 明确当前完整目标尚未证明。**暂不宣传会员、账号共享或自动获得 Plus/VIP。**
- `projects/video-svip/src/main.js:208/227` 主要为官方入口及门控的授权测试媒体，未据本轮源码发现足以证明付费绕过的实现。名称可能误导；不得宣传全网会员免费解锁。
- `projects/video-downloader/trusted/hls.js:27`、`stream.js:34/86` 识别/拒绝加密清单、请求不携 Cookie；非加密并不等于有保存权。任意网站/付费视频/未经授权下载宣传均不入白名单。
- 第三方许可已有固定文本及哈希校验：`docs/contracts/licenses/`、`src/libs/vendor/`、`scripts/prepare-public.mjs`、`scripts/verify-package.mjs`；当前包包含 MIT 系列、共享 UI notices、视频 mux Apache-2.0 等。**已有 NOTICE 不等于全部随包及运行下载代码许可已经闭环。** T5.6 应根据最终 bundle module graph、lock 和实际工具/依赖逐一对照许可证、copyright、再分发及商用条件；设计图、截图、字体也在范围内。旧 GPL 来源快照不自动证明当前产品采用 GPL 代码，也不能忽略可能的实际复用。

已定位许可索引：`src/libs/catalog.js:7/12/38` 列 lodash-es、dayjs、js-cookie、crypto-js、file-saver、query-string、axios、store、cheerio、FingerprintJS、my-utils、PapaParse、jQuery 的来源/许可；固定React/ReactDOM/Vue/Babel见 `src/libs/page-frameworks/contract.js:1/35`；共享UI的MIT/Apache-2.0见 `docs/contracts/licenses/shared-ui-third-party-notices.txt`；mux见 `projects/video-downloader/trusted/vendor/mux.LICENSE.txt`；Vue来源见 `docs/contracts/licenses/todo-user-vue-MIT.txt`。`scripts/build-official-pages.mjs:35` 对XMind许可未通过设有禁止正式晋升防线，不能因历史资源存在就宣称可发行。这不是最终候选SBOM或完整商用许可结论。

### 本轮核查的官方要求

以下页面于 2026-11-17 通过 ego-browser 读取英文正文；政策结论为摘要，最终以提交时版本及后台字段为准：

- [注册开发者](https://developer.chrome.com/docs/webstore/register)：先注册并支付一次性费用；普通 Google 账号不足以证明资格。
- [设置账号](https://developer.chrome.com/docs/webstore/set-up-account)：Publisher name、联系邮箱验证及条件性实体地址。
- [两步验证](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification)：发布和更新前必须开启。
- [Trader 声明](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)及 [Trader FAQ](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq)：所有开发者声明；Trader 真实联系资料、公开展示与 Payments 验证要求。FAQ 页脚日期明显陈旧，不能将其当成新增规则的生效时间，后台仍须人工确认。
- [准备扩展](https://developer.chrome.com/docs/webstore/prepare)及 [图片要求](https://developer.chrome.com/docs/webstore/images)：根目录 Manifest 的 ZIP、递增版本、128 PNG、真实截图；图标规范应在 T2 导出时复核。
- [权限最小化](https://developer.chrome.com/docs/webstore/program-policies/permissions)、[隐私政策](https://developer.chrome.com/docs/webstore/program-policies/privacy)、[Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)：最窄必要权限；处理任何用户数据需准确公开政策、披露接收方；浏览活动用途及转移受限，网站需有 Limited Use 合规声明。
- [MV3 额外要求](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)、[API Use](https://developer.chrome.com/docs/webstore/program-policies/api-use)、[User Scripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts)：远程逻辑默认受限，豁免只覆盖相应 API/隔离上下文；Chrome 138+ 用户需主动打开每扩展“允许用户脚本”。

## 8. 更新后的完整任务树

以下沿用唯一任务计划编号；状态只代表当前节点，不继承为产品/上架通过。明确未设状态的子项按父项剩余工作列 NOT_STARTED；T7 已有规划文档不代表商业化实现。

| 编号 / 原任务 | 当前状态 | 依赖 | 剩余工作 / 完成条件 |
|---|---|---|---|
| **T0 项目现状审计与上架条件确认** | IN_PROGRESS | 无 | 审计报告交付；T0.5/T0.6人工确认后才能关闭总节点 |
| T0.1 读取最新仓库与工作区 | VERIFIED | 无 | 快照已记录；Chrome已应用版本未知，T6补实装身份 |
| T0.2 核对构建、打包和发行架构 | COMPLETED | 无 | 架构/命令审计已交付；当前候选构建/ZIP留T6 |
| T0.3 全仓库品牌引用审计 | COMPLETED | 无 | 94文件审阅集已列；T3复查发行资源、图片可见品牌 |
| T0.4 品牌资产审计 | COMPLETED | 无 | 缺失已识别；原图、源图、尺寸导出及权利未定位 |
| T0.5 开发者账号状态核对 | BLOCKED | 无 | 账号持有人核对注册、付款、邮箱、2SV、发布资格 |
| T0.6 发布主体与支持渠道确认 | BLOCKED | 无 | 确认主体、公开名、支持/官网/隐私URL、地区和维护人 |
| T0.7 产品现状与首发范围确认 | COMPLETED | 无 | 10类实现与证据分层已列；最终Standard实测后定稿 |
| **T1 GreyDove 品牌规范统一** | IN_PROGRESS | T0产品现状初审 | 完善现有品牌规范并完成批准，不重建任务体系 |
| T1.1 品牌名称 | VERIFIED | 同T1；按原任务验收 | GreyDove/灰鸽已确定；保持精确拼写 |
| T1.2 产品定位和语言 | IN_PROGRESS | 同T1；按原任务验收 | 依据白名单定中英定位、短/长描述与术语 |
| T1.3 品牌层级与发行命名 | NOT_STARTED | 同T1；按原任务验收 | 批准Standard/Developer命名及内部身份保留规则 |
| T1.4 品牌可用性核查 | NOT_STARTED | 同T1；按原任务验收 | 检索商标、域名、社交/CWS近似名，记录地区/时间/结果 |
| T1.5 品牌批准 | NOT_STARTED | 同T1；按原任务验收 | 项目负责人确认完整规范和已披露风险 |
| **T2 图标与视觉资产适配** | NOT_STARTED | T1方向＋T0.4/最终原图 | 未实施；T2.1缺失原图阻塞后续设计/导出 |
| T2.1 取得最终参考图和源文件 | BLOCKED | 同T2；按原任务验收 | 定位用户选定原图、正式源图及使用权，不自行换图 |
| T2.2 设计扩展图标 | NOT_STARTED | T2.1＋T1方向 | 按原图适配16/32/48/128并验证16像素辨识 |
| T2.3 商店图标和截图视觉规范 | NOT_STARTED | T2.1＋T1方向 | 制定真实截图/商店图标规范，不伪造功能 |
| T2.4 资源格式和导出 | NOT_STARTED | T2.1＋T1方向 | 导出PNG，检验尺寸/透明/边缘/体积及源文件 |
| T2.5 资产验收 | NOT_STARTED | T2.2–T2.4 | 真实Chrome及商店尺寸核验并固定源/导出哈希 |
| **T3 仓库品牌统一与扩展元数据修改** | NOT_STARTED | T1批准＋T2＋T5必要结论 | 按第4节owner实施品牌，禁止全仓替换 |
| T3.1 Manifest | NOT_STARTED | 同T3；按原任务验收 | 修改Manifest可见品牌/描述/icons；不顺改权限/版本 |
| T3.2 WXT 与发行名称 | NOT_STARTED | 同T3；按原任务验收 | 保持根Manifest唯一来源，核对两版名称派生与action |
| T3.3 图标构建资源 | NOT_STARTED | 同T3；按原任务验收 | 正式图标接入原复制、资源集合、哈希和完整性校验 |
| T3.4 UI 品牌引用 | NOT_STARTED | 同T3；按原任务验收 | 多语言/标题/字标/通知/市场/工具按真实消费者修改 |
| T3.5 文档和商店元数据 | NOT_STARTED | 同T3；按原任务验收 | 更新当前对外README与中英商店资料，历史事实保留 |
| T3.6 测试和验证器 | NOT_STARTED | 同T3；按原任务验收 | 定向更新Manifest/资源/文案断言，不弱化安全校验 |
| T3.7 兼容性检查 | NOT_STARTED | 同T3；按原任务验收 | 验证ID、Native配对、数据、既有商品更新路径不变 |
| **T4 Chrome Web Store 商品资料准备** | NOT_STARTED | T1＋T0.7＋T2视觉 | 只有草案，尚无可提交的最终资料/截图 |
| T4.1 英文名称、短描述和完整描述 | NOT_STARTED | 同T4；按原任务验收 | 按有限白名单完善英文名称、短/长描述 |
| T4.2 中文名称、短描述和完整描述 | NOT_STARTED | 同T4；按原任务验收 | 按有限白名单完善中文名称、短/长描述 |
| T4.3 单一主要用途和功能范围 | NOT_STARTED | 同T4；按原任务验收 | 冻结单一主用途和随包功能边界 |
| T4.4 商店图标 | NOT_STARTED | 同T4；按原任务验收 | 提供128PNG正式商店图标，来源可追溯 |
| T4.5 至少一张真实产品截图，建议准备多张真实核心流程截图 | NOT_STARTED | 同T4；按原任务验收 | 最终Standard实际运行截图至少1张，记录候选 |
| T4.6 支持网站、支持邮箱和隐私政策网址 | NOT_STARTED | 同T4；按原任务验收 | 提供真实支持站点/邮箱/公开隐私URL并验证可达 |
| T4.7 分类、语言、分发国家/地区和公开方式 | NOT_STARTED | 同T4；按原任务验收 | 主体确定后填写分类、语言、地区与可见范围 |
| T4.8 检查描述、截图、隐私字段与实际候选包一致 | NOT_STARTED | 同T4；按原任务验收 | 用最终ZIP交叉检查文案/截图/隐私字段 |
| **T5 上架合规、权限与隐私审计** | IN_PROGRESS | T0.7；最终复核依赖T3 | 本轮有源码风险索引，最终逐项合规判定未完成 |
| T5.1 单一主要用途 | NOT_STARTED | 同T5；按原任务验收 | 证明工作台单一主要用途，解释各随包能力的必要性 |
| T5.2 权限逐项审计 | NOT_STARTED | 同T5；按原任务验收 | 16+9权限逐项证明必要性/触发/拒绝/撤权；缺消费者项继续查 |
| T5.3 用户数据盘点 | NOT_STARTED | 同T5；按原任务验收 | 完成所有本地/外发字段、接收方、保留/删除及部署核验 |
| T5.4 隐私政策和安装前披露 | NOT_STARTED | 同T5；按原任务验收 | 发布真实隐私政策、Limited Use声明及安装前披露 |
| T5.5 User Scripts / 用户代码执行边界 | NOT_STARTED | 同T5；按原任务验收 | 逐链核查用户代码来源/世界/动态执行/API政策/撤权 |
| T5.6 第三方依赖与许可证 | NOT_STARTED | 同T5；按原任务验收 | 按最终bundle/包做依赖、工具、图像及服务许可闭包 |
| T5.7 开发者身份与地区要求 | NOT_STARTED | 同T5；按原任务验收 | 核对主体、Trader声明/验证、公开资料与分发地区 |
| T5.8 最终合规复核 | NOT_STARTED | 同T5；按原任务验收 | 以最终ZIP/商品文案/后台隐私项作最终交叉复核 |
| **T6 生产构建、真实 Chrome 验收和正式发布** | NOT_STARTED | T3＋T4＋T5必要任务 | 未启动；需要同一候选SOURCE/BUILD/PACKAGE/CHROME证据 |
| T6.1 冻结候选 | NOT_STARTED | 同T6；按原任务验收 | 协调writer，冻结main/工作树/锁/版本/输入与候选身份 |
| T6.2 Standard 生产构建 | NOT_STARTED | 同T6；按原任务验收 | 在协调输出内执行原Standard生产构建并保存回执 |
| T6.3 包完整性验证 | NOT_STARTED | 同T6；按原任务验收 | 验证Manifest/icons/CSP/资源/哈希及ZIP逐文件一致 |
| T6.4 自动化回归 | NOT_STARTED | 同T6；按原任务验收 | 按受影响行为分类当前CI失败并做必要回归 |
| T6.5 真实 Chrome 验收 | NOT_STARTED | 同T6；按原任务验收 | 最终候选最低138/目标稳定Chrome安装更新、授权撤权、核心流程 |
| T6.6 商店后台填写 | NOT_STARTED | 同T6；按原任务验收 | 获当时授权后上传ZIP并填真实Listing/Privacy/Distribution |
| T6.7 提交审核 | NOT_STARTED | 同T6；按原任务验收 | 发布负责人明确授权后提交并保存回执 |
| T6.8 审核反馈 | NOT_STARTED | 同T6；按原任务验收 | 保存真实审核意见，定向修复并记录重提 |
| T6.9 正式发布 | NOT_STARTED | 同T6；按原任务验收 | Google通过后按负责人安排正式公开 |
| T6.10 发布后核验 | NOT_STARTED | 同T6；按原任务验收 | 从公开商店安装，核对实际版本/品牌及核心流程 |
| **T7 未来商业化规划（独立，不阻塞免费首发）** | NOT_STARTED | 定位/用户需求/地区主体；独立 | 已有路线文档；商业化具体评估/实现延期，不阻塞免费首发 |
| T7.1 免费版 / Pro 权益边界 | NOT_STARTED | 同T7；按原任务验收 | 基于用户需求明确免费/Pro权益，不先开发收费 |
| T7.2 AI 用量和云端服务成本核算 | NOT_STARTED | 同T7；按原任务验收 | 估算真实AI及云服务成本 |
| T7.3 第三方支付服务商和 Merchant of Record 评估 | NOT_STARTED | 同T7；按原任务验收 | 按地区/主体比较PSP与MoR，不混同CWS注册费 |
| T7.4 个人/公司收款资格、税务、退款和消费者保护 | NOT_STARTED | 同T7；按原任务验收 | 确认收款、税务、退款及消费者保护责任 |
| T7.5 账户、服务端权益、订阅续费和 webhook 设计 | NOT_STARTED | 同T7；按原任务验收 | 另行设计账户、权益、续费/webhook，当前不实施 |
| T7.6 应用市场开发者分成和版权治理 | NOT_STARTED | 同T7；按原任务验收 | 明确开发者分成、版权治理和市场责任 |
| T7.7 广告、赞助和联盟推广政策审查 | NOT_STARTED | 同T7；按原任务验收 | 逐项审查广告/赞助/联盟政策和披露 |
| T7.8 商业化数据保护与反滥用设计 | NOT_STARTED | 同T7；按原任务验收 | 明确商业化数据保护与反滥用要求 |
| **T8 长期维护与运营** | NOT_STARTED | T6发布完成 | 正式发布后进入维护，不作为当前审计实施 |
| T8.1 版本更新和兼容性矩阵 | NOT_STARTED | 同T8；按原任务验收 | 维护版本与Chrome兼容矩阵 |
| T8.2 用户支持、反馈和商店评论 | NOT_STARTED | 同T8；按原任务验收 | 建立支持/反馈/商店评论响应 |
| T8.3 安全漏洞和权限政策变化跟踪 | NOT_STARTED | 同T8；按原任务验收 | 持续跟踪漏洞与权限政策变更 |
| T8.4 隐私政策、第三方服务和许可证变更 | NOT_STARTED | 同T8；按原任务验收 | 同步隐私/服务/许可变化 |
| T8.5 发布回滚、事故响应和账号安全 | NOT_STARTED | 同T8；按原任务验收 | 落实回滚、事故响应及账号安全流程 |
| T8.6 商店商品页、截图和功能说明持续同步 | NOT_STARTED | 同T8；按原任务验收 | 商品页、截图、功能与真实版本持续一致 |

依赖仍为：T0 → T1 → T2/T4/T5，T1+T2+T5 必要结论 → T3，T3+T4+T5 → T6 → T8；T7 独立且不阻塞免费首发。T5 可先只读调查；T0.5/T0.6 人工资料与无依赖的文案评审可并行。

## 9. 下一阶段执行建议

**本轮到此停止，不自动启动以下任务。** 下一轮建议先处理资料/范围决策，再进入资产和代码：

| 顺序/任务 | 明确文件及工作 | 验收标准 |
|---|---|---|
| 1：T0.5/T0.6、T5.7 | 账号持有人按第5节核对；只在 `TASK-PLAN.zh-CN.md`、本报告或原发布账本记录非敏感结论 | 注册/付款/邮箱/2SV/发布资格、主体/支持/地区/Trader 每项有状态；不收集敏感凭证 |
| 2：T1.2–T1.5、T4.1–T4.3 | `BRAND-SPEC.md`、`STORE-LISTING.md`；用第6节收敛 Standard 首发主用途，做品牌可用性核查并批准 | 名称/发行/术语与有限白名单一致；商标/域名未知不得写无冲突 |
| 3：T2.1 | 定位最终原图、源图和使用权；后续资源位置在原构建合同内确定，本轮不预造路径 | 原图与用户选定版本一致，有可追溯来源；缺图则继续阻塞图标制作，不重设计代替 |
| 4：T5.1–T5.6 | `COMPLIANCE-AND-PRIVACY.zh-CN.md`、随后确定的公开隐私页面；对应第7节源码仅调查 | 每项权限、全部出站类别/接收方、随包工具、动态代码与许可证有明确判定；不擅自删权 |
| 5：T2.2–T2.5 后 T3.1–T3.7 | 第4节列明的真实 owner 文件；优先 Manifest/标题/可见字标，再按工具 owner 编译晋升；icons 联动原复制和校验 | 品牌资源在最终包闭环；身份、Native、API、用户数据不变；协调现有 wxt/editor writer |
| 6：T4.4–T4.8、T6.1–T6.5 | 最终 Standard 的真实截图/商品资料、原构建及 ZIP 机制，更新 `RELEASE-CHECKLIST.zh-CN.md` 的命令边界 | 输入冻结、构建/ZIP/Chrome 同候选；权限与核心功能实测，未测项保留 NOT_TESTED |

T6.6 以后上传、提交审核与发布仍需当时明确授权；上传成功不代表审核通过，审核通过也不代表已公开发布。T7 收费/广告/分成、全量旧业务补齐、本体重构、跨浏览器矩阵均延期。

### 本轮交付与核验边界

本任务唯一写入 owner：本对话；允许路径仅 `CURRENT-STATE-AUDIT.md`、`TASK-PLAN.zh-CN.md`、`README.zh-CN.md`（均在本目录）。没有新增 workstream 文件，按本轮显式路径限制将分工记录于此。子任务均只读；未占用产品 Profile、端口、dist、ZIP 或 watcher；官方资料 TaskSpace 135 已释放。

验证仅检查本轮 Markdown 内容、路径、编号、链接及 diff/工作区边界，原因是本轮交付只包含文档；不运行产品构建或测试。当前 GreyDove COMPONENT/BUILD/PACKAGE/CHROME/STORE_REVIEW/PUBLISHED 一律无新增通过证据。

文档核验结果：9个要求的报告章节齐备；T0–T8共9个父节点和64个子任务保持原编号；94个品牌审阅路径去重一致；所检查仓库路径均存在、Markdown相对链接可解析、无遗留占位符或尾随空白；`git diff --check` 对两份已跟踪文档通过，新报告另做同等空白检查。本轮写入仅限上述3条路径，未提交或推送。
