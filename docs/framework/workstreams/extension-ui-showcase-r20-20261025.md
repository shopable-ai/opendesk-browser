# Extension UI Showcase R2.0 · 主分支最小增量记录

- 日期：2026-10-25
- 负责人：本对话 ChatGPT（仅 GitHub 已授权连接器，非用户 Mac/Codex）
- 初始 main：`20194961b30e769d608f2a1014bf2e77c640fdb3`（写入前复核目标文件）
- 状态：RELEASED（远端源码与预览入口已提交；真实构建/Chrome 仍待本地验收）。
- 预期写入：`examples/sidebar-tools/prompt-shortcuts/preview/index.html`（旧详情三按钮消除漂移）；`prototypes/sidebar/extension-ui-showcase/index.html`（基于**已有生成的 React 预览**建立离线场景入口）。不改二套 React 根、不新增 Host/Installer/i18n。
- 只读核查：`examples/sidebar-tools/prompt-shortcuts/src/index.html`、`src/main.js`（正式详情已是两个操作，且运行时注入 Pencil/Copy SVG）；`src/ui/react/preview/locale-preview.js`、`src/ui/react/tabs/locale-manager.tsx`、`src/ui/react/tabs/tool-host.tsx`、`scripts/preview/build-sidebar-six-react-preview.mjs`（已有语言、工具设置、React 同源打包）。
- 合同/依赖：原有 `prototypes/sidebar/react-preview/index.html` 的单文件 React 产物与现有查询参数；不修改数据 Schema、权限、宿主行为、正式 Tool JSON、Chrome profile、dist、端口。
- 资源占用：无本地 watcher、Node 构建、Chrome/CFT、Native、共享输出/端口/数据库。GitHub 文件更新严格顺序执行，写前以目标 blob SHA 校验。
- 当前验收级别：远端文件 `SOURCE_WIRED` + 静态读回检查；Node/Chromium/Mac Chrome `NOT_TESTED`，正式包 `STALE`；不宣称 95+ 正式验收。
- 完成检查：旧预览无 `detailBack` 按钮/事件，两个操作 SVG、窄屏布局与原有操作可点；Showcase 只有同源 React iframe，支持脱网相对路径、场景与 320/360/400/440/960/主题选择。
- 延后项目：若现有场景缺少新建编辑状态或更深层的翻译错误态，需在用户本机复用原 React 构建流程后定向扩展预览适配，不以独立假 React UI 伪装完成。

## 当前执行限制

当前 ChatGPT 环境不挂载 `/Users/shopme/Documents/workspace/opendesk-browser`，无法运行 `npm`、读取真实本机 `git status` 或用户 Chrome。只允许依 GitHub 当前文件 blob SHA 做远端范围内的安全最小变更。后续 Mac Codex 可按此记录衔接构建/验收。

## 本轮实际读回结果（2026-10-25）

- `be8ceaeab9bd25818f87cd9fdc2d912c13e4f5b2`：旧 Prompt Shortcuts 预览删去 `detailBack`/监听，两个按钮拥有 Pencil/Copy SVG 及紧凑一致 CSS。远端重读后确认无 `detailBack`，Edit/Copy 各一。
- `95cd23c9be3f2923f13686315c83da2db2c22c34`：新增 `prototypes/sidebar/extension-ui-showcase/index.html`，相对路径引用原 1.27 MB React 离线产物；七场景与 320/360/400/440px、主题选择。960px **仅外层画布**，内层生成器最高 520px，不能判 960 React PASS。
- 正式 `src/index.html` 已只有 `ps-detail-edit` 和 `ps-detail-copy`，`src/main.js` 已注入 `icon('pencil')`、`icon('copy')`。因此没有多余重写业务。
- 发现 **未完成 P0**：`tool.config.json` 为 1.1.19；`prompt-shortcuts.opendesk-tool.json` 仍为 1.1.18，且 `html` 包含旧 `ps-detail-back`。不可通过仅修改 React/旧预览认定安装包修复。
- 真实 macOS `git status`、既有 watcher、Node 构建、权限与数据保留、Chromium、Mac Chrome 安装未在此环境执行，均 `NOT_TESTED`。
- React 组件画廊、故障状态全面演示和 960px 内部响应式仍为 `INCOMPLETE`；`LocaleManager`、本地化服务及 Reading TOC 示例是已存在能力，不计为本轮新完成。

## 下一位本机 Codex 的唯一 P0 操作

1. 在真实工作目录 `main` 复核此远端提交与未提交差异；先运行 `npm run app:update -- prompt-shortcuts --check`，应能识别新版候选。随后 `npm run app:update -- prompt-shortcuts` 调用原打包→测试→晋升；必要时只补受影响的 Prompt Shortcuts 专项测试，不使用手工 JSON、强推、分支/Worktree/PR。
2. 读回正式包版本、`html` 中的 `ps-detail-edit` / `ps-detail-copy` 及 Pencil/Copy `js`，`--check-project` 严格通过后再给用户实际安装升级验证路径。
3. 真实打开 `prototypes/sidebar/extension-ui-showcase/index.html`，检查 React iframe 能否在 file:// 离线载入；补齐 960 内页尺寸与组件/错误画廊时必须扩展原 `scripts/preview/build-sidebar-six-react-preview.mjs` 并重建原产物，不复制 JSX 或用假按钮模拟保存成功。
4. 按变更功能录入真实状态：成功项用实际回执；缺少 Chrome、包、截图或源码身份时写 `NOT_TESTED`。不要复测他人已证明且输入未变的范围。
