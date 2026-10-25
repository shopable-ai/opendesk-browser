# ChatGPT 双对话计算接力 R1.1

开发期 Controller 项目：一次 Run 在真实 ChatGPT 完成 A，保存并读回结果，再创建不同对话 B，动态传入 A 的结果。默认 A 为 `17 + 25`；第二轮用 `19 + 25`。当前真实验证状态见[工作记录](WORKSTREAM.zh-CN.md)，源码或 Node 通过不代表官网通过。

## 入口与参数

复用现有[本地项目 MCP](../../../docs/api/mcp-local-development.zh-CN.md)：将本目录加入允许路径，attach/status 取得实际 bindingId、registrationId 和目标身份，然后调用 `opendesk.dev.run`。整个接力属于一次 Controller Run，使用 `deadlineMs:120000`。Sidebar 本地项目按钮目前固定 30 秒，不能保证完成两轮官网生成；本示例不修改公共运行器。

首轮 params 为 `{"addend":17,"runId":"relay-your-unique-run-1"}`；成功后从空白新对话用 `{"addend":19,"runId":"relay-your-unique-run-2"}` 再运行一次。requestId 也须分别使用新标识。runId 仅允许 8–80 位字母、数字、下划线或连字符。

运行前需要已登录的专用 ChatGPT 顶层标签页、原有网站授权、Chrome 用户脚本权限及在线的原 RunHost。已有草稿（包括空白字符）、附件或正在生成的回复会阻止发送。Cookie 登录属于用户授权的环境准备，不属于程序功能；项目不读取 Cookie。

本项目使用公开的 `page.observe/evaluate/goto` 和 Controller 的 `AppStorage`。它是开发草稿，不是已冻结/正式安装的 Task v1：当前 Task 安装合同尚未开放其所需存储服务，不得将本目录宣称为可直接正式安装的任务包。

## 发送与恢复

- `sending` 在填入前落账；点击意图在唯一一次点击前落账。点击回执不是发送确认，实际新增用户轮次必须匹配本次完整消息。
- 助手须属于该新增用户轮次，带完成信号、停止流式生成且连续两次内容稳定，才能解析单行 JSON。runId、步骤和独立算术预期分别校验。
- A 的结果经可信存储写入并逐字节读回，导航前再次保存交接信息；B 只使用导航后重新读回的 A 数值，并要求新 documentId 及不同对话路由。
- 结果不确定进入 `unknown`。同 runId 再 Run 只读原记录；未核清的旧运行阻止新发送，不自动恢复、不换 ID 盲目重试。
- 只读对账参数为 `{"operation":"status","runId":"原运行标识"}`，不提供 runId 时读取当前指针。禁止直接删除记录来绕过未知效果。

## 定向验证

```sh
node --test examples/programs/chatgpt-calculation-relay/tests/*.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-calculation-relay
```

测试调用实际接力模块、实际 AppStorage facade、实际项目编译器和实际站点适配函数。隔离依赖/DOM fixture 仅证明 Node 行为，不证明官网适配、权限、导航或真实发送。

真实验收需保留每轮两个不同对话 URL、实际用户消息与助手身份、完成信号、原始 JSON、存储读回和原 RunHost 持久结果。预期 `42→126` 与 `44→132` 只是独立校验标准，不能替代真实观测。
