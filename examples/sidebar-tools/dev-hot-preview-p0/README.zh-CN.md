# 本地工具热更新 P0

这是一个真实的最小 Sidebar Tool 源码项目，**不是正式安装包，也没有浏览器权限**。仅用于验证新工具首次开发与现有开发预览链路。不要将此工具加入官方 Catalog。

## 源码与入口

- 工具 ID：`dev-hot-preview-p0`；开发版本：`0.1.0`。A/B 标记是源码验证内容，不代表安装升级。
- 业务源码：`src/index.html`（标题与版本文字）、`src/style.css`（按钮样式）、`src/main.js`（按钮计数与反馈）。
- 宿主热更新框架、Native Workspace、watcher 和预览会话均使用仓库已有实现，不在本项目重复创建。

## 开发预览

在仓库根目录（已按现有 Native 工作流授权此项目来源）执行：

```sh
node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/dev-hot-preview-p0
node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/dev-hot-preview-p0
```

如果已有有效 watcher，不要启动第二个。通过 OpenDesk「开发 → 本地项目 → 实时开发预览 ↗」或已授权 Native Workspace「只读预览工具 ↗」明确打开一次。上述命令只生成本地快照，不安装工具或申请权限。

## P0 目标与通过条件

在真实 Mac Chrome 的**同一 OpenDesk 预览会话**中完成：源码落盘 → 初始 HTML/JS A 可见并点击成功 → 保存 HTML B 后自动更新 → 保存 JS B 后再次自动更新并点击成功，最后保留源码。以下四项全部 `PASS` 才完成 P0，随后立即收尾。

| 验收项 | 必须观察到的结果 | 必须保留的证据 |
| --- | --- | --- |
| 本地项目真实落盘 | `tool.config.json`、`src/index.html`、`src/style.css`、`src/main.js`、本 README 均存在；ID 为 `dev-hot-preview-p0`，版本为 `0.1.0`，`capabilities` 为空 | 实际源码目录、HEAD、配置和文件核对结果 |
| Chrome 初始预览运行 | 标题「本地工具热更新」、文字「源码版本 A」和蓝色「点击测试」可见；点击一次显示「JS 版本 A · 已点击 1 次」 | 真实 sourceId、toolId、previewId、A 快照 SHA、可见文字和点击后的画面 |
| 第一次 HTML/CSS 更新 | 只将 HTML 的「源码版本 A」保存为「源码版本 B」，原预览自动显示 B | 原 previewId、第二个 SHA、保存和观察时间、更新后的画面 |
| 第二次 JS 更新 | 再将 JS 点击反馈中的「JS 版本 A」保存为「JS 版本 B」，原预览自动更新，点击一次显示「JS 版本 B · 已点击 1 次」 | 原 previewId、第三个 SHA、保存和观察时间、点击后的画面 |

本轮第一次更新只改 HTML，CSS 保留蓝色按钮样式，不额外增加 CSS 改色验收。

## 执行顺序与关键测试条件

1. **核对入口与来源。** 只在 `main` 工作，先核对本工具相关改动。复用现有 watcher、Native 和开发 writer；日常扩展目录保持仓库 `dist/development`，记录实际连接状态。PID、目录或磁盘构建指纹不能单独证明 Chrome 已连接。使用「开发 → 本地项目」，选择本工具的真实授权来源，再点击「实时开发预览 ↗」。不把 workspaceId 当成 sourceId，不伪造来源。此入口无需手输扩展地址，但当前实现内部仍复用原 Native Workspace。
2. **先取得 A 证据。** 初始等待文字为「JS 版本 A · 等待点击」。完成一次真实点击并记录 A 的可见反馈、previewId 和 SHA 后，才允许进行 A→B 源码修改；仅完成 staging 不满足此条件。
3. **保存 HTML，再观察。** 只改 `src/index.html` 的源码版本文字，等待现有 watcher 和预览轮询完成。确认原预览自动显示「源码版本 B」，记录第二个 SHA 后，才进入 JS 修改。
4. **保存 JS，再点击。** 只改 `src/main.js` 的点击反馈版本文字，等待原预览更新后再点击。此时 HTML 中的初始等待文案仍可能是「JS 版本 A · 等待点击」；JS 更新以真实点击后的 B 反馈为判据，不为改变等待文案额外修改 HTML。
5. **连续性必须成立。** 三阶段绑定同一 sourceId、toolId 和 previewId，三个 SHA 必须不同。不得手动刷新、重新打开预览、另开 HTML、重新安装或切换其他预览来补足结果；意外关闭、断连或会话变化时，如实记录，本轮连续性证据不足，不能拼接为通过。

## 证据、阻断与停止条件

沿用仓库根目录 `artifacts/sidebar-tools/dev-hot-preview-p0/mac-p0-progress.json` 记录增量，不新建平行验收账本。每阶段记录观察时间（注明时区）、sourceId/toolId/previewId、快照 SHA、实际可见文字、观察来源及可复查的截图或明确的用户真实观察。保存更新阶段另记保存时间。SHA 应与现有完整 staging 快照对应；watcher 日志、Node 输出或哈希变化均不能代替 Chrome 可见结果。没有读到身份或 SHA 时保留未知，不推断补齐。

- `PASS`：对应条件和必要证据完整，包含实际可见结果及要求的真实点击。
- `FAIL`：已执行真实操作，确认产品行为不符合预期；保留具体失败步骤。
- `NOT_TESTED`：因访问限制、连接不可用或缺少真实观察而无法验证；不能据此判断产品故障。

浏览器工具此前已明确拒绝扩展协议访问。没有限制已解除或受支持访问方式的证据时，不重复被拒绝操作，不换通道绕过，不循环请求普通操作授权。可以记录注明来源的用户真实观察，缺失的身份、SHA 或画面证据仍须保留未知；初始 A 证据取得前保持 A 源码，后续阶段受阻则保留当前源码和已有证据，不擅自回退或重开会话。

只有真实复现本项目或公共预览链缺陷后，才做最小修复和对应定向验证。公共权限、来源、身份、CSP 或撤权边界实际受影响时，补对应安全回归；不新增 watcher、Host、SDK 或预览机制，不通过放宽保护制造通过。没有新失败或代码变化时，不重复构建、测试或环境巡检。

最终报告四项状态、实际 HEAD、源码目录、修改文件、服务复用情况、同一 previewId、三次 SHA、实际可见结果、并行影响及剩余阻断。四项全部通过后保留最终源码、原预览和现有服务，才将 P0 目标标记完成。

修改不会自动安装、升级或覆盖同 ID 正式工具。本目标不包含正式打包、安装、升级、业务存储、React/Vue、production 验收、评分、全量回归或开发平台建设；不默认增加宽度、缩放和压力测试。
