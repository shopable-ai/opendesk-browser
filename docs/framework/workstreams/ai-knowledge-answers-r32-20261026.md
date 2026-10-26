# AI 客服 R3.2 · 多问题与产品界面增量（2026-10-26）

## 文件 owner、最新基线与去重
- 本次由 R3.2 AI 客服业务 owner 在唯一 `main` 上处理；初始读到 `c8b332cd557caf3ba004167dad3630976b4c1fc6`。
- `9fcf243..main` 差异未触及 AI 客服业务目录；R1.3 / R2.1 / R3.1 原 Host、Provider、包、去重、回执、UNKNOWN 不重复开发。
- 本轮写入范围：`trusted/multi-intent.js`（新增纯业务路由）、`trusted/local-test-runtime.js`、`trusted/Workspace.jsx`、`trusted/workspace.css`、`preview/index.html`、`tests/environment/ai-knowledge-multi-intent-r32.test.mjs`、`app.ci.json`、`README.zh-CN.md` 和本记录。必要时仅处理与 UI 去测试化直接相关的 `src/`，必须守住正式包的来源晋升门禁。
- 共享框架 `src/`、Host、Shared Provider、安装器、发行 JSON 默认不写；不得新增第二套工作流或自动发送许可。

## 真实用户操作 → 当前行为 → 最小增量 → 证据（执行前）
| 真实操作 | 现有缺口 | 归属 | 验证目标 |
| --- | --- | --- | --- |
| 客户发「你好」 | 整串被按一个知识问题检索 | 纯路由 + Runtime | 安全问候模板、不调用 Provider、不自动发送 |
| 客户发「退款期限是多少？何时发货？可以上门安装吗？」 | 单条 lookup，无分题来源、无合成 | 纯路由 + Runtime + Workspace | 2 个可靠固定来源、1 个无依据；只生成一条待审草稿 |
| 模糊退款时长/实时订单信息 | 检索可能返回语义不确定候选 | 纯路由 | 澄清/转人工，不编造数据、无业务 API 调用 |
| 人工确认多问题草稿 | 原发送只接受单题固定或 AI 草稿 | 原 Runtime 最小扩展 | 检查 ETag、暂停、来源、原会话、可信点击、一次发送、独立 DOM 回执 |
| 打开正式界面与预览 | 测试功能与产品名称界限不够清晰 | Workspace + 原 preview | 技术详情默认折叠，测试控制保留在预览产品容器之外、提示真实本地适配范围 |

## 执行证据与遗留
- 当前记录是开始实施时的所有权声明，**不是通过声明**。
- 后续仅写经实际检查的 `SOURCE_IMPLEMENTED` / `NODE_PASS` / `PREVIEW_BROWSER_PASS` / `CHROME_PASS` / `REAL_PROVIDER_PASS` / `NOT_TESTED` / `BLOCKED`。
- 原 R3.1 [158/158 Node PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/40284151167) 不属于本轮新测试。


## R3.2 真实实施记录 · 增量清单与文件归属（后续补录）

### 文件实际变化

| 文件 | 变化及实际安全约束 |
| --- | --- |
| `examples/sidebar-tools/ai-knowledge-answers/trusted/multi-intent.js` | 新建有界多问题业务路由，纯知识函数；源 ID 独立、RAG 候选限于旧 `model.lookup`、陌生订单动作交人工、含糊退款时长澄清；问候模板无 AI |
| `examples/sidebar-tools/ai-knowledge-answers/trusted/host.js`、`trusted/ai-request.js` | 在**原**可信 Host/Shared AI Consumer 增加可选逐题来源允许列表，准备页列出的来源与实际外发引用一致；不在原模型召回列表中的 ID 在 Provider 请求前拒绝，不新建 Provider 或 Host |
| `examples/sidebar-tools/ai-knowledge-answers/trusted/local-test-runtime.js` | 原 R1.3 监听接入路由；每条消息保留子题、原始来源和基线。复用旧 10 分钟/20 消息许可、自动单题固定答案和原 `send`/`reconcileUnknown`。多问题、问候、AI 一律原点击人工审核及 ETag/来源/线程核对 |
| `examples/sidebar-tools/ai-knowledge-answers/trusted/Workspace.jsx`、`workspace.css` | 不再以「本地测试」作为业务标题；改显示「客服会话」、监听和客户消息、逐题答案、单条草稿；底层来源、回执、统计折叠。响应式宽度规则已写，真实截图仍需 Browser |
| `examples/sidebar-tools/ai-knowledge-answers/preview/index.html` | 保留既有真实 `src/` HTML/CSS/JS/model 载入；开发工具（宽度、seed、故障）移到产品容器之外并折叠；纯业务检查直接 import 新路由；删除旧假的 AI 草稿演示 |
| `tests/environment/ai-knowledge-multi-intent-r32.test.mjs` | 新增 Node/fake Chrome tests；合并到原 `app.ci.json`，不新建 CI 框架 |
| `tests/environment/ai-knowledge-chat-r13.test.mjs` | 只更新六处受新澄清规则影响的旧 AI 候选提问样例为明确申请期限；不跳过旧安全断言 |
| `examples/sidebar-tools/ai-knowledge-answers/README.zh-CN.md` | 记录永久路径、HTTP 启动命令、来源权限边界、样例、正确证据级别与 Mac Codex 下一步 |
| 本记录 | owner、差量、可复核证据、延期项与质量审计 |

**明确未修改**：`src/` 沙箱业务与唯一 0.1.5 `*.opendesk-tool.json`、共享 Provider、Framework/SDK、安装器及第三方网页 Adapter。因未修改沙箱发行输入，不得凭可信宿主源码变化升级工具 JSON；原沙箱历史「测试知识回答」标题仍是 R3.2 的剩余 UI 差量，不声称全面去测试化。

### 执行证据（准确等级）

1. **SOURCE_IMPLEMENTED / ISOLATED_V8_SMOKE_PASS（非 Node CI）**：在 GitHub 提供的实际 `src/model.js` + 14 条样例知识 + 最新 `trusted/multi-intent.js` + `preview/index.html` 脚本 + `trusted/local-test-runtime.js` 的正文中执行了 26 条隔离 V8 断言，**26/26 检查通过**。路由 blob `d12cbb484bc9bb7777999a1f7e31bb710180ffa9`，Runtime blob `e21fca0fa9197c0502b94447039570068a019907`。这不等于正式 Node test 或浏览器执行，未推导 Native 结果。
2. **ISOLATED_V8_STUB_ADAPTER_ONLY**：将实际 Runtime 的 import 指向测试版 Adapter（不是网页 DOM），载入上述实际代码；启用既有自动单题固定许可后新增客户「你好！退款期限是多少？何时发货？可以上门安装吗？」→ `PARTIAL_REVIEW_REQUIRED`、两来源分别 `qa_demo_refund` / `qa_demo_delivery`、1 项不明、网页发送计数 **0**；没有审核时 `E_KB_REVIEW`，仍 0；实际调用 Runtime 原 `confirm` 人工批准后回执 `CONFIRMED` 且仅 1 次替身发送；重复确认 `E_KB_TEST_NO_ANSWER`，次数保持 1。**绝非 Chrome 的真实 DOM 或 Shared Provider PASS。**
3. **R3.1 历史 Node PASS（复用，不重跑）**：158/158 属提交 `29caf7d45f2b5c2b743338ef6749ea9913d16eb6` 的 [原始 App CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/40284151167)，不计入 R3.2 的 PASS。
4. **NODE_PASS：NOT_TESTED / 等待新 App CI 运行结果**。GitHub Actions 新任务已因 main 推送入队，但入队不是完成。需读取绑定最终 R3.2 源码的 job 状态及原始日志；若无日志，不造 PASS。定向本机 Node 命令在 README R3.2 节。
5. **PREVIEW_BROWSER_PASS / CHROME_PASS / REAL_PROVIDER_PASS：NOT_TESTED**。本工具执行环境未取得绑定实际 Browser 的 43112/43111 HTTP 交互、真实截图、来源身份、模型请求或 DOM 回执；第三方正式网站为 `BLOCKED_NO_TARGET`。先运行 Mac Codex 的最短真实操作链，不重复旧知识保存 CFT。

### 反方安全审查与能力边界

- **高风险候选污染**：原 BM25 可能把「什么时候发货」误关联人工客服时间。新业务路由要求问题主题与该候选的题目/别名一致；更重要的是所有候选 ID 必须是原模型检索返回 ID 的子集，不能暗自生成第二套与旧 Provider 不一致的来源。若失去证据宁可 `NO_MATCH` 或请求澄清，不能凭关键词显示为确定事实。
- **模糊政策时长**：「退款要多久」按申请期限/审核/到账澄清；已批准「几天内可以退款」仍保留原固定 alias；没有默默关闭原有已经明确的同义问法。
- **混合消息不能冒用固定自动权限**：即使 2 项 `ANSWERED_FIXED`，只要混有未知/问候/AI，整条消息必须显式人工同意，发送一次。现有 `UNKNOWN` 只读核对未改。
- **语言理解尚不是通用分句模型**：目前只对问号、分号、特定口语连接词进行高置信拆分；「退款期限是多少，何时发货」等未可靠分开的混合话题直接标记 `CLARIFICATION_REQUIRED`，避免将合并文本交给未经验证的 AI 产生事实。复杂上下文代词、省略、跨消息引用尚不能自动还原为可信单条答案。
- **来源变更与授权**：发送前重新读取整个 KB/ETag，逐题检查最初来源；已取消、暂停、Provider 切换、文档变更及 UNKNOWN 不调用新的发送动作。真实 Chrome 是否完全执行仍需原生证据。
- **完整产品仍缺**：发布端的真实第三方站点适配和授权、真实 Provider 案例、完整键盘/焦点及 320/360/400/440 实机截图、沙箱旧标题变更及原打包器候选晋升，不因为源代码可执行就认定交付最终通过。

### 下阶段：同源本地 Codex 专项验收，不重新开发

1. 唯一 main、源码 owner 与 watcher/用户当前 Chrome 身份实读；保持 `dist/development` 原位置，不造第二 Profile；复用原 43111/43112 服务，没有就按 README 启动。
2. 针对本轮运行 `node --test tests/environment/ai-knowledge-multi-intent-r32.test.mjs tests/environment/ai-knowledge-chat-r13.test.mjs`，按真实失败修最小受影响源码，不凭旧 158 PASS 宣称。
3. 实际 43112 预览点击/截图 320/360/400/440，验证来源从 `src/` 加载、无测试场景按钮进产品容器；直接打开 43111 页面并从真实可信 UI 审批监听、混合消息逐题草稿/不自动发送/人工一次发/唯一 DOM 回执；问候无 AI、歧义拒绝、暂停、UNKNOWN 禁重发、撤权 ETag。
4. 真实 Provider 单独测试候选知识的语义偏移/数字保护、正常人工送达；未批准第三方网页不访问、不测试、不声称 PASS。
5. 如果需清理沙箱「测试知识回答」字样，先由其发行 owner 按原 packer 的 candidate → test → promote → check-project 路径同步 0.1.5 版本策略和唯一正式包；不得只更新 src 或手工改包。


**R3.2 后续安全审计（增量）**：检查到原 Host/Consumer 仍可能在单问题初筛时把已被新主题过滤拒绝的其他候选知识发送给 Provider。已最小扩展原 `createKnowledgeAnswerConsumer.request({sourceIdAllowlist})` 和可信 Host 的 `prepare`/`prepareInbound`/`send` 与 Runtime `callAI` 接线，**不改变无 allowlist 的既有调用**，对手工入站草稿和已授权逐题自动草稿均校验 allowlist 是原模型候选的子集，并保持来源 ETag/客户 ID/授权代次关联。本轮 Node 定向测试额外包含“非法来源在 Provider 调用前拒绝、合法唯一来源只发送该知识”的行为案例。

**R3.2 更广覆盖**：混合两条纯语义问题（原知识中发票 + 物流）的自动 AI 草稿在本机已授权时，最多两次在原 Consumer 请求不同的引用，最后仅合成**一条需人工核对**的回复，无条件自动发送次数为零。该段已在原 Runtime 的隔离 V8 替身 Adapter 中实际运行；有明确 `MULTI_REVIEW_REQUIRED`、引用 `qa_demo_invoice` / `qa_demo_tracking`、两次逐题请求与一次人工批准后发送的测试观察。独立真实 Provider 结果仍 `NOT_TESTED`。


### 最终 R3.2 源码隔离复核与自审

- **SOURCE_IMPLEMENTED / ISOLATED_V8_SMOKE_PASS（33/33）**：重新载入最终 `src/model.js`、14 条 fixture、`trusted/multi-intent.js`、`trusted/local-test-runtime.js`、`trusted/host.js`、`trusted/ai-request.js`、`preview/index.html`，33 项纯业务及 JavaScript 解析检查全通过；包含原别名、退款时长歧义、来源隔离、删除知识、重复请求去重、隐式双话题拒绝、多轮草稿候选、所有运行文件 JS 可解析。实际来源 blob：路由 `82d4b49d194783e04844e36df78d757955e31378`、Runtime `50c5e68170ddd54ec9280b84367a300c2877f4d7`、Consumer `2228f1490904f99b47d087cc617015da57dce26f`、Host `02bdd31fdcb2292196c849bd0a4c13e9bde78c0c`、预览 `0e2cf55a777173893cd576ffdb1aaf81a5dbc169`；此项仅为源代码在工具 V8 中隔离运行，不是 Node/Browser PASS。
- **Provider 分题来源行为（替身）**：实际 Shared Consumer 函数接受含知识 `qa_demo_payment` 的错误允许列表，在请求 Provider 前 `E_KB_REFERENCES`，传输 0 次；接收本题 `qa_demo_refund` 后仅外发该单一候选，得到 `REVIEW_REQUIRED` / `needsHuman=true`。真实 Provider 未调用。
- **语义双问题 Runtime 替身行为**：「如何申请电子发票？我能在哪看物流？」分别使用原 Consumer 授权路径产生 `qa_demo_invoice` / `qa_demo_tracking` 的逐题结果，合成 `MULTI_REVIEW_REQUIRED` 单条建议；未审核发送 0 次，人工批准后原 Runtime 派发一次。独立 Provider 身份及真实 DOM 仍未验证。
- **CI 状态**：针对新增测试的 GitHub App CI 已排队，最新已发现作业 [40299028923](https://github.com/shopable-ai/opendesk-browser/actions/runs/40299028923) 在查询时 `queued` 且 `conclusion=null`，不得标成 `NODE_PASS`。确认某次 run 绑定最终源码且实际成功才补充 evidence，若仍排队则本地 Codex 运行定向 Node。

**六视角反方审查（内部源码审查，非外部专家认证）**：产品架构—还没有第三方站点适配；客服业务—单条混合消息已闭环但跨消息上下文/客户订单不可核实；AI/RAG—候选严格匹配旧模型并逐题限定，但自由表达仍靠人工审阅；浏览器安全—保留同一文档授权/暂停/只读核对，未有真实原生证据；前端 UX—开发按钮隔离，仍有沙箱历史「测试知识回答」字样；测试工程—新测试源码存在且源级 33/33，App CI/Chrome 尚未完成。

| 九维度自评分（100 分制） | 源码审查暂评 |
| --- | ---: |
| 1. 原始业务目标覆盖 | 88 |
| 2. 用户理解与信息架构 | 93 |
| 3. 多问题拆分与中文语义 | 89 |
| 4. 知识来源与事实边界 | 94 |
| 5. 安全合成与人工审核 | 95 |
| 6. 既有架构复用与去重 | 97 |
| 7. 正式 UI/预览分隔 | 91 |
| 8. 测试工程与实际证据 | 85 |
| 9. 可维护性和正式站点扩展 | 91 |

九维**内部源码审查算术平均 = (88+93+89+94+95+97+91+85+91)/9 = 91.4/100**，没有达到全部 95 的目标，不人为拔高。**真实产品验收综合：NOT_SCORED**，因为 Chrome/Provider/真实多站点仍未验证；这些暂评分绝不能被解读为实机验收或独立第三方认可。要达到目标，先完成未验收项、沙箱发行标题与更广泛中文对话语料，不应为数字而改报告。

