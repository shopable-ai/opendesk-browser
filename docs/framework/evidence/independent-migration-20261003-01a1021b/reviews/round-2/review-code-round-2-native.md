**APPROVE（实施前方案），97/100，无方案 blocker。** 本评审通过；整体开修仍须另一独立评审也达到 ≥95 且无方案 blocker。这不是产品完成或 F3 通过证明。

revision2 [candidate manifest](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-migration-20261003-01a1021b/bounded-review-candidate.json) SHA-256 已核实：

`b627dfc35912e0d61530168963cc1e1960faee40a6deb050f8f174ae7b11249f`

五个绑定文件的字节数、哈希全部匹配；receipt 哈希未变，未重复完整读取。两个固定资源当前 bytes/SHA 也与方案一致。

| 评分项 | 得分 | 独立结论及扣分事实 |
|---|---:|---|
| 真实代码对应 | **24/25** | 两处符号、dispatcher 无消费者、formatJSON/Worker/wrapAsync 的区别已准确修正。扣1分：**MD 与 JSON 的合同 case ID 不一致**，详见下文。 |
| 类库与实际加载 | **20/20** | 固定 relay→MAIN 加载、两资源名单、组合 bundle 与旧资源别名的区别明确；必要第三方策略继续符合原 consumer-only 条件。 |
| 普通 JS、SDK 行为保留及缺口处理 | **24/25** | 四服务已有可执行接口、准入、授权、驱动、持久回执及生命周期接点。扣1分：日志只输出安全元数据，合法 message/data 正文也不再输出，属于真实兼容损失；方案已明确披露和处理，不是假称完全等价。 |
| 最终包与验收证据 | **19/20** | 派生清单、strict assets、重新绑定包哈希、四服务逐项断言及旧 ABI/重注入测试均已安排。扣1分：日志断言仍偏重“不泄密”，未明确验证安全投影本身的正确输出。 |
| 顺序协作 | **10/10** | 已落实双评后原 writer 先框架及必要资源、组件检查、串行构建，再独立 native 复验；产品写权、旧 Goal 和旧 PASS 失效边界清楚。 |
| **总分** | **97/100** | **无方案 blocker** |

上一轮四服务方案缺口已经实质补齐：

- **旧接口与回包**：[方案第9行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-migration-20261003-01a1021b/four-service-targeted-fix.md:9) 保留 `bridge.send` 的 `{data}` 层，与旧消费者 [108行](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/my-content-script.ts:108)、[129行](/Users/shopme/Documents/workspace/todo-user-vue/src-bex/my-content-script.ts:129)一致，没有新增全局 bridge 或第二 transport。
- **唯一准入与可信执行**：[第11–13行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-migration-20261003-01a1021b/four-service-targeted-fix.md:11) 保留实际18个 SDK 方法，提出统一 `ADMITTED_METHODS`，覆盖 Hello、授权、UI 和 admission；明确包资源不能进入现有 HTTP URL 授权分支，并安排 pre-dispatch、receipt、可信 clock/runtime。
- **资源及行为断言**：[第17–20行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-migration-20261003-01a1021b/four-service-targeted-fix.md:17) 限定两资源及七个旧别名，规定新包派生哈希、越界拒绝、零外部 HTTP、原 Promise 形状和 `0/undefined` 保留。新增文件和符号明确是提案。
- **ABI 与顺序**：[第26–29行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-migration-20261003-01a1021b/four-service-targeted-fix.md:26) 补上参数不能先丢弃、旧 ABI 必须拒绝、新包重复注入及旧 Hello 清理约束，实施顺序符合最新优先级。

原 writer 应一并处理以下非阻塞修正：

1. [MD第39行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-migration-20261003-01a1021b/actual-code-map.md:39) 写成了 `RESOURCE01.F021.requestResourceByBridge`；[JSON第2663行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-migration-20261003-01a1021b/actual-code-map.json:2663)正确保留冻结 ID `RESOURCE01.F021.getResourceByUrl`。**实际符号保留新纠正名称，合同 ID 保留原名称**，不要新增或改名合同 case。
2. [日志方案第15行](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-migration-20261003-01a1021b/four-service-targeted-fix.md:15)的安全投影应作为兼容差异持续记录，不能验收为旧日志正文完整保留。
3. 给[第20行日志断言](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/independent-migration-20261003-01a1021b/four-service-targeted-fix.md:20)补上：固定事件名、message 的 **UTF-8 字节数**、data 项数准确，成功确实提交一次 sink 并保存 own `undefined` 回执。这样同时证明正向日志能力与安全限制。

本轮只读核实，没有修改文件、构建或启动浏览器；`NOT_TESTED/F3=false` 继续作为透明基线，未因此要求先实现才能评分。
