K1 的 round4 2s 合同仍生效，STOP/DEADLINE 保留 FAIL。下列为作者的定向观察，不是新审批候选、F1 独立验收或产品迁移通过。round5 3s 提案未获 release，未作为 status 门禁。

现 fixture / classic Blob Worker 路径保持不变；未创建新后台或使用特权用户 eval。限定修改 run-native.mjs、run.mjs、fixture/{host.js,sandbox.html,sw.js,worker-harness.js}。改动涉及精确扩展识别、held 前绑定真实 Worker 自身 Blob/name/null-origin 身份、私有通道 fencing、实际 DOM 等待取消、真实 loader 资源观察、有限 CSP observer、owned/borrowed 生命周期。共享浏览器、公用 gates、产品 src 和旧 evidence 均未写入。

20:20 的同源码完整矩阵（源 hash 76149b470fe3d1500bb08020550c7991e3e6c899f4bf8556cf23e687d922a1fb）在 138/154 均为 41 PASS / 2 FAIL，按 status 统计，无 fixtureFailure。完整 BaseAlice / 值和错误 / 私有通道 / CSP 服务器归因 / 20 次资源循环 / SW 和 host 重连已跑；两个 FAIL 均为真实无限 loop 的 2s 物理停止门禁。

20:24 定向源码 ff0c796fd5511ab83d0834a8575653e3d8c5e20a2e52de231ce2709e4a650bd5 增加实际 entered 和停止后 CPU 采样。138/154 STOP、DEADLINE 原始 status 与 old2sContractStatus 仍为 FAIL，targetDestroyed 分别 2003/2003ms 与 2002/2004ms；150ms early CPU 仍增长。2.159–2.254s 的末段 CPU 分别为 0（renderer 已消失）和 0.000071/0（renderer 留存但静止）。这些是 proposed-bound-observation，没有 approved PASS。Host-close 分别 10/14ms，真实 PASS。loop Worker 创建前至销毁全程无 Worker 或 creator sandbox inspector 附着；held 私有握手在执行前验证真实 location.href/name/origin，再把单一新原生 empty-URL target 和 run/Blob/host 关联，原始关联方法与所有候选留在报告。该关联是否足够由独立 reviewer 判定。

MAIN 定向双版均 PASS：固定 MAIN callback 发出的唯一服务器 POST entered 标记携带真实 documentURL，继而 native renderer CPU 增长 0.146685s / 0.150442s，才退休 owned tab。借用的 sentinel 明确 owned=false，retire 被拒绝，dispose 后仍存在；最后由创建它的 runner 回收。仅证明受控 owned-tab 退休，不声称 MAIN while(true) 被 Worker.terminate 打断。

旧错误诊断保持原样：19:40 启动缺 endpoint 的 owned 进程组已由本 lane 回收；20:16 的 154 完整矩阵之后额外 form 初始化超时已保留，后续取消了不属于合同验证的额外初始化，20:20 双版完成清理。现 profile 均独立，浏览器 exit0，serverClosed=true、CDP waiters0；disposed pending/timer/port/frame/pageWaits/resourceReplies 均0。

待主执行正式 release 后才用有效合同跑同一最终源码双版完整矩阵，并交付最终 evidence manifest/hash。不得据此置 backend/F2=true。
