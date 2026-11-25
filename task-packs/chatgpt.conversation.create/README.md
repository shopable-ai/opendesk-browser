# ChatGPT 新建对话 Controller Task

独立业务 owner：本目录；WebFlow/Subagent 是消费者，不复制执行脚本。通用开发、安装、权限及发布见 [Task 脚本库](../README.md) 与 [共享 Task 消费合同](../../docs/architecture/installed-controller-tasks-and-workflow-consumers.zh-CN.md)。

## 版本与真实源码

基准 `122c7167b5b2eaef183fb674b7d773d8d27ccce5` 已逐一比较下列五个冻结包的 sourceUtf8 与对应源文件，全部一致。当前可选目录版本为 0.2.2，非自动预置；存在冻结包不代表用户已安装。

| 版本 | 源码 | 冻结包 |
| --- | --- | --- |
| 0.1.0 历史，仅准备草稿 | [源码](src/chatgpt-conversation-create.js) | [包](releases/chatgpt.conversation.create.v1.opendesk-task.json) |
| 0.2.0 历史 | [源码](src/chatgpt-conversation-create-v0.2.js) | [包](releases/chatgpt.conversation.create.0.2.0.opendesk-task.json) |
| 0.2.1 受审资源 | [源码](src/chatgpt-conversation-create-v0.2.1.js) | [包](releases/chatgpt.conversation.create.0.2.1.opendesk-task.json) |
| 0.2.2 当前可选目录 | [源码](src/chatgpt-conversation-create-v0.2.2.js) | [包](releases/chatgpt.conversation.create.0.2.2.opendesk-task.json) |
| 0.3.0 两阶段独立合同，非自动升级 | [源码](src/chatgpt-conversation-create-v0.3.js) | [包](releases/chatgpt.conversation.create.0.3.0.opendesk-task.json) |

taskId 为 chatgpt.conversation.create，站点 https://chatgpt.com，声明权限 page.automation。0.2.x 参数包括 prompt、send、model、effort、thinking；必须按所选版本的 Manifest 枚举与约束填写。安全草稿示例（实际准入仍按版本）：

```json
{"prompt":"总结三个要点","send":false}
```

发送需要原版本与本次明确授权，未知结果禁止重新发送。0.3.0 使用 phase/prepareRunId/prepareRequestId 等独立两阶段合同；只有原可信 PREPARE/SUBMIT 编排与精确续接满足才能提交，不得将 0.3.0 当作 0.2.x 的静默更新。结果以真实 runId/resultId 和所选版本的合同为准。

[contracts/](contracts/) 的两个结果数据验证器沿原精确审核固定编译合同复用；不是动态 Task 执行器，也不允许把 WebFlow 的交付逻辑搬入 Task。普通网站业务只改本 family 的源码，相关验证按 [共享消费合同](../../docs/architecture/installed-controller-tasks-and-workflow-consumers.zh-CN.md) 与现有消费者的定向测试选择。

新版本使用原发布链生成不可变包；当前版本均为 legacy 参数合同，不将 v2 文本声明直接写入旧包。此次仅目录、发行索引和五个源/包对应性核验，未运行任务、测试或安装，未改变现有发布策略。
