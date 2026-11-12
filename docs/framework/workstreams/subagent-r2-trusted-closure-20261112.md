# Subagent R2 · 真实 ChatGPT A→B→A

- taskId: `OD-SUBAGENT-CHAT-A2B2A-R2-TRUSTED-CLOSURE`
- date: 2026-11-12 UTC
- owner: root；framework_audit 负责通用安装 Page Task 能力；webflow_audit 负责原持久结果及固定构建来源；closure_audit 负责模型/React 验证与独立反方。
- status: SOURCE_WIRED；Browser production BUILD / 原包验证 PASS，sourceDrift为空；Page候选仍BUILT_UNVERIFIED；INSTALL / CHROME_NATIVE / BUSINESS 未通过。
- branch: main；没有分支、worktree 或 PR。初始 baseline a7fad60f，工作中安全集成至54f0e7e9，保留上游并行工作及其完整精确pin测试。
- environment: 云端源码工作区；不是用户 Mac。CodexPro 连接失败，官方 Browser Core 与 Code 通道复查为 UNAVAILABLE / 429。Mac 未提交改动、watcher、安装版本未知，未覆盖本机文件或 dist。
- resources: root 独占本工作区 Git index/ref、Program 和 Browser 构建；子 Agent 不构建、不提交。未占用本机 Profile、端口、剪贴板或焦点。Browser 只读标签元数据，没有领取 A/B UI 租约、创建 B 或发送 ChatGPT 消息。

## 原始目标与已证实差量

在 A 的 Mini Chat 输入任务，经原审批调用固定 WebFlow Task，独立 B 仅发送一次，再将同一 B 的全文和链接展示于 A 自有 UI。UNKNOWN 只查原请求，不建 B2，不向 A 官方聊天发送。

已核对 Page 公共 SDK、原安装 onUserScriptMessage、Sidebar 委托、Page event ingress、Native ChatGPT adapter 与原 durable Result。内部受信能力不能由 Page 直接调用；原公开 Page SDK 缺少安装绑定的审批请求和只读结果接口。通用缺口已在原安装、Authority、commandJournal 与审批链内补齐，没有新 Runner、Controller、Ledger 或数据库。

| 任务 | 复用 | 本轮补齐与 owner |
| --- | --- | --- |
| T01 | 原 Page 安装/执行身份、Task Authority、commandJournal、TaskWorkbench | framework：公开 @opendesk/tasks request/read/restore、固定 pin/原审阅、真实 sender/source 复核与持久占用。root：main/transport 与原审批 UI 接线。 |
| T02/T03 | 原0.2.0 frozen Task、once admission、owned B、fill/readback/send | framework：原prepare支持owned。root：原TaskRunSheet展示来源/独立目标、锁定参数与重新核对。旧Task不变，不借用R8授权。 |
| T04 | 原 durable Run/Result、verifyChatGPTTaskDurableResult、WebFlow adapter | webflow/root：Subagent可信reader、固定SW注册、原身份及资源释放校验，使用完整replyText。无新增DOM采集器。 |
| T05 | 原Mini Chat、公开@opendesk/ui | closure/root：原请求恢复、ACK/并发读/终态围栏、准确URL退役、IME/键盘隔离与348px紧凑UI。 |

## 最终文件 owner

- root：Subagent package/main/transport/contract/view、生产结果注册、TaskWorkbench/TaskRunSheet、Host事件客户端与SW接线、对应测试、README/原提示词/本记录及证据；独占Git与正式构建。
- framework_audit：Page Task contract/runtime/alias及原安装/预览/scope/包验证；原Authority/broker/controller-methods；Program schema/validator/builder；对应公共测试/API文档。缺口证实后逐项扩围，源码已释放。
- webflow_audit：Subagent durable reader/tests；原ChatGPT通用辅助的机械抽取及4个非Task import；原bundle-provenance/对应测试、AI Proxy旧source-lock；实际tool-shell三项AI Scroll pin与一个既有纯常量模块的精确目标修复。受审差量有证据，不改相关业务源码。源码已释放。
- closure_audit：Mini Chat model/contract tests、原React审批Page用例、两组原主线失败的只读基线对比、最终反方审查；源码已释放。
- 旧0.2/0.3 Task脚本/冻结包、R8、其他workstream和public-owner.json不变。核心无Subagent业务条件，业务选择在项目adapter，原SW静态注册。

### 实际体积阻塞的必要扩围

第3次正式 Browser 构建已过来源门禁，实际 tool-shell 为3,150,219字节，超过原3,145,728预算4,491字节。两位owner只读核验：新增Page校验不足可减余量，ChatGPT机械抽取仅约+103B，不能删审批/安全检查。批准webflow_audit仅修改原wxt.config.mjs、scripts/pinned-public-suffix-raw.mjs及对应公共构建边界测试：原tool-shell精确PSL raw输入在编译时移除原domain解析器必忽略的注释/空行，保留全部规则、MPL/版权/版本/来源通知；原vendor、业务源码、pin、原预算和IIFE格式不变。必须证明逐条规则与原消费者行为相等、来源漂移拒绝，再由root运行原正式构建。该扩围只处理已复现的构建输入冗余，不是业务功能重构。

## 验证与续接

完整证据入口：`projects/subagent/evidence/trusted-closure-r2-20261112/README.md`。

Subagent48/48、原审批新增5/5、React5/5、框架组合69/69、安装来源4/4为Node/fixture。审批扩围199/208、框架285/288的失败已在原主线同名同签名复现；完整provenance曾32/39，不能宣称全绿。Program0.2为BUILT_UNVERIFIED，不能当安装。Browser来源问题修复后实际触及tool-shell体积预算，状态如实记入最终证据，不抬预算或删除保护。

最终原production构建与verifyPackage通过：44固定入口、131资源，packageHash为0b49abaabba5aa5a3d79f591dd31f331d316788f1fa0e392765e5f4d7e99cca0，801来源输入无漂移。tool-shell最终2,954,732/3,145,728字节，余190,996字节；PSL5/5定向Node和独立只读审查通过。原先3次失败日志完整保留。没有改预算、原Task或本机环境。当前唯一主要外部继续阻塞是官方本机通道429。

并行ab7e2000提交相同AI Scroll pins，新增build helper export和测试；保留其注释/export/整项测试及我方所有其他hunks。合并后定向5/5通过，再运行原production构建以绑定最终输入；该步attempt bc2541d3-78f0-4ffc-9991-52a005f24d4f通过，包hash与合并前相同。未拿合并前的回执代替最终输入证明。

随后feeb7f0e提交与本轮逐字节相同的AI Proxy source-lock及一项额外测试；保留上游测试，定向1/1通过。已核对当前全部801个实际构建输入均与最终PASS回执逐字节一致，故复用该正式构建，不重复运行无变化输入。锁文件现在由上游提交承载，本提交只保留复用/审查证据。

AC01～AC10没有本轮真实Chrome PASS。官方本机通道恢复后，核对Mac工作区/watcher/UI owner，按原安装及权限审阅装入同一候选，从A执行完整一次业务验收。不能重做已接线T01、伪造安装哈希或重放UNKNOWN。

最后保留并行54f0e7e9的Clipper最终UTF-8换行预算修复和完整pin/tests，相关2/2通过；最终delivery构建attempt da770127-1754-4d2b-baf8-d8f3c9159f73与原verifyPackage通过，当前801来源输入无漂移。新packageHash见上述最终记录。没有覆盖并行代码或重放未知Git引用更新。
