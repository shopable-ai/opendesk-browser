# React Sidebar R35.2 — 已验收边界与五 Tab 所有权清单（2026-10-18）

> **PARTIAL / NOT RELEASED / NOT 95+**。这是从真实 `main` 源码和实际 CI 核对的工作记录，不能据此声明五 Tab 已完全 React 化。并行 Agent 可能继续修改相同工作区；后续执行必须重新核对 `main` SHA。

## 已实际落地

- 保留 R35.1 的单 `createRoot` 正式入口和 `appShell:true`。
- R35.2 加入 `scripts/tests/react-sidebar-r352-browser.mjs`：以正式 `src/ui/tool.html` 为来源、通过 Vite 引入正式 React，真实 Chromium CDP 输入核对挂载、Tab 切换、拒绝导航、React 更新后旧业务节点/草稿身份和 320/360/400/440/960px 的根节点唯一性。其级别严格为 `SOURCE_UI_SIMULATION_CHROMIUM`，**未加载浏览器扩展 Host**。
- 修复 `tests/environment/react-sidebar-app-shell-r351.test.mjs` 对 React 19 `hidden="hidden"` 的错误断言，限定 SSR Vite 的无谓依赖扫描。
- 修复 React Navigation 对**被拒绝的可信鼠标 Tab 点击**恢复已选中 Tab 焦点；附加真实 CDP 鼠标输入回归。
- 新建 `scripts/tests/react-sidebar-r352-installed-chrome.mjs`，测试实际 MV3 构建、Chrome 扩展后台和 UI，尝试关闭重开两次并输出报告。独立 Linux Chrome 冒烟并不等同于 Mac 原生 Side Panel；以 CI 结果为准。
- 专用门禁：`.github/workflows/react-sidebar-r352.yml`；严格 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`。

## 证据（不做级别冒充）

| SHA / Run | 级别 | 结论 |
| --- | --- | --- |
| `49c3e32620c7c084369d919b59493f03c939ce85` / [R35.2 #39143531665](https://github.com/shopable-ai/opendesk-browser/actions/runs/39143531665) | SOURCE_ONLY + SOURCE_UI_SIMULATION_CHROMIUM + 两种构建 | PASS |
| `ba952e5316addb36b65f0722cfd3ec6b110c6c8e` | 拒绝鼠标导航时恢复焦点 | 已提交代码及回归，最终通过状态必须核对对应 CI |
| R35.2 installed MV3 CI | INSTALLED_EXTENSION_CHROME_LINUX | 需读取最新 CI 作结论；首次工作流缺失 Service Worker 目标而 FAIL，后已切换 Chrome for Testing |
| 本地 Mac 真正侧边栏 | NATIVE_MAC_SIDE_PANEL | NOT_TESTED |

## 五 Tab 当前源码所有权，不作“完成”假设

| 页面 | React 现有部分 | 尚借用旧 DOM / 仍须迁移的主要部分 | 权威业务保持 |
| --- | --- | --- | --- |
| 我的 | 安装任务卡片、计数/详情快照、部分 Scheduler 列表 | 任务搜索和管理、参数表单、运行历史、计划 CRUD 表单/详情等 | TaskWorkbench、ScheduledTaskWorkbench、Scheduler、RunHost |
| 扩展 | `ExtensionCenterPage` 的列表、详情、菜单和状态；React 主容器 | 旧 `tool.html` 中冗余扩展中心、其他 SidebarTools/Installer 表单和源审阅节点 | ExtensionCenter、SidebarTools、Installer、SDK、Host |
| 工作流 | 顶栏、消息、版本历史、Settings Sheet 和结果文字 | composer、流程/执行控制及其他控制器原生表单 | WorkflowView、Workflow Host、版本持久化 |
| 开发 | 执行按钮、框架选择、当前网页状态、结果展示岛 | 项目文件、编辑器、参数、Compiler/预览设置等 | ScriptEditor、Compiler、RunHost |
| 云控 | 连接概览与新 `CloudConnectionPage` 外层 | 授权任务选择、请求审阅、配对和凭据控制表单 | CloudHosting、Cloud Host |

## 不能宣告完成的明确源码证据

- `src/ui/tool.html`：仍为 **1077 行**且有旧页面声明（读取时所在 `main`）。
- `src/ui/react/main.tsx`：当前仍有 **26 次 `createPortal(` 调用**；其中包含合规独立试点/菜单及未完成的页面岛，**不能单纯按数字判定违规**。
- `src/ui/react/app-shell.tsx`：明确把未完成迁移的业务页面以 `scaffold`、`ref` 借用原 DOM。单 Root 是必要条件，不是五 Tab React 完成的充分条件。
- 已安装真实任务、扩展更新/卸载、权限信任、工作流执行、Scheduler 到期、Cloud 配对与撤权和 Mac 原生侧边栏没有全面的 R35.2 验收通过证据。

## 下一阶段执行顺序

1. 按**最新 SHA**读取新的安装门禁、工件与 Chrome 诊断；有失败先修启动、权限及生命周期；成功也仅标为安装层冒烟 PASS。
2. 逐页建立 React 组件 + 原 Controller 的订阅快照/动作 API；禁止 React JSX 仅包裹旧 DOM 就算迁移。
3. 按“真实业务交互通过 → 删除该页旧 HTML/Portal → 回归测试更新”顺序清理，不得一次全删导致 SDK/Host/权限退化。
4. 扩展目录中的业务不得转移到可信浏览器框架；对并行 Scheduler、ScriptEditor、Cloud 代码先做 SHA 防冲突核对。
5. 必须由本地 Mac Codex 运行真扩展 Side Panel、权限、RunHost、保存重开及键盘焦点验收；无法执行时持续保持 NOT_TESTED。

**结论：App Shell 基础链已获得源码 + Chromium + 构建层正面证据；五 Tab 完整 React 产品迁移和原生安装交付仍未完成，不能评分 ≥95。**
