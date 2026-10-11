# OpenDesk Browser R23 · UI 架构与共享设计边界

日期：2026-10-11。基线审核：`d56c84273f7fcab8b837269ef5472fafd1fd19e5`。本文件描述源码策略；真实 Chrome 与 Native 实测须查 [R23 工作流记录](../framework/workstreams/ui-r23.md)，不得以代码提交代替验收。

## 当前实际 UI 地图

| 正式界面 | 入口 / JS | 渲染及业务状态 | 样式与发布 | 验证边界 |
| --- | --- | --- | --- | --- |
| 我的 / 发现 / 工作流 / 开发 / 工具 | `src/ui/tool.html` / `tool-shell.js`、`task-workbench.js`、`sidebar-tools.js`、`workflow/workflow-view.js` | 原生 DOM；RunHost、任务槽、持久结果和权限继续归既有 Host/模块 | `design-tokens.css` → `design-system.css` → `tool-shell.css`，固定静态复制 | R21 五页签和工具回归；真实扩展事件另测 |
| 独立工具标签页 | 同一 `ui/tool.html` 与可信 Host | 原生 UI；工具 iframe 保持隔离 | 复用 Side Panel CSS，不注入工具 iframe | 工具导入、安装、独立打开、生命周期 |
| Native Options | `src/native-agent/settings.html` / `settings.js` | 原生表单；Chrome nativeMessaging 权限、Host 回执不变 | `../ui/design-tokens.css` → `settings.css`；本页允许自然滚动 | 真实可信权限手势和连接状态另测 |
| Native Workspace | `src/native-agent/workspace.html` / `workspace.js` + `settings.js` | 原生 DOM，文件读写与冲突语义不变 | `workspace.tailwind.css` 构建期内联共享 Tokens，输出 `workspace.css` | R22 文件/预览/AI 回归、真实 Native 保存另测 |

注意：扩展自身 WXT/Vite 固定 IIFE 构建、用户脚本项目构建、可安装工具包构建是不同职责。不能把 Tailwind 的样式编译或 React UI 运行时放入 SW、Controller Worker、Web SDK 或用户脚本包。

## 唯一 Tokens 与层次

- `src/ui/design-tokens.css`：唯一色彩、状态、间距、控件/卡片圆角及图标尺寸定义；**只包含 :root 语义变量**，不写 `html`/`body` 高度、滚动、`*` reset、页面容器或外部 URL。
- `src/ui/design-system.css`：仅受信任 Side Panel / 独立工具 Host 的基础控件及共享原生语义类；包含其需要的 `html,body{overflow:hidden}`，不可导入 Native 页或工具 iframe。
- `src/ui/tool-shell.css`：Side Panel 具体五页面布局、视图状态与滚动容器；保留明确的业务 DOM 和现有选择器，不以宽泛 `!important` 累积新覆盖规则。
- `src/native-agent/settings.css`：Options 本地布局，body 可滚动、长 Host ID 换行、窄屏操作按钮折行、键盘 focus 可见；只读样式，不改 `settings.js` 的同步权限手势。
- `src/native-agent/workspace.tailwind.css`：沿用 R22 Tailwind v4 的 `source(none)` 明确扫描及独立宽屏密度；构建期 `@import "../ui/design-tokens.css"` 由本地 CLI 内联。**生产产物不得残留 @import/@apply/@source 或远程 url()**。更改 Tokens 会触发开发编译监听。
- 工具 sandbox、网页内阅读目录、用户代码继续使用原有独立样式/隔离方式；绝不继承受信任 Host 的全局 reset。

## 可复用组件与 React 决策

既有 `.od-toolbar`、`.od-stack`、`.od-surface`、`.od-button`、`.od-icon-button`、`.od-field`、`.od-segmented` 继续是公共原生语义类。按钮、label、details、状态/空态首先复用 HTML 原生语义；重复行为只有在存在实际消费者时才抽取小的 JS 辅助模块，不建立注册中心。

**R23 本次不引入 React / shadcn/ui。** 虽然 `workflow-view.js` 和 `sidebar-tools.js` 文件较大，但目前未证明单一 DOM 子树的状态竞争可被 React 局部迁移降低；当前项目又严格限定固定、自包含 IIFE 入口及 512 KiB / SW 320 KiB 预算。增加 React/React DOM 的实际包体增量、动态拆包/重复实例问题没有基线测量，不能先安装再用改预算过关。后续如有明确缺陷，需要以旧 DOM 所有权清单、一个正式挂载边界、用户手势/订阅清理和实物包差异支持新决策。

## 构建、安全和维护规则

1. 扩展 CSS 不引用 CDN / 在线字体、不在浏览器执行 Tailwind；`scripts/prepare-public.mjs` 显式复制新文件，`scripts/verify-package.mjs` 显式限制 HTML 引用和样式资源，并拒绝危险 CSS。新增可信页面必须先选择正确页面边界，不能复制 Side Panel 的全局 overflow 策略。
2. `scripts/build-workspace-style.mjs` 的编译输入必须包含 Tokens，以便开发热更新与生产重建。同一构建候选的生产/开发 Workspace CSS SHA 应相同。
3. 新增 UI 优先检查 320/360/400/480/600px Side Panel、Workspace 360–1920px、浏览器真实 100%/200%、长文本、空/错误/加载/只读、键盘与屏幕阅读器。组件/静态夹具不能升格成真实 Chrome/Native 通过。
4. 添加脚本入口、依赖、新 iframe、动态 import 或资源时必须先核对 WXT 18 个固定入口、CSP、白名单、实际 JS/CSS 字节预算，绝不放宽原验证器。

历史 R19/R20/R21/R22 成功仅对其各自精确输入有效；本轮变更 Tokens 与 Workspace 生产 CSS 后，相关页面的真实 Chrome 视觉和交互需要新证据。
