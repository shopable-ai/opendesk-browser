# Extension Center R4.2 · 整行主操作与紧凑布局（2026-10-15）

- 负责人：当前 OpenDesk Browser 扩展列表交互优化对话；状态：SOURCE_COMPLETE / CI_PARTIAL / NATIVE_NOT_TESTED；本任务 GitHub 写入已释放。
- 目标仓库与写入分支：`shopable-ai/opendesk-browser` / `main`；开始时远端 HEAD：`ba8995792cb0a75fa9d94b1905198f187ff0e43f`。
- 实施目标：不改变列表高度、两行文字、图标、右侧「打开/安装/设置」与「⋯」按钮外观；图标/标题/描述/中间空白成为统一可键盘聚焦的主操作区域。移除任何「点击主要区域直接使用」提示文字。
- 主操作：已安装且启用的普通应用启动原工具；未安装只查看详情、不静默安装；已停用普通应用进入设置；网页增强进入详情管理。右侧按钮与更多管理入口保持独立。
- 本任务专属写入：`src/ui/extension-center.js`、`src/ui/extension-center-model.js`、`src/ui/extension-center.css`、`tests/environment/extension-center-r42-row-action.test.mjs` 与本记录；不触及 `src/ui/tool.html`、权限、SDK、安装器、Tool Host、公共 design tokens。
- 并行边界：已审阅 Extension Center R4.1 遗留原生验收工作流，保留其来源/SHA/搜索图标修复与现有代码；只修改行操作和必要局部 CSS。不接管其他工作流、用户 Mac 工作目录或共享 watcher。
- 验证方案：新增 Node 状态语义及 DOM/CSS 静态合同，核对 R4/R4.1 测试；可用时检查当前提交的 GitHub CI。真实 Mac Chrome、`dist/development`、CFT、125%/200% 缩放及用户安装包状态均为 NOT_TESTED，不以远端仓库替代本机。
- 当前资源占用：GitHub `main` 上的本任务文件写入；未占用 Mac 工作区、Chrome Profile、端口、dist 或本机 Git 索引。最终写入前再次确认各目标文件 blob SHA；不强推、不覆盖并行新改动。

## 交付与证据（2026-10-15）

- 已直接写入并推送到 GitHub `main`，不涉及用户 Mac 本地 checkout：`da7449e1598e702df8e99d8297afbcd06ec0c45f`（整行按钮 + 状态矩阵 + 新测试）、`9f3103fbe4b3a5c446c6ba3f84f92abc69448a01`（新测试加入现有 Extension Center CI）、`98175ca3aad0eed1bcc1691d0b1a5ce7c6c2ed37`（长标题单行省略）、`b12850233566b7a6b695af50f5039a48a6078933`（按钮内部 phrasing-only DOM 与管理入口 tooltip）。
- 实际写入文件：`src/ui/extension-center.js`、`src/ui/extension-center-model.js`、`src/ui/extension-center.css`、`tests/environment/extension-center-r42-row-action.test.mjs`、`.github/workflows/extension-center-r4.yml`、本记录。未修改 Tool Host、权限/SDK、安装器、`src/ui/tool.html`、公共设计 tokens。
- 最新源码提交 `b1285023` 的扩展中心 CI：[38692141189](https://github.com/shopable-ai/opendesk-browser/actions/runs/38692141189)。R4.2 的 **4/4** 新增测试通过，现有 R4 投影测试亦通过；整套工作流 FAIL，唯一已识别失败来自本任务未修改的 `tests/environment/sidebar-product-contract.test.mjs:89`，对 `developer-target-detail` HTML 结构的历史正则断言，与整行列表修改无关。因该失败，工作流的 production/development 构建与 verify 步骤被跳过，不能声称整体 CI 或构建 PASS。
- 同一 SHA 的 R7 axiosx 工作流 [38692141226](https://github.com/shopable-ai/opendesk-browser/actions/runs/38692141226) 为 SUCCESS，包含 `npm run check`；此结论只覆盖其自身实际运行的 source-check 与定向测试，不冒充 Extension Center 整套 CI 通过。
- 形式上保留原来的 `72px / 68px / 82px` 响应式最小行高、原标题和描述两行、34px/44px 操作区、数据授权和未保存修改保护。静态合同验证通过；实际浏览器像素测量、Mac Side Panel、125%/200% 缩放和安装扩展真实交互均 **NOT_TESTED**。
- 95+ 为产品验收目标，不能根据本次源码/静态测试自证达成。下一位本机验证负责人使用与本提交关联的固定构建，补本机 Chrome 真实打开/查看详情/停用/网页增强/键盘/缩放的用户流程证据。
- 本任务没有占用过 Mac 本地 Git 索引、`dist/development` watcher、Chrome CFT/Profile、原生服务或端口；无正在运行的本任务任务进程/独立环境需移交。已有其他 Agent 的工作流和历史证据未覆盖。
