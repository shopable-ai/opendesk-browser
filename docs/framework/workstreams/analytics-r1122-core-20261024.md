# Analytics R1.12.2 — 并行写入及产品证据边界

- Owner: Analytics R1.12.2-CORE（本任务）；仅 `main`；不创建分支、Worktree、PR。
- 本轮确认的真实缺口：Reading TOC Analytics Host 原只核对安装 ID/启用状态，未独立复核官方固定包/来源、站点与页面许可及原安装撤销代次；Scheduler 自动累计允许 Fire 缺少 ResultId 时通过 RunId。
- 独占写入：`src/analytics/host.js`、`src/analytics/authority-projection.js`、`examples/sidebar-tools/reading-toc/trusted/page.js`、`tests/environment/analytics-r11-product.test.mjs`、`tests/environment/analytics-r11-authority.test.mjs`、本文件。
- 依赖只读：`src/sidebar-tools/official-reading-toc.js`、`examples/sidebar-tools/reading-toc/trusted/policy.js`、`src/ui/sidebar-tools/lifecycle.js`、Scheduler 原仓库合同。
- 保护：不变更对外 Analytics 上报结构/Consent v8；安装 epoch 仅本机内容脚本→Host 校验，禁止发送至 Collector；Host 不接收模型或 UI 自报的成功证据。
- 本轮验证级别：源码与拒绝型测试候选；GitHub Analytics CI 均显示 QUEUED，Mac Chrome/D1/PostHog 真实项目未执行必须标 NOT_TESTED / NOT_DEPLOYED / NOT_CLOUD_VERIFIED。
