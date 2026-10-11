# Vue 3 SFC 网页增强（Page USER_SCRIPT）

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
