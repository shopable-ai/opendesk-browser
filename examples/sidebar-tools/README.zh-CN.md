# 可安装 Side Panel 小工具示例与统一开发入口

**同类工具的统一开发方法**：先读 [docs/api/sidebar-tool-development.zh-CN.md](../../docs/api/sidebar-tool-development.zh-CN.md)；查询当前工具包 schema、操作与权限读 [docs/api/sidebar-tools.zh-CN.md](../../docs/api/sidebar-tools.zh-CN.md)；交给 AI/Codex 编辑则读 [工具开发 Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md) 及根目录 [AGENTS.md](../../AGENTS.md)。

| 入口 | 适用场景 | 示例/模板 |
| --- | --- | --- |
| **原生 HTML/CSS/JS** | 新手、轻量工具、最小包和最快迭代 | [quick-notes](quick-notes/README.md)、[markdown-workbench](markdown-workbench/README.md) |
| **React 预编译** | 组件较多，需要 React 状态/UI | [react-starter](react-starter/README.md) |
| **Vue 预编译** | 组件较多，需要 Vue | [vue-starter](vue-starter/README.md) |
| **受信任网页目录** | 官方站点授权、可信 Content Script | [reading-toc](reading-toc/README.md) |
| **受信任网页剪藏** | 文章/选区，按网站独立授权 | [web-markdown-clipper](web-markdown-clipper/README.md) |
| **受信任 ChatGPT 内容保存** | 官方内容抓取、可信数据服务、Workspace 交接 | [knowledge-inbox](knowledge-inbox/README.zh-CN.md)、[专项开发](knowledge-inbox/DEVELOPMENT.zh-CN.md) |

普通工具的标准源码是 `tool.config.json` + `src/index.html` / `style.css` / `main.js`；React/Vue 先编译为单文件经典 JS 和静态 CSS，再交给**同一个** `scripts/build-sidebar-tool.mjs`。其他官方工具可能还修改 `src/` 内的可信扩展代码，不能假定普通工具通过 JSON 就获得相同能力。

当前五个官方候选为 reading-toc、web-markdown-clipper、quick-notes、markdown-workbench、knowledge-inbox，均由根目录 `official-tools/catalog.json` 登记且默认未安装。版本、能力与内容由各项目配置和源码生成，具体见 [官方 Catalog](../../docs/api/official-tools-catalog.zh-CN.md)。React/Vue starter 仍是本地示例，不属于官方发行。所有源码目录都不需要维护第二份生成 JSON。

最短打包命令（在仓库根执行）：

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes
# 可导入文件输出至 artifacts/sidebar-tools/quick-notes/<version>/quick-notes.opendesk-tool.json
```

需要反复查看但不安装的场景，用 `node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/<id>` 生成明确标记 `STAGED_NOT_INSTALLED` 的只读预览快照；有 Native Workspace 环境时需要用户亲自点击只读预览。React/Vue 的 watch 还要遵守 `dist/build-ready.json` 完整构建回执，详见统一开发方法。

**不要直接开发生成后的 JSON；不要把工具 JSON 当成 Chrome 的解压扩展目录**。要加载或更新整个浏览器扩展时，才使用 `npm run build` 生成的 `dist/production/`。


## Browser SDK v2（R1.3）

[Browser SDK 示例](browser-sdk-r13/README.zh-CN.md) 包含可直接导入的 v2 选区笔记、v1 能力查询工具和普通网页拒绝特权的 HTTP 测试页。v2 菜单内容须先在当前网站完成可信用户授权；R1.3 原生 Chrome 验收另行记录。