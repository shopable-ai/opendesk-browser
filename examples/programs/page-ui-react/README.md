# React 网页增强（Page USER_SCRIPT）

> **R24.3 新候选（尚未完成 Mac Chrome 验收）：** 该示例已修改为只编译业务组件、复用扩展内置的固定 React 19.2.0 运行时，避免历史 R24.1 将整个框架打包进执行 JS 的问题。已新增真实 Vite → OpenDesk 构建 CI，但在 CI 和真实 Chrome 回执通过前不得把它视为已正式可运行。这里使用当前示例的语法，不代表已完成任意通用 JSX/SFC 的单命令自动转换。

## R24.3 当前候选的最短开发路径

需要已正确安装/配对 OpenDesk CLI、Native Host 与 Chrome 扩展。第一次先在**仓库根目录**运行 `npm ci --ignore-scripts --no-audit --no-fund` 准备原项目构建器；然后在**本项目目录**分别打开两个终端：

```sh
# 终端 A：首次安装当前项目锁定的 Vite 编译依赖，以后保持 watch
npm ci --ignore-scripts --no-audit --no-fund
npm run build:framework -- --watch

# 等 Vite 第一次成功创建 src/compiled/framework.js 之后，打开终端 B：
opendesk browser dev .
```

编辑 `src/framework.jsx` 保存后，Vite watch 只更新轻量 JS；R23 本地项目服务监控生成文件并自动准备。**保存不执行网页脚本**，须在已授权的标准测试页通过 Side Panel 「开发 → 本地项目 → 运行本地项目」明确运行。测试网页服务在仓库根目录执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，地址为 `http://127.0.0.1:43111/demo-form.html`。

`opendesk browser dev .` **不会运行 Vite 或项目 npm scripts**；如果没有先生成 `src/compiled/framework.js`，目录可能只显示为 Workspace。如果希望完全不安装 npm / Vite，请使用 [React Direct](../page-ui-react-direct/README.md)。该候选的局限和验收门槛见 [R24.3 记录](../../../docs/framework/workstreams/page-ui-shared-runtime-r243-20261011.md)；下文 R24.1 体积数字是**修复前的历史结果**。


这是真正的 React 19 JSX + ReactDOM 示例，不是 Side Panel。编译后的 JavaScript 仍由 **现有** OpenDesk `@opendesk/ui` / Page Runtime 执行，组件挂在 `ui.content`，销毁时调用 `root.unmount()`，修改 `#lab-text #sample-text` 并可撤销。

## 开发与构建

```sh
# package-lock.json 已由 R24.1 GitHub Actions 的真实 npm 安装锁定；直接 npm ci
npm ci --ignore-scripts --no-audit --no-fund
npm run build:framework
cd ../../..
node scripts/validate-program-project.mjs examples/programs/page-ui-react
npm run build:program -- examples/programs/page-ui-react --mode development
```

从仓库根目录运行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，在 Chrome 打开 `http://127.0.0.1:43111/demo-form.html`，确认用户脚本开关和站点授权，通过 Sidebar/MCP **显式手动试运行**。点击高亮/撤销按钮，然后用原 previewId Stop。预览不是安装或自动启动；`pageRules` 已将脚本匹配范围限定为 43111 端口，但 Chrome 网站权限和安装批准仍必须独立核对。

**真实构建结论（R24.1 CI）：** 依赖已锁定，Vite JSX 预编译通过，但产物为 **961,871 字节**，实际 OpenDesk 项目校验报 `E_PROJECT_LIMIT`；尚未满足 100000 字节 Page 输出预算，真实 Chrome NOT_TESTED。不得绕过容量或通过 CDN/eval 冒充可运行。
