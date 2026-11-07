# ChatGPT 本地文件 · 当前入口与历史证据

先读[固定协议组件调用链与浏览器测试](protocol-execution-chain.zh-CN.md)：按“完整提示词 → AI 回显 → 监听 → 解析 → 匹配/分派 → 实际执行 → 回执”说明网页 Task 与文件 Native 两条入口，包含本轮测试条件。

## 最新浏览器补测结果（2026-11-06，01a1afe0，22:58）

**固定完整 JSON 的只读、审阅后写入、独立读回和自动完成已在原 CFT 实测通过。** 另发新轮次混合文件与 Task 两块，页面自动以 `E_CHAT_ROUTE` 拒绝、无文件结果；未读取实际派发计数或 Task Run 账本。没有点击手动处理来代替监听；确认写入前文件保持不变，确认后真实回执为 `saved=true / readBackVerified=true`。测试文件只由产品 Native 链写入，终端只读核对。

最终 `demo.txt` 为 `OpenDesk local file test\nstatus=chain-verified-20261106-01a1afe0\n`，65 字节，SHA-256 `fad1a276d529db3eea85ed4cd0954226fe1792065ad3b2f622a92366f97f9a8a`。请求身份、完整 JSON、手动操作与[本轮证据](../evidence/protocol-chain-browser-20261106-01a1afe0.json)见上方链路文档。旧轮次 `6f75880c…` 未重放。

本次沿用原 CFT 149.0.7827.55、扩展 ID、`dist/development` 及 Native 配对；检查时旧 dev writer 已退出、43120 未监听，故本次是**已加载静态 development 产物**的证据，没有证明当前 live serve 或 production。原普通项目连接保持撤销；固定协议仍依赖高级页轮询，尚未实现“关闭高级页后由原监听器统一推进文件请求”。自有审阅和设置页已关闭、诊断隐藏、草稿为空、UI 租约释放。没有新的独立评分。

## 最新链路与本轮补漏（2026-11-06，01a1afe0）

**文件业务确实有对应代码：`projects/webflow/trusted/chatgpt-files-controller.js`。** 它调用原 Native 文件服务读写；Web Flow 的网页 Task 执行器本身不具有文件权限。业务代码在 Web Flow 项目内，Browser 只固定接入可信入口和原文件通道；安装或更新沙箱工具 JSON 不会替换这些代码。下文历史评分、构建和原生观察只适用于各自候选，本节描述本轮补漏后的源码。

### 入口先分清

| 用户入口 | 谁发现回答、谁触发 | 是否需要先回显读取 JSON | 运行条件 |
| --- | --- | --- | --- |
| 普通聊天说“读取/修改 workspace 项目的 demo.txt” | 原 `chatgpt-bridge-page.js` 的发送见证与完整回答发现 → `chatgpt-file-intent-page.js` adapter → project service/controller | 不需要；已有具体对话项目连接时，由可信 controller 建立请求并读取 | 需要有效项目连接和 Native 授权；项目任务可由原网页 wake / SW alarm 推进，设置页可关闭 |
| **完整 JSON 固定协议测试** | 可信 `chatgpt-files-ui.js` 每约 2.5 秒发 `poll` → files service/controller → 原共享 DOM reader | **需要；提示词已含完整六字段 JSON，AI 只原样返回** | 从原对话领取新绑定，批准本轮目录/路径/模式；**可信审阅页保持打开** |

两入口复用相同文件 controller 和 Native 通道，不共用所有启动动作。固定协议轮次不会被当成新的自然语言项目任务；原 Task 监听器也不能把它改派成网页自动化。文件块混入 Task 时，两边均拒绝。原发现器复用不意味着关闭高级审阅页后还有高级轮询。

### 固定协议读取、修改与完成的完整链路

1. **准备与授权。** 从原 ChatGPT 对话领取一次性绑定，在可信页选择已有 Native workspace、相对路径及只读/读后修改/list，审阅本次披露范围。controller 的 `prepare` 建立新 `requestId`、`bindingId` 和精确操作范围；这一步不读取目标文件。模型提供的目录名、路径或协议不能替代授权。
2. **提示词已带完整数据。** `prepare` 生成指令和完整 `opendesk-request` 代码块，字段恰为 `protocol、requestId、bindingId、workspaceId、operation、path`。用户将生成内容填入原草稿并发送；AI 无需选择参数，只原样回显。完整实际例子见本文“单条提示词触发协议处理”，例中身份已消费，复测必须由 UI 新生成。
3. **监听与可信分派。** 审阅页自动发 `{protocol:'opendesk.chatgpt.files.v1',action:'poll'}`；`chatgpt-files-service.js` 的 runtime listener 验证入口并调用 controller。`poll → inspect → answer` 使用 `workspace-chatgpt.js` 的 `readChatGPTEdit`，在原 tab/document 的隔离世界读取同一轮完整助手回答和原用户消息；不消费流式片段。再次独立检查该回复是否混有 Task，并核对两次观察的 turn/answer 身份。仅出现任意 JSON、网页引用或历史块不能触发有效文件操作。
4. **真实读取或列目录。** `inspect` 校验协议字段、身份、已批准路径/操作和防重状态；`disk` 重查当前授权后调用 `files.request('files.read',…)`，list 则调用 `files.list`。原 `file-workspace-service.js` 封装 Native 请求，原 Native host 分派到 Go 文件服务。读取结果的正文与 SHA 再核验一致；list 返回目录项，不自动递归读取文件。
5. **只读到此结束；修改还需要真实上下文。** 只读/list 结果自动填入原草稿后进入 completed、停止轮询，无需把正文发给模型。读后修改则把真实正文、SHA 及完整 `editProposal` 填入原草稿，用户审阅并发送。AI 只返回一个 `opendesk-edit`，复用七字段 `protocol、requestId、bindingId、workspaceId、path、baseSha256、content`，仅将 `content` 改为完整目标正文。编辑 ID 来自真实读取结果，不能自行生成或误用读取 ID。
6. **提案与写入。** 高级页先显示修改前后全文，进入 review，尚未写盘。用户确认该具体 `reviewId` 后，controller 重查同一回答、当前授权和磁盘基线，登记稳定写入 ID，再调用 `files.write`，传入 `expectedSha256`。Native 自行校验工作区/路径/权限/原 SHA 并保存。普通项目入口已有明确修改授权时按原合同自动批准合规提案，不额外套用高级页的逐次确认步骤。
7. **用回执完成，不凭 AI 声称完成。** 校验真实保存回执，再独立 `files.read` 比较全文和 SHA；两者均成立才报告 `saved=true / readBackVerified=true`。高级页自动回填最终结果后 completed，停止轮询；最终回执无需再发给模型。回填未知、写入未知、来源/权限改变或 Stop 均停止推进；未知写入只允许只读对账，不能换 ID 重试。原生实际派发次数没有计数证据时不宣称已证明“恰好一次”。

这里有三层数据，各自职责不同：模型返回 `opendesk.workspace.request/edit.v1`；扩展内部消息用 `opendesk.chatgpt.files.v1` 调度；Native wire 用 `kind:'files.request' / protocol:'opendesk.local-files.v1'`。不是模型自己调用系统，也不需要另建一套 Host。

### 本轮实际补了什么

- **固定协议轮次可能误入 Task：** 原自然语言识别故意排除文件协议，但 Task 路由也只依赖该识别。现对原始和 Unicode 转义的文件协议作仅用于拒绝的检查，原监听及 Task 最终准入均拒绝文件轮次的 Task。
- **文件解析器会选中文件块，可能漏看同回答的 Task：** controller 独立检查完整回复的 Task 标记，混合回答在 Native 读取或写入前拒绝；协议解析与路由检查之间回答改变也拒绝。检查不扩权、不将引用变成可执行数据。
- **准备阶段提示误导只读用户继续发送/编辑：** 页面按未取得结果、只读结果、修改上下文、具体提案、最终回执、暂停和 completed 分别说明下一步。

五个新增行为回归先复现失败，再修复通过；相关九个测试文件合计 **390 PASS、0 FAIL、0 skip**，三份源码 `node --check` 通过。范围包括实际原监听 fixture、Task 最终提交零启动、文件读写拒绝、回答身份变化及正常读写/list/完成。它们是源码和组件证据；本轮候选来源审查、产物与真实浏览器复测状态在本节后续记录，不把上一候选的五轮原生 PASS 或 96 分自动转给这次改动。

**本轮最终验证状态：** Hubble 独立审查三份精确源码，未发现 P1/P2 阻断并明确批准原 provenance pins，原白名单未扩大；同步后来源保护 **4/4 PASS**，覆盖改字节、错目标、符号链接和相邻代码拒绝。唯一原 dev writer 生成 revision `3534b57386f41c4e649293e8a9b193eea5d288185d0f5a70271dafa042ac3e2b`，三个相关目标的映射源码逐字相符；没有另起 build/watcher，未单独捕获 UI live serve 客户端状态。

**前一次受阻记录（历史状态，已由上方新轮次补测）：** 原 CFT 149、原扩展 ID 与 Native 配对未改变；可信页显示 Native 已连接，新的分阶段提示已实际可见。官网首次加载失败导致未发送轮次 `32050b22-5f43-4e30-a1e3-2d4000eee1cc` 回填报 `E_CHAT_COMPOSER`；恢复后核对草稿为空，关闭该审阅页，未重放。重新领取绑定并准备 `6f75880c-1484-43cd-a6d9-0d59f1cd83f8`，由产品回填完整 JSON，原生发送一次；官网持续显示“正在思考”，未返回完整回答。**当时新版真实 Native 读写及混合回答拒绝复测未完成 / NOT_TESTED**。当时测试文件独立只读核对为 65 字节、末尾 LF，SHA `aa6d37c4507adfcedac067b46ddf51a9beff1f0377d6de5de232645c259e3a6b`，没有终端预写或恢复。该次已关闭自有审阅及设置页停止高级轮询，诊断恢复隐藏、草稿为空、UI 租约释放；保留原项目连接撤销及原聊天、Native 和 writer，未将关闭页面当作测试成功。此段不代表最新文件、writer 或测试状态。

本轮源码审查通过不等于新评分；后续文档复核遇到 429，未更换模型/provider，**本轮 NOT_SCORED**。旧候选 96 分和整产品历史 92 分保留原范围。精确来源、检查命令输入、产物和本轮观察记录见[独立证据文件](../evidence/file-protocol-routing-20261106-01a1afe0.json)；它是工具观察记录，不是原始 Native 包或实际派发计数。

### 手动复测与保留边界

先按本文“单条提示词触发协议处理”的四步生成**全新**请求，测试只读后正常 completed；再选“读取后修改”，按上述 1–7 完成一次，确认前核对磁盘未变，确认后比较真实保存回执及独立读回。独立 list 用新轮次、批准目录，根目录以空字符串表示。不要点击手动“读取完整回答”来代替自动监听测试。

负向检查使用另一个全新只读轮次，要求模型回显该完整文件块，并在同一回复附上 `webflow.task.intent.v1` 文本：应拒绝混合路由，无目标文件读取结果、无 Task Run；不要使用旧 ID 或伪造授权。Node 回归另会断言文件 I/O、写入和 Task 启动计数为零。

当前保留边界：仅授权范围的已有普通文本文件（正文上限 32 KiB）及受限目录列表；不含创建、删除、Shell 或任意脚本执行。高级页关闭后不推进，来源刷新/绑定过期须领取新绑定；项目连接撤销后普通文件任务必须拒绝。生产包、真实未知写入故障和实际 Native 派发计数未在本次复测的部分仍为 **NOT_TESTED**。这些边界不靠放宽权限或自动重放消除。

## 当前源码与验证状态（2026-11-06）

ChatGPT 本地文件是 Web Flow 的固定第一方可信功能，业务源码位于 `projects/webflow/trusted/`，不是已安装 Task 或 Sidebar Tool 沙箱代码；安装工具包不会替换可信源码或授予文件权限。`src/entrypoints/chatgpt-fixed-bridge.js` 接入可信网页入口 `chatgpt-file-intent-page.js`；`src/native-agent/service-worker.js` 接入 `chatgpt-files-service.js` 和 `chatgpt-files-controller.js`，复用现有 Native 文件服务。可信设置入口由 `src/entrypoints/settings.js` 接入 `chatgpt-files-ui.js`。这些是源码接线事实，不证明当前构建、安装或真实运行。

文件操作依赖现有 Native 工作区权限，以及针对 `https://chatgpt.com` 具体对话和项目的可信连接审阅；项目名或网页文字本身不授予权限。授权限定任务明确指定的已有普通文本文件，读取或写入须符合工作区实际访问权限；写入另核对原文件 SHA、提案身份及当前授权。撤销、停止与未知结果继续受原控制链约束，不能通过换 ID 自动重放。修改上下文填入原对话草稿后由用户自行发送，扩展不自动发送消息。

源码中的回执入口可展示项目名、相对路径、修改前、提案后和独立读回；缺失内容标记未提供，对照内容留在本机页面快照，不进入通知或模型结果包。需要模型参与修改时，真实文件上下文仍按用户授权填入对话草稿。只有真实 `saved` 回执和独立 `readBackVerified` 均确认才能报告保存成功。未知写入的对账读回仅证明当前内容；原回执仍未知，不得冒称原写入已确认。

原 Web Flow discovery 是唯一的原生发送见证和完整回答发现入口，文件页面仅作为受限 adapter 消费事件。同轮文件与网页 Task 的互斥覆盖当前路由器能够识别的文件需求及协议意图；可信 Task 准入和最终提交重新读取实际用户原文与同一完整回答，缺失、空白或超过 4096 UTF-8 字节的用户上下文明确拒绝。文件侧自动与手动项目连接均读取 `taskIntentPresent`，混合回答不得进行文件 I/O。另一轮独立合法 Task 不因先前文件任务忙碌而被全局锁定。上述行为已有定向组件证据，不是任意自然语言语义识别或全部竞态均已验证的保证。

**本轮核心读写、Stop 后实际 SW 恢复及测试连接撤销已有持续开发环境实测；撤权后准确提示也已复验。当前独立复核为 92/100，核心开发收尾，不沿用旧 96 分。** 下方 PASS、产物、环境和操作只适用于各自明确标识的候选；production、独立包安装化和完整矩阵继续延期。

### 恢复专项历史断点（2026-11-06，01a1afa2）

沿用原 CFT、具体测试对话、扩展 ID、`dist/development` 及现有唯一 watcher；Native 仓库只读，未提交或推送。开始与拒绝后独立磁盘均为 67 字节、末尾 LF，SHA-256 `dbd2e8a943be881d85f70fb4ab85a1b044f4790e9930bc4c6ab8eed2a96b320e`，未通过终端预写或恢复。

新任务在读取前实际收到 `E_CHAT_ANSWER`，不计 Stop 成功。独立复核先复现回答操作按钮变化误计正文版本，已最小修复并保留正文、节点身份及混合 Task 拒绝；真实新任务仍失败，继续取证而未放宽身份比较。已加载的修复 reader SHA 为 `217318446e081beb9752cfe6440b6462e13d15edcd41aa5642cb78752c59f334`，同时与 transport、SW sourcemap 相符。实际隔离世界限量 DOM 观察进一步确认：同一回答节点在 `complete` 后短暂仅有「ChatGPT 说：ChatGPT」角色标题，准入缓存为 `answer-4:0`；15 ms 后正文「等待文件上下文」出现，随后版本变为 `answer-4:1` 并被原检查拒绝。当前修复目标是让唯一发现入口等待真实正文，不重试已拒绝的旧操作。

扩展开发指纹变化后，未刷新原网页的 Stop 点击实际出现 `Extension context invalidated` 和回执未知；未重放。已观察到后台应用新指纹，但未捕获那次安全重载日志，不能声称已经证明 Stop 后的后台恢复。观察摘录见 `artifacts/chatgpt-files-20261103-01a1a1b4/recovery-20261106-01a1afa2.json`；它不是 Native 原始包或实际派发计数。该历史断点当时未完成 Stop 持久性、真实撤权拒绝、最终候选正常读写及评分；当前进展见下节。

### 本轮源码复核与准入边界

**发现器锚点增量（2026-11-06，01a1afe0）：** 本轮先运行 ego lite 官方指南并复用 TaskSpace；其页面列表不包含原 CFT 测试对话，未迁移登录、扩展或 Native 配对。用户明确允许直接控制原 CFT 后，沿用原具体对话、扩展 ID 与 `dist/development`。真实侧栏向原 tab `438917387` / document `F346FA723039735ACF5AD780A3413CFC` 查询现有 `sidebar-read`，没有收到状态回包，未取得实际 `observation.stage/reason/history`，旧等待的根因仍未知。点击原卡“停止项目任务”后明确显示“本次项目需求已停止，未启动文件访问”；空草稿下正常刷新，没有重发旧读取请求。

隔离 DOM 回归另已证实：发现器用前一回答完整 `textContent` 作锚点，复制控件文字变化会阻止新完整回答准入。已仅将 assistant 锚点捕获与比较改为 reader 现有的窄控件排除规则；用户原文、消息身份、正文精确空白、代码语言及普通正文按钮继续核对，混合 Task 仍按原始回答检查。新增三个控件变化回归先失败，修复后发现器定向测试 62 项通过。独立 reviewer 未发现此窄修复新增 P0/P1/P2，另运行相关投影及 Stop/撤权/恢复组件检查 42 项通过；这些不代替原生恢复验收。原 dev writer 自动生成同源开发产物，未另起构建；后续侧栏实读开发服务已连接，revision `240f4c3d48bbb587f9b35b75ac2e3b54cbdd8cebeb1df3fe1ff066446b0ca086`。此全局 revision 不单独证明已打开网页的源码身份。

全新需求 `read-20261106-01a1afe0-a` 已由原输入框和发送按钮提交一次；新回答“等待读取结果”完成后，产品显示“已读取 demo.txt · 仅显示在本机，尚未发送给 ChatGPT”。展开回执显示项目 `workspace`、相对路径 `demo.txt`、成功和真实两行全文；原草稿仍为空。原生读取与本机全文展示 **PASS**，该次普通回执未展示 SHA，不冒称 SHA UI 已验证。随后中断曾关闭测试窗口和原 dev writer；下节记录恢复后的新实测，不把中断前的未执行状态当成当前结论。

### 本轮真实读改、停止恢复与撤权（2026-11-06，01a1afe0）

通过正常 Profile 菜单找回原「您的 Chromium」测试环境，沿用原 CFT 149.0.7827.55、具体对话和扩展 ID，未迁移登录或 Native 配对。确认无活跃 writer 后恢复唯一 `npm run dev`；侧栏实读 serve 已连接，revision `edbe525bf93c6623677dc962b4e5cf7494b584ad4bbaaecd51de1df2154fb8fd`。后续 writer 曾因 Node 堆内存耗尽退出；只在确认原 writer 已退出后恢复同一 `dist/development`，不终止其他 owner 或另建加载目录。

| 用户操作 | 实测结果 |
| --- | --- |
| 全新修改 `edit-20261106-01a1afe0-b` | 原输入框发送需求，Native 读取真实上下文并仅回填原草稿。操作者审阅时移除任务前缀中已经过时的“现在仅回复等待”句，保持 Native JSON 字段、身份和正文不变，再点击原发送按钮一次。模型生成新的 `opendesk-edit` |
| 保存和独立读回 | 原页面显示“已保存 demo.txt · 独立读回核验通过”；展开回执为 `saved=true / readBackVerified=true`，修改前、提案后、独立读回全文均可见。写入 request `19fb2a81-99d4-4a22-a8fb-ea2ff6e05c35`、binding `d783282d-2468-42a6-9112-a8166e4af8bb` 已消费，不得重放 |
| 磁盘独立核验 | 完整正文为 `OpenDesk local file test\nstatus=verified-20261106-01a1afe0\n`，59 字节、末尾 LF，SHA-256 `52c7dae01bf20bf2b23af72fab425a4257ee28660a693d9a2d47600ce0ceaa90`。终端只读，未预写或恢复测试文件 |
| Stop | 新任务 `stop-20261106-01a1afe0-c` 已回填上下文但尚未发送时，实际点击“停止项目任务”。Stop 按钮退出，草稿保留，持久任务 `f0758c0a-4d46-4648-bc53-93a1fd2c57cf` 为 `paused=true`；未发送编辑 `d72bf887-a471-45eb-86d1-bfd4df833f96` 没有写入账本，已放弃且不可发送 |
| 实际 SW 恢复 | Chrome `serviceworker-internals` 对原扩展 registration/version 756 实际 Stop/Start：RUNNING renderer 54503 → STOPPED renderer 0/thread -1 → RUNNING renderer 59589。期间未刷新聊天或重载扩展。同 tab `438917457`、document `DD1ACAD97EDDFA8DF763EABB6E7DDB51`、任务及 grant version 1 保持暂停；已成功写入账本仍为 `confirmed`，停止请求仍无写入项。草稿保持，未重新提交；随后只清理本轮自有未发送草稿，查看回执后仍为空 |
| 测试连接撤销 | 原对话诊断中的真实“审阅当前对话的文件请求”创建一次性绑定；可信页检查并定位 `workspace` 后点击“撤销此项目连接”。真实提示“项目连接已撤销”，只读 storage 核验 grant `42fb469a-4e1f-4469-a9fa-19ba0360e11b` 为 `revoked=true / version=2` |
| 撤销后新请求 | `revoked-deny-20261106-01a1afe0-e` 被挡在连接审阅前，原草稿为空；没有新的文件正文结果。旧提示误称“首次连接”，已最小修正为“当前对话没有有效的项目连接”，未改变权限匹配或撤权语义；同候选新请求 `revoked-final-20261106-01a1afe0-f` 在原对话显示修正后的准确提示，草稿为空，无新文件结果；未重新连接，随后实际 Stop |

独立 reviewer 确认 controller 只替换一个提示字符串，AST 无其他语义变化，允许把精确来源 blob 从 `4d05b70068f949d235bfb70515d8af947e1178ee` 同步为 `c9d2f8f9f9a684da505dd452d82f524e532e59e0`；仍仅准入原 `native-agent/transport.js`。5 项连接/撤权行为检查和 4 项固定来源保护检查通过，语法通过。来源测试继续拒绝错目标、改字节、符号链接和相邻项目代码。

最终沿用同一路径的 dev writer（进程级 `NODE_OPTIONS=--max-old-space-size=8192`），revision `f26e97f111a321f703024aeda90a0f7be595d92a69127e3f296eefe3e5afa71b`，transport SHA-256 `6897edc18ec7082c2787e73cfa19134540e3056196b287873c1f53296fad323e`，controller 映射内容与审阅源码逐字一致。原扩展 SW 日志实读已连接 `ws://localhost:43119`。最终测试任务已 Stop，测试连接保留撤销，原输入框为空，诊断恢复隐藏；本轮设置和 SW 诊断标签已关闭，原聊天及持续开发服务保留。最后独立磁盘读取仍为上述 59 字节和 SHA。后续 watcher 因其他输入生成全局 revision `f3300cc5c0e04e4dccabb12460fab82cc0e1b6836c9763983d5c871eaa97570e`；本功能 transport 摘要和 controller 映射仍相同，不将该后续全局指纹冒称为新的浏览器实测。可信审阅窗口在收尾间隔后按期返回 `E_FILE_EXPIRED`，未重用该 claim；准确拒绝提示由原对话实际展示确认。

以上证明真实读改保存、暂停状态跨实际 SW 重启保留及撤权阻挡，不证明活动任务续跑或全部竞态。实际 Native 派发计数未提供；单个 `confirmed` 账本不是“一次实际派发”的计数证明。未知写入真实故障、旧提案重放拒绝实测及回执/诊断零新增 IO 的运行计数仍未验证，不制造未知写入或换 ID 重试。历史设置摘要 `E_OWNER` 原因未确认，未修改权限或 Host；最终本机连接页显示“已连接 / 本机通信在线”，仍提示 Codex 能力需使用时核验，该显示不证明历史根因已修复。当前 `get_goal` 为 null，未改变旧对话 goal；无提交或推送。观察摘录见 `artifacts/chatgpt-files-20261103-01a1a1b4/discovery-20261106-01a1afe0.json`，不是 Native 原始回包或计数。

### 当前独立产品复核（2026-11-06，01a1afe0）

未参与实现的 Mendel 直接复核当前源码、来源 pin 和 transport 映射，并审阅本轮观察记录，给出 **92/100**。真实 UI、Stop/SW/revoke 和磁盘结果明确采信为主 agent 的工具观察，reviewer 没有独立重放浏览器操作。Hubble 此前已独立批准当前精确提示变更和来源锁；其最终评分续接因 429 失败，未改模型或 provider，未把失败当成评分结果。

| 维度 | 得分 / 权重 |
| --- | ---: |
| 调用合同与所有权 | 24 / 25 |
| 项目作用域与安全 | 29 / 30 |
| 用户流程与真实前后对照 | 18 / 20 |
| 可靠性与恢复 | 13 / 15 |
| 证据与可复现性 | 8 / 10 |
| 合计 | 92 / 100 |

复核允许当前核心开发收尾，不代表完整恢复、95+ 或 production 验收。后续发现包括撤销入口藏在诊断内的可发现性，以及历史摘要问题；成功编辑中的过时等待句来自本轮测试需求前缀，操作者审阅时进行了纠正，因此不将本次完成扩大为原始测试提示全程无需调整。实际派发计数、未知写入故障和其他运行缺口继续以上述 NOT_TESTED 为准。

### 此前边界修复及候选证据（保留历史）

独立只读复核已收口此前两项 P1（上下文长度不明确拒绝、文件忙碌全局阻断独立 Task），并复查合法 Unicode 转义协议及块外未配对引号的拒绝行为；限定源码范围未发现未解决 P0/P1。reviewer 独立运行 `reply-admission`、`chatgpt-files`、`chatgpt-files-provenance`、`chatgpt-task-discovery-p0` 四个测试文件，177 项通过、0 失败、0 跳过。这是源码及自动验证复核，不是产品评分。页面发现、可信手动准入、序列化最终提交和文件连接均已有定向行为证据；后台确认路由冲突会退休原候选，不在恢复时反复执行。

固定来源锁已按复核字节同步：`chatgpt-bridge-page.js` 为 `b0d87d65e2f890974d3824723432777563c74f4b`，`chatgpt-files-controller.js` 当前为 `c9d2f8f9f9a684da505dd452d82f524e532e59e0`（撤权提示修正后），`chatgpt-conversation-route.js` 为 `c75f89b8f85d78f30a1b9de1a407006aad8ccbf2`。只读模块图确认路由策略由原 SW、工作台和固定 Content 消费；来源测试继续拒绝错目标、改字节、符号链接和相邻项目文件。文件引擎和权限未开放给动态包。

产品复核另发现英文 `Edit` 未请求写权限，以及真实英文请求中路径冒号和相邻 `project` 的解析失败。最终 `chatgpt-project-policy.js` blob `647fcd233f662e9239c46d348205329b39db15e9` 已独立复核并只锁定到原 `native-agent/transport.js`。policy/files 73 项及另外 37 项独立边界断言通过，来源保护 4 项通过。中间宽泛消费 `project` 的方案被 reviewer 发现会忽略未知项目，未准入构建；最终保留文件边界，用户输入 NUL 拒绝，歧义及未知项目继续澄清。最终候选英文真实修改已通过下述全新任务；首次 `E_PROJECT_CLARIFY` 不计通过。

Cookie Editor owner 恢复唯一 `npm run dev` 后，本任务只读核对五个相关生成入口的摘要均与清单一致，映射中的相关 JS 源与本轮源码一致；`?raw` HTML 转换输入未逐字节比较。初始构建身份记录在 `artifacts/chatgpt-files-20261103-01a1a1b4/boundary-repair-20261106-01a1ac68.json`。这份记录不代替下述本任务的原生运行证据。

### 新候选真实运行（2026-11-06，01a1ac68）

共享账号操作结束并正常释放后，本任务取得 UI 租约，使用原 `/Applications/Google Chrome.app` CFT 149.0.7827.55 和具体测试对话 `https://chatgpt.com/c/6aec9316-59c4-83ee-bc35-0bcf4d1b221b`。扩展详情实读已启用、ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、加载路径为本仓库 `dist/development`；原侧栏调试页确认开发服务已连接，运行时指纹 `3bb455b46fad…`。后续全局指纹变为 `8f99df0d9d1a…`，五个本轮相关生成入口的字节始终未变，未启动第二个 writer、复制或重装扩展。

| 实际用户操作 | 本轮证据 |
| --- | --- |
| 新只读需求 | 通过原输入框正常发送；既有 `workspace` 项目和具体对话授权直接复用，没有再次审阅。回执显示 `demo.txt` 的真实全文及“仅显示在本机，尚未发送给 ChatGPT” |
| 普通局部修改 | 正常发送明确需求；扩展一次填入真实上下文，操作者审阅后手动发送一次。发送前磁盘仍为原 63 字节、SHA `922f4419…`，没有提前写入 |
| 保存与对照 | 模型生成新的固定 `opendesk-edit`。原页面回执 `saved=true / readBackVerified=true`，同时展示修改前、提案后和独立读回全文；输入框为空，无需再次发送保存回执 |
| 独立磁盘核验 | 只读命令核对完整正文为 `OpenDesk local file test\nstatus=boundary-core-20261106-01a1ac68\n`，64 字节，SHA-256 `af9f8220d08a079b011f36930d6444d891e33963885d2185b905ae753c985abf`；测试文件只经产品 Native 流程写入，终端未预写或恢复 |
| Stop | 在另一条全新修改需求已填入上下文但尚未发送时，实际点击“停止项目任务”；显示“正在停止；已派发操作将保留实际回执”，Stop 按钮退出，草稿保留，磁盘不变。随后清理本轮自有未发送草稿。没有 Native 独立派发计数，不扩大为全部竞态或重启持久性证明 |
| Native 配对 | 实际 CFT Native 子进程归属该 CFT 主进程。对应 `scrapyjs-react-01a186cc` 实例的只读 `doctor` 返回 `connected=true / nativeConnected=true / enabled=true`，扩展 ID 与真实 CFT manifest 的 `allowed_origins` 一致。此前默认日常 Chrome 的 `connected:false` 不属于此实例 |

本轮成功写入 request `6c0b064e-863d-4eeb-8040-0074dfa9bfac`、binding `213694b8-5ef8-470b-a32d-cc65936fdc7f` 已消费，不可重放。Stop 测试的未发送编辑 request `0a52b995-d324-4d89-aacb-94c63e715ff4` 已放弃，不可发送或重放。

Stop 的前两次驱动均不计通过：第一次只读需求在点击时收到 `E_PROJECT_TASK / Extension context invalidated`，当时全局开发指纹变化，结果未知如实保留，未重放；另一次只读需求先于点击完成，元素已退役。它们不改写上述真实保存结果，也不冒称为产品 Stop 通过。当前没有复现文件业务源码故障；真实 unknown 写入故障注入未执行。

本机运行观察与独立磁盘结果记录在 `artifacts/chatgpt-files-20261103-01a1a1b4/boundary-runtime-20261106-01a1ac68.json`；本聊天原始 CUA 截图可见真实对照和开发连接指纹。JSON 是该阶段工具观察记录，不是原始 Native mutation 包；最终候选与评分见下文。UI 租约已释放，原 watcher 和 Native 连接保留；未提交或推送。

### 英文修复的最终候选（2026-11-06，01a1ac68）

沿用原 CFT、扩展 ID、具体聊天及 Native 配对，原唯一 dev writer 重读已审来源后生成 revision `1fe8e26bcd13ba5b7920c024795d57680dbd91f1fc9d6853c3ef79c4639f054c`；页面空闲时正常刷新，最终侧栏实读开发服务已连接同一指纹。五个相关入口清单摘要及映射内相关 JS 源均吻合；最终 transport SHA-256 `77d73fd42c723f4b943710f2f5b879919b14e3aee34f914ab8e8c127efb6dc62`。

通过原输入框正常发送全新 `Edit workspace project demo.txt: …`，目标第二行为 `status=english-verified-20261106-01a1ac68`。原 Native 上下文一次填回，磁盘仍为原 64 字节/SHA `af9f8220…`，操作者审阅后发送一次；模型返回新固定提案，真实回执 `saved=true / readBackVerified=true`，展示修改前、提案后及独立读回全文。没有重复项目审阅，保存回执没有再次填回，最终输入框为空。

独立终端仅只读核对完整 67 字节及末尾 LF：`OpenDesk local file test\nstatus=english-verified-20261106-01a1ac68\n`，SHA-256 `dbd2e8a943be881d85f70fb4ab85a1b044f4790e9930bc4c6ab8eed2a96b320e`。成功写入 request `7215061c-14a9-4615-a484-87ea91138547`、binding `1e828265-d848-46c6-8dea-6369d023f021` 已消费，不可重放。原始 CUA 截图同时可见三份正文和最终已连接指纹。累计观察记录在 `artifacts/chatgpt-files-20261103-01a1a1b4/english-edit-20261106-01a1ac68.json`，保留首次解析失败及未准入中间方案，不将观察 JSON 称作 Native 原始数据包。UI 租约已释放；原浏览器、Native 与 dev writer 保留。

### 上一候选独立复核（01a1ac68，非当前评分）

未参与实现的 reviewer Epicurus 在核对最终源码、精确来源锁、生成入口、真实运行记录及独立磁盘后评为 **96/100**；英文 Edit 的 P2 和未准入中间解析方案的 P1 均已关闭，无未解决 P0/P1。

| 维度 | 权重 | 得分 |
| --- | ---: | ---: |
| 调用合同与所有权 | 25 | 25 |
| 项目作用域与安全 | 30 | 29 |
| 用户流程与真实前后对照 | 20 | 20 |
| 可靠性与恢复 | 15 | 13 |
| 证据与可复现性 | 10 | 9 |
| 合计 | 100 | 96 |

剩余 4 分为证据限制：当前真实授权拒绝场景覆盖有限（−1），早先上下文失效根因及 Stop 后重启持久性未有专项运行证明（−2），未捕获 Native 实际派发计数（−1）。这些不等于已证实产品缺陷，也不将本轮开发结果提升为 production 验收。公开 Task/沙箱文件委托、独立包安装、production、完整 CI 与跨浏览器/压力矩阵继续延期。

### 单条提示词触发协议处理：最小测试入口（2026-11-06）

**最小方案：完整提示词（指令＋完整 JSON）→ AI 原样返回该代码块 → 现有自动监听解析 → 对应处理器 → Native 读取 → 真实结果回填。** AI 无需推断协议、补参数或访问文件。上版只展示了任务说明，遗漏 JSON，不能作为完整测试提示词；以下替换该示例。复用现有生成器与处理器，不重做项目入口。

下面是本轮实际发送的完整精简提示词。**其中 ID 仅记录本轮证据，消费后不能复制重放；手动复测须按后面的现有入口生成新 JSON。** `opendesk-request` 是代码块语言标记，不能改成普通 `json`。

````text
这是 OpenDesk 只读协议回显测试（echo-minimal-20261106-01a1afe0-h）。请只原样返回下面这一个完整代码块，所有字段和值保持不变，不添加解释、不调用工具、不生成编辑提案。文件读取由现有扩展脚本执行；不要声称已经读取。

```opendesk-request
{"protocol":"opendesk.workspace.request.v1","requestId":"535cc3db-67c9-4589-86db-b08628ade573","bindingId":"49b57446-519e-4817-b8db-625354ddf08e","workspaceId":"workspace-fe28c0b5-041a-4b4f-b37a-a5565944eb0f","operation":"read","path":"demo.txt"}
```
````

**手动测试只做这四步：**

1. 在原 ChatGPT 对话诊断区点击“可选：旧版文件请求 → 审阅当前对话的文件请求”。若诊断隐藏，在现有本机连接设置开启“显示诊断面板”；必要时安全刷新空草稿的原对话。检查本机连接状态使用无 hash 的 `native-agent/settings.html`；本轮观察到带 hash 的普通连接设置报 `E_OWNER`，去掉 hash 后显示已连接，未绕过任何身份检查。
2. 在新绑定可信页点击“检查当前对话与项目连接”，展开“高级：旧版文件协议访问与审阅”，选择 Native 已授权测试目录 `workspace`、相对路径 `demo.txt` 和“读取文件（只读，回填后结束）”。可填写本轮测试标记，勾选本次范围披露，点击“批准本次读取并准备提示词”。**此时仅准备请求，尚未读取目标文件。**
3. 点击“填入原对话草稿”，直接发送生成器给出的短提示词和完整六字段 JSON。AI 只需逐字回显代码块，不补参数。不可使用上面已消费的示例 ID。
4. 保持可信页打开；它约每 2.5 秒检查完整回答。AI 回复同一 `opendesk-request` 后，应自动出现 `status=success` 的真实文件结果，原草稿出现该结果，可信页显示“本轮只读已完成”和 `filled`，不再等待编辑，结果中没有 `editProposal`。**不点击“读取完整回答并处理请求”，才能证明本次自动监听触发。** 无需发送文件正文给模型即可结束。清除本次未发送结果草稿，在同一可信页再次批准和发送新提示词，应以新身份再次读取并正常结束；关闭页面不是完成条件。

监听和分派已在原代码接通：`chatgpt-files-ui.js` 定时调用 `poll` → `workspace-chatgpt.js` 只取当前完整助手回复的协议块并核对本轮用户消息 → `chatgpt-files-controller.js` 的 `inspect` 校验六字段、已批准路径和未消费身份 → `disk` → 原 `files.read` Native 通道。不是检测到任意网页 JSON 就执行，也不是由模型直接访问磁盘。

修改仍复用原链：真实读取结果中的完整七字段 `editProposal` → AI 返回 `opendesk-edit` → 可信页展示前后对照 → 用户确认写入 → Native 保存并独立读回。写入测试和 `saved=true / readBackVerified=true` 的既有证据见下文；本轮只读回显验证不新增写入 PASS。

**本轮原生结果：自动读取 PASS。** 原 CFT 149 中分别发送生成器原提示词和上述精简提示词；AI 均仅回显同一六字段 JSON，未点击手动处理按钮，现有监听自动读取并将真实结果回填原草稿。精简轮 `requestId=535cc3db-67c9-4589-86db-b08628ade573` 对应 `resultId=9bf9db45-fa45-486a-9277-bfaf052286f0`，结果 `status=success`、59 字节、SHA `52c7dae01bf20bf2b23af72fab425a4257ee28660a693d9a2d47600ce0ceaa90`；独立只读磁盘核对一致。正文没有发送给模型，没有提交编辑或点击写入确认。已清空结果草稿、关闭审阅页并恢复诊断显示关闭；用户切换应用后停止 UI 操作，普通设置页保留。

同范围四项既有 Node 定向测试通过，独立于上述真实浏览器结果。[本轮可复查记录](../evidence/file-protocol-echo-20261106-01a1afe0.json)逐轮保留生成请求、AI 回显、真实结果和证据边界。该记录为操作者对 CUA 可见结果的结构化摘录，不是 Native 原始报文或派发计数；不证明零额外 IO、新写入或 production。

**独立最终方案评分：97/100，达到本轮 ≥95 要求。** 评审 Mendel 实读本节和两轮记录后给分：提示词自足／机械回显 25/25、真实监听分派 25/25、身份／安全 20/20、复现说明 19/20、证据诚实 8/10。扣分为诊断／高级入口及 `E_OWNER` 处理增加操作负担，以及缺少原始传输捕获、本轮未重核完整加载路径／HMR 配对。评审独立核查源码与记录，但未独立操作浏览器重放，真实 UI 结果采信操作者观察。97 分只适用于本次固定协议自动读取方案，整产品此前 92/100 不自动升级，不代表 production 验收。

### 固定协议发起与完成修复目标（2026-11-06，01a1afe0）

本轮目标：完整 JSON → AI 原样回显 → 原监听器 → Native → 真实结果 → 明确终态，并能在同一入口继续下一轮。此前只读回填成功后仍等待编辑，人工关闭页面不算自然完成。本轮修复沿用上述同一高级入口，不新增协议、Host 或文件执行服务。前节 97 分是旧读取方案的历史评分，不继承为本轮完成评分。

| 关键条件 | 可判通过的结果 |
| --- | --- |
| 正常发起 | 提示词包含本轮完整六字段 JSON；准备时不读目标文件，AI 无需补字段；不点击手动处理即可自动触发 |
| 只读完成 | 真实读取和回填均确认；没有编辑身份；显示已完成、停止轮询；未发送结果也能结束 |
| 连续读取 | 同一可信页连续两轮新 requestId、bindingId、resultId；旧身份不能复用，第二轮读取当前磁盘 |
| 受控修改 | 选择“读取后提出修改（保存需确认）”；真实读取结果含完整七字段 editProposal；AI 仅替换完整 content，待明确审阅确认后保存，独立读回及最终回执回填后结束 |
| 连续修改 | 同一入口两轮独立读改写均自然结束；新轮使用上轮保存后的基线，旧确认不能确认新提案 |
| 目录列表 | 选择“列出目录”，批准精确目录；工作区根路径留空，得到真实 entries 和 truncated，回填后结束且没有编辑提案 |
| 拒绝与不确定性 | 模型不能改变路径、身份或授予 allowEdit；Stop、撤权、SHA 冲突仍拒绝；未知写入／回填不伪报完成、不自动重放或换 ID 绕过 |

只读和读改写由可信页面绑定，模型 JSON 仍为相同的 `operation:"read"`，模型不决定写权限。只读“已完成／草稿 filled／尚未发送”可以同时成立；回填不等于 ChatGPT 已收到。最终保存回执也无需再发送给模型。

手动修改时，在上述第二步选择“读取后提出修改”，任务写清目标，例如“仅把第二行改为 status=manual-completion-20261106，保留第一行和末尾 LF”。发送生成的初始提示词；自动读取结果填回后，核对真实正文并发送一次。模型收到实际 `editProposal` 后返回完整 `opendesk-edit`；核对可信页的修改前后全文，再点击“确认写入此文件”。通过标准为真实 `saved=true`、`readBackVerified=true`、最终回执已回填且页面显示本轮修改已完成。只生成协议不算保存，关闭页面不算完成。

**读写链路的每一环：**

1. 可信页固定工作区、相对路径及“只读／读取后修改／列目录”，生成真实请求身份和完整六字段 JSON。准备提示词本身不读取目标文件；修改许可来自可信选择，不在模型请求中添加权限字段。
2. 将生成的完整提示词填入原聊天，用户点击发送。AI 只回显 `opendesk-request`，不负责补 ID、找路径或读取磁盘。
3. 保持同一可信页打开，现有 `chatgpt-files-ui.js` 的约 2.5 秒 `poll` 取得完整回答；`workspace-chatgpt.js` 绑定当前用户消息和完整助手回复；`chatgpt-files-controller.js` 的 `inspect` 严格核对六字段、身份、精确范围和未消费状态。
4. 可信处理器经原 Native `files.read` 或 `files.list` 执行，验证实际返回后回填原聊天草稿。只读／列目录在确认回填后完成，结果无需发送给模型。
5. 读取后修改时，真实读取结果另含完整七字段 `editProposal`，其中 `content` 为真实原文、`baseSha256` 为真实基线。用户发送此上下文；AI 仅将完整 `content` 换为目标新正文，原样保留其余字段，返回 `opendesk-edit`。
6. 监听器取得编辑块并验证身份和基线，在可信页展示修改前后全文。用户点击“确认写入此文件”后，原持久写入账本和 Native `files.write(expectedSha256)` 执行保存，再独立 `files.read` 核对正文与 SHA。
7. 只有保存回执和独立读回均确认，最终回执回填也确认，才显示“本轮修改已完成”。无需再发送最终回执；下一轮通过同页重新准备取得新身份，并读取最新基线。未知保存或回填继续暂停，不能换 ID 重放。

下面是第二轮修改**实际发送的完整初始提示词**。它包含测试目标和全部 JSON，AI 无需推断协议；这些身份已消费，仅作可核对的记录。复测应由上面的生成按钮生成新值。

````text
请只原样返回下方这一个完整代码块，所有字段和值保持不变，不添加解释、不调用工具。文件操作由现有 OpenDesk 扩展执行；不要声称已经读取。

本轮先读取文件。收到真实结果后，仅使用其中的 editProposal 提出完整新正文；写入仍须我在可信页面确认。

任务：completion-write-2-20261106-01a1afe0：收到本轮真实读取结果后，仅将第二行改为 status=completion-two-20261106-01a1afe0，保留第一行和末尾 LF。现在只原样回显完整请求代码块；收到新读取结果后再输出完整 opendesk-edit，不复用历史身份。

```opendesk-request
{"protocol":"opendesk.workspace.request.v1","requestId":"b2ee7bbc-9049-47e3-abfa-9a79f151b024","bindingId":"a30bf0f6-f8b2-4f24-ba04-7cce0ae63c91","workspaceId":"workspace-fe28c0b5-041a-4b4f-b37a-a5565944eb0f","operation":"read","path":"demo.txt"}
```
````

AI 首次原样回显后，自动读取的是第一轮刚保存的 65 字节新内容，SHA 为 `a309728affbeb354206445f430bf3c2323cf8d578d5d7da53a43217341b51ded`。发送真实读取上下文后，模型实际返回以下完整编辑协议；**本块本身仅是提案，尚未写入**：

```opendesk-edit
{"protocol":"opendesk.workspace.edit.v1","requestId":"6c0dd3c3-b139-4e97-94e8-86a2db1c393d","bindingId":"a30bf0f6-f8b2-4f24-ba04-7cce0ae63c91","workspaceId":"workspace-fe28c0b5-041a-4b4f-b37a-a5565944eb0f","path":"demo.txt","baseSha256":"a309728affbeb354206445f430bf3c2323cf8d578d5d7da53a43217341b51ded","content":"OpenDesk local file test\nstatus=completion-two-20261106-01a1afe0\n"}
```

**本轮实际结果：同一可信页连续只读两轮、读改写两轮、根目录 list 一轮均 PASS。** 全程未点击手动处理按钮，均由原监听器触发；先观察自然完成，再清理自己的草稿和审阅页。两轮修改确认前独立只读核对磁盘未变，确认后均 `saved=true`、`readBackVerified=true`、`filled`，最终文件 65 字节、末尾 LF，SHA `aa6d37c4507adfcedac067b46ddf51a9beff1f0377d6de5de232645c259e3a6b`。list 返回 `demo.txt`、file、65 字节、`truncated=false`，无编辑提案。最终回执均未发送模型，仍正常结束。手动复测 list 只需在第二步改选“列出目录”、相对路径留空，其余发送和等待步骤不变。

定向检查 **145/145 PASS，0 FAIL**，覆盖本次完成状态、只读禁止修改、连续新身份／最新基线、目录范围、读取失败暂停，以及受影响的 Stop、撤权、SHA、防重放和未知结果保护。原 CFT 149、原扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、原 Native 配对保留；只读配置核对加载路径为本仓库 `dist/development`。复用唯一 dev writer，构建记录 revision `85af1a3c0736e6eb05ef5ff9046298300f68f91d17da51f0ec47355a899fa3e8`，相关三份 bundle 的 source map 与源码一致；本轮未另捕获 UI 的 live serve 客户端／revision，不用磁盘指纹代替该证明。

[五轮操作与请求身份、独立磁盘核对、候选来源及检查记录](../evidence/file-protocol-completion-20261106-01a1afe0.json)。记录为操作者可见观察；没有原始 Native 报文或实际总派发计数，本候选的未知写入故障注入和 production 均为 NOT_TESTED。未创建、删除、重命名文件或运行 shell；本轮保留这些原协议边界。测试后原聊天草稿已清空、诊断显示恢复关闭、审阅页和 UI 租约已释放，浏览器、Native 和 watcher 保留。

**独立复评 96/100，达到本轮 ≥95。** Mendel 重新审查三份源码及来源 pin，并依据上述操作者运行观察评估；未独立操作浏览器重放。维度为提示词 25/25、监听分派与完成 25/25、身份与安全 20/20、复现与可用性 19/20、证据完整性 7/10。扣分包含准备阶段通用 ready 文案仍提模型修改，以及原始传输／独立重放证据不足。该分只对应本轮固定协议读写／list 开发链；整产品此前 92 分不变，也不代表 production 验收。

### 当前执行链路与手动复测（2026-11-06）

**通过范围：** 持续开发环境的真实读取、普通修改保存及独立读回、Stop 后暂停状态跨实际 SW 重启保留、测试连接撤销及撤销后新请求拒绝均已有运行证据。当前独立产品复核 92/100；这不是全部测试或 production 验收通过。实际派发计数、未知写入故障、活动任务恢复及其他上文列出的运行缺口仍为 NOT_TESTED。本节只重新说明操作与预期，不代表又执行了一轮浏览器测试。

**实际入口：** 在原 CFT 测试 Profile 的 `chatgpt.com` 具体对话原输入框发送文件需求。Codex 当前聊天不是该网页功能的文件请求入口。ChatGPT 本身没有本机磁盘权限；模型输出提案，固定可信扩展通过原 Native 服务执行真实文件操作。

执行链路如下：

1. Native 已授权工作区提供本地目录与读写范围；扩展连接只对明确审阅的具体 ChatGPT 对话和项目有效。功能开关开启不等于文件授权。
2. 用户在 ChatGPT 原输入框发送明确需求，完整回答结束后，唯一 discovery 和可信后台核验实际用户原文、对话、文档、回答身份及项目文件范围；没有有效连接时先进入可信连接审阅。
3. 扩展后台经 Native 读取指定已有文本文件，核对真实正文与 SHA。只读任务把结果留在本机页面，不自动将正文发给模型。
4. 修改任务把真实文件上下文和本轮新提案身份填入原对话草稿。用户核对需求、路径和正文，再点击原发送按钮。扩展不自动发送消息。
5. 模型收到上下文后生成完整 `opendesk-edit`。正常项目任务由原后台重新核验身份、授权、路径和原文件 SHA，经原持久账本执行写入，再独立读回。此正常流程不要求另进高级旧版协议表单逐次确认写入。
6. 原页面直接展示实际保存回执。只有 `saved=true` 且 `readBackVerified=true` 才算保存核验完成；模型声称“完成”或只生成代码块不证明已经落盘。保存回执无需再发送给 ChatGPT。unknown/OUTCOME_UNKNOWN 不得重发或换 ID 重写，只能走只读对账。

#### 准备与连接

使用原 CFT 149.0.7827.55 的「您的 Chromium」测试 Profile，打开原测试对话：<https://chatgpt.com/c/6aec9316-59c4-83ee-bc35-0bcf4d1b221b>。上次验证加载的是本仓库 `dist/development` 持续开发产物；这不是 production 安装验收。不要为了复测复制安装目录、更换扩展 ID、重装或启动第二个 watcher。同一测试浏览器可在地址栏打开 `chrome-extension://ccfcjegpkdlgbclopjmadlcjedelidmf/native-agent/settings.html#chatgpt-files-controls` 进入现有本机连接设置。开始时检查 Native 显示已连接、ChatGPT 项目文件处理开启；显示诊断面板仅在需要查看长正文或管理连接时开启，不是运行权限。

本轮只使用已授权项目 `workspace` 内已有 `demo.txt`，实际路径 `/Users/shopme/Documents/workspace/opendesk-browser/artifacts/chatgpt-files-20261103-01a1a1b4/workspace/demo.txt`。上轮结束时是 59 字节、末尾 LF，正文为 `OpenDesk local file test\nstatus=verified-20261106-01a1afe0\n`；手动复测前以实际磁盘为准。

**上轮收尾已撤销该测试对话的项目连接。** 新需求应先出现“当前对话没有有效的项目连接”。在原对话发起下面的读取需求后，使用新打开的可信「项目连接与诊断」页，点击“检查当前对话与项目连接”，核对项目 `workspace`、接收对话 URL 和本次用途，再点击“连接此项目”。这个连接不替代 Native 目录权限。若自动页面未出现，从原对话诊断内“可选：旧版文件请求 → 审阅当前对话的文件请求”打开新的绑定页面；只使用上方项目连接区。单独从书签打开的设置页不能代替原对话绑定。若出现 `E_FILE_EXPIRED`，从原对话重新打开新审阅入口，不重复使用失效 claim。

#### A. 只读测试

在原 ChatGPT 输入框发送：

```text
读取 workspace 项目的 demo.txt，只读不修改。请仅回复“等待读取结果”，由 OpenDesk 在本机显示真实结果；不要调用其他插件或猜测文件内容。
```

完成上面的连接后，预期原页面显示“已读取 demo.txt · 仅显示在本机，尚未发送给 ChatGPT”。查看回执应有真实全文，原输入框保持为空；磁盘内容及 SHA 不变。普通只读回执可能不展示 SHA，必要时用下方只读命令独立核验。需要模型分析正文属于后续披露动作，本只读测试没有自动发送正文。

#### B. 修改与保存测试

确认上一任务已完成、原输入框没有自己的未发送内容后，发送：

```text
修改 workspace 项目的 demo.txt，仅将第二行改为 status=manual-verified-20261106，第一行和末尾 LF 保持不变。真实文件上下文尚未提供时先等待；收到 OpenDesk 文件请求结果和 editProposal 后，按其中协议生成完整修改提案。不要调用其他插件或编造文件内容。
```

这份示例把“等待”限定在上下文到达前，避免持续要求模型“现在仅回复等待”。本轮新增手动示例尚未原生重放，不把提示词说明记作新 PASS。

Native 上下文填入原草稿后，核对 `workspace`、`demo.txt`、完整当前正文和修改目标，再点击原发送按钮一次。保持 Native JSON 的 requestId、bindingId、workspaceId、path、baseSha256 等字段不变，不手造或复用历史协议。等待模型完整返回新 `opendesk-edit`，再等原页面的真实保存结果。

通过条件为原页面显示“已保存 demo.txt · 独立读回核验通过”，展开回执为 `saved=true / readBackVerified=true`，修改前、提案后和读回全文相符；磁盘第一行不变、第二行为本次标记且末尾 LF 保留。没有这些回执就不能判 PASS。测试结束无需发送保存回执。

独立终端仅执行以下只读核验，不用终端预写或恢复文件来制造结果：

```sh
cat '/Users/shopme/Documents/workspace/opendesk-browser/artifacts/chatgpt-files-20261103-01a1a1b4/workspace/demo.txt'
shasum -a 256 '/Users/shopme/Documents/workspace/opendesk-browser/artifacts/chatgpt-files-20261103-01a1a1b4/workspace/demo.txt'
tail -c 1 '/Users/shopme/Documents/workspace/opendesk-browser/artifacts/chatgpt-files-20261103-01a1a1b4/workspace/demo.txt' | od -An -tx1
```

末字节应为 `0a`。手动修改后 SHA 会变化，不再套用上轮 `52c7dae0…`。

#### C. Stop 测试（可选）

新发起一条修改任务，目标用不同标记，例如 `status=must-not-write`。在上下文已经填入原草稿、尚未发送时，点击“停止项目任务”。预期任务进入停止或暂停状态，磁盘保持 B 完成后的内容；Stop 不承诺清除草稿，也不能撤回已派发的写入。不要发送这次已停止任务的上下文或旧提案；需要继续时清理自己的本次未发送测试草稿，重新提出新任务。此操作只验证该停止时机，不代替全部竞态或未知写入测试。

#### D. 撤权测试（可选）

从原对话打开新的可信连接管理入口，点击“检查当前对话与项目连接”并核对目标，再点击“撤销此项目连接”。预期显示“项目连接已撤销”。随后在原对话重新发送 A 的只读需求，预期显示缺少有效项目连接、没有新文件正文结果；不要点击重新连接。之后停止本次待连接任务，隐藏诊断，保持自己的草稿为空。若页面未定位项目，先用该对话的一条新合法读取任务定位已连接项目，再打开新的管理入口，不通过改存储或 Native 配置模拟撤销。

若出现 `Extension context invalidated`，本次操作不计通过，保留实际回执并检查是否发生正常开发更新；未知写入不得重复执行。完成核心 A/B 即可证明本次手动读写主流程，C/D 为对应安全操作的补充复验。完整 SW 恢复、production 与其他专项按上文真实覆盖范围区分，不因手工 A/B 通过而一并勾选。

## 历史原文及证据（原样保留）

以下为迁移前完整原文，包含当时的“当前”“本轮”、旧界面行为、路径、操作、未提交改动和验证结论；均按各自日期和候选理解。当前行为及验证等级以上文为准。

# ChatGPT 本地文件固定协议 R1 · 实现、实测与手动操作

更新：2026-11-05。本文记录当前 Browser 实现、持续开发环境的真实读写证据及手动步骤。本轮复用现有 Native 文件引擎，不修改 Native 仓库；未进行 production 发布验收。

## 当前反馈合同（2026-11-05，覆盖旧文档流结果卡决定）

普通完成结果使用框架唯一 `showPageToast`，不再将结果卡追加到 ChatGPT 输入框附近。成功通知显示 8 秒可见倒计时并支持提前关闭；失败、结果未知与写入未核验使用持续通知，直到点击「关闭提示」、新状态替换或文档清理。关闭只影响展示，不停止、重发或撤销文件操作。相同结果的轮询和诊断开关切换不重启倒计时，也不复活已关闭通知；新的结果身份或实际核验状态变化才更新通知。

只有任务运行期间的状态/Stop、用户主动展开的详情与明确开启的诊断保留固定位置控件，不占网站文档流。完成后默认收回控件。长文件内容不进入通知：在原可信设置 `native-agent/settings.html#chatgpt-files-controls` 开启「显示诊断面板」，回到同一 ChatGPT 标签点击「查看回执」即可只读查看保留的真实正文与回执；诊断开关不产生新的文件访问。任务期间也可主动展开回执，展开状态可继续保留。关闭诊断后，主动展开的详情可用「收起状态」关闭。

保存成功仍必须同时满足 `saved === true` 和 `readBackVerified === true`。通知展示失败只保留固定位置的真实状态和回执作为降级，不重放文件操作。源码路径、权限、消息协议、原 Native 文件引擎、expected SHA 与未知结果围栏保持原合同。下文 2026-11-04 的文档流结果卡和真实运行结果是历史证据，不证明本轮通知候选。

## 本轮通知与真实读写核验（2026-11-05，01a1ac19）

用户允许适应新浏览器窗口后，使用当前账号可访问的新测试对话 `https://chatgpt.com/c/6aec9316-59c4-83ee-bc35-0bcf4d1b221b`。原旧对话无法访问，未冒称恢复原账号。实际环境是 `/Applications/Google Chrome.app` 的 CFT 149.0.7827.55，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载本仓库 `dist/development`；原 serve 已连接，未启动第二个 watcher 或复制安装目录。实际 CFT Native manifest、Native 子进程和只读 doctor 的扩展 ID 配对一致。

已通过正常发送新的只读需求、原可信首次项目连接、Native 读取、原对话显示通知和诊断按需查看正文/SHA。真实截图观察到成功提示的 `1s` 倒计时及随后自动消失，期间输入焦点和未发送草稿保留，默认完成状态无结果卡。空手动任务触发的校验错误提示超过自动时限仍保留，无倒计时，点击「关闭提示」后消失；切换诊断未复活提示。该错误验证没有访问文件，不等于 Native 故障注入。

新的修改任务只针对已有测试文件 `artifacts/chatgpt-files-20261103-01a1a1b4/workspace/demo.txt`。Native 真实上下文回填后，由操作者审阅并发送一次；模型自行返回新的 `opendesk-edit`，稳定写入 request `742c287c-1b0d-4e4a-a243-1ad355d64e3d`，binding `e5e35ff1-b2ae-49fb-8905-48a2d0224593`，已消费，不可重放。读取 request `9ad8fdb5-7f93-44a6-990a-12c1ed57fb6f`、result `8955ba53-cedd-4b5a-8398-f64740d5ce7c`。网页真实回执显示「已保存：true · 独立读回通过：true」，SHA 与终端二进制独立读取一致：

```text
OpenDesk local file test
status=notify-verified-20261105-01a1ac19
```

全文为 66 字节，末尾 LF；SHA-256 `355e0f0b219dac3623ac59e55d61229184a4ce4f1d72297182f60e6b7d67a074`。终端仅只读核验，未预写或恢复测试文件。保存后的成功提示在取图前已到期，因此不把保存提示截图列为证据；保存成功由真实回执与磁盘共同确认。

Stop 首次驱动时只读任务已完成、元素退役，不计通过；第二次在修改任务等待上下文阶段实际点击 Stop，观察到停止中提示、控件收回和未发送草稿保留。后续运行开关关闭/重开及设置刷新均保留草稿，没有可见任务或提示复活；最终清理本轮未发送测试草稿，保留运行开启、诊断隐藏。没有独立 Native 派发计数，不扩大为零派发或全部停止竞态证明。未发送的 Stop 测试编辑 request `611cdc8c-1ba9-4624-9a10-cbd10225827f` 已放弃，不得发送或重放。

首条旧文档出现 `Extension context invalidated / OUTCOME_UNKNOWN` 后保存状态核对，再正常重新载入当前候选；未重放旧写入。设置本机连接摘要仍显示既有 `E_OWNER`，文件流程实际成功不代表修复该摘要。定向自动验证及候选身份、磁盘结果记录在 `artifacts/chatgpt-files-20261103-01a1a1b4/notify-20261105-verification.json`，属于观察摘录，不是原始 Native 包。production、全量 CI、跨浏览器矩阵与独立评分仍为 `NOT_TESTED`；未提交或推送。

## 上一轮独立核验与用户查看方法（2026-11-04 18:43，01a1a61c）

**本轮新真实读写已核验。** CFT `/Applications/Google Chrome.app` 149.0.7827.55 第一窗口、原「接通 ChatGPT 文件入口」聊天，通过正常输入框发送新读取需求和新修改需求。原生回执显示保存与独立读回均 true；终端二进制读取、`cat` 和 `shasum -a 256` 与事先记录的期望全文一致。测试文件只由产品 Native 流程写入，终端没有预写或恢复文件。

- 实际文件：`/Users/shopme/Documents/workspace/opendesk-browser/artifacts/chatgpt-files-20261103-01a1a1b4/workspace/demo.txt`。
- 完整内容：`OpenDesk local file test\nstatus=verified-20261104-183414-1cc16f\n`，64 字节，末尾保留 LF。
- SHA-256：`b91d4a28b57c58e521e468a2cc9f2b4f98d7e1bd5c1bf5639e4c2b44d7e4b89f`。
- 本轮稳定写入身份：`e5d0404c-6b2c-4542-9d32-088dfd64fc07`，binding `69578c3d-c12a-42c4-a25b-4362ee2df921`；已消费，不可重放。真实读取 request `65589d9a-f65f-4591-bb9b-ef9980a3a546`，result `367fe63d-506c-4f89-9889-23fcb7738c42`。上下文仅填一次，由操作者手动发送一次。

**自己核对，无需相信模型“已完成”：**

1. 在指定 CFT 原聊天点击 OpenDesk「查看回执」，查看「已保存：true · 独立读回通过：true」。读取提示「仅显示在本机，尚未发送给 ChatGPT」只证明读取；模型给出 `opendesk-edit` 也不等于已经保存。修改上下文仍须自己审阅并点击发送。
2. 用文本编辑器打开上述实际文件，核对第一行和本轮唯一标记；不要只看聊天里生成的正文。
3. 终端独立执行下列只读命令。全文、64 字节、SHA 和末尾 `0a` 全部匹配，才与本轮结果一致。

```sh
file='/Users/shopme/Documents/workspace/opendesk-browser/artifacts/chatgpt-files-20261103-01a1a1b4/workspace/demo.txt'
cat "$file"
wc -c < "$file"
shasum -a 256 "$file"
tail -c 1 "$file" | od -An -tx1
```

本轮还观察了设置切换保留未发送草稿、运行关闭的新需求不启动可见文件任务、重开不补跑，以及项目 Stop 后晚到模型回答不恢复任务。首个 Stop 驱动因任务已完成而未点到，不计通过；后一个场景实际点击 Stop 并取得停止回执。没有独立 Native 派发计数，不能扩大为真实零派发证明。结束为运行开启、诊断隐藏，刷新设置后仍保留，原输入框为空。

**失败与限制保留：** 首条读取遇到旧文档 `Extension context invalidated / OUTCOME_UNKNOWN`，磁盘未变；正常退役旧文档后新需求成功，未重放旧请求。网页「文件处理设置」链接曾被 Chrome 以 `ERR_BLOCKED_BY_CLIENT` 拒绝，地址栏进入原可信设置可用；设置的本机连接摘要另显示 `E_OWNER`，本轮未诊断或修复这两处入口/摘要问题，不将实际文件读写成功描述为它们已解决。上一轮 `E_FILES_ACCESS` 根因仍未知，本轮最终读写未复现该拒绝。

本轮未改产品源码，不重复已通过且相关输入未变的 153 项检查。共享 `chatgpt-bridge-site.js` 有并行变更；最终写入前后相关源文件和产物 SHA 稳定，sourcemap 内本功能源与当前源码一致。最终网页桥 SHA 为 `6961c52b59b5c85fe6af2838ba61ac3813b7895d96320014e0b4ac0fe6fcae4f`；侧栏收尾实读 serve 已连接、revision `9121af7f0594ed8026bcbad925f77bf2765d5cae7d5bc79dafebd108c6a0620e`。扩展实际 ID、加载路径、Native doctor 的 local.extensionId 与 manifest allowed_origins 配对一致。全局 revision 不替代已打开网页身份，结论只覆盖本次相关链路。

本机观察摘录与磁盘命令结果见 `artifacts/chatgpt-files-20261103-01a1a1b4/independent-verification-20261104-01a1a61c.{json,txt}` 及同名前缀 `-disk.txt`；它们是工具观察记录，不是原始 Native 包，也不能代替当前磁盘与原聊天回执。production、故障注入、全量 CI、Go/MCP、评分、首页首条消息及宽度/跨浏览器矩阵仍未测试。本轮没有提交或推送。

## 正式交互与管理开关（2026-11-04，本轮）

正常使用在 ChatGPT **具体对话**的原输入框发送文件需求。空闲页面不再显示「项目文件 · 在对话中提出需求」常驻调试浮层。有任务时，输入框附近按需显示紧凑的状态与「停止项目任务」「查看回执」；完成、失败或结果未知保留可展开的实际回执，并可「收起状态」。内容位于正常文档流，不覆盖原输入框；停止在请求进行中仍可用，立即交给原后台处理，不等待原 RPC 结束后才提交停止。

管理入口：**扩展选项 → 本机连接 → ChatGPT 项目文件**（`native-agent/settings.html#chatgpt-files-controls`）。复用既有可信设置控件和原项目消息链，唯一偏好记录为 `opendesk.chatgpt.files.preferences.v1`：

| 开关 | 缺省值 | 语义 |
| --- | --- | --- |
| ChatGPT 项目文件处理 | 开启 | 保留合法安装和已有项目/具体聊天授权的可用性。关闭拒绝新任务，暂停未派发操作；重新开启仅接受之后的新需求，不恢复旧消息或草稿 |
| 显示诊断面板 | 关闭 | 按需显示本地提示词、手动任务、旧协议入口与 SHA 等诊断内容。显示或隐藏不改变运行与授权 |

打开运行开关不授予目录、聊天或文件权限；未连接时仍沿用原首次可信披露。已派发写入不伪称撤回，原稳定写入 ID、expected SHA、实际回执、读回、unknown 账本与同路径围栏继续有效。关闭与 Stop 均不能把未知结果变成成功或允许重放。偏好只允许真实扩展设置文档更改，网页不能写配置；偏好无法核实时停止新任务。

只读回执明确说明**仅显示在本机，尚未发送给 ChatGPT**。需要模型参与修改时，仍一次填入受保护的真实上下文草稿，由用户明确发送；扩展不自动点击发送。成功保存只在真实 saved 与独立 readBackVerified 均确认时显示；失败与 unknown 有独立提示，不能以 `completed` 阶段冒称文件成功。

本轮复用固定 ISOLATED 网页入口 → 原 controller/service → 原 Native Messaging 文件服务，以及现有可信设置页面。没有新任务窗口、Host、Authority、文件引擎或 Native 改动。当前验证范围是核心开发和受影响定向验证；首页新对话首条需求尚未纳入本轮（原入口已有的具体对话限制），不据此扩大生产或全量验收。下文早先各轮 PASS 仅证明其各自候选，不证明本轮 UI。

本轮定向检查 **153/153 PASS**。独立复核发现并修复了「新任务因忙碌失败、恢复旧任务时丢失同源 Stop」的竞态：恢复前传递精确来源的暂停状态并先持久化，排队唤醒不新增读取、写入或草稿回填，重启仍暂停，不误停其他来源。已派发写入仍保留真实读回与 unknown 保护；复核后未发现本轮剩余缺陷。

**本轮新候选核心交互与真实读写：PASS。** 并行 owner 正常释放后，本对话取得并在结束时释放原生 UI 租约。现场为 `/Applications/Google Chrome.app` 的 CFT 149.0.7827.55 第一个窗口、原具体对话；扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，实际加载本仓库 `dist/development`。原有唯一 watcher 持续运行，侧栏「调试 → 本地开发服务」确认已连接，revision 为 `09f519953ed11d693d165b444078822bf49ba2b6d5760043d1a678246d62ca9e`。本轮相关源码与 bridge/transport/settings 三个生成入口同源，实测前后产物 SHA 一致，没有第二个 dev/build、重装或 Native 改动。

| 本轮真实操作 | 观察结果 |
| --- | --- |
| 空闲、诊断和原草稿 | 安全刷新原对话后无常驻项目文件浮层。诊断开关可单独显示面板，运行关闭而诊断开启的组合刷新后保留；切换期间自己的未发送测试草稿完整保留 |
| 关闭与重新开启 | 关闭期间发送的新需求未创建文件任务；重新开启不补跑旧需求。诊断关闭时真实读取仍可用，两个开关互不替代 |
| 真实读取 | 回执显示「已读取 demo.txt · 仅显示在本机，尚未发送给 ChatGPT」；全文为 `OpenDesk local file test\nstatus=chat-direct\n`，44 字节，SHA `c8bd4c8f2f86a90accd82669d4a6b5b72307dea77f2cf058f6dbab3908c0bf31`，独立磁盘读取一致，原输入框为空 |
| 真实停止 | 等待模型完整回答时点击「停止项目任务」，显示「本次项目需求已停止，未启动文件访问。」；稍后模型完成也未恢复任务 |
| 一次局部修改 | 准确指定 `workspace` 项目，只把第二行改为 `status=clean-ui`。真实上下文填入一次，测试操作者审阅后手动发送一次；新稳定写入 ID 为 `d8ec9585-f143-4bef-ac9b-1ecf1c6e21e0`，已消费、不可重放 |
| 保存与独立核验 | 原 Native 回执 `saved=true / readBackVerified=true`；独立磁盘全文为 `OpenDesk local file test\nstatus=clean-ui\n`，41 字节，SHA `3d75ba03f17e492c5ee6b19a5dcffc26b1c951ce3b52eca7d4594cc9a4b082cc`，与回执一致 |
| 最终现场 | 运行开启、诊断隐藏，刷新设置后仍保留；完成状态已收起，原输入框为空。只关闭本轮自建设置标签，原 CFT、Native 与 watcher 保留，UI 租约已释放 |

中间一次修改在上下文尚未发送时收到真实 `E_FILES_ACCESS / NOT_DISPATCHED`，页面如实显示失败，磁盘未变；该未使用编辑身份未重放，自己的未发送上下文已清理。只读诊断未定位到具体 Native 请求，原因仍未知，不宣称已经修复 Native 访问拒绝。后续以准确项目名和全新身份完成上表读写；另一次保守项目解析澄清未触发文件操作。真实 unknown 故障注入未执行，unknown/撤权/来源/草稿及至多一次保护由相关定向测试证明。

本机详细证据：`artifacts/chatgpt-files-20261103-01a1a1b4/formal-interaction-20261104-01a1a56c.json`。本轮结果仅为核心持续开发验证，production、根全量 CI、Native Go/MCP 验证和独立评分仍未执行；不提交或推送。下文早先各轮记录保留其原始阶段、候选与结束现场，不能当作当前现场。

## 当前核心流程：直接在 ChatGPT 对话提出文件需求（2026-11-04）

本轮按用户最新纠偏，将正常入口从独立任务输入和提示词窗口收敛到 ChatGPT 原输入框。复用既有 Native Messaging 文件服务，不通过网页保存按钮、下载或模型自报完成落盘；没有接入或新建 MCP 服务。当前源码与定向回归已接线，真实 Chrome 证据见本节后续记录，未验证前不沿用上一阶段的运行 PASS。

1. 在已经连接项目的具体 ChatGPT 对话中正常输入并发送，例如：`读取当前项目 demo.txt，只读不修改`。网页固定 ISOLATED 入口仅见证这一次真实点击发送或非 IME 的 Enter，并等待同一新用户消息的完整回答；历史加载、草稿、协议结果包和合成事件不启动任务。
2. 后台通过浏览器重新读取最新用户原文、轮次和具体文档，核对任务一致性、已处理轮次及项目授权。已有合法连接直接复用；首次确实缺少该项目到该具体对话的披露连接，才打开原可信连接页。提示词上下文不授予文件权限。
3. **只读**：原 Native `files.read` 读取一个明确已有普通文本文件，真实正文及 SHA 直接显示在原页面的 OpenDesk 文件回执中，不要求用户再发送读取结果。该回执是扩展的真实本机结果；`observed:false` 表示 ChatGPT 服务端尚未收到该结果，不能冒称模型已读取。
4. **普通修改**：正常发送例如“修改当前项目 demo.txt，将 status 改为……，保留其他内容”。Native 读取后，将真实正文、SHA 和本轮固定编辑协议一次填入原 ChatGPT 输入框；用户在同一个输入框检查并发送。模型返回完整提案后，原 controller 按任务范围校验、登记稳定写入 ID、以 expected SHA 调用 Native `files.write`，核验真实 saved 回执并独立全文/SHA 读回。最终回执直接显示在原 ChatGPT 页面，输入框不再填入一份要求发送的保存回执。
5. 可以随时停止。已有草稿不覆盖；未确定的回填或写入不重试，未知写入继续保留原账本和同路径围栏。普通聊天不触发文件访问。可选本地提示词整理和手动诊断折叠保留，不是正常使用的必经步骤。

执行位置：固定 `chatgpt-fixed-bridge` 构建入口 → 网页 ISOLATED 的见证/显示 → 原 `chatgpt-files-service/controller` 的真实 Sender、文档、grant/lease 校验 → 原 Native 文件引擎。任务与 Stop 仍由同一后台串行队列和持久任务状态持有，没有新的 Host、身份、权限层或文件引擎。

本轮保持现有 `main`，不提交/推送，Native 仓库只读。CFT 使用独立的既有 Native 实例 `scrapyjs-react-01a186cc`，其目录列表起初为空；仅用该实例已安装 CLI 的 `workspace add` 将原隔离测试目录加入读写授权，未替换 Host、配对、扩展 ID 或其他浏览器配置。日常输出仍为 `dist/development`；收尾按原输出锁尝试恢复已退出的 watcher，结果见下文，不将尝试写成连接成功。原生产验收、根全量 CI、故障注入、Native Go 回归、MCP 发现/鉴权和评分继续延期。

本轮定向源码证据：页面入口、controller/service 与原文读取三个测试文件 **118/118 PASS**，源文件语法、定向 diff 及生成 bridge/transport/settings 的 `inspectScript` 通过。新增行为均有失败后通过的回归，包括原输入框启动、历史/草稿/IME/协议回执不启动、完整回答与导航绑定、切换对话清空正文、请求进行中的 Stop 不丢失、首次连接时草稿失败/未知的终止回执及禁止重试。独立复核提出的后两项问题已修复并复查；不把此源码结论写成真实浏览器 PASS。

本机证据：`artifacts/chatgpt-files-20261103-01a1a1b4/conversation-entry-20261104-01a1a53a.json`，对应 TAP 为同目录 `conversation-entry-20261104-tests.tap`。开发期现场与运行结果分开保存，旧请求身份均不可重放。

**当前目标与关键条件：** 在用户指定的 Chrome for Testing 第一个窗口，通过正常 ChatGPT 输入框完成一次真实读取和一次普通修改；只有 Native 回执、独立读回及磁盘全文/SHA 一致才判通过。14:48 的 UI 租约阻塞是历史观察；本次已正常取得本对话租约，未抢占其他 owner。

| 关键条件 | 本次结果 |
| --- | --- |
| 正常输入框启动，历史/草稿不补跑 | 原聊天发送真实新需求；历史未执行。草稿/IME/合成事件等保护由上述定向测试覆盖 |
| 首次连接准确项目和具体聊天 | CFT 原生实例在线；无映射时先返回 `E_PROJECT_CLARIFY`，未访问文件。准确命名 `workspace` 后在原可信页审阅一次，后续修改重复审阅次数为 0 |
| Native 真实只读，不要求再发送结果 | `success / completed / inline`；正文为 `OpenDesk local file test\nstatus=project-one\n`，44 字节，SHA `d589871d45c3c9d6d02c783ecad932f0f7144494299ca4cae43dcaf9cbaaabd6`，独立磁盘读取一致且未改动，原输入框为空 |
| 普通修改沿用固定身份和 SHA | 正常输入“修改当前项目 demo.txt…”；真实读取上下文仅填回原输入框一次，再由测试操作者点击发送；模型返回完整 `opendesk-edit`，稳定写入 ID `5aca2fc2-c5c2-4f13-b0f6-33d18fa13f05` |
| 真实保存与独立磁盘核验 | 原页面 Native 回执 `saved=true / readBackVerified=true / completed / inline`；磁盘完整正文为 `OpenDesk local file test\nstatus=chat-direct\n`，44 字节，SHA `c8bd4c8f2f86a90accd82669d4a6b5b72307dea77f2cf058f6dbab3908c0bf31`，与回执一致；最终输入框为空，无需再发送保存回执 |
| 失败、Stop、未知和来源保护 | 官网首次生成回答报 `Unknown error`，尚无编辑提案、磁盘未变化；仅点击官网“重试”，返回同一稳定身份后完成。未重放 Native mutation。Stop/草稿/撤权/导航/unknown 围栏仍有定向源码证据，真实负向故障注入未执行 |

**本轮核心读写：PASS。** 现场为 `/Applications/Google Chrome.app` 的 CFT 149.0.7827.55 第一个窗口，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，实际加载 `dist/development`；Native 进程确属该 CFT 实例。当前 CFT workspaceId 为 `workspace-fe28c0b5-041a-4b4f-b37a-a5565944eb0f`，与日常 Chrome 的历史 ID 不同，禁止互相重放。原对话为 `https://chatgpt.com/g/g-p-6ae779125890819197fcee27dd51d25e-opendesk-browser/c/6ae7a721-af80-83ec-a240-8eaa5b63f398`。读写期间五个相关源文件和 bridge/transport/settings 三个产物的 SHA 与本机候选记录一致；没有源码变化，不重复已经通过的 118 项检查。测试文件只通过产品 Native 流程修改，没有终端写入或夹具替代。运行时这些候选字节已加载；当时 serve 进程已退出，属于静态 development 运行证据，不冒称当时持续更新连接成功。收尾恢复 watcher 的状态另存本机证据。

**持续更新的独立缺口：** 读写完成后，`npm run dev` 恢复在编译时拒绝并行改动的 `projects/webflow/trusted/chatgpt-bridge-page.js`：`Trusted Web Flow source changed; review and re-pin before fixed build`。未修改该 owner 的源码或来源 pin、未放宽门禁、未重复构建。当前磁盘开发输出经历过这次未完成编译，不能当作新的完整候选；原已加载页面仍显示上述成功回执且输入框为空，未刷新或重放。此项须由 Web Flow owner 完成来源审查后再恢复；本次原候选的真实文件读写结果不因此改写。

## 上一阶段：项目自动定位与直接读写（2026-11-04）

用户要求纯提示词生成不再受授权拦截，并在已有合法项目与目标对话授权时直接处理普通文件任务。核心实现及同候选真实 Chrome 两任务已通过；下文逐轮选目录、prepare 和逐文件 approve 均保留为旧流程的历史事实，不作为新体验完成标准。

- **纯生成**：网页任务卡和可信页均复用本地 `createTaskPrompt`。不依赖 Native、目录、披露勾选、claim 或网络；打开页面和纯生成的运行时、Native、文件、存储、网络调用计数均为零。
- **项目定位与授权**：优先使用当前具体对话的稳定 workspaceId/sourceId 映射，其次精确匹配已授权 workspace 元数据；不默选第一项、不全盘扫描、不向网页返回全部本地路径。首次缺少对该具体 ChatGPT 对话的披露绑定时，由可信页一次显示项目、目标对话和读写范围，取消不读写。同项目后续任务直接复用；新对话不继承。Native 重连会使旧任务参数失效，用户新发起任务可重新取得当前会话/租约而不重复披露审阅。
- **当前自动范围**：自然语言中明确一个已有受支持文本文件的相对路径；普通修改至多 32 KiB，不再 prepare 或逐写确认。敏感文件、广泛配置、清空或大幅删除、create/delete/rename、Shell、多文件任务及任意项目搜索不在本次自动能力内。项目或路径无法唯一定位时只返回必要澄清，不猜测。
- **后台与完整性**：任务由原 service controller 和 Chrome alarm 持有，关闭设置页可继续；任务、精确来源文档、grant 引用/版本、可信页绑定和稳定写入记录持久保存。恢复先核对来源和当前 Native 权限；旧文档、撤销、会话变化及 unknown 不重放 mutation。保留写前登记、同路径 unknown 围栏、expected SHA、真实 saved 回执和独立全文/SHA 读回。重连后的 unknown 只读对账，不恢复旧写入提案。
- **结果交付**：读取和写入结果各只填入原对话草稿一次，不覆盖已有草稿，不自动发送；发送后观察真实结果标记，最终状态为 completed。修改任务的读取结果已送达后仍等待修改回复；明确只读任务不提供 editProposal，读取结果送达即完成。
- **唯一复用链**：网页 ISOLATED 任务入口 → 原 `chatgpt-files-service/controller` → 原 Native `workspaces.list/files.read/files.write`。复用既有固定协议、提案解析、来源检查和草稿桥；Native 仓库只读。没有新建文件引擎、隧道或公网服务，未证明 chatgpt.com 已接入 MCP。

独立架构专家此前复评 **95/100** 是设计分，本轮运行结果未独立评分，不将其写成运行 95 分。

### 本轮核心补强与当前证据（2026-11-04，01a1a2b7）

真实入口发现：任务“读取当前项目的 demo.txt，说明真实内容。只读取，不修改任何文件。”因包含“修改”而被误识别为修改任务，读取包错误带上 editProposal，无法按只读任务完成。本轮仅修改 `chatgpt-project-policy.js`：明确的中英文只读约束优先，项目名和文件路径不参与操作动词判断；普通正向修改仍可执行。两项策略回归和实际 controller 完成回归先失败，修复后通过。没有因此放宽文件、来源、授权或写入校验。

**上次观察的用户操作（已由本轮原对话入口取代）：** 在原对话打开“通过 OpenDesk 处理项目任务”，填写一个已有普通文本文件的读取或修改要求，点击“处理项目任务”。已有该具体对话合法连接时直接处理；检查自动填入的读取结果后手动发送。修改任务等待真实保存回执再次填入，仍由用户手动发送；页面显示 `completed / 收到结果=true` 才表示本轮结果已送达。首次披露、其他对话和必要权限仍走原可信连接审阅。下方旧版 prepare/逐写批准步骤是历史流程。

- **真实只读闭环 PASS**：读取 requestId `8283453f-2b92-4846-b831-87c4804b543e`、resultId `fb89749a-1239-4274-9107-30de1f32e3c2`；结果没有 editProposal，发送前 `filled / observed=false`，手动发送后 `completed / observed=true`，文件未变。
- **最新相关产物两项普通修改 PASS**：下表两项均没有再连接、选目录、prepare 或逐写批准。Native 返回 `saved:true / readBackVerified:true`；各自独立磁盘全文及 SHA 一致，回执发送前为 `confirmed / filled / observed=false`，手动发送后为 `completed / observed=true`。全部身份已消费，不可重放。

| 当前复验任务 | 稳定写入 requestId | 写入 resultId |
| --- | --- | --- |
| `project-one → project-two` | `b84dabd0-09d2-4628-88ff-3386b4c3b98f` | `7756066b-81b4-4613-a844-180670096a4c` |
| `project-two → project-one` | `943cfa46-7888-46ea-8902-5a3fddd3bc5d` | `8e8b4db4-25c4-4555-916e-83879cf55e95` |

- **真实草稿及停止 PASS（受限场景）**：预置本轮未发送测试草稿，发起只读任务后返回 `E_CHAT_DRAFT`，原草稿完整保留；点击停止后为 `paused`，清空自己的测试草稿后未继续回填。该操作没有发送草稿，也没有写盘；真实派发中断、重启防重与次数由下述定向测试证明，不将这次 UI 检查扩大为这些实测结论。
- **149/149 定向 Node 检查 PASS**：包括纯生成在 claim/state/prepare/start 等待或失败时的零额外调用、无歧义范围与拒绝模型换路径、撤权恢复拒绝、自动修改 SHA 冲突零写入、写前账本失败零派发、ACK 后持久化失败跨重启保留围栏、unknown 仅读回且不伪称原回执、Stop 前/中派发防重、真实 service alarm 与页面唤醒共用队列及 guard 释放、原对话一次回填和来源/正文不可信边界。新增 Stop 测试含同一有效提案未停止时确实写入的对照。源码与四个测试文件语法、相关 diff、更新后的 transport `inspectScript` 均通过；未重复全量构建。
- **候选身份**：仍为原 Chrome、ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、`dist/development`，复用 PID 19312 watcher。两项当前复验期间及结束时开发服务已连接，revision `8bd51efe934afb2c4c4ac2eb98e51589a6a5051c7ba677db7cc3cb373e0e5d15`，相关源码及 transport/settings/网页桥 SHA 均稳定。纯只读闭环早于该全局 revision 观察，以相同相关源码/产物单列证据，不声称整个并行仓库同候选通过。
- **中间环境事件**：另一次已确认保存的写入 `141606d1-110c-48e5-ad20-9c569f842dac` 在发送回执后遭遇 `Extension context invalidated`，没有取得最终 completed 状态，未计入当前两项。空草稿页面正常刷新后用全新身份完成上表复验，未重放旧写入、未重启共享服务。刷新时 ChatGPT 曾显示无法加载，点击原“再试一次”后恢复，不据此改产品。
- **结束现场**：`demo.txt` 为 `OpenDesk local file test\nstatus=project-one\n`，44 字节，SHA `d589871d45c3c9d6d02c783ecad932f0f7144494299ca4cae43dcaf9cbaaabd6`；任务已停止，原对话草稿为空，桌面 UI 租约已释放。未提交/推送，保留并行源码与原 watcher/Native。

定向测试命令（本轮仅运行与当前行为相关的六文件集合）：

```sh
node --test tests/browser/chatgpt-project-policy.test.mjs tests/browser/chatgpt-files.test.mjs tests/browser/chatgpt-files-ui.test.mjs tests/browser/chatgpt-file-intent.test.mjs tests/environment/workspace-chat-request.test.mjs tests/environment/workspace-chat-edit.test.mjs
```

完整本机记录为 `artifacts/chatgpt-files-20261103-01a1a1b4/project-agent-core-20261104-01a1a2b7.json`，另有两次独立磁盘核对文件。它们是本机开发证据，不是发行资产；本节是受跟踪的结论入口。production、真实 Native 断线/存储故障注入、跨浏览器/长压测、根全量 CI、Native Go 回归、MCP 接入和本轮独立评分仍 **NOT_TESTED**；未取真实 Native 独立派发计数日志。

### 前一候选的新流程真实开发证据（保留历史）

日常 Chrome 实际扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载本仓库 `dist/development`，开发服务已连接；复用 PID 19312 的 watcher，未重新安装、运行第二个 dev/build 或切换 production。初轮仅一次项目披露连接，随即关闭设置页，完成 `manual → project-one → project-two` 两次自动保存。恢复逻辑修正后，在空草稿的原对话刷新到最新文档，使用新请求身份复测以下两项；全程再次连接、目录选择、prepare、逐写批准次数均为 **0**。

| 同候选任务 | 稳定写入 requestId（均已消费，不可重放） | 实际结果 |
| --- | --- | --- |
| `project-two → project-one` | `47c7965e-3d29-4375-ae66-d04f4f185ec6` | saved / readBackVerified 均 true；独立磁盘全文与 SHA 一致；原对话收到回执，completed / observed=true |
| `project-one → project-two` | `891fb6c9-02c1-48be-bac2-03e78b0c544c` | saved / readBackVerified 均 true；独立磁盘全文与 SHA 一致；原对话收到回执，completed / observed=true |

- 隔离测试文件最终正文为 `OpenDesk local file test\nstatus=project-two\n`，44 字节，SHA `0514d4480f683dfd439b76ec3aa00f86c14be8409945c5988e213b94456b9d2f`。
- 同候选两任务期间相关源码及 transport/settings/网页桥三个产物 SHA 保持一致；完整身份、全部读写请求/结果 ID 与正文保存在本机 `artifacts/chatgpt-files-20261103-01a1a1b4/project-agent-20261104.json`。这是开发证据，不是可导入安装包。
- **132/132 定向检查通过**：纯生成零调用、两任务无需中转、严格范围/提案/来源与草稿保护、撤销和旧文档零 mutation、同 ID 并发最多一次、unknown 重启不重放、重连只读对账、SW 恢复可信页绑定、无关导航不丢任务。三个实际开发 JS 产物的 `inspectScript` 检查及本轮 diff/语法检查通过。真实 Native 独立 dispatch 计数日志未取证，至多一次由定向计数测试证明；真实网页记录两条不同稳定 ID 的成功回执。
- production、真实断线/超时故障注入、跨浏览器、完整 CI、Native Go 回归与 MCP 客户端发现/鉴权均 **NOT_TESTED**；没有把 Node PASS、设计分或旧流程证据提升为这些结论。本轮不提交/推送，保留并行未提交改动与现有服务。

## 旧阶段目标与关键测试条件（保留历史证据）

**目标：** 在官方 ChatGPT 原对话中，通过浏览器扩展、完整固定协议/Web Flow 和现有 Native Messaging 服务，完成受限的本地文件读取、具体修改确认、写入及真实结果回传。正常入口无需先进入 Workspace；首次目录授权与必要的写入确认保留。网页和模型只提交请求，不构成授权。

本轮为开发阶段。最新追加目标是：先将完整调用规则发送给 AI，AI 完整回答后自动执行已批准的读取、自动展示修改提案，具体确认后写盘并自动回填真实结果。自动流程要求可信文件页保持打开，发送草稿仍由用户完成。复用下文已有有效证据，不因设置目标而重复写入样例、重跑无关测试或启动 production 验收。测试文件可以来自用户明确批准的普通目录；隔离目录是本次测试现场，不是产品强制条件。

| 条件 | 必须观察到的结果 | 当前证据 |
| --- | --- | --- |
| T1 入口与首次授权 | 从官方原对话进入可信扩展页；仅选择已有 Native 授权；页面、模型和文件名提示不能新建或扩大权限 | 真实入口与 claim PASS；权限边界源码 PASS |
| T2 完整协议与精确范围 | 只接受唯一、完整、身份匹配的固定协议；操作与相对路径必须等于批准值；拒绝截断、重复字段、绝对路径、越界及模型换路径 | 定向源码 PASS；真实正常协议 PASS |
| T3 真实读取 | 返回 Native 实际读取的完整正文及 SHA，重新计算摘要一致；不以模型猜测或仅生成提示词算成功 | 真实 Chrome/Native PASS |
| T4 具体写入确认 | 未点击可信页具体确认时写入次数为零；确认的目录、路径、完整前后正文、原 SHA 和稳定请求 ID 与执行值一致 | 定向源码 PASS；真实确认与写入 PASS |
| T5 SHA 与权限变化 | 文件已变化、只读/撤权、Native 会话或租约失效时拒绝旧提案，磁盘不被旧提案覆盖，不自动扩大授权 | 定向源码 PASS；真实浏览器负向场景 NOT_TESTED |
| T6 重复请求 | 相同写入 ID、并发重复或已消费提案不再产生新写入；未知状态不能换 ID 绕过同路径围栏 | 定向源码 PASS；本次浏览器结果各发送一次；真实故障重放 NOT_TESTED |
| T7 结果未知 | 超时、断线或回执无法核实时保留 unknown；先核对原回执或独立只读读回，禁止重发 mutation；读回匹配不能冒称收到原回执 | 定向源码 PASS；真实断线/超时注入 NOT_TESTED |
| T8 独立验证与原对话送达 | 成功写入必须取得真实回执并独立读回全文和 SHA；每个结果仅回绑定原对话一次，已填草稿不等于已发送 | Native 回执、Native 读回、独立磁盘读取和原对话结果标记 PASS |
| T9 不可信数据与来源失效 | 文件正文、网页文字及模型输出均不执行、不提权；不提供 Shell；来源导航、文档退休或过期后旧绑定拒绝继续操作 | 定向源码 PASS；真实来源失效负向场景 NOT_TESTED |

**本轮完成判定：** 真实浏览器正常读写闭环通过，相关源码保护测试通过，且可复制步骤、证据等级与未验证项已保存。此前手动处理回答的证据满足原开发目标；新增自动识别能力须另列真实浏览器证据，不能用旧结果代替。该结论不表示真实负向故障注入、Native Go 测试或 production 验收通过；这些项目保持下文状态，只有新授权或当前缺陷确需时才扩展执行。

## 旧流程实现（历史保留）

- 真实可信入口是 `native-agent/settings.html#chatgpt-files`。`src/entrypoints/settings.js` 以 `?raw` 导入固定 `chatgpt-files.html` 模板并挂载 `chatgpt-files-root`；后者不是独立输出页面，不应直接打开其 URL。
- 原 ChatGPT 对话的第一方入口仅打开可信扩展页。扩展页先发送 `opendesk.chatgpt.file-intent.v1` / `claim`，再用 `opendesk.chatgpt.files.v1` 调用 `state`、`prepare`、`poll`、`pause`、`inspect`、`approve`、`reconcile`、`fill`、`observe`。服务回复 `{ok:true,data:snapshot}` 或 `{ok:false,error:{code,message}}`。
- UI 复用 `design-tokens.css`、`native-agent/settings.css`，不引入 React 或依赖。操作由原生 `isTrusted` 事件触发；来源绑定不由网页或模型选择，目录不自动选择，网页文件名提示不构成授权。
- `prepare` 明确批准所选 workspace、精确相对路径及 `read` / `list` 操作，只向原始对话披露；此时尚未读取。`inspect` 核验原对话完整回答、轮次与身份，执行已批准的读取/列表，或暂存编辑提案。模型不能借回答改变批准路径、操作或目录。
- 本页明确批准范围后，约每 2.5 秒从可信页调用（后台页可能受浏览器限流） `poll`：忽略准备前轮次与生成中的回答；按请求身份、轮次和回答版本去重。成功读取后自动填入原对话草稿，用户发送真实结果后才处理后续编辑回答。提案出现时停止轮询，绝不自动批准。更改目录、路径、操作、任务或撤回勾选会 `pause`；关闭本页会终止轮询。流式过渡只在尚未消费读取身份时继续等待；读取已消费后回答变化则暂停，禁止重复读取。
- `approve` 必须携带用户当前看到的不可变 `reviewId`，不能确认被替换的提案；`fill` 必须携带精确 `packetId`，不能把旧操作作用于新结果。
- `approve` 只在审阅原文、完整新文及 `baseSha256` 后显式写入，并核验真实写入回执与独立读回。正文以只读文本展示，不执行其中内容。Shell、删除、改名及任意绝对路径不属于本协议。
- 原有 Native `files.list/read/write/create`、目录授权和租约继续由原文件服务负责；此网页入口只开放已批准的读取/列表与具体修改，不把 Native 的 create 能力等同于网页已经获得创建权限。
- 发往网页的协议 JSON 使用单行编码，避免官方段落编辑器对行首缩进的归一化；字符串内的文件空格、换行仍保留 JSON 数据含义。原生编辑命令后的临时 DOM 不算回填成功，必须再执行一次独立读取核验。比较保留原有单个尾换行容差；失败仍标未知，不重新插入。

## 旧阶段测试现场与证据等级

以下为操作者本轮提供的当前观察；继续操作前核对仍是同一会话与目录，不把记录当作新的实测：

| 项目 | 当前证据 |
| --- | --- |
| Browser 原对话入口可见、可信页打开 | 已观察到 |
| 从原对话领取 claim | 已成功 |
| Native 连接 | 已观察到 connected |
| 隔离目录 read-write 授权 | 用户已明确响应并授予 |
| 真实读取 | **PASS（Chrome development）**；Native 返回 39 字节正文及基线 SHA |
| 具体修改、确认、写盘、独立读回 | **PASS（Chrome development）**；确认前后正文及原 SHA，收到 saved 回执与 Native 独立读回，再用本机文件读取单独核对 |
| 结果回原对话一次 | **PASS（本次运行）**；读取、写入回执分别发送一次，两个 observe 均为 true；原对话 AX 消息中两个 resultId 各出现于一条结果消息，输入框最终为空，填入按钮禁用 |
| 列表 / 创建的真实网页操作 | **NOT_TESTED**；本次最小链路使用读取与修改，网页未开放创建 |
| Browser 定向源码测试 | **105/105 PASS**，包含自动轮询、范围暂停、精确确认、并发防重及未知回填；另原 fixed transport listener 定向测试 **1/1 PASS** |
| 新增 AI 回答自动处理的真实浏览器测试 | **PASS（2026-11-04，Chrome 持续开发环境）**；完整 AI 请求自动读取，真实结果自动回填；发送后 AI 编辑提案自动展示，具体确认后写入、独立读回及自动回填成功；两次结果送达标记均为 true。没有点击手动处理回答或结果回填按钮 |
| Native Go 定向保护测试 | **BLOCKED**；尝试运行现有测试，shell 返回 `go: command not found`，常用安装路径未找到 Go；没有安装或替换运行中的 Native |
| production 包、正式安装、跨浏览器、真实断线故障注入 | **NOT_TESTED**；不以 development 证据代替 |

首次手动处理回答的固定现场（后续自动测试见下一节）：

- 原对话：`https://chatgpt.com/c/6ae7a721-af80-83ec-a240-8eaa5b63f398`。
- workspaceId：`workspace-3613fb22-6420-41ef-aa26-f3ac224ebf37`。
- 隔离目录：`/Users/shopme/Documents/workspace/opendesk-browser/artifacts/chatgpt-files-20261103-01a1a1b4/workspace`。
- 文件：`demo.txt`。起始内容为 `OpenDesk local file test\nstatus=before\n`，实际最终内容为 `OpenDesk local file test\nstatus=after\n`；这里的 `\n` 表示真实换行，保留末尾换行。
- 基线 SHA：`b8514bf27d9b544770ca3d1465a9e64ae0490fb6e5489eee466f369a65c37b0f`。
- 写入与两条独立读取一致的最终 SHA：`a73b960e1f2c83e635680e5c8a177150ac84535fea085fbd3940c05a417fe548`（38 字节）。本机单独 `fs.readFileSync` 后重新计算 SHA 并断言完整正文一致。
- 读取 requestId：`e9431cdb-8f45-4483-a7b4-0a9a8e7dbd3b`；读取 resultId：`9be4da32-bf54-4e05-b19d-e5fdfd036bbe`。
- 写入稳定 requestId：`5a2e6f9e-4c39-4c5c-8485-217274fae0a2`；写入 resultId：`146b4e65-6fda-4cce-898a-c782b6c98141`。这些身份已消费，**不可复制重放**。
- 实测加载 ID：`ccfcjegpkdlgbclopjmadlcjedelidmf`，日常路径 `dist/development`；首次实测复用 PID 33071 的 dev watcher。追加自动功能时重查该服务已退出，按原协议恢复 `npm run dev`，输出仍为 `dist/development`；未重装扩展或停止并行服务。期间 dev 曾因默认 4 GiB Node 堆耗尽退出；已以仅本进程 `NODE_OPTIONS=--max-old-space-size=8192 npm run dev` 恢复，当时观察 PID 19312、serve 端口 43119、产物指纹 `cb1290698ecea502f0c4d5052f4cfc8e2d68a6228c6a6899014c3f66aece5d3a`。当时 Native doctor 的真实响应确认配对 ID 及 nativeConnected。该阶段源码收尾时 Browser 为 `main@43203cbd2018`、Native 为 `master@909effdc2e1c`，均保留并行未提交修改，本轮未提交/推送。以上是历史运行观察，续接时重新核对服务、连接和产物。

### 追加自动流程的实际浏览器证据（2026-11-04）

已释放的桌面 UI 租约按原协议取得并在测试后正常释放。使用已登录的 `/Users/shopme/Applications/Google Chrome.app`，不操作 ScrapyJS 所在 `/Applications/Google Chrome.app` CFT149 的 Books 窗口；后者未登录本 ChatGPT 账号。本轮复用原扩展 ID、`dist/development` 和 PID 19312 的 serve，不重装扩展。

原对话旧上下文首次将文件协议误认为已安装 Web Flow 任务，未输出请求；扩展返回 `E_CHAT_FORMAT`，未执行文件操作。已在生成规则中明确专用文件入口与 Web Flow 安装任务目录的区别。相应提示词、严格解析、真实编辑/结果往返定向测试重新运行 **40/40 PASS**（属于上述 105 项的受影响子集，不重复累计）。随后使用新身份完成全链：

| 证据 | 本次实际值 |
| --- | --- |
| 读取 requestId | `27c396d8-405e-42b2-8e8f-30beee45ab7a` |
| bindingId | `50c193dc-7a1d-49fe-9b0d-eb9ea1b278a1` |
| 读取 resultId | `b2e54fcc-bdbb-4135-9de8-bc7941786d70` |
| 读取正文与 SHA | `OpenDesk local file test\nstatus=after\n`，38 字节，`a73b960e1f2c83e635680e5c8a177150ac84535fea085fbd3940c05a417fe548`；与写前独立磁盘读取一致 |
| 稳定写入 requestId | `824f637d-7d6b-4b80-b628-1bbe1fb6789a`；AI 原样复用真实 editProposal，可信页展示完整前后正文及原 SHA |
| 具体确认 | 点击「确认写入此文件」，仅第二行 `status=after` → `status=auto`，保留第一行与末尾换行 |
| 写入 resultId | `b1de8a97-f549-41e8-8cb7-ec06b0c77b6d`，`saved:true`、`readBackVerified:true` |
| 最终正文与 SHA | `OpenDesk local file test\nstatus=auto\n`，37 字节，`7d10d51f0f5565130de9304b74d2f229a786e9de2bfa91728c6a6e74583ca781`；Native 独立读回与另一条本机 `fs.readFileSync`/SHA/全文断言均一致 |
| 原对话送达 | 读取、写入结果分别手动点击发送一次；可信页先后观察到各自结果标记 `true`，最终显示「原对话已收到本轮结果」且回填按钮禁用；原对话最后回复确认真实保存与读回 SHA，输入框为空 |
| 开发产物 | 本次自动流程使用 revision `0c6b5d570d9ac55101394ac17de1b42c787f300a1f5de13a5b09b45bb135d654`；Browser `main@63090e6ee601`、Native `master@909effdc2e1c`（并行状态，非本轮提交） |

这些请求身份已消费，不可重放。本次没有点击「读取完整回答并处理请求」或「填入结果草稿」，自动处理由可信页轮询触发。真实路径越权、SHA 冲突、重复 mutation 和断线注入仍未做浏览器故障测试；对应源码保护测试通过。该次结束时文件为 `status=auto`；最新现场以下节 UI 复验为准。完整本机证据保存在 `artifacts/chatgpt-files-20261103-01a1a1b4/automatic-source-evidence.json`，包含对应源码和三个开发产物的 SHA；三个产物均重新通过现有 `inspectScript` 静态检查。

### 入口恢复增量（2026-11-04）

续接时确认上述四份核心源码 SHA 与本机证据一致，`demo.txt` 仍是 37 字节的 `status=auto` 正文；被中断的限定路径 `git diff --check` 已重新完成，退出 0。

实际发现旧网页点击后停留“正在打开”，没有可信页及错误反馈。保存草稿并正常刷新原网页后，同一入口立即恢复。原异常堆栈未取证；源码和失败回归证实：Chrome 消息调用同步抛错会逃出原 Promise 捕获，使按钮一直锁住。本次仅修复 `chatgpt-file-intent-page.js` 的异常捕获与恢复提示，保留真实点击、并发防重和退役检查，不自动刷新或重发。

- 本次源码证据：`node --test tests/browser/chatgpt-file-intent.test.mjs` **8/8 PASS**，包含先失败再修复的同步异常/退役回归；源文件语法和实际生成网页桥的 `inspectScript` 检查通过。
- 本次真实 Chrome：更新后新文档从原对话打开可信页、claim 成功、Native 已连接，已有目录可手动选择；未批准新读取、未写入、未回填或发送消息。完整正常读写闭环沿用上节原始证据，不合并测试分母，不将它写成新全局候选已全链复验。
- 更新后侧栏确认开发服务已连接，revision `970a159a2e3d323b2bff6f86fd52043918368cfc18829a292fe2ccebba141106`；网页桥 SHA `2bdd5686fdef52e64d9d79d7f70c85726d0b5af753d197589acd6441edbdf615`。此身份仅绑定本次入口冒烟，不代表其余并行功能已验收。
- 同步异常的浏览器故障注入仍为 **NOT_TESTED**；本次以定向源码回归证明错误处理。本机详细记录为 `docs/framework/workstreams/chatgpt-files-entry-recovery-20261104.md`（工作记录目录由仓库规则忽略，不是发行资产）。

### 用户要求的本轮真实 UI 复验（2026-11-04）

目标：在原 ChatGPT 对话跑通读取 → AI 提案 → 可信确认 → 保存及独立读回 → 自动回填 → 手动发送。关键条件为精确范围与新身份、确认前不写盘、全文和 SHA 一致、回填不自动发送，以及原对话真实观察到结果标记。本轮已全部通过；没有点击手动处理回答或手动结果回填按钮。

| 条件 | 本轮实际证据 |
| --- | --- |
| 新身份与精确范围 | 从原网页按钮领取新 claim，选择已有授权的隔离 workspace，路径仅 `demo.txt`；bindingId `61433c92-bfb6-4777-8895-e9d7fe8fd09e` |
| 自动读取和回填 | 读取 requestId `c8ac46c7-c1b6-453a-a5f2-5e295e4487cd`；resultId `f80816ea-b169-4918-a14c-b77804c6e33e`；完整正文 37 字节，基线 SHA `7d10d51f0f5565130de9304b74d2f229a786e9de2bfa91728c6a6e74583ca781` |
| 提案不写盘 | AI 原样复用 editProposal 的稳定 requestId `294551c9-9b88-4d3d-bc8c-b46ba6658cc2` 及原 SHA；可信页显示完整前后正文。提案可见、确认前另用本机读取断言文件仍为 `OpenDesk local file test\nstatus=auto\n`，SHA 未变 |
| 具体确认和真实保存 | 仅点击一次「确认写入此文件」，只将第二行改为 `status=manual`。写入 resultId `3c95bc66-9d47-4779-8d30-f4ea04be283b`，`saved:true`、`readBackVerified:true` |
| 独立全文及 SHA | 另用本机 `fs.readFileSync` 读取并断言完整正文为 `OpenDesk local file test\nstatus=manual\n`，39 字节，SHA `64bd4000dcd31bd007cbabbce4d0f966bc49be9ea52d505a55814ef7179545aa`，与 Native 回执一致 |
| 原对话真实送达 | 读取、写入结果各自动填入草稿一次，再由测试者各手动点击发送一次；两次结果标记均观察到 `true`。写入发送前观察到 filled 且标记 false；发送后显示「原对话已收到本轮结果」，回填按钮禁用、原对话输入框为空，AI 确认本轮 39 字节及 SHA |
| 实测产物边界 | 本轮继续使用 `dist/development`，revision `970a159a2e3d323b2bff6f86fd52043918368cfc18829a292fe2ccebba141106`；网页桥 SHA `2bdd5686fdef52e64d9d79d7f70c85726d0b5af753d197589acd6441edbdf615`。结束时重新读取产物身份仍一致；并行源码修改不自动继承本轮运行结论 |

以上请求身份均已消费，不可重放。本机证据保存为 `artifacts/chatgpt-files-20261103-01a1a1b4/ui-roundtrip-20261104-01a1a271.json`。关闭本轮可信页后，保留原对话和空草稿，释放 UI 租约；没有重启 watcher、重新安装或提交推送。真实越权/冲突/断线故障注入及 production 验收仍为 **NOT_TESTED**，既有定向保护测试的证据保持原范围。

## 历史手动诊断步骤（非正常主流程）

1. Native 目录授权通过 CLI 建立，无需先进入 Workspace 页面。本现场已获授权，不为重复验证重新授权；新现场使用实际隔离目录：

   ```sh
   opendesk browser workspace add --path /Users/shopme/Documents/workspace/opendesk-browser/artifacts/chatgpt-files-20261103-01a1a1b4/workspace --access read-write
   ```

2. 在上述原 ChatGPT 对话点击「通过 OpenDesk 处理本地文件」→「审阅当前对话的文件请求」。可信页核对来源 URL 与 Native 连接。旧记录不证明本次绑定仍有效：同文档绑定限 30 分钟，来源刷新、退役或可信页关闭后须从原对话重新领取，不通过直接导航绕过一次性 claim。若旧网页入口一直“正在打开”，先检查是否已有审阅页；没有时保存原对话草稿并正常刷新网页，再手动打开入口，不重放文件修改。
3. 手动选择上述 workspaceId 对应目录，路径填写 `demo.txt`，操作选读取，任务填写下方可复制文本。核对披露说明并勾选，再点「批准本次读取并准备提示词」。
4. 使用 UI **实际生成的完整提示词**，点「填入原对话草稿」，切回原对话核对，然后由用户点击发送。不要自行生成 `requestId`、`bindingId` 或 SHA，不使用本文中的占位 JSON 代替 UI 生成包。
5. 保持可信页打开，等待模型完整回答。无需点「读取完整回答并处理请求」：自动轮询会核验并处理。该按钮保留作手动诊断。预期回答是单个 `opendesk-request` 代码块，协议为 `opendesk.workspace.request.v1`，原样保持 UI 的 `requestId`、`bindingId`、`workspaceId`、`operation`、`path`。检查真实结果和状态；出现错误停止该步骤，不把提示词已生成当作文件已读取。
6. 读取成功后，结果自动填入原对话草稿，回原对话核对并手动发送。自动检查会观察结果标记，也可点「发送后检查结果标记」。结果协议为 `opendesk.workspace.result.v1`；只有原对话用户消息中观察到本轮真实 `resultId`，才记为结果已回到该对话。草稿 filled 本身不证明已收到。
7. 模型收到真实正文后，应仅返回一个 `opendesk-edit` 代码块，协议为 `opendesk.workspace.edit.v1`。它必须复用读取结果内 `editProposal` 的全部身份及 `baseSha256`，只把 `content` 改为完整目标正文。编辑请求 ID 使用真实 `editProposal.requestId`，不要误用读取请求 ID 或编造新 ID。
8. 模型回答完整后，可信页自动展示提案并暂停自动处理。核对提案路径、写入前后状态、完整正文和 SHA，再点「确认写入此文件」。首次实测为 before → after，自动流程实测为 after → auto，本轮 UI 复验为 auto → manual；下方可复制任务供当前 manual 文件再手测一次，开始时仍须重查基线。仅提案出现不算写盘成功；需真实回执及独立读回证据。确认后真实写入结果会自动填入原对话草稿，手动发送并检查结果标记。
9. 单独验证 `list` 时，从 UI 准备新轮次，明确选择目标相对目录并批准 `list`；使用该轮 UI 生成身份完成请求与结果往返。列表不是编辑依据，也不授权递归读取或其他路径。协议用空字符串表示根目录；不要用 `.` 或伪造请求绕过当前 UI 的路径校验。

可先复制到 ChatGPT 的开场提示词：

```text
请通过 OpenDesk 的专用文件请求入口读取我明确授权目录内的 demo.txt。这是文件固定协议文本往返，不是调用 Web Flow 已安装的浏览器任务。先等我从可信扩展页发送带本轮真实身份的完整规则，再只返回一个 opendesk-request，不猜测文件正文或 SHA。收到真实读取结果后，若第二行为 status=manual，请复用 editProposal 的身份和原 SHA，提出仅把该行改成 status=auto 的完整文件提案，保留其余字节及末尾换行。写入等我在可信页确认；仅根据真实 saved 和读回核验回执报告成功。不使用 Shell、MCP Tunnel 或扩大目录范围。
```

这段开场文字不是授权或可执行请求。点击网页「通过 OpenDesk 处理本地文件」进入可信页，选择 Native 已授权目录、精确路径与读取操作，勾选本轮自动读取及披露范围；再把生成的完整提示词填入原对话并发送。真实 requestId/bindingId/SHA 均由扩展提供，不手工编造。

可复制到 UI「任务」字段的文本（身份仍由 UI 生成）：

```text
请先按这条 UI 提示词提供的固定协议，只返回一个 opendesk-request，原样保留它的全部身份、read 操作和 demo.txt 路径。收到我手动发送的真实 OpenDesk 文件结果前，不要猜测正文，也不要声称已经读写文件。
这是专用文件协议，不依赖 Web Flow 已安装任务目录。收到真实读取结果后，确认读到的正文。仅当当前第二行为 status=manual 时，复用该结果 editProposal 的协议、requestId、bindingId、workspaceId、path 和 baseSha256，只修改 content，返回一个 opendesk-edit。完整新正文须为两行：第一行 OpenDesk local file test，第二行 status=auto，并保留末尾换行。若基线不同先停止。使用 JSON 字符串正确转义换行。不要输出命令、diff 或其他文件修改；写盘必须等我在可信扩展页审阅并确认。
```

## 重复、未知与重连恢复

- 服务在写入前将稳定写入 ID 及目标 SHA 记入 `chrome.storage.local` 的 `opendesk.chatgpt.files.writes.v1`。已登记 ID 不重放；同目录同路径存在 `dispatching` / `unknown` 时，也不能换 ID 绕过。持久围栏与内存 UI 状态不同，不因重连自动解除。
- 写入结果未知时，不再次确认、不自动重试、不删除账本。保持或恢复可信绑定，选择同一授权目录、同一路径，用「只读核对未知写入」执行 `reconcile`。重连可以重新取得当前读取权限，但不能复活旧写入提案；目录撤权、身份或来源改变时仍拒绝。
- 若可信文档会话已丢失，需从同一原对话重新打开并领取新 claim，再为同一目录/路径准备范围后只读对账；仅刷新连接不能恢复已失效的文档绑定。
- 读回 SHA 匹配只证明**当前字节匹配目标**，不证明原写入回执已收到、也不证明由本轮写入造成。恢复结果保留 `unknown` 与 `writeReceiptObserved:false` 的区别；不匹配仍未知，继续禁止盲目重放。
- composer 每包只填一次；填入中断或回执未知时检查原草稿和用户消息，不重复插入。此保护不等同于跨文档持久写入账本，也不表示自动发送。

## 保护测试及边界

105 项定向 Node 测试覆盖精确路径锁定、绝对/越界路径拒绝、模型改路径/操作拒绝、SHA 冲突、权限和租约变化、稳定 ID 并发防重、写入未知只读对账、Native 重连后重新取得读取权限、服务重启后的持久未知围栏、回填未知不重放、来源文档退休及开发安全重载围栏。它们是源码/组件证据，不是对真实浏览器注入上述故障的证明。

命令：

```sh
node --test tests/browser/chatgpt-files.test.mjs tests/browser/chatgpt-files-ui.test.mjs tests/browser/chatgpt-file-intent.test.mjs tests/environment/file-workspace.test.mjs tests/environment/workspace-chat-request.test.mjs tests/environment/workspace-chat-edit.test.mjs
node --test --test-name-pattern='fixed transport registers' tests/environment/native-agent-package.test.mjs
```

未运行根全量测试。此前完整 native-agent-package 文件中的品牌标签断言与并行品牌改动不一致，未据此修改无关产品或宣称整组通过。当前相关生成脚本通过已有 `inspectScript` 静态检查；没有执行全量构建。

Native 当前回执缓存不能当作跨重启持久查询接口，因而恢复仅读回，不能以相同 ID 再发 write 来“查询”。持久写入账本上限 128，不自动清除未知记录。页面绑定限同一原对话文档、30 分钟；换文档需重新领取。文件引擎的乐观 SHA 检查也不承诺与所有非合作外部程序之间绝对原子 CAS。
