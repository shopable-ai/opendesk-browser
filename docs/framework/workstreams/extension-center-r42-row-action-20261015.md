# Extension Center R4.2 · 整行主操作与紧凑布局（2026-10-15）

- 负责人：当前 OpenDesk Browser 扩展列表交互优化对话；状态：ACTIVE。
- 目标仓库与写入分支：`shopable-ai/opendesk-browser` / `main`；开始时远端 HEAD：`ba8995792cb0a75fa9d94b1905198f187ff0e43f`。
- 实施目标：不改变列表高度、两行文字、图标、右侧「打开/安装/设置」与「⋯」按钮外观；图标/标题/描述/中间空白成为统一可键盘聚焦的主操作区域。移除任何「点击主要区域直接使用」提示文字。
- 主操作：已安装且启用的普通应用启动原工具；未安装只查看详情、不静默安装；已停用普通应用进入设置；网页增强进入详情管理。右侧按钮与更多管理入口保持独立。
- 本任务专属写入：`src/ui/extension-center.js`、`src/ui/extension-center-model.js`、`src/ui/extension-center.css`、`tests/environment/extension-center-r42-row-action.test.mjs` 与本记录；不触及 `src/ui/tool.html`、权限、SDK、安装器、Tool Host、公共 design tokens。
- 并行边界：已审阅 Extension Center R4.1 遗留原生验收工作流，保留其来源/SHA/搜索图标修复与现有代码；只修改行操作和必要局部 CSS。不接管其他工作流、用户 Mac 工作目录或共享 watcher。
- 验证方案：新增 Node 状态语义及 DOM/CSS 静态合同，核对 R4/R4.1 测试；可用时检查当前提交的 GitHub CI。真实 Mac Chrome、`dist/development`、CFT、125%/200% 缩放及用户安装包状态均为 NOT_TESTED，不以远端仓库替代本机。
- 当前资源占用：GitHub `main` 上的本任务文件写入；未占用 Mac 工作区、Chrome Profile、端口、dist 或本机 Git 索引。最终写入前再次确认各目标文件 blob SHA；不强推、不覆盖并行新改动。
