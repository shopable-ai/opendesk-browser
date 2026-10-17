# Bookmark Manager R3.0.6 · 固定可信 React UI 非发布试点（2026-10-17）

> 状态：**SOURCE_INTEGRATED / TEST_PENDING**。本记录仅说明真实写入的源码。
> 未经 `preview:chrome`、正式 WXT Build、负向安全测试和 Mac 原生安装验证，
> 绝不将代码存在等同于 `TRUSTED_PILOT_READY`、`MIGRATION_READY` 或 UX 95 分。

## 已实施（不等于测试通过）

- 官方身份入口：`src/ui/trusted-bookmark-admission.js`。固定 `bookmark-manager`、
  官方 `0.3.8`、可信 React 组件 `R3.0.6`，要求安装完整包、官方发行 SHA-256、
  独立来源记录、启用状态及安装/撤权 epoch 全部吻合；错误安全拒绝。
- 仅开发者可显式选择：`debugEnabled` 且固定 `ui/tool.html` URL 含
  `bookmarkReactPilot=1`。普通 Side Panel、用户导入、AI 生成和市场工具
  仍沿用 opaque-origin iframe，可信身份不由工具包文字/脚本自主声明。
- `src/ui/react/main.tsx` 使用现有唯一 `createRoot` 的 React Portal，
  静态导入已经审核的 Bookmark Model/Service、唯一 `App.jsx`。
  不创建第二个 Host、SDK、安装器、组件库或 React Root。
- `src/ui/sidebar-tools.js` 的私有 Symbol 仅在本地固定 UI 的调用闭包可见；
  SDK `capabilities.*`、`bookmarks.*`、`page.getContext` 仍经过原始
  `dispatch` / 安装身份和代际校验 / 正式 Browser Host / 危险操作确认。
  不能从 iframe 消息伪造 Symbol。
- React App 接受 SDK/Service Adapter，维护读写前核对、写后回读、结果未知保护；
  可信模式启动/读取/终止限时书签监听，必要时丢弃敏感树缓存；
  绑定“收藏当前页”的 TabRef、DocumentRef、URL；保存设置同步给原 Host 的未保存保护。
- Chrome bookmarks 权限撤销、工具停用/卸载、安装代际变化、官方来源变化等路径
  关闭可信视图。页面关闭时 React 卸载并尝试终止观察会话。
- 预览保持唯一 `App.jsx`，CSS 限定 `.bm-app`，预览两个入口自己加载同一个 CSS；
  `preview/dev.html` 自动生成且被精确忽略；
  `preview/index.html` 仍是之前批准的提交版本，本轮未以未测候选覆盖。
  `preview/react/.opendesk-preview/` 不再是候选 HTML 目标。
- WXT Vite 配置去重 `react` / `react-dom` 模块解析，沿用 React 19.2.0。
  不放宽 CSP、权限、脚本执行或动态工具包大小限制。

## 如何开启 / 定向验证

1. 在具有调试功能的开发版 Chrome，以本扩展自己的
   `ui/tool.html?hostInstanceId=<实际 UUID>&bookmarkReactPilot=1`
   打开可信工具 Host（`hostInstanceId` 必须是真实、已登记的值，
   不可复制示例占位符）；必须具备官方、已安装且启用的 0.3.8 包和匹配发行目录/来源。
2. 在扩展 Side Panel 中主动打开“书签管理”；仅身份校验成功时使用现有 React Root。
   失败应退回正常 iframe 或安全拒绝，不得从安装包执行 JSX。
3. Preview：在
   `examples/sidebar-tools/bookmark-manager/preview/react/` 运行
   `npm run preview:watch`，访问邻近的 `../dev.html`；
   同目录执行 `npm run preview:build`、`npm run preview:check`、
   `npm run preview:chrome`。保留旧版 `../index.html` 直到真实 Chrome 验证通过。
4. 定向 Node 测试：
   `node --test tests/environment/bookmark-manager-r306-trusted-react.test.mjs tests/environment/bookmark-manager-r24-lifecycle.test.mjs`。
   固定 WXT Build 和 `scripts/verify-package.mjs` 在已有标准环境执行。
5. 在隔离 Chrome Profile/测试 Fixture 复核 2,159+ 节点、130+ 文件夹，
   360/400/960px、保存/编辑/删除/撤权/跨窗口事件；禁止操作用户真实书签。
   真实 Mac Chrome 是另一项独立门槛，不以 CI Chromium/Mock 代替。

## 包预算：现行权威，不自动扩容

| 项 | 当前限制或状态 |
| --- | --- |
| 单个动态 Sidebar Tool JS | 编译 JS UTF-8 220,000 bytes（构建器）；Schema 字符限制也为 220,000 |
| 单个完整 Sidebar Tool 包 | 320,000 UTF-8 bytes |
| 允许安装工具数量 | 12 |
| 宿主 `ui/tool-shell.js` | 生产硬门槛 1 MiB；640 KiB 为审阅线 |
| Browser SDK 请求 | 常规参数 12,000 bytes（某些接口有专用上限）；Host 继续分页/限流 |
| 256,000 JS / 512,000 包候选 | **未批准启用**：需要 Schema/安装/Host/存储/更新峰值的共同实测 |

本次先减少重复 React Runtime，不扩大动态包。构建后需要记录
`ui/tool-shell.js` 的实际增量、压缩产物、CSS 输出、固定 CSP 校验、
扩展总量，以及 12 工具与更新峰值的本地 `chrome.storage.local` 容量证据。

## 当前证据状态与反方审查

| 独立维度 | 当前情况 | 95+ 验收 |
| --- | --- | --- |
| 架构 | 单 Root/静态 JSX 代码路径存在；与 Cookie 并行试点共存 | NOT_SCORED（需 WXT 构建与实际挂载） |
| Browser 安全 | 哈希/安装来源/epoch 校验及原 Host 分发存在 | NOT_SCORED（需正反身份和恶意包实验） |
| SDK/业务 | Full Bookmarks、Tab/Document、写后回读在同 Service 中 | NOT_SCORED（需原生 CRUD） |
| React 生命周期 | Portal 卸载和异步观察释放在源码中 | NOT_SCORED（需挂载/撤销竞态） |
| 产品 UX | 保留 R3.0.5 JSX，未重做布局 | NOT_SCORED（需 360/400/960 实测） |
| 性能 | 虚拟行等既有实现保留 | NOT_SCORED（需 2,159+ 节点数据） |
| 容量 | 原正式包上限未修改 | NOT_SCORED（需真实生产 Bundle 与峰值） |
| 无障碍 | 原按键操作/ARIA 逻辑未删除 | NOT_SCORED（需键盘/焦点测试） |
| 异常恢复 | 重复点击、未知结果和撤权处理已接线 | NOT_SCORED（需真实注入异常） |
| CI/发布 | 新增定向测试合同；正式包/版本未更新 | NOT_SCORED（需 CI PASS 与 Mac Native） |

**未批准 R3.1**：不得替换正式 `src/main.js` 和已安装工具的沙箱 UI；
不得更新工具包或版本，不得将动态工具升格为可信代码。
待以上独立门槛均有可信证据且各项 ≥95/100，再呈交正式迁移批准清单。

## R3.0.8 网址直接点击 · UI 认可的小范围补丁（2026-10-17）

- 设计意图：书签详情内**直接点击整段网址**打开新标签页，外链小图标跟随网址；详情底部只保留复制与编辑，删除重复的“小按钮打开”。
- 正式共享 JSX：`preview/react/src/App.jsx` 的 `Inspector` 渲染原生 `<a target="_blank" rel="noopener noreferrer">`，由 `safeBookmarkHref` 仅允许不含凭据的 HTTP(S)，旧书签里的其他协议保留只读文本，不允许在可信 UI 中导航执行。
- 样式：`preview/react/src/style.css` 提升整个网址的点击/键盘聚焦区域，窄屏允许完整换行；保留 R3.0.7 360/400px 12px 四周间距底部浮动卡片和 960px 右侧详情，不重排书签树。
- 定向静态/URL 协议测试：`tests/environment/bookmark-manager-r308-clickable-detail-url.test.mjs`（是否 PASS 应以对应 Commit 的真实 Node/CI 记录为准）。
- 纯演示 HTML 在当前聊天中创建，不是可复用的正式 JSX 源码或通过 Chromium 的发行产物；`preview/index.html` 未晋升，`preview/dev.html` 仍为被 Git 忽略的构建候选。
- **仍未发布**：原正式 `examples/sidebar-tools/bookmark-manager/src/main.js`、工具版本 `0.3.8`、官方 Catalog、可安装 JSON 未被替换。下一轮先验证 R3.0.8 同源 React 预览和真实原生 SDK 行为，再明确实施范围与批准门槛。


## R3.1 正式可信 React 非发布候选实测（2026-10-17）

> **SOURCE_BUILD_PASS / REACT_MOCK_CHROMIUM_PASS / NATIVE_NOT_TESTED / RELEASE_BLOCKED**。
> 所有 PASS 均归属于下方明确的 CI SHA；不将 Mock Fixture 当作正式安装验证。
> 未修改工具版本、正式包的源文件、安装 Catalog，也未将 React 预览晋升到 `preview/index.html`。

### 实际实施和修复

- 复用 `src/ui/react/main.tsx` 的既有单 React Root/Portal 和原 Host SDK Dispatcher；
  `App.jsx` 是 React UI 的唯一来源。依然由开发者 URL `bookmarkReactPilot=1`
  显式启用且经过官方发行身份和撤权 epoch 准入；普通正式工具仍使用 opaque iframe。
- 调整可信书签观察为 **watchStart → 完整树快照 → watchRead**，观察会话重建时也强制
  新快照；`E_BOOKMARK_EVENT_GAP` 丢弃过期树、重新观察。异步关闭后停止观察。
  自动跨窗口变更重读不会清除写入结果未知标志；用户显式刷新并成功读回才能解除。
- 构建安全门禁在首次正式构建失败后，未对 `examples/` 设通配例外。
  `scripts/bundle-provenance.mjs` 对指定 `ui/tool-shell.js` 的四个第一方输入
  （`src/model.js`、`src/service.js`、唯一 `App.jsx`、`style.css`）
  使用精确 Git Blob SHA-1 固定、符号链接拒绝，来源发生变化需要重新审阅。
  动态安装包 JS/JSX 仍不能进入可信 JS 构建。
- React 中 Cookie/Bookmark 试点局部 CSS 使用 `?raw` 并随既有 React Root
  输出单一受作用域约束的样式节点，避免 Vite 生成未经固定产物表登记的根级
  `tool-shell.css`。不改变其他工具样式，不提高工具包限制或关闭 CSP。
- R3.0.7 窄屏 12px 悬浮详情、宽屏非模态右侧详情及 R3.0.8 原生可点击 HTTP(S)
  URL 保持原有 JSX；未新建第二个业务 UI。

### 可复核的真实门禁证据

- 正式主线源码提交依次为
  `b5539418ff2b1e413b6278f4d7dbd9ea10cacdb2`、
  `a2e25bcd0a117c965998fc25f5cf2c4f0158fd55`、
  `62ef4881ff0cee403b7d4bdd3d41beec1148761f`、
  `f1e6edd6702888de0eceab6f6a75f9b77debe5e7`。
- **成功 CI**：https://github.com/shopable-ai/opendesk-browser/actions/runs/39042573072
  （head `f1e6edd6702888de0eceab6f6a75f9b77debe5e7`）。
  `trusted-source-build`：Node 30/30 PASS、`npm run check` PASS、
  `npm run build` PASS、`scripts/verify-package.mjs dist/production` PASS。
  `react-chromium`：JSX 构建、候选一致性、独立预算报告、真实 Chromium
  360/400/960px Fixture 交互 PASS；安装 CJK 字体后已保存可读截图。
- **生产 `ui/tool-shell.js`**：900,994 bytes；
  SHA-256 `a49b7e000f736734cb3b88725ab3cdfe95deb52c38cec1059f206d11892ae241`；
  1,048,576 bytes 硬门槛 PASS；余量 147,582 bytes；利用率 85.93%，
  **超出 655,360 bytes 的非阻断审阅线**（`requiresSizeReview=true`）。
  生产包总量 4,988,922 bytes；Bundle 全部固定 JS 合计 3,571,183 bytes。
  实际增量尚无同环境的迁移前基线，不能用过时的旧构建记录直接相减。
- `manifest.json` 特权页面 CSP `script-src 'self'; object-src 'self'`；
  正式包校验 `privilegedDynamicExecutionFound=false`。
  `ui/tool-shell.js` 的模块图包含四个精确审核的 Bookmark 文件及复用的 React npm
  模块；没有独立工具 React Runtime 安装。
- 已构建但**未晋升**的官方 Classic Bookmark Manager 工具包：
  `0.3.8`、86,736 bytes、
  SHA-256 `0d018dc9fdf46fe8380e25cf0089de7ee746ede63b832b9fa9a53047b32d9c76`。
- 独立 JSX 离线交互 HTML：`preview/dev.html`，521,905 bytes，
  SHA-256 `eef03b3c0d6a08327b911f887075264a9183b846c1217c21d8c86e71f77b2dc7`，
  `mock=true`、`nativeVerified=false`、`sourceBound=false`；
  同一个 `App.jsx`，但宿主数据与 SDK 是隔离 Fixture。
  独立 React IIFE 为 225,001 bytes，超过动态工具 220,000 bytes 限制：
  `BUDGET_BLOCKED`，不得安装，更不得通过提高包限额掩盖。
  预览采用离线专用打包，不代表正式 Host 又打入一份独立 Runtime。

### 未完成且禁止视为 PASS

1. 开发版 Mac Chrome 的真实安装 Profile：Book­mark Manager 已安装、Full Bookmarks
   授权、撤权、原生分页、跨窗口变化、危险删除票据、原始 TabRef/DocumentRef、
   修改/更新/停用/卸载以及 Host 临界竞态。均 **NOT_TESTED**。
2. URL 锚点的浏览器原生新标签页创建/打开事件及焦点去向尚未在正式 Host
   中验证；已验证的仅为实际 Chromium 中的锚点结构、HTTP(S) 约束与可点击区域。
3. Cookie/Bookmark 与其余动态 iframe 共存的**真实安装操作**，以及端到端
   旧版沙箱合法用户体验、较大书签数据下的稳定性与内存峰值。**NOT_TESTED**。
4. 10 个维度的独立产品专家 ≥95 分未取得真实端到端证据，全部保留
   `NOT_SCORED`，不以单次 Mock 浏览器通过替代独立评分。

**结论**：批准继续在非发布可信 React 候选上做开发版 Native 端到端验收；
**不批准正式版本升级、安装包替换、Catalog 修改或发布**。


## R3.2 · 正式应用 JSX 源码迁移（非发布候选）

- 可信 App 与样式唯一可维护源移至 `examples/sidebar-tools/bookmark-manager/src/react/{App.jsx,style.css}`；预览入口只引用正式源码，不保留第二份 JSX/CSS。生产 `src/ui/react/main.tsx` 保留唯一 React Root、Portal、静态 Bookmark Model/Service、原 Host Admission。
- 保存期间禁止编辑名称、网址和目标文件夹，阻止另起写操作；不改变 R3.0.7/3.0.8 已批准的悬浮详情及 HTTP(S) 网址链接。
- `preview/dev.html` 仍是 Mock 数据离线候选；`preview/index.html`、0.3.8 正式包、Catalog、Classic `src/{index.html,main.js,model.js,service.js}` 不晋升或替换。新提交的 Chrome 原生授权/撤权、真实新标签打开和 Mac 安装均需独立测试，无证据标为 `NOT_TESTED`。
- **包预算决策**：本候选运行于固定 WXT Host，而非将 React IIFE 作为动态 Sidebar Tool 安装。225,001-byte 离线 IIFE 超旧 220,000 限制不等于正式可信包超限。本轮保留动态工具 JS 220,000 bytes、完整包 320,000 bytes；768 KiB JS / 1 MiB 包预算仅在确有新动态工具需求时再统一调整及边界测试，不进行无证据平台放宽。`ui/tool-shell.js` 的 1 MiB 硬门槛保持不变。
- 新增定向 Mock Service 回归用于证明 Full SDK Consumer 逻辑、100 条游标分页、2,292 节点/130 文件夹、CRUD/观察/撤权拒绝；不是 Chrome 原生书签 API PASS。新候选 Bundle bytes、SHA-256、CI 与 Chromium 结果必须以当前 HEAD 的实测证据为准。
