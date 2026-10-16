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
