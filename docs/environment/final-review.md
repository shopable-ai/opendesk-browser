# 02A 最终增量代码复审

- 最终更新时间：2026-10-02 06:48:52 UTC（America/Los_Angeles：2026-10-01 23:48:52 PDT）。
- 被审目录：`/Users/shopme/Documents/workspace/opendesk-browser`。
- 本轮范围：仅 requireTab 的约 8 行诊断 guard 增量、三处 mode 参数传递，以及新增的单条回归。
- 本轮执行：主审直接只读复核；按用户要求未启动子代理、未重跑全套检查。
- 写入范围：仅本报告；未修改被审源码、测试或证据，未操作浏览器、网络、来源或下游生产实现。

## 最终结论

**APPROVE（限定 02A 增量代码复审）。前次 P2/P3 均关闭；新增重要问题 0，未闭合代码审阅项 0。**

此前唯一保留的“permissions.contains=true 后，在 tabs.get 期间撤权并隐藏 URL，误报 E_TARGET”诊断竞态已关闭。修法局限于 optional 权限状态的再确认，没有增加目标选择、授权模式、生产 owner/journal 或其他生产语义。

原窗口恢复、未知 mode 拒绝、READY 授权保留、并发 waiters、registration/generation 校验、包必需资源与 UI 成功文案的关闭结论保持。这里只核本次增量是否影响这些结论，没有追加全套审计或用无修改重复检查扩大证据。

## 本轮修订核对

| 位置 | 核对结果 |
| --- | --- |
| [requireTab:79](/Users/shopme/Documents/workspace/opendesk-browser/src/environment.js:79) | 接收 authorizationMode；tabs.get 返回后、读取 tab.url/pendingUrl 前，对 optional 再核 contains，已撤权返回 E_PERMISSION。新 guard 正好覆盖先前复现的时间窗口。 |
| [ping:101](/Users/shopme/Documents/workspace/opendesk-browser/src/environment.js:101)、[ping:118](/Users/shopme/Documents/workspace/opendesk-browser/src/environment.js:118) | 两处传入实际 registered.authorizationMode，仍使用固定目标 tab/origin；初次准入、回包一致性和最终 registration/generation 检查保留。 |
| [bind:128](/Users/shopme/Documents/workspace/opendesk-browser/src/environment.js:128) | 传入经入口白名单验证的 authorizationMode；注入文件、frame、document 的绑定流程保持。 |
| [新增回归:124](/Users/shopme/Documents/workspace/opendesk-browser/tests/environment/boundaries.test.mjs:124) | optional 绑定后，使 tabs.get 在调用过程中撤权并返回隐藏 URL；断言 E_PERMISSION，且健康消息总数仍为绑定阶段的 1，即新增消息 0。fixture 现已暴露 api，测试真实到达 guard。 |

## 本轮独立验证

仅执行新增 case：

```sh
node --test --test-name-pattern='^permission revoked during tabs.get is diagnosed before inspecting its hidden URL$' tests/environment/boundaries.test.mjs
```

cwd：`/Users/shopme/Documents/workspace/opendesk-browser`；退出码 **0**，**1/1 通过**。

```text
✔ permission revoked during tabs.get is diagnosed before inspecting its hidden URL (7.296209ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 99.8665
```

本轮没有重跑完整 npm test、build/pack、classic 编译扫描、包 negative tests 或浏览器；没有启动新的子代理。

## 修前与修后证据归属

- 修前真实行为：前一版主审独立内存 PoC 已复现 `E_TARGET / 目标地址无效 / 新健康消息 0`，对应 environment.js SHA-256 为 `815b25b4002c8e1caa7966fac0a08146036394340121f2b935ba71641395d8d6`。这是已到达产品代码诊断路径的修前证据。
- 主代理补充的有效 before-guard 变体保存在本聊天 work/revoke-race-regression，目标 case 期望 E_PERMISSION、实际 E_TARGET；更新日志为 [revoke-race-before.log](/Users/shopme/Documents/workspace/opendesk-browser/docs/environment/revoke-race-before.log)。按用户要求，本轮未执行或扩读该工作副本。
- 修后行为：本轮独立运行上述新增 case，证明 E_PERMISSION 且无新增健康消息。
- 主代理完整测试证据：[revoke-race-after.log](/Users/shopme/Documents/workspace/opendesk-browser/docs/environment/revoke-race-after.log)。本轮只读核对统计为 **20 tests / 20 pass / 0 fail**；完整 npm test 退出码 0 由主代理提供，不作为本轮独立重跑的结果。
- 前轮的 12/12 定向回归与两路独立复核是上一修订的历史证据；本轮不将它们标记为当前新 hash 的重新执行。

## 当前被审快照

本轮定向测试后再次读取两个修改文件，SHA-256 未变化。

```text
3b5e5d6fdc1a45d9024c75aff3676cc8f68a94717463a9b4fe4e52e2c8cd2dd6 src/environment.js
8f4cdb48c36ce1712f53287993316eb0904223ca5bb108546ba70c9521f3aee8 tests/environment/boundaries.test.mjs
18593e765de1457860a2e702f04a5dcdd9ed46cd4bdf93aa9ba2a703347b346c docs/environment/revoke-race-after.log
```

## 浏览器与产品证据边界

用户提供：⑥已有旧修订 100 case passed；最终约 8 行改变后的新 build/package hash 将再次独立复测。本报告明确保留这个版本边界：**旧 hash 的 100 case 不计入本次新修订的浏览器通过证据。** 新 hash 的独立复测结果由⑥后续交付。

01 合同 1.0.0 仍仅作为规范依据。APPROVE 是本次限定代码复审结论，不是新 hash 的真实浏览器、生产 02B 或最终产品通过声明。

本报告更新完成；没有未闭合的代码审阅缺陷或待执行的本轮审阅任务。
