# ChatGPT Mind Map R2.1 — 固定引擎完整性与 HTML 预览增量记录

Date: 2026-10-15. Branch: `main` (only). Scope: `examples/programs/chatgpt-mindmap/preview/*`, `tests/environment/chatgpt-mindmap-preview.test.mjs`, 本记录。沿用 R2 工作流、已有 XMind 适配器、权限和构建路线，不建立第二权限体系。

## 已核对源码差异（为什么当前目录没有“大量 XMind 代码”）

原参考：`shopable-ai/shopable-station@b76abf4b95e34c1234a33927051ea13165d92715`。

| 旧项目路径/责任 | 当前项目对照 | 迁移判断 |
| --- | --- | --- |
| `public/lib/xmind/{jszip,polyfill,xmind-sdk,snowbrush}` | 四份原始 Git 文件已直接位于 `preview/`，`tests/xmind-provenance.json` 固定其身份 | 原始引擎 4,042,573 B **仍未纳入正式安装包**；生产许可证和可信隔离尚未批准 |
| `xmind/convert.ts`、`skin.ts` | `src/xmind-convert.js` | 已迁真实 Workbook、主题、notes、branch 状态；继续保持单一产品实现 |
| `xmind/sdk.ts` | `src/xmind-adapter.js` 的能力检查 | 目前只做全局存在性检查，缺固定本地资源的正式注入/授权；不能声称安装可运行 |
| `xmind-renderer.ts` (37,995 B) | `src/xmind-adapter.js` (6,400 B) | 只读 subset：真实 createWorkbookEditor、缩放、展开折叠和 close。未移植旧业务编辑器、命令系统、React 面板，**不能用行数判断漏迁** |
| `xmind-renderer-seams.ts` (14,950 B) | 产品逐回复 Registry + 转换器路径标识 | 旧编辑/选择状态兼容层不必全量迁入只读工具；选中节点/备注/定位待真实验收 |
| `MindbankMindMapPanel.tsx` / React 页面 | `src/view.js`、`src/answer-registry.js` | 复用独立页面程序生命周期而非搬入 Next.js/React |

固定 4 个 Git blob 与原记录完全一致；本轮从 GitHub 目录元数据再次确认 **文件名、大小、Git blob SHA**。内容 SHA-256 沿用 R2 记录，**本轮无法再次读取本机原始字节执行哈希**，不可误报为新轮通过。

## 新增 P0-0：完整引擎独立 HTML 垂直切片

先用 `preview/index.html` 和 `preview/serve.mjs` 以真正同源的产品 Registry/adapter + 本地固定四件套进行正向预览。唯一资源身份来源是 `tests/xmind-provenance.json`，服务器启动前核对文件大小、SHA-256、Git blob，不以源码目录存在/脚本 200 就判定渲染成功。无需复制已在本地的原旧仓库资源。

`preview/app.js` 只承担 fixture 宿主和测试按钮/诊断，不包含新绘图算法；原业务行为来自 `src/answer-registry.js`、`extract.js`、`view.js`、`xmind-adapter.js`、`xmind-convert.js`。亮色 HTML 提供 A/B/C 以及 320px、操作栏重建、单回复更新、Stop/全局样式残留检查。CSP 固定 `script-src 'self'`，无运行时外部依赖；仅在独立预览文档中允许 SDK 现有的内联样式。

**验收层次：**
- `SOURCE_LINKED`：HTML/JS 导入真实产品源码，不能漂移到第二份预览实现。
- `ASSET_VERIFIED`：实际固定四个字节文件均通过 hash；不是第三方分发权利批准。
- `LOCAL_BROWSER_RENDERED`：在 Chrome/Chromium 真正点击打开主题、缩放、折叠、返回、Stop，并保留截图和控制器数据；未运行不得宣称。
- `PRODUCT_RUNTIME_ADMITTED`：可信本地运行路径、隔离及生命周期经原框架审查。
- `INSTALLED_CHROME_VERIFIED`：同一 candidate + receipt + extension ID，在登录后的 ChatGPT 自动运行，不需再次点击 Run。

单独预览页面的成功**不能替代**安装、授权、style/CSP 隔离及真实 ChatGPT。残留全局 `style` 是现有 SDK 的已知问题，须在可信运行边界内解决；绝不能把 `style-src 'unsafe-inline'` 的本地预览策略复制到生产站点。并且必须追索固定 Snowbrush 合并文件、其所有第三方代码以及准确版本的分发许可；官方 viewer/SDK MIT 不自动授予未知合并产物的权利。

## 增量验证和阻塞登记

静态/Node 定向入口：`node --test tests/environment/chatgpt-mindmap-preview.test.mjs`。真实正向资源验收命令见 `examples/programs/chatgpt-mindmap/preview/README.md`。本轮经 connector 直接写入 GitHub，**不能假设本地 Mac 目录、扩展 Profile 或 Native Host 可访问**。原 R2 成果与测试证据保持其原始等级，不覆盖。

- Resource bits / true browser preview: **NOT_TESTED** (本环境未获取四份原始资源供可执行浏览器验证)
- Local preview script/source: **SOURCE_LINKED** (新文件，待当前候选 CI 验证)
- Vendor license/distribution: **BLOCKED / insufficient evidence**，不是确认为禁止分发
- Common fixed local JS admission in installed Page USER_SCRIPT: **NOT_IMPLEMENTED**；现行 CSS/JSON/图片资产额度不能替代可信 JS Runtime
- Style isolation/cleanup on real ChatGPT: **BLOCKED**
- Source → Build → Candidate → Verification → Available → Installed: **R2 仅到 Build；新候选后四环节仍 NOT_TESTED**
- Independent 10 dimensions 95+: **NOT_SCORED**；95+ 是验收目标，不是作者愿望值

## 下一环节（不能跳步）

1. 在可访问旧资源字节的开发环境执行新 HTML 正向验证，记录真实 Chrome 证据，并修复发现的产品 `src/` 问题，不改成伪 XMind。
2. 对四个文件完成许可/来源闭包与逐项安全评估：提供原 SDK/viewer 与 Snowbrush 合并产物的精确版本、著作权归属、第三方 NOTICE/LICENSE、打包/再分发依据。没有材料只阻塞正式分发，不阻塞私有源码分析和组件测试。
3. 复用现有受审静态库/安装签名/运行世界，先证明可行，再给共享框架追加**最小**固定资源接线；检查 Stop、撤权、升级、卸载、BFCache 和文档隔离。不得因本预览通过而添加宽泛 `@require` 或任意远端 JS 能力。
4. 对同一个冻结产物走真实 Candidate→Verification→Available→Installed，记录 package/build hash、runtime hash、扩展与程序安装身份、Page Authority 回执以及登录后 ChatGPT 页面实测，之后再进行独立专家逐维打分。


## 固定二进制的新增许可发现（R2.1 原始 blob 只读抽查）

对原始 Git blob 逐项读取可解码代码及注释，不改变本仓库 vendor 分发策略。以下是 **已在原始字节中观察到的嵌入标头**，不是完整软件组成清单或独立权利审批。

| 固定文件 | 实际可见版本 / 授权痕迹 | 尚缺 |
| --- | --- | --- |
| `jszip.min.js` | 头部写明 **JSZip 3.10.1**，MIT 或 GPLv3 双许可证；标注内含 MIT pako | 与所包含版本完全一致的 LICENSE/NOTICE 及发布保留方式 |
| `polyfill-45b9836beb.min.js` | 未找到足以识别完整传递依赖的版权/许可标头 | 精确源码图谱、构建锁和所有对应许可证 |
| `xmind-sdk.bundle.js` | 包含 JSZip 兼容代码；自身未检出明确完整合并清单 | 与 XMind SDK 官方 MIT 发行版的构建对应、原始依赖许可证 |
| `snowbrush-2c2b5d62b5.js` | 内含 **jQuery 3.5.1/Sizzle 2.3.5**（MIT）、**Hammer.js 2.0.7**（MIT）、buffer（MIT）、ieee754（BSD-3-Clause），以及 **GSAP 3.5.1 / CSSPlugin 3.5.1**（GreenSock Standard License 自有条款） | XMind/Snowbrush 原始合并包权利凭证；GSAP 3.5.1 原许可及当前授权适用范围；完整 SBOM/NOTICE 和专有部分授权 |

原 Snowbrush 同时包含插入全局 `<style id="snowbrush_style">` 的调用；这与 R2 fixture 实测样式未随控制器关闭全部清理相符。**不能只调用 controller.close() 就宣布在真实 ChatGPT 中已完全清理。**

第三方许可重要细节：官方 XMind SDK 和 XMind Viewer 自称 MIT，不能推导包含它们的任意合并文件全体 MIT。GSAP 于 **2025-04-30** 改为更宽松的 Standard "No Charge" 许可，但仍存在禁止竞争性可视动画构建器等限制；对此固定二进制中的旧版 GSAP 3.5.1，**不能直接假定新条款已无条件追溯、也不能据此判定禁止分发**。源头：
- https://github.com/xmindltd/xmind-sdk-js
- https://github.com/xmindltd/xmind-viewer
- https://webflow.com/updates/gsap-becomes-free
- https://gsap.com/standard-license/

完成正式分发前需要：**完整原始合并构建记录/精确版本→逐依赖版权和许可证→NOTICE/声明保留→对固定实际二进制与 OpenDesk 安装包分发方式的权利确认**。这是一项明确的第三方权利批准门槛，不能被本地 HASH PASS 替代；四份原始 vendor JS 已归位 Git 跟踪的 `preview/`，仍不得纳入正式可分发安装包、不得通过 CDN 或 MAIN 世界注入。


## 本轮已提交增量及真实 CI 身份

以下为本次 R2.1 实际写入/验证，避免混淆预览编译通过与真实用户安装。

- `3e32a54244755b1ceacda3c994915d3fcc9c2a0a`：新增 `preview/{index.html,preview.css,app.js,serve.mjs,README.md}`、独立预览源测试及本工作流。
- `6a4c00564f3430a6e159edaf9d5ee61769025190`：正式项目 README 接入预览入口。
- `3f4cf12188fde7184c0b317515054b3498fc12f4`：原固定资源 Chromium probe 新增同源独立 HTML 正向验证和截图、Stop 样式统计（**测试代码已写，浏览器案例未在本轮运行**）。
- `04924eae4e4978b391e6b12bfe763a6cd5b464fc`：独立 GitHub Actions 静态/构建检查，不能从其成功推导出 XMind SDK 浏览器或安装通过。
- `1474ab58ba6ae9f80d0d2472e53d3271033cbd10`：Snowbrush 内部 GSAP 3.5.1 等依赖许可证源头核对并记录。

精确 CI 链接：https://github.com/shopable-ai/opendesk-browser/actions/runs/38725149159

- 对应源码提交 `04924eae4e4978b391e6b12bfe763a6cd5b464fc`；offline-source-contract job `116389024656` **SUCCESS**。
- Node: **16 tests, 13 PASS, 0 FAIL, 3 SKIP**。3 项是缺少 `XMIND_REFERENCE_DIR` 的真实 SDK Workbook 测试，仍为 **NOT_TESTED**。
- `validate-program-project`：PASS。`npm run build:program`：PASS，但产物 `BUILT_UNVERIFIED / installable:false`。`npm run check`：PASS。
- 编译源 / 构建 SHA-256：`45ab0cd685da4158e4b7cebcd858969d90291b1606efd69135cbf5550819e808`（与 R2 一致；预览目录不被误塞入正式用户脚本）。
- 正式软件包的独立 CI 工作流 `38724267175` **FAIL**，在 `scripts/bundle-provenance.mjs` 审核 `examples/sidebar-tools/adblock/trusted/host-controls.js` 时显示“Trusted AdBlock source changed; review and re-pin”。该生产构建阻塞来自另一个可信 AdBlock 固定源码合同，不是本轮 XMind 资源成功/失败证明；不在思维导图任务范围擅自改动。
- R2 Chromium 真实引擎 fixture 旧记录 15 PASS 可作为历史证据继续保留，但本次新增独立 HTML Chromium 案例 **NOT_TESTED**，无浏览器 screenshot；授权后的 USER_SCRIPT / 登录 ChatGPT / 用户 Mac / 原 Mindbank 视觉相似度仍是 **NOT_TESTED**。

**下一道明确执行关卡**：带四份原始固定资源执行 `node tests/framework/chatgpt-mindmap-xmind-probe.mjs --assets ... --browser ... --playwright ... --out ...`，打开 `preview/serve.mjs` 提供的真实浏览器地址完成视觉/动作回归，然后推进许可批准、唯一受信 Runtime 安装链与原生验证。尚未获得许可证及安全隔离/同候选安装凭据时不得把 `installable:false` 改为真。


## 预览 Style 隔离证据修正及最后一次定向 CI

- 提交 `4f788bef73e699550092743db1ce16909c7ceeed` 修复预览 Stop 误判：Snowbrush **脚本加载时**注入的 `head style#snowbrush_style` 已可能存在于最初计数中，不能因 Stop 后 style 数量变化为 0 就宣称样式隔离完成。当前 Stop 同时检查 `snowbrush_style` / `.workbook-item` / `.sb-container` 全局样式节点，并显式标记 `BLOCKED_GLOBAL_STYLE_RESIDUE`。
- 提交 `4f788bef73e699550092743db1ce16909c7ceeed` 绑定的定向 GitHub Actions [38725804241](https://github.com/shopable-ai/opendesk-browser/actions/runs/38725804241)：**SUCCESS**（job `116391229754`），16 tests / 13 PASS / 0 FAIL / 3 SKIP（真实 SDK 缺失）；程序校验和构建 PASS，但仍 `BUILT_UNVERIFIED / installable:false`。
- R2.1 的独立 Chrome HTML **正向**渲染、清理后实际样式节点统计、用户 Mac 正式安装、登录 ChatGPT 仍 **NOT_TESTED**。旧版 R2 Linux Chromium fixture 的历史成功不提升为 R2.1 新 HTML 实测。

## R2.2 增量：原始字节接入隔离 CI + 真实 HTML Gate 1 已验证（2026-10-15）

**证据只绑定本次实际测试候选，不把此前 R2/R2.1 fixture 的成功混用。**

- 关键 CI: [38733159512](https://github.com/shopable-ai/opendesk-browser/actions/runs/38733159512)，head `15ef1cb44ed43753aa627ebe04648d045aed0e25`，`offline-source-contract` + `real-local-xmind-html` **SUCCESS**。
- 原始引擎字节本轮确实被读取/执行核验：隔离 Runner 临时目录使用 Browser 仓库**已有历史源码快照**中的 polyfill、xmind-sdk、snowbrush 三个完全一致 Git blob，再从 npm `jszip@3.10.1` 发布 tarball 取其 `dist/jszip.min.js`。严格调用正式预览的 `verifyFixedXmindAssets` 对 **四个文件共 4,042,573 B** 重新检验长度、SHA-256、Git blob 和顺序；`REAL_XMIND_SHA256_AND_GIT_BLOB_PASS: 4/4`。JSZip npm 字节实际与固定清单相同，不是降级替代；**没有提交、上传或创建新的 vendor 镜像**。
- 真实引擎 Node：**16 tests / 16 PASS / 0 FAIL / 0 SKIP**；默认静态测试 job、项目源验证、`build:program`、`npm run check` 亦为 SUCCESS。Node SDK 测试此轮不是缺资源 SKIP。
- 真实浏览器：隔离 Linux Google Chrome `154.0.8037.97`，原始 `_SB_.createWorkbookEditor` 实际绘图、A/B/C 三条回复、相同标题隔离、放大/折叠、C 大型多层级样例 **97 个真实主题**、原文、内容刷新、操作栏重建、全屏/Escape、320px 实际容器宽度、20 次开关、SPA/Stop 生命周期等，**21 browser cases PASS**。生成 `light-fixture.png`、`narrow-fixture.png`、`r22-local-html-wide.png`、`r21-local-html-xmind.png` 及 `result.json`；当前仅留存在同一 CI run 的限期内部证据中，不是产品包或对用户提供的 ZIP。
- 浏览器诊断继续实测 `styleIsolation: BLOCKED_GLOBAL_STYLE_RESIDUE`，且 `globalSdkStyles` 包含 `snowbrush_style`。SDK 控制器全关/自有 UI 清理，不代表外层文档样式被隔离。页面视觉与原 Mindbank 比对、200% 原生浏览器缩放、触控板、多层图交互质感与正式深浅色仍未完成独立验收。

正式产品修复：`src/xmind-convert.js` 不再给任何可见备注插入 `[nodeKey:…]` 内部元数据；只读导图的折叠仍由路径身份跟踪。`tests/xmind-adapter.test.mjs` 使用真实 SDK 断言重复标题下原始 notes 不被污染。本轮还在**同源** `preview/` 增加 C/大型导图场景，而非创建第二套引擎。开发测试一度因错误测试正则（随后修复）及 CSS 宽度 transition 过早断言失败；最终成功候选已修复，不抹除中间失败记录。

### 五道 Gate 当前准确状态

| Gate | 状态 | 本轮实际证据 / 下一阻塞 |
| --- | --- | --- |
| 1 HTML_ENGINE_VERIFIED | **PASS（隔离 CI Chrome）** | 四字节 SHA/Git blob 校验、真实 HTML + SDK 操作、截图和结果；不等于视觉 95 分 |
| 2 RUNTIME_ADMITTED | **BLOCKED** | Snowbrush 合并产物/传递依赖许可待核实；全局 CSS 残留；现行 `USER_SCRIPT` 512KiB 源/固定可选库上限无法容纳 3.44MB 原包；未实现或批准新的可信本地隔离资源入口 |
| 3 PRODUCT_FUNCTIONAL | **PARTIAL / fixture PASS** | 本地 A/B/C、97 节点、原文/Stop 通过；真实 ChatGPT DOM、200% 原生缩放、触控板、备注 UI/视觉比对仍 NOT_TESTED |
| 4 INSTALLATION_VERIFIED | **NOT_TESTED / BLOCKED** | `BUILT_UNVERIFIED / installable:false`；无同源 candidate、receipt、USER_SCRIPT 自动运行及撤权/卸载正式证据 |
| 5 CHATGPT_NATIVE_VERIFIED | **NOT_TESTED** | 未在登录后的实际 ChatGPT/用户 Mac 执行；不能称安装一次以后自动运行成功 |

**下一阶段最小必要缺口：** 精确权利来源与 NOTICE/SBOM、受现有 Authority 管理且不向 ChatGPT MAIN/全局样式泄漏的通用离线绘图边界、正式固定 Runtime 接线、同候选安装验收、真实 ChatGPT UI/视觉与输入操作验收。不可为了本地 Gate 1 PASS 强行改 `installable:false`，不可把 legacy 快照路径或 npm 作为安装时动态 JS 获取地址。

三个原 Snowbrush / XMind 固定 blob **此前就已存在于 Browser 仓库的旧项目源码快照**，这不等于它们是获批准、可分发的新产品依赖；这里没有新增 vendor 文件。以前“vendor 字节未在当前项目分发”的表述精确理解为“**不包含在思维导图正式 Program 构建/安装包中**”。


## R2.3 真实 HTML 自动预览与 CJK / 大图导航证据（2026-10-15）

**范围原则：** R2.2 真实 SDK/CSP/独立产品模块全部继承，不添加第二 Renderer、不打包未获批准 vendor JS、不推进未经许可和样式隔离批准的正式安装。本阶段只处理用户实际能直接打开、看到、验证的真实预览体验。

- **四件套一条命令：** `node examples/programs/chatgpt-mindmap/preview/serve.mjs` 使用仓库快照的三件 + 精确 npm `jszip@3.10.1`，在 Git 忽略的 `preview/.runtime/xmind/` 中准备并核验四个原始 JS。整体 4,042,573 B；逐文件长度、SHA-256、Git Blob 和次序由 `tests/xmind-provenance.json` 唯一提供，缓存损坏失败关闭。正常 CLI 输出 `PREVIEW_ASSETS_READY` 和带 `?autostart=1` 的本地 URL，带桌面的开发机会尝试打开默认浏览器，`--no-open` 可关闭自动打开；没有前端 Mock。**该目录是本地/CI 生成，不代表四个文件被新纳入仓库分发或正式 Extension。**
- **真实程序代码：** 预览只点击 `answer-registry.js` 创建的正式按钮，绘图仍经 `extract.js`、`view.js`、`xmind-convert.js`、`xmind-adapter.js` 和共享 CSS；A 自动图必须等待正式 `data-ready=true` 才反馈 `REAL_XMIND_RENDERED`，B/C 独立保留。该行为只在本地页面的 `?autostart=1` 开启，不能改变 ChatGPT 正式页面初始行为。
- **中文真实截图修复：** Chrome Linux runner 安装、验证 Noto CJK，正式产品样式也添加跨平台中文 fallback。此前截图中文大量方框；新隔离 Runner 真实 XMind 截图显示中文可读。Linux 开发机缺 CJK 字体时仍需安装系统字体；不能声称所有用户平台字体无条件可用。
- **通过的真实证据：** [CI #38741698352](https://github.com/shopable-ai/opendesk-browser/actions/runs/38741698352) 绑定 `6244f28d8da33991ba587f6979f88bed35b1b3b3`：两个 Job SUCCESS，Node 16/16、Chromium 22/22、A 自动预览 9 主题、C 大导图 97 主题、320px 容器实测 320px、中文清楚、真实截图归档。随后 [CI #38742723254](https://github.com/shopable-ai/opendesk-browser/actions/runs/38742723254) 绑定 `0c4003d3fdf48592f6bbc3620852ffa884f8f11f`：两个 Job SUCCESS，**24/24 Chromium PASS**，C 大图实测用户鼠标拖动真实主题位移约 **115px**，滚轮使 Snowbrush 内部 scroller `scrollTop:812→1152`。不是仅凭节点 DOM 数量宣称可浏览。
- **画布现实限制：** 97 个主题的实测总纵向范围约 1310px，而 inline 画布高度约 387px；**不可能在有限高度中保持全部主题同时可读**。用户可真实拖动/滚动、缩放或全屏阅读，不得把视觉裁切全部当作已彻底消除。尚未完成独立 Mindbank 相似度验收。
- **新的但尚待独立 CI 的输入：** `b5f789707155089da21f33abf316f74717025272` 增加 Chromium CDP 200% **visual viewport page-scale** 检查；这不等同 Chrome 菜单的原生站点缩放，后者与实际 Mac 触控板仍 **NOT_TESTED**。`9acd97da0400b429a9ebfcf5b2356b281aa79ba2` 增加直接 `spawn(node serve.mjs --no-open)` 后校验自动打开 URL 的 CLI 端到端 smoke。两项必须等待对应最新 CI 完成，不能以代码提交代替测试 PASS。
- **始终不提升准入：** 已实测 `style#snowbrush_style` 全局残留：`BLOCKED_GLOBAL_STYLE_RESIDUE`；第三方 Snowbrush 合并包 / GSAP 3.5.1 传递权利仍未闭环；可信固定 JS Runtime 无 4MB 安全准入；登录真实 ChatGPT 的自动运行、卸载/撤权与同候选安装仍 NOT_TESTED。保持 `installable:false`，不可扩容通用 USER_SCRIPT 512 KiB/注入 MAIN/开任意 CDN。

**证据范围结论：** `PREVIEW_ASSETS_READY=PASS(CI)`；`REAL_LOCAL_HTML_XMIND=PASS(CI)`；`REPOSITORY_DISTRIBUTABLE=BLOCKED`；`PRODUCT_RUNTIME_ADMITTED=BLOCKED`；`INSTALLED_CHATGPT=NOT_TESTED`。聊天中展示的浏览器截图只能标 `VISUAL_EVIDENCE_ONLY`，真实交互需运行仓库的 localhost 页面。每个截图/JSON 均绑定其各自 CI SHA 和有限保留时效。


### R2.3 新增缩放测试失败与修正状态

- [CI #38743226832](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743226832)（`b5f78970`）：**offline-source-contract PASS**；真实浏览器 job **FAIL**，在 CDP `Emulation.setPageScaleFactor(2)` 模拟双指缩放后，Playwright 鼠标点 B 的「适配」发生跨回复命中，30s 超时。**不属于 4 个 XMind JS 字节验收失败；亦不能说 200% 输入已通过。**
- [CI #38743388207](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743388207)（`9acd97da`）：**真实 CLI 子步骤 PASS**，输出 `REAL_XMIND_PREVIEW_SPAWNED_CLI_PASS http://127.0.0.1:.../index.html?autostart=1` 且 GET HTML 成功；整个浏览器 Job 因相同的 CDP 鼠标命中测试失败。不能把 Job 标记为成功。
- 修正提交 `1855ebc2896d6cfb408a80a3171c538015da8ec0` 改为先聚焦真实 Shadow DOM「适配」按钮，再在 CDP 2× pinch view 下真实键盘 Enter 触发；仅验收 **CDP 可视视口 + 键盘输入**，鼠标命中和 Chrome 菜单原生 200% 缩放仍未放行。对应 [CI #38744348312](https://github.com/shopable-ai/opendesk-browser/actions/runs/38744348312) 此条记录时仍在队列；最终结论必须以该运行的完整工作结果为准。


## R2.4 纠偏：四份真实 XMind JS 直接在 preview/（2026-10-15）

**根因：** 先前为隔离未经正式产品许可/Runtime 准入的引擎，误把 CI 临时资源目录当成预览交付物。用户明确要求四份原始 JS 直接保存在仓库 `examples/programs/chatgpt-mindmap/preview/`，而不是 `.runtime/xmind/`；历史 CI 的 `4/4 PASS` 只能证明运行时曾临时取得字节，不能证明仓库目标目录已完整。本轮按实际文件交付纠偏。

- 直接引用现有仓库 Git Blob + 历史同组织原版 JSZip Git Blob，不修改四份文件内容：`jszip.min.js` 97,630 B / `ff4cfd5e8fdc49176c2d1d409afa897f40be01f4`；`polyfill-45b9836beb.min.js` 104,563 B / `80922170f416950927615a3c089acb28bf91fdcf`；`xmind-sdk.bundle.js` 401,113 B / `ed8540218a334b6dc0b806887a2cf4ca6cc6960f`；`snowbrush-2c2b5d62b5.js` 3,439,267 B / `762e20010368d86733de5caea0ced69baa73cec3`。总计 4,042,573 B。
- `preview/index.html` 现在直接按顺序加载同级 `./jszip.min.js`、`./polyfill-45b9836beb.min.js`、`./xmind-sdk.bundle.js`、`./snowbrush-2c2b5d62b5.js`。`serve.mjs` 在监听本地端口前核验这四份文件的 SHA-256、Git Blob 和长度；不再下载 npm 包、复制旧快照或创建隐藏缓存；新增 `verify-assets.mjs` 核验 CLI，删除 `prepare-assets.mjs` 和原本仅忽略隐藏缓存的 `.gitignore`。
- 专项 CI 新增 `git ls-files --error-unmatch` 确认目标目录四件套已被 Git 真正跟踪，再直接对同一份实际文件进行负向篡改、HTTP 字节、真正 Chromium 绘图和交互验证。
- 这些是可见的**开发预览资源**，不意味着第三方版权许可/正式安装分发权利已经获得批准；现有 Program manifest 未声明四份正式资源，`installable:false`、`BLOCKED_GLOBAL_STYLE_RESIDUE` 和原有安全门槛均保持不变。

## R3 · 2026-10-15 · GitHub main 原生链增量修复与仍未解除的阻塞

本次先核对 `main` 中的真实 Page Program 链路：
`src/scripting/user-scripts/installed-programs.js` 已有
`verifyPageCandidate → makePageAvailable → installPageProgram → chrome.userScripts.register`
以及 `setInstalledPageEnabled`；`src/scripting/user-scripts/preview.js` 的已安装执行路径
通过 `chrome.userScripts.execute` 进入命名 USER_SCRIPT world；
但正式程序 `src/main.js` 在创建任何按钮前需要同一全局
`JSZip / Workbook / Topic / Dumper / _SB_.createWorkbookEditor`，
而正式资源合同只批准小体积 CSS/JSON/图片，不能承载 4,042,573 B
原始 XMind JS，也没有可信隔离文档。四份唯一真源已位于
`examples/programs/chatgpt-mindmap/preview/`，不得复制出第二份引擎或使用 CDN。

本轮直接补齐了**通用** Page Program 原生卸载缺口，不为 ChatGPT 新建框架：
`uninstallPageProgram` 在原 Broker 中复用 Host Authority、持久安装 CAS、
token 轮换、禁用状态及 Native `userScripts.unregister/getScripts`，
完全成功后才删除安装行；失败则留可重试的已禁用安装。
UI 需要显式确认并告知已打开页面仍需刷新；新增组件回归以验证
旧引导 token 不能重新运行、卸载必须以旧安装版本和 generation 为准、
Chrome API 失败不假装卸载成功。

**不能夸大当前成果：** 新增的卸载并不执行已存在 USER_SCRIPT
环境的即时 teardown；这涉及当前 `preview.executeInstalled` 创建的
世界、生命周期句柄及 BFCache 悬挂文档。已有受管 UI 的
`managed-ui-lifecycle.js` 仅应用于受管预览，未完整接线到安装
生命周期。真实 ChatGPT DOM 选择器、隔离文档双向消息、Snowbrush
`style#snowbrush_style` 残留、第三方 GSAP 3.5.1 与完整 Snowbrush
合并包生产许可仍处于 `BLOCKED/NOT_TESTED`。
不能仅因 `JSZip` 本身是 MIT/GPL 双许可或 XMind SDK 相关上游
有许可证，就推断合并 Snowbrush 的全部分发权利。
需取得对应锁定字节的第三方 NOTICE/许可证清单、合法来源和再分发授权，
并在真实 Chrome 通过独立文档隔离与退出清理后，才可谈
`RUNTIME_ADMITTED` / `CANDIDATE_VERIFIED` / `AVAILABLE` / `INSTALLED`。
当前预览历史 CI 仅可证明当时的预览代码，不证明本轮原生安装验收。

### R3 已验证 CI 结果（本节仅绑定实际新提交）

- R3 原生卸载提交：`17faf0db84c2ecfacf9b836bb615fb048e28cdf5`，
  后续 CI 命令/对话确认修正提交：
  `c5caac92f32aa2b5bf5c3af4056f7d9ec1012e58`。
- [GitHub Actions #38756274935](https://github.com/shopable-ai/opendesk-browser/actions/runs/38756274935)
  的 **Installed Page native lifecycle and UI regression**：`41/41 PASS`；
  **Real XMind adapter/source regression**：`17/17 PASS`；
  **原始四字节检查**、**Program 验证/确定性 Build** 均 PASS；
  **real-local-xmind-html** Job SUCCESS，仍是独立 HTML Chromium 而不是安装版。
- 同一运行的 `offline-source-contract` Job 因 `npm run check`
  FAIL，错误不在本轮改动路径：当前并行 SDK
  `src/framework/sdk/browser-schemas.js:56` 有截断的字符串/Schema，
  Node 报 `SyntaxError: Invalid or unexpected token`。
  此错误来自并行 SDK 工作流，未擅自覆盖其他 Agent 源码；必须由该工作流
  修复后重跑完整 `npm run check`。故 **整个 CI RUN 状态 FAIL**，
  不能仅据成功步骤宣称 CI 全绿。
- 当前证据的严格界限：`SOURCE_IMPLEMENTED=PASS`（**通用原生卸载**），
  `RUNTIME_ADMITTED=BLOCKED`、`REAL_CHROME_FUNCTIONAL=NOT_TESTED`
  （仅安装版）、`CANDIDATE_VERIFIED=NOT_TESTED`、
  `AVAILABLE=NOT_TESTED`、`INSTALLED=NOT_TESTED`、
  `CHATGPT_NATIVE_VERIFIED=NOT_TESTED`。

### R3 并行 SDK 修复后的完整专项验证

此前 `#38756274935` 曾因并行 SDK `browser-schemas.js:56` 语法损坏失败。并行 Agent 修复后，提交 `f4790e843467bd4a0dfc9c03163d4dc5c776c66d` 对应的 [GitHub Actions #38757685815](https://github.com/shopable-ai/opendesk-browser/actions/runs/38757685815) **两项 Job 均 SUCCESS**：原生 Page Program 生命周期和 UI `41/41 PASS`、XMind 源码 `17/17 PASS`、原始四文件、确定性 Build、`npm run check`、真实 Chromium 独立 HTML XMind 绘图。历史失败仅保留排障事实，当前正式程序仍无受信原始 XMind Runtime、正式安装和真实 ChatGPT 自动运行证据。
