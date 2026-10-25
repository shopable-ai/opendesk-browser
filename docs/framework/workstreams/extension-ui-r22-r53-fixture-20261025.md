# Extension UI R2.2 · R5.3 React 预览测试输入漂移修正

- 日期：2026-10-25；写入负责人：本次 ChatGPT GitHub 连接器（仅远端 main；非用户本机 Codex）。
- 起始只读 main：`fd1ec50a316fcca0086ebee4424391a1c8e273ce`。
- 本任务**唯一源码写入**：`scripts/tests/extension-center-r53-preview-chromium.mjs`；本工作流记录。其他并行 Agent 的 `src/ui/react/**`、locale、Prompt Shortcuts、`scripts/preview/build-sidebar-six-react-preview.mjs`、生成 HTML、dist、Chrome Profile 与共享 CI 工作流均只读。
- 文件核对：测试原 blob `9e9292b481c81a7a408d58c9af9ff7a06882da47`；现有 [R5.3 CI 40194702781](https://github.com/shopable-ai/opendesk-browser/actions/runs/40194702781) 在 React Showcase Chromium PASS 且原生成器重新构建/同源同步后，原 R5.3 列表测试因硬编码「恰好两条」失败，实际为七条已安装预览记录。
- 变更目的：只移除对**旧预览数据数量**的硬编码，保留真实 CDP pointer、唯一菜单、行身份、卸载确认、未安装过滤、搜索、焦点返回、100 行布局及导入 Sheet 的原断言；不将七条列表视为产品缺陷，也不将旧回归删掉/跳过。
- 并行保护：工作流 `extension-ui-showcase-r20-20261025.md` 已释放；R5.3 CI 自动同步仅写生成 HTML，不写本测试；历史 R4.2 所有权亦已释放。当前未发现本文件的其他实时写入证据，但 GitHub 连接无法观测本机未提交改动；若对本文件发生 SHA 冲突立即停止，不覆盖。
- 输入依赖：正式 `scripts/preview/build-sidebar-six-react-preview.mjs` 生成的 UI_PREVIEW_ONLY HTML、正式 React `app-shell`/列表组件以及测试运行器；不改变数据、SDK、Host、权限或安装包。
- 期望结果：更新脚本后在同一候选运行 `node scripts/tests/extension-center-r53-preview-chromium.mjs` 并复核失败截图/日志；成功才记 `CHROMIUM_PASS`。无本机 Node、Mac Chrome、真实生产扩展、安装升级或正式包操作权限，以上全部 `NOT_TESTED`；CI 若未运行完亦不可记 PASS。
- Prompt Shortcuts 的另一个 P0 阻断已经被专属 workflow 拥有：正式 JSON 为 1.1.18、config 为 1.1.19；可信 page.js 来源校验失败使晋升 Job 跳过。本任务不通过改版本/哈希/安装器来伪造修复。
- 当前资源：仅 GitHub main 两个确定文件的串行写入。无 Chrome/Profile、端口、watcher、dist/ZIP 写入。
- 状态：RELEASED / SOURCE_WIRED / CHROMIUM_NOT_VERIFIED；保留原始 CI 失败证据。

## 实际提交与最新核验

- 本轮先登记工作范围：`54590e2b0069920f03af412ffad1cb87ddd9e049`。
- 定向修复：`f39437ef70b8d8aacff6169cf781192cdbcfeacb`；唯一修改 `scripts/tests/extension-center-r53-preview-chromium.mjs`。重新读取 GitHub 发现其 blob 为 `9aefabc341e624c968af95360a63b0e72e9592fb`。
- 修改旧测试的静态「2→1→0」假设为重新加载后读取实际已安装记录数，定位目标 App/Page 身份；原状态、唯一行级菜单、确认取消、焦点恢复、搜索和 100 条 DOM 压力验证保持在测试内。不增改 React、locale、源预览生成器或可信服务。
- 新同候选 [CI 40195718172](https://github.com/shopable-ai/opendesk-browser/actions/runs/40195718172)：React 预览生成 SUCCESS、受影响静态契约 SUCCESS，且此前 CI 曾证明的 320/360/400/440/960 宽度几何没有溢出；**新的** `scripts/tests/extension-ui-showcase-r21-chromium.mjs`（另一工作流在 `1350678a` 修改）在 `document.querySelector(".od-locale-maintenance")?.open===false` 超时，失败发生在本次 R53 脚本调用之前，后续 R53 测试是 SKIPPED。
- 因该并行前置失败，**不能将本次 R53 改动计为 Chromium PASS**。现状：`R53_SOURCE_WIRED` + `BLOCKED_BY_OTHER_OWNER`（语言高级面板 Escape 原生交互/新观测者脚本需要负责该文件的工作流核对）。必须复用同一个 React/LocaleManager 后核实事件是否到达已有 `UninstallDialog`，选择修正式行为或观测者时序；禁止为通过测试而跳过真实 Escape 语义。
- Prompt Shortcuts 仍归其独立项目/CI 来源审阅职责，正式包版本不同步未获本任务写入。
- 本轮远程提交两项文件写入已释放；未占用本机 Mac 工作区、Node、Chrome、Profile、dist、watcher、安装包、端口。无本机测试及真实安装回执，不宣称产品正式验收、CI 全绿或专家 95+。

