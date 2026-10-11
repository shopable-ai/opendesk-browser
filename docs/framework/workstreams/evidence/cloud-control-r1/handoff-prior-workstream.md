# Cloud Control R1.1 工作记录

2026-10-11，main 本地实施。起点 60ed45f35499b6ab445c2284e862aa8b980ab009；origin/main 27725032340c2cbffc9074f10bfb7be9342394d6。现有其他任务差异保留，不合并或重置分叉主干。

状态：IN_PROGRESS。源码缺口：无云模块、持久提供者和可用命令；原 prepareControllerRun 事务后立即 createOwned。

实施：scripts/cloud-control 提供者及 CLI；src/cloud-control 连接、授权与持久请求；原 controller-methods/authority/broker/client/RunHost 接线；我的任务托管 UI。
通过条件：先持久绑定原 runs/@slot 与云请求，再登记同一 runRef、保存许可、复核授权后创建目标，原 Worker/Result/retirement 闭环。无 Host 等待；未知副作用禁止重跑。

验证：先定向消费者/原 controller/task/recovery，收敛后 check、双构建、verify，专属 CFT/profile 执行 Gate1-4。原示例 Task 字节/版本/摘要不改。
资源：43112 启动前已检查无监听；43111、dist、Chrome profile 仍待核对，不抢其他会话资源。只读子 Agent 检查原生驱动和 mac24dev API，不并行写入。

SOURCE_CONFIRMED 起点；COMPONENT_TESTED、BUILD_VERIFIED、NATIVE_VERIFIED 尚未取得。

2026-10-11 实施 checkpoint：新增原生云连接固定 classic 入口，避免 SW 直接包含委托。源码检查 419 文件通过；定向 111/111（原 controller/recovery/task flow + 真实 Node 提供者）。失败初稿日志保留，最终日志 targeted-final.tap。下一步在当前 main 源码的独立验收快照输出构建，避免 root dist 与 Time Review 串行占用冲突；快照不建 Git 分支/worktree，不编辑产品源码。当前没有占用 root dist。

资源交接：本次 Chrome 原生输入已停止，Mac 前台已释放给 Time Review；本次 PID 47253 与独立 profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-8k3m3gr2` 保留，不关闭其他任务浏览器。root dist 仍由 Time Review 占用；本次构建在 `.runtime/cloud-control-r1/candidate` 输出。43112 提供者为本次独占，43111 复用既有只读示例服务器。

预算修正：用户明确允许适当提高生产 SW 容量，改为 384 KiB 硬上限、320 KiB 提醒线。固定 classic 云入口保留，CSP、权限和远程代码限制不变。此前 320 KiB 候选仍独立保留，不重写旧证据。

资源失误（保留失败证据）：UTC 14:20–14:21 一次生产构建误用了 root cwd/43122 guard，已在 WXT [26/27] 处 SIGINT；root dist/production 部分文件可能被写入，不能继续声明全程未写root dist。已向获授权协调的 Time Review 报告，要求核对其冻结候选并使受影响时段证据失效。没有擅自恢复/覆盖其产物。后续命令显式校验快照cwd。

验证收敛：安全修复后定向119/119通过（targeted-capacity-retry.tap），此前真实ENOSPC失败保留（targeted-final-security.tap）。仅去重本次快照依赖，释放158021210字节。check422文件；预算12/12。独立生产packageHash44c6cfa5b937f0a84b5226e82181357494a886a314b0f7eb21cdeb937955f7a1，SW324237字节；开发6d49dbc069e153a1a909cc3ec65a03e1f68c79a333f00aac58bf47cb1e690146，SW324403；双包verify通过。Gate1–4仍NOT_TESTED，不借用Time Review原生证据。Time Review确认其独立不可变副本未受root误构建影响。
