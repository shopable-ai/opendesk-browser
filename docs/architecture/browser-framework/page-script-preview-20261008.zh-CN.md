# R3：Page User Script 精确文档即时试运行

> 2026-10-08 的实现记录，不替代源码指纹、机器账本或原生 Chrome 验收证据。

## 功能

Sidebar「开发」保留同一 JavaScript 编辑器。编辑器中的 `async function main()` 可通过「网页 DOM 脚本试运行」对**当前窗口的当前 HTTP(S) 主文档**一次性试运行。可直接使用 `document`；如勾选固定依赖，则 `jquery@3.7.1` 从扩展内资源加载、SHA256 校验后先于用户脚本注入到同一个 `USER_SCRIPT` world。MAIN 世界不注入 jQuery。

## 授权与隔离

- 使用现有 `createHostClient` 和 `createFoundationBroker` 的受信工具文档鉴权，不创建第二套 Authority。
- 真正的可信点击冻结源码、是否加载 jQuery、windowId、tabId、frameId、documentId、完整 URL。UI 在 `permissions.request` 前完成冻结；Broker 重新核对活动标签、主文档、授予的站点权限及现有 Controller 运行槽。
- Chrome 原生调用是 `chrome.userScripts.execute`，目标使用 `documentIds` 防止页面导航后猜测性补位；执行结果必须包含同 frame/documentId 的无错误回执。失败拒绝冒充成功。
- Chrome 138+ 需要在扩展详情开启「允许用户脚本」。没有开关或站点授权则失败关闭。

## 示例

```js
async function main() {
  const title = document.title;
  document.body.dataset.opendeskPreview = '1';
  return {title};
}
```

## 验收边界和后续

此切片只实现**开发者的一次性试运行**。不保存 Task Candidate、Verification、Available、安装、注册自动 URL 匹配，不生成 Controller durable Result，不保证试运行后清理已添加的 DOM 和事件监听。Native InjectionResult 表示本次求值回执，不代表业务审核。Node 定向测试和构建检查不能冒充 Chrome 原生、重启恢复或正式发布。

下一切片仍需由既有受信 Authority 提供 **Available + Installed + Enabled** 的固定代码/依赖资产证明，才准调用 `chrome.userScripts.register/unregister` 做持久匹配和禁用；必须验证 reload once / nonmatch zero / disable next-doc zero、依赖版本隔离、更新及重启对账。
