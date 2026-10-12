# R24.3 · 原浏览器编译器模块链接与 Worker 资格审查

日期：2026-10-12。按需 Classic Dedicated Worker（**不是常驻 SW**），在扩展自己的 Worker 加载固定 Babel 字节和 ESM 数据转换/受管生成入口。脚本中用户提供的 `App.jsx/App.vue` 始终作为数据处理，不在准备 Worker `eval`、`Function` 或动态执行用户源码。

- 唯一 React/Vue 框架身份和组件规则复用 `src/libs/page-frameworks/page-component-browser-linker.js`；Vue SFC 使用已有纯转换代码与固定 `vue-sfc-compiler-3.5.22.mjs`。
- 构建由固定 esbuild 0.28.2 完成，以两个自包含 ESM 输出替代 webpack 进入浏览器；仍需严格 SHA/字节登记、扩展 Worker CSP、包体和实际网页原生证据。
- Worker 不可被目标网站访问、不获取浏览器权限，只接受可信宿主发来的准备数据；待验证中不用于产品真实运行。此资格测试不代表 R24.3 完成。
