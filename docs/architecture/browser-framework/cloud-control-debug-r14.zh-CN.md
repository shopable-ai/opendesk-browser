# Cloud Control 开发诊断 R1.4：入口分工与真实验收

日期：2026-10-11。状态：**开发构建调试入口已接线；真实 Chrome 原生验证仍需按实际候选独立执行**。

## 一、为何不是导入工具

- 「我的」管理已安装 Task v1，来自独立任务目录的 `importTaskPackage` → 候选验证 → `installTask`。导入 JavaScript 草稿会进入「开发」，不会自动成为可托管任务。
- 「工具」的 `.opendesk-tool.json` 走独立 Sandbox、能力审批和工具安装流程，不能冒充 Task v1 安装身份、固定源码哈希、Authority / RunHost 或云端许可。
- Cloud Control 本身是 Browser 固定内置框架；现有 `src/ui/cloud-hosting.js` 和 `src/cloud-control/service.js` 管理配对、Grant、WSS/HTTPS、领取、原 Run/Result 与回执，**不需要从工具市场安装云控**。

## 二、页面职责和防误操作

- **我的**：已安装任务/最近结果优先显示；折叠的「云端托管」位于任务区之后，提供真实配对、授权、托管停止。移除对 Browser R1「关闭 Side Panel 仍无人值守」的误导文案；云端状态用脱敏中文摘要代替原始 JSON。
- **工具**：保留现有工具安装器和沙箱，不能接受 Task v1 安装为等价云端执行任务。
- **调试**：WXT development 构建显示第六 Tab，production 默认隐藏并由导航逻辑拒绝进入。调试页只经已有可信 `client.cloud.cloudStatus({})` RPC 投影真实状态，不调用 `cloudNext()`、`cloudResolve()`、`host.start()`、配对、审批、存储写入或网络管理端点；原 RunHost Stop 的跨页所有权不变。

调试快照使用字段白名单：连接状态、对账、Host/slot 可用性、批准任务数量、请求状态计数及回执/退休计数；不包含服务地址、pairingCode、credential、Executor/Task/Request/Run ID、网站 URL、结果正文或错误原文。最多统计最近 2000 条请求，避免巨型快照。

## 三、如何操作和验收

1. `npm run cloud:provider` 启动回环持久提供者（固定 127.0.0.1:43112），用 `npm run cloud:pairing` 获得配对参数；勿公开管理凭据。
2. 在任务目录真实导入、验证并安装 `examples/tasks/form-fill.v1.opendesk-task.json`，使任务在「我的」中可见；不是在「工具」中导入。
3. 在「我的」折叠的云端托管里填入提供者并批准当前 Task/站点/结果范围，保持合法可见 Host。
4. 用 `npm run cloud:seed:form -- --name Alice --key <唯一请求键>` 投递任务，开发构建切换到「调试」刷新只读状态；生产构建无调试 Tab。
5. 用 `npm run cloud:inspect` 和原生 Chrome/IDB 证据核对同一任务的 claim→startPermit→Worker→Result→retirement→receipt；用对应 `cloud:fault`、`cloud:cancel` 检查重连、幂等、取消与未知结果，不得用模拟按钮或假回执充当原生验收。

## 四、验收证据

- 本轮独立纯逻辑调试快照/观察器验证：4 项 Node 用例通过（只读、脱敏、状态规范化、销毁异步隔离）。须在仓库最新同一源码候选运行新回归、`npm run check`、`npm run build:dev`、`npm run build`、`npm run verify`。
- 构建后分别在真实 Chrome 验证：开发六 Tab，生产五 Tab；在调试页不触发新 claim / permit / Run；运行中的原 Stop 在切换后仍可用；小屏/200% 缩放/键盘可用；复制摘要无密钥。
- 云控 R1 其他工作流记录的组件及构建证据只属于其各自 packageHash；未有当前候选 Chrome Gate1–4 的原始闭环证据时继续 `NOT_TESTED`。
