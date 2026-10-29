# Markdown 工作台

工具 ID：`markdown-workbench`。当前配置版本以 [tool.config.json](tool.config.json) 为准（以当前配置和经过校验的正式包为准）。这是离线 Markdown 编辑器，不自动保存到本机文件或云端；正式权限只有 `user.export`。

## 使用

在「扩展」中心安装并打开 Markdown 工作台。工具宿主负责显示产品名，内部直接展示文件操作、编辑/预览/分栏切换和编辑区。

- 顶部直接提供「导入」「复制」、主要操作「下载 .md」及右侧「清空」图标；不再有只包含一个按钮的「更多」菜单。清空空内容时按钮禁用；有内容时点击出现靠近操作按钮的小型确认浮层，取消或 Esc 均不丢稿，确认后再清空。
- 编辑过程中切换预览不会丢失内容；外部图片仅显示引用，不自动加载；不执行 HTML、脚本。
- 导入替换当前未保存正文需要明确确认；取消保留原稿。
- 「下载 .md」只表示**已请求浏览器下载**。必须在下载记录或文件系统确认实际文件存在；已发起下载绝不是自动持久保存。关闭窗口前请主动确认或备份。
- 自动复制失败时选择编辑区，提示按 Ctrl/Cmd+C 手动复制。
- 独立普通工具保留自己的文件操作与布局；已验证的正式宿主可提供编辑区可用高度。

## 构建和发行

```sh
npm run build:sidebar-tool -- projects/markdown-workbench
```

工具目录保留唯一正式安装包 `markdown-workbench.opendesk-tool.json`。正式交付须先生成候选并运行定向测试，再通过现有 `--promote-from` 晋升并执行 `--check-project`，不能手动编辑安装包。官方 Catalog 使用经过核验的同源版本。已安装工具须按真实版本、来源、摘要和用户审阅原位更新；仅提交源码不代表安装包已经更新。

## 同源离线交互预览（R1.0）

从仓库根目录使用现有**唯一** `scripts/preview/build-preview.mjs`：

```sh
node scripts/preview/build-preview.mjs --tool markdown-workbench --surface side-panel --scenario success --theme light --width 360
```

默认输出 `artifacts/previews/markdown-workbench/side-panel-success-light-360.html`，同目录有 `.context.json`。可将 `--width` 改为 320/400/440、`--theme` 改为 dark、`--scenario` 改为 empty/error/permission-denied/untrusted。

生成器载入**真实** `src/index.html`、`src/style.css`、`src/main.js` 与 canonical Shared UI；只在 SDK 边界模拟复制和下载。预览不写真实剪贴板或文件，`mock=true` 不代表 Chrome 或 Native PASS。预览带源码 commit、UI/设计摘要；须在具备完整仓库的本地环境执行生成并打开核对。

## 既有操作保护（R5.2）

编辑中导入替换文件、清空全部文本使用页内「继续操作 / 取消」，而非 `confirm()` 或 `beforeunload`；用户输入变化时，迟到的异步导入不得覆盖新内容。保留这些语义及存储权限边界。

## R1.1 · 单项菜单与浮层修复（2026-10-26）

问题：旧 R1.0 将唯一危险操作「清空编辑区」放进「更多」，展开后挤占按钮和编辑区空间，尤其 320–360px 下难以理解。R1.1 将清空改为 34px 图标按钮，并把确认框定位在工具栏附近，不改变编辑器布局；保留 Markdown 编辑、无外部图片加载、导入保护及下载语义。去除重复的底部保存状态文字。正式代码：`src/index.html`、`src/style.css`、`src/main.js`；设计没有引入第二套 Shared UI 或新的权限。

聊天体验预览 `CHAT_ADAPTER_NOT_SOURCE_HTML` 是独立模拟文件，不等同于本目录正式 HTML/JS；真实同源验证仍通过上文 `scripts/preview/build-preview.mjs`。本轮静态/隔离 JavaScript 验证不构成原生安装或已晋升版本证明。测试包含 `tests/environment/four-tools-ux-r1.test.mjs`、`tests/environment/markdown-tools-r22.test.mjs` 和本目录 `tests/scroll-anchor.test.mjs`。
