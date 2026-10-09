# 开发面板 page.evaluate() 的权限诊断与恢复（2026-10-10）

## 根因

在 Chrome 138+ 中，`manifest.json` 声明 `userScripts` 并不意味着浏览器已经允许当前扩展执行用户脚本。Controller 的 `page.evaluate()`、`page.$eval()`、`page.$$eval()`、`page.waitForFunction()` 进入原生 `chrome.userScripts.execute` 执行世界；如果 `chrome.userScripts.getScripts()` 检测不可用，会产生 `E_USER_SCRIPTS_UNAVAILABLE`。这发生于传入的 DOM 函数真正执行之前，与 `sm-brand` 选择器、HTML 大小无关。

Chrome 用户操作：打开 `chrome://extensions` → OpenDesk Browser →「详情」→ 开启「允许用户脚本」（Allow User Scripts）。返回侧栏后点击「重新检测」，能力初步通过再**手动**重新点击运行。新 Profile、新安装、Chrome 设置变化和重新打开浏览器后，都需以真实开关为准。缺少开关时检查 Chrome 版本及扩展是否已加载当前构建。

## 推荐写法与不依赖 User Scripts 的替代

只读元素文字，不必启动 USER_SCRIPT：

```js
async function main() {
  const node = page.locator('sm-brand');
  const text = await node.count() ? await node.textContent() : '';
  return {title: await page.title(), url: await page.url(), text: text.slice(0, 4000)};
}
```

需要执行复杂 DOM JavaScript 时，开启上述设置后：

```js
async function main() {
  const htmlInfo = await page.evaluate(() => {
    const html = document.body?.innerHTML ?? '';
    return {length: html.length, preview: html.slice(0, 4000), truncated: html.length > 4000};
  });
  return {title: await page.title(), url: await page.url(), htmlInfo};
}
```

`page.url()` 是异步 API，必须用 `await` 取得字符串。若只需 HTML 前缀，也可用 `page.content({maxChars:4000})`；它不需要 User Scripts，但返回的是片段，不得据此假定完整 HTML 长度。处理超大页面应使用 `page.contentChunks()`；不要返回整页字符串造成 64 KiB 传输限制错误。

## 安全界限

- Sidebar 仅在看到 `E_USER_SCRIPTS_UNAVAILABLE` 后显示恢复操作；按钮真实点击打开扩展详情，重新检测只调用 `getScripts()`，不保存授权标志、不调用 `execute()`、不自动运行草稿。
- `getScripts()` 成功只是当时的初步能力检测；RunHost、Controller Driver 仍在**每次原生调用前后**重检权限和目标文档，失败保留持久结果及原始错误码。
- 不使用 `chrome.scripting.executeScript` 偷偷替代任意 `page.evaluate()`，不借网页注入绕过 Chrome 用户脚本开关，也不改动撤权/停止/未知效果的结果语义。
- Sidebar 历史会展示原始持久结果（脱敏版）与可操作建议；成功恢复开关不意味着上次失败任务成功，不得自动复跑具有副作用的代码。

## 定向回归与验收级别

```sh
node --test tests/environment/user-scripts-access.test.mjs tests/environment/task-run-diagnostics.test.mjs tests/environment/script-editor.test.mjs
node --test tests/framework/k3-native-driver.test.mjs tests/framework/k3-page-evaluator.test.mjs
npm run check
```

上述 Node 测试只能证明组件/静态合同。**真实 Chrome 另行验证**：关闭用户脚本开关后执行 `page.evaluate()`，应收到此错误并显示恢复入口；直接运行 `page.title()`、`page.url()`、`page.locator('sm-brand').textContent()` 仍能工作；在扩展详情启用后经只读检测、用户手动重新运行应得到 DOM 摘要。再验证重新撤权、切换页、停止、重复操作不会绕过 Controller 的目标绑定和持久结果。没有原生 Chrome/当前包证据，不宣称完成原生验收。
