# React 19 免手工编译：指定网站网页按钮

在本目录直接修改 `src/main.js`，保存后在 OpenDesk Browser 已连接的本地项目中点击 **运行**。此示例只使用 `React.createElement()` / Hooks 和原生 JavaScript，**不需要 npm install、Vite、JSX 或生成 compiled 目录**。OpenDesk 自行准备本地 .js 模块，预装并校验 React 19.2.0/ReactDOM 固定运行时。

1. 标准测试页：`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`。
2. 在本地连接允许本目录、开启 Chrome 用户脚本与网站权限；Sidebar → 开发 → 本地项目 → 选择本项目 → **运行**。保存文件不会自动修改网站。
3. React 组件直接显示在 `#page-ui-demo-target` 附近。点击高亮/撤销按钮，观察 `#sample-text` 的轮廓及标记变化；不会提交原网站的表单。
4. **停止受管 UI** 或按原 previewId Stop，验证 `root.unmount()`、受管观察器以及网页标记完全消失。修改脚本后可再次显式运行。

项目 `pageRules` 只允许 `127.0.0.1:43111` 并排除 private 路径，它不是 Chrome 权限或安装批准。这里不是 Side Panel 工具。JSX/SFC 属于另一种高级开发方式，需要系统自动准备；不能把这种纯 JS 示例说成支持浏览器原生 JSX。

不直接访问网站中的 React，全程不使用 CDN、eval 或 MAIN 世界。本项目包含简单 DOM 修改和受管销毁，正式安装及自动触发需另行完成固定版本验证和用户确认。
