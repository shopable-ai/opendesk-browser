# 网页适配 V1.1：60 项独立书面审议

本记录由三名独立子代理分别完成 1–20、21–40、41–60 项书面审议；每项包含正反分析、证据或待验证假设、风险与建议。它们是 60 项审议条目，并非 60 次实际会议或 60 名独立专家投票；未验证的站点及 Chrome 行为不得转为通过。部分意见描述审议时状态，后续修复以执行计划和当前源码为准。

以下为供主 agent 收敛的 **20 项独立书面架构审议**。各项的“决策”是基于当前源码的建议，目标网站的行为仍须逐站验证；本轮没有修改文件或运行测试。

### 1–10：通用 Runtime 边界

| 项 | 正方 | 反方 | 源码证据或待验证假设 | 风险 | 是否更改方案 / 保留决策 |
|---|---|---|---|---|---|
| 1. 执行主权 | 多站共用原 Authority 和 RunHost，保持单一准入与持久结果链。 | 新建通用 Runtime 可降低对现有 ChatGPT 命名的依赖。 | [broker.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/broker.js:250) 对 `startControllerRun` 接入 `withControllerAdmission`。 | 第二执行链可能绕开原身份与准入。 | **不改：**复用现有 Authority/RunHost；命名调整另议。 |
| 2. 五字段 | 所有站点共用严格五字段意图校验。 | 网站各自定义字段更灵活。 | [chatgpt-task-request.js](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-task-request.js:89) 严格检查 `protocol`、`candidateId`、`taskId`、`targetUrl`、`args`。 | 自定义字段导致协议分叉或隐藏授权信息。 | **不改：**保留五字段及额外字段拒绝。 |
| 3. 业务与传输协议 | 区分页面业务意图与扩展内部消息协议。 | 合并协议可减少转换。 | [chatgpt-task-request.js](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-task-request.js:87) 与 [trigger gate](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-bridge-trigger-gate.js:13) 定义不同协议。 | 页面意图被误当可信内部命令。 | **不改：**保留双层协议及各自验证。 |
| 4. 页面候选的信任级别 | 页面只提交候选，由 host 重读、准入。 | Adapter 解析后直接传执行参数更短。 | [host `assertIntent`](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-fixed-bridge-host.js:231) 重读并比较候选。 | 页面伪造、回复重生成或竞争导致错跑。 | **不改：**候选不携带执行权，执行前重读。 |
| 5. 来源身份 | 以浏览器实际 sender、tab、document、当前 URL 和会话绑定。 | 仅按网站域名与对话 ID 绑定较易跨站。 | [trigger gate](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-bridge-trigger-gate.js:537) 读取来源；[host](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-fixed-bridge-host.js:207) 校验 sender。 | 跨标签页、导航或文档替换时身份混淆。 | **不改：**保留浏览器来源身份；各站会话标识须独立验证。 |
| 6. 安装身份 | 继续绑定真实安装快照和版本。 | 只按 `taskId` 查询当前安装可减少协议状态。 | [normalizeChatGPTTaskInstallation](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-task-request.js:13) 校验版本、哈希、脚本、修订、安装 ID 与 generation；[host](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-fixed-bridge-host.js:295) 对照目录。 | 重装、升级或同名任务复用旧授权。 | **不改：**保留完整安装身份和重新核验。 |
| 7. 自动授权 | 站点适配复用原持久 grant、来源和权限围栏。 | 每个 adapter 管理自己的授权更独立。 | [auto-grants.js](/Users/shopme/Documents/workspace/opendesk-browser/projects/webflow/src/auto-grants.js:8)、[gate](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-bridge-trigger-gate.js:616) 现有准入与变更检查。 | 分散授权造成撤销遗漏或权限扩大。 | **不改：**Adapter 不持有授权主权；跨站授权范围如何表达待设计核实。 |
| 8. 去重与未知结果 | 共用原 ledger、单次准入和 UNKNOWN 围栏。 | 各站独立去重可简化局部实现。 | [trigger gate](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-bridge-trigger-gate.js:75) 管理 ledger；[测试](/Users/shopme/Documents/workspace/opendesk-browser/tests/environment/chatgpt-fixed-bridge-r12.test.mjs:36) 覆盖单次消费。 | 重试或双入口导致重复副作用。 | **不改：**保留原去重和不自动重放；跨站 key 命名须验证不会碰撞。 |
| 9. 结果与回传 | 先验证原持久 Run/Result，再授权回传原文档。 | 直接把运行回调传回页面延迟更低。 | [host](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-fixed-bridge-host.js:820) 读取快照，第 841 行回传。 | 回调不等于持久结果；可能送到错误或已撤权页面。 | **不改：**保留持久结果、撤权及原文档校验。 |
| 10. 安全执行世界 | 保持站点观察在顶层 `ISOLATED`，特权动作留宿主。 | MAIN world 可能更容易读取各站应用状态。 | [manifest.json](/Users/shopme/Documents/workspace/opendesk-browser/manifest.json:89) 指定顶层、`ISOLATED`。 | MAIN 页面可影响观察或跨越信任边界。 | **不改：**不因通用适配默认引入 MAIN；站点特殊需求须单独证明。 |

### 11–20：Adapter / Profile 边界

此处 **Profile** 指某个网站的适配规则集合，是审议用概念；本次未发现或声明已有通用 Profile API。

| 项 | 正方 | 反方 | 源码证据或待验证假设 | 风险 | 是否更改方案 / 保留决策 |
|---|---|---|---|---|---|
| 11. 站点观察接口 | 抽出站点相关观察，让共用流程消费统一快照。 | 每站复制完整页面编排可避免抽象失配。 | [createChatGPTBridgeSite](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-bridge-site.js:70) 已有 `inspect` 等入口。 | 过早抽象可能漏掉站点特有状态。 | **细化：**以现有观察能力为候选切入点，先验证第二站等价性。 |
| 12. 路由与会话 | 每站 Profile 明确允许的 origin、路由和会话识别。 | 任意 HTTP(S) 页面通过通用选择器接入覆盖更广。 | [chatGPTConversationId](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/workspace-chatgpt.js:7) 与 [host 来源校验](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-fixed-bridge-host.js:218) 为 ChatGPT 专用。 | 路由相似或嵌入页造成会话误绑定。 | **细化：**逐站精确匹配；不以泛域名匹配替代会话身份。 |
| 13. 注入声明 | 每个受支持网站有明确固定入口/匹配范围。 | 将现有 manifest 改为全站匹配方便扩展。 | [manifest.json](/Users/shopme/Documents/workspace/opendesk-browser/manifest.json:91) 当前只注入 `chatgpt.com`。 | 全站注入扩大暴露面，且其他来源检查仍拒绝。 | **不改总体边界：**是否需要额外入口或动态注册须按真实站点和权限合同核实。 |
| 14. 真实用户提交 | Adapter 提供可核验的提交见证，再关联新回复。 | 只监听新增助手消息可兼容更多界面。 | [page.js](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-fixed-bridge-page.js:281) 建基线，第 298 行见证提交；[测试](/Users/shopme/Documents/workspace/opendesk-browser/tests/environment/chatgpt-task-discovery-p0.test.mjs:221) 覆盖提交及流间隙。 | 历史消息、合成事件或后台更新触发执行。 | **不改：**保留提交关联；其他站点是否能可靠见证是待验证假设。 |
| 15. 完成判定 | 每站提供可证实的完成/流式状态。 | 文本短时间不变即可推定完成。 | [workspace-chatgpt.js](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/workspace-chatgpt.js:46) 检查停止按钮和 streaming 标记；第 55 行检查回复操作区。 | 暂停流或异步渲染被误认完成。 | **不改：**不能仅凭静默时间认定完成；无法证明时拒绝或保持未验证。 |
| 16. 唯一最新回复 | Profile 必须区分用户、助手、引用和最新唯一答案。 | 全页搜索五字段 JSON 覆盖率更高。 | [序列化读取](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/workspace-chatgpt.js:33) 按消息角色取节点；[测试](/Users/shopme/Documents/workspace/opendesk-browser/tests/environment/chatgpt-independent-task-intent.test.mjs:320) 覆盖最新唯一回复。 | 历史、引用或多个候选被误执行。 | **不改：**保留唯一完整最新回复约束。 |
| 17. 回复身份与重读 | Adapter 输出可供最终重读比较的 turn/answer 身份和原文。 | 只比较 `candidateId` 便于跨 DOM 变化。 | [assertWebFlowReplyCandidate](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/workspace-chatgpt.js:255) 及 [测试](/Users/shopme/Documents/workspace/opendesk-browser/projects/webflow/tests/reply-admission.test.mjs:145) 覆盖编辑、替换和精确文本比较。 | 相同 ID 下重生成或修改内容逃过检查。 | **不改：**保留身份与精确文本重读；各站身份稳定性待验证。 |
| 18. 结果写入与发送 | 各站适配器负责识别编辑器状态，原流程保留确认与防重放。 | 通用 DOM 写入加自动点击发送可快速覆盖。 | [fillChatGPTComposerOnPage](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/workspace-chatgpt.js:136) 检查生成状态、唯一编辑器、草稿和附件。 | 覆盖用户草稿、发送到错误对话或重复发送。 | **不改：**保留草稿、附件、原 turn 和发送结果检查；其他站点能力待验证。 |
| 19. 发现状态机复用 | 尽量复用已有 discovery 状态逻辑，通过适配快照输入。 | `createChatGPTTaskDiscovery` 本身含 DOM 内容选择，应整块视为站点专用。 | [discovery.js](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-task-discovery.js:10) 直接查询 ChatGPT 风格内容节点，第 31 行创建状态机。 | 直接复用会把 ChatGPT DOM 假设带到其他站。 | **细化：**先分辨状态逻辑与 DOM 假设；不能声称当前模块已完全通用。 |
| 20. Profile 的能力边界 | Profile 只描述和观察站点，不自行批准任务或改变安装身份。 | 允许 Profile 自带权限策略可减少宿主改动。 | [page host 分发](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool-shell.js:190) 与 [gate](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-bridge-trigger-gate.js:534) 表明当前授权位于可信宿主/SW。 | 站点规则变成隐式授权或绕过固定来源检查。 | **不改：**Profile 无授权权力；新增通用边界由原平台 owner 核实。 |

**并行收敛提示：** 当前已观察到 [tool-shell.js](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool-shell.js:190) 存在未提交改动；接线时需与其 owner 协调。此信息是上次只读检查时的工作树状态，实施前应重新核对。

---

**REJECT：输入修复有效，但协议约束尚未覆盖 ChatGPT adapter；Generic 还需要在接入真实执行链前明确事件和生命周期边界。**

上轮三项的复审结果：

- **`null` origin：已修复。** [site-profiles.js](/Users/shopme/Documents/workspace/opendesk-browser/src/page-events/site-profiles.js:27) 先要求字符串；测试覆盖 `null` 和 `undefined`。
- **稀疏协议数组：已修复。** [site-profiles.js](/Users/shopme/Documents/workspace/opendesk-browser/src/page-events/site-profiles.js:31) 使用 `Array.from` 后检查每个元素；测试覆盖空槽和显式 `undefined`。
- **按 profile 限制协议：Generic 已限制，ChatGPT 仍未解决。** [generic-task-adapter.js](/Users/shopme/Documents/workspace/opendesk-browser/src/page-events/generic-task-adapter.js:9) 只在 profile 包含 Web Flow 协议时观察该协议；但 [chatgpt-runtime.js](/Users/shopme/Documents/workspace/opendesk-browser/src/page-events/chatgpt-runtime.js:9) 仍忽略传入的 profile，缩小其协议列表不会限制原 Bridge。当前固定列表未缩限，所以尚无已证实的新增绕过。应明确该列表只是元数据，或让可信处理链实际执行限制，并增加缩限负例。

Generic 的另一个可复现问题是**重复启动产生重复观察**：[generic-task-adapter.js](/Users/shopme/Documents/workspace/opendesk-browser/src/page-events/generic-task-adapter.js:9) 每次 `start` 都添加独立 listener；只读探针中，同一 adapter 启动两次后，一个事件产生两次回调。建议定义单文档实例所有权，重复启动拒绝或复用，并测试部分 dispose、重启和重复事件。当前代码没有生产消费者，尚不能称其造成重复执行。

Generic 明确接受合成页面事件；事件只被解析成候选，代码本身没有执行 Authority。**接入条件**是消费者独立验证浏览器文档、任务安装、批准和防重放，不能把 `event.target === win`、合法 JSON 或 profile 命中当作身份或授权证明。实际 Chrome 跨执行世界事件行为和真实第二站尚未验证。

定向测试 **47 项通过**，包含四个新测试文件和 ChatGPT 固定桥相关测试；未构建、安装或运行真实网页。

以下是我作为**单个审查者**给出的第 21–40 项书面审议；正反观点是分析，不代表多人会议或真实投票。证据链接指向代表性源码；未实测的运行效果均不视为通过。

### 21–30：MV3 权限、注册与事件安全

| 项 | 正方 / 反方 | 证据、风险与修改或保留决定 |
|---|---|---|
| **21. Chrome 网站权限** | 正方：已有宿主权限可供框架使用；反方：浏览器权限不等于用户批准某自动任务。 | [manifest.json](/Users/shopme/Documents/workspace/opendesk-browser/manifest.json:37) 声明 `<all_urls>`。**风险：**混淆权限层。**决定：**保留独立安装和任务授权检查。 |
| **22. 精确来源** | 正方：profile 按规范 origin 匹配；反方：来源匹配只证明路由选择。 | [site-profiles.js](/Users/shopme/Documents/workspace/opendesk-browser/src/page-events/site-profiles.js:9)。**风险：**把命中误作浏览器 sender 证明。**决定：**执行时从 Chrome 重读 tab/frame/document。 |
| **23. 站点路径** | 正方：origin 路由便于共享 adapter；反方：同 origin 可含无关页面。 | [chatgpt-bridge-trigger-gate.js](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-bridge-trigger-gate.js:547) 另限制对话路径。**风险：**普通页面触发。**决定：**每站保留独立路由和会话判定。 |
| **24. 固定构建** | 正方：现有 Bridge 仅声明 ChatGPT；反方：新增 profile 不会自动成为真实注入。 | [verify-package.mjs](/Users/shopme/Documents/workspace/opendesk-browser/scripts/verify-package.mjs:63) 校验固定脚本。**风险：**把 Node 模拟称为第二站已部署。**决定：**接线前审查固定构建合同；产物未验证。 |
| **25. 动态注册** | 正方：既有 Page Program 有注册和读回；反方：它属于 USER_SCRIPT，不自动具有 Bridge 特权。 | [installed-programs.js](/Users/shopme/Documents/workspace/opendesk-browser/src/scripting/user-scripts/installed-programs.js:197)。**风险：**跨执行世界混权。**决定：**复用原注册和 Authority，不把注册本身当授权。 |
| **26. 注册竞争** | 正方：现有注册对账检查权限代次和实际描述符；反方：注销、注册和撤权可交错。 | [installed-programs.js](/Users/shopme/Documents/workspace/opendesk-browser/src/scripting/user-scripts/installed-programs.js:479)。**风险：**陈旧注册残留。**决定：**保留撤权围栏和读回，新增机制须验证竞态。 |
| **27. 配置范围变更** | 正方：已有 Page 安装范围差异审阅；反方：新增站点或移除排除项不能视作旧批准。 | [page-install-authorization.js](/Users/shopme/Documents/workspace/opendesk-browser/src/scripting/user-scripts/page-install-authorization.js:24)。**风险：**静默扩权。**决定：**保留差异审阅和安装代次。 |
| **28. 页面事件** | 正方：Generic 仅输出严格解析候选；反方：任意页面代码可伪造该事件。 | [generic-task-adapter.js](/Users/shopme/Documents/workspace/opendesk-browser/src/page-events/generic-task-adapter.js:3)。**风险：**候选被误接为执行请求。**决定：**消费者重新认证并独立准入；真实跨世界行为未测。 |
| **29. 重复和冲突** | 正方：原 Bridge 的持久 ledger 拒绝候选重放；反方：Generic 多 listener 可重复回调。 | [trigger-gate](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-bridge-trigger-gate.js:307)；本轮探针复现两次回调。**风险：**未来消费者重复处理。**决定：**限定 listener owner，保留最终持久防重。 |
| **30. 权限撤销** | 正方：SW 同步触发失效及安装授权暂停；反方：异步注销不等于旧文档已清理。 | [sw.js](/Users/shopme/Documents/workspace/opendesk-browser/src/sw.js:219)、[installed-programs.js](/Users/shopme/Documents/workspace/opendesk-browser/src/scripting/user-scripts/installed-programs.js:505)。**风险：**旧 listener 继续观察。**决定：**撤权即拒绝准入，另行确认资源退役。 |

### 31–40：SW、offscreen 与 RunHost 生命周期

| 项 | 正方 / 反方 | 证据、风险与修改或保留决定 |
|---|---|---|
| **31. SW 重启** | 正方：已安装 Page 的未决执行恢复为未知；反方：重启不能证明原动作没发生。 | [installed-programs.js](/Users/shopme/Documents/workspace/opendesk-browser/src/scripting/user-scripts/installed-programs.js:586)。**风险：**重复副作用。**决定：**保留 UNKNOWN 和原请求对账，禁止补跑。 |
| **32. 监听器恢复** | 正方：ChatGPT 的 BFCache 恢复保留原清理逻辑；反方：它直接初始化原 Bridge，未重新读取未来动态 profile。 | [chatgpt-fixed-bridge-page.js](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-fixed-bridge-page.js:997)。**风险：**未来停用后恢复旧能力。**决定：**动态配置上线前重新核验；当前静态配置无已证实绕过。 |
| **33. 定时唤醒** | 正方：alarm 是恢复入口；反方：alarm 本身不是任务许可。 | [sw.js](/Users/shopme/Documents/workspace/opendesk-browser/src/sw.js:243)。**风险：**将唤醒误当准入。**决定：**保留持久 Fire 和原 Authority 检查。 |
| **34. Offscreen 存在** | 正方：生命周期管理器复用固定 offscreen 文档；反方：文档存在不证明登录、授权或任务可执行。 | [runner-lifecycle.js](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/runner-lifecycle.js:17)。**风险：**把 `ready` 误写成任务就绪。**决定：**展示独立状态并保持原准入。 |
| **35. Offscreen 关闭竞态** | 正方：关闭前使用共享准入锁检查 slot；反方：缺锁或关闭结果未知不能假设已安全释放。 | [runner-lifecycle.js](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/runner-lifecycle.js:42)、[run-admission-lock.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/run-admission-lock.js:5)。**决定：**保留锁和失败关闭；本轮未做原生竞态测试。 |
| **36. RunHost 唯一执行权** | 正方：本地先占位，持久 `@slot` 管跨 Host；反方：新增 Generic 不应另建执行循环。 | [run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:54)。**风险：**双执行器。**决定：**候选只进入原 Host/Authority，保留安装身份。 |
| **37. 准入中关闭** | 正方：RunHost 对在途准入和关闭进行等待；反方：关闭发生在 claim 返回前时，结果仍可能不确定。 | [run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:80)、[run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:264)。**决定：**保留原 request/Run 身份，未知时查询而非重发。 |
| **38. 停止与副作用** | 正方：取消绑定所属 Run，避免停止其他任务；反方：停止请求不撤回已发生的网页动作。 | [chatgpt-fixed-bridge-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-fixed-bridge-host.js:267)。**风险：**误报“已回滚”。**决定：**分别显示请求停止、执行结果和资源释放。 |
| **39. 完成与退役** | 正方：原链要求完成、持久结果及 released；反方：仅收到完成回执不证明 Worker/目标已释放。 | [run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:127)、[chatgpt-fixed-bridge-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-fixed-bridge-host.js:46)。**决定：**保留分别核验，不提前放行下一动作。 |
| **40. 断线与结果回传** | 正方：断线时中止本地控制并对未结算状态对账；反方：发送 ACK 丢失不能证明消息未送达。 | [run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:252)、[chatgpt-fixed-bridge-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/chatgpt-fixed-bridge-host.js:838)。**风险：**重复回传。**决定：**保持 UNKNOWN、不自动重发。 |

本次没有修改文件。**停止条件：**明确 ChatGPT profile 的协议语义，并解决或明确封装 Generic 重复启动；在将 Generic 接到任何真实执行消费者之前，完成来源、撤权、冲突和原请求对账的定向验证。

---

以下以“**已批准任务由 offscreen 宿主执行，正常关闭 Side Panel 后继续**”为审议目标；普通手动任务是否纳入、是否要求跨 SW 重启继续，仍是范围假设。每项“修改”指**建议后续是否修改**，本次均未修改文件。以下是一次独立书面分析，不代表实际会议、多位专家或正式评分。

## 41–50：并发、升级与恢复

**41｜多入口竞争运行槽**  
正方：现有单槽限制可避免两个 Host 同时执行。反方：后台化会增加槽等待。证据：准入事务检查 `@slot`（[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:865)）。风险：并发请求被拒后误当可自动重试。**修改：按需改善等待提示；保留决策：沿用单槽，不新增独立队列。**

**42｜关闭 offscreen 与新准入竞争**  
正方：已有共享锁覆盖空闲检查和关闭。反方：新入口若绕过锁，仍有检查后关闭竞态。证据：[runner-lifecycle.js](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/runner-lifecycle.js:42)、[run-admission-lock.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/run-admission-lock.js:1)。风险：准入成功后宿主被关闭。**修改：新增入口必须接入原锁；保留决策：不以二次读槽替代锁。**

**43｜云控与 App Service 公平性**  
正方：runner 在两类请求间切换优先顺序。反方：这不证明所有异常与长任务下的等待时间有界。证据：[runner.js](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/runner.js:23)。风险：某类任务长期等待。**修改：先观测真实等待，再决定是否调整；保留决策：复用当前调度，不预建新调度器。**

**44｜取消与完成竞争**  
正方：取消先写 `cancelSeq` 和 `ownerEpoch`；结算读取围栏。反方：外部效果已发生时取消不代表撤销效果。证据：[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:1290)、[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:1328)。风险：把“已停止”误呈现为“无副作用”。**修改：状态展示按实际结果区分；保留决策：取消不自动重放或回滚。**

**45｜重复启动**  
正方：相同 admission 可识别为 duplicate，RunHost 不重新执行。反方：响应丢失时用户可能重复点击。证据：[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:845)、[run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:88)。风险：生成新 request ID 后形成新的业务请求。**修改：新入口需稳定传递原请求身份并显示原 Run；保留决策：duplicate 仅观察。**

**46｜升级期间源码固定**  
正方：运行读取准入回复中的固定源码和 revision。反方：后台任务可能跨越安装升级，授权仍须重新核对。证据：[run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:127)、[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:125)。风险：把新版本授权用于旧执行。**修改：新增入口沿用原固定与授权检查；保留决策：不静默替换运行中源码。**

**47｜开发热更新与运行冲突**  
正方：开发刷新前检查槽、日志和宿主确认。反方：某些 UNKNOWN 状态会延迟刷新。证据：[development/worker.js](/Users/shopme/Documents/workspace/opendesk-browser/src/development/worker.js:6)、[development/worker.js](/Users/shopme/Documents/workspace/opendesk-browser/src/development/worker.js:82)。风险：为及时更新而中断在途效果。**修改：新增后台入口应覆盖现有空闲检查；保留决策：未知效果保留日志，不强制刷新。**

**48｜SW 重启**  
正方：保守恢复能避免重放未知副作用。反方：即使 offscreen 存活，当前非终结 Run 仍变为 `paused_unknown`。证据：[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:1553)。风险：把“面板关闭后继续”误承诺成“SW 重启后继续”。**修改：若后者属于目标，需独立设计与验证；保留决策：现阶段不移除恢复围栏。**

**49｜宿主断连与消失**  
正方：代码区分文档仍存在、已消失和无法观察，并对消失的宿主走退役。反方：查询失败会降低可用性。证据：[broker.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/broker.js:69)、[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:1471)。风险：把观察失败当文档消失，错误释放资源。**修改：不建议改变现有保守判定；保留决策：未知保持隔离。**

**50｜结算响应丢失**  
正方：先查询原 Run/Result，避免盲目重复结算。反方：观察不到结果时仍不能推定未提交。证据：[run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:164)。风险：重复发起业务执行。**修改：新观察界面应暴露原 Run 和待核对状态；保留决策：只协调原结算，不重跑脚本。**

## 51–60：反方攻击、工程实施与评分

**51｜伪造 offscreen 宿主**  
正方：固定 URL、扩展身份及原生 `OFFSCREEN_DOCUMENT` 上下文构成准入依据。反方：仅比较消息自报 URL 不足。证据：[environment.js](/Users/shopme/Documents/workspace/opendesk-browser/src/environment.js:20)、[cloud-observer.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/cloud-observer.js:44)。风险：普通页面或沙箱冒充执行者。**修改：新增路由复用现有 sender 验证；保留决策：不信任载荷中的宿主身份。**

**52｜旧宿主接管攻击**  
正方：Run 绑定 registration、document、instance 和 session。反方：强制换宿主可改善可用性，却突破现有所有权。证据：[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:125)。风险：新旧 Worker 同时持有执行权。**修改：不实现运行中迁移；保留决策：开始前选定宿主。**

**53｜授权撤销后继续执行**  
正方：活动操作检查任务授权、云控授权及权限/文档 fence。反方：已派发效果仍可能发生。证据：[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:113)。风险：误认为撤权能撤回已提交动作。**修改：新增后台入口须保留逐操作检查和撤权测试；保留决策：失权立即围栏，未知效果单独报告。**

**54｜目标标签身份复用**  
正方：旧 session 的 owned target 无法证实时进入隔离。反方：隔离可能残留用户可见标签。证据：[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:1395)。风险：仅凭数字 tab ID 关闭无关页面。**修改：可提供核对入口；保留决策：不自动清理身份不明目标。**

**55｜把 UNKNOWN 当失败重试**  
正方：自动重试看似能恢复吞吐。反方：已派发操作可能已产生效果。证据：缺回执可记录 `effect_unknown`，未结效果禁止成功（[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:1253)、[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:1336)）。风险：重复提交或重复写入。**修改：仅增加可核对的状态呈现；保留决策：禁止自动重放。**

**56｜面板关闭清理顺序**  
正方：RunHost 尝试先发取消并等待结算。反方：面板调用 `sharedRunHost.dispose()` 后立即 dispose 注入的 client；异步收尾不能保证完成。证据：[tool-shell.js](/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool-shell.js:691)、[run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:264)。风险：可确认的中断变成未知。**修改：若仍支持面板宿主运行，应评估安全 drain；保留决策：不依赖 `pagehide` 异步完成作为唯一保障。**

**57｜新增普通后台运行入口**  
正方：准入前选择 offscreen 可让面板关闭与执行解耦。反方：现有 loop 只取云控及 App Service，普通请求没有已证实的同等后台交接路径。证据：[runner.js](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/runner.js:6)。风险：宽泛消息接口变成未授权执行入口。**修改：仅在普通任务属于目标时，设计最小受信交接；保留决策：继续使用原 Authority 和 RunHost。**

**58｜生命周期触发条件**  
正方：现有 lifecycle 根据云控启用或待处理 App Service 创建 runner。反方：普通后台任务若直接复用而不扩充生命周期依据，文档可能不存在或被关闭。证据：[runner-lifecycle.js](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/runner-lifecycle.js:17)。风险：请求有授权却无宿主，或空闲清理与请求竞争。**修改：如扩展入口，增加该入口的持久待处理依据并纳入同一锁与关闭检查；保留决策：不常驻第二宿主。**

**59｜验证范围**  
正方：现有原生测试脚本覆盖关闭面板后再执行云控任务的场景。反方：它不能单独证明运行途中关闭或 SW 重启连续执行；本次也未运行它。证据：[native-double-task.mjs](/Users/shopme/Documents/workspace/opendesk-browser/tests/cloud-control/native-double-task.mjs:180)、[native-double-task.mjs](/Users/shopme/Documents/workspace/opendesk-browser/tests/cloud-control/native-double-task.mjs:448)。风险：把脚本存在当作当前候选 PASS。**修改：实施后补当前范围的定向验证；保留决策：源码、自动测试和真实 Chrome 证据分别报告。**

**60｜评分与发布判断**  
正方：已有复用 RunHost、槽与保守恢复的可行基础。反方：缺少同候选“运行途中关面板”及相关失败场景证据，不能据源码给正式分数。证据：[run-host.js](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:21)、[controller-methods.js](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:1553)。风险：把设计可行当成用户流程已验收。**修改：先完成范围内证据；保留决策：正式评分 `NOT_SCORED`，未运行的原生场景 `NOT_TESTED`。**

总体取舍是：**正常关闭面板后的连续执行可沿现有 offscreen 路径推进；跨 SW 重启的透明续跑需要单独证明，不能以放宽 UNKNOWN 和宿主身份围栏换取可用性。** 本次为只读源码审议，未修改文件，也未新增运行验证。

