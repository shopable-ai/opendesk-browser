# GOAL：OpenDesk Browser AI Chat Bridge R2.0-MAC · 百度搜索真实 Chrome 核心测试、最小修复与验收

**默认中文｜ORIGINAL GOAL FIRST｜LATEST MAIN｜LOCAL MAC REAL CHROME｜DELTA ONLY｜CROSS-CHAT DEDUP｜NO SECOND HOST｜NO FAKE PASS｜ONLY MAIN**

## 新候选真实 Chrome 复测（IN_PROGRESS，用户要求重新测试）

用户反馈上一轮交付未清楚区分已修复与未完成，现补新候选的一条实际正常链路。Owner 沿用 `01a17828-4be1-7740-8498-0aada57a686c`，只写本记录与独立证据，不重复源码巡检/组件测试，不提交推送。当前 `main` 的五个本轮文件及七个并行 UI 文件未提交修改均保留。

Chrome 原生 AX 实读扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、开发服务已连接、实际 revision `4a43efd6848fed5959e6362a0872d5fbbaacc0e96e137f4214a11ae7bb5318b1`，与磁盘 marker 一致。沿用 PID `79949` / `127.0.0.1:43119` / `dist/development` 唯一 watcher。旧固定测试页的多行中文草稿保留；不开启或回放旧请求，不 reload 草稿页。改在新建官网测试页载入已编译脚本，先建立正式会话，再通过现有浮层发起新的固定网页请求，生成中批准一次自动执行，零执行点击；核对唯一 Run/Result、released、一次回传及新中文回复和完成提示。若未实际观察历史前缀移除，继续只保留组件证据，不制造长历史。

证据目录 `artifacts/ai-chat-bridge-r20-mac-20261026/native-retest-01a17828/`；开始时间 2026-10-26T21:07:49.202030+08:00。当前 Chrome 原生界面可用，未收到其他会话的资源占用拒绝；本轮只操作新测试页及当前侧栏的只读诊断/查询，不碰其他页面输入内容。

## 续答提示可靠性完善（2026-10-26 20:36，北京时间，开发收尾）

**最新结论：已证实并修复“历史前缀移除后 AI 完成提示漏判”的组件缺口；本轮定向回归 41/41 PASS，现有 watcher 已编译当前源码。该异常分支真实 Chrome NOT_TESTED；没有将旧页面的正常完成态提升为新候选原生证据。** 本节覆盖下文 19:43 对“AI 续答检测仍要求完整历史”的旧源码描述；原四场景和旧 FAIL/UNKNOWN 事实保留。

Owner：`01a17828-4be1-7740-8498-0aada57a686c`。仅在 `main` 编辑以下五个文件，未提交、未推送；未创建分支、worktree、PR 或新目标：

- `src/native-agent/chatgpt-fixed-bridge-page.js`：仅修改 `isChatGPTBridgeContinuation`。用户和 assistant 历史可分别移除最旧连续前缀，必须保留原请求/候选节点、唯一原结果用户节点及其后一个从未出现在旧快照中的新 assistant。仍要求原 route/document、节点连接、回复完成且非生成中；拒绝中间缺口、重建/移出文档、旧回复搬到结果后方、额外用户轮次和额外 assistant。
- `tests/environment/chatgpt-fixed-bridge-r13.test.mjs`：先红后绿的历史前缀场景；覆盖两类历史各 0–2 条移除组合，以及生成中、旧回复、换会话/文档、失去锚点、节点重建/断开等拒绝。
- `tests/environment/chatgpt-bridge-cancel-page-r21.test.mjs`：真实 page deliver 调用配合生产 `site.confirm`，在完整/缩短历史下分别完成手动→新请求单次自动；均确认 UI“真实结果已回传，官方 AI 已完成回复”，两请求各只一次发送，旧交付不能重放。模拟消息补充真实节点的 document/connected 属性。
- `examples/tasks/README.zh-CN.md`：解释“已收到结果、等待 AI”与“AI 已完成”的区别；提示未确认时先核对官网结果和续答，不因提示超时重跑或补发。
- 本工作记录：维护本轮归属、候选、验证和未测项。

Site/Host/Gate/Controller 源码及任务包均未改；前三个共享输入哈希与上一轮身份记录完全一致。没有新增 Host、队列、状态机、安装/授权入口或权限。原四场景只复用其原候选、原时间和真实身份，不重新运行，不提升为本次改动的同候选原生 PASS。当前并行 UI owner 的七个未提交文件均保留。

### 诊断、验证及失败分类

| 层级 | 结果和直接证据 |
| --- | --- |
| 缺陷复现 | **FAIL（修复前）**：仅移除最旧一条 assistant（users=0 / assistants=1），保留相同请求、结果用户及新完成中文回复，旧检测返回 false。组件复现，不声称原生触发。`prefix-before-fix.log` 保留。 |
| 组件 / 交付调用 | **PASS**：`node --test tests/environment/chatgpt-fixed-bridge-r13.test.mjs tests/environment/chatgpt-bridge-site-r13.test.mjs tests/environment/chatgpt-bridge-cancel-page-r21.test.mjs`，41 PASS / 0 FAIL / 0 SKIP；含发送前身份/草稿/附件/IME、未知点击不重放、缺 Host 提示、取消/迟到交付和准入否定保护。与历史测试重叠，不累加旧分母。 |
| 首次扩展测试失败 | 40/41 时只有新增交付模拟失败：模拟器自己的 confirm 仍要求完整历史。更换为生产 `site.confirm`，补齐其正常捕获的 userTexts 后通过；未改生产发送校验适配错误断言。保留 `targeted-regression.log`，最终日志另存。 |
| 语法 / diff / 审查 | **PASS**：修改的 page 和两份测试 `node --check`，本轮文件 `git diff --check`；独立 native code-reviewer 未发现 actionable 问题，只读审查、不操作 Chrome。 |
| 持续开发编译 | **PASS（限定增量产物）**：沿用 PID `79949` / `node scripts/dev.mjs` / `127.0.0.1:43119`，输出 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`。磁盘 revision `4a43efd6848fed5959e6362a0872d5fbbaacc0e96e137f4214a11ae7bb5318b1`；Bridge 文件与 marker SHA 均为 `1649f8fc1384b1b9212628d7d4dfc736ffe471704453e09de42ed953c65a04e2`，source map 内 page 内容逐字匹配当前源码。未另起 writer、全量 build 或替换加载目录。 |
| Chrome 观察 | **PASS（原完成态只读观察）**：保留固定成功会话 `/c/6adf35c3-a164-83ee-bbcb-33f591d971c9` 的原生 AX 显示《白鲸》中文续答及“真实结果已回传，官方 AI 已完成回复”。同页有 `PS-CORE-20261022-TEXT` 中文多行草稿，侧栏位于“网页剪藏 / 设置”；仅观察，未点击、清空、发送、重载或接管设置操作。没有发现需要新增 UI 修复的状态矛盾。 |
| 当前候选原生 / 安装 | **NOT_TESTED**：当前 Chrome 已应用 revision/开发连接未通过 UI 重读；不能据磁盘声明旧页面已注入。新源码的正常 Run 和历史移除异常均未在 Chrome 新运行；纯完成检测修复用生产交付调用定向验证，不为此制造长历史或影响现有草稿。官网新请求、新 Run、结果新发送均为 0。Task 原安装沿用旧事实；本轮未升级/重装，内部 installationId/generation 仍 **UNKNOWN**。 |

原始证据目录：`artifacts/ai-chat-bridge-r20-mac-20261026/continuation-01a17828/`；包括 `prefix-before-fix.log`、`prefix-after-fix.log`、`targeted-regression.log`（首次模拟器失败）、`delivery-after-harness-fix.log`、`targeted-regression-final.log`、`source-build-identity.json` 和 `review.json`。源码 page SHA 为 `ebbd12a958cdfc5ecc3a4503ca346d3720e1f587bb9034702e38ccbf9034b0f2`；其他详细输入见 JSON。不覆盖旧原始证据，不批量提交 artifacts。

**收尾与剩余限制**：本轮开发范围已完成，无新增 BLOCKED。现有 Chrome 草稿、页面、侧栏和 watcher 保留；未取得资源独占声明，也没有 UI 写入占用。后续正常使用仍是同窗口侧栏→已有官方会话→选任务→建立并官网发送→完整后执行或批准一次自动→观察唯一结果与新回复；旧网页仅在无进行中请求且保护草稿后使用正常刷新取得新脚本。移除当前请求/候选锚点或回复晚于观察窗口时仍保守标“官方 AI 回复仍待核查”，绝不自动重发。旧 UNKNOWN/旧 FAIL 原样保留；本轮 `get_goal` 实读为 null，未修改旧 complete 目标。production/正式验收、评分、全矩阵、宽度缩放、压力/变异/大规模故障注入继续延期。

## 当前核心链路续推（2026-10-26 17:00 起，北京时间）

### 最新结论：四个正常场景真实闭环完成（19:43 收尾）

本对话 `01a1776b-bcaf-7971-83b5-e58caffd808e` 的独立原生目标已设置，无 token 预算。以下是本轮最新核心结论，覆盖本节后面的早期 active、FAIL、UNKNOWN、待恢复及待重测描述；旧尝试保留原状态，不改写为成功。原生工具 `update_goal` 已返回 **complete**；累计用时 9382 秒（约 2 小时 36 分），无预算上限。结构化生命周期及证据见证据目录 `status.json`。

**`page.read.fixed@1.0.0` 和 `baidu.search.top3@1.0.0` 各一次手动、一次单次自动均 PASS。** 每个正常场景有意建立独立 requestId，在官方对话发送，经唯一完整匹配候选进入现有 Host，取得本次持久结果，按原 runId 查询 completed/released，原对话出现同一结果用户消息一次，随后有新中文 AI 续答。自动场景均在官网仍生成候选时批准一次，之后没有点击执行。百度两次实际返回 `success/count=3`，并非用程序 completed 代替搜索成功。

| 正常场景 | 北京时间 | requestId | runId | resultId | 结果 / 释放 / 回传 / 续答 |
| --- | --- | --- | --- | --- | --- |
| 固定页手动 **PASS** | 17:44–17:48 | `ddd3951f-ea4c-42d0-997d-170598c58f90` | `048f0c02-40a0-4e07-8538-685871b08b5f` | `f4a60d2e-bb4a-4b06-8db9-2bbf675f0a5b` | 真实 httpbingo；completed/released；1 条结果；中文续答 |
| 固定页单次自动 **PASS** | 19:13–19:15 | `05e2eb79-dc6b-4634-8625-0a537a2ae979` | `dd1592ef-e560-4eb4-b922-ac6904a05d93` | `16cf74d2-56a5-4d36-9191-3eab2fda1de3` | 真实 httpbingo；completed/released；程序确认 1 条结果并确认 AI 完成 |
| 百度手动 **PASS** | 18:58–19:01 | `99195b3c-b828-480f-9de9-98d2c89eebd8` | `4daf0439-bab1-434d-a7d7-5e4195f5da58` | `817b3333-3a1c-42a3-a117-41be02a1a4fb` | success，3 条自然结果；completed/released；1 条确认结果；实际中文续答完整可见 |
| 百度单次自动 **PASS** | 19:02–19:04 | `15303f19-976b-4a4b-b639-a40f701497b3` | `00c2fa97-98a8-48ef-b40b-43d93a26e602` | `79f0c729-4cee-407a-ae89-28d46f842f4d` | success，3 条自然结果；completed/released；程序确认 1 条结果及 AI 完成 |

固定页真实 `title` 为空字符串，`heading` 为 `Herman Melville - Moby-Dick`，正文节选 800 字符；没有填造标题。百度仅访问 `https://www.baidu.com/s?wd=OpenDesk%20Browser` 搜索页，读取当前 `www_index` 自然结果 1–3 的标题、摘要、原始百度链接，不点击结果链接。手动本次观察时间 `2026-10-26T10:58:44.972Z`，实际标题包括《我最喜欢的浏览器没了，我找到了四种方式「复活」它》《免费指纹浏览器该怎么选？常见工具与试用方案介绍》《普通人的电脑也能远程运行应用？PiDesktop 0.6.4 带来新变化》；自动本次时间 `11:02:09.521Z`，实际为 OpenDesk、openDesk/OpenProject、OpenProject 13.1 三条。两次当前排名不同，均保留真实原始数据，不替换成预置答案。百度手动曾在中文回复尚未被程序标记完成时读取 `aiReplyObserved=false`；其后实际完整中文续答由 AX/截图证实，不篡改这个历史标志。

19:31–19:34 另用新 requestId `45a4d9d4-071e-450d-bfcc-e9d4a266c2d8` 完成固定自动正常复测，run `6c2ff779-2680-4efd-8006-477b79c88dc3` / result `90e36e96-87ff-4d2a-a922-e27ff0991951`，同样 completed/released、一次回传、中文续答；不是 UNKNOWN 重试。此轮旧历史标记仍可见，**未原生触发历史前缀移除**，该异常分支只有定向组件证据。

#### A–H 关键条件的最新证据层级

| 条件 | 本轮结论及边界 |
| --- | --- |
| A 页面与引导 | 已有会话建立请求真实 PASS；首页实读“先发送一条消息或选择已有对话”且建立按钮禁用。换会话/document/轮次旧请求及批准失效由组件覆盖，不冒充原生异常测试。 |
| B 请求与批准 | 四个新请求均先官网发送，自动两次均生成中批准、零执行点击。完整前零运行、错误任务/关键词/旧回复/模型自授权拒绝是组件证据及正常时序观察；未放宽匹配。 |
| C 固定网页 | 本次真实网页标题/正文、精确 Run/Result 和释放 PASS；未用旧内容代替。 |
| D 百度 | 手动/自动均真实 success、3 条自然结果 PASS。广告/未知模块过滤及验证码、访问阻断、区域缺失、DOM 变化、无结果分类由定向组件覆盖；本轮未原生遇到这些异常，不标原生 PASS。 |
| E 手动与自动 | 四场景各独立 requestId、每请求观察一个 Run、一个持久结果、一条回传。自动批准后未点执行。重复点击/渲染去重是组件证据；原生未观察到追加运行或发送。 |
| F 生命周期与取消 | 四个原 runId 均只读查询到精确身份及 completed/released，另核查旧已知 UNKNOWN Run 的释放。取消隔离/迟到结果拒绝由组件覆盖；旧取消 ACK UNKNOWN 保留，绝不将 ACK 当 released。 |
| G 原会话回传 | 每条真实结果用户消息与新中文续答均在对应原 tab/对话观察，面板回传确认有证据。来源/安装/权限失效、草稿/附件/IME 拒绝由组件覆盖，未对使用中授权撤权。两份实际草稿均已恢复且未发送。 |
| H 未知结果 | 旧 UNKNOWN 不重跑、不补发；仅查询已知原 runId。无可靠 Run 映射的请求保持 UNKNOWN，没有猜最近历史。 |

#### 本轮最小修复、安装与候选身份

- **E_CHAT_TARGET**：真实首页缺少会话 ID 时明确原因和下一步，禁用建立请求；进入已有会话才恢复。没有放宽来源或会话身份校验。该修复及先红后绿回归已由并行 owner 纳入 main。
- **百度误拒**：持久参数对象键顺序变化造成同一合法参数被拒，双方统一经原严格请求解析器规范化后比较；改关键词/任务/未知字段等仍拒绝。先红后绿回归后，原生百度手动和自动均通过。此修复也已由并行 owner 纳入 main。
- **宿主未打开的引导**：实际发现网页浮层单独存在时，Side Panel Host 可能未响应。页面与说明明确要求同窗口 OpenDesk 侧栏保持打开；缺失回执仍记 UNKNOWN、禁止重放，没有新增第二 Host 或私自重试。
- **发送确认**：旧固定自动曾在可见 AX 历史缩短后报交付 UNKNOWN。不能直接读到当时 DOM 因果，因此保留该次 UNKNOWN。针对可复现组件缺口，确认允许仅移除最旧历史前缀，但仍必须保留相同当前用户节点和文本、连续历史后缀、同一会话及唯一精确新增结果；拒绝当前节点重建、缺锚点、中间缺口、额外消息或结果不同。发送前完整身份/编辑框检查和单次点击不变。新增回归先红后绿，随后新固定自动原生正常链路 PASS。AI 续答检测仍保守要求完整历史前缀；真的前缀移除时可能不显示程序 AI 完成，需要按实际回复观察，不能因此重发。

两个 Task 的实际安装均经既有「我的→添加任务→浏览任务目录」导入→原 Authority 真实验证→本地可用→版本/网站安装审阅；目录实读已安装，实际 Run Authority 准入及查询显示 `task:<taskId>:1.0.0 · r1 · <sourceHash>`，无存储造假、无再次启用、无静默升级。

| Task 安装身份 | sourceHash | manifestHash |
| --- | --- | --- |
| `page.read.fixed@1.0.0`，r1，已安装且真实准入 | `c2684b24d3e6ef9b0319703661d8d7b53014df60533608bcd697361cc70a99f4` | `14261d871732d67c97a8fa4e398ec8d2852e025d0ff4ff02e08546ac530de505` |
| `baidu.search.top3@1.0.0`，r1，已安装且真实准入 | `586fbf0f2d16a9bd00f17dd1b5e0b94171e799a53fe2d0d6edf9b86db0121cd3` | `6be4d039d123c89b51fba945d5997724de5948c3b839c1d2afa0b2dcfccd49ed` |

内部 `installationId/generation` 未通过现有目录、运行身份 UI 或授权查询暴露，仍记 **UNKNOWN**；上表是本轮可核实的实际安装身份，不伪造内部 UUID，不读取私有数据库。Task 源码和包均未改写。

当前为**持续开发**：Chrome 扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，实际加载 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`。原 watcher 退出后本轮经原输出锁启动 `npm run dev`，现有 watcher 保留运行；启动时实际 Quick Notes 外观/未用 asset 声明阻塞曾作最小修复并定向 3/3 PASS，已由其他 owner 集成，未发布它的正式包。本轮没有另起 writer 或停止其他服务。19:35–19:36 Chrome「调试→本地开发服务」实读 **开发服务已连接**，revision `d1c312360204e29d113d47a2bedab2f33fbe0484fddc33a17e0a86bd825619de`，与磁盘 marker 一致；Bridge `a25c42baf98433b70478d640750a27e590aa00ab39b1d473c4ad2b22b0b22fae`、SW `1da3cbcc25b3db1a5dd2853ffc8935619795f0a21de879ff4f41194a9d2c030b` 的实际文件均匹配声明。Native doctor 的 extensionId/allowed_origins 配对证据沿用本轮已核查结果。连接指纹不单独证明所有旧网页已重新注入；首页新文档引导、百度新请求和新固定自动均另有真实操作证据。

最后源码身份记录于 `final-source-build-identity.json`：当时 main HEAD `d01f35dc0b5afcbbe05a2b4031d83ce2cbc8de52`，page SHA `2a05c8eba07c26501e07a174e6405a15d9c0d8a6ef12de3f654274011a048037`，host `369c584f7e600360ff456d35685c0f3ff0dfe986f330a6af6930e6e806e2e9ac`，gate `1fca11aa1d54f988343c66fc1560ecf9533876e4bab8709edc5fb7300920f62f`，site `5f9da98585e26e764221ec6f1df040de9d0b6d0f38fe5b2e013e9b483b60e3ad`。四个场景在修复过程中完成，不能把收尾指纹倒填成每个旧文档的 JS 注入哈希。Task 固定源码身份始终如上表。

#### 验证与证据索引

本轮 Gate/百度相关定向测试曾 **35/35 PASS**；宿主缺失回执引导及发送确认改动后，site/page/fixed 三份受影响测试 **38/38 PASS**，两次存在覆盖重叠，不相加当独立测试总数。page/site 语法和 `git diff --check` 通过；独立 code-reviewer 未发现 actionable 问题，注明 AI 完成检测仍保守。没有因历史清单重跑全量测试或 production 构建。

证据根：`artifacts/ai-chat-bridge-r20-mac-20261026/core-01a1776b/`。

- 固定手动：`fixed-manual-ax.txt`、`fixed-manual.png`、`fixed-manual-final-query-ax.txt`。
- 固定自动：`fixed-auto-final-sent-generating-ax.txt`、`fixed-auto-final-approved-generating-ax.txt`、`fixed-auto-final-progress-ax.txt`、`fixed-auto-final-result-ax.txt`、`fixed-auto-final-query-ax.txt`。
- 百度手动：`baidu-manual-new-candidate-ax.txt`、`baidu-manual-result-sent-ax.txt`、`baidu-auto-result-sent-ax.txt` 中的完整前轮中文回复、`baidu-manual-success.png`、`baidu-manual-final-query-ax.txt`。
- 百度自动：`baidu-auto-sent-generating-ax.txt`、`baidu-auto-approved-generating-ax.txt`、`baidu-auto-result-sent-ax.txt`、`baidu-auto-query-ax.txt`、`baidu-auto-final-query-ax.txt`。
- 首页/收尾：`homepage-guidance-ax.txt`、`final-chrome-dev-connection-ax.txt`、`final-source-build-identity.json`、`fixed-auto-history-query-ax.txt`、`final-core-success.png`、`status.json`。原生 AX 文本可能截短长 JSON，保留的 request/run/result 身份与精确持久查询互证，不宣称截短内容就是完整导出。

两个草稿均已实际恢复且未发送：“你好”在原测试会话 tab `560068516`，长多行中文/emoji 草稿在项目页 tab `560068541`；证据 `original-draft-restored-ax.txt`、`project-draft-restored-ax.txt`，备份状态均 restored=true。保留固定成功页 `560068538`、百度成功页 `560068531` 及两份草稿页，旧用户 tab `560068366` 未接管。

旧尝试 `ea345ddf…`、`f9407c39…` 仍为交付确认 UNKNOWN，均未重发；已知原 Run 仅查询释放。百度 `0721f29e…` 的旧参数误拒仍 FAIL，取消回执 UNKNOWN；`35a6cc85…` 宿主缺失回执仍 UNKNOWN，无可靠 Run 映射，不猜最近记录。后来四场景用有意新请求验证修复，不覆盖旧事实。官网对话直接重开失败和浏览器 DOM 驱动超时属本轮环境/驱动观察，使用正常可用的官方 SPA 对话及原生 AX 完成，没有绕过工具拒绝。

普通用户操作见 `examples/tasks/README.zh-CN.md` 的 ChatGPT 章节：同窗口侧栏打开→选择已有官方对话→选任务→建立请求→官网发送→完整后手动执行，或发送后批准一次自动→等待结果与中文续答。当前没有阻止四条正常链路的未解问题；内部 UUID 未暴露、原生未触发的异常及保守 AI 完成提示按上述边界保留。production/正式发布验收、95+ 评分、全矩阵、宽度缩放、长压/变异/故障注入仍延期。

本轮仅在 main 工作，无分支/worktree/PR、无 commit/pull/rebase/push；本轮新增 page/site、两个回归与 README/本记录留待后续保存，其他 owner 的 Sidebar/打包/导航/书签管理/产品记录修改均保留。既有服务与日常加载路径不切换。

### 17:00–18:26 过程记录（历史快照，以下“当前/下一条”不再代表最新状态）

本节以本对话 `01a1776b-bcaf-7971-83b5-e58caffd808e` 的实读为准，覆盖下方历史阶段。`get_goal=null` 后已创建独立原生目标，状态 **active**，无 token 预算；未变更其他对话目标。目标为 `page.read.fixed`、`baidu.search.top3` 各一次手动和单次批准自动执行，直至同一持久结果 released、仅回传原对话一次且官方 AI 中文续答。production、评分、全量矩阵、宽度缩放及模型路由均延期。

18:26 后的新进展：只读确认原 watcher PID 36575 已退出且无替代 dev writer，故通过仓库原 43120 输出锁运行 `npm run dev`，没有停止任何其他服务。首次启动真实失败于 Quick Notes 的 layout-only CSS 重绘按钮；移除重复外观后，打包又明确报告已移除 logo 的遗留 `assets/mark.png` 声明。仅删除该未引用声明（图片文件保留），未修改打包器/设计门禁或已安装包。相关源码/列表编辑流程及真实创建包检查 **3/3 PASS**。随后原命令成功启动，唯一 writer 的 43119 服务 RUNNING，发布 revision `a27b5bfa27a51cfb17a582ddfcd7d396454ca3f5e22908018098baf495c26798`；SW/Bridge 文件哈希与标记一致。尚须从 Chrome 确认新 SW/文档生效，不能仅据磁盘声明百度修复已原生通过。本次环境变化中断此前 blocked 连续计数；目标保持 active。用户测试草稿仍备份待安全恢复。

关键条件及当前状态（18:07 更新；未满足四场景全部完成）：

| 条件 | 通过标准 | 本轮状态 |
| --- | --- | --- |
| A 页面/引导 | 已有会话可建立请求；首页可操作引导；换会话/document/轮次使旧批准失效 | 已有会话真实可建立；首页 E_CHAT_TARGET 已复现并修复源码/组件，Chrome 新脚本生效仍待核对 |
| B 请求/批准 | 官网先发送；唯一完整 taskId/args/requestId 匹配；不完整/旧回复/改参/模型自授权零运行 | 固定页手动/自动真实触发；完整前零运行等负例是组件证据。百度持久参数顺序误拒已修复，待新请求原生重测 |
| C 固定页 | 本次真实 httpbingo 标题/正文、Run/Result | 两个 Bridge Run completed/released，标题为空、H1《白鲸》、正文 800 字符，真实结果与中文续答均已看到 |
| D 百度 | 真实搜索最多三条自然结果；广告/未知模块排除；阻断/缺失/变化/无结果如实分类 | 本次手动在 reserve 阶段拒绝，尚无本次百度搜索结果；不能用安装验证的旧结果替代 |
| E 手动/自动 | 两任务四个新 requestId；每请求最多一个 Run/Result/回传；自动批准后不点执行 | 固定页手动 PASS；自动执行/结果/续答已观察，但交付确认 UNKNOWN；百度手动 FAIL，自动 NOT_TESTED |
| F 取消/释放 | 精确本请求 Stop；终态与 released 独立证明；迟到结果不交付 | 两个固定 Run 已用原 runId 持久查询确认 released；百度拒绝后取消回执 UNKNOWN，不能声称 Stop/released；迟到分支组件 PASS |
| G 原会话 | 原 tab/document/会话/轮次唯一真实用户结果及后续中文 AI；保护草稿/附件/IME和授权 | 固定页手动一次回传/中文续答；自动页面看到一次结果及续答，但程序确认 UNKNOWN；不重发。原草稿已备份，待恢复 |
| H UNKNOWN | 原身份只读恢复；不猜最近记录、不盲重跑或补发 | 本次已真实触发交付 UNKNOWN，只查询已知 Run，不补发；其余异常仍仅组件证据 |

本轮实际测试页为**新开的独立 tab `560068516`**，使用已能正常加载的官方测试会话 `https://chatgpt.com/g/g-p-6ac53d2f7814819191ac41eeec7cac11-opendesk-brower/c/6addf87f-9b78-83e8-8678-929e9e52ac3e`。原旧 tab `560068366` 未接管。进入时输入框已有普通草稿“你好”，先保存 `artifacts/ai-chat-bridge-r20-mac-20261026/core-01a1776b/draft-backup.json` 后清空本轮测试输入框；仍需在空闲时恢复。另一个首页恢复的长草稿未改写、未发送。

| 正常场景 | 北京时间（观察区间） | requestId | runId / resultId | 实际结果、释放、回传与续答 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 固定页手动 | 17:44–17:48 | `ddd3951f-ea4c-42d0-997d-170598c58f90` | `048f0c02-40a0-4e07-8538-685871b08b5f` / `f4a60d2e-bb4a-4b06-8db9-2bbf675f0a5b` | 官网发送→完整候选→执行一次；当前真实《白鲸》正文；原 runId 查询“已完成·资源已释放”；观察一条结果用户消息及中文总结，面板确认 AI 完成 | **PASS**（安装具体 ID 另待补齐） |
| 固定页单次自动 | 17:48–17:52 | `ea345ddf-cd41-4901-b7ec-8241a33c96c1` | `35310890-9773-4ae3-94d4-62e8c56760e0` / `c031edfe-bd4a-42bf-a899-b13cca868749` | 官网先发送，再点批准；未点执行；真实新 Run/Result，原 runId 查询 completed/released；AX 看到一条同 ID 结果及新中文续答；面板最终 `E_CHAT_DELIVERY_UNKNOWN：未观察到唯一的新增用户消息；禁止重发` | **UNKNOWN**，保留原消息不补发；生成中批准时序还须新场景证明 |
| 百度手动 | 17:54–17:57 | `0721f29e-9a53-4175-8f4c-47ab4d75037d` | 无可靠映射，不猜 Run | 官网发送及完整匹配候选已观察；点击执行后 `E_BRIDGE_CONTEXT：模型请求与用户建立的任务或搜索参数不一致`，发生于 Gate reserve、尚未准入 Host Run；本次结果及回传 0。取消后 UI UNKNOWN，不冒充停止证明 | **FAIL**，已修复字段顺序比较，待新请求重测 |
| 百度单次自动 | 未执行 | — | — | 不把旧本地项目 Run 充当本场景 | **NOT_TESTED** |

任务及实际安装：两者均经原「我的→添加任务→浏览任务目录」文件导入、原持久运行验证、设为本地可用、审阅固定版本与网站后点击安装，目录实读“本地可用·v1.0.0·已安装”，「我的」由原 3 项变 5 项；没有写存储伪造状态或增加再次启用。`page.read.fixed@1.0.0` sourceHash `c2684b24d3e6ef9b0319703661d8d7b53014df60533608bcd697361cc70a99f4`，manifestHash `14261d871732d67c97a8fa4e398ec8d2852e025d0ff4ff02e08546ac530de505`；`baidu.search.top3@1.0.0` sourceHash `586fbf0f2d16a9bd00f17dd1b5e0b94171e799a53fe2d0d6edf9b86db0121cd3`，manifestHash `6be4d039d123c89b51fba945d5997724de5948c3b839c1d2afa0b2dcfccd49ed`。installationId/generation 尚未由界面读回，明确 **UNKNOWN**；固定任务真实准入证明有效安装和权限，但不补造具体 ID。

固定页安装验证用本次独立草稿 Run `a970ea68-60fc-470b-aabd-59989de58223`，同源码、真实 httpbingo、completed/released，resultId 待查询；它不是四场景之一。百度安装验证复用经原 Authority 重新核对通过的同源码历史 Run `17ea3f0e-5008-4ff0-bedd-a64cc814adc9` / `792be814-4414-4511-a96c-824f648cc24a`；只用于安装证明，绝不冒充本轮百度闭环。

初始阻塞与分类：独立首页真实点击建立请求得到 E_CHAT_TARGET、未执行任务；发送测试消息后得到“测试会话已建立”，URL `/c/6adf169e-56e8-83ee-bdf1-b497007fa18b`，重新打开该页则官网两次“无法加载此 ChatGPT 对话”。原 SPA 后来又见 Extension context invalidated，未 mint/执行；转到上述可加载测试会话继续，不重放旧请求。Chrome DOM 绑定/定向只读查询持续超时，原生 AX 可操作；曾有前台竞争，用户明确回复“Chrome 可用”后继续。自动交付确认的具体 DOM 原因尚未证实，不为推测放宽消息身份检查。

实际开发环境：Chrome 扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf` v0.1.0，Developer，加载本仓库 `dist/development`、既有 `npm run dev` watcher PID 36575（本地开发实例标识已脱敏）；未替换、停止或另起 writer。「调试→本地开发服务」初读指纹 f567b329d9b5，后实读连接、revision `15f1ae650bc0580764d2d4b31597e22a808a840d29af376eb037fcc9ca58f94d`。Native doctor connected=true，local/response extensionId 及 manifest allowed_origins 精确匹配该 ID。17:57:39 SW 产物已由原 watcher 重编译，但 development-update 仍为 17:10:36 / 上述 revision，新 Gate 的实际加载尚未证明；仅只读核对 manifest、官方目录和 SDK/builtin 资源均有效，不直接发布 marker、不绕过安全刷新。已有业务文档保留旧注入生命周期，首页修复的 Chrome 生效仍 **NOT_TESTED**。

最小修复与验证：
- Bridge 首页说明缺少会话 ID 的原因及“先发一条消息/选择已有对话”，禁用建立请求；SPA 建立会话后恢复，保留原严格校验。对应两项先红后绿。
- 百度真实误拒触发新回归：模拟持久存储重排对象键，原 sameScope 直接 stringify 比较报与原生相同 E_BRIDGE_CONTEXT；改为双方经原 validateChatGPTTaskRequest 严格规范化后比较，不改变 task/query/limit、未知字段和旧批准限制。测试先红后绿。
- Gate 语法及三份相关测试 **35/35 PASS**（18 项百度/Host、14 项取消/页面、3 项固定页；总数以 TAP 为准）。覆盖完整前零运行、错任务/关键词、重复运行/发送、取消迟到、草稿/IME、安装权限/身份及 UNKNOWN。不将组件分支当作原生异常 PASS。无手工全量构建。
- 普通用户路径已补入 `examples/tasks/README.zh-CN.md`：安装审阅后可用；选择已有会话→选任务/关键词→建立仅回填→官网发送→手动完整后执行或发送后批准一次自动→真实结果/续答；UNKNOWN 不重试。

证据目录：`artifacts/ai-chat-bridge-r20-mac-20261026/core-01a1776b/` 的 `fixed-manual-ax.txt`、`fixed-manual.png`、`fixed-manual-query-ax.txt`、`fixed-auto-query-ax.txt`、`fixed-auto-unknown.png`、`baidu-manual-scope-failure-ax.txt` 和 `current-page.png`。原生 AX/截图与组件输出分别保留。手动/自动各次身份不同，未因 UNKNOWN 重跑或补发。

资源与并行：开始 main ahead5/behind36 是当时缓存；其他 owner 随后保存并同步 main（同步后曾实读 clean，HEAD `7b57806f7`），本轮首页/文档等改动已被其集成提交包含。本对话未 commit/pull/rebase/push，不冒称自己提交；本次新增 Gate/回归改动留 main。其他 Prompt、Reading TOC、Side Panel、Send Queue 及服务保留。`list_threads` 查询未返回，当前 owner 列表仍未知；不接管旧 tab `560068504`、不关闭其他任务或强制重载扩展。

18:16 补记：尝试有意建立新百度请求时，Gate 返回 `E_BRIDGE_SOURCE：原对话标签地址或窗口身份已变更`，未取得新 requestId、未准入 Run；不放宽 pending navigation/document 检查。随后原生前台实读变为另一个 `Send Queue Resume Test`，并出现其书签菜单，证明仍有浏览器资源竞争，本轮暂停点击并请求独占时段。发布 marker 所列 SW/Bridge hash 均与 17:57:39–40 watcher 产物不一致，安全发布未证明；`.wxt/public` 与 dist 公共资源逐字节一致，具体发布失败原因未知。其他 owner 新增 Send Queue 包/源码/文档/测试及 AI 产品记录均保留，本轮不覆盖。结构化当前证据见同目录 `status.json`；原“你好”草稿仍待安全恢复。

18:25 续跑：以实际 PID 查询确认原 watcher 36575 仍存活，发布 marker 仍旧，未重启服务。对同一 `560068516` 的后台 URL 元数据查询正常，DOM 只读与错误日志读取各再次超时；未执行新任务或发送。已为此未完工作页标记 handoff。独立原生 code-reviewer Parfit 只读审查本轮 Gate 与新增回归，未发现引入问题，确认任务/参数、一次批准、重放和撤销限制保留；语法/diff 检查通过，未重跑 35 项测试或冒称 Chrome 通过。审查证据 `gate-review.json`。当前无法取得浏览器独占或 watcher owner 的实时协调状态，仍等待外部资源条件改变；本轮计为同一资源阻塞的第二次续查，目标保持 active。

下一条：只在当前候选安全生效后，以新 requestId 重测百度手动/自动；为固定自动 UNKNOWN 定位可证实原因，保留旧请求不重放；补齐安装 ID、首页原生引导、必要取消负例并恢复“你好”草稿。目标仍 active，未达到 complete。

## 本轮分段方案（2026-10-26，按首轮独立评审修订）

本轮目标是完成「目标网页证据 → 验证源码 → 固定任务 → 正常触发 → 原会话回传」。继续在 `main` 和日常 `dist/development` 开发，复用 PID 76837/76857 的 watcher，不进入历史 production 验收。下面的方案质量评分与实际运行状态分别记录；本节优先于下方历史阶段。

### 当前目标、关键测试与通过条件（用户于本轮明确要求）

**当前开发阶段目标**：修通固定 Task 与原 Bridge 的实际合同差异，补齐本次请求的取消所有权；保存可执行方案，两位独立评审各≥95/100，受影响定向回归无失败，安全提交本任务文件到 `main`。这一阶段可独立完成，不能代替下面的真实用户闭环。

**最终核心用户操作目标**：原固定 `baidu.search.top3@1.0.0` 安装后，在原 ChatGPT 会话请求搜索 `OpenDesk Browser`，读取百度前三条真实自然结果，获得同一次持久结果及资源释放证据，只回传原会话一次并观察中文续答；手动执行和「批准本次自动执行」分别用一个有意新请求验证。若真实网页受阻或变化，必须如实返回状态，不以预置三条或重复执行制造成功。

| 关键测试 | 明确通过条件 | 当前证据 / 尚缺条件 |
| --- | --- | --- |
| 真实提取与模板边界 | 普通结果前三条字段来自当前 DOM；广告/未知模块排除；验证码、区域缺失、DOM 变化和无结果如实区分 | 已有真实 run/result 可复用；新增 Host `www_index` 合同回归通过。导出 URL 带原搜索参数，仅作提取证据，不冒充精确 owned URL 的安装后运行。 |
| 固定保存与安装 | 源码/包双哈希相符；原 Authority 验证同源码真实 Run；原安装审阅后可用，取得真实 installationId/generation/enabled 与网站权限 | 源码/包已保存、Node 身份检查通过；安装 NOT_TESTED，须现有侧栏入口可被合法操作。 |
| 手动触发与自动批准 | 同一 request/turn/answer/Task/参数只运行一次；完整回复前零运行；第二点击、旧批准、错会话/文档均不能再运行 | Node 准入及去重通过；两个原生流程各需同候选真实 Run、resultId、released，不能借本地项目结果充当。 |
| 停止/取消与发送竞态 | 取消先本地阻断，精确持久撤销；只 Stop 自己的 runId；迟到授权/claim/结果不能继续；released 后仍可取消未发送结果；原生点击已尝试则 UNKNOWN，不承诺撤回 | Node 时序检查通过；真实按钮、Native Stop 和释放证据 NOT_TESTED。停止 ACK 不等于释放。 |
| 原会话唯一回传 | 固定安装/权限/来源最后检查通过后，原生发送一次，观察同一结果用户消息和对应中文新回复；草稿/附件/IME 不覆盖 | Node 固定来源/撤权/草稿保护通过；官网操作须明确授权，涵盖初始请求及结果回传；当前原生回传 NOT_TESTED。 |
| UNKNOWN 与恢复 | 已知原 runId 只读核查；只有 requestId 无可靠映射则保持 UNKNOWN；不猜最近记录、不补发、不重跑 | 保守恢复条件已写明；发送/Stop ACK 丢失的 Node 检查通过，原生故障注入不属于当前开发范围。 |

**完成与停止条件**：本轮开发收尾须源码修复、定向检查、同口径独立评审、`main` 安全提交和未验证项记录齐备；最终核心完成须上表真实安装、两种触发、持久结果/释放及原会话唯一回传逐段证实，测试数量与方案分数均不能替代。当前扩展 URL 策略拒绝时停止该原生分支，不换工具或私有接口绕过；官网发送缺少明确授权时不发送。验证码交由原网页正常处理；身份/权限变化、未知副作用或 ACK 丢失停止本次链。其余可独立工作继续，证据仍有效且输入未变化不重复测试。不自动进入 production、完整矩阵、宽度缩放或任意网页 AI 自主生成。

**当前下一条真实操作**：在原侧栏「我的 → 添加任务 → 导入任务文件」选择 `examples/tasks/baidu.search.top3.v1.opendesk-task.json` →「浏览任务目录」→展开「开发者：核对证据与设为本地可用」→在「已完成的真实运行 ID」填入 `17ea3f0e-5008-4ff0-bedd-a64cc814adc9` →「核对运行证据」→「设为本地可用」→「安装选定版本」并完成现有安装审阅。运行证据字段由工程操作者处理，不新增普通用户技术表单。`task-workbench.js` / `react/tabs/task-catalog.tsx` 已有侧栏目录，不必打开独立扩展标签页。此操作尚未执行：交接已记录浏览器工具拒绝 `chrome-extension://`，本轮不改用另一自动化入口、私有接口或浏览器数据库绕过。安装身份未知，不据此启动 Bridge。能独立完成的本地修复与评审继续。

| 段落 / 用户操作 | 输入与输出 | 持久事实与完成证据 | 失败恢复 |
| --- | --- | --- | --- |
| 1. AI 辅助理解目标网页 | 输入是用户关键词、精确目标网页和只读 DOM；输出是普通结果/广告边界、选择器与预期字段。当前只确认 `#content_left .result.c-container` 的 `se_com_default`、`www_index`，读取标题/摘要/链接，不访问结果链接。 | 当前代码由 Codex 依据真实 DOM 辅助修订；已有原始结果的 runId/resultId 和导出 SHA 见下节。**尚未接通产品内 AI 自主观察/生成代码**，网站文本仅为不可信数据，不能发指令。 | 验证码/安全验证停止并提示人工在原网页处理；不能自动破解或循环重试。未知模块保守排除，不能猜选择器、扩大模板白名单或把 AI 的推测记为 DOM 证据。 |
| 2. 在「开发 → 本地项目」明确运行验证 | 输入为固定源文件、`{query:"OpenDesk Browser",limit:3}` 和百度 `/s` 精确查询；原 RunHost/Worker 词法 `page/params` 输出有状态的真实结果。 | 复用 `17ea3f0e-5008-4ff0-bedd-a64cc814adc9` / `792be814-4414-4511-a96c-824f648cc24a`，真实 count=3、slot=1/2/5、`www_index`、completed/released；源码 SHA `586fbf0f…121cd3`。正式验证仍由原 Authority 读原 ledger，不把导出 JSON 当可导入证明。 | `blocked`、`dom_unavailable`、`dom_changed` 均不是提取成功；`no_results` 表示真实无结果，不等于本次前三条成功。Controller completed 只表示程序正常返回。缺失 DOM/未知模板不得保存为空结果成功。停止、断线或回执未知按下方原身份规则核查，不重放。修源码后必须有新的有意 Run。 |
| 3. 保存、固定和安装 | 源码及同源 JSON 已在仓库保存，可再次找到；本例必须导入固定 `baidu.search.top3@1.0.0` 包。通常本地项目「保存为任务」可复用，但会生成 `local-<hash>`，不能接入本例的固定 Bridge。 | 原 Candidate → verifyTaskCandidate(runId) → Available → 审阅安装；原 Authority 校验同源码、当前内置库身份、原生操作成功回执、released。核对完整 sourceHash、manifestHash `6be4d039…cd49ed`、installationId/generation、enabled、网站权限。保存源码/包不等于已安装。 | 证明不再适用则明确新 Run，不伪造或手写 ledger。安装 ACK 未知只查原 Task 记录；版本/权限变化重新审阅，拒绝则停止。已安装版本不静默换字节；修改另增版本并重验。正常安装后不增加第二次通用启用步骤。 |
| 4. 正常手动触发 | 安装核对完成后，在原 ChatGPT 精确会话选择任务和关键词→建立请求→用户在官网发送→完整且唯一匹配候选→用户明确执行。AI 只选择允许的 Task/参数，不能提交任意 JS。 | 原 Trigger Ledger 固定 requestId/turnKey/answerKey、精确 tab/document/会话；原 Authority/RunHost 创建 owned 百度目标。一次有意触发得到一个 runId、一个持久 resultId 和 released。 | 网站阻断或 DOM 变化返回真实状态，不编造结果、不自动改写或重试。换会话/文档、任务身份变化、权限撤回、停止/取消均阻断后续交付；迟到回包不能解除取消。UNKNOWN 按下方规则核查，不能当作未执行。 |
| 5. 原会话唯一回传与批准分支 | 原 Bridge 校验持久结果、固定任务/版本/安装代际、精确会话，按真实 status/count 一次回传。手动链通过后，用新请求验证「批准本次自动执行」；两条均属于当前核心范围，不能只验手动就称全部完成。 | 记录唯一回传、原会话用户消息观察及中文 AI 续答；批准分支必须在生成中批准、完整候选前零运行、完整后运行/结果/交付各一。草稿/附件/IME 占用不得覆盖。运行与交付可分别失败，不能混成整体成功。 | 发送 ACK 未知标 UNKNOWN，保留已有原身份只读核对，不再发送。自动操作官网须人类明确授权，范围同时涵盖初始请求和真实结果回传；当前交接/建新对话授权不覆盖这两次发送，尚未取得该授权。 |

### 已完成的最小修复与取消所有权

`chatgpt-fixed-bridge-host.js` 的持久结果校验原先拒绝 `evidence.tpl="www_index"`，与已通过真实百度运行的固定 Task 输出不一致；现已仅补上该已观察模板。Task 字节/双哈希、Origin、权限和安装身份保持原合同。另修正原 Trigger Gate 对 `/g/g-p-…/c/…` 项目会话的误拒；仍精确绑定真实 sender、tab、document 与当前完整 URL，未知路由不开放。

首轮独立架构审阅发现 Bridge 没有自己的停止入口：编辑器的 Stop 属于另一个 ownedRunId，不能替代 Bridge 取消；RunHost released 后也不能保护等待中的网页发送。现已在原 Bridge 加入「停止/取消」：页面同步设置取消栅栏；原 Ledger 按真实来源和 requestId 串行持久撤销 prepared/approved/consumed；原 Bridge Host 仅在获得自己的 claim.runId 且等于共享 Host.currentRun 时调用原 Stop。取消不等待撤销 ACK 才停止本页继续执行；撤销和 Host cancel 并行提交，迟到 authorize、claim、completion、check-delivery 均不得解除栅栏。claim 迟到后仅停止自己刚取得的 Run；没有已知 runId 时不能借用共享 Host 的其他运行。

运行停止与结果交付分开：released 后仍可取消发送；已写入的草稿不删除；原生 commit 前同步关闭取消入口，仅明确 `retry:true`（未尝试点击）才恢复。Host 已分发 deliver 后保守报告交付 UNKNOWN，不能承诺撤回已尝试发送的消息。停止/撤销回执丢失维持 UNKNOWN，不能声称停止、释放或持久撤销成功，也不补发 Stop 或结果。Host 在同步核对真实 sender 的扩展、主文档、窗口和原请求身份后立即建立 deny-only 取消栅栏，再并行原 Stop 与异步来源查询；查询挂起或失败不能恢复执行/交付。

复评还发现已释放的旧输入框 claim 会阻断下一请求回传，现将 claim 检查限定到本次 deliver，全局引用只负责导航清理；当前 claim 被用户接管后仍永久拒绝本次发送。不同 requestId 的「手动成功 → 自动批准成功」可以连续运行；旧 UNKNOWN marker 不会因新请求而被清除、替换或绕过。

已以先失败后修复的定向回归覆盖模板差异、Bridge Stop、原 Ledger 撤销和连续交付；整合后 **61/61 Node 检查通过**，覆盖已知模板一次交付、未知/广告拒绝、精确项目会话、只停自己的 Run、迟到 claim/完成/交付、异步来源查询挂起/失败、released 后取消、原生 commit 边界、撤销持久写失败、连续手动/自动请求，以及原固定 Task 的身份、撤权、草稿/附件/IME 与 UNKNOWN 不重放。命令为 `node --test tests/environment/chatgpt-baidu-bridge-r20.test.mjs tests/environment/chatgpt-bridge-cancel-page-r21.test.mjs tests/environment/chatgpt-fixed-bridge-r12.test.mjs tests/environment/chatgpt-fixed-bridge-r13.test.mjs`。复用原百度提取16项中未受影响的脚本证据，没有重复脚本全组或运行全量构建。导出的真实结果仅供离线模板兼容检查，不伪造 saved Task 运行证据或 Chrome PASS。既有 watcher 自动重建后只读核对相关输出；没有实际已加载指纹/连接证据时标未知，不拿磁盘 revision 或进程存活替代。

**UNKNOWN 的实际恢复边界**：已有确切 runId（包括停止回执显示的「运行 ID」）时，在「我的 → 对应任务 → 运行记录 → 对应记录 → 技术信息」核对同一 runId、resultId 与执行状态；列表仅最近8条，未显示不能推断未运行。该投影不含 retirementState，不能据此宣称资源已释放；释放需工程操作者经原授权 Controller 客户端查询 `snapshotControllerRun({runId})` 的 retirement 事实，不能为此绕过工具 URL 策略。只有 requestId、start ACK 丢失而 runId 未知时，当前 Trigger Ledger 没有 request→run 映射，无法可靠定位；保留 UNKNOWN、停止当前链，不按时间/关键词猜记录，不重新执行或发送。安装 ACK 未知只核查原 Task 安装记录，不能用该 requestId 推断运行结果。

普通用户只需要现有项目运行、任务包导入/审阅和官网请求按钮；哈希、代际及证据核对由工程记录承担，不增加技术表单。没有观察到现有入口缺陷时不重构 UI。原 `page.read.fixed` 身份保持原样，因只改百度结果分支，选择原固定 Task 的直接合同回归，真实 Chrome 回归保留 NOT_TESTED。

### 方案评审与停止条件

两名独立原生子代理分别做架构审阅和批判审阅，继承父任务模型/provider，作者不兼任评审。固定评分维度共100：需求完整性15、分段依赖及持久状态15、架构复用及身份15、选择器可靠性15、权限/生命周期20、用户操作成本10、可验证性及证据诚实10。要求给真实分数、代码证据及缺口；低于95则针对缺口修订并以同一口径复评，不修改评分标准凑分。最终评审全文/agent ID 保留于本机 artifacts；分数仅评价方案，不证明运行通过。

首轮架构评分 **93/100**、批判评分 **94/100**，均未达到95；首次修订后批判评分96，架构复评94并发现上述连续请求 claim 与异步取消栅栏问题。两项已补红→绿回归并最小修复，再按原评分尺度独立复评；历史分数与缺口保留，不能只展示最高分。

最终独立复评：架构 **98/100 · PASS**（Faraday，`01a176db-6fd6-7910-b161-dfc7dcfab88b`），批判 **96/100 · PASS**（Mencius，`01a17708-7451-78d3-bc37-7704fb05348f`）。七维分别为架构 `15/15/15/15/19/9/10`、批判 `15/14/15/14/20/9/9`，均采用上述固定分值。评审者只读核对实现与测试、未重跑61项；测试由主代理执行。两者均未发现阻断当前最小开发链的源码问题，均明确原生核心链尚未通过。完整首轮、二次及最终正文保存在 `artifacts/ai-chat-bridge-r20-mac-20261026/segmented-core/`，最终为 `final-reviews.json`；`status.json` 记录相关源码/测试哈希与开发产物观察。

本阶段只有真实提取、固定安装、手动和本次批准自动触发、唯一持久结果及 released、原会话唯一回传/中文续答逐段证实才算核心完成。当前提取已通过；保存源码/同源包及本地修复已完成；安装、正常固定触发、回传、批准分支、原生取消和项目会话均 NOT_TESTED。产品内 AI 自主观察/生成尚未接通，明确延期为独立产品工作，本次仅交付 Codex 辅助修订的固定任务链，不能宣传任意网页自主生成。工具策略阻断的原生步骤准确保留，先完成可独立修复工作，再交付最小实际按钮路径；不绕过限制、不重复创建对话、不恢复旧 production/全量矩阵/宽度缩放验收。

## 当前开发结果（2026-10-26 13:38 后，取代下方历史阶段）

当前阶段为**日常 Chrome 核心开发**，复用 `npm run dev` → `dist/development`；不继续下方旧 production 验收、完整矩阵和评分。真实扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，开发服务与 Native 均已在界面观察到连接。

- 已通过百度首页正常搜索 `OpenDesk Browser`，没有绕过安全验证。原源码真实返回 `dom_changed/count=0`；页面 DOM 证明普通 `.result.c-container` 使用 `tpl="www_index"`，旧脚本仅接受 `se_com_default`。仅加入这个已观察的普通模板，广告、未知模板、精确网站/关键词及 URL 校验保持生效。
- 开发页 Controller 参数已修复并提交 `f644b3995`：Native 列表缺少 runtimeKind 时，使用核验产物的 runtimeKind 显示参数入口，不把准备操作当作执行。
- 修复后以相同参数 `{query:"OpenDesk Browser",limit:3}` 执行，真实 **runId `17ea3f0e-5008-4ff0-bedd-a64cc814adc9`**，**resultId `792be814-4414-4511-a96c-824f648cc24a`**；返回 `success/count=3`，界面显示**已完成 · 资源已释放**。三个结果为 OpenDesk、OpenProject/openDesk 和 OpenProject 13.1；证据 slot 为 1、2、5，均为 `www_index`，未把可见广告和百科特殊模块纳入结果。
- 原结果经现有「下载结果 JSON」导出，SHA-256 `fff89039d3c4999de30a88997dc1d460423ba8c2b64bf829a81b0ad62541657a`；原件保留在 `artifacts/ai-chat-bridge-r20-mac-20261026/result-17ea3f0e-5008-4ff0-bedd-a64cc814adc9.json`。下载原件证明结果身份；释放结论来自原生侧栏状态，未直接读取或修改浏览器存储。
- 本机任务目录显示为空；该候选尚未导入/安装。经原 `createTaskPackage` 校验还发现旧 `limit` 参数缺少必填 title，已补齐。未发布的 `baidu.search.top3@1.0.0` 候选同步源码与 Manifest；当前 **sourceHash `586fbf0f2d16a9bd00f17dd1b5e0b94171e799a53fe2d0d6edf9b86db0121cd3`**，**manifestHash `6be4d039d123c89b51fba945d5997724de5948c3b839c1d2afa0b2dcfccd49ed`**。Bridge 仅同步这两个精确身份值，没有放宽固定任务准入；下方旧哈希仅为历史证据。
- 16 项定向测试通过：真实导入合同、源码/Manifest/Bridge 同源、当前普通模板、广告和未知模板排除、空结果/验证码/DOM 变化、精确参数及现有 Bridge 身份/撤权/去重/未知回包保护。未执行全量构建或 production 验收。

**用户随后明确继续使用侧栏「开发 → 本地项目」，无需打开独立任务目录；这条开发运行链已实际完成。** 本例是 Controller 自动化，业务仍在原任务源码中，不改成 Sidebar Tool。浏览器工具曾拒绝观察 `chrome-extension://…/sidepanel.html` 任务目录，原因是其 URL 策略只允许 HTTP(S)，不是百度再次出现验证码；未改用其他自动化接口绕过拒绝。后续若继续原固定 Task 的 ChatGPT Bridge，仍须走原「我的」任务导入、同源码 runId 核对与安装链，不能以本地项目运行替代安装身份。实际安装身份/代际、原会话回传、自动分支及 `page.read.fixed` 真实回归仍为 **NOT_TESTED**，不再把独立目录作为当前本地项目开发的前置条件。

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
