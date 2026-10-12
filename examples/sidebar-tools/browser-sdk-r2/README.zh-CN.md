# Browser SDK R2–R4 已安装工具真实调用示例

## 推荐：短写法（不需手动管理三个不同的 ID）

```js
const {browser} = OpenDeskSDK;

// tabRef 必须是本工具此前获准打开并仍然拥有的标签页引用。
const watch = await browser.network.watch({
  tabRef,
  origin: 'https://example.org'
});
const {events} = await watch.read({limit:25});
const status = await watch.status();
await watch.stop();
await watch.export(); // 停止后，可信宿主会再次要求用户确认 JSON 保存
await watch.close();
```

`watch` 只是沙箱 SDK 内存中的便捷会话对象，**不是新的 Host RPC，也不是可跨工具传递的永久凭据**。它将原有 `network.observe.start/getStatus/stop/export`、`events.read/close` 委托给同一套受控 Host 操作；`watch.cancel()` 复用 `operations.cancel`。原有长接口继续兼容。每次调用都执行原有包身份、站点、Chrome 权限、所有权和生命周期复核。

调用 `watch()` 必须明确传入 *本工具的* `tabRef` 与**精确 Origin**，不自动监听全部网页；还要在工具包中声明 `browser.network.observe`、`browser.events`（如使用 `cancel()` 则需 `browser.operations`）。Chrome 可选 `webRequest` 权限与首次用户确认规则保持不变；导出仍须用户再次确认。

**注意：** `watch.read()` 是有界分页，`watch.export()` 仅支持停止后的 JSON 下载。Worker 恢复期间观察缺口不能自动补造；关闭或卸载工具之后的原引用不能恢复授权。组件与构建通过不等于 Mac Chrome 原生验收。

本目录是独立 JSON 安装工具，**不需要修改、重新编译 OpenDesk 扩展，也不需要任何外部 npm/CDN**。其源码直接调用沙箱中已有的 `OpenDeskSDK.browser`。

## 本地使用

1. 在仓库根目录启动：`python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。
2. Chrome 打开 `http://127.0.0.1:43111/demo-form.html`，确保 OpenDesk Browser 已安装，并完成所需 Chrome 网站访问授权。
3. Side Panel →「工具」→ 导入 `browser-operations.opendesk-tool.json`。仔细审阅该工具声明的 7 项能力，明确选择安装与启用。
4. 先点「打开标签页」，在 **OpenDesk 可信确认栏**点击允许；获得 `tabRef` 后，依次验证聚焦、HTTP GET、截图、网络观察、状态读取、停止/取消、分页、JSON 导出等操作。
5. 截图只允许截取工具拥有的**当前可见网页**。Chrome 会显示保存 PNG 对话框；`downloadId` 表示下载请求已启动，**不等于文件已落盘**。
6. 网络观察只收集相同 Tab/Origin 的 HTTP 元数据。可在该标签页 DevTools Console 运行 `fetch(location.href)` 制造一次同源请求，返回工具后点「读取观察事件」。观察最长 30 秒，过期/导航/撤权需重新开始。
7. 执行「停止观察」后可以「导出 JSON」；导出操作需要再次明确点击确认。关闭事件会话之后，旧观察引用不可再读。

## 必须验证的拒绝条件

- 没有单次用户批准，`tabs.open/focus`、HTTP、观察开始/导出、截图应返回明确拒绝。
- 不存在或已失效的 `tabRef`、切换到其他活跃 Tab、网址导航、工具关闭/停用/卸载、Chrome Origin 权限撤销，应拒绝受保护的能力，不向工具发送原始 `tabId`、PNG Base64、Cookie、Token 或 HTTP 正文。
- 网络观察读取和操作取消仅接受当前工具持有的 `observationId/operationId`；跨工具引用必须拒绝。
- MV3 Worker 中断期间未观察到的请求不能伪造；记录 gap/interrupted，旧权限引用不应自动恢复。
- 沙箱预览模式不会继承正式安装权限；`OpenDeskSDK.browser` 仅作用于真实安装的启用工具。

此示例仅帮助手工验证源码路径，不是当前候选真实 Chrome PASS 证据。正式验收需按 `docs/framework/testing-guide.md` 保存候选 SHA、包身份、用户真实点击、授权/撤权、浏览器日志与原始截图/下载收据。

相关实现状态：`docs/framework/workstreams/browser-sdk-status.md` 和 `browser-sdk-acceptance.json`。
