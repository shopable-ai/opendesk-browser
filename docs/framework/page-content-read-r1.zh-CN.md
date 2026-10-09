# OpenDesk Browser：Playwright `page.content()` 与大页面传输合同

> 生效代码：`src/framework/ChromePage.js`、`src/scripting/packaged/registry.js`、`src/scripting/packaged/page-session.js`。与 Microsoft Playwright 的 `page.content()` 签名一致，不要求用户理解内部传输协议。

## 正式 API

```javascript
async function main() {
  const html = await page.content();
  return {url: await page.url(), chars: html.length, hasForm: html.includes('<form')};
}
```

- `page.content()` 返回包含文档类型声明（如果存在）的完整 HTML，等价于当前 DOM 的 DOCTYPE + `document.documentElement.outerHTML`；不是 `body.innerHTML`，也不是网络原始响应。该快照保留当前运行时的 DOM 变更。
- **不暴露 `content({maxChars})` / `contentChunks()`。** Playwright API 文档没有这两个公共入口。
- 底层自动读取同一个文档快照，逐段通过原有 Authority / RunHost / Controller / Page Session，绑定 runId、ownerEpoch、revision、tabId、frameId、documentId。扩展不会直接读取未经授权的其他网站或 frame。
- 为避免无限内存占用，内部快照最大 8 MiB（UTF-8），最多存活 60 秒，停止/卸载/导航及异常释放。每次内部消息仍受 64 KiB Control Codec 上限；这不是 `page.content()` 对外的参数。

## 两个互相独立的大小边界

1. **网页 → 自动化脚本**：`await page.content()` 使用内部自动分块，正常不会因为网页超过单帧 64 KiB 就失败。超过内部 8 MiB 快照上限返回 `E_PAGE_CONTENT_TOO_LARGE`；属于明确、有限的实现限制。
2. **自动化脚本 → Sidebar/任务结果**：`return html` 属于另一次结果序列化。大型结果必须遵守任务持久化/隐私和展示额度，不应无限制塞进 Side Panel。超出受支持的结果大小时明确失败并给出获取必要字段或转换为摘要的提示；不静默截断。

复杂 HTML 请在脚本内正常处理：
```javascript
async function main() {
  const html = await page.content();
  return {title: await page.title(), size: html.length, doctype: html.startsWith('<!DOCTYPE')};
}
```
保留安全、类型保真的实际 `return` 值；结果 UI 不依据 `title/url/html` 等字段名创造固定业务 Schema。

## 验收与不夸大的承诺

验证 DOCTYPE、动态 DOM、中文/Emoji、UTF-8 边界、修改页面后的同一快照、提前撤权/停止/导航、未知结果/老版浏览器、Worker 清理、非标准参数拒绝。Node Mock 测试只验证组件；真实 Chrome MV3 必须单独提供运行证据。兼容 Playwright 方法签名不等于声称当前扩展支持所有 Playwright 浏览器能力。
