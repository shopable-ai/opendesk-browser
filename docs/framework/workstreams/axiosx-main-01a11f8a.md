# axiosx main 续接：复用调用证据与两项受影响验证

2026-10-09，在 main 完成；本地与 `git ls-remote origin refs/heads/main` 均为 `b8cfc1f597ae1578e790f1b7fee89fb8aa1fcce9`。保留上一轮四文件补丁，没有新分支/worktree、产品改动、commit/push/release。

本轮没有从头验收。先核对输入与原始记录，再只补两个直接受错误回传影响的组合用例。

```text
axiosx 调用链 [本轮范围闭环；正式框架验收未关闭]
  注入 [REUSE_RECORDED_PASS] MAIN 真实批准 SDK；Worker 独立参数注入
  请求 [REUSE_RECORDED_PASS] 各自原生 GET/POST 与 404/429/500；未重跑
  后台 [REUSE_RECORDED_PASS] 最终各 5 次调用；Worker 每个操作一次 submission、一次 receipt
  回传 [REUSE_RECORDED_PASS] 首次/持久 E_HTTP 正文与 bounded Worker cause
    等待回传时 Stop [新增组件 PASS] 信号中止；晚到错误零 reply；pending/ownedFrames 清零
  持久结果 [REUSE_RECORDED_PASS] 原始 run/result 身份、revision/sourceHash 与 retirement released
    持久错误后 recover [新增组件 PASS] cause/receipt 保留；旧请求 E_CANCELLED；无再次 HTTP dispatch
    同请求真实原生恢复 [NOT_TESTED] 不用组件结果提升此等级
```

## 复用依据

[只读复用核对](../evidence/axiosx-main-01a11f8a/reuse-review.json) 在新增测试前记录：140 个源码输入一致；原四文件 diff 与 `main-fix.patch` 逐字节一致；两份原始清单共 74 个文件哈希/字节数一致；最终包 40 个文件与构建报告一致，按现有配方复算 packageHash 为 `69bb1a3111e1c38e6413cee6923c97c067ba5a1f780be7fca1eee13e20c4b392`。该身份仍包含原有未提交产品补丁，不是纯 main HEAD 的原生 PASS。

Worker 原始持久结果 `runId=44609272-8f86-41f5-b1bc-336c9cabe298`、`resultId=97145771-aec8-442c-8e8c-ad2d9f10491c`，结果自身 `sourceHash=54ccfb0ae0f32ee67cf74324f21a2d0bef2da98fd43f811862494428bebcb1c8`；与运行源码一致，run/result completed，retirement released。MAIN 的 5 个持久结果与原调用身份一一对应。原记录和 receipt 未修改。

原 72/72 定向结果及 94/94 记录保持原日期、输入与级别，本轮没有重跑。旧包 `c8d43791` 的 CORS、撤权、document、超时、Stop、生命周期等记录只用于影响分析，未升级成 `69bb1a31` 的原生 PASS。公开 MAIN/Worker 示例与现行调用消费者一致，无需重做 HTTP UI。

## 新增验证及修改文件

只在 `tests/framework/k3-controller-authority.test.mjs`、`tests/framework/k3-sandbox-error-forwarding.test.mjs` 各新增一个组合用例；产品源码不变。执行：

```sh
node --test --test-name-pattern='recovery preserves durable HTTP error cause|Stop during a pending HTTP operation' tests/framework/k3-controller-authority.test.mjs tests/framework/k3-sandbox-error-forwarding.test.mjs
```

结果 2/2 PASS，见 [定向日志](../evidence/axiosx-main-01a11f8a/affected-targeted.log) 与 [受影响验证记录](../evidence/axiosx-main-01a11f8a/affected-verification.json)。新增测试后再次核对 140 个产品输入及原产品 diff，仍完全一致；原生调用证据继续复用。`npm run check` 通过（174 个 source/test/build 文件及固定入口/CSP/license），`git diff --check` 通过。没有重跑其他测试、构建或浏览器。

此 Stop 用例证明 relay 抑制晚到错误、AbortSignal 传播与组件资源清理；不新增当前包物理 HTTP 中止的原生结论。恢复用例证明 journal reply 保留且旧 owner 请求不再交付/执行，不把操作 journal 错误等同于整个 run 的终态结果。

## 剩余任务与并发边界

没有确认新的 axiosx 实现缺陷。本轮未分配浏览器/profile、43111/43112、dist 或 ZIP；已观察到「在真实 Chrome 验证多文件导入」对话负责另一条原生工作流，未争用资源。原工作流为 [axiosx-native-01a11f42](axiosx-native-01a11f42.md)，仅引用，不覆写。

下一项已有框架待办由 [R6.2 工作流](r62-final-20261009-01a11ca3.json) 负责：Candidate Verified→Available→Install、禁 Native 后两个独立 My Tasks 运行及同 profile 重启。缺当前候选完整真实注册/ACK、runId/resultId 与独立重跑/重启原始链路；归类 OWNED_ELSEWHERE，不在本轮重复执行。

原 603＋19、独立 B05、既定 campaign、六项资源 baseline、正式账本、独立最终 F3 与同 dist ZIP 安装合同保留。当前包原生同请求恢复仍 NOT_TESTED，F3/ZIP 未关闭。未来只在相关产品/验证输入或合同/环境变化时重测受影响项；不能以聊天切换、无关提交或本轮两项组件 PASS 触发全量重跑或升级正式验收。
