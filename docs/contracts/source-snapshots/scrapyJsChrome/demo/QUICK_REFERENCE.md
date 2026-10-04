# 快速参考指南 - selector.next() 测试

## 🚨 遇到 "当前环境不支持执行该脚本" 错误？

这是**正常的**！这个错误说明你在错误的环境中运行了测试代码。

### 为什么会出现这个错误？

```
popup DevTools (你在这里)  ❌  无法访问目标页面的 selector
        ↕️ 
目标网页 (selector 在这里) ✅  可以访问 selector
```

**简单来说：**
- `selector` 对象存在于**目标网页**的 JavaScript 环境中
- popup DevTools 运行在**popup 窗口**的环境中
- 这是两个完全独立的 JavaScript 执行环境

## ✅ 正确的测试方法

### 方法 1: 使用按钮（推荐 ⭐）

**最简单可靠！**

1. 打开任意包含列表的网页（如搜索结果页）
2. 点击扩展图标，打开 popup
3. 点击 **"定位 表格"** 按钮
4. 点击 **"下一个表格"** 按钮
5. ✅ 完成！查看表格数据是否更新

**预期结果：**
- 表格数据会切换到下一个检测到的表格
- 浏览器控制台会输出详细日志

### 方法 2: 在目标网页测试

**适合开发调试**

1. 打开包含列表的网页
2. 打开 popup，点击 **"定位 表格"** 按钮
3. 在**目标网页**上按 F12（不是 popup 的 F12！）
4. 在网页的控制台中运行：

```javascript
// 测试 selector.next()
selector.next()

// 查看检测到的表格
selector.lists

// 当前表格索引
selector.currentIndex

// 表格数量
selector.lists.length
```

## ❌ 错误的做法

### ❌ 在 popup DevTools 中运行测试函数

```javascript
// ❌ 这会失败
await quickTest()  // Error: 当前环境不支持执行该脚本

// ❌ 这也会失败
await testSelectorNext()  // Error: 当前环境不支持执行该脚本
```

**为什么？** popup DevTools 无法直接访问目标网页的 JavaScript 对象。

## 🔍 环境对比

| 位置 | 能访问 selector？ | 适合做什么？ |
|------|-----------------|-------------|
| **目标网页 DevTools** | ✅ 能 | 直接测试 `selector.next()` |
| **Popup DevTools** | ❌ 不能 | 调试 popup 自身的代码 |
| **Popup UI 按钮** | ✅ 能（通过消息传递） | 正常使用功能 |
| **Background DevTools** | ✅ 能（通过 page.eval） | 高级调试 |

## 📊 调试日志

### 成功的日志（点击按钮）

```
[executeNextSelector] Executing selector.next()...
[executeNextSelector] Result: {
  selector: "._p5wwlyz16",
  tableId: 2,
  itemCount: 5,
  data: [...]
}
[executeNextSelector] Updating list container: ._p5wwlyz16
[executeNextSelector] Updating code config...
✅ 表格数据已更新
```

### 在网页控制台的输出

```javascript
selector.next()

// 输出:
{
  selector: "._p5wwlyz16",
  tableId: 2,
  data: [{...}, {...}, {...}],
  itemCount: 3,
  elementClasses: ["item", "card"]
}
```

## 🎯 最佳实践

### 日常使用
✅ **点击 popup 按钮** - 简单直接

### 开发调试
✅ **在目标网页 DevTools 测试** - 可以直接访问 selector

### 高级调试
✅ **在 background service worker 测试** - 使用 `page.eval()`

## 💡 记住这个原则

```
popup DevTools ≠ 目标网页环境

要测试 selector.next()，你需要在目标网页的环境中运行它！
```

## 🔗 相关文档

- [完整修复说明](./修复说明.md) - 详细的修复过程
- [详细测试指南](./POPUP_TEST_GUIDE.md) - 更多测试方法
- [调试指南](./DEBUG_GUIDE.md) - 调试技巧

---

## TL;DR （太长不看版）

**遇到错误？** 别担心，这是环境问题。

**解决方法：**
1. 点击 popup 的 "下一个表格" 按钮（最简单）
2. 或者在目标网页按 F12，在网页控制台运行 `selector.next()`

**记住：** popup DevTools ≠ 目标网页环境！

