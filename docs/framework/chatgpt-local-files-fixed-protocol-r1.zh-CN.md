# ChatGPT 本地文件固定协议 R1 · 实现、实测与手动操作

更新：2026-11-04。本文记录当前 Browser 实现、持续开发环境的真实读写证据及手动步骤。本轮复用现有 Native 文件引擎，不修改 Native 仓库；未进行 production 发布验收。

## 本轮目标与关键测试条件

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

## 当前实现

- 真实可信入口是 `native-agent/settings.html#chatgpt-files`。`src/entrypoints/settings.js` 以 `?raw` 导入固定 `chatgpt-files.html` 模板并挂载 `chatgpt-files-root`；后者不是独立输出页面，不应直接打开其 URL。
- 原 ChatGPT 对话的第一方入口仅打开可信扩展页。扩展页先发送 `opendesk.chatgpt.file-intent.v1` / `claim`，再用 `opendesk.chatgpt.files.v1` 调用 `state`、`prepare`、`poll`、`pause`、`inspect`、`approve`、`reconcile`、`fill`、`observe`。服务回复 `{ok:true,data:snapshot}` 或 `{ok:false,error:{code,message}}`。
- UI 复用 `design-tokens.css`、`native-agent/settings.css`，不引入 React 或依赖。操作由原生 `isTrusted` 事件触发；来源绑定不由网页或模型选择，目录不自动选择，网页文件名提示不构成授权。
- `prepare` 明确批准所选 workspace、精确相对路径及 `read` / `list` 操作，只向原始对话披露；此时尚未读取。`inspect` 核验原对话完整回答、轮次与身份，执行已批准的读取/列表，或暂存编辑提案。模型不能借回答改变批准路径、操作或目录。
- 本页明确批准范围后，约每 2.5 秒从可信页调用（后台页可能受浏览器限流） `poll`：忽略准备前轮次与生成中的回答；按请求身份、轮次和回答版本去重。成功读取后自动填入原对话草稿，用户发送真实结果后才处理后续编辑回答。提案出现时停止轮询，绝不自动批准。更改目录、路径、操作、任务或撤回勾选会 `pause`；关闭本页会终止轮询。流式过渡只在尚未消费读取身份时继续等待；读取已消费后回答变化则暂停，禁止重复读取。
- `approve` 必须携带用户当前看到的不可变 `reviewId`，不能确认被替换的提案；`fill` 必须携带精确 `packetId`，不能把旧操作作用于新结果。
- `approve` 只在审阅原文、完整新文及 `baseSha256` 后显式写入，并核验真实写入回执与独立读回。正文以只读文本展示，不执行其中内容。Shell、删除、改名及任意绝对路径不属于本协议。
- 原有 Native `files.list/read/write/create`、目录授权和租约继续由原文件服务负责；此网页入口只开放已批准的读取/列表与具体修改，不把 Native 的 create 能力等同于网页已经获得创建权限。
- 发往网页的协议 JSON 使用单行编码，避免官方段落编辑器对行首缩进的归一化；字符串内的文件空格、换行仍保留 JSON 数据含义。原生编辑命令后的临时 DOM 不算回填成功，必须再执行一次独立读取核验。比较保留原有单个尾换行容差；失败仍标未知，不重新插入。

## 已知测试现场与证据等级

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
- 实测加载 ID：`ccfcjegpkdlgbclopjmadlcjedelidmf`，日常路径 `dist/development`；首次实测复用 PID 33071 的 dev watcher。追加自动功能时重查该服务已退出，按原协议恢复 `npm run dev`，输出仍为 `dist/development`；未重装扩展或停止并行服务。期间 dev 曾因默认 4 GiB Node 堆耗尽退出；已以仅本进程 `NODE_OPTIONS=--max-old-space-size=8192 npm run dev` 恢复，当前 PID 19312、serve 端口 43119，最后观察产物指纹 `cb1290698ecea502f0c4d5052f4cfc8e2d68a6228c6a6899014c3f66aece5d3a`。Native doctor 的真实响应确认配对 ID 及 nativeConnected。源码收尾时 Browser 为 `main@43203cbd2018`、Native 为 `master@909effdc2e1c`，均保留并行未提交修改，本轮未提交/推送。

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

这些请求身份已消费，不可重放。本次没有点击「读取完整回答并处理请求」或「填入结果草稿」，自动处理由可信页轮询触发。真实路径越权、SHA 冲突、重复 mutation 和断线注入仍未做浏览器故障测试；对应源码保护测试通过。当前现场文件为 `status=auto`，下文手测按此基线给出。完整本机证据保存在 `artifacts/chatgpt-files-20261103-01a1a1b4/automatic-source-evidence.json`，包含对应源码和三个开发产物的 SHA；三个产物均重新通过现有 `inspectScript` 静态检查。

## 可复现的手动步骤

1. Native 目录授权通过 CLI 建立，无需先进入 Workspace 页面。本现场已获授权，不为重复验证重新授权；新现场使用实际隔离目录：

   ```sh
   opendesk browser workspace add --path /Users/shopme/Documents/workspace/opendesk-browser/artifacts/chatgpt-files-20261103-01a1a1b4/workspace --access read-write
   ```

2. 在上述原 ChatGPT 对话点击「通过 OpenDesk 处理本地文件」→「审阅当前对话的文件请求」。可信页核对来源 URL 与 Native 连接。当前现场已完成此步；直接从下一步继续，不通过直接导航绕过一次性 claim。
3. 手动选择上述 workspaceId 对应目录，路径填写 `demo.txt`，操作选读取，任务填写下方可复制文本。核对披露说明并勾选，再点「批准本次读取并准备提示词」。
4. 使用 UI **实际生成的完整提示词**，点「填入原对话草稿」，切回原对话核对，然后由用户点击发送。不要自行生成 `requestId`、`bindingId` 或 SHA，不使用本文中的占位 JSON 代替 UI 生成包。
5. 保持可信页打开，等待模型完整回答。无需点「读取完整回答并处理请求」：自动轮询会核验并处理。该按钮保留作手动诊断。预期回答是单个 `opendesk-request` 代码块，协议为 `opendesk.workspace.request.v1`，原样保持 UI 的 `requestId`、`bindingId`、`workspaceId`、`operation`、`path`。检查真实结果和状态；出现错误停止该步骤，不把提示词已生成当作文件已读取。
6. 读取成功后，结果自动填入原对话草稿，回原对话核对并手动发送。自动检查会观察结果标记，也可点「发送后检查结果标记」。结果协议为 `opendesk.workspace.result.v1`；只有原对话用户消息中观察到本轮真实 `resultId`，才记为结果已回到该对话。草稿 filled 本身不证明已收到。
7. 模型收到真实正文后，应仅返回一个 `opendesk-edit` 代码块，协议为 `opendesk.workspace.edit.v1`。它必须复用读取结果内 `editProposal` 的全部身份及 `baseSha256`，只把 `content` 改为完整目标正文。编辑请求 ID 使用真实 `editProposal.requestId`，不要误用读取请求 ID 或编造新 ID。
8. 模型回答完整后，可信页自动展示提案并暂停自动处理。核对提案路径、写入前后状态、完整正文和 SHA，再点「确认写入此文件」。首次实测为 before → after，自动流程实测为 after → auto；下方可复制任务供当前 auto 文件再手测一次。仅提案出现不算写盘成功；需真实回执及独立读回证据。确认后真实写入结果会自动填入原对话草稿，手动发送并检查结果标记。
9. 单独验证 `list` 时，从 UI 准备新轮次，明确选择目标相对目录并批准 `list`；使用该轮 UI 生成身份完成请求与结果往返。列表不是编辑依据，也不授权递归读取或其他路径。协议用空字符串表示根目录；不要用 `.` 或伪造请求绕过当前 UI 的路径校验。

可先复制到 ChatGPT 的开场提示词：

```text
请通过 OpenDesk 的专用文件请求入口读取我明确授权目录内的 demo.txt。这是文件固定协议文本往返，不是调用 Web Flow 已安装的浏览器任务。先等我从可信扩展页发送带本轮真实身份的完整规则，再只返回一个 opendesk-request，不猜测文件正文或 SHA。收到真实读取结果后，若第二行为 status=auto，请复用 editProposal 的身份和原 SHA，提出仅把该行改成 status=manual 的完整文件提案，保留其余字节及末尾换行。写入等我在可信页确认；仅根据真实 saved 和读回核验回执报告成功。不使用 Shell、MCP Tunnel 或扩大目录范围。
```

这段开场文字不是授权或可执行请求。点击网页「通过 OpenDesk 处理本地文件」进入可信页，选择 Native 已授权目录、精确路径与读取操作，勾选本轮自动读取及披露范围；再把生成的完整提示词填入原对话并发送。真实 requestId/bindingId/SHA 均由扩展提供，不手工编造。

可复制到 UI「任务」字段的文本（身份仍由 UI 生成）：

```text
请先按这条 UI 提示词提供的固定协议，只返回一个 opendesk-request，原样保留它的全部身份、read 操作和 demo.txt 路径。收到我手动发送的真实 OpenDesk 文件结果前，不要猜测正文，也不要声称已经读写文件。
这是专用文件协议，不依赖 Web Flow 已安装任务目录。收到真实读取结果后，确认读到的正文。仅当当前第二行为 status=auto 时，复用该结果 editProposal 的协议、requestId、bindingId、workspaceId、path 和 baseSha256，只修改 content，返回一个 opendesk-edit。完整新正文须为两行：第一行 OpenDesk local file test，第二行 status=manual，并保留末尾换行。若基线不同先停止。使用 JSON 字符串正确转义换行。不要输出命令、diff 或其他文件修改；写盘必须等我在可信扩展页审阅并确认。
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
