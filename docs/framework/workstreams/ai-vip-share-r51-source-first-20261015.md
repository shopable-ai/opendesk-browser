# AI VIP Share R5.1 · Source-first 正式工具闭环
日期：2026-10-15。Owner：ChatGPT GitHub 连接；仅允许 main，其他 Agent 独立文件正常继续。
当前阶段：ACTIVE。起始远端 main：`0f620b94aa9c8875bf4a50a8a8b34e06c23d2611`。GitHub 远端操作不代表本地 Mac Git 状态已被检查。

## 本轮文件级所有权
- 独立工具：`examples/sidebar-tools/ai-vip-share/src/index.html`、`src/style.css`、`src/main.js`、`tool.config.json`、`README.zh-CN.md`。
- 定向测试：`tests/environment/ai-vip-share-r5-ui.test.mjs`；必要时单独的 R5.1 Node 测试。
- CI 受影响工具版本/测试：`.github/workflows/sidebar-tools-r1.yml` 内 AI VIP 专用任务块，仅作最小字符串变更。
- 本记录：`docs/framework/workstreams/ai-vip-share-r51-source-first-20261015.md`。
- 若需修复可信代理启停卡，仅在重新读取且无文件写入冲突后修改 `src/ai-smart-access/host-controls.js`，不改 Worker/Proxy/SDK/AdBlock。

## 可复用证据与边界
R5 基线工具 1.1.0、5 项定向 Node PASS（旧候选），宿主可信单按钮存在；历史 19 项红灯先于 R5。2026-10-15 读取正式 `AGENTS.md`、R5 工作流、正式源码、Browser SDK Registry 和 CI。
- Browser SDK `browser.tabs.create` / `browser.network.request` 已实现，但本工具当前仍是 v1 / `ai.access`，不能跳过 v2 安装审阅与所需授权。
- `src/sidebar-tools/sandbox.html` 的 CSP `connect-src 'none'`，沙箱内不能直接 `fetch` Provider。
- 商业账号、SKU、兑换、短效 ticket、可信商城 HTTPS URL 未见已批准生产配置；技术性 `aiAccess.activate` 不能充当会员消费。
- 受信代理 Host 的 `src/ai-smart-access/` 需保留，公共 Managed Proxy SDK 尚无已批准完整合同。
- 本对话没有 Mac / 真实 Chrome / watcher / 原生 Profile 访问；不会声称 Native 或下载安装成功，不生成用户下载工具包。

## 验证与交接
仅执行本轮受影响定向 Node / 工具包合同 / 安全静态检查；GitHub Actions 同候选证据优先。完整 Browser build 若仍被独立 AdBlock 可信摘要阻塞，原样记录，不绕过。写入后登记新文件 SHA、准确运行/阻塞证据、最终 commit 与并行漂移。
