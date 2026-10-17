# React UI R33.3.7 · 调试只读诊断 React 迁移（2026-10-17）

## 并行边界
- 唯一可写分支 `main`；起始 HEAD `a9bbdc8810d8c1160fe594e86365c8ce4b2fcdbf`，更新必须乐观锁快进且不能覆盖并行工作。
- 负责 Debug React 文本、原 Host Adapter、tool-shell 接线、六 Tab 同源预览、定向测试和专用 CI；不修改 Prompt Shortcuts、Cookie、权限、RunHost、Installer 或 Host 协议。
- 无本地 Mac 工作区和安装 Chrome 访问权：`INSTALLED_EXTENSION_NATIVE_CHROME=NOT_TESTED`。

## Owner → Adapter → Snapshot → Subscription → Dispose
- `debug-workbench.js` 继续独占 `client.cloud.cloudStatus({})`、`projectCloudStatus()` 严格脱敏、刷新、复制、sequence 异步栅栏。
- `createDebugWorkbench({reactUI:extensionList})` 将可信文本经 `renderDebugDiagnostics()` 传入正式唯一 React Root；未接 React 的测试/旧宿主仍兼容独立 DOM 回退。
- `main.tsx` 通过九个 React Portal 原子交接已有诊断 text children，保留原按钮 DOM 和 CSS。无新数据权限、无云端 Claim/配对/审批/执行。
- Preview 与正式组件复用 `DebugDiagnosticText`，模拟数据显式 `UI_PREVIEW_ONLY`；`Debug` 生产仍隐藏。
- 原诊断刷新与复制 listener 仍属 DebugWorkbench；dispose 清除监听器并阻断延迟结果；Root 释放文本 Owner 标记。

## 验证及未完成
- 新增 TSX SSR 安全转义、React 桥接、只读安全、复制、错误、单 Writer、Dispose 和 DOM 兼容合同。
- CI 需验证 `check / build / build:dev / verify / build:size` 与实际 Chromium；未运行不可记 PASS。
- 「我的、云控」主体与「扩展、工作流、开发」未迁移部分仍由既有业务 Owner 管理；六页 React 完整关闭尚未达成。
- Mac 原生两轮、RunId/ResultId/sourceHash、安装升级、权限撤权：NOT_TESTED。
