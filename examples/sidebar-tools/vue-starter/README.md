# Vue 笔记：独立源码工程

这是示例项目，不是已安装的工具；依赖安装或源码执行不能由浏览器悄悄进行。

**作为起点使用**：工具 ID 为 `vue-notes-starter`，已有笔记业务与固定 Vue 依赖。新项目只复用需要的源码/配置，重设身份、版本与最小能力；不复制旧 dist、收据或正式包。简单 HTML 工具选[最小 JS 示例](../runtime-globals-demo/README.md)，不引入 Vue/Vite。tests/preview/assets/locales 和项目级 AGENTS 按[唯一目录合同](../../../docs/architecture/extension-project-layout.zh-CN.md#23-模板选择复用已有-starter)选择，不预建空目录。

```bash
cd examples/sidebar-tools/vue-starter
npm ci --ignore-scripts --no-audit --no-fund
npm run build
node ../../../scripts/stage-sidebar-tool.mjs "$PWD"
```

输出的 `output` 是 `.opendesk-preview/<ID>/<SHA-256>.opendesk-tool.json` 的**尚未安装**快照。
它只供源码锁预览，不作正式交付包。日常迭代优先[开发 → 本地项目 → 在侧栏调试](../../../docs/api/sidebar-tool-development.zh-CN.md#直接调试与开发数据隔离2026-10-29)，保持开发数据/授权与安装版隔离；Workspace 只读预览仍是只读。无需为纯工具改动重编整个扩展。

本轮确需交付安装包时，按[唯一打包 Skill](../../../.agents/skills/opendesk-sidebar-tool-package/SKILL.md)从当前构建生成候选、完成相关验证，再 `--promote-from`、`--check-project` 晋升项目唯一正式 JSON；经「扩展 → 更多操作 → 导入本地工具包」审阅确认安装/更新并主动打开。仅改本说明不触发重打或为示例补包。

明确执行 `npm run build:watch` 可以持续构建；成功时 Vite 写入
`dist/build-ready.json`（buildId 与 JS/CSS 摘要）。这个事件**不是**“扩展已热同步”：
正式交付仍须走上述候选验证/晋升与原安装审阅，不把 stage 当成晋升。
构建失败或写入产物未完成时不能生成新的有效快照。
不得以 `vite build --watch && pack` 作为每轮构建的触发器。

本项目已有 `package-lock.json`，默认用 `npm ci` 复用固定依赖；仅在实际依赖变化时更新并审阅锁文件。验证按本次行为选择，不默认构建 React 或执行双 Starter 验收。
运行产物包含本地打包的框架，无 CDN、模块分块、远程脚本或宿主全局 React/Vue 假设。
现有校验对 JS 220,000 字符、全包 320,000 字节限额生效。

### 自动准备新的开发快照（仍不自动安装）

在本地明确打开两个终端：

```bash
# 终端一：构建监听，只在 Vite 成功生成 JS/CSS 时更新 build-ready.json
npm run build:watch

# 终端二：在相同项目目录，只观察已完成的产物和指纹
node ../../../scripts/watch-sidebar-tool.mjs "$PWD"
```

监听器只运行项目打包器，**不会调用 npm、shell、浏览器任务或真实写入 API**。
失败时保留上一份快照并报告 `BUILD_OR_PACKAGE_FAILED`。Workspace 必须用户明确点击「只读预览工具」，才能显示本地快照。
