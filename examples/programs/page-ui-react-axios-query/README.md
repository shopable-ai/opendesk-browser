# React + Axios + query-string：同一 Page 项目真实可见 Demo

这是一个正式 **多文件 Page ESM 项目**，不依赖项目内 `npm install`、运行时 CDN 或手写网页 script 注入。唯一代码入口 `src/main.js` 是标准 React 函数组件，拥有 Hooks；用户不用自己挂载 ShadowRoot/ReactDOM。

- `package.json#opendesk.framework=react` 令已有 Page UI 编译器使用固定 React + ReactDOM 单实例。
- `package.json#opendesk.libraries=["axios","query-string"]` 由正式项目构建器按顺序转为两条固定 `@opendesk-lib` 声明，真实浏览器运行时分别验证 SHA 后，组件可直接使用全局 `axios` 和 `queryString`。
- `src/main.js` 的 `useEffect` 在明确 Run 后向测试网站自己的 `/demo-form.html` 发起请求。Stop 时 `root.unmount()` 触发 AbortController。无后台跨站权限，普通 Axios 受 CORS/CSP/网站许可约束。

## 操作

1. 仓库根目录运行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，Chrome 打开 `http://127.0.0.1:43111/demo-form.html`。
2. 确认扩展已安装并开启「允许用户脚本」，授权当前测试网站。
3. 在本项目目录通过已授权本地开发 CLI 运行 `opendesk browser dev .`；也可以在仓库根使用 `node scripts/build-program-project.mjs examples/programs/page-ui-react-axios-query --mode production` 生成冻结构建，后续使用现有项目导入审核流程。
4. Side Panel →「开发」→「本地项目」→选择本项目 → 运行。网页应显示悬浮 React 卡片，最终显示「请求状态：loaded」「HTTP：200」「HTML：true」。
5. 停止并确认卡片消失，网络未完成的请求终止；更改版本后重新构建、验证和明确保存/升级，不继承旧回执。

定向自动化：`node --test tests/environment/page-multi-libraries-r166.test.mjs`，验证项目申明、真实 Webpack 输出及库声明。**Node 构建成功不等于 Mac Chrome 原生验收通过**；应在同候选 SHA 留存真实截图/回执与停止清理证据。

项目当前无需运行 Tailwind JIT；受控静态 Tailwind 样式仍属于独立交付缺口，不应把此 Demo 当作 Tailwind 完成。
