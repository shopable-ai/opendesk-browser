# Subagent R2 · 本轮开发与验收证据

任务：`OD-SUBAGENT-CHAT-A2B2A-R2-TRUSTED-CLOSURE`。日期：2026-11-12 UTC。唯一分支：`main`。正式产品：Subagent，项目 ID：`opendesk.subagent`，源码候选：`0.2.0`。

**生产源码的可信请求、原审批、原执行和全文结果消费已经接线；真实 ChatGPT A→B→A 尚未验收。** 本轮没有创建真实 B、没有发送任务消息，也没有向 A 官方聊天发送。Browser 可读取标签元数据，不代表本候选已在 OpenDesk 安装或原生通道可用。

最终分层状态、构建身份与测试索引见 [status.json](status.json)，实际逐文件变化见 [source-inputs.json](source-inputs.json)，内部模拟审查见 [expert-audit.json](expert-audit.json)。本报告所在 Git 提交包含源码和证据；安装版本仍未知。不得用本报告的 Node 或构建结果代替真实 Chrome PASS。

**最终 Browser BUILD 与原 verifyPackage：PASS。** 44 个固定入口、131 个资源，801 项构建来源输入无漂移，packageHash 为 `0b49abaabba5aa5a3d79f591dd31f331d316788f1fa0e392765e5f4d7e99cca0`。tool-shell 实际为 2,954,732 B，低于原 3,145,728 B 硬上限 190,996 B；原软审阅提示保留。完整原始回执在 `build/browser-production.json`。Subagent Page 仍为 BUILT_UNVERIFIED，未正式安装。此前来源与体积问题已修复；当前唯一主要外部阻塞是官方本机通道 429。

提交前已保留并行 `ab7e2000` 的相同 pin、build helper export 和整项测试，同时保留本轮其他修改。合并后的来源边界定向 5/5 通过，随后重新运行原 production 构建；该步 attempt 为 `bc2541d3-78f0-4ffc-9991-52a005f24d4f`，输出 packageHash 与合并前相同。前次成功身份及三次失败分别保留，不能用前次回执冒充合并后的源码验证。

随后并行 `feeb7f0e` 提交了与本轮逐字节相同的 AI Proxy source-lock 和额外测试，已完整保留，定向1/1通过。锁文件改动现在由上游提交承载。本轮再次核对全部801项实际构建输入与最终PASS回执一致，仅测试文件增加，不重复运行无变化构建。详见 `upstream-source-lock-integration.json`。

随后 `main` 又推进至 `54f0e7e9`。完整保留其 Clipper 最终 UTF-8 换行计入150KB预算的修复、精确pin和测试，相关2/2通过；重新运行原构建绑定这些实际输入。最终交付 attempt 为 `da770127-1754-4d2b-baf8-d8f3c9159f73`，新packageHash见本页顶部。真实来源/权限边界没有放宽。详见 `upstream-clipper-integration.json`。

## 一、用户操作与最初的真实缺口

用户在 A 的 Subagent Mini Chat 输入“请介绍 WebFlow 的三个主要优势。”，点击创建，经原可信审批建立独立 ChatGPT B，准确填写并读回，只提交一次，等待真实完整回答，最后在 A 自有面板显示同一 B 的全文和链接。

开始时 UI 已存在，transport 有意禁用。已核对公开 Page SDK、原安装 `onUserScriptMessage`、Sidebar Task 委托、Page event ingress、Native ChatGPT adapter 和原 durable Result。内部可信函数不等于 Page 公开能力；原 Page SDK 确实缺少安装绑定的 Task 审批请求及只读结果接口。该通用缺口由框架 owner 在原安装、Authority、commandJournal 与 TaskWorkbench 中补齐，没有新 Runner、Controller、Ledger 或任务数据库。

## 二、T01～T05 的实际差量

| 任务 | 复用 | 本轮新增或修复 | 实际证据范围 |
| --- | --- | --- | --- |
| T01 可信触发 | 原安装 scope/hash/代次、native sender、执行 world/nonce、Task Authority、commandJournal、TaskWorkbench | 通用 `@opendesk/tasks` request/read/restore；固定 pin 声明和原安装审阅；实际来源核对；Subagent main/transport 生产接线 | Node 覆盖来源伪造、单请求与持久恢复；真实 trusted click 正向路径未测 |
| T02 独立 B | 原 WebFlow 0.2.0 owned Task、原 Controller 创建记录 | 原 prepare 支持 owned；原审批显示来源 A、独立目标并冻结参数 | 模拟证明不借用 A；没有真实 B |
| T03 仅发一次 | 原 preparation/admission、一次性 journal、原 Task fill/readback/click | Page 只存待审批意图，原保存核对和确认执行时再次核对来源及 Task 身份 | Node 覆盖重复、迟到、取消、撤权和 UNKNOWN；原生提交次数未测 |
| T04 完整回答 | 原 durable Run/Result、`verifyChatGPTTaskDurableResult`、WebFlow Result Adapter | Subagent 固定可信 reader 和 SW 注册，校验请求、B、消息、终态、释放及安装身份 | 使用完整 `replyText`，未使用 500 字 `replyPreview`，未新增 DOM 采集器；真实回复未测 |
| T05 A 内展示 | 原 Mini Chat、公开 `@opendesk/ui` Shadow DOM/基础 CSS/生命周期 | 原 requestId 恢复、ACK/并发读/终态围栏、准确 URL 导航退役、纯文本全文和 B 链接 | Node/DOM fixture 通过；真实 A 回显、主题、窄屏、焦点与打开 B 未测 |

原请求绑定真实已安装 Page/Task 身份、版本/哈希、授权代次、A tab/frame/document/URL/window。普通网页 postMessage、CustomEvent、自报 isTrusted 或 Host 回执不能获得权限。Page 公共能力没有直接 start，必须进入原 TaskWorkbench。

TaskWorkbench 从 Authority 重新读取持久请求，端口事件只提供定位提示；参数和 owned 目标锁定，保存及确认再次核对。B 沿原 inactive owned 创建路径执行。来源失效不能复活旧准备；撤权、重新授权、重装、升级不能清空旧请求占用并创建 B2。

结果读取核对逻辑 requestId 与原 Controller admission ID 的映射、原 preparation/run/result、B/message 身份、Task 安装及资源释放，读取前后复核授权。业务选择在 Subagent adapter，原 SW 静态注册；通用 Authority 没有 Subagent 条件分支。R8 向 A 官方聊天发送的链路未接入。

## 三、固定 Task 与真实授权状态

| 身份 | 本轮值 |
| --- | --- |
| 原不可变 Task | `projects/webflow/tasks/chatgpt.conversation.create.0.2.0.opendesk-task.json` |
| Task ID / version | `chatgpt.conversation.create` / `0.2.0` |
| manifestHash | `0402cbea8284f87bd3cc63c73b453530be1338cd511c30671957a919678ab146` |
| contentHash | `90d077ff17fdcf89ac0a13adf4a671edc324030165c7eefa95a4acdc531bd51c` |
| 参数 / 目标 | 原 prompt、`send:true`；owned `https://chatgpt.com/` |
| Subagent Page 候选 | `0.2.0` |
| Page 构建 source/build hash | `ecfadece5c0568979e08288af59640a7e83089322ee53598f65456f1c010fe22` |
| 本轮真实批准并调用的 Task | **无；本机安装和批准未执行** |
| 本轮真实安装版本 | **未知** |

原 0.2/0.3 Task 脚本及冻结包未修改。原审批能够在 B 创建前确认固定 prompt/send/owned 目标，因此源码选择 0.2.0 一次执行，没有重写 0.3.0 两阶段脚本。WebFlow Sidebar 的百度/Google 委托没有被误当作 ChatGPT 授权。

## 四、安全恢复、正文与 UI

- 同一来源持久占用一个请求。双击、ACK 丢失和迟到 ACK 不再执行；完成/失败/取消不会自动清空占用。
- 刷新只恢复 Authority 返回的原 requestId，不信任页面缓存答案；恢复失败保持 UNKNOWN，不能生成替代请求。
- 精确 URL 变化退役原 UI；原 Authority 围栏阻止 SPA 往返后复活旧审批。合法刷新只能读取原结果，不替换原执行 document 身份。
- 没有 Result 时保守 UNKNOWN；持久 Run 的 running 字段不足以证明 Worker 活性。只读查询继续，没有补发路径。
- 正文用 textContent 展示，B 链接限定规范 ChatGPT conversation URL，使用 noopener/noreferrer。超过 65,536 UTF-8 字节的结果拒绝，不能截断后伪装完整成功。
- UI 复用公开 Page UI，348px 并受视口约束，全文独立滚动；IME 不提交，Ctrl/Meta+Enter 消费本输入事件。未把可信内部 React 或 Host 导入 Page，未引入复杂聊天框架。
- 原生 320/360/400px、浅深主题、遮挡、键盘、焦点、MV3 休眠、B 关闭和真实撤权竞态仍未测试。

## 五、文件归属与非业务构建修复

逐文件路径、Git blob 和 SHA-256 在 `source-inputs.json`，分组如下。

| 责任 | 实际修改范围 | 必要性 |
| --- | --- | --- |
| Subagent | package、main、transport、contract、mini-chat、trusted reader/projection、项目测试 | 固定委托、原结果消费、恢复与紧凑展示 |
| Page 公共能力 | user-scripts 的新 contract/runtime/alias、原 installed-programs/preview、scope/package/metadata、page-program-library | 真实安装与原用户操作边界、权限审阅、失效保护 |
| 原 Host 与审批 | authority/broker/client/controller-methods、TaskWorkbench/TaskRunSheet、SW | 原 journal、owned 准备、来源审批、只读查询和固定注册 |
| 原 Program 工具链 | 原 validator、builder、project schema | 用原来源与安装包哈希覆盖 Task 声明，不手工造包 |
| 原 ChatGPT 辅助边界 | workspace-chatgpt-core、原 wrapper、workspace-chat-edit-ui 和三个 WebFlow Native 辅助 import | 机械分离通用 URL/DOM 读取，避免非 Task 消费者导入 Task 准入策略，保留兼容导出与原验证 |
| 真实构建来源 | bundle-provenance/测试、AI Proxy 原 source-lock | 逐字节审查真实主线差量和精确消费者，不新增业务权限 |
| 已复现的固定 bundle 体积修复 | wxt.config.mjs、scripts/pinned-public-suffix-raw.mjs、对应构建边界测试 | 只在原 tool-shell 编译时精简一个受审 raw 数据输入中解析器原本忽略的行；原数据、消费者、规则、通知、预算和权限保持 |
| 文档/证据 | 两个原 API 文档、Subagent README/原续接提示词、原 workstream、本目录 | 同步当前真实能力、owner 与未验边界 |

构建实际暴露的来源问题逐项修复：AI Proxy 原锁 8 个键更新且仍为 63 键；AI Scroll 三个已提交源码更新精确 blob；Prompt 的既有纯常量 asset-contract 仅增加原 tool-shell 一个目标。旧/新差量、真实图及其他目标拒绝在 `webflow-audit/`。没有允许任意项目源码进入可信 bundle。

之后正式构建触及工具工作台 3 MiB 原预算。原失败字节、实际模块图、最终必要修复及最终状态均保留于 `build/` 和 `status.json`；不能把失败的 40/44 或静态图通过当作完整构建成功。

实际第3次失败为 3,150,219 B，超过 3,145,728 B 预算 4,491 B。独立图审查排除了重复 React、Page 安全代码或 ChatGPT helper 造成可安全裁减的约5KB余量。最终仅对原 PSL raw 静态导入做构建期精简：原数据和原 domain 消费者均 byte-pinned，Acorn 仅接受等于原数据的单字符串 export，不执行输入。保留全部 10,336 条规则、完整 MPL/source/version/commit 头、所有许可/版权通知块和分区标记。逐项规则、类别、IDNA 和原消费者对所有规则派生 host 的行为比较通过。原 vendor 与业务源码未改，未增加第二份数据快照，未抬预算或拆分规避固定入口。

## 六、实际 Node 与构建证据

以下集合有重叠，**不得相加为独立总数**。真实 Chrome 未执行。

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| Subagent 全部项目测试 | 48/48 PASS | node/subagent-integrated.tap，原始 TAP |
| 新增原 TaskWorkbench Page/owned 流程 | 5/5 PASS | node/workbench-page.tap，原始 TAP |
| 新增 React Page 审批/撤权/迟到读 | 5/5 PASS | node/page-react-workbench.tap 与输入哈希 |
| 原 prepare / Program / Page package / library | 69/69 PASS | node/framework-final-summary.json，实际工具结果摘要，非完整 TAP |
| Installed Page 来源边界 | 4/4 PASS | 同一实际工具结果摘要 |
| TaskWorkbench + React 扩围 | 199 PASS / 9 FAIL / 208 | node/workbench-integrated.tap |
| 框架扩围 | 285 PASS / 3 FAIL / 288 | node/framework-regression.tap |
| WebFlow Workspace/images 原消费者 | 197/197 PASS | webflow-audit/prior-tool-run-summaries.json，无原始 stdout 文件 |
| WebFlow Native files 原消费者 | 144/144 PASS | 同上；这是 Node，不是原生文件工具执行 |
| 完整 provenance 已执行集合 | 32 PASS / 7 FAIL / 39 | webflow-audit/provenance-after-source-lock.tap |
| 最后 Scroll/Prompt 精确边界 | 2/2 PASS | webflow-audit/tool-shell-provenance-targeted.tap |
| PSL 精确来源/规则与原消费者行为 | 5/5 PASS | webflow-audit/pinned-public-suffix-raw.tap；raw模块减少195,649 B不等于最终bundle测量 |
| 合并并行来源审查后的受影响门禁 | 5/5 PASS | node/provenance-merged.log，原始spec stdout；命令记录另存，不伪装TAP |
| 后续并行同字节source-lock的新测试 | 1/1 PASS | node/upstream-source-lock-test.tap；该步全部801实际构建输入保持相同 |
| 最后并行Clipper字节边界及精确pin | 2/2 PASS | node/upstream-clipper-tests.tap；随后正式重建通过 |
| tool-shell 静态图 | 390 本地模块、120 受审输入、0 failure、0 unresolved | webflow-audit/tool-shell-after-review.json；不是产品运行 |
| 原 Program validate | AUTHORING_VALID_NOT_PACKAGED | build/validate-program.log |
| 原 Program build | BUILT_UNVERIFIED，installable:false | build/build-program.log |

审批的 9 个失败使用原 `f590505b...` 源码/测试复现，框架的 3 个失败使用原 `1521f9d1...` 模块/测试复现；同名、同错误签名，没有改断言规避。详见 `baseline/`。provenance 7 个失败对应 Bookmark、Time Review、Reading TOC、tab repair 的 fixture/旧期望，保留实测失败；后续定向 PASS 不能代替完整回归绿。

原始证据复制与摘要性质明确标注；没有为补文件编造 TAP。失败构建保留原始 stdout 与诊断摘录，诊断摘录标注原文件哈希，不混同原始完整记录。

## 七、AC01～AC10：当前真实 Chrome 状态

| 编号 | 必须证明 | 状态 | 缺少的本轮证据 |
| --- | --- | --- | --- |
| AC01 | A 显示 Mini Chat | NOT_TESTED | 当前候选安装和 A 实际显示 |
| AC02 | 唯一可信请求 | NOT_TESTED | 真实点击与 USER_SCRIPT sender 正向执行 |
| AC03 | 独立 B、A 不覆盖 | NOT_TESTED | 实际 B tab/document |
| AC04 | 准确收到、只发一次 | NOT_TESTED | 原生填写、读回、批准和提交 |
| AC05 | 完整真实回答 | NOT_TESTED | B 真实消息及完成信号 |
| AC06 | A 显示同一 B 全文 | NOT_TESTED | 原持久结果与 A 真实回显 |
| AC07 | B 链接可打开 | NOT_TESTED | 本轮真实 B URL 及打开 |
| AC08 | 双击/刷新/断线不重复 | NOT_TESTED | 原生故障注入；Node 防重不能替代 |
| AC09 | 失败/UNKNOWN 不伪成功 | NOT_TESTED | 真实撤权及未知回执链 |
| AC10 | WebFlow/Side Panel/权限无回归 | NOT_TESTED | 原生回归；Node 扩围仍有记录中的失败 |

没有本轮真实 AC PASS；也不把 NOT_TESTED 写成已发生的业务失败。BUSINESS 为 BLOCKED。

## 八、外部阻塞与继续操作

官方本机 OpenDesk Browser Core/Code 状态查询重复返回 `UNAVAILABLE / MCP SSE probe returned 429`，CodexPro 也连接失败。脱敏回执见 `native-status.json`。这阻止当前候选的真实安装、原审批和 ChatGPT 执行。不能用普通网页消息、其他对话的安装或历史 PASS 替代。

通道恢复后继续原任务：核对 Mac 的 main/未提交改动/watcher/UI owner；同步本提交，按原 Browser/Page/Task 安装和权限审阅装入同一候选；从真实 A 输入固定任务，经原审批确认一次；记录 B、Task 安装、Run/Result、真实 message ID、终态/释放与全文；回 A 观察 Mini Chat 并打开 B 链接，再按 AC08～10 验证故障和无回归。UNKNOWN 只查原记录。

不要重建已经接通的 Mini Chat、SDK transport、原审批或结果 adapter。专家评分是独立内部模拟视角，不是外部认证，不代表未测功能已完成，综合分只取五项算术平均。
