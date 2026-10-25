# AI 知识问答 R1.3 · 相同消息双击发送栅栏（2026-10-26）

Owner：本对话；仅修改 main 的 `examples/sidebar-tools/ai-knowledge-answers/trusted/local-test-runtime.js`、`tests/environment/ai-knowledge-chat-r13.test.mjs` 和本记录。依赖现有 `model.lookup`、`readLibrary`、当前文档绑定、既有网站真实表单及 Chrome Trusted Host；不占用 43111、Chrome Profile、watcher、dist 或旧候选。

## 具体缺陷与最短复现

使用当前 main 的原始 `local-test-runtime.js` 在隔离 V8、模拟 DOM adapter 与延迟 `readLibrary` 环境执行：一条 `ANSWERED_FIXED` 消息连续调用两次可信 `confirm`。旧逻辑两次调用均在第一次 await 前通过状态检查，实测 **2 次存储回读、2 次 adapter.send、两次 CONFIRMED**。这属于 FAKE adapter 的业务并发重现，非真实 Chrome 证据。

## 最小修复

每个已经批准的测试 session 创建 `sending:Set`。同一 messageId 第一次确认在同步阶段立即登记；后续确认返回 `E_KB_TEST_SEND_BUSY`，不启动第二次存储回读、脚本调用或按钮点击。发送结束、取消或抛错通过 `finally` 清理栅栏；原 `SENDING/CONFIRMED/UNKNOWN/ERROR`、ETag、来源、文档、Provider 校验保持不变，UNKNOWN 仍不能重发。

新增 R1.3 专项 Node 回归：保留真实领域模型与既有假 Chrome 驱动，在存储回读悬挂期间连续确认，断言第二次直接拒绝、仅一次 DOM 发送尝试、首次正常回执。该新增用例没有声称真实网站或模型通过。

## 实际证据与剩余

- 独立 V8 实际源码复现：修复前 adapter.send **2 次**；修复后 **1 次**，第二次 `E_KB_TEST_SEND_BUSY`，首次保持 `CONFIRMED`。**PASS（隔离 V8 fake adapter）**。
- 本次 GitHub 云端提交没有执行仓库本机 Node 测试、Mac Chrome 原生安装、Native Provider 或 43111 网页端到端。均 **NOT_TESTED**，不可推论 95+ 完成。
- 后续本地最短验证：`node --test tests/environment/ai-knowledge-chat-r13.test.mjs`，随后在当前安装的 Chrome 与模拟网站验证双击/快速确认只发送一次及消息/线程 DOM 回执；所有新改动先复核最新 main，遵循其他 owner 的资源所有权。