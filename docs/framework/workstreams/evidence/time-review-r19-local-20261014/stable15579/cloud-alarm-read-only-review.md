**安全决策：可实施条件化，但不应只改初始化那一行。** 保留条件为 `enabled || unpairing`；成功读取到无配置，或 disabled 且无 pending unpairing 时清理 alarm。根因是 alarm 与配置生命周期未协调。[connection.js:41](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/connection.js:41)

最小修复必须满足：

- **保留撤销重试：** `retryRevocation` 失败仍保留 pending；匹配 ACK 后才删除配置。Unpair 应在 pending 落盘后、等待网络前落实 alarm，完成后再协调清理。[service.js:393](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:393)、[service.js:412](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:412)
- **不延迟 Stop：** 原 invalidate/close 立即生效；不能无条件清 alarm，因为配置可能仍有 unpairing。[service.js:373](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/service.js:373)
- **防止竞态：** alarm 协调不能被 `socket || connecting` 提前返回吞掉；异步 create/clear 必须串行，旧读结果不能覆盖新状态。读取失败不等于无配置。[connection.js:13](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/connection.js:13)

只调整调度与必要通知时序，保留现有 generation、认证身份及 epoch 检查；不新增网络、权限或上传路径。[connection.js:17](/Users/shopme/Documents/workspace/opendesk-browser/src/cloud-control/connection.js:17)

**最小测试：保留现有两项，再补以下五组。** 当前两项只验证旧 socket 回程和新 generation 独立对账，没有 alarm 覆盖。[connection.test.mjs:16](/Users/shopme/Documents/workspace/opendesk-browser/tests/cloud-control/connection.test.mjs:16)

1. 无配置、disabled 无 pending：清理已有 alarm，零认证/Socket。
2. enabled：保留 alarm；多次协调不重复重建。
3. pending unpairing：失败保留 alarm；下一次触发重试；ACK 删除配置后清理，零认证/Socket。
4. 延迟配置读取、Stop/start、pending 写入交错：旧操作不覆盖新调度，connecting 时的刷新不丢失。
5. 配置读取失败：不清已有 alarm；调度操作失败被明确处理，无未处理 rejection。

本轮未修改源码、未运行测试。该方案需要补测后才能接受；不能据此承诺 Time Review 两项原生 BLOCKED 转为 PASS。
