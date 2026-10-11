# Vue 3 免手工编译：指定网站网页按钮

在 `src/main.js` 中直接写 `Vue.createApp()`、`ref()`、`h()` 的普通 JavaScript；**没有 .vue 单文件组件，没有模板编译器，不需要 npm install 或 Vite 命令**。OpenDesk 从扩展内经过 SHA-256 校验的 Vue 3.5.22 固定运行时载入，不依赖目标网站的 Vue。

先在仓库根目录启动标准测试页 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，访问 `http://127.0.0.1:43111/demo-form.html`，在本地工具开发入口授权此项目、Chrome 网站访问及用户脚本能力，**点击运行** 即挂载 Shadow DOM 内 Vue 组件。点击按钮修改/撤销 `#sample-text` 测试段落。显式停止时 `app.unmount()`，DOM 修改与观察器在 `ui.onDispose` 中清理。

`pageRules` 是脚本运行范围，不是安装或网站授权。保存文件只自动准备，下次运行才应用新源码；SPA 导航离开范围后停止，返回允许路径也不偷偷重放。与 Side Panel 自定义工具不同。
