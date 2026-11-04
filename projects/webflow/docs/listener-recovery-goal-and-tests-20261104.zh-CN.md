# Web Flow 监听恢复与无侧栏双轮：目标及关键测试条件

用户于 2026-11-04 明确要求设置本目标。以下为本聊天原生目标的完整正文；历史证据不自动继承为当前通过。

完成 Web Flow 可信监听恢复与关闭侧栏双轮闭环，达到有同候选真实 Chrome 证据支持的独立评审 ≥95/100，且无未关闭的 HIGH/MEDIUM 问题。

项目：/Users/shopme/Documents/workspace/opendesk-browser，使用现有 main。阶段为日常持续开发，固定 dist/development、原扩展 ID ccfcjegpkdlgbclopjmadlcjedelidmf 和原 SDK/Authority/RunHost/账本。不得自行创建分支/worktree/PR，不提交、推送、发布、重装或晋升正式包，不改变模型路由、任务身份或授权范围。

完成条件（缺任一项不得完成或宣称 95+）：
K1 候选与入口可信：重查真实系统 Chrome /Users/shopme/Applications/Google Chrome.app 的加载身份、serve 连接、live revision；Bridge、tool-shell、SW 的 SHA 与同候选 marker 匹配，相关 source map 与被测源码同源。历史 PID/revision 仅作上次观察；不另起竞争 writer。
K2 监听状态真实：图标、颜色、文字及可访问状态能区分检查中、就绪、需刷新、不适用和未知。就绪必须来自当前精确 tab/conversation/document/runtime 的新握手；导航、运行时失效、超时和迟到回复不能保留旧绿色状态。监听与授权、执行、交付及原 UNKNOWN 独立。
K3 安全刷新闭环：真实可信点击→影响确认→末次页面与 Native/Provider 空闲核验→一次刷新→导航完成→取得新 document 的成功握手。只收到 ACK、点击成功或 navigation pending 均不算通过。草稿/IME、生成、在途任务/preview/Native/Provider、未知副作用或身份变化时拒绝并说明；失效/重复挑战及晚到派发不能刷新或开新效果。当前安全刷新恢复链须有真实 Chrome 证据；其余受影响拒绝保护用对应定向测试证明，不扩大为故障注入矩阵。
K4 两次独立新验证执行：本目标明确授权在独立新聊天中，对现有已批准 baidu.search.top3 发起两次新的验证执行，各有新的原生发送见证和 candidate；每次参数仅 query=OpenDesk Browser、limit=3，目标 https://www.baidu.com/，复用有效原授权，先核验实际安装身份（上次为 1.1.2/r1/generation2）。这两次用于本目标验证，不补回旧 UNKNOWN。每次在发送前关闭侧栏，保持关闭直到本轮结果持久化、单次交付且资源释放；第一轮确认完成释放后才开始第二轮，不靠侧栏 owner 执行或回传。
K5 逐轮原始证据：同一 candidate/request→Run→Result 的真实身份关联、来源 chat URL/document、安装与授权身份、结果内容、资源释放和时间线；结果只发送一次到该轮触发的原聊天，无错聊天、重复 Run 或重复交付。侧栏重开只读查询保留同一记录，不作为隐藏执行前提。
K6 历史与安全保护：旧 wf-084e05c5-0230-44fc-9ecb-4f94cea6e759 保持 UNKNOWN，除非其原身份的可靠账本证据明确状态；不重发、不补跑、不补发，也不以换 candidateId 重试同一旧业务。history 成功空数组不等于零执行，昨天的其他 Run 不可冒充它。刷新/重新打开后的历史回复只作基线；重复候选、来源/document/参数/安装身份变化与撤权在原准入链拒绝，拒绝分支零新增执行/交付，未知效果不自动重放。
K7 验证与评审：只运行当前失败/改动影响的定向检查；有效且源码未变的既有证据复用，变化部分重新验证。独立审查覆盖最终源码与同候选实站证据，给出评分依据且 ≥95，无未关闭 HIGH/MEDIUM。没有实站证据保持 NOT_TESTED/NOT_SCORED；测试数、源码审查或磁盘构建不能替代原生通过。

当前基线：源码与部分原生监听状态已验证；完整刷新恢复、关闭侧栏双轮、Run/Result/交付/释放未完成。此前 UI 调用连续超时、中文输入丢字/paste 超时，尚不能归因为产品缺陷；本聊天尚未发送新任务候选。证据 projects/webflow/evidence/listener-recovery-20261104.json 是历史时点，开始时重查。
资源边界：UI 租约已释放；page Bridge、对应定向测试及其单项 provenance pin 已移交退役 owner 01a1a547-87d1-7432-9ea2-7ad0b7016f09。先核对其当前写入与 UI 所有权，再协调本目标需要的稳定候选，不能抢占或回写其文件。五场景旧浮层/初始化次数继续由该 owner 负责，不在本目标重复开展；必要证据可同候选复用。不同 Profile 的 Native 争抢由聊天 01a1a581-1e75-7821-8ada-211862559ee9 负责，不扩大为本目标的全环境整改。上次 writer93582 留运行，不停止或复制覆盖共享输出。

下一条操作：先只读确认控制入口、资源归属和当前候选，再恢复一条安全刷新→新文档握手的最短链；随后逐轮执行 K4/K5。发现实际产品阻塞才在本目标 owner 范围最小修复，保留他人未提交改动。所有关键条件通过、证据落盘并完成独立评审后才标完成；生产验收、完整 CI、压力/多版本/缩放专项和正式包发布不在本目标。
