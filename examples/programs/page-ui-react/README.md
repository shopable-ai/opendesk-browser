# React 网页增强（Page USER_SCRIPT）

> **当前状态（2026-10-11）：可验证 JSX 的 Vite 转换，但不是可运行的 OpenDesk Page 成品。** 原始 JSX 示例构建时将 React / ReactDOM 打进 `src/compiled/framework.js`，历史 Vite 输出 961,871 字节，超过 OpenDesk 单个源文件 256 KiB 限制，项目验证会报告 `E_PROJECT_LIMIT`。仅看到 Vite `build` 成功、工作区打开或运行 `opendesk browser dev .` **都不代表脚本已经可以在 Chrome 执行**。
>
> **需要立即在浏览器中运行 React UI：请使用 [page-ui-react-direct](../page-ui-react-direct/README.md)**。它使用普通 JavaScript 与扩展内已固定、校验的 React 19.2.0 运行时，能够按「保存 → 自动准备 → 用户点击运行」工作。JSX 自动转换并复用同一运行时尚未实现，勿认为本示例只差一条启动命令。

## 快速诊断：为什么连接目录后没有运行按钮

- `opendesk browser dev .` 只提供本地目录接入；它**不会启动 Vite，也不会执行任何 npm script**。React JSX 不会被当前 LocalDevResolver 自动转换。
- `npm run build:framework` 只把 JSX 编译为 `src/compiled/framework.js`（编译产物不提交 Git）。每次修改 `src/framework.jsx` 后需要再次执行；这一步成功只能说明 Vite 编译成功。
- OpenDesk 还须解析 `src/main.js` 和 `src/compiled/framework.js`，校验模块大小并把业务源码编译成 ≤100,000 字节的最终 Page 脚本。本示例目前在源文件大小检查即被阻断；**并非 Chrome 站点授权问题，重装扩展或调大权限不能修复**。
- 若只想诊断构建，请先在**仓库根目录**运行 `npm ci --ignore-scripts --no-audit --no-fund`，再在本项目目录运行下面的项目依赖安装和 Vite 命令。执行 `node scripts/validate-program-project.mjs examples/programs/page-ui-react` 可以查看真实 OpenDesk 项目级错误，但当前失败是已知缺口，不代表用户操作有误。
- 根本解决方式是：JSX 只转换业务组件，React Hooks 与 ReactDOM 复用扩展内 `OpenDeskPageReact`；项目声明 `opendesk.framework: "react"`，禁止再次打包 React。还需要补齐源码变更后的自动转换与真实 Chrome 验收。在完成前不提高 Page 预算、不用 CDN/eval 绕过。

完整分类与启动对照：[React/Vue 网页 UI 指南](../../../docs/api/page-ui-frameworks.zh-CN.md)。

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
