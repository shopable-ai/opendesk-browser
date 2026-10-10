# Sidebar R20 · 共享设计系统集成及验收记录

日期：2026-10-10，实施分支：`main`，无新分支 / Worktree、无 force push。所有证据仅适用于明确列出的提交和文件哈希；未使用用户 Mac 上的 Chrome Profile、端口、dist 或 ZIP。

## 代码完成

- [主提交 `9d161947`](https://github.com/shopable-ai/opendesk-browser/commit/9d1619473179dcc865de220ae9b8ba407feeaf65)：新增静态 `src/ui/design-system.css`，自 `tool-shell.css` 抽出全局基础控件和 :root token，为五页签/同页目录安装通用 od-page/toolbar/stack/surface/button/icon/field/segmented 语义类，HTML 先加载 Design System 后加载各页布局 CSS。新增文件经过 `STATIC_RESOURCES` 复制、`HTML_REFERENCES` 显式白名单、CSS 禁止 import/url/expression 扫描，不新增依赖、脚本入口、Chrome 权限或 Service Worker 增量。
- [测试补充 `b8a04092`](https://github.com/shopable-ai/opendesk-browser/commit/b8a04092a2a61e48d1555c116e6bf0a9865ca662) 和 [`82d98b9c`](https://github.com/shopable-ai/opendesk-browser/commit/82d98b9c77ccfd039b9bab14226e2c14d26a0a7e)：旧静态合同的 class 属性原先限制为单类名，现要求原功能类和共享语义类同时存在。未修改权限、安全检查或测试通过阈值。
- [架构规范](../../architecture/sidebar-design-system-r20.zh-CN.md)：解释不引入 Tailwind 的具体原因，组件/spacing/radius 规范、源文件归属和后续独立 Vue/React 页面接入策略。

## 本轮真实 CI 证据

| 身份、工作流 | 结果 | 证据层级 |
| --- | --- | --- |
| `9d161947` [真实 HTML/CSS Chrome 静态布局](https://github.com/shopable-ai/opendesk-browser/actions/runs/38062310949) | **28/28 场景通过**：五页签、开发三模式、宽度 300/360/420/520px，圆角、垂直间距、无横向溢出；保存 PNG/metrics | `STATIC_MARKUP_CHROME`，非实际扩展 |
| `9d161947` [严格固定包与安全检查](https://github.com/shopable-ai/opendesk-browser/actions/runs/38062310915) | **SUCCESS**：source check、WXT production/development、完整 package verify、构建预算、真实包突变测试（含 design-system.css 缺失和恶意 @import 拒绝）8/8 | `CI_BUILD_AND_PACKAGE_VERIFIED` |
| `82d98b9c` [Sidebar UI + Tools 全套验证](https://github.com/shopable-ai/opendesk-browser/actions/runs/38062478828) | **SUCCESS**：定向 85/85，source check、离线工具 JSON 与 React/Vue 工具独立构建、WXT production/development + package verify | `CI_COMPONENT_AND_BUILD_PASS` |

第一轮 `9d161947` 的 UI 静态测试 82/84（两条旧单类断言）和第二轮 `b8a04092` 的 84/85（另一条相同问题）已按真实失败原因修正并保留原 CI；本轮最终定向 85/85 PASS。不是通过删除断言、降低安全界限或仅宣称成功。

## 并行集成安全

- 在 `82d98b9c` 之后其他工作流继续提交了 `src/ui/sidebar-tools/navigation.js`、`src/ui/tool-shell.js`、`scripts/verify-package.mjs` 与独立库相关构建变更。检查当前主分支时，`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/design-system.css` 的 Blob SHA 与 `9d161947` 保持一致；`verify-package.mjs` 虽被更新，但仍保留新 CSS 的强制 HTML 引用、必需资源和安全扫描。
- 后续主分支发生新的构建输入或打包校验器变化，应引用其各自新候选 CI；不得把上述 CI 自动提升为任意更新之后的包通过证明。

## 未完成的证据（不能冒充 ≥95 分）

- 本轮没有在用户 Mac 上真实加载/重载当前扩展版 Side Panel，也没有原生 125%/200% 缩放、屏幕阅读器、鼠标/Tab/Enter/Space、用户可信授权 Run/Stop 的新回执。
- `STATIC_MARKUP_CHROME` 测试修改 DOM 仅用于排版夹具，不是已安装的实际 Chrome Side Panel，也不会代替功能测试。
- 需真实 Chrome 同一候选 screenshot/计算样式/脚本身份后进行六维专家复核；`EXPERT_SCORE_95_PLUS` 保持 **NOT_VERIFIED**。
- Native Agent 的独立 Workspace / Settings 属于不同页面密度与并行开发范围，**本轮没有对它们做全量 CSS 迁移**；后续需复用语义颜色/间距规范而不是粗暴引入 Tailwind / 重写现有工作。

建议本地 Codex 仅在无其他测试所有者占用时，核对真实 `main` 最新 SHA、工作树、Chrome 实际加载版本和独立 CFT Profile，按 300/360/420/520px、125%/200%、五页签/空态/错误态/工具导入/项目模式逐项验证；发现问题只修改归属文件、保留原始失败证据，不能伪造 Native PASS。
