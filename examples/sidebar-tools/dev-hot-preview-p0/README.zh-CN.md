# 本地工具热更新 P0

这是一个真实的最小 Sidebar Tool 源码项目，**不是正式安装包，也没有浏览器权限**。仅用于验证新工具首次开发与现有开发预览链路。不要将此工具加入官方 Catalog。

## 源码与入口

- 工具 ID：`dev-hot-preview-p0`；开发版本：`0.1.0`。A/B 标记是源码验证内容，不代表安装升级。
- 业务源码：`src/index.html`（标题与版本文字）、`src/style.css`（按钮样式）、`src/main.js`（按钮计数与反馈）。
- 宿主热更新框架、Native Workspace、watcher 和预览会话均使用仓库已有实现，不在本项目重复创建。

## 开发预览

在仓库根目录（已按现有 Native 工作流授权此项目来源）执行：

```sh
node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/dev-hot-preview-p0
node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/dev-hot-preview-p0
```

如果已有有效 watcher，不要启动第二个。通过 OpenDesk「开发 → 本地项目 → 实时开发预览 ↗」或已授权 Native Workspace「只读预览工具 ↗」明确打开一次。上述命令只生成本地快照，不安装工具或申请权限。

## 最小验收动作

1. 初始版本 A：预览显示标题、蓝色按钮和「源码版本 A」；点击后显示「JS 版本 A · 已点击 1 次」。
2. 保持同一预览会话，修改 `src/index.html` 中的「源码版本 A」为「源码版本 B」，保存并目视确认原预览自动更新。
3. 保持同一预览会话，修改 `src/main.js` 中点击反馈字符串「JS 版本 A」为「JS 版本 B」，保存并再次点击，目视确认新版反馈。
4. 记录工具 ID、同一 previewId、初始/两次更新的快照 SHA 和可见结果。仅 watcher 日志或 SHA 变化不能证明 Chrome 更新成功。

修改不会自动安装、升级或覆盖同 ID 正式工具。不需要业务存储、网站操作、React/Vue 或额外 SDK。
