# Vue 3 SFC 网页增强（Page USER_SCRIPT）

真实 `<script setup>` + Composition API，`createApp(Widget)` 只挂在现有 `createPageUI().content` 内。透过 `ui.onDispose(()=>app.unmount())` 销毁。它既不是 Side Panel 工具，也不是独立标签页。

```sh
# 在本示例目录中首次建立 lock，审查并提交 package-lock.json
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
npm run build:framework
cd ../../..
node scripts/validate-program-project.mjs examples/programs/page-ui-vue
npm run build:program -- examples/programs/page-ui-vue --mode development
```

启动标准网页 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，访问 `http://127.0.0.1:43111/demo-form.html`。授予浏览器网站访问和用户脚本能力，在当前 tab/document 手动 Run，然后高亮/撤销测试段落；原 previewId Stop 时检查 Vue 根及 DOM 恢复。连续 Stop/Run 20 次、局部重绘、SPA 导航、BFCache、CSP、暗色/200%/窄屏仍需真实 Chrome 证据。

**状态：SOURCE_ONLY / NOT_TESTED**。缺 npm 锁、双阶段实际构建与真实 Chrome 回执；保持现有项目 100000 字节输出预算，不使用 CDN/eval/动态运行时代码；pageRules 无法限定 localhost 端口。
