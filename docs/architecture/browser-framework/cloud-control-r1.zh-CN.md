# Cloud Control R1.1

实现文件：scripts/cloud-control/provider.mjs 为串行持久开发提供者；cli.mjs 提供真实管理命令。src/cloud-control/service.js 是唯一原 Authority 的云控委托，使用原 frameworkKV 保存 Grant、Executor、claim 与请求关联；不新增 Run 数据库。connection.js 使用浏览器原生 WebSocket，短期认证、20 秒心跳、代次隔离、指数退避，Chrome alarms 每 30 秒辅助恢复。Chrome >=138 兼容；参见官方 [WebSocket 生命周期说明](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)。

固定包内 cloud-control/cloud-host.js 在 SW 启动前同步载入工厂。scripts/build-contract.mjs / verify-package.mjs 精确登记该 classic 入口，不加载远端 JS，生产 SW 按用户本轮修正采用 384 KiB 硬上限和 320 KiB 提醒线。原 Authority 注入委托，controller-methods.prepareControllerRun 在同一 IDB 事务内绑定云请求，事务提交后取得持久 permit，然后走已有 createOwned 和原 RunHost。Host Client RPC 使用原可信 sender、注册和命令路由；UI 托管驱动复用当前可见 RunHost 与全局原执行槽。

My Tasks 托管入口分别执行配对和明确批准所选固定安装版本/网站/结果范围。SW 独占连接；Host 只读状态和消费经过持久校验的请求。连接认证不等于 Host/目标/槽就绪。无 Host 不创建隐藏页面，不伪造 sender。

原 Run 结束仍使用 finish/retire，云租约不能代替退休证明。结果只在原 Authority 校验当前安装/网站/Grant 后投影，原 Result 自身 revision/sourceHash 必须与 runRef 相同。退休释放后才回传。失败回传由重读结果补传；恢复的未知运行不会重新发给 Worker。

提供者 state.json 原子 rename 且 fsync 文件、单进程目录锁、管理和 Executor 分离认证；重启读取原 claim（包括空）、assignment、Run 关联、许可与回执。故障入口故意在持久提交后丢响应。租约到期不重排有可能产生副作用的 assignment。

操作指南：[本地云控示例](../../../examples/cloud-control/README.zh-CN.md)。合同：[v0.2](../../contracts/execution-control/v0.2/README.zh-CN.md)。实际证据/未测：[工作流](../../framework/workstreams/cloud-control-r1.md)。
