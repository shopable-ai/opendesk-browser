# Round-5 独立 Architect 方案审批

**96/100，APPROVE，0 blockers。** 审批对象为执行方案修订候选 `a9c47c0e20d8bb5710fead199fc197ac98d3bc098dc3d96f2a719ed50b50651b`；非 F1 功能评分。此结论仅完成 Architect 这一环，同哈希独立 Critic 批准前修订仍未生效。

24 个候选文件及 18 个历史引用的 SHA256/字节数全部匹配。round-4 manifest 为 `dd50a5098d247f594ab2234b9946c0004ce427ea8d6cb1abd130931c3bcecda1`；18 个历史引用记录逐项相同。20 个文件内容完全相同，其余只有 execution-plan 追加说明、test-spec 与 f1-cases 的同一 expected 字段、一个新原生诊断附件。两 JSON 递归比较各只有一个叶字段变化；全部 603 cases、12 F1 contracts、触发 stop/deadline/host close、72 来源、48 API、191 处置/184 正能力、权限、浏览器范围及后端均保留。完整逐文件校验在 [architect.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-5/architect.json)。

[计划第100行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-5/candidate/execution-plan.md:100) 与 [F1 expected](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-5/candidate/stage0/f1-cases.json:103) 将实际 host 触发至精确 Worker 执行停止且 target 销毁的窗口由 2000ms 改为 3000ms。新窗口仍要求准入立即关闭、真实初始 CPU 增长、独立后续静止、host 可响应及无 late action；超过 3s 或身份关联不足仍 FAIL。1s 余量是固定测试界，不能等待观察者返回后重新起算。

[v5 第277行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prompts/goal-migration-v5.txt:277) 要求真实死循环终止，[第336行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prompts/goal-migration-v5.txt:336) 保留准入/已发副作用与 MAIN 边界，本身没有数值 2s SLO。但 [历史 EX03 引文](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/migration-execution-v5/round-5/candidate/test-spec-v5.json:372) 确实已有默认 2s 原型验收上限。因此此项是明确的合同时间界修订，不能声称旧界没有历史来源。当前修订显式覆盖该原型数值要求，保留历史原文及旧 FAIL；没有缩减用户 body、停止触发、安全机制或支持版本。

已独立下载核实官方 Chromium 两个精确 tag：[138 原生源码](https://raw.githubusercontent.com/chromium/chromium/refs/tags/138.0.7204.183/third_party/blink/renderer/core/workers/worker_thread.cc)、[154 原生源码](https://raw.githubusercontent.com/chromium/chromium/refs/tags/154.0.8037.92/third_party/blink/renderer/core/workers/worker_thread.cc)。原始文件物理行分别为 82/84，常量为 2s；constructor 522/504 将常量赋给终止延迟，Terminate 262/265 调用排期，Schedule 532/514 使用父线程延迟任务，Ensure 568/551 最终调用 V8 TerminateExecution。下载文件 SHA 分别为 `7c989d222ed648eaf8650b7ce2f3d9ec4ab5b83e739ccb6788d7d667c5d0961e`、`f5e2a985450beea9dde7c0045654f789e22c38c43339c83292c364b1431e3a84`。候选元数据 78/80 是非阻断的行号误差，本报告使用物理行。TerminateForTesting 的同步强制路径是内部测试入口，不能作为当前普通 Worker 后端的可执行绕过方案。

独立复读 OS 诊断与 driver，哈希均符合附件；诊断 harness hash 与历史 20:06 source manifest 一致。控制作者当前 harness 已变化，不能把诊断当新候选证据。driver 没有 CDP 客户端/Debugger attachment；存在 remote-debugging-port 启动参数。renderer 70456 在触发后 1.9252s CPU=2.95，2.0759s=3.06，之后至 3.0089s 保持 3.06。它支持 terminate 返回后真实执行继续、随后停止的机制解释；采样粗糙且没有精确 Worker/PID 因果绑定，故约 2.08s 平台不是精确停止时间，也不构成 F1 通过。19:57 与 20:06 STOP/DEADLINE 仍为 FAIL，20:06 OWNED-MAIN/borrowed FAIL 也保留。

最强反例是观察到另一个 renderer 静止，旧 Worker 仍继续循环。最高 CPU 增量大于 0.1、单次零 CPU、缺失样本置零或 eventual target 消失，均不能满足新合同。后续 F1 必须绑定精确 run/Blob/host 归属与执行进程/线程，记录原始触发和采样请求/响应时间，证明持续实停及 target 销毁均在 3s 内。host-close 的快速退出不能代替 stop/deadline；不能关闭借用页面，不能增加特权 Debugger、权限或后端。

这项修订使选定原生机制有可满足的有限门禁和清晰试验形状，因此批准方案。扣分体现出处行号精度及实现中的时钟/采样细节尚须 F1 验证；不要求本阶段已有产品 F2 文件或全 F1 通过。独立 F1 页面复核仍为 **BLOCK**：两版本、两 world 中真实 Allow User Scripts OFF→ON 会接收旧结果，原用例调用 recheck 写入 fence 遮蔽此缺口。修订不会解除该问题。最终两 lane union hash 尚未提供，backendPrototypePassed/allF1PASS/F2/F3 均未获批准。
