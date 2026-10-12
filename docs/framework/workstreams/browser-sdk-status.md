# Browser SDK R1.3 / R2 / R3 / R4 统一进度账本

> `IMPLEMENTED` 是合同登记状态，**不等于真实 Chrome PASS**。本账本只记录可追溯事实，不授予额外权限。

- 最近核对的 `main` SHA：`510fa81894e13f57df0c791d141bfe91960e0632`（这是本提交前的核对基线；当前最新请运行 `git rev-parse HEAD`）
- Browser SDK 版本：`1.0.0`
- 操作总数：**32**；已登记 IMPLEMENTED：**10**；同候选实测可调用：**0 项已验证**
- PLANNED：**18**；HOST_ONLY：**2**；NOT_EXPOSED：**2**
- 生态审计：**18 个领域、74 个叶子**（不代表开放全部 74 项特权 API）
- Node / Check / Build / Build:dev / Build:size / Verify：**NOT_TESTED（当前候选）**
- 真实 Mac Chrome GUI / Worker：**NOT_TESTED（当前候选）**
- 阶段 R1.3：**BLOCKED**；R2：**NOT_TESTED**；R3：**NOT_TESTED**；R4：**NOT_TESTED**

## 优先完成的任务

1. R1.3：真实 GUI 权限、右键点击、侧栏打开、一次性选区及撤权/Worker 生命周期。
2. R2：Tabs / Side Panel 的可信用户动作、工具 capability、受控 Host、Chrome 原生正反向测试。
3. R2：Network Observe 单 Tab / 单 Origin 隐私边界、会话有界队列、停止、导出及 Worker Gap。
4. R3：截图与用户可见录制及操作会话；notifications 保持限制；speech 遵守排除范围。
5. R4：按同一候选完成 CI、生产与开发构建、大小限制、包身份和 Mac Chrome 验收。

## 全接口实施与验收矩阵

| 操作 | 实施状态 | 对外开放 | 正向测试 | 拒绝测试 | Chrome 原生 |
| --- | --- | --- | --- | --- | --- |
| `browser.capabilities.list` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.capabilities.getStatus` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.contextMenu.getStatus` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.contextMenu.register` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.contextMenu.unregister` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.launch.consume` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.page.getContext` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.page.getSelection` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.clipboard.writeText` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.downloads.text` | IMPLEMENTED | APPROVED_TOOL | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.tabs.open` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.tabs.focus` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.sidePanel.openSelf` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.request` | HOST_ONLY | HOST_ONLY | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.start` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.getStatus` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.stop` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.network.observe.export` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.events.read` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.events.close` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.screenshot.captureVisible` | HOST_ONLY | HOST_ONLY | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.media.recording.prepare` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.media.recording.getStatus` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.media.recording.stop` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.media.recording.discard` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.speech.transcribe` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.speech.speak` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.speech.stop` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.notifications.create` | NOT_EXPOSED | NOT_EXPOSED | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.notifications.clear` | NOT_EXPOSED | NOT_EXPOSED | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.operations.getStatus` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |
| `browser.operations.cancel` | PLANNED | DECLARED_NON_EXECUTABLE | NOT_TESTED | NOT_TESTED | NOT_TESTED |

## 阶段验收

- **R1.3**：BLOCKED，Native GUI right-click + one-time selection and revoke acceptance still missing
- **R2**：NOT_TESTED，Tabs, Side Panel and bounded network observation still lack approved tool Host wiring
- **R3**：NOT_TESTED，Screenshot HOST_ONLY, Recording/Operations not wired and Speech scoped out
- **R4**：NOT_TESTED，No same-candidate full CI, package and Mac Chrome proof

## 判定依据

- `src/framework/sdk/browser-contract.js` 是唯一操作事实来源。
- `src/framework/sdk/browser-schemas.js` 只描述参数及结果类型，不是权限来源。
- `docs/framework/workstreams/browser-sdk-acceptance.json` 为机器可读的逐项验收记录。
- `scripts/check-browser-sdk-coverage.mjs` 用于核对矩阵/权限/证据；不能只改 JSON 把状态设为 PASS。
- 历史独立候选 CI：<https://github.com/shopable-ai/opendesk-browser/actions/runs/38155035118>，无原生 GUI 完整闭环。
- Mac 本机源码与测试资源未在当前执行容器中挂载；相关测试明确 NOT_TESTED。
