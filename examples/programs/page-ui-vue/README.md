# Vue 3 SFC 网页增强（Page USER_SCRIPT）

> **当前状态（2026-10-11）：Vite 能编译真实 `.vue` SFC，但还不能作为完整 OpenDesk Page 项目运行。** 历史 `src/compiled/framework.js` 产物 144,502 字节；虽然低于单源码文件 256 KiB 限制，却超过最终 Page 脚本 100,000 字节的预算。Vite PASS **不是** OpenDesk Run PASS。
>
> **要立即运行 Vue UI：请使用 [page-ui-vue-direct](../page-ui-vue-direct/README.md)**，编写 `src/main.js` 的普通 JavaScript，用扩展内已固定并校验的 Vue 3.5.22 运行时；不用 Vite、SFC 或 npm 安装即可编辑保存并显式运行。

## 快速诊断：如何尝试编译以及为什么不能直接运行

- `opendesk browser dev .` 只连接目录与 Node 本地项目服务，**不会自动执行 Vite** 或把 `.vue` 转换为浏览器可执行脚本。不能用该命令的连接成功判断源码可运行。
- 项目内先运行 `npm ci --ignore-scripts --no-audit --no-fund`，再运行 `npm run build:framework`，生成 `src/compiled/framework.js`。每次修改 `src/Widget.vue` 后都需要重新手动编译。
- 如果要验证最终 OpenDesk 构建，先确保仓库根目录也执行过 `npm ci --ignore-scripts --no-audit --no-fund`；然后在仓库根目录运行 `node scripts/validate-program-project.mjs examples/programs/page-ui-vue` 和 `npm run build:program -- examples/programs/page-ui-vue --mode development`。Vite 的编译成功不保证后者成功；最终 Page 容量超限仍会报错。
- 正式修复必须只转换 SFC 业务逻辑与模板，并复用扩展内固定的 `OpenDeskPageVue`，而**不是简单在 Vite 中把 `vue` 设为 external**：当前打包的 Vue runtime-only API 并未暴露 SFC 模板所需的全部编译辅助函数。需要扩展受审计的运行时接口、固定资源 SHA/许可证验证、构建适配、自动准备与真实 Chrome 验收；不得放宽容量或绕过来源校验。

完整分类与启动对照：[React/Vue 网页 UI 指南](../../../docs/api/page-ui-frameworks.zh-CN.md)。

真实 `<script setup>` + Composition API，`createApp(Widget)` 只挂在现有 `createPageUI().content` 内。透过 `ui.onDispose(()=>app.unmount())` 销毁。它既不是 Side Panel 工具，也不是独立标签页。

```sh
# package-lock.json 已由 R24.1 GitHub Actions 的真实 npm 安装锁定；直接 npm ci
npm ci --ignore-scripts --no-audit --no-fund
npm run build:framework
cd ../../..
node scripts/validate-program-project.mjs examples/programs/page-ui-vue
npm run build:program -- examples/programs/page-ui-vue --mode development
```

启动标准网页 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，访问 `http://127.0.0.1:43111/demo-form.html`。授予浏览器网站访问和用户脚本能力，在当前 tab/document 手动 Run，然后高亮/撤销测试段落；原 previewId Stop 时检查 Vue 根及 DOM 恢复。连续 Stop/Run 20 次、局部重绘、SPA 导航、BFCache、CSP、暗色/200%/窄屏仍需真实 Chrome 证据。

**状态：LOCKED_SOURCE / BUILD_LIMIT_BLOCKED**。依赖已锁定；真实 Vite SFC 编译通过（**144,502 字节**），超出原 Page 执行源码预算，最终 Page 构建与 Chrome 尚未通过；不得放宽 100000 字节限制或使用 CDN/eval。`pageRules` 匹配 43111 端口，但不是 Chrome 网站权限或安装批准。
