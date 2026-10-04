
## 当前架构分析

popup_crawl.js
    ↓ 发送脚本字符串: "page.eval('selector.next()')"
background.js (Service Worker)
    ↓ parsePageInvocation() 解析字符串
    ↓ 提取: method='eval', args=['selector.next()']
    ↓ 在 background 执行: await page.eval('selector.next()')
ChromePage.eval()
    ↓ chrome.scripting.executeScript()
    ↓ 注入代码到目标页面的 MAIN world
目标网页 (Content Context)
    ↓ 执行: selector.next()
    ↓ 返回结果
返回路径: 目标页面 → ChromePage → background → popup



### 测试
在popup_crawl.html 的devtools中执行测试
await executeInPage("page.eval('[1, 2, 3]')");

await executeInPage("page.eval('selector.next()')");
