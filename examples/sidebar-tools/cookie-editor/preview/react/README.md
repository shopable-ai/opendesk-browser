# Cookie Editor R5.2.2 · React 19 完整编辑器 · 用户审阅候选

**归属：** `examples/sidebar-tools/cookie-editor/preview/react/`。
**阶段：** R5.2.2 React 19 完整预览已经通过同一候选 26/26 Chromium 验收，生成 HTML 已经安全晋升 `main`；仍待用户最终视觉审阅和明确批准。正式 Cookie Editor 2.0.23 / SDK / Host / 安装包未迁移。
**保护：** 只在预览目录内修改。正式 `src/{index.html,style.css,main.js}`、`tool.config.json`、安装包、Host/SDK、R4.3 原版及 `preview/index.html` 均不随本候选自动覆盖。

## 已确认的交互合同

- 当前网站 → 连续紧凑 Cookie 列表 → 点击行在原处打开唯一编辑器；列表 Name / Domain / Path 为主要信息，高级属性折叠。
- Name 与 Value 以及高级字段为**左侧标签 / 右侧控件**，Value 右侧显示/隐藏图标与输入框中心线对齐（Chromium 320/384/520px 中心误差均为 0 CSS px）。
- 真正修改才标记 dirty，恢复原值变回 clean；无修改立即取消，有修改时行内放弃确认。保存失败保留草稿、切换/搜索不静默丢数据。
- Cookie 工具栏常显导入、导出、新建，并用分隔线区分安全清理本站；导入选择文件或粘贴 → 自动识别 → 预览新增/覆盖 → 确认。
- 导出选择 JSON（默认）、Cookie Header 或 Netscape；**JSON 默认包含可读取的 Cookie 值**，用于实际备份。“包含值”与格式位于同一紧凑行，可显式关闭后仅备份属性。
- 导出操作区只有 **「复制」「下载」** 两个主要按钮；涉及敏感值的操作要单独的值读取能力与*操作前*就地确认，不能因为默认选中而静默导出。
- 非 JSON 格式有属性信息损失；不支持 PartitionKey 无损保存的格式必须阻断或让用户明确选择跳过分区数据，绝不静默丢失。
- 所有 Cookie 与权限场景均是纯内存虚构测试，**不得把演示场景/模拟授权与 mock 行为打进正式工具包**。

## 源码与可独立打开的 HTML

- `src/App.jsx`：唯一交互状态与 UI 事件源码；`src/style.css`：本工具局部样式；`src/main.jsx`：React 根节点。
- `npm install --ignore-scripts --no-audit --no-fund && npm run build`：通过现有 Vite / React 19 构建 `index.html`，可离线、`file://` 打开，运行时不需要网络或 CDN。
- `npm run check`：验证 HTML 与本次源码产物完全一致；`npm run test:chromium`：在**真实构建后的 HTML** 上测试原位编辑、dirty、导入、默认含值导出、权限、缩放、显隐按钮中心对齐。
- `.github/workflows/cookie-editor-r49-react-preview.yml`：源码提交后，由 CI 真正安装、构建、跑 Chromium；**只有 CI 成功才允许晋升生成的 React 19 HTML / 截图**，禁止提交本地 React16 测试兼容构建冒充 React19 产物。

## 发布前业务迁移注意

正式 Cookie Editor 当前仍是 `tool.config.json` 声明的原生 JS Sandbox 工具；是否直接迁 React，要先对照 220,000 JS UTF-16 单元和 320,000 JSON UTF-8 字节上限，以及当前 R33.1 共享 React UI 的真实实现状态。**R33.1 五个可信 Tab 的 React 重构，并不意味着独立 Cookie Tool 自动成为可信 React UI。**

迁移 UI 时必须保留原有 `OpenDeskSDK.browser.cookies.*` / `OpenDeskSDK.browser.clipboard.writeText` / `OpenDeskSDK.browser.downloads.text`、可信 Host 网站/值权限、精确身份、Store/Partition、Name 重命名安全、撤权清理、异步 Epoch、未知结果不自动重试、导入冲突与原位升级合同。请只把真实逻辑接到已经确认的界面；不要复制 preview mock 业务。

## 已验证与待验

- **LOCAL_SCOPED PASS**：本地 Chromium 8 组旧交互回归 + 3 种宽度 Value 图标中心线测量、页面无横向溢出。验证入口为相同 JSX 的 React16 测试兼容层，**不是 React 19 的正式构建或原生安装证据**。
- **REACT19_BUILD / CI：PASS（2026-10-18）**：源码候选 `b7696352268662c4239220dba86c04b97fa2e011` 的 [CI 39054270031](https://github.com/shopable-ai/opendesk-browser/actions/runs/39054270031) 完整执行 26/26 Chromium PASS、Vite Build PASS、HTML `--check` PASS；自动晋升提交 `0af66c8a4c3e9b3d043056b6f1d397a9efb17c9c`。`index.html` 350,463 bytes，SHA256 `a8ed019ac42dd31c7ada46c02f5ea487fc3f10678554d61e87ef91e06309790d`（已从仓库重新读取并独立校验）。
- **CHROME_NATIVE / 视觉批准：NOT_TESTED / 待用户审阅。** 上述成功仅限 Linux Chrome for Testing、虚构内存数据和 `file://` React 预览。真实 Mac Chrome 侧边栏/Chrome Cookie SDK、OS 级浏览器页面缩放及最终中文字体视觉审阅不得冒充 PASS。独立九维 95+ 仍是目标，不是自动化用例数量可以证明的分数。

## R4.10.3 · 首次授权自动隐藏（仅原型）

- 首次无权限时显示简洁的「允许访问本站 Cookie」引导；模拟授权请求期间按钮禁用，防止重复操作。
- 模拟请求成功后，**直接卸载整个授权区域**，回到 Cookie 搜索/列表；成功提示约 2.4 秒自动消失，网站栏不常驻「已授权」标签。
- 后续权限管理折叠到网站栏右上角 **···**；本原型可模拟撤销后重新出现授权入口。授权取消/拒绝/请求失败时，引导区必须留在原位并允许重试；读取中与无 Cookie 不得误判为未授权。
- 场景选择器新增「授权被拒绝」「授权请求失败」，真实 Chromium 回归覆盖失败→重试成功→无常驻授权卡片→撤销→重新授权以及空列表。
- **严格限定：** 所有授权行为均为页面内存模拟，不操作 Chrome 权限、真实 Cookie、SDK、Host 或存储。正式迁移必须调用可信 Host 授权，并**重新查询权限有效性**后才能隐藏引导；每次打开/网站变更/撤权需以真实网站和授权范围为准，撤权时及时清除已加载的敏感 Cookie 数据。不能以本预览状态作为权限事实。
- R4.9.2 已确认的列表/原位编辑/导入导出/敏感操作确认布局保持不变；正式扩展仍需用户另行确认后迁移。

## 浏览器 Side Panel 宽度与无需构建的预览（2026-10-17）

- **审核宽度：** React 预览的实验台与 Cookie 面板最大宽度从 520px 调整为 **380 CSS px**；在大屏浏览器中也不会拉宽。浏览器窗口变窄时仍按可用宽度收缩；360 / 380 / 420px 用于检查不同侧栏宽度下的排版，不代表所有 Chrome 都有固定宽度。
- **首选独立预览：** `examples/sidebar-tools/cookie-editor/preview/react/index.html`。这是包含 React 19、JavaScript、CSS 的**已构建、单文件、可离线运行的 HTML**。审阅人员直接双击或 `file://` 打开即可，不需要 Node、npm、Vite、CDN，也不需要安装 OpenDesk 扩展。其内容为内存模拟，不能操作真实 Cookie。
- **历史确认快照：** `examples/sidebar-tools/cookie-editor/preview/cookie-editor-r4.9.2-approved.html` 同步收窄为 380px，但它使用 React 16 兼容运行时；仅作 R4.9.2 设计对照，不应代替最新 React 19 预览。
- **修改与发布约束：** 唯一交互源码在 `react/src/`。只有开发者修改源码后才需要在 `preview/react/` 执行 `npm ci --ignore-scripts --no-audit --no-fund && npm run build && npm run check && npm run test:chromium`，将通过检查的 `react/index.html` 连同源码提交。**不得只修改编译产物而不更新源码**，也不得把本地 React 16 测试产物覆盖 React 19 产物。
- **自动验收：** `chromium.mjs` 增加桌面 1280px 浏览器打开单文件 HTML 时的 Cookie 面板 380px 宽度及控制台区域宽度检查；仍沿用 320 / 360 / 384 / 420 / 520px、缩放和交互回归。真实 Chrome 安装及 Cookie Host 功能需另行验收，不能用此预览代替。
- **不修改正式业务：** 本次仅收敛预览 CSS、更新生成的 React 19 HTML 和测试文档，不触碰正式 `cookie-editor/src/`、JSON 安装包、SDK 或 Host。



## R5.1 清理入口可发现性（UI 候选）

- 唯一共享 React JSX 的 Cookie 工具栏将 `安全清理本站 Cookie` 垃圾桶按钮常显在导入↑、导出↓、新建＋后面，并以细分隔线区分破坏性操作。宿主 Header 的卸载垃圾桶不变。
- 预览单击只打开带预期数量/范围的行内确认，取消不改数据；确认仅在内存中模拟 Store 0/非分区/Host-only 清理，父域、其他分区、其他 Store 和其他网站排除，且最多 50 条。真实功能仍由正式 2.0.23 `cookies.clearSite` / Host 的预检、用户确认及 Native 回读保证；不把它宣传成不受限的“删除所有 Cookie”。
- 底部折叠仅保留低频变化观察，不再隐藏或重复展示清理入口。目标 Chromium 回归包括 320–520px 无溢出、可见清理入口、单击不删除、取消无副作用、明确确认后范围匹配。尚未晋升正式 SDK/安装包，不冒称 Mac Chrome 已验收。

## R5.2 · 完整高级属性和 Session 日期编辑（React 预览）

保留既有共享 React 19 JSX 与单一 Root；当前源码修复高级属性、安全校验、Unix 秒与本地 datetime-local 的双向转换，以及 Session 往返的 dirty 判定。Store ID、PartitionKey 与既有 Domain/Path/Host-only 只读；新建只支持当前 SDK 认可的精确主机范围。Cookie 空值与保留旧值区分；改名明确显示正式业务两步处理及未知结果风险。

预览宿主 Header 只展示交互，绝不执行真实卸载、Chrome Cookie 或 SDK 调用；安全清理仍受 Store 0、Host-only、非分区与单次上限约束。导出格式与“包含值”同一行。只有本次构建后精确 HTML 的 Chromium 回归通过才能标记 PASS。

## R5.2.1 · 完整编辑体验收敛（仅 React 19 预览）

- 基础名称/值校验只聚焦错误字段，不无故展开高级面板；输入组件补充 `aria-invalid` 与 `aria-describedby`。新建取消或放弃草稿后，键盘焦点恢复到真正的新建按钮。
- 模拟保存结果未知时禁用精确删除直到刷新核对；正式身份校验不可只靠预览保证，预览确认删除前也重新比对目标身份。
- Netscape 持久 Cookie 导入按 Unix 秒读取，转换为本地编辑时间并检验有效范围；保存、重新编辑、导出保留时间，不再把本地日期误读为 UTC。
- R5.2.2 已修复 `requestAnimationFrame` 延迟焦点导致搜索字符串进入未保存名称草稿的问题；改为 React `useLayoutEffect` 同步执行焦点恢复，补充草稿与筛选双向保护断言。另收紧未知结果提示的 Playwright 定位，并使用规范化 `datetime-local` 输入进行 Unix 秒往返验证。最终 26/26 PASS；正式 2.0.23、SDK、Host、安装包以及 Mac Chrome 未改动。

## R5.2.2 · 交付边界与审阅注意

- 一律复用 `src/App.jsx`、`src/style.css` 和 `src/ui/react/cookie-editor/CookieEditorView.jsx`，没有单独的缩减版 Mock；离线 HTML 内嵌 React 19 与样式，CSP 禁止网络。
- 26 组真实 Chromium 用例覆盖 320/360/380/420/520px、CSS Zoom、深色、焦点、dirty、Session 和 Netscape 秒级日期；**CSS Zoom 不等于真实 Chrome 浏览器页面缩放**。
- Linux 截图机器需要 CJK 字体才可审阅中文，因此工作流单独安装 `fonts-noto-cjk`，不将字体打入 HTML 或正式工具包。
- 当前 React bundle 为 **233,817 JS UTF-16 单元**，超出正式 Tool **220,000** 单元预算；本轮仅预览不阻止晋升。R5.3 必须先评估同一现有构建的体积与正式 Host/SDK 接入，不可直接宣称已可打包迁移。
- `file://` 手工审阅仍需用户在 Mac 本地拉取最新 `main` 并打开本目录的 `index.html`，未经明确批准不迁移正式产品。
