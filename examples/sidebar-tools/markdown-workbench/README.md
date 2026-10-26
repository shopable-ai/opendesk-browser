# Markdown 工作台

工具 ID：`markdown-workbench`。当前配置版本以 [tool.config.json](tool.config.json) 为准（本轮源码核查为 `1.0.5`）。这是离线 Markdown 编辑器，不自动保存到本机文件或云端；正式权限只有 `user.export`。

## 使用

在「扩展」中心安装并打开 Markdown 工作台。工具宿主负责显示产品名，内部直接展示文件操作、编辑/预览/分栏切换和编辑区。

- 上方导入、复制、下载是常用操作；清空位于「更多」，执行前会要求确认。
- 编辑过程中切换预览不会丢失内容；外部图片仅显示引用，不自动加载；不执行 HTML、脚本。
- 导入替换当前未保存正文需要明确确认；取消保留原稿。
- 「下载 .md」只表示**已请求浏览器下载**。必须在下载记录或文件系统确认实际文件存在；已发起下载绝不是自动持久保存。关闭窗口前请主动确认或备份。
- 自动复制失败时选择编辑区，提示按 Ctrl/Cmd+C 手动复制。
- 独立普通工具保留自己的文件操作与布局；已验证的正式宿主可提供编辑区可用高度。

## 构建和发行

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/markdown-workbench
```

官方 Catalog 从此目录源码构建 `dist/production/official-tools/markdown-workbench/markdown-workbench.opendesk-tool.json`；目录不维护生成包副本。已安装工具须按真实版本、来源、摘要和用户审阅执行原位更新；仅提交源码不代表安装包已经更新。

## 同源离线交互预览（R1.0）

从仓库根目录使用现有**唯一** `scripts/preview/build-preview.mjs`：

```sh
node scripts/preview/build-preview.mjs --tool markdown-workbench --surface side-panel --scenario success --theme light --width 360
```

默认输出 `artifacts/previews/markdown-workbench/side-panel-success-light-360.html`，同目录有 `.context.json`。可将 `--width` 改为 320/400/440、`--theme` 改为 dark、`--scenario` 改为 empty/error/permission-denied/untrusted。

生成器载入**真实** `src/index.html`、`src/style.css`、`src/main.js` 与 canonical Shared UI；只在 SDK 边界模拟复制和下载。预览不写真实剪贴板或文件，`mock=true` 不代表 Chrome 或 Native PASS。预览带源码 commit、UI/设计摘要；须在具备完整仓库的本地环境执行生成并打开核对。

## 既有操作保护（R5.2）

编辑中导入替换文件、清空全部文本使用页内「继续操作 / 取消」，而非 `confirm()` 或 `beforeunload`；用户输入变化时，迟到的异步导入不得覆盖新内容。保留这些语义及存储权限边界。
