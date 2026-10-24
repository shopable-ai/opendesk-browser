# Cloud Control R20.1 · 停止栅栏兼容测试增量（2026-10-24）

- Owner: ChatGPT GitHub 直连；范围仅 `tests/cloud-control/provider.test.mjs`、`tests/cloud-control/remote-https-r52.test.mjs` 及本条记录；没有占用本机 Chrome、PostgreSQL、Provider、watcher。
- 基线 `main`: `ee2ed2f03fe6b8e4d0407a1ff77b7238e5a4f6e6`。证据：[Cloud Control R5.2 run 40022020274](https://github.com/shopable-ai/opendesk-browser/actions/runs/40022020274)，228 个用例 189 PASS / 2 FAIL / 37 SKIP。
- 实际失败：`provider.test.mjs` 旧断言对已经 `suspend` 的同 `grantId` 再次调用 `/v1/capabilities` 期待成功；`remote-https-r52.test.mjs` 同类预期。现在正式 Provider 明确要求 `E_CLOUD_STOPPED`，防止延迟旧连接重新激活停用的云控。旧断言与安全合同冲突。
- 变更：**只修两处旧断言**，要求 `E_CLOUD_STOPPED` 且保留后续拒绝新 Job、明确新 Grant 才恢复、旧 Grant 拒绝的检查；不修改 Provider 实现、不降低 Stop 防线、不动历史 Job/Run/Receipt。
- 静态核对：两个旧文本片段在实时 `main` 上各精确匹配一次；用文件级快照创建树，最终更新 `main` 使用预期 HEAD 且禁止 force，拒绝并发漂移。
- 本轮无法访问用户 Mac 工作目录和其真实 Chrome、CA、PostgreSQL。两处 Node 运行结果须以更新后对应 SHA 的 CI/本地执行为准；**不记 PASS**。此前本地开发环境已记录 HTTP/WS create/update A + 独立读回；严格 HTTPS Pull、WSS Push、正式业务 Web、跨设备仍未验收。见 [唯一 R20.1 合同](../../architecture/browser-framework/cloud-control-r5.2-interface-security-contract.zh-CN.md)。
