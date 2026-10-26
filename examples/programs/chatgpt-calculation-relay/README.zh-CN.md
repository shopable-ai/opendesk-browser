# ChatGPT 双对话计算 · 可复用 Controller Task 0.2.0

官网对话操作已拆成可维护模块；计算接力是使用者：A 计算两个整数的和，可信存储读回后，在不同新对话 B 乘以第三个整数。正式零参数入口接受参数，不固定17或19，ChatGPT业务不进入通用Host。

**0.2.0 已在当前持续开发 Chrome 安装并完成两组「我的」运行：42→126、44→132。** 两次运行及 Native 独立状态读回期间，整个业务源码目录临时移出；调用使用已安装固定版本。真实 taskId 为 `opendesk.chatgpt-calculation-relay`，版本 `0.2.0`，sourceHash 为 `94b604e88d82074d749f34ca81e62e276c414fd7a90bb8b29d642369829ada6f`。见[工作记录](WORKSTREAM.zh-CN.md)及[运行证据](EVIDENCE.json)。这是开发扩展的实际安装证据；production 扩展、完整矩阵及评分仍未执行。

## 从哪里安装

本轮实测使用[固定可移植包](release/0.2.0/program.opendesk-task.json)，从「我的 → 添加任务 → 导入」进入现有任务目录，验证、设为可用并审阅安装。包采用原 `opendesk.task-package.v1`，包 ID 和实际安装 ID 均为 `opendesk.chatgpt-calculation-relay`，版本 `0.2.0`。

1. 在已登录的`https://chatgpt.com`选择专用空白对话和同窗口Sidebar。确认没有草稿、附件、正在生成的内容；不要清空此前恢复的测试草稿。
2. 导入固定包，按原入口执行同一哈希的 Controller 验证，核对真实宿主 runId/resultId/sourceHash。候选声明有限120秒期限，内部共享预算并预留落账时间；官网过慢仍可能超时。
3. 验证通过后设为可用，审阅名称、固定版本、网站 `https://chatgpt.com`、`page.automation`、`storage.persistent` 和最长120秒，由原 Candidate→Verify→Available→Installed 链安装。
4. 到「我的」选择已安装任务，填写下方参数并运行。日常运行不需要开发 MCP、项目 Provider 或源码目录；首次安装验证和普通运行是不同动作。
5. 用同一安装身份执行 `status`，独立读回原业务 runId。实测 `relay-isolated-017` 和 `relay-isolated-019` 均完成，Native 查询自身也达到 completed/released。同一业务 runId 再次 Run 只读旧记录。

开发迭代也可使用「开发 → 本地项目 → 运行本地项目 → 保存为任务」，见[本地项目指南](../../../docs/api/sidebar-local-projects.zh-CN.md)。首次源码验证需要合法项目 Provider；此路径本轮未作同候选原生验收。它沿原稳定绑定生成 `local-*` 身份、首次版本默认 `1.0.0`，与本轮可移植包身份不同。调用者必须从真实安装记录取 ID、版本、哈希，不能用目录名猜测，也不要同时安装两种身份绕过未知日志。

`release/0.2.0/` 保留冻结构建的原字节，构建记录中的 `BUILT_UNVERIFIED` 仍描述构建时事实。后续安装与运行证明单独保存在 EVIDENCE.json，未改写原构建记录。

## 在「我的」运行和查询

参数：

```json
{"operation":"run","addend":17,"secondAddend":25,"multiplier":3,"runId":"relay-user-first-001"}
```

另一组有意执行使用新业务runId和独占空白对话：

```json
{"operation":"run","addend":19,"secondAddend":25,"multiplier":3,"runId":"relay-user-second-001"}
```

预期分别42→126、44→132；只有实际原文、唯一消息身份、完成信号和独立算术核验通过才返回completed。预期值不等于实测。结果含`steps.A/B.result.raw`、结构化`value`、对话URL/documentId和用户/助手消息ID；宿主另提供可信执行身份。

单独只读查询：

```json
{"operation":"status","runId":"relay-user-first-001"}
```

同一业务runId重复Run只读旧记录，不重发。status是最后持久化状态，旧running不证明现在仍运行。浏览器重启后查「我的」原历史和同一安装taskId的status，不恢复Worker、不自动重放未知步骤。状态查询自己的宿主runId与原业务runId必须区分。

## 从其他环节调用同一安装版本

公开 Native CLI 的 `installed-task` 来源已实测调用同一安装版本的 `status`/`inspect`，复用原认证、当前 Sidebar Host、RunHost/Authority 和持久结果，不传源码、目录或 Provider 绑定。当前部署 Go 的 `task.list` 仍有 allowlist 缺口，返回连接关闭；它不影响已核实安装身份的 `run.start`。完整请求见[已安装任务 Native 调用](../../../docs/api/native-installed-tasks.zh-CN.md)。

从仓库根使用原CLI：

```sh
node native-agent/cli.mjs bridge.status
node native-agent/cli.mjs target.current --file host.json
node native-agent/cli.mjs run.start --file installed-run.json --request-id relay-admission-001
node native-agent/cli.mjs run.get --file original-run.json
```

`host.json`只含当次真实registrationId。`installed-run.json`按以下形状填写：

```json
{
  "registrationId":"从bridge.status读取",
  "source":{
    "kind":"installed-task",
    "taskId":"从真实安装回执读取ID；支持task.list的部署也可从列表读取",
    "version":"真实安装版本",
    "sourceHash":"真实64位源码SHA256"
  },
  "params":{"operation":"run","addend":23,"secondAddend":7,"multiplier":4,"runId":"relay-consumer-0001"},
  "target":"将本字段替换为target.current返回的完整target对象"
}
```

这是填写说明，不能原样执行：target必须是实际对象，不能猜tab/document。`original-run.json`填实际registrationId和原宿主runId。临时目标、Host ID不写进发行包。网络回执未知时先按公开文档request.get查询原入场请求，不换requestId重发。

调用必须同时pin taskId/version/sourceHash。升级或授权变化使旧pin拒绝，调用者明确选择新版本。CLI是其他消费者；它与Codex开发源码入口`opendesk.dev.run`不同。工作流没有调用已安装Task步骤，Worker SDK也没有`tasks.run`，本轮不宣称支持。

## 停止、恢复和维护

「我的」原运行Stop，或`run.stop --file original-run.json`，随后查询终态及资源释放。Stop不回滚已发消息。权限撤销后停止；恢复登录/授权不意味着批准重发。

所有消费者复用原单执行槽，槽占用立即拒绝，不让Task嵌套等待Task。业务active指针阻止未核清旧接力；不通过换身份或换runId绕过去重。保留写前意图、真实发送确认、逐步读回及导航重绑。inspect/reconcile须遵守原文档/原输入约束，见[输入输出合同](CONTRACT.zh-CN.md)。

无运行时第三方依赖/CDN；项目package-lock固定依赖图，仓库根锁固定编译工具。release/0.2.0保留原管线生成的包、程序、草稿及构建记录。

```sh
node --test examples/programs/chatgpt-calculation-relay/tests/*.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-calculation-relay
```

固定构建、DOM变动定位、故障分类、unknown恢复、安全升级和数据保留见[维护说明](MAINTENANCE.zh-CN.md)。官网适配是版本化代码，不保证永久有效。日常执行需Chrome/OpenDesk与网页存活；Chrome关闭后不会继续网页操作。
