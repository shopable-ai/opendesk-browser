# Page 双库零参数示例（Axios + query-string）

文件：`page-axios-query-string.js`，是 Side Panel「开发 → 网页 JavaScript 试运行」的**单文件** `async function main()`，不要添加 `export default`。

1. 安装本仓库新构建的 OpenDesk 扩展，Chrome 扩展设置开启「允许用户脚本」，并明确授予测试网站访问权限。
2. 在仓库根目录运行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`；Chrome 打开 `http://127.0.0.1:43111/demo-form.html`。
3. 打开 Side Panel →「开发」→「网页 JavaScript 试运行」，粘贴同目录 JS 源码，选择/确认当前网页文档，点击**运行**。
4. 预期回执：`status:200`、`receivedHtml:true`，返回包含 `tag`、`from` 的 `params`；没有 Controller 的 `page` 参数。
5. 变更源码后需重新试运行、验证并明确保存/安装；停止、撤权或刷新页面后不能把旧候选回执作为新版本的证明。

这是 Axios、query-string **实际加载链的手工验收说明**；GitHub Node L2 单测不代表原生 Chrome 已通过。Axios 使用网页自己的 CORS/网络权限，不走特权 Controller Broker。React 可与两个库共同声明，但显示/卸载 React UI 仍必须经过正式受管 Page UI 生命周期，不能把原生脚本简单插到目标 MAIN 世界。
