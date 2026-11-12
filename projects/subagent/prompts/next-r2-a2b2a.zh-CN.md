# GOAL：Subagent R2 · 真实 ChatGPT A→B→A Mini Chat 闭环（继续开发，不重做）

仓库：shopable-ai/opendesk-browser。唯一分支：main。正式产品：Subagent；业务目录：projects/subagent/；项目 ID：opendesk.subagent。Mini Chat 仅是首个演示 UI；WebFlow ChatGPT 脚本归 projects/webflow/；原 Controller/Host/Authority 归公共框架。任务 ID：OD-SUBAGENT-CHAT-A2B2A-R2-TRUSTED-CLOSURE。

## 最新续接快照（2026-11-12，差量执行回执）

- 已继续开发到源码接线候选 **Subagent 0.2.0**：正式 `@opendesk/tasks` 安装专属客户端、原 TaskWorkbench 冻结参数/独立目标审批、原 commandJournal 与 Run/Result 查询、固定 SW 全文投影、Mini Chat transport 与刷新恢复均已接线。先读 README 当前进度和 `evidence/trusted-closure-r2-20261112/`，不要重新实现这条链。
- 使用原不可变 `chatgpt.conversation.create@0.2.0`，manifestHash `0402cbea8284f87bd3cc63c73b453530be1338cd511c30671957a919678ab146`，sourceHash `90d077ff17fdcf89ac0a13adf4a671edc324030165c7eefa95a4acdc531bd51c`。没有修改旧 Task 包，也没有把 WebFlow Sidebar 的百度/Google 委托当成此能力的授权。
- `src/main.js` 现在从固定安装加载器取得客户端，必须先 `restore()`；没有客户端时保持禁用。`request()` 只建立待审批记录，原可信工作台的真实确认才执行。不要改成普通网页事件、公开全能 Host RPC 或自动批准。
- 本轮 Subagent 48/48 Node 通过；其余框架、审批 UI、构建和已存在的回归失败分别有原始记录，不能把某个子集写成全仓或 Chrome PASS。读取证据身份后复用未变化检查。
- 原 Browser production 构建及包验证已 PASS：131资源，packageHash `0b49abaabba5aa5a3d79f591dd31f331d316788f1fa0e392765e5f4d7e99cca0`，原预算/来源门禁保持、sourceDrift为空。原 Page builder 的 Subagent0.2.0为BUILT_UNVERIFIED，尚未晋升或安装。构建失败历史与实际修复全部保留，不要把已修复的pin/体积问题继续报作当前阻塞。
- 本轮 CodexPro 本机连接失败，OpenDesk Browser Core 与 Code 通道复查仍为 `UNAVAILABLE / 429`。实际安装版本、原生 A/B 操作均未取证，业务仍 **BLOCKED / NOT_TESTED**。下一步首先恢复官方本机通道，核对工作区和共享 watcher，将同一候选经原安装与权限审阅装入真实 Chrome，再验证用户操作；不要再把 T01 描述成尚无实现，也不能把接线源码写成业务已通过。

## 一、原始目标（以用户实际操作为唯一业务终点）
在 ChatGPT 当前对话 A 的 Subagent 小面板输入「请介绍 WebFlow 的三个主要优势」，点击创建任务；在原安装、网站及真实发送授权下，通过已受审 WebFlow Controller Task 创建一个不覆盖 A 的 ChatGPT 新对话 B；把任务准确填进 B、读回、只发送一次、等待真实完整回答；最后把完整正文与真实 B 对话链接显示在 **A 的 Subagent Mini Chat**。不能自动给 A 官方对话发送任何消息。仅单 A、单 B、单任务、单结果；不开发多 Provider、并发 Agent、复杂看板、模型选项和 SSE/Fetch 拦截。

## 二、已完成并禁止重复的工作
- 正式重命名已提交 main，历史提交 6e0ee588：projects/subagent/、opendesk.subagent，旧 subagent-mini-chat 目录已迁移；不重新建项目/分支/工作区，也不再交 ZIP。
- projects/subagent/src/main.js 使用 @opendesk/ui 的 createPageUI；src/mini-chat/view.js 有 Shadow DOM 输入/按钮/状态/结果区域/B 链接；src/mini-chat/model.js 有单请求、UNKNOWN 只读和恢复；src/transport.js 已接正式安装客户端。**开发预览或旧 Browser 没有新客户端时按钮仍禁用；真实安装和业务尚未验证。**
- projects/webflow/src/tasks/chatgpt-conversation-create-v0.2.js 及冻结 0.2.0 Task 包已写 B 新建、fill、读回、经批准 send:true 单次发送、消息身份与完整回答提取；0.3.0 另有 PREPARE/SUBMIT 同一 B 脚本，但可信两阶段消费者仍未证明闭环。不可修改不可变 Task 包。
- projects/webflow/tool.config.json 的 delegatedTasks 仅有百度/Google；ChatGPT Task 存在不等于 WebFlow Sidebar Tool 已获委托，也不等于用户 Chrome 已安装。原 WebFlow R8 是「往 A 官方消息发送」另一流程，本轮只复用公共能力，不介入 R8。
- 早期源码/模拟测试与历史 9/9 Node 记录必须按实时 HEAD 复核；无当前真实 Chrome 安装及业务成功证据。

## 三、先审计真实差量，定位最短通路
先读根 AGENTS.md、projects/webflow/AGENTS.md、projects/subagent/README.md，检查最新 main HEAD、未提交文件、并行 Agent owner 和共享 dist/Chrome UI lease；保护并行改动。不广泛扫描全仓，只读以下真正依赖：
1. Subagent：package.json，src/main.js，src/contract.js，src/mini-chat/{view,model}.js，tests/contract.test.mjs。
2. WebFlow：src/tasks/chatgpt-conversation-create-v0.2.js、v0.3.js、对应 Task 包、src/chatgpt-conversation-result.js、trusted/chatgpt-result-adapter.js、可信消息及原 Controller Result。
3. 既有通信：src/page-events/{content-bridge,web-task-ingress}.js、src/native-agent/chatgpt-background-adapter.js；区分可调用公开 SDK 与仅内部使用的可信函数。
4. CSS/UI：docs/framework/ui-api.zh-CN.md、src/scripting/user-scripts/page-ui.js、src/ui/react/components/conversation-frame.css、src/entrypoints/sidebar-shared-ui.js、projects/ai-send-queue/assets/queue.css。

输出 T01～T05 的“已有文件/真实缺口/必须变更的文件/owner”四列表。确认目前第一个真实失败接口，不在无证据时先重构 Framework。

## 四、按五个任务直接完成必要差量
T01｜可信触发：Mini Chat 真实用户操作创建唯一 requestId；不要把网页 postMessage、CustomEvent 或自称 isTrusted 当作可信审批。优先复用实际公开 Page→Task 能力；若确实没有，记录 SDK_GAP_CONFIRMED 后由公共框架 owner 实施 **最小通用 Page/受审 Content→已安装固定 Task 准入与只读查询接口**。绑定真实已安装程序/任务 identity、hash/代次、A tab/frame/document/URL、真实宿主审批和请求身份；不能在核心写 if(toolId==='subagent')，不能新建 Runner/数据库。不可伪造 Host trusted 状态。
T02/T03｜真实 B 与一次发送：先验证能否在原可信批准下直接复用 0.2.0 send:true 的一次性 owned B；如原安全合同必须 PREPARE→独立批准，才使用 0.3.0 的 retainedFrom+borrowed 接续并补齐缺失消费者。不得默默扩大授权、重新填旧草稿、第二次发送、后台强抢 A 焦点。
T04｜完整结果：从原 Durable Run/Result 获取真实 replyText 和对话 URL，验证对应 B、用户/助手 messageRef、runId/resultId/requestId、终态与 released；**不能把只读交付中的 500 字 replyPreview 当完整回答**。只有实际缺采集能力时才在原 ChatGPT Provider Adapter 做最小 DOM 补充。JSON completed 或静默几秒不是业务完成。
T05｜A UI 展示：通过已有可信消息或只读结果接口只更新来源 A 的同一 UI/请求，显示安全纯文本和实际 B 链接；A 刷新、SPA、B 关闭、授权撤销、MV3 休眠、ACK 丢失时保持 UNKNOWN 只查原记录，绝不补发、创建 B2 或给 A 官方聊天发送结果。

## 五、UI/CSS 不重复建设
复用 @opendesk/ui 的 ShadowRoot、清理与基础 CSS/--od-*；参考现有 conversation-frame.css 的 textarea、focus、status、answer 样式，参考 AI Send Queue 的紧凑悬浮布局。SharedConversationFrame 属可信 React/Sidebar 沙箱路径，未证明 Page USER_SCRIPT 可公开调用前不得直接 import 私有 TSX，也不为了 300～350px Mini Chat 新建第二套会话框架。保留单输入、一个按钮、状态、结果、B 链接；验证浅深模式、IME、键盘、320/360/400px、页面遮挡与 SPA 适配。

## 六、执行顺序与验收
1. T01～T05 对照审计，选最短合法技术路径；随后直接编码，不停在设计或静态 Demo。
2. 定向 Node/模拟双标签：空输入、双击、防重发、并发 read、晚到 ACK、伪造结果、错误 requestId、A/B 文档错配、撤权、刷新、B 关闭、超长回复、结果重复与 UNKNOWN；零 A 官方发送。
3. 在真实仓库核对命令并运行：node --test projects/subagent/tests/*.test.mjs；node scripts/validate-program-project.mjs projects/subagent；npm run build:program -- projects/subagent。依原正式安装器审阅固定 Task 与 Page，不手工伪造 pin/包。
4. 真实 Chrome：A 出现 UI → 点击创建 → 原授权确认 → 新 B 准确发送一次 → 完整回答 → A 自有 Mini Chat 显示正文和真实 B URL；记录实际版本、tab/document、Run/Result、消息 ID、业务截图/回执。缺少本机连接/账号/安装/授权时只报告真实 blocker，不将 Node 或模拟标为 Chrome PASS。
5. 只修实际失败并回归现有 WebFlow/Side Panel/权限；源码和证据直接提交 main，不交付 ZIP 代替提交。

AC01–AC10：A 显示 UI；唯一请求；独立 B；准确单发；完整回答；A 自有结果展示；B 链接有效；刷新/重复/断线不重复；未授权/UNKNOWN 不伪成功；WebFlow/Side Panel/权限无回归。**十项都经过真实 Chrome 业务证明才标 DONE**。

## 七、最后必须给我语义化结论
回答：原始目标；T01～T05 已复用/新增和实际修改文件；已完成与未完成；是否真正完成 A→B→A；AC01～10 各自真实证据；SOURCE/NODE/BUILD/PACKAGE/INSTALL/CHROME_NATIVE/BUSINESS 分层状态；提交 SHA 和当前正式包/安装状态。若未完成，只指出一个最主要、已复现的继续阻塞和下一步。不得将其他对话的历史 PASS 套用于新 HEAD。

评分：由五个独立审查视角分别评 0～100（产品目标与防漂移、架构解耦、权限/UNKNOWN 安全、UI 复用与简洁性、测试完整性与证据），逐项说明证据和反方否决点，最后只用**算术平均分**；95 是设计评分目标，不能代替真实测试或编造外部专家分数。
