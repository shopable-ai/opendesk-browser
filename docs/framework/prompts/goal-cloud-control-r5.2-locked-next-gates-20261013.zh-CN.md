# GOAL：OpenDesk Browser Cloud Control R5.2 — LOCKED EXECUTION NEXT

日期：2026-10-13，默认中文。仓库：https://github.com/shopable-ai/opendesk-browser 。本机 Mac：`/Users/shopme/Documents/workspace/opendesk-browser`。默认唯一可写分支：`main`。

**IMPLEMENTATION FIRST / NO REDESIGN / NATIVE EVIDENCE REQUIRED**

## 1. 不重新讨论架构：先读唯一文档

- `AGENTS.md` 和 `docs/framework/parallel-development.md`：最新 main-only、按文件隔离和测试资源独占。
- **唯一完整产品功能树**：`docs/architecture/browser-framework/cloud-control-r5.2-complete-function-tree.zh-CN.md`（10 域、110 项 = 98 业务功能+12 质量/部署，已有 UI 39 项叠加不重复计数）。
- **机器功能矩阵**：`docs/framework/workstreams/cloud-control-r5-02-function-matrix.json`。
- **唯一执行手册**：`docs/framework/cloud-control-r5.2-execution-manual.zh-CN.md`（7 Gate、30 工程任务包）。
- **Provider 27 条 HTTP / Host 10 个可信 RPC 合同**：`docs/architecture/browser-framework/cloud-control-r5.2-interface-security-contract.zh-CN.md`。
- **UI 39 项与唯一 HTML**：`docs/architecture/browser-framework/cloud-control-r5.2-ui-preview-contract.zh-CN.md`、`examples/ui/cloud-control-r5.2-preview.html`。
- **事实和评分**：`docs/framework/workstreams/cloud-control-r5-02-product-closure.{md,json}`，`docs/framework/workstreams/cloud-control-r5-02-expert-scorecard.json`。
- 用户操作 `examples/cloud-control/README.zh-CN.md`。

**上述选择已确定**：唯一本地 Task Installer/Resolver、Controller Authority/RunHost/Worker、Cloud Provider/Service/History Index；Executor+Pairing+Grant+固定 Task Pin，status-only receipt 与独立结果内容许可。禁止第二套执行器/权限 DB、远端任意 JS/Shell/CDP、隐式新 Runner。

## 2. 最新 P0 事实

- R5.2.4 CI `#38379208965` 对应源码 `7aff8bd27e258022cdf186019409dcc07fdee719` 已完成但 **FAIL**：Cloud **45/45 PASS**；Controller Authority 运行到 **105 PASS** 后 Node 约 4GB OOM/SIGABRT；包 CI `#38379209138` 是 CANCELLED，不算 PASS/FAIL，也无同候选 PackageHash。
- 已定位测试替身 `tests/framework/k3-controller-authority.test.mjs` 在模拟 admission 时把 `cloudStop()` 递归响应 `/v1/suspend`，修复提交 `90e1651eeb2ad364e4ced4fc44e9d155ddcfc708`；Cloud workflow 触发补丁 `6b510c5185833c16fae459345834f78e4f26e415`。**先核查新 SHA 的 CI 真正通过**，不要用修改日志代替测试，也不要粗暴增加 heap。
- 方案静态初评约 **86/100**，只是技术方案单人初评。15 项正式 `DESIGN_SCORE`、`IMPLEMENTATION_SCORE`、`VERIFICATION_SCORE` 仍 `NOT_VERIFIED`，没有整体 95+。
- **没有**两个真实已安装 Task 的原始 Chrome Worker→RunId/ResultId/retirement/receiptId；UI 仅有 39 项 HTML 预览的静态浏览器 30 样本；无已批准互联网部署。分别 `NATIVE_PENDING` 和 `REMOTE_NATIVE_PENDING`。

## 3. 连续实施，不以再次写 GOAL 结束

按 `cloud-control-r5.2-execution-manual.zh-CN.md` G0→G6 执行。实际优先次序：

1. **G0**：核对最新 main 和各相关 blob SHA，验证 K3 OOM 已真正消失；根据变化执行 `npm run test:cloud`、`node --test tests/framework/k3-controller-authority.test.mjs`、Cloud/Side Panel 测试。固定一个候选核对 `npm run check/build/build:dev/verify`，记录生产/开发 PackageHash，**不提高固定 512KiB 入口预算**。
2. **G1**：验证 Browser/Client 双层授权、Executor A/B 同 Task 严格隔离、Client token 一次性授予/撤销、RunRef/ResultId/receiptKey 和 Status-only 保护，保留拒绝性用例原件。
3. **G2**：在**已合法交接/独占**的真实 Mac CFT 中分别验证安装并批准 `sample.form-fill@1.0.0` 与 `sample.modern-search@1.0.0`，由指定外部 Client 投递到目标 Executor，实际执行两种不同网页操作，并保存两套真实 Run/Result/Worker/retirement/Provider receipt 身份。禁止使用 Node 构造的 runRef 或改名当作真实运行。
4. **G3**：以真实 `#workbench-cloud` 为生产唯一入口，将 HTML Preview 中待迁的 Connect/Manage/Review/Task Detail/History 二级视图按 R27/R28 增量落实，完成真正 300/320/360/420/520 CSS px、125%/200% Chrome Zoom、键盘/ARIA/长 Origin/Unknown/Stop 可视化验收。
5. **G4**：本机 TLS HTTPS/WSS + scoped Client 真机链路；只有用户批准真实公网部署环境后，才做跨设备公网 end-to-end。否则 `REMOTE_NATIVE_PENDING`，不得谎报完成。
6. **G5**：Provider/Chrome/SW/WS 重启、Stop/Unpair/网站授权撤销、重复 requestKey、Admission/Receipt 丢包及未知网页副作用恢复，不得盲目重放。
7. **G6**：15 维独立评分，各自目标 ≥95、任何 P0 未关闭不能整体通过；回写工作流和机器功能矩阵、真实 CI/SHA/PackageHash/Chrome 原始收据。

禁止创建非 main 分支/worktree/PR、覆盖其他 Agent 的 Git 或 Chrome 资源、强推/破坏性 reset；安全的独立文件编辑可依最新并行协议继续。普通 UI 操作不要求用户自己编写 JS 或操作 CLI。

## 4. 最终报告格式

必须优先用普通中文解释：Cloud 现在真实能做什么、怎样安装/授权/投递/停止、可信公网是否实际可用。给出**110 项功能域情况、7 Gate/30 任务包状态、同 SHA CI/包哈希、原生双 Task 证据、Executor 隔离与隐私结果、真实 Side Panel UI、十五维评分及剩余阻断**。未验证就准确写 `NOT_VERIFIED`，不以规划或新 GOAL 冒充源码交付。
