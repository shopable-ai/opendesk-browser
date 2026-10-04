# Selector.next() 返回 null 问题修复说明

## 问题描述

当在 background service worker 中通过 `page.eval('selector.next()')` 执行代码时，返回 `null`，但在前端网页控制台中直接执行 `selector.next()` 能正常返回数据对象。

### 预期返回值
```javascript
{
  selector: '._p5wwlyz16',
  tableId: 1,
  data: Array(3),
  itemCount: 3,
  elementClasses: Array(2)
}
```

### 实际返回值
```javascript
null
```

## 根本原因

问题出在 `background-sw.js` 中 `simplePage.eval()` 的代码包装逻辑（第266-272行）：

**修复前的代码：**
```javascript
if (normalized && !/return\s+/i.test(normalized) && !/await\s+/i.test(normalized)) {
  wrappedSource = `
    return (async () => {
      ${normalized};  // ❌ 表达式被执行但返回值没有被捕获
    })();
  `;
}
```

当执行 `'selector.next()'` 时，代码被包装成：
```javascript
return (async () => {
    selector.next();  // 函数被调用，但结果没有 return
})();
// 返回 undefined
```

## 解决方案

修改包装逻辑，自动返回表达式的值：

**修复后的代码：**
```javascript
if (normalized && !/return\s+/i.test(normalized) && !/await\s+/i.test(normalized)) {
  wrappedSource = `
    return (async () => {
      return ${normalized};  // ✅ 返回表达式的值
    })();
  `;
}
```

## 使用方法

### 修复后的用法（推荐）

```javascript
// 现在可以直接使用，无需显式添加 return
const result = await page.eval('selector.next()');
console.log(result); // ✅ 正常返回数据对象
```

### 兼容的用法

```javascript
// 显式使用 return 也可以正常工作
const result = await page.eval('return selector.next()');
console.log(result); // ✅ 正常返回数据对象
```

## 测试验证

### 方法 1：快速一键测试（推荐）⚡

在 Service Worker (background) 控制台中复制并执行：

```javascript
// 快速测试脚本
fetch(chrome.runtime.getURL('demo/quick-test.js'))
  .then(r => r.text())
  .then(code => eval(code));
```

或者手动复制 `demo/quick-test.js` 的全部内容到控制台执行。

### 方法 2：手动测试

```javascript
// 简单验证
const result = await page.eval('selector.next()');
if (result === null) {
  console.warn("⚠️  Still returning null - the fix may not be working");
} else {
  console.log("✅ Fix working!");
}
```

### 方法 3：完整测试套件

参见 `demo/extension-bg-test.js` 和 `demo/DEBUG_GUIDE.md`

## 影响范围

此修复影响所有通过 `page.eval()` 执行的表达式语句：

- ✅ `page.eval('selector.next()')` - 现在能正确返回值
- ✅ `page.eval('document.title')` - 能正确返回标题
- ✅ `page.eval('window.location.href')` - 能正确返回 URL
- ✅ 任何返回值的函数调用或表达式

不影响已有的显式 return 语句：
- ✅ `page.eval('return selector.next()')` - 继续正常工作
- ✅ `page.eval('await someAsyncFunc()')` - 继续正常工作

## 相关文件

- `background-sw.js` - 修复的核心文件（第266-272行）
- `demo/extension-bg-test.js` - 测试验证文件
- `assets/js/plugins/scrapy/listSelectorCore.js` - selector.next() 的实现

