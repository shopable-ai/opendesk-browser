# Controller ESM：真实 Axios 零参数（R16.7）

本项目有两个可直接运行的能力：Controller 受控 Worker 的词法 `page`，以及通过现有 `axiosx` 授权 Broker 适配的真实 upstream Axios。均不要求在 `main()` 传任何参数，不需要给网页 `window` 安装 Axios。

**源码**：`src/main.js` 是 `export default async function main()`；`package.json` 的 `opendesk.libraries: ["axios"]` 由原项目构建器自动变成固定声明。真实程序安装前必须按版本重新验证。

**运行步骤**：

1. 仓库根目录执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`。
2. 确认扩展已经安装、已授权此 Origin 的 Page 自动化；Side Panel →「开发」→「本地项目」连接已授权目录 `examples/programs/controller-axios-zero-arg/`（或使用 `opendesk browser dev .`）。
3. 点击运行，预期 Controller 持久结果含 `status:200`、`isDemoPage:true`、`url/title` 及 Lodash 处理的 `methods`，同时记录 `runId/resultId`。
4. 测试停止、撤销网站权限和下一次运行；没有被批准的跨域请求会由已有 Broker 拒绝。停止会退休 Worker，不能重试未知副作用。
5. 保存正式任务或更新时重新验证运行候选。Controller 的 `axios` 不等于 Page 的普通 CORS Axios；不支持直接配置 `adapter`、取消 token、二进制流、上传、非 GET/POST/PUT/DELETE 网络方法。已有 `axiosx` 仍兼容。

单文件 Controller 可以在最前面声明 `// @opendesk-lib axios` 后定义 `async function main()`，但不要写 `export default`。Node 定向测试 `node --test tests/environment/axios-controller-world-r167.test.mjs`；真实 Mac Chrome 结果另列，不用 VM 冒充。
