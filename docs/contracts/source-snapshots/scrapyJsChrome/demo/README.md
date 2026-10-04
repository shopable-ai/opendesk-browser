# Demo & Testing Files

这个目录包含测试文件和调试工具，用于验证 `selector.next()` 自动返回值修复。

## 📁 文件说明

| 文件 | 用途 | 使用场景 |
|------|------|----------|
| `quick-test.js` | 🚀 一键快速测试脚本 | 快速验证修复是否生效 |
| `extension-bg-test.js` | 完整测试套件 | 详细的功能测试 |
| `DEBUG_GUIDE.md` | 🔍 调试指南 | 问题排查和故障诊断 |
| `SELECTOR_FIX_NOTES.md` | 📝 修复说明文档 | 了解问题原因和解决方案 |

## 🚀 快速开始

### 1. 重新加载扩展

修改代码后，**必须**重新加载扩展：

1. 打开 `chrome://extensions/`
2. 找到您的扩展，点击 **刷新** ⟳
3. **重要：** 刷新正在测试的网页标签页

### 2. 运行快速测试

打开 Service Worker 控制台（在 `chrome://extensions/` 页面点击 "Service Worker"），然后执行：

```javascript
// 方法 A: 动态加载（推荐）
fetch(chrome.runtime.getURL('demo/quick-test.js'))
  .then(r => r.text())
  .then(code => eval(code));
```

或者：

```javascript
// 方法 B: 手动复制粘贴
// 打开 demo/quick-test.js，复制全部内容到控制台执行
```

### 3. 查看结果

如果看到：

```
🎉 ALL TESTS PASSED! The fix is working correctly! 🎉
```

说明修复成功！✅

## 📚 详细文档

### 🔧 [DEBUG_GUIDE.md](./DEBUG_GUIDE.md)

**适用场景：** 测试失败，需要调试

包含：
- ✅ 如何正确重新加载扩展
- ✅ 验证步骤和检查清单
- ✅ 调试日志说明
- ✅ 常见问题排查
- ✅ 完整测试输出示例

### 📖 [SELECTOR_FIX_NOTES.md](./SELECTOR_FIX_NOTES.md)

**适用场景：** 了解问题原因和技术细节

包含：
- ✅ 问题描述和根本原因
- ✅ 修复前后代码对比
- ✅ 使用方法和示例
- ✅ 影响范围说明

## 🧪 测试用例

### 基础测试

```javascript
// 在 Service Worker 控制台中运行

// Test 1: 数学表达式
await page.eval('1 + 1')  // 应返回: 2

// Test 2: 文档标题
await page.eval('document.title')  // 应返回: 页面标题字符串

// Test 3: 对象字面量
await page.eval('({a: 1, b: 2})')  // 应返回: {a: 1, b: 2}
```

### selector.next() 测试

```javascript
// 确保 selector 存在
const exists = await page.eval('typeof selector !== "undefined"');
console.log("Selector exists:", exists);

// 测试自动返回（修复后）
const result = await page.eval('selector.next()');
console.log("Result:", result);
// 预期: {selector: "...", tableId: 1, data: [...], itemCount: 3, ...}

// 测试显式 return（向后兼容）
const result2 = await page.eval('return selector.next()');
console.log("Match:", JSON.stringify(result) === JSON.stringify(result2));
// 预期: true
```

## 🔍 版本检查

确保代码已更新到 v3.1：

```javascript
// 在 Service Worker 控制台中
console.log("Current version:", page.__version);
// 预期输出: 3.1
```

如果版本不是 3.1，请：
1. 确认 `background-sw.js` 文件已保存
2. 在 `chrome://extensions/` 重新加载扩展
3. 刷新网页标签页
4. 重新检查版本

## 📊 预期的调试日志

成功的执行应该显示这些日志：

```
[PageShim] Initializing version 3.1...
[PageShim] Installing new page shim...
[PageShim] Installation complete. Version 3.1 is now active.

[simplePage.eval v3.1] Received code: selector.next()
[simplePage.eval] Code analysis: {hasReturn: false, hasAwait: false, willWrap: true}
[simplePage.eval] Wrapped code for auto-return
[Page Context] Executing with auto-return: "selector.next()"
[Page Context] Result type: object isNull: false value: {...}
[simplePage.eval] Final result: object {...}
```

## ⚠️ 常见问题

### 问题：扩展重载后仍是旧版本

**解决方案：**
- 关闭所有使用该扩展的标签页
- 在 `chrome://extensions/` 禁用后重新启用
- 或使用 `chrome.runtime.reload()`

### 问题：selector.next() 返回 null

**可能原因：**
1. 页面上没有列表内容 → 换个有列表的页面测试
2. selector 未初始化 → 打开扩展 popup 或手动调用 `selector.detectLists()`
3. 检测失败 → 使用自定义选择器

**验证方法：**
```javascript
// 在网页控制台（不是 background）中
if (typeof selector !== 'undefined') {
  selector.detectLists();
  console.log("Lists found:", selector.lists.length);
  const result = selector.next();
  console.log("Result:", result);
}
```

### 问题：看不到调试日志

**检查清单：**
- [ ] 是否在 Service Worker 控制台执行？（不是网页控制台）
- [ ] Service Worker 是否在运行？（查看 `chrome://extensions/`）
- [ ] 控制台过滤器是否屏蔽了日志？

## 🎯 测试检查清单

在报告问题前，请确认：

- [ ] 已保存 `background-sw.js` 文件
- [ ] 在 `chrome://extensions/` 点击了刷新
- [ ] 刷新了测试网页标签页
- [ ] 在 Service Worker 控制台看到 `[PageShim] Initializing version 3.1`
- [ ] `page.__version` 返回 `3.1`
- [ ] `await page.eval('1 + 1')` 返回 `2`（不是 undefined）
- [ ] 运行了 `quick-test.js` 脚本

## 📞 获取帮助

如果测试失败：

1. 📖 阅读 [DEBUG_GUIDE.md](./DEBUG_GUIDE.md) 排查问题
2. 🔍 检查控制台日志，查找错误信息
3. 📝 查看 [SELECTOR_FIX_NOTES.md](./SELECTOR_FIX_NOTES.md) 了解技术细节
4. ✅ 运行 `quick-test.js` 获取详细的测试报告

## 🎨 修复亮点

✨ **修复前：**
```javascript
await page.eval('selector.next()');  // 返回 null ❌
```

✨ **修复后：**
```javascript
await page.eval('selector.next()');  // 返回完整数据对象 ✅
```

🎯 **影响范围：** 所有表达式语句都能正确返回值
- `page.eval('document.title')` ✅
- `page.eval('1 + 1')` ✅  
- `page.eval('selector.next()')` ✅
- `page.eval('someFunction()')` ✅

🔄 **向后兼容：** 已有的显式 `return` 语句继续正常工作

---

**版本：** 3.1  
**最后更新：** 2025-10-26

