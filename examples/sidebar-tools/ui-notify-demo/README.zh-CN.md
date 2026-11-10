# OpenDesk · 通知组件实验室（可安装 Sidebar Tool）

**用户目标：**用真实可点击按钮观察 OpenDesk 框架 `OpenDeskTool.ui.notify` 的常见通知样式和行为，同时从原沙箱验证合法/非法参数。不是提示词快捷按钮，不是框架更新中心，也不是独立 Chrome 扩展。

## 最短体验

1. 在 OpenDesk Browser 原 Side Panel「扩展」中选择 **导入本地应用**，导入同目录的 `ui-notify-demo.opendesk-tool.json`（应由正式打包器生成并通过 `--check-project`）。
2. 按原安装器阅读身份和零额外 capabilities，点击确认；进入「通知组件实验室」。
3. 点击「成功」「警告」「错误」「重复消息 ×2」「手动关闭」「非法参数拒绝」，观察宿主 Toast、分组计数与工具内的状态文本。
4. 切换位置下拉框，可分别查看六个定位。每活动实例每 60 秒最多 **3 条**；超额未展示是预期限频，不应认作功能失败。等待限频窗口或重新打开演示工具再试。

## 业务与安全边界

- `ui.notify({message})` 完全兼容旧版；新增白名单参数 `type/caption/position/timeout/group`。
- 无 capabilities、无 Page/Controller/Chrome 权限、无外部脚本、无 HTML 注入、无自动安装、无网络或数据读写。
- `notify` 返回 true 只是“已向 Host 提交”，不是“用户已看到”，不能作为业务成功或可信安装的证据。
- 旧 Browser 尚未支持新参数时，展示拒绝/回退是正常兼容表现，不擅自声明旧版支持。
- 因为它是独立安装的工具，而非 Browser 固定源码，**增加新 SDK 能力仍必须先部署 Browser 本体代码**；只安装这个 JSON 无法升级旧 Host 的 `ui.notify`。

## 官方打包与本机验收

在仓库根目录执行：

```sh
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ui-notify-demo --out artifacts/sidebar-tools/ui-notify-demo/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ui-notify-demo --promote-from artifacts/sidebar-tools/ui-notify-demo/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ui-notify-demo --check-project
node --test tests/environment/sidebar-tool-ui-notice.test.mjs
```

不修改项目已晋升的 JSON 来调试。Node/打包验收不等于已安装 Chrome 可见性验收；后者必须记录真实截图或可核对的浏览器观察。
