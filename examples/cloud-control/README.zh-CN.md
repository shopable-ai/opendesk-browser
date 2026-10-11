# 本地云控表单示例

需要 Node >=22.12、已安装仓库依赖和受控 Chrome >=138。固定任务 sample.form-fill@1.0.0，不修改示例摘要。

1. 在仓库运行 `npm run cloud:provider`。默认仅监听 http://127.0.0.1:43112；占用则启动失败，不抢占进程。状态和独立管理凭据保存在 `.local/cloud-control/state.json`、`.local/cloud-control/admin.json`（权限 0600）。命令 `-- --directory <目录>` 可选独立持久目录；请保持 Browser 固定开发端口 43112。
2. 运行 `npm run cloud:pairing`，在本机读取 providerId 与 pairingCode。不要把 adminToken 放入 Browser 或聊天。`npm run cloud:inspect` 查询已认证的服务端 Job、claim、Run 关联与回执；不输出 Executor 凭据。
3. 示例服务：`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。若已有标准服务，直接使用 http://127.0.0.1:43111/demo-form.html。
4. `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`，Chrome 加载本次 dist/production 或 development。打开原工具页任务目录，真实导入 examples/tasks/form-fill.v1.opendesk-task.json；在标准页面执行原验证，设为本地可用并安装，通过原 UI 批准网站和用户脚本权限。
5. 在「我的」选择已安装任务，展开「云端托管」，填写默认地址、providerId 和 pairingCode，明确勾选本地 HTTP/WS 并配对。核对已批准固定任务网站和结果范围，勾选托管授权与需要的结果回传，再点击「批准并启用托管」。首次配对不会自动启动。正常重连复用已有授权。保持真实可见 RunHost 开着。
6. 核对连接已认证、Host 就绪、原槽空闲；`npm run cloud:seed:form -- --name Alice --key <本次请求键>` 投递固定任务。省略姓名默认 Alice。任务只经原 Worker 操作页面，观察页面提交完成、runId/resultId、退休 released 和服务端回执。
7. 使用 `npm run cloud:inspect`；原结果在「我的」原运行记录，云关联在托管状态。服务端控制台只有地址/身份/目录，状态文件保留事实。关闭并用相同目录重启提供者，重开同 profile 的 Browser 后先对账，已完成任务不会重跑；非终态未知结果保持 OUTCOME_UNKNOWN。
8. 故障注入：`npm run cloud:fault -- --path /v1/admission --count 1` 或 `/v1/claim`、`/v1/receipt`，先持久提交事实再丢弃 HTTP 响应。重复原键只取回原事实。`npm run cloud:cancel -- --job <jobId>` 在运行时取消；UI「停止托管并请求取消」立即停新领取，状态保留取消处理中/退休待核对。解除配对会先撤销托管；不删除原请求、Run 和 Result。
9. `npm run test:cloud` 是真实 Node HTTP/WebSocket 持久提供者消费者测试；原 Authority 的定向事务测试在 tests/framework/k3-controller-authority.test.mjs。真实 Chrome 证据等级必须另看本工作流，不能用该命令代替。

服务端 admin API 为 POST /admin/state、/seed、/cancel、/fault，需独立 Bearer adminToken。/seed 只接受 requestKey、params、固定 demo-form 目标；固定包由仓库内部读取，不接受任意源码或文件路径。Executor API 为 POST /v1/pair、/auth、/capabilities、/claim、/admission、/renew、/cancellation、/receipt、/reconcile；WS /v1/events 只认证/心跳/通知。

mac24dev 旧 Midway 运行项目目前只绑定回环，HTTP/Socket.IO 18001/18002 从本机 LAN 不可达。其旧直接脚本接口不能替代本合同；本轮没有修改或部署该服务器。
