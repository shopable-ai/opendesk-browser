# 本地 Page UI 直接预览

一次授权此目录给 OpenDesk MCP，`opendesk.dev.attach` 绑定此目录。在 Chrome 打开项目 `pageRules` 允许的 demo-form.html，开启扩展的「允许用户脚本」。

调用 `opendesk.dev.run({bindingId, requestId})`。它返回 `previewId`，用 `opendesk.dev.result({previewId})` 获取实际 USER_SCRIPT 回执。页面显示 Shadow DOM 按钮、计数器和受控 PNG。

修改 `src/model.js` 的 `label` 与 `step`，修改 `assets/ui.css` 的颜色，再调用 run；无需 build、JSON、上传或重新安装扩展。源码无效会停止此次预览，不回退旧代码。

Page 预览没有 Controller runId，不会创建正式 Task。只显式点击页面按钮改变这个 Demo 的计数器，不操作网站表单、不自动执行业务行为。关闭按钮走 `createPageUI().destroy()`。通用第三方脚本不能被当作 Controller 强制停止。

正式打包安装仍使用仓库 `build:program` 命令，与本地预览分开。
