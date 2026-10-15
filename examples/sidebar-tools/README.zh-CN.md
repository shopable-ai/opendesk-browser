# 「扩展」应用（Sidebar Tool）示例与统一开发入口

**正式产品入口**：Side Panel「扩展」中的「应用」类型；普通用户不必下载 `examples/` 源码。技术包、目录和宿主协议不因产品改名而迁移。与 Page「网页增强」的区别见 [R4 产品规格](../../docs/product/sidebar-ui-spec.zh-CN.md)。

**同类工具的统一开发方法**：先读 [docs/api/sidebar-tool-development.zh-CN.md](../../docs/api/sidebar-tool-development.zh-CN.md)；查询当前工具包 schema、操作与权限读 [docs/api/sidebar-tools.zh-CN.md](../../docs/api/sidebar-tools.zh-CN.md)；交给 AI/Codex 编辑则读 [工具开发 Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md) 及根目录 [AGENTS.md](../../AGENTS.md)。

| 入口 | 适用场景 | 示例/模板 |
| --- | --- | --- |
| **原生 HTML/CSS/JS** | 新手、轻量工具、最小包和最快迭代 | [零参数世界／OpenDeskTool 可导入 Demo](runtime-globals-demo/README.md)、[quick-notes](quick-notes/README.md)、[markdown-workbench](markdown-workbench/README.md)、[Cookie Editor 本地 UI](cookie-editor/README.zh-CN.md) |
| **React 预编译** | 组件较多，需要 React 状态/UI | [react-starter](react-starter/README.md) |
| **Vue 预编译** | 组件较多，需要 Vue | [vue-starter](vue-starter/README.md) |
| **受信任网页目录** | 官方站点授权、可信 Content Script | [reading-toc](reading-toc/README.md) |
| **受信任网页剪藏** | 文章/选区，按网站独立授权 | [web-markdown-clipper](web-markdown-clipper/README.md) |
| **受信任 ChatGPT 内容保存** | 官方内容抓取、可信数据服务、Workspace 交接 | [knowledge-inbox](knowledge-inbox/README.zh-CN.md)、[专项开发](knowledge-inbox/DEVELOPMENT.zh-CN.md) |

**目前的源码组织原则（2026-10-14）**：一个 `examples/sidebar-tools/<id>/` 就是一个工具的独立项目目录，不是要立即创建新的仓库。官方工具此处的 UI 文件是真正的发行源，不是镜像或随手写的样例。确实需要 Chrome 后台、网页 Content Script、可信授权或 DNR 的产品（如 Stay Focus），继续使用现有 `src/<feature>/` 预编译模块和固定入口；普通工具不需要这些模块。不要把沙箱 UI 运行时脚本注入 SW/Content Script，也不要因目录整齐而改写现有 Catalog、Host、权限或构建器。具体执行世界和单向依赖规则参阅 [统一工具开发规范](../../docs/api/sidebar-tool-development.zh-CN.md#一个项目多种执行环境不是多个插件)。

**最小工具与全局变量区别**：`runtime-globals-demo/` 是可打包安装的独立小工具。它只能访问工具自身的 `OpenDeskTool`，没有 Controller 的词法 `page`，也不会继承 `_`、`dayjs`。可信 Side Panel Host 若要用 Day.js，应在[自己受信的入口](../libs/trusted-imports/README.zh-CN.md)静态 import，不是向用户工具 iframe 隐式注入。

普通工具的标准源码是 `tool.config.json` + `src/index.html` / `style.css` / `main.js`；React/Vue 先编译为单文件经典 JS 和静态 CSS，再交给**同一个** `scripts/build-sidebar-tool.mjs`。其他官方工具可能还修改 `src/` 内的可信扩展代码，不能假定普通工具通过 JSON 就获得相同能力。

当前八个官方候选为 reading-toc、web-markdown-clipper、quick-notes、markdown-workbench、knowledge-inbox、time-review、stay-focus、cookie-editor，均由根目录 `official-tools/catalog.json` 登记；Time Review 为可选安装，其余工具遵循 Catalog 中各自的预装策略。版本、能力与内容由各项目配置和源码生成，具体见 [官方 Catalog](../../docs/api/official-tools-catalog.zh-CN.md)。React/Vue starter 仍是本地示例，不属于官方发行。所有源码目录都不需要维护第二份生成 JSON。

最短打包命令（在仓库根执行）：

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes
# 可导入文件输出至 artifacts/sidebar-tools/quick-notes/<version>/quick-notes.opendesk-tool.json
```

**正式交付规则（2026-10-15）：** 默认 `artifacts/` 只放本地候选；确定要让用户从当前工具目录直接安装时，先用 `--out artifacts/sidebar-tools/<id>/candidate.opendesk-tool.json` 测试，再用同一 `scripts/build-sidebar-tool.mjs` 的 `--promote-from artifacts/sidebar-tools/<id>/candidate.opendesk-tool.json` 显式晋升，最后执行 `--check-project`，将唯一正式包 `examples/sidebar-tools/<id>/<id>.opendesk-tool.json` 与源码一起提交。普通编译不会自动覆盖它；同一目录不留大量版本/日期后缀包。详见 [打包 Skill](../../.agents/skills/opendesk-sidebar-tool-package/SKILL.md)。

需要反复查看但不安装的场景，用 `node scripts/stage-sidebar-tool.mjs examples/sidebar-tools/<id>` 生成明确标记 `STAGED_NOT_INSTALLED` 的只读预览快照；有 Native Workspace 环境时需要用户亲自点击只读预览。React/Vue 的 watch 还要遵守 `dist/build-ready.json` 完整构建回执，详见统一开发方法。

**不要直接开发生成后的 JSON；不要把工具 JSON 当成 Chrome 的解压扩展目录**。要加载或更新整个浏览器扩展时，才使用 `npm run build` 生成的 `dist/production/`。

Stay Focus 的独立授权、额度、Chrome 拦截与清理见 [专注工具说明](stay-focus/README.zh-CN.md)。

Time Review 的安装、空闲权限和启停步骤见 [时间回顾说明](time-review/README.zh-CN.md)。首次使用后台需更新扩展；之后纯 UI 改动可独立打包更新工具。


## Browser SDK v2（R1.3）

[Browser SDK 示例](browser-sdk-r13/README.zh-CN.md) 包含可直接导入的 v2 选区笔记、v1 能力查询工具和普通网页拒绝特权的 HTTP 测试页。v2 菜单内容须先在当前网站完成可信用户授权；R1.3 原生 Chrome 验收另行记录。

## Browser SDK R2–R4：可安装真实接口验证工具

[Tabs、Side Panel、HTTP、网络观察、截图与操作管理验证工具](browser-sdk-r2/README.zh-CN.md) 提供一个直接导入的独立 v2 JSON 安装包。它使用 `OpenDeskSDK.browser`，不需要修改或重新构建扩展。安装前需审阅其 capability，执行敏感操作时还要在可信 Side Panel 点击单次确认。该示例不等于 Mac Chrome 原生验收 PASS。
