# React 网页增强（Page USER_SCRIPT）

这是真正的 React 19 JSX + ReactDOM 示例，不是 Side Panel。编译后的 JavaScript 仍由 **现有** OpenDesk `@opendesk/ui` / Page Runtime 执行，组件挂在 `ui.content`，销毁时调用 `root.unmount()`，修改 `#lab-text #sample-text` 并可撤销。

## 开发与构建

```sh
# 在本示例目录中，首次创建依赖锁（需联网），审查并提交 package-lock.json
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
npm run build:framework
cd ../../..
node scripts/validate-program-project.mjs examples/programs/page-ui-react
npm run build:program -- examples/programs/page-ui-react --mode development
```

从仓库根目录运行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，在 Chrome 打开 `http://127.0.0.1:43111/demo-form.html`，确认用户脚本开关和站点授权，通过 Sidebar/MCP **显式手动试运行**。点击高亮/撤销按钮，然后用原 previewId Stop。预览不是安装或自动启动；`pageRules` 已将脚本匹配范围限定为 43111 端口，但 Chrome 网站权限和安装批准仍必须独立核对。

**交付限制：** 这个源码模板尚无已锁定的 npm 依赖，也未完成最终体积或真实 Chrome 验收。ReactDOM 可能超过现有 100000 字节 Page 输出预算；不能绕过容量、引入 CDN/eval、放宽站点范围或冒充运行通过。
