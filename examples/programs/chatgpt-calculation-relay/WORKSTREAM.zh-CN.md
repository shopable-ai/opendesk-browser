# AI 双对话计算接力 R1.1 · 最小真实闭环

## 2026-10-26 当前结果：核心闭环完成

owner `01a17895-c63b-7af3-9e2f-4d8053a0c22d`，`main`，本轮核心工作 `COMPLETE`。已用原 MCP/RunHost 分别通过一次普通 Controller Run 完成真实官网 `17+25 → 42 → 不同新对话 42×3 → 126` 和 `19+25 → 44 → 不同新对话 44×3 → 132`。两个 Run 均 `completed/released`，结果另经独立 status Run 从可信存储读回并完整核对。原 unknown A 已在原文档对账，不重发 A，随后完成 B。开发核心链 `CHROME_PASS`，当前定向测试 37/37 `NODE_PASS`。

本轮仅写本项目 `src/site.js`、`src/relay.js`、`package.json`、两份定向测试、README 与本记录；承接原 owner 未提交修改，未提交/推送。本轮测试前草稿已恢复，175 个 Unicode 字符、178 个 JS code units 与备份逐字和 SHA256 一致，未发送。没有框架源码、模型路由、权限或 Native 配对改动；其他 owner、watcher 与浏览器资源保留。运行身份、原始消息与证据索引见本记录末尾最新结果。

当前是持续开发：实际扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载 `dist/development`，原生调试入口显示开发服务已连接，观察指纹 `0ef856a57de39b48432ac4ceff7060ac40347d92076f4bfd361213c0813a124c`。使用现有登录状态，没有重新导入 Cookie。仍使用 120 秒开发草稿 MCP 入口；正式 Task 安装、production、完整矩阵与评分 `NOT_TESTED`，不因核心完成自动进入这些阶段。本对话未创建 goal；其他历史对话 goal 状态未知。

## 历史记录（以下状态仅代表当时观察）

- owner：Codex `01a1733d-fbe2-79c3-803d-f09d3b890901`，仅在 `main` 修改独立项目 `examples/programs/chatgpt-calculation-relay/` 和本记录。
- 起始 HEAD：`47b31fb283e31ec8f7cb7ffbe1c2c446daa62109`；执行期间其他 owner 推进 main，隔离输入快照为 `e4bcd1f397d06dd3170ee2f499429e864a8594d0`。这些是源码观察，不是运行候选身份。
- 目标：一次真实 Controller Run 完成官方 ChatGPT 的 A（17+25）→可信保存读回→不同新对话 B（保存的 A×3），通过后再以 19+25 复验。不得用 Mock、写死结果或旧 Send Queue 同对话测试代替。

## 当前源码

`SOURCE_IMPLEMENTED`：公开零参数 ESM Controller；`page.observe/evaluate/goto` 站点适配；A/B 身份、完成与算术独立核验；公开 `AppStorage` 写前日志和读回；导航后重绑并动态传值；不确定时保留 `unknown`，同 runId 只读、未核清旧记录阻止新发送。没有新增 Host、Scheduler、Registry 或公共 SDK。

Node 定向测试调用实际业务模块、AppStorage facade、项目编译器及实际站点函数，真实 DOM 选择器修复后 24/24 `NODE_PASS`，零失败。覆盖 42→126、44→132、历史回复隔离、错误运行标识、流式未完、额外用户轮次、存储错误、跨文档读回失败、导航身份、React 编辑器替换、点击回执丢失不重发和全局时限。项目元数据及 JS 语法另行校验通过，均不代表官网执行。

边界：这是开发草稿；Task v1 正式安装的服务权限尚不足，不宣称正式安装可用。既有 Sidebar 本地项目 Run 固定 30 秒；本项目使用原 MCP `deadlineMs:120000`，内部共享预算并预留落账时间，不修改公共超时。

## 真实入口与资源

最初在日常 Chrome 新标签发现其他测试的非空草稿，未编辑或发送。目录 CLI 成功注册过本项目但未 Run；已退出自己的 CLI。一次原生项目选择误落到历史对话链接，未发送；该操作不算项目运行。

用户随后授权创建新浏览器并指定最新 `/Users/shopme/Documents/temp/chatgpt.com-cookies.json`。已使用技能启动器创建独占 CFT 155，PID `89266`，Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-_ufs1g7u`，导入 32 条同站 Cookie 后真实首页已登录、编辑器为空。未输出凭据、未复制个人 Profile、未改用户原文件。官网编辑器实际为 `form [contenteditable="true"][role="textbox"][data-composer-markdown]`，候选已补此选择器。

独占 Native 安装使用原安装器与 `OPENDESK_NATIVE_INSTANCE=relay-r11-01a1733d`；Chrome 用户脚本、Native 权限和开发者模式均通过真实设置控件批准。日常 Native 配对与其他 Profile 不改。首次 Native 授权需重载；此时并行 main 更新触发原 watcher `Unapproved WXT entry: chatgpt-fixed-bridge`，共享 `dist/development` 文件消失，导致独占实例入口 `ERR_FILE_NOT_FOUND`。该失败属于当前运行环境阻塞，尚未进入 A 发送。

不停止/覆盖 PID 36366 的原 watcher，不触碰 Send Queue owner、其 CFT PID 74622 或其他并行修改。仅对当前 main 创建非 Git worktree 的只读输入快照，以独立目录、输出与 guard 端口 43159 构建测试入口；缺失 snapshot 输入及依赖符号链接被构建来源校验拒绝时修正快照，不放宽校验。读取并行 owner 当时已修改的 `scripts/bundle-provenance.mjs` 到独立快照，SHA 与未提交来源详见 `snapshot.json`，未改其原文件；这不声称整个 main 已提交或可构建。

独立构建最终 `FAILED/BLOCKED`：`Trusted Reading TOC source changed; review and re-pin before fixed build: examples/sidebar-tools/reading-toc/trusted/locales.generated.js`。本轮不修改 Reading TOC、公共来源锁或放宽校验；没有可用的新扩展候选，不重复相同输入的构建。该失败是本轮真实 Run 入场的环境阻塞，不是 A/B 算术错误。MCP 临时进程已以 EOF 结束，未提交任何 Run；专用登录 CFT 与启动器保留，临时 Native 配对仅属于该 Profile，待入口恢复可继续，不宣称 Native handshake PASS。

本机忽略证据目录：`artifacts/chatgpt-relay-r11-01a1733d/`。源码与 Node 证据不能替代原 RunHost 的 sourceHash/runId/resultId，也不能替代实际官网用户/助手消息。

## 待完成的核心链

真实 A 发送 → A 完成且存储读回 → B 新对话 → B 动态发送 → B 结果保存，目前均 `NOT_TESTED`；原运行入口 `BLOCKED`。没有实际观察到 A=42 或 B=126，不宣称 `CHROME_PASS`。接力运行的 sourceHash/runId/resultId 均无；项目文件 SHA 不能替代它们。随后仍需第二轮 44→132。

下一条用户操作：原 owner 恢复可加载的当前扩展输出后，在已登录的独占空白首页，通过现有 MCP 的一次 120 秒 Run 发送 A；按第一个真实失败最小修复，未知发送仅只读对账。禁止恢复旧全面验收或再造运行入口。

完整安装矩阵、定时、DAG、UI 重构、跨模型、评分与压力测试均延期。本最小闭环通过后即结束当前阶段。

## 第二次 goal turn 的阻塞复核

上轮属于进展：实现并验证候选、取得真实独占登录状态，定位运行入口阻塞。本轮实读 main 仍为 `e4bcd1f397d06dd3170ee2f499429e864a8594d0`，`dist/development/manifest.json` 与 `sidepanel.html` 仍缺失；`ps` 确认原 watcher PID 36366 和本任务 CFT PID 89266 均存活。读取当前来源锁仍为旧 Reading TOC locale blob，未出现可重建的新输入。未重复构建/测试，未发送 A，未把观察超时当成 owner 已停止。相同运行入口阻塞连续两轮，goal 仍保持 active，尚未满足三轮 blocked 审计阈值；不恢复旧验收范围。

## 第三次 goal turn 的阻塞审计

2026-10-25 22:10 +08:00 实读最新 main 为 `9d4a082c205c94249d19bbde8f9e1fd11cd77b75`。共享入口两个文件仍缺失；原 watcher 与专用 CFT 均经进程查询确认存活。Reading TOC locale 期望 blob 仍为 `0484bd67fadb23a88c6a7164435d5bf90acd8295`，实际为 `ffdfc72c479bb16ef27e60eda26255b43870e4ae`。没有新的可用输出，也没有使独立构建可继续的相关输入变化，因此未因无关 main 更新重复构建。

同一运行入口阻塞已连续三轮；当前无法在保护并行 owner、原 watcher 与来源校验的前提下继续真实发送，按 goal 工具合同转为 `blocked`，不是完成或暂停。完整目标仍是两轮真实 A→B，不缩减为源码/Node 通过。无接力 runId/resultId/sourceHash，官网发送仍 `NOT_TESTED`。无凭据审计保存在 `artifacts/chatgpt-relay-r11-01a1733d/blocked-audit-3.json`；下次恢复时重新核对实际入口和专用 Profile，不能把当前进程观察当成未来保证。

## 2026-10-26 续跑：旧入口恢复，发送前仍需隔离目标

本轮 owner：Codex `01a17827-8824-7260-9f05-34db227cc54d`；状态 `WAITING`，等待确认测试草稿的可处置范围。仅更新本记录及忽略证据目录 `artifacts/chatgpt-relay-r11-resume-20261026/`，未改业务源码、公共框架、Native 安装或权限。起始 main 为 `9f35834e83527fa6d9445f06bcac40519f705d6c`；诊断期间并行提交推进至 `163ce268d3a42394cebb45d91b62e25ec321fddd`，不因无关 HEAD 变化重复验证。

已逐项对照原 `source-evidence.json`：接力源码、测试、package 和直接引用的 AppStorage facade、项目编译器、Worker runtime 与原记录一致。保留原 24/24 `NODE_PASS`，本轮未重跑测试或构建；这不是当前全部传递依赖及环境的重新执行证明。原记录中的扩展输出缺失已不再成立：`dist/development/manifest.json`、`sidepanel.html` 均恢复；日常 Chrome 原生调试页显示“开发服务已连接”，revision 为 `4a43efd6848fed5959e6362a0872d5fbbaacc0e96e137f4214a11ae7bb5318b1`。本轮处于持续开发，未冻结 production 候选。

日常 Chrome 的实际扩展 ID、Native doctor 的 extensionId 及 manifest allowed_origins 均为 `ccfcjegpkdlgbclopjmadlcjedelidmf`。原 MCP status 可连接并返回真实 Host/Document，本地项目准备为 ready；准备 sourceHash `6a393388e8c3406d9a6700bd9cbe29532489e44bb2a65d8377e3138674d95b36` 仅标识准备产物，尚无接力 Run/Result，不能充当执行证据。该只读 MCP 进程已通过 EOF 退出。

本轮新建普通 Chrome 标签页 `560068547`（“🧮 计算接力续跑”）的首页继承了 `PS-CORE-20261022-TEXT` 测试草稿；随后普通 Chrome 还观察到 `R4.2 原生验收` 追加草稿及界面变化。未编辑、清空或发送这些内容，不把新标签页等同于独占空白输入。浏览器扩展工具创建/读取后超时，改用原生界面确认实际状态，未将工具超时判为产品发送失败。已请求明确是否允许备份后临时清空本轮测试标签内的草稿并在结束后恢复；收到答复前不执行依赖该授权的发送。

原专用 CFT PID 89266 已退出。本轮检查旧 Profile 无占用后，以原模拟钥匙串、隔离 Profile 和 `dist/development` 参数恢复，PID 23731；未读取或复制 Cookie/个人登录数据。该实例的实际日志报 `ERR_MODULE_NOT_FOUND`：安装的 `local-project-source-contract.mjs` 引用缺失的 `native-agent-instances/src/scripting/user-scripts/page-frame-resources.js`；隔离 Native doctor 为 connected:false。未绕过安装器、修改来源锁或借用其他 CFT。原生应用绑定不足以确认这一个 Profile 的登录状态，因此其登录状态仍为 `NOT_TESTED`。只对已核验参数的本轮 PID 23731 发送正常 SIGTERM，启动进程已退出，旧 Profile 保留；其他 Chrome/CFT、日常 Native 配对及原 watcher 未停止。

证据索引：`artifacts/chatgpt-relay-r11-resume-20261026/resume-audit.json`、`chrome-launch.json`、`chrome.log`。本轮未提交 `opendesk.dev.run`，实际计算消息发送数为 0；A 发送、A 回复/存储读回、B 新对话、B 动态发送、B 结果保存与第二轮仍均为 `NOT_TESTED`，真实闭环 `BLOCKED`。下一步仅解决已登录空白目标的可用范围，再执行原项目的一次 120 秒 Run；不恢复全量验收，不重做未变化的业务实现。

## 2026-10-26 新对话交接前的最新观察（替代上节当前状态）

用户已批准备份、临时清空并最终恢复本轮草稿，也批准短暂独占“计算加法 JSON”测试窗口。用户最新要求创建新 Codex 对话继续核心功能，允许新建浏览器窗口；可先尝试未登录简单对话，需要登录时使用 Cookie-Editor 导入 `/Users/shopme/Documents/temp/chatgpt.com-cookies.json`。不得转成系统巡检或环境完善任务。

最新只读 HEAD `abfe0fcf9891df9e616eed33259b63bc72f08c3b`，main。已修改本项目 site/relay/package/两份测试和本记录，未提交；README 尚未同步新增参数。其他工作区修改归其他 owner。已修复官网清空编辑器残留换行被误判为草稿：只识别实际观察到的空段落与 ProseMirror trailingBreak，不 trim 真实空白草稿。业务模块另已添加发送后有界只读等待、显式 reconcile（只观察原未知步骤，不重发该步骤）及 inspect 诊断。它们尚未完成真实闭环，不能称为 Chrome PASS。

真实 A 已发送且官网原生 AX 看见用户消息与助手原文 `{"runId":"relay-20261026-r1-01a17827","step":"A","value":42}`。实际对话 `https://chatgpt.com/c/6adf5b99-9804-83ec-98f9-4ea758ab642c`，tab `560068547`，window `560068230`，document `426872B2AB11B140447C8D9679505100`；计算消息只发送过一次。原 Controller Run `2995ec58-2138-4a58-ac43-f87b5aa3d612` 点击后报 E_RELAY_SITE 并落账 unknown。后续只读/显式对账没有再次点击 A；reconcile Run `568bcca9-4220-47ec-94b0-0f520885975f` 在发送确认阶段超时。status 读回仍为 A unknown/clickIntent:true、B queued，A 数值尚未作为有效结果写入。

当前具体阻塞：实际站点适配器读到正确 URL、空编辑器，却读出 messages:[]；旧 author-role/role/article/conversation-turn/message-id 选择器均未找到消息。inspect Run `f0057bdf-bd4b-43bd-a039-b815a0a3d0ed` 返回 candidates:[]。最新源码已将只读诊断改成寻找包含本 runId 的文本节点及有限祖先属性，但这个最新版诊断还未真实执行。接手方下一动作是通过原 Page API 对本轮原消息执行这一条只读诊断、核对实际 DOM/执行文档，再只修本站点适配器；不得在尚未确认原用户消息时放宽身份或发送 B。

最近 Node 32/32 PASS 日志 `artifacts/chatgpt-relay-r11-resume-20261026/node-relay.log`；之后增加 inspect、两项测试和小范围源码调整，最新全体尚未重跑，不标最新 34 PASS。本次交接前 git diff --check 通过。未构建、未生产验收；A 结果读回、B、新输入 19+25 仍未通过真实验证。

草稿完整备份并读回于 `artifacts/chatgpt-relay-r11-resume-20261026/draft-backup.json`（175 个 Unicode 字符、178 个 JS code units，文件保留 SHA）；尚未恢复，必须由接手方在安全确认原标签编辑器无新草稿后恢复并逐字核对，不发送。原始 MCP 回执位于同目录 `mcp-transcript.jsonl`。会话 55385 的本轮 MCP 已以 EOF 正常退出（exit 0），没有保留可复用的活 session；旧 registrationId 不可复用，最新 status 的 hostRegistrations 为空。原 watcher/dist/development 与其他 Chrome/CFT 未停止。原专用 CFT 本轮启动进程已退出、Profile 保留。

旧 owner 在新对话确认创建后释放本项目文件与本轮浏览器操作，不再重复执行。本对话 goal 实读为 null；更早 owner 对话 goal 状态未知，创建新对话不代表目标已迁移、暂停或完成。交接只说明源码和部分真实证据，完整 A→B 核心仍为 FAILED/NOT_TESTED。

## 2026-10-26 接手后实测结果（当前权威状态）

本轮开始时 main HEAD 为 `abfe0fcf9891df9e616eed33259b63bc72f08c3b`。独立项目之外的并行改动未修改；没有创建分支、worktree 或 PR。

首条核心操作是对原 unknown A 的只读 inspect。旧 author-role 选择器确实漏掉当前官网消息；本轮实际文本节点诊断发现 `data-chatgpt-search-unit-key`、`data-chatgpt-search-message-ids`、用户 bubble、助手 markdown 和 `data-talvt-turn-state=complete`。站点适配已支持这些官网结构，合并新旧嵌套标记并去重；多个不同消息 ID、缺失内容节点或完成状态继续拒绝。只诊断真实消息，不以任意页面文本替代身份。原 A 的用户/助手 ID 与 documentId 保持不变，显式 reconcile 仅核验并落账原 A，随后正常发送 B。

| 运行 | A → B | Controller Run | Result ID | 结果 |
| --- | --- | --- | --- | --- |
| 原 unknown 对账 | 42 → 126 | 19173cbe-9598-43b0-a999-1b419cba5cf8 | 41f8673a-f220-47ae-9254-c4e2d8d1c13d | completed/released，未重发 A |
| 一次普通 Run，17+25 | 42 → 126 | ac15ceee-32d4-4b22-8ee7-a8258461f0d5 | bd299936-fe05-481b-b156-c9774222855d | completed/released |
| 一次普通 Run，19+25 | 44 → 132 | 06dd39e5-1ecd-4eea-bd50-b4ba7a448c93 | 98da8e69-922f-4371-86ff-e97fab18fdb9 | completed/released |

同一真实运行 sourceHash：`15f2a2e506962d258ec2c4b35c460f2cad09e98c8d76436fb470ada4437aea71`。它来自 RunHost 回执，不用仓库 HEAD 或文件 SHA 代替。三条独立 status Run 分别为 `29eedbc3-9742-46c7-ba54-75af65ea2743`、`cff05844-4bb3-482f-9afc-c07c602fed4a`、`e344848f-87c2-49f4-8f2c-9dbb71de36c3`；三组 A/B 记录和 handoff 与原结果完整一致。每组保留不同对话与文档、双方消息 ID、完成信号、原始 JSON、动态 B prompt 和可信存储 journalKey。

两轮普通 Run 的实际对话：

- 17+25：[A](https://chatgpt.com/c/6adf6354-7594-83ee-8523-b09d575f1b63) → [B](https://chatgpt.com/c/6adf636a-1ac8-83e8-9783-123434e4b410)。
- 19+25：[A](https://chatgpt.com/c/6adf63ca-5b24-83e8-85e9-81c106bdea1f) → [B](https://chatgpt.com/c/6adf63e5-cce8-83ee-9e22-0689a41534f3)。

37/37 Node 定向测试用于证明新旧 DOM 去重、歧义/未完成拒绝，以及现有存储、文档、发送令牌和 unknown 保护；实际官网闭环由上表单独证明。执行过项目语法、元数据和 diff 检查；没有全量构建、宿主回归或 production 验收。运行后只更新 README/工作记录及 package 的说明文本，运行源码 SHA 保持实测值；说明文字不改变已保存的历史 sourceHash。

草稿恢复：原生窗口焦点受并行测试切换影响，写入前已停止，改用同一 MCP 的公开 Page 入口锁定原 tab `560068547`。先核对原目标和空白编辑器，再恢复备份；首次数行插入被官网转成段落双换行，读回不匹配后没有发送或盲目重试。保存现场后，仅在文档、完整现有草稿与 HTML 都未变化时，将本轮已插入内容修正成同一段内的换行。独立只读 Run `a2e116ad-9d4a-4a01-ac73-f89ba00a3c06` 确认首页无消息，草稿逐字一致，SHA256 `e6753466a7aa4a03d06025b83a1611b2225899a4659768ee5effe6bfe61daf4a` 与备份一致。恢复脚本只在忽略证据目录，不进入业务源码，未调用发送。

本机证据目录 `artifacts/chatgpt-relay-r11-resume-20261026/`：

- `owner2-summary.json`：当前结果、完整运行身份、消息原文与证据 SHA 索引。
- `owner2-reconciled-original.json`、`owner2-once17.json`、`owner2-once19.json`：RunHost 原始结果及解码值。
- `owner2-status-original.json`、`owner2-status-once17.json`、`owner2-status-once19.json`：独立存储读回。
- `owner2-inspect-1.json` 至 `owner2-inspect-3.json`：实际官网 DOM 诊断与修复后消息读取。
- `owner2-draft-restored-verified.json`：恢复草稿的独立读回和校验；恢复过程失败与中间状态证据保留。
- `node-owner2.log`、`mcp-owner2-transcript.jsonl`、`mcp-restoration-transcript.jsonl`：定向测试及原始回执。

当前核心范围没有待执行的发送或恢复动作。正式安装/生产验收、全矩阵、定时/DAG、UI 重构、跨模型、评分与压力测试继续延期。
