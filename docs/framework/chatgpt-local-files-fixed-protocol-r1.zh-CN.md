# ChatGPT 本地文件固定协议 R1 · 实现、实测与手动操作

更新：2026-11-04。本文记录当前 Browser 实现、持续开发环境的真实读写证据及手动步骤。本轮复用现有 Native 文件引擎，不修改 Native 仓库；未进行 production 发布验收。

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
