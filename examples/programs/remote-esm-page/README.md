# HTTPS ESM 导入示例

`src/main.js` 使用标准 URL `import`，**不是** `@require`，也不会让运行中的 Chrome 从 CDN 加载代码。

首次执行（需联网）：

```bash
npm run build:program -- examples/programs/remote-esm-page --lock-remote
```

首次构建后审阅 `opendesk.remote-lock.json` 和 `.opendesk/remote-cache/`，并连同源码提交；依赖发生变化时才再次显式使用 `--lock-remote` 添加未锁定的 URL。

之后用以下命令离线重建，不再访问网络：

```bash
npm run build:program -- examples/programs/remote-esm-page
```

将输出的 `program.opendesk-draft.json` 导入 Sidebar 的现有草稿入口，选定 `https://example.com/` 页面进行试运行。构建成功不等于任务已安装或 Chrome 已验收。

详细规范：[HTTPS ESM URL 导入 R1](../../../docs/architecture/browser-framework/https-esm-imports-r1.zh-CN.md)。
