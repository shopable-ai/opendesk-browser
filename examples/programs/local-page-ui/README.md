# 本地 Page UI 直接预览

按 [本地开发指南](../../../docs/framework/local-development-r22.zh-CN.md) 完成首次配置或旧 Native Host 的一次 update；`--allow-project` 必须包含此目录。启动后可从 `opendesk.dev.status` 取得自动绑定的 bindingId，也可以显式 attach。按 [Controller 示例](../local-controller/README.md) 启动唯一标准测试网页，在 Chrome 打开项目 `pageRules` 允许的 demo-form.html，开启扩展的「允许用户脚本」并授予目标网站权限。

调用 `opendesk.dev.run({bindingId, requestId})`，不传 Controller params 或自定义 deadline。它返回 `previewId`，用 `opendesk.dev.result({previewId})` 获取实际 USER_SCRIPT 回执。页面显示 Shadow DOM 按钮、计数器和受控 PNG。

修改 `src/model.js` 的 `label` 与 `step`，修改 `assets/ui.css` 的颜色，直接再次调用 run；平台确认旧受管实例清理后挂载新版本；无需 build、JSON、上传或重新安装扩展。源码无效会拒绝本次新预览，保留此前实例的现有状态，不把旧字节冒充本次执行。显式再运行读取最新文件，不表示存在文件监听或自动 HMR。

Page 预览没有 Controller runId，不会创建正式 Task。只显式点击页面按钮改变这个 Demo 的计数器，不操作网站表单、不自动执行业务行为。关闭按钮走 `createPageUI().destroy()`。`dev.stop({previewId})` 对这个受管示例执行 typed 清理；非受管 Page 返回 `E_PAGE_PREVIEW_STOP_UNSUPPORTED`，不能把通用第三方脚本当作 Controller 强制停止。

若入场 ACK 丢失，在同一 MCP 会话用 `dev.result({admissionRequestId:原requestId})` 只读对账；恢复仍只得到原 previewId，不会变成 Controller，也不自动重跑未知效果。

正式打包安装仍使用仓库 `build:program` 命令，与本地预览分开。

候选 `99a26c38e576ad0653143dd130582d15820054d6` 已通过真实 Chrome：修改 JS/CSS 后预览新版本、图片/按钮/Shadow DOM、等待异步清理并停止旧定时器、typed Stop、清理抛错时不挂新 UI。原始身份与证据见 [P3 CI 摘要](../../../docs/framework/evidence/local-dev-r22-c036/p3-ci-summary.json)，剩余边界见 [交付报告](../../../docs/framework/local-development-r22-report.zh-CN.md)。
