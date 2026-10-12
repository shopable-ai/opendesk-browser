## Summary

**独立复核结论：当前已审路径未发现新的、可由真实原生入口到达的 P0/P1 代码缺陷；正式关闭仍不可接受。** 实现审阅为 `WATCH`，交付为 `BLOCKED`：candidate-b 尚缺同身份原生证据，历史恢复仍保留 singleRun、interrupted/fenced、@slot held、noReceipt。

本次全程只读，未写文件、操作 Chrome、修改 Git 状态或派子代理；以下评分不替代 Native、F3 或 ZIP 验收。

## Analysis

| 重点 | 当前结论与证据 |
|---|---|
| 旧 credential 配对迁移 | 原 `/auth` 身份经 Provider/Executor、ticket、期限及当前配置校验后，仅补 pairing/requestKeys 映射；不改旧请求、Run 或 Result。[service.js:60](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:60)、[connection.js:17](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/connection.js:17) |
| 现代完整绑定、旧 epoch、同键异内容 | Browser 校验 assignment 全身份并保存 identity/digest；Provider 从认证 executor 和持久 assignment 校验绑定、attempt，并拒绝不同摘要。[service.js:239](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:239)、[provider.mjs:35](/Users/shopme/Documents/workspace/opendesk-browser/scripts/cloud-control/provider.mjs:35)、[provider.mjs:46](/Users/shopme/Documents/workspace/opendesk-browser/scripts/cloud-control/provider.mjs:46) |
| 持久 Permit、旧 Permit 不可覆盖 | 本机已有 Permit 时要求仍有效且与回应一致；legacy 仅剔除回应中新增的身份字段用于比较，不覆盖原 Permit。Provider 的 issued admission 快照与可续租 current Permit 分开，续租更新 current lease **不等于重写 issued 快照**。[service.js:256](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:256)、[provider.mjs:113](/Users/shopme/Documents/workspace/opendesk-browser/scripts/cloud-control/provider.mjs:113)、[provider.test.mjs:122](/Users/shopme/Documents/workspace/opendesk-browser/tests/cloud-control/provider.test.mjs:122) |
| remote 已有 RunRef、本机丢关联 | reconcile 收集 remote RunRef；cached claim 回程遇到已知 RunRef 拒绝重建。原 Authority 原子提交云关联、Run、pin、槽；RunHost 对 duplicate 禁止重放。[service.js:270](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:270)、[service.js:239](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:239)、[controller-methods.js:427](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:427)、[run-host.js:80](/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js:80) |
| 取消、撤权、迟到回程 | stop 失效 epoch、禁用配置并推进原取消栅栏；Permit/renew 回程重验。网站撤权同步失效云回程，原 Authority 持久标记结果不可交付；安装操作也失效云回程。[service.js:204](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:204)、[service.js:291](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:291)、[sw.js:61](/Users/shopme/Documents/workspace/opendesk-browser/src/sw.js:61)、[controller-methods.js:922](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:922)、[authority.js:292](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/authority.js:292) |
| Grant → Result 上传 → Receipt | 核验原 Result 的 tag、runId/resultId 和自身 revision.sourceHash；released 后提交 delivery intent，发送前再次检查网站、安装及 output 授权。Receipt 丢失补传原结果，不重执行。[service.js:297](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:297)、[service.js:312](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:312)、[k3-controller-authority.test.mjs:1592](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/k3-controller-authority.test.mjs:1592) |
| unknown 仅查原事实 | interrupted 加 unresolved journal，或 paused_unknown，才判 unknown；reconcile 保留事实并停止后续上传。原恢复返回 replayed=0，原退休跨 incarnation 保守拒绝。[service.js:279](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:279)、[controller-methods.js:940](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:940)、[controller-methods.js:823](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:823) |
| 事务／网络边界 | 原 Run/pin/@slot/云关联同事务；admission 在事务外，Permit 提交后才创建目标。IDB keepalive/request queue 明确支持 digest await，**没有据此要求存储重构的缺陷**。[controller-methods.js:395](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:395)、[controller-methods.js:451](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/controller-methods.js:451)、[idb.js:244](/Users/shopme/Documents/workspace/opendesk-browser/src/platform/storage/idb.js:244) |

上述为源码与已有组件材料支持的结论，不能升级成 candidate-b 原生 PASS。

## 可行动缺口与负向案例

1. **P1：当前候选原生闭环缺证据——验收缺口，不是已确认代码 bug。**  
   Mac 锁定记录明确未 seed 新 Job；新增 passive observation 也明确仅浏览器身份、`NOT_TESTED`。[native-ui-blocker.json:3](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/cloud-control-r14-final-20261012/native-ui-blocker.json:3)、[native-a-passive-targets.json:2](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/cloud-control-r14-final-20261012/native-a-passive-targets.json:2)  
   **任务：**由 leader 在最终 B 身份执行五 Gate。负向案例至少覆盖迟到 Permit、真实撤权发生于 pending→send、admission/receipt 丢响应、IDB 准入失败；通过条件为零非法新增 target/Worker/dispatch，保留原 Run/Result。

2. **P1：历史恢复未正式关闭——真实 BLOCKED，不能放宽栅栏。**  
   原证据为 1 Run/1 Result、interrupted/fenced、workerRetired=true、槽 held/releaseCount=0、Receipt=null。[historical-stability.json:10](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-stability-1791799143631.json:10)、[historical-recovery-summary.json:48](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/cloud-control-r14-final-20261012/historical-recovery-summary.json:48)  
   **任务：**保留 BLOCKED；只有原 owner/资源证据满足才能收口。负向案例：重连、重新打开 Host、Worker 已退均不得导致第二 Run、重新派发或假释放。

3. **P2：正式矩阵存在候选状态失真——文档缺陷。**  
   架构文档及合同入口仍写“尚未构建”，而 A 已双构建并明确被 B 替代。[cloud-control-r1.zh-CN.md:3](/Users/shopme/Documents/workspace/opendesk-browser/docs/architecture/browser-framework/cloud-control-r1.zh-CN.md:3)、[README.zh-CN.md:76](/Users/shopme/Documents/workspace/opendesk-browser/docs/contracts/execution-control/v0.2/README.zh-CN.md:76)、[candidate-a-build-identity.json:4](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/cloud-control-r14-final-20261012/candidate-a-build-identity.json:4)  
   **任务：**更新为“A BUILD_VERIFIED／superseded；B 构建中／待绑定”，保留最终候选未冻结的事实。负向案例：相同 HEAD 下 service SHA 改变，不能沿用 A 构建或旧原生 PASS。

**未造 bug 的边界：**组合 fixture 会直接设置本机行、Run 或 Permit；这些可以验证防御断言，但不足以证明该组合由原生事务产生。[browser-provider-integration.test.mjs:155](/Users/shopme/Documents/workspace/opendesk-browser/tests/cloud-control/browser-provider-integration.test.mjs:155)、[provider.test.mjs:198](/Users/shopme/Documents/workspace/opendesk-browser/tests/cloud-control/provider.test.mjs:198)。因此未把“仅丢 runId、waiting 行保留而 remote 已 admitted”等未经真实路径证明的组合列为产品 bug。

## 独立评分

评分针对当前 R1.4 的实现与可证明程度，**不是覆盖率或正式通过分**。

| 维度 | 分数 | 未达 95 的文件与任务 |
|---|---:|---|
| 架构 | **94** | 原 Authority/RunHost 边界正确；仍需同 B 候选验证 remote RunRef 缺关联拒绝、原单槽与本地模式独立性。定位：service:239/270、controller-methods:427、run-host:80。 |
| 安全 | **94** | 完整绑定及发送前授权检查成立；真实迟到回程、网站／安装撤权与零上传尚缺当前原生证据。定位：service:256/312、sw:61。 |
| 持久可靠性 | **90** | 原事务及结果补传路径有组件支持，但旧现场仍 fenced/held/noReceipt；B 的重启、真实回滚、丢响应恢复未闭环。定位：controller-methods:823/940、service:305/321。 |
| 可维护性 | **93** | owner 与唯一协议边界保留；正式矩阵落后于 A/B 事实，需同步候选状态及测试输入身份，避免日志跨版本复用。定位：架构文档:3、合同 README:76、candidate-a-build-identity:4。 |

正式 Provider、多租户数据库、Desktop/Mobile 是明确后续范围，**未将它们未实施计作本期代码 bug**。[cloud-control-r1.zh-CN.md:161](/Users/shopme/Documents/workspace/opendesk-browser/docs/architecture/browser-framework/cloud-control-r1.zh-CN.md:161)

## Root Cause 与交付条件

当前关闭障碍是**源码修复已推进，最终候选身份和原生验收尚未收敛**；历史现场则因旧 browser incarnation 无法证明 owned target 可安全回收而阻塞，不是缺少第二套 Run/DB/协议。

还缺：

- **CurrentCandidate：**完成 B 双构建、包身份／预算／校验，并绑定最终输入；A 不可替代。
- **Native：**同 B 身份五 Gate、真实撤权／取消／恢复／零副作用及产品入口验证。[GOAL:427](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prompts/goal-cloud-control-r14-final.zh-CN.md:427)
- **F3：**独立最终接受；本次静态评审和四维评分不能替代。
- **ZIP：**与已验收 dist 身份一致的安装验收。正式账本仍列两项未测。[cloud-control-r1.json:590](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/cloud-control-r1.json:590)

保留 R0.2 三独立 Executor；继续复用各端原事实、运行器和权限，不新增通用 Runtime、Run/Result 或数据库。[R0.2:19](/Users/shopme/Documents/workspace/opendesk/docs/architecture/execution-control-r02.zh-CN.md:19)

| 取舍 | 收益 | 代价 |
|---|---|---|
| 保留 unknown／退休栅栏 | 避免重放和误回收 | 原现场继续占槽、BLOCKED |
| 补同候选证据后关闭 | 身份与结论可追溯 | 当前无法宣告完成 |

## 评审身份

HEAD：`e859cf1942d2fc3dd70c4658052eecf51d60c68f`。前后复核以下文件均未漂移；核心源码与 candidate-b snapshot 一致。[candidate-b-snapshot.json:2](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/cloud-control-r14-final-20261012/candidate-b-snapshot.json:2)

```text
SHA-256                                                         文件
d04ce76166a89e2e7f4acea665e4228d676d3e110e90784359149a29d6b2439c src/cloud-control/service.js
af6f3774c2393af9c92594076eac73fe806955a1bc1e48dd1f78750210a9f614 src/cloud-control/connection.js
76484917249810a36e96d5a00b85af4658354474ee60d937b472ad5b99f8209d scripts/cloud-control/provider.mjs
67bbc9e3fc59282e3b61e8b5a480a47fbde1bd454bc791664bc850753e865136 src/platform/host/authority.js
6430389ee6fa2cd542af3aa5b8fee32aace4f1d6063229c266da147716a9244d src/platform/host/controller-methods.js
7e291c525a089836f4615903eb8143acae7bba6cbce702a8792c4b71c1fac34e src/run-host.js
268b95db3b5243931b3db791b9464cd4fe1888cfb6ac9052a4eef73e5f0daa90 src/scripting/sandbox/controller.js
f56ae7035722a4ae1c36e840146fd3aa670d532410de457f0630322dad8fc672 src/platform/storage/idb.js
18cb2dfe798a36cb4cea2ee60c9c0cb136bdcc5336e4937281f0961e119a9e73 src/platform/tasks/service.js
b9ffbcdf1c3c709ded896b0d2a8adae8560b7496f6dc011227b08db88b9b8c57 docs/architecture/browser-framework/cloud-control-r1.zh-CN.md
d977ea5552b522ea6020c939e78813049014dc011a3e4dc37cbd447eaf56291b docs/contracts/execution-control/v0.2/README.zh-CN.md
```

本次只读复核已完成；结果可由 leader 纳入证据，正式验收仍保持上述未测与阻塞状态。