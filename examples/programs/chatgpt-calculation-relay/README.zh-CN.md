# ChatGPT 双对话计算 · 可复用 Controller Task 0.2.0

官网对话操作已拆成可维护模块；计算接力是使用者：A 计算两个整数的和，可信存储读回后，在不同新对话 B 乘以第三个整数。正式零参数入口接受参数，不固定17或19，ChatGPT业务不进入通用Host。

**当前是待正式验证安装的固定候选，尚未证明安装版可用。** 旧R1.1在持续开发Chrome完成普通Run的42→126和44→132，均独立读回持久结果；它们只证明旧源码哈希。0.2.0源码、权限、安装、外部调用的证据见[工作记录](WORKSTREAM.zh-CN.md)最新节及[本轮证据](EVIDENCE.json)。Node通过和固定包不等于安装成功。

## 从哪里安装

推荐原「开发 → 本地项目 → 运行本地项目 → 保存为任务 → 确认安装固定版本」，正式任务在「我的」。开发接入见[本地项目指南](../../../docs/api/sidebar-local-projects.zh-CN.md)。首次源码验证需要合法项目Provider；安装完成后日常执行不再使用它。

1. 在已登录的`https://chatgpt.com`选择专用空白对话和同窗口Sidebar。确认没有草稿、附件、正在生成的内容；不要清空此前恢复的测试草稿。
2. 选择本目录项目，输入下方参数，明确点击「运行本地项目」。候选声明有限120秒期限，内部共享预算并预留落账时间；官网过慢仍可能超时。
3. 核对真实宿主runId/resultId/revision.sourceHash、completed及资源released。同一当前源码、文档和持久结果才能「保存为任务」；R1.1旧成功不能验证0.2.0。
4. 审阅名称、固定版本、网站`https://chatgpt.com`、`page.automation`、`storage.persistent`和最长120秒。确认后由原Candidate→Verify→Available→Installed链安装；Controller安装核对原运行，不为保存再次发送计算。
5. 到「我的」核实实际安装记录。关闭本次开发MCP和项目源码Provider，再在「我的」运行并单独查询。这一步必须实测后才算独立运行通过；本轮仍为NOT_TESTED。

本地保存沿用原稳定绑定身份：实际ID为`local-*`，首次版本默认`1.0.0`，可在审阅中选择合法新版本。项目版本0.2.0不会改写已有本地任务ID。调用者必须从真实安装记录取ID、版本、哈希，不能用目录名猜测。

可移植候选是[release/0.2.0/program.opendesk-task.json](release/0.2.0/program.opendesk-task.json)，采用原`opendesk.task-package.v1`，包ID `opendesk.chatgpt-calculation-relay`、包版本`0.2.0`。这是同源的另一种发行身份，**不是本机已安装ID**。需要该身份时，从「我的 → 添加 → 导入」进入原任务目录，以同一sourceHash的新Controller运行证明验证、设为可用并审阅安装。不要同时安装两种身份绕过未知日志。构建记录为BUILT_UNVERIFIED，没有伪造验证/安装记录。

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

本轮在原Native Agent补齐只读`task.list`及`run.start`的`installed-task`来源。使用原CLI/Native认证、当前Sidebar Host和同一RunHost/Authority/持久结果，不传源码、目录或Provider绑定。完整可用请求见[已安装任务Native调用](../../../docs/api/native-installed-tasks.zh-CN.md)。

从仓库根使用原CLI：

```sh
node native-agent/cli.mjs bridge.status
node native-agent/cli.mjs task.list --file host.json
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
    "taskId":"从task.list读取真实安装ID",
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
