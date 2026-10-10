# Vue 笔记：独立源码工程

这是示例项目，不是已安装的工具；依赖安装或源码执行不能由浏览器悄悄进行。

```bash
cd examples/sidebar-tools/vue-starter
npm install --ignore-scripts --no-audit --no-fund
npm run build
node ../../../scripts/stage-sidebar-tool.mjs "$PWD"
```

输出的 `output` 是 `.opendesk-preview/<ID>/<SHA-256>.opendesk-tool.json` 的**尚未安装**快照。
请在扩展「工具」→「导入」选择该 JSON，查看能力、确认安装、主动打开；
它可在 Side Panel 或 ↗ 全页面运行。无需重编整个扩展。

明确执行 `npm run build:watch` 可以持续构建；成功时 Vite 写入
`dist/build-ready.json`（buildId 与 JS/CSS 摘要）。这个事件**不是**“扩展已热同步”：
每次要交付仍须重新调用 `stage-sidebar-tool.mjs`、人工审阅安装。
构建失败或写入产物未完成时不能生成新的有效快照。
不得以 `vite build --watch && pack` 作为每轮构建的触发器。

请审阅并提交本模板生成的 `package-lock.json`，后续正式项目使用 `npm ci`。
运行产物包含本地打包的框架，无 CDN、模块分块、远程脚本或宿主全局 React/Vue 假设。
现有校验对 JS 220,000 字符、全包 320,000 字节限额生效。
