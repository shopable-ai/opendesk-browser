# OpenDesk Native Workspace · SVG 文件树与工具栏 R3

日期：2026-10-12。分支：仅 `main`。变更入口：`/native-agent/workspace.html?sourceId=…`。

## 已核查事实

用户观察到「文件树刷新 / 全部折叠 / ▾DIR」等旧 UI；然而在本轮读取的主分支，`src/native-agent/workspace-file-icons.js`、`workspace.js` 和 `workspace.html` 已具有本地 SVG 文件类型图标、WAI-ARIA tree、独立工具栏及图标按钮。旧 `DIR/MD/TXT` 并非当前主分支文件树的渲染设计。没有访问用户 Mac Chrome 的权限，**不能据此断言究竟是旧插件包、未重新构建、浏览器标签页尚未刷新或本地并行源码差异中的哪一种**。

真正的仓库源码是 `src/native-agent/workspace.html`；扩展路径 `native-agent/workspace.html` 在 WXT 编译阶段从源码复制到 `dist/<mode>/native-agent/workspace.html`。`settings.js` 是单独打包的固定 IIFE，必须与最新文件树 JS 一同更新。单纯修改源码不会自动替换 Chrome 已加载的旧包和已打开的旧网页实例。

## 本次有界源码改动

- 工作区头部「刷新连接」「本机连接设置」、工作区选择后的「侧栏」「返回工作台」、当前文件「重读」「复制」、本机应用「独立打开」均使用本地静态 SVG 图标按钮，有 `aria-label`、`title` 和键盘焦点；不引入图标字体/CDN/npm，也不从文件名构造 SVG。
- 目录栏在移动视口用 SVG chevron 代替「展开 / 收起」文字；目录项继续使用当前 `createWorkspaceFileIcon` 和 `createWorkspaceTreeChevron`。根目录与文件夹保留清楚的文本路径，不能用孤立图标替代文件名。
- 「保存」「丢弃草稿」仍保留可见的文字，并配有 SVG：涉及数据变更的操作不能只靠模糊图标。AI 审阅、预览模式和授权动作保留可辨认文字，避免误操作。
- 桌面图标控件 34px，粗指针控件 44px；复用现有 tokens、响应式、focus-visible 和 reduced-motion 合同。
- `workspace.html` 记录只读 UI 契约 `data-workspace-ui="svg-r3"` 与 `data-icon-system="local-svg"`。`verify-package.mjs` 同时核对 HTML R3 契约与实际打包的 `native-agent/settings.js` SVG 图标必要字符串，防止新 HTML 与旧 JS 组合通过验证。
- 补充 Workspace 结构测试和打包变异测试；保留既有文件树权限、按需刷新、草稿/写盘读回及 sourceId 绑定，不调整 Native 协议。

## Mac 当前界面生效与验收（在本地确认串行写入资源后）

1. 检查 `git status --short --branch`、`git rev-parse HEAD` 和 `git fetch origin main`，只在安全时 `git pull --ff-only origin main`；有并行改动或本地未提交文件不要覆盖。
2. 执行 `node --test tests/environment/workspace-file-icons.test.mjs tests/environment/workspace-file-tree.test.mjs tests/environment/workspace-integration.test.mjs tests/environment/workspace-style.test.mjs`；之后 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`，并执行 `node --test tests/environment/package.test.mjs`。
3. 到 `chrome://extensions` 检查 **实际安装路径与扩展 ID**，确认加载的是新 `dist/development`（或受控 production），点击该扩展「重新加载」，关闭已打开的旧 Workspace 标签页，再由当前 Side Panel 打开同一授权工作区（保留原 sourceId 语义）。
4. 在已加载的 Workspace DevTools Console 检查 `document.querySelector('#file-workspace')?.dataset.workspaceUi === 'svg-r3'`、`document.querySelector('#file-list')?.dataset.iconSystem === 'local-svg'`；Native 已授权并读取目录后检查 `document.querySelector('#file-list .file-icon')?.tagName.toLowerCase() === 'svg'`。若失败，先对照实际扩展 ID、安装目录、运行包 SHA 和 Network 中 `workspace.html / workspace.css / settings.js`，不能直接认定代码丢失。
5. 逐项验证文件树展开/全部折叠/刷新、文件选中、重读/复制/保存/丢弃及权限错误，360/390/768/1024/1280/1440px、125%/200% 缩放、深色偏好、Tab/Enter/Space/箭头键、tooltip 和焦点，留真实截图；Native 保存冲突和未授权不允许借组件证据假称通过。

## 验收与评分边界

本次远端编辑无法读取用户 Mac 的未提交工作区，也无法调用本机 Chrome 或执行依赖完整仓库的 npm 测试。远端主分支的静态源码检查与变更代码审阅不等于完整构建或浏览器验收；实时结果按实际记录，未运行的测试继续为 `NOT_TESTED`。

每项独立目标 ≥95/100：文件图标辨识、操作效率、布局密度、响应式与缩放、无障碍、权限隔离、安全构建和代码可维护性。只有当前构建身份的定向测试 + 真实 Mac Chrome/Native 原始证据满足对应条件，才可标记 `PASS/≥95`；当前不自评 95 分。
