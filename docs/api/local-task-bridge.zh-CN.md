# Sidebar Tool 受限本地任务桥接

v2 工具声明 `localTasks`；使用原安装器和 `OpenDeskTool.request`。只读开发预览不允许真实调用。本能力不开放任意 localhost、文件、命令或 Python 代码。

`localTasks.request {method,path,body?,targetOrigin?}`：仅允许 POST `/v1/runs`、GET `/v1/runs/{id}`、GET `/v1/runs/by-request/{requestId}`、GET `/v1/runs/{id}/records?offset=0&limit=50`、POST `/v1/runs/{id}/stop`。创建时必须提供精确 HTTP(S) `targetOrigin` 和唯一 `body.requestId`，请求 UTF-8 JSON 上限 24,000 字节。记录 limit 为 1–50。服务端须以会话 scope 再校验目标。

`localTasks.export {runId,format:'jsonl'|'csv'}`：只导出当前安装身份的原任务，经可信 Host 获取有界流并发起 Chrome 下载；返回 `{started:true,downloadId}`。本回执不代表实际文件已保存。

首次需要原可信审阅区的真实点击，批准目标范围并选择 `opendesk.local-task-credential.v1` 配对文件。该文件包含固定 `http://127.0.0.1:<port>` endpoint 和随机 secret，只由可信 Host 私有存储保存。服务 POST `/v1/session` 使用 master Bearer，绑定 `{owner,origin,scope}`；返回 `{token,expiresAt}`（Unix 秒或毫秒）。后续有限端点使用短期 session Bearer。工具永远不收到 secret、token 或可选择的 endpoint。

首次许可后，同范围轮询和原任务 Stop 不重复确认。AI 的每次发送仍遵守原独立审阅。Host 在每次通信前后检查安装、启用、代际和活跃 iframe；对 session 建立之外的副作用不自动重试。启动回执未知时按原 requestId 只读查询；确认没有原任务前不能重新创建。

停用/卸载/升级通过现有安装生命周期调用 master Bearer POST `/v1/revoke {owner}`，仅服务确认 `{revoked:true,workerExited:true}` 后清除可信配对记录。失败保持待清理状态。业务数据与 Worker 属于本机任务服务，不属于 Side Panel 文档。

服务负责限定 Origin、owner、scope、URL/DNS/重定向/内网、robots、速率、请求和结果预算；仅绑定 127.0.0.1。此合同不是通用 HTTP 代理。真实扩展、网站与 Native 验证分别记证据级别；源码和 Node 测试不能证明 Mac Chrome 通过。
