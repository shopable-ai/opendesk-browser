# AdBlock UI Parity R1.8（2026-10-16）

## R1.9.9 本轮续接（2026-10-17，01a14606，IN_PROGRESS）

- Owner：本聊天；目标为批准的单行工具栏与概览/网站例外/设置三页实装复核，最小修复后独立复评。默认中文，不重做设计，不以开发证据宣称生产接受。
- 写入范围：本工作流；若实测出现缺口，仅 AdBlock `src/`、`trusted/host-controls.js` 及对应定向测试/精确来源 pin，写前重新读取 diff。共享 React 文件默认只读；其他 Agent 的 Prompt Shortcuts、XMind 与 Page lifecycle 工作保留。
- 来源：fetch 后本地 `1fbba04d4`、远端 `e84d02149`；已按续接授权保留双方提交合并 main。新增 React picker/编辑器接线使旧包证据不足以覆盖最新共享输入，需补定向回归与独立快照构建。
- 资源：持续开发唯一 writer PID 23773 / 127.0.0.1:43119 / `dist/development`，不覆盖或停止；独立快照及证据 `artifacts/adblock-r199-local/`，构建 guard 43221（使用前检查），独立临时 CFT Profile/随机 CDP 端口，不操作个人 Chrome。
- 复用：此前 AdBlock 114 项组件结果和真实授权/拦截/重启证据按各自原身份保留；最新文案后的 UI 截图、四档物理布局、最新共享 React 构建未覆盖，须补证。撤权网络失败仍 BLOCKED；正式 JSON 未晋升；未测维度 NOT_SCORED。
- 通过条件：同输入构建/verify，通过当前候选安装链，三页无可见阻断；截图绑定路径/模式/真实 ID/serve/源码与包指纹，独立按证据评价相关 UI 维度。完整 Native、生产接受和正式晋升分别保留原门禁。
- 实测新增 P2：首次批准 DNR 后的预期重启被作为通用技术错误留在所有页面，独立初评 89–94。先以回归测试复现，再把同一真实全局状态放到三页共享的产品状态区，明确“全局保护”归属，保留重启围栏及撤权未确认提示，移除该预期分支的全局原始错误。仅更新精确 host-controls blob pin，不扩展可信源。
- 新增验证驱动所有权：`scripts/tests/react-sidebar-r3331-browser.mjs`。夹具补入产品已有样式，原生点击前验证真实命中并在需要时滚轮滚动；保留全部 trusted Run/Save/Stop、framework 和 owner 清理断言。修复后 SOURCE_UI_SIMULATION_CHROMIUM PASS，不冒充实装测试。

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

## R1.9.7 · React 19 构建安全、原生门禁与正式包进展（2026-10-16）

- **独立失败证据**：[38914805552](https://github.com/shopable-ai/opendesk-browser/actions/runs/38914805552)，AdBlock 定向 89 Node PASS / 候选 JSON 生成成功；实际 WXT 生产构建在 React 19.2.0 的输入追踪 `Object.getOwnPropertyDescriptor(e.constructor.prototype,t)` 被正式 AST 安全验证器拒绝，macOS Native 和正式包晋升均 SKIPPED。
- **定向修复**：[14c00f41](https://github.com/shopable-ai/opendesk-browser/commit/14c00f41d208ba6b9050a4ef2b718146ce4a4058)：仅在 npm 锁定 React/ReactDOM 19.2.0、固定 ui/tool-shell 输出、合法 `Object.getOwnPropertyDescriptor` AST 调用、原生 Object 未被遮蔽及入参语义满足条件时允许无执行的原型描述符读取；拒绝跨 entry、计算属性、构造器调用、动态执行。把拒绝的 constructor 引用一次性聚合审计，并增加正反向自动测试。没有修改 CSP、DNR、批准 HTML、规则或工具版本。
- **发行防漂移**：[15e170a3](https://github.com/shopable-ai/opendesk-browser/commit/15e170a36adb06fef445fbccd825f0da0dfb4e55)：AdBlock 专用 CI 增加独立 ReactDOM 源码兼容测试，并将 React UI、npm 锁文件、构建配置、ReactDOM 专用转换及其测试加入 workflow 触发和发布前的最新 main 源码差异拒绝清单。旧 Native 结果不能跨构建输入漂移复用；不创建新分支或替代发行流程。
- **复验与后续真正阻塞**：[38917000510](https://github.com/shopable-ai/opendesk-browser/actions/runs/38917000510) 的安全/AdBlock Node 95 PASS，但上游 ReactDOM 输入转换插件因源码匹配形态阻止生产构建；[38918197481](https://github.com/shopable-ai/opendesk-browser/actions/runs/38918197481) 已通过 ReactDOM 与构造器正反测试，生产输出完整扫描进一步发现 `new nativeEvent.constructor(nativeEvent.type,nativeEvent)`（连续事件重放），属于真实动态构造器调用，必须继续拒绝，不能作为只读 AST 特例。
- **并行 React 工程修复**：最新 main 已出现针对 ReactDOM 19.2.0 原版模块的限定转换，把输入描述符的 `node.constructor.prototype` 变为 `Object.getPrototypeOf(node)`，同时将连续事件重放转成明确的 `PointerEvent/DragEvent/FocusEvent/MouseEvent/Event` 构造分支，新增专用正反测试。具体能否通过生产、开发和原生 Chrome，只认该变更对应的 CI 原始日志，不能仅据代码变更视作 PASS。[后续 AdBlock CI 38918489568](https://github.com/shopable-ai/opendesk-browser/actions/runs/38918489568) 启动时仍为 PENDING。
- **正式发行界限**：已确认获批准 HTML Git Blob 仍应为 `4712eafda061d13ea54893d2f59dedfc4c311006`，配置为 `adblock@1.1.1`。此阶段检查 `examples/sidebar-tools/adblock/adblock.opendesk-tool.json` 仍不存在；不能提前写入未通过 Native 的包。任何 Native 失败保留截图、CDP、DNR、HTTP 和失败控件可见性证据。只有 BUILD PASS → Native macOS Chrome PASS → 候选/生产包源字节一致 → 官方 `--promote-from` → `--check-project` → 最新 main 非强制提交成功后，才可标记 PRODUCT ACCEPTED。
- **独立质量审查状态**：UI 还原、操作效率、状态准确性、网站例外、权限安全、真实拦截、无障碍、生命周期、响应式、可维护性，在最新正式安装流程上尚无齐备的可核验证据；本轮十项全部 `NOT_SCORED`，不虚报 95+。
# R1.9.8 · Local Mac build / native closure（2026-10-17）

- Owner: Codex chat `01a145cd-08ba-7f63-b689-3bc104c2e324`; status: `BUILD_PASS / NATIVE_BLOCKED / NOT_RELEASED / NOT_ACCEPTED`.
- Initial local/remote main: `4c28a087dc2c4e3175ed7e8785dd5cb524e1323a`; unrelated Prompt Shortcuts / Mindmap edits preserved. No OpenDesk dev/build/native writer was running at initial process inspection.
- Write scope: this workstream; evidence under `artifacts/adblock-r198-local/`; if reproduced, narrowly scoped ReactDOM build transform/tests or `tests/framework/adblock-r12-native.test.mjs` fixes. Approved UI and tool version remain unchanged. Official JSON promotion is conditional on complete build + real Native PASS and source identity checks.
- Resources: npm exact dependency install, guarded `dist/production` and `dist/development` builds, own temporary CFT profile and ephemeral HTTP/CDP ports. Mode initially static production/development validation; no serve client connected. CFT: local Playwright cache Chromium 1248 executable (version to be recorded before launch).
- Reuse decision: historical Linux preview/old Chrome receipts remain historical only; latest React build inputs and same-candidate Mac evidence require validation. CI `38941304173` queued at inspection. No old Native or 95+ acceptance claimed.
- Additional write ownership: leader owns `.github/workflows/adblock-r12.yml`, `scripts/verify-adblock-native-release.mjs`, its targeted environment test, and any reproduced sandbox fix in `examples/sidebar-tools/adblock/src/main.js`; native driver owned by native subagent (inherited model). Shared default output guard was occupied by another real build; isolated source snapshot uses guard 43220 with its own exact npm install, `.wxt`, `dist`, and receipts. The rejected external-node_modules symlink build is retained as failure evidence; no provenance check was relaxed.
- Snapshot build closure: 101/101 original targeted Node tests, source check, Production `cda7406555187d7372603bca91890de1e481dae71cc389ce23b444177db29e9f`, Development `c63c32dc7508f904f501e0aabaedba9227622e01aca5f09bb933c2a5f15cef19`, and both verify commands PASS. Inputs are recorded under `artifacts/adblock-r198-local/source-snapshot.json`; this is not Native approval.
- Development mode switch: after the other build released guard 43120, this chat started the normal repository `npm run dev` writing `/Users/shopme/Documents/workspace/opendesk-browser/dist/development` on port 43119; CFT connection remains to be verified. Other sessions must not overwrite this output. Isolated production Native baseline on Chrome 156.0.8078.4 failed before permission at `trusted AdBlock switches visible`; preserved under `native-baseline/`, not promoted.
- Reproduced trusted-feature gap: external native permission revocation leaves HTTP blocked on CFT 156.0.8078.4 while API access is gone; complete browser restart restores HTTP 200. Leader additionally owns `trusted/service.js`, `trusted/host-controls.js`, their two environment tests and exact source pins in `scripts/bundle-provenance.mjs`, solely to expose the existing session fence as an unconfirmed-cleanup restart warning. No DNR engine, permissions, installation or UI layout change. Passing condition: revocation warning persists across Worker recreation, disappears on a fresh browser session without permission, and never claims verified rule cleanup. Native failure assertion remains mandatory.

### 实际源码修复与构建闭环

- 沙箱窗口 focus 先于按钮 focus/click 到达时，旧实现清空状态并替换恢复按钮，导致点击丢失。相同权威状态现在保留 DOM；恢复 generation 拒绝旧 status 成功/失败覆盖确认中及完成后的结果；随后仍读取最新权威状态，失败继续移除旧操作控件。7 项沙箱回归覆盖成功、失败和异步交错，未绕开可信确认。
- 原生测试等待扩展中心列表与行完成刷新后再单次点击“打开”；iframe 点击记录内外层矩形、遮挡、可见性及截图；增加恢复取消、真实 Worker stop→新 target→受信任服务回包、整包 SHA 和失败证据写入诊断。保留网络、授权与清理断言。
- 撤权后复用已有 session ready fence 返回 `restartRequired=true / rules.verified=false`，提示“停止过滤尚未确认，请完整退出并重启 Chrome”。不重新授权、不自动启用、不假报 DNR 清理。Worker 重建保留 fence；浏览器/扩展 session 重建后重新判断，不能把扩展重载当作完整重启的证明。精确可信来源 pin 更新为 service `c8cf789e3c73411e6588f03c1f558de39779de27`、host-controls `37c92abdcde09fe4e628de5adfd1bb3094359ee8`。
- ReactDOM 19.2.0 的生产/开发输入追踪、事件重放 literal 构造器及开发 bind 别名已有最新 main 的审计转换；本轮没有再造转换或放宽 AST/CSP。可信 UI 在 development 也使用生产 React 编译路径。反向测试与完整构建验证继续拒绝未审计动态执行。
- `npm ci --ignore-scripts --no-audit --no-fund` PASS；最终 8 个定向 Node 文件 **113/113 PASS**，`npm run check` **794 文件 PASS**。日志：[Node](../../../artifacts/adblock-r198-local/node-closure.log)、[源码检查](../../../artifacts/adblock-r198-local/check-closure.log)。
- 独立源码快照、精确 lockfile 安装、guard 43220：`npm run build`、`npm run build:dev`、`npm run verify` 全 PASS。Production 整包 `fcbd4b4953f10482fd10c2cd372f4697c355fbbe7cbce6143f1740c88066a0da`；Development 整包 `cd3daf9fe1596ac5f60a97e860af8586b30c62cd817f703557d29a3dfa7a2c0b`。记录：[构建 receipt](../../../artifacts/adblock-r198-local/closure-builds/)、[输入身份](../../../artifacts/adblock-r198-local/source-final-snapshot.json)。最终核对 1954 个快照输入与当前工作区无漂移，未用旧候选冒充新包。
- 保留中间失败：默认 guard 被其他构建占用、跨仓库 node_modules symlink 被 provenance 拒绝、精简快照初缺 Native contract 文件均未绕过门禁。磁盘不足曾导致一次中间 Native 证据写入失败，已保留日志并仅清理本轮可再生快照副本；最终 Native 原始证据写入完整，`evidenceErrors=[]`。

### 真实 Mac Chrome 结果与阻塞

- 用户最终指定开发模式调试；最终使用隔离 CFT/Profile 的**静态开发包** `artifacts/adblock-r198-local/source-final/dist/development`，不是 production 原生验收。CFT 可执行文件：`/Users/shopme/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`；实际 `Chrome/156.0.8078.4`，extension ID `mlogdfcgcpccoapkljkgjhkkmdddhlbe`，loaded manifest 与 ROOT 完全相等。
- 最终 [native-report.json](../../../artifacts/adblock-r198-local/native-closure-development/native-report.json)：`FAIL_OR_BLOCKED_NATIVE / success=false`，44.6 秒；首次授权→完整重启→手动开启、DNR 原生读回、HTTP 真拦截、正常资源、全局启停、Tab/Space、精确网站例外、其他网站继续阻断、跨 Origin iframe、恢复取消/确认、关闭面板、Worker 停止/唤醒与完整浏览器重启均取得该开发候选证据。恢复按钮真实可见并通过实际输入；取消保留规则 `741000/741001` 与 HTTP 200，确认后例外数 0 且实际广告重新阻断。
- 最终撤权：真实 `chrome.permissions.remove` 成功，持久 enabled=false、批准身份清空、DNR API 不可用；权威 status 和真实 UI 均报告 restartRequired、未确认停止。随后 **12 秒、70 次新 nonce 请求全部 `net::ERR_BLOCKED_BY_CLIENT`**。没有删除失败断言、强制重新授权、伪造存储或将重启恢复改成即时撤权 PASS。
- 原始 [CDP 事件](../../../artifacts/adblock-r198-local/native-closure-development/cdp-events.json)、[HTTP 服务端请求](../../../artifacts/adblock-r198-local/native-closure-development/server-requests.json)、[Chrome stderr](../../../artifacts/adblock-r198-local/native-closure-development/chrome-stderr.log)、失败 targets 的 JSON/PNG 与 [撤权截图](../../../artifacts/adblock-r198-local/native-closure-development/native-permission-revoked-restart-warning.png) 均保留。同一旧隔离 Profile 完整退出并重启后，独立 [恢复诊断](../../../artifacts/adblock-r198-local/revocation-restart-diagnostic.json) 得到 HTTP 200 和服务端命中；该诊断不是当前候选完整验收。
- 上游依据：[Chromium issue 551296620](https://issues.chromium.org/issues/551296620) 讨论 DNR 权限增减时 matcher 处理；[156 分支 RulesMonitorService](https://github.com/chromium/chromium/blob/634b046faf2137b83af71c87baf362b533af9104/extensions/browser/api/declarative_net_request/rules_monitor_service.cc#L595-L631) 在权限已不存在时跳过卸载分支。与本机现象相符属于有源码支持的归因，不能声称已在 OpenDesk 修复 Chromium。
- [正式安装 UI / 恢复按钮截图](../../../artifacts/adblock-r198-local/native-closure-development/real-site-exception-list.png)；单行工具栏、标题 14px、返回间距 8px、设置/卸载同一行、设置往返均有真实读回。另一次手动观察保留 [真实 360px 截图](../../../artifacts/adblock-r198-local/native-final-development/physical-layout/360.png)（DPR 2，非设备仿真）；该手动观察运行在 clean-profile 原生授权断言失败，不能晋升完整 Native PASS。分隔线原生拖动/AX 操作未改变读回宽度，320/400/480px 仍 NOT_TESTED；四档完整验收 NOT_TESTED。
- 工具停用/卸载与清理、已安装旧版升级、Stay Focus 同时实际安装的规则隔离仍 NOT_TESTED（Node 隔离测试不能提升为 Native）。原生测试在撤权网络断言失败后未到达卸载；不假报这些后续流程。

### 正式发行与 Git

- 新增发行 receipt 校验器，拒绝 skipped/缺字段/旧 commit/driver/SW/manifest/完整 artifact/正式包/安装身份漂移；真实失败报告已触发 `native report must pass` 拒绝。CI native 和 publish 均安装依赖后验证；source 漂移检查覆盖完整构建源码与传递依赖，仍经现有 needs、打包器、`--promote-from`、`--check-project` 与普通 push。
- 临时候选由唯一打包器生成，**1.1.1 / 19115 bytes / SHA-256 `b1df0a2b8d17d0582b174c9875e96e79153c429fbc1f24f3b54b505365c75a20`**，与本轮 Production、Development 内置 JSON 逐字节相同：[candidate](../../../artifacts/adblock-r198-local/candidate.opendesk-tool.json)。因 Native 未通过，未执行正式 `--promote-from`、未宣称正式 `--check-project`，目标 `examples/sidebar-tools/adblock/adblock.opendesk-tool.json` 仍未发行。
- 最新已完成上游 [CI 38941304173](https://github.com/shopable-ai/opendesk-browser/actions/runs/38941304173) 对应 `4c28a087...` 为 failure；不能充当本次未推送修改的 CI。新的官方 Native/晋升任务尚未通过。
- Git 提交前 local main `504a13313ad8634a1f5d0562e3259575490479d9` 与 fetched origin/main `82f9e8ae08c9d8e6ff1291a8feddef561ecbb878` 分叉，各含一笔其他任务的独有提交（XMind 与 Prompt Shortcuts）。不存在安全 fast-forward 同步路径；保留双方历史，禁止 reset/rebase/merge 绕过用户限定。本记录与本任务源码只提交到本地 main，推送因分叉阻塞；提交号及实际普通 push 输出见交付报告与本轮本地证据。
- Git writer：本轮仅对列出的 AdBlock、可信来源 pin、定向测试和工作流执行一次串行暂存/提交事务；不暂存其他任务文件。原始批准设计 `preview/adblock-r1-interactive-preview.html` 未改；根目录来源绑定预览仅同步实际 JS，未重设计。

### 十维独立验收

独立 reviewer（与实现者分离）读取源码、反向测试及原始 Native 报告；没有足够证据给任何一维人为赋 95 分。

| 维度 | 当前证据及未闭合项 | 独立评分 |
| --- | --- | --- |
| UI 还原 | 实装工具栏与三页证据；缺四档完整视觉对照 | NOT_SCORED |
| 操作效率 | 设置往返、开关、恢复取消/确认已测；无完整效率评估 | NOT_SCORED |
| 状态准确性 | DNR/网络读回与撤权警告已测；撤权网络仍被拦截 | NOT_SCORED |
| 网站例外 | 精确主机、其他主机、iframe、取消、恢复已测；多例外/升级未齐 | NOT_SCORED |
| 权限安全 | 授权/重启围栏/撤权状态已测；即时撤权效果失败 | NOT_SCORED |
| 真实拦截 | 真实广告阻断、正常资源、HTTP 计数；覆盖率/误伤未评估 | NOT_SCORED |
| 无障碍 | Tab/Space、焦点及异步回归；辅助技术/全流程键盘未齐 | NOT_SCORED |
| 生命周期 | Worker/浏览器重启已测；撤权失败、卸载/升级未测 | NOT_SCORED |
| 响应式 | 360px 组件截图；四档验收未完成 | NOT_SCORED |
| 可维护性 | 小范围修复、精确来源/整包门禁、113 项测试；官方闭环未完成 | NOT_SCORED |

资源交接：隔离 Native Chrome/Profile/HTTP 服务已关闭；独立构建已结束。正常 `npm run dev` 仍由本聊天启动的 PID 23773 持续运行，写入固定 `dist/development`，端口 43119；未操作日常 Chrome Profile。该 watcher 的 serve 状态与静态候选测试分开记录，不将“服务正在监听”当作日常 Chrome 客户端已连接。不得由其他 build 覆盖它的输出。

### 新版主页 UI 复核（2026-10-17，继续开发）

- 同一 owner 继续负责本工作流、AdBlock `src/main.js`、`trusted/host-controls.js`、精确可信 blob pin、对应两项定向测试及同源预览。仅修复真实状态文案，不改变已批准工具栏/三页布局。独立构建使用原快照及 guard 43220；日常服务继续独占固定 `dist/development`。
- 新增真实 production CFT 复核原始证据 `artifacts/adblock-r198-local/ui-production-review/`：Chrome 156.0.8078.4，实际五 Tab，360×815 / DPR2，三页均无横向溢出，设置/返回及焦点框可见。独立评审暂评 92/100，指出空例外状态易与全局启用混淆、不可用页面帮助文案不匹配两项 P2，正在最小修复；不是完整产品验收或正式晋升。该 production 原生重跑仍在真实权限撤销网络恢复断言失败，完整报告保留。
- 两项 P2 已修复：空态只陈述“暂无网站例外”；网站标题/帮助根据不可用页面、全局暂停、当前网站例外、正常保护状态显示真实指引。新增状态切换断言及空态回归，精确 host-controls pin 为 `6f6f000831a25234896c3b0fbb67b416a9ed7fb7`；批准设计参考文件未修改。
- 最新验证：8 个 Node 文件 **114/114 PASS**；check **795 文件 PASS**；独立快照 production/development 构建及两包 verify **PASS**，期间输入无漂移。整包 SHA-256：production `64cc95328fbf260aa35265782f38c2956a9a6fe76fa4d794c27d17a358b2967a`；development `ae2627c34be12934233a8088fd0fcae7cdda0c6f1b6b1bd0947a436cbb4a7227`。日志 `ui-wording-node-final.log`、`ui-check.log`、`ui-production-build.log`、`ui-development-build.log`、`ui-verify.log` 与 receipt `ui-builds/` 均在本轮 artifacts 下。旧 dist 保留在快照 `dist-before-ui-review/`，旧 receipt 不改写。
- 最新临时候选 `ui-candidate.opendesk-tool.json`，版本 **1.1.1**，**19103 字节**，SHA-256 `a45ef76ff290b13e607aa259a98a92ece1af0bdc06e9c359e2c2ecc0e56f338d`，与最新 production/development 内嵌包逐字节相等；没有晋升正式 JSON。
- 日常固定目录的隔离 CFT 已实际确认 serve 连接：extension ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，revision `645bed88d6900a3627152e261acab2b829999bad7060abd5e84ff6dab3833af1`；新版不可用页面文案已实装，截图及连接回读在 `ui-development-review/`。本次只读业务状态、真实安装及原生输入，没有写入 storage 制造结果。隔离浏览器/profile 已关闭；正常 watcher 继续运行。
- 用户要求在新对话继续：最新文案后的 production 三页重评、四档真实布局及完整 Native 仍为 **NOT_TESTED**，不能沿用修改前的 92 分或伪造 95+。既有撤权网络失败仍是正式发行 blocker；先前 Native 报告只绑定其原始 hash。用户已在本对话明确授权一次保留双方提交的 `main` 合并并推送，取代该次分叉的仅快进限制；其他 Agent 未提交改动继续保留。

### R1.9.9 首次授权状态修复与当前 production 复评（2026-10-17）

- 本聊天写入本工作流、`trusted/host-controls.js`、`scripts/bundle-provenance.mjs`、host-controls 定向测试和根目录来源绑定预览；原批准设计 `preview/adblock-r1-interactive-preview.html` 未修改。通用 SDK/过滤权限/生命周期业务未改。并行 React 驱动修复已由集成者保存为 `1b02165a4`。
- 新复现：首次授权的预期 `E_ADBLOCK_RESTART_REQUIRED` 被当成全局错误，后续切换设置/例外仍残留技术红字。先保存失败回归，再将其显示为带“全局保护”归属的产品状态；状态放在三页共同容器，继续保持未开启及重启围栏。18/18 host 测试通过；前后日志保留在 `artifacts/adblock-r199-local/restart-guidance-{before,after}.log`。
- 定向验证：9 文件 **105/105 PASS**；快照完整依赖下编辑器 **177/177 PASS**；当前 `check` **796 文件 PASS**。本机根依赖缺 webpack 的旧编辑器失败保留，未修改共享依赖。React Chromium 真实 Input 源码模拟 **PASS**；驱动补齐真实 tool-shell CSS、只读命中验证及原生滚动，保留 disabled/可信事件断言。不是完整扩展原生 PASS。
- 独立快照/guard 43221 双构建和 Verify **PASS**：production `08f3a554c3ced2ccef1d3e4ee64c59d359ccab17ca4f60ca52ba4f0854471884`，development `7d2c97200b654bd2ff9d6af725bd9dca775eed42c33285c569d730a00669819f`。记录在 `artifacts/adblock-r199-local/builds-guidance/` 和 `verify-guidance.log`。候选绑定快照，不等于后续并行修改的整个 main 已验证。
- 日常持续开发实际连接已读回：固定 `dist/development`、ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、revision `76ca37ac791cf61e9660bb56d42e982d66b6f9cb7f404bd368a0c18475373c97`；隔离 CFT 截图在 `ui-development-guidance/`。未停止 PID23773 watcher 或覆盖其输出。
- 同一新 production 静态候选在真实 Mac CFT **Chrome 156.0.8078.4** 安装、默认中文，真实 extension ID `caldphaccflihgiaaecgcloilngklpho`，加载路径为本轮 `source/dist/production`。360×815/DPR2 新概览、首次授权、设置、例外和焦点截图在 `ui-production-guidance/`，无横向溢出。独立 reviewer 的 `independent-review.json` 给 UI还原96、布局96、可读性94、三页导航/状态95、可见无障碍96；原P2已解决，剩余均P3。不取整、不将目标分数写为已通过；继续按真实可读性问题润色。
- 原生物理分隔线操作未改变实际360px宽度；320/400/480及完整四档仍 **NOT_TESTED/NOT_SCORED**。只评可见焦点，不提升为完整辅助技术/WCAG接受。既有撤权后网络仍被拦截的原始失败保留；卸载/升级/共存等未测后续不晋升。**正式 JSON 未晋升**，工具目录尚无正式 JSON，1.1.1临时候选身份不变。
- 本轮独立 CFT/Profile 已通过自己的 harness 正常关闭，并已向获得用户协调授权的 Cookie Editor 聊天交接前台原生资源。共享 Git 事务按 owner 串行，保留其 Cookie/SDK 和其他 Agent 工作。

### R1.9.9 可读性后续候选（独立快照，等待原生交接）

- 根据独立评审的 P3-03/04/05 做最小中文润色：DNR→广告过滤权限、可信宿主→OpenDesk统一管理；重启明确为完整退出并重新打开Chrome；网站例外返回位置明确为概览的“当前网站”。主仓库 Host/工具文件在 Cookie Editor 的持续开发验收窗口中保持冻结，修改先在独立快照完成，未抢占原生前台。
- 快照刷新到本地 `a33d8422` 时的真实源码（含最新React菜单/状态Portal及并行已冻结Cookie/SDK），59个差异文件与旧内容存入 `source-refresh-readability.json` / `before-readability-source-delta.zip`。只读源码绑定在 `readability-source-binding.json`；本候选不能代替后续main整体回归。
- 新候选 production `c1419e0fe87c8ef37df72118bf8b584cc9e68ac0a624f9d7c8452eeb485786df`、development `500d90aecce6bbfe031b2e58c8259d2522d201b9d139312b33922d9c2059d8f6`，双构建/Verify PASS，构建期间及之后均无sourceInputs漂移；receipt独立保留在 `builds-readability/`。可信Host blob pin `3d64b388b90a5f6dbbde7b6e1a036d1545160506`。
- 快照 **99/99**受影响AdBlock/React定向、**177/177**编辑器、**9/9**来源扫描、**2/2**两包整包来源验证PASS；check **794文件PASS**。最新React Chromium真实Input PASS，包含菜单可信点击、开发状态、Run/Save/Stop、禁用、框架radio和unmount。最初未设置CHROME_BIN、误用默认receipt目录的失败日志保留；修正实际二进制与独立receipt路径后通过，没有修改产品以过测。
- 此中文润色候选新截图及独立复评 **PENDING**，不得沿用上一候选的分数。正式JSON仍未晋升；既有撤权网络失败和另外三档物理宽度缺口未关闭。
