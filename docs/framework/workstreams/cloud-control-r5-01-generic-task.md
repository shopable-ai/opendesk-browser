# Cloud Control R5.1 — Universal Installed Task Delivery

日期：2026-10-13。唯一写分支 main；禁止其他分支、Worktree、PR、破坏性 reset 和强推。

## 目标、架构与安全

本轮以真正修改源码为交付。原 Cloud R4 的 Provider 固定 sample.form-fill 和 Side Panel 单选限制已定位；原 Browser Host 的 cloudApprove({tasks})、Task resolver、Task authorization、Authority → RunHost → Worker、Run/Result、retirement 和 Provider permit/receipt 仍为唯一可信执行链路。

通用 Provider 只从管理员明确登记的不可变 manifest 清单读取 taskId/version/manifestHash/sourceHash/paramsSchema/siteOrigins；来自受信本地 CLI 的登记必须先完整校验 Task Package，仅向 Provider 传 manifest 与摘要，绝不上传或存储源码。Provider 与 CLI 现支持 register/tasks/seed，旧 seed:form 保持兼容。HTTP(S) 目标必须规范化并严格受网站 origin 限制；参数先按闭合 Schema 校验，同 requestKey 同内容复用原 Job，异内容报冲突。

云控原 Side Panel 区域显示所有已安装任务，其中未启用或未验证版本不可选择；每项显示版本、Source SHA-256、Manifest SHA-256、网站 scope 和安装代际。逐任务回传许可默认关闭，要求额外确认。Host 的批准阶段重新解析本地安装与固定身份；Claim、Resolve、permit、Worker 仍各用原可信边界，版本/代际/网站变更无法静默恢复原授权。

## 已完成的真实源码修改

- bf98690daf760d472895f5c447c365611f3e100e：scripts/cloud-control/task-registry.mjs、新版 provider.mjs、cli.mjs，固定身份登记、无源码交付、通用 Job、旧 Job/receipt 兼容迁移。
- 03ecb592130ca476567f24603a41b6d126921e8f：src/cloud-control/service.js，防重复审批、版本摘要、网站范围和安装代际核对；Browser 再校验云 Assignment URL 及 Resolve 安装来源。
- 5c34ffced54c53535cf44a737f29f3e24c5ed10f：src/ui/cloud-hosting.js、tool.html、tool-shell.css，Side Panel 多项已安装任务审批、逐 Task 回传许可、固定来源显示。
- 849ab2b901beab02b837f5d91fcd2477ed2ef4a9：tests/cloud-control/generic-delivery.test.mjs 和 generic-approval-ui.test.mjs。
- d0ad8ed119a22343be38dfa62a650199ce6872ba：examples/cloud-control/README.zh-CN.md 通用 CLI、安装与原生验收步骤。

两个不同 Task Package 来自 examples/tasks/form-fill.v1.opendesk-task.json 和 modern-search.v1.opendesk-task.json：表单提交与 Locator 搜索，taskId、sourceHash、参数 Schema 和网页效果各不相同。Provider HTTP/WebSocket 测试包括管理员身份、两个包登记、合法投递、请求冲突、非法 Origin、错误参数、摘要错配、错版本、拒绝源码、两份 Assignment/permit、丢失回执、重复回执、Provider 重启及恢复。

## 任务树与证据等级

- [x] 固定 manifest 本地管理员登记 / immutable Task pin — SOURCE_IMPLEMENTED
- [x] 多个已安装 Controller Task 的 Side Panel 选择、逐项结果许可 — SOURCE_IMPLEMENTED
- [x] 浏览器 Host 固定摘要/网站/安装代际二次授权 — SOURCE_IMPLEMENTED
- [x] Provider 通用合法 Task 投递 + requestKey 幂等 + 重启迁移 — SOURCE_IMPLEMENTED
- [x] 两个不同 Task 包的非模拟 Provider HTTP/WebSocket 与授权 UI 测试编写 — TESTS_ADDED / CI_PENDING
- [ ] 对应 SHA 的 npm run test:cloud、Authority 回归和 UI 组件结果 — CI_PENDING
- [ ] npm run check、production/development 双构建与 npm run verify — CI_PENDING
- [ ] 两个不同 Worker 在 Chrome 真实网页执行，保存原 RunId/ResultId、原始 Result.revision.sourceHash、retirement released、Provider receiptId — NATIVE_PENDING
- [ ] 已安装 Task 禁用/代际更换/升级/网站撤权/断线恢复，在原生 Chrome 中均未逃逸 — NATIVE_PENDING
- [ ] 用户 Mac Chrome 独立验收和 UI 响应式检查 — NATIVE_PENDING

不能用 Node 人工构造的 runRef 代替原 Worker/Result。旧 R4 Side Panel 关闭后的长期无人值守 Runner 和 Local/Cloud Scheduler FireId 融合仍 NOT_IMPLEMENTED，不能因通用投递已接线而提升其状态。

## 独立验收顺序及证据要求

1. 按 GitHub main 当前 HEAD 及受影响文件 SHA 核对输入；保留旧 R1-R4 receipt，不修改并行 Agent 的 Profile、Provider state、43111/43112、dist 或数据库。
2. npm run test:cloud；node --test tests/framework/k3-controller-authority.test.mjs；node --test tests/environment/cloud-hosting-r3.test.mjs。记下真实 PASS/FAIL 和对应 commit SHA，不复用其他候选掩盖新变更。
3. 在安全隔离 CI 上执行 npm run check、npm run build、npm run build:dev、npm run verify。只有同 SHA 成功才填 BUILD_VERIFIED。
4. 获得 Mac 或隔离 Chrome 独占资源后，安装并本地实际验证 form-fill 和 modern-search，Side Panel 分别批准且勾选必要网站范围，逐项投递并见证真实网页操作。
5. 每个 Job 保存 jobId、assignmentId、requestId、固定 Task manifestHash/sourceHash、installationId/generation、runId、resultId、Worker 结果、退休 released 与 Provider receiptId；断开重启后检查不重新执行已完成网页副作用。
6. 分别撤销结果权限、网站权限、停用任务、升级并改变授权代际，确认新投递拒绝与已有 Run fence；副作用未知保持 OUTCOME_UNKNOWN。
7. 缺少任何原生证据时明确 NATIVE_PENDING，不伪造原始 Run/Result/receipt。正式 Mac Gate 4、F3/ZIP 是独立验收。

## 运行与协作限制

GitHub main 在本轮由其他 Agent 并行提交更新。修改只针对 Cloud 所属文件与本工作流文档，每次远端推送均基于即时读取的当前 main 与预期 ref，不进行 force/reset，不修改已保留旧证据。没有本地 Mac 文件系统、Chrome Profile 或真实 Provider 资源使用权，因此原生项维持 NATIVE_PENDING。


## R5.1.1 · 授权代际 UI 修复与 CI 链接

- `05f3fc8f5a9220b237adb57e6052c3615f753d8e`：只在已认证 Side Panel cloudStatus 携带已批准 Task 安装身份与代际；只读 Observer 仍脱敏。
- `539bb35c05bc44aabdd501dadb18bc4fcef56fec`：当前授权可见状态核对安装 ID / generation，附逐任务固定参数 Schema 名称、类型、必填描述。
- `c3356edd26092aac2470594076e42dd4ef63befc`：UI 测试覆盖同版本但代际更换后的过期批准与参数展示。
- [Cloud 组件 + 双构建 CI #38291579062](https://github.com/shopable-ai/opendesk-browser/actions/runs/38291579062)，绑定源码 SHA `c3356edd26092aac2470594076e42dd4ef63befc`。观察时仍为 queued，不能记录通过数量、packageHash 或误称 Native Chrome PASS。
- Node HTTP/WebSocket 任务测试中的 runRef 是人工协议模拟，不能替代真实 Worker 的 RunId、ResultId、retirement released、Provider receipt。


## R5.1.2 · 参数约束完整展示

- `ae5e765fe743ee7396f752702880ed0a26de5d32`：云控任务卡增加可展开的完整参数 Schema（含默认值、enum、长度及数值范围），避免只显示参数名称导致审批内容不透明。
- `c814449e08d45baef40bee5439017551b42408a5`：沿用现有设计变量，为窄 Side Panel 提供自动换行、限制高度和滚动容器。
- [最新受影响源码专项 CI #38291915410](https://github.com/shopable-ai/opendesk-browser/actions/runs/38291915410)，对应 SHA `c814449e08d45baef40bee5439017551b42408a5`；查询时 queued，组件/双构建结果均 **CI_PENDING**，不能填写 PASS 数字或原生证据。
