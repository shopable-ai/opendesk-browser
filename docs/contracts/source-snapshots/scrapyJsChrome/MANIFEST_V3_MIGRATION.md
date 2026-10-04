# Manifest V3 迁移完成总结

## 修复日期
2025-12-28

## 主要修复内容

### 1. Manifest.json 优化
- ✅ **移除不兼容的权限**：删除了 `webRequestBlocking` 权限（MV3 不再支持）
- ✅ **保留必要权限**：保留了 `webRequest` 用于监听（非阻塞模式）
- ✅ **Service Worker 配置**：使用 `background.service_worker` 替代 V2 的 background scripts

### 2. Background.js 消息处理优化
- ✅ **修复双重 sendResponse 问题**：
  - 之前代码在处理 `testMonkeyFramework` 类型消息时，会调用两次 `sendResponse`
  - 修改为使用 `if-else` 结构，确保只调用一次
  - 位置：`background.js:15681-15689`

### 3. WebRequest API 适配
- ✅ **移除 blocking 模式**：
  - 文件：`assets/js/core/webRequestBg.js`
  - 移除了 `chrome.webRequest.onBeforeRequest` 的 `["blocking"]` 选项
  - 添加了 MV3 警告注释，说明需要使用 `declarativeNetRequest` API 来实现拦截功能
  - `cancel` 和 `redirect` 功能在当前实现中仅作为监听功能，不会实际生效
  - 如需完整的拦截/修改功能，需要迁移到 `chrome.declarativeNetRequest` API

### 4. 消息传递参数结构统一
- ✅ **统一 executeInPage 接口**：
  - 文件：`assets/js/core/tb-bridge.js`, `www/popup_crawl.js`
  - 移除了 `target: 'content'` 字段（未被使用）
  - 统一消息格式：
    ```javascript
    {
      type: 'CHROME_PAGE_EXECUTE',
      detail: {
        script?: string,
        selectorAction?: string,
        pageAction?: string,
        args?: any[]
      }
    }
    ```

### 5. Service Worker 兼容性
- ✅ **localStorage polyfill**：background-sw.js 中实现了完整的 localStorage 模拟
- ✅ **全局对象 shim**：提供 window, self, chrome 等全局对象
- ✅ **executeScript polyfill**：实现了 `chrome.tabs.executeScript` 到 `chrome.scripting.executeScript` 的转换

## 架构说明

### 消息传递架构
```
Content Script / Popup
    ↓ (chrome.runtime.sendMessage)
    ↓ type: 'CHROME_PAGE_EXECUTE'
Background Service Worker
    ↓ (handleChromePageExecute)
    ↓ (executeScript / performSelectorAction / performPageAction)
Active Tab (MAIN world)
    ↓ (chrome.scripting.executeScript)
Result ← Response
```

### 三种消息传递方式
1. **TB.bridge**：命名空间消息（用于模块化通信）
2. **executeInPage**：执行页面脚本（用于 CSP 安全的脚本执行）
3. **ChromePage**：页面操作代理（用于 Puppeteer-like API）

## 已知限制

### WebRequest Blocking
- **影响**：无法使用 `webRequest` API 阻止或修改请求
- **解决方案**：需要时可迁移到 `chrome.declarativeNetRequest` API
- **当前状态**：WebRequestFramework 的所有调用都已被注释，实际未使用

### Service Worker 环境
- **限制**：无原生 localStorage, DOM API
- **解决方案**：已实现完整的 polyfill 和 shim

## 测试建议

### 功能测试
1. ✅ 扩展加载测试（无 Manifest 错误）
2. ⏳ 消息传递测试（content ↔ background）
3. ⏳ executeInPage 功能测试
4. ⏳ ChromePage API 测试
5. ⏳ 爬虫功能测试

### 兼容性测试
1. ⏳ Chrome 最新版本
2. ⏳ Edge 最新版本
3. ⏳ 其他 Chromium 浏览器

## 后续优化建议

### 高优先级
1. **完善错误处理**：
   - 添加更详细的错误信息
   - 实现错误恢复机制

2. **性能优化**：
   - 优化消息传递频率
   - 减少不必要的日志输出

### 中优先级
3. **代码重构**：
   - 提取公共的 polyfill 代码到单独文件
   - 统一错误处理逻辑

4. **文档完善**：
   - 添加 API 使用文档
   - 添加常见问题解答

### 低优先级
5. **功能增强**：
   - 如需要，实现 declarativeNetRequest 适配
   - 添加更多的 ChromePage API 方法

## 参考资料
- [Chrome Extensions Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/migrating/)
- [Service Worker in Chrome Extensions](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Scripting API](https://developer.chrome.com/docs/extensions/reference/scripting/)
- [declarativeNetRequest API](https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/)
