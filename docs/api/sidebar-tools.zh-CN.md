# Side Panel 小工具开发与 TOC 手工验收

本页是可安装的 `opendesk.sidebar-tool.v1` **工具包**开发入口。它不是 Controller、Page USER_SCRIPT 或另一款 Chrome 扩展。接口定义以 `src/ui/sidebar-tools/package.js` 和 `src/ui/sidebar-tools.js` 当前源码为准。

相关资料：[API 首页](README.md) · [工具合同](../product/sidebar-custom-tools-r1.zh-CN.md) · [阅读目录示例](../../examples/sidebar-tools/reading-toc/README.md) · [R4.4 证据](../framework/workstreams/reading-toc-r44-20261011.md)

## 文件放在哪里

| 文件或目录 | 含义 |
| --- | --- |
| `examples/sidebar-tools/reading-toc/tool.config.json` | 官方 TOC 的工具 ID、版本 1.0.2 和权限声明 |
| `examples/sidebar-tools/reading-toc/src/index.html`、`style.css`、`main.js` | Side Panel 工具界面可维护源码 |
| `src/reading-toc/` | 扩展受信任的网页目录索引、视图、导航及授权 |
| `src/sidebar-tools/reading-toc.opendesk-tool.json` | 已跟踪的官方内置 JSON，随扩展一起构建 |
| `artifacts/sidebar-tools/reading-toc/1.0.2/reading-toc.opendesk-tool.json` | 单独执行工具打包命令后，**本机生成**的可导入包 |
| `dist/production/`、`dist/development/` | **本机生成**的完整 Chrome 扩展目录，在 Chrome 加载目录而非 JSON |
| `dist/production/sidebar-tools/reading-toc.opendesk-tool.json` | 正式扩展内置的官方工具资源 |
| `artifacts/opendesk-browser-production.zip` | 可选：另外执行 `npm run pack` 后产生的整个扩展 ZIP |

`dist/` 和 `artifacts/` 在 `.gitignore` 中；`git pull` 不会生成它们。修改示例 `src/main.js` 后执行工具打包**不会自动替换** `src/sidebar-tools/` 内置包；官方发行要同步资源、重新构建并经用户确认更新。

## 本地构建与加载

先核对 `git status --short --branch`，确认没有其他 Agent 正在构建或占用 Chrome Profile。工作区安全时才从 `main` 快进同步。

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
npm ci --ignore-scripts --no-audit --no-fund
npm run build
node scripts/verify-package.mjs dist/production
npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc
```

`npm run verify` 同时检查 production 和 development；若只构建生产包，使用上述单目录验证。需要开发构建再执行 `npm run build:dev`。持续修改扩展源码使用 `npm run dev`，参见[扩展开发指南](../framework/extension-development-r131.zh-CN.md)。

打开 `chrome://extensions` → 开发者模式 → **加载已解压的扩展程序** → 选择 `dist/production/` 文件夹（内有 `manifest.json`）。已加载时点「重新加载」，刷新原网页以重新注入更新后的 Content Script。

Side Panel →「工具」可以走两条等价的审批路径：使用官方「阅读目录 → 安装／更新」，或点「＋ 导入」选择上面的 `artifacts/.../reading-toc.opendesk-tool.json`。明确确认安装以后，在工具行单独允许当前网站 Origin（◎）；**安装不会自动授予网页访问权限**。

## 手动测试页面和步骤

本地测试 HTTP 服务使用已有 `examples/tasks` 目录；先用 `lsof -nP -iTCP:43111 -sTCP:LISTEN` 核对端口归属，空闲时运行：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

浏览器地址：

- `http://127.0.0.1:43111/reading-toc-article.html`：单 H1、20 个 H2、滚动跟随、最后章节高亮。
- `http://127.0.0.1:43111/reading-toc-conversation.html`：多个模拟 AI 回答、标题层级、来源自动跟随及手动固定。
- `http://127.0.0.1:43111/demo-form.html`：原来的通用 Page/Locator 测试入口，不替换。

需要验证：无授权时无目录 → 批准当前 Origin → 智能概览、当前章节、完整目录 → 标题导航与阅读进度 → 目录六点手柄拖动、左右磁吸、记忆、归位 → 关闭 Side Panel 后页内仍可用 → 撤销网站权限或卸载后目录清除。测试多回答时验证「自动跟随」和手动固定来源。受控 fixture 不是已登录 ChatGPT/知乎的真实页面证据；后者及 Mac 200% 缩放仍需单独验收。

## 知识收件箱：官方可信能力与普通工具的区别

[知识收件箱项目开发指南](../../examples/sidebar-tools/knowledge-inbox/DEVELOPMENT.zh-CN.md) 介绍了 `examples/sidebar-tools/knowledge-inbox/` 的源码打包与 `src/sidebar-tools/knowledge-inbox.opendesk-tool.json` 的内置更新。`src/knowledge/` 的 `page.capture`、`knowledge.store`、`knowledge.*` 依赖官方受信任页面捕获和后台服务，**不属于第三方工具可任意使用的通用 API**。其 200 条 / 4 MiB 容量也是工具专有存储，不等同于普通沙箱 `storage.local`。普通使用请看 [用户 README](../../examples/sidebar-tools/knowledge-inbox/README.zh-CN.md)；AI 开发请看 [AGENTS.md](../../examples/sidebar-tools/knowledge-inbox/AGENTS.md) 和 [Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)。

## 自己制作可安装工具

每个工具项目放在 `examples/sidebar-tools/<id>/` 或独立目录，包含 `tool.config.json` 及 `src/index.html`、`src/style.css`、`src/main.js`。config 描述稳定 `id`、三段 `version`、标题、`capabilities`、`files` 与可选本地图片 `assets`。经典 JavaScript 在隔离 iframe 中运行，入口对象是 `globalThis.OpenDeskTool`，提供 `root` 和 `request(operation,payload)`。React/Vue/ESM 源码需要先本地编译成单文件经典 JS 与静态 CSS，不能在沙箱里动态导入远端代码。

常见授权操作为 `currentPage.info`、`storage.get`、`storage.set`、`tasks.open`、`toc.snapshot`、`toc.navigate`、`clip.article`、`clip.selection`、`clip.link`、`clipboard.writeText`、`file.download`。必须在 config 明确声明对应的 `currentPage.read`、`storage.local`、`tasks.open`、`page.toc`、`page.clip`、`user.export`，并满足独立网站批准与宿主审核。内置专用能力不能直接视为第三方通用 API。

TOC 工具中，在获批网页调用 `request('toc.snapshot')` 可获得 `items/sources/activeId/overview`；`request('toc.navigate',{id,sourceId})` 使用快照中对应项的真实私有 ID 导航，而非网页 DOM id。沙箱没有任意网页 DOM、`chrome.tabs`、Native Host 直通权限。

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes
# 默认：artifacts/sidebar-tools/quick-notes/<version>/quick-notes.opendesk-tool.json
```

不能用 `.opendesk-task.json` 替代工具包。当前包大小上限 320,000 字节、最多安装 12 个；单个存储值约 8 KiB，总数据约 32 KiB。能力声明、HTML/CSS/JS 字段和 CSP 限制以实时源码为准。

后续以 [R4.4 工作流](../framework/workstreams/reading-toc-r44-20261011.md) 的固定源码和受控 Chrome 记录为基线；真实登录 ChatGPT/知乎、用户 Mac Profile 和全框架 F3/ZIP 不能冒称已验证。
