# Vue 普通 JavaScript · R24.3 标准组件入口

原目录与项目 ID `sample.page-ui-vue-direct` 不变。默认 `src/main.js` 使用官方 `import {h, ref} from 'vue'`，默认导出 Vue Options 组件及渲染函数。无需 `.vue` 编译器、`main()`、`createPageUI`、手动 npm/Vite；系统复用固定 Vue 3.5.22 运行时和受管容器，执行 `createApp` / `app.unmount`。

在已配对 Native Host 的本目录执行 `opendesk browser dev .`；保存只准备，Sidebar 明确点击 Run 才应用于获准网页。测试页 `http://127.0.0.1:43111/demo-form.html`，仓库根目录用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks` 启动。Stop 清理受管 DOM，不更改宿主表单。

**旧版兼容：** `src/legacy-main.js` 原样保留 R24.2 `async-main` 高亮/撤销与 `enhancement.js`；历史 JSON、SHA 和回执继续保存，不冒充 R24.3 PASS。当前 JSON 将通过原构建器重新生成。浏览器无 Native 的源码即时编译仍待实施。

[组件总览](../../../docs/api/page-ui-frameworks.zh-CN.md) · [导入草稿](../../import-ready/README.zh-CN.md) · [目录 CLI](../../../docs/framework/local-directory-cli-r17.zh-CN.md)
