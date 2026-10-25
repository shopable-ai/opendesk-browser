# GOAL：OpenDesk Browser AI Chat Bridge R2.0-MAC · 百度搜索真实 Chrome 核心测试、最小修复与验收

**默认中文｜ORIGINAL GOAL FIRST｜LATEST MAIN｜LOCAL MAC REAL CHROME｜DELTA ONLY｜CROSS-CHAT DEDUP｜NO SECOND HOST｜NO FAKE PASS｜ONLY MAIN**

## 原始最高产品目标（不得漂移）

让官方 ChatGPT 的**已有正式对话**选择 OpenDesk Browser **已安装、已验证、已授权**的 JavaScript Task，通过原有可信 Authority、Controller、RunHost 打开真实百度搜索页、读取最多三条非广告结果、取得持久 Run/Result，**仅一次**回传原 ChatGPT 会话，由官方 AI 基于网页证据完成中文总结。不是新 MCP 工具，也不是任意浏览器 Agent。

本次只支持 `baidu.search.top3@1.0.0` 与保留回归的 `page.read.fixed@1.0.0`，不重写 SDK/RunHost/Send Queue，不创建额外 Bridge/Host/MCP。

仓库：`shopable-ai/opendesk-browser`
本地：`/Users/shopme/Documents/workspace/opendesk-browser`
**只允许 `main`，不得创建分支、Worktree、PR，不强推，不覆盖其他 Agent 文件。**

## 先核对已有实现，再执行最小测试

1. 核查 `git status --short`、`git branch --show-current`、`git fetch origin main`、`git log -1 --oneline`，遵守 `AGENTS.md`，安全快进到最新 main，保留其他 Agent 的改动。确保包含 Bridge R2.0 核心提交 `fa0cbe5cbaa9566ca4a5853fa10aee3f9e8bb791` 、测试修复 `08aefda5c71066821a4157a49fbf3e1265301284` 和 UI 自动触发补测 `87eafe84dd429c6ec9d289ba24ec9d2cfee1a882`。后续有新主干先做差量比较，不重复执行其他对话的工作。
2. 真实源码 owner 仅 `src/native-agent/chatgpt-fixed-bridge-page.js`、`src/native-agent/chatgpt-fixed-bridge-host.js`、`src/native-agent/chatgpt-bridge-trigger-gate.js` 及受影响的定向测试。已有百度 JS 和原始安装包**不要重写**。核对 `baidu.search.top3@1.0.0` 的固定 `sourceHash=1e2e3466b38d90c32513a7ce597fe6a283b986e61dd71f647241d8731ae80e45`、`manifestHash=e8abda7a51d234b1224dd626fbeeaa8ecc3ff63f2465c74433bef235dbf17bdf`。原固定网页 Task 仍应可选择。
3. 定向运行：
   ```sh
   node --check src/native-agent/chatgpt-bridge-trigger-gate.js
   node --check src/native-agent/chatgpt-fixed-bridge-page.js
   node --check src/native-agent/chatgpt-fixed-bridge-host.js
   node --test tests/environment/chatgpt-task-request-r1.test.mjs tests/environment/chatgpt-fixed-page-r11.test.mjs tests/environment/baidu-search-top3-r1.test.mjs tests/environment/chatgpt-fixed-bridge-r12.test.mjs tests/environment/chatgpt-fixed-bridge-r13.test.mjs tests/environment/chatgpt-baidu-bridge-r20.test.mjs
   npm run build
   ```
   2026-10-26 Linux CI 在 `87eafe8` 上已有**48/48 组件测试通过**。全量生产构建**失败**，原因是其他 owner 的 `examples/sidebar-tools/prompt-shortcuts/trusted/model.js` 与固定审阅哈希不匹配（`opendesk-fixed-page-relay`），不是已证实的百度 Bridge 构建缺陷。原始 CI：`https://github.com/shopable-ai/opendesk-browser/actions/runs/40219355343`。本地先验证此阻断是否仍存在；如存在，标 `BLOCKED_BY_UNRELATED_OWNER`，不可擅自 re-pin、覆盖可信文件或假称 BUILD PASS。只有取得正确 owner/已同步的可信源码后再最小修复；其他已无阻碍的事项继续。

## 四个真正要测的业务场景（仅测本轮增量）

**A｜手动百度搜索**：用真实 Mac Chrome 加载当前完整 OpenDesk Browser 构建（非 HTML Mock）；同窗口开启原 OpenDesk Side Panel。在原 Task Catalog 中查看百度 Task 的 Candidate / Verified / Available / Installed / Enabled **实际状态**，根据现有验证规则完成本机验证、Available 和用户确认安装；不能直接修改存储伪造状态。Chrome 必须有 chatgpt.com 和 www.baidu.com 网站权限。打开 `https://chatgpt.com/c/...` 正式对话，右上方 OpenDesk 面板选「百度搜索前三条」，输入 `OpenDesk Browser`，点击「建立请求」，在官网自行发送。等待 AI 输出唯一匹配候选，点击「执行」。核对真实 owned tab 地址 `https://www.baidu.com/s?wd=OpenDesk%20Browser`，最多三条真实自然搜索结果（少于三条按实际记录），原有 Run/Result 均完成，`retirementState=released`，同一原 ChatGPT 会话新增一次真实结果消息且 AI 中文续答。记录时间、真实 runId/resultId、taskId、sourceHash、manifestHash、installationId/generation、URL、status/count、观察到的标题/摘要/链接（敏感信息适当脱敏）、回传身份和截图/日志位置。没有证据不可标 PASS。

**B｜本次批准自动执行**：使用新 requestId/不同一轮 ChatGPT 用户消息；建立请求并官网发送后，在 AI 候选仍未完成前点击「批准本次自动执行」。不点击「执行」，等待完整匹配候选后应自动执行一次并回传一次。核对 `reserve=1`、真实 Run 1 个、持久结果 1 个、原会话交付 1 条；不能拿固定页面 R1.2 A/B 历史凭据替代。

**C｜百度页面异常**：遇到验证码/风控、搜索区域丢失、DOM 已变化或无自然结果时，验证具体 `blocked` / `dom_unavailable` / `dom_changed` / `no_results` 状态，结果仅有实际条数；不绕过验证码、不虚构结果、不无限重试。可用受控组件故障注入辅助负例，但不能将其冒充真实百度页面通过。

**D｜不重放和会话/草稿安全**：最小覆盖重复点击、模型改关键词、切换 `/c/...`、撤销原网站授权、切换/停用已安装 Task、错误 runId/resultId、输入框草稿或附件/IME 占用、发送 ACK 结果未知。执行和发送必须最多各一次；源、安装与结果身份不匹配不回传；无确定回执写 `UNKNOWN`，只读查原任务，绝不盲目再次运行或再次发送。仅测受本次代码影响的边界，不回到大规模旧固定网页场景。

## 修复边界及交付格式

- 优先修实测阻塞，例如真实百度 DOM 变化、ChatGPT 原生输入框适配、Side Panel 工具栏可用性或运行身份不匹配；每一处必须有失败证据、最小 patch 和同源测试。已有百度 Task 源码确需改变时必须重新走受信任务包哈希、版本、验证和用户确认安装，不可直接忽略原固定 pin。
- 非 owner 的 Prompt Shortcuts 源码/哈希冲突只报告并协调，不要为了拿 BUILD PASS 修改他人功能。不得创建第二套 Host/Controller、复制代理服务、重做发送队列、创建新 MCP Tunnel。
- 最终输出普通用户能懂的操作路径；A/B/C/D 各自 `PASS / FAIL / NOT_TESTED / UNKNOWN / BLOCKED`；每项真实证据的 runId/resultId/原会话回传次数与时间；新旧代码文件和提交 SHA；build 与定向测试确切结果；余下阻塞与最小后续方案。代码改动仅在 main 安全提交和普通推送，不得伪造 Chrome、百度或官网续答。
- 分别独立按 100 分评分：目标完整性、核心业务能力、架构复用、安全可靠性、用户体验、测试与证据；**综合分为六项算术平均**。实际没达到 95 的维度必须如实标明，不得以方案愿景替代验收结果。

核心门槛：**百度真实网页 + 已安装受信 Task + 一次执行 + 唯一 Durable Result + 原官方 ChatGPT 会话一次回传和 AI 续答。**
