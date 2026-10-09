# Page 脚本生命周期 R1

状态：修复独立审查发现的边界，尚未通过最终候选的真实 Chrome 验收。

基线：43dae9809c61d13cceeab07fddf413cd8398b8b0。复用 R1 native-12 的本地 MCP/Controller/Page 预览证据；不提升为 Installed、F3 或 ZIP 验收。保留 main 四个页签。

现有缺口：Page Candidate 已持久化，但没有 Page 类型验证、安装授权、自动执行、停用和重启协调。Task 的安装服务与 Controller 回执不能冒充 Page 证据。

实施：保留不可变 Candidate，使用现有 frameworkKV 保存精确验证与安装授权。Chrome 注册的固定引导代码仅唤醒已授权安装；实际用户代码继续经过现有 USER_SCRIPT 编译、世界探测和共享 Authority 准入。引导消息不能调用 Host/SDK/MCP 方法，不能提供源码或执行目标；目标来自真实 Chrome sender，并通过原生同文档引导标记核对。每个安装与 document 只准入一次，未知效果保留栅栏，不自动重放。

操作：保存 → 对冻结版本明确验证 → 安装并批准匹配网站 → 新文档自动执行。停用先撤销持久授权再协调原生注册；已发生的网页效果与非受管监听器需要刷新，不宣称回滚。重启恢复只协调注册，不主动重放旧文档。

通过条件：真实 Sidebar 输入/点击、精确 Candidate/sourceHash、原生注册、新 document 自动效果、停用后不执行、同 profile 整 Chrome 重启后的启用/停用状态；组件测试不能替代原生证据。

资源：独立附着工作区 local-npm-cache-r1-01a12158，分支 agent/page-lifecycle-r1-01a12158，专属 dist/evidence/profile/bundle；未启动 Chrome，不占用他人 43111、R12.1 Native 实例或 R1 MCP anchor。

范围：顶层 HTTP(S) 文档，复用 classic-userscript/async-main 与审核依赖锁；不新增 GM、调度、市场、UI 框架、权限系统或数据库。不发布 release/npm。

阶段证据 native-01：真实 Mac CFT 156.0.8078.4，独立 bundle com.opendesk.pagelifecycle.a12158.chrome、PID 31985；通过真实 Sidebar 输入与点击完成 async-main A 和 classic B 的保存、冻结验证、明确安装、同页不重放、新 document 自动执行、实际失败读回与停用。原始记录在 evidence/page-lifecycle-r1-01a12158/native-01，不能提升为修复后候选的 PASS；完整浏览器重启为 NOT_TESTED。cleanup.json 确认自己的进程退出、临时 profile 删除、无残留。43111 是已有标准测试页服务，只读复用，没有启动或停止。

独立审查阻断：最终派发与停用竞态、loading 文档时序，以及后台中断后的持久回执/slot 恢复；另有选择其他 Candidate 版本时启用权限范围错误。已修复为共同派发顺序、安装只允许 document_idle、内部精确 loading 文档校验、prepared/dispatched 与 session/nonce/原 slot 关联、启动后未知状态可见且不重放。仅 Chrome getFrame 对原始 documentId 确认文档不存在，才可释放匹配旧 reservation；扩展会话重置、BFCache 存活和观察失败均保留栅栏；不同 Controller slot 保留。权限请求采用实际安装冻结版本的 pageRules。定向组件测试 83/83 通过；独立复审及最终 native-02 待完成。

最新 main faabff83 已整合，包含已有开发热更新和 Native provider；Page 引导复用其 held/pendingFoundation 空闲互锁。552 项组件检查在整合前通过；整合后候选重新构建与验收，未用普通 Chrome 原生测试配置冒充 CFT。

最终产品候选 f1f0d386（基于 main faabff83）：独立静态架构复审 ACCEPT/CLEAR，不能提升为原生验收。source check 通过；全组件检查 562 项中 561 PASS、1 SKIP、0 FAIL，另排除需要独立真实 Chrome 配置的 native-agent-chrome-real.test.mjs，两类证据不互相替代。开发包 packageHash 4843c5741d249653ce3d8aefff868bccdf1ad8cf69287c54393a9c6e1ecb7cf7；生产包 c9e17265802cd275799ba20b0d1fe5f15ca779a14cbea02d91a8ffd9395a80c3，均通过 MV3 包校验。原始检查与源码/产物指纹在 final-checks、final-builds。

native-02 已由受控 launcher 启动独立 CFT（PID 59640），但首次原生 UI 调用报告 Mac 锁屏，尚未发生 Sidebar 输入或点击。只读 baseline 不是操作验收，保存为 NOT_TESTED。已请求用户手动解锁；不以 CDP/DOM 模拟替代。最终自动执行/停用/完整重启/执行中断恢复仍未关闭，保持 Draft，不合并到 main。

Draft PR：https://github.com/shopable-ai/opendesk-browser/pull/59。native-02 锁屏后已通过自己的 stdin stop 正常退出：cleanupStatus PASS、浏览器 PID 已退出、临时 profile 已删除、无残留。没有占用其他 Chrome profile、MCP 实例或测试页服务；解锁后须用新的独立 session 继续验收，保留 native-02 的 NOT_TESTED 和原始清理记录。
