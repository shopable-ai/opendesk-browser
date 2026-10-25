# GOAL：OpenDesk Browser AI Chat Bridge R2.0-MAC · 百度搜索真实 Chrome 核心测试、最小修复与验收

**默认中文｜ORIGINAL GOAL FIRST｜LATEST MAIN｜LOCAL MAC REAL CHROME｜DELTA ONLY｜CROSS-CHAT DEDUP｜NO SECOND HOST｜NO FAKE PASS｜ONLY MAIN**

## 2026-10-26 本机执行记录：构建阻断，真实闭环未验收

**本轮结论：`BLOCKED_BY_UNRELATED_OWNER`。不能确认百度搜索已在真实 Mac Chrome 完成。** 安全快进到 `main@7e6ef79569f31aa836121d89d3f3f08c6e9372a4` 后，指定六文件测试本机 **48/48 PASS、0 FAIL、0 SKIP**（573 ms）；不重复开发既有接线。以下是当前实测结果，不能用文末操作计划代替。

收尾时 main 已安全同步至 `95fe6200f`；并行差量为其他产品记录、Mind Map 审计/测试及 Send Queue 自身 UI。已复核本轮 Bridge/Task/测试和来源门禁相关输入未变，复用上述证据；不重做 Send Queue。

### 构建与并行资源

- 为保护既有 `npm run dev` owner PID `91386`、`dist/development` 和 `.wxt/public`，在普通文件快照 `/private/tmp/opendesk-bridge-r20-mac-mn2vvwlv` 中执行原 `npm run build`；没有创建分支、Git worktree 或 PR，没有停止服务或替换日常扩展。
- 最终尝试为 **production / Standard 静态包**，北京时间 **02:26:56–02:27:16**，exit code **1**。失败目录的 `dist/production` 只是部分产物，不能安装或当作构建成功；该模式无 dev 连接。未进入 Chrome，实际已加载扩展 ID、路径与连接状态尚未核对。
- 原始错误：`[opendesk-fixed-page-relay] Trusted Prompt Shortcuts source changed; review and re-pin before fixed build: examples/sidebar-tools/prompt-shortcuts/trusted/model.js`。
- `scripts/bundle-provenance.mjs` 的审阅 Git blob 为 `9b29be376a28be9aa2958913ea7dc758459bb171`；实际为 `730496110c2ebc316eb74e1c29ac66dc74d60561`。本轮没有修改该业务或 pin。Bridge 三文件及该门禁/业务文件的快照字节与工作区一致。
- 前两次尝试分别因快照的依赖软链接超出来源根目录、遗漏共享 `native-agent` 源码而失败；均属本轮快照环境问题。已通过复制现有依赖及共享源码解决，未下载/安装依赖、未修改产品来适配快照。仅第三次完整快照的上述来源错误用于判断产品构建阻塞。

### P0 身份及 A/B/C/D

磁盘候选包 `examples/tasks/baidu.search.top3.v1.opendesk-task.json` 存在且与 JS 同源，版本 **1.0.0**；已通过本轮定向测试核对：

- `sourceHash = 1e2e3466b38d90c32513a7ce597fe6a283b986e61dd71f647241d8731ae80e45`
- `manifestHash = e8abda7a51d234b1224dd626fbeeaa8ecc3ff63f2465c74433bef235dbf17bdf`
- 网站仅 `https://www.baidu.com`，计划参数 `{query:"OpenDesk Browser",limit:3}`。

**磁盘包存在不证明 Catalog Candidate。** 本机 Catalog 的 Candidate、Verified、Available、Installed、Enabled 均 `UNKNOWN / NOT_TESTED`，installationId/generation 未取得；没有直接写存储或伪造状态。依当前“构建可安装后才进入 Chrome”的门槛，未验证或安装 Task。

| 场景 | 当前状态 | 本轮证据与缺口 |
| --- | --- | --- |
| A 手动搜索 | **BLOCKED**；真实操作 `NOT_TESTED` | 包、参数、自然结果过滤及 Host 组件测试通过；没有真实百度/Run/Result/官网回传。 |
| B 一次自动执行 | **BLOCKED**；真实操作 `NOT_TESTED` | nonce、批准消费及页面组件测试通过；尚未验证真实“生成中批准→候选完整→自动执行”。 |
| C 网站异常 | **BLOCKED**；真实操作 `NOT_TESTED` | mock 少量/空结果、未知模板与构造异常结果解码有证据；未证明真实验证码、DOM 缺失/变化检测。 |
| D 安全边界 | **BLOCKED**；真实操作 `NOT_TESTED` | 组件测试覆盖身份、撤权、未知发送及草稿/附件/IME 等保护；真实 Chrome 生命周期及发送边界未验证。 |

本轮未发起真实 Bridge Run 或官网结果发送：**runId/resultId 未生成，实际结果条数与来源 URL 未取得，资源释放状态 `NOT_TESTED`，原会话回传次数未验证，AI 中文续答 `NOT_TESTED`**。本轮主动执行/发送次数均为 **0**，不表示已查询原对话历史。计划 URL 为 `https://www.baidu.com/s?wd=OpenDesk%20Browser`，不能冒充实际观察 URL；未运行也不能记为 `no_results` 或“0 条搜索结果”。

### 独立评分及下一步

独立只读 verifier 根据当前源码、组件证据和真实验收缺口评分；不是产品正确率或完成百分比，没有真实运行的分项仍未验证。

| 维度 | 分数 / 100 | 依据 |
| --- | ---: | --- |
| 目标完整性 | 50 | 主链已接线，最终真实门槛未证明。 |
| 核心业务能力 | 40 | 组件可验证，真实百度及持久结果未知。 |
| 架构复用 | 85 | 沿用 Catalog、Authority、Controller、RunHost。 |
| 安全可靠性 | 65 | 组件保护有证据，原生故障边界未测。 |
| 用户体验 | 45 | 按钮及草稿保护已实现，官网操作未测。 |
| 测试与证据 | 55 | 本机 48/48；完整构建和原生链缺失。 |
| **算术平均** | **56.7** | `(50 + 40 + 85 + 65 + 45 + 55) / 6`。 |

本轮**没有产品源码修复**，仅记录本机阻塞与证据。已有百度接线、任务选择、单次批准及固定网页回归属于源码/Node 已验证业务；当前阻塞是本地构建来源门禁，尚无百度或 ChatGPT 外部网站故障证据。

本机原始日志和身份记录位于 `artifacts/ai-chat-bridge-r20-mac-20261026/`：`production-build.log`、`production-build-clean.log`、`build-result.json`、`task-identity.json`、`relevant-inputs.json`、`snapshot.json`、`acceptance-summary.json`；临时产物不提交。该目录保留三次尝试及失败诊断。

后续仅在 Prompt Shortcuts owner 审阅并同步可信源码/pin 后，核对相关输入，重做一次 production 构建，再从 **P0 本机真实验证和安装**继续 A/B/C/D；相关源码及测试未变则复用本轮 48/48，不重复旧固定页面实测。操作顺序仍为：同窗口 Side Panel + `/c/...` 正式对话 → 选「百度搜索前三条」→ 输入关键词 →「建立请求」→ 用户官网发送 → A 等完整候选点「执行」；B 使用新请求，在生成中点「批准本次自动执行」，不点「执行」。

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
