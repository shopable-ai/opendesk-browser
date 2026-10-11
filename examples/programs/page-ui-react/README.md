# React 网页增强（Page USER_SCRIPT）

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
