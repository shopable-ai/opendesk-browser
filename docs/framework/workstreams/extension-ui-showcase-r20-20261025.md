# Extension UI Showcase R2.0 · 主分支最小增量记录

- 日期：2026-10-25
- 负责人：本对话 ChatGPT（仅 GitHub 已授权连接器，非用户 Mac/Codex）
- 初始 main：`20194961b30e769d608f2a1014bf2e77c640fdb3`（写入前复核目标文件）
- 状态：ACTIVE；本轮只对以下明确文件实施有限修改。
- 预期写入：`examples/sidebar-tools/prompt-shortcuts/preview/index.html`（旧详情三按钮消除漂移）；`prototypes/sidebar/extension-ui-showcase/index.html`（基于**已有生成的 React 预览**建立离线场景入口）。不改二套 React 根、不新增 Host/Installer/i18n。
- 只读核查：`examples/sidebar-tools/prompt-shortcuts/src/index.html`、`src/main.js`（正式详情已是两个操作，且运行时注入 Pencil/Copy SVG）；`src/ui/react/preview/locale-preview.js`、`src/ui/react/tabs/locale-manager.tsx`、`src/ui/react/tabs/tool-host.tsx`、`scripts/preview/build-sidebar-six-react-preview.mjs`（已有语言、工具设置、React 同源打包）。
- 合同/依赖：原有 `prototypes/sidebar/react-preview/index.html` 的单文件 React 产物与现有查询参数；不修改数据 Schema、权限、宿主行为、正式 Tool JSON、Chrome profile、dist、端口。
- 资源占用：无本地 watcher、Node 构建、Chrome/CFT、Native、共享输出/端口/数据库。GitHub 文件更新严格顺序执行，写前以目标 blob SHA 校验。
- 当前验收级别：`SOURCE_WIRED` 需提交后读回；Mac Chrome / 安装包 `NOT_TESTED`；无条件不宣称 95+ 正式验收。
- 完成检查：旧预览无 `detailBack` 按钮/事件，两个操作 SVG、窄屏布局与原有操作可点；Showcase 只有同源 React iframe，支持脱网相对路径、场景与 320/360/400/440/960/主题选择。
- 延后项目：若现有场景缺少新建编辑状态或更深层的翻译错误态，需在用户本机复用原 React 构建流程后定向扩展预览适配，不以独立假 React UI 伪装完成。

## 当前执行限制

当前 ChatGPT 环境不挂载 `/Users/shopme/Documents/workspace/opendesk-browser`，无法运行 `npm`、读取真实本机 `git status` 或用户 Chrome。只允许依 GitHub 当前文件 blob SHA 做远端范围内的安全最小变更。后续 Mac Codex 可按此记录衔接构建/验收。
