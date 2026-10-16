# AdBlock UI Parity R1.8（2026-10-16）

## 当前工作范围与互斥资源
- Branch: `main`，只在本轮专属文件与核对后的 AdBlock 固定 DOM、CSS、生成器/定向测试写入；不触及其他工具业务及原生 DNR service/rules。
- 读取起点 main `cff9eff4a37c4e5cdd763c5b04edb3d35d704d2a`；原件 blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`。
- 不使用用户 Mac `/Users/shopme/Documents/workspace/opendesk-browser` 的项目或 Chrome Profile：当前连接仅 GitHub，不能声称 Mac 本地原生验收。
- 初始问题：原文件路径缺失（历史 Blob 仍在）、可信控制只有两个普通设置行，沙箱例外常驻，来源驱动预览不代表生产 UI。
- 原始证据：R1.6 `5ca0876` CI 76/0 Node 但 production build failed；独立预览 `3fd457c` 74/0 Node、6 离线 Chrome 场景，均不可晋升当前候选的 NATIVE_PASS。
- 分工：`REQUIREMENTS.zh-CN.md` 负责设计与数据映射；`adblock-ui-parity-r18-20261016.md` 仅记本工作流候选/证据；不改既有 R1.4 记录。
- 应由实际产物的同一候选核实：完整构建/版本/安装包 SHA-256、Chrome ID、真实权限/DNR/HTTP/生命周期、320–480px 同视口截图；缺失保持 NOT_TESTED。

## 分阶段验收
- Original file exact blob and SHA-256: SOURCE_VERIFIED (GitHub SHA-1 可证，Node SHA-256 测试待 CI).
- Current formal UI: gaps identified; UI rewrite pending in this snapshot.
- Functional Native Chrome: NOT_TESTED for R1.8.
- Product acceptance 95+: NOT_SCORED; never report PRODUCT_ACCEPTED without screenshots/native requests.

## R1.9.1 · 实际源码恢复记录（2026-10-16）

- **已提交的源码恢复（不是产品验收）**：`21065ca1f6f97a5080b3674ccc12d378de6d7aa9`，提交到 GitHub `main` 的 16 个文件；R1.9 所列 15 个 Git Blob 均成功读回。共享 `src/ui/sidebar-tools.js`、`src/ui/tool-shell.css` 使用最新对应源码定点合并，保留 Extension Center 的卸载恢复增量和其他工具样式。首次 Git ref 因并行提交冲突未更新，已在更新后的父提交上安全重建并正常 fast-forward 推送；无强推/重置。
- **可信界面**：Fixed Host 维护 overview / exceptions / settings；两枚原生受信任开关、实时 hostname、真实例外数、空态、可信恢复确认链、独立产品设置和通用工具管理入口。移除 AdBlock 宿主重复标题/同时出现的两枚设置齿轮；例外从设置返回时恢复原入口焦点；保持 opaque sandbox 挂载，概览不展示例外列表或伪造统计。
- **安全边界**：不修改 AdBlock DNR service、Chrome rule policy、权限声明、Stay Focus 规则域、重启围栏或卸载清理。受信任固定源码 Blob 为 `38a0990f06d4cedded1063d42eff22934c1c26e4`，同步更新 `scripts/bundle-provenance.mjs` 精确来源锁。
- **原始 HTML**：在上述提交上读回不可变原型 Git Blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a`；独立 SHA-256 计算为 `c0a030441720ee74e599e47d9e61d7725b5f947aa62da9324e5ac5b56356c8b7`，与 R1.8 匹配，原始 `preview/adblock-r1-interactive-preview.html` 未改。
- **隔离逻辑自检（不能充当 Node PASS）**：由提交版可信工厂在 V8 兼容 DOM shim 中执行 R1.9 的 13 项测试，13 项均完成；使用同一工厂与当前 `tool.html`、`tool-shell.css` 构成 7 状态×3 视图、21 份惰性快照，无演示统计。此检查没有执行官方 Node 运行器、npm 构建、截图或真实 Chrome。
- **同提交 CI**：[AdBlock R1.2 workflow](https://github.com/shopable-ai/opendesk-browser/actions/runs/38779603559)、[Sidebar Preview Contract](https://github.com/shopable-ai/opendesk-browser/actions/runs/38779603168)。本次记录时 `queued`；结果必须以后续同 SHA 原始 job/log 为准，不能预报成功。
- **版本与安装包门禁**：`tool.config.json` 由 `1.0.0` 增至 `1.1.0`；正式 `examples/sidebar-tools/adblock/adblock.opendesk-tool.json` 在恢复阶段尚不存在。未手造、未晋升历史 JSON Blob。只有 Node、标准打包器、完整安全来源和 CI 门禁成功后才能晋升，并更新本记录中的安装包 SHA-256。
- **证据状态（此提交）**：`SOURCE_VERIFIED`（源码/原型 Git 身份）；`NODE_PASS=NOT_TESTED`、`BUILD_PASS=NOT_TESTED`、`CI_PASS=PENDING`、`PREVIEW_BROWSER_PASS=NOT_TESTED`、`NATIVE_CHROME_PASS=NOT_TESTED`、`PRODUCT_ACCEPTED=NOT_SCORED`。目前 GitHub 网页连接不等同于访问 Mac 正在运行的 Chrome/Profile；不能报告实际 HTTP DNR 拦截、360px 同视口截图或 95+。

## R1.9.3 · Node / 来源预览 / 原生验收追踪（2026-10-16）

- 开始核对 main `9d585c775fe4700c0f323a0f2c5111d4b425fadc`，发现 7 个 Node 失败：4 个焦点空引用、1 个权限事件重复状态读回、1 个可信开关状态丢失、1 个 checked-in HTML 源漂移。以原始 GitHub Actions 日志为证：[Node 38886947244](https://github.com/shopable-ai/opendesk-browser/actions/runs/38886947244)、[Preview 38889562238](https://github.com/shopable-ai/opendesk-browser/actions/runs/38889562238)。
- 信任宿主定点修复：[5c1b9628](https://github.com/shopable-ai/opendesk-browser/commit/5c1b9628e25154a1b3866f078bfef7e5cf457629)。修复 `null===null` 焦点恢复异常，保留键盘焦点到最终权威读回，禁止跨 tool generation 焦点和 busy 回写；[fd996974](https://github.com/shopable-ai/opendesk-browser/commit/fd9969748d89ba533da38d6bbabb650cb27517b3) 增加原生 blur/异步读回/焦点切换/代际隔离测试。经 [CI 38894183380](https://github.com/shopable-ai/opendesk-browser/actions/runs/38894183380) 验证，89 项 Node 中 88 PASS、仅来源预览 FAIL。
- [37cd7ac2](https://github.com/shopable-ai/opendesk-browser/commit/37cd7ac241eb3be220ff9c0a2c89a19df40026e8) 将经过审查的可信 Host Blob SHA-1 固定为 `512e94e771a7b65f8482bc006e8baee43e207044`，未放宽 `scripts/bundle-provenance.mjs` 的可信边界。
- 首次源驱动 [CI 38894688196](https://github.com/shopable-ai/opendesk-browser/actions/runs/38894688196)：既有官方 `scripts/preview/build-preview.mjs` 实际生成正式预览 HTML，`check-preview-contract` 和 AdBlock/Stay Focus 89 项 Node **全 PASS**，共享 Preview Node 亦全 PASS，4 个宽度及错误场景生成通过。真实 headless Chromium 发现测试选择器错点不可见“概览”按钮，在构建前停止，native 未启动，**该 run 整体为 FAIL**。
- [43949408](https://github.com/shopable-ai/opendesk-browser/commit/43949408147e040c4f1e572940bd5522abce7f47) 修改 Preview Chromium 测试，按两个页面各自的真实无障碍名称定位可见返回按钮，未修改产品导航来迁就错误选择器；[e3aa2462](https://github.com/shopable-ai/opendesk-browser/commit/e3aa2462e58caa7ad6523ce30ed5b6b2e07c6748) 增加 320/360/400/480px Chrome 截图与横向溢出检查。
- 为避免手写 200+ KiB HTML 和无测试晋升正式包，单次 GitHub Actions 链 [CI 38895643166](https://github.com/shopable-ai/opendesk-browser/actions/runs/38895643166) 复用现有生成器/打包器：来源生成→完整 Node/Preview Chromium→candidate/prod/dev→真实 macOS Native→仅同源且无并行冲突时晋升正式 JSON。一次性 Workflow 自身在成功晋升时删除；任何阶段失败自动阻止晋升，禁止强推和覆盖较新 main。
- 已有历史 [macOS Native 38886026463](https://github.com/shopable-ai/opendesk-browser/actions/runs/38886026463) 证据为 Chrome 实际 DNR 规则 `741000`、`net::ERR_BLOCKED_BY_CLIENT`、HTTP server 无广告请求命中，以及鼠标全局暂停/重启过滤；但该历史 run 在 `Space reenables filtering timed out` 失败，不能授予新提交 `NATIVE_CHROME_PASS`。
- 本段记录截至 R1.9.3 第二次专用 CI 等待结束：`SOURCE_VERIFIED` 为已审查源码/初次来源再生 PASS；`NODE_PASS` 为 R1.9.3 首次来源生成的 89/89 成功、后续新候选仍需复验；`BUILD_PASS`、`PREVIEW_BROWSER_PASS`、`NATIVE_CHROME_PASS`、`PRODUCT_ACCEPTED` 暂不晋升，标记 PENDING/NOT_TESTED。未经实测不得给出 95+ 分数。原始 `preview/adblock-r1-interactive-preview.html` 的不可变 Blob 和 SHA-256 完全未改。

### R1.9.3 · 安全升级版本与独立 Native 门禁（2026-10-16）

- 已通过源码来源再生/89 Node/共享 Preview/实际 Chromium/320–480px 与 production 构建的候选：[CI 38895876061](https://github.com/shopable-ai/opendesk-browser/actions/runs/38895876061) `source-preview-package=success`；实际 Ubuntu Chromium 工具场景（success/empty/untrusted/error/loading/permission-denied）与截图入 Actions Artifact。该证据只对应旧 `1.1.0` 候选，包 SHA-256 `e6c44001d157e9a8874a9b45b2051cb8ecd487006e768cffe91f4765feff10d6`，不冒充新版本或 Native PASS。Native 作业仍需独立取得 PASS。
- 对比历史 1.1.0 已在 macOS Chrome 实际安装的正式候选包 SHA-256 `5dbf540f608e1ebdb24a2e69ecbebe13ae725a952ea1a3547a1b85bf07c3019d`（仅 18,080 bytes），新 UI 包为 18,501 bytes；二者 `html`/`css`/权限相同，但 `js` 增加 iframe 首次点击时跳过聚焦中的恢复按钮刷新（避免点击前 DOM 被替换）。
- 市场正式安装器 `src/ui/sidebar-tools/installation.js:333-335` 明确在 `compareToolVersions(candidate,current)<=0` 时返回 `E_VERSION_CONFLICT`，因此不允许把新内容伪装成已安装的相同 1.1.0 版本。正式发行版本已调整为 **`adblock@1.1.1`**：[配置 93cb3e0d](https://github.com/shopable-ai/opendesk-browser/commit/93cb3e0d1d31972917eacd9e2dad83baec64dea5)、[Node 版本门禁 a8f95486](https://github.com/shopable-ai/opendesk-browser/commit/a8f95486f64454d5594c47d0a807d0be0cbe28c1)、[快照来源版本 6698aec7](https://github.com/shopable-ai/opendesk-browser/commit/6698aec79b7b81df462045a4fedd08e9f425deec)、[安装说明 15aefe26](https://github.com/shopable-ai/opendesk-browser/commit/15aefe26270c899ec82d2ac116660645b6517e5e)。
- 新版精确候选 [CI 38896910268](https://github.com/shopable-ai/opendesk-browser/actions/runs/38896910268) 重新运行 Node → Preview Chrome → build → Native Mac → 同源晋升。严格要求：在其原生回执出来前，新版 `NODE_PASS/BUILD_PASS/PREVIEW_BROWSER_PASS/NATIVE_CHROME_PASS` 标注 PENDING，正式 JSON 尚未提交，`PRODUCT_ACCEPTED=NOT_SCORED`。非 AdBlock 工具变更不应造成写入相互覆盖；来源/安装器/公共构建输入变动时仍拒绝晋升过期证据。

### R1.9.3 · 1.1.1 构建与 Chromium 同源通过（2026-10-16）

- 精确来源：`2acd396995efe73623ef942819057809aa680ba1`，对应 [GitHub Actions 38896910268](https://github.com/shopable-ai/opendesk-browser/actions/runs/38896910268)，`source-preview-package` 真实 **SUCCESS**；AdBlock/Stay Focus Node、公共来源锁、独立 Preview Node、正式来源 HTML、实际 Ubuntu Chromium DOM/响应式与 production/development/verify/package 全链已通过。独立 macOS job 等待 runner，不得继承旧 Native PASS。
- 从实际上传的 `adblock-r193-source-verified-2acd396995efe73623ef942819057809aa680ba1` Actions Artifact 解包逐字节核对：`adblock@1.1.1` **18,501 bytes**，候选、工具根显式晋升文件、`dist/production/official-tools/adblock` 三者 SHA-256 同为 **`c218b301f0c8aa0414f49f9db1a71e2d47d40031035e167051ed7dbc491d7378`**。正式 `adblock-r1-interactive-preview.html` 为 229,336 bytes，SHA-256 **`fd7b2766631b02e8360f01af72a0d0665c5fa208a10625cb31554f556014044c`**，经真实生成器和 Chromium 校验，不是重画。
- Chromium 预览报告状态严格是 `PREVIEW_BROWSER_DOM_SIMULATION_PASS_NOT_INSTALLED`，共 **9** 个场景/视口记录、**45** 张包含共享受影响工具的真实截图。测试中 iframe 恢复按钮的 `.click()` 属 DOM 模拟而非可信原生手势；Linux 与 macOS Native 明确独立统计。
- 当前阶段以 GitHub `main` 仓库状态为准：尚未安全晋升正式包（最后一道 macOS Native 与后续 source-drift 门禁未完成），`NODE_PASS/BUILD_PASS/PREVIEW_BROWSER_PASS` 绑定上述精确工件，可标明通过，`NATIVE_CHROME_PASS=PENDING`，`CI_PASS=PENDING`，`PRODUCT_ACCEPTED=NOT_SCORED`，不造 95+ 独立评分。

## R1.9.4 · 精简品牌头部与设置入口（2026-10-16）

- **用户明确确认 UI 变更**：AdBlock 内容区不再重复显示徽标、`AdBlock` 标题及“广告拦截 · 安静浏览”副标题。保留公共工具外壳已有身份，内容区只有一枚靠右上角的设置图标，保留语义 `aria-label="打开 AdBlock 产品设置"`，导航仍为 overview / exceptions / settings；不得在后续扩展实现时恢复重复头部。
- 源码提交：[ff37f0d6](https://github.com/shopable-ai/opendesk-browser/commit/ff37f0d6b33dc88868834f369522e983f96e25d2)：仅收敛 `examples/sidebar-tools/adblock/trusted/host-controls.js`、`src/ui/tool-shell.css` 中该产品布局，审查后同步收紧 `scripts/bundle-provenance.mjs` 的固定 Host Blob 指纹 `2825b291e5e690597ae86971cde6071e203ada93`，并加 Node/Chromium 反退化断言。没有重做 Sidebar SDK、DNR 规则或 Sandbox。
- [9dc8a226](https://github.com/shopable-ai/opendesk-browser/commit/9dc8a226d96b7246a5d6ca14cc5dc7410a24cb51) 修正历史测试对“必须保留 logo”的过时断言。真实 [GitHub Actions 38904349267](https://github.com/shopable-ai/opendesk-browser/actions/runs/38904349267)：**89/89 Node PASS，9 个离线 Chrome 场景 PASS，320/360/400/480px 响应式截图与右上角设置入口 PASS**。
- [1af23f08](https://github.com/shopable-ai/opendesk-browser/commit/1af23f08fc1803b69bcc2c20446afee804d20c33) 通过唯一 `scripts/preview/build-preview.mjs` 重新生成并安全提交正式 `examples/sidebar-tools/adblock/adblock-r1-interactive-preview.html`；未改变不可变 R1 原始设计 `preview/adblock-r1-interactive-preview.html`。一次性来源同步工作流自清理，无第二套持久生成器。
- R1.9.3 之前最近一份完整 macOS Chrome 实测 [38895876061](https://github.com/shopable-ai/opendesk-browser/actions/runs/38895876061) 已证实原生 Tab/Space 关闭再开启、真实 DNR 阻断、精确网站例外、其他网站继续拦截、跨域 iframe 请求；但因 `visible sandbox control ... 恢复 127.0.0.1 ... timed out` **仍为 Native FAIL**。复核当前产品“例外列表仅在 exceptions 页面显示”与原生脚本测试隐含“列表常驻”是否不一致，再做真实可见 UI 驱动、焦点、用户手势和恢复读回测试。不能以历史 macOS 部分成功宣布新 UI 的 native PASS。
- 待续完成：`adblock.opendesk-tool.json` 最新可信候选的版本/同字节来源晋升、原生恢复链和卸载/撤权/重启完整验收。该 UI 预览通过不等于正式包、macOS DNR 或 95+ 产品验收，缺少的独立证据保持 NOT_TESTED / NOT_SCORED。

## R1.9.5 · 同排设置工具栏（2026-10-16）

- 用户最终确认：AdBlock 设置齿轮和卸载按钮必须属于同一行可信工具栏，返回按钮与「广告拦截」标题之间 8px，标题 14px。内容区域不得额外出现独立设置按钮行、Logo、名称或描述。覆盖之前 R1.9.4 内容区右上角的方案。
- 提交 [7843f90c](https://github.com/shopable-ai/opendesk-browser/commit/7843f90c4c0a3fdaefa33bcefc9bbec1920ae0f3) 已修改固定 UI 工厂、正式 Side Panel 接线、CSS、HTML 外壳模板、模拟导航、组件与 Chromium 断言，同时同步可信 Blob 校验和 Quick Notes 来源锁，以及 AdBlock 需求/公共开发文档。
- 提交 [b79db51f](https://github.com/shopable-ai/opendesk-browser/commit/b79db51fb80cb507cf06f6bcb5dc0030d4b9eebb) 修复源快照生成器依赖被移除的内容区按钮；设置视图改用正式控制器的 toggleProductSettings()。提交 [8fa009f1](https://github.com/shopable-ai/opendesk-browser/commit/8fa009f15bbab7135f4cef55c2e6b0589d8546e8) 修复测试中 header 与 heading 前缀误匹配；不是删除 UI 安全检查。
- 官方 [R1.9.5 来源回归 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38909663739) 负责真实 HTML 生成、定向 Node、四档 Chromium 与 GitHub 正式文件同步。只有其同源验证及晋升真实成功才算 SOURCE_PREVIEW_PASS；测试失败或排队时不宣称 HTML 已提交。本地交互预览不是正式安装证据。
- 下一优先级为 macOS Chrome 完整网站例外恢复、DNR 权威读回和唯一正式安装包；历史 [38895876061](https://github.com/shopable-ai/opendesk-browser/actions/runs/38895876061) 已验证部分真实网络阻断但仍在网站恢复按钮可见性失败；新候选 NATIVE_CHROME_PASS=NOT_TESTED，不得评满 95。

## R1.9.5 · 正式 HTML 已提交（2026-10-16）

- 用户最终确认视觉：唯一可信工具栏中返回、`广告拦截`、设置、卸载同一行；返回到标题 8px，标题 14px。内容区不显示 Logo、副标题或第二枚设置图标。正式源码已经在 `main` 对齐，不得回退为内容区单独设置行。
- [GitHub Actions 38909663739](https://github.com/shopable-ai/opendesk-browser/actions/runs/38909663739) 的 `verified-preview` job 实测 PASS：AdBlock/Stay Focus 89/89 Node PASS，通用 Preview 64/64 Node PASS，Chromium 9 个场景 PASS，四档宽度 320/360/400/480，以及完整 npm check。该 workflow 的初次回写 job 因并行 React 修改了 package-lock 而触发保守来源防线，不将 workflow 整体标为 PASS。
- 从该成功 job 下载的**真实生成器输出原始文件**，经 GitHub create_blob 取得并与本地 git hash-object 校对完全相同的 blob `4712eafda061d13ea54893d2f59dedfc4c311006`，通过 [3f443590](https://github.com/shopable-ai/opendesk-browser/commit/3f44359090103c254029d75cc8a744d879cf627e) 提交到 `examples/sidebar-tools/adblock/adblock-r1-interactive-preview.html`。执行前已核对从受测 HEAD 到当时最新 `main` 的所有相关生成输入均无变更；未覆盖其他 Agent 的内容。[12e566d7](https://github.com/shopable-ai/opendesk-browser/commit/12e566d766903cc1c511524fa46ee977f8f1b680) 清理一次性 CI 工作流。
- GitHub `main` 已复查正式 HTML Blob 仍为 `4712eafda061d13ea54893d2f59dedfc4c311006`；正式可信 host Blob `c1fe6ae5d504036bdb8b46fc778df504db2bbb73` 与来源安全锁一致。原始设计 Blob `f10b6f6671480b3ea4828a04541e7bffa4e4d58a` 未修改。当前工具配置版本 `1.1.1`。
- 此验收范围仅为正式来源 HTML 和 Chromium 交互：`SOURCE_PREVIEW_PASS`，`NODE_PASS` / `PREVIEW_BROWSER_PASS` 为绑定成功 CI 的通过证据；`NATIVE_CHROME_PASS=NOT_TESTED`（最新 R1.9.5），`PRODUCT_ACCEPTED=NOT_SCORED`。本轮未生成或晋升目录下唯一 `adblock.opendesk-tool.json`。原生网站例外恢复、真实安装升级、DNR 权限撤销与完整重启必须下一轮继续，不能把旧 macOS 部分成功冒充最新候选验收。

## R1.9.6 · 真实安装合同与受保护的正式包晋升（2026-10-16）

- **基线**：正式确认的 `examples/sidebar-tools/adblock/adblock-r1-interactive-preview.html` Git Blob `4712eafda061d13ea54893d2f59dedfc4c311006`；AdBlock 可信 Host Blob `c1fe6ae5d504036bdb8b46fc778df504db2bbb73`；当前工具配置 `adblock@1.1.1`。本轮不修改已确认 HTML、工具 UI、DNR 实现或工具版本。
- **原生验收强化**：[dc4294d8](https://github.com/shopable-ai/opendesk-browser/commit/dc4294d8f1cde16f258add1a6078b6f06ab3327f) 在 `tests/framework/adblock-r12-native.test.mjs` 的真实已安装 Side Panel 中，检查标题/14px/8px 间距、同排设置与卸载按钮、内容区无重复品牌、例外 iframe 在概览隐藏，并以 CDP 真正鼠标点击打开/返回 AdBlock 产品设置。不是离线预览，也没有使用 DOM `.click()` 冒充用户输入。历史例外恢复步骤已具备显式进入「已停用的网站」导航，继续由完整 Native job 做实际验证。
- **唯一正式包交付修复**：[ce1d0d19](https://github.com/shopable-ai/opendesk-browser/commit/ce1d0d19948d6eed7b66542a72ccd30f8f80ed9b) 扩展现有 `.github/workflows/adblock-r12.yml`：只有同 SHA 的 `source-and-package` **和** `native-macos-chrome` 全成功，才允许第三个 job 下载候选，在最新 `main` 检查 AdBlock/可信 Host/DNR/打包器/测试输入未漂移、重新构建并逐字节比对后，通过唯一官方 `--promote-from` 晋升 `examples/sidebar-tools/adblock/adblock.opendesk-tool.json`，`--check-project` 回读，正常非强制推送。远端并行变化造成冲突时拒绝推送；失败不保留伪正式包。单独仅生成的 JSON 不等于官方已发行状态。
- **精确验证候选**：[GitHub Actions 38913935933](https://github.com/shopable-ai/opendesk-browser/actions/runs/38913935933)，源 SHA `ce1d0d19948d6eed7b66542a72ccd30f8f80ed9b`。本段记录时 workflow 仍为 `in_progress`，因此 **未**标记 Node/Build/Native PASS、包 SHA、Chrome ID 或 95+ 验收。需要以 workflow 各 job 最终结论、Artifacts 和 `main` 上的正式 JSON Git Blob 为权威核实。若 native 或来源漂移失败，则补修具体失败项并重新运行，不绕过门禁。
- **状态**：`SOURCE_PREVIEW_PASS` 继承 R1.9.5 精确 HTML/CI 证据；R1.9.6 `NODE_PASS=PENDING`、`BUILD_PASS=PENDING`、`NATIVE_CHROME_PASS=PENDING`、`FORMAL_PACKAGE=PENDING`、`PRODUCT_ACCEPTED=NOT_SCORED`。非真实实测的十维专家评分统一 `NOT_SCORED`。
