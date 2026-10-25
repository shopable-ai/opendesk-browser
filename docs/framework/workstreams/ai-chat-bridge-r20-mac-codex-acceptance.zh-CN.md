# GOAL：OpenDesk Browser AI Chat Bridge R2.0-MAC · 百度搜索真实 Chrome 核心测试、最小修复与验收

**默认中文｜ORIGINAL GOAL FIRST｜LATEST MAIN｜LOCAL MAC REAL CHROME｜DELTA ONLY｜CROSS-CHAT DEDUP｜NO SECOND HOST｜NO FAKE PASS｜ONLY MAIN**

## 当前续推结果（2026-10-26 03:43，取代下方 03:00 状态）

**完整 production 候选已通过并在专属 CFT 中加载；百度真实闭环尚未完成。** 当前下一条用户操作是本轮 CFT 的「开发 → 本地项目」连接核对，不要求进入独立 `native-agent/workspace.html`。桌面控制工具目前误选其他 owner 的同名 CFT 实例，完整可执行路径不被接受，名称定位超时，截图不可用；未接管其他 Profile，真实本地项目按钮操作仍为 NOT_TESTED。已请求用户将本轮新窗口切到前台以继续定位。

- main 修复提交 **`ffa28ce9e285d448e1fabb4265cfbfc2482c41af`** 已普通推送。仅修改 `scripts/bundle-provenance.mjs`，新增 `tests/environment/ai-knowledge-source-provenance.test.mjs`。七个知识问答输入只进入现有 `ui/tool-shell.js`，其余输出、额外文件、安装包、字节漂移和软链接继续拒绝。
- 已复核并行 owner 的 `a1e0dab82`：adapter 增加原文档/代际保护；runtime 显示发送前错误，不重放 UNKNOWN。同步审阅后的 runtime blob `73870713cfead3a19c022c30bd274b4a3ee251b9` 与 adapter blob `fd56f20148aefe75cc2cc91187a831db0dbadcc1`，没有改写知识问答业务、权限、正式包或发行状态。
- **45/45** 知识来源、准入、Host、本地会话保护测试通过，**4/4** 共享构建边界测试通过。六核心测试文件无漂移，Bridge/Task 相关源码未变，复用此前 **49/49** 证据；未为无关 main 更新重跑全组。旧 Prompt jump pin 综合用例未改，其历史失败不冒充本轮通过。
- 完整 production / Standard 于北京时间 **03:38:26–03:39:12** 通过原构建器及包校验，114 项资产，固定构建图实际包含七个已审知识问答输入。普通文件快照为 `/private/tmp/opendesk-bridge-r20-reviewed-4jg8dutt`；独立守卫端口 55030；无 dev 连接。包指纹 **`6d2cf2358a44ca176279b1127fff3bd4a5d92059aac25099f3df97e8c6a94139`**，构建输入及根目录对照漂移均为 0。这取代旧失败快照的构建结论；不再安装旧部分产物。
- 现有隔离 CFT launcher 启动真实 CFT **155.0.8059.39 / PID 62917**，Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/opendesk-cft-rveg13yz`。其真实 `Secure Preferences` 记录该候选加载路径为上述快照 `dist/production`，扩展 ID **`lbgeeemomoheiblpdebgeofgjgjoakoh`**，未观察到 disable reasons。该加载记录不证明 Side Panel 或业务运行成功。
- 默认 Native 仅授权日常 `ccfcjegpkdlgbclopjmadlcjedelidmf`。使用已有官方 `OPENDESK_NATIVE_INSTANCE=bridge-r20-01a1748f opendesk browser setup --extension-id lbgeeemomoheiblpdebgeofgjgjoakoh --browser cft --user-data-dir <本轮Profile>` 创建专属实例，只写其私有 Profile manifest 和独立 instance。读回 `allowed_origins` 精确匹配本轮 ID；doctor 为 **installed=true / connected=false**，尚无认证连接，不记 Native PASS。未修改或清理默认 Native。

### 用户入口与固定 Task 身份

源码确认「开发 → 本地项目」已具备连接、项目选择、参数、明确运行与保存入口；独立文件工作区只在需要文件操作时使用。**真实完整可用性 NOT_TESTED**。注意本地「保存为任务」生成 `local-<hash>` 身份，不能替代 `baidu.search.top3@1.0.0`。固定任务仍从「我的 → 添加任务 → 本地任务目录」导入原 JSON，核对同源码真实运行证明后，经验证 → 本地可用 → 审阅安装。没有直接写存储。

G0 **PASS**；G1 仅加载路径/ID/专属 manifest 已核对，安装身份、代际、网站权限及 Native 认证连接 **NOT_TESTED**。

| 场景 | 当前结论 | 缺失的真实证据 |
| --- | --- | --- |
| A 手动百度闭环 | BLOCKED / NOT_TESTED | Task 合法安装、官网请求、真实百度 Run/Result、released、唯一回传及中文续答 |
| B 生成中批准自动执行 | BLOCKED / NOT_TESTED | 同候选真实时序及各一次运行、结果、回传 |
| C 网站阻断与 DOM 变化 | BLOCKED / NOT_TESTED | 真实网站观察；组件结果不能提升为原生结果 |
| D 身份、撤权、草稿与 UNKNOWN | BLOCKED / NOT_TESTED | 同候选真实操作；现有定向保护证据保留 |

固定 `sourceHash=1e2e3466b38d90c32513a7ce597fe6a283b986e61dd71f647241d8731ae80e45`、`manifestHash=e8abda7a51d234b1224dd626fbeeaa8ecc3ff63f2465c74433bef235dbf17bdf`、关键词 `OpenDesk Browser`、limit 3 均不变。实际 Candidate/Verified/Available/Installed/Enabled、installationId/generation、runId/resultId、实际结果数量/URL、释放状态和原会话回传次数仍 **UNKNOWN / NOT_TESTED**。本轮主动 Bridge Run、官网发送均为 **0**，没有用未运行冒充 no_results。

连接及固定安装完成后的按钮：正式 `/c/...` 与同窗口 Side Panel →「百度搜索前三条」→关键词 →「建立请求」→用户在官网发送。A 等完整候选后点「执行」；B 新请求生成中点「批准本次自动执行」，不点「执行」。`page.read.fixed@1.0.0` 的真实回归仍待执行。

六维证据评分（满分各100，非正确率）：目标完整性 **50**、核心业务能力 **40**、架构复用 **85**、安全可靠性 **65**、用户体验 **45**、测试与证据 **75**；算术平均 **60.0**。仅构建及可追溯证据增加，不提升未测业务结论。

### 证据与资源归属

本轮证据目录 `artifacts/ai-chat-bridge-r20-mac-20261026/receiver/`：`knowledge-source-review.json`、`knowledge-targeted-tests.log`、`shared-boundary-tests.log`、`core-evidence-reuse.json`、`reviewed-snapshot.json`、`reviewed-build-result.json`、`reviewed-production-build.log`、`reviewed-builds/build-production.json`、`production-summary.json`、`chrome-launch.json`、`production-runtime-identity.json`、`status.json`。这些本机产物未批量提交。

日常 watcher **PID 91386 / token 0832b303-1ac1-486a-9548-589b023346b5**、`dist/development` 和 `.wxt/public` 保留。其他 owner 的 `ai-knowledge-answers-r132-local-20261026.md` 未代提交。专属 CFT **PID 62917 / terminal session 25373** 与 Native instance `bridge-r20-01a1748f` 保留供继续本轮操作；原 launcher 负责其临时 Profile 生命周期，不终止其他 Chrome。无分支、Git worktree、PR 或强推。

原对话 goal 的 blocked 仅为交接状态；本对话实读 `get_goal` 为 null，未迁移、暂停或完成旧 goal，也未改应用数据库。

## 历史结果（2026-10-26 03:00，保留原失败与授权边界）

用户要求设置目标并继续推进，已在本对话创建原生 active goal。目标仍是百度真实闭环；尚未达成，不以组件测试或本报告代替。下一条未完成用户操作是：取得当前完整 production 候选后，核对真实 Task 安装身份，再执行场景 A。

**当前结论：两处已授权阻塞均解除；完整构建又暴露知识问答模块的来源门禁，记 `BLOCKED_BY_UNRELATED_OWNER`。尚未启动本轮真实 Chrome，A/B/C/D 均未实测。**

### 本轮已完成的最小工作

- `d1c9cacfa25330ee4a82f2fd92f4dcc1b78ea810` 只补强既有两份百度/Bridge 测试：完整流式候选出现前不能自动执行；验证码、缺失/变化 DOM 不得虚构结果。已有业务接线、固定 Task JS/安装包均未改。
- 官方 Page 目录最初导致六文件测试加载失败。原 owner 的 `ab2b895d0` 已修复文件名校验，随后重跑指定六文件 **49/49 PASS，0 FAIL，0 SKIP**。本轮没有应用旧提案中三条目录元数据修改，避免与 owner 重复开发；日志为 `artifacts/ai-chat-bridge-r20-mac-20261026/continue/core-tests-after-owner-fix.log`。
- 用户明确授权“这两处最小修复及必要测试”后，`897641eac5b481099bafccb85eab3cc0f2527229` 仅同步一个已独立审阅的 Prompt model Git blob pin：`9b29be376a28be9aa2958913ea7dc758459bb171` → `730496110c2ebc316eb74e1c29ac66dc74d60561`，并更新说明和必要测试。原有业务源码未改，未重新打包/晋升 Prompt JSON，未改变安装/发行状态。
- 审阅的是 `dffeec493` 已有 model 差量：移除退役的 Prompt 导航设置；提示词、图片引用、当前 `webButtons/imageSize` 及配额保留。旧导航偏好在下次正常保存时被丢弃，不承诺保留这五项历史偏好。精确字节、固定 target 和 symlink 拒绝门禁继续生效。
- **19/19 必要来源/数据回归 PASS**：包括三项 R1.2.2 model 用例、真实生产函数的容量/CAS/丢 ACK/未知写入不重放、8 KiB/32 KiB 限制，以及同字节仅允许两个 Host target、漂移和软链接拒绝。先前失败的测试驱动也已最小修复（缺失 `readModel` helper、过时生产函数边界、macOS 临时目录 realpath）；没有为旧断言修改业务。其余 Prompt 全套用例没有扩大运行；旧综合 provenance fixture 中其他模块的历史期望值不在本轮修复范围。日志为 `continue/prompt-model-tests-after-harness-fix.log`。

### 当前完整构建与真实阻塞

- production / Standard **静态验收候选**在普通文件快照 `/private/tmp/opendesk-bridge-r20-authorized-okdvdaey` 构建；源 main 为 `100bba3cdfb4c4438b2e55fe2f854bc30cb4a182`。北京时间 **02:57:24–02:58:05**，exit code **1**，没有成功包指纹。该快照不是 Git worktree，没有 dev 连接；失败目录的 `dist/production` 不可安装。
- 原 Prompt 门禁已解除；构建到 `[38/41] tool-shell` 后失败：`Historical/user/vendor code cannot enter a privileged fixed bundle: examples/sidebar-tools/ai-knowledge-answers/trusted/ai-request.js`。
- `src/ui/tool-shell.js` 静态导入知识问答 trusted Host，后者引入 `ai-request.js`、model 及 local-test-runtime；来源门禁中没有对应知识问答审阅登记。当前首个拒绝文件 Git blob 为 `e7adb932efbcf9e2b8a7961804ef1e486fd5c854`。这不证明只加该文件的 pin 就能完整构建，也不归因于最近一个知识问答提交；原门禁曾掩盖这项现存缺口。
- 此处超出用户本次“两处”例外，未增加新白名单、未修改知识问答业务、未应用通配来源豁免。需要该 owner 审阅实际静态输入与允许 target，并通过必要保护测试及完整构建；本报告不是该审阅。
- 构建失败 receipt 记录 724 个来源输入；与工作区对照相关输入漂移为 **0**。唯一额外快照漂移是无关热预览 `status.json`，不在这 724 个构建输入中；不能据此反复重建。
- 日常 watcher PID `91386`、锁 token `0832b303-1ac1-486a-9548-589b023346b5` 保留，未覆盖 `dist/development/.wxt/public`、未替换日常扩展。无分支、Worktree、PR 或强推。

原始证据位于 `artifacts/ai-chat-bridge-r20-mac-20261026/continue/`：`authorized-snapshot.json`、`authorized-build-result.json`、`authorized-production-build.log`、`authorized-builds/build-production-latest.json` 及其失败诊断。`proposed-unblock.patch` 是授权前未应用的旧提案，目录部分已被 owner 修复取代，禁止直接套用整份旧补丁。此前 48/48 与 Prompt 构建失败记录保留在父证据目录，属于上次观察；不能覆盖本节新结论。

### 六个必须逐项证明的条件

| 门槛 | 通过条件 | 当前证据 |
| --- | --- | --- |
| 完整构建 | 当前源码经原构建器、来源和包校验成功，随后记录 Chrome 实际路径/ID。 | **BLOCKED_BY_UNRELATED_OWNER**：知识问答静态来源门禁。 |
| 本机安装 | 真实 Candidate、Verified、Available、Installed、Enabled、固定双哈希、安装代际与网站权限全部核对。 | **NOT_TESTED**，不能把磁盘 JSON 当成已安装。 |
| A 手动闭环 | 官网用户发送→完整匹配候选→点击执行→真实 owned 百度 tab→Run/Result 各一→released→原会话一条回传→中文续答。 | **BLOCKED**；真实 **NOT_TESTED**。 |
| B 自动闭环 | 新请求生成中批准；不完整时零运行；完整后不点击执行仍运行/结果/回传各一次。 | 组件时序通过；真实 **BLOCKED / NOT_TESTED**。 |
| C 异常 | 验证码/无结果/缺失或变化 DOM 按实际报告，不伪造、不绕过、不无限重试。 | Task 源码分支组件通过；真实 **BLOCKED / NOT_TESTED**。 |
| D 保护 | 不重放、不跨会话、不覆盖草稿；身份/撤权/停用不符拒绝；未知 ACK 标 UNKNOWN 并只读核对。 | 原组件保护保留；真实 **BLOCKED / NOT_TESTED**。 |

磁盘百度候选 `examples/tasks/baidu.search.top3.v1.opendesk-task.json` 与现有 JS 同源，固定版本 **1.0.0**，`sourceHash=1e2e3466b38d90c32513a7ce597fe6a283b986e61dd71f647241d8731ae80e45`、`manifestHash=e8abda7a51d234b1224dd626fbeeaa8ecc3ff63f2465c74433bef235dbf17bdf`。计划网站 `https://www.baidu.com`，参数 `{query:"OpenDesk Browser",limit:3}`。本机 Catalog 各阶段及 installationId/generation 均 **UNKNOWN / NOT_TESTED**，未直接写存储。

本轮主动发起真实 Bridge Run 和官网发送均为 **0 次**；没有取得真实 runId/resultId、实际搜索结果数量/来源 URL、释放状态、原会话回传次数或 AI 续答。未运行不表示“无结果”或 `no_results`；也未据此声称已查询原会话历史。

用户之后的按钮路径：同窗口 Side Panel 与官网 `/c/...` → 选「百度搜索前三条」→ 输入 `OpenDesk Browser` →「建立请求」→ 用户在官网发送。A 等完整候选后点「执行」；B 用新请求，在生成中点「批准本次自动执行」，不点「执行」。当前先由知识问答 owner 解除来源门禁，暂不需要用户登录、发送或人工代跑普通测试；进入真实步骤后才需要官网登录和发送配合。

### 六维评分（本轮证据评估，非通过率）

| 维度 | 分数 / 100 | 实际限制 |
| --- | ---: | --- |
| 目标完整性 | 50 | 最终真实闭环未证明。 |
| 核心业务能力 | 40 | 组件通过，真实百度运行未知。 |
| 架构复用 | 85 | 沿用 Authority、Controller、RunHost、Catalog。 |
| 安全可靠性 | 65 | 定向保护通过，真实生命周期未测；来源门禁正确拒绝。 |
| 用户体验 | 45 | 按钮合同有证据，实际官网操作未测。 |
| 测试与证据 | 60 | 六核心文件 49/49、必要门禁回归 19/19；完整构建和原生缺失。 |
| **算术平均** | **57.5** | `(50+40+85+65+45+60)/6`。 |

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
