# WebCodex 当前对话编辑 Demo R2

## 当前交付：结构化请求与 R17.1 临时读写（2026-10-10）

**状态：IMPLEMENTED / TARGETED_COMPONENTS_PASS / PRODUCTION_PACKAGE_PASS / MAC_NATIVE_CHATGPT_NOT_TESTED。** 工作流 `webcodex-request-loop-c56fd6b623a0`。Browser 源码提交 `c41102d7e2dd13510f718f69061f8194251eb767` 已进入 `main`；Go 源码提交 `34649d24ee821298f586abba257e9e41b89a4cec` 已进入 `master`。均由带 expected HEAD 的非强制更新提交并取回核对；没有创建分支或 worktree。

初始 Browser `681d459290f5df23d64e70a9e1743818f7cfea4a`，Go `f9e4bbfd6afc6c0cec00f145a6183ca2eea40b89`。Browser 保留并集成至 `e6807e9ac4b5068ababae8dfdb16759f6ce1d7ca` 的其他 Sidebar/TOC/Task/库工作；Go 保留并集成至 `3feba12b86f19bd7543fb1353b9f5f8b057ffd50` 的决策文档。唯一工作目录 `/workspace/scratch/c56fd6b623a0/`；Browser 由 root 写入，Go 实现由 go_access 写入后交回 root 整合文档，两位独立 reviewer 只读。未修改其他会话的目录、进程、Profile 或产物。

### 复用、修复与新增

| 类别 | 本轮结果 |
| --- | --- |
| 已有且复用 | 同一 Native Port、Go files 服务/路径与预算、CLI Provider/Resolver/Session、Workspace/编辑预览、五字段 R2 手工提案、source-label 与 Sidebar 映射 |
| 已有但修复 | 新目录仅 RO；CLI 初始化断连后仍可能继续；权限往返恢复旧代次；无 CLI 空代次保存竞态；A 离线后自动选 B；侧栏依赖全局选择；旧回答/Regenerate/迟到返回与采用后保存身份失效 |
| 确实新增 | 严格 request.v1 的 list/read、同一完整模型回答识别、结果身份、真实 editor 操作与二次独立读回、七字段编辑提案、请求/Native/回填/发送分阶段状态、明确丢弃草稿并重读 |

新 CLI 默认对精确参数目录/cwd 申请本次 owner 生命周期 RW，无须 workspace add；显式 --read-only、长期 RO 和模式冲突均由 Go 实际权限约束。旧客户端省略 access 仍按旧新目录 RO；新旧组件先协商 localDevAccessVersion:1，文件状态提供 devLeaseEpoch:1。临时授权只在内存，已有私有 grant store 的 devLeaseFences 仅保存有界失效元数据，不能重建权限。权限显式变化后，原 owner 必须退出并重新接入；重复启动不能复活旧请求。

结构化文本闭环不是 MCP 注册：扩展在可信入口读取当前绑定对话完整唯一回答，经真实 Native file service 执行，再以 execCommand 插入空输入框并独立读回；**用户仍检查并通过网页发送**。同一 tab/conversation/document、用户轮次/完整答案、workspace/source/Native session/CLI epoch/读取 SHA 均持续核对。普通网页与 preview 无 files RPC。采用和保存前再次校验；生成提案、采用草稿不写盘，显式保存后必须 Native 再读回。

### 本轮验证与证据等级

原始日志、构建输入/包 hash 与固定源码见 [证据索引](evidence/webcodex-request-loop-20261010/README.md)、[机器交付索引](evidence/webcodex-request-loop-20261010/delivery.json)。

| 验证 | 本轮结果 | 边界 |
| --- | --- | --- |
| Browser 六文件定向 | PASS，84/84 | CLI、连接显示、file service、提案、请求/回填与实际 Workspace controller fixture；不是 Chrome 或 Native GUI |
| Native access capability 兼容 | PASS，1 顶层及 4 子项，共 5 | 旧/未知 hello 不额外发送新 welcome 字段，版本 1 正确回显 |
| R17.1 最终 CLI 帮助/权限/生命周期 | PASS | 显示版本变更后重跑该文件；其他未变功能结果按输入复用 |
| Go 相关 race | PASS，29 顶层 + 7 权限 + 4 权限往返子项 | 真实临时文件、两轮 SHA/独立读回、真实两个 CLI 子进程；非用户 Mac |
| Go 真实 Socket | FAIL，环境阻断 | AF_UNIX 创建 EPERM，Host 在 hello 前退出；原测试不跳过，必须本地 Mac 重跑 |
| Source check | PASS，310 个 JS/MJS/CJS 输入 | 原固定入口、CSP、MIT 校验保留 |
| npm R17.1 tarball | PASS | 真实 tarball 在源码树外临时 prefix 全局安装、登记、加载完整依赖，未发布 npm、未更新用户安装 |
| WXT production / package / ZIP | PASS | packageHash `9dc5bfec69e41408f984e02a1eb180c7b5c252e6deebb4f909935732967f02dc`；SW 324.35 kB 仍低于 327680 bytes；没有放宽预算 |
| 真实 Mac executable / manifest / npm / Chrome 加载 | NOT_TESTED | 当前 Linux 网页执行器，不是用户 Mac |
| P0 未知随机标记 / 同一对话回传 / 两轮修改 | NOT_TESTED | 没有指定的真实 Mac ChatGPT tab、网页模型后续回答和独立真机磁盘证据 |

保留失败：初版 40 项中两个旧预期/异步断言失败；集成运行 84 项中一个 fixture 观察等待不足（应用行为未改，观察改为有界状态等待）后 84/84；权限 ABA 四项在修复前真实写成功，修复后四项及跨进程往返通过；一次误用不存在的 `npm run check:source` 记为命令错误，正确 `npm run check` 通过。重新构建遇到本任务旧 build lock 的 PID 被 sync_share 进程复用；先确认旧构建已成功完成、无原 owner 且取得原独占输出 guard，仅归档自己的锁，不停止任何进程，随后构建通过。

### 本次源码 CI 的后续核对

Browser 源码 `c41102d7…` 的 8 个 push workflows 均 success；[R17 #38060603288](https://github.com/shopable-ai/opendesk-browser/actions/runs/38060603288) 在 Ubuntu/macOS 完成相关测试、真实 tarball 安装及构建。[Native #38060603287](https://github.com/shopable-ai/opendesk-browser/actions/runs/38060603287) 包含 macOS Intel/arm64 的真实 Chrome Options/握手诊断与完整环境组件，仍不是指定 ChatGPT 对话或用户 Profile。

Go 源码 `34649d24…` 的 [Native #38060523393](https://github.com/shopable-ai/opendesk/actions/runs/38060523393) Ubuntu/macOS transport 已通过完整相关包（含真实 Socket），macOS executable 对模拟 Chrome smoke 也通过。该 executable CI 使用既有跳过签名的测试构建和历史 Browser fixture，不是用户正式安装。Go 另两个 API docs contract/Windows Core workflow 的失败在父提交也存在，原始差异分类记录在 Go 证据中；不把它们隐藏成全部 CI PASS。

### 最后 main 集成与候选区分

源码交付后保留并安全集成另一任务的 `871c2e4bb6b3a7e237201372e7c2e803a707f642`。本轮 18 个实现/测试/CLI 文件逐个 hash 未变；新版构建合同下重新 production、pack 与 source check 通过。当前集成包 `7f0350d38eb9d2e7519dae2c5ec151d844b4f999425b28c2aafdee66ef4c27ed`，SW 319248/327680 bytes，source check 313 输入；减重归原容量任务。原源码提交包 `9dc5bfec…` 的证据照旧保留。[机器索引](evidence/webcodex-request-loop-20261010/delivery.json) 区分源码包与整合包，当前集成候选另四个广域 CI 失败单独记录，不能声称全部 main CI 通过。Mac/P0/两轮状态不变。

四项 CI 失败已保留精确分类：R16.1 与 Controller/R13 均在功能标记成功后的 Chrome Profile 删除阶段 `ENOTEMPTY`；R3.1 的 `USER_SCRIPT E_EFFECT_UNKNOWN` 在本轮前 `e6807e9…` 已出现；TOC 在 tool shell 挂载前 `ERR_FILE_NOT_FOUND`，测试扩展 ID 未核验是合理疑因但根因未确认。相关测试没有进入本轮 Workspace/ChatGPT 文件闭环；不以此声称全部是旧失败，也不扩大修改其他任务。关键原始日志及源码对应关系见 [集成 CI 分类](evidence/webcodex-request-loop-20261010/README.md#集成候选的四项失败)。

### 真机续接与资源

执行 [固定到本次源码的完整 Mac 任务](../prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md) 与 [R17 入口任务](../prompts/goal-r17-local-macos-acceptance.zh-CN.md)。优先随机标记 P0，再完成同一对话两轮、同名 A/B、真实只读/越界/旧代次后端拒绝、外部编辑、导航/刷新/已有草稿、撤权/退出和迟到结果。每项单独 PASS/FAIL/NOT_TESTED，不从本地组件推导整体完成。

本轮测试/构建子进程均已退出，没有启动或接管用户 Chrome、Native 安装或 CLI owner。临时 npm smoke prefix 已自行清理，其他目录和长期授权未访问。保留本任务产物与旧失败证据。下面开始的记录为**先前 R2 候选的历史快照**，其默认只读、安装状态或旧 SHA 不表示当前实现。

## 历史：原 WebCodex R2 提案模式与 macOS 续接

状态：IMPLEMENTED / COMPONENTS_PASS / PRODUCTION_BUILD_PASS / MAC_NATIVE_CHATGPT_NOT_TESTED。日期：2026-10-10。写入负责人：本对话 root；三位子任务仅只读研究、审计。用户已明确当前系统为 macOS，已有 OpenDesk Go；本轮优先完成 Mac，其他平台后续处理。此状态不是正式 Native、F3 或 ZIP 安装验收关闭。

## 范围与资源

用户要求找回 Native Messaging / ChatGPT 网页读写本地文件的历史工作，确认可行性并直接推进 Demo。延续 R1 文件工作区，在现有 `native-agent/workspace.html` 增加单文件上下文导出、用户触发的 ChatGPT 回答读取、结构化提案预览、采用草稿和保存回执。此模式不是官方模型 MCP 工具注册。

- Browser 主分支：`main`；本轮目录 `/workspace/scratch/b6798df15a04/opendesk-browser`；基线 `646f02798a95d642f5d5b22af4d37d0025661166`。
- 不创建分支或 worktree；仅 root 写入当前目录，其他对话目录只读。
- OpenDesk `master` 只读，初始核查 `c82850a8`，最终远端复核 `5f09dc9d`；不接管其他对话正在做的 CLI / Dev / R16。
- 测试和构建仅使用本轮目录、专属 `docs/framework/evidence/webcodex-chat-edit-r2/`、新建临时 profile/端口；不接管旧进程或旧证据。
- resources.released: true；本轮没有启动真实 Chrome 或接管其他会话进程，构建子进程均已退出。

## 证据复用与必要验证

已读 `AGENTS.md`、`testing-guide.md`、`parallel-development.md`、`workstreams/webcodex-workspace-r1.md`。最新用户及 AGENTS 的主分支规则优先于历史默认分支说明。

R1 的 Native 文件协议、可信 workspace 顶层入口、Go SHA 保存与未知效果语义不变；既有组件记录作为原版本证据保留。R2 修改 workspace UI，新增回答文本适配，属于 AFFECTED_INPUTS；补上下文/提案绑定、多个 assistant 块、SPA URL、流式回复、重复导入、草稿保护和显式保存 UI 定向验证。重新生成同源内存 Demo、校验受影响构建。Native/MCP/Windows 实机不从内存或 DOM fixture 推导 PASS。

## 已确认的配套边界

`opendesk browser dev` 不是文件 Demo 前提；已有 `browser workspace add --path … --access read-write` 授权目录，文件协议为 `opendesk.local-files.v1`。本轮不扩大 `project.resolve`、R16 planner 或页面 SDK 的权限。

用户当前使用 macOS 和已有 Go 安装，直接复用既有 Native Host。先核对实际 executable、扩展加载包与 `localFilesVersion:1`；只有能力缺失或安装路径不匹配时才更新。Windows 的先前只读调查保存在旧证据中，当前任务不以平台移植为前置。

## macOS 续接（2026-10-10）

R2 已通过远端提交 `79c0cabd72accc959ae4ffeb6b09c60a39daf0be` 写入 `main`。本次从同一主分支继续，没有创建分支或 worktree。

- `IMPLEMENTED`：工作区只读目录已显示就地编辑授权命令，提醒刷新后选择正式读写工作区；架构说明和本地 Codex 任务已改为 macOS + 已有 Go 的直接运行方式。
- 当前核心提案、读取和保存实现与上一构建候选一致；此次产品变化限于 `workspace.html/css/js` 的权限提示和生成后的同源 Demo。
- 验证范围：工作区 DOM 的提示显示/隐藏与现有保存闭环、同源 Demo 生成、生产构建与包校验。未变的提案解析/Native 协议组件结果复用原记录；不重跑其他工作流。
- 资源：仅本轮仓库输出、`docs/framework/evidence/webcodex-chat-edit-r2/macos-followup/`；不启动 Chrome、Go Host 或接管用户 Mac。生产构建期间独占已有构建锁；真实 Mac 验收仍交由本地 Codex。

续接验证与原始记录见 [macOS 优先续接证据](evidence/webcodex-chat-edit-r2/macos-followup/README.md) 和 [机器摘要](evidence/webcodex-chat-edit-r2/macos-followup/verification.json)。

- 实际 workspace DOM 模型验证：只读提示和禁用编辑、离线隐藏提示、读写目录恢复编辑；保留 R17 目录/草稿验证。
- 原保存闭环与生成后的独立 bundle 均通过：审阅/采用零写入，保存并读回，外部冲突不覆盖。
- 源码检查 278 个文件通过，文档相对链接和 6 段 Bash 语法检查通过。
- 新生产构建、包校验和确定性打包通过；199 个记录输入与当前文件一致，构建输入漂移为空。Development 保留原 R2 产物，没有宣称按此次源码重建。
- Production packageHash：`ac9ec9e0b9e76b94d17bb2ac91ff7b6734509977b754d56312222bc20086366b`。
- 新生产 ZIP SHA-256：`e8a6eadb6caa2fbf94a1cf89f740d8ac29db18393e19af1f7bc515a1c85d4f28`；实际安装仍为 `NOT_TESTED`。
- 原 63 项协议/提案组件通过记录按未变输入复用，此次没有为文档和提示改动重跑整套组件或其他工作流。
- 提交期间正常合入并行 `00a9e38a`：仅新增固定入口构建审计脚本/测试/CI/说明，与本轮文件无重叠、未改变扩展或构建器输入代码；现有生产包通过新审计器对 15 个真实入口文件的大小、hash 和模块图核对。结果见 `macos-followup/fixed-entry-audit.json`，保留原构建身份。

## 实施与并行集成

- R2 实现本地提交 `e9cba891`；两轮 R17 相关集成分别为 `fb1d7d92`、`28cd671e`。
- `9aa80683` 修复 sourceId 导航：指定来源缺失时不加载历史或默认的其他项目，首次解析或用户明确选择后消费导航意图，刷新不再覆盖选择。
- R17 的离线草稿、目录历史、实时工作区身份、files.changed、多来源握手均保留；R2 只使用已连接且当前选择匹配的实时工作区，不把缓存作为授权。无效目录列表关闭实时访问；异步文件基线读取核对刷新代次。
- 内存 Demo 改用符合协议的 opaque workspace ID，解决 R17 严格列表校验后的初始化回归。
- 后续同步 `9df81513` 时，另一任务也修复了同一 Demo ID 问题。合并采用本轮已验证的统一 opaque ID 数据方案，保留严格列表验证和异常列表关闭访问；没有引入另一套宽松 Demo 列表规则。最终相关扩展源码仍与 `9aa80683` 一致。
- Go `5f09dc9d` 已提供 Dev 临时只读工作区与 sourceId 关联。已有正式目录可复用原读写权限；R2 不依赖整个 Dev 命令收尾。
- `f0927430` 只合入另一任务的 Node Dev CLI、npm 包和独立打包脚本；与 `9aa80683` 相比，扩展源码、manifest、依赖、WXT 配置、相关构建/校验/演示生成输入无变化，复用原构建，不声称在新提交重建。

## 实际验证

原始记录与哈希索引见 [专属证据](evidence/webcodex-chat-edit-r2/README.md) 和 [机器摘要](evidence/webcodex-chat-edit-r2/verification.json)。

| 层级 | 结果与边界 |
| --- | --- |
| 定向组件 | 同一执行的三个测试文件共 63 PASS / 0 FAIL / 0 SKIP；包含 18 个 R2 测试，其他为原文件/Native bridge 回归 |
| 完整工作区 DOM 模型 | 正式 HTML/UI + 内存后端：生成/审阅零写入，采用零写入，显式保存一次并读回，外部冲突保留磁盘与草稿 |
| R17 集成 DOM 模型 | 离线保留草稿、目录消失不替代、异常目录清空权限、排队刷新拒绝旧基线、sourceId 导航与手选保持 |
| 同源独立 Demo | 生成后的实际 bundle 在 DOM 模型中完成上下文、提案、采用、保存和 memory-only 回执；未进行 Chrome 渲染验收 |
| 源码/合同检查 | `9aa80683` 候选检查 276 个 source/test/build 文件，语法、固定入口、严格 CSP 与许可检查通过 |
| Production / Development | `release-builds` 两份回执均 passed，构建期间输入漂移为空 |
| 独立产物复核 | 双包各 15 个相关源输入与 settings.js 哈希一致；生产注入函数只有 location/document/globalThis 自由引用，可独立序列化 |
| ZIP | 正式生产包校验及确定性打包通过，安装验收 NOT_TESTED |
| 真实 Chrome / ChatGPT / Native | NOT_TESTED；当前环境 Unix Socket 探测 EPERM，未用模拟结果冒充真实页面或本机写盘 |
| Windows | NOT_IMPLEMENTED / NOT_TESTED；当前 Go 平台仍返回 E_PLATFORM |

构建候选（本地历史）：`9aa806835d6e1f6a0b02695f6ca2d82d575b8ee5`。首次无相关输入变化的集成提交：`f0927430d51583e9f365d5307393c54291f7b9b0`。

- Production packageHash：`2bf5c042a382775ba195a2be953ea3a14e8c0822da2b72222e73e3a9425052db`。
- Development packageHash：`41390858a85603a9eaedb95c2104a1ee71c35d510ba86d0debda2d152c4b15d4`。
- 生产 ZIP SHA-256：`ee926ef393bf71654100e62d450775f7b71c60823d65d6f02d8317aff57c5671`。

## 环境失败与传输说明

构建过程中保留了 PID 重用导致的旧锁拒绝记录。仅在确认本轮原构建已退出、锁 token/root 一致、该 PID 已变为环境同步进程、成功独占取得原输出端口后，清理本轮残留锁；没有停止其他进程或修改保护代码。最终双构建通过同一个监督进程依次调用原构建脚本完成，失败记录未覆盖。

普通 Git HTTPS 推送因缺少终端凭据失败；使用已连接 GitHub 接口提交相同文件树，以最新 main 为父提交并执行带 expected_sha 的非强制更新。远端提交身份以实际接口回读为准；上述本地提交用于构建追溯，不能假称它们具有相同远端 SHA。

## 剩余本机工作

按 [macOS 实际验收与修复任务](../prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md) 在用户真实 Mac 上复用现有 Go，验证同一网页对话的读取、审阅、保存和独立磁盘读回。先授予专用演示目录正式 `read-write`，不要把 Dev 临时只读来源当成写权限；授权后按实际返回的工作区 ID 选择目录。

正式模型工具接入仍是后续 MCP adapter 工作；当前文本提案模式不依赖它，R2 没有注册模型工具或自动发送消息。先完成当前 Mac 的真实闭环，再评估更自动化的文本循环、多文件编辑和其他平台。
